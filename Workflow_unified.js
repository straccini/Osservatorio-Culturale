/**
 * ============================================================================
 *  Workflow_unified.gs — API unificata "leggi → memorizza → archivia"
 * ============================================================================
 *  Sprint 1.1 (INT-6 · 2026-04-29)
 *  Autore: Silvano Straccini / Duemilamusei
 *
 *  SCOPO
 *  -----
 *  Esporre 4 azioni utente + 2 azioni automatiche, valide indistintamente
 *  per Bandi, News (Items) e Podcast. Wrap delle 9 funzioni preesistenti
 *  sparse in Codice.gs (toggleLettoBando, archiviaRecord, ripristinaRecord,
 *  deleteArchiviato, deleteArchivioBulk, deleteArchivioTutto,
 *  autoArchiviaNotizieVecchie, archiviaNotizieOlderThan,
 *  eliminaArchiviatiTutti, autoArchiviaScaduti).
 *
 *  Le funzioni legacy NON vengono rimosse in questo sprint per non rompere
 *  i punti di chiamata esistenti nel frontend. Sono marcate come @deprecated
 *  nel CLAUDE.md della codebase. Migrazione progressiva nei prossimi sprint.
 *
 *  STATI POSSIBILI di un record (universali):
 *      NUOVO       — record appena rilevato dallo scanner, mai aperto
 *      LETTO       — l'utente ha aperto/visualizzato il record
 *      SALVATO     — l'utente lo segna esplicitamente (interesse)
 *      ARCHIVIATO  — fuori dalle liste correnti, conservato per ricerca
 *      ELIMINATO   — rimosso definitivamente (operazione raramente necessaria)
 *
 *  AZIONI UTENTE (4):
 *      markRead(tipo, id)
 *      toggleSaved(tipo, id)
 *      archive(tipo, id)
 *      restore(tipo, id)
 *
 *  AZIONI AUTOMATICHE (2 — chiamate da trigger):
 *      autoArchiveOld(tipo, soglia_giorni)
 *      autoDeleteVeryOld(tipo, soglia_mesi)   [ATTENZIONE: distruttiva]
 *
 *  TIPI SUPPORTATI: 'bando' | 'item' | 'podcast'
 *
 * ============================================================================
 */

// ============================================================================
// MAPPATURA INTERNA: tipo → configurazione sheet/colonne
// ----------------------------------------------------------------------------
// Centralizza qui la conoscenza di "quale sheet, quale colonna, che valore"
// in modo che le 4 azioni utente non debbano sapere i dettagli.
// ============================================================================

function _wfConfig_(tipo) {
  switch (String(tipo).toLowerCase()) {
    case 'bando':
      return {
        getSheet: function() { return getSheetRadar(); },
        colLetto:    (typeof COL !== 'undefined' && COL.LETTO_BANDO)    ? COL.LETTO_BANDO    : null,
        colSalvato:  (typeof COL !== 'undefined' && COL.SALVATO)        ? COL.SALVATO        : null,
        // Bandi usano colonna STATO_RECORD con valori 'attivo'/'archiviato' (testo).
        statoMode: 'text',
        colStato:    (typeof COL !== 'undefined' && COL.STATO_RECORD)   ? COL.STATO_RECORD   : null,
        valArch:  'archiviato',
        valAttivo:'attivo',
        // Per archiviazione automatica/eliminazione bulk (riusa funzioni esistenti).
        legacyAutoArch: 'autoArchiviaScaduti',
        legacyDeleteAll: 'deleteArchivioTutto'
      };
    case 'item':
    case 'news':
      return {
        sheetName: (typeof SH !== 'undefined' && SH.ITEMS) ? SH.ITEMS : 'Items',
        // Items usano colonne booleane: Letto / Salvato / Archiviato.
        statoMode: 'boolean',
        colLettoName:    'Letto',
        colSalvatoName:  'Salvato',
        colArchivName:   'Archiviato',
        legacyAutoArch:  'autoArchiviaNotizieVecchie',
        legacyDeleteAll: 'eliminaArchiviatiTutti'
      };
    case 'podcast':
      return {
        sheetName: (typeof SH !== 'undefined' && SH.PODCAST) ? SH.PODCAST : 'Podcast',
        statoMode: 'mixed',
        // Podcast usano: Ascoltato (boolean) + StatoRecord (testo, attivo/archiviato).
        colLettoName:    'Ascoltato',
        colSalvatoName:  'Salvato',     // potrebbe non esistere — gestito a runtime
        colStatoName:    'StatoRecord',
        valArch:  'archiviato',
        valAttivo:'attivo',
        legacyAutoArch:  null,
        legacyDeleteAll: null
      };
    case 'video':
      // Video: stesso foglio Podcast, filtra solo ID=VID*, StatoRecord testo
      return {
        sheetName: (typeof SH !== 'undefined' && SH.PODCAST) ? SH.PODCAST : 'Podcast',
        statoMode: 'text',
        colStatoName:    'StatoRecord',
        valArch:  'archiviato',
        valAttivo:'attivo',
        legacyAutoArch:  null,
        legacyDeleteAll: null
      };
    case 'libro':
    case 'libri':
      // Libri: foglio Pubblicazioni, colonna Stato testo
      return {
        sheetName: (typeof SH !== 'undefined' && SH.LIBRI) ? SH.LIBRI : 'Pubblicazioni',
        statoMode: 'text',
        colStatoName:    'Stato',
        valArch:  'archiviato',
        valAttivo:'attivo',
        legacyAutoArch:  null,
        legacyDeleteAll: null
      };
    default:
      throw new Error('_wfConfig_: tipo sconosciuto "' + tipo + '"');
  }
}

