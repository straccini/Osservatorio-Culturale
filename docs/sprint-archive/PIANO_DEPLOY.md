# Piano Deploy v4.7.0 — Sprint 1.1

**Data preparazione**: 2026-04-29
**Autore modifiche**: Claude (in autonomia, sotto mandato Silvano)
**Versione target**: v4.7.0
**Tipo deploy**: aggiornamento incrementale (no breaking changes)

---

## A. Sintesi modifiche eseguite

Sprint 1.1 di pulizia eseguito completamente in modalità non distruttiva: tutti gli interventi sono **additivi** (nuove funzioni/file) o **backward-compatible** (alias, classi CSS condizionali). Nessun comportamento esistente è stato rimosso.

| ID | Intervento | Beneficio | File toccati |
|---|---|---|---|
| INT-1 | Pillola "Aggiornato il [ora] · N nuovi oggi" sotto hero in home | Chiarezza freschezza dati | `Addon_v42.js`, `HomeView.html`, `Stiles.html`, `Navigation.html` |
| INT-4 | Single source of truth per ambiti, versione, soglie | Modificare un ambito = 1 file invece di 4 | NUOVO `Constants.js` |
| INT-5 | Search topbar nascosta in home (resta solo hero search) | Niente più doppia barra di ricerca | `Stiles.html`, `Navigation.html` |
| INT-6 | Workflow unificato `markRead/toggleSaved/archive/restore` | Da 9 funzioni di archiviazione a 4 azioni utente + 2 trigger | NUOVO `Workflow_unified.js` |
| INT-7 | Alias `sendBandiAlert` → `bandiEvery3Days` | Naming chiaro per il futuro | `Sprint0_Module.js` |
| INT-doc | Documentazione codebase + piano deploy | Memoria operativa scritta | NUOVO `CLAUDE.md`, NUOVO `PIANO_DEPLOY.md` |

---

## B. File modificati / aggiunti — elenco completo

### File NUOVI (da pushare)
1. `Constants.js` — costanti centralizzate
2. `Workflow_unified.js` — API unificata workflow record
3. `CLAUDE.md` — documentazione (non viene pushato in GAS, resta locale)
4. `PIANO_DEPLOY.md` — questo file (non viene pushato in GAS, resta locale)

### File MODIFICATI (da pushare)
5. `Addon_v42.js` — aggiunto `ultimaScansione` e `nuoviOggi` al payload `getHomepageDataV42()`
6. `HomeView.html` — aggiunto elemento `#homeUpdateInfo` sotto hero
7. `Stiles.html` — aggiunto CSS `.hero-update-pill` + `body.is-home-page .topbar-search { display:none }`
8. `Navigation.html` — aggiunto `renderUpdateInfo(d)` + toggle classe `is-home-page` sul body
9. `Sprint0_Module.js` — aggiunto alias `sendBandiAlert()`

### File NON modificati (resta tutto come prima)
- `Codice.js` — nessuna modifica
- `Index.html`, `Topbar.html`, `Sidebar.html`, `Digestreader.html` — nessuna modifica
- `CurrentUser_v44.js`, `Admin_v44.js`, `Newsletter_v44.js`, `Telegram_v44.js`, `Server_v44_doGet_patch.js`, `Scannerbandi.js`, `UltimiBandi.js`, `appsscript.json` — nessuna modifica

---

## C. Procedura di deploy — step-by-step

### Step 1 — Backup di sicurezza locale (1 minuto)

Prima di qualsiasi `clasp push`, fai una copia di backup della cartella locale.

Da PowerShell (sostituisci la data se serve):
```powershell
cd C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI
xcopy "musemu matrix\oc-codebase" "oc-codebase-backup-2026-04-29" /E /I /H
```

### Step 2 — Verifica stato locale vs remoto (30 secondi)

```powershell
cd "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\Osservatorio Culturale - codice"
clasp pull
```

⚠️ Se `clasp pull` segnala modifiche in arrivo dal remoto (file modificati nel web editor da quando hai fatto clone), **fermati e dimmelo**: vanno integrate prima di sovrascrivere.

Se `clasp pull` non segnala nulla → procedi al passo successivo.

### Step 3 — Copia delle modifiche dalla cartella di lavoro alla cartella clasp (1 minuto)

Le modifiche sono state fatte in `musemu matrix/oc-codebase/`. Vanno copiate in `Osservatorio Culturale - codice/` (la cartella che `clasp` usa per il push).

Da PowerShell:
```powershell
xcopy "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\musemu matrix\oc-codebase\*.js" "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\Osservatorio Culturale - codice\" /Y
xcopy "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\musemu matrix\oc-codebase\*.html" "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\Osservatorio Culturale - codice\" /Y
```

