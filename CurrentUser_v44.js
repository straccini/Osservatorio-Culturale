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
function getCurrentUser_v44() {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch(e) { email = ''; }

  if (!email) {
    return {
      email:     '',
      nome:      'Ospite',
      initials:  'OS',
      ruolo:     'guest',
      isAdmin:   false,
      isEditor:  false,
      logoutUrl: _buildLogoutUrl_()
    };
  }

  var emailLc  = String(email).toLowerCase();
  var admins   = _getAdminSet_();
  var editors  = _getEditorSet_();
  var isAdmin  = admins[emailLc] === true;
  var isEditor = isAdmin || editors[emailLc] === true;
  var ruolo    = isAdmin ? 'admin' : (isEditor ? 'editor' : 'lettore');

  var nome = _deriveName_(email);
  var ini  = _deriveInitials_(nome);

  return {
    email:     email,
    nome:      nome,
    initials:  ini,
    ruolo:     ruolo,
    isAdmin:   isAdmin,
    isEditor:  isEditor,
    logoutUrl: _buildLogoutUrl_()
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

function _isCurrentUserAdmin_() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (!email) return false;
    return _getAdminSet_()[email.toLowerCase()] === true;
  } catch(e) { return false; }
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

// ============================================================================
// GESTIONE UTENTI — Foglio "Utenti"
// Colonne: Email | Nome | Ruolo | Stato | Digest | Bandi | Matrix | DataIscrizione | Motivo
// ============================================================================

var OC_UTENTI_SHEET_ = 'Utenti';
var OC_UTENTI_COLS_  = ['Email','Nome','Ruolo','Stato','Digest','Bandi','Matrix','DataIscrizione','Motivo'];
// indici 0-based
var UC_ = { email:0, nome:1, ruolo:2, stato:3, digest:4, bandi:5, matrix:6, data:7, motivo:8 };

function _getUtentiSheet_() {
  var ss = getMainSS ? getMainSS() : SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('OC_MAIN_SS_ID') || ''
  );
  var sh = ss.getSheetByName(OC_UTENTI_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(OC_UTENTI_SHEET_);
    sh.getRange(1, 1, 1, OC_UTENTI_COLS_.length).setValues([OC_UTENTI_COLS_]);
    sh.getRange(1, 1, 1, OC_UTENTI_COLS_.length).setFontWeight('bold');
  }
  return sh;
}

function _rowToUser_(row) {
  return {
    Email:         row[UC_.email]  || '',
    Nome:          row[UC_.nome]   || '',
    Ruolo:         row[UC_.ruolo]  || 'lettore',
    Stato:         row[UC_.stato]  || 'pending',
    Digest:        row[UC_.digest] === true || row[UC_.digest] === 'TRUE',
    Bandi:         row[UC_.bandi]  === true || row[UC_.bandi]  === 'TRUE',
    Matrix:        row[UC_.matrix] === true || row[UC_.matrix] === 'TRUE',
    DataIscrizione:row[UC_.data] ? String(row[UC_.data]).substring(0,10) : '',
    Motivo:        row[UC_.motivo] || ''
  };
}

/**
 * Restituisce tutti gli utenti dal foglio Utenti.
 * { ok, items: [...] }
 */
function getAllUtenti(opts) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  opts = opts || {};
  var sh = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return { ok:true, items:[] };
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var u = _rowToUser_(vals[i]);
    if (!u.Email) continue;
    if (opts.statoFilter && u.Stato !== opts.statoFilter) continue;
    if (opts.ruoloFilter && u.Ruolo !== opts.ruoloFilter) continue;
    out.push(u);
  }
  return { ok:true, items: out };
}

/**
 * Registra una richiesta di accesso (chiamata dalla pagina login pubblica).
 */
function requestAccess(body) {
  body = body || {};
  var email = String(body.email || '').toLowerCase().trim();
  var nome  = String(body.nome  || '').trim();
  var motivo= String(body.motivo|| '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok:false, error:'Email non valida' };

  var sh   = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  // cerca se esiste già
  for (var i = 1; i < vals.length; i++) {
    var rowEmail = String(vals[i][UC_.email] || '').toLowerCase().trim();
    if (rowEmail === email) {
      var stato = String(vals[i][UC_.stato] || '');
      if (stato === 'attivo') return { ok:true, alreadyActive:true, email:email, message:'Account già attivo. Puoi accedere normalmente.' };
      if (stato === 'pending') return { ok:true, message:'Richiesta già ricevuta, in attesa di approvazione.' };
      // sospeso/rifiutato: aggiorna motivo e rimette in pending
      sh.getRange(i+1, UC_.stato+1).setValue('pending');
      sh.getRange(i+1, UC_.motivo+1).setValue(motivo || vals[i][UC_.motivo]);
      return { ok:true, message:'Richiesta reinviata. Sarai contattato entro 24h.' };
    }
  }
  // nuovo utente
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  sh.appendRow([email, nome, 'lettore', 'pending', false, false, false, now, motivo]);
  // notifica Telegram se disponibile
  try {
    if (typeof telegramNotifyAuthRequest_ === 'function') {
      telegramNotifyAuthRequest_({ email:email, nome:nome, motivo:motivo });
    }
  } catch(e) { Logger.log('Telegram notify err: ' + e.message); }
  return { ok:true, message:'Richiesta inviata. Riceverai conferma via email entro 24h.' };
}

/**
 * Approva un utente pending.
 * @param {string} email
 * @param {string} ruolo  admin|editor|lettore
 */
function approveUser(email, ruolo) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  email = String(email || '').toLowerCase().trim();
  ruolo = String(ruolo || 'lettore').toLowerCase().trim();
  if (['admin','editor','lettore'].indexOf(ruolo) < 0) ruolo = 'lettore';

  var sh   = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][UC_.email] || '').toLowerCase().trim() === email) {
      sh.getRange(i+1, UC_.ruolo+1).setValue(ruolo);
      sh.getRange(i+1, UC_.stato+1).setValue('attivo');
      // aggiorna ScriptProperties
      _syncRoleToProps_(email, ruolo);
      // invia email di conferma all'utente
      try {
        var nomeU = vals[i][UC_.nome] || email;
        var webUrl = ScriptApp.getService().getUrl();
        MailApp.sendEmail(email, 'Accesso approvato — Osservatorio Culturale',
          'Ciao ' + nomeU + ',\n\nIl tuo accesso all\'Osservatorio Culturale è stato approvato con ruolo "' + ruolo + '".\n\nEntra qui: ' + webUrl + '\n\nOsservatorio Culturale · Duemilamusei');
      } catch(eM) { Logger.log('Email conferma err: ' + eM.message); }
      return { ok:true, email:email, ruolo:ruolo };
    }
  }
  return { ok:false, error:'Utente non trovato: ' + email };
}

