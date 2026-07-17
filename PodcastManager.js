// ============================================================================
//  PodcastManager.js — Gestione fonti e contenuti podcast/video
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//  v4.27.33 — Estratto da Codice.js (refactoring modularizzazione)
//
//  Contiene:
//  - CRUD fonti podcast (FontiPodcast sheet)
//  - Scanner singola fonte RSS / YouTube Atom
//  - Conversione URL canale YouTube → feed Atom
//  - Seed fonti podcast e video (one-shot)
//  - CRUD episodi podcast (Podcast sheet)
//
//  Dipendenze: getMainSS(), SH.PODCAST, formatDate(), getPodcastSheet()
//  Nota: getPodcastSheet è definita QUI (era in Codice.js)
// ============================================================================

// ==================================================================
// FONTI PODCAST - Sheet "FontiPodcast"
// Colonne: ID | Nome | URL_RSS | Tematica | Attiva | UltimaScan | NumEpisodi
// ==================================================================
function _getFontiPodSheet() {
  const SS = getMainSS();
  let sh = SS.getSheetByName('FontiPodcast');
  if (!sh) {
    sh = SS.insertSheet('FontiPodcast');
    sh.getRange(1,1,1,7).setValues([['ID','Nome','URL_RSS','Tematica','Attiva','UltimaScan','NumEpisodi']]);
    sh.getRange(1,1,1,7).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    sh.setFrozenRows(1);
    sh.appendRow(['FP'+Date.now(),'Giuditta - Storia Arte','https://www.spreaker.com/show/4545413/episodes/feed','Arte & Mostre',true,'',0]);
  }
  return sh;
}

function getFontiPodcast() {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const fonti = rows.slice(1).filter(r => r[0]).map(r => {
    const o = {}; h.forEach((col,i) => o[col] = r[i]); return o;
  });
  return { fonti };
}

function addFontePodcast(body) {
  if (!body.nome || !body.url) return { error:'Nome e URL obbligatori' };
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  if (rows.slice(1).some(r => r[2] === body.url)) return { error:'Fonte gia presente' };
  const id = 'FP' + Date.now();
  sh.appendRow([id, body.nome, body.url, body.tematica||'Arte & Mostre', true, '', 0]);
  return { ok:true, id };
}

function deleteFontePodcastById(id) {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length-1; i >= 1; i--) {
    if (rows[i][0] === id) { sh.deleteRow(i+1); return { ok:true }; }
  }
  return { error:'Non trovato' };
}

function toggleFontePodcastField(id, field) {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const col = h.indexOf(field);
  if (col < 0) return { error:'Campo non trovato' };
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      const newVal = !rows[i][col];
      sh.getRange(i+1, col+1).setValue(newVal);
      return { ok:true, value: newVal };
    }
  }
  return { error:'Non trovato' };
}

function scanSingolaFontePodcast(id) {
  const sh = _getFontiPodSheet();
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== id) continue;
    const fonte = {}; h.forEach((col,ci) => fonte[col] = rows[i][ci]);
    if (!fonte.Attiva) return { error:'Fonte disattivata' };
    try {
      const added = _scanSingolaFontePodcastRSS(fonte);
      const colScan = h.indexOf('UltimaScan');
      const colNum  = h.indexOf('NumEpisodi');
      if (colScan >= 0) sh.getRange(i+1, colScan+1).setValue(new Date().toISOString().split('T')[0]);
      if (colNum >= 0)  sh.getRange(i+1, colNum+1).setValue(added);
      return { ok:true, added, fonte: fonte.Nome };
    } catch(e) {
      return { error: e.message };
    }
  }
  return { error:'Fonte non trovata' };
}

