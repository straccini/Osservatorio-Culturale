# Brief operativo per Claude Code — Remediation pre-pubblicazione

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script web app)
**Riferimento problemi:** `docs/AUDIT_PUBBLICAZIONE_v2.md` (audit esaustivo verificato)
**Obiettivo:** rendere la web app pubblicabile in sicurezza, con **login attivabile dall'admin tramite flag dedicato**.

---

## MODALITÀ DI ESECUZIONE — FLUSSO UNICO E CONTINUO

Esegui **tutte le fasi (0→7) in un'unica sessione, in sequenza, SENZA fermarti per approvazione tra una fase e l'altra**. Non chiedere conferma a fine fase: prosegui automaticamente alla successiva. Fai un **commit separato per ciascuna fase** (per tracciabilità), poi continua subito.

**Riporta all'utente SOLO:**
- alla **fine** di tutto (riepilogo di cosa è stato fatto, fase per fase, con i commit), **oppure**
- se incontri un **blocco reale** che impedisce di proseguire in sicurezza (es. `_isCurrentUserAdmin_` risulta basato su `Session.getEffectiveUser`, oppure una modifica romperebbe certamente il flusso pubblico anonimo). In quel caso fermati, spiega, e attendi.

Mantieni comunque, per ogni fase, la verifica dei **criteri di accettazione** prima di committare quella fase — ma senza interrompere il flusso complessivo.

---

## Vincoli operativi (LEGGERE PRIMA)

1. **Non rompere il flusso pubblico anonimo** (lettura contenuti, landing, sondaggi pubblici).
2. **Reversibilità**: ogni cambiamento deve essere disattivabile (flag/feature toggle dove sensato).
3. **Segreti** solo in `ScriptProperties`, mai literal nel codice.
4. **Gating admin** SEMPRE via `_isCurrentUserAdmin_()` **token-based**. ⚠️ PRIMA di usarlo, VERIFICARE in `Auth.js`/`CurrentUser_v44.js` che NON usi `Session.getEffectiveUser()` (con `executeAs USER_DEPLOYING` ritornerebbe sempre il deployer = tutti admin). Se lo usa, correggerlo prima di tutto.
5. **GAS = scope globale unico** tra i file: attenzione a doppie `var` e a funzioni con lo stesso nome.
6. **Deploy**: dopo le modifiche, `clasp push` + deploy manuale dal web editor mantenendo lo **stesso URL** (mai "+ Nuova distribuzione"). Le modifiche al backend sono attive dopo il push; quelle al frontend (Index.html/HomeView/ecc.) solo dopo il deploy.
7. **Test**: ogni fase ha "criteri di accettazione". Dove possibile, aggiungere/usare una funzione `diagnostica*()` o `_test_*()` (prefisso `_`, non esposta al frontend) e verificare dall'editor GAS.
8. **Commit atomici** per fase, messaggi chiari (un commit per fase). Ma **non interrompere** il flusso: dopo il commit di una fase, prosegui subito con la successiva (vedi "Modalità di esecuzione").

---

## FASE 0 — URGENTE (azione MANUALE dell'utente, non codice)

