/**
 * ============================================================================
 *  Matrix_tagger.gs — Tagging contenuti OC con dimensioni MuseMu Matrix
 * ============================================================================
 *  Sprint 1.3 D2.1 + D2.2 (2026-05-01)
 *  Autore: Silvano Straccini / Duemilamusei
 *
 *  SCOPO
 *  -----
 *  Aggiunge la colonna `MatrixDim` (CSV es. "D7,D8") ai fogli Bandi/News/Podcast
 *  e applica un tagger keyword-based per classificare ogni contenuto in 1-3
 *  delle 10 dimensioni MuseMu Matrix.
 *
 *  Il tagging abilita il digest segmentato (D2.3): per ogni email opt-in con
 *  responseId Matrix associato, raccoglie i contenuti taggati sulle dimensioni
 *  dei top 3 gap del museo.
 *
 *  WORKFLOW OPERATIVO
 *  ------------------
 *    1. setupMatrixDimColumns()         — una tantum: aggiunge colonna ai 3 fogli
 *    2. tagMatrixDimRetroattivo()       — batch: applica tagger ai record vuoti
 *    3. (futuro) hook nello scanner      — auto-tag per i nuovi contenuti
 *
 *  REGOLE DI SCORING
 *  -----------------
 *  Ogni dimensione D1-D10 ha un dizionario di keyword pesate. Per ogni testo
 *  (titolo + sommario), si calcola lo score per ogni dimensione contando le
 *  occorrenze (case-insensitive, word boundary). Si ritornano le top 3
 *  dimensioni con score > 0, separate da virgola. Se nessuna keyword matcha,
 *  ritorna stringa vuota.
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

var OC_MATRIX_DIM_COLUMN = 'MatrixDim';
var OC_MATRIX_TAGGER_VERSION = 'v1.0';

/**
 * Dizionario keyword per ciascuna dimensione MuseMu Matrix v1.0.2.
 * Le keyword sono in italiano e inglese; case-insensitive nel matching.
 * Pesi: 3 = molto specifico, 2 = specifico, 1 = generico (uso prudente).
 */
var OC_MATRIX_KEYWORDS = {
  'D1': { // Identità e marca
    weight3: ['rebranding','brand identity','identita visiva','naming museo','manifesto culturale'],
    weight2: ['identita','marca','logo','brand','posizionamento','missione','vision','visual identity','tone of voice','storytelling istituzionale'],
    weight1: ['narrazione','immagine coordinata']
  },
  'D2': { // Patrimonio e collezioni
    weight3: ['catalogazione iccd','open content collezioni','digitalizzazione patrimonio','iccd','schede catalografiche'],
    weight2: ['patrimonio','collezione','collezioni','conservazione','restauro','ricerca scientifica','deposito','catalogazione','open collection','beni culturali'],
    weight1: ['archivio','reperto','opera']
  },
  'D3': { // Spazi e allestimenti
    weight3: ['allestimento museale','progetto espositivo','wayfinding museale','illuminotecnica museo','riallestimento sale'],
    weight2: ['allestimento','spazio espositivo','sala espositiva','design espositivo','scenografia','wayfinding','illuminotecnica','lighting design','exhibition design'],
    weight1: ['spazio','sala','percorso']
  },
  'D4': { // Programma educativo
    weight3: ['didattica museale','laboratorio bambini','atelier creativo','mediazione culturale','servizi educativi museo'],
    weight2: ['didattica','educativo','mediazione','laboratorio','workshop','scuole','famiglie','edutainment','atelier','formazione','formazione docenti'],
    weight1: ['attivita','corso','percorso didattico']
  },
  'D5': { // Servizi al visitatore
    weight3: ['membership museo','crm museale','programma fidelizzazione','soci sostenitori','amici del museo'],
    weight2: ['accoglienza','biglietteria','crm','membership','fidelizzazione','soci','abbonamento','audio guida','audioguida','shop museale','bookshop','customer experience'],
    weight1: ['servizi','visitatori','prenotazione']
  },
  'D6': { // Maturità digitale (asse trasformativo)
    weight3: ['intelligenza artificiale museo','ai cultura','machine learning patrimonio','metaverso culturale','digital twin museo','augmented reality museo'],
    weight2: ['digital','digitale','ai','intelligenza artificiale','api','dataset','open data','cloud','machine learning','chatbot','metaverso','vr','realta virtuale','ar','realta aumentata','digitalizzazione','blockchain','nft'],
    weight1: ['app','sito web','tecnologia']
  },
  'D7': { // Accessibilità (asse trasformativo)
    weight3: ['easy to read','easy-to-read','e2r','audiodescrizione museo','percorsi tattili','lis lingua dei segni','accessibilita cognitiva','barrier free','accessibilita sensoriale'],
    weight2: ['accessibilita','accessibile','tattile','sensoriale','disabilita','autismo','alzheimer','sordo','non vedente','linguaggio facile','sottotitoli','traduzione lis','barriera','inclusione'],
    weight1: ['inclusivo','adattato']
  },
  'D8': { // Audience engagement (asse trasformativo)
    weight3: ['audience development','community building museo','social media museo','ambassador program','user generated content'],
    weight2: ['audience','pubblico','community','social media','instagram','facebook','tiktok','youtube','engagement','community manager','ambassador','partecipazione attiva','cocreation','crowdsourcing','citizen science'],
    weight1: ['social','partecipazione','interazione']
  },
  'D9': { // Governance (asse trasformativo)
    weight3: ['fundraising culturale','sponsorship museale','partnership pubblico privato','art bonus','partecipazione bandi','candidatura pnrr','europa creativa'],
    weight2: ['governance','fundraising','partnership','sponsor','bilancio','consiglio amministrazione','cda','statuto','fondazione','gestione','art bonus','crowdfunding','pnrr','europa creativa','horizon','erasmus'],
    weight1: ['amministrazione','organizzazione','strategia']
  },
  'D10': { // Welfare culturale (asse trasformativo)
    weight3: ['welfare culturale','musei alzheimer','cultura e salute','rigenerazione urbana cultura','musei pubblici fragili','arte terapia museo'],
    weight2: ['welfare','inclusione sociale','salute','benessere','anziani','alzheimer','demenza','carcere','ospedale','fragilita sociale','rigenerazione urbana','arte terapia','cultura e cura','welfare community'],
    weight1: ['comunita','benessere','sociale']
  }
};

