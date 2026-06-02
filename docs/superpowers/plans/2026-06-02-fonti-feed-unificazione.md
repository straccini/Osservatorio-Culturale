# Unificazione Fonti Feed (News + Podcast/Video) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificare le fonti News/RSS + Podcast + Video in un unico foglio `FontiFeed`, letto/scritto tramite un adattatore controllato da un flag reversibile `USE_FONTI_FEED`, senza modificare il comportamento dell'app finché il flag non viene acceso.

**Architecture:** Quasi tutto il nuovo codice vive in un file isolato `FontiFeed.js`. Gli scanner esistenti (`scanSources` in Codice.js e lo scanner podcast) cambiano solo il punto di lettura/scrittura delle fonti chiamando l'adattatore `getFeedSources(tipo)` / `updateFeedSourceStats(...)`. Con flag OFF l'adattatore legge i fogli legacy (`Fonti`, `SocialFonti`) → comportamento identico ad oggi. I fogli legacy non vengono mai cancellati.

**Tech Stack:** Google Apps Script (V8), Google Sheets, clasp (push locale→GAS). Nessun framework di test CLI: i test sono **funzioni GAS** `_test_*_()` che scrivono PASS/FAIL nei Logger, eseguite dall'editor GAS dopo `clasp push`.

**Spec di riferimento:** `docs/superpowers/specs/2026-06-02-fonti-feed-unificazione-design.md`

---

## Come si "eseguono i test" in questo progetto (leggere prima)

Non esiste un runner da terminale. Per ogni test:
1. `clasp push` (carica il codice su GAS — NON tocca la distribuzione in produzione).
2. Apri l'editor GAS (`clasp open`), seleziona la funzione `_test_*_`, premi **Esegui**.
3. Leggi **Visualizza → Log**: deve comparire `PASS`. Se compare `FAIL`, correggi.

Le funzioni di test usano un mini-assert interno (definito in Task 1) che logga PASS/FAIL senza interrompere l'esecuzione.

---

## Struttura dei file

| File | Azione | Responsabilità |
|---|---|---|
| `FontiFeed.js` | **Create** | Costanti schema, flag, sheet, helper URL, adattatori lettura/scrittura, migrazione, verifica, test |
| `Codice.js` | Modify (`scanSources` ~2363 e ~2394) | Sostituire lettura `getFonti()` e scrittura `updateFonteLastScan()` con gli adattatori |
| `<scanner podcast>.js` | Modify | Stesso swap per il tipo `podcast`/`video` |
| `Fonti_v1.js` | Modify (`FU_SHEETS`, `getFontiUnified`) | Far vedere `FontiFeed` al pannello admin |
| `docs/superpowers/specs/2026-06-02-fonti-feed-unificazione-design.md` | (già creato) | Design |

---

## Task 0: Fase 0 — Sicurezza (branch + backup)

**Files:** nessun file di codice (operazioni git + passo manuale GAS).

- [ ] **Step 1: Creare un branch dedicato** (siamo su `master`, non lavorare lì)

```bash
cd "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\musemu matrix\oc-codebase"
git checkout -b feat/fonti-feed-unificazione
```

- [ ] **Step 2: Committare lo stato attuale + la spec** (per partire da una base pulita e reversibile)

```bash
git add -A
git commit -m "chore: snapshot pre-unificazione fonti + design spec"
```

- [ ] **Step 3: Backup manuale dei fogli (in Google Sheets, UNA VOLTA)**

Nel foglio "Osservatorio Culturale": tasto destro sulle schede `Fonti` e `SocialFonti` → **Duplica** → rinominare i duplicati `Fonti_BACKUP_2026-06-02` e `SocialFonti_BACKUP_2026-06-02`.
Expected: due schede di backup presenti. (Le originali NON si toccano.)

---

## Task 1: `FontiFeed.js` — costanti, schema, flag, mini-assert

**Files:**
- Create: `FontiFeed.js`

- [ ] **Step 1: Creare il file con header, costanti schema, flag e mini-assert**

