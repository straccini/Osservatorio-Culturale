// v4.22 PERF — Lazy config: PropertiesService lette UNA volta (on-demand), non a parse-time.
// Prima: 8 getProperty() ad ogni esecuzione GAS (anche per funzioni che non le usano).
// Dopo: 1 getProperties() alla prima chiamata, poi cache in-memory.
var _OC_CONFIG_CACHE_ = null;
function _getConfig_() {
  if (_OC_CONFIG_CACHE_) return _OC_CONFIG_CACHE_;
  var p = PropertiesService.getScriptProperties().getProperties();
  _OC_CONFIG_CACHE_ = {
    CLAUDE_API_KEY:   p.CLAUDE_API_KEY || '',
    ADMIN_PWD:        p.ADMIN_PASSWORD || '',
    EDITOR_PWD:       p.EDITOR_PASSWORD || '',
    TELEGRAM_TOKEN:   p.TELEGRAM_TOKEN || p.TELEGRAM_BOT_TOKEN || '',  // v4.23 FIX — unifica le 2 chiavi-token (TELEGRAM_TOKEN / TELEGRAM_BOT_TOKEN) usate dai 2 sottosistemi
    TELEGRAM_CHAT_ID: p.TELEGRAM_CHAT_ID || '',
    GIORNI_ALERT:     parseInt(p.GIORNI_SCADENZA_ALERT || '10'),
    SHEET_ID:         p.SHEET_ID || ''
  };
  return _OC_CONFIG_CACHE_;
}

// Backward-compat: costanti lazy (le vecchie const erano parse-time, ora sono getter)
// Usare _getConfig_().CAMPO nelle nuove funzioni.
var SHEET_ID; // inizializzata sotto dopo getMainSS
try { SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || ''; } catch(_) { SHEET_ID = ''; }
// Le altre costanti legacy diventano funzioni getter per retrocompatibilita
function _claudeKey_()    { return _getConfig_().CLAUDE_API_KEY; }
function _telegramToken_(){ return _getConfig_().TELEGRAM_TOKEN; }
function _telegramChat_() { return _getConfig_().TELEGRAM_CHAT_ID; }
function _giorniAlert_()  { return _getConfig_().GIORNI_ALERT; }

// Backward-compat alias: le vecchie const globali ora sono var lazy
// (le funzioni che le usano le leggono a runtime, non a parse-time)
var CLAUDE_API_KEY, ADMIN_PWD, EDITOR_PWD, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, GIORNI_ALERT;
function _initLegacyConsts_() {
  var c = _getConfig_();
  CLAUDE_API_KEY = c.CLAUDE_API_KEY; ADMIN_PWD = c.ADMIN_PWD; EDITOR_PWD = c.EDITOR_PWD;
  TELEGRAM_TOKEN = c.TELEGRAM_TOKEN; TELEGRAM_CHAT_ID = c.TELEGRAM_CHAT_ID; GIORNI_ALERT = c.GIORNI_ALERT;
}

// v4.22 PERF — Singleton: evita openById ripetuti nella stessa esecuzione GAS
var _mainSS_cached_ = null;
function getMainSS() {
  if (_mainSS_cached_) return _mainSS_cached_;
  if (SHEET_ID) { _mainSS_cached_ = SpreadsheetApp.openById(SHEET_ID); return _mainSS_cached_; }
  try {
    const parents = DriveApp.getFileById(ScriptApp.getScriptId()).getParents();
    if (parents.hasNext()) { _mainSS_cached_ = SpreadsheetApp.open(parents.next()); return _mainSS_cached_; }
  } catch(e) {}
  throw new Error('Aggiungi SHEET_ID nelle Script Properties del progetto');
}

const COL = {
  DATA_RILEVAMENTO: 1, TITOLO: 2, ENTE: 3, LIVELLO: 4, REGIONE: 5,
  SETTORE: 6, SOGGETTI: 7, IMPORTO: 8, COFIN: 9, SCADENZA: 10,
  STATUS: 11, CLIENTE: 12, LINK: 13, NOTE: 14, FONTE: 15,
  PRIORITA: 16, NASCOSTO: 17,
  STATO_RECORD: 18,  // * v3.0: attivo | archiviato
  URL_ENTE:     19,  // * v3.0: homepage ente pubblicante
  LETTO_BANDO:  20,  // * v3.1: true | false (flag lettura bando)
  DESCRIZIONE:  21,  // * v4.27: descrizione testuale arricchita via Claude API
  TIPO_APPALTO: 22,  // * v4.27: servizi|forniture|lavori|misto|finanziamento
};

const SHEET_RADAR = 'RADAR BANDI';

const SH = {
  ITEMS: 'Items', BANDI: 'Bandi', FONTI: 'Fonti',
  MAILING: 'MailingList', LOG: 'DigestLog',
  PODCAST: 'Podcast',     // * v3.2
  LIBRI: 'Pubblicazioni'  // * Sprint N4
};

// Sprint 1.3 (2026-05-01): rinomina ambiti per allineamento Matrix
const AMBITO_LABEL = {
  1:'Identita e narrazione museale', 2:'Inclusione e accessibilita',
  3:'Programma, mostre e collezioni', 4:'Comunita e welfare culturale',
  5:'Digital, AI e governance'
};
const AMBITO_COLOR = { 1:'#6B5C9A', 2:'#3F7A5E', 3:'#3C6A95', 4:'#9C6A36', 5:'#4A7884' };

// Helper escape HTML per output sicuro nei messaggi di errore / pagine login
function escTok_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ============================================================================
// doGet sub-handlers — estratti per ridurre CC (Sprint DRY 2026-05-26)
// ============================================================================

function _doGetLanding() {
  return HtmlService.createHtmlOutputFromFile('LandingPublic')
    .setTitle('Sinopia · Osservatorio Culturale — Piattaforma per Musei e Patrimonio Culturale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width,initial-scale=1');
}

function _doGetSurvey(params) {
  var surveyTemplate = HtmlService.createTemplateFromFile('SurveyPublic');
  surveyTemplate.surveyCode = String(params.survey).trim();
  return surveyTemplate.evaluate()
    .setTitle('Sondaggio MuseMu Matrix — Autovalutazione Musei')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width,initial-scale=1');
}

