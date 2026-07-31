# Deep Enrich Bandi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arricchire automaticamente i bandi privi di scadenza o descrizione visitando il link originale, estraendo il contenuto della pagina, e usando Claude per estrarre dati strutturati.

**Architecture:** Nuova funzione `enrichBandiDeep` in BandiCRUD.js che: (1) seleziona bandi incompleti (priorità: senza scadenza > senza descrizione), (2) fa UrlFetchApp sulla URL del bando, (3) estrae il testo utile dall'HTML, (4) invia a Claude Haiku per estrazione strutturata di scadenza+descrizione+importo, (5) aggiorna il foglio. Schedulato come trigger notturno in CronDispatcher.js (ore 01:00 e 04:00, 15 bandi/run). Tool admin per lancio manuale + dry-run.

**Tech Stack:** Google Apps Script, UrlFetchApp, Claude Haiku API, Bandi_v5 sheet (COL_B schema)

---

### Task 1: Funzione deep-enrich in BandiCRUD.js

**Files:**
- Modify: `BandiCRUD.js` (append dopo `enrichBandiRadarBatch`, riga ~284)

- [ ] **Step 1: Scrivere `_enrichExtractText_` — parser HTML→testo**

Helper che prende HTML grezzo e ritorna testo pulito (max 3000 char) utile per Claude:
- Rimuove script, style, nav, footer, header
- Estrae il body principale
- Collassa whitespace

- [ ] **Step 2: Scrivere `_enrichFetchPage_` — fetch con fallback**

Wrapper UrlFetchApp con:
- Timeout 15s, muteHttpExceptions
- User-Agent browser-like (i siti bloccano bot)
- Gestione redirect, 403, 404 → ritorna null
- Supporto speciale TED: se URL contiene ted.europa.eu, usa API notices

- [ ] **Step 3: Scrivere `enrichBandiDeep` — funzione principale**

Logica:
1. Legge Bandi_v5, seleziona candidati: `STATO_RECORD != archiviato` AND (`SCADENZA vuota` OR `SOMMARIO vuoto`) AND `URL_BANDO presente`
2. Ordina: prima senza scadenza (più critico), poi senza descrizione
3. Per ogni candidato (cap 15): fetch URL → extract text → Claude prompt
4. Claude ritorna JSON: `{scadenza, descrizione, importo, tipo_appalto}`
5. Aggiorna solo campi vuoti nel foglio (mai sovrascrivere)
6. Report: `{ok, arricchiti, errori, scadenzeTrovate, descrizioniTrovate, totCandidati}`

- [ ] **Step 4: Scrivere `enrichBandiDeepBatch` — wrapper per cron**

Thin wrapper che chiama `enrichBandiDeep({cap:15})` e logga il risultato.

- [ ] **Step 5: Syntax check**

Run: `node --check BandiCRUD.js`

- [ ] **Step 6: Commit**

```
git add BandiCRUD.js
git commit -m "feat(enrich): deep enrichment — fetch URL + Claude extraction per scadenza/descrizione/importo"
```

### Task 2: Trigger notturni in CronDispatcher.js

**Files:**
- Modify: `CronDispatcher.js` (aggiungere 2 entry a OC_CRON_EXTRA)

- [ ] **Step 1: Aggiungere trigger ore 01:00 e 04:00**

Due run notturni: 01:00 e 04:00, 15 bandi ciascuno = 30 bandi/notte.
Si aggiungono al trigger 03:00 esistente (enrichment "leggero") = 80 bandi/notte totali.

- [ ] **Step 2: Syntax check + commit**

### Task 3: Bottone admin + dry-run

**Files:**
- Modify: `AdminTools.js` (aggiungere 2 case alla whitelist)
- Modify: `Index.html` (aggiungere bottoni nel pannello admin)

- [ ] **Step 1: Aggiungere `enrichDeepDry` e `enrichDeepApply` alla whitelist**
- [ ] **Step 2: Aggiungere bottoni UI nel pannello admin (sezione Arricchimento)**
- [ ] **Step 3: Syntax check + commit**

### Task 4: Version bump + deploy + test

- [ ] **Step 1: Bump OC_VERSION a v4.27.58**
- [ ] **Step 2: clasp push + version + deploy**
- [ ] **Step 3: Test dry-run dalla webapp**
- [ ] **Step 4: Commit finale**
