// ============================================================================
// FontiSezioni.js — Riallineamento fonti podcast/video su FontiFeed
// v4.27.97 — 2026-08-02
//
// PROBLEMA (diagnosi ?diag=sezioni del 02/08/2026):
//   I flag USE_FONTI_FEED_PODCAST e USE_FONTI_FEED_VIDEO sono accesi, quindi
//   gli scanner leggono le fonti da FontiFeed. Ma la migrazione non è stata
//   completata:
//     - podcast: 12 fonti su FontiFeed, 121 rimaste su FontiPodcast (legacy)
//     - video:   0 fonti su FontiFeed, 0 su FontiPodcast → scanner a vuoto
//                dal 07/05/2026 (87 giorni) senza produrre alcun errore.
//   Gli scanner non segnalano nulla: con lista vuota restituiscono 0 in
//   silenzio. Stesso schema del canale RSS bandi (v4.27.80).
//
// Pubbliche: fsAnteprima(), fsRiallineaPodcast(opts), fsRiseminaVideo(opts),
//            fsSelfTest()
// Private:   _fs*
//
// Tutte le funzioni di scrittura accettano {dryRun:true} e NON scrivono nulla
// in anteprima. Dipendenze globali: getMainSS, FONTIFEED_HEADERS,
// FONTIFEED_SHEET, _normalizeFeedUrl_, _youtubeChannelToFeedUrl.
// ============================================================================

var FS_FOGLIO_FEED = (typeof FONTIFEED_SHEET !== 'undefined') ? FONTIFEED_SHEET : 'FontiFeed';
var FS_FOGLIO_POD = 'FontiPodcast';

/**
 * Canali YouTube museali e internazionali da ripristinare come fonti video.
 * I /channel/UC... si risolvono senza fetch (trasformazione di stringa);
 * gli @handle richiedono una fetch che può fallire dietro il consent-wall UE
 * — in quel caso la voce viene saltata e riportata, non fa fallire il resto.
 */
var FS_CANALI_VIDEO = [
  { nome: 'Pinacoteca di Brera',          url: 'https://www.youtube.com/channel/UCMjoBnR_-4w7rkInxAbXh1g', cat: 'Musei & Patrimonio' },
  { nome: 'Gallerie degli Uffizi',        url: 'https://www.youtube.com/channel/UC9iTjM1LI5k60EhfTwNPO5w', cat: 'Musei & Patrimonio' },
  { nome: 'Museo Egizio Torino',          url: 'https://www.youtube.com/channel/UCu0NN4cZekeB2KKha2XwYyQ', cat: 'Musei & Patrimonio' },
  { nome: 'ICOM Italia',                  url: 'https://www.youtube.com/channel/UC_VRJw2GbXWUlzBp3ayAatg', cat: 'Musei & Patrimonio' },
  { nome: 'Museo Nazionale Romano',       url: 'https://www.youtube.com/channel/UCw2Z7PQihXJP3qMjJa6M_Ng', cat: 'Musei & Patrimonio' },
  { nome: 'Galleria Borghese',            url: 'https://www.youtube.com/channel/UCrjBHqGDcRpVRi8YjLsCt_g', cat: 'Musei & Patrimonio' },
  { nome: 'Museo Archeologico Napoli',    url: 'https://www.youtube.com/channel/UCCZhSJCNQKIhCJEUDR_3QNg', cat: 'Archeologia' },
  { nome: 'MAXXI Museo',                  url: 'https://www.youtube.com/channel/UCtGzNQCNmlrYlBETdxR0i5g', cat: 'Arte Contemporanea' },
  { nome: 'Triennale Milano',             url: 'https://www.youtube.com/channel/UCdmaHR0TTEvbfZkqRkenHOA', cat: 'Arte Contemporanea' },
  { nome: 'MART Rovereto',                url: 'https://www.youtube.com/channel/UCDbUkqY7UHYzrs7GbM5AmIQ', cat: 'Arte Contemporanea' },
  { nome: 'Fondazione Sandretto',         url: 'https://www.youtube.com/channel/UCYrENk9lYuC3o91lF-gJPSw', cat: 'Arte Contemporanea' },
  { nome: 'Palazzo Grassi Punta Dogana',  url: 'https://www.youtube.com/channel/UCOwCKyJzUU4TBGF3F0S2oGQ', cat: 'Arte Contemporanea' },
  { nome: 'Fondazione Prada',             url: 'https://www.youtube.com/channel/UCh0gcz28OW8LExZqQRA1HZw', cat: 'Arte Contemporanea' },
  { nome: 'Ministero della Cultura',      url: 'https://www.youtube.com/channel/UC8F-Rl2Li93KYya-rAUn0UA', cat: 'Politiche Culturali' },
  { nome: 'Fondazione Cariplo',           url: 'https://www.youtube.com/channel/UChmCXueVERJHMUncOY12dsw', cat: 'Politiche Culturali' },
  { nome: 'Compagnia di San Paolo',       url: 'https://www.youtube.com/channel/UCcF7J-DPXQ0yjYgvQEL-QBQ', cat: 'Politiche Culturali' },
  { nome: 'Fondazione LIA',               url: 'https://www.youtube.com/channel/UCKb5FZxf7qYMTqbOmS0TReA', cat: 'Accessibilita' },
  { nome: 'FAI - Fondo Ambiente Italiano',url: 'https://www.youtube.com/channel/UCJk5wQ6mHi-b6_8bFSoWfcQ', cat: 'Patrimonio & Territorio' },
  { nome: 'Touring Club Italiano',        url: 'https://www.youtube.com/channel/UCxJ6dGBr8pIeoajT7LGPEmQ', cat: 'Turismo Culturale' },
  { nome: 'Scuola del Patrimonio',        url: 'https://www.youtube.com/channel/UCKn8Msc5_OQ-jH9GKmHxYkw', cat: 'Formazione' },
  { nome: 'Federculture',                 url: 'https://www.youtube.com/channel/UCk5Y8PtX4Y6GJ8WPFPTj_Mw', cat: 'Gestione Culturale' },
  // Internazionali ad alta cadenza (i musei italiani pubblicano poco)
  { nome: 'Louisiana Channel (DK)',       url: 'https://www.youtube.com/@thelouisianachannel', cat: 'Arte Contemporanea' },
  { nome: 'ARoS Aarhus Art Museum',       url: 'https://www.youtube.com/@arosartmuseum',       cat: 'Musei & Patrimonio' },
  { nome: 'MoMA',                         url: 'https://www.youtube.com/@themuseumofmodernart', cat: 'Arte Contemporanea' },
  { nome: 'Tate',                         url: 'https://www.youtube.com/@Tate',                cat: 'Arte Contemporanea' }
];