function _doGetReader(params) {
  if (typeof renderDigestReaderPage === 'function') {
    return renderDigestReaderPage(params.t);
  }
  return HtmlService
    .createHtmlOutput('<h1>Digest Reader</h1><p>Token: ' + escTok_(params.t) + '</p>')
    .setTitle('Osservatorio \xb7 Digest')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet(e) {
  _initLegacyConsts_(); // v4.22 PERF — lazy init delle costanti config
  var params = (e && e.parameter) || {};

  // ---------- 0-warm) Keep-warm self-ping (?warm=1) — vedi KeepWarm_v1.js ----------
  // Causa principale della "pagina bianca" all'avvio: Google deve caricare/compilare
  // il progetto GAS in una nuova istanza V8 (cold start) prima di servire la pagina.
  // Un ping periodico a ?warm=1 tiene calda l'istanza: risposta ultraleggera, NON
  // assembla né trasferisce l'HTML. Non tocca il flusso di caricamento normale.
  if (params.warm) {
    return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
  }

  // v4.19.1 — Bootstrap check: se mancano le dipendenze critiche, pagina di errore
  var _bootErrors = [];
  if (!SHEET_ID) _bootErrors.push('SHEET_ID mancante nelle ScriptProperties');
  if (!CLAUDE_API_KEY) _bootErrors.push('CLAUDE_API_KEY mancante nelle ScriptProperties');
  try { if (typeof OC_MATRIX_SCHEMA === 'undefined' || !OC_MATRIX_SCHEMA) _bootErrors.push('Matrix_schema non caricato'); } catch(_){}
  if (_bootErrors.length > 0) {
    return HtmlService.createHtmlOutput(
      '<h2 style="color:#935851;font-family:sans-serif">Sinopia — Errore di configurazione</h2>'
      + '<p style="font-family:sans-serif">L\'app non puo avviarsi. Problemi rilevati:</p>'
      + '<ul style="font-family:sans-serif">' + _bootErrors.map(function(e){ return '<li>'+e+'</li>'; }).join('') + '</ul>'
      + '<p style="font-family:sans-serif;color:#666">Configura le ScriptProperties nel pannello GAS e rideploya.</p>'
    ).setTitle('Sinopia — Setup richiesto');
  }

  // v4.18.1 (2026-05-11) — Token admin URL: ?adm=TOKEN attiva sessione admin 24h
  if (params.adm) {
    try {
      if (typeof checkAdminSession === 'function') {
        var ok = checkAdminSession(params);
        Logger.log('doGet token admin check: ' + (ok ? 'OK' : 'INVALID'));
      }
    } catch(err) { Logger.log('checkAdminSession err: ' + err.message); }
  }

  // ---------- 0a) Landing pubblica — URL base senza parametri + utente anonimo ----------
  // Su deploy ANYONE: getActiveUser() restituisce l'email (utente loggato)
  // Su deploy ANYONE_ANONYMOUS: getActiveUser() restituisce '' (anonimo)
  var _hasAnyParam = false;
  for (var _pk in params) { if (params.hasOwnProperty(_pk)) { _hasAnyParam = true; break; } }
  // v4.18.66 — Gate landing rimosso: utenti anonimi accedono all'app completa (L0 freemium).
  // Il frontend gestisce le restrizioni L0 (azioni protette richiedono registrazione).
  // LandingPublic.html resta disponibile via ?landing=1 se serve.
  if (params.landing === '1') return _doGetLanding();

  // ---------- 0b) Sondaggio pubblico (?survey=accessibilita) — NO AUTH ----------
  if (params.survey) {
    if (_rateLimited_('survey', 30, 3600)) return HtmlService.createHtmlOutput('<h1>Troppe richieste</h1><p>Riprova tra qualche minuto.</p>');
    try { return _doGetSurvey(params); }
    catch(eSurvey) {
      return HtmlService.createHtmlOutput('<h1>Errore</h1><p>' + String(eSurvey.message) + '</p>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 0c) Sondaggio LS2 diretto (?sondaggio=accessibilita) — inline ----------
  if (params.sondaggio) {
    try {
      var sondTemplate = HtmlService.createTemplateFromFile('Index');
      sondTemplate.sondaggioCodice = String(params.sondaggio).trim();
      return sondTemplate.evaluate()
        .setTitle('Autovalutazione Museale · Osservatorio Culturale Sinopia')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch(eSond) { Logger.log('doGet sondaggio error: ' + eSond.message); }
  }

  // ---------- 1) Flusso Digest Reader (token) ----------
  if (params.reader === '1' && params.t) {
    if (_rateLimited_('reader', 60, 3600)) return HtmlService.createHtmlOutput('<h1>Troppe richieste</h1><p>Riprova tra qualche minuto.</p>');
    try { return _doGetReader(params); }
    catch(err) {
      return HtmlService
        .createHtmlOutput('<h1>Errore</h1><pre>' + escTok_(String(err)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-bis-0a) v4.18.54 — Unsubscribe (?action=unsubscribe&e=...&s=...) ----------
  // Pubblico: NON richiede login (i destinatari delle email non sono autenticati).
  if (params.action === 'unsubscribe') {
    if (_rateLimited_('unsub', 10, 3600)) return HtmlService.createHtmlOutput('<h1>Troppe richieste</h1><p>Riprova tra qualche minuto.</p>');
    try {
      if (typeof _handleUnsubscribe_ === 'function') {
        return HtmlService.createHtmlOutput(_handleUnsubscribe_(params))
          .setTitle('Disiscrizione · Sinopia')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
      return HtmlService.createHtmlOutput('<h1>Servizio non disponibile</h1><p>Funzione unsubscribe non trovata.</p>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(errU) {
      return HtmlService.createHtmlOutput('<h1>Errore</h1><pre>' + escTok_(String(errU)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-bis-NL) v5.1.0 — Conferma newsletter double opt-in (?action=confirmNl&e=...&s=...) ----------
  if (params.action === 'confirmNl' && params.e && params.s) {
    try {
      var confirmResult = _handleConfirmNewsletter(params);
      return HtmlService.createHtmlOutput(confirmResult)
        .setTitle('Conferma iscrizione · Sinopia')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(errC) {
      return HtmlService.createHtmlOutput('<h1>Errore</h1><pre>' + escTok_(String(errC)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-bis-UTM) v4.18.55 — UTM redirect tracker (?utm_target=URL&utm_source=...) ----------
  if (params.utm_target && typeof utm_handleRedirect === 'function') {
    return utm_handleRedirect(e.queryString || '');
  }

  // ---------- 1-bis-0) Manutenzione remota via GET (?maint=KEY&fn=NOME) ----------
  if (params.maint) {
    var _maintKey = '';
    try { _maintKey = PropertiesService.getScriptProperties().getProperty('OC_MAINT_KEY') || ''; } catch(_){}
    if (!_maintKey || params.maint !== _maintKey) {
      return HtmlService.createHtmlOutput('{"error":"Chiave non valida"}').setMimeType(ContentService.MimeType.JSON);
    }
    var ALLOWED_FN = {
      correggiSocialFontiFallite: correggiSocialFontiFallite,
      fetchAndCacheSocialWall:    fetchAndCacheSocialWall,
      pulisciFontiPodcastBloccate: pulisciFontiPodcastBloccate,
      scanPodcastDiretto:         scanPodcastDiretto,
      scanSources:                scanSources,
      setupFontiAgenti:           setupFontiAgenti,
      setupProfiloAgenti:         setupProfiloAgenti,
      seedFontiNormativa:         seedFontiNormativa,
      seedFontiWelfare:           seedFontiWelfare,
      seedFontiDigital:           seedFontiDigital,
      testAgentScan:              testAgentScan,
      apiScanEditoria:            typeof apiScanEditoria === 'function' ? apiScanEditoria : null,
      pubDiscoveryTest:           typeof pubDiscoveryTest === 'function' ? pubDiscoveryTest : null,
      pubDiscoveryScan:           typeof pubDiscoveryScan === 'function' ? pubDiscoveryScan : null,
      pubDiscoveryStatus:         typeof pubDiscoveryStatus === 'function' ? pubDiscoveryStatus : null,
      populaSeedVideoYoutubeMusei: typeof populaSeedVideoYoutubeMusei === 'function' ? populaSeedVideoYoutubeMusei : null
    };
    var fnName = params.fn || '';
    var fn = ALLOWED_FN[fnName];
    if (!fn) {
      return ContentService.createTextOutput(JSON.stringify({error:'Funzione non in whitelist: '+fnName})).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var res = fn();
      return ContentService.createTextOutput(JSON.stringify({ok:true, fn:fnName, result:res})).setMimeType(ContentService.MimeType.JSON);
    } catch(e) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, fn:fnName, error:e.message})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ---------- 1-bis) v4.4 — Autorizzazione invio newsletter via link Telegram ----------
  if (params.approveNl && params.t) {
    try {
      var nlHtml44 = (params.confirm === '1')
        ? _executeApproveNewsletter_(params.approveNl, params.t)
        : _renderApproveNewsletterPage_(params.approveNl, params.t);
      return HtmlService.createHtmlOutput(nlHtml44)
        .setTitle('Approvazione invio — Osservatorio Culturale')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(errNl) {
      return HtmlService
        .createHtmlOutput('<h1>Errore autorizzazione</h1><pre>' + escTok_(String(errNl)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-ter) Gate AUTH RIMOSSO (v5.1.10, 2026-05-29) ----------
  // Il gate server-side e stato rimosso per il modello freemium L0.
  // L'accesso alle funzioni protette e gestito dal frontend (go() gate + _requireLead_)
  // e dai singoli endpoint backend (requireAuth per operazioni sensibili).
  // La pagina renderLoginPage() resta disponibile per usi futuri.

  // ---------- 2) App principale (template con scriptlet) ----------
  var t = HtmlService.createTemplateFromFile('Index');

  var page = t.evaluate()
    .setTitle('Osservatorio Culturale · Sinopia — Bandi, News e Risorse per Musei e Cultura')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  var url = ScriptApp.getService().getUrl();

  // v4.18.7 (2026-05-11) — Iniezione server-side del token admin nel HTML.
  // Google sandbox strappa ?adm= dal location.search del frontend, quindi
  // il token deve essere passato via variabile JS server-side validata.
  var injectedToken = '';
  try {
    var rawTok = (params && params.adm) ? String(params.adm).trim() : '';
    if (rawTok && typeof _validateAdminToken_ === 'function' && _validateAdminToken_(rawTok)) {
      injectedToken = rawTok;
    }
  } catch(injErr) {}

  // v4.18.46 (2026-05-15) — Iniezione token sessione utente (magic-link ?t=TOKEN).
  // Se valido, frontend si comporta come "Lead identificato" (livello 1); altrimenti anonimo (livello 0).
  var injectedSession = '{}';
  try {
    var sessTok = (params && params.t && !params.reader && !params.approveNl) ? String(params.t).trim() : '';
    if (sessTok && typeof validaSessione === 'function') {
      var sessInfo = validaSessione(sessTok);
      if (sessInfo && sessInfo.ok && sessInfo.valid) {
        // v4.22 — Determina se l'utente è già attivo (no GDPR overlay per utenti esistenti)
        var _userAlreadyActive = false;
        try {
          if (typeof getUtenteByEmail_ === 'function') {
            var _ut = getUtenteByEmail_(sessInfo.email);
            _userAlreadyActive = !!(_ut && _ut.stato === 'attivo');
          }
        } catch(_){}
        injectedSession = JSON.stringify({
          token: sessTok,
          email: sessInfo.email || '',
          livello: sessInfo.livello || 1,
          permanente: !!sessInfo.permanente,
          giorniResidui: sessInfo.giorniResidui,
          scaduta: !!sessInfo.scaduta,
          readOnly: !!sessInfo.readOnly,
          matrixCompletato: !!sessInfo.matrixCompletato,
          alreadyActive: _userAlreadyActive
        });
      }
    }
  } catch(injErr) { Logger.log('inject sessione fallita: ' + injErr.message); }

  var rawHtml = page.getContent();
  // v4.20 — Debug: verifica che i placeholder esistano nel HTML renderizzato
  var hasAdmPlaceholder = rawHtml.indexOf('OC_ADMIN_TOKEN_PLACEHOLDER') >= 0;
  var hasUrlPlaceholder = rawHtml.indexOf('GAS_URL_PLACEHOLDER') >= 0;
  Logger.log('[doGet] Placeholder check: ADM=' + hasAdmPlaceholder + ' URL=' + hasUrlPlaceholder + ' injectedToken=' + (injectedToken ? injectedToken.substring(0,6)+'...' : 'EMPTY'));

  var html = rawHtml
    .replace(/GAS_URL_PLACEHOLDER/g, url)
    .replace(/OC_ADMIN_TOKEN_PLACEHOLDER/g, injectedToken)
    .replace(/OC_SESSION_PLACEHOLDER/g, injectedSession);

  return HtmlService.createHtmlOutput(html)
    .setTitle('Osservatorio Culturale · Sinopia — Bandi, News e Risorse per Musei e Cultura')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Sprint 1.4 (2026-05-01) — Render pagina di login/richiesta accesso.
 * Stile "Direzione B · Bianca Editoriale" (Claude Design).
 */
function renderLoginPage(auth) {
  auth = auth || { email: '', stato: 'not_logged' };
  var emailDetected = auth.email || '';
  var stato = auth.stato || 'not_logged';
  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) {}
  var statusMsg = ''; var statusType = '';
  if (stato === 'pending') { statusMsg = 'Richiesta in attesa di approvazione. Riceverai una email quando approvata.'; statusType = 'warn'; }
  else if (stato === 'sospeso') { statusMsg = 'Account sospeso. Per riattivarlo scrivi a sinopiaconsulting@gmail.com.'; statusType = 'error'; }
  else if (stato === 'rifiutato') { statusMsg = 'Richiesta non approvata. Per informazioni scrivi a sinopiaconsulting@gmail.com.'; statusType = 'error'; }

  return ''
+ '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
+ '<title>Accesso · Osservatorio Culturale</title>'
+ '<meta name="viewport" content="width=device-width, initial-scale=1">'
+ '<link rel="preconnect" href="https://fonts.googleapis.com">'
+ '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
+ '<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
+ '<style>'
+ ':root{--b-bg:#FAF8F4;--b-ink:#1A1815;--b-mute:#6E6A62;--b-line:#E5E1D8;--b-soft:#F3F0E9;--b-red:#7A2A1A;--b-surface:#FFFFFF;}'
+ '*{margin:0;padding:0;box-sizing:border-box}'
+ 'html,body{background:var(--b-bg);color:var(--b-ink);font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}'
+ '.b-page{min-height:100vh;display:flex;flex-direction:column}'
+ '.b-nav{padding:20px 36px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--b-line)}'
+ '.b-logo{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:20px;letter-spacing:-0.01em;color:var(--b-red)}'
+ '.b-logo-tag{font-size:9px;font-weight:500;color:var(--b-ink);letter-spacing:0.22em;text-transform:uppercase;margin-left:4px}'
+ '.b-nav-meta{font-family:"Inter",sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--b-mute);font-weight:600}'
+ '.b-grid{flex:1;display:grid;grid-template-columns:1fr 1.1fr;min-height:calc(100vh - 65px)}'
+ '@media (max-width:900px){.b-grid{grid-template-columns:1fr}}'
+ '.b-left{padding:56px 64px 48px;display:flex;flex-direction:column;justify-content:center;border-right:1px solid var(--b-line)}'
+ '@media (max-width:900px){.b-left{padding:32px 28px;border-right:none;border-bottom:1px solid var(--b-line)}}'
+ '.b-eyebrow{font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--b-red);font-family:"Inter",sans-serif}'
+ '.b-h1{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-size:54px;line-height:1.0;letter-spacing:-0.02em;font-weight:400;margin:14px 0 8px;color:var(--b-ink)}'
+ '@media (max-width:900px){.b-h1{font-size:38px}}'
+ '.b-h1 em{color:var(--b-red);font-style:italic;font-weight:500}'
+ '.b-lead{font-size:14px;color:var(--b-mute);line-height:1.5;margin:0 0 32px;max-width:420px}'
+ '.b-status{padding:12px 16px;background:var(--b-soft);border-left:3px solid var(--b-ink);font-size:13px;line-height:1.5;margin-bottom:24px;color:var(--b-ink)}'
+ '.b-status.warn{border-left-color:#B8902A}.b-status.error{border-left-color:var(--b-red)}'
+ '.b-email-box{padding:12px 16px;background:var(--b-soft);border:1px solid var(--b-line);border-left:3px solid var(--b-red);font-size:13px;color:var(--b-ink);margin-bottom:18px;font-family:"Inter",sans-serif;line-height:1.5}'
+ '.b-google-btn{display:flex;align-items:center;justify-content:center;gap:12px;background:var(--b-ink);color:#fff;border:none;padding:18px 22px;font-family:inherit;font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;width:100%;cursor:pointer;text-decoration:none;transition:background .15s}'
+ '.b-google-btn:hover{background:#000}'
+ '.b-google-btn .b-arrow{margin-left:auto;font-size:18px}'
+ '.b-divider{display:flex;align-items:center;gap:14px;margin:26px 0 18px;color:var(--b-mute);font-family:"Inter",sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600}'
+ '.b-divider-line{flex:1;height:1px;background:var(--b-line)}'
+ '.b-signup-cta{margin-top:28px;font-size:13px;color:var(--b-ink)}'
+ '.b-signup-cta a{color:var(--b-red);font-weight:600;border-bottom:1px solid var(--b-red);text-decoration:none;padding-bottom:1px;cursor:pointer}'
+ '.b-form{margin-top:18px;display:none}.b-form.show{display:block}'
+ '.b-field{margin-bottom:16px}'
+ '.b-field-label{font-family:"Inter",sans-serif;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:var(--b-mute);margin-bottom:6px}'
+ '.b-field input,.b-field textarea{width:100%;border:none;border-bottom:2px solid var(--b-ink);padding:10px 2px;font-family:inherit;font-size:16px;color:var(--b-ink);background:transparent;outline:none;resize:none}'
+ '.b-field input:focus,.b-field textarea:focus{border-bottom-color:var(--b-red)}'
+ '.b-field input::placeholder,.b-field textarea::placeholder{color:var(--b-mute);font-weight:400}'
+ '.b-row{display:flex;gap:12px;margin-top:18px}'
+ '.b-btn-primary{flex:1;background:var(--b-ink);color:#fff;border:none;padding:14px 20px;font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;display:flex;justify-content:space-between;align-items:center}'
+ '.b-btn-primary:hover{background:#000}'
+ '.b-btn-secondary{background:transparent;color:var(--b-ink);border:1px solid var(--b-ink);padding:14px 20px;font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer}'
+ '.b-result{margin-top:14px;font-size:13px;min-height:18px}'
+ '.b-right{background:var(--b-soft);padding:48px 56px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}'
+ '@media (max-width:900px){.b-right{padding:32px 28px}}'
+ '.b-circle-1{position:absolute;right:-120px;top:-120px;width:480px;height:480px;border-radius:50%;background:var(--b-red);opacity:0.08;pointer-events:none}'
+ '.b-circle-2{position:absolute;right:-40px;top:-40px;width:320px;height:320px;border-radius:50%;border:1.5px solid var(--b-red);opacity:0.25;pointer-events:none}'
+ '.b-circle-3{position:absolute;right:60px;top:60px;width:180px;height:180px;border-radius:50%;border:1.5px solid var(--b-red);opacity:0.4;pointer-events:none}'
+ '.b-right-content{position:relative;z-index:1}'
+ '.b-right-eyebrow{font-family:"Inter",sans-serif;font-size:10px;color:var(--b-red);letter-spacing:0.18em;text-transform:uppercase;font-weight:600}'
+ '.b-right-h2{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-size:42px;line-height:1.05;letter-spacing:-0.02em;font-weight:400;margin:14px 0 10px;max-width:460px;color:var(--b-ink)}'
+ '@media (max-width:900px){.b-right-h2{font-size:30px}}'
+ '.b-right-h2 em{color:var(--b-red);font-weight:500}'
+ '.b-right-lead{font-size:14px;color:var(--b-mute);line-height:1.55;max-width:460px;margin:0}'
+ '.b-features{position:relative;display:flex;flex-direction:column;gap:14px;z-index:1;margin-top:32px}'
+ '.b-features-title{font-family:"Inter",sans-serif;font-size:10px;color:var(--b-ink);letter-spacing:0.18em;text-transform:uppercase;font-weight:600}'
+ '.b-feature{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:baseline;padding-top:12px;border-top:1px solid var(--b-line)}'
+ '.b-feature-num{font-family:"Inter",sans-serif;font-size:12px;color:var(--b-red);font-weight:600}'
+ '.b-feature-title{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-size:19px;line-height:1.2;letter-spacing:-0.01em;font-weight:500;color:var(--b-ink)}'
+ '.b-feature-desc{font-size:12.5px;color:var(--b-mute);margin-top:2px}'
+ '.b-footer{padding:14px 36px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--b-line);font-family:"Inter",sans-serif;font-size:10px;letter-spacing:0.1em;color:var(--b-mute);font-weight:600;text-transform:uppercase}'
+ '@media (max-width:900px){.b-footer{flex-direction:column;gap:6px;font-size:9px}}'
+ '</style></head><body>'
+ '<div class="b-page">'
+ '<div class="b-nav">'
+ '<div class="b-logo">'
+   '<svg width="22" height="22" viewBox="0 0 32 32" style="vertical-align:middle;margin-right:2px"><circle cx="14" cy="14" r="11" fill="none" stroke="#C8102E" stroke-width="3"/><circle cx="14" cy="14" r="4" fill="#C8102E"/><line x1="22.5" y1="22.5" x2="29" y2="29" stroke="#C8102E" stroke-width="3" stroke-linecap="round"/></svg>'
+   '<span>sservatorio</span><span class="b-logo-tag">Culturale</span>'
+ '</div>'
+ '<div class="b-nav-meta">DUEMILAMUSEI · v4.9.0</div>'
+ '</div>'
+ '<div class="b-grid">'
+ '<div class="b-left">'
+ '<div class="b-eyebrow">Area riservata</div>'
+ '<h1 class="b-h1">Accedi <em>all\'osservatorio.</em></h1>'
+ '<p class="b-lead">Profilo dell\'istituzione, risultati del test MuseMu Matrix, bandi pertinenti, archivio personale. Una sola identita per tutto l\'osservatorio.</p>'
+ (statusMsg ? '<div class="b-status ' + statusType + '">' + statusMsg + '</div>' : '')
+ (emailDetected
    ? '<div class="b-email-box">Account Google rilevato: ' + escTok_(emailDetected) + ' &mdash; non risulta autorizzato. Compila il form qui sotto per richiedere accesso.</div>'
    : '<div class="b-email-box" style="background:#FFF8E7;border-color:#F0D78C;color:#7A5A00">Per accedere all\'area riservata compila il form di richiesta accesso. L\'amministratore approvera la tua richiesta entro 24h e riceverai una email di conferma.</div>')
+ ((stato === 'pending' || stato === 'sospeso' || stato === 'rifiutato')
    ? '<a href="' + webUrl + '" class="b-google-btn"><span>Riprova accesso</span><span class="b-arrow">&rarr;</span></a>'
    : (
    '<div class="b-form show" id="requestForm">'
  + '<div class="b-field"><div class="b-field-label">Nome e cognome</div><input type="text" id="reqNome" placeholder="es. Anna Ricci" /></div>'
  + '<div class="b-field"><div class="b-field-label">Email istituzionale</div><input type="email" id="reqEmail" value="' + escTok_(emailDetected) + '" placeholder="direzione@museo.it" /></div>'
  + '<div class="b-field"><div class="b-field-label">Istituzione e ruolo</div><textarea id="reqMotivo" rows="3" placeholder="Es. Direttore Museo Civico di Pesaro / Conservatore Pinacoteca / Responsabile didattica..."></textarea></div>'
  + '<div class="b-row">'
  + '<button class="b-btn-primary" onclick="submitAccessRequest()"><span>Invia richiesta accesso</span><span>&rarr;</span></button>'
  + '</div>'
  + '<div class="b-result" id="requestResult"></div>'
  + '</div>'
  ))
+ '</div>'
+ '<div class="b-right">'
+ '<div class="b-circle-1"></div><div class="b-circle-2"></div><div class="b-circle-3"></div>'
+ '<div class="b-right-content">'
+   '<div class="b-right-eyebrow">Lettura del giorno</div>'
+   '<h2 class="b-right-h2">Dieci dimensioni, una sola lente: per leggere l\'<em>identita culturale</em> di un\'istituzione.</h2>'
+   '<p class="b-right-lead">Il framework MuseMu Matrix dell\'Osservatorio Culturale Sinopia. Riservato agli iscritti.</p>'
+ '</div>'
+ '<div class="b-features">'
+   '<div class="b-features-title">Cosa trovi nell\'area riservata</div>'
+   '<div class="b-feature"><span class="b-feature-num">01</span><div><div class="b-feature-title">Test e dashboard</div><div class="b-feature-desc">Profilo dell\'istituzione su 10 dimensioni MuseMu Matrix.</div></div></div>'
+   '<div class="b-feature"><span class="b-feature-num">02</span><div><div class="b-feature-title">Bandi salvati</div><div class="b-feature-desc">Radar personalizzato sulle dimensioni deboli.</div></div></div>'
+   '<div class="b-feature"><span class="b-feature-num">03</span><div><div class="b-feature-title">Archivio letture</div><div class="b-feature-desc">News, podcast, video segnalati per te.</div></div></div>'
+ '</div>'
+ '</div>'
+ '</div>'
+ '<div class="b-footer">'
+ '<span>OSSERVATORIO CULTURALE · AREA RISERVATA</span>'
+ '<span>SSL · GDPR · ITA-IT · DUEMILAMUSEI 1988</span>'
+ '</div>'
+ '</div>'
+ '<script>'
+ 'var WEB_URL=' + JSON.stringify(webUrl) + ';'
+ 'function submitAccessRequest(){'
+ '  var nome=(document.getElementById("reqNome")||{}).value||"";'
+ '  var email=(document.getElementById("reqEmail")||{}).value||"";'
+ '  var motivo=(document.getElementById("reqMotivo")||{}).value||"";'
+ '  var out=document.getElementById("requestResult");'
+ '  if(!email.trim()){ out.innerHTML="<span style=\\"color:#C8102E\\">Email obbligatoria.</span>"; return; }'
+ '  out.innerHTML="<span style=\\"color:#6F6F6F\\">Invio in corso...</span>";'
+ '  google.script.run'
+ '    .withSuccessHandler(function(r){'
+ '      if(r&&r.ok){'
+ '        if(r.alreadyActive && r.email){'
+ '          var entraUrl = WEB_URL + (WEB_URL.indexOf("?")>=0 ? "&" : "?") + "accessAs=" + encodeURIComponent(r.email);'
+ '          out.innerHTML = "<div style=\\"color:#0F6E56;margin-bottom:10px\\">"+(r.message||"OK")+"</div>"'
+ '            + "<a href=\\""+entraUrl+"\\" class=\\"b-google-btn\\" style=\\"text-decoration:none;display:inline-flex;padding:14px 24px\\"><span>ENTRA NELL\\u0027OSSERVATORIO</span><span class=\\"b-arrow\\" style=\\"margin-left:14px\\">&rarr;</span></a>";'
+ '        } else { out.innerHTML="<span style=\\"color:#0F6E56\\">"+(r.message||"OK")+"</span>"; }'
+ '      }'
+ '      else{ out.innerHTML="<span style=\\"color:#C8102E\\">Errore: "+((r&&r.error)||"sconosciuto")+"</span>"; }'
+ '    })'
+ '    .withFailureHandler(function(e){ out.innerHTML="<span style=\\"color:#C8102E\\">Errore di rete: "+e+"</span>"; })'
+ '    .requestAccess({email:email.trim(),nome:nome.trim(),motivo:motivo.trim()});'
+ '}'
+ '</script>'
+ '</body></html>';
}

/**
 * Sprint 2 (2026-04-30): helper per includere file HTML in template.
 * Usato in Index.html come <?!= include('MatrixApp'); ?> per montare il modulo
 * questionario MuseMu Matrix come componente separato.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function _serveDigestReader(token) {
  try {
    var data = _getDigestByToken(token);
    var page = HtmlService.createHtmlOutputFromFile('DigestReader');
    var html = page.getContent()
      .replace('READER_DATA_PLACEHOLDER', JSON.stringify(data))
      .replace('GAS_URL_PLACEHOLDER', ScriptApp.getService().getUrl());
    page.setContent(html);
    page.setTitle('Digest Osservatorio Culturale - ' + (data.destinatario || ''));
    page.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    page.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return page;
  } catch(e) {
    Logger.log('_serveDigestReader error: ' + e.message);
    var motivo = e.message || 'Errore sconosciuto';
    var errHtml = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link non valido</title>'
      + '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8f7f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}'
      + '.box{background:#fff;border-radius:16px;padding:36px 32px;max-width:460px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}'
      + '.ico{font-size:48px;margin-bottom:16px}'
      + 'h2{color:#A32D2D;font-size:20px;margin-bottom:10px}'
      + 'p{color:#5a5a5a;font-size:14px;line-height:1.6;margin-bottom:20px}'
      + '.detail{font-size:12px;color:#aaa;background:#f4f2ed;border-radius:8px;padding:10px 14px;margin-bottom:20px;text-align:left}'
      + 'a.btn{display:inline-block;background:#0F2744;color:#fff;text-decoration:none;padding:11px 24px;border-radius:9px;font-size:14px;font-weight:600}'
      + '</style></head><body>'
      + '<div class="box">'
      + '<div class="ico">&#128279;</div>'
      + '<h2>Link non accessibile</h2>'
      + '<p>Il link del tuo digest personale non è più valido. I link hanno una durata di <strong>30 giorni</strong> e vengono rigenerati ad ogni nuovo invio.</p>'
      + '<div class="detail">Motivo tecnico: ' + motivo + '</div>'
      + '<a class="btn" href="mailto:sinopiaconsulting@gmail.com">Richiedi un nuovo digest</a>'
      + '</div></body></html>';
    var err = HtmlService.createHtmlOutput(errHtml);
    err.setTitle('Link non valido — Osservatorio Culturale');
    err.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return err;
  }
}

/**
 * v4.19.1 — Sanitizza valore utente prima di scrivere in cella Google Sheets.
 * Previene CSV injection: celle che iniziano con = + @ - vengono prefissate con apice singolo.
 * @param {*} val — valore da sanitizzare
 * @return {string}
 */
function _sanitizeForCell_(val) {
  var s = String(val == null ? '' : val);
  if (/^[=+@\-]/.test(s)) return "'" + s;
  return s;
}

/**
 * v4.19.1 — Rate limiter semplice via CacheService. Max N richieste per chiave in finestra T secondi.
 * @return {boolean} true se il rate limit è superato (= bloccare la richiesta)
 */
function _rateLimited_(key, maxPerWindow, windowSec) {
  try {
    var cache = CacheService.getScriptCache();
    var ck = 'rl_' + key;
    var count = parseInt(cache.get(ck) || '0');
    if (count >= maxPerWindow) return true;
    cache.put(ck, String(count + 1), windowSec || 60);
    return false;
  } catch(_) { return false; }
}

function doPost(e) {
  _initLegacyConsts_(); // v4.22 PERF — lazy init
  try {
    const body = JSON.parse(e.postData.contents);
    const token = body.token || '';
    const role = authenticate(token);
    if (body.action !== 'login' && !role) return jsonOk({ error: 'Non autorizzato' });

    switch (body.action) {
      case 'login': return jsonOk(role ? { ok:true, role } : { error:'Password errata' });

      // Read
      case 'getItems':        return jsonOk(getItems(body));
      case 'getBandi':        return jsonOk(getBandi());
      case 'getFonti':        return jsonOk(getFonti());
      case 'getStats':        return jsonOk(getStats());
      case 'getHomepageData': return jsonOk(getHomepageData());
      case 'getMailing':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(_getMailingListData_()); // v4.23: doPost già gated per ruolo
      case 'getDigestLog':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(getDigestLog());

      // Items — write di contenuto globale: editor o admin
      case 'editSommario':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(editSommario(body));
      case 'toggleSaved':     return jsonOk(toggleItemField(body.id,'Salvato'));       // personale
      case 'toggleArchived':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleItemField(body.id,'Archiviato'));
      case 'toggleDigest':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleItemField(body.id,'InclusiNelDigest'));
      case 'markRead':        return jsonOk(setItemField(body.id,'Letto',true));       // personale
      case 'deleteItem':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(_deleteRowById(getMainSS().getSheetByName(SH.ITEMS),body.id));
      case 'deleteItems':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteItemsBulk(body.ids||[]));

      // Mailing
      case 'saveMailing':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(saveMailing(body));
      case 'deleteMailing':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteMailing(body.id));
      case 'toggleMailingActive':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleMailingField(body.id,'Attivo'));

      // Email
      case 'sendDigestNow':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(sendDigest(body.itemIds||null));
      case 'previewDigest':
        return jsonOk({ html: buildDigestHTML(getItemsByIds(body.itemIds)) });

      // Radar Bandi CRUD
      case 'getBandiRadar':        return jsonOk(getBandiRadar());
      case 'diagBandiSheet':       return jsonOk(diagBandiSheet());
      case 'saveBandoRadar':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(saveBandoRadar(body));
      case 'updateBandoRadar':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(updateBandoRadar(body));
      case 'toggleNascostoRadar':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleNascostoRadar(body.id,body.nascosto));
      case 'deleteBandoRadar':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteBandoRadar(body.id));
      case 'testTelegramRadar':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(sendTestTelegram());

      // * Archivio Bandi v3.0
      case 'toggleLettoBando': return jsonOk(toggleLettoBando(body));          // personale
      case 'archiviaRecord':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(archiviaRecord(body));
      case 'ripristinaRecord':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(ripristinaRecord(body));
      case 'deleteArchiviato':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteArchiviato(body));
      case 'deleteArchivioBulk':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteArchivioBulk(body.ids||[]));
      case 'deleteArchivioTutto':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteArchivioTutto());

      // Scanner
      case 'runScanner':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk({ ok:true, added: scanSources() });
      case 'runPodScanner':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        try { const added=scanPodcast(); return jsonOk({ok:true, added}); }
        catch(e) { return jsonOk({error:e.message}); }

      // Fonti
      case 'toggleFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleFonteField(body.id,'Attiva'));
      case 'addFonteArticoli':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addFonteArticoli(body));
      case 'deleteFonteArticoli':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteFonteArticoli(body.id));
      case 'getFontiBandi':    return jsonOk(getFontiBandi());
      case 'addFonteBandi':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addFonteBandi(body));
      case 'deleteFonteBandi':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteFonteBandiById(body.id));
      case 'toggleFonteBandi':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleFonteBandiField(body.id,'Attiva'));

      // Social Wall
      case 'getSocialWall':    return jsonOk(getSocialWall());
      case 'refreshSocialWall':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(fetchAndCacheSocialWall());
      case 'getSocialFonti':   return jsonOk(getSocialFontiList());
      case 'addSocialFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addSocialFonte(body));
      case 'deleteSocialFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteSocialFonteById(body.id));
      case 'toggleSocialFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleSocialFonteField(body.id,'Attiva'));

      // * PODCAST v3.2
      case 'getPodcasts':     return jsonOk(getPodcasts(body));
      case 'savePodcast':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(savePodcast(body));
      case 'togglePodField':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(togglePodField(body));
      case 'deletePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deletePodcast(body.id));

      // Fonti Podcast
      case 'getFontiPodcast':   return jsonOk(getFontiPodcast());
      case 'addFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addFontePodcast(body));
      case 'deleteFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteFontePodcastById(body.id));
      case 'toggleFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleFontePodcastField(body.id,'Attiva'));
      case 'scanFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(scanSingolaFontePodcast(body.id));

      // Libri / Pubblicazioni (Sprint N4)
      case 'addLibro':
        if (role!=='admin' && role!=='editor') return jsonOk({error:'Accesso negato'});
        return jsonOk(addLibro(body));
      case 'getLibriList':
        return jsonOk(getLibriList(body));
      case 'setupPubblicazioniSheet':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(setupPubblicazioniSheet());

      // GDPR — Right to be forgotten (richiede autenticazione)
      case 'forgetMyData':
        return jsonOk(forgetMyData(body.identifier || '', token));

      // Gestione dati
      case 'getGestioneStats':  return jsonOk(getGestioneStats());
      case 'archiviaOlderThan':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(archiviaNotizieOlderThan(body.giorni||30));
      case 'eliminaArchiviatiTutti':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(eliminaArchiviatiTutti());

      // Digest Reader pubblico (token-based, no auth richiesta)
      case 'getDigestByToken': return jsonOk(getDigestByTokenPublic(body.token||''));

      // Manutenzione remota (chiave segreta, senza login utente)
      case 'runMaintenance': {
        // v4.19.1 — Rate limit: max 5 tentativi manutenzione per minuto
        if (_rateLimited_('maint', 5, 60)) return jsonOk({ error: 'Troppi tentativi. Riprova tra un minuto.' });
        var MAINT_KEY = PropertiesService.getScriptProperties().getProperty('OC_MAINT_KEY') || '';
        if (!MAINT_KEY || body.key !== MAINT_KEY) return jsonOk({ error: 'Chiave non valida' });
        const ALLOWED = {
          correggiSocialFontiFallite: correggiSocialFontiFallite,
          fetchAndCacheSocialWall:    fetchAndCacheSocialWall,
          pulisciFontiPodcastBloccate: pulisciFontiPodcastBloccate,
          scanPodcastDiretto:         scanPodcastDiretto,
          scanSources:                scanSources
        };
        const fn = ALLOWED[body.fn];
        if (!fn) return jsonOk({ error: 'Funzione non in whitelist: ' + body.fn });
        try {
          const result = fn();
          return jsonOk({ ok: true, fn: body.fn, result: result });
        } catch(e) {
          return jsonOk({ ok: false, fn: body.fn, error: e.message });
        }
      }

      default: return jsonOk({ error:'Azione non riconosciuta' });
    }
  } catch(err) {
    Logger.log('doPost error: ' + (err && err.message) + '\n' + (err && err.stack));
    return jsonOk({ error: 'Errore interno del server' });
  }
}

// ==================================================================
// FONTI PODCAST — ESTRATTE in PodcastManager.js (v4.27.33)
// ==================================================================
// Le seguenti funzioni sono ora in PodcastManager.js:
// _getFontiPodSheet, getFontiPodcast, addFontePodcast, deleteFontePodcastById,
// toggleFontePodcastField, scanSingolaFontePodcast, _scanSingolaFontePodcastRSS,
// _youtubeChannelToFeedUrl, addFonteVideoYoutube, _ensureFontiPodTipoContenuto_,
// populaSeedVideoYoutubeMusei, seedFontiPodcastRSS, pulisciFontiPodcastBloccate,
// seedFontiPodcastV2
// getPodcastSheet, getPodcasts, savePodcast, togglePodField, deletePodcast
// ==================================================================

// [ELIMINATO: blocco fonti podcast 420 righe — ora in PodcastManager.js]

// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
function authenticate(token) {
  if (!token) return null;
  // Autenticazione classica tramite password nelle Script Properties
  if (token === ADMIN_PWD)  return 'admin';
  if (token === EDITOR_PWD) return 'editor';
  // FIX v4.3: autenticazione via email — pw = email
  // L'utente invia la propria email come token; viene verificata nella MailingList
  try {
    const emailNorm = token.toLowerCase().trim();
    // Formato email minimo
    if (!emailNorm.includes('@') || emailNorm.length < 5) return null;
    const list = _getMailingListData_().list; // v4.23: usa interna (getMailingList ora gated)
    const user = list.find(function(m) {
      return m.Email && m.Email.toLowerCase().trim() === emailNorm
             && (m.Attivo === true || m.Attivo === 'TRUE' || m.Attivo === 1);
    });
    if (user) {
      Logger.log('authenticate: accesso email per ' + emailNorm + ' ruolo=' + (user.Ruolo||'lettore'));
      return user.Ruolo || 'lettore';
    }
  } catch(e) {
    Logger.log('authenticate: errore verifica email: ' + e.message);
  }
  return null;
}

function jsonOk(data) {
  const out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// v4.22 — Moved to StatsManager.js: getStats (with double-read fix)

// ==================================================================
// HOMEPAGE DATA (* nuovo v3.0)
// ==================================================================

function getHomepageData() {
  try {
    // * NON chiama getBandiRadar() - il frontend ha gia RB_ALL caricato
    // Solo conta bandi attivi velocemente dal foglio senza costruire oggetti
    const bandiNuovi = [];
    try {
      const shR = getSheetRadar();
      if (shR && shR.getLastRow() > 1) {
        const hdr = shR.getRange(1,1,1,shR.getLastColumn()).getValues()[0];
        const titI = hdr.indexOf('TITOLO'), stI = hdr.indexOf('STATUS'), srI = hdr.indexOf('StatoRecord');
        const rows = shR.getRange(2,1,shR.getLastRow()-1,shR.getLastColumn()).getValues();
        rows.forEach(r => {
          if (!r[titI]) return;
          const sr = String(r[srI]||'').toLowerCase();
          if (sr === 'archiviato') return;
          if (String(r[stI]) === 'Nuovo') bandiNuovi.push({titolo:String(r[titI])});
        });
      }
    } catch(e2) {}

    const ultimaScansione = getUltimaScansione();

    const notizieNuove = [];
    try {
      const sh = getMainSS().getSheetByName(SH.ITEMS);
      if (sh) {
        const rows=sh.getDataRange().getValues(), h=rows[0];
        const lettoI=h.indexOf('Letto'), archI=h.indexOf('Archiviato'),
              titI=h.indexOf('Titolo'), fonteI=h.indexOf('Fonte'),
              urlI=h.indexOf('FonteURL'), dataI=h.indexOf('DataAcquisizione');
        const cutoff=new Date(Date.now()-7*86400000);
        for (let i=1;i<rows.length&&notizieNuove.length<6;i++) {
          const r=rows[i]; if(!r[0]||r[archI]) continue;
          const d=r[dataI] instanceof Date?r[dataI]:new Date(r[dataI]);
          if(isNaN(d)||d<cutoff||r[lettoI]) continue;
          notizieNuove.push({
            titolo:String(r[titI]||''), fonte:String(r[fonteI]||''),
            url:String(r[urlI]||''), data:formatDate(d)
          });
        }
      }
    } catch(e2) {}

    // Podcast nuovi (non ascoltati, ultima settimana)
    let podcastNuovi = 0;
    try {
      const podSh = getPodcastSheet();
      if (podSh && podSh.getLastRow() > 1) {
        const pr = podSh.getRange(1,1,podSh.getLastRow(),podSh.getLastColumn()).getValues();
        const ph = pr[0];
        const ascI = ph.indexOf('Ascoltato'), stI = ph.indexOf('StatoRecord');
        for (let i=1;i<pr.length;i++) {
          if (!pr[i][0]) continue;
          const sr = String(pr[i][stI]||'attivo').toLowerCase().trim();
          if (sr==='archiviato') continue;
          if (!pr[i][ascI]) podcastNuovi++;
        }
      }
    } catch(e2) { Logger.log('podcastNuovi err: '+e2.message); }
    return { ok:true, bandiNuovi, notizieNuove, ultimaScansione, podcastNuovi };
  } catch(e) {
    return { ok:false, error:e.message, bandiNuovi:[], notizieNuove:[], ultimaScansione:null };
  }
}

function getUltimaScansione() {
  const sheet=getSheetRadar();
  if(!sheet||sheet.getLastRow()<2) return null;
  const dates=sheet.getRange(2,COL.DATA_RILEVAMENTO,sheet.getLastRow()-1,1).getValues();
  let maxDate=null;
  dates.forEach(row=>{
    const d=row[0];
    if(d instanceof Date&&!isNaN(d)&&(!maxDate||d>maxDate)) maxDate=d;
  });
  return maxDate?Utilities.formatDate(maxDate,'Europe/Rome','dd/MM/yyyy HH:mm'):null;
}

// ==================================================================
// RADAR BANDI
// ==================================================================

/**
 * Sprint 1.3 D2.5h (2026-05-01) — getSheetRadar consolidato (file principale).
 */
function getSheetRadar() {
  // v4.27.32: fonte unica Bandi_v5. RADAR BANDI e il foglio standalone sono morti.
  // Questa funzione resta come alias per i chiamanti legacy (getBandiRadar, Workflow, ecc.)
  return getMainSS().getSheetByName('Bandi_v5');
}

// v4.18.38 (audit 2026-05-14) — Rimosse 3 funzioni morte:
//   • getSheetRadarStandaloneLegacy()       — fallback Radar ID hardcoded, mai chiamato
//   • consolidaBandiInFilePrincipale()      — migrazione standalone→principale (Sprint 1.3 D2.5h), già applicata
//   • addNuoveColonneRadar()                — migrazione schema RADAR colonne 18-20, già applicata
// Recuperabili da git history se servono per audit.

// v4.27 — Schema expansion: colonne 21-22 (DESCRIZIONE, TIPO_APPALTO)

/**
 * Aggiunge le colonne 21 (Descrizione) e 22 (TipoAppalto) al foglio RADAR BANDI.
 * Idempotente: non sovrascrive se gli header esistono gia'.
 * Eseguire UNA VOLTA dall'editor GAS o dal pannello admin.
 */
function addColonneRadar_v427() {
  var sheet = getSheetRadar();
  if (!sheet) return { ok: false, error: 'Foglio RADAR BANDI non trovato' };
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var added = [];
  if (headers.indexOf('Descrizione') < 0) {
    sheet.getRange(1, COL.DESCRIZIONE).setValue('Descrizione');
    added.push('Descrizione (col ' + COL.DESCRIZIONE + ')');
  }
  if (headers.indexOf('TipoAppalto') < 0) {
    sheet.getRange(1, COL.TIPO_APPALTO).setValue('TipoAppalto');
    added.push('TipoAppalto (col ' + COL.TIPO_APPALTO + ')');
  }
  var msg = added.length ? 'Aggiunte: ' + added.join(', ') : 'Colonne gia presenti, nulla da fare';
  Logger.log('addColonneRadar_v427: ' + msg);
  return { ok: true, added: added, message: msg };
}

/**
 * v4.27 — Arricchisce i bandi RADAR che hanno Descrizione e/o TipoAppalto vuoti.
 * Usa Claude Haiku per estrarre descrizione e tipo appalto dal titolo + ente + note.
 * @param {Object} opts  { cap: max bandi da arricchire (default 20), dryRun: boolean }
 */
function arricchisciBandiRadar(opts) {
  opts = opts || {};
  var cap = opts.cap || 20;
  var dryRun = !!opts.dryRun;
  var sheet = getSheetRadar();
  if (!sheet) return { ok: false, error: 'Foglio RADAR BANDI non trovato' };

  var apiKey = _claudeKey_();
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY non configurata' };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { ok: true, arricchiti: 0, message: 'Nessun bando presente' };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = buildColMap(headers);
  var iDescr = colMap.DESCRIZIONE || COL.DESCRIZIONE;
  var iTipo = colMap.TIPO_APPALTO || COL.TIPO_APPALTO;
  var iTitolo = colMap.TITOLO || COL.TITOLO;
  var iEnte = colMap.ENTE || COL.ENTE;
  var iNote = colMap.NOTE || COL.NOTE;
  var iSettore = colMap.SETTORE || COL.SETTORE;
  var iLink = colMap.LINK || COL.LINK;

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var candidati = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var descr = String(row[iDescr - 1] || '').trim();
    var tipo = String(row[iTipo - 1] || '').trim();
    if (descr && tipo) continue;  // gia arricchito
    var titolo = String(row[iTitolo - 1] || '').trim();
    if (!titolo) continue;
    candidati.push({
      rowIdx: r + 2,  // 1-indexed, header escluso
      titolo: titolo,
      ente: String(row[iEnte - 1] || ''),
      note: String(row[iNote - 1] || ''),
      settore: String(row[iSettore - 1] || ''),
      link: String(row[iLink - 1] || ''),
      hasDescr: !!descr,
      hasTipo: !!tipo
    });
  }

  if (!candidati.length) return { ok: true, arricchiti: 0, message: 'Tutti i bandi sono gia arricchiti' };

  var batch = candidati.slice(0, cap);
  if (dryRun) {
    return { ok: true, dryRun: true, candidati: candidati.length, batch: batch.length,
             anteprima: batch.map(function(c) { return { riga: c.rowIdx, titolo: c.titolo.substring(0, 60) }; }) };
  }

  // Rate-limit check
  if (typeof _checkClaudeRateLimit_ === 'function' && !_checkClaudeRateLimit_()) {
    return { ok: false, error: 'Limite giornaliero chiamate Claude raggiunto' };
  }

  var arricchiti = 0, errori = 0;
  for (var i = 0; i < batch.length; i++) {
    var c = batch[i];
    try {
      var prompt = 'Sei un esperto di appalti pubblici e bandi culturali italiani ed europei.\n'
        + 'Dato questo bando:\n'
        + '- Titolo: ' + c.titolo + '\n'
        + '- Ente: ' + c.ente + '\n'
        + '- Settore: ' + c.settore + '\n'
        + (c.note ? '- Note: ' + c.note.substring(0, 500) + '\n' : '')
        + (c.link ? '- Link: ' + c.link + '\n' : '')
        + '\nRispondi SOLO con un JSON valido (nessun altro testo):\n'
        + '{"descrizione":"<descrizione chiara del bando in 1-3 frasi, max 300 caratteri, in italiano>","tipo_appalto":"<uno tra: servizi|forniture|lavori|misto|finanziamento>"}\n'
        + 'Se non riesci a determinare il tipo, usa "finanziamento" come default.';

      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post', muteHttpExceptions: true,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        payload: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400,
          messages: [{ role: 'user', content: prompt }] })
      });

      var code = resp.getResponseCode();
      if (code === 429 || code >= 500) { errori++; Utilities.sleep(3000); continue; }
      if (code !== 200) { errori++; continue; }

      var body = JSON.parse(resp.getContentText());
      var txt = (body.content && body.content[0] && body.content[0].text) || '';
      // Estrai JSON dal testo (potrebbe avere backtick markdown)
      var jsonMatch = txt.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { errori++; continue; }
      var parsed = JSON.parse(jsonMatch[0]);

      if (!c.hasDescr && parsed.descrizione) {
        sheet.getRange(c.rowIdx, iDescr).setValue(String(parsed.descrizione).substring(0, 500));
      }
      if (!c.hasTipo && parsed.tipo_appalto) {
        var tipoNorm = String(parsed.tipo_appalto).toLowerCase().trim();
        var tipiValidi = ['servizi', 'forniture', 'lavori', 'misto', 'finanziamento'];
        if (tipiValidi.indexOf(tipoNorm) < 0) tipoNorm = 'finanziamento';
        sheet.getRange(c.rowIdx, iTipo).setValue(tipoNorm);
      }
      arricchiti++;
      // Pausa tra le chiamate per rispettare rate limit
      if (i < batch.length - 1) Utilities.sleep(500);
    } catch (e) {
      Logger.log('arricchisciBandiRadar errore riga ' + c.rowIdx + ': ' + (e && e.message || e));
      errori++;
    }
  }

  return { ok: true, arricchiti: arricchiti, errori: errori, totCandidati: candidati.length,
           message: arricchiti + ' bandi arricchiti' + (errori ? ', ' + errori + ' errori' : '') };
}

