/**
 * ============================================================================
 *  Digest_routing.gs — Digest a 2 coorti (v4.18.49 · 2026-05-15)
 * ----------------------------------------------------------------------------
 *  Sistema di invio digest segmentato:
 *
 *    COORTE A — "Generalisti"
 *      Destinatari: MailingList (foglio MailingList, Attivo=true)
 *                   AND NOT presenti nella coorte B
 *      Layout:      buildDigestHTML standard (5 ambiti, top news+bandi+podcast)
 *      Subject:     "Osservatorio Culturale · Digest del [data]"
 *
 *    COORTE B — "Lead caldi" (sessione attiva + identificazione esplicita)
 *      Destinatari: Sessioni_v1 (lead con email · NOT revoked)
 *                   UNION RichiestePrenotazione (email · stato_followup IN [nuovo,caldo,contattato])
 *                   dedup per email lowercase
 *      Layout 1:    Se ha Matrix completato → generateDigestForUser (Matrix_digest.js)
 *                   → digest personalizzato sulle 3 dimensioni-gap del museo
 *      Layout 2:    Se ha solo prenotazione con tematica → buildTematicDigest
 *                   → digest focalizzato sulla tematica di interesse
 *      Layout 3:    Fallback → buildDigestHTML standard
 *      Subject:     "Sinopia · [bandi tema X] per il tuo museo"
 *
 *  Hook CRM:
 *    Per ogni lead caldo riceve digest → crm_recordEvent(email, 'digest_sent', +1pt)
 *    Se lead supera 30pt → notifica Telegram via _tgSend_
 *
 *  Endpoint pubblici:
 *    sendDigestAuto2coorti()       → cron lunedì 07:00 (sostituisce sendDigestAuto)
 *    getDigestRecipientsByCohort() → admin preview: chi riceverà cosa
 *    previewDigestPerEmail(email)  → admin: anteprima digest HTML per email specifica
 *
 *  Note backward-compat:
 *    sendDigestAuto() (Codice.js) resta ATTIVO. La nuova logica può essere
 *    abilitata cambiando il trigger oppure chiamando sendDigestAuto2coorti
 *    manualmente. Setup trigger dedicato: setupDigestRoutingTrigger().
 * ============================================================================
 */

var DIGEST_LOG_COORTE = 'DigestLog'; // foglio esistente, riusa

/**
 * v4.18.67 — Determina il segmento digest basandosi sulla source della sessione.
 * Segmento 'matrix': riceve digest personalizzato su gap D1-D10 / tematica sondaggio.
 * Segmento 'ordinario': riceve digest generico settimanale.
 * @param {string} source - valore della colonna source in Sessioni_v1
 * @return {string} 'matrix' | 'ordinario'
 */
function _getDigestSegmento_(source) {
  if (!source) return 'ordinario';
  var s = String(source).toLowerCase();
  if (s === 'matrix' || s.indexOf('sondaggio_') === 0) return 'matrix';
  return 'ordinario';
}

/**
 * Costruisce le 2 coorti dei destinatari.
 *
 * @return {Object} { ok, generalisti: [{email,nome,token?}], leadCaldi: [{email,nome,source,responseId?,tematica?,leadScore?}] }
 */
