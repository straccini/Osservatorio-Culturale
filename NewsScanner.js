// ============================================================================
// NewsScanner.js — RSS news scanning module
// v4.22 — Extracted from Codice.js (file-organization refactor)
//
// Functions: scanSources, fetchRSS, processWithAI, saveItem, getItems,
//   getItemsByIds, editSommario, scanPodcastDiretto, scanVideoYoutube,
//   getExistingURLs, updateFonteLastScan, backfillRegioneNews,
//   passaFiltroCulturaMusei_, FONTI_GENERALISTE,
//   _parseRSSItems_, _parseYoutubeAtom_, _xmlText_
//
// Dependencies (global): getMainSS, SH, AMBITO_LABEL, CLAUDE_API_KEY,
//   _initLegacyConsts_, getFeedSources, updateFeedSourceStats,
//   _canonicalUrl_, formatDate, getPodcastSheet, getWeekNumberBandi
// ============================================================================

// v4.19.1 — Fonti generaliste: pubblicano molto off-topic, gate semantico obbligatorio
var FONTI_GENERALISTE = [
  'Il Sole 24 Ore — Cultura',
  'Repubblica — Cultura'
];

/**
 * v4.19.1 — Gate semantico per fonti generaliste.
 * Restituisce true se titolo+testo contiene almeno una keyword core-business
 * (musei, patrimonio, luoghi della cultura…). Case-insensitive.
 * Per le fonti istituzionali (Symbola, ICOM ecc.) questo gate NON viene chiamato.
 */
