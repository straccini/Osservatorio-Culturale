/**
 * Sheet_Cleanup.js — Osservatorio Culturale
 * Riorganizzazione completa fogli Google Sheet per allineamento con la webapp.
 *
 * ISTRUZIONI: dall'editor GAS esegui manualmente la funzione:
 *   runSheetCleanup()
 *
 * Operazioni eseguite:
 *  1. Rinomina fogli con nome sbagliato → nome atteso dal codice
 *  2. Crea fogli mancanti con gli header corretti
 *  3. Migra dati dove necessario (Podcast_Episodes → Podcast)
 *  4. Ordina i tab nel foglio in sequenza logica
 *  5. Stampa report finale nel log
 *
 * SICUREZZA: nessun dato viene eliminato. I fogli non più usati
 * dalla webapp vengono rinominati con prefisso "_OLD_" e nascosti.
 */

// ─── HEADERS ATTESI DAL CODICE ─────────────────────────────────────────────

const CLEANUP_HEADERS = {

  // Fogli critici per la webapp
  'Items': [
    'ID','Titolo','Fonte','FonteURL','Data','Ambito','AmbitoLabel',
    'Score','Letto','Salvato','Archiviato','InclusiNelDigest',
    'SommarioAI','SommarioEditato','TagAI','StatoRecord','MatrixDim'
  ],
  'Fonti': [
    'ID','Nome','URL','RSSURL','Ambito','AmbitoLabel',
    'Attiva','UltimaScansione','NumItemRaccolti'
  ],
  'Podcast': [
    'ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata',
    'DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte',
    'Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord','MatrixDim'
  ],
  'MailingList': [
    'ID','Email','Nome','Ruolo','Ambiti','Token','Attivo','DataIscrizione'
  ],
  'DigestLog': [
    'ID','DataInvio','NumItem','Destinatari','Stato'
  ],
  'NewsletterLog': [
    'ID','Data','Soggetto','Destinatari','Stato','Autore','Token'
  ],
  'ScanLog': [
    'Timestamp','NomeFonte','Tipo','Esito','NumNuovi','Errore'
  ],
  'Utenti': [
    'ID','Email','Nome','Ruolo','Stato','OptInDigest','OptInBandi',
    'OptInMatrix','DataIscrizione','DataApprovazione','AggiuntoDa','Note'
  ],
  'FontiBandi': [
    'ID','Nome','URL','RSSURL','Ambito','AmbitoLabel',
    'Attiva','UltimaScansione','NumItemRaccolti'
  ],
  'ResponsesMatrix': [
    'response_id','timestamp_inizio','timestamp_fine','model_version',
    'museum_profile_json','museum_name','responses_json','section11_json',
    'tooltip_opened_json','scoring_dimensions_json','profile_assigned',
    'top3_opportunities_json','synthetic_score','time_per_question_json',
    'consistency_flags_json','user_agent_hash','completion_status'
  ],
  'ContactsMatrix': [
    'response_id','email','preferences_json','consent_timestamp','consent_text_version'
  ]
};

// ─── MAPPA RINOMINAZIONI: nome attuale → nome corretto ────────────────────

const RENAME_MAP = {
  'Matrix':         'ResponsesMatrix',   // stesso schema
  'Consensi':       'ContactsMatrix',    // stesso schema
  'FontiBandi_Log': 'ScanLog',           // stesso schema
  'Digest_Tracking':'DigestLog',         // schema compatibile
  'Digest':         'NewsletterLog'      // draft newsletter
};

// ─── FOGLI DA ARCHIVIARE (non usati dalla webapp, ma con dati utili) ───────

const ARCHIVE_SHEETS = [
  'Podcast_Episodes',   // migrato in Podcast
  'Podcast_Feed',       // fonti podcast — non usato dal codice principale
  'Webinar_Feed',       // webinar — non collegato al codice principale
  'EventiMusei',        // eventi — non collegato al codice principale
  'Favoritismo_Bandi',  // feature non implementata nel codice
  'Bandi_Completo',     // foglio manuale legacy
  'Admin'               // non usato dal codice (usa ScriptProperties)
];

// ─── ORDINE LOGICO DEI TAB ─────────────────────────────────────────────────

