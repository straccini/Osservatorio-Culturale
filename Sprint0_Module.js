/**
 * ============================================================================
 *  Sprint0_Module.gs
 * ============================================================================
 *
 *  Modulo unificato Sprint 0 — Osservatorio Culturale (Duemilamusei)
 *  Da inserire come NUOVO FILE nel progetto GAS, AFFIANCO a Codice.gs.
 *  Tutto qui dentro è isolato dal resto: in caso di rollback basta cancellare
 *  questo file e ripristinare i 3 punti di chiamata in Codice.gs (vedi PATCH).
 *
 *  Contenuto:
 *    H1 - Counter unificato (_itemsCount_, _bandiCount_, _podcastCount_)
 *    H2.b - setupTriggers nuovo + ScanLog (_logScan_, sheet ScanLog)
 *    H3 - Trigger digest bandi ogni 3 giorni (bandiEvery3Days)
 *    H4 - Pre-check Addon (_h4_checkAddon)
 *    Diagnostiche (_h1Diag, _h2b_auditTriggers, _h2c_dumpForLabeling)
 *
 *  Versione: v4.6.0
 *  Data: 27 aprile 2026
 *  Autore: Silvano Straccini / Duemilamusei
 *  Riferimento: Sprint0_Schede_Tecniche.md
 *
 * ============================================================================
 */

// ============================================================================
// COSTANTI Sprint 0 (modificabili)
// ============================================================================

var OC_SCORE_PUBLISH_THRESHOLD = 60;  // soglia pubblicazione contenuti AI
var OC_SCANLOG_SHEET = 'ScanLog';     // nome sheet log scan
var OC_DIGEST_BANDI_HOURS = 72;       // periodicita digest bandi 3 giorni

// ============================================================================
// H1 - COUNTER UNIFICATO (3 funzioni dedicate per entità)
// ============================================================================

/**
 * Conta notizie dal sheet Items.
 * Esclude archiviati per default — semantica coerente con getItems().
 *
 * @param {Object} filters
 *   filters.ambito           {number}  1-5; 0/omesso = tutti gli ambiti
 *   filters.includeArchiviati {bool}   default false
 *   filters.scoreMin         {number}  opzionale, soglia Score minima
 *   filters.giorniIndietro   {number}  opzionale, limita a ultimi N giorni
 * @return {number}
 */
function _itemsCount_(filters) {
  filters = filters || {};
  var sheet = getMainSS().getSheetByName('Items');
  if (!sheet) return 0;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  var h = data[0];
  var colArch  = h.indexOf('Archiviato');
  var colAmb   = h.indexOf('Ambito');
  var colScore = h.indexOf('Score');
  var colData  = h.indexOf('DataAcquisizione');
  if (colData === -1) colData = h.indexOf('Data');

  var inclArch = filters.includeArchiviati === true;
  var ambitoF  = (filters.ambito > 0) ? Number(filters.ambito) : null;
  var scoreMin = (filters.scoreMin !== undefined) ? filters.scoreMin : null;
  var cutoff   = filters.giorniIndietro ? (Date.now() - filters.giorniIndietro * 86400000) : null;

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0]) continue;
    if (!inclArch  && colArch  !== -1 && r[colArch]  === true)            continue;
    if (ambitoF  !== null && colAmb   !== -1 && Number(r[colAmb]) !== ambitoF) continue;
    if (scoreMin !== null && colScore !== -1 && Number(r[colScore]) < scoreMin) continue;
    if (cutoff   !== null && colData  !== -1) {
      var ts = r[colData] instanceof Date ? r[colData].getTime() : new Date(r[colData]).getTime();
      if (isNaN(ts) || ts < cutoff) continue;
    }
    count++;
  }
  return count;
}

