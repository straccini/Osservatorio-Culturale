// ============================================================================
// ApiConnettori.js — Connettori API strutturate per Osservatorio Culturale
// ============================================================================
// Modulo autonomo per scan TED, iTunes, DOAJ, YouTube, ANAC.
// Scrive su Bandi_v5 (bandi EU) e Editoria (podcast, pubblicazioni, video).
//
// Prefissi: API_ per costanti, api_ con underscore finale per funzioni interne.
// Entry point pubblici: apiSetup, apiScanBandi, apiScanEditoria, apiScanTutto,
//                        apiSetupTrigger, apiRemoveTrigger, apiStatus, getEditoria
//
// Osservatorio Culturale — Sinopia / Silvano Straccini
// Ricreato 2026-06-11 (originale perso da clasp pull)
// ============================================================================

// ============================================================================
// COSTANTI MODULO
// ============================================================================

var API_COL = {
  DATA_RILEVAMENTO: 1, TITOLO: 2, ENTE: 3, LIVELLO: 4, REGIONE: 5,
  SETTORE: 6, SOGGETTI: 7, IMPORTO: 8, COFIN: 9, SCADENZA: 10,
  STATUS: 11, CLIENTE: 12, LINK: 13, NOTE: 14, FONTE: 15,
  PRIORITA: 16, NASCOSTO: 17, STATO_RECORD: 18, URL_ENTE: 19, LETTO_BANDO: 20
};

var API_SHEET_EDITORIA = 'Editoria';
var API_EDITORIA_HEADERS = ['ID','Tipo','Titolo','Autore','URL','Fonte','Categoria','DataRilevamento','Note'];
var API_SHEET_RADAR = 'Bandi_v5';
var API_FETCH_DEADLINE = 30;
var API_SLEEP_MS = 1000;
var API_TED_MAX_DETAIL = 50;


// ============================================================================
// HELPER INTERNI
// ============================================================================

/**
 * Ritorna lo spreadsheet principale (singleton da Codice.js o fallback attivo)
 * @return {SpreadsheetApp.Spreadsheet}
 */
function api_getSpreadsheet_() {
  try {
    if (typeof getMainSS === 'function') return getMainSS();
  } catch (e) {
    Logger.log('api_getSpreadsheet_: getMainSS fallita, uso attivo — ' + e.message);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}


/**
 * Ottiene o crea il foglio Editoria con intestazioni
 * @return {SpreadsheetApp.Sheet}
 */
function api_getOrCreateEditoria_() {
  var ss = api_getSpreadsheet_();
  var sh = ss.getSheetByName(API_SHEET_EDITORIA);
  if (sh) return sh;

  // Crea foglio con intestazioni
  sh = ss.insertSheet(API_SHEET_EDITORIA);
  sh.getRange(1, 1, 1, API_EDITORIA_HEADERS.length).setValues([API_EDITORIA_HEADERS]);
  sh.getRange(1, 1, 1, API_EDITORIA_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#e8d5b7');
  sh.setFrozenRows(1);
  Logger.log('Foglio Editoria creato con ' + API_EDITORIA_HEADERS.length + ' colonne');
  return sh;
}


/**
 * Wrapper per UrlFetchApp con muteHttpExceptions e deadline.
 * IMPORTANTE: crea una copia FRESH delle opzioni ad ogni chiamata (non muta un oggetto condiviso).
 * @param {string} url
 * @param {Object} options — opzioni aggiuntive (method, payload, headers, contentType)
 * @return {HTTPResponse}
 */
function api_fetch_(url, options) {
  // Copia fresh per evitare mutazioni tra chiamate successive
  var opts = {
    muteHttpExceptions: true,
    deadline: API_FETCH_DEADLINE
  };
  if (options) {
    var keys = Object.keys(options);
    for (var i = 0; i < keys.length; i++) {
      opts[keys[i]] = options[keys[i]];
    }
  }
  return UrlFetchApp.fetch(url, opts);
}


/**
 * Genera ID univoco con prefisso API
 * @return {string}
 */
function api_generateId_() {
  return 'API' + new Date().getTime() + Math.floor(Math.random() * 10000);
}


/**
 * Data odierna in formato yyyy-MM-dd
 * @return {string}
 */
function api_oggi_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}


/**
 * Verifica se un titolo esiste gia nel foglio (colonna 1-based).
 * Usare solo come fallback — preferire api_caricaTitoliEsistenti_ per batch.
 * @param {SpreadsheetApp.Sheet} sheet
 * @param {string} titolo
 * @param {number} colIdx — indice colonna 1-based
 * @return {boolean}
 */
function api_titoloEsiste_(sheet, titolo, colIdx) {
  if (!titolo) return false;
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;
    var valori = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
    var tNorm = titolo.toString().trim().toLowerCase();
    for (var i = 0; i < valori.length; i++) {
      if (valori[i][0] && valori[i][0].toString().trim().toLowerCase() === tNorm) return true;
    }
  } catch (e) {
    Logger.log('api_titoloEsiste_ errore: ' + e.message);
  }
  return false;
}


/**
 * Carica TUTTI i titoli da un foglio in un oggetto JS per dedup veloce.
 * Una sola lettura sheet per intero scan (anziche una per ogni riga da scrivere).
 * @param {SpreadsheetApp.Sheet} sheet
 * @param {number} colIdx — indice colonna 1-based
 * @return {Object} — mappa { titoloNormalizzato: true }
 */
function api_caricaTitoliEsistenti_(sheet, colIdx) {
  var map = {};
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return map;
    var valori = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
    for (var i = 0; i < valori.length; i++) {
      if (valori[i][0]) {
        map[valori[i][0].toString().trim().toLowerCase()] = true;
      }
    }
  } catch (e) {
    Logger.log('api_caricaTitoliEsistenti_ errore: ' + e.message);
  }
  return map;
}


// ============================================================================
// FUNZIONI DI SCRITTURA
// ============================================================================

/**
 * Scrive un bando nel foglio Bandi_v5 (schema COL_B, 26 colonne + SettoreCultura).
 * Dedup veloce tramite Set precaricato; fallback a api_titoloEsiste_.
 * @param {Object} bando — campi: titolo, ente, livello, regione, settore, soggetti,
 *   importo, cofin, scadenza, fonteId, fonteNome, url, urlEnte, sommario, ambito, note
 * @param {Object} titoliGiaPresenti — mappa titoli normalizzati (opzionale)
 * @return {boolean} true se scritto, false se duplicato o errore
 */
