/**
 * ============================================================
 * OSSERVATORIO CULTURALE — ADDON_v42.gs
 * ------------------------------------------------------------
 * Estensione al Code.gs esistente per il redesign v4.2.
 * NON sostituisce nulla: aggiunge solo funzioni e chiavi di
 * dispatch alla doPost gia' presente.
 *
 * IMPORTANTE — disallineamenti individuati nel codice esistente:
 *   1) Gli ambiti sono 5 (non 6). Mappe reali:
 *        AMBITO_LABEL = {1:'Tendenze museali', 2:'Accessibilita / Gaming',
 *                        3:'Mostre / Exhibition', 4:'Progetti comunita',
 *                        5:'AI per la Cultura'};
 *        AMBITO_COLOR = {1:'#534AB7', 2:'#0F6E56', 3:'#185FA5',
 *                        4:'#854F0B', 5:'#0E7490'};
 *   2) Radar Bandi viene letto usando la colonna "Ambito"
 *      (int 1-5) aggiunta al foglio. I record senza valore
 *      vengono esclusi dai conteggi per ambito (ma restano
 *      visibili nella vista Bandi).
 *   3) Items usa campo 'Ambito' (int 1-5), non 'ambitoId'.
 *   4) Podcast usa 'Tematica' (stringa libera), non int.
 *
 * Integrazione nella doPost esistente (vedi fondo file per i
 * case switch da copiare).
 * ============================================================
 */

// ---------- 1. getPodcastRecenti (wrapper richiesto dal redesign v4.2) ----------
/**
 * Restituisce gli N podcast piu' recenti in formato normalizzato
 * per l'interfaccia v4.2 (card laterale Home + lista Ambito).
 *
 * @param {number} limit - max elementi (default 10)
 * @return {Array<{id, titolo, fonte, durata, pubData, tematica, ambitoId, link}>}
 */
function getPodcastRecenti(limit) {
  limit = limit || 10;
  try {
    // Usa la funzione esistente getPodcasts per coerenza.
    var raw = (typeof getPodcasts === 'function')
      ? getPodcasts({ stato:'tutti', limit: limit })
      : [];
    if (!Array.isArray(raw)) raw = (raw && raw.items) || [];
    return raw.slice(0, limit).map(function(p){
      return {
        id:       p.id || p.ID || p.uid || '',
        titolo:   p.titolo || p.Titolo || p.title || '',
        fonte:    p.fonte || p.Fonte || p.source || '',
        durata:   p.durata || p.Durata || p.duration || '',
        pubData:  p.pubData || p.data || p.Data || '',
        tematica: p.tematica || p.Tematica || '',
        ambitoId: tematicaToAmbitoId_(p.tematica || p.Tematica || ''),
        link:     p.link || p.url || p.Link || ''
      };
    });
  } catch(err) {
    Logger.log('getPodcastRecenti error: ' + err);
    return [];
  }
}

// ---------- 2. getHomepageDataV42 (aggregatore dati Home redesign) ----------
/**
 * Aggrega tutti i dati necessari alla Home v4.2 in un'unica
 * chiamata. Richiamato da Navigation.html all'avvio via
 * google.script.run.getHomepageDataV42() (o via doPost
 * dispatcher: action='getHomepageDataV42').
 *
 * @return {Object} payload home (vedi contratto sotto)
 */