// ============================================================================
// CORE TAGGER
// ============================================================================

/**
 * Tagga un testo con 1-3 dimensioni MuseMu Matrix piu pertinenti.
 * @param {string} text  Testo libero (titolo + sommario concatenati)
 * @param {Object} [opts]
 *   opts.maxDims (int, default 3)   — numero massimo di dimensioni ritornate
 *   opts.minScore (int, default 2)  — soglia minima di score per accettare una dim
 * @return {string} CSV es. "D7,D8" oppure '' se nessuna dimensione applicabile
 */
function _tagMatrixDim_(text, opts) {
  opts = opts || {};
  var maxDims = opts.maxDims || 3;
  var minScore = opts.minScore || 2;
  if (!text) return '';
  var lower = String(text).toLowerCase();
  var scores = [];
  Object.keys(OC_MATRIX_KEYWORDS).forEach(function(dim) {
    var defs = OC_MATRIX_KEYWORDS[dim];
    var sc = 0;
    (defs.weight3||[]).forEach(function(kw){ if (_kwMatch_(lower, kw)) sc += 3; });
    (defs.weight2||[]).forEach(function(kw){ if (_kwMatch_(lower, kw)) sc += 2; });
    (defs.weight1||[]).forEach(function(kw){ if (_kwMatch_(lower, kw)) sc += 1; });
    if (sc >= minScore) scores.push({ dim: dim, score: sc });
  });
  scores.sort(function(a,b){ return b.score - a.score; });
  return scores.slice(0, maxDims).map(function(x){ return x.dim; }).join(',');
}

/**
 * Match di una keyword nel testo (case-insensitive, con boundary semplice).
 * Se la keyword contiene spazi: match diretto come substring.
 * Se single-word: usa regex \b...\b per evitare match parziali.
 */
function _kwMatch_(textLower, kw) {
  var k = String(kw).toLowerCase().trim();
  if (!k) return false;
  if (k.indexOf(' ') >= 0 || k.indexOf('-') >= 0) {
    return textLower.indexOf(k) >= 0;
  }
  // Single word: use word boundary
  var safe = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('\\b' + safe + '\\b', 'i');
  return re.test(textLower);
}

// ============================================================================
// SCHEMA: aggiunge colonna MatrixDim ai fogli (idempotente)
// ============================================================================

/**
 * Garantisce la presenza della colonna `MatrixDim` nel foglio passato.
 * Se gia esiste, ritorna il numero di colonna senza modificare nulla.
 *
 * @param {Sheet} sheet
 * @return {number} indice colonna (1-based) di MatrixDim
 */
function _ensureMatrixDimColumn_(sheet) {
  if (!sheet) throw new Error('_ensureMatrixDimColumn_: sheet null');
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    // Foglio vuoto: aggiungi header
    sheet.getRange(1, 1).setValue(OC_MATRIX_DIM_COLUMN);
    return 1;
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = headers.indexOf(OC_MATRIX_DIM_COLUMN);
  if (idx >= 0) return idx + 1;
  var newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(OC_MATRIX_DIM_COLUMN)
    .setFontWeight('bold').setBackground('#0E7490').setFontColor('#fff');
  return newCol;
}

