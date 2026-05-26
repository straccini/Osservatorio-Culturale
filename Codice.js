const PROPS = PropertiesService.getScriptProperties();
const CLAUDE_API_KEY = PROPS.getProperty('CLAUDE_API_KEY');
const ADMIN_PWD      = PROPS.getProperty('ADMIN_PASSWORD');
const EDITOR_PWD     = PROPS.getProperty('EDITOR_PASSWORD');
const TELEGRAM_TOKEN   = PROPS.getProperty('TELEGRAM_TOKEN');
const TELEGRAM_CHAT_ID = PROPS.getProperty('TELEGRAM_CHAT_ID');
const GIORNI_ALERT     = parseInt(PROPS.getProperty('GIORNI_SCADENZA_ALERT') || '10');

// Progetto BOUND al Sheet: usa sempre il foglio attivo
// SHEET_ID mantenuto come fallback per ambienti standalone
const SHEET_ID = PROPS.getProperty('SHEET_ID') || '';

function getMainSS() {
  // In web app getActiveSpreadsheet() ritorna null - serve sempre SHEET_ID
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  // Fallback bound: recupera ID dal file padre
  try {
    const parents = DriveApp.getFileById(ScriptApp.getScriptId()).getParents();
    if (parents.hasNext()) return SpreadsheetApp.open(parents.next());
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
    .setTitle('Sinopia \xb7 Osservatorio Culturale \xb7 Duemilamusei')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width,initial-scale=1');
}

function _doGetSurvey(params) {
  var surveyTemplate = HtmlService.createTemplateFromFile('SurveyPublic');
  surveyTemplate.surveyCode = String(params.survey).trim();
  return surveyTemplate.evaluate()
    .setTitle('Sondaggio MuseMu Matrix')
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
  var params = (e && e.parameter) || {};

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
        .setTitle('Autovalutazione · Osservatorio Culturale')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch(eSond) { Logger.log('doGet sondaggio error: ' + eSond.message); }
  }

  // ---------- 1) Flusso Digest Reader (token) ----------
  if (params.reader === '1' && params.t) {
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
      testAgentScan:              testAgentScan
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

  // ---------- 1-ter) Sprint 1.4 (2026-05-01) — Gate AUTH ----------
  var skipAuth = false;

  if (!skipAuth) {
    var auth = null;
    try { auth = (typeof getCurrentUserAuth === 'function') ? getCurrentUserAuth() : null; } catch(eA) {}
    if (!auth || !auth.autorizzato) {
      try {
        var loginHtml = (typeof renderLoginPage === 'function')
          ? renderLoginPage(auth)
          : '<h1>Accesso richiesto</h1><p>Effettua login con un account Google autorizzato.</p>';
        return HtmlService.createHtmlOutput(loginHtml)
          .setTitle('Accesso · Osservatorio Culturale')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      } catch(eL) {
        return HtmlService.createHtmlOutput('<h1>Errore login</h1><pre>' + escTok_(String(eL)) + '</pre>')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
    }
  }

  // ---------- 2) App principale (template con scriptlet) ----------
  var t = HtmlService.createTemplateFromFile('Index');

  var page = t.evaluate()
    .setTitle('Osservatorio Culturale · Duemilamusei')
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
        injectedSession = JSON.stringify({
          token: sessTok,
          email: sessInfo.email || '',
          livello: sessInfo.livello || 1,
          permanente: !!sessInfo.permanente,
          giorniResidui: sessInfo.giorniResidui,
          scaduta: !!sessInfo.scaduta,
          readOnly: !!sessInfo.readOnly,
          matrixCompletato: !!sessInfo.matrixCompletato
        });
      }
    }
  } catch(injErr) { Logger.log('inject sessione fallita: ' + injErr.message); }

  var html = page.getContent()
    .replace(/GAS_URL_PLACEHOLDER/g, url)
    .replace(/OC_ADMIN_TOKEN_PLACEHOLDER/g, injectedToken)
    .replace(/OC_SESSION_PLACEHOLDER/g, injectedSession);

  return HtmlService.createHtmlOutput(html)
    .setTitle('Sinopia · Osservatorio Culturale')
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
  else if (stato === 'sospeso') { statusMsg = 'Account sospeso. Per riattivarlo scrivi a s.straccini@gmail.com.'; statusType = 'error'; }
  else if (stato === 'rifiutato') { statusMsg = 'Richiesta non approvata. Per informazioni scrivi a s.straccini@gmail.com.'; statusType = 'error'; }

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
+   '<p class="b-right-lead">Il framework MuseMu Matrix dell\'Osservatorio Culturale Duemilamusei. Riservato agli iscritti.</p>'
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
      + '<a class="btn" href="mailto:info@duemilamusei.it">Richiedi un nuovo digest</a>'
      + '</div></body></html>';
    var err = HtmlService.createHtmlOutput(errHtml);
    err.setTitle('Link non valido — Osservatorio Culturale');
    err.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return err;
  }
}

function doPost(e) {
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
        return jsonOk(getMailingList());
      case 'getDigestLog':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(getDigestLog());

      // Items
      case 'editSommario':    return jsonOk(editSommario(body));
      case 'toggleSaved':     return jsonOk(toggleItemField(body.id,'Salvato'));
      case 'toggleArchived':  return jsonOk(toggleItemField(body.id,'Archiviato'));
      case 'toggleDigest':    return jsonOk(toggleItemField(body.id,'InclusiNelDigest'));
      case 'markRead':        return jsonOk(setItemField(body.id,'Letto',true));
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
      case 'saveBandoRadar':       return jsonOk(saveBandoRadar(body));
      case 'updateBandoRadar':     return jsonOk(updateBandoRadar(body));
      case 'toggleNascostoRadar':  return jsonOk(toggleNascostoRadar(body.id,body.nascosto));
      case 'deleteBandoRadar':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteBandoRadar(body.id));
      case 'testTelegramRadar':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(sendTestTelegram());

      // * Archivio Bandi v3.0
      case 'toggleLettoBando': return jsonOk(toggleLettoBando(body));
      case 'archiviaRecord':   return jsonOk(archiviaRecord(body));
      case 'ripristinaRecord': return jsonOk(ripristinaRecord(body));
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
      case 'savePodcast':     return jsonOk(savePodcast(body));
      case 'togglePodField':  return jsonOk(togglePodField(body));
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
        const MAINT_KEY = 'oc-maint-4K9xZq2p8vR1';
        if (body.key !== MAINT_KEY) return jsonOk({ error: 'Chiave non valida' });
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
    Logger.log('doPost error: '+err.message);
    return jsonOk({ error: err.message });
  }
}

// ==================================================================
// FONTI PODCAST - Sheet "FontiPodcast"
// Colonne: ID | Nome | URL_RSS | Tematica | Attiva | UltimaScan | NumEpisodi
// ==================================================================
function _getFontiPodSheet() {
  const SS = getMainSS();
  let sh = SS.getSheetByName('FontiPodcast');
  if (!sh) {
    sh = SS.insertSheet('FontiPodcast');
    sh.getRange(1,1,1,7).setValues([['ID','Nome','URL_RSS','Tematica','Attiva','UltimaScan','NumEpisodi']]);
    sh.getRange(1,1,1,7).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    sh.setFrozenRows(1);
    sh.appendRow(['FP'+Date.now(),'Giuditta - Storia Arte','https://www.spreaker.com/show/4545413/episodes/feed','Arte & Mostre',true,'',0]);
  }
  return sh;
}

function getFontiPodcast() {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const fonti = rows.slice(1).filter(r => r[0]).map(r => {
    const o = {}; h.forEach((col,i) => o[col] = r[i]); return o;
  });
  return { fonti };
}

function addFontePodcast(body) {
  if (!body.nome || !body.url) return { error:'Nome e URL obbligatori' };
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  if (rows.slice(1).some(r => r[2] === body.url)) return { error:'Fonte gia presente' };
  const id = 'FP' + Date.now();
  sh.appendRow([id, body.nome, body.url, body.tematica||'Arte & Mostre', true, '', 0]);
  return { ok:true, id };
}

function deleteFontePodcastById(id) {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length-1; i >= 1; i--) {
    if (rows[i][0] === id) { sh.deleteRow(i+1); return { ok:true }; }
  }
  return { error:'Non trovato' };
}

function toggleFontePodcastField(id, field) {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const col = h.indexOf(field);
  if (col < 0) return { error:'Campo non trovato' };
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      const newVal = !rows[i][col];
      sh.getRange(i+1, col+1).setValue(newVal);
      return { ok:true, value: newVal };
    }
  }
  return { error:'Non trovato' };
}

function scanSingolaFontePodcast(id) {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== id) continue;
    const fonte = {}; h.forEach((col,ci) => fonte[col] = rows[i][ci]);
    if (!fonte.Attiva) return { error:'Fonte disattivata' };
    try {
      const added = _scanSingolaFontePodcastRSS(fonte);
      const colScan = h.indexOf('UltimaScan');
      const colNum  = h.indexOf('NumEpisodi');
      if (colScan >= 0) sh.getRange(i+1, colScan+1).setValue(new Date().toISOString().split('T')[0]);
      if (colNum >= 0)  sh.getRange(i+1, colNum+1).setValue(added);
      return { ok:true, added, fonte: fonte.Nome };
    } catch(e) {
      return { error: e.message };
    }
  }
  return { error:'Fonte non trovata' };
}

function _scanSingolaFontePodcastRSS(fonte) {
  const resp = UrlFetchApp.fetch(fonte.URL_RSS, {
    muteHttpExceptions:true,
    headers:{'User-Agent':'Mozilla/5.0 Feedfetcher'}
  });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());
  const xml = resp.getContentText('UTF-8');
  const doc = XmlService.parse(xml);
  const root = doc.getRootElement();
  // Sprint 1.3 (2026-05-01): supporto YouTube Atom feed (root <feed>)
  // YouTube usa Atom: <feed><entry>... invece di RSS <rss><channel><item>...
  const isYoutubeAtom = (root.getName() === 'feed') ||
                        (String(fonte.URL_RSS||'').indexOf('youtube.com') >= 0);
  let items;
  if (isYoutubeAtom) {
    const ns = root.getNamespace();
    items = ns ? root.getChildren('entry', ns) : root.getChildren('entry');
  } else {
    const channel = root.getChild('channel') || root;
    items = channel.getChildren('item');
  }
  const podSh = getPodcastSheet();
  const existRows = podSh.getDataRange().getValues();
  const existLinks = new Set(existRows.slice(1).map(r => String(r[8]||'').trim()));
  let added = 0;
  const now = new Date().toISOString().split('T')[0];
  const tipoContenuto = (fonte.TipoContenuto || (isYoutubeAtom ? 'video' : 'audio'));
  for (let idx = 0; idx < Math.min(items.length, 20); idx++) {
    const item = items[idx];
    let title = '', link = '', pubDate = '';
    if (isYoutubeAtom) {
      const ns = root.getNamespace();
      title = ns ? (item.getChildText('title', ns) || '') : (item.getChildText('title') || '');
      const linkEl = ns ? item.getChild('link', ns) : item.getChild('link');
      if (linkEl) {
        const hrefAttr = linkEl.getAttribute('href');
        link = hrefAttr ? hrefAttr.getValue() : '';
      }
      pubDate = ns ? (item.getChildText('published', ns) || '') : (item.getChildText('published') || '');
    } else {
      title = item.getChildText('title') || '';
      const encl = item.getChild('enclosure');
      link = (encl ? encl.getAttribute('url').getValue() : '') || item.getChildText('link') || '';
      pubDate = item.getChildText('pubDate') || '';
    }
    if (!title || existLinks.has(link)) continue;
    const id = (tipoContenuto === 'video' ? 'VID' : 'POD') + Date.now() + '_' + Math.floor(Math.random()*10000);
    podSh.appendRow([id, now, title, fonte.Nome, '', fonte.Tematica||'Arte & Mostre',
                     '', pubDate, link, '', '', 3, fonte.Nome,
                     false, false, false, 'attivo']);
    existLinks.add(link);
    added++;
    Utilities.sleep(50);
  }
  return added;
}

// ============================================================================
// SPRINT 1.3 (2026-05-01) — VIDEO YOUTUBE & GESTIONE FONTI ESTESA
// ============================================================================

function _youtubeChannelToFeedUrl(input) {
  if (!input) return '';
  var url = String(input).trim();
  if (url.indexOf('feeds/videos.xml') >= 0) return url;
  var m = url.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/);
  if (m) return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + m[1];
  m = url.match(/youtube\.com\/user\/([A-Za-z0-9_-]+)/);
  if (m) return 'https://www.youtube.com/feeds/videos.xml?user=' + m[1];
  m = url.match(/youtube\.com\/playlist\?list=([A-Za-z0-9_-]+)/);
  if (m) return 'https://www.youtube.com/feeds/videos.xml?playlist_id=' + m[1];
  m = url.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/);
  if (m) {
    try {
      var resp = UrlFetchApp.fetch('https://www.youtube.com/@' + m[1], {
        muteHttpExceptions:true, followRedirects:true,
        headers:{'User-Agent':'Mozilla/5.0 Feedfetcher'}
      });
      if (resp.getResponseCode() === 200) {
        var html = resp.getContentText();
        var idMatch = html.match(/"channelId":"(UC[A-Za-z0-9_-]+)"/) ||
                      html.match(/channel\/(UC[A-Za-z0-9_-]+)/);
        if (idMatch) return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + idMatch[1];
      }
    } catch(e) { Logger.log('_youtubeChannelToFeedUrl errore @handle: ' + e.message); }
    return '';
  }
  return '';
}

function addFonteVideoYoutube(body) {
  if (!body || !body.nome || !body.channelUrl) {
    return { error:'Nome e channelUrl obbligatori' };
  }
  var feedUrl = _youtubeChannelToFeedUrl(body.channelUrl);
  if (!feedUrl) {
    return { error:'URL canale YouTube non riconosciuto. Usare /channel/UCxxx, /@handle, /user/xxx o URL feed completo.' };
  }
  _ensureFontiPodTipoContenuto_();
  var sh = _getFontiPodSheet();
  var rows = sh.getDataRange().getValues();
  if (rows.slice(1).some(function(r){ return r[2] === feedUrl; })) {
    return { error:'Feed gia presente' };
  }
  var id = 'FV' + Date.now();
  sh.appendRow([id, body.nome, feedUrl, body.tematica||'Musei & Patrimonio', true, '', 0, 'video']);
  return { ok:true, id: id, feedUrl: feedUrl };
}

function _ensureFontiPodTipoContenuto_() {
  var sh = _getFontiPodSheet();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  if (headers.indexOf('TipoContenuto') >= 0) return;
  var newCol = headers.length + 1;
  sh.getRange(1, newCol).setValue('TipoContenuto').setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
  if (sh.getLastRow() > 1) {
    var defaults = [];
    for (var i = 0; i < sh.getLastRow() - 1; i++) defaults.push(['audio']);
    sh.getRange(2, newCol, defaults.length, 1).setValues(defaults);
  }
}

function populaSeedVideoYoutubeMusei() {
  Logger.log('=== SEED VIDEO YOUTUBE MUSEI ITALIANI ===');
  _ensureFontiPodTipoContenuto_();
  var seed = [
    { nome:'Pinacoteca di Brera',         channelUrl:'https://www.youtube.com/@pinacotecabrera',           tematica:'Musei & Patrimonio' },
    { nome:'Gallerie degli Uffizi',       channelUrl:'https://www.youtube.com/@GallerieUffizi',           tematica:'Musei & Patrimonio' },
    { nome:'MAXXI Museo',                 channelUrl:'https://www.youtube.com/@MuseoMAXXI',                tematica:'Arte Contemporanea' },
    { nome:'Triennale Milano',            channelUrl:'https://www.youtube.com/@TriennaleMilano',           tematica:'Arte Contemporanea' },
    { nome:'Museo Egizio Torino',         channelUrl:'https://www.youtube.com/@MuseoEgizioTorino',         tematica:'Musei & Patrimonio' },
    { nome:'MART Rovereto',               channelUrl:'https://www.youtube.com/@MARTrovereto',              tematica:'Arte Contemporanea' },
    { nome:'Fondazione Cariplo',          channelUrl:'https://www.youtube.com/@FondazioneCariplo',         tematica:'Politiche Culturali' },
    { nome:'Ministero della Cultura',     channelUrl:'https://www.youtube.com/@MiCMinisterodellaCultura',  tematica:'Politiche Culturali' },
    { nome:'ICOM Italia',                 channelUrl:'https://www.youtube.com/@ICOMItalia',                tematica:'Musei & Patrimonio' },
    { nome:'Fondazione Sandretto',        channelUrl:'https://www.youtube.com/@FondazioneSandretto',       tematica:'Arte Contemporanea' }
  ];
  var aggiunti = 0, errori = 0, skip = 0;
  seed.forEach(function(s) {
    var res = addFonteVideoYoutube(s);
    if (res.ok) { aggiunti++; Logger.log('OK: ' + s.nome + ' -> ' + res.feedUrl); }
    else if (String(res.error).indexOf('gia presente') >= 0) { skip++; Logger.log('SKIP: ' + s.nome); }
    else { errori++; Logger.log('ERR: ' + s.nome + ' -> ' + res.error); }
  });
  Logger.log('=== Seed completato: ' + aggiunti + ' aggiunti, ' + skip + ' gia presenti, ' + errori + ' errori ===');
  return { aggiunti: aggiunti, skip: skip, errori: errori };
}

