/**
 * ============================================================================
 *  AgentRegionale.js — Monitoraggio Bollettini Ufficiali e Open Data Regionali
 * ============================================================================
 *  v5.0.6 (2026-05-25)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Agente che monitora:
 *  1. Portali Open Data regionali (CKAN API) per dataset cultura/turismo
 *  2. BUR (Bollettini Ufficiali Regionali) per bandi anticipati
 *  3. OpenCUP per investimenti pubblici cultura/turismo per regione
 *
 *  Funzioni pubbliche:
 *    agrScanOpenDataRegionali(opts)   — scan CKAN API di tutte le regioni
 *    agrScanBUR(opts)                 — scan BUR per nuovi bandi (HTML/RSS)
 *    agrRunCompleto(opts)             — orchestratore completo
 *    agrSetupTrigger()               — installa trigger settimanale
 *    agrDiagnostica()                — report stato
 *
 *  Prefisso unico: agr_ / _agr*
 * ============================================================================
 */

// ============================================================================
// REGISTRI REGIONALI
// ============================================================================

/**
 * 20 portali Open Data regionali con CKAN API.
 * Query: cultura OR turismo OR bandi OR finanziamenti OR museo
 */
var AGR_OPEN_DATA = [
  { regione: 'Abruzzo',          base: 'https://opendata.regione.abruzzo.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Basilicata',       base: 'http://dati.basilicata.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Calabria',         base: 'http://dati.regione.calabria.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Campania',         base: 'http://dati.regione.campania.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Emilia-Romagna',   base: 'https://dati.emilia-romagna.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Friuli-V.Giulia',  base: 'https://dati.regione.fvg.it/resource/', tipo: 'Socrata' },
  { regione: 'Lazio',            base: 'http://dati.lazio.it/resource/', tipo: 'Socrata' },
  { regione: 'Liguria',          base: 'https://data.regione.liguria.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Lombardia',        base: 'https://www.dati.lombardia.it/resource/', tipo: 'Socrata' },
  { regione: 'Marche',           base: 'http://opendata.regione.marche.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Molise',           base: 'http://dati.regione.molise.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Piemonte',         base: 'https://dati.piemonte.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Puglia',           base: 'https://dati.puglia.it/ckan/api/3/action', tipo: 'CKAN' },
  { regione: 'Sardegna',         base: 'http://dati.regione.sardegna.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Sicilia',          base: 'http://dati.regione.sicilia.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Toscana',          base: 'https://dati.toscana.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Trentino',         base: 'https://dati.trentino.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Umbria',           base: 'http://dati.umbria.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Valle d\'Aosta',   base: 'https://dati.regione.vda.it/api/3/action', tipo: 'CKAN' },
  { regione: 'Veneto',           base: 'https://dati.veneto.it/api/3/action', tipo: 'CKAN' }
];

/**
 * BUR con RSS o HTML scansionabile (non tutti hanno feed).
 * Priorita: regioni con RSS o HTML pulito prima.
 */
var AGR_BUR = [
  { regione: 'Emilia-Romagna', url: 'https://bur.regione.emilia-romagna.it/bur/area-utenti/rss', tipo: 'RSS', note: 'Feed RSS ufficiale' },
  { regione: 'Piemonte',       url: 'https://www.regione.piemonte.it/web/bur', tipo: 'HTML', note: 'Indice HTML pulito' },
  { regione: 'Toscana',        url: 'https://bur.regione.toscana.it', tipo: 'HTML', note: 'Parte III Bandi' },
  { regione: 'Veneto',         url: 'https://bur.regione.veneto.it', tipo: 'HTML', note: 'Tabella atti singoli' },
  { regione: 'Puglia',         url: 'https://burp.regione.puglia.it', tipo: 'HTML', note: 'Indice bisettimanale' },
  { regione: 'Sicilia',        url: 'https://www.gazzettaufficiale.regione.sicilia.it', tipo: 'HTML', note: 'Parte III bandi' },
  { regione: 'Umbria',         url: 'https://bur.regione.umbria.it', tipo: 'HTML', note: 'Atti per materia' },
  { regione: 'Marche',         url: 'https://bur.regione.marche.it', tipo: 'HTML', note: 'Atti singoli' },
  { regione: 'Sardegna',       url: 'https://buras.regione.sardegna.it', tipo: 'HTML', note: 'Sezione Bandi e Gare' },
  { regione: 'Calabria',       url: 'https://burc.regione.calabria.it', tipo: 'HTML', note: 'Atti con keyword' },
  { regione: 'Abruzzo',        url: 'https://bura.regione.abruzzo.it', tipo: 'HTML', note: 'Indice cronologico' },
  { regione: 'Lombardia',      url: 'https://www.consultazioniburl.servizirl.it/', tipo: 'JS', note: 'Richiede JS rendering' }
];

