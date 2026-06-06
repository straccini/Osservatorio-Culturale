# Audit Production-Readiness v2 (esaustivo, file-per-file) — Sinopia / Osservatorio Culturale

**Data:** 2026-06-04 · **Metodo:** 8 agenti, lettura integrale di tutte le funzioni (~70 file), con verifica delle affermazioni.

> Questo report **corregge e supera** `AUDIT_PUBBLICAZIONE.md` (alcune affermazioni di ieri erano imprecise — vedi sezione "Correzioni").

---

## URGENTE — da fare ORA (segreto esposto)

**Token bot Telegram hardcoded in chiaro nel codice versionato** — `Telegram_v44.js:135-136` (token + chat_id).
E nel repo git -> chiunque acceda al codice controlla il bot.
**Azioni immediate:**
1. **Revocare il token** via @BotFather (`/revoke`).
2. Rimuoverlo dal codice; usarlo **solo** da `ScriptProperties` (`TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`).
3. (Storia git: il vecchio token resta nei commit; dopo la revoca non e piu valido, quindi ok.)

---

## BLOCCANTI — prima di pubblicare

### Sicurezza — funzioni privilegiate aperte ad anonimi (via `google.script.run`)
Il gate di `doPost` (Codice.js:544) blocca i token anonimi, **ma** le funzioni chiamate direttamente dal frontend con `google.script.run` lo bypassano. Quelle senza `_isCurrentUserAdmin_()` sono invocabili da chiunque:
- **`emptyTrash()`** (Backend_v415.js:335) — cancellazione **definitiva** multi-foglio, anonima. -> gating admin.
- **`exportArchivio()`** (Backend_v415.js:259/317) — crea CSV e lo rende **pubblico su Drive** (ANYONE_WITH_LINK), ritorna l'URL. -> gating admin + niente sharing pubblico.
- **`invitaUtenteSendEmail()`** (Backend_v415.js:199) — genera invito "admin" e invia email: spam a nome tuo. -> gating admin.
- **`setupMasterTriggers/Fogli/Completo`** (SetupMaster.js:135,298,349) — **guard admin rimosso** ("temporaneamente"): anonimo puo cancellare tutti i trigger / ricreare fogli. -> ripristinare il guard.
- **`saveLibro`/`saveNorma`** (Backend_v415.js:46,156) — vie di scrittura parallele non gated. -> gating editor/admin.

### Auth / login (il nodo noto)
- **`loginConEmail`** (Sessioni_v1.js:201) — accesso con **sola email**, nessuna password; **fail-open** se `OC_PUBLIC_LOGIN_ENABLED` e assente (null -> aperto); assegna anche ruolo `admin` leggendolo da `Utenti`. -> flag default **chiuso**; magic-link per ruoli admin/editor.
- **Sessioni permanenti** — TTL solo se `OC_SESSION_TTL_DAYS>0` (assente per default). Token in URL `?t=`. -> impostare TTL (30/90 gg) in produzione; `cleanupSessioniScadute` oggi conta ma non revoca.
- **doPost write gated solo da `!role`** (Codice.js:563-669) — un `lettore` puo modificare/archiviare bandi e podcast globali. -> gate `editor|admin` sulle write di contenuto.
- **Admin token `?adm=TOKEN`** (AdminToken_v1.js) — il binding IP/UA documentato non esiste; il token non scade -> chi ha l'URL e admin permanente. -> scadenza/rotazione.

### Bug funzionali certi
- **`getUserWorkspaceData` crash** (Sessioni_v1.js:344-354) — per admin via email, `sess` non e definita ma usata -> ReferenceError (il workspace admin non carica).
- **Toolbar pagine NORME e SOCIAL** (Index.html:676,677,685,690,695 / 743,744,752,760,765) — `OC.searchNorme/setNormeTema/...` e `OC.searchSocial/...` **non esistono** -> `TypeError` ad ogni tasto nella ricerca; filtri/ordina/export morti. -> definire i metodi (clonando searchNews/sortNews) o rimuovere le toolbar.
- **Matrix**:
  - `getMicReport(micId)` dichiarato ma **mai definito** (Matrix_MiC_v1.js) -> se il frontend lo chiama, "function not found".
  - `section12` trattato come array ma e un **oggetto** `{title,items[]}` (Matrix_v1.js:121-158) -> rompe il render del sondaggio pubblico LS2. -> usare `schema.section12.items`.
  - `_matrixComputeConsistencyFlags_` (Matrix_v1.js:549+) accede a `OC_MATRIX_SCHEMA` **senza guardia** -> crash se lo schema non e caricato.
- **Bandi — schema doppio**: `getSheetRadar()` restituisce `Bandi_v5` (26 col) ma `_radarBandiRows_`/`getBandiRadar` (UltimiBandi.js:403, Codice.js) assumono il legacy `RADAR BANDI` (20 col, header diversi). A flag OFF -> pagina bandi **vuota**/link mancanti. -> allineare tutti i lettori/scrittori a `Bandi_v5` con lookup colonna per nome (`_findCol_`).

