/**
 * ============================================================================
 *  FontiMigration_v1.gs — Script migrazione una-tantum verso schema unificato
 * ============================================================================
 *  Sprint 2 anticipato (2026-05-11) — blocco B2
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Scopo: portare i dati esistenti nei nuovi fogli schema unificato 14col
 *  senza perdere nulla. Esecuzione una-tantum da editor GAS dopo deploy.
 *
 *  Funzioni:
 *    migrateSocialFontiToNews()      - SocialFonti -> FontiNews
 *    migrateFontiPodcastSplit()      - FontiPodcast(audio+video) -> Podcast+Video
 *    runFullMigration_Fonti()        - Esegue entrambe in sequenza con report
 *    auditFontiPostMigration()       - Verifica stato post-migrazione
 *
 *  ATTENZIONE: NON distruttivo. I fogli sorgente restano accessibili come
 *  backup. Eliminazione manuale dopo verifica visiva. Idempotente: skip
 *  righe gia' migrate (match per URL).
 * ============================================================================
 */

// ============================================================================
// 1. migrateSocialFontiToNews()
// ----------------------------------------------------------------------------
// SocialFonti schema attuale: ID, Nome, URL, Tipo, Categoria, Avatar, Attiva, Note
// FontiNews target: schema FU_HEADERS 14 colonne (vedi Fonti_v1.js)
// ============================================================================

