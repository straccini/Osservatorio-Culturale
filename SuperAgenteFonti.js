// ============================================================================
//  SuperAgenteFonti.js — v4.38 (2026-09-28)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//
//  OBIETTIVO (richiesta Silvano 27-28/09)
//  --------------------------------------
//  Un "super-agente" che controlla le fonti segnalate, ne VERIFICA i contenuti
//  con competenza e le AUTORIZZA in autonomia — ma solo quando è MOLTO SICURO;
//  le dubbie restano in coda per l'approvazione a un tap (scelta di Silvano).
//
//  Come funziona (riusa i motori esistenti, non li riscrive)
//  ---------------------------------------------------------
//  · SCOPERTA + COMPETENZA: usa SEAS (SistemaAgentiEsploratori) che esplora i
//    siti-seed, estrae i feed/link e li classifica con l'AI (score 0-100 +
//    ambito + tipo contenuto). È la "verifica competente dei contenuti".
//  · AUTORITÀ: usa FontiRegia.frTierDaFonte per il tier A/B/C (istituzionale /
//    regionale-fondazioni / locale-ignoto).
//  · GATE ALTA CONFIDENZA: auto-approva SOLO se score alto (>=85) E tier A/B E
//    ambito pertinente. Tutto il resto resta 'candidata' in coda di revisione.
//  · Autonomo dai trigger: l'approvazione avviene INTERNAMENTE (non via la
//    funzione frontend seasApproveCandidate, che è gated e fallirebbe da trigger).
//    Anche così, l'eventuale fonte aggiunta produce contenuti filtrati a valle
//    (gate anti-notizia + cultura), quindi il raggio d'azione resta contenuto.
//
//  Endpoint:
//    superAgenteFonti(opts)       — esegue (dai trigger o admin). opts.dryRun per prova.
//    superAgenteFontiSelfTest()   — verifica la logica del gate (nessuna rete).
//    setupSuperAgenteFontiTrigger() — trigger settimanale (mar ~05:40).
// ============================================================================

var SA_SOGLIA_SCORE = 85;                                   // score AI minimo per l'auto-approvazione
var SA_AMBITI_OK = { cultura:1, turismo:1, accessibilita:1, innovazione:1, governance:1 };

/**
 * Gate di ALTA CONFIDENZA (puro, senza rete): true se la candidata può essere
 * approvata in autonomia. Richiede tutte e tre le condizioni.
 * @param {number} score  0-100 (classificazione AI SEAS)
 * @param {string} tier   'A'|'B'|'C' (FontiRegia)
 * @param {string} ambito ambito SEAS
 * @return {boolean}
 */
function _saAltaConfidenza_(score, tier, ambito) {
  if (!(Number(score) >= SA_SOGLIA_SCORE)) return false;
  if (tier !== 'A' && tier !== 'B') return false;
  if (!SA_AMBITI_OK[String(ambito || '').toLowerCase()]) return false;
  return true;
}

/**
 * @private Approvazione INTERNA di una candidata SEAS (contesto di sistema, senza
 * il gate frontend). Replica la logica di seasApproveCandidate: aggiunge la fonte
 * attiva e segna la riga come approvata. Usata solo dall'orchestratore.
 */
function _saApprovaInterno_(cand) {
  try {
    if (typeof _seasGetOrCreateSheet_ !== 'function') return { ok:false, error:'SEAS assente' };
    var sh = _seasGetOrCreateSheet_();
    var vals = sh.getDataRange().getValues(), head = vals[0];
    var iId = head.indexOf('ID'), iUrl = head.indexOf('URL'), iTit = head.indexOf('Titolo'),
        iTipo = head.indexOf('TipoRisorsa'), iAmb = head.indexOf('Ambito'),
        iStato = head.indexOf('Stato'), iDec = head.indexOf('DataDecisione'), iFonte = head.indexOf('FonteIDCreata');
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iId]) !== String(cand.id)) continue;
      if (String(vals[r][iStato]) !== (typeof SEAS_STATI !== 'undefined' ? SEAS_STATI.CANDIDATA : 'candidata')) return { ok:false, error:'non candidata' };
      var ambitoVal = String(vals[r][iAmb] || 'cultura');
      var targetTipo = (ambitoVal === 'turismo' || ambitoVal === 'governance') ? 'bandi' : 'news';
      var fonteResult = null;
      if (typeof addFonteUnificataV2 === 'function') {
        fonteResult = addFonteUnificataV2({
          tipo: targetTipo, nome: String(vals[r][iTit] || vals[r][iUrl]), url: String(vals[r][iUrl]),
          tipoFonte: String(vals[r][iTipo] || 'HTML'), tag: 'settoriale', categoria: ambitoVal, priorita: 2
        });
      }
      sh.getRange(r + 1, iStato + 1).setValue(typeof SEAS_STATI !== 'undefined' ? SEAS_STATI.APPROVATA : 'approvata');
      sh.getRange(r + 1, iDec + 1).setValue(new Date());
      if (fonteResult && fonteResult.ok && fonteResult.id) sh.getRange(r + 1, iFonte + 1).setValue(fonteResult.id);
      return { ok: true, fonteId: (fonteResult && fonteResult.id) || null };
    }
    return { ok: false, error: 'candidata non trovata' };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Super-agente fonti.
 * @param {Object} [opts] {dryRun, esplora (default true), maxSeeds, token}
 * @return {Object} report
 */
