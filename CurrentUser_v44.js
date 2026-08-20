/**
 * ================================================================
 * OSSERVATORIO CULTURALE — CurrentUser_v44.gs  (v4.4)
 * ----------------------------------------------------------------
 * Endpoint identità utente per il frontend + check admin + logout.
 *
 * Usa Session.getActiveUser().getEmail() (funziona SOLO quando il
 * deploy è "Solo me" oppure "Chiunque con account Google", non con
 * accesso "Chiunque").
 *
 * ScriptProperty utilizzate:
 *   OC_ADMIN_EMAILS  = CSV di email admin. Default: s.straccini@gmail.com
 *   OC_EDITOR_EMAILS = CSV di email editor (optional)
 *
 * Funzioni pubbliche (chiamabili da google.script.run):
 *   getCurrentUser_v44()     — identità corrente per topbar/sidebar
 *   setAdminEmails(csv)       — setup iniziale (esegui da editor)
 *   setEditorEmails(csv)      — setup iniziale (esegui da editor)
 *   getAdminEmails()          — legge lista (solo admin)
 * ================================================================
 */

// --- Config default ---
var OC_ADMIN_DEFAULT_ = 's.straccini@gmail.com';

// ============================================================================
// v4.18.56 (2026-05-16) — SPRINT 1 ruoli: getRuoloCorrente(token)
// ----------------------------------------------------------------------------
// Singola fonte di verità per identità + ruolo utente.
// Combina due binari di auth: Google login + magic-link token.
//
// Output unificato:
// {
//   ok: bool,
//   ruolo: 'anonimo' | 'lettore' | 'editor' | 'admin',
//   livello: 0|1|2|3,                  // numerico per gating frontend
//   email: string,                     // email risolta (da login o token)
//   nome: string,                      // derivata da email
//   initials: string,
//   isAdmin: bool,
//   isEditor: bool,                    // true anche per admin
//   isLead: bool,                      // true per lettore+editor+admin
//   authMethod: 'session'|'token'|'admin_token'|'session+token'|'guest',
//   tokenValido: bool,
//   matrixCompletato: bool,
//   logoutUrl: string
// }
//
// Precedenze (admin sempre vince):
//   1. Email Google in OC_ADMIN_EMAILS    → admin (livello 3)
//   2. Email Google in OC_EDITOR_EMAILS   → editor (livello 2)
//   3. Magic-link valido (token)          → lettore (livello 1)
//   4. adminToken URL valido              → admin emergency (livello 3)
//   5. Email Google generica              → lettore se ha sessione, altrimenti anonimo
//   6. Nessun login + nessun token        → anonimo (livello 0)
//
// NOTA: questa funzione NON modifica altri moduli — è una nuova lente.
// I wrapper getCurrentUser_v44 e _isCurrentUserAdmin_ ora la usano internamente
// ma mantengono signature/output identici al precedente per backward-compat.
// ============================================================================

/**
 * Risolve ruolo + identità dell'utente corrente combinando Google + magic-link.
 *
 * @param {string} [token]      — token magic-link da URL ?t=... (opzionale)
 * @param {string} [adminToken] — token admin URL ?adm=... (opzionale)
 * @return {Object} vedi schema in header sezione
 */