```javascript
/**
 * FontiFeed.js — Archivio unico fonti "feed" (News/RSS + Podcast + Video)
 * Design: docs/superpowers/specs/2026-06-02-fonti-feed-unificazione-design.md
 * Tutto dietro flag USE_FONTI_FEED: OFF = legacy (Fonti/SocialFonti), ON = FontiFeed.
 */

var FONTIFEED_SHEET = 'FontiFeed';

// Schema 20 colonne (1-indexed per Sheets via .indexOf su header)
var FONTIFEED_HEADERS = [
  'ID','Nome','Gruppo','Tipo','URL_Feed','URL_Sito','Ambito','AmbitoLabel',
  'Dimensioni','Categoria','Priorita','Attiva','DataAggiunta','UltimaScan',
  'UltimoEsito','NRecordTotali','NRecordUltimo','FailConsecutivi','UltimoErrore','Note'
];

var FONTIFEED_FLAG_PROP = 'USE_FONTI_FEED';

function isFontiFeedEnabled_() {
  var p = PropertiesService.getScriptProperties().getProperty(FONTIFEED_FLAG_PROP);
  return String(p) === 'true';
}
function enableFontiFeed()  { PropertiesService.getScriptProperties().setProperty(FONTIFEED_FLAG_PROP,'true');  Logger.log('USE_FONTI_FEED = true'); }
function disableFontiFeed() { PropertiesService.getScriptProperties().setProperty(FONTIFEED_FLAG_PROP,'false'); Logger.log('USE_FONTI_FEED = false (rollback a fogli legacy)'); }

// mini-assert per i test (logga PASS/FAIL, non lancia)
function _ffAssert_(cond, msg) {
  Logger.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg);
  return !!cond;
}
```

- [ ] **Step 2: Test del flag**

```javascript
function _test_ffFlag_() {
  disableFontiFeed();
  _ffAssert_(isFontiFeedEnabled_() === false, 'flag parte OFF dopo disable');
  enableFontiFeed();
  _ffAssert_(isFontiFeedEnabled_() === true,  'flag ON dopo enable');
  disableFontiFeed(); // ripristina stato sicuro
  _ffAssert_(isFontiFeedEnabled_() === false, 'flag rimesso OFF a fine test');
}
```

- [ ] **Step 3: Push ed esegui il test in GAS**

Run: `clasp push` poi nell'editor GAS esegui `_test_ffFlag_`.
Expected: nei Log tre righe `PASS`. Il flag resta OFF.

