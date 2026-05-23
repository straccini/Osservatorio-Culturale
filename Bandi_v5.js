// ============================================================================
// BANDI v5.0 - Modulo unificato monitoraggio bandi
// ----------------------------------------------------------------------------
// Sostituisce Scannerbandi.gs (resta in parallelo come fallback durante sviluppo)
// Architettura: Fonti come tabella unica gestita da UI admin
// Parser dedicati per tipo (RSS / HTML / Sitemap / Gmail)
// Stato fonti vivo + auto-disattivazione dopo 3 fail consecutivi
// Validazione URL bandi via HEAD check prima di salvare
// Deduplica via fingerprint hash robusto
// ----------------------------------------------------------------------------
// Osservatorio Culturale - Duemilamusei / Silvano Straccini
// Sprint Bandi v5.0 - 2026-05-04
// ============================================================================

// ============================================================================
// COSTANTI MODULO
// ============================================================================

var BANDI_V5_FLAG_PROP = 'USE_BANDI_V5';   // Properties Service flag per switchover
var BANDI_V5_VERSION = 'v5.0.0-dev';

var SH_FONTI_V5    = 'FontiBandi_v5';   // Tabella unica fonti (gestita da UI admin)
var SH_BANDI_V5    = 'Bandi_v5';        // Foglio bandi con schema esteso
var SH_FONTI_LOG   = 'FontiBandiLog_v5'; // Storico esiti scan per audit
var SH_BACKUP_INFO = 'BackupInfo_v5';   // Info dei backup creati

// Tipi parser supportati
var PARSER_TYPES = ['RSS', 'HTML', 'Sitemap', 'Gmail'];

// Esiti scansione
var SCAN_OUTCOME = {
  OK:         'OK',
  HTTP_ERR:   'HTTP_ERR',     // status code != 200
  EMPTY:      'EMPTY',        // pagina vuota o < 200 chars utili
  PARSE_ERR:  'PARSE_ERR',    // Claude API o XML parse fallito
  NETWORK:    'NETWORK',      // UrlFetch exception
  DISABLED:   'DISABLED'      // fonte disattivata, scan saltato
};

// Soglia auto-disattivazione fonti
var FAIL_SOGLIA_DISATTIVAZIONE = 3;

// Schema colonne FontiBandi_v5 (1-indexed per Sheets) — allineato FU17 (v4.18.52 fix)
// Migration FU17 ha aggiunto colonna 'Tag' in pos 5 → shift +1 dalle successive.
// URL_ENTE e NOTE (legacy) ora finiscono in EXTRAS_JSON (col 18) — alias mantenuti
// per backward-compat scritture occasionali (sovrascrivono extras_json: bug noto, low-impact).
var COL_F = {
  ID:                 1,
  NOME:               2,
  URL:                3,
  TIPO:               4,   // RSS|HTML|Sitemap|YouTube|Gmail
  TAG:                5,   // ★ NUOVO FU17 — istituzionale|editoriale|audio|video|settoriale
  CATEGORIA:          6,   // Ministero|Regione|UE|Aggregatore|Fondazione|Rivista|Associazione
  PRIORITA:           7,   // 1=alta|2=media|3=bassa
  ATTIVA:             8,   // boolean
  DATA_AGGIUNTA:      9,
  ULTIMA_SCANSIONE:   10,  // = UltimaScan in FU17
  ULTIMO_ESITO:       11,
  N_BANDI_TOTALI:     12,  // = NRecordTotali in FU17
  N_BANDI_ULTIMO:     13,  // = NRecordUltimo in FU17
  FAIL_CONSECUTIVI:   14,
  ULTIMO_ERRORE:      15,
  ENTE_DEFAULT:       16,
  LIVELLO:            17,
  EXTRAS_JSON:        18,  // ★ NUOVO FU17 — contiene legacy urlente, note serializzati
  // Legacy aliases (deprecated, scritture sovrascrivono extras_json: rifattorizzare in futuro)
  URL_ENTE:           18,
  NOTE:               18
};

var COL_F_HEADERS = [
  'ID','Nome','URL','Tipo','Tag','Categoria','Priorita','Attiva',
  'DataAggiunta','UltimaScan','UltimoEsito',
  'NRecordTotali','NRecordUltimo','FailConsecutivi',
  'UltimoErrore','EnteDefault','Livello','extras_json'
];

// Schema colonne Bandi_v5 (1-indexed)
var COL_B = {
  ID:                 1,
  FINGERPRINT:        2,
  DATA_RILEVAMENTO:   3,
  TITOLO:             4,
  ENTE:               5,
  LIVELLO:            6,
  REGIONE:            7,
  SETTORE:            8,
  SOGGETTI:           9,
  IMPORTO:            10,
  COFIN:              11,
  SCADENZA:           12,
  FONTE_ID:           13,
  FONTE_NOME:         14,
  URL_BANDO:          15,
  URL_ENTE:           16,
  URL_VALIDATO:       17,    // boolean
  DATA_VALIDAZIONE:   18,
  SOMMARIO:           19,
  AMBITO:             20,    // 1-5
  PRIORITA_REGIONALE: 21,
  STATUS:             22,    // Nuovo|InCorso|Inviato|Vinto|Perso
  STATO_RECORD:       23,    // attivo|archiviato
  LETTO:              24,    // boolean
  SALVATO:            25,    // boolean
  NOTE:               26
};

var COL_B_HEADERS = [
  'ID','Fingerprint','DataRilevamento','Titolo','Ente','Livello','Regione','Settore','Soggetti',
  'Importo','Cofin','Scadenza','FonteID','FonteNome','UrlBando','UrlEnte','UrlValidato','DataValidazione',
  'Sommario','Ambito','PrioritaRegionale','Status','StatoRecord','Letto','Salvato','Note'
];

// Schema colonne FontiBandiLog_v5
var COL_L = {
  TIMESTAMP:    1,
  FONTE_ID:     2,
  FONTE_NOME:   3,
  ESITO:        4,
  N_BANDI:      5,
  ERROR_MSG:    6,
  DURATION_MS:  7
};

var COL_L_HEADERS = ['Timestamp','FonteID','FonteNome','Esito','NBandi','ErrorMessage','DurationMs'];


// ============================================================================
// FASE 1.A - BACKUP FOGLIO PRINCIPALE
// ----------------------------------------------------------------------------
// LANCIA QUESTA FUNZIONE PRIMA DI QUALSIASI MIGRAZIONE.
// Crea una copia datata del foglio principale Osservatorio Culturale.
// Salva URL del backup in foglio BackupInfo_v5 per riferimento.
// ============================================================================

function backupFoglioV4() {
  var startTime = new Date().getTime();
  Logger.log('================================================================');
  Logger.log('BACKUP FOGLIO PRINCIPALE - pre-Bandi v5.0');
  Logger.log('================================================================');

  var report = { ok: true, backupUrl: '', backupId: '', errors: [] };

  try {
    var ssMain = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    if (!ssMain) {
      report.ok = false;
      report.errors.push('Foglio principale non trovato');
      return report;
    }

    var fileMain = DriveApp.getFileById(ssMain.getId());
    var nomeOriginale = fileMain.getName();
    var oggi = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd_HHmm');
    var nomeBackup = '[BACKUP pre-v5.0] ' + nomeOriginale + ' - ' + oggi;

    Logger.log('Creo copia: ' + nomeBackup);
    var fileBackup = fileMain.makeCopy(nomeBackup);
    var idBackup = fileBackup.getId();
    var urlBackup = 'https://docs.google.com/spreadsheets/d/' + idBackup + '/edit';

    report.backupUrl = urlBackup;
    report.backupId = idBackup;

    // Registra il backup in foglio dedicato
    try {
      var shInfo = ssMain.getSheetByName(SH_BACKUP_INFO);
      if (!shInfo) {
        shInfo = ssMain.insertSheet(SH_BACKUP_INFO);
        shInfo.getRange(1, 1, 1, 4).setValues([['Timestamp','NomeBackup','BackupURL','Note']]);
        shInfo.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#E5E1D8');
      }
      shInfo.appendRow([new Date(), nomeBackup, urlBackup, 'Backup automatico pre-Bandi v5.0']);
    } catch(e) {
      Logger.log('  ! Impossibile registrare in BackupInfo_v5: ' + e.message);
    }

    var elapsed = Math.round((new Date().getTime() - startTime) / 1000);
    Logger.log('================================================================');
    Logger.log('BACKUP COMPLETATO in ' + elapsed + ' sec');
    Logger.log('Nome: ' + nomeBackup);
    Logger.log('URL:  ' + urlBackup);
    Logger.log('================================================================');
    Logger.log('IMPORTANTE: apri il backup e verifica che sia integro');
    Logger.log('PROSSIMO STEP: lancia setupBandiV5Schema() per creare i 3 fogli nuovi');
    Logger.log('================================================================');

  } catch(e) {
    Logger.log('ERR backup: ' + e.message);
    report.ok = false;
    report.errors.push(e.message);
  }

  return report;
}

// ============================================================================
// FASE 1.B - SETUP SCHEMA FOGLI v5
// ----------------------------------------------------------------------------
// Crea i 3 fogli nuovi: FontiBandi_v5, Bandi_v5, FontiBandiLog_v5
// Idempotente: se esistono gia', non fa nulla. Se mancano, li crea con headers.
// NON tocca i fogli esistenti (RADAR BANDI, FontiBandi vecchio).
// ============================================================================

function setupBandiV5Schema() {
  Logger.log('================================================================');
  Logger.log('SETUP SCHEMA BANDI v5.0');
  Logger.log('================================================================');

  var report = { ok: true, fogli: {}, errors: [] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Foglio principale non disponibile');

    // === Foglio FontiBandi_v5 ===
    var shF = ss.getSheetByName(SH_FONTI_V5);
    if (!shF) {
      shF = ss.insertSheet(SH_FONTI_V5);
      shF.getRange(1, 1, 1, COL_F_HEADERS.length).setValues([COL_F_HEADERS]);
      shF.getRange(1, 1, 1, COL_F_HEADERS.length)
         .setFontWeight('bold').setBackground('#7A2A1A').setFontColor('#fff');
      shF.setFrozenRows(1);
      shF.setColumnWidth(COL_F.URL, 320);
      shF.setColumnWidth(COL_F.NOME, 220);
      shF.setColumnWidth(COL_F.ULTIMO_ERRORE, 280);
      shF.setColumnWidth(COL_F.NOTE, 220);
      report.fogli.FontiBandi_v5 = 'CREATO con ' + COL_F_HEADERS.length + ' colonne';
      Logger.log('OK creato foglio: ' + SH_FONTI_V5);
    } else {
      report.fogli.FontiBandi_v5 = 'GIA ESISTE (' + shF.getLastRow() + ' righe)';
      Logger.log('-> ' + SH_FONTI_V5 + ' gia esistente');
    }

    // === Foglio Bandi_v5 ===
    var shB = ss.getSheetByName(SH_BANDI_V5);
    if (!shB) {
      shB = ss.insertSheet(SH_BANDI_V5);
      shB.getRange(1, 1, 1, COL_B_HEADERS.length).setValues([COL_B_HEADERS]);
      shB.getRange(1, 1, 1, COL_B_HEADERS.length)
         .setFontWeight('bold').setBackground('#1A1815').setFontColor('#fff');
      shB.setFrozenRows(1);
      shB.setColumnWidth(COL_B.TITOLO, 320);
      shB.setColumnWidth(COL_B.URL_BANDO, 280);
      shB.setColumnWidth(COL_B.SOMMARIO, 280);
      report.fogli.Bandi_v5 = 'CREATO con ' + COL_B_HEADERS.length + ' colonne';
      Logger.log('OK creato foglio: ' + SH_BANDI_V5);
    } else {
      report.fogli.Bandi_v5 = 'GIA ESISTE (' + shB.getLastRow() + ' righe)';
      Logger.log('-> ' + SH_BANDI_V5 + ' gia esistente');
    }

    // === Foglio FontiBandiLog_v5 ===
    var shL = ss.getSheetByName(SH_FONTI_LOG);
    if (!shL) {
      shL = ss.insertSheet(SH_FONTI_LOG);
      shL.getRange(1, 1, 1, COL_L_HEADERS.length).setValues([COL_L_HEADERS]);
      shL.getRange(1, 1, 1, COL_L_HEADERS.length)
         .setFontWeight('bold').setBackground('#3F7A5E').setFontColor('#fff');
      shL.setFrozenRows(1);
      report.fogli.FontiBandiLog_v5 = 'CREATO con ' + COL_L_HEADERS.length + ' colonne';
      Logger.log('OK creato foglio: ' + SH_FONTI_LOG);
    } else {
      report.fogli.FontiBandiLog_v5 = 'GIA ESISTE (' + shL.getLastRow() + ' righe)';
      Logger.log('-> ' + SH_FONTI_LOG + ' gia esistente');
    }

    Logger.log('================================================================');
    Logger.log('SCHEMA OK: 3 fogli pronti per Bandi v5.0');
    Logger.log('PROSSIMO STEP: lancia seedFontiV5() per importare le 41 fonti');
    Logger.log('================================================================');

  } catch(e) {
    Logger.log('ERR setup schema: ' + e.message);
    report.ok = false;
    report.errors.push(e.message);
  }

  return report;
}


// ============================================================================
// FASE 1.C - SEED FONTI v5 (importa le 41 fonti dal vecchio Scannerbandi.gs)
// ----------------------------------------------------------------------------
// Importa nel foglio FontiBandi_v5 le fonti definite in TUTTE_LE_FONTI_BANDI
// (Scannerbandi.gs vecchio). Le classifica per Tipo (HTML default per ora,
// poi fase 2 setteremo RSS dove rilevato).
// Idempotente: skip se ID fonte gia presente.
// ============================================================================

function seedFontiV5() {
  Logger.log('================================================================');
  Logger.log('SEED FONTI v5.0 - importazione dalle 41 fonti hardcoded');
  Logger.log('================================================================');

  var report = { ok: true, importate: 0, saltate: 0, errors: [] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shF = ss.getSheetByName(SH_FONTI_V5);
    if (!shF) throw new Error('FontiBandi_v5 non esiste. Lancia setupBandiV5Schema() prima.');

    if (typeof TUTTE_LE_FONTI_BANDI === 'undefined') {
      throw new Error('TUTTE_LE_FONTI_BANDI non definito (manca Scannerbandi.gs?)');
    }

    // Indice ID gia presenti (idempotenza)
    var rowsExisting = shF.getDataRange().getValues();
    var idsEsistenti = {};
    for (var i = 1; i < rowsExisting.length; i++) {
      if (rowsExisting[i][COL_F.ID - 1]) idsEsistenti[rowsExisting[i][COL_F.ID - 1]] = true;
    }

    // Genera ID stabile da nome fonte (slug)
    function makeId(nome) {
      return 'f_' + nome.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 50);
    }

    // Determina categoria dal livello/contesto
    function classificaCategoria(fonte) {
      var nome = (fonte.nome || '').toLowerCase();
      if (nome.indexOf('mic') >= 0 || nome.indexOf('ministero') >= 0 || nome.indexOf('anci') >= 0 || nome.indexOf('italia domani') >= 0 || nome.indexOf('invitalia') >= 0) return 'Ministero';
      if (nome.indexOf('regione') >= 0 || nome.indexOf('puglia') >= 0 || nome.indexOf('marche') >= 0 || nome.indexOf('umbria') >= 0 || nome.indexOf('sardegna') >= 0 || nome.indexOf('emilia') >= 0 || nome.indexOf('art-er') >= 0) return 'Regione';
      if (fonte.livello === 'EU' || nome.indexOf('europa') >= 0 || nome.indexOf('european') >= 0 || nome.indexOf('nemo') >= 0) return 'UE';
      if (fonte.livello === 'Fondazione' || nome.indexOf('fondazione') >= 0 || nome.indexOf('cariplo') >= 0 || nome.indexOf('san paolo') >= 0 || nome.indexOf('symbola') >= 0 || nome.indexOf('fitzcarraldo') >= 0) return 'Fondazione';
      if (fonte.livello === 'Rivista' || nome.indexOf('artribune') >= 0 || nome.indexOf('tafter') >= 0 || nome.indexOf('giornale') >= 0) return 'Rivista';
      if (fonte.livello === 'Associazione' || nome.indexOf('icom') >= 0 || nome.indexOf('federculture') >= 0 || nome.indexOf('mab') >= 0 || nome.indexOf('amaci') >= 0) return 'Associazione';
      return 'Aggregatore';
    }

    // Determina tipo parser (default HTML, RSS se URL contiene /feed o /rss)
    function determinaTipo(url) {
      var u = (url || '').toLowerCase();
      if (u.indexOf('/feed') >= 0 || u.indexOf('/rss') >= 0 || u.indexOf('feed.xml') >= 0) return 'RSS';
      if (u.indexOf('sitemap') >= 0) return 'Sitemap';
      return 'HTML';
    }

    var oggi = new Date();
    TUTTE_LE_FONTI_BANDI.forEach(function(fonte) {
      var id = makeId(fonte.nome);
      if (idsEsistenti[id]) {
        report.saltate++;
        return;
      }
      var riga = new Array(COL_F_HEADERS.length).fill('');
      riga[COL_F.ID - 1]               = id;
      riga[COL_F.NOME - 1]             = fonte.nome;
      riga[COL_F.URL - 1]              = fonte.url;
      riga[COL_F.TIPO - 1]             = determinaTipo(fonte.url);
      riga[COL_F.CATEGORIA - 1]        = classificaCategoria(fonte);
      riga[COL_F.PRIORITA - 1]         = fonte.priorita || 2;
      riga[COL_F.ATTIVA - 1]           = true;
      riga[COL_F.DATA_AGGIUNTA - 1]    = oggi;
      riga[COL_F.ULTIMA_SCANSIONE - 1] = '';
      riga[COL_F.ULTIMO_ESITO - 1]     = '';
      riga[COL_F.N_BANDI_TOTALI - 1]   = 0;
      riga[COL_F.N_BANDI_ULTIMO - 1]   = 0;
      riga[COL_F.FAIL_CONSECUTIVI - 1] = 0;
      riga[COL_F.ULTIMO_ERRORE - 1]    = '';
      riga[COL_F.ENTE_DEFAULT - 1]     = fonte.ente_default || '';
      riga[COL_F.URL_ENTE - 1]         = fonte.url_ente || '';
      riga[COL_F.LIVELLO - 1]          = fonte.livello || 'Vari';
      riga[COL_F.NOTE - 1]             = '';
      shF.appendRow(riga);
      report.importate++;
      idsEsistenti[id] = true;
    });

    Logger.log('Fonti importate: ' + report.importate + ' / saltate (gia presenti): ' + report.saltate);
    Logger.log('================================================================');
    Logger.log('SEED COMPLETATO');
    Logger.log('PROSSIMO STEP: apri foglio FontiBandi_v5 e verifica che la lista sia corretta');
    Logger.log('Quindi possiamo procedere con FASE 2 (parser + scanFontiTutte)');
    Logger.log('================================================================');

  } catch(e) {
    Logger.log('ERR seed: ' + e.message);
    report.ok = false;
    report.errors.push(e.message);
  }

  return report;
}


