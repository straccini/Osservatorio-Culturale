// ============================================================================
// LegacyWorkflow.js — @deprecated workflow functions (backward-compat)
// v4.22 — Extracted from Codice.js (file-organization refactor)
//
// WILL BE REMOVED when Workflow_unified.js is refactored to fully replace
// these functions. Frontend code still calls some of these via doPost.
//
// Functions: toggleLettoBando, archiviaRecord, ripristinaRecord,
//   deleteArchiviato, deleteArchivioBulk, deleteArchivioTutto,
//   autoArchiviaNotizieVecchie, archiviaNotizieOlderThan,
//   eliminaArchiviatiTutti, autoArchiviaScaduti,
//   toggleItemField, setItemField
//
// Dependencies (global): getSheetRadar, COL, getMainSS, SH
// ============================================================================

// * v3.1 - Toggle lettura bando (col 20)
/**
 * @deprecated v4.18.40 — Usare markRead('bando', id) in Workflow_unified.js.
 *   Questa funzione lavora sul foglio RADAR BANDI legacy v4.
 */
function toggleLettoBando(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  const current=sheet.getRange(rowIndex,COL.LETTO_BANDO).getValue();
  const newVal=!current;
  sheet.getRange(rowIndex,COL.LETTO_BANDO).setValue(newVal);
  return {ok:true, value:newVal};
}

/**
 * @deprecated v4.18.40 — Usare archive('bando', id) in Workflow_unified.js.
 *   Questa funzione lavora sul foglio RADAR BANDI legacy v4 (col STATO_RECORD).
 */
function archiviaRecord(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.getRange(rowIndex,COL.STATO_RECORD).setValue('archiviato');
  return {ok:true};
}

/**
 * @deprecated v4.18.40 — Usare restore('bando', id) in Workflow_unified.js.
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function ripristinaRecord(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  sheet.getRange(rowIndex,COL.STATO_RECORD).setValue('attivo');
  return {ok:true};
}

/**
 * @deprecated v4.18.40 — Usare archive() + autoDeleteVeryOld() in Workflow_unified.js.
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function deleteArchiviato(body) {
  const sheet=getSheetRadar();
  const rowIndex=parseInt((body.id||'').replace('r',''));
  if(!rowIndex||isNaN(rowIndex)) return {error:'ID non valido'};
  const stato=sheet.getRange(rowIndex,COL.STATO_RECORD).getValue();
  if(stato!=='archiviato') return {error:'Record non archiviato'};
  sheet.deleteRow(rowIndex);
  return {ok:true};
}

/**
 * @deprecated v4.18.40 — Usare API unificata di Workflow_unified.js (archive/restore bulk).
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function deleteArchivioBulk(ids) {
  if(!ids||!ids.length) return {error:'Nessun ID'};
  const sheet=getSheetRadar();
  const rowIndices=ids.map(id=>parseInt(id.replace('r',''))).filter(n=>!isNaN(n)&&n>1);
  rowIndices.sort((a,b)=>b-a); // ordine decrescente -- critico!
  let deleted=0;
  rowIndices.forEach(rowIndex=>{
    try {
      const stato=sheet.getRange(rowIndex,COL.STATO_RECORD).getValue();
      if(stato==='archiviato') { sheet.deleteRow(rowIndex); deleted++; }
    } catch(e) { Logger.log('deleteArchivioBulk riga '+rowIndex+': '+e.message); }
  });
  return {ok:true, deleted};
}

/**
 * @deprecated v4.18.40 — Usare autoDeleteVeryOld('bando', soglia_mesi) in Workflow_unified.js.
 *   Lavora sul foglio RADAR BANDI legacy v4.
 */
function deleteArchivioTutto() {
  const sheet=getSheetRadar();
  const lastRow=sheet.getLastRow();
  if(lastRow<2) return {ok:true, deleted:0};
  const data=sheet.getRange(2,COL.STATO_RECORD,lastRow-1,1).getValues();
  const toDelete=[];
  for(let i=data.length-1;i>=0;i--) {
    if(data[i][0]==='archiviato') toDelete.push(i+2);
  }
  toDelete.forEach(row=>{ try{sheet.deleteRow(row);}catch(e){} });
  return {ok:true, deleted:toDelete.length};
}

