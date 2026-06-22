/**
 * ============================================================================
 *  Auth.gs — Autenticazione Google + Gestione Utenti unificata
 * ============================================================================
 *  Sprint 1.4 (2026-05-01)
 *  Autore: Silvano Straccini / Sinopia
 *
 *  SCOPO
 *  -----
 *  Schermata login Google obbligatorio per accedere alla webapp OC + tabella
 *  unica "Utenti" che consolida i tre database utenti precedenti
 *  (MailingList, ContactsMatrix, lista admin hardcoded).
 *
 *  ARCHITETTURA
 *  ------------
 *  1. doGet() chiama _gateAuth_() PRIMA di servire Index.html
 *  2. Se utente non loggato o non autorizzato -> mostra pagina blocco
 *     (template HTML semplice "Accedi" + form "Richiedi accesso")
 *  3. Se autorizzato -> serve webapp normale, getCurrentUserAuth() fornisce
 *     ruolo + opt-in al frontend per UI condizionale (admin vede tutto, lettore
 *     vede solo viste pubbliche, ecc.)
 *  4. Pannello admin Impostazioni -> 4o tab Utenti per CRUD + approve/reject
 *
 *  RUOLI
 *  -----
 *  - admin    : pieno accesso (Silvano + collaboratori interni)
 *  - editor   : crea/modifica contenuti, no admin/Impostazioni
 *  - lettore  : webapp completa in read-only
 *  - ospite   : solo landing/Matrix pubblici, niente di piu (default per nuove richieste)
 *
 *  STATI
 *  -----
 *  - pending  : ha richiesto accesso, in attesa di approvazione
 *  - attivo   : approvato e operativo
 *  - sospeso  : disattivato temporaneamente
 *  - rifiutato: richiesta rifiutata, non puo riprovare
 *
 *  SCHEMA FOGLIO Utenti
 *  --------------------
 *  ID | Email | Nome | Ruolo | Stato | OptInDigest | OptInBandi |
 *  OptInMatrix | DataIscrizione | DataApprovazione | AggiuntoDa | Note
 *
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

var OC_UTENTI_SHEET = 'Utenti';
var OC_UTENTI_HEADERS = [
  'ID','Email','Nome','Ruolo','Stato',
  'OptInDigest','OptInBandi','OptInMatrix',
  'DataIscrizione','DataApprovazione','AggiuntoDa','Note'
];
var OC_UTENTI_RUOLI = ['admin','editor','lettore','ospite'];
var OC_UTENTI_STATI = ['pending','attivo','sospeso','rifiutato'];

// Email admin "fondatori" sempre attivi (fallback se Utenti vuoto)
var OC_ADMIN_EMAILS = ['s.straccini@gmail.com'];

// v4.21 — Super admin: unico utente che puo modificare/eliminare altri admin
var OC_SUPER_ADMIN_EMAIL = 's.straccini@gmail.com';

// ============================================================================
// FOGLIO Utenti — creazione e accesso
// ============================================================================

function _getOrCreateUtentiSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
  if (!ss) throw new Error('spreadsheet null in _getOrCreateUtentiSheet_');
  var sh = ss.getSheetByName(OC_UTENTI_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_UTENTI_SHEET);
    sh.getRange(1, 1, 1, OC_UTENTI_HEADERS.length).setValues([OC_UTENTI_HEADERS])
      .setFontWeight('bold').setBackground('#0E7490').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  // Sempre: assicura che ogni email admin fondatore esista nel foglio
  _ensureAdminSeeds_(sh);
  return sh;
}

function _ensureAdminSeeds_(sh) {
  try {
    var lastRow = sh.getLastRow();
    // Cerca colonna Email (robusta anche con schema vecchio o nuovo)
    var headers = (lastRow >= 1) ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    var iEmail = headers.indexOf('Email');
    if (iEmail < 0) iEmail = 0; // fallback posizione 0

    var existingEmails = {};
    if (lastRow >= 2) {
      var emailCol = sh.getRange(2, iEmail + 1, lastRow - 1, 1).getValues();
      emailCol.forEach(function(r) {
        var em = String(r[0] || '').toLowerCase().trim();
        if (em) existingEmails[em] = true;
      });
    }

    // Aggiungi admin fondatori mancanti usando lo schema attuale del foglio
    OC_ADMIN_EMAILS.forEach(function(em) {
      em = String(em).toLowerCase().trim();
      if (existingEmails[em]) return;
      // Costruisci riga compatibile con qualsiasi schema
      var row = [];
      var nowIso = new Date().toISOString();
      if (headers.length === 0 || headers[0] === 'ID') {
        // Schema nuovo (12 col): ID Email Nome Ruolo Stato OptIn...
        row = [
          'U' + Date.now() + Math.floor(Math.random()*1000),
          em, 'Silvano Straccini', 'admin', 'attivo',
          true, true, true, nowIso, nowIso, 'system_seed', 'Admin fondatore'
        ];
      } else {
        // Schema vecchio (9 col): Email Nome Ruolo Stato Digest Bandi Matrix DataIscr Motivo
        row = [em, 'Silvano Straccini', 'admin', 'attivo', true, true, true, nowIso, 'Admin fondatore'];
      }
      sh.appendRow(row);
    });
  } catch(e) {
    Logger.log('_ensureAdminSeeds_ err: ' + e.message);
  }
}

// ============================================================================
// API PUBBLICA — chiamata da frontend e backend
// ============================================================================

/**
 * Ritorna info auth dell'utente correntemente loggato.
 * @return {Object} {
 *   email: 's.straccini@gmail.com',
 *   nome: 'Silvano',
 *   ruolo: 'admin',
 *   stato: 'attivo',
 *   autorizzato: true,
 *   optIn: { digest: true, bandi: true, matrix: true },
 *   isAdmin: true,
 *   isEditor: false,
 *   isLettore: false,
 *   isOspite: false
 * }
 */
/**
 * Helper: cerca un utente nel foglio Utenti per email.
 * Ritorna l'oggetto auth completo (stesso shape di getCurrentUserAuth) o null.
 */
function getUtenteByEmail_(emailIn) {
  var email = String(emailIn || '').toLowerCase().trim();
  if (!email) return null;
  try {
    var sh = _getOrCreateUtentiSheet_();
    var rows = sh.getDataRange().getValues();
    var headers = rows[0];
    var iEmail = headers.indexOf('Email');
    var iNome  = headers.indexOf('Nome');
    var iRuolo = headers.indexOf('Ruolo');
    var iStato = headers.indexOf('Stato');
    var iOd    = headers.indexOf('OptInDigest');
    var iOb    = headers.indexOf('OptInBandi');
    var iOm    = headers.indexOf('OptInMatrix');
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][iEmail] || '').toLowerCase().trim() === email) {
        var ruolo = String(rows[i][iRuolo] || 'ospite');
        var stato = String(rows[i][iStato] || 'pending');
        return {
          email: email,
          nome: String(rows[i][iNome] || ''),
          ruolo: ruolo,
          stato: stato,
          autorizzato: (stato === 'attivo' && ruolo !== 'ospite'),
          optIn: {
            digest: rows[i][iOd] === true || rows[i][iOd] === 'TRUE',
            bandi:  rows[i][iOb] === true || rows[i][iOb] === 'TRUE',
            matrix: rows[i][iOm] === true || rows[i][iOm] === 'TRUE'
          },
          isAdmin: ruolo === 'admin',
          isEditor: ruolo === 'editor' || ruolo === 'admin',
          isLettore: ruolo === 'lettore',
          isOspite: ruolo === 'ospite'
        };
      }
    }
  } catch(e) { Logger.log('getUtenteByEmail_ err: ' + e.message); }
  return null;
}