/**
 * Conta bandi dal RADAR BANDI tramite getBandiRadar().
 * NOTA: il sheet non ha colonna Ambito — il filtro ambito non è applicabile.
 *
 * @param {Object} filters
 *   filters.includeArchiviati {bool}    default false (statoRecord !== 'archiviato')
 *   filters.status            {string}  opzionale 'Nuovo' | 'In valutazione' | ...
 *   filters.giorniIndietro    {number}  opzionale, su campo data (DATA_RILEVAMENTO)
 * @return {number}
 */
function _bandiCount_(filters) {
  filters = filters || {};
  var bandi = getBandiRadar();
  if (!bandi || !bandi.length) return 0;
  var inclArch = filters.includeArchiviati === true;
  var statusF  = filters.status || null;
  var cutoff   = filters.giorniIndietro ? (Date.now() - filters.giorniIndietro * 86400000) : null;
  return bandi.filter(function(b) {
    if (!inclArch && b.statoRecord === 'archiviato') return false;
    if (statusF && b.status !== statusF) return false;
    if (cutoff) {
      var ts = b.data ? new Date(b.data).getTime() : NaN;
      if (isNaN(ts) || ts < cutoff) return false;
    }
    return true;
  }).length;
}

/**
 * Conta podcast dal sheet Podcast.
 * Il filtro per ambito usa tematicaToAmbitoId_() (Addon_v42.js:360)
 * per mappare la stringa Tematica all'id ambito intero.
 *
 * @param {Object} filters
 *   filters.ambito           {number}  1-5; 0/omesso = tutti
 *   filters.includeArchiviati {bool}   default false (StatoRecord !== 'archiviato')
 *   filters.giorniIndietro   {number}  opzionale, su DataRilevamento
 * @return {number}
 */
function _podcastCount_(filters) {
  filters = filters || {};
  var sheet = getMainSS().getSheetByName('Podcast');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var data = sheet.getDataRange().getValues();
  var h = data[0];
  var colSR   = h.indexOf('StatoRecord');
  var colTem  = h.indexOf('Tematica');
  var colDate = h.indexOf('DataRilevamento');

  var inclArch = filters.includeArchiviati === true;
  var ambitoF  = (filters.ambito > 0) ? Number(filters.ambito) : null;
  var cutoff   = filters.giorniIndietro ? (Date.now() - filters.giorniIndietro * 86400000) : null;

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0]) continue;
    var sr = String(r[colSR] || 'attivo').toLowerCase();
    if (!inclArch && sr === 'archiviato') continue;
    if (ambitoF !== null && colTem !== -1) {
      var aid = (typeof tematicaToAmbitoId_ === 'function')
                ? tematicaToAmbitoId_(String(r[colTem] || ''))
                : null;
      if (aid !== ambitoF) continue;
    }
    if (cutoff && colDate !== -1) {
      var ts = r[colDate] instanceof Date ? r[colDate].getTime() : new Date(r[colDate]).getTime();
      if (isNaN(ts) || ts < cutoff) continue;
    }
    count++;
  }
  return count;
}

/**
 * H1 - Diagnostica counter. Esegui da editor.
 */
function _h1Diag() {
  Logger.log('=== H1 DIAG counter — Opzione B (3 funzioni dedicate) ===');

  // Items per ambito
  Logger.log('--- _itemsCount_ ---');
  Logger.log('tutti: ' + _itemsCount_({}));
  for (var a = 1; a <= 5; a++) {
    Logger.log('ambito ' + a + ': ' + _itemsCount_({ambito: a}));
  }

  // Bandi (no filtro ambito — sheet non lo supporta)
  Logger.log('--- _bandiCount_ ---');
  Logger.log('attivi: '    + _bandiCount_({}));
  Logger.log('archiviati: ' + _bandiCount_({includeArchiviati: true, status: 'archiviato'}));
  Logger.log('nuovi: '     + _bandiCount_({status: 'Nuovo'}));
  Logger.log('ultimi 72h: ' + _bandiCount_({giorniIndietro: 3}));

  // Podcast per ambito (via tematicaToAmbitoId_)
  Logger.log('--- _podcastCount_ ---');
  Logger.log('tutti: ' + _podcastCount_({}));
  for (var b = 1; b <= 5; b++) {
    Logger.log('ambito ' + b + ': ' + _podcastCount_({ambito: b}));
  }

  // Confronto con getStats esistente
  if (typeof getStats === 'function') {
    Logger.log('--- getStats() per confronto ---');
    var s = getStats();
    Logger.log('total: ' + s.total + ' | unread: ' + s.unread + ' | podTotale: ' + s.podTotale);
    Logger.log('perAmbito: ' + JSON.stringify(s.perAmbito));
    Logger.log('bandiAttivi: ' + s.bandiAttivi + ' | bandiNuovi: ' + s.bandiNuovi);
  }
}