function api_scriviRadarBandi_(bando, titoliGiaPresenti) {
  try {
    if (!bando || !bando.titolo) return false;

    var titNorm = bando.titolo.toString().trim().toLowerCase();

    // Dedup: controlla Set precaricato
    if (titoliGiaPresenti && titoliGiaPresenti[titNorm]) {
      return false;
    }

    var ss = api_getSpreadsheet_();
    var sh = ss.getSheetByName(API_SHEET_RADAR);
    if (!sh) {
      Logger.log('api_scriviRadarBandi_: foglio ' + API_SHEET_RADAR + ' non trovato');
      return false;
    }

    // Fallback: lettura singola se Set non fornito
    if (!titoliGiaPresenti) {
      if (api_titoloEsiste_(sh, bando.titolo, 4)) return false;  // COL_B.TITOLO = 4
    }

    var oggi = api_oggi_();
    var id = api_generateId_();

    // Classifica settore cultura se la funzione esiste
    var settoreCultura = '';
    try {
      if (typeof classificaSettoreCultura === 'function') {
        settoreCultura = classificaSettoreCultura(bando.titolo, bando.settore || '', bando.sommario || '') || '';
      }
    } catch (e) {
      Logger.log('classificaSettoreCultura errore: ' + e.message);
    }

    // Riga: 26 colonne schema COL_B + col 27 SettoreCultura
    var riga = [
      id,                                       // 1  ID
      '',                                       // 2  Fingerprint
      oggi,                                     // 3  DataRilevamento
      (bando.titolo || '').toString().substring(0, 500),  // 4  Titolo
      bando.ente || '',                         // 5  Ente
      bando.livello || 'UE',                    // 6  Livello
      bando.regione || '',                      // 7  Regione
      bando.settore || 'Cultura',               // 8  Settore
      bando.soggetti || '',                     // 9  Soggetti
      bando.importo || '',                      // 10 Importo
      bando.cofin || '',                        // 11 Cofin
      bando.scadenza || '',                     // 12 Scadenza
      bando.fonteId || 'TED-API',               // 13 FonteID
      bando.fonteNome || 'TED Europa',          // 14 FonteNome
      bando.url || '',                          // 15 UrlBando
      bando.urlEnte || '',                      // 16 UrlEnte
      '',                                       // 17 UrlValidato
      '',                                       // 18 DataValidazione
      (bando.sommario || '').toString().substring(0, 1000),  // 19 Sommario
      bando.ambito || '',                       // 20 Ambito
      '',                                       // 21 PrioritaRegionale
      'Nuovo',                                  // 22 Status
      'attivo',                                 // 23 StatoRecord
      false,                                    // 24 Letto
      false,                                    // 25 Salvato
      bando.note || '',                         // 26 Note
      settoreCultura                            // 27 SettoreCultura
    ];

    sh.appendRow(riga);

    // Aggiorna Set precaricato per dedup successive nella stessa sessione
    if (titoliGiaPresenti) {
      titoliGiaPresenti[titNorm] = true;
    }

    return true;
  } catch (e) {
    Logger.log('api_scriviRadarBandi_ errore: ' + e.message);
    return false;
  }
}


/**
 * Scrive un item nel foglio Editoria (9 colonne).
 * Dedup per titolo (colonna 3).
 * @param {Object} item — campi: tipo, titolo, autore, url, fonte, categoria, note
 * @param {Object} titoliGiaPresenti — mappa titoli normalizzati (opzionale)
 * @return {boolean} true se scritto
 */
function api_scriviEditoria_(item, titoliGiaPresenti) {
  try {
    if (!item || !item.titolo) return false;

    var titNorm = item.titolo.toString().trim().toLowerCase();

    // Dedup via Set precaricato
    if (titoliGiaPresenti && titoliGiaPresenti[titNorm]) {
      return false;
    }

    var sh = api_getOrCreateEditoria_();

    // Fallback: lettura singola se Set non fornito
    if (!titoliGiaPresenti) {
      if (api_titoloEsiste_(sh, item.titolo, 3)) return false;  // Colonna 3 = Titolo in Editoria
    }

    var riga = [
      api_generateId_(),                        // 1 ID
      item.tipo || 'Altro',                     // 2 Tipo
      (item.titolo || '').toString().substring(0, 500),  // 3 Titolo
      item.autore || '',                        // 4 Autore
      item.url || '',                           // 5 URL
      item.fonte || '',                         // 6 Fonte
      item.categoria || '',                     // 7 Categoria
      api_oggi_(),                              // 8 DataRilevamento
      (item.note || '').toString().substring(0, 500)  // 9 Note
    ];

    sh.appendRow(riga);

    // Aggiorna Set precaricato
    if (titoliGiaPresenti) {
      titoliGiaPresenti[titNorm] = true;
    }

    return true;
  } catch (e) {
    Logger.log('api_scriviEditoria_ errore: ' + e.message);
    return false;
  }
}


// ============================================================================
// CONNETTORE TED v3
// ============================================================================

/**
 * Rimuove tag XML da una stringa
 * @param {string} str
 * @return {string}
 */
function api_stripXml_(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').trim();
}


/**
 * Converte eventuali [object Object] in stringa vuota
 * @param {*} val
 * @return {string}
 */
function api_sanitize_(val) {
  if (val === null || val === undefined) return '';
  var s = String(val);
  if (s === '[object Object]') return '';
  return s.trim();
}


/**
 * Parsing manuale di data yyyy-MM-dd (evita new Date(string) che ha problemi di timezone)
 * @param {string} dateStr — formato yyyy-MM-dd
 * @return {Date|null}
 */
function api_parseDate_(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  var parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return null;
  var y = parseInt(parts[1], 10);
  var m = parseInt(parts[2], 10) - 1;  // mese 0-based
  var d = parseInt(parts[3], 10);
  return new Date(y, m, d);
}


/**
 * Verifica se una data scadenza e gia passata
 * @param {string} dateStr — yyyy-MM-dd
 * @return {boolean} true se scaduta (prima di oggi)
 */
function api_isScaduto_(dateStr) {
  var parsed = api_parseDate_(dateStr);
  if (!parsed) return false;  // se non parsabile, non filtrare
  var oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return parsed < oggi;
}


/**
 * Estrae dettagli da XML TED vecchio formato (pre-2023)
 * @param {string} xmlText
 * @return {Object} — {titolo, ente, importo, scadenza, paese, descrizione}
 */
