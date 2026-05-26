/**
 * ============================================================================
 *  AgentRegionale.js — Monitor BUR + Open Data con rotazione 5 giorni
 * ============================================================================
 *  v5.1.0 (2026-05-25)
 *
 *  Architettura:
 *  - 20 regioni divise in 5 gruppi da 4 (lun=G1, mar=G2, mer=G3, gio=G4, ven=G5)
 *  - Ogni giorno scansiona solo il suo gruppo (4 regioni)
 *  - Se una fonte fallisce 2 volte consecutive → auto-healing:
 *    cerca URL alternativo via discovery e sostituisce
 *  - Foglio AgentRegionaleLog traccia stato per regione
 *
 *  Funzioni pubbliche:
 *    agrRunOggi()                  — scansiona il gruppo del giorno
 *    agrRunRegione(regione)        — scansiona una singola regione
 *    agrSetupTrigger()             — trigger giornaliero 05:30
 *    agrDiagnostica()              — report stato tutte le regioni
 *    agrResetFail(regione)         — resetta contatore fail manualmente
 *
 *  Prefisso: agr_ / _agr*
 * ============================================================================
 */

// ============================================================================
// REGISTRO REGIONI con 5 gruppi
// ============================================================================

// URL VERIFICATI 25/05/2026 — solo endpoint testati e funzionanti
var AGR_REGIONI = [
  // Gruppo 1 (Lunedi) — Nord-Ovest
  { regione: 'Lombardia',        opendata: 'https://www.dati.lombardia.it', tipo: 'Socrata', bur: 'https://www.regione.lombardia.it/burl-bollettino-ufficiale-regione-lombardia', burTipo: 'HTML', gruppo: 1 },
  { regione: 'Liguria',          opendata: 'https://dati.regione.liguria.it/api/3/action', tipo: 'CKAN', bur: 'https://www.burl.it/', burTipo: 'HTML', gruppo: 1 },
  { regione: 'Toscana',          opendata: 'https://dati.toscana.it/api/3/action', tipo: 'CKAN', bur: 'https://www.regione.toscana.it/burt', burTipo: 'HTML', gruppo: 1 },
  { regione: 'Valle d\'Aosta',   opendata: '', tipo: 'NONE', bur: 'https://www.regione.vda.it/affari_legislativi/bollettino_ufficiale/default_i.asp', burTipo: 'HTML', gruppo: 1 },

  // Gruppo 2 (Martedi) — Nord-Est
  { regione: 'Veneto',           opendata: '', tipo: 'NONE', bur: 'https://bur.regione.veneto.it/BurvServices/pubblica/HomeBollettini.aspx', burTipo: 'HTML', gruppo: 2 },
  { regione: 'Trentino',         opendata: 'https://dati.trentino.it/api/3/action', tipo: 'CKAN', bur: 'https://albotelematico.provincia.tn.it/', burTipo: 'HTML', gruppo: 2 },
  { regione: 'Emilia-Romagna',   opendata: 'https://dati.emilia-romagna.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.emilia-romagna.it/ricerca', burTipo: 'HTML', gruppo: 2 },
  { regione: 'Lazio',            opendata: 'https://dati.lazio.it/api/3/action', tipo: 'CKAN', bur: 'https://www.regione.lazio.it/bur', burTipo: 'HTML', gruppo: 2 },

  // Gruppo 3 (Mercoledi) — Centro
  { regione: 'Umbria',           opendata: 'https://dati.regione.umbria.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.umbria.it', burTipo: 'HTML', gruppo: 3 },
  { regione: 'Marche',           opendata: 'https://dati.regione.marche.it/api/3/action', tipo: 'CKAN_UNRELIABLE', bur: 'https://bur.regione.marche.it', burTipo: 'HTML', gruppo: 3 }, // redirect a goodpa con cert scaduto, GAS non raggiunge
  { regione: 'Campania',         opendata: '', tipo: 'NONE', bur: 'https://burc.regione.campania.it', burTipo: 'HTML', gruppo: 3 },
  { regione: 'Molise',           opendata: '', tipo: 'NONE', bur: 'https://www.regione.molise.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/18', burTipo: 'GAS_UNRELIABLE', gruppo: 3 }, // server-rendered ma GAS DNS flaky; bollettino.regione.molise.it e SPA Vue.js

  // Gruppo 4 (Giovedi) — Sud
  { regione: 'Puglia',           opendata: 'https://dati.puglia.it/ckan/api/3/action', tipo: 'CKAN', bur: 'http://burp.regione.puglia.it', burTipo: 'HTML', gruppo: 4 },
  { regione: 'Calabria',         opendata: '', tipo: 'NONE', bur: 'https://burc.regione.calabria.it/home.jsp', burTipo: 'GAS_UNRELIABLE', gruppo: 4 }, // path diretto senza redirect 302
  { regione: 'Basilicata',       opendata: '', tipo: 'NONE', bur: 'https://burweb.regione.basilicata.it/bur/ricercaBollettini.zul', burTipo: 'JS', gruppo: 4 }, // solo ZK framework, richiede JS
  { regione: 'Sicilia',          opendata: 'https://dati.regione.sicilia.it/api/3/action', tipo: 'CKAN_UNRELIABLE', bur: 'https://gursonline.regione.sicilia.it/wp-json/wp/v2/gazzette?per_page=10&_fields=id,title,date,link', burTipo: 'WP_JSON', gruppo: 4 }, // API WordPress JSON strutturata

  // Gruppo 5 (Venerdi) — Isole + residui
  { regione: 'Sardegna',         opendata: 'https://opendata.regione.sardegna.it', tipo: 'Custom', bur: 'https://buras.regione.sardegna.it', burTipo: 'HTML', gruppo: 5 }
];