// ============================================================================
// H2.b - SCANLOG e SETUP TRIGGERS
// ============================================================================

/**
 * Logga un esito di scan nel sheet ScanLog (creato se non esiste).
 *
 * @param {string} nomeFonte
 * @param {string} tipo - 'news' | 'bandi' | 'podcast'
 * @param {string} esito - 'OK' | 'ERROR' | 'SKIP' | 'EMPTY'
 * @param {number} numNuovi
 * @param {string} errore (opzionale)
 */
function _logScan_(nomeFonte, tipo, esito, numNuovi, errore) {
  try {
    var ss = getMainSS();
    var sheet = ss.getSheetByName(OC_SCANLOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(OC_SCANLOG_SHEET);
      sheet.appendRow(['Timestamp', 'NomeFonte', 'Tipo', 'Esito', 'NumNuovi', 'Errore']);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), nomeFonte || '', tipo || '', esito || '', numNuovi || 0, errore || '']);
  } catch (e) {
    Logger.log('_logScan_ errore: ' + e.message);
  }
}

/**
 * H2.b - Pulisce e ricrea i 5 trigger Sprint 0.
 * ATTENZIONE: cancella TUTTI i trigger esistenti del progetto.
 * Eseguire da editor una sola volta dopo deploy v4.6.0.
 */
function setupTriggers_v46() {
  // Delega a setupTriggersUnificati (Scannerbandi.js) che è la funzione master
  if (typeof setupTriggersUnificati === 'function') {
    setupTriggersUnificati();
    return ScriptApp.getProjectTriggers().length;
  }
  // Fallback se setupTriggersUnificati non disponibile
  var existing = ScriptApp.getProjectTriggers();
  existing.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('lunediMattina').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  ScriptApp.newTrigger('scanSources').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(7).create();
  ScriptApp.newTrigger('scanPodcast').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(7).nearMinute(30).create();
  ScriptApp.newTrigger('sendDigestAuto').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(8).create();
  ScriptApp.newTrigger('scanSources').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(7).create();
  ScriptApp.newTrigger('scanPodcast').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(7).nearMinute(30).create();
  ScriptApp.newTrigger('sendDigestAuto').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(8).create();
  var nuovi = ScriptApp.getProjectTriggers();
  Logger.log('Triggers configurati (fallback): ' + nuovi.length);
  return nuovi.length;
}

/**
 * H2.b - Audit dei trigger attivi. Esegui da editor.
 */
function _h2b_auditTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('=== H2.b AUDIT TRIGGERS (' + triggers.length + ') ===');
  triggers.forEach(function(t) {
    Logger.log('Funzione: ' + t.getHandlerFunction() +
               ' | Tipo: ' + t.getEventType() +
               ' | Source: ' + t.getTriggerSource());
  });
  return triggers.length;
}

// ============================================================================
// H3 - DIGEST BANDI OGNI 3 GIORNI
// ============================================================================

/**
 * H3 - Invia digest Telegram dei bandi inseriti nelle ultime 72h.
 * Se 0 nuovi bandi, salta senza errori (no spam).
 * Logga in DigestLog se presente.
 *
 * Schedulato da setupTriggers_v46 ogni OC_DIGEST_BANDI_HOURS.
 */
