/**
 * ============================================================================
 *  Matrix_benchmark_v1.gs — Benchmark dinamico Matrix
 * ============================================================================
 *  Sprint 3 (2026-05-11) — calcolo statistico in tempo reale sui compilatori
 *
 *  Scopo: confronto del punteggio del compilatore corrente con la distribuzione
 *  reale degli altri compilatori (mediana + percentili). Sostituisce il
 *  benchmark statico per profilo.
 *
 *  Funzioni esportate:
 *    getMatrixDynamicBenchmark()     — { ok, perDim: {D1: {median, p25, p75, n}}, total }
 *    getMatrixCompareWithBenchmark(scoring) — restituisce gap per dim vs mediana
 *
 *  Cache: PropertiesService 6 ore. Si invalida automaticamente alla prossima
 *  saveMatrixResponse() per mantenere i dati freschi.
 * ============================================================================
 */

var MB_CACHE_KEY = 'matrix_benchmark_cache_v1';
var MB_CACHE_TTL_MS = 6 * 3600 * 1000;  // 6 ore
var MB_DIMENSIONS = ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10'];
// Dipende da OC_MATRIX_RESPONSES_SHEET (definito in Matrix_v1.js / Matrix_digest.js)
if (typeof OC_MATRIX_RESPONSES_SHEET === 'undefined') var OC_MATRIX_RESPONSES_SHEET = 'ResponsesMatrix';

// ============================================================================
// MAIN: getMatrixDynamicBenchmark()
// ============================================================================

function getMatrixDynamicBenchmark() {
  try {
    // Cache hit?
    var p = PropertiesService.getScriptProperties();
    var cached = p.getProperty(MB_CACHE_KEY);
    if (cached) {
      try {
        var c = JSON.parse(cached);
        if (c.expiresAt && c.expiresAt > Date.now()) {
          c.fromCache = true;
          return c;
        }
      } catch(e) { /* fallthrough — rigenera */ }
    }

    var ss = getMainSS();
    var sh = ss.getSheetByName(OC_MATRIX_RESPONSES_SHEET);
    if (!sh || sh.getLastRow() < 2) {
      var empty = { ok: true, perDim: {}, total: 0, message: 'Nessun compilatore ancora — benchmark non disponibile' };
      return empty;
    }
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var iScoring = head.indexOf('scoring_dimensions_json');
    var iStatus  = head.indexOf('completion_status');
    if (iScoring < 0) return { ok: false, error: 'colonna scoring_dimensions_json non trovata' };

    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

    // Aggrega per dimensione
    var perDim = {};
    MB_DIMENSIONS.forEach(function(d){ perDim[d] = []; });
    var validCount = 0;

    for (var r = 0; r < vals.length; r++) {
      if (iStatus >= 0 && String(vals[r][iStatus]) !== 'complete') continue;
      var raw = vals[r][iScoring];
      if (!raw) continue;
      try {
        var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        MB_DIMENSIONS.forEach(function(d){
          var s = Number(obj[d]);
          if (!isNaN(s) && s >= 0 && s <= 100) perDim[d].push(s);
        });
        validCount++;
      } catch(e) { /* skip riga malformata */ }
    }

    var result = { ok: true, perDim: {}, total: validCount, generatedAt: new Date().toISOString() };
    MB_DIMENSIONS.forEach(function(d){
      var arr = perDim[d].slice().sort(function(a,b){ return a-b; });
      if (arr.length === 0) {
        result.perDim[d] = { n:0, median:null, p25:null, p75:null, mean:null };
        return;
      }
      var n = arr.length;
      result.perDim[d] = {
        n: n,
        median: _mbPercentile_(arr, 0.5),
        p25:    _mbPercentile_(arr, 0.25),
        p75:    _mbPercentile_(arr, 0.75),
        mean:   Math.round(arr.reduce(function(s,x){return s+x;}, 0) / n)
      };
    });

    // Cache
    result.expiresAt = Date.now() + MB_CACHE_TTL_MS;
    try { p.setProperty(MB_CACHE_KEY, JSON.stringify(result)); } catch(e) {}
    return result;
  } catch(e) {
    Logger.log('getMatrixDynamicBenchmark ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function _mbPercentile_(sortedArr, q) {
  var pos = (sortedArr.length - 1) * q;
  var base = Math.floor(pos);
  var rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return Math.round(sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]));
  }
  return sortedArr[base];
}

// ============================================================================
// MAIN: getMatrixCompareWithBenchmark(scoring)
// Restituisce gap del compilatore vs benchmark dinamico (per radar chart)
// ============================================================================

function getMatrixCompareWithBenchmark(userScoring) {
  try {
    if (!userScoring) return { ok: false, error: 'scoring vuoto' };
    var bench = getMatrixDynamicBenchmark();
    if (!bench.ok || bench.total === 0) {
      // Nessun benchmark: ritorna solo i punteggi user senza confronto
      var fallback = { ok: true, total: 0, dimensions: [] };
      MB_DIMENSIONS.forEach(function(d){
        fallback.dimensions.push({
          dim: d,
          user: Number(userScoring[d] || 0),
          median: null, p25: null, p75: null,
          gap: null
        });
      });
      return fallback;
    }
    var out = { ok: true, total: bench.total, dimensions: [] };
    MB_DIMENSIONS.forEach(function(d){
      var u = Number(userScoring[d] || 0);
      var b = bench.perDim[d] || {};
      out.dimensions.push({
        dim: d,
        user: u,
        median: b.median,
        p25: b.p25,
        p75: b.p75,
        n: b.n,
        gap: (b.median != null) ? (u - b.median) : null
      });
    });
    return out;
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// v4.18.38 (audit 2026-05-14) — Rimossa invalidateMatrixBenchmarkCache():
//   il commento "chiamato da saveMatrixResponse" era bugiardo (zero callers verificati).
//   Se si vuole invalidare la cache benchmark dopo nuove compilazioni Matrix,
//   richiamare PropertiesService.getScriptProperties().deleteProperty(MB_CACHE_KEY)
//   direttamente nel saveMatrixResponse di Matrix_v1.js.

// ============================================================================
// TEST
// ============================================================================

function testMatrixBenchmark() {
  var b = getMatrixDynamicBenchmark();
  Logger.log('Benchmark dinamico:');
  Logger.log(JSON.stringify(b, null, 2));
  return b;
}

// ============================================================================
// FINE MODULO Matrix_benchmark_v1.gs
// ============================================================================