function superAgenteFonti(opts) {
  opts = opts || {};
  // gate solo per chiamata dal frontend (token presente); dai trigger procede.
  if (opts.token && typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(opts.token)) {
    return { ok: false, error: 'forbidden' };
  }
  var dryRun = !!opts.dryRun;
  var report = { ok: true, dryRun: dryRun, scoperte: 0, valutate: 0, autoApprovate: 0, inRevisione: 0, dettagli: [] };

  // 1. SCOPERTA + classificazione competente (guardata)
  if (opts.esplora !== false) {
    try { if (typeof seasExplore === 'function') { var e = seasExplore({ maxSeeds: opts.maxSeeds || 10 }); report.scoperte = (e && e.linkScoperti) || 0; } } catch (_e) { Logger.log('[SuperAgenteFonti] explore: ' + _e.message); }
    try { if (typeof seasReclassify === 'function') seasReclassify(); } catch (_e) { Logger.log('[SuperAgenteFonti] reclassify: ' + _e.message); }
  }

  // 2. VALUTA le candidate: autorità (tier) × competenza (score) × pertinenza (ambito)
  var cg = (typeof seasGetCandidates === 'function') ? seasGetCandidates({ stato: (typeof SEAS_STATI !== 'undefined' ? SEAS_STATI.CANDIDATA : 'candidata'), minScore: 0, limit: 300 }) : { candidati: [] };
  var cands = (cg && cg.candidati) || [];
  cands.forEach(function (c) {
    report.valutate++;
    var tier = (typeof frTierDaFonte === 'function') ? frTierDaFonte(c.titolo || c.dominio, c.url) : 'C';
    if (_saAltaConfidenza_(c.score, tier, c.ambito)) {
      if (!dryRun) {
        var ap = _saApprovaInterno_(c);
        if (ap && ap.ok) report.autoApprovate++;
        else report.dettagli.push({ url: c.url, esito: 'approvazione-fallita', err: ap && ap.error });
      } else report.autoApprovate++;
      report.dettagli.push({ url: c.url, tier: tier, score: c.score, ambito: c.ambito, esito: dryRun ? 'auto(dry)' : 'auto-approvata' });
    } else {
      report.inRevisione++;
    }
  });

  // 3. ALERT admin (solo se qualcosa è successo)
  if (!dryRun && (report.autoApprovate > 0 || report.inRevisione > 0)) {
    var msg = '🛰️ <b>Super-agente fonti</b>\n'
      + '• Auto-approvate (alta confidenza): ' + report.autoApprovate + '\n'
      + '• In coda di revisione: ' + report.inRevisione
      + (report.inRevisione > 0 ? '\nRivedile dal pannello Fonti (approva/rifiuta con un tap).' : '');
    try { if (typeof _tgSend_ === 'function') _tgSend_(msg); else if (typeof sendTelegram === 'function') sendTelegram(msg.replace(/<\/?b>/g, '*')); } catch (_) {}
  }
  Logger.log('[SuperAgenteFonti] ' + JSON.stringify({ scoperte: report.scoperte, auto: report.autoApprovate, revisione: report.inRevisione }));
  return report;
}

/** Verifica locale della logica del gate (nessuna rete, nessuna scrittura). */
function superAgenteFontiSelfTest() {
  var casi = [
    { n: 'A + score alto + cultura', score: 92, tier: 'A', ambito: 'cultura', atteso: true },
    { n: 'B + score alto + governance', score: 86, tier: 'B', ambito: 'governance', atteso: true },
    { n: 'C (locale/ignoto) anche con score alto', score: 95, tier: 'C', ambito: 'cultura', atteso: false },
    { n: 'A ma score sotto soglia', score: 70, tier: 'A', ambito: 'cultura', atteso: false },
    { n: 'A + score alto ma non pertinente', score: 90, tier: 'A', ambito: 'non_pertinente', atteso: false },
    { n: 'B + score alto + turismo', score: 88, tier: 'B', ambito: 'turismo', atteso: true }
  ];
  var pass = 0, fail = 0, out = [];
  casi.forEach(function (c) {
    var r = _saAltaConfidenza_(c.score, c.tier, c.ambito);
    var ok = (r === c.atteso); ok ? pass++ : fail++;
    out.push({ caso: c.n, esito: ok ? 'PASS' : 'FAIL', auto: r });
    Logger.log('[SA selftest] ' + (ok ? 'PASS' : 'FAIL') + ' — ' + c.n + ' → auto=' + r);
  });
  Logger.log('[SA selftest] ' + pass + '/' + casi.length + ' PASS');
  return { ok: fail === 0, pass: pass, fail: fail, dettagli: out };
}

/** Trigger settimanale del super-agente (martedì ~05:40). Idempotente. */
function setupSuperAgenteFontiTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'superAgenteFonti') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('superAgenteFonti').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(5).nearMinute(40).create();
  Logger.log('[SuperAgenteFonti] trigger settimanale installato (mar ~05:40)');
  return { ok: true, creato: 'superAgenteFonti mar@05:40' };
}
