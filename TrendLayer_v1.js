/**
 * ============================================================================
 *  TrendLayer_v1.js — L2 Trend Intelligence
 * ============================================================================
 *  v4.22 (2026-06-07)
 *  Autore: Silvano Straccini / Sinopia + Claude
 *
 *  SCOPO
 *  -----
 *  Aggrega occorrenze dal Knowledge Layer (L1) nel tempo per identificare:
 *  - Entita/temi in CRESCITA (momentum positivo)
 *  - Entita/temi in CALO (momentum negativo)
 *  - Serie storiche settimanali per cruscotto trend
 *  - Segnali di "rottura" (entita nuova che appare improvvisamente)
 *
 *  MODELLO
 *  -------
 *  Per ogni entita in Occorrenze:
 *    momentum = (occorrenze_settimana - media_4_settimane) / max(media_4_settimane, 1)
 *    momentum > 0 = in crescita, < 0 = in calo
 *    Se entita appare per la prima volta questa settimana = "emergente"
 *
 *  OUTPUT
 *  ------
 *  Foglio "Trend" con snapshot settimanali (id, entita_id, settimana, occ_settimana,
 *  media_4w, momentum, segnale). Aggiornato da trigger o manualmente.
 *
 *  FUNZIONI PUBBLICHE (menu Esegui GAS)
 *  -------------------------------------
 *  trendCalcola()       — calcola trend per la settimana corrente e salva nel foglio
 *  trendTop()           — ritorna le top entita in crescita/calo (per admin/editoriale)
 *  trendTest()          — dry-run: calcola e logga senza salvare
 *  trendSetupTrigger()  — installa trigger settimanale (domenica 17:00, prima dell'editoriale)
 *  trendReset()         — svuota foglio Trend
 *
 *  DIPENDENZE
 *  ----------
 *  - KnowledgeLayer_v1.js (fogli Entita + Occorrenze)
 *  - Constants.js (OC_EDITORIALE_CONFIG per finestre temporali)
 *
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

var OC_TREND_SHEET = 'Trend';
var OC_TREND_HEADERS = [
  'id', 'entita_id', 'nome_entita', 'tipo_entita', 'settimana',
  'occ_settimana', 'media_4w', 'momentum', 'segnale',
  'fonti_settimana', 'score_autorevolezza', 'data_calcolo'
];

// Segnali
var _TREND_SEGNALI = {
  EMERGENTE: 'emergente',    // prima apparizione questa settimana
  CRESCITA:  'crescita',     // momentum > 0.3
  STABILE:   'stabile',      // momentum tra -0.3 e 0.3
  CALO:      'calo',         // momentum < -0.3
  ESPLOSIVO: 'esplosivo'     // momentum > 2.0 (impennata)
};

// ============================================================================
// SETUP
// ============================================================================

function _trend_ss_() {
  return (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
}

function _trend_ensureSheet_() {
  var ss = _trend_ss_();
  var sh = ss.getSheetByName(OC_TREND_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_TREND_SHEET);
    sh.appendRow(OC_TREND_HEADERS);
    sh.getRange(1, 1, 1, OC_TREND_HEADERS.length)
      .setFontWeight('bold').setBackground('#1A1815').setFontColor('#fff');
    sh.setFrozenRows(1);
    Logger.log('[Trend] Foglio ' + OC_TREND_SHEET + ' creato');
  }
  return sh;
}

// ============================================================================
// CORE — CALCOLO TREND
// ============================================================================

/**
 * Calcola momentum per tutte le entita attive.
 * @param {Object} [opts] {dryRun: bool, settimana: 'YYYY-WNN'}
 * @return {Object} {ok, totale, emergenti, inCrescita, inCalo, esplosivi, dettagli[]}
 */