function getHomepageDataV42() {
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';

  // --- News ---
  var news = [];
  try {
    var itemsRes = (typeof getItems === 'function') ? getItems({ limit: 200 }) : [];
    news = Array.isArray(itemsRes) ? itemsRes : (itemsRes && itemsRes.items) || [];
  } catch(e) { news = []; }

  // --- Bandi ---
  var bandi = [];
  try {
    bandi = (typeof getBandiRadar === 'function') ? (getBandiRadar() || []) : [];
  } catch(e) { bandi = []; }

  // --- Podcast ---
  var pods = [];
  try { pods = getPodcastRecenti(10); } catch(e) { pods = []; }

  // --- Conteggi per ambito ---
  var countNewsByAmbito = {1:0, 2:0, 3:0, 4:0, 5:0};
  for (var i=0;i<news.length;i++){
    var a = Number(news[i].Ambito || news[i].ambito || news[i].ambitoId);
    if (countNewsByAmbito.hasOwnProperty(a)) countNewsByAmbito[a]++;
  }

  var countBandiByAmbito = {1:0, 2:0, 3:0, 4:0, 5:0};
  for (var k=0; k<bandi.length; k++){
    var ab = Number(bandi[k].Ambito || bandi[k].ambito || bandi[k].ambitoId);
    if (countBandiByAmbito.hasOwnProperty(ab)) countBandiByAmbito[ab]++;
  }

  var countPodByAmbito = {1:0, 2:0, 3:0, 4:0, 5:0};
  for (var j=0;j<pods.length;j++){
    var ap = pods[j].ambitoId;
    if (ap && countPodByAmbito.hasOwnProperty(ap)) countPodByAmbito[ap]++;
  }

  // --- Bandi urgenti (<=7 giorni) ---
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var urgenti = [];
  for (var b=0; b<bandi.length; b++){
    var ba = bandi[b];
    var scad = ba.scadenza || ba.Scadenza;
    if (!scad) continue;
    var dtScad = (scad instanceof Date) ? scad : new Date(scad);
    if (isNaN(dtScad.getTime())) continue;
    var gg = Math.round((dtScad.getTime() - oggi.getTime()) / 86400000);
    if (gg >= 0 && gg <= 30) {  // calcola per tutti entro 30gg, filtro dopo
      urgenti.push({
        id:       ba.id || ba.ID || '',
        titolo:   ba.titolo || ba.Titolo || '',
        ente:     ba.ente || ba.Ente || '',
        settore:  ba.settore || ba.Settore || '',
        livello:  ba.livello || ba.Livello || '',
        regione:  ba.regione || ba.Regione || '',
        importo:  ba.importo || ba.Importo || '',
        ambitoId: Number(ba.Ambito || ba.ambito || ba.ambitoId) || null,
        ambitoLbl: ambitoLblV42_(Number(ba.Ambito || ba.ambito || ba.ambitoId)),
        ambitoColor: ambitoColorV42_(Number(ba.Ambito || ba.ambito || ba.ambitoId)),
        scadenza: Utilities.formatDate(dtScad, tz, "d MMM"),
        giorni:   gg,
        priorita: gg<=3 ? 'urgent' : (gg<=7 ? 'urgent' : (gg<=14 ? 'med' : 'low'))
      });
    }
  }
  urgenti.sort(function(a,b){ return a.giorni - b.giorni; });
  var urgentiHome = urgenti.filter(function(u){ return u.giorni <= 7; }).slice(0,4);

  // --- Ambiti per Home (5) — Sprint 1.3 (2026-05-01) rinominati per allineamento Matrix ---
  var AMB = [
    { id:1, num:'01', nome:'Identita e narrazione museale',  desc:'Identita del museo, posizionamento strategico, marca istituzionale e narrazione contemporanea.',                                  colorCls:'a1' },
    { id:2, num:'02', nome:'Inclusione e accessibilita',     desc:'Accessibilita ampliata: fisica, cognitiva, sensoriale, linguistica. Pubblici fragili e diritto culturale.',                       colorCls:'a2' },
    { id:3, num:'03', nome:'Programma, mostre e collezioni', desc:'Programma educativo, mostre, gestione collezioni, allestimenti permanenti e servizi al visitatore. I fondamentali del mestiere.', colorCls:'a3' },
    { id:4, num:'04', nome:'Comunita e welfare culturale',   desc:'Audience engagement, comunita locali, partecipazione, welfare culturale e impatto sociale.',                                       colorCls:'a4' },
    { id:5, num:'05', nome:'Digital, AI e governance',       desc:'Maturita digitale, AI applicata al patrimonio, dati, governance, partnership istituzionali, fundraising.',                         colorCls:'a5' }
  ];
  var ambitiHome = AMB.map(function(a){
    return {
      id:a.id, num:a.num, nome:a.nome, desc:a.desc, colorCls:a.colorCls,
      news:    countNewsByAmbito[a.id] || 0,
      bandi:   countBandiByAmbito[a.id] || 0,
      podcast: countPodByAmbito[a.id] || 0,
      nuoviOggi: countNuoviOggiV42_(news, a.id)
    };
  });

  // --- Top news (per score AI, fallback data) ---
  var newsSorted = news.slice(0).sort(function(a,b){
    var sa = Number(a.Score||a.score||0), sb = Number(b.Score||b.score||0);
    if (sb !== sa) return sb - sa;
    var da = new Date(a.Data||a.data||0).getTime();
    var db = new Date(b.Data||b.data||0).getTime();
    return db - da;
  });
  var newsHome = newsSorted.slice(0, 5).map(function(n, idx){
    var ambId = Number(n.Ambito || n.ambito || 0);
    return {
      id:          n.id || n.ID || '',
      n:           idx+1,
      titolo:      n.titolo || n.Titolo || '',
      fonte:       n.fonte || n.Fonte || '',
      data:        formatDataBreveV42_(n.Data || n.data),
      lettura:     n.lettura || n.Lettura || 3,
      ambitoColor: ambitoColorV42_(ambId),
      ambitoLbl:   ambitoLblV42_(ambId),
      score:       Math.round(Number(n.Score||n.score||0)),
      link:        n.link || n.Link || ''
    };
  });

  // --- Top podcast (3) ---
  var podHome = pods.slice(0,3).map(function(p){
    return { id:p.id, titolo:p.titolo, fonte:p.fonte, durata:p.durata };
  });

  // --- Scanner stats ---
  var scanner = { fonti:0, articoliMese:0, bandiAttivi:0, accuratezza:0 };
  try {
    // Fonti attive: RSS dal foglio Fonti + sorgenti bandi statiche
    var fontiFoglio = 0;
    try {
      var shFonti = getMainSS().getSheetByName('Fonti');
      if (shFonti && shFonti.getLastRow() > 1) {
        var fVals = shFonti.getRange(2, 1, shFonti.getLastRow()-1, shFonti.getLastColumn()).getValues();
        var fHead = shFonti.getRange(1,1,1,shFonti.getLastColumn()).getValues()[0];
        var iAtt = fHead.indexOf('Attiva');
        fontiFoglio = fVals.filter(function(r){ return iAtt<0 || r[iAtt]===true || r[iAtt]==='TRUE'; }).length;
      }
    } catch(eF){}
    var fontiBandi = (typeof TUTTE_LE_FONTI_BANDI !== 'undefined') ? TUTTE_LE_FONTI_BANDI.length : 0;
    scanner.fonti = fontiFoglio + fontiBandi;

    if (typeof getStats === 'function') {
      var s = getStats() || {};
      // Articoli ultimi 30 giorni
      var cutoff30 = new Date(Date.now() - 30*86400000);
      scanner.articoliMese = news.filter(function(n){
        var d = n.Data || n.data;
        var dt = (d instanceof Date) ? d : (d ? new Date(d) : null);
        return dt && dt >= cutoff30;
      }).length;
      scanner.bandiAttivi = s.bandiAttivi || bandi.length;
      // Accuratezza: % articoli con score >= 60 (su quelli con score > 0)
      var conScore = news.filter(function(n){ return Number(n.Score||n.score||0) > 0; });
      var highScore = conScore.filter(function(n){ return Number(n.Score||n.score||0) >= 60; });
      scanner.accuratezza = conScore.length > 0 ? Math.round(highScore.length / conScore.length * 100) : 0;
    } else {
      scanner.articoliMese = news.length;
      scanner.bandiAttivi  = bandi.length;
    }
  } catch(e) {
    scanner.articoliMese = news.length;
    scanner.bandiAttivi  = bandi.length;
  }

  // --- Badges sidebar (ambito = somma news+bandi+podcast) ---
  var ambBadge = {1:0, 2:0, 3:0, 4:0, 5:0};
  for (var aId=1; aId<=5; aId++){
    ambBadge[aId] = (countNewsByAmbito[aId] || 0)
                  + (countBandiByAmbito[aId] || 0)
                  + (countPodByAmbito[aId]   || 0);
  }
  var badges = {
    bandi:        bandi.length,
    bandiUrgenti: urgenti.filter(function(u){ return u.giorni<=7; }).length,
    news:         news.length,
    podcast:      pods.length,
    ambiti:       ambBadge
  };

  // --- INT-1 (Sprint 1.1): info aggiornamento per pillola sotto hero ---
  // Riusa getUltimaScansione() definita in Codice.js (data più recente colonna DATA_RILEVAMENTO RADAR BANDI).
  var ultimaScansione = null;
  try {
    if (typeof getUltimaScansione === 'function') {
      ultimaScansione = getUltimaScansione(); // formato 'dd/MM/yyyy HH:mm' oppure null
    }
  } catch(e) { ultimaScansione = null; }

  // Conteggio "nuovi oggi" su tutti i tipi (somma news + bandi + podcast con data di oggi).
  var startGiorno = new Date(); startGiorno.setHours(0,0,0,0);
  function _isOggi_(raw) {
    if (!raw) return false;
    var d = (raw instanceof Date) ? raw : new Date(raw);
    return !isNaN(d.getTime()) && d >= startGiorno;
  }
  var nuoviOggi = {
    news:    news.filter(function(n){ return _isOggi_(n.Data || n.data); }).length,
    bandi:   bandi.filter(function(b){ return _isOggi_(b.dataRilevamento || b.data || b.Data); }).length,
    podcast: pods.filter(function(p){ return _isOggi_(p.pubData || p.data); }).length
  };
  nuoviOggi.totale = nuoviOggi.news + nuoviOggi.bandi + nuoviOggi.podcast;
  // --- fine INT-1 ---

  return {
    dataOggi:        Utilities.formatDate(new Date(), tz, "d MMMM yyyy"),
    ultimaScansione: ultimaScansione,    // INT-1
    nuoviOggi:       nuoviOggi,          // INT-1
    bandiUrgenti:    urgentiHome,
    ambiti:          ambitiHome,
    news:            newsHome,
    podcast:         podHome,
    scanner:         scanner,
    badges:          badges
  };
}

