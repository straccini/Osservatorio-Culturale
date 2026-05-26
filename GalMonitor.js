/**
 * ============================================================================
 *  GalMonitor.js — Scanner bandi culturali GAL italiani
 * ============================================================================
 *  v1.0.0 (2026-05-26)
 *
 *  Architettura:
 *  - 86 GAL attivi con URL verificati, su foglio GalAnagrafica
 *  - Rotazione giornaliera: 10 GAL/giorno (i piu vecchi)
 *  - Scoperta automatica pagina /bandi con fallback multipli
 *  - Filtro semantico culturale (inclusione/esclusione)
 *  - Salvataggio bandi su Bandi_v5 con fonte "GAL"
 *  - Deduplicazione via URL
 *
 *  Funzioni pubbliche:
 *    galRunOggi()               — scansiona batch 10 GAL (rotazione)
 *    galRunTutti()              — scansiona tutti i GAL attivi
 *    galRunSingolo(nomeGal)     — scansiona un singolo GAL
 *    galSetupTrigger()          — trigger giornaliero 06:15
 *    galDiagnostica()           — report stato
 *    galSetupSheet()            — crea foglio + seed 86 GAL
 *    galVerificaUrl()           — testa tutti gli URL
 *
 *  Prefisso: gal_ / _gal*
 * ============================================================================
 */

var GAL_SHEET_NAME = 'GalAnagrafica';
var GAL_BATCH_SIZE = 10;
var GAL_TIMEOUT = 12000; // 12s

// Percorsi tipici dove i GAL pubblicano i bandi
var GAL_BANDI_PATHS = [
  '/bandi', '/bandi/', '/bandi-attivi', '/bandi-attivi/',
  '/archivio-bandi/bandi-aperti/', '/archivio-bandi/',
  '/bandi-e-finanziamenti/', '/bandi-di-finanziamento/',
  '/bandi-pubblicati/', '/avvisi-e-bandi/', '/avvisi/',
  '/news/', '/category/bandi/'
];

// Keywords inclusione (ambito culturale/territoriale)
var GAL_KW_INCLUDE = /cultur|teatr|spettacol|muse[oi]|esposizion|restaur|recupero.?storico|mulin[oi]|borgh[io]|cammin[oi]|sentierist|artigianat|laborator.?creativ|turismo.?cultural|archeolog|tradizion.?local|bibliotec|patrimoni|beni.?cultural|rigenerazion|valorizzazion|paesagg|storico.?artist|architettur|monumento|festival|rassegn|evento.?cultural|genius.?loci|identit|artigian|botteg|mestier|saper.?fare|enogastronom|produzioni.?tipic|leader|sviluppo.?local|gal|azione.?locale/i;

// Keywords esclusione (zootecnia pura)
var GAL_KW_EXCLUDE = /trattor[ei]|stall[ae]|fienagion|caseific|mungitr|allevament[oi]|concim[ei]|zootecn|aratr[oi]|biomassa.?agricol|pesticid|fitosanitar|irrigazion.?intensiv|suinicol|avicol|bovini|ovini|mangim/i;

// ============================================================================
// ESECUZIONE
// ============================================================================

/**
 * Scansiona batch di 10 GAL con data piu vecchia.
 */
function galRunOggi() {
  // Auto-archivia bandi scaduti prima della scansione
  try { autoArchiviaBandiScaduti(); } catch(_) {}

  var sheet = _galGetSheet_();
  if (!sheet) return { ok: false, error: 'Foglio ' + GAL_SHEET_NAME + ' non trovato. Lancia galSetupSheet().' };

  var gals = _galGetBatch_(sheet, GAL_BATCH_SIZE);
  if (!gals.length) return { ok: true, skip: 'nessun GAL attivo' };

  return _galScanBatch_(gals, sheet);
}

/**
 * Scansiona tutti i GAL attivi.
 */
function galRunTutti() {
  var sheet = _galGetSheet_();
  if (!sheet) return { ok: false, error: 'Foglio non trovato' };

  var gals = _galGetBatch_(sheet, 9999);
  return _galScanBatch_(gals, sheet);
}

/**
 * Scansiona un singolo GAL per nome.
 */
