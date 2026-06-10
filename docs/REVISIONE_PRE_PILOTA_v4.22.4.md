# Revisione pre-pilota — Sinopia · Osservatorio Culturale (v4.22.4)

**Obiettivo:** aprire la webapp a un **campione pilota di 50 referenti museali** per alcune ore.
**Data:** 2026-06-10 · **Ambito:** codice, front-end, sicurezza, privacy/GDPR, prontezza produzione.
**Metodo:** 3 revisioni parallele (sicurezza backend / privacy-GDPR / front-end-produzione) sul codice in `oc-codebase`.
**Stato:** documento di analisi — *nessuna modifica applicata*. Da discutere punto per punto.

---

## 0. Verdetto in una riga

L'app è **matura e ben costruita**, ma **non è ancora pronta** ad aprire a 50 persone reali. Tre categorie di bloccanti:

1. **🟥 Legale (privacy):** manca un'**informativa raggiungibile** → il consenso oggi raccolto non è valido.
2. **🟥 Tecnico-privacy + sicurezza:** alcune funzioni espongono **dati personali a utenti anonimi** e la **cancellazione dati è incompleta** → potenziale data breach GDPR.
3. **🟥 Operativo:** se l'account di invio è Gmail consumer (**100 email/giorno**), il pilota a 50 utenti **esaurisce la quota a metà** e blocca gli accessi.

Risolti questi, il resto sono migliorie (grafiche, robustezza) che alzano la qualità ma non bloccano.

---

## 1. PRIVACY / GDPR (priorità del committente)

### 1.1 Inventario dati personali raccolti
| Dato | Foglio | Finalità | Note |
|---|---|---|---|
| Email, nome, ruolo, opt-in | `Utenti` | account, segmentazione | consenso solo come *flag*, senza data/versione |
| Email, nome, museo, regione, **lead score, storico** | `CRM_Leads` | **profilazione commerciale** | non dichiarata all'utente |
| Email, preferenze, **consenso con timestamp+versione** | `ContactsMatrix` | follow-up consulenza | ✅ ben fatto |
| Profilo museo + 43 risposte + UA hash | `ResponsesMatrix` | autovalutazione | anonimo per design ✅ |
| Email, token magic-link, livello | `Sessioni_v1` | sessione permanente | token **senza scadenza** |
| Email, museo, descrizione, consenso | `RichiestePrenotazione` / `SondaggiMirati` | lead/consulenza | consenso con versione ✅ |
| Email **in chiaro** | `UnsubscribeLog` | audit disiscrizioni | resta dopo la cancellazione |

**Terzi / extra-UE:**
- **Claude/Anthropic (USA):** riceve **solo contenuti pubblici** (bandi/news) — *nessun dato dei referenti*. ✅ punto di forza.
- **Telegram (extra-UE):** la notifica "hot lead" invia **email + nome + museo + regione in chiaro** → non dichiarato.

### 1.2 Gap GDPR
| # | Requisito | Stato | Cosa fare |
|---|---|---|---|
| P1 | **Informativa completa raggiungibile** (artt. 13-14) | 🟥 Mancante | I link puntano a `duemilamusei.it/privacy` ma la pagina non risulta esistente. Senza, **il consenso non è valido**. |
| P2 | **Diritto alla cancellazione completo** | 🟥 Incompleto | `forgetMyData` cancella 4 fogli su ~12; restano copie in Utenti, Sessioni, Prenotazioni, Sondaggi, ProfiliPro, Segnalazioni, UnsubscribeLog. |
| P3 | **Cancellazione CRM "entro 30gg"** | 🟥 Promessa non mantenuta | Il messaggio promette la cancellazione ma **nessun trigger la esegue**: i dati restano per sempre. |
| P4 | **Trasferimento extra-UE dichiarato** | 🟥 Mancante | Né Telegram né Anthropic dichiarati. Inoltre Telegram non dovrebbe ricevere email+nome in chiaro. |
| P5 | **Prova del consenso (data+versione)** server-side | 🟧 Parziale | Registrazione e gate magic-link salvano il consenso solo come flag / in `localStorage` → non opponibile. |
| P6 | **Disiscrizione in ogni email** | 🟧 Parziale | I digest hanno link firmato ✅; la newsletter admin dice solo "rispondi al messaggio". |
| P7 | **Profilazione dichiarata** | 🟧 Parziale | Lead scoring/digest personalizzati non spiegati all'utente. |
| P8 | **Retention / scadenza dati** | 🟧 Mancante | Sessioni e token permanenti; nessuna scadenza su lead/prenotazioni. |
| P9 | **Registro trattamenti + DPA** | 🟨 Mancante | Accettare Google/Anthropic DPA; registro art. 30 (anche minimo). |

