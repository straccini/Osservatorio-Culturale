// ============================================================================
// RegistroFonti.js — Registro unico delle fonti NON-bandi
// v4.28.0 — 2026-08-02 · Fase 1 del piano regia fonti
// (docs/superpowers/plans/2026-08-02-regia-fonti-tassonomia.md)
//
// ARCHITETTURA DECISA (Silvano, 02/08):
//   - FontiBandi_v5 resta il registro dedicato del Radar Bandi
//   - RegistroFonti è il foglio unico per TUTTE le altre categorie:
//     news, lavoro, podcast, video, norme, libri, social — estensibile
//     a categorie future senza cambiare schema
//
// Sostituisce progressivamente: FontiFeed, SocialFonti, FontiPodcast,
// FontiNews, Fonti (legacy). I vecchi fogli NON vengono toccati dalla
// migrazione: restano come archivio finché la verifica non è completa.
//
// Pubbliche: rfSetup(), rfMigra(opts), rfStato(), rfAttiva(), rfDisattiva(),
//            rfLeggi(categoria), rfSelfTest()
// Flag:      USE_REGISTRO_FONTI ('true' → getFeedSources legge da qui)
// ============================================================================

var RF_SHEET = 'RegistroFonti';
var RF_FLAG_PROP = 'USE_REGISTRO_FONTI';

// Schema formale — 24 colonne. Le righe si scrivono SEMPRE per nome colonna.
var RF_HEADERS = [
  'ID', 'Categoria', 'Nome', 'Ente', 'URL_Feed', 'URL_Sito',
  'Formato', 'Lingua', 'Copertura', 'Tier', 'Tipologie', 'Ambiti',
  'Stato', 'Origine', 'DataAggiunta', 'ApprovataDa',
  'UltimaScan', 'UltimoEsito', 'UltimoContenuto',
  'NRecordTotali', 'NRecord30gg', 'FailConsecutivi', 'UltimoErrore', 'Note'
];

// Categorie ammesse oggi. L'elenco è aperto: una categoria nuova si aggiunge
// qui e il registro la accetta senza modifiche di schema.
var RF_CATEGORIE = ['news', 'lavoro', 'podcast', 'video', 'norme', 'libri', 'social'];

// Fonti API strutturate: non hanno un feed RSS ma DEVONO essere consultabili
// nel registro come tutte le altre (requisito: "un ordine formale di fonti").
// Lo scanner resta quello dedicato; la riga serve a visibilità e salute.
var RF_FONTI_API = [
  { categoria: 'lavoro', nome: 'Gazzetta Ufficiale 4a Serie Concorsi', ente: 'IPZS',
    url: 'https://www.gazzettaufficiale.it/30giorni/concorsi', formato: 'api', copertura: 'nazionale', tier: 'A' },
  { categoria: 'libri', nome: 'Open Library Search API', ente: 'Internet Archive',
    url: 'https://openlibrary.org/search.json', formato: 'api', copertura: 'internazionale', tier: 'B' },
  { categoria: 'libri', nome: 'Crossref REST API', ente: 'Crossref',
    url: 'https://api.crossref.org/works', formato: 'api', copertura: 'internazionale', tier: 'B' },
  { categoria: 'libri', nome: 'OpenAlex API', ente: 'OurResearch',
    url: 'https://api.openalex.org/works', formato: 'api', copertura: 'internazionale', tier: 'B' },
  { categoria: 'norme', nome: 'Flusso news → auto-popolamento Norme', ente: 'OCS interno',
    url: 'interno://normeAutoPopolaRun', formato: 'api', copertura: 'nazionale', tier: 'A' },
  { categoria: 'norme', nome: 'ICOM riferimenti normativi', ente: 'ICOM Italia',
    url: 'interno://popolaNormativeICOM', formato: 'api', copertura: 'nazionale', tier: 'A' }
];

// ---------------------------------------------------------------------------
// Infrastruttura
// ---------------------------------------------------------------------------