// ============================================================================
// HELPERS GENERICI v5 (usati da tutto il modulo)
// ============================================================================

/**
 * Restituisce true se la flag USE_BANDI_V5 e' attiva nelle Properties.
 * Permette switchover sicuro tra vecchio Scannerbandi e nuovo Bandi_v5.
 */
function isBandiV5Active() {
  try {
    var p = PropertiesService.getScriptProperties().getProperty(BANDI_V5_FLAG_PROP);
    return (p === 'true' || p === '1');
  } catch(e) { return false; }
}

/**
 * Imposta la flag di switchover a Bandi v5.
 */
function enableBandiV5() {
  PropertiesService.getScriptProperties().setProperty(BANDI_V5_FLAG_PROP, 'true');
  Logger.log('Flag USE_BANDI_V5 = true');
}

function disableBandiV5() {
  PropertiesService.getScriptProperties().setProperty(BANDI_V5_FLAG_PROP, 'false');
  Logger.log('Flag USE_BANDI_V5 = false (rollback a Scannerbandi v4)');
}

/**
 * Restituisce la versione attuale del modulo Bandi v5.
 */
function getBandiV5Version() {
  return BANDI_V5_VERSION;
}


// ============================================================================
// RUNNER FASE 1 - Esecutore unico delle 3 operazioni FASE 1 in sequenza
// ----------------------------------------------------------------------------
// LANCIA QUESTA per fare backup + setup schema + seed fonti in un colpo solo.
// Si ferma se una operazione fallisce. Restituisce report unificato.
// ============================================================================

function runFase1Setup() {
  Logger.log('################################################################');
  Logger.log('RUNNER FASE 1 - Setup completo Bandi v5.0');
  Logger.log('################################################################');

  var reportTotale = { ok: true, fasi: {}, errors: [] };

  // === Step 1/3: Backup ===
  Logger.log('\n>>> STEP 1/3: BACKUP FOGLIO PRINCIPALE');
  try {
    var r1 = backupFoglioV4();
    reportTotale.fasi['1_backup'] = r1;
    if (!r1.ok) {
      reportTotale.ok = false;
      reportTotale.errors.push('Backup fallito: ' + r1.errors.join(', '));
      Logger.log('!!! STEP 1 FALLITO - mi fermo qui');
      return reportTotale;
    }
  } catch(e) {
    reportTotale.ok = false;
    reportTotale.errors.push('Backup eccezione: ' + e.message);
    Logger.log('!!! STEP 1 ECCEZIONE - mi fermo qui');
    return reportTotale;
  }

  // === Step 2/3: Setup schema fogli ===
  Logger.log('\n>>> STEP 2/3: SETUP SCHEMA 3 FOGLI v5');
  try {
    var r2 = setupBandiV5Schema();
    reportTotale.fasi['2_schema'] = r2;
    if (!r2.ok) {
      reportTotale.ok = false;
      reportTotale.errors.push('Setup schema fallito: ' + r2.errors.join(', '));
      Logger.log('!!! STEP 2 FALLITO');
      return reportTotale;
    }
  } catch(e) {
    reportTotale.ok = false;
    reportTotale.errors.push('Schema eccezione: ' + e.message);
    return reportTotale;
  }

  // === Step 3/3: Seed fonti ===
  Logger.log('\n>>> STEP 3/3: SEED 41 FONTI in FontiBandi_v5');
  try {
    var r3 = seedFontiV5();
    reportTotale.fasi['3_seed'] = r3;
    if (!r3.ok) {
      reportTotale.ok = false;
      reportTotale.errors.push('Seed fallito: ' + r3.errors.join(', '));
      return reportTotale;
    }
  } catch(e) {
    reportTotale.ok = false;
    reportTotale.errors.push('Seed eccezione: ' + e.message);
    return reportTotale;
  }

  Logger.log('################################################################');
  Logger.log('FASE 1 COMPLETATA OK');
  Logger.log('  - Backup:      ' + (reportTotale.fasi['1_backup'].backupUrl || ''));
  Logger.log('  - Fogli nuovi: ' + JSON.stringify(reportTotale.fasi['2_schema'].fogli));
  Logger.log('  - Fonti seed:  ' + reportTotale.fasi['3_seed'].importate + ' importate, ' + reportTotale.fasi['3_seed'].saltate + ' gia presenti');
  Logger.log('################################################################');
  Logger.log('PROSSIMO STEP: dimmi OK e io parto con FASE 2 (parser + scanner)');
  Logger.log('################################################################');

  return reportTotale;
}


// ============================================================================
// MENU PERSONALIZZATO GOOGLE SHEETS
// ----------------------------------------------------------------------------
// Aggiunge una voce "Bandi v5.0" al menu del Google Sheet principale.
// Cosi puoi lanciare tutte le operazioni dal foglio, senza aprire l'editor GAS.
// onOpen() viene chiamato automaticamente da Google Sheets all'apertura.
// ============================================================================

// [onOpen definitivo — vedi in fondo al file]

/**
 * Helper menu: mostra versione modulo in alert.
 */
function mostraBandiV5Version() {
  try {
    SpreadsheetApp.getUi().alert('Bandi v5.0 - versione modulo', getBandiV5Version() + '\n\n3 fogli gestiti:\n - ' + SH_FONTI_V5 + '\n - ' + SH_BANDI_V5 + '\n - ' + SH_FONTI_LOG, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch(e) { Logger.log(e.message); }
}

// v4.18.38 (audit 2026-05-14) — Rimossa mostraBandiV5Flag(): debug helper Properties Service
//   mai chiamato. Per ispezionare il flag usare direttamente isBandiV5Active() da editor GAS.


// ============================================================================
// FASE 2 - PARSER + SCANNER FONTI
// ----------------------------------------------------------------------------
// Funzioni:
//   _makeFingerprintV5_   — fingerprint stabile per deduplicazione
//   _pulisciHtmlV5_       — pulizia HTML prima di Claude
//   _estraiConClaudeV5_   — chiamata Claude API (estrazione bandi da testo)
//   _parseFonteRSS_       — parser feed RSS/Atom via XmlService
//   _parseFonteHTML_      — parser pagina HTML via Claude API
//   _parseFonteSitemap_   — parser sitemap.xml
//   _saveBandoV5_         — salva bando con deduplica su Bandi_v5
//   _logScanV5_           — appende riga log a FontiBandiLog_v5
//   _updateFonteStatoV5_  — aggiorna stato + contatori della fonte
//   scanFonteSingola      — scansiona una fonte (pubblica, per test)
//   scanFontiTutte        — scansiona tutte le fonti attive in sequenza
//   runFase2Test          — test su prime 3 fonti priorita=1
// ============================================================================


// ─── HELPER: fingerprint stabile (SHA-256 troncato) ───────────────────────

function _makeFingerprintV5_(titolo, urlBando) {
  var raw = (titolo || '').toLowerCase().trim().replace(/\s+/g, ' ')
          + '|' + (urlBando || '').toLowerCase().trim().replace(/\/$/, '');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
              raw, Utilities.Charset.UTF_8);
  return bytes.slice(0, 12).map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}


// ─── HELPER: pulizia HTML per Claude ─────────────────────────────────────

function _pulisciHtmlV5_(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 12000);   // limite sicuro per Claude
}


// ─── HELPER: chiamata Claude API per estrazione bandi ─────────────────────

/**
 * v4.18.68 — Pipeline doppio passaggio per estrazione bandi strutturati.
 *
 * Pass 1 (Haiku, filtro rumore): verifica se il testo contiene bandi reali.
 * Pass 2 (Sonnet, estrazione): schema JSON rigido con campi tipizzati.
 * Retry con backoff esponenziale (max 2 tentativi). Fallback grezzo se fallisce.
 */
function _estraiConClaudeV5_(testoHtml, urlFonte, enteDefault) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(ANTHROPIC_KEY_PROP);
  if (!apiKey) throw new Error('CLAUDE_API_KEY non configurata in ScriptProperties');

  // ── PASS 1: Filtro rumore (Haiku, veloce ed economico) ──
  var filterPrompt = 'Analizza questo testo estratto da: ' + urlFonte + '\n\n' +
    '--- TESTO ---\n' + testoHtml.slice(0, 6000) + '\n--- FINE ---\n\n' +
    'Questo testo contiene bandi, avvisi pubblici, finanziamenti o agevolazioni attive per enti culturali, musei o turismo? ' +
    'Rispondi SOLO con: {"rilevante": true, "motivo": "breve spiegazione"} oppure {"rilevante": false, "motivo": "breve spiegazione"}';

  var filterResult = _claudeApiCall_(apiKey, 'claude-haiku-4-5-20251001', filterPrompt, 256, 2);
  if (filterResult.fallback) {
    // API fallita anche dopo retry: salva grezzo
    return [_bandoGrezzo_(testoHtml, urlFonte, enteDefault, 'filter_api_fail')];
  }

  var filterJson = _cleanParseJson_(filterResult.text);
  if (filterJson && filterJson.rilevante === false) {
    Logger.log('Pass 1 SKIP (non rilevante): ' + urlFonte + ' — ' + (filterJson.motivo || ''));
    return [];
  }

  // ── PASS 2: Estrazione dettagliata (Sonnet, schema rigido) ──
  var extractPrompt = 'Sei un assistente specializzato nel monitoraggio di bandi e finanziamenti per musei, enti culturali e turismo.\n\n' +
    'Analizza questo testo dalla pagina: ' + urlFonte + '\n\n' +
    '--- TESTO ---\n' + testoHtml + '\n--- FINE TESTO ---\n\n' +
    'Estrai TUTTI i bandi, avvisi, finanziamenti presenti. Per ogni bando restituisci un oggetto JSON con ESATTAMENTE questi campi e tipi:\n' +
    '{\n' +
    '  "titolo": "string — titolo completo del bando",\n' +
    '  "ente": "string — ente erogatore (usa \'' + enteDefault + '\' se non specificato)",\n' +
    '  "livello": "string — Nazionale|Regionale|EU|Fondazione|Vari",\n' +
    '  "regione": "string — regione se pertinente, altrimenti stringa vuota",\n' +
    '  "settore": "string — settore tematico",\n' +
    '  "soggetti": "string — chi puo partecipare",\n' +
    '  "importo": "string — importo massimo in euro se indicato, altrimenti stringa vuota",\n' +
    '  "scadenza": "string — data scadenza YYYY-MM-DD, altrimenti stringa vuota",\n' +
    '  "urlBando": "string — URL diretto completo al bando",\n' +
    '  "sommario": "string — descrizione sintetica in 2-3 frasi",\n' +
    '  "dotazione_finanziaria": "number o null — dotazione totale in euro",\n' +
    '  "contributo_massimo": "number o null — contributo max per beneficiario",\n' +
    '  "intensita_aiuto": "string — es. 80%, altrimenti stringa vuota",\n' +
    '  "territorio": "string — Nazionale o singola regione",\n' +
    '  "beneficiari_ammessi": ["array di stringhe — es. Comuni, Musei Pubblici, Imprese"],\n' +
    '  "rischi_bando": ["array di stringhe — clausole critiche: fideiussione, non retroattivita, cofinanziamento, etc."]\n' +
    '}\n\n' +
    'REGOLE:\n' +
    '- La scadenza DEVE essere in formato YYYY-MM-DD (es. 2026-07-31). Se non e chiara, stringa vuota.\n' +
    '- dotazione_finanziaria e contributo_massimo sono numeri (senza simbolo euro). null se non indicati.\n' +
    '- beneficiari_ammessi e rischi_bando sono array di stringhe. Array vuoto [] se non presenti.\n' +
    '- Rispondi SOLO con un array JSON valido: [{...}]. Se non trovi bandi, rispondi con [].';

  var extractResult = _claudeApiCall_(apiKey, 'claude-sonnet-4-6', extractPrompt, 8192, 2);
  if (extractResult.fallback) {
    return [_bandoGrezzo_(testoHtml, urlFonte, enteDefault, 'extract_api_fail')];
  }

  var bandi = _cleanParseJsonArray_(extractResult.text);
  if (!bandi || !bandi.length) return [];

  // Validazione e normalizzazione campi
  return bandi.map(function(b) {
    // Valida scadenza formato YYYY-MM-DD
    if (b.scadenza && !/^\d{4}-\d{2}-\d{2}$/.test(b.scadenza)) {
      b.scadenza = _normalizzaData_(b.scadenza);
    }
    // Assicura tipi corretti
    b.dotazione_finanziaria = (typeof b.dotazione_finanziaria === 'number') ? b.dotazione_finanziaria : null;
    b.contributo_massimo = (typeof b.contributo_massimo === 'number') ? b.contributo_massimo : null;
    b.intensita_aiuto = String(b.intensita_aiuto || '');
    b.territorio = String(b.territorio || b.regione || '');
    b.beneficiari_ammessi = Array.isArray(b.beneficiari_ammessi) ? b.beneficiari_ammessi : [];
    b.rischi_bando = Array.isArray(b.rischi_bando) ? b.rischi_bando : [];
    // v4.18.68 — Triage PNRR automatico
    if (typeof verificaETracciaStatoPNRR === 'function') {
      try { verificaETracciaStatoPNRR(b); } catch(_){}
    }
    return b;
  });
}

/**
 * Chiamata Claude API con retry e backoff esponenziale.
 * @return {Object} {text, fallback:boolean}
 */
function _claudeApiCall_(apiKey, model, prompt, maxTokens, maxRetry) {
  for (var attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      if (attempt > 0) {
        Utilities.sleep(Math.pow(2, attempt) * 1000); // 2s, 4s backoff
      }
      var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        payload: JSON.stringify({ model: model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
        muteHttpExceptions: true
      });
      var code = resp.getResponseCode();
      if (code === 200) {
        var body = JSON.parse(resp.getContentText());
        var text = (body.content && body.content[0]) ? body.content[0].text : '';
        return { text: text, fallback: false };
      }
      // Rate limit o server error: retry
      if (code === 429 || code >= 500) {
        Logger.log('Claude API ' + model + ' HTTP ' + code + ' (attempt ' + (attempt+1) + '/' + (maxRetry+1) + ')');
        continue;
      }
      // Client error (400, 401, 403): non ritentare
      Logger.log('Claude API ' + model + ' HTTP ' + code + ' (non retryable): ' + resp.getContentText().slice(0, 200));
      return { text: '', fallback: true };
    } catch(e) {
      Logger.log('Claude API ' + model + ' NETWORK error (attempt ' + (attempt+1) + '): ' + e.message);
      if (attempt === maxRetry) return { text: '', fallback: true };
    }
  }
  return { text: '', fallback: true };
}

/**
 * Pulisce markdown code blocks e parsa JSON.
 */
function _cleanParseJson_(text) {
  if (!text) return null;
  var clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch(_){}
  // Fallback: cerca primo { ... }
  var m = clean.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch(_){} }
  return null;
}

function _cleanParseJsonArray_(text) {
  if (!text) return [];
  var clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch(_){}
  var m = clean.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch(_){} }
  return [];
}

/**
 * Record grezzo di fallback: salva comunque il bando contrassegnato per elaborazione manuale.
 */
function _bandoGrezzo_(testoHtml, urlFonte, enteDefault, motivo) {
  var titolo = testoHtml.slice(0, 120).replace(/[\n\r]+/g, ' ').trim();
  return {
    titolo: '[DA ELABORARE] ' + titolo,
    ente: enteDefault || '',
    livello: 'Vari',
    regione: '',
    settore: '',
    soggetti: '',
    importo: '',
    scadenza: '',
    urlBando: urlFonte,
    sommario: 'Estrazione automatica fallita (' + motivo + '). Richiede elaborazione manuale.',
    dotazione_finanziaria: null,
    contributo_massimo: null,
    intensita_aiuto: '',
    territorio: '',
    beneficiari_ammessi: [],
    rischi_bando: []
  };
}

/**
 * Normalizza date in formato YYYY-MM-DD.
 */
function _normalizzaData_(input) {
  if (!input) return '';
  var s = String(input).trim();
  // GG/MM/AAAA → YYYY-MM-DD
  var m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m1) return m1[3] + '-' + m1[2].padStart(2,'0') + '-' + m1[1].padStart(2,'0');
  // AAAA-MM-GG gia ok
  var m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;
  return '';
}


// ─── PARSER RSS ──────────────────────────────────────────────────────────