- [ ] **Step 4: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): schema FontiFeed + flag USE_FONTI_FEED + mini-assert"
```

---

## Task 2: Helper puro — normalizzazione URL per dedup

**Files:**
- Modify: `FontiFeed.js`

- [ ] **Step 1: Scrivere il test (PRIMA dell'implementazione)**

```javascript
function _test_normalizeFeedUrl_() {
  _ffAssert_(_normalizeFeedUrl_('https://Site.it/Feed/') === 'site.it/feed', 'toglie protocollo, lowercase, slash finale');
  _ffAssert_(_normalizeFeedUrl_('http://www.site.it/feed') === 'site.it/feed', 'toglie www e http');
  _ffAssert_(_normalizeFeedUrl_('  https://site.it/feed?x=1 ') === 'site.it/feed', 'trim + toglie query');
  _ffAssert_(_normalizeFeedUrl_('') === '', 'stringa vuota → vuota');
}
```

- [ ] **Step 2: Push ed esegui `_test_normalizeFeedUrl_` → deve FALLIRE**

Run: `clasp push`, esegui `_test_normalizeFeedUrl_`.
Expected: errore "_normalizeFeedUrl_ is not defined" (funzione non ancora scritta).

- [ ] **Step 3: Implementare la funzione minima**

```javascript
function _normalizeFeedUrl_(url) {
  var s = String(url || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//,'').replace(/^www\./,'');
  s = s.split('?')[0].split('#')[0];
  s = s.replace(/\/+$/,'');
  return s;
}
```

- [ ] **Step 4: Push ed esegui → deve PASSARE**

Run: `clasp push`, esegui `_test_normalizeFeedUrl_`.
Expected: quattro righe `PASS`.

- [ ] **Step 5: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): _normalizeFeedUrl_ per dedup feed"
```

---

## Task 3: Creazione idempotente del foglio `FontiFeed`

**Files:**
- Modify: `FontiFeed.js`

- [ ] **Step 1: Implementare `ensureFontiFeedSheet_()`**

```javascript
function ensureFontiFeedSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FONTIFEED_SHEET);
    sh.getRange(1,1,1,FONTIFEED_HEADERS.length).setValues([FONTIFEED_HEADERS])
      .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2,200); sh.setColumnWidth(3,140); sh.setColumnWidth(5,320);
    Logger.log('FontiFeed creato con ' + FONTIFEED_HEADERS.length + ' colonne');
  }
  return sh;
}
```

- [ ] **Step 2: Test idempotenza**

```javascript
function _test_ensureFontiFeedSheet_() {
  var sh1 = ensureFontiFeedSheet_();
  var sh2 = ensureFontiFeedSheet_(); // seconda chiamata non deve duplicare
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var conta = ss.getSheets().filter(function(s){ return s.getName() === FONTIFEED_SHEET; }).length;
  _ffAssert_(conta === 1, 'esiste UN solo foglio FontiFeed dopo due chiamate');
  var hdr = sh1.getRange(1,1,1,FONTIFEED_HEADERS.length).getValues()[0];
  _ffAssert_(hdr[0] === 'ID' && hdr[4] === 'URL_Feed' && hdr[19] === 'Note', 'header corretti');
}
```

- [ ] **Step 3: Push ed esegui → PASS**

Run: `clasp push`, esegui `_test_ensureFontiFeedSheet_`.
Expected: due righe `PASS`. Nel foglio compare la scheda `FontiFeed` vuota con intestazioni.

- [ ] **Step 4: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): ensureFontiFeedSheet_ idempotente"
```

---

## Task 4: Migrazione `migraFontiFeed()` (non distruttiva, idempotente, con report)

**Files:**
- Modify: `FontiFeed.js`

**Contesto colonne legacy (verificato):**
- `Fonti`: `ID, Nome, URL, RSSURL, Ambito, AmbitoLabel, Attiva, UltimaScansione, NumItemRaccolti`
- `SocialFonti`: `ID, Nome, URL, Categoria, Attiva, Note, RSSURL, Ambito, AmbitoLabel, UltimaScansione, NumItemRaccolti`

- [ ] **Step 1: Implementare un helper di lettura legacy → oggetti normalizzati**

```javascript
// Legge un foglio legacy e restituisce righe normalizzate per FontiFeed.
function _ffReadLegacy_(sheetName, tipoDefault) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var h = vals[0].map(function(x){ return String(x||'').trim(); });
  function col(name){ return h.indexOf(name); }
  var iId=col('ID'), iNome=col('Nome'), iUrl=col('URL'), iRss=col('RSSURL'),
      iAmb=col('Ambito'), iAmbL=col('AmbitoLabel'), iAtt=col('Attiva'),
      iScan=col('UltimaScansione'), iNum=col('NumItemRaccolti'),
      iCat=col('Categoria'), iNote=col('Note');
  var out=[];
  for (var r=1;r<vals.length;r++){
    var row=vals[r];
    if (iId>=0 && !row[iId]) continue;
    var nome = String(row[iNome]||'').trim();
    var feed = String((iRss>=0?row[iRss]:'')||'').trim() || String((iUrl>=0?row[iUrl]:'')||'').trim();
    out.push({
      nome: nome,
      gruppo: nome.split(/[—\-|:]/)[0].trim() || nome, // best-effort: prima del trattino
      tipo: tipoDefault,
      urlFeed: feed,
      urlSito: String((iUrl>=0?row[iUrl]:'')||'').trim(),
      ambito: iAmb>=0?row[iAmb]:'',
      ambitoLabel: iAmbL>=0?row[iAmbL]:'',
      categoria: iCat>=0?String(row[iCat]||''):'',
      attiva: String((iAtt>=0?row[iAtt]:'')).toUpperCase()==='TRUE' || row[iAtt]===true,
      ultimaScan: iScan>=0?row[iScan]:'',
      nRecTot: Number((iNum>=0?row[iNum]:0)||0),
      note: iNote>=0?String(row[iNote]||''):''
    });
  }
  return out;
}
```

- [ ] **Step 2: Implementare `migraFontiFeed()`**

```javascript
function migraFontiFeed() {
  var sh = ensureFontiFeedSheet_();
  var h = sh.getRange(1,1,1,FONTIFEED_HEADERS.length).getValues()[0];
  // chiavi già presenti (per idempotenza): URL_Feed normalizzato
  var iFeed = h.indexOf('URL_Feed');
  var existing = {};
  var cur = sh.getDataRange().getValues();
  for (var r=1;r<cur.length;r++){
    var k=_normalizeFeedUrl_(cur[r][iFeed]); if(k) existing[k]=true;
  }
  var legacy = _ffReadLegacy_('Fonti','rss').concat(_ffReadLegacy_('SocialFonti','podcast'));
  var added=0, dupSkip=0, silenti=0, dupMap={};
  legacy.forEach(function(f){
    var key=_normalizeFeedUrl_(f.urlFeed);
    if(!key){ return; }
    if(existing[key] || dupMap[key]){ dupSkip++; return; } // dedup
    dupMap[key]=true;
    if (f.nRecTot===0) silenti++;
    var rowObj={
      ID:'FF'+Date.now()+'_'+Math.random().toString(36).substr(2,4),
      Nome:f.nome, Gruppo:f.gruppo, Tipo:f.tipo, URL_Feed:f.urlFeed, URL_Sito:f.urlSito,
      Ambito:f.ambito, AmbitoLabel:f.ambitoLabel, Dimensioni:'', Categoria:f.categoria,
      Priorita:2, Attiva:f.attiva, DataAggiunta:new Date(), UltimaScan:f.ultimaScan||'',
      UltimoEsito:'', NRecordTotali:f.nRecTot, NRecordUltimo:0, FailConsecutivi:0,
      UltimoErrore:'', Note:f.note
    };
    var line=FONTIFEED_HEADERS.map(function(c){ return rowObj[c]!==undefined?rowObj[c]:''; });
    sh.appendRow(line);
    existing[key]=true; added++;
  });
  var report={ migrate:added, doppioniSaltati:dupSkip, silentiZeroRecord:silenti };
  Logger.log('migraFontiFeed REPORT: ' + JSON.stringify(report));
  return report;
}
```

- [ ] **Step 3: Test migrazione + idempotenza**

```javascript
function _test_migraFontiFeed_() {
  var r1 = migraFontiFeed();
  _ffAssert_(r1.migrate > 0, 'prima migrazione importa >0 fonti (migrate=' + r1.migrate + ')');
  var r2 = migraFontiFeed(); // rilancio: non deve aggiungere nulla
  _ffAssert_(r2.migrate === 0, 'seconda migrazione non duplica (migrate=' + r2.migrate + ')');
}
```

- [ ] **Step 4: Push ed esegui → PASS**

Run: `clasp push`, esegui `_test_migraFontiFeed_`.
Expected: due righe `PASS`. In `FontiFeed` compaiono le fonti migrate. I fogli `Fonti`/`SocialFonti` sono invariati.

- [ ] **Step 5: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): migraFontiFeed non distruttiva+idempotente con dedup e report"
```