- **Revocare il token bot Telegram** via @BotFather (`/revoke`) — è hardcoded in `Telegram_v44.js:135-136` ed è su git.
- Impostare in ScriptProperties: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`.
- **Intervento codice**: in `Telegram_v44.js` rimuovere i literal e leggere SEMPRE da ScriptProperties (verificare che le funzioni `_tgSend_`/invio usino le property, non i valori fissi). Nessun token nei `Logger.log`.
- **Accettazione**: nessun token/chat_id literal nel repo (`grep` deve dare 0 risultati per il token).

---

## FASE 1 — Gating admin su funzioni distruttive/privilegiate (rischio più alto, poche righe)

Per ognuna, aggiungere in testa alla funzione:
```js
if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
  return { ok: false, error: 'forbidden' };
}
```
Funzioni da proteggere:
- `emptyTrash()` — `Backend_v415.js:335` (cancellazione definitiva multi-foglio).
- `exportArchivio()` — `Backend_v415.js:259` + **rimuovere** lo sharing pubblico del file Drive (riga ~317 `setSharing(ANYONE_WITH_LINK)`): usare download diretto o link tokenizzato, non file pubblico permanente.
- `invitaUtenteSendEmail()` — `Backend_v415.js:199`.
- `saveLibro()` `Backend_v415.js:46`, `saveNorma()` `Backend_v415.js:156` (vie di scrittura parallele non gated → almeno `editor|admin`).
- `setupMasterTriggers()` `SetupMaster.js:135`, `setupMasterFogli()` `:298`, `setupMasterCompleto()` `:349` — **ripristinare** il guard rimosso ("temporaneamente").
- (difesa in profondità) `Sheet_Cleanup.js`: `runSheetCleanup`, `archiviaFogliObsoleti`, `dailyDedupCheck` — aggiungere guard admin.

**Accettazione**: chiamare ognuna via `google.script.run` da sessione anonima → ritorna `{ok:false,error:'forbidden'}`. Da admin (token) → funziona.

---

## FASE 2 — LOGIN attivabile dall'ADMIN tramite flag (RICHIESTA PRINCIPALE)

### Obiettivo
Il login utente (`loginConEmail`) deve essere **disattivato per default** e **attivabile solo dall'admin** tramite un flag dedicato in ScriptProperties. **Nessun fail-open**: se il flag manca, il login è CHIUSO.

### Flag
- Nome: **`OC_PUBLIC_LOGIN_ENABLED`** (ScriptProperties). Valori: `'true'` = attivo, qualsiasi altro valore o **assente** = **disattivo**.
- (Il flag esiste già ma con logica fail-open: `Sessioni_v1.js:208-214` blocca solo se `=== 'false'`. **Va invertita la semantica**: attivo SOLO se `=== 'true'`.)

### Backend — `Sessioni_v1.js`
1. Helper centralizzato:
```js
function isPublicLoginEnabled_() {
  try { return PropertiesService.getScriptProperties().getProperty('OC_PUBLIC_LOGIN_ENABLED') === 'true'; }
  catch (e) { return false; }   // fail-CLOSED
}
```
2. In `loginConEmail(email)` (`:201`), come **primissima riga** (prima di qualunque lettura di `Utenti`):
```js
if (!isPublicLoginEnabled_()) return { ok: false, error: 'login_disabilitato' };
```
Rimuovere la vecchia logica `OC_PUBLIC_LOGIN_ENABLED !== 'false'` (fail-open).
3. **Ruoli elevati**: anche a login attivo, NON emettere token di sessione da una semplice email se `utente.ruolo` è `admin` o `editor` → ritornare `{ ok:false, error:'usa_accesso_admin' }`. L'admin entra solo via `?adm=TOKEN` (AdminToken). (Gli utenti `lettore` `attivo` ottengono il token come oggi.)
4. Funzioni admin per il toggle (gated):
```js
function abilitaLoginPubblico() {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  PropertiesService.getScriptProperties().setProperty('OC_PUBLIC_LOGIN_ENABLED', 'true');
  return { ok:true, enabled:true };
}
function disabilitaLoginPubblico() {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  PropertiesService.getScriptProperties().setProperty('OC_PUBLIC_LOGIN_ENABLED', 'false');
  return { ok:true, enabled:false };
}
function statoLoginPubblico() {            // callable dal frontend per mostrare/nascondere la UI
  return { ok:true, enabled: isPublicLoginEnabled_() };
}
```

### Frontend — `Index.html`
1. Il form/bottone di **accesso utente** (login via email) deve comparire SOLO se `statoLoginPubblico().enabled === true`. Altrimenti nasconderlo o mostrare "Accesso utenti non attivo". Chiamare `statoLoginPubblico` in fase di `hydrate`/bootstrap e regolare la UI.
2. Nel **pannello admin** (`#page-admin`) aggiungere un interruttore **"Login utenti: ON/OFF"**:
   - allo `show` legge `statoLoginPubblico()` e imposta lo stato;
   - `OC.abilitaLoginPubblico()` / `OC.disabilitaLoginPubblico()` (con `withFailureHandler` e toast) al cambio;
   - mostra chiaramente lo stato corrente.
3. L'accesso **admin via `?adm=TOKEN` NON deve dipendere dal flag** (l'admin entra sempre, anche a login utenti OFF).

### Accettazione FASE 2
- `OC_PUBLIC_LOGIN_ENABLED` assente o `'false'` → `loginConEmail` ritorna `{ok:false,error:'login_disabilitato'}`; nel frontend il form di accesso non compare.
- Admin (via token) vede l'interruttore, lo attiva → `loginConEmail` funziona per un utente `lettore` `attivo`; un utente con ruolo `admin`/`editor` riceve `usa_accesso_admin`.
- `abilitaLoginPubblico`/`disabilitaLoginPubblico` rifiutano se chiamati da non-admin.
- Nessun fail-open: flag mancante = chiuso.

---

## FASE 3 — Sessioni TTL + gate ruolo sulle write

