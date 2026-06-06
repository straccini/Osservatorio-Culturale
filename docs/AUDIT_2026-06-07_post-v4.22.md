# Audit a freddo — stato post v4.21.2 / v4.22

**Data:** 7 giugno 2026
**HEAD:** `05e711d` (feat fonti v4.22) · su `feat/fonti-feed-unificazione`
**Ambito:** stato del codice dopo le modifiche recenti (login magic-link v4.21.2 `bbaa593`, backend fonti v4.22 `05e711d`).
**Metodo:** 4 revisioni parallele su aree distinte + verifica diretta dei finding più gravi.
**Legenda gravità:** 🔴 critico · 🟠 importante · 🟡 minore. **Confidenza:** ✔ verificato direttamente · ◦ da revisione (evidenza file:riga).

---

## Sintesi esecutiva

Tre temi trasversali tengono insieme la maggior parte dei problemi:

1. **Il magic-link è applicato a metà.** Il form di login principale è corretto; il flusso di registrazione/post-Matrix aggira la verifica dell'email e il backend espone ancora il token al client. → rischio sicurezza.
2. **La chiave del CRM è incoerente (responseId vs email).** È la radice della pipeline lead "rotta a valle": punteggi non sommati, vista lead unificata sempre a zero, alert lead-caldo fragile.
3. **La catena outbound (ROC) non è operativa end-to-end.** Più anelli scritti ma non collegati (follow-up, meeting, bottoni Telegram, triage su colonne assenti).

**Buona notizia (premessa corretta):** la **profilazione L2 NON è rotta** — esiste `ProfiloPro_v1.js` attivo accanto al backup `.disabled`. La disattivazione non ha lasciato chiamate orfane. Anche la protezione admin-su-admin, l'entropia del token e il fail-closed del login pubblico sono risultati solidi.

---

## 🔴 Critici

### C1 — Magic-link aggirabile nel flusso registrazione/post-Matrix; token esposto nelle risposte ✔
- `Sessioni_v1.js:330` — `loginConEmail` invia il magic-link **ma restituisce comunque `token`** al client (la riga 323 dichiara il contrario).
- `Index.html:4805-4809` — il client estrae il token da `r.magicLink` (`searchParams.get('t')`) e fa `localStorage.setItem('oc_token', _tok)` + `OC_SESSION={token:_tok,…}` → **login immediato senza cliccare l'email**.
- Per contrasto, `_submitLoginForm_` (`Index.html:7407-7444`) è **corretto**: mostra "controlla la tua casella" e non usa il token. → **incoerenza tra percorsi**.
- **Rischio:** registrando un'email altrui (o ri-registrandola) si può ottenere una sessione per quell'email senza possederla → account takeover.
- **Fix:** il backend non deve mai restituire `token`/`magicLink` al client; tutti i percorsi devono comportarsi come il form principale (accesso solo dopo click sul link).

### C2 — Chiave CRM incoerente: `responseId` vs `email` ◦
- `CRM_v1.js:91` — `_crmFindRow_` cerca solo sulla colonna 0 (`response_id`). Chiamano con `responseId`: `Matrix_v1.js:223,387`, `ProfiloPro_v1.js:140`, `Sondaggi_v1.js:204`. Chiamano con `email`: `Prenotazioni_v1.js:90`, `Digest_routing.js:325`, `CalendarioLS3.js:373`.
- **Effetto:** lo stesso museo finisce in due righe scollegate; i punti non si sommano; lo stato lead è falsato. È la radice di C3.
- **Fix:** normalizzare la chiave su `email` (o aggiungere a `_crmFindRow_` un match secondario sulla colonna `email`) e migrare le righe esistenti.

### C3 — `getLeadUnificato` legge `Score`, ma la colonna è `score_total` ✔
- `OutreachEngine.js:72` — `cHead.indexOf('Score')` / `'score'`; l'header reale è `score_total` (`CRM_v1.js:51`, foglio `CRM_Leads` confermato a `CRM_v1.js:39`). `indexOf` = −1 → `crmScore` **sempre 0**.
- **Effetto:** la "vista lead unificata" perde sempre il punteggio CRM (il pezzo più importante).
- **Fix:** `cHead.indexOf('score_total')` + join sulla colonna `email`.