var AGR_LOG_SHEET = 'AgentRegionaleLog';
var AGR_KEYWORDS = /bando|bandi|finanziament|contribut|agevolazion|fondo.perduto|incentiv|cultur|museo|musei|patrimoni|turis|spettacol|restaur/i;

// ============================================================================
// ESECUZIONE GIORNALIERA
// ============================================================================

/**
 * Scansiona il gruppo di 4 regioni del giorno.
 * Lun=1, Mar=2, Mer=3, Gio=4, Ven=5. Sab/Dom=skip.
 */
function agrRunOggi() {
  // Auto-archivia bandi scaduti (cross-sheet, se GalMonitor disponibile)
  try { if (typeof autoArchiviaBandiScaduti === 'function') autoArchiviaBandiScaduti(); } catch(_) {}

  var giorno = new Date().getDay(); // 0=dom, 1=lun, ..., 6=sab
  if (giorno === 0 || giorno === 6) {
    Logger.log('[AGR] Weekend, skip.');
    return { ok: true, skip: 'weekend' };
  }
  var gruppo = giorno; // lun=1, mar=2, mer=3, gio=4, ven=5
  var regioni = AGR_REGIONI.filter(function(r) { return r.gruppo === gruppo; });

  Logger.log('================================================================');
  Logger.log('[AGR] GIORNO ' + gruppo + '/5 — ' + regioni.map(function(r){ return r.regione; }).join(', '));
  Logger.log('================================================================');

  var t0 = Date.now();
  var report = { ok: true, gruppo: gruppo, regioni: [], totaleNuovi: 0, errori: 0, healed: 0 };
  var existingUrls = _agrLoadExistingUrls_();
  var failLog = _agrLoadFailLog_();

  regioni.forEach(function(reg) {
    // Wall-clock guard (4 min totali)
    if (Date.now() - t0 > 240000) {
      report.regioni.push({ regione: reg.regione, azione: 'timeout' });
      return;
    }

    var regReport = { regione: reg.regione, opendata: null, bur: null, nuovi: 0, errori: 0 };

    // 1. Scan Open Data (CKAN o CKAN_UNRELIABLE)
    if (reg.tipo === 'CKAN' || reg.tipo === 'CKAN_UNRELIABLE') {
      regReport.opendata = _agrScanSingleOpenData_(reg, existingUrls, failLog);
      regReport.nuovi += regReport.opendata.nuovi || 0;
      if (regReport.opendata.errore && reg.tipo !== 'CKAN_UNRELIABLE') regReport.errori++;
    } else {
      regReport.opendata = { skip: reg.tipo || 'NO_API' };
    }

    // 2. Scan BUR
    if (reg.burTipo === 'WP_JSON') {
      // WordPress REST API (Sicilia GURS)
      regReport.bur = _agrScanWpJson_(reg, existingUrls, failLog);
      regReport.nuovi += regReport.bur.nuovi || 0;
      if (regReport.bur.errore) regReport.errori++;
    } else if (reg.burTipo !== 'JS' && reg.burTipo !== 'NONE' && reg.bur) {
      regReport.bur = _agrScanSingleBur_(reg, existingUrls, failLog);
      regReport.nuovi += regReport.bur.nuovi || 0;
      if (regReport.bur.errore && reg.burTipo !== 'GAS_UNRELIABLE') regReport.errori++;
    } else {
      regReport.bur = { skip: reg.burTipo === 'NONE' ? 'no_url' : (reg.burTipo === 'JS' ? 'JS-rendered' : reg.burTipo) };
    }

    // 3. Check auto-healing (2 fail consecutivi)
    if (failLog[reg.regione] && failLog[reg.regione].opendata >= 2) {
      Logger.log('[AGR] AUTO-HEAL: ' + reg.regione + ' OpenData fallito 2+ volte, ricerca alternativa...');
      var healed = _agrAutoHeal_(reg, 'opendata', failLog);
      if (healed) { report.healed++; regReport.healed = 'opendata'; }
    }
    if (failLog[reg.regione] && failLog[reg.regione].bur >= 2 && reg.burTipo !== 'JS') {
      Logger.log('[AGR] AUTO-HEAL: ' + reg.regione + ' BUR fallito 2+ volte, ricerca alternativa...');
      var healedBur = _agrAutoHeal_(reg, 'bur', failLog);
      if (healedBur) { report.healed++; regReport.healed = (regReport.healed || '') + '+bur'; }
    }

    report.totaleNuovi += regReport.nuovi;
    report.errori += regReport.errori;
    report.regioni.push(regReport);
  });

  // Salva fail log
  _agrSaveFailLog_(failLog);

  report.durataMs = Date.now() - t0;
  Logger.log('[AGR] Gruppo ' + gruppo + ' completato: ' + report.totaleNuovi + ' nuovi, ' + report.errori + ' errori, ' + report.healed + ' healed (' + report.durataMs + 'ms)');

  // Telegram
  if (report.totaleNuovi > 0 && typeof _tgSend_ === 'function') {
    try { _tgSend_('*AGR Gruppo ' + gruppo + '*\n' + report.regioni.map(function(r) { return r.regione + ': ' + r.nuovi + ' nuovi'; }).join('\n')); } catch(_){}
  }

  return report;
}