// ---------- 3. getAmbitoDataV42 (dettaglio singolo ambito) ----------
/**
 * Restituisce news + bandi + podcast filtrati per un ambito.
 * Richiamato da OC.go('ambito', id) in Navigation.html.
 *
 * @param {number|string} ambitoId - 1..5
 * @return {Object} {ambitoId, news, bandi, podcast}
 */
function getAmbitoDataV42(ambitoId) {
  var id = Number(ambitoId);
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';

  // === NEWS ===
  // FIX Sprint 1.2 (v4.7.2): mapping con fallback robusto su tutte le possibili varianti
  // di nome chiave (PascalCase / UPPERCASE / lowercase / inglese), perché in passato il
  // foglio Items potrebbe avere intestazioni di colonne con capitalizzazione mista.
  // _pick_(x, [...candidati]) ritorna il primo valore non-vuoto trovato.
  var news = [];
  try {
    var n = (typeof getItems === 'function') ? getItems({ limit: 500 }) : [];
    n = Array.isArray(n) ? n : (n && n.items) || [];
    var nFiltered = n.filter(function(x){
      var ambVal = _pickV42_(x, ['Ambito','AMBITO','ambito','Ambito_ID','AmbitoID']);
      return Number(ambVal) === id;
    });
    news = nFiltered.map(function(x){
      var ambId = Number(_pickV42_(x, ['Ambito','AMBITO','ambito','Ambito_ID','AmbitoID']) || 0);
      return {
        id:       _pickV42_(x, ['ID','Id','id']) || '',
        titolo:   _pickV42_(x, ['Titolo','TITOLO','titolo','Title','TITLE','title']) || '',
        fonte:    _pickV42_(x, ['Fonte','FONTE','fonte','Source','SOURCE','source']) || '',
        link:     _pickV42_(x, ['FonteURL','URL','Url','url','Link','LINK','link','FONTE_URL']) || '',
        data:     formatDataBreveV42_(_pickV42_(x, ['DataPubblicazione','DATA_PUBBLICAZIONE','PubDate','PUB_DATE','Data','DATA','data','DataAcquisizione','DATA_ACQUISIZIONE'])),
        ambito:   ambId,
        ambitoLbl: ambitoLblV42_(ambId),
        ambitoColor: ambitoColorV42_(ambId),
        score:    Math.round(Number(_pickV42_(x, ['Score','SCORE','score','ScoreAI','SCORE_AI']) || 0)),
        sommario: _pickV42_(x, ['SommarioEditato','SOMMARIO_EDITATO','SommarioAI','SOMMARIO_AI','Sommario','SOMMARIO','sommario','Estratto','ESTRATTO']) || '',
        tagAI:    _pickV42_(x, ['TagAI','TAG_AI','Tag','TAG','tag']) || ''
      };
    });
  } catch(e) { news = []; }

  // === BANDI ===
  // FIX Sprint 1.2 (v4.7.2): mapping con _pickV42_ robusto. getBandiRadar() ora include
  // la chiave 'ambito' (vedi modifica Codice.gs). Esclude i bandi archiviati.
  var bandi = [];
  try {
    var bAll = (typeof getBandiRadar === 'function') ? (getBandiRadar() || []) : [];
    var bFiltered = bAll.filter(function(b){
      var stato = _pickV42_(b, ['statoRecord','StatoRecord','STATO_RECORD','stato_record']);
      if (String(stato || '').toLowerCase() === 'archiviato') return false;
      var ambVal = _pickV42_(b, ['ambito','Ambito','AMBITO','ambitoId','AmbitoId']);
      return Number(ambVal) === id;
    });
    bandi = bFiltered.map(function(b){
      var ambId = Number(_pickV42_(b, ['ambito','Ambito','AMBITO','ambitoId','AmbitoId']) || 0);
      // Calcolo giorni alla scadenza per priorità urgenza
      var rawScad = _pickV42_(b, ['scadenza','Scadenza','SCADENZA']);
      var giorni = null, scadFmt = rawScad || '';
      if (rawScad) {
        try {
          var dtScad = (rawScad instanceof Date) ? rawScad : new Date(rawScad);
          if (!isNaN(dtScad.getTime())) {
            var oggi = new Date(); oggi.setHours(0,0,0,0);
            giorni = Math.round((dtScad.getTime() - oggi.getTime()) / 86400000);
            scadFmt = Utilities.formatDate(dtScad, tz, "d MMM");
          }
        } catch(eS) {}
      }
      return {
        id:        _pickV42_(b, ['id','ID','Id']) || '',
        titolo:    _pickV42_(b, ['titolo','Titolo','TITOLO','title','Title','TITLE']) || '',
        ente:      _pickV42_(b, ['ente','Ente','ENTE']) || '',
        settore:   _pickV42_(b, ['settore','Settore','SETTORE']) || '',
        livello:   _pickV42_(b, ['livello','Livello','LIVELLO']) || '',
        regione:   _pickV42_(b, ['regione','Regione','REGIONE']) || '',
        importo:   _pickV42_(b, ['importo','Importo','IMPORTO']) || '',
        scadenza:  scadFmt,
        giorni:    giorni,
        link:      _pickV42_(b, ['link','Link','LINK','url','URL','urlEnte','URL_ENTE','UrlEnte']) || '',
        fonte:     _pickV42_(b, ['fonte','Fonte','FONTE']) || '',
        ambito:    ambId,
        ambitoLbl: ambitoLblV42_(ambId),
        ambitoColor: ambitoColorV42_(ambId),
        dataRil:   _pickV42_(b, ['data','Data','DATA','dataRilevamento','DataRilevamento','DATA_RILEVAMENTO']) || '',
        priorita:  _pickV42_(b, ['priorita','Priorita','PRIORITA']) || ''
      };
    });
  } catch(e) { bandi = []; }

  // === PODCAST ===
  // Mapping esplicito con _pickV42_ per coerenza con il rendering _podcastCardHtml_ in Index.html
  var pods = [];
  try {
    pods = getPodcastRecenti(50)
      .filter(function(p){
        var ambP = _pickV42_(p, ['ambitoId','AmbitoId','ambito','Ambito','AMBITO']);
        return Number(ambP) === id;
      })
      .map(function(p){
        var ambId = Number(_pickV42_(p, ['ambitoId','AmbitoId','ambito','Ambito','AMBITO']) || 0);
        return {
          id:       _pickV42_(p, ['id','ID','Id']) || '',
          titolo:   _pickV42_(p, ['titolo','Titolo','TITOLO','title','Title']) || '',
          fonte:    _pickV42_(p, ['fonte','Fonte','FONTE','source','Source']) || '',
          show:     _pickV42_(p, ['show','Show','fonte','Fonte','PodcastName']) || '',
          durata:   _pickV42_(p, ['durata','Durata','DURATA','duration','Duration']) || '',
          link:     _pickV42_(p, ['link','Link','LINK','url','URL','Url']) || '',
          data:     _pickV42_(p, ['pubData','PubData','data','Data','DATA']) || '',
          ambito:   ambId,
          ambitoLbl: ambitoLblV42_(ambId),
          ambitoColor: ambitoColorV42_(ambId),
          tematica: _pickV42_(p, ['tematica','Tematica','TEMATICA','topic','Topic','category','Category']) || ''
        };
      });
  } catch(e) { pods = []; }

  return {
    ambitoId: id,
    ambitoLbl: ambitoLblV42_(id),
    ambitoColor: ambitoColorV42_(id),
    news: news,
    bandi: bandi,
    podcast: pods
  };
}

