// ============================================================================
//  BandiCRUD.js — CRUD bandi, fonti bandi, arricchimento, scanner singolo
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//  v4.27.35 — Estratto da Codice.js (refactoring modularizzazione)
//
//  Contiene:
//  - getSheetRadar, getBandiRadar, getBandi (lettura)
//  - saveBandoRadar, updateBandoRadar, deleteBandoRadar, toggleNascostoRadar (CRUD)
//  - arricchisciBandiRadar, arricchisciBandiV5, enrichBandiRadarBatch (AI enrichment)
//  - getFontiBandi, addFonteBandi, deleteFonteBandiById, toggleFonteBandiField (fonti)
//  - scanSingolaFonteBandi (scanner singolo)
//  - buildColMap, getUltimaScansione, addColonneRadar_v427, applyPriorityColor (utility)
//
//  Dipendenze: getMainSS(), SH, COL, SHEET_RADAR, AMBITO_LABEL,
//              formatDate(), _deleteRowById(), _toggleField()
// ============================================================================


function getUltimaScansione() {
  const sheet=getSheetRadar();
  if(!sheet||sheet.getLastRow()<2) return null;
  const dates=sheet.getRange(2,COL.DATA_RILEVAMENTO,sheet.getLastRow()-1,1).getValues();
  let maxDate=null;
  dates.forEach(row=>{
    const d=row[0];
    if(d instanceof Date&&!isNaN(d)&&(!maxDate||d>maxDate)) maxDate=d;
  });
  return maxDate?Utilities.formatDate(maxDate,'Europe/Rome','dd/MM/yyyy HH:mm'):null;
}

// ==================================================================
// RADAR BANDI
// ==================================================================

/**
 * Sprint 1.3 D2.5h (2026-05-01) — getSheetRadar consolidato (file principale).
 */
function getSheetRadar() {
  // v4.27.32: fonte unica Bandi_v5. RADAR BANDI e il foglio standalone sono morti.
  // Questa funzione resta come alias per i chiamanti legacy (getBandiRadar, Workflow, ecc.)
  return getMainSS().getSheetByName('Bandi_v5');
}

// v4.18.38 (audit 2026-05-14) — Rimosse 3 funzioni morte:
//   • getSheetRadarStandaloneLegacy()       — fallback Radar ID hardcoded, mai chiamato
//   • consolidaBandiInFilePrincipale()      — migrazione standalone→principale (Sprint 1.3 D2.5h), già applicata
//   • addNuoveColonneRadar()                — migrazione schema RADAR colonne 18-20, già applicata
// Recuperabili da git history se servono per audit.

// v4.27 — Schema expansion: colonne 21-22 (DESCRIZIONE, TIPO_APPALTO)

/**
 * Aggiunge le colonne 21 (Descrizione) e 22 (TipoAppalto) al foglio RADAR BANDI.
 * Idempotente: non sovrascrive se gli header esistono gia'.
 * Eseguire UNA VOLTA dall'editor GAS o dal pannello admin.
 */
function addColonneRadar_v427() {
  var sheet = getSheetRadar();
  if (!sheet) return { ok: false, error: 'Foglio RADAR BANDI non trovato' };
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var added = [];
  if (headers.indexOf('Descrizione') < 0) {
    sheet.getRange(1, COL.DESCRIZIONE).setValue('Descrizione');
    added.push('Descrizione (col ' + COL.DESCRIZIONE + ')');
  }
  if (headers.indexOf('TipoAppalto') < 0) {
    sheet.getRange(1, COL.TIPO_APPALTO).setValue('TipoAppalto');
    added.push('TipoAppalto (col ' + COL.TIPO_APPALTO + ')');
  }
  var msg = added.length ? 'Aggiunte: ' + added.join(', ') : 'Colonne gia presenti, nulla da fare';
  Logger.log('addColonneRadar_v427: ' + msg);
  return { ok: true, added: added, message: msg };
}

/**
 * v4.27 — Arricchisce i bandi RADAR che hanno Descrizione e/o TipoAppalto vuoti.
 * Usa Claude Haiku per estrarre descrizione e tipo appalto dal titolo + ente + note.
 * @param {Object} opts  { cap: max bandi da arricchire (default 20), dryRun: boolean }
 */
