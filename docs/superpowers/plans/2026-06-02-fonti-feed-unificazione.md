# Unificazione Fonti Feed (News + Podcast + Video) — Implementation Plan (rev. 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Steps usano checkbox (`- [ ]`).

**Goal:** Unificare in un unico foglio `FontiFeed` le fonti di News/RSS + Podcast + Video (oggi sparse tra il foglio `Fonti`, l'array hardcoded `FONTI_PODCAST` e il foglio `FontiPodcast`), lette/scritte tramite adattatori controllati da **flag per-tipo** reversibili, senza modificare il comportamento dell'app finché i flag non vengono accesi.

**Architecture:** Tutto il nuovo codice in `FontiFeed.js`. Gli scanner esistenti (`scanSources`, `scanPodcastDiretto`, `scanVideoYoutube`) cambiano SOLO la riga di acquisizione fonti, chiamando `getFeedSources(tipo)`. L'adattatore, con flag OFF, replica esattamente la sorgente attuale di ciascun tipo; con flag ON legge `FontiFeed`. Sorgenti legacy mai cancellate.

**Tech Stack:** Google Apps Script (V8), Google Sheets, clasp. Nessun runner CLI: i "test" sono funzioni GAS `_test_*_()` che loggano PASS/FAIL, eseguite dall'editor GAS dopo `clasp push`.

**Spec:** `docs/superpowers/specs/2026-06-02-fonti-feed-unificazione-design.md`

---

## Come si "eseguono i test" (leggere prima)
Per ogni test: `clasp push` → editor GAS → esegui la funzione `_test_*_` → leggi **Esecuzioni/Log** → deve comparire `PASS`. Mini-assert definito in Task 1 (logga, non lancia).

## Forma degli oggetti fonte (contratto chiave)
`getFeedSources(tipo)` ritorna oggetti con **entrambi i set di alias**, così gli scanner non cambiano i loro loop:
- news (`scanSources`) usa: `.ID .Nome .RSSURL .URL .Ambito .Attiva`
- podcast/video (`scanPodcastDiretto`/`scanVideoYoutube`) usano: `.nome .url .tematica .priorita`

## Struttura file
| File | Azione | Responsabilità |
|---|---|---|
| `FontiFeed.js` | **Create** | schema, flag per-tipo, helper URL, lettori legacy, migrazione, adattatori, verifica, test |
| `Codice.js` | Modify | `scanSources` (~2363/2394), `scanPodcastDiretto` (~1180-1201), `scanVideoYoutube` (~1035-1058) |
| `Fonti_v1.js` | Modify | `FU_SHEETS` += `feed` |

---

## Task 0: Sicurezza (GIÀ ESEGUITO)
Branch `feat/fonti-feed-unificazione` creato; spec+piano committati (commit `60a4014`). Backup manuale fogli `Fonti` e `FontiPodcast` da fare in Sheets prima della Fase di rollout (Task 12).

---

## Task 1: `FontiFeed.js` — schema, flag per-tipo, mini-assert

**Files:** Create `FontiFeed.js`

- [ ] **Step 1: Creare il file**

```javascript
/**
 * FontiFeed.js — Archivio unico fonti feed (News/RSS + Podcast + Video).
 * Spec: docs/superpowers/specs/2026-06-02-fonti-feed-unificazione-design.md
 * Flag PER-TIPO: USE_FONTI_FEED_RSS / _PODCAST / _VIDEO. OFF = legacy, ON = FontiFeed.
 */
var FONTIFEED_SHEET = 'FontiFeed';
var FONTIFEED_HEADERS = [
  'ID','Nome','Gruppo','Tipo','URL_Feed','URL_Sito','Ambito','AmbitoLabel',
  'Dimensioni','Categoria','Priorita','Attiva','DataAggiunta','UltimaScan',
  'UltimoEsito','NRecordTotali','NRecordUltimo','FailConsecutivi','UltimoErrore','Note'
];
var FONTIFEED_FLAG_PROPS = {
  rss:'USE_FONTI_FEED_RSS', podcast:'USE_FONTI_FEED_PODCAST', video:'USE_FONTI_FEED_VIDEO'
};
function isFontiFeedEnabled_(tipo) {
  var p = FONTIFEED_FLAG_PROPS[String(tipo).toLowerCase()];
  if (!p) return false;
  return String(PropertiesService.getScriptProperties().getProperty(p)) === 'true';
}
function enableFontiFeed(tipo)  { var p=FONTIFEED_FLAG_PROPS[String(tipo).toLowerCase()]; if(p){PropertiesService.getScriptProperties().setProperty(p,'true');  Logger.log(p+' = true');} }
function disableFontiFeed(tipo) { var p=FONTIFEED_FLAG_PROPS[String(tipo).toLowerCase()]; if(p){PropertiesService.getScriptProperties().setProperty(p,'false'); Logger.log(p+' = false');} }
function disableAllFontiFeed()  { ['rss','podcast','video'].forEach(disableFontiFeed); }

function _ffAssert_(cond, msg) { Logger.log((cond?'PASS':'FAIL')+' — '+msg); return !!cond; }

// Forma standard con alias news + podcast (vedi contratto nel piano)
function _ffShape_(o) {
  o = o || {};
  var attiva = o.attiva !== false;
  return {
    id:o.id||'', nome:o.nome||'', gruppo:o.gruppo||'', tipo:o.tipo||'',
    urlFeed:o.urlFeed||'', urlSito:o.urlSito||'', ambito:o.ambito||'',
    categoria:o.categoria||'', priorita:Number(o.priorita)||1, attiva:attiva,
    // alias news (scanSources)
    ID:o.id||'', Nome:o.nome||'', RSSURL:o.urlFeed||'', URL:o.urlSito||o.urlFeed||'', Ambito:o.ambito||'', Attiva:attiva,
    // alias podcast/video
    url:o.urlFeed||'', tematica:o.categoria||''
  };
}
```

- [ ] **Step 2: Test flag per-tipo**

```javascript
function _test_ffFlags_() {
  disableAllFontiFeed();
  _ffAssert_(isFontiFeedEnabled_('rss')===false, 'rss parte OFF');
  enableFontiFeed('rss');
  _ffAssert_(isFontiFeedEnabled_('rss')===true,  'rss ON dopo enable');
  _ffAssert_(isFontiFeedEnabled_('podcast')===false, 'podcast resta OFF (indipendente)');
  disableAllFontiFeed();
  _ffAssert_(isFontiFeedEnabled_('rss')===false, 'tutti OFF a fine test');
}
```

- [ ] **Step 3: `clasp push`, esegui `_test_ffFlags_` → 4 PASS.**
- [ ] **Step 4: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): FontiFeed schema + flag per-tipo + _ffShape_/_ffAssert_"
```

---

## Task 2: `_normalizeFeedUrl_` (puro, TDD)

**Files:** Modify `FontiFeed.js`

- [ ] **Step 1: Test**

```javascript
function _test_normalizeFeedUrl_() {
  _ffAssert_(_normalizeFeedUrl_('https://Site.it/Feed/')==='site.it/feed','protocollo+lowercase+slash');
  _ffAssert_(_normalizeFeedUrl_('http://www.site.it/feed')==='site.it/feed','www+http');
  _ffAssert_(_normalizeFeedUrl_('  https://site.it/feed?x=1 ')==='site.it/feed','trim+query');
  _ffAssert_(_normalizeFeedUrl_('')==='','vuoto');
}
```

- [ ] **Step 2: `clasp push`, esegui → FAIL ("non definita").**
- [ ] **Step 3: Implementare**

```javascript
function _normalizeFeedUrl_(url) {
  var s = String(url||'').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//,'').replace(/^www\./,'');
  s = s.split('?')[0].split('#')[0];
  return s.replace(/\/+$/,'');
}
```

- [ ] **Step 4: `clasp push`, esegui → 4 PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat(fonti): _normalizeFeedUrl_"`

