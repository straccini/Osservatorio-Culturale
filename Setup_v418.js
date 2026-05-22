/**
 * ============================================================================
 *  Setup_v418.gs — Wrapper one-click per setup post-deploy v4.18
 * ============================================================================
 *  Sprint 2-5 finalize (2026-05-11)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Scopo: eseguire in cascata tutte le funzioni setup necessarie dopo il
 *  deploy v4.18.0 con un singolo punto di chiamata, sia da editor GAS che
 *  da pulsante UI admin webapp. Log strutturato per ogni step.
 *
 *  Funzioni esportate:
 *    runAllSetupV418()         — esegue tutto, ritorna report con esiti
 *    runAllSetupV418Status()   — verifica stato setup senza eseguire
 *
 *  Funzioni eseguite in cascata (idempotenti):
 *    1. setupBandiV5Triggers       (Bandi_v5.js)
 *    2. setupBandiV5Schema         (Bandi_v5.js) — crea fogli v5 se mancano
 *    3. setupLibriSeed             (Backend_v415.js)
 *    4. setupNormeSheet            (UltimiBandi.js)
 *    5. roc_setupMuseiDB           (ROC_v1.js)
 *    6. _setupAllFontiSheets_      (interno) — crea FontiNews/FontiVideo/etc
 *    7. runFullMigration_Fonti     (FontiMigration_v1.js) — SocialFonti -> FontiNews
 *
 *  Output: { ok, generatedAt, steps: [{name, ok, message, durMs}], totalDurMs }
 * ============================================================================
 */

function runAllSetupV418() {
  var t0 = new Date().getTime();
  var report = {
    ok: true,
    version: 'v4.18.0',
    generatedAt: new Date().toISOString(),
    steps: [],
    user: ''
  };
  try { report.user = Session.getActiveUser().getEmail() || ''; } catch(e) {}

  function step(name, fn) {
    var start = new Date().getTime();
    var entry = { name: name, ok: false, message: '', durMs: 0 };
    try {
      if (typeof fn === 'function') {
        var res = fn();
        entry.ok = true;
        entry.message = typeof res === 'object' ? JSON.stringify(res).substring(0, 280) : String(res || 'eseguito');
      } else {
        entry.message = 'funzione non disponibile (skip)';
      }
    } catch(e) {
      entry.ok = false;
      entry.message = 'ERRORE: ' + e.message;
      report.ok = false;
      Logger.log('Step ' + name + ' FAILED: ' + e.message);
    }
    entry.durMs = new Date().getTime() - start;
    report.steps.push(entry);
    Logger.log('  [' + (entry.ok ? 'OK' : 'KO') + '] ' + name + ' (' + entry.durMs + 'ms) — ' + entry.message.substring(0, 120));
  }

  Logger.log('================================================================');
  Logger.log('SETUP v4.18 — START ' + new Date().toISOString());
  Logger.log('================================================================');

  // Step 1: cron bandi
  step('setupBandiV5Triggers', typeof setupBandiV5Triggers === 'function' ? setupBandiV5Triggers : null);

  // Step 2: schema fogli bandi v5
  step('setupBandiV5Schema', typeof setupBandiV5Schema === 'function' ? setupBandiV5Schema : null);

  // Step 3: foglio Pubblicazioni + 10 seed
  step('setupLibriSeed', typeof setupLibriSeed === 'function' ? setupLibriSeed : null);

  // Step 4: foglio Norme
  step('setupNormeSheet', typeof setupNormeSheet === 'function' ? setupNormeSheet : null);

  // Step 5: database musei ROC
  step('roc_setupMuseiDB', typeof roc_setupMuseiDB === 'function' ? roc_setupMuseiDB : null);

  // Step 6: crea fogli FontiNews/FontiVideo via getFonteSheet (idempotente)
  step('setupFontiUnified', function() {
    var creati = [];
    ['news', 'video'].forEach(function(t){
      if (typeof getFonteSheet === 'function') {
        var sh = getFonteSheet(t);
        if (sh) creati.push(t + ':' + sh.getName());
      }
    });
    return { ok: true, fogli: creati };
  });

  // Step 7: migrazione SocialFonti -> FontiNews + split video
  step('runFullMigration_Fonti', typeof runFullMigration_Fonti === 'function' ? runFullMigration_Fonti : null);

  // Step 8: forza inserimento admin Silvano nel foglio Utenti (idempotente)
  step('seedAdminSilvano', function() {
    if (typeof _forceInsertAdminRow_ === 'function') {
      _forceInsertAdminRow_();
      return { ok: true, admin: 's.straccini@gmail.com' };
    }
    return { ok: false, message: '_forceInsertAdminRow_ non disponibile' };
  });

  // Step 9 (informativo): verifica contatori finali
  step('verificaContatori', function() {
    if (typeof getFontiCounters === 'function') {
      var c = getFontiCounters();
      return c;
    }
    return { ok: false, message: 'getFontiCounters non disponibile' };
  });

  report.totalDurMs = new Date().getTime() - t0;
  Logger.log('================================================================');
  Logger.log('SETUP v4.18 — FINE (' + report.totalDurMs + 'ms) — ' + (report.ok ? 'OK' : 'CON ERRORI'));
  Logger.log('================================================================');
  return report;
}

