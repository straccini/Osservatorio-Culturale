/**
 * ============================================================
 *  OSSERVATORIO CULTURALE — PATCH v4.3
 *  Endpoint nuovi:
 *    - getUltimiBandiMonitorati(n)   → Home: card Ultimi bandi
 *    - getBandiListV42(limit)        → page-bandi
 *    - getNewsListV42(limit)         → page-news
 *    - getPodcastListV42(limit)      → page-podcast
 *  Da incollare IN CODA ad Addon_v42.gs.
 * ============================================================
 */

// ------------------------------------------------------------
//  1) Ultimi bandi monitorati (card Home)
// ------------------------------------------------------------
function getUltimiBandiMonitorati(limit) {
  // FASE 4 switchover: se Bandi_v5 è attivo, usa la nuova tabella
  if (typeof isBandiV5Active === 'function' && isBandiV5Active()) {
    return (typeof getUltimiBandiV5 === 'function') ? getUltimiBandiV5(limit) : [];
  }
  try {
    var n = Number(limit) || 6;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    var sheetName = (typeof SHEET_RADAR === 'string' && SHEET_RADAR) ? SHEET_RADAR : 'RADAR BANDI';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var rows = _radarBandiRows_(sh);
    rows.sort(function(a,b){
      var da = a.dataRil instanceof Date ? a.dataRil.getTime() : 0;
      var db = b.dataRil instanceof Date ? b.dataRil.getTime() : 0;
      return db - da;
    });
    return rows.slice(0, n).map(_mapBando_);
  } catch (e) { console.error('getUltimiBandiMonitorati:', e); return []; }
}

// ------------------------------------------------------------
//  2) Elenco completo bandi (page-bandi)
// ------------------------------------------------------------
function getBandiListV42(limit) {
  // FASE 4 switchover: se Bandi_v5 è attivo, usa la nuova tabella
  if (typeof isBandiV5Active === 'function' && isBandiV5Active()) {
    return (typeof getBandiV5 === 'function') ? getBandiV5(limit) : [];
  }
  try {
    var n = Number(limit) || 500;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    var sheetName = (typeof SHEET_RADAR === 'string' && SHEET_RADAR) ? SHEET_RADAR : 'RADAR BANDI';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var rows = _radarBandiRows_(sh);
    // Ordina: urgenti (≤7gg) prima per scadenza ASC, poi non-urgenti per scadenza ASC,
    // poi senza scadenza per dataRil DESC
    rows.sort(function(a,b){
      var aUrg = a.giorni !== null && a.giorni >= 0 && a.giorni <= 7;
      var bUrg = b.giorni !== null && b.giorni >= 0 && b.giorni <= 7;
      if (aUrg && !bUrg) return -1;
      if (!aUrg && bUrg) return 1;
      var sa = a.scadenza instanceof Date ? a.scadenza.getTime() : 0;
      var sb = b.scadenza instanceof Date ? b.scadenza.getTime() : 0;
      if (sa && sb) return sa - sb;
      if (sa) return -1;
      if (sb) return 1;
      var da = a.dataRil instanceof Date ? a.dataRil.getTime() : 0;
      var db = b.dataRil instanceof Date ? b.dataRil.getTime() : 0;
      return db - da;
    });
    return rows.slice(0, n).map(_mapBando_);
  } catch (e) { console.error('getBandiListV42:', e); return []; }
}