function _parseFonteRSS_(fonte) {
  var risultati = [];
  var resp = UrlFetchApp.fetch(fonte.url, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());

  var xml;
  try { xml = XmlService.parse(resp.getContentText()); } catch(e) { throw new Error('XML parse: ' + e.message); }

  var root = xml.getRootElement();
  var ns = root.getNamespace();
  var items = [];

  // RSS 2.0
  var channel = root.getChild('channel', ns) || root.getChild('channel');
  if (channel) {
    items = channel.getChildren('item') || [];
  }
  // Atom
  if (items.length === 0) {
    var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
    items = root.getChildren('entry', atomNs);
    if (items.length === 0) items = root.getChildren('entry');
  }

  items.slice(0, 30).forEach(function(item) {
    var titolo = _xmlText_(item, 'title') || _xmlText_(item, 'title', XmlService.getNamespace('http://www.w3.org/2005/Atom'));
    var link   = _xmlText_(item, 'link')  || _xmlText_(item, 'link',  XmlService.getNamespace('http://www.w3.org/2005/Atom'));
    var descr  = _xmlText_(item, 'description') || _xmlText_(item, 'summary') || '';
    var pubDate= _xmlText_(item, 'pubDate') || _xmlText_(item, 'published') || _xmlText_(item, 'updated') || '';

    if (!titolo || !link) return;
    risultati.push({
      titolo:   titolo.trim(),
      ente:     fonte.ente_default || '',
      livello:  fonte.livello || 'Vari',
      regione:  '',
      settore:  'Cultura e beni culturali',
      soggetti: '',
      importo:  '',
      scadenza: '',
      urlBando: link.trim(),
      sommario: _pulisciHtmlV5_(descr).slice(0, 400)
    });
  });

  return risultati;
}

function _xmlText_(el, tagName, ns) {
  try {
    var child = ns ? el.getChild(tagName, ns) : el.getChild(tagName);
    return child ? child.getValue() : null;
  } catch(e) { return null; }
}


// ─── PARSER HTML via Claude API ───────────────────────────────────────────

function _parseFonteHTML_(fonte) {
  // Headers realistici per ridurre bot detection
  var headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache'
  };

  var resp = UrlFetchApp.fetch(fonte.url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: headers
  });

  var code = resp.getResponseCode();
  if (code !== 200) throw new Error('HTTP ' + code);

  var testo = _pulisciHtmlV5_(resp.getContentText());
  if (testo.length < 150) throw new Error('Pagina vuota o troppo corta (' + testo.length + ' chars)');

  return _estraiConClaudeV5_(testo, fonte.url, fonte.ente_default || '');
}


// ─── PARSER SITEMAP ──────────────────────────────────────────────────────

function _parseFonteSitemap_(fonte) {
  var risultati = [];
  var resp = UrlFetchApp.fetch(fonte.url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());

  var xml;
  try { xml = XmlService.parse(resp.getContentText()); } catch(e) { throw new Error('Sitemap XML parse: ' + e.message); }

  var root = xml.getRootElement();
  var smNs = XmlService.getNamespace('http://www.sitemaps.org/schemas/sitemap/0.9');
  var urls = root.getChildren('url', smNs);
  if (urls.length === 0) urls = root.getChildren('url');

  // Filtra solo URL che contengono parole chiave bandi
  var keywords = ['bando', 'bandi', 'avviso', 'avvisi', 'finanziamento', 'contributo', 'grant'];
  urls.slice(0, 200).forEach(function(urlEl) {
    var loc = _xmlText_(urlEl, 'loc', smNs) || _xmlText_(urlEl, 'loc') || '';
    var locLow = loc.toLowerCase();
    var rilevante = keywords.some(function(k) { return locLow.indexOf(k) >= 0; });
    if (!rilevante) return;
    risultati.push({
      titolo:   loc.split('/').filter(Boolean).pop().replace(/[-_]/g, ' '),
      ente:     fonte.ente_default || '',
      livello:  fonte.livello || 'Vari',
      regione:  '',
      settore:  'Cultura e beni culturali',
      soggetti: '',
      importo:  '',
      scadenza: '',
      urlBando: loc,
      sommario: ''
    });
  });

  return risultati;
}


// ─── SALVA BANDO CON DEDUPLICA ────────────────────────────────────────────

function _saveBandoV5_(ss, shBandi, bandoRaw, fonteId, fonteNome, fingerprints) {
  var fp = _makeFingerprintV5_(bandoRaw.titolo, bandoRaw.urlBando);
  if (fingerprints[fp]) return false;   // duplicato

  var id = 'B5-' + new Date().getTime() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  var ambito = _classificaAmbitoV5_(bandoRaw.settore, bandoRaw.titolo);

  var riga = new Array(COL_B_HEADERS.length).fill('');
  riga[COL_B.ID - 1]               = id;
  riga[COL_B.FINGERPRINT - 1]      = fp;
  riga[COL_B.DATA_RILEVAMENTO - 1] = new Date();
  riga[COL_B.TITOLO - 1]           = (bandoRaw.titolo || '').slice(0, 300);
  riga[COL_B.ENTE - 1]             = (bandoRaw.ente || '').slice(0, 150);
  riga[COL_B.LIVELLO - 1]          = bandoRaw.livello || 'Vari';
  riga[COL_B.REGIONE - 1]          = bandoRaw.regione || '';
  riga[COL_B.SETTORE - 1]          = (bandoRaw.settore || '').slice(0, 100);
  riga[COL_B.SOGGETTI - 1]         = (bandoRaw.soggetti || '').slice(0, 200);
  riga[COL_B.IMPORTO - 1]          = bandoRaw.importo || '';
  riga[COL_B.COFIN - 1]            = '';
  riga[COL_B.SCADENZA - 1]         = bandoRaw.scadenza || '';
  riga[COL_B.FONTE_ID - 1]         = fonteId;
  riga[COL_B.FONTE_NOME - 1]       = fonteNome;
  riga[COL_B.URL_BANDO - 1]        = (bandoRaw.urlBando || '').slice(0, 500);
  riga[COL_B.URL_ENTE - 1]         = '';
  riga[COL_B.URL_VALIDATO - 1]     = false;
  riga[COL_B.DATA_VALIDAZIONE - 1] = '';
  riga[COL_B.SOMMARIO - 1]         = (bandoRaw.sommario || '').slice(0, 500);
  riga[COL_B.AMBITO - 1]           = ambito;
  riga[COL_B.PRIORITA_REGIONALE - 1] = '';
  riga[COL_B.STATUS - 1]           = 'Nuovo';
  riga[COL_B.STATO_RECORD - 1]     = 'attivo';
  riga[COL_B.LETTO - 1]            = false;
  riga[COL_B.SALVATO - 1]          = false;
  riga[COL_B.NOTE - 1]             = '';

  shBandi.appendRow(riga);
  fingerprints[fp] = true;
  return true;
}

function _classificaAmbitoV5_(settore, titolo) {
  var testo = ((settore || '') + ' ' + (titolo || '')).toLowerCase();
  if (testo.match(/accessibil|lis|disabilit|inclusione|integrazione|sociale/)) return 2;
  if (testo.match(/digital|ai |intelligenza artificiale|tecnolog|innovaz|webapp|piattaform/)) return 5;
  if (testo.match(/mostr|collezion|esposiz|programm|restauro|conservaz/)) return 3;
  if (testo.match(/comunit|welfare|partecipaz|giovani|anziani|scuola|mediaz/)) return 4;
  return 1;   // default: Identità e narrazione museale
}


// ─── LOG SCANSIONE ────────────────────────────────────────────────────────

function _logScanV5_(shLog, fonteId, fonteNome, esito, nBandi, errorMsg, durationMs) {
  shLog.appendRow([
    new Date(), fonteId, fonteNome, esito,
    nBandi || 0, errorMsg || '', durationMs || 0
  ]);
}


// ─── AGGIORNA STATO FONTE ─────────────────────────────────────────────────

function _updateFonteStatoV5_(shFonti, fonteRow, esito, nBandi, errorMsg) {
  var rowIdx = fonteRow + 1;   // 1-indexed, riga 1 = headers
  var ora = new Date();

  shFonti.getRange(rowIdx, COL_F.ULTIMA_SCANSIONE).setValue(ora);
  shFonti.getRange(rowIdx, COL_F.ULTIMO_ESITO).setValue(esito);
  shFonti.getRange(rowIdx, COL_F.N_BANDI_ULTIMO).setValue(nBandi || 0);

  var totaleCell = shFonti.getRange(rowIdx, COL_F.N_BANDI_TOTALI);
  var totale = Number(totaleCell.getValue()) || 0;
  totaleCell.setValue(totale + (nBandi || 0));

  if (esito === SCAN_OUTCOME.OK) {
    shFonti.getRange(rowIdx, COL_F.FAIL_CONSECUTIVI).setValue(0);
    shFonti.getRange(rowIdx, COL_F.ULTIMO_ERRORE).setValue('');
  } else {
    var failCell = shFonti.getRange(rowIdx, COL_F.FAIL_CONSECUTIVI);
    var fail = Number(failCell.getValue()) || 0;
    fail++;
    failCell.setValue(fail);
    shFonti.getRange(rowIdx, COL_F.ULTIMO_ERRORE).setValue((errorMsg || '').slice(0, 200));
    // Auto-disattivazione dopo 3 fail consecutivi
    if (fail >= FAIL_SOGLIA_DISATTIVAZIONE) {
      shFonti.getRange(rowIdx, COL_F.ATTIVA).setValue(false);
      Logger.log('  ⛔ Auto-disattivata dopo ' + fail + ' fail: ' + shFonti.getRange(rowIdx, COL_F.NOME).getValue());
    }
  }
}


// ─── SCAN SINGOLA FONTE (pubblica) ────────────────────────────────────────

function scanFonteSingola(fonteId) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  var shBandi = ss.getSheetByName(SH_BANDI_V5);
  var shLog   = ss.getSheetByName(SH_FONTI_LOG);
  if (!shFonti || !shBandi || !shLog) throw new Error('Fogli v5 mancanti. Esegui FASE 1 prima.');

  var rows = shFonti.getDataRange().getValues();

  // Carica fingerprints esistenti per dedup
  var fingerprints = {};
  var bandiRows = shBandi.getDataRange().getValues();
  for (var i = 1; i < bandiRows.length; i++) {
    if (bandiRows[i][COL_B.FINGERPRINT - 1]) fingerprints[bandiRows[i][COL_B.FINGERPRINT - 1]] = true;
  }

  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (row[COL_F.ID - 1] !== fonteId) continue;

    var fonte = {
      id:           row[COL_F.ID - 1],
      nome:         row[COL_F.NOME - 1],
      url:          row[COL_F.URL - 1],
      tipo:         row[COL_F.TIPO - 1] || 'HTML',
      attiva:       row[COL_F.ATTIVA - 1],
      ente_default: row[COL_F.ENTE_DEFAULT - 1] || '',
      livello:      row[COL_F.LIVELLO - 1] || 'Vari'
    };

    return _scanSingolaFonte_(ss, shFonti, shBandi, shLog, fonte, r, fingerprints);
  }
  throw new Error('Fonte non trovata: ' + fonteId);
}

function _scanSingolaFonte_(ss, shFonti, shBandi, shLog, fonte, rowIdx, fingerprints) {
  if (!fonte.attiva) {
    _logScanV5_(shLog, fonte.id, fonte.nome, SCAN_OUTCOME.DISABLED, 0, '', 0);
    return { esito: SCAN_OUTCOME.DISABLED, nBandi: 0 };
  }

  Logger.log('  Scan [' + fonte.tipo + '] ' + fonte.nome + ' ...');
  var t0 = new Date().getTime();
  var esito = SCAN_OUTCOME.OK, nNuovi = 0, errMsg = '';

  try {
    var bandi = [];
    if (fonte.tipo === 'RSS')     bandi = _parseFonteRSS_(fonte);
    else if (fonte.tipo === 'Sitemap') bandi = _parseFonteSitemap_(fonte);
    else                          bandi = _parseFonteHTML_(fonte);

    bandi.forEach(function(b) {
      if (_saveBandoV5_(ss, shBandi, b, fonte.id, fonte.nome, fingerprints)) {
        nNuovi++;
        // v4.18.60 — ROC auto-triage: valuta ogni nuovo bando per outreach LS1
        try {
          if (typeof roc_triageBando === 'function') {
            var triage = roc_triageBando(b);
            if (triage && triage.passa) {
              Logger.log('    ROC: bando idoneo → ' + (b.titolo || '').slice(0, 60));
            }
          }
        } catch(_roc) { /* non bloccante */ }
      }
    });

    Logger.log('    → ' + bandi.length + ' estratti, ' + nNuovi + ' nuovi');
  } catch(e) {
    esito = e.message.indexOf('HTTP') >= 0 ? SCAN_OUTCOME.HTTP_ERR : SCAN_OUTCOME.PARSE_ERR;
    errMsg = e.message;
    Logger.log('    ✗ ' + errMsg);
  }

  var duration = new Date().getTime() - t0;
  _logScanV5_(shLog, fonte.id, fonte.nome, esito, nNuovi, errMsg, duration);
  _updateFonteStatoV5_(shFonti, rowIdx, esito, nNuovi, errMsg);

  return { esito: esito, nBandi: nNuovi, errore: errMsg };
}


// ─── SCAN TUTTE LE FONTI ATTIVE ───────────────────────────────────────────

function scanFontiTutte() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  var shBandi = ss.getSheetByName(SH_BANDI_V5);
  var shLog   = ss.getSheetByName(SH_FONTI_LOG);
  if (!shFonti || !shBandi || !shLog) throw new Error('Fogli v5 mancanti. Esegui FASE 1 prima.');

  Logger.log('================================================================');
  Logger.log('SCAN FONTI TUTTE v5 - ' + new Date().toISOString());
  Logger.log('================================================================');

  var rows = shFonti.getDataRange().getValues();
  var fingerprints = {};
  var bandiRows = shBandi.getDataRange().getValues();
  for (var i = 1; i < bandiRows.length; i++) {
    if (bandiRows[i][COL_B.FINGERPRINT - 1]) fingerprints[bandiRows[i][COL_B.FINGERPRINT - 1]] = true;
  }

  // Costruisce lista fonti ordinata: prima mai scansionate, poi le più vecchie
  var ora = new Date().getTime();
  var SKIP_SE_RECENTE_MS = 6 * 60 * 60 * 1000;  // 6 ore

  var fontiDaScansionare = [];
  var fontiRecenti = [];

  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (!row[COL_F.ID - 1]) continue;
    if (!row[COL_F.ATTIVA - 1]) continue;  // disattivate: skip

    var ultimaScan = row[COL_F.ULTIMA_SCANSIONE - 1];
    var ultimoEsito = row[COL_F.ULTIMO_ESITO - 1];
    var etaMs = ultimaScan ? (ora - new Date(ultimaScan).getTime()) : Infinity;

    var fonte = {
      id:           row[COL_F.ID - 1],
      nome:         row[COL_F.NOME - 1],
      url:          row[COL_F.URL - 1],
      tipo:         row[COL_F.TIPO - 1] || 'HTML',
      attiva:       true,
      ente_default: row[COL_F.ENTE_DEFAULT - 1] || '',
      livello:      row[COL_F.LIVELLO - 1] || 'Vari',
      _row:         r,
      _etaMs:       etaMs
    };

    // Skip se scansionata con successo nelle ultime 6 ore
    if (ultimoEsito === SCAN_OUTCOME.OK && etaMs < SKIP_SE_RECENTE_MS) {
      fontiRecenti.push(fonte);
    } else {
      fontiDaScansionare.push(fonte);
    }
  }

  // Ordina: prima mai scansionate (etaMs=Infinity), poi per età decrescente
  fontiDaScansionare.sort(function(a, b) { return b._etaMs - a._etaMs; });

  Logger.log('  Da scansionare: ' + fontiDaScansionare.length +
             ' | Già recenti (skip): ' + fontiRecenti.length);

  var totaleNuovi = 0, totaleOk = 0, totaleFail = 0, totaleSaltate = fontiRecenti.length;
  var startTime = new Date().getTime();

  for (var fi = 0; fi < fontiDaScansionare.length; fi++) {
    var fonte = fontiDaScansionare[fi];

    // Stop a 5 minuti
    if (new Date().getTime() - startTime > 300000) {
      var rimanenti = fontiDaScansionare.length - fi;
      Logger.log('⏱ Timeout 5min — ' + rimanenti + ' fonti rimanenti per prossima esecuzione');
      break;
    }

    var res = _scanSingolaFonte_(ss, shFonti, shBandi, shLog, fonte, fonte._row, fingerprints);
    if (res.esito === SCAN_OUTCOME.DISABLED) { totaleSaltate++; continue; }
    if (res.esito === SCAN_OUTCOME.OK) { totaleOk++; } else { totaleFail++; }
    totaleNuovi += (res.nBandi || 0);
  }

  Logger.log('================================================================');
  Logger.log('SCAN COMPLETATO');
  Logger.log('  OK: ' + totaleOk + ' | Fail: ' + totaleFail + ' | Saltate/recenti: ' + totaleSaltate);
  Logger.log('  Nuovi bandi inseriti: ' + totaleNuovi);
  Logger.log('================================================================');

  // v4.18.60 — Invalida cache homepage se ci sono nuovi contenuti
  if (totaleNuovi > 0) {
    try { PropertiesService.getScriptProperties().deleteProperty('oc_homepage_cache_v1'); } catch(_){}
  }

  // v4.18.43 (2026-05-15) — Auto-quality-check post-scansione: archivia duplicati semantici
  // cross-fonte ed assegna ambiti vuoti. Eseguito solo se ci sono stati bandi nuovi (evita lavoro inutile).
  var qcResult = null;
  try {
    if (totaleNuovi > 0) {
      Logger.log('--- AUTO QUALITY CHECK POST-SCAN ---');
      qcResult = qualityCheckBandiAuto({ source: 'post-scan' });
      Logger.log('  Quality check: dup_archiviati=' + (qcResult && qcResult.dup_archiviati || 0)
        + ' ambiti_assegnati=' + (qcResult && qcResult.tem_ambiti_assegnati || 0));
    } else {
      Logger.log('  Nessun bando nuovo: skip quality check post-scan.');
    }
  } catch(eQc) { Logger.log('  ⚠ Quality check post-scan FALLITO: ' + eQc.message); }

  return { ok: totaleOk, fail: totaleFail, saltate: totaleSaltate, nuovi: totaleNuovi, qualityCheck: qcResult };
}


