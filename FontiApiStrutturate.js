/**
 * ============================================================================
 *  FontiApiStrutturate.js — Parser per fonti strutturate (TED, PNRR, CKAN)
 * ============================================================================
 *  v4.18.69 (2026-05-24)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Fase 1: RSS feeds + auto-retry fonti silenti
 *  Fase 2: OpenCoesione API + CKAN regionale (dati.gov.it, dati.puglia.it)
 *
 *  Funzioni pubbliche:
 *    fasParserTedRss()              — scarica bandi EU da TED RSS (cultura/musei)
 *    fasParserItaliaDomaniRss()     — scarica bandi PNRR da Italia Domani
 *    fasRetryFontiSilenti()         — riprova fonti con 3+ fail, riattiva se OK
 *    fasRunFase1()                  — orchestratore: RSS + retry
 *    fasParserOpenCoesione()        — Fase 2: progetti coesione cultura/turismo
 *    fasParserCkanRegionale()       — Fase 2: bandi da portali open data regionali
 *    fasRunFase2()                  — orchestratore Fase 2
 *    fasRunCompleto()               — Fase 1 + Fase 2
 *    fasSetupTrigger()              — installa trigger giornaliero
 *    fasDiagnostica()               — report stato
 *
 *  Prefisso unico: fas_ / _fas*
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

// TED RSS — bandi EU cultura/musei/patrimonio
// TED e Italia Domani bloccano richieste server-to-server (403/400).
// Fase 2: integrazione via Gmail scan o proxy.
var FAS_TED_FEEDS = [];

// Italia Domani RSS — PNRR
var FAS_PNRR_FEEDS = [
  // Italia Domani (403) e Agenzia Coesione (SSL error) bloccano GAS.
  // Fase 2: integrazione via Gmail scan.
  {
    nome: 'Artribune RSS',
    url: 'https://www.artribune.com/feed/',
    tipo: 'RSS',
    ambito: 1,
    livello: 'Nazionale',
    ente: 'Artribune'
  },
  // FASI.eu (403) blocca GAS. Fase 2: proxy o Gmail scan.
  {
    nome: 'Doppiozero — Cultura RSS',
    url: 'https://www.doppiozero.com/rss.xml',
    tipo: 'RSS',
    ambito: 1,
    livello: 'Nazionale',
    ente: 'Doppiozero'
  }
];

// ============================================================================
// PARSER TED RSS
// ============================================================================

/**
 * Scarica bandi EU da TED tramite RSS/API.
 * Salva nuovi bandi in Bandi_v5 come "nuovo_da_triage".
 *
 * @param {Object} [opts] {dryRun, maxItems}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
function fasParserTedRss(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxItems = opts.maxItems || 30;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var i = 0; i < FAS_TED_FEEDS.length; i++) {
    var feed = FAS_TED_FEEDS[i];
    try {
      var items = _fasFetchRss_(feed.url, feed.tipo);
      if (!items || items.length === 0) {
        report.dettagli.push({ fonte: feed.nome, azione: 'empty', items: 0 });
        continue;
      }

      var count = 0;
      for (var j = 0; j < Math.min(items.length, maxItems); j++) {
        var item = items[j];
        if (!item.link) continue;
        if (existingUrls[item.link.toLowerCase()]) { report.duplicati++; continue; }

        if (!dryRun) {
          _fasSaveBando_({
            titolo: item.titolo || '',
            ente: feed.ente,
            livello: feed.livello,
            regione: '',
            settore: 'Cultura e patrimonio',
            urlBando: item.link,
            sommario: item.descrizione || '',
            scadenza: item.data || '',
            ambito: feed.ambito,
            fonteNome: feed.nome
          });
          existingUrls[item.link.toLowerCase()] = true;
        }
        report.nuovi++;
        count++;
      }
      report.dettagli.push({ fonte: feed.nome, azione: 'ok', items: items.length, nuovi: count });
      Logger.log('[FAS] TED ' + feed.nome + ': ' + items.length + ' items, ' + count + ' nuovi');
    } catch(e) {
      report.errori++;
      report.dettagli.push({ fonte: feed.nome, azione: 'errore', errore: e.message });
      Logger.log('[FAS] TED errore ' + feed.nome + ': ' + e.message);
    }
  }

  return report;
}

// ============================================================================
// PARSER ITALIA DOMANI / MiC RSS
// ============================================================================

/**
 * Scarica bandi PNRR e avvisi MiC da feed RSS.
 */