/**
 * v4.27.24 — Arricchimento su Bandi_v5 (il foglio SERVITO). La versione RADAR
 * (arricchisciBandiRadar) scriveva sul foglio legacy non più esposto: qui la
 * stessa logica opera su Bandi_v5 (COL_B), riempiendo Sommario e TipoBando dei
 * bandi che ne sono privi ma che HANNO una scadenza (i senza-scadenza-senza-info
 * vengono archiviati dall'agente qualità, non arricchiti).
 */
function arricchisciBandiV5(opts) {
  opts = opts || {};
  var cap = opts.cap || 20;
  var dryRun = !!opts.dryRun;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shName = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
  var sheet = ss.getSheetByName(shName);
  if (!sheet) return { ok: false, error: 'Foglio Bandi_v5 non trovato' };
  var apiKey = _claudeKey_();
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY non configurata' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, arricchiti: 0, message: 'Nessun bando' };

  var iTit = COL_B.TITOLO, iEnte = COL_B.ENTE, iSet = COL_B.SETTORE, iSom = COL_B.SOMMARIO,
      iTipo = COL_B.TIPO_BANDO, iUrl = COL_B.URL_BANDO, iScad = COL_B.SCADENZA, iStat = COL_B.STATO_RECORD;
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var candidati = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    if (!row[0]) continue;
    if (String(row[iStat - 1] || '').toLowerCase() === 'archiviato') continue;
    var descr = String(row[iSom - 1] || '').trim();
    var tipo = String(row[iTipo - 1] || '').trim();
    if (descr && tipo) continue;                          // già completo
    // solo bandi con scadenza (gli altri li gestisce l'agente qualità)
    var rawScad = row[iScad - 1];
    var scad = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
    if (!scad || isNaN(scad.getTime())) continue;
    var titolo = String(row[iTit - 1] || '').trim();
    if (!titolo || /^(?:ted\s+notice\s+)?\d{3,}[-\/]?\d*$/i.test(titolo)) continue; // titolo non informativo
    candidati.push({ rowIdx: r + 2, titolo: titolo, ente: String(row[iEnte - 1] || ''),
      settore: String(row[iSet - 1] || ''), link: String(row[iUrl - 1] || ''),
      hasDescr: !!descr, hasTipo: !!tipo });
  }
  if (!candidati.length) return { ok: true, arricchiti: 0, message: 'Tutti i bandi (con scadenza) sono già completi' };
  var batch = candidati.slice(0, cap);
  if (dryRun) return { ok: true, dryRun: true, candidati: candidati.length, batch: batch.length,
    anteprima: batch.map(function(c){ return { riga: c.rowIdx, titolo: c.titolo.substring(0, 60) }; }) };
  if (typeof _checkClaudeRateLimit_ === 'function' && !_checkClaudeRateLimit_()) return { ok: false, error: 'Limite giornaliero Claude raggiunto' };

  var arricchiti = 0, errori = 0;
  for (var i = 0; i < batch.length; i++) {
    var c = batch[i];
    try {
      var prompt = 'Sei un esperto di appalti pubblici e bandi culturali italiani ed europei.\n'
        + 'Dato questo bando:\n- Titolo: ' + c.titolo + '\n- Ente: ' + c.ente + '\n- Settore: ' + c.settore + '\n'
        + (c.link ? '- Link: ' + c.link + '\n' : '')
        + '\nRispondi SOLO con un JSON valido:\n'
        + '{"descrizione":"<1-3 frasi chiare, max 300 caratteri, italiano>","tipo_appalto":"<servizi|forniture|lavori|misto|finanziamento>"}';
      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post', muteHttpExceptions: true,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        payload: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
      });
      var code = resp.getResponseCode();
      if (code === 429 || code >= 500) { errori++; Utilities.sleep(3000); continue; }
      if (code !== 200) { errori++; continue; }
      var body = JSON.parse(resp.getContentText());
      var txt = (body.content && body.content[0] && body.content[0].text) || '';
      var jm = txt.match(/\{[\s\S]*\}/); if (!jm) { errori++; continue; }
      var parsed = JSON.parse(jm[0]);
      if (!c.hasDescr && parsed.descrizione) sheet.getRange(c.rowIdx, iSom).setValue(String(parsed.descrizione).substring(0, 500));
      if (!c.hasTipo && parsed.tipo_appalto) {
        var tn = String(parsed.tipo_appalto).toLowerCase().trim();
        if (['servizi','forniture','lavori','misto','finanziamento'].indexOf(tn) < 0) tn = 'finanziamento';
        sheet.getRange(c.rowIdx, iTipo).setValue(tn);
      }
      arricchiti++;
      if (i < batch.length - 1) Utilities.sleep(500);
    } catch (e) { Logger.log('arricchisciBandiV5 riga ' + c.rowIdx + ': ' + (e && e.message || e)); errori++; }
  }
  return { ok: true, arricchiti: arricchiti, errori: errori, totCandidati: candidati.length };
}