function bandiEvery3Days() {
  var ss = getMainSS();
  var sheet = ss.getSheetByName('RADAR BANDI');
  if (!sheet) {
    Logger.log('bandiEvery3Days: sheet RADAR BANDI non trovato');
    return;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('bandiEvery3Days: nessun dato');
    return;
  }

  var headers = data[0];
  var colData = headers.indexOf('DataInserimento');
  if (colData === -1) colData = headers.indexOf('Data');
  var colArchiv = headers.indexOf('Archiviato');
  var colTitolo = headers.indexOf('Titolo');
  var colEnte = headers.indexOf('Ente');
  var colScadenza = headers.indexOf('Scadenza');
  var colLink = headers.indexOf('link');
  if (colLink === -1) colLink = headers.indexOf('Link');
  var colAmbito = headers.indexOf('Ambito');

  var cutoff = Date.now() - (OC_DIGEST_BANDI_HOURS * 3600 * 1000);
  var nuovi = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (colArchiv !== -1 && row[colArchiv] === true) continue;
    if (colData !== -1) {
      var ts = new Date(row[colData]).getTime();
      if (isNaN(ts) || ts < cutoff) continue;
    }
    nuovi.push(row);
  }

  if (nuovi.length === 0) {
    Logger.log('bandiEvery3Days: 0 nuovi bandi, skip invio');
    _digestLog_('bandi_3gg', 0, 'SKIP_NO_NEW');
    return;
  }

  // Costruisce messaggio Telegram (Markdown)
  var msg = '*Osservatorio Culturale - Bandi*\n';
  msg += '_' + nuovi.length + ' nuovi bandi negli ultimi 3 giorni_\n\n';

  // Raggruppa per ambito
  var byAmbito = {};
  nuovi.forEach(function(row) {
    var amb = colAmbito !== -1 ? Number(row[colAmbito]) : 0;
    if (!byAmbito[amb]) byAmbito[amb] = [];
    byAmbito[amb].push(row);
  });

  // Sprint 1.3 (2026-05-01): rinomina ambiti per allineamento Matrix
  var ambitoLabels = (typeof AMBITO_LABEL !== 'undefined') ? AMBITO_LABEL : {
    1: 'Identita e narrazione museale', 2: 'Inclusione e accessibilita', 3: 'Programma, mostre e collezioni',
    4: 'Comunita e welfare culturale', 5: 'Digital, AI e governance', 0: 'Altri'
  };

  Object.keys(byAmbito).sort().forEach(function(amb) {
    msg += '\n*' + (ambitoLabels[amb] || ('Ambito ' + amb)) + '*\n';
    byAmbito[amb].forEach(function(row) {
      var titolo = colTitolo !== -1 ? row[colTitolo] : '(senza titolo)';
      var ente = colEnte !== -1 ? row[colEnte] : '';
      var scad = colScadenza !== -1 ? row[colScadenza] : '';
      var link = colLink !== -1 ? row[colLink] : '';
      msg += '- ' + titolo;
      if (ente) msg += ' / ' + ente;
      if (scad) msg += ' (scad. ' + scad + ')';
      if (link) msg += '\n  ' + link;
      msg += '\n';
    });
  });

  // Invio Telegram (riusa funzione esistente in Codice.gs)
  if (typeof sendTelegram === 'function') {
    try {
      sendTelegram(msg);
      _digestLog_('bandi_3gg', nuovi.length, 'OK');
      Logger.log('bandiEvery3Days: digest inviato con ' + nuovi.length + ' bandi');
    } catch (e) {
      _digestLog_('bandi_3gg', nuovi.length, 'ERROR: ' + e.message);
      Logger.log('bandiEvery3Days: errore Telegram: ' + e.message);
    }
  } else {
    Logger.log('bandiEvery3Days: sendTelegram non trovata. Stampa messaggio:\n' + msg);
  }
}

