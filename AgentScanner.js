/**
 * ============================================================================
 *  AgentScanner.js — Scanner parametrico multi-agente (v4.18.55)
 * ----------------------------------------------------------------------------
 *  Legge fonti da FontiAgenti, filtra per agente, applica hash-first
 *  per evitare call Claude inutili, estrae contenuti, salva risultati.
 *
 *  Funzioni pubbliche (trigger):
 *    scanAgente(agenteId)        — scan tutte le fonti di un agente
 *    scanAllAgenti()             — scan sequenziale tutti gli agenti
 *    scanAgente1(), ..., scanAgente5() — alias per trigger GAS
 *
 *  Funzioni admin:
 *    setupAgentTriggers()        — installa trigger per tutti gli agenti
 *    testAgentScan(agenteId, n)  — scan N fonti di test (senza salvataggio)
 *
 *  Dipendenze: AgentConfig.js, Scannerbandi.js (per Claude API)
 * ============================================================================
 */

var FONTI_AGENTI_SHEET = 'FontiAgenti';  // v4.18.56 — costante locale (duplicata da AgentSetup per indipendenza)
var AGENT_SCAN_SHEET = 'AgentScanResults';
var AGENT_SCAN_HEADERS = [
  'ID', 'AgenteID', 'Titolo', 'Fonte', 'URL', 'DataPubblicazione',
  'SommarioAI', 'TagAI', 'Ambito', 'Score', 'Tipo',
  'FonteNome', 'DataAcquisizione', 'Letto', 'Salvato', 'Archiviato'
];

// ============================================================================
// SCAN PER AGENTE
// ============================================================================

/**
 * Scansiona tutte le fonti attive di un agente.
 * Usa hash-first per evitare call Claude duplicate.
 *
 * @param {number} agenteId — 1-5
 * @param {Object} [opts] — {dryRun: bool, maxFonti: number, verbose: bool}
 * @return {Object} {ok, agenteId, fontiScansionate, nuoviContenuti, errori, tempoMs}
 */
