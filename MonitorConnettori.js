// ============================================================================
//  MonitorConnettori.js — v4.38 (2026-09-28)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//
//  OBIETTIVO (richiesta Silvano 28/09)
//  -----------------------------------
//  Sorveglia la SALUTE dei connettori API strutturati dei bandi (ANAC/BDNCP,
//  ANAC OCDS, TED, SEDIA UE, Lombardia, OpenCoesione, CKAN, Consip/MEPA). A
//  differenza di agenteFontiMute (che controlla le fonti RSS del foglio
//  FontiBandi_v5), qui controlliamo i PARSER-CODE: quelli non hanno una riga
//  nel foglio fonti e nessuno si accorge se un endpoint muore in silenzio.
//
//  Come funziona
//  -------------
//  · Esegue ogni connettore in DRY-RUN (nessuna scrittura): usa la gestione
//    errori già presente in ciascun parser (HTTP≠200 → ok:false).
//  · Registra lo stato nel foglio 'ConnettoriSalute' e conta i fallimenti
//    consecutivi.
//  · Avvisa su Telegram SOLO quando un connettore CAMBIA stato: appena va giù
//    (o resta a 0 risultati per più verifiche di fila) e quando torna su.
//  · Da lanciare a mano — monitorConnettoriBandi() — o via trigger settimanale
//    (setupMonitorConnettoriTrigger()).
// ============================================================================

var MC_SHEET = 'ConnettoriSalute';
var MC_EMPTY_SOGLIA = 3;   // avvisa "sempre vuoto" dopo N verifiche consecutive a 0

/**
 * Elenco dei connettori da sorvegliare. `run` è una funzione che esegue il
 * parser in dry-run e ritorna il suo report {ok, nuovi}. Solo i parser presenti
 * (typeof function) vengono eseguiti.
 */
function _mcConnettori_() {
  return [
    { id: 'BDNCP',       nome: 'ANAC — BDNCP Pubblicità Legale (sotto-soglia)', fn: 'fasParserBdncpCultura', run: function () { return fasParserBdncpCultura({ dryRun: true, giorni: 7, sizePerKw: 5 }); } },
    { id: 'ANAC_OCDS',   nome: 'ANAC — OCDS contratti',                          fn: 'fasParserAnac',         run: function () { return fasParserAnac({ dryRun: true, maxBandi: 20 }); } },
    { id: 'TED',         nome: 'TED — appalti UE (sopra-soglia)',                fn: 'fasParserTedApiPost',   run: function () { return fasParserTedApiPost({ dryRun: true }); } },
    { id: 'SEDIA_EU',    nome: 'EU Funding & Tenders (SEDIA)',                   fn: 'fasParserSediaEU',      run: function () { return fasParserSediaEU({ dryRun: true }); } },
    { id: 'LOMBARDIA',   nome: 'Regione Lombardia — anagrafica bandi',           fn: 'fasParserLombardia',    run: function () { return fasParserLombardia({ dryRun: true }); } },
    { id: 'OPENCOESIONE',nome: 'OpenCoesione — progetti cultura',                fn: 'fasParserOpenCoesione', run: function () { return fasParserOpenCoesione({ dryRun: true }); } },
    { id: 'CKAN',        nome: 'CKAN regionali/nazionali',                       fn: 'fasParserCkanRegionale',run: function () { return fasParserCkanRegionale({ dryRun: true }); } },
    { id: 'CONSIP_MEPA', nome: 'Consip / MEPA (open data)',                      fn: 'fasParserConsipMepa',   run: function () { return fasParserConsipMepa({ dryRun: true }); } }
  ];
}