const TAB_ORDER = [
  'Utenti',
  'MailingList',
  'Items',
  'Fonti',
  'Podcast',
  'FontiBandi',
  'Bandi',
  'ScanLog',
  'DigestLog',
  'NewsletterLog',
  'ResponsesMatrix',
  'ContactsMatrix'
];

// ─── FUNZIONE PRINCIPALE ──────────────────────────────────────────────────

function runSheetCleanup() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  const SS = getMainSS();
  const log = [];

  log.push('=== SHEET CLEANUP — ' + new Date().toISOString() + ' ===\n');

  // STEP 1: Rinomina fogli con nome errato
  log.push('--- STEP 1: Rinominazione fogli ---');
  for (const [oldName, newName] of Object.entries(RENAME_MAP)) {
    const sh = SS.getSheetByName(oldName);
    if (sh) {
      sh.setName(newName);
      log.push('  ✅ Rinominato: "' + oldName + '" → "' + newName + '"');
    } else {
      // Controlla se il foglio con il nuovo nome esiste già
      const already = SS.getSheetByName(newName);
      if (already) {
        log.push('  ⏭  "' + newName + '" esiste già, skip');
      } else {
        log.push('  ⚠️  "' + oldName + '" non trovato (né "' + newName + '")');
      }
    }
  }

  // STEP 2: Migra dati Podcast_Episodes → Podcast (se Podcast non esiste ancora)
  log.push('\n--- STEP 2: Migrazione Podcast_Episodes → Podcast ---');
  const podcastSh = SS.getSheetByName('Podcast');
  const podEpSh   = SS.getSheetByName('Podcast_Episodes');
  if (!podcastSh && podEpSh) {
    podEpSh.setName('Podcast');
    log.push('  ✅ "Podcast_Episodes" rinominato in "Podcast" (dati preservati)');
  } else if (podcastSh) {
    log.push('  ⏭  "Podcast" esiste già');
  } else {
    log.push('  ⚠️  Né "Podcast" né "Podcast_Episodes" trovati');
  }

  // STEP 3: Migra dati Utenti → MailingList (crea MailingList da colonne Utenti)
  log.push('\n--- STEP 3: Creazione MailingList da Utenti ---');
  _createMailingListFromUtenti_(SS, log);

  // STEP 4: Crea fogli mancanti con headers
  log.push('\n--- STEP 4: Creazione fogli mancanti ---');
  const SHEETS_TO_CREATE = ['Items','Fonti','ScanLog','DigestLog','NewsletterLog','ResponsesMatrix','ContactsMatrix'];
  for (const name of SHEETS_TO_CREATE) {
    let sh = SS.getSheetByName(name);
    if (!sh) {
      sh = SS.insertSheet(name);
      const headers = CLEANUP_HEADERS[name];
      if (headers) {
        sh.appendRow(headers);
        sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E8F0FE');
        sh.setFrozenRows(1);
      }
      log.push('  ✅ Creato: "' + name + '" con ' + (headers ? headers.length : 0) + ' colonne');
    } else {
      log.push('  ⏭  "' + name + '" già presente, skip');
    }
  }

  // STEP 5: Verifica e corregge header Utenti (aggiunge colonne mancanti)
  log.push('\n--- STEP 5: Verifica headers Utenti ---');
  _verifyAndFixHeaders_(SS, 'Utenti', CLEANUP_HEADERS['Utenti'], log);

  // STEP 6: Verifica e corregge header FontiBandi
  log.push('\n--- STEP 6: Verifica headers FontiBandi ---');
  _verifyAndFixHeaders_(SS, 'FontiBandi', CLEANUP_HEADERS['FontiBandi'], log);

  // STEP 7: Popola Fonti con fonti news di default se vuoto
  log.push('\n--- STEP 7: Seed Fonti news ---');
  _seedFontiNews_(SS, log);

  // STEP 8: Archivia fogli non usati dalla webapp
  log.push('\n--- STEP 8: Archiviazione fogli non usati ---');
  for (const name of ARCHIVE_SHEETS) {
    const sh = SS.getSheetByName(name);
    if (sh) {
      // Evita di rinominare se già archiviato
      if (!sh.getName().startsWith('_OLD_')) {
        sh.setName('_OLD_' + name);
        sh.hideSheet();
        log.push('  📦 Archiviato e nascosto: "' + name + '" → "_OLD_' + name + '"');
      } else {
        log.push('  ⏭  "' + name + '" già archiviato');
      }
    }
    // Se non trovato, lo saltiamo silenziosamente (potrebbe già essere stato rinominato)
  }

  // STEP 9: Ordina i tab
  log.push('\n--- STEP 9: Riordino tab ---');
  _reorderSheets_(SS, TAB_ORDER, log);

  // REPORT FINALE
  log.push('\n=== CLEANUP COMPLETATO ===');
  log.push('Fogli attivi: ' + SS.getSheets().filter(s => !s.isSheetHidden()).map(s => s.getName()).join(', '));
  log.push('Fogli archiviati: ' + SS.getSheets().filter(s => s.isSheetHidden()).map(s => s.getName()).join(', '));

  Logger.log(log.join('\n'));
  Logger.log('=== SHEET CLEANUP COMPLETATO ===');
}