function scanAgente(agenteId, opts) {
  opts = opts || {};
  var t0 = Date.now();
  var agent = getAgentConfig(agenteId);
  if (!agent) return { ok: false, error: 'Agente ' + agenteId + ' non trovato' };

  Logger.log('=== SCAN AGENTE ' + agent.codice + ' — ' + agent.nome + ' ===');

  // Carica fonti da FontiAgenti
  var fonti = _agentGetFonti_(agenteId);
  if (fonti.length === 0) {
    Logger.log('Nessuna fonte attiva per ' + agent.codice);
    return { ok: true, agenteId: agenteId, fontiScansionate: 0, nuoviContenuti: 0, errori: 0, tempoMs: Date.now() - t0 };
  }

  if (opts.maxFonti) fonti = fonti.slice(0, opts.maxFonti);
  Logger.log('Fonti attive: ' + fonti.length);

  // Prepara foglio risultati
  var resultSheet = opts.dryRun ? null : _agentGetOrCreateResultsSheet_();
  var existingTitles = opts.dryRun ? [] : _agentGetExistingTitles_(resultSheet, agenteId);

  var stats = { scansionate: 0, nuovi: 0, skip_hash: 0, errori: 0 };
  var fontiSheet = _agentGetFontiSheet_();

  // v4.20 — Anti-timeout: budget di tempo + cursore di ripresa.
  // Ogni esecuzione lavora max MAX_MS, poi salva l'indice e riprende al lancio dopo.
  var MAX_MS = 270000; // ~4.5 min (limite GAS ~6 min)
  var cursorKey = 'AGENT_CURSOR_' + agenteId;
  var startIdx = 0;
  try { startIdx = parseInt(PropertiesService.getScriptProperties().getProperty(cursorKey) || '0', 10) || 0; } catch(eC) {}
  if (startIdx >= fonti.length || startIdx < 0) startIdx = 0;
  if (startIdx > 0) Logger.log('  [ripresa] riparto da fonte ' + startIdx + '/' + fonti.length);

  var i = startIdx, interrotto = false;
  for (; i < fonti.length; i++) {
    if (Date.now() - t0 > MAX_MS) { interrotto = true; break; }
    var fonte = fonti[i];
    try {
      stats.scansionate++;

      // 1. Fetch contenuto
      var html = _agentFetchUrl_(fonte.url);
      if (!html || html.length < 200) { _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'EMPTY', 0); continue; }

      // 2. Hash-first: confronta con hash precedente
      var hash = _agentMd5_(html.substring(0, 5000));
      if (hash === fonte.ultimoHash && !opts.forceRescan) {
        stats.skip_hash++;
        if (opts.verbose) Logger.log('  SKIP (hash invariato): ' + fonte.nome);
        continue;
      }

      // 3. Prepara testo: API/JSON -> grezzo a Claude; HTML -> pulizia
      var isApi = (String(fonte.tipo).toUpperCase() === 'API' || String(fonte.tipo).toUpperCase() === 'JSON');
      var cleanText = isApi ? html.substring(0, 20000) : _agentCleanHtml_(html);
      if (cleanText.length < 100) { _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'EMPTY_CLEAN', 0); continue; }

      var items = _agentExtractWithClaude_(cleanText, fonte, agent);
      if (!items || items.length === 0) {
        _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'NO_MATCH', 0);
        _agentUpdateFonteHash_(fontiSheet, fonte.row, hash);
        continue;
      }

      // 4. Deduplica e salva
      var nuovi = 0;
      items.forEach(function(item) {
        if (!item.titolo || item.titolo.length < 10) return;
        var titoloNorm = item.titolo.toLowerCase().substring(0, 60);
        if (existingTitles.some(function(t) { return t === titoloNorm; })) return;

        if (!opts.dryRun && resultSheet) {
          var id = 'AS-' + agent.codice + '-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
          var ambitoNum = item.ambito || _agentDetectAmbito_(item, agent);
          resultSheet.appendRow([
            id, agenteId, item.titolo, fonte.nome, item.url || fonte.url,
            item.data || '', item.sommario || '', (item.tags || []).join(', '),
            ambitoNum, item.score || 3, item.tipo || 'news',
            fonte.nome, new Date().toISOString(), false, false, false
          ]);
          existingTitles.push(titoloNorm);
        }
        nuovi++;
      });

      stats.nuovi += nuovi;
      _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'OK', nuovi);
      _agentUpdateFonteHash_(fontiSheet, fonte.row, hash);
      if (opts.verbose || nuovi > 0) Logger.log('  ' + fonte.nome + ': ' + nuovi + ' nuovi');

    } catch(e) {
      stats.errori++;
      Logger.log('  ERRORE ' + fonte.nome + ': ' + e.message);
      _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'ERROR', 0);
    }
  }

  // Cursore: completato -> pulisci; interrotto -> salva il punto di ripresa
  try {
    if (i >= fonti.length) PropertiesService.getScriptProperties().deleteProperty(cursorKey);
    else PropertiesService.getScriptProperties().setProperty(cursorKey, String(i));
  } catch(eC2) {}
  if (interrotto) Logger.log('  [budget tempo] fermato a ' + i + '/' + fonti.length + ' — riprende al prossimo trigger');

  var elapsed = Date.now() - t0;
  var statoFine = interrotto ? ('PARZIALE (ripresa da ' + i + '/' + fonti.length + ')') : 'COMPLETATO';
  Logger.log('=== ' + agent.codice + ' ' + statoFine + ': ' + stats.nuovi + ' nuovi, ' + stats.skip_hash + ' skip hash, ' + stats.errori + ' errori (' + Math.round(elapsed / 1000) + 's) ===');
  return { ok: true, agenteId: agenteId, fontiScansionate: stats.scansionate, nuoviContenuti: stats.nuovi, skipHash: stats.skip_hash, errori: stats.errori, tempoMs: elapsed, completato: !interrotto, prossimoIndice: (interrotto ? i : 0), totaleFonti: fonti.length };
}

// ============================================================================
// ALIAS PER TRIGGER GAS (una funzione per agente)
// ============================================================================

function scanAgente1() { return scanAgente(1); }
function scanAgente2() { return scanAgente(2); }
function scanAgente3() { return scanAgente(3); }
function scanAgente4() { return scanAgente(4); }
function scanAgente5() { return scanAgente(5); }

/**
 * DIAGNOSTICA: elenca tutte le fonti di un agente con stato dell'ultimo scan.
 * Mostra che ogni fonte (es. BandiUp) e' monitorata anche se nel log dello scan
 * non compare (il log stampa solo le fonti con bandi NUOVI).
 * Lanciare dall'editor (Esegui -> diagnosiFontiAg1) e leggere il Log.
 *  - UltimoEsito: OK=trovati nuovi, EMPTY/NO_MATCH=nessun nuovo, ERROR=problema
 *  - UltimaScan: quando e' stata scansionata l'ultima volta
 *  - nUltimo: bandi nuovi all'ultimo scan; nTotali: totale storico
 */
function diagnosiFontiAg1() { return diagnosiFontiAgente(1); }

