/**
 * ============================================================================
 *  ScannerRssSpecializzato.gs — Parser RSS + ingestione bandi regionali/nazionali
 * ============================================================================
 *  v4.18.68 (2026-05-23)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Funzioni:
 *    scanFontiUnifiedRss()       — scansione batch fonti RSS da FontiBandi_v5
 *    normalizzaDataRss(str)      — converte formati data RSS → YYYY-MM-DD
 *
 *  Dipendenze: Fonti_v1.js (FU_COL, getFonteSheet, getFontiUnified)
 *
 *  Foglio bandi grezzi: Bandi_v5 (colonna StatoRecord = 'nuovo_da_triage')
 *  Ogni item RSS nuovo viene salvato come "Nuovo da Triage" per il passaggio
 *  successivo all'AI di Claude (doppio passaggio in _estraiConClaudeV5_).
 * ============================================================================
 */

var _RSS_SCAN_LOG_PREFIX_ = '[ScannerRSS] ';

// ============================================================================
// 1. SCAN FONTI RSS UNIFICATE
// ============================================================================

/**
 * Legge tutte le fonti RSS attive da FontiBandi_v5, scarica i feed,
 * parsa gli <item> e salva i nuovi bandi come "Nuovo da Triage".
 *
 * Ogni iterazione e isolata in try/catch: un feed fallito non blocca gli altri.
 *
 * @param {Object} [opts] {maxFonti: number, dryRun: boolean, verbose: boolean}
 * @return {Object} {ok, fontiProcessate, nuoviBandi, errori, skipDuplicati, dettagli[]}
 */
function scanFontiUnifiedRss(opts) {
  opts = opts || {};
  var maxFonti = opts.maxFonti || 999;
  var dryRun = !!opts.dryRun;
  var verbose = opts.verbose !== false;

  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    fontiProcessate: 0,
    nuoviBandi: 0,
    errori: 0,
    skipDuplicati: 0,
    fontiDisabilitate: 0,
    dettagli: []
  };

  try {
    // 1. Carica fonti RSS attive
    var fontiRss = _loadFontiRssAttive_();
    if (!fontiRss || fontiRss.length === 0) {
      report.dettagli.push({ azione: 'nessuna_fonte_rss', messaggio: 'Nessuna fonte RSS attiva trovata' });
      Logger.log(_RSS_SCAN_LOG_PREFIX_ + 'Nessuna fonte RSS attiva.');
      return report;
    }
    if (verbose) Logger.log(_RSS_SCAN_LOG_PREFIX_ + fontiRss.length + ' fonti RSS attive trovate. Max: ' + maxFonti);

    // 2. Carica URL bandi esistenti per dedup
    var existingUrls = _loadExistingBandiUrls_();

    // 3. Itera fonti (isolate in try/catch)
    var count = 0;
    for (var i = 0; i < fontiRss.length && count < maxFonti; i++) {
      var fonte = fontiRss[i];
      count++;
      report.fontiProcessate++;

      try {
        var result = _scanSingleRssFeed_(fonte, existingUrls, dryRun);
        report.nuoviBandi += result.nuovi;
        report.skipDuplicati += result.duplicati;
        if (result.errore) {
          report.errori++;
          report.dettagli.push({ fonte: fonte.nome, errore: result.errore, failConsec: result.failConsec });
          if (result.disabilitata) report.fontiDisabilitate++;
        } else {
          report.dettagli.push({ fonte: fonte.nome, nuovi: result.nuovi, duplicati: result.duplicati, items: result.itemsTotali });
        }
        // Aggiorna contatori sulla fonte
        if (!dryRun) {
          _aggiornaStatoFonte_(fonte, result);
        }
      } catch(eFeed) {
        report.errori++;
        report.dettagli.push({ fonte: fonte.nome, errore: 'CRASH: ' + eFeed.message });
        Logger.log(_RSS_SCAN_LOG_PREFIX_ + 'CRASH su ' + fonte.nome + ': ' + eFeed.message);
        // Incrementa fail sulla fonte
        if (!dryRun) {
          try { _incrementFailFonte_(fonte); } catch(_){}
        }
      }
    }

    if (verbose) {
      Logger.log(_RSS_SCAN_LOG_PREFIX_ + 'Completato: ' + report.fontiProcessate + ' fonti, ' +
        report.nuoviBandi + ' nuovi, ' + report.skipDuplicati + ' duplicati, ' +
        report.errori + ' errori, ' + report.fontiDisabilitate + ' disabilitate');
    }
    return report;
  } catch(e) {
    Logger.log(_RSS_SCAN_LOG_PREFIX_ + 'ERRORE FATALE: ' + e.message);
    report.ok = false;
    report.error = e.message;
    return report;
  }
}