function fasParserItaliaDomaniRss(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxItems = opts.maxItems || 30;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var i = 0; i < FAS_PNRR_FEEDS.length; i++) {
    var feed = FAS_PNRR_FEEDS[i];
    try {
      var items = _fasFetchRss_(feed.url, 'RSS');
      if (!items || items.length === 0) {
        report.dettagli.push({ fonte: feed.nome, azione: 'empty', items: 0 });
        continue;
      }

      var count = 0;
      for (var j = 0; j < Math.min(items.length, maxItems); j++) {
        var item = items[j];
        if (!item.link) continue;
        if (existingUrls[item.link.toLowerCase()]) { report.duplicati++; continue; }

        if (!dryRun) {
          var bando = {
            titolo: item.titolo || '',
            ente: feed.ente,
            livello: feed.livello,
            regione: '',
            settore: 'PNRR / Cultura',
            urlBando: item.link,
            sommario: item.descrizione || '',
            scadenza: item.data || '',
            ambito: feed.ambito,
            fonteNome: feed.nome
          };
          // Triage PNRR automatico
          if (typeof verificaETracciaStatoPNRR === 'function') {
            try { verificaETracciaStatoPNRR(bando); } catch(_){}
          }
          _fasSaveBando_(bando);
          existingUrls[item.link.toLowerCase()] = true;
        }
        report.nuovi++;
        count++;
      }
      report.dettagli.push({ fonte: feed.nome, azione: 'ok', items: items.length, nuovi: count });
      Logger.log('[FAS] PNRR ' + feed.nome + ': ' + items.length + ' items, ' + count + ' nuovi');
    } catch(e) {
      report.errori++;
      report.dettagli.push({ fonte: feed.nome, azione: 'errore', errore: e.message });
      Logger.log('[FAS] PNRR errore ' + feed.nome + ': ' + e.message);
    }
  }

  return report;
}

// ============================================================================
// AUTO-RETRY FONTI SILENTI
// ============================================================================

/**
 * Riprova le fonti con FailConsecutivi >= 3 (disattivate automaticamente).
 * Per ogni fonte: tenta un fetch. Se HTTP 200 + contenuto > 200 char → riattiva.
 *
 * @param {Object} [opts] {maxFonti, dryRun}
 * @return {Object} {ok, testate, riattivate, ancoraFallite, dettagli[]}
 */
function fasRetryFontiSilenti(opts) {
  opts = opts || {};
  var maxFonti = opts.maxFonti || 20;
  var dryRun = !!opts.dryRun;
  var report = { ok: true, testate: 0, riattivate: 0, ancoraFallite: 0, dettagli: [] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

    // Cerca fonti silenti in tutti i fogli fonti
    var sheetNames = ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'];
    sheetNames.forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh || sh.getLastRow() < 2) return;

      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = head.indexOf('URL'), iAtt = head.indexOf('Attiva'),
          iFail = head.indexOf('FailConsecutivi'), iNome = head.indexOf('Nome'),
          iEsito = head.indexOf('UltimoEsito'), iScan = head.indexOf('UltimaScan'),
          iErr = head.indexOf('UltimoErrore');

      for (var r = 1; r < vals.length && report.testate < maxFonti; r++) {
        var fail = Number(vals[r][iFail] || 0);
        if (fail < 3) continue; // solo fonti silenti

        var url = String(vals[r][iUrl] || '').trim();
        var nome = String(vals[r][iNome] || '').trim();
        if (!url) continue;

        report.testate++;
        try {
          var resp = UrlFetchApp.fetch(url, {
            muteHttpExceptions: true,
            followRedirects: true,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)' }
          });
          var code = resp.getResponseCode();
          var contentLen = resp.getContentText().length;

          if (code === 200 && contentLen > 200) {
            // Fonte recuperata
            if (!dryRun) {
              sh.getRange(r + 1, iFail + 1).setValue(0);
              sh.getRange(r + 1, iAtt + 1).setValue(true);
              sh.getRange(r + 1, iEsito + 1).setValue('RECOVERED');
              sh.getRange(r + 1, iScan + 1).setValue(new Date());
              if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('');
            }
            report.riattivate++;
            report.dettagli.push({ nome: nome, sheet: shName, azione: 'riattivata', code: code, chars: contentLen });
            Logger.log('[FAS] RIATTIVATA: ' + nome + ' (' + code + ', ' + contentLen + ' chars)');
          } else {
            report.ancoraFallite++;
            report.dettagli.push({ nome: nome, sheet: shName, azione: 'ancora_fallita', code: code, chars: contentLen });
          }
        } catch(eF) {
          report.ancoraFallite++;
          report.dettagli.push({ nome: nome, sheet: shName, azione: 'network_error', errore: eF.message });
        }
      }
    });

    Logger.log('[FAS] Retry silenti: ' + report.testate + ' testate, ' + report.riattivate + ' riattivate, ' + report.ancoraFallite + ' ancora fallite');
    return report;
  } catch(e) {
    report.ok = false;
    report.error = e.message;
    return report;
  }
}