// ─── HELPER: crea MailingList da Utenti ──────────────────────────────────

function _createMailingListFromUtenti_(SS, log) {
  if (SS.getSheetByName('MailingList')) {
    log.push('  ⏭  MailingList già presente, skip');
    return;
  }
  const utentiSh = SS.getSheetByName('Utenti');
  if (!utentiSh) {
    log.push('  ⚠️  Foglio Utenti non trovato, MailingList non creata');
    return;
  }

  const data = utentiSh.getDataRange().getValues();
  if (data.length < 2) {
    log.push('  ⚠️  Utenti vuoto, MailingList creata con soli headers');
    const mlSh = SS.insertSheet('MailingList');
    mlSh.appendRow(CLEANUP_HEADERS['MailingList']);
    mlSh.getRange(1, 1, 1, CLEANUP_HEADERS['MailingList'].length).setFontWeight('bold').setBackground('#E8F0FE');
    mlSh.setFrozenRows(1);
    return;
  }

  const headers = data[0];
  const idxEmail     = headers.indexOf('Email');
  const idxNome      = headers.indexOf('Nome');
  const idxRuolo     = headers.indexOf('Ruolo');
  const idxStato     = headers.indexOf('Stato');
  const idxDigest    = headers.indexOf('OptInDigest');
  const idxBandi     = headers.indexOf('OptInBandi');
  const idxIscritto  = headers.indexOf('DataIscrizione');

  const mlSh = SS.insertSheet('MailingList');
  mlSh.appendRow(CLEANUP_HEADERS['MailingList']);
  mlSh.getRange(1, 1, 1, CLEANUP_HEADERS['MailingList'].length).setFontWeight('bold').setBackground('#E8F0FE');
  mlSh.setFrozenRows(1);

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const stato = idxStato >= 0 ? row[idxStato] : '';
    if (stato === 'approvato' || stato === 'attivo' || stato === '') {
      const ambiti = [];
      if (idxDigest >= 0 && row[idxDigest]) ambiti.push('digest');
      if (idxBandi  >= 0 && row[idxBandi])  ambiti.push('bandi');
      mlSh.appendRow([
        'ML-' + String(count + 1).padStart(3, '0'),
        idxEmail    >= 0 ? row[idxEmail]    : '',
        idxNome     >= 0 ? row[idxNome]     : '',
        idxRuolo    >= 0 ? row[idxRuolo]    : 'lettore',
        ambiti.join(','),
        '',   // Token
        stato === 'approvato' || stato === '' ? 'TRUE' : 'FALSE',
        idxIscritto >= 0 ? row[idxIscritto] : ''
      ]);
      count++;
    }
  }
  log.push('  ✅ MailingList creata con ' + count + ' utenti attivi da Utenti');
}

// ─── HELPER: verifica e corregge headers di un foglio ───────────────────