function api_parseTedXmlOld_(xmlText) {
  var result = { titolo: '', ente: '', importo: '', scadenza: '', paese: '', descrizione: '' };

  try {
    // Titolo: ML_TI_DOC > TI_TEXT
    var mTitolo = xmlText.match(/<TI_TEXT[^>]*>([\s\S]*?)<\/TI_TEXT>/i);
    if (mTitolo) result.titolo = api_stripXml_(mTitolo[1]);

    // Ente: OFFICIALNAME
    var mEnte = xmlText.match(/<OFFICIALNAME[^>]*>([\s\S]*?)<\/OFFICIALNAME>/i);
    if (mEnte) result.ente = api_stripXml_(mEnte[1]);

    // Importo: VAL_TOTAL
    var mVal = xmlText.match(/<VAL_TOTAL[^>]*>([\s\S]*?)<\/VAL_TOTAL>/i);
    if (mVal) result.importo = api_stripXml_(mVal[1]);

    // Scadenza: DT_DATE_FOR_SUBMISSION
    var mScad = xmlText.match(/<DT_DATE_FOR_SUBMISSION>([\s\S]*?)<\/DT_DATE_FOR_SUBMISSION>/i);
    if (mScad) result.scadenza = api_stripXml_(mScad[1]);

    // Paese: ISO_COUNTRY
    var mPaese = xmlText.match(/<ISO_COUNTRY[^>]*VALUE="([^"]+)"/i);
    if (mPaese) result.paese = mPaese[1];

    // Descrizione: SHORT_DESCR
    var mDesc = xmlText.match(/<SHORT_DESCR[^>]*>([\s\S]*?)<\/SHORT_DESCR>/i);
    if (mDesc) result.descrizione = api_stripXml_(mDesc[1]).substring(0, 1000);
  } catch (e) {
    Logger.log('api_parseTedXmlOld_ errore: ' + e.message);
  }

  return result;
}


/**
 * Estrae dettagli da XML eForms TED (2023+)
 * Cerca titolo nel blocco ProcurementProject e ente nel blocco Organization.
 * @param {string} xmlText
 * @return {Object} — {titolo, ente, importo, scadenza, paese, descrizione}
 */
function api_parseTedXmlEforms_(xmlText) {
  var result = { titolo: '', ente: '', importo: '', scadenza: '', paese: '', descrizione: '' };

  try {
    // Titolo: cbc:Name dentro ProcurementProject
    var procBlock = xmlText.match(/<cac:ProcurementProject[^>]*>([\s\S]*?)<\/cac:ProcurementProject>/i);
    if (procBlock) {
      var mName = procBlock[1].match(/<cbc:Name[^>]*>([\s\S]*?)<\/cbc:Name>/i);
      if (mName) result.titolo = api_stripXml_(mName[1]);
    }

    // Ente: cerca in blocco Organization
    var orgBlock = xmlText.match(/<efac:Organization[^>]*>([\s\S]*?)<\/efac:Organization>/i);
    if (orgBlock) {
      var mOrgName = orgBlock[1].match(/<cbc:Name[^>]*>([\s\S]*?)<\/cbc:Name>/i);
      if (mOrgName) result.ente = api_stripXml_(mOrgName[1]);
    }
    // Fallback: PartyName
    if (!result.ente) {
      var mParty = xmlText.match(/<cac:PartyName[^>]*>[\s\S]*?<cbc:Name[^>]*>([\s\S]*?)<\/cbc:Name>/i);
      if (mParty) result.ente = api_stripXml_(mParty[1]);
    }

    // Importo: EstimatedOverallContractAmount
    var mAmt = xmlText.match(/<cbc:EstimatedOverallContractAmount[^>]*>([\s\S]*?)<\/cbc:EstimatedOverallContractAmount>/i);
    if (mAmt) result.importo = api_stripXml_(mAmt[1]);

    // Scadenza: EndDate (dentro TenderSubmissionDeadlinePeriod)
    var mEnd = xmlText.match(/<cbc:EndDate>([\s\S]*?)<\/cbc:EndDate>/i);
    if (mEnd) result.scadenza = api_stripXml_(mEnd[1]);

    // Paese: IdentificationCode
    var mCode = xmlText.match(/<cbc:IdentificationCode[^>]*>([\s\S]*?)<\/cbc:IdentificationCode>/i);
    if (mCode) result.paese = api_stripXml_(mCode[1]);

    // Descrizione: cbc:Description dentro ProcurementProject
    if (procBlock) {
      var mDesc = procBlock[1].match(/<cbc:Description[^>]*>([\s\S]*?)<\/cbc:Description>/i);
      if (mDesc) result.descrizione = api_stripXml_(mDesc[1]).substring(0, 1000);
    }
  } catch (e) {
    Logger.log('api_parseTedXmlEforms_ errore: ' + e.message);
  }

  return result;
}


/**
 * Scan TED v3 API — cerca bandi europei relativi alla cultura.
 * Due query con termini culturali. Scarica XML per dettagli (max 50 notice).
 * Filtra scadenze passate. Scrive in Bandi_v5.
 * @param {Object} opts — opzioni (non usate al momento, per estensibilita)
 * @return {Object} — { nuovi: n, duplicati: n, filtrati: n, errori: n }
 */
