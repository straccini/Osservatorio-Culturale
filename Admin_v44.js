/**
 * ================================================================
 * OSSERVATORIO CULTURALE — Admin_v44.gs  (v4.4)
 * ----------------------------------------------------------------
 * Pannello amministratore: gestione digest + newsletter + richiesta
 * autorizzazione invio via Telegram.
 *
 * Dipende da:
 *   - CurrentUser_v44.gs  -> _isCurrentUserAdmin_()
 *   - Newsletter_v44.gs   -> buildNewsletterHtml_(payload), sendNewsletterEmail_()
 *   - Telegram_v44.gs     -> telegramNotifyAuthRequest_(obj), telegramCheckApproval_(token)
 *   - UltimiBandi_patch   -> getUltimiBandiMonitorati(), getBandiListV42(...)
 *   - Addon_v42 / Server  -> getHomepageDataV42()
 *
 * Sheet utilizzate:
 *   - MailingList   (Email, Nome, Ruolo, Ambiti, Token, Attivo)
 *   - NewsletterLog (ID, Data, Soggetto, Destinatari, Stato, Autore, Token)
 *
 * Funzioni pubbliche (google.script.run):
 *   adminGetDigestList()
 *   adminGenerateDigestDraft(opts)
 *   adminDeleteDigestDraft(draftId)   v5.0.2 — elimina bozza non inviata
 *   adminPreviewNewsletterHtml(draftId)
 *   adminRequestSendAuthorization(draftId)
 *   adminConfirmSendWithToken(draftId, authToken)
 *   (mailing list gestita via Codice.js: getMailingList/saveMailing/deleteMailing/toggleMailingField)
 * ================================================================
 */

var OC_NL_SHEET_       = 'NewsletterLog';
var OC_ML_SHEET_       = 'MailingList';
var OC_DRAFT_PROP_PFX_ = 'OC_NL_DRAFT_';  // ScriptProperty key prefix per draft

// ================== ENDPOINTS ==================

/**
 * Elenco degli ultimi N digest preparati/inviati.
 * Ritorna { ok, items:[{id,data,soggetto,stato,destinatari,autore}], count }
 */
function adminGetDigestList(opts) {
  var tk = (opts && opts.token) || null;
  if (!_isCurrentUserAdmin_(tk)) return { ok:false, error:'forbidden' };
  var sh = _getOrCreateSheet_(OC_NL_SHEET_, ['ID','Data','Soggetto','Destinatari','Stato','Autore','Token']);
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return { ok:true, items:[], count:0 };
  var header = vals[0];
  var out = [];
  for (var i = vals.length-1; i >= 1 && out.length < 50; i--) {
    var r = vals[i];
    out.push({
      id:          r[0],
      data:        r[1] ? Utilities.formatDate(new Date(r[1]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : '',
      soggetto:    r[2] || '',
      destinatari: r[3] || 0,
      stato:       r[4] || '',
      autore:      r[5] || '',
      token:       r[6] || ''
    });
  }
  return { ok:true, items: out, count: out.length };
}

/**
 * Elimina definitivamente una bozza digest (riga NewsletterLog + draft in ScriptProperties).
 * Solo bozze in stato 'bozza' o 'in_attesa_approvazione' possono essere eliminate.
 * Bozze già inviate sono protette per audit trail.
 *
 * @param {string} draftId ID della bozza (es: 'DR20260524150300')
 * @return {{ok:boolean, id?:string, stato?:string, error?:string}}
 */
function adminDeleteDigestDraft(draftId, token) {
  // v4.21 — Accetta token per deploy "Chiunque" (sessione Google vuota)
  var tk = token || (typeof OC_SESSION !== 'undefined' && OC_SESSION ? OC_SESSION.token : null);
  if (!_isCurrentUserAdmin_(tk)) return { ok:false, error:'forbidden' };
  if (!draftId) return { ok:false, error:'missing_id' };

  var sh = _getOrCreateSheet_(OC_NL_SHEET_, ['ID','Data','Soggetto','Destinatari','Stato','Autore','Token']);
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return { ok:false, error:'empty_log' };

  var header = vals[0];
  var col = {};
  header.forEach(function(h, idx){ col[h] = idx; });

  // Cerca la riga (parto dal fondo perche' i piu' recenti sono in coda)
  var rowIndex = -1;
  var rowData = null;
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]) === String(draftId)) {
      rowIndex = i;
      rowData = vals[i];
      break;
    }
  }
  if (rowIndex < 0) return { ok:false, error:'draft_not_found' };

  var stato = String(rowData[col['Stato']] || '').toLowerCase();
  if (stato === 'inviato' || stato === 'inviata') {
    return { ok:false, error:'cannot_delete_sent', stato: stato };
  }

  // 1) Cancella riga dal foglio (rowIndex + 1 perche' i fogli sono 1-based)
  sh.deleteRow(rowIndex + 1);

  // 2) Cancella la ScriptProperty con il JSON della bozza
  try {
    PropertiesService.getScriptProperties().deleteProperty(OC_DRAFT_PROP_PFX_ + draftId);
  } catch(e) {
    // Non bloccante: la riga e' gia' stata cancellata, la property potrebbe non esistere
    Logger.log('adminDeleteDigestDraft: deleteProperty non riuscita per ' + draftId + ': ' + e.message);
  }

  // 3) Audit log
  Logger.log('Bozza digest eliminata: id=' + draftId + ' stato=' + stato + ' admin=' + _safeEmail_());

  return { ok:true, id: draftId, stato: stato };
}