/**
 * INT-7 (Sprint 1.1): alias con nome semantico chiaro.
 * Da preferire nei punti di chiamata futuri. Il nome `bandiEvery3Days`
 * descrive la frequenza (implementativo); `sendBandiAlert` descrive l'intento
 * (commerciale/funzionale). Il trigger continua a chiamare bandiEvery3Days
 * per backward-compatibility — verrà rinominato dopo verifica.
 */
function sendBandiAlert() {
  return bandiEvery3Days();
}

/**
 * Helper di log digest (riusa sheet DigestLog se esiste).
 */
function _digestLog_(tipo, n, esito) {
  try {
    var ss = getMainSS();
    var sheet = ss.getSheetByName('DigestLog');
    if (sheet) {
      sheet.appendRow([new Date(), tipo, n, esito]);
    }
  } catch (e) {
    Logger.log('_digestLog_ errore: ' + e.message);
  }
}

// ============================================================================
// H4 - PRE-CHECK ADDON RICERCA
// ============================================================================

/**
 * H4 - Verifica che getGlobalSearchV42 esista in Addon_v42.gs.
 * Esegui da editor PRIMA di modificare Index.html.
 */
function _h4_checkAddon() {
  if (typeof getGlobalSearchV42 !== 'function') {
    throw new Error('getGlobalSearchV42 NON trovata. Verificare Addon_v42.gs nel progetto GAS.');
  }
  var test = getGlobalSearchV42('musei');
  Logger.log('=== H4 ADDON CHECK ===');
  Logger.log('Tipo risposta: ' + (typeof test));
  Logger.log('Keys: ' + (test ? Object.keys(test).join(',') : 'null'));
  Logger.log('Sample (truncated 500ch): ' + JSON.stringify(test).slice(0, 500));
  return test;
}

// ============================================================================
// H2.c - DUMP ETICHETTATURA AI
// ============================================================================

/**
 * H2.c - Crea sheet temporaneo "AI_Tuning" con 30 record per etichettatura
 * manuale. Esegui da editor, poi Silvano compila colonna "Rilevante (S/N)".
 */
function _h2c_dumpForLabeling() {
  var ss = getMainSS();
  var src = ss.getSheetByName('ITEMS');
  if (!src) throw new Error('Sheet ITEMS non trovato');

  var data = src.getDataRange().getValues();
  var headers = data[0];
  var colData = headers.indexOf('Data');
  var colTit = headers.indexOf('Titolo');
  var colFonte = headers.indexOf('Fonte');
  var colScore = headers.indexOf('Score');
  var colAmbito = headers.indexOf('Ambito');

  var cutoff = Date.now() - (30 * 86400000);
  var sample = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = new Date(row[colData]).getTime();
    if (isNaN(ts) || ts < cutoff) continue;
    sample.push(row);
    if (sample.length >= 30) break;
  }

  // Cancella sheet esistente
  var existing = ss.getSheetByName('AI_Tuning');
  if (existing) ss.deleteSheet(existing);

  var sheet = ss.insertSheet('AI_Tuning');
  sheet.appendRow(['Data', 'Titolo', 'Fonte', 'Ambito', 'Score AI', 'Rilevante (S/N)', 'Note']);
  sheet.setFrozenRows(1);
  sheet.getRange('A1:G1').setFontWeight('bold').setBackground('#185FA5').setFontColor('#FFFFFF');

  sample.forEach(function(row) {
    sheet.appendRow([
      row[colData], row[colTit], row[colFonte],
      row[colAmbito], row[colScore], '', ''
    ]);
  });

  sheet.setColumnWidth(1, 110);  // data
  sheet.setColumnWidth(2, 380);  // titolo
  sheet.setColumnWidth(3, 160);  // fonte
  sheet.setColumnWidth(4, 80);   // ambito
  sheet.setColumnWidth(5, 80);   // score
  sheet.setColumnWidth(6, 110);  // rilevante S/N
  sheet.setColumnWidth(7, 200);  // note

  Logger.log('AI_Tuning: ' + sample.length + ' record inseriti per etichettatura');
  return sample.length;
}

