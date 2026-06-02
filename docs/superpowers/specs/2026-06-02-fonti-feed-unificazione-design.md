# Design — Unificazione fonti "feed" (News + Podcast + Video) in un unico archivio

**Data**: 2026-06-02 (rev. 2 dopo mappatura podcast/video)
**Autore**: Silvano Straccini / Duemilamusei (con Claude Code)
**Stato**: design approvato a voce, in attesa di revisione spec scritta
**Deploy di riferimento**: @438 (v4.19.x)

---

## 1. Obiettivo

Avere **un solo punto** (foglio `FontiFeed`) da cui gestire le fonti che alimentano News/RSS, Podcast e Video, così da aggiungere/modificare/disattivare una fonte senza toccare più fogli **né codice hardcoded**, e senza divergenze tra dashboard e scansioni reali.

**Perimetro:**
- ✅ INCLUSO: fonti **News (rss)** + **Podcast** + **Video**.
- ❌ FUORI (giri successivi): **Bandi** (sistema separato), **Social Wall** (`SocialFonti`, percorso a sé con cache), **MEPA** (abbandonato).
- ✅ Solo **fonti**, non gli archivi-risorse (i fogli `Items` e `Podcast` restano dove sono).

## 2. Contesto attuale (verificato 2026-06-02)

### 2.1 News
- Fonti nel foglio **`Fonti`** (9 col: `ID, Nome, URL, RSSURL, Ambito, AmbitoLabel, Attiva, UltimaScansione, NumItemRaccolti`).
- Letto da **`scanSources()`** (Codice.js ~2361) via `getFonti()`; scrive contatori via `updateFonteLastScan()`.

### 2.2 Podcast (DUE sorgenti)
- Array **hardcoded `FONTI_PODCAST`** (Scannerbandi.js:184-194) — 7 voci `{nome, url, tematica, priorita}`, solo audio.
- Foglio **`FontiPodcast`** (`ID, Nome, URL_RSS, Tematica, Attiva, UltimaScan, NumEpisodi` + col 8 `TipoContenuto` = `audio`|`video`).
- Letto da **`scanPodcastDiretto()`** (Codice.js ~1145, filtro `TipoContenuto='audio'` o vuoto). Contatori aggiornati da `scanSingolaFontePodcast()` (`UltimaScan`, `NumEpisodi`).

### 2.3 Video
- **Stesso foglio `FontiPodcast`** filtrato per `TipoContenuto='video'` (canali YouTube Atom).
- Letto da **`scanVideoYoutube()`** (Codice.js ~1003), che scrive record `VID*` nel foglio risorse `Podcast`.
- Seed canali via `populaSeedVideoYoutubeMusei()` / `addFonteVideoYoutube()`.

### 2.4 Fuori scope
- `SocialFonti` → **Social Wall** (`fetchAndCacheSocialWall`), NON è fonte podcast.
- Esiste una mezza-migrazione FU17 (`FontiVideo`, `migrateFontiPodcastSplit`) **mai usata** dagli scanner.

### 2.5 Problemi che l'intervento risolve
- Fonti sparse in **3 luoghi** (1 array codice + 2 fogli) → un unico archivio.
- Per cambiare una fonte podcast oggi a volte serve **modificare il codice** (array) → eliminato.
- ~38/68 fonti news producono zero item (dead weight) → visibili e potabili.

## 3. Modello dati

### 3.1 Concetto: Contenitore → Fonti
- **Gruppo** = contenitore/origine reale (testata, museo, istituzione: Artribune, MAXXI…).
- **Riga** = una singola fonte emessa dal contenitore.
- **Tipo** = cosa produce: `rss` (news) | `podcast` | `video` | `html`.
- Stesso `Gruppo` può avere righe di Tipo diverso (Artribune → `rss` + `podcast`).
- Una rubrica/sezione = una riga (stesso `Gruppo`, diverso `URL_Feed`).

### 3.2 Schema del foglio `FontiFeed` (20 colonne)

| # | Colonna | Chi la compila | Note |
|---|---|---|---|
| 1 | `ID` | sistema | `FF`+timestamp |
| 2 | `Nome` | utente | es. "Artribune — Cultura" |
| 3 | `Gruppo` | utente | contenitore/origine |
| 4 | `Tipo` | utente | `rss`/`podcast`/`video`/`html` |
| 5 | `URL_Feed` | utente | indirizzo scaricato (chiave dedup) |
| 6 | `URL_Sito` | utente | homepage (opzionale) |
| 7 | `Ambito` | utente | 1–5 |
| 8 | `AmbitoLabel` | sistema/utente | |
| 9 | `Dimensioni` | utente | D1–D10 separate da virgola (opzionale) |
| 10 | `Categoria` | utente | argomento (mappa da `Tematica` per podcast) |
| 11 | `Priorita` | utente | 1–3 |
| 12 | `Attiva` | utente | |
| 13 | `DataAggiunta` | sistema | |
| 14 | `UltimaScan` | **solo scanner** | |
| 15 | `UltimoEsito` | **solo scanner** | OK/EMPTY/HTTP_ERR/PARSE_ERR |
| 16 | `NRecordTotali` | **solo scanner** | |
| 17 | `NRecordUltimo` | **solo scanner** | |
| 18 | `FailConsecutivi` | **solo scanner** | ≥3 → silente |
| 19 | `UltimoErrore` | **solo scanner** | |
| 20 | `Note` | utente | |

Colonne 13–19 scritte solo dallo scanner → nessun conflitto foglio/UI.

