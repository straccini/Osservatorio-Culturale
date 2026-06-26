# QA / Verifica compatibilità — Osservatorio Culturale

**Data:** 2026-06-26
**Baseline git:** `561bc2e3` (tag `baseline-2026-06-26`)
**Deploy GAS attivo:** `@670` — URL invariato (`AKfycbyUpp…/exec`)
**Branch:** `feat/fonti-feed-unificazione` (locale = remoto)

---

## Fase 1 — Snapshot & baseline
- Working tree **pulito**, locale allineato a `origin` su `561bc2e3`.
- Tag baseline creato: `baseline-2026-06-26`.
- Riconciliazione GAS↔locale: `@670` pushato dallo stato locale corrente (nessun editing parallelo in sospeso). `clasp status` ok.

## Fase 2 — Controllo multilivello (aree modificate oggi)
File toccati nei 5 commit di oggi (`44f39520…561bc2e3`):
`Addon_v42.js, Codice.js, Constants.js, DigestService.js, Editoriale_v1.js, Newsletter_v44.js, PubDiscovery_v1.js, SetupMaster.js, Index.html, Styles.html, HomeView.html, Sidebar.html` (+ landing-netlify, docs).

- **Sintassi/lint:** 8/8 file `.js` modificati → OK (`node --check`).
- **Inline JS Index.html:** 8 blocchi, 1 "errore" = falso positivo noto (blocco JSON-LD `application/ld+json`, non è JS).
- **Integrità riferimenti (catene critiche):**
  - Ambito: `_ambitoBandoV42_` (def + 2 usi: filtro+map) → `_classificaAmbitoV5_` (definito in `Bandi_v5.js`). OK.
  - Approfondimento: `editorialeSalvaRevisione` (def 1, call FE 1) → `_ed_uploadFoto_` (def 1, uso 1) → `getEditorialeCorrente` (ritorna `firma`+`foto`). OK.
  - Render email foto/firma: `DigestService.js` + `Newsletter_v44.js` aggiornati. OK.
  - API frontend `OC`: `_salvaRevisioneEditoriale`, `_editorialeFotoSelez`, `_editorialeRimuoviFoto` → 3/3 registrate.
  - Segnalazioni home: ID `homeSegnalazioniList/Empty/Section` unici dopo il consolidamento.

## Fase 3 — Collaudo profili/coorti/auth (harness deterministici)
- `test-fixes.js` → **PASS 157 / FAIL 0**
- `simula-profili.js` (registrazione + coorti A/B/C) → **PASS 22 / FAIL 0**
- `test-auth-flow.js` (login, magic-link, pending) → **PASS 12 / FAIL 0**

## Fase 4 — Fonti
- Aggiornamento fonti / scan vivo **non eseguibile da remoto** (`clasp run` non autorizzato in questo ambiente). Da verificare lato editor GAS o attendendo i trigger automatici (`scanSources` ogni 6h).

## Fase 5 — Stress test & riparazione
- Nessuna anomalia rilevata dai controlli statici e dagli harness → **nessuna correzione necessaria**.

## Fase 6 — Chiusura
- Funzioni nuove di oggi (riepilogo): KPI ambito verticali + bandi per ambito classificati al volo; approfondimento "Revisiona" con modifica testo/titolo + firma + foto (Drive) in cima a app+email; segnalazioni community compattate in fondo alla home; v5.2 (YouTube Data API v3 fallback, `scanPodcastDiretto`, rebrand title/sidebar).
- **Bug aperti:** nessuno emerso dalla verifica.
- **Da fare lato utente (non remotabili):**
  1. `setupMasterTriggers()` da editor GAS (scheduler digest Option B) — unico blocco lancio.
  2. Ripubblicare la landing su Netlify (asset SEO: sitemap/robots/og-cover).
  3. Test invio reale newsletter con foto approfondimento (verifica resa immagine Drive nei client email).
- **Invio mail di sintesi a s.straccini@gmail.com:** non inviata automaticamente (richiede conferma e non è triggerabile via `clasp run`). Questo documento è l'estratto pronto da inoltrare.

**Esito complessivo: ✅ compatibile — nessuna regressione rilevata.**