---

## Task 3: `ensureFontiFeedSheet_()` idempotente

**Files:** Modify `FontiFeed.js`

- [ ] **Step 1: Implementare**

```javascript
function ensureFontiFeedSheet_() {
  var ss = (typeof getMainSS==='function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FONTIFEED_SHEET);
    sh.getRange(1,1,1,FONTIFEED_HEADERS.length).setValues([FONTIFEED_HEADERS])
      .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2,200); sh.setColumnWidth(3,140); sh.setColumnWidth(5,320);
    Logger.log('FontiFeed creato ('+FONTIFEED_HEADERS.length+' colonne)');
  }
  return sh;
}
```

- [ ] **Step 2: Test idempotenza**

```javascript
function _test_ensureFontiFeedSheet_() {
  ensureFontiFeedSheet_(); ensureFontiFeedSheet_();
  var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
  var n=ss.getSheets().filter(function(s){return s.getName()===FONTIFEED_SHEET;}).length;
  _ffAssert_(n===1,'un solo foglio FontiFeed');
  var hdr=ss.getSheetByName(FONTIFEED_SHEET).getRange(1,1,1,20).getValues()[0];
  _ffAssert_(hdr[0]==='ID'&&hdr[4]==='URL_Feed'&&hdr[19]==='Note','header corretti');
}
```

