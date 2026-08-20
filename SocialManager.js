// ============================================================================
//  SocialManager.js — Social Wall, fonti social, fonti articoli, seed
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//  v4.27.33 — Estratto da Codice.js (refactoring modularizzazione)
//
//  Contiene:
//  - getSocialWall, fetchAndCacheSocialWall (cache + RSS aggregator)
//  - getSocialFontiList, addSocialFonte, deleteSocialFonteById, toggleSocialFonteField
//  - _createSocialFontiSheet (setup)
//  - seedSocialFontiIstituzionali, seedSocialFontiV2, correggiSocialFontiFallite
//  - addFontiIstituzionali, addFontiNewsNuove (fonti Fonti sheet)
//  - addFonteArticoli, deleteFonteArticoli (fonti Articoli)
//
//  Dipendenze: getMainSS(), SH, AMBITO_LABEL, getCurrentUser_v44(),
//              _deleteRowById(), _toggleField(), _sheetToObjects(), fetchRSS()
// ============================================================================

function seedSocialFontiV2() {
  Logger.log('=== SEED SOCIAL FONTI V2 ===');
  var ss = getMainSS();
  var sh = ss.getSheetByName('SocialFonti');
  if (!sh) { Logger.log('Foglio SocialFonti non trovato'); return { error: 'SocialFonti non trovato' }; }
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL');
  var existing = new Set();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, iUrl + 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      existing.add(String(r[0] || '').trim());
    });
  }
  var seed = [
    { id:'SW40', nome:'Europeana Pro Blog',        url:'https://pro.europeana.eu/blog/rss.xml',        tipo:'istituzione', cat:'Digitale & Patrimonio',  av:'E' },
    { id:'SW41', nome:'NEMO — Musei Europei',      url:'https://www.ne-mo.org/news/rss.xml',           tipo:'associazione', cat:'Musei & Patrimonio',    av:'N' },
    { id:'SW42', nome:'Tafter',                    url:'https://www.tafter.it/feed/',                  tipo:'rivista',     cat:'Gestione Culturale',     av:'T' },
    { id:'SW43', nome:'Museum-iD',                 url:'https://museum-id.com/feed/',                  tipo:'rivista',     cat:'Innovazione Museale',    av:'M' },
    { id:'SW44', nome:'Culture Action Europe',     url:'https://cultureactioneurope.org/feed/',         tipo:'associazione', cat:'Politiche Culturali',   av:'C' },
    { id:'SW45', nome:'Il Giornale dell\'Arte',    url:'https://www.ilgiornaledellarte.com/feed/',     tipo:'rivista',     cat:'Arte & Mostre',          av:'J' },
    { id:'SW46', nome:'OCP Piemonte',              url:'https://www.ocp.piemonte.it/feed/',            tipo:'fondazione',  cat:'Governance & Cultura',   av:'O' },
    { id:'SW47', nome:'Finestre sull\'Arte',       url:'https://www.finestresullarte.info/feed',       tipo:'rivista',     cat:'Arte & Patrimonio',      av:'F' }
  ];
  var aggiunti = 0, skip = 0;
  seed.forEach(function(s) {
    if (existing.has(s.url)) { skip++; return; }
    var row = new Array(headers.length).fill('');
    row[headers.indexOf('ID')]        = s.id;
    row[headers.indexOf('Nome')]      = s.nome;
    row[iUrl]                         = s.url;
    row[headers.indexOf('Tipo')]      = s.tipo;
    row[headers.indexOf('Categoria')] = s.cat;
    row[headers.indexOf('Avatar')]    = s.av;
    row[headers.indexOf('Attiva')]    = true;
    sh.appendRow(row);
    existing.add(s.url);
    aggiunti++;
    Logger.log('[seedSocialV2] OK: ' + s.nome);
  });
  Logger.log('=== Seed SW V2: ' + aggiunti + ' aggiunti, ' + skip + ' skip ===');
  return { ok: true, aggiunti: aggiunti, skip: skip };
}