function getCurrentUserAuth(token) {
  // v4.18.5 (2026-05-11) — Riunificato con CurrentUser_v44.
  // Identita' presa da una sola fonte (Session + fallback token admin URL).
  // Stato/optIn arricchito dal foglio Utenti se l'utente e' identificato.
  // Nessuna modalita' "apri tutto a Silvano" indipendente dalla sessione.

  var base = (typeof getCurrentUser_v44 === 'function')
    ? getCurrentUser_v44(token)
    : { email:'', nome:'Ospite', ruolo:'guest', isAdmin:false, isEditor:false, authMethod:'fallback' };

  // 1) Admin (via Session admin email o via token URL): bypass lookup foglio
  if (base.isAdmin) {
    return {
      email:       base.email,
      nome:        base.nome,
      ruolo:       'admin',
      stato:       'attivo',
      autorizzato: true,
      optIn:       { digest:true, bandi:true, matrix:true },
      isAdmin:     true,
      isEditor:    true,
      isLettore:   false,
      isOspite:    false,
      authMethod:  base.authMethod || 'session_admin'
    };
  }

  // 2) Utente identificato via Session: cerca nel foglio Utenti per stato/optIn
  if (base.email && typeof getUtenteByEmail_ === 'function') {
    try {
      var u = getUtenteByEmail_(base.email);
      if (u && u.stato === 'attivo') {
        return {
          email:       u.email,
          nome:        u.nome || base.nome,
          ruolo:       u.ruolo || 'lettore',
          stato:       'attivo',
          autorizzato: true,
          optIn:       u.optIn || { digest:false, bandi:false, matrix:false },
          isAdmin:     u.ruolo === 'admin',
          isEditor:    u.ruolo === 'admin' || u.ruolo === 'editor',
          isLettore:   u.ruolo === 'lettore',
          isOspite:    false,
          authMethod:  'session_utenti'
        };
      }
      if (u) return _authNullResult_('stato_' + (u.stato || 'sconosciuto'));
    } catch(e) {
      Logger.log('getCurrentUserAuth lookup Utenti err: ' + e.message);
    }
  }

  // 3) Nessuna identita': ospite
  return _authNullResult_('ospite');
}

function _authNullResult_(reason) {
  return {
    email: '', nome: '', ruolo: 'ospite', stato: reason,
    autorizzato: false,
    optIn: { digest: false, bandi: false, matrix: false },
    isAdmin: false, isEditor: false, isLettore: false, isOspite: true
  };
}

/**
 * Gate per funzioni backend: throw se l'utente corrente non ha il ruolo richiesto.
 * Uso: requireAuth(['admin']) -> solo admin possono procedere.
 */
function requireAuth(rolesAllowed) {
  var auth = getCurrentUserAuth();
  if (!auth.autorizzato) throw new Error('Accesso negato: utente non autorizzato (' + auth.stato + ')');
  if (rolesAllowed && rolesAllowed.length) {
    if (rolesAllowed.indexOf(auth.ruolo) < 0) {
      throw new Error('Accesso negato: ruolo "' + auth.ruolo + '" non sufficiente. Richiesto: ' + rolesAllowed.join('|'));
    }
  }
  return auth;
}

// ============================================================================
// AUTO-REGISTRAZIONE — ospite → lettore (self-service, v5.1.2)
// Chiamata da saveMailing (newsletter) e saveMatrixContact (Matrix)
// ============================================================================

/**
 * v5.1.10 — Registra un nuovo utente come lettore attivo.
 * Gestisce tutti i casi:
 *   - email già registrata e attiva → errore 'gia_registrato'
 *   - email sospesa/rifiutata → riattiva come lettore
 *   - email non presente → crea come lettore/attivo
 *
 * @param {string} email
 * @param {string} [nome]
 * @param {string} [source] - 'registrazione'|'newsletter'|'matrix'|'prenotazione'
 * @returns {{ ok, action:'created'|'reactivated', error?, stato? }}
 */
/** Wrapper pubblico per il frontend (google.script.run non vede funzioni con _) */
function registraUtente(email, nome, source) {
  return _autoRegisterUser_(email, nome, source);
}

function _autoRegisterUser_(email, nome, source) {
  email = String(email || '').toLowerCase().trim();
  if (!email || email.indexOf('@') < 0) return { ok: false, error: 'email non valida' };

  try {
    var sh = _getOrCreateUtentiSheet_();
    var rows = sh.getDataRange().getValues();
    var headers = rows[0];
    var iEmail = headers.indexOf('Email');
    var iNome  = headers.indexOf('Nome');
    var iRuolo = headers.indexOf('Ruolo');
    var iStato = headers.indexOf('Stato');

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][iEmail] || '').toLowerCase().trim() === email) {
        var stato = String(rows[i][iStato] || '').toLowerCase();
        var ruolo = String(rows[i][iRuolo] || '');

        // Gia attivo: segnala che deve usare Accedi
        if (stato === 'attivo') {
          return { ok: false, error: 'gia_registrato', ruolo: ruolo };
        }
        // v4.22 SEC — Rifiutati e sospesi NON possono auto-riregistrarsi
        if (stato === 'rifiutato') {
          return { ok: false, error: 'accesso_rifiutato' };
        }
        if (stato === 'sospeso') {
          return { ok: false, error: 'account_sospeso' };
        }

        // Solo pending: riattiva come lettore
        sh.getRange(i + 1, iStato + 1).setValue('attivo');
        if (ruolo === 'ospite' || !ruolo) sh.getRange(i + 1, iRuolo + 1).setValue('lettore');
        if (nome && !rows[i][iNome]) sh.getRange(i + 1, iNome + 1).setValue(nome);
        Logger.log('[AUTH] Riattivato: ' + email + ' (era ' + stato + ')');
        try { if (typeof _logConsenso_ === 'function') _logConsenso_(email, (source || 'registrazione') + '-reactivate'); } catch(_){} // v4.23 consenso
        return { ok: true, action: 'reactivated' };
      }
    }

    // Nuovo utente: lettore attivo
    var id = 'U' + Date.now() + Math.floor(Math.random() * 1000);
    var nowIso = new Date().toISOString();
    sh.appendRow([
      id, email, nome || '', 'lettore', 'attivo',
      true, true, false,
      nowIso, nowIso, source || 'auto', 'Registrazione via ' + (source || 'auto')
    ]);
    Logger.log('[AUTH] Registrato: ' + email + ' via ' + (source || 'auto'));
    try { if (typeof _logConsenso_ === 'function') _logConsenso_(email, source || 'registrazione'); } catch(_){} // v4.23 consenso
    // v4.20 — Welcome email post-registrazione
    try { if (typeof sendWelcomeEmail === 'function') sendWelcomeEmail(email, nome || ''); } catch(_){}
    return { ok: true, action: 'created' };
  } catch(e) {
    Logger.log('[AUTH] _autoRegisterUser_ err: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// RICHIESTA ACCESSO (utenti non autorizzati)
// ============================================================================

/**
 * Richiesta di accesso da utente non ancora autorizzato.
 * Aggiunge riga in Utenti con stato='pending' e notifica admin via Telegram+Email.
 *
 * @param {Object} body { email?, nome, motivo? }
 * @return { ok, message? } | { error }
 */
function requestAccess(body) {
  body = body || {};
  // Email: se utente loggato Google, prendiamo da Session
  var emailLogged = '';
  try { emailLogged = (Session.getActiveUser().getEmail() || '').toLowerCase().trim(); } catch(e) {}
  var email = (body.email || emailLogged || '').toLowerCase().trim();
  if (!email) return { error:'email obbligatoria (accedi prima con Google)' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error:'email non valida' };

  var nome = String(body.nome || '').trim();
  var motivo = String(body.motivo || '').trim();

  try {
    var sh = _getOrCreateUtentiSheet_();
    var rows = sh.getDataRange().getValues();
    var headers = rows[0];
    var iEmail = headers.indexOf('Email');
    var iStato = headers.indexOf('Stato');

    // Se gia esiste, aggiorna stato se rifiutato/sospeso, altrimenti messaggio
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][iEmail] || '').toLowerCase().trim() === email) {
        var stato = String(rows[i][iStato] || '');
        if (stato === 'attivo')   return { ok:true, alreadyActive:true, email:email, message:'Sei gia attivo. Clicca ENTRA per accedere.' };
        if (stato === 'pending')  return { ok:true, message:'Richiesta gia ricevuta, in attesa di approvazione.' };
        if (stato === 'rifiutato') return { error:'Richiesta precedente rifiutata. Contatta l amministratore.' };
        if (stato === 'sospeso')  return { error:'Account sospeso. Contatta l amministratore.' };
      }
    }

    // Se admin auto-aggiunto
    if ((typeof OC_ADMIN_EMAILS !== 'undefined') && OC_ADMIN_EMAILS.indexOf(email) >= 0) {
      var idA = 'U' + Date.now() + Math.floor(Math.random()*1000);
      var nowIsoA = new Date().toISOString();
      sh.appendRow([
        idA, email, nome || 'Admin', 'admin', 'attivo',
        true, true, true,
        nowIsoA, nowIsoA, 'admin_seed', 'admin auto-attivato'
      ]);
      return { ok:true, alreadyActive:true, email:email, message:'Admin riconosciuto. Clicca ENTRA.' };
    }

    var id = 'U' + Date.now() + Math.floor(Math.random()*1000);
    var nowIso = new Date().toISOString();
    sh.appendRow([
      id, email, nome, 'ospite', 'pending',
      false, false, false,
      nowIso, '', 'self_request', motivo
    ]);

    // Notifica admin
    _notifyAdminNewAccessRequest_(email, nome, motivo);

    return { ok:true, message:'Richiesta inviata. Riceverai una mail quando verra approvata.' };
  } catch(e) {
    Logger.log('requestAccess errore: ' + e.message);
    return { error: e.message };
  }
}

