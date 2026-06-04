# Brief Claude Code — LOGIN COMPLETO con MAGIC-LINK

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script, deploy "Chiunque/anonimo").
**Stato attuale (audit):** vedi `docs/RESIDUI_ROUND3.md` §login. Il magic-link **esiste e funziona** (generazione UUID, invio email, validazione `?t=`) ma parte solo come effetto collaterale; ci sono **falle di sicurezza** da chiudere e manca il flusso self-service.

## DECISIONI DI DESIGN (confermate dall'utente)
1. **Lettori** → accesso **solo via magic-link** (email → link via email → clic → entra). **Nessun accesso immediato** con la sola email.
2. **Area personale/profilo** → **riservata** (richiede sessione valida).
3. **Admin/editor** → **solo** via `?adm=TOKEN` (link-bookmark segreto). **Mai** via email. Il login email produce al massimo ruolo `lettore`.

## ⚠️ REGOLE DI SICUREZZA OPERATIVE (LEGGERE)
- **NON bloccare l'admin fuori.** L'accesso `?adm=TOKEN` deve restare sempre funzionante: **testarlo come PRIMA cosa dopo ogni fase**. Tenere il token admin a portata di mano.
- Lavorare in **flusso continuo** ma con **un commit per fase**; al termine, riepilogo. Fermarsi se un cambiamento rischia di rendere irraggiungibile l'admin o di rompere il flusso pubblico anonimo.
- Niente segreti nel codice; gating via `_isCurrentUserAdmin_()` (token-based). `clasp push` poi deploy manuale (utente).

---

## FASE L0 — CHIUDERE LA FALLA (prima di tutto)
**File:** `Sessioni_v1.js`, `Codice.js`

1. **Rimuovere il bypass admin/editor via email + auto-creazione admin** — `Sessioni_v1.js:235-254`: oggi se l'email è in `OC_ADMIN_EMAILS`/`OC_EDITOR_EMAILS` il login email bypassa il flag e, se manca la riga `Utenti`, **crea un admin al volo**. → **Eliminare** questo ramo. Dopo il fix: `loginConEmail`/magic-link assegnano **solo** `lettore` (livello 1); admin/editor si ottengono **solo** dal token `?adm` (`CurrentUser_v44.js` già lo fa via `_validateAdminToken_`).
2. **`loginConEmail` non deve più dare accesso immediato** (decisione 1): trasformarlo nel passo "richiedi magic-link" (vedi L1) o deprecarlo. Nessun ramo deve restituire un `token` di sessione senza che l'utente abbia cliccato il link.
3. *Accettazione L0:* con `OC_PUBLIC_LOGIN_ENABLED` assente/false, nessun accesso via email (nessun livello >0); un'email nella lista admin **non** dà accesso senza `?adm`. L'admin entra ancora via `?adm=TOKEN`. **Testare entrambi.**

*Commit:* `security(login): rimuove bypass admin-via-email + auto-create (chiusura falla)`

---

## FASE L1 — MAGIC-LINK self-service per i lettori
**File:** `Sessioni_v1.js`, `Codice.js` (doGet), `Index.html` (UI login)

Modello a **due token** (separare il link dalla sessione):
- **Magic token**: corto, **monouso**, **con scadenza** (es. 30 min). Va nel link `?t=`.
- **Session token**: lungo (UUID-32), persistente con **TTL inattività**, salvato in `localStorage.oc_token`.

1. **Nuova funzione `richiediMagicLink(email)`** (chiamabile da frontend):
   - valida formato email; **fail-closed** se `!isPublicLoginEnabled_()` → risposta neutra;
   - verifica che l'email sia un **lead/utente noto** (riga in `Utenti` o `Sessioni_v1`/`ContactsMatrix`/`RichiestePrenotazione`); se non esiste, **risposta identica** (non rivelare quali email esistono);
   - genera un **magic token** (campo riga `magic_token` + `magic_expires` = ora+30min + `magic_used=false`) e invia l'email con `_sendMagicLinkEmail_` (già esistente, `Sessioni_v1.js:1103`);
   - **rate-limit** per email/IP (riusa `_rateLimited_`), per evitare mail-bombing;
   - ritorna sempre `{ok:true, message:'Se l'email è registrata, riceverai un link per accedere.'}`.
