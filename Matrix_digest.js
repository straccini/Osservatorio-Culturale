/**
 * ============================================================================
 *  Matrix_digest.gs — Digest segmentato per compilatori MuseMu Matrix
 * ============================================================================
 *  Sprint 1.3 D2.3 (2026-05-01)
 *  Autore: Silvano Straccini / Duemilamusei
 *
 *  SCOPO
 *  -----
 *  Genera per ogni compilatore Matrix un digest email PERSONALIZZATO sui suoi
 *  top 3 gap (dimensioni con score piu basso). Il contenuto e' filtrato
 *  usando la colonna MatrixDim (popolata da Matrix_tagger.gs) sui fogli
 *  Items/Bandi/Podcast.
 *
 *  ARCHITETTURA
 *  ------------
 *  1. ContactsMatrix (foglio gia esistente da Matrix_v1.gs):
 *     response_id | email | preferences_json | consent_timestamp | ...
 *  2. ResponsesMatrix (foglio gia esistente):
 *     contiene profile + scoring per ogni responseId
 *  3. DigestQueue (NUOVO foglio creato da questo modulo):
 *     ID | Email | ResponseId | GeneratedAt | Subject | HtmlBlob | Status | SentAt
 *  4. generateDigestForUser(email, responseId)
 *     -> recupera report Matrix
 *     -> estrae top 3 dimensioni con score < 60
 *     -> per ogni dim: query contenuti taggati MatrixDim contains Dx
 *     -> compone HTML personalizzato
 *     -> salva in DigestQueue come 'draft'
 *  5. sendQueuedDigest(queueId)
 *     -> recupera blob HTML + email
 *     -> invia via MailApp
 *     -> marca 'sent' con timestamp
 *
 *  WORKFLOW OPERATIVO
 *  ------------------
 *  generateDigestQueueAll()        — bulk: per ogni email opt-in genera bozza
 *  adminGetDigestQueue()           — ritorna lista bozze pendenti
 *  sendAllPendingDigest()          — invia tutto in DigestQueue con status='draft'
 *
 * ============================================================================
 */

var OC_DIGEST_QUEUE_SHEET = 'DigestQueue';
var OC_DIGEST_QUEUE_HEADERS = [
  'ID','Email','ResponseId','GeneratedAt','Subject','HtmlBlob','Status','SentAt','Note'
];

// ============================================================================
// API PUBBLICA
// ============================================================================

/**
 * Genera la bozza digest personalizzata per un singolo compilatore.
 * Salva in DigestQueue come 'draft' e ritorna l'oggetto bozza.
 *
 * @param {string} email
 * @param {string} responseId
 * @return {Object} { ok, queueId, subject, htmlPreview, top3Dims } | { error }
 */
function generateDigestForUser(email, responseId) {
  try {
    if (!email || !responseId) return { error:'email e responseId obbligatori' };
    if (typeof getMatrixReport !== 'function') return { error:'getMatrixReport non disponibile (manca Matrix_v1.gs)' };

    var report = getMatrixReport(responseId);
    if (!report || !report.ok) return { error:'report Matrix non trovato per responseId ' + responseId };

    var top3 = (report.top3Opportunities || []).slice(0, 3);
    if (!top3.length) return { error:'nessuna opportunita prioritaria nel report' };

    // Estrai dimensioni (es. 'D7','D9','D10')
    var topDims = top3.map(function(o){ return o.dimensionCode; });

    // Per ogni dimensione, raccogli contenuti taggati MatrixDim contains Dx
    var bandiByDim   = {};
    var newsByDim    = {};
    var podcastByDim = {};
    topDims.forEach(function(dim) {
      bandiByDim[dim]   = _queryContenutiPerDim_('bandi',   dim, 4);
      newsByDim[dim]    = _queryContenutiPerDim_('items',   dim, 3);
      podcastByDim[dim] = _queryContenutiPerDim_('podcast', dim, 2);
    });

    // Compone HTML
    var museumName = report.museumName || 'la tua struttura';
    var dataStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var subject = '[Personalizzato] Aggiornamenti per ' + museumName + ' — ' + dataStr;
    var html = _buildDigestSegmentatoHtml_(report, top3, bandiByDim, newsByDim, podcastByDim);

    // Salva in DigestQueue
    var queueId = _saveDigestQueueRow_({
      Email: email,
      ResponseId: responseId,
      GeneratedAt: new Date().toISOString(),
      Subject: subject,
      HtmlBlob: html,
      Status: 'draft',
      SentAt: '',
      Note: 'top3=' + topDims.join(',') + ' · museo=' + museumName
    });

    return {
      ok: true,
      queueId: queueId,
      subject: subject,
      htmlLength: html.length,
      top3Dims: topDims,
      contentCounts: {
        bandi: Object.keys(bandiByDim).reduce(function(s,k){ return s+bandiByDim[k].length;},0),
        news: Object.keys(newsByDim).reduce(function(s,k){ return s+newsByDim[k].length;},0),
        podcast: Object.keys(podcastByDim).reduce(function(s,k){ return s+podcastByDim[k].length;},0)
      }
    };
  } catch(e) {
    Logger.log('generateDigestForUser errore: ' + e.message + '\n' + e.stack);
    return { error: e.message };
  }
}

