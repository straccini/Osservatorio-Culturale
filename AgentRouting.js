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
function computeRelevanceScore(contenuto, museo, agent) {
  if (!contenuto || !museo) return 0;
  var score = 0;

  // 1. Match regionale (30 pt max)
  score += _matchRegionale_(contenuto, museo) * 30;

  // 2. Match dimensione gap (25 pt max)
  score += _matchDimensione_(contenuto, museo, agent) * 25;

  // 3. Match tipologia museo (20 pt max)
  score += _matchTipologia_(contenuto, museo) * 20;

  // 4. Match livello profilo (15 pt max)
  score += _matchProfilo_(contenuto, museo) * 15;

  // 5. Match priorità soggettive (10 pt max)
  score += _matchPriorita_(contenuto, museo) * 10;

  return Math.round(Math.min(100, Math.max(0, score)));
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

function _matchRegionale_(contenuto, museo) {
  if (!museo.regione) return 0.5; // no info = neutral
  var text = ((contenuto.titolo || '') + ' ' + (contenuto.sommario || '')).toLowerCase();
  var regione = museo.regione.toLowerCase();
  if (text.indexOf(regione) >= 0) return 1.0;
  if (text.indexOf('nazionale') >= 0 || text.indexOf('tutte le regioni') >= 0) return 0.7;
  if (text.indexOf('europeo') >= 0 || text.indexOf('eu') >= 0) return 0.6;
  return 0.3;
}

function _matchDimensione_(contenuto, museo, agent) {
  if (!museo.topGap || museo.topGap.length === 0) return 0.5;
  // Controlla se le dimensioni dell'agente sono tra i gap del museo
  var agentDims = agent.matrixDims || [];
  var overlap = agentDims.filter(function(d) { return museo.topGap.indexOf(d) >= 0; });
  if (overlap.length >= 2) return 1.0;
  if (overlap.length === 1) return 0.7;
  return 0.3;
}

function _matchTipologia_(contenuto, museo) {
  if (!museo.tipologia) return 0.5;
  var text = ((contenuto.titolo || '') + ' ' + (contenuto.sommario || '')).toLowerCase();
  var tipo = museo.tipologia.toLowerCase();
  // Match diretto
  if (text.indexOf(tipo) >= 0) return 1.0;
  // Match per categoria generica
  if (tipo.indexOf('civico') >= 0 && text.indexOf('comuni') >= 0) return 0.8;
  if (tipo.indexOf('fondazione') >= 0 && text.indexOf('fondazion') >= 0) return 0.8;
  if (tipo.indexOf('ecclesiastico') >= 0 && text.indexOf('ecclesiastic') >= 0) return 0.8;
  return 0.4;
}

function _matchProfilo_(contenuto, museo) {
  // Adatta livello contenuto al profilo museo
  var profilo = museo.profilo || 'P2';
  var score = Number((contenuto.score || contenuto.relevanceScore || 3));
  // P1/P5 (baseline) → preferisce contenuti base (score 1-3)
  if (profilo === 'P1' || profilo === 'P5') return score <= 3 ? 0.8 : 0.4;
  // P4 (avanzato) → preferisce contenuti avanzati (score 4-5)
  if (profilo === 'P4') return score >= 4 ? 0.8 : 0.4;
  // P2/P3 (medio) → neutral
  return 0.6;
}

function _matchPriorita_(contenuto, museo) {
  if (!museo.prioritaSoggettive || museo.prioritaSoggettive.length === 0) return 0.5;
  var tags = (contenuto.tags || contenuto.sommario || '').toLowerCase();
  var match = museo.prioritaSoggettive.some(function(p) {
    return tags.indexOf(p.toLowerCase()) >= 0;
  });
  return match ? 1.0 : 0.3;
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
  return items;
}