/**
 * Prepara automaticamente una bozza digest/newsletter con i contenuti
 * più rilevanti (bandi in scadenza, ultime news, ultimi podcast).
 * Salva la bozza in ScriptProperties e la registra in NewsletterLog.
 *
 * opts: { maxBandi:int, maxNews:int, maxPodcast:int, soggetto:string, filtroAmbito:string }
 */
function adminGenerateDigestDraft(opts) {
  opts = opts || {};
  var tk = opts.token || null;
  if (!_isCurrentUserAdmin_(tk)) return { ok:false, error:'forbidden' };
  return _generateDigestDraftCore_(opts);
}

// v4.24.13 — Core SENZA gate: riusato dal trigger del lunedì (i trigger non hanno
// contesto utente né token). Le funzioni pubbliche sopra/sotto mantengono il gate.
function _generateDigestDraftCore_(opts) {
  opts = opts || {};
  var maxBandi   = opts.maxBandi   || 8;
  var maxNews    = opts.maxNews    || 6;
  var maxPodcast = opts.maxPodcast || 3;
  // v4.25.15 — mix esteso: video e libri configurabili dal pannello redazionale
  var maxVideo   = (opts.maxVideo  === undefined) ? 2 : Number(opts.maxVideo) || 0;
  var maxLibri   = (opts.maxLibri  === undefined) ? 2 : Number(opts.maxLibri) || 0;
  var ambito     = String(opts.filtroAmbito || '').trim();

  // 1) Recupero dati dai data-provider esistenti
  var bandiUrg = _safeCall_(function(){ return getHomepageDataV42(); }, { bandiUrgenti:[], news:[], podcast:[] });
  var bandiNew = _safeCall_(function(){ return getUltimiBandiMonitorati(maxBandi); }, []);
  var video = maxVideo > 0 ? _safeCall_(function(){ return getVideoListV42(maxVideo); }, []) : [];
  var libri = maxLibri > 0 ? _safeCall_(function(){ return getLibriListV42(maxLibri); }, []) : [];

  var news = (bandiUrg && bandiUrg.news) ? bandiUrg.news.slice(0, maxNews) : [];
  var pod  = (bandiUrg && bandiUrg.podcast) ? bandiUrg.podcast.slice(0, maxPodcast) : [];
  var urg  = (bandiUrg && bandiUrg.bandiUrgenti) ? bandiUrg.bandiUrgenti.slice(0, maxBandi) : [];

  // v4.25.15 — EPURAZIONE Lavoro Cultura: i concorsi (tipoBando='lavoro') hanno
  // la loro sezione dedicata e il blocco rotante nel digest — fuori dalle liste bandi
  var _noLavoro = function(b){ return String(b.tipoBando||'') !== 'lavoro'; };
  urg = urg.filter(_noLavoro);
  bandiNew = (bandiNew || []).filter(_noLavoro);

  // Filtro ambito (se richiesto)
  if (ambito) {
    urg      = urg.filter(function(b){ return String(b.ambito||b.ambitoId||'') === ambito; });
    news     = news.filter(function(n){ return String(n.ambito||n.ambitoId||'') === ambito; });
    bandiNew = bandiNew.filter(function(b){ return String(b.ambito||b.ambitoId||'') === ambito; });
  }

  // 2) Oggetto draft
  var now    = new Date();
  var id     = 'DR' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  var author = _safeEmail_();
  var subj   = opts.soggetto ||
               ('Osservatorio Culturale — Digest ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy'));

  var draft = {
    id:        id,
    createdAt: now.toISOString(),
    autore:    author,
    soggetto:  subj,
    filtroAmbito: ambito || 'tutti',
    bandiUrgenti:   urg,
    bandiRecenti:   bandiNew,
    news:           news,
    podcast:        pod,
    video:          video,   // v4.25.15 — mix esteso
    libri:          libri,   // v4.25.15 — mix esteso
    stato:     'bozza'
  };

  // 3) Persist draft in ScriptProperties (compressed JSON)
  PropertiesService.getScriptProperties()
    .setProperty(OC_DRAFT_PROP_PFX_ + id, JSON.stringify(draft));

  // 4) Log riga in NewsletterLog
  var sh = _getOrCreateSheet_(OC_NL_SHEET_, ['ID','Data','Soggetto','Destinatari','Stato','Autore','Token']);
  sh.appendRow([id, now, subj, '', 'bozza', author, '']);

  return {
    ok:       true,
    id:       id,
    soggetto: subj,
    counts: {
      bandiUrgenti: urg.length,
      bandiRecenti: bandiNew.length,
      news:         news.length,
      podcast:      pod.length,
      video:        video.length,
      libri:        libri.length
    }
  };
}

