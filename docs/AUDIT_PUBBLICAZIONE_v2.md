# Audit Production-Readiness v2 (esaustivo, file-per-file) — Sinopia / Osservatorio Culturale

**Data:** 2026-06-04 · **Metodo:** 8 agenti, lettura integrale di tutte le funzioni (~70 file), con verifica delle affermazioni.

> Questo report **corregge e supera** `AUDIT_PUBBLICAZIONE.md` (alcune affermazioni di ieri erano imprecise — vedi sezione "Correzioni").

---

## 🚨 URGENTE — da fare ORA (segreto esposto)

**Token bot Telegram hardcoded in chiaro nel codice versionato** — `Telegram_v44.js:135-136` (token + chat_id).
È nel repo git → chiunque acceda al codice controlla il bot.
**Azioni immediate:**
1. **Revocare il token** via @BotFather (`/revoke`).
2. Rimuoverlo dal codice; usarlo **solo** da `ScriptProperties` (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`).
3. (Storia git: il vecchio token resta nei commit; dopo la revoca non è più valido, quindi ok.)

---

## 🔴 BLOCCANTI — prima di pubblicare

### Sicurezza — funzioni privilegiate aperte ad anonimi (via `google.script.run`)
Il gate di `doPost` (Codice.js:544) blocca i token anonimi, **ma** le funzioni chiamate direttamente dal frontend con `google.script.run` lo bypassano. Quelle senza `_isCurrentUserAdmin_()` sono invocabili da chiunque:
- **`emptyTrash()`** (Backend_v415.js:335) — cancellazione **definitiva** multi-foglio, anonima. → gating admin.
- **`exportArchivio()`** (Backend_v415.js:259/317) — crea CSV e lo rende **pubblico su Drive** (ANYONE_WITH_LINK), ritorna l'URL. → gating admin + niente sharing pubblico.
- **`invitaUtenteSendEmail()`** (Backend_v415.js:199) — genera invito "admin" e invia email: spam a nome tuo. → gating admin.
- **`setupMasterTriggers/Fogli/Completo`** (SetupMaster.js:135,298,349) — **guard admin rimosso** ("temporaneamente"): anonimo può cancellare tutti i trigger / ricreare fogli. → ripristinare il guard.
- **`saveLibro`/`saveNorma`** (Backend_v415.js:46,156) — vie di scrittura parallele non gated. → gating editor/admin.

### Auth / login (il nodo noto)
- **`loginConEmail`** (Sessioni_v1.js:201) — accesso con **sola email**, nessuna password; **fail-open** se `OC_PUBLIC_LOGIN_ENABLED` è assente (null → aperto); assegna anche ruolo `admin` leggendolo da `Utenti`. → flag default **chiuso**; magic-link per ruoli admin/editor. (Confermato esposto: Index.html:7242,7290,11232,11270.)
- **Sessioni permanenti** — TTL solo se `OC_SESSION_TTL_DAYS>0` (assente per default). Token in URL `?t=`. → impostare TTL (30/90 gg) in produzione; `cleanupSessioniScadute` oggi conta ma non revoca.
- **doPost write gated solo da `!role`** (Codice.js:563-669) — un `lettore` può modificare/archiviare bandi e podcast globali. → gate `editor|admin` sulle write di contenuto.
- **Admin token `?adm=TOKEN`** (AdminToken_v1.js) — il binding IP/UA documentato non esiste; il token non scade → chi ha l'URL è admin permanente. → scadenza/rotazione.

### Bug funzionali certi
- **`getUserWorkspaceData` crash** (Sessioni_v1.js:344-354) — per admin via email, `sess` non è definita ma usata → ReferenceError (il workspace admin non carica).
- **Toolbar pagine NORME e SOCIAL** (Index.html:676,677,685,690,695 / 743,744,752,760,765) — `OC.searchNorme/setNormeTema/…` e `OC.searchSocial/…` **non esistono** → `TypeError` ad ogni tasto nella ricerca; filtri/ordina/export morti. → definire i metodi (clonando searchNews/sortNews) o rimuovere le toolbar.
- **Matrix**:
  - `getMicReport(micId)` dichiarato ma **mai definito** (Matrix_MiC_v1.js) → se il frontend lo chiama, "function not found".
  - `section12` trattato come array ma è un **oggetto** `{title,items[]}` (Matrix_v1.js:121-158) → rompe il render del sondaggio pubblico LS2. → usare `schema.section12.items`.
  - `_matrixComputeConsistencyFlags_` (Matrix_v1.js:549+) accede a `OC_MATRIX_SCHEMA` **senza guardia** → crash se lo schema non è caricato (dopo aver già scritto).
- **Bandi — schema doppio** (rischio alto, oggi mascherato dal flag ON): `getSheetRadar()` restituisce `Bandi_v5` (26 col) ma `_radarBandiRows_`/`getBandiRadar` (UltimiBandi.js:403, Codice.js) assumono il legacy `RADAR BANDI` (20 col, header diversi). A flag OFF → pagina bandi **vuota**/link mancanti. Scritture (`salvaNewBandi`, `importaEsitiTed`, Crossref `new Array(20)`) assumono schemi diversi. → allineare tutti i lettori/scrittori a `Bandi_v5` con lookup colonna per nome (`_findCol_`).

### Setup / configurazione (primo deploy)
- **Conflitto trigger** — 4 funzioni che fanno `deleteTrigger` di tutti e reinstallano schedule diversi: `setupMasterTriggers`, `setupTriggers_v46`→`setupTriggersUnificati`, `fasSetupTrigger`, `setupDigestRoutingTrigger`. L'ultimo eseguito cancella i trigger degli altri. → **un solo setup canonico** (`setupMasterTriggers`), gli altri deprecati; aggiungere `fasRunCompleto` allo schedule master.
- **Branding/URL vuoti** (Constants.js:117,121,127,128) — logo, hero, calendario, PDF strategia: stringhe vuote → home senza logo, CTA "prenota" verso URL vuoto. → `saveCommercialConfig({...})` dalla card admin prima del go-live.
- **Sequenza fonti**: `enableFontiFeed('rss')` **prima** di `deprecaFontiNewsLegacy` (già fatto), altrimenti le news si azzerano.

---

## 🟠 IMPORTANTI (robustezza / UX / privacy)

- **Digestreader XSS** (Digestreader.html:269,304,331,464+) — URL e testi inseriti **grezzi** in `href`/PDF; un `javascript:` salvato in un record è cliccabile. → `esc()` + validare `^https?:`.
- **SurveyPublic `getAppUrl()` rotto** (SurveyPublic.html:399) — `google.script.run.url` non esiste → CTA finali del funnel verso `href=""` (vicolo cieco). → iniettare l'URL server-side.
- **SurveyPublic — nessuna validazione risposte** (riga 247) → submit con dati vuoti, scoring falsato.
- **Prenotazioni/Sondaggi** — endpoint scrittura+email **anonimi** senza rate-limit/captcha (amplificazione email admin). `saveSondaggio` ha bug di scope `sessioneResult` (Sondaggi_v1.js:188/214) → submission senza email crasha. (Modello buono già presente in `Segnalazioni`.)
- **Sanitize mancante** in `Segnalazioni` (62-65) e `ProfiloPro` note (119) → formula injection nei fogli.
- **Privacy**: `forgetMyData` **fail-open** se `getRuoloCorrente` assente (Privacy_v1.js:180); `deleteProfilo` chiama `forgetMyData` senza token → la purga GDPR collegata **non avviene**.
- **HMAC unsubscribe** generato con `Math.random()` (Unsubscribe_v1.js:34) → usare CSPRNG (`Utilities.getUuid()`).
- **Quota email non controllata**: `sendDigestAuto2coorti` (Digest_routing.js), digest Matrix, `roc_approveBatch` (cap "5-8/mese" **dichiarato ma mai applicato**) → con molti destinatari si supera il limite GAS (100/gg) e invii falliscono in silenzio. → check `getRemainingDailyQuota` + cap.
- **Modello Claude hardcoded** in 3 file (AgentScanner.js:733, AgentSocial.js:420, SistemaAgentiEsploratori.js:336) → se ritirato, estrazione/social/classificazione si fermano in silenzio. → centralizzare in Constants/ScriptProperty.
- **Agenti**: contatori `NRecordTotali` incrementati anche su `NO_MATCH` → `bonificaFontiEmptyAgente` non disattiva mai le fonti morte (AgentScanner.js:84/784); stats invii mai popolate (`byAgent` vs `perAgente`, AgentAdmin.js:130 vs AgentDigest.js:306); auto-archivio bandi invocato da **4 punti** (race/quota); `galRunTutti` (86 GAL) supera i 6 min senza cursore di ripresa.
- **data-action admin morti** (Index.html:453,509,701,771,772,2089,2118,2147) — `addNewsManuale`, `runScannerNorme`, `loadEmailLog`, ecc. non esistono → bottoni che non fanno nulla.
- **FontiApiStrutturate** — molti endpoint inerti/placeholder (SEDIA `apiKey=SEDIA`, OpenCUP 403, resource id ipotetici) girano ogni giorno consumando quota; `FAS_PNRR_FEEDS` contiene **feed news** (Artribune/Doppiozero) salvati come "bandi PNRR" → falsi bandi + alert fuorvianti.
- **Newsletter** — `testInviaDigestATuttiGliIscritti()` invia a **tutta** la lista senza guard (Newsletter_v44.js:354); `isActive` considera la cella vuota come "attivo" (riga 141).
- **Hero mobile** — media query `Styles.html:908` scritta per la vecchia hero a griglia (ora flex) → su <780px schiaccia il **testo** a 140×140px; titolo `font-size:48px` inline non responsivo. → riscrivere la media query + `clamp()`.

---

## 🟡 POLISH

- **`Logger.log('x:', e)` a due argomenti** (diffuso: UltimiBandi, Bandi_v5, ecc.) → in GAS il 2° argomento è **ignorato**, gli errori reali non si vedono. → `Logger.log('x: ' + e.message)`.
- **Palette ambiti divergente** (3 versioni: Constants `OC_AMBITI` vs Newsletter `OC_AMB_COLORS_` vs Addon `ambitoColorV42_`) + label vecchie in Addon → branding incoerente. → derivare tutto da `OC_AMBITI`.
- **Versione hardcoded** `v4.18.45` in Sidebar.html:36 (codebase a v4.19/4.20). → da `getOcConstants`.
- **Numeri Matrix incoerenti**: landing "9 dimensioni · 27 domande" vs app "10 · 43". → allineare.
- **Dark mode parziale**: `#fff` inline in hero (HomeView) e notifpanel (Topbar) → bianchi in dark. → `var(--paper)`.
- **`Navigation.html` = codice morto** (non incluso in Index.html) → rinominare `.disabled` o eliminare per evitare confusione.
- **File backup** `.bak`/`.v419` (8+) → rimuovere.
- **Favicon assente** (Index.html `<head>`).
- **Icona AG3 mojibake** (AgentConfig.js:74).
- **`validateHttpsCertificates:false`** su tutte le fetch agenti → limitare alle sole fonti inaffidabili.
- **Funzioni test con side-effect** richiamabili (Matrix/Newsletter/ROC `test*`, FontiFeed) → prefissare `_` o gating.

---

## ✅ CORREZIONI rispetto all'audit di ieri (verificate)

- **MAINT_KEY NON è hardcoded** — è letta da ScriptProperties (`OC_MAINT_KEY`). L'allarme di ieri era errato.
- **"Chi siamo" NON è vuota** — ha contenuto editoriale reale (Index.html:1257+).
- **doGet HA GIÀ un bootstrap-check** su SHEET_ID/CLAUDE_API_KEY/schema → il punto "aggiungere initCheck_" è in gran parte già fatto.
- **I fetch HANNO timeout** (`deadline`) nella maggior parte dei moduli (agenti, FAS, bandi) → non è un problema diffuso come temuto.
- **Loader core hanno `withFailureHandler`** (Index.html) → niente skeleton infinito sulle liste principali. Il problema dello skeleton era in `Navigation.html`, che però **non è in produzione**.
- **Segreti in ScriptProperties** (Claude, password, SHEET_ID) — corretti. **Eccezione: il token Telegram** (vedi 🚨).

---

## Sequenza setup minima al primo deploy (verificata)

1. Script Properties: `SHEET_ID`, `CLAUDE_API_KEY`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `OC_MAINT_KEY`, `OC_SESSION_TTL_DAYS` (es. 60), `OC_PUBLIC_LOGIN_ENABLED=false`.
2. `runAllSetupV418()` (fogli base + admin).
3. Seed fonti: `seedNuoveFontiSpecializzate()`, `addFontiIstituzionali()`, `addFontiNewsNuove()`.
4. `migraFontiFeed()` → `enableFontiFeed('rss')` → (già fatto: `deprecaFontiNewsLegacy()`).
5. `setupMatrixSheets()`.
6. `setupMasterTriggers()` — **unico** setup trigger.
7. `saveCommercialConfig({logo,hero,calendario,museiSensibili})` dalla card admin.
8. Deploy (stesso URL).

---

## Ordine di lavoro consigliato

1. **ORA**: revocare token Telegram (🚨).
2. **Sicurezza rapida** (poche righe): gating admin su `emptyTrash`/`exportArchivio`/`invitaUtenteSendEmail`/`saveLibro`/`saveNorma`; ripristinare guard su `setupMaster*`.
3. **Auth/login**: `loginConEmail` (flag default chiuso + magic-link), `OC_SESSION_TTL_DAYS`, gate ruolo su doPost write.
4. **Bug funzionali**: `getUserWorkspaceData`, toolbar Norme/Social, Matrix (getMicReport, section12, consistency guard).
5. **Setup**: consolidare un unico setup trigger; `saveCommercialConfig`.
6. **Robustezza/privacy**: Digestreader esc(), SurveyPublic URL, rate-limit prenotazioni/sondaggi, sanitize Segnalazioni/ProfiloPro, quota email, modello Claude centralizzato.
7. **Polish**: Logger 2-arg, palette, versione, favicon, dark-mode, .bak, Navigation.html.