function _scanSingolaFontePodcastRSS(fonte) {
  const resp = UrlFetchApp.fetch(fonte.URL_RSS, {
    muteHttpExceptions:true, deadline:10,
    headers:{'User-Agent':'Mozilla/5.0 Feedfetcher'}
  });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());
  const xml = resp.getContentText('UTF-8');
  const doc = XmlService.parse(xml);
  const root = doc.getRootElement();
  const isYoutubeAtom = (root.getName() === 'feed') ||
                        (String(fonte.URL_RSS||'').indexOf('youtube.com') >= 0);
  let items;
  if (isYoutubeAtom) {
    const ns = root.getNamespace();
    items = ns ? root.getChildren('entry', ns) : root.getChildren('entry');
  } else {
    const channel = root.getChild('channel') || root;
    items = channel.getChildren('item');
  }
  const podSh = getPodcastSheet();
  const existRows = podSh.getDataRange().getValues();
  const existLinks = new Set(existRows.slice(1).map(r => String(r[8]||'').trim()));
  let added = 0;
  const now = new Date().toISOString().split('T')[0];
  const tipoContenuto = (fonte.TipoContenuto || (isYoutubeAtom ? 'video' : 'audio'));
  for (let idx = 0; idx < Math.min(items.length, 20); idx++) {
    const item = items[idx];
    let title = '', link = '', pubDate = '';
    if (isYoutubeAtom) {
      const ns = root.getNamespace();
      title = ns ? (item.getChildText('title', ns) || '') : (item.getChildText('title') || '');
      const linkEl = ns ? item.getChild('link', ns) : item.getChild('link');
      if (linkEl) {
        const hrefAttr = linkEl.getAttribute('href');
        link = hrefAttr ? hrefAttr.getValue() : '';
      }
      pubDate = ns ? (item.getChildText('published', ns) || '') : (item.getChildText('published') || '');
    } else {
      title = item.getChildText('title') || '';
      const encl = item.getChild('enclosure');
      link = (encl ? encl.getAttribute('url').getValue() : '') || item.getChildText('link') || '';
      pubDate = item.getChildText('pubDate') || '';
    }
    if (!title || existLinks.has(link)) continue;
    const id = (tipoContenuto === 'video' ? 'VID' : 'POD') + Date.now() + '_' + Math.floor(Math.random()*10000);
    podSh.appendRow([id, now, title, fonte.Nome, '', fonte.Tematica||'Arte & Mostre',
                     '', pubDate, link, '', '', 3, fonte.Nome,
                     false, false, false, 'attivo']);
    existLinks.add(link);
    added++;
    Utilities.sleep(50);
  }
  return added;
}

// ============================================================================
// VIDEO YOUTUBE & GESTIONE FONTI ESTESA
// ============================================================================

function _youtubeChannelToFeedUrl(input) {
  if (!input) return '';
  var url = String(input).trim();
  if (url.indexOf('feeds/videos.xml') >= 0) return url;
  var m = url.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/);
  if (m) return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + m[1];
  m = url.match(/youtube\.com\/user\/([A-Za-z0-9_-]+)/);
  if (m) return 'https://www.youtube.com/feeds/videos.xml?user=' + m[1];
  m = url.match(/youtube\.com\/playlist\?list=([A-Za-z0-9_-]+)/);
  if (m) return 'https://www.youtube.com/feeds/videos.xml?playlist_id=' + m[1];
  m = url.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/);
  if (m) {
    var ytApiKey = '';
    try { ytApiKey = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY') || ''; } catch(_){}
    if (ytApiKey) {
      try {
        var apiResp = UrlFetchApp.fetch(
          'https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q='
          + encodeURIComponent('@' + m[1]) + '&key=' + ytApiKey,
          { muteHttpExceptions: true, deadline: 10 }
        );
        if (apiResp.getResponseCode() === 200) {
          var apiData = JSON.parse(apiResp.getContentText());
          if (apiData.items && apiData.items[0]) {
            var cid = (apiData.items[0].id && apiData.items[0].id.channelId)
                   || (apiData.items[0].snippet && apiData.items[0].snippet.channelId);
            if (cid) return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + cid;
          }
        }
      } catch(eApi) { Logger.log('_youtubeChannelToFeedUrl API v3: ' + eApi.message); }
    }
    try {
      var resp = UrlFetchApp.fetch('https://www.youtube.com/@' + m[1], {
        muteHttpExceptions:true, followRedirects:true, deadline:10,
        headers:{'User-Agent':'Mozilla/5.0 Feedfetcher'}
      });
      if (resp.getResponseCode() === 200) {
        var html = resp.getContentText();
        var idMatch = html.match(/"channelId":"(UC[A-Za-z0-9_-]+)"/) ||
                      html.match(/channel\/(UC[A-Za-z0-9_-]+)/);
        if (idMatch) return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + idMatch[1];
      }
    } catch(e) { Logger.log('_youtubeChannelToFeedUrl scraping @handle: ' + e.message); }
    return '';
  }
  return '';
}