/**
 * BONIFICA: disattiva le fonti di AG1 perennemente "vuote" — quelle con
 * UltimoEsito che inizia per 'EMPTY' E nessun bando mai raccolto (NRecordTotali=0).
 * Lo scan diventa piu' veloce e mirato (non sprecano slot di scansione).
 *
 * REVERSIBILE: marca la colonna UltimoErrore = 'BONIFICATO_EMPTY' e mette
 * Attiva=false. Per riattivarle tutte: annullaBonificaFontiAg1().
 * Oppure a mano: rimetti Attiva=true nella riga del foglio FontiBandi_v5.
 *
 * NB: NON tocca le fonti NO_MATCH o con bandi gia' raccolti (le tiene attive).
 */
function bonificaFontiAg1() { return bonificaFontiEmptyAgente(1); }

function bonificaFontiEmptyAgente(agenteId) {
  var sh = _agentGetFontiSheet_();
  if (!sh || sh.getLastRow() < 2) { Logger.log('Nessuna fonte trovata'); return { ok: false }; }
  var data = sh.getDataRange().getValues();
  var h = data[0];
  var iAg = h.indexOf('Agente'), iAtt = h.indexOf('Attiva'), iNome = h.indexOf('Nome'),
      iEsito = h.indexOf('UltimoEsito'), iTot = h.indexOf('NRecordTotali'), iErr = h.indexOf('UltimoErrore');
  if (iAtt < 0 || iEsito < 0) { Logger.log('Colonne Attiva/UltimoEsito assenti'); return { ok: false }; }
  var disattivate = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var ags = String(row[iAg] == null ? '' : row[iAg]).split(/[,;]/).map(function(s) { return Number(s.trim()); });
    if (ags.indexOf(agenteId) < 0) continue;
    var attiva = !(row[iAtt] === false || String(row[iAtt]).toLowerCase() === 'false');
    if (!attiva) continue;
    var esito = String(row[iEsito] || '');
    var tot = Number(row[iTot]) || 0;
    if (esito.indexOf('EMPTY') === 0 && tot === 0) {
      sh.getRange(r + 1, iAtt + 1).setValue(false);
      if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('BONIFICATO_EMPTY');
      disattivate.push(row[iNome]);
    }
  }
  Logger.log('=== BONIFICA AG' + agenteId + ': disattivate ' + disattivate.length + ' fonti vuote (EMPTY, 0 bandi) ===');
  disattivate.forEach(function(n) { Logger.log('  - ' + n); });
  Logger.log('Per annullare: annullaBonificaFontiAg1()');
  return { ok: true, disattivate: disattivate.length, nomi: disattivate };
}

/** Annulla la bonifica: riattiva tutte le fonti marcate 'BONIFICATO_EMPTY'. */
function annullaBonificaFontiAg1() {
  var sh = _agentGetFontiSheet_();
  if (!sh || sh.getLastRow() < 2) { Logger.log('Nessuna fonte'); return { ok: false }; }
  var data = sh.getDataRange().getValues();
  var h = data[0];
  var iAtt = h.indexOf('Attiva'), iNome = h.indexOf('Nome'), iErr = h.indexOf('UltimoErrore');
  if (iErr < 0) { Logger.log('Colonna UltimoErrore assente: niente da ripristinare'); return { ok: false }; }
  var riattivate = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iErr] || '') === 'BONIFICATO_EMPTY') {
      sh.getRange(r + 1, iAtt + 1).setValue(true);
      sh.getRange(r + 1, iErr + 1).setValue('');
      riattivate.push(data[r][iNome]);
    }
  }
  Logger.log('=== ANNULLA BONIFICA: riattivate ' + riattivate.length + ' fonti ===');
  riattivate.forEach(function(n) { Logger.log('  - ' + n); });
  return { ok: true, riattivate: riattivate.length, nomi: riattivate };
}

function diagnosiFontiAgente(agenteId) {
  var sh = _agentGetFontiSheet_();
  if (!sh || sh.getLastRow() < 2) { Logger.log('Nessuna fonte trovata'); return []; }
  var data = sh.getDataRange().getValues();
  var h = data[0];
  var iNome = h.indexOf('Nome'), iTipo = h.indexOf('Tipo'), iAg = h.indexOf('Agente'),
      iAtt = h.indexOf('Attiva'), iScan = h.indexOf('UltimaScan'), iEsito = h.indexOf('UltimoEsito'),
      iTot = h.indexOf('NRecordTotali'), iUlt = h.indexOf('NRecordUltimo');
  var out = [];
  Logger.log('=== DIAGNOSI FONTI AG' + agenteId + ' ===');
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var ags = String(row[iAg] == null ? '' : row[iAg]).split(/[,;]/).map(function(s) { return Number(s.trim()); });
    if (ags.indexOf(agenteId) < 0) continue;
    var attiva = !(row[iAtt] === false || String(row[iAtt]).toLowerCase() === 'false');
    var rec = {
      nome: row[iNome], tipo: row[iTipo], attiva: attiva,
      ultimaScan: row[iScan] ? String(row[iScan]) : '(mai)',
      ultimoEsito: row[iEsito] || '(nessuno)',
      nUltimo: row[iUlt] || 0, nTotali: row[iTot] || 0
    };
    out.push(rec);
    Logger.log((attiva ? '✓ ' : '✗ ') + rec.nome +
      ' | scan: ' + rec.ultimaScan + ' | esito: ' + rec.ultimoEsito +
      ' | ultimo: ' + rec.nUltimo + ' | tot: ' + rec.nTotali);
  }
  var attive = out.filter(function(x) { return x.attiva; }).length;
  Logger.log('--- AG' + agenteId + ': ' + out.length + ' fonti (' + attive + ' attive) ---');
  return out;
}