// ============================================================================
// 2. PARSING SINGOLO FEED RSS
// ============================================================================

/**
 * Scarica e parsa un singolo feed RSS. Salva nuovi item come bandi grezzi.
 * @private
 * @return {Object} {nuovi, duplicati, itemsTotali, errore?, failConsec?, disabilitata?}
 */
function _scanSingleRssFeed_(fonte, existingUrls, dryRun) {
  var result = { nuovi: 0, duplicati: 0, itemsTotali: 0, errore: null, failConsec: 0, disabilitata: false };

  // Fetch
  var resp;
  try {
    resp = UrlFetchApp.fetch(fonte.url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0; +https://sinopia.netlify.app)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
  } catch(eNet) {
    result.errore = 'NETWORK: ' + eNet.message;
    result.failConsec = (fonte.failConsec || 0) + 1;
    return result;
  }

  var code = resp.getResponseCode();
  if (code !== 200) {
    result.errore = 'HTTP_' + code;
    result.failConsec = (fonte.failConsec || 0) + 1;
    if (result.failConsec >= 3) result.disabilitata = true;
    return result;
  }

  // Parse XML
  var xmlText = resp.getContentText();
  var doc;
  try {
    doc = XmlService.parse(xmlText);
  } catch(eXml) {
    result.errore = 'XML_PARSE: ' + eXml.message;
    result.failConsec = (fonte.failConsec || 0) + 1;
    return result;
  }

  // Estrai items (RSS 2.0 + Atom)
  var root = doc.getRootElement();
  var ns = root.getNamespace();
  var items = [];

  // RSS 2.0: channel > item
  var channel = root.getChild('channel', ns) || root.getChild('channel');
  if (channel) {
    items = channel.getChildren('item') || [];
  }
  // Atom: entry
  if (items.length === 0) {
    var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
    items = root.getChildren('entry', atomNs);
    if (!items || items.length === 0) items = root.getChildren('entry') || [];
  }

  result.itemsTotali = items.length;

  // Processa max 30 item per feed
  var bandiSheet = dryRun ? null : _getBandiGrezziSheet_();
  var maxItems = Math.min(items.length, 30);

  for (var j = 0; j < maxItems; j++) {
    try {
      var item = items[j];
      var titolo = _xmlVal_(item, 'title') || '';
      var link = _xmlVal_(item, 'link') || '';
      var descr = _xmlVal_(item, 'description') || _xmlVal_(item, 'summary') || '';
      var pubDate = _xmlVal_(item, 'pubDate') || _xmlVal_(item, 'published') || _xmlVal_(item, 'updated') || '';

      // Atom: link puo essere attributo href
      if (!link) {
        try {
          var linkEl = item.getChild('link', XmlService.getNamespace('http://www.w3.org/2005/Atom')) || item.getChild('link');
          if (linkEl && linkEl.getAttribute('href')) link = linkEl.getAttribute('href').getValue();
        } catch(_){}
      }

      if (!titolo || !link) continue;
      link = link.trim();

      // Dedup
      if (existingUrls[link.toLowerCase()]) {
        result.duplicati++;
        continue;
      }

      // Salva come "Nuovo da Triage"
      if (!dryRun && bandiSheet) {
        var id = 'BG' + Date.now() + Math.random().toString(36).substring(2, 4);
        var dataIso = normalizzaDataRss(pubDate);
        var sommario = _pulisciHtml_(descr).substring(0, 500);

        bandiSheet.appendRow([
          id,                                        // ID
          '',                                        // Fingerprint
          new Date(),                                // DataRilevamento
          titolo.trim().substring(0, 300),            // Titolo
          fonte.enteDefault || fonte.nome || '',      // Ente
          fonte.livello || 'Vari',                   // Livello
          '',                                        // Regione
          fonte.categoria || 'Cultura',              // Settore
          '',                                        // Soggetti
          '',                                        // Importo
          '',                                        // Cofin
          dataIso || '',                             // Scadenza (placeholder da triage)
          fonte.id || '',                            // FonteID
          fonte.nome || '',                          // FonteNome
          link,                                      // UrlBando
          '',                                        // UrlEnte
          '',                                        // UrlValidato
          '',                                        // DataValidazione
          sommario,                                  // Sommario
          '',                                        // Ambito
          '',                                        // PrioritaRegionale
          'nuovo_da_triage',                         // Status
          'attivo',                                  // StatoRecord
          false,                                     // Letto
          false,                                     // Salvato
          ''                                         // Note
        ]);
        existingUrls[link.toLowerCase()] = true; // aggiorna dedup intra-scan
      }
      result.nuovi++;
    } catch(eItem) {
      Logger.log(_RSS_SCAN_LOG_PREFIX_ + 'Item error in ' + fonte.nome + ': ' + eItem.message);
    }
  }

  // Reset fail counter on success
  result.failConsec = 0;
  return result;
}

// ============================================================================
// 3. NORMALIZZAZIONE DATE RSS
// ============================================================================

/**
 * Converte formati data RSS in YYYY-MM-DD.
 * Gestisce:
 *   - RFC 2822: "Wed, 02 Oct 2024 10:00:00 +0200"
 *   - ISO 8601: "2024-10-02T10:00:00Z"
 *   - GG/MM/AAAA: "02/10/2024"
 *   - Formati italiani: "2 ottobre 2024"
 *
 * @param {string} dateString
 * @return {string} YYYY-MM-DD o stringa vuota se non parsabile
 */
function normalizzaDataRss(dateString) {
  if (!dateString) return '';
  var s = String(dateString).trim();

  // 1. ISO 8601 (2024-10-02T10:00:00Z)
  var isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];

  // 2. GG/MM/AAAA
  var slashMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (slashMatch) return slashMatch[3] + '-' + slashMatch[2].padStart(2, '0') + '-' + slashMatch[1].padStart(2, '0');

  // 3. RFC 2822 (Wed, 02 Oct 2024 10:00:00 +0200)
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
      return Utilities.formatDate(d, 'Europe/Rome', 'yyyy-MM-dd');
    }
  } catch(_){}

  // 4. Mesi italiani
  var mesiIt = { 'gennaio':'01','febbraio':'02','marzo':'03','aprile':'04','maggio':'05','giugno':'06',
    'luglio':'07','agosto':'08','settembre':'09','ottobre':'10','novembre':'11','dicembre':'12' };
  var itMatch = s.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
  if (itMatch) {
    var meseNum = mesiIt[itMatch[2].toLowerCase()];
    if (meseNum) return itMatch[3] + '-' + meseNum + '-' + itMatch[1].padStart(2, '0');
  }

  return '';
}

