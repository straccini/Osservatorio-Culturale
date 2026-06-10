/**
 * ============================================================================
 *  OpinionLeader_v1.js — L3 Mappa Opinion Leader
 * ============================================================================
 *  v4.22 (2026-06-07)
 *  Autore: Silvano Straccini / Sinopia + Claude
 *
 *  SCOPO
 *  -----
 *  Identifica gli opinion leader del settore culturale/museale analizzando:
 *  - Chi viene citato di piu (occorrenze persona nel Knowledge Layer)
 *  - Da quante fonti diverse (diversita = autorevolezza)
 *  - Se citato da fonti autorevoli (Symbola, Fitzcarraldo, ecc.)
 *  - Il momentum (trend L2: chi sta crescendo in visibilita)
 *  - Le strutture associate (grafo persona ↔ struttura per co-occorrenza)
 *
 *  OUTPUT
 *  ------
 *  Foglio "OpinionLeader" con ranking: id, persona, strutture_associate,
 *  score_leader, n_occorrenze, n_fonti, n_fonti_autorevoli, momentum,
 *  ambiti, ultimo_contenuto, data_calcolo.
 *
 *  FUNZIONI PUBBLICHE (menu Esegui GAS)
 *  -------------------------------------
 *  leaderCalcola()      — calcola ranking e salva nel foglio
 *  leaderTop()          — ritorna top N leader (per admin/editoriale)
 *  leaderTest()         — dry-run: calcola e logga senza salvare
 *  leaderGrafo()        — ritorna grafo persona↔struttura
 *
 *  DIPENDENZE
 *  ----------
 *  - KnowledgeLayer_v1.js (fogli Entita + Occorrenze)
 *  - TrendLayer_v1.js (foglio Trend, opzionale — arricchisce con momentum)
 *
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

var OC_LEADER_SHEET = 'OpinionLeader';
var OC_LEADER_HEADERS = [
  'id', 'persona_id', 'nome', 'strutture_associate',
  'score_leader', 'n_occorrenze', 'n_fonti', 'n_fonti_autorevoli',
  'momentum', 'ambiti', 'ultimo_contenuto', 'data_calcolo'
];

// Pesi per lo score composito leader
var _LEADER_PESI = {
  occorrenze:       0.25,  // quante volte citato
  fonti:            0.25,  // da quante fonti diverse
  fontiAutorevoli:  0.25,  // quante fonti autorevoli lo citano
  momentum:         0.15,  // trend di crescita (da L2)
  diversitaAmbiti:  0.10   // in quanti ambiti tematici appare
};

// ============================================================================
// SETUP
// ============================================================================

function _leader_ss_() {
  return (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
}

function _leader_ensureSheet_() {
  var ss = _leader_ss_();
  var sh = ss.getSheetByName(OC_LEADER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_LEADER_SHEET);
    sh.appendRow(OC_LEADER_HEADERS);
    sh.getRange(1, 1, 1, OC_LEADER_HEADERS.length)
      .setFontWeight('bold').setBackground('#4A0E6B').setFontColor('#fff');
    sh.setFrozenRows(1);
    Logger.log('[Leader] Foglio ' + OC_LEADER_SHEET + ' creato');
  }
  return sh;
}

// ============================================================================
// CORE — CALCOLO RANKING + GRAFO
// ============================================================================

/**
 * Calcola ranking opinion leader e grafo persona↔struttura.
 * @param {Object} [opts] {dryRun: bool, limite: N}
 * @return {Object} {ok, totale, leader:[], grafo:[]}
 */