/**
 * v4.27 — Wrapper per il dispatcher cron: arricchisce 50 bandi/run su Bandi_v5.
 * (v4.27.24: repuntato da RADAR legacy al foglio servito Bandi_v5.)
 */
function enrichBandiRadarBatch() {
  var result = arricchisciBandiV5({ cap: 50 });
  Logger.log('enrichBandiRadarBatch (Bandi_v5): ' + JSON.stringify(result));
  return result;
}
// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
function buildColMap(headers) {
  const map={};
  Object.entries(COL_NAMES).forEach(([key,aliases])=>{
    const idx=headers.findIndex(h=>aliases.some(a=>String(h).trim().toLowerCase()===a.toLowerCase()));
    map[key]=idx>=0?idx+1:COL[key];
  });
  return map;
}

function getBandiRadar() {
  const sheet=getSheetRadar();
  if(!sheet) return [];
  const lastRow=sheet.getLastRow();
  if(lastRow<2) return [];
  const lastCol=sheet.getLastColumn();
  const headers=sheet.getRange(1,1,1,lastCol).getValues()[0];
  const C=buildColMap(headers);
  const numCols=Math.max(lastCol,20);  // v3.1: include col 20 LettoBando
  const data=sheet.getRange(2,1,lastRow-1,numCols).getValues();
  const bandi=[];
  data.forEach((row,idx)=>{
    if(!row[(C.TITOLO||2)-1]) return;
    const scadenza=row[(C.SCADENZA||COL.SCADENZA)-1];
    let scadenzaStr=null;
    if(scadenza instanceof Date&&!isNaN(scadenza)){
      scadenzaStr=Utilities.formatDate(scadenza,'Europe/Rome','yyyy-MM-dd');
    } else if(typeof scadenza==='string'&&scadenza.match(/\d{2}\/\d{2}\/\d{4}/)){
      const p=scadenza.split('/'); scadenzaStr=`${p[2]}-${p[1]}-${p[0]}`;
    } else if(typeof scadenza==='string'&&scadenza.match(/\d{4}-\d{2}-\d{2}/)){
      scadenzaStr=scadenza;
    }
    const dataRil=row[(C.DATA_RILEVAMENTO||COL.DATA_RILEVAMENTO)-1];
    let dataStr=null;
    if(dataRil instanceof Date&&!isNaN(dataRil)) dataStr=Utilities.formatDate(dataRil,'Europe/Rome','yyyy-MM-dd');
    else if(typeof dataRil==='string') dataStr=dataRil;
    const g=k=>{ var ci=C[k]||COL[k]; return ci ? row[ci-1] : ''; };
    // v4.22 — Filtro: escludi bandi scaduti E senza scadenza (solo scadenze future certe)
    var _oggi = new Date(); _oggi.setHours(0,0,0,0);
    var _hasValidScad = false;
    if (scadenzaStr) {
      var _dtCheck = new Date(scadenzaStr + 'T00:00:00');
      if (!isNaN(_dtCheck.getTime())) {
        _hasValidScad = true;
        if (_dtCheck.getTime() < _oggi.getTime()) return; // scaduto → skip
      }
    }
    if (!_hasValidScad && scadenza instanceof Date && !isNaN(scadenza.getTime())) {
      _hasValidScad = true;
      if (scadenza.getTime() < _oggi.getTime()) return; // scaduto → skip
    }
    if (!_hasValidScad) return; // senza scadenza → skip

    // Filtro archiviati
    var _sr = String(g('STATO_RECORD')||'').toLowerCase();
    if (_sr === 'archiviato') return;

    bandi.push({
      id:'r'+(idx+2), rowIndex:idx+2,
      data:dataStr||new Date().toISOString().slice(0,10),
      titolo:String(g('TITOLO')||''), ente:String(g('ENTE')||''),
      livello:String(g('LIVELLO')||''), regione:String(g('REGIONE')||''),
      settore:String(g('SETTORE')||''), soggetti:String(g('SOGGETTI')||''),
      importo:parseFloat(g('IMPORTO'))||null, cofin:parseFloat(g('COFIN'))||null,
      scadenza:scadenzaStr, status:String(g('STATUS')||'Nuovo'),
      cliente:String(g('CLIENTE')||''), link:String(g('LINK')||''),
      note:String(g('NOTE')||''), fonte:String(g('FONTE')||''),
      priorita:String(g('PRIORITA')||'blu'),
      nascosto:g('NASCOSTO')===true||g('NASCOSTO')==='SI'||g('NASCOSTO')==='TRUE',
      statoRecord:_sr||'attivo',
      urlEnte:String(g('URL_ENTE')||''),
      lettoBando:g('LETTO_BANDO')===true||g('LETTO_BANDO')==='TRUE',
      ambito: parseInt(g('AMBITO'))||null,
      tipoBando: String(g('TIPO_BANDO')||''),
      settoreCultura: String(g('SETTORE_CULTURA')||''),
      cpv: String(g('CPV')||''),
    });
  });
  return bandi;
}