function api_scanTed_(opts) {
  var report = { nuovi: 0, duplicati: 0, filtrati: 0, errori: 0 };

  try {
    // Precarica titoli esistenti per dedup veloce
    var ss = api_getSpreadsheet_();
    var shBandi = ss.getSheetByName(API_SHEET_RADAR);
    if (!shBandi) {
      Logger.log('api_scanTed_: foglio ' + API_SHEET_RADAR + ' non trovato');
      return report;
    }
    var titoliGia = api_caricaTitoliEsistenti_(shBandi, 4);  // COL_B.TITOLO = 4

    // Query culturali TED v3 (sintassi expert: FT ~ "termine")
    var queries = [
      'FT ~ "museum" OR FT ~ "biblioteca" OR FT ~ "archivio" OR FT ~ "museo"',
      'FT ~ "cultural heritage" OR FT ~ "restauro" OR FT ~ "patrimonio culturale" OR FT ~ "teatro"'
    ];

    var allNotices = [];

    for (var q = 0; q < queries.length; q++) {
      try {
        var body = {
          query: queries[q],
          limit: 50,
          scope: 'ACTIVE',
          fields: ['organisation-country-buyer', 'deadline-receipt-tender-date-lot', 'description-proc']
        };

        var resp = api_fetch_('https://api.ted.europa.eu/v3/notices/search', {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(body)
        });

        var code = resp.getResponseCode();
        if (code !== 200) {
          Logger.log('api_scanTed_: query ' + q + ' status ' + code);
          report.errori++;
          continue;
        }

        var data = JSON.parse(resp.getContentText());
        var notices = data.notices || [];
        Logger.log('TED query ' + q + ': ' + notices.length + ' risultati');

        for (var n = 0; n < notices.length; n++) {
          allNotices.push(notices[n]);
        }

        Utilities.sleep(API_SLEEP_MS);
      } catch (e) {
        Logger.log('api_scanTed_ query ' + q + ' errore: ' + e.message);
        report.errori++;
      }
    }

    // Dedup notice per publication-number
    var seen = {};
    var uniqueNotices = [];
    for (var i = 0; i < allNotices.length; i++) {
      var pubNum = allNotices[i]['publication-number'] || '';
      if (pubNum && !seen[pubNum]) {
        seen[pubNum] = true;
        uniqueNotices.push(allNotices[i]);
      }
    }

    Logger.log('TED: ' + uniqueNotices.length + ' notice uniche (da ' + allNotices.length + ' totali)');

    // Scarica XML per dettagli (max API_TED_MAX_DETAIL)
    var limit = Math.min(uniqueNotices.length, API_TED_MAX_DETAIL);

    for (var j = 0; j < limit; j++) {
      try {
        var notice = uniqueNotices[j];
        var pubNumber = notice['publication-number'] || '';

        // URL pagina HTML (preferisci italiano)
        var htmlUrl = '';
        if (notice.links && notice.links.html) {
          htmlUrl = notice.links.html.ITA || notice.links.html.ENG || '';
          // Se ancora oggetto, prendi il primo valore
          if (typeof htmlUrl === 'object') {
            var htmlKeys = Object.keys(notice.links.html);
            htmlUrl = htmlKeys.length > 0 ? notice.links.html[htmlKeys[0]] : '';
          }
        }

        // URL XML multilingue
        var xmlUrl = '';
        if (notice.links && notice.links.xml) {
          xmlUrl = notice.links.xml.MUL || '';
          if (typeof xmlUrl === 'object') {
            var xmlKeys = Object.keys(notice.links.xml);
            xmlUrl = xmlKeys.length > 0 ? notice.links.xml[xmlKeys[0]] : '';
          }
        }

        // Scarica e parsa XML
        var titolo = '';
        var ente = '';
        var importo = '';
        var scadenza = '';
        var paese = '';
        var descrizione = '';

        if (xmlUrl) {
          Utilities.sleep(API_SLEEP_MS);
          var xmlResp = api_fetch_(xmlUrl, {});
          if (xmlResp.getResponseCode() === 200) {
            var xmlText = xmlResp.getContentText();

            // Rileva formato: eForms (2023+) o vecchio TED
            var isEforms = (xmlText.indexOf('cbc:Name') !== -1 && xmlText.indexOf('ProcurementProject') !== -1);
            var parsed;

            if (isEforms) {
              parsed = api_parseTedXmlEforms_(xmlText);
            } else {
              parsed = api_parseTedXmlOld_(xmlText);
            }

            titolo = api_sanitize_(parsed.titolo);
            ente = api_sanitize_(parsed.ente);
            importo = api_sanitize_(parsed.importo);
            scadenza = api_sanitize_(parsed.scadenza);
            paese = api_sanitize_(parsed.paese);
            descrizione = api_sanitize_(parsed.descrizione);
          }
        }

        // Se non abbiamo titolo da XML, usiamo publication-number
        if (!titolo) {
          titolo = 'TED Notice ' + pubNumber;
        }

        // Filtra scadenze passate
        if (scadenza && api_isScaduto_(scadenza)) {
          report.filtrati++;
          continue;
        }

        // Scrivi bando
        var scritto = api_scriviRadarBandi_({
          titolo: titolo,
          ente: ente,
          livello: 'UE',
          regione: paese || '',
          settore: 'Cultura',
          importo: importo,
          scadenza: scadenza,
          fonteId: 'TED-API-v3',
          fonteNome: 'TED Europa v3',
          url: htmlUrl || ('https://ted.europa.eu/udl?uri=TED:NOTICE:' + pubNumber),
          sommario: descrizione,
          note: 'PubNum: ' + pubNumber
        }, titoliGia);

        if (scritto) {
          report.nuovi++;
        } else {
          report.duplicati++;
        }

      } catch (e) {
        Logger.log('api_scanTed_ notice ' + j + ' errore: ' + e.message);
        report.errori++;
      }
    }

    Logger.log('TED scan completato: ' + JSON.stringify(report));
  } catch (e) {
    Logger.log('api_scanTed_ errore generale: ' + e.message);
    report.errori++;
  }

  return report;
}


// ============================================================================
// CONNETTORE ITUNES
// ============================================================================

/**
 * Scan iTunes podcast search — cerca podcast culturali italiani e internazionali.
 * @param {Object} opts — opzioni (non usate)
 * @param {Object} titoliEditoria — Set titoli precaricato
 * @return {Object} — { nuovi: n, duplicati: n, errori: n }
 */
function api_scanItunes_(opts, titoliEditoria) {
  var report = { nuovi: 0, duplicati: 0, errori: 0 };
  var terms = ['museo italiano', 'patrimonio culturale', 'heritage museum', 'cultural policy'];

  for (var t = 0; t < terms.length; t++) {
    try {
      var url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(terms[t]) + '&media=podcast&limit=20';
      var resp = api_fetch_(url, {});
      var code = resp.getResponseCode();

      if (code !== 200) {
        Logger.log('iTunes term "' + terms[t] + '" status ' + code);
        report.errori++;
        continue;
      }

      var data = JSON.parse(resp.getContentText());
      var results = data.results || [];
      Logger.log('iTunes "' + terms[t] + '": ' + results.length + ' risultati');

      for (var r = 0; r < results.length; r++) {
        var item = results[r];
        var scritto = api_scriviEditoria_({
          tipo: 'Podcast',
          titolo: item.trackName || item.collectionName || '',
          autore: item.artistName || '',
          url: item.collectionViewUrl || item.trackViewUrl || '',
          fonte: 'iTunes',
          categoria: item.primaryGenreName || '',
          note: ''
        }, titoliEditoria);

        if (scritto) {
          report.nuovi++;
        } else {
          report.duplicati++;
        }
      }

      Utilities.sleep(API_SLEEP_MS);
    } catch (e) {
      Logger.log('api_scanItunes_ term "' + terms[t] + '" errore: ' + e.message);
      report.errori++;
    }
  }

  Logger.log('iTunes scan completato: ' + JSON.stringify(report));
  return report;
}


// ============================================================================
// CONNETTORE DOAJ
// ============================================================================

/**
 * Scan DOAJ — pubblicazioni open access su management e politiche culturali.
 * @param {Object} opts — opzioni (non usate)
 * @param {Object} titoliEditoria — Set titoli precaricato
 * @return {Object} — { nuovi: n, duplicati: n, errori: n }
 */