function _notifyAdminNewAccessRequest_(email, nome, motivo) {
  // Notifica Telegram
  try {
    if (typeof sendTelegram === 'function') {
      var msg = '*Nuova richiesta accesso OC*\n\n' +
                'Email: `' + email + '`\n' +
                'Nome: ' + (nome || '_(non fornito)_') + '\n' +
                'Motivo: ' + (motivo || '_(non fornito)_') + '\n\n' +
                'Apri admin > Impostazioni > Utenti per approvare.';
      sendTelegram(msg);
    }
  } catch(e) { Logger.log('Telegram notify error: ' + e.message); }
  // Notifica Email a tutti gli admin
  try {
    OC_ADMIN_EMAILS.forEach(function(adminEmail) {
      MailApp.sendEmail({
        to: adminEmail,
        subject: '[OC] Nuova richiesta accesso: ' + email,
        htmlBody: '<p>Nuova richiesta di accesso all Osservatorio Culturale.</p>' +
                  '<p><b>Email:</b> ' + email + '<br>' +
                  '<b>Nome:</b> ' + (nome || '<em>non fornito</em>') + '<br>' +
                  '<b>Motivo:</b> ' + (motivo || '<em>non fornito</em>') + '</p>' +
                  '<p>Apri admin -> Impostazioni -> Utenti per approvare.</p>',
        name: 'Osservatorio Culturale (system)'
      });
    });
  } catch(e) { Logger.log('Mail notify error: ' + e.message); }
}

// ============================================================================
// CRUD UTENTI (solo admin)
// ============================================================================

function getAllUtenti(opts) {
  opts = opts || {};
  var _dbg = { ssId:'?', fogli:'?', utentiRows:-1, readErr:'' };
  try {
    var auth = getCurrentUserAuth(opts.token || null);
    if (!auth || !auth.isAdmin) {
      return { ok:false, error:'Accesso negato. Email: ' + (auth ? auth.email || 'vuota' : 'errore'), items:[] };
    }
    opts = opts || {};

    // Diagnostica spreadsheet
    try {
      var ssDbg = (typeof getMainSS === 'function') ? getMainSS() : null;
      if (ssDbg) {
        _dbg.ssId = ssDbg.getId();
        _dbg.fogli = ssDbg.getSheets().map(function(s){ return s.getName(); }).join(', ');
        var shDbg = ssDbg.getSheetByName(OC_UTENTI_SHEET);
        _dbg.utentiRows = shDbg ? shDbg.getLastRow() : 0;
      }
    } catch(e2) { _dbg.ssId = 'ERR: ' + e2.message; }

    // Ripara righe senza ID e deuplica nel foglio
    try { _fixOrfaneRows_(); } catch(eFix) { Logger.log('_fixOrfaneRows_ err: ' + eFix.message); }

    var items = [];
    try {
      items = _readUtentiSheet_();
    } catch(eRead) {
      _dbg.readErr = eRead.message;
      Logger.log('getAllUtenti _readUtentiSheet_ errore: ' + eRead.message);
    }

    // Dedup in memoria (per sicurezza): mantieni una riga per email
    var seen = {};
    items = items.filter(function(o) {
      var em = String(o.Email || '').toLowerCase();
      if (seen[em]) return false;
      seen[em] = true;
      return true;
    });

    var infoMsg = null;
    if (items.length === 0) {
      // Fallback sintetico: mostra almeno admin e scrivi nel foglio
      try { _forceInsertAdminRow_(); } catch(e3) {}
      var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      items = [{
        Email: 's.straccini@gmail.com',
        Nome: 'Silvano Straccini',
        Ruolo: 'admin',
        Stato: 'attivo',
        OptInDigest: true,
        OptInBandi: true,
        OptInMatrix: true,
        DataIscrizione: nowStr,
        _autoSeeded: true
      }];
      infoMsg = 'DEBUG — Foglio letto via SS ' + _dbg.ssId + ' · fogli: ' + _dbg.fogli +
                ' · righe Utenti: ' + _dbg.utentiRows +
                (_dbg.readErr ? ' · ERR: ' + _dbg.readErr : '') +
                ' · Riga admin sintetica inserita — esegui "Migrazione one-shot" per caricare tutti gli utenti.';
    }

    if (opts.statoFilter) items = items.filter(function(o){ return String(o.Stato||'') === opts.statoFilter; });
    if (opts.ruoloFilter) items = items.filter(function(o){ return String(o.Ruolo||'') === opts.ruoloFilter; });
    // v5.7 — flag _hasProfilo: l'utente ha compilato "Il mio profilo professionale" (foglio ProfiliPro)
    try {
      if (typeof proEmailsConProfilo === 'function') {
        var _profMap = proEmailsConProfilo();
        items.forEach(function(u){ u._hasProfilo = !!_profMap[String(u.Email||'').toLowerCase().trim()]; });
      }
    } catch(_eProf){}
    var result = { ok:true, items:items, _dbg:_dbg };
    if (infoMsg) result.info = infoMsg;
    return result;
  } catch(e) {
    Logger.log('getAllUtenti errore: ' + e.message);
    return { ok:false, error: e.message + ' | DBG: ' + JSON.stringify(_dbg), items:[] };
  }
}

function _readUtentiSheet_() {
  var ss = null;
  try {
    ss = (typeof getMainSS === 'function') ? getMainSS() : null;
  } catch(e) {
    Logger.log('_readUtentiSheet_ getMainSS errore: ' + e.message);
    return [];
  }
  if (!ss) { Logger.log('_readUtentiSheet_: ss null'); return []; }
  var sh = ss.getSheetByName(OC_UTENTI_SHEET);
  if (!sh) {
    Logger.log('_readUtentiSheet_: foglio "' + OC_UTENTI_SHEET + '" non trovato. Fogli: ' +
      ss.getSheets().map(function(s){ return s.getName(); }).join(', '));
    return [];
  }
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  Logger.log('_readUtentiSheet_: lastRow=' + lastRow + ', lastCol=' + lastCol);
  if (lastRow < 2 || lastCol < 1) return [];
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h).trim(); });
  var rows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  Logger.log('_readUtentiSheet_: headers=' + JSON.stringify(headers));
  var items = [];
  rows.forEach(function(r) {
    var o = {};
    headers.forEach(function(h, i){ o[h] = r[i]; });
    // normalizza campo Email
    var email = '';
    if (o['Email']) email = String(o['Email']).trim();
    else if (o['email']) email = String(o['email']).trim();
    if (!email) return; // salta righe senza email
    o['Email'] = email;
    // compatibilità schema vecchio → nuovo per OptIn
    if (o['Digest']  !== undefined && o['OptInDigest'] === undefined) o['OptInDigest'] = o['Digest'];
    if (o['Bandi']   !== undefined && o['OptInBandi']  === undefined) o['OptInBandi']  = o['Bandi'];
    if (o['Matrix']  !== undefined && o['OptInMatrix'] === undefined) o['OptInMatrix'] = o['Matrix'];
    // fallback Ruolo e Stato
    if (!o['Ruolo']) o['Ruolo'] = 'lettore';
    if (!o['Stato']) o['Stato'] = 'attivo';
    items.push(o);
  });
  Logger.log('_readUtentiSheet_: items=' + items.length);
  return items;
}

function _forceInsertAdminRow_() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    if (!ss) return;
    var sh = ss.getSheetByName(OC_UTENTI_SHEET);
    if (!sh) {
      sh = ss.insertSheet(OC_UTENTI_SHEET);
      sh.getRange(1, 1, 1, OC_UTENTI_HEADERS.length).setValues([OC_UTENTI_HEADERS])
        .setFontWeight('bold').setBackground('#0E7490').setFontColor('#fff');
      sh.setFrozenRows(1);
    }
    var nowIso = new Date().toISOString();
    var lastRow = sh.getLastRow();
    // Controlla se header row esiste
    if (lastRow === 0) {
      sh.getRange(1, 1, 1, OC_UTENTI_HEADERS.length).setValues([OC_UTENTI_HEADERS]);
      sh.setFrozenRows(1);
      lastRow = 1;
    }
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var iEmail = headers.indexOf('Email');
    if (iEmail < 0) iEmail = 0;
    // Controlla se admin già presente
    if (lastRow >= 2) {
      var emailData = sh.getRange(2, iEmail + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < emailData.length; i++) {
        if (String(emailData[i][0]||'').toLowerCase().trim() === 's.straccini@gmail.com') return;
      }
    }
    // Inserisci admin row compatibile con qualsiasi schema
    var row;
    if (headers[0] === 'ID') {
      row = ['U' + Date.now(), 's.straccini@gmail.com', 'Silvano Straccini', 'admin', 'attivo', true, true, true, nowIso, nowIso, 'system_seed', 'Admin fondatore'];
    } else {
      row = ['s.straccini@gmail.com', 'Silvano Straccini', 'admin', 'attivo', true, true, true, nowIso, 'Admin fondatore'];
    }
    sh.appendRow(row);
    Logger.log('_forceInsertAdminRow_: inserito admin s.straccini@gmail.com');
  } catch(e) {
    Logger.log('_forceInsertAdminRow_ errore: ' + e.message);
  }
}