function addFonteVideoYoutube(body) {
  if (!body || !body.nome || !body.channelUrl) {
    return { error:'Nome e channelUrl obbligatori' };
  }
  var feedUrl = _youtubeChannelToFeedUrl(body.channelUrl);
  if (!feedUrl) {
    return { error:'URL canale YouTube non riconosciuto. Usare /channel/UCxxx, /@handle, /user/xxx o URL feed completo.' };
  }
  _ensureFontiPodTipoContenuto_();
  var sh = _getFontiPodSheet();
  var rows = sh.getDataRange().getValues();
  if (rows.slice(1).some(function(r){ return r[2] === feedUrl; })) {
    return { error:'Feed gia presente' };
  }
  var id = 'FV' + Date.now();
  sh.appendRow([id, body.nome, feedUrl, body.tematica||'Musei & Patrimonio', true, '', 0, 'video']);
  return { ok:true, id: id, feedUrl: feedUrl };
}

function _ensureFontiPodTipoContenuto_() {
  var sh = _getFontiPodSheet();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  if (headers.indexOf('TipoContenuto') >= 0) return;
  var newCol = headers.length + 1;
  sh.getRange(1, newCol).setValue('TipoContenuto').setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
  if (sh.getLastRow() > 1) {
    var defaults = [];
    for (var i = 0; i < sh.getLastRow() - 1; i++) defaults.push(['audio']);
    sh.getRange(2, newCol, defaults.length, 1).setValues(defaults);
  }
}