function _verifyAndFixHeaders_(SS, sheetName, expectedHeaders, log) {
  const sh = SS.getSheetByName(sheetName);
  if (!sh) {
    log.push('  ⚠️  "' + sheetName + '" non trovato, skip');
    return;
  }
  const currentHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const missing = expectedHeaders.filter(h => !currentHeaders.includes(h));
  if (missing.length === 0) {
    log.push('  ✅ "' + sheetName + '": headers OK (' + currentHeaders.length + ' colonne)');
    return;
  }
  // Aggiungi colonne mancanti in fondo
  const startCol = sh.getLastColumn() + 1;
  sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
  sh.getRange(1, startCol, 1, missing.length).setFontWeight('bold').setBackground('#FFF3CD');
  log.push('  ✅ "' + sheetName + '": aggiunte ' + missing.length + ' colonne mancanti: ' + missing.join(', '));
}

// ─── HELPER: seed Fonti news con fonti istituzionali di default ──────────

function _seedFontiNews_(SS, log) {
  const sh = SS.getSheetByName('Fonti');
  if (!sh) { log.push('  ⚠️  Foglio Fonti non trovato'); return; }
  if (sh.getLastRow() > 1) { log.push('  ⏭  Fonti già popolato (' + (sh.getLastRow()-1) + ' righe), skip'); return; }

  const fontiDefault = [
    ['FN-001','ICOM Italia','https://www.icom-italia.org','https://www.icom-italia.org/feed/','2','Inclusione e accessibilità','TRUE','','0'],
    ['FN-002','Federculture','https://www.federculture.it','https://www.federculture.it/feed/','5','Digital, AI e governance','TRUE','','0'],
    ['FN-003','Symbola','https://www.symbola.net','https://www.symbola.net/feed/','4','Comunità e welfare culturale','TRUE','','0'],
    ['FN-004','Artribune','https://www.artribune.com','https://www.artribune.com/feed/','3','Programma, mostre e collezioni','TRUE','','0'],
    ['FN-005','Tafter','https://www.tafter.it','https://www.tafter.it/feed/','1','Identità e narrazione museale','TRUE','','0'],
    ['FN-006','Giornale delle Fondazioni','https://www.ilgiornaledellefondazioni.com','https://www.ilgiornaledellefondazioni.com/feed/','4','Comunità e welfare culturale','TRUE','','0'],
    ['FN-007','Fitzcarraldo','https://www.fitzcarraldo.it','https://www.fitzcarraldo.it/feed/','5','Digital, AI e governance','TRUE','','0'],
    ['FN-008','MuseumNext','https://www.museumnext.com','https://www.museumnext.com/feed/','5','Digital, AI e governance','TRUE','','0'],
    ['FN-009','Doppiozero','https://www.doppiozero.com','https://www.doppiozero.com/rss.xml','1','Identità e narrazione museale','TRUE','','0'],
    ['FN-010','Patrimonio ER','https://patrimonioer.regione.emilia-romagna.it','https://patrimonioer.regione.emilia-romagna.it/feed/','3','Programma, mostre e collezioni','TRUE','','0']
  ];

  sh.getRange(2, 1, fontiDefault.length, fontiDefault[0].length).setValues(fontiDefault);
  log.push('  ✅ Fonti: inserite ' + fontiDefault.length + ' fonti istituzionali di default');
}

// ─── HELPER: riordina i tab del foglio ───────────────────────────────────

function _reorderSheets_(SS, order, log) {
  const sheets = SS.getSheets();
  let position = 0;
  for (const name of order) {
    const sh = SS.getSheetByName(name);
    if (sh && !sh.isSheetHidden()) {
      SS.setActiveSheet(sh);
      SS.moveActiveSheet(position + 1);
      position++;
      log.push('  ✅ Tab [' + position + ']: "' + name + '"');
    }
  }
  // Fogli non in ordine vanno alla fine (visibili)
  const allVisible = SS.getSheets().filter(s => !s.isSheetHidden() && !order.includes(s.getName()));
  for (const sh of allVisible) {
    log.push('  ➕ Tab extra (fine): "' + sh.getName() + '"');
  }
}

// ─── FUNZIONI DI DIAGNOSTICA ─────────────────────────────────────────────

/**
 * Stampa nel log il confronto tra fogli presenti e fogli attesi.
 * Esegui prima di runSheetCleanup() per una preview.
 */