function arricchisciBandiRadar(opts) {
  opts = opts || {};
  var cap = opts.cap || 20;
  var dryRun = !!opts.dryRun;
  var sheet = getSheetRadar();
  if (!sheet) return { ok: false, error: 'Foglio RADAR BANDI non trovato' };

  var apiKey = _claudeKey_();
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY non configurata' };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { ok: true, arricchiti: 0, message: 'Nessun bando presente' };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = buildColMap(headers);
  var iDescr = colMap.DESCRIZIONE || COL.DESCRIZIONE;
  var iTipo = colMap.TIPO_APPALTO || COL.TIPO_APPALTO;
  var iTitolo = colMap.TITOLO || COL.TITOLO;
  var iEnte = colMap.ENTE || COL.ENTE;
  var iNote = colMap.NOTE || COL.NOTE;
  var iSettore = colMap.SETTORE || COL.SETTORE;
  var iLink = colMap.LINK || COL.LINK;

  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var candidati = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var descr = String(row[iDescr - 1] || '').trim();
    var tipo = String(row[iTipo - 1] || '').trim();
    if (descr && tipo) continue;  // gia arricchito
    var titolo = String(row[iTitolo - 1] || '').trim();
    if (!titolo) continue;
    candidati.push({
      rowIdx: r + 2,  // 1-indexed, header escluso
      titolo: titolo,
      ente: String(row[iEnte - 1] || ''),
      note: String(row[iNote - 1] || ''),
      settore: String(row[iSettore - 1] || ''),
      link: String(row[iLink - 1] || ''),
      hasDescr: !!descr,
      hasTipo: !!tipo
    });
  }

  if (!candidati.length) return { ok: true, arricchiti: 0, message: 'Tutti i bandi sono gia arricchiti' };

  var batch = candidati.slice(0, cap);
  if (dryRun) {
    return { ok: true, dryRun: true, candidati: candidati.length, batch: batch.length,
             anteprima: batch.map(function(c) { return { riga: c.rowIdx, titolo: c.titolo.substring(0, 60) }; }) };
  }

  // Rate-limit check
  if (typeof _checkClaudeRateLimit_ === 'function' && !_checkClaudeRateLimit_()) {
    return { ok: false, error: 'Limite giornaliero chiamate Claude raggiunto' };
  }

  var arricchiti = 0, errori = 0;
  for (var i = 0; i < batch.length; i++) {
    var c = batch[i];
    try {
      var prompt = 'Sei un esperto di appalti pubblici e bandi culturali italiani ed europei.\n'
        + 'Dato questo bando:\n'
        + '- Titolo: ' + c.titolo + '\n'
        + '- Ente: ' + c.ente + '\n'
        + '- Settore: ' + c.settore + '\n'
        + (c.note ? '- Note: ' + c.note.substring(0, 500) + '\n' : '')
        + (c.link ? '- Link: ' + c.link + '\n' : '')
        + '\nRispondi SOLO con un JSON valido (nessun altro testo):\n'
        + '{"descrizione":"<descrizione chiara del bando in 1-3 frasi, max 300 caratteri, in italiano>","tipo_appalto":"<uno tra: servizi|forniture|lavori|misto|finanziamento>"}\n'
        + 'Se non riesci a determinare il tipo, usa "finanziamento" come default.';

      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post', muteHttpExceptions: true,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        payload: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400,
          messages: [{ role: 'user', content: prompt }] })
      });

      var code = resp.getResponseCode();
      if (code === 429 || code >= 500) { errori++; Utilities.sleep(3000); continue; }
      if (code !== 200) { errori++; continue; }

      var body = JSON.parse(resp.getContentText());
      var txt = (body.content && body.content[0] && body.content[0].text) || '';
      // Estrai JSON dal testo (potrebbe avere backtick markdown)
      var jsonMatch = txt.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { errori++; continue; }
      var parsed = JSON.parse(jsonMatch[0]);

      if (!c.hasDescr && parsed.descrizione) {
        sheet.getRange(c.rowIdx, iDescr).setValue(String(parsed.descrizione).substring(0, 500));
      }
      if (!c.hasTipo && parsed.tipo_appalto) {
        var tipoNorm = String(parsed.tipo_appalto).toLowerCase().trim();
        var tipiValidi = ['servizi', 'forniture', 'lavori', 'misto', 'finanziamento'];
        if (tipiValidi.indexOf(tipoNorm) < 0) tipoNorm = 'finanziamento';
        sheet.getRange(c.rowIdx, iTipo).setValue(tipoNorm);
      }
      arricchiti++;
      // Pausa tra le chiamate per rispettare rate limit
      if (i < batch.length - 1) Utilities.sleep(500);
    } catch (e) {
      Logger.log('arricchisciBandiRadar errore riga ' + c.rowIdx + ': ' + (e && e.message || e));
      errori++;
    }
  }

  return { ok: true, arricchiti: arricchiti, errori: errori, totCandidati: candidati.length,
           message: arricchiti + ' bandi arricchiti' + (errori ? ', ' + errori + ' errori' : '') };
}

/**
 * v4.27.24 — Arricchimento su Bandi_v5 (il foglio SERVITO). La versione RADAR
 * (arricchisciBandiRadar) scriveva sul foglio legacy non più esposto: qui la
 * stessa logica opera su Bandi_v5 (COL_B), riempiendo Sommario e TipoBando dei
 * bandi che ne sono privi ma che HANNO una scadenza (i senza-scadenza-senza-info
 * vengono archiviati dall'agente qualità, non arricchiti).
 */
function arricchisciBandiV5(opts) {
  opts = opts || {};
  var cap = opts.cap || 20;
  var dryRun = !!opts.dryRun;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shName = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
  var sheet = ss.getSheetByName(shName);
  if (!sheet) return { ok: false, error: 'Foglio Bandi_v5 non trovato' };
  var apiKey = _claudeKey_();
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY non configurata' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, arricchiti: 0, message: 'Nessun bando' };

  var iTit = COL_B.TITOLO, iEnte = COL_B.ENTE, iSet = COL_B.SETTORE, iSom = COL_B.SOMMARIO,
      iTipo = COL_B.TIPO_BANDO, iUrl = COL_B.URL_BANDO, iScad = COL_B.SCADENZA, iStat = COL_B.STATO_RECORD;
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var candidati = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    if (!row[0]) continue;
    if (String(row[iStat - 1] || '').toLowerCase() === 'archiviato') continue;
    var descr = String(row[iSom - 1] || '').trim();
    var tipo = String(row[iTipo - 1] || '').trim();
    if (descr && tipo) continue;                          // già completo
    // solo bandi con scadenza (gli altri li gestisce l'agente qualità)
    var rawScad = row[iScad - 1];
    var scad = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
    if (!scad || isNaN(scad.getTime())) continue;
    var titolo = String(row[iTit - 1] || '').trim();
    if (!titolo || /^(?:ted\s+notice\s+)?\d{3,}[-\/]?\d*$/i.test(titolo)) continue; // titolo non informativo
    candidati.push({ rowIdx: r + 2, titolo: titolo, ente: String(row[iEnte - 1] || ''),
      settore: String(row[iSet - 1] || ''), link: String(row[iUrl - 1] || ''),
      hasDescr: !!descr, hasTipo: !!tipo });
  }
  if (!candidati.length) return { ok: true, arricchiti: 0, message: 'Tutti i bandi (con scadenza) sono già completi' };
  var batch = candidati.slice(0, cap);
  if (dryRun) return { ok: true, dryRun: true, candidati: candidati.length, batch: batch.length,
    anteprima: batch.map(function(c){ return { riga: c.rowIdx, titolo: c.titolo.substring(0, 60) }; }) };
  if (typeof _checkClaudeRateLimit_ === 'function' && !_checkClaudeRateLimit_()) return { ok: false, error: 'Limite giornaliero Claude raggiunto' };

  var arricchiti = 0, errori = 0;
  for (var i = 0; i < batch.length; i++) {
    var c = batch[i];
    try {
      var prompt = 'Sei un esperto di appalti pubblici e bandi culturali italiani ed europei.\n'
        + 'Dato questo bando:\n- Titolo: ' + c.titolo + '\n- Ente: ' + c.ente + '\n- Settore: ' + c.settore + '\n'
        + (c.link ? '- Link: ' + c.link + '\n' : '')
        + '\nRispondi SOLO con un JSON valido:\n'
        + '{"descrizione":"<1-3 frasi chiare, max 300 caratteri, italiano>","tipo_appalto":"<servizi|forniture|lavori|misto|finanziamento>"}';
      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post', muteHttpExceptions: true,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        payload: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
      });
      var code = resp.getResponseCode();
      if (code === 429 || code >= 500) { errori++; Utilities.sleep(3000); continue; }
      if (code !== 200) { errori++; continue; }
      var body = JSON.parse(resp.getContentText());
      var txt = (body.content && body.content[0] && body.content[0].text) || '';
      var jm = txt.match(/\{[\s\S]*\}/); if (!jm) { errori++; continue; }
      var parsed = JSON.parse(jm[0]);
      if (!c.hasDescr && parsed.descrizione) sheet.getRange(c.rowIdx, iSom).setValue(String(parsed.descrizione).substring(0, 500));
      if (!c.hasTipo && parsed.tipo_appalto) {
        var tn = String(parsed.tipo_appalto).toLowerCase().trim();
        if (['servizi','forniture','lavori','misto','finanziamento'].indexOf(tn) < 0) tn = 'finanziamento';
        sheet.getRange(c.rowIdx, iTipo).setValue(tn);
      }
      arricchiti++;
      if (i < batch.length - 1) Utilities.sleep(500);
    } catch (e) { Logger.log('arricchisciBandiV5 riga ' + c.rowIdx + ': ' + (e && e.message || e)); errori++; }
  }
  return { ok: true, arricchiti: arricchiti, errori: errori, totCandidati: candidati.length };
}