/**
 * Restituisce HTML completo della newsletter a partire dalla bozza.
 */
function adminPreviewNewsletterHtml(draftId, token) {
  if (!_isCurrentUserAdmin_(token)) return { ok:false, error:'forbidden' };
  var draft = _loadDraft_(draftId);
  if (!draft) return { ok:false, error:'draft_not_found' };
  var html = '';
  try {
    html = buildNewsletterHtml_(draft);
  } catch(e) {
    return { ok:false, error:'newsletter_build_failed: ' + e.message };
  }
  return { ok:true, html: html, soggetto: draft.soggetto, id: draft.id };
}

/**
 * Richiede autorizzazione di invio: genera authToken, lo scrive nella riga
 * NewsletterLog, e invia notifica Telegram all'admin con link di approvazione.
 *
 * Il link apre il webapp in modalità "approva" (?approveNl=ID&t=TOKEN)
 * gestito in doGet di Codice.js (vedi handler in Newsletter_approve.js, rename v4.18.39).
 */
function adminRequestSendAuthorization(draftId, token) {
  if (!_isCurrentUserAdmin_(token)) return { ok:false, error:'forbidden' };
  return _requestSendAuthorizationCore_(draftId);
}

// v4.24.13 — Core SENZA gate: riusato dal trigger del lunedì.
function _requestSendAuthorizationCore_(draftId) {
  var draft = _loadDraft_(draftId);
  if (!draft) return { ok:false, error:'draft_not_found' };

  var authToken = _makeToken_();
  draft.authToken = authToken;
  draft.stato     = 'in_attesa_approvazione';
  draft.authRequestedAt = new Date().toISOString();
  PropertiesService.getScriptProperties()
    .setProperty(OC_DRAFT_PROP_PFX_ + draftId, JSON.stringify(draft));

  // Update log row
  _updateLogRow_(draftId, { Stato:'in_attesa_approvazione', Token:authToken });

  // Build approval URL (per uso manuale / copia nel chat)
  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) { webUrl = ''; }
  var approveUrl = webUrl + '?approveNl=' + encodeURIComponent(draftId) + '&t=' + encodeURIComponent(authToken);

  // Invia notifica Telegram (non bloccante: se fallisce, ritorna warning)
  var tg = null;
  try {
    tg = telegramNotifyAuthRequest_({
      draftId:     draftId,
      soggetto:    draft.soggetto,
      autore:      draft.autore,
      approveUrl:  approveUrl,
      counts: {
        bandi:   (draft.bandiUrgenti||[]).length + (draft.bandiRecenti||[]).length,
        news:    (draft.news||[]).length,
        podcast: (draft.podcast||[]).length
      }
    });
  } catch(e) {
    tg = { ok:false, error: e.message };
  }

  return {
    ok:       true,
    draftId:  draftId,
    approveUrl: approveUrl,
    telegram: tg
  };
}