## 4. Componenti software

### 4.1 Flag per-tipo (3 interruttori indipendenti)
- `USE_FONTI_FEED_RSS`, `USE_FONTI_FEED_PODCAST`, `USE_FONTI_FEED_VIDEO` (ScriptProperties).
- Permettono di accendere/verificare **un tipo alla volta**, ognuno con rollback proprio.
- Helper: `isFontiFeedEnabled_(tipo)`, `enableFontiFeed(tipo)`, `disableFontiFeed(tipo)`.

### 4.2 Adattatore di lettura `getFeedSources(tipo)`
Unico punto da cui gli scanner prendono le fonti. Per ciascun tipo, lo stato **OFF replica esattamente la sorgente attuale**:
- `rss` OFF → `getFonti()` (foglio `Fonti`).
- `podcast` OFF → array `FONTI_PODCAST` + foglio `FontiPodcast` righe `TipoContenuto` in {audio, vuoto}, deduplicate (come fa oggi `scanPodcastDiretto`).
- `video` OFF → foglio `FontiPodcast` righe `TipoContenuto='video'`.
- Qualsiasi tipo ON → `FontiFeed` filtrato per `Tipo`.
Ritorna oggetti **shape-compatibili** con gli scanner esistenti, includendo `priorita` (per il filtro settimanale podcast).

### 4.3 Adattatore di scrittura `updateFeedSourceStats(tipo, fonte, esito, nRecord, errore)`
- OFF → comportamento legacy del tipo (es. `updateFonteLastScan` per news; `scanSingolaFontePodcast`-like per podcast).
- ON → scrive contatori/esito/fail su `FontiFeed`.

### 4.4 Migrazione `migraFontiFeed()`
- News ← `Fonti` (Tipo=rss).
- Podcast ← `FONTI_PODCAST` array + `FontiPodcast`(audio) (Tipo=podcast; `Tematica`→`Categoria`; `URL_RSS`→`URL_Feed`).
- Video ← `FontiPodcast`(video) (Tipo=video).
- Dedup per `URL_Feed` normalizzato; `Gruppo` best-effort dal nome.
- **Non distruttiva** (scrive solo `FontiFeed`), **idempotente**, con **report**.

### 4.5 Verifica `verificaFontiFeed()`
Eseguibile a flag OFF: confronta, per ciascun tipo, le fonti attive legacy vs `FontiFeed` e segnala mancanti/doppioni.

### 4.6 Cablaggio scanner (chirurgico)
- `scanSources()` → `getFeedSources('rss')` + `updateFeedSourceStats('rss', …)`.
- `scanPodcastDiretto()` → `getFeedSources('podcast')` (+ filtro settimanale su `priorita` invariato) + `updateFeedSourceStats('podcast', …)`.
- `scanVideoYoutube()` → `getFeedSources('video')` + `updateFeedSourceStats('video', …)`.

### 4.7 Pannello admin
- Aggiungere `feed` ai tipi riconosciuti da `getFontiUnified` (lettura). Aggiunta/disattivazione anche a mano sul foglio.

## 5. Sicurezza e reversibilità
1. **Deploy a freddo**: rilascio con i 3 flag **OFF** → app identica.
2. **Rollback istantaneo per tipo**: `disableFontiFeed(tipo)` in 1 secondo.
3. **Rollback deployment**: ritorno versione precedente da GAS (URL invariato).
Backup: `Fonti`, `FontiPodcast` restano intatti; `FONTI_PODCAST` array NON si tocca finché stabile.

## 6. Rollout (staggered per tipo, ognuno verificato)
| Fase | Azione | Impatto |
|---|---|---|
| 0 | Sicurezza: branch + backup fogli | nessuno |
| 1 | Crea `FontiFeed` | nessuno |
| 2 | `migraFontiFeed()` (3 tipi) | nessuno (flag OFF) |
| 3 | `verificaFontiFeed()` | nessuno |
| 4 | Deploy con 3 flag OFF | app identica |
| 5a | `enableFontiFeed('rss')` + 1 scan news + verifica | reversibile |
| 5b | `enableFontiFeed('podcast')` + 1 scan podcast + verifica | reversibile |
| 5c | `enableFontiFeed('video')` + 1 scan video + verifica | reversibile |
| 6 | Osservazione + potatura fonti morte | basso |
| 7 | Deprecare array `FONTI_PODCAST` + rinominare fogli legacy | basso |

## 7. Criteri di successo
- `verificaFontiFeed()`: 0 fonti attive perse per ciascun tipo.
- Dopo ogni accensione: lo scanner relativo raccoglie record e aggiorna contatori in `FontiFeed`.
- Aggiungere una fonte (foglio o pannello) la rende scansionabile senza modifiche al codice.
- Nessuna regressione nelle pagine News/Podcast/Video.

## 8. Rischi e controindicazioni
- **Timeout GAS (6 min)**: scansione a lotti (pattern `GalMonitor`).
- **Filtro settimanale podcast**: va preservato (basato su `priorita`); l'adattatore restituisce `priorita`.
- **Doppia sorgente podcast** (array + foglio): l'OFF-path deve replicare l'unione+dedup attuale.
- **Working tree sporco**: Fase 0 obbligatoria.
- **Lettura per nome colonna** ovunque.

## 9. Fuori scope (esplicito)
Bandi, Social Wall, MEPA, unificazione archivi-risorse, eliminazione immediata della mezza-migrazione FU17 `FontiVideo`/`FontiPodcast` (verrà superata da `FontiFeed`).