// ─── TEST FASE 2: prime 3 fonti priorita=1 ────────────────────────────────

function runFase2Test() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  var shBandi = ss.getSheetByName(SH_BANDI_V5);
  var shLog   = ss.getSheetByName(SH_FONTI_LOG);
  if (!shFonti || !shBandi || !shLog) {
    Logger.log('ERRORE: fogli v5 mancanti. Esegui runFase1Setup() prima.');
    return;
  }

  Logger.log('================================================================');
  Logger.log('FASE 2 TEST - prime 3 fonti con priorita=1');
  Logger.log('================================================================');

  var rows = shFonti.getDataRange().getValues();
  var fingerprints = {};
  var bandiRows = shBandi.getDataRange().getValues();
  for (var i = 1; i < bandiRows.length; i++) {
    if (bandiRows[i][COL_B.FINGERPRINT - 1]) fingerprints[bandiRows[i][COL_B.FINGERPRINT - 1]] = true;
  }

  var testCount = 0, totaleNuovi = 0;
  for (var r = 1; r < rows.length && testCount < 3; r++) {
    var row = rows[r];
    if (!row[COL_F.ID - 1]) continue;
    if (Number(row[COL_F.PRIORITA - 1]) !== 1) continue;
    if (!row[COL_F.ATTIVA - 1]) continue;

    var fonte = {
      id:           row[COL_F.ID - 1],
      nome:         row[COL_F.NOME - 1],
      url:          row[COL_F.URL - 1],
      tipo:         row[COL_F.TIPO - 1] || 'HTML',
      attiva:       true,
      ente_default: row[COL_F.ENTE_DEFAULT - 1] || '',
      livello:      row[COL_F.LIVELLO - 1] || 'Vari'
    };

    Logger.log('\n[' + (testCount+1) + '/3] ' + fonte.nome + ' (' + fonte.tipo + ')');
    var res = _scanSingolaFonte_(ss, shFonti, shBandi, shLog, fonte, r, fingerprints);
    totaleNuovi += (res.nBandi || 0);
    testCount++;
  }

  Logger.log('\n================================================================');
  Logger.log('FASE 2 TEST COMPLETATO — ' + totaleNuovi + ' bandi inseriti in Bandi_v5');
  Logger.log('Controlla il foglio Bandi_v5 e FontiBandiLog_v5 per i risultati.');
  Logger.log('Se ok, esegui scanFontiTutte() per la scansione completa.');
  Logger.log('================================================================');
}


// ============================================================================
// MENU BANDI V5 — versione definitiva (FASE 1+2+3+4+5)
// ============================================================================
function onOpen(e) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('Bandi v5.0')

      // —— SETUP ——
      .addItem('Setup completo (backup + schema + seed fonti)', 'runFase1Setup')
      .addItem('Solo backup foglio', 'backupFoglioV4')
      .addItem('Solo seed fonti', 'seedFontiV5')
      .addSeparator()

      // —— SCANNER ——
      .addItem('Scansiona TUTTE le fonti', 'scanFontiTutte')
      .addItem('Test scansione 3 fonti RSS', 'runFase2Test')
      .addItem('Setup trigger Lun/Mer/Ven 07:00', 'setupBandiV5Triggers')
      .addSeparator()

      // —— WEBAPP SWITCHOVER ——
      .addItem('✅ Attiva Bandi v5 in webapp (enableBandiV5)', 'enableBandiV5')
      .addItem('⚪ Disattiva — torna a RADAR BANDI', 'disableBandiV5')
      .addItem('Stato sistema Bandi v5', 'statoBandiV5')
      .addSeparator()

      // —— ALERT & DIGEST ——
      .addItem('Invia alert Telegram (bandi urgenti)', 'sendBandiAlertV5')
      .addItem('Invia digest email bandi (top 20)', 'digestBandiV5')
      .addSeparator()

      // —— MANUTENZIONE ——
      .addItem('Disabilita fonti bloccate (≥3 fail)', 'disabilitaFontiBloccate')
      .addItem('Reset fall consecutivi (riparaURLFonti)', 'riparaURLFonti')
      .addItem('Versione modulo', 'mostraBandiV5Version')

      .addToUi();
  } catch(err) {
    Logger.log('onOpen err (ignorabile): ' + err.message);
  }
}


// v4.18.38 (audit 2026-05-14) — Rimosse 2 funzioni one-shot già applicate:
//   • aggiornaFontiRSS()           — migrazione 6 fonti HTML→RSS (eseguita post-deploy v5)
//   • disabilitaContributiRegione() — disabilitazione fonti JS dinamico (eseguita una-tantum)
// Recuperabili da git history se servono nuovamente.


/**
 * Imposta trigger automatici per scanFontiTutte v5:
 * - Lunedì, Mercoledì, Venerdì alle 07:00
 * Rimuove eventuali trigger v5 esistenti prima di crearne di nuovi (idempotente).
 */
function setupBandiV5Triggers() {
  // Rimuovi trigger v5 esistenti
  var triggers = ScriptApp.getProjectTriggers();
  var rimossi = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'scanFontiTutte') {
      ScriptApp.deleteTrigger(t);
      rimossi++;
    }
  });
  if (rimossi > 0) Logger.log('Rimossi ' + rimossi + ' trigger precedenti per scanFontiTutte');

  // Crea 3 trigger settimanali
  var giorni = [
    { label: 'Lunedì',    day: ScriptApp.WeekDay.MONDAY },
    { label: 'Mercoledì', day: ScriptApp.WeekDay.WEDNESDAY },
    { label: 'Venerdì',   day: ScriptApp.WeekDay.FRIDAY }
  ];

  giorni.forEach(function(g) {
    ScriptApp.newTrigger('scanFontiTutte')
      .timeBased()
      .onWeekDay(g.day)
      .atHour(1)
      .create();
    Logger.log('✅ Trigger creato: scanFontiTutte ogni ' + g.label + ' alle 01:00');
  });

  Logger.log('setupBandiV5Triggers completato — 3 trigger attivi (Lun/Mer/Ven 01:00)');
}


/**
 * Testa URL alternativi per fonti con 404 e aggiorna FontiBandi_v5 con il primo funzionante.
 * Usare dopo aver rilevato 404 nel log di scanFontiTutte.
 */
function riparaURLFonti() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  if (!shFonti) { Logger.log('ERRORE: FontiBandi_v5 non trovato'); return; }

  // Candidati URL per ogni fonte (dal più probabile al meno)
  var CANDIDATI = {
    // Regioni
    'f_regione_puglia_cultura': [
      'https://www.regione.puglia.it/web/cultura/avvisi',
      'https://www.regione.puglia.it/web/cultura/bandi',
      'https://www.regione.puglia.it/web/attivita/bandi-e-avvisi'
    ],
    'f_regione_puglia_bandi': [
      'https://www.regione.puglia.it/web/portale-bandi',
      'https://www.regione.puglia.it/bandi',
      'https://www.regione.puglia.it/web/guest/bandi-e-avvisi'
    ],
    'f_pugliapromozione': [
      'https://www.pugliapromozione.it/bandi/',
      'https://www.pugliapromozione.it/bandi-e-avvisi/'
    ],
    'f_regione_sardegna_cultura': [
      'https://www.regione.sardegna.it/bandi',
      'https://www.sardegnacultura.it/bandi',
      'https://www.regione.sardegna.it/argomenti/cultura'
    ],
    // Fondazioni
    'f_fondazione_cariplo_cultura': [
      'https://www.fondazionecariplo.it/it/cosa-facciamo/arte-e-cultura',
      'https://www.fondazionecariplo.it/it/bandi/cultura',
      'https://www.fondazionecariplo.it/it/bandi'
    ],
    'f_wikimedia_italia_musei': [
      'https://www.wikimedia.it/bandi-musei',
      'https://www.wikimedia.it/cosa-facciamo/partnership/',
      'https://meta.wikimedia.org/wiki/Wikimedia_Italia/Bandi'
    ],
    'f_fondazione_symbola_bandi': [
      'https://symbola.net/bandi/',
      'https://symbola.net/opportunita/',
      'https://symbola.net/notizie/'
    ],
    'f_fondazione_symbola_notizie': [
      'https://symbola.net/notizie/',
      'https://symbola.net/feed/'
    ],
    'f_fondazione_fitzcarraldo': [
      'https://www.fitzcarraldo.it/bandi/',
      'https://www.fitzcarraldo.it/ricerca/',
      'https://www.fitzcarraldo.it/opportunita/'
    ],
    'f_fondazione_compagnia_di_san_paolo': [
      'https://www.compagniadisanpaolo.it/bandi/',
      'https://www.compagniadisanpaolo.it/it/bandi',
      'https://www.compagniadisanpaolo.it/it/opportunita'
    ],
    // Associazioni
    'f_il_giornale_delle_fondazioni': [
      'https://www.ilgiornaledellefondazioni.com/bandi/',
      'https://www.ilgiornaledellefondazioni.com/tag/bandi',
      'https://www.ilgiornaledellefondazioni.com'
    ],
    'f_federculture_bandi': [
      'https://www.federculture.it/bandi/',
      'https://www.federculture.it/opportunita/',
      'https://www.federculture.it'
    ],
    'f_mab_italia_bandi': [
      'https://www.mab-italia.org/bandi/',
      'https://www.mab-italia.org/notizie/',
      'https://www.mab-italia.org'
    ],
    'f_amaci_opportunit': [
      'https://www.amaci.org/opportunita/',
      'https://www.amaci.org/notizie/',
      'https://www.amaci.org'
    ],
    'f_nemo_european_museum_network': [
      'https://www.ne-mo.org/calls-for-proposals',
      'https://www.ne-mo.org/news',
      'https://www.ne-mo.org/agenda'
    ],
    'f_museumnext_opportunities': [
      'https://www.museumnext.com/opportunities',
      'https://www.museumnext.com/calls',
      'https://www.museumnext.com'
    ],
    'f_indicebandi_cultura': [
      'https://www.indicebandi.it/cultura',
      'https://www.indicebandi.it/bandi/cultura',
      'https://www.indicebandi.it'
    ]
  };

  Logger.log('=== RIPARAZIONE URL FONTI ===');
  var rows = shFonti.getDataRange().getValues();

  for (var r = 1; r < rows.length; r++) {
    var id = rows[r][COL_F.ID - 1];
    var candidati = null;
    for (var chiave in CANDIDATI) {
      if (id.indexOf(chiave.replace('f_','')) >= 0 || id === chiave) {
        candidati = CANDIDATI[chiave];
        break;
      }
    }
    if (!candidati) continue;

    Logger.log('\n  Fonte: ' + rows[r][COL_F.NOME - 1] + ' (attuale: ' + rows[r][COL_F.URL - 1] + ')');

    var trovato = false;
    for (var c = 0; c < candidati.length; c++) {
      try {
        var resp = UrlFetchApp.fetch(candidati[c], { muteHttpExceptions: true, followRedirects: true });
        var code = resp.getResponseCode();
        var len  = resp.getContentText().length;
        Logger.log('    [' + code + '] ' + candidati[c] + ' (' + len + ' chars)');
        if (code === 200 && len > 500) {
          shFonti.getRange(r + 1, COL_F.URL).setValue(candidati[c]);
          shFonti.getRange(r + 1, COL_F.FAIL_CONSECUTIVI).setValue(0);
          shFonti.getRange(r + 1, COL_F.ULTIMO_ERRORE).setValue('');
          shFonti.getRange(r + 1, COL_F.ATTIVA).setValue(true);
          Logger.log('    ✅ URL aggiornato a: ' + candidati[c]);
          trovato = true;
          break;
        }
      } catch(e) {
        Logger.log('    ✗ ' + candidati[c] + ': ' + e.message);
      }
    }
    if (!trovato) {
      Logger.log('    ⚠️  Nessun URL funzionante trovato — disabilito la fonte');
      shFonti.getRange(r + 1, COL_F.ATTIVA).setValue(false);
      shFonti.getRange(r + 1, COL_F.NOTE).setValue('URL 404 - verificare manualmente il nuovo indirizzo');
    }
  }
  Logger.log('\n=== RIPARAZIONE COMPLETATA ===');
}


/**
 * Disabilita le fonti irraggiungibili da GAS (es. cultura.gov.it bloccato).
 * Le segna come ATTIVA=false e aggiunge nota, senza cancellarle.
 */
function disabilitaFontiBloccate() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  if (!shFonti) { Logger.log('ERRORE: FontiBandi_v5 non trovato'); return; }

  // URL noti come irraggiungibili da Google Apps Script
  var BLOCCATI = [
    'cultura.gov.it',
    'ministeroturismo.gov.it'
  ];

  var rows = shFonti.getDataRange().getValues();
  var disabilitate = 0;
  for (var r = 1; r < rows.length; r++) {
    var url = (rows[r][COL_F.URL - 1] || '').toLowerCase();
    var bloccato = BLOCCATI.some(function(b) { return url.indexOf(b) >= 0; });
    if (bloccato && rows[r][COL_F.ATTIVA - 1] !== false) {
      shFonti.getRange(r + 1, COL_F.ATTIVA).setValue(false);
      shFonti.getRange(r + 1, COL_F.NOTE).setValue('Bloccato da GAS - Address unavailable. Monitorare manualmente.');
      Logger.log('  ⛔ Disabilitata: ' + rows[r][COL_F.NOME - 1]);
      disabilitate++;
    }
  }
  Logger.log('Disabilitate ' + disabilitate + ' fonti bloccate.');
}


/**
 * Test mirato: scansiona solo le fonti di tipo RSS (non dipendono da Claude API).
 * Utile per verificare il pipeline prima di lanciare scanFontiTutte().
 */
function runFase2TestRSS() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  var shBandi = ss.getSheetByName(SH_BANDI_V5);
  var shLog   = ss.getSheetByName(SH_FONTI_LOG);
  if (!shFonti || !shBandi || !shLog) { Logger.log('Fogli v5 mancanti'); return; }

  Logger.log('================================================================');
  Logger.log('FASE 2 TEST RSS — sole fonti RSS attive');
  Logger.log('================================================================');

  var fingerprints = {};
  var bandiRows = shBandi.getDataRange().getValues();
  for (var i = 1; i < bandiRows.length; i++) {
    if (bandiRows[i][COL_B.FINGERPRINT - 1]) fingerprints[bandiRows[i][COL_B.FINGERPRINT - 1]] = true;
  }

  var rows = shFonti.getDataRange().getValues();
  var testCount = 0, totaleNuovi = 0;

  for (var r = 1; r < rows.length && testCount < 5; r++) {
    var row = rows[r];
    if (!row[COL_F.ID - 1]) continue;
    if ((row[COL_F.TIPO - 1] || '').toUpperCase() !== 'RSS') continue;
    if (!row[COL_F.ATTIVA - 1]) continue;

    var fonte = {
      id:           row[COL_F.ID - 1],
      nome:         row[COL_F.NOME - 1],
      url:          row[COL_F.URL - 1],
      tipo:         'RSS',
      attiva:       true,
      ente_default: row[COL_F.ENTE_DEFAULT - 1] || '',
      livello:      row[COL_F.LIVELLO - 1] || 'Vari'
    };

    Logger.log('\n[' + (testCount+1) + '] ' + fonte.nome);
    var res = _scanSingolaFonte_(ss, shFonti, shBandi, shLog, fonte, r, fingerprints);
    totaleNuovi += (res.nBandi || 0);
    testCount++;
  }

  Logger.log('\n================================================================');
  Logger.log('TEST RSS COMPLETATO — ' + totaleNuovi + ' bandi inseriti in Bandi_v5');
  Logger.log('================================================================');
}


/**
 * Verifica che la chiave Claude API sia configurata e funzionante.
 * Esegui dopo aver acquistato i crediti.
 */
function testClaudeAPIKey() {
  Logger.log('=== TEST CLAUDE API KEY ===');
  var apiKey = PropertiesService.getScriptProperties().getProperty(ANTHROPIC_KEY_PROP);
  if (!apiKey) {
    Logger.log('❌ CLAUDE_API_KEY non trovata in ScriptProperties.');
    Logger.log('   Vai su: Progetto GAS → Impostazioni progetto → Proprietà script');
    Logger.log('   Aggiungi: CLAUDE_API_KEY = sk-ant-...');
    return;
  }
  Logger.log('✅ Chiave trovata: ' + apiKey.slice(0, 15) + '...');

  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Rispondi solo: OK' }]
      }),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    if (code === 200) {
      Logger.log('✅ Claude Haiku API funzionante — crediti attivi');
    } else {
      var body = JSON.parse(resp.getContentText());
      Logger.log('❌ Errore API (HTTP ' + code + '): ' + (body.error ? body.error.message : resp.getContentText().slice(0,200)));
    }
  } catch(e) {
    Logger.log('❌ Eccezione: ' + e.message);
  }
}


// ============================================================================
// FASE 3 — API ADMIN FONTI V5
// ----------------------------------------------------------------------------
// Gestione fonti (attiva/disattiva, reset fail) da pannello admin webapp.
// Chiamate via google.script.run dal frontend.
// ============================================================================

// v4.18.38 (audit 2026-05-14) — Rimossa getFontiBandiV5Admin(): duplicato di getFontiV5List().
//   Il pannello admin usa già getFontiV5List() (Bandi_v5.js più sotto) via google.script.run.

/**
 * Restituisce snapshot stato aggiornamento fonti per masthead home.
 * Sprint v4.14 (2026-05-08): rende visibile l'indicatore #homeUpdateInfo.
 * @return {Object} { ok, lastUpdate (Date ISO max UltimaScansione), totale, attive,
 *                   silenti (fail>=3), labelBreve "12 min fa / oggi 14:25 / 2g fa" }
 */