/**
 * Conferma invio newsletter con token (chiamato da link Telegram oppure
 * manualmente). Se il token coincide con quello della bozza, esegue l'invio.
 */
function adminConfirmSendWithToken(draftId, authToken) {
  // v4.24.8 — Rimosso _isCurrentUserAdmin_() senza token: su deploy ANONIMO falliva SEMPRE
  // (Session vuota) e uccideva l'approvazione via link Telegram. L'autorizzazione e' il
  // match dell'authToken segreto per-bozza (verificato sotto), generato da
  // adminRequestSendAuthorization e recapitato solo alla chat Telegram dell'admin.
  var draft = _loadDraft_(draftId);
  if (!draft) return { ok:false, error:'draft_not_found' };
  if (!draft.authToken || draft.authToken !== authToken) {
    return { ok:false, error:'invalid_token' };
  }
  // v4.24.14 — Idempotente: il link puo essere caricato piu volte (prefetch/reload).
  // Se gia inviata: NESSUN nuovo invio, ma ripara lo Storico se rimasto indietro.
  if (draft.stato === 'inviato') {
    try { _updateLogRow_(draftId, { Stato:'inviato', Destinatari: draft.sentTo || 0 }); } catch(_){}
    return { ok:true, alreadySent:true, sent: draft.sentTo || 0, sentAt: draft.sentAt || '' };
  }
  // v4.24.14 — Lock anti doppio-click/doppia-GET concorrente
  if (draft.stato === 'invio_in_corso') {
    return { ok:false, error:'invio_in_corso' };
  }
  draft.stato = 'invio_in_corso';
  try { PropertiesService.getScriptProperties().setProperty(OC_DRAFT_PROP_PFX_ + draftId, JSON.stringify(draft)); } catch(_){}

  var html, res;
  try {
    html = buildNewsletterHtml_(draft);
    res  = sendNewsletterEmail_(draft.soggetto, html);
  } catch(eS) {
    // Invio fallito: sblocca e riporta in attesa (il link resta riutilizzabile)
    draft.stato = 'in_attesa_approvazione';
    try { PropertiesService.getScriptProperties().setProperty(OC_DRAFT_PROP_PFX_ + draftId, JSON.stringify(draft)); } catch(_){}
    return { ok:false, error:'invio_fallito: ' + eS.message };
  }

  // v4.24.14 — Un problema di PERSISTENZA dello stato non deve mai mascherare
  // un invio riuscito: si segnala come warning, non come errore.
  var warn = [];
  draft.stato  = 'inviato';
  draft.sentAt = new Date().toISOString();
  draft.sentTo = res.count || 0;
  try {
    PropertiesService.getScriptProperties().setProperty(OC_DRAFT_PROP_PFX_ + draftId, JSON.stringify(draft));
  } catch(eP) { warn.push('stato bozza non salvato: ' + eP.message); }
  try {
    if (!_updateLogRow_(draftId, { Stato:'inviato', Destinatari: res.count || 0 })) {
      warn.push('riga Storico non trovata (lo Storico potrebbe mostrare lo stato vecchio)');
    }
  } catch(eR) { warn.push('Storico non aggiornato: ' + eR.message); }

  return { ok:true, sent: res.count || 0, errors: res.errors || [], warn: warn };
}