function _leader_calcola_(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var limite = opts.limite || 50;
  var ss = _leader_ss_();

  // --- Leggi Entita ---
  var shEnt = ss.getSheetByName('Entita');
  if (!shEnt || shEnt.getLastRow() < 2) return { ok: false, error: 'Foglio Entita vuoto. Lancia prima kbIngestAll.' };

  var entVals = shEnt.getDataRange().getValues();
  var entH = entVals[0];
  var col = function(n) { return entH.indexOf(n); };

  // Separa persone e strutture
  var persone = {}, strutture = {};
  for (var r = 1; r < entVals.length; r++) {
    var id = String(entVals[r][col('id')] || '');
    var tipo = String(entVals[r][col('tipo')] || '');
    var stato = String(entVals[r][col('stato')] || '');
    if (!id || stato.indexOf('unito_in') === 0) continue;

    var rec = {
      id: id,
      nome: String(entVals[r][col('nome_canonico')] || ''),
      tipo: tipo,
      nOcc: Number(entVals[r][col('n_occorrenze')] || 0),
      nFonti: Number(entVals[r][col('n_fonti')] || 0),
      score: Number(entVals[r][col('score_autorevolezza')] || 0),
      fontiJson: String(entVals[r][col('fonti_json')] || '[]'),
      ambitiJson: String(entVals[r][col('ambiti_json')] || '[]'),
      ultimaData: entVals[r][col('ultima_data')]
    };

    if (tipo === 'persona') persone[id] = rec;
    else if (tipo === 'struttura') strutture[id] = rec;
  }

  // --- Leggi Occorrenze per costruire il grafo persona↔struttura ---
  var shOcc = ss.getSheetByName('Occorrenze');
  var grafoMap = {};   // persona_id → {struttura_id: conteggio}
  var fontiAutoMap = {}; // persona_id → conteggio fonti autorevoli

  if (shOcc && shOcc.getLastRow() > 1) {
    var occVals = shOcc.getDataRange().getValues();
    var occH = occVals[0];
    var iEntId = occH.indexOf('entita_id');
    var iContId = occH.indexOf('contenuto_id');
    var iFa = occH.indexOf('fonte_autorevole');
    var iUltCont = occH.indexOf('titolo_contenuto');

    // Mappa contenuto_id → lista entita_id (per co-occorrenza)
    var contentEntities = {};
    for (var or = 1; or < occVals.length; or++) {
      var eId = String(occVals[or][iEntId] || '');
      var cId = String(occVals[or][iContId] || '');
      if (!eId || !cId) continue;
      if (!contentEntities[cId]) contentEntities[cId] = [];
      contentEntities[cId].push(eId);

      // Conta fonti autorevoli per persona
      if (persone[eId] && (occVals[or][iFa] === true || String(occVals[or][iFa]).toUpperCase() === 'TRUE')) {
        fontiAutoMap[eId] = (fontiAutoMap[eId] || 0) + 1;
      }
    }

    // Costruisci grafo: persona e struttura nello stesso contenuto = relazione
    for (var cId in contentEntities) {
      var entities = contentEntities[cId];
      var personInContent = entities.filter(function(e) { return !!persone[e]; });
      var structInContent = entities.filter(function(e) { return !!strutture[e]; });

      personInContent.forEach(function(pid) {
        if (!grafoMap[pid]) grafoMap[pid] = {};
        structInContent.forEach(function(sid) {
          grafoMap[pid][sid] = (grafoMap[pid][sid] || 0) + 1;
        });
      });
    }
  }

  // --- Leggi momentum da L2 (se disponibile) ---
  var momentumMap = {};
  try {
    var shTrend = ss.getSheetByName('Trend');
    if (shTrend && shTrend.getLastRow() > 1) {
      var tVals = shTrend.getDataRange().getValues();
      var tH = tVals[0];
      var iTeId = tH.indexOf('entita_id');
      var iMom = tH.indexOf('momentum');
      // Prendi l'ultimo record per ogni entita
      for (var tr = tVals.length - 1; tr >= 1; tr--) {
        var teId = String(tVals[tr][iTeId] || '');
        if (teId && !momentumMap[teId]) {
          momentumMap[teId] = Number(tVals[tr][iMom] || 0);
        }
      }
    }
  } catch (_) {}

  // --- Calcola score composito per ogni persona ---
  var leaders = [];
  var maxOcc = 1, maxFonti = 1, maxFa = 1;

  // Trova i massimi per normalizzazione
  for (var pid in persone) {
    var p = persone[pid];
    if (p.nOcc > maxOcc) maxOcc = p.nOcc;
    if (p.nFonti > maxFonti) maxFonti = p.nFonti;
    var fa = fontiAutoMap[pid] || 0;
    if (fa > maxFa) maxFa = fa;
  }

  for (var pid in persone) {
    var p = persone[pid];
    if (p.nOcc < 2) continue; // ignora persone citate una sola volta

    var nFa = fontiAutoMap[pid] || 0;
    var momentum = momentumMap[pid] || 0;
    var ambiti = [];
    try { ambiti = JSON.parse(p.ambitiJson); } catch (_) {}

    // Score normalizzato 0-100
    var scoreOcc = (p.nOcc / maxOcc) * 100;
    var scoreFonti = (p.nFonti / maxFonti) * 100;
    var scoreFa = (nFa / maxFa) * 100;
    var scoreMom = Math.min(Math.max((momentum + 1) * 50, 0), 100); // momentum -1..1 → 0..100
    var scoreAmbiti = Math.min(ambiti.length * 25, 100); // max 4 ambiti = 100

    var scoreLeader = Math.round(
      scoreOcc * _LEADER_PESI.occorrenze +
      scoreFonti * _LEADER_PESI.fonti +
      scoreFa * _LEADER_PESI.fontiAutorevoli +
      scoreMom * _LEADER_PESI.momentum +
      scoreAmbiti * _LEADER_PESI.diversitaAmbiti
    );

    // Strutture associate (dal grafo)
    var struttureAssoc = [];
    if (grafoMap[pid]) {
      var pairs = [];
      for (var sid in grafoMap[pid]) {
        if (strutture[sid]) pairs.push({ nome: strutture[sid].nome, count: grafoMap[pid][sid] });
      }
      pairs.sort(function(a, b) { return b.count - a.count; });
      struttureAssoc = pairs.slice(0, 3).map(function(s) { return s.nome; });
    }

    leaders.push({
      persona_id: pid,
      nome: p.nome,
      strutture: struttureAssoc,
      scoreLeader: scoreLeader,
      nOcc: p.nOcc,
      nFonti: p.nFonti,
      nFa: nFa,
      momentum: momentum,
      ambiti: ambiti,
      ultimoContenuto: p.ultimaData ? String(p.ultimaData) : ''
    });
  }

  // Ordina per score decrescente
  leaders.sort(function(a, b) { return b.scoreLeader - a.scoreLeader; });
  leaders = leaders.slice(0, limite);

  // --- Costruisci grafo output ---
  var grafoOutput = [];
  for (var pid in grafoMap) {
    if (!persone[pid]) continue;
    for (var sid in grafoMap[pid]) {
      if (!strutture[sid]) continue;
      grafoOutput.push({
        persona: persone[pid].nome,
        struttura: strutture[sid].nome,
        coOccorrenze: grafoMap[pid][sid]
      });
    }
  }
  grafoOutput.sort(function(a, b) { return b.coOccorrenze - a.coOccorrenze; });

  // --- Salva nel foglio ---
  if (!dryRun && leaders.length > 0) {
    var sh = _leader_ensureSheet_();
    // Svuota dati precedenti (snapshot, non storico)
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);

    var now = new Date().toISOString();
    var rows = leaders.map(function(l) {
      return [
        'LD' + Date.now() + Math.floor(Math.random() * 1000),
        l.persona_id,
        l.nome,
        l.strutture.join(', '),
        l.scoreLeader,
        l.nOcc,
        l.nFonti,
        l.nFa,
        Math.round(l.momentum * 100) / 100,
        l.ambiti.join(', '),
        l.ultimoContenuto,
        now
      ];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, OC_LEADER_HEADERS.length).setValues(rows);
    Logger.log('[Leader] Salvati ' + rows.length + ' leader nel foglio');
  }

  return {
    ok: true,
    totale: leaders.length,
    grafoRelazioni: grafoOutput.length,
    leader: leaders,
    grafo: grafoOutput.slice(0, 30) // top 30 relazioni
  };
}

