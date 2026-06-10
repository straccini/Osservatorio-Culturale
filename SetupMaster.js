/**
 * ============================================================================
 *  SetupMaster.js — Setup Unificato Sinopia (v4.18.70)
 * ============================================================================
 *  2026-05-30
 *  Autore: Silvano Straccini / Sinopia
 *
 *  SCOPO: Unico punto di ingresso per installare TUTTI i trigger del sistema.
 *  Sostituisce le 9+ funzioni di setup sparse nei vari file, eliminando
 *  conflitti e sovrapposizioni.
 *
 *  ARCHITETTURA TRIGGER (schedule razionale, nessuna sovrapposizione):
 *
 *    NOTTE (pulizia + manutenzione)
 *      03:00  scanAgente4         — AG4 Comunità (scan daily)
 *      03:00  dedupTuttiIFogli    — Dedup bandi (solo lunedì)
 *      04:00  autoArchiviaBandiScaduti — Archivia bandi scaduti
 *      04:30  sasRun              — Supervisore giornaliero (MA1+MA2)
 *      05:00  qualityCheckBandiAutoDaily — Quality check bandi
 *
 *    ALBA (scanning territoriale)
 *      05:30  agrRunOggi          — 4 regioni BUR/OpenData (lun-ven)
 *      05:30  sasRunWeekly        — Supervisore settimanale (solo lunedì)
 *      06:00  lunediMattina       — Scan completo fonti (solo lunedì)
 *      06:15  galRunOggi          — 10 GAL del giorno
 *
 *    MATTINA (digest + email)
 *      06:00  cronGenerateDigestWeekly — Matrix digest personalizzato (solo martedì)
 *      07:00  sendDigestAuto2coorti    — Digest 2 coorti A+B (solo lunedì)
 *      07:00  scanSources         — RSS news (mar+gio)
 *      07:30  scanPodcast         — Podcast+video (mar+gio)
 *      07:30  sendAgentEmails     — Check + invio email agenti
 *
 *    TARDA MATTINA
 *      09:00  generateNextSocialDraft — Bozza social (ogni 2gg interno)
 *
 *    CONTINUO (cicli)
 *      ogni 6h   scanAgente1     — AG1 Bandi
 *      ogni 12h  scanAgente2     — AG2 Normativa
 *      ogni 12h  scanAgente3     — AG3 Innovazione
 *      ogni 12h  scanAgente5     — AG5 Digital
 *      ogni 72h  bandiEvery3Days — Alert Telegram bandi
 *
 *  FUNZIONI PUBBLICHE:
 *    setupMasterTriggers()       — installa TUTTI i trigger (idempotente)
 *    setupMasterDiagnostica()    — audit trigger attivi vs attesi
 *    setupMasterFogli()          — crea tutti i fogli necessari (idempotente)
 *    setupMasterCompleto()       — fogli + trigger + seed + test
 *
 * ============================================================================
 */

// ============================================================================
// SCHEDULE RAZIONALE — definizione centralizzata
// ============================================================================

