// ============================================================================
//  TestRunner.js — Runner unificato per tutti i self-test del progetto
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//  v4.27.39 — Area critica #6: test automatici
//
//  Esegue tutti i self-test registrati (classificatori, gate, filtri)
//  e produce un report aggregato. Nessuna scrittura, nessun fetch.
//
//  Uso: eseguire ocRunAllTests() dall'editor GAS o dal pannello admin.
//  Ritorna { ok, totalPass, totalFail, suites[] }
// ============================================================================

/**
 * Registro dei test disponibili.
 * Ogni entry: { name, fn, description }
 * Le funzioni devono restituire { ok:bool, pass:number, fail:number }
 */
var _OC_TEST_SUITES = [
  {
    name: 'bandiGate',
    fn: 'bandiGateSelfTest',
    description: 'Classificatore cultura/non-cultura per bandi (isBandoCulturale)'
  },
  {
    name: 'normeCultura',
    fn: 'normeCulturaSelfTest',
    description: 'Classificatore normativa + cultura per auto-popolamento Norme'
  },
  {
    name: 'lavoroCultura',
    fn: 'lavoroCulturaSelfTest',
    description: 'Classificatore concorsi/opportunita lavoro cultura (GU 4a Serie)'
  },
  {
    name: 'scoutFonti',
    fn: 'scSelfTest',
    description: 'Scout fonti: normalizzazione domini, blacklist, catalogo atenei'
  },
  {
    name: 'tassonomia',
    fn: 'txSelfTest',
    description: 'Tassonomia T1-T10: euristica, normalizzazione risposta modello, catalogo'
  },
  {
    name: 'registroFonti',
    fn: 'rfSelfTest',
    description: 'Registro fonti unico: schema, scrittura per nome colonna, dedup URL'
  },
  {
    name: 'fontiSezioni',
    fn: 'fsSelfTest',
    description: 'Riallineamento fonti podcast/video su FontiFeed (scrittura per nome colonna)'
  },
  {
    name: 'discovery',
    fn: 'discoverySelfTest',
    description: 'Classificatore rilevanza podcast/pubblicazioni (PubDiscovery)'
  },
  // v4.27.94 — suite aggiunte con il lavoro sul Radar Bandi (31/07-01/08)
  {
    name: 'fontiRegia',
    fn: 'frSelfTest',
    description: 'Tier di priorità delle fonti (A/B/C) e natura del canale (bandi/news)'
  },
  {
    name: 'cicloVitaBandi',
    fn: 'bcvSelfTest',
    description: 'Riconoscimento regione per la mappa del Radar'
  },
  {
    name: 'dedupDigest',
    fn: 'ddSelfTest',
    description: 'Registro anti-ripetizione digest e coerenza tipologica'
  }
];

/**
 * Esegue tutti i self-test e restituisce un report aggregato.
 * Nessun effetto collaterale: solo lettura in-memory.
 */
function ocRunAllTests() {
  var t0 = Date.now();
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    totalPass: 0,
    totalFail: 0,
    suites: [],
    durataMs: 0
  };

  Logger.log('================================================================');
  Logger.log('[TEST] Runner unificato — ' + _OC_TEST_SUITES.length + ' suite');
  Logger.log('================================================================');

  _OC_TEST_SUITES.forEach(function(suite) {
    var result = { name: suite.name, description: suite.description, pass: 0, fail: 0, ok: false, error: null };
    try {
      var fn = this[suite.fn];
      if (typeof fn !== 'function') {
        result.error = 'funzione ' + suite.fn + ' non trovata';
        result.ok = false;
      } else {
        var r = fn();
        result.pass = r.pass || 0;
        result.fail = r.fail || 0;
        result.ok = r.ok !== false && result.fail === 0;
      }
    } catch (e) {
      result.error = e.message;
      result.ok = false;
    }

    report.totalPass += result.pass;
    report.totalFail += result.fail;
    if (!result.ok) report.ok = false;
    report.suites.push(result);

    var icon = result.ok ? 'PASS' : 'FAIL';
    Logger.log('[' + icon + '] ' + suite.name + ': ' + result.pass + '/' + (result.pass + result.fail) +
      (result.error ? ' — ERR: ' + result.error : ''));
  });

  report.durataMs = Date.now() - t0;

  Logger.log('================================================================');
  Logger.log('[TEST] Risultato: ' + report.totalPass + ' PASS, ' + report.totalFail + ' FAIL' +
    (report.ok ? ' — TUTTO OK' : ' — FALLIMENTI RILEVATI') +
    ' (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  return report;
}

/**
 * Versione per AdminTools — restituisce risultato leggibile dal pannello admin.
 */
function ocRunAllTestsAdmin() {
  return ocRunAllTests();
}