// ============================================================================
// ORCHESTRATORE FASE 1
// ============================================================================

/**
 * Esegue tutti i parser Fase 1: TED + PNRR + retry silenti.
 * Chiamato dal trigger giornaliero o manualmente.
 */
function fasRunFase1() {
  var t0 = Date.now();
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    ted: null,
    pnrr: null,
    retry: null,
    totaleNuovi: 0,
    durataMs: 0
  };

  Logger.log('================================================================');
  Logger.log('[FAS] FASE 1 — TED + PNRR + Retry silenti — ' + new Date().toISOString());
  Logger.log('================================================================');

  // 1. TED RSS
  try {
    report.ted = fasParserTedRss();
    report.totaleNuovi += report.ted.nuovi;
  } catch(e) {
    report.ted = { ok: false, error: e.message };
    Logger.log('[FAS] TED ERRORE: ' + e.message);
  }

  // 2. PNRR + MiC RSS
  try {
    report.pnrr = fasParserItaliaDomaniRss();
    report.totaleNuovi += report.pnrr.nuovi;
  } catch(e) {
    report.pnrr = { ok: false, error: e.message };
    Logger.log('[FAS] PNRR ERRORE: ' + e.message);
  }

  // 3. Retry fonti silenti (max 10 per esecuzione)
  try {
    report.retry = fasRetryFontiSilenti({ maxFonti: 10 });
  } catch(e) {
    report.retry = { ok: false, error: e.message };
    Logger.log('[FAS] Retry ERRORE: ' + e.message);
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[FAS] Fase 1 completata: ' + report.totaleNuovi + ' nuovi bandi, ' +
    (report.retry ? report.retry.riattivate : 0) + ' fonti riattivate (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  // Telegram alert se nuovi bandi trovati
  if (report.totaleNuovi > 0) {
    try {
      if (typeof _tgSend_ === 'function') {
        _tgSend_('📡 *Fonti Strutturate*\n\n' +
          (report.ted ? 'TED EU: ' + report.ted.nuovi + ' nuovi\n' : '') +
          (report.pnrr ? 'PNRR/MiC: ' + report.pnrr.nuovi + ' nuovi\n' : '') +
          (report.retry ? 'Fonti riattivate: ' + report.retry.riattivate + '/' + report.retry.testate : ''));
      }
    } catch(_){}
  }

  return report;
}

// ============================================================================
// TRIGGER + DIAGNOSTICA
// ============================================================================

/**
 * Installa trigger giornaliero per Fase 1 (ore 06:00, prima del digest).
 */