// Query di ricerca per CKAN
var AGR_QUERY = 'cultura OR turismo OR museo OR bando OR finanziamento OR patrimonio OR spettacolo';
var AGR_MAX_RESULTS = 15;

// Keyword per filtrare risultati rilevanti
var AGR_KEYWORDS = /bando|bandi|finanziament|contribut|agevolazion|fondo perduto|incentiv|cultur|museo|musei|patrimoni|turis|spettacol|restaur|archeolog/i;

// ============================================================================
// SCAN OPEN DATA REGIONALI (CKAN API)
// ============================================================================

/**
 * Scansiona i portali CKAN regionali per dataset cultura/turismo.
 * @param {Object} [opts] {maxRegioni, dryRun}
 * @return {Object} {ok, regioni, nuovi, duplicati, errori, dettagli[]}
 */
function agrScanOpenDataRegionali(opts) {
  opts = opts || {};
  var maxReg = opts.maxRegioni || AGR_OPEN_DATA.length;
  var dryRun = !!opts.dryRun;
  var report = { ok: true, regioni: 0, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var existingUrls = _agrLoadExistingUrls_();
  var startTime = Date.now();

  for (var i = 0; i < Math.min(maxReg, AGR_OPEN_DATA.length); i++) {
    var reg = AGR_OPEN_DATA[i];
    report.regioni++;

    // Wall-clock guard (4 min)
    if (Date.now() - startTime > 240000) {
      report.dettagli.push({ regione: 'TIMEOUT', rimanenti: AGR_OPEN_DATA.length - i });
      break;
    }

    if (reg.tipo !== 'CKAN') continue; // Socrata gestito separatamente

    try {
      var url = reg.base + '/package_search?q=' + encodeURIComponent(AGR_QUERY) + '&rows=' + AGR_MAX_RESULTS + '&sort=metadata_modified+desc';
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
      });

      if (resp.getResponseCode() !== 200) {
        report.errori++;
        report.dettagli.push({ regione: reg.regione, errore: 'HTTP ' + resp.getResponseCode() });
        continue;
      }

      var data;
      try { data = JSON.parse(resp.getContentText()); } catch(_) { report.errori++; continue; }

      var results = (data.result && data.result.results) || [];
      var regNuovi = 0;

      results.forEach(function(ds) {
        var titolo = String(ds.title || ds.name || '').trim();
        var dsUrl = '';
        if (ds.resources && ds.resources.length > 0) {
          var best = ds.resources.find(function(r) {
            return /html|pdf|csv|json/.test(String(r.format || '').toLowerCase());
          }) || ds.resources[0];
          dsUrl = best.url || '';
        }
        if (!dsUrl) dsUrl = reg.base.replace('/api/3/action', '') + '/dataset/' + ds.name;
        if (!titolo || !dsUrl) return;

        // Filtra rilevanza
        var allText = (titolo + ' ' + (ds.notes || '')).toLowerCase();
        if (!AGR_KEYWORDS.test(allText)) return;

        if (existingUrls[dsUrl.toLowerCase()]) { report.duplicati++; return; }

        if (!dryRun) {
          _agrSaveBando_({
            titolo: titolo,
            ente: (ds.organization && ds.organization.title) || 'Regione ' + reg.regione,
            livello: 'Regionale',
            regione: reg.regione,
            settore: 'Bandi e finanziamenti regionali',
            urlBando: dsUrl,
            sommario: String(ds.notes || '').substring(0, 500),
            ambito: 1,
            fonteNome: 'Open Data ' + reg.regione
          });
          existingUrls[dsUrl.toLowerCase()] = true;
        }
        report.nuovi++;
        regNuovi++;
      });

      report.dettagli.push({ regione: reg.regione, dataset: results.length, nuovi: regNuovi });
      if (results.length > 0) Logger.log('[AGR] ' + reg.regione + ': ' + results.length + ' dataset, ' + regNuovi + ' nuovi');
      Utilities.sleep(300); // rate limit cortesia
    } catch(e) {
      report.errori++;
      report.dettagli.push({ regione: reg.regione, errore: e.message });
    }
  }

  Logger.log('[AGR] OpenData regionale: ' + report.regioni + ' regioni, ' + report.nuovi + ' nuovi, ' + report.errori + ' errori');
  return report;
}

// ============================================================================
// SCAN BUR (Bollettini Ufficiali Regionali)
// ============================================================================

/**
 * Scansiona i BUR accessibili (RSS e HTML semplice).
 * Per i siti JS-rendered (Lombardia, Lazio) salta con nota.
 */