// [diagnostica estratta in DiagnosticaMigrazione.js]

function saveBandoRadar(b) {
  const sheet=getSheetRadar();
  const newRow=[
    new Date(), b.titolo, b.ente, b.livello, b.regione, b.settore, b.soggetti,
    b.importo||'', b.cofin||'',
    b.scadenza?new Date(b.scadenza):'',
    b.status||'Nuovo', b.cliente||'', b.link||'',
    b.note||'', b.fonte||'', b.priorita||'blu', false,
    'attivo',       // * STATO_RECORD
    b.urlEnte||'',  // * URL_ENTE
    false,          // * LETTO_BANDO (col 20)
    b.descrizione||'',  // * v4.27 DESCRIZIONE (col 21)
    b.tipoAppalto||'',  // * v4.27 TIPO_APPALTO (col 22)
  ];
  sheet.appendRow(newRow);
  const nr=sheet.getLastRow();
  sheet.getRange(nr,COL.DATA_RILEVAMENTO).setNumberFormat('dd/mm/yyyy');
  if(b.scadenza) sheet.getRange(nr,COL.SCADENZA).setNumberFormat('dd/mm/yyyy');
  if(b.importo)  sheet.getRange(nr,COL.IMPORTO).setNumberFormat('#,##0 "EUR"');
  applyPriorityColor(sheet,nr,b.priorita||'blu');
  return {rowIndex:nr};
}

