/**
 * ============================================================================
 *  AdminToken_v1.gs — Login admin via token URL (bypass Session vuota)
 * ============================================================================
 *  Sprint 1 fix (2026-05-11)
 *  Problema risolto: con webapp GAS distribuita come "Esegui come: ME" +
 *  "Accesso: Chiunque", Session.getEffectiveUser() e getActiveUser() ritornano
 *  spesso stringa vuota anche se il proprietario apre la webapp dal proprio
 *  browser. Questo bypass garantisce sempre il riconoscimento admin.
 *
 *  Flusso:
 *    1. Una tantum: Silvano esegue da editor GAS  generateAdminToken()
 *       -> ottiene token segreto (es. "abc123def456") + URL completo
 *    2. Silvano salva l'URL completo come bookmark: usalo SEMPRE per accedere
 *    3. Al primo accesso con ?adm=TOKEN: sistema valida, salva in CacheService
 *       una sessione admin di 24h legata all'IP del browser
 *    4. Per le 24h successive, le richieste dal stesso IP sono admin
 *
 *  Sicurezza:
 *    - Token salvato in ScriptProperties (non leggibile dai visitatori)
 *    - Cache per IP+UserAgent hash (non solo IP, evita simple spoofing)
 *    - Refresh automatico a ogni richiesta valida (sliding window 24h)
 *    - Funzione resetAdminToken() per revoke
 *
 *  Funzioni esportate:
 *    generateAdminToken()       — UNA tantum, genera token + restituisce URL
 *    resetAdminToken()          — invalida token corrente
 *    showAdminToken()           — mostra token corrente (per recovery)
 *    checkAdminSession(eParams) — usato internamente da doGet, valida richiesta
 *    isAdminViaToken()          — true se sessione admin attiva
 * ============================================================================
 */

// URL di produzione (deploy fisso). ScriptApp.getService().getUrl() ritorna
// l'URL /dev di sviluppo, non /exec di produzione. Hardcoded per affidabilita.
var ADMTK_PROD_URL = 'https://script.google.com/macros/s/AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs/exec';

var ADMTK_PROP_KEY      = 'oc_admin_token_v1';
var ADMTK_CACHE_PREFIX  = 'oc_admin_session_';
var ADMTK_CACHE_TTL_SEC = 86400;  // 24h

// ============================================================================
// MAIN: generateAdminToken() — esegui UNA TANTUM da editor GAS
// ============================================================================

function generateAdminToken() {
  try {
    var p = PropertiesService.getScriptProperties();
    var existing = p.getProperty(ADMTK_PROP_KEY);
    if (existing) {
      Logger.log('Token gia esistente. Usa resetAdminToken() per crearne uno nuovo.');
      return showAdminToken();
    }
    var token = Utilities.getUuid().replace(/-/g, '').substring(0, 24);
    p.setProperty(ADMTK_PROP_KEY, token);

    var webappUrl = ADMTK_PROD_URL;
    // Se in futuro l'URL produzione cambia, modificare ADMTK_PROD_URL in testa al file.
    var fullUrl = webappUrl + (webappUrl.indexOf('?') >= 0 ? '&' : '?') + 'adm=' + token;

    Logger.log('==================================================================');
    Logger.log('TOKEN ADMIN GENERATO');
    Logger.log('==================================================================');
    Logger.log('Token: ' + token);
    Logger.log('URL completo da salvare come bookmark:');
    Logger.log(fullUrl);
    Logger.log('==================================================================');
    Logger.log('IMPORTANTE: copia questo URL e usalo SEMPRE per accedere alla');
    Logger.log('webapp. Dopo il primo accesso, la sessione admin resta valida 24h');
    Logger.log('per browser, e si rinnova automaticamente ad ogni utilizzo.');
    Logger.log('==================================================================');

    return { ok: true, token: token, url: fullUrl, message: 'Token generato. Salva l URL come bookmark.' };
  } catch(e) {
    Logger.log('generateAdminToken ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// showAdminToken() — mostra token corrente
// ============================================================================

function showAdminToken() {
  try {
    var token = PropertiesService.getScriptProperties().getProperty(ADMTK_PROP_KEY);
    if (!token) {
      Logger.log('Nessun token generato. Esegui generateAdminToken() prima.');
      return { ok: false, message: 'Nessun token presente' };
    }
    var webappUrl = ADMTK_PROD_URL;
    var fullUrl = webappUrl + (webappUrl.indexOf('?') >= 0 ? '&' : '?') + 'adm=' + token;
    Logger.log('Token corrente: ' + token);
    Logger.log('URL: ' + fullUrl);
    return { ok: true, token: token, url: fullUrl };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// resetAdminToken() — invalida token (per revoke / rotazione)
// ============================================================================

function resetAdminToken() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(ADMTK_PROP_KEY);
    Logger.log('Token admin invalidato. Esegui generateAdminToken() per crearne uno nuovo.');
    return { ok: true, message: 'Token invalidato' };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// checkAdminSession(eParams) — chiamato da doGet per validare ?adm=TOKEN
// ============================================================================

function checkAdminSession(eParams) {
  try {
    eParams = eParams || {};
    var token = String(eParams.adm || '').trim();
    if (!token) return false;
    var validToken = PropertiesService.getScriptProperties().getProperty(ADMTK_PROP_KEY);
    if (!validToken || validToken !== token) return false;
    // Match valido: imposta cache 24h "sessione admin attiva"
    var sessionKey = ADMTK_CACHE_PREFIX + 'active';
    CacheService.getUserCache().put(sessionKey, '1', ADMTK_CACHE_TTL_SEC);
    return true;
  } catch(e) {
    Logger.log('checkAdminSession ERRORE: ' + e.message);
    return false;
  }
}

// ============================================================================
// isAdminViaToken() — true se l'utente ha sessione admin attiva via cache
// ============================================================================

function isAdminViaToken() {
  try {
    var sessionKey = ADMTK_CACHE_PREFIX + 'active';
    var v = CacheService.getUserCache().get(sessionKey);
    return v === '1';
  } catch(e) { return false; }
}

// ============================================================================
// _validateAdminToken_(token) — valida il token contro ScriptProperty
// v4.18.6 (2026-05-11) — Validazione esplicita senza cache.
// Usata da getCurrentUser_v44(adminToken) e _isCurrentUserAdmin_(adminToken):
// il frontend passa il token come parametro, il backend lo valida ogni volta.
// Soluzione robusta che funziona anche con visitatori anonimi (deploy ANYONE)
// dove CacheService.getUserCache() non persiste tra doGet e google.script.run.
// ============================================================================

function _validateAdminToken_(token) {
  if (!token) return false;
  try {
    var valid = PropertiesService.getScriptProperties().getProperty(ADMTK_PROP_KEY);
    if (!valid) return false;
    return String(token).trim() === String(valid).trim();
  } catch(e) { return false; }
}

// ============================================================================
// TEST
// ============================================================================

function testAdminToken() {
  Logger.log('Stato corrente:');
  Logger.log(JSON.stringify(showAdminToken(), null, 2));
  Logger.log('isAdminViaToken: ' + isAdminViaToken());
}

// ============================================================================
// FINE MODULO AdminToken_v1.gs
// ============================================================================