function agrScanBUR(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, regioni: 0, nuovi: 0, errori: 0, jsSkipped: 0, dettagli: [] };
  var existingUrls = _agrLoadExistingUrls_();
  var startTime = Date.now();

  for (var i = 0; i < AGR_BUR.length; i++) {
    var bur = AGR_BUR[i];
    report.regioni++;

    if (Date.now() - startTime > 240000) {
      report.dettagli.push({ regione: 'TIMEOUT' });
      break;
    }

    // Skip JS-rendered
    if (bur.tipo === 'JS') {
      report.jsSkipped++;
      report.dettagli.push({ regione: bur.regione, azione: 'skip_js', note: bur.note });
      continue;
    }

    try {
      var resp = UrlFetchApp.fetch(bur.url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)', 'Accept': 'text/html, application/rss+xml, application/xml, */*' }
      });

      if (resp.getResponseCode() !== 200) {
        report.errori++;
        report.dettagli.push({ regione: bur.regione, errore: 'HTTP ' + resp.getResponseCode() });
        continue;
      }

      var content = resp.getContentText();
      var items = [];

      if (bur.tipo === 'RSS') {
        items = _agrParseRss_(content, bur);
      } else {
        items = _agrParseHtmlBur_(content, bur);
      }

      var regNuovi = 0;
      items.forEach(function(item) {
        if (!item.link) return;
        // Filtra rilevanza
        var allText = (item.titolo + ' ' + (item.descrizione || '')).toLowerCase();
        if (!AGR_KEYWORDS.test(allText)) return;

        if (existingUrls[item.link.toLowerCase()]) { report.duplicati = (report.duplicati || 0) + 1; return; }

        if (!dryRun) {
          _agrSaveBando_({
            titolo: '[BUR ' + bur.regione + '] ' + item.titolo,
            ente: 'BUR ' + bur.regione,
            livello: 'Regionale',
            regione: bur.regione,
            settore: 'Bollettino Ufficiale Regionale',
            urlBando: item.link,
            sommario: String(item.descrizione || '').substring(0, 500),
            scadenza: item.data || '',
            ambito: 1,
            fonteNome: 'BUR ' + bur.regione
          });
          existingUrls[item.link.toLowerCase()] = true;
        }
        report.nuovi++;
        regNuovi++;
      });

      report.dettagli.push({ regione: bur.regione, tipo: bur.tipo, items: items.length, nuovi: regNuovi });
      if (items.length > 0) Logger.log('[AGR] BUR ' + bur.regione + ': ' + items.length + ' items, ' + regNuovi + ' nuovi');
    } catch(e) {
      report.errori++;
      report.dettagli.push({ regione: bur.regione, errore: e.message });
    }
  }

  Logger.log('[AGR] BUR scan: ' + report.regioni + ' regioni, ' + report.nuovi + ' nuovi, ' + report.jsSkipped + ' JS-skip, ' + report.errori + ' errori');
  return report;
}

// ============================================================================
// ORCHESTRATORE
// ============================================================================

/**
 * Esegue scan completo: Open Data regionali + BUR.
 */
function agrRunCompleto(opts) {
  var t0 = Date.now();
  var report = { ok: true, timestamp: new Date().toISOString(), openData: null, bur: null, totaleNuovi: 0, durataMs: 0 };

  Logger.log('================================================================');
  Logger.log('[AGR] AGENTE REGIONALE — ' + new Date().toISOString());
  Logger.log('================================================================');

  try {
    report.openData = agrScanOpenDataRegionali(opts);
    report.totaleNuovi += report.openData.nuovi;
  } catch(e) { report.openData = { ok: false, error: e.message }; }

  if (Date.now() - t0 < 240000) {
    try {
      report.bur = agrScanBUR(opts);
      report.totaleNuovi += report.bur.nuovi;
    } catch(e) { report.bur = { ok: false, error: e.message }; }
  } else {
    report.bur = { skipped: true };
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[AGR] Completato: ' + report.totaleNuovi + ' nuovi totali (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  // Telegram alert
  if (report.totaleNuovi > 0 && typeof _tgSend_ === 'function') {
    try {
      _tgSend_('*Agente Regionale*\nOpen Data: ' + (report.openData ? report.openData.nuovi : 0) + ' nuovi\nBUR: ' + (report.bur ? report.bur.nuovi : 0) + ' nuovi');
    } catch(_){}
  }

  return report;
}

/**
 * Installa trigger settimanale (mercoledi 05:00 — giorno pubblicazione BUR).
 */
function agrSetupTrigger() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) return { ok: false, error: 'forbidden' };
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'agrRunCompleto') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('agrRunCompleto')
      .timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(5).nearMinute(0).create();
    Logger.log('[AGR] Trigger installato: agrRunCompleto ogni mercoledi 05:00');
    return { ok: true, trigger: 'mer 05:00' };
  } catch(e) { return { ok: false, error: e.message }; }
}

/**
 * Diagnostica agente regionale.
 */
