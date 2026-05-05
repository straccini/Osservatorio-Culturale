# Osservatorio Culturale — Codebase Map

**Stack**: Google Apps Script (GAS) + HTML/JS frontend + Google Sheets backend
**Versione corrente**: v4.15.4 · deployment @183 del 05/05/2026
**URL produzione DEFINITIVO** (accesso "Chiunque"): `https://script.google.com/macros/s/AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs/exec`
**URL precedente DEPRECATO** (v4.6.0 e antecedenti): `https://script.google.com/macros/s/AKfycbzpfAFUPEtfHD-zSWmYkhOQ9z_nLyPogWRZhZfCr2Xy6p3Jh8QICSemUHPeEICEIa5O/exec`
**Script ID**: `1VXXzcHRB6kv34Dvqfp5p0x1zMzRtDhSDzmf-jsMtiD2hK2U0gG6uaTPx`
**Owner**: Silvano Straccini · Duemilamusei

---

## Mappa file → responsabilità

### Costanti e configurazione
| File | Responsabilità |
|---|---|
| `appsscript.json` | Manifest GAS (timezone, runtime V8, executeAs, access) |
| `.clasp.json` | Configurazione clasp per push/pull |
| `Constants.js` ★ NUOVO Sprint 1.1 | **Single source of truth** per ambiti, versione, soglie operative |

### Frontend (HTML)
| File | Ruolo |
|---|---|
| `Index.html` | Container principale, assembla tutti i moduli |
| `Topbar.html` | Header: search globale + breadcrumb + profilo utente |
| `Sidebar.html` | Navigazione laterale: Home/Bandi/News/Podcast/Video/Libri + 5 ambiti + strumenti admin |
| `HomeView.html` | Vista home "rivista digitale": hero + stats bar + bandi + news + podcast+video + libri + ambiti chips |
| `Navigation.html` | **Orchestrator JS frontend**: oggetto globale `OC` con metodi |
| `Styles.html` | CSS — design system editoriale v4.12 (palette carta da museo, dark mode, tipografia) |
| `Digestreader.html` | Pagina dedicata digest reader (link da email digest) |

### Backend (JS / GS)
| File | Responsabilità | Note |
|---|---|---|
| `Codice.js` | Monolite legacy con 100+ funzioni: routing `doGet`/`doPost`, scanner, mailing, digest, stats | **Da spaccare progressivamente** |
| `Constants.js` ★ | Source of truth costanti (ambiti, versione, soglie) | NUOVO Sprint 1.1 |
| `Workflow_unified.js` ★ | API unificata `markRead/toggleSaved/archive/restore` + auto trigger | NUOVO Sprint 1.1 |
| `Sprint0_Module.js` | Refactoring Sprint 0: counter unificati, ScanLog, digest bandi 3gg, alias `sendBandiAlert` | |
| `Addon_v42.js` | Endpoint v4.2: `getHomepageDataV42`, `getAmbitoDataV42`, `getGlobalSearchV42`, `migraBandiAmbito` | Estensione di Codice.gs |
| `Scannerbandi.js` | Modulo scanner bandi dedicato | |
| `UltimiBandi.js` | Endpoint `getUltimiBandiMonitorati`, `getBandiListV42`, `getNewsListV42`, `getPodcastListV42`, `getVideoListV42`, `getLibriListV42` | Sprint N1-N4 |
| `CurrentUser_v44.js` | Sistema utenti/ruoli (admin/editor/lettore/guest) | |
| `Admin_v44.js` | Dashboard admin |  |
| `Newsletter_v44.js` | Gestione newsletter (flusso approve via Telegram) | |
| `Telegram_v44.js` | Bot Telegram per notifiche bandi/news | |
| `Server_v44_doGet_patch.js` | Hot-fix routing per approve newsletter via link | **Da integrare nel doGet di Codice.js** |

---

## Convenzioni di naming