// ---------- 4. getGlobalSearchV42 (ricerca globale unificata) ----------
/**
 * Cerca una query su titolo/ente/sommario di news e bandi.
 * Richiamato da OC.search(query).
 *
 * @param {string} q - query utente (case-insensitive)
 * @return {Object} {q, news, bandi, podcast}
 */
function getGlobalSearchV42(q) {
  q = (q || '').toString().toLowerCase().trim();
  if (!q) return { q:'', news:[], bandi:[], podcast:[], video:[], libri:[] };

  var nOut = [], bOut = [], pOut = [], vOut = [], lOut = [];

  // News
  try {
    var n = (typeof getItems === 'function') ? getItems({ limit: 500 }) : [];
    n = Array.isArray(n) ? n : (n && n.items) || [];
    for (var i=0;i<n.length && nOut.length<20;i++){
      var t = (n[i].titolo || n[i].Titolo || '').toString().toLowerCase();
      var s = (n[i].SommarioAI || n[i].sommario || n[i].Sommario || '').toString().toLowerCase();
      if (t.indexOf(q) !== -1 || s.indexOf(q) !== -1) nOut.push(n[i]);
    }
  } catch(e) {}

  // Bandi
  try {
    var b = (typeof getBandiRadar === 'function') ? (getBandiRadar() || []) : [];
    for (var j=0;j<b.length && bOut.length<20;j++){
      var tb = (b[j].titolo || b[j].Titolo || '').toString().toLowerCase();
      var eb = (b[j].ente || b[j].Ente || '').toString().toLowerCase();
      if (tb.indexOf(q) !== -1 || eb.indexOf(q) !== -1) bOut.push(b[j]);
    }
  } catch(e) {}

  // Podcast
  try {
    var p = getPodcastRecenti(50);
    for (var k=0;k<p.length && pOut.length<10;k++){
      var tp = (p[k].titolo || '').toString().toLowerCase();
      if (tp.indexOf(q) !== -1) pOut.push(p[k]);
    }
  } catch(e) {}

  // Video (foglio Podcast, ID=VID*)
  try {
    var vList = (typeof getVideoListV42 === 'function') ? getVideoListV42(200) : [];
    vList = Array.isArray(vList) ? vList : [];
    for (var vi=0;vi<vList.length && vOut.length<10;vi++){
      var tv = (vList[vi].titolo || '').toString().toLowerCase();
      var cv = (vList[vi].canale || '').toString().toLowerCase();
      if (tv.indexOf(q) !== -1 || cv.indexOf(q) !== -1) vOut.push(vList[vi]);
    }
  } catch(e) {}

  // Libri (foglio Pubblicazioni)
  try {
    var lList = (typeof getLibriListV42 === 'function') ? getLibriListV42(200) : [];
    lList = Array.isArray(lList) ? lList : [];
    for (var li=0;li<lList.length && lOut.length<10;li++){
      var tl = (lList[li].titolo || '').toString().toLowerCase();
      var al = (lList[li].autore || '').toString().toLowerCase();
      var dl = (lList[li].descrizione || '').toString().toLowerCase();
      if (tl.indexOf(q) !== -1 || al.indexOf(q) !== -1 || dl.indexOf(q) !== -1) lOut.push(lList[li]);
    }
  } catch(e) {}

  return { q:q, news:nOut, bandi:bOut, podcast:pOut, video:vOut, libri:lOut };
}