/**
 * Corregge righe orfane (senza ID) e rimuove duplicati per email.
 * Priorità mantenuta: stato 'attivo' > altri; con ID > senza ID; data più recente.
 * Chiamata automaticamente da getAllUtenti ad ogni caricamento del pannello.
 */
function _fixOrfaneRows_() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : null;
    if (!ss) return;
    var sh = ss.getSheetByName(OC_UTENTI_SHEET);
    if (!sh || sh.getLastRow() < 2) return;

    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h){ return String(h).trim(); });
    var iId    = headers.indexOf('ID');
    var iEmail = headers.indexOf('Email');
    var iStato = headers.indexOf('Stato');
    var iData  = headers.indexOf('DataIscrizione');
    if (iEmail < 0) return;

    var lastRow = sh.getLastRow();
    var allRows = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

    // 1. Aggiungi ID mancanti
    var needFlush = false;
    if (iId >= 0) {
      allRows.forEach(function(r, idx) {
        var idVal = String(r[iId] || '').trim();
        var emVal = String(r[iEmail] || '').trim();
        if (!idVal && emVal) {
          sh.getRange(idx + 2, iId + 1).setValue('U' + Date.now() + Math.floor(Math.random()*10000) + idx);
          needFlush = true;
        }
      });
      if (needFlush) SpreadsheetApp.flush();
    }

    // 2. Dedup per email: trova indici da cancellare
    if (lastRow < 3) return; // non serve dedup con 1 sola riga dati
    allRows = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues(); // rileggi dopo flush
    var byEmail = {};
    var toDelete = [];
    allRows.forEach(function(r, idx) {
      var em = String(r[iEmail] || '').toLowerCase().trim();
      if (!em) { toDelete.push(idx + 2); return; } // riga senza email: elimina
      var hasId  = iId >= 0 && String(r[iId] || '').trim() !== '';
      var stato  = iStato >= 0 ? String(r[iStato] || '') : '';
      var data   = iData  >= 0 ? String(r[iData]  || '') : '';
      var rowNum = idx + 2;

      if (!byEmail[em]) {
        byEmail[em] = { rowNum: rowNum, hasId: hasId, stato: stato, data: data };
      } else {
        var prev = byEmail[em];
        var keepNew = false;
        if (stato === 'attivo' && prev.stato !== 'attivo') keepNew = true;
        else if (prev.stato === 'attivo' && stato !== 'attivo') keepNew = false;
        else if (hasId && !prev.hasId) keepNew = true;
        else if (!hasId && prev.hasId) keepNew = false;
        else keepNew = (data > prev.data);

        if (keepNew) { toDelete.push(prev.rowNum); byEmail[em] = { rowNum: rowNum, hasId: hasId, stato: stato, data: data }; }
        else          { toDelete.push(rowNum); }
      }
    });

    // Cancella dall'ultima riga in su
    toDelete.sort(function(a,b){ return b - a; });
    toDelete.forEach(function(r){ sh.deleteRow(r); });
    if (toDelete.length > 0) Logger.log('_fixOrfaneRows_: rimossi ' + toDelete.length + ' righe duplicate/orfane');

  } catch(e) {
    Logger.log('_fixOrfaneRows_ errore: ' + e.message);
  }
}

function approveUser(email, ruolo) {
  requireAuth(['admin']);
  if (!email) return { error:'email mancante' };
  if (OC_UTENTI_RUOLI.indexOf(ruolo) < 0) ruolo = 'lettore';
  var sh = _getOrCreateUtentiSheet_();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iEmail = headers.indexOf('Email');
  var iRuolo = headers.indexOf('Ruolo');
  var iStato = headers.indexOf('Stato');
  var iAppr  = headers.indexOf('DataApprovazione');
  var iOd    = headers.indexOf('OptInDigest');
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iEmail] || '').toLowerCase().trim() === email.toLowerCase().trim()) {
      sh.getRange(i+1, iRuolo+1).setValue(ruolo);
      sh.getRange(i+1, iStato+1).setValue('attivo');
      sh.getRange(i+1, iAppr+1).setValue(new Date().toISOString());
      sh.getRange(i+1, iOd+1).setValue(true); // default opt-in digest acceso
      // Email di benvenuto
      _sendWelcomeEmail_(email, ruolo);
      return { ok:true, email: email, ruolo: ruolo };
    }
  }
  return { error:'utente non trovato' };
}

/**
 * v4.21.2 — Invito utente: crea come PENDING + invia magic link di invito.
 * L'utente diventa attivo solo quando clicca il link nell'email.
 * Supporta invito singolo o batch (body.batch = [{email, nome, ruolo}, ...]).
 */
function invitaNuovoUtente(body) {
  body = body || {};
  var auth = getCurrentUserAuth(body.token || null);
  if (!auth || !auth.isAdmin) return { error: 'Accesso negato (non admin). Email: ' + (auth ? auth.email || 'vuota' : 'errore') };

  // Batch mode: invita più utenti
  if (body.batch && Array.isArray(body.batch)) {
    var results = [];
    body.batch.forEach(function(item) {
      var r = _invitaSingoloUtente_(item.email, item.nome, item.ruolo, auth);
      results.push(r);
    });
    var okCount = results.filter(function(r){ return r.ok; }).length;
    var errCount = results.filter(function(r){ return !r.ok; }).length;
    return { ok: true, batch: true, results: results, invited: okCount, errors: errCount };
  }

  // Singolo invito
  return _invitaSingoloUtente_(body.email, body.nome, body.ruolo, auth);
}

function _invitaSingoloUtente_(emailIn, nome, ruolo, auth) {
  var email = String(emailIn||'').toLowerCase().trim();
  if (!email) return { ok:false, error:'email obbligatoria', email: emailIn };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok:false, error:'email non valida', email: email };
  nome = String(nome||'').trim();
  if (OC_UTENTI_RUOLI.indexOf(ruolo) < 0) ruolo = 'lettore';
  // v4.22 SEC — Solo il super_admin puo invitare con ruolo admin
  if (ruolo === 'admin' && String(auth.email || '').toLowerCase().trim() !== OC_SUPER_ADMIN_EMAIL.toLowerCase().trim()) {
    return { ok:false, error:'Solo il super-admin puo invitare un nuovo amministratore.', email: email };
  }

  var sh = _getOrCreateUtentiSheet_();
  var rows = sh.getDataRange().getValues();
  var headers = rows[0];
  var iEmail = headers.indexOf('Email');
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iEmail]||'').toLowerCase().trim() === email) {
      return { ok:false, error:'utente gia presente', email: email };
    }
  }

  // Crea utente PENDING (si attiva al click del magic link)
  var id = 'U' + Date.now() + Math.floor(Math.random()*1000);
  var nowIso = new Date().toISOString();
  sh.appendRow([
    id, email, nome, ruolo, 'pending',
    true, true, false,
    nowIso, '',
    'invito_admin:' + (auth.email||'system'),
    'Invitato il ' + nowIso.substring(0,10) + ' — in attesa conferma'
  ]);

  // Crea sessione con magic link e invia email di invito brandizzata
  try {
    var sessResult = (typeof createSessione === 'function') ? createSessione(email, 'invito') : null;
    if (sessResult && sessResult.ok) {
      // Invia email di invito personalizzata (non la generica magic link)
      _sendInviteEmail_(email, nome, ruolo, sessResult.magicLink || _buildMagicLink_(sessResult.token));
    }
  } catch(e) {
    Logger.log('[invitaNuovoUtente] Errore invio email: ' + e.message);
  }

  return { ok:true, email: email, ruolo: ruolo, stato: 'pending' };
}

/**
 * v4.21.2 — Email di invito brandizzata Sinopia.
 * Firma: "Il team di assistenza di Sinopia"
 */