function passaFiltroCulturaMusei_(titolo, testo) {
  var kw = [
    'museo','musei','mostra','mostre','patrimonio','beni culturali',
    'archeolog','biblioteca','archivio','restauro','collezione','collezioni',
    'esposizione','pinacoteca','fondazione cultural','luoghi della cultura',
    'MiC','soprintendenza','UNESCO','audience','welfare cultural',
    'galleria d','allestiment','curatore','curatrice','museale','museali',
    'conservazione','catalogazione','digitalizzazione patrimonio'
  ];
  var blob = ((titolo || '') + ' ' + (testo || '')).toLowerCase();
  for (var i = 0; i < kw.length; i++) {
    if (blob.indexOf(kw[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

function scanSources() {
  _initLegacyConsts_(); // v4.22 — trigger entry point
  const SS=getMainSS();
  const fonti=getFeedSources('rss');  // FontiFeed: OFF=foglio Fonti (getFonti), ON=FontiFeed
  const sh=SS.getSheetByName(SH.ITEMS);
  const existing=getExistingURLs(sh);
  let added=0;
  // v4.25.9 — ANTI-TIMEOUT: la lista supera il limite GAS (6 min) e le fonti in
  // coda non venivano MAI scansionate ("Exceeded maximum execution time" su
  // Espoarte, 2026-07-06). Fix: (a) rotazione round-robin — ogni run riparte
  // dall'indice dove il precedente si è fermato (checkpoint in ScriptProperties);
  // (b) budget tempo 270s con stop PULITO (le stats della fonte corrente vengono
  // comunque scritte). In 2-3 run consecutivi tutte le fonti vengono coperte.
  const _props = PropertiesService.getScriptProperties();
  const _nF = fonti.length || 1;
  const _startIdx = Number(_props.getProperty('OC_SCAN_RR_IDX') || 0) % _nF;
  const _ordered = fonti.slice(_startIdx).concat(fonti.slice(0, _startIdx));
  const _T0 = Date.now(), _BUDGET_MS = 270000;
  let _processed = 0, _stopBudget = false;
  for(const fonte of _ordered) {
    if (Date.now() - _T0 > _BUDGET_MS) {
      _stopBudget = true;
      Logger.log('[scanSources] Budget tempo esaurito dopo ' + _processed + '/' + _nF +
        ' fonti — la prossima esecuzione riparte da "' + (fonte.Nome || '?') + '"');
      break;
    }
    _processed++;
    try {
      Logger.log(' Fonte: ' + fonte.Nome);
      const rssUrl = fonte.RSSURL || fonte.URL;
      if (!rssUrl) { Logger.log('  ! URL mancante, saltata'); continue; }
      const items = fetchRSS(rssUrl, fonte);
      if (!items.length) { Logger.log('  -> 0 item (feed vuoto o non valido)'); continue; }
      // v4.19.1 — Flag generalista: gate semantico per Sole/Repubblica
      const isGeneralista = FONTI_GENERALISTE.indexOf(fonte.Nome) !== -1;
      let nuovi = 0, scartati = 0;
      for(const item of items) {
        // v4.18.41 — Dedup at-source con URL canonicalizzato (rimuove utm_*, trailing slash, ecc.)
        const itemKey = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(item.url) : item.url;
        if(existing.has(itemKey)) continue;
        // v4.19.1 — Gate semantico: fonti generaliste → solo articoli cultura/musei
        if (isGeneralista && !passaFiltroCulturaMusei_(item.titolo, item.estratto)) {
          scartati++;
          continue;
        }
        Utilities.sleep(600);
        const ai = processWithAI(item.titolo, item.estratto, fonte.Ambito);
        saveItem(sh, item, fonte, ai);
        existing.add(itemKey);
        added++;
        nuovi++;
      }
      Logger.log('  OK ' + nuovi + ' nuovi / ' + items.length + ' trovati' + (scartati ? ' (' + scartati + ' off-topic scartati)' : ''));
      updateFeedSourceStats('rss', fonte, items.length>0?'OK':'EMPTY', items.length, '');
    } catch(err) {
      Logger.log('  ERR fonte "' + fonte.Nome + '": ' + err.message.substring(0,80));
    }
  }
  // v4.25.9 — checkpoint round-robin: il prossimo run riparte da dove ci si è fermati
  // (se il giro è completo, riparte dall'inizio: (start+processed) % n torna a start).
  _props.setProperty('OC_SCAN_RR_IDX', String((_startIdx + _processed) % _nF));
  Logger.log('[scanSources] Run: ' + _processed + '/' + _nF + ' fonti (da idx ' + _startIdx + ')' +
    (_stopBudget ? ' — INTERROTTO per budget, riprende automaticamente' : ' — giro completo') +
    ' · ' + added + ' item nuovi');
  return added;
}

function fetchRSS(url,fonte) {
  try {
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions:true, followRedirects:true, deadline:10,
      headers:{'User-Agent':'Mozilla/5.0 (compatible; Feedfetcher/4.0)'}
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('  ! HTTP ' + resp.getResponseCode() + ' per ' + url);
      return [];
    }
    const content = resp.getContentText('UTF-8');
    // Verifica che sia effettivamente XML/RSS e non HTML
    if (!content.includes('<?xml') && !content.includes('<rss') && !content.includes('<feed')) {
      Logger.log('  ! Non e un feed RSS valido: ' + url.substring(0,60));
      return [];
    }
    // Pulizia caratteri problematici che causano SAXParseException
    const xml = content
      .replace(/crossorigin="[^"]*"/g,'')
      .replace(/defer="[^"]*"/g,'')
      .replace(/\x00/g,'')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g,'');
    let doc, root, ns;
    try {
      doc = XmlService.parse(xml);
    } catch(parseErr) {
      Logger.log('  ! XML non valido (' + parseErr.message.substring(0,60) + '): ' + url.substring(0,50));
      return [];
    }
    root = doc.getRootElement();
    ns = root.getNamespace();
    let entries = [];
    const channel = root.getChild('channel') || root.getChild('channel',ns);
    if (channel) entries = channel.getChildren('item') || channel.getChildren('item',ns) || [];
    if (!entries.length) entries = root.getChildren('entry',ns) || root.getChildren('entry') || [];
    const items = [];
    for (const entry of entries.slice(0,8)) {
      const get = tag => { try { const el=entry.getChild(tag)||entry.getChild(tag,ns); return el?el.getValue().trim():''; } catch(e){return '';} };
      const titolo = get('title');
      const link = get('link') || get('id');
      const desc = get('description') || get('summary') || get('content');
      const pub = get('pubDate') || get('published') || get('updated');
      if (!titolo || !link) continue;
      // --- Estrazione immagine: enclosure → media:thumbnail → media:content → <img> nel desc ---
      let imgUrl = '';
      try {
        const encl = entry.getChild('enclosure') || entry.getChild('enclosure', ns);
        if (encl) {
          const encType = encl.getAttribute('type') ? encl.getAttribute('type').getValue() : '';
          if (!encType || encType.startsWith('image/')) {
            imgUrl = encl.getAttribute('url') ? encl.getAttribute('url').getValue() : '';
          }
        }
      } catch(eImg){}
      if (!imgUrl) {
        try {
          const mediaNs = XmlService.getNamespace('media','http://search.yahoo.com/mrss/');
          const mediaEl = entry.getChild('thumbnail',mediaNs) || entry.getChild('content',mediaNs);
          if (mediaEl) imgUrl = mediaEl.getAttribute('url') ? mediaEl.getAttribute('url').getValue() : '';
        } catch(eMedia){}
      }
      if (!imgUrl && desc) {
        const imgM = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgM) imgUrl = imgM[1];
      }
      items.push({
        titolo, url:link, imgUrl,
        estratto: desc.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').substring(0,600).trim(),
        data: pub ? new Date(pub) : new Date()
      });
    }
    return items;
  } catch(e) {
    Logger.log('  ! fetchRSS errore: ' + e.message.substring(0,80));
    return [];
  }
}

function processWithAI(titolo,estratto,ambito) {
  const ambitoDesc={1:'tendenze museali',2:'accessibilita museale',3:'mostre ed exhibition',4:'progetti culturali di comunita',5:'intelligenza artificiale per la cultura e i musei'};
  const prompt=`Sei esperto di museologia. Analizza per un professionista.
Ambito: ${ambitoDesc[ambito]||'cultura'}
Titolo: ${titolo}
Estratto: ${estratto.substring(0,500)}
Rispondi SOLO JSON (no markdown):
{"sommario":"2-3 frasi italiano max 300 caratteri","tag":["t1","t2","t3"],"score":4,"tipologia":"ricerca","regione":""}
Score 1-5. Tipologia: ricerca|evento|caso|bando. Regione: se il contenuto riguarda una regione italiana specifica scrivi il nome (es. "Puglia", "Toscana"), altrimenti stringa vuota.`;
  try {
    const resp=UrlFetchApp.fetch('https://api.anthropic.com/v1/messages',{
      method:'POST', deadline:30,
      headers:{'x-api-key':CLAUDE_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
      payload:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:350,messages:[{role:'user',content:prompt}]}),
      muteHttpExceptions:true
    });
    const data=JSON.parse(resp.getContentText());
    const parsed=JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
    return {sommario:parsed.sommario||estratto.substring(0,300),tag:parsed.tag||[],score:parsed.score||3,tipologia:parsed.tipologia||'ricerca',regione:parsed.regione||''};
  } catch(err) { return {sommario:estratto.substring(0,300),tag:[],score:2,tipologia:'ricerca',regione:''}; }
}

function saveItem(sh,item,fonte,ai) {
  const id='I'+Date.now()+'_'+Math.random().toString(36).substr(2,4);
  // v4.23 SICUREZZA — sanitizza i campi testuali da fonte esterna (RSS/AI) contro la formula injection
  // quando il foglio viene aperto dal titolare (=IMPORTXML, ecc.). Numeri/date/booleani restano intatti.
  sh.appendRow([id,fonte.Ambito,AMBITO_LABEL[fonte.Ambito]||'',_sanitizeForCell_(fonte.Nome),_sanitizeForCell_(item.url),_sanitizeForCell_(item.titolo),_sanitizeForCell_(item.estratto),_sanitizeForCell_(ai.sommario),'',
    _sanitizeForCell_((ai.tag||[]).join(', ')),ai.score||3,_sanitizeForCell_(ai.tipologia||'ricerca'),formatDate(item.data),formatDate(new Date()),'',false,false,false,false,_sanitizeForCell_(ai.regione||'')]);  // * InclusiNelDigest=false; col 20=Regione
}

/**
 * v4.18.41 — Set di URL già esistenti nel foglio, CANONICALIZZATI per dedup robusto.
 * Usa _canonicalUrl_ (Constants.js): rimuove protocol/www/trailing slash/utm/anchor.
 */
function getExistingURLs(sh) {
  const rows=sh.getDataRange().getValues(), h=rows[0], col=h.indexOf('FonteURL'), urls=new Set();
  for(let i=1;i<rows.length;i++) {
    if(rows[i][col]) {
      const canon = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(rows[i][col]) : String(rows[i][col]).trim();
      if (canon) urls.add(canon);
    }
  }
  return urls;
}

function updateFonteLastScan(SS,id,numItem) {
  const sh=SS.getSheetByName(SH.FONTI), rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), scanCol=h.indexOf('UltimaScansione'), numCol=h.indexOf('NumItemRaccolti');
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id){ sh.getRange(i+1,scanCol+1).setValue(new Date()); sh.getRange(i+1,numCol+1).setValue((rows[i][numCol]||0)+numItem); break; }
  }
}