/**
 * Bulk: per ogni email opt-in attiva in ContactsMatrix, genera bozza personalizzata.
 * Idempotente: salta gli utenti che hanno gia una bozza 'draft' in DigestQueue
 * generata negli ultimi 6 giorni (per evitare doppioni weekly).
 *
 * @param {Object} [opts]
 *   opts.dryRun (bool, default false) — se true non scrive in DigestQueue
 * @return { totale, generati, skipped, errori, dettagli[] }
 */
function generateDigestQueueAll(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  Logger.log('=== GENERA DIGEST QUEUE (bulk personalizzati) dryRun=' + dryRun + ' ===');

  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
  if (!ss) return { error:'spreadsheet null' };
  var contactsSh = ss.getSheetByName('ContactsMatrix');
  if (!contactsSh || contactsSh.getLastRow() < 2) return { totale:0, generati:0, note:'ContactsMatrix vuoto o assente' };

  var headers = contactsSh.getRange(1,1,1,contactsSh.getLastColumn()).getValues()[0];
  var iEmail = headers.indexOf('email');
  var iRid   = headers.indexOf('response_id');
  if (iEmail < 0 || iRid < 0) return { error:'colonne email/response_id mancanti in ContactsMatrix' };

  var rows = contactsSh.getRange(2, 1, contactsSh.getLastRow()-1, headers.length).getValues();
  var existingDrafts = _getRecentDraftsByEmail_(6);

  // Sprint 1.4 (2026-05-01): filtro tramite OptInMatrix in Utenti
  var optInMap = {};
  try {
    if (typeof getUtentiPerOptIn === 'function') {
      var utentiOptIn = getUtentiPerOptIn('matrix');
      utentiOptIn.forEach(function(u){ optInMap[u.email] = true; });
      Logger.log('Utenti con OptInMatrix=true: ' + utentiOptIn.length);
    }
  } catch(e) { Logger.log('OptInMap warning: ' + e.message); }
  var hasUtentiTable = Object.keys(optInMap).length > 0;

  var totale = 0, generati = 0, skipped = 0, errori = 0, optedOut = 0;
  var dettagli = [];

  for (var i = 0; i < rows.length; i++) {
    var email = String(rows[i][iEmail] || '').trim().toLowerCase();
    var rid   = String(rows[i][iRid] || '').trim();
    if (!email || !rid) continue;
    totale++;
    if (hasUtentiTable && !optInMap[email]) {
      optedOut++;
      dettagli.push({email:email, status:'opted_out (no OptInMatrix in Utenti)'});
      continue;
    }
    if (existingDrafts[email]) { skipped++; dettagli.push({email:email,status:'skipped (gia in queue recente)'}); continue; }
    if (dryRun) { dettagli.push({email:email,status:'dryRun ok'}); continue; }
    try {
      var res = generateDigestForUser(email, rid);
      if (res && res.ok) { generati++; dettagli.push({email:email,status:'generato',queueId:res.queueId,top3:res.top3Dims}); }
      else { errori++; dettagli.push({email:email,status:'errore',err:res && res.error || 'sconosciuto'}); }
    } catch(e) {
      errori++; dettagli.push({email:email,status:'eccezione',err:e.message});
    }
  }

  Logger.log('=== Bulk completato: ' + generati + ' generati, ' + skipped + ' skipped, ' + optedOut + ' opt-out, ' + errori + ' errori (su ' + totale + ' totali) ===');
  return { totale: totale, generati: generati, skipped: skipped, optedOut: optedOut, errori: errori, dettagli: dettagli };
}