// ==================================================================
// AUTO-ARCHIVIAZIONE NOTIZIE VECCHIE (>30 giorni)
// ==================================================================
/**
 * @deprecated v4.18.40 — Usare autoArchiveOld('news', 30) in Workflow_unified.js.
 *   Wrapper legacy mantenuto per backward-compat con trigger lunediMattina.
 */
function autoArchiviaNotizieVecchie() {
  const sh = getMainSS().getSheetByName(SH.ITEMS);
  if (!sh || sh.getLastRow() < 2) return 0;
  const rows = sh.getDataRange().getValues(), h = rows[0];
  const idI=h.indexOf('ID'), dataI=h.indexOf('DataAcquisizione'),
        archI=h.indexOf('Archiviato'), salvI=h.indexOf('Salvato'),
        digI=h.indexOf('InclusiNelDigest');
  if (idI<0||dataI<0) { Logger.log('autoArchiviaNotizieVecchie: colonne mancanti'); return 0; }
  const oggi=new Date(), soglia=30*86400000;
  let archiviati=0;
  for (let i=1;i<rows.length;i++) {
    const r=rows[i];
    if (!r[idI]) continue;
    if (r[archI]) continue;
    if (r[salvI]) continue;
    if (r[digI]) continue;
    const data=r[dataI] instanceof Date ? r[dataI] : new Date(r[dataI]);
    if (isNaN(data)) continue;
    if ((oggi-data) >= soglia) {
      sh.getRange(i+1, archI+1).setValue(true);
      archiviati++;
    }
  }
  if (archiviati>0) Logger.log('[AUTO-ARCH] Archiviate '+archiviati+' notizie >30gg');
  return archiviati;
}

/**
 * @deprecated v4.18.40 — Usare autoArchiveOld('news', giorni) in Workflow_unified.js.
 */
function archiviaNotizieOlderThan(giorni) {
  const sh = getMainSS().getSheetByName(SH.ITEMS);
  if (!sh || sh.getLastRow() < 2) return {ok:true, archiviati:0};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const archI=h.indexOf('Archiviato'), salvI=h.indexOf('Salvato'),
        digI=h.indexOf('InclusiNelDigest'), dataI=h.indexOf('DataAcquisizione'), idI=h.indexOf('ID');
  const soglia=(giorni||30)*86400000, oggi=new Date();
  let archiviati=0;
  for (let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[idI]||r[archI]||r[salvI]||r[digI]) continue;
    const d=r[dataI] instanceof Date?r[dataI]:new Date(r[dataI]);
    if(!isNaN(d)&&(oggi-d)>=soglia) { sh.getRange(i+1,archI+1).setValue(true); archiviati++; }
  }
  return {ok:true, archiviati};
}

/**
 * @deprecated v4.18.40 — Usare autoDeleteVeryOld('news', soglia_mesi) in Workflow_unified.js.
 */
function eliminaArchiviatiTutti() {
  const sh = getMainSS().getSheetByName(SH.ITEMS);
  if (!sh || sh.getLastRow() < 2) return {ok:true, eliminati:0};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const archI=h.indexOf('Archiviato'), idI=h.indexOf('ID');
  const toDelete=[];
  for (let i=rows.length-1;i>=1;i--) { if(rows[i][idI]&&rows[i][archI]) toDelete.push(i+1); }
  toDelete.forEach(r=>sh.deleteRow(r));
  return {ok:true, eliminati:toDelete.length};
}

/**
 * @deprecated v4.18.40 — Usare cleanupBandiV5Scaduti(30) in Bandi_v5.js.
 */
function autoArchiviaScaduti() {
  Logger.log('[DEPRECATO] autoArchiviaScaduti — usare cleanupBandiV5Scaduti()');
  return { ok: false, deprecato: true };
}

/**
 * @deprecated v4.18.40 — Usare markRead('item', id) o toggleSaved('item', id) in Workflow_unified.js.
 */
function toggleItemField(id,field) {
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), fieldCol=h.indexOf(field);
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id) {
      const nv=!rows[i][fieldCol]; sh.getRange(i+1,fieldCol+1).setValue(nv); return {ok:true,value:nv};
    }
  }
  return {error:'Item non trovato'};
}

/**
 * @deprecated v4.18.40 — Usare API dedicate di Workflow_unified.js.
 */
function setItemField(id,field,value) {
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), fieldCol=h.indexOf(field);
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id) { sh.getRange(i+1,fieldCol+1).setValue(value); return {ok:true}; }
  }
  return {error:'Item non trovato'};
}