function galRunSingolo(nomeGal) {
  var sheet = _galGetSheet_();
  if (!sheet) return { ok: false, error: 'Foglio non trovato' };

  var data = sheet.getDataRange().getValues();
  var head = data[0];
  var iNome = head.indexOf('NomeGal');
  if (iNome < 0) return { ok: false, error: 'Colonna NomeGal non trovata' };

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iNome]).toLowerCase().indexOf(String(nomeGal).toLowerCase()) >= 0) {
      var gal = _galRowToObj_(head, data[r], r + 1);
      return _galScanBatch_([gal], sheet);
    }
  }
  return { ok: false, error: 'GAL non trovato: ' + nomeGal };
}

function _galScanBatch_(gals, sheet) {
  var t0 = Date.now();
  var report = { ok: true, scansionati: gals.length, totBandi: 0, nuovi: 0, culturali: 0, errori: 0, dettaglio: [] };
  var existingUrls = _galLoadExistingUrls_();

  Logger.log('================================================================');
  Logger.log('[GAL] Scansione ' + gals.length + ' GAL');
  Logger.log('================================================================');

  gals.forEach(function(gal) {
    // Wall-clock guard (5 min)
    if (Date.now() - t0 > 300000) {
      report.dettaglio.push({ gal: gal.nome, azione: 'timeout' });
      return;
    }

    var result = _galScanSingle_(gal, existingUrls);
    report.totBandi += result.bandi || 0;
    report.nuovi += result.nuovi || 0;
    report.culturali += result.culturali || 0;
    if (result.errore) report.errori++;
    report.dettaglio.push({ gal: gal.nome, regione: gal.regione, nuovi: result.nuovi, culturali: result.culturali, errore: result.errore || null });

    // Aggiorna data ultimo controllo
    var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var iUltimo = head.indexOf('UltimoControllo');
    var iBandiUrl = head.indexOf('BandiUrl');
    if (iUltimo >= 0) sheet.getRange(gal.row, iUltimo + 1).setValue(new Date());
    if (iBandiUrl >= 0 && result.bandiUrl) sheet.getRange(gal.row, iBandiUrl + 1).setValue(result.bandiUrl);

    Utilities.sleep(800 + Math.floor(Math.random() * 1200)); // delay cortese
  });

  report.durataMs = Date.now() - t0;
  Logger.log('[GAL] Completato: ' + report.nuovi + ' nuovi (' + report.culturali + ' culturali), ' + report.errori + ' errori (' + report.durataMs + 'ms)');

  // Telegram
  if (report.culturali > 0 && typeof _tgSend_ === 'function') {
    try {
      var msg = '*GAL Monitor*\n' + report.culturali + ' bandi culturali trovati\n';
      report.dettaglio.forEach(function(d) {
        if (d.culturali > 0) msg += d.gal + ': ' + d.culturali + ' culturali\n';
      });
      _tgSend_(msg);
    } catch (_) {}
  }

  return report;
}

// ============================================================================
// SCAN SINGOLO GAL
// ============================================================================

function _galScanSingle_(gal, existingUrls) {
  var result = { bandi: 0, nuovi: 0, culturali: 0, errore: null, bandiUrl: '' };

  // 1. Trova pagina bandi
  var bandiUrl = gal.bandiUrl || '';
  var html = '';

  if (bandiUrl) {
    var resp = _galFetch_(bandiUrl);
    if (resp) {
      html = resp;
    } else {
      bandiUrl = ''; // URL salvato non funziona piu
    }
  }

  if (!bandiUrl) {
    var found = _galFindBandiPage_(gal.dominio);
    if (found) {
      bandiUrl = found.url;
      html = found.html;
    }
  }

  if (!bandiUrl || !html) {
    Logger.log('[GAL] ' + gal.nome + ': pagina bandi non trovata');
    result.errore = 'no_bandi_page';
    return result;
  }

  result.bandiUrl = bandiUrl;
  Logger.log('[GAL] ' + gal.nome + ': ' + bandiUrl);

  // 2. Estrai bandi dal HTML
  var bandi = _galExtractBandi_(html, bandiUrl);
  result.bandi = bandi.length;

  // 3. Filtra e salva
  bandi.forEach(function(b) {
    if (!b.link || existingUrls[b.link.toLowerCase()]) return;

    var isCulturale = _galIsCulturale_(b.titolo, b.descrizione);
    if (!isCulturale) return;

    _galSaveBando_({
      titolo: b.titolo,
      ente: gal.nome,
      regione: gal.regione,
      urlBando: b.link,
      sommario: b.descrizione,
      scadenza: b.scadenza,
      fonteNome: 'GAL ' + gal.nome
    });
    existingUrls[b.link.toLowerCase()] = true;
    result.nuovi++;
    result.culturali++;
    Logger.log('[GAL] ** ' + b.titolo.substring(0, 80));
  });

  Logger.log('[GAL] ' + gal.nome + ': ' + bandi.length + ' bandi, ' + result.nuovi + ' nuovi culturali');
  return result;
}

