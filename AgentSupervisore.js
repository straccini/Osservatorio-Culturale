/**
 * ============================================================================
 *  AgentSupervisore.js — Supervisore Autonomo Sinopia (SAS)
 * ============================================================================
 *  v4.18.69 (2026-05-24)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Agente supervisore che:
 *  1. Orchestra 4 agenti di manutenzione (MA1-MA4)
 *  2. Monitora la salute dell'intera piattaforma
 *  3. Analizza performance e trend (fonti, contenuti, utenti, agenti)
 *  4. Elabora strategie di ottimizzazione e suggerimenti operativi
 *  5. Produce report settimanali con KPI e raccomandazioni
 *
 *  Foglio stato: SupervisoreLog (creato automaticamente)
 *
 *  Funzioni pubbliche:
 *    sasRun()                    — ciclo supervisore completo (trigger giornaliero)
 *    sasRunWeekly()              — analisi strategica settimanale
 *    sasSetup()                  — installa trigger + foglio
 *    sasDiagnostica()            — report stato immediato
 *    sasGetReport(settimana)     — legge report archiviato
 *
 *  Agenti orchestrati:
 *    MA1 maIgieneDati()          — pulizia quotidiana
 *    MA2 maQualityCheck()        — controllo qualita quotidiano
 *    MA3 maAuditAlert()          — audit + alert settimanale
 *    MA4 maScopertaFonti()       — scoperta fonti settimanale
 *
 *  Prefisso unico: sas_ / _sas* / ma* per manutenzione
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

var SAS_LOG_SHEET = 'SupervisoreLog';
var SAS_LOG_HEADERS = [
  'ID', 'Timestamp', 'Tipo',           // run_giornaliero | run_settimanale | alert | errore
  'AgenteMA', 'Esito',                 // ok | warning | error
  'DurataMs', 'Dettagli',              // JSON con metriche
  'AzioniEseguite', 'Raccomandazioni', // testo per admin
  'KPI_JSON'                           // metriche aggregate
];

// Soglie di allarme
var SAS_SOGLIE = {
  FONTI_SILENTI_MAX: 10,           // max fonti con 3+ fail prima di allarme
  CONTENUTI_SETTIMANA_MIN: 5,      // min nuovi contenuti/settimana
  SCAN_FAIL_RATE_MAX: 0.3,         // max 30% scan fallite
  AGENTI_RISULTATI_MIN: 2,         // min risultati per agente/settimana
  SESSIONI_NUOVE_MIN: 0,           // min nuove sessioni/settimana (0 = no allarme)
  BANDI_SCADUTI_WARN: 20,          // warn se >20 bandi scaduti non archiviati
  DEDUP_THRESHOLD: 50              // warn se >50 duplicati trovati
};

// ============================================================================
// SETUP
// ============================================================================

/**
 * Installa trigger supervisore + crea foglio log.
 * Trigger: giornaliero 04:30 (sasRun) + settimanale lun 05:30 (sasRunWeekly)
 */
function sasSetup() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  try {
    // Crea foglio log
    _sasGetOrCreateLog_();

    // Rimuovi trigger esistenti
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(t) {
      var fn = t.getHandlerFunction();
      if (fn === 'sasRun' || fn === 'sasRunWeekly') {
        ScriptApp.deleteTrigger(t);
      }
    });

    // Trigger giornaliero 04:30
    ScriptApp.newTrigger('sasRun')
      .timeBased().everyDays(1).atHour(4).nearMinute(30).create();

    // Trigger settimanale lunedi 05:30
    ScriptApp.newTrigger('sasRunWeekly')
      .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).nearMinute(30).create();

    Logger.log('[SAS] Setup completato: trigger giornaliero 04:30 + settimanale lun 05:30');
    return { ok: true, trigger_giornaliero: '04:30', trigger_settimanale: 'lun 05:30' };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// CICLO GIORNALIERO (sasRun)
// ============================================================================

/**
 * Ciclo supervisore giornaliero. Esegue MA1 + MA2 + monitoraggio.
 * Trigger: ogni giorno alle 04:30.
 */
