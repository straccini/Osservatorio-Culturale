# Piano di intervento pre-pilota — Sinopia (v4.22.4 → v4.23.0)

> **Per chi esegue:** piano task-by-task con checkbox `- [ ]`. Si esegue insieme, un punto alla volta. Riferimento di analisi: `docs/REVISIONE_PRE_PILOTA_v4.22.4.md`.

**Goal:** portare la webapp a uno stato **lecito e robusto** per aprirla a un campione pilota di 50 referenti museali per alcune ore.

**Approccio:** interventi **additivi e chirurgici** (mai stravolgere il funzionamento). Tre fasi: A = bloccanti, B = robustezza + grafica, C = igiene post-pilota.

**Stack:** Google Apps Script (V8) + Google Sheets + HTML Service (iframe sandbox). Deploy: `sync-oc-to-gas.ps1` (clasp push + auto-deploy, URL invariato).

---

## Come si lavora (convenzioni di questo piano)

- **Verifica codice:** dove possibile si scrive una funzione di test GAS `_test_xxx_()` da eseguire nell'editor (Esegui → guarda il Log); altrimenti verifica nel **browser in incognito** (`Ctrl+Shift+R`).
- **Deploy:** a fine di ogni gruppo di task → `cd "...\musemu matrix"; .\sync-oc-to-gas.ps1`.
- **Chi fa cosa:**
  - 🤖 = lo implemento io (codice).
  - 👤 = lo fai tu, Silvano (contenuti legali, verifiche account, decisioni).
- **Versione:** a fine FASE A si bumpa `OC_VERSION` a `v4.23.0`.

## Mappa file toccati
| File | Task | Responsabilità |
|---|---|---|
| `Auth.js` (nuovo helper) o `Constants.js` | A2 | helper `_requireAdminGSR_` |
| `CRM_v1.js` | A2, A4 | gate funzioni PII; payload Telegram |
| `MailingManager.js` | A2, A6 | gate `getMailingList`; segreto HMAC |
| `ROC_v1.js` | A2 | gate funzioni outreach |
| `Privacy_v1.js` | A3, A7b | `forgetMyData` completo; utm validate |
| `Sessioni_v1.js` | A5, A7a | guardia quota magic-link; consenso server-side |
| `Newsletter_v44.js` | A7c | footer disiscrizione |
| `Index.html` | B1,B2,B4,A7a | banner errore home; dark-mode modali; onerror; consenso |
| `HomeView.html` | B3 | CTA hero |
| `Styles.html` | B5 | topbar mobile |
| `Sidebar.html` + endpoint | B6 | versione dinamica |
| (pagina web esterna) | A1 | informativa privacy 👤 |

---

# FASE A — BLOCCANTI (prima di pubblicare)

## Task A1 — 👤 Informativa privacy raggiungibile  `[LEGALE]`
**Perché:** senza informativa ex artt. 13-14 GDPR raggiungibile dai link già presenti, il consenso raccolto **non è valido** (gap P1).
**File/azione:** pubblicare la pagina all'URL già linkato nel codice: `https://www.duemilamusei.it/privacy` (citato in `Index.html:199, 7791, 11856`).

- [ ] **A1.1** Redigere l'informativa. Contenuto minimo: titolare (Duemilamusei) + contatto (`info@sinopiaconsulting.it`); **tutte le finalità** incluse *autovalutazione, profilazione commerciale (lead scoring), invio digest personalizzati*; basi giuridiche (consenso); **destinatari e trasferimento extra-UE** (Google, Anthropic-USA, Telegram); periodi di conservazione; diritti e come esercitarli (accesso, cancellazione, ecc.). *(Posso prepararti io la bozza testo come documento separato — è contenuto, non codice.)*
- [ ] **A1.2** Pubblicare la pagina e **verificarne la raggiungibilità** da browser anonimo.
- [ ] **A1.3** Verifica: aprire i 3 link nell'app → la pagina si apre. ✔️ done quando la pagina risponde 200 ed è completa.

## Task A2 — 🤖 Blindare le funzioni esposte (PII + abuso)  `[SICUREZZA + PRIVACY]`
**Perché:** deploy "anonimo" ⇒ ogni funzione globale è chiamabile da chiunque via `google.script.run`. `crm_listLeads`, `getMailingList`, `crm_recordEvent`, `crm_unsubscribe`, `roc_*` non hanno gate (gap S1, S2, S4) → esfiltrazione email/lead = **data breach**.