function populaSeedVideoYoutubeMusei() {
  Logger.log('=== SEED VIDEO YOUTUBE MUSEI ITALIANI ===');
  _ensureFontiPodTipoContenuto_();
  var seed = [
    { nome:'Pinacoteca di Brera',         channelUrl:'https://www.youtube.com/channel/UCMjoBnR_-4w7rkInxAbXh1g', tematica:'Musei & Patrimonio' },
    { nome:'Gallerie degli Uffizi',       channelUrl:'https://www.youtube.com/channel/UC9iTjM1LI5k60EhfTwNPO5w', tematica:'Musei & Patrimonio' },
    { nome:'Museo Egizio Torino',         channelUrl:'https://www.youtube.com/channel/UCu0NN4cZekeB2KKha2XwYyQ', tematica:'Musei & Patrimonio' },
    { nome:'ICOM Italia',                 channelUrl:'https://www.youtube.com/channel/UC_VRJw2GbXWUlzBp3ayAatg', tematica:'Musei & Patrimonio' },
    { nome:'Museo Nazionale Romano',      channelUrl:'https://www.youtube.com/channel/UCw2Z7PQihXJP3qMjJa6M_Ng', tematica:'Musei & Patrimonio' },
    { nome:'Galleria Borghese',           channelUrl:'https://www.youtube.com/channel/UCrjBHqGDcRpVRi8YjLsCt_g', tematica:'Musei & Patrimonio' },
    { nome:'Museo Archeologico Napoli',   channelUrl:'https://www.youtube.com/channel/UCCZhSJCNQKIhCJEUDR_3QNg', tematica:'Archeologia' },
    { nome:'MAXXI Museo',                 channelUrl:'https://www.youtube.com/channel/UCtGzNQCNmlrYlBETdxR0i5g', tematica:'Arte Contemporanea' },
    { nome:'Triennale Milano',            channelUrl:'https://www.youtube.com/channel/UCdmaHR0TTEvbfZkqRkenHOA', tematica:'Arte Contemporanea' },
    { nome:'MART Rovereto',               channelUrl:'https://www.youtube.com/channel/UCDbUkqY7UHYzrs7GbM5AmIQ', tematica:'Arte Contemporanea' },
    { nome:'Fondazione Sandretto',        channelUrl:'https://www.youtube.com/channel/UCYrENk9lYuC3o91lF-gJPSw', tematica:'Arte Contemporanea' },
    { nome:'Palazzo Grassi Punta della Dogana', channelUrl:'https://www.youtube.com/channel/UCOwCKyJzUU4TBGF3F0S2oGQ', tematica:'Arte Contemporanea' },
    { nome:'Fondazione Prada',            channelUrl:'https://www.youtube.com/channel/UCh0gcz28OW8LExZqQRA1HZw', tematica:'Arte Contemporanea' },
    { nome:'Ministero della Cultura',     channelUrl:'https://www.youtube.com/channel/UC8F-Rl2Li93KYya-rAUn0UA', tematica:'Politiche Culturali' },
    { nome:'Fondazione Cariplo',          channelUrl:'https://www.youtube.com/channel/UChmCXueVERJHMUncOY12dsw', tematica:'Politiche Culturali' },
    { nome:'Fondazione Compagnia di San Paolo', channelUrl:'https://www.youtube.com/channel/UCcF7J-DPXQ0yjYgvQEL-QBQ', tematica:'Politiche Culturali' },
    { nome:'Fondazione LIA',              channelUrl:'https://www.youtube.com/channel/UCKb5FZxf7qYMTqbOmS0TReA', tematica:'Accessibilita' },
    { nome:'FAI - Fondo Ambiente Italiano', channelUrl:'https://www.youtube.com/channel/UCJk5wQ6mHi-b6_8bFSoWfcQ', tematica:'Patrimonio & Territorio' },
    { nome:'Touring Club Italiano',        channelUrl:'https://www.youtube.com/channel/UCxJ6dGBr8pIeoajT7LGPEmQ', tematica:'Turismo Culturale' },
    { nome:'Scuola del Patrimonio (SNaPAC)', channelUrl:'https://www.youtube.com/channel/UCKn8Msc5_OQ-jH9GKmHxYkw', tematica:'Formazione' },
    { nome:'Federculture',                channelUrl:'https://www.youtube.com/channel/UCk5Y8PtX4Y6GJ8WPFPTj_Mw', tematica:'Gestione Culturale' }
  ];
  var aggiunti = 0, errori = 0, skip = 0;
  seed.forEach(function(s) {
    var res = addFonteVideoYoutube(s);
    if (res.ok) { aggiunti++; Logger.log('OK: ' + s.nome + ' -> ' + res.feedUrl); }
    else if (String(res.error).indexOf('gia presente') >= 0) { skip++; Logger.log('SKIP: ' + s.nome); }
    else { errori++; Logger.log('ERR: ' + s.nome + ' -> ' + res.error); }
  });
  Logger.log('=== Seed completato: ' + aggiunti + ' aggiunti, ' + skip + ' gia presenti, ' + errori + ' errori ===');
  return { aggiunti: aggiunti, skip: skip, errori: errori };
}