**REGOLA NUOVA (Sprint 1.1)**: niente più suffissi `_v44` / `_v42` nei nomi dei file. La versione viene tracciata nell'header del file e in `Constants.js → OC_VERSION`.

**Naming target dopo Sprint 1.1**:
- File backend: `PascalCase.js` (es. `Newsletter.js`, `Telegram.js`, `Admin.js`)
- File frontend: `PascalCase.html` (es. `Sidebar.html`, `Topbar.html`)
- Funzioni pubbliche: `camelCase` (es. `getHomepageData`, `markRead`)
- Funzioni helper private: `_camelCase_` con underscore (es. `_wfConfig_`, `_getAdminSet_`)
- Costanti: `OC_UPPER_SNAKE_CASE` (es. `OC_AMBITI`, `OC_VERSION`)

I file con suffisso versione vanno rinominati nei prossimi sprint, sempre con backward-compat alias se chiamati dal frontend.

---

## Regole di deploy

### Deploy via GAS web editor (procedura sicura collaudata v4.6.0)

1. Apri progetto Apps Script → **Distribuisci → Gestisci distribuzioni**
2. Sulla distribuzione attiva → click **icona MATITA ✏️** (Modifica)
3. Versione → seleziona **"Nuova versione"** (NON una versione esistente)
4. Descrizione: `vX.Y.Z — sintesi modifiche`
5. NON toccare "Eseguito come" e "Chi può accedere"
6. Click **Distribuisci**
7. Verifica che l'URL resti **identico** (stesso `AKfycbz...`)
8. Test in **finestra incognito** del browser

⚠️ **MAI cliccare "+ Nuova distribuzione"**: cambia URL e perdiamo gli utenti.
⚠️ **MAI cliccare cestino** sulla distribuzione attiva.

### Deploy via clasp (locale → GAS)

```bash
cd "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\Osservatorio Culturale - codice"
clasp push                # carica modifiche locali su GAS
clasp open                # apre l'editor GAS web per fare deploy
```

Dopo `clasp push` la distribuzione attiva NON cambia automaticamente: per portare in produzione serve sempre il deploy manuale via web editor (procedura sopra).

---

## Funzioni pubbliche chiamabili da frontend (`google.script.run`)

### Identità e autenticazione
- `getCurrentUser_v44()` — profilo utente corrente

### Dati di pagina (v4.2 redesign)
- `getHomepageDataV42()` — payload completo home (con INT-1: include ora `ultimaScansione` e `nuoviOggi`)
- `getAmbitoDataV42(ambitoId)` — payload pagina ambito singolo
- `getGlobalSearchV42(q)` — ricerca cross-categoria
- `getOcConstants()` ★ NUOVO Sprint 1.1 — costanti centralizzate (ambiti, versione, soglie)

### Workflow record (v4.7 — Sprint 1.1)
- `markRead(tipo, id)` — segna come letto
- `toggleSaved(tipo, id)` — toggle "salvato"
- `archive(tipo, id)` — archivia
- `restore(tipo, id)` — ripristina da archivio
- `autoArchiveOld(tipo, soglia_giorni)` — automatico (chiamato da trigger)
- `autoDeleteVeryOld(tipo, soglia_mesi)` — distruttivo, chiamato manualmente

Tipi supportati: `'bando' | 'item' | 'news' | 'podcast' | 'libro'`.

### Workflow record (legacy, da Codice.js — @deprecated dopo Sprint 1.1)
- `toggleLettoBando(body)`, `archiviaRecord(body)`, `ripristinaRecord(body)`, `deleteArchiviato(body)`, `deleteArchivioBulk(ids)`, `deleteArchivioTutto()`, `autoArchiviaNotizieVecchie()`, `archiviaNotizieOlderThan(giorni)`, `eliminaArchiviatiTutti()`, `autoArchiviaScaduti()`, `toggleItemField(id,field)`, `setItemField(id,field,value)`

→ Rimangono per backward-compat con le chiamate frontend esistenti. Migrare progressivamente alle nuove funzioni unificate.