/**
 * Invia il digest singolo dalla queue.
 * @param {string} queueId
 * @return {Object} { ok, sentTo, subject } | { error }
 */
function sendQueuedDigest(queueId) {
  try {
    var sh = _getDigestQueueSheet_();
    var rows = sh.getDataRange().getValues();
    var headers = rows[0];
    var idx = function(name){ return headers.indexOf(name); };
    var iId = idx('ID'), iEmail = idx('Email'), iSubj = idx('Subject'),
        iHtml = idx('HtmlBlob'), iStatus = idx('Status'), iSent = idx('SentAt');
    if (iId < 0) return { error:'header DigestQueue corrotto' };

    for (var r = 1; r < rows.length; r++) {
      if (String(rows[r][iId]) !== String(queueId)) continue;
      var email = String(rows[r][iEmail] || '').trim();
      var subj  = String(rows[r][iSubj] || '');
      var html  = String(rows[r][iHtml] || '');
      var stato = String(rows[r][iStatus] || '');
      if (stato === 'sent') return { error:'gia inviato il ' + rows[r][iSent] };
      if (!email || !html)  return { error:'email o html mancanti nella riga ' + queueId };

      MailApp.sendEmail({
        to:       email,
        subject:  subj,
        htmlBody: html,
        name:     'Osservatorio Culturale · MuseMu Matrix',
        replyTo:  's.straccini@gmail.com'
      });
      var nowIso = new Date().toISOString();
      sh.getRange(r+1, iStatus+1).setValue('sent');
      sh.getRange(r+1, iSent+1).setValue(nowIso);
      Logger.log('Inviato digest ' + queueId + ' a ' + email);
      return { ok:true, sentTo: email, subject: subj };
    }
    return { error:'queueId non trovato: ' + queueId };
  } catch(e) {
    Logger.log('sendQueuedDigest errore: ' + e.message);
    return { error: e.message };
  }
}

/**
 * Invia tutti i digest con status='draft' nella queue.
 * @return { sent, errors, total }
 */
function sendAllPendingDigest() {
  var sh = _getDigestQueueSheet_();
  var rows = sh.getDataRange().getValues();
  var headers = rows[0];
  var iId = headers.indexOf('ID'), iStatus = headers.indexOf('Status');
  if (iId < 0 || iStatus < 0) return { error:'header DigestQueue corrotto' };

  var pending = [];
  for (var r = 1; r < rows.length; r++) {
    if (String(rows[r][iStatus] || '').trim() === 'draft') pending.push(rows[r][iId]);
  }
  Logger.log('Digest pending da inviare: ' + pending.length);
  var sent = 0, errors = [];
  pending.forEach(function(qid) {
    try {
      var res = sendQueuedDigest(qid);
      if (res.ok) sent++; else errors.push({queueId:qid, err:res.error});
      Utilities.sleep(500);
    } catch(e) { errors.push({queueId:qid, err:e.message}); }
  });
  return { sent: sent, errors: errors, total: pending.length };
}

/**
 * Lista bozze in DigestQueue per dashboard admin.
 * @param {Object} [opts] opts.statusFilter ('all'|'draft'|'sent'|'failed')
 * @return {Array} righe
 */
function adminGetDigestQueue(opts) {
  opts = opts || {};
  var filt = opts.statusFilter || 'all';
  var sh = _getDigestQueueSheet_();
  if (sh.getLastRow() < 2) return { items: [] };
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, headers.length).getValues();
  var items = rows.map(function(r) {
    var o = {};
    headers.forEach(function(h, i){ if (h !== 'HtmlBlob') o[h] = r[i]; });
    return o;
  }).filter(function(o){ return filt === 'all' || o.Status === filt; });
  // Ultime 50, ordine inverso
  items.sort(function(a,b){ return String(b.GeneratedAt).localeCompare(String(a.GeneratedAt)); });
  return { items: items.slice(0, 50) };
}