// NB: in produzione usare i trigger per-agente (setupAgentTriggers), NON questo.
// Qui c'e' un budget globale per non andare in hard-timeout nei test manuali:
// gli agenti non raggiunti partono al lancio successivo (grazie al cursore).
function scanAllAgenti() {
  var t0 = Date.now();
  var GLOBAL_MAX_MS = 270000; // ~4.5 min
  var results = [];
  var ids = [1, 2, 3, 4, 5];
  for (var k = 0; k < ids.length; k++) {
    if (Date.now() - t0 > GLOBAL_MAX_MS) { Logger.log('scanAllAgenti: budget globale raggiunto, ' + (ids.length - k) + ' agenti rimandati al prossimo lancio'); break; }
    results.push(scanAgente(ids[k]));
  }
  return results;
}

// ============================================================================
// SETUP TRIGGER
// ============================================================================

function setupAgentTriggers() {
  // Rimuovi trigger agenti esistenti
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction().indexOf('scanAgente') === 0) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });

  // v4.20 — Scacchiera per giorni: un agente al giorno (AG1 bandi 2x: lun+gio).
  // Riduce carico/costo Claude; col budget+cursore ogni firing e' sicuro.
  var WD = ScriptApp.WeekDay;
  function trig(fn, weekday, hour) {
    ScriptApp.newTrigger(fn).timeBased().onWeekDay(weekday).atHour(hour).create();
  }
  trig('scanAgente1', WD.MONDAY, 7);     // AG1 Bandi — lunedì
  trig('scanAgente2', WD.TUESDAY, 7);    // AG2 Normativa — martedì
  trig('scanAgente3', WD.WEDNESDAY, 7);  // AG3 Innovazione — mercoledì
  trig('scanAgente4', WD.THURSDAY, 7);   // AG4 Comunità — giovedì
  trig('scanAgente5', WD.FRIDAY, 7);     // AG5 Digital — venerdì

  Logger.log('Agent triggers SCACCHIERA SETTIMANALE installati (rimossi ' + removed + ' precedenti). AG1: lun · AG2: mar · AG3: mer · AG4: gio · AG5: ven — ore 07:00.');
  return { ok: true, removed: removed, schema: 'AG1 lun, AG2 mar, AG3 mer, AG4 gio, AG5 ven @07:00' };
}

// ============================================================================
// TEST
// ============================================================================

function testAgentScan(agenteId, maxFonti) {
  return scanAgente(agenteId || 1, { dryRun: true, maxFonti: maxFonti || 3, verbose: true });
}

// ============================================================================
// HELPER PRIVATE
// ============================================================================

// v4.20 — Archivio unico: con flag ON gli agenti leggono/scrivono FontiBandi_v5
// (colonna Agente), non piu' FontiAgenti. OFF = comportamento legacy (FontiAgenti).
function _agentiDaFontiBandiV5_() {
  try { return String(PropertiesService.getScriptProperties().getProperty('USE_AGENTI_DA_FONTIBANDIV5')) === 'true'; }
  catch(e) { return false; }
}
function attivaAgentiDaFontiBandi()  { PropertiesService.getScriptProperties().setProperty('USE_AGENTI_DA_FONTIBANDIV5', 'true');  Logger.log('Agenti -> FontiBandi_v5 (archivio unico) ON'); }
function spegniAgentiDaFontiBandi()  { PropertiesService.getScriptProperties().setProperty('USE_AGENTI_DA_FONTIBANDIV5', 'false'); Logger.log('Agenti -> FontiAgenti (legacy) OFF'); }

function _agentGetFontiSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  if (_agentiDaFontiBandiV5_()) {
    return ss.getSheetByName('FontiBandi_v5') || ss.getSheetByName(FONTI_AGENTI_SHEET) || null;
  }
  return ss.getSheetByName(FONTI_AGENTI_SHEET) || null;
}