2. **Validazione `?t=` in doGet** (`Codice.js:~278`): risolvere il **magic token** → se valido, non scaduto, non usato → marcare `magic_used=true` → emettere/attivare il **session token** (TTL) → iniettarlo come oggi (`OC_SESSION_PLACEHOLDER`). Un magic token già usato o scaduto → pagina "link non valido o scaduto, richiedine uno nuovo".
3. **Allineare i magic-link automatici** (Matrix `Matrix_v1.js:380`, prenotazione `Prenotazioni_v1.js:83`, sondaggi `Sondaggi_v1.js:194`): devono usare lo **stesso** magic token monouso (non il session token diretto). 
4. **UI login** (`Index.html`): il form "Accedi" chiede **solo email** → `OC.richiediMagicLink(email)` → mostra "Ti abbiamo inviato un link". Mostrare il form **solo se** `window._ocLoginEnabled` è true (per i non-admin); altrimenti messaggio "accesso non attivo". La **registrazione** (`registraUtente`) resta separata. Rimuovere il vecchio login immediato.
5. *Accettazione L1:* inserisco un'email registrata → ricevo l'email col link → clic → entro come lettore; il link **non** funziona una seconda volta né dopo 30 min; un'email non registrata riceve la stessa risposta neutra; con login OFF il form non compare ai non-admin.

*Commit:* `feat(login): magic-link self-service (richiedi link, token monouso a scadenza)`

---

## FASE L2 — AREA RISERVATA + gate robusto + TTL
**File:** `Index.html` (gate `go()`, `_GUEST_PAGES`), `Sessioni_v1.js`

1. **Profilo/area personale riservati** — rimuovere `'profilo-pro'` (e ogni pagina personale) da `_GUEST_PAGES` (`Index.html:2096`); `OC.goProfiloTab` (`:11223`) deve richiedere sessione (se ospite → invitare al login). Le pagine pubbliche (home, chi siamo, sezioni contenuti) restano ospiti.
2. **Gate non fidarsi del solo localStorage** — `Index.html:2104` concede livello 1 se esiste `localStorage.oc_token` (basta scrivere una stringa qualsiasi). → concedere L1 **solo dopo** che `validaSessione(token)` lato backend ha confermato; finché non confermato, trattare come ospite.
3. **TTL sessioni** — impostare `OC_SESSION_TTL_DAYS=90` (setup/ScriptProperty) e verificare che `validaSessione` (`Sessioni_v1.js:133-144`) faccia **scadere davvero** le sessioni inattive; `cleanupSessioniScadute` deve revocare (già fa setValue revoked).
4. *Accettazione L2:* da ospite, aprendo il profilo vengo invitato al login; scrivere un `oc_token` finto in localStorage **non** dà accesso; una sessione inattiva da >90 gg non è più valida.

*Commit:* `security(login): area personale riservata + gate validato backend + TTL sessioni`

---

## FASE L3 — RICONCILIAZIONE sistema ruoli (una sola fonte di verità)
**File:** `Codice.js` (doPost/authenticate), `Auth.js`

1. **Deprecare l'auth legacy `doPost`+`authenticate`** (`Codice.js:1434-1458`): usa password (`ADMIN_PWD`/`EDITOR_PWD`) e foglio **MailingList** come fonte ruoli, parallela e non allineata a `getRuoloCorrente`. → far passare ogni autorizzazione da **`getRuoloCorrente`/`getCurrentUserAuth`** (token-based, fonte: `Utenti` + `Sessioni_v1` + `OC_ADMIN_EMAILS`). `MailingList` resta **solo** per i digest, non per i ruoli. Rimuovere `ADMIN_PWD`/`EDITOR_PWD` se non più usati.
2. **Verificare che nessuna pagina/azione** dipenda ancora dal vecchio `authenticate` per il ruolo; le azioni doPost devono usare il token di sessione validato.
3. *Accettazione L3:* esiste **una sola** logica di ruolo (token-based); nessun accesso via password condivisa; `MailingList` non concede più ruoli.

*Commit:* `refactor(login): fonte ruoli unica token-based, deprecato auth legacy password/MailingList`

---

## Definition of Done (Login)
- [ ] **Falla chiusa**: nessun accesso admin/editor con la sola email; niente auto-creazione admin.
- [ ] **Lettori** accedono **solo** via magic-link (email → link monouso a scadenza → sessione); risposta neutra; rate-limit.
- [ ] **Admin/editor** entrano **solo** via `?adm=TOKEN` (testato e funzionante dopo ogni fase).
- [ ] **Area personale** riservata; gate validato lato backend (no bypass localStorage); sessioni con TTL.
- [ ] **Una sola fonte di verità** ruoli (token-based); auth legacy password/MailingList deprecata.
- [ ] `clasp push` ok; flusso pubblico anonimo intatto; admin mai bloccato fuori.

*Al termine: riepilogo per fase + commit + come testare (lettore via link, admin via ?adm, ospite bloccato sul profilo). Poi l'utente fa il deploy e una verifica finale.*