function migrateSocialFontiToNews() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var src = ss.getSheetByName('SocialFonti');
    if (!src) {
      return { ok: false, error: 'Foglio SocialFonti non trovato (nulla da migrare)' };
    }
    var dst = getFonteSheet('news');  // crea FontiNews se non esiste
    if (!dst) return { ok: false, error: 'getFonteSheet(news) ha fallito' };

    // Carica righe gia' presenti in destinazione per dedup (match URL)
    var dstVals = dst.getDataRange().getValues();
    var existingUrls = {};
    for (var i = 1; i < dstVals.length; i++) {
      var u = String(dstVals[i][FU_COL.URL - 1] || '').trim().toLowerCase();
      if (u) existingUrls[u] = true;
    }

    // Leggi sorgente
    var srcVals = src.getDataRange().getValues();
    if (srcVals.length < 2) return { ok: true, migrate: 0, skipped: 0, message: 'SocialFonti vuoto' };
    var srcHead = srcVals[0].map(function(h){ return String(h||'').trim(); });
    var iId   = srcHead.indexOf('ID');
    var iNome = srcHead.indexOf('Nome');
    var iUrl  = srcHead.indexOf('URL');
    var iTipo = srcHead.indexOf('Tipo');
    var iCat  = srcHead.indexOf('Categoria');
    var iAtt  = srcHead.indexOf('Attiva');
    var iNote = srcHead.indexOf('Note');

    var migrate = 0, skipped = 0, batch = [];
    for (var r = 1; r < srcVals.length; r++) {
      if (!srcVals[r][iId]) continue;
      var url = String(srcVals[r][iUrl] || '').trim();
      if (!url || existingUrls[url.toLowerCase()]) { skipped++; continue; }

      // Mapping: tipo origine 'istituzione|associazione|fondazione|museo|rivista' -> tag
      var tipoSrc = String(srcVals[r][iTipo] || '').toLowerCase();
      var tag = 'editoriale';
      if (tipoSrc === 'istituzione' || tipoSrc === 'associazione' || tipoSrc === 'fondazione' || tipoSrc === 'museo') {
        tag = 'istituzionale';
      } else if (tipoSrc === 'rivista' || tipoSrc === 'blog') {
        tag = 'editoriale';
      }

      var row = new Array(FU_HEADERS.length).fill('');
      row[FU_COL.ID - 1]               = 'FN_' + String(srcVals[r][iId]).replace(/^SW/i, '');
      row[FU_COL.NOME - 1]             = String(srcVals[r][iNome] || '').trim();
      row[FU_COL.URL - 1]              = url;
      row[FU_COL.TIPO - 1]             = 'RSS';   // SocialFonti era prevalentemente RSS
      row[FU_COL.TAG - 1]              = tag;
      row[FU_COL.CATEGORIA - 1]        = String(srcVals[r][iCat] || '').trim();
      row[FU_COL.PRIORITA - 1]         = 2;
      row[FU_COL.ATTIVA - 1]           = (srcVals[r][iAtt] === true || srcVals[r][iAtt] === 'TRUE');
      row[FU_COL.DATA_AGGIUNTA - 1]    = new Date();
      row[FU_COL.ULTIMA_SCAN - 1]      = '';
      row[FU_COL.ULTIMO_ESITO - 1]     = '';
      row[FU_COL.N_REC_TOTALI - 1]     = 0;
      row[FU_COL.N_REC_ULTIMO - 1]     = 0;
      row[FU_COL.FAIL_CONSECUTIVI - 1] = 0;
      batch.push(row);
      migrate++;
    }

    if (batch.length > 0) {
      var lastRow = dst.getLastRow();
      dst.getRange(lastRow + 1, 1, batch.length, FU_HEADERS.length).setValues(batch);
    }

    Logger.log('migrateSocialFontiToNews: migrate=' + migrate + ', skipped(gia presenti)=' + skipped);
    return { ok: true, migrate: migrate, skipped: skipped, destinazione: 'FontiNews' };
  } catch(e) {
    Logger.log('migrateSocialFontiToNews ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// 2. migrateFontiPodcastSplit()
// ----------------------------------------------------------------------------
// FontiPodcast attuale: ID, Nome, URL, TipoContenuto (audio|video), Tematica,
//                       Avatar, Attiva, Note, ChannelId (se video), feedUrl
// Split:
//   TipoContenuto=audio -> resta in FontiPodcast (con schema unificato applicato)
//   TipoContenuto=video -> copiato in FontiVideo (nuovo)
// La fonte originale viene aggiornata in place al nuovo schema 14 col (additivo).
// ============================================================================

function migrateFontiPodcastSplit() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var src = ss.getSheetByName('FontiPodcast');
    if (!src) return { ok: false, error: 'Foglio FontiPodcast non trovato' };
    var dstVideo = getFonteSheet('video');
    if (!dstVideo) return { ok: false, error: 'getFonteSheet(video) ha fallito' };

    // URL gia' in FontiVideo
    var vidVals = dstVideo.getDataRange().getValues();
    var existingVideoUrls = {};
    for (var i = 1; i < vidVals.length; i++) {
      var u = String(vidVals[i][FU_COL.URL - 1] || '').trim().toLowerCase();
      if (u) existingVideoUrls[u] = true;
    }

    var srcVals = src.getDataRange().getValues();
    if (srcVals.length < 2) return { ok: true, video_migrate: 0, audio_in_place: 0 };
    var head = srcVals[0].map(function(h){ return String(h||'').trim(); });
    var iId   = head.indexOf('ID');
    var iNome = head.indexOf('Nome');
    var iUrl  = head.indexOf('URL');
    var iTipo = head.indexOf('TipoContenuto');
    var iTema = head.indexOf('Tematica');
    var iAtt  = head.indexOf('Attiva');

    var videoMigrate = 0, videoSkipped = 0, audioCount = 0;
    var videoBatch = [];

    for (var r = 1; r < srcVals.length; r++) {
      if (!srcVals[r][iId]) continue;
      var tipoC = String(srcVals[r][iTipo] || 'audio').toLowerCase();
      if (tipoC === 'video') {
        var url = String(srcVals[r][iUrl] || '').trim();
        if (!url || existingVideoUrls[url.toLowerCase()]) { videoSkipped++; continue; }
        var row = new Array(FU_HEADERS.length).fill('');
        row[FU_COL.ID - 1]               = 'FV_' + String(srcVals[r][iId]).replace(/^FP/i, '');
        row[FU_COL.NOME - 1]             = String(srcVals[r][iNome] || '').trim();
        row[FU_COL.URL - 1]              = url;
        row[FU_COL.TIPO - 1]             = 'YouTube';
        row[FU_COL.TAG - 1]              = 'video';
        row[FU_COL.CATEGORIA - 1]        = String(srcVals[r][iTema] || '').trim();
        row[FU_COL.PRIORITA - 1]         = 2;
        row[FU_COL.ATTIVA - 1]           = (srcVals[r][iAtt] === true || srcVals[r][iAtt] === 'TRUE');
        row[FU_COL.DATA_AGGIUNTA - 1]    = new Date();
        row[FU_COL.ULTIMA_SCAN - 1]      = '';
        row[FU_COL.ULTIMO_ESITO - 1]     = '';
        row[FU_COL.N_REC_TOTALI - 1]     = 0;
        row[FU_COL.N_REC_ULTIMO - 1]     = 0;
        row[FU_COL.FAIL_CONSECUTIVI - 1] = 0;
        videoBatch.push(row);
        videoMigrate++;
      } else {
        audioCount++;
      }
    }

    if (videoBatch.length > 0) {
      var lastV = dstVideo.getLastRow();
      dstVideo.getRange(lastV + 1, 1, videoBatch.length, FU_HEADERS.length).setValues(videoBatch);
    }

    Logger.log('migrateFontiPodcastSplit: video_migrate=' + videoMigrate +
               ', video_skipped=' + videoSkipped + ', audio_in_place=' + audioCount);
    return {
      ok: true,
      video_migrate: videoMigrate,
      video_skipped: videoSkipped,
      audio_in_place: audioCount,
      destinazione_video: 'FontiVideo'
    };
  } catch(e) {
    Logger.log('migrateFontiPodcastSplit ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// 3. runFullMigration_Fonti() — chiamata orchestrata
// ============================================================================

function runFullMigration_Fonti() {
  Logger.log('====================================================================');
  Logger.log('MIGRAZIONE FONTI VERSO SCHEMA UNIFICATO — INIZIO ' + new Date().toISOString());
  Logger.log('====================================================================');
  var r1 = migrateSocialFontiToNews();
  Logger.log('  SocialFonti -> FontiNews: ' + JSON.stringify(r1));
  var r2 = migrateFontiPodcastSplit();
  Logger.log('  FontiPodcast split video: ' + JSON.stringify(r2));
  var audit = auditFontiPostMigration();
  Logger.log('  AUDIT post-migrazione: ' + JSON.stringify(audit));
  Logger.log('====================================================================');
  Logger.log('FINE — ricorda di eliminare manualmente SocialFonti e cleanup FontiPodcast');
  return { ok: true, socialToNews: r1, podcastSplit: r2, audit: audit };
}

// ============================================================================
// 4. auditFontiPostMigration()
// ============================================================================

function auditFontiPostMigration() {
  try {
    var counters = getFontiCounters();
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var report = {
      counters: counters.counters,
      fogli_sorgente_residui: {
        SocialFonti: !!ss.getSheetByName('SocialFonti'),
        FontiBandi_v4_legacy: !!ss.getSheetByName('FontiBandi')
      }
    };
    return report;
  } catch(e) {
    return { error: e.message };
  }
}

// ============================================================================
// 5. UNIFICAZIONE SCHEMA FU17 — v4.18.50 (2026-05-15)
// ----------------------------------------------------------------------------
//  Migrazione finale degli schemi disomogenei verso lo schema unificato a 17 col:
//
//   COL 1-14 (uguali a FU14 attuale):
//     ID, Nome, URL, Tipo, Tag, Categoria, Priorita, Attiva,
//     DataAggiunta, UltimaScan, UltimoEsito, NRecordTotali, NRecordUltimo, FailConsecutivi
//
//   COL 15-17 (estensione specifica per bandi/podcast/video):
//     UltimoErrore (string descrittiva) · EnteDefault (string) · Livello (string)
//
//   COL 18 (extras_json, opzionale): JSON con campi specifici (UrlEnte, Note,
//     ChannelId, Avatar, TipoContenuto, ecc.) preservati per backward-compat
//
//  Strategia idempotente:
//   - Snapshot backup AUTOMATICO ogni volta che si scrive (foglio _pre_FU17)
//   - Mapping per nome header (case-insensitive) → resilienza a posizione cambiata
//   - dryRun = solo report, non scrive
// ============================================================================

var FU17_HEADERS = [
  'ID','Nome','URL','Tipo','Tag','Categoria','Priorita','Attiva',
  'DataAggiunta','UltimaScan','UltimoEsito','NRecordTotali','NRecordUltimo','FailConsecutivi',
  'UltimoErrore','EnteDefault','Livello','extras_json'
];

/**
 * v4.18.50 — Migra il foglio FontiBandi_v5 (schema legacy 18 col) verso FU17 (18 col).
 *
 * Trasformazioni:
 *   - 'Categoria' (col 5 vecchio) → copiata anche in 'Tag' (col 5 nuovo) se Tag vuoto
 *   - 'NBandiTotali','NBandiUltimoScan' → 'NRecordTotali','NRecordUltimo'
 *   - 'UltimaScansione' → 'UltimaScan'
 *   - 'UrlEnte','Note' → impacchettati in 'extras_json' (col 18)
 *   - Resto: mantiene mapping per nome (resiliente)
 *
 * @param {Object} [opts] {dryRun: bool}
 * @return {Object} {ok, sheetName, righe_migrate, backup_creato, dryRun, sample, error?}
 */
function migrateBandiV5ToFU17(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  return _migrateSheetToFU17_({
    sheetName: 'FontiBandi_v5',
    backupName: 'FontiBandi_v5_pre_FU17',
    dryRun: dryRun,
    fieldMap: {
      // header sorgente (case-insensitive) → header destinazione FU17
      'id':                'ID',
      'nome':              'Nome',
      'url':               'URL',
      'tipo':              'Tipo',
      'categoria':         'Categoria',
      'priorita':          'Priorita',
      'attiva':            'Attiva',
      'dataaggiunta':      'DataAggiunta',
      'ultimascansione':   'UltimaScan',
      'ultimoesito':       'UltimoEsito',
      'nbanditotali':      'NRecordTotali',
      'nbandiultimoscan':  'NRecordUltimo',
      'failconsecutivi':   'FailConsecutivi',
      'ultimoerrore':      'UltimoErrore',
      'entedefault':       'EnteDefault',
      'livello':           'Livello'
    },
    extrasFields: ['urlente','note'],  // finiscono in extras_json
    // Copia Categoria → Tag se Tag vuoto (Bandi_v5 non aveva colonna Tag)
    postRowTransform: function(rowOut, headerLow) {
      var iTag = FU17_HEADERS.indexOf('Tag');
      var iCat = FU17_HEADERS.indexOf('Categoria');
      if (iTag >= 0 && iCat >= 0 && !rowOut[iTag] && rowOut[iCat]) {
        rowOut[iTag] = rowOut[iCat];
      }
    }
  });
}

/**
 * v4.18.50 — Migra il foglio FontiPodcast (schema legacy 10 col) verso FU17.
 *
 * Trasformazioni:
 *   - 'TipoContenuto' (audio|video) → 'Tag' (audio|video)
 *   - 'Tematica' → 'Categoria'
 *   - 'feedUrl' (se presente) sovrascrive 'URL' (è l'URL canonico del feed RSS)
 *   - 'Avatar','ChannelId','Note' → impacchettati in 'extras_json'
 *   - Aggiunge defaults: Tipo='RSS' (audio) o 'YouTube' (video), Priorita=2
 */
function migratePodcastToFU17(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  return _migrateSheetToFU17_({
    sheetName: 'FontiPodcast',
    backupName: 'FontiPodcast_pre_FU17',
    dryRun: dryRun,
    fieldMap: {
      'id':       'ID',
      'nome':     'Nome',
      'url':      'URL',
      'url_rss':  'URL',
      'feedurl':  'URL',
      'tipocontenuto': 'Tag',
      'tematica': 'Categoria',
      'attiva':   'Attiva'
    },
    extrasFields: ['avatar','channelid','note'],
    postRowTransform: function(rowOut, headerLow) {
      // Defaults
      var iTipo = FU17_HEADERS.indexOf('Tipo');
      var iPri  = FU17_HEADERS.indexOf('Priorita');
      var iData = FU17_HEADERS.indexOf('DataAggiunta');
      var iTag  = FU17_HEADERS.indexOf('Tag');
      var tagVal = String(rowOut[iTag] || '').toLowerCase();
      if (!rowOut[iTipo]) rowOut[iTipo] = (tagVal === 'video') ? 'YouTube' : 'RSS';
      if (!rowOut[iPri]) rowOut[iPri] = 2;
      if (!rowOut[iData]) rowOut[iData] = new Date();
      // Normalize Tag: audio|video|settoriale
      if (!tagVal) rowOut[iTag] = 'audio';
    }
  });
}

/**
 * v4.18.50 — Orchestratore: esegue migrazione FU17 su tutti i fogli che ne hanno bisogno.
 * Idempotente.
 *
 * @param {Object} [opts] {dryRun: bool}
 * @return {Object} {ok, bandiV5, podcast, fontiNews_check, fontiVideo_check}
 */
function migrateAllSheetsToFU17(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  opts = opts || {};
  var t0 = new Date().getTime();
  Logger.log('================================================================');
  Logger.log('MIGRAZIONE FU17 — INIZIO ' + new Date().toISOString() + ' dryRun=' + !!opts.dryRun);
  Logger.log('================================================================');

  var report = { ok:true, dryRun: !!opts.dryRun, timestamp: new Date().toISOString() };

  // 1. FontiBandi_v5 (schema legacy 18 col → FU17)
  try {
    report.bandiV5 = migrateBandiV5ToFU17(opts);
    Logger.log('  FontiBandi_v5: ' + JSON.stringify(report.bandiV5).substring(0, 250));
  } catch(e) {
    report.bandiV5 = { ok:false, error: e.message };
    report.ok = false;
  }

  // 2. FontiPodcast (schema legacy 10 col → FU17)
  try {
    report.podcast = migratePodcastToFU17(opts);
    Logger.log('  FontiPodcast: ' + JSON.stringify(report.podcast).substring(0, 250));
  } catch(e) {
    report.podcast = { ok:false, error: e.message };
    report.ok = false;
  }

  // 3. FontiNews + FontiVideo (già FU14, verifica + estensione a 17 col)
  try {
    report.fontiNews_check = _ensureFU17Headers_('FontiNews', opts.dryRun);
    report.fontiVideo_check = _ensureFU17Headers_('FontiVideo', opts.dryRun);
  } catch(e) {
    Logger.log('check FontiNews/FontiVideo: ' + e.message);
  }

  report.duration_ms = new Date().getTime() - t0;
  Logger.log('================================================================');
  Logger.log('MIGRAZIONE FU17 — FINE (' + report.duration_ms + 'ms) — ' + (report.ok ? 'OK' : 'CON ERRORI'));
  Logger.log('================================================================');
  return report;
}

/**
 * @private Migra un singolo foglio verso schema FU17 con backup + mapping resiliente.
 */
function _migrateSheetToFU17_(cfg) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(cfg.sheetName);
    if (!sh) return { ok:false, error:'foglio_' + cfg.sheetName + '_assente' };

    var vals = sh.getDataRange().getValues();
    if (vals.length < 1) return { ok:false, error:'foglio_vuoto' };

    var oldHeader = vals[0].map(function(h){ return String(h || '').trim(); });
    var oldHeaderLow = oldHeader.map(function(h){ return h.toLowerCase(); });

    // Verifica se è già migrato (header coincide con FU17)
    var alreadyMigrated = FU17_HEADERS.every(function(h, i){
      return oldHeaderLow[i] === h.toLowerCase();
    });
    if (alreadyMigrated && oldHeader.length === FU17_HEADERS.length) {
      Logger.log('  ' + cfg.sheetName + ' già migrato a FU17 (idempotente, skip)');
      return { ok:true, sheetName: cfg.sheetName, alreadyMigrated: true, righe: vals.length - 1 };
    }

    // Costruisci mapping colonna sorgente → destinazione
    var sourceToDestIdx = oldHeaderLow.map(function(h){
      var dest = cfg.fieldMap[h];
      if (!dest) return -1;
      return FU17_HEADERS.indexOf(dest);
    });
    var extrasIdx = oldHeaderLow.map(function(h){
      return (cfg.extrasFields || []).indexOf(h);
    });

    // Costruisci nuove righe
    var newRows = [];
    var sample = [];
    var iExtras = FU17_HEADERS.indexOf('extras_json');
    for (var r = 1; r < vals.length; r++) {
      var src = vals[r];
      if (!src[0]) continue; // skip righe senza ID
      var rowOut = new Array(FU17_HEADERS.length).fill('');
      var extras = {};
      for (var c = 0; c < src.length; c++) {
        var destIdx = sourceToDestIdx[c];
        if (destIdx >= 0) {
          rowOut[destIdx] = src[c];
        } else if (extrasIdx[c] >= 0 && src[c] != null && src[c] !== '') {
          extras[oldHeaderLow[c]] = src[c];
        }
      }
      if (Object.keys(extras).length > 0 && iExtras >= 0) {
        rowOut[iExtras] = JSON.stringify(extras);
      }
      if (cfg.postRowTransform) cfg.postRowTransform(rowOut, oldHeaderLow);
      newRows.push(rowOut);
      if (sample.length < 3) sample.push({
        id: String(rowOut[0]),
        nome: String(rowOut[1]).substring(0, 50),
        tag: String(rowOut[4]),
        categoria: String(rowOut[5]),
        attiva: rowOut[7]
      });
    }

    var report = {
      ok: true,
      sheetName: cfg.sheetName,
      dryRun: !!cfg.dryRun,
      righe_originali: vals.length - 1,
      righe_da_migrare: newRows.length,
      vecchio_schema_colonne: oldHeader.length,
      nuovo_schema_colonne: FU17_HEADERS.length,
      sample: sample
    };

    if (cfg.dryRun) {
      Logger.log('  [DRY-RUN] ' + cfg.sheetName + ': ' + newRows.length + ' righe pronte (no scrittura)');
      return report;
    }

    // Backup automatico (snapshot)
    var existingBackup = ss.getSheetByName(cfg.backupName);
    if (existingBackup) {
      var backupTs = cfg.backupName + '_' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMMdd_HHmm');
      sh.copyTo(ss).setName(backupTs);
      report.backup_creato = backupTs;
    } else {
      sh.copyTo(ss).setName(cfg.backupName);
      report.backup_creato = cfg.backupName;
    }

    // Scrivi nuovo schema: clear + scrittura header + righe
    sh.clear();
    sh.getRange(1, 1, 1, FU17_HEADERS.length).setValues([FU17_HEADERS])
      .setFontWeight('bold').setBackground('#8B3A1F').setFontColor('#fff');
    if (newRows.length > 0) {
      sh.getRange(2, 1, newRows.length, FU17_HEADERS.length).setValues(newRows);
    }
    sh.setFrozenRows(1);

    report.righe_scritte = newRows.length;
    Logger.log('  ✓ ' + cfg.sheetName + ' migrato: ' + newRows.length + ' righe + backup ' + report.backup_creato);
    return report;
  } catch(e) {
    Logger.log('_migrateSheetToFU17_ FATAL: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * @private Verifica che un foglio FU14 abbia header allineati a FU17 (estende se mancano).
 * Per FontiNews e FontiVideo che già usano schema FU14 quasi-allineato.
 */
function _ensureFU17Headers_(sheetName, dryRun) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return { sheet: sheetName, present: false };
    var oldHeader = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function(h){ return String(h || '').trim().toLowerCase(); });
    var missing = [];
    FU17_HEADERS.forEach(function(h, i){
      if (oldHeader.indexOf(h.toLowerCase()) < 0) missing.push(h);
    });
    if (missing.length === 0) return { sheet: sheetName, present: true, alreadyFU17: true };
    if (!dryRun) {
      // Aggiunge le colonne mancanti in coda
      var startCol = sh.getLastColumn() + 1;
      missing.forEach(function(h, idx){
        sh.getRange(1, startCol + idx).setValue(h)
          .setFontWeight('bold').setBackground('#8B3A1F').setFontColor('#fff');
      });
    }
    return { sheet: sheetName, present: true, missing: missing, fixed: !dryRun };
  } catch(e) { return { sheet: sheetName, error: e.message }; }
}

// ============================================================================
// FINE MODULO FontiMigration_v1.gs
// ============================================================================