// LIMITE GAS: max 20 trigger per progetto.
// Ottimizzazioni:
//   - dedupTuttiIFogli RIMOSSO → dedup coperto da sasRun (MA1 igiene dati quotidiana)
//   - bandiEvery3Days RIMOSSO → AG1 scanAgente1 copre bandi ogni 6h;
//     alert Telegram può essere agganciato a sendAgentEmails o sasRun
var OC_TRIGGER_SCHEDULE = [
  // ═══ v4.19.1 — Schedule compattato: da 21 a 13 trigger ═══
  //
  // COMPATTAZIONI:
  //   autoArchiviaBandiScaduti → integrato in sasRun (MA4)
  //   qualityCheckBandiAutoDaily → integrato in sasRun (MA5)
  //   generateNextSocialDraft → integrato in sasRunWeekly
  //   backupSpreadsheet → integrato in sasRunWeekly
  //   scanAgente2+3+5 → fusi in scanAgentiSecondari (ogni 12h)
  //   scanAgente4 → fuso in scanAgentiSecondari
  //   scanSources mar+gio → fusi in scanSourcesBisettimanale (daily con check giorno)
  //   scanPodcast mar+gio → fusi in scanPodcastBisettimanale (daily con check giorno)

  // === NOTTE (manutenzione) ===
  { fn: 'sasRun',                       tipo: 'daily',    ora: 4,  min: 30,  desc: 'Supervisore: igiene + dedup + archivio bandi + quality check' },

  // === ALBA (fonti strutturate + territoriale) ===
  { fn: 'fasRunCompleto',               tipo: 'daily',    ora: 5,  min: 15,  desc: 'Fonti API strutturate: fase1 fetch + fase2 analisi (daily 05:15)' },
  { fn: 'agrRunOggi',                   tipo: 'daily',    ora: 5,  min: 30,  desc: 'Monitor regionale (4 regioni/giorno)' },
  { fn: 'sasRunWeekly',                 tipo: 'weekly',   giorno: ScriptApp.WeekDay.MONDAY, ora: 5, min: 30, desc: 'Supervisore settimanale + backup + social draft + digest queue' },
  { fn: 'lunediMattina',               tipo: 'weekly',   giorno: ScriptApp.WeekDay.MONDAY, ora: 6, min: 0,  desc: 'Scan completo fonti lunedi' },
  { fn: 'galRunOggi',                   tipo: 'daily',    ora: 6,  min: 15,  desc: 'Monitor GAL (10/giorno)' },

  // === MATTINA (digest + scan contenuti) ===
  { fn: 'cronGenerateDigestWeekly',     tipo: 'weekly',   giorno: ScriptApp.WeekDay.TUESDAY, ora: 6, min: 0, desc: 'Matrix digest bozze (martedi)' },
  { fn: 'sendDigestAuto2coorti',        tipo: 'weekly',   giorno: ScriptApp.WeekDay.MONDAY, ora: 7, min: 0,  desc: 'Digest 2 coorti (A+B) lunedi' },
  { fn: 'scanSourcesBisettimanale',     tipo: 'daily',    ora: 7,  min: 0,   desc: 'Scan RSS news (solo mar+gio)' },
  { fn: 'scanPodcastBisettimanale',     tipo: 'daily',    ora: 7,  min: 30,  desc: 'Scan podcast (solo mar+gio)' },
  { fn: 'sendAgentEmails',              tipo: 'daily',    ora: 7,  min: 30,  desc: 'Email agenti (check giorno interno)' },

  // === OUTREACH ===
  { fn: 'outreachRunDaily',              tipo: 'daily',    ora: 9,  min: 0,   desc: 'Outreach: sequenze follow-up 14gg' },

  // === AGENTI SCAN (scacchiera settimanale v4.20) ===
  { fn: 'scanAgente1',                  tipo: 'weekly',   giorno: ScriptApp.WeekDay.MONDAY,    ora: 7, min: 0,  desc: 'AG1 Bandi (lunedi)' },
  { fn: 'scanAgente2',                  tipo: 'weekly',   giorno: ScriptApp.WeekDay.TUESDAY,   ora: 7, min: 0,  desc: 'AG2 Normativa (martedi)' },
  { fn: 'scanAgente3',                  tipo: 'weekly',   giorno: ScriptApp.WeekDay.WEDNESDAY, ora: 7, min: 0,  desc: 'AG3 Innovazione (mercoledi)' },
  { fn: 'scanAgente4',                  tipo: 'weekly',   giorno: ScriptApp.WeekDay.THURSDAY,  ora: 7, min: 0,  desc: 'AG4 Comunita (giovedi)' },
  { fn: 'scanAgente5',                  tipo: 'weekly',   giorno: ScriptApp.WeekDay.FRIDAY,    ora: 7, min: 0,  desc: 'AG5 Digital (venerdi)' }
];

// ============================================================================
// v4.19.1 — WRAPPER BISETTIMANALI (eseguono solo mar+gio)
// ============================================================================