function fasSetupTrigger() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  try {
    // Rimuovi trigger esistenti (Fase 1 o completo)
    ScriptApp.getProjectTriggers().forEach(function(t) {
      var fn = t.getHandlerFunction();
      if (fn === 'fasRunFase1' || fn === 'fasRunCompleto') ScriptApp.deleteTrigger(t);
    });
    // Installa trigger completo (Fase 1 + 2)
    ScriptApp.newTrigger('fasRunCompleto')
      .timeBased().everyDays(1).atHour(6).nearMinute(0).create();
    Logger.log('[FAS] Trigger installato: fasRunCompleto ogni giorno alle 06:00');
    return { ok: true, trigger: 'fasRunCompleto', ora: '06:00' };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Report diagnostico fonti strutturate.
 */
function fasDiagnostica() {
  var out = { ok: true, timestamp: new Date().toISOString() };

  // Conta fonti silenti
  try {
    if (typeof getFontiCounters === 'function') {
      var fc = getFontiCounters();
      out.fontiSilenti = (fc && fc.counters) ? fc.counters.silentiGenerale : 0;
    }
  } catch(_){}

  // Trigger installato?
  try {
    var triggers = ScriptApp.getProjectTriggers();
    out.triggerAttivo = triggers.some(function(t) { return t.getHandlerFunction() === 'fasRunFase1'; });
  } catch(_){}

  // Feed configurati
  out.feedTED = FAS_TED_FEEDS.length;
  out.feedPNRR = FAS_PNRR_FEEDS.length;

  Logger.log('[FAS] Diagnostica: ' + JSON.stringify(out));
  return out;
}

// ============================================================================
// HELPERS PRIVATI
// ============================================================================

/**
 * @private Fetch e parsing RSS/Atom generico.
 */
function _fasFetchRss_(url, tipo) {
  var items = [];
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/json, */*'
      }
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('[FAS] Feed HTTP ' + resp.getResponseCode() + ': ' + url);
      return items;
    }

    var content = resp.getContentText();

    // Prova JSON (TED API)
    if (tipo === 'API' || content.trim().charAt(0) === '{' || content.trim().charAt(0) === '[') {
      try {
        var json = JSON.parse(content);
        var notices = json.notices || json.results || json.items || (Array.isArray(json) ? json : []);
        notices.forEach(function(n) {
          items.push({
            titolo: n.title || n['title-or-short-title'] || n.name || '',
            link: n.link || n.uri || n.url || (n.links && n.links[0] && n.links[0].href) || '',
            descrizione: n.summary || n.description || n.content || '',
            data: _fasNormalizzaData_(n['publication-date'] || n.pubDate || n.published || n.date || '')
          });
        });
        return items;
      } catch(_){}
    }

    // RSS/Atom XML
    try {
      var doc = XmlService.parse(content);
      var root = doc.getRootElement();
      var ns = root.getNamespace();

      // RSS 2.0
      var channel = root.getChild('channel', ns) || root.getChild('channel');
      var xmlItems = [];
      if (channel) {
        xmlItems = channel.getChildren('item') || [];
      }
      // Atom
      if (xmlItems.length === 0) {
        var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
        xmlItems = root.getChildren('entry', atomNs) || root.getChildren('entry') || [];
      }

      xmlItems.forEach(function(el) {
        var title = _fasXmlVal_(el, 'title') || '';
        var link = _fasXmlVal_(el, 'link') || '';
        var desc = _fasXmlVal_(el, 'description') || _fasXmlVal_(el, 'summary') || _fasXmlVal_(el, 'content') || '';
        var date = _fasXmlVal_(el, 'pubDate') || _fasXmlVal_(el, 'published') || _fasXmlVal_(el, 'updated') || '';

        // Atom link con href
        if (!link) {
          try {
            var linkEl = el.getChild('link', XmlService.getNamespace('http://www.w3.org/2005/Atom')) || el.getChild('link');
            if (linkEl && linkEl.getAttribute('href')) link = linkEl.getAttribute('href').getValue();
          } catch(_){}
        }

        if (title && link) {
          items.push({
            titolo: title.trim(),
            link: link.trim(),
            descrizione: _fasStripHtml_(desc).substring(0, 500),
            data: _fasNormalizzaData_(date)
          });
        }
      });
    } catch(eXml) {
      Logger.log('[FAS] XML parse error: ' + eXml.message);
    }
  } catch(eNet) {
    Logger.log('[FAS] Network error: ' + eNet.message);
  }

  return items;
}

/**
 * @private Salva un bando nel foglio Bandi_v5.
 */
function _fasSaveBando_(bando) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh) return;

    var id = 'BF' + Date.now() + Math.random().toString(36).substring(2, 4);
    sh.appendRow([
      id,                               // ID
      '',                                // Fingerprint
      new Date(),                        // DataRilevamento
      String(bando.titolo || '').substring(0, 300), // Titolo
      String(bando.ente || ''),          // Ente
      String(bando.livello || 'Vari'),   // Livello
      String(bando.regione || ''),       // Regione
      String(bando.settore || ''),       // Settore
      '',                                // Soggetti
      '',                                // Importo
      '',                                // Cofin
      bando.scadenza || '',              // Scadenza
      'FAS',                             // FonteID
      String(bando.fonteNome || ''),     // FonteNome
      String(bando.urlBando || ''),      // UrlBando
      '',                                // UrlEnte
      '',                                // UrlValidato
      '',                                // DataValidazione
      String(bando.sommario || '').substring(0, 500), // Sommario
      bando.ambito || '',                // Ambito
      '',                                // PrioritaRegionale
      'nuovo_da_triage',                 // Status
      'attivo',                          // StatoRecord
      false,                             // Letto
      false,                             // Salvato
      ''                                 // Note
    ]);
  } catch(e) {
    Logger.log('[FAS] _fasSaveBando_ errore: ' + e.message);
  }
}

/**
 * @private Carica URL bandi esistenti per dedup.
 */
function _fasLoadExistingUrls_() {
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
  } catch(_){}
  return urls;
}

function _fasXmlVal_(el, tagName) {
  try {
    var child = el.getChild(tagName);
    if (!child) {
      child = el.getChild(tagName, XmlService.getNamespace('http://www.w3.org/2005/Atom'));
    }
    return child ? child.getValue() : null;
  } catch(_) { return null; }
}