- [ ] **Step 3: `clasp push`, esegui → 2 PASS (compare la scheda FontiFeed).**
- [ ] **Step 4: Commit** `git commit -am "feat(fonti): ensureFontiFeedSheet_ idempotente"`

---

## Task 4: Lettori legacy + migrazione `migraFontiFeed()`

**Files:** Modify `FontiFeed.js`

**Sorgenti reali (verificate):** News←`Fonti`; Podcast←array `FONTI_PODCAST` (Scannerbandi.js) + `FontiPodcast`(TipoContenuto audio/vuoto); Video←`FontiPodcast`(TipoContenuto video).

- [ ] **Step 1: Lettore foglio `Fonti` (news)**

```javascript
function _ffReadFonti_() {
  var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('Fonti'); if(!sh) return [];
  var v=sh.getDataRange().getValues(); if(v.length<2) return [];
  var h=v[0].map(function(x){return String(x||'').trim();});
  function c(n){return h.indexOf(n);}
  var iId=c('ID'),iNome=c('Nome'),iUrl=c('URL'),iRss=c('RSSURL'),iAmb=c('Ambito'),
      iAmbL=c('AmbitoLabel'),iAtt=c('Attiva'),iScan=c('UltimaScansione'),iNum=c('NumItemRaccolti');
  var out=[];
  for(var r=1;r<v.length;r++){ var row=v[r]; if(iId>=0&&!row[iId])continue;
    var nome=String(row[iNome]||'').trim();
    out.push({ nome:nome, gruppo:nome.split(/[—\-|:]/)[0].trim()||nome, tipo:'rss',
      urlFeed:String((iRss>=0?row[iRss]:'')||'').trim()||String((iUrl>=0?row[iUrl]:'')||'').trim(),
      urlSito:String((iUrl>=0?row[iUrl]:'')||'').trim(), ambito:iAmb>=0?row[iAmb]:'',
      ambitoLabel:iAmbL>=0?row[iAmbL]:'', categoria:'', priorita:2,
      attiva:String((iAtt>=0?row[iAtt]:'')).toUpperCase()==='TRUE'||row[iAtt]===true,
      ultimaScan:iScan>=0?row[iScan]:'', nRecTot:Number((iNum>=0?row[iNum]:0)||0), note:'' });
  }
  return out;
}
```

- [ ] **Step 2: Lettore foglio `FontiPodcast` filtrato per TipoContenuto**

```javascript
// wanted: 'audio' (include vuoto) | 'video'
function _ffReadFontiPodcast_(wanted) {
  var sh = (typeof _getFontiPodSheet==='function') ? _getFontiPodSheet() : null;
  if (!sh) { var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet(); sh=ss.getSheetByName('FontiPodcast'); }
  if (!sh || sh.getLastRow()<2) return [];
  var v=sh.getDataRange().getValues(); var h=v[0].map(function(x){return String(x||'').trim();});
  function c(n){return h.indexOf(n);}
  var iNome=c('Nome'),iUrl=c('URL_RSS'),iTema=c('Tematica'),iAtt=c('Attiva'),iTipo=c('TipoContenuto'),iScan=c('UltimaScan'),iNum=c('NumEpisodi');
  var out=[];
  for(var r=1;r<v.length;r++){ var row=v[r]; if(iUrl<0||!row[iUrl])continue;
    var tipoC=iTipo>=0?String(row[iTipo]||'').toLowerCase():'';
    var match = (wanted==='video') ? (tipoC==='video') : (tipoC==='audio'||tipoC==='');
    if(!match) continue;
    out.push({ nome:String(row[iNome]||''), gruppo:String(row[iNome]||''),
      tipo: wanted==='video'?'video':'podcast', urlFeed:String(row[iUrl]||'').trim(), urlSito:'',
      ambito:'', categoria:String(iTema>=0?row[iTema]:''), priorita:1,
      attiva: !(row[iAtt]===false||String(row[iAtt]).toLowerCase()==='false'),
      ultimaScan:iScan>=0?row[iScan]:'', nRecTot:Number((iNum>=0?row[iNum]:0)||0), note:'' });
  }
  return out;
}
```