function updateBandoRadar(b) {
  const sheet=getSheetRadar();
  const rowIndex=b.rowIndex;
  if(!rowIndex) return {error:'rowIndex mancante'};
  const values=[
    sheet.getRange(rowIndex,COL.DATA_RILEVAMENTO).getValue(),
    b.titolo, b.ente, b.livello, b.regione, b.settore, b.soggetti,
    b.importo||'', b.cofin||'',
    b.scadenza?new Date(b.scadenza):'',
    b.status||'Nuovo', b.cliente||'', b.link||'',
    b.note||'', b.fonte||'', b.priorita||'blu',
    b.nascosto?'SI':'NO',
    b.statoRecord||'attivo',  // *
    b.urlEnte||'',            // *
    b.lettoBando||false,      // * LETTO_BANDO
    b.descrizione||'',       // * v4.27 DESCRIZIONE
    b.tipoAppalto||'',       // * v4.27 TIPO_APPALTO
  ];
  sheet.getRange(rowIndex,1,1,values.length).setValues([values]);
  if(b.scadenza) sheet.getRange(rowIndex,COL.SCADENZA).setNumberFormat('dd/mm/yyyy');
  if(b.importo)  sheet.getRange(rowIndex,COL.IMPORTO).setNumberFormat('#,##0 "EUR"');
  applyPriorityColor(sheet,rowIndex,b.priorita||'blu');
  return {ok:true};
}