function _sendInviteEmail_(email, nome, ruolo, magicUrl) {
  try {
    var ruoloLabel = {
      'admin':   'Amministratore — accesso completo a tutti i contenuti e al pannello di gestione',
      'editor':  'Redattore — puoi creare e modificare contenuti, gestire bandi e news',
      'lettore': 'Lettore — accesso completo a bandi, news, podcast, video, libri e report',
      'ospite':  'Ospite — esplora i contenuti pubblici e scopri le funzionalita'
    };
    var greeting = nome ? ('Ciao ' + nome.split(' ')[0] + ',') : 'Ciao,';
    var ruoloDesc = ruoloLabel[ruolo] || ruoloLabel['lettore'];

    var body = ''
      + '<!doctype html><html><head><meta charset="utf-8"><title>Sinopia</title></head>'
      + '<body style="margin:0;padding:0;background:#F1E6D6;font-family:Georgia,serif;color:#3A2818">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1E6D6;padding:32px 0">'
      + '<tr><td align="center">'
      + '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #D4BFA0;border-radius:12px;overflow:hidden">'
      // Hero
      + '<tr><td style="background:#F1E6D6;border-bottom:1px solid #D4BFA0;padding:28px 32px">'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:32px;font-weight:500;color:#8B3A1F;letter-spacing:.01em">Sinopia</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#5C4332;margin-top:4px">Osservatorio Culturale</div>'
      + '</td></tr>'
      // Body
      + '<tr><td style="padding:32px">'
      + '<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;line-height:1.3;color:#3A2818;margin:0 0 18px">Sei stato invitato a entrare in Sinopia</h1>'
      + '<p style="font-size:15px;line-height:1.6;color:#5C4332;margin:0 0 14px">' + greeting + '</p>'
      + '<p style="font-size:15px;line-height:1.6;color:#5C4332;margin:0 0 14px">'
      + 'Ti invitiamo a scoprire <b>Sinopia</b>, l\'Osservatorio Culturale dedicato ai professionisti dei musei e dei luoghi della cultura in Italia.</p>'
      + '<p style="font-size:15px;line-height:1.6;color:#5C4332;margin:0 0 14px">'
      + 'Sinopia ti offre <b>gratuitamente</b> e <b>senza vincoli temporali</b>:</p>'
      + '<ul style="font-size:14px;color:#5C4332;line-height:1.7;margin:0 0 14px;padding-left:20px">'
      + '<li>Monitoraggio continuo di <b>bandi e finanziamenti</b> per la cultura (PNRR, fondi europei, regionali)</li>'
      + '<li><b>News, podcast, video e pubblicazioni</b> selezionate dal mondo museale e culturale</li>'
      + '<li><b>Digest settimanale personalizzato</b> sui temi di tuo interesse</li>'
      + '<li><b>MuseMu Matrix</b> — autovalutazione gratuita della maturita della tua struttura culturale</li>'
      + '<li><b>Report e benchmark</b> per confrontarti con il settore</li>'
      + '</ul>'
      + '<p style="font-size:14px;line-height:1.6;color:#5C4332;margin:0 0 6px">'
      + 'Il tuo profilo di accesso: <b style="color:#8B3A1F">' + ruoloDesc + '</b></p>'
      + '<p style="font-size:14px;line-height:1.6;color:#5C4332;margin:0 0 24px">'
      + 'Clicca il pulsante qui sotto per confermare la tua iscrizione, accedere a Sinopia e completare il tuo profilo professionale.</p>'
      // CTA
      + '<table cellpadding="0" cellspacing="0" style="margin:0 auto 26px"><tr><td style="background:#8B3A1F;border-radius:8px">'
      + '<a href="' + magicUrl + '" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:600;letter-spacing:.02em">Conferma e accedi a Sinopia &rarr;</a>'
      + '</td></tr></table>'
      // Privacy
      + '<div style="border-top:1px solid #E5E1D8;padding-top:14px;margin-top:8px">'
      + '<p style="font-size:12px;color:#8B5E2B;line-height:1.5;margin:0">'
      + 'L\'iscrizione e <b>completamente gratuita</b>, senza vincoli temporali. '
      + 'I tuoi dati sono trattati ai sensi del GDPR (Reg. UE 2016/679) esclusivamente per finalita informative. '
      + 'Puoi richiedere la cancellazione del tuo account e dei tuoi dati in qualsiasi momento scrivendo a info@sinopiaconsulting.it.</p>'
      + '</div>'
      // Link fallback
      + '<p style="font-size:11px;color:#8B5E2B;line-height:1.5;margin:20px 0 0;font-style:italic">Se il bottone non funziona, copia e incolla questo link nel browser:<br><span style="color:#5C4332;font-family:monospace;font-size:10px;word-break:break-all">' + magicUrl + '</span></p>'
      + '</td></tr>'
      // Footer
      + '<tr><td style="background:#F1E6D6;padding:18px 32px;border-top:1px solid #D4BFA0;text-align:center">'
      + '<div style="font-family:Arial,sans-serif;font-size:12px;color:#5C4332;line-height:1.5;font-weight:600">Il team di assistenza di Sinopia</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;color:#8B5E2B;line-height:1.5;margin-top:4px">Sinopia &middot; Osservatorio Culturale<br>Il disegno preparatorio della cultura italiana<br>Un progetto Sinopia</div>'
      + '</td></tr>'
      + '</table>'
      + '</td></tr></table>'
      + '</body></html>';

    MailApp.sendEmail({
      to: email,
      subject: 'Sei stato invitato a Sinopia — Osservatorio Culturale',
      htmlBody: body,
      name: 'Sinopia — Osservatorio Culturale'
    });
    Logger.log('[invitaNuovoUtente] Email invito inviata a ' + email);
  } catch(e) {
    Logger.log('[invitaNuovoUtente] Errore invio email: ' + e.message);
  }
}

function rejectUser(email, motivo) {
  requireAuth(['admin']);
  return _setUserStato_(email, 'rifiutato', motivo);
}

function suspendUser(email) {
  requireAuth(['admin']);
  return _setUserStato_(email, 'sospeso');
}

function deleteUser(email, token) {
  // Auth via token di sessione (vedi nota in saveUserStatoRuolo).
  var auth = getCurrentUserAuth(token || null);
  if (!auth || !auth.isAdmin) return { error: 'Accesso negato (non admin)' };
  if (!email) return { error:'email mancante' };
  email = String(email).toLowerCase().trim();

  // v4.21 — Protezione admin: solo il super_admin puo cancellare un altro admin
  var isSuperAdmin = (String(auth.email || '').toLowerCase().trim() === OC_SUPER_ADMIN_EMAIL);
  var sh = _getOrCreateUtentiSheet_();
  var rows = sh.getDataRange().getValues();
  var headers = rows[0];
  var iEmail = headers.indexOf('Email');
  var iRuolo = headers.indexOf('Ruolo');
  for (var i = rows.length-1; i >= 1; i--) {
    if (String(rows[i][iEmail] || '').toLowerCase().trim() === email) {
      var targetRuolo = String(rows[i][iRuolo] || '').toLowerCase();
      if (targetRuolo === 'admin' && !isSuperAdmin) {
        return { error: 'Solo il super-admin (' + OC_SUPER_ADMIN_EMAIL + ') puo eliminare un amministratore.' };
      }
      // Il super admin non puo eliminare se stesso
      if (email === OC_SUPER_ADMIN_EMAIL) {
        return { error: 'L\'account super-admin non puo essere eliminato.' };
      }
      sh.deleteRow(i+1);
      return { ok:true };
    }
  }
  return { error:'utente non trovato' };
}

function updateUserRuolo(email, ruolo) {
  requireAuth(['admin']);
  if (OC_UTENTI_RUOLI.indexOf(ruolo) < 0) return { error:'ruolo invalido' };
  return _updateUserField_(email, 'Ruolo', ruolo);
}

/**
 * v4.20 — Salvataggio combinato Stato + Ruolo dal pannello admin (un click).
 * Scelta confermata: NESSUNA email e nessun cambio opt-in (salvataggio silenzioso/prevedibile).
 * Registra DataApprovazione solo alla prima attivazione (audit, nessun effetto collaterale).
 */