function _fasStripHtml_(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function _fasNormalizzaData_(dateStr) {
  if (!dateStr) return '';
  var s = String(dateStr).trim();
  // ISO 8601
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  // GG/MM/AAAA
  var slash = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (slash) return slash[3] + '-' + slash[2].padStart(2, '0') + '-' + slash[1].padStart(2, '0');
  // RFC 2822 / altri
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
      return Utilities.formatDate(d, 'Europe/Rome', 'yyyy-MM-dd');
    }
  } catch(_){}
  return '';
}

// ============================================================================
// FASE 2: OpenCoesione API + CKAN regionale
// ============================================================================

/**
 * Endpoint OpenCoesione e CKAN.
 */
var FAS_OPENCOESIONE = {
  base: 'https://opencoesione.gov.it/api',
  // Temi rilevanti: 06=Cultura e turismo, 07=Ambiente, 09=Inclusione sociale
  temiCultura: ['06'],
  maxPagine: 3,
  perPagina: 20
};

var FAS_CKAN_PORTALS = [
  {
    nome: 'dati.gov.it — Open Data PA',
    base: 'https://www.dati.gov.it/opendata/api/3/action',
    query: 'bandi cultura musei patrimonio',
    ambito: 1,
    livello: 'Nazionale'
  },
  {
    nome: 'Puglia Open Data',
    base: 'https://dati.puglia.it/ckan/api/3/action',
    query: 'bandi cultura',
    ambito: 1,
    livello: 'Regionale'
  }
];

// ============================================================================
// PARSER OPENCOESIONE
// ============================================================================

