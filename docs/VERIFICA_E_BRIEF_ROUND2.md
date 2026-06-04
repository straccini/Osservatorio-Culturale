# Verifica remediation + Brief Round 2 — Sinopia / Osservatorio Culturale

**Data:** 2026-06-04 · **Metodo:** 8 agenti, verifica file-per-file del codice DOPO la remediation (commit FASE 0-7), ricerca regressioni, valutazione "professionale/credibile".

---

## ✅ CONFERMATO RISOLTO (remediation riuscita)

**Sicurezza / auth (il cuore):**
- `_isCurrentUserAdmin_`/`getRuoloCorrente` è **token-based**, NON usa `Session.getEffectiveUser` → cardine del gating solido (CurrentUser_v44.js:69-135). ✅
- **Login fail-closed**: `loginConEmail` chiuso se `OC_PUBLIC_LOGIN_ENABLED !== 'true'`; admin/editor esclusi dal login email; `abilitaLoginPubblico/disabilitaLoginPubblico` gated admin; interruttore nel pannello admin + UI condizionata (Sessioni_v1.js:205-245, Index.html:6208/7148). ✅
- **Sessioni TTL** con revoca effettiva (Sessioni_v1.js:137-144, 794). ✅
- **doPost write** gated `editor|admin` (Codice.js:544+). ✅
- **FASE 1 gating completo**: `emptyTrash`, `exportArchivio` (+ niente più sharing Drive pubblico), `invitaUtenteSendEmail`, `saveLibro/saveNorma`, Sheet_Cleanup distruttive, `setupMaster*` → tutte gated; nessuna blocca l'admin. ✅
- Token Telegram rimosso dal codice attivo (legge da ScriptProperties). ✅ *(ma vedi azione manuale sotto)*
- HMAC unsubscribe CSPRNG; sanitize in Segnalazioni/ProfiloPro; `forgetMyData` fail-closed; bug scope `saveSondaggio` risolto. ✅

**Funzionale / frontend:**
- Toolbar Norme/Social rimosse (niente più TypeError); login UI a flag; data-action morti nascosti; `statSondaggi` disabilitato — **nessuna regressione** (Index.html). ✅
- Matrix: `getMicReport` definito, `section12.items`, guardia consistency (Matrix_v1/MiC). ✅
- Digestreader XSS sanificato (`esc()` + `_safeHref_`); SurveyPublic `getAppUrl()` corretto + validazione risposte. ✅
- Navigation.html → `.disabled`; Logger 2-arg corretto; modello Claude centralizzato (`OC_CLAUDE_MODEL`); cursore agenti; AG3 mojibake; dark mode hero/notifpanel. ✅
- Setup trigger: `setupMasterTriggers` unico; gli altri neutralizzati (tranne `setupTriggers` Codice.js, vedi residui). ✅

---

## ⚠️ AZIONE MANUALE (non codice)
- **Revocare il token Telegram via @BotFather** (`/revoke`): è ancora valido nella **storia git** e in una **worktree stale** (`.claude/worktrees/…/Telegram_v44.js:134`). La rimozione dal sorgente non invalida il segreto già committato.
- (Opzionale) `git worktree remove` della worktree stale `reverent-cartwright-56d2aa` (contiene versioni pre-fix di auth/Codice/Telegram → rischio confusione).

---

# BRIEF ROUND 2 — residui da chiudere

> Esecuzione: **flusso unico e continuo** (come da `BRIEF_CLAUDE_CODE_REMEDIATION.md`): fasi in sequenza, un commit per fase, niente stop intermedi; report finale. Fermarsi solo su blocco reale.

## 🔴 R1 — BLOCCANTI (funzione rotta o "non finito" molto visibile)

1. **Link e data bandi rotti in configurazione di default** — `UltimiBandi.js:402-409` (`_radarBandiRows_`) legge `indexOf('Data_Rilevamento')` e `indexOf('Link')`, ma con flag `USE_BANDI_V5` **OFF** (default — non viene mai auto-attivato) `getSheetRadar()` restituisce `Bandi_v5` che usa `DataRilevamento`/`UrlBando` → tutti i bandi mostrati **senza link** e senza data (sort/isRecente rotti). Anche `COL_NAMES.LINK` (Codice.js:1668) manca `'UrlBando'`.
   **Fix**: in `_radarBandiRows_` usare `_findCol_(head, ['DataRilevamento','Data_Rilevamento','Data'])`, `_findCol_(head, ['UrlBando','Link','URL'])`, `_findCol_(head,['StatoRecord','Stato'])`; aggiungere `'UrlBando'` a `COL_NAMES.LINK`. **In alternativa** (più semplice): far attivare `enableBandiV5()` automaticamente al termine della migrazione in `runAllSetupV418`/setup. *Accettazione: pagina e home Bandi mostrano link e data corretti sia a flag ON che OFF.*