### Mailing list e digest
- `getMailingList()`, `saveMailing(body)`, `deleteMailing(id)`, `toggleMailingField(id,field)`
- `sendDigestAuto()` — invio automatico settimanale lunedì
- `sendDigest(itemIds, bandiIds, podcastIds)` — invio manuale
- `bandiEvery3Days()` / `sendBandiAlert()` ★ alias INT-7 — Telegram alert bandi ogni 72h
- `getDigestLog()`

### Dati sezioni rivista digitale (Sprint N1-N4)
- `getNewsListV42(limit)` — news dal foglio Items (colonna FonteURL per link, DataPubblicazione per data)
- `getPodcastListV42(limit)` — podcast dal foglio Podcast (filtra VID esclusi, StatoRecord≠archiviato)
- `getVideoListV42(limit)` — video dal foglio Podcast (solo ID=VID*, colonna DataPubblicazione)
- `getLibriListV42(limit)` — libri dal foglio Pubblicazioni (isRecente = aggiunto negli ultimi 30gg)
- `getGlobalSearchV42(q)` — ricerca cross-sezione: news, bandi, podcast, video, libri → `{q, news[], bandi[], podcast[], video[], libri[]}`
- `addLibro(body)` — aggiunta manuale libro (editor/admin); doPost action `addLibro`
- `setupPubblicazioniSheet()` — crea foglio Pubblicazioni + seed 10 titoli; doPost action `setupPubblicazioniSheet`

### Setup e amministrazione
- `setupTriggers_v46()` — pulizia + ricreazione trigger Sprint 0
- `setupSheets()`, `initSheetsIfMissing()` — bootstrap struttura dati
- `setAdminEmails(csv)`, `setEditorEmails(csv)`, `getAdminEmails()`
- `addFontiIstituzionali()` — aggiunge 10 fonti news istituzionali al foglio Fonti (one-shot)
- `addFontiNewsNuove()` — aggiunge 10 nuove fonti news qualitative (Sprint N1, one-shot)
- `addFonteVideoYoutube(body)` — aggiunge canale YouTube alle fonti podcast/video
- `populaSeedVideoYoutubeMusei()` — seed 10 canali musei italiani YouTube (one-shot)

---

## Schema dei fogli Google Sheets usati

**Spreadsheet principale**: aperto via `getMainSS()` (vedi Codice.js)

**Spreadsheet RADAR BANDI**: separato, ID `1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0`, aperto via `getSheetRadar()` (Codice.js riga 882)

### Fogli principali
- `Items` — news rilevate · header: `ID, Ambito, AmbitoLabel, Fonte, FonteURL, Titolo, Estratto, SommarioAI, SommarioEditato, TagAI, Score, Tipologia, DataPubblicazione, DataAcquisizione, Scadenza, Letto, Salvato, Archiviato, InclusiNelDigest`
- `RADAR BANDI` — bandi (Spreadsheet separato ID `1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0`) · header: `Data_Rilevamento, Titolo, Ente, Settore, Ambito, Scadenza, Link, StatoRecord, ...`
- `Podcast` — podcast **e video** (ID=VID* per i video) · header: `ID, DataRilevamento, Titolo, Serie, Autore, Tematica, Durata, DataPubblicazione, Link, SommarioAI, TagAI, Score, Fonte, Ascoltato, DaAscoltare, InclusiNelDigest, StatoRecord`
- `Pubblicazioni` ★ Sprint N4 — libri/pubblicazioni curate · header: `ID, Titolo, Autore, Editore, Anno, Ambito, Tematica, Descrizione, Link, Copertina_URL, DataAggiunta, Fonte, Stato, Score, Letto, Salvato`
- `Fonti` — fonti RSS attive · header: `ID, Nome, URL, RSSURL, Ambito, AmbitoLabel, Attiva, UltimaScansione, NumItemRaccolti`
- `MailingList` — destinatari digest
- `DigestLog` ★ Sprint 0 — log digest inviati
- `ScanLog` ★ Sprint 0 — log scansioni
- `SocialFonti`, `FontiBandi` — fonti dedicate per categoria