function seedFontiPodcastRSS() {
  Logger.log('=== SEED PODCAST RSS CULTURALI ITALIANI ===');
  var seed = [
    { nome:'Artribune Podcast',               url:'https://feeds.buzzsprout.com/1234567.rss',                                 tematica:'Arte Contemporanea' },
    { nome:'Musei in Comune Roma - podcast',  url:'https://www.museicapitolini.org/podcast/feed',                             tematica:'Musei & Patrimonio' },
    { nome:'Fondazione Golinelli',            url:'https://podcasts-audio.fondazionegolinelli.it/podcast/fondazionegolinelli.xml', tematica:'Innovazione Culturale' },
    { nome:'Il Bo Live - Unipd Cultura',      url:'https://ilbolive.unipd.it/it/feed/podcast',                                tematica:'Ricerca & Accademia' },
    { nome:'MuseoPodcast - Storie di musei',  url:'https://anchor.fm/s/museopodcast/podcast/rss',                             tematica:'Musei & Patrimonio' },
    { nome:'Scientificast',                   url:'https://www.scientificast.it/feed/podcast/',                                tematica:'Divulgazione' },
    { nome:'Storia in Podcast',               url:'https://storiacast.com/feed/',                                              tematica:'Storia & Patrimonio' },
    { nome:'Treccani - Il podcast della conoscenza', url:'https://anchor.fm/s/treccani-podcast/podcast/rss',                   tematica:'Cultura & Societa' },
    { nome:'Chora Media - Buio',              url:'https://anchor.fm/s/buio-chora/podcast/rss',                                tematica:'Cultura & Societa' },
    { nome:'Piano P - Giornalismo lento',     url:'https://pianop.it/feed/podcast/',                                           tematica:'Giornalismo Culturale' },
    { nome:'SuperAbile INAIL',                url:'https://www.superabile.it/feed/podcast.xml',                                tematica:'Accessibilita' },
    { nome:'Italia Slow Tour podcast',        url:'https://anchor.fm/s/italia-slow-tour/podcast/rss',                          tematica:'Turismo Culturale' },
    { nome:'Digitalia - cultura digitale',    url:'https://www.intesasanpaoloformakers.com/podcast/feed',                       tematica:'Innovazione Culturale' },
    { nome:'Domus Podcast',                   url:'https://anchor.fm/s/domus-podcast/podcast/rss',                             tematica:'Architettura & Design' },
    { nome:'Fondazione Scuola Patrimonio',    url:'https://www.fondazionescuolapatrimonio.it/feed/',                            tematica:'Formazione' },
    { nome:'Symbola - Io sono cultura',       url:'https://www.symbola.net/feed/podcast/',                                     tematica:'Economia Culturale' }
  ];
  _ensureFontiPodTipoContenuto_();
  var sh = _getFontiPodSheet();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL_RSS');
  if (iUrl < 0) iUrl = headers.indexOf('URL_Feed');
  if (iUrl < 0) iUrl = headers.indexOf('URL');
  if (iUrl < 0) iUrl = headers.indexOf('url');
  if (iUrl < 0) { Logger.log('[seedFontiPodcastRSS] Colonna URL non trovata. Headers: ' + JSON.stringify(headers)); return { error: 'Colonna URL non trovata', headers: headers }; }
  var existing = new Set();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, iUrl + 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      existing.add(String(r[0] || '').trim());
    });
  }
  var aggiunti = 0, skip = 0;
  seed.forEach(function(s) {
    if (existing.has(s.url)) { skip++; return; }
    var id = 'FP' + Date.now() + Math.floor(Math.random() * 1000);
    sh.appendRow([id, s.nome, s.url, s.tematica, true, '', 0, 'audio']);
    existing.add(s.url);
    aggiunti++;
    Logger.log('OK: ' + s.nome);
    Utilities.sleep(100);
  });
  Logger.log('=== RSS seed: ' + aggiunti + ' aggiunti, ' + skip + ' gia presenti ===');
  return { ok:true, aggiunti: aggiunti, skip: skip };
}

function pulisciFontiPodcastBloccate() {
  var sh = _getFontiPodSheet();
  if (sh.getLastRow() < 2) { Logger.log('FontiPodcast vuoto'); return; }
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL_RSS');
  if (iUrl < 0) iUrl = headers.indexOf('URL_Feed');
  if (iUrl < 0) iUrl = headers.indexOf('URL');
  if (iUrl < 0) { Logger.log('[pulisciFontiPodcast] Colonna URL non trovata: ' + JSON.stringify(headers)); return { error: 'Colonna URL non trovata' }; }
  var BLOCKLIST = [
    'raiplaysound.it',
    'feeds.spreaker.com/user',
    'feeds.buzzsprout.com',
    'podcasts-audio.fondazionegolinelli.it',
    'museicapitolini.org',
    'ilbolive.unipd.it'
  ];
  var data = sh.getDataRange().getValues();
  var toDelete = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var url = String(data[i][iUrl]||'');
    if (BLOCKLIST.some(function(d){ return url.indexOf(d) !== -1; })) {
      toDelete.push(i + 1);
    }
  }
  toDelete.forEach(function(row) { sh.deleteRow(row); });
  Logger.log('pulisciFontiPodcastBloccate: rimossi ' + toDelete.length + ' feed bloccati');
  return { ok: true, rimossi: toDelete.length };
}