function getRuoloCorrente(token, adminToken) {
  // v5.1.10 — Rimossa dipendenza da Google Session API (getEffectiveUser/getActiveUser).
  // Con deploy ANYONE_ANONYMOUS + USER_DEPLOYING, getEffectiveUser() restituisce SEMPRE
  // l'email del deployer per tutti i visitatori → tutti risultavano admin.
  // Ora il ruolo si determina SOLO dal sistema di sessioni custom (token + foglio Utenti).

  var admins  = _getAdminSet_();
  var editors = _getEditorSet_();

  // --- 1) AdminToken URL (accesso admin emergenza via ?adm=TOKEN) ---
  var isAdminByToken = false;
  try {
    if (adminToken && typeof _validateAdminToken_ === 'function') {
      isAdminByToken = !!_validateAdminToken_(adminToken);
    }
  } catch(_) {}

  // --- 2) Magic-link / sessione token (loginConEmail o localStorage) ---
  var sessionInfo = null;
  if (token && typeof validaSessione === 'function') {
    try {
      var s = validaSessione(token);
      if (s && s.ok && s.valid) sessionInfo = s;
    } catch(_) {}
  }
  var emailToken = sessionInfo ? String(sessionInfo.email || '').toLowerCase().trim() : '';

  // --- 3) Risoluzione email finale ---
  var emailFinale = emailToken || '';

  // --- 4) Determinazione ruolo ---
  var ruolo, livello, authMethod;
  if (isAdminByToken) {
    // Admin emergency via URL token
    ruolo = 'admin'; livello = 3; authMethod = 'admin_token';
    if (!emailFinale) emailFinale = OC_ADMIN_DEFAULT_;
  } else if (sessionInfo) {
    // Sessione valida — ruolo dal foglio Utenti (via livello sessione + check admin/editor)
    if (admins[emailToken] === true || (sessionInfo.livello && sessionInfo.livello >= 3)) {
      ruolo = 'admin'; livello = 3; authMethod = 'token';
    } else if (editors[emailToken] === true || (sessionInfo.livello && sessionInfo.livello >= 2)) {
      ruolo = 'editor'; livello = 2; authMethod = 'token';
    } else {
      ruolo = 'lettore'; livello = 1; authMethod = 'token';
    }
  } else {
    ruolo = 'anonimo'; livello = 0; authMethod = 'guest';
  }

  // --- 5) Output unificato ---
  var nome = _deriveName_(emailFinale);
  return {
    ok: true,
    ruolo: ruolo,
    livello: livello,
    email: emailFinale,
    nome: emailFinale ? nome : 'Ospite',
    initials: emailFinale ? _deriveInitials_(nome) : 'OS',
    isAdmin: ruolo === 'admin',
    isEditor: ruolo === 'admin' || ruolo === 'editor',
    isLead: livello >= 1,
    authMethod: authMethod,
    tokenValido: !!sessionInfo,
    matrixCompletato: sessionInfo ? !!sessionInfo.matrixCompletato : false,
    logoutUrl: _buildLogoutUrl_()
  };
}

// ============================================================================
// END Sprint 1 — getRuoloCorrente
// ============================================================================

/**
 * Ritorna identità dell'utente corrente.
 * {
 *   email:    string,
 *   nome:     string,        // prima parte della email o 'Ospite'
 *   initials: string,        // max 2 caratteri
 *   ruolo:    'admin'|'editor'|'lettore'|'guest',
 *   isAdmin:  boolean,
 *   isEditor: boolean,
 *   logoutUrl: string        // URL per log-out + redirect
 * }
 */
function getCurrentUser_v44(tokenOrAdminToken) {
  // v4.19.1 — Accetta token sessione O admin token. Lo passa a getRuoloCorrente
  // come primo arg (session token) e secondo arg (admin token).
  var r = getRuoloCorrente(tokenOrAdminToken || null, tokenOrAdminToken || null);

  // Mappa ruolo 'anonimo' → 'guest' per backward-compat
  var ruoloLegacy = (r.ruolo === 'anonimo') ? 'guest' : r.ruolo;

  return {
    email:      r.email,
    nome:       r.nome,
    initials:   r.initials,
    ruolo:      ruoloLegacy,
    isAdmin:    r.isAdmin,
    isEditor:   r.isEditor,
    authMethod: r.authMethod,
    logoutUrl:  r.logoutUrl
  };
}

/**
 * Imposta la lista di email admin (esegui una volta da editor).
 * Esempio: setAdminEmails('s.straccini@gmail.com, altro@duemilamusei.it')
 */
function setAdminEmails(csv) {
  var clean = _normalizeCsvEmails_(csv);
  PropertiesService.getScriptProperties().setProperty('OC_ADMIN_EMAILS', clean);
  return { ok: true, admins: clean.split(',').filter(String) };
}

