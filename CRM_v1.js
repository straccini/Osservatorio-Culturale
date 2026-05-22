/**
 * ============================================================================
 *  CRM_v1.gs — Lead scoring + CRM lite Duemilamusei
 * ============================================================================
 *  Sprint 4 (2026-05-11)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Scopo: tracciare lead Matrix con scoring automatico secondo tabella decisa
 *  nel Piano di Sviluppo v4.14 -> v5.0 (Parte III).
 *
 *  Tabella scoring (decisione operativa 2026-05-08):
 *    Compilazione Matrix completata              +10
 *    Opt-in follow-up consulenziale (sez. 12)    +30  -> SQL
 *    Opt-in digest tematico mensile              +5
 *    Apertura digest weekly (per ognuna)         +1
 *    Click su servizio Duemilamusei              +5   -> hot lead
 *    Compilazione ripetuta Matrix (>=3 mesi)     +15
 *    Rifiuto esplicito (unsubscribe)             STOP -> cancellazione 30gg
 *
 *  Foglio CRM_Leads schema 13 colonne:
 *    response_id, email, nome, museo_nome, museo_regione,
 *    score_total, score_history_json, opt_in_json,
 *    primo_contatto, ultimo_evento, stato (lead|mql|sql|cliente|hot|cold),
 *    note, telegram_notified_at
 *
 *  Funzioni esportate:
 *    crm_recordEvent(responseId, evento, delta, meta)  - aggiunge evento + score
 *    crm_getLeadScore(responseId)                       - score corrente
 *    crm_listLeads(filtro)                              - lista con filtri
 *    crm_notifyHotLead(responseId)                      - Telegram a Silvano
 *    crm_unsubscribe(email)                             - STOP totale + delete
 *
 *  Hook automatici (da chiamare da Matrix_v1.js):
 *    crm_onMatrixComplete(responseId, museumProfile)
 *    crm_onMatrixOptIn(responseId, email, nome, preferences)
 * ============================================================================
 */

var CRM_SHEET = 'CRM_Leads';
var CRM_HEADERS = [
  'response_id',        // FK ResponsesMatrix
  'email',              // se opt-in, vuoto altrimenti
  'nome',               // optional
  'museo_nome',         // optional
  'museo_regione',      // dall'anagrafica Matrix
  'score_total',        // numero corrente
  'score_history_json', // [{ev, delta, ts, meta}, ...]
  'opt_in_json',        // preferences sezione 12
  'primo_contatto',     // ISO 8601
  'ultimo_evento',      // ISO 8601
  'stato',              // lead | mql | sql | cliente | hot | cold | unsubscribed
  'note',               // libero
  'telegram_notified_at'// ISO 8601 ultima notifica hot
];

var CRM_SOGLIA_HOT = 30;  // sopra questa soglia notifica Telegram
var CRM_EVENT_POINTS = {
  matrix_complete:     10,
  optin_followup:      30,
  optin_tematico:      5,
  digest_opened:       1,
  service_clicked:     5,
  matrix_repeated:     15,
  webinar_signup:      8,
  meeting_booked:      20,
  contract_signed:     100
};

// ============================================================================
// HELPER: getOrCreate sheet
// ============================================================================

function _crmGetSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CRM_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CRM_SHEET);
    sh.appendRow(CRM_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CRM_HEADERS.length)
      .setFontWeight('bold').setBackground('#7A2A1A').setFontColor('#FFFFFF');
    sh.setColumnWidth(2, 220);  // email
    sh.setColumnWidth(7, 320);  // history
  }
  return sh;
}

function _crmFindRow_(sh, responseId) {
  var vals = sh.getDataRange().getValues();
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][0]) === String(responseId)) return r + 1;  // 1-indexed
  }
  return -1;
}

// ============================================================================
// MAIN: crm_recordEvent(responseId, evento, delta, meta)
// ----------------------------------------------------------------------------
// Aggiunge un evento allo storico del lead e aggiorna score_total.
// Se il lead non esiste ancora, crea record.
// Se score >= soglia hot e mai notificato Telegram, manda notifica.
// ============================================================================