function saveUserStatoRuolo(email, stato, ruolo, oldStato, token) {
  // Auth via token di sessione (la web app e' ad accesso "Chiunque": la sessione
  // Google e' vuota, quindi NON usare requireAuth che fallirebbe). Stesso schema di getAllUtenti.
  var auth = getCurrentUserAuth(token || null);
  if (!auth || !auth.isAdmin) {
    return { error: 'Accesso negato (non admin). Email rilevata: ' + (auth ? (auth.email || 'vuota') : 'errore') };
  }
  email = String(email || '').toLowerCase().trim();
  if (!email) return { error:'email mancante' };
  var STATI = ['pending','attivo','sospeso','rifiutato'];
  if (STATI.indexOf(stato) < 0) return { error:'stato invalido: ' + stato };
  if (OC_UTENTI_RUOLI.indexOf(ruolo) < 0) return { error:'ruolo invalido: ' + ruolo };
  var sh = _getOrCreateUtentiSheet_();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iEmail = headers.indexOf('Email');
  var iStato = headers.indexOf('Stato');
  var iRuolo = headers.indexOf('Ruolo');
  var iAppr  = headers.indexOf('DataApprovazione');
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iEmail] || '').toLowerCase().trim() === email) {
      // v4.22 SEC — Protezione admin: solo il super_admin puo modificare admin O assegnare ruolo admin
      var currentTargetRuolo = String(rows[i][iRuolo] || '').toLowerCase();
      var isSuperAdmin = (String(auth.email || '').toLowerCase().trim() === OC_SUPER_ADMIN_EMAIL.toLowerCase().trim());
      if ((currentTargetRuolo === 'admin' || ruolo === 'admin') && !isSuperAdmin) {
        return { error: 'Solo il super-admin puo assegnare o modificare un ruolo amministratore.' };
      }
      if (iStato >= 0) sh.getRange(i+1, iStato+1).setValue(stato);
      if (iRuolo >= 0) sh.getRange(i+1, iRuolo+1).setValue(ruolo);
      var primaAttivazione = (stato === 'attivo' && String(oldStato || rows[i][iStato] || '').toLowerCase() !== 'attivo');
      if (primaAttivazione && iAppr >= 0 && !rows[i][iAppr]) {
        sh.getRange(i+1, iAppr+1).setValue(new Date().toISOString());
      }
      return { ok:true, email: email, stato: stato, ruolo: ruolo };
    }
  }
  return { error:'utente non trovato' };
}

function updateUserOptIn(email, key, value) {
  // Anche utente non-admin puo cambiare i propri opt-in
  var auth = getCurrentUserAuth();
  if (!auth.autorizzato) throw new Error('non autorizzato');
  if (!auth.isAdmin && auth.email !== String(email||'').toLowerCase().trim()) {
    throw new Error('puoi modificare solo i tuoi opt-in');
  }
  var fieldMap = { digest: 'OptInDigest', bandi: 'OptInBandi', matrix: 'OptInMatrix' };
  var field = fieldMap[String(key||'').toLowerCase()];
  if (!field) return { error:'key opt-in invalida (digest|bandi|matrix)' };
  return _updateUserField_(email, field, !!value);
}

function _setUserStato_(email, stato, note) {
  if (!email) return { error:'email mancante' };
  var sh = _getOrCreateUtentiSheet_();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iEmail = headers.indexOf('Email');
  var iStato = headers.indexOf('Stato');
  var iNote  = headers.indexOf('Note');
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iEmail] || '').toLowerCase().trim() === email.toLowerCase().trim()) {
      sh.getRange(i+1, iStato+1).setValue(stato);
      if (note && iNote >= 0) sh.getRange(i+1, iNote+1).setValue(note);
      return { ok:true, email: email, stato: stato };
    }
  }
  return { error:'utente non trovato' };
}

function _updateUserField_(email, field, value) {
  if (!email) return { error:'email mancante' };
  var sh = _getOrCreateUtentiSheet_();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iEmail = headers.indexOf('Email');
  var iField = headers.indexOf(field);
  if (iField < 0) return { error:'campo non trovato: ' + field };
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iEmail] || '').toLowerCase().trim() === email.toLowerCase().trim()) {
      sh.getRange(i+1, iField+1).setValue(value);
      return { ok:true };
    }
  }
  return { error:'utente non trovato' };
}

function _sendWelcomeEmail_(email, ruolo) {
  try {
    var webUrl = '';
    try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) {}
    MailApp.sendEmail({
      to: email,
      subject: '[Osservatorio Culturale] Accesso approvato',
      htmlBody:
        '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;color:#333;line-height:1.6">' +
        '<div style="background:linear-gradient(135deg,#0E7490,#2E5266);color:#fff;padding:24px;border-radius:8px 8px 0 0">' +
          '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">DUEMILAMUSEI</div>' +
          '<h1 style="margin:6px 0 0;font-size:22px;font-weight:600">Accesso approvato all Osservatorio Culturale</h1>' +
        '</div>' +
        '<div style="padding:24px;background:#fff;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">' +
          '<p>Ciao,</p>' +
          '<p>la tua richiesta di accesso all <b>Osservatorio Culturale</b> e stata approvata.</p>' +
          '<p>Ruolo assegnato: <b>' + ruolo + '</b></p>' +
          (webUrl ? '<p style="text-align:center;margin:24px 0"><a href="' + webUrl + '" style="background:#0E7490;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Apri Osservatorio Culturale</a></p>' : '') +
          '<p>Da adesso puoi accedere al sistema con il tuo account Google.</p>' +
          '<p>Cordialmente,<br>Silvano Straccini · Sinopia</p>' +
        '</div>' +
        '</div>',
      name: 'Osservatorio Culturale'
    });
  } catch(e) { Logger.log('welcome email errore: ' + e.message); }
}

// ============================================================================
// API per Newsletter / Matrix: utenti per opt-in
// ============================================================================

/**
 * Ritorna le email degli utenti attivi che hanno l'opt-in richiesto.
 * @param {string} optInKey 'digest' | 'bandi' | 'matrix'
 * @return {Array<{email,nome,ruolo}>}
 */
function getUtentiPerOptIn(optInKey) {
  try {
    var sh = _getOrCreateUtentiSheet_();
    if (sh.getLastRow() < 2) return [];
    var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    var iEmail = headers.indexOf('Email');
    var iNome  = headers.indexOf('Nome');
    var iRuolo = headers.indexOf('Ruolo');
    var iStato = headers.indexOf('Stato');
    var fieldMap = { digest: 'OptInDigest', bandi: 'OptInBandi', matrix: 'OptInMatrix' };
    var iOpt = headers.indexOf(fieldMap[optInKey] || 'OptInDigest');
    var rows = sh.getRange(2, 1, sh.getLastRow()-1, headers.length).getValues();
    var out = [];
    rows.forEach(function(r) {
      if (String(r[iStato]) !== 'attivo') return;
      var optVal = r[iOpt];
      if (!(optVal === true || optVal === 'TRUE' || optVal === 1)) return;
      out.push({
        email: String(r[iEmail] || '').toLowerCase().trim(),
        nome: String(r[iNome] || ''),
        ruolo: String(r[iRuolo] || 'lettore')
      });
    });
    return out;
  } catch(e) {
    Logger.log('getUtentiPerOptIn errore: ' + e.message);
    return [];
  }
}

// ============================================================================
// MIGRAZIONE DA MailingList + ContactsMatrix -> Utenti (one-shot)
// ============================================================================

/**
 * Sprint 1.4 (2026-05-01) — Migra dati esistenti dai 3 database utenti
 * (MailingList, ContactsMatrix, OC_ADMIN_EMAILS) nel nuovo foglio Utenti.
 * Idempotente: salta utenti gia presenti.
 *
 * Esegui UNA VOLTA dall'editor GAS dopo il sync.
 * @return { ok, importati: {dalMailingList,daContactsMatrix,daAdminSeed}, totale, errori }
 */