// ------------------------------------------------------------
//  3) Elenco news (page-news) — dal foglio Items (SH.ITEMS)
// ------------------------------------------------------------
function getNewsListV42(limit) {
  try {
    var n = Number(limit) || 500;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    var sheetName = (typeof SH !== 'undefined' && SH && SH.ITEMS) ? SH.ITEMS : 'Items';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return [];
    var head = vals[0].map(function(h){ return String(h||'').trim(); });

    // Mapping nomi colonne flessibile (Items v3.x)
    var iTit   = _findCol_(head, ['Titolo','Title','title']);
    var iLink  = _findCol_(head, ['FonteURL','Link','URL','Url','url']);
    var iData  = _findCol_(head, ['DataPubblicazione','Data','Data_Rilevamento','PubDate','Pub_Date','Published']);
    var iFonte = _findCol_(head, ['Fonte','Source','Feed','Pub']);
    var iSett  = _findCol_(head, ['Settore','Tematica','Category','Categoria']);
    var iAmb   = _findCol_(head, ['Ambito','Ambito_ID','Ambito_Tematico']);
    if (iTit < 0) iTit = 1;

    var iArch  = _findCol_(head, ['Archiviato','archiviato','ARCHIVIATO']);
    var iScore = _findCol_(head, ['Score','score','SCORE','ScoreAI']);
    var iSomm  = _findCol_(head, ['Sommario','SommarioAI','Descrizione','Description','Summary','Estratto']);
    var iSalv  = _findCol_(head, ['Salvato','salvato','SALVATO','Saved']);
    var out = [];
    var sette_fa = new Date(Date.now() - 7 * 86400000);
    for (var r=1; r<vals.length; r++){
      var row = vals[r];
      if (!row[iTit]) continue;
      if (iArch >= 0 && (row[iArch] === true || row[iArch] === 'TRUE' || row[iArch] === 1)) continue;
      var rawData = iData >= 0 ? row[iData] : '';
      var dataObj = (rawData instanceof Date) ? rawData : (rawData ? new Date(rawData) : null);
      var salvVal = iSalv >= 0 ? row[iSalv] : false;
      out.push({
        id     : String(r),
        titolo : row[iTit],
        link   : iLink>=0  ? row[iLink]  : '',
        data   : rawData,
        dataObj: dataObj,
        fonte  : iFonte>=0 ? row[iFonte] : '',
        settore: iSett>=0  ? row[iSett]  : '',
        ambito : iAmb>=0   ? row[iAmb]   : '',
        score  : iScore>=0 ? Math.round(Number(row[iScore])||0) : 0,
        sommario: iSomm>=0 ? String(row[iSomm]||'') : '',
        salvato: salvVal === true || salvVal === 'TRUE' || salvVal === 1 || String(salvVal).toLowerCase() === 'true'
      });
    }
    out.sort(function(a,b){
      var da = a.dataObj ? a.dataObj.getTime() : 0;
      var db = b.dataObj ? b.dataObj.getTime() : 0;
      return db - da;
    });
    return out.slice(0, n).map(function(x){
      var isRecente = x.dataObj && x.dataObj >= sette_fa;
      return {
        id       : x.id,
        titolo   : String(x.titolo||''),
        link     : String(x.link||''),
        data     : _fmtBreveUB_(x.data),
        fonte    : String(x.fonte||''),
        settore  : String(x.settore||''),
        ambito   : String(x.ambito||''),
        score    : x.score,
        sommario : String(x.sommario||''),
        isRecente: isRecente,
        salvato  : !!x.salvato
      };
    });
  } catch (e) { console.error('getNewsListV42:', e); return []; }
}