function seedFontiPodcastV2() {
  Logger.log('=== SEED PODCAST V2 — FONTI CULTURALI ===');
  _ensureFontiPodTipoContenuto_();
  var seed = [
    { nome:'Europeana Pro Blog',          url:'https://pro.europeana.eu/blog/rss.xml',            tematica:'Digitale & Patrimonio' },
    { nome:'NEMO — European Museums',     url:'https://www.ne-mo.org/news/rss.xml',               tematica:'Musei & Patrimonio' },
    { nome:'Culture Action Europe',       url:'https://cultureactioneurope.org/feed/',             tematica:'Politiche Culturali' },
    { nome:'Tafter — Economia Cultura',   url:'https://www.tafter.it/feed/',                      tematica:'Gestione Culturale' },
    { nome:'Museum-iD',                   url:'https://museum-id.com/feed/',                      tematica:'Innovazione Museale' },
    { nome:'Il Giornale dell\'Arte',      url:'https://www.ilgiornaledellarte.com/feed/',          tematica:'Arte & Mostre' },
    { nome:'MuseumNext',                  url:'https://www.museumnext.com/feed/',                  tematica:'Innovazione Museale' },
    { nome:'Doppiozero — Critica',        url:'https://www.doppiozero.com/feed/',                  tematica:'Critica Culturale' },
    { nome:'Artribune — News',            url:'https://www.artribune.com/feed/',                   tematica:'Arte Contemporanea' },
    { nome:'Finestre sull\'Arte',         url:'https://www.finestresullarte.info/feed',            tematica:'Arte & Patrimonio' }
  ];
  var sh = _getFontiPodSheet();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL_RSS');
  if (iUrl < 0) iUrl = headers.indexOf('URL_Feed');
  if (iUrl < 0) iUrl = headers.indexOf('URL');
  if (iUrl < 0) { Logger.log('[seedPodcastV2] Colonna URL non trovata: ' + JSON.stringify(headers)); return { error: 'Colonna URL non trovata' }; }
  var existing = new Set();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, iUrl + 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      existing.add(String(r[0] || '').trim());
    });
  }
  var iNome = headers.indexOf('Nome');
  var iTem  = headers.indexOf('Tematica');
  var iAtt  = headers.indexOf('Attiva');
  var iTipo = headers.indexOf('TipoContenuto');
  var aggiunti = 0, skip = 0;
  seed.forEach(function(s) {
    if (existing.has(s.url)) { skip++; return; }
    var row = new Array(headers.length).fill('');
    row[headers.indexOf('ID')] = 'POD' + Date.now() + '_' + aggiunti;
    row[iNome] = s.nome;
    row[iUrl]  = s.url;
    row[iTem]  = s.tematica;
    row[iAtt]  = true;
    if (iTipo >= 0) row[iTipo] = 'podcast';
    sh.appendRow(row);
    existing.add(s.url);
    aggiunti++;
    Logger.log('[seedPodcastV2] OK: ' + s.nome);
    Utilities.sleep(100);
  });
  Logger.log('=== Seed V2 completato: ' + aggiunti + ' aggiunti, ' + skip + ' gia presenti ===');
  return { ok: true, aggiunti: aggiunti, skip: skip };
}

// ==================================================================
// PODCAST CRUD — Sheet "Podcast" (episodi)
// ==================================================================