function api_scanDoaj_(opts, titoliEditoria) {
  var report = { nuovi: 0, duplicati: 0, errori: 0 };
  var terms = ['museum management', 'cultural heritage policy', 'audience development museum'];

  for (var t = 0; t < terms.length; t++) {
    try {
      var url = 'https://doaj.org/api/search/articles/' + encodeURIComponent(terms[t]) + '?pageSize=20';
      var resp = api_fetch_(url, {});
      var code = resp.getResponseCode();

      if (code !== 200) {
        Logger.log('DOAJ term "' + terms[t] + '" status ' + code);
        report.errori++;
        continue;
      }

      var data = JSON.parse(resp.getContentText());
      var results = data.results || [];
      Logger.log('DOAJ "' + terms[t] + '": ' + results.length + ' risultati');

      for (var r = 0; r < results.length; r++) {
        var art = results[r];
        var bib = art.bibjson || {};

        // Autore: primo della lista
        var autore = '';
        if (bib.author && bib.author.length > 0) {
          autore = bib.author[0].name || '';
        }

        // URL: primo link o DOI
        var artUrl = '';
        if (bib.link && bib.link.length > 0) {
          artUrl = bib.link[0].url || '';
        }
        if (!artUrl && art.id) {
          artUrl = 'https://doaj.org/article/' + art.id;
        }

        // Categoria dal journal
        var categoria = '';
        if (bib.journal && bib.journal.title) {
          categoria = bib.journal.title;
        }

        // Note: abstract troncato a 200 caratteri
        var note = '';
        if (bib['abstract']) {
          note = bib['abstract'].toString().substring(0, 200);
        }

        var scritto = api_scriviEditoria_({
          tipo: 'Pubblicazione',
          titolo: bib.title || '',
          autore: autore,
          url: artUrl,
          fonte: 'DOAJ',
          categoria: categoria,
          note: note
        }, titoliEditoria);

        if (scritto) {
          report.nuovi++;
        } else {
          report.duplicati++;
        }
      }

      Utilities.sleep(API_SLEEP_MS);
    } catch (e) {
      Logger.log('api_scanDoaj_ term "' + terms[t] + '" errore: ' + e.message);
      report.errori++;
    }
  }

  Logger.log('DOAJ scan completato: ' + JSON.stringify(report));
  return report;
}


// ============================================================================
// CONNETTORE YOUTUBE
// ============================================================================

/**
 * Scan YouTube — video su patrimonio culturale e innovazione museale.
 * Si attiva solo se la ScriptProperty YOUTUBE_API_KEY e configurata.
 * @param {Object} opts — opzioni (non usate)
 * @param {Object} titoliEditoria — Set titoli precaricato
 * @return {Object} — { nuovi: n, duplicati: n, errori: n, skipped: boolean }
 */
function api_scanYouTube_(opts, titoliEditoria) {
  var report = { nuovi: 0, duplicati: 0, errori: 0, skipped: false };

  // Controlla API key
  var apiKey = '';
  try {
    apiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY') || '';
  } catch (e) {
    Logger.log('api_scanYouTube_: impossibile leggere YOUTUBE_API_KEY');
  }

  if (!apiKey) {
    Logger.log('api_scanYouTube_: YOUTUBE_API_KEY non configurata, skip silenzioso');
    report.skipped = true;
    return report;
  }

  var terms = ['museo patrimonio culturale', 'cultural heritage museum', 'innovazione museale'];

  for (var t = 0; t < terms.length; t++) {
    try {
      var url = 'https://www.googleapis.com/youtube/v3/search'
        + '?part=snippet'
        + '&q=' + encodeURIComponent(terms[t])
        + '&type=video'
        + '&maxResults=10'
        + '&key=' + apiKey;

      var resp = api_fetch_(url, {});
      var code = resp.getResponseCode();

      if (code !== 200) {
        Logger.log('YouTube term "' + terms[t] + '" status ' + code);
        report.errori++;
        continue;
      }

      var data = JSON.parse(resp.getContentText());
      var items = data.items || [];
      Logger.log('YouTube "' + terms[t] + '": ' + items.length + ' risultati');

      for (var r = 0; r < items.length; r++) {
        var vid = items[r];
        var snippet = vid.snippet || {};
        var videoId = (vid.id && vid.id.videoId) ? vid.id.videoId : '';

        // Note: descrizione troncata a 200 caratteri
        var note = '';
        if (snippet.description) {
          note = snippet.description.toString().substring(0, 200);
        }

        var scritto = api_scriviEditoria_({
          tipo: 'Video',
          titolo: snippet.title || '',
          autore: snippet.channelTitle || '',
          url: videoId ? ('https://www.youtube.com/watch?v=' + videoId) : '',
          fonte: 'YouTube',
          categoria: 'Video',
          note: note
        }, titoliEditoria);

        if (scritto) {
          report.nuovi++;
        } else {
          report.duplicati++;
        }
      }

      Utilities.sleep(API_SLEEP_MS);
    } catch (e) {
      Logger.log('api_scanYouTube_ term "' + terms[t] + '" errore: ' + e.message);
      report.errori++;
    }
  }

  Logger.log('YouTube scan completato: ' + JSON.stringify(report));
  return report;
}


// ============================================================================
// CONNETTORE ANAC (DISATTIVATO)
// ============================================================================

/**
 * Connettore ANAC/BDNCP — DISATTIVATO.
 * WAF blocca chiamate server-to-server. Alternativa futura: download OCDS bulk.
 * @return {Object} — report vuoto
 */
function api_connettoreANAC_() {
  Logger.log('api_connettoreANAC_: connettore DISATTIVATO — WAF blocca chiamate server-to-server. Alternativa: OCDS bulk download.');
  return { nuovi: 0, duplicati: 0, errori: 0, disattivato: true };
}


// ============================================================================
// ENTRY POINT PUBBLICI
// ============================================================================

/**
 * Setup iniziale: crea foglio Editoria se mancante, logga stato configurazione.
 * @return {string} messaggio stato
 */
function apiSetup() {
  try {
    var sh = api_getOrCreateEditoria_();
    var rows = sh.getLastRow();
    Logger.log('apiSetup: foglio Editoria OK (' + rows + ' righe)');

    // Verifica configurazione
    var props = PropertiesService.getScriptProperties().getProperties();
    var hasYt = props.YOUTUBE_API_KEY ? 'SI' : 'NO';
    var hasTg = (props.TELEGRAM_TOKEN || props.TELEGRAM_BOT_TOKEN) ? 'SI' : 'NO';
    Logger.log('apiSetup: YouTube API Key = ' + hasYt + ', Telegram = ' + hasTg);

    return 'Editoria: ' + rows + ' righe | YouTube: ' + hasYt + ' | Telegram: ' + hasTg;
  } catch (e) {
    Logger.log('apiSetup errore: ' + e.message);
    return 'Errore: ' + e.message;
  }
}


/**
 * Scan bandi europei via TED v3 API. Scrive in Bandi_v5.
 * @return {Object} — report con nuovi, duplicati, filtrati, errori
 */