### ⚠️ Colonne critiche per i mapper (bug storici risolti Sprint N1-N2)
- **Items**: URL articolo → colonna `FonteURL` (non `Link`/`URL`); data → `DataPubblicazione` (non `Data`)
- **Podcast**: data → `DataPubblicazione` (non `Data_Pubblicazione`); show/canale → `Serie` (non `Show`)
- **Video**: stesso foglio Podcast, filtro `String(ID).startsWith('VID')`

### Fogli ScriptProperties usati
- `OC_ADMIN_EMAILS` — CSV email admin (default: `s.straccini@gmail.com`)
- `OC_EDITOR_EMAILS` — CSV email editor
- `OC_NL_DRAFT_<draftId>` — bozze newsletter in attesa di approvazione

---

## 5 Ambiti tematici (definiti in `Constants.js`)

| ID | Num | Nome | nomeBreve | Colore | CSS var |
|---|---|---|---|---|---|
| 1 | 01 | Identità e narrazione museale | Identità | `#6B5C9A` | `--amb-1` |
| 2 | 02 | Inclusione e accessibilità | Inclusione | `#3F7A5E` | `--amb-2` |
| 3 | 03 | Programma, mostre e collezioni | Programma | `#3C6A95` | `--amb-3` |
| 4 | 04 | Comunità e welfare culturale | Comunità | `#9C6A36` | `--amb-4` |
| 5 | 05 | Digital, AI e governance | Digital & Gov | `#4A7884` | `--amb-5` |

**Convergenza con MuseMu Matrix**: ogni ambito mappa a una o più dimensioni del modello di autovalutazione musei (vedi progetto MuseMu Matrix).

---

## Trigger automatici attivi (impostati da `setupTriggers_v46`)

| Funzione | Frequenza | Ora |
|---|---|---|
| `scanSources` | ogni 6h | continuo |
| `scanBandiAutomatico` (se esiste) | ogni 6h | continuo |
| `scanPodcast` (se esiste) | ogni 24h | 03:00 |
| `lunediMattina` (digest settimanale) | settimanale | lunedì 07:00 |
| `bandiEvery3Days` / `sendBandiAlert` | ogni 72h | continuo |

---

## Roadmap pulizia

### ✅ Sprint A (2026-05-03) — Allineamento frontend
- Index.html usa `include()` per Sidebar, Topbar, HomeView
- Dark mode toggle attivo via Topbar.html
- Ambiti sidebar allineati a Constants.js

### ✅ Sprint B (2026-05-03) — Stile editoriale pagine
- Page header editoriale (`.page-head` + `.page-title`) per Bandi, News, Podcast
- Filter chips v4.12 (`.filters` + `.filter-chip` pill)
- Ambito hero 2 colonne bianco editoriale + classe aX dinamica
- renderAmbito completo; renderUltimiBandi aggiunto

### ✅ Sprint C (2026-05-03) — Cleanup e documentazione
- Constants.js OC_VERSION aggiornato a v4.12.3
- CLAUDE.md: versione, deployment, ambiti allineati

### ✅ Sprint D (2026-05-03) — Renderer pagine complete
- loadBandi / loadNews / loadPodcast con cache client
- Filter chip attivi (ambito + urgenti) senza re-fetch
- calcGiorni e ambNum lato client
- loadUltimiBandiHome per sezione home

### ✅ Sprint E (2026-05-03) — Naming e cleanup file
- Rinominato `Stiles.html` → `Styles.html`; include aggiornato
- Eliminato `Index_backup_v43.html`
- sync-oc-to-gas.ps1: pulizia automatica file obsoleti nel target