// ============================================================================
// 4. HELPERS PRIVATI
// ============================================================================

/**
 * Carica fonti RSS attive dal foglio FontiBandi_v5.
 * @private
 */
function _loadFontiRssAttive_() {
  try {
    // Usa getFontiUnified se disponibile
    if (typeof getFontiUnified === 'function') {
      var res = getFontiUnified({ tipo: 'bandi', attiva: true });
      if (res && res.ok) {
        return res.fonti.filter(function(f) {
          return String(f.tipoFonte || '').toUpperCase() === 'RSS';
        });
      }
    }
    // Fallback: lettura diretta
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('FontiBandi_v5');
    if (!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iId = head.indexOf('ID'), iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL'),
        iTipo = head.indexOf('Tipo'), iAtt = head.indexOf('Attiva'),
        iFail = head.indexOf('FailConsecutivi'), iEnte = head.indexOf('EnteDefault'),
        iLiv = head.indexOf('Livello'), iCat = head.indexOf('Categoria'),
        iTag = head.indexOf('Tag');
    var fonti = [];
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iTipo] || '').toUpperCase() !== 'RSS') continue;
      var att = vals[r][iAtt];
      if (!(att === true || String(att).toUpperCase() === 'TRUE')) continue;
      fonti.push({
        id: String(vals[r][iId] || ''),
        nome: String(vals[r][iNome] || ''),
        url: String(vals[r][iUrl] || ''),
        enteDefault: iEnte >= 0 ? String(vals[r][iEnte] || '') : '',
        livello: iLiv >= 0 ? String(vals[r][iLiv] || '') : '',
        categoria: iCat >= 0 ? String(vals[r][iCat] || '') : '',
        tag: iTag >= 0 ? String(vals[r][iTag] || '') : '',
        failConsec: iFail >= 0 ? Number(vals[r][iFail] || 0) : 0,
        _row: r + 1
      });
    }
    return fonti;
  } catch(e) {
    Logger.log(_RSS_SCAN_LOG_PREFIX_ + '_loadFontiRssAttive_ errore: ' + e.message);
    return [];
  }
}