// ============================================================================
// v4.24.13 — AUTOMAZIONE NEWSLETTER LUNEDI 09:00 (con autorizzazione Telegram)
// Ogni lunedì ~09:00: prepara la bozza e invia la RICHIESTA DI AUTORIZZAZIONE
// su Telegram. NESSUN invio automatico ai lettori: l'invio parte solo quando
// l'admin apre il link dal bot e preme "Invia adesso".
// Flag: ScriptProperty OC_NL_LUNEDI_AUTH ('true'/'false') + trigger installato.
// ============================================================================

var OC_NL_AUTO_FLAG_ = 'OC_NL_LUNEDI_AUTH';

/** Handler del trigger (niente gate: i trigger non hanno contesto utente). */
function weeklyNewsletterAuthRequest() {
  // v4.25.14 — SUPERATA dal flusso Redazionale_v1 (creazione ven 18 → revisione →
  // richiesta al superadmin lun 10, con stamp anti-doppio). Se un vecchio trigger
  // la chiama ancora, delega al nuovo flusso invece di rigenerare una bozza fresca
  // (che ignorava le revisioni degli admin). Rimuovere il trigger: redazionaleSetup().
  if (typeof redazionaleLunedi === 'function') return redazionaleLunedi();
  try {
    var gen = _generateDigestDraftCore_({ maxBandi: 8, maxNews: 6, maxPodcast: 3 });
    if (!gen || !gen.ok) {
      Logger.log('[weeklyNewsletterAuthRequest] generazione fallita: ' + ((gen && gen.error) || '?'));
      try { if (typeof sendTelegram === 'function') sendTelegram('⚠️ Newsletter del lunedì: generazione bozza FALLITA (' + ((gen && gen.error) || 'errore') + '). Genera manualmente dalla pagina Digest.'); } catch(_){}
      return { ok:false, error: (gen && gen.error) || 'draft_failed' };
    }
    var req = _requestSendAuthorizationCore_(gen.id);
    Logger.log('[weeklyNewsletterAuthRequest] bozza ' + gen.id + ' -> telegram: ' + JSON.stringify(req && req.telegram));
    return { ok:true, draftId: gen.id, telegram: (req && req.telegram), approveUrl: (req && req.approveUrl) };
  } catch(e) {
    Logger.log('[weeklyNewsletterAuthRequest] ERRORE: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/** Attiva il flag: installa il trigger lunedì 09:00 e RIMUOVE i vecchi invii automatici senza autorizzazione. */
function setupWeeklyNewsletterAuthTrigger(token) {
  if (!_isCurrentUserAdmin_(token)) return { ok:false, error:'forbidden' };
  var removed = [];
  // Rimuove duplicati propri + gli invii automatici del lunedì SENZA autorizzazione (evita doppioni)
  var DA_RIMUOVERE = { weeklyNewsletterAuthRequest:1, lunediMattina:1, sendDigestAuto:1, sendDigestAuto2coorti:1 };
  ScriptApp.getProjectTriggers().forEach(function(t){
    var fn = t.getHandlerFunction();
    if (DA_RIMUOVERE[fn]) { removed.push(fn); ScriptApp.deleteTrigger(t); }
  });
  ScriptApp.newTrigger('weeklyNewsletterAuthRequest')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  PropertiesService.getScriptProperties().setProperty(OC_NL_AUTO_FLAG_, 'true');
  return { ok:true, attivo:true, rimossi: removed,
           nota: 'Ogni lunedì ~09:00 (finestra GAS 9-10): bozza + richiesta autorizzazione su Telegram. Nessun invio senza la tua conferma.' };
}

/** Disattiva il flag: rimuove il trigger. */
function removeWeeklyNewsletterAuthTrigger(token) {
  if (!_isCurrentUserAdmin_(token)) return { ok:false, error:'forbidden' };
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'weeklyNewsletterAuthRequest') { removed++; ScriptApp.deleteTrigger(t); }
  });
  PropertiesService.getScriptProperties().setProperty(OC_NL_AUTO_FLAG_, 'false');
  return { ok:true, attivo:false, rimossi: removed };
}