function _trend_calcola_(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var ss = _trend_ss_();

  // Leggi Occorrenze
  var shOcc = ss.getSheetByName('Occorrenze');
  if (!shOcc || shOcc.getLastRow() < 2) {
    return { ok: false, error: 'Foglio Occorrenze vuoto o assente. Lancia prima kbIngestAll.' };
  }

  // Leggi Entita (per nomi e tipi)
  var shEnt = ss.getSheetByName('Entita');
  if (!shEnt || shEnt.getLastRow() < 2) {
    return { ok: false, error: 'Foglio Entita vuoto o assente.' };
  }

  var now = new Date();
  var cfg = (typeof OC_EDITORIALE_CONFIG !== 'undefined') ? OC_EDITORIALE_CONFIG : { FINESTRA_SETTIMANA_GG: 7, FINESTRA_MEDIA_SETTIMANE: 4 };
  var soglia1w = new Date(now.getTime() - cfg.FINESTRA_SETTIMANA_GG * 86400000);
  var soglia4w = new Date(now.getTime() - cfg.FINESTRA_MEDIA_SETTIMANE * 7 * 86400000);
  var settimana = opts.settimana || _ed_isoWeek_(now);

  // Mappa entita
  var entVals = shEnt.getDataRange().getValues();
  var entH = entVals[0];
  var entMap = {};
  for (var er = 1; er < entVals.length; er++) {
    var eid = String(entVals[er][entH.indexOf('id')] || '');
    if (!eid || String(entVals[er][entH.indexOf('stato')] || '').indexOf('unito_in') === 0) continue;
    entMap[eid] = {
      nome: String(entVals[er][entH.indexOf('nome_canonico')] || ''),
      tipo: String(entVals[er][entH.indexOf('tipo')] || ''),
      score: Number(entVals[er][entH.indexOf('score_autorevolezza')] || 0),
      primaData: entVals[er][entH.indexOf('prima_data')] ? new Date(entVals[er][entH.indexOf('prima_data')]) : null
    };
  }

  // Conta occorrenze per entita: settimana corrente vs 4 settimane
  var occVals = shOcc.getDataRange().getValues();
  var occH = occVals[0];
  var iEntId = occH.indexOf('entita_id');
  var iData = occH.indexOf('data');
  var iFonte = occH.indexOf('fonte');
  var iFa = occH.indexOf('fonte_autorevole');

  var count1w = {}, count4w = {}, fonti1w = {};
  for (var r = 1; r < occVals.length; r++) {
    var entId = String(occVals[r][iEntId] || '');
    var dt = occVals[r][iData] ? new Date(occVals[r][iData]) : null;
    if (!entId || !dt || !entMap[entId]) continue;

    if (dt >= soglia4w) {
      count4w[entId] = (count4w[entId] || 0) + 1;
    }
    if (dt >= soglia1w) {
      count1w[entId] = (count1w[entId] || 0) + 1;
      // Fonti uniche della settimana
      if (!fonti1w[entId]) fonti1w[entId] = {};
      var fonte = String(occVals[r][iFonte] || '');
      if (fonte) fonti1w[entId][fonte] = true;
    }
  }

  // Calcola momentum e segnale per ogni entita con occorrenze questa settimana
  var risultati = [];
  for (var eid in count1w) {
    var ent = entMap[eid];
    if (!ent) continue;

    var occ1w = count1w[eid];
    var occ4w = count4w[eid] || occ1w;
    var media4w = occ4w / cfg.FINESTRA_MEDIA_SETTIMANE;
    var momentum = (media4w > 0) ? (occ1w - media4w) / media4w : (occ1w > 0 ? 1 : 0);
    momentum = Math.round(momentum * 100) / 100;

    // Determina segnale
    var segnale;
    var isNew = ent.primaData && ent.primaData >= soglia1w;
    if (isNew) {
      segnale = _TREND_SEGNALI.EMERGENTE;
    } else if (momentum > 2.0) {
      segnale = _TREND_SEGNALI.ESPLOSIVO;
    } else if (momentum > 0.3) {
      segnale = _TREND_SEGNALI.CRESCITA;
    } else if (momentum < -0.3) {
      segnale = _TREND_SEGNALI.CALO;
    } else {
      segnale = _TREND_SEGNALI.STABILE;
    }

    var fontiCount = fonti1w[eid] ? Object.keys(fonti1w[eid]).length : 0;

    risultati.push({
      entita_id: eid,
      nome: ent.nome,
      tipo: ent.tipo,
      occ_settimana: occ1w,
      media_4w: Math.round(media4w * 10) / 10,
      momentum: momentum,
      segnale: segnale,
      fonti_settimana: fontiCount,
      score: ent.score
    });
  }

  // Ordina per momentum decrescente (i più in crescita prima)
  risultati.sort(function(a, b) { return b.momentum - a.momentum; });

  // Statistiche
  var stats = {
    ok: true,
    settimana: settimana,
    totale: risultati.length,
    emergenti: risultati.filter(function(r) { return r.segnale === 'emergente'; }).length,
    esplosivi: risultati.filter(function(r) { return r.segnale === 'esplosivo'; }).length,
    inCrescita: risultati.filter(function(r) { return r.segnale === 'crescita'; }).length,
    stabili: risultati.filter(function(r) { return r.segnale === 'stabile'; }).length,
    inCalo: risultati.filter(function(r) { return r.segnale === 'calo'; }).length
  };

  // Salva nel foglio Trend (se non dry-run)
  if (!dryRun && risultati.length > 0) {
    var sh = _trend_ensureSheet_();
    var rows = risultati.map(function(r) {
      return [
        'TR' + Date.now() + Math.floor(Math.random() * 1000),
        r.entita_id,
        r.nome,
        r.tipo,
        settimana,
        r.occ_settimana,
        r.media_4w,
        r.momentum,
        r.segnale,
        r.fonti_settimana,
        r.score,
        now.toISOString()
      ];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, OC_TREND_HEADERS.length).setValues(rows);
    Logger.log('[Trend] Salvati ' + rows.length + ' record per settimana ' + settimana);
  }

  stats.dettagli = risultati.slice(0, 20); // top 20 per il log/ritorno
  return stats;
}

// ============================================================================
// QUERY — Top trend per admin/editoriale
// ============================================================================

/**
 * Ritorna le top entita in crescita e in calo per la settimana corrente.
 * Se il foglio Trend è vuoto, calcola al volo.
 * @param {Object} [opts] {limite: N, segnale: 'crescita'|'calo'|'emergente'|'esplosivo'}
 * @return {Object} {ok, settimana, crescita:[], calo:[], emergenti:[], esplosivi:[]}
 */
function _trend_top_(opts) {
  opts = opts || {};
  var limite = opts.limite || 10;
  var ss = _trend_ss_();
  var sh = ss.getSheetByName(OC_TREND_SHEET);
  var settimana = (typeof _ed_isoWeek_ === 'function') ? _ed_isoWeek_() : '';

  // Se foglio vuoto o nessun record per questa settimana, calcola al volo
  var needCalc = true;
  if (sh && sh.getLastRow() > 1) {
    var vals = sh.getDataRange().getValues();
    var iSett = vals[0].indexOf('settimana');
    for (var r = vals.length - 1; r >= 1; r--) {
      if (String(vals[r][iSett]) === settimana) { needCalc = false; break; }
    }
  }
  if (needCalc) {
    Logger.log('[Trend] Nessun dato per ' + settimana + ', calcolo al volo...');
    _trend_calcola_({ dryRun: false });
    sh = ss.getSheetByName(OC_TREND_SHEET);
  }

  if (!sh || sh.getLastRow() < 2) return { ok: true, settimana: settimana, crescita: [], calo: [], emergenti: [], esplosivi: [] };

  // Leggi record della settimana corrente
  var vals = sh.getDataRange().getValues();
  var H = vals[0];
  var iSett = H.indexOf('settimana');
  var items = [];
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][iSett]) !== settimana) continue;
    var obj = {};
    for (var c = 0; c < H.length; c++) obj[H[c]] = vals[r][c];
    obj.momentum = Number(obj.momentum || 0);
    items.push(obj);
  }

  items.sort(function(a, b) { return b.momentum - a.momentum; });

  return {
    ok: true,
    settimana: settimana,
    totale: items.length,
    crescita: items.filter(function(i) { return i.segnale === 'crescita' || i.segnale === 'esplosivo'; }).slice(0, limite),
    calo: items.filter(function(i) { return i.segnale === 'calo'; }).slice(0, limite),
    emergenti: items.filter(function(i) { return i.segnale === 'emergente'; }).slice(0, limite),
    esplosivi: items.filter(function(i) { return i.segnale === 'esplosivo'; }).slice(0, limite)
  };
}

