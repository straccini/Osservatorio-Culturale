/**
 * ============================================================================
 *  BandiUnify.js — Unificazione RADAR BANDI → Bandi_v5
 * ============================================================================
 *  v1.0.0 (2026-05-26)
 *
 *  Migra tutti i bandi da RADAR BANDI (legacy, 20 colonne) a Bandi_v5
 *  (26 colonne), poi redirige tutte le scritture future su Bandi_v5.
 *
 *  Funzioni:
 *    migraBandiRadarToV5()     — migrazione one-shot (idempotente)
 *    bandiUnifyDiagnostica()   — report stato pre/post migrazione
 *
 *  Dopo la migrazione:
 *    - getSheetRadar() punta a Bandi_v5 (alias)
 *    - getBandiRadar() legge da Bandi_v5
 *    - Lo scanner legacy (Scannerbandi.js) scrive su Bandi_v5
 *    - RADAR BANDI viene rinominato in _RADAR_BANDI_LEGACY_
 * ============================================================================
 */

/**
 * Mappatura colonne: RADAR BANDI (COL legacy) → Bandi_v5 (COL_B)
 *
 * RADAR BANDI:
 *   1:DataRilevamento, 2:Titolo, 3:Ente, 4:Livello, 5:Regione,
 *   6:Settore, 7:Soggetti, 8:Importo, 9:Cofin, 10:Scadenza,
 *   11:Status, 12:Cliente, 13:Link, 14:Note, 15:Fonte,
 *   16:Priorita, 17:Nascosto, 18:StatoRecord, 19:UrlEnte, 20:LettoBando
 *
 * Bandi_v5:
 *   1:ID, 2:Fingerprint, 3:DataRilevamento, 4:Titolo, 5:Ente, 6:Livello,
 *   7:Regione, 8:Settore, 9:Soggetti, 10:Importo, 11:Cofin, 12:Scadenza,
 *   13:FonteID, 14:FonteNome, 15:UrlBando, 16:UrlEnte, 17:UrlValidato,
 *   18:DataValidazione, 19:Sommario, 20:Ambito, 21:PrioritaRegionale,
 *   22:Status, 23:StatoRecord, 24:Letto, 25:Salvato, 26:Note
 */