### ✅ Già conforme (da mantenere)
Architettura Matrix a 2 tabelle disaccoppiate · consenso timestamp+versione su Contacts/Prenotazioni · unsubscribe firmato HMAC · `forgetMyData` protetto (solo i propri dati) · hash su UA/UTM · **nessun PII a Claude**.

---

## 2. SICUREZZA

> **Nota chiave GAS:** con deploy "Chiunque, anche anonimi", **ogni funzione globale è chiamabile da chiunque** via `google.script.run`, anche se il frontend la usa solo da admin. Il gate in `doPost` NON la protegge. Questo è il vettore dei problemi critici.

| # | Problema | Gravità | Dove | Fix |
|---|---|---|---|---|
| S1 | `crm_listLeads()` / `getMailingList()` **senza gate** → un anonimo scarica tutto il CRM e tutte le email | 🟥 Critico | `CRM_v1.js:190`, `MailingManager.js:13` | gate admin interno o rinominare `_priv_` + esporre solo via doPost |
| S2 | `crm_recordEvent` / `crm_unsubscribe` **senza gate** → poisoning CRM, spam Telegram, disiscrizione di terzi | 🟥 Critico | `CRM_v1.js:104/216/245` | rendere interne (prefisso `_`) |
| S3 | **Open redirect + HTML injection** su `?utm_target` (anonimo, non rate-limited) | 🟥 Critico | `Privacy_v1.js:131/139` | validare `^https?://`, escape, no `javascript:` |
| S4 | Funzioni `roc_*` di outreach (invio email ai musei) **senza gate** | 🟧 Maggiore | `ROC_v1.js:407…` | `requireAuth(['admin'])` |
| S5 | Segreto HMAC fallback **hardcoded** `'sinopia2026'` | 🟧 Maggiore | `MailingManager.js:111` | verificare che `OC_UNSUB_SECRET` sia impostata in prod; togliere il default |
| S6 | **Formula injection**: scanner RSS scrive titoli/URL grezzi nei fogli; all'apertura del foglio una formula `=IMPORTXML()` ostile esegue | 🟧 Maggiore | `NewsScanner.js:188…` | applicare `_sanitizeForCell_()` a tutti i campi esterni |
| S7 | **XSS via schema URL** in `href`/`onclick` delle card (URL da RSS con apici/`javascript:`) | 🟧 Maggiore | `Index.html:3972…` | validare schema URL; per onclick usare `data-url`+delegation |
| S8 | Endpoint GET `confirmNl`/`utm`/`maint` **non** rate-limited; `_rateLimited_` è globale non per-IP | 🟨 Minore | `Codice.js` | estendere rate limit, chiave per-IP |
| S9 | `authenticate()` accetta **l'email come password** nel flusso doPost | 🟨 Minore | `Codice.js:1257` | usare solo magic-link/sessioni |

### ✅ Già corretto
Segreti in ScriptProperties (nessuna API key hardcoded) · token via `Utilities.getUuid()` (CSPRNG) · whitelist `?maint=` chiusa · `forgetMyData`/funzioni admin in Auth.js correttamente gated · ruolo da token custom (non da `Session.getActiveUser`).

---

## 3. PRONTEZZA PRODUZIONE (50 utenti / poche ore)