1. **TTL sessioni**: impostare `OC_SESSION_TTL_DAYS` (es. `60`) come setup obbligatorio; verificare che `validaSessione` (Sessioni_v1.js:133-144) rifiuti i token oltre il TTL e che `cleanupSessioniScadute` (`:743`) **revochi** davvero (non solo conti). Trigger giornaliero di cleanup.
2. **doPost write**: in `Codice.js` (azioni `:563-669`: toggleSaved/Archived/markRead/editSommario/saveBandoRadar/updateBandoRadar/toggleNascostoRadar/toggleLettoBando/archiviaRecord/savePodcast/togglePodField) cambiare il gate da `if (!role)` a `if (role!=='editor' && role!=='admin')` per le scritture di **contenuto globale**. Le azioni "personali" (preferenze, opt-in) restano per utente.
3. **Admin token**: in `AdminToken_v1.js` allineare codice/commenti — o implementare scadenza/rotazione del token `?adm=`, o documentare esplicitamente che è permanente e va tenuto segreto.

**Accettazione**: un `lettore` non può più archiviare/modificare bandi o podcast globali; token oltre TTL rifiutato.

---

## FASE 4 — Bug funzionali certi

1. **Toolbar pagine NORME e SOCIAL** (`Index.html:676,677,685,690,695` / `743,744,752,760,765`): le funzioni `OC.searchNorme/setNormeTema/setNormePreset/sortNorme/exportNormeCSV` e `OC.searchSocial/setSocialTipo/setSocialTema/sortSocial/exportSocialCSV` **non esistono**. → Definirle clonando il pattern di `searchNews`/`sortNews`/`exportNewsCSV` su `_cacheNorme`/`_filterNorme` e `_cacheSocial`/`_filterSocial`. In alternativa, rimuovere le toolbar finché non sono pronte. (Oggi lanciano `TypeError` ad ogni tasto.)
2. **`getUserWorkspaceData`** (`Sessioni_v1.js:344-354`): nel ramo admin-via-email `sess` non è definita ma viene usata → `ReferenceError`. Inizializzare `sess = { source:'admin', matrix_completato:false, ... }` nel ramo email o guardare `sess &&`.
3. **`data-action` admin morti** (`Index.html:453,509,701,771,772,2089,2118,2147`): `addNewsManuale`, `addPodcastManuale`, `runScannerNorme`, `runScannerSocial`, `addSocialFonte`, `loadEmailLog`, `loadFontiStatus`, `loadSheetsStatus` non esistono su `OC`. → Implementarle o rimuovere i bottoni.
4. **`statSondaggi`** (`Index.html:8080-8084`): catena `google.script.run` senza metodo terminale → aggiungere `.getSondaggiCount()` o rimuovere.
5. **Matrix**:
   - `getMicReport(micId)` dichiarato ma **mai definito** (`Matrix_MiC_v1.js`) → definirlo (lettura `ResponsesMatrixMiC`) o rimuovere le chiamate frontend.
   - `getMatrixSurveySchema` (`Matrix_v1.js:121-158`): `section12` è un **oggetto** `{title,items[]}`, non array → usare `schema.section12.items || []`.
   - `_matrixComputeConsistencyFlags_` (`:549+`): aggiungere guardia `if (typeof OC_MATRIX_SCHEMA==='undefined') return {};` in testa.

**Accettazione**: pagine Norme/Social usabili senza errori in console; workspace admin carica; sondaggio pubblico LS2 renderizza tutte le sezioni.

---

## FASE 5 — Setup trigger unico + branding

1. **Trigger**: rendere `setupMasterTriggers()` (`SetupMaster.js`) l'**unico** setup. Aggiungere `fasRunCompleto` a `OC_TRIGGER_SCHEDULE`. Deprecare/neutralizzare `setupTriggers_v46`→`setupTriggersUnificati` (Sprint0/Scannerbandi), `fasSetupTrigger`, `setupDigestRoutingTrigger` (far sì che chiamino il master o non facciano `deleteTrigger` globale). Allineare le liste "expected" di `maAuditAlert` (AgentSupervisore.js:501) e `fasDiagnostica` ai trigger realmente installati.
2. **Branding/URL**: documentare che prima del go-live serve `saveCommercialConfig({logo, hero, calendario, museiSensibili})` dalla card admin (Constants.js:117-128 sono vuoti). Opzionale: fallback statici.

**Accettazione**: eseguendo solo `setupMasterTriggers()` si ottengono tutti i trigger attesi senza doppioni; `fasDiagnostica`/`maAuditAlert` non segnalano falsi mancanti.

---

## FASE 6 — Robustezza / privacy / quota