/**
 * v4.19.1 — Popola retroattivamente la colonna Regione sulle news esistenti.
 * Usa regex locale (zero chiamate API) per estrarre la regione italiana
 * dal titolo + estratto + sommarioAI. Scrive solo nelle righe con Regione vuota.
 * Idempotente: può essere rieseguita senza danni.
 */
function backfillRegioneNews() {
  var ss = getMainSS();
  var sh = ss.getSheetByName('Items');
  if (!sh || sh.getLastRow() < 2) return { ok:true, totale:0, aggiornate:0, nonTrovate:0 };

  var data = sh.getDataRange().getValues();
  var head = data[0];
  var iTit = head.indexOf('Titolo');
  var iEstr = head.indexOf('Estratto');
  var iSomm = head.indexOf('SommarioAI');

  // Cerca o crea colonna Regione
  var iReg = head.indexOf('Regione');
  if (iReg === -1) {
    iReg = head.length;
    sh.getRange(1, iReg + 1).setValue('Regione');
    Logger.log('[backfillRegioneNews] Creata colonna Regione in posizione ' + (iReg+1));
  }

  var REGIONI = [
    'Abruzzo','Basilicata','Calabria','Campania','Emilia-Romagna','Emilia Romagna',
    'Friuli-Venezia Giulia','Friuli Venezia Giulia','Lazio','Liguria','Lombardia',
    'Marche','Molise','Piemonte','Puglia','Sardegna','Sicilia','Toscana',
    'Trentino-Alto Adige','Trentino Alto Adige','Umbria','Valle d\'Aosta','Veneto'
  ];
  var regNorm = REGIONI.map(function(r) { return { orig: r.replace(/Emilia.Romagna/i,'Emilia-Romagna').replace(/Friuli.Venezia.Giulia/i,'Friuli-Venezia Giulia').replace(/Trentino.Alto.Adige/i,'Trentino-Alto Adige'), low: r.toLowerCase() }; });
  var seen = {};
  regNorm = regNorm.filter(function(r) { if (seen[r.orig]) return false; seen[r.orig] = true; return true; });

  var aggiornate = 0, nonTrovate = 0;
  var updates = [];

  for (var r = 1; r < data.length; r++) {
    var existing = iReg < data[r].length ? String(data[r][iReg] || '').trim() : '';
    if (existing) continue;

    var testo = (String(data[r][iTit] || '') + ' ' + String(data[r][iEstr] || '') + ' ' + String(data[r][iSomm] || '')).toLowerCase();
    var found = '';
    for (var i = 0; i < regNorm.length; i++) {
      if (testo.indexOf(regNorm[i].low) !== -1) {
        found = regNorm[i].orig;
        break;
      }
    }
    if (found) {
      updates.push([r + 1, iReg + 1, found]);
      aggiornate++;
    } else {
      nonTrovate++;
    }
  }

  for (var u = 0; u < updates.length; u++) {
    sh.getRange(updates[u][0], updates[u][1]).setValue(updates[u][2]);
    if (u % 50 === 49) Utilities.sleep(200);
  }

  Logger.log('[backfillRegioneNews] Totale: ' + (data.length - 1) + ' righe, Aggiornate: ' + aggiornate + ', Non trovate: ' + nonTrovate);
  return { ok: true, totale: data.length - 1, aggiornate: aggiornate, nonTrovate: nonTrovate };
}