/**
 * Carica tutti gli URL bandi esistenti per dedup veloce.
 * @private
 */
function _loadExistingBandiUrls_() {
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
  } catch(e) {
    Logger.log(_RSS_SCAN_LOG_PREFIX_ + '_loadExistingBandiUrls_ errore: ' + e.message);
  }
  return urls;
}

/**
 * Accede al foglio Bandi_v5 per salvare bandi grezzi.
 * @private
 */
function _getBandiGrezziSheet_() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (sh) return sh;
    // Crea se non esiste (fallback)
    if (typeof _getOrCreateFontiBandiSheet_ === 'function') return _getOrCreateFontiBandiSheet_();
    return null;
  } catch(e) { return null; }
}

/**
 * Estrae testo da un elemento XML (RSS/Atom).
 * @private
 */
function _xmlVal_(el, tagName) {
  try {
    var child = el.getChild(tagName);
    if (!child) {
      // Prova con namespace Atom
      var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
      child = el.getChild(tagName, atomNs);
    }
    return child ? child.getValue() : null;
  } catch(_) { return null; }
}

/**
 * Rimuove tag HTML da una stringa.
 * @private
 */
function _pulisciHtml_(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aggiorna stato fonte dopo scan (UltimaScan, UltimoEsito, contatori).
 * @private
 */
function _aggiornaStatoFonte_(fonte, result) {
  if (!fonte._row) return;
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('FontiBandi_v5');
    if (!sh) return;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var iScan = head.indexOf('UltimaScan');
    var iEsito = head.indexOf('UltimoEsito');
    var iRecTot = head.indexOf('NRecordTotali');
    var iRecUlt = head.indexOf('NRecordUltimo');
    var iFail = head.indexOf('FailConsecutivi');
    var iAtt = head.indexOf('Attiva');
    var iErr = head.indexOf('UltimoErrore');

    var row = fonte._row;
    if (iScan >= 0) sh.getRange(row, iScan + 1).setValue(new Date());

    if (result.errore) {
      if (iEsito >= 0) sh.getRange(row, iEsito + 1).setValue(result.errore.substring(0, 50));
      if (iFail >= 0) sh.getRange(row, iFail + 1).setValue(result.failConsec);
      if (iErr >= 0) sh.getRange(row, iErr + 1).setValue(result.errore);
      // Disabilita se troppi errori consecutivi
      if (result.disabilitata && iAtt >= 0) {
        sh.getRange(row, iAtt + 1).setValue(false);
        Logger.log(_RSS_SCAN_LOG_PREFIX_ + 'DISABILITATA fonte: ' + fonte.nome + ' (' + result.failConsec + ' errori consecutivi)');
      }
    } else {
      if (iEsito >= 0) sh.getRange(row, iEsito + 1).setValue('OK');
      if (iFail >= 0) sh.getRange(row, iFail + 1).setValue(0);
      if (iErr >= 0) sh.getRange(row, iErr + 1).setValue('');
      if (iRecUlt >= 0) sh.getRange(row, iRecUlt + 1).setValue(result.nuovi);
      if (iRecTot >= 0) {
        var oldTot = Number(sh.getRange(row, iRecTot + 1).getValue() || 0);
        sh.getRange(row, iRecTot + 1).setValue(oldTot + result.nuovi);
      }
    }
  } catch(e) {
    Logger.log(_RSS_SCAN_LOG_PREFIX_ + '_aggiornaStatoFonte_ errore: ' + e.message);
  }
}

/**
 * Incrementa fail counter su una fonte dopo un crash.
 * @private
 */
function _incrementFailFonte_(fonte) {
  if (!fonte._row) return;
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('FontiBandi_v5');
    if (!sh) return;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var iFail = head.indexOf('FailConsecutivi');
    var iAtt = head.indexOf('Attiva');
    if (iFail >= 0) {
      var fc = Number(sh.getRange(fonte._row, iFail + 1).getValue() || 0) + 1;
      sh.getRange(fonte._row, iFail + 1).setValue(fc);
      if (fc >= 3 && iAtt >= 0) {
        sh.getRange(fonte._row, iAtt + 1).setValue(false);
        Logger.log(_RSS_SCAN_LOG_PREFIX_ + 'DISABILITATA (crash): ' + fonte.nome);
      }
    }
  } catch(_){}
}

// ============================================================================
// FINE ScannerRssSpecializzato.gs
// ============================================================================