// ------------------------------------------------------------
//  4) Elenco podcast (page-podcast) — dal foglio Podcast
// ------------------------------------------------------------
function getPodcastListV42(limit) {
  try {
    var n = Number(limit) || 300;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    var sheetName = (typeof SH !== 'undefined' && SH && SH.PODCAST) ? SH.PODCAST : 'Podcast';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return [];
    var head = vals[0].map(function(h){ return String(h||'').trim(); });

    var iTit    = _findCol_(head, ['Titolo','Title','Episodio']);
    var iShow   = _findCol_(head, ['Serie','Fonte','Podcast','Show','Podcast_Name','Nome_Podcast']);
    var iLink   = _findCol_(head, ['Link','URL','Url']);
    var iData   = _findCol_(head, ['DataPubblicazione','Data','Data_Pubblicazione','PubDate']);
    var iDurata = _findCol_(head, ['Durata','Duration']);
    var iTema   = _findCol_(head, ['Tematica','Settore','Topic','Category']);
    var iAmb    = _findCol_(head, ['Ambito','Ambito_ID','Ambito_Tematico']);
    var iStato  = _findCol_(head, ['StatoRecord','Stato_Record','stato_record','STATO_RECORD']);
    var iScore  = _findCol_(head, ['Score','score','SCORE']);
    if (iTit < 0) iTit = 1;

    var sette_fa = new Date(Date.now() - 7 * 86400000);
    var out = [];
    for (var r=1; r<vals.length; r++){
      var row = vals[r];
      if (!row[iTit]) continue;
      // filtra archiviati
      if (iStato >= 0) {
        var st = String(row[iStato]||'').toLowerCase();
        if (st === 'archiviato') continue;
      }
      var rawData = iData >= 0 ? row[iData] : '';
      out.push({
        id      : String(r),
        titolo  : row[iTit],
        show    : iShow>=0   ? row[iShow]   : '',
        link    : iLink>=0   ? row[iLink]   : '',
        data    : rawData,
        durata  : iDurata>=0 ? row[iDurata] : '',
        tematica: iTema>=0   ? row[iTema]   : '',
        ambito  : iAmb>=0    ? row[iAmb]    : '',
        score   : iScore>=0  ? Math.round(Number(row[iScore])||0) : 0
      });
    }
    out.sort(function(a,b){
      var da = a.data instanceof Date ? a.data.getTime() : 0;
      var db = b.data instanceof Date ? b.data.getTime() : 0;
      return db - da;
    });
    return out.slice(0, n).map(function(x){
      var dataObj = x.data instanceof Date ? x.data : (x.data ? new Date(x.data) : null);
      return {
        id       : x.id,
        titolo   : String(x.titolo||''),
        show     : String(x.show||''),
        link     : String(x.link||''),
        data     : _fmtBreveUB_(x.data),
        durata   : String(x.durata||''),
        tematica : String(x.tematica||''),
        ambito   : String(x.ambito||''),
        score    : x.score,
        isRecente: !!(dataObj && !isNaN(dataObj.getTime()) && dataObj >= sette_fa)
      };
    });
  } catch (e) { console.error('getPodcastListV42:', e); return []; }
}