---

## Task 5: Adattatore di lettura `getFeedSources(tipo)`

**Files:**
- Modify: `FontiFeed.js`

L'adattatore deve restituire oggetti con la **stessa forma** che `scanSources` già usa: `{ID, Nome, RSSURL, URL, Ambito, Attiva}` (così il corpo dello scanner non cambia).

- [ ] **Step 1: Implementare `getFeedSources(tipo)`**

```javascript
/**
 * tipo: 'rss' | 'podcast' | 'video'
 * Flag OFF → legge fogli legacy. Flag ON → legge FontiFeed filtrando per Tipo.
 * Ritorna oggetti shape-compatibili con scanSources: {ID,Nome,RSSURL,URL,Ambito,Attiva}.
 */
function getFeedSources(tipo) {
  tipo = String(tipo||'rss').toLowerCase();
  if (!isFontiFeedEnabled_()) {
    // LEGACY: rss → foglio Fonti (via getFonti già esistente); podcast/video → SocialFonti
    if (tipo === 'rss' && typeof getFonti === 'function') {
      return getFonti().fonti.filter(function(f){ return f.Attiva; });
    }
    var legacyName = (tipo === 'rss') ? 'Fonti' : 'SocialFonti';
    return _ffReadLegacy_(legacyName, tipo).filter(function(f){ return f.attiva; }).map(function(f){
      return { ID:'', Nome:f.nome, RSSURL:f.urlFeed, URL:f.urlSito, Ambito:f.ambito, Attiva:true };
    });
  }
  // NUOVO: FontiFeed
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues(); if (vals.length<2) return [];
  var h = vals[0]; function c(n){ return h.indexOf(n); }
  var iId=c('ID'), iNome=c('Nome'), iTipo=c('Tipo'), iFeed=c('URL_Feed'),
      iSito=c('URL_Sito'), iAmb=c('Ambito'), iAtt=c('Attiva');
  var tipiVideo = (tipo==='podcast') ? ['podcast'] : (tipo==='video' ? ['video'] : [tipo]);
  var out=[];
  for (var r=1;r<vals.length;r++){
    var row=vals[r];
    if (!row[iId]) continue;
    if (tipiVideo.indexOf(String(row[iTipo]).toLowerCase()) < 0) continue;
    if (!(row[iAtt]===true || String(row[iAtt]).toUpperCase()==='TRUE')) continue;
    out.push({ ID:row[iId], Nome:row[iNome], RSSURL:row[iFeed], URL:row[iSito], Ambito:row[iAmb], Attiva:true });
  }
  return out;
}
```