function crm_recordEvent(responseId, evento, delta, meta) {
  try {
    if (!responseId) return { ok: false, error: 'responseId mancante' };
    var sh = _crmGetSheet_();
    var row = _crmFindRow_(sh, responseId);
    var deltaNum = Number(delta);
    if (isNaN(deltaNum)) deltaNum = CRM_EVENT_POINTS[evento] || 0;
    var now = new Date().toISOString();

    if (row < 0) {
      // Nuovo lead
      var data = [
        responseId, '', '', '', '',
        deltaNum,
        JSON.stringify([{ev: evento, delta: deltaNum, ts: now, meta: meta || null}]),
        '{}',
        now, now,
        'lead', '', ''
      ];
      sh.appendRow(data);
      row = sh.getLastRow();
    } else {
      // Update
      var vals = sh.getRange(row, 1, 1, CRM_HEADERS.length).getValues()[0];
      var curScore = Number(vals[5] || 0);
      var newScore = curScore + deltaNum;
      var history = [];
      try { history = JSON.parse(vals[6] || '[]'); } catch(e) { history = []; }
      history.push({ev: evento, delta: deltaNum, ts: now, meta: meta || null});
      sh.getRange(row, 6).setValue(newScore);
      sh.getRange(row, 7).setValue(JSON.stringify(history));
      sh.getRange(row, 10).setValue(now);
      // Promozione stato
      var statoOld = String(vals[10] || 'lead');
      if (statoOld !== 'cliente' && statoOld !== 'unsubscribed') {
        var statoNew = statoOld;
        if (newScore >= 100) statoNew = 'cliente';
        else if (newScore >= CRM_SOGLIA_HOT) statoNew = 'hot';
        else if (newScore >= 10) statoNew = 'mql';
        if (statoNew !== statoOld) sh.getRange(row, 11).setValue(statoNew);
      }
    }

    // Notifica Telegram se hot e non ancora notificato
    var curRow = sh.getRange(row, 1, 1, CRM_HEADERS.length).getValues()[0];
    if (Number(curRow[5]) >= CRM_SOGLIA_HOT && !curRow[12]) {
      crm_notifyHotLead(responseId);
      sh.getRange(row, 13).setValue(now);
    }

    return { ok: true, responseId: responseId, score: Number(curRow[5]), stato: curRow[10] };
  } catch(e) {
    Logger.log('crm_recordEvent ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// MAIN: crm_getLeadScore(responseId)
// ============================================================================

function crm_getLeadScore(responseId) {
  try {
    var sh = _crmGetSheet_();
    var row = _crmFindRow_(sh, responseId);
    if (row < 0) return { ok: true, found: false };
    var vals = sh.getRange(row, 1, 1, CRM_HEADERS.length).getValues()[0];
    var history = [];
    try { history = JSON.parse(vals[6] || '[]'); } catch(e){}
    var optIn = {};
    try { optIn = JSON.parse(vals[7] || '{}'); } catch(e){}
    return {
      ok: true, found: true,
      responseId: vals[0], email: vals[1], nome: vals[2],
      museo: vals[3], regione: vals[4],
      score: Number(vals[5]), stato: vals[10],
      history: history, optIn: optIn,
      primoContatto: vals[8], ultimoEvento: vals[9]
    };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// MAIN: crm_listLeads(filtro)
// ============================================================================

function crm_listLeads(filtro) {
  try {
    filtro = filtro || {};
    var sh = _crmGetSheet_();
    var vals = sh.getDataRange().getValues();
    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (filtro.stato && String(row[10]) !== filtro.stato) continue;
      if (filtro.minScore != null && Number(row[5]) < filtro.minScore) continue;
      out.push({
        responseId: row[0], email: row[1], nome: row[2],
        museo: row[3], regione: row[4], score: Number(row[5]),
        stato: row[10], ultimoEvento: row[9]
      });
    }
    // Ordina per score decrescente
    out.sort(function(a, b){ return b.score - a.score; });
    return { ok: true, leads: out, totale: out.length };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// MAIN: crm_notifyHotLead(responseId) - notifica Telegram a Silvano
// ============================================================================

function crm_notifyHotLead(responseId) {
  try {
    var lead = crm_getLeadScore(responseId);
    if (!lead.ok || !lead.found) return { ok: false, error: 'lead non trovato' };
    if (typeof sendTelegram !== 'function') return { ok: false, error: 'sendTelegram non disponibile' };

    var msg = '*Lead caldo MuseMu Matrix*\n\n';
    msg += 'Score: *' + lead.score + ' pt* (' + lead.stato.toUpperCase() + ')\n';
    if (lead.museo)   msg += 'Museo: ' + lead.museo + '\n';
    if (lead.regione) msg += 'Regione: ' + lead.regione + '\n';
    if (lead.email)   msg += 'Email: ' + lead.email + '\n';
    if (lead.nome)    msg += 'Nome: ' + lead.nome + '\n';
    msg += '\nUltimo evento: ' + (lead.ultimoEvento || '-') + '\n';
    msg += 'Eventi totali: ' + (lead.history ? lead.history.length : 0);
    msg += '\n\n_Contattare entro 7 giorni se SQL, 3 giorni se HOT._';

    sendTelegram(msg);
    Logger.log('crm_notifyHotLead: notifica inviata per ' + responseId);
    return { ok: true, responseId: responseId, score: lead.score };
  } catch(e) {
    Logger.log('crm_notifyHotLead ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// MAIN: crm_unsubscribe(email) - STOP totale + cancellazione 30gg
// ============================================================================

function crm_unsubscribe(email) {
  try {
    if (!email) return { ok: false, error: 'email mancante' };
    var sh = _crmGetSheet_();
    var vals = sh.getDataRange().getValues();
    var emailLow = String(email).toLowerCase().trim();
    var found = 0;
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][1]).toLowerCase().trim() === emailLow) {
        sh.getRange(r + 1, 11).setValue('unsubscribed');
        sh.getRange(r + 1, 12).setValue('Unsubscribe richiesto il ' + new Date().toISOString());
        found++;
      }
    }
    // Audit log
    try {
      PropertiesService.getScriptProperties().setProperty(
        'crm_unsub_' + Date.now(),
        JSON.stringify({email: emailLow, ts: new Date().toISOString(), records: found})
      );
    } catch(e) {}
    return { ok: true, email: emailLow, records: found, message: 'Cancellazione completa entro 30gg' };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// HOOK: crm_onMatrixComplete(responseId, museumProfile)
// Chiamato da Matrix_v1.js al completamento del questionario.
// ============================================================================

function crm_onMatrixComplete(responseId, museumProfile) {
  museumProfile = museumProfile || {};
  return crm_recordEvent(responseId, 'matrix_complete', 10, {
    profile: museumProfile.profileAssigned || '',
    score: museumProfile.syntheticScore || 0
  });
}

// ============================================================================
// HOOK: crm_onMatrixOptIn(responseId, email, nome, preferences)
// Chiamato da Matrix_v1.js dopo saveMatrixContact.
// ============================================================================

function crm_onMatrixOptIn(responseId, email, nome, preferences) {
  try {
    preferences = preferences || {};
    var delta = 0;
    var ev = [];
    if (preferences.contatto_consulenziale) { delta += 30; ev.push('optin_followup'); }
    if (preferences.digest_tematico)        { delta += 5;  ev.push('optin_tematico'); }
    if (delta === 0) delta = 1;  // basic opt-in

    var sh = _crmGetSheet_();
    var row = _crmFindRow_(sh, responseId);
    if (row > 0) {
      // Aggiorna email/nome/optIn in record esistente
      sh.getRange(row, 2).setValue(email || '');
      sh.getRange(row, 3).setValue(nome || '');
      sh.getRange(row, 8).setValue(JSON.stringify(preferences));
    }
    return crm_recordEvent(responseId, ev.join('+') || 'optin_basic', delta, { email: email, prefs: preferences });
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// TEST
// ============================================================================

function testCRM() {
  var rid = 'test-' + Date.now();
  Logger.log(JSON.stringify(crm_onMatrixComplete(rid, {profileAssigned:'P2', syntheticScore:48}), null, 2));
  Logger.log(JSON.stringify(crm_onMatrixOptIn(rid, 's.straccini@gmail.com', 'Silvano Test',
    {contatto_consulenziale: true, digest_tematico: true}), null, 2));
  Logger.log(JSON.stringify(crm_getLeadScore(rid), null, 2));
}

// ============================================================================
// FINE MODULO CRM_v1.gs
// ============================================================================