/**
 * Seed RSS podcast culturali italiani (idempotente — salta i già presenti).
 * Da chiamare una volta dalla webapp admin > Podcast & Video > Seed podcast RSS.
 */
function seedFontiPodcastRSS() {
  Logger.log('=== SEED PODCAST RSS CULTURALI ITALIANI ===');
  var seed = [
    { nome:'Rai Radio3 - Wikiradio',         url:'https://www.raiplaysound.it/programmi/wikiradio.xml',                      tematica:'Storia & Patrimonio' },
    { nome:'Rai Radio3 - Fahrenheit',         url:'https://www.raiplaysound.it/programmi/fahrenheit.xml',                     tematica:'Libri & Letteratura' },
    { nome:'Rai Radio3 - Hollywood Party',    url:'https://www.raiplaysound.it/programmi/hollywoodparty.xml',                 tematica:'Cinema & Media' },
    { nome:'Rai Radio3 - Tre soldi',          url:'https://www.raiplaysound.it/programmi/tresoldi.xml',                       tematica:'Politiche Culturali' },
    { nome:'Artribune Podcast',               url:'https://feeds.buzzsprout.com/1234567.rss',                                 tematica:'Arte Contemporanea' },
    { nome:'Il Bo Live - Unipd Cultura',      url:'https://ilbolive.unipd.it/it/feed/podcast',                                tematica:'Ricerca & Accademia' },
    { nome:'Fondazione Golinelli',            url:'https://podcasts-audio.fondazionegolinelli.it/podcast/fondazionegolinelli.xml', tematica:'Innovazione Culturale' },
    { nome:'Musei in Comune Roma - podcast',  url:'https://www.museicapitolini.org/podcast/feed',                             tematica:'Musei & Patrimonio' }
  ];
  _ensureFontiPodTipoContenuto_();
  var sh = _getFontiPodSheet();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL_RSS');
  var existing = new Set();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, iUrl+1, sh.getLastRow()-1, 1).getValues().forEach(function(r){
      existing.add(String(r[0]||'').trim());
    });
  }
  var aggiunti = 0, skip = 0;
  seed.forEach(function(s) {
    if (existing.has(s.url)) { skip++; return; }
    var id = 'FP' + Date.now() + Math.floor(Math.random()*1000);
    sh.appendRow([id, s.nome, s.url, s.tematica, true, '', 0, 'audio']);
    existing.add(s.url);
    aggiunti++;
    Logger.log('OK: ' + s.nome);
    Utilities.sleep(100);
  });
  Logger.log('=== RSS seed: ' + aggiunti + ' aggiunti, ' + skip + ' gia presenti ===');
  return { ok:true, aggiunti: aggiunti, skip: skip };
}

/**
 * Rimuove dal foglio FontiPodcast tutte le righe con URL raiplaysound.it o feeds.spreaker.com/user
 * (domini bloccati da GAS). Da eseguire una sola volta per pulire il seed precedente.
 */
function pulisciFontiPodcastBloccate() {
  var sh = _getFontiPodSheet();
  if (sh.getLastRow() < 2) { Logger.log('FontiPodcast vuoto'); return; }
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL_RSS');
  var BLOCKLIST = [
    'raiplaysound.it',          // RAI blocca IP Google
    'feeds.spreaker.com/user',  // formato user/* non risolve DNS da GAS
    'feeds.buzzsprout.com',     // ID Buzzsprout erano guessati — tutti 404
    'podcasts-audio.fondazionegolinelli.it', // DNS error da GAS
    'museicapitolini.org',      // 404
    'ilbolive.unipd.it'         // 404
  ];
  var data = sh.getDataRange().getValues();
  var toDelete = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var url = String(data[i][iUrl]||'');
    if (BLOCKLIST.some(function(d){ return url.indexOf(d) !== -1; })) {
      toDelete.push(i + 1); // 1-indexed
    }
  }
  toDelete.forEach(function(row) { sh.deleteRow(row); });
  Logger.log('pulisciFontiPodcastBloccate: rimossi ' + toDelete.length + ' feed bloccati');
  return { ok: true, rimossi: toDelete.length };
}

// ============================================================================
// SCANNER VIDEO YOUTUBE — legge FontiPodcast (TipoContenuto='video'),
// scarica i feed Atom YouTube, scrive righe VID* nel foglio Podcast.
// Eseguire manualmente o via trigger dopo aver popolato i canali.
// ============================================================================
function scanVideoYoutube() {
  var SS;
  try {
    var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = SpreadsheetApp.getActiveSpreadsheet() || (sheetId ? SpreadsheetApp.openById(sheetId) : null);
  } catch(e) {
    var sid = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = sid ? SpreadsheetApp.openById(sid) : null;
  }
  if (!SS) { Logger.log('ERR scanVideoYoutube: nessun foglio'); return 0; }

  // Foglio Podcast (crea se assente)
  var shPod = SS.getSheetByName('Podcast');
  if (!shPod) {
    shPod = SS.insertSheet('Podcast');
    var h = ['ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata','DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte','Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord'];
    shPod.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    shPod.setFrozenRows(1);
  }

  // Dedup su colonna Link (col 9 = index 8)
  // v4.18.41 — Dedup via URL canonicalizzato (rimuove utm_*, trailing slash, www, ecc.)
  var existing = new Set();
  if (shPod.getLastRow() > 1) {
    shPod.getRange(2, 9, shPod.getLastRow()-1, 1).getValues().forEach(function(r){
      if (r[0]) {
        var k = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(r[0]) : String(r[0]).trim();
        if (k) existing.add(k);
      }
    });
  }

  // Leggi fonti video da FontiPodcast
  var shFonti = _getFontiPodSheet();
  if (!shFonti || shFonti.getLastRow() < 2) {
    Logger.log('scanVideoYoutube: FontiPodcast vuoto — esegui prima populaSeedVideoYoutubeMusei()');
    return 0;
  }
  var fVals = shFonti.getDataRange().getValues();
  var fHead = fVals[0].map(function(h){ return String(h||'').trim(); });
  var fNome   = fHead.indexOf('Nome');      if (fNome  < 0) fNome  = 1;
  var fUrl    = fHead.indexOf('URL_RSS');   if (fUrl   < 0) fUrl   = 2;
  var fTema   = fHead.indexOf('Tematica'); if (fTema  < 0) fTema  = 3;
  var fAtt    = fHead.indexOf('Attiva');   if (fAtt   < 0) fAtt   = 4;
  var fTipo   = fHead.indexOf('TipoContenuto');

  var fontiVideo = [];
  for (var i = 1; i < fVals.length; i++) {
    var row = fVals[i];
    if (!row[fUrl]) continue;
    var attiva = row[fAtt];
    if (attiva === false || String(attiva).toLowerCase() === 'false') continue;
    var tipo = fTipo >= 0 ? String(row[fTipo]||'').toLowerCase() : '';
    if (tipo !== 'video') continue;
    fontiVideo.push({ nome: row[fNome]||'', url: row[fUrl]||'', tematica: row[fTema]||'Musei & Patrimonio' });
  }

  if (!fontiVideo.length) {
    Logger.log('scanVideoYoutube: nessuna fonte video trovata in FontiPodcast');
    return 0;
  }
  Logger.log('scanVideoYoutube: ' + fontiVideo.length + ' canali da scansionare');

  var totalNuovi = 0;
  fontiVideo.forEach(function(fonte) {
    try {
      Logger.log(' Video: ' + fonte.nome);
      var resp = UrlFetchApp.fetch(fonte.url, {
        muteHttpExceptions: true, followRedirects: true, deadline: 10,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioRadar/4.0)' }
      });
      if (resp.getResponseCode() !== 200) {
        Logger.log('  ! HTTP ' + resp.getResponseCode() + ' per ' + fonte.url);
        return;
      }
      var xml = resp.getContentText().slice(0, 80000);
      // Parse entries dal feed Atom YouTube
      var entries = _parseYoutubeAtom_(xml);
      if (!entries.length) { Logger.log('  -> 0 video estratti'); return; }
      var nuovi = 0;
      entries.forEach(function(v) {
        if (!v.titolo || !v.link) return;
        // v4.18.41 — Dedup via URL canonicalizzato
        var vKey = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(v.link) : v.link;
        if (existing.has(vKey)) return;
        var id = 'VID' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
        shPod.appendRow([
          id, new Date(), v.titolo, fonte.nome, v.autore||fonte.nome,
          fonte.tematica, '',
          v.data ? new Date(v.data) : '',
          v.link, '', '', 3,
          fonte.nome, false, false, false, 'attivo'
        ]);
        existing.add(vKey);
        nuovi++;
        Utilities.sleep(50);
      });
      Logger.log('  -> ' + nuovi + ' nuovi video da ' + fonte.nome);
      totalNuovi += nuovi;
    } catch(e) {
      Logger.log('  ERR ' + fonte.nome + ': ' + e.message);
    }
    Utilities.sleep(500);
  });

  Logger.log('=== scanVideoYoutube completato: ' + totalNuovi + ' nuovi video ===');
  return totalNuovi;
}