### C4 — Catena outbound ROC non operativa sui dati reali ◦
- `meeting_booked +20` (`CRM_v1.js:65`) **mai chiamato**; la prenotazione registra `consultation_requested +5`, evento **non presente** in `CRM_EVENT_POINTS`.
- `followup_due` (`ROC_v1.js:484`) **scritto ma mai letto** (nessun `roc_runFollowup`).
- Bottoni Telegram `?roc=avvia/skip` (`ROC_v1.js:149`) **non gestiti in `doGet`** → si lanciano le funzioni a mano.
- `roc_triageBando` legge `Importo`/`Livello` che potrebbero **non esistere** nel foglio RADAR BANDI → triage fallisce, pipeline inerte.
- Seed musei pilota senza `email_direzionale` → invii saltati (`roc_approveBatch:449`).
- **Fix:** completare il wiring (doGet `?roc=`, `roc_runFollowup`, hook `meeting_booked`), mappare i nomi colonna reali dei bandi, popolare le email.

### C5 — Benchmark reale assente da PDF e digest ◦
- `Matrix_v1.js:723` ritorna `{placeholder:true}`; il PDF non renderizza alcuna sezione benchmark; il confronto reale (`getMatrixCompareWithBenchmark`) è cablato **solo on-screen**.
- **Effetto:** un argomento di vendita pronto ("sei sotto la mediana su accessibilità") non arriva al museo.
- **Fix:** cablare il benchmark reale in `getMatrixReport`/PDF.

---

## 🟠 Importanti

### I1 — Login: admin/editor via substring + bypass dello stato ✔
- `Sessioni_v1.js:281` — `adminCsv.indexOf(email) >= 0` è un match di **sottostringa** (falsi positivi: `mario@x.it` matcha `supermario@x.it`).
- `Sessioni_v1.js:295` — `if (utente.stato !== 'attivo' && !isAdminEmail)` → un admin/editor **sospeso rientra comunque**.
- **Fix:** match esatto via `_getAdminSet_()`; verificare lo stato anche per admin/editor.

### I2 — `validaSessione`: livello dal ruolo senza ricontrollare lo stato ◦
- Un utente `sospeso` con `ruolo='admin'` e token valido ottiene `livello=3`. La sospensione non revoca le sessioni esistenti.
- **Fix:** in `validaSessione`, se stato ≠ `attivo` → invalida; alla sospensione revocare le sessioni.

### I3 — Sessioni permanenti senza TTL di default ◦
- TTL applicato solo se `OC_SESSION_TTL_DAYS > 0`, ma la property non è impostata (default `0`); token passato in URL `?t=`. Il magic-link è di fatto permanente e riusabile.
- **Fix:** impostare `OC_SESSION_TTL_DAYS` (60/90) in produzione; idealmente token-link monouso a TTL breve distinto dal token di sessione.

### I4 — Nessun rate-limit su login/registrazione/sessione ◦
- `loginConEmail`, `registraUtente`, `createSessione` inviano email senza `_rateLimited_` → mail-bombing verso email arbitrarie + esaurimento quota MailApp (DoS login).
- **Fix:** `_rateLimited_('login:'+email, 5, 3600)` in testa.

### I5 — `_autoRegisterUser_` riattiva utenti `rifiutato`/`sospeso` ◦
- `Auth.js:315` riattiva come `lettore/attivo` anche chi era stato rifiutato/sospeso (mentre `requestAccess` li blocca, righe 380-381). Incoerenza tra i due percorsi → moderazione aggirabile.
- **Fix:** per `rifiutato`/`sospeso` non riattivare; riattivare solo `pending`/nuovi.

### I6 — Consenso GDPR solo client-side ◦
- L'overlay GDPR si chiude scrivendo `localStorage`; nessuna registrazione server-side del consenso, non blocca le scritture, aggirabile da console; con email vuota la chiave è condivisa.
- **Fix:** registrare il consenso lato server (timestamp) come prerequisito per gli endpoint write.

### I7 — Digest: lacune di copertura e dedup ◦
- **Bandi assenti ai lettori puri** (coorte A): ricevono solo news (i profilati con tematica ora ricevono bandi).
- **Starvation/backlog:** il dedup 5gg fa "vincere" il digest del lunedì (coorti) sul martedì (queue Matrix → `skipped_dedup`); il tagger `MatrixDim` gira **solo settimanale** a batch 100 → backlog (la doc dice "ogni notte": **errata**).
- **Bozze spurie:** `testDigestMatrixForEmail` (`Matrix_digest.js:640`) chiama `generateDigestForUser` **senza `{save:false}`** → ogni test admin scrive una bozza che poi viene inviata davvero.
- **Reset flag prematuro:** `InclusiNelDigest` viene azzerato anche se la coorte A non ha spedito → news "bruciate".

### I8 — Versione incoerente ◦
- `Constants.js:101` = `v4.19.1`; ultimo commit = `v4.22`; `CLAUDE.md` = `v4.18.x`. La versione mostrata in UI e la tracciabilità deploy sono disallineate.
- **Fix:** allineare `OC_VERSION` alla versione realmente deployata.

---

## 🟡 Minori / igiene