// ============================================================================
// HELPER PRIVATI — Query contenuti per dimensione
// ============================================================================

/**
 * Cerca contenuti taggati MatrixDim contenente la dimensione richiesta.
 * @param {string} target ('items'|'bandi'|'podcast')
 * @param {string} dim    ('D1'..'D10')
 * @param {number} limit  Massimo numero di record da ritornare
 * @return {Array} oggetti normalizzati { titolo, link, ente|fonte, scadenza|data }
 */
function _queryContenutiPerDim_(target, dim, limit) {
  limit = limit || 5;
  try {
    var sh = null;
    if (target === 'items' || target === 'podcast') {
      var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
      if (!ss) return [];
      sh = ss.getSheetByName(target === 'items' ? 'Items' : 'Podcast');
    } else if (target === 'bandi') {
      sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
    }
    if (!sh || sh.getLastRow() < 2) return [];

    var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    var iDim = headers.indexOf('MatrixDim');
    if (iDim < 0) return [];
    var iTit = _findCol_(headers, ['Titolo','titolo','Title','title']);
    var iLink = _findCol_(headers, ['Link','link','URL','url','URL_bando','UrlBando','LinkBando']);
    var iSca  = _findCol_(headers, ['Scadenza','scadenza','DataPubblicazione','Data','data','DataRilevamento']);
    var iEnt  = _findCol_(headers, ['Ente','ente','Fonte','fonte','Autore','autore','Serie']);

    var rows = sh.getRange(2, 1, sh.getLastRow()-1, headers.length).getValues();
    var out = [];
    for (var i = rows.length - 1; i >= 0 && out.length < limit; i--) { // dal piu recente
      var dims = String(rows[i][iDim] || '').trim();
      if (!dims) continue;
      if (dims.split(',').map(function(d){return d.trim();}).indexOf(dim) < 0) continue;
      out.push({
        titolo: iTit >= 0 ? String(rows[i][iTit] || '') : '',
        link:   iLink >= 0 ? String(rows[i][iLink] || '') : '',
        ente:   iEnt >= 0 ? String(rows[i][iEnt] || '') : '',
        scadenza: iSca >= 0 ? String(rows[i][iSca] || '') : ''
      });
    }
    return out;
  } catch(e) {
    Logger.log('_queryContenutiPerDim_ ' + target + ' ' + dim + ' errore: ' + e.message);
    return [];
  }
}

function _findCol_(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Foglio DigestQueue (creato on-demand).
 */
function _getDigestQueueSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
  if (!ss) throw new Error('spreadsheet null');
  var sh = ss.getSheetByName(OC_DIGEST_QUEUE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_DIGEST_QUEUE_SHEET);
    sh.appendRow(OC_DIGEST_QUEUE_HEADERS);
    sh.getRange(1, 1, 1, OC_DIGEST_QUEUE_HEADERS.length)
      .setFontWeight('bold').setBackground('#0E7490').setFontColor('#fff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200);  // ID
    sh.setColumnWidth(2, 220);  // Email
    sh.setColumnWidth(6, 80);   // HtmlBlob (compresso)
  }
  return sh;
}

function _saveDigestQueueRow_(obj) {
  var sh = _getDigestQueueSheet_();
  var id = 'DQ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '_' + Math.floor(Math.random()*10000);
  var row = OC_DIGEST_QUEUE_HEADERS.map(function(h){
    return (h === 'ID') ? id : (obj[h] != null ? obj[h] : '');
  });
  sh.appendRow(row);
  return id;
}

/**
 * Mappa email -> true per le bozze 'draft' generate negli ultimi N giorni.
 */
function _getRecentDraftsByEmail_(daysBack) {
  daysBack = daysBack || 6;
  var sh = _getDigestQueueSheet_();
  if (sh.getLastRow() < 2) return {};
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iEmail = headers.indexOf('Email'),
      iGen   = headers.indexOf('GeneratedAt'),
      iSt    = headers.indexOf('Status');
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, headers.length).getValues();
  var threshold = Date.now() - daysBack * 86400 * 1000;
  var map = {};
  rows.forEach(function(r) {
    if (String(r[iSt]) !== 'draft') return;
    var t = Date.parse(r[iGen]);
    if (isNaN(t) || t < threshold) return;
    map[String(r[iEmail]).trim().toLowerCase()] = true;
  });
  return map;
}