// ---------- 5. Utility locali (suffisso V42 per evitare collisioni) ----------
/**
 * FIX Sprint 1.2 (v4.7.2): helper "pick" che cerca tra una lista di candidati di chiave
 * il primo valore non-vuoto presente nell'oggetto. Robusto a varianti di capitalizzazione
 * (PascalCase / UPPERCASE / lowercase / inglese) delle intestazioni del foglio Sheets.
 */
function _pickV42_(obj, candidates) {
  if (!obj || !candidates || !candidates.length) return null;
  for (var i = 0; i < candidates.length; i++) {
    var k = candidates[i];
    if (obj.hasOwnProperty(k)) {
      var v = obj[k];
      // Considera "valido" anche valore 0 e false (escludi solo null/undefined/'')
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }
  return null;
}

/**
 * FIX Sprint 1.2: funzione di diagnosi delle chiavi del foglio Items.
 * Esegui da editor GAS per vedere ESATTAMENTE le chiavi disponibili nel primo item del foglio.
 * Utile se il bug "(senza titolo)" persiste anche dopo il fix con _pickV42_.
 */
function _debugItemsKeysV42_() {
  try {
    var items = (typeof getItems === 'function') ? getItems({ limit: 1 }) : null;
    var arr = Array.isArray(items) ? items : (items && items.items) || [];
    if (!arr.length) {
      Logger.log('Foglio Items vuoto');
      return { error: 'foglio vuoto' };
    }
    var first = arr[0];
    var keys = Object.keys(first);
    Logger.log('=== CHIAVI ITEMS (totale: ' + keys.length + ') ===');
    keys.forEach(function(k){ Logger.log('  ' + k + ' = ' + JSON.stringify(first[k]).substring(0, 80)); });
    return { keys: keys, sample: first };
  } catch(e) {
    Logger.log('Errore: ' + e.message);
    return { error: e.message };
  }
}

/**
 * Idem per il foglio RADAR BANDI.
 */
function _debugBandiKeysV42_() {
  try {
    var bandi = (typeof getBandiRadar === 'function') ? getBandiRadar() : [];
    if (!bandi.length) {
      Logger.log('Nessun bando');
      return { error: 'nessun bando' };
    }
    var first = bandi[0];
    var keys = Object.keys(first);
    Logger.log('=== CHIAVI BANDI (totale: ' + keys.length + ') ===');
    keys.forEach(function(k){ Logger.log('  ' + k + ' = ' + JSON.stringify(first[k]).substring(0, 80)); });
    return { keys: keys, sample: first };
  } catch(e) {
    Logger.log('Errore: ' + e.message);
    return { error: e.message };
  }
}

function ambitoColorV42_(id) {
  // Coerente con AMBITO_COLOR del Code.gs esistente
  var map = { 1:'#534AB7', 2:'#0F6E56', 3:'#185FA5', 4:'#854F0B', 5:'#0E7490' };
  return map[Number(id)] || '#6B7280';
}
function ambitoLblV42_(id) {
  // Versione breve per tag/badge
  var map = {
    1:'Tendenze',
    2:'Accessibilita',
    3:'Mostre',
    4:'Comunita',
    5:'AI Cultura'
  };
  return map[Number(id)] || '—';
}
function formatDataBreveV42_(d) {
  if (!d) return '—';
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return Utilities.formatDate(dt, Session.getScriptTimeZone() || 'Europe/Rome', "d MMM");
}
function countNuoviOggiV42_(items, ambitoId) {
  var start = new Date(); start.setHours(0,0,0,0);
  return items.filter(function(x){
    var id = Number(x.Ambito || x.ambito);
    if (id !== ambitoId) return false;
    var raw = x.Data || x.data;
    if (!raw) return false;
    var dt = (raw instanceof Date) ? raw : new Date(raw);
    return !isNaN(dt.getTime()) && dt >= start;
  }).length;
}

/**
 * Mappa una stringa Tematica del foglio Podcast a un ambitoId 1-5.
 * Usa match per parole chiave (case-insensitive). Da raffinare su
 * casi reali una volta popolato il foglio.
 *
 * @param {string} tematica
 * @return {number|null} 1..5 oppure null se nessun match
 */
function tematicaToAmbitoId_(tematica) {
  if (!tematica) return null;
  var t = tematica.toString().toLowerCase();
  if (/\b(museo|museal|patrimonio|collezion|archeolog)\b/.test(t)) return 1;
  if (/\b(accessib|gaming|videogame|gamifica|cultura pop|fumetti)\b/.test(t)) return 2;
  if (/\b(mostra|exhibition|biennal|fiera|galleria|curator)\b/.test(t)) return 3;
  if (/\b(comunita|welfare|partecipa|audience|sociale|territorio)\b/.test(t)) return 4;
  if (/\b(ai|intelligenza|algoritmo|machine learning|digitale|chatgpt|claude)\b/.test(t)) return 5;
  return null;
}

// ============================================================
//  INTEGRAZIONE DOPOST — COPIA QUESTI CASE NEL TUO SWITCH
// ============================================================
// Nella doPost esistente, all'interno dello switch sull'action,
// aggiungi i seguenti case:
//
//   case 'getHomepageDataV42':
//     return jsonOk_(getHomepageDataV42());
//
//   case 'getAmbitoDataV42':
//     return jsonOk_(getAmbitoDataV42(params.ambitoId));
//
//   case 'getPodcastRecenti':
//     return jsonOk_(getPodcastRecenti(params.limit || 10));
//
//   case 'globalSearchV42':
//     return jsonOk_(getGlobalSearchV42(params.q));
//
// Sostituisci jsonOk_ con l'helper usato nel tuo Code.gs
// (es. ContentService.createTextOutput(JSON.stringify(...))).
//
// Se il dispatcher usa google.script.run (non doPost/doGet JSON),
// queste funzioni sono gia' invocabili dal frontend senza altro.
//
// ============================================================
//  MAPPING BANDI → AMBITO — OPZIONE A (attiva)
// ============================================================
// Il foglio "Radar Bandi" ha una colonna "Ambito" (int 1-5)
// aggiunta manualmente. Le funzioni sopra la leggono come
//    b.Ambito || b.ambito || b.ambitoId
// e i record vuoti non vengono conteggiati (sono comunque
// visibili nella vista Bandi).
//
// ===== Migrazione una-tantum (opzionale) =====
// Per popolare rapidamente la colonna sui bandi gia' presenti
// usa `migraBandiAmbito()`: applica una euristica sulle
// colonne Settore / Titolo / Ente; scrive SOLO se la cella
// "Ambito" e' vuota. Esegui da editor, tab Esecuzioni -> RUN.
//
// Mappa heuristica (rifinibile):
//   - settore contiene "musei|patrimonio|archeolog|collezion"   -> 1
//   - settore contiene "accessib|gaming|gamifica|videogame|pop" -> 2
//   - settore contiene "mostra|exhibition|biennal|galleria|curator" -> 3
//   - settore contiene "comunita|welfare|partecipa|sociale|territorio" -> 4
//   - settore contiene "ai|digitale|tecnolog|innovazione"       -> 5
// ============================================================

function settoreToAmbitoId_(settore, titolo, ente) {
  var s = ((settore||'') + ' ' + (titolo||'') + ' ' + (ente||'')).toLowerCase();
  if (/\b(musei|museo|museal|patrimonio|archeolog|collezion|monument)\b/.test(s)) return 1;
  if (/\b(accessib|gaming|gamifica|videogame|cultura pop|fumett)\b/.test(s)) return 2;
  if (/\b(mostra|mostre|exhibition|biennal|galleria|curator|fiera d'arte)\b/.test(s)) return 3;
  if (/\b(comunita|welfare|partecipa|sociale|territor|audience|inclusion)\b/.test(s)) return 4;
  if (/\b(ai|intelligenza artificiale|digitale|tecnolog|innovazione digital|chatgpt|claude)\b/.test(s)) return 5;
  return null;
}

/**
 * Popola la colonna "Ambito" sul foglio Radar Bandi per i record
 * che ne sono privi. Richiede che il foglio abbia un'intestazione
 * "Ambito" (aggiungila manualmente come ultima colonna).
 *
 * Esegui da editor GAS: Seleziona funzione `migraBandiAmbito` -> Esegui.
 */
function migraBandiAmbito() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
  var sheetName = (typeof SHEET_RADAR === 'string' && SHEET_RADAR) ? SHEET_RADAR : 'RADAR BANDI';
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Foglio "' + sheetName + '" non trovato');

  var rng = sh.getDataRange();
  var vals = rng.getValues();
  if (vals.length < 2) return 'Foglio vuoto';

  var head = vals[0].map(function(h){ return String(h||'').trim(); });
  var colAmb = head.indexOf('Ambito');
  if (colAmb === -1) throw new Error('Aggiungere colonna "Ambito" al foglio "' + sheetName + '" prima di lanciare la migrazione.');

  var colSet = head.indexOf('Settore');
  var colTit = head.indexOf('Titolo');
  var colEnte = head.indexOf('Ente');

  var updated = 0, unmapped = 0;
  for (var r=1; r<vals.length; r++){
    var row = vals[r];
    if (row[colAmb] !== '' && row[colAmb] != null) continue;

    var settore = colSet>=0 ? row[colSet] : '';
    var titolo  = colTit>=0 ? row[colTit] : '';
    var ente    = colEnte>=0 ? row[colEnte] : '';
    var amb = settoreToAmbitoId_(settore, titolo, ente);
    if (amb) {
      sh.getRange(r+1, colAmb+1).setValue(amb);
      updated++;
    } else {
      unmapped++;
    }
  }
  var msg = 'Migrazione completata: ' + updated + ' bandi aggiornati, ' + unmapped + ' senza match (da compilare a mano).';
  Logger.log(msg);
  return msg;
}
// ============================================================