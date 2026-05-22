// ============================================================================
//  Crossref_v1.gs — Monitoraggio trasversale L2: news → bandi (v4.18.17 · 2026-05-12)
// ----------------------------------------------------------------------------
//  Implementa F4 della filosofia F2 (Principio 1 - Trasversalità delle fonti).
//
//  Logica: il monitoraggio bandi diretto (L1) non basta. Spesso una news
//  esce PRIMA o INVECE del bando ufficiale (annuncio politico, conferenza
//  stampa, articolo Tafter/FAI). Questo modulo:
//    1. scansiona il foglio Items (news) cercando keyword bando-rilevanti
//    2. crea righe candidate in BandiCandidatiL2 (workflow approvazione)
//    3. admin valida → la candidate diventa un bando "candidato" in Bandi_v5
//
//  Approccio: keyword-based (semplice, controllabile). In futuro estendere
//  con LLM classifier per ridurre falsi positivi.
//
//  Endpoint pubblici:
//    scanCrossrefNewsBandi()      — esegue scansione (admin)
//    getCrossrefCandidates(opts)  — elenco candidate (admin)
//    approveCrossrefCandidate(id) — promuove candidate a bando in Bandi_v5
//    rejectCrossrefCandidate(id)  — marca candidate come "scartato"
// ============================================================================

var CR_CANDIDATES_SHEET = 'BandiCandidatiL2';
var CR_HEADERS = [
  'id','timestamp_rilevato','news_row','news_titolo','news_fonte','news_link','news_data',
  'keyword_match','stato','note_admin','timestamp_decisione'
];

// Keyword che identificano probabili "menzioni di bando" nelle news
// Voce: lemma o pattern (case-insensitive). Filosofia: alta specificità.
var CR_KEYWORDS = [
  'bando','avviso pubblico','call for proposals','finanziamento',
  'pnrr','fesr','fse','m1c3','fondo cultura','fondo nazionale',
  'contributo a fondo perduto','contributo regionale',
  'scadenza candidatura','scadenza domande','scadenza presentazione',
  'erogazione','sovvenzione','programma operativo','manifestazione di interesse',
  'procedura selettiva','concorso di idee','progetto di valorizzazione'
];

// ============================================================================
// ENDPOINT: scanCrossrefNewsBandi() — esegue scansione foglio Items
// ============================================================================

/**
 * Scansiona le news del foglio Items e crea candidate nel foglio BandiCandidatiL2
 * per ogni news che contiene una o più keyword bando-rilevanti.
 *
 * @param {Object} opts — { limit:int (default 0=tutti), dryRun:bool }
 * @return { ok, scansionate, candidateNuove, sampleMatch:[...] }
 *
 * Idempotente: una news già marcata come candidata non viene duplicata.
 */
