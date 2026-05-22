// ============================================================================
//  Prenotazioni_v1.gs — Wizard pre-prenotazione consulenza (v4.18.19 · 2026-05-13)
// ----------------------------------------------------------------------------
//  Flusso prima di aprire il calendario consulenza:
//    1. Schermata privacy + consenso esplicito (no obbligo contrattuale)
//    2. Argomento di interesse (tematica KB T1-T9 + "Altro")
//    3. Reindirizzamento al calendario condiviso (Cal.com / Google Appointment)
//
//  I dati vengono salvati nel foglio RichiestePrenotazione per il follow-up
//  commerciale (CRM lite, allineato KB linea di servizio LS1/LS2).
//
//  Endpoint pubblici:
//    savePrenotazioneIntent(data)  — salva intent + email notifica
//    setupPrenotazioniSheet()      — crea foglio (one-shot, admin)
//    getPrenotazioniIntent(limit)  — elenco per pannello admin (futuro)
// ============================================================================

var OC_PRENOTAZIONI_SHEET = 'RichiestePrenotazione';
var OC_PRENOTAZIONI_HEADERS = [
  'id','timestamp','consent_privacy','consent_text_version',
  'tematica_codice','tematica_nome','descrizione_libera',
  'museo_nome','email','user_agent_hash','stato_followup'
];

// Versione testo privacy (incrementare se il testo cambia, per audit)
var OC_PRIVACY_VERSION_PRENOTAZIONE = 'v1.0-2026-05-13';

/**
 * v4.18.19 (2026-05-13) — Salva intent prenotazione consulenza.
 *
 * @param {Object} data
 *   data.consent          (bool, obbligatorio)
 *   data.tematicaCodice   (string: T1..T9 oppure "ALTRO")
 *   data.tematicaNome     (string)
 *   data.descrizione      (string, max 300 char)
 *   data.museoNome        (string, opzionale)
 *   data.email            (string, opzionale)
 *
 * @return { ok, id, calendarUrl } | { ok:false, error }
 */