function sasRun() {
  var t0 = Date.now();
  var report = {
    timestamp: new Date().toISOString(),
    tipo: 'giornaliero',
    agenti: {},
    monitoraggio: {},
    azioni: [],
    raccomandazioni: [],
    errori: []
  };

  Logger.log('================================================================');
  Logger.log('[SAS] CICLO GIORNALIERO — ' + new Date().toISOString());
  Logger.log('================================================================');

  // ── MA1: Igiene Dati ──
  try {
    var ma1 = maIgieneDati();
    report.agenti.MA1 = ma1;
    if (ma1.archiviate > 0) report.azioni.push('MA1: archiviate ' + ma1.archiviate + ' record vecchi');
    if (ma1.sessioniPulite > 0) report.azioni.push('MA1: pulite ' + ma1.sessioniPulite + ' sessioni');
    if (ma1.dedup > 0) report.azioni.push('MA1: rimossi ' + ma1.dedup + ' duplicati');
    Logger.log('[SAS] MA1 completato: ' + JSON.stringify(ma1));
  } catch(e) {
    report.errori.push('MA1: ' + e.message);
    report.agenti.MA1 = { ok: false, error: e.message };
    Logger.log('[SAS] MA1 ERRORE: ' + e.message);
  }

  // ── MA2: Quality Check ──
  try {
    var ma2 = maQualityCheck();
    report.agenti.MA2 = ma2;
    if (ma2.taggati > 0) report.azioni.push('MA2: taggati ' + ma2.taggati + ' contenuti');
    if (ma2.qualityFix > 0) report.azioni.push('MA2: corretti ' + ma2.qualityFix + ' problemi qualita');
    Logger.log('[SAS] MA2 completato: ' + JSON.stringify(ma2));
  } catch(e) {
    report.errori.push('MA2: ' + e.message);
    report.agenti.MA2 = { ok: false, error: e.message };
    Logger.log('[SAS] MA2 ERRORE: ' + e.message);
  }

  // ── Monitoraggio piattaforma ──
  try {
    report.monitoraggio = _sasMonitoraPiattaforma_();
    var mon = report.monitoraggio;

    // Analisi e raccomandazioni
    if (mon.fontiSilenti > SAS_SOGLIE.FONTI_SILENTI_MAX) {
      report.raccomandazioni.push('WARN: ' + mon.fontiSilenti + ' fonti silenti (soglia ' + SAS_SOGLIE.FONTI_SILENTI_MAX + '). Verificare URL o disattivare.');
    }
    if (mon.bandiScaduti > SAS_SOGLIE.BANDI_SCADUTI_WARN) {
      report.raccomandazioni.push('WARN: ' + mon.bandiScaduti + ' bandi scaduti non archiviati. MA1 dovrebbe gestirli.');
    }
    if (mon.scanFailRate > SAS_SOGLIE.SCAN_FAIL_RATE_MAX) {
      report.raccomandazioni.push('ALERT: tasso fallimento scan ' + Math.round(mon.scanFailRate * 100) + '% (soglia ' + Math.round(SAS_SOGLIE.SCAN_FAIL_RATE_MAX * 100) + '%). Controllare connettivita o fonti.');
    }

    Logger.log('[SAS] Monitoraggio: ' + JSON.stringify(mon));
  } catch(e) {
    report.errori.push('Monitoraggio: ' + e.message);
    Logger.log('[SAS] Monitoraggio ERRORE: ' + e.message);
  }

  // ── Alert Telegram se problemi ──
  if (report.raccomandazioni.length > 0 || report.errori.length > 0) {
    _sasInviaTelegramAlert_(report);
  }

  // ── Log ──
  report.durataMs = Date.now() - t0;
  _sasLogRun_(report);

  Logger.log('[SAS] Ciclo giornaliero completato in ' + report.durataMs + 'ms');
  Logger.log('  Azioni: ' + report.azioni.length);
  Logger.log('  Raccomandazioni: ' + report.raccomandazioni.length);
  Logger.log('  Errori: ' + report.errori.length);
  Logger.log('================================================================');

  return report;
}

// ============================================================================
// CICLO SETTIMANALE (sasRunWeekly)
// ============================================================================

/**
 * Analisi strategica settimanale. Esegue MA3 + MA4 + KPI + trend + raccomandazioni.
 * Trigger: lunedi 05:30.
 */