- [ ] **Step 2: Test: con flag OFF coincide col legacy**

```javascript
function _test_getFeedSources_offMatchesLegacy_() {
  disableFontiFeed();
  var viaAdapter = getFeedSources('rss').length;
  var viaLegacy  = (typeof getFonti==='function') ? getFonti().fonti.filter(function(f){return f.Attiva;}).length : -1;
  _ffAssert_(viaAdapter === viaLegacy, 'rss OFF: adapter=' + viaAdapter + ' == legacy=' + viaLegacy);
}
```

- [ ] **Step 3: Push ed esegui → PASS**

Run: `clasp push`, esegui `_test_getFeedSources_offMatchesLegacy_`.
Expected: `PASS` (stesso numero di fonti attive). Flag resta OFF.

- [ ] **Step 4: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): getFeedSources adapter con flag (OFF=legacy, ON=FontiFeed)"
```

---

## Task 6: Adattatore di scrittura `updateFeedSourceStats(...)`

**Files:**
- Modify: `FontiFeed.js`

- [ ] **Step 1: Implementare `updateFeedSourceStats(fonte, esito, nRecord, errore)`**

```javascript
/**
 * Scrive UltimaScan/UltimoEsito/contatori/Fail.
 * Flag OFF → delega al comportamento legacy (updateFonteLastScan su Fonti) per le news.
 * Flag ON → scrive su FontiFeed trovando la riga per ID o per URL_Feed.
 */
function updateFeedSourceStats(fonte, esito, nRecord, errore) {
  nRecord = Number(nRecord||0); esito = esito || (nRecord>0?'OK':'EMPTY');
  if (!isFontiFeedEnabled_()) {
    if (typeof updateFonteLastScan === 'function' && fonte && fonte.ID) {
      var SS=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
      try { updateFonteLastScan(SS, fonte.ID, nRecord); } catch(e){}
    }
    return;
  }
  var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(FONTIFEED_SHEET); if(!sh) return;
  var vals=sh.getDataRange().getValues(); var h=vals[0];
  function c(n){ return h.indexOf(n); }
  var iId=c('ID'), iFeed=c('URL_Feed'), iScan=c('UltimaScan'), iEsito=c('UltimoEsito'),
      iTot=c('NRecordTotali'), iUlt=c('NRecordUltimo'), iFail=c('FailConsecutivi'), iErr=c('UltimoErrore');
  var keyId = fonte && fonte.ID ? String(fonte.ID) : '';
  var keyFeed = _normalizeFeedUrl_(fonte && fonte.RSSURL);
  for (var r=1;r<vals.length;r++){
    var match = (keyId && String(vals[r][iId])===keyId) || (keyFeed && _normalizeFeedUrl_(vals[r][iFeed])===keyFeed);
    if (!match) continue;
    var rr=r+1;
    sh.getRange(rr,iScan+1).setValue(new Date());
    sh.getRange(rr,iEsito+1).setValue(esito);
    sh.getRange(rr,iTot+1).setValue(Number(vals[r][iTot]||0)+nRecord);
    sh.getRange(rr,iUlt+1).setValue(nRecord);
    var fail = (esito==='OK') ? 0 : Number(vals[r][iFail]||0)+1;
    sh.getRange(rr,iFail+1).setValue(fail);
    if (errore) sh.getRange(rr,iErr+1).setValue(String(errore).substring(0,120));
    return;
  }
}
```

- [ ] **Step 2: Test scrittura su FontiFeed (flag ON, poi rollback)**

```javascript
function _test_updateFeedSourceStats_() {
  enableFontiFeed();
  var src = getFeedSources('rss')[0];
  _ffAssert_(!!src, 'esiste almeno una fonte rss in FontiFeed');
  updateFeedSourceStats(src, 'OK', 5, '');
  // rilettura
  var ss=getMainSS(); var sh=ss.getSheetByName(FONTIFEED_SHEET); var v=sh.getDataRange().getValues(); var h=v[0];
  var iId=h.indexOf('ID'), iUlt=h.indexOf('NRecordUltimo'), iEsito=h.indexOf('UltimoEsito');
  var ok=false;
  for (var r=1;r<v.length;r++){ if(String(v[r][iId])===String(src.ID)){ ok = (Number(v[r][iUlt])===5 && v[r][iEsito]==='OK'); break; } }
  _ffAssert_(ok, 'NRecordUltimo=5 e UltimoEsito=OK scritti sulla riga giusta');
  disableFontiFeed(); // SEMPRE ripristinare OFF a fine test
}
```

- [ ] **Step 3: Push ed esegui → PASS**

Run: `clasp push`, esegui `_test_updateFeedSourceStats_`.
Expected: due `PASS`. Flag torna OFF.

- [ ] **Step 4: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): updateFeedSourceStats con flag (fix contatori anche podcast)"
```