function _rfNorm_(u) {
  if (typeof _normalizeFeedUrl_ === 'function') return _normalizeFeedUrl_(u);
  return String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function _rfSheet_(creaSeManca) {
  var ss = getMainSS();
  var sh = ss.getSheetByName(RF_SHEET);
  if (!sh && creaSeManca) {
    sh = ss.insertSheet(RF_SHEET);
    sh.getRange(1, 1, 1, RF_HEADERS.length).setValues([RF_HEADERS])
      .setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#fff');
    sh.setFrozenRows(1);
    Logger.log('[RegistroFonti] foglio creato (' + RF_HEADERS.length + ' colonne)');
  }
  return sh;
}

/** Riga per NOME colonna — mai posizionale (lezione dello schema slittato). */
function _rfRiga_(header, o) {
  var riga = new Array(header.length);
  for (var i = 0; i < header.length; i++) riga[i] = '';
  function set(col, val) { var j = header.indexOf(col); if (j >= 0 && val !== undefined) riga[j] = val; }
  set('ID', o.id); set('Categoria', o.categoria); set('Nome', o.nome);
  set('Ente', o.ente || ''); set('URL_Feed', o.urlFeed); set('URL_Sito', o.urlSito || '');
  set('Formato', o.formato || 'rss'); set('Lingua', o.lingua || 'it');
  set('Copertura', o.copertura || ''); set('Tier', o.tier || 'B');
  set('Tipologie', o.tipologie || ''); set('Ambiti', o.ambiti || '');
  set('Stato', o.stato || 'attiva'); set('Origine', o.origine || 'seed');
  set('DataAggiunta', o.dataAggiunta || new Date()); set('ApprovataDa', o.approvataDa || '');
  set('UltimaScan', o.ultimaScan || ''); set('UltimoEsito', o.ultimoEsito || '');
  set('UltimoContenuto', o.ultimoContenuto || '');
  set('NRecordTotali', o.nRecordTotali || 0); set('NRecord30gg', 0);
  set('FailConsecutivi', 0); set('UltimoErrore', ''); set('Note', o.note || '');
  return riga;
}

function _rfIndiceUrl_(sh) {
  var set = {};
  if (!sh || sh.getLastRow() < 2) return set;
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iU = h.indexOf('URL_Feed');
  for (var r = 1; r < v.length; r++) { var k = _rfNorm_(v[r][iU]); if (k) set[k] = true; }
  return set;
}

// ---------------------------------------------------------------------------
// Setup e migrazione
// ---------------------------------------------------------------------------

function rfSetup() {
  var sh = _rfSheet_(true);
  return { ok: true, foglio: RF_SHEET, righe: sh.getLastRow() - 1, colonne: RF_HEADERS.length };
}

/**
 * Migra le fonti dai fogli storici al registro unico. Dedup per URL_Feed
 * normalizzata (la prima occorrenza vince, in ordine di priorità dei fogli).
 * I fogli sorgente NON vengono modificati.
 * @param {Object} [opts] {dryRun:boolean}
 */
function rfMigra(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var ss = getMainSS();
  var sh = dryRun ? ss.getSheetByName(RF_SHEET) : _rfSheet_(true);
  var visti = _rfIndiceUrl_(sh);
  var candidate = [];
  var perFoglio = {};

  function proponi(fonte, foglio) {
    var k = _rfNorm_(fonte.urlFeed);
    if (!k || visti[k]) return;
    visti[k] = true;
    candidate.push(fonte);
    perFoglio[foglio] = (perFoglio[foglio] || 0) + 1;
  }

  // 1. FontiFeed — il foglio più recente e completo (rss→news)
  var shF = ss.getSheetByName('FontiFeed');
  if (shF && shF.getLastRow() > 1) {
    var vf = shF.getDataRange().getValues();
    var hf = vf[0].map(function (x) { return String(x || '').trim(); });
    function cf(n) { return hf.indexOf(n); }
    var fTipo = cf('Tipo'), fNome = cf('Nome'), fGr = cf('Gruppo'), fUrl = cf('URL_Feed'),
        fSito = cf('URL_Sito'), fAmb = cf('Ambito'), fCat = cf('Categoria'), fAtt = cf('Attiva'),
        fScan = cf('UltimaScan'), fNTot = cf('NRecordTotali'), fNote = cf('Note');
    var MAPPA_TIPO = { rss: 'news', podcast: 'podcast', video: 'video' };
    for (var r = 1; r < vf.length; r++) {
      var row = vf[r]; if (!row[fUrl]) continue;
      var cat = MAPPA_TIPO[String(row[fTipo] || '').toLowerCase()];
      if (!cat) continue;
      var attiva = (row[fAtt] === true || String(row[fAtt]).toUpperCase() === 'TRUE');
      proponi({
        id: 'RF' + cat.toUpperCase().substring(0, 3) + '_' + r,
        categoria: cat, nome: String(row[fNome] || ''), ente: String(row[fGr] || ''),
        urlFeed: String(row[fUrl] || '').trim(), urlSito: String(row[fSito] || ''),
        formato: cat === 'video' ? 'youtube' : 'rss',
        ambiti: String(row[fAmb] || ''), stato: attiva ? 'attiva' : 'sospesa',
        origine: 'migrazione:FontiFeed', ultimaScan: row[fScan] || '',
        nRecordTotali: Number(row[fNTot] || 0),
        note: String(row[fNote] || ''),
        // le categorie tematiche del vecchio foglio finiscono in Note se presenti
        tipologie: ''
      }, 'FontiFeed');
    }
  }

  // 2. SocialFonti (→ social)
  var shS = ss.getSheetByName('SocialFonti');
  if (shS && shS.getLastRow() > 1) {
    var vs = shS.getDataRange().getValues();
    var hs = vs[0].map(function (x) { return String(x || '').trim(); });
    var sNome = hs.indexOf('Nome'), sUrl = hs.indexOf('URL'), sTipo = hs.indexOf('Tipo'),
        sAtt = hs.indexOf('Attiva'), sNote = hs.indexOf('Note');
    for (var r2 = 1; r2 < vs.length; r2++) {
      var rw = vs[r2]; if (!rw[sUrl]) continue;
      var attS = !(rw[sAtt] === false || String(rw[sAtt]).toLowerCase() === 'false');
      proponi({
        id: 'RFSOC_' + r2, categoria: 'social',
        nome: String(rw[sNome] || ''), urlFeed: String(rw[sUrl] || '').trim(),
        formato: 'rss', stato: attS ? 'attiva' : 'sospesa',
        origine: 'migrazione:SocialFonti',
        note: [String(rw[sTipo] || ''), String(rw[sNote] || '')].filter(Boolean).join(' · ')
      }, 'SocialFonti');
    }
  }

  // 3. FontiPodcast residui (audio→podcast, video→video)
  var shP = ss.getSheetByName('FontiPodcast');
  if (shP && shP.getLastRow() > 1) {
    var vp = shP.getDataRange().getValues();
    var hp = vp[0].map(function (x) { return String(x || '').trim(); });
    var pNome = hp.indexOf('Nome'), pUrl = hp.indexOf('URL_RSS'), pTema = hp.indexOf('Tematica'),
        pAtt = hp.indexOf('Attiva'), pTipo = hp.indexOf('TipoContenuto'), pNum = hp.indexOf('NumEpisodi');
    for (var r3 = 1; r3 < vp.length; r3++) {
      var rp = vp[r3]; if (!rp[pUrl]) continue;
      var tipoC = (pTipo >= 0 && String(rp[pTipo]).toLowerCase() === 'video') ? 'video' : 'podcast';
      var attP = !(rp[pAtt] === false || String(rp[pAtt]).toLowerCase() === 'false');
      proponi({
        id: 'RFPOD_' + r3, categoria: tipoC,
        nome: String(rp[pNome] || ''), urlFeed: String(rp[pUrl] || '').trim(),
        formato: tipoC === 'video' ? 'youtube' : 'rss',
        stato: attP ? 'attiva' : 'sospesa', origine: 'migrazione:FontiPodcast',
        nRecordTotali: Number((pNum >= 0 ? rp[pNum] : 0) || 0),
        note: String((pTema >= 0 ? rp[pTema] : '') || '')
      }, 'FontiPodcast');
    }
  }

  // 4. Fonti legacy (→ news)
  var shL = ss.getSheetByName('Fonti');
  if (shL && shL.getLastRow() > 1) {
    var vl = shL.getDataRange().getValues();
    var hl = vl[0].map(function (x) { return String(x || '').trim(); });
    var lNome = hl.indexOf('Nome'), lRss = hl.indexOf('RSSURL'), lUrl = hl.indexOf('URL'),
        lAmb = hl.indexOf('Ambito'), lAtt = hl.indexOf('Attiva'), lNum = hl.indexOf('NumItemRaccolti');
    for (var r4 = 1; r4 < vl.length; r4++) {
      var rl = vl[r4];
      var feed = String((lRss >= 0 ? rl[lRss] : '') || (lUrl >= 0 ? rl[lUrl] : '') || '').trim();
      if (!feed) continue;
      var attL = (rl[lAtt] === true || String(rl[lAtt]).toLowerCase() === 'true');
      proponi({
        id: 'RFLEG_' + r4, categoria: 'news',
        nome: String(rl[lNome] || ''), urlFeed: feed,
        urlSito: String((lUrl >= 0 ? rl[lUrl] : '') || ''),
        ambiti: String((lAmb >= 0 ? rl[lAmb] : '') || ''),
        stato: attL ? 'attiva' : 'sospesa', origine: 'migrazione:Fonti',
        nRecordTotali: Number((lNum >= 0 ? rl[lNum] : 0) || 0)
      }, 'Fonti(legacy)');
    }
  }

  // 5. Fonti API strutturate (lavoro, libri, norme) — per consultabilità
  RF_FONTI_API.forEach(function (a, i) {
    proponi({
      id: 'RFAPI_' + i, categoria: a.categoria, nome: a.nome, ente: a.ente,
      urlFeed: a.url, formato: a.formato, copertura: a.copertura, tier: a.tier,
      stato: 'attiva', origine: 'seed:api',
      note: 'Fonte strutturata: lo scanner è dedicato, la riga serve a visibilità e salute'
    }, 'API strutturate');
  });

  var rep = {
    ok: true, dryRun: dryRun, totale: candidate.length, perFoglio: perFoglio,
    perCategoria: {},
    esempi: candidate.slice(0, 10).map(function (c) { return c.categoria + ': ' + c.nome; })
  };
  candidate.forEach(function (c) { rep.perCategoria[c.categoria] = (rep.perCategoria[c.categoria] || 0) + 1; });
  if (dryRun || !candidate.length) return rep;

  var righe = candidate.map(function (c) { return _rfRiga_(RF_HEADERS, c); });
  sh.getRange(sh.getLastRow() + 1, 1, righe.length, RF_HEADERS.length).setValues(righe);
  rep.scritte = righe.length;
  Logger.log('[rfMigra] scritte ' + righe.length + ' fonti nel registro unico');
  return rep;
}

// ---------------------------------------------------------------------------
// Lettura per gli scanner + flag
// ---------------------------------------------------------------------------

function isRegistroFontiEnabled_() {
  return String(PropertiesService.getScriptProperties().getProperty(RF_FLAG_PROP)) === 'true';
}
function rfAttiva() { PropertiesService.getScriptProperties().setProperty(RF_FLAG_PROP, 'true'); return { ok: true, flag: true }; }
function rfDisattiva() { PropertiesService.getScriptProperties().setProperty(RF_FLAG_PROP, 'false'); return { ok: true, flag: false }; }

/**
 * Legge le fonti attive di una categoria nel formato che gli scanner già
 * conoscono (_ffShape_-compatibile: nome, urlFeed/url, categoria, priorita...).
 */
function rfLeggi(categoria) {
  categoria = String(categoria || '').toLowerCase();
  var sh = _rfSheet_(false);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  function c(n) { return h.indexOf(n); }
  var iCat = c('Categoria'), iNome = c('Nome'), iEnte = c('Ente'), iUrl = c('URL_Feed'),
      iSito = c('URL_Sito'), iForm = c('Formato'), iTier = c('Tier'), iAmb = c('Ambiti'),
      iStato = c('Stato'), iScan = c('UltimaScan'), iNTot = c('NRecordTotali'), iId = c('ID');
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var row = v[r];
    if (String(row[iCat]).toLowerCase() !== categoria) continue;
    if (String(row[iStato]).toLowerCase() !== 'attiva') continue;
    if (String(row[iForm]).toLowerCase() === 'api') continue;  // scanner dedicati
    // v4.28.5 — VERIFICA COMPATIBILITÀ (02/08 sera): la forma DEVE passare per
    // _ffShape_, che fornisce anche gli alias MAIUSCOLI (Nome, RSSURL, URL,
    // Ambito) letti da scanSources. Senza, con il flag acceso le news si
    // sarebbero fermate in silenzio. rfLeggi restituisce ESATTAMENTE la stessa
    // forma di FontiFeed: risultati identici, cambia solo la sorgente.
    var base = {
      id: row[iId], nome: String(row[iNome] || ''), gruppo: String(row[iEnte] || row[iNome] || ''),
      tipo: categoria, urlFeed: String(row[iUrl] || '').trim(), urlSito: String(row[iSito] || ''),
      ambito: String(row[iAmb] || ''), categoria: '',
      priorita: (String(row[iTier]) === 'A') ? 1 : 2, attiva: true
    };
    var o = (typeof _ffShape_ === 'function') ? _ffShape_(base) : base;
    o.tier = String(row[iTier] || 'B');
    o.ultimaScan = row[iScan] || '';
    o.nRecTot = Number(row[iNTot] || 0);
    out.push(o);
  }
  return out;
}