function apiScanBandi() {
  Logger.log('=== apiScanBandi: inizio ===');
  var t0 = new Date().getTime();
  var report = {};

  try {
    report = api_scanTed_({});
  } catch (e) {
    Logger.log('apiScanBandi errore: ' + e.message);
    report = { nuovi: 0, duplicati: 0, filtrati: 0, errori: 1 };
  }

  var durSec = Math.round((new Date().getTime() - t0) / 1000);
  report.durataSecondi = durSec;
  Logger.log('=== apiScanBandi: fine (' + durSec + 's) — ' + JSON.stringify(report) + ' ===');
  return report;
}


/**
 * Scan editoriale: iTunes podcast + DOAJ pubblicazioni + YouTube video.
 * Precarica titoli Editoria una sola volta per dedup batch.
 * @param {Object} opts — opzioni (riservate per uso futuro)
 * @return {Object} — report aggregato per connettore
 */
function apiScanEditoria(opts) {
  Logger.log('=== apiScanEditoria: inizio ===');
  var t0 = new Date().getTime();
  var report = { itunes: {}, doaj: {}, youtube: {} };

  try {
    // Precarica titoli esistenti UNA VOLTA per tutto lo scan editoria
    var shEd = api_getOrCreateEditoria_();
    var titoliEditoria = api_caricaTitoliEsistenti_(shEd, 3);  // Colonna 3 = Titolo
    Logger.log('Titoli Editoria precaricati: ' + Object.keys(titoliEditoria).length);

    // iTunes
    try {
      report.itunes = api_scanItunes_(opts, titoliEditoria);
    } catch (e) {
      Logger.log('apiScanEditoria iTunes errore: ' + e.message);
      report.itunes = { nuovi: 0, duplicati: 0, errori: 1 };
    }

    // DOAJ
    try {
      report.doaj = api_scanDoaj_(opts, titoliEditoria);
    } catch (e) {
      Logger.log('apiScanEditoria DOAJ errore: ' + e.message);
      report.doaj = { nuovi: 0, duplicati: 0, errori: 1 };
    }

    // YouTube
    try {
      report.youtube = api_scanYouTube_(opts, titoliEditoria);
    } catch (e) {
      Logger.log('apiScanEditoria YouTube errore: ' + e.message);
      report.youtube = { nuovi: 0, duplicati: 0, errori: 1 };
    }

  } catch (e) {
    Logger.log('apiScanEditoria errore generale: ' + e.message);
  }

  // 5. Fondazione Scuola Patrimonio (pubblicazioni)
  try {
    var snapac = api_scanFondazionePatrimonio_(opts, titoliEditoria);
    report.snapac = snapac;
    Utilities.sleep(API_SLEEP_MS);
  } catch (e) {
    report.snapac = { ok: false, errori: 1, dettagli: ['Errore: ' + e.message] };
    Logger.log('apiScanEditoria SNaPAC errore: ' + e.message);
  }

  // 6. Open Library (libri museologia/patrimonio)
  try {
    var openlib = api_scanOpenLibrary_(opts, titoliEditoria);
    report.openLibrary = openlib;
    Utilities.sleep(API_SLEEP_MS);
  } catch (e) {
    report.openLibrary = { ok: false, errori: 1, dettagli: ['Errore: ' + e.message] };
    Logger.log('apiScanEditoria Open Library errore: ' + e.message);
  }

  // 7. Google Books (libri cultura, richiede API key)
  try {
    var gbooks = api_scanGoogleBooks_(opts, titoliEditoria);
    report.googleBooks = gbooks;
  } catch (e) {
    report.googleBooks = { ok: false, errori: 1, dettagli: ['Errore: ' + e.message] };
    Logger.log('apiScanEditoria Google Books errore: ' + e.message);
  }

  var durSec = Math.round((new Date().getTime() - t0) / 1000);
  report.durataSecondi = durSec;
  Logger.log('=== apiScanEditoria: fine (' + durSec + 's) ===');
  return report;
}


/**
 * Scan completo: bandi TED + editoria (iTunes, DOAJ, YouTube).
 * Salva timestamp in ScriptProperties, invia riepilogo Telegram.
 * @return {Object} — report combinato
 */
function apiScanTutto() {
  Logger.log('========== apiScanTutto: inizio ==========');
  var t0 = new Date().getTime();
  var report = { bandi: {}, editoria: {} };

  try {
    // Scan bandi TED
    report.bandi = apiScanBandi();
    Utilities.sleep(API_SLEEP_MS);

    // Scan editoria
    report.editoria = apiScanEditoria({});

    // Salva timestamp
    var ora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var props = PropertiesService.getScriptProperties();
    props.setProperty('API_LAST_SCAN_BANDI', ora);
    props.setProperty('API_LAST_SCAN_EDITORIA', ora);

    // Riepilogo Telegram
    try {
      var bR = report.bandi || {};
      var eR = report.editoria || {};
      var iTu = eR.itunes || {};
      var doa = eR.doaj || {};
      var ytb = eR.youtube || {};

      var nuoviTot = (bR.nuovi || 0) + (iTu.nuovi || 0) + (doa.nuovi || 0) + (ytb.nuovi || 0);
      var errTot = (bR.errori || 0) + (iTu.errori || 0) + (doa.errori || 0) + (ytb.errori || 0);
      var durSec = Math.round((new Date().getTime() - t0) / 1000);

      var msg = '*Osservatorio Culturale — API Scan*\n'
        + 'Data: ' + ora + '\n\n'
        + '*Bandi TED:* ' + (bR.nuovi || 0) + ' nuovi, ' + (bR.duplicati || 0) + ' duplicati'
        + (bR.filtrati ? ', ' + bR.filtrati + ' scaduti' : '') + '\n'
        + '*Podcast:* ' + (iTu.nuovi || 0) + ' nuovi\n'
        + '*Pubblicazioni:* ' + (doa.nuovi || 0) + ' nuovi\n'
        + '*Video:* ' + (ytb.skipped ? 'skip (no API key)' : (ytb.nuovi || 0) + ' nuovi') + '\n\n'
        + 'Totale nuovi: ' + nuoviTot + ' | Errori: ' + errTot + '\n'
        + 'Durata: ' + durSec + 's';

      if (typeof sendTelegram === 'function') {
        sendTelegram(msg);
      }
    } catch (e) {
      Logger.log('apiScanTutto: errore invio Telegram — ' + e.message);
    }

  } catch (e) {
    Logger.log('apiScanTutto errore: ' + e.message);
  }

  var durSec = Math.round((new Date().getTime() - t0) / 1000);
  report.durataSecondi = durSec;
  Logger.log('========== apiScanTutto: fine (' + durSec + 's) ==========');
  return report;
}