---

## Task 7: Verifica `verificaFontiFeed()` (confronto legacy vs nuovo)

**Files:**
- Modify: `FontiFeed.js`

- [ ] **Step 1: Implementare `verificaFontiFeed()`**

```javascript
/**
 * Confronto NON distruttivo (eseguibile con flag OFF). Riporta differenze.
 */
function verificaFontiFeed() {
  var ss=(typeof getMainSS==='function')?getMainSS():SpreadsheetApp.getActiveSpreadsheet();
  function attiveLegacy(name){ return _ffReadLegacy_(name,'x').filter(function(f){return f.attiva;}); }
  var legacyRss = attiveLegacy('Fonti');
  var legacyPod = attiveLegacy('SocialFonti');
  var sh=ss.getSheetByName(FONTIFEED_SHEET);
  var feedKeys={}, perTipo={rss:0,podcast:0,video:0};
  if (sh){
    var v=sh.getDataRange().getValues(), h=v[0];
    var iId=h.indexOf('ID'), iFeed=h.indexOf('URL_Feed'), iTipo=h.indexOf('Tipo'), iAtt=h.indexOf('Attiva');
    for (var r=1;r<v.length;r++){
      if(!v[r][iId]) continue;
      var attivo=(v[r][iAtt]===true||String(v[r][iAtt]).toUpperCase()==='TRUE');
      if(!attivo) continue;
      feedKeys[_normalizeFeedUrl_(v[r][iFeed])]=true;
      var t=String(v[r][iTipo]).toLowerCase(); if(perTipo[t]!==undefined) perTipo[t]++;
    }
  }
  function mancanti(arr){ return arr.filter(function(f){ return !feedKeys[_normalizeFeedUrl_(f.urlFeed)]; }).map(function(f){return f.nome;}); }
  var report={
    legacyRssAttive: legacyRss.length, legacyPodAttive: legacyPod.length,
    feedFeedPerTipo: perTipo,
    rssMancantiInFeed: mancanti(legacyRss),
    podMancantiInFeed: mancanti(legacyPod)
  };
  Logger.log('verificaFontiFeed: ' + JSON.stringify(report, null, 2));
  return report;
}
```

- [ ] **Step 2: Test: nessuna fonte attiva persa**

```javascript
function _test_verificaFontiFeed_() {
  var rep = verificaFontiFeed();
  _ffAssert_(rep.rssMancantiInFeed.length === 0, 'nessuna fonte RSS attiva persa (' + rep.rssMancantiInFeed.join(', ') + ')');
  _ffAssert_(rep.podMancantiInFeed.length === 0, 'nessuna fonte podcast attiva persa (' + rep.podMancantiInFeed.join(', ') + ')');
}
```

- [ ] **Step 3: Push ed esegui → PASS (o lista chiara dei mancanti da sistemare)**

Run: `clasp push`, esegui `_test_verificaFontiFeed_`.
Expected: due `PASS`. Se FAIL, il log elenca i nomi mancanti → aggiungere/migrare prima di proseguire.

- [ ] **Step 4: Commit**

```bash
git add FontiFeed.js
git commit -m "feat(fonti): verificaFontiFeed confronto non distruttivo legacy vs nuovo"
```