- [ ] **Step 3: Lettore array `FONTI_PODCAST`**

```javascript
function _ffReadPodcastArray_() {
  if (typeof FONTI_PODCAST === 'undefined') return [];
  return FONTI_PODCAST.map(function(f){
    return { nome:f.nome, gruppo:f.nome, tipo:'podcast', urlFeed:f.url, urlSito:'',
      ambito:'', categoria:f.tematica||'', priorita:Number(f.priorita)||1, attiva:true, ultimaScan:'', nRecTot:0, note:'' };
  });
}
```

- [ ] **Step 4: `migraFontiFeed()`**

```javascript
function migraFontiFeed() {
  var sh = ensureFontiFeedSheet_();
  var h = sh.getRange(1,1,1,FONTIFEED_HEADERS.length).getValues()[0];
  var iFeed = h.indexOf('URL_Feed');
  var existing = {};
  var cur = sh.getDataRange().getValues();
  for (var r=1;r<cur.length;r++){ var k=_normalizeFeedUrl_(cur[r][iFeed]); if(k) existing[k]=true; }
  var legacy = _ffReadFonti_()
    .concat(_ffReadPodcastArray_())
    .concat(_ffReadFontiPodcast_('audio'))
    .concat(_ffReadFontiPodcast_('video'));
  var added=0, dup=0, silenti=0;
  legacy.forEach(function(f){
    var key=_normalizeFeedUrl_(f.urlFeed); if(!key){return;}
    if(existing[key]){ dup++; return; }
    existing[key]=true;
    if(f.nRecTot===0) silenti++;
    var o={ ID:'FF'+Date.now()+'_'+Math.random().toString(36).substr(2,4), Nome:f.nome, Gruppo:f.gruppo,
      Tipo:f.tipo, URL_Feed:f.urlFeed, URL_Sito:f.urlSito||'', Ambito:f.ambito||'', AmbitoLabel:f.ambitoLabel||'',
      Dimensioni:'', Categoria:f.categoria||'', Priorita:f.priorita||2, Attiva:f.attiva, DataAggiunta:new Date(),
      UltimaScan:f.ultimaScan||'', UltimoEsito:'', NRecordTotali:f.nRecTot||0, NRecordUltimo:0, FailConsecutivi:0, UltimoErrore:'', Note:f.note||'' };
    sh.appendRow(FONTIFEED_HEADERS.map(function(c){ return o[c]!==undefined?o[c]:''; }));
    added++;
  });
  var rep={ migrate:added, doppioniSaltati:dup, silentiZeroRecord:silenti };
  Logger.log('migraFontiFeed: '+JSON.stringify(rep));
  return rep;
}
```

- [ ] **Step 5: Test migrazione + idempotenza**

```javascript
function _test_migraFontiFeed_() {
  var r1=migraFontiFeed(); _ffAssert_(r1.migrate>0,'prima migrazione >0 (migrate='+r1.migrate+')');
  var r2=migraFontiFeed(); _ffAssert_(r2.migrate===0,'seconda non duplica (migrate='+r2.migrate+')');
}
```

- [ ] **Step 6: `clasp push`, esegui → 2 PASS.** Controlla FontiFeed: presenti righe `rss`, `podcast`, `video`.
- [ ] **Step 7: Commit** `git commit -am "feat(fonti): lettori legacy (Fonti, FontiPodcast, array) + migraFontiFeed 3 tipi"`

---

## Task 5: Adattatore lettura `getFeedSources(tipo)`

**Files:** Modify `FontiFeed.js`

- [ ] **Step 1: Lettore da FontiFeed (ON)**