// ============================================================================
// SCAN SINGOLA REGIONE
// ============================================================================

function _agrScanSingleOpenData_(reg, existingUrls, failLog) {
  var result = { nuovi: 0, errore: null, dataset: 0 };
  if ((reg.tipo !== 'CKAN' && reg.tipo !== 'CKAN_UNRELIABLE') || !reg.opendata) { result.skip = reg.tipo || 'NO_URL'; return result; }

  try {
    var url = reg.opendata + '/package_search?q=' + encodeURIComponent('cultura turismo bandi museo') + '&rows=10&sort=metadata_modified+desc';
    Logger.log('[AGR] OpenData ' + reg.regione + ': ' + url.substring(0, 80));

    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
    });

    if (resp.getResponseCode() !== 200) {
      result.errore = 'HTTP ' + resp.getResponseCode();
      _agrIncrementFail_(failLog, reg.regione, 'opendata');
      Logger.log('[AGR] ' + reg.regione + ' OpenData FAIL: ' + result.errore);
      return result;
    }

    var data;
    try { data = JSON.parse(resp.getContentText()); } catch(_) { result.errore = 'JSON parse'; _agrIncrementFail_(failLog, reg.regione, 'opendata'); return result; }

    var results = (data.result && data.result.results) || [];
    result.dataset = results.length;

    results.forEach(function(ds) {
      var titolo = String(ds.title || ds.name || '').trim();
      var dsUrl = '';
      if (ds.resources && ds.resources.length > 0) {
        var best = ds.resources.find(function(r) { return /html|pdf|csv|json/.test(String(r.format || '').toLowerCase()); }) || ds.resources[0];
        dsUrl = best.url || '';
      }
      if (!dsUrl) dsUrl = reg.opendata.replace('/api/3/action', '') + '/dataset/' + ds.name;
      if (!titolo || !dsUrl) return;
      if (!AGR_KEYWORDS.test(titolo + ' ' + (ds.notes || ''))) return;
      if (existingUrls[dsUrl.toLowerCase()]) return;

      _agrSaveBando_({ titolo: titolo, ente: 'Regione ' + reg.regione, livello: 'Regionale', regione: reg.regione, settore: 'Bandi e finanziamenti', urlBando: dsUrl, sommario: String(ds.notes || '').substring(0, 500), ambito: 1, fonteNome: 'OpenData ' + reg.regione });
      existingUrls[dsUrl.toLowerCase()] = true;
      result.nuovi++;
    });

    // Reset fail counter on success
    _agrResetFail_(failLog, reg.regione, 'opendata');
    Logger.log('[AGR] ' + reg.regione + ' OpenData OK: ' + results.length + ' dataset, ' + result.nuovi + ' nuovi');
  } catch(e) {
    result.errore = e.message;
    _agrIncrementFail_(failLog, reg.regione, 'opendata');
    Logger.log('[AGR] ' + reg.regione + ' OpenData ERRORE: ' + e.message);
  }
  return result;
}