/**
 * Rifiuta una richiesta.
 */
function rejectUser(email, reason) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  email = String(email || '').toLowerCase().trim();
  var sh = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][UC_.email] || '').toLowerCase().trim() === email) {
      sh.getRange(i+1, UC_.stato+1).setValue('rifiutato');
      if (reason) sh.getRange(i+1, UC_.motivo+1).setValue(String(vals[i][UC_.motivo] || '') + ' [RIFIUTATO: ' + reason + ']');
      return { ok:true };
    }
  }
  return { ok:false, error:'Utente non trovato' };
}

/**
 * Sospende un utente attivo.
 */
function suspendUser(email) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  email = String(email || '').toLowerCase().trim();
  var sh = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][UC_.email] || '').toLowerCase().trim() === email) {
      sh.getRange(i+1, UC_.stato+1).setValue('sospeso');
      _removeRoleFromProps_(email); // rimuove da admin/editor se necessario
      return { ok:true };
    }
  }
  return { ok:false, error:'Utente non trovato' };
}

/**
 * Elimina un utente dal foglio.
 */
function deleteUser(email) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  email = String(email || '').toLowerCase().trim();
  var sh = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][UC_.email] || '').toLowerCase().trim() === email) {
      sh.deleteRow(i+1);
      _removeRoleFromProps_(email);
      return { ok:true };
    }
  }
  return { ok:false, error:'Utente non trovato' };
}

/**
 * Aggiorna il ruolo di un utente.
 */
function updateUserRuolo(email, ruolo) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  email = String(email || '').toLowerCase().trim();
  ruolo = String(ruolo || 'lettore').toLowerCase().trim();
  if (['admin','editor','lettore'].indexOf(ruolo) < 0) return { ok:false, error:'Ruolo non valido' };
  var sh = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][UC_.email] || '').toLowerCase().trim() === email) {
      sh.getRange(i+1, UC_.ruolo+1).setValue(ruolo);
      _syncRoleToProps_(email, ruolo);
      return { ok:true };
    }
  }
  return { ok:false, error:'Utente non trovato' };
}

/**
 * Aggiorna un campo opt-in (Digest, Bandi, Matrix).
 */
function updateUserOptIn(email, key, newVal) {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  email = String(email || '').toLowerCase().trim();
  var colMap = { Digest: UC_.digest, Bandi: UC_.bandi, Matrix: UC_.matrix };
  if (!(key in colMap)) return { ok:false, error:'Campo non valido: ' + key };
  var sh = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][UC_.email] || '').toLowerCase().trim() === email) {
      sh.getRange(i+1, colMap[key]+1).setValue(newVal === true || newVal === 'true');
      return { ok:true };
    }
  }
  return { ok:false, error:'Utente non trovato' };
}

/**
 * Helper pubblico per Codice.js gate auth.
 */
function getUtenteByEmail_(email) {
  email = String(email || '').toLowerCase().trim();
  var sh = _getUtentiSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][UC_.email] || '').toLowerCase().trim() === email) {
      return _rowToUser_(vals[i]);
    }
  }
  return null;
}

// --- helpers ScriptProperties ------------------------------------------------

function _syncRoleToProps_(email, ruolo) {
  var admCsv  = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || OC_ADMIN_DEFAULT_;
  var editCsv = PropertiesService.getScriptProperties().getProperty('OC_EDITOR_EMAILS') || '';

  var admSet  = _csvToSet_(admCsv);
  var editSet = _csvToSet_(editCsv);

  // rimuovi da entrambi, poi aggiungi al set corretto
  delete admSet[email];
  delete editSet[email];

  if (ruolo === 'admin')  admSet[email]  = true;
  if (ruolo === 'editor') editSet[email] = true;

  PropertiesService.getScriptProperties().setProperty('OC_ADMIN_EMAILS',  Object.keys(admSet).join(','));
  PropertiesService.getScriptProperties().setProperty('OC_EDITOR_EMAILS', Object.keys(editSet).join(','));
}

function _removeRoleFromProps_(email) {
  var admCsv  = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || OC_ADMIN_DEFAULT_;
  var editCsv = PropertiesService.getScriptProperties().getProperty('OC_EDITOR_EMAILS') || '';
  var admSet  = _csvToSet_(admCsv);
  var editSet = _csvToSet_(editCsv);
  delete admSet[email];
  delete editSet[email];
  PropertiesService.getScriptProperties().setProperty('OC_ADMIN_EMAILS',  Object.keys(admSet).join(','));
  PropertiesService.getScriptProperties().setProperty('OC_EDITOR_EMAILS', Object.keys(editSet).join(','));
}