// ============================================================================
// SCOPERTA PAGINA BANDI
// ============================================================================

function _galFindBandiPage_(baseUrl) {
  // 1. Prova percorsi noti
  for (var i = 0; i < GAL_BANDI_PATHS.length; i++) {
    var url = baseUrl.replace(/\/+$/, '') + GAL_BANDI_PATHS[i];
    var html = _galFetch_(url);
    if (html && html.length > 500) {
      var lower = html.toLowerCase();
      if (lower.indexOf('bando') >= 0 || lower.indexOf('bandi') >= 0 || lower.indexOf('avviso') >= 0) {
        return { url: url, html: html };
      }
    }
    Utilities.sleep(300);
  }

  // 2. Fallback: cerca nella homepage link a bandi
  var homeHtml = _galFetch_(baseUrl);
  if (!homeHtml) return null;

  var linkPat = /href=["']([^"']*(?:bandi|avvis|finanziament)[^"']*)["']/gi;
  var m;
  while ((m = linkPat.exec(homeHtml)) !== null) {
    var href = m[1];
    if (href.indexOf('http') !== 0) {
      var base = baseUrl.match(/^https?:\/\/[^\/]+/);
      href = (href.indexOf('/') === 0) ? (base ? base[0] : '') + href : baseUrl.replace(/\/+$/, '') + '/' + href;
    }
    // Verifica che sia dello stesso dominio
    try {
      if (href.indexOf(baseUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]) < 0) continue;
    } catch (_) {}

    var html2 = _galFetch_(href);
    if (html2 && html2.length > 500) return { url: href, html: html2 };
    Utilities.sleep(300);
  }

  return null;
}

// ============================================================================
// ESTRAZIONE BANDI DA HTML
// ============================================================================

function _galExtractBandi_(html, baseUrl) {
  var bandi = [];
  var seenLinks = {};
  var base = baseUrl.match(/^https?:\/\/[^\/]+/);
  base = base ? base[0] : '';

  // Pattern: <a href="...">testo lungo</a> con contesto circostante
  var pat = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = pat.exec(html)) !== null && bandi.length < 50) {
    var href = m[1].trim();
    var text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    if (text.length < 15) continue;
    if (/\.(jpg|png|gif|css|js|pdf)$/i.test(href)) continue;
    if (href.indexOf('mailto:') === 0) continue;

    // Risolvi URL relativo
    if (href.indexOf('http') !== 0) {
      href = (href.indexOf('/') === 0) ? base + href : baseUrl.replace(/\/+$/, '') + '/' + href;
    }

    if (seenLinks[href.toLowerCase()]) continue;
    seenLinks[href.toLowerCase()] = true;

    // Cerca contesto circostante (descrizione, date)
    var pos = m.index;
    var context = html.substring(Math.max(0, pos - 200), Math.min(html.length, pos + m[0].length + 300));
    context = context.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    var scadenza = _galFindDate_(context);

    bandi.push({
      titolo: text.substring(0, 300),
      link: href,
      descrizione: context.substring(0, 500),
      scadenza: scadenza
    });
  }

  return bandi;
}

function _galFindDate_(text) {
  if (!text) return '';
  var m = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
  if (m) return m[1];
  var m2 = text.match(/scadenz\w*[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i);
  if (m2) return m2[1];
  return '';
}

// ============================================================================
// FILTRO SEMANTICO CULTURALE
// ============================================================================

function _galIsCulturale_(titolo, descrizione) {
  var testo = (titolo + ' ' + (descrizione || '')).toLowerCase();
  if (GAL_KW_EXCLUDE.test(testo)) return false;
  if (GAL_KW_INCLUDE.test(testo)) return true;
  return false;
}

// ============================================================================
// HTTP + SALVATAGGIO
// ============================================================================

function _galFetch_(url) {
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SinopiaGALBot/1.0)',
        'Accept': 'text/html,*/*'
      }
    });
    if (resp.getResponseCode() === 200) return resp.getContentText();
  } catch (_) {}
  return null;
}