function toggleNascostoRadar(id,nascosto) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt(id.replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.getRange(rowIndex,COL.NASCOSTO).setValue(nascosto?'SI':'NO');
  return {ok:true};
}

function deleteBandoRadar(id) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt(id.replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.deleteRow(rowIndex);
  return {ok:true};
}

function applyPriorityColor(sheet,rowIndex,priorita) {
  const colors={rosso:'#FADBD8',arancio:'#FEF9E7',verde:'#D5F5E3',blu:'#D6E4F0',giallo:'#FFFDE7',grigio:'#F5F5F5'};
  const col=colors[priorita]||colors.blu;
  const numCols=Math.min(sheet.getLastColumn(),19);
  sheet.getRange(rowIndex,1,1,numCols).setBackground(col);
}

// ==================================================================
// * ARCHIVIO BANDI v3.0
// ==================================================================

// v4.22 — Moved to LegacyWorkflow.js: toggleLettoBando, archiviaRecord, ripristinaRecord, deleteArchiviato, deleteArchivioBulk, deleteArchivioTutto, autoArchiviaNotizieVecchie, archiviaNotizieOlderThan, eliminaArchiviatiTutti, autoArchiviaScaduti, toggleItemField, setItemField

// v4.22 — Moved to StatsManager.js: getStats, getGestioneStats

// v4.22 — Moved to TelegramManager.js: sendTelegram, sendTestTelegram

function formatDateIT(d) {
  if(!d||!(d instanceof Date)) return '-';
  return Utilities.formatDate(d,'Europe/Rome','dd/MM/yyyy');
}
function formatEur(n) { if(!n) return '-'; return 'EUR'+Number(n).toLocaleString('it-IT'); }

// v4.22 — Moved to NewsScanner.js: getItems, getItemsByIds, editSommario

// v4.22 — Moved to LegacyWorkflow.js: toggleItemField, setItemField

// -- BANDI (foglio legacy) -----------------------------------------
function getBandi() {
  const sh=getMainSS().getSheetByName(SH.BANDI);
  if(!sh) return {bandi:[]};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  if(!h||h.length===0) return {bandi:[]};
  const now=new Date(), bandi=[];
  for(let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]) continue;
    const item={}; h.forEach((col,idx)=>{item[col]=r[idx];});
    if(item.Stato==='scaduto') continue;
    const scad=item.DataScadenza instanceof Date?item.DataScadenza:new Date(item.DataScadenza);
    const giorni=Math.ceil((scad-now)/86400000);
    if(giorni<0){ sh.getRange(i+1,h.indexOf('Stato')+1).setValue('scaduto'); continue; }
    item.GiorniRimanenti=giorni; item.DataScadenzaFmt=formatDate(scad);
    bandi.push(item);
  }
  bandi.sort((a,b)=>a.GiorniRimanenti-b.GiorniRimanenti);
  return {bandi};
}

// -- FONTI ---------------------------------------------------------
function getFonti() {
  var fonti = _sheetToObjects(SH.FONTI);
  fonti.forEach(function(f) {
    if (f.UltimaScansione instanceof Date) f.UltimaScansione = formatDate(f.UltimaScansione);
  });
  return {fonti: fonti};
}

function toggleFonteField(id,field) {
  const sh=getMainSS().getSheetByName(SH.FONTI);
  return _toggleField(sh,id,field);
}

// v4.22 — Moved to MailingManager.js: getMailingList, getMailingListSummary, saveMailing, deleteMailing, toggleMailingField, _sendConfirmationEmail, _handleConfirmNewsletter, getDigestLog

// --- Digest send/build functions extracted to DigestService.js (Sprint 2, 2026-05-26) ---

// v4.22 — Moved to NewsScanner.js: scanSources, fetchRSS, processWithAI, saveItem, getItems, getItemsByIds, editSommario, getExistingURLs, updateFonteLastScan, backfillRegioneNews, scanPodcastDiretto, scanVideoYoutube, FONTI_GENERALISTE, passaFiltroCulturaMusei_, _parseRSSItems_, _parseYoutubeAtom_, _xmlText_

// ==================================================================
// SOCIAL WALL + FONTI ARTICOLI — ESTRATTI in SocialManager.js (v4.27.33)
// getSocialWall, fetchAndCacheSocialWall, getSocialFontiList, addSocialFonte,
// deleteSocialFonteById, toggleSocialFonteField, seedSocialFontiIstituzionali,
// correggiSocialFontiFallite, addFontiIstituzionali, addFontiNewsNuove,
// addFonteArticoli, deleteFonteArticoli
// ==================================================================


// -- FONTI BANDI ---------------------------------------------------
// v4.20 — Archivio UNICO: legge da FontiBandi_v5 (lettura per nome colonna,
// date come stringa per la serializzazione google.script.run).
function getFontiBandi() {
  const SS = getMainSS();
  const sh = SS.getSheetByName('FontiBandi_v5');
  if (!sh || sh.getLastRow() < 2) return { fonti: [] };
  const v = sh.getDataRange().getValues();
  const h = v[0].map(function(x){ return String(x || '').trim(); });
  function col(n){ return h.indexOf(n); }
  const iId=col('ID'), iNome=col('Nome'), iUrl=col('URL'), iCat=col('Categoria'),
        iAtt=col('Attiva'), iScan=col('UltimaScan'), iEsito=col('UltimoEsito'),
        iFail=col('FailConsecutivi'), iTipo=col('Tipo'), iPri=col('Priorita');
  const fonti = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i]; if (iId >= 0 && !r[iId]) continue;
    fonti.push({
      ID: String(r[iId] || ''), Nome: String(r[iNome] || ''), URL: String(r[iUrl] || ''),
      Categoria: String(iCat >= 0 ? r[iCat] : ''), Tipo: String(iTipo >= 0 ? r[iTipo] : ''),
      Priorita: Number(iPri >= 0 ? r[iPri] : 2) || 2,
      Attiva: (r[iAtt] === true || String(r[iAtt]).toUpperCase() === 'TRUE'),
      ultimaScan: (iScan >= 0 && r[iScan]) ? String(r[iScan]) : '',
      ultimoEsito: String(iEsito >= 0 ? r[iEsito] : ''),
      failConsec: Number(iFail >= 0 ? r[iFail] : 0) || 0
    });
  }
  return { fonti: fonti };
}

function _createFontiBandiSheet(SS) {
  if(typeof popolaFontiBandiSheet==='function'){popolaFontiBandiSheet();return SS.getSheetByName('FontiBandi');}
  const sh=SS.insertSheet('FontiBandi');
  sh.getRange(1,1,1,6).setValues([['ID','Nome','URL','Categoria','Attiva','Note']]).setFontWeight('bold').setBackground('#0F2744').setFontColor('#fff');
  sh.setFrozenRows(1); return sh;
}

function addFonteBandi(body) {
  // v4.15 (2026-05-09): allineamento v4 -> v5. Ora scrive direttamente in FontiBandi_v5.
  // Schema 18 colonne (COL_F in Bandi_v5.js). Firma esterna invariata.
  try {
    const SS = getMainSS();
    let sh = SS.getSheetByName('FontiBandi_v5');
    if (!sh) {
      // Se v5 non esiste ancora, fallback al vecchio comportamento per non rompere.
      // Setup v5 va eseguito separatamente via setupBandiV5Schema().
      let shV4 = SS.getSheetByName('FontiBandi') || _createFontiBandiSheet(SS);
      const idV4 = 'FB' + Date.now();
      shV4.appendRow([idV4, body.nome, body.url, body.categoria || '', true, body.note || '']);
      return { ok: true, id: idV4, warning: 'FontiBandi_v5 non trovato, scritto in v4 legacy. Esegui setupBandiV5Schema()' };
    }
    const id = 'FB' + Date.now();
    // Compila riga con schema v5 a 18 colonne (default sensati per i campi non forniti).
    const row = new Array(18).fill('');
    row[0]  = id;                              // ID
    row[1]  = body.nome || '';                 // Nome
    row[2]  = body.url || '';                  // URL
    row[3]  = body.tipo || 'RSS';              // Tipo (default RSS, modificabile)
    row[4]  = body.categoria || '';            // Categoria
    row[5]  = Number(body.priorita) || 2;      // Priorita (default 2=media)
    row[6]  = true;                            // Attiva
    row[7]  = new Date();                      // DataAggiunta
    row[8]  = '';                              // UltimaScansione
    row[9]  = '';                              // UltimoEsito
    row[10] = 0;                               // NBandiTotali
    row[11] = 0;                               // NBandiUltimoScan
    row[12] = 0;                               // FailConsecutivi
    row[13] = '';                              // UltimoErrore
    row[14] = body.enteDefault || '';          // EnteDefault
    row[15] = body.urlEnte || '';              // UrlEnte
    row[16] = body.livello || 'Vari';          // Livello
    row[17] = body.note || '';                 // Note
    sh.appendRow(row);
    Logger.log('addFonteBandi v5: aggiunta ' + body.nome + ' (id=' + id + ')');
    return { ok: true, id: id };
  } catch(e) {
    Logger.log('addFonteBandi v5 ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}
function deleteFonteBandiById(id) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  return _deleteRowById(getMainSS().getSheetByName('FontiBandi_v5'), id);
}
function toggleFonteBandiField(id, field) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  return _toggleField(getMainSS().getSheetByName('FontiBandi_v5'), id, field);
}
// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
function scanSingolaFonteBandi(id) {
  try {
    var sh = getMainSS().getSheetByName('FontiBandi');
    if (!sh) return { error:'foglio FontiBandi non trovato' };
    var rows = sh.getDataRange().getValues();
    var headers = rows[0];
    var iId = headers.indexOf('ID'),
        iNome = headers.indexOf('Nome'),
        iUrl = headers.indexOf('URL'),
        iAttiva = headers.indexOf('Attiva');
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][iId]) !== String(id)) continue;
      var url = String(rows[i][iUrl] || '').trim();
      if (!url) return { error:'URL vuoto per fonte ' + id };
      try {
        var resp = UrlFetchApp.fetch(url, {
          muteHttpExceptions:true, followRedirects:true, deadline:8,
          headers:{'User-Agent':'Mozilla/5.0 (compatible; OsservatorioCulturale-Test/1.0)'}
        });
        var status = resp.getResponseCode();
        var len = resp.getContentText().length;
        return {
          ok: status >= 200 && status < 400,
          status: status,
          contentLength: len,
          fonte: { id: id, nome: rows[i][iNome], url: url, attiva: rows[i][iAttiva] }
        };
      } catch(e) {
        return { ok:false, error: 'fetch_failed: ' + e.message, fonte: { id:id, nome: rows[i][iNome], url: url } };
      }
    }
    return { error:'fonte non trovata: ' + id };
  } catch(e) {
    return { error: e.message };
  }
}


// ==================================================================
// PODCAST v3.2 — ESTRATTO in PodcastManager.js (v4.27.33)
// getPodcastSheet, getPodcasts, savePodcast, togglePodField, deletePodcast
// ==================================================================

// (spazio vuoto — codice podcast CRUD rimosso, ora in PodcastManager.js)

function _codice_podcast_crud_removed_() {} // segnalibro

// HELPERS
// ==================================================================