// ------------------------------------------------------------
//  5) Elenco libri/pubblicazioni (page-libri) — dal foglio Pubblicazioni
// ------------------------------------------------------------
function getLibriListV42(limit) {
  try {
    var n = Number(limit) || 500;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    var sheetName = (typeof SH !== 'undefined' && SH && SH.LIBRI) ? SH.LIBRI : 'Pubblicazioni';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return [];
    var head = vals[0].map(function(h){ return String(h||'').trim(); });

    var iTit  = _findCol_(head, ['Titolo','Title']);
    var iAut  = _findCol_(head, ['Autore','Author','Autori']);
    var iEdit = _findCol_(head, ['Editore','Editrice','Publisher']);
    var iAnno = _findCol_(head, ['Anno','Year','AnnoPublicazione']);
    var iAmb  = _findCol_(head, ['Ambito','Ambito_ID']);
    var iTema = _findCol_(head, ['Tematica','Settore','Topic']);
    var iDesc = _findCol_(head, ['Descrizione','Description','Sommario','Abstract']);
    var iLink = _findCol_(head, ['Link','URL','Url']);
    var iCop  = _findCol_(head, ['Copertina_URL','Cover','Copertina']);
    var iData = _findCol_(head, ['DataAggiunta','DataAcquisizione','Data']);
    var iFon  = _findCol_(head, ['Fonte','Source']);
    var iStat = _findCol_(head, ['Stato','StatoRecord','stato']);
    var iScor = _findCol_(head, ['Score','score','SCORE']);
    var iSalv = _findCol_(head, ['Salvato','salvato','SALVATO','Saved']);
    if (iTit < 0) iTit = 1;

    var trenta_fa = new Date(Date.now() - 30 * 86400000);
    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[iTit]) continue;
      if (iStat >= 0) {
        var st = String(row[iStat]||'').toLowerCase();
        if (st === 'archiviato') continue;
      }
      var rawData = iData >= 0 ? row[iData] : '';
      var dataObj = (rawData instanceof Date) ? rawData : (rawData ? new Date(rawData) : null);
      var salvLibro = iSalv >= 0 ? row[iSalv] : false;
      out.push({
        id         : String(r),
        titolo     : row[iTit],
        autore     : iAut>=0  ? row[iAut]  : '',
        editore    : iEdit>=0 ? row[iEdit] : '',
        anno       : iAnno>=0 ? row[iAnno] : '',
        ambito     : iAmb>=0  ? row[iAmb]  : '',
        tematica   : iTema>=0 ? row[iTema] : '',
        descrizione: iDesc>=0 ? String(row[iDesc]||'') : '',
        link       : iLink>=0 ? row[iLink] : '',
        copertina  : iCop>=0  ? row[iCop]  : '',
        fonte      : iFon>=0  ? row[iFon]  : '',
        score      : iScor>=0 ? Math.round(Number(row[iScor])||0) : 0,
        dataObj    : dataObj,
        salvato    : salvLibro === true || salvLibro === 'TRUE' || salvLibro === 1 || String(salvLibro).toLowerCase() === 'true'
      });
    }
    out.sort(function(a,b){
      var da = a.dataObj ? a.dataObj.getTime() : 0;
      var db = b.dataObj ? b.dataObj.getTime() : 0;
      return db - da;
    });
    return out.slice(0, n).map(function(x){
      return {
        id         : x.id,
        titolo     : String(x.titolo||''),
        autore     : String(x.autore||''),
        editore    : String(x.editore||''),
        anno       : String(x.anno||''),
        ambito     : String(x.ambito||''),
        tematica   : String(x.tematica||''),
        descrizione: String(x.descrizione||''),
        link       : String(x.link||''),
        copertina  : String(x.copertina||''),
        fonte      : String(x.fonte||''),
        score      : x.score,
        dataAggiunta: _fmtBreveUB_(x.dataObj),
        isRecente  : !!(x.dataObj && !isNaN(x.dataObj.getTime()) && x.dataObj >= trenta_fa),
        salvato    : !!x.salvato
      };
    });
  } catch(e) { console.error('getLibriListV42:', e); return []; }
}

// ------------------------------------------------------------
//  6) Elenco video YouTube (page-video) — dal foglio Podcast, ID=VID*
// ------------------------------------------------------------
function getVideoListV42(limit) {
  try {
    var n = Number(limit) || 300;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    var sheetName = (typeof SH !== 'undefined' && SH && SH.PODCAST) ? SH.PODCAST : 'Podcast';
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return [];
    var head = vals[0].map(function(h){ return String(h||'').trim(); });

    var iTit   = _findCol_(head, ['Titolo','Title']);
    var iCanale= _findCol_(head, ['Serie','Fonte','Podcast','Show']);
    var iLink  = _findCol_(head, ['Link','URL','Url']);
    var iData  = _findCol_(head, ['DataPubblicazione','Data','Data_Pubblicazione','PubDate']);
    var iTema  = _findCol_(head, ['Tematica','Settore','Topic','Category']);
    var iAmb   = _findCol_(head, ['Ambito','Ambito_ID','Ambito_Tematico']);
    var iStato = _findCol_(head, ['StatoRecord','Stato_Record','stato_record','STATO_RECORD']);
    var iScore = _findCol_(head, ['Score','score','SCORE']);
    if (iTit < 0) iTit = 2;

    var sette_fa = new Date(Date.now() - 7 * 86400000);
    var out = [];
    for (var r=1; r<vals.length; r++){
      var row = vals[r];
      if (!row[iTit]) continue;
      // solo video (ID inizia con VID)
      if (String(row[0]).indexOf('VID') !== 0) continue;
      // filtra archiviati
      if (iStato >= 0) {
        var st = String(row[iStato]||'').toLowerCase();
        if (st === 'archiviato') continue;
      }
      var rawData = iData >= 0 ? row[iData] : '';
      out.push({
        id     : String(r),
        titolo : row[iTit],
        canale : iCanale>=0 ? row[iCanale] : '',
        link   : iLink>=0   ? row[iLink]   : '',
        data   : rawData,
        tematica: iTema>=0  ? row[iTema]   : '',
        ambito : iAmb>=0    ? row[iAmb]    : '',
        score  : iScore>=0  ? Math.round(Number(row[iScore])||0) : 0
      });
    }
    out.sort(function(a,b){
      var da = a.data instanceof Date ? a.data.getTime() : 0;
      var db = b.data instanceof Date ? b.data.getTime() : 0;
      return db - da;
    });
    return out.slice(0, n).map(function(x){
      var dataObj = x.data instanceof Date ? x.data : (x.data ? new Date(x.data) : null);
      return {
        id      : x.id,
        titolo  : String(x.titolo||''),
        canale  : String(x.canale||''),
        link    : String(x.link||''),
        data    : _fmtBreveUB_(x.data),
        tematica: String(x.tematica||''),
        ambito  : String(x.ambito||''),
        score   : x.score,
        isRecente: !!(dataObj && !isNaN(dataObj.getTime()) && dataObj >= sette_fa)
      };
    });
  } catch (e) { console.error('getVideoListV42:', e); return []; }
}