function _galSaveBando_(b) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh) { sh = ss.getSheetByName('RADAR BANDI'); }
    if (!sh) return;
    var id = 'GL' + Date.now() + Math.random().toString(36).substring(2, 4);
    sh.appendRow([
      id, '', new Date(),
      String(b.titolo || '').substring(0, 300),
      String(b.ente || ''),
      'Locale', // livello
      String(b.regione || ''),
      'Bandi GAL', // settore
      b.scadenza || '', '', '', '',
      'GAL', // scanner
      String(b.fonteNome || ''),
      String(b.urlBando || ''),
      '', '', '',
      String(b.sommario || '').substring(0, 500),
      1, // ambito (Identita)
      '', 'nuovo_da_triage', 'attivo', false, false, ''
    ]);
  } catch (e) { Logger.log('[GAL] save: ' + e.message); }
}

function _galLoadExistingUrls_() {
  var urls = {};
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ['Bandi_v5', 'RADAR BANDI'];
    sheets.forEach(function(name) {
      var sh = ss.getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return;
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = -1;
      for (var c = 0; c < head.length; c++) {
        if (/url|link/i.test(String(head[c]))) { iUrl = c; break; }
      }
      if (iUrl < 0) return;
      for (var r = 1; r < vals.length; r++) {
        var u = String(vals[r][iUrl] || '').trim().toLowerCase();
        if (u) urls[u] = true;
      }
    });
  } catch (_) {}
  return urls;
}

// ============================================================================
// SHEET HELPERS
// ============================================================================

function _galGetSheet_() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheetByName(GAL_SHEET_NAME);
  } catch (_) { return null; }
}

function _galGetBatch_(sheet, limit) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var head = data[0];
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var obj = _galRowToObj_(head, data[r], r + 1);
    if (obj.stato === 'attivo') rows.push(obj);
  }
  // Ordina per ultimo controllo (piu vecchio prima)
  rows.sort(function(a, b) {
    var da = a.ultimoControllo ? new Date(a.ultimoControllo).getTime() : 0;
    var db = b.ultimoControllo ? new Date(b.ultimoControllo).getTime() : 0;
    return da - db;
  });
  return rows.slice(0, limit);
}

function _galRowToObj_(head, row, rowNum) {
  var obj = { row: rowNum };
  for (var c = 0; c < head.length; c++) {
    var key = String(head[c]).trim();
    if (key === 'Regione') obj.regione = String(row[c] || '');
    if (key === 'NomeGal') obj.nome = String(row[c] || '');
    if (key === 'DominioWeb') obj.dominio = String(row[c] || '');
    if (key === 'BandiUrl') obj.bandiUrl = String(row[c] || '');
    if (key === 'UltimoControllo') obj.ultimoControllo = row[c] || '';
    if (key === 'Stato') obj.stato = String(row[c] || 'attivo');
  }
  return obj;
}

// ============================================================================
// TRIGGER + DIAGNOSTICA
// ============================================================================

function galSetupTrigger() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      var fn = t.getHandlerFunction();
      if (fn === 'galRunOggi' || fn === 'autoArchiviaBandiScaduti') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('galRunOggi').timeBased().everyDays(1).atHour(6).nearMinute(15).create();
    ScriptApp.newTrigger('autoArchiviaBandiScaduti').timeBased().everyDays(1).atHour(4).nearMinute(0).create();
    Logger.log('[GAL] Trigger: galRunOggi 06:15 + autoArchiviaBandiScaduti 04:00');
    return { ok: true, triggers: ['galRunOggi 06:15', 'autoArchiviaBandiScaduti 04:00'] };
  } catch (e) { return { ok: false, error: e.message }; }
}