**File:** `Auth.js` (o `Constants.js`), `CRM_v1.js`, `MailingManager.js`, `ROC_v1.js`.

- [ ] **A2.1 (verifica-prima)** Aprire e confermare a video che queste funzioni sono globali e senza controllo ruolo interno: `crm_listLeads` (`CRM_v1.js:190`), `getMailingList`/`getMailingListSummary` (`MailingManager.js:13/22`), `crm_recordEvent` (`CRM_v1.js:104`), `crm_unsubscribe` (`CRM_v1.js:245`), `crm_notifyHotLead` (`CRM_v1.js:216`), `roc_approveBatch`/`roc_matchMusei`/`roc_buildEmailBatch` (`ROC_v1.js`). *(Non si patcha nulla finché non confermiamo la firma esatta.)*
- [ ] **A2.2** Creare helper di gate in `Auth.js`:
```javascript
// Gate per funzioni google.script.run sensibili su deploy ANONIMO.
// Ritorna true se la sessione/token corrisponde a admin/editor.
function _requireAdminGSR_(token) {
  try {
    if (typeof _isCurrentUserAdmin_ === 'function' && _isCurrentUserAdmin_(token)) return true;
    if (token && typeof validaSessione === 'function') {
      var s = validaSessione(token);
      if (s && s.ok && s.valid && (s.livello >= 2)) return true; // editor/admin
    }
  } catch (e) {}
  return false;
}
```
- [ ] **A2.3** In `crm_listLeads`, `getMailingList`, `getMailingListSummary`, `crm_unsubscribe`, `roc_*` aggiungere in testa:
```javascript
if (!_requireAdminGSR_((body && body.token) || null)) return { ok:false, error:'forbidden' };
```
e passare il `token` admin dal frontend dove queste sono chiamate (cercare le chiamate `google.script.run.crm_listLeads`/`.getMailingList` in `Index.html` e aggiungere `{token: window.OC_SESSION && window.OC_SESSION.token}`).
- [ ] **A2.4** Rendere **interne** (prefisso `_`, non più invocabili da `google.script.run`) le funzioni che NON servono al frontend: `crm_recordEvent` → `_crm_recordEvent_`, `crm_notifyHotLead` → `_crm_notifyHotLead_`. Aggiornare i chiamanti server-side.
- [ ] **A2.5 Verifica:** funzione di test GAS:
```javascript
function _test_gates_() {
  Logger.log('listLeads no-token: ' + JSON.stringify(crm_listLeads({})));      // atteso forbidden
  Logger.log('getMailingList no-token: ' + JSON.stringify(getMailingList({}))); // atteso forbidden
}
```
Eseguire nell'editor → entrambi devono loggare `forbidden`. Poi in incognito verificare che l'app admin (con token) continui a vedere lead e mailing list.
- [ ] **A2.6** Deploy + test admin reale (login admin → CRM/mailing visibili).

## Task A3 — 🤖 `forgetMyData` completo + promessa CRM 30gg  `[PRIVACY]`
**Perché:** `forgetMyData` cancella 4 fogli su ~12 (gap P2); il CRM promette "cancellazione entro 30gg" mai eseguita (gap P3).

**File:** `Privacy_v1.js`, `CRM_v1.js`.

- [ ] **A3.1** In `Privacy_v1.js` (`forgetMyData`, ~riga 176) estendere l'elenco fogli purgati a TUTTI quelli con dati personali: `Utenti`, `Sessioni_v1`, `RichiestePrenotazione`, `SondaggiMirati`, `ProfiloAgenti`, `ProfiliPro`, `Segnalazioni`, `UnsubscribeLog` (oltre ai 4 già presenti). Per ciascuno: cancellare le righe dove la colonna email == utente. Mantenere `ForgetAudit` con **hash** (già corretto).
- [ ] **A3.2** Per `crm_unsubscribe` (`CRM_v1.js:245`): scegliere insieme **una** delle due strade —
  (a) implementare un trigger giornaliero `_crm_purgeUnsubscribed_()` che cancella i lead `unsubscribed` da >30gg; **oppure**
  (b) eliminare dal messaggio la promessa "entro 30gg" e cancellare subito.
- [ ] **A3.3 Verifica:** test GAS che inserisce una riga fittizia `test@example.invalid` in ogni foglio, esegue `forgetMyData` per quell'email (con sessione di test), e logga che ogni foglio non la contiene più.
- [ ] **A3.4** Deploy.