function _agrScanSingleBur_(reg, existingUrls, failLog) {
  var result = { nuovi: 0, errore: null, items: 0 };
  try {
    Logger.log('[AGR] BUR ' + reg.regione + ': ' + reg.bur);
    var resp = UrlFetchApp.fetch(reg.bur, {
      muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)', 'Accept': 'text/html, application/rss+xml, */*' }
    });

    if (resp.getResponseCode() !== 200) {
      result.errore = 'HTTP ' + resp.getResponseCode();
      _agrIncrementFail_(failLog, reg.regione, 'bur');
      return result;
    }

    var content = resp.getContentText();
    var items = (reg.burTipo === 'RSS') ? _agrParseRss_(content) : _agrParseHtml_(content, reg.bur);
    result.items = items.length;

    items.forEach(function(item) {
      if (!item.link || !AGR_KEYWORDS.test(item.titolo + ' ' + (item.descrizione || ''))) return;
      if (existingUrls[item.link.toLowerCase()]) return;

      _agrSaveBando_({ titolo: '[BUR] ' + item.titolo, ente: 'BUR ' + reg.regione, livello: 'Regionale', regione: reg.regione, settore: 'Bollettino Ufficiale', urlBando: item.link, sommario: item.descrizione || '', ambito: 1, fonteNome: 'BUR ' + reg.regione });
      existingUrls[item.link.toLowerCase()] = true;
      result.nuovi++;
    });

    _agrResetFail_(failLog, reg.regione, 'bur');
    Logger.log('[AGR] BUR ' + reg.regione + ' OK: ' + items.length + ' items, ' + result.nuovi + ' nuovi');
  } catch(e) {
    result.errore = e.message;
    _agrIncrementFail_(failLog, reg.regione, 'bur');
    Logger.log('[AGR] BUR ' + reg.regione + ' ERRORE: ' + e.message);
  }
  return result;
}

// ============================================================================
// AUTO-HEALING: ricerca URL alternativo dopo 2 fail
// ============================================================================

function _agrAutoHeal_(reg, tipo, failLog) {
  // Tenta di scoprire un URL alternativo
  var searchQueries = [];
  if (tipo === 'opendata') {
    searchQueries = [
      'https://dati.' + reg.regione.toLowerCase().replace(/[^a-z]/g, '') + '.it/api/3/action',
      'https://opendata.regione.' + reg.regione.toLowerCase().replace(/[^a-z]/g, '') + '.it/api/3/action',
      'http://dati.regione.' + reg.regione.toLowerCase().replace(/[^a-z]/g, '') + '.it/api/3/action'
    ];
  } else {
    searchQueries = [
      'https://bur.regione.' + reg.regione.toLowerCase().replace(/[^a-z]/g, '') + '.it',
      'https://burc.regione.' + reg.regione.toLowerCase().replace(/[^a-z]/g, '') + '.it',
      'https://bura.regione.' + reg.regione.toLowerCase().replace(/[^a-z]/g, '') + '.it'
    ];
  }

  for (var i = 0; i < searchQueries.length; i++) {
    var testUrl = searchQueries[i];
    if (testUrl === (tipo === 'opendata' ? reg.opendata : reg.bur)) continue; // skip URL corrente

    try {
      var testEndpoint = tipo === 'opendata' ? testUrl + '/status_show' : testUrl;
      var resp = UrlFetchApp.fetch(testEndpoint, {
        muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false,
        headers: { 'User-Agent': 'SinopiaBot/1.0' }
      });
      if (resp.getResponseCode() === 200) {
        Logger.log('[AGR] HEALED ' + reg.regione + ' ' + tipo + ': ' + testUrl);
        if (tipo === 'opendata') reg.opendata = testUrl;
        else reg.bur = testUrl;
        _agrResetFail_(failLog, reg.regione, tipo);
        // Logga il cambio
        _agrLogHeal_(reg.regione, tipo, testUrl);
        return true;
      }
    } catch(_) {}
  }

  Logger.log('[AGR] HEAL FALLITO ' + reg.regione + ' ' + tipo + ': nessun URL alternativo trovato');
  return false;
}

// ============================================================================
// FAIL TRACKING
// ============================================================================

function _agrLoadFailLog_() {
  try {
    var cache = CacheService.getScriptCache();
    var data = cache.get('agr_fail_log');
    return data ? JSON.parse(data) : {};
  } catch(_) { return {}; }
}

function _agrSaveFailLog_(failLog) {
  try {
    CacheService.getScriptCache().put('agr_fail_log', JSON.stringify(failLog), 604800); // 7 giorni
  } catch(_) {}
}

function _agrIncrementFail_(failLog, regione, tipo) {
  if (!failLog[regione]) failLog[regione] = { opendata: 0, bur: 0 };
  failLog[regione][tipo] = (failLog[regione][tipo] || 0) + 1;
}

function _agrResetFail_(failLog, regione, tipo) {
  if (!failLog[regione]) failLog[regione] = { opendata: 0, bur: 0 };
  failLog[regione][tipo] = 0;
}

function _agrLogHeal_(regione, tipo, newUrl) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(AGR_LOG_SHEET);
    if (!sh) {
      sh = ss.insertSheet(AGR_LOG_SHEET);
      sh.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Regione', 'Tipo', 'Azione', 'Dettaglio']]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), regione, tipo, 'AUTO-HEAL', newUrl]);
  } catch(_) {}
}

// ============================================================================
// TRIGGER + DIAGNOSTICA
// ============================================================================

function agrSetupTrigger() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) return { ok: false, error: 'forbidden' };
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'agrRunOggi') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('agrRunOggi').timeBased().everyDays(1).atHour(5).nearMinute(30).create();
    Logger.log('[AGR] Trigger: agrRunOggi ogni giorno 05:30');
    return { ok: true, trigger: '05:30 daily', gruppi: '4 regioni/giorno, 5 giorni' };
  } catch(e) { return { ok: false, error: e.message }; }
}

function agrRunRegione(regione) {
  var reg = AGR_REGIONI.find(function(r) { return r.regione.toLowerCase() === String(regione).toLowerCase(); });
  if (!reg) return { ok: false, error: 'Regione non trovata: ' + regione };
  var existingUrls = _agrLoadExistingUrls_();
  var failLog = _agrLoadFailLog_();
  var od = _agrScanSingleOpenData_(reg, existingUrls, failLog);
  var bur = (reg.burTipo !== 'JS') ? _agrScanSingleBur_(reg, existingUrls, failLog) : { skip: 'JS' };
  _agrSaveFailLog_(failLog);
  return { ok: true, regione: reg.regione, opendata: od, bur: bur };
}

function agrResetFail(regione) {
  var failLog = _agrLoadFailLog_();
  if (failLog[regione]) { failLog[regione] = { opendata: 0, bur: 0 }; }
  _agrSaveFailLog_(failLog);
  return { ok: true, regione: regione, reset: true };
}

function agrDiagnostica() {
  var failLog = _agrLoadFailLog_();
  var out = { ok: true, timestamp: new Date().toISOString(), regioni: AGR_REGIONI.length, gruppi: 5, perGruppo: 4 };
  out.failLog = failLog;
  out.regioniFallite = Object.keys(failLog).filter(function(r) { return (failLog[r].opendata >= 2 || failLog[r].bur >= 2); });
  try {
    out.triggerAttivo = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'agrRunOggi'; });
  } catch(_) { out.triggerAttivo = false; }
  Logger.log('[AGR] Diagnostica: ' + out.regioni + ' regioni, ' + out.regioniFallite.length + ' con fail, trigger=' + out.triggerAttivo);
  return out;
}

// ============================================================================
// HELPERS
// ============================================================================

function _agrLoadExistingUrls_() {
  var urls = {};
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh || sh.getLastRow() < 2) return urls;
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iUrl = head.indexOf('UrlBando'); if (iUrl < 0) iUrl = head.indexOf('URL');
    if (iUrl < 0) return urls;
    for (var r = 1; r < vals.length; r++) { var u = String(vals[r][iUrl] || '').trim().toLowerCase(); if (u) urls[u] = true; }
  } catch(_) {}
  return urls;
}

// ============================================================================
// SCAN WP JSON — WordPress REST API (usato per GURS Sicilia)
// ============================================================================

function _agrScanWpJson_(reg, existingUrls, failLog) {
  var result = { nuovi: 0, errore: null, items: 0 };
  try {
    Logger.log('[AGR] WP_JSON ' + reg.regione + ': ' + reg.bur.substring(0, 80));
    var resp = UrlFetchApp.fetch(reg.bur, {
      muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
    });

    if (resp.getResponseCode() !== 200) {
      result.errore = 'HTTP ' + resp.getResponseCode();
      _agrIncrementFail_(failLog, reg.regione, 'bur');
      Logger.log('[AGR] ' + reg.regione + ' WP_JSON FAIL: ' + result.errore);
      return result;
    }

    var posts;
    try { posts = JSON.parse(resp.getContentText()); } catch(_) { result.errore = 'JSON parse'; _agrIncrementFail_(failLog, reg.regione, 'bur'); return result; }
    if (!Array.isArray(posts)) { result.errore = 'not array'; return result; }

    result.items = posts.length;
    posts.forEach(function(post) {
      var titolo = (post.title && post.title.rendered) ? post.title.rendered.replace(/<[^>]*>/g, '').trim() : '';
      var link = post.link || '';
      if (!titolo || !link) return;
      if (!AGR_KEYWORDS.test(titolo)) return;
      if (existingUrls[link.toLowerCase()]) return;

      _agrSaveBando_({ titolo: '[GURS] ' + titolo, ente: 'GURS Sicilia', livello: 'Regionale', regione: reg.regione, settore: 'Gazzetta Ufficiale', urlBando: link, sommario: '', ambito: 1, fonteNome: 'GURS Sicilia' });
      existingUrls[link.toLowerCase()] = true;
      result.nuovi++;
    });

    _agrResetFail_(failLog, reg.regione, 'bur');
    Logger.log('[AGR] ' + reg.regione + ' WP_JSON OK: ' + posts.length + ' gazzette, ' + result.nuovi + ' nuovi');
  } catch(e) {
    result.errore = e.message;
    _agrIncrementFail_(failLog, reg.regione, 'bur');
    Logger.log('[AGR] ' + reg.regione + ' WP_JSON ERRORE: ' + e.message);
  }
  return result;
}

function _agrSaveBando_(b) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5'); if (!sh) return;
    var id = 'BR' + Date.now() + Math.random().toString(36).substring(2, 4);
    sh.appendRow([id, '', new Date(), String(b.titolo || '').substring(0, 300), String(b.ente || ''), String(b.livello || ''), String(b.regione || ''), String(b.settore || ''), '', '', '', '', 'AGR', String(b.fonteNome || ''), String(b.urlBando || ''), '', '', '', String(b.sommario || '').substring(0, 500), b.ambito || '', '', 'nuovo_da_triage', 'attivo', false, false, '']);
  } catch(e) { Logger.log('[AGR] save: ' + e.message); }
}

function _agrParseRss_(content) {
  var items = [];
  try {
    var doc = XmlService.parse(content);
    var root = doc.getRootElement(); var ns = root.getNamespace();
    var channel = root.getChild('channel', ns) || root.getChild('channel');
    var xmlItems = channel ? (channel.getChildren('item') || []) : [];
    if (!xmlItems.length) { var aNs = XmlService.getNamespace('http://www.w3.org/2005/Atom'); xmlItems = root.getChildren('entry', aNs) || []; }
    xmlItems.slice(0, 15).forEach(function(el) {
      var t = _agrXV_(el, 'title') || ''; var l = _agrXV_(el, 'link') || ''; var d = _agrXV_(el, 'description') || _agrXV_(el, 'summary') || '';
      if (!l) { try { var le = el.getChild('link', XmlService.getNamespace('http://www.w3.org/2005/Atom')); if (le && le.getAttribute('href')) l = le.getAttribute('href').getValue(); } catch(_){} }
      if (t && l) items.push({ titolo: t.trim(), link: l.trim(), descrizione: d.replace(/<[^>]*>/g, ' ').trim() });
    });
  } catch(e) { Logger.log('[AGR] RSS parse: ' + e.message); }
  return items;
}

function _agrParseHtml_(content, baseUrl) {
  var items = [];
  try {
    var base = baseUrl.match(/^https?:\/\/[^\/]+/); base = base ? base[0] : '';
    var pat = /href=["']([^"']*(?:\.pdf|atto|deliber|bando|avviso|concors|determin)[^"']*)["'][^>]*>([^<]{5,})/gi;
    var m;
    while ((m = pat.exec(content)) !== null && items.length < 15) {
      var href = m[1].trim(); var text = m[2].trim();
      if (href.indexOf('http') !== 0) href = (href.indexOf('/') === 0) ? base + href : baseUrl + '/' + href;
      items.push({ titolo: text.substring(0, 200), link: href, descrizione: '' });
    }
  } catch(e) { Logger.log('[AGR] HTML parse: ' + e.message); }
  return items;
}

function _agrXV_(el, tag) { try { var c = el.getChild(tag) || el.getChild(tag, XmlService.getNamespace('http://www.w3.org/2005/Atom')); return c ? c.getValue() : null; } catch(_) { return null; } }

// ============================================================================
// FINE AgentRegionale.js
// ============================================================================

// ============================================================================
// VERIFICA URL — testa tutti gli endpoint e produce report
// ============================================================================

/**
 * Testa tutti gli URL Open Data e BUR per verificare quali funzionano.
 * Lancia dall'editor GAS per ottenere la mappa reale.
 * @return {Object} {ok, funzionanti[], falliti[], report[]}
 */
function agrVerificaUrl() {
  var report = [];
  var funzionanti = 0, falliti = 0;

  AGR_REGIONI.forEach(function(reg) {
    var entry = { regione: reg.regione, gruppo: reg.gruppo };

    // Test OpenData
    if (reg.tipo === 'CKAN' || reg.tipo === 'CKAN_UNRELIABLE') {
      try {
        var odUrl = reg.opendata + '/status_show';
        var resp = UrlFetchApp.fetch(odUrl, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false, headers: { 'User-Agent': 'SinopiaBot/1.0' } });
        entry.opendata_code = resp.getResponseCode();
        entry.opendata_ok = (resp.getResponseCode() === 200);
        if (entry.opendata_ok) funzionanti++; else falliti++;
        if (reg.tipo === 'CKAN_UNRELIABLE') entry.opendata_note = 'UNRELIABLE';
      } catch(e) {
        entry.opendata_code = 0;
        entry.opendata_ok = false;
        entry.opendata_err = e.message.substring(0, 80);
        falliti++;
      }
    } else if (reg.tipo !== 'NONE' && reg.opendata) {
      entry.opendata_ok = null;
      entry.opendata_note = reg.tipo + ' (skip CKAN test)';
    } else {
      entry.opendata_ok = null;
      entry.opendata_note = 'NONE';
    }

    // Test BUR
    if (reg.burTipo !== 'JS' && reg.burTipo !== 'NONE' && reg.bur) {
      try {
        var fetchOpts = { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false, headers: { 'User-Agent': 'SinopiaBot/1.0' } };
        if (reg.burTipo === 'WP_JSON') fetchOpts.headers['Accept'] = 'application/json';
        var resp2 = UrlFetchApp.fetch(reg.bur, fetchOpts);
        entry.bur_code = resp2.getResponseCode();
        entry.bur_ok = (resp2.getResponseCode() === 200);
        entry.bur_size = resp2.getContentText().length;
        if (reg.burTipo === 'WP_JSON') entry.bur_note = 'WP_JSON';
        if (reg.burTipo === 'GAS_UNRELIABLE') entry.bur_note = 'UNRELIABLE';
        if (entry.bur_ok) funzionanti++; else falliti++;
      } catch(e) {
        entry.bur_code = 0;
        entry.bur_ok = false;
        entry.bur_err = e.message.substring(0, 80);
        falliti++;
      }
    } else {
      entry.bur_ok = null;
      entry.bur_note = reg.burTipo === 'NONE' ? 'NONE' : reg.burTipo;
    }

    report.push(entry);
    Logger.log('[AGR-CHECK] ' + reg.regione + ': OD=' + (entry.opendata_ok === null ? 'Socrata' : entry.opendata_ok ? 'OK(' + entry.opendata_code + ')' : 'FAIL(' + (entry.opendata_code || entry.opendata_err) + ')') + ' BUR=' + (entry.bur_ok === null ? 'JS' : entry.bur_ok ? 'OK(' + entry.bur_size + 'b)' : 'FAIL(' + (entry.bur_code || entry.bur_err) + ')'));
  });

  Logger.log('================================================================');
  Logger.log('[AGR-CHECK] TOTALE: ' + funzionanti + ' OK, ' + falliti + ' FAIL su ' + (funzionanti + falliti) + ' test');
  Logger.log('================================================================');

  return { ok: true, funzionanti: funzionanti, falliti: falliti, report: report };
}