/**
 * v4.27 — Wrapper per il dispatcher cron: arricchisce 50 bandi/run su Bandi_v5.
 * (v4.27.24: repuntato da RADAR legacy al foglio servito Bandi_v5.)
 */
function enrichBandiRadarBatch() {
  var result = arricchisciBandiV5({ cap: 50 });
  Logger.log('enrichBandiRadarBatch (Bandi_v5): ' + JSON.stringify(result));
  return result;
}

// ============================================================================
// DEEP ENRICHMENT — v4.27.58
// ============================================================================
// A differenza di arricchisciBandiV5 (che passa solo il titolo a Claude),
// questo modulo VISITA il link del bando, estrae il testo dalla pagina HTML,
// e lo invia a Claude per estrarre: scadenza, descrizione, importo, tipo.
// Priorità: prima bandi SENZA SCADENZA (i più critici), poi senza descrizione.
// Schedulato come trigger notturno (01:00 + 04:00, 15 bandi/run).
// ============================================================================

/**
 * Estrae testo utile da HTML grezzo, rimuovendo script/style/nav/footer.
 * Ritorna max 3000 caratteri di testo pulito.
 * @param {string} html
 * @return {string}
 */
function _enrichExtractText_(html) {
  if (!html) return '';
  var s = String(html);
  // Rimuovi blocchi non-contenuto
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  s = s.replace(/<header[\s\S]*?<\/header>/gi, ' ');
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Rimuovi tutti i tag HTML
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode entità comuni
  s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#\d+;/g, ' ');
  // Collassa whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Tronca a 3000 char (sufficiente per Claude, dentro budget token)
  return s.substring(0, 3000);
}

/**
 * Fetch di una pagina web con gestione errori e User-Agent realistico.
 * Per TED, usa l'API notices se disponibile.
 * @param {string} url
 * @return {string|null} — HTML/testo della pagina, o null se errore
 */