---

## Task 8: Cablare lo scanner NEWS (`scanSources` in Codice.js)

**Files:**
- Modify: `Codice.js` (funzione `scanSources`, righe ~2363 e ~2394)

Prima di modificare: **rileggere la funzione** `scanSources` per confermare le righe esatte (potrebbero essere shiftate). Le due modifiche sono puntuali.

- [ ] **Step 1: Sostituire la lettura delle fonti**

Trova (riga ~2363):
```javascript
  const fonti=getFonti().fonti.filter(f=>f.Attiva);
```
Sostituisci con:
```javascript
  const fonti=getFeedSources('rss');
```

- [ ] **Step 2: Sostituire la scrittura dei contatori**

Trova (riga ~2394):
```javascript
      updateFonteLastScan(SS, fonte.ID, items.length);
```
Sostituisci con:
```javascript
      updateFeedSourceStats(fonte, items.length>0?'OK':'EMPTY', items.length, '');
```

- [ ] **Step 3: Test di non-regressione con flag OFF**

```javascript
function _test_scanSources_offCount_() {
  disableFontiFeed();
  var n = getFeedSources('rss').length; // ciò che scanSources userà
  var legacy = getFonti().fonti.filter(function(f){return f.Attiva;}).length;
  _ffAssert_(n === legacy, 'scanSources con flag OFF vede le stesse ' + legacy + ' fonti del legacy');
}
```

- [ ] **Step 4: Push ed esegui `_test_scanSources_offCount_` → PASS**

Run: `clasp push`, esegui `_test_scanSources_offCount_`.
Expected: `PASS`. (Non lanciare ancora `scanSources` reale: lo faremo in Fase 5 del rollout.)

- [ ] **Step 5: Commit**

```bash
git add Codice.js FontiFeed.js
git commit -m "refactor(scan): scanSources usa getFeedSources/updateFeedSourceStats"
```

---

## Task 9: Cablare lo scanner PODCAST/VIDEO

**Files:**
- Modify: file dello scanner podcast (individuare con grep)

- [ ] **Step 1: Individuare la funzione e il punto di lettura di `SocialFonti`**

Run:
```bash
grep -rln "SocialFonti\|scanPodcast\|scanSocial" *.js
```
Expected: il file/funzione che legge `SocialFonti` per scaricare i podcast.

- [ ] **Step 2: Sostituire la lettura delle fonti**

Nella funzione di scansione podcast, dove legge le fonti da `SocialFonti`, sostituire con:
```javascript
  var fonti = getFeedSources('podcast'); // (e/o 'video' per i canali)
```
mantenendo la stessa iterazione esistente sui campi `Nome`, `RSSURL`/`URL`, `Ambito`.

- [ ] **Step 3: Sostituire la scrittura dei contatori (se presente)**

Dove scrive `UltimaScansione`/`NumItemRaccolti` su `SocialFonti`, sostituire con:
```javascript
  updateFeedSourceStats(fonte, n>0?'OK':'EMPTY', n, '');
```

- [ ] **Step 4: Test non-regressione con flag OFF**

```javascript
function _test_podcastSources_offCount_() {
  disableFontiFeed();
  var n = getFeedSources('podcast').length;
  _ffAssert_(n >= 0, 'getFeedSources(podcast) OFF ritorna lista (n=' + n + ')');
}
```

- [ ] **Step 5: Push ed esegui → PASS**

Run: `clasp push`, esegui `_test_podcastSources_offCount_`.
Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(scan): scanner podcast usa getFeedSources/updateFeedSourceStats"
```

---

## Task 10: Pannello admin — far vedere `FontiFeed` (lettura)

**Files:**
- Modify: `Fonti_v1.js`

Obiettivo minimo e sicuro: il pannello "Fonti" deve poter **leggere** le righe di `FontiFeed`. (Aggiunta/disattivazione si possono fare a mano sul foglio già da subito; il wiring scrittura completo è opzionale, vedi nota.)

- [ ] **Step 1: Aggiungere `feed` alla mappa dei fogli**

In `Fonti_v1.js`, trova `var FU_SHEETS = { ... }` e aggiungi la voce:
```javascript
var FU_SHEETS = {
  bandi:   'FontiBandi_v5',
  news:    'FontiNews',
  podcast: 'FontiPodcast',
  video:   'FontiVideo',
  feed:    'FontiFeed'   // ← archivio unico feed (News+Podcast+Video)
};
```

- [ ] **Step 2: Verifica che `getFontiUnified({tipo:'feed'})` ritorni le righe**

`getFontiUnified` mappa per nome colonna; `FontiFeed` ha header con nomi compatibili (`ID`,`Nome`,`URL_Feed`,`Attiva`,`UltimaScan`,`UltimoEsito`,`FailConsecutivi`). Se il mapper cerca `URL` (non `URL_Feed`), aggiungere nel `_fuRowToObj_` un fallback:
```javascript
    url:          String(row[FU_COL.URL - 1] || row[/* URL_Feed */ 4] || ''),