// Parser Atom YouTube — estrae titolo, link, data, autore da ogni <entry>
function _parseYoutubeAtom_(xml) {
  var entries = [];
  var entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  var match;
  while ((match = entryRe.exec(xml)) !== null) {
    var block = match[1];
    var titolo = _xmlText_(block, 'title') || _xmlText_(block, 'media:title') || '';
    var link = '';
    var lm = block.match(/rel=["']alternate["'][^>]*href=["']([^"']+)["']/) ||
             block.match(/href=["']([^"']+)["'][^>]*rel=["']alternate["']/);
    if (lm) link = lm[1];
    if (!link) {
      var vidId = block.match(/yt:videoId>(.*?)<\/yt:videoId>/i);
      if (vidId) link = 'https://www.youtube.com/watch?v=' + vidId[1].trim();
    }
    var data = _xmlText_(block, 'published') || _xmlText_(block, 'updated') || '';
    var autore = _xmlText_(block, 'name') || '';
    if (titolo && link) entries.push({ titolo: titolo, link: link, data: data, autore: autore });
  }
  return entries;
}

function _xmlText_(block, tag) {
  var m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim() : '';
}

// ============================================================================
// SCANNER PODCAST DIRETTO — parse RSS 2.0 senza Claude API.
// Usa lo stesso FONTI_PODCAST di scanPodcast ma non richiede API key.
// Eseguire manualmente o via trigger; complementare a scanPodcast.
// ============================================================================
function scanPodcastDiretto() {
  var SS;
  try {
    var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = SpreadsheetApp.getActiveSpreadsheet() || (sheetId ? SpreadsheetApp.openById(sheetId) : null);
  } catch(e) {
    var sid2 = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = sid2 ? SpreadsheetApp.openById(sid2) : null;
  }
  if (!SS) { Logger.log('ERR scanPodcastDiretto: nessun foglio'); return 0; }

  var shPod = SS.getSheetByName('Podcast');
  if (!shPod) {
    shPod = SS.insertSheet('Podcast');
    var h2 = ['ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata','DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte','Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord'];
    shPod.getRange(1,1,1,h2.length).setValues([h2]).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    shPod.setFrozenRows(1);
  }

  // v4.18.41 — Dedup via URL canonicalizzato (rimuove utm_*, trailing slash, www, ecc.)
  var existing = new Set();
  if (shPod.getLastRow() > 1) {
    shPod.getRange(2, 9, shPod.getLastRow()-1, 1).getValues().forEach(function(r){
      if (r[0]) {
        var k = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(r[0]) : String(r[0]).trim();
        if (k) existing.add(k);
      }
    });
  }

  var oggi = new Date();
  var settimanaAnno = getWeekNumberBandi(oggi);
  var totalNuovi = 0;

  // Costruisce lista fonti: FONTI_PODCAST (array) + FontiPodcast sheet (TipoContenuto='audio')
  var tutteLeFonti = FONTI_PODCAST.filter(function(f){ return f.priorita !== 2 || settimanaAnno % 2 === 0; });
  try {
    var shFP = _getFontiPodSheet();
    if (shFP && shFP.getLastRow() > 1) {
      var fpVals = shFP.getDataRange().getValues();
      var fpHead = fpVals[0].map(function(h){ return String(h||'').trim(); });
      var fpNome = fpHead.indexOf('Nome'), fpUrl = fpHead.indexOf('URL_RSS');
      var fpTema = fpHead.indexOf('Tematica'), fpAtt = fpHead.indexOf('Attiva');
      var fpTipo = fpHead.indexOf('TipoContenuto');
      for (var fi = 1; fi < fpVals.length; fi++) {
        var fr = fpVals[fi];
        if (!fr[fpUrl]) continue;
        var fatt = fr[fpAtt]; if (fatt === false || String(fatt).toLowerCase() === 'false') continue;
        var ftipo = fpTipo >= 0 ? String(fr[fpTipo]||'').toLowerCase() : 'audio';
        if (ftipo !== 'audio' && ftipo !== '') continue;
        var furl = String(fr[fpUrl]||'').trim();
        // evita duplicati con FONTI_PODCAST
        if (tutteLeFonti.some(function(x){ return x.url === furl; })) continue;
        tutteLeFonti.push({ nome: String(fr[fpNome]||''), url: furl, tematica: String(fr[fpTema]||'Musei & Patrimonio'), priorita:1 });
      }
    }
  } catch(efp) { Logger.log('WARN FontiPodcast sheet: ' + efp.message); }

  Logger.log('scanPodcastDiretto: ' + tutteLeFonti.length + ' fonti totali');

  // Domini bloccati da GAS (RAI blocca IP Google; formato user/* Spreaker non risolve DNS)
  var SKIP_DOMAINS = ['raiplaysound.it', 'feeds.spreaker.com/user'];

  tutteLeFonti.forEach(function(fonte) {
    var skipThis = SKIP_DOMAINS.some(function(d) { return fonte.url.indexOf(d) !== -1; });
    if (skipThis) { Logger.log(' SKIP (dominio bloccato): ' + fonte.nome + ' — ' + fonte.url); return; }
    try {
      Logger.log(' PodcastDiretto: ' + fonte.nome);
      var resp = UrlFetchApp.fetch(fonte.url, {
        muteHttpExceptions: true, followRedirects: true, deadline: 10,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioRadar/4.0)' }
      });
      if (resp.getResponseCode() !== 200) {
        Logger.log('  ! HTTP ' + resp.getResponseCode()); return;
      }
      // Tronca a 100KB per evitare backtracking catastrofico su feed enormi (RAI)
      var xml = resp.getContentText().slice(0, 100000);
      var items = _parseRSSItems_(xml);
      if (!items.length) { Logger.log('  -> 0 episodi'); return; }
      var nuovi = 0;
      items.slice(0, 20).forEach(function(ep) {
        if (!ep.titolo) return;
        var link = ep.link || '';
        // v4.18.41 — Dedup via URL canonicalizzato
        var epKey = link ? ((typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(link) : link) : '';
        if (epKey && existing.has(epKey)) return;
        var id = 'POD' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
        shPod.appendRow([
          id, new Date(), ep.titolo, fonte.nome, ep.autore||fonte.nome,
          fonte.tematica||'Musei & Patrimonio', ep.durata||'',
          ep.data ? new Date(ep.data) : '', link,
          ep.sommario||'', '', 3, fonte.nome,
          false, false, false, 'attivo'
        ]);
        if (epKey) existing.add(epKey);
        nuovi++;
        Utilities.sleep(50);
      });
      Logger.log('  -> ' + nuovi + ' nuovi da ' + fonte.nome);
      totalNuovi += nuovi;
    } catch(e) {
      Logger.log('  ERR ' + fonte.nome + ': ' + e.message);
    }
    Utilities.sleep(300);
  });

  Logger.log('=== scanPodcastDiretto completato: ' + totalNuovi + ' nuovi episodi ===');
  return totalNuovi;
}

// Parser RSS 2.0 standard — estrae titolo, link, data, autore, durata, sommario da ogni <item>
function _parseRSSItems_(xml) {
  var items = [];
  var itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  var match;
  while ((match = itemRe.exec(xml)) !== null) {
    var block = match[1];
    var titolo = _xmlText_(block, 'title') || '';
    // Link: prima prova <link>, poi enclosure url
    var link = _xmlText_(block, 'link') || '';
    if (!link) {
      var em = block.match(/enclosure[^>]+url=["']([^"']+)["']/i);
      if (em) link = em[1];
    }
    // Pulisci link da eventuali tag CDATA e spazi
    link = link.replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    var dataTxt = _xmlText_(block, 'pubDate') || _xmlText_(block, 'published') || '';
    var durata = _xmlText_(block, 'itunes:duration') || '';
    var autore = _xmlText_(block, 'itunes:author') || _xmlText_(block, 'author') || '';
    var sommario = (_xmlText_(block, 'itunes:summary') || _xmlText_(block, 'description') || '').slice(0, 300);
    var dataObj = null;
    if (dataTxt) {
      try { dataObj = new Date(dataTxt); if (isNaN(dataObj.getTime())) dataObj = null; } catch(e2) {}
    }
    if (titolo) items.push({ titolo: titolo, link: link, data: dataObj, autore: autore, durata: durata, sommario: sommario });
  }
  return items;
}

function getFontiStats() {
  var stats = {
    fontiBandi: { totale: 0, attive: 0 },
    fontiPodcast: { totale: 0, attive: 0, audio: 0, video: 0 }
  };
  try {
    var fb = getFontiBandi();
    if (fb && fb.fonti) {
      stats.fontiBandi.totale = fb.fonti.length;
      stats.fontiBandi.attive = fb.fonti.filter(function(f){ return f.Attiva === true; }).length;
    }
  } catch(e) { Logger.log('getFontiStats bandi err: ' + e.message); }
  try {
    var fp = getFontiPodcast();
    if (fp && fp.fonti) {
      stats.fontiPodcast.totale = fp.fonti.length;
      stats.fontiPodcast.attive = fp.fonti.filter(function(f){ return f.Attiva === true; }).length;
      stats.fontiPodcast.audio = fp.fonti.filter(function(f){ return (f.TipoContenuto||'audio') === 'audio'; }).length;
      stats.fontiPodcast.video = fp.fonti.filter(function(f){ return f.TipoContenuto === 'video'; }).length;
    }
  } catch(e) { Logger.log('getFontiStats podcast err: ' + e.message); }
  return stats;
}


// ==================================================================
// FIX FONTI PROBLEMATICHE - eseguire una sola volta dal GAS editor
// Corregge URL errati e disattiva fonti non funzionanti nel foglio Fonti
// ==================================================================
function fixFontiProblematiche() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return; }

  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const nomeCol  = h.indexOf('Nome')  + 1;
  const urlCol   = h.indexOf('URL')   + 1;
  const rssCol   = h.indexOf('RSSURL')+ 1;
  const attivaCol= h.indexOf('Attiva')+ 1;

  // URL da correggere: { cerca: stringa nell'URL, nuovoRSS: nuovo valore }
  const correzioni = [
    { cerca:'flashartonline.it', nuovoRSS:'https://flash---art.it/feed/', log:'Flash Art URL corretto' },
  ];

  // Parole chiave nel nome per disattivare la fonte
  const daDisattivare = [
    'ANCI Cultura','CCW Welfare','Artefatti','FASI Europa',
    'Itinerari Arte','flashartonline',
  ];

  let corretti = 0, disattivati = 0;

  for (let i = 1; i < rows.length; i++) {
    const nome = String(rows[i][nomeCol-1]||'');
    const url  = String(rows[i][urlCol-1]||'');
    const rss  = String(rows[i][rssCol-1]||'');

    // Correzioni URL
    correzioni.forEach(fix => {
      if (url.includes(fix.cerca) || rss.includes(fix.cerca)) {
        if (rssCol > 0) sh.getRange(i+1, rssCol).setValue(fix.nuovoRSS);
        if (urlCol > 0) sh.getRange(i+1, urlCol).setValue('https://flash---art.it/');
        Logger.log('[FIX] ' + fix.log + ' (riga ' + (i+1) + ')');
        corretti++;
      }
    });

    // Disattivazioni
    const daDisatt = daDisattivare.some(kw => nome.toLowerCase().includes(kw.toLowerCase()) || url.toLowerCase().includes(kw.toLowerCase()));
    if (daDisatt && attivaCol > 0) {
      const attiva = rows[i][attivaCol-1];
      if (attiva === true || attiva === 'TRUE' || attiva === 1) {
        sh.getRange(i+1, attivaCol).setValue(false);
        Logger.log('[OFF] Disattivata: ' + nome + ' (riga ' + (i+1) + ')');
        disattivati++;
      }
    }
  }

  Logger.log('[OK] fixFontiProblematiche: ' + corretti + ' corrette, ' + disattivati + ' disattivate');
  SpreadsheetApp.flush();
}


// Aggiunge le fonti AI al foglio Fonti con Ambito=5 (eseguire una sola volta)
function addFontiAIAlFoglioFonti() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return 0; }
  const existing = sh.getDataRange().getValues().map(r => r[2]||r[3]); // URL o RSSURL
  const fontiAI = [
    { nome:'Agenda Digitale',       url:'https://www.agendadigitale.eu/', rss:'https://www.agendadigitale.eu/feed/' },
    { nome:'We Make Money Not Art', url:'https://we-make-money-not-art.com/', rss:'https://we-make-money-not-art.com/feed/' },
    { nome:'MIT Technology Review', url:'https://www.technologyreview.com/', rss:'https://www.technologyreview.com/feed/' },
    { nome:'AI News Italia',        url:'https://ainews.it/', rss:'https://ainews.it/feed/' },
    { nome:'FrizziFrizzi Arte',     url:'https://www.frizzifrizzi.it/', rss:'https://www.frizzifrizzi.it/category/arte/feed/' },
    { nome:'Artspecialday',         url:'https://www.artspecialday.com/', rss:'https://www.artspecialday.com/feed/' },
  ];
  let added = 0;
  fontiAI.forEach(f => {
    if (!existing.includes(f.rss) && !existing.includes(f.url)) {
      const id = 'AI' + Date.now();
      sh.appendRow([id, f.nome, f.url, f.rss, 5, 'Digital, AI e governance', true, '', 0]);
      added++;
      Utilities.sleep(100);
    }
  });
  Logger.log('[OK] addFontiAIAlFoglioFonti: ' + added + ' fonti AI aggiunte al foglio Fonti');
  return added;
}


// ==================================================================
// SISTEMA TOKEN DIGEST READER v4.3-fix
// Colonne extra MailingList: Token | TokenExpiry | DigestIds
// FIX: colonne aggiunte correttamente una alla volta + flush + null-check
// ==================================================================

// --- Digest functions extracted to DigestService.js (Sprint 2, 2026-05-26) ---


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
    const list = getMailingList().list;
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

// ==================================================================
// STATISTICHE
// ==================================================================

function getStats() {
  let total=0, unread=0, saved=0, highScore=0, digest=0;
  try {
    const sh = getMainSS().getSheetByName(SH.ITEMS);
    if (sh) {
      const rows=sh.getDataRange().getValues(), h=rows[0];
      const lettoI=h.indexOf('Letto'), salvI=h.indexOf('Salvato'),
            archI=h.indexOf('Archiviato'), scoreI=h.indexOf('Score'), digI=h.indexOf('InclusiNelDigest');
      for (let i=1;i<rows.length;i++) {
        const r=rows[i]; if(!r[0]) continue; total++;
        if(!r[lettoI]) unread++;
        if(r[salvI])   saved++;
        if(r[scoreI]>=4) highScore++;
        if(r[digI])    digest++;
      }
    }
  } catch(e) { Logger.log('getStats Items: '+e.message); }

  let bandiAttivi=0, bandiUrgenti=0, bandiNuovi=0, bandiArchiviati=0;
  try {
    const bandi = getBandiRadar();
    const oggi = new Date();
    bandiNuovi      = bandi.filter(b=>b.status==='Nuovo'&&b.statoRecord!=='archiviato').length;
    bandiArchiviati = bandi.filter(b=>b.statoRecord==='archiviato').length;
    bandiAttivi     = bandi.filter(b=>b.statoRecord!=='archiviato').length;
    bandiUrgenti    = bandi.filter(b=>{
      if(b.statoRecord==='archiviato') return false;
      const d=b.scadenza?Math.ceil((new Date(b.scadenza)-oggi)/86400000):null;
      return d!==null&&d>=0&&d<=20;
    }).length;
  } catch(e) { Logger.log('getStats Bandi: '+e.message); }

  const oggi=new Date(), dow=oggi.getDay();
  const giorniALun=(1-dow+7)%7||7;
  const prossimo=new Date(oggi.getTime()+giorniALun*86400000);
  // Contatori per ambito notizie
  const perAmbito = {1:0, 2:0, 3:0, 4:0, 5:0};
  const perAmbitoUnread = {1:0, 2:0, 3:0, 4:0, 5:0};
  try {
    const sh = getMainSS().getSheetByName(SH.ITEMS);
    if (sh) {
      const rows = sh.getDataRange().getValues(), h = rows[0];
      const ambI = h.indexOf('Ambito'), lettoI = h.indexOf('Letto'), archI = h.indexOf('Archiviato');
      for (let i=1;i<rows.length;i++) {
        const r=rows[i]; if(!r[0]||r[archI]) continue;
        const amb = parseInt(r[ambI])||0;
        if (perAmbito[amb] !== undefined) {
          perAmbito[amb]++;
          if (!r[lettoI]) perAmbitoUnread[amb]++;
        }
      }
    }
  } catch(e) {}

  // Contatori podcast per tematica
  const podPerTematica = {};
  let podTotale = 0, podNuovi = 0;
  try {
    const podSh = getMainSS().getSheetByName(SH.PODCAST);
    if (podSh && podSh.getLastRow() > 1) {
      const pr = podSh.getDataRange().getValues(), ph = pr[0];
      const temI=ph.indexOf('Tematica'), ascI=ph.indexOf('Ascoltato'), srI=ph.indexOf('StatoRecord');
      const daI=ph.indexOf('DaAscoltare');
      for (let i=1;i<pr.length;i++) {
        const r=pr[i]; if(!r[0]) continue;
        const sr=String(r[srI]||'attivo').toLowerCase();
        if (sr==='archiviato') continue;
        const tem=String(r[temI]||'Altro');
        podPerTematica[tem]=(podPerTematica[tem]||0)+1;
        podTotale++;
        if (!r[ascI]) podNuovi++;
      }
    }
  } catch(e) {}

  return { total,unread,saved,highScore,digest,
           bandiAttivi,bandiUrgenti,bandiNuovi,bandiArchiviati,
           prossimoScan: formatDate(prossimo)+' - ore 06:00',
           perAmbito, perAmbitoUnread,
           podPerTematica, podTotale, podNuovi };
}

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
  // v5.1: dopo unificazione, punta a Bandi_v5 (fallback a RADAR BANDI legacy)
  var ss = getMainSS();
  var sh = ss.getSheetByName('Bandi_v5');
  if (sh) return sh;
  sh = ss.getSheetByName(SHEET_RADAR);
  if (sh) return sh;
  return ss.getSheetByName('_RADAR_BANDI_LEGACY_');
}

// v4.18.38 (audit 2026-05-14) — Rimosse 3 funzioni morte:
//   • getSheetRadarStandaloneLegacy()       — fallback Radar ID hardcoded, mai chiamato
//   • consolidaBandiInFilePrincipale()      — migrazione standalone→principale (Sprint 1.3 D2.5h), già applicata
//   • addNuoveColonneRadar()                — migrazione schema RADAR colonne 18-20, già applicata
// Recuperabili da git history se servono per audit.

function diagBandiSheet() {
  const sheet=getSheetRadar();
  if(!sheet) return {error:'Foglio RADAR BANDI non trovato'};
  const lastCol=sheet.getLastColumn();
  const headers=sheet.getRange(1,1,1,lastCol).getValues()[0];
  const atteso=Object.entries(COL).map(([k,v])=>({campo:k,colAttesa:v,intestazione:headers[v-1]||'(vuota)'}));
  const sample=sheet.getLastRow()>1
    ?sheet.getRange(2,1,1,lastCol).getValues()[0].map((v,i)=>({col:i+1,header:headers[i]||'?',val:String(v).substring(0,40)}))
    :[];
  return {totalCol:lastCol,totalRighe:sheet.getLastRow()-1,headers,atteso,sample};
}

const COL_NAMES = {
  DATA_RILEVAMENTO:['Data','DataRilevamento','Data Rilevamento'],
  TITOLO:['Titolo','titolo','Nome','Bando'],
  ENTE:['Ente','ente','Organizzazione'],
  LIVELLO:['Livello','livello'],
  REGIONE:['Regione','regione'],
  SETTORE:['Settore','settore'],
  SOGGETTI:['Soggetti','soggetti','Beneficiari'],
  IMPORTO:['Importo','importo','Budget'],
  COFIN:['Cofin','cofin','Cofinanziamento'],
  SCADENZA:['Scadenza','scadenza','Deadline'],
  STATUS:['Status','status','Stato'],
  CLIENTE:['Cliente','cliente'],
  LINK:['Link','link','URL','url','Fonte URL','Link Bando'],
  NOTE:['Note','note','Descrizione'],
  FONTE:['Fonte','fonte','Sorgente'],
  PRIORITA:['Priorita','priorita','Priorita','priorita'],
  NASCOSTO:['Nascosto','nascosto','Hidden'],
  STATO_RECORD:['StatoRecord','statoRecord','stato_record','STATO_RECORD'],
  URL_ENTE:['UrlEnte','urlEnte','url_ente','URL_ENTE','LinkEnte'],
  LETTO_BANDO:['LettoBando','lettoBando','letto_bando','LETTO_BANDO'],
};

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
    const g=k=>row[(C[k]||COL[k])-1];
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
      statoRecord:String(g('STATO_RECORD')||'attivo'),  // *
      urlEnte:String(g('URL_ENTE')||''),                // *
      lettoBando:g('LETTO_BANDO')===true||g('LETTO_BANDO')==='TRUE', // * v3.1
      ambito: parseInt(g('AMBITO'))||null,              // FIX Sprint 1.2: aggiunto ambito per filtro vista ambito
    });
  });
  return bandi;
}

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

// * v3.1 - Toggle lettura bando (col 20)
/**
 * @deprecated v4.18.40 — Usare markRead('bando', id) in Workflow_unified.js.
 *   Questa funzione lavora sul foglio RADAR BANDI legacy v4.
 */
function toggleLettoBando(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  const current=sheet.getRange(rowIndex,COL.LETTO_BANDO).getValue();
  const newVal=!current;
  sheet.getRange(rowIndex,COL.LETTO_BANDO).setValue(newVal);
  return {ok:true, value:newVal};
}

/**
 * @deprecated v4.18.40 — Usare archive('bando', id) in Workflow_unified.js.
 *   Questa funzione lavora sul foglio RADAR BANDI legacy v4 (col STATO_RECORD).
 */
function archiviaRecord(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.getRange(rowIndex,COL.STATO_RECORD).setValue('archiviato');
  return {ok:true};
}

/**
 * @deprecated v4.18.40 — Usare restore('bando', id) in Workflow_unified.js.
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function ripristinaRecord(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.getRange(rowIndex,COL.STATO_RECORD).setValue('attivo');
  return {ok:true};
}

/**
 * @deprecated v4.18.40 — Usare archive() + autoDeleteVeryOld() in Workflow_unified.js.
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function deleteArchiviato(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  const stato=sheet.getRange(rowIndex,COL.STATO_RECORD).getValue();
  if(stato!=='archiviato') return {error:'Record non archiviato'};
  sheet.deleteRow(rowIndex);
  return {ok:true};
}

/**
 * @deprecated v4.18.40 — Usare API unificata di Workflow_unified.js (archive/restore bulk).
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function deleteArchivioBulk(ids) {
  if(!ids||!ids.length) return {error:'Nessun ID'};
  const sheet=getSheetRadar();
  const rowIndices=ids.map(id=>parseInt(id.replace('r',''))).filter(n=>!isNaN(n)&&n>1);
  rowIndices.sort((a,b)=>b-a); // ordine decrescente -- critico!
  let deleted=0;
  rowIndices.forEach(rowIndex=>{
    try {
      const stato=sheet.getRange(rowIndex,COL.STATO_RECORD).getValue();
      if(stato==='archiviato') { sheet.deleteRow(rowIndex); deleted++; }
    } catch(e) { Logger.log('deleteArchivioBulk riga '+rowIndex+': '+e.message); }
  });
  return {ok:true, deleted};
}

/**
 * @deprecated v4.18.40 — Usare autoDeleteVeryOld('bando', soglia_mesi) in Workflow_unified.js.
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function deleteArchivioTutto() {
  const sheet=getSheetRadar();
  const lastRow=sheet.getLastRow();
  if(lastRow<2) return {ok:true, deleted:0};
  const data=sheet.getRange(2,COL.STATO_RECORD,lastRow-1,1).getValues();
  const toDelete=[];
  for(let i=data.length-1;i>=0;i--) {
    if(data[i][0]==='archiviato') toDelete.push(i+2);
  }
  toDelete.forEach(row=>{ try{sheet.deleteRow(row);}catch(e){} });
  return {ok:true, deleted:toDelete.length};
}

// ==================================================================
// AUTO-ARCHIVIAZIONE NOTIZIE VECCHIE (>30 giorni)
// Chiamata da lunediMattina - non archivia salvate o in digest
// ==================================================================
/**
 * @deprecated v4.18.40 — Usare autoArchiveOld('news', 30) in Workflow_unified.js.
 *   Wrapper legacy mantenuto per backward-compat con trigger lunediMattina.
 */