function _enrichFetchPage_(url) {
  if (!url) return null;
  try {
    // TED: usa API notice detail se il link è un notice ID
    var tedMatch = url.match(/ted\.europa\.eu.*?(\d{5,})/);
    if (tedMatch) {
      var tedUrl = 'https://api.ted.europa.eu/v3/notices/' + tedMatch[1];
      var tedResp = UrlFetchApp.fetch(tedUrl, {
        muteHttpExceptions: true, deadline: 15,
        headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0 (cultural observatory)' }
      });
      if (tedResp && tedResp.getResponseCode() === 200) return tedResp.getContentText();
    }

    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      deadline: 15,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json,*/*',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
      }
    });
    if (!resp) return null;
    var code = resp.getResponseCode();
    if (code >= 400) {
      Logger.log('[enrichDeep] HTTP ' + code + ' per ' + url);
      return null;
    }
    return resp.getContentText();
  } catch (e) {
    Logger.log('[enrichDeep] fetch errore per ' + url + ': ' + e.message);
    return null;
  }
}

/**
 * Deep enrichment: visita il link di ogni bando incompleto, estrae il
 * contenuto della pagina, e usa Claude per estrarre scadenza, descrizione,
 * importo e tipo appalto. Aggiorna SOLO i campi vuoti (mai sovrascrittura).
 *
 * Priorità selezione:
 *   1. Bandi SENZA SCADENZA (i più critici per l'esposizione)
 *   2. Bandi SENZA DESCRIZIONE (ma con scadenza)
 *
 * @param {Object} [opts] {cap:15, dryRun:false}
 * @return {Object} report
 */
function enrichBandiDeep(opts) {
  opts = opts || {};
  var cap = opts.cap || 15;
  var dryRun = !!opts.dryRun;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shName = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
  var sheet = ss.getSheetByName(shName);
  if (!sheet) return { ok: false, error: 'Foglio Bandi_v5 non trovato' };
  var apiKey = _claudeKey_();
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY non configurata' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, arricchiti: 0, message: 'Nessun bando' };

  // Leggi tutti i dati in un colpo solo
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // Separa candidati: priorità 1 (senza scadenza), priorità 2 (senza descrizione)
  var senzaScadenza = [];
  var senzaDescrizione = [];

  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    if (!row[0]) continue;
    var stato = String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase();
    if (stato === 'archiviato') continue;
    var url = String(row[COL_B.URL_BANDO - 1] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    var titolo = String(row[COL_B.TITOLO - 1] || '').trim();
    // Decodifica entità HTML prima del filtro
    titolo = titolo.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
                   .replace(/&quot;/gi, '"').replace(/&#\d+;/g, '').replace(/&[a-z]+;/gi, ' ').trim();
    if (!titolo || /^(?:ted\s+notice\s+)?\d{3,}[-\/]?\d*$/i.test(titolo)) continue;
    if (titolo.length < 12) continue; // titoli troppo corti = voci di menu/navigazione
    // Riusa il filtro anti-spazzatura di BandiGate
    if (typeof _bandiNonBando_ === 'function' && _bandiNonBando_({ titolo: titolo })) continue;
    // Filtro aggiuntivo deep: homepage GAL, pagine WordPress UI, sezioni generiche
    if (/\bGAL$/i.test(titolo) && titolo.split(/\s+/).length <= 4) continue; // "Torre Natisone GAL", "Carso GAL"
    if (/^\w+\s+patrimonio$/i.test(titolo)) continue; // "Jesolo Patrimonio"
    if (/^SRG\d/i.test(titolo)) continue; // codici strategia LEADER
    if (/^\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4}\s/i.test(titolo)) continue; // titoli che iniziano con una data = eventi/news, non bandi

    var rawScad = row[COL_B.SCADENZA - 1];
    var hasScad = false;
    if (rawScad instanceof Date && !isNaN(rawScad.getTime())) hasScad = true;
    else if (rawScad && String(rawScad).trim()) hasScad = true;

    var descr = String(row[COL_B.SOMMARIO - 1] || '').trim();
    var hasDescr = descr.length >= 20;

    if (hasScad && hasDescr) continue; // già completo

    var entry = { rowIdx: r + 2, titolo: titolo,
      ente: String(row[COL_B.ENTE - 1] || ''), url: url, hasScad: hasScad, hasDescr: hasDescr,
      hasImporto: !!String(row[COL_B.IMPORTO - 1] || '').trim(),
      hasTipo: !!String(row[COL_B.TIPO_BANDO - 1] || '').trim() };

    if (!hasScad) senzaScadenza.push(entry);
    else senzaDescrizione.push(entry);
  }

  // Unisci: prima senza scadenza, poi senza descrizione
  var candidati = senzaScadenza.concat(senzaDescrizione);
  var batch = candidati.slice(0, cap);

  var report = {
    ok: true, arricchiti: 0, errori: 0, fetchFalliti: 0,
    scadenzeTrovate: 0, descrizioniTrovate: 0, importiTrovati: 0,
    totCandidati: candidati.length, senzaScadenza: senzaScadenza.length,
    senzaDescrizione: senzaDescrizione.length
  };

  if (!batch.length) {
    report.message = 'Nessun bando incompleto con URL valida';
    return report;
  }

  if (dryRun) {
    report.dryRun = true;
    report.batch = batch.length;
    report.anteprima = batch.map(function(c) {
      return { riga: c.rowIdx, titolo: c.titolo.substring(0, 60), url: c.url.substring(0, 80),
               mancaScadenza: !c.hasScad, mancaDescrizione: !c.hasDescr };
    });
    return report;
  }

  // Rate limit check
  if (typeof _checkClaudeRateLimit_ === 'function' && !_checkClaudeRateLimit_()) {
    return { ok: false, error: 'Limite giornaliero Claude raggiunto' };
  }

  var t0 = Date.now();
  for (var i = 0; i < batch.length; i++) {
    // Budget tempo: max 5 minuti totali (GAS limit 6 min)
    if (Date.now() - t0 > 300000) {
      Logger.log('[enrichDeep] Budget tempo esaurito dopo ' + i + '/' + batch.length);
      break;
    }
    var c = batch[i];
    try {
      // 1. Fetch della pagina
      var html = _enrichFetchPage_(c.url);
      if (!html) { report.fetchFalliti++; continue; }

      // 2. Estrai testo dalla pagina
      var pageText = _enrichExtractText_(html);
      if (pageText.length < 30) { report.fetchFalliti++; continue; }

      // 3. Prompt Claude con il contenuto reale della pagina
      var campiRichiesti = [];
      if (!c.hasScad) campiRichiesti.push('"scadenza":"YYYY-MM-DD o null se non trovata"');
      if (!c.hasDescr) campiRichiesti.push('"descrizione":"1-3 frasi chiare in italiano, max 300 caratteri"');
      if (!c.hasImporto) campiRichiesti.push('"importo":"cifra in euro o null"');
      if (!c.hasTipo) campiRichiesti.push('"tipo_appalto":"servizi|forniture|lavori|misto|finanziamento"');

      var prompt = 'Sei un esperto di appalti pubblici e bandi culturali.\n'
        + 'Bando: "' + c.titolo + '" — Ente: ' + c.ente + '\n'
        + 'Contenuto della pagina web del bando:\n---\n' + pageText + '\n---\n'
        + 'Estrai dal testo SOLO le informazioni REALI (non inventare).\n'
        + 'Rispondi SOLO con un JSON valido: {' + campiRichiesti.join(',') + '}';

      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post', muteHttpExceptions: true,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        payload: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500,
          messages: [{ role: 'user', content: prompt }] })
      });

      var code = resp.getResponseCode();
      if (code === 429 || code >= 500) { report.errori++; Utilities.sleep(5000); continue; }
      if (code !== 200) { report.errori++; continue; }

      var body = JSON.parse(resp.getContentText());
      var txt = (body.content && body.content[0] && body.content[0].text) || '';
      var jm = txt.match(/\{[\s\S]*\}/);
      if (!jm) { report.errori++; continue; }
      var parsed = JSON.parse(jm[0]);

      // 4. Aggiorna solo campi vuoti
      var aggiornato = false;

      if (!c.hasScad && parsed.scadenza && String(parsed.scadenza) !== 'null') {
        var dScad = new Date(parsed.scadenza);
        if (!isNaN(dScad.getTime())) {
          sheet.getRange(c.rowIdx, COL_B.SCADENZA).setValue(dScad);
          report.scadenzeTrovate++;
          aggiornato = true;
          // Se scaduto, l'agente qualità lo archivierà nel prossimo run
          if (dScad < new Date()) report.scadutePassate = (report.scadutePassate || 0) + 1;
        }
      }

      if (!c.hasDescr && parsed.descrizione && String(parsed.descrizione).trim().length >= 10) {
        sheet.getRange(c.rowIdx, COL_B.SOMMARIO).setValue(String(parsed.descrizione).substring(0, 500));
        report.descrizioniTrovate++;
        aggiornato = true;
      }

      if (!c.hasImporto && parsed.importo && String(parsed.importo) !== 'null') {
        var imp = String(parsed.importo).replace(/[^\d.,]/g, '').trim();
        if (imp) {
          sheet.getRange(c.rowIdx, COL_B.IMPORTO).setValue(imp);
          report.importiTrovati++;
          aggiornato = true;
        }
      }

      if (!c.hasTipo && parsed.tipo_appalto) {
        var tn = String(parsed.tipo_appalto).toLowerCase().trim();
        if (['servizi','forniture','lavori','misto','finanziamento'].indexOf(tn) >= 0) {
          sheet.getRange(c.rowIdx, COL_B.TIPO_BANDO).setValue(tn);
          aggiornato = true;
        }
      }

      if (aggiornato) report.arricchiti++;
      if (i < batch.length - 1) Utilities.sleep(1000);

    } catch (e) {
      Logger.log('[enrichDeep] riga ' + c.rowIdx + ' errore: ' + (e && e.message || e));
      report.errori++;
    }
  }

  Logger.log('[enrichDeep] completato: ' + JSON.stringify(report));
  return report;
}

/**
 * v4.27.58 — Wrapper per CronDispatcher: deep enrichment notturno (15/run).
 */
