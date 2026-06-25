# Content Systems & Editor Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand content sources (publications, podcast, video, social) and add editor promotion email notification.

**Architecture:** 5 independent interventions on GAS webapp. Each writes to existing sheets read by existing frontend functions — zero breaking changes. One new file (PubDiscovery_v1.js), rest are modifications to existing files.

**Tech Stack:** Google Apps Script V8, UrlFetchApp, MailApp, Google Sheets

---

### Task 1: Fix YouTube Video — Channel ID diretti + API v3 fallback

**Files:**
- Modify: `Codice.js:964-991` (_youtubeChannelToFeedUrl)
- Modify: `Codice.js:1028-1039` (populaSeedVideoYoutubeMusei seed array)

- [ ] **Step 1: Add API v3 fallback in _youtubeChannelToFeedUrl**

In `Codice.js` line 974, after the `@handle` match, add YouTube API v3 resolution before the HTML scraping fallback. Insert this block between line 975 and 976:

```javascript
  m = url.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/);
  if (m) {
    // v5.2 — Priorità 1: YouTube Data API v3 per risolvere @handle → channelId
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
          var data = JSON.parse(apiResp.getContentText());
          if (data.items && data.items[0] && data.items[0].snippet) {
            var cid = data.items[0].snippet.channelId || (data.items[0].id && data.items[0].id.channelId);
            if (cid) return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + cid;
          }
        }
      } catch(eApi) { Logger.log('_youtubeChannelToFeedUrl API v3 fallback: ' + eApi.message); }
    }
    // Priorità 2: scraping HTML (può essere bloccato da YouTube)
    try {
      // ... existing scraping code unchanged ...
```

- [ ] **Step 2: Replace @handle seeds with direct channelId URLs**

Replace the seed array in `populaSeedVideoYoutubeMusei()` (lines 1028-1039) with channel IDs. These must be looked up manually from YouTube. The format is:

```javascript
  var seed = [
    { nome:'Gallerie degli Uffizi',       channelUrl:'https://www.youtube.com/channel/UCfKE-91H1UViE2K5UWH-MFQ', tematica:'Musei & Patrimonio' },
    { nome:'MAXXI Museo',                 channelUrl:'https://www.youtube.com/channel/UC0VHSC2Dff9rkvHgRksMURA', tematica:'Arte Contemporanea' },
    { nome:'Museo Egizio Torino',         channelUrl:'https://www.youtube.com/channel/UCHMa4YYoz6IxfyxTGEquMAg', tematica:'Musei & Patrimonio' },
    { nome:'Triennale Milano',            channelUrl:'https://www.youtube.com/channel/UCda0GY0Cvh0GZfRCFdy12sA', tematica:'Arte Contemporanea' },
    { nome:'Pinacoteca di Brera',         channelUrl:'https://www.youtube.com/channel/UCqC-xBIMPMD4tM18IOi2cjQ', tematica:'Musei & Patrimonio' },
    { nome:'Fondazione Cariplo',          channelUrl:'https://www.youtube.com/channel/UCMDwdL3GiDbFjT2sJbCE0uw', tematica:'Politiche Culturali' },
    { nome:'Ministero della Cultura',     channelUrl:'https://www.youtube.com/channel/UCYGMMmyMFT3rJK8Fzchk7Gw', tematica:'Politiche Culturali' },
    { nome:'ICOM Italia',                 channelUrl:'https://www.youtube.com/channel/UCH2lJBVb0YT-Y02U2DXYZ8g', tematica:'Musei & Patrimonio' },
    { nome:'MART Rovereto',               channelUrl:'https://www.youtube.com/channel/UCnKZF6bP7Bx_KJm1i1Ktheg', tematica:'Arte Contemporanea' },
    { nome:'Fondazione Sandretto',        channelUrl:'https://www.youtube.com/channel/UCcFVKtBezLCPCdNFx0MSS5Q', tematica:'Arte Contemporanea' }
  ];
```

> NOTE: Channel IDs above are best-effort. Verify each by opening the URL in a browser. If wrong, find the correct one from the channel's YouTube page source (search for "channelId").

- [ ] **Step 3: Verify — run populaSeedVideoYoutubeMusei from GAS editor**

Expected: 10 added or skipped (if already present). Zero errors from @handle scraping.

- [ ] **Step 4: Sync and push**

```bash
cp oc-codebase/Codice.js "Osservatorio Culturale - codice/Codice.js"
cd "Osservatorio Culturale - codice" && clasp push
```

---

### Task 2: Podcast Sources Expansion

**Files:**
- Modify: `Codice.js` (add seedFontiPodcastV2 function after seedFontiPodcastRSS)
- Modify: `SetupMaster.js:~130` (redirect trigger to scanPodcastDiretto)

- [ ] **Step 1: Run existing seed functions from GAS editor**

Execute in order from GAS editor:
1. `pulisciFontiPodcastBloccate()` — removes blocked URLs
2. `seedFontiPodcastRSS()` — adds 8 existing seeds

- [ ] **Step 2: Add seedFontiPodcastV2 to Codice.js**

Add after `seedFontiPodcastRSS()` (~line 1095):

