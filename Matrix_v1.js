/**
 * ============================================================================
 *  Matrix_v1.gs — Backend MuseMu Matrix per Osservatorio Culturale
 * ============================================================================
 *  Sprint 2 (2026-04-30)
 *  Autore: Silvano Straccini / Duemilamusei
 *
 *  SCOPO
 *  -----
 *  Espone al frontend (webapp OC) le 4 funzioni chiave del modulo MuseMu Matrix:
 *    - getMatrixSchema()         → schema delle 43 domande (consumato dal renderer)
 *    - saveMatrixResponse(data)  → salva risposte anonime nel foglio ResponsesMatrix
 *    - calcMatrixScoring(id)     → calcola scoring 0-100 per dimensione + profilo P1-P5
 *    - getMatrixReport(id)       → ritorna pacchetto dati per rendering report finale
 *    - saveMatrixContact(data)   → salva opt-in follow-up in tabella separata (privacy)
 *
 *  PRIVACY
 *  -------
 *  Architettura dati a due tabelle disaccoppiate:
 *    - ResponsesMatrix (anonima, UUID)
 *    - ContactsMatrix (opt-in separato, collegato via response_id)
 *  GDPR-compliant: nessun dato personale obbligatorio nelle risposte.
 *
 *  DIPENDENZE
 *  ----------
 *    - Matrix_schema.gs (variabile globale OC_MATRIX_SCHEMA)
 *    - Codice.gs (getMainSS, getMainSpreadsheetId)
 *
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================
var OC_MATRIX_RESPONSES_SHEET = 'ResponsesMatrix';
var OC_MATRIX_CONTACTS_SHEET  = 'ContactsMatrix';
var OC_MATRIX_VERSION         = 'v1.0.2';

// Headers fogli (ordinati)
var OC_MATRIX_RESPONSES_HEADERS = [
  'response_id',           // UUID univoco
  'timestamp_inizio',      // ISO 8601
  'timestamp_fine',        // ISO 8601
  'model_version',         // es. "v1.0.2"
  'museum_profile_json',   // anagrafica (5 campi anonimi)
  'museum_name',           // optional, può essere vuoto
  'responses_json',        // tutte le 43 risposte
  'section11_json',        // auto-prioritizzazione
  'tooltip_opened_json',   // lista codici domande con tooltip aperti
  'scoring_dimensions_json', // {D1: 75, D2: 60, ...}
  'profile_assigned',      // P1..P5
  'top3_opportunities_json', // [{code,score,name,...}, ...]
  'synthetic_score',       // numero
  'time_per_question_json',// {D1.1: 12, D1.2: 8, ...} secondi
  'consistency_flags_json',// flag interni (mai esposti al compilatore)
  'user_agent_hash',       // hash anonimo per analytics
  'completion_status'      // 'partial' | 'complete'
];

var OC_MATRIX_CONTACTS_HEADERS = [
  'response_id',           // FK verso ResponsesMatrix
  'email',                 // unico dato personale
  'preferences_json',      // {bandi_pnrr_mic: true, podcast: true, ...}
  'consent_timestamp',     // ISO 8601
  'consent_text_version'   // hash del testo consenso (per audit)
];

// ============================================================================
// API PUBBLICA — chiamata da frontend via google.script.run
// ============================================================================

/**
 * Restituisce lo schema completo MuseMu Matrix v1.0.2 al frontend.
 * Il frontend usa lo schema per costruire dinamicamente il questionario adattivo.
 *
 * @return {Object} OC_MATRIX_SCHEMA (vedi Matrix_schema.gs)
 */
function getMatrixSchema() {
  if (typeof OC_MATRIX_SCHEMA === 'undefined') {
    throw new Error('Matrix_schema.gs non caricato — verificare presenza file in progetto');
  }
  return OC_MATRIX_SCHEMA;
}

/**
 * Salva le risposte di una compilazione MuseMu Matrix nel foglio ResponsesMatrix.
 * Genera UUID se non fornito (nuova sessione) o aggiorna riga esistente (salva-e-continua).
 *
 * @param {Object} data
 *   data.responseId         (string opzionale) — se assente, ne genera uno nuovo
 *   data.responses          (Object)  — { "D1.1": 4, "D1.2": 3, "D2.4": ["iccd_schede","sigecweb"], ... }
 *   data.section11          (Object)  — { "D11.1": ["D6","D7","D10"], "D11.2": 4, ... }
 *   data.museumProfile      (Object)  — { tipologia, naturaGiuridica, visitatori, mq, addetti }
 *   data.museumName         (string opzionale)
 *   data.timestampInizio    (string ISO opzionale, default ora corrente)
 *   data.timestampFine      (string ISO opzionale)
 *   data.tooltipOpened      (Array)   — ["D2.4","D7.3", ...]
 *   data.timePerQuestion    (Object)  — { "D1.1": 12, ... } secondi
 *   data.completionStatus   (string)  — 'partial' | 'complete' (default 'complete')
 *
 * @return {Object} { ok, responseId, scoring, profile, top3 }
 */
function saveMatrixResponse(data) {
  try {
    if (!data || typeof data !== 'object') return { ok:false, error:'payload mancante' };
    var sheet = _matrixGetOrCreateResponsesSheet_();

    var responseId = data.responseId || _matrixGenerateUuid_();
    var now = new Date();
    var nowIso = now.toISOString();

    // Calcola scoring + profilo + top 3 server-side (single source of truth)
    var scoringResult = _matrixComputeScoring_(data.responses || {}, data.section11 || {});

    // Costruisce riga
    var row = {
      response_id: responseId,
      timestamp_inizio: data.timestampInizio || nowIso,
      timestamp_fine: data.timestampFine || nowIso,
      model_version: OC_MATRIX_VERSION,
      museum_profile_json: JSON.stringify(data.museumProfile || {}),
      museum_name: data.museumName || '',
      responses_json: JSON.stringify(data.responses || {}),
      section11_json: JSON.stringify(data.section11 || {}),
      tooltip_opened_json: JSON.stringify(data.tooltipOpened || []),
      scoring_dimensions_json: JSON.stringify(scoringResult.scoringDimensions || {}),
      profile_assigned: scoringResult.profile || 'P2',
      top3_opportunities_json: JSON.stringify(scoringResult.top3 || []),
      synthetic_score: scoringResult.syntheticScore || 0,
      time_per_question_json: JSON.stringify(data.timePerQuestion || {}),
      consistency_flags_json: JSON.stringify(scoringResult.consistencyFlags || {}),
      user_agent_hash: '',
      completion_status: data.completionStatus || 'complete'
    };

    // Append o update
    var existingRowIndex = _matrixFindRowByResponseId_(sheet, responseId);
    if (existingRowIndex > 0) {
      _matrixUpdateRow_(sheet, existingRowIndex, row);
    } else {
      _matrixAppendRow_(sheet, row);
    }

    return {
      ok: true,
      responseId: responseId,
      scoring: scoringResult.scoringDimensions,
      profile: scoringResult.profile,
      top3: scoringResult.top3,
      syntheticScore: scoringResult.syntheticScore
    };
  } catch(e) {
    Logger.log('saveMatrixResponse errore: ' + e.message + '\n' + e.stack);
    return { ok:false, error: e.message };
  }
}

