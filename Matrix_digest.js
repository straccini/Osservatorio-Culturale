/**
 * ============================================================================
 *  Matrix_digest.gs — Digest segmentato per compilatori MuseMu Matrix
 * ============================================================================
 *  Sprint 1.3 D2.3 (2026-05-01)
 *  Autore: Silvano Straccini / Sinopia
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
var OC_MATRIX_RESPONSES_SHEET = 'ResponsesMatrix';
var OC_MATRIX_CONTACTS_SHEET = 'ContactsMatrix';
var OC_DIGEST_QUEUE_HEADERS = [
  'ID','Email','ResponseId','GeneratedAt','Subject','HtmlBlob','Status','SentAt','Note'
];

/**
 * _mdH_() — HTML entity escaping per email digest.
 * Previene XSS e injection nelle email HTML generate.
 */
// QA 20/08/2026 — era _h_, in collisione con Newsletter_v44.js. Vinceva quella di
// Newsletter, che non copre l'apostrofo e trasforma lo zero in stringa vuota.
function _mdH_(val) {
  return String(val == null ? '' : val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
function generateDigestForUser(email, responseId, opts) {
  opts = opts || {};
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
    // v4.24 — Dedup cross-dimensione esatto + fuzzy: nessun contenuto duplicato o simile tra sezioni
    var _seenBandi = {}, _seenNews = {}, _seenPodcast = {};
    var _allBandiAccum = [], _allNewsAccum = [], _allPodAccum = [];

    function _crossDedupExact(item, seen) {
      var k = String(item.titolo||'').trim().toLowerCase();
      if (!k || seen[k]) return false;
      seen[k] = true;
      return true;
    }

    topDims.forEach(function(dim) {
      var rawBandi = _queryContenutiPerDim_('bandi', dim, 6).filter(function(b) { return _crossDedupExact(b, _seenBandi); });
      // v4.27.48 — anti-ripetizione coorte 'matrix' + coerenza tipologica bandi
      if (typeof ddTipoCoerente === 'function') rawBandi = rawBandi.filter(function(b){ return ddTipoCoerente('bando', b); });
      if (typeof ddFilterNotSent === 'function') rawBandi = ddFilterNotSent('matrix', 'bando', rawBandi);
      _allBandiAccum = _allBandiAccum.concat(rawBandi);
      bandiByDim[dim] = rawBandi.slice(0, 4);

      var rawNews = _queryContenutiPerDim_('items', dim, 5).filter(function(n) { return _crossDedupExact(n, _seenNews); });
      if (typeof ddFilterNotSent === 'function') rawNews = ddFilterNotSent('matrix', 'news', rawNews);
      _allNewsAccum = _allNewsAccum.concat(rawNews);
      newsByDim[dim] = rawNews.slice(0, 3);

      var rawPod = _queryContenutiPerDim_('podcast', dim, 4).filter(function(p) { return _crossDedupExact(p, _seenPodcast); });
      if (typeof ddFilterNotSent === 'function') rawPod = ddFilterNotSent('matrix', 'podcast', rawPod);
      _allPodAccum = _allPodAccum.concat(rawPod);
      podcastByDim[dim] = rawPod.slice(0, 2);
    });

    // Dedup fuzzy cross-dimensione (titoli simili tra dimensioni diverse)
    if (typeof _dedupFuzzyByTitle_ === 'function') {
      var _allBandiClean = _dedupFuzzyByTitle_(_allBandiAccum);
      var _allNewsClean = _dedupFuzzyByTitle_(_allNewsAccum);
      var _allPodClean = _dedupFuzzyByTitle_(_allPodAccum);

      // Ricostruisci i bucket per dimensione mantenendo solo gli item sopravvissuti
      var _bandiSet = {}; _allBandiClean.forEach(function(b) { _bandiSet[String(b.titolo||'').trim().toLowerCase()] = true; });
      var _newsSet = {};  _allNewsClean.forEach(function(n) { _newsSet[String(n.titolo||'').trim().toLowerCase()] = true; });
      var _podSet = {};   _allPodClean.forEach(function(p) { _podSet[String(p.titolo||'').trim().toLowerCase()] = true; });

      topDims.forEach(function(dim) {
        bandiByDim[dim] = (bandiByDim[dim] || []).filter(function(b) { return _bandiSet[String(b.titolo||'').trim().toLowerCase()]; });
        newsByDim[dim] = (newsByDim[dim] || []).filter(function(n) { return _newsSet[String(n.titolo||'').trim().toLowerCase()]; });
        podcastByDim[dim] = (podcastByDim[dim] || []).filter(function(p) { return _podSet[String(p.titolo||'').trim().toLowerCase()]; });
      });
    }

    // v4.25 — Contenuti agenti unificati (se richiesto)
    var agentItems = [];
    if (opts.includeAgentContent && typeof getAllAgentContentForUser === 'function') {
      var agentData = getAllAgentContentForUser(email, 3);
      if (agentData && agentData.ok && agentData.allItems && agentData.allItems.length) {
        // Raccogli tutti i titoli Matrix per dedup cross-sistema
        var matrixTitles = [];
        topDims.forEach(function(dim) {
          (bandiByDim[dim]||[]).forEach(function(b){ if(b.titolo) matrixTitles.push(b.titolo); });
          (newsByDim[dim]||[]).forEach(function(n){ if(n.titolo) matrixTitles.push(n.titolo); });
          (podcastByDim[dim]||[]).forEach(function(p){ if(p.titolo) matrixTitles.push(p.titolo); });
        });
        // Dedup agenti vs Matrix
        agentItems = (typeof _dedupAgentVsMatrix_ === 'function')
          ? _dedupAgentVsMatrix_(agentData.allItems, matrixTitles)
          : agentData.allItems;
      }
    }

    // Compone HTML
    var museumName = report.museumName || 'la tua struttura';
    var dataStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var subject = '[Personalizzato] Aggiornamenti per ' + museumName + ' — ' + dataStr;
    var html = _buildDigestSegmentatoHtml_(report, top3, bandiByDim, newsByDim, podcastByDim, email, agentItems);

    // Salva in DigestQueue solo se richiesto (default sì, per generateDigestQueueAll).
    // Invio diretto coorte B e anteprima passano {save:false} → niente bozza spuria.
    var queueId = null;
    // v4.27.48 — registra i contenuti effettivamente mostrati verso la coorte
    // 'matrix'. Avviene alla generazione (la coda viene inviata subito dopo dal
    // flusso bulk) o su invio diretto (opts.markSent=true dal routing coorte B).
    // Il filtro usa lo snapshot di INIZIO esecuzione → gli utenti dello stesso
    // run condividono lo stesso bacino di contenuti. Le anteprime/test
    // (save:false senza markSent) NON registrano nulla.
    if ((opts.save !== false || opts.markSent === true) && typeof ddMarkSent === 'function') {
      try {
        var _ddB = [], _ddN = [], _ddP = [];
        topDims.forEach(function(dim) {
          _ddB = _ddB.concat(bandiByDim[dim] || []);
          _ddN = _ddN.concat(newsByDim[dim] || []);
          _ddP = _ddP.concat(podcastByDim[dim] || []);
        });
        ddMarkSent('matrix', { bando: _ddB, news: _ddN, podcast: _ddP });
      } catch(eDD) { Logger.log('[MatrixDigest] registro non aggiornato: ' + eDD.message); }
    }
    if (opts.save !== false) {
      queueId = _saveDigestQueueRow_({
        Email: email,
        ResponseId: responseId,
        GeneratedAt: new Date().toISOString(),
        Subject: subject,
        HtmlBlob: html,
        Status: 'draft',
        SentAt: '',
        Note: 'top3=' + topDims.join(',') + ' · museo=' + museumName
      });
    }

    return {
      ok: true,
      queueId: queueId,
      subject: subject,
      html: html,
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
  if (opts.token && typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(opts.token)) {
    return { ok:false, error:'forbidden' };
  }
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

      if (typeof _digestWasRecentlySent_ === 'function' && _digestWasRecentlySent_(email)) {
        Logger.log('[DIGEST] Skip (dedup): ' + email);
        sh.getRange(r+1, iStatus+1).setValue('skipped_dedup');
        return { error:'dedup — email gia contattata di recente: ' + email };
      }

      try { if (MailApp.getRemainingDailyQuota() < 1) return { error:'quota_esaurita' }; } catch(_){}

      MailApp.sendEmail({
        to:       email,
        subject:  subj,
        htmlBody: html,
        name:     'Osservatorio Culturale · MuseMu Matrix',
        replyTo:  'sinopiaconsulting@gmail.com'
      });
      if (typeof _digestMarkSent_ === 'function') _digestMarkSent_(email, 'matrix');
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
function sendAllPendingDigest(token) {
  // v4.22 SEC — Guard incondizionato (token obbligatorio, no bypass senza token)
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
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
  for (var pi = 0; pi < pending.length; pi++) {
    var qid = pending[pi];
    if (MailApp.getRemainingDailyQuota() < 2) { Logger.log('Quota esaurita, stop invio'); break; }
    try {
      var res = sendQueuedDigest(qid);
      if (res.ok) sent++; else errors.push({queueId:qid, err:res.error});
      Utilities.sleep(500);
    } catch(e) { errors.push({queueId:qid, err:e.message}); }
  }
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
  var pendenti = items.filter(function(o){ return o.Status === 'draft'; }).length;
  return { ok: true, items: items.slice(0, 50), pendenti: pendenti };
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
    var iTit = _mdFindCol_(headers, ['Titolo','titolo','Title','title']);
    var iLink = _mdFindCol_(headers, ['Link','link','URL','url','URL_bando','UrlBando','LinkBando']);
    var iSca  = _mdFindCol_(headers, ['Scadenza','scadenza','DataPubblicazione','Data','data','DataRilevamento']);
    var iEnt  = _mdFindCol_(headers, ['Ente','ente','Fonte','fonte','Autore','autore','Serie']);

    // v4.20.x — Mappa dimensione -> ambito primario (allineata a OC_AMBITI in Constants).
    // Usata come FALLBACK per le righe NON taggate (colonna MatrixDim assente O vuota),
    // così il digest Matrix non si svuota durante il backlog del tagger.
    var dimToAmbito = { D1:1, D2:3, D3:3, D4:3, D5:3, D6:5, D7:2, D8:4, D9:5, D10:4 };
    var targetAmbito = dimToAmbito[dim] || 1;
    var iAmbito = _mdFindCol_(headers, ['Ambito','ambito','AmbitoId']);

    var rows = sh.getRange(2, 1, sh.getLastRow()-1, headers.length).getValues();
    // v4.24 — Raccogli con margine per dedup fuzzy
    var rawLimit = limit * 2;
    var out = [];
    for (var i = rows.length - 1; i >= 0 && out.length < rawLimit; i--) { // dal piu recente
      var dims = (iDim >= 0) ? String(rows[i][iDim] || '').trim() : '';
      var match = false;
      if (dims) {
        // riga taggata: match per dimensione esatta
        match = dims.split(',').map(function(d){ return d.trim(); }).indexOf(dim) >= 0;
      } else if (iAmbito >= 0) {
        // riga NON taggata: fallback per ambito mappato alla dimensione
        match = (Number(rows[i][iAmbito]) || 0) === targetAmbito;
      }
      if (!match) continue;
      out.push({
        titolo: iTit >= 0 ? String(rows[i][iTit] || '') : '',
        link:   iLink >= 0 ? String(rows[i][iLink] || '') : '',
        ente:   iEnt >= 0 ? String(rows[i][iEnt] || '') : '',
        scadenza: iSca >= 0 ? String(rows[i][iSca] || '') : ''
      });
    }
    // v4.24 — Dedup fuzzy: rimuove titoli simili già a livello di query
    if (typeof _dedupFuzzyByTitle_ === 'function') {
      out = _dedupFuzzyByTitle_(out);
    }
    return out.slice(0, limit);
  } catch(e) {
    Logger.log('_queryContenutiPerDim_ ' + target + ' ' + dim + ' errore: ' + e.message);
    return [];
  }
}

// QA 20/08/2026 — era _findCol_, in collisione con Identity_v1.js e UltimiBandi.js.
// Implementazione identica a quella di UltimiBandi; rinominata per lasciare una sola
// definizione globale e togliere l'ambiguita'.
function _mdFindCol_(headers, candidates) {
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

function _buildDigestSegmentatoHtml_(report, top3, bandiByDim, newsByDim, podcastByDim, email, agentItems) {
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
  parts.push('<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.85">MuseMu Matrix · Digest personalizzato · ' + _mdH_(dateStr) + '</div>');
  parts.push('<div style="font-size:22px;font-weight:700;margin-top:8px;">' + _mdH_(museumName) + '</div>');
  parts.push('<div style="font-size:13px;margin-top:6px;opacity:.9">Profilo: <b>' + _mdH_(profile) + '</b> · Score sintetico: <b>' + _mdH_(score) + '/100</b></div>');
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
    parts.push('<div style="font-size:11px;color:' + col + ';font-weight:700">#' + (i+1) + ' · ' + _mdH_(o.dimensionCode) + '</div>');
    parts.push('<div style="font-size:13px;color:#1D1D1F;margin-top:3px;line-height:1.3">' + _mdH_(o.dimensionName) + '</div>');
    parts.push('<div style="font-size:11px;color:#888;margin-top:3px">score ' + _mdH_(o.score) + '/100</div>');
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
    parts.push('<div style="font-size:13px;color:#0E7490;font-weight:700">' + _mdH_(dim) + ' · ' + _mdH_(o.dimensionName) + '</div>');
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

  // v4.25 — Sezione "Altre segnalazioni della settimana" (contenuti agenti)
  if (agentItems && agentItems.length > 0) {
    parts.push('<tr><td style="padding:28px 28px 6px 28px;border-top:1px solid #ECECEE;">');
    parts.push('<div style="font-size:14px;color:#1D1D1F;font-weight:700">Altre segnalazioni della settimana</div>');
    parts.push('<div style="font-size:11px;color:#888;margin-top:2px">' + agentItems.length + ' contenuti selezionati dai nostri agenti tematici</div>');
    parts.push('</td></tr>');

    // Raggruppa per agente
    var agentGroups = {};
    agentItems.forEach(function(it) {
      var code = it.agentCodice || 'altro';
      if (!agentGroups[code]) agentGroups[code] = { icon: it.agentIcon||'📌', nome: it.agentNomeBreve||code, color: it.agentColor||'#666', items: [] };
      agentGroups[code].items.push(it);
    });

    Object.keys(agentGroups).forEach(function(code) {
      var grp = agentGroups[code];
      parts.push('<tr><td style="padding:10px 28px 4px 28px;">');
      parts.push('<div style="font-size:12px;color:' + grp.color + ';font-weight:700">' + grp.icon + ' ' + _mdH_(grp.nome) + '</div>');
      parts.push('</td></tr>');
      grp.items.forEach(function(it) {
        parts.push(_dsCard_({ titolo: it.titolo, link: it.url||'', ente: it.fonte||'', scadenza: it.data||'' }, grp.color, 'agente'));
      });
    });
  }

  // CTA: rivedi report Matrix
  if (webUrl) {
    parts.push('<tr><td style="padding:28px 28px 12px 28px;text-align:center;border-top:1px solid #ECECEE;">');
    parts.push('<div style="font-size:13px;color:#3A3A3C;margin-bottom:10px">Vuoi rivedere il tuo report MuseMu Matrix o ricompilare il questionario per misurare i progressi?</div>');
    parts.push('<a href="' + _mdH_(webUrl) + '#matrix-landing" style="display:inline-block;background:#B8902A;color:#FFFFFF;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Apri il tuo MuseMu Matrix →</a>');
    parts.push('</td></tr>');
  }

  // v4.20 — CTA Candidature Capitale della Cultura
  if (typeof _digestCapitaleCta_ === 'function') {
    parts.push('<tr><td style="padding:0 28px;">' + _digestCapitaleCta_(webUrl || '') + '</td></tr>');
  }

  // Footer — v4.24: tipo digest esplicito, unsubscribe, modifica preferenze
  parts.push('<tr><td style="padding:14px 28px 28px 28px;border-top:1px solid #ECECEE;">');
  parts.push('<p style="margin:0;font-size:11px;line-height:1.5;color:#8A8A8E;">Questa è una <strong>digest personalizzata MuseMu Matrix</strong> per ' + _mdH_(museumName) + '.<br>Ricevi questa email perché hai completato il questionario e hai espresso consenso al follow-up. Dati trattati ai sensi del Reg. UE 2016/679.</p>');
  // v4.18.54 — Footer unsubscribe link
  if (typeof _digestUnsubFooter_ === 'function' && email) {
    parts.push(_digestUnsubFooter_(email, { style: 'matrix' }));
  }
  // v4.24 — Link modifica preferenze
  if (webUrl) {
    parts.push('<p style="margin:8px 0 0;font-size:11px;color:#8A8A8E;">Vuoi ricevere contenuti diversi? <a href="' + _mdH_(webUrl) + '#profilo-agenti" style="color:#0E7490;text-decoration:underline;">Modifica le tue preferenze</a>.</p>');
  }
  parts.push('<p style="margin:8px 0 0;font-size:11px;color:#A8A8AA">Sinopia · Osservatorio Culturale · Fano (PU) · sinopiaconsulting@gmail.com</p>');
  parts.push('</td></tr>');

  parts.push('</table></td></tr></table></body></html>');
  return parts.join('');
}

function _dsSubsectionHeader_(title) {
  return '<tr><td style="padding:8px 28px 4px 28px;">' +
         '<div style="font-size:11px;color:#8A8A8E;font-weight:700;letter-spacing:.08em;text-transform:uppercase">' +
         _mdH_(title) + '</div></td></tr>';
}

function _dsCard_(item, color, kind) {
  var titolo = item.titolo || '(senza titolo)';
  var link = item.link || '';
  var ente = item.ente || '';
  var sca = item.scadenza || '';
  var meta = [ente, sca].filter(String).join(' · ');
  var titHtml = link ? '<a href="' + _mdH_(link) + '" style="color:#1D1D1F;text-decoration:none;">' + _mdH_(titolo) + '</a>' : _mdH_(titolo);
  return '<tr><td style="padding:6px 28px;">' +
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' +
         '<tr><td style="border-left:3px solid ' + color + ';padding:8px 12px;background:#FAFAFA;border-radius:0 6px 6px 0;">' +
         '<div style="font-size:13px;color:#1D1D1F;line-height:1.4;font-weight:600">' + titHtml + '</div>' +
         (meta ? '<div style="font-size:11px;color:#5A5A5E;margin-top:3px">' + _mdH_(meta) + '</div>' : '') +
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
function testGenerateDigestSegmentato(token) {
  // v4.22 SEC — Guard incondizionato (token obbligatorio, no bypass senza token)
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
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

  // v4.20 — Dry-run: genera bozza ma NON invia (l'admin puo vedere in coda e inviare manualmente)
  return { ok: true, dryRun: true, queueId: res.queueId, message: 'Bozza generata (non inviata). Verifica nella coda e invia manualmente.' };
}

/**
 * v4.24.9 — TEST REALE digest Matrix/profilato: genera e INVIA SUBITO a emailDest.
 * Non tocca la coda (save:false), nessuna bozza spuria. Se emailDest non ha una
 * compilazione Matrix, usa come CAMPIONE l'ultima compilazione disponibile in
 * ResponsesMatrix (segnalato nel risultato con campione:true).
 * Soggetto prefissato [TEST] per distinguerlo dagli invii veri.
 */
function testInviaDigestMatrix(emailDest, token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
  emailDest = String(emailDest || '').trim().toLowerCase();
  if (!emailDest || emailDest.indexOf('@') < 0) return { ok:false, error:'email_non_valida' };
  try {
    if (MailApp.getRemainingDailyQuota() < 3) return { ok:false, error:'quota_email_esaurita' };
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    // 1) responseId della email (ContactsMatrix, piu recente)
    var responseId = null, campione = false;
    var shC = ss.getSheetByName(OC_MATRIX_CONTACTS_SHEET);
    if (shC && shC.getLastRow() > 1) {
      var cVals = shC.getDataRange().getValues();
      var cH = cVals[0];
      var iE = cH.indexOf('email'), iR = cH.indexOf('response_id');
      if (iE >= 0 && iR >= 0) {
        for (var r = cVals.length - 1; r >= 1; r--) {
          if (String(cVals[r][iE] || '').trim().toLowerCase() === emailDest && cVals[r][iR]) {
            responseId = String(cVals[r][iR]); break;
          }
        }
      }
    }
    // 2) Fallback campione: ultima compilazione in ResponsesMatrix
    if (!responseId) {
      var rmSh = ss.getSheetByName(OC_MATRIX_RESPONSES_SHEET);
      if (rmSh && rmSh.getLastRow() > 1) {
        responseId = String(rmSh.getRange(rmSh.getLastRow(), 1).getValue() || '');
        campione = !!responseId;
      }
    }
    if (!responseId) return { ok:false, error:'nessuna_compilazione_matrix_disponibile' };
    // 3) Genera (senza bozza) e invia
    var res = generateDigestForUser(emailDest, responseId, { save:false });
    if (!res || !res.ok || !res.html) return { ok:false, error: (res && res.error) || 'generazione_fallita' };
    var subj = '[TEST] ' + (res.subject || 'Sinopia · Digest personalizzato');
    GmailApp.sendEmail(emailDest, subj, 'Apri questa email in un client che supporta HTML.', {
      htmlBody: res.html,
      name: 'Sinopia · Osservatorio Culturale',
      replyTo: Session.getEffectiveUser().getEmail()
    });
    Logger.log('[testInviaDigestMatrix] inviato a ' + emailDest + ' rid=' + responseId + (campione ? ' (campione)' : ''));
    return { ok:true, emailSent: emailDest, responseId: responseId, campione: campione, top3Dims: res.top3Dims || [], contentCounts: res.contentCounts || {} };
  } catch(e) {
    return { ok:false, error: e.message };
  }
}

/**
 * v4.21 — Test digest Matrix per un'email specifica.
 * Cerca il responseId associato all'email in ContactsMatrix, genera il digest e lo salva in coda.
 * Ritorna top3Dims + contentCounts per visualizzazione admin.
 */
function testDigestMatrixForEmail(email, token) {
  // v4.22 SEC — Guard incondizionato (token obbligatorio, no bypass senza token)
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
  email = String(email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) return { error:'email non valida' };

  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
  if (!ss) return { error:'spreadsheet non disponibile' };

  // Cerca responseId in ContactsMatrix
  var contactsSh = ss.getSheetByName('ContactsMatrix');
  if (!contactsSh || contactsSh.getLastRow() < 2) return { error:'ContactsMatrix vuoto. Nessun compilatore Matrix trovato.' };
  var headers = contactsSh.getRange(1,1,1,contactsSh.getLastColumn()).getValues()[0];
  var iEmail = headers.indexOf('email');
  var iRid = headers.indexOf('response_id');
  if (iEmail < 0 || iRid < 0) return { error:'colonne email/response_id mancanti in ContactsMatrix' };

  var rows = contactsSh.getRange(2, 1, contactsSh.getLastRow()-1, headers.length).getValues();
  var responseId = null;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][iEmail] || '').trim().toLowerCase() === email) {
      responseId = String(rows[i][iRid] || '');
      break;
    }
  }
  if (!responseId) return { error:'Email ' + email + ' non trovata in ContactsMatrix. L\'utente non ha compilato il Matrix.' };

  Logger.log('[TEST DIGEST MATRIX] email=' + email + ' responseId=' + responseId);
  var res = generateDigestForUser(email, responseId);
  if (!res || !res.ok) return res;

  return {
    ok: true,
    email: email,
    responseId: responseId,
    queueId: res.queueId,
    top3Dims: res.top3Dims,
    contentCounts: res.contentCounts,
    message: 'Bozza generata per ' + email + '. Verifica nella coda e invia manualmente.'
  };
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

/**
 * v4.18.16 (2026-05-12) J — Profilazione clienti Matrix per admin.
 * Aggrega tutti i compilatori MuseMu Matrix con: nome museo, top3 gap, scoring,
 * email opt-in (se presente), contenuti pertinenti contati per ogni gap.
 *
 * Param: { limit: int (default 100), soloConEmail: bool (default false) }
 * Ritorna: { ok, count, compilatori: [{response_id, museum_name, data, profile,
 *   syntheticScore, top3 (codici), email, hasOptIn, bandiPertinenti, newsPertinenti}] }
 */
function getCompilatoriMatrixSummary(opts) {
  opts = opts || {};
  var tk = opts.token || null;
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(tk)) {
    return { ok:false, error:'forbidden' };
  }
  var limit = Number(opts.limit) || 100;
  var soloConEmail = !!opts.soloConEmail;

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shR = ss.getSheetByName(OC_MATRIX_RESPONSES_SHEET);
    if (!shR) return { ok:true, count:0, compilatori:[], note:'Foglio ResponsesMatrix non ancora creato' };

    var valsR = shR.getDataRange().getValues();
    if (valsR.length < 2) return { ok:true, count:0, compilatori:[] };
    var headR = valsR[0].map(function(h){ return String(h||'').trim(); });

    function colR(name){ for (var i=0;i<headR.length;i++){ if (headR[i].toLowerCase() === name.toLowerCase()) return i; } return -1; }
    var iRid     = colR('response_id');
    var iTi      = colR('timestamp_inizio');
    var iTf      = colR('timestamp_fine');
    var iNome    = colR('museum_name');
    var iProf    = colR('museum_profile_json');
    var iScor    = colR('scoring_dimensions_json');
    var iProfile = colR('profile_assigned');
    var iTop3    = colR('top3_opportunities_json');
    var iSyn     = colR('synthetic_score');
    var iStatus  = colR('completion_status');

    // Carica contatti (email + opt-in) in mappa per FK
    var contactsMap = {};
    var shC = ss.getSheetByName(OC_MATRIX_CONTACTS_SHEET);
    if (shC) {
      var valsC = shC.getDataRange().getValues();
      if (valsC.length > 1) {
        var headC = valsC[0].map(function(h){ return String(h||'').trim(); });
        var iCRid = headC.indexOf('response_id');
        var iCEm  = headC.indexOf('email');
        var iCPref = headC.indexOf('preferences_json');
        for (var c = 1; c < valsC.length; c++) {
          var rid = valsC[c][iCRid];
          if (!rid) continue;
          var prefRaw = iCPref >= 0 ? valsC[c][iCPref] : '';
          var prefs = {};
          try { prefs = prefRaw ? JSON.parse(prefRaw) : {}; } catch(_){ prefs = {}; }
          contactsMap[String(rid)] = {
            email: iCEm >= 0 ? String(valsC[c][iCEm] || '') : '',
            optIn: prefs
          };
        }
      }
    }

    // Itera responses
    var out = [];
    for (var r = valsR.length - 1; r >= 1 && out.length < limit; r--) {
      var row = valsR[r];
      if (!row[iRid]) continue;
      var status = iStatus >= 0 ? String(row[iStatus] || '') : 'complete';
      if (status !== 'complete') continue; // solo completati

      var rid = String(row[iRid]);
      var contact = contactsMap[rid] || null;
      if (soloConEmail && (!contact || !contact.email)) continue;

      // Parse top3
      var top3 = [];
      try {
        var t3raw = iTop3 >= 0 ? row[iTop3] : '';
        var t3arr = t3raw ? JSON.parse(t3raw) : [];
        top3 = t3arr.slice(0, 3).map(function(x){
          return {
            code: x.code || x.dim || '',
            name: x.name || x.dimName || '',
            score: Number(x.score || 0)
          };
        });
      } catch(_){ top3 = []; }

      out.push({
        responseId: rid,
        museumName: iNome >= 0 ? String(row[iNome] || '') : '',
        profile: iProfile >= 0 ? String(row[iProfile] || '') : '',
        syntheticScore: iSyn >= 0 ? Number(row[iSyn] || 0) : 0,
        top3: top3,
        dataCompilazione: iTf >= 0 ? row[iTf] : (iTi >= 0 ? row[iTi] : ''),
        email: contact ? contact.email : '',
        hasOptIn: !!(contact && contact.email),
        optInPrefs: contact ? contact.optIn : {}
      });
    }

    return { ok:true, count: out.length, compilatori: out };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// FINE Matrix_digest.gs
// ============================================================================