function setEditorEmails(csv) {
  var clean = _normalizeCsvEmails_(csv);
  PropertiesService.getScriptProperties().setProperty('OC_EDITOR_EMAILS', clean);
  return { ok: true, editors: clean.split(',').filter(String) };
}

/**
 * Ritorna la lista admin corrente (richiamabile solo da admin).
 */
function getAdminEmails() {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  var csv = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || OC_ADMIN_DEFAULT_;
  var list = csv.split(',').map(function(s){ return s.trim(); }).filter(String);
  return { ok:true, admins:list };
}

// ================== PRIVATE HELPERS ==================

function _getAdminSet_() {
  var csv = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS');
  if (!csv || !csv.trim()) csv = OC_ADMIN_DEFAULT_;
  return _csvToSet_(csv);
}

function _getEditorSet_() {
  var csv = PropertiesService.getScriptProperties().getProperty('OC_EDITOR_EMAILS') || '';
  return _csvToSet_(csv);
}

function _csvToSet_(csv) {
  var out = {};
  String(csv || '').split(',').forEach(function(e){
    var t = String(e).trim().toLowerCase();
    if (t) out[t] = true;
  });
  return out;
}

function _normalizeCsvEmails_(csv) {
  return String(csv || '')
    .split(',')
    .map(function(s){ return String(s).trim().toLowerCase(); })
    .filter(function(s){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); })
    .join(',');
}

function _isCurrentUserAdmin_(tokenOrAdminToken) {
  // v4.20 — Accetta sia session token che admin URL token.
  // Prova prima come session token (1° arg), poi come admin token (2° arg).
  try {
    var r = getRuoloCorrente(tokenOrAdminToken, tokenOrAdminToken);
    return !!r.isAdmin;
  } catch(_) { return false; }
}

/**
 * v4.18.56 (2026-05-16) — Helper di gating: verifica se utente corrente è editor o admin.
 * Usato dalle funzioni "Impostazioni" che devono essere accessibili anche ai collaboratori.
 *
 * @param {string} [adminToken] token URL opzionale
 * @param {string} [magicToken] token magic-link opzionale
 * @return {boolean}
 */
function _isCurrentUserEditorOrAdmin_(tokenOrAdminToken) {
  // v4.20 — Accetta sia session token che admin URL token.
  try {
    var r = getRuoloCorrente(tokenOrAdminToken, tokenOrAdminToken);
    return !!r.isEditor;
  } catch(_) { return false; }
}

function _deriveName_(email) {
  if (!email) return 'Ospite';
  var local = String(email).split('@')[0] || '';
  if (!local) return email;
  // "s.straccini" -> "Silvano Straccini"-ish:
  var parts = local.split(/[\._\-]+/).filter(String);
  if (!parts.length) return email;
  return parts.map(function(p){
    if (p.length <= 2) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join(' ');
}

function _deriveInitials_(nome) {
  if (!nome) return '·';
  var parts = String(nome).split(/\s+/).filter(String);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return String(nome).substring(0, 2).toUpperCase();
}

/**
 * Costruisce URL di logout che disconnette l'account Google
 * e poi rimanda al /exec della webapp (chiederà di nuovo login).
 */
function _buildLogoutUrl_() {
  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) { webUrl = ''; }
  var cont = encodeURIComponent(webUrl);
  // Google logout + redirect. Funziona nella maggior parte dei browser.
  return 'https://accounts.google.com/Logout?continue=' + cont;
}
function _setupAdmin_() {
  setAdminEmails('s.straccini@gmail.com');
  Logger.log('Admin emails impostate: ' + getAdminEmails());
}

// NOTA: le funzioni GESTIONE UTENTI (getAllUtenti, approveUser, rejectUser,
// suspendUser, deleteUser, updateUserRuolo, updateUserOptIn, getUtenteByEmail_,
// requestAccess) sono definite in Auth.js che usa lo schema aggiornato del
// foglio Utenti con lookup dinamico degli header. Non duplicare qui.