function _agentGetFonti_(agenteId) {
  var sh = _agentGetFontiSheet_();
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iAg = headers.indexOf('Agente');
  var iAttiva = headers.indexOf('Attiva');
  var iNome = headers.indexOf('Nome');
  var iUrl = headers.indexOf('URL');
  var iRss = headers.indexOf('RSS_URL');
  var iTipo = headers.indexOf('Tipo');
  var iCat = headers.indexOf('Categoria');
  var iPr = headers.indexOf('Priorita');
  var iHash = headers.indexOf('UltimoHash');

  var fonti = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    // Match agente: supporta singolo ("1") e multi-agente ("1,3") in FontiBandi_v5
    var _ags = String(row[iAg] == null ? '' : row[iAg]).split(/[,;]/).map(function(s){ return Number(s.trim()); });
    if (_ags.indexOf(agenteId) < 0) continue;
    if (row[iAttiva] === false || String(row[iAttiva]).toLowerCase() === 'false') continue;
    fonti.push({
      row: r + 1,  // riga nel foglio (1-based, header incluso)
      nome: row[iNome] || '',
      url: String(row[iRss] || row[iUrl] || '').trim(),
      tipo: row[iTipo] || 'HTML',
      categoria: row[iCat] || '',
      priorita: Number(row[iPr]) || 2,
      ultimoHash: String(row[iHash] || '')
    });
  }
  // Priorita 1 prima
  fonti.sort(function(a, b) { return a.priorita - b.priorita; });
  return fonti;
}

function _agentGetOrCreateResultsSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AGENT_SCAN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(AGENT_SCAN_SHEET);
    sh.getRange(1, 1, 1, AGENT_SCAN_HEADERS.length).setValues([AGENT_SCAN_HEADERS]);
    sh.getRange(1, 1, 1, AGENT_SCAN_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _agentGetExistingTitles_(sheet, agenteId) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var iAg = data[0].indexOf('AgenteID');
  var iTit = data[0].indexOf('Titolo');
  var titles = [];
  for (var r = 1; r < data.length; r++) {
    if (Number(data[r][iAg]) === agenteId) {
      titles.push(String(data[r][iTit] || '').toLowerCase().substring(0, 60));
    }
  }
  return titles;
}

function _agentFetchUrl_(url) {
  try {
    // --- TED (Tenders Electronic Daily, appalti UE) richiede POST con body JSON ---
    // Convenzione: la fonte e' l'endpoint /v3/notices/search con la expert query
    // codificata nel parametro ?query=... (e opzionale &limit=N). Qui la traduciamo
    // in una vera richiesta POST. Vedi _tedBuildBody_ per il body.
    if (url.indexOf('api.ted.europa.eu') >= 0 && url.indexOf('/notices/search') >= 0) {
      return _tedFetch_(url);
    }
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)' },
      validateHttpsCertificates: false
    });
    if (resp.getResponseCode() !== 200) return null;
    return resp.getContentText();
  } catch(e) { return null; }
}

/** Estrae query+limit dall'URL-convenzione TED e costruisce il body POST. */
function _tedBuildBody_(url) {
  // Default valido (mai '*': TED lo rifiuta con 400). Famiglia CPV cultura/musei.
  var q = 'classification-cpv IN (92500000 92520000 92521000 92522000)';
  var mq = url.match(/[?&]query=([^&]+)/);
  if (mq) { try { q = decodeURIComponent(mq[1].replace(/\+/g, ' ')); } catch(e0) { q = mq[1]; } }
  var lim = 20;
  var ml = url.match(/[?&]limit=(\d+)/);
  if (ml) lim = Number(ml[1]);
  // Filtro freschezza: se la query non ha gia' un filtro data, aggiungi
  // "pubblicati negli ultimi 365 giorni". TED vuole il formato YYYYMMDD
  // (confermato dal test: i trattini danno 400). Calcolato a ogni fetch
  // => i risultati restano sempre aggiornati senza intervento manuale.
  if (q.indexOf('publication-date') < 0) {
    var dLim = new Date(); dLim.setDate(dLim.getDate() - 365);
    var ymd = '' + dLim.getFullYear() + ('0' + (dLim.getMonth() + 1)).slice(-2) + ('0' + dLim.getDate()).slice(-2);
    q = q + ' AND publication-date>=' + ymd;
  }
  return {
    query: q,
    fields: ['publication-number', 'notice-title', 'links', 'deadline-receipt-request',
             'buyer-name', 'classification-cpv', 'publication-date', 'place-of-performance'],
    page: 1,
    limit: lim,
    scope: 'ACTIVE',
    paginationMode: 'PAGE_NUMBER',
    checkQuerySyntax: false
  };
}