// ==================================================================
// SOCIAL WALL
// ==================================================================
function getSocialWall() {
  const props = PropertiesService.getScriptProperties();
  const cached   = props.getProperty('SW_CACHE');
  const cachedAt = parseInt(props.getProperty('SW_CACHE_TIME') || '0');
  const age      = Date.now() - cachedAt;
  // Cache fresca (<6h): usa subito
  if (cached && age < 21600000) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  // Cache stale (6-48h): restituisci stale per non bloccare l'UI,
  // aggiorna in background (solo se non troppo vecchia)
  if (cached && age < 172800000) {
    try {
      const stale = JSON.parse(cached);
      // Aggiorna in background (non blocca la risposta)
      try { fetchAndCacheSocialWall(); } catch(bg) {}
      return stale;
    } catch(e) {}
  }
  // Cache assente o >48h: fetch sincrono (prima volta)
  return fetchAndCacheSocialWall();
}

function fetchAndCacheSocialWall() {
  const fonti = getSocialFontiList().fonti.filter(f => f.Attiva);
  if (!fonti.length) return {posts:[], updatedAt:new Date().toISOString()};
  // v4.25 — Espansione: TUTTE le fonti attive (era 12), cutoff 30gg (era 14), 40 post (era 24)
  const posts = [], cutoff = new Date(Date.now() - 30 * 86400000);
  for (const fonte of fonti) {
    try {
      const rssItems = fetchRSS(fonte.URL, {muteHttpExceptions:true, followRedirects:true}).slice(0, 5);
      rssItems.forEach(item => {
        if (item.data < cutoff) return;
        posts.push({fonte:fonte.Nome, tipo:String(fonte.Tipo||'blog'), categoria:String(fonte.Categoria||''),
          avatar:String(fonte.Avatar||(fonte.Nome||'?').charAt(0).toUpperCase()), titolo:item.titolo,
          estratto:(item.estratto||'').substring(0,220), url:item.url, imgUrl:item.imgUrl||'',
          dataISO:item.data instanceof Date ? item.data.toISOString() : new Date().toISOString()});
      });
    } catch(err) { Logger.log('[SocialWall] fetch error: ' + (err.message || err)); }
  }
  // Rilanci manuali curati (qualsiasi piattaforma, anche X/IG/LinkedIn)
  try { if (typeof _sw_manualPosts_ === 'function') { _sw_manualPosts_().forEach(function(p){ posts.push(p); }); } } catch(eSw){}
  posts.sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));
  // Dedup per URL
  var seen = {};
  var deduped = posts.filter(function(p) {
    if (!p.url || seen[p.url]) return false;
    seen[p.url] = true;
    return true;
  });
  const result = {posts: deduped.slice(0, 40), updatedAt: new Date().toISOString()};
  try { const p = PropertiesService.getScriptProperties(); p.setProperty('SW_CACHE', JSON.stringify(result)); p.setProperty('SW_CACHE_TIME', Date.now().toString()); } catch(e){}
  return result;
}

function getSocialFontiList() {
  var SS = getMainSS();
  if (!SS.getSheetByName('SocialFonti')) _createSocialFontiSheet(SS);
  return {fonti: _sheetToObjects('SocialFonti')};
}

function _createSocialFontiSheet(SS) {
  const sh=SS.insertSheet('SocialFonti');
  sh.getRange(1,1,1,8).setValues([['ID','Nome','URL','Tipo','Categoria','Avatar','Attiva','Note']]).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
  sh.setFrozenRows(1);
  [['SW1','Artribune','https://www.artribune.com/feed/','rivista','Arte','A',true,''],
   ['SW2','Il Giornale delle Fondazioni','https://www.ilgiornaledellefondazioni.com/feed/','rivista','Cultura','G',true,''],
   ['SW3','ICOM Italia','https://icom-italia.org/feed/','istituzione','Musei','I',true,''],
   ['SW4','Federculture','http://www.federculture.it/feed/','associazione','Cultura','F',true,''],
  ].forEach(r=>sh.appendRow(r));
  return sh;
}

