/**
 * ============================================================================
 *  AgentRouting.js — Relevance scoring contenuto × museo (v4.18.55)
 * ----------------------------------------------------------------------------
 *  Calcola un punteggio 0-100 per ogni contenuto rispetto a ogni museo
 *  profilato, basandosi su: regione, dimensioni gap, tipologia, profilo P.
 *
 *  Funzioni pubbliche:
 *    computeRelevance(agenteId)    — batch: calcola score per tutti i contenuti nuovi
 *    getRelevantContent(email, agenteId, maxItems) — ritorna contenuti ordinati per score
 *    getMuseoProfile(email)        — ritorna profilo museo da ContactsMatrix + ResponsesMatrix
 *
 *  Dipendenze: AgentConfig.js, Matrix_v1.js (getMatrixReport)
 * ============================================================================
 */

// ============================================================================
// RELEVANCE SCORING
// ============================================================================

/**
 * Calcola relevance score per un contenuto rispetto a un profilo museo.
 *
 * Formula: 30×regione + 25×dimensione + 20×tipologia + 15×profilo + 10×priorita
 *
 * @param {Object} contenuto — {titolo, sommario, ambito, tags, tipo, fonte}
 * @param {Object} museo — {regione, tipologia, visitatori, profilo, topGap, prioritaSoggettive}
 * @param {Object} agent — config agente (da AgentConfig.js)
 * @return {number} 0-100
 */
/**
 * v4.18.68 — Sistema ibrido Deterministico + Semantico.
 *
 * FASE 1 (Hard Rules): filtri a sbarramento — se falliscono, score = 0.
 *   - Controllo geografico: bando regionale esclude musei fuori regione.
 *   - Controllo beneficiari: forma giuridica museo deve essere tra beneficiari_ammessi.
 *
 * FASE 2 (Soft Rules): scoring semantico (solo se hard rules superate).
 *   - regione, dimensione gap, tipologia, profilo, priorita soggettive.
 *
 * Tutti i campi null-safe con fallback conservativi.
 */