// ==================================================================
// ITEMS — read/filter/edit
// ==================================================================

function getItems(params) {
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  if(!sh) return {items:[],total:0};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  if(!h||h.length===0) return {items:[],total:0};
  const items=[];
  for(let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]) continue;
    const item={}; h.forEach((col,idx)=>{item[col]=r[idx];});
    if(params.ambito&&item.Ambito!=params.ambito) continue;
    if(params.score&&item.Score<parseInt(params.score)) continue;
    if(params.stato==='unread'&&item.Letto) continue;
    if(params.stato==='saved'&&!item.Salvato) continue;
    if(params.stato==='archived'&&!item.Archiviato) continue;
    if(params.stato==='digest'&&!item.InclusiNelDigest) continue;
    if(params.stato==='letti'&&!item.Letto) continue;
    if(!params.archived&&item.Archiviato&&params.stato!=='archived'&&params.stato!=='letti') continue;
    if(params.q) {
      const q=params.q.toLowerCase();
      if(!((item.Titolo||'').toLowerCase().includes(q)||(item.Fonte||'').toLowerCase().includes(q)||
           (item.TagAI||'').toLowerCase().includes(q)||(item.SommarioAI||'').toLowerCase().includes(q))) continue;
    }
    if(params.tipo&&item.Tipologia!==params.tipo) continue;
    if(item.SommarioEditato) item.SommarioAI=item.SommarioEditato;
    if(item.DataPubblicazione instanceof Date) item.DataPubblicazione=formatDate(item.DataPubblicazione);
    if(item.DataAcquisizione instanceof Date)  item.DataAcquisizione=formatDate(item.DataAcquisizione);
    if(item.Scadenza instanceof Date) item.Scadenza=formatDate(item.Scadenza);
    items.push(item);
  }
  items.sort((a,b)=>b.Score-a.Score||(a.Letto===b.Letto?0:a.Letto?1:-1));
  return {items, total:items.length};
}