function sasRunWeekly() {
  var t0 = Date.now();
  var report = {
    timestamp: new Date().toISOString(),
    tipo: 'settimanale',
    agenti: {},
    kpi: {},
    trend: {},
    strategia: [],
    azioni: [],
    raccomandazioni: [],
    errori: []
  };

  Logger.log('================================================================');
  Logger.log('[SAS] ANALISI STRATEGICA SETTIMANALE — ' + new Date().toISOString());
  Logger.log('================================================================');

  // ── MA3: Audit & Alert ──
  try {
    var ma3 = maAuditAlert();
    report.agenti.MA3 = ma3;
    report.azioni.push('MA3: audit completato (' + ma3.problemiTrovati + ' problemi)');
    Logger.log('[SAS] MA3 completato');
  } catch(e) {
    report.errori.push('MA3: ' + e.message);
    Logger.log('[SAS] MA3 ERRORE: ' + e.message);
  }

  // ── MA4: Scoperta Fonti ──
  try {
    var ma4 = maScopertaFonti();
    report.agenti.MA4 = ma4;
    if (ma4.scoperte > 0) report.azioni.push('MA4: ' + ma4.scoperte + ' nuove fonti scoperte');
    if (ma4.approvate > 0) report.azioni.push('MA4: ' + ma4.approvate + ' fonti auto-approvate');
    Logger.log('[SAS] MA4 completato');
  } catch(e) {
    report.errori.push('MA4: ' + e.message);
    Logger.log('[SAS] MA4 ERRORE: ' + e.message);
  }

  // ── KPI settimanali ──
  try {
    report.kpi = _sasCalcolaKPI_();
    Logger.log('[SAS] KPI: ' + JSON.stringify(report.kpi));
  } catch(e) {
    report.errori.push('KPI: ' + e.message);
  }

  // ── Analisi trend ──
  try {
    report.trend = _sasAnalizzaTrend_();
    Logger.log('[SAS] Trend: ' + JSON.stringify(report.trend));
  } catch(e) {
    report.errori.push('Trend: ' + e.message);
  }

  // ── Strategia e raccomandazioni ──
  try {
    report.strategia = _sasElaboraStrategia_(report.kpi, report.trend);
    report.raccomandazioni = report.strategia.map(function(s) { return s.raccomandazione; });
    Logger.log('[SAS] Strategia: ' + report.strategia.length + ' raccomandazioni');
  } catch(e) {
    report.errori.push('Strategia: ' + e.message);
  }

  // ── Report Telegram ──
  _sasInviaReportSettimanale_(report);

  // ── Log ──
  report.durataMs = Date.now() - t0;
  _sasLogRun_(report);

  Logger.log('[SAS] Analisi settimanale completata in ' + report.durataMs + 'ms');
  Logger.log('================================================================');

  return report;
}

// ============================================================================
// AGENTE MA1 — IGIENE DATI
// ============================================================================

function maIgieneDati() {
  var result = { ok: true, archiviate: 0, sessioniPulite: 0, dedup: 0, dettagli: [] };

  // 1. Archivia news vecchie (>90gg)
  try {
    if (typeof autoArchiveOld === 'function') {
      var r1 = autoArchiveOld('item', 90);
      result.archiviate += (r1 && r1.archived) || 0;
      result.dettagli.push({ azione: 'archive_news_90gg', risultato: r1 });
    }
  } catch(e) { result.dettagli.push({ azione: 'archive_news', errore: e.message }); }

  // 2. Archivia bandi scaduti
  try {
    if (typeof autoArchiveOld === 'function') {
      var r2 = autoArchiveOld('bando', 30);
      result.archiviate += (r2 && r2.archived) || 0;
      result.dettagli.push({ azione: 'archive_bandi_scaduti', risultato: r2 });
    }
  } catch(e) { result.dettagli.push({ azione: 'archive_bandi', errore: e.message }); }

  // 3. Archivia podcast vecchi (>180gg)
  try {
    if (typeof autoArchiveOld === 'function') {
      var r3 = autoArchiveOld('podcast', 180);
      result.archiviate += (r3 && r3.archived) || 0;
    }
  } catch(e) { result.dettagli.push({ azione: 'archive_podcast', errore: e.message }); }

  // 4. Cleanup sessioni scadute
  try {
    if (typeof cleanupSessioniScadute === 'function') {
      var r4 = cleanupSessioniScadute();
      result.sessioniPulite = (r4 && r4.scadute) || 0;
    }
  } catch(e) { result.dettagli.push({ azione: 'cleanup_sessioni', errore: e.message }); }

  // 5. Dedup (solo il lunedi)
  var oggi = new Date().getDay();
  if (oggi === 1) { // lunedi
    try {
      if (typeof dedupTuttiIFogli === 'function') {
        var r5 = dedupTuttiIFogli({ dryRun: false });
        result.dedup = (r5 && r5.totaleRimossi) || 0;
      }
    } catch(e) { result.dettagli.push({ azione: 'dedup', errore: e.message }); }
  }

  return result;
}

// ============================================================================
// AGENTE MA2 — QUALITY CHECK
// ============================================================================