// ============================================================================
// HELPER PRIVATI — Costruzione HTML email personalizzata
// ============================================================================

function _buildDigestSegmentatoHtml_(report, top3, bandiByDim, newsByDim, podcastByDim) {
  var museumName = report.museumName || 'la tua struttura';
  var profile = report.profileAssigned || '';
  var score = report.syntheticScore || 0;
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');

  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) {}

  var parts = [];
  parts.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Digest personalizzato MuseMu Matrix</title></head>');
  parts.push('<body style="margin:0;padding:0;background:#F4F4F6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1D1D1F;">');
  parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F4F6;padding:24px 0;">');
  parts.push('<tr><td align="center">');
  parts.push('<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#FFFFFF;border-radius:12px;overflow:hidden;">');

  // Header personalizzato
  parts.push('<tr><td style="padding:28px 28px 18px 28px;background:linear-gradient(135deg,#0E7490 0%,#2E5266 100%);color:#FFFFFF;">');
  parts.push('<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.85">MuseMu Matrix · Digest personalizzato · ' + _h_(dateStr) + '</div>');
  parts.push('<div style="font-size:22px;font-weight:700;margin-top:8px;">' + _h_(museumName) + '</div>');
  parts.push('<div style="font-size:13px;margin-top:6px;opacity:.9">Profilo: <b>' + _h_(profile) + '</b> · Score sintetico: <b>' + _h_(score) + '/100</b></div>');
  parts.push('</td></tr>');

  // Box "Cosa trovi qui"
  parts.push('<tr><td style="padding:18px 28px 6px 28px;">');
  parts.push('<div style="background:#F5F0E1;border-left:3px solid #B8902A;padding:14px 16px;border-radius:6px;font-size:13px;line-height:1.6;color:#6B5418">');
  parts.push('Una selezione settimanale di <b>bandi, news e podcast</b> filtrati specificamente sulle <b>3 dimensioni MuseMu Matrix</b> dove il tuo museo ha maggior margine di crescita. Niente rumore generico: solo contenuti pertinenti alle priorita emerse dal tuo report.');
  parts.push('</div></td></tr>');

  // Box top 3 dimensioni
  parts.push('<tr><td style="padding:14px 28px 0 28px;">');
  parts.push('<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A8A8E;font-weight:700;margin-bottom:8px">Le tue 3 priorita</div>');
  parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>');
  top3.forEach(function(o, i) {
    var col = ['#0E7490','#B8902A','#2E5266'][i] || '#666';
    parts.push('<td style="width:33%;padding:6px 4px"><div style="background:#FAFAFA;border-top:3px solid ' + col + ';padding:10px 12px;border-radius:6px">');
    parts.push('<div style="font-size:11px;color:' + col + ';font-weight:700">#' + (i+1) + ' · ' + _h_(o.dimensionCode) + '</div>');
    parts.push('<div style="font-size:13px;color:#1D1D1F;margin-top:3px;line-height:1.3">' + _h_(o.dimensionName) + '</div>');
    parts.push('<div style="font-size:11px;color:#888;margin-top:3px">score ' + _h_(o.score) + '/100</div>');
    parts.push('</div></td>');
  });
  parts.push('</tr></table></td></tr>');

  // Sezioni per dimensione
  top3.forEach(function(o) {
    var dim = o.dimensionCode;
    var bandi = bandiByDim[dim] || [];
    var news = newsByDim[dim] || [];
    var pod = podcastByDim[dim] || [];
    var totDim = bandi.length + news.length + pod.length;
    if (!totDim) return;

    parts.push('<tr><td style="padding:24px 28px 6px 28px;border-top:1px solid #ECECEE;">');
    parts.push('<div style="font-size:13px;color:#0E7490;font-weight:700">' + _h_(dim) + ' · ' + _h_(o.dimensionName) + '</div>');
    parts.push('<div style="font-size:11px;color:#888;margin-top:2px">' + totDim + ' aggiornamenti pertinenti questa settimana</div>');
    parts.push('</td></tr>');

    if (bandi.length) {
      parts.push(_dsSubsectionHeader_('🔥 Bandi pertinenti'));
      bandi.forEach(function(b){ parts.push(_dsCard_(b, '#B8902A', 'bando')); });
    }
    if (news.length) {
      parts.push(_dsSubsectionHeader_('📰 News'));
      news.forEach(function(n){ parts.push(_dsCard_(n, '#0E7490', 'news')); });
    }
    if (pod.length) {
      parts.push(_dsSubsectionHeader_('🎙️ Podcast / Video'));
      pod.forEach(function(p){ parts.push(_dsCard_(p, '#534AB7', 'podcast')); });
    }
  });

  // CTA: rivedi report Matrix
  if (webUrl) {
    parts.push('<tr><td style="padding:28px 28px 12px 28px;text-align:center;border-top:1px solid #ECECEE;">');
    parts.push('<div style="font-size:13px;color:#3A3A3C;margin-bottom:10px">Vuoi rivedere il tuo report MuseMu Matrix o ricompilare il questionario per misurare i progressi?</div>');
    parts.push('<a href="' + _h_(webUrl) + '#matrix-landing" style="display:inline-block;background:#B8902A;color:#FFFFFF;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Apri il tuo MuseMu Matrix →</a>');
    parts.push('</td></tr>');
  }

  // Footer
  parts.push('<tr><td style="padding:14px 28px 28px 28px;border-top:1px solid #ECECEE;">');
  parts.push('<p style="margin:0;font-size:11px;line-height:1.5;color:#8A8A8E;">Ricevi questa email perche hai completato il questionario MuseMu Matrix per ' + _h_(museumName) + ' e hai espresso consenso al follow-up. Per modificare le preferenze o cancellarti, rispondi a questo messaggio con oggetto "RIMUOVI". Dati trattati ai sensi del Reg. UE 2016/679.</p>');
  parts.push('<p style="margin:8px 0 0;font-size:11px;color:#A8A8AA">Duemilamusei · Fano (PU) · s.straccini@gmail.com</p>');
  parts.push('</td></tr>');

  parts.push('</table></td></tr></table></body></html>');
  return parts.join('');
}

