# Design — Unificazione fonti "feed" (News + Podcast/Video) in un unico archivio

**Data**: 2026-06-02
**Autore**: Silvano Straccini / Duemilamusei (con Claude Code)
**Stato**: design approvato a voce, in attesa di revisione spec scritta
**Deploy di riferimento**: @438 (v4.19.x)

---

## 1. Obiettivo

Avere **un solo punto** da cui gestire le fonti che alimentano le risorse "feed" (News/RSS, Podcast, Video), così da poter aggiungere/modificare/disattivare una fonte senza dover toccare più fogli e senza divergenze tra dashboard e scansioni reali.

**Perimetro di questa iterazione** (deciso con l'utente):
- ✅ INCLUSO: fonti **News (rss)** + **Podcast** + **Video**.
- ❌ FUORI (giri successivi): **Bandi** (restano un sistema separato, con propri agenti), **Social Wall** (oggi ha un percorso a sé con cache), **MEPA** (abbandonato: barriera di accesso/legale).
- ✅ Solo **fonti**, non gli archivi-risorse (Items/Podcast restano dove sono).

## 2. Contesto attuale (dall'audit del 2026-06-02)

Le fonti vivono oggi in più fogli paralleli:
- `Fonti` (9 col) — 68 righe news; **è il foglio che `scanSources()` legge davvero** (per nome colonna, robusto).
- `SocialFonti` (11 col) — 43 righe fonti podcast.
- `FontiNews`/`FontiBandi_v5` FU17 (18 col) — migrazione FU17 iniziata ma `FontiNews` di fatto inutilizzato dallo scanner.
- foglio "redazioni" (3 col, senza header) — 7 righe metadati editoriali, malformato.

Problemi rilevati che questo intervento risolve:
- ~38/68 fonti news producono **zero** item (dead weight invisibile).
- Contatori delle fonti podcast (`SocialFonti`) **mai aggiornati** (restano 0).
- Ambiguità "source of truth": dashboard conta FU17, scanner legge `Fonti`.

## 3. Modello dati

### 3.1 Concetto: Contenitore → Fonti
- **Gruppo** = il contenitore/origine reale (una testata, un museo, un'istituzione: Artribune, MAXXI, Avvenire…).
- **Riga** = una singola fonte che quel contenitore emette.
- **Tipo** = cosa produce quella riga.
- Lo stesso `Gruppo` può avere **righe di Tipo diverso** (es. Artribune → una riga `rss` + una riga `podcast`).
- Una rubrica/sezione di una testata = **una riga** (con stesso `Gruppo`, diverso `URL_Feed`).

### 3.2 Schema del foglio `FontiFeed` (20 colonne)

| # | Colonna | Tipo | Chi la compila | Note |
|---|---|---|---|---|
| 1 | `ID` | testo | sistema | `FF` + timestamp |
| 2 | `Nome` | testo | utente | es. "Avvenire — Cultura" |
| 3 | `Gruppo` | testo | utente | contenitore/origine, es. "Avvenire" |
| 4 | `Tipo` | enum | utente | `rss` / `podcast` / `video` / `html` |
| 5 | `URL_Feed` | url | utente | indirizzo che lo scanner **scarica** (chiave di dedup) |
| 6 | `URL_Sito` | url | utente | homepage (opzionale) |
| 7 | `Ambito` | 1–5 | utente | ambito tematico |
| 8 | `AmbitoLabel` | testo | sistema/utente | etichetta ambito |
| 9 | `Dimensioni` | testo | utente | D1–D10 separate da virgola (opzionale, per "Per te") |
| 10 | `Categoria` | testo | utente | argomento libero |
| 11 | `Priorita` | 1–3 | utente | 1 alta · 2 media · 3 bassa |
| 12 | `Attiva` | bool | utente | accendi/spegni |
| 13 | `DataAggiunta` | data | sistema | |
| 14 | `UltimaScan` | data | **solo scanner** | |
| 15 | `UltimoEsito` | enum | **solo scanner** | OK/EMPTY/HTTP_ERR/PARSE_ERR |
| 16 | `NRecordTotali` | num | **solo scanner** | |
| 17 | `NRecordUltimo` | num | **solo scanner** | |
| 18 | `FailConsecutivi` | num | **solo scanner** | ≥3 → "silente" |
| 19 | `UltimoErrore` | testo | **solo scanner** | |
| 20 | `Note` | testo | utente | appunti liberi |

> Le colonne 13–19 sono scritte **solo dallo scanner**: utente e UI non le toccano → niente conflitti tra modifica a mano e pannello.

## 4. Componenti software

### 4.1 Adattatore di lettura (cuore della sicurezza)
- **`getFeedSources(tipo)`** — UNICO punto da cui gli scanner prendono le fonti.
  - Flag `USE_FONTI_FEED` **OFF** → legge i fogli legacy (`Fonti` per rss, `SocialFonti` per podcast/video). Comportamento identico ad oggi.
  - Flag `USE_FONTI_FEED` **ON** → legge `FontiFeed` filtrando per `Tipo`.
- **`updateFeedSourceStats(id, esito, nRecord, errore)`** — UNICO punto di scrittura contatori; con flag ON scrive su `FontiFeed` (sistemando il bug contatori podcast).

### 4.2 Modifiche agli scanner (minime, chirurgiche)
- `scanSources()` (news): sostituire la lettura diretta di `SH.FONTI` con `getFeedSources('rss')`; la scrittura contatori con `updateFeedSourceStats(...)`.
- Scanner podcast: stessa sostituzione con `getFeedSources('podcast'|'video')`.
- Nessun'altra logica di scansione cambia.

### 4.3 Migrazione una-tantum
- **`migraFontiFeed()`**:
  - Mappa `Fonti` → righe `Tipo=rss`; `SocialFonti` → `Tipo=podcast`/`video`.
  - Ricava `Gruppo` dal nome; dove ambiguo usa il nome stesso.
  - **Dedup** per `URL_Feed` normalizzato (lowercase, no slash finale); unisce contatori dei doppioni.
  - **Non distruttiva** (scrive solo `FontiFeed`), **idempotente** (no duplicati se rilanciata), con **report** (migrate/doppioni/silenti).
  - Esclude il foglio "redazioni" malformato (segnalato per revisione manuale).

### 4.4 Verifica
- **`verificaFontiFeed()`** (eseguibile con flag OFF, app intatta): confronta legacy vs `FontiFeed` e riporta differenze (n. attive per tipo, URL mancanti/cambiati, doppioni uniti).

### 4.5 Pannello admin
- Aggiungere `feed` ai tipi riconosciuti da `getFontiUnified`/`addFonteUnificataV2`/`toggleFonteUnified`/`deleteFonteUnified`, mappati su `FontiFeed`.
- La tab "Fonti" della web app opera sul nuovo foglio.

## 5. Sicurezza e reversibilità (3 reti)
1. **Deploy a freddo**: rilascio con flag **OFF** → app identica, zero rischio al rilascio.
2. **Rollback istantaneo**: flag **OFF** in 1 secondo, senza ridistribuire.
3. **Rollback deployment**: ritorno alla versione precedente da GAS (URL invariato).
Backup: i fogli `Fonti`/`SocialFonti` restano intatti finché non si depreca (Fase 7, rinomina non cancellazione).

## 6. Piano di rollout (fasi, ognuna verificata)
| Fase | Azione | Impatto |
|---|---|---|
| 0 | Sicurezza: commit/pulizia stato repo + backup fogli | nessuno |
| 1 | Crea foglio `FontiFeed` (vuoto + header) | nessuno |
| 2 | `migraFontiFeed()` popola+deduplica | nessuno (flag OFF) |
| 3 | `verificaFontiFeed()` confronto+report | nessuno |
| 4 | Deploy con flag OFF | app identica |
| 5 | Flag ON + 1 scansione manuale + verifica News/Podcast/contatori | reversibile |
| 6 | Osservazione + potatura manuale fonti morte | basso |
| 7 | Deprecare (rinominare) vecchi fogli | nullo |

## 7. Verifica / criteri di successo
- `verificaFontiFeed()` riporta **0 fonti attive perse** rispetto al legacy.
- Dopo flag ON + 1 scansione: News e Podcast ricevono nuovi record; `UltimaScan`/contatori si aggiornano in `FontiFeed` (anche per i podcast).
- Pannello admin "Fonti": aggiunta/attivazione/disattivazione di una fonte si riflette sul foglio e viceversa.
- Nessuna regressione nelle pagine News/Podcast/Video.

## 8. Rischi e controindicazioni
- **Timeout GAS (6 min)**: con molte fonti, scansione **a lotti** (pattern già usato in `GalMonitor`).
- **Quota `UrlFetchApp`**: ridotta potando le fonti morte.
- **Working tree sporco**: ~18 file modificati non committati + `.bak`. **Fase 0 obbligatoria** prima di iniziare.
- **Codice a indice di colonna**: usare lettura **per nome colonna** ovunque (come già fa `scanSources`).

## 9. Fuori scope (esplicito)
Bandi, Social Wall, MEPA, unificazione degli archivi-risorse. Ognuno eventuale iterazione separata.