/** Esegue la POST verso TED. Ritorna il testo JSON o null. */
function _tedFetch_(url) {
  try {
    var endpoint = url.split('?')[0];
    var resp = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(_tedBuildBody_(url)),
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)' }
    });
    if (resp.getResponseCode() !== 200) return null;
    return resp.getContentText();
  } catch(e) { return null; }
}

/**
 * TEST one-click: verifica l'API TED con piu' varianti di body e logga gli esiti.
 * Da lanciare dall'editor (Esegui -> testTedApi), poi guardare il Log/Esecuzioni.
 * Serve a confermare i nomi esatti dei campi PRIMA di attivare la fonte.
 */
function testTedApi() {
  var endpoint = 'https://api.ted.europa.eu/v3/notices/search';
  // Data limite = 365 giorni fa, in due formati da provare.
  var d = new Date(); d.setDate(d.getDate() - 365);
  var yyyy = d.getFullYear(), mm = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
  var dataDash = yyyy + '-' + mm + '-' + dd;   // 2025-06-03
  var dataComp = yyyy + mm + dd;               // 20250603
  var qBase = 'classification-cpv IN (92500000 92520000 92521000 92522000) AND place-of-performance=ITA';
  var mkUrl = function(q) { return endpoint + '?query=' + encodeURIComponent(q) + '&limit=3'; };
  var varianti = [
    { nome: 'C_controllo_no_data',  body: _tedBuildBody_(mkUrl(qBase)) },
    { nome: 'D_data_trattini',      body: _tedBuildBody_(mkUrl(qBase + ' AND publication-date>=' + dataDash)) },
    { nome: 'E_data_compatta',      body: _tedBuildBody_(mkUrl(qBase + ' AND publication-date>=' + dataComp)) }
  ];
  var report = [];
  varianti.forEach(function(v) {
    try {
      var resp = UrlFetchApp.fetch(endpoint, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(v.body), muteHttpExceptions: true,
        headers: { 'Accept': 'application/json' }
      });
      var code = resp.getResponseCode();
      var txt = resp.getContentText() || '';
      Logger.log('=== TED ' + v.nome + ' -> HTTP ' + code + ' ===');
      Logger.log('BODY inviato: ' + JSON.stringify(v.body));
      Logger.log('RISPOSTA (primi 1800 char): ' + txt.substring(0, 1800));
      report.push({ variante: v.nome, http: code, lung: txt.length });
    } catch(e) {
      Logger.log('=== TED ' + v.nome + ' -> ERRORE: ' + e + ' ===');
      report.push({ variante: v.nome, errore: String(e) });
    }
  });
  Logger.log('RIEPILOGO testTedApi: ' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * TEST one-click EU Funding & Tenders (sistema SEDIA). Prova piu' modi di chiamare
 * il search-api per scoprire quale GAS riesce a inviare e cosa accetta il server.
 * Lanciare dall'editor (Esegui -> testEuFtApi) e leggere il Log/Esecuzioni.
 * Query: grant+tender (type 1,2) con stato Forthcoming/Open (31094501/31094502).
 */
function testEuFtApi() {
  var base = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=';
  var queryJson = '{"bool":{"must":[{"terms":{"type":["1","2"]}},{"terms":{"status":["31094501","31094502"]}}]}}';
  var report = [];

  function prova(nome, url, options) {
    try {
      var resp = UrlFetchApp.fetch(url, options);
      var code = resp.getResponseCode();
      var txt = resp.getContentText() || '';
      Logger.log('=== EUFT ' + nome + ' -> HTTP ' + code + ' ===');
      Logger.log('RISPOSTA (primi 1800 char): ' + txt.substring(0, 1800));
      report.push({ variante: nome, http: code, lung: txt.length });
    } catch(e) {
      Logger.log('=== EUFT ' + nome + ' -> ERRORE: ' + e + ' ===');
      report.push({ variante: nome, errore: String(e) });
    }
  }

  // A) GET semplice con parola chiave
  prova('A_GET_text', base + 'culture&pageSize=5',
    { method: 'get', muteHttpExceptions: true, headers: { 'Accept': 'application/json' } });

  // B) POST form-urlencoded (query come campo)
  prova('B_POST_form', base + '***',
    { method: 'post', muteHttpExceptions: true,
      payload: { query: queryJson, languages: 'en', pageNumber: '1', pageSize: '5' } });

  // C) POST multipart (query come blob -> forza multipart/form-data)
  prova('C_POST_multipart', base + '***',
    { method: 'post', muteHttpExceptions: true,
      payload: { query: Utilities.newBlob(queryJson, 'application/json', 'query'),
                 languages: 'en', pageNumber: '1', pageSize: '5' } });

  Logger.log('RIEPILOGO testEuFtApi: ' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * TEST 2 EU F&T: capire quale filtro RIDUCE davvero i risultati (solo call aperte
 * cultura). Confronta totalResults tra: form con/ senza query, e multipart con
 * content-type corretto. Vince la variante con totalResults piccolo e sensato.
 */
function testEuFtApi2() {
  var base = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=';
  var qOpen = '{"bool":{"must":[{"terms":{"type":["1","2"]}},{"terms":{"status":["31094501","31094502"]}}]}}';
  var report = [];

  function prova(nome, url, options) {
    try {
      var resp = UrlFetchApp.fetch(url, options);
      var code = resp.getResponseCode();
      var txt = resp.getContentText() || '';
      var tot = null;
      try { tot = JSON.parse(txt).totalResults; } catch(e0) { var m = txt.match(/"totalResults":(\d+)/); if (m) tot = Number(m[1]); }
      Logger.log('=== EUFT2 ' + nome + ' -> HTTP ' + code + ' | totalResults: ' + tot + ' ===');
      Logger.log('  (primi 400 char) ' + txt.substring(0, 400));
      report.push({ variante: nome, http: code, totalResults: tot });
    } catch(e) {
      Logger.log('=== EUFT2 ' + nome + ' -> ERRORE: ' + e + ' ===');
      report.push({ variante: nome, errore: String(e) });
    }
  }

  // 1) form, text=*** SENZA query (baseline: dovrebbe essere ~tutto)
  prova('1_form_all_noquery', base + '***',
    { method: 'post', muteHttpExceptions: true, payload: { languages: 'en', pageSize: '5' } });

  // 2) form, text=*** CON query open/forthcoming (filtra lo stato?)
  prova('2_form_query_open', base + '***',
    { method: 'post', muteHttpExceptions: true, payload: { query: qOpen, languages: 'en', pageSize: '5' } });

  // 3) form, text=culture (la sola keyword riduce?)
  prova('3_form_text_culture', base + 'culture',
    { method: 'post', muteHttpExceptions: true, payload: { languages: 'en', pageSize: '5' } });

  // 4) multipart con blob text/plain SENZA filename (content-type corretto?)
  prova('4_multipart_textplain', base + '***',
    { method: 'post', muteHttpExceptions: true,
      payload: { query: Utilities.newBlob(qOpen, 'text/plain'), languages: 'en', pageSize: '5' } });

  Logger.log('RIEPILOGO testEuFtApi2: ' + JSON.stringify(report, null, 2));
  return report;
}

/** Costruisce un body multipart/form-data a mano, con Content-Type per parte. */
function _euftMultipart_(fields, boundary) {
  var body = '';
  fields.forEach(function(f) {
    body += '--' + boundary + '\r\n';
    body += 'Content-Disposition: form-data; name="' + f.name + '"\r\n';
    if (f.contentType) body += 'Content-Type: ' + f.contentType + '\r\n';
    body += '\r\n' + f.value + '\r\n';
  });
  body += '--' + boundary + '--\r\n';
  return body;
}

/**
 * TEST 3 EU F&T: multipart COSTRUITO A MANO con Content-Type corretto sulla parte
 * 'query' (application/json), per far finalmente mordere il filtro stato "aperto".
 * Se totalResults crolla (vs 648450 / 15634), il filtro funziona e abbiamo vinto.
 */
function testEuFtApi3() {
  var base = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=';
  var qOpen = '{"bool":{"must":[{"terms":{"type":["1","2"]}},{"terms":{"status":["31094501","31094502"]}}]}}';
  var boundary = 'EUFTBOUNDARY1234567890';
  var report = [];

  function prova(nome, url, qText, qContentType) {
    try {
      var body = _euftMultipart_([
        { name: 'query', value: qOpen, contentType: qContentType },
        { name: 'languages', value: 'en' },
        { name: 'pageNumber', value: '1' },
        { name: 'pageSize', value: '5' }
      ], boundary);
      var resp = UrlFetchApp.fetch(url + qText, {
        method: 'post', muteHttpExceptions: true,
        contentType: 'multipart/form-data; boundary=' + boundary,
        payload: body
      });
      var code = resp.getResponseCode();
      var txt = resp.getContentText() || '';
      var tot = null;
      try { tot = JSON.parse(txt).totalResults; } catch(e0) { var m = txt.match(/"totalResults":(\d+)/); if (m) tot = Number(m[1]); }
      Logger.log('=== EUFT3 ' + nome + ' -> HTTP ' + code + ' | totalResults: ' + tot + ' ===');
      Logger.log('  (primi 500 char) ' + txt.substring(0, 500));
      report.push({ variante: nome, http: code, totalResults: tot });
    } catch(e) {
      Logger.log('=== EUFT3 ' + nome + ' -> ERRORE: ' + e + ' ===');
      report.push({ variante: nome, errore: String(e) });
    }
  }

  // A) text=*** + query aperti (application/json): se filtra, totalResults << 648450
  prova('A_manual_json_all', base, '***', 'application/json');
  // B) text=culture + query aperti: il target (call aperte cultura)
  prova('B_manual_json_culture', base, 'culture', 'application/json');
  // C) text=culture + query aperti, parte query come text/plain (fallback)
  prova('C_manual_textplain_culture', base, 'culture', 'text/plain');

  Logger.log('RIEPILOGO testEuFtApi3: ' + JSON.stringify(report, null, 2));
  return report;
}

function _agentCleanHtml_(html) {
  // Preserva link come [URL: href] prima di stripare tag (fix v4.12.3)
  var cleaned = html.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, function(m, href, text) {
    return text + ' [URL: ' + href + ']';
  });
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.substring(0, 12000);
}

function _agentMd5_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text);
  return raw.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function _agentExtractWithClaude_(text, fonte, agent) {
  // Controlla se Claude API è configurata
  var apiKey = '';
  try {
    apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY') || '';
  } catch(e) {}
  if (!apiKey) {
    Logger.log('  WARN: CLAUDE_API_KEY non configurata. Skip Claude extraction.');
    return [];
  }

  var prompt = agent.promptSpecializzato + '\n\n'
    + 'Fonte: ' + fonte.nome + ' (' + fonte.url + ')\n\n'
    + 'Testo da analizzare:\n' + text + '\n\n'
    + 'Rispondi SOLO con un JSON array. Per ogni contenuto rilevante trovato:\n'
    + '[{"titolo":"string max 120 char","sommario":"string max 300 char","url":"URL diretta se disponibile","data":"yyyy-mm-dd se disponibile","tags":["t1","t2"],"score":1-5,"tipo":"bando|norma|news|case_study|report|tool"}]\n'
    + 'Se non trovi contenuti pertinenti, rispondi: []';

  // Retry con backoff esponenziale (max 3 tentativi)
  var maxRetries = 3;
  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        payload: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2500,
          messages: [{ role: 'user', content: prompt }]
        }),
        muteHttpExceptions: true
      });

      var httpCode = resp.getResponseCode();
      if (httpCode === 429 || httpCode >= 500) {
        if (attempt < maxRetries) {
          Utilities.sleep(Math.pow(2, attempt) * 1000);  // 2s, 4s
          continue;
        }
        Logger.log('  Claude API HTTP ' + httpCode + ' dopo ' + maxRetries + ' tentativi');
        return [];
      }

      var body = JSON.parse(resp.getContentText());
      var content = body.content && body.content[0] && body.content[0].text || '[]';
      // Estrai JSON dal testo (gestisce markdown code blocks)
      var jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      return JSON.parse(jsonMatch[0]);
    } catch(e) {
      if (attempt < maxRetries) {
        Utilities.sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      Logger.log('  Claude API errore dopo ' + maxRetries + ' tentativi: ' + e.message);
      return [];
    }
  }
  return [];
}