function getLastFontiUpdate() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok: false, err: 'Foglio FontiBandi_v5 non trovato' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok: true, lastUpdate: null, totale: 0, attive: 0, silenti: 0, labelBreve: 'nessuna fonte' };
    var maxTs = 0, totale = 0, attive = 0, silenti = 0;
    for (var r = 1; r < vals.length; r++) {
      if (!vals[r][COL_F.ID - 1]) continue;
      totale++;
      if (vals[r][COL_F.ATTIVA - 1] === true || vals[r][COL_F.ATTIVA - 1] === 'TRUE') attive++;
      if (Number(vals[r][COL_F.FAIL_CONSECUTIVI - 1] || 0) >= 3) silenti++;
      var ts = vals[r][COL_F.ULTIMA_SCANSIONE - 1];
      if (ts) {
        var ms = (ts instanceof Date) ? ts.getTime() : new Date(ts).getTime();
        if (ms > maxTs) maxTs = ms;
      }
    }
    var label = '—';
    if (maxTs > 0) {
      var diff = (Date.now() - maxTs) / 1000;
      if      (diff < 60)        label = 'aggiornato ora';
      else if (diff < 3600)      label = 'aggiornato ' + Math.round(diff/60) + ' min fa';
      else if (diff < 24*3600)   label = 'aggiornato ' + Math.round(diff/3600) + ' ore fa';
      else if (diff < 7*24*3600) label = 'aggiornato ' + Math.round(diff/(24*3600)) + ' giorni fa';
      else                       label = 'ultimo aggiornamento: ' + new Date(maxTs).toLocaleDateString('it-IT');
    }
    return {
      ok: true,
      lastUpdate: maxTs ? new Date(maxTs).toISOString() : null,
      totale: totale,
      attive: attive,
      silenti: silenti,
      labelBreve: label
    };
  } catch(e) { return { ok: false, err: e.message }; }
}

// v4.18.38 (audit 2026-05-14) — Rimossa toggleFonteV5(fonteId, attiva):
//   duplicato di toggleFonteUnified(tipo, id, attiva) in Fonti_v1.js.
//   Il pannello admin usa già toggleFonteUnified via google.script.run.

/**
 * v4.18.40 (2026-05-15) — Elenca le fonti bandi DISATTIVATE (Attiva=FALSE esplicito).
 * Usata dal pannello admin per decidere se riattivare/rimuovere fonti spente in passato.
 *
 * @return {Object} { ok, count, list: [{id, nome, url, tipo, categoria, ultimaScan, ultimoEsito, failConsec, ultimoErr, note}] }
 */
function getFontiBandiDisattivate() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok: false, error: 'Foglio FontiBandi_v5 non trovato' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok: true, count: 0, list: [] };

    // Trova indici colonna per nome (robusto a schemi diversi)
    var header = vals[0].map(function(h){ return String(h || '').trim().toLowerCase(); });
    function col_(name) { return header.indexOf(name.toLowerCase()); }
    var iId      = col_('id');
    var iNome    = col_('nome');
    var iUrl     = col_('url');
    var iTipo    = col_('tipo');
    var iCat     = col_('categoria');
    var iAtt     = col_('attiva');
    var iScan    = col_('ultimascansione'); if (iScan < 0) iScan = col_('ultimascan');
    var iEsito   = col_('ultimoesito');
    var iFail    = col_('failconsecutivi');
    var iErr     = col_('ultimoerrore');
    var iNote    = col_('note');

    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (iId < 0 || !row[iId]) continue;
      var att = row[iAtt];
      var isFalse = (att === false || String(att).toUpperCase() === 'FALSE' || String(att).toLowerCase() === 'no');
      if (!isFalse) continue;

      out.push({
        id        : String(row[iId] || ''),
        nome      : iNome >= 0 ? String(row[iNome] || '') : '',
        url       : iUrl >= 0 ? String(row[iUrl] || '') : '',
        tipo      : iTipo >= 0 ? String(row[iTipo] || '') : '',
        categoria : iCat >= 0 ? String(row[iCat] || '') : '',
        ultimaScan: iScan >= 0 && row[iScan] ? _fmtBreveV5_(row[iScan]) : '—',
        ultimoEsito: iEsito >= 0 ? String(row[iEsito] || '') : '',
        failConsec: iFail >= 0 ? Number(row[iFail] || 0) : 0,
        ultimoErr : iErr >= 0 ? String(row[iErr] || '').slice(0, 200) : '',
        note      : iNote >= 0 ? String(row[iNote] || '').slice(0, 200) : ''
      });
    }
    return { ok: true, count: out.length, list: out };
  } catch(e) { return { ok: false, error: e.message }; }
}

/**
 * Resetta i fail consecutivi su una fonte (riabilita dopo errori).
 */
function resetFailFonteV5ByUrl(url) {
  try {
    if (!url) return { ok: false, err: 'URL mancante' };
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok: false, err: 'Foglio FontiBandi_v5 non trovato' };
    var vals = sh.getDataRange().getValues();
    var target = String(url).trim().toLowerCase();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][COL_F.URL - 1] || '').trim().toLowerCase() === target) {
        sh.getRange(r + 1, COL_F.FAIL_CONSECUTIVI).setValue(0);
        sh.getRange(r + 1, COL_F.ULTIMO_ERRORE).setValue('');
        sh.getRange(r + 1, COL_F.ATTIVA).setValue(true);
        return { ok: true, id: vals[r][COL_F.ID - 1], nome: vals[r][COL_F.NOME - 1] };
      }
    }
    return { ok: false, err: 'Fonte non trovata in FontiBandi_v5 (URL: ' + url + ')' };
  } catch(e) { return { ok: false, err: e.message }; }
}

function resetFailFonteV5(fonteId) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok: false };
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][COL_F.ID - 1]) === String(fonteId)) {
        sh.getRange(r + 1, COL_F.FAIL_CONSECUTIVI).setValue(0);
        sh.getRange(r + 1, COL_F.ULTIMO_ERRORE).setValue('');
        sh.getRange(r + 1, COL_F.ATTIVA).setValue(true);
        Logger.log('♻️ Reset fail + riattivata: ' + vals[r][COL_F.NOME - 1]);
        return { ok: true };
      }
    }
    return { ok: false, err: 'Fonte non trovata' };
  } catch(e) { return { ok: false, err: e.message }; }
}

/** Helper data format per FASE 3/4 */
function _fmtBreveV5_(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Europe/Rome', 'dd/MM HH:mm');
  }
  return String(v).slice(0, 16);
}


// ============================================================================
// FASE 4 — ENDPOINT getBandiV5 + SWITCHOVER WEBAPP
// ----------------------------------------------------------------------------
// getBandiV5(limit)       → elenco bandi da Bandi_v5 (stesso schema di getBandiListV42)
// getUltimiBandiV5(limit) → ultimi N bandi per home (stesso schema di getUltimiBandiMonitorati)
// enableBandiV5()         → attiva switchover: getBandiListV42 → Bandi_v5
// disableBandiV5()        → disattiva switchover, torna a RADAR BANDI
// isBandiV5Active()       → true se switchover attivo
// ============================================================================

/**
 * Legge elenco bandi dalla tabella Bandi_v5.
 * Stesso contratto di getBandiListV42: restituisce array di oggetti con
 * id, titolo, ente, settore, ambito, scadenza, giorni, isUrgent, dataRil, link, sommario.
 */
function getBandiV5(limit) {
  try {
    var n = Number(limit) || 500;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_BANDI_V5);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return [];

    var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    var tz = Session.getScriptTimeZone() || 'Europe/Rome';
    var out = [];

    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      var stato = String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase();
      if (stato === 'archiviato') continue;

      var rawScad = row[COL_B.SCADENZA - 1];
      var scadDate = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
      var giorni = (scadDate && !isNaN(scadDate.getTime()))
        ? Math.round((scadDate.getTime() - oggi.getTime()) / 86400000) : null;

      // Scarta scaduti da più di 30 gg
      if (giorni !== null && giorni < -30) continue;

      var rawRil = row[COL_B.DATA_RILEVAMENTO - 1];
      out.push({
        id      : row[COL_B.ID - 1],
        titolo  : row[COL_B.TITOLO - 1],
        ente    : row[COL_B.ENTE - 1] || row[COL_B.FONTE_NOME - 1] || '',
        settore : row[COL_B.SETTORE - 1] || '',
        ambito  : row[COL_B.AMBITO - 1] || '',
        regione : row[COL_B.REGIONE - 1] || '',
        importo : row[COL_B.IMPORTO - 1] || '',
        sommario: row[COL_B.SOMMARIO - 1] || '',
        scadDate: scadDate,
        giorni  : giorni,
        dataRil : rawRil,
        link    : row[COL_B.URL_BANDO - 1] || row[COL_B.URL_ENTE - 1] || ''
      });
    }

    // Sort: urgenti prima ASC, poi altri ASC per scadenza, poi DESC per dataRil
    out.sort(function(a, b) {
      var aUrg = a.giorni !== null && a.giorni >= 0 && a.giorni <= 7;
      var bUrg = b.giorni !== null && b.giorni >= 0 && b.giorni <= 7;
      if (aUrg && !bUrg) return -1;
      if (!aUrg && bUrg) return 1;
      var sa = a.scadDate ? a.scadDate.getTime() : 0;
      var sb = b.scadDate ? b.scadDate.getTime() : 0;
      if (sa && sb) return sa - sb;
      if (sa) return -1;
      if (sb) return 1;
      var da = a.dataRil instanceof Date ? a.dataRil.getTime() : 0;
      var db = b.dataRil instanceof Date ? b.dataRil.getTime() : 0;
      return db - da;
    });

    return out.slice(0, n).map(function(x) {
      var scadFmt = '';
      if (x.scadDate && !isNaN(x.scadDate.getTime())) {
        scadFmt = Utilities.formatDate(x.scadDate, tz, 'd MMM yyyy');
      }
      var rilFmt = '';
      if (x.dataRil instanceof Date && !isNaN(x.dataRil.getTime())) {
        rilFmt = Utilities.formatDate(x.dataRil, tz, 'dd/MM/yyyy');
      } else if (x.dataRil) {
        rilFmt = String(x.dataRil).slice(0, 10);
      }
      var sette_fa = oggi.getTime() - 7 * 86400000;
      return {
        id       : String(x.id),
        titolo   : String(x.titolo || ''),
        ente     : String(x.ente || ''),
        settore  : String(x.settore || ''),
        ambito   : String(x.ambito || ''),
        regione  : String(x.regione || ''),
        importo  : String(x.importo || ''),
        sommario : String(x.sommario || ''),
        scadenza : scadFmt,
        giorni   : x.giorni,
        isUrgent : x.giorni !== null && x.giorni >= 0 && x.giorni <= 7,
        isRecente: !!(x.dataRil instanceof Date && !isNaN(x.dataRil.getTime()) && x.dataRil.getTime() >= sette_fa),
        dataRil  : rilFmt,
        link     : String(x.link || '')
      };
    });
  } catch(e) { console.error('getBandiV5:', e); return []; }
}

/**
 * Ultimi N bandi rilevati da Bandi_v5 — usato per la home.
 * Stesso contratto di getUltimiBandiMonitorati.
 */
function getUltimiBandiV5(limit) {
  try {
    var n = Number(limit) || 6;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_BANDI_V5);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return [];

    var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    var tz = Session.getScriptTimeZone() || 'Europe/Rome';
    var items = [];

    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      var stato = String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase();
      if (stato === 'archiviato') continue;
      var rawRil = row[COL_B.DATA_RILEVAMENTO - 1];
      var rilDate = (rawRil instanceof Date) ? rawRil : (rawRil ? new Date(rawRil) : new Date(0));
      items.push({ r: r, rilDate: rilDate });
    }

    items.sort(function(a, b) { return b.rilDate.getTime() - a.rilDate.getTime(); });

    return items.slice(0, n).map(function(x) {
      var row = vals[x.r];
      var rawScad = row[COL_B.SCADENZA - 1];
      var scadDate = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
      var giorni = (scadDate && !isNaN(scadDate.getTime()))
        ? Math.round((scadDate.getTime() - oggi.getTime()) / 86400000) : null;
      var scadFmt = (scadDate && !isNaN(scadDate.getTime()))
        ? Utilities.formatDate(scadDate, tz, 'd MMM yyyy') : '';
      return {
        id      : String(row[COL_B.ID - 1]),
        titolo  : String(row[COL_B.TITOLO - 1] || ''),
        ente    : String(row[COL_B.ENTE - 1] || row[COL_B.FONTE_NOME - 1] || ''),
        settore : String(row[COL_B.SETTORE - 1] || ''),
        ambito  : String(row[COL_B.AMBITO - 1] || ''),
        scadenza: scadFmt,
        giorni  : giorni,
        isUrgent: giorni !== null && giorni >= 0 && giorni <= 7,
        dataRil : (x.rilDate.getTime() > 0) ? Utilities.formatDate(x.rilDate, tz, 'dd/MM/yyyy') : '',
        link    : String(row[COL_B.URL_BANDO - 1] || row[COL_B.URL_ENTE - 1] || '')
      };
    });
  } catch(e) { console.error('getUltimiBandiV5:', e); return []; }
}

/**
 * Attiva switchover: getBandiListV42 + getUltimiBandiMonitorati leggeranno da Bandi_v5.
 * Eseguire da editor GAS dopo aver verificato che Bandi_v5 abbia dati sufficienti.
 */
function enableBandiV5() {
  PropertiesService.getScriptProperties().setProperty(BANDI_V5_FLAG_PROP, 'true');
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SH_BANDI_V5);
  var nRighe = sh ? sh.getLastRow() - 1 : '?';
  Logger.log('================================================================');
  Logger.log('✅ BANDI V5 SWITCHOVER ATTIVATO');
  Logger.log('   La webapp ora serve dati da Bandi_v5 (' + nRighe + ' bandi)');
  Logger.log('   Per tornare al legacy: lancia disableBandiV5()');
  Logger.log('================================================================');
}

/** Disattiva switchover — la webapp torna a leggere da RADAR BANDI legacy */
function disableBandiV5() {
  PropertiesService.getScriptProperties().deleteProperty(BANDI_V5_FLAG_PROP);
  Logger.log('⚠️ Bandi v5 switchover DISATTIVATO — webapp torna a RADAR BANDI legacy');
}

// v4.18.7 (2026-05-11) — rimossa duplicate isBandiV5Active() (definita prima a riga 393).
// La duplicate sovrascriveva la prima senza try/catch, riducendo robustezza.

/** Stato corrente del sistema — utile per diagnostica (solo Logger) */
function statoBandiV5() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shBandi  = ss.getSheetByName(SH_BANDI_V5);
  var shFonti  = ss.getSheetByName(SH_FONTI_V5);
  var shLog    = ss.getSheetByName(SH_FONTI_LOG);
  var attivo = isBandiV5Active();
  Logger.log('================================================================');
  Logger.log('STATO BANDI V5 — ' + new Date().toLocaleString('it-IT'));
  Logger.log('  Switchover webapp: ' + (attivo ? '✅ ATTIVO' : '⚪ disattivato'));
  Logger.log('  Bandi_v5:         ' + (shBandi  ? (shBandi.getLastRow()-1)  + ' righe' : '❌ NON TROVATO'));
  Logger.log('  FontiBandi_v5:    ' + (shFonti  ? (shFonti.getLastRow()-1)  + ' fonti' : '❌ NON TROVATO'));
  Logger.log('  FontiBandiLog_v5: ' + (shLog    ? (shLog.getLastRow()-1)    + ' log'   : '❌ NON TROVATO'));
  if (shFonti) {
    var vals = shFonti.getDataRange().getValues();
    var attive = 0, disattive = 0, fallite = 0;
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_F.ID - 1]) continue;
      var isAttiva = row[COL_F.ATTIVA - 1] === true || row[COL_F.ATTIVA - 1] === 'TRUE';
      if (isAttiva) attive++; else disattive++;
      if (Number(row[COL_F.FAIL_CONSECUTIVI - 1]) >= 3) fallite++;
    }
    Logger.log('  Fonti attive:  ' + attive);
    Logger.log('  Fonti disatt.: ' + disattive);
    Logger.log('  Fonti con ≥3 fail: ' + fallite);
  }
  Logger.log('================================================================');
}

/**
 * v4.18.7 (2026-05-11) — Diagnostica F2: stato del sistema fonti+bandi in JSON.
 * Chiamabile dal frontend admin tramite google.script.run per popolare
 * la dashboard di gestione fonti monitorate.
 *
 * Ritorna:
 *   {
 *     ok: bool,
 *     attivo_v5: bool,                  // flag switchover
 *     fogli: {
 *       Bandi_v5:        { exists, rows },
 *       FontiBandi_v5:   { exists, rows, attive, disattive, fallite },
 *       FontiBandiLog_v5:{ exists, rows },
 *       RADAR_BANDI:     { exists, rows }  // foglio legacy
 *     },
 *     bandi_v5_recenti: int,    // bandi con scadenza ≥ oggi
 *     bandi_v5_urgenti: int,    // bandi con scadenza entro 7gg
 *     timestamp: ISO
 *   }
 */
