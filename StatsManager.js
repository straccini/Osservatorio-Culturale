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

// ==================================================================
// CONTEGGI SETTIMANALI "NEW" — reset domenica sera alle 24 (= lunedi 00:00)
// ==================================================================
/**
 * Restituisce il conteggio di contenuti nuovi per ogni sezione
 * nella settimana corrente (lun 00:00 → dom 23:59).
 * Chiamata da hydrate() per popolare i badge NEW nella sidebar.
 */
/**
 * v4.27.37 — parser data robusto per i contatori: accetta Date, ISO yyyy-MM-dd
 * e dd/MM/yyyy (le celle importate da fonti diverse non sono uniformi; prima
 * una stringa dd/MM/yyyy produceva Invalid Date e il contenuto spariva dal
 * conteggio in silenzio → badge a 0).
 */
function _wkParseData_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getWeeklyNewCounts() {
  var ora = new Date();
  // Calcola inizio settimana (lunedi 00:00)
  var dow = ora.getDay(); // 0=dom, 1=lun ... 6=sab
  var diffToMon = (dow === 0) ? 6 : (dow - 1);
  var lunedi = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate() - diffToMon, 0, 0, 0, 0);
  var counts = { bandi:0, news:0, podcast:0, video:0, libri:0, norme:0, lavoro:0, capitali:0, social:0 };
  var ss = getMainSS();

  // News (Items sheet — DataAcquisizione)
  try {
    var sh = ss.getSheetByName(SH.ITEMS);
    if (sh && sh.getLastRow() > 1) {
      var rows = sh.getDataRange().getValues(), h = rows[0];
      var dI = h.indexOf('DataAcquisizione'), aI = h.indexOf('Archiviato');
      for (var i = 1; i < rows.length; i++) {
        if (!rows[i][0]) continue;
        if (aI >= 0 && (rows[i][aI] === true || String(rows[i][aI]).toUpperCase() === 'TRUE')) continue;
        var d = rows[i][dI];
        if (d && (d instanceof Date ? d : new Date(d)) >= lunedi) counts.news++;
      }
    }
  } catch(e) {}

  // Bandi — conta da Bandi_v5 (fonte primaria) + RADAR BANDI (fallback)
  // v4.27.37: header fallback via COL_B, date robuste, TipoBando='lavoro'
  // conteggiato a parte in counts.lavoro (la pagina Bandi li epura)
  try {
    var bv5Sh = ss.getSheetByName('Bandi_v5');
    if (bv5Sh && bv5Sh.getLastRow() > 1) {
      var bv5 = bv5Sh.getDataRange().getValues(), bh5 = bv5[0];
      var bdI = bh5.indexOf('DataRilevamento');
      if (bdI < 0) bdI = bh5.indexOf('Data_Rilevamento');
      if (bdI < 0 && typeof COL_B !== 'undefined') bdI = COL_B.DATA_RILEVAMENTO - 1;
      var bsI = bh5.indexOf('StatoRecord');
      if (bsI < 0 && typeof COL_B !== 'undefined') bsI = COL_B.STATO_RECORD - 1;
      var btI = bh5.indexOf('TipoBando');
      if (btI < 0 && typeof COL_B !== 'undefined') btI = COL_B.TIPO_BANDO - 1;
      for (var q = 1; q < bv5.length; q++) {
        if (!bv5[q][0]) continue;
        if (bsI >= 0 && String(bv5[q][bsI]||'').toLowerCase() === 'archiviato') continue;
        var bd = _wkParseData_(bv5[q][bdI]);
        if (!bd || bd < lunedi) continue;
        if (btI >= 0 && String(bv5[q][btI]||'').toLowerCase() === 'lavoro') counts.lavoro++;
        else counts.bandi++;
      }
    }
  } catch(e) {}
  // RADAR legacy: ADDITIVO (v4.27.39). Le due popolazioni sono disgiunte:
  // lo scanner RSS scrive su RADAR, TED/SEDIA (FAS) su Bandi_v5 — il vecchio
  // fallback "solo se v5=0" nascondeva tutti i bandi RSS della settimana
  // (verificato via ?diag=contatori: v5 aveva 1 nuovo e RADAR non veniva letto).
  try {
    var bandi = getBandiRadar();
    bandi.forEach(function(b) {
      if (b.statoRecord === 'archiviato') return;
      // i concorsi lavoro (mirror da v5) sono gia' contati in counts.lavoro
      if (/concorso pubblico/i.test(String(b.settore || ''))) return;
      var d = _wkParseData_(b.data);
      if (d && d >= lunedi) counts.bandi++;
    });
  } catch(e) {}

  // Podcast + Video (Podcast sheet — DataRilevamento)
  try {
    var podSh = ss.getSheetByName(SH.PODCAST);
    if (podSh && podSh.getLastRow() > 1) {
      var pr = podSh.getDataRange().getValues(), ph = pr[0];
      var drI = ph.indexOf('DataRilevamento'), srI = ph.indexOf('StatoRecord'), idI = 0;
      for (var j = 1; j < pr.length; j++) {
        if (!pr[j][0]) continue;
        var sr = String(pr[j][srI]||'').toLowerCase();
        if (sr === 'archiviato') continue;
        var dd = pr[j][drI];
        if (dd && (dd instanceof Date ? dd : new Date(dd)) >= lunedi) {
          if (String(pr[j][idI]).indexOf('VID') === 0) counts.video++;
          else counts.podcast++;
        }
      }
    }
  } catch(e) {}

  // Libri (Pubblicazioni — DataAggiunta)
  try {
    var libSh = ss.getSheetByName('Pubblicazioni');
    if (libSh && libSh.getLastRow() > 1) {
      var lr = libSh.getDataRange().getValues(), lh = lr[0];
      var ldI = lh.indexOf('DataAggiunta');
      for (var k = 1; k < lr.length; k++) {
        if (!lr[k][0]) continue;
        var ld = lr[k][ldI];
        if (ld && (ld instanceof Date ? ld : new Date(ld)) >= lunedi) counts.libri++;
      }
    }
  } catch(e) {}

  // Norme (Norme — DataAggiunta)
  try {
    var nSh = ss.getSheetByName('Norme');
    if (nSh && nSh.getLastRow() > 1) {
      var nr = nSh.getDataRange().getValues(), nh = nr[0];
      var ndI = nh.indexOf('DataAggiunta');
      for (var m = 1; m < nr.length; m++) {
        if (!nr[m][0]) continue;
        var nd = nr[m][ndI];
        if (nd && (nd instanceof Date ? nd : new Date(nd)) >= lunedi) counts.norme++;
      }
    }
  } catch(e) {}

  // Lavoro — v4.27.37: BUG FIX. Leggeva un foglio 'LavoroCultura' che NON esiste
  // (i concorsi vivono in Bandi_v5 con TipoBando='lavoro') → badge sempre 0.
  // Ora counts.lavoro viene calcolato nel loop Bandi_v5 sopra.

  return counts;
}

