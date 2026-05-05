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

// Schema colonne FontiBandi_v5 (1-indexed per Sheets)
var COL_F = {
  ID:                 1,
  NOME:               2,
  URL:                3,
  TIPO:               4,   // RSS|HTML|Sitemap|Gmail
  CATEGORIA:          5,   // Ministero|Regione|UE|Aggregatore|Fondazione|Rivista|Associazione
  PRIORITA:           6,   // 1=alta|2=media|3=bassa
  ATTIVA:             7,   // boolean
  DATA_AGGIUNTA:      8,
  ULTIMA_SCANSIONE:   9,
  ULTIMO_ESITO:       10,
  N_BANDI_TOTALI:     11,
  N_BANDI_ULTIMO:     12,
  FAIL_CONSECUTIVI:   13,
  ULTIMO_ERRORE:      14,
  ENTE_DEFAULT:       15,
  URL_ENTE:           16,
  LIVELLO:            17,
  NOTE:               18
};

var COL_F_HEADERS = [
  'ID','Nome','URL','Tipo','Categoria','Priorita','Attiva',
  'DataAggiunta','UltimaScansione','UltimoEsito',
  'NBandiTotali','NBandiUltimoScan','FailConsecutivi','UltimoErrore',
  'EnteDefault','UrlEnte','Livello','Note'
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

/**
 * Helper menu: mostra stato flag switchover.
 */
function mostraBandiV5Flag() {
  try {
    var attivo = isBandiV5Active();
    SpreadsheetApp.getUi().alert('Bandi v5.0 - stato flag', 'USE_BANDI_V5 = ' + attivo + '\n\n' + (attivo ? 'Sistema usa il NUOVO motore Bandi v5.' : 'Sistema usa il VECCHIO Scannerbandi v4 (default durante sviluppo).'), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch(e) { Logger.log(e.message); }
}


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

function _estraiConClaudeV5_(testoHtml, urlFonte, enteDefault) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(ANTHROPIC_KEY_PROP);
  if (!apiKey) throw new Error('CLAUDE_API_KEY non configurata in ScriptProperties');

  var prompt = 'Sei un assistente specializzato nel monitoraggio di bandi e finanziamenti per musei, enti culturali e turismo.\n\n' +
    'Analizza questo testo estratto dalla pagina: ' + urlFonte + '\n\n' +
    '--- TESTO ---\n' + testoHtml + '\n--- FINE TESTO ---\n\n' +
    'Estrai TUTTI i bandi, avvisi, finanziamenti, opportunita presenti. Per ogni bando restituisci un oggetto JSON con questi campi:\n' +
    '{\n' +
    '  "titolo": "titolo completo del bando",\n' +
    '  "ente": "ente erogatore (usa \'' + enteDefault + '\' se non specificato)",\n' +
    '  "livello": "Nazionale|Regionale|EU|Fondazione|Vari",\n' +
    '  "regione": "regione se pertinente, altrimenti vuoto",\n' +
    '  "settore": "settore tematico (es: musei, patrimonio culturale, turismo)",\n' +
    '  "soggetti": "chi puo partecipare (es: enti pubblici, associazioni, imprese)",\n' +
    '  "importo": "importo massimo in euro se indicato, altrimenti vuoto",\n' +
    '  "scadenza": "data scadenza in formato GG/MM/AAAA se presente, altrimenti vuoto",\n' +
    '  "urlBando": "URL diretto al bando (completo, non relativo)",\n' +
    '  "sommario": "descrizione sintetica in 2-3 frasi"\n' +
    '}\n\n' +
    'Rispondi SOLO con un array JSON valido: [{...}, {...}]. Se non trovi bandi, rispondi con [].';

  var payload = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  };

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Claude API HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }

  var body = JSON.parse(resp.getContentText());
  var testo = body.content && body.content[0] ? body.content[0].text : '[]';

  // Estrai JSON dall'eventuale testo circostante
  var match = testo.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]); } catch(e) { return []; }
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
      if (_saveBandoV5_(ss, shBandi, b, fonte.id, fonte.nome, fingerprints)) nNuovi++;
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

  return { ok: totaleOk, fail: totaleFail, saltate: totaleSaltate, nuovi: totaleNuovi };
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