function getStatoBandiSistema() {
  var out = { ok: false, timestamp: new Date().toISOString(), attivo_v5: false, fogli: {}, bandi_v5_recenti: 0, bandi_v5_urgenti: 0 };
  try {
    out.attivo_v5 = isBandiV5Active();
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) { out.error = 'Spreadsheet non disponibile'; return out; }

    // 4 fogli rilevanti
    var sheetNames = {
      'Bandi_v5':         SH_BANDI_V5,
      'FontiBandi_v5':    SH_FONTI_V5,
      'FontiBandiLog_v5': SH_FONTI_LOG,
      'RADAR_BANDI':      (typeof SHEET_RADAR === 'string' && SHEET_RADAR) ? SHEET_RADAR : 'RADAR BANDI'
    };
    Object.keys(sheetNames).forEach(function(key){
      var sh = ss.getSheetByName(sheetNames[key]);
      out.fogli[key] = sh ? { exists: true, rows: Math.max(0, sh.getLastRow() - 1) } : { exists: false, rows: 0 };
    });

    // Dettaglio fonti v5 — v4.18.53 lookup dinamico per nome header (resiliente a schema FU17)
    var shFonti = ss.getSheetByName(SH_FONTI_V5);
    if (shFonti) {
      var vals = shFonti.getDataRange().getValues();
      var attive = 0, disattive = 0, fallite = 0;
      if (vals.length >= 2) {
        var H2 = (typeof _fontiV5HeaderMap_ === 'function') ? _fontiV5HeaderMap_(vals[0]) : null;
        var iId2 = -1, iAtt2 = -1, iFail2 = -1;
        if (H2) {
          iId2  = (H2['id'] !== undefined) ? H2['id'] : -1;
          iAtt2 = (H2['attiva'] !== undefined) ? H2['attiva'] : -1;
          iFail2 = (H2['failconsecutivi'] !== undefined) ? H2['failconsecutivi'] : -1;
        }
        // fallback su COL_F se header lookup non disponibile
        if (iId2 < 0)  iId2  = (COL_F.ID || 1) - 1;
        if (iAtt2 < 0) iAtt2 = (COL_F.ATTIVA || 8) - 1;
        if (iFail2 < 0) iFail2 = (COL_F.FAIL_CONSECUTIVI || 14) - 1;
        for (var r = 1; r < vals.length; r++) {
          var row = vals[r];
          if (!row[iId2]) continue;
          var isAttiva = row[iAtt2] === true || row[iAtt2] === 'TRUE' || row[iAtt2] === 'true';
          if (isAttiva) attive++; else disattive++;
          if (Number(row[iFail2] || 0) >= 3) fallite++;
        }
      }
      out.fogli.FontiBandi_v5.attive = attive;
      out.fogli.FontiBandi_v5.disattive = disattive;
      out.fogli.FontiBandi_v5.fallite = fallite;
    }

    // Conteggio recenti/urgenti su Bandi_v5
    var shBandi = ss.getSheetByName(SH_BANDI_V5);
    if (shBandi) {
      var bv = shBandi.getDataRange().getValues();
      var oggi = new Date(); oggi.setHours(0,0,0,0);
      var rec = 0, urg = 0;
      for (var i = 1; i < bv.length; i++) {
        var rr = bv[i];
        if (!rr[COL_B.ID - 1]) continue;
        var stato = String(rr[COL_B.STATO_RECORD - 1] || '').toLowerCase();
        if (stato === 'archiviato') continue;
        var rawScad = rr[COL_B.SCADENZA - 1];
        var sd = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
        if (sd && !isNaN(sd.getTime())) {
          var d = Math.round((sd.getTime() - oggi.getTime()) / 86400000);
          if (d >= 0) rec++;
          if (d >= 0 && d <= 7) urg++;
        }
      }
      out.bandi_v5_recenti = rec;
      out.bandi_v5_urgenti = urg;
    }

    out.ok = true;
  } catch(e) { out.error = e.message; }
  return out;
}

/**
 * v4.18.10 (2026-05-12) — F2.1 elenco fonti con stato (admin diagnostica).
 * Ritorna array di oggetti — una riga per fonte FontiBandi_v5.
 * Ordinato: silenti (fail >=3) prima, poi attive, poi disattivate.
 */
// v4.18.53 — helper lookup dinamico colonne per nome header (resiliente a schema changes)
function _fontiV5HeaderMap_(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = String(headerRow[i] || '').trim().toLowerCase();
    if (key) map[key] = i; // 0-indexed
  }
  return map;
}

function getFontiV5List() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok:false, error:'foglio_assente: ' + SH_FONTI_V5 };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, fonti:[], count:0, _v:'4.18.53' };

    // v4.18.53 — lookup colonne per nome header (resiliente a schema FU17 vs legacy)
    var H = _fontiV5HeaderMap_(vals[0]);
    var col = function(names) {
      for (var i = 0; i < names.length; i++) {
        var n = String(names[i]).toLowerCase();
        if (H[n] !== undefined) return H[n];
      }
      return -1; // not found
    };
    var iId       = col(['id']);
    var iNome     = col(['nome','name']);
    var iUrl      = col(['url']);
    var iTipo     = col(['tipo','type']);
    var iTag      = col(['tag']);
    var iCat      = col(['categoria','category']);
    var iPri      = col(['priorita','priorità','priority']);
    var iAtt      = col(['attiva','active']);
    var iScan     = col(['ultimascan','ultimascansione','ultimascansion','lastscan']);
    var iEsito    = col(['ultimoesito','lastoutcome']);
    var iNTot     = col(['nrecordtotali','nbanditotali','ntotali']);
    var iNUlt     = col(['nrecordultimo','nbandiultimoscan','nultimo']);
    var iFail     = col(['failconsecutivi','fail']);
    var iErr      = col(['ultimoerrore','lasterror']);
    var iLiv      = col(['livello','level']);
    var iExtras   = col(['extras_json','extras']);

    if (iId === -1 || iAtt === -1) {
      return { ok:false, error:'header_invalido (id='+iId+', attiva='+iAtt+'). Header letto: '+JSON.stringify(vals[0]) };
    }

    var tz = Session.getScriptTimeZone() || 'Europe/Rome';
    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[iId]) continue;
      var attivaRaw = row[iAtt];
      var attiva = attivaRaw === true || attivaRaw === 'TRUE' || attivaRaw === 'true';
      var fail = iFail >= 0 ? Number(row[iFail] || 0) : 0;
      var ts = iScan >= 0 ? row[iScan] : null;
      var ultima = '';
      if (ts) {
        try { ultima = Utilities.formatDate(ts instanceof Date ? ts : new Date(ts), tz, 'dd/MM HH:mm'); } catch(_){}
      }
      var urlEnte = '', note = '';
      if (iExtras >= 0) {
        try {
          var extrasRaw = row[iExtras];
          if (extrasRaw && typeof extrasRaw === 'string' && extrasRaw.charAt(0) === '{') {
            var extras = JSON.parse(extrasRaw);
            urlEnte = extras.urlente || extras.UrlEnte || '';
            note    = extras.note || extras.Note || '';
          }
        } catch(_){}
      }
      out.push({
        rowIdx: r + 1,
        id:        row[iId],
        nome:      iNome >= 0 ? (row[iNome] || '') : '',
        url:       iUrl  >= 0 ? (row[iUrl]  || '') : '',
        tipo:      iTipo >= 0 ? (row[iTipo] || '') : '',
        tag:       iTag  >= 0 ? (row[iTag]  || '') : '',
        categoria: iCat  >= 0 ? (row[iCat]  || '') : '',
        priorita:  iPri  >= 0 ? (row[iPri]  || '') : '',
        livello:   iLiv  >= 0 ? (row[iLiv]  || '') : '',
        attiva:    attiva,
        ultimaScansione: ultima,
        ultimoEsito: iEsito >= 0 ? (row[iEsito] || '') : '',
        ultimoErrore: iErr >= 0 ? (row[iErr] || '') : '',
        nBandiTotali: iNTot >= 0 ? Number(row[iNTot] || 0) : 0,
        nBandiUltimo: iNUlt >= 0 ? Number(row[iNUlt] || 0) : 0,
        urlEnte:   urlEnte,
        note:      note,
        fail:      fail,
        silente:   fail >= 3
      });
    }
    out.sort(function(a, b){
      if (a.silente !== b.silente) return a.silente ? -1 : 1;
      if (a.attiva !== b.attiva)   return a.attiva ? -1 : 1;
      return String(a.nome).localeCompare(String(b.nome), 'it');
    });
    return { ok:true, fonti: out, count: out.length, _v:'4.18.53' };
  } catch(e) {
    var errMsg = (e && (e.message || e.stack || String(e))) || 'unknown_error';
    try { Logger.log('getFontiV5List ERROR: ' + errMsg); } catch(_){}
    return { ok:false, error: String(errMsg).substring(0, 500), _v:'4.18.53' };
  }
}

/**
 * v4.18.10 — Attiva/disattiva una fonte FontiBandi_v5.
 * Param: fonteId (string), attiva (bool)
 */
function setFonteV5Attiva(fonteId, attiva) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  try {
    if (!fonteId) return { ok:false, error:'id_richiesto' };
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok:false, error:'foglio_assente' };
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][COL_F.ID - 1]) === String(fonteId)) {
        sh.getRange(r + 1, COL_F.ATTIVA).setValue(!!attiva);
        return { ok:true, id: fonteId, attiva: !!attiva };
      }
    }
    return { ok:false, error:'id_non_trovato' };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.14 (2026-05-12) — F2.2 Cleanup bandi scaduti su Bandi_v5.
 * Marca come 'archiviato' tutti i bandi con scadenza più vecchia di N giorni (default 30).
 * NON cancella le righe — reversibile manualmente dal foglio.
 *
 * Param opzionale: gg (numero giorni-soglia, default 30)
 * Ritorna: { ok, archiviati: int, scansionati: int, soglia_gg: int }
 *
 * Idempotente: bandi già 'archiviato' vengono saltati.
 */
function cleanupBandiV5Scaduti(gg) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  try {
    var sogliaGg = Number(gg) || 30;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_BANDI_V5);
    if (!sh) return { ok:false, error:'foglio_assente' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, archiviati:0, scansionati:0, soglia_gg:sogliaGg };

    var oggi = new Date(); oggi.setHours(0,0,0,0);
    var sogliaMs = oggi.getTime() - (sogliaGg * 86400000);
    var archiviati = 0, scansionati = 0;

    // Itero dall'ultima riga alla prima per evitare problemi se in futuro si decidesse di cancellare.
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      scansionati++;
      var stato = String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase();
      if (stato === 'archiviato') continue;
      var rawScad = row[COL_B.SCADENZA - 1];
      var sd = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
      if (!sd || isNaN(sd.getTime())) continue; // senza scadenza valida, non archivio
      if (sd.getTime() < sogliaMs) {
        sh.getRange(r + 1, COL_B.STATO_RECORD).setValue('archiviato');
        archiviati++;
      }
    }
    Logger.log('cleanupBandiV5Scaduti: ' + archiviati + ' archiviati su ' + scansionati + ' scansionati (soglia ' + sogliaGg + 'gg)');
    return { ok:true, archiviati: archiviati, scansionati: scansionati, soglia_gg: sogliaGg };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.16 (2026-05-12) G — Cleanup duplicati alla radice nel foglio Items.
 * Identifica righe duplicate (stessa FonteURL canonicalizzata, fallback Titolo+Fonte)
 * e le marca come Archiviato=true. NON cancella righe (reversibile).
 * Tiene SEMPRE la prima occorrenza per chiave (la più "vecchia").
 *
 * Param: { dryRun: bool (default false), limite: int (default 0 = senza limite) }
 * Ritorna: { ok, scansionati, duplicati_trovati, archiviati, dryRun, sampleDup: [...] }
 *
 * Idempotente: righe già Archiviato vengono saltate dal conteggio.
 */