function agrDiagnostica() {
  var out = { ok: true, timestamp: new Date().toISOString() };
  out.regioniOpenData = AGR_OPEN_DATA.length;
  out.regioniBUR = AGR_BUR.length;
  out.burJsRendered = AGR_BUR.filter(function(b) { return b.tipo === 'JS'; }).length;
  try {
    var triggers = ScriptApp.getProjectTriggers();
    out.triggerAttivo = triggers.some(function(t) { return t.getHandlerFunction() === 'agrRunCompleto'; });
  } catch(_) { out.triggerAttivo = false; }
  Logger.log('[AGR] Diagnostica: ' + JSON.stringify(out));
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
    var iUrl = head.indexOf('UrlBando');
    if (iUrl < 0) iUrl = head.indexOf('URL');
    if (iUrl < 0) return urls;
    for (var r = 1; r < vals.length; r++) {
      var u = String(vals[r][iUrl] || '').trim().toLowerCase();
      if (u) urls[u] = true;
    }
  } catch(_) {}
  return urls;
}

function _agrSaveBando_(bando) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh) return;
    var id = 'BR' + Date.now() + Math.random().toString(36).substring(2, 4);
    sh.appendRow([
      id, '', new Date(),
      String(bando.titolo || '').substring(0, 300),
      String(bando.ente || ''), String(bando.livello || 'Regionale'),
      String(bando.regione || ''), String(bando.settore || ''),
      '', '', '', bando.scadenza || '',
      'AGR', String(bando.fonteNome || ''),
      String(bando.urlBando || ''), '', '', '',
      String(bando.sommario || '').substring(0, 500),
      bando.ambito || '', '', 'nuovo_da_triage', 'attivo', false, false, ''
    ]);
  } catch(e) { Logger.log('[AGR] save errore: ' + e.message); }
}

function _agrParseRss_(content, bur) {
  var items = [];
  try {
    var doc = XmlService.parse(content);
    var root = doc.getRootElement();
    var ns = root.getNamespace();
    var channel = root.getChild('channel', ns) || root.getChild('channel');
    var xmlItems = channel ? (channel.getChildren('item') || []) : [];

    // Atom fallback
    if (xmlItems.length === 0) {
      var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
      xmlItems = root.getChildren('entry', atomNs) || root.getChildren('entry') || [];
    }

    xmlItems.slice(0, 20).forEach(function(el) {
      var title = _agrXmlVal_(el, 'title') || '';
      var link = _agrXmlVal_(el, 'link') || '';
      var desc = _agrXmlVal_(el, 'description') || _agrXmlVal_(el, 'summary') || '';
      var date = _agrXmlVal_(el, 'pubDate') || _agrXmlVal_(el, 'published') || '';

      if (!link) {
        try {
          var linkEl = el.getChild('link', XmlService.getNamespace('http://www.w3.org/2005/Atom')) || el.getChild('link');
          if (linkEl && linkEl.getAttribute('href')) link = linkEl.getAttribute('href').getValue();
        } catch(_) {}
      }

      if (title && link) {
        items.push({ titolo: title.trim(), link: link.trim(), descrizione: _agrStripHtml_(desc), data: date });
      }
    });
  } catch(e) { Logger.log('[AGR] RSS parse ' + bur.regione + ': ' + e.message); }
  return items;
}

function _agrParseHtmlBur_(content, bur) {
  var items = [];
  try {
    // Estrai link a PDF o pagine atto con keyword cultura/turismo/bando
    var linkPattern = /href=["']([^"']*(?:\.pdf|atto|deliber|bando|avviso|concors)[^"']*)["'][^>]*>([^<]*)/gi;
    var match;
    var baseUrl = bur.url.match(/^https?:\/\/[^\/]+/);
    var base = baseUrl ? baseUrl[0] : '';

    while ((match = linkPattern.exec(content)) !== null && items.length < 20) {
      var href = match[1].trim();
      var text = match[2].trim();
      if (!href || !text || text.length < 5) continue;

      // Risolvi URL relativo
      if (href.indexOf('http') !== 0) {
        href = (href.indexOf('/') === 0) ? base + href : bur.url + '/' + href;
      }

      items.push({ titolo: text.substring(0, 200), link: href, descrizione: '', data: '' });
    }
  } catch(e) { Logger.log('[AGR] HTML parse ' + bur.regione + ': ' + e.message); }
  return items;
}

function _agrXmlVal_(el, tagName) {
  try {
    var child = el.getChild(tagName);
    if (!child) child = el.getChild(tagName, XmlService.getNamespace('http://www.w3.org/2005/Atom'));
    return child ? child.getValue() : null;
  } catch(_) { return null; }
}

function _agrStripHtml_(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// FINE AgentRegionale.js
// ============================================================================
