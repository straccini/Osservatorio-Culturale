# Osservatorio Culturale — Codebase Map

**Stack**: Google Apps Script (GAS) + HTML/JS frontend + Google Sheets backend
**Versione corrente**: v4.14.0 · deployment @165 del 05/05/2026
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
| `Sidebar.html` | Navigazione laterale: Home/Bandi/News/Podcast + 5 ambiti + strumenti admin |
| `HomeView.html` | Vista home: hero + bandi urgenti + 5 ambiti + news/podcast/stats |
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
| `UltimiBandi.js` | Endpoint `getUltimiBandiMonitorati`, `getBandiListV42`, `getNewsListV42`, `getPodcastListV42` | |
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

Tipi supportati: `'bando' | 'item' | 'news' | 'podcast'`.

### Workflow record (legacy, da Codice.js — @deprecated dopo Sprint 1.1)
- `toggleLettoBando(body)`, `archiviaRecord(body)`, `ripristinaRecord(body)`, `deleteArchiviato(body)`, `deleteArchivioBulk(ids)`, `deleteArchivioTutto()`, `autoArchiviaNotizieVecchie()`, `archiviaNotizieOlderThan(giorni)`, `eliminaArchiviatiTutti()`, `autoArchiviaScaduti()`, `toggleItemField(id,field)`, `setItemField(id,field,value)`

→ Rimangono per backward-compat con le chiamate frontend esistenti. Migrare progressivamente alle nuove funzioni unificate.

### Mailing list e digest
- `getMailingList()`, `saveMailing(body)`, `deleteMailing(id)`, `toggleMailingField(id,field)`
- `sendDigestAuto()` — invio automatico settimanale lunedì
- `sendDigest(itemIds, bandiIds, podcastIds)` — invio manuale
- `bandiEvery3Days()` / `sendBandiAlert()` ★ alias INT-7 — Telegram alert bandi ogni 72h
- `getDigestLog()`

### Setup e amministrazione
- `setupTriggers_v46()` — pulizia + ricreazione trigger Sprint 0
- `setupSheets()`, `initSheetsIfMissing()` — bootstrap struttura dati
- `setAdminEmails(csv)`, `setEditorEmails(csv)`, `getAdminEmails()`

---

## Schema dei fogli Google Sheets usati

**Spreadsheet principale**: aperto via `getMainSS()` (vedi Codice.js)

**Spreadsheet RADAR BANDI**: separato, ID `1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0`, aperto via `getSheetRadar()` (Codice.js riga 882)

### Fogli principali
- `Items` — news rilevate (colonne: ID, Titolo, Fonte, FonteURL, Data, Ambito, Score, Letto, Salvato, Archiviato, InclusiNelDigest, SommarioAI, TagAI, ...)
- `RADAR BANDI` — bandi (in Spreadsheet separato; colonne: TITOLO, ENTE, SETTORE, AMBITO, SCADENZA, DATA_RILEVAMENTO, STATO_RECORD ['attivo'|'archiviato'], LETTO_BANDO, ...)
- `Podcast` — podcast (colonne: ID, Titolo, Show, URL, DataRilevamento, Tematica, Ascoltato, StatoRecord, ...)
- `Fonti` — fonti RSS attive
- `MailingList` — destinatari digest (colonne: Email, Nome, Attivo, ...)
- `LOG` — log invii digest
- `ScanLog` ★ Sprint 0 — log scansioni (Timestamp, NomeFonte, Tipo, Esito, NumNuovi, Errore)
- `DigestLog` ★ Sprint 0 — log digest inviati
- `SocialFonti`, `FontiBandi` — fonti dedicate per categoria

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

---

## Checklist prima di ogni `clasp push`

- [ ] Verifica che il file di lock di Word (`~$_*.docx`) non sia nella cartella
- [ ] Confronta `clasp pull` con la versione locale per non sovrascrivere modifiche fatte dal web editor nel frattempo
- [ ] Esegui `clasp status` per vedere quali file verranno pushati
- [ ] Se push grande, fai backup locale: `xcopy . ../oc-codebase-backup-$(date) /E /I`

---

*Ultimo aggiornamento: 2026-05-03 — Sprint F→G (v4.13.0, deploy @134)*