/**
 * Scarica progetti/opportunita da OpenCoesione API filtrati per tema cultura.
 * API: https://opencoesione.gov.it/api/progetti/?tema_sintetico=06&formato=json
 *
 * @param {Object} [opts] {dryRun, maxPagine}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
function fasParserOpenCoesione(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxPag = opts.maxPagine || FAS_OPENCOESIONE.maxPagine;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, pagine: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var tema = 0; tema < FAS_OPENCOESIONE.temiCultura.length; tema++) {
    var temaCode = FAS_OPENCOESIONE.temiCultura[tema];

    for (var pag = 1; pag <= maxPag; pag++) {
      try {
        var url = FAS_OPENCOESIONE.base + '/progetti/?tema_sintetico=' + temaCode +
          '&formato=json&ordinamento=-data_inizio_prevista&page=' + pag;

        var resp = UrlFetchApp.fetch(url, {
          muteHttpExceptions: true,
          headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
        });

        if (resp.getResponseCode() !== 200) {
          report.dettagli.push({ fonte: 'OpenCoesione', pagina: pag, errore: 'HTTP ' + resp.getResponseCode() });
          if (resp.getResponseCode() === 403 || resp.getResponseCode() === 429) break;
          continue;
        }

        var data;
        try { data = JSON.parse(resp.getContentText()); } catch(eJ) {
          report.errori++;
          report.dettagli.push({ fonte: 'OpenCoesione', pagina: pag, errore: 'JSON parse: ' + eJ.message });
          continue;
        }

        var risultati = data.risultati || data.results || data.objects || [];
        if (!risultati.length) break; // nessun risultato, stop paginazione

        report.pagine++;
        for (var i = 0; i < risultati.length; i++) {
          var prog = risultati[i];
          var titolo = String(prog.titolo_progetto || prog.oc_titolo_progetto || prog.titolo || '').trim();
          var linkProg = prog.url || (FAS_OPENCOESIONE.base.replace('/api', '') + '/progetti/' + (prog.codice_locale || prog.cod_locale || ''));
          var ente = String(prog.denominazione_soggetto || prog.soggetto_programmatore || '');

          if (!titolo || !linkProg) continue;
          if (existingUrls[linkProg.toLowerCase()]) { report.duplicati++; continue; }

          if (!dryRun) {
            _fasSaveBando_({
              titolo: titolo.substring(0, 300),
              ente: ente || 'OpenCoesione',
              livello: 'Nazionale',
              regione: String(prog.den_regione || ''),
              settore: 'Coesione — Cultura e turismo',
              urlBando: linkProg,
              sommario: String(prog.oc_descrizione_sintetica || prog.descrizione || '').substring(0, 500),
              scadenza: _fasNormalizzaData_(prog.data_fine_prevista || prog.data_fine_effettiva || ''),
              ambito: 1,
              fonteNome: 'OpenCoesione API (tema ' + temaCode + ')'
            });
            existingUrls[linkProg.toLowerCase()] = true;
          }
          report.nuovi++;
        }

        Logger.log('[FAS] OpenCoesione tema=' + temaCode + ' pag=' + pag + ': ' + risultati.length + ' risultati');
        Utilities.sleep(500); // rate limit cortesia
      } catch(e) {
        report.errori++;
        report.dettagli.push({ fonte: 'OpenCoesione', pagina: pag, errore: e.message });
        Logger.log('[FAS] OpenCoesione errore pag ' + pag + ': ' + e.message);
      }
    }
  }

  Logger.log('[FAS] OpenCoesione totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup, ' + report.pagine + ' pagine');
  return report;
}

// ============================================================================
// PARSER CKAN REGIONALE
// ============================================================================

/**
 * Cerca dataset bandi/cultura sui portali CKAN regionali e nazionali.
 * CKAN API: package_search?q=bandi+cultura&rows=20
 *
 * @param {Object} [opts] {dryRun, maxPerPortale}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
function fasParserCkanRegionale(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxPerPortale = opts.maxPerPortale || 20;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var p = 0; p < FAS_CKAN_PORTALS.length; p++) {
    var portal = FAS_CKAN_PORTALS[p];
    try {
      var url = portal.base + '/package_search?q=' + encodeURIComponent(portal.query) +
        '&rows=' + maxPerPortale + '&sort=metadata_modified+desc';

      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
      });

      if (resp.getResponseCode() !== 200) {
        report.errori++;
        report.dettagli.push({ portale: portal.nome, errore: 'HTTP ' + resp.getResponseCode() });
        Logger.log('[FAS] CKAN ' + portal.nome + ' HTTP ' + resp.getResponseCode());
        continue;
      }

      var data;
      try { data = JSON.parse(resp.getContentText()); } catch(eJ) {
        report.errori++;
        report.dettagli.push({ portale: portal.nome, errore: 'JSON parse' });
        continue;
      }

      var results = (data.result && data.result.results) || [];
      Logger.log('[FAS] CKAN ' + portal.nome + ': ' + results.length + ' dataset trovati');

      for (var i = 0; i < results.length; i++) {
        var ds = results[i];
        var titolo = String(ds.title || ds.name || '').trim();
        var dsUrl = '';

        // Cerca URL utile nelle risorse del dataset
        if (ds.resources && ds.resources.length > 0) {
          // Preferisci risorse con formato HTML o PDF
          var bestRes = ds.resources.find(function(r) {
            var fmt = String(r.format || '').toLowerCase();
            return fmt === 'html' || fmt === 'pdf' || fmt === 'csv';
          }) || ds.resources[0];
          dsUrl = bestRes.url || '';
        }
        if (!dsUrl) dsUrl = ds.url || (portal.base.replace('/api/3/action', '') + '/dataset/' + ds.name);

        if (!titolo || !dsUrl) continue;
        if (existingUrls[dsUrl.toLowerCase()]) { report.duplicati++; continue; }

        // Filtra solo dataset rilevanti (contengono keyword cultura/bandi/musei)
        var allText = (titolo + ' ' + (ds.notes || '') + ' ' + (ds.tags || []).map(function(t) { return t.name || t; }).join(' ')).toLowerCase();
        var isRelevant = /bando|bandi|cultura|museo|musei|patrimonio|finanziamento|contributo|turismo/.test(allText);
        if (!isRelevant) continue;

        if (!dryRun) {
          _fasSaveBando_({
            titolo: titolo.substring(0, 300),
            ente: String(ds.organization && ds.organization.title || portal.nome),
            livello: portal.livello,
            regione: portal.livello === 'Regionale' ? portal.nome.split(' ')[0] : '',
            settore: 'Open Data — Cultura',
            urlBando: dsUrl,
            sommario: String(ds.notes || '').substring(0, 500),
            scadenza: '',
            ambito: portal.ambito,
            fonteNome: portal.nome
          });
          existingUrls[dsUrl.toLowerCase()] = true;
        }
        report.nuovi++;
      }

      report.dettagli.push({ portale: portal.nome, dataset: results.length, nuovi: report.nuovi });
      Utilities.sleep(300);
    } catch(e) {
      report.errori++;
      report.dettagli.push({ portale: portal.nome, errore: e.message });
      Logger.log('[FAS] CKAN ' + portal.nome + ' errore: ' + e.message);
    }
  }

  Logger.log('[FAS] CKAN totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup');
  return report;
}

// ============================================================================
// ORCHESTRATORE FASE 2
// ============================================================================

/**
 * Esegue tutti i parser Fase 2: OpenCoesione + CKAN.
 */