function getPodcastSheet() {
  const SS = getMainSS();
  let sh = SS.getSheetByName(SH.PODCAST);
  if (!sh) {
    sh = SS.insertSheet(SH.PODCAST);
    const h = ['ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata','DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte','Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord'];
    sh.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function getPodcasts(params) {
  const sh = getPodcastSheet();
  if (!sh) return {podcasts:[], total:0};
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {podcasts:[], total:0};
  const rows = sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues();
  const h = rows[0];
  if (!h || h.length === 0) return {podcasts:[], total:0};
  const podcasts = [];
  const q = (params && params.q ? params.q : '').toLowerCase();
  const tematica = params && params.tematica ? params.tematica : '';
  const stato = params && params.stato ? params.stato : '';
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]; if (!r[0]) continue;
    const p = {}; h.forEach((col, idx) => { p[col] = r[idx]; });
    const sr = String(p.StatoRecord || 'attivo').toLowerCase().trim();
    if (sr === 'archiviato' && stato !== 'archiviato') continue;
    if (stato === 'ascoltati' && !p.Ascoltato) continue;
    if (stato === 'da-ascoltare' && !p.DaAscoltare) continue;
    if (stato === 'digest' && !p.InclusiNelDigest) continue;
    if (stato === 'nuovi' && p.Ascoltato) continue;
    if (tematica && p.Tematica !== tematica) continue;
    if (q) {
      const haystack = ((p.Titolo||'')+' '+(p.Serie||'')+' '+(p.Autore||'')+' '+(p.SommarioAI||'')).toLowerCase();
      if (!haystack.includes(q)) continue;
    }
    if (p.DataRilevamento instanceof Date) p.DataRilevamento = formatDate(p.DataRilevamento);
    if (p.DataPubblicazione instanceof Date) p.DataPubblicazione = formatDate(p.DataPubblicazione);
    podcasts.push(p);
  }
  podcasts.sort((a,b) => {
    const ua = !a.Ascoltato ? 1 : 0, ub = !b.Ascoltato ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return (b.Score||0) - (a.Score||0);
  });
  return {podcasts, total: podcasts.length};
}

function savePodcast(body) {
  const sh = getPodcastSheet();
  const id = body.id || ('POD' + Date.now());
  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const idCol = h.indexOf('ID');
  if (body.id) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][idCol] === body.id) {
        const vals = [body.id, rows[i][1], body.titolo||'', body.serie||'', body.autore||'', body.tematica||'', body.durata||'', body.dataPubl||'', body.link||'', body.sommario||'', rows[i][10], rows[i][11], body.fonte||'', rows[i][13], rows[i][14], rows[i][15], rows[i][16]||'attivo'];
        sh.getRange(i+1,1,1,vals.length).setValues([vals]);
        return {ok:true};
      }
    }
  }
  sh.appendRow([id, new Date(), body.titolo||'', body.serie||'', body.autore||'', body.tematica||'Musei & Patrimonio', body.durata||'', body.dataPubl||'', body.link||'', body.sommario||'', '', 3, body.fonte||'manuale', false, false, false, 'attivo']);
  return {ok:true, id};
}

function togglePodField(body) {
  const sh = getPodcastSheet();
  if (!sh || sh.getLastRow() < 2) return {error:'Foglio podcast vuoto'};
  const rows = sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues();
  const h = rows[0];
  const idCol = h.indexOf('ID');
  const fieldCol = h.indexOf(body.field);
  if (fieldCol < 0) return {error:'Campo non trovato: '+body.field};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === body.id) {
      const nv = !rows[i][fieldCol];
      sh.getRange(i+1, fieldCol+1).setValue(nv);
      return {ok:true, value:nv};
    }
  }
  return {error:'Podcast non trovato'};
}

function deletePodcast(id) {
  const sh = getPodcastSheet();
  const rows = sh.getDataRange().getValues();
  const idCol = rows[0].indexOf('ID');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === id) { sh.deleteRow(i+1); return {ok:true}; }
  }
  return {error:'Non trovato'};
}