/**
 * v4.18.29 — Fix orchestrator per le 3 criticità diagnosticate sul deploy @264:
 *   1. Counter fonti faceva falsi negativi (schema mismatch) → ora corretto in getFontiCounters
 *   2. FontiBandi_v5 / FontiPodcast con colonna ATTIVA vuota → attivaFontiVuote bulk
 *   3. MuseiDB_v1 vuoto → import da Drive del file MuseiDB_v1.tsv
 *   4. Foglio ResponsesMatrixMiC mancante → setupMicSheet
 *
 * Esegui da editor GAS UNA VOLTA dopo il deploy v4.18.29.
 * PRE-REQUISITO: caricare il file MuseiDB_v1.tsv in Drive (qualunque cartella).
 *
 * @return {Object} report dettagliato di ciascun step
 */
function runSinopiaFix() {
  var t0 = new Date().getTime();
  var report = {
    ok: true,
    version: 'v4.18.29',
    generatedAt: new Date().toISOString(),
    steps: []
  };
  function step(name, fn) {
    var start = new Date().getTime();
    var entry = { name: name, ok: false, message: '', durMs: 0 };
    try {
      var res = fn();
      entry.ok = true;
      entry.message = typeof res === 'object' ? JSON.stringify(res).substring(0, 400) : String(res || 'eseguito');
    } catch(e) {
      entry.ok = false; entry.message = 'ERRORE: ' + e.message; report.ok = false;
    }
    entry.durMs = new Date().getTime() - start;
    report.steps.push(entry);
    Logger.log('  [' + (entry.ok ? 'OK' : 'KO') + '] ' + name + ' (' + entry.durMs + 'ms) — ' + entry.message.substring(0, 200));
  }

  Logger.log('================================================================');
  Logger.log('SINOPIA FIX — START ' + new Date().toISOString());
  Logger.log('================================================================');

  // Step A: contatori PRIMA del fix (per confronto)
  step('contatori_PRE', function() {
    return (typeof getFontiCounters === 'function') ? getFontiCounters() : { error: 'getFontiCounters mancante' };
  });

  // Step B: bulk activation fonti con ATTIVA vuota
  step('attivaFontiVuote', function() {
    if (typeof attivaFontiVuote !== 'function') return { error: 'attivaFontiVuote mancante (deploy non aggiornato)' };
    return attivaFontiVuote(); // tutti i tipi
  });

  // Step C: import MuseiDB da Drive (richiede file in Drive)
  step('importMuseiDB', function() {
    if (typeof roc_importMuseiDB_fromDrive !== 'function') return { error: 'roc_importMuseiDB_fromDrive mancante' };
    return roc_importMuseiDB_fromDrive(); // cerca MuseiDB_v1.tsv
  });

  // Step D: setup foglio MiC (per l'estensione Matrix → MiC)
  step('setupMicSheet', function() {
    if (typeof setupMicSheet !== 'function') return { error: 'setupMicSheet mancante' };
    return setupMicSheet();
  });

  // Step E: contatori DOPO il fix (verifica)
  step('contatori_POST', function() {
    return (typeof getFontiCounters === 'function') ? getFontiCounters() : { error: 'getFontiCounters mancante' };
  });

  report.totalDurMs = new Date().getTime() - t0;
  Logger.log('================================================================');
  Logger.log('SINOPIA FIX — FINE (' + report.totalDurMs + 'ms) — ' + (report.ok ? 'OK' : 'CON ERRORI'));
  Logger.log('================================================================');
  return report;
}

/**
 * Verifica stato setup senza eseguire (controllo idempotenza).
 */
