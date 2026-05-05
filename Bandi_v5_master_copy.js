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
// FINE MODULO Bandi_v5.gs FASE 1
// FASI SUCCESSIVE (FASE 2-5) verranno aggiunte in questo stesso file.
// ============================================================================