/**
 * Scan RSS news solo martedì e giovedì. Trigger daily ma skip gli altri giorni.
 */
function scanSourcesBisettimanale() {
  var day = new Date().getDay(); // 0=dom, 2=mar, 4=gio
  if (day !== 2 && day !== 4) { Logger.log('[scanSourcesBisettimanale] Oggi non è mar/gio, skip'); return; }
  return scanSources();
}

/**
 * Scan podcast solo martedì e giovedì.
 */
function scanPodcastBisettimanale() {
  var day = new Date().getDay();
  if (day !== 2 && day !== 4) { Logger.log('[scanPodcastBisettimanale] Oggi non è mar/gio, skip'); return; }
  return scanPodcast();
}

// ============================================================================
// SETUP MASTER TRIGGER — installa tutto, idempotente
// ============================================================================

/**
 * Installa TUTTI i trigger del sistema in modo coordinato.
 * Rimuove prima tutti i trigger esistenti, poi ricrea dallo schedule.
 *
 * Sicuro: idempotente, rieseguibile senza effetti collaterali.
 * Wrapped in try/catch per ogni trigger: se uno fallisce, prosegue con gli altri.
 *
 * @return {Object} { ok, installati, errori, dettagli[] }
 */
function setupMasterTriggers() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }

  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    installati: 0,
    errori: 0,
    rimossi: 0,
    dettagli: []
  };

  // 1. Rimuovi TUTTI i trigger esistenti
  try {
    var existing = ScriptApp.getProjectTriggers();
    report.rimossi = existing.length;
    existing.forEach(function(t) { ScriptApp.deleteTrigger(t); });
    Logger.log('[MASTER] Rimossi ' + report.rimossi + ' trigger esistenti.');
  } catch (e) {
    report.ok = false;
    report.dettagli.push({ step: 'cleanup', ok: false, error: e.message });
    Logger.log('[MASTER] ERRORE cleanup: ' + e.message);
    return report;
  }

  // 2. Installa ogni trigger dallo schedule
  OC_TRIGGER_SCHEDULE.forEach(function(t) {
    try {
      var builder = ScriptApp.newTrigger(t.fn).timeBased();

      switch (t.tipo) {
        case 'daily':
          builder.everyDays(1).atHour(t.ora).nearMinute(t.min || 0);
          break;
        case 'weekly':
          builder.onWeekDay(t.giorno).atHour(t.ora).nearMinute(t.min || 0);
          break;
        case 'hours':
          builder.everyHours(t.ore);
          break;
      }

      builder.create();
      report.installati++;
      report.dettagli.push({
        fn: t.fn,
        ok: true,
        schedule: _describeSchedule_(t)
      });
      Logger.log('  ✓ ' + t.fn + ' → ' + _describeSchedule_(t));
    } catch (e) {
      report.errori++;
      report.ok = false;
      report.dettagli.push({
        fn: t.fn,
        ok: false,
        error: e.message
      });
      Logger.log('  ✗ ' + t.fn + ' ERRORE: ' + e.message);
    }
  });

  Logger.log('[MASTER] Installati ' + report.installati + '/' + OC_TRIGGER_SCHEDULE.length + ' trigger. Errori: ' + report.errori);
  return report;
}

function _describeSchedule_(t) {
  var GIORNI = { 1: 'dom', 2: 'lun', 3: 'mar', 4: 'mer', 5: 'gio', 6: 'ven', 7: 'sab' };
  switch (t.tipo) {
    case 'daily':  return 'ogni giorno ' + String(t.ora).padStart(2, '0') + ':' + String(t.min || 0).padStart(2, '0');
    case 'weekly': return (GIORNI[t.giorno] || '?') + ' ' + String(t.ora).padStart(2, '0') + ':' + String(t.min || 0).padStart(2, '0');
    case 'hours':  return 'ogni ' + t.ore + 'h';
    default:       return t.tipo;
  }
}

// ============================================================================
// DIAGNOSTICA — audit trigger attivi vs attesi
// ============================================================================