| # | Problema | Gravità | Fix |
|---|---|---|---|
| Pr1 | **Quota email**: se l'account deployer è Gmail consumer = **100 email/giorno**. ~3 email per utente (magic-link + report Matrix + notifica admin) × 50 ≈ **150 > 100** → blocco a metà pilota | 🟥 Critico | verificare tipo account (`MailApp.getRemainingDailyQuota()`); se consumer → spalmare i 50 inviti su 2 giorni e/o disattivare la notifica-email admin |
| Pr2 | **Magic-link senza guardia quota**: a quota esaurita l'utente si registra, legge "controlla l'email" ma **non riceve nulla** e resta chiuso fuori | 🟧 Alta | guardia `getRemainingDailyQuota()` + messaggio UI onesto |
| Pr3 | **Home vuota silenziosa**: se `getHomePayload` fallisce, l'utente vede la home senza contenuti, senza errore né retry | 🟧 Alta | banner "Impossibile caricare — Riprova" |
| Pr4 | Setup una-tantum da confermare | 🟨 | `setupKeepWarmTrigger()`, `setupMatrixSheets()`, `setupPubblicazioniSheet()` eseguiti; 3 ScriptProperties presenti |

### ✅ Già robusto
238 `withFailureHandler` su 238 chiamate · empty/error state in Matrix e Survey · boot-splash con doppio failsafe · keep-warm attivo · guardie quota nei digest/outreach · rate-limit su survey/reader/unsubscribe.

---

## 4. FRONT-END / GRAFICA (migliorie, non bloccanti)

| # | Miglioria | Impatto | Dove |
|---|---|---|---|
| F1 | **CTA nell'hero** ("Valuta il tuo museo → 10 min"): oggi l'azione primaria è nascosta nel carosello | Alto (conversione) | `HomeView.html:57` |
| F2 | **Dark-mode modali**: registrazione/newsletter/prenotazione/GDPR hanno `background:#fff` fisso → bianchi accecanti su tema scuro | Medio | `Index.html:128/171/212/11842` |
| F3 | **Topbar mobile affollata**: a 360px la ricerca si schiaccia; nasconderla sotto 640px | Medio | `Styles.html:528…` |
| F4 | **Cover podcast senza `onerror`**: immagine rotta = icona "broken" invece del placeholder | Medio (estetica) | `Index.html:4056` |
| F5 | **Versione incoerente**: sidebar mostra `v4.20` hardcoded vs v4.22.4 | Basso | `Sidebar.html:36` |
| F6 | Radar a 9 assi anche per sondaggi a 1 dimensione (può confondere) | Basso | `SurveyPublic.html:316` |

---

## 5. CODICE (fragilità strutturali)

- **`Codice.js` monolite** (100+ funzioni): manutenibilità; da spaccare progressivamente (già pianificato negli sprint).
- **Doppio deployment** attivo (`@HEAD` + produzione `@528/529`): attenzione a non confondere gli URL.
- **`ScriptApp.getService().getUrl()`** usato per il keep-warm e i magic-link: verificare che restituisca sempre l'URL `/exec` di produzione.

---

## 6. Piano proposto (ordine di lavorazione)

### FASE A — Bloccanti prima di pubblicare (obbligatori)
1. **P1** Pubblicare l'informativa privacy e renderla raggiungibile dai link esistenti.
2. **S1+S2** Mettere il gate (o rendere interne) le funzioni che espongono PII / abusabili — *anche requisito GDPR*.
3. **P2+P3** Completare `forgetMyData` su tutti i fogli + risolvere la promessa "cancellazione 30gg".
4. **P4** Dichiarare il trasferimento extra-UE + smettere di mandare email+nome a Telegram.
5. **Pr1+Pr2** Verificare la quota email e mettere la guardia sul magic-link (+ piano inviti in 2 ondate).
6. **S3** Verificare `OC_UNSUB_SECRET` in produzione.
7. **P5+P6** Consenso server-side con data/versione + link disiscrizione nella newsletter admin.

### FASE B — Robustezza & quick-win grafici (subito dopo / durante)
8. **Pr3** banner errore home · **F1** CTA hero · **F2** dark-mode modali · **F4** onerror cover · **F3** topbar mobile · **F5** versione dinamica.

### FASE C — Igiene sicurezza/codice (post-pilota o in parallelo)
9. **S6** sanitize formule nei fogli · **S7** schema URL nelle card · **S8/S9** rate-limit per-IP e deprecare email-as-token · **P8/P9** retention + registro trattamenti · spacchettare `Codice.js`.

---

*Le tre revisioni di dettaglio (con tutti i file:riga) sono disponibili su richiesta. Ogni punto va validato insieme prima di intervenire: alcune evidenze di sicurezza vanno confermate a video sul codice attuale.*