/** Stato del flag + trigger (per la UI). */
function getWeeklyNewsletterAuthStatus(token) {
  if (!_isCurrentUserAdmin_(token)) return { ok:false, error:'forbidden' };
  var found = false;
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if (t.getHandlerFunction() === 'weeklyNewsletterAuthRequest') found = true;
    });
  } catch(e) { return { ok:false, error: e.message }; }
  return { ok:true, attivo: found,
           flag: PropertiesService.getScriptProperties().getProperty(OC_NL_AUTO_FLAG_) === 'true' };
}

// v4.18.39 (audit 2026-05-14) — Rimosse 2 funzioni morte:
//   • adminGetMailingList()       — duplicato di getMailingList() in Codice.js (sistema attivo)
//   • adminSetMailingListRow(row) — duplicato di saveMailing() in Codice.js
// Il pannello mailing list usa getMailingList/saveMailing/deleteMailing/toggleMailingField
// definiti in Codice.js (riga 2182+).

// ================== PRIVATE HELPERS ==================

function _loadDraft_(id) {
  if (!id) return null;
  var json = PropertiesService.getScriptProperties().getProperty(OC_DRAFT_PROP_PFX_ + id);
  if (!json) return null;
  try { return JSON.parse(json); } catch(e) { return null; }
}

function _updateLogRow_(id, patch) {
  var sh = _getOrCreateSheet_(OC_NL_SHEET_, ['ID','Data','Soggetto','Destinatari','Stato','Autore','Token']);
  var vals = sh.getDataRange().getValues();
  // v4.24.14 FIX — il vecchio match esatto sull'header saltava la scrittura IN SILENZIO
  // se l'intestazione differiva (spazi/maiuscole): l'email partiva ma lo Storico restava
  // su bozza/in_attesa. Ora: match case-insensitive + auto-riparazione (colonna mancante
  // viene aggiunta in coda) + log.
  var header = vals[0].map(function(h){ return String(h || '').trim(); });
  var col = {};
  header.forEach(function(h, idx){ col[h.toLowerCase()] = idx; });
  Object.keys(patch).forEach(function(k){
    if (col[k.toLowerCase()] == null) {
      header.push(k);
      var newIdx = header.length - 1;
      sh.getRange(1, newIdx + 1).setValue(k);
      col[k.toLowerCase()] = newIdx;
      Logger.log('[_updateLogRow_] colonna mancante "' + k + '" aggiunta a ' + OC_NL_SHEET_);
    }
  });
  for (var i = vals.length-1; i >= 1; i--) {
    if (String(vals[i][0]).trim() === String(id).trim()) {
      Object.keys(patch).forEach(function(k){
        sh.getRange(i+1, col[k.toLowerCase()]+1).setValue(patch[k]);
      });
      return true;
    }
  }
  Logger.log('[_updateLogRow_] riga NON trovata per id=' + id);
  return false;
}

function _getOrCreateSheet_(name, headers) {
  // Sprint 1.3 (2026-05-01) FIX: getActive() ritorna null in standalone scripts
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
  if (!ss) throw new Error('Spreadsheet non disponibile (manca SHEET_ID nelle Script Properties)');
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    // Assicura che gli header esistano
    var firstRow = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn() || headers.length)).getValues()[0];
    var empty = firstRow.every(function(c){ return String(c||'').trim() === ''; });
    if (empty) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function _makeToken_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 24);
}

function _safeEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch(e) { return ''; }
}

function _safeCall_(fn, fallback) {
  try { return fn(); } catch(e) { return fallback; }
}

// ============================================================================
// EDITOR CONTENUTI DIGEST — carica/salva bozza per modifica manuale
// ============================================================================

/**
 * Carica la bozza digest corrente per l'editor di contenuti.
 * Ritorna le sezioni con i singoli item (titolo, tipo, incluso).
 * @param {string} token sessione admin
 * @return {Object} {ok, draftId, sezioni:[{nome, items:[{idx, titolo, ente?, tipo, incluso}]}]}
 */
