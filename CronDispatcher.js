/**
 * ============================================================================
 *  CronDispatcher.js — Consolidamento trigger in un unico dispatcher orario
 * ============================================================================
 *  Autore: Claude (Cowork) per Silvano Straccini / Sinopia — 2026-06-26
 *
 *  Problema: limite GAS di 20 trigger/progetto. Lo schedule approvato
 *  (OC_TRIGGER_SCHEDULE in SetupMaster.js) installa 1 trigger PER job → satura.
 *
 *  Soluzione: UN solo trigger orario (ocCronDispatch) che legge lo STESSO
 *  schedule (job, giorni e ore IDENTICI a quelli approvati) + i job nuovi, e
 *  lancia quelli dovuti all'ora/giorno corrente. ~20 trigger → 1.
 *
 *  SICUREZZA:
 *   - ocCronSetup(true)  = DRY-RUN: mostra il piano, NON tocca nulla.
 *   - ocCronSetup(false) = applica: rimuove SOLO i trigger dei job in schedule
 *     e crea il dispatcher. Ogni trigger NON riconosciuto resta intatto.
 *   - Il dispatcher esegue ogni job in try/catch, con budget tempo e guardia
 *     anti-doppio (una sola esecuzione per ora di clock).
 *
 *  Funzioni pubbliche:
 *    ocCronSetup(dryRun)  — dry-run / applica la consolidazione
 *    ocCronDispatch()     — il dispatcher (target dell'unico trigger orario)
 *    ocCronStato()        — diagnostica: cosa girerebbe adesso
 * ============================================================================
 */

// Job NUOVI (non presenti in OC_TRIGGER_SCHEDULE) gestiti dal dispatcher.
// NB: scanSourcesBatch NON incluso per non sovrapporsi a scanSourcesBisettimanale.
var OC_CRON_EXTRA = [
  { fn: 'qaNotturnaGAS',         tipo: 'daily',  ora: 23, desc: 'QA notturna nativa (salute fonti + conteggi + email)' },
  { fn: 'fontiReportGiornaliero', tipo: 'daily',  ora: 8,  desc: 'Report FONTI (silenti/aggregatori/link bandi)' },
  { fn: 'scanNewsletterGmail',   tipo: 'weekly', giorno: ScriptApp.WeekDay.MONDAY, ora: 6, desc: 'Ingestione newsletter da Gmail (settimanale)' },
  // v4.25 — Agenti qualità (AgenteQualita.js): via dispatcher, NON trigger dedicati (limite 20)
  { fn: 'agenteQualitaBandi',    tipo: 'daily',  ora: 5,  desc: 'Qualità bandi: archivia scaduti/junk/non-cultura, report senza-link' },
  { fn: 'agenteFontiMute',       tipo: 'monthdays', giorniMese: [1, 6, 11, 16, 21, 26], ora: 7, desc: 'Fonti mute: diagnosi per-fonte ogni 5 giorni + email' }
];

/** Schedule consolidato = approvato (SetupMaster) + nuovi. */
function _ocCronSchedule_() {
  var base = (typeof OC_TRIGGER_SCHEDULE !== 'undefined') ? OC_TRIGGER_SCHEDULE : [];
  return base.concat(OC_CRON_EXTRA);
}

/** WeekDay (enum) per indice 1=Lun..7=Dom (formato 'u'). */
function _ocWeekDay_(dow) {
  var W = ScriptApp.WeekDay;
  return [null, W.MONDAY, W.TUESDAY, W.WEDNESDAY, W.THURSDAY, W.FRIDAY, W.SATURDAY, W.SUNDAY][dow];
}

/** Un job è dovuto all'ora H (0-23), giorno settimana dow (1-7), giorno mese dom (1-31)? */
function _ocCronDovuto_(t, H, dow, dom) {
  if (t.tipo === 'hourly') return (H % (Number(t.ore) || 6)) === 0;
  var ore = (t.ore && t.ore.length) ? t.ore : [Number(t.ora)];
  if (ore.indexOf(H) < 0) return false;
  if (t.tipo === 'weekly') return t.giorno === _ocWeekDay_(dow);
  // v4.25 — 'monthdays': gira nei giorni del mese indicati (es. [1,6,11,16,21,26] ≈ ogni 5gg)
  if (t.tipo === 'monthdays') return (t.giorniMese || []).indexOf(Number(dom)) >= 0;
  return true; // daily
}