### ✅ Sprint F (2026-05-03) — MuseMu Matrix integrato
- `MatrixApp.html`: questionario adattivo 43 domande, 10 dimensioni, step intro→anagrafica→domande→sezione11→report
- `Matrix_v1.js`: scoring server-side, profili P1-P5, top3 opportunità, PDF via DocumentApp, email via MailApp
- `Matrix_schema.js`: schema OC_MATRIX_SCHEMA v1.0.2 embedded
- Report finale: barplot dimensioni + top3 + servizi Duemilamusei + roadmap 3 fasi + sezione 12 opt-in
- Cross-link `mx-oc-link` → `OC.go()` per ambiti pertinenti (wired in Navigation.html)
- `#page-matrix-landing`: pagina commerciale con CTA → `OC.go('matrix')`
- Sidebar: "Valuta il tuo museo" (nav-item-matrix); HomeView: promo card con "Inizia ora" + "Scopri di più"
- ⚠️ **Setup obbligatorio (una sola volta da editor GAS)**: eseguire `setupMatrixSheets()` per creare fogli `ResponsesMatrix` e `ContactsMatrix`

### ✅ Sprint G (2026-05-03) — Espansione fonti monitoraggio
- `Scannerbandi.js`: aggiunta `FONTI_ASSOCIAZIONI` (+10 enti: ICOM Italia, Federculture, Symbola, MAB, AMACI, Fitzcarraldo, Compagnia S.Paolo, NEMO, MuseumNext)
- `Scannerbandi.js`: aggiunta `FONTI_NEWS_ISTITUZIONALI` (+10 RSS: ICOM, Federculture, Symbola, Fitzcarraldo, MuseumNext, Artribune, GiornaledelleFondazioni, Tafter, Doppiozero, Patrimonio ER)
- `Codice.js`: aggiunta `addFontiIstituzionali()` — setup one-shot per aggiungere le 10 nuove fonti news al foglio `Fonti`
- ⚠️ **Setup obbligatorio**: eseguire `addFontiIstituzionali()` una volta da editor GAS dopo deploy

### ✅ Sprint N1 (2026-05-05) — News: card rivista digitale
- `UltimiBandi.js`: `getNewsListV42` — fix colonne `FonteURL` (link articolo) e `DataPubblicazione` (data); aggiunto campo `sommario`
- `Scannerbandi.js`: +10 fonti in `FONTI_NEWS_ISTITUZIONALI` (Finestre sull'Arte, Exibart, Il Giornale dell'Arte, FAI, MiC, The Art Newspaper, Treccani, Apollo, AIB, Touring Club)
- `Codice.js`: aggiunta `addFontiNewsNuove()` — one-shot setup nuove fonti
- `Index.html`: nuova `_newsCardHtml_` con layout `.br-row`; `renderNewsList2` con preset+amb; filtri 2 livelli (`#newsFilters` L1 + `#newsTematicheFilters` L2)
- `Styles.html`: classi `.nr-row`, `.nr-fonte`, `.nr-data`, `.nr-data-right`, `.nr-score`
- ⚠️ **Setup obbligatorio**: eseguire `addFontiNewsNuove()` una volta da editor GAS

### ✅ Sprint N2 (2026-05-05) — Podcast: card rivista digitale
- `UltimiBandi.js`: `getPodcastListV42` — fix colonne `DataPubblicazione` e `Serie`
- `Index.html`: `_podcastCardHtml_` riscritta con `.br-row`; `renderPodcastList2` con 2 livelli; filtri `#podcastFilters` L1 + `#podcastTematicheFilters` L2
- `Styles.html`: classi `.pd-row`, `.pd-recente`, `.pd-show`

### ✅ Sprint N3 (2026-05-05) — Video: pagina dedicata YouTube
- `UltimiBandi.js`: nuova `getVideoListV42(limit)` — legge foglio Podcast, filtra `ID=VID*`, restituisce `canale`, `isRecente`
- `Sidebar.html`: voce "Video" con icona telecamera
- `Index.html`: pagina `#page-video` completa; `_videoCardHtml_`; `renderVideoList`; filtri 2 livelli; `loadVideoList` in `hydrate`
- `Styles.html`: classi `.vd-row`, `.vd-recente`, `.vd-canale`
- Per popolare: eseguire `seedVideoMusei()` dall'admin (10 canali musei italiani)