/**
 * v4.27.37 — Diagnosi contatori e sezione Lavoro (tool admin 'diagContatori').
 * Ritorna i conteggi settimanali + lo stato reale dei record lavoro in Bandi_v5,
 * per capire con dati (non ipotesi) perche' un badge o la sezione sono vuoti.
 */
function diagContatoriBadge() {
  var out = { weekly: null, lavoro: { totale: 0, attivi: 0, archiviati: 0, scaduti: 0, attiviConScadFutura: 0, ultimoRilevamento: null, esempi: [] } };
  try { out.weekly = getWeeklyNewCounts(); } catch (e) { out.weeklyErrore = e.message; }
  try {
    var ss = getMainSS();
    var sh = ss.getSheetByName('Bandi_v5');
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getDataRange().getValues();
      var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      for (var i = 1; i < v.length; i++) {
        if (!v[i][0]) continue;
        if (String(v[i][COL_B.TIPO_BANDO - 1] || '').toLowerCase() !== 'lavoro') continue;
        var L = out.lavoro; L.totale++;
        var arch = String(v[i][COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato';
        if (arch) L.archiviati++; else L.attivi++;
        var sc = _wkParseData_(v[i][COL_B.SCADENZA - 1]);
        if (sc && sc < oggi) L.scaduti++;
        if (!arch && sc && sc >= oggi) L.attiviConScadFutura++;
        var dr = _wkParseData_(v[i][COL_B.DATA_RILEVAMENTO - 1]);
        if (dr && (!L.ultimoRilevamento || dr > new Date(L.ultimoRilevamento))) L.ultimoRilevamento = dr.toISOString().slice(0, 10);
        if (L.esempi.length < 5) L.esempi.push({
          titolo: String(v[i][COL_B.TITOLO - 1] || '').substring(0, 80),
          stato: arch ? 'archiviato' : 'attivo',
          scadenza: sc ? sc.toISOString().slice(0, 10) : 'n.d.'
        });
      }
    }
  } catch (e2) { out.lavoroErrore = e2.message; }
  // v4.27.40 — flusso bandi della settimana, SENZA filtri (inclusi archiviati):
  // distingue "non arriva nulla" da "arriva ma viene archiviato/filtrato"
  try {
    var ora = new Date();
    var dow = ora.getDay();
    var lun = new Date(ora.getFullYear(), ora.getMonth(), ora.getDate() - ((dow === 0) ? 6 : (dow - 1)), 0, 0, 0, 0);
    var fb = { v5Sett: 0, v5SettArchiviati: 0, radarSett: 0, radarSettArchiviati: 0, radarUltimaData: null, v5UltimaData: null };
    var ssx = getMainSS();
    var shv = ssx.getSheetByName('Bandi_v5');
    if (shv && shv.getLastRow() > 1) {
      var vv = shv.getDataRange().getValues();
      for (var a = 1; a < vv.length; a++) {
        if (!vv[a][0]) continue;
        var dd = _wkParseData_(vv[a][COL_B.DATA_RILEVAMENTO - 1]);
        if (dd && (!fb.v5UltimaData || dd > new Date(fb.v5UltimaData))) fb.v5UltimaData = dd.toISOString().slice(0, 10);
        if (!dd || dd < lun) continue;
        fb.v5Sett++;
        if (String(vv[a][COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') fb.v5SettArchiviati++;
      }
    }
    var shr = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
    if (shr && shr.getLastRow() > 1) {
      var rv = shr.getDataRange().getValues(), rh = rv[0];
      var rdI = rh.indexOf('Data_Rilevamento'); if (rdI < 0) rdI = rh.indexOf('DataRilevamento'); if (rdI < 0) rdI = 0;
      var rsI = rh.indexOf('StatoRecord');
      for (var r = 1; r < rv.length; r++) {
        var rd = _wkParseData_(rv[r][rdI]);
        if (rd && (!fb.radarUltimaData || rd > new Date(fb.radarUltimaData))) fb.radarUltimaData = rd.toISOString().slice(0, 10);
        if (!rd || rd < lun) continue;
        fb.radarSett++;
        if (rsI >= 0 && String(rv[r][rsI] || '').toLowerCase() === 'archiviato') fb.radarSettArchiviati++;
      }
    }
    out.flussoBandi = fb;
  } catch (e3) { out.flussoErrore = e3.message; }
  return out;
}