// ============================================================================
// TRIGGER
// ============================================================================

function _trend_setupTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'trendCalcola') ScriptApp.deleteTrigger(t);
  });
  // Domenica 17:00 (1h prima dell'editoriale che è alle 18:00)
  ScriptApp.newTrigger('trendCalcola')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(17)
    .create();
  Logger.log('[Trend] Trigger settimanale installato: domenica 17:00');
  return { ok: true, giorno: 'domenica', ora: 17 };
}

// ============================================================================
// ENTRY POINT PUBBLICI (menu Esegui GAS)
// ============================================================================

/** Calcola trend per la settimana corrente e salva nel foglio */
function trendCalcola() {
  if (typeof _initLegacyConsts_ === 'function') _initLegacyConsts_();
  Logger.log('=== L2 TREND — CALCOLO SETTIMANALE ===');
  var r = _trend_calcola_({ dryRun: false });
  Logger.log('Risultato: ' + JSON.stringify({
    settimana: r.settimana, totale: r.totale,
    emergenti: r.emergenti, esplosivi: r.esplosivi,
    inCrescita: r.inCrescita, inCalo: r.inCalo
  }));
  if (r.dettagli && r.dettagli.length) {
    Logger.log('Top 5 momentum:');
    r.dettagli.slice(0, 5).forEach(function(d) {
      Logger.log('  ' + d.segnale.toUpperCase() + ' | ' + d.nome + ' (' + d.tipo + ') | occ=' + d.occ_settimana + ' media=' + d.media_4w + ' momentum=' + d.momentum);
    });
  }
  return r;
}

/** Ritorna top trend per admin/editoriale */
function trendTop(opts) {
  return _trend_top_(opts);
}

/** Dry-run: calcola senza salvare */
function trendTest() {
  if (typeof _initLegacyConsts_ === 'function') _initLegacyConsts_();
  Logger.log('=== L2 TREND TEST (dry-run) ===');
  var r = _trend_calcola_({ dryRun: true });
  Logger.log('Risultato dry-run:\n' + JSON.stringify(r, null, 2));
  return r;
}

/** Installa trigger settimanale (domenica 17:00) */
function trendSetupTrigger() {
  return _trend_setupTrigger_();
}

/** Svuota foglio Trend */
function trendReset() {
  var ss = _trend_ss_();
  var sh = ss.getSheetByName(OC_TREND_SHEET);
  if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  Logger.log('[Trend] Foglio svuotato. Rilancia trendCalcola per ripopolare.');
  return { ok: true };
}