function maQualityCheck() {
  var result = { ok: true, taggati: 0, qualityFix: 0, fontiAttivate: 0, dettagli: [] };

  // 1. Auto-tag contenuti senza MatrixDim
  try {
    if (typeof tagMatrixDimRetroattivo === 'function') {
      var r1 = tagMatrixDimRetroattivo({ target: 'all', batchSize: 100, dryRun: false });
      result.taggati = ((r1.items && r1.items.tagged) || 0) + ((r1.bandi && r1.bandi.tagged) || 0) + ((r1.podcast && r1.podcast.tagged) || 0);
      result.dettagli.push({ azione: 'tag_matrix', risultato: r1 });
    }
  } catch(e) { result.dettagli.push({ azione: 'tag_matrix', errore: e.message }); }

  // 2. Attiva fonti con campo vuoto
  try {
    if (typeof attivaFontiVuote === 'function') {
      var r2 = attivaFontiVuote();
      if (r2 && r2.perTipo) {
        Object.keys(r2.perTipo).forEach(function(t) {
          result.fontiAttivate += (r2.perTipo[t].attivate) || 0;
        });
      }
      result.dettagli.push({ azione: 'attiva_fonti_vuote', risultato: r2 });
    }
  } catch(e) { result.dettagli.push({ azione: 'attiva_fonti', errore: e.message }); }

  // 3. Quality check bandi (se disponibile)
  try {
    if (typeof qualityCheckBandiAutoDaily === 'function') {
      var r3 = qualityCheckBandiAutoDaily();
      result.qualityFix = (r3 && r3.fixed) || 0;
    }
  } catch(e) { result.dettagli.push({ azione: 'qc_bandi', errore: e.message }); }

  return result;
}

// ============================================================================
// AGENTE MA3 — AUDIT & ALERT
// ============================================================================

function maAuditAlert() {
  var result = { ok: true, problemiTrovati: 0, fogli: {}, agenti: {}, fonti: {}, dettagli: [] };

  // 1. Diagnostica fogli
  try {
    if (typeof diagnosticaFogli === 'function') {
      result.fogli = diagnosticaFogli();
    }
  } catch(e) { result.dettagli.push({ azione: 'diag_fogli', errore: e.message }); }

  // 2. Diagnostica agenti
  try {
    if (typeof diagnosticaAgenti === 'function') {
      result.agenti = diagnosticaAgenti();
    }
  } catch(e) { result.dettagli.push({ azione: 'diag_agenti', errore: e.message }); }

  // 3. Counter fonti
  try {
    if (typeof getFontiCounters === 'function') {
      var counters = getFontiCounters();
      result.fonti = (counters && counters.counters) || {};
      // Conta problemi
      if (result.fonti.silentiGenerale) result.problemiTrovati += result.fonti.silentiGenerale;
    }
  } catch(e) { result.dettagli.push({ azione: 'fonti_counters', errore: e.message }); }

  // 4. Verifica trigger attivi
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var triggerNames = triggers.map(function(t) { return t.getHandlerFunction(); });
    var expected = ['sasRun', 'sasRunWeekly', 'scanSources', 'scanFontiTutte', 'sendAgentEmails'];
    var missing = expected.filter(function(e) { return triggerNames.indexOf(e) < 0; });
    if (missing.length > 0) {
      result.problemiTrovati += missing.length;
      result.dettagli.push({ azione: 'trigger_mancanti', mancanti: missing });
    }
    result.triggerAttivi = triggerNames.length;
    result.triggerMancanti = missing;
  } catch(e) { result.dettagli.push({ azione: 'check_trigger', errore: e.message }); }

  return result;
}

// ============================================================================
// AGENTE MA4 — SCOPERTA FONTI
// ============================================================================

function maScopertaFonti() {
  var result = { ok: true, scoperte: 0, riclassificate: 0, approvate: 0, dettagli: [] };

  // 1. Esplorazione SEAS
  try {
    if (typeof seasExplore === 'function') {
      var r1 = seasExplore({ maxSeeds: 10 });
      result.scoperte = (r1 && r1.linkScoperti) || 0;
      result.dettagli.push({ azione: 'seas_explore', risultato: { seed: r1.seedVisitati, link: r1.linkScoperti } });
    }
  } catch(e) { result.dettagli.push({ azione: 'seas_explore', errore: e.message }); }

  // 2. Riclassifica score 0
  try {
    if (typeof seasReclassify === 'function') {
      var r2 = seasReclassify();
      result.riclassificate = (r2 && r2.riclassificati) || 0;
    }
  } catch(e) { result.dettagli.push({ azione: 'seas_reclassify', errore: e.message }); }

  // 3. Auto-approva score >= 80
  try {
    if (typeof seasApproveBatch === 'function') {
      var r3 = seasApproveBatch(80);
      result.approvate = (r3 && r3.approvate) || 0;
    }
  } catch(e) { result.dettagli.push({ azione: 'seas_approve', errore: e.message }); }

  return result;
}