2. **Home rotta su mobile** — `Styles.html:909-919`: la media query è ancora per la vecchia hero a **grid**; `.home-headline-frame > div:last-child{width:140px;height:140px}` ora colpisce il **blocco di testo** (flex) → su <780px il testo dell'hero è schiacciato a 140×140px. Titolo `font-size:48px` **inline** (`HomeView.html:57`) non responsivo.
   **Fix**: riscrivere la media query per la struttura flex attuale (l'immagine è già `position:absolute`); spostare la dimensione del titolo in CSS con `clamp(28px,7vw,48px)` togliendo l'inline. *Accettazione: home leggibile e ordinata su smartphone (<400px).*

3. **Numeri Matrix incoerenti** (credibilità) — canonico = **10 dimensioni · 43 domande** (`MatrixApp.html`), ma: `LandingPublic.html:217,220,242` dice "9 dimensioni · 27 domande · radar 9 assi"; `HomeView.html:128` (slide 3) dice "9 aree tematiche" mentre la slide 1 (`:78`) dice "10". → Allineare tutto a **10/43** (Landing + HomeView slide 3; valutare SurveyPublic). *Accettazione: stesso numero ovunque.*

4. **`roc_approveBatch` invia batch email senza quota né cap** — `ROC_v1.js:407-454`: `ROC_CAP_PREPROG_MESE` dichiarato ma mai applicato; nessun `getRemainingDailyQuota()`. Con DB musei ampio supera i 100/gg GAS, invii falliti in silenzio. Stesso gap nel digest Matrix (`Matrix_digest.js`/`sendMatrixReportEmail`). **Fix**: contare invii del mese su `ROC_BatchLog` + early-stop su quota.

5. **Feed news spacciati per bandi PNRR** — `FontiApiStrutturate.js:37-57` `FAS_PNRR_FEEDS` contiene ancora Artribune/Doppiozero salvati come `settore:'PNRR / Cultura'` in Bandi_v5 → falsi bandi + alert Telegram fuorvianti. **Fix**: rimuoverli o ricategorizzarli come news; non salvarli come bandi.

6. **Diritto all'oblio incompleto** — `ProfiloPro_v1.js:158` chiama `forgetMyData(user.email)` **senza token** → dopo il fail-closed di FASE 6, la cascata GDPR (ResponsesMatrix/ContactsMatrix/CRM_Leads/MailingList) **non viene più eseguita** (no-op silenzioso). **Fix**: propagare il token di sessione a `deleteProfilo`/`forgetMyData`, o purgare direttamente i fogli per l'email già autenticata.

## 🟠 R2 — IMPORTANTI (robustezza / credibilità)

7. **Bug di reporting agenti** (report falsati, non crash): `AgentSupervisore.js:166-169` `archTot += object` (sommato un oggetto → report corrotto); `:382,391,400` legge `.archived` invece di `.archiviati` (sempre 0); stats invii card admin sempre 0 (`getAgentEmailStats` ritorna `perAgente` int, `AgentAdmin.js:130` legge `byAgent[id].sent/failed/lastSent`). **Fix**: leggere `.archiviati`, sommare `.archiviati`, allineare il formato stats.
8. **Auto-archivio bandi NON consolidato** — gira da 3-4 punti (`sasRun` MA1+MA4+MA5, `agrRunOggi`, `galRunOggi`) + `galSetupTrigger:465` installa ancora un trigger standalone 04:00. Idempotente ma spreca scritture/quota. **Fix**: un solo punto.
9. **Liste "expected trigger" obsolete** → falsi allarmi diagnostici: `maAuditAlert` (AgentSupervisore.js:501 attende `scanSources`/`scanFontiTutte` inesistenti), `fasDiagnostica` (cerca `fasRunFase1` ma è `fasRunCompleto`), `runAllSetupV418Status` (`scanFontiTutte`×3). **Fix**: allineare alle funzioni realmente schedulate. Verificare anche che l'alert bandi 72h (`bandiEvery3Days`, rimosso dallo schedule) sia richiamato altrove.
10. **Newsletter**: `isActive` considera **ancora** la cella vuota come attivo (`Newsletter_v44.js:141`, `attivo === ''`); `testInviaDigestATuttiGliIscritti()` (`:354`) **senza guard admin** (chiamabile via google.script.run). **Fix**: cella vuota = NON attiva; aggiungere guard admin alle test-function.
11. **Rate-limit assente** su `savePrenotazioneIntent` (`Prenotazioni_v1.js:41`) e `saveSondaggio` (`Sondaggi_v1.js:150`) — endpoint anonimi che inviano email admin ad ogni submit. **Fix**: `_rateLimited_` per IP-hash/email (modello `Segnalazioni`).
12. **`setupTriggers()` (Codice.js:3785) non neutralizzato** — fallback che reinstalla trigger vecchi se la dipendenza deprecata cambia. **Fix**: return verso il master.
13. **Matrix**: `saveMatrixContact` senza dedup → righe contatto duplicate + doppio opt-in CRM (`Matrix_v1.js:333`); report **PDF** ancora con benchmark placeholder (`:701`) mentre a schermo è reale; PDF condiviso `ANYONE_WITH_LINK` (`:934`). **Fix**: dedup per email/response_id; usare benchmark reale; sharing non pubblico.
14. **Endpoint FAS inerti** (SEDIA `apiKey=SEDIA`, OpenCUP, Lombardia `ks5g-bke7`) girano ogni giorno via `fasRunCompleto` sprecando quota fetch. **Fix**: disattivare i parser che ritornano sempre 0/errore.
15. **Dark mode residui** (illeggibilità): 4 card carosello `background:#fff` puro (`HomeView.html:83,85,132,133`); pigmento hero `mix-blend:multiply` annerisce su fondo dark (`:52`); Digestreader data/scadenza `color:rgba(255,255,255,.4)` su fondo chiaro → invisibili (`Digestreader.html:142-143`). **Fix**: `var(--paper)` sulle card; override `[data-theme=dark]` per il pigmento; colori leggibili nel Digestreader.
16. **`estraiConClaudeBandi`** (Scannerbandi.js:285) senza retry/deadline esplicito → scan a vuoto su 429 transitorio. **Crossref** `new Array(20)` per riga a 26 col (Crossref_v1.js:236). **exportArchivio/emptyTrash** usano nomi colonna legacy (`Stato`/`URL`/`Data`) divergenti da `Items` reale → export vuoto / emptyTrash non cancella le news (Backend_v415.js:303,384). **Fix**: deadline+retry; `new Array(COL_B_HEADERS.length)`; allineare nomi colonna.

## 🟡 R3 — POLISH (rifinitura "professionale")

17. **Favicon assente** in tutte le pagine (Index/Landing/Survey/Digestreader/MatrixApp) → richiesta 404 + icona generica. Aggiungere `<link rel="icon">` (anche data-URI).
18. **Versione** ancora **hardcoded** (Sidebar.html:36 `v4.20`) → leggere da `getOcConstants().version`.
19. **Palette ambiti**: 3 versioni divergenti (Constants `OC_AMBITI` vs Newsletter `OC_AMB_COLORS_` vs Addon `ambitoColorV42_`) + label vecchie in `ambitoLblV42_` ("Tendenze/AI Cultura"). **Fix**: derivare tutto da `OC_AMBITI`.
20. **Brand "Sinopia" non uniforme**: assente in Digestreader (firma solo "Osservatorio Culturale") e MatrixApp. Uniformare la firma.
21. **`qualityCheckBandiAuto`** (Bandi_v5.js:1209) auto-archivia per chiave `ente+scadenza+titolo(50)` → possibili falsi positivi distruttivi. Valutare dry-run/log o includere l'URL nella chiave.
22. **`validateHttpsCertificates:false`** globale sulle fetch agenti/GAL → limitare alle sole fonti inaffidabili.
23. **`authenticate()` doPost** (Codice.js:1434) ancora basato su password/MailingList (fonte ruoli parallela a `getRuoloCorrente`) → consolidare; verificare che `MailingList` non abbia righe con `Ruolo` elevato.
24. Doppie `var` globali (`FONTI_AGENTI_SHEET`, `OC_MATRIX_RESPONSES_SHEET`) — tenere una sola dichiarazione.
25. `galRunTutti` senza cursore (solo manuale; produzione `galRunOggi` ok).

---

## Giudizio di pubblicabilità

**Sicurezza**: con i fix applicati, l'app è **sostanzialmente sicura** per il pubblico (auth solida, funzioni distruttive gated, login a flag). Resta l'azione manuale di revoca Telegram.

**Credibilità "professionale"**: 3 cose la fanno ancora sembrare non rifinita a un referente del settore — **(a) numeri Matrix incoerenti** (9 vs 10), **(b) home rotta su mobile**, **(c) link bandi mancanti in default + dettagli dark-mode/email**. Sono tutte correzioni **a poche righe** (R1.1-R1.3 + R2.15).

**Raccomandazione**: chiudere R1 (6 punti) + R2.7-R2.15 prima del go-live pubblico; R3 come rifinitura post-lancio. Stima: ~mezza giornata.
