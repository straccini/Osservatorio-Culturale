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
function adminGetDigestList() {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
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
function adminDeleteDigestDraft(draftId) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
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
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  opts = opts || {};
  var maxBandi   = opts.maxBandi   || 8;
  var maxNews    = opts.maxNews    || 6;
  var maxPodcast = opts.maxPodcast || 3;
  var ambito     = String(opts.filtroAmbito || '').trim();

  // 1) Recupero dati dai data-provider esistenti
  var bandiUrg = _safeCall_(function(){ return getHomepageDataV42(); }, { bandiUrgenti:[], news:[], podcast:[] });
  var bandiNew = _safeCall_(function(){ return getUltimiBandiMonitorati(maxBandi); }, []);

  var news = (bandiUrg && bandiUrg.news) ? bandiUrg.news.slice(0, maxNews) : [];
  var pod  = (bandiUrg && bandiUrg.podcast) ? bandiUrg.podcast.slice(0, maxPodcast) : [];
  var urg  = (bandiUrg && bandiUrg.bandiUrgenti) ? bandiUrg.bandiUrgenti.slice(0, maxBandi) : [];

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
      podcast:      pod.length
    }
  };
}

/**
 * Restituisce HTML completo della newsletter a partire dalla bozza.
 */
function adminPreviewNewsletterHtml(draftId) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
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
function adminRequestSendAuthorization(draftId) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
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
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  var draft = _loadDraft_(draftId);
  if (!draft) return { ok:false, error:'draft_not_found' };
  if (!draft.authToken || draft.authToken !== authToken) {
    return { ok:false, error:'invalid_token' };
  }
  if (draft.stato === 'inviato') {
    return { ok:false, error:'already_sent' };
  }

  var html = buildNewsletterHtml_(draft);
  var res  = sendNewsletterEmail_(draft.soggetto, html);

  draft.stato    = 'inviato';
  draft.sentAt   = new Date().toISOString();
  draft.sentTo   = res.count || 0;
  PropertiesService.getScriptProperties()
    .setProperty(OC_DRAFT_PROP_PFX_ + draftId, JSON.stringify(draft));

  _updateLogRow_(draftId, { Stato:'inviato', Destinatari: res.count || 0 });

  return { ok:true, sent: res.count || 0, errors: res.errors || [] };
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
  var header = vals[0];
  var col = {};
  header.forEach(function(h, idx){ col[h] = idx; });
  for (var i = vals.length-1; i >= 1; i--) {
    if (String(vals[i][0]) === String(id)) {
      Object.keys(patch).forEach(function(k){
        if (col[k] != null) {
          sh.getRange(i+1, col[k]+1).setValue(patch[k]);
        }
      });
      return true;
    }
  }
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