- **M1 — Bug `body.nome` in `_autoRegisterUser_`** (`Auth.js:321`): `body` non esiste (il param è `nome`) → eccezione silenziata, welcome email ai riattivati non parte. *(trovato da due revisioni)* — fix: `nome`.
- **M2 — File `.disabled` in git** (`ProfiloPro_v1.js.disabled`, `Segnalazioni_v1.js.disabled`, `Navigation.html.disabled`): rumore; rischio riattivazione → duplicati di funzione → errore caricamento GAS. Fix: `git rm`.
- **M3 — Eventi CRM disallineati:** `webinar_signup`/`matrix_repeated` definiti e mai emessi (codice morto); eventi emessi (`consultation_requested`, `profilo_salvato`, `digest_sent`…) non in tabella → rischio 0 punti silenziosi.
- **M4 — Stati lead parziali:** lo schema dichiara `lead|mql|sql|hot|cliente|cold` ma il codice ne assegna solo 3; promozione senza demozione.
- **M5 — Reply-to/branding incoerenti** tra i 3 flussi digest (`Session.getEffectiveUser` vs `s.straccini@gmail.com` hardcoded; l'email `info@sinopiaconsulting.it` non è usata).
- **M6 — `dimToAmbito` non simmetrica** (`Matrix_digest.js:360`): D2-D5 collassano sull'ambito 3 → fallback poco pertinente quando il tagging è in backlog.

---

## ✅ Risultate solide / premesse corrette

- **Profilazione L2 integra:** `ProfiloPro_v1.js` è attivo (il `.disabled` è un backup); nessuna chiamata orfana per Profilo/Segnalazioni; nessun `include()` rotto per `Navigation`.
- **Protezione admin-su-admin:** solida lato backend (match esatto lowercase, super-admin, blocco auto-eliminazione). Solo un disallineamento UI minore (badge hardcoded `s.straccini@gmail.com` invece di `OC_SUPER_ADMIN_EMAIL`).
- **Entropia token:** adeguata (`_generaToken_` = 2× `Utilities.getUuid()`).
- **Fail-closed login pubblico:** `OC_PUBLIC_LOGIN_ENABLED` default false, prima barriera in `loginConEmail`.
- **Opt-in → hot:** RISOLTO da `c07f7ea` (le chiavi D12.1 `bandi_*` sono riconosciute → +30 → alert).
- **bbaa593 su digest:** nessuna regressione (solo funzioni di test aggiunte, firme retrocompatibili).
- **Gating token** su funzioni privilegiate (deploy "Chiunque"): coerente.

---

## Incongruenze nei documenti di progetto (autocritica)

- **Spec funnel — `AcquisitionSource` non esiste:** l'header reale di `Utenti` (`Auth.js:51-55`) è `ID,Email,Nome,Ruolo,Stato,OptInDigest,OptInBandi,OptInMatrix,DataIscrizione,DataApprovazione,AggiuntoDa,Note`. La spec §5 va precisata: la colonna è **da creare** (il piano già prevede `_ensureAcquisitionColumn_`, quindi l'implementazione è coperta — è la spec a darla per esistente).
- **Spec §13 — premessa errata:** assume `ProfiloPro_v1.js` disabilitato; in realtà è **attivo**. Correggere.
- **Piano Task 0 — esiti confermabili ora:** `CRM_SHEET='CRM_Leads'` ✔; `ProfiliPro.completezza` esiste (pos. 11) ✔; header di `ResponsesMatrix`, `RichiestePrenotazione`, `ROC_Outreach` ✔.

---

## Priorità d'intervento (ordine consigliato)

1. **C1 — Magic-link/token** (sicurezza, possibile account takeover). Il backend smetta di restituire token/magicLink; unificare sul flusso email-click.
2. **C2 — Chiave CRM** (radice della pipeline lead). Normalizzare su `email`.
3. **Quick win ad alto impatto:** **C3** (`score_total`, una riga) + **I4** (rate-limit, poche righe) + **M1** (`body.nome`) + **C5** (benchmark nel PDF).
4. **I1/I2/I5 — Igiene sicurezza login** (match esatto, ricontrollo stato, no riattivazione di rifiutati).
5. **C4 — Completare ROC** (più lavoro): valutare se l'outbound è priorità ora o dopo la regolazione delle fonti.
6. **Igiene:** M2 (`git rm` .disabled), I8 (versione), I3 (TTL), I6 (consenso server-side), I7 (digest).

> Nota di metodo: i finding marcati ✔ sono stati verificati direttamente sul codice in questa sessione; quelli ◦ provengono dalle revisioni con evidenza file:riga e andrebbero confermati con un test mirato prima di un fix in produzione.