// ============================================================
//  HELPER PRIVATI (nomi con _ finale → non in dropdown esecuzioni)
// ============================================================

function _radarBandiRows_(sh) {
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var head = vals[0].map(function(h){ return String(h||'').trim(); });
  var iData   = head.indexOf('Data_Rilevamento');
  var iTitolo = head.indexOf('Titolo');
  var iEnte   = head.indexOf('Ente');
  var iSett   = head.indexOf('Settore');
  var iAmb    = head.indexOf('Ambito');
  var iScad   = head.indexOf('Scadenza');
  var iLink   = head.indexOf('Link');
  var iStato  = head.indexOf('StatoRecord');
  if (iTitolo < 0) iTitolo = 1;
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var out = [];
  for (var r=1; r<vals.length; r++) {
    var row = vals[r];
    if (!row[iTitolo]) continue;
    // filtra archiviati
    if (iStato >= 0) {
      var st = String(row[iStato]||'').toLowerCase();
      if (st === 'archiviato') continue;
    }
    var rawScad = iScad >= 0 ? row[iScad] : '';
    var scadDate = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
    var giorni = (scadDate && !isNaN(scadDate.getTime()))
      ? Math.round((scadDate.getTime() - oggi.getTime()) / 86400000) : null;
    out.push({
      idx     : r,
      dataRil : iData  >= 0 ? row[iData]  : '',
      titolo  : row[iTitolo],
      ente    : iEnte  >= 0 ? row[iEnte]  : '',
      settore : iSett  >= 0 ? row[iSett]  : '',
      ambito  : iAmb   >= 0 ? row[iAmb]   : '',
      scadenza: rawScad,
      giorni  : giorni,
      link    : iLink  >= 0 ? row[iLink]  : ''
    });
  }
  return out;
}

function _mapBando_(x) {
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var scadFmt = '';
  if (x.scadenza instanceof Date && !isNaN(x.scadenza.getTime())) {
    scadFmt = Utilities.formatDate(x.scadenza, tz, 'd MMM yyyy');
  } else if (x.scadenza) {
    scadFmt = _fmtBreveUB_(x.scadenza);
  }
  var isUrgent = x.giorni !== null && x.giorni !== undefined && x.giorni >= 0 && x.giorni <= 7;
  return {
    id      : String(x.idx),
    titolo  : String(x.titolo  || ''),
    ente    : String(x.ente    || ''),
    settore : String(x.settore || ''),
    ambito  : String(x.ambito  || ''),
    scadenza: scadFmt,
    giorni  : x.giorni,
    isUrgent: isUrgent,
    dataRil : _fmtBreveUB_(x.dataRil),
    link    : String(x.link || '')
  };
}

function _findCol_(head, names) {
  for (var i=0; i<names.length; i++){
    var ix = head.indexOf(names[i]);
    if (ix >= 0) return ix;
  }
  return -1;
}

function _fmtBreveUB_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return v ? String(v) : '';
}