### ✅ Sprint N4 (2026-05-05) — Libri: nuova sezione pubblicazioni
- `Codice.js`: `SH.LIBRI = 'Pubblicazioni'`; `setupPubblicazioniSheet()` con 10 seed bibliografici; `getLibriList()`; `addLibro()`; routing doPost
- `UltimiBandi.js`: nuova `getLibriListV42(limit)` — legge foglio Pubblicazioni, `isRecente` = aggiunto negli ultimi 30gg
- `Sidebar.html`: voce "Libri" con icona libro
- `Index.html`: pagina `#page-libri`; `_libroCardHtml_`; `renderLibriList`; form aggiungi libro (admin); `OC.saveLibro()` + `OC.setupLibri()`
- `Styles.html`: classi `.lb-row`, `.lb-editore`, `.lb-autore`, `.lb-anno`, form CSS
- ⚠️ **Setup obbligatorio**: aprire sezione Libri e cliccare "Inizializza foglio" oppure eseguire `setupPubblicazioniSheet()` da editor GAS

### ✅ Sprint N13 (2026-05-05) — Home stats, dark mode, mobile responsive
- `Index.html`: `hydrate()` — fetch video con `getVideoListV42(300)` e libri con `getLibriListV42(500)` (prima erano 4); popola `_cacheVideo`/`_cacheLibri` al caricamento iniziale (evita re-fetch alla navigazione) e aggiorna `statVideo`/`statLibri` con il totale reale (prima mostravano `4` invece del conteggio effettivo)
- `Index.html`: `renderVideoHome` e `renderLibriHome` — rimossa duplicazione aggiornamento stat (ora gestito da `hydrate`)
- `Styles.html`: dark mode per tutti i bottoni azione — `[data-theme="dark"] .br-act-read/arch/trash/save/save-on` con colori adattati (verde/ambra/rosso/grigio desaturati su fondo scuro)
- `Styles.html`: `@media (max-width:900px)` — `.br-row` passa a singola colonna; `.br-right` e `.br-acts` in riga da sinistra; `.home-pv-grid` singola colonna; `.st-kpi-grid` a 2 colonne; `.st-info-grid` singola colonna

### ✅ Sprint N12 (2026-05-05) — Cestino: fix completo + azioni card
- `Index.html`: `trashItem` — `.closest` esteso con `.br-row`; selettore titolo esteso con `.br-title` → le nuove card scompaiono correttamente dalla lista
- `Index.html`: `loadCestino` riscritta — usa layout `.br-row` con badge tipo, titolo barrato, bottone Ripristina (`br-act-read`)
- `Index.html`: `restoreItem` riscritta — rimossa chiamata GAS errata (`restore()` su item mai archiviato); ora rimuove card dal DOM cestino e ri-renderizza la lista corretta dalla cache; `_TIPO_LBL_CT` e `_TIPO_PAGE_CT` come lookup interni
- `Index.html`: `archiveItem` callback — invalida la cache del tipo corretto (`_cacheBandi`, `_cacheNews`, `_cachePodcast`, `_cacheVideo`, `_cacheLibri`) così la card non ricompare al prossimo render
- `Index.html`: `archiveCard`/`deleteCard` — riscritta con helper `_reloadByTipo_` che gestisce tutti e 5 i tipi (aggiunto video e libro, prima ignorati)