I file `CLAUDE.md` e `PIANO_DEPLOY.md` restano nella cartella di lavoro `musemu matrix/` — sono per il tuo uso, non vanno in GAS.

### Step 4 — Push verso GAS (1 minuto)

```powershell
cd "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\Osservatorio Culturale - codice"
clasp push
```

Output atteso:
```
└─ Constants.js
└─ Workflow_unified.js
└─ Addon_v42.js
└─ HomeView.html
└─ Stiles.html
└─ Navigation.html
└─ Sprint0_Module.js
Pushed 7 files.
```

⚠️ Se errore "User has not enabled Apps Script API" → ripeti `clasp login` o vai su https://script.google.com/home/usersettings

### Step 5 — Verifica nel web editor GAS (2 minuti)

```powershell
clasp open
```

Apre l'editor web. Controlli a vista:
- [ ] Nuovo file `Constants` presente nella sidebar file
- [ ] Nuovo file `Workflow_unified` presente
- [ ] `Addon_v42` modificato (cerca commento `// --- INT-1 (Sprint 1.1)`)
- [ ] `Sprint0_Module` modificato (cerca `function sendBandiAlert`)

### Step 6 — Test funzionali nel web editor (5 minuti)

Esegui queste 3 funzioni dal dropdown "Esegui" del web editor (NON ancora il deploy in produzione):

**Test 1**: `getOcConstants` (Constants.js)
- Risposta attesa: oggetto JSON con `ambiti` (array 5 elementi), `version`, `soglie`
- Se ok → INT-4 funziona

**Test 2**: `getHomepageDataV42` (Addon_v42.js)
- Risposta attesa: oggetto con `ultimaScansione` (stringa o null) e `nuoviOggi` (oggetto con totale/news/bandi/podcast)
- Se ok → INT-1 backend funziona

**Test 3**: `sendBandiAlert` (Sprint0_Module.js)
- Risposta attesa: stesso comportamento di `bandiEvery3Days` (può inviare un Telegram se ci sono bandi nuovi nelle ultime 72h, oppure SKIP)
- Se ok → INT-7 funziona

Se tutti e 3 i test passano → procedi con il deploy.

### Step 7 — Deploy in produzione (3 minuti)

Procedura matita+nuova versione (la stessa che già conosci dalla v4.6.0):

1. **Distribuisci → Gestisci distribuzioni**
2. Sulla distribuzione attiva → **icona MATITA ✏️**
3. Versione → **"Nuova versione"**
4. Descrizione: `v4.7.0 — Sprint 1.1: pillola freschezza dati, costanti centralizzate, workflow archiviazione unificato, search topbar nascosta in home`
5. NON toccare "Eseguito come" e "Chi può accedere"
6. **Distribuisci**
7. Verifica URL invariato (`AKfycbzpfA...UPEtfHD...`)

### Step 8 — Verifica live in produzione (2 minuti)

Apri **finestra incognito** del browser → vai su URL produzione → loggati.

Verifiche visive:
- [ ] In home, sotto il titolo hero, compare la pillola **"Aggiornato alle [ora] · N nuovi oggi"** con pallino verde lampeggiante
- [ ] In home, la barra ricerca della topbar è **nascosta** (solo barra hero visibile)
- [ ] Cliccando su "Radar Bandi" nella sidebar → la barra ricerca topbar **ricompare**
- [ ] Tornando in home → la barra topbar **scompare** di nuovo
- [ ] Tutto il resto funziona come prima (ambiti, news, bandi, podcast)

### Step 9 — Aggiornamento etichetta versione (opzionale, 30 secondi)

In `Sidebar.html` riga 23 c'è ancora il testo "Culturale · v4.2". Per aggiornarlo a v4.7.0:
- Modifica `Sidebar.html` riga 23: `<span>Culturale · v4.7</span>`
- `clasp push` → ridistribuisci con stessa procedura matita+nuova versione

(Lo lascio come opzionale perché è solo cosmetica e ti chiede una distribuzione in più.)

---

## D. Cosa fare se qualcosa va storto

### Caso A — Errore in produzione, niente funziona
**Rollback in 30 secondi**:
1. Distribuisci → Gestisci distribuzioni → matita
2. Versione → seleziona la versione precedente (v4.6.0)
3. Distribuisci

URL torna a v4.6.0 in <1 minuto, gli utenti non si accorgono di nulla.

### Caso B — Pillola non compare
- Apri DevTools del browser (F12) → Console
- Cerca errori JavaScript
- Verifica nella tab Network che `getHomepageDataV42` restituisca `ultimaScansione` e `nuoviOggi`
- Se manca: il push non è andato bene per `Addon_v42.js` → ripeti `clasp push` solo per quel file

### Caso C — Topbar search visibile anche in home
- Verifica nel DOM (DevTools) che `<body>` abbia classe `is-home-page`
- Se manca → l'evento di Navigation.html non scatta → controlla console errori