function deleteItemsBulk(ids) {
  if(!ids||!ids.length) return {error:'Nessun ID'};
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  if(!sh) return {error:'Foglio non trovato'};
  const rows=sh.getDataRange().getValues(), idCol=rows[0].indexOf('ID'), toDelete=[];
  for(let i=rows.length-1;i>=1;i--) if(ids.includes(rows[i][idCol])) toDelete.push(i+1);
  toDelete.forEach(r=>sh.deleteRow(r));
  return {ok:true,deleted:toDelete.length};
}

function _deleteRowById(sh,id) {
  if(!sh) return {error:'Foglio non trovato'};
  const rows=sh.getDataRange().getValues(), idCol=rows[0].indexOf('ID');
  for(let i=1;i<rows.length;i++) if(rows[i][idCol]===id){sh.deleteRow(i+1);return {ok:true};}
  return {error:'Elemento non trovato'};
}

function _toggleField(sh,id,field) {
  if(!sh) return {error:'Foglio non trovato'};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), fieldCol=h.indexOf(field);
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id){const nv=!rows[i][fieldCol];sh.getRange(i+1,fieldCol+1).setValue(nv);return {ok:true,value:nv};}
  }
  return {error:'Non trovato'};
}

// v4.18.38 (audit 2026-05-14) — Rimossa initSheetsIfMissing(): sostituita da runAllSetupV418()
// in Setup_v418.js. La nuova catena setup è più completa e idempotente.

function setupSheets() {
  const SS=getMainSS();
  const config={
    [SH.ITEMS]:['ID','Ambito','AmbitoLabel','Fonte','FonteURL','Titolo','Estratto','SommarioAI','SommarioEditato','TagAI','Score','Tipologia','DataPubblicazione','DataAcquisizione','Scadenza','Letto','Salvato','Archiviato','InclusiNelDigest'],
    [SH.BANDI]:['ID','Titolo','Fonte','FonteURL','DataScadenza','Descrizione','Salvato','Stato'],
    [SH.FONTI]:['ID','Nome','URL','RSSURL','Ambito','AmbitoLabel','Attiva','UltimaScansione','NumItemRaccolti'],
    [SH.MAILING]:['ID','Nome','Email','Ruolo','Attivo','DataIscrizione'],
    [SH.LOG]:['ID','DataInvio','NumItem','Destinatari','Stato']
  };
  for(const [name,headers] of Object.entries(config)) {
    let sh=SS.getSheetByName(name); if(!sh) sh=SS.insertSheet(name);
    sh.clearFormats();
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    sh.setFrozenRows(1); sh.setColumnWidth(1,180);
  }
  Logger.log('[OK] Setup completato');
}

function setupTriggers() {
  // v4.20 DEPRECATO — usare setupMasterTriggers()
  Logger.log('[DEPRECATO] setupTriggers — usare setupMasterTriggers()');
  return { ok: false, deprecato: true, message: 'Usare setupMasterTriggers()' };
}
// ==================================================================
// AGGIUNTA A ScannerBandi.gs — v4.2
// Incollare DOPO la funzione setupTriggersUnificati()
// ==================================================================

// ==================================================================
// BOZZA DIGEST AUTOMATICA — ogni lunedì dopo lunediMattina()
// Selezione: max 10 bandi (urgenti prima) + max 20 notizie (score↓) + 1 podcast
// ==================================================================
function preparaBozzaDigestLunedi() {
  const SS = getMainSS();
  const oggi = new Date();
  const cutoff14 = new Date(oggi.getTime() - 14 * 86400000);

  // --- 1. BANDI: urgenti (≤14gg) prima, poi per importo, max 10 ---
  const tuttiBandi = getBandiRadar().filter(b =>
    b.statoRecord !== 'archiviato' &&
    !['Scaduto', 'Archiviato'].includes(b.status)
  );
  const bandiSel = tuttiBandi
    .map(b => {
      const dl = b.scadenza ? Math.ceil((new Date(b.scadenza) - oggi) / 86400000) : null;
      return { ...b, _dl: dl };
    })
    .sort((a, b) => {
      const aU = (a._dl !== null && a._dl >= 0 && a._dl <= 14) ? 0 : 1;
      const bU = (b._dl !== null && b._dl >= 0 && b._dl <= 14) ? 0 : 1;
      if (aU !== bU) return aU - bU;
      if (a._dl !== null && b._dl !== null && !aU) return a._dl - b._dl;
      return (b.importo || 0) - (a.importo || 0);
    })
    .slice(0, 10);

  // --- 2. NOTIZIE: score desc, ultimi 14 giorni, non archiviate, max 20 ---
  const shN = SS.getSheetByName(SH.ITEMS);
  let notizieCount = 0;
  if (shN && shN.getLastRow() > 1) {
    const rows = shN.getDataRange().getValues();
    const h = rows[0];
    const idI    = h.indexOf('ID'),
          archI  = h.indexOf('Archiviato'),
          digI   = h.indexOf('InclusiNelDigest'),
          salvI  = h.indexOf('Salvato'),
          scoreI = h.indexOf('Score'),
          dataI  = h.indexOf('DataAcquisizione');

    const candidati = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[idI] || r[archI] || r[digI]) continue;
      const d = r[dataI] instanceof Date ? r[dataI] : new Date(r[dataI]);
      if (!isNaN(d) && d >= cutoff14) {
        candidati.push({ rowIdx: i + 1, id: r[idI], score: r[scoreI] || 0, data: d });
      }
    }
    candidati.sort((a, b) => (b.score - a.score) || (b.data - a.data));
    const selezionate = candidati.slice(0, 20);

    // Segna InclusiNelDigest = true
    selezionate.forEach(n => {
      shN.getRange(n.rowIdx, digI + 1).setValue(true);
    });
    SpreadsheetApp.flush();
    notizieCount = selezionate.length;
  }

  // --- 3. PODCAST: 1 solo, score più alto, non ascoltato, non già in digest ---
  let podCount = 0;
  const shP = SS.getSheetByName(SH.PODCAST || 'Podcast');
  if (shP && shP.getLastRow() > 1) {
    const pr = shP.getDataRange().getValues();
    const ph = pr[0];
    const pidI = ph.indexOf('ID'),
          pascI = ph.indexOf('Ascoltato'),
          pdigI = ph.indexOf('InclusiNelDigest'),
          psrI  = ph.indexOf('StatoRecord'),
          pscI  = ph.indexOf('Score');

    const candidati = [];
    for (let i = 1; i < pr.length; i++) {
      const r = pr[i];
      if (!r[pidI]) continue;
      if (String(r[psrI] || 'attivo').toLowerCase() === 'archiviato') continue;
      if (r[pascI] || r[pdigI]) continue;
      candidati.push({ rowIdx: i + 1, score: r[pscI] || 0 });
    }
    if (candidati.length > 0) {
      candidati.sort((a, b) => b.score - a.score);
      shP.getRange(candidati[0].rowIdx, pdigI + 1).setValue(true);
      SpreadsheetApp.flush();
      podCount = 1;
    }
  }

  // --- 4. EDITORIA: ultime 5 pubblicazioni/podcast dalla ricerca ---
  let editoriaCount = 0;
  let editoriaItems = [];
  try {
    if (typeof getEditoria === 'function') {
      const edData = getEditoria();
      if (edData && edData.items) {
        editoriaItems = edData.items.slice(0, 5);
        editoriaCount = editoriaItems.length;
      }
    }
  } catch(e) { Logger.log('Editoria per digest err: ' + e.message); }

  const totale = bandiSel.length + notizieCount + podCount + editoriaCount;
  Logger.log('[BOZZA DIGEST LUN] Bandi: ' + bandiSel.length +
             ' | Notizie: ' + notizieCount +
             ' | Podcast: ' + podCount +
             ' | Editoria: ' + editoriaCount +
             ' | TOTALE: ' + totale);

  // Telegram: bozza pronta
  const dataFmt = Utilities.formatDate(oggi, 'Europe/Rome', 'EEEE dd/MM/yyyy');
  const msg = '📋 *Bozza Digest* pronta — ' + dataFmt + '\n\n' +
    '📊 *' + bandiSel.length + '* bandi\n' +
    '📰 *' + notizieCount + '* notizie\n' +
    '🎙 *' + podCount + '* podcast\n' +
    '📄 *' + editoriaCount + '* dalla ricerca\n' +
    '─────────────────\n' +
    'Totale: *' + totale + '* contenuti\n\n' +
    '_Rivedi e invia dall\'Osservatorio → Email Digest_\n' +
    '_Sinopia_';
  try { sendTelegram(msg); } catch(e) { Logger.log('TG bozza err: ' + e.message); }

  return { bandi: bandiSel.length, notizie: notizieCount, podcast: podCount, editoria: editoriaCount, editoriaItems: editoriaItems, totale };
}


// ==================================================================
// SOSTITUZIONE lunediMattina() — v4.2
// Sostituisce COMPLETAMENTE la funzione lunediMattina() esistente
// ==================================================================
function lunediMattina() {
  _initLegacyConsts_(); // v4.22 — trigger entry point
  Logger.log('=== LUNEDI MATTINA v4.2 - OSSERVATORIO CULTURALE ===');

  // 1. Auto-archiviazione bandi scaduti (v4.20 — usa cleanupBandiV5Scaduti)
  try {
    if (typeof cleanupBandiV5Scaduti === 'function') cleanupBandiV5Scaduti(30);
  } catch(e) { Logger.log('cleanupBandiV5Scaduti: ' + e.message); }

  // 2. Auto-archiviazione notizie > 30gg
  try {
    const archiviate = autoArchiviaNotizieVecchie();
    Logger.log('Notizie archiviate (>30gg): ' + archiviate);
  } catch(e) { Logger.log('autoArchiviaNotizieVecchie: ' + e.message); }

  // 3. Scanner bandi automatico
  let risultatoBandi = { totalNuovi: 0, fonti: [], errori: 0 };
  try {
    risultatoBandi = scanBandiAutomatico();
  } catch(e) { Logger.log('scanBandiAutomatico: ' + e.message); }

  // 4. Scanner podcast
  let nuoviPod = 0;
  try {
    nuoviPod = scanPodcast();
    Logger.log('Podcast: ' + nuoviPod + ' nuovi episodi');
  } catch(e) { Logger.log('scanPodcast err: ' + e.message); }

  // 5. Scanner articoli RSS (chiama scanSources da Code.gs)
  let nuoveNotizie = 0;
  try {
    nuoveNotizie = scanSources();
    Logger.log('Notizie RSS: ' + nuoveNotizie + ' nuove');
  } catch(e) { Logger.log('scanSources err: ' + e.message); }

  // Pausa prima dei report
  Utilities.sleep(3000);

  // 6. Bozza digest automatica
  let bozza = { bandi: 0, notizie: 0, podcast: 0, totale: 0 };
  try {
    bozza = preparaBozzaDigestLunedi();
  } catch(e) { Logger.log('preparaBozzaDigest err: ' + e.message); }

  // 7. Alert settimanale scadenze
  try { sendWeeklyAlert(); } catch(e) { Logger.log('sendWeeklyAlert: ' + e.message); }

  // 8. Riepilogo Telegram scanner
  const msgScan = '✅ *Scanner Lunedì completato*\n\n' +
    (risultatoBandi.totalNuovi > 0 ? '📊 *' + risultatoBandi.totalNuovi + '* nuovi bandi\n' : '') +
    (nuoveNotizie > 0 ? '📰 *' + nuoveNotizie + '* nuove notizie RSS\n' : '') +
    (nuoviPod > 0 ? '🎙 *' + nuoviPod + '* nuovi episodi podcast\n' : '') +
    '\n_Osservatorio Culturale · Sinopia_';
  try { sendTelegram(msgScan); } catch(e) { Logger.log('TG scan recap: ' + e.message); }

  Logger.log('=== LUNEDI COMPLETATO ===');
}
function formatDate(date) {
  if(!date) return '';
  const d=date instanceof Date?date:new Date(date);
  if(isNaN(d)) return '';
  const m=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