function galDiagnostica() {
  var sheet = _galGetSheet_();
  if (!sheet) return { ok: false, error: 'Foglio non trovato' };

  var data = sheet.getDataRange().getValues();
  var head = data[0];
  var attivi = 0, irr = 0, mai = 0, totale = data.length - 1;

  for (var r = 1; r < data.length; r++) {
    var obj = _galRowToObj_(head, data[r], r + 1);
    if (obj.stato === 'attivo') attivi++;
    else irr++;
    if (!obj.ultimoControllo || String(obj.ultimoControllo).indexOf('2000') >= 0) mai++;
  }

  var bandi = 0;
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var bsh = ss.getSheetByName('Bandi_v5');
    if (bsh) {
      var vals = bsh.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][12] || '') === 'GAL') bandi++;
      }
    }
  } catch (_) {}

  var triggerAttivo = false;
  try {
    triggerAttivo = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'galRunOggi'; });
  } catch (_) {}

  var out = {
    ok: true,
    timestamp: new Date().toISOString(),
    galTotali: totale,
    galAttivi: attivi,
    galIrraggiungibili: irr,
    maiScansionati: mai,
    bandiGalInDb: bandi,
    triggerAttivo: triggerAttivo
  };

  Logger.log('[GAL] Diagnostica: ' + attivi + ' attivi, ' + irr + ' irr, ' + bandi + ' bandi GAL, trigger=' + triggerAttivo);
  return out;
}

function galVerificaUrl() {
  var sheet = _galGetSheet_();
  if (!sheet) return { ok: false, error: 'Foglio non trovato' };

  var data = sheet.getDataRange().getValues();
  var head = data[0];
  var iDom = head.indexOf('DominioWeb');
  var iStato = head.indexOf('Stato');
  var iNote = head.indexOf('Note');
  var ok = 0, fail = 0;

  for (var r = 1; r < data.length; r++) {
    var url = String(data[r][iDom] || '').trim();
    if (!url) continue;
    var nome = String(data[r][head.indexOf('NomeGal')] || '');

    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true, followRedirects: true,
        validateHttpsCertificates: false,
        headers: { 'User-Agent': 'SinopiaGALBot/1.0' }
      });
      var code = resp.getResponseCode();
      var size = resp.getContentText().length;
      if (code === 200 && size > 100) {
        ok++;
        if (iStato >= 0) sheet.getRange(r + 1, iStato + 1).setValue('attivo');
        if (iNote >= 0) sheet.getRange(r + 1, iNote + 1).setValue('OK ' + size + 'b');
        Logger.log('[GAL-CHECK] ' + nome + ': OK (' + size + 'b)');
      } else {
        fail++;
        if (iStato >= 0) sheet.getRange(r + 1, iStato + 1).setValue('irraggiungibile');
        if (iNote >= 0) sheet.getRange(r + 1, iNote + 1).setValue('FAIL HTTP ' + code);
        Logger.log('[GAL-CHECK] ' + nome + ': FAIL (' + code + ')');
      }
    } catch (e) {
      fail++;
      if (iStato >= 0) sheet.getRange(r + 1, iStato + 1).setValue('irraggiungibile');
      if (iNote >= 0) sheet.getRange(r + 1, iNote + 1).setValue('FAIL ' + e.message.substring(0, 40));
      Logger.log('[GAL-CHECK] ' + nome + ': FAIL (' + e.message.substring(0, 40) + ')');
    }
    Utilities.sleep(500);
  }

  Logger.log('[GAL-CHECK] TOTALE: ' + ok + ' OK, ' + fail + ' FAIL');
  return { ok: true, funzionanti: ok, falliti: fail };
}

// ============================================================================
// AUTO-ARCHIVIAZIONE BANDI SCADUTI (cross-sheet)
// ============================================================================

/**
 * Archivia automaticamente i bandi scaduti su TUTTI i fogli bandi.
 * Chiamata dai trigger giornalieri (galRunOggi, agrRunOggi).
 * Archivia se la data di scadenza e passata (giorno stesso incluso).
 */