### Setup / configurazione (primo deploy)
- **Conflitto trigger** — 4 funzioni che fanno `deleteTrigger` di tutti e reinstallano schedule diversi: `setupMasterTriggers`, `setupTriggers_v46`->`setupTriggersUnificati`, `fasSetupTrigger`, `setupDigestRoutingTrigger`. L'ultimo eseguito cancella i trigger degli altri. -> **un solo setup canonico** (`setupMasterTriggers`), gli altri deprecati.
- **Branding/URL vuoti** (Constants.js:117,121,127,128) — logo, hero, calendario, PDF strategia: stringhe vuote -> home senza logo, CTA "prenota" verso URL vuoto. -> `saveCommercialConfig({...})` dalla card admin prima del go-live.

---

## IMPORTANTI (robustezza / UX / privacy)

- **Digestreader XSS** (Digestreader.html:269,304,331,464+) — URL e testi inseriti **grezzi** in `href`/PDF; un `javascript:` salvato in un record e cliccabile. -> `esc()` + validare `^https?:`.
- **SurveyPublic `getAppUrl()` rotto** (SurveyPublic.html:399) — `google.script.run.url` non esiste -> CTA finali del funnel verso `href=""` (vicolo cieco). -> iniettare l'URL server-side.
- **SurveyPublic — nessuna validazione risposte** (riga 247) -> submit con dati vuoti, scoring falsato.
- **Prenotazioni/Sondaggi** — endpoint scrittura+email **anonimi** senza rate-limit/captcha. `saveSondaggio` ha bug di scope `sessioneResult` (Sondaggi_v1.js:188/214).
- **Sanitize mancante** in `Segnalazioni` (62-65) e `ProfiloPro` note (119) -> formula injection nei fogli.
- **Privacy**: `forgetMyData` **fail-open** se `getRuoloCorrente` assente (Privacy_v1.js:180); `deleteProfilo` chiama `forgetMyData` senza token.
- **HMAC unsubscribe** generato con `Math.random()` (Unsubscribe_v1.js:34) -> usare CSPRNG (`Utilities.getUuid()`).
- **Quota email non controllata**: `sendDigestAuto2coorti`, digest Matrix, `roc_approveBatch` (cap "5-8/mese" dichiarato ma mai applicato).
- **Modello Claude hardcoded** in 3 file (AgentScanner.js:733, AgentSocial.js:420, SistemaAgentiEsploratori.js:336).
- **Agenti**: contatori `NRecordTotali` incrementati anche su `NO_MATCH`; stats invii mai popolate; auto-archivio bandi invocato da 4 punti (race/quota); `galRunTutti` senza cursore di ripresa.
- **data-action admin morti** (Index.html:453,509,701,771,772,2089,2118,2147).
- **FontiApiStrutturate** — endpoint inerti/placeholder consumano quota; `FAS_PNRR_FEEDS` contiene feed news salvati come "bandi PNRR".
- **Newsletter** — `testInviaDigestATuttiGliIscritti()` invia a tutta la lista senza guard; `isActive` considera la cella vuota come "attivo".
- **Hero mobile** — media query per vecchia hero -> su <780px schiaccia il testo.

---

## POLISH

- **`Logger.log('x:', e)` a due argomenti** -> il 2deg argomento e ignorato in GAS.
- **Palette ambiti divergente** (3 versioni: Constants, Newsletter, Addon).
- **Versione hardcoded** `v4.18.45` in Sidebar.html:36.
- **Numeri Matrix incoerenti**: landing "9 dimensioni 27 domande" vs app "10 43".
- **Dark mode parziale**: `#fff` inline in hero e notifpanel.
- **`Navigation.html` = codice morto** (non incluso in Index.html).
- **File backup** `.bak`/`.v419` (8+).
- **Favicon assente**.
- **Icona AG3 mojibake** (AgentConfig.js:74).
- **`validateHttpsCertificates:false`** su tutte le fetch agenti.
- **Funzioni test con side-effect** richiamabili.

---

## CORREZIONI rispetto all'audit di ieri (verificate)

- **MAINT_KEY NON e hardcoded** — e letta da ScriptProperties (`OC_MAINT_KEY`). L'allarme di ieri era errato.
- **"Chi siamo" NON e vuota** — ha contenuto editoriale reale (Index.html:1257+).
- **doGet HA GIA un bootstrap-check** su SHEET_ID/CLAUDE_API_KEY/schema.
- **I fetch HANNO timeout** (`deadline`) nella maggior parte dei moduli.
- **Loader core hanno `withFailureHandler`** (Index.html).
- **Segreti in ScriptProperties** (Claude, password, SHEET_ID) — corretti. **Eccezione: il token Telegram** (vedi URGENTE).

---

## Sequenza setup minima al primo deploy (verificata)

1. Script Properties: `SHEET_ID`, `CLAUDE_API_KEY`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `OC_MAINT_KEY`, `OC_SESSION_TTL_DAYS` (es. 60), `OC_PUBLIC_LOGIN_ENABLED=false`.
2. `runAllSetupV418()` (fogli base + admin).
3. Seed fonti: `seedNuoveFontiSpecializzate()`, `addFontiIstituzionali()`, `addFontiNewsNuove()`.
4. `migraFontiFeed()` -> `enableFontiFeed('rss')` -> (gia fatto: `deprecaFontiNewsLegacy()`).
5. `setupMatrixSheets()`.
6. `setupMasterTriggers()` — **unico** setup trigger.
7. `saveCommercialConfig({logo,hero,calendario,museiSensibili})` dalla card admin.
8. Deploy (stesso URL).