function getDigestDraftForEdit(token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) return { ok: false, error: 'forbidden' };

  // Cerca la bozza redazionale corrente, fallback all'ultima bozza newsletter
  var props = PropertiesService.getScriptProperties();
  var draftId = props.getProperty('OC_RED_WEEK_DRAFT') || '';
  var draft = draftId ? _loadDraft_(draftId) : null;

  // Fallback: cerca l'ultima bozza dal log
  if (!draft) {
    try {
      var sh = _getOrCreateSheet_(OC_NL_SHEET_, ['ID','Data','Soggetto','Destinatari','Stato','Autore','Token']);
      var vals = sh.getDataRange().getValues();
      for (var r = vals.length - 1; r >= 1; r--) {
        var stato = String(vals[r][4] || '').toLowerCase();
        if (stato === 'bozza' || stato === 'in_attesa_approvazione') {
          draftId = String(vals[r][0] || '');
          draft = _loadDraft_(draftId);
          if (draft) break;
        }
      }
    } catch (_) {}
  }

  if (!draft) return { ok: false, error: 'Nessuna bozza digest trovata. Genera prima una bozza (Prepara newsletter o Rigenera mix).' };

  function _mapItems(arr, tipo) {
    return (arr || []).map(function(it, i) {
      return {
        idx: i,
        titolo: String(it.titolo || it.Titolo || '(senza titolo)'),
        ente: String(it.ente || it.Ente || it.fonte || it.Fonte || ''),
        tipo: tipo,
        incluso: true
      };
    });
  }

  var sezioni = [];
  sezioni.push({ nome: 'Bandi in scadenza', key: 'bandiUrgenti', items: _mapItems(draft.bandiUrgenti, 'bando') });
  sezioni.push({ nome: 'Bandi recenti', key: 'bandiRecenti', items: _mapItems(draft.bandiRecenti, 'bando') });
  sezioni.push({ nome: 'News', key: 'news', items: _mapItems(draft.news, 'news') });
  sezioni.push({ nome: 'Podcast', key: 'podcast', items: _mapItems(draft.podcast, 'podcast') });
  sezioni.push({ nome: 'Video', key: 'video', items: _mapItems(draft.video, 'video') });
  sezioni.push({ nome: 'Libri', key: 'libri', items: _mapItems(draft.libri, 'libro') });

  return { ok: true, draftId: draftId, sezioni: sezioni };
}

/**
 * Salva le modifiche manuali alla bozza digest (rimozione/riordino items).
 * @param {string} draftId
 * @param {Object} modifiche {key: [indici_da_mantenere_in_ordine]}
 *   Es: { news: [0,2,1], bandiUrgenti: [0,1], podcast: [] }
 *   Gli indici si riferiscono alle posizioni ORIGINALI; l'ordine nell'array
 *   è il NUOVO ordine desiderato.
 * @param {string} token sessione admin
 * @return {Object} {ok, counts}
 */
function saveDigestDraftEdit(draftId, modifiche, token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) return { ok: false, error: 'forbidden' };
  if (!draftId) return { ok: false, error: 'draftId mancante' };
  var draft = _loadDraft_(draftId);
  if (!draft) return { ok: false, error: 'Bozza ' + draftId + ' non trovata' };

  modifiche = modifiche || {};
  var keys = ['bandiUrgenti', 'bandiRecenti', 'news', 'podcast', 'video', 'libri'];
  keys.forEach(function(k) {
    if (!modifiche.hasOwnProperty(k)) return; // sezione non modificata
    var orig = draft[k] || [];
    var indici = modifiche[k] || [];
    var nuovi = [];
    indici.forEach(function(i) {
      if (i >= 0 && i < orig.length) nuovi.push(orig[i]);
    });
    draft[k] = nuovi;
  });

  PropertiesService.getScriptProperties().setProperty(OC_DRAFT_PROP_PFX_ + draftId, JSON.stringify(draft));

  return {
    ok: true, draftId: draftId,
    counts: {
      bandiUrgenti: (draft.bandiUrgenti || []).length,
      bandiRecenti: (draft.bandiRecenti || []).length,
      news: (draft.news || []).length,
      podcast: (draft.podcast || []).length,
      video: (draft.video || []).length,
      libri: (draft.libri || []).length
    }
  };
}