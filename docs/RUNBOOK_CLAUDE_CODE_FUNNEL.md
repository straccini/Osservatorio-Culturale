# Runbook Claude Code — Fase 1: Strumentazione Funnel

**A cosa serve:** eseguire il piano [`docs/superpowers/plans/2026-06-06-funnel-strumentazione.md`](superpowers/plans/2026-06-06-funnel-strumentazione.md) **con Claude Code**, un passo alla volta, in modo sicuro e **senza stravolgere il funzionamento dell'app**.

**Come si usa:** apri Claude Code nella cartella del progetto. Incolla prima il **blocco Regole** (una volta a sessione), poi i **prompt** uno alla volta, in ordine. Dopo ogni prompt che produce codice, esegui i **passi manuali 👤** (Claude Code non può toccare Google) e procedi solo se la verifica è verde.

---

## 0) Blocco Regole — incollalo all'inizio di ogni sessione Claude Code

```
REGOLE PERMANENTI per questo lavoro (non derogabili):
1. Lavora SOLO sul branch feat/fonti-feed-unificazione. Non fare merge su master.
2. Modifiche SOLO additive. Le uniche modifiche a codice esistente ammesse sono:
   (a) una CTA aggiuntiva nel corpo email di ROC (non rimuovere testo esistente);
   (b) un 3° parametro OPZIONALE a createSessione (retrocompatibile).
   Tutto il resto è file nuovo (Funnel_v1.js), colonna nuova (AcquisitionSource), tab nuova.
3. NON toccare la logica del login magic-link / sicurezza v4.21.2, se non per aggiungere
   il parametro opzionale di provenienza. Quell'area è gestita da un'altra sessione.
4. Dopo OGNI task: niente commit finché il dry-run non passa. Un task = un commit.
5. NON eseguire "clasp push" né alcun deploy. Sono manuali e li faccio io.
6. Se un nome-colonna non combacia, correggi il NOME nel codice, non la logica.
7. Rete di sicurezza: tag git checkpoint-2026-06-06 + cartella di backup. In caso di errore,
   fermati e segnalalo: non tentare riparazioni rischiose.
Conferma di aver letto queste regole prima di iniziare.
```

---

## 1) Sequenza operativa

> Legenda: **▶ Claude Code** = prompt da incollare · **👤 TU** = passo manuale su Google (clasp/editor GAS).

### Blocco A — Senza conflitti (Funnel_v1.js, Constants, ROC)

**Task 0 — Verifica punti aperti**
```
▶ Claude Code:
Leggi docs/superpowers/plans/2026-06-06-funnel-strumentazione.md ed esegui SOLO il Task 0.
Cerca: dove persiste oggi il profilo L2 (foglio + colonna completezza); se le chiavi opt-in
del CRM combaciano con quelle inviate da Matrix; gli header reali dei fogli ROC_Outreach,
Utenti, ProfiliPro, ResponsesMatrix, CRM_Leads, RichiestePrenotazione.
Scrivi gli esiti nella sezione "Esiti Task 0" del piano. NON modificare codice. NON committare.
```

**Task 1 — Costanti**
```
▶ Claude Code:
Esegui il Task 1 del piano: aggiungi a Constants.js le costanti OC_FUNNEL_SOGLIA_MIN,
OC_FUNNEL_SHEETS, OC_ACQ_SEP esattamente come da piano. Crea anche la funzione _test_costantiFunnel_.
Poi fermati: dimmi che è pronto per il push.
```
```
👤 TU: clasp push → editor GAS → esegui _test_costantiFunnel_ → conferma log "TUTTI OK".
```
```
▶ Claude Code:
Il dry-run è verde. Esegui lo Step di commit del Task 1.
```

**Task 2 — Strato puro (TDD)**
```
▶ Claude Code:
Esegui il Task 2 del piano: crea Funnel_v1.js con _assert_, _funnelRate_, OC_FUNNEL_STADI,
la firma vuota di _funnelComputeFromCounts_ e il test _test_funnelCompute_. Mostrami il file.
NON committare ancora.
```
```
👤 TU: clasp push → esegui _test_funnelCompute_ → DEVE fallire (funzione non implementata).
```
```
▶ Claude Code:
Confermato il fallimento. Ora implementa _funnelComputeFromCounts_ come da piano.
```
```
👤 TU: clasp push → esegui _test_funnelCompute_ → DEVE dare "TUTTI OK".
```
```
▶ Claude Code:
Verde. Esegui lo Step di commit del Task 2.
```

**Task 3 — Strato lettura**
```
▶ Claude Code:
Esegui il Task 3: aggiungi a Funnel_v1.js _funnelCountSheet_, _funnelColIdx_, _funnelFetchCounts_
e _test_funnelFetch_, usando i nomi-colonna confermati nel Task 0. Mostrami le funzioni. NON committare.
```
```
👤 TU: clasp push → esegui _test_funnelFetch_ → atteso JSON con 7 numeri + "TUTTI OK".
   Se dà "header not found", dimmi quale: Claude Code correggerà solo il nome.
```
```
▶ Claude Code:
Verde. Esegui lo Step di commit del Task 3.
```