function autoArchiviaBandiScaduti() {
  var oggi = new Date();
  oggi.setHours(23, 59, 59, 999); // fine giornata: archivia anche quelli che scadono oggi
  var totale = 0;

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

    // 1. Bandi_v5 (colonna 12 = Scadenza, colonna 23 = StatoRecord)
    totale += _archiviaScadutiSheet_(ss, 'Bandi_v5', 12, 23, oggi);

    // 2. RADAR BANDI legacy (se ancora esiste, non ancora migrato)
    var shRadar = ss.getSheetByName('RADAR BANDI');
    if (shRadar) {
      var head = shRadar.getRange(1, 1, 1, shRadar.getLastColumn()).getValues()[0];
      var iScad = -1, iStato = -1;
      for (var c = 0; c < head.length; c++) {
        var h = String(head[c]).toLowerCase();
        if (h === 'scadenza') iScad = c + 1;
        if (h === 'statorecord' || h === 'stato') iStato = c + 1;
      }
      if (iScad > 0 && iStato > 0) {
        totale += _archiviaScadutiSheet_(ss, 'RADAR BANDI', iScad, iStato, oggi);
      }
    }

    if (totale > 0) {
      Logger.log('[AUTO-ARCH] Archiviati ' + totale + ' bandi scaduti');
      if (typeof _tgSend_ === 'function') {
        try { _tgSend_('Archiviati automaticamente ' + totale + ' bandi scaduti'); } catch(_) {}
      }
    } else {
      Logger.log('[AUTO-ARCH] Nessun bando scaduto da archiviare');
    }
  } catch(e) {
    Logger.log('[AUTO-ARCH] Errore: ' + e.message);
  }

  return { ok: true, archiviati: totale };
}

function _archiviaScadutiSheet_(ss, sheetName, colScadenza, colStato, oggi) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return 0;

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var n = 0;

  for (var r = 0; r < data.length; r++) {
    var stato = String(data[r][colStato - 1] || '').toLowerCase();
    if (stato === 'archiviato') continue;

    var rawScad = data[r][colScadenza - 1];
    if (!rawScad) continue;

    var dataScad = _parseDataScadenza_(rawScad);
    if (!dataScad || isNaN(dataScad.getTime())) continue;

    if (dataScad < oggi) {
      sh.getRange(r + 2, colStato).setValue('archiviato');
      n++;
    }
  }

  if (n > 0) Logger.log('[AUTO-ARCH] ' + sheetName + ': archiviati ' + n + ' bandi scaduti');
  return n;
}

/**
 * Parsing robusto date scadenza in formati italiani:
 * dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, "30 giugno 2026", Date object
 */
function _parseDataScadenza_(raw) {
  if (raw instanceof Date) return raw;
  var s = String(raw).trim();
  if (!s) return null;

  // dd/mm/yyyy o dd-mm-yyyy o dd.mm.yyyy
  var m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));

  // yyyy-mm-dd (ISO)
  var m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));

  // "30 giugno 2026" o "30 Giugno 2026"
  var MESI = { gennaio:0, febbraio:1, marzo:2, aprile:3, maggio:4, giugno:5, luglio:6, agosto:7, settembre:8, ottobre:9, novembre:10, dicembre:11 };
  var m3 = s.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m3 && MESI[m3[2].toLowerCase()] !== undefined) {
    return new Date(parseInt(m3[3]), MESI[m3[2].toLowerCase()], parseInt(m3[1]));
  }

  // Fallback: prova Date nativo
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ============================================================================
// SETUP — crea foglio e popola con 86 GAL verificati
// ============================================================================

function galSetupSheet() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GAL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(GAL_SHEET_NAME);
    sheet.getRange(1, 1, 1, 8).setValues([['Regione', 'NomeGal', 'DominioWeb', 'BandiUrl', 'UltimoControllo', 'Stato', 'Note', 'ID']]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  }

  // Seed solo se vuoto
  if (sheet.getLastRow() > 1) {
    Logger.log('[GAL] Foglio gia popolato (' + (sheet.getLastRow() - 1) + ' righe)');
    return { ok: true, existing: sheet.getLastRow() - 1 };
  }

  var seed = _galSeedData_();
  var rows = seed.map(function(g, i) {
    return [g[0], g[1], g[2], '', '', 'attivo', '', 'GAL' + (i + 1)];
  });

  sheet.getRange(2, 1, rows.length, 8).setValues(rows);
  Logger.log('[GAL] Seed completato: ' + rows.length + ' GAL inseriti');
  return { ok: true, inserted: rows.length };
}