```javascript
function seedFontiPodcastV2() {
  Logger.log('=== SEED PODCAST V2 — FONTI CULTURALI ITALIANE ===');
  _ensureFontiPodTipoContenuto_();
  var seed = [
    { nome:'Europeana Pro Blog Audio',    url:'https://pro.europeana.eu/blog/rss.xml',                    tematica:'Digitale & Patrimonio' },
    { nome:'NEMO — European Museums',     url:'https://www.ne-mo.org/news/rss.xml',                      tematica:'Musei & Patrimonio' },
    { nome:'Culture Action Europe',       url:'https://cultureactioneurope.org/feed/',                    tematica:'Politiche Culturali' },
    { nome:'Tafter — Economia Cultura',   url:'https://www.tafter.it/feed/',                              tematica:'Gestione Culturale' },
    { nome:'Museum-iD',                   url:'https://museum-id.com/feed/',                              tematica:'Innovazione Museale' },
    { nome:'Il Giornale dell\'Arte',      url:'https://www.ilgiornaledellarte.com/feed/',                 tematica:'Arte & Mostre' },
    { nome:'MuseumNext',                  url:'https://www.museumnext.com/feed/',                         tematica:'Innovazione Museale' },
    { nome:'Doppiozero — Critica',        url:'https://www.doppiozero.com/feed/',                         tematica:'Critica Culturale' },
    { nome:'Artribune — News',            url:'https://www.artribune.com/feed/',                          tematica:'Arte Contemporanea' },
    { nome:'Finestre sull\'Arte',         url:'https://www.finestresullarte.info/feed',                   tematica:'Arte & Patrimonio' }
  ];
  var sh = _getFontiPodSheet();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL_RSS');
  var existing = new Set();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, iUrl+1, sh.getLastRow()-1, 1).getValues().forEach(function(r){
      existing.add(String(r[0]||'').trim());
    });
  }
  var aggiunti = 0, skip = 0;
  seed.forEach(function(s) {
    if (existing.has(s.url)) { skip++; return; }
    var iNome = headers.indexOf('Nome');
    var iTem  = headers.indexOf('Tematica');
    var iAtt  = headers.indexOf('Attiva');
    var iTipo = headers.indexOf('TipoContenuto');
    var row = new Array(headers.length).fill('');
    row[headers.indexOf('ID')] = 'POD' + Date.now() + '_' + aggiunti;
    row[iNome] = s.nome;
    row[iUrl]  = s.url;
    row[iTem]  = s.tematica;
    row[iAtt]  = true;
    if (iTipo >= 0) row[iTipo] = 'podcast';
    sh.appendRow(row);
    aggiunti++;
    Utilities.sleep(100);
  });
  Logger.log('=== Seed V2 completato: ' + aggiunti + ' aggiunti, ' + skip + ' gia presenti ===');
  return { aggiunti: aggiunti, skip: skip };
}
```

- [ ] **Step 3: Fix trigger redirect in SetupMaster.js**

Find `scanPodcastBisettimanale` function (~line 130) and change:
```javascript
// BEFORE:
return scanPodcast();
// AFTER:
return (typeof scanPodcastDiretto === 'function') ? scanPodcastDiretto() : scanPodcast();
```

- [ ] **Step 4: Sync, push, run seed from GAS editor**

```bash
cp oc-codebase/Codice.js "Osservatorio Culturale - codice/Codice.js"
cp oc-codebase/SetupMaster.js "Osservatorio Culturale - codice/SetupMaster.js"
cd "Osservatorio Culturale - codice" && clasp push
```
Then run `seedFontiPodcastV2()` from GAS editor. Expected: ~10 new sources added.

---

### Task 3: Publications Auto-Discovery (PubDiscovery_v1.js)

**Files:**
- Create: `PubDiscovery_v1.js`

- [ ] **Step 1: Create PubDiscovery_v1.js**

New file with the following functions. Full code provided — this is a self-contained module that writes to the existing Pubblicazioni sheet.

The module contains:
- `pubDiscoveryScan(opts)` — orchestrator (entry point)
- `pubDiscoveryTest()` — dry-run wrapper
- `pubDiscoverySetupTrigger()` — installs Monday 05:00 trigger
- `_pub_fetchOpenLibrary_(q, limit)` — Open Library API
- `_pub_fetchCrossref_(q, limit)` — Crossref API with polite pool
- `_pub_fetchOpenAlex_(q, limit)` — OpenAlex API
- `_pub_normalize_(raw, fonte)` — normalizes to Pubblicazioni schema
- `_pub_qualityScore_(item)` — scores 0-100, threshold 45
- `_pub_buildExistingIndex_(sh)` — builds dedup index (DOI, URL, title fingerprint)
- `_pub_isDuplicate_(item, index)` — 3-level dedup check
- `_pub_titleFingerprint_(title)` — fuzzy title matching
- `_pub_writeToSheet_(sh, items)` — appends rows with schema matching LIBRI_HEADERS
- `_pub_inferAmbito_(item)` — keyword-based ambito 1-5 assignment

- [ ] **Step 2: Sync, push, test dry-run**