// ============================================================================
// QUERY
// ============================================================================

/**
 * Ritorna top N opinion leader.
 * @param {Object} [opts] {limite: N}
 */
function _leader_top_(opts) {
  opts = opts || {};
  var limite = opts.limite || 15;
  var ss = _leader_ss_();
  var sh = ss.getSheetByName(OC_LEADER_SHEET);

  // Se foglio vuoto, calcola al volo
  if (!sh || sh.getLastRow() < 2) {
    Logger.log('[Leader] Foglio vuoto, calcolo al volo...');
    _leader_calcola_({ dryRun: false, limite: limite });
    sh = ss.getSheetByName(OC_LEADER_SHEET);
    if (!sh || sh.getLastRow() < 2) return { ok: true, leader: [] };
  }

  var vals = sh.getDataRange().getValues();
  var H = vals[0];
  var items = [];
  for (var r = 1; r < Math.min(vals.length, limite + 1); r++) {
    var obj = {};
    for (var c = 0; c < H.length; c++) obj[H[c]] = vals[r][c];
    items.push(obj);
  }

  return { ok: true, totale: items.length, leader: items };
}

/**
 * Ritorna il grafo persona↔struttura (ricalcola al volo).
 */
function _leader_grafo_() {
  var result = _leader_calcola_({ dryRun: true, limite: 100 });
  return { ok: true, grafo: result.grafo || [] };
}

