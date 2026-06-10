// ============================================================================
// KeepWarm_v1.js — Keep-warm self-ping per ridurre i cold-start del web app.
//
// PERCHE': la "pagina bianca" di qualche secondo all'apertura NON e' un bug del
// frontend (guscio + home sono renderizzati server-side e visibili da subito).
// E' il tempo che Google impiega a caricare e compilare il progetto GAS (decine
// di file .js) in una NUOVA istanza V8 (cold start) prima di servire la pagina.
// Un ping periodico all'endpoint ?warm=1 (vedi doGet in Codice.js) tiene calda
// l'istanza: cosi' i visitatori reali raramente pagano il cold start.
//
// File 100% ADDITIVO: nessuna modifica al comportamento esistente.
// Setup (una sola volta, dall'editor GAS): eseguire setupKeepWarmTrigger().
// Per disattivare: eseguire removeKeepWarmTrigger().
// ============================================================================

var KW_TRIGGER_FN = 'keepWarmPing';
var KW_EVERY_MIN  = 5; // ping ogni 5 minuti (valori validi GAS: 1,5,10,15,30)

/**
 * Handler del trigger: chiama il web app su ?warm=1 (risposta leggera in doGet).
 * Scalda l'istanza V8 del progetto senza assemblare/trasferire l'HTML.
 */
function keepWarmPing() {
  try {
    var url = ScriptApp.getService().getUrl();
    if (!url) { Logger.log('keepWarmPing: URL web app non disponibile'); return; }
    var sep = (url.indexOf('?') >= 0) ? '&' : '?';
    var resp = UrlFetchApp.fetch(url + sep + 'warm=1', {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true
    });
    Logger.log('keepWarmPing: HTTP ' + resp.getResponseCode());
  } catch (e) {
    Logger.log('keepWarmPing error: ' + (e && e.message ? e.message : e));
  }
}

/**
 * ESEGUI UNA VOLTA dall'editor GAS: installa il trigger ogni 5 minuti.
 * Idempotente: rimuove eventuali trigger keep-warm preesistenti prima di crearne uno.
 */
function setupKeepWarmTrigger() {
  removeKeepWarmTrigger(); // evita duplicati
  ScriptApp.newTrigger(KW_TRIGGER_FN).timeBased().everyMinutes(KW_EVERY_MIN).create();
  Logger.log('setupKeepWarmTrigger: creato trigger "' + KW_TRIGGER_FN + '" ogni ' + KW_EVERY_MIN + ' min.');
  return { ok: true, fn: KW_TRIGGER_FN, everyMin: KW_EVERY_MIN };
}

/**
 * Rimuove il/i trigger keep-warm (per disattivare il riscaldamento periodico).
 */
function removeKeepWarmTrigger() {
  var n = 0;
  var trigs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trigs.length; i++) {
    if (trigs[i].getHandlerFunction() === KW_TRIGGER_FN) {
      ScriptApp.deleteTrigger(trigs[i]);
      n++;
    }
  }
  Logger.log('removeKeepWarmTrigger: rimossi ' + n + ' trigger.');
  return { ok: true, removed: n };
}

/**
 * Diagnostica: esegue un ping immediato e logga l'esito + i trigger attivi.
 * Utile da lanciare a mano dopo il setup per verificare che tutto risponda.
 */
function keepWarmStatus() {
  keepWarmPing();
  var trigs = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < trigs.length; i++) {
    if (trigs[i].getHandlerFunction() === KW_TRIGGER_FN) n++;
  }
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  Logger.log('keepWarmStatus: trigger attivi=' + n + ' | url=' + url);
  return { ok: true, triggerAttivi: n, url: url, everyMin: KW_EVERY_MIN };
}