### ✅ Sprint N11 (2026-05-05) — Preferiti + fix filterBandi
- `UltimiBandi.js`: `getNewsListV42` — aggiunto campo `salvato` (colonna `Salvato` del foglio Items); `getLibriListV42` — aggiunto campo `salvato` (colonna `Salvato` del foglio Pubblicazioni)
- `Index.html`: `_newsCardHtml_` e `_libroCardHtml_` — aggiunto bottone ★ (`br-act-save`) con stato iniziale da `n.salvato`/`b.salvato`; classe `br-act-save-on` per elementi già salvati
- `Index.html`: `saveCard(tipo, id, el)` — riscritta con toast feedback e toggle visuale del bottone (★ ↔ ☆ + classe `br-act-save-on`)
- `Index.html`: `OC.filterBandi(preset)` — riscritta: naviga a bandi, imposta `_filterBandi.preset` (mappa `'urgenti'` → `'urgenti10'`), sincronizza chip attivo nella UI, ri-renderizza da cache
- `Index.html`: chip "★ Salvati" aggiunto a `#newsFilters` e `#libriFilters`; preset `'salvati'` gestito in `renderNewsList2` e `renderLibriList` (filtra `n.salvato === true`)
- `Index.html`: `archiveItem` e `markItemRead` — `.closest` esteso con `.br-row` (correggeva bug silenzioso: le nuove card non venivano rimosse/marcate visualmente)
- `Styles.html`: classi `.br-act-save`, `.br-act-save-on`, `.br-act-save:hover`, `.br-act-save-on:hover`

### ✅ Sprint N10 (2026-05-05) — Detail overlay completo + Pannello Guida
- `Index.html`: `openDetail` esteso con `_CACHE_MAP` per tutti e 5 i tipi (`_cacheVideo`, `_cacheLibri`); `_PAGE_MAP` per navigazione fallback corretta
- `Index.html`: `_renderDetail_` — label tipo dinamica (`_TIPO_LBL`); meta grid adattiva (canale/editore/autore/anno per tipo); link label adattiva (`_LINK_LBL`); bottoni azione per tipo (libro senza Cestino; etichetta Visto/Ascoltato/Letto corretta)
- `Index.html`: `OC.openVideo` e `OC.openLibro` aggiunti all'API pubblica
- `Index.html`: `#oc-guida-overlay` + `#oc-guida-panel` — pannello slide-in con sezioni Navigazione, Ambiti, Ricerca, Azioni, Setup admin, Supporto; `OC.openGuida()` / `OC.closeGuida()`; `data-action="openGuida"` della sidebar ora funzionante
- `Styles.html`: CSS `#oc-guida-overlay`, `#oc-guida-panel`, `.guida-section`, `.guida-h3`, `.guida-list`

### ✅ Sprint N9 (2026-05-05) — Statistiche + fix export archivio
- `Index.html`: nuova `#page-stats` con `loadStatsPage()` (3 chiamate parallele: `getStats`, `getVideoListV42`, `getLibriListV42`) e `renderStatsPage()` — KPI grid 5 tipi, barre per ambito (news), top 5 tematiche podcast, info scanner
- `Index.html`: `exportArchivio()` riscritta — usa `_cacheArchivio` se disponibile (zero re-fetch), altrimenti scarica tutti e 5 i tipi; colonne CSV estese (autore/canale/serie)
- `Index.html`: `PAGE_TITLES.stats = 'Statistiche'`; dispatch `if (page==='stats') loadStatsPage()`
- `Styles.html`: classi `.st-kpi-grid`, `.st-kpi-card`, `.st-kpi-val`, `.st-kpi-label`, `.st-section-title`, `.st-ambiti`, `.st-amb-row`, `.st-bar-wrap`, `.st-bar`, `.st-info-grid`, `.st-info-card`