function scanCrossrefNewsBandi(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  opts = opts || {};
  var limit = Number(opts.limit) || 0;
  var dryRun = !!opts.dryRun;

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shItems = ss.getSheetByName((typeof SH !== 'undefined' && SH && SH.ITEMS) ? SH.ITEMS : 'Items');
    if (!shItems) return { ok:false, error:'foglio_Items_assente' };

    var shCand = _getOrCreateCandidatesSheet_();

    // Mappa news_row → id (per evitare duplicati)
    var existingRows = {};
    var candVals = shCand.getDataRange().getValues();
    if (candVals.length > 1) {
      var iRow = candVals[0].indexOf('news_row');
      for (var c = 1; c < candVals.length; c++) {
        var nr = candVals[c][iRow];
        if (nr) existingRows[String(nr)] = true;
      }
    }

    var vals = shItems.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, scansionate:0, candidateNuove:0 };
    var head = vals[0].map(function(h){ return String(h||'').trim(); });

    function colIdx(names) {
      for (var i=0;i<head.length;i++) {
        var hl = head[i].toLowerCase();
        for (var j=0;j<names.length;j++) if (hl === names[j].toLowerCase()) return i;
      }
      return -1;
    }
    var iTit  = colIdx(['Titolo','Title']);
    var iLink = colIdx(['FonteURL','Link','URL']);
    var iFont = colIdx(['Fonte','Source','Feed']);
    var iData = colIdx(['DataPubblicazione','Data','PubDate']);
    var iSomm = colIdx(['SommarioAI','Sommario','Descrizione','Estratto','Summary']);
    var iArch = colIdx(['Archiviato','archiviato']);

    var scansionate = 0, candidateNuove = 0;
    var sample = [];

    for (var r = 1; r < vals.length; r++) {
      if (limit > 0 && scansionate >= limit) break;
      var row = vals[r];
      if (!row[iTit]) continue;
      // skip già archiviate
      if (iArch >= 0) {
        var a = row[iArch];
        if (a === true || a === 'TRUE' || String(a).toLowerCase() === 'true' || a === 1) continue;
      }
      scansionate++;

      // skip se già candidata
      var newsRowKey = String(r + 1);
      if (existingRows[newsRowKey]) continue;

      // Concatena testo per match keyword
      var text = (
        String(row[iTit] || '') + ' ' +
        (iSomm >= 0 ? String(row[iSomm] || '') : '')
      ).toLowerCase();

      // Cerca keyword (almeno 1 match)
      var matches = [];
      for (var k = 0; k < CR_KEYWORDS.length; k++) {
        var kw = CR_KEYWORDS[k];
        if (text.indexOf(kw) >= 0) matches.push(kw);
      }

      if (matches.length === 0) continue;

      // È candidata: append nel foglio (se non dryRun)
      var candId = 'CR' + Date.now() + Math.random().toString(36).substring(2, 5);
      candidateNuove++;
      if (sample.length < 5) {
        sample.push({
          newsRow: r + 1,
          titolo: String(row[iTit] || '').substring(0, 100),
          keywords: matches
        });
      }
      if (!dryRun) {
        shCand.appendRow([
          candId,
          new Date(),
          r + 1,
          String(row[iTit] || ''),
          iFont >= 0 ? String(row[iFont] || '') : '',
          iLink >= 0 ? String(row[iLink] || '') : '',
          iData >= 0 ? row[iData] : '',
          matches.join(' · '),
          'pending', // pending / approved / rejected
          '',
          ''
        ]);
      }
    }

    Logger.log('scanCrossrefNewsBandi dryRun=' + dryRun + ': scansionate=' + scansionate + ' candidateNuove=' + candidateNuove);
    return { ok:true, scansionate: scansionate, candidateNuove: candidateNuove, dryRun: dryRun, sample: sample };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// ENDPOINT: getCrossrefCandidates(opts) — elenco candidate per admin
// ============================================================================

/**
 * Ritorna le candidate (pending di default) per il pannello admin di approvazione.
 * @param {Object} opts — { stato:string (default 'pending'), limit:int (default 50) }
 */
function getCrossrefCandidates(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  opts = opts || {};
  var statoFilter = opts.stato || 'pending';
  var limit = Number(opts.limit) || 50;

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CR_CANDIDATES_SHEET);
    if (!sh) return { ok:true, candidate:[], count:0, note:'Foglio non ancora creato (esegui prima la scansione)' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, candidate:[], count:0 };
    var head = vals[0];
    var idx = {};
    head.forEach(function(h,i){ idx[h] = i; });

    var out = [];
    for (var r = vals.length - 1; r >= 1 && out.length < limit; r--) {
      var row = vals[r];
      var stato = String(row[idx.stato] || '');
      if (statoFilter && statoFilter !== 'tutti' && stato !== statoFilter) continue;
      out.push({
        id: row[idx.id],
        rowIdx: r + 1,
        timestamp: row[idx.timestamp_rilevato] ? new Date(row[idx.timestamp_rilevato]).toLocaleString('it-IT') : '',
        newsTitolo: row[idx.news_titolo],
        newsFonte: row[idx.news_fonte],
        newsLink: row[idx.news_link],
        keywords: row[idx.keyword_match],
        stato: stato,
        noteAdmin: row[idx.note_admin] || ''
      });
    }
    return { ok:true, candidate: out, count: out.length };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// ENDPOINT: approveCrossrefCandidate(id) — promuove a bando v5