```javascript
function _ffReadFromFeed_(tipo) {
  var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(FONTIFEED_SHEET); if(!sh) return [];
  var v=sh.getDataRange().getValues(); if(v.length<2) return [];
  var h=v[0]; function c(n){return h.indexOf(n);}
  var iId=c('ID'),iNome=c('Nome'),iGr=c('Gruppo'),iTipo=c('Tipo'),iFeed=c('URL_Feed'),
      iSito=c('URL_Sito'),iAmb=c('Ambito'),iCat=c('Categoria'),iPri=c('Priorita'),iAtt=c('Attiva');
  var out=[];
  for(var r=1;r<v.length;r++){ var row=v[r]; if(!row[iId])continue;
    if(String(row[iTipo]).toLowerCase()!==tipo)continue;
    if(!(row[iAtt]===true||String(row[iAtt]).toUpperCase()==='TRUE'))continue;
    out.push(_ffShape_({ id:row[iId],nome:row[iNome],gruppo:row[iGr],tipo:tipo,
      urlFeed:row[iFeed],urlSito:row[iSito],ambito:row[iAmb],categoria:row[iCat],priorita:row[iPri],attiva:true }));
  }
  return out;
}
```

- [ ] **Step 2: `getFeedSources(tipo)` con OFF=legacy per tipo**

```javascript
function getFeedSources(tipo) {
  tipo = String(tipo||'rss').toLowerCase();
  if (isFontiFeedEnabled_(tipo)) return _ffReadFromFeed_(tipo);
  // OFF — replica la sorgente attuale del tipo
  if (tipo==='rss') {
    return (typeof getFonti==='function') ? getFonti().fonti.filter(function(f){return f.Attiva;}) : [];
  }
  if (tipo==='podcast') {
    var out = _ffReadPodcastArray_().map(_ffShape_);
    _ffReadFontiPodcast_('audio').forEach(function(o){
      var k=_normalizeFeedUrl_(o.urlFeed);
      if(out.some(function(x){return _normalizeFeedUrl_(x.urlFeed)===k;}))return;
      out.push(_ffShape_(o));
    });
    return out;
  }
  if (tipo==='video') {
    return _ffReadFontiPodcast_('video').map(_ffShape_);
  }
  return [];
}
```

- [ ] **Step 3: Test OFF coincide col legacy (per i 3 tipi)**

```javascript
function _test_getFeedSources_off_() {
  disableAllFontiFeed();
  var rss = getFeedSources('rss').length;
  var rssLegacy = (typeof getFonti==='function') ? getFonti().fonti.filter(function(f){return f.Attiva;}).length : -1;
  _ffAssert_(rss===rssLegacy, 'rss OFF: '+rss+'=='+rssLegacy);
  _ffAssert_(getFeedSources('podcast').length>0, 'podcast OFF ritorna fonti (array+foglio)');
  _ffAssert_(getFeedSources('video').length>=0, 'video OFF ritorna lista');
}
```

- [ ] **Step 4: `clasp push`, esegui → 3 PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat(fonti): getFeedSources adapter (OFF=legacy per tipo, ON=FontiFeed)"`

---

## Task 6: Adattatore scrittura `updateFeedSourceStats(...)`

**Files:** Modify `FontiFeed.js`

- [ ] **Step 1: Implementare**

```javascript
/**
 * tipo: 'rss'|'podcast'|'video'. OFF: news → updateFonteLastScan; podcast/video → no-op
 * (la logica contatori legacy esistente resta invariata). ON: scrive su FontiFeed.
 */
function updateFeedSourceStats(tipo, fonte, esito, nRecord, errore) {
  tipo=String(tipo||'rss').toLowerCase(); nRecord=Number(nRecord||0);
  esito = esito || (nRecord>0?'OK':'EMPTY');
  if (!isFontiFeedEnabled_(tipo)) {
    if (tipo==='rss' && typeof updateFonteLastScan==='function' && fonte && fonte.ID) {
      var SS=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
      try { updateFonteLastScan(SS, fonte.ID, nRecord); } catch(e){}
    }
    return; // podcast/video OFF: no-op (non cambia il comportamento attuale)
  }
  var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(FONTIFEED_SHEET); if(!sh) return;
  var v=sh.getDataRange().getValues(); var h=v[0]; function c(n){return h.indexOf(n);}
  var iId=c('ID'),iFeed=c('URL_Feed'),iScan=c('UltimaScan'),iEsito=c('UltimoEsito'),
      iTot=c('NRecordTotali'),iUlt=c('NRecordUltimo'),iFail=c('FailConsecutivi'),iErr=c('UltimoErrore');
  var keyId = fonte&&fonte.id?String(fonte.id):(fonte&&fonte.ID?String(fonte.ID):'');
  var keyFeed = _normalizeFeedUrl_(fonte&&(fonte.urlFeed||fonte.RSSURL||fonte.url));
  for(var r=1;r<v.length;r++){
    var hit=(keyId&&String(v[r][iId])===keyId)||(keyFeed&&_normalizeFeedUrl_(v[r][iFeed])===keyFeed);
    if(!hit)continue;
    var rr=r+1;
    sh.getRange(rr,iScan+1).setValue(new Date());
    sh.getRange(rr,iEsito+1).setValue(esito);
    sh.getRange(rr,iTot+1).setValue(Number(v[r][iTot]||0)+nRecord);
    sh.getRange(rr,iUlt+1).setValue(nRecord);
    sh.getRange(rr,iFail+1).setValue(esito==='OK'?0:Number(v[r][iFail]||0)+1);
    if(errore) sh.getRange(rr,iErr+1).setValue(String(errore).substring(0,120));
    return;
  }
}
```