// ---------------------------------------------------------------------------
// Helper privati
// ---------------------------------------------------------------------------

function _fsNorm_(u) {
  if (typeof _normalizeFeedUrl_ === 'function') return _normalizeFeedUrl_(u);
  return String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/**
 * v4.28.10 — TIPO REALE dedotto dall'URL, non dall'etichetta.
 * Il foglio FontiPodcast contiene decine di canali YouTube etichettati
 * 'audio' (verificato 02/08: Brera, MAXXI, MART, Cariplo, Sandretto...).
 * Migrarli come podcast li manderebbe al parser RSS invece che a quello
 * Atom di YouTube, e li esporrebbe nella sezione sbagliata. Un feed
 * youtube.com/feeds/videos.xml È un feed video, qualunque cosa dica la
 * colonna: l'URL vince sull'etichetta.
 */
function fsTipoDaUrl(url, etichetta) {
  var u = String(url || '').toLowerCase();
  if (u.indexOf('youtube.com/feeds/videos.xml') >= 0 || u.indexOf('youtube.com/feeds') >= 0) return 'video';
  var e = String(etichetta || '').toLowerCase();
  return (e === 'video') ? 'video' : 'podcast';
}

function _fsFogliFeed_() {
  var ss = getMainSS();
  var sh = ss.getSheetByName(FS_FOGLIO_FEED);
  if (!sh) throw new Error('Foglio ' + FS_FOGLIO_FEED + ' assente');
  return sh;
}

/** Indice delle URL già presenti su FontiFeed (qualsiasi tipo): evita doppioni. */
function _fsIndiceFeed_(sh) {
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iUrl = h.indexOf('URL_Feed'), iTipo = h.indexOf('Tipo');
  var set = {}, perTipo = {};
  for (var r = 1; r < v.length; r++) {
    var k = _fsNorm_(v[r][iUrl]);
    if (!k) continue;
    set[k] = true;
    var t = String(v[r][iTipo] || '').toLowerCase();
    perTipo[t] = (perTipo[t] || 0) + 1;
  }
  return { urls: set, perTipo: perTipo, header: h };
}

/** Costruisce una riga FontiFeed per indice di intestazione (mai posizionale). */
function _fsRigaFeed_(header, o) {
  var riga = new Array(header.length);
  for (var i = 0; i < header.length; i++) riga[i] = '';
  function set(col, val) { var i = header.indexOf(col); if (i >= 0) riga[i] = val; }
  set('ID', o.id);
  set('Nome', o.nome);
  set('Gruppo', o.gruppo || o.nome);
  set('Tipo', o.tipo);
  set('URL_Feed', o.urlFeed);
  set('URL_Sito', o.urlSito || '');
  set('Categoria', o.categoria || '');
  set('Priorita', o.priorita || 1);
  set('Attiva', true);
  set('DataAggiunta', new Date());
  set('NRecordTotali', 0);
  set('FailConsecutivi', 0);
  set('Note', o.note || '');
  return riga;
}

// ---------------------------------------------------------------------------
// Pubbliche
// ---------------------------------------------------------------------------

/**
 * Sola lettura: che cosa manca su FontiFeed per podcast e video.
 * @return {Object} { feed:{...}, podcastDaMigrare, videoDaSeminare, esempi }
 */
function fsAnteprima() {
  var sh = _fsFogliFeed_();
  var idx = _fsIndiceFeed_(sh);
  var ss = getMainSS();

  var mancantiPod = [], totPod = 0;
  var shp = ss.getSheetByName(FS_FOGLIO_POD);
  if (shp && shp.getLastRow() > 1) {
    var vp = shp.getDataRange().getValues();
    var hp = vp[0].map(function (x) { return String(x || '').trim(); });
    // v4.28.9 — schema FU17: URL/Categoria. Si accettano entrambi i nomi,
    // altrimenti le 121 fonti del foglio legacy restano invisibili.
    var pNome = hp.indexOf('Nome'),
        pUrl = (hp.indexOf('URL_RSS') >= 0 ? hp.indexOf('URL_RSS') : hp.indexOf('URL')),
        pTema = (hp.indexOf('Tematica') >= 0 ? hp.indexOf('Tematica') : hp.indexOf('Categoria')),
        pAtt = hp.indexOf('Attiva');
    for (var r = 1; r < vp.length; r++) {
      var u = String(vp[r][pUrl] || '').trim();
      if (!u) continue;
      totPod++;
      if (vp[r][pAtt] === false || String(vp[r][pAtt]).toLowerCase() === 'false') continue;
      if (idx.urls[_fsNorm_(u)]) continue;
      mancantiPod.push({ nome: String(vp[r][pNome] || ''), url: u, categoria: String(vp[r][pTema] || '') });
    }
  }

  var mancantiVideo = FS_CANALI_VIDEO.filter(function (c) {
    // I /channel/ si risolvono senza rete; per gli @handle non possiamo sapere
    // in anteprima l'URL finale, quindi li contiamo come "da risolvere".
    var m = c.url.match(/channel\/(UC[A-Za-z0-9_-]+)/);
    if (!m) return true;
    return !idx.urls[_fsNorm_('https://www.youtube.com/feeds/videos.xml?channel_id=' + m[1])];
  });

  return {
    ok: true,
    feedAttuale: idx.perTipo,
    podcast: { suLegacy: totPod, daMigrare: mancantiPod.length, esempi: mancantiPod.slice(0, 8) },
    video: { catalogo: FS_CANALI_VIDEO.length, daSeminare: mancantiVideo.length,
             esempi: mancantiVideo.slice(0, 8).map(function (c) { return c.nome; }) }
  };
}

/**
 * Migra su FontiFeed le fonti podcast attive rimaste su FontiPodcast.
 * Dedup su URL normalizzata; non tocca né cancella il foglio legacy.
 * @param {Object} [opts] - {dryRun:boolean, cap:number}
 */
function fsRiallineaPodcast(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var cap = opts.cap || 200;
  var sh = _fsFogliFeed_();
  var idx = _fsIndiceFeed_(sh);
  var ss = getMainSS();
  var shp = ss.getSheetByName(FS_FOGLIO_POD);
  var daMigrare = [];
  if (shp && shp.getLastRow() > 1) {
    var vp = shp.getDataRange().getValues();
    var hp = vp[0].map(function (x) { return String(x || '').trim(); });
    // v4.28.9 — schema FU17: URL/Categoria. Si accettano entrambi i nomi,
    // altrimenti le 121 fonti del foglio legacy restano invisibili.
    var pNome = hp.indexOf('Nome'),
        pUrl = (hp.indexOf('URL_RSS') >= 0 ? hp.indexOf('URL_RSS') : hp.indexOf('URL')),
        pTema = (hp.indexOf('Tematica') >= 0 ? hp.indexOf('Tematica') : hp.indexOf('Categoria')),
        pAtt = hp.indexOf('Attiva'),
        pTipoC = hp.indexOf('TipoContenuto');
    for (var r = 1; r < vp.length; r++) {
      var u = String(vp[r][pUrl] || '').trim();
      if (!u) continue;
      if (vp[r][pAtt] === false || String(vp[r][pAtt]).toLowerCase() === 'false') continue;
      var k = _fsNorm_(u);
      if (idx.urls[k]) continue;
      idx.urls[k] = true;   // dedup anche all'interno del legacy stesso
      daMigrare.push({
        nome: String(vp[r][pNome] || ''), url: u, categoria: String(vp[r][pTema] || ''),
        // v4.28.10 — il tipo si deduce dall'URL: il foglio legacy contiene
        // canali YouTube etichettati 'audio' che vanno al canale VIDEO
        tipo: fsTipoDaUrl(u, (pTipoC >= 0 ? vp[r][pTipoC] : ''))
      });
      if (daMigrare.length >= cap) break;
    }
  }

  var nVideo = daMigrare.filter(function (x) { return x.tipo === 'video'; }).length;
  var rep = { ok: true, dryRun: dryRun, trovate: daMigrare.length, scritte: 0,
              comeVideo: nVideo, comePodcast: daMigrare.length - nVideo,
              esempiVideo: daMigrare.filter(function (x) { return x.tipo === 'video'; })
                                    .slice(0, 8).map(function (x) { return x.nome; }),
              esempi: daMigrare.slice(0, 10).map(function (x) { return x.nome + ' [' + x.tipo + ']'; }) };
  if (dryRun || !daMigrare.length) return rep;

  var righe = daMigrare.map(function (x, i) {
    return _fsRigaFeed_(idx.header, {
      id: (x.tipo === 'video' ? 'FFV' : 'FFP') + Date.now() + '_' + i,
      nome: x.nome, tipo: x.tipo,
      urlFeed: x.url, categoria: x.categoria, priorita: 1,
      note: 'migrata da ' + FS_FOGLIO_POD + ' (tipo dedotto dall URL, v4.28.10)'
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, righe.length, idx.header.length).setValues(righe);
  rep.scritte = righe.length;
  Logger.log('[fsRiallineaPodcast] migrate ' + righe.length + ' fonti podcast su ' + FS_FOGLIO_FEED);
  return rep;
}

/**
 * Ripristina le fonti video (feed Atom YouTube) direttamente su FontiFeed.
 * Gli @handle richiedono una risoluzione via rete: se fallisce, la voce viene
 * riportata come "non risolta" senza interrompere le altre.
 * @param {Object} [opts] - {dryRun:boolean}
 */
function fsRiseminaVideo(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var sh = _fsFogliFeed_();
  var idx = _fsIndiceFeed_(sh);

  var pronte = [], nonRisolte = [], giaPresenti = 0;
  FS_CANALI_VIDEO.forEach(function (c) {
    var feedUrl = '';
    var m = c.url.match(/channel\/(UC[A-Za-z0-9_-]+)/);
    if (m) {
      feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + m[1];
    } else if (typeof _youtubeChannelToFeedUrl === 'function') {
      try { feedUrl = _youtubeChannelToFeedUrl(c.url) || ''; } catch (e) { feedUrl = ''; }
    }
    if (!feedUrl) { nonRisolte.push(c.nome); return; }
    var k = _fsNorm_(feedUrl);
    if (idx.urls[k]) { giaPresenti++; return; }
    idx.urls[k] = true;
    pronte.push({ nome: c.nome, feedUrl: feedUrl, categoria: c.cat });
  });

  var rep = { ok: true, dryRun: dryRun, catalogo: FS_CANALI_VIDEO.length,
              daScrivere: pronte.length, giaPresenti: giaPresenti,
              nonRisolte: nonRisolte, scritte: 0,
              esempi: pronte.slice(0, 8).map(function (x) { return x.nome; }) };
  if (dryRun || !pronte.length) return rep;

  var righe = pronte.map(function (x, i) {
    return _fsRigaFeed_(idx.header, {
      id: 'FFV' + Date.now() + '_' + i, nome: x.nome, tipo: 'video',
      urlFeed: x.feedUrl, urlSito: '', categoria: x.categoria, priorita: 1,
      note: 'ripristino canale video (v4.27.97)'
    });
  });
  sh.getRange(sh.getLastRow() + 1, 1, righe.length, idx.header.length).setValues(righe);
  rep.scritte = righe.length;
  Logger.log('[fsRiseminaVideo] scritte ' + righe.length + ' fonti video su ' + FS_FOGLIO_FEED);
  return rep;
}

// ---------------------------------------------------------------------------
// Self-test — verifica la costruzione riga per indice e la normalizzazione URL
// ---------------------------------------------------------------------------

function fsSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function eq(nome, atteso, ottenuto) {
    if (String(atteso) === String(ottenuto)) pass++;
    else { fail++; falliti.push(nome + ': atteso ' + atteso + ', ottenuto ' + ottenuto); }
  }

  // 1. la riga si costruisce per NOME COLONNA, non per posizione: un header
  //    riordinato deve comunque produrre i valori nelle celle giuste.
  var header = ['Tipo', 'ID', 'URL_Feed', 'Nome', 'Attiva'];
  var riga = _fsRigaFeed_(header, { id: 'X1', nome: 'Prova', tipo: 'video', urlFeed: 'http://a/b' });
  eq('riga.Tipo', 'video', riga[0]);
  eq('riga.ID', 'X1', riga[1]);
  eq('riga.URL_Feed', 'http://a/b', riga[2]);
  eq('riga.Nome', 'Prova', riga[3]);
  eq('riga.Attiva', 'true', String(riga[4]));

  // 2. colonna assente nell'header: nessun errore, valore semplicemente omesso
  var riga2 = _fsRigaFeed_(['ID'], { id: 'Y', nome: 'N', tipo: 'podcast', urlFeed: 'u' });
  eq('header ridotto', 1, riga2.length);

  // 3. normalizzazione URL: stessa fonte con/senza schema e slash finale
  eq('norm http/https', _fsNorm_('http://x.it/feed/'), _fsNorm_('https://x.it/feed'));

  // 4. il catalogo video non deve contenere duplicati di URL
  var visti = {}, dup = 0;
  FS_CANALI_VIDEO.forEach(function (c) { if (visti[c.url]) dup++; visti[c.url] = true; });
  eq('catalogo video senza duplicati', 0, dup);

  // 5. REGRESSIONE v4.28.9 — la normalizzazione NON deve buttare via la query:
  // i feed YouTube si distinguono solo da channel_id. Con la vecchia versione
  // tutti i canali collassavano su una chiave sola e ffImportFromLegacy li
  // scartava come duplicati: causa dei 21 canali spariti e dello scanner video
  // fermo 87 giorni. Questi casi impediscono che il difetto rientri.
  var y1 = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCaaa';
  var y2 = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbbb';
  eq('canali YouTube diversi = chiavi diverse', true, _fsNorm_(y1) !== _fsNorm_(y2));
  eq('stesso canale = stessa chiave', true, _fsNorm_(y1) === _fsNorm_(y1.replace('https://www.', 'http://')));
  // i parametri di tracciamento non devono creare doppioni
  eq('utm ignorato', true, _fsNorm_('https://x.it/feed?utm_source=nl') === _fsNorm_('https://x.it/feed'));
  eq('ordine parametri irrilevante', true,
     _fsNorm_('https://x.it/f?b=2&a=1') === _fsNorm_('https://x.it/f?a=1&b=2'));
  eq('query significativa conservata', true, _fsNorm_('https://x.it/f?a=1') !== _fsNorm_('https://x.it/f'));

  // 6. v4.28.10 — TIPO DALL'URL: il foglio legacy ha canali YouTube marcati
  // 'audio'. Migrarli come podcast li manderebbe al parser RSS invece che
  // all'Atom di YouTube, esponendoli nella sezione sbagliata.
  eq('youtube marcato audio → video', 'video',
     fsTipoDaUrl('https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx', 'audio'));
  eq('youtube senza etichetta → video', 'video',
     fsTipoDaUrl('https://www.youtube.com/feeds/videos.xml?channel_id=UCxxx', ''));
  eq('rss vero → podcast', 'podcast', fsTipoDaUrl('https://feeds.buzzsprout.com/123.rss', 'audio'));
  eq('etichetta video rispettata', 'video', fsTipoDaUrl('https://vimeo.com/feed', 'video'));
  eq('default podcast', 'podcast', fsTipoDaUrl('https://ilbolive.unipd.it/it/feed/podcast', ''));

  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
