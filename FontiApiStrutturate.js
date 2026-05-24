/**
 * ============================================================================
 *  FontiApiStrutturate.js — Parser per fonti strutturate (TED, PNRR, CKAN)
 * ============================================================================
 *  v4.18.69 (2026-05-24)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Fase 1: TED RSS + Italia Domani RSS + auto-retry fonti silenti
 *  Fase 2 (futuro): ANAC API + OpenCoesione API + CKAN regionale
 *
 *  Funzioni pubbliche:
 *    fasParserTedRss()              — scarica bandi EU da TED RSS (cultura/musei)
 *    fasParserItaliaDomaniRss()     — scarica bandi PNRR da Italia Domani
 *    fasRetryFontiSilenti()         — riprova fonti con 3+ fail, riattiva se OK
 *    fasRunFase1()                  — orchestratore: TED + PNRR + retry
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
var FAS_TED_FEEDS = [
  {
    nome: 'TED EU — Musei e patrimonio culturale',
    url: 'https://ted.europa.eu/api/v3.0/notices/search?q=museum%20OR%20cultural%20heritage%20OR%20patrimonio%20culturale&fields=title-or-short-title,publication-date,deadline-receipt-tenders&sortField=publication-date&sortOrder=desc&limit=20',
    tipo: 'API',
    ambito: 3,
    livello: 'EU',
    ente: 'TED — Tenders Electronic Daily'
  },
  {
    nome: 'TED EU RSS — Servizi culturali',
    url: 'https://ted.europa.eu/udl?uri=TED:NOTICE:search:TEXT="museum"+OR+"cultural+heritage"&type=rss',
    tipo: 'RSS',
    ambito: 3,
    livello: 'EU',
    ente: 'TED — Tenders Electronic Daily'
  }
];

// Italia Domani RSS — PNRR
var FAS_PNRR_FEEDS = [
  {
    nome: 'Italia Domani — PNRR Avvisi',
    url: 'https://www.italiadomani.gov.it/content/sogei-ng/it/it/news.rss.xml',
    tipo: 'RSS',
    ambito: 5,
    livello: 'Nazionale',
    ente: 'Italia Domani — PNRR'
  },
  {
    nome: 'MiC — Comunicati e Avvisi RSS',
    url: 'https://cultura.gov.it/feed',
    tipo: 'RSS',
    ambito: 1,
    livello: 'Nazionale',
    ente: 'Ministero della Cultura'
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
    // Rimuovi trigger esistente
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'fasRunFase1') ScriptApp.deleteTrigger(t);
    });
    // Installa nuovo
    ScriptApp.newTrigger('fasRunFase1')
      .timeBased().everyDays(1).atHour(6).nearMinute(0).create();
    Logger.log('[FAS] Trigger installato: fasRunFase1 ogni giorno alle 06:00');
    return { ok: true, trigger: 'fasRunFase1', ora: '06:00' };
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
// FINE FontiApiStrutturate.js
// ============================================================================