// ============================================================================

/**
 * Marca candidate come approved e crea voce in Bandi_v5 con stato 'candidato'
 * (da rifinire manualmente da Silvano nel foglio: scadenza, importo, ente).
 */
function approveCrossrefCandidate(id) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  if (!id) return { ok:false, error:'id mancante' };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CR_CANDIDATES_SHEET);
    if (!sh) return { ok:false, error:'foglio_candidates_assente' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var idx = {};
    head.forEach(function(h,i){ idx[h] = i; });

    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][idx.id]) !== String(id)) continue;
      // Aggiorna stato
      sh.getRange(r + 1, idx.stato + 1).setValue('approved');
      sh.getRange(r + 1, idx.timestamp_decisione + 1).setValue(new Date());

      // Crea voce in Bandi_v5 (se foglio esiste e schema disponibile)
      try {
        var shBandi = ss.getSheetByName(typeof SH_BANDI_V5 === 'string' ? SH_BANDI_V5 : 'Bandi_v5');
        if (shBandi && typeof COL_B !== 'undefined') {
          var nr = new Array(20).fill('');
          nr[COL_B.ID - 1]               = 'BC' + Date.now();
          nr[COL_B.FINGERPRINT - 1]      = '';
          nr[COL_B.DATA_RILEVAMENTO - 1] = new Date();
          nr[COL_B.TITOLO - 1]           = '[da cross-ref news] ' + (vals[r][idx.news_titolo] || '');
          nr[COL_B.ENTE - 1]             = vals[r][idx.news_fonte] || '';
          nr[COL_B.URL_BANDO - 1]        = vals[r][idx.news_link] || '';
          // STATO_RECORD = 'candidato' (da rifinire manualmente)
          nr[COL_B.STATO_RECORD - 1]     = 'candidato';
          nr[COL_B.SOMMARIO - 1]         = 'Origine: news con keyword "' + (vals[r][idx.keyword_match] || '') + '". Da rifinire manualmente: scadenza, importo, ente effettivo, URL ufficiale.';
          shBandi.appendRow(nr);
        }
      } catch(eB) { Logger.log('append Bandi_v5: ' + eB.message); }

      return { ok:true, id:id, statoNuovo:'approved', bandi_v5_creato:true };
    }
    return { ok:false, error:'id non trovato' };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// ENDPOINT: rejectCrossrefCandidate(id, nota) — scarta candidate (no bando)
// ============================================================================

function rejectCrossrefCandidate(id, nota) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  if (!id) return { ok:false, error:'id mancante' };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CR_CANDIDATES_SHEET);
    if (!sh) return { ok:false, error:'foglio_candidates_assente' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var idx = {};
    head.forEach(function(h,i){ idx[h] = i; });

    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][idx.id]) !== String(id)) continue;
      sh.getRange(r + 1, idx.stato + 1).setValue('rejected');
      sh.getRange(r + 1, idx.timestamp_decisione + 1).setValue(new Date());
      if (nota) sh.getRange(r + 1, idx.note_admin + 1).setValue(String(nota));
      return { ok:true, id:id, statoNuovo:'rejected' };
    }
    return { ok:false, error:'id non trovato' };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// HELPERS
// ============================================================================

function _getOrCreateCandidatesSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CR_CANDIDATES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CR_CANDIDATES_SHEET);
    sh.getRange(1, 1, 1, CR_HEADERS.length).setValues([CR_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ============================================================================
// FINE Crossref_v1.gs
// ============================================================================