## Task A4 — 🤖 Telegram senza PII in chiaro  `[PRIVACY]`
**Perché:** la notifica hot-lead invia email+nome+museo+regione a Telegram (extra-UE), non dichiarato (gap P4).

**File:** `CRM_v1.js` (~216-232).

- [ ] **A4.1** Ridurre il payload Telegram a dati non identificativi: museo + regione + score + un **id interno** del lead (non email/nome). L'admin recupera il contatto completo nell'app.
- [ ] **A4.2 Verifica:** forzare una notifica di test → controllare che il messaggio Telegram NON contenga email/nome.
- [ ] **A4.3** Deploy.

## Task A5 — 🤖 Guardia quota email sul magic-link  `[PRODUZIONE]`
**Perché:** a quota esaurita l'utente si registra, legge "controlla l'email" ma non riceve nulla e resta chiuso fuori (gap Pr2).

**File:** `Sessioni_v1.js` (`_sendMagicLinkEmail_`, ~1269).

- [ ] **A5.1** In `_sendMagicLinkEmail_`, prima dell'invio:
```javascript
try { if (MailApp.getRemainingDailyQuota() < 3) { Logger.log('quota email bassa'); return { ok:false, error:'quota' }; } } catch(e){}
```
e nel chiamante (`loginConEmail`/registrazione) propagare un messaggio onesto: *"Iscrizione registrata — il link di accesso potrebbe arrivare con qualche ora di ritardo."*
- [ ] **A5.2 Verifica:** test GAS che logga `MailApp.getRemainingDailyQuota()` (valore di partenza prima del pilota).
- [ ] **A5.3** Deploy.

## Task A6 — 👤+🤖 Verifiche di configurazione  `[PRODUZIONE + SICUREZZA]`
- [ ] **A6.1** 👤 Verificare il **tipo di account** del deployer: `s.straccini@gmail.com` consumer = **100 email/giorno**; Workspace = 1500. (Eseguire `_test_quota_()` che logga `getRemainingDailyQuota()`.) Decidere se spalmare i 50 inviti su **2 giorni**.
- [ ] **A6.2** 🤖+👤 Confermare che `OC_UNSUB_SECRET` sia impostata nelle ScriptProperties (gap S5). Se manca, impostarne una random. Verificare che NON resti il default `'sinopia2026'`.
- [ ] **A6.3** 👤 Confermare presenti le 3 ScriptProperties critiche (`SHEET_ID`, `CLAUDE_API_KEY`, schema Matrix) e l'esecuzione una-tantum di `setupKeepWarmTrigger()`, `setupMatrixSheets()`, `setupPubblicazioniSheet()`.

## Task A7 — 🤖 Consenso server-side + disiscrizione newsletter  `[PRIVACY]`
**File:** `Sessioni_v1.js`/`Auth.js` (registrazione), `Index.html` (gate), `Newsletter_v44.js`.

- [ ] **A7a** Registrare il consenso **server-side** con `consenso_data` (ISO) + `consenso_versione` nel foglio `Utenti`/sessione (oggi è solo flag o `localStorage`, gap P5).
- [ ] **A7c** Aggiungere alla newsletter admin (`Newsletter_v44.js:120`) il footer di disiscrizione firmato già usato dai digest (`_digestUnsubFooter_`) (gap P6).
- [ ] **A7.verifica** Registrarsi in incognito → controllare nel foglio `Utenti` che compaiano data+versione consenso; aprire una newsletter di test → c'è il link "Disiscriviti" funzionante.
- [ ] **A7.deploy** Deploy + **bump `OC_VERSION` → v4.23.0** (`Constants.js`).

---

# FASE B — ROBUSTEZZA + GRAFICA (subito dopo / in parallelo)

## Task B1 — 🤖 Banner errore sulla home  `[UX]`
**File:** `Index.html` (~2798, handler di `getHomePayload`).
- [ ] **B1.1** Nel `withFailureHandler` di `getHomePayload`, oltre al `console.error`, mostrare un banner inline: *"Impossibile caricare i contenuti — Riprova"* con bottone che richiama il reload.
- [ ] **B1.2 Verifica:** simulare l'errore (es. rinominare temporaneamente la funzione lato client) → compare il banner. Deploy.