function getItemsByIds(ids) {
  if(!ids||!ids.length) return [];
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const items=[];
  for(let i=1;i<rows.length;i++) {
    const r=rows[i]; if(!r[0]||!ids.includes(r[0])) continue;
    const item={}; h.forEach((col,idx)=>{item[col]=r[idx];});
    if(item.SommarioEditato) item.SommarioAI=item.SommarioEditato;
    if(item.DataPubblicazione instanceof Date) item.DataPubblicazione=formatDate(item.DataPubblicazione);
    if(item.Scadenza instanceof Date) item.Scadenza=formatDate(item.Scadenza);
    items.push(item);
  }
  return items;
}

function editSommario(body) {
  if(!body.id||!body.sommario) return {error:'Campi mancanti'};
  return setItemField(body.id,'SommarioEditato',body.sommario);
}

// ==================================================================
// SCANNER PODCAST DIRETTO — parse RSS 2.0 senza Claude API
// ==================================================================
function scanPodcastDiretto() {
  var SS;
  try {
    var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = SpreadsheetApp.getActiveSpreadsheet() || (sheetId ? SpreadsheetApp.openById(sheetId) : null);
  } catch(e) {
    var sid2 = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = sid2 ? SpreadsheetApp.openById(sid2) : null;
  }
  if (!SS) { Logger.log('ERR scanPodcastDiretto: nessun foglio'); return 0; }

  var shPod = SS.getSheetByName('Podcast');
  if (!shPod) {
    shPod = SS.insertSheet('Podcast');
    var h2 = ['ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata','DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte','Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord'];
    shPod.getRange(1,1,1,h2.length).setValues([h2]).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    shPod.setFrozenRows(1);
  }

  // v4.18.41 — Dedup via URL canonicalizzato
  var existing = new Set();
  if (shPod.getLastRow() > 1) {
    shPod.getRange(2, 9, shPod.getLastRow()-1, 1).getValues().forEach(function(r){
      if (r[0]) {
        var k = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(r[0]) : String(r[0]).trim();
        if (k) existing.add(k);
      }
    });
  }

  var oggi = new Date();
  var settimanaAnno = getWeekNumberBandi(oggi);
  var totalNuovi = 0;

  var tutteLeFonti = getFeedSources('podcast').filter(function(f){ return f.priorita !== 2 || settimanaAnno % 2 === 0; });

  // v4.28.11 — ROTAZIONE A BUDGET. Le fonti podcast sono passate da 12 a 97
  // (migrazione del 02/08): una scansione sequenziale con attesa fra una fonte
  // e l'altra non sta nei 6 minuti di GAS e morirebbe PRIMA di arrivare ai
  // video. Ogni run copre una fetta partendo da dove si era fermato il run
  // precedente; il checkpoint garantisce che nel giro di pochi run tutte le
  // fonti siano coperte, senza che nessuna resti sistematicamente scoperta.
  var _t0Pod = Date.now();
  var _budgetPod = (typeof scanPodcastDiretto.budgetMs === 'number') ? scanPodcastDiretto.budgetMs : 180000;
  var _propsPod = PropertiesService.getScriptProperties();
  var _idxPod = Number(_propsPod.getProperty('OC_POD_RR_IDX') || 0);
  if (_idxPod >= tutteLeFonti.length) _idxPod = 0;
  var _ordinate = tutteLeFonti.slice(_idxPod).concat(tutteLeFonti.slice(0, _idxPod));
  var _esaminate = 0;
  tutteLeFonti = _ordinate;

  Logger.log('scanPodcastDiretto: ' + tutteLeFonti.length + ' fonti, riparto da indice ' + _idxPod);

  // v4.25 — Rimosso raiplaysound.it dalla blocklist (feed RSS funzionanti, molti contenuti culturali)
  var SKIP_DOMAINS = ['feeds.spreaker.com/user'];

  tutteLeFonti.forEach(function(fonte) {
    // budget: quando scade si esce e il prossimo run riparte da qui
    if (Date.now() - _t0Pod > _budgetPod) return;
    _esaminate++;
    var skipThis = SKIP_DOMAINS.some(function(d) { return fonte.url.indexOf(d) !== -1; });
    if (skipThis) { Logger.log(' SKIP (dominio bloccato): ' + fonte.nome + ' — ' + fonte.url); return; }
    try {
      Logger.log(' PodcastDiretto: ' + fonte.nome);
      var resp = UrlFetchApp.fetch(fonte.url, {
        muteHttpExceptions: true, followRedirects: true, deadline: 10,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioRadar/4.0)' }
      });
      if (resp.getResponseCode() !== 200) {
        Logger.log('  ! HTTP ' + resp.getResponseCode());
        // v4.28.11 — l'esito si REGISTRA sempre: senza questo una fonte in
        // errore resta indistinguibile da una che non è mai stata guardata
        _podStat_(fonte, 'HTTP_' + resp.getResponseCode(), 0, 'HTTP ' + resp.getResponseCode());
        return;
      }
      var xml = resp.getContentText().slice(0, 100000);
      var items = _parseRSSItems_(xml);
      if (!items.length) { Logger.log('  -> 0 episodi'); _podStat_(fonte, 'NON_RSS', 0, 'nessun item nel feed'); return; }
      var nuovi = 0;
      items.slice(0, 20).forEach(function(ep) {
        if (!ep.titolo) return;
        var link = ep.link || '';
        var epKey = link ? ((typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(link) : link) : '';
        if (epKey && existing.has(epKey)) return;
        var id = 'POD' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
        shPod.appendRow([
          id, new Date(), ep.titolo, fonte.nome, ep.autore||fonte.nome,
          fonte.tematica||'Musei & Patrimonio', ep.durata||'',
          ep.data ? new Date(ep.data) : '', link,
          ep.sommario||'', '', 3, fonte.nome,
          false, false, false, 'attivo'
        ]);
        if (epKey) existing.add(epKey);
        nuovi++;
        Utilities.sleep(50);
      });
      Logger.log('  -> ' + nuovi + ' nuovi da ' + fonte.nome);
      _podStat_(fonte, nuovi > 0 ? 'OK' : 'EMPTY', nuovi, '');
      totalNuovi += nuovi;
    } catch(e) {
      Logger.log('  ERR ' + fonte.nome + ': ' + e.message);
      _podStat_(fonte, 'ERROR', 0, e.message);
    }
    Utilities.sleep(300);
  });

  // checkpoint per il run successivo
  _propsPod.setProperty('OC_POD_RR_IDX', String((_idxPod + _esaminate) % Math.max(1, _ordinate.length)));
  Logger.log('=== scanPodcastDiretto: ' + totalNuovi + ' nuovi episodi da ' + _esaminate + '/' +
             _ordinate.length + ' fonti esaminate (checkpoint salvato) ===');
  return totalNuovi;
}