function fasRunFase2() {
  var t0 = Date.now();
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    openCoesione: null,
    ckan: null,
    totaleNuovi: 0,
    durataMs: 0
  };

  Logger.log('================================================================');
  Logger.log('[FAS] FASE 2 — OpenCoesione + CKAN — ' + new Date().toISOString());
  Logger.log('================================================================');

  // 1. OpenCoesione API
  try {
    report.openCoesione = fasParserOpenCoesione();
    report.totaleNuovi += report.openCoesione.nuovi;
  } catch(e) {
    report.openCoesione = { ok: false, error: e.message };
    Logger.log('[FAS] OpenCoesione ERRORE: ' + e.message);
  }

  // 2. CKAN Regionali
  try {
    report.ckan = fasParserCkanRegionale();
    report.totaleNuovi += report.ckan.nuovi;
  } catch(e) {
    report.ckan = { ok: false, error: e.message };
    Logger.log('[FAS] CKAN ERRORE: ' + e.message);
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[FAS] Fase 2 completata: ' + report.totaleNuovi + ' nuovi (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  // Telegram alert
  if (report.totaleNuovi > 0) {
    try {
      if (typeof _tgSend_ === 'function') {
        _tgSend_('📡 *Fonti Strutturate Fase 2*\n\n' +
          'OpenCoesione: ' + (report.openCoesione ? report.openCoesione.nuovi : 0) + ' nuovi\n' +
          'CKAN regionali: ' + (report.ckan ? report.ckan.nuovi : 0) + ' nuovi');
      }
    } catch(_){}
  }

  return report;
}

// ============================================================================
// ORCHESTRATORE COMPLETO (Fase 1 + Fase 2)
// ============================================================================

/**
 * Esegue tutto: RSS + retry + OpenCoesione + CKAN.
 * Usare come trigger giornaliero al posto di fasRunFase1.
 */
function fasRunCompleto() {
  var t0 = Date.now();
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    fase1: null,
    fase2: null,
    totaleNuovi: 0,
    durataMs: 0
  };

  Logger.log('================================================================');
  Logger.log('[FAS] RUN COMPLETO — Fase 1 + Fase 2 — ' + new Date().toISOString());
  Logger.log('================================================================');

  // Wall-clock guard: 5 minuti totali
  var startTime = Date.now();

  // Fase 1
  try {
    report.fase1 = fasRunFase1();
    report.totaleNuovi += (report.fase1.totaleNuovi || 0);
  } catch(e) {
    report.fase1 = { ok: false, error: e.message };
  }

  // Fase 2 (solo se c'e tempo)
  if (Date.now() - startTime < 240000) {
    try {
      report.fase2 = fasRunFase2();
      report.totaleNuovi += (report.fase2.totaleNuovi || 0);
    } catch(e) {
      report.fase2 = { ok: false, error: e.message };
    }
  } else {
    report.fase2 = { ok: true, skipped: true, motivo: 'timeout 4min' };
    Logger.log('[FAS] Fase 2 saltata per timeout');
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[FAS] Run completo: ' + report.totaleNuovi + ' nuovi totali (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  return report;
}

// ============================================================================
// FINE FontiApiStrutturate.js
// ============================================================================

// ============================================================================
// FASE 3: Deprecazione fonti HTML irrecuperabili
// ============================================================================

/**
 * Identifica e disattiva definitivamente le fonti che restano silenti
 * dopo i retry (JS-rendered, 403 permanenti, DNS irraggiungibili).
 * Aggiunge nota esplicativa nel campo UltimoErrore.
 *
 * @param {Object} [opts] {dryRun, minFail: soglia minima fail (default 3)}
 * @return {Object} {ok, analizzate, deprecate, mantenute, dettagli[]}
 */
function fasDeprecaFontiIrrecuperabili(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var minFail = opts.minFail || 3;
  var report = { ok: true, analizzate: 0, deprecate: 0, mantenute: 0, dettagli: [] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sheetNames = ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'];

    sheetNames.forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh || sh.getLastRow() < 2) return;

      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = head.indexOf('URL'), iAtt = head.indexOf('Attiva'),
          iFail = head.indexOf('FailConsecutivi'), iNome = head.indexOf('Nome'),
          iEsito = head.indexOf('UltimoEsito'), iErr = head.indexOf('UltimoErrore'),
          iTipo = head.indexOf('Tipo');

      for (var r = 1; r < vals.length; r++) {
        var fail = Number(vals[r][iFail] || 0);
        if (fail < minFail) continue;

        var url = String(vals[r][iUrl] || '').trim();
        var nome = String(vals[r][iNome] || '').trim();
        var tipo = String(vals[r][iTipo] || '').trim();
        var esito = String(vals[r][iEsito] || '');
        var attiva = vals[r][iAtt];
        report.analizzate++;

        // Test finale: un ultimo tentativo
        var raggiungibile = false;
        var motivo = 'irrecuperabile';
        try {
          var resp = UrlFetchApp.fetch(url, {
            muteHttpExceptions: true,
            followRedirects: true,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)' }
          });
          var code = resp.getResponseCode();
          var len = resp.getContentText().length;
          if (code === 200 && len > 500) {
            raggiungibile = true;
          } else if (code === 403) {
            motivo = 'HTTP 403 permanente (server blocca bot)';
          } else if (code === 404) {
            motivo = 'HTTP 404 (pagina rimossa)';
          } else if (code === 200 && len <= 500) {
            motivo = 'JS-rendered (HTTP 200 ma contenuto vuoto, ' + len + ' chars)';
          } else {
            motivo = 'HTTP ' + code;
          }
        } catch(eNet) {
          motivo = 'Network: ' + eNet.message.substring(0, 100);
        }

        if (raggiungibile) {
          // Fonte recuperata all'ultimo tentativo
          if (!dryRun) {
            sh.getRange(r + 1, iFail + 1).setValue(0);
            sh.getRange(r + 1, iAtt + 1).setValue(true);
            sh.getRange(r + 1, iEsito + 1).setValue('RECOVERED_FASE3');
            if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('');
          }
          report.mantenute++;
          report.dettagli.push({ nome: nome, sheet: shName, azione: 'recuperata' });
          Logger.log('[FAS] F3 RECUPERATA: ' + nome);
        } else {
          // Depreca definitivamente
          if (!dryRun) {
            sh.getRange(r + 1, iAtt + 1).setValue(false);
            sh.getRange(r + 1, iFail + 1).setValue(fail);
            sh.getRange(r + 1, iEsito + 1).setValue('DEPRECATED');
            if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('[FASE3 ' + new Date().toISOString().substring(0, 10) + '] ' + motivo);
          }
          report.deprecate++;
          report.dettagli.push({ nome: nome, sheet: shName, azione: 'deprecata', motivo: motivo });
          Logger.log('[FAS] F3 DEPRECATA: ' + nome + ' — ' + motivo);
        }
      }
    });

    Logger.log('[FAS] Fase 3: ' + report.analizzate + ' analizzate, ' +
      report.deprecate + ' deprecate, ' + report.mantenute + ' mantenute');
    return report;
  } catch(e) {
    report.ok = false;
    report.error = e.message;
    return report;
  }
}

