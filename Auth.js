/**
 * ============================================================================
 *  Auth.gs — Autenticazione Google + Gestione Utenti unificata
 * ============================================================================
 *  Sprint 1.4 (2026-05-01)
 *  Autore: Silvano Straccini / Duemilamusei
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
    // Aggiungi admin di default
    OC_ADMIN_EMAILS.forEach(function(em) {
      sh.appendRow([
        'U' + Date.now() + Math.floor(Math.random()*1000),
        em, 'Silvano Straccini', 'admin', 'attivo',
        true, true, true,
        new Date().toISOString(), new Date().toISOString(),
        'system_seed', 'Admin fondatore'
      ]);
    });
  }
  return sh;
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


function getCurrentUserAuth() {
  var email = '';
  try { email = (Session.getActiveUser().getEmail() || '').toLowerCase().trim(); } catch(e) {}

  // Sprint 1.4 hotfix (2026-05-01): se Session vuota (Gmail esterni), prova fallback da CacheService
  if (!email) {
    try {
      var cached = CacheService.getScriptCache().get('oc_session_' + Session.getTemporaryActiveUserKey());
      if (cached) email = String(cached).toLowerCase().trim();
    } catch(eC) {}
  }

  if (!email) {
    return _authNullResult_('not_logged');
  }

  // Cerca nel foglio Utenti
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
        var autorizzato = (stato === 'attivo' && ruolo !== 'ospite');
        return {
          email: email,
          nome: String(rows[i][iNome] || ''),
          ruolo: ruolo,
          stato: stato,
          autorizzato: autorizzato,
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
  } catch(e) {
    Logger.log('getCurrentUserAuth errore: ' + e.message);
  }

  // Fallback: hardcoded admin emails (sempre attivi anche se manca foglio)
  if (OC_ADMIN_EMAILS.indexOf(email) >= 0) {
    return {
      email: email, nome: '', ruolo: 'admin', stato: 'attivo',
      autorizzato: true,
      optIn: { digest: true, bandi: true, matrix: true },
      isAdmin: true, isEditor: true, isLettore: false, isOspite: false
    };
  }

  // Email loggata ma non in Utenti: ospite di default
  return {
    email: email, nome: '', ruolo: 'ospite', stato: 'pending',
    autorizzato: false,
    optIn: { digest: false, bandi: false, matrix: false },
    isAdmin: false, isEditor: false, isLettore: false, isOspite: true
  };
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
  requireAuth(['admin']);
  opts = opts || {};
  var sh = _getOrCreateUtentiSheet_();
  if (sh.getLastRow() < 2) return { items: [] };
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, headers.length).getValues();
  var items = rows.map(function(r) {
    var o = {};
    headers.forEach(function(h, i){ o[h] = r[i]; });
    return o;
  });
  if (opts.statoFilter) items = items.filter(function(o){ return o.Stato === opts.statoFilter; });
  if (opts.ruoloFilter) items = items.filter(function(o){ return o.Ruolo === opts.ruoloFilter; });
  return { items: items };
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
 * Sprint 1.4 (2026-05-01) — Invito diretto da admin: crea utente attivo subito.
 */
function invitaNuovoUtente(body) {
  requireAuth(['admin']);
  body = body || {};
  var email = String(body.email||'').toLowerCase().trim();
  if (!email) return { error:'email obbligatoria' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error:'email non valida' };
  var nome = String(body.nome||'').trim();
  var ruolo = body.ruolo;
  if (OC_UTENTI_RUOLI.indexOf(ruolo) < 0) ruolo = 'lettore';

  var sh = _getOrCreateUtentiSheet_();
  var rows = sh.getDataRange().getValues();
  var headers = rows[0];
  var iEmail = headers.indexOf('Email');
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iEmail]||'').toLowerCase().trim() === email) {
      return { error:'utente gia presente' };
    }
  }
  var id = 'U' + Date.now() + Math.floor(Math.random()*1000);
  var nowIso = new Date().toISOString();
  var auth = getCurrentUserAuth();
  sh.appendRow([
    id, email, nome, ruolo, 'attivo',
    true, false, false,
    nowIso, nowIso,
    'invito_admin:' + (auth.email||'system'),
    'Invitato da admin il ' + nowIso.substring(0,10)
  ]);
  _sendWelcomeEmail_(email, ruolo);
  return { ok:true, email: email, ruolo: ruolo };
}

function rejectUser(email, motivo) {
  requireAuth(['admin']);
  return _setUserStato_(email, 'rifiutato', motivo);
}

function suspendUser(email) {
  requireAuth(['admin']);
  return _setUserStato_(email, 'sospeso');
}

function deleteUser(email) {
  requireAuth(['admin']);
  if (!email) return { error:'email mancante' };
  var sh = _getOrCreateUtentiSheet_();
  var rows = sh.getDataRange().getValues();
  var headers = rows[0];
  var iEmail = headers.indexOf('Email');
  for (var i = rows.length-1; i >= 1; i--) {
    if (String(rows[i][iEmail] || '').toLowerCase().trim() === email.toLowerCase().trim()) {
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
          '<p>Cordialmente,<br>Silvano Straccini · Duemilamusei</p>' +
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
// FINE Auth.gs
// ============================================================================