function runAllSetupV418Status() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var checks = {};

    // Trigger cron Lun/Mer/Ven 01:00
    try {
      var triggers = ScriptApp.getProjectTriggers();
      var ok = 0;
      triggers.forEach(function(t){ if (t.getHandlerFunction() === 'scanFontiTutte') ok++; });
      checks.cron_scanFontiTutte = { ok: ok === 3, count: ok };
    } catch(e) { checks.cron_scanFontiTutte = { ok:false, error:e.message }; }

    // Fogli
    ['FontiBandi_v5','FontiNews','FontiVideo','FontiPodcast','Pubblicazioni','Norme','MuseiDB_v1','CRM_Leads','ROC_TriageLog'].forEach(function(name){
      var sh = ss.getSheetByName(name);
      checks['sheet_' + name] = { ok: !!sh, rows: sh ? sh.getLastRow() - 1 : 0 };
    });

    // Backup foglio vecchio
    checks.SocialFonti_legacy_da_eliminare = { exists: !!ss.getSheetByName('SocialFonti') };
    checks.FontiBandi_v4_legacy_da_eliminare = { exists: !!ss.getSheetByName('FontiBandi') };

    return { ok: true, version: 'v4.18.0', checks: checks, generatedAt: new Date().toISOString() };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}



// ============================================================================
// IMPORT TSV ONE-CLICK (2026-05-11 — per evitare drag&drop manuale in Drive)
// ----------------------------------------------------------------------------
// Riceve il contenuto TSV dal frontend (letto via FileReader nel browser),
// pulisce il foglio target, popola header + righe.
// Sicuro: idempotente, sovrascrive solo il foglio specificato.
// ============================================================================

function importTsvToSheet(sheetName, tsvData) {
  try {
    if (!sheetName) return { ok: false, error: 'sheetName mancante' };
    if (!tsvData)   return { ok: false, error: 'tsvData vuoto' };

    var lines = String(tsvData).split(/\r?\n/).filter(function(l){ return l.length > 0; });
    if (lines.length < 2) return { ok: false, error: 'TSV deve avere almeno 2 righe (header + dati)' };

    var data = lines.map(function(l){ return l.split('\t'); });
    var nCols = data[0].length;
    var nRows = data.length;

    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
    } else {
      // Pulisce contenuto esistente (mantiene foglio)
      sh.clear();
    }

    // Normalizza tutte le righe alla stessa lunghezza header
    var normalizedData = data.map(function(row){
      while (row.length < nCols) row.push('');
      if (row.length > nCols) row = row.slice(0, nCols);
      return row;
    });

    // Scrittura batch (molto più veloce di appendRow loop)
    sh.getRange(1, 1, nRows, nCols).setValues(normalizedData);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, nCols).setFontWeight('bold');

    Logger.log('importTsvToSheet OK: ' + sheetName + ' (' + (nRows-1) + ' righe + header, ' + nCols + ' colonne)');
    return {
      ok: true,
      sheetName: sheetName,
      rowsImported: nRows - 1,
      columns: nCols,
      headers: data[0]
    };
  } catch(e) {
    Logger.log('importTsvToSheet ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}



// ============================================================================
// DEBUG ENDPOINT — diagnostica problema "ospite lettore"
// ============================================================================

/**
 * Diagnostic: spiega ESATTAMENTE perche' l'utente corrente e' o non e' admin.
 * Chiamato dalla webapp via google.script.run.debugAuth()
 */
function debugAuth() {
  var out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sessionInfo: {},
    authInfo: {},
    hardcoded: {},
    utentiSheet: {}
  };

  try { out.sessionInfo.effectiveUser = Session.getEffectiveUser().getEmail() || '(vuoto)'; }
  catch(e) { out.sessionInfo.effectiveUser = 'ERR: ' + e.message; }

  try { out.sessionInfo.activeUser = Session.getActiveUser().getEmail() || '(vuoto)'; }
  catch(e) { out.sessionInfo.activeUser = 'ERR: ' + e.message; }

  try { out.sessionInfo.timezone = Session.getScriptTimeZone(); } catch(e) {}

  // Cosa vede getCurrentUserAuth
  try {
    if (typeof getCurrentUserAuth === 'function') {
      out.authInfo = getCurrentUserAuth();
    }
  } catch(e) { out.authInfo.error = e.message; }

  // OC_ADMIN_EMAILS hardcoded
  try {
    if (typeof OC_ADMIN_EMAILS !== 'undefined') {
      out.hardcoded.adminEmails = OC_ADMIN_EMAILS;
    }
  } catch(e) {}

  // Foglio Utenti
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Utenti') || ss.getSheetByName('OC_Utenti');
    if (sh) {
      var vals = sh.getDataRange().getValues();
      out.utentiSheet.foglio = sh.getName();
      out.utentiSheet.righe = vals.length - 1;
      out.utentiSheet.contenuto = vals.slice(0, 5).map(function(r){ return r.slice(0, 5); });
    } else {
      out.utentiSheet.foglio = 'NON ESISTE';
    }
  } catch(e) { out.utentiSheet.error = e.message; }

  return out;
}

// ============================================================================
// FINE MODULO Setup_v418.gs
// ============================================================================