/**
 * One-shot: garantisce colonna MatrixDim sui 3 fogli di contenuto.
 * Ritorna { items, bandi, podcast } con indice colonna risultante.
 */
function setupMatrixDimColumns() {
  Logger.log('=== SETUP COLONNA MatrixDim sui 3 fogli ===');
  var res = {};
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    if (ss) {
      var shItems = ss.getSheetByName('Items');
      if (shItems) { res.items = _ensureMatrixDimColumn_(shItems); Logger.log('Items: colonna ' + res.items); }
      else { Logger.log('Items: foglio non trovato'); }
      var shPod = ss.getSheetByName('Podcast');
      if (shPod) { res.podcast = _ensureMatrixDimColumn_(shPod); Logger.log('Podcast: colonna ' + res.podcast); }
      else { Logger.log('Podcast: foglio non trovato'); }
    }
    // Bandi sta su spreadsheet separato (RADAR)
    if (typeof getSheetRadar === 'function') {
      var shRadar = getSheetRadar();
      if (shRadar) { res.bandi = _ensureMatrixDimColumn_(shRadar); Logger.log('RADAR Bandi: colonna ' + res.bandi); }
      else { Logger.log('RADAR Bandi: getSheetRadar() ritorna null'); }
    }
  } catch(e) {
    Logger.log('setupMatrixDimColumns errore: ' + e.message);
    return { error: e.message };
  }
  Logger.log('=== Setup completato ===');
  return res;
}

// ============================================================================
// TAGGER RETROATTIVO
// ============================================================================

/**
 * Applica il tagger keyword retroattivamente ai record con MatrixDim vuoto.
 * Esecuzione a batch per non superare il timeout GAS (~6 min).
 *
 * @param {Object} [opts]
 *   opts.target ('items'|'bandi'|'podcast'|'all', default 'all')
 *   opts.batchSize (int, default 200)  — record processati per chiamata
 *   opts.dryRun (bool, default false)  — se true, calcola ma non scrive
 * @return {Object} { items:{processed,tagged,skipped}, bandi:{...}, podcast:{...} }
 */