function _mcSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MC_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MC_SHEET);
    sh.appendRow(['id', 'nome', 'ultimo_esito', 'nuovi', 'fail_consecutivi', 'vuoto_consecutivi', 'ultima_verifica', 'ultimo_errore']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Esegue la verifica di salute su tutti i connettori.
 * @param {Object} [opts] {token, silenzioso:bool (non manda Telegram)}
 * @return {Object} report
 */
function monitorConnettoriBandi(opts) {
  opts = opts || {};
  if (opts.token && typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(opts.token)) {
    return { ok: false, error: 'forbidden' };
  }
  var sh = _mcSheet_();
  var vals = sh.getDataRange().getValues();
  var head = vals[0];
  var idx = {}; head.forEach(function (h, i) { idx[h] = i; });
  var statoPrec = {};
  for (var r = 1; r < vals.length; r++) statoPrec[vals[r][idx.id]] = { row: r + 1, esito: vals[r][idx.ultimo_esito], failCons: Number(vals[r][idx.fail_consecutivi] || 0), vuotoCons: Number(vals[r][idx.vuoto_consecutivi] || 0) };

  var connettori = _mcConnettori_();
  var report = { ok: true, timestamp: new Date().toISOString(), verificati: 0, giu: [], vuoti: [], tornatiSu: [], dettagli: [] };
  var alert = [];

  connettori.forEach(function (c) {
    var esito = 'assente', nuovi = 0, err = '';
    // Il parser esiste? (funzione globale GAS) — altrimenti si salta.
    var presente = false;
    try { presente = (eval('typeof ' + c.fn) === 'function'); } catch (_) { presente = false; }
    if (!presente) {
      report.dettagli.push({ id: c.id, esito: 'assente' });
      return;
    }
    report.verificati++;
    try {
      var res = c.run();
      if (res && res.ok) { esito = 'ok'; nuovi = res.nuovi || 0; }
      else { esito = 'giu'; err = (res && (res.error || res.errore)) || 'ok:false'; }
    } catch (e) { esito = 'giu'; err = e.message; }

    var prev = statoPrec[c.id] || { esito: '', failCons: 0, vuotoCons: 0 };
    var failCons = (esito === 'giu') ? prev.failCons + 1 : 0;
    var vuotoCons = (esito === 'ok' && nuovi === 0) ? prev.vuotoCons + 1 : 0;

    // Transizioni → alert
    if (esito === 'giu' && prev.esito !== 'giu') { report.giu.push(c.id); alert.push('🔴 GIÙ: ' + c.nome + (err ? ' — ' + err : '')); }
    else if (esito === 'ok' && prev.esito === 'giu') { report.tornatiSu.push(c.id); alert.push('🟢 TORNATO SU: ' + c.nome); }
    if (esito === 'ok' && vuotoCons === MC_EMPTY_SOGLIA) { report.vuoti.push(c.id); alert.push('🟠 SEMPRE VUOTO (' + MC_EMPTY_SOGLIA + ' verifiche): ' + c.nome + ' — controllare filtro/endpoint'); }

    var rowVals = [c.id, c.nome, esito, nuovi, failCons, vuotoCons, new Date(), err];
    if (statoPrec[c.id]) sh.getRange(statoPrec[c.id].row, 1, 1, rowVals.length).setValues([rowVals]);
    else sh.appendRow(rowVals);
    report.dettagli.push({ id: c.id, esito: esito, nuovi: nuovi, failCons: failCons });
  });

  if (alert.length && !opts.silenzioso && typeof sendTelegram === 'function') {
    try { sendTelegram('🩺 *Salute connettori bandi*\n' + alert.join('\n')); } catch (_) {}
  }
  Logger.log('[MonitorConnettori] ' + JSON.stringify({ verificati: report.verificati, giu: report.giu, vuoti: report.vuoti, tornatiSu: report.tornatiSu }));
  return report;
}

/** Installa un trigger settimanale (lunedì ~06:20) per il monitor. Idempotente. */
function setupMonitorConnettoriTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'monitorConnettoriBandi') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('monitorConnettoriBandi').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).nearMinute(20).create();
  Logger.log('[MonitorConnettori] trigger settimanale installato (lun ~06:20)');
  return { ok: true, creato: 'monitorConnettoriBandi lun@06:20' };
}