function autoArchiviaNotizieVecchie() {
  const sh = getMainSS().getSheetByName(SH.ITEMS);
  if (!sh || sh.getLastRow() < 2) return 0;
  const rows = sh.getDataRange().getValues(), h = rows[0];
  const idI=h.indexOf('ID'), dataI=h.indexOf('DataAcquisizione'),
        archI=h.indexOf('Archiviato'), salvI=h.indexOf('Salvato'),
        digI=h.indexOf('InclusiNelDigest');
  if (idI<0||dataI<0) { Logger.log('autoArchiviaNotizieVecchie: colonne mancanti'); return 0; }
  const oggi=new Date(), soglia=30*86400000;
  let archiviati=0;
  for (let i=1;i<rows.length;i++) {
    const r=rows[i];
    if (!r[idI]) continue;
    if (r[archI]) continue;          // gia archiviata
    if (r[salvI]) continue;          // salvata - non toccare
    if (r[digI]) continue;           // in digest - non toccare
    const data=r[dataI] instanceof Date ? r[dataI] : new Date(r[dataI]);
    if (isNaN(data)) continue;
    if ((oggi-data) >= soglia) {
      sh.getRange(i+1, archI+1).setValue(true);
      archiviati++;
    }
  }
  if (archiviati>0) Logger.log('[AUTO-ARCH] Archiviate '+archiviati+' notizie >30gg');
  return archiviati;
}

// ==================================================================
// STATISTICHE SALUTE DATABASE
// ==================================================================
function getGestioneStats() {
  const SS = getMainSS();
  const stats = {};
  const oggi = new Date();
  try {
    const sh = SS.getSheetByName(SH.ITEMS);
    if (sh) {
      const rows = sh.getDataRange().getValues(), h = rows[0];
      const archI=h.indexOf('Archiviato'), salvI=h.indexOf('Salvato'),
            digI=h.indexOf('InclusiNelDigest'), dataI=h.indexOf('DataAcquisizione');
      let totale=0, archiviati=0, salvati=0, digest=0, vecchi30=0, vecchi90=0;
      for (let i=1;i<rows.length;i++) {
        const r=rows[i]; if(!r[0]) continue; totale++;
        if(r[archI]) archiviati++;
        if(r[salvI]) salvati++;
        if(r[digI]) digest++;
        const d=r[dataI] instanceof Date?r[dataI]:new Date(r[dataI]);
        if(!isNaN(d)){
          const age=(oggi-d)/86400000;
          if(age>30&&!r[archI]&&!r[salvI]) vecchi30++;
          if(age>90) vecchi90++;
        }
      }
      stats.notizie={totale,archiviati,salvati,digest,vecchi30,vecchi90};
    }
  } catch(e) { stats.notizie={totale:0}; }
  try {
    const bandi=getBandiRadar();
    stats.bandi={totale:bandi.length,attivi:bandi.filter(b=>b.statoRecord!=='archiviato').length,archiviati:bandi.filter(b=>b.statoRecord==='archiviato').length};
  } catch(e) { stats.bandi={totale:0}; }
  try {
    const podSh=SS.getSheetByName(SH.PODCAST);
    const podTot=podSh?Math.max(0,podSh.getLastRow()-1):0;
    stats.podcast={totale:podTot};
  } catch(e) { stats.podcast={totale:0}; }
  return stats;
}

// Archivia bulk notizie piu' vecchie di N giorni
/**
 * @deprecated v4.18.40 — Usare autoArchiveOld('news', giorni) in Workflow_unified.js.
 */
function archiviaNotizieOlderThan(giorni) {
  const sh = getMainSS().getSheetByName(SH.ITEMS);
  if (!sh || sh.getLastRow() < 2) return {ok:true, archiviati:0};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const archI=h.indexOf('Archiviato'), salvI=h.indexOf('Salvato'),
        digI=h.indexOf('InclusiNelDigest'), dataI=h.indexOf('DataAcquisizione'), idI=h.indexOf('ID');
  const soglia=(giorni||30)*86400000, oggi=new Date();
  let archiviati=0;
  for (let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[idI]||r[archI]||r[salvI]||r[digI]) continue;
    const d=r[dataI] instanceof Date?r[dataI]:new Date(r[dataI]);
    if(!isNaN(d)&&(oggi-d)>=soglia) { sh.getRange(i+1,archI+1).setValue(true); archiviati++; }
  }
  return {ok:true, archiviati};
}

// Elimina definitivamente tutti gli archiviati (bulk, dal piu' vecchio)
/**
 * @deprecated v4.18.40 — Usare autoDeleteVeryOld('news', soglia_mesi) in Workflow_unified.js.
 *   Operazione distruttiva: la nuova API ha controlli su soglia temporale invece di "tutti".
 */
function eliminaArchiviatiTutti() {
  const sh = getMainSS().getSheetByName(SH.ITEMS);
  if (!sh || sh.getLastRow() < 2) return {ok:true, eliminati:0};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const archI=h.indexOf('Archiviato'), idI=h.indexOf('ID');
  const toDelete=[];
  for (let i=rows.length-1;i>=1;i--) { if(rows[i][idI]&&rows[i][archI]) toDelete.push(i+1); }
  toDelete.forEach(r=>sh.deleteRow(r));
  return {ok:true, eliminati:toDelete.length};
}


// Auto-archivia bandi scaduti da 30+ gg (chiamato da lunediMattina in ScannerBandi.gs)
/**
 * @deprecated v4.18.40 — Usare cleanupBandiV5Scaduti(30) in Bandi_v5.js per Bandi_v5,
 *   oppure autoArchiveOld('bando', 30) in Workflow_unified.js per il foglio RADAR BANDI legacy.
 */
function autoArchiviaScaduti() {
  const sheet=getSheetRadar();
  if(!sheet||sheet.getLastRow()<2) return 0;
  const oggi=new Date();
  const data=sheet.getRange(2,1,sheet.getLastRow()-1,18).getValues();
  let n=0;
  data.forEach((row,idx)=>{
    if(!row[COL.TITOLO-1]) return;
    if(String(row[COL.STATO_RECORD-1]||'attivo')==='archiviato') return;
    const scad=row[COL.SCADENZA-1];
    if(!scad) return;
    const dataScad=scad instanceof Date?scad:new Date(scad);
    if(isNaN(dataScad)) return;
    if(Math.floor((oggi-dataScad)/86400000)>=30) {
      sheet.getRange(idx+2,COL.STATO_RECORD).setValue('archiviato');
      n++;
    }
  });
  if(n>0) Logger.log('Auto-archiviati '+n+' bandi scaduti');
  return n;
}

// ==================================================================
// TELEGRAM
// ==================================================================

function sendTelegram(message) {
  if(!TELEGRAM_TOKEN||!TELEGRAM_CHAT_ID) return {ok:false,error:'Token o Chat ID mancanti'};
  try {
    const resp=UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,{
      method:'post', contentType:'application/json',
      payload:JSON.stringify({chat_id:TELEGRAM_CHAT_ID,text:message,parse_mode:'Markdown',disable_web_page_preview:false}),
      muteHttpExceptions:true,
    });
    const result=JSON.parse(resp.getContentText());
    if(!result.ok) throw new Error('Telegram: '+result.description);
    return {ok:true, messageId:result.result.message_id};
  } catch(err) {
    Logger.log('Errore Telegram: '+err.message);
    return {ok:false, error:err.message};
  }
}

function sendTestTelegram() {
  return sendTelegram(`OK *Test OSSERVATORIO CULTURALE v3.0*\nData: ${formatDateIT(new Date())}\n_Duemilamusei_`);
}

function formatDateIT(d) {
  if(!d||!(d instanceof Date)) return '-';
  return Utilities.formatDate(d,'Europe/Rome','dd/MM/yyyy');
}
function formatEur(n) { if(!n) return '-'; return 'EUR'+Number(n).toLocaleString('it-IT'); }

// ==================================================================
// ITEMS
// ==================================================================

function getItems(params) {
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  if(!sh) return {items:[],total:0};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  if(!h||h.length===0) return {items:[],total:0};
  const items=[];
  for(let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]) continue;
    const item={}; h.forEach((col,idx)=>{item[col]=r[idx];});
    if(params.ambito&&item.Ambito!=params.ambito) continue;
    if(params.score&&item.Score<parseInt(params.score)) continue;
    if(params.stato==='unread'&&item.Letto) continue;
    if(params.stato==='saved'&&!item.Salvato) continue;
    if(params.stato==='archived'&&!item.Archiviato) continue;
    if(params.stato==='digest'&&!item.InclusiNelDigest) continue;
    if(params.stato==='letti'&&!item.Letto) continue;
    if(!params.archived&&item.Archiviato&&params.stato!=='archived'&&params.stato!=='letti') continue;
    if(params.q) {
      const q=params.q.toLowerCase();
      if(!((item.Titolo||'').toLowerCase().includes(q)||(item.Fonte||'').toLowerCase().includes(q)||
           (item.TagAI||'').toLowerCase().includes(q)||(item.SommarioAI||'').toLowerCase().includes(q))) continue;
    }
    if(params.tipo&&item.Tipologia!==params.tipo) continue;
    if(item.SommarioEditato) item.SommarioAI=item.SommarioEditato;
    if(item.DataPubblicazione instanceof Date) item.DataPubblicazione=formatDate(item.DataPubblicazione);
    if(item.DataAcquisizione instanceof Date)  item.DataAcquisizione=formatDate(item.DataAcquisizione);
    if(item.Scadenza instanceof Date) item.Scadenza=formatDate(item.Scadenza);
    items.push(item);
  }
  items.sort((a,b)=>b.Score-a.Score||(a.Letto===b.Letto?0:a.Letto?1:-1));
  return {items, total:items.length};
}

function getItemsByIds(ids) {
  if(!ids||!ids.length) return [];
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const items=[];
  for(let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]||!ids.includes(r[0])) continue;
    const item={}; h.forEach((col,idx)=>{item[col]=r[idx];});
    if(item.SommarioEditato) item.SommarioAI=item.SommarioEditato;
    if(item.DataPubblicazione instanceof Date) item.DataPubblicazione=formatDate(item.DataPubblicazione);
    if(item.Scadenza instanceof Date) item.Scadenza=formatDate(item.Scadenza);
    items.push(item);
  }
  return items;
}

function editSommario(body) {
  if(!body.id||!body.sommario) return {error:'Campi mancanti'};
  return setItemField(body.id,'SommarioEditato',body.sommario);
}

/**
 * @deprecated v4.18.40 — Usare markRead('item', id) o toggleSaved('item', id) in Workflow_unified.js
 *   per i flag specifici. Questa funzione generica accetta qualunque colonna boolean.
 */
function toggleItemField(id,field) {
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), fieldCol=h.indexOf(field);
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id) {
      const nv=!rows[i][fieldCol]; sh.getRange(i+1,fieldCol+1).setValue(nv); return {ok:true,value:nv};
    }
  }
  return {error:'Item non trovato'};
}

/**
 * @deprecated v4.18.40 — Usare API dedicate di Workflow_unified.js per i campi specifici
 *   (markRead, toggleSaved, archive, restore). Questa funzione generica imposta qualunque
 *   campo del foglio Items.
 */
function setItemField(id,field,value) {
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), fieldCol=h.indexOf(field);
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id) { sh.getRange(i+1,fieldCol+1).setValue(value); return {ok:true}; }
  }
  return {error:'Item non trovato'};
}

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

// -- MAILING -------------------------------------------------------
function getMailingList() {
  var list = _sheetToObjects(SH.MAILING);
  list.forEach(function(m) {
    if (m.DataIscrizione instanceof Date) m.DataIscrizione = formatDate(m.DataIscrizione);
  });
  return {list: list};
}

function saveMailing(body) {
  var email = String(body.email || body.Email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) return {error: 'Email non valida'};
  // GDPR: consenso obbligatorio per nuove iscrizioni
  if (!body.id && !body.ConsensoGDPR) return {error: 'Consenso GDPR obbligatorio'};

  var sh = getMainSS().getSheetByName(SH.MAILING);
  var rows = sh.getDataRange().getValues(), h = rows[0];

  // Ensure GDPR columns exist
  var gdprCols = ['ConsensoGDPR','TimestampConsenso','Sorgente','Stato'];
  var lastCol = h.length;
  gdprCols.forEach(function(col) {
    if (h.indexOf(col) < 0) {
      lastCol++;
      sh.getRange(1, lastCol).setValue(col);
      h.push(col);
    }
  });

  // Update existing
  if (body.id) {
    var idCol = h.indexOf('ID');
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][idCol] === body.id) {
        sh.getRange(i+1, 1, 1, h.length).setValues([[body.id, body.nome||'', email, body.ruolo||'lettore', body.attivo!==false, rows[i][h.indexOf('DataIscrizione')],
          rows[i][h.indexOf('Token')]||'', rows[i][h.indexOf('TokenExpiry')]||'', rows[i][h.indexOf('DigestIds')]||'',
          body.ConsensoGDPR||rows[i][h.indexOf('ConsensoGDPR')]||false,
          body.TimestampConsenso||rows[i][h.indexOf('TimestampConsenso')]||'',
          body.Sorgente||rows[i][h.indexOf('Sorgente')]||'',
          body.Stato||rows[i][h.indexOf('Stato')]||'confermato'
        ]]);
        return {ok:true};
      }
    }
  }

  // Check duplicate email
  var emailCol = h.indexOf('Email');
  for (var j = 1; j < rows.length; j++) {
    if (String(rows[j][emailCol]||'').toLowerCase().trim() === email) {
      return {ok:true, id: rows[j][h.indexOf('ID')], existing: true};
    }
  }

  // New subscriber
  var id = 'M' + Date.now();
  var newRow = [id, body.nome||'', email, body.ruolo||'lettore', true, new Date()];
  // Pad for Token, TokenExpiry, DigestIds (may already exist)
  while (newRow.length < h.indexOf('ConsensoGDPR')) newRow.push('');
  // GDPR fields
  var iGdpr = h.indexOf('ConsensoGDPR');
  while (newRow.length < iGdpr) newRow.push('');
  newRow[iGdpr] = true;
  newRow[h.indexOf('TimestampConsenso')] = new Date().toISOString();
  newRow[h.indexOf('Sorgente')] = body.Sorgente || 'modal';
  newRow[h.indexOf('Stato')] = 'pending'; // double opt-in: starts as pending

  sh.appendRow(newRow);

  // Send confirmation email (double opt-in)
  try { _sendConfirmationEmail(email, id); } catch(e) { Logger.log('Confirm email err: ' + e.message); }

  return {ok:true, id:id, pendingConfirmation:true};
}

function _sendConfirmationEmail(email, mailingId) {
  var baseUrl = ScriptApp.getService().getUrl();
  var secret = PropertiesService.getScriptProperties().getProperty('OC_UNSUB_SECRET') || 'sinopia2026';
  var raw = email + ':confirmNl:' + secret;
  var sig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  var confirmUrl = baseUrl + '?action=confirmNl&e=' + encodeURIComponent(email) + '&s=' + sig;

  var html = '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:20px">'
    + '<div style="font-size:22px;font-weight:600;margin-bottom:12px">Conferma la tua iscrizione</div>'
    + '<p style="color:#555;line-height:1.6">Hai richiesto di ricevere la newsletter settimanale di <b>Sinopia - Osservatorio Culturale</b>.</p>'
    + '<p style="color:#555;line-height:1.6">Clicca il bottone per confermare:</p>'
    + '<a href="' + confirmUrl + '" style="display:inline-block;background:#E84B1C;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Confermo la mia iscrizione</a>'
    + '<p style="font-size:12px;color:#999;margin-top:24px">Se non hai richiesto questa iscrizione, ignora questa email.</p>'
    + '</body></html>';

  MailApp.sendEmail({
    to: email,
    subject: 'Conferma iscrizione newsletter · Sinopia',
    htmlBody: html,
    name: 'Sinopia · Osservatorio Culturale'
  });
}