function enrichBandiDeepBatch() {
  var result = enrichBandiDeep({ cap: 15 });
  Logger.log('enrichBandiDeepBatch: ' + JSON.stringify(result));
  return result;
}


/**
 * v4.27.58 — PULIZIA DI MASSA: archivia i record "non-bando" che sono entrati
 * nel foglio Bandi_v5 come artefatti di scraping (allegati PDF, pagine GAL,
 * voci di navigazione WordPress, documenti amministrativi, schede tecniche).
 *
 * Criteri di archiviazione (conservativi — in dubbio lascia):
 * - Titolo riconosciuto come junk da _bandiNonBando_ (BandiGate.js)
 * - URL che punta a wp-content/uploads (allegato, non pagina bando)
 * - Titolo = codice allegato (es. "BANDO 16.4.1.4.1_ALLEGATO_...")
 * - Titolo = riferimento documento (es. "003 All.2) SCHEDA TECNICA")
 * - Titolo troppo corto (<12 char) o troppo generico
 * - Titolo inizia con data evento (es. "20 maggio 2026...")
 *
 * @param {Object} [opts] {dryRun:true}
 * @return {Object} {ok, archiviati, totScansionati, dettagli[]}
 */
function puliziaRecordNonBando(opts) {
  opts = opts || {};
  var dryRun = (opts.dryRun !== false); // default dry-run per sicurezza
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Bandi_v5');
  if (!sheet) return { ok: false, error: 'Foglio Bandi_v5 non trovato' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, archiviati: 0 };

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // Regex per artefatti di scraping GAL/WordPress
  var _ALLEGATO_RE = /^(bando\s+[\d.]+[_-]allegat|allegat[oi]\s+\d|all\.\d|\d{3}\s+all\.\d|bozza\s+accord|dichiarazione\s+(iva|sostitutiva)|scheda\s+tecnica\s+bando|modulistic|fac[\s-]*simile)/i;
  var _PAGINA_GAL_RE = /^(la\s+strategia\s+di\s+sviluppo|verso\s+la\s+nuova\s+ssl|presentata\s+a\s+|amm\.?\s+trasparente|bilancio\s+\d{4}|il\s+(gal|territorio)|storia\s+del\s+gal|i\s+nostri\s+(progetti|partner)|organigramma|staff\b|sede\b|statuto\b|regolamento\b|SRG\d|aree\s+di\s+intervent|eventi\s+e\s+appuntament|i\s+progetti\s+finanziat|comunicati\s+stampa|cooperazione\s+leader|smart\s+village|supporto\s+preparatori|regia\s+dirett|progetti\s+a\s+convenzion|graduatori[ea]\b|leader\s+\d{4})/i;
  var _DATA_EVENTO_RE = /^\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4}\s/i;
  var _WP_UI_RE = /^(copia\s+shortlink|visualizza\s+articolo|condividi\s|stampa\s+questo|lascia\s+un\s+commento|commenti\s+chiusi|articoli\s+recenti|archivi|categorie\s*$|tag\s*$|cerca\s*$|menu\s*$|home\s*$)/i;

  var candidati = [];
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    if (!row[0]) continue;
    var stato = String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase();
    if (stato === 'archiviato') continue; // già archiviato

    var rawTitolo = String(row[COL_B.TITOLO - 1] || '').trim();
    // Decodifica entità HTML
    var titolo = rawTitolo.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
                          .replace(/&quot;/gi, '"').replace(/&#\d+;/g, '').replace(/&[a-z]+;/gi, ' ').trim();
    var url = String(row[COL_B.URL_BANDO - 1] || '').trim();
    var motivo = '';

    // 1. Titolo vuoto o troppo corto
    if (!titolo || titolo.length < 10) { motivo = 'titolo-corto'; }
    // 2. Filtro BandiGate standard
    else if (typeof _bandiNonBando_ === 'function' && _bandiNonBando_({ titolo: titolo })) { motivo = 'junk-bandigate'; }
    // 3. Allegati e modulistica
    else if (_ALLEGATO_RE.test(titolo)) { motivo = 'allegato-modulistica'; }
    // 4. Pagine GAL generiche
    else if (_PAGINA_GAL_RE.test(titolo)) { motivo = 'pagina-gal'; }
    // 5. Titoli che iniziano con una data (eventi/news)
    else if (_DATA_EVENTO_RE.test(titolo)) { motivo = 'data-evento'; }
    // 6. Artefatti WordPress UI
    else if (_WP_UI_RE.test(titolo)) { motivo = 'wordpress-ui'; }
    // 7. URL che punta a wp-content/uploads (allegato)
    else if (/wp-content\/uploads/i.test(url)) { motivo = 'url-allegato-wp'; }
    // 8. URL da siti GAL con path organizzativo (chi-siamo, leader, oldsite, info)
    else if (/\bgal[a-z]*\.(it|eu|net|com|org)\b/i.test(url) && /\/(chi-siamo|oldsite|info-e-materiali|la-comunicazione|la-parola-ai|progetti\/?$|leader-\d{4})/i.test(url)) { motivo = 'gal-pagina-org'; }
    // 9. Titoli con codici misura/azione GAL (A.2.4.a, B.1.1.a, 19.3.2, FEP)
    else if (/^[A-Z]\.\d+\.\d+\.[a-z]/i.test(titolo) || /^(?:19\.\d|FEP\s)/i.test(titolo)) { motivo = 'codice-misura-gal'; }
    // 10. Titoli sezione GAL non coperti sopra
    else if (/^(materiali\s+utili|i\s+progetti\s+realizz|animazione\s+e\s+comunic|la\s+parola\s+ai\s+beneficiari|programma\s+leader)/i.test(titolo)) { motivo = 'sezione-gal'; }
    // 11. Titolo = solo nome ente/luogo senza verbo/azione (troppo generico, <3 parole)
    else if (titolo.split(/\s+/).length <= 2 && !/bando|avviso|concorso|gara|finanziament/i.test(titolo)) { motivo = 'titolo-generico-2parole'; }

    if (motivo) {
      candidati.push({ rowIdx: r + 2, titolo: titolo.substring(0, 60), motivo: motivo });
    }
  }

  var report = { ok: true, archiviati: 0, totScansionati: data.length, totCandidati: candidati.length };

  if (dryRun) {
    report.dryRun = true;
    // Conta per motivo
    var perMotivo = {};
    candidati.forEach(function(c) { perMotivo[c.motivo] = (perMotivo[c.motivo] || 0) + 1; });
    report.perMotivo = perMotivo;
    report.anteprima = candidati.slice(0, 30).map(function(c) {
      return { riga: c.rowIdx, titolo: c.titolo, motivo: c.motivo };
    });
    return report;
  }

  // Applica: marca come "archiviato"
  for (var i = 0; i < candidati.length; i++) {
    try {
      sheet.getRange(candidati[i].rowIdx, COL_B.STATO_RECORD).setValue('archiviato');
      report.archiviati++;
    } catch (e) {
      Logger.log('[pulizia] errore riga ' + candidati[i].rowIdx + ': ' + e.message);
    }
  }

  Logger.log('[pulizia] completata: ' + report.archiviati + ' archiviati su ' + candidati.length + ' candidati');
  return report;
}