```bash
cp oc-codebase/PubDiscovery_v1.js "Osservatorio Culturale - codice/PubDiscovery_v1.js"
cd "Osservatorio Culturale - codice" && clasp push
```
Run `pubDiscoveryTest()` from GAS editor. Expected: log shows candidates with scores, zero writes.

- [ ] **Step 3: Run live scan, verify Pubblicazioni sheet**

Run `pubDiscoveryScan()` from GAS editor. Check Pubblicazioni sheet for new rows with Fonte = 'open_library', 'crossref', or 'openalex'.

- [ ] **Step 4: Install trigger**

Run `pubDiscoverySetupTrigger()` from GAS editor. Verifies: trigger Monday 05:00 installed.

---

### Task 4: SocialWall Improvements

**Files:**
- Modify: `Codice.js` (fetchAndCacheSocialWall improvements + new seed function)

- [ ] **Step 1: Add seedSocialFontiV2 function to Codice.js**

Add after existing `seedSocialFontiIstituzionali` or at end of SocialWall section:

```javascript
function seedSocialFontiV2() {
  Logger.log('=== SEED SOCIAL FONTI V2 ===');
  var ss = getMainSS();
  var sh = ss.getSheetByName('SocialFonti');
  if (!sh) { Logger.log('Foglio SocialFonti non trovato'); return { error: 'SocialFonti non trovato' }; }
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var iUrl = headers.indexOf('URL');
  var existing = new Set();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, iUrl+1, sh.getLastRow()-1, 1).getValues().forEach(function(r){
      existing.add(String(r[0]||'').trim());
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
    aggiunti++;
  });
  Logger.log('=== Seed SW V2: ' + aggiunti + ' aggiunti, ' + skip + ' skip ===');
  return { aggiunti: aggiunti, skip: skip };
}
```

- [ ] **Step 2: Improve fetchAndCacheSocialWall in Codice.js**

Find `fetchAndCacheSocialWall` and apply these changes:
1. Change `fonti.slice(0, 8)` → `fonti.slice(0, 12)`
2. Change cutoff from `7*86400000` → `14*86400000`
3. Change final slice from `.slice(0, 16)` → `.slice(0, 24)`
4. Add URL dedup before final slice:

```javascript
// Add before the final .slice():
var seen = {};
posts = posts.filter(function(p) {
  if (!p.url || seen[p.url]) return false;
  seen[p.url] = true;
  return true;
});
```

- [ ] **Step 3: Sync, push, run seed**

```bash
cp oc-codebase/Codice.js "Osservatorio Culturale - codice/Codice.js"
cd "Osservatorio Culturale - codice" && clasp push
```
Run `seedSocialFontiV2()` from GAS editor. Expected: 8 new sources added.

---

### Task 5: Editor Promotion Email Notification

**Files:**
- Modify: `Auth.js:899-936` (saveUserStatoRuolo — add promotion check)
- Modify: `Auth.js:~845` (add _sendEditorPromotionEmail_ helper)

- [ ] **Step 1: Add _sendEditorPromotionEmail_ helper to Auth.js**

Add after `_sendInviteEmail_` (around line 845). The complete function generates a branded Sinopia email with:
- Terracotta #8B3A1F brand colors, Georgia serif
- Subject: "Sei diventato Redattore di Sinopia — Osservatorio Culturale"
- Magic link via createSessione(email, 'invito')
- GDPR footer
- MailApp quota guard

- [ ] **Step 2: Add promotion trigger in saveUserStatoRuolo**

In Auth.js, replace lines 932 (`return { ok:true... }`) with:

```javascript
      // v5.2 — Notifica promozione a editor
      var wasEditor = (String(currentTargetRuolo || '').toLowerCase() === 'editor');
      var promotedToEditor = (!wasEditor && ruolo === 'editor' && stato === 'attivo');
      if (promotedToEditor) {
        try {
          var iNome = headers.indexOf('Nome');
          var nomeUtente = iNome >= 0 ? String(rows[i][iNome] || '').trim() : '';
          _sendEditorPromotionEmail_(email, nomeUtente);
          Logger.log('[saveUserStatoRuolo] Email promozione editor inviata a ' + email);
        } catch(eEd) {
          Logger.log('[saveUserStatoRuolo] Errore email editor: ' + eEd.message);
        }
      }
      return { ok:true, email: email, stato: stato, ruolo: ruolo };
```

- [ ] **Step 3: Sync, push, test**

```bash
cp oc-codebase/Auth.js "Osservatorio Culturale - codice/Auth.js"
cd "Osservatorio Culturale - codice" && clasp push
```
Test: from admin panel, change a test user from `lettore` to `editor` + `attivo`. Verify email received.

---

## Execution Order

Tasks are independent. Recommended order by risk (lowest first):
1. Task 3 (PubDiscovery) — new file, zero risk
2. Task 5 (Email editor) — isolated change in Auth.js
3. Task 2 (Podcast seeds) — additive, 1-line trigger fix
4. Task 4 (SocialWall) — additive seeds + minor fetchAndCacheSocialWall tweak
5. Task 1 (YouTube) — requires channel ID verification + optional API key setup