/**
 * Crea trigger settimanale: lunedi ore 07:00 per apiScanTutto.
 * @return {string} messaggio conferma
 */
function apiSetupTrigger() {
  try {
    // Rimuovi trigger esistenti per evitare duplicati
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'apiScanTutto') {
        ScriptApp.deleteTrigger(triggers[i]);
        Logger.log('Trigger apiScanTutto esistente rimosso');
      }
    }

    // Crea nuovo trigger settimanale
    ScriptApp.newTrigger('apiScanTutto')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(7)
      .create();

    Logger.log('Trigger apiScanTutto creato: lunedi 07:00');
    return 'Trigger creato: apiScanTutto ogni lunedi ore 07:00';
  } catch (e) {
    Logger.log('apiSetupTrigger errore: ' + e.message);
    return 'Errore: ' + e.message;
  }
}


/**
 * Rimuove tutti i trigger associati a apiScanTutto.
 * @return {string} messaggio conferma
 */
function apiRemoveTrigger() {
  try {
    var count = 0;
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'apiScanTutto') {
        ScriptApp.deleteTrigger(triggers[i]);
        count++;
      }
    }
    Logger.log('apiRemoveTrigger: ' + count + ' trigger rimossi');
    return count + ' trigger rimossi';
  } catch (e) {
    Logger.log('apiRemoveTrigger errore: ' + e.message);
    return 'Errore: ' + e.message;
  }
}


/**
 * Stato sistema: date ultimo scan, righe nei fogli, disponibilita connettori.
 * @return {Object} — JSON con stato completo
 */
function apiStatus() {
  var status = {
    versione: 'ApiConnettori v2.0',
    dataReport: api_oggi_(),
    lastScan: {},
    fogli: {},
    connettori: {}
  };

  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    status.lastScan.bandi = props.API_LAST_SCAN_BANDI || 'mai';
    status.lastScan.editoria = props.API_LAST_SCAN_EDITORIA || 'mai';

    var ss = api_getSpreadsheet_();

    // Righe Bandi_v5
    var shB = ss.getSheetByName(API_SHEET_RADAR);
    status.fogli.Bandi_v5 = shB ? (shB.getLastRow() - 1) + ' bandi' : 'non trovato';

    // Righe Editoria
    var shE = ss.getSheetByName(API_SHEET_EDITORIA);
    status.fogli.Editoria = shE ? (shE.getLastRow() - 1) + ' items' : 'non trovato';

    // Connettori
    status.connettori.TED = 'attivo';
    status.connettori.iTunes = 'attivo';
    status.connettori.DOAJ = 'attivo';
    status.connettori.YouTube = props.YOUTUBE_API_KEY ? 'attivo' : 'inattivo (no API key)';
    status.connettori.GoogleBooks = 'attivo (no key — quota pubblica 1000 req/giorno)';
    status.connettori.OpenLibrary = 'attivo (no key)';
    status.connettori.SNaPAC = 'attivo (RSS)';
    status.connettori.ANAC = 'disattivato';

    // Trigger
    var hasTrigger = false;
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'apiScanTutto') {
        hasTrigger = true;
        break;
      }
    }
    status.trigger = hasTrigger ? 'attivo (lun 07:00)' : 'non configurato';

  } catch (e) {
    Logger.log('apiStatus errore: ' + e.message);
    status.errore = e.message;
  }

  return status;
}


/**
 * Legge il foglio Editoria e restituisce i dati per il frontend.
 * Chiamata da google.script.run.getEditoria() nell'interfaccia web.
 * @return {Object} — { items: [{id, tipo, titolo, autore, url, fonte, categoria, data, note}] }
 */
function getEditoria() {
  try {
    var sh = api_getOrCreateEditoria_();
    var lastRow = sh.getLastRow();

    if (lastRow < 2) {
      return { items: [] };
    }

    var data = sh.getRange(2, 1, lastRow - 1, API_EDITORIA_HEADERS.length).getValues();
    var items = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      items.push({
        id: row[0] || '',
        tipo: row[1] || '',
        titolo: row[2] || '',
        autore: row[3] || '',
        url: row[4] || '',
        fonte: row[5] || '',
        categoria: row[6] || '',
        data: row[7] ? Utilities.formatDate(
          row[7] instanceof Date ? row[7] : new Date(row[7]),
          Session.getScriptTimeZone(),
          'yyyy-MM-dd'
        ) : '',
        note: row[8] || ''
      });
    }

    // Ordina per data decrescente
    items.sort(function(a, b) {
      if (!a.data && !b.data) return 0;
      if (!a.data) return 1;
      if (!b.data) return -1;
      return b.data.localeCompare(a.data);
    });

    return { items: items };
  } catch (e) {
    Logger.log('getEditoria errore: ' + e.message);
    return { items: [], errore: e.message };
  }
}

// ============================================================================
// CONNETTORE FONDAZIONE SCUOLA PATRIMONIO — Editoria (RSS WordPress)
// ============================================================================

/**
 * Scarica pubblicazioni dalla Fondazione Scuola Nazionale del Patrimonio (SNaPAC).
 * Feed RSS categoria editoria: libri, manuali, report sul patrimonio culturale.
 * Scrive nel foglio Editoria come tipo "pubblicazione".
 *
 * @param {Object} [opts] {dryRun}
 * @param {Object} [titoliEditoria] Set precaricato per dedup
 * @return {Object} {nuovi, duplicati, errori}
 */
function api_scanFondazionePatrimonio_(opts, titoliEditoria) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, fonte: 'SNaPAC Editoria', nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  var feedUrl = 'https://www.fondazionescuolapatrimonio.it/categoria/editoria/feed/';

  try {
    var resp = api_fetch_(feedUrl);
    if (!resp) {
      report.errori++;
      report.dettagli.push('Feed non raggiungibile');
      return report;
    }

    var xml = resp.getContentText();
    var doc = XmlService.parse(xml);
    var root = doc.getRootElement();
    var channel = root.getChild('channel');
    if (!channel) { report.dettagli.push('Nessun channel nel feed'); return report; }

    var items = channel.getChildren('item');
    Logger.log('SNaPAC Editoria: ' + items.length + ' pubblicazioni nel feed');

    for (var i = 0; i < items.length; i++) {
      try {
        var item = items[i];
        var titolo = item.getChildText('title') || '';
        var link = item.getChildText('link') || '';
        var pubDate = item.getChildText('pubDate') || '';
        var desc = item.getChildText('description') || '';

        if (!titolo || !link) continue;

        // Pulizia descrizione (rimuovi HTML)
        desc = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);

        if (!dryRun) {
          var scritto = api_scriviEditoria_({
            tipo: 'pubblicazione',
            titolo: titolo,
            autore: 'Fondazione Scuola Patrimonio',
            url: link,
            fonte: 'SNaPAC',
            categoria: 'Patrimonio culturale',
            note: desc
          }, titoliEditoria);

          if (scritto) report.nuovi++;
          else report.duplicati++;
        } else {
          report.nuovi++;
        }
      } catch (eItem) {
        report.errori++;
      }
    }

    report.dettagli.push('SNaPAC: ' + items.length + ' nel feed, ' + report.nuovi + ' nuovi');
  } catch (e) {
    report.ok = false;
    report.errori++;
    report.dettagli.push('Errore: ' + e.message);
    Logger.log('SNaPAC errore: ' + e.message);
  }

  Logger.log('SNaPAC completato: ' + JSON.stringify(report));
  return report;
}