function _dsSubsectionHeader_(title) {
  return '<tr><td style="padding:8px 28px 4px 28px;">' +
         '<div style="font-size:11px;color:#8A8A8E;font-weight:700;letter-spacing:.08em;text-transform:uppercase">' +
         _h_(title) + '</div></td></tr>';
}

function _dsCard_(item, color, kind) {
  var titolo = item.titolo || '(senza titolo)';
  var link = item.link || '';
  var ente = item.ente || '';
  var sca = item.scadenza || '';
  var meta = [ente, sca].filter(String).join(' · ');
  var titHtml = link ? '<a href="' + _h_(link) + '" style="color:#1D1D1F;text-decoration:none;">' + _h_(titolo) + '</a>' : _h_(titolo);
  return '<tr><td style="padding:6px 28px;">' +
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' +
         '<tr><td style="border-left:3px solid ' + color + ';padding:8px 12px;background:#FAFAFA;border-radius:0 6px 6px 0;">' +
         '<div style="font-size:13px;color:#1D1D1F;line-height:1.4;font-weight:600">' + titHtml + '</div>' +
         (meta ? '<div style="font-size:11px;color:#5A5A5E;margin-top:3px">' + _h_(meta) + '</div>' : '') +
         '</td></tr></table></td></tr>';
}

// ============================================================================
// DIAGNOSTICA
// ============================================================================

/**
 * Test rapido del digest segmentato con dati di esempio.
 * Genera bozza per s.straccini@gmail.com e usa l'ULTIMO responseId in
 * ResponsesMatrix (utile dopo aver eseguito testMatrixModule).
 */
function testGenerateDigestSegmentato() {
  Logger.log('=== TEST DIGEST SEGMENTATO ===');
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
  if (!ss) return { error:'no spreadsheet' };
  var rmSh = ss.getSheetByName('ResponsesMatrix');
  if (!rmSh || rmSh.getLastRow() < 2) {
    return { error:'ResponsesMatrix vuoto. Esegui prima testMatrixModule per creare un response di test.' };
  }
  var lastRow = rmSh.getLastRow();
  var rid = String(rmSh.getRange(lastRow, 1).getValue());
  Logger.log('Uso responseId: ' + rid);
  var res = generateDigestForUser('s.straccini@gmail.com', rid);
  Logger.log('Risultato generazione: ' + JSON.stringify(res, null, 2));
  if (!res.ok) return res;

  // Invio immediato (test)
  var sendRes = sendQueuedDigest(res.queueId);
  Logger.log('Risultato invio: ' + JSON.stringify(sendRes, null, 2));
  return { generate: res, send: sendRes };
}