function _agentDetectAmbito_(item, agent) {
  // Usa il primo ambito dell'agente come default
  return agent.ambiti[0] || 3;
}

function _agentUpdateFonteEsito_(sheet, row, esito, count) {
  if (!sheet || !row) return;
  try {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var iEsito = headers.indexOf('UltimoEsito');
    var iScan = headers.indexOf('UltimaScan');
    var iTotal = headers.indexOf('NRecordTotali');
    var iFail = headers.indexOf('FailConsecutivi');
    if (iEsito >= 0) sheet.getRange(row, iEsito + 1).setValue(esito);
    if (iScan >= 0) sheet.getRange(row, iScan + 1).setValue(new Date().toISOString());
    if (esito === 'OK' || esito === 'NO_MATCH') {
      if (iTotal >= 0) sheet.getRange(row, iTotal + 1).setValue(Number(sheet.getRange(row, iTotal + 1).getValue() || 0) + count);
      if (iFail >= 0) sheet.getRange(row, iFail + 1).setValue(0);
    } else {
      if (iFail >= 0) sheet.getRange(row, iFail + 1).setValue(Number(sheet.getRange(row, iFail + 1).getValue() || 0) + 1);
    }
  } catch(e) { /* non bloccante */ }
}

function _agentUpdateFonteHash_(sheet, row, hash) {
  if (!sheet || !row) return;
  try {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var iHash = headers.indexOf('UltimoHash');
    if (iHash >= 0) sheet.getRange(row, iHash + 1).setValue(hash);
  } catch(e) { /* non bloccante */ }
}