function _galSeedData_() {
  return [
    // Piemonte (4 attivi verificati)
    ['Piemonte', 'GAL Valli di Lanzo', 'http://www.gal-vallilanzocerondacasternone.it'],
    ['Piemonte', 'GAL Langhe Roero', 'https://www.langheroeroleader.it'],
    ['Piemonte', 'GAL Escartons e Valli Valdesi', 'https://www.evv.it/'],
    ['Piemonte', 'GAL Terre del Canavese', 'https://galvallidelcanavese.it/'],
    ['Piemonte', 'GAL Valli Gesso Vermenagna Pesio', 'https://www.galgvp.eu'],
    ['Piemonte', 'GAL Mongioie', 'https://www.galmongioie.it'],
    ['Piemonte', 'GAL Basso Monferrato Astigiano', 'https://www.monferratoastigiano.it/'],
    ['Piemonte', 'GAL Giarolo Leader', 'https://giarololeader.it/'],
    // Lombardia (6 attivi)
    ['Lombardia', 'GAL Oglio Po', 'https://www.galogliopo.it'],
    ['Lombardia', 'GAL Garda e Colli Mantovani', 'https://www.galgardaecollimantovani.it/'],
    ['Lombardia', 'GAL Valle Brembana', 'https://www.galvallebrembana2020.it/'],
    ['Lombardia', 'GAL Valtellina', 'https://www.galvaltellina.it'],
    ['Lombardia', 'GAL Parchi e Valli Lecchese', 'https://www.gallecchese.it/'],
    ['Lombardia', 'GAL Risorsa Lomellina', 'https://www.galrisorsalomellina.it'],
    ['Lombardia', 'GAL Oltrepo Pavese', 'https://www.galoltreposrl.it/'],
    ['Lombardia', 'GAL Colli Bergamo Canto Alto', 'https://gal-collibergamocantoalto.it/'],
    ['Lombardia', 'GAL Sebino Valle Camonica', 'https://www.galsebinovallecamonica.it/'],
    // Veneto
    ['Veneto', 'GAL Patavino', 'https://www.galpatavino.it'],
    ['Veneto', 'GAL Baldo Lessinia', 'https://www.baldolessinia.it'],
    ['Veneto', 'GAL Prealpi e Dolomiti', 'https://www.galprealpidolomiti.it'],
    ['Veneto', 'GAL Venezia Orientale (VeGAL)', 'https://www.vegal.net'],
    // Friuli-Venezia Giulia
    ['Friuli-Venezia Giulia', 'GAL Carso', 'https://www.galcarso.eu'],
    ['Friuli-Venezia Giulia', 'GAL Montagna Leader', 'https://www.montagnaleader.org'],
    ['Friuli-Venezia Giulia', 'GAL Open Leader', 'https://www.openleader.it'],
    ['Friuli-Venezia Giulia', 'GAL Torre Natisone', 'https://torrenatisonegal.com/'],
    // Liguria
    ['Liguria', 'GAL Riviera dei Fiori', 'https://www.galrivieradeifiori.it'],
    // Emilia-Romagna
    ['Emilia-Romagna', 'GAL Delta 2000', 'https://www.deltaduemila.net'],
    ['Emilia-Romagna', 'GAL Del Ducato', 'https://www.galdelducato.it'],
    ['Emilia-Romagna', 'GAL L\'Altra Romagna', 'https://www.altraromagna.it'],
    ['Emilia-Romagna', 'GAL Modena Reggio', 'https://galmodenareggio.it/'],
    ['Emilia-Romagna', 'GAL Appennino Bolognese', 'https://bolognappennino.it/'],
    ['Emilia-Romagna', 'GAL Valli Marecchia e Conca', 'https://vallimarecchiaeconca.it/'],
    // Toscana
    ['Toscana', 'GAL Terre Etrusche', 'https://www.galterretrusche.com'],
    ['Toscana', 'GAL FAR Maremma', 'https://www.farmaremma.it'],
    ['Toscana', 'GAL MontagnAppennino', 'https://montagnappennino.it/'],
    ['Toscana', 'GAL Lunigiana', 'https://sviluppolunigiana.it/'],
    ['Toscana', 'GAL Leader Siena', 'https://leadersiena.it/'],
    ['Toscana', 'GAL Appennino Aretino', 'https://galaretino.it/'],
    // Umbria
    ['Umbria', 'GAL Valle Umbra e Sibillini', 'https://www.valleumbraesibillini.com'],
    ['Umbria', 'GAL Alta Umbria', 'https://www.galaltaumbria.it'],
    ['Umbria', 'GAL Ternano', 'https://www.galternano.it'],
    // Marche
    ['Marche', 'GAL Fermano', 'https://www.galfermano.it'],
    ['Marche', 'GAL Montefeltro Sviluppo', 'https://www.montefeltro-leader.it'],
    ['Marche', 'GAL Sibilla', 'https://www.galsibilla.it'],
    // Lazio
    ['Lazio', 'GAL Castelli Romani', 'http://www.galcastelli.it'],
    ['Lazio', 'GAL Etruria Meridionale', 'https://www.galetruriameridionale.it'],
    ['Lazio', 'GAL Terre di Argil', 'https://www.galterrediargil.it'],
    // Abruzzo
    ['Abruzzo', 'GAL Maiella Verde', 'https://www.maiellaverde.it'],
    ['Abruzzo', 'GAL Gran Sasso Laga', 'https://www.galgransassolaga.it'],
    ['Abruzzo', 'GAL Marsica', 'https://www.galmarsica.it'],
    ['Abruzzo', 'GAL Abruzzo Italico', 'https://www.galabruzzo.it/'],
    ['Abruzzo', 'GAL Terre Pescaresi', 'https://gal.terrepescaresi.it/'],
    // Molise
    ['Molise', 'GAL Molise verso il 2000', 'https://www.moliseversoil2000.it'],
    // Campania
    ['Campania', 'GAL Alto Casertano', 'https://www.altocasertano.it'],
    ['Campania', 'GAL Casacastra', 'https://www.galcasacastra.it'],
    ['Campania', 'GAL Colline Salernitane', 'https://www.galcollinesalernitane.it'],
    ['Campania', 'GAL Irpinia', 'https://www.galirpinia.it'],
    ['Campania', 'GAL Taburno', 'https://www.galtaburno.it'],
    ['Campania', 'GAL Terra Protetta', 'https://www.galterraprotetta.it'],
    ['Campania', 'GAL Titerno', 'https://www.galtiterno.it'],
    // Puglia
    ['Puglia', 'GAL Gargano', 'https://www.galgargano.it'],
    ['Puglia', 'GAL Luoghi del Mito', 'https://www.luoghidelmito.it'],
    ['Puglia', 'GAL Ponte Lama', 'https://www.galpontelama.it'],
    ['Puglia', 'GAL Terre di Murgia', 'https://www.galterredimurgia.it'],
    ['Puglia', 'GAL Valle d\'Itria', 'https://www.galvalleditria.it'],
    // Basilicata
    ['Basilicata', 'GAL Cittadella del Sapere', 'https://www.lacittadelladelsapere.it'],
    ['Basilicata', 'GAL Percorsi', 'https://www.galpercorsi.it'],
    // Calabria
    ['Calabria', 'GAL Batir', 'https://www.galbatir.it'],
    ['Calabria', 'GAL Kroton', 'https://www.galkroton.it'],
    ['Calabria', 'GAL Serre Calabresi', 'https://www.galserrecalabresi.it'],
    ['Calabria', 'GAL Terre Locridee', 'https://www.galterrelocridee.it'],
    // Sicilia
    ['Sicilia', 'GAL Elimos', 'https://www.galelimos.it'],
    ['Sicilia', 'GAL Metropoli Est', 'https://www.galmetropoliest.org'],
    ['Sicilia', 'GAL Valle del Belice', 'https://www.galvalledelbelice.it'],
    ['Sicilia', 'GAL ISC Madonie', 'https://madoniegal.it/'],
    ['Sicilia', 'GAL Sicani', 'https://galsicani.eu/'],
    ['Sicilia', 'GAL Terra Barocca', 'https://galterrabarocca.com/'],
    ['Sicilia', 'GAL Etna Alcantara', 'https://galetnaalcantara.com/'],
    // Sardegna
    ['Sardegna', 'GAL Barbagia', 'https://www.galbarbagia.it'],
    ['Sardegna', 'GAL BMG', 'https://www.galbmg.it'],
    ['Sardegna', 'GAL Sarcidano Barbagia di Seulo', 'https://www.galsarcidanobarbagiadiseulo.it'],
    ['Sardegna', 'GAL Anglona Romangia', 'https://www.galanglonaromangia.it'],
    ['Sardegna', 'GAL Sulcis Iglesiente', 'https://www.galsulcisiglesiente.it'],
    // Trentino-Alto Adige
    ['Trentino-Alto Adige', 'GAL Trentino Orientale', 'https://www.galtrentinorientale.it'],
    // Valle d'Aosta
    ['Valle d\'Aosta', 'GAL Valle d\'Aosta', 'https://gal.vda.it/']
  ];
}

// ============================================================================
// FINE GalMonitor.js
// ============================================================================