// ============================================================================
// SPRINT 1.3 D2.4 (2026-05-01) — CRON WEEKLY + WORKFLOW BOZZE
// ============================================================================

var OC_DIGEST_TRIGGER_HANDLER = 'cronGenerateDigestWeekly';
var OC_DIGEST_TRIGGER_DAY = ScriptApp.WeekDay.TUESDAY;
var OC_DIGEST_TRIGGER_HOUR = 6; // martedi 06:00
var OC_DIGEST_LAST_RUN_PROP = 'OC_DIGEST_LAST_RUN';
var OC_DIGEST_LAST_RESULT_PROP = 'OC_DIGEST_LAST_RESULT';

/**
 * Funzione eseguita dal trigger weekly (martedi 06:00).
 * Sequenza:
 *  1. Genera bozze segmentate in DigestQueue per ogni compilatore Matrix opt-in
 *  2. Genera bozza generalista in NewsletterLog per MailingList
 *  3. Invia notifica Telegram all'admin con riepilogo
 *  4. Salva stato in ScriptProperties (timestamp ultima esecuzione + risultato)
 *
 * NB: NON invia automaticamente. L'invio resta manuale dall'admin per controllo
 * qualita. Il workflow Telegram autorizzazione esistente per il generalista
 * resta invariato.
 */
function cronGenerateDigestWeekly() {
  var startedAt = new Date();
  Logger.log('=== CRON DIGEST WEEKLY START · ' + startedAt.toISOString() + ' ===');
  var report = {
    startedAt: startedAt.toISOString(),
    segmentati: null,
    generalista: null,
    telegram: null,
    durataSec: 0,
    errori: []
  };

  try {
    // 1) Bozze segmentate per i compilatori Matrix
    Logger.log('[1/3] Generazione bozze segmentate per compilatori Matrix...');
    try {
      report.segmentati = generateDigestQueueAll({});
      Logger.log('  Segmentati: generati=' + (report.segmentati.generati||0) +
                 ' skipped=' + (report.segmentati.skipped||0) +
                 ' errori=' + (report.segmentati.errori||0));
    } catch(e) {
      report.errori.push('segmentati: ' + e.message);
      Logger.log('  ERR segmentati: ' + e.message);
    }

    // 2) Bozza generalista per MailingList
    Logger.log('[2/3] Generazione bozza generalista...');
    try {
      if (typeof adminGenerateDigestDraft === 'function') {
        report.generalista = adminGenerateDigestDraft({
          maxBandi: 8,
          maxNews: 6,
          maxPodcast: 3,
          soggetto: 'Osservatorio Culturale — Digest settimanale ' +
                    Utilities.formatDate(startedAt, Session.getScriptTimeZone(), 'dd/MM/yyyy')
        });
        Logger.log('  Generalista: ok=' + (report.generalista.ok) +
                   ' id=' + (report.generalista.id||'(none)'));
      } else {
        Logger.log('  adminGenerateDigestDraft non disponibile (skip)');
      }
    } catch(e) {
      report.errori.push('generalista: ' + e.message);
      Logger.log('  ERR generalista: ' + e.message);
    }

    // 3) Notifica Telegram all'admin
    Logger.log('[3/3] Notifica Telegram all\'admin...');
    var msg = '*Digest weekly · bozze pronte*\n\n' +
              '_' + Utilities.formatDate(startedAt, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '_\n\n' +
              '*Segmentati Matrix:* ' + (report.segmentati ? (report.segmentati.generati||0) : 0) + ' bozze\n' +
              '*Generalista:* ' + (report.generalista && report.generalista.ok ? '1 bozza pronta' : 'errore') + '\n\n' +
              'Apri il pannello admin per revisione e invio.';
    try {
      if (typeof sendTelegram === 'function') {
        var tg = sendTelegram(msg);
        report.telegram = { ok: !!tg, raw: tg };
      } else {
        report.telegram = { ok:false, error:'sendTelegram non disponibile' };
      }
    } catch(e) {
      report.errori.push('telegram: ' + e.message);
      report.telegram = { ok:false, error:e.message };
    }

  } catch(e) {
    report.errori.push('top-level: ' + e.message);
    Logger.log('ERR top-level: ' + e.message);
  }

  report.durataSec = Math.round((Date.now() - startedAt.getTime()) / 1000);
  Logger.log('=== CRON DIGEST WEEKLY END · durata=' + report.durataSec + 's · errori=' + report.errori.length + ' ===');

  // Persisti stato ultima esecuzione
  try {
    PropertiesService.getScriptProperties().setProperty(OC_DIGEST_LAST_RUN_PROP, startedAt.toISOString());
    PropertiesService.getScriptProperties().setProperty(OC_DIGEST_LAST_RESULT_PROP, JSON.stringify(report));
  } catch(e) {}

  return report;
}

/**
 * Installa (o reinstalla) il trigger weekly. Idempotente: rimuove eventuali
 * trigger esistenti per la stessa funzione handler prima di crearlo nuovo.
 *
 * @return {Object} { ok, triggerId, day, hour }
 */
function setupMatrixDigestTrigger() {
  try {
    // Rimuovi eventuali trigger esistenti per questo handler
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === OC_DIGEST_TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(t);
        removed++;
      }
    });

    // Crea nuovo trigger weekly martedi 06:00
    var trig = ScriptApp.newTrigger(OC_DIGEST_TRIGGER_HANDLER)
      .timeBased()
      .onWeekDay(OC_DIGEST_TRIGGER_DAY)
      .atHour(OC_DIGEST_TRIGGER_HOUR)
      .create();

    Logger.log('Trigger creato: ' + OC_DIGEST_TRIGGER_HANDLER + ' martedi ' + OC_DIGEST_TRIGGER_HOUR + ':00. Rimossi precedenti: ' + removed);
    return {
      ok: true,
      triggerId: trig.getUniqueId(),
      day: 'TUESDAY',
      hour: OC_DIGEST_TRIGGER_HOUR,
      removedOld: removed
    };
  } catch(e) {
    Logger.log('setupMatrixDigestTrigger errore: ' + e.message);
    return { ok:false, error:e.message };
  }
}