/**
 * Report completo fonti: attive, silenti, deprecate, per tipo.
 */
function fasReportFontiCompleto() {
  var out = { ok: true, timestamp: new Date().toISOString(), fogli: {} };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'].forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh || sh.getLastRow() < 2) { out.fogli[shName] = { totale: 0 }; return; }
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iAtt = head.indexOf('Attiva'), iFail = head.indexOf('FailConsecutivi'),
          iEsito = head.indexOf('UltimoEsito');
      var stats = { totale: 0, attive: 0, silenti: 0, deprecate: 0, ok: 0 };
      for (var r = 1; r < vals.length; r++) {
        if (!vals[r][0]) continue;
        stats.totale++;
        var att = vals[r][iAtt] === true || String(vals[r][iAtt]).toUpperCase() === 'TRUE';
        var fail = Number(vals[r][iFail] || 0);
        var esito = String(vals[r][iEsito] || '');
        if (esito === 'DEPRECATED') stats.deprecate++;
        else if (!att || fail >= 3) stats.silenti++;
        else if (esito === 'OK' || esito === 'RECOVERED' || esito === 'RECOVERED_FASE3') stats.ok++;
        if (att) stats.attive++;
      }
      out.fogli[shName] = stats;
    });
    // Totali
    out.totaleAttive = 0; out.totaleSilenti = 0; out.totaleDeprecate = 0;
    Object.keys(out.fogli).forEach(function(k) {
      out.totaleAttive += out.fogli[k].attive || 0;
      out.totaleSilenti += out.fogli[k].silenti || 0;
      out.totaleDeprecate += out.fogli[k].deprecate || 0;
    });
    Logger.log('[FAS] Report fonti: attive=' + out.totaleAttive + ' silenti=' + out.totaleSilenti + ' deprecate=' + out.totaleDeprecate);
  } catch(e) { out.ok = false; out.error = e.message; }
  return out;
}