function dedupItemsByFingerprint(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var limite = Number(opts.limite) || 0;

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shName = (typeof SH !== 'undefined' && SH && SH.ITEMS) ? SH.ITEMS : 'Items';
    var sh = ss.getSheetByName(shName);
    if (!sh) return { ok:false, error:'foglio_Items_assente' };

    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, scansionati:0, duplicati_trovati:0, archiviati:0, dryRun:dryRun };

    var head = vals[0].map(function(h){ return String(h||'').trim(); });
    // Identifica colonne chiave con lookup case-insensitive
    function findCol(names) {
      for (var i=0;i<head.length;i++) {
        var hl = head[i].toLowerCase();
        for (var j=0;j<names.length;j++) {
          if (hl === names[j].toLowerCase()) return i; // 0-based
        }
      }
      return -1;
    }
    var iURL   = findCol(['FonteURL','Link','URL','Url','url']);
    var iTit   = findCol(['Titolo','Title','title']);
    var iFonte = findCol(['Fonte','Source','Feed','Pub']);
    var iArch  = findCol(['Archiviato','archiviato','ARCHIVIATO']);
    if (iArch < 0) return { ok:false, error:'colonna_Archiviato_assente' };

    var seenK = {};                  // chiave → indice riga della prima occorrenza
    var sampleDup = [];              // primi 5 duplicati trovati (per audit)
    var scansionati = 0, duplicati = 0, archiviati = 0;

    for (var r = 1; r < vals.length; r++) {
      if (limite > 0 && archiviati >= limite) break;
      var row = vals[r];
      // skip righe già archiviate (non le conto nemmeno)
      var archVal = row[iArch];
      var giàArch = (archVal === true || archVal === 'TRUE' || archVal === 1 || String(archVal).toLowerCase() === 'true');
      if (giàArch) continue;
      scansionati++;

      // Costruisci chiave
      var urlVal   = iURL >= 0   ? String(row[iURL] || '').trim().toLowerCase().replace(/\/+$/,'') : '';
      var titVal   = iTit >= 0   ? String(row[iTit] || '').trim().toLowerCase() : '';
      var fonteVal = iFonte >= 0 ? String(row[iFonte] || '').trim().toLowerCase() : '';
      var key = urlVal || (titVal + '|' + fonteVal);
      if (!key || key === '|') continue; // niente chiave utile

      if (seenK[key] != null) {
        // È una duplicata: marca archiviato
        duplicati++;
        if (sampleDup.length < 5) {
          sampleDup.push({
            row: r + 1,
            titolo: String(row[iTit] || '').substring(0, 80),
            primaOccorrenza: seenK[key] + 1
          });
        }
        if (!dryRun) {
          sh.getRange(r + 1, iArch + 1).setValue(true);
          archiviati++;
        }
      } else {
        seenK[key] = r;
      }
    }

    Logger.log('dedupItemsByFingerprint dryRun=' + dryRun + ': scansionati=' + scansionati + ' duplicati=' + duplicati + ' archiviati=' + archiviati);
    return {
      ok: true,
      scansionati: scansionati,
      duplicati_trovati: duplicati,
      archiviati: archiviati,
      dryRun: dryRun,
      sampleDup: sampleDup
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.41 (2026-05-15) — Dedup generico per qualsiasi foglio (Items, Podcast, Pubblicazioni).
 *
 * Identifica righe con stesso URL canonicalizzato (o titolo+fonte come fallback) e le marca
 * Archiviato=true (o equivalente Stato='archiviato' per Podcast). Tiene SEMPRE la prima occorrenza.
 *
 * Tipi supportati: 'items' (news), 'podcast' (audio+video), 'libri' (Pubblicazioni)
 *
 * @param {Object} opts {tipo: 'items'|'podcast'|'libri', dryRun: bool, limite: int}
 * @return {Object} { ok, tipo, sheetName, scansionati, duplicati_trovati, archiviati, sampleDup }
 */
function dedupSheetByFingerprint(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  opts = opts || {};
  var tipo = String(opts.tipo || 'items').toLowerCase();
  var dryRun = !!opts.dryRun;
  var limite = Number(opts.limite) || 0;

  // Config per tipo: foglio target + nome colonna URL + nome colonna flag-archivio + valore archivio
  var TYPE_CONFIG = {
    items: {
      sheet: (typeof SH !== 'undefined' && SH && SH.ITEMS) ? SH.ITEMS : 'Items',
      urlCols: ['FonteURL','Link','URL','Url','url'],
      titoloCols: ['Titolo','Title','title'],
      fonteCols: ['Fonte','Source','Feed','Pub'],
      archCol: ['Archiviato','archiviato','ARCHIVIATO'],
      archValueOnArchive: true // boolean true
    },
    podcast: {
      sheet: 'Podcast',
      urlCols: ['Link','URL','url'],
      titoloCols: ['Titolo','Title'],
      fonteCols: ['Fonte','Serie','Source'],
      archCol: ['StatoRecord','stato'],
      archValueOnArchive: 'archiviato' // stringa
    },
    libri: {
      sheet: (typeof SH !== 'undefined' && SH && SH.LIBRI) ? SH.LIBRI : 'Pubblicazioni',
      urlCols: ['Link','URL','url'],
      titoloCols: ['Titolo','Title'],
      fonteCols: ['Autore','Editore','Fonte'],
      archCol: ['Stato','stato','Archiviato'],
      archValueOnArchive: 'archiviato'
    }
  };
  var cfg = TYPE_CONFIG[tipo];
  if (!cfg) return { ok:false, error:'tipo_non_supportato', validi:Object.keys(TYPE_CONFIG) };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(cfg.sheet);
    if (!sh) return { ok:false, error:'foglio_' + cfg.sheet + '_assente' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) {
      return { ok:true, tipo:tipo, sheetName:cfg.sheet, scansionati:0, duplicati_trovati:0, archiviati:0, dryRun:dryRun };
    }

    var head = vals[0].map(function(h){ return String(h||'').trim(); });
    function findCol(names) {
      for (var i=0;i<head.length;i++) {
        var hl = head[i].toLowerCase();
        for (var j=0;j<names.length;j++) if (hl === names[j].toLowerCase()) return i;
      }
      return -1;
    }
    var iURL   = findCol(cfg.urlCols);
    var iTit   = findCol(cfg.titoloCols);
    var iFonte = findCol(cfg.fonteCols);
    var iArch  = findCol(cfg.archCol);
    if (iArch < 0) return { ok:false, error:'colonna_archivio_assente_in_'+cfg.sheet };

    var seenK = {};
    var sampleDup = [];
    var scansionati = 0, duplicati = 0, archiviati = 0;

    for (var r = 1; r < vals.length; r++) {
      if (limite > 0 && archiviati >= limite) break;
      var row = vals[r];
      var archVal = row[iArch];
      // Salta righe già archiviate
      var giàArch = (
        archVal === true ||
        String(archVal).toLowerCase() === 'true' ||
        String(archVal).toLowerCase() === 'archiviato' ||
        archVal === 1
      );
      if (giàArch) continue;
      scansionati++;

      var urlRaw = iURL >= 0 ? String(row[iURL] || '').trim() : '';
      var urlCanon = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(urlRaw) : urlRaw.toLowerCase();
      var titVal = iTit >= 0 ? String(row[iTit] || '').trim().toLowerCase() : '';
      var fonteVal = iFonte >= 0 ? String(row[iFonte] || '').trim().toLowerCase() : '';
      var key = urlCanon || (titVal + '|' + fonteVal);
      if (!key || key === '|') continue;

      if (seenK[key] != null) {
        duplicati++;
        if (sampleDup.length < 5) {
          sampleDup.push({
            row: r + 1,
            titolo: String(row[iTit] || '').substring(0, 80),
            primaOccorrenza: seenK[key] + 1
          });
        }
        if (!dryRun) {
          sh.getRange(r + 1, iArch + 1).setValue(cfg.archValueOnArchive);
          archiviati++;
        }
      } else {
        seenK[key] = r;
      }
    }

    Logger.log('dedupSheetByFingerprint tipo=' + tipo + ' dryRun=' + dryRun
      + ': scansionati=' + scansionati + ' duplicati=' + duplicati + ' archiviati=' + archiviati);
    return {
      ok: true,
      tipo: tipo,
      sheetName: cfg.sheet,
      scansionati: scansionati,
      duplicati_trovati: duplicati,
      archiviati: archiviati,
      dryRun: dryRun,
      sampleDup: sampleDup
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.41 (2026-05-15) — Dedup orchestratore: esegue dedup su TUTTI i fogli supportati.
 * Chiamato da bottone admin "Pulisci duplicati ovunque" + trigger automatico settimanale.
 *
 * @param {Object} opts {dryRun: bool}
 * @return {Object} { ok, perTipo: { items:{...}, podcast:{...}, libri:{...} }, totale_archiviati }
 */
function dedupTuttiIFogli(opts) {
  opts = opts || {};
  var out = { ok:true, perTipo: {}, totale_archiviati: 0, totale_duplicati: 0 };
  ['items','podcast','libri'].forEach(function(tipo){
    var r = dedupSheetByFingerprint({ tipo: tipo, dryRun: !!opts.dryRun });
    out.perTipo[tipo] = r;
    if (r.ok) {
      out.totale_archiviati += (r.archiviati || 0);
      out.totale_duplicati  += (r.duplicati_trovati || 0);
    }
  });
  Logger.log('dedupTuttiIFogli dryRun=' + !!opts.dryRun
    + ': totale_dup=' + out.totale_duplicati + ' archiviati=' + out.totale_archiviati);
  return out;
}

/**
 * v4.18.42 (2026-05-15) — Quality check bandi: trova duplicati semantici cross-fonte,
 * scadenze sospette e tematiche incoerenti.
 *
 * 1) DUPLICATI SEMANTICI: stesso bando pubblicato da fonti diverse (Artribune + sito istituzionale
 *    + giornale fondazioni → 3 righe per stesso bando). Chiave: ente_normalizzato + scadenza_iso
 *    + first-50-char-titolo-normalizzato. Tiene la riga con sommario più lungo + score migliore.
 *
 * 2) SCADENZE SOSPETTE: vuote, passate da >30gg ma stato='attivo', future >2 anni (errore parsing).
 *
 * 3) TEMATICHE INCOERENTI: Ambito vuoto, oppure Ambito non coerente con Settore noto.
 *    Mapping settore→ambito atteso (semplice keyword match su settore/titolo).
 *
 * Idempotente. Modalità dry-run di default (action='audit'). Per applicare correzioni: action='fix-dup' o 'fix-tematiche'.
 *
 * @param {Object} opts {action: 'audit'|'fix-dup'|'fix-tematiche', dryRun: bool}
 * @return {Object} { ok, duplicati, scadenze, tematiche, fixApplied? }
 */
function qualityCheckBandi(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  opts = opts || {};
  var action = String(opts.action || 'audit').toLowerCase();

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_BANDI_V5);
    if (!sh) return { ok:false, error:'Foglio Bandi_v5 non trovato' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, totale:0, duplicati:[], scadenze:[], tematiche:[] };

    // ===== Helper: normalizza testo per chiave dedup =====
    function _normText(s) {
      return String(s || '').toLowerCase()
        .replace(/[àáâãä]/g,'a').replace(/[èéêë]/g,'e').replace(/[ìíîï]/g,'i')
        .replace(/[òóôõö]/g,'o').replace(/[ùúûü]/g,'u')
        .replace(/[^a-z0-9]+/g,' ')
        .replace(/\s+/g,' ').trim();
    }
    function _scadenzaISO(v) {
      if (!v) return '';
      try {
        var d = (v instanceof Date) ? v : new Date(v);
        if (isNaN(d.getTime())) return '';
        return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Europe/Rome', 'yyyy-MM-dd');
      } catch(e) { return ''; }
    }

    var oggi = new Date(); oggi.setHours(0,0,0,0);
    var soglia30gg = new Date(oggi.getTime() - 30*86400000);
    var soglia2anni = new Date(oggi.getTime() + 2*365*86400000);

    // ===== 1. DUPLICATI SEMANTICI =====
    var bandiAttivi = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
      bandiAttivi.push({
        rowIdx: r + 1,
        id: String(row[COL_B.ID - 1]),
        titolo: String(row[COL_B.TITOLO - 1] || ''),
        ente: String(row[COL_B.ENTE - 1] || ''),
        scadenza: row[COL_B.SCADENZA - 1],
        sommarioLen: String(row[COL_B.SOMMARIO - 1] || '').length,
        fonteNome: String(row[COL_B.FONTE_NOME - 1] || ''),
        ambito: row[COL_B.AMBITO - 1],
        settore: String(row[COL_B.SETTORE - 1] || ''),
        url: String(row[COL_B.URL_BANDO - 1] || '')
      });
    }

    // Costruisci chiavi semantiche
    var seen = {};
    var duplicatiGroups = {};
    bandiAttivi.forEach(function(b){
      var eNorm = _normText(b.ente).substring(0, 30);
      var tNorm = _normText(b.titolo).substring(0, 50);
      var scaISO = _scadenzaISO(b.scadenza);
      // Chiave: ente + scadenza + titolo(50). Se manca ente, usa fonte.
      var key = (eNorm || _normText(b.fonteNome).substring(0,20)) + '|' + scaISO + '|' + tNorm;
      if (!seen[key]) { seen[key] = []; }
      seen[key].push(b);
    });
    var duplicatiList = [];
    Object.keys(seen).forEach(function(k){
      if (seen[k].length > 1) {
        // Ordina: il più completo (sommario più lungo) come primo
        var group = seen[k].slice().sort(function(a, b){ return b.sommarioLen - a.sommarioLen; });
        duplicatiGroups[k] = group;
        duplicatiList.push({
          key: k.substring(0, 80),
          count: group.length,
          tenere: { rowIdx: group[0].rowIdx, id: group[0].id, titolo: group[0].titolo.substring(0,60), fonte: group[0].fonteNome },
          archiviare: group.slice(1).map(function(b){ return { rowIdx: b.rowIdx, id: b.id, titolo: b.titolo.substring(0,60), fonte: b.fonteNome }; })
        });
      }
    });

    // ===== 2. SCADENZE SOSPETTE =====
    var scadenzeSospette = [];
    bandiAttivi.forEach(function(b){
      var probl = null;
      if (!b.scadenza) {
        probl = 'vuota';
      } else {
        var d = (b.scadenza instanceof Date) ? b.scadenza : new Date(b.scadenza);
        if (isNaN(d.getTime())) {
          probl = 'parsing_fallito';
        } else if (d < soglia30gg) {
          probl = 'passata_>30gg_ma_attivo';
        } else if (d > soglia2anni) {
          probl = 'futura_>2_anni';
        }
      }
      if (probl) {
        scadenzeSospette.push({
          rowIdx: b.rowIdx,
          id: b.id,
          titolo: b.titolo.substring(0,60),
          ente: b.ente.substring(0,40),
          scadenzaRaw: String(b.scadenza || ''),
          problema: probl
        });
      }
    });

    // ===== 3. TEMATICHE INCOERENTI =====
    // Mapping keyword → ambito (1=Identità, 2=Inclusione, 3=Programma, 4=Comunità, 5=Digital)
    var AMBITO_KEYWORDS = {
      1: ['identità','identita','identitaria','narrazione','brand','heritage','storia','memoria'],
      2: ['accessibil','inclus','disabilit','lis ','autismo','etr','easy to read','barriere','sordo','cieco','dsa','autistic'],
      3: ['mostra','allestimento','collezione','catalogo','esposizione','programmazione','rete museale','riallestimento'],
      4: ['comunit','welfare','partecipa','giovani','anziani','quartiere','periferia','sociale','territorio','quartiere'],
      5: ['digital','ai ','intelligenza artificiale','cms','tecnolog','ict','smart','data','virtual','app ','online','sito web']
    };
    function inferiscoAmbito(titolo, settore, sommario) {
      var testo = _normText(titolo + ' ' + (settore || '') + ' ' + (sommario || ''));
      var scores = {1:0, 2:0, 3:0, 4:0, 5:0};
      Object.keys(AMBITO_KEYWORDS).forEach(function(amb){
        AMBITO_KEYWORDS[amb].forEach(function(kw){
          if (testo.indexOf(_normText(kw)) >= 0) scores[amb]++;
        });
      });
      var maxScore = 0, maxAmb = 0;
      Object.keys(scores).forEach(function(a){ if (scores[a] > maxScore) { maxScore = scores[a]; maxAmb = Number(a); } });
      return maxScore > 0 ? maxAmb : null;
    }

    var tematicheIncoerenti = [];
    bandiAttivi.forEach(function(b){
      var ambAttuale = Number(b.ambito) || 0;
      var ambInferito = inferiscoAmbito(b.titolo, b.settore, '');
      var probl = null;
      if (!ambAttuale || ambAttuale < 1 || ambAttuale > 5) {
        probl = 'ambito_vuoto';
      } else if (ambInferito && ambInferito !== ambAttuale) {
        probl = 'ambito_diverso_da_inferito';
      }
      if (probl) {
        tematicheIncoerenti.push({
          rowIdx: b.rowIdx,
          id: b.id,
          titolo: b.titolo.substring(0,60),
          settore: b.settore.substring(0,30),
          ambitoAttuale: ambAttuale || null,
          ambitoSuggerito: ambInferito,
          problema: probl
        });
      }
    });

    var result = {
      ok: true,
      action: action,
      totaleBandiAttivi: bandiAttivi.length,
      duplicati: {
        gruppi: duplicatiList.length,
        righeDaArchiviare: duplicatiList.reduce(function(s, g){ return s + g.archiviare.length; }, 0),
        sample: duplicatiList.slice(0, 10)
      },
      scadenze: {
        totale: scadenzeSospette.length,
        sample: scadenzeSospette.slice(0, 20)
      },
      tematiche: {
        totale: tematicheIncoerenti.length,
        vuote: tematicheIncoerenti.filter(function(t){ return t.problema === 'ambito_vuoto'; }).length,
        diverse: tematicheIncoerenti.filter(function(t){ return t.problema === 'ambito_diverso_da_inferito'; }).length,
        sample: tematicheIncoerenti.slice(0, 20)
      }
    };

    // ===== AZIONI CORRETTIVE =====
    if (action === 'fix-dup') {
      var archived = 0;
      Object.keys(duplicatiGroups).forEach(function(k){
        var group = duplicatiGroups[k];
        for (var i = 1; i < group.length; i++) {
          sh.getRange(group[i].rowIdx, COL_B.STATO_RECORD).setValue('archiviato');
          sh.getRange(group[i].rowIdx, COL_B.NOTE).setValue(
            (sh.getRange(group[i].rowIdx, COL_B.NOTE).getValue() || '') +
            ' [dedup-sem v4.18.42: duplicato di rigaID=' + group[0].id + ']'
          );
          archived++;
        }
      });
      result.fixApplied = { archiviati: archived };
    } else if (action === 'fix-tematiche') {
      var fixed = 0;
      tematicheIncoerenti.forEach(function(t){
        if (t.ambitoSuggerito && t.problema === 'ambito_vuoto') {
          sh.getRange(t.rowIdx, COL_B.AMBITO).setValue(t.ambitoSuggerito);
          fixed++;
        }
        // Per 'ambito_diverso_da_inferito' NON correggiamo automaticamente
        // (potrebbe essere il tagger sbagliato, non il bando) — solo segnalazione.
      });
      result.fixApplied = { ambitiAssegnati: fixed, nota: 'I bandi con ambito_diverso_da_inferito vanno rivisti manualmente' };
    }

    Logger.log('qualityCheckBandi action=' + action
      + ' dup_gruppi=' + result.duplicati.gruppi
      + ' scad_sospette=' + result.scadenze.totale
      + ' tem_incoerenti=' + result.tematiche.totale);
    return result;
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.43 (2026-05-15) — Wrapper "auto" del quality check: esegue fix-dup + fix-tematiche
 * in modo non interattivo (senza confirm), salta il check admin perché il trigger gira come
 * USER_DEPLOYING (=Silvano), logga sul foglio QualityCheckLog_v5.
 *
 * Chiamato da:
 *   1. scanFontiTutte() alla fine (se ci sono stati bandi nuovi)
 *   2. Trigger giornaliero 05:00 (vedi setupQualityCheckBandiTrigger)
 *
 * @param {Object} opts {source: 'post-scan'|'daily-05'|'manual'}
 * @return {Object} {ok, source, timestamp, dup_archiviati, tem_ambiti_assegnati, scad_sospette}
 */
function qualityCheckBandiAuto(opts) {
  opts = opts || {};
  var source = String(opts.source || 'manual');
  var t0 = new Date().getTime();
  var result = { ok:true, source: source, timestamp: new Date().toISOString(), dup_archiviati:0, tem_ambiti_assegnati:0, scad_sospette:0 };

  try {
    // Step 1: archivia duplicati semantici
    var rDup = qualityCheckBandi({ action: 'fix-dup' });
    if (rDup && rDup.ok) {
      result.dup_archiviati = (rDup.fixApplied && rDup.fixApplied.archiviati) || 0;
      result.dup_gruppi = (rDup.duplicati && rDup.duplicati.gruppi) || 0;
      result.scad_sospette = (rDup.scadenze && rDup.scadenze.totale) || 0;
    } else {
      result.warning_dup = rDup && rDup.error || 'sconosciuto';
    }
    // Step 2: assegna ambiti vuoti
    var rTem = qualityCheckBandi({ action: 'fix-tematiche' });
    if (rTem && rTem.ok) {
      result.tem_ambiti_assegnati = (rTem.fixApplied && rTem.fixApplied.ambitiAssegnati) || 0;
      result.tem_diversi = (rTem.tematiche && rTem.tematiche.diverse) || 0;
    } else {
      result.warning_tem = rTem && rTem.error || 'sconosciuto';
    }

    result.duration_ms = new Date().getTime() - t0;

    // Step 3: log su foglio QualityCheckLog_v5 (per audit storico)
    try { _appendQualityCheckLog_(result); } catch(eLog) { Logger.log('Log QC fallito: ' + eLog.message); }

    Logger.log('qualityCheckBandiAuto source=' + source
      + ': dup_archiviati=' + result.dup_archiviati
      + ' ambiti_assegnati=' + result.tem_ambiti_assegnati
      + ' scad_sospette=' + result.scad_sospette
      + ' (' + result.duration_ms + 'ms)');

    // Step 4: notifica Telegram SOLO se ci sono scadenze sospette (intervento manuale richiesto)
    if (result.scad_sospette > 0 && typeof _tgSend_ === 'function') {
      try {
        _tgSend_('🧪 *Quality check bandi* (' + source + ')\n'
          + '• Duplicati archiviati: ' + result.dup_archiviati + '\n'
          + '• Ambiti assegnati: ' + result.tem_ambiti_assegnati + '\n'
          + '⚠️ *Scadenze sospette*: ' + result.scad_sospette + ' bandi da rivedere manualmente nel foglio Bandi\\_v5');
      } catch(eTg) {}
    }

    return result;
  } catch(e) {
    result.ok = false;
    result.error = e.message;
    Logger.log('qualityCheckBandiAuto ERRORE: ' + e.message);
    return result;
  }
}

/**
 * v4.18.43 (2026-05-15) — Append riga al foglio QualityCheckLog_v5 (audit storico).
 * Crea il foglio se non esiste.
 * @private
 */
function _appendQualityCheckLog_(r) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('QualityCheckLog_v5');
  if (!sh) {
    sh = ss.insertSheet('QualityCheckLog_v5');
    sh.getRange(1, 1, 1, 8).setValues([[
      'timestamp','source','dup_gruppi','dup_archiviati','tem_ambiti_assegnati','tem_diversi','scad_sospette','duration_ms'
    ]]).setFontWeight('bold').setBackground('#3F7A5E').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  sh.appendRow([
    r.timestamp, r.source,
    r.dup_gruppi || 0, r.dup_archiviati || 0,
    r.tem_ambiti_assegnati || 0, r.tem_diversi || 0,
    r.scad_sospette || 0,
    r.duration_ms || 0
  ]);
}

/**
 * v4.18.43 (2026-05-15) — Installa trigger time-based GIORNALIERO alle 05:00 che esegue
 * qualityCheckBandiAuto. Idempotente: rimuove trigger esistente prima di crearlo.
 *
 * Da chiamare UNA volta dall'editor GAS o dal pannello admin.
 */
function setupQualityCheckBandiTrigger() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var rimossi = 0;
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'qualityCheckBandiAutoDaily') {
        ScriptApp.deleteTrigger(t); rimossi++;
      }
    });
    // Trigger giornaliero ore 05:00 — chiama un wrapper che setta source='daily-05'
    ScriptApp.newTrigger('qualityCheckBandiAutoDaily')
      .timeBased().everyDays(1).atHour(5).nearMinute(0).create();
    Logger.log('Trigger qualityCheckBandiAutoDaily installato: ogni giorno 05:00. (rimossi ' + rimossi + ' precedenti)');
    return { ok:true, schedule:'ogni giorno 05:00', rimossi_precedenti: rimossi };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.43 (2026-05-15) — Wrapper invocato dal trigger giornaliero (handler dedicato per
 * tracciabilità del source). Chiama qualityCheckBandiAuto con source='daily-05'.
 */