function addSocialFonte(body) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  const SS=getMainSS();
  let sh=SS.getSheetByName('SocialFonti'); if(!sh) sh=_createSocialFontiSheet(SS);
  const id='SW'+Date.now();
  sh.appendRow([id,body.nome,body.url,body.tipo||'blog',body.categoria||'',(body.nome||'?').charAt(0).toUpperCase(),true,body.note||'']);
  PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME');
  return {ok:true,id};
}

function deleteSocialFonteById(id) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  return _deleteRowById(getMainSS().getSheetByName('SocialFonti'), id);
}
function toggleSocialFonteField(id, field) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  return _toggleField(getMainSS().getSheetByName('SocialFonti'), id, field);
}

/**
 * Seed Social Wall — 15 istituzioni fondamentali del settore cultura italiano/europeo.
 * Idempotente: salta le URL già presenti. Eseguire una sola volta dopo deploy.
 */
function seedSocialFontiIstituzionali() {
  const SS = getMainSS();
  let sh = SS.getSheetByName('SocialFonti');
  if (!sh) sh = _createSocialFontiSheet(SS);
  const rows = sh.getDataRange().getValues();
  const existingUrls = new Set(rows.slice(1).map(r => String(r[2]||'').trim()));
  const seed = [
    // Istituzioni MiC e pubblica amministrazione
    { id:'SW10', nome:'MiC — Comunicati',         url:'https://comunicati.cultura.gov.it/feed/',                      tipo:'istituzione',   cat:'Politiche Culturali',    av:'M' },
    { id:'SW11', nome:'MiC — Musei',              url:'https://musei.cultura.gov.it/feed/',                           tipo:'istituzione',   cat:'Musei & Patrimonio',     av:'M' },
    // Reti museali e associazioni
    { id:'SW12', nome:'ICOM Italia',              url:'https://www.icom-italia.org/feed/',                            tipo:'istituzione',   cat:'Musei & Patrimonio',     av:'I' },
    { id:'SW13', nome:'Federculture',             url:'https://www.federculture.it/feed/',                            tipo:'associazione',  cat:'Politiche Culturali',    av:'F' },
    { id:'SW14', nome:'MAB Italia',               url:'https://www.mab-italia.org/feed/',                             tipo:'associazione',  cat:'Musei & Patrimonio',     av:'M' },
    { id:'SW15', nome:'AMACI',                    url:'https://www.amaci.org/feed/',                                  tipo:'associazione',  cat:'Arte Contemporanea',     av:'A' },
    // Fondazioni e centri ricerca
    { id:'SW16', nome:'Fondazione Symbola',       url:'https://symbola.net/feed/',                                    tipo:'fondazione',    cat:'Governance & Cultura',   av:'S' },
    { id:'SW17', nome:'Fondazione Fitzcarraldo',  url:'https://www.fitzcarraldo.it/feed/',                            tipo:'fondazione',    cat:'Gestione Culturale',     av:'F' },
    { id:'SW18', nome:'Fondazione Feltrinelli',   url:'https://fondazionefeltrinelli.it/feed/',                       tipo:'fondazione',    cat:'Politiche Culturali',    av:'F' },
    // Grandi musei italiani con blog/news attivi
    { id:'SW19', nome:'MAXXI Roma',               url:'https://www.maxxi.art/feed/',                                  tipo:'museo',         cat:'Arte Contemporanea',     av:'X' },
    { id:'SW20', nome:'Triennale Milano',         url:'https://www.triennale.org/feed/',                              tipo:'museo',         cat:'Design & Cultura',       av:'T' },
    { id:'SW21', nome:'FAI — Fondo Ambiente',     url:'https://www.fondoambiente.it/feed/',                           tipo:'fondazione',    cat:'Musei & Patrimonio',     av:'F' },
    // Riviste e osservatori settoriali
    { id:'SW22', nome:'Artribune',                url:'https://www.artribune.com/feed/',                              tipo:'rivista',       cat:'Arte & Mostre',          av:'A' },
    { id:'SW23', nome:'Giornale delle Fondazioni',url:'https://www.ilgiornaledellefondazioni.com/feed/',               tipo:'rivista',       cat:'Politiche Culturali',    av:'G' },
    { id:'SW24', nome:'MuseumNext',               url:'https://www.museumnext.com/feed/',                             tipo:'rivista',       cat:'Innovazione Museale',    av:'N' },
    // v5.1.0 — Riviste specializzate arte e cultura
    { id:'SW25', nome:'Exibart',                   url:'https://www.exibart.com/feed/',                                tipo:'rivista',       cat:'Arte & Mostre',          av:'E' },
    { id:'SW26', nome:'Finestre sull\'Arte',       url:'https://www.finestresullarte.info/feed',                       tipo:'rivista',       cat:'Arte & Mostre',          av:'F' },
    { id:'SW27', nome:'Flash Art Italia',          url:'https://flash---art.it/feed/',                                 tipo:'rivista',       cat:'Arte Contemporanea',     av:'F' },
    { id:'SW28', nome:'Doppiozero',                url:'https://www.doppiozero.com/feed',                              tipo:'rivista',       cat:'Cultura & Societa',      av:'D' },
    { id:'SW29', nome:'Secondo Welfare',           url:'https://www.secondowelfare.it/feed/',                          tipo:'rivista',       cat:'Welfare Culturale',      av:'S' },
    { id:'SW30', nome:'Agenda Digitale',           url:'https://www.agendadigitale.eu/feed/',                          tipo:'rivista',       cat:'AI & Cultura',           av:'A' },
    // Istituzioni aggiuntive
    { id:'SW31', nome:'Compagnia di San Paolo',    url:'https://www.compagniadisanpaolo.it/feed/',                     tipo:'fondazione',    cat:'Governance & Cultura',   av:'C' },
    { id:'SW32', nome:'Touring Club Italiano',     url:'https://www.touringclub.it/feed/',                             tipo:'istituzione',   cat:'Turismo Culturale',      av:'T' },
    { id:'SW33', nome:'AIB — Biblioteche',         url:'https://www.aib.it/feed/',                                     tipo:'associazione',  cat:'Gestione Culturale',     av:'A' },
    { id:'SW34', nome:'Treccani Magazine',         url:'https://www.treccani.it/magazine/feed/',                       tipo:'rivista',       cat:'Cultura & Societa',      av:'T' },
    // v4.19.1 — Testate generaliste cultura (filtro semantico in scanSources)
    { id:'SW35', nome:'Il Sole 24 Ore — Cultura', url:'https://www.ilsole24ore.com/rss/cultura.xml',                  tipo:'rivista',       cat:'Cultura & Societa',      av:'S' },
    { id:'SW36', nome:'Repubblica — Cultura',      url:'https://www.repubblica.it/rss/cultura/rss2.0.xml',             tipo:'rivista',       cat:'Cultura & Societa',      av:'R' },
    // v4.25 — Musei, festival, innovazione, accessibilità, territorio
    { id:'SW37', nome:'Palazzo Strozzi Firenze',   url:'https://www.palazzostrozzi.org/feed/',                         tipo:'museo',         cat:'Arte & Mostre',          av:'P' },
    { id:'SW38', nome:'Museo del Novecento Milano',url:'https://www.museodelnovecento.org/feed/',                      tipo:'museo',         cat:'Arte Contemporanea',     av:'9' },
    { id:'SW39', nome:'MUDEC Milano',              url:'https://www.mudec.it/feed/',                                   tipo:'museo',         cat:'Musei & Patrimonio',     av:'M' },
    { id:'SW40', nome:'M9 — Museo del 900 Mestre', url:'https://www.m9museum.it/feed/',                               tipo:'museo',         cat:'Innovazione Museale',    av:'9' },
    { id:'SW41', nome:'Museo Madre Napoli',        url:'https://www.madrenapoli.it/feed/',                             tipo:'museo',         cat:'Arte Contemporanea',     av:'M' },
    { id:'SW42', nome:'Gallerie d\'Italia',         url:'https://gallerieditalia.com/feed/',                            tipo:'museo',         cat:'Musei & Patrimonio',     av:'G' },
    { id:'SW43', nome:'NEMO — Network European Museums', url:'https://www.ne-mo.org/feed/',                            tipo:'istituzione',   cat:'Innovazione Museale',    av:'N' },
    { id:'SW44', nome:'Europa Nostra',             url:'https://www.europanostra.org/feed/',                            tipo:'istituzione',   cat:'Patrimonio & Territorio',av:'E' },
    { id:'SW45', nome:'Fondazione Palazzo Ducale Genova', url:'https://www.palazzoducale.genova.it/feed/',              tipo:'museo',         cat:'Musei & Patrimonio',     av:'P' },
    { id:'SW46', nome:'Museo Civico Bassano',      url:'https://www.museobassano.it/feed/',                            tipo:'museo',         cat:'Musei & Patrimonio',     av:'B' },
    { id:'SW47', nome:'Fondazione Musei Civici Venezia', url:'https://www.visitmuve.it/feed/',                          tipo:'museo',         cat:'Musei & Patrimonio',     av:'V' },
    { id:'SW48', nome:'Museo Nazionale Scienza Milano', url:'https://www.museoscienza.org/feed/',                       tipo:'museo',         cat:'Innovazione Museale',    av:'S' },
    { id:'SW49', nome:'ArtBonus — Cultura Italia',  url:'https://artbonus.gov.it/feed/',                               tipo:'istituzione',   cat:'Politiche Culturali',    av:'A' },
    { id:'SW50', nome:'Che Fare — Innovazione sociale', url:'https://www.che-fare.com/feed/',                           tipo:'rivista',       cat:'Welfare Culturale',      av:'C' },
    { id:'SW51', nome:'cheFare — Cultura e società', url:'https://www.chefare.com/feed/',                               tipo:'rivista',       cat:'Cultura & Societa',      av:'C' },
    { id:'SW52', nome:'Vita — Non profit e sociale', url:'https://www.vita.it/feed/',                                   tipo:'rivista',       cat:'Welfare Culturale',      av:'V' },
    { id:'SW53', nome:'Lettera43 — Cultura',        url:'https://www.lettera43.it/feed/cultura/',                       tipo:'rivista',       cat:'Cultura & Societa',      av:'L' },
    { id:'SW54', nome:'Patrimonio UNESCO Italia',   url:'https://www.sitiunesco.it/feed/',                              tipo:'istituzione',   cat:'Patrimonio & Territorio',av:'U' },
    { id:'SW55', nome:'Italia Nostra',              url:'https://www.italianostra.org/feed/',                            tipo:'associazione',  cat:'Patrimonio & Territorio',av:'I' },
  ];
  let aggiunti = 0, skip = 0;
  seed.forEach(function(f) {
    if (existingUrls.has(f.url)) { skip++; return; }
    sh.appendRow([f.id + '_' + Date.now(), f.nome, f.url, f.tipo, f.cat, f.av, true, '']);
    existingUrls.add(f.url);
    aggiunti++;
    Utilities.sleep(80);
  });
  // Invalida cache social wall
  PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME');
  Logger.log('[OK] seedSocialFontiIstituzionali: ' + aggiunti + ' aggiunte, ' + skip + ' già presenti');
  return { ok: true, aggiunti: aggiunti, skip: skip };
}