- [ ] **Step 2: Test (flag podcast ON, poi rollback)**

```javascript
function _test_updateFeedSourceStats_() {
  enableFontiFeed('podcast');
  var src=getFeedSources('podcast')[0];
  _ffAssert_(!!src,'esiste fonte podcast in FontiFeed');
  updateFeedSourceStats('podcast', src, 'OK', 3, '');
  var ss=getMainSS(); var v=ss.getSheetByName(FONTIFEED_SHEET).getDataRange().getValues(); var h=v[0];
  var iId=h.indexOf('ID'),iUlt=h.indexOf('NRecordUltimo'); var ok=false;
  for(var r=1;r<v.length;r++){ if(String(v[r][iId])===String(src.id||src.ID)){ ok=Number(v[r][iUlt])===3; break; } }
  _ffAssert_(ok,'NRecordUltimo=3 scritto');
  disableAllFontiFeed();
}
```

- [ ] **Step 3: `clasp push`, esegui → 2 PASS. Flag tornano OFF.**
- [ ] **Step 4: Commit** `git commit -am "feat(fonti): updateFeedSourceStats per-tipo (fix contatori ON)"`

---

## Task 7: `verificaFontiFeed()`

**Files:** Modify `FontiFeed.js`

- [ ] **Step 1: Implementare**

```javascript
function verificaFontiFeed() {
  var legacyRss = _ffReadFonti_().filter(function(f){return f.attiva;});
  var legacyPod = _ffReadPodcastArray_().concat(_ffReadFontiPodcast_('audio')).filter(function(f){return f.attiva;});
  var legacyVid = _ffReadFontiPodcast_('video').filter(function(f){return f.attiva;});
  var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(FONTIFEED_SHEET); var keys={rss:{},podcast:{},video:{}}, perTipo={rss:0,podcast:0,video:0};
  if(sh){ var v=sh.getDataRange().getValues(); var h=v[0];
    var iId=h.indexOf('ID'),iFeed=h.indexOf('URL_Feed'),iTipo=h.indexOf('Tipo'),iAtt=h.indexOf('Attiva');
    for(var r=1;r<v.length;r++){ if(!v[r][iId])continue;
      if(!(v[r][iAtt]===true||String(v[r][iAtt]).toUpperCase()==='TRUE'))continue;
      var t=String(v[r][iTipo]).toLowerCase(); if(keys[t]){ keys[t][_normalizeFeedUrl_(v[r][iFeed])]=true; perTipo[t]++; }
    }
  }
  function manc(arr,t){ return arr.filter(function(f){return !keys[t][_normalizeFeedUrl_(f.urlFeed)];}).map(function(f){return f.nome;}); }
  var rep={ feedPerTipo:perTipo,
    rssMancanti:manc(legacyRss,'rss'), podMancanti:manc(legacyPod,'podcast'), vidMancanti:manc(legacyVid,'video') };
  Logger.log('verificaFontiFeed: '+JSON.stringify(rep,null,2));
  return rep;
}
```

- [ ] **Step 2: Test nessuna fonte persa**

```javascript
function _test_verificaFontiFeed_() {
  var r=verificaFontiFeed();
  _ffAssert_(r.rssMancanti.length===0,'0 rss persi ('+r.rssMancanti.join(', ')+')');
  _ffAssert_(r.podMancanti.length===0,'0 podcast persi ('+r.podMancanti.join(', ')+')');
  _ffAssert_(r.vidMancanti.length===0,'0 video persi ('+r.vidMancanti.join(', ')+')');
}
```