function getDigestRecipientsByCohort() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var allEmails = {}; // email lowercase → cohort + meta
    var coorteB = {};   // email → {email, nome, source, responseId, tematica, leadScore}

    // === A) Lead da Sessioni_v1 (chi ha completato Matrix o prenotato consulenza) ===
    var shS = ss.getSheetByName('Sessioni_v1');
    if (shS && shS.getLastRow() > 1) {
      var sVals = shS.getDataRange().getValues();
      var sHead = sVals[0];
      var iEmail = sHead.indexOf('email'), iSrc = sHead.indexOf('source'),
          iMxC = sHead.indexOf('matrix_completato'), iRev = sHead.indexOf('revoked');
      for (var r = 1; r < sVals.length; r++) {
        var em = String(sVals[r][iEmail] || '').trim().toLowerCase();
        if (!em) continue;
        if (sVals[r][iRev] === true || String(sVals[r][iRev]).toLowerCase() === 'true') continue;
        if (coorteB[em]) continue; // già aggiunto da fonte precedente
        var _src = String(sVals[r][iSrc] || '');
        coorteB[em] = {
          email: em,
          nome: '',
          source: _src,
          segmento: _getDigestSegmento_(_src),
          matrixCompletato: sVals[r][iMxC] === true || String(sVals[r][iMxC]).toLowerCase() === 'true',
          responseId: null,
          tematica: null,
          leadScore: 0
        };
        allEmails[em] = 'B';
      }
    }

    // === B) Lead da RichiestePrenotazione (aggiunge tematica + arricchimento) ===
    var shP = ss.getSheetByName('RichiestePrenotazione');
    if (shP && shP.getLastRow() > 1) {
      var pVals = shP.getDataRange().getValues();
      var pHead = pVals[0];
      var iEmailP = pHead.indexOf('email'), iTemP = pHead.indexOf('tematica_codice'),
          iMusP = pHead.indexOf('museo_nome'), iStaP = pHead.indexOf('stato_followup');
      for (var rp = 1; rp < pVals.length; rp++) {
        var emP = String(pVals[rp][iEmailP] || '').trim().toLowerCase();
        if (!emP) continue;
        // Filtra solo stati attivi
        var stato = String(pVals[rp][iStaP] || 'nuovo').toLowerCase();
        if (stato === 'archiviato' || stato === 'rifiutato') continue;

        if (coorteB[emP]) {
          // Arricchisci: aggiungi tematica e museo se mancano
          if (!coorteB[emP].tematica) coorteB[emP].tematica = String(pVals[rp][iTemP] || '');
          if (!coorteB[emP].nome && pVals[rp][iMusP]) coorteB[emP].nome = String(pVals[rp][iMusP]);
        } else {
          coorteB[emP] = {
            email: emP,
            nome: String(pVals[rp][iMusP] || ''),
            source: 'prenotazione',
            segmento: _getDigestSegmento_('prenotazione'),
            matrixCompletato: false,
            responseId: null,
            tematica: String(pVals[rp][iTemP] || ''),
            leadScore: 0
          };
          allEmails[emP] = 'B';
        }
      }
    }

    // === C) Per ogni lead in coorte B, recupera responseId da ContactsMatrix ===
    var shC = ss.getSheetByName('ContactsMatrix');
    if (shC && shC.getLastRow() > 1) {
      var cVals = shC.getDataRange().getValues();
      var cHead = cVals[0];
      var iEmailC = cHead.indexOf('email'), iRespId = cHead.indexOf('response_id');
      for (var rc = cVals.length - 1; rc >= 1; rc--) {
        var emC = String(cVals[rc][iEmailC] || '').trim().toLowerCase();
        if (!emC || !coorteB[emC]) continue;
        if (coorteB[emC].responseId) continue; // già impostato (prendiamo il più recente)
        coorteB[emC].responseId = String(cVals[rc][iRespId] || '');
        coorteB[emC].matrixCompletato = true;
      }
    }

    // === D) Lead score CRM (se modulo presente) ===
    if (typeof crm_getLeadScore === 'function') {
      Object.keys(coorteB).forEach(function(em){
        try { var ls = crm_getLeadScore(em); coorteB[em].leadScore = (ls && ls.score) ? Number(ls.score) : 0; } catch(_){}
      });
    }

    // === E) Coorte A — MailingList ESCLUSI quelli già in B ===
    var generalisti = [];
    var shM = ss.getSheetByName(SH.MAILING || 'MailingList');
    if (shM && shM.getLastRow() > 1) {
      var mVals = shM.getDataRange().getValues();
      var mHead = mVals[0];
      var iEmM = mHead.indexOf('Email'), iNomeM = mHead.indexOf('Nome'),
          iAttM = mHead.indexOf('Attivo');
      for (var rm = 1; rm < mVals.length; rm++) {
        var emM = String(mVals[rm][iEmM] || '').trim().toLowerCase();
        if (!emM) continue;
        var attivo = mVals[rm][iAttM] === true || String(mVals[rm][iAttM]).toLowerCase() === 'true';
        if (!attivo) continue;
        if (allEmails[emM] === 'B') continue; // già in coorte B, skip per evitare doppio invio
        generalisti.push({
          email: emM,
          nome: String(mVals[rm][iNomeM] || '')
        });
        allEmails[emM] = 'A';
      }
    }

    // v4.24 — Arricchisci i generalisti con gli ambiti di interesse.
    // Fonte PRIMARIA: foglio ProfiliPro (interessi_dimensioni, scritto da setAmbitoInteresse/saveProfilo,
    // = ciò che il lettore sceglie nei chip dell'area). FALLBACK: ContactsMatrix.preferences_json.dimensioni.
    try {
      var dimsByEmail = {};
      // 1) ProfiliPro (sorgente dei chip dell'area)
      try {
        var ppName = (typeof PROFILO_PRO_SHEET !== 'undefined') ? PROFILO_PRO_SHEET : 'ProfiliPro';
        var shPP = ss.getSheetByName(ppName);
        if (shPP && shPP.getLastRow() > 1) {
          var ppVals = shPP.getDataRange().getValues();
          var ppH = ppVals[0];
          var iPpEm = ppH.indexOf('email'), iPpInt = ppH.indexOf('interessi_dimensioni');
          if (iPpEm >= 0 && iPpInt >= 0) {
            for (var rpp = 1; rpp < ppVals.length; rpp++) {
              var emPp = String(ppVals[rpp][iPpEm] || '').trim().toLowerCase();
              if (emPp && ppVals[rpp][iPpInt]) dimsByEmail[emPp] = ppVals[rpp][iPpInt];
            }
          }
        }
      } catch(ePP) { Logger.log('enrich ProfiliPro: ' + ePP.message); }
      // 2) ContactsMatrix (fallback, non sovrascrive ProfiliPro)
      try {
        var shCpref = ss.getSheetByName('ContactsMatrix');
        if (shCpref && shCpref.getLastRow() > 1) {
          var cpVals = shCpref.getDataRange().getValues();
          var cpH = cpVals[0];
          var iCpEm = cpH.indexOf('email'), iCpPref = cpH.indexOf('preferences_json');
          if (iCpEm >= 0 && iCpPref >= 0) {
            for (var rcp = 1; rcp < cpVals.length; rcp++) {
              var emCp = String(cpVals[rcp][iCpEm] || '').trim().toLowerCase();
              if (!emCp || dimsByEmail[emCp]) continue;
              var prefObj = {};
              try { prefObj = cpVals[rcp][iCpPref] ? JSON.parse(cpVals[rcp][iCpPref]) : {}; } catch(_){}
              if (prefObj && prefObj.dimensioni) dimsByEmail[emCp] = (Array.isArray(prefObj.dimensioni) ? prefObj.dimensioni.join(',') : prefObj.dimensioni);
            }
          }
        }
      } catch(eCM) { Logger.log('enrich ContactsMatrix: ' + eCM.message); }
      // 3) Applica agli ambiti del generalista
      generalisti.forEach(function(g){
        var dimsG = dimsByEmail[String(g.email).toLowerCase()];
        g.ambiti = (dimsG && typeof ambitiFromDims === 'function') ? ambitiFromDims(dimsG) : [];
      });
    } catch(ePref) { Logger.log('coorte A ambiti enrich: ' + ePref.message); }

    var leadCaldi = Object.keys(coorteB).map(function(k){ return coorteB[k]; });

    return {
      ok: true,
      generalisti: generalisti,
      leadCaldi: leadCaldi,
      counts: {
        generalisti: generalisti.length,
        leadCaldi: leadCaldi.length,
        leadConMatrix: leadCaldi.filter(function(l){ return l.matrixCompletato && l.responseId; }).length,
        leadConTematica: leadCaldi.filter(function(l){ return l.tematica && !l.matrixCompletato; }).length,
        hotLeads: leadCaldi.filter(function(l){ return (l.leadScore || 0) >= 30; }).length
      }
    };
  } catch(e) {
    Logger.log('getDigestRecipientsByCohort errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * v4.18.49 — Send digest auto a 2 coorti. Sostituisce semanticamente sendDigestAuto
 * per il flusso settimanale. Cron: lunedì 07:00.
 *
 * @param {Object} [opts] {dryRun: bool, onlyGeneralisti: bool, onlyLead: bool}
 * @return {Object} riepilogo esecuzione
 */
function sendDigestAuto2coorti(opts) {
  opts = opts || {};
  // Gating: se chiamata dal frontend (token presente) richiede admin; dai trigger (no token) procede.
  if (opts.token && typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(opts.token)) {
    return { ok:false, error:'forbidden' };
  }
  var t0 = new Date().getTime();
  try {
    // v4.24 — Lock anti-concurrent: impedisce invio simultaneo con sendAgentEmails
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      Logger.log('[sendDigestAuto2coorti] Altro invio in corso (lock attivo), riprova tra qualche minuto');
      return { ok: false, error: 'Altro invio email in corso. Riprova tra qualche minuto.' };
    }

    // 0. Quota check — evita errori a catena se quota quasi esaurita
    var remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota < 10) {
      Logger.log('[QUOTA] Solo ' + remainingQuota + ' email rimaste, skip invio digest');
      return { ok: false, error: 'Quota email insufficiente (' + remainingQuota + ' rimaste)' };
    }

    // 1. Carica items inclusi nel digest dal foglio Items
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH.ITEMS || 'Items');
    var rows = sh.getDataRange().getValues();
    var h = rows[0];
    var idCol = h.indexOf('ID'), digCol = h.indexOf('InclusiNelDigest'), archCol = h.indexOf('Archiviato');
    var itemIds = [];
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][idCol] && rows[i][digCol] && !rows[i][archCol]) itemIds.push(rows[i][idCol]);
    }
    // v4.20.x — Niente news incluse: NON saltare tutto. Coorte A e lead tematici/fallback
    // richiedono news (vengono saltati), ma i lead MATRIX hanno contenuti propri
    // (bandi/news/podcast per dimensione) e devono partire comunque.
    var hasItems = itemIds.length > 0;
    var items = hasItems ? getItemsByIds(itemIds) : [];
    // v4.27.48 — ANTI-RIPETIZIONE coorte 'generalista': via le news già uscite
    // (registro DigestInviati, condiviso con la newsletter draft admin).
    if (typeof ddFilterNotSent === 'function' && items.length) {
      var _preDD = items.length;
      items = ddFilterNotSent('generalista', 'news', items);
      if (items.length < _preDD) Logger.log('[DIGEST] dedup registro: ' + (_preDD - items.length) + ' item già usciti esclusi');
      hasItems = items.length > 0;
    }
    if (!hasItems) Logger.log('sendDigestAuto2coorti: nessuna news inclusa — invio solo digest Matrix personalizzati.');

    // 2. Recipients per coorte
    var rec = getDigestRecipientsByCohort();
    if (!rec.ok) return { ok:false, error: rec.error };

    var _coorteBEmailsSent = {}; // v4.25: traccia email inviate per escludere da agenti

    var report = {
      ok: true,
      dryRun: !!opts.dryRun,
      timestamp: new Date().toISOString(),
      items: items.length,
      generalisti_inviati: 0,
      generalisti_errori: 0,
      leadCaldi_inviati: 0,
      leadCaldi_errori: 0,
      leadCaldi_personalizzati_matrix: 0,
      leadCaldi_tematici: 0,
      leadCaldi_fallback: 0,
      hot_alerts: 0
    };

    var baseUrl = ScriptApp.getService().getUrl();
    var subjGen = 'Osservatorio Culturale · Digest del ' + Utilities.formatDate(new Date(), 'Europe/Rome', 'd MMM yyyy');

    // 3. INVIO COORTE A (generalisti) — solo se ci sono news da mandare
    if (!opts.onlyLead && hasItems) {
      rec.generalisti.forEach(function(dest){
        if (opts.dryRun) { report.generalisti_inviati++; return; }
        try {
          if (_digestWasRecentlySent_(dest.email)) { Logger.log('[DIGEST] Skip (dedup): ' + dest.email); return; }
          var token = null;
          try { token = _getOrCreateToken(dest.email); } catch(_) {}
          var readerUrl = token ? (baseUrl + '?reader=1&t=' + token) : null;
          if (token) try { _saveDigestForToken(token, itemIds, [], []); } catch(_){}
          var html = buildDigestHTML(items, { Nome: dest.nome, Email: dest.email }, readerUrl, dest.ambiti || []);
          GmailApp.sendEmail(dest.email, subjGen, 'Visualizza in HTML.', {
            htmlBody: html,
            name: 'Sinopia · Osservatorio Culturale',
            replyTo: 'sinopiaconsulting@gmail.com'
          });
          _digestMarkSent_(dest.email, 'coorti');
          report.generalisti_inviati++;
          Utilities.sleep(300);
        } catch(e) {
          Logger.log('Errore invio generalista ' + dest.email + ': ' + e.message);
          report.generalisti_errori++;
        }
      });
    }

    // 4. INVIO COORTE B (lead caldi)
    // v4.24 — Coorte B si invia il MARTEDÌ via sendDigestProfilatiMartedi().
    // Lunedì: solo Coorte A. Per forzare entrambi nello stesso giorno: opts.forceCoorteB = true.
    if (!opts.onlyGeneralisti && (opts.onlyLead || opts.forceCoorteB)) {
      rec.leadCaldi.forEach(function(lead){
        if (opts.dryRun) {
          if (lead.matrixCompletato && lead.responseId) report.leadCaldi_personalizzati_matrix++;
          else if (lead.tematica) report.leadCaldi_tematici++;
          else report.leadCaldi_fallback++;
          report.leadCaldi_inviati++;
          return;
        }
        try {
          if (_digestWasRecentlySent_(lead.email)) { Logger.log('[DIGEST] Skip (dedup): ' + lead.email); return; }
          var html, subject;
          if (lead.matrixCompletato && lead.responseId && typeof generateDigestForUser === 'function') {
            // Layout 1: digest personalizzato Matrix + contenuti agenti (v4.25: unificato)
            // v4.27.48 — markSent: l'invio è immediato qui sotto → registra i contenuti (coorte matrix)
            var res = generateDigestForUser(lead.email, lead.responseId, { save:false, markSent: !opts.dryRun, includeAgentContent: !!opts.includeAgentContent });
            if (res && res.ok && res.html) {
              html = res.html;
              subject = 'Sinopia · Il tuo digest personalizzato sui contenuti del tuo museo';
              report.leadCaldi_personalizzati_matrix++;
            }
          }
          // Senza Matrix e senza news non c'è nulla da inviare a questo lead
          if (!html && !hasItems) { Logger.log('[DIGEST] Skip lead senza news né Matrix: ' + lead.email); return; }
          if (!html && lead.tematica) {
            // Layout 2: digest tematico
            html = buildTematicDigest(items, lead.tematica, lead);
            subject = 'Sinopia · ' + items.length + ' contenuti su ' + (lead.tematica || 'tematica') + ' per ' + (lead.nome || 'il tuo museo');
            report.leadCaldi_tematici++;
          }
          if (!html) {
            // Layout 3: fallback standard
            html = buildDigestHTML(items, { Nome: lead.nome, Email: lead.email }, null);
            subject = subjGen;
            report.leadCaldi_fallback++;
          }
          GmailApp.sendEmail(lead.email, subject, 'Visualizza in HTML.', {
            htmlBody: html,
            name: 'Sinopia · Osservatorio Culturale',
            replyTo: 'sinopiaconsulting@gmail.com'
          });
          _digestMarkSent_(lead.email, 'coorti');
          _coorteBEmailsSent[lead.email] = true; // v4.25
          report.leadCaldi_inviati++;

          // CRM scoring +1pt digest_sent
          if (typeof crm_recordEvent === 'function') {
            try { crm_recordEvent(lead.email, 'digest_sent', 1, { cohort: 'B' }); } catch(_){}
          }

          // Telegram alert hot lead (score≥30 dopo questo evento)
          if ((lead.leadScore || 0) + 1 >= 30 && typeof _tgSend_ === 'function') {
            try {
              _tgSend_('🔥 *Lead caldo Sinopia* (score ' + ((lead.leadScore || 0) + 1) + ')\n'
                + '• Email: `' + lead.email + '`\n'
                + (lead.nome ? '• Museo: ' + lead.nome + '\n' : '')
                + (lead.tematica ? '• Tematica: ' + lead.tematica + '\n' : '')
                + 'Ha appena ricevuto digest. Pronto a essere ricontattato.');
              report.hot_alerts++;
            } catch(_){}
          }
          Utilities.sleep(300);
        } catch(e) {
          Logger.log('Errore invio lead ' + lead.email + ': ' + e.message);
          report.leadCaldi_errori++;
        }
      });
    }

    // 5. Reset flag InclusiNelDigest sui items inviati
    if (!opts.dryRun) {
      for (var ri = 1; ri < rows.length; ri++) {
        if (itemIds.indexOf(rows[ri][idCol]) >= 0) sh.getRange(ri+1, digCol+1).setValue(false);
      }
    }
    // v4.27.48 — registra nel registro DigestInviati le news uscite:
    // coorte 'generalista' se le ha ricevute la coorte A; coorte 'profilati'
    // se sono finite nei layout tematico/fallback dei lead.
    if (!opts.dryRun && typeof ddMarkSent === 'function' && items.length) {
      try {
        if (report.generalisti_inviati > 0) ddMarkSent('generalista', { news: items });
        if ((report.leadCaldi_tematici + report.leadCaldi_fallback) > 0) ddMarkSent('profilati', { news: items });
      } catch(eDD) { Logger.log('[DIGEST] registro non aggiornato: ' + eDD.message); }
    }

    // 6. Log esecuzione su DigestLog
    try {
      var shLog = ss.getSheetByName(SH.LOG || 'DigestLog');
      if (shLog) {
        var totale = report.generalisti_inviati + report.leadCaldi_inviati;
        var coorteDesc = 'A:' + report.generalisti_inviati + ' B:' + report.leadCaldi_inviati
          + ' (mx:' + report.leadCaldi_personalizzati_matrix + ' tm:' + report.leadCaldi_tematici + ' fb:' + report.leadCaldi_fallback + ')';
        shLog.appendRow([
          'D' + Date.now(),
          new Date(),
          items.length,
          coorteDesc,
          opts.dryRun ? 'dry-run' : 'inviato'
        ]);
      }
    } catch(eLog) { Logger.log('Log digest fallito: ' + eLog.message); }

    report.duration_ms = new Date().getTime() - t0;
    report._coorteBEmails = Object.keys(_coorteBEmailsSent); // v4.25: per esclusione agenti
    Logger.log('sendDigestAuto2coorti completato in ' + report.duration_ms + 'ms: ' + JSON.stringify(report));
    try { lock.releaseLock(); } catch(_){}
    return report;
  } catch(e) {
    Logger.log('sendDigestAuto2coorti FATAL: ' + e.message);
    try { lock.releaseLock(); } catch(_){}
    return { ok:false, error: e.message };
  }
}