### ✅ Sprint N8 (2026-05-05) — Archivio: upgrade completo
- `Workflow_unified.js`: `_wfConfig_` esteso con casi `video` (foglio Podcast, StatoRecord text) e `libro` (foglio Pubblicazioni, Stato text) — abilita `restore()` per entrambi i tipi
- `Workflow_unified.js`: `getArchivedItems` estesa per `tipo='video'` (filtra VID* da Podcast) e `tipo='libro'` (legge Pubblicazioni); fix `podcast`: usa `Serie` e `DataPubblicazione` (colonne reali)
- `Index.html`: `#archivioFilters` — chip Video + Libri aggiunti; click handler esteso per `archivioFilters` con `_filterArchivioTipo`
- `Index.html`: `loadArchivio()` riscritta — 5 chiamate parallele, `_cacheArchivio`, `renderArchivio()` con filtro tipo
- `Index.html`: `_archivioCardHtml_()` — nuova funzione card `.br-row` con badge tipo colorato, badge fonte, link, bottone Ripristina; `renderArchivio()` applica filtro tipo su cache

### ✅ Sprint N7 (2026-05-05) — Pagina Ambito: Video + Libri
- `Addon_v42.js`: `getAmbitoDataV42` estesa con video (`getVideoListV42` filtrato per ambito) e libri (`getLibriListV42` filtrato per ambito) → payload `{news, bandi, podcast, video, libri}`
- `Index.html`: `#page-ambito` — KPI bar estesa da 3 a 5 contatori (aggiunto Video + Libri); aggiunte sezioni `#ambitoVideoList` e `#ambitoLibriList` con skeleton + empty state
- `Index.html`: `renderAmbito()` riscritta con helper `_fill_` generico; gestisce tutti e 5 i tipi usando i renderer già esistenti (`_videoCardHtml_`, `_libroCardHtml_`)
- `renderAmbitiCounters`: totale chip home include anche `a.video` e `a.libri`

### ✅ Sprint N6 (2026-05-05) — Ricerca Globale
- `Addon_v42.js`: `getGlobalSearchV42` estesa con video (foglio Podcast, VID*) e libri (foglio Pubblicazioni) → ritorna `{q, news, bandi, podcast, video, libri}`
- `Index.html`: nuova `#page-search` con barra ricerca inline + `id="searchResults"`; `loadSearch(q)` + `renderSearchResults(data)` + `_srGroup_()` helper; `OC.search(q)` riscritta per navigare a `search` e chiamare `loadSearch`; `PAGE_TITLES.search = 'Ricerca'`
- Risultati raggruppati per tipo (Bandi / News / Podcast / Video / Libri) con badge colorati e link diretti; header gruppo con etichetta + contatore pill
- `Styles.html`: classi `.sr-query-bar`, `.sr-hint`, `.sr-group`, `.sr-group-head`, `.sr-group-label`, `.sr-group-count`, `.sr-row`, `.sr-badge` (con varianti `.bando`, `.urgente`)
- Compatibile con hero search Home + global search Topbar (entrambi chiamano `OC.search()`)

### ✅ Sprint N5 (2026-05-05) — Home: rivista digitale
- `HomeView.html`: redesign completo — stats bar (5 pill bandi/news/podcast/video/libri); sezione "News segnalate" (8 righe); griglia "Podcast + Video" 2 colonne (4+4); sezione "Libri" (4 righe); ambiti compatti come chips con contatore
- `Index.html`: `renderHome` aggiornato per stats bar; nuove `renderVideoHome` e `renderLibriHome`; `hydrate` carica anche `getVideoListV42(4)` e `getLibriListV42(4)`; `renderAmbitiCounters` aggiornato per `.hamb-chip`
- `Styles.html`: classi `.home-stats-bar`, `.hstat`, `.home-pv-grid`, `.hamb-chip`, `.hamb-num`, `.hamb-name`, `.hamb-count`

---

## Checklist prima di ogni `clasp push`

- [ ] Verifica che il file di lock di Word (`~$_*.docx`) non sia nella cartella
- [ ] Confronta `clasp pull` con la versione locale per non sovrascrivere modifiche fatte dal web editor nel frattempo
- [ ] Esegui `clasp status` per vedere quali file verranno pushati
- [ ] Se push grande, fai backup locale: `xcopy . ../oc-codebase-backup-$(date) /E /I`

---

*Ultimo aggiornamento: 2026-05-03 — Sprint F→G (v4.13.0, deploy @134)*