function deleteMailing(id) {
  return _deleteRowById(getMainSS().getSheetByName(SH.MAILING), id);
}

// v5.1.0 — Conferma newsletter double opt-in
function _handleConfirmNewsletter(params) {
  var email = decodeURIComponent(params.e || '').trim().toLowerCase();
  var sig = params.s || '';
  if (!email || !sig) return '<h1>Link non valido</h1>';

  // Verify HMAC
  var secret = PropertiesService.getScriptProperties().getProperty('OC_UNSUB_SECRET') || 'sinopia2026';
  var raw = email + ':confirmNl:' + secret;
  var expected = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  if (sig !== expected) return '<h1>Link non valido</h1><p>La firma non corrisponde. Richiedi una nuova iscrizione.</p>';

  // Find subscriber and update Stato
  var sh = getMainSS().getSheetByName(SH.MAILING);
  if (!sh) return '<h1>Errore</h1><p>Foglio mailing non trovato.</p>';
  var rows = sh.getDataRange().getValues(), h = rows[0];
  var emailCol = h.indexOf('Email'), statoCol = h.indexOf('Stato');
  if (emailCol < 0 || statoCol < 0) return '<h1>Errore</h1><p>Colonne mancanti.</p>';

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][emailCol] || '').toLowerCase().trim() === email) {
      sh.getRange(i + 1, statoCol + 1).setValue('confermato');
      return '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:20px;text-align:center">'
        + '<div style="font-size:48px;margin-bottom:16px">&#10003;</div>'
        + '<h1 style="font-size:24px;color:#1a1a1a">Iscrizione confermata!</h1>'
        + '<p style="color:#555;line-height:1.6">Riceverai la newsletter settimanale di <b>Sinopia</b> con bandi, news e opportunita selezionate per il settore culturale.</p>'
        + '<a href="' + ScriptApp.getService().getUrl() + '" style="display:inline-block;margin-top:20px;background:#E84B1C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Vai all\'Osservatorio</a>'
        + '</body></html>';
    }
  }
  return '<h1>Email non trovata</h1><p>Nessuna iscrizione in attesa per questo indirizzo.</p>';
}

function toggleMailingField(id,field) {
  return _toggleField(getMainSS().getSheetByName(SH.MAILING),id,field);
}

function getDigestLog() {
  var log = _sheetToObjects(SH.LOG);
  log.forEach(function(entry) {
    if (entry.DataInvio instanceof Date) entry.DataInvio = formatDate(entry.DataInvio);
  });
  log.reverse();
  return {log: log};
}

// --- Digest send/build functions extracted to DigestService.js (Sprint 2, 2026-05-26) ---

// -- SCANNER RSS ---------------------------------------------------
function scanSources() {
  const SS=getMainSS();
  const fonti=getFonti().fonti.filter(f=>f.Attiva);
  const sh=SS.getSheetByName(SH.ITEMS);
  const existing=getExistingURLs(sh);
  let added=0;
  for(const fonte of fonti) {
    try {
      Logger.log(' Fonte: ' + fonte.Nome);
      const rssUrl = fonte.RSSURL || fonte.URL;
      if (!rssUrl) { Logger.log('  ! URL mancante, saltata'); continue; }
      const items = fetchRSS(rssUrl, fonte);
      if (!items.length) { Logger.log('  -> 0 item (feed vuoto o non valido)'); continue; }
      let nuovi = 0;
      for(const item of items) {
        // v4.18.41 — Dedup at-source con URL canonicalizzato (rimuove utm_*, trailing slash, ecc.)
        const itemKey = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(item.url) : item.url;
        if(existing.has(itemKey)) continue;
        Utilities.sleep(600);
        const ai = processWithAI(item.titolo, item.estratto, fonte.Ambito);
        saveItem(sh, item, fonte, ai);
        existing.add(itemKey);
        added++;
        nuovi++;
      }
      Logger.log('  OK ' + nuovi + ' nuovi / ' + items.length + ' trovati');
      updateFonteLastScan(SS, fonte.ID, items.length);
    } catch(err) {
      Logger.log('  ERR fonte "' + fonte.Nome + '": ' + err.message.substring(0,80));
    }
  }
  return added;
}

function fetchRSS(url,fonte) {
  try {
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions:true, followRedirects:true, deadline:10,
      headers:{'User-Agent':'Mozilla/5.0 (compatible; Feedfetcher/4.0)'}
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('  ! HTTP ' + resp.getResponseCode() + ' per ' + url);
      return [];
    }
    const content = resp.getContentText('UTF-8');
    // Verifica che sia effettivamente XML/RSS e non HTML
    if (!content.includes('<?xml') && !content.includes('<rss') && !content.includes('<feed')) {
      Logger.log('  ! Non e un feed RSS valido: ' + url.substring(0,60));
      return [];
    }
    // Pulizia caratteri problematici che causano SAXParseException
    const xml = content
      .replace(/crossorigin="[^"]*"/g,'')
      .replace(/defer="[^"]*"/g,'')
      .replace(/\x00/g,'')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g,'');
    let doc, root, ns;
    try {
      doc = XmlService.parse(xml);
    } catch(parseErr) {
      Logger.log('  ! XML non valido (' + parseErr.message.substring(0,60) + '): ' + url.substring(0,50));
      return [];
    }
    root = doc.getRootElement();
    ns = root.getNamespace();
    let entries = [];
    const channel = root.getChild('channel') || root.getChild('channel',ns);
    if (channel) entries = channel.getChildren('item') || channel.getChildren('item',ns) || [];
    if (!entries.length) entries = root.getChildren('entry',ns) || root.getChildren('entry') || [];
    const items = [];
    for (const entry of entries.slice(0,8)) {
      const get = tag => { try { const el=entry.getChild(tag)||entry.getChild(tag,ns); return el?el.getValue().trim():''; } catch(e){return '';} };
      const titolo = get('title');
      const link = get('link') || get('id');
      const desc = get('description') || get('summary') || get('content');
      const pub = get('pubDate') || get('published') || get('updated');
      if (!titolo || !link) continue;
      // --- Estrazione immagine: enclosure → media:thumbnail → media:content → <img> nel desc ---
      let imgUrl = '';
      try {
        const encl = entry.getChild('enclosure') || entry.getChild('enclosure', ns);
        if (encl) {
          const encType = encl.getAttribute('type') ? encl.getAttribute('type').getValue() : '';
          if (!encType || encType.startsWith('image/')) {
            imgUrl = encl.getAttribute('url') ? encl.getAttribute('url').getValue() : '';
          }
        }
      } catch(eImg){}
      if (!imgUrl) {
        try {
          const mediaNs = XmlService.getNamespace('media','http://search.yahoo.com/mrss/');
          const mediaEl = entry.getChild('thumbnail',mediaNs) || entry.getChild('content',mediaNs);
          if (mediaEl) imgUrl = mediaEl.getAttribute('url') ? mediaEl.getAttribute('url').getValue() : '';
        } catch(eMedia){}
      }
      if (!imgUrl && desc) {
        const imgM = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgM) imgUrl = imgM[1];
      }
      items.push({
        titolo, url:link, imgUrl,
        estratto: desc.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').substring(0,600).trim(),
        data: pub ? new Date(pub) : new Date()
      });
    }
    return items;
  } catch(e) {
    Logger.log('  ! fetchRSS errore: ' + e.message.substring(0,80));
    return [];
  }
}

function processWithAI(titolo,estratto,ambito) {
  const ambitoDesc={1:'tendenze museali',2:'accessibilita museale',3:'mostre ed exhibition',4:'progetti culturali di comunita',5:'intelligenza artificiale per la cultura e i musei'};
  const prompt=`Sei esperto di museologia. Analizza per un professionista.
Ambito: ${ambitoDesc[ambito]||'cultura'}
Titolo: ${titolo}
Estratto: ${estratto.substring(0,500)}
Rispondi SOLO JSON (no markdown):
{"sommario":"2-3 frasi italiano max 300 caratteri","tag":["t1","t2","t3"],"score":4,"tipologia":"ricerca"}
Score 1-5. Tipologia: ricerca|evento|caso|bando.`;
  try {
    const resp=UrlFetchApp.fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':CLAUDE_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
      payload:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:350,messages:[{role:'user',content:prompt}]}),
      muteHttpExceptions:true
    });
    const data=JSON.parse(resp.getContentText());
    const parsed=JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
    return {sommario:parsed.sommario||estratto.substring(0,300),tag:parsed.tag||[],score:parsed.score||3,tipologia:parsed.tipologia||'ricerca'};
  } catch(err) { return {sommario:estratto.substring(0,300),tag:[],score:2,tipologia:'ricerca'}; }
}

function saveItem(sh,item,fonte,ai) {
  const id='I'+Date.now()+'_'+Math.random().toString(36).substr(2,4);
  sh.appendRow([id,fonte.Ambito,AMBITO_LABEL[fonte.Ambito]||'',fonte.Nome,item.url,item.titolo,item.estratto,ai.sommario,'',
    (ai.tag||[]).join(', '),ai.score||3,ai.tipologia||'ricerca',formatDate(item.data),formatDate(new Date()),'',false,false,false,false]);  // * InclusiNelDigest=false: selezione manuale
}

/**
 * v4.18.41 — Set di URL già esistenti nel foglio, CANONICALIZZATI per dedup robusto.
 * Usa _canonicalUrl_ (Constants.js): rimuove protocol/www/trailing slash/utm/anchor.
 * Cambio di comportamento: ora due URL "diversi" ma equivalenti (es. con/senza
 * trailing slash, con/senza utm) sono considerati lo stesso → niente più duplicati
 * news che differiscono solo per parametri di tracking.
 */
function getExistingURLs(sh) {
  const rows=sh.getDataRange().getValues(), h=rows[0], col=h.indexOf('FonteURL'), urls=new Set();
  for(let i=1;i<rows.length;i++) {
    if(rows[i][col]) {
      const canon = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(rows[i][col]) : String(rows[i][col]).trim();
      if (canon) urls.add(canon);
    }
  }
  return urls;
}

function updateFonteLastScan(SS,id,numItem) {
  const sh=SS.getSheetByName(SH.FONTI), rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), scanCol=h.indexOf('UltimaScansione'), numCol=h.indexOf('NumItemRaccolti');
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id){ sh.getRange(i+1,scanCol+1).setValue(new Date()); sh.getRange(i+1,numCol+1).setValue((rows[i][numCol]||0)+numItem); break; }
  }
}

// ==================================================================
// SOCIAL WALL
// ==================================================================
function getSocialWall() {
  const props = PropertiesService.getScriptProperties();
  const cached   = props.getProperty('SW_CACHE');
  const cachedAt = parseInt(props.getProperty('SW_CACHE_TIME') || '0');
  const age      = Date.now() - cachedAt;
  // Cache fresca (<6h): usa subito
  if (cached && age < 21600000) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  // Cache stale (6-48h): restituisci stale per non bloccare l'UI,
  // aggiorna in background (solo se non troppo vecchia)
  if (cached && age < 172800000) {
    try {
      const stale = JSON.parse(cached);
      // Aggiorna in background (non blocca la risposta)
      try { fetchAndCacheSocialWall(); } catch(bg) {}
      return stale;
    } catch(e) {}
  }
  // Cache assente o >48h: fetch sincrono (prima volta)
  return fetchAndCacheSocialWall();
}

function fetchAndCacheSocialWall() {
  const fonti = getSocialFontiList().fonti.filter(f => f.Attiva);
  if (!fonti.length) return {posts:[], updatedAt:new Date().toISOString()};
  const posts = [], cutoff = new Date(Date.now()-7*86400000);
  for (const fonte of fonti.slice(0, 8)) {  // max 8 fonti per limitare i tempi
    try {
      // * Timeout 5s per singola fonte RSS (UrlFetchApp default = 20s)
      const rssItems = fetchRSS(fonte.URL, {muteHttpExceptions:true, followRedirects:true}).slice(0,4);
      rssItems.forEach(item=>{
        if(item.data<cutoff) return;
        posts.push({fonte:fonte.Nome,tipo:String(fonte.Tipo||'blog'),categoria:String(fonte.Categoria||''),
          avatar:String(fonte.Avatar||(fonte.Nome||'?').charAt(0).toUpperCase()),titolo:item.titolo,
          estratto:(item.estratto||'').substring(0,220),url:item.url,imgUrl:item.imgUrl||'',
          dataISO:item.data instanceof Date?item.data.toISOString():new Date().toISOString()});
      });
    } catch(err){}
  }
  posts.sort((a,b)=>new Date(b.dataISO)-new Date(a.dataISO));
  const result={posts:posts.slice(0,12),updatedAt:new Date().toISOString()};
  try{const p=PropertiesService.getScriptProperties();p.setProperty('SW_CACHE',JSON.stringify(result));p.setProperty('SW_CACHE_TIME',Date.now().toString());}catch(e){}
  return result;
}

function getSocialFontiList() {
  var SS = getMainSS();
  if (!SS.getSheetByName('SocialFonti')) _createSocialFontiSheet(SS);
  return {fonti: _sheetToObjects('SocialFonti')};
}

function _createSocialFontiSheet(SS) {
  const sh=SS.insertSheet('SocialFonti');
  sh.getRange(1,1,1,8).setValues([['ID','Nome','URL','Tipo','Categoria','Avatar','Attiva','Note']]).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
  sh.setFrozenRows(1);
  [['SW1','Artribune','https://www.artribune.com/feed/','rivista','Arte','A',true,''],
   ['SW2','Il Giornale delle Fondazioni','https://www.ilgiornaledellefondazioni.com/feed/','rivista','Cultura','G',true,''],
   ['SW3','ICOM Italia','https://icom-italia.org/feed/','istituzione','Musei','I',true,''],
   ['SW4','Federculture','http://www.federculture.it/feed/','associazione','Cultura','F',true,''],
  ].forEach(r=>sh.appendRow(r));
  return sh;
}

function addSocialFonte(body) {
  const SS=getMainSS();
  let sh=SS.getSheetByName('SocialFonti'); if(!sh) sh=_createSocialFontiSheet(SS);
  const id='SW'+Date.now();
  sh.appendRow([id,body.nome,body.url,body.tipo||'blog',body.categoria||'',(body.nome||'?').charAt(0).toUpperCase(),true,body.note||'']);
  PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME');
  return {ok:true,id};
}

function deleteSocialFonteById(id){return _deleteRowById(getMainSS().getSheetByName('SocialFonti'),id);}
function toggleSocialFonteField(id,field){return _toggleField(getMainSS().getSheetByName('SocialFonti'),id,field);}

/**
 * Seed Social Wall — 15 istituzioni fondamentali del settore cultura italiano/europeo.
 * Idempotente: salta le URL già presenti. Eseguire una sola volta dopo deploy.
 */