/** v4.28.11 — registra l'esito di scansione di una fonte podcast/video. */
function _podStat_(fonte, esito, nRecord, errore) {
  try {
    if (typeof updateFeedSourceStats === 'function') {
      updateFeedSourceStats(fonte.tipo === 'video' ? 'video' : 'podcast', fonte, esito, nRecord, errore);
    }
  } catch (e) { Logger.log('  [stat] ' + e.message); }
}

// ==================================================================
// SCANNER VIDEO YOUTUBE
// ==================================================================
function scanVideoYoutube() {
  var SS;
  try {
    var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = SpreadsheetApp.getActiveSpreadsheet() || (sheetId ? SpreadsheetApp.openById(sheetId) : null);
  } catch(e) {
    var sid = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    SS = sid ? SpreadsheetApp.openById(sid) : null;
  }
  if (!SS) { Logger.log('ERR scanVideoYoutube: nessun foglio'); return 0; }

  var shPod = SS.getSheetByName('Podcast');
  if (!shPod) {
    shPod = SS.insertSheet('Podcast');
    var h = ['ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata','DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte','Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord'];
    shPod.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    shPod.setFrozenRows(1);
  }

  // v4.18.41 — Dedup via URL canonicalizzato
  var existing = new Set();
  if (shPod.getLastRow() > 1) {
    shPod.getRange(2, 9, shPod.getLastRow()-1, 1).getValues().forEach(function(r){
      if (r[0]) {
        var k = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(r[0]) : String(r[0]).trim();
        if (k) existing.add(k);
      }
    });
  }

  var fontiVideo = getFeedSources('video');
  if (!fontiVideo.length) {
    Logger.log('scanVideoYoutube: nessuna fonte video');
    return 0;
  }
  // v4.28.11 — stessa rotazione a budget dei podcast (da 0 a 27 canali)
  var _t0Vid = Date.now();
  var _budgetVid = (typeof scanVideoYoutube.budgetMs === 'number') ? scanVideoYoutube.budgetMs : 120000;
  var _propsVid = PropertiesService.getScriptProperties();
  var _idxVid = Number(_propsVid.getProperty('OC_VID_RR_IDX') || 0);
  if (_idxVid >= fontiVideo.length) _idxVid = 0;
  fontiVideo = fontiVideo.slice(_idxVid).concat(fontiVideo.slice(0, _idxVid));
  var _esamVid = 0;

  Logger.log('scanVideoYoutube: ' + fontiVideo.length + ' canali, riparto da indice ' + _idxVid);

  var totalNuovi = 0;
  fontiVideo.forEach(function(fonte) {
    if (Date.now() - _t0Vid > _budgetVid) return;
    _esamVid++;
    try {
      Logger.log(' Video: ' + fonte.nome);
      var resp = UrlFetchApp.fetch(fonte.url, {
        muteHttpExceptions: true, followRedirects: true, deadline: 10,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioRadar/4.0)' }
      });
      if (resp.getResponseCode() !== 200) {
        Logger.log('  ! HTTP ' + resp.getResponseCode() + ' per ' + fonte.url);
        _podStat_({ nome: fonte.nome, urlFeed: fonte.url || fonte.urlFeed, tipo: 'video', ID: fonte.id },
                  'HTTP_' + resp.getResponseCode(), 0, 'HTTP ' + resp.getResponseCode());
        return;
      }
      var xml = resp.getContentText().slice(0, 80000);
      var entries = _parseYoutubeAtom_(xml);
      if (!entries.length) {
        Logger.log('  -> 0 video estratti');
        _podStat_({ nome: fonte.nome, urlFeed: fonte.url || fonte.urlFeed, tipo: 'video', ID: fonte.id },
                  'NON_ATOM', 0, 'feed non parsabile come Atom YouTube');
        return;
      }
      var nuovi = 0;
      entries.forEach(function(v) {
        if (!v.titolo || !v.link) return;
        var vKey = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(v.link) : v.link;
        if (existing.has(vKey)) return;
        var id = 'VID' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
        shPod.appendRow([
          id, new Date(), v.titolo, fonte.nome, v.autore||fonte.nome,
          fonte.tematica, '',
          v.data ? new Date(v.data) : '',
          v.link, '', '', 3,
          fonte.nome, false, false, false, 'attivo'
        ]);
        existing.add(vKey);
        nuovi++;
        Utilities.sleep(50);
      });
      Logger.log('  -> ' + nuovi + ' nuovi video da ' + fonte.nome);
      _podStat_({ nome: fonte.nome, urlFeed: fonte.url || fonte.urlFeed, tipo: 'video', ID: fonte.id },
                nuovi > 0 ? 'OK' : 'EMPTY', nuovi, '');
      totalNuovi += nuovi;
    } catch(e) {
      Logger.log('  ERR ' + fonte.nome + ': ' + e.message);
      _podStat_({ nome: fonte.nome, urlFeed: fonte.url || fonte.urlFeed, tipo: 'video', ID: fonte.id },
                'ERROR', 0, e.message);
    }
    Utilities.sleep(500);
  });

  _propsVid.setProperty('OC_VID_RR_IDX', String((_idxVid + _esamVid) % Math.max(1, fontiVideo.length)));
  Logger.log('=== scanVideoYoutube: ' + totalNuovi + ' nuovi video da ' + _esamVid + '/' +
             fontiVideo.length + ' canali (checkpoint salvato) ===');
  return totalNuovi;
}