function diagnosticaFogli() {
  const SS = getMainSS();
  const attesi = Object.keys(CLEANUP_HEADERS).concat(['Bandi']);
  const presenti = SS.getSheets().map(s => s.getName());

  Logger.log('=== DIAGNOSTICA FOGLI ===');
  Logger.log('Fogli presenti: ' + presenti.join(', '));
  Logger.log('');
  Logger.log('Fogli attesi dal codice:');
  for (const name of attesi) {
    const ok = presenti.includes(name);
    Logger.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
  }
  Logger.log('');
  Logger.log('Fogli presenti NON attesi (potenziali candidati archivio):');
  for (const name of presenti) {
    if (!attesi.includes(name) && !name.startsWith('_OLD_')) {
      Logger.log('  ⚠️  ' + name);
    }
  }
}

// ============================================================================
// v4.19.1 — ARCHIVIA FOGLI OBSOLETI: rinomina con prefisso _OLD_
// ============================================================================

/**
 * Rinomina i fogli obsoleti con prefisso _OLD_ per renderli inutilizzabili
 * dal codice attivo senza eliminarli (i dati restano consultabili).
 * Idempotente: salta fogli già rinominati o non presenti.
 *
 * Fogli archiviati:
 *  - SocialFonti     → migrato a FontiNews
 *  - FontiBandi      → sostituito da FontiBandi_v5
 *  - Podcast_Episodes → fuso in Podcast
 *  - RADAR BANDI     → sostituito da Bandi_v5 (se presente nel foglio principale)
 *  NOTA: 'Fonti' NON archiviato — ancora usato attivamente da scanSources.
 *
 * Eseguire una volta dall'editor GAS dopo il deploy.
 * @return {Object} { ok, rinominati, saltati, dettaglio }
 */
function archiviaFogliObsoleti() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  var ss = getMainSS();
  // NOTA: 'Fonti' NON incluso — ancora usato attivamente da scanSources/getFonti in Codice.js
  var obsoleti = ['SocialFonti', 'FontiBandi', 'Podcast_Episodes', 'RADAR BANDI'];
  var rinominati = 0, saltati = 0;
  var dettaglio = [];

  obsoleti.forEach(function(nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) {
      // Potrebbe essere già rinominato
      var old = ss.getSheetByName('_OLD_' + nome);
      if (old) {
        dettaglio.push(nome + ': già _OLD_');
      } else {
        dettaglio.push(nome + ': non trovato');
      }
      saltati++;
      return;
    }
    try {
      sh.setName('_OLD_' + nome);
      // Colora tab in grigio per distinguerlo
      sh.setTabColor('#999999');
      dettaglio.push(nome + ' → _OLD_' + nome);
      rinominati++;
    } catch(e) {
      dettaglio.push(nome + ': errore ' + e.message);
      saltati++;
    }
  });

  Logger.log('[archiviaFogliObsoleti] Rinominati: ' + rinominati + ', Saltati: ' + saltati);
  dettaglio.forEach(function(d) { Logger.log('  ' + d); });
  return { ok: true, rinominati: rinominati, saltati: saltati, dettaglio: dettaglio };
}

// ============================================================================
// v4.19.1 — DEDUP GIORNALIERO: rimuove duplicati da Items, Podcast, Pubblicazioni
// ============================================================================

/**
 * Check e rimozione duplicati su tutti i fogli principali.
 * Logica: per ogni foglio, confronta URL canonicalizzato + titolo normalizzato.
 * Tiene il record più vecchio (primo inserito), rimuove i successivi.
 * Trigger consigliato: giornaliero 05:00.
 *
 * @return {Object} { ok, report: { items, podcast, libri, bandi } }
 */
