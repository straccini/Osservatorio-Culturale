# Brief Claude Code — Round 2: completare/integrare le parti mancanti o non funzionanti

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script web app)
**Origine problemi (verificati file-per-file):** `docs/VERIFICA_E_BRIEF_ROUND2.md`
**Obiettivo:** rendere tutto **funzionante e rifinito**, con **massima efficienza**. Al termine la web app deve essere pubblicabile come strumento professionale e credibile.

---

## ⛔ FUORI SCOPO (NON toccare in questo round)
- **Login con email + magic-link**: NON modificare `loginConEmail`, il flusso magic-link `?t=`/`creaSessione`, né consolidare `authenticate()` (Codice.js:1434). Il sistema login resta com'è (è già fail-closed con flag admin). Se un fix incrocia questo flusso, fermati e segnala invece di modificarlo.

## MODALITÀ DI ESECUZIONE
- **Flusso unico e continuo**: esegui i GRUPPI A→E in sequenza, **senza fermarti** per approvazione. **Un commit per gruppo** (messaggio chiaro), poi prosegui.
- Per **efficienza**: lavora un GRUPPO alla volta = leggi i file di quel gruppo una sola volta, applica tutte le sue modifiche, verifica i criteri, committa.
- Riporta **solo alla fine** (riepilogo per gruppo + lista commit + stato), **oppure** fermati se incontri un blocco reale (rischio di rompere il flusso pubblico anonimo, o un fix che richiede di toccare il login escluso).
- Vincoli GAS: scope globale unico (attenzione a doppie `var`/funzioni omonime); gating via `_isCurrentUserAdmin_()` (token-based, già corretto); segreti in ScriptProperties; dopo le modifiche `clasp push` (il deploy manuale lo fa l'utente).

---

## GRUPPO A — Bandi: lettura/scrittura/scan coerenti
**File:** `UltimiBandi.js`, `Codice.js`, `Crossref_v1.js`, `Scannerbandi.js`, `Bandi_v5.js`

1. **🔴 Link e data bandi rotti a flag OFF** — `_radarBandiRows_` (`UltimiBandi.js:402-409`) legge `indexOf('Data_Rilevamento')` e `indexOf('Link')`, ma `getSheetRadar()` restituisce `Bandi_v5` (header `DataRilevamento`/`UrlBando`) e `USE_BANDI_V5` non è mai auto-attivato.
   **Fix (entrambi):**
   - in `_radarBandiRows_` usare lookup robusto: `_findCol_(head,['DataRilevamento','Data_Rilevamento','Data'])`, `_findCol_(head,['UrlBando','Link','URL'])`, `_findCol_(head,['StatoRecord','Stato'])`; aggiungere `'UrlBando'` a `COL_NAMES.LINK` (`Codice.js:1668`).
   - **e** attivare `enableBandiV5()` automaticamente a fine `runAllSetupV418` (Setup_v418.js) se il foglio `Bandi_v5` esiste e ha righe, così la config di default è coerente.
   - *Accettazione:* la pagina e la home Bandi mostrano **link e data** corretti sia a flag ON che OFF.
2. **🟠 Crossref riga a 26 col** — `Crossref_v1.js:236` `new Array(20)` → usare `new Array(COL_B_HEADERS.length).fill('')` e valorizzare `STATUS` (oltre a `STATO_RECORD`).
3. **🟠 `estraiConClaudeBandi`** (`Scannerbandi.js:285`) senza deadline/retry → aggiungere `deadline:30` e 1 retry con backoff su 429/5xx (riusa il pattern di `_claudeApiCall_` in `Bandi_v5.js:709`).
4. **🟡 `qualityCheckBandiAuto`** (`Bandi_v5.js:1209/2628`): includere l'URL nella chiave di dedup per evitare falsi positivi distruttivi (archivia bandi diversi stesso ente/scadenza).

*Commit:* `fix(bandi): lettura schema-safe + scrittura 26col + scan robusto (round2 A)`

---

## GRUPPO B — Frontend: credibilità, mobile, dark mode, branding
**File:** `HomeView.html`, `Styles.html`, `LandingPublic.html`, `SurveyPublic.html`, `Digestreader.html`, `Sidebar.html`, `Constants.js`, `Newsletter_v44.js`, `Addon_v42.js`

1. **🔴 Numeri Matrix incoerenti** → uniformare ovunque a **10 dimensioni · 43 domande**:
   - `LandingPublic.html:217,220-221,242,247` ("9 dimensioni · 27 domande · radar 9 assi" → 10/43);
   - `HomeView.html:128` (slide 3 "9 aree" → 10);
   - valutare `SurveyPublic.html:318,349-356,375` (se il sondaggio breve resta a 9 assi, esplicitarlo come "anteprima"; altrimenti allineare).
2. **🔴 Home rotta su mobile** — `Styles.html:909-919`: la media query è per la vecchia hero a grid; `.home-headline-frame > div:last-child{width:140px;height:140px}` ora schiaccia il **testo**. Riscriverla per la struttura **flex** attuale (l'immagine è `position:absolute`); il blocco testo deve restare a piena larghezza. Spostare `font-size:48px` inline (`HomeView.html:57`) in CSS con `clamp(28px,7vw,48px)`.
   - *Accettazione:* home leggibile e ordinata su <400px.
3. **🟠 Dark mode residui** (illeggibilità):
   - `HomeView.html:83,85,132,133` card carosello `background:#fff` → `var(--paper,#fff)`;
   - pigmento hero `#heroSinopiaImg` `mix-blend:multiply` annerisce su fondo dark → aggiungere override `[data-theme="dark"] #heroSinopiaImg{mix-blend-mode:screen; opacity:.5}` (o nascondere in dark) in `Styles.html`;
   - `Digestreader.html:142-143` `rd-data`/`rd-scad` `color:rgba(255,255,255,.x)` su fondo chiaro → colori leggibili (es. `var(--ink-3)`).
4. **🟡 Favicon** assente in tutte le pagine (Index/Landing/Survey/Digestreader/MatrixApp) → aggiungere `<link rel="icon" href="data:image/svg+xml,...">` nel `<head>` (un'icona "S" Sinopia, anche data-URI).
5. **🟡 Versione** `Sidebar.html:36` hardcoded → iniettare da `getOcConstants().version` (l'`id="sidebarVersion"` esiste già).
6. **🟡 Palette ambiti unica** — far derivare i colori da `OC_AMBITI` (Constants.js): rimuovere/riallineare `OC_AMB_COLORS_` (`Newsletter_v44.js:23`) e `ambitoColorV42_`/`ambitoLblV42_` (`Addon_v42.js:605/608`, con label vecchie "Tendenze/AI Cultura").
7. **🟡 Brand "Sinopia"** assente in Digestreader (firma "Osservatorio Culturale") e MatrixApp → uniformare la firma a "Sinopia · Osservatorio Culturale".

*Commit:* `fix(frontend): numeri Matrix 10/43, hero mobile, dark mode, favicon, palette, branding (round2 B)`

---

## GRUPPO C — Email & quota & contatti
**File:** `ROC_v1.js`, `Matrix_v1.js`, `Matrix_digest.js`, `Newsletter_v44.js`

1. **🔴 `roc_approveBatch`** (`ROC_v1.js:407-454`): applicare il cap mensile `ROC_CAP_PREPROG_MESE` (contare gli invii del mese su `ROC_BatchLog`/`ROC_Outreach`) **e** `if (MailApp.getRemainingDailyQuota() < soglia) break;` nel loop.
2. **🔴 Quota digest Matrix** — `sendMatrixReportEmail` (`Matrix_v1.js:1008`) e `sendQueuedDigest`/`sendAllPendingDigest` (`Matrix_digest.js`): aggiungere check `getRemainingDailyQuota()` + early-stop.
3. **🟠 `saveMatrixContact`** (`Matrix_v1.js:333`): deduplicare per `response_id`/email (cercare la riga esistente e fare update) per evitare contatti duplicati + doppio opt-in CRM.
4. **🟠 PDF report**: usare il **benchmark reale** anche nel PDF (`_matrixGetBenchmarkForProfile_`, `Matrix_v1.js:701`, oggi placeholder → chiamare `getMatrixCompareWithBenchmark`); cambiare sharing da `ANYONE_WITH_LINK` (`:934`) a non pubblico (link diretto/tokenizzato).
5. **🟠 Newsletter** (`Newsletter_v44.js`): `isActive` (`:141`) NON deve più trattare la cella vuota come attivo (rimuovere `|| attivo === ''`); aggiungere guard admin a `testInviaDigestATuttiGliIscritti()` (`:354`) e `testInviaDigestGeneralista()` (`:285`).

*Commit:* `fix(email): quota/cap ROC+Matrix, dedup contatti, benchmark PDF, newsletter (round2 C)`

---

## GRUPPO D — Agenti: reporting corretto + setup trigger pulito
**File:** `AgentSupervisore.js`, `AgentDigest.js`, `AgentAdmin.js`, `GalMonitor.js`, `FontiApiStrutturate.js`, `Codice.js`, `Setup_v418.js`

1. **🟠 Bug di reporting** (report falsati, non crash):
   - `AgentSupervisore.js:166-169` `archTot += autoArchiveOld(...)` somma un **oggetto** → usare `+= (r && r.archiviati) || 0`;
   - `:382,391,400` legge `.archived` invece di `.archiviati` → correggere;
   - stats invii: allineare `getAgentEmailStats` (`AgentDigest.js:306`, ritorna `perAgente` int) con ciò che legge `AgentAdmin.js:130` (`byAgent[id].sent/failed/lastSent`) — scegliere un formato unico (consigliato: estendere `getAgentEmailStats` a `{ byAgent: { '1':{sent,failed,lastSent}, ... } }`).
2. **🟠 Auto-archivio bandi da un solo punto** — oggi gira da `sasRun` MA1+MA4+MA5 + `agrRunOggi` + `galRunOggi` + trigger standalone `galSetupTrigger:465` (04:00). Tenere **un solo** invocatore (es. `sasRun` MA1) e rimuovere gli altri richiami/trigger duplicati.
3. **🟠 Liste "expected trigger" obsolete** → falsi allarmi: allineare `maAuditAlert` (`AgentSupervisore.js:501`: rimuovere `scanFontiTutte`, usare `scanSourcesBisettimanale`), `fasDiagnostica` (`FontiApiStrutturate.js:372`: cercare `fasRunCompleto` non `fasRunFase1`), `runAllSetupV418Status` (`Setup_v418.js:207`). Verificare che l'alert bandi 72h (`bandiEvery3Days`, tolto dallo schedule) sia effettivamente richiamato altrove; se no, reinserirlo.
4. **🟠 `setupTriggers()` (Codice.js:3785)** non neutralizzato → farlo ritornare verso `setupMasterTriggers()` (come gli altri setup deprecati), così non reinstalla trigger vecchi.
5. **🔴 FAS feed news come "bandi PNRR"** — `FontiApiStrutturate.js:37-57` `FAS_PNRR_FEEDS` (Artribune/Doppiozero) salvati con `settore:'PNRR / Cultura'` → rimuoverli o ricategorizzarli come news (non salvarli come bandi).
6. **🟠 Endpoint FAS inerti** (SEDIA `apiKey=SEDIA`, OpenCUP, Lombardia `ks5g-bke7`) girano ogni giorno sprecando quota → disattivare i parser che ritornano sempre 0/errore (flag o rimozione dallo schedule `fasRunCompleto`).

*Commit:* `fix(agenti): reporting corretto, auto-archivio unico, trigger allineati, FAS pulizia (round2 D)`

---

## GRUPPO E — Privacy / abuso / igiene dati
**File:** `ProfiloPro_v1.js`, `Privacy_v1.js`, `Prenotazioni_v1.js`, `Sondaggi_v1.js`, `Backend_v415.js`

1. **🔴 Diritto all'oblio incompleto** — `deleteProfilo` (`ProfiloPro_v1.js:158`) chiama `forgetMyData(user.email)` **senza token** → la cascata GDPR non parte. Fix **senza toccare il login**: far purgare direttamente i fogli (ResponsesMatrix/ContactsMatrix/CRM_Leads/MailingList) per l'email **già autenticata** da `_proGetUser_`, oppure aggiungere a `forgetMyData` un parametro `trustedEmail` usato solo dai chiamati server-side già autenticati.
2. **🟠 Rate-limit** su `savePrenotazioneIntent` (`Prenotazioni_v1.js:41`) e `saveSondaggio` (`Sondaggi_v1.js:150`) — endpoint anonimi che inviano email admin: aggiungere un rate-limit per IP-hash/email (riusa `_rateLimited_` di `Codice.js:528`, o il modello `_segCheckRateLimit_` di Segnalazioni).
3. **🟠 `exportArchivio`/`emptyTrash`** (`Backend_v415.js:303,384`) usano nomi colonna legacy (`Stato`/`URL`/`Data`) divergenti dal foglio `Items` reale (`StatoRecord`/`FonteURL`/`DataPubblicazione`) → export vuoto / news mai cancellate. Allineare i nomi colonna allo schema reale.
4. **🟡 `emptyTrash` audit-log** scrive `audit_emptyTrash_<ts>` in ScriptProperties senza purge (accumulo) → spostare su un foglio `AuditLog` o limitare la ritenzione.
5. **🟡 `validateHttpsCertificates:false`** globale (GalMonitor/Agent fetch) → limitarlo alle sole fonti marcate inaffidabili.

*Commit:* `fix(privacy): purga GDPR profilo, rate-limit form, export/emptyTrash schema (round2 E)`

---

## Definition of Done (Round 2)
- [ ] Bandi: link + data visibili in default (flag ON/OFF); scritture 26col coerenti.
- [ ] Frontend: numeri Matrix 10/43 ovunque; home ok su mobile; dark mode leggibile; favicon; versione dinamica; palette/branding uniformi.
- [ ] Email: quota/cap su ROC + digest Matrix; contatti deduplicati; newsletter cella-vuota=non-attiva + test-function gated.
- [ ] Agenti: report numerici corretti; auto-archivio da un solo punto; diagnostiche senza falsi allarmi; FAS senza falsi bandi PNRR né endpoint morti.
- [ ] Privacy: diritto all'oblio completo; rate-limit sui form anonimi; export/emptyTrash funzionanti.
- [ ] `clasp push` ok; nessuna regressione sul flusso pubblico anonimo; login email/magic-link **non toccato**.

*Al termine: riepilogo per gruppo con i 5 commit e lo stato della Definition of Done. Poi l'utente farà il deploy manuale (stesso URL) e una nuova verifica.*