// ============================================================================
// MONITORAGGIO PIATTAFORMA
// ============================================================================

/**
 * @private Raccoglie metriche di salute della piattaforma.
 */
function _sasMonitoraPiattaforma_() {
  var mon = {
    fontiTotali: 0, fontiAttive: 0, fontiSilenti: 0,
    bandiTotali: 0, bandiScaduti: 0, bandiNuovi7gg: 0,
    newsTotali: 0, newsNuove7gg: 0,
    sessioniTotali: 0, sessioniNuove7gg: 0,
    agentiAttivi: 0, agentiConRisultati: 0,
    scanFailRate: 0
  };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var now = new Date();
    var soglia7gg = new Date(now.getTime() - 7 * 86400000);

    // Fonti
    if (typeof getFontiCounters === 'function') {
      var fc = getFontiCounters();
      if (fc && fc.counters) {
        mon.fontiTotali = fc.counters.totaleGenerale || 0;
        mon.fontiSilenti = fc.counters.silentiGenerale || 0;
        ['bandi', 'news', 'podcast', 'video'].forEach(function(t) {
          if (fc.counters[t]) {
            mon.fontiAttive += fc.counters[t].attive || 0;
          }
        });
      }
    }

    // Bandi
    var shB = ss.getSheetByName('Bandi_v5');
    if (shB && shB.getLastRow() > 1) {
      var bVals = shB.getDataRange().getValues();
      var bHead = bVals[0];
      var iScad = bHead.indexOf('Scadenza');
      var iData = bHead.indexOf('DataRilevamento');
      var iStato = bHead.indexOf('StatoRecord');
      mon.bandiTotali = bVals.length - 1;
      for (var rb = 1; rb < bVals.length; rb++) {
        if (String(bVals[rb][iStato] || '').toLowerCase() === 'archiviato') continue;
        var scad = bVals[rb][iScad];
        if (scad && new Date(scad) < now) mon.bandiScaduti++;
        var dataRil = bVals[rb][iData];
        if (dataRil && new Date(dataRil) > soglia7gg) mon.bandiNuovi7gg++;
      }
    }

    // News
    var shN = ss.getSheetByName('Items');
    if (shN && shN.getLastRow() > 1) {
      mon.newsTotali = shN.getLastRow() - 1;
      var nVals = shN.getRange(Math.max(2, shN.getLastRow() - 100), 1, Math.min(100, shN.getLastRow() - 1), shN.getLastColumn()).getValues();
      var nHead = shN.getRange(1, 1, 1, shN.getLastColumn()).getValues()[0];
      var iNData = nHead.indexOf('DataPubblicazione');
      if (iNData >= 0) {
        nVals.forEach(function(r) {
          if (r[iNData] && new Date(r[iNData]) > soglia7gg) mon.newsNuove7gg++;
        });
      }
    }

    // Sessioni
    var shS = ss.getSheetByName('Sessioni_v1');
    if (shS && shS.getLastRow() > 1) {
      mon.sessioniTotali = shS.getLastRow() - 1;
      var sVals = shS.getDataRange().getValues();
      var sHead = sVals[0];
      var iSData = sHead.indexOf('created_at');
      if (iSData >= 0) {
        for (var rs = 1; rs < sVals.length; rs++) {
          if (sVals[rs][iSData] && new Date(sVals[rs][iSData]) > soglia7gg) mon.sessioniNuove7gg++;
        }
      }
    }

    // Agenti
    if (typeof diagnosticaAgenti === 'function') {
      try {
        var diag = diagnosticaAgenti();
        if (diag && diag.fonti_per_agente) {
          mon.agentiAttivi = Object.keys(diag.fonti_per_agente).filter(function(k) {
            return !isNaN(Number(k)) && diag.fonti_per_agente[k] > 0;
          }).length;
        }
        if (diag && diag.risultati_recenti) {
          mon.agentiConRisultati = diag.risultati_recenti.ultimi_7gg > 0 ? 1 : 0;
        }
      } catch(_) {}
    }

  } catch(e) {
    Logger.log('[SAS] Monitoraggio errore: ' + e.message);
  }

  return mon;
}

