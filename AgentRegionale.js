/**
 * ============================================================================
 *  AgentRegionale.js — Monitor BUR + Open Data con rotazione 5 giorni
 * ============================================================================
 *  v5.0.7 (2026-05-25)
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

var AGR_REGIONI = [
  // Gruppo 1 (Lunedi)
  { regione: 'Lombardia',        opendata: 'https://www.dati.lombardia.it/resource/', tipo: 'Socrata', bur: 'https://www.consultazioniburl.servizirl.it/', burTipo: 'JS', gruppo: 1 },
  { regione: 'Piemonte',         opendata: 'https://dati.piemonte.it/api/3/action', tipo: 'CKAN', bur: 'https://www.regione.piemonte.it/web/bur', burTipo: 'HTML', gruppo: 1 },
  { regione: 'Liguria',          opendata: 'https://data.regione.liguria.it/api/3/action', tipo: 'CKAN', bur: 'https://burc.regione.liguria.it', burTipo: 'HTML', gruppo: 1 },
  { regione: 'Valle d\'Aosta',   opendata: 'https://dati.regione.vda.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.vda.it', burTipo: 'HTML', gruppo: 1 },

  // Gruppo 2 (Martedi)
  { regione: 'Veneto',           opendata: 'https://dati.veneto.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.veneto.it', burTipo: 'HTML', gruppo: 2 },
  { regione: 'Friuli-V.Giulia',  opendata: 'https://dati.regione.fvg.it/resource/', tipo: 'Socrata', bur: 'https://bur.regione.fvg.it', burTipo: 'HTML', gruppo: 2 },
  { regione: 'Trentino',         opendata: 'https://dati.trentino.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.taa.it', burTipo: 'HTML', gruppo: 2 },
  { regione: 'Emilia-Romagna',   opendata: 'https://dati.emilia-romagna.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.emilia-romagna.it/bur/area-utenti/rss', burTipo: 'RSS', gruppo: 2 },

  // Gruppo 3 (Mercoledi)
  { regione: 'Toscana',          opendata: 'https://dati.toscana.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.toscana.it', burTipo: 'HTML', gruppo: 3 },
  { regione: 'Umbria',           opendata: 'http://dati.umbria.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.umbria.it', burTipo: 'HTML', gruppo: 3 },
  { regione: 'Marche',           opendata: 'http://opendata.regione.marche.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.marche.it', burTipo: 'HTML', gruppo: 3 },
  { regione: 'Lazio',            opendata: 'http://dati.lazio.it/resource/', tipo: 'Socrata', bur: 'https://bur.regione.lazio.it', burTipo: 'JS', gruppo: 3 },

  // Gruppo 4 (Giovedi)
  { regione: 'Abruzzo',          opendata: 'https://opendata.regione.abruzzo.it/api/3/action', tipo: 'CKAN', bur: 'https://bura.regione.abruzzo.it', burTipo: 'HTML', gruppo: 4 },
  { regione: 'Molise',           opendata: 'http://dati.regione.molise.it/api/3/action', tipo: 'CKAN', bur: 'https://bur.regione.molise.it', burTipo: 'HTML', gruppo: 4 },
  { regione: 'Campania',         opendata: 'http://dati.regione.campania.it/api/3/action', tipo: 'CKAN', bur: 'https://burc.regione.campania.it', burTipo: 'HTML', gruppo: 4 },
  { regione: 'Puglia',           opendata: 'https://dati.puglia.it/ckan/api/3/action', tipo: 'CKAN', bur: 'https://burp.regione.puglia.it', burTipo: 'HTML', gruppo: 4 },

  // Gruppo 5 (Venerdi)
  { regione: 'Basilicata',       opendata: 'http://dati.basilicata.it/api/3/action', tipo: 'CKAN', bur: 'https://burweb.regione.basilicata.it', burTipo: 'HTML', gruppo: 5 },
  { regione: 'Calabria',         opendata: 'http://dati.regione.calabria.it/api/3/action', tipo: 'CKAN', bur: 'https://burc.regione.calabria.it', burTipo: 'HTML', gruppo: 5 },
  { regione: 'Sicilia',          opendata: 'http://dati.regione.sicilia.it/api/3/action', tipo: 'CKAN', bur: 'https://www.gazzettaufficiale.regione.sicilia.it', burTipo: 'HTML', gruppo: 5 },
  { regione: 'Sardegna',         opendata: 'http://dati.regione.sardegna.it/api/3/action', tipo: 'CKAN', bur: 'https://buras.regione.sardegna.it', burTipo: 'HTML', gruppo: 5 }
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

    // 1. Scan Open Data
    regReport.opendata = _agrScanSingleOpenData_(reg, existingUrls, failLog);
    regReport.nuovi += regReport.opendata.nuovi || 0;
    if (regReport.opendata.errore) regReport.errori++;

    // 2. Scan BUR (solo se non JS-rendered)
    if (reg.burTipo !== 'JS') {
      regReport.bur = _agrScanSingleBur_(reg, existingUrls, failLog);
      regReport.nuovi += regReport.bur.nuovi || 0;
      if (regReport.bur.errore) regReport.errori++;
    } else {
      regReport.bur = { skip: 'JS-rendered' };
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
  if (reg.tipo === 'Socrata') { result.skip = 'Socrata'; return result; }

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
      var testEndpoint = tipo === 'opendata' ? testUrl + '/site_read' : testUrl;
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