function computeRelevanceScore(contenuto, museo, agent) {
  if (!contenuto || !museo) return 0;

  // ── FASE 1: Hard Rules (sbarramento) ──

  // 1a. Controllo geografico
  var geoResult = _hardRuleGeografia_(contenuto, museo);
  if (geoResult === 0) return 0;

  // 1b. Controllo beneficiari
  var benResult = _hardRuleBeneficiari_(contenuto, museo);
  if (benResult === 0) return 0;

  // ── FASE 2: Soft Rules (scoring semantico) ──
  var score = 0;

  // 2a. Match regionale soft (30 pt max) — gia filtrato da hard rule, qui affina
  score += (_matchRegionale_(contenuto, museo) || 0) * 30;

  // 2b. Match dimensione gap (25 pt max)
  score += (_matchDimensione_(contenuto, museo, agent) || 0) * 25;

  // 2c. Match tipologia museo (20 pt max)
  score += (_matchTipologia_(contenuto, museo) || 0) * 20;

  // 2d. Match livello profilo (15 pt max)
  score += (_matchProfilo_(contenuto, museo) || 0) * 15;

  // 2e. Match priorità soggettive (10 pt max)
  score += (_matchPriorita_(contenuto, museo) || 0) * 10;

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ============================================================================
// HARD RULES (filtri a sbarramento, ritornano 0 o 1)
// ============================================================================

/**
 * Controllo geografico: se il bando e regionale e il museo e in altra regione → 0.
 * Se dati mancanti → 1 (conservativo, "Da verificare").
 */
function _hardRuleGeografia_(contenuto, museo) {
  var bandoTerritorio = String(contenuto.territorio || '').toLowerCase().trim();
  var bandoRegione = String(contenuto.regione || '').toLowerCase().trim();
  var bandoLivello = String(contenuto.livello || '').toLowerCase().trim();
  var museoRegione = String(museo.regione || '').toLowerCase().trim();

  // Se il bando non ha territorio/livello → conservativo, passa
  if (!bandoTerritorio && !bandoRegione && !bandoLivello) return 1;
  // Se il museo non ha regione → conservativo, passa
  if (!museoRegione) return 1;

  // Bando nazionale/EU → sempre passa
  var territorio = bandoTerritorio || bandoLivello;
  if (/\b(nazionale|europeo|vari)\b/.test(territorio) || territorio === 'eu' || territorio === 'ue') return 1;

  // Bando regionale: deve matchare la regione museo
  var regioneBando = bandoRegione || bandoTerritorio || bandoLivello;
  if (regioneBando && regioneBando !== museoRegione) {
    // Verifica anche regioni confinanti (tolleranza)
    if (typeof _isRegioneConfinante_ === 'function' && _isRegioneConfinante_(museoRegione, regioneBando)) {
      return 1; // confinante, passa
    }
    return 0; // fuori regione, sbarramento
  }
  return 1;
}

/**
 * Controllo beneficiari: se il bando ha beneficiari_ammessi e la tipologia museo non e inclusa → 0.
 * Se dati mancanti → 1 (conservativo).
 */
function _hardRuleBeneficiari_(contenuto, museo) {
  var beneficiari = contenuto.beneficiari_ammessi;
  if (!Array.isArray(beneficiari) || beneficiari.length === 0) return 1; // no filtro, passa

  var tipologia = String(museo.tipologia || '').toLowerCase().trim();
  var natura = String(museo.natura || '').toLowerCase().trim();
  if (!tipologia && !natura) return 1; // museo senza tipologia, conservativo

  // Cerca match tra tipologia/natura museo e beneficiari ammessi
  var found = beneficiari.some(function(b) {
    var bl = String(b).toLowerCase();
    // Match diretto
    if (tipologia && bl.indexOf(tipologia) >= 0) return true;
    if (natura && bl.indexOf(natura) >= 0) return true;
    // Match per categorie ampie
    if (bl.indexOf('tutti') >= 0 || bl.indexOf('qualsiasi') >= 0) return true;
    if (bl.indexOf('enti pubblici') >= 0 && (natura.indexOf('pubblic') >= 0 || natura.indexOf('comunale') >= 0)) return true;
    if (bl.indexOf('enti locali') >= 0 && natura.indexOf('comunale') >= 0) return true;
    if (bl.indexOf('comuni') >= 0 && natura.indexOf('comunale') >= 0) return true;
    if (bl.indexOf('fondazion') >= 0 && natura.indexOf('fondazione') >= 0) return true;
    if (bl.indexOf('associazion') >= 0 && natura.indexOf('associazione') >= 0) return true;
    if (bl.indexOf('impres') >= 0 && natura.indexOf('privat') >= 0) return true;
    if (bl.indexOf('musei') >= 0 || bl.indexOf('museo') >= 0) return true; // musei sempre ammessi
    return false;
  });

  return found ? 1 : 0;
}

// ============================================================================
// CONTENUTI RILEVANTI PER UN MUSEO
// ============================================================================

/**
 * Ritorna contenuti ordinati per relevance per un museo specifico.
 *
 * @param {string} email — email museo (lookup in ContactsMatrix)
 * @param {number} agenteId — 1-5
 * @param {number} [maxItems] — max contenuti da ritornare (default: 10)
 * @return {Object} {ok, items: [{titolo, url, sommario, relevanceScore, badge}], museo}
 */
function getRelevantContent(email, agenteId, maxItems) {
  maxItems = maxItems || 10;
  try {
    var agent = getAgentConfig(agenteId);
    if (!agent) return { ok: false, error: 'Agente non trovato' };

    var museo = getMuseoProfile(email);
    var contenuti = _loadAgentContent_(agenteId);

    if (!museo || !museo.found) {
      // Museo non profilato: ritorna contenuti recenti senza scoring
      var recent = contenuti.slice(0, maxItems).map(function(c) {
        return { titolo: c.titolo, url: c.url, sommario: c.sommario, relevanceScore: 50, badge: '' };
      });
      return { ok: true, items: recent, museo: null, note: 'profilo non disponibile, contenuti generici' };
    }

    // Calcola score per ogni contenuto
    var scored = contenuti.map(function(c) {
      var rs = computeRelevanceScore(c, museo, agent);
      return {
        titolo: c.titolo,
        url: c.url,
        sommario: c.sommario,
        data: c.data,
        fonte: c.fonte,
        ambito: c.ambito,
        relevanceScore: rs,
        badge: rs >= 70 ? 'Consigliato per te' : ''
      };
    });

    // Filtra score >= 40 e ordina decrescente
    scored = scored.filter(function(s) { return s.relevanceScore >= 40; });
    scored.sort(function(a, b) { return b.relevanceScore - a.relevanceScore; });
    // v4.24 — Dedup fuzzy post-scoring (rimuove titoli simili dopo ordinamento per rilevanza)
    scored = _dedupFuzzyByTitle_(scored);

    return { ok: true, items: scored.slice(0, maxItems), museo: museo };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// PROFILO MUSEO
// ============================================================================

/**
 * Recupera profilo museo da ContactsMatrix + ResponsesMatrix.
 *
 * @param {string} email
 * @return {Object|null} {found, email, regione, tipologia, visitatori, profilo, topGap[], prioritaSoggettive[], scoreDimensions{}}
 */
function getMuseoProfile(email) {
  if (!email) return null;
  email = email.toLowerCase().trim();

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

    // 1. Trova responseId da ContactsMatrix
    var contactSheet = ss.getSheetByName('ContactsMatrix');
    if (!contactSheet || contactSheet.getLastRow() < 2) return { found: false };

    var cData = contactSheet.getDataRange().getValues();
    var cHead = cData[0];
    var iEmail = cHead.indexOf('email');
    var iRespId = cHead.indexOf('response_id');
    var responseId = null;

    for (var r = 1; r < cData.length; r++) {
      if (String(cData[r][iEmail] || '').toLowerCase().trim() === email) {
        responseId = cData[r][iRespId];
        break;
      }
    }
    if (!responseId) return { found: false };

    // 2. Trova risposta da ResponsesMatrix
    var respSheet = ss.getSheetByName('ResponsesMatrix');
    if (!respSheet || respSheet.getLastRow() < 2) return { found: false };

    var rData = respSheet.getDataRange().getValues();
    var rHead = rData[0];
    var iRid = rHead.indexOf('response_id');
    var iProfile = rHead.indexOf('museum_profile_json');
    var iScoring = rHead.indexOf('scoring_dimensions_json');
    var iTop3 = rHead.indexOf('top3_opportunities_json');
    var iProfileAssigned = rHead.indexOf('profile_assigned');

    var profile = null;
    for (var r2 = 1; r2 < rData.length; r2++) {
      if (rData[r2][iRid] === responseId) {
        var museumProfileJson = rData[r2][iProfile] || '{}';
        var scoringJson = rData[r2][iScoring] || '{}';
        var top3Json = rData[r2][iTop3] || '[]';
        var museumProfile, scoring, top3;
        try { museumProfile = JSON.parse(museumProfileJson); } catch(_) { museumProfile = {}; }
        try { scoring = JSON.parse(scoringJson); } catch(_) { scoring = {}; }
        try { top3 = JSON.parse(top3Json); } catch(_) { top3 = []; }

        profile = {
          found: true,
          email: email,
          responseId: responseId,
          regione: museumProfile.regione || museumProfile.A4 || '',
          tipologia: museumProfile.tipologia || museumProfile.A1 || '',
          visitatori: museumProfile.visitatori || museumProfile.A3 || '',
          natura: museumProfile.natura || museumProfile.A2 || '',
          profilo: rData[r2][iProfileAssigned] || 'P2',
          scoreDimensions: scoring,
          topGap: top3.map(function(t) { return t.dimensionCode || ''; }),
          prioritaSoggettive: []  // da section11 se disponibile
        };
        break;
      }
    }

    return profile || { found: false };
  } catch(e) {
    Logger.log('getMuseoProfile errore: ' + e.message);
    return { found: false, error: e.message };
  }
}

// ============================================================================
// HELPER: Match functions (ritornano 0.0 - 1.0)
// ============================================================================

// v4.18.68 — Tutti i match helper blindati contro null/undefined

function _matchRegionale_(contenuto, museo) {
  try {
    if (!museo || !museo.regione) return 0.5;
    var text = (String(contenuto.titolo || '') + ' ' + String(contenuto.sommario || '') + ' ' + String(contenuto.territorio || '')).toLowerCase();
    var regione = String(museo.regione).toLowerCase();
    if (text.indexOf(regione) >= 0) return 1.0;
    if (text.indexOf('nazionale') >= 0 || text.indexOf('tutte le regioni') >= 0) return 0.7;
    if (text.indexOf('europeo') >= 0 || text.indexOf('eu') >= 0) return 0.6;
    return 0.3;
  } catch(_) { return 0.5; }
}

function _matchDimensione_(contenuto, museo, agent) {
  try {
    if (!museo || !museo.topGap || !Array.isArray(museo.topGap) || museo.topGap.length === 0) return 0.5;
    var agentDims = (agent && Array.isArray(agent.matrixDims)) ? agent.matrixDims : [];
    if (agentDims.length === 0) return 0.5;
    var overlap = agentDims.filter(function(d) { return museo.topGap.indexOf(d) >= 0; });
    if (overlap.length >= 2) return 1.0;
    if (overlap.length === 1) return 0.7;
    return 0.3;
  } catch(_) { return 0.5; }
}

function _matchTipologia_(contenuto, museo) {
  try {
    if (!museo || !museo.tipologia) return 0.5;
    var text = (String(contenuto.titolo || '') + ' ' + String(contenuto.sommario || '') + ' ' + String(contenuto.soggetti || '')).toLowerCase();
    var tipo = String(museo.tipologia).toLowerCase();
    if (text.indexOf(tipo) >= 0) return 1.0;
    if (tipo.indexOf('civico') >= 0 && text.indexOf('comuni') >= 0) return 0.8;
    if (tipo.indexOf('fondazione') >= 0 && text.indexOf('fondazion') >= 0) return 0.8;
    if (tipo.indexOf('ecclesiastico') >= 0 && text.indexOf('ecclesiastic') >= 0) return 0.8;
    return 0.4;
  } catch(_) { return 0.5; }
}

function _matchProfilo_(contenuto, museo) {
  try {
    var profilo = (museo && museo.profilo) ? String(museo.profilo) : 'P2';
    var score = Number(contenuto.score || contenuto.relevanceScore || 0) || 3;
    if (profilo === 'P1' || profilo === 'P5') return score <= 3 ? 0.8 : 0.4;
    if (profilo === 'P4') return score >= 4 ? 0.8 : 0.4;
    return 0.6;
  } catch(_) { return 0.5; }
}

function _matchPriorita_(contenuto, museo) {
  try {
    if (!museo || !Array.isArray(museo.prioritaSoggettive) || museo.prioritaSoggettive.length === 0) return 0.5;
    var tags = String(contenuto.tags || contenuto.sommario || '').toLowerCase();
    if (!tags) return 0.5;
    var match = museo.prioritaSoggettive.some(function(p) {
      return p && tags.indexOf(String(p).toLowerCase()) >= 0;
    });
    return match ? 1.0 : 0.3;
  } catch(_) { return 0.5; }
}

// ============================================================================
// HELPER: Load contenuti agente
// ============================================================================

function _loadAgentContent_(agenteId) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('AgentScanResults');
  if (!sh || sh.getLastRow() < 2) return [];

  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iAg = headers.indexOf('AgenteID');
  var iTit = headers.indexOf('Titolo');
  var iUrl = headers.indexOf('URL');
  var iSomm = headers.indexOf('SommarioAI');
  var iData = headers.indexOf('DataPubblicazione');
  var iFonte = headers.indexOf('FonteNome');
  var iAmb = headers.indexOf('Ambito');
  var iScore = headers.indexOf('Score');
  var iArch = headers.indexOf('Archiviato');

  var items = [];
  for (var r = 1; r < data.length; r++) {
    if (Number(data[r][iAg]) !== agenteId) continue;
    if (data[r][iArch] === true) continue;
    items.push({
      titolo: data[r][iTit] || '',
      url: data[r][iUrl] || '',
      sommario: data[r][iSomm] || '',
      data: data[r][iData] || '',
      fonte: data[r][iFonte] || '',
      ambito: Number(data[r][iAmb]) || 0,
      score: Number(data[r][iScore]) || 3
    });
  }
  // Ordina per data decrescente
  items.sort(function(a, b) { return String(b.data).localeCompare(String(a.data)); });
  // v4.24 — Dedup fuzzy: rimuove contenuti con titoli troppo simili (Jaccard > 0.65)
  items = _dedupFuzzyByTitle_(items);
  return items;
}

/**
 * v4.24 — Deduplicazione fuzzy per titoli simili.
 * Confronta ogni coppia tramite similarità Jaccard sulle parole.
 * Se due titoli condividono >65% delle parole, tiene solo il primo (più recente).
 * Usata da _loadAgentContent_, getRelevantContent, buildTematicDigest.
 *
 * @param {Array} items — array con proprietà .titolo
 * @param {number} [threshold] — soglia Jaccard 0.0-1.0 (default 0.65)
 * @return {Array} items deduplicati
 */
function _dedupFuzzyByTitle_(items, threshold) {
  threshold = threshold || 0.65;
  if (!items || items.length < 2) return items || [];

  // Parole significative: rimuove stopword e parole < 3 caratteri
  var STOPWORDS = { 'il':1,'lo':1,'la':1,'le':1,'li':1,'gli':1,'un':1,'una':1,'uno':1,
    'di':1,'del':1,'dei':1,'del':1,'della':1,'delle':1,'dello':1,'degli':1,
    'da':1,'dal':1,'dai':1,'dalla':1,'dalle':1,'dallo':1,'dagli':1,
    'in':1,'nel':1,'nei':1,'nella':1,'nelle':1,'nello':1,'negli':1,
    'a':1,'al':1,'ai':1,'alla':1,'alle':1,'allo':1,'agli':1,
    'con':1,'su':1,'sul':1,'sui':1,'sulla':1,'sulle':1,'sullo':1,'sugli':1,
    'per':1,'tra':1,'fra':1,'e':1,'ed':1,'o':1,'ma':1,'che':1,
    'the':1,'of':1,'and':1,'for':1,'to':1,'in':1,'a':1,'an':1,'on':1,'at':1,'by':1,
    'news':1 };

  function _getWords(title) {
    return String(title || '').toLowerCase()
      .replace(/[–—:;,.!?\(\)\[\]\"\'«»]/g, ' ')
      .split(/\s+/)
      .filter(function(w) { return w.length >= 3 && !STOPWORDS[w]; });
  }

  function _jaccard(wordsA, wordsB) {
    if (!wordsA.length && !wordsB.length) return 1;
    if (!wordsA.length || !wordsB.length) return 0;
    var setB = {};
    wordsB.forEach(function(w) { setB[w] = true; });
    var intersection = 0;
    var setA = {};
    wordsA.forEach(function(w) {
      setA[w] = true;
      if (setB[w]) intersection++;
    });
    var union = Object.keys(setA).length + Object.keys(setB).length - intersection;
    return union > 0 ? intersection / union : 0;
  }

  var result = [];
  var wordCache = items.map(function(it) { return _getWords(it.titolo); });

  for (var i = 0; i < items.length; i++) {
    var dominated = false;
    for (var j = 0; j < result.length; j++) {
      var jIdx = result[j]._origIdx;
      if (_jaccard(wordCache[i], wordCache[jIdx]) >= threshold) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      items[i]._origIdx = i;
      result.push(items[i]);
    }
  }

  // Pulisci indice temporaneo
  result.forEach(function(it) { delete it._origIdx; });
  return result;
}

/**
 * v4.24 — Jaccard similarity tra due stringhe titolo (utility per dedup sheet-level).
 * Usata da dedupItemsByFingerprint (Bandi_v5.js) per dedup fuzzy a livello dati.
 *
 * @param {string} titleA
 * @param {string} titleB
 * @return {number} 0.0-1.0
 */
// ============================================================================
// v4.25 — Contenuti agenti unificati per digest martedì
// ============================================================================

/**
 * Raccoglie i migliori contenuti da TUTTI gli agenti per un utente.
 * Usata dal digest unificato del martedì per integrare i contenuti agenti
 * nelle sezioni del digest Matrix personalizzato.
 *
 * @param {string} email
 * @param {number} [maxPerAgent] — max contenuti per agente (default 3)
 * @return {Object} { ok, byAgent: {AG1: {agent, items}, ...}, allItems: [], museo }
 */
function getAllAgentContentForUser(email, maxPerAgent) {
  maxPerAgent = maxPerAgent || 3;
  try {
    if (typeof OC_AGENTI === 'undefined' || !OC_AGENTI) return { ok:false, error:'OC_AGENTI non definito' };

    var museo = (typeof getMuseoProfile === 'function') ? getMuseoProfile(email) : null;
    var byAgent = {};
    var allItems = [];

    OC_AGENTI.forEach(function(agent) {
      var relevant = getRelevantContent(email, agent.id, maxPerAgent);
      var items = (relevant && relevant.ok && relevant.items) ? relevant.items : [];
      // Arricchisci ogni item con info agente per rendering
      items.forEach(function(it) {
        it.agentId = agent.id;
        it.agentCodice = agent.codice;
        it.agentNome = agent.nome;
        it.agentNomeBreve = agent.nomeBreve;
        it.agentColor = agent.color;
        it.agentIcon = agent.icon;
      });
      if (items.length > 0) {
        byAgent[agent.codice] = { agent: agent, items: items };
        allItems = allItems.concat(items);
      }
    });

    // Dedup fuzzy globale (cross-agente)
    allItems = _dedupFuzzyByTitle_(allItems);

    return { ok: true, byAgent: byAgent, allItems: allItems, museo: museo };
  } catch(e) {
    Logger.log('getAllAgentContentForUser errore: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Filtra contenuti agenti rimuovendo quelli già presenti nelle sezioni Matrix.
 * Confronto fuzzy Jaccard (soglia 0.65) contro i titoli già inclusi.
 *
 * @param {Array} agentItems — array con .titolo
 * @param {Array} matrixTitles — array di stringhe titolo già nel digest Matrix
 * @return {Array} agentItems filtrati (senza duplicati vs Matrix)
 */
function _dedupAgentVsMatrix_(agentItems, matrixTitles) {
  if (!agentItems || !agentItems.length || !matrixTitles || !matrixTitles.length) return agentItems || [];
  return agentItems.filter(function(it) {
    var titA = String(it.titolo || '').trim().toLowerCase();
    if (!titA) return true;
    for (var i = 0; i < matrixTitles.length; i++) {
      if (_dedupFuzzyJaccard_(titA, String(matrixTitles[i]).trim().toLowerCase()) >= 0.65) {
        return false; // duplicato vs Matrix, escludi
      }
    }
    return true;
  });
}

function _dedupFuzzyJaccard_(titleA, titleB) {
  var STOPWORDS = { 'il':1,'lo':1,'la':1,'le':1,'li':1,'gli':1,'un':1,'una':1,'uno':1,
    'di':1,'del':1,'dei':1,'della':1,'delle':1,'dello':1,'degli':1,
    'da':1,'dal':1,'dai':1,'dalla':1,'dalle':1,'dallo':1,'dagli':1,
    'in':1,'nel':1,'nei':1,'nella':1,'nelle':1,'nello':1,'negli':1,
    'a':1,'al':1,'ai':1,'alla':1,'alle':1,'allo':1,'agli':1,
    'con':1,'su':1,'sul':1,'sui':1,'sulla':1,'sulle':1,'sullo':1,'sugli':1,
    'per':1,'tra':1,'fra':1,'e':1,'ed':1,'o':1,'ma':1,'che':1,
    'the':1,'of':1,'and':1,'for':1,'to':1,'in':1,'a':1,'an':1,'on':1,'at':1,'by':1,
    'news':1 };
  function _w(t) {
    return String(t||'').toLowerCase().replace(/[–—:;,.!?\(\)\[\]\"\'«»]/g,' ')
      .split(/\s+/).filter(function(w){ return w.length >= 3 && !STOPWORDS[w]; });
  }
  var wA = _w(titleA), wB = _w(titleB);
  if (!wA.length && !wB.length) return 1;
  if (!wA.length || !wB.length) return 0;
  var setB = {}; wB.forEach(function(w){ setB[w]=true; });
  var setA = {}; var inter = 0;
  wA.forEach(function(w){ setA[w]=true; if(setB[w]) inter++; });
  var union = Object.keys(setA).length + Object.keys(setB).length - inter;
  return union > 0 ? inter / union : 0;
}