function migraUtentiDaTutto() {
  Logger.log('=== MIGRAZIONE UTENTI: MailingList + ContactsMatrix + AdminSeed -> Utenti ===');
  var report = { dalMailingList: 0, daContactsMatrix: 0, daAdminSeed: 0, gia_presenti: 0, errori: [] };
  try {
    var sh = _getOrCreateUtentiSheet_();
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();

    // Carica email gia presenti in Utenti
    var rows = sh.getDataRange().getValues();
    var headersUt = rows[0];
    var iEmailUt = headersUt.indexOf('Email');
    var existingEmails = new Set();
    for (var i = 1; i < rows.length; i++) {
      var em = String(rows[i][iEmailUt] || '').toLowerCase().trim();
      if (em) existingEmails.add(em);
    }
    Logger.log('Email gia in Utenti: ' + existingEmails.size);

    // 1) Da MailingList (Email, Nome, Ruolo, Ambiti, Token, Attivo)
    Logger.log('--- 1. MailingList ---');
    try {
      var ml = ss.getSheetByName('MailingList');
      if (ml && ml.getLastRow() > 1) {
        var mlData = ml.getRange(2, 1, ml.getLastRow()-1, ml.getLastColumn()).getValues();
        mlData.forEach(function(r) {
          var em = String(r[0] || '').toLowerCase().trim();
          if (!em || existingEmails.has(em)) { if (em) report.gia_presenti++; return; }
          var nome = String(r[1] || '');
          var attivo = (r[5] === true || r[5] === 'TRUE' || r[5] === '');
          sh.appendRow([
            'U' + Date.now() + Math.floor(Math.random()*1000),
            em, nome,
            'lettore',
            attivo ? 'attivo' : 'sospeso',
            true, false, false,  // OptInDigest=true, altri false
            new Date().toISOString(),
            attivo ? new Date().toISOString() : '',
            'migrazione_mailinglist', 'Migrato da MailingList ' + new Date().toISOString().substring(0,10)
          ]);
          existingEmails.add(em);
          report.dalMailingList++;
        });
      }
      Logger.log('  Importati: ' + report.dalMailingList);
    } catch(e) { report.errori.push('MailingList: ' + e.message); Logger.log('  ERR: ' + e.message); }

    // 2) Da ContactsMatrix (response_id, email, preferences_json, consent_timestamp, ...)
    Logger.log('--- 2. ContactsMatrix ---');
    try {
      var cm = ss.getSheetByName('ContactsMatrix');
      if (cm && cm.getLastRow() > 1) {
        var cmData = cm.getRange(2, 1, cm.getLastRow()-1, cm.getLastColumn()).getValues();
        cmData.forEach(function(r) {
          var em = String(r[1] || '').toLowerCase().trim();
          if (!em || existingEmails.has(em)) { if (em) report.gia_presenti++; return; }
          sh.appendRow([
            'U' + Date.now() + Math.floor(Math.random()*1000),
            em, '',
            'lettore', 'attivo',
            false, false, true,  // OptInMatrix=true
            String(r[3] || new Date().toISOString()),
            new Date().toISOString(),
            'migrazione_contactsmatrix', 'Migrato da ContactsMatrix · responseId=' + String(r[0]||'')
          ]);
          existingEmails.add(em);
          report.daContactsMatrix++;
        });
      }
      Logger.log('  Importati: ' + report.daContactsMatrix);
    } catch(e) { report.errori.push('ContactsMatrix: ' + e.message); Logger.log('  ERR: ' + e.message); }

    // 3) Admin seed (gia inseriti in _getOrCreateUtentiSheet_, ma assicuriamoci)
    Logger.log('--- 3. Admin seed ---');
    OC_ADMIN_EMAILS.forEach(function(em) {
      em = String(em).toLowerCase().trim();
      if (existingEmails.has(em)) { report.gia_presenti++; return; }
      sh.appendRow([
        'U' + Date.now() + Math.floor(Math.random()*1000),
        em, 'Silvano Straccini', 'admin', 'attivo',
        true, true, true,
        new Date().toISOString(), new Date().toISOString(),
        'system_seed', 'Admin fondatore'
      ]);
      existingEmails.add(em);
      report.daAdminSeed++;
    });
    Logger.log('  Importati: ' + report.daAdminSeed);

    var totale = report.dalMailingList + report.daContactsMatrix + report.daAdminSeed;
    Logger.log('=== Migrazione completata: ' + totale + ' importati, ' + report.gia_presenti + ' gia presenti ===');
    return { ok:true, importati: report, totale: totale };
  } catch(e) {
    Logger.log('ERR top-level: ' + e.message);
    return { error: e.message, partial: report };
  }
}

// ============================================================================
// DIAGNOSTICA
// ============================================================================

function testAuthSystem() {
  Logger.log('=== TEST AUTH SYSTEM ===');
  var auth = getCurrentUserAuth();
  Logger.log('Utente corrente:');
  Logger.log(JSON.stringify(auth, null, 2));
  return auth;
}

function inspectUtenti() {
  Logger.log('=== INSPECT UTENTI ===');
  var res = { fogliEsiste: false, count: 0, items: [] };
  try {
    var sh = _getOrCreateUtentiSheet_();
    res.fogliEsiste = true;
    var lastRow = sh.getLastRow();
    res.count = lastRow - 1;
    Logger.log('Foglio Utenti: ' + res.count + ' utenti');
    if (lastRow >= 2) {
      var rows = sh.getRange(2, 1, lastRow-1, sh.getLastColumn()).getValues();
      var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
      rows.forEach(function(r, i) {
        var emObj = {};
        headers.forEach(function(h, j){ emObj[h] = r[j]; });
        res.items.push(emObj);
        Logger.log('  ' + (i+1) + '. ' + emObj.Email + ' · ' + emObj.Ruolo + ' · ' + emObj.Stato);
      });
    }
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    res.error = e.message;
  }
  return res;
}

// ============================================================================
// AUDIT + FIX SCHEMA UTENTI (v4.14.1 - 2026-05-06)
// Risolve il problema "dati shiftati": colonne foglio Utenti disallineate.
// auditUtentiSchema() / fixUtentiSchema() / dedupUtentiByEmail() / runFixUtentiCompleto()
// ============================================================================

function auditUtentiSchema() {
  Logger.log('================================================================');
  Logger.log('AUDIT SCHEMA UTENTI');
  Logger.log('================================================================');
  var report = { ok:true, headersReali:[], headersAttesi:OC_UTENTI_HEADERS, problemi:[], statoConteggi:{}, ruoloConteggi:{}, righeCampione:[] };
  try {
    var sh = _getOrCreateUtentiSheet_();
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    report.headersReali = sh.getRange(1,1,1,lastCol).getValues()[0];
    Logger.log('Headers reali (' + lastCol + ' colonne):');
    report.headersReali.forEach(function(h, i){ Logger.log('  ' + (i+1) + '. "' + h + '"'); });
    Logger.log('Headers attesi (' + OC_UTENTI_HEADERS.length + ' colonne):');
    OC_UTENTI_HEADERS.forEach(function(h, i){ Logger.log('  ' + (i+1) + '. "' + h + '"'); });

    OC_UTENTI_HEADERS.forEach(function(hAtteso, idx) {
      if (idx >= report.headersReali.length) {
        report.problemi.push('Colonna mancante: ' + hAtteso + ' (attesa in pos ' + (idx+1) + ')');
      } else if (String(report.headersReali[idx]).trim() !== hAtteso) {
        report.problemi.push('Disallineamento pos ' + (idx+1) + ': atteso "' + hAtteso + '", trovato "' + report.headersReali[idx] + '"');
      }
    });
    if (lastCol > OC_UTENTI_HEADERS.length) {
      report.problemi.push('Colonne extra non previste: ' + (lastCol - OC_UTENTI_HEADERS.length));
    }

    var iEmail = report.headersReali.indexOf('Email');
    var iRuolo = report.headersReali.indexOf('Ruolo');
    var iStato = report.headersReali.indexOf('Stato');
    var iOd = report.headersReali.indexOf('OptInDigest');
    var iOb = report.headersReali.indexOf('OptInBandi');
    var iOm = report.headersReali.indexOf('OptInMatrix');

    if (iEmail < 0) report.problemi.push('CRITICO: colonna Email non trovata');
    if (iRuolo < 0) report.problemi.push('CRITICO: colonna Ruolo non trovata');
    if (iStato < 0) report.problemi.push('CRITICO: colonna Stato non trovata');

    if (lastRow >= 2 && iStato >= 0 && iRuolo >= 0) {
      var rows = sh.getRange(2,1,lastRow-1,lastCol).getValues();
      rows.forEach(function(r, i) {
        var stato = String(r[iStato] || '').trim().toLowerCase();
        var ruolo = String(r[iRuolo] || '').trim().toLowerCase();
        report.statoConteggi[stato] = (report.statoConteggi[stato]||0) + 1;
        report.ruoloConteggi[ruolo] = (report.ruoloConteggi[ruolo]||0) + 1;
        if (i < 3) {
          var sample = {};
          report.headersReali.forEach(function(h, k){ sample[h] = r[k]; });
          sample._OptInDigestType = (iOd>=0) ? typeof r[iOd] : 'N/A';
          report.righeCampione.push(sample);
        }
      });
    }

    Logger.log('--- CONTEGGI REALI ---');
    Logger.log('Per stato: ' + JSON.stringify(report.statoConteggi));
    Logger.log('Per ruolo: ' + JSON.stringify(report.ruoloConteggi));
    Logger.log('--- PROBLEMI ---');
    if (report.problemi.length === 0) {
      Logger.log('  Nessun problema sullo schema. Se i counter UI sono sbagliati, verifica i tipi degli OptIn.');
      report.ok = true;
    } else {
      report.problemi.forEach(function(p){ Logger.log('  - ' + p); });
      report.ok = false;
    }
    Logger.log('================================================================');

  } catch(e) {
    Logger.log('ERR audit: ' + e.message);
    report.ok = false;
    report.problemi.push('Eccezione: ' + e.message);
  }
  return report;
}