1. **Digestreader XSS** (`Digestreader.html:269,304,331,464+`): `esc()` su tutti i campi testo nel PDF; per gli `href` validare `^https?:` (scartare `javascript:`/`data:`).
2. **SurveyPublic `getAppUrl()`** (`:399`): `google.script.run.url` non esiste → iniettare l'URL server-side (placeholder come `GAS_URL`). Sistemare i 2 CTA finali.
3. **SurveyPublic validazione** (`:247`): bloccare "Avanti" se la domanda obbligatoria non ha risposta.
4. **Prenotazioni/Sondaggi**: aggiungere rate-limit (modello `Segnalazioni`: login + 5/giorno + 2 min) o almeno per IP-hash; correggere il bug di scope `sessioneResult` in `saveSondaggio` (`Sondaggi_v1.js:188/214`, dichiarare `var sessioneResult=null` a inizio funzione).
5. **Sanitize**: applicare `_sanitizeForCell_` in `Segnalazioni_v1.js:62-65` e `ProfiloPro_v1.js:119`.
6. **Privacy**: `forgetMyData` (`Privacy_v1.js:180`) — rendere il check obbligatorio (se `getRuoloCorrente` manca → **negare**, non procedere). `deleteProfilo` (`ProfiloPro_v1.js:158`) deve passare il token o cancellare direttamente i fogli.
7. **HMAC unsubscribe** (`Unsubscribe_v1.js:34`): generare il secret con `Utilities.getUuid()` (CSPRNG), non `Math.random()`.
8. **Quota email**: in `sendDigestAuto2coorti`, digest Matrix, `roc_approveBatch` aggiungere `MailApp.getRemainingDailyQuota()` check + early-stop; applicare il cap `ROC_CAP_PREPROG_MESE` (dichiarato ma non usato).
9. **Modello Claude**: centralizzare il nome (`claude-haiku-4-5-…`) in `Constants.js`/ScriptProperty; AgentScanner.js:733, AgentSocial.js:420, SistemaAgentiEsploratori.js:336 lo leggono da lì.
10. **Agenti**: `NRecordTotali` incrementato solo su `OK` (non `NO_MATCH`) (AgentScanner.js:784); allineare `getAgentEmailStats` (`perAgente` vs `byAgent`, AgentAdmin.js:130); cursore di ripresa per `galRunTutti`/`galRunOggi`; auto-archivio bandi da **un solo** punto.

---

## FASE 7 — Polish

- `Logger.log('x:', e)` → `Logger.log('x: ' + e.message)` (diffuso: UltimiBandi, Bandi_v5…): il 2° argomento è ignorato in GAS.
- Palette ambiti: derivare TUTTI i colori/label da `OC_AMBITI` (Constants.js); rimuovere `OC_AMB_COLORS_` (Newsletter) e `ambitoColorV42_`/`ambitoLblV42_` (Addon) divergenti.
- Versione hardcoded `Sidebar.html:36` → da `getOcConstants().version`.
- Numeri Matrix coerenti tra `LandingPublic.html` (9/27) e `MatrixApp.html` (10/43).
- Dark mode: sostituire `#fff` inline (HomeView hero/carosello, Topbar notifpanel) con `var(--paper)`.
- `Navigation.html` → rinominare `.disabled` o eliminare (codice morto, non incluso).
- Rimuovere file `.bak`/`.v419`.
- Favicon nel `<head>` di Index.html.
- Icona AG3 mojibake (`AgentConfig.js:74`).
- `validateHttpsCertificates:false`: limitare alle sole fonti marcate inaffidabili.
- Funzioni `test*` con invio email reale / side-effect (Matrix/Newsletter/ROC/FontiFeed): prefisso `_` o guard admin.

---

## Definition of Done (per pubblicare)

- [ ] Token Telegram revocato e rimosso dal codice.
- [ ] Funzioni distruttive/privilegiate gated (FASE 1) — test anonimo = `forbidden`.
- [ ] Login utenti **OFF di default**, attivabile solo da admin via interruttore (FASE 2) — test fail-closed.
- [ ] Sessioni con TTL; write di contenuto solo editor/admin (FASE 3).
- [ ] Toolbar Norme/Social e workspace admin senza errori; Matrix ok (FASE 4).
- [ ] Un solo setup trigger; branding configurato (FASE 5).
- [ ] XSS Digestreader, CTA survey, rate-limit, sanitize, quota email (FASE 6).
- [ ] `clasp push` + deploy (stesso URL) + test in incognito (anonimo + admin).

---

*Esecuzione in **flusso unico e continuo**: percorri le fasi 0→7 in sequenza senza fermarti per approvazione, un commit per fase, verificando i criteri di accettazione di ciascuna. Fermati e chiedi SOLO se incontri un blocco reale (gating admin non token-based, o rischio certo di rompere il flusso pubblico anonimo). Al termine, presenta un unico riepilogo con l'elenco dei commit e lo stato della Definition of Done.*