// ============================================================================
// KPI SETTIMANALI
// ============================================================================

/**
 * @private Calcola KPI aggregati per la settimana.
 */
function _sasCalcolaKPI_() {
  var mon = _sasMonitoraPiattaforma_();
  return {
    // Contenuti
    bandiAttivi: mon.bandiTotali - mon.bandiScaduti,
    bandiNuovi7gg: mon.bandiNuovi7gg,
    newsNuove7gg: mon.newsNuove7gg,
    // Fonti
    fontiAttive: mon.fontiAttive,
    fontiSilenti: mon.fontiSilenti,
    fontiHealthScore: mon.fontiTotali > 0 ? Math.round((1 - mon.fontiSilenti / mon.fontiTotali) * 100) : 0,
    // Utenti
    sessioniTotali: mon.sessioniTotali,
    sessioniNuove7gg: mon.sessioniNuove7gg,
    // Agenti
    agentiAttivi: mon.agentiAttivi,
    // Generale
    piattaformaHealthScore: _sasCalcolaHealthScore_(mon)
  };
}

/**
 * @private Calcola score di salute piattaforma 0-100.
 */
function _sasCalcolaHealthScore_(mon) {
  var score = 100;
  // Penalita fonti silenti
  if (mon.fontiSilenti > SAS_SOGLIE.FONTI_SILENTI_MAX) score -= 15;
  else if (mon.fontiSilenti > 5) score -= 5;
  // Penalita bandi scaduti non archiviati
  if (mon.bandiScaduti > SAS_SOGLIE.BANDI_SCADUTI_WARN) score -= 10;
  // Penalita nessun contenuto nuovo
  if (mon.bandiNuovi7gg === 0 && mon.newsNuove7gg === 0) score -= 20;
  else if (mon.bandiNuovi7gg + mon.newsNuove7gg < SAS_SOGLIE.CONTENUTI_SETTIMANA_MIN) score -= 10;
  // Bonus agenti attivi
  if (mon.agentiAttivi >= 5) score = Math.min(100, score + 5);
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// ANALISI TREND
// ============================================================================

/**
 * @private Analizza trend confrontando KPI con settimane precedenti.
 */
function _sasAnalizzaTrend_() {
  var trend = { contenuti: 'stabile', fonti: 'stabile', utenti: 'stabile', nota: '' };

  try {
    var sh = _sasGetOrCreateLog_();
    if (sh.getLastRow() < 2) return trend;

    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iTipo = head.indexOf('Tipo'), iKPI = head.indexOf('KPI_JSON'), iTs = head.indexOf('Timestamp');

    // Cerca ultimo report settimanale
    var ultimoKPI = null;
    for (var r = vals.length - 1; r >= 1; r--) {
      if (vals[r][iTipo] === 'settimanale' && vals[r][iKPI]) {
        try { ultimoKPI = JSON.parse(vals[r][iKPI]); break; } catch(_) {}
      }
    }

    if (!ultimoKPI) {
      trend.nota = 'Prima settimana, nessun confronto disponibile';
      return trend;
    }

    var kpiAttuali = _sasCalcolaKPI_();
    // Confronto contenuti
    var deltaBandi = kpiAttuali.bandiNuovi7gg - (ultimoKPI.bandiNuovi7gg || 0);
    var deltaNews = kpiAttuali.newsNuove7gg - (ultimoKPI.newsNuove7gg || 0);
    if (deltaBandi + deltaNews > 5) trend.contenuti = 'crescita';
    else if (deltaBandi + deltaNews < -5) trend.contenuti = 'calo';

    // Confronto fonti
    var deltaFonti = kpiAttuali.fontiHealthScore - (ultimoKPI.fontiHealthScore || 0);
    if (deltaFonti > 5) trend.fonti = 'miglioramento';
    else if (deltaFonti < -5) trend.fonti = 'peggioramento';

    // Confronto utenti
    var deltaSessioni = kpiAttuali.sessioniNuove7gg - (ultimoKPI.sessioniNuove7gg || 0);
    if (deltaSessioni > 2) trend.utenti = 'crescita';
    else if (deltaSessioni < -2) trend.utenti = 'calo';

  } catch(e) {
    trend.nota = 'Errore analisi trend: ' + e.message;
  }

  return trend;
}

// ============================================================================
// STRATEGIA E RACCOMANDAZIONI
// ============================================================================

/**
 * @private Elabora raccomandazioni strategiche basate su KPI e trend.
 */
function _sasElaboraStrategia_(kpi, trend) {
  var strategia = [];

  // Salute piattaforma
  if (kpi.piattaformaHealthScore < 60) {
    strategia.push({
      area: 'salute',
      priorita: 'alta',
      raccomandazione: 'Health score ' + kpi.piattaformaHealthScore + '/100. Intervento urgente su fonti silenti e contenuti mancanti.'
    });
  } else if (kpi.piattaformaHealthScore < 80) {
    strategia.push({
      area: 'salute',
      priorita: 'media',
      raccomandazione: 'Health score ' + kpi.piattaformaHealthScore + '/100. Monitorare fonti e frequenza contenuti.'
    });
  }

  // Fonti
  if (kpi.fontiSilenti > 5) {
    strategia.push({
      area: 'fonti',
      priorita: 'media',
      raccomandazione: kpi.fontiSilenti + ' fonti silenti. Verificare se i siti sono ancora attivi o se hanno cambiato URL RSS.'
    });
  }
  if (trend.fonti === 'peggioramento') {
    strategia.push({
      area: 'fonti',
      priorita: 'alta',
      raccomandazione: 'Qualita fonti in peggioramento rispetto alla settimana scorsa. Lanciare SEAS per scoprire fonti sostitutive.'
    });
  }

  // Contenuti
  if (kpi.bandiNuovi7gg === 0) {
    strategia.push({
      area: 'contenuti',
      priorita: 'alta',
      raccomandazione: 'Zero nuovi bandi questa settimana. Verificare scanner e fonti bandi.'
    });
  }
  if (trend.contenuti === 'calo') {
    strategia.push({
      area: 'contenuti',
      priorita: 'media',
      raccomandazione: 'Contenuti in calo rispetto alla settimana scorsa. Considerare aggiunta nuove fonti o ampliamento ambiti.'
    });
  }

  // Utenti
  if (kpi.sessioniNuove7gg > 0 && trend.utenti === 'crescita') {
    strategia.push({
      area: 'utenti',
      priorita: 'bassa',
      raccomandazione: 'Crescita utenti (+' + kpi.sessioniNuove7gg + ' nuove sessioni). Considerare espansione funzionalita workspace.'
    });
  }
  if (kpi.sessioniTotali > 10 && kpi.sessioniNuove7gg === 0) {
    strategia.push({
      area: 'utenti',
      priorita: 'media',
      raccomandazione: 'Nessun nuovo utente questa settimana. Valutare promozione sondaggi LS2 o outreach diretto.'
    });
  }

  // Agenti
  if (kpi.agentiAttivi < 5) {
    strategia.push({
      area: 'agenti',
      priorita: 'bassa',
      raccomandazione: 'Solo ' + kpi.agentiAttivi + '/5 agenti attivi. Verificare fonti mancanti per agenti inattivi.'
    });
  }

  return strategia;
}

// ============================================================================
// TELEGRAM ALERT
// ============================================================================

/**
 * @private Invia alert Telegram per problemi urgenti.
 */
function _sasInviaTelegramAlert_(report) {
  try {
    if (typeof _tgSend_ !== 'function') return;
    var msg = '🔧 *Supervisore Sinopia*\n\n';
    if (report.errori.length > 0) {
      msg += '❌ *Errori:*\n' + report.errori.map(function(e) { return '  • ' + e; }).join('\n') + '\n\n';
    }
    if (report.raccomandazioni.length > 0) {
      msg += '⚠️ *Raccomandazioni:*\n' + report.raccomandazioni.map(function(r) { return '  • ' + r; }).join('\n') + '\n\n';
    }
    if (report.azioni.length > 0) {
      msg += '✅ *Azioni eseguite:*\n' + report.azioni.map(function(a) { return '  • ' + a; }).join('\n');
    }
    _tgSend_(msg);
  } catch(e) {
    Logger.log('[SAS] Telegram alert fallito: ' + e.message);
  }
}

/**
 * @private Invia report settimanale dettagliato via Telegram.
 */
function _sasInviaReportSettimanale_(report) {
  try {
    if (typeof _tgSend_ !== 'function') return;
    var kpi = report.kpi || {};
    var msg = '📊 *Report Settimanale Sinopia*\n\n';
    msg += '*Health Score:* ' + (kpi.piattaformaHealthScore || '?') + '/100\n';
    msg += '*Bandi nuovi:* ' + (kpi.bandiNuovi7gg || 0) + ' | *News:* ' + (kpi.newsNuove7gg || 0) + '\n';
    msg += '*Fonti attive:* ' + (kpi.fontiAttive || 0) + ' | *Silenti:* ' + (kpi.fontiSilenti || 0) + '\n';
    msg += '*Utenti:* ' + (kpi.sessioniTotali || 0) + ' (+' + (kpi.sessioniNuove7gg || 0) + ' nuovi)\n';
    msg += '*Agenti:* ' + (kpi.agentiAttivi || 0) + '/5 attivi\n\n';

    if (report.strategia && report.strategia.length > 0) {
      msg += '*Raccomandazioni:*\n';
      report.strategia.forEach(function(s) {
        var icon = s.priorita === 'alta' ? '🔴' : s.priorita === 'media' ? '🟡' : '🟢';
        msg += icon + ' ' + s.raccomandazione + '\n';
      });
    }

    if (report.azioni.length > 0) {
      msg += '\n*Azioni completate:* ' + report.azioni.length;
    }

    _tgSend_(msg);
  } catch(e) {
    Logger.log('[SAS] Report settimanale Telegram fallito: ' + e.message);
  }
}

// ============================================================================
// LOG
// ============================================================================

function _sasGetOrCreateLog_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SAS_LOG_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(SAS_LOG_SHEET);
  sh.getRange(1, 1, 1, SAS_LOG_HEADERS.length).setValues([SAS_LOG_HEADERS])
    .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  return sh;
}