function savePrenotazioneIntent(data) {
  try {
    data = data || {};
    if (data.consent !== true) {
      return { ok:false, error:'Per procedere è necessario il consenso al trattamento dati (Step 1).' };
    }
    if (!data.tematicaCodice) {
      return { ok:false, error:'Seleziona almeno una tematica di interesse (Step 2).' };
    }
    // Tronca descrizione a 300 char (sicurezza server-side)
    var descr = String(data.descrizione || '').substring(0, 300);
    var sh = _getOrCreatePrenotazioniSheet_();
    var id = 'PR' + Date.now() + Math.random().toString(36).substring(2, 6);
    sh.appendRow([
      id,
      new Date(),
      true,
      OC_PRIVACY_VERSION_PRENOTAZIONE,
      String(data.tematicaCodice || ''),
      String(data.tematicaNome || ''),
      descr,
      String(data.museoNome || ''),
      String(data.email || ''),
      '',
      'nuovo'
    ]);

    // Email notifica admin
    try { _emailNotificaPrenotazione_(id, data, descr); } catch(eMail) { Logger.log('mail notif: ' + eMail.message); }

    // v4.18.46 (2026-05-15) — Crea sessione 7gg + invia magic-link all'utente (se email fornita)
    var sessionResult = null;
    try {
      var emailUtente = String(data.email || '').trim().toLowerCase();
      if (emailUtente && typeof createSessione === 'function') {
        sessionResult = createSessione(emailUtente, 'prenotazione');
      }
    } catch(eSess) { Logger.log('createSessione fallita (non bloccante): ' + eSess.message); }

    // v4.18.55 — Hook CRM: registra richiesta consulenza per lead scoring (+5 pt)
    try {
      if (emailUtente && typeof crm_recordEvent === 'function') {
        crm_recordEvent(emailUtente, 'consultation_requested', 5, {
          tematica: data.tematicaCodice || '',
          museo: data.museoNome || ''
        });
      }
    } catch(eCrm) { Logger.log('crm_recordEvent prenotazione fallito (non bloccante): ' + eCrm.message); }

    // Ritorna l'URL del calendario per il redirect
    var calendarUrl = '';
    try {
      if (typeof _getCommercialField_ === 'function') {
        calendarUrl = _getCommercialField_('calendarUrl', '');
      }
    } catch(eCal) {}

    return {
      ok: true,
      id: id,
      calendarUrl: calendarUrl,
      sessionCreated: sessionResult && sessionResult.ok,
      magicLinkSent: !!(sessionResult && sessionResult.magicLink)
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * Setup foglio RichiestePrenotazione (one-shot admin, idempotente).
 */
function setupPrenotazioniSheet() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  try {
    var sh = _getOrCreatePrenotazioniSheet_();
    return { ok:true, sheetName: OC_PRENOTAZIONI_SHEET, headers: OC_PRENOTAZIONI_HEADERS, rows: Math.max(0, sh.getLastRow() - 1) };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * Elenco prenotazioni intent per pannello admin (CRM lite).
 */
function getPrenotazioniIntent(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  opts = opts || {};
  var limit = Number(opts.limit) || 50;
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(OC_PRENOTAZIONI_SHEET);
    if (!sh) return { ok:true, count:0, list:[], note:'Foglio non ancora creato' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, count:0, list:[] };
    var head = vals[0]; var idx = {}; head.forEach(function(h,i){ idx[h]=i; });
    var out = [];
    for (var r = vals.length - 1; r >= 1 && out.length < limit; r--) {
      var row = vals[r];
      out.push({
        id: row[idx.id],
        timestamp: row[idx.timestamp] ? new Date(row[idx.timestamp]).toLocaleString('it-IT') : '',
        tematicaCodice: row[idx.tematica_codice],
        tematicaNome: row[idx.tematica_nome],
        descrizione: row[idx.descrizione_libera],
        museoNome: row[idx.museo_nome],
        email: row[idx.email],
        stato: row[idx.stato_followup] || 'nuovo'
      });
    }
    return { ok:true, count: out.length, list: out };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// HELPERS
// ============================================================================

function _getOrCreatePrenotazioniSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OC_PRENOTAZIONI_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_PRENOTAZIONI_SHEET);
    sh.getRange(1, 1, 1, OC_PRENOTAZIONI_HEADERS.length).setValues([OC_PRENOTAZIONI_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _emailNotificaPrenotazione_(id, data, descr) {
  var admin = (typeof OC_ADMIN_DEFAULT_ !== 'undefined') ? OC_ADMIN_DEFAULT_ : 's.straccini@gmail.com';
  var subj = '[Osservatorio] Nuova richiesta prenotazione · ' + (data.tematicaCodice || 'tematica?') + (data.museoNome ? ' · ' + data.museoNome : '');
  var body = ''
    + 'Nuova richiesta di consulenza gratuita.\n\n'
    + 'ID:           ' + id + '\n'
    + 'Quando:       ' + new Date().toLocaleString('it-IT') + '\n\n'
    + 'Tematica:     ' + (data.tematicaCodice || '?') + ' — ' + (data.tematicaNome || '') + '\n'
    + 'Descrizione:  ' + (descr || '(nessuna)') + '\n\n'
    + 'Museo:        ' + (data.museoNome || '(non specificato)') + '\n'
    + 'Email:        ' + (data.email || '(non fornita)') + '\n\n'
    + 'Consenso privacy: ✓ (versione ' + OC_PRIVACY_VERSION_PRENOTAZIONE + ')\n\n'
    + 'L\'utente è stato reindirizzato al calendario condiviso per scegliere lo slot. Quando prenoterà, riceverai la notifica nativa da Google Calendar / Cal.com.\n';
  MailApp.sendEmail({ to: admin, subject: subj, body: body });
}

// ============================================================================
// FINE Prenotazioni_v1.gs
// ============================================================================