### Caso D — Funzione test fallisce nell'editor
- Probabilmente `clasp push` non ha caricato tutto. Riesegui `clasp push --force`
- Se persiste, dimmi l'errore esatto

---

## E. Decisioni RIMANDATE — richiedono il tuo OK esplicito

Questi interventi del Sprint 1.1 li ho **non eseguiti** perché toccano comportamenti consolidati o eliminano funzioni potenzialmente ancora usate. Decidi tu se procedere.

### Decisione 1 — INT-2: rimozione `getHomepageData()` legacy
- **File**: `Codice.js` riga 801
- **Diagnosi**: codice morto, il frontend usa solo `getHomepageDataV42()`
- **Azione proposta**: cancellare (o marcare con `// @deprecated NEVER CALLED — rimuovere in Sprint 2`)
- **Rischio**: se da qualche parte (script trigger? esecuzione manuale?) qualcuno chiama questa funzione, smette di funzionare
- **Mio consiglio**: marcala come deprecata in v4.7.0, eliminala in v4.8.0 dopo aver verificato per 1 mese che nessuno la chiama

### Decisione 2 — INT-3: cosa fare di `getUltimiBandiMonitorati()`
- **File**: `UltimiBandi.js` riga 16
- **Diagnosi**: funzione che restituisce ultimi N bandi monitorati in home, ma non c'è un container UI nella `HomeView.html` per mostrarla → al momento è funzione "morta"
- **Tre opzioni**:
  - **A**: aggiungere una sezione "Ultimi bandi monitorati" in home tra "Bandi 7gg" e "Esplora ambiti" (più contenuto, può essere utile)
  - **B**: rimuovere la funzione (meno codice, meno confusione)
  - **C**: lasciarla per uso futuro (status quo, senza azione)
- **Mio consiglio**: **A** se la home ha spazio (ma rischia overload di sezioni); altrimenti **B** per pulizia

### Decisione 3 — INT-8: flusso "approvazione newsletter via Telegram"
- **File**: `Server_v44_doGet_patch.js` + funzioni `_renderApproveNewsletterPage_`, `_executeApproveNewsletter_`, `adminConfirmSendWithToken` (in Newsletter_v44.js)
- **Diagnosi**: flusso che apre una pagina di conferma quando l'admin clicca un link Telegram per autorizzare l'invio di una newsletter. Sembra un esperimento mai pienamente integrato (il commento del file dice "Non sostituisce doGet() esistente: aggiunge una funzione...")
- **Tre opzioni**:
  - **A**: tenere e integrare formalmente nel `doGet()` di Codice.js
  - **B**: rimuovere se non serve più
  - **C**: lasciare come "sleeping code" — ne riparliamo
- **Mio consiglio**: dimmi se hai mai usato questo flusso. Se sì → **A**. Se no o non lo ricordi → **B**.

### Decisione 4 — Cosa fare di `Addon_v42.js` come nome
- Il file v44 usa `Addon_v42.js` come nome ma contiene la versione v42. Significa che dopo il refactoring v44 questo file è rimasto legacy ma ancora usato (chiama funzioni come `getHomepageDataV42` che il frontend invoca).
- **Opzione**: rinominare in `Endpoints_v42.js` (più descrittivo) o `HomeEndpoints.js` (drop versione, è semplicemente "endpoint home").
- **Rischio**: se qualcosa fa riferimento al nome del file (improbabile in GAS, ma possibile), si rompe.
- **Mio consiglio**: lascia così per Sprint 1.1, lo affrontiamo nello Sprint 3 di cleanup naming.

---

## F. Cosa farò io nel prossimo step (se confermi)

Dopo che hai fatto il deploy v4.7.0 e verificato che tutto funziona:

1. **Sprint 1.2**: torno sulle decisioni rimandate (1, 2, 3, 4) sopra in base alle tue risposte
2. **Sprint 2**: comincio a spaccare il monolite `Codice.js` in moduli per dominio (Items.js, Bandi.js, ...)
3. **Sprint 3**: cleanup naming, rinomina file, integrazione patch routing
4. **Sprint 4**: aggiunta del modulo MuseMu Matrix dentro l'OC

Per ora, le tue azioni sono:
- [ ] Backup locale (Step 1)
- [ ] `clasp pull` per verifica (Step 2)
- [ ] Copia file (Step 3)
- [ ] `clasp push` (Step 4)
- [ ] Verifica web editor (Step 5-6)
- [ ] Deploy procedura matita (Step 7)
- [ ] Verifica produzione (Step 8)
- [ ] Conferma esito + decisioni rimandate (Sezione E)

---

*Documento prodotto in autonomia da Claude su mandato di Silvano · 2026-04-29*