/**
 * v4.27.58 — Archivia bandi SENZA SCADENZA rilevati da più di N giorni.
 * Un bando senza scadenza rilevato mesi fa è quasi certamente scaduto o
 * non più attivo. Libera il foglio dalla zavorra storica.
 *
 * @param {Object} [opts] {dryRun:true, giorniSoglia:90}
 * @return {Object} report
 */
function archiviaVecchiSenzaScadenza(opts) {
  opts = opts || {};
  var dryRun = (opts.dryRun !== false);
  var soglia = opts.giorniSoglia || 90;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Bandi_v5');
  if (!sheet) return { ok: false, error: 'Foglio Bandi_v5 non trovato' };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, archiviati: 0 };

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - soglia);
  var candidati = [];

  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    if (!row[0]) continue;
    var stato = String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase();
    if (stato === 'archiviato') continue;

    // Ha scadenza? → skip
    var rawScad = row[COL_B.SCADENZA - 1];
    if (rawScad instanceof Date && !isNaN(rawScad.getTime())) continue;
    if (rawScad && String(rawScad).trim()) continue;

    // Data rilevamento più vecchia della soglia?
    var dataRil = row[COL_B.DATA_RILEVAMENTO - 1];
    if (!(dataRil instanceof Date) || isNaN(dataRil.getTime())) continue;
    if (dataRil > cutoff) continue; // troppo recente

    var titolo = String(row[COL_B.TITOLO - 1] || '').trim();
    candidati.push({
      rowIdx: r + 2,
      titolo: titolo.substring(0, 60),
      dataRil: Utilities.formatDate(dataRil, 'Europe/Rome', 'yyyy-MM-dd'),
      giorniDalRilevamento: Math.round((new Date() - dataRil) / 86400000)
    });
  }

  var report = { ok: true, archiviati: 0, totCandidati: candidati.length, soglia: soglia + ' giorni' };

  if (dryRun) {
    report.dryRun = true;
    report.anteprima = candidati.slice(0, 20);
    return report;
  }

  for (var i = 0; i < candidati.length; i++) {
    try {
      sheet.getRange(candidati[i].rowIdx, COL_B.STATO_RECORD).setValue('archiviato');
      report.archiviati++;
    } catch (e) {
      Logger.log('[archiviaVecchi] errore riga ' + candidati[i].rowIdx + ': ' + e.message);
    }
  }

  Logger.log('[archiviaVecchi] ' + report.archiviati + ' bandi senza scadenza (>' + soglia + 'gg) archiviati');
  return report;
}

// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
function buildColMap(headers) {
  const map={};
  Object.entries(COL_NAMES).forEach(([key,aliases])=>{
    const idx=headers.findIndex(h=>aliases.some(a=>String(h).trim().toLowerCase()===a.toLowerCase()));
    map[key]=idx>=0?idx+1:COL[key];
  });
  return map;
}

function getBandiRadar() {
  const sheet=getSheetRadar();
  if(!sheet) return [];
  const lastRow=sheet.getLastRow();
  if(lastRow<2) return [];
  const lastCol=sheet.getLastColumn();
  const headers=sheet.getRange(1,1,1,lastCol).getValues()[0];
  const C=buildColMap(headers);
  const numCols=Math.max(lastCol,20);  // v3.1: include col 20 LettoBando
  const data=sheet.getRange(2,1,lastRow-1,numCols).getValues();
  const bandi=[];
  data.forEach((row,idx)=>{
    if(!row[(C.TITOLO||2)-1]) return;
    const scadenza=row[(C.SCADENZA||COL.SCADENZA)-1];
    let scadenzaStr=null;
    if(scadenza instanceof Date&&!isNaN(scadenza)){
      scadenzaStr=Utilities.formatDate(scadenza,'Europe/Rome','yyyy-MM-dd');
    } else if(typeof scadenza==='string'&&scadenza.match(/\d{2}\/\d{2}\/\d{4}/)){
      const p=scadenza.split('/'); scadenzaStr=`${p[2]}-${p[1]}-${p[0]}`;
    } else if(typeof scadenza==='string'&&scadenza.match(/\d{4}-\d{2}-\d{2}/)){
      scadenzaStr=scadenza;
    }
    const dataRil=row[(C.DATA_RILEVAMENTO||COL.DATA_RILEVAMENTO)-1];
    let dataStr=null;
    if(dataRil instanceof Date&&!isNaN(dataRil)) dataStr=Utilities.formatDate(dataRil,'Europe/Rome','yyyy-MM-dd');
    else if(typeof dataRil==='string') dataStr=dataRil;
    const g=k=>{ var ci=C[k]||COL[k]; return ci ? row[ci-1] : ''; };
    // v4.22 — Filtro: escludi bandi scaduti E senza scadenza (solo scadenze future certe)
    var _oggi = new Date(); _oggi.setHours(0,0,0,0);
    var _hasValidScad = false;
    if (scadenzaStr) {
      var _dtCheck = new Date(scadenzaStr + 'T00:00:00');
      if (!isNaN(_dtCheck.getTime())) {
        _hasValidScad = true;
        if (_dtCheck.getTime() < _oggi.getTime()) return; // scaduto → skip
      }
    }
    if (!_hasValidScad && scadenza instanceof Date && !isNaN(scadenza.getTime())) {
      _hasValidScad = true;
      if (scadenza.getTime() < _oggi.getTime()) return; // scaduto → skip
    }
    if (!_hasValidScad) return; // senza scadenza → skip

    // Filtro archiviati
    var _sr = String(g('STATO_RECORD')||'').toLowerCase();
    if (_sr === 'archiviato') return;

    bandi.push({
      id:'r'+(idx+2), rowIndex:idx+2,
      data:dataStr||new Date().toISOString().slice(0,10),
      titolo:String(g('TITOLO')||''), ente:String(g('ENTE')||''),
      livello:String(g('LIVELLO')||''), regione:String(g('REGIONE')||''),
      settore:String(g('SETTORE')||''), soggetti:String(g('SOGGETTI')||''),
      importo:parseFloat(g('IMPORTO'))||null, cofin:parseFloat(g('COFIN'))||null,
      scadenza:scadenzaStr, status:String(g('STATUS')||'Nuovo'),
      cliente:String(g('CLIENTE')||''), link:String(g('LINK')||''),
      note:String(g('NOTE')||''), fonte:String(g('FONTE')||''),
      priorita:String(g('PRIORITA')||'blu'),
      nascosto:g('NASCOSTO')===true||g('NASCOSTO')==='SI'||g('NASCOSTO')==='TRUE',
      statoRecord:_sr||'attivo',
      urlEnte:String(g('URL_ENTE')||''),
      lettoBando:g('LETTO_BANDO')===true||g('LETTO_BANDO')==='TRUE',
      ambito: parseInt(g('AMBITO'))||null,
      tipoBando: String(g('TIPO_BANDO')||''),
      settoreCultura: String(g('SETTORE_CULTURA')||''),
      cpv: String(g('CPV')||''),
    });
  });
  return bandi;
}