// ----------------------------------------------------------------------------
// DISPATCHER — unico trigger orario
// ----------------------------------------------------------------------------
function ocCronDispatch() {
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var now = new Date();
  var H = Number(Utilities.formatDate(now, tz, 'H'));
  var dow = Number(Utilities.formatDate(now, tz, 'u')); // 1=Lun..7=Dom
  var dom = Number(Utilities.formatDate(now, tz, 'd')); // 1-31 giorno del mese
  var stamp = Utilities.formatDate(now, tz, 'yyyyMMdd-HH');

  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('OC_CRON_LAST') === stamp) { Logger.log('ocCronDispatch: già eseguito per ' + stamp); return; }
  props.setProperty('OC_CRON_LAST', stamp);

  var sched = _ocCronSchedule_();
  var start = Date.now(), eseguiti = [], falliti = [];
  for (var i = 0; i < sched.length; i++) {
    var t = sched[i];
    if (!_ocCronDovuto_(t, H, dow, dom)) continue;
    if (Date.now() - start > 300000) { Logger.log('ocCronDispatch: budget esaurito, i rimanenti slittano'); break; }
    if (!/^[A-Za-z0-9_]+$/.test(t.fn)) continue;
    try { eval(t.fn + '()'); eseguiti.push(t.fn); }
    catch (e) { falliti.push(t.fn + ': ' + e.message); Logger.log('ocCronDispatch ' + t.fn + ' ERR: ' + e.message); }
  }
  Logger.log('ocCronDispatch ' + stamp + ' — eseguiti: [' + eseguiti.join(', ') + ']' + (falliti.length ? ' | falliti: [' + falliti.join(' ; ') + ']' : ''));
  return { ora: stamp, eseguiti: eseguiti, falliti: falliti };
}

// ----------------------------------------------------------------------------
// SETUP — dry-run / applica
// ----------------------------------------------------------------------------
function ocCronSetup(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var sched = _ocCronSchedule_();
  var schedFns = {}; sched.forEach(function(t) { schedFns[t.fn] = true; });

  var triggers = ScriptApp.getProjectTriggers();
  var inSchedule = [], dispatcherEsistenti = [], altri = [];
  triggers.forEach(function(tr) {
    var fn = tr.getHandlerFunction();
    if (fn === 'ocCronDispatch') dispatcherEsistenti.push(tr);
    else if (schedFns[fn]) inSchedule.push(fn);
    else altri.push(fn);
  });

  var piano = {
    triggerAttuali: triggers.length,
    jobInSchedule_daAccorpareNelDispatcher: inSchedule,
    triggerNonRiconosciuti_PRESERVATI: altri,
    dispatcherDaCreare: 1,
    triggerFinaliStimati: 1 + altri.length,
    quandoGiranoIJob: sched.map(function(t) {
      return { fn: t.fn, tipo: t.tipo, ore: t.ore ? t.ore : t.ora, giorno: t.giorno ? _ocNomeGiorno_(t.giorno) : '-' };
    })
  };

  if (dryRun) {
    Logger.log('ocCronSetup [DRY-RUN] — nessuna modifica applicata:\n' + JSON.stringify(piano, null, 2));
    return { dryRun: true, piano: piano };
  }

  // APPLICA
  var rimossi = 0;
  ScriptApp.getProjectTriggers().forEach(function(tr) {
    var fn = tr.getHandlerFunction();
    if (fn === 'ocCronDispatch' || schedFns[fn]) { ScriptApp.deleteTrigger(tr); rimossi++; }
  });
  ScriptApp.newTrigger('ocCronDispatch').timeBased().everyHours(1).create();
  PropertiesService.getScriptProperties().deleteProperty('OC_CRON_LAST');
  Logger.log('ocCronSetup APPLICATO: rimossi ' + rimossi + ' trigger, creato 1 dispatcher orario. Preservati (non riconosciuti): ' + altri.length);
  return { dryRun: false, rimossi: rimossi, dispatcherCreati: 1, preservati: altri };
}

function _ocNomeGiorno_(wd) {
  var W = ScriptApp.WeekDay;
  var map = [[W.MONDAY, 'Lun'], [W.TUESDAY, 'Mar'], [W.WEDNESDAY, 'Mer'], [W.THURSDAY, 'Gio'], [W.FRIDAY, 'Ven'], [W.SATURDAY, 'Sab'], [W.SUNDAY, 'Dom']];
  for (var i = 0; i < map.length; i++) if (wd === map[i][0]) return map[i][1];
  return String(wd);
}

/** Diagnostica: quali job risulterebbero dovuti adesso (senza eseguirli). */
function ocCronStato() {
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var now = new Date();
  var H = Number(Utilities.formatDate(now, tz, 'H'));
  var dow = Number(Utilities.formatDate(now, tz, 'u'));
  var dom = Number(Utilities.formatDate(now, tz, 'd'));
  var dovuti = _ocCronSchedule_().filter(function(t) { return _ocCronDovuto_(t, H, dow, dom); }).map(function(t) { return t.fn; });
  var triggerDispatcher = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'ocCronDispatch'; }).length;
  var rep = { adesso: Utilities.formatDate(now, tz, 'EEE HH:mm'), dispatcherAttivo: triggerDispatcher > 0, jobDovutiOra: dovuti, ultimoRun: PropertiesService.getScriptProperties().getProperty('OC_CRON_LAST') || '—' };
  Logger.log('ocCronStato: ' + JSON.stringify(rep, null, 2));
  return rep;
}