// ==================================================================
// XML/RSS Parsers
// ==================================================================

// Parser Atom YouTube — estrae titolo, link, data, autore da ogni <entry>
function _parseYoutubeAtom_(xml) {
  var entries = [];
  var entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  var match;
  while ((match = entryRe.exec(xml)) !== null) {
    var block = match[1];
    var titolo = _xmlText_(block, 'title') || _xmlText_(block, 'media:title') || '';
    var link = '';
    var lm = block.match(/rel=["']alternate["'][^>]*href=["']([^"']+)["']/) ||
             block.match(/href=["']([^"']+)["'][^>]*rel=["']alternate["']/);
    if (lm) link = lm[1];
    if (!link) {
      var vidId = block.match(/yt:videoId>(.*?)<\/yt:videoId>/i);
      if (vidId) link = 'https://www.youtube.com/watch?v=' + vidId[1].trim();
    }
    var data = _xmlText_(block, 'published') || _xmlText_(block, 'updated') || '';
    var autore = _xmlText_(block, 'name') || '';
    if (titolo && link) entries.push({ titolo: titolo, link: link, data: data, autore: autore });
  }
  return entries;
}

function _xmlText_(block, tag) {
  var m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim() : '';
}

// Parser RSS 2.0 standard — estrae titolo, link, data, autore, durata, sommario da ogni <item>
function _parseRSSItems_(xml) {
  var items = [];
  var itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  var match;
  while ((match = itemRe.exec(xml)) !== null) {
    var block = match[1];
    var titolo = _xmlText_(block, 'title') || '';
    var link = _xmlText_(block, 'link') || '';
    if (!link) {
      var em = block.match(/enclosure[^>]+url=["']([^"']+)["']/i);
      if (em) link = em[1];
    }
    link = link.replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    var dataTxt = _xmlText_(block, 'pubDate') || _xmlText_(block, 'published') || '';
    var durata = _xmlText_(block, 'itunes:duration') || '';
    var autore = _xmlText_(block, 'itunes:author') || _xmlText_(block, 'author') || '';
    var sommario = (_xmlText_(block, 'itunes:summary') || _xmlText_(block, 'description') || '').slice(0, 300);
    var dataObj = null;
    if (dataTxt) {
      try { dataObj = new Date(dataTxt); if (isNaN(dataObj.getTime())) dataObj = null; } catch(e2) {}
    }
    if (titolo) items.push({ titolo: titolo, link: link, data: dataObj, autore: autore, durata: durata, sommario: sommario });
  }
  return items;
}