function seedSocialFontiIstituzionali() {
  const SS = getMainSS();
  let sh = SS.getSheetByName('SocialFonti');
  if (!sh) sh = _createSocialFontiSheet(SS);
  const rows = sh.getDataRange().getValues();
  const existingUrls = new Set(rows.slice(1).map(r => String(r[2]||'').trim()));
  const seed = [
    // Istituzioni MiC e pubblica amministrazione
    { id:'SW10', nome:'MiC — Comunicati',         url:'https://comunicati.cultura.gov.it/feed/',                      tipo:'istituzione',   cat:'Politiche Culturali',    av:'M' },
    { id:'SW11', nome:'MiC — Musei',              url:'https://musei.cultura.gov.it/feed/',                           tipo:'istituzione',   cat:'Musei & Patrimonio',     av:'M' },
    // Reti museali e associazioni
    { id:'SW12', nome:'ICOM Italia',              url:'https://www.icom-italia.org/feed/',                            tipo:'istituzione',   cat:'Musei & Patrimonio',     av:'I' },
    { id:'SW13', nome:'Federculture',             url:'https://www.federculture.it/feed/',                            tipo:'associazione',  cat:'Politiche Culturali',    av:'F' },
    { id:'SW14', nome:'MAB Italia',               url:'https://www.mab-italia.org/feed/',                             tipo:'associazione',  cat:'Musei & Patrimonio',     av:'M' },
    { id:'SW15', nome:'AMACI',                    url:'https://www.amaci.org/feed/',                                  tipo:'associazione',  cat:'Arte Contemporanea',     av:'A' },
    // Fondazioni e centri ricerca
    { id:'SW16', nome:'Fondazione Symbola',       url:'https://symbola.net/feed/',                                    tipo:'fondazione',    cat:'Governance & Cultura',   av:'S' },
    { id:'SW17', nome:'Fondazione Fitzcarraldo',  url:'https://www.fitzcarraldo.it/feed/',                            tipo:'fondazione',    cat:'Gestione Culturale',     av:'F' },
    { id:'SW18', nome:'Fondazione Feltrinelli',   url:'https://fondazionefeltrinelli.it/feed/',                       tipo:'fondazione',    cat:'Politiche Culturali',    av:'F' },
    // Grandi musei italiani con blog/news attivi
    { id:'SW19', nome:'MAXXI Roma',               url:'https://www.maxxi.art/feed/',                                  tipo:'museo',         cat:'Arte Contemporanea',     av:'X' },
    { id:'SW20', nome:'Triennale Milano',         url:'https://www.triennale.org/feed/',                              tipo:'museo',         cat:'Design & Cultura',       av:'T' },
    { id:'SW21', nome:'FAI — Fondo Ambiente',     url:'https://www.fondoambiente.it/feed/',                           tipo:'fondazione',    cat:'Musei & Patrimonio',     av:'F' },
    // Riviste e osservatori settoriali
    { id:'SW22', nome:'Artribune',                url:'https://www.artribune.com/feed/',                              tipo:'rivista',       cat:'Arte & Mostre',          av:'A' },
    { id:'SW23', nome:'Giornale delle Fondazioni',url:'https://www.ilgiornaledellefondazioni.com/feed/',               tipo:'rivista',       cat:'Politiche Culturali',    av:'G' },
    { id:'SW24', nome:'MuseumNext',               url:'https://www.museumnext.com/feed/',                             tipo:'rivista',       cat:'Innovazione Museale',    av:'N' },
    // v5.1.0 — Riviste specializzate arte e cultura
    { id:'SW25', nome:'Exibart',                   url:'https://www.exibart.com/feed/',                                tipo:'rivista',       cat:'Arte & Mostre',          av:'E' },
    { id:'SW26', nome:'Finestre sull\'Arte',       url:'https://www.finestresullarte.info/feed',                       tipo:'rivista',       cat:'Arte & Mostre',          av:'F' },
    { id:'SW27', nome:'Flash Art Italia',          url:'https://flash---art.it/feed/',                                 tipo:'rivista',       cat:'Arte Contemporanea',     av:'F' },
    { id:'SW28', nome:'Doppiozero',                url:'https://www.doppiozero.com/feed',                              tipo:'rivista',       cat:'Cultura & Societa',      av:'D' },
    { id:'SW29', nome:'Secondo Welfare',           url:'https://www.secondowelfare.it/feed/',                          tipo:'rivista',       cat:'Welfare Culturale',      av:'S' },
    { id:'SW30', nome:'Agenda Digitale',           url:'https://www.agendadigitale.eu/feed/',                          tipo:'rivista',       cat:'AI & Cultura',           av:'A' },
    // Istituzioni aggiuntive
    { id:'SW31', nome:'Compagnia di San Paolo',    url:'https://www.compagniadisanpaolo.it/feed/',                     tipo:'fondazione',    cat:'Governance & Cultura',   av:'C' },
    { id:'SW32', nome:'Touring Club Italiano',     url:'https://www.touringclub.it/feed/',                             tipo:'istituzione',   cat:'Turismo Culturale',      av:'T' },
    { id:'SW33', nome:'AIB — Biblioteche',         url:'https://www.aib.it/feed/',                                     tipo:'associazione',  cat:'Gestione Culturale',     av:'A' },
    { id:'SW34', nome:'Treccani Magazine',         url:'https://www.treccani.it/magazine/feed/',                       tipo:'rivista',       cat:'Cultura & Societa',      av:'T' },
  ];
  let aggiunti = 0, skip = 0;
  seed.forEach(function(f) {
    if (existingUrls.has(f.url)) { skip++; return; }
    sh.appendRow([f.id + '_' + Date.now(), f.nome, f.url, f.tipo, f.cat, f.av, true, '']);
    existingUrls.add(f.url);
    aggiunti++;
    Utilities.sleep(80);
  });
  // Invalida cache social wall
  PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME');
  Logger.log('[OK] seedSocialFontiIstituzionali: ' + aggiunti + ' aggiunte, ' + skip + ' già presenti');
  return { ok: true, aggiunti: aggiunti, skip: skip };
}

/**
 * Corregge feed SocialFonti non funzionanti:
 * - Rimuove URL con dominio morto (economia-cultura.it)
 * - Aggiorna ICOM senza www → con www
 * - Sostituisce ilgiornaledellarte.com (no RSS) con Finestre sull'Arte
 * - Invalida cache SW per forzare refetch
 * Da eseguire una volta dall'editor GAS.
 */
function correggiSocialFontiFallite() {
  const sh = getMainSS().getSheetByName('SocialFonti');
  if (!sh || sh.getLastRow() < 2) { Logger.log('SocialFonti vuoto'); return; }
  const vals = sh.getDataRange().getValues();
  const h = vals[0];
  const iUrl = h.indexOf('URL'); const iNome = h.indexOf('Nome');
  const FIXES = {
    'https://icom-italia.org/feed/':          'https://www.icom-italia.org/feed/',
    'https://www.ilgiornaledellarte.com/feed/':'https://www.finestresullarte.info/blog_feed_rss.php',
  };
  const DEAD  = ['economia-cultura.it'];
  let fixed = 0, deleted = 0;
  for (let i = vals.length - 1; i >= 1; i--) {
    const url = String(vals[i][iUrl]||'');
    if (DEAD.some(d => url.indexOf(d) !== -1)) {
      sh.deleteRow(i + 1); deleted++; continue;
    }
    if (FIXES[url]) {
      sh.getRange(i+1, iUrl+1).setValue(FIXES[url]);
      Logger.log('Corretto: ' + url + ' → ' + FIXES[url]); fixed++;
    }
  }
  PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME');
  Logger.log('correggiSocialFontiFallite: ' + fixed + ' corretti, ' + deleted + ' eliminati');
  return { ok:true, fixed, deleted };
}

// Sprint G (2026-05-03): Aggiunge fonti istituzionali ICOM / Federculture / Symbola + rete
// Eseguire UNA SOLA VOLTA dall'editor GAS dopo deploy.
function addFontiIstituzionali() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return 0; }
  const existingUrls = sh.getDataRange().getValues().map(r => String(r[2]||'') + String(r[3]||''));
  // [nome, url_homepage, rss_url, ambito_id, ambito_label]
  // Ambiti: 1=Identità narrazione, 2=Inclusione, 3=Programma/mostre/collezioni, 4=Comunità/welfare, 5=Digital/AI/governance
  const nuoveFonti = [
    { nome:'ICOM Italia',                  url:'https://www.icom-italia.org/',                          rss:'https://www.icom-italia.org/feed/',                          amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Federculture',                 url:'https://www.federculture.it/',                          rss:'https://www.federculture.it/feed/',                          amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Fondazione Symbola',           url:'https://symbola.net/',                                  rss:'https://symbola.net/feed/',                                 amb:5, lbl:'Digital, AI e governance' },
    { nome:'Fondazione Fitzcarraldo',      url:'https://www.fitzcarraldo.it/',                          rss:'https://www.fitzcarraldo.it/feed/',                          amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'MuseumNext',                   url:'https://www.museumnext.com/',                           rss:'https://www.museumnext.com/feed/',                           amb:5, lbl:'Digital, AI e governance' },
    { nome:'Artribune',                    url:'https://www.artribune.com/',                            rss:'https://www.artribune.com/feed/',                            amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Il Giornale delle Fondazioni', url:'https://www.ilgiornaledellefondazioni.com/',            rss:'https://www.ilgiornaledellefondazioni.com/feed/',             amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Tafter Journal',               url:'https://www.tafterjournal.it/',                         rss:'https://www.tafterjournal.it/feed/',                         amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Doppiozero Cultura',           url:'https://www.doppiozero.com/',                           rss:'https://www.doppiozero.com/feed',                           amb:1, lbl:'Identità e narrazione museale' },
    { nome:'Patrimonio Culturale ER',      url:'https://patrimonioculturale.regione.emilia-romagna.it/',rss:'https://patrimonioculturale.regione.emilia-romagna.it/feed', amb:3, lbl:'Programma, mostre e collezioni' },
  ];
  let added = 0;
  nuoveFonti.forEach(f => {
    const alreadyIn = existingUrls.some(e => e.indexOf(f.url) >= 0 || e.indexOf(f.rss) >= 0);
    if (!alreadyIn) {
      sh.appendRow(['INST' + Date.now(), f.nome, f.url, f.rss, f.amb, f.lbl, true, '', 0]);
      added++;
      Utilities.sleep(200);
    }
  });
  Logger.log('[OK] addFontiIstituzionali: ' + added + ' fonti aggiunte');
  return added;
}

// Sprint N1 (2026-05-05): 10 nuove fonti news qualitative
function addFontiNewsNuove() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return 0; }
  const existingUrls = sh.getDataRange().getValues().map(r => String(r[2]||'') + String(r[3]||''));
  const nuoveFonti = [
    { nome:"Finestre sull'Arte",    url:'https://www.finestresullarte.info/',                    rss:'https://www.finestresullarte.info/feed',                    amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Exibart',               url:'https://www.exibart.com/',                              rss:'https://www.exibart.com/feed/',                             amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:"Il Giornale dell'Arte", url:'https://www.ilgiornaledellarte.com/',                   rss:'https://www.ilgiornaledellarte.com/feed/',                  amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'FAI - Fondo Ambiente',  url:'https://www.fondoambiente.it/',                         rss:'https://www.fondoambiente.it/feed/',                        amb:1, lbl:'Identità e narrazione museale' },
    { nome:'MiC Comunicati',        url:'https://comunicati.cultura.gov.it/',                    rss:'https://comunicati.cultura.gov.it/feed/',                   amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'The Art Newspaper',     url:'https://www.theartnewspaper.com/',                      rss:'https://www.theartnewspaper.com/feed',                      amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Treccani Magazine',     url:'https://www.treccani.it/magazine/',                     rss:'https://www.treccani.it/magazine/feed/',                    amb:1, lbl:'Identità e narrazione museale' },
    { nome:'Apollo Magazine',       url:'https://www.apollo-magazine.com/',                      rss:'https://www.apollo-magazine.com/feed/',                     amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'AIB Associaz. Bibl.',   url:'https://www.aib.it/',                                   rss:'https://www.aib.it/feed/',                                 amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Touring Club Italiano', url:'https://www.touringclub.it/',                           rss:'https://www.touringclub.it/feed/',                          amb:1, lbl:'Identità e narrazione museale' },
  ];
  let added = 0;
  nuoveFonti.forEach(f => {
    const alreadyIn = existingUrls.some(e => e.indexOf(f.url) >= 0 || e.indexOf(f.rss) >= 0);
    if (!alreadyIn) {
      sh.appendRow(['NEWS' + Date.now(), f.nome, f.url, f.rss, f.amb, f.lbl, true, '', 0]);
      added++;
      Utilities.sleep(200);
    }
  });
  Logger.log('[OK] addFontiNewsNuove: ' + added + ' fonti aggiunte');
  return added;
}

// ==================================================================
// SPRINT N4 (2026-05-05) — LIBRI / PUBBLICAZIONI
// ==================================================================

// Schema foglio Pubblicazioni:
// ID | Titolo | Autore | Editore | Anno | Ambito | Tematica | Descrizione | Link | Copertina_URL | DataAggiunta | Fonte | Stato | Score | Letto | Salvato
const LIBRI_HEADERS = ['ID','Titolo','Autore','Editore','Anno','Ambito','Tematica','Descrizione','Link','Copertina_URL','DataAggiunta','Fonte','Stato','Score','Letto','Salvato'];

function setupPubblicazioniSheet() {
  const SS = getMainSS();
  let sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) {
    sh = SS.insertSheet(SH.LIBRI);
    Logger.log('Foglio Pubblicazioni creato');
  }
  // Intestazione
  sh.getRange(1, 1, 1, LIBRI_HEADERS.length).setValues([LIBRI_HEADERS]).setFontWeight('bold').setBackground('#4A3F7A').setFontColor('#fff');
  sh.setFrozenRows(1);

  // Seed: 10 titoli di riferimento su museologia e gestione culturale
  const now = new Date();
  const seed = [
    ['LIB001','Il museo relazionale','Andrea Pancino','FrancoAngeli',2022,1,'Identità e narrazione museale','Ripensare il museo come spazio di relazione e mediazione culturale nel XXI secolo.','https://www.francoangeli.it','','','manuale','attivo',90,false,false],
    ['LIB002','Musei e digitale','AA.VV.','Electa',2023,5,'Digital, AI e governance','Trasformazione digitale nei musei italiani: strumenti, esperienze e prospettive.','https://www.electaweb.it','','','manuale','attivo',88,false,false],
    ['LIB003','Accessibilità nei musei','Simona Bodo','Carocci',2021,2,'Inclusione e accessibilità','Progettare percorsi museali inclusivi per persone con disabilità fisiche e cognitive.','https://www.carocci.it','','','manuale','attivo',92,false,false],
    ['LIB004','Audience Development','Francesca Pola','Il Mulino',2022,4,'Comunità e welfare culturale','Strategie di coinvolgimento del pubblico nei luoghi della cultura contemporanea.','https://www.mulino.it','','','manuale','attivo',85,false,false],
    ['LIB005','Heritage Management','AA.VV.','Laterza',2020,3,'Programma, mostre e collezioni','Gestione del patrimonio culturale tra conservazione, valorizzazione e partecipazione.','https://www.laterza.it','','','manuale','attivo',87,false,false],
    ['LIB006','AI per la cultura','Luca Ferretti','Hoepli',2023,5,'Digital, AI e governance','Intelligenza artificiale applicata ai musei e agli archivi culturali: casi d\'uso e prospettive.','https://www.hoepli.it','','','manuale','attivo',91,false,false],
    ['LIB007','Il turismo culturale','Elena Pirazzoli','FrancoAngeli',2021,4,'Comunità e welfare culturale','Analisi e strategie per lo sviluppo del turismo culturale nei territori italiani.','https://www.francoangeli.it','','','manuale','attivo',82,false,false],
    ['LIB008','Storytelling museale','Marco Borrelli','Carocci',2022,1,'Identità e narrazione museale','Tecniche narrative per la comunicazione museale: dalla didascalia ai contenuti digitali.','https://www.carocci.it','','','manuale','attivo',84,false,false],
    ['LIB009','Mostre temporanee','Giulia Amantini','Electa',2023,3,'Programma, mostre e collezioni','Progettazione e allestimento di mostre temporanee: dalla curatela alla fruizione.','https://www.electaweb.it','','','manuale','attivo',86,false,false],
    ['LIB010','Comunità e patrimonio','Roberta De Luca','Il Mulino',2021,4,'Comunità e welfare culturale','Co-progettazione partecipata nei processi di valorizzazione del patrimonio culturale locale.','https://www.mulino.it','','','manuale','attivo',89,false,false],
  ];
  const existing = sh.getLastRow();
  if (existing < 2) {
    seed.forEach(function(row){
      row[10] = now; // DataAggiunta
      sh.appendRow(row);
    });
    Logger.log('Seed 10 libri inserito');
  }
  Logger.log('[OK] setupPubblicazioniSheet completato');
  return { foglio: SH.LIBRI, righe: sh.getLastRow() - 1 };
}

function getLibriList(params) {
  params = params || {};
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) return { libri: [], total: 0 };
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return { libri: [], total: 0 };
  const head = rows[0];
  const libri = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const item = {};
    head.forEach((col, idx) => { item[col] = r[idx]; });
    if (item.Stato === 'archiviato') continue;
    if (params.ambito && item.Ambito != params.ambito) continue;
    if (params.q) {
      const q = params.q.toLowerCase();
      if (!((item.Titolo||'').toLowerCase().includes(q) ||
            (item.Autore||'').toLowerCase().includes(q) ||
            (item.Editore||'').toLowerCase().includes(q) ||
            (item.Descrizione||'').toLowerCase().includes(q))) continue;
    }
    if (item.DataAggiunta instanceof Date) item.DataAggiunta = formatDate(item.DataAggiunta);
    libri.push(item);
  }
  libri.sort((a, b) => {
    const da = a.DataAggiunta ? new Date(a.DataAggiunta).getTime() : 0;
    const db = b.DataAggiunta ? new Date(b.DataAggiunta).getTime() : 0;
    return db - da;
  });
  return { libri, total: libri.length };
}