// ============================================================================
// CONNETTORE OPEN LIBRARY — Libri su museologia e patrimonio culturale
// ============================================================================

/**
 * Cerca libri su Open Library (openlibrary.org). Nessuna API key.
 * Scrive nel foglio Editoria come tipo "libro".
 */
function api_scanOpenLibrary_(opts, titoliEditoria) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, fonte: 'Open Library', nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var terms = ['museum management cultural heritage', 'museologia patrimonio', 'audience development museum', 'heritage conservation management'];

  for (var t = 0; t < terms.length; t++) {
    try {
      var url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(terms[t]) + '&sort=new&limit=15';
      var resp = api_fetch_(url);
      if (!resp) { report.errori++; continue; }
      var data = JSON.parse(resp.getContentText());
      var docs = data.docs || [];
      Logger.log('Open Library "' + terms[t] + '": ' + docs.length + ' risultati');

      for (var i = 0; i < docs.length; i++) {
        try {
          var doc = docs[i];
          var titolo = doc.title || '';
          if (!titolo) continue;
          var autore = (doc.author_name || []).slice(0, 2).join(', ');
          var key = doc.key || '';
          var linkUrl = key ? 'https://openlibrary.org' + key : '';
          var editore = (doc.publisher && doc.publisher.length) ? doc.publisher[0] : '';
          var anno = doc.first_publish_year || '';
          var isbn = (doc.isbn && doc.isbn.length) ? doc.isbn[0] : '';
          var nota = (editore ? editore + '. ' : '') + (anno ? anno + '. ' : '') + (isbn ? 'ISBN: ' + isbn : '');

          if (!dryRun) {
            var scritto = api_scriviEditoria_({
              tipo: 'libro', titolo: titolo.substring(0, 200), autore: autore,
              url: linkUrl, fonte: 'Open Library', categoria: 'Museologia e patrimonio',
              note: nota.substring(0, 200)
            }, titoliEditoria);
            if (scritto) report.nuovi++; else report.duplicati++;
          } else { report.nuovi++; }
        } catch (eDoc) { report.errori++; }
      }
      Utilities.sleep(API_SLEEP_MS);
    } catch (e) { report.errori++; Logger.log('Open Library errore: ' + e.message); }
  }
  Logger.log('Open Library completato: ' + JSON.stringify(report));
  return report;
}

// ============================================================================
// CONNETTORE GOOGLE BOOKS — Libri su cultura e patrimonio (no API key richiesta)
// ============================================================================

/**
 * Cerca libri su Google Books API v1 — senza API key.
 *
 * NOTA TECNICA: il connettore usa deliberatamente il endpoint pubblico senza
 * &key=. Google Apps Script esegue chiamate server-to-server prive di header
 * Referer: qualsiasi API key con restrizione "HTTP referrer" viene rifiutata
 * con 403 anche se la key e valida e l'API e abilitata nel progetto Cloud.
 * Il Books API v1 funziona senza key con un quota di 1000 richieste/giorno
 * (ampiamente sufficiente per 4 query settimanali = ~17 chiamate/mese).
 *
 * Se in futuro si vuole usare una key dedicata, crearla in Cloud Console
 * come "Server key" senza restrizioni di referrer e salvarla in
 * ScriptProperties come GOOGLE_BOOKS_API_KEY (tipo: "Applicazione server").
 *
 * Scrive nel foglio Editoria come tipo "libro".
 */
function api_scanGoogleBooks_(opts, titoliEditoria) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, fonte: 'Google Books', nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  // Nessuna API key: Books API v1 e gratuita senza key (1000 req/giorno).
  // Se presente GOOGLE_BOOKS_API_KEY di tipo "Server key" (no referrer), usarla.
  var apiKey = '';
  try { apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_BOOKS_API_KEY') || ''; } catch (_) {}
  var keyParam = apiKey ? ('&key=' + apiKey) : '';

  var terms = ['museologia gestione museale', 'patrimonio culturale valorizzazione', 'museum audience development', 'accessibilita musei inclusione'];

  for (var t = 0; t < terms.length; t++) {
    try {
      var url = 'https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(terms[t]) + '&maxResults=10&orderBy=newest' + keyParam;
      var resp = api_fetch_(url);
      if (!resp) { report.errori++; continue; }
      var data = JSON.parse(resp.getContentText());
      if (data.error) {
        var errMsg = (data.error.message || JSON.stringify(data.error));
        Logger.log('Google Books errore API: ' + errMsg);
        report.errori++;
        report.dettagli.push('Errore API ("' + terms[t] + '"): ' + errMsg);
        continue;
      }
      var items = data.items || [];
      Logger.log('Google Books "' + terms[t] + '": ' + items.length + ' risultati');

      for (var i = 0; i < items.length; i++) {
        try {
          var v = items[i].volumeInfo || {};
          var titolo = v.title || '';
          if (!titolo) continue;
          var autore = (v.authors || []).slice(0, 2).join(', ');
          var linkUrl = v.infoLink || '';
          var editore = v.publisher || '';
          var dataPub = v.publishedDate || '';
          var nota = (editore ? editore + '. ' : '') + (dataPub ? dataPub + '.' : '');

          if (!dryRun) {
            var scritto = api_scriviEditoria_({
              tipo: 'libro', titolo: titolo.substring(0, 200), autore: autore,
              url: linkUrl, fonte: 'Google Books',
              categoria: (v.categories && v.categories.length) ? v.categories[0] : 'Cultura',
              note: nota.substring(0, 200)
            }, titoliEditoria);
            if (scritto) report.nuovi++; else report.duplicati++;
          } else { report.nuovi++; }
        } catch (eItem) { report.errori++; }
      }
      Utilities.sleep(API_SLEEP_MS);
    } catch (e) { report.errori++; Logger.log('Google Books errore: ' + e.message); }
  }
  Logger.log('Google Books completato: ' + JSON.stringify(report));
  return report;
}
