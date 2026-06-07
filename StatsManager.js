// ============================================================================
// StatsManager.js — Statistics functions
// v4.22 — Extracted from Codice.js (file-organization refactor)
//
// FIX: Merged the double-read of Items sheet in getStats() into a single pass.
// Previously, Items was read twice: once for basic counters, once for
// per-ambito counters. Now both are computed in a single loop.
//
// Functions: getStats, getGestioneStats
//
// Dependencies (global): getMainSS, SH, getBandiRadar, formatDate
// ============================================================================

function getStats() {
  let total=0, unread=0, saved=0, highScore=0, digest=0;
  // v4.22 FIX — Per-ambito counters computed in the same pass (was a separate read before)
  const perAmbito = {1:0, 2:0, 3:0, 4:0, 5:0};
  const perAmbitoUnread = {1:0, 2:0, 3:0, 4:0, 5:0};
  try {
    const sh = getMainSS().getSheetByName(SH.ITEMS);
    if (sh) {
      const rows=sh.getDataRange().getValues(), h=rows[0];
      const lettoI=h.indexOf('Letto'), salvI=h.indexOf('Salvato'),
            archI=h.indexOf('Archiviato'), scoreI=h.indexOf('Score'),
            digI=h.indexOf('InclusiNelDigest'), ambI=h.indexOf('Ambito');
      for (let i=1;i<rows.length;i++) {
        const r=rows[i]; if(!r[0]) continue;
        total++;
        if(!r[lettoI]) unread++;
        if(r[salvI])   saved++;
        if(r[scoreI]>=4) highScore++;
        if(r[digI])    digest++;
        // Per-ambito (skip archived for ambito counts)
        if (!r[archI]) {
          const amb = parseInt(r[ambI])||0;
          if (perAmbito[amb] !== undefined) {
            perAmbito[amb]++;
            if (!r[lettoI]) perAmbitoUnread[amb]++;
          }
        }
      }
    }
  } catch(e) { Logger.log('getStats Items: '+e.message); }

  let bandiAttivi=0, bandiUrgenti=0, bandiNuovi=0, bandiArchiviati=0;
  try {
    const bandi = getBandiRadar();
    const oggi = new Date();
    bandiNuovi      = bandi.filter(b=>b.status==='Nuovo'&&b.statoRecord!=='archiviato').length;
    bandiArchiviati = bandi.filter(b=>b.statoRecord==='archiviato').length;
    bandiAttivi     = bandi.filter(b=>b.statoRecord!=='archiviato').length;
    bandiUrgenti    = bandi.filter(b=>{
      if(b.statoRecord==='archiviato') return false;
      const d=b.scadenza?Math.ceil((new Date(b.scadenza)-oggi)/86400000):null;
      return d!==null&&d>=0&&d<=20;
    }).length;
  } catch(e) { Logger.log('getStats Bandi: '+e.message); }

  const oggi=new Date(), dow=oggi.getDay();
  const giorniALun=(1-dow+7)%7||7;
  const prossimo=new Date(oggi.getTime()+giorniALun*86400000);

  // Contatori podcast per tematica
  const podPerTematica = {};
  let podTotale = 0, podNuovi = 0;
  try {
    const podSh = getMainSS().getSheetByName(SH.PODCAST);
    if (podSh && podSh.getLastRow() > 1) {
      const pr = podSh.getDataRange().getValues(), ph = pr[0];
      const temI=ph.indexOf('Tematica'), ascI=ph.indexOf('Ascoltato'), srI=ph.indexOf('StatoRecord');
      const daI=ph.indexOf('DaAscoltare');
      for (let i=1;i<pr.length;i++) {
        const r=pr[i]; if(!r[0]) continue;
        const sr=String(r[srI]||'attivo').toLowerCase();
        if (sr==='archiviato') continue;
        const tem=String(r[temI]||'Altro');
        podPerTematica[tem]=(podPerTematica[tem]||0)+1;
        podTotale++;
        if (!r[ascI]) podNuovi++;
      }
    }
  } catch(e) {}

  return { total,unread,saved,highScore,digest,
           bandiAttivi,bandiUrgenti,bandiNuovi,bandiArchiviati,
           prossimoScan: formatDate(prossimo)+' - ore 06:00',
           perAmbito, perAmbitoUnread,
           podPerTematica, podTotale, podNuovi };
}

// ==================================================================
// STATISTICHE SALUTE DATABASE
// ==================================================================
function getGestioneStats() {
  const SS = getMainSS();
  const stats = {};
  const oggi = new Date();
  try {
    const sh = SS.getSheetByName(SH.ITEMS);
    if (sh) {
      const rows = sh.getDataRange().getValues(), h = rows[0];
      const archI=h.indexOf('Archiviato'), salvI=h.indexOf('Salvato'),
            digI=h.indexOf('InclusiNelDigest'), dataI=h.indexOf('DataAcquisizione');
      let totale=0, archiviati=0, salvati=0, digest=0, vecchi30=0, vecchi90=0;
      for (let i=1;i<rows.length;i++) {
        const r=rows[i]; if(!r[0]) continue; totale++;
        if(r[archI]) archiviati++;
        if(r[salvI]) salvati++;
        if(r[digI]) digest++;
        const d=r[dataI] instanceof Date?r[dataI]:new Date(r[dataI]);
        if(!isNaN(d)){
          const age=(oggi-d)/86400000;
          if(age>30&&!r[archI]&&!r[salvI]) vecchi30++;
          if(age>90) vecchi90++;
        }
      }
      stats.notizie={totale,archiviati,salvati,digest,vecchi30,vecchi90};
    }
  } catch(e) { stats.notizie={totale:0}; }
  try {
    const bandi=getBandiRadar();
    stats.bandi={totale:bandi.length,attivi:bandi.filter(b=>b.statoRecord!=='archiviato').length,archiviati:bandi.filter(b=>b.statoRecord==='archiviato').length};
  } catch(e) { stats.bandi={totale:0}; }
  try {
    const podSh=SS.getSheetByName(SH.PODCAST);
    const podTot=podSh?Math.max(0,podSh.getLastRow()-1):0;
    stats.podcast={totale:podTot};
  } catch(e) { stats.podcast={totale:0}; }
  return stats;
}