/** Scrive esito scansione sul registro (sostituisce i contatori sparsi). */
function rfAggiornaScan(urlFeed, esito, nNuovi, errore) {
  var sh = _rfSheet_(false);
  if (!sh || sh.getLastRow() < 2) return;
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iU = h.indexOf('URL_Feed'), k = _rfNorm_(urlFeed);
  for (var r = 1; r < v.length; r++) {
    if (_rfNorm_(v[r][iU]) !== k) continue;
    var riga = r + 1;
    function W(col, val) { var j = h.indexOf(col); if (j >= 0) sh.getRange(riga, j + 1).setValue(val); }
    W('UltimaScan', new Date());
    W('UltimoEsito', esito || (nNuovi > 0 ? 'OK' : 'EMPTY'));
    if (nNuovi > 0) {
      W('UltimoContenuto', new Date());
      W('NRecordTotali', Number(v[r][h.indexOf('NRecordTotali')] || 0) + nNuovi);
      W('FailConsecutivi', 0);
    }
    if (errore) {
      W('UltimoErrore', String(errore).substring(0, 180));
      W('FailConsecutivi', Number(v[r][h.indexOf('FailConsecutivi')] || 0) + 1);
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// CANCELLO DI PARITÀ — v4.28.5
// Lo switch al registro NON deve modificare i risultati (requisito Silvano
// 02/08 sera): questa funzione confronta, per ogni tipo, ciò che gli scanner
// vedrebbero OGGI (FontiFeed) con ciò che vedrebbero DOPO (RegistroFonti).
// Lo switch è autorizzato solo quando mancanti=0 per ogni tipo.
// ---------------------------------------------------------------------------

function rfConfronto() {
  var out = { ok: true, verdetto: '', perTipo: {} };
  var MAPPA = { rss: 'news', podcast: 'podcast', video: 'video' };
  var pronte = 0, tipi = 0;
  Object.keys(MAPPA).forEach(function (tipo) {
    tipi++;
    var vecchie = [], nuove = [];
    try { vecchie = _ffReadFromFeed_(tipo); } catch (e) {}
    try { nuove = rfLeggi(MAPPA[tipo]); } catch (e2) {}
    function setDi(arr) {
      var s = {};
      arr.forEach(function (f) { var k = _rfNorm_(f.urlFeed || f.url); if (k) s[k] = f.nome || ''; });
      return s;
    }
    var sv = setDi(vecchie), sn = setDi(nuove);
    var mancanti = [], extra = [];
    Object.keys(sv).forEach(function (k) { if (!(k in sn)) mancanti.push(sv[k] || k); });
    Object.keys(sn).forEach(function (k) { if (!(k in sv)) extra.push(sn[k] || k); });
    var parita = mancanti.length === 0;
    if (parita) pronte++;
    out.perTipo[tipo] = {
      fontiOggi: vecchie.length, fontiRegistro: nuove.length,
      mancantiNelRegistro: mancanti.length, esempiMancanti: mancanti.slice(0, 6),
      inPiuNelRegistro: extra.length, esempiInPiu: extra.slice(0, 6),
      parita: parita
    };
  });
  out.verdetto = (pronte === tipi)
    ? 'PRONTO: nessuna fonte attiva mancherebbe. Lo switch non modifica i risultati.'
    : 'NON PRONTO: ' + (tipi - pronte) + ' tipo/i con fonti mancanti nel registro. Eseguire prima la migrazione.';
  return out;
}

// ---------------------------------------------------------------------------
// Stato — la vista d'ordine richiesta: numeri per categoria, non impressioni
// ---------------------------------------------------------------------------

function rfStato() {
  var sh = _rfSheet_(false);
  if (!sh) return { ok: false, errore: 'Registro non ancora creato: eseguire prima Setup' };
  if (sh.getLastRow() < 2) return { ok: true, vuoto: true, flag: isRegistroFontiEnabled_() };
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  function c(n) { return h.indexOf(n); }
  var iCat = c('Categoria'), iStato = c('Stato'), iScan = c('UltimaScan'),
      iUC = c('UltimoContenuto'), iFail = c('FailConsecutivi');
  var ora = Date.now(), per = {};
  for (var r = 1; r < v.length; r++) {
    var cat = String(v[r][iCat] || '?').toLowerCase();
    if (!per[cat]) per[cat] = { totali: 0, attive: 0, quarantena: 0, sospese: 0, morte: 0, scan7gg: 0, contenuto30gg: 0, inErrore: 0 };
    var P = per[cat]; P.totali++;
    var st = String(v[r][iStato] || '').toLowerCase();
    if (st === 'attiva') P.attive++;
    else if (st === 'quarantena') P.quarantena++;
    else if (st === 'morta') P.morte++;
    else P.sospese++;
    function eta(x) { var d = (x instanceof Date) ? x : (x ? new Date(x) : null); return (d && !isNaN(d)) ? (ora - d.getTime()) / 86400000 : null; }
    var eScan = eta(v[r][iScan]); if (eScan !== null && eScan <= 7) P.scan7gg++;
    var eCont = eta(v[r][iUC]); if (eCont !== null && eCont <= 30) P.contenuto30gg++;
    if (Number(v[r][iFail] || 0) >= 3) P.inErrore++;
  }
  return { ok: true, flag: isRegistroFontiEnabled_(), totale: sh.getLastRow() - 1, perCategoria: per };
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

function rfSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function eq(nome, atteso, ottenuto) {
    if (String(atteso) === String(ottenuto)) pass++;
    else { fail++; falliti.push(nome + ': atteso ' + atteso + ', ottenuto ' + ottenuto); }
  }
  // riga per nome colonna con header riordinato
  var hdr = ['Stato', 'URL_Feed', 'ID', 'Categoria', 'Tier'];
  var riga = _rfRiga_(hdr, { id: 'X', categoria: 'podcast', urlFeed: 'http://a', stato: 'quarantena', tier: 'A' });
  eq('riga.Stato', 'quarantena', riga[0]);
  eq('riga.URL_Feed', 'http://a', riga[1]);
  eq('riga.ID', 'X', riga[2]);
  eq('riga.Categoria', 'podcast', riga[3]);
  eq('riga.Tier', 'A', riga[4]);
  // default stato attiva
  var r2 = _rfRiga_(['Stato'], { id: 'Y', categoria: 'news', urlFeed: 'u' });
  eq('stato default', 'attiva', r2[0]);
  // normalizzazione URL
  eq('norm URL', _rfNorm_('https://x.it/f/'), _rfNorm_('http://x.it/f'));
  // schema: nessuna colonna duplicata
  var seen = {}, dup = 0;
  RF_HEADERS.forEach(function (n) { if (seen[n]) dup++; seen[n] = 1; });
  eq('header senza duplicati', 0, dup);
  // categorie: tutte le API seed hanno categoria valida
  var catKo = RF_FONTI_API.filter(function (a) { return RF_CATEGORIE.indexOf(a.categoria) < 0; }).length;
  eq('API seed con categoria valida', 0, catKo);
  // REGRESSIONE v4.28.5: la forma di rfLeggi deve includere gli alias
  // MAIUSCOLI (Nome, RSSURL, URL) che scanSources legge. Senza il passaggio
  // per _ffShape_, con il flag acceso le news si fermavano in silenzio.
  if (typeof _ffShape_ === 'function') {
    var forma = _ffShape_({ id: 'T', nome: 'Prova', tipo: 'news', urlFeed: 'https://x.it/f' });
    eq('alias RSSURL presente', 'https://x.it/f', forma.RSSURL);
    eq('alias Nome presente', 'Prova', forma.Nome);
    eq('alias url presente', 'https://x.it/f', forma.url);
  }
  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