function fixUtentiSchema() {
  Logger.log('================================================================');
  Logger.log('FIX SCHEMA UTENTI - riallineamento automatico');
  Logger.log('================================================================');
  var report = { ok:true, azioni:[], errors:[] };
  try {
    var sh = _getOrCreateUtentiSheet_();
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var headersReali = sh.getRange(1,1,1,lastCol).getValues()[0];

    var matchScore = 0;
    OC_UTENTI_HEADERS.forEach(function(h, i) {
      if (i < headersReali.length && String(headersReali[i]).trim() === h) matchScore++;
    });
    Logger.log('Match score headers: ' + matchScore + ' / ' + OC_UTENTI_HEADERS.length);

    // CASO A: shift di 1 colonna (manca ID iniziale)
    if (matchScore < 4 && headersReali.length >= 1 &&
        String(headersReali[0]).trim() === 'Email' &&
        String(headersReali[1]||'').trim() === 'Nome') {
      Logger.log('Rilevato SHIFT di -1 (manca colonna ID iniziale). Inserisco colonna ID...');
      sh.insertColumnBefore(1);
      sh.getRange(1,1).setValue('ID');
      if (lastRow >= 2) {
        var ids = [];
        for (var k = 0; k < lastRow - 1; k++) {
          ids.push(['U' + Date.now() + Math.floor(Math.random()*10000) + k]);
          Utilities.sleep(2);
        }
        sh.getRange(2, 1, ids.length, 1).setValues(ids);
      }
      report.azioni.push('Inserita colonna ID iniziale + generati ' + (lastRow - 1) + ' ID univoci');
      lastCol++;
      headersReali = sh.getRange(1,1,1,lastCol).getValues()[0];
    }

    // CASO B: rinomina headers per allineare a OC_UTENTI_HEADERS
    var anyRenamed = false;
    OC_UTENTI_HEADERS.forEach(function(hAtteso, i) {
      var posTarget = i + 1;
      if (posTarget <= lastCol && String(headersReali[i] || '').trim() !== hAtteso) {
        sh.getRange(1, posTarget).setValue(hAtteso);
        anyRenamed = true;
      }
    });
    if (anyRenamed) {
      report.azioni.push('Rinominati headers per allinearli a OC_UTENTI_HEADERS');
      headersReali = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    }

    // CASO C: colonne mancanti in coda
    if (lastCol < OC_UTENTI_HEADERS.length) {
      var nMissing = OC_UTENTI_HEADERS.length - lastCol;
      sh.insertColumnsAfter(lastCol, nMissing);
      for (var z = 0; z < nMissing; z++) {
        sh.getRange(1, lastCol + 1 + z).setValue(OC_UTENTI_HEADERS[lastCol + z]);
      }
      report.azioni.push('Aggiunte ' + nMissing + ' colonne mancanti in coda');
      lastCol = sh.getLastColumn();
      headersReali = sh.getRange(1,1,1,lastCol).getValues()[0];
    }

    sh.getRange(1, 1, 1, OC_UTENTI_HEADERS.length).setFontWeight('bold').setBackground('#0E7490').setFontColor('#fff');
    sh.setFrozenRows(1);

    // CASO D: normalizza OptIn boolean
    var iOd = headersReali.indexOf('OptInDigest');
    var iOb = headersReali.indexOf('OptInBandi');
    var iOm = headersReali.indexOf('OptInMatrix');
    if (iOd >= 0 && lastRow >= 2) {
      var optCols = [iOd, iOb, iOm].filter(function(c){ return c >= 0; });
      var rng = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn());
      var data = rng.getValues();
      var converted = 0;
      data.forEach(function(row) {
        optCols.forEach(function(c) {
          var v = row[c];
          var truthy = (v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1' || v === 'SI' || v === 'YES');
          var falsy  = (v === false || v === 'FALSE' || v === 'false' || v === 0 || v === '0' || v === 'NO' || v === '' || v == null);
          if (truthy && v !== true) { row[c] = true; converted++; }
          else if (falsy && v !== false) { row[c] = false; converted++; }
        });
      });
      if (converted > 0) {
        rng.setValues(data);
        report.azioni.push('Normalizzati ' + converted + ' valori OptIn a boolean true/false');
      }
    }

    if (report.azioni.length === 0) {
      Logger.log('Nessuna correzione necessaria, schema gia coerente');
      report.azioni.push('Nessuna modifica (schema gia OK)');
    } else {
      report.azioni.forEach(function(a){ Logger.log('  OK ' + a); });
    }
    Logger.log('================================================================');

  } catch(e) {
    Logger.log('ERR fix: ' + e.message);
    report.ok = false;
    report.errors.push(e.message);
  }
  return report;
}

function dedupUtentiByEmail() {
  Logger.log('================================================================');
  Logger.log('DEDUP UTENTI per email');
  Logger.log('================================================================');
  var report = { ok:true, duplicatiRimossi:0, dettaglio:[], errors:[] };
  try {
    var sh = _getOrCreateUtentiSheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 3) { Logger.log('Meno di 2 utenti, nulla da deduplicare'); return report; }
    var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    var iEmail = headers.indexOf('Email');
    var iData  = headers.indexOf('DataIscrizione');
    var iStato = headers.indexOf('Stato');
    if (iEmail < 0) { report.errors.push('Colonna Email non trovata'); report.ok=false; return report; }

    var rows = sh.getRange(2, 1, lastRow-1, sh.getLastColumn()).getValues();
    var byEmail = {};
    var righeDaCancellare = [];

    rows.forEach(function(r, idx) {
      var em = String(r[iEmail] || '').toLowerCase().trim();
      if (!em) return;
      var data = (iData >= 0) ? String(r[iData] || '') : '';
      var stato = (iStato >= 0) ? String(r[iStato] || '') : '';
      var rowSheet = idx + 2;
      if (!byEmail[em]) {
        byEmail[em] = { rowSheet: rowSheet, data: data, stato: stato };
      } else {
        var prev = byEmail[em];
        var keepNew = false;
        if (stato === 'attivo' && prev.stato !== 'attivo') keepNew = true;
        else if (prev.stato === 'attivo' && stato !== 'attivo') keepNew = false;
        else if (data > prev.data) keepNew = true;

        if (keepNew) {
          righeDaCancellare.push(prev.rowSheet);
          report.dettaglio.push('Email ' + em + ': elimino riga ' + prev.rowSheet + ' (' + prev.stato + '), tengo riga ' + rowSheet + ' (' + stato + ')');
          byEmail[em] = { rowSheet: rowSheet, data: data, stato: stato };
        } else {
          righeDaCancellare.push(rowSheet);
          report.dettaglio.push('Email ' + em + ': elimino riga ' + rowSheet + ' (' + stato + '), tengo riga ' + prev.rowSheet + ' (' + prev.stato + ')');
        }
      }
    });

    righeDaCancellare.sort(function(a,b){ return b - a; });
    righeDaCancellare.forEach(function(r){
      sh.deleteRow(r);
      report.duplicatiRimossi++;
    });

    Logger.log('Duplicati rimossi: ' + report.duplicatiRimossi);
    report.dettaglio.forEach(function(d){ Logger.log('  ' + d); });
    Logger.log('================================================================');

  } catch(e) {
    Logger.log('ERR dedup: ' + e.message);
    report.ok = false;
    report.errors.push(e.message);
  }
  return report;
}

function runFixUtentiCompleto() {
  Logger.log('################################################################');
  Logger.log('RUNNER FIX UTENTI - audit + fix schema + dedup');
  Logger.log('################################################################');
  var out = { ok:true, audit:null, fix:null, dedup:null };
  out.audit = auditUtentiSchema();
  Logger.log('\n>>> Procedo con FIX schema...');
  out.fix = fixUtentiSchema();
  Logger.log('\n>>> Procedo con DEDUP duplicati...');
  out.dedup = dedupUtentiByEmail();
  Logger.log('\n################################################################');
  Logger.log('RIEPILOGO FINALE:');
  Logger.log('  Audit problemi: ' + (out.audit.problemi||[]).length);
  Logger.log('  Fix azioni:     ' + (out.fix.azioni||[]).length);
  Logger.log('  Dedup rimossi:  ' + (out.dedup.duplicatiRimossi||0));
  Logger.log('################################################################');
  Logger.log('PROSSIMO STEP: ricarica la pagina Impostazioni → Utenti nella webapp');
  Logger.log('Counter Attivi/Admin/Pending devono ora essere corretti, opt-in cliccabili.');
  return out;
}

// ============================================================================
// FINE Auth.gs
// ============================================================================

/**
 * v4.15 (2026-05-09) — Alias frontend-compatibility.
 * Wrapper di getUtentiPerOptIn('matrix') che restituisce la lista utenti
 * opt-in al follow-up consulenziale. Usato da admin tab Utenti.
 */
function getUtentiList() {
  try {
    if (typeof getUtentiPerOptIn !== 'function') return { ok: false, error: 'getUtentiPerOptIn non disponibile' };
    var list = getUtentiPerOptIn('matrix') || [];
    return { ok: true, utenti: list, totale: list.length };
  } catch(e) {
    Logger.log('getUtentiList errore: ' + e.message);
    return { ok: false, error: e.message };
  }
}