function dailyDedupCheck() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  var ss = getMainSS();
  var report = {};

  // 1. Items (news) — dedup per URL canonicalizzato + titolo normalizzato
  report.items = _dedupSheet_(ss, 'Items', 'FonteURL', 'Titolo', 'DataAcquisizione');

  // 2. Podcast (include video VID*) — dedup per Link + Titolo
  report.podcast = _dedupSheet_(ss, 'Podcast', 'Link', 'Titolo', 'DataRilevamento');

  // 3. Pubblicazioni (libri) — dedup per Link + Titolo
  report.libri = _dedupSheet_(ss, 'Pubblicazioni', 'Link', 'Titolo', 'DataAggiunta');

  // 4. Bandi_v5 — dedup per Fingerprint (già robusto, ma verifica)
  report.bandi = _dedupSheet_(ss, 'Bandi_v5', 'UrlBando', 'Titolo', 'DataRilevamento');

  var totale = (report.items.rimossi||0) + (report.podcast.rimossi||0) + (report.libri.rimossi||0) + (report.bandi.rimossi||0);
  Logger.log('[dailyDedupCheck] Completato. Rimossi: ' + totale + ' duplicati. ' + JSON.stringify(report));

  // Notifica Telegram se trovati duplicati
  if (totale > 0 && typeof _tgSend_ === 'function') {
    try {
      var msg = '<b>Dedup giornaliero</b>\n'
        + 'Items: ' + report.items.rimossi + ' rimossi (su ' + report.items.totale + ')\n'
        + 'Podcast: ' + report.podcast.rimossi + ' rimossi (su ' + report.podcast.totale + ')\n'
        + 'Libri: ' + report.libri.rimossi + ' rimossi (su ' + report.libri.totale + ')\n'
        + 'Bandi: ' + report.bandi.rimossi + ' rimossi (su ' + report.bandi.totale + ')';
      _tgSend_(msg);
    } catch(e) {}
  }

  return { ok:true, report:report, totaleRimossi:totale };
}

/**
 * Helper generico: dedup un foglio per URL + titolo.
 * Tiene la riga più vecchia (prima nell'ordine del foglio), rimuove le successive.
 */
function _dedupSheet_(ss, sheetName, urlCol, titleCol, dateCol) {
  var result = { foglio:sheetName, totale:0, duplicatiUrl:0, duplicatiTitolo:0, rimossi:0 };
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return result;

  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iUrl = headers.indexOf(urlCol);
  var iTit = headers.indexOf(titleCol);
  var iDate = headers.indexOf(dateCol);
  if (iUrl === -1 && iTit === -1) return result;

  result.totale = data.length - 1;
  var seenUrls = {};
  var seenTitles = {};
  var rowsToDelete = []; // indici (1-based) da eliminare

  for (var r = 1; r < data.length; r++) {
    var url = (iUrl !== -1) ? _canonDedupUrl_(String(data[r][iUrl]||'')) : '';
    var title = _normTitle_(String(data[r][iTit]||''));
    var dominated = false;

    // Check URL duplicato
    if (url && seenUrls[url]) {
      result.duplicatiUrl++;
      dominated = true;
    }
    // Check titolo duplicato (solo se titolo lungo abbastanza per essere significativo)
    if (!dominated && title.length > 15 && seenTitles[title]) {
      result.duplicatiTitolo++;
      dominated = true;
    }

    if (dominated) {
      rowsToDelete.push(r + 1); // riga 1-based nel foglio
    } else {
      if (url) seenUrls[url] = true;
      if (title.length > 15) seenTitles[title] = true;
    }
  }

  // Elimina righe dal basso verso l'alto (per non spostare gli indici)
  if (rowsToDelete.length > 0) {
    rowsToDelete.sort(function(a,b){ return b - a; });
    for (var d = 0; d < rowsToDelete.length; d++) {
      sh.deleteRow(rowsToDelete[d]);
      if (d % 20 === 0) Utilities.sleep(100); // evita timeout
    }
    result.rimossi = rowsToDelete.length;
  }

  return result;
}

/**
 * Normalizza URL per dedup (riusa _canonicalUrl_ se disponibile, altrimenti versione light).
 */
function _canonDedupUrl_(url) {
  if (!url) return '';
  if (typeof _canonicalUrl_ === 'function') return _canonicalUrl_(url);
  return String(url).trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '')
    .replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '');
}

/**
 * Normalizza titolo per dedup: lowercase, rimuove punteggiatura, spazi multipli.
 */
function _normTitle_(t) {
  if (!t) return '';
  return String(t).trim().toLowerCase()
    .replace(/[^\w\sàáâãäåèéêëìíîïòóôõöùúûüñç]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// v4.19.1 — Trigger rimosso: dailyDedupCheck integrato in sasRun (giornaliero 04:30)
// Non serve trigger dedicato — viene chiamato come step MA3 del supervisore.