// [diagnostica estratta in DiagnosticaMigrazione.js]

function saveBandoRadar(b) {
  const sheet=getSheetRadar();
  const newRow=[
    new Date(), b.titolo, b.ente, b.livello, b.regione, b.settore, b.soggetti,
    b.importo||'', b.cofin||'',
    b.scadenza?new Date(b.scadenza):'',
    b.status||'Nuovo', b.cliente||'', b.link||'',
    b.note||'', b.fonte||'', b.priorita||'blu', false,
    'attivo',       // * STATO_RECORD
    b.urlEnte||'',  // * URL_ENTE
    false,          // * LETTO_BANDO (col 20)
    b.descrizione||'',  // * v4.27 DESCRIZIONE (col 21)
    b.tipoAppalto||'',  // * v4.27 TIPO_APPALTO (col 22)
  ];
  sheet.appendRow(newRow);
  const nr=sheet.getLastRow();
  sheet.getRange(nr,COL.DATA_RILEVAMENTO).setNumberFormat('dd/mm/yyyy');
  if(b.scadenza) sheet.getRange(nr,COL.SCADENZA).setNumberFormat('dd/mm/yyyy');
  if(b.importo)  sheet.getRange(nr,COL.IMPORTO).setNumberFormat('#,##0 "EUR"');
  applyPriorityColor(sheet,nr,b.priorita||'blu');
  return {rowIndex:nr};
}

function updateBandoRadar(b) {
  const sheet=getSheetRadar();
  const rowIndex=b.rowIndex;
  if(!rowIndex) return {error:'rowIndex mancante'};
  const values=[
    sheet.getRange(rowIndex,COL.DATA_RILEVAMENTO).getValue(),
    b.titolo, b.ente, b.livello, b.regione, b.settore, b.soggetti,
    b.importo||'', b.cofin||'',
    b.scadenza?new Date(b.scadenza):'',
    b.status||'Nuovo', b.cliente||'', b.link||'',
    b.note||'', b.fonte||'', b.priorita||'blu',
    b.nascosto?'SI':'NO',
    b.statoRecord||'attivo',  // *
    b.urlEnte||'',            // *
    b.lettoBando||false,      // * LETTO_BANDO
    b.descrizione||'',       // * v4.27 DESCRIZIONE
    b.tipoAppalto||'',       // * v4.27 TIPO_APPALTO
  ];
  sheet.getRange(rowIndex,1,1,values.length).setValues([values]);
  if(b.scadenza) sheet.getRange(rowIndex,COL.SCADENZA).setNumberFormat('dd/mm/yyyy');
  if(b.importo)  sheet.getRange(rowIndex,COL.IMPORTO).setNumberFormat('#,##0 "EUR"');
  applyPriorityColor(sheet,rowIndex,b.priorita||'blu');
  return {ok:true};
}

function toggleNascostoRadar(id,nascosto) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt(id.replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.getRange(rowIndex,COL.NASCOSTO).setValue(nascosto?'SI':'NO');
  return {ok:true};
}

function deleteBandoRadar(id) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt(id.replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.deleteRow(rowIndex);
  return {ok:true};
}

function applyPriorityColor(sheet,rowIndex,priorita) {
  const colors={rosso:'#FADBD8',arancio:'#FEF9E7',verde:'#D5F5E3',blu:'#D6E4F0',giallo:'#FFFDE7',grigio:'#F5F5F5'};
  const col=colors[priorita]||colors.blu;
  const numCols=Math.min(sheet.getLastColumn(),19);
  sheet.getRange(rowIndex,1,1,numCols).setBackground(col);
}

// ==================================================================
// * ARCHIVIO BANDI v3.0
// ==================================================================

// v4.22 — Moved to LegacyWorkflow.js: toggleLettoBando, archiviaRecord, ripristinaRecord, deleteArchiviato, deleteArchivioBulk, deleteArchivioTutto, autoArchiviaNotizieVecchie, archiviaNotizieOlderThan, eliminaArchiviatiTutti, autoArchiviaScaduti, toggleItemField, setItemField

// v4.22 — Moved to StatsManager.js: getStats, getGestioneStats

// v4.22 — Moved to TelegramManager.js: sendTelegram, sendTestTelegram


// v4.22 — Moved to NewsScanner.js: getItems, getItemsByIds, editSommario

// v4.22 — Moved to LegacyWorkflow.js: toggleItemField, setItemField

// -- BANDI (foglio legacy) -----------------------------------------
function getBandi() {
  const sh=getMainSS().getSheetByName(SH.BANDI);
  if(!sh) return {bandi:[]};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  if(!h||h.length===0) return {bandi:[]};
  const now=new Date(), bandi=[];
  for(let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]) continue;
    const item={}; h.forEach((col,idx)=>{item[col]=r[idx];});
    if(item.Stato==='scaduto') continue;
    const scad=item.DataScadenza instanceof Date?item.DataScadenza:new Date(item.DataScadenza);
    const giorni=Math.ceil((scad-now)/86400000);
    if(giorni<0){ sh.getRange(i+1,h.indexOf('Stato')+1).setValue('scaduto'); continue; }
    item.GiorniRimanenti=giorni; item.DataScadenzaFmt=formatDate(scad);
    bandi.push(item);
  }
  bandi.sort((a,b)=>a.GiorniRimanenti-b.GiorniRimanenti);
  return {bandi};
}

// -- FONTI ---------------------------------------------------------
// correggiSocialFontiFallite, addFontiIstituzionali, addFontiNewsNuove,
// addFonteArticoli, deleteFonteArticoli
// ==================================================================