/**
 * H2.c - Calcola correlazione score AI vs giudizio umano.
 * Eseguire DOPO che Silvano ha compilato la colonna "Rilevante (S/N)".
 */
function _h2c_analyze() {
  var ss = getMainSS();
  var sheet = ss.getSheetByName('AI_Tuning');
  if (!sheet) throw new Error('AI_Tuning non trovato. Eseguire prima _h2c_dumpForLabeling');

  var data = sheet.getDataRange().getValues();
  var bins = {};
  var totalLabeled = 0;
  for (var i = 1; i < data.length; i++) {
    var score = Number(data[i][4]);
    var rel = String(data[i][5]).toUpperCase().trim();
    if (rel !== 'S' && rel !== 'N') continue;
    totalLabeled++;
    var bin = Math.floor(score / 10) * 10;  // bin di 10 in 10
    if (!bins[bin]) bins[bin] = {S: 0, N: 0};
    bins[bin][rel]++;
  }

  Logger.log('=== H2.c ANALISI (' + totalLabeled + ' record etichettati) ===');
  Logger.log('Bin score | S | N | precisione (S/(S+N))');
  Object.keys(bins).sort(function(a,b) { return Number(a)-Number(b); }).forEach(function(b) {
    var s = bins[b].S, n = bins[b].N;
    var prec = (s + n) > 0 ? (s / (s + n) * 100).toFixed(1) + '%' : '-';
    Logger.log(b + '-' + (Number(b)+9) + ' | ' + s + ' | ' + n + ' | ' + prec);
  });

  // Soglia raccomandata: il bin piu basso con precisione >= 85%
  var soglia = null;
  Object.keys(bins).sort(function(a,b) { return Number(a)-Number(b); }).forEach(function(b) {
    if (soglia !== null) return;
    var s = bins[b].S, n = bins[b].N;
    if ((s + n) >= 3 && (s / (s + n)) >= 0.85) {
      soglia = Number(b);
    }
  });
  Logger.log('SOGLIA RACCOMANDATA: ' + (soglia !== null ? soglia : 'dati insufficienti'));
  return {bins: bins, sogliaRaccomandata: soglia};
}

// ============================================================================
// PATCH per Codice.gs - punti di sostituzione
// ============================================================================

/*
 * In Codice.gs, sostituire i conteggi interni di getStats / getHomepageData /
 * getGestioneStats con chiamate a _itemsCount_ / _bandiCount_ / _podcastCount_.
 *
 * ESEMPIO PATCH per getStats() in Codice.gs — blocco perAmbito:
 *
 *   const perAmbito = {1:0, 2:0, 3:0, 4:0, 5:0};
 *   const perAmbitoUnread = {1:0, 2:0, 3:0, 4:0, 5:0};
 *   for (var amb = 1; amb <= 5; amb++) {
 *     perAmbito[amb]       = _itemsCount_({ambito: amb});
 *     perAmbitoUnread[amb] = _itemsCount_({ambito: amb, stato: 'unread'}); // vedi nota sotto
 *   }
 *   // NB: _itemsCount_ non ha filtro stato:'unread' — per unread per ambito
 *   // continuare a leggere il sheet direttamente come fa getStats() ora, oppure
 *   // aggiungere filters.unreadOnly a _itemsCount_ in sprint futuro.
 *
 * ESEMPIO PATCH per totali:
 *
 *   var total     = _itemsCount_({});
 *   var bandiAtt  = _bandiCount_({});
 *   var podTotale = _podcastCount_({});
 *
 * ESEMPIO PATCH dentro scanSources / scanBandiAutomatico / scanPodcast:
 *
 *   // dopo aver processato una fonte:
 *   _logScan_(nomeFonte, 'news', numNuovi > 0 ? 'OK' : 'EMPTY', numNuovi);
 *
 *   // su errore parsing/fetch:
 *   _logScan_(nomeFonte, 'news', 'ERROR', 0, e.message);
 */

// ============================================================================
// FINE Sprint0_Module.gs
// ============================================================================