- [ ] **Step 3: `clasp push`, esegui → 3 PASS (o lista chiara dei mancanti).**
- [ ] **Step 4: Commit** `git commit -am "feat(fonti): verificaFontiFeed confronto per-tipo"`

---

## Task 8: Cablare `scanSources` (news)

**Files:** Modify `Codice.js` (~2363 e ~2394). Rileggere la funzione per confermare le righe.

- [ ] **Step 1: Lettura fonti.** Trova `const fonti=getFonti().fonti.filter(f=>f.Attiva);` → sostituisci con:
```javascript
  const fonti=getFeedSources('rss');
```
- [ ] **Step 2: Scrittura contatori.** Trova `updateFonteLastScan(SS, fonte.ID, items.length);` → sostituisci con:
```javascript
      updateFeedSourceStats('rss', fonte, items.length>0?'OK':'EMPTY', items.length, '');
```
- [ ] **Step 3: Test non-regressione**
```javascript
function _test_scanSources_off_() {
  disableAllFontiFeed();
  _ffAssert_(getFeedSources('rss').length===getFonti().fonti.filter(function(f){return f.Attiva;}).length,'scanSources OFF vede le stesse fonti');
}
```
- [ ] **Step 4: `clasp push`, esegui → PASS. NON lanciare scanSources reale ora.**
- [ ] **Step 5: Commit** `git commit -am "refactor(scan): scanSources usa getFeedSources/updateFeedSourceStats"`

---

## Task 9: Cablare `scanPodcastDiretto` (podcast)

**Files:** Modify `Codice.js` (~1180-1201). Rileggere il blocco.

- [ ] **Step 1: Sostituire il blocco di costruzione fonti.** Sostituisci dall'inizio di `var tutteLeFonti = FONTI_PODCAST.filter(...)` fino alla fine del `try{...}catch(efp){...}` che legge `_getFontiPodSheet()` con:
```javascript
  // Fonti podcast via adattatore (OFF=array FONTI_PODCAST + foglio FontiPodcast audio; ON=FontiFeed)
  var tutteLeFonti = getFeedSources('podcast').filter(function(f){ return f.priorita !== 2 || settimanaAnno % 2 === 0; });
```
(Il filtro settimanale resta identico; le righe-foglio hanno priorita=1 → passano sempre, come oggi.)