## Task B2 — 🤖 Dark-mode dei modali  `[GRAFICA]`
**File:** `Index.html` (`:128, :171, :212, :11842`).
- [ ] **B2.1** Sostituire i `background:#fff` inline dei modali (registrazione, newsletter, prenotazione, GDPR-gate) con `var(--paper)` (così seguono il tema).
- [ ] **B2.2 Verifica:** attivare dark mode → aprire ogni modale → fondo scuro coerente, niente "lampo bianco". Deploy.

## Task B3 — 🤖 CTA nell'hero  `[CONVERSIONE]`
**File:** `HomeView.html` (~57).
- [ ] **B3.1** Aggiungere sotto la headline dell'hero un pulsante primario: **"Valuta il tuo museo — 10 min →"** → `OC.go('matrix')`.
- [ ] **B3.2 Verifica:** home in incognito → il pulsante è visibile above-the-fold e porta al Matrix. Deploy.

## Task B4 — 🤖 `onerror` sulle copertine  `[GRAFICA]`
**File:** `Index.html` (~4056, cover podcast home).
- [ ] **B4.1** Aggiungere `onerror="this.style.display='none'"` (o fallback all'icona microfono) come già fatto sul Social Wall (`:3045`).
- [ ] **B4.2 Verifica:** card con cover rotta → nessuna icona "immagine rotta". Deploy.

## Task B5 — 🤖 Topbar mobile più snella  `[MOBILE]`
**File:** `Styles.html` (~528, media query).
- [ ] **B5.1** A `≤640px` nascondere `.topbar-search` e l'indicatore `⌘K` nelle pagine interne (la ricerca resta in Home via hero). Lasciare lente + azioni essenziali.
- [ ] **B5.2 Verifica:** browser ridimensionato a 360px → topbar pulita, niente fessura search. Deploy.

## Task B6 — 🤖 Versione dinamica in sidebar  `[COERENZA]`
**File:** `Sidebar.html` (~36) + endpoint `getOcConstants()`.
- [ ] **B6.1** Popolare `#sidebarVersion` dal valore reale `OC_VERSION` (via `getOcConstants()`), invece dell'hardcoded `v4.20`.
- [ ] **B6.2 Verifica:** sidebar mostra la versione corrente. Deploy.

---

# FASE C — IGIENE (post-pilota o in parallelo, non bloccante)

- [ ] **C1 — 🤖 Formula injection (gap S6):** applicare `_sanitizeForCell_()` a tutti i campi testuali esterni prima di `appendRow` negli scanner (`NewsScanner.js`, scanner bandi/podcast).
- [ ] **C2 — 🤖 Schema URL nelle card (gap S7):** validare `^https?://` su `href`/`onclick`; per onclick usare `data-url` + event delegation.
- [ ] **C3 — 🤖 utm_target (gap S3):** validare destinazione + escape in `Privacy_v1.js:131/139` (può anche entrare in FASE A se decidiamo di tenere attivo il tracking UTM nel pilota).
- [ ] **C4 — 🤖 Rate-limit per-IP + deprecare email-as-token (gap S8/S9).**
- [ ] **C5 — 👤+🤖 Retention + registro trattamenti (gap P8/P9):** `OC_SESSION_TTL_DAYS`, scadenza lead inattivi, registro art. 30, DPA Google/Anthropic.
- [ ] **C6 — 🤖 Spacchettare `Codice.js`** progressivamente (manutenibilità).

---

## Self-review (copertura spec)
- Privacy P1→A1, P2/P3→A3, P4→A4, P5→A7a, P6→A7c, P7→A1(testo)+C5, P8/P9→C5. ✔️
- Sicurezza S1/S2/S4→A2, S3(utm)→C3/A, S5→A6.2, S6→C1, S7→C2, S8/S9→C4. ✔️
- Produzione Pr1→A6.1, Pr2→A5, Pr3→B1, Pr4→A6.3. ✔️
- Grafica F1→B3, F2→B2, F3→B5, F4→B4, F5→B6, F6→(C, minore). ✔️
- *Nota:* il punto S3/utm può salire in FASE A se nel pilota teniamo i link UTM nei digest; da decidere insieme.

---

**Nota di esecuzione:** alcune patch (A2 soprattutto) richiedono il passo "verifica-prima" sul codice live: confermiamo le firme reali prima di scrivere il fix definitivo, così evitiamo di rompere chiamate esistenti.