function _sasLogRun_(report) {
  try {
    var sh = _sasGetOrCreateLog_();
    var id = 'sas_' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMMdd_HHmm');
    sh.appendRow([
      id,
      new Date(),
      report.tipo,
      Object.keys(report.agenti || {}).join(','),
      report.errori.length === 0 ? 'ok' : 'warning',
      report.durataMs || 0,
      JSON.stringify(report.agenti || {}),
      report.azioni.join(' | '),
      report.raccomandazioni.join(' | '),
      JSON.stringify(report.kpi || {})
    ]);
  } catch(e) {
    Logger.log('[SAS] Log fallito: ' + e.message);
  }
}

// ============================================================================
// DIAGNOSTICA RAPIDA
// ============================================================================

/**
 * Report stato immediato del supervisore.
 */
function sasDiagnostica() {
  try {
    var out = { ok: true, timestamp: new Date().toISOString() };

    // Trigger attivi
    var triggers = ScriptApp.getProjectTriggers();
    out.triggerSAS = triggers.filter(function(t) {
      return t.getHandlerFunction() === 'sasRun' || t.getHandlerFunction() === 'sasRunWeekly';
    }).map(function(t) { return { fn: t.getHandlerFunction(), tipo: String(t.getEventType()) }; });

    // Ultimo log
    var sh = _sasGetOrCreateLog_();
    out.logRighe = sh.getLastRow() - 1;
    if (sh.getLastRow() > 1) {
      var lastRow = sh.getRange(sh.getLastRow(), 1, 1, SAS_LOG_HEADERS.length).getValues()[0];
      out.ultimoRun = { id: lastRow[0], timestamp: lastRow[1], tipo: lastRow[2], esito: lastRow[4] };
    }

    // KPI correnti
    out.kpi = _sasCalcolaKPI_();
    out.healthScore = out.kpi.piattaformaHealthScore;

    Logger.log('[SAS] Diagnostica: health=' + out.healthScore + '/100, trigger=' + out.triggerSAS.length + ', log=' + out.logRighe);
    return out;
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Legge un report archiviato per settimana.
 * @param {string} [settimana] — formato 'YYYY-MM-DD' del lunedi, default ultima
 */
function sasGetReport(settimana) {
  try {
    var sh = _sasGetOrCreateLog_();
    if (sh.getLastRow() < 2) return { ok: true, reports: [] };

    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var reports = [];
    for (var r = vals.length - 1; r >= 1 && reports.length < 10; r--) {
      if (settimana && vals[r][1]) {
        var rowDate = Utilities.formatDate(new Date(vals[r][1]), 'Europe/Rome', 'yyyy-MM-dd');
        if (rowDate < settimana) break;
      }
      reports.push({
        id: vals[r][0], timestamp: vals[r][1], tipo: vals[r][2],
        esito: vals[r][4], durata: vals[r][5],
        azioni: vals[r][7], raccomandazioni: vals[r][8],
        kpi: vals[r][9]
      });
    }
    return { ok: true, reports: reports };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// FINE AgentSupervisore.js
// ============================================================================