/**
 * Confronta i trigger attualmente installati con lo schedule atteso.
 * Utile per verificare che setupMasterTriggers sia stato eseguito correttamente.
 *
 * @return {Object} { ok, attivi, attesi, mancanti[], extra[], dettagli[] }
 */
function setupMasterDiagnostica() {
  var triggers = ScriptApp.getProjectTriggers();
  var attiviMap = {};
  var dettagli = [];

  triggers.forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (!attiviMap[fn]) attiviMap[fn] = 0;
    attiviMap[fn]++;
    dettagli.push({
      fn: fn,
      tipo: String(t.getEventType()),
      source: String(t.getTriggerSource())
    });
  });

  // Costruisci mappa attesi
  var attesiMap = {};
  OC_TRIGGER_SCHEDULE.forEach(function(t) {
    if (!attesiMap[t.fn]) attesiMap[t.fn] = 0;
    attesiMap[t.fn]++;
  });

  // Trova mancanti e extra
  var mancanti = [];
  var extra = [];
  Object.keys(attesiMap).forEach(function(fn) {
    if (!attiviMap[fn] || attiviMap[fn] < attesiMap[fn]) {
      mancanti.push({ fn: fn, attesi: attesiMap[fn], attivi: attiviMap[fn] || 0 });
    }
  });
  Object.keys(attiviMap).forEach(function(fn) {
    if (!attesiMap[fn]) {
      extra.push({ fn: fn, count: attiviMap[fn] });
    }
  });

  var ok = mancanti.length === 0;

  Logger.log('═══════ DIAGNOSTICA TRIGGER MASTER ═══════');
  Logger.log('Trigger attivi:  ' + triggers.length);
  Logger.log('Trigger attesi:  ' + OC_TRIGGER_SCHEDULE.length);
  Logger.log('Mancanti:        ' + mancanti.length);
  Logger.log('Extra:           ' + extra.length);
  if (mancanti.length) {
    Logger.log('--- MANCANTI ---');
    mancanti.forEach(function(m) { Logger.log('  ⚠ ' + m.fn + ' (attesi ' + m.attesi + ', attivi ' + m.attivi + ')'); });
  }
  if (extra.length) {
    Logger.log('--- EXTRA (non nello schedule) ---');
    extra.forEach(function(e) { Logger.log('  ? ' + e.fn + ' (' + e.count + ')'); });
  }
  Logger.log('--- DETTAGLIO TRIGGER ATTIVI ---');
  dettagli.forEach(function(d) { Logger.log('  - ' + d.fn + ' (' + d.tipo + ')'); });
  Logger.log('═════════════════════════════════════════');

  return {
    ok: ok,
    attivi: triggers.length,
    attesi: OC_TRIGGER_SCHEDULE.length,
    mancanti: mancanti,
    extra: extra,
    dettagli: dettagli,
    raccomandazione: ok ? 'Tutti i trigger sono allineati.' : 'Esegui setupMasterTriggers() per riallineare.'
  };
}

// ============================================================================
// SETUP MASTER FOGLI — crea struttura dati completa
// ============================================================================

/**
 * Crea tutti i fogli necessari al funzionamento del sistema (idempotente).
 * Non sovrascrive fogli esistenti.
 *
 * @return {Object} { ok, creati[], esistenti[], errori[] }
 */