// ─── AGGIORNA FONTI A RSS DOVE DISPONIBILE ────────────────────────────────

/**
 * Aggiorna 6 fonti da HTML a RSS (WordPress /feed/ pattern).
 * Testa ogni URL prima di aggiornare — se il fetch fallisce, lascia HTML.
 * Esegui una volta sola dopo aver confermato che i crediti Claude sono attivi.
 */
function aggiornaFontiRSS() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  if (!shFonti) { Logger.log('ERRORE: FontiBandi_v5 non trovato'); return; }

  var CONVERSIONI_RSS = [
    { id: 'f_artribune_bandi',              rssUrl: 'https://www.artribune.com/tag/bandi/feed/' },
    { id: 'f_il_giornale_delle_fondazioni', rssUrl: 'https://www.ilgiornaledellefondazioni.com/bandi/feed/' },
    { id: 'f_icom_italia_opportunit',       rssUrl: 'https://www.icom-italia.org/categoria/avvisi-e-bandi/feed/' },
    { id: 'f_federculture_bandi',           rssUrl: 'https://www.federculture.it/categoria/bandi/feed/' },
    { id: 'f_tafter_journal',               rssUrl: 'https://www.tafterjournal.it/feed/' },
    { id: 'f_fondazione_symbola_bandi',     rssUrl: 'https://symbola.net/approfondimento/bandi-e-opportunita/feed/' }
  ];

  Logger.log('=== AGGIORNAMENTO FONTI RSS ===');

  var rows = shFonti.getDataRange().getValues();
  var aggiornate = 0, fallite = 0;

  for (var r = 1; r < rows.length; r++) {
    var idFonte = rows[r][COL_F.ID - 1];
    var conv = CONVERSIONI_RSS.filter(function(c) { return idFonte.indexOf(c.id.replace('f_','')) >= 0 || c.id === idFonte; })[0];
    if (!conv) continue;

    // Test fetch RSS
    Logger.log('  Test RSS: ' + conv.rssUrl);
    try {
      var resp = UrlFetchApp.fetch(conv.rssUrl, { muteHttpExceptions: true, followRedirects: true });
      var code = resp.getResponseCode();
      var contenuto = resp.getContentText();
      var isXml = contenuto.indexOf('<rss') >= 0 || contenuto.indexOf('<feed') >= 0 || contenuto.indexOf('<?xml') >= 0;

      if (code === 200 && isXml) {
        shFonti.getRange(r + 1, COL_F.URL).setValue(conv.rssUrl);
        shFonti.getRange(r + 1, COL_F.TIPO).setValue('RSS');
        shFonti.getRange(r + 1, COL_F.ULTIMO_ERRORE).setValue('');
        Logger.log('    ✅ Aggiornato a RSS: ' + rows[r][COL_F.NOME - 1]);
        aggiornate++;
      } else {
        Logger.log('    ⚠️  RSS non valido (HTTP ' + code + ', isXml=' + isXml + ') — lascio HTML: ' + rows[r][COL_F.NOME - 1]);
        fallite++;
      }
    } catch(e) {
      Logger.log('    ✗ Errore fetch: ' + e.message + ' — lascio HTML');
      fallite++;
    }
  }

  Logger.log('=== COMPLETATO: ' + aggiornate + ' aggiornate a RSS, ' + fallite + ' lasciate HTML ===');
}


/**
 * Disabilita le fonti ContributiRegione: usano JavaScript dinamico,
 * GAS non riesce a leggerne il contenuto (0 risultati a ogni scan).
 */