/**
 * v4.18.49 — Costruisce un digest HTML focalizzato su una tematica specifica.
 * Filtra gli items che matchano keyword della tematica e li presenta con CTA personalizzata.
 *
 * @param {Array} items - tutti gli items disponibili (filtrabili)
 * @param {string} tematica - codice tematica (T1-T9 o ALTRO o PRE_BANDO)
 * @param {Object} lead - {email, nome (= museo), responseId?, tematica}
 * @return {string} HTML
 */
function buildTematicDigest(items, tematica, lead) {
  var lead2 = lead || {};
  var nomeMuseo = lead2.nome || 'il tuo museo';
  var tematicaUpper = String(tematica || '').toUpperCase();

  // Mappa tematica → keyword di matching
  var KW = {
    'T1': ['identità','identitaria','narrazione','heritage','branding','storia'],
    'T2': ['inclusione','accessibil','disabilit','etr','lis','caa','autismo'],
    'T3': ['mostra','collezione','allestimento','catalogo'],
    'T4': ['comunità','welfare','partecipa','giovani','quartiere'],
    'T5': ['digital','ai ','tecnolog','virtual','app','smart'],
    'T6': ['educazione','didattica','scuole','workshop'],
    'T7': ['turismo','dmc','borgo','heritage'],
    'T8': ['sostenibilità','dnsh','finanza','rendicontazione'],
    'T9': ['ricerca','accademia','università'],
    'PRE_BANDO': ['bando','avviso','pnrr','fesr','contributo','finanziamento']
  };
  var kws = KW[tematicaUpper] || [];
  function _norm(s){ return String(s||'').toLowerCase(); }
  var matched = items.filter(function(it){
    var hay = _norm(it.Titolo) + ' ' + _norm(it.SommarioAI) + ' ' + _norm(it.SommarioEditato);
    return kws.some(function(k){ return hay.indexOf(_norm(k)) >= 0; });
  });
  if (matched.length === 0) matched = items.slice(0, 8); // fallback: primi 8
  // v4.24 — Dedup fuzzy: rimuove contenuti con titoli troppo simili
  if (typeof _dedupFuzzyByTitle_ === 'function') {
    var _mapped = matched.map(function(it) { return { titolo: it.Titolo || it.titolo || '', _orig: it }; });
    _mapped = _dedupFuzzyByTitle_(_mapped);
    matched = _mapped.map(function(m) { return m._orig; });
  }

  var appUrl = '';
  try { appUrl = PropertiesService.getScriptProperties().getProperty('OC_APP_PUBLIC_URL') || ScriptApp.getService().getUrl() || ''; } catch(_){}

  var html = ''
    + '<!doctype html><html><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:0;background:#F1E6D6;font-family:Georgia,serif;color:#3A2818">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1E6D6;padding:32px 0">'
    + '<tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #D4BFA0;border-radius:12px;overflow:hidden">'
    // Header
    + '<tr><td style="background:#F1E6D6;border-bottom:1px solid #D4BFA0;padding:24px 28px">'
    + '<div style="font-family:Georgia,serif;font-style:italic;font-size:28px;font-weight:500;color:#8B3A1F">Sinopia</div>'
    + '<div style="font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#5C4332;margin-top:4px">Osservatorio Culturale</div>'
    + '</td></tr>'
    // Subject body
    + '<tr><td style="padding:28px">'
    + '<h1 style="font-family:Georgia,serif;font-weight:500;font-size:20px;line-height:1.3;color:#3A2818;margin:0 0 14px">'
    + matched.length + ' contenuti su <em style="color:#8B3A1F">' + _escapeHtml_(tematica || 'la tua tematica') + '</em> per ' + _escapeHtml_(nomeMuseo)
    + '</h1>'
    + '<p style="font-size:14px;line-height:1.6;color:#5C4332;margin:0 0 22px">Hai espresso interesse per <b>' + _escapeHtml_(tematica) + '</b>. Ecco i contenuti più recenti dell\'Osservatorio Sinopia su questa tematica.</p>';

  // v4.20 — Sezione bandi filtrati per interesse
  var kwRegex = kws.length > 0 ? new RegExp(kws.map(function(k){ return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'i') : null;
  var bandiHtml = '';
  try {
    var shBandi = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
    if (shBandi && shBandi.getLastRow() > 1 && kwRegex) {
      var bVals = shBandi.getDataRange().getValues();
      var bHead = bVals[0].map(function(h){ return String(h||'').trim(); });
      var bTit = _findCol_(bHead, ['Titolo','TITOLO']);
      var bEnte = _findCol_(bHead, ['Ente','ENTE']);
      var bScad = _findCol_(bHead, ['Scadenza','SCADENZA']);
      var bLink = _findCol_(bHead, ['UrlBando','URL_BANDO','Link','URL']);
      var bStato = _findCol_(bHead, ['StatoRecord','Stato']);
      var bSett = _findCol_(bHead, ['Settore','SETTORE','Ambito']);
      var oggi = new Date(); oggi.setHours(0,0,0,0);
      var bandiMatch = [];
      for (var bi = 1; bi < bVals.length && bandiMatch.length < 5; bi++) {
        if (bStato >= 0 && String(bVals[bi][bStato]||'').toLowerCase() === 'archiviato') continue;
        var scadB = bScad >= 0 ? bVals[bi][bScad] : null;
        var scadDate = (scadB instanceof Date) ? scadB : (scadB ? new Date(scadB) : null);
        if (scadDate && !isNaN(scadDate.getTime()) && scadDate < oggi) continue;
        var bText = String(bVals[bi][bTit]||'') + ' ' + String(bVals[bi][bSett>=0?bSett:0]||'');
        if (kwRegex.test(bText.toLowerCase())) {
          bandiMatch.push({
            titolo: bTit >= 0 ? String(bVals[bi][bTit]||'') : '',
            ente: bEnte >= 0 ? String(bVals[bi][bEnte]||'') : '',
            scadenza: scadDate ? Utilities.formatDate(scadDate, 'Europe/Rome', 'dd/MM/yyyy') : '',
            link: bLink >= 0 ? String(bVals[bi][bLink]||'') : ''
          });
        }
      }
      // v4.24 — Dedup fuzzy sui bandi tematici
      if (typeof _dedupFuzzyByTitle_ === 'function') {
        bandiMatch = _dedupFuzzyByTitle_(bandiMatch);
      }
      if (bandiMatch.length > 0) {
        bandiHtml = '<div style="margin-bottom:20px"><div style="font-size:16px;font-weight:700;color:#935851;margin-bottom:10px">Bandi per te</div>';
        bandiMatch.forEach(function(b) {
          bandiHtml += '<div style="padding:10px 0;border-bottom:1px solid #E5E5E7">'
            + '<div style="font-size:14px;font-weight:600"><a href="' + (b.link||'#') + '" style="color:#1A1815;text-decoration:none">' + b.titolo + '</a></div>'
            + '<div style="font-size:12px;color:#888;margin-top:3px">' + b.ente + (b.scadenza ? ' · Scad. ' + b.scadenza : '') + '</div>'
            + '</div>';
        });
        bandiHtml += '</div>';
      }
    }
  } catch(eBandi) { Logger.log('buildTematicDigest bandi: ' + (eBandi && eBandi.message)); }

  // Bandi section (before news)
  html += bandiHtml;

  // Lista items
  html += '<div>';
  matched.slice(0, 10).forEach(function(it){
    html += '<div style="border-top:1px solid #E5E1D8;padding:14px 0">'
      + '<div style="font-family:Georgia,serif;font-size:15.5px;font-weight:600;color:#3A2818;margin-bottom:4px">' + _escapeHtml_(it.Titolo || '') + '</div>'
      + (it.SommarioAI ? '<div style="font-size:13px;color:#5C4332;line-height:1.5;margin-bottom:6px">' + _escapeHtml_(String(it.SommarioAI).substring(0,220)) + '…</div>' : '')
      + (it.FonteURL ? '<a href="' + _escapeHtml_(it.FonteURL) + '" style="font-family:Arial,sans-serif;font-size:11.5px;color:#8B3A1F;text-decoration:none;font-weight:600">Leggi su ' + _escapeHtml_(it.Fonte || 'fonte') + ' →</a>' : '')
      + '</div>';
  });
  html += '</div>';

  // CTA finale
  html += '<table cellpadding="0" cellspacing="0" style="margin:24px auto 0"><tr><td style="background:#8B3A1F;border-radius:8px">'
    + '<a href="' + appUrl + '" style="display:inline-block;padding:12px 28px;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:600">Apri la tua area Sinopia →</a>'
    + '</td></tr></table>';

  // v4.24 — Footer: tipo digest esplicito + unsubscribe + modifica preferenze
  html += '<p style="font-size:11px;color:#8B5E2B;line-height:1.5;margin:24px 0 0;padding-top:14px;border-top:1px solid #E5E1D8;text-align:center;font-style:italic">'
    + 'Questa è una <strong>digest tematica</strong> su <em>' + _escapeHtml_(tematica) + '</em>.<br>'
    + 'Ricevi questo digest perché hai richiesto una consulenza su ' + _escapeHtml_(tematica) + '.</p>';

  // v4.20 — CTA Candidature Capitale della Cultura
  html += (typeof _digestCapitaleCta_ === 'function') ? _digestCapitaleCta_(appUrl || '') : '';

  // v4.18.54 — Footer unsubscribe link
  if (lead2.email && typeof _digestUnsubFooter_ === 'function') {
    html += _digestUnsubFooter_(lead2.email, { style: 'tematic' });
  }
  // v4.24 — Link modifica preferenze
  if (appUrl) {
    html += '<p style="font-size:10.5px;color:#8B5E2B;line-height:1.5;margin:8px 0 0;text-align:center">'
      + 'Vuoi ricevere contenuti diversi? <a href="' + appUrl + '#profilo-agenti" style="color:#8B3A1F;text-decoration:underline;">Modifica le tue preferenze</a>.'
      + '</p>';
  }

  html += '</td></tr>'
    + '<tr><td style="background:#F1E6D6;padding:14px 28px;border-top:1px solid #D4BFA0;text-align:center">'
    + '<div style="font-family:Arial,sans-serif;font-size:11px;color:#8B5E2B">Sinopia · Osservatorio Culturale<br>Il disegno preparatorio della cultura italiana</div>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';

  return html;
}

function _escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * v4.18.49 — Anteprima digest per una specifica email (utile per debug admin).
 * Ritorna l'HTML che verrebbe inviato senza inviarlo realmente.
 *
 * @param {string} email
 * @return {Object} { ok, coorte, layout, html, subject }
 */
function previewDigestPerEmail(email, token) {
  // v4.23 FIX — il gate richiedeva l'admin ma NON riceveva il token dal frontend:
  // su deploy "Chiunque" senza token nessuno e admin -> tornava sempre 'forbidden'.
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token || null)) {
    return { ok:false, error:'forbidden' };
  }
  try {
    email = String(email || '').trim().toLowerCase();
    if (!email) return { ok:false, error:'email_mancante' };

    var rec = getDigestRecipientsByCohort();
    if (!rec.ok) return rec;

    // Cerca email nelle coorti
    var inB = rec.leadCaldi.filter(function(l){ return l.email === email; })[0];
    var inA = rec.generalisti.filter(function(g){ return g.email === email; })[0];

    if (!inA && !inB) return { ok:false, error:'email_non_iscritta', detail:'L\'email non è in MailingList né in Sessioni_v1/RichiestePrenotazione' };

    // Carica items correnti
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH.ITEMS || 'Items');
    var rows = sh.getDataRange().getValues();
    var hh = rows[0];
    var idCol = hh.indexOf('ID'), digCol = hh.indexOf('InclusiNelDigest'), archCol = hh.indexOf('Archiviato');
    var itemIds = [];
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][idCol] && rows[i][digCol] && !rows[i][archCol]) itemIds.push(rows[i][idCol]);
    }
    var items = getItemsByIds(itemIds);

    if (inB) {
      var html, layout;
      if (inB.matrixCompletato && inB.responseId && typeof generateDigestForUser === 'function') {
        var r = generateDigestForUser(email, inB.responseId, { save:false, includeAgentContent:true });
        html = r && r.html || ''; layout = 'matrix-personalizzato';
      } else if (inB.tematica) {
        html = buildTematicDigest(items, inB.tematica, inB); layout = 'tematico';
      } else {
        html = buildDigestHTML(items, { Nome: inB.nome, Email: email }, null); layout = 'fallback-standard';
      }
      return { ok:true, coorte:'B', layout:layout, leadInfo: inB, html: html };
    }

    // Generalista
    var htmlG = buildDigestHTML(items, { Nome: inA.nome, Email: email }, null);
    return { ok:true, coorte:'A', layout:'generalista-standard', html: htmlG };
  } catch(e) {
    Logger.log('previewDigestPerEmail errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * v4.24 — Invio martedì: digest personalizzati per utenti profilati.
 *
 * Unifica in un unico invio:
 *   1. Coorte B di sendDigestAuto2coorti (Matrix personalizzati + tematici)
 *   2. sendAgentEmails (AG1 Bandi ora è martedì)
 *
 * Ogni utente profilato riceve UNA SOLA email il martedì:
 *   - Se ha Matrix completato → digest personalizzato sulle 3 dimensioni-gap
 *   - Se ha tematica → digest tematico
 *   - Se ha opt-in agente → email agente tematico
 *   - Se ha sia Matrix che opt-in agente → solo Matrix (più ricco)
 *
 * Trigger: martedì 07:30 (sostituisce sendAgentEmails il martedì)
 * Chiamata manuale: dal pannello admin "Invia profilati martedì"
 *
 * @param {Object} [opts] {dryRun, token}
 * @return {Object} report
 */
/**
 * v4.24 — Trigger DAILY che gestisce invii personalizzati + agenti.
 *
 * Comportamento per giorno:
 *   MARTEDÌ  → Coorte B (Matrix personalizzati + tematici) + email agenti del giorno
 *   ALTRI GG → Solo email agenti se è il loro giorno (AG3 mer, AG5 gio, ecc.)
 *
 * Sostituisce il vecchio trigger daily sendAgentEmails (liberando 1 slot trigger).
 *
 * @param {Object} [opts] {dryRun, token, forceCoorteB}
 */
function sendDigestProfilatiMartedi(opts) {
  opts = opts || {};
  if (opts.token && typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(opts.token)) {
    return { ok:false, error:'forbidden' };
  }
  var t0 = Date.now();
  var oggi = new Date();
  var isMartedi = oggi.getDay() === 2; // 2 = martedì
  var report = {
    ok: true,
    dryRun: !!opts.dryRun,
    giorno: ['dom','lun','mar','mer','gio','ven','sab'][oggi.getDay()],
    timestamp: oggi.toISOString(),
    coorteB_inviati: 0,
    coorteB_errori: 0,
    coorteB_matrix: 0,
    coorteB_tematici: 0,
    coorteB_fallback: 0,
    agenti_inviati: 0,
    agenti_errori: 0,
    hot_alerts: 0
  };

  try {
    // Lock anti-concurrent
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return { ok:false, error:'Altro invio in corso. Riprova tra qualche minuto.' };
    }

    // Quota check
    var quota = 0;
    try { quota = MailApp.getRemainingDailyQuota(); } catch(_){}
    if (quota < 5) {
      try { lock.releaseLock(); } catch(_){}
      return { ok:false, error:'Quota email insufficiente (' + quota + ')' };
    }

    // ── 1. COORTE B (personalizzati + contenuti agenti unificati) — SOLO MARTEDÌ (o forzato) ──
    var coorteBEmails = [];
    if (isMartedi || opts.forceCoorteB) {
      Logger.log('[DigestProfilati] Martedi: invio Coorte B con contenuti agenti unificati...');
      var coorteBResult = sendDigestAuto2coorti({
        dryRun: opts.dryRun,
        onlyLead: true,
        includeAgentContent: true,  // v4.25: agenti nel digest Matrix
        token: opts.token
      });
      if (coorteBResult) {
        report.coorteB_inviati = coorteBResult.leadCaldi_inviati || 0;
        report.coorteB_errori = coorteBResult.leadCaldi_errori || 0;
        report.coorteB_matrix = coorteBResult.leadCaldi_personalizzati_matrix || 0;
        report.coorteB_tematici = coorteBResult.leadCaldi_tematici || 0;
        report.coorteB_fallback = coorteBResult.leadCaldi_fallback || 0;
        report.hot_alerts = coorteBResult.hot_alerts || 0;
        coorteBEmails = coorteBResult._coorteBEmails || [];
      }
    } else {
      Logger.log('[DigestProfilati] Oggi non e martedi (' + report.giorno + '), skip Coorte B');
    }

    // ── 2. AGENTI — solo per utenti NON già serviti da Coorte B ──
    // Il martedì: i profilati hanno già ricevuto i contenuti agenti nel digest unificato.
    // Invio agenti solo a chi ha opt-in agente ma NON è in Coorte B.
    // Altri giorni: invio agenti normalmente (AG3 mer, AG5 gio, ecc.).
    Logger.log('[DigestProfilati] Check email agenti per ' + report.giorno + ' (esclusi ' + coorteBEmails.length + ' gia serviti)...');
    if (!opts.dryRun && typeof sendAgentEmails === 'function') {
      var agResults = sendAgentEmails();
      if (Array.isArray(agResults)) {
        agResults.forEach(function(r) {
          report.agenti_inviati += (r.inviati || 0);
          report.agenti_errori += (r.errori || 0);
        });
      }
    }

    // ── 3. SOCIAL DRAFT — generazione bozza social quotidiana (cooldown 44h interno) ──
    if (!opts.dryRun) {
      try {
        if (typeof generateNextSocialDraft === 'function') {
          generateNextSocialDraft();
          Logger.log('[DigestProfilati] Social draft: check completato');
        }
      } catch(eSoc) { Logger.log('[DigestProfilati] Social draft err: ' + (eSoc && eSoc.message)); }
    }

    report.duration_ms = Date.now() - t0;
    Logger.log('[DigestProfilati] Completato in ' + report.duration_ms + 'ms: ' + JSON.stringify(report));
    try { lock.releaseLock(); } catch(_){}
    return report;
  } catch(e) {
    Logger.log('[DigestProfilati] FATAL: ' + e.message);
    try { lock.releaseLock(); } catch(_){}
    return { ok:false, error: e.message };
  }
}

/**
 * v4.18.49 — Installa trigger digest a 2 coorti (lunedì 07:00).
 * Rimuove il trigger vecchio sendDigestAuto se presente.
 *
 * Da chiamare 1 volta dall'editor GAS o dal pannello admin.
 */
function setupDigestRoutingTrigger() {
  // v4.20 DEPRECATO — usare setupMasterTriggers() come unico setup trigger
  Logger.log('[DEPRECATO] setupDigestRoutingTrigger — usare setupMasterTriggers()');
  return { ok: false, deprecato: true, message: 'Usare setupMasterTriggers()' };
}

/**
 * v4.18.53 — Test one-shot: genera anteprima digest per admin e LO INVIA realmente.
 * Da lanciare dall'editor GAS quando vuoi vedere come arriva il digest in casella.
 *
 * Email destinatario letta da:
 *   1. ScriptProperties OC_ADMIN_EMAILS (primo valore della CSV)
 *   2. fallback Session.getActiveUser().getEmail()
 *
 * @return {Object} { ok, destinatario, coorte, layout, subject, sent }
 */
function testDigestInviaAdmin(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
  try {
    // Ricava email destinatario
    var emailTarget = '';
    try {
      var adminCsv = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || '';
      emailTarget = String(adminCsv.split(',')[0] || '').trim().toLowerCase();
    } catch(_){}
    if (!emailTarget) {
      try { emailTarget = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch(_){}
    }
    if (!emailTarget) return { ok:false, error:'email_admin_non_trovata' };

    // Genera anteprima HTML
    var preview = previewDigestPerEmail(emailTarget);
    if (!preview || !preview.ok) {
      return {
        ok:false,
        destinatario: emailTarget,
        error: (preview && preview.error) || 'preview_failed',
        detail: (preview && preview.detail) || ''
      };
    }

    var html = preview.html || '';
    if (!html || html.length < 50) {
      return { ok:false, destinatario: emailTarget, error:'html_vuoto', coorte: preview.coorte, layout: preview.layout };
    }

    // Subject in base al layout
    var subject;
    switch (preview.layout) {
      case 'matrix-personalizzato':
        subject = '[TEST] Sinopia · Digest personalizzato Matrix';
        break;
      case 'tematico':
        subject = '[TEST] Sinopia · Digest tematico per te';
        break;
      case 'generalista-standard':
        subject = '[TEST] Sinopia · Digest settimanale';
        break;
      default:
        subject = '[TEST] Sinopia · Digest (' + preview.layout + ')';
    }

    // Invio reale
    MailApp.sendEmail({
      to: emailTarget,
      subject: subject,
      htmlBody: html,
      name: 'Sinopia · Osservatorio Culturale'
    });

    Logger.log('testDigestInviaAdmin: digest inviato a ' + emailTarget + ' (coorte ' + preview.coorte + ', layout ' + preview.layout + ')');

    return {
      ok: true,
      destinatario: emailTarget,
      coorte: preview.coorte,
      layout: preview.layout,
      subject: subject,
      htmlSize: html.length,
      leadInfo: preview.leadInfo || null,
      sent: true
    };
  } catch(e) {
    Logger.log('testDigestInviaAdmin ERRORE: ' + (e && e.message));
    return { ok:false, error: (e && e.message) || String(e) };
  }
}

// ============================================================================
// v4.20 — KPI per dashboard Digest
// ============================================================================

/**
 * Ritorna conteggi rapidi per la KPI bar della pagina Digest.
 * Chiamata dal frontend in loadDigestPage().
 */
function getDigestDashboardKpi() {
  try {
    var cohorts = getDigestRecipientsByCohort();
    if (!cohorts || !cohorts.ok) return { generalisti: 0, leadCaldi: 0, leadConMatrix: 0 };
    return {
      generalisti: (cohorts.generalisti || []).length,
      leadCaldi: (cohorts.leadCaldi || []).length,
      leadConMatrix: cohorts.counts ? (cohorts.counts.leadConMatrix || 0) : 0
    };
  } catch(e) {
    Logger.log('getDigestDashboardKpi: ' + (e && e.message));
    return { generalisti: 0, leadCaldi: 0, leadConMatrix: 0 };
  }
}

/**
 * Ritorna la quota email giornaliera rimanente.
 */
function getEmailQuotaRemaining() {
  try { return MailApp.getRemainingDailyQuota(); }
  catch(e) { return -1; }
}

// ============================================================================
// v4.20 — Anti-duplicato cross-sistema digest
// Registro condiviso: foglio DigestSentLog (Email, Sistema, DataInvio)
// Ogni sistema scrive qui; ogni invio controlla se l'email è stata contattata
// negli ultimi OC_DIGEST_DEDUP_DAYS (default 5).
// ============================================================================

function _getDigestSentLogSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('DigestSentLog');
  if (!sh) {
    sh = ss.insertSheet('DigestSentLog');
    sh.appendRow(['Email','Sistema','DataInvio']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function _digestWasRecentlySent_(email, dedupDays) {
  if (!email) return false;
  dedupDays = dedupDays || 5;
  try {
    var prop = PropertiesService.getScriptProperties().getProperty('OC_DIGEST_DEDUP_DAYS');
    if (prop) dedupDays = parseInt(prop) || 5;
  } catch(_){}
  var sh = _getDigestSentLogSheet_();
  if (sh.getLastRow() < 2) return false;
  var data = sh.getDataRange().getValues();
  var cutoff = new Date(Date.now() - dedupDays * 86400000);
  var emailLower = String(email).toLowerCase().trim();
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][0] || '').toLowerCase().trim() === emailLower) {
      var d = data[r][2];
      if (d instanceof Date && d > cutoff) return true;
      if (typeof d === 'string') { var dt = new Date(d); if (!isNaN(dt) && dt > cutoff) return true; }
    }
  }
  return false;
}

function _digestMarkSent_(email, sistema) {
  if (!email) return;
  try {
    var sh = _getDigestSentLogSheet_();
    sh.appendRow([String(email).toLowerCase().trim(), sistema || 'unknown', new Date()]);
  } catch(e) { Logger.log('_digestMarkSent_ error: ' + (e && e.message)); }
}

// ============================================================================
// FINE Digest_routing.gs
// ============================================================================