// ============================================================================
// ENTRY POINT PUBBLICI (menu Esegui GAS)
// ============================================================================

/** Calcola ranking opinion leader e salva nel foglio */
function leaderCalcola() {
  if (typeof _initLegacyConsts_ === 'function') _initLegacyConsts_();
  Logger.log('=== L3 OPINION LEADER — CALCOLO RANKING ===');
  var r = _leader_calcola_({ dryRun: false });
  Logger.log('Risultato: ' + r.totale + ' leader, ' + r.grafoRelazioni + ' relazioni nel grafo');
  if (r.leader && r.leader.length) {
    Logger.log('Top 5 opinion leader:');
    r.leader.slice(0, 5).forEach(function(l) {
      Logger.log('  #' + l.scoreLeader + ' | ' + l.nome + ' | occ=' + l.nOcc + ' fonti=' + l.nFonti + ' fa=' + l.nFa + ' mom=' + l.momentum + ' | ' + l.strutture.join(', '));
    });
  }
  if (r.grafo && r.grafo.length) {
    Logger.log('Top 5 relazioni persona↔struttura:');
    r.grafo.slice(0, 5).forEach(function(g) {
      Logger.log('  ' + g.persona + ' ↔ ' + g.struttura + ' (' + g.coOccorrenze + ' co-occorrenze)');
    });
  }
  return r;
}

/** Ritorna top opinion leader */
function leaderTop(opts) {
  return _leader_top_(opts);
}

/** Dry-run: calcola e logga senza salvare */
function leaderTest() {
  if (typeof _initLegacyConsts_ === 'function') _initLegacyConsts_();
  Logger.log('=== L3 OPINION LEADER TEST (dry-run) ===');
  var r = _leader_calcola_({ dryRun: true });
  Logger.log('Risultato dry-run:\n' + JSON.stringify({
    totale: r.totale, grafoRelazioni: r.grafoRelazioni,
    top5: (r.leader || []).slice(0, 5).map(function(l) { return l.nome + ' (' + l.scoreLeader + ')'; }),
    top5grafo: (r.grafo || []).slice(0, 5).map(function(g) { return g.persona + '↔' + g.struttura; })
  }, null, 2));
  return r;
}

/** Ritorna grafo persona↔struttura */
function leaderGrafo() {
  return _leader_grafo_();
}