/**
 * Corregge feed SocialFonti non funzionanti:
 * - Rimuove URL con dominio morto (economia-cultura.it)
 * - Aggiorna ICOM senza www → con www
 * - Sostituisce ilgiornaledellarte.com (no RSS) con Finestre sull'Arte
 * - Invalida cache SW per forzare refetch
 * Da eseguire una volta dall'editor GAS.
 */
function correggiSocialFontiFallite() {
  const sh = getMainSS().getSheetByName('SocialFonti');
  if (!sh || sh.getLastRow() < 2) { Logger.log('SocialFonti vuoto'); return; }
  const vals = sh.getDataRange().getValues();
  const h = vals[0];
  const iUrl = h.indexOf('URL'); const iNome = h.indexOf('Nome');
  const FIXES = {
    'https://icom-italia.org/feed/':          'https://www.icom-italia.org/feed/',
    'https://www.ilgiornaledellarte.com/feed/':'https://www.finestresullarte.info/blog_feed_rss.php',
  };
  const DEAD  = ['economia-cultura.it'];
  let fixed = 0, deleted = 0;
  for (let i = vals.length - 1; i >= 1; i--) {
    const url = String(vals[i][iUrl]||'');
    if (DEAD.some(d => url.indexOf(d) !== -1)) {
      sh.deleteRow(i + 1); deleted++; continue;
    }
    if (FIXES[url]) {
      sh.getRange(i+1, iUrl+1).setValue(FIXES[url]);
      Logger.log('Corretto: ' + url + ' → ' + FIXES[url]); fixed++;
    }
  }
  PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME');
  Logger.log('correggiSocialFontiFallite: ' + fixed + ' corretti, ' + deleted + ' eliminati');
  return { ok:true, fixed, deleted };
}