- [ ] **Step 2: (Se presente) scrittura contatori.** Dove la funzione aggiorna i contatori della singola fonte, aggiungere accanto (senza rimuovere la logica esistente):
```javascript
      updateFeedSourceStats('podcast', fonte, nuoviDaQuestaFonte>0?'OK':'EMPTY', nuoviDaQuestaFonte, '');
```
(Se non c'è un punto contatori per-fonte, saltare questo step: a flag OFF è no-op comunque.)

- [ ] **Step 3: Test**
```javascript
function _test_podcast_off_() {
  disableAllFontiFeed();
  _ffAssert_(getFeedSources('podcast').length>0,'podcast OFF ritorna fonti combinate');
}
```
- [ ] **Step 4: `clasp push`, esegui → PASS.**
- [ ] **Step 5: Commit** `git commit -am "refactor(scan): scanPodcastDiretto usa getFeedSources('podcast')"`

---

## Task 10: Cablare `scanVideoYoutube` (video)

**Files:** Modify `Codice.js` (~1035-1058). Rileggere il blocco.

- [ ] **Step 1: Sostituire il blocco fonti.** Sostituisci da `var shFonti = _getFontiPodSheet();` fino alla fine del `for` che riempie `fontiVideo` (e dei controlli di vuoto correlati) con:
```javascript
  var fontiVideo = getFeedSources('video');
  if (!fontiVideo.length) { Logger.log('scanVideoYoutube: nessuna fonte video'); return 0; }
```
- [ ] **Step 2: Test**
```javascript
function _test_video_off_() {
  disableAllFontiFeed();
  _ffAssert_(getFeedSources('video').length>=0,'video OFF ritorna lista (canali)');
}
```
- [ ] **Step 3: `clasp push`, esegui → PASS.**
- [ ] **Step 4: Commit** `git commit -am "refactor(scan): scanVideoYoutube usa getFeedSources('video')"`

---

## Task 11: Lettura admin di `FontiFeed` (schema-safe)

**Files:** Modify `FontiFeed.js`, `Fonti_v1.js`

> **Correzione post-review**: NON aggiungere `feed` a `FU_SHEETS`. `getFontiUnified`/`_fuRowToObj_` usano indici FU17 (18 col) fissi e leggerebbero FontiFeed (20 col, layout diverso) in modo CORROTTO (`url`←Gruppo, `attiva`←AmbitoLabel) — corrompendo anche la vista admin senza filtro. Si usa invece un lettore dedicato per nome colonna.

- [ ] **Step 1:** In `Fonti_v1.js` lasciare `FU_SHEETS` con i 4 tipi FU17 (commento esplicativo sul perché `FontiFeed` non va lì).
- [ ] **Step 2:** In `FontiFeed.js` la funzione `getFontiFeedAdmin(filtro)` legge `FontiFeed` per nome colonna e ritorna `{ok, fonti:[{id,nome,gruppo,tipo,url,attiva,...}], totale}`. Il futuro wiring del pannello admin chiamerà questa (non `getFontiUnified`).
- [ ] **Step 3: Test** `_test_getFontiFeedAdmin_` (in FontiFeed.js): verifica `ok`, `totale>0`, e che TUTTE le fonti abbiano `url` valorizzato (prova che la lettura per nome è corretta, non disallineata).
- [ ] **Step 4: `clasp push`, esegui → 3 PASS.**
- [ ] **Step 5: Commit** `git commit -am "feat(admin): getFontiFeedAdmin lettura FontiFeed per nome colonna (schema-safe)"`

---

## Task 12: Rollout staggered (manuale GAS + deploy)

- [ ] **Step 1:** Backup manuale in Sheets: duplica `Fonti` e `FontiPodcast` → `*_BACKUP_2026-06-02`.
- [ ] **Step 2:** Deploy "Nuova versione" con i 3 flag OFF. Verifica in incognito: News/Podcast/Video identici.
- [ ] **Step 3:** Esegui `migraFontiFeed()` poi `verificaFontiFeed()` → 0 mancanti per i 3 tipi.
- [ ] **Step 4 (NEWS):** `enableFontiFeed('rss')` → esegui `scanSources()` → verifica nuovi `Items` + contatori in FontiFeed. Se ko: `disableFontiFeed('rss')`.
- [ ] **Step 5 (PODCAST):** `enableFontiFeed('podcast')` → esegui `scanPodcastDiretto()` → verifica nuovi `POD*` + contatori. Se ko: `disableFontiFeed('podcast')`.
- [ ] **Step 6 (VIDEO):** `enableFontiFeed('video')` → esegui `scanVideoYoutube()` → verifica nuovi `VID*`. Se ko: `disableFontiFeed('video')`.
- [ ] **Step 7:** Osserva 2-3 giorni; potatura fonti morte in FontiFeed.
- [ ] **Step 8:** Deprecare: svuotare/rimuovere l'array `FONTI_PODCAST` (Scannerbandi.js) e rinominare `Fonti`/`FontiPodcast` in `*_LEGACY_`.
- [ ] **Step 9:** Merge `feat/fonti-feed-unificazione` → `master`.

---

## Self-Review (eseguita)
- **Spec coverage:** schema (T1/3) ✓ · flag per-tipo (T1) ✓ · sorgenti corrette News/Podcast(array+foglio)/Video (T4) ✓ · adapter OFF replica per tipo (T5) ✓ · contatori ON + fix (T6) ✓ · verifica per-tipo (T7) ✓ · cablaggio 3 scanner (T8/9/10) ✓ · admin (T11) ✓ · rollout staggered (T12) ✓ · fuori scope (SocialFonti/bandi/MEPA) rispettato ✓.
- **Placeholder scan:** i punti "rileggere il blocco" hanno righe esatte e codice sostitutivo mostrato; lo step contatori podcast è condizionale ma esplicito (no-op a OFF).
- **Type consistency:** `_ffShape_` espone alias news (`ID/Nome/RSSURL/URL/Ambito`) + podcast (`nome/url/tematica/priorita`); `getFeedSources(tipo)` e `updateFeedSourceStats(tipo,fonte,esito,n,err)` firme coerenti in T5/6/8/9/10; `_normalizeFeedUrl_` coerente; `FONTIFEED_HEADERS` 20 col coerenti ovunque.