// -- FONTI BANDI ---------------------------------------------------
// v4.20 — Archivio UNICO: legge da FontiBandi_v5 (lettura per nome colonna,
// date come stringa per la serializzazione google.script.run).
function getFontiBandi() {
  const SS = getMainSS();
  const sh = SS.getSheetByName('FontiBandi_v5');
  if (!sh || sh.getLastRow() < 2) return { fonti: [] };
  const v = sh.getDataRange().getValues();
  const h = v[0].map(function(x){ return String(x || '').trim(); });
  function col(n){ return h.indexOf(n); }
  const iId=col('ID'), iNome=col('Nome'), iUrl=col('URL'), iCat=col('Categoria'),
        iAtt=col('Attiva'), iScan=col('UltimaScan'), iEsito=col('UltimoEsito'),
        iFail=col('FailConsecutivi'), iTipo=col('Tipo'), iPri=col('Priorita');
  const fonti = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i]; if (iId >= 0 && !r[iId]) continue;
    fonti.push({
      ID: String(r[iId] || ''), Nome: String(r[iNome] || ''), URL: String(r[iUrl] || ''),
      Categoria: String(iCat >= 0 ? r[iCat] : ''), Tipo: String(iTipo >= 0 ? r[iTipo] : ''),
      Priorita: Number(iPri >= 0 ? r[iPri] : 2) || 2,
      Attiva: (r[iAtt] === true || String(r[iAtt]).toUpperCase() === 'TRUE'),
      ultimaScan: (iScan >= 0 && r[iScan]) ? String(r[iScan]) : '',
      ultimoEsito: String(iEsito >= 0 ? r[iEsito] : ''),
      failConsec: Number(iFail >= 0 ? r[iFail] : 0) || 0
    });
  }
  return { fonti: fonti };
}

function _createFontiBandiSheet(SS) {
  if(typeof popolaFontiBandiSheet==='function'){popolaFontiBandiSheet();return SS.getSheetByName('FontiBandi');}
  const sh=SS.insertSheet('FontiBandi');
  sh.getRange(1,1,1,6).setValues([['ID','Nome','URL','Categoria','Attiva','Note']]).setFontWeight('bold').setBackground('#0F2744').setFontColor('#fff');
  sh.setFrozenRows(1); return sh;
}

function addFonteBandi(body) {
  // v4.15 (2026-05-09): allineamento v4 -> v5. Ora scrive direttamente in FontiBandi_v5.
  // Schema 18 colonne (COL_F in Bandi_v5.js). Firma esterna invariata.
  try {
    const SS = getMainSS();
    let sh = SS.getSheetByName('FontiBandi_v5');
    if (!sh) {
      // Se v5 non esiste ancora, fallback al vecchio comportamento per non rompere.
      // Setup v5 va eseguito separatamente via setupBandiV5Schema().
      let shV4 = SS.getSheetByName('FontiBandi') || _createFontiBandiSheet(SS);
      const idV4 = 'FB' + Date.now();
      shV4.appendRow([idV4, body.nome, body.url, body.categoria || '', true, body.note || '']);
      return { ok: true, id: idV4, warning: 'FontiBandi_v5 non trovato, scritto in v4 legacy. Esegui setupBandiV5Schema()' };
    }
    const id = 'FB' + Date.now();
    // Compila riga con schema v5 a 18 colonne (default sensati per i campi non forniti).
    const row = new Array(18).fill('');
    row[0]  = id;                              // ID
    row[1]  = body.nome || '';                 // Nome
    row[2]  = body.url || '';                  // URL
    row[3]  = body.tipo || 'RSS';              // Tipo (default RSS, modificabile)
    row[4]  = body.categoria || '';            // Categoria
    row[5]  = Number(body.priorita) || 2;      // Priorita (default 2=media)
    row[6]  = true;                            // Attiva
    row[7]  = new Date();                      // DataAggiunta
    row[8]  = '';                              // UltimaScansione
    row[9]  = '';                              // UltimoEsito
    row[10] = 0;                               // NBandiTotali
    row[11] = 0;                               // NBandiUltimoScan
    row[12] = 0;                               // FailConsecutivi
    row[13] = '';                              // UltimoErrore
    row[14] = body.enteDefault || '';          // EnteDefault
    row[15] = body.urlEnte || '';              // UrlEnte
    row[16] = body.livello || 'Vari';          // Livello
    row[17] = body.note || '';                 // Note
    sh.appendRow(row);
    Logger.log('addFonteBandi v5: aggiunta ' + body.nome + ' (id=' + id + ')');
    return { ok: true, id: id };
  } catch(e) {
    Logger.log('addFonteBandi v5 ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}
function deleteFonteBandiById(id) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  return _deleteRowById(getMainSS().getSheetByName('FontiBandi_v5'), id);
}
function toggleFonteBandiField(id, field) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  return _toggleField(getMainSS().getSheetByName('FontiBandi_v5'), id, field);
}
// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
function scanSingolaFonteBandi(id) {
  try {
    var sh = getMainSS().getSheetByName('FontiBandi');
    if (!sh) return { error:'foglio FontiBandi non trovato' };
    var rows = sh.getDataRange().getValues();
    var headers = rows[0];
    var iId = headers.indexOf('ID'),
        iNome = headers.indexOf('Nome'),
        iUrl = headers.indexOf('URL'),
        iAttiva = headers.indexOf('Attiva');
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][iId]) !== String(id)) continue;
      var url = String(rows[i][iUrl] || '').trim();
      if (!url) return { error:'URL vuoto per fonte ' + id };
      try {
        var resp = UrlFetchApp.fetch(url, {
          muteHttpExceptions:true, followRedirects:true, deadline:8,
          headers:{'User-Agent':'Mozilla/5.0 (compatible; OsservatorioCulturale-Test/1.0)'}
        });
        var status = resp.getResponseCode();
        var len = resp.getContentText().length;
        return {
          ok: status >= 200 && status < 400,
          status: status,
          contentLength: len,
          fonte: { id: id, nome: rows[i][iNome], url: url, attiva: rows[i][iAttiva] }
        };
      } catch(e) {
        return { ok:false, error: 'fetch_failed: ' + e.message, fonte: { id:id, nome: rows[i][iNome], url: url } };
      }
    }
    return { error:'fonte non trovata: ' + id };
  } catch(e) {
    return { error: e.message };
  }
}


// ==================================================================
// PODCAST v3.2 — ESTRATTO in PodcastManager.js (v4.27.33)
// getPodcastSheet, getPodcasts, savePodcast, togglePodField, deletePodcast
// ==================================================================

// (spazio vuoto — codice podcast CRUD rimosso, ora in PodcastManager.js)