// ============================================================================
// AZIONE 1 — markRead(tipo, id)
// ----------------------------------------------------------------------------
// Marca un record come LETTO (set true). Idempotente.
// Per BANDO usa toggleLettoBando esistente (in realtà toggle, ma se è già
// letto non incide negativamente sull'esperienza utente).
// ============================================================================

function markRead(tipo, id) {
  // Role guard: richiede almeno lettore (livello >= 1)
  try {
    var _u = getCurrentUser_v44();
    if (!_u || _u.ruolo === 'guest' || _u.ruolo === 'anonimo' || _u.ruolo === 'ospite') {
      return { error: 'Azione riservata agli utenti registrati' };
    }
  } catch(e) {}
  try {
    var c = _wfConfig_(tipo);

    if (tipo === 'bando' || tipo === 'bandi') {
      // Riusa funzione esistente in Codice.gs
      var sheet = c.getSheet();
      var rowIndex = parseInt(String(id || '').replace('r',''));
      if (!rowIndex || isNaN(rowIndex)) return { ok:false, error:'ID non valido' };
      sheet.getRange(rowIndex, c.colLetto).setValue(true);
      return { ok:true, tipo:'bando', id:id, action:'markRead' };
    }

    // Per item / news / podcast → setItemField generalizzato sul sheet.
    return _wfSetField_(c, id, c.colLettoName || 'Letto', true, 'markRead');
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ============================================================================
// AZIONE 2 — toggleSaved(tipo, id)
// ----------------------------------------------------------------------------
// Toggle del flag "Salvato" sul record. Riusa toggleItemField di Codice.gs
// quando disponibile (per items).
// ============================================================================

function toggleSaved(tipo, id) {
  // Role guard: richiede almeno lettore (livello >= 1)
  try {
    var _u = getCurrentUser_v44();
    if (!_u || _u.ruolo === 'guest' || _u.ruolo === 'anonimo' || _u.ruolo === 'ospite') {
      return { error: 'Azione riservata agli utenti registrati' };
    }
  } catch(e) {}
  try {
    var c = _wfConfig_(tipo);

    if (tipo === 'item' || tipo === 'news' || tipo === 'items') {
      // Riusa toggleItemField esistente
      if (typeof toggleItemField === 'function') {
        var r = toggleItemField(id, 'Salvato');
        return { ok:true, tipo:'item', id:id, action:'toggleSaved', result:r };
      }
    }
    // Fallback generico: legge → inverte → scrive
    return _wfToggleField_(c, id, c.colSalvatoName || 'Salvato', 'toggleSaved');
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ============================================================================
// AZIONE 3 — archive(tipo, id)
// ----------------------------------------------------------------------------
// Sposta il record in stato ARCHIVIATO. Per bandi: STATO_RECORD = 'archiviato'.
// Per items: Archiviato = true. Per podcast: StatoRecord = 'archiviato'.
// ============================================================================

function archive(tipo, id) {
  // Role guard: richiede almeno lettore (livello >= 1)
  try {
    var _u = getCurrentUser_v44();
    if (!_u || _u.ruolo === 'guest' || _u.ruolo === 'anonimo' || _u.ruolo === 'ospite') {
      return { error: 'Azione riservata agli utenti registrati' };
    }
  } catch(e) {}
  try {
    var c = _wfConfig_(tipo);

    if (tipo === 'bando' || tipo === 'bandi') {
      // Riusa archiviaRecord esistente
      if (typeof archiviaRecord === 'function') {
        return archiviaRecord({ id: id });
      }
    }

    if (c.statoMode === 'boolean') {
      // Items
      return _wfSetField_(c, id, c.colArchivName || 'Archiviato', true, 'archive');
    }
    if (c.statoMode === 'text' || c.statoMode === 'mixed') {
      var fieldName = c.colStatoName || 'StatoRecord';
      return _wfSetField_(c, id, fieldName, c.valArch || 'archiviato', 'archive');
    }
    return { ok:false, error:'modalità stato non gestita' };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ============================================================================
// AZIONE 4 — restore(tipo, id)
// ----------------------------------------------------------------------------
// Ripristina un record archiviato (lo riporta ATTIVO/non-archiviato).
// ============================================================================

function restore(tipo, id) {
  // Role guard: richiede almeno lettore (livello >= 1)
  try {
    var _u = getCurrentUser_v44();
    if (!_u || _u.ruolo === 'guest' || _u.ruolo === 'anonimo' || _u.ruolo === 'ospite') {
      return { error: 'Azione riservata agli utenti registrati' };
    }
  } catch(e) {}
  try {
    var c = _wfConfig_(tipo);

    if (tipo === 'bando' || tipo === 'bandi') {
      if (typeof ripristinaRecord === 'function') {
        return ripristinaRecord({ id: id });
      }
    }

    if (c.statoMode === 'boolean') {
      return _wfSetField_(c, id, c.colArchivName || 'Archiviato', false, 'restore');
    }
    if (c.statoMode === 'text' || c.statoMode === 'mixed') {
      var fieldName = c.colStatoName || 'StatoRecord';
      return _wfSetField_(c, id, fieldName, c.valAttivo || 'attivo', 'restore');
    }
    return { ok:false, error:'modalità stato non gestita' };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ============================================================================
// AZIONE AUTOMATICA 1 — autoArchiveOld(tipo, soglia_giorni)
// ----------------------------------------------------------------------------
// Archivia automaticamente i record vecchi di N giorni che non sono SALVATI.
// Wrapper sulle funzioni esistenti (autoArchiviaNotizieVecchie / autoArchiviaScaduti).
// ============================================================================

function autoArchiveOld(tipo, sogliaGiorni) {
  try {
    var c = _wfConfig_(tipo);
    sogliaGiorni = sogliaGiorni || (typeof OC_AUTO_ARCH_NEWS_DAYS !== 'undefined' ? OC_AUTO_ARCH_NEWS_DAYS : 30);

    if (tipo === 'item' || tipo === 'news' || tipo === 'items') {
      if (typeof archiviaNotizieOlderThan === 'function') {
        return archiviaNotizieOlderThan(sogliaGiorni);
      }
      if (typeof autoArchiviaNotizieVecchie === 'function') {
        return { ok:true, archiviati: autoArchiviaNotizieVecchie() };
      }
    }
    if (tipo === 'bando' || tipo === 'bandi') {
      if (typeof autoArchiviaScaduti === 'function') {
        return { ok:true, archiviati: autoArchiviaScaduti() };
      }
    }
    return { ok:false, error:'auto-archiviazione non disponibile per tipo ' + tipo };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ============================================================================
// AZIONE AUTOMATICA 2 — autoDeleteVeryOld(tipo, soglia_mesi)
// ----------------------------------------------------------------------------
// ⚠️ DISTRUTTIVA. Elimina definitivamente i record ARCHIVIATI più vecchi di N mesi.
// Wrapper sulle funzioni esistenti (eliminaArchiviatiTutti / deleteArchivioTutto).
// In v1 il filtro per età non è applicato — tutti gli archiviati vengono cancellati.
// Nei prossimi sprint si aggiunge il filtro per data archiviazione.
// ============================================================================

function autoDeleteVeryOld(tipo, sogliaMesi) {
  try {
    var c = _wfConfig_(tipo);
    sogliaMesi = sogliaMesi || (typeof OC_AUTO_DELETE_MONTHS !== 'undefined' ? OC_AUTO_DELETE_MONTHS : 12);

    if (tipo === 'item' || tipo === 'news' || tipo === 'items') {
      if (typeof eliminaArchiviatiTutti === 'function') {
        return eliminaArchiviatiTutti();
      }
    }
    if (tipo === 'bando' || tipo === 'bandi') {
      if (typeof deleteArchivioTutto === 'function') {
        return deleteArchivioTutto();
      }
    }
    return { ok:false, error:'eliminazione non disponibile per tipo ' + tipo };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ============================================================================
// HELPER PRIVATI (non esposti via google.script.run)
// ============================================================================

/**
 * Set di un campo arbitrario su una riga identificata da ID.
 * Usato per Items/Podcast (sheet name based).
 */
function _wfSetField_(c, id, fieldName, value, actionLabel) {
  if (!c.sheetName) return { ok:false, error:'sheetName mancante in config' };
  var sh = getMainSS().getSheetByName(c.sheetName);
  if (!sh) return { ok:false, error:'sheet non trovato: ' + c.sheetName };

  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok:false, error:'sheet vuoto' };

  var headers = data[0];
  var idCol = headers.indexOf('ID');
  if (idCol < 0) idCol = 0; // fallback: prima colonna
  var fieldCol = headers.indexOf(fieldName);
  if (fieldCol < 0) return { ok:false, error:'colonna mancante: ' + fieldName };

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sh.getRange(i + 1, fieldCol + 1).setValue(value);
      return { ok:true, action:actionLabel, id:id, field:fieldName, value:value };
    }
  }
  return { ok:false, error:'ID non trovato: ' + id };
}

/**
 * Toggle di un campo booleano su una riga identificata da ID.
 */
function _wfToggleField_(c, id, fieldName, actionLabel) {
  if (!c.sheetName) return { ok:false, error:'sheetName mancante in config' };
  var sh = getMainSS().getSheetByName(c.sheetName);
  if (!sh) return { ok:false, error:'sheet non trovato: ' + c.sheetName };

  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok:false, error:'sheet vuoto' };

  var headers = data[0];
  var idCol = headers.indexOf('ID');
  if (idCol < 0) idCol = 0;
  var fieldCol = headers.indexOf(fieldName);
  if (fieldCol < 0) return { ok:false, error:'colonna mancante: ' + fieldName };

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      var current = data[i][fieldCol];
      var newVal = !current;
      sh.getRange(i + 1, fieldCol + 1).setValue(newVal);
      return { ok:true, action:actionLabel, id:id, field:fieldName, value:newVal };
    }
  }
  return { ok:false, error:'ID non trovato: ' + id };
}

// ============================================================================
// AZIONE AGGREGATA — autoArchiveAllOld(soglia_giorni)
// ----------------------------------------------------------------------------
// Esegue autoArchiveOld su tutti i tipi (bando, item, podcast) e aggrega.
// Esposta via google.script.run per pulizia massiva da pannello admin.
// ============================================================================

function autoArchiveAllOld(sogliaGiorni) {
  sogliaGiorni = sogliaGiorni || (typeof OC_AUTO_ARCH_NEWS_DAYS !== 'undefined' ? OC_AUTO_ARCH_NEWS_DAYS : 30);
  var out = { ok:true, sogliaGiorni: sogliaGiorni, results: {}, totale: 0 };
  var tipi = ['bando','item','podcast'];

  tipi.forEach(function(tipo){
    try {
      var r = autoArchiveOld(tipo, sogliaGiorni);
      var n = 0;
      if (r && typeof r === 'object') {
        if (typeof r.archiviati === 'number') n = r.archiviati;
        else if (typeof r.count === 'number') n = r.count;
        else if (typeof r.totale === 'number') n = r.totale;
      } else if (typeof r === 'number') {
        n = r;
      }
      out.results[tipo] = { ok: (r && r.ok !== false), archiviati: n, raw: r };
      out.totale += n;
    } catch(e) {
      out.results[tipo] = { ok:false, error: e.message };
    }
  });

  return out;
}

// ============================================================================
// AZIONE AGGREGATA — autoDeleteAllVeryOld(soglia_mesi)
// ----------------------------------------------------------------------------
// ⚠️ DISTRUTTIVA. Esegue autoDeleteVeryOld su tutti i tipi e aggrega.
// Esposta via google.script.run per pulizia massiva da pannello admin.
// ============================================================================

function autoDeleteAllVeryOld(sogliaMesi) {
  sogliaMesi = sogliaMesi || (typeof OC_AUTO_DELETE_MONTHS !== 'undefined' ? OC_AUTO_DELETE_MONTHS : 12);
  var out = { ok:true, sogliaMesi: sogliaMesi, results: {}, totale: 0 };
  var tipi = ['bando','item','podcast'];

  tipi.forEach(function(tipo){
    try {
      var r = autoDeleteVeryOld(tipo, sogliaMesi);
      var n = 0;
      if (r && typeof r === 'object') {
        if (typeof r.eliminati === 'number') n = r.eliminati;
        else if (typeof r.count === 'number') n = r.count;
        else if (typeof r.totale === 'number') n = r.totale;
        else if (typeof r.archiviati === 'number') n = r.archiviati;
      } else if (typeof r === 'number') {
        n = r;
      }
      out.results[tipo] = { ok: (r && r.ok !== false), eliminati: n, raw: r };
      out.totale += n;
    } catch(e) {
      out.results[tipo] = { ok:false, error: e.message };
    }
  });

  return out;
}

// ============================================================================
// getArchivedItems(tipo) — legge gli elementi archiviati per tipo
// Aggiunto: Fix 7 (2026-05-03)
// ============================================================================

function getArchivedItems(tipo) {
  try {
    var items = [];
    var ss = getMainSS();
    if (tipo === 'news' || tipo === 'item') {
      var sh = ss.getSheetByName('Items');
      if (!sh || sh.getLastRow() < 2) return { ok: true, items: [] };
      var rows = sh.getDataRange().getValues();
      var h = rows[0];
      var idCol = h.indexOf('ID'), titCol = h.indexOf('Titolo'), archCol = h.indexOf('Archiviato');
      var fonteCol = h.indexOf('Fonte'), sommCol = h.indexOf('SommarioAI'), dataCol = h.indexOf('DataPubblicazione');
      var ambitoCol = h.indexOf('Ambito'), scoreCol = h.indexOf('Score');
      for (var i = 1; i < rows.length; i++) {
        var arch = rows[i][archCol];
        if (arch === true || arch === 'true' || String(arch).toLowerCase() === 'archiviato') {
          items.push({
            id: rows[i][idCol], titolo: rows[i][titCol], fonte: rows[i][fonteCol],
            sommario: rows[i][sommCol], data: rows[i][dataCol], ambito: rows[i][ambitoCol],
            score: rows[i][scoreCol], tipo: 'news'
          });
        }
      }
    }
    if (tipo === 'bando') {
      var shb = getSheetRadar();
      if (!shb || shb.getLastRow() < 2) return { ok: true, items: [] };
      var rowsb = shb.getDataRange().getValues();
      var hb = rowsb[0];
      var statoColB = hb.indexOf('STATO_RECORD');
      if (statoColB < 0) statoColB = 17;
      for (var j = 1; j < rowsb.length; j++) {
        var stato = String(rowsb[j][statoColB] || '').toLowerCase();
        if (stato === 'archiviato') {
          items.push({
            id: rowsb[j][0], titolo: rowsb[j][0], ente: rowsb[j][1],
            settore: rowsb[j][2], scadenza: rowsb[j][4], tipo: 'bando'
          });
        }
      }
    }
    if (tipo === 'podcast') {
      var shp = ss.getSheetByName('Podcast');
      if (!shp || shp.getLastRow() < 2) return { ok: true, items: [] };
      var rowsp = shp.getDataRange().getValues();
      var hp = rowsp[0];
      var statoColP = hp.indexOf('StatoRecord');
      var titColP = hp.indexOf('Titolo'), serieColP = hp.indexOf('Serie');
      var dataColP = hp.indexOf('DataPubblicazione'), temColP = hp.indexOf('Tematica');
      var linkColP = hp.indexOf('Link');
      for (var k = 1; k < rowsp.length; k++) {
        var idVal = String(rowsp[k][0] || '');
        if (idVal.indexOf('VID') === 0) continue; // salta video
        if (statoColP >= 0 && String(rowsp[k][statoColP] || '').toLowerCase() === 'archiviato') {
          items.push({
            id: idVal, titolo: rowsp[k][titColP >= 0 ? titColP : 2],
            serie: rowsp[k][serieColP >= 0 ? serieColP : 3],
            data: rowsp[k][dataColP >= 0 ? dataColP : 1],
            tematica: rowsp[k][temColP >= 0 ? temColP : 5],
            link: rowsp[k][linkColP >= 0 ? linkColP : 8],
            tipo: 'podcast'
          });
        }
      }
    }
    if (tipo === 'video') {
      var shv = ss.getSheetByName('Podcast');
      if (!shv || shv.getLastRow() < 2) return { ok: true, items: [] };
      var rowsv = shv.getDataRange().getValues();
      var hv = rowsv[0];
      var statoColV = hv.indexOf('StatoRecord');
      var titColV = hv.indexOf('Titolo'), canaleColV = hv.indexOf('Serie');
      var dataColV = hv.indexOf('DataPubblicazione'), linkColV = hv.indexOf('Link');
      for (var v = 1; v < rowsv.length; v++) {
        var vidId = String(rowsv[v][0] || '');
        if (vidId.indexOf('VID') !== 0) continue; // solo video
        if (statoColV >= 0 && String(rowsv[v][statoColV] || '').toLowerCase() === 'archiviato') {
          items.push({
            id: vidId, titolo: rowsv[v][titColV >= 0 ? titColV : 2],
            canale: rowsv[v][canaleColV >= 0 ? canaleColV : 3],
            data: rowsv[v][dataColV >= 0 ? dataColV : 1],
            link: rowsv[v][linkColV >= 0 ? linkColV : 8],
            tipo: 'video'
          });
        }
      }
    }
    if (tipo === 'libro') {
      var shl = ss.getSheetByName('Pubblicazioni');
      if (!shl || shl.getLastRow() < 2) return { ok: true, items: [] };
      var rowsl = shl.getDataRange().getValues();
      var hl = rowsl[0];
      var idColL = hl.indexOf('ID'), titColL = hl.indexOf('Titolo');
      var autColL = hl.indexOf('Autore'), editColL = hl.indexOf('Editore');
      var annoColL = hl.indexOf('Anno'), linkColL = hl.indexOf('Link');
      var statoColL = hl.indexOf('Stato');
      for (var l = 1; l < rowsl.length; l++) {
        if (statoColL >= 0 && String(rowsl[l][statoColL] || '').toLowerCase() === 'archiviato') {
          items.push({
            id: idColL >= 0 ? rowsl[l][idColL] : String(l),
            titolo:  rowsl[l][titColL  >= 0 ? titColL  : 1],
            autore:  rowsl[l][autColL  >= 0 ? autColL  : 2],
            editore: rowsl[l][editColL >= 0 ? editColL : 3],
            anno:    rowsl[l][annoColL >= 0 ? annoColL : 4],
            link:    rowsl[l][linkColL >= 0 ? linkColL : 8],
            tipo: 'libro'
          });
        }
      }
    }
    return { ok: true, items: items };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// FINE Workflow_unified.gs
// ============================================================================