function setupMasterFogli() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  var report = { ok: true, creati: [], esistenti: [], errori: [] };
  var t0 = Date.now();

  function _step(name, fn) {
    try {
      var r = fn();
      if (r && r.action === 'exists') {
        report.esistenti.push(name);
      } else {
        report.creati.push(name);
      }
      Logger.log('  ✓ ' + name + ': ' + (r ? r.action || 'ok' : 'ok'));
    } catch (e) {
      report.errori.push(name + ': ' + e.message);
      Logger.log('  ✗ ' + name + ': ' + e.message);
    }
  }

  Logger.log('[MASTER FOGLI] Inizio setup...');

  // Setup fogli core (se le funzioni esistono)
  if (typeof setupMatrixSheets === 'function')    _step('ResponsesMatrix+ContactsMatrix', setupMatrixSheets);
  if (typeof setupFontiAgenti === 'function')     _step('FontiAgenti', setupFontiAgenti);
  if (typeof setupProfiloAgenti === 'function')   _step('ProfiloAgenti', setupProfiloAgenti);
  if (typeof setupSocialQueue === 'function')     _step('SocialQueue', setupSocialQueue);

  // Setup fogli log (supervisore crea il suo alla prima esecuzione)
  // ScanLog, DigestLog, DigestQueue — creati on-demand dai rispettivi moduli

  Logger.log('[MASTER FOGLI] Completato in ' + (Date.now() - t0) + 'ms. Creati: ' + report.creati.length + ', Esistenti: ' + report.esistenti.length + ', Errori: ' + report.errori.length);
  return report;
}

// ============================================================================
// SETUP MASTER COMPLETO — fogli + seed + trigger + test
// ============================================================================

/**
 * Esegue il setup completo del sistema in un'unica chiamata:
 *  1. Crea fogli mancanti
 *  2. Seed fonti agenti (se vuote)
 *  3. Installa tutti i trigger
 *  4. Popola ProfiloAgenti da Matrix (se compilazioni esistono)
 *  5. Test diagnostico finale
 *
 * Idempotente: rieseguibile in qualsiasi momento.
 *
 * @return {Object} report dettagliato
 */
function setupMasterCompleto() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  var report = { ok: true, timestamp: new Date().toISOString(), steps: [] };
  var t0 = Date.now();

  function _run(name, fn) {
    try {
      var r = fn();
      report.steps.push({ step: name, ok: true, result: r });
      Logger.log('✓ ' + name);
    } catch (e) {
      report.steps.push({ step: name, ok: false, error: e.message });
      Logger.log('✗ ' + name + ': ' + e.message);
    }
  }

  Logger.log('╔══════════════════════════════════════════╗');
  Logger.log('║   SETUP MASTER COMPLETO — Sinopia OC    ║');
  Logger.log('╚══════════════════════════════════════════╝');

  // FASE 1: Fogli
  _run('1_fogli', setupMasterFogli);

  // FASE 2: Seed fonti agenti
  if (typeof seedFontiNormativa === 'function')   _run('2a_seed_normativa', seedFontiNormativa);
  if (typeof seedFontiInnovazione === 'function') _run('2b_seed_innovazione', seedFontiInnovazione);
  if (typeof seedFontiWelfare === 'function')     _run('2c_seed_welfare', seedFontiWelfare);
  if (typeof seedFontiDigital === 'function')     _run('2d_seed_digital', seedFontiDigital);

  // FASE 3: Trigger
  _run('3_trigger', setupMasterTriggers);

  // FASE 4: Profila musei da Matrix
  if (typeof popolaProfiloAgentiDaMatrix === 'function') {
    _run('4_profila_musei', popolaProfiloAgentiDaMatrix);
  }

  // FASE 5: Diagnostica
  _run('5_diagnostica_trigger', setupMasterDiagnostica);
  if (typeof diagnosticaAgenti === 'function') {
    _run('5b_diagnostica_agenti', diagnosticaAgenti);
  }

  report.totalDurationMs = Date.now() - t0;
  report.ok = report.steps.every(function(s) { return s.ok; });

  Logger.log('════════════════════════════════════════════');
  Logger.log('Setup completato in ' + report.totalDurationMs + 'ms');
  Logger.log('Steps OK: ' + report.steps.filter(function(s){return s.ok;}).length + '/' + report.steps.length);
  if (!report.ok) {
    Logger.log('ERRORI:');
    report.steps.filter(function(s){return !s.ok;}).forEach(function(s){
      Logger.log('  ✗ ' + s.step + ': ' + s.error);
    });
  }
  Logger.log('════════════════════════════════════════════');

  return report;
}