function addLibro(body) {
  if (!body || !body.titolo) return { error: 'Titolo obbligatorio' };
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) return { error: 'Foglio Pubblicazioni non trovato. Eseguire setupPubblicazioniSheet().' };
  const id = 'LIB' + Date.now();
  const row = [
    id,
    body.titolo || '',
    body.autore || '',
    body.editore || '',
    body.anno || '',
    parseInt(body.ambito) || 0,
    body.tematica || '',
    body.descrizione || '',
    body.link || '',
    body.copertina_url || '',
    new Date(),            // DataAggiunta
    body.fonte || 'manuale',
    'attivo',
    parseInt(body.score) || 50,
    false,
    false
  ];
  sh.appendRow(row);
  return { ok: true, id };
}

// -- FONTI ARTICOLI -------------------------------------------------
function addFonteArticoli(body) {
  const SS=getMainSS(), sh=SS.getSheetByName(SH.FONTI);
  if(!sh) return {error:'Foglio Fonti non trovato'};
  const id='FA'+Date.now(), amb=parseInt(body.ambito)||1;
  sh.appendRow([id,body.nome,body.url,body.rssurl||body.url,amb,AMBITO_LABEL[amb]||'',true,'',0]);
  return {ok:true,id};
}
function deleteFonteArticoli(id){return _deleteRowById(getMainSS().getSheetByName(SH.FONTI),id);}

// -- FONTI BANDI ---------------------------------------------------
function getFontiBandi() {
  const SS=getMainSS();
  let sh=SS.getSheetByName('FontiBandi'); if(!sh) sh=_createFontiBandiSheet(SS);
  const rows=sh.getDataRange().getValues(), h=rows[0], fonti=[];
  for(let i=1;i<rows.length;i++){if(!rows[i][0])continue;const f={};h.forEach((col,idx)=>{f[col]=rows[i][idx];});fonti.push(f);}
  try {
    const sh5 = SS.getSheetByName('FontiBandi_v5');
    if (sh5) {
      const r5 = sh5.getDataRange().getValues();
      const lookupByUrl = {};
      for (let i = 1; i < r5.length; i++) {
        if (!r5[i][2]) continue;
        const url = String(r5[i][2]).trim().toLowerCase();
        lookupByUrl[url] = { ultimaScan: r5[i][8] || null, ultimoEsito: String(r5[i][9] || ''), failConsec: Number(r5[i][12] || 0) };
      }
      fonti.forEach(function(f){
        const k = String(f.URL || f.URL_RSS || '').trim().toLowerCase();
        const m = lookupByUrl[k];
        if (m) { f.ultimaScan = m.ultimaScan ? new Date(m.ultimaScan).toISOString() : null; f.ultimoEsito = m.ultimoEsito; f.failConsec = m.failConsec; }
      });
    }
  } catch(e) { Logger.log('getFontiBandi enrich v5 errore: ' + e.message); }
  return {fonti};
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
function deleteFonteBandiById(id){return _deleteRowById(getMainSS().getSheetByName('FontiBandi'),id);}
function toggleFonteBandiField(id,field){return _toggleField(getMainSS().getSheetByName('FontiBandi'),id,field);}

/**
 * Sprint 1.3 D2.5 (2026-05-01) — URL del foglio Drive principale (per pulsanti "Apri foglio").
 */
function getMainSheetUrl() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    return ss ? ss.getUrl() : '';
  } catch(e) { return ''; }
}

/**
 * Sprint 1.3 D2.5 (2026-05-01) — URL pubblico della webapp (per pannello Configurazione).
 */
function getWebAppUrl() {
  try { return ScriptApp.getService().getUrl() || ''; } catch(e) { return ''; }
}

/**
 * Sprint 1.3 D2.5 (2026-05-01) — Wrapper sicuro per migraBandiAmbito.
 * Se la funzione esiste nel codebase, la chiama. Altrimenti applica una
 * migrazione minimale basata su keyword sui titoli/settori.
 */
/**
 * Sprint 1.3 D2.5 (2026-05-01) — Diagnostica colonne RADAR.
 * Esegui dall'editor GAS per vedere quali colonne ha realmente il foglio.
 */