function migraBandiRadarToV5() {
  Logger.log('================================================================');
  Logger.log('MIGRAZIONE RADAR BANDI → Bandi_v5');
  Logger.log('================================================================');

  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var report = { ok: true, migrati: 0, duplicati: 0, errori: 0 };

  // 1. Verifica che entrambi i fogli esistano
  var shRadar = ss.getSheetByName('RADAR BANDI');
  if (!shRadar) {
    // Gia migrato o non esiste
    var shLegacy = ss.getSheetByName('_RADAR_BANDI_LEGACY_');
    if (shLegacy) {
      Logger.log('[UNIFY] RADAR BANDI gia rinominato in _RADAR_BANDI_LEGACY_. Migrazione gia eseguita.');
      return { ok: true, alreadyDone: true };
    }
    Logger.log('[UNIFY] Foglio RADAR BANDI non trovato.');
    return { ok: true, noSource: true };
  }

  var shV5 = ss.getSheetByName('Bandi_v5');
  if (!shV5) {
    Logger.log('[UNIFY] Foglio Bandi_v5 non trovato. Lancia setupBandiV5Schema() prima.');
    return { ok: false, error: 'Bandi_v5 non esiste' };
  }

  // 2. Carica URL esistenti in Bandi_v5 per deduplicazione
  var existingUrls = {};
  var existingTitles = {};
  var v5Data = shV5.getDataRange().getValues();
  var v5Head = v5Data[0];
  var iV5Url = v5Head.indexOf('UrlBando');
  var iV5Tit = v5Head.indexOf('Titolo');
  for (var i = 1; i < v5Data.length; i++) {
    var u = String(v5Data[i][iV5Url] || '').trim().toLowerCase();
    var t = String(v5Data[i][iV5Tit] || '').trim().toLowerCase();
    if (u) existingUrls[u] = true;
    if (t) existingTitles[t] = true;
  }

  // 3. Leggi RADAR BANDI
  var radarLastRow = shRadar.getLastRow();
  if (radarLastRow < 2) {
    Logger.log('[UNIFY] RADAR BANDI vuoto.');
    shRadar.setName('_RADAR_BANDI_LEGACY_');
    return { ok: true, migrati: 0 };
  }

  var radarData = shRadar.getRange(2, 1, radarLastRow - 1, 20).getValues();
  Logger.log('[UNIFY] Righe da migrare: ' + radarData.length);

  // 4. Migra riga per riga
  var batch = [];
  radarData.forEach(function(row, idx) {
    var titolo = String(row[1] || '').trim(); // col 2: Titolo
    var link = String(row[12] || '').trim();  // col 13: Link
    if (!titolo) return;

    // Dedup: salta se URL o titolo gia presenti in Bandi_v5
    if (link && existingUrls[link.toLowerCase()]) { report.duplicati++; return; }
    if (existingTitles[titolo.toLowerCase()]) { report.duplicati++; return; }

    // Genera ID
    var id = 'MIG' + (idx + 1) + '_' + Date.now().toString(36);

    // Mappa campi
    var dataRil = row[0] || '';   // col 1
    var ente = String(row[2] || '');
    var livello = String(row[3] || '');
    var regione = String(row[4] || '');
    var settore = String(row[5] || '');
    var soggetti = String(row[6] || '');
    var importo = row[7] || '';
    var cofin = row[8] || '';
    var scadenza = row[9] || '';  // col 10
    var status = String(row[10] || 'Nuovo');
    var note = String(row[13] || '');
    var fonte = String(row[14] || '');
    var statoRecord = String(row[17] || 'attivo');
    var urlEnte = String(row[18] || '');
    var letto = row[19] === true || String(row[19]).toLowerCase() === 'true';

    // Costruisci riga Bandi_v5 (26 colonne)
    var v5Row = [
      id,                    // 1: ID
      '',                    // 2: Fingerprint
      dataRil,               // 3: DataRilevamento
      titolo.substring(0,300), // 4: Titolo
      ente,                  // 5: Ente
      livello,               // 6: Livello
      regione,               // 7: Regione
      settore,               // 8: Settore
      soggetti,              // 9: Soggetti
      importo,               // 10: Importo
      cofin,                 // 11: Cofin
      scadenza,              // 12: Scadenza
      'LEGACY',              // 13: FonteID
      fonte,                 // 14: FonteNome
      link,                  // 15: UrlBando
      urlEnte,               // 16: UrlEnte
      '',                    // 17: UrlValidato
      '',                    // 18: DataValidazione
      note,                  // 19: Sommario (usa Note come sommario)
      '',                    // 20: Ambito
      '',                    // 21: PrioritaRegionale
      status,                // 22: Status
      statoRecord,           // 23: StatoRecord
      letto,                 // 24: Letto
      false,                 // 25: Salvato
      'Migrato da RADAR BANDI' // 26: Note
    ];

    batch.push(v5Row);
    report.migrati++;
  });

  // 5. Scrivi batch in Bandi_v5
  if (batch.length > 0) {
    var startRow = shV5.getLastRow() + 1;
    shV5.getRange(startRow, 1, batch.length, 26).setValues(batch);
    Logger.log('[UNIFY] Scritte ' + batch.length + ' righe in Bandi_v5');
  }

  // 6. Rinomina RADAR BANDI in _RADAR_BANDI_LEGACY_ (non cancella, archivio)
  shRadar.setName('_RADAR_BANDI_LEGACY_');
  Logger.log('[UNIFY] RADAR BANDI rinominato in _RADAR_BANDI_LEGACY_');

  // 7. Riepilogo
  Logger.log('================================================================');
  Logger.log('[UNIFY] COMPLETATO: ' + report.migrati + ' migrati, ' + report.duplicati + ' duplicati, ' + report.errori + ' errori');
  Logger.log('================================================================');

  return report;
}

function bandiUnifyDiagnostica() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var out = { ok: true };

  var shRadar = ss.getSheetByName('RADAR BANDI');
  var shLegacy = ss.getSheetByName('_RADAR_BANDI_LEGACY_');
  var shV5 = ss.getSheetByName('Bandi_v5');

  out.radarBandi = shRadar ? (shRadar.getLastRow() - 1) + ' righe' : 'NON ESISTE';
  out.radarLegacy = shLegacy ? (shLegacy.getLastRow() - 1) + ' righe (archivio)' : 'NON ESISTE';
  out.bandiV5 = shV5 ? (shV5.getLastRow() - 1) + ' righe' : 'NON ESISTE';
  out.migrato = !!shLegacy && !shRadar;
  out.getSheetRadarPunta = 'Bandi_v5 (dopo migrazione)';

  Logger.log('[UNIFY] Diagnostica: ' + JSON.stringify(out));
  return out;
}
