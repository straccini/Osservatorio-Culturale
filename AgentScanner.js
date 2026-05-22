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

  fonti.forEach(function(fonte) {
    try {
      stats.scansionate++;

      // 1. Fetch contenuto
      var html = _agentFetchUrl_(fonte.url);
      if (!html || html.length < 200) {
        _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'EMPTY', 0);
        return;
      }

      // 2. Hash-first: confronta con hash precedente
      var hash = _agentMd5_(html.substring(0, 5000));
      if (hash === fonte.ultimoHash && !opts.forceRescan) {
        stats.skip_hash++;
        if (opts.verbose) Logger.log('  SKIP (hash invariato): ' + fonte.nome);
        return;
      }

      // 3. Pulisci HTML e estrai con Claude
      var cleanText = _agentCleanHtml_(html);
      if (cleanText.length < 100) {
        _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'EMPTY_CLEAN', 0);
        return;
      }

      var items = _agentExtractWithClaude_(cleanText, fonte, agent);
      if (!items || items.length === 0) {
        _agentUpdateFonteEsito_(fontiSheet, fonte.row, 'NO_MATCH', 0);
        _agentUpdateFonteHash_(fontiSheet, fonte.row, hash);
        return;
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
  });

  var elapsed = Date.now() - t0;
  Logger.log('=== ' + agent.codice + ' completato: ' + stats.nuovi + ' nuovi, ' + stats.skip_hash + ' skip hash, ' + stats.errori + ' errori (' + Math.round(elapsed / 1000) + 's) ===');
  return { ok: true, agenteId: agenteId, fontiScansionate: stats.scansionate, nuoviContenuti: stats.nuovi, skipHash: stats.skip_hash, errori: stats.errori, tempoMs: elapsed };
}

// ============================================================================
// ALIAS PER TRIGGER GAS (una funzione per agente)
// ============================================================================

function scanAgente1() { return scanAgente(1); }
function scanAgente2() { return scanAgente(2); }
function scanAgente3() { return scanAgente(3); }
function scanAgente4() { return scanAgente(4); }
function scanAgente5() { return scanAgente(5); }

function scanAllAgenti() {
  var results = [];
  [1, 2, 3, 4, 5].forEach(function(id) {
    results.push(scanAgente(id));
  });
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

  // AG1 Bandi: ogni 6h
  ScriptApp.newTrigger('scanAgente1').timeBased().everyHours(6).create();
  // AG2 Normativa: ogni 12h
  ScriptApp.newTrigger('scanAgente2').timeBased().everyHours(12).create();
  // AG3 Innovazione: ogni 12h
  ScriptApp.newTrigger('scanAgente3').timeBased().everyHours(12).create();
  // AG4 Comunita: ogni 24h (03:00)
  ScriptApp.newTrigger('scanAgente4').timeBased().atHour(3).nearMinute(0).everyDays(1).create();
  // AG5 Digital: ogni 12h
  ScriptApp.newTrigger('scanAgente5').timeBased().everyHours(12).create();

  Logger.log('Agent triggers installati (rimossi ' + removed + ' precedenti). AG1:6h, AG2:12h, AG3:12h, AG4:24h, AG5:12h');
  return { ok: true, removed: removed };
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

function _agentGetFontiSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
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
    if (Number(row[iAg]) !== agenteId) continue;
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