/**
 * Disinstalla il trigger weekly.
 */
function removeMatrixDigestTrigger() {
  try {
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === OC_DIGEST_TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(t);
        removed++;
      }
    });
    Logger.log('Trigger rimossi: ' + removed);
    return { ok:true, removed: removed };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

/**
 * Stato del trigger digest weekly + ultima esecuzione.
 * @return { active, day?, hour?, lastRunIso?, lastRunHumanIt?, lastResult? }
 */
function getMatrixDigestTriggerStatus() {
  var status = { active:false };
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === OC_DIGEST_TRIGGER_HANDLER) {
        status.active = true;
        status.triggerId = t.getUniqueId();
        status.day = 'TUESDAY';
        status.hour = OC_DIGEST_TRIGGER_HOUR;
      }
    });
    var lastIso = PropertiesService.getScriptProperties().getProperty(OC_DIGEST_LAST_RUN_PROP);
    if (lastIso) {
      status.lastRunIso = lastIso;
      try {
        status.lastRunHumanIt = Utilities.formatDate(new Date(lastIso), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      } catch(e) { status.lastRunHumanIt = lastIso; }
    }
    var lastResult = PropertiesService.getScriptProperties().getProperty(OC_DIGEST_LAST_RESULT_PROP);
    if (lastResult) {
      try { status.lastResult = JSON.parse(lastResult); } catch(e) { status.lastResult = { raw: lastResult }; }
    }
  } catch(e) {
    status.error = e.message;
  }
  return status;
}

/**
 * Test rapido: esegue cronGenerateDigestWeekly manualmente (utile per debug
 * senza aspettare il martedi). Dall'editor GAS.
 */
function testCronGenerateDigestWeekly() {
  Logger.log('=== TEST MANUALE CRON DIGEST WEEKLY ===');
  var res = cronGenerateDigestWeekly();
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

// ============================================================================
// FINE Matrix_digest.gs
// ============================================================================