function qualityCheckBandiAutoDaily() {
  return qualityCheckBandiAuto({ source: 'daily-05' });
}

/**
 * v4.18.43 (2026-05-15) — Ritorna le ultime N righe del foglio QualityCheckLog_v5
 * per visualizzazione storico nel pannello admin.
 *
 * @param {Object} opts {limit: int (default 20)}
 * @return {Object} {ok, rows: [{timestamp, source, dup_gruppi, dup_archiviati, tem_ambiti_assegnati, tem_diversi, scad_sospette, duration_ms}]}
 */
function getQualityCheckLog(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  opts = opts || {};
  var limit = Number(opts.limit) || 20;
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('QualityCheckLog_v5');
    if (!sh) return { ok:true, rows: [], note: 'Foglio QualityCheckLog_v5 non ancora creato (verrà popolato alla prima esecuzione)' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, rows: [] };
    var headers = vals[0];
    var rows = [];
    // dalla fine al inizio, max `limit`
    for (var r = vals.length - 1; r >= 1 && rows.length < limit; r--) {
      var row = vals[r];
      var obj = {};
      headers.forEach(function(h, i){ obj[h] = row[i]; });
      rows.push(obj);
    }
    return { ok:true, rows: rows };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.41 (2026-05-15) — Trigger automatico settimanale: pulisce duplicati ogni lunedì alle 06:30.
 * Pre-condizione lunediMattina(): rimuove i doppi prima del digest.
 *
 * Da chiamare UNA volta dall'editor GAS per installare il trigger.
 */
function setupDedupAutoTrigger() {
  // Rimuovi trigger esistente
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'dedupTuttiIFogli') ScriptApp.deleteTrigger(t);
  });
  // Lunedì 06:30 (prima del digest delle 07:00)
  ScriptApp.newTrigger('dedupTuttiIFogli')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).nearMinute(30).create();
  Logger.log('Trigger dedupTuttiIFogli installato per lunedì 06:30.');
  return { ok:true, schedule: 'lunedì 06:30' };
}

/**
 * v4.18.14 (2026-05-12) F2/Campanella — Riepilogo per la campanella notifiche in topbar.
 * Aggrega in un'unica call: stato scanner, bandi urgenti+nuovi-oggi, fonti silenti, news recenti.
 *
 * Ritorna:
 *   {
 *     ok, timestamp,
 *     scanner: { ultimaScan: "12/05 09:55", fontiAttive, fontiSilenti },
 *     bandi:   { urgenti: int, nuoviOggi: int, totaleAperti: int, top: [ {id,titolo,giorni,scadenza,ente,link} x5 ] },
 *     news:    { ultime24h: int },
 *     totalNotifiche: int // numero totale di "cose nuove" oggi (per badge)
 *   }
 */
function getNotificheRiepilogo() {
  var out = { ok:false, timestamp: new Date().toISOString(), scanner:{}, bandi:{}, news:{}, totalNotifiche:0 };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) { out.error = 'Spreadsheet non disponibile'; return out; }
    var tz = Session.getScriptTimeZone() || 'Europe/Rome';
    var oggi = new Date(); oggi.setHours(0,0,0,0);
    var ieri24h = Date.now() - (24*3600*1000);

    // === Scanner: stato fonti (ultima scansione + attive/silenti) ===
    var shFonti = ss.getSheetByName(SH_FONTI_V5);
    var ultimaScanTs = 0, fontiAttive = 0, fontiSilenti = 0;
    if (shFonti) {
      var vF = shFonti.getDataRange().getValues();
      for (var r = 1; r < vF.length; r++) {
        if (!vF[r][COL_F.ID - 1]) continue;
        var att = vF[r][COL_F.ATTIVA - 1] === true || vF[r][COL_F.ATTIVA - 1] === 'TRUE';
        if (att) fontiAttive++;
        if (Number(vF[r][COL_F.FAIL_CONSECUTIVI - 1] || 0) >= 3) fontiSilenti++;
        var ts = vF[r][COL_F.ULTIMA_SCANSIONE - 1];
        if (ts) {
          var ms = (ts instanceof Date) ? ts.getTime() : new Date(ts).getTime();
          if (ms > ultimaScanTs) ultimaScanTs = ms;
        }
      }
    }
    out.scanner = {
      ultimaScan: ultimaScanTs ? Utilities.formatDate(new Date(ultimaScanTs), tz, 'dd/MM HH:mm') : '—',
      fontiAttive: fontiAttive,
      fontiSilenti: fontiSilenti
    };

    // === Bandi: urgenti (≤7gg), nuovi rilevati oggi, totale aperti, top 5 urgenti ===
    var shBandi = ss.getSheetByName(SH_BANDI_V5);
    var urgenti = 0, nuoviOggi = 0, aperti = 0;
    var topUrgenti = [];
    if (shBandi) {
      var vB = shBandi.getDataRange().getValues();
      for (var i = 1; i < vB.length; i++) {
        var b = vB[i];
        if (!b[COL_B.ID - 1]) continue;
        var stato = String(b[COL_B.STATO_RECORD - 1] || '').toLowerCase();
        if (stato === 'archiviato') continue;
        // scadenza
        var rawScad = b[COL_B.SCADENZA - 1];
        var sd = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
        var gg = (sd && !isNaN(sd.getTime())) ? Math.round((sd.getTime() - oggi.getTime()) / 86400000) : null;
        if (gg !== null && gg >= 0) aperti++;
        if (gg !== null && gg >= 0 && gg <= 7) {
          urgenti++;
          if (topUrgenti.length < 5) {
            topUrgenti.push({
              id:       b[COL_B.ID - 1],
              titolo:   b[COL_B.TITOLO - 1] || '(senza titolo)',
              ente:     b[COL_B.ENTE - 1] || '',
              scadenza: sd ? Utilities.formatDate(sd, tz, 'dd/MM') : '',
              giorni:   gg,
              link:     b[COL_B.URL_BANDO - 1] || b[COL_B.URL_ENTE - 1] || ''
            });
          }
        }
        // nuovi oggi
        var rawRil = b[COL_B.DATA_RILEVAMENTO - 1];
        if (rawRil) {
          var rd = (rawRil instanceof Date) ? rawRil : new Date(rawRil);
          if (!isNaN(rd.getTime()) && rd.getTime() >= oggi.getTime()) nuoviOggi++;
        }
      }
      // sort top urgenti per giorni ASC
      topUrgenti.sort(function(a,b){ return a.giorni - b.giorni; });
    }
    out.bandi = { urgenti: urgenti, nuoviOggi: nuoviOggi, totaleAperti: aperti, top: topUrgenti };

    // === News: conteggio ultimi 24h (legge foglio Items) ===
    var shItems = ss.getSheetByName((typeof SH !== 'undefined' && SH && SH.ITEMS) ? SH.ITEMS : 'Items');
    var news24 = 0;
    if (shItems) {
      var vI = shItems.getDataRange().getValues();
      if (vI.length > 1) {
        var head = vI[0].map(function(h){ return String(h||'').trim(); });
        // cerco colonna data flessibile
        var iData = -1;
        for (var k = 0; k < head.length; k++) {
          var hh = head[k].toLowerCase();
          if (hh === 'datapubblicazione' || hh === 'data_pubblicazione' || hh === 'data' || hh === 'data_rilevamento' || hh === 'dataacquisizione') { iData = k; break; }
        }
        if (iData < 0) iData = 13; // fallback colonna 14 (DataPubblicazione)
        for (var j = 1; j < vI.length; j++) {
          var d = vI[j][iData];
          if (!d) continue;
          var dt = (d instanceof Date) ? d : new Date(d);
          if (!isNaN(dt.getTime()) && dt.getTime() >= ieri24h) news24++;
        }
      }
    }
    out.news = { ultime24h: news24 };

    out.totalNotifiche = urgenti + nuoviOggi + (fontiSilenti > 0 ? 1 : 0);
    out.ok = true;
  } catch(e) { out.error = e.message; }
  return out;
}

/**
 * v4.18.10 — Reset fail counter di una fonte (per ripristinarla da silente).
 * Non rilancia subito lo scan (lo farà il prossimo trigger Lun/Mer/Ven).
 */
function riprovaFonteV5(fonteId) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  try {
    if (!fonteId) return { ok:false, error:'id_richiesto' };
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok:false, error:'foglio_assente' };
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][COL_F.ID - 1]) === String(fonteId)) {
        sh.getRange(r + 1, COL_F.FAIL_CONSECUTIVI).setValue(0);
        sh.getRange(r + 1, COL_F.ULTIMO_ERRORE).setValue('');
        // Riattiva se era stata auto-disattivata
        sh.getRange(r + 1, COL_F.ATTIVA).setValue(true);
        return { ok:true, id: fonteId, fail: 0 };
      }
    }
    return { ok:false, error:'id_non_trovato' };
  } catch(e) { return { ok:false, error: e.message }; }
}


// ============================================================================
// FASE 5 — ALERT TELEGRAM + DIGEST BANDI V5
// ----------------------------------------------------------------------------
// sendBandiAlertV5()  → invia alert bandi urgenti (≤7gg) via Telegram
// digestBandiV5(n)    → invia digest con gli n bandi più recenti via email
// Chiamabili anche da trigger automatico (setupBandiV5Triggers già imposta Lun/Mer/Ven)
// ============================================================================

/**
 * Invia alert Telegram con i bandi in scadenza nei prossimi 7 giorni.
 * Sostituisce bandiEvery3Days / sendBandiAlert quando v5 è attivo.
 * Chiamabile manualmente o da trigger.
 */
function sendBandiAlertV5() {
  try {
    Logger.log('=== ALERT BANDI V5 ===');

    // Prende bandi urgenti da Bandi_v5
    var tutti = getBandiV5(200);
    var urgenti = tutti.filter(function(b) {
      return b.giorni !== null && b.giorni >= 0 && b.giorni <= 7;
    });
    var prossimi = tutti.filter(function(b) {
      return b.giorni !== null && b.giorni > 7 && b.giorni <= 14;
    });

    Logger.log('  Urgenti (≤7gg): ' + urgenti.length);
    Logger.log('  Prossimi (8-14gg): ' + prossimi.length);

    if (!urgenti.length && !prossimi.length) {
      Logger.log('  Nessun bando in scadenza breve — alert non inviato');
      return { ok: true, sent: false, motivo: 'nessun bando urgente' };
    }

    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Rome', 'dd/MM/yyyy HH:mm');
    var lines = ['🔴 <b>Osservatorio Culturale — Radar Bandi</b>', ts, ''];

    if (urgenti.length) {
      lines.push('⚡ <b>IN SCADENZA (≤ 7 giorni)</b>');
      urgenti.slice(0, 8).forEach(function(b) {
        var giorni = b.giorni === 0 ? 'OGGI' : b.giorni + ' gg';
        lines.push('');
        lines.push('• <b>' + _tgEscV5_(b.titolo) + '</b>');
        lines.push('  ' + _tgEscV5_(b.ente || '') + (b.settore ? ' · ' + _tgEscV5_(b.settore) : ''));
        lines.push('  📅 Scade: ' + _tgEscV5_(b.scadenza) + ' (<b>' + giorni + '</b>)');
        if (b.link) lines.push('  🔗 ' + b.link);
      });
      if (urgenti.length > 8) lines.push('  ... e altri ' + (urgenti.length - 8) + ' bandi urgenti');
    }

    if (prossimi.length) {
      lines.push('');
      lines.push('📌 <b>IN SCADENZA 8-14 GIORNI</b>');
      prossimi.slice(0, 5).forEach(function(b) {
        lines.push('• ' + _tgEscV5_(b.titolo) + ' — scade ' + _tgEscV5_(b.scadenza) + ' (' + b.giorni + ' gg)');
        if (b.link) lines.push('  🔗 ' + b.link);
      });
    }

    lines.push('');
    lines.push('<i>Tot. bandi monitorati: ' + tutti.length + '</i>');

    var msg = lines.join('\n');
    // _tgSend_ è in Telegram_v44.js (scope globale GAS)
    var res = (typeof _tgSend_ === 'function') ? _tgSend_(msg) : { ok: false, error: '_tgSend_ non disponibile' };

    if (res && res.ok) {
      Logger.log('✅ Alert Telegram inviato — ' + urgenti.length + ' urgenti, ' + prossimi.length + ' prossimi');
    } else {
      Logger.log('❌ Errore invio Telegram: ' + JSON.stringify(res));
    }
    return res;
  } catch(e) { Logger.log('ERR sendBandiAlertV5: ' + e.message); return { ok: false, error: e.message }; }
}

/**
 * Invia digest email con gli ultimi N bandi rilevati.
 * Usa MailApp.sendEmail — chiamabile manualmente o da trigger.
 * @param {number} n — quanti bandi includere (default 20)
 * @param {string} toEmail — email destinatario (default: OC_ADMIN_EMAILS)
 */
function digestBandiV5(n, toEmail) {
  try {
    var nBandi = Number(n) || 20;
    var email = toEmail
      || PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS')
      || 's.straccini@gmail.com';

    var bandi = getBandiV5(nBandi);
    if (!bandi.length) {
      Logger.log('digestBandiV5: nessun bando — email non inviata');
      return { ok: false, motivo: 'nessun bando' };
    }

    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Rome', 'dd MMMM yyyy');
    var urgenti = bandi.filter(function(b){ return b.isUrgent; });
    var altri   = bandi.filter(function(b){ return !b.isUrgent; });

    var htmlRows = '';
    function rigaBando(b) {
      var giorniStr = b.giorni === null ? '' : b.giorni < 0 ? '<span style="color:#888">Scaduto</span>' : b.giorni <= 7 ? '<b style="color:#C8102E">'+b.giorni+' gg</b>' : b.giorni <= 14 ? '<b style="color:#9C6A36">'+b.giorni+' gg</b>' : b.giorni+' gg';
      var linkTag = b.link ? '<a href="'+b.link+'" style="color:#7A2A1A">→ Apri scheda</a>' : '—';
      return '<tr style="border-bottom:1px solid #E5E1D8">'
        + '<td style="padding:12px 8px;font-family:Georgia,serif;font-size:15px;line-height:1.4"><b>' + escHtml(b.titolo) + '</b><br><span style="font-size:13px;color:#6E6A62">' + escHtml(b.ente) + (b.settore?' · '+escHtml(b.settore):'') + '</span>'+(b.sommario?'<br><span style="font-size:12px;color:#9A958B">'+escHtml(b.sommario.slice(0,120))+'...</span>':'')+'</td>'
        + '<td style="padding:12px 8px;white-space:nowrap;font-size:13px;color:#3A3631">' + escHtml(b.scadenza||'—') + '</td>'
        + '<td style="padding:12px 8px;text-align:center">' + giorniStr + '</td>'
        + '<td style="padding:12px 8px">' + linkTag + '</td>'
        + '</tr>';
    }

    if (urgenti.length) {
      htmlRows += '<tr><td colspan="4" style="padding:10px 8px;background:#FEF2F2;font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#991B1B">⚡ In scadenza entro 7 giorni</td></tr>';
      urgenti.forEach(function(b){ htmlRows += rigaBando(b); });
    }
    if (altri.length) {
      htmlRows += '<tr><td colspan="4" style="padding:10px 8px;background:#F3F0E9;font-family:sans-serif;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6E6A62">Bandi monitorati</td></tr>';
      altri.forEach(function(b){ htmlRows += rigaBando(b); });
    }

    var htmlBody = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF8F4;font-family:Georgia,serif">'
      + '<div style="max-width:700px;margin:0 auto;padding:32px 16px">'
      + '<p style="font-family:sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#9A958B">Osservatorio Culturale · Duemilamusei</p>'
      + '<h1 style="font-size:36px;font-weight:500;letter-spacing:-0.02em;color:#1A1815;margin:0 0 4px">Radar <em>Bandi</em></h1>'
      + '<p style="font-size:14px;color:#6E6A62;margin:0 0 32px">' + ts + ' · ' + bandi.length + ' bandi monitorati</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:2px solid #1A1815">'
      + '<thead><tr style="border-bottom:1px solid #E5E1D8">'
      + '<th style="padding:10px 8px;text-align:left;font-family:sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9A958B">Bando</th>'
      + '<th style="padding:10px 8px;font-family:sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9A958B;white-space:nowrap">Scadenza</th>'
      + '<th style="padding:10px 8px;font-family:sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9A958B">Giorni</th>'
      + '<th style="padding:10px 8px;font-family:sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9A958B">Link</th>'
      + '</tr></thead>'
      + '<tbody>' + htmlRows + '</tbody></table>'
      + '<p style="margin-top:32px;font-size:12px;color:#9A958B;font-family:sans-serif">Osservatorio Culturale — <a href="https://script.google.com/macros/s/AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs/exec" style="color:#7A2A1A">Apri webapp</a></p>'
      + '</div></body></html>';

    MailApp.sendEmail({
      to: email,
      subject: '[Radar Bandi] ' + urgenti.length + ' urgenti · ' + ts,
      htmlBody: htmlBody
    });

    Logger.log('✅ Digest Bandi v5 inviato a ' + email + ' — ' + bandi.length + ' bandi ('+urgenti.length+' urgenti)');
    return { ok: true, nBandi: bandi.length, nUrgenti: urgenti.length, to: email };
  } catch(e) { Logger.log('ERR digestBandiV5: ' + e.message); return { ok: false, error: e.message }; }
}

/** Escape HTML per digest email */
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Escape Telegram HTML */
function _tgEscV5_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================================
// FINE MODULO Bandi_v5.gs — FASE 1 + 2 + 3 + 4 + 5
// ============================================================================
// ============================================================================