// Sprint G (2026-05-03): Aggiunge fonti istituzionali ICOM / Federculture / Symbola + rete
// Eseguire UNA SOLA VOLTA dall'editor GAS dopo deploy.
function addFontiIstituzionali() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return 0; }
  const existingUrls = sh.getDataRange().getValues().map(r => String(r[2]||'') + String(r[3]||''));
  // [nome, url_homepage, rss_url, ambito_id, ambito_label]
  // Ambiti: 1=Identità narrazione, 2=Inclusione, 3=Programma/mostre/collezioni, 4=Comunità/welfare, 5=Digital/AI/governance
  const nuoveFonti = [
    { nome:'ICOM Italia',                  url:'https://www.icom-italia.org/',                          rss:'https://www.icom-italia.org/feed/',                          amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Federculture',                 url:'https://www.federculture.it/',                          rss:'https://www.federculture.it/feed/',                          amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Fondazione Symbola',           url:'https://symbola.net/',                                  rss:'https://symbola.net/feed/',                                 amb:5, lbl:'Digital, AI e governance' },
    { nome:'Fondazione Fitzcarraldo',      url:'https://www.fitzcarraldo.it/',                          rss:'https://www.fitzcarraldo.it/feed/',                          amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'MuseumNext',                   url:'https://www.museumnext.com/',                           rss:'https://www.museumnext.com/feed/',                           amb:5, lbl:'Digital, AI e governance' },
    { nome:'Artribune',                    url:'https://www.artribune.com/',                            rss:'https://www.artribune.com/feed/',                            amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Il Giornale delle Fondazioni', url:'https://www.ilgiornaledellefondazioni.com/',            rss:'https://www.ilgiornaledellefondazioni.com/feed/',             amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Tafter Journal',               url:'https://www.tafterjournal.it/',                         rss:'https://www.tafterjournal.it/feed/',                         amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Doppiozero Cultura',           url:'https://www.doppiozero.com/',                           rss:'https://www.doppiozero.com/feed',                           amb:1, lbl:'Identità e narrazione museale' },
    { nome:'Patrimonio Culturale ER',      url:'https://patrimonioculturale.regione.emilia-romagna.it/',rss:'https://patrimonioculturale.regione.emilia-romagna.it/feed', amb:3, lbl:'Programma, mostre e collezioni' },
  ];
  let added = 0;
  nuoveFonti.forEach(f => {
    const alreadyIn = existingUrls.some(e => e.indexOf(f.url) >= 0 || e.indexOf(f.rss) >= 0);
    if (!alreadyIn) {
      sh.appendRow(['INST' + Date.now(), f.nome, f.url, f.rss, f.amb, f.lbl, true, '', 0]);
      added++;
      Utilities.sleep(200);
    }
  });
  Logger.log('[OK] addFontiIstituzionali: ' + added + ' fonti aggiunte');
  return added;
}

// Sprint N1 (2026-05-05): 10 nuove fonti news qualitative
function addFontiNewsNuove() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return 0; }
  const existingUrls = sh.getDataRange().getValues().map(r => String(r[2]||'') + String(r[3]||''));
  const nuoveFonti = [
    { nome:"Finestre sull'Arte",    url:'https://www.finestresullarte.info/',                    rss:'https://www.finestresullarte.info/feed',                    amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Exibart',               url:'https://www.exibart.com/',                              rss:'https://www.exibart.com/feed/',                             amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:"Il Giornale dell'Arte", url:'https://www.ilgiornaledellarte.com/',                   rss:'https://www.ilgiornaledellarte.com/feed/',                  amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'FAI - Fondo Ambiente',  url:'https://www.fondoambiente.it/',                         rss:'https://www.fondoambiente.it/feed/',                        amb:1, lbl:'Identità e narrazione museale' },
    { nome:'MiC Comunicati',        url:'https://comunicati.cultura.gov.it/',                    rss:'https://comunicati.cultura.gov.it/feed/',                   amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'The Art Newspaper',     url:'https://www.theartnewspaper.com/',                      rss:'https://www.theartnewspaper.com/feed',                      amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'Treccani Magazine',     url:'https://www.treccani.it/magazine/',                     rss:'https://www.treccani.it/magazine/feed/',                    amb:1, lbl:'Identità e narrazione museale' },
    { nome:'Apollo Magazine',       url:'https://www.apollo-magazine.com/',                      rss:'https://www.apollo-magazine.com/feed/',                     amb:3, lbl:'Programma, mostre e collezioni' },
    { nome:'AIB Associaz. Bibl.',   url:'https://www.aib.it/',                                   rss:'https://www.aib.it/feed/',                                 amb:4, lbl:'Comunità e welfare culturale' },
    { nome:'Touring Club Italiano', url:'https://www.touringclub.it/',                           rss:'https://www.touringclub.it/feed/',                          amb:1, lbl:'Identità e narrazione museale' },
  ];
  let added = 0;
  nuoveFonti.forEach(f => {
    const alreadyIn = existingUrls.some(e => e.indexOf(f.url) >= 0 || e.indexOf(f.rss) >= 0);
    if (!alreadyIn) {
      sh.appendRow(['NEWS' + Date.now(), f.nome, f.url, f.rss, f.amb, f.lbl, true, '', 0]);
      added++;
      Utilities.sleep(200);
    }
  });
  Logger.log('[OK] addFontiNewsNuove: ' + added + ' fonti aggiunte');
  return added;
}

// v4.22 — Moved to LibriManager.js: LIBRI_HEADERS, setupPubblicazioniSheet, getLibriList, addLibro, seedLibriMuseologia2026

// (setupPubblicazioniSheet — see LibriManager.js)

// (seedLibriMuseologia2026, getLibriList, addLibro — see LibriManager.js)

// -- FONTI ARTICOLI -------------------------------------------------
function addFonteArticoli(body) {
  const SS=getMainSS(), sh=SS.getSheetByName(SH.FONTI);
  if(!sh) return {error:'Foglio Fonti non trovato'};
  const id='FA'+Date.now(), amb=parseInt(body.ambito)||1;
  sh.appendRow([id,body.nome,body.url,body.rssurl||body.url,amb,AMBITO_LABEL[amb]||'',true,'',0]);
  return {ok:true,id};
}
function deleteFonteArticoli(id) {
  var _u = getCurrentUser_v44(); if (!_u || (_u.ruolo !== 'admin' && _u.ruolo !== 'editor')) return { error: 'Riservato a editor/admin' };
  return _deleteRowById(getMainSS().getSheetByName(SH.FONTI), id);
}
