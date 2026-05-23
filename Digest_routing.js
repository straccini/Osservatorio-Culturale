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
  var t0 = new Date().getTime();
  try {
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
    if (!itemIds.length) {
      Logger.log('sendDigestAuto2coorti: nessun item incluso nel digest. Skip invio.');
      return { ok:true, skipped:true, reason:'no_items' };
    }
    var items = getItemsByIds(itemIds);

    // 2. Recipients per coorte
    var rec = getDigestRecipientsByCohort();
    if (!rec.ok) return { ok:false, error: rec.error };

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

    // 3. INVIO COORTE A (generalisti)
    if (!opts.onlyLead) {
      rec.generalisti.forEach(function(dest){
        if (opts.dryRun) { report.generalisti_inviati++; return; }
        try {
          var token = null;
          try { token = _getOrCreateToken(dest.email); } catch(_) {}
          var readerUrl = token ? (baseUrl + '?reader=1&t=' + token) : null;
          if (token) try { _saveDigestForToken(token, itemIds, [], []); } catch(_){}
          var html = buildDigestHTML(items, { Nome: dest.nome, Email: dest.email }, readerUrl);
          GmailApp.sendEmail(dest.email, subjGen, 'Visualizza in HTML.', {
            htmlBody: html,
            name: 'Sinopia · Osservatorio Culturale',
            replyTo: Session.getEffectiveUser().getEmail()
          });
          report.generalisti_inviati++;
          Utilities.sleep(300);
        } catch(e) {
          Logger.log('Errore invio generalista ' + dest.email + ': ' + e.message);
          report.generalisti_errori++;
        }
      });
    }

    // 4. INVIO COORTE B (lead caldi)
    if (!opts.onlyGeneralisti) {
      rec.leadCaldi.forEach(function(lead){
        if (opts.dryRun) {
          if (lead.matrixCompletato && lead.responseId) report.leadCaldi_personalizzati_matrix++;
          else if (lead.tematica) report.leadCaldi_tematici++;
          else report.leadCaldi_fallback++;
          report.leadCaldi_inviati++;
          return;
        }
        try {
          var html, subject;
          if (lead.matrixCompletato && lead.responseId && typeof generateDigestForUser === 'function') {
            // Layout 1: digest personalizzato Matrix
            var res = generateDigestForUser(lead.email, lead.responseId);
            if (res && res.ok && res.html) {
              html = res.html;
              subject = 'Sinopia · Il tuo digest personalizzato sui contenuti del tuo museo';
              report.leadCaldi_personalizzati_matrix++;
            }
          }
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
            replyTo: Session.getEffectiveUser().getEmail()
          });
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
    Logger.log('sendDigestAuto2coorti completato in ' + report.duration_ms + 'ms: ' + JSON.stringify(report));
    return report;
  } catch(e) {
    Logger.log('sendDigestAuto2coorti FATAL: ' + e.message);
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

  html += '<p style="font-size:11px;color:#8B5E2B;line-height:1.5;margin:24px 0 0;padding-top:14px;border-top:1px solid #E5E1D8;text-align:center;font-style:italic">Ricevi questo digest perché hai richiesto una consulenza su ' + _escapeHtml_(tematica) + '.</p>';

  // v4.18.54 — Footer unsubscribe link
  if (lead2.email && typeof _digestUnsubFooter_ === 'function') {
    html += _digestUnsubFooter_(lead2.email, { style: 'tematic' });
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
function previewDigestPerEmail(email) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
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
        var r = generateDigestForUser(email, inB.responseId);
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
 * v4.18.49 — Installa trigger digest a 2 coorti (lunedì 07:00).
 * Rimuove il trigger vecchio sendDigestAuto se presente.
 *
 * Da chiamare 1 volta dall'editor GAS o dal pannello admin.
 */
function setupDigestRoutingTrigger() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var rimossi = 0;
    triggers.forEach(function(t) {
      var fn = t.getHandlerFunction();
      if (fn === 'sendDigestAuto' || fn === 'sendDigestAuto2coorti' || fn === 'lunediMattina') {
        ScriptApp.deleteTrigger(t); rimossi++;
      }
    });
    ScriptApp.newTrigger('sendDigestAuto2coorti')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(7).nearMinute(0)
      .create();
    Logger.log('Trigger sendDigestAuto2coorti installato: lunedì 07:00. (rimossi ' + rimossi + ' precedenti)');
    return { ok:true, schedule:'lunedì 07:00', rimossi_precedenti: rimossi };
  } catch(e) { return { ok:false, error: e.message }; }
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
function testDigestInviaAdmin() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
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
// FINE Digest_routing.gs
// ============================================================================