function disabilitaContributiRegione() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shFonti = ss.getSheetByName(SH_FONTI_V5);
  if (!shFonti) { Logger.log('ERRORE: FontiBandi_v5 non trovato'); return; }

  var rows = shFonti.getDataRange().getValues();
  var disabilitate = 0;
  for (var r = 1; r < rows.length; r++) {
    var nome = (rows[r][COL_F.NOME - 1] || '').toLowerCase();
    if (nome.indexOf('contributiregione') >= 0) {
      shFonti.getRange(r + 1, COL_F.ATTIVA).setValue(false);
      shFonti.getRange(r + 1, COL_F.NOTE).setValue('JS dinamico — GAS non riesce a leggere il contenuto. Monitorare manualmente.');
      Logger.log('⛔ Disabilitata: ' + rows[r][COL_F.NOME - 1]);
      disabilitate++;
    }
  }
  Logger.log('Disabilitate ' + disabilitate + ' fonti ContributiRegione.');
}


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
      .atHour(7)
      .create();
    Logger.log('✅ Trigger creato: scanFontiTutte ogni ' + g.label + ' alle 07:00');
  });

  Logger.log('setupBandiV5Triggers completato — 3 trigger attivi (Lun/Mer/Ven 07:00)');
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

/**
 * Restituisce elenco completo fonti per pannello admin.
 * Usato da page-admin in Index.html per mostrare stato scanner bandi.
 */
function getFontiBandiV5Admin() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok: false, err: 'Foglio FontiBandi_v5 non trovato' };
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok: true, fonti: [] };
    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_F.ID - 1]) continue;
      out.push({
        r         : r + 1,
        id        : String(row[COL_F.ID - 1]),
        nome      : String(row[COL_F.NOME - 1] || ''),
        url       : String(row[COL_F.URL - 1] || ''),
        tipo      : String(row[COL_F.TIPO - 1] || ''),
        categoria : String(row[COL_F.CATEGORIA - 1] || ''),
        priorita  : Number(row[COL_F.PRIORITA - 1] || 2),
        attiva    : row[COL_F.ATTIVA - 1] === true || row[COL_F.ATTIVA - 1] === 'TRUE',
        ultimaScan: _fmtBreveV5_(row[COL_F.ULTIMA_SCANSIONE - 1]),
        ultimoEsito: String(row[COL_F.ULTIMO_ESITO - 1] || ''),
        nBandiTot : Number(row[COL_F.N_BANDI_TOTALI - 1] || 0),
        nBandiUlt : Number(row[COL_F.N_BANDI_ULTIMO - 1] || 0),
        failConsec: Number(row[COL_F.FAIL_CONSECUTIVI - 1] || 0),
        ultimoErr : String(row[COL_F.ULTIMO_ERRORE - 1] || '').slice(0, 120)
      });
    }
    return { ok: true, fonti: out };
  } catch(e) { return { ok: false, err: e.message }; }
}

/**
 * Attiva o disattiva una fonte per ID.
 * Parametro attiva: true|false
 */
function toggleFonteV5(fonteId, attiva) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SH_FONTI_V5);
    if (!sh) return { ok: false, err: 'Foglio non trovato' };
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][COL_F.ID - 1]) === String(fonteId)) {
        sh.getRange(r + 1, COL_F.ATTIVA).setValue(!!attiva);
        if (attiva) sh.getRange(r + 1, COL_F.FAIL_CONSECUTIVI).setValue(0);
        Logger.log((attiva ? '✅ ATTIVATA' : '🔴 DISATTIVATA') + ': ' + vals[r][COL_F.NOME - 1]);
        return { ok: true, id: fonteId, attiva: !!attiva };
      }
    }
    return { ok: false, err: 'Fonte non trovata: ' + fonteId };
  } catch(e) { return { ok: false, err: e.message }; }
}

/**
 * Resetta i fail consecutivi su una fonte (riabilita dopo errori).
 */
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

/** true se il switchover v5 è attivo */
function isBandiV5Active() {
  return PropertiesService.getScriptProperties().getProperty(BANDI_V5_FLAG_PROP) === 'true';
}

/** Stato corrente del sistema — utile per diagnostica */
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
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Escape Telegram HTML */
function _tgEscV5_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ============================================================================
// FINE MODULO Bandi_v5.gs — FASE 1 + 2 + 3 + 4 + 5
// ============================================================================
// ============================================================================