function inspectRadarHeaders() {
  try {
    var sh = getSheetRadar();
    if (!sh) { Logger.log('ERR: getSheetRadar() ritorna null'); return { error:'sheet null' }; }
    var lastCol = sh.getLastColumn();
    var lastRow = sh.getLastRow();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    Logger.log('=== HEADERS FOGLIO RADAR (file usato da getSheetRadar) ===');
    Logger.log('Nome foglio: ' + sh.getName());
    Logger.log('Righe totali: ' + lastRow + ' (escluso header: ' + (lastRow-1) + ')');
    Logger.log('Colonne totali: ' + lastCol);
    Logger.log('Headers:');
    headers.forEach(function(h, i) {
      Logger.log('  Col ' + (i+1) + ': "' + h + '"');
    });
    return { sheetName: sh.getName(), totRows: lastRow, totCols: lastCol, headers: headers };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

/**
 * Sprint 1.3 D2.5b (2026-05-01) — Diagnostica ENTRAMBI i file con foglio RADAR BANDI.
 * Identifica quale dei due file e' effettivamente in uso (quello con piu righe).
 */
/**
 * Sprint 1.3 D2.5c (2026-05-01) — One-shot: aggiunge colonna AMBITO al RADAR + esegue migrazione.
 * Idempotente.
 */
function setupAmbitoEmigra() {
  Logger.log('=== SETUP COLONNA AMBITO + MIGRAZIONE BANDI ===');
  try {
    var sh = getSheetRadar();
    if (!sh) return { error:'sheet RADAR non trovato' };
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var iAmbito = -1;
    var headersLow = headers.map(function(h){ return String(h||'').toLowerCase().trim(); });
    for (var i = 0; i < headersLow.length; i++) {
      if (headersLow[i] === 'ambito' || headersLow[i].indexOf('ambito') >= 0) {
        iAmbito = i; break;
      }
    }
    if (iAmbito < 0) {
      var newCol = lastCol + 1;
      sh.getRange(1, newCol).setValue('AMBITO')
        .setFontWeight('bold').setBackground('#0F2744').setFontColor('#fff');
      Logger.log('Colonna AMBITO creata in posizione ' + newCol);
    } else {
      Logger.log('Colonna AMBITO gia presente in posizione ' + (iAmbito+1) + ' ("' + headers[iAmbito] + '")');
    }
    Logger.log('--- Avvio migrazione ---');
    var res = migraBandiAmbito();
    Logger.log(JSON.stringify(res, null, 2));
    return { ok:true, columnSetup:'done', migration: res };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

/**
 * Sprint 1.3 D2.5d (2026-05-01) — AUDIT COMPLETO della struttura dati.
 * Stampa nel Log quale file/foglio usa effettivamente la webapp per ogni cosa.
 */
/**
 * Sprint 1.3 D2.5e (2026-05-01) — Ispeziona i fogli "vecchi" delle fonti
 * nel file principale per capire dove sono le fonti bandi reali.
 */
/**
 * Sprint 1.3 D2.5f (2026-05-01) — Recupera fonti bandi dal foglio "Fonti" (47 righe).
 * Importa nel foglio "FontiBandi" mappando colonne. Idempotente.
 */
/**
 * Sprint 1.3 D2.5g (2026-05-01) — Mostra le 47 righe del foglio "Fonti" + headers.
 */
function inspectFontiVecchieDettaglio() {
  Logger.log('=== INSPECT DETTAGLIO FOGLIO "Fonti" ===');
  try {
    var ss = getMainSS();
    var sh = ss.getSheetByName('Fonti');
    if (!sh) return { error:'foglio "Fonti" non trovato' };
    var rows = sh.getLastRow();
    var cols = sh.getLastColumn();
    Logger.log('Righe totali: ' + rows + ' · Colonne: ' + cols);
    if (cols === 0) return { error:'foglio vuoto' };
    var headers = sh.getRange(1, 1, 1, cols).getValues()[0];
    Logger.log('HEADERS:');
    headers.forEach(function(h, i) {
      Logger.log('  Col ' + (i+1) + ': "' + h + '"');
    });
    Logger.log('');
    Logger.log('PRIME 5 RIGHE DI ESEMPIO:');
    var sample = sh.getRange(2, 1, Math.min(5, rows-1), cols).getValues();
    sample.forEach(function(r, i) {
      Logger.log('  Riga ' + (i+2) + ':');
      r.forEach(function(c, j) {
        var s = String(c||'');
        if (s.length > 70) s = s.substring(0,70) + '…';
        Logger.log('     ' + headers[j] + ': ' + s);
      });
    });
    Logger.log('');
    Logger.log('CONTEGGIO ATTUALE FontiBandi:');
    var fb = ss.getSheetByName('FontiBandi');
    if (fb) {
      Logger.log('  Righe: ' + fb.getLastRow() + ' (escluso header: ' + (fb.getLastRow()-1) + ')');
    } else {
      Logger.log('  FONTIBANDI NON ESISTE');
    }
    return { ok:true, fontiHeaders: headers, fontiRows: rows-1, fontibandiRows: fb ? fb.getLastRow()-1 : 0 };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

function recuperaFontiVecchie() {
  Logger.log('=== RECUPERO FONTI VECCHIE da "Fonti" -> "FontiBandi" ===');
  try {
    var ss = getMainSS();
    var shVecchio = ss.getSheetByName('Fonti');
    if (!shVecchio) return { error:'foglio "Fonti" non trovato' };
    var rowsVecchio = shVecchio.getLastRow();
    if (rowsVecchio < 2) return { ok:true, importati:0, note:'foglio "Fonti" vuoto' };
    var headersVecchio = shVecchio.getRange(1,1,1,shVecchio.getLastColumn()).getValues()[0];
    var headersLow = headersVecchio.map(function(h){ return String(h||'').toLowerCase().trim(); });
    var iNome  = _findIdx_(headersLow, ['nome','name','denominazione']);
    var iUrl   = _findIdx_(headersLow, ['url','link','feed']);
    var iCat   = _findIdx_(headersLow, ['categoria','category','tipologia','tipo']);
    var iAtt   = _findIdx_(headersLow, ['attiva','active','attivo','enabled']);
    var iNote  = _findIdx_(headersLow, ['note','notes','descrizione']);
    Logger.log('Indici colonne foglio Fonti: nome=' + iNome + ' url=' + iUrl + ' cat=' + iCat + ' att=' + iAtt + ' note=' + iNote);
    if (iNome < 0 || iUrl < 0) {
      return { error:'foglio "Fonti": colonne nome o url non trovate. Headers: ' + headersVecchio.join(', ') };
    }
    var dataVecchio = shVecchio.getRange(2, 1, rowsVecchio-1, headersVecchio.length).getValues();
    var shNuovo;
    try {
      shNuovo = ss.getSheetByName('FontiBandi');
      if (!shNuovo) shNuovo = _createFontiBandiSheet(ss);
    } catch(e) { return { error:'errore apertura FontiBandi: ' + e.message }; }
    var existingUrls = new Set();
    if (shNuovo.getLastRow() > 1) {
      var existRows = shNuovo.getRange(2, 1, shNuovo.getLastRow()-1, shNuovo.getLastColumn()).getValues();
      var headersNuovo = shNuovo.getRange(1,1,1,shNuovo.getLastColumn()).getValues()[0];
      var iUrlNuovo = headersNuovo.indexOf('URL');
      if (iUrlNuovo >= 0) {
        existRows.forEach(function(r){ if (r[iUrlNuovo]) existingUrls.add(String(r[iUrlNuovo]).trim()); });
      }
    }
    var importati = 0, skipped = 0, errori = 0;
    dataVecchio.forEach(function(r, i) {
      try {
        var url = String(r[iUrl]||'').trim();
        if (!url) return;
        if (existingUrls.has(url)) { skipped++; return; }
        var nome = String(r[iNome]||'').trim() || ('Fonte ' + (i+1));
        var cat  = iCat >= 0 ? String(r[iCat]||'') : '';
        var att  = iAtt >= 0 ? (r[iAtt] === true || r[iAtt] === 1 || String(r[iAtt]).toLowerCase() === 'true' || String(r[iAtt]).toLowerCase() === 'si') : true;
        var note = iNote >= 0 ? String(r[iNote]||'') : 'Importato da foglio "Fonti" il ' + new Date().toISOString().substring(0,10);
        var id = 'FB' + Date.now() + '_' + i;
        shNuovo.appendRow([id, nome, url, cat, att, note]);
        existingUrls.add(url);
        importati++;
      } catch(e) {
        errori++;
        Logger.log('Errore riga ' + (i+2) + ': ' + e.message);
      }
    });
    Logger.log('=== Importazione completata: ' + importati + ' importati, ' + skipped + ' gia presenti, ' + errori + ' errori ===');
    return { ok:true, importati: importati, skipped: skipped, errori: errori };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

function _findIdx_(headersLow, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headersLow.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

function inspectFogliFontiVecchi() {
  Logger.log('=== INSPECT FOGLI FONTI VECCHI ===');
  try {
    var ss = getMainSS();
    Logger.log('File: ' + ss.getName() + ' (id ' + ss.getId() + ')');
    var fogliDaIspezionare = ['Fonti','FontiBandi','FontiPodcast','SocialFonti','Bandi'];
    fogliDaIspezionare.forEach(function(name) {
      Logger.log('');
      Logger.log('--- Foglio "' + name + '" ---');
      var sh = ss.getSheetByName(name);
      if (!sh) { Logger.log('  Non esiste'); return; }
      var rows = sh.getLastRow();
      var cols = sh.getLastColumn();
      Logger.log('  Righe: ' + rows + ' · Colonne: ' + cols);
      if (cols === 0) return;
      var headers = sh.getRange(1, 1, 1, cols).getValues()[0];
      Logger.log('  Headers: [' + headers.map(function(h){return '"'+h+'"';}).join(', ') + ']');
      if (rows > 1) {
        var sample = sh.getRange(2, 1, Math.min(3, rows-1), cols).getValues();
        sample.forEach(function(r, i) {
          Logger.log('  Riga ' + (i+2) + ': ' + r.map(function(c){
            var s = String(c||''); return s.length > 60 ? s.substring(0,60)+'…' : s;
          }).join(' | '));
        });
      }
    });
    Logger.log('');
    Logger.log('=== FINE ===');
    return { ok:true };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

function auditFullSystem() {
  Logger.log('================================================================');
  Logger.log('=== AUDIT COMPLETO STRUTTURA DATI OSSERVATORIO CULTURALE ===');
  Logger.log('================================================================');
  var report = {};
  var FILE_STANDALONE = '1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0';
  var FILE_PRINCIPALE = '15TgAkxCTTMdfSHjk4AoXt8Fh6TRVnvzW5FVRQSMO5Xk';

  Logger.log('');
  Logger.log('▸ getMainSS() — file usato per FontiBandi/FontiPodcast/Items/Podcast/MailingList');
  try {
    var ss = getMainSS();
    var mainId = ss.getId();
    Logger.log('   Nome file: ' + ss.getName());
    Logger.log('   ID: ' + mainId);
    Logger.log('   URL: ' + ss.getUrl());
    Logger.log('   = file standalone? ' + (mainId === FILE_STANDALONE ? 'SI' : 'NO'));
    Logger.log('   = file principale? ' + (mainId === FILE_PRINCIPALE ? 'SI' : 'NO'));
    report.mainSS = { id: mainId, name: ss.getName(), url: ss.getUrl() };
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ getSheetRadar() — foglio usato per leggere i bandi RADAR');
  try {
    var sh = getSheetRadar();
    var radarSS = sh.getParent();
    Logger.log('   Nome foglio: ' + sh.getName());
    Logger.log('   Righe (escluso header): ' + (sh.getLastRow() - 1));
    Logger.log('   File contenitore: ' + radarSS.getName());
    Logger.log('   ID file: ' + radarSS.getId());
    Logger.log('   = file standalone? ' + (radarSS.getId() === FILE_STANDALONE ? 'SI' : 'NO'));
    Logger.log('   = file principale? ' + (radarSS.getId() === FILE_PRINCIPALE ? 'SI' : 'NO'));
    Logger.log('   = STESSO file di getMainSS()? ' + (report.mainSS && radarSS.getId() === report.mainSS.id ? 'SI' : 'NO'));
    report.radarSheet = { id: radarSS.getId(), name: radarSS.getName(), sheetName: sh.getName(), rows: sh.getLastRow()-1 };
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ Foglio FontiBandi (gestito via getMainSS)');
  try {
    var fb = report.mainSS ? SpreadsheetApp.openById(report.mainSS.id).getSheetByName('FontiBandi') : null;
    if (fb) {
      Logger.log('   Foglio "FontiBandi" trovato in: ' + report.mainSS.name);
      Logger.log('   Righe (escluso header): ' + (fb.getLastRow() - 1));
      report.fontiBandiCount = fb.getLastRow() - 1;
    } else {
      Logger.log('   FOGLIO "FontiBandi" NON ESISTE nel file principale');
      report.fontiBandiCount = 0;
    }
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ Fonti bandi: hardcoded vs foglio dinamico');
  try {
    var nHardcoded = (typeof TUTTE_LE_FONTI_BANDI !== 'undefined') ? TUTTE_LE_FONTI_BANDI.length : 'undefined';
    Logger.log('   Fonti hardcoded in TUTTE_LE_FONTI_BANDI (Scannerbandi.gs): ' + nHardcoded);
    Logger.log('   Fonti nel foglio FontiBandi (UI Impostazioni mostra queste): ' + (report.fontiBandiCount || 0));
    if (nHardcoded !== 'undefined' && nHardcoded !== (report.fontiBandiCount || 0)) {
      Logger.log('   ⚠ DISCORDANZA: lo scanner usa quelle hardcoded, non quelle del foglio!');
    }
    report.fontiHardcoded = nHardcoded;
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ Apertura diretta dei 2 file noti');
  [{id:FILE_STANDALONE, label:'STANDALONE (hardcoded in getSheetRadar)'},
   {id:FILE_PRINCIPALE, label:'PRINCIPALE (Osservatorio Culturale)'}].forEach(function(f){
    try {
      var s = SpreadsheetApp.openById(f.id);
      var sheets = s.getSheets();
      Logger.log('   ' + f.label);
      Logger.log('     Nome: ' + s.getName() + ' · ID: ' + f.id);
      Logger.log('     Numero fogli: ' + sheets.length);
      sheets.forEach(function(sh){
        Logger.log('       ▸ "' + sh.getName() + '": ' + sh.getLastRow() + ' righe');
      });
    } catch(e) { Logger.log('   ' + f.label + ': ERR ' + e.message); }
  });

  Logger.log('');
  Logger.log('=== FINE AUDIT ===');
  return report;
}

function inspectAllRadarSheets() {
  Logger.log('=== INSPECT ALL RADAR FILES ===');
  var fileIds = [
    { id:'1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0', label:'File standalone "RADAR BANDI"' },
    { id:'15TgAkxCTTMdfSHjk4AoXt8Fh6TRVnvzW5FVRQSMO5Xk', label:'File principale "Osservatorio Culturale"' }
  ];
  var results = [];
  fileIds.forEach(function(f) {
    Logger.log('');
    Logger.log('--- ' + f.label + ' (id=' + f.id + ') ---');
    try {
      var ss = SpreadsheetApp.openById(f.id);
      var sheets = ss.getSheets();
      Logger.log('  Nome file: ' + ss.getName());
      Logger.log('  Numero fogli: ' + sheets.length);
      var radarInfo = null;
      sheets.forEach(function(sh) {
        var name = sh.getName();
        var rows = sh.getLastRow();
        var cols = sh.getLastColumn();
        Logger.log('    ▸ Foglio "' + name + '": ' + rows + ' righe x ' + cols + ' colonne');
        if (/radar|bandi/i.test(name) && cols > 0) {
          var headers = sh.getRange(1,1,1,cols).getValues()[0];
          Logger.log('       Headers: [' + headers.map(function(h){return '"'+h+'"';}).join(', ') + ']');
          var hasAmbito = headers.some(function(h){ return /^(ambito|amb)/i.test(String(h||'').trim()); });
          Logger.log('       Colonna ambito presente: ' + (hasAmbito ? 'SI' : 'NO'));
          radarInfo = { sheetName: name, rows: rows, cols: cols, headers: headers, hasAmbito: hasAmbito };
        }
      });
      results.push({ fileId: f.id, label: f.label, fileName: ss.getName(), totSheets: sheets.length, radar: radarInfo });
    } catch(e) {
      Logger.log('  ERR apertura file: ' + e.message);
      results.push({ fileId: f.id, label: f.label, error: e.message });
    }
  });
  Logger.log('');
  Logger.log('=== RIEPILOGO ===');
  results.forEach(function(r) {
    if (r.error) Logger.log(r.label + ': ERRORE ' + r.error);
    else if (r.radar) Logger.log(r.label + ': foglio "' + r.radar.sheetName + '" con ' + (r.radar.rows-1) + ' bandi · AMBITO=' + (r.radar.hasAmbito?'SI':'NO'));
    else Logger.log(r.label + ': nessun foglio "radar/bandi" trovato');
  });
  return results;
}

function migraBandiAmbito() {
  try {
    if (typeof _migraBandiAmbitoLegacy === 'function') {
      return _migraBandiAmbitoLegacy();
    }
  } catch(e) {}

  try {
    var sh = getSheetRadar();
    if (!sh) return { error:'sheet RADAR non trovato' };
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) return { ok:true, aggiornati:0, saltati:0, note:'foglio vuoto' };
    var headers = sh.getRange(1,1,1,lastCol).getValues()[0];

    // Sprint 1.3 (2026-05-01) FIX: ricerca tollerante della colonna ambito
    var iAmbito = -1;
    var candidates = [
      'AMBITO','Ambito','ambito',
      'AMBITO_ID','AmbitoId','AmbitoID','AMBITO ID','Ambito ID',
      'AMB','Amb','amb','AMBITO_NUM','AmbitoNum','Ambito Num',
      'Ambito Strategico','Ambito strategico','AMBITO STRATEGICO',
      'Tema','TEMA','Tema Strategico','Tema strategico',
      'Categoria','CATEGORIA','Categoria Tematica','Categoria tematica',
      'Macro Ambito','Macro ambito','MacroAmbito',
      'Area','AREA','Area Tematica','Area tematica'
    ];
    var headersLow = headers.map(function(h){ return String(h||'').toLowerCase().trim(); });
    for (var c = 0; c < candidates.length; c++) {
      var idx = headersLow.indexOf(candidates[c].toLowerCase());
      if (idx >= 0) { iAmbito = idx; break; }
    }
    // Fallback: cerca substring "ambit" (matcha sia "ambito" sia "ambiti")
    if (iAmbito < 0) {
      for (var h = 0; h < headersLow.length; h++) {
        if (headersLow[h].indexOf('ambit') >= 0) { iAmbito = h; Logger.log('Match per substring "ambit": col ' + (h+1) + ' "' + headers[h] + '"'); break; }
      }
    }
    if (iAmbito < 0) {
      var headerList = headers.map(function(h, i){ return (i+1)+':"'+h+'"'; }).join(', ');
      return {
        error: 'Colonna AMBITO non trovata. Headers attuali: ' + headerList +
               '. Soluzione: apri il foglio RADAR (vedi URL via getMainSheetUrl), aggiungi una colonna chiamata esattamente "AMBITO" (maiuscolo) e riprova.'
      };
    }
    Logger.log('Colonna ambito trovata: ' + headers[iAmbito] + ' (col ' + (iAmbito+1) + ')');
    var iTit = headers.indexOf('TITOLO'); if (iTit < 0) iTit = headers.indexOf('Titolo');
    var iSet = headers.indexOf('SETTORE'); if (iSet < 0) iSet = headers.indexOf('Settore');
    var iNote = headers.indexOf('NOTE'); if (iNote < 0) iNote = headers.indexOf('Note');
    var data = sh.getRange(2, 1, lastRow-1, lastCol).getValues();
    var rules = [
      { amb:2, kw:['accessib','disabil','easy-to-read','e2r','barrier','inclus','sensoriale','tattile','autismo','alzheimer','sordo','non vedente','lis '] },
      { amb:5, kw:['digital','ai ','intelligenza artificiale','machine learning','metaverso','realta virtuale','realta aumentata','open data','cloud','nft','blockchain','digitalizzazione','governance','fundraising','sponsor','art bonus','europa creativa','horizon','erasmus','pnrr'] },
      { amb:4, kw:['welfare','comunita','partecipazione','cocreation','crowdsourcing','citizen science','quartiere','rigenerazione urbana','audience','community','arte terapia','ospedale','carcere','quartieri','periferia'] },
      { amb:3, kw:['mostra','allestimento','esposiz','curatela','collezion','catalogazione','iccd','restauro','conservazione','patrimonio','ricerca','didattica','educat','laborator','workshop','servizi al visitatore','membership','ticketing','accoglienza'] },
      { amb:1, kw:['identita','marca','brand','rebranding','posizionamento','storytelling','narrazione','vision','missione','manifesto culturale'] }
    ];
    var aggiornati = 0, saltati = 0;
    for (var i = 0; i < data.length; i++) {
      var attuale = data[i][iAmbito];
      if (attuale && String(attuale).trim() !== '' && Number(attuale) >= 1 && Number(attuale) <= 5) { saltati++; continue; }
      var text = ((iTit>=0?String(data[i][iTit]||''):'') + ' ' + (iSet>=0?String(data[i][iSet]||''):'') + ' ' + (iNote>=0?String(data[i][iNote]||''):'')).toLowerCase();
      var assigned = 0;
      for (var r = 0; r < rules.length; r++) {
        var matched = rules[r].kw.some(function(k){ return text.indexOf(k) >= 0; });
        if (matched) { assigned = rules[r].amb; break; }
      }
      if (!assigned) assigned = 3;
      sh.getRange(i+2, iAmbito+1).setValue(assigned);
      aggiornati++;
    }
    return { ok:true, aggiornati: aggiornati, saltati: saltati };
  } catch(e) {
    return { error: e.message };
  }
}

/**
 * Sprint 1.3 (2026-05-01) — Test scan di una singola fonte bandi.
 * Verifica raggiungibilita HTTP e ritorna riepilogo (no salvataggio nuovi bandi).
 * @param {string} id  ID fonte
 * @return {Object} { ok, status, contentLength, error?, fonte? }
 */
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
// PODCAST v3.2
// ==================================================================

function getPodcastSheet() {
  const SS = getMainSS();
  let sh = SS.getSheetByName(SH.PODCAST);
  if (!sh) {
    sh = SS.insertSheet(SH.PODCAST);
    const h = ['ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata','DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte','Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord'];
    sh.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function getPodcasts(params) {
  const sh = getPodcastSheet();
  if (!sh) return {podcasts:[], total:0};
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {podcasts:[], total:0};  // * solo header = nessun dato
  const rows = sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues();
  const h = rows[0];
  if (!h || h.length === 0) return {podcasts:[], total:0};
  const podcasts = [];
  const q = (params && params.q ? params.q : '').toLowerCase();
  const tematica = params && params.tematica ? params.tematica : '';
  const stato = params && params.stato ? params.stato : '';
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r[0]) continue;
    const p = {}; h.forEach((col, idx) => { p[col] = r[idx]; });
    // * StatoRecord vuoto o mancante = trattato come 'attivo'
    const sr = String(p.StatoRecord || 'attivo').toLowerCase().trim();
    if (sr === 'archiviato' && stato !== 'archiviato') continue;
    if (stato === 'ascoltati' && !p.Ascoltato) continue;
    if (stato === 'da-ascoltare' && !p.DaAscoltare) continue;
    if (stato === 'digest' && !p.InclusiNelDigest) continue;
    if (stato === 'nuovi' && p.Ascoltato) continue;
    if (tematica && p.Tematica !== tematica) continue;
    if (q) {
      const haystack = ((p.Titolo||'')+' '+(p.Serie||'')+' '+(p.Autore||'')+' '+(p.SommarioAI||'')).toLowerCase();
      if (!haystack.includes(q)) continue;
    }
    if (p.DataRilevamento instanceof Date) p.DataRilevamento = formatDate(p.DataRilevamento);
    if (p.DataPubblicazione instanceof Date) p.DataPubblicazione = formatDate(p.DataPubblicazione);
    podcasts.push(p);
  }
  podcasts.sort((a,b) => {
    const ua = !a.Ascoltato ? 1 : 0, ub = !b.Ascoltato ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return (b.Score||0) - (a.Score||0);
  });
  return {podcasts, total: podcasts.length};
}

function savePodcast(body) {
  const sh = getPodcastSheet();
  const id = body.id || ('POD' + Date.now());
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const idCol = h.indexOf('ID');
  // Update existing
  if (body.id) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][idCol] === body.id) {
        const vals = [body.id, rows[i][1], body.titolo||'', body.serie||'', body.autore||'', body.tematica||'', body.durata||'', body.dataPubl||'', body.link||'', body.sommario||'', rows[i][10], rows[i][11], body.fonte||'', rows[i][13], rows[i][14], rows[i][15], rows[i][16]||'attivo'];
        sh.getRange(i+1,1,1,vals.length).setValues([vals]);
        return {ok:true};
      }
    }
  }
  // New
  sh.appendRow([id, new Date(), body.titolo||'', body.serie||'', body.autore||'', body.tematica||'Musei & Patrimonio', body.durata||'', body.dataPubl||'', body.link||'', body.sommario||'', '', 3, body.fonte||'manuale', false, false, false, 'attivo']);
  return {ok:true, id};
}

function togglePodField(body) {
  const sh = getPodcastSheet();
  if (!sh || sh.getLastRow() < 2) return {error:'Foglio podcast vuoto'};
  const rows = sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues();
  const h = rows[0];
  const idCol = h.indexOf('ID');
  const fieldCol = h.indexOf(body.field);
  if (fieldCol < 0) return {error:'Campo non trovato: '+body.field};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === body.id) {
      const nv = !rows[i][fieldCol];
      sh.getRange(i+1, fieldCol+1).setValue(nv);
      return {ok:true, value:nv};
    }
  }
  return {error:'Podcast non trovato'};
}

function deletePodcast(id) {
  const sh = getPodcastSheet();
  const rows = sh.getDataRange().getValues();
  const idCol = rows[0].indexOf('ID');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === id) { sh.deleteRow(i+1); return {ok:true}; }
  }
  return {error:'Non trovato'};
}

// ==================================================================
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
  if(typeof setupTriggersUnificati==='function') { setupTriggersUnificati(); return; }
  ScriptApp.getProjectTriggers().forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scanSources').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(7).create();
  ScriptApp.newTrigger('scanSources').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(7).create();
  ScriptApp.newTrigger('sendDigestAuto').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(8).create();
  ScriptApp.newTrigger('sendDigestAuto').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(8).create();
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

  const totale = bandiSel.length + notizieCount + podCount;
  Logger.log('[BOZZA DIGEST LUN] Bandi: ' + bandiSel.length +
             ' | Notizie: ' + notizieCount +
             ' | Podcast: ' + podCount +
             ' | TOTALE: ' + totale);

  // Telegram: bozza pronta
  const dataFmt = Utilities.formatDate(oggi, 'Europe/Rome', 'EEEE dd/MM/yyyy');
  const msg = '📋 *Bozza Digest* pronta — ' + dataFmt + '\n\n' +
    '📊 *' + bandiSel.length + '* bandi\n' +
    '📰 *' + notizieCount + '* notizie\n' +
    '🎙 *' + podCount + '* podcast\n' +
    '─────────────────\n' +
    'Totale: *' + totale + '* contenuti\n\n' +
    '_Rivedi e invia dall\'Osservatorio → Email Digest_\n' +
    '_Duemilamusei_';
  try { sendTelegram(msg); } catch(e) { Logger.log('TG bozza err: ' + e.message); }

  return { bandi: bandiSel.length, notizie: notizieCount, podcast: podCount, totale };
}


// ==================================================================
// SOSTITUZIONE lunediMattina() — v4.2
// Sostituisce COMPLETAMENTE la funzione lunediMattina() esistente
// ==================================================================
function lunediMattina() {
  Logger.log('=== LUNEDI MATTINA v4.2 - OSSERVATORIO CULTURALE ===');

  // 1. Auto-archiviazione bandi scaduti
  try { autoArchiviaScaduti(); } catch(e) { Logger.log('autoArchivia bandi: ' + e.message); }

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
    '\n_Osservatorio Culturale · Duemilamusei_';
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

function debugProps() {
  const p=PropertiesService.getScriptProperties().getProperties();
  Logger.log('SHEET_ID: '+p.SHEET_ID); Logger.log('ADMIN_PASSWORD: '+p.ADMIN_PASSWORD);
  Logger.log('CLAUDE_API_KEY: '+(p.CLAUDE_API_KEY?'SI':'NO'));
}

function testGetBandiRadar() {
  const bandi=getBandiRadar();
  Logger.log('Totale: '+bandi.length+' | Attivi: '+bandi.filter(b=>b.statoRecord!=='archiviato').length+' | Archiviati: '+bandi.filter(b=>b.statoRecord==='archiviato').length);
}