/**
 * Calcola scoring + profilo per una risposta esistente (re-calcolo on demand).
 * Utile se cambia l'algoritmo di scoring senza ri-compilare.
 *
 * @param {string} responseId
 * @return {Object} { ok, scoring, profile, top3, syntheticScore }
 */
function calcMatrixScoring(responseId) {
  try {
    var record = _matrixGetRecord_(responseId);
    if (!record) return { ok:false, error:'response_id non trovato' };
    var responses = JSON.parse(record.responses_json || '{}');
    var section11 = JSON.parse(record.section11_json || '{}');
    var result = _matrixComputeScoring_(responses, section11);
    return {
      ok:true,
      scoring: result.scoringDimensions,
      profile: result.profile,
      top3: result.top3,
      syntheticScore: result.syntheticScore
    };
  } catch(e) {
    return { ok:false, error: e.message };
  }
}

/**
 * Restituisce il pacchetto dati completo per il rendering del report finale.
 *
 * @param {string} responseId
 * @return {Object} dati strutturati per template report
 */
function getMatrixReport(responseId) {
  try {
    var record = _matrixGetRecord_(responseId);
    if (!record) return { ok:false, error:'response_id non trovato' };

    var museumProfile = JSON.parse(record.museum_profile_json || '{}');
    var scoring = JSON.parse(record.scoring_dimensions_json || '{}');
    var top3 = JSON.parse(record.top3_opportunities_json || '[]');
    var responses = JSON.parse(record.responses_json || '{}');
    var section11 = JSON.parse(record.section11_json || '{}');

    // Costruisce le narrative dei pilastri Musei Sensibili
    var pillars = _matrixComputePillars_(scoring);

    // Costruisce raccomandazioni servizi Duemilamusei (mappatura gap → servizio)
    var serviceRecommendations = _matrixGetServiceRecommendations_(responses, scoring);

    // Costruisce roadmap suggerita (fasi Musei Sensibili)
    var roadmap = _matrixBuildRoadmap_(record.profile_assigned, top3);

    return {
      ok: true,
      responseId: record.response_id,
      compilationDate: record.timestamp_fine || record.timestamp_inizio,
      museumName: record.museum_name || null,
      museumProfile: museumProfile,
      profileAssigned: record.profile_assigned,
      profileDescription: _matrixGetProfileDescription_(record.profile_assigned),
      syntheticScore: Number(record.synthetic_score) || 0,
      scoringDimensions: scoring,
      top3Opportunities: top3,
      pillars: pillars,
      serviceRecommendations: serviceRecommendations,
      roadmap: roadmap,
      benchmark: _matrixGetBenchmarkForProfile_(museumProfile)
    };
  } catch(e) {
    Logger.log('getMatrixReport errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * Salva i dati di contatto per il follow-up opt-in (Sezione 12).
 * Tabella SEPARATA da ResponsesMatrix per privacy/disaccoppiamento.
 *
 * @param {Object} data
 *   data.responseId  (string)  — FK obbligatoria
 *   data.email       (string)  — obbligatoria
 *   data.preferences (Object)  — { bandi_pnrr_mic: true, podcast: true, ... }
 *
 * @return {Object} { ok, error? }
 */
function saveMatrixContact(data) {
  try {
    if (!data || !data.responseId || !data.email) {
      return { ok:false, error:'response_id ed email obbligatori' };
    }
    if (!_matrixIsValidEmail_(data.email)) {
      return { ok:false, error:'email non valida' };
    }
    var sheet = _matrixGetOrCreateContactsSheet_();
    var nowIso = new Date().toISOString();
    var row = {
      response_id: data.responseId,
      email: data.email.toLowerCase().trim(),
      preferences_json: JSON.stringify(data.preferences || {}),
      consent_timestamp: nowIso,
      consent_text_version: 'v1.0.2-2026-04-30'
    };
    _matrixAppendRow_(sheet, row);
    return { ok:true };
  } catch(e) {
    return { ok:false, error: e.message };
  }
}

// ============================================================================
// LOGICA SCORING (privata)
// ============================================================================

/**
 * Calcola scoring per le 10 dimensioni + classifica profilo + identifica top 3 opportunità.
 *
 * @param {Object} responses  — risposte alle domande core
 * @param {Object} section11  — risposte auto-prioritizzazione
 * @return {Object} { scoringDimensions, profile, top3, syntheticScore, consistencyFlags }
 */
function _matrixComputeScoring_(responses, section11) {
  var schema = OC_MATRIX_SCHEMA;
  if (!schema || !schema.questions) return _matrixEmptyResult_();

  var byDimension = {};
  schema.dimensions.forEach(function(d) { byDimension[d.code] = []; });

  // Per ogni domanda compilata, calcola lo score e accumula per dimensione
  schema.questions.forEach(function(q) {
    var raw = responses[q.code];
    if (raw === undefined || raw === null || raw === '') return;
    var score = _matrixScoreSingleQuestion_(q, raw);
    if (score !== null && !isNaN(score)) {
      byDimension[q.dimension].push(score);
    }
  });

  // Calcola media per dimensione
  var scoringDimensions = {};
  schema.dimensions.forEach(function(d) {
    var arr = byDimension[d.code];
    if (arr.length === 0) {
      scoringDimensions[d.code] = 0;
    } else {
      var sum = arr.reduce(function(a,b){ return a+b; }, 0);
      scoringDimensions[d.code] = Math.round((sum / arr.length) * 10) / 10;
    }
  });

  // Punteggio sintetico complessivo (media delle 10 dimensioni)
  var dimScores = schema.dimensions.map(function(d){ return scoringDimensions[d.code]; });
  var validScores = dimScores.filter(function(s){ return s > 0; });
  var syntheticScore = validScores.length > 0
    ? Math.round((validScores.reduce(function(a,b){return a+b;},0) / validScores.length) * 10) / 10
    : 0;

  // Classificazione profilo P1-P5
  var profile = _matrixClassifyProfile_(scoringDimensions, syntheticScore);

  // Top 3 opportunità (3 dimensioni con scoring più basso > 0)
  var top3 = _matrixComputeTop3_(scoringDimensions, schema.dimensions);

  // Consistency flags (uso interno, non esposti al compilatore)
  var consistencyFlags = _matrixComputeConsistencyFlags_(responses, section11, scoringDimensions);

  return {
    scoringDimensions: scoringDimensions,
    profile: profile,
    top3: top3,
    syntheticScore: syntheticScore,
    consistencyFlags: consistencyFlags
  };
}

/**
 * Calcola lo score di una singola domanda in base al tipo.
 */
function _matrixScoreSingleQuestion_(q, rawAnswer) {
  if (q.type === 'likert') {
    var n = Number(rawAnswer);
    if (n >= 1 && n <= 5 && q.scoring && q.scoring[n] !== undefined) {
      return q.scoring[n];
    }
    return null;
  }
  if (q.type === 'multiselect_compositive') {
    if (!Array.isArray(rawAnswer)) return null;
    var totalOptions = (q.options || []).length;
    if (totalOptions === 0) return 0;
    // Esclude eventuale "altro" testuale dal conteggio (se l'array contiene una stringa diversa dai value canonici)
    var canonicalValues = q.options.map(function(o){ return o.value; });
    var selectedCanonical = rawAnswer.filter(function(v){
      return canonicalValues.indexOf(v) !== -1;
    });
    var n = selectedCanonical.length;
    if (n === 0) return 0;
    var ratio = n / totalOptions;
    if (ratio <= 0.20) return 25;
    if (ratio <= 0.40) return 50;
    if (ratio <= 0.70) return 75;
    return 100;
  }
  if (q.type === 'factual_single') {
    if (!q.choices) return null;
    var match = q.choices.filter(function(c){ return c.value === rawAnswer; })[0];
    return match ? Number(match.score) : null;
  }
  return null;
}

/**
 * Classifica il profilo in base alle regole P1-P5 del modello.
 */
function _matrixClassifyProfile_(scoringDimensions, syntheticScore) {
  // Media gruppi
  var traditional = ['D1','D2','D3','D4','D5'];
  var contemporary = ['D6','D7','D8','D9','D10'];
  var avgTrad = _matrixAvgScores_(scoringDimensions, traditional);
  var avgCont = _matrixAvgScores_(scoringDimensions, contemporary);

  if (syntheticScore < 30) return 'P5';
  if (avgTrad > 60 && avgCont < 40) return 'P1';
  if (syntheticScore >= 65 && avgCont >= 60) return 'P4';
  if (avgCont >= 45 && avgCont <= 70) return 'P3';
  return 'P2';
}

function _matrixAvgScores_(scoring, dims) {
  var sum = 0, count = 0;
  dims.forEach(function(d) {
    if (scoring[d] && scoring[d] > 0) { sum += scoring[d]; count++; }
  });
  return count > 0 ? sum / count : 0;
}

/**
 * Identifica le 3 dimensioni con scoring più basso (escludendo zero).
 */
function _matrixComputeTop3_(scoringDimensions, dimensions) {
  var arr = dimensions.map(function(d) {
    return { code: d.code, name: d.name, score: scoringDimensions[d.code] || 0 };
  }).filter(function(x){ return x.score > 0; });
  arr.sort(function(a,b){ return a.score - b.score; });
  return arr.slice(0, 3).map(function(x, idx) {
    return {
      rank: idx + 1,
      dimensionCode: x.code,
      dimensionName: x.name,
      score: x.score,
      reading: _matrixScoreToReading_(x.score)
    };
  });
}

function _matrixScoreToReading_(s) {
  if (s <= 20) return 'Stiamo iniziando questo percorso';
  if (s <= 40) return 'Stiamo costruendo le basi';
  if (s <= 60) return 'Abbiamo le basi consolidate';
  if (s <= 80) return 'Siamo in crescita strutturata';
  return 'Siamo maturi e di riferimento';
}

/**
 * Calcola consistency flags interni (vedi Allegato B del modello D1).
 * Mai esposti al compilatore.
 */
function _matrixComputeConsistencyFlags_(responses, section11, scoring) {
  var flags = {};
  // Flag 1: triangolazione D1.4 vs D1.2 (leadership comunicativa vs coerenza)
  if (responses['D1.4'] && responses['D1.2']) {
    var diff = Math.abs(responses['D1.4'] - responses['D1.2']);
    if (diff >= 3) flags.d1_leadership_inconsistency = true;
  }
  // Flag 2: triangolazione D6.1 vs D6.4 (maturità digitale dichiarata vs frequenza social fattuale)
  if (responses['D6.1'] && responses['D6.4']) {
    var dichiarato = (responses['D6.1'] - 1) * 25;
    var schemaQ64 = OC_MATRIX_SCHEMA.questions.filter(function(q){return q.code==='D6.4';})[0];
    var ch = schemaQ64 && schemaQ64.choices.filter(function(c){return c.value === responses['D6.4'];})[0];
    var fattuale = ch ? ch.score : null;
    if (fattuale !== null && Math.abs(dichiarato - fattuale) >= 50) {
      flags.d6_digital_inconsistency = true;
    }
  }
  // Flag 3: triangolazione D7.1 vs D7.5 (accessibility dichiarata vs piano formale fattuale)
  if (responses['D7.1'] && responses['D7.5']) {
    var dich7 = (responses['D7.1'] - 1) * 25;
    var schemaQ75 = OC_MATRIX_SCHEMA.questions.filter(function(q){return q.code==='D7.5';})[0];
    var ch5 = schemaQ75 && schemaQ75.choices.filter(function(c){return c.value === responses['D7.5'];})[0];
    var fatt5 = ch5 ? ch5.score : null;
    if (fatt5 !== null && Math.abs(dich7 - fatt5) >= 50) {
      flags.d7_accessibility_inconsistency = true;
    }
  }
  // Flag 4: D11.1 priorità soggettive vs scoring oggettivo dimensioni più basse
  var soggettive = (section11['D11.1'] || []);
  if (soggettive.length > 0) {
    var top3objective = _matrixComputeTop3_(scoring, OC_MATRIX_SCHEMA.dimensions).map(function(t){return t.dimensionCode;});
    var overlap = soggettive.filter(function(d){ return top3objective.indexOf(d) !== -1; }).length;
    flags.priorities_alignment = overlap; // 0-3, più alto = più allineato
  }
  // Flag 5: domanda calibrazione finale D11.5
  if (section11['D11.5']) {
    flags.self_calibration = section11['D11.5']; // 1-5
  }
  return flags;
}

function _matrixEmptyResult_() {
  return {
    scoringDimensions: { D1:0,D2:0,D3:0,D4:0,D5:0,D6:0,D7:0,D8:0,D9:0,D10:0 },
    profile: 'P2',
    top3: [],
    syntheticScore: 0,
    consistencyFlags: {}
  };
}

// ============================================================================
// LOGICA REPORT (privata)
// ============================================================================

function _matrixComputePillars_(scoring) {
  // Pilastro I — Accessibility Radicale (D7)
  // Pilastro II — Edutainment & Soft Skills (D8)
  // Pilastro III — Estetica Relazionale & Spatial Computing (D3+D6 combinati)
  var pillar1 = scoring['D7'] || 0;
  var pillar2 = scoring['D8'] || 0;
  var pillar3 = ((scoring['D3'] || 0) + (scoring['D6'] || 0)) / 2;
  return {
    pillar1: { score: pillar1, narrative: _matrixPillarNarrative_('I', pillar1) },
    pillar2: { score: pillar2, narrative: _matrixPillarNarrative_('II', pillar2) },
    pillar3: { score: Math.round(pillar3 * 10) / 10, narrative: _matrixPillarNarrative_('III', pillar3) }
  };
}

function _matrixPillarNarrative_(pillarCode, score) {
  var labels = {
    'I':   ['accessibilità all\'inizio del percorso', 'accessibilità in costruzione', 'accessibilità consolidata su alcuni livelli', 'accessibilità in crescita su 3 dei 4 livelli', 'modello di accessibilità di riferimento'],
    'II':  ['offerta principalmente contemplativa', 'prime sperimentazioni di edutainment', 'edutainment presente in modo strutturato', 'edutainment integrato nell\'offerta regolare', 'modello partecipativo di riferimento'],
    'III': ['integrazione fra spazio fisico e digitale all\'inizio', 'prime sperimentazioni di tecnologia integrata', 'integrazione consolidata su alcuni aspetti', 'integrazione strutturata nell\'esperienza', 'integrazione totale come asset competitivo']
  };
  var idx = score <= 20 ? 0 : score <= 40 ? 1 : score <= 60 ? 2 : score <= 80 ? 3 : 4;
  var arr = labels[pillarCode] || [];
  return arr[idx] || '';
}

/**
 * Mappa gap → servizi Duemilamusei (riusa la logica del D4b matrice gap-servizio).
 * Per ora ritorna un set di base, espandibile in futuro caricando D4b da JSON.
 */
function _matrixGetServiceRecommendations_(responses, scoring) {
  var recs = [];
  // Logica semplificata: per le 3 dimensioni più basse, suggerisci servizi correlati
  var top3 = _matrixComputeTop3_(scoring, OC_MATRIX_SCHEMA.dimensions);
  // Mapping aggiornato Sprint 1.3 (2026-05-01) — coerente con rinomina ambiti OC:
  //   01 Identità e narrazione museale  ← D1
  //   02 Inclusione e accessibilità     ← D7
  //   03 Programma, mostre e collezioni ← D2, D3, D4, D5
  //   04 Comunità e welfare culturale   ← D8, D10
  //   05 Digital, AI e governance       ← D6, D9
  var dimToService = {
    'D1': { code:'S22', name:'Consulenza strategica trasformazione digitale', desc:'Analisi identità + roadmap brand 24-36 mesi',          ocAmbito:1, ocPage:null},
    'D2': { code:'S15', name:'Catalogazione AI-assistita',                     desc:'Riconoscimento immagini, completamento schede ICCD',   ocAmbito:3, ocPage:null},
    'D3': { code:'S22', name:'Consulenza strategica spazi e allestimenti',     desc:'Audit spazi + roadmap intervento reversibile',         ocAmbito:3, ocPage:null},
    'D4': { code:'S13', name:'Generazione contenuti educativi AI',             desc:'Materiali didattici, percorsi tematici',               ocAmbito:3, ocPage:null},
    'D5': { code:'S10', name:'CRM museale Duemilamusei',                       desc:'Gestione visitatori, soci, programmi membership',      ocAmbito:3, ocPage:null},
    'D6': { code:'S01', name:'Chatbot visitatori AI multilingue',              desc:'Assistente conversazionale integrato sul sito',        ocAmbito:5, ocPage:null},
    'D7': { code:'S07', name:'Generazione testi Easy-to-Read (E2R)',           desc:'Riformulazione automatica testi espositivi',           ocAmbito:2, ocPage:null},
    'D8': { code:'S17', name:'Edutainment AI per scuole',                      desc:'Escape room culturali, ARG, percorsi adattivi',        ocAmbito:4, ocPage:null},
    'D9': { code:'S21', name:'Scouting bandi e progettazione candidabile',     desc:'Newsletter mensile + supporto candidature',            ocAmbito:5, ocPage:'bandi'},
    'D10':{ code:'S20', name:'AI per programmi welfare personalizzati',        desc:'Programmi welfare per pubblici fragili specifici',     ocAmbito:4, ocPage:null}
  };
  // Etichetta ambito leggibile (allineata a Index.html → AMBITI, Sprint 1.3)
  var ambitoLabels = {
    1:'01 Identità e narrazione museale',
    2:'02 Inclusione e accessibilità',
    3:'03 Programma, mostre e collezioni',
    4:'04 Comunità e welfare culturale',
    5:'05 Digital, AI e governance'
  };
  top3.forEach(function(opp) {
    var s = dimToService[opp.dimensionCode];
    if (s) {
      var ocLabel = s.ocAmbito ? ('Approfondisci nell\'Osservatorio: ' + ambitoLabels[s.ocAmbito])
                  : (s.ocPage === 'bandi' ? 'Vedi bandi attivi nel Radar Bandi'
                  : null);
      recs.push({
        opportunityRank: opp.rank,
        opportunityCode: opp.dimensionCode,
        opportunityName: opp.dimensionName,
        serviceCode: s.code,
        serviceName: s.name,
        serviceDescription: s.desc,
        ocAmbito: s.ocAmbito,            // Sprint 2 Step 4
        ocPage:   s.ocPage,              // Sprint 2 Step 4
        ocLinkLabel: ocLabel             // Sprint 2 Step 4
      });
    }
  });
  return recs;
}

function _matrixBuildRoadmap_(profile, top3) {
  // Roadmap a 3 fasi Musei Sensibili (Ancoraggio / Scalabilità / Ecosistema)
  // Personalizzata in base al profilo
  return {
    phase1: { name:'Ancoraggio (0-6 mesi)',
      objective:'Consolidare i fondamentali e affrontare le 3 opportunità prioritarie identificate',
      actions: top3.map(function(t){ return 'Intervento su ' + t.dimensionName; })
    },
    phase2: { name:'Scalabilità (6-18 mesi)',
      objective:'Strutturare audience development, edutainment e analytics',
      actions: ['Format edutainment regolari', 'Audience analytics dashboard', 'Primi programmi welfare formalizzati']
    },
    phase3: { name:'Ecosistema (18-36 mesi)',
      objective:'Integrazione territoriale e leadership di network',
      actions: ['Partnership DMO regionale', 'Bilancio impatto sociale', 'Co-creazione strutturata con comunità']
    }
  };
}

function _matrixGetProfileDescription_(profileCode) {
  if (!OC_MATRIX_SCHEMA.profiles) return '';
  var p = OC_MATRIX_SCHEMA.profiles.filter(function(x){ return x.code === profileCode; })[0];
  return p ? p.description : '';
}

function _matrixGetBenchmarkForProfile_(museumProfile) {
  // Benchmark placeholder — sarà calcolato dinamicamente dal dataset cumulativo da v1.1
  return {
    note: 'Benchmark di confronto in costruzione (rilascio v1.1 dopo campione pilota)',
    placeholder: true
  };
}

// ============================================================================
// HELPER FOGLI (privati)
// ============================================================================

function _matrixGetOrCreateResponsesSheet_() {
  var ss = getMainSS();
  var sh = ss.getSheetByName(OC_MATRIX_RESPONSES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_MATRIX_RESPONSES_SHEET);
    sh.appendRow(OC_MATRIX_RESPONSES_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, OC_MATRIX_RESPONSES_HEADERS.length)
      .setFontWeight('bold').setBackground('#185FA5').setFontColor('#FFFFFF');
  }
  return sh;
}

function _matrixGetOrCreateContactsSheet_() {
  var ss = getMainSS();
  var sh = ss.getSheetByName(OC_MATRIX_CONTACTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_MATRIX_CONTACTS_SHEET);
    sh.appendRow(OC_MATRIX_CONTACTS_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, OC_MATRIX_CONTACTS_HEADERS.length)
      .setFontWeight('bold').setBackground('#0F6E56').setFontColor('#FFFFFF');
  }
  return sh;
}

function _matrixAppendRow_(sheet, rowObj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowArr = headers.map(function(h){ return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sheet.appendRow(rowArr);
}

function _matrixUpdateRow_(sheet, rowIndex, rowObj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowArr = headers.map(function(h){ return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sheet.getRange(rowIndex, 1, 1, rowArr.length).setValues([rowArr]);
}

function _matrixFindRowByResponseId_(sheet, responseId) {
  if (sheet.getLastRow() < 2) return -1;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === responseId) return i + 2;
  }
  return -1;
}

function _matrixGetRecord_(responseId) {
  var sheet = _matrixGetOrCreateResponsesSheet_();
  var rowIndex = _matrixFindRowByResponseId_(sheet, responseId);
  if (rowIndex < 0) return null;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var record = {};
  headers.forEach(function(h, i) { record[h] = values[i]; });
  return record;
}

function _matrixGenerateUuid_() {
  // Utilities.getUuid() ritorna un UUID v4 standard
  return Utilities.getUuid();
}

function _matrixIsValidEmail_(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ''));
}

// ============================================================================
// FUNZIONI DI DIAGNOSTICA / SETUP (esegui da editor GAS)
// ============================================================================

/**
 * Setup iniziale: crea i 2 fogli ResponsesMatrix e ContactsMatrix se non esistono.
 * Esegui UNA VOLTA da editor GAS dopo il primo deploy.
 */
function setupMatrixSheets() {
  var sh1 = _matrixGetOrCreateResponsesSheet_();
  var sh2 = _matrixGetOrCreateContactsSheet_();
  Logger.log('Setup completato:');
  Logger.log('  ResponsesMatrix: ' + sh1.getName() + ' (righe: ' + sh1.getLastRow() + ')');
  Logger.log('  ContactsMatrix: ' + sh2.getName() + ' (righe: ' + sh2.getLastRow() + ')');
  return { ok:true, sheets:[sh1.getName(), sh2.getName()] };
}

/**
 * Test rapido del modulo Matrix: salva una risposta dummy + verifica scoring.
 * Esegui da editor GAS per verificare che tutto funzioni dopo deploy.
 */
function testMatrixModule() {
  var dummy = {
    museumProfile: { tipologia:'museo civico', naturaGiuridica:'pubblica', visitatori:'5.000-20.000', mq:'500-1.500', addetti:'2-5' },
    museumName: 'Museo TEST',
    responses: {
      'D1.1': 4, 'D1.2': 3, 'D1.3': 3,
      'D2.1': 3, 'D2.2': 4,
      'D3.1': 4, 'D3.2': 3, 'D3.4': '5anni',
      'D4.1': 3, 'D4.2': 3,
      'D5.1': 3, 'D5.2': 3,
      'D6.1': 2,
      'D7.1': 3, 'D7.5': 'in_redazione',
      'D8.1': 3,
      'D9.1': 3,
      'D10.1': 2
    },
    section11: {
      'D11.1': ['D6','D7','D10'],
      'D11.2': 4,
      'D11.5': 3,
      'D11.6': 3
    }
  };
  var result = saveMatrixResponse(dummy);
  Logger.log('=== TEST MATRIX MODULE ===');
  Logger.log(JSON.stringify(result, null, 2));
  if (result.ok) {
    Logger.log('--- Report completo ---');
    var report = getMatrixReport(result.responseId);
    Logger.log(JSON.stringify(report, null, 2).substring(0, 2000));
  }
  return result;
}

/**
 * Sprint 2 Step 4 — Test integrato PDF + email.
 * ESEGUIRE UNA VOLTA dall'editor GAS per attivare TUTTI i prompt OAuth in
 * sequenza: DocumentApp (creazione doc), DriveApp (creazione file + sharing),
 * MailApp (invio email). Email destinazione: s.straccini@gmail.com.
 *
 * Output Logger: link al PDF generato + esito invio email.
 */
function testMatrixPDFEmail() {
  Logger.log('=== TEST PDF + EMAIL ===');
  // 1) Crea un response di test (riusa testMatrixModule)
  var save = testMatrixModule();
  if (!save || !save.ok) {
    Logger.log('FAIL: saveMatrixResponse non riuscito. ' + (save && save.error || ''));
    return save;
  }
  var rid = save.responseId;
  Logger.log('Response_id di test: ' + rid);

  // 2) Genera il PDF (attiva DocumentApp + DriveApp)
  Logger.log('--- Generazione PDF ---');
  var pdf = generateMatrixReportPDF(rid);
  Logger.log(JSON.stringify(pdf, null, 2));
  if (!pdf.ok) {
    Logger.log('FAIL generazione PDF: ' + pdf.error);
    return pdf;
  }
  Logger.log('PDF URL: ' + pdf.fileUrl);

  // 3) Invia email a Silvano (attiva MailApp)
  Logger.log('--- Invio email ---');
  var email = sendMatrixReportEmail({
    responseId: rid,
    email: 's.straccini@gmail.com',
    nome: 'Silvano (test)',
    preferences: { bandi_pnrr_mic: true, podcast: true }
  });
  Logger.log(JSON.stringify(email, null, 2));
  if (!email.ok) {
    Logger.log('FAIL invio email: ' + email.error);
  } else {
    Logger.log('Email inviata. Verificare casella s.straccini@gmail.com');
  }
  return { ok: true, responseId: rid, pdf: pdf, email: email };
}

/**
 * Verifica che lo schema sia caricato correttamente.
 */
function checkMatrixSchema() {
  if (typeof OC_MATRIX_SCHEMA === 'undefined') {
    Logger.log('ERRORE: OC_MATRIX_SCHEMA non definito. Verificare presenza Matrix_schema.gs');
    return { ok:false, error:'schema mancante' };
  }
  var s = OC_MATRIX_SCHEMA;
  Logger.log('Schema OK:');
  Logger.log('  Versione: ' + s.metadata.modelVersion);
  Logger.log('  Dimensioni: ' + s.dimensions.length);
  Logger.log('  Domande: ' + s.questions.length);
  Logger.log('  Profili: ' + s.profiles.length);
  Logger.log('  Anagrafica: ' + s.anagrafica.length);
  return { ok:true, version: s.metadata.modelVersion, questions: s.questions.length };
}

// ============================================================================
// SPRINT 2 STEP 4 — REPORT PDF + EMAIL (2026-05-01)
// ============================================================================

var OC_MATRIX_PDF_FOLDER_NAME = 'MuseMu Matrix - Report';
var OC_MATRIX_DUEMILAMUSEI_BRAND = 'Duemilamusei · MuseMu Matrix';
var OC_MATRIX_DUEMILAMUSEI_FOOTER = 'Duemilamusei | Fano (PU) | duemilamusei.it';

/**
 * Recupera o crea la cartella Drive che ospita i PDF generati.
 * Idempotente: se già esiste, riusa la prima trovata.
 * @return {Folder}
 */
function _matrixGetOrCreatePdfFolder_() {
  var folders = DriveApp.getFoldersByName(OC_MATRIX_PDF_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(OC_MATRIX_PDF_FOLDER_NAME);
}

/**
 * Genera il PDF del report a partire da un response_id.
 * Usa DocumentApp per costruire un documento istituzionale, lo converte in PDF
 * e lo salva nella cartella Drive dedicata. Idempotente: rigenera se esiste.
 *
 * @param {string} responseId
 * @return {Object} { ok, fileId?, fileUrl?, downloadUrl?, error? }
 */
function generateMatrixReportPDF(responseId) {
  try {
    if (!responseId) return { ok:false, error:'responseId mancante' };
    var report = getMatrixReport(responseId);
    if (!report.ok) return { ok:false, error: report.error || 'report non disponibile' };

    var folder = _matrixGetOrCreatePdfFolder_();
    var museumLabel = (report.museumName || 'museo-anonimo').replace(/[^A-Za-z0-9_-]+/g, '-');
    var docName = 'Report_MuseMu_Matrix__' + museumLabel + '__' + responseId.substring(0,8);

    // Crea il Google Doc temporaneo
    var doc = DocumentApp.create(docName);
    _matrixBuildReportDoc_(doc, report);
    doc.saveAndClose();

    // Esporta come PDF e salva nella cartella dedicata
    var docFile = DriveApp.getFileById(doc.getId());
    var pdfBlob = docFile.getAs('application/pdf').setName(docName + '.pdf');
    var pdfFile = folder.createFile(pdfBlob);

    // Permessi: chiunque con link può visualizzare (necessario per download da webapp)
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Pulisce il Google Doc temporaneo (manteniamo solo il PDF)
    DriveApp.getFileById(doc.getId()).setTrashed(true);

    var fileId = pdfFile.getId();
    return {
      ok: true,
      fileId: fileId,
      fileUrl: 'https://drive.google.com/file/d/' + fileId + '/view',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId
    };
  } catch(e) {
    Logger.log('generateMatrixReportPDF errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * Wrapper leggero: chiamata frontend per ottenere solo l'URL del PDF.
 * @param {string} responseId
 * @return {Object} { ok, fileUrl?, downloadUrl?, error? }
 */
function getMatrixReportPDFUrl(responseId) {
  return generateMatrixReportPDF(responseId);
}

/**
 * Invia il report PDF al referente museale via email.
 * Salva il contatto nella tabella ContactsMatrix se non già presente (Sezione 12).
 *
 * @param {Object} data
 *   data.responseId  (string)  — obbligatorio
 *   data.email       (string)  — obbligatorio
 *   data.nome        (string)  — opzionale
 *   data.preferences (Object)  — opzionale (per opt-in OC)
 * @return {Object} { ok, fileUrl?, error? }
 */
function sendMatrixReportEmail(data) {
  try {
    if (!data || !data.responseId || !data.email) {
      return { ok:false, error:'responseId ed email obbligatori' };
    }
    if (!_matrixIsValidEmail_(data.email)) {
      return { ok:false, error:'email non valida' };
    }

    // 1) Genera PDF
    var pdfResult = generateMatrixReportPDF(data.responseId);
    if (!pdfResult.ok) return { ok:false, error: 'PDF non generato: ' + pdfResult.error };

    // 2) Recupera report per personalizzare email
    var report = getMatrixReport(data.responseId);
    if (!report.ok) return { ok:false, error: report.error };

    // 3) Salva contatto in tabella ContactsMatrix (idempotente, se opt-in)
    if (data.preferences) {
      saveMatrixContact({
        responseId:  data.responseId,
        email:       data.email,
        preferences: data.preferences
      });
    }

    // 4) Costruisce email HTML
    var nome = data.nome || 'Referente';
    var museumName = report.museumName || 'la vostra struttura';
    var subject = '[MuseMu Matrix] Report di autovalutazione — ' + museumName;
    var htmlBody = _matrixBuildEmailBody_(nome, report, pdfResult.fileUrl);

    // 5) Recupera il PDF come allegato
    var pdfBlob = DriveApp.getFileById(pdfResult.fileId).getBlob();

    // 6) Invio
    MailApp.sendEmail({
      to: data.email,
      subject: subject,
      htmlBody: htmlBody,
      attachments: [pdfBlob],
      name: 'MuseMu Matrix · Duemilamusei',
      replyTo: 's.straccini@gmail.com'
    });

    return {
      ok: true,
      fileUrl: pdfResult.fileUrl,
      message: 'Email inviata con successo a ' + data.email
    };
  } catch(e) {
    Logger.log('sendMatrixReportEmail errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

// ============================================================================
// HELPER PRIVATI — Costruzione documento PDF e corpo email
// ============================================================================

/**
 * Popola il Google Doc passato con tutto il contenuto del report.
 * Layout istituzionale a sezioni (allineato al template D3b).
 */
function _matrixBuildReportDoc_(doc, report) {
  var body = doc.getBody();
  body.clear();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(60).setMarginRight(60);

  // Stili tipografici
  var styleH1 = {}; styleH1[DocumentApp.Attribute.FONT_SIZE]=20; styleH1[DocumentApp.Attribute.BOLD]=true;
                    styleH1[DocumentApp.Attribute.FOREGROUND_COLOR]='#0E7490';
  var styleH2 = {}; styleH2[DocumentApp.Attribute.FONT_SIZE]=14; styleH2[DocumentApp.Attribute.BOLD]=true;
                    styleH2[DocumentApp.Attribute.FOREGROUND_COLOR]='#2E5266';
  var styleH3 = {}; styleH3[DocumentApp.Attribute.FONT_SIZE]=11; styleH3[DocumentApp.Attribute.BOLD]=true;
                    styleH3[DocumentApp.Attribute.FOREGROUND_COLOR]='#B8902A';
  var styleBody = {}; styleBody[DocumentApp.Attribute.FONT_SIZE]=10;
                      styleBody[DocumentApp.Attribute.FOREGROUND_COLOR]='#333333';
  var styleSmall = {}; styleSmall[DocumentApp.Attribute.FONT_SIZE]=9;
                       styleSmall[DocumentApp.Attribute.FOREGROUND_COLOR]='#666666';
                       styleSmall[DocumentApp.Attribute.ITALIC]=true;

  // === HEADER ===
  body.appendParagraph(OC_MATRIX_DUEMILAMUSEI_BRAND).setAttributes(styleSmall);
  body.appendParagraph('Report di autovalutazione').setAttributes(styleH1);
  var dateStr = report.compilationDate ? new Date(report.compilationDate).toLocaleDateString('it-IT') : '';
  body.appendParagraph((report.museumName || 'Struttura culturale') + ' · ' + dateStr).setAttributes(styleH3);
  body.appendHorizontalRule();

  // === SEZIONE 1: PROFILO IDENTITARIO ===
  body.appendParagraph('1. Profilo identitario').setAttributes(styleH2);
  var profileLabel = report.profileAssigned + ' — ' + (report.profileDescription || '');
  var pProfile = body.appendParagraph(profileLabel);
  pProfile.setAttributes(styleBody);
  // Score sintetico in evidenza
  body.appendParagraph('').setAttributes(styleBody);
  var scoreCell = body.appendTable([['Score sintetico complessivo', String(report.syntheticScore) + ' / 100']]);
  scoreCell.getCell(0,0).setBackgroundColor('#F5F0E1').editAsText().setAttributes(styleH3);
  scoreCell.getCell(0,1).setBackgroundColor('#0E7490').editAsText().setForegroundColor('#FFFFFF').setBold(true).setFontSize(14);

  // === SEZIONE 2: SCORING PER DIMENSIONE ===
  body.appendParagraph('').setAttributes(styleBody);
  body.appendParagraph('2. Mappatura per dimensione').setAttributes(styleH2);
  body.appendParagraph('Punteggi 0-100 per ciascuna delle 10 dimensioni MuseMu Matrix.').setAttributes(styleBody);

  var dims = (OC_MATRIX_SCHEMA && OC_MATRIX_SCHEMA.dimensions) ? OC_MATRIX_SCHEMA.dimensions : [];
  var rows = [['Dimensione', 'Score', 'Lettura']];
  dims.forEach(function(d){
    var s = report.scoringDimensions[d.code];
    if (s == null) return;
    rows.push([d.code + ' — ' + d.name, String(s), _matrixScoreToReading_(s)]);
  });
  var dimTable = body.appendTable(rows);
  dimTable.getRow(0).getCell(0).setBackgroundColor('#2E5266').editAsText().setForegroundColor('#FFFFFF').setBold(true);
  dimTable.getRow(0).getCell(1).setBackgroundColor('#2E5266').editAsText().setForegroundColor('#FFFFFF').setBold(true);
  dimTable.getRow(0).getCell(2).setBackgroundColor('#2E5266').editAsText().setForegroundColor('#FFFFFF').setBold(true);
  for (var r=1; r<rows.length; r++) {
    dimTable.getRow(r).getCell(0).editAsText().setFontSize(9);
    dimTable.getRow(r).getCell(1).editAsText().setFontSize(9).setBold(true);
    dimTable.getRow(r).getCell(2).editAsText().setFontSize(9).setForegroundColor('#666666');
  }

  // === SEZIONE 3: TOP 3 OPPORTUNITÀ ===
  body.appendParagraph('').setAttributes(styleBody);
  body.appendParagraph('3. Tre opportunità prioritarie').setAttributes(styleH2);
  body.appendParagraph('Le aree con maggiore margine di miglioramento, ordinate per impatto potenziale.').setAttributes(styleBody);
  (report.top3Opportunities || []).forEach(function(opp, i){
    var pRank = body.appendParagraph('Opportunità #' + opp.rank + ' — ' + opp.dimensionName);
    pRank.setAttributes(styleH3);
    body.appendParagraph('Score attuale: ' + opp.score + '/100 (' + _matrixScoreToReading_(opp.score) + ')').setAttributes(styleBody);
  });

  // === SEZIONE 4: SERVIZI RACCOMANDATI ===
  body.appendParagraph('').setAttributes(styleBody);
  body.appendParagraph('4. Servizi Duemilamusei raccomandati').setAttributes(styleH2);
  body.appendParagraph('Interventi a base AI per chiudere i gap identificati.').setAttributes(styleBody);
  (report.serviceRecommendations || []).forEach(function(rec) {
    var pSvc = body.appendParagraph('▸ ' + rec.serviceName + '  [' + rec.serviceCode + ']');
    pSvc.setAttributes(styleH3);
    body.appendParagraph(rec.serviceDescription).setAttributes(styleBody);
    body.appendParagraph('Riferito a: ' + rec.opportunityName).setAttributes(styleSmall);
    if (rec.ocLinkLabel) {
      body.appendParagraph(rec.ocLinkLabel).setAttributes(styleSmall);
    }
  });

  // === SEZIONE 5: ROADMAP 3 FASI ===
  body.appendParagraph('').setAttributes(styleBody);
  body.appendParagraph('5. Roadmap suggerita Musei Sensibili').setAttributes(styleH2);
  var rm = report.roadmap || {};
  ['phase1','phase2','phase3'].forEach(function(k){
    var ph = rm[k]; if (!ph) return;
    body.appendParagraph(ph.name).setAttributes(styleH3);
    body.appendParagraph(ph.objective).setAttributes(styleBody);
    (ph.actions || []).forEach(function(a){
      var li = body.appendListItem(a);
      li.setGlyphType(DocumentApp.GlyphType.BULLET).editAsText().setFontSize(10);
    });
  });

  // === FOOTER ===
  body.appendParagraph('').setAttributes(styleBody);
  body.appendHorizontalRule();
  body.appendParagraph(OC_MATRIX_DUEMILAMUSEI_FOOTER).setAttributes(styleSmall);
  body.appendParagraph('Modello MuseMu Matrix ' + OC_MATRIX_VERSION + ' · Risposta: ' + report.responseId).setAttributes(styleSmall);
  body.appendParagraph('Le risposte sono trattate in forma anonima. Il contatto è raccolto solo previo opt-in esplicito ai sensi del Reg. UE 2016/679.').setAttributes(styleSmall);
}

/**
 * Costruisce il body HTML dell'email di consegna report.
 */
function _matrixBuildEmailBody_(nome, report, fileUrl) {
  var museumName = report.museumName || 'la vostra struttura';
  var top3Html = (report.top3Opportunities || []).slice(0,3).map(function(o){
    return '<li><b>' + o.dimensionName + '</b> — score ' + o.score + '/100</li>';
  }).join('');
  return ''
    + '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#333;max-width:600px;line-height:1.5">'
    + '<div style="background:linear-gradient(135deg,#0E7490,#2E5266);color:#fff;padding:24px;border-radius:8px 8px 0 0">'
    +   '<div style="font-size:12px;letter-spacing:1px;opacity:.85">DUEMILAMUSEI · MUSEMU MATRIX</div>'
    +   '<h1 style="margin:6px 0 0;font-size:22px;font-weight:600">Report di autovalutazione</h1>'
    +   '<div style="margin-top:6px;opacity:.9">' + museumName + '</div>'
    + '</div>'
    + '<div style="padding:24px;background:#fff;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px">'
    +   '<p>Gentile ' + nome + ',</p>'
    +   '<p>in allegato trova il report PDF dell\'autovalutazione MuseMu Matrix per <b>' + museumName + '</b>.</p>'
    +   '<p style="background:#F5F0E1;padding:12px 16px;border-left:3px solid #B8902A;border-radius:4px">'
    +     '<b>Profilo identitario:</b> ' + report.profileAssigned + '<br>'
    +     '<b>Score sintetico:</b> ' + report.syntheticScore + ' / 100'
    +   '</p>'
    +   '<h3 style="color:#2E5266;font-size:14px;margin-top:24px">Le tre opportunità prioritarie emerse</h3>'
    +   '<ul>' + top3Html + '</ul>'
    +   '<p>Il report contiene la mappatura completa per dimensione, le raccomandazioni di servizio Duemilamusei coerenti con i gap rilevati e una roadmap suggerita su tre orizzonti temporali (0-6 / 6-18 / 18-36 mesi).</p>'
    +   '<p style="text-align:center;margin:28px 0">'
    +     '<a href="' + fileUrl + '" style="display:inline-block;background:#0E7490;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Apri il report online</a>'
    +   '</p>'
    +   '<p>Sono a disposizione per un confronto sui prossimi passi: una sessione gratuita di 30 minuti per discutere insieme priorità, fattibilità e tempi di intervento.</p>'
    +   '<p style="margin-top:28px">Cordialmente,<br><b>Silvano Straccini</b><br>Duemilamusei · Fano (PU)</p>'
    +   '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">'
    +   '<p style="font-size:11px;color:#888;line-height:1.4">'
    +     'Riceve questa email perché ha completato il questionario MuseMu Matrix sull\'Osservatorio Culturale Duemilamusei e ha espresso consenso al follow-up. '
    +     'Modello v' + OC_MATRIX_VERSION + ' · Riferimento risposta: ' + report.responseId + '. '
    +     'Per non ricevere ulteriori comunicazioni risponda con oggetto "RIMUOVI".'
    +   '</p>'
    + '</div>'
    + '</div>';
}

// ============================================================================
// FINE Matrix_v1.gs
// ============================================================================