**Task 4 — API pubblica**
```
▶ Claude Code:
Esegui il Task 4: aggiungi getFunnelCompleto(opts) con gating admin e finestra default 90gg,
più _test_getFunnelCompleto_. NON committare.
```
```
👤 TU: clasp push → esegui _test_getFunnelCompleto_ da account admin → atteso ok:true, 7 stadi, "TUTTI OK".
```
```
▶ Claude Code:
Verde. Esegui lo Step di commit del Task 4.
```

**Task 5 — Link tracciato nel cold mail**
```
▶ Claude Code:
Esegui il Task 5: in ROC_v1.js aggiungi _roc_buildRegLink_ e inserisci la CTA tracciata nel
corpo email di roc_buildEmailBatch SENZA rimuovere il testo esistente. Aggiungi _test_rocRegLink_.
NON committare.
```
```
👤 TU: clasp push → esegui _test_rocRegLink_ → atteso URL con src=museo__bando + "TUTTI OK".
```
```
▶ Claude Code:
Verde. Esegui lo Step di commit del Task 5.
```

### Blocco B — Su base login già committata (registrazione, Index.html)

> Procedi qui solo dopo che lo stato git è pulito (il lavoro v4.21.2 è già committato).

**Task 6 — Cattura provenienza alla registrazione**
```
▶ Claude Code:
Esegui il Task 6 del piano. PRIMA leggi il codice attuale di createSessione in Sessioni_v1.js e
la chiamata di registrazione in Index.html (potrebbero essere cambiati con v4.21.2). POI applica:
_ensureAcquisitionColumn_, il 3° parametro opzionale acquisitionSource in createSessione, la lettura
di "src" al landing e il passaggio nella chiamata di registrazione. Aggiungi _test_acquisitionCapture_.
Mantieni la retrocompatibilità. NON committare.
```
```
👤 TU: clasp push → esegui _test_acquisitionCapture_ → atteso "provenienza salvata: MUSX__BANDOY".
   Poi cancella la riga di test dal foglio Utenti. Poi prova in incognito l'URL
   {APP_URL}?reg=1&src=MUSX__BANDOY e verifica che AcquisitionSource si popoli.
```
```
▶ Claude Code:
Verde (e provato in incognito). Esegui lo Step di commit del Task 6.
```

**Task 7 — Cruscotto admin "Funnel"**
```
▶ Claude Code:
Esegui il Task 7: aggiungi in Index.html la sezione #funnel-panel, OC.loadFunnel, OC._renderFunnel
e l'aggancio alla tab impostazioni seguendo il pattern delle tab esistenti; aggiungi gli stili .fn-*
in Styles.html. NON committare.
```
```
👤 TU: clasp push → deploy (procedura CLAUDE.md) → in incognito da admin apri Impostazioni → Funnel
   → verifica imbuto, percentuali, badge "campione insufficiente", riga conversione totale.
```
```
▶ Claude Code:
Verde. Esegui lo Step di commit del Task 7.
```

### Blocco C — Chiusura

**Task 8 — Dry-run integrato + documentazione**
```
▶ Claude Code:
Esegui il Task 8: aggiungi _seed_funnel_demo_ e _cleanup_funnel_demo_ in Funnel_v1.js; aggiorna
CLAUDE.md (funzione getFunnelCompleto + Funnel_v1.js nella mappa file). NON committare.
```
```
👤 TU: clasp push → esegui _seed_funnel_demo_ → _test_getFunnelCompleto_ (contattati≥1) → _cleanup_funnel_demo_.
```
```
▶ Claude Code:
Verde. Esegui il commit finale del Task 8.
```

---

## 2) Passi che restano SOLO a te (Claude Code non può)

- **`clasp push`** (carica il codice locale su GAS) — da terminale.
- **Eseguire le funzioni `_test_*_`** nell'editor GAS (Esegui → scegli la funzione → leggi il log).
- **Deploy** in produzione: Distribuisci → Gestisci distribuzioni → matita ✏️ → Nuova versione → Distribuisci (NON "+ Nuova distribuzione"). Procedura completa in `CLAUDE.md`.
- Verifiche **in finestra incognito** da account admin.

---

## 3) Se qualcosa va storto (rollback)

- Annullare l'ultimo commit mantenendo i file: `git reset --soft HEAD~1`
- Annullare un commit specifico creando l'inverso: `git revert <hash>`
- Tornare al punto sicuro pre-funnel: `git checkout checkpoint-2026-06-06` (sola lettura) oppure ripristina dalla cartella `oc-codebase-backup-2026-06-06-1458`.
- In ogni caso: **non fare push/deploy** di uno stato non verificato.

---

## 4) Dopo la Fase 1 — il filo conduttore: le FONTI

Questa Fase 1 misura il funnel. Il **vero motore di valore sono le fonti** (vedi `docs/MODELLO_OPERATIVO_SINOPIA_RICCARDO.md`). Il prossimo intervento — da analizzare a parte, con lo stesso metodo (spec → piano → runbook) — è la **regolazione delle fonti** (unificazione feed, qualità, copertura, tagging per dimensione Matrix): è ciò che alimenta l'interesse che porta alle consulenze gratuite.