```
(Solo se necessario dopo il test sotto.)

- [ ] **Step 3: Test lettura admin**

```javascript
function _test_adminVedeFontiFeed_() {
  var res = getFontiUnified({ tipo:'feed' });
  _ffAssert_(res && res.ok === true, 'getFontiUnified(feed) ok');
  _ffAssert_(res.totale > 0, 'admin vede ' + res.totale + ' fonti feed');
}
```

- [ ] **Step 4: Push ed esegui → PASS**

Run: `clasp push`, esegui `_test_adminVedeFontiFeed_`.
Expected: due `PASS`.

- [ ] **Step 5: Commit**

```bash
git add Fonti_v1.js FontiFeed.js
git commit -m "feat(admin): pannello Fonti legge FontiFeed (tipo=feed)"
```

> **Nota wiring scrittura (opzionale, fuori scope minimo):** se vuoi che "Aggiungi fonte" dal pannello scriva su `FontiFeed` con tutte le 20 colonne, serve un adattamento di `addFonteUnificataV2` allo schema FontiFeed. Rimandabile: per ora aggiungi/disattiva a mano sul foglio.

---

## Task 11: Rollout controllato (esecuzione manuale guidata)

**Files:** nessuno (operazioni manuali GAS + deploy).

- [ ] **Step 1: Deploy a freddo** — distribuzione GAS "Nuova versione" con flag **OFF**. Verifica in incognito che News/Podcast/Video siano **identici** a prima.
- [ ] **Step 2:** Esegui `migraFontiFeed()` e poi `verificaFontiFeed()` → conferma 0 fonti attive perse.
- [ ] **Step 3:** Esegui `enableFontiFeed()`.
- [ ] **Step 4:** Esegui **una** `scanSources()` manuale. Controlla i Log e il foglio `Items`: arrivano nuovi record; in `FontiFeed` si aggiornano `UltimaScan`/`UltimoEsito`/contatori.
- [ ] **Step 5:** Esegui una scansione podcast manuale. Verifica che i contatori podcast in `FontiFeed` **non** restino a 0 (bug storico risolto).
- [ ] **Step 6:** Se tutto ok → lasciare ON e osservare 2-3 giorni. Se qualcosa non va → `disableFontiFeed()` (rollback istantaneo).
- [ ] **Step 7 (dopo stabilità):** potatura manuale fonti morte in `FontiFeed`; rinominare (NON cancellare) `Fonti`/`SocialFonti` in `*_LEGACY_`.
- [ ] **Step 8:** Merge del branch `feat/fonti-feed-unificazione` su `master`.

---

## Self-Review (eseguita)

- **Spec coverage:** schema (Task 1/3) ✓ · migrazione+dedup (Task 4) ✓ · adattatore lettura+flag (Task 5) ✓ · scrittura contatori/fix podcast (Task 6) ✓ · verifica (Task 7) ✓ · scanner news (Task 8) ✓ · scanner podcast (Task 9) ✓ · admin (Task 10) ✓ · rollout 3-reti (Task 11) ✓ · fuori scope rispettato (bandi/social wall/MEPA assenti) ✓.
- **Placeholder scan:** nessun TBD; gli unici punti "da individuare" (file scanner podcast, eventuale fallback URL nel mapper admin) hanno comando grep esatto e codice mostrato.
- **Type consistency:** `getFeedSources` ritorna sempre `{ID,Nome,RSSURL,URL,Ambito,Attiva}`; `updateFeedSourceStats(fonte, esito, nRecord, errore)` firma usata identica in Task 6/8/9; `_normalizeFeedUrl_` usata coerente in Task 2/4/6/7; header `FONTIFEED_HEADERS` coerenti ovunque.