function tagMatrixDimRetroattivo(opts) {
  opts = opts || {};
  var target = opts.target || 'all';
  var batchSize = opts.batchSize || 200;
  var dryRun = !!opts.dryRun;
  Logger.log('=== TAG RETROATTIVO target=' + target + ' batch=' + batchSize + ' dryRun=' + dryRun + ' ===');

  var summary = {};
  if (target === 'all' || target === 'items')   summary.items   = _tagMatrixDimSheet_('items', batchSize, dryRun);
  if (target === 'all' || target === 'bandi')   summary.bandi   = _tagMatrixDimSheet_('bandi', batchSize, dryRun);
  if (target === 'all' || target === 'podcast') summary.podcast = _tagMatrixDimSheet_('podcast', batchSize, dryRun);
  Logger.log('=== Tagging completato ===');
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

/**
 * Tagger applicato a un singolo foglio. Per ciascun foglio sappiamo
 * dove pescare titolo e sommario per il tagging:
 *   - items   : Titolo (col Titolo) + Sommario/Descrizione (se presente)
 *   - bandi   : Titolo + Note + Settore + Ente
 *   - podcast : Titolo (col 3) + SommarioAI (col 10) + TagAI (col 11)
 */
function _tagMatrixDimSheet_(target, batchSize, dryRun) {
  var sh = null;
  try {
    if (target === 'items' || target === 'podcast') {
      var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
      if (!ss) return { error:'spreadsheet null' };
      sh = ss.getSheetByName(target === 'items' ? 'Items' : 'Podcast');
    } else if (target === 'bandi') {
      sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
    }
    if (!sh) return { error:'sheet non trovato per ' + target };
  } catch(e) { return { error: e.message }; }

  var matrixCol = _ensureMatrixDimColumn_(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { processed:0, tagged:0, skipped:0, note:'foglio vuoto' };

  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  // Identifica colonne testo da concatenare per il tagging
  var textCols = _identifyTextColsFor_(target, headers);
  if (!textCols.length) return { error:'nessuna colonna testo identificata per ' + target };

  // Carica solo righe con MatrixDim vuoto (limita a batchSize)
  var allValues = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  var processed = 0, tagged = 0, skipped = 0, errors = 0;
  var updates = []; // { rowIndex, value }
  for (var i = 0; i < allValues.length; i++) {
    if (processed >= batchSize) break;
    var row = allValues[i];
    var existing = String(row[matrixCol - 1] || '').trim();
    if (existing) { skipped++; continue; }
    processed++;
    // Concatena testo
    var text = textCols.map(function(c){ return String(row[c-1] || ''); }).join(' ').trim();
    if (!text) continue;
    var dims = _tagMatrixDim_(text);
    if (dims) {
      tagged++;
      updates.push({ row: i + 2, value: dims }); // +2: header + 1-based
    }
  }

  // Scrittura batch
  if (!dryRun && updates.length) {
    try {
      updates.forEach(function(u){
        sh.getRange(u.row, matrixCol).setValue(u.value);
      });
    } catch(e) { errors++; Logger.log('Write error: ' + e.message); }
  }

  return {
    processed: processed,
    tagged: tagged,
    skipped: skipped,
    errors: errors,
    matrixCol: matrixCol,
    foglio: target,
    dryRun: dryRun
  };
}

/**
 * Identifica le colonne (1-based) dove pescare il testo per il tagging,
 * dato il target e gli header del foglio. Match case-insensitive sui nomi.
 */
function _identifyTextColsFor_(target, headers) {
  var headersLow = headers.map(function(h){ return String(h||'').toLowerCase().trim(); });
  var idx = function(name) {
    var i = headersLow.indexOf(String(name).toLowerCase());
    return i >= 0 ? i + 1 : 0;
  };
  var cols = [];
  if (target === 'items') {
    [idx('titolo'), idx('Title'), idx('sommario'), idx('descrizione'), idx('summary'), idx('tag'), idx('tagAI')].forEach(function(c){ if (c) cols.push(c); });
  } else if (target === 'bandi') {
    [idx('titolo'), idx('settore'), idx('ente'), idx('note'), idx('descrizione'), idx('regione')].forEach(function(c){ if (c) cols.push(c); });
  } else if (target === 'podcast') {
    [idx('titolo'), idx('sommarioai'), idx('tagai'), idx('tematica'), idx('serie')].forEach(function(c){ if (c) cols.push(c); });
  }
  return cols;
}

// ============================================================================
// STATS PER DASHBOARD ADMIN
// ============================================================================

/**
 * Conta record taggati / totali per ogni foglio. Per dashboard admin.
 * @return { items, bandi, podcast: {totale, tagged, percent} }
 */
function getMatrixTaggingStats() {
  var stats = { items:{}, bandi:{}, podcast:{} };
  ['items','bandi','podcast'].forEach(function(target) {
    try {
      var sh = null;
      if (target === 'items' || target === 'podcast') {
        var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
        if (ss) sh = ss.getSheetByName(target === 'items' ? 'Items' : 'Podcast');
      } else if (target === 'bandi') {
        sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
      }
      if (!sh) { stats[target] = { error:'sheet non trovato' }; return; }
      var lastRow = sh.getLastRow();
      var lastCol = sh.getLastColumn();
      if (lastRow < 2 || lastCol === 0) { stats[target] = { totale:0, tagged:0, percent:0 }; return; }
      var headers = sh.getRange(1,1,1,lastCol).getValues()[0];
      var matrixIdx = headers.indexOf(OC_MATRIX_DIM_COLUMN);
      if (matrixIdx < 0) { stats[target] = { totale: lastRow - 1, tagged:0, percent:0, missing_column:true }; return; }
      var col = sh.getRange(2, matrixIdx + 1, lastRow - 1, 1).getValues();
      var tagged = col.filter(function(r){ return String(r[0]||'').trim() !== ''; }).length;
      var totale = lastRow - 1;
      stats[target] = { totale: totale, tagged: tagged, percent: totale ? Math.round((tagged / totale) * 100) : 0 };
    } catch(e) { stats[target] = { error: e.message }; }
  });
  return stats;
}

// ============================================================================
// DIAGNOSTICA
// ============================================================================

/**
 * Test rapido del tagger su 5 testi tipo. Esegui dall'editor GAS.
 */
function testMatrixTagger() {
  var samples = [
    'Bando PNRR per la digitalizzazione dei musei e patrimonio culturale: 50 milioni',
    'Workshop Easy-to-Read per audioguide accessibili nei musei: corso di formazione',
    'Open call: residenze artistiche per pubblici fragili e welfare culturale negli ospedali',
    'Nuovo allestimento sale espositive con illuminotecnica LED al Museo del Tessuto',
    'Programma membership e fidelizzazione visitatori museali: best practice',
    'Audience development sui social media: strategia Instagram e TikTok per piccoli musei'
  ];
  Logger.log('=== TEST TAGGER MUSEMU MATRIX ===');
  samples.forEach(function(t, i) {
    var dims = _tagMatrixDim_(t);
    Logger.log((i+1) + '. ' + t.substring(0,80) + '... -> ' + (dims || '(nessuna)'));
  });
  return samples.map(function(t){ return { testo: t, dim: _tagMatrixDim_(t) }; });
}

// ============================================================================
// FINE Matrix_tagger.gs
// ============================================================================
