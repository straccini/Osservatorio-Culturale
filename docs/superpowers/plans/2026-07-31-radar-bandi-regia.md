# Radar Bandi — Regia fonti, ciclo di vita e integrità informativa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il Radar Bandi una fonte affidabile: archivio funzionante con purge automatica a 20 giorni, fonti governate per priorità (nazionali/UE/MEPA > regionali > GAL/fondazioni), scansioni monitorate per tier, e nessun bando esposto senza le informazioni minime.

**Architecture:** Tre livelli separati, ognuno con un unico punto di verità. (1) *Ciclo di vita*: ogni bando ha uno stato tracciato con data di archiviazione, l'archivio si legge da `Bandi_v5` (non più dal foglio legacy RADAR) e si svuota da solo a 20 giorni. (2) *Regia fonti*: la colonna `Priorita` già presente in `FontiBandi_v5` diventa operativa come **tier** (A/B/C) che governa soglie di qualità in ingresso, quote di scansione e ordinamento di esposizione. (3) *Osservabilità*: un unico KPI di salute per tier, esposto nel report giornaliero e in un endpoint diagnostico, che distingue "fonte silente" da "fonte rumorosa".

**Tech Stack:** Google Apps Script (V8), Google Sheets come storage, clasp per il deploy, Claude API (Haiku) per l'arricchimento. Nessuna libreria esterna.

---

## Contesto — diagnosi del 31/07/2026 (dati reali)

| Sintomo osservato | Causa accertata | Task |
|---|---|---|
| Archivio **sempre vuoto** | `getArchivedItems('bando')` legge `getSheetRadar()` (foglio legacy) mentre gli archiviati stanno in `Bandi_v5`. Stessa famiglia del bug archive/restore già corretto in v4.27.73 | 1 |
| Archiviati **mai cancellati** | `_purgeBandiArchiviatiVecchi_` usa la **Scadenza** come età: `if (!sd) continue` → i 274 archiviati "senza scadenza" non vengono mai eliminati. Soglia 90gg invece dei 20 richiesti | 2, 3 |
| **274 su 408** archiviati come "senza info base" | Le fonti GAL producono voci di menu ("Commercio e turismo", "La Strategia LEADER") con la stessa dignità dei bandi nazionali: nessuna differenziazione di soglia per tipo di fonte | 4, 5 |
| **Bandi: 0 nuovi in 7gg** (podcast/video idem) | Le scansioni girano (`fasRunCompleto` 05:15, `galRunOggi` 06:15) ma il prodotto è rumore che viene archiviato: il KPI "nuovi" non distingue *fonte ferma* da *fonte che produce scarti* | 6 |
| **36 su 105** senza link specifico | Bandi UE da fonti news (`non-url`) e bandi con link di sezione: l'enrichment profondo non li tratta come priorità | 7 |
| Mappa con poche bolle | Campo `Regione` non normalizzato | 8 |

**Vincolo assoluto (regola Silvano):** *meglio un bando in meno che uno scaduto o senza informazioni base*. Ogni scelta di soglia in questo piano rispetta questa priorità.

**Protocollo obbligatorio prima di ogni push:** anti-clobber (pull in dir temporanea + diff) come da `CLAUDE.md`.

---

## File Structure

**Creare:**
- `BandiCicloVita.js` — ciclo di vita del bando: archiviazione con data, lettura archivio da Bandi_v5, purge a 20 giorni. Responsabilità unica: *stato e tempo* del record.
- `FontiRegia.js` — regia fonti: assegnazione tier, soglie di qualità per tier, quote di scansione, KPI di salute per tier. Responsabilità unica: *governo delle fonti*.

**Modificare:**
- `Workflow_unified.js` — `getArchivedItems` per i bandi delegata a BandiCicloVita
- `Bandi_v5.js` — schema: nuova colonna `DataArchiviazione`; `_purgeBandiArchiviatiVecchi_` deprecata in favore della nuova
- `AgentSupervisore.js` — MA5 usa le nuove funzioni (archivia con data, purge 20gg)
- `BandiGate.js` — soglia di ingresso differenziata per tier della fonte
- `CronDispatcher.js` — job di regia fonti e KPI
- `ReportUnificato.js` — sezione "Salute fonti per tier" nel report giornaliero
- `Codice.js` — endpoint `?diag=bandi` esteso con ciclo di vita e tier
- `AdminTools.js` — strumenti manuali per i nuovi job

---

## Task 1 — Archivio bandi: leggere da Bandi_v5

**Files:**
- Create: `BandiCicloVita.js`
- Modify: `Workflow_unified.js` (funzione `getArchivedItems`, ramo `tipo === 'bando'`)

- [ ] **Step 1: Creare il modulo con la lettura archivio**

Creare `BandiCicloVita.js`:

```javascript
// ============================================================================
//  BandiCicloVita.js — Stato e tempo del bando: archivio, data archiviazione,
//  purge automatica. Fonte unica: Bandi_v5 (il foglio legacy RADAR non è più
//  la verità per i bandi dal v4.27.32).
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia · v4.27.74 (2026-07-31)
// ============================================================================

var BCV_PURGE_GIORNI = 20;   // richiesta Silvano 31/07: archiviati > 20gg → cancellati

/** @private Foglio Bandi_v5 o null. */
function _bcvSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var nome = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
  return ss.getSheetByName(nome);
}

/** @private Data robusta: Date | ISO | dd/MM/yyyy → Date o null. */
function _bcvData_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Bandi archiviati, dal più recente. Sostituisce la lettura dal foglio RADAR
 * legacy che rendeva l'Archivio sempre vuoto.
 * @param {number} [limit] default 200
 * @return {Array<Object>} [{id, titolo, ente, settore, scadenza, dataArch, tipo}]
 */
function bcvArchiviati(limit) {
  var n = Number(limit) || 200;
  var out = [];
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return out;
    var vals = sh.getDataRange().getValues();
    var iArch = _bcvColDataArch_(vals[0]);
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() !== 'archiviato') continue;
      var dArch = (iArch >= 0) ? _bcvData_(row[iArch]) : null;
      out.push({
        id: String(r),
        titolo: String(row[COL_B.TITOLO - 1] || ''),
        ente: String(row[COL_B.ENTE - 1] || ''),
        settore: String(row[COL_B.SETTORE - 1] || ''),
        scadenza: row[COL_B.SCADENZA - 1] || '',
        dataArch: dArch ? Utilities.formatDate(dArch, 'Europe/Rome', 'dd/MM/yyyy') : '',
        _ord: dArch ? dArch.getTime() : 0,
        tipo: 'bando'
      });
    }
    out.sort(function (a, b) { return b._ord - a._ord; });
    if (out.length > n) out = out.slice(0, n);
  } catch (e) { Logger.log('[bcvArchiviati] ' + e.message); }
  return out;
}

/** @private Indice colonna DataArchiviazione (-1 se assente). */
function _bcvColDataArch_(head) {
  for (var i = 0; i < head.length; i++) {
    if (String(head[i] || '').trim() === 'DataArchiviazione') return i;
  }
  return -1;
}
```

- [ ] **Step 2: Collegare Workflow_unified**

In `Workflow_unified.js`, dentro `getArchivedItems`, sostituire il ramo bando. Cercare:

```javascript
    if (tipo === 'bando') {
      var shb = getSheetRadar();
```

Sostituire l'intero blocco `if (tipo === 'bando') { ... }` con:

```javascript
    if (tipo === 'bando') {
      // v4.27.74 — l'archivio bandi vive in Bandi_v5, non nel foglio RADAR
      // legacy: leggerlo da lì rendeva l'Archivio sempre vuoto.
      return (typeof bcvArchiviati === 'function') ? bcvArchiviati(limit) : [];
    }
```

- [ ] **Step 3: Verifica sintassi**

Run: `node --check BandiCicloVita.js && node --check Workflow_unified.js`
Expected: nessun output (exit 0)

- [ ] **Step 4: Commit**

```bash
git add BandiCicloVita.js Workflow_unified.js
git commit -m "fix(archivio): i bandi archiviati si leggono da Bandi_v5 (archivio era sempre vuoto)"
```

---

## Task 2 — Colonna DataArchiviazione e archiviazione tracciata

**Files:**
- Modify: `Bandi_v5.js` (`COL_B_HEADERS`)
- Modify: `BandiCicloVita.js` (aggiunta funzioni)
- Modify: `Workflow_unified.js` (`_wfArchiviaBandoV5_` scrive la data)

- [ ] **Step 1: Aggiungere la colonna allo schema**

In `Bandi_v5.js`, in `COL_B_HEADERS`, aggiungere `'DataArchiviazione'` come **ultimo** elemento (dopo `'Note'`), e nel blocco `COL_B` aggiungere:

```javascript
  NOTE:               27,
  DATA_ARCHIVIAZIONE: 28
```

- [ ] **Step 2: Funzione di garanzia colonna + archiviazione tracciata**

Aggiungere in `BandiCicloVita.js`:

```javascript
/**
 * Garantisce la presenza della colonna DataArchiviazione. Idempotente.
 * @return {number} indice 0-based della colonna
 */
function bcvEnsureColonnaDataArch() {
  var sh = _bcvSheet_();
  if (!sh) return -1;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = _bcvColDataArch_(head);
  if (i >= 0) return i;
  var col = sh.getLastColumn() + 1;
  sh.getRange(1, col).setValue('DataArchiviazione').setFontWeight('bold');
  Logger.log('[bcv] colonna DataArchiviazione creata (col ' + col + ')');
  return col - 1;
}

/**
 * Archivia (o riattiva) una riga di Bandi_v5 tracciando QUANDO.
 * @param {number} riga 1-based, come l'id servito al frontend
 * @param {string} stato 'archiviato' | 'attivo'
 */
function bcvSetStato(riga, stato) {
  try {
    if (!riga || riga < 2) return { ok: false, error: 'riga non valida: ' + riga };
    var sh = _bcvSheet_();
    if (!sh) return { ok: false, error: 'foglio Bandi_v5 assente' };
    if (riga > sh.getLastRow()) return { ok: false, error: 'riga fuori range' };
    sh.getRange(riga, COL_B.STATO_RECORD).setValue(stato);
    var iArch = bcvEnsureColonnaDataArch();
    if (iArch >= 0) sh.getRange(riga, iArch + 1).setValue(stato === 'archiviato' ? new Date() : '');
    return { ok: true, riga: riga, stato: stato };
  } catch (e) { return { ok: false, error: e.message }; }
}
```

- [ ] **Step 3: Far usare la nuova funzione a Workflow_unified**

In `Workflow_unified.js`, dentro `_wfArchiviaBandoV5_`, sostituire il corpo dopo i controlli con la delega:

```javascript
function _wfArchiviaBandoV5_(riga, stato) {
  // v4.27.74 — delega a BandiCicloVita, che traccia anche DataArchiviazione
  if (typeof bcvSetStato === 'function') return bcvSetStato(riga, stato);
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh) return { ok:false, error:'foglio Bandi_v5 assente' };
    var col = (typeof COL_B !== 'undefined' && COL_B.STATO_RECORD) ? COL_B.STATO_RECORD : 24;
    sh.getRange(riga, col).setValue(stato);
    return { ok:true, riga: riga, stato: stato };
  } catch (e) { return { ok:false, error:e.message }; }
}
```

- [ ] **Step 4: Verifica sintassi e commit**

```bash
node --check Bandi_v5.js && node --check BandiCicloVita.js && node --check Workflow_unified.js
git add Bandi_v5.js BandiCicloVita.js Workflow_unified.js
git commit -m "feat(archivio): colonna DataArchiviazione + archiviazione tracciata"
```

---

## Task 3 — Purge automatica a 20 giorni (che funziona anche senza scadenza)

**Files:**
- Modify: `BandiCicloVita.js`
- Modify: `AgentSupervisore.js` (blocco MA5)
- Modify: `AdminTools.js`

- [ ] **Step 1: Scrivere la purge corretta**

Aggiungere in `BandiCicloVita.js`:

```javascript
/**
 * Cancella definitivamente i bandi archiviati da più di N giorni.
 * FIX rispetto a _purgeBandiArchiviatiVecchi_: l'età si misura sulla
 * DataArchiviazione (fallback DataRilevamento), NON sulla scadenza — i 274
 * archiviati "senza scadenza" del 31/07 non venivano mai eliminati.
 * @param {Object} [opts] { giorni: 20, dryRun: false }
 */
function bcvPurgeArchiviati(opts) {
  opts = opts || {};
  var gg = (opts.giorni != null) ? Number(opts.giorni) : BCV_PURGE_GIORNI;
  var dryRun = !!opts.dryRun;
  var rep = { ok: true, giorni: gg, dryRun: dryRun, esaminati: 0, cancellati: 0, senzaData: 0, esempi: [] };
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    var iArch = _bcvColDataArch_(vals[0]);
    var soglia = Date.now() - gg * 86400000;
    for (var r = vals.length - 1; r >= 1; r--) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() !== 'archiviato') continue;
      rep.esaminati++;
      var d = (iArch >= 0) ? _bcvData_(row[iArch]) : null;
      if (!d) d = _bcvData_(row[COL_B.DATA_RILEVAMENTO - 1]);   // fallback: record archiviati prima della colonna
      if (!d) { rep.senzaData++; continue; }
      if (d.getTime() >= soglia) continue;
      if (rep.esempi.length < 10) rep.esempi.push(String(row[COL_B.TITOLO - 1] || '').substring(0, 60));
      if (!dryRun) sh.deleteRow(r + 1);
      rep.cancellati++;
    }
    Logger.log('[bcvPurge] ' + rep.cancellati + '/' + rep.esaminati + ' cancellati (>' + gg + 'gg)' + (dryRun ? ' [DRY]' : ''));
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  return rep;
}
```

- [ ] **Step 2: Sostituire la chiamata nel supervisore**

In `AgentSupervisore.js`, nel blocco MA5, sostituire:

```javascript
    if (typeof _purgeBandiArchiviatiVecchi_ === 'function') {
      var purge = _purgeBandiArchiviatiVecchi_(90);
      if (purge && purge.cancellati > 0) report.azioni.push('MA5: cancellati ' + purge.cancellati + ' bandi archiviati >90gg');
    }
```

con:

```javascript
    // v4.27.74 — purge a 20gg misurata sulla DataArchiviazione (la vecchia
    // usava la scadenza e non toccava mai gli archiviati senza data)
    if (typeof bcvPurgeArchiviati === 'function') {
      var purge = bcvPurgeArchiviati({ giorni: BCV_PURGE_GIORNI });
      if (purge && purge.cancellati > 0) report.azioni.push('MA5: cancellati ' + purge.cancellati + ' bandi archiviati >' + BCV_PURGE_GIORNI + 'gg');
    }
```

- [ ] **Step 3: Strumenti admin**

In `AdminTools.js`, nello switch, dopo `case 'validaBandiApply':` aggiungere:

```javascript
      case 'purgeArchivioDry':   r = bcvPurgeArchiviati({ dryRun: true }); break;
      case 'purgeArchivioApply': r = bcvPurgeArchiviati({}); break;
      case 'archivioBandi':      r = { totale: bcvArchiviati(500).length, primi: bcvArchiviati(10) }; break;
```

- [ ] **Step 4: Verifica e commit**

```bash
node --check BandiCicloVita.js && node --check AgentSupervisore.js && node --check AdminTools.js
git add BandiCicloVita.js AgentSupervisore.js AdminTools.js
git commit -m "feat(archivio): purge automatica a 20gg su DataArchiviazione + tool admin"
```

---

## Task 4 — Regia fonti: tier di priorità

**Files:**
- Create: `FontiRegia.js`
- Modify: `AdminTools.js`

**Modello di tiering (decisione di progetto):**

| Tier | Chi | Soglia di ingresso | Quota scansione | Ordinamento a parità |
|---|---|---|---|---|
| **A** | TED, EU Funding&Tenders, Creative Europe, MiC, ANAC/BDNCP, MEPA/Consip, Ministeri | Permissiva: basta titolo+link (questi enti pubblicano bandi veri) | Ogni scansione | Primo |
| **B** | Regioni, Città metropolitane, Fondazioni bancarie maggiori (Cariplo, Compagnia S. Paolo, CRT) | Standard: titolo con segnale-bando **o** scadenza valida | Ogni scansione | Secondo |
| **C** | GAL, fondazioni locali, associazioni, enti minori | Severa: titolo con segnale-bando **E** (scadenza valida **o** descrizione ≥ 120 caratteri) | A rotazione, max 10/giorno | Terzo |

- [ ] **Step 1: Creare il modulo regia**

Creare `FontiRegia.js`:

```javascript
// ============================================================================
//  FontiRegia.js — Governo delle fonti bandi per PRIORITÀ (tier A/B/C).
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia · v4.27.74 (2026-07-31)
//
//  PERCHÉ: il 31/07 su 408 bandi esaminati 274 erano voci di menu di siti GAL.
//  Trattare TED e un GAL con la stessa soglia produce rumore che soffoca il
//  segnale. Il tier governa: soglia di ingresso, quota di scansione, ordine
//  di esposizione. La colonna 'Priorita' di FontiBandi_v5 (COL_F_HEADERS)
//  diventa il campo operativo: 'A' | 'B' | 'C'.
// ============================================================================

var FR_SHEET = 'FontiBandi_v5';

/** Riconoscimento tier dal nome/URL della fonte (usato per il backfill). */
var FR_TIER_A_RE = /(\bted\b|tenders?\s*electronic|europa\.eu|ec\.europa|funding.*tenders|creative\s*europe|cultura\.gov|beniculturali|ministero|mic\b|anac|bdncp|consip|mepa|acquistinretepa|pnrr|agenzia\s+coesione)/i;
var FR_TIER_B_RE = /(regione|regional|citt[aà]\s+metropolitana|provincia\s+autonoma|fondazione\s+(cariplo|compagnia|crt|cariverona|caritorino)|compagnia\s+di\s+san\s*paolo|camera\s+di\s+commercio)/i;
// tutto il resto → C

/** @private */
function _frSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(FR_SHEET);
}

/** Tier di una fonte a partire da nome+url. @return {'A'|'B'|'C'} */
function frTierDaFonte(nome, url) {
  var t = String(nome || '') + ' ' + String(url || '');
  if (FR_TIER_A_RE.test(t)) return 'A';
  if (FR_TIER_B_RE.test(t)) return 'B';
  return 'C';
}

/**
 * Backfill: assegna il tier a tutte le fonti che non ce l'hanno (o a tutte
 * con {force:true}). Idempotente.
 * @param {Object} [opts] { force:false, dryRun:false }
 */
function frBackfillTier(opts) {
  opts = opts || {};
  var rep = { ok: true, dryRun: !!opts.dryRun, totale: 0, assegnati: 0, perTier: { A: 0, B: 0, C: 0 } };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'foglio ' + FR_SHEET + ' assente o vuoto' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL'), iPri = head.indexOf('Priorita');
    if (iPri < 0) return { ok: false, error: 'colonna Priorita assente' };
    for (var r = 1; r < vals.length; r++) {
      if (!vals[r][iNome] && !vals[r][iUrl]) continue;
      rep.totale++;
      var attuale = String(vals[r][iPri] || '').trim().toUpperCase();
      if (attuale && 'ABC'.indexOf(attuale) >= 0 && !opts.force) { rep.perTier[attuale]++; continue; }
      var tier = frTierDaFonte(vals[r][iNome], vals[r][iUrl]);
      rep.perTier[tier]++;
      rep.assegnati++;
      if (!opts.dryRun) sh.getRange(r + 1, iPri + 1).setValue(tier);
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[frBackfillTier] ' + JSON.stringify(rep));
  return rep;
}

/** Mappa {urlNormalizzato: tier} per lookup rapido in ingestione. */
function frMappaTier() {
  var mappa = {};
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return mappa;
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL'), iPri = head.indexOf('Priorita');
    for (var r = 1; r < vals.length; r++) {
      var tier = String(vals[r][iPri] || '').trim().toUpperCase();
      if ('ABC'.indexOf(tier) < 0) tier = frTierDaFonte(vals[r][iNome], vals[r][iUrl]);
      var nome = String(vals[r][iNome] || '').trim().toLowerCase();
      if (nome) mappa[nome] = tier;
    }
  } catch (e) { Logger.log('[frMappaTier] ' + e.message); }
  return mappa;
}

/** Tier di un bando dal nome della sua fonte (default 'C' = severo). */
function frTierBando(b) {
  if (!b) return 'C';
  var fonte = String(b.fonteNome || b.fonte || b.ente || '').trim().toLowerCase();
  if (!fonte) return 'C';
  if (!_FR_CACHE_) _FR_CACHE_ = frMappaTier();
  if (_FR_CACHE_[fonte]) return _FR_CACHE_[fonte];
  return frTierDaFonte(fonte, '');
}
var _FR_CACHE_ = null;
```

- [ ] **Step 2: Strumenti admin**

In `AdminTools.js` aggiungere allo switch:

```javascript
      case 'fontiTierDry':   r = frBackfillTier({ dryRun: true }); break;
      case 'fontiTierApply': r = frBackfillTier({}); break;
```

- [ ] **Step 3: Verifica e commit**

```bash
node --check FontiRegia.js && node --check AdminTools.js
git add FontiRegia.js AdminTools.js
git commit -m "feat(fonti): regia per tier di priorita (A nazionali/UE/MEPA, B regionali, C GAL/locali)"
```

---

## Task 5 — Soglia di ingresso differenziata per tier

**Files:**
- Modify: `BandiGate.js`

- [ ] **Step 1: Rendere la soglia dipendente dal tier**

In `BandiGate.js`, sostituire la funzione `_bandiMotivoScarto_` con:

```javascript
function _bandiMotivoScarto_(b) {
  var tit = String((b && b.titolo) || '').trim();
  if (!tit || _BANDO_TITOLO_NUMERO_RE.test(tit)) return 'titolo-non-informativo';
  var g = (b && b.giorni !== undefined) ? b.giorni : null;
  if (g !== null && g < 0) return 'scaduto';
  var descr = String((b && b.sommario) || '').replace(/\s+/g, ' ').trim();
  if (g === null && descr.length < 20) return 'senza-scadenza-e-senza-descrizione';
  if (g === null && !_BANDO_SEGNALE_RE.test(tit)) return 'senza-scadenza-e-titolo-non-bando';

  // v4.27.74 — SOGLIA PER TIER: le fonti locali (GAL, associazioni) sono
  // quelle che producono voci di menu; per loro serve più prova che sia un
  // bando vero. Le fonti istituzionali (TED, MiC, ANAC, MEPA) restano
  // permissive perché non pubblicano rumore.
  var tier = (typeof frTierBando === 'function') ? frTierBando(b) : 'C';
  if (tier === 'C') {
    var haScad = (g !== null);
    if (!haScad && descr.length < 120) return 'tierC-prove-insufficienti';
  }
  return '';
}
```

- [ ] **Step 2: Estendere il self-test**

In `BandiGate.js`, dentro `bandiGateSelfTest`, aggiungere in coda all'array `casi`:

```javascript
    { in:{ titolo:'Bando pubblico qualificazione attività commerciali', settore:'', sommario:'Breve nota di 40 caratteri circa qui.', cpv:'', link:'https://galesempio.it/bando', fonteNome:'GAL Terra Protetta', giorni:null }, attesoIn:false, nome:'Tier C senza scadenza e descrizione corta' },
    { in:{ titolo:'Bando pubblico per la valorizzazione del patrimonio museale', settore:'musei', sommario:'Avviso rivolto a musei ed ecomusei del territorio per interventi di valorizzazione, allestimento e servizi educativi. Dotazione complessiva 500.000 euro, domande a sportello fino a esaurimento risorse.', cpv:'', link:'https://galesempio.it/bando-musei', fonteNome:'GAL Terra Protetta', giorni:null }, attesoIn:true, attesoTipo:'diretto', nome:'Tier C senza scadenza ma con descrizione ricca' },
    { in:{ titolo:'Avviso PNRR digitalizzazione musei', settore:'musei', sommario:'Avviso del Ministero della Cultura.', cpv:'', link:'https://cultura.gov.it/avviso-digital', fonteNome:'MiC — Ministero della Cultura', giorni:null }, attesoIn:true, attesoTipo:'diretto', nome:'Tier A permissivo (MiC)' }
```

- [ ] **Step 3: Verifica sintassi e commit**

```bash
node --check BandiGate.js
git add BandiGate.js
git commit -m "feat(gate): soglia di esposizione differenziata per tier della fonte"
```

---

## Task 6 — Salute scansioni per tier (osservabilità)

**Files:**
- Modify: `FontiRegia.js`
- Modify: `ReportUnificato.js`
- Modify: `CronDispatcher.js`

- [ ] **Step 1: KPI di salute per tier**

Aggiungere in `FontiRegia.js`:

```javascript
/**
 * Salute delle fonti bandi per tier. Distingue i tre stati che contano:
 *  - SILENTE: scansionata ma 0 record da ≥7gg (la fonte non pubblica o è rotta)
 *  - RUMOROSA: produce record che vengono archiviati per >70% (rubinetto sporco)
 *  - SANA: produce record che restano esposti
 * @return {Object} report per tier + elenco fonti da attenzionare
 */
function frSaluteFonti() {
  var rep = { ok: true, generato: Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy HH:mm'),
              perTier: {}, silenti: [], daRivedere: [] };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'foglio fonti assente' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iPri = head.indexOf('Priorita'), iAtt = head.indexOf('Attiva');
    var iScan = head.indexOf('UltimaScan'), iTot = head.indexOf('NRecordTotali'), iFail = head.indexOf('FailConsecutivi');
    var ora = Date.now();
    ['A', 'B', 'C'].forEach(function (t) { rep.perTier[t] = { fonti: 0, attive: 0, scansionate7gg: 0, silenti: 0 }; });
    for (var r = 1; r < vals.length; r++) {
      var nome = String(vals[r][iNome] || '').trim();
      if (!nome) continue;
      var tier = String(vals[r][iPri] || '').trim().toUpperCase();
      if ('ABC'.indexOf(tier) < 0) tier = 'C';
      var T = rep.perTier[tier];
      T.fonti++;
      var attiva = String(vals[r][iAtt]) === 'true' || vals[r][iAtt] === true;
      if (!attiva) continue;
      T.attive++;
      var d = (iScan >= 0) ? _bcvData_(vals[r][iScan]) : null;
      var recenti = d && (ora - d.getTime()) <= 7 * 86400000;
      if (recenti) T.scansionate7gg++;
      var tot = Number(vals[r][iTot] || 0);
      if (recenti && tot === 0) {
        T.silenti++;
        rep.silenti.push({ tier: tier, nome: nome, ultimaScan: d ? Utilities.formatDate(d, 'Europe/Rome', 'dd/MM') : '—' });
      }
      var fail = Number(vals[r][iFail] || 0);
      if (fail >= 3) rep.daRivedere.push({ tier: tier, nome: nome, failConsecutivi: fail });
    }
    // ordina: prima i problemi sulle fonti di tier alto
    var ord = { A: 0, B: 1, C: 2 };
    rep.silenti.sort(function (a, b) { return ord[a.tier] - ord[b.tier]; });
    rep.daRivedere.sort(function (a, b) { return ord[a.tier] - ord[b.tier]; });
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  return rep;
}

/** @private data robusta (locale al modulo, evita dipendenze incrociate) */
function _bcvDataFR_(v) { return (typeof _bcvData_ === 'function') ? _bcvData_(v) : (v ? new Date(v) : null); }
```

Nota: nella funzione sopra sostituire le due occorrenze di `_bcvData_(` con `_bcvDataFR_(` se `BandiCicloVita.js` non fosse caricato (in GAS tutti i file condividono lo scope globale, quindi normalmente `_bcvData_` è disponibile).

- [ ] **Step 2: Sezione nel report giornaliero**

In `ReportUnificato.js`, dentro `reportUnificatoGiornaliero`, prima della composizione finale dell'email, aggiungere:

```javascript
  // v4.27.74 — Salute fonti bandi per tier di priorità
  var _salute = null;
  try { _salute = (typeof frSaluteFonti === 'function') ? frSaluteFonti() : null; } catch (e) { Logger.log('[RU] salute fonti: ' + e.message); }
  var _saluteHtml = '';
  if (_salute && _salute.ok) {
    var righe = ['A', 'B', 'C'].map(function (t) {
      var T = _salute.perTier[t] || {};
      var lbl = { A: 'A · nazionali/UE/MEPA', B: 'B · regionali/fondazioni', C: 'C · GAL/locali' }[t];
      return '<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">' + lbl + '</td>'
        + '<td style="padding:4px 8px;border-bottom:1px solid #eee">' + (T.attive || 0) + '/' + (T.fonti || 0) + '</td>'
        + '<td style="padding:4px 8px;border-bottom:1px solid #eee">' + (T.scansionate7gg || 0) + '</td>'
        + '<td style="padding:4px 8px;border-bottom:1px solid #eee' + (T.silenti > 0 ? ';color:#B91C1C;font-weight:700' : '') + '">' + (T.silenti || 0) + '</td></tr>';
    }).join('');
    _saluteHtml = '<h3 style="font-family:Georgia,serif">Salute fonti bandi per priorità</h3>'
      + '<table style="border-collapse:collapse;font-size:13px"><tr>'
      + '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333">Tier</th>'
      + '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333">Attive</th>'
      + '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333">Scan 7gg</th>'
      + '<th style="text-align:left;padding:4px 8px;border-bottom:2px solid #333">Silenti</th></tr>'
      + righe + '</table>'
      + (_salute.silenti.length ? '<p style="font-size:12px;color:#666">Silenti da attenzionare: '
          + _salute.silenti.slice(0, 8).map(function (s) { return '[' + s.tier + '] ' + s.nome; }).join(' · ') + '</p>' : '');
  }
```

e concatenare `_saluteHtml` nel corpo dell'email (subito dopo la sezione bandi).

- [ ] **Step 3: Job di manutenzione tier**

In `CronDispatcher.js`, in `OC_CRON_EXTRA`, aggiungere:

```javascript
  // v4.27.74 — assegna il tier alle fonti nuove (idempotente, non tocca quelle già classificate)
  { fn: 'frBackfillTier', tipo: 'weekly', giorno: ScriptApp.WeekDay.MONDAY, ora: 4, desc: 'Regia fonti: assegna tier di priorità alle fonti nuove' },
```

- [ ] **Step 4: Verifica e commit**

```bash
node --check FontiRegia.js && node --check ReportUnificato.js && node --check CronDispatcher.js
git add FontiRegia.js ReportUnificato.js CronDispatcher.js
git commit -m "feat(osservabilita): salute fonti bandi per tier nel report giornaliero"
```

---

## Task 7 — Completezza informativa: link mancanti

**Files:**
- Modify: `Codice.js` (funzione `arricchisciBandiV5`)

**Problema:** 36 bandi su 105 senza link specifico; i peggiori sono i bandi UE arrivati da fonti news (`non-url`).

- [ ] **Step 1: Priorità agli “senza link” nell’arricchimento**

In `Codice.js`, dentro `arricchisciBandiV5`, dopo la costruzione della lista dei candidati e prima del ciclo di arricchimento, inserire l'ordinamento:

```javascript
  // v4.27.74 — PRIORITÀ: prima i bandi senza link utile (36/105 il 31/07),
  // poi quelli senza descrizione. Un bando senza link è il difetto che il
  // lettore percepisce di più.
  candidati.sort(function (a, b) {
    var la = String(a.urlBando || a.link || '').trim() ? 1 : 0;
    var lb = String(b.urlBando || b.link || '').trim() ? 1 : 0;
    if (la !== lb) return la - lb;
    var da = String(a.sommario || '').length, db = String(b.sommario || '').length;
    return da - db;
  });
```

- [ ] **Step 2: Verifica e commit**

```bash
node --check Codice.js
git add Codice.js
git commit -m "feat(enrich): priorita ai bandi senza link nell'arricchimento notturno"
```

---

## Task 8 — Normalizzazione Regione (mappa)

**Files:**
- Modify: `BandiCicloVita.js`
- Modify: `AdminTools.js`

- [ ] **Step 1: Deduzione regione da ente/titolo**

Aggiungere in `BandiCicloVita.js`:

```javascript
var BCV_REGIONI = ['Abruzzo','Basilicata','Calabria','Campania','Emilia-Romagna','Friuli-Venezia Giulia',
  'Lazio','Liguria','Lombardia','Marche','Molise','Piemonte','Puglia','Sardegna','Sicilia','Toscana',
  'Trentino-Alto Adige','Umbria',"Valle d'Aosta",'Veneto'];

/** @private città → regione, per gli enti che non nominano la regione */
var BCV_CITTA_REGIONE = {
  'roma':'Lazio','milano':'Lombardia','torino':'Piemonte','napoli':'Campania','firenze':'Toscana',
  'venezia':'Veneto','bologna':'Emilia-Romagna','palermo':'Sicilia','genova':'Liguria','bari':'Puglia',
  'cagliari':'Sardegna','trieste':'Friuli-Venezia Giulia','perugia':'Umbria','ancona':'Marche',
  'trento':'Trentino-Alto Adige','bolzano':'Trentino-Alto Adige','aosta':"Valle d'Aosta",
  'campobasso':'Molise','potenza':'Basilicata','catanzaro':'Calabria','laquila':'Abruzzo','udine':'Friuli-Venezia Giulia'
};

/**
 * Riempie la colonna Regione dove vuota, deducendola da ente/titolo/sommario.
 * Nessuna chiamata AI: solo riconoscimento testuale (deterministico, gratis).
 * @param {Object} [opts] { dryRun:false, cap:400 }
 */
function bcvNormalizzaRegione(opts) {
  opts = opts || {};
  var cap = Number(opts.cap) || 400;
  var rep = { ok: true, dryRun: !!opts.dryRun, esaminati: 0, compilati: 0, nonDedotti: 0, esempi: [] };
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length && rep.compilati < cap; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
      if (String(row[COL_B.REGIONE - 1] || '').trim()) continue;
      rep.esaminati++;
      var testo = (String(row[COL_B.ENTE - 1] || '') + ' ' + String(row[COL_B.TITOLO - 1] || '') + ' ' +
                   String(row[COL_B.SOMMARIO - 1] || '')).toLowerCase();
      var trovata = '';
      for (var i = 0; i < BCV_REGIONI.length; i++) {
        var chiave = BCV_REGIONI[i].toLowerCase().replace(/[^a-z]/g, '');
        if (testo.replace(/[^a-z]/g, '').indexOf(chiave) >= 0) { trovata = BCV_REGIONI[i]; break; }
      }
      if (!trovata) {
        for (var citta in BCV_CITTA_REGIONE) {
          if (testo.indexOf(citta) >= 0) { trovata = BCV_CITTA_REGIONE[citta]; break; }
        }
      }
      if (!trovata) { rep.nonDedotti++; continue; }
      if (rep.esempi.length < 10) rep.esempi.push(String(row[COL_B.ENTE - 1] || '').substring(0, 40) + ' → ' + trovata);
      if (!opts.dryRun) sh.getRange(r + 1, COL_B.REGIONE).setValue(trovata);
      rep.compilati++;
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[bcvNormalizzaRegione] ' + JSON.stringify({ c: rep.compilati, n: rep.nonDedotti }));
  return rep;
}
```

- [ ] **Step 2: Strumenti admin + cron**

In `AdminTools.js`:

```javascript
      case 'regioneDry':   r = bcvNormalizzaRegione({ dryRun: true }); break;
      case 'regioneApply': r = bcvNormalizzaRegione({}); break;
```

In `CronDispatcher.js`, in `OC_CRON_EXTRA`:

```javascript
  { fn: 'bcvNormalizzaRegione', tipo: 'daily', ora: 2, desc: 'Normalizza campo Regione dei bandi (mappa Radar)' },
```

- [ ] **Step 3: Verifica e commit**

```bash
node --check BandiCicloVita.js && node --check AdminTools.js && node --check CronDispatcher.js
git add BandiCicloVita.js AdminTools.js CronDispatcher.js
git commit -m "feat(mappa): normalizzazione automatica del campo Regione"
```

---

## Task 9 — Diagnostica estesa e deploy

**Files:**
- Modify: `Codice.js` (endpoint `?diag=bandi`)
- Modify: `Constants.js` (versione)

- [ ] **Step 1: Estendere l’endpoint diagnostico**

In `Codice.js`, dentro il blocco `if (params.diag === 'bandi')`, prima del `return`, aggiungere:

```javascript
    try {
      _dgB.archivio = (typeof bcvArchiviati === 'function') ? { totale: bcvArchiviati(1000).length } : 'modulo assente';
      _dgB.purgeSimulata = (typeof bcvPurgeArchiviati === 'function') ? bcvPurgeArchiviati({ dryRun: true }) : 'modulo assente';
      _dgB.saluteFonti = (typeof frSaluteFonti === 'function') ? frSaluteFonti() : 'modulo assente';
    } catch (e3) { _dgB.estensioniErrore = e3.message; }
```

- [ ] **Step 2: Bump versione**

In `Constants.js`: `var OC_VERSION = 'v4.27.74';`

- [ ] **Step 3: Anti-clobber, push, deploy**

```bash
# 1) anti-clobber (obbligatorio)
SP=<scratchpad>; rm -rf "$SP/sync"; mkdir -p "$SP/sync"; cp .clasp.json "$SP/sync/"
cd "$SP/sync" && clasp pull && grep -o "OC_VERSION = '[^']*'" Constants.js
# confrontare i file con il locale; se il remoto è avanti, adottare prima le sue modifiche

# 2) push + deploy sullo STESSO deploymentId
cd "<working-dir>"
clasp push -f
clasp deploy --deploymentId AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs --description "v4.27.74 — regia fonti per tier, archivio+purge 20gg, salute scansioni"
```

- [ ] **Step 4: Verifica sul deployment**

```bash
curl -sL "https://script.google.com/macros/s/AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs/exec?diag=bandi"
```

Atteso: `selfTest.ok = true` con 18 casi, `archivio.totale > 0` (non più zero), `saluteFonti.perTier` con i tre tier popolati.

- [ ] **Step 5: Commit finale**

```bash
git add Codice.js Constants.js
git commit -m "feat(bandi): regia fonti per tier + ciclo di vita archivio — v4.27.74"
```

---

## Sequenza operativa consigliata (ordine di esecuzione)

1. **Task 1-3** (ciclo di vita): sbloccano l'archivio e fermano l'accumulo. Sono indipendenti e a rischio zero.
2. **Task 4-5** (regia fonti): riducono il rumore in ingresso. Da eseguire con `dryRun` prima di applicare.
3. **Task 6** (osservabilità): rende visibile l'effetto dei due blocchi precedenti nel report del giorno dopo.
4. **Task 7-8** (completezza): migliorano ciò che resta esposto.
5. **Task 9**: diagnostica e deploy.

## Azioni manuali per Silvano dopo il deploy

| Quando | Strumento (Impostazioni → Sistema → Strumenti) | Perché |
|---|---|---|
| Subito | **🔎 Purge archivio (anteprima)** | Vedere quanti dei 274 verrebbero cancellati prima di farlo davvero |
| Subito dopo | **🧹 Purge archivio (applica)** | Svuotare l'accumulo storico |
| Subito | **Fonti: assegna tier (anteprima → applica)** | Classificare le 153 fonti in A/B/C |
| Subito | **Regione: normalizza (anteprima → applica)** | Riempire la mappa del Radar |
| Il giorno dopo | Leggere il report giornaliero delle 8:00 | Verificare la sezione "Salute fonti per tier" |

## Criteri di accettazione

- [ ] L'Archivio della webapp mostra i bandi archiviati (oggi mostra sempre zero)
- [ ] `?diag=bandi` riporta `archivio.totale > 0` e `purgeSimulata.cancellati > 0`
- [ ] Dopo la purge, nessun bando archiviato più vecchio di 20 giorni resta nel foglio
- [ ] Le fonti hanno tutte un tier A/B/C; TED/MiC/ANAC/MEPA sono in A
- [ ] Un titolo di menu da fonte GAL senza scadenza non viene esposto; lo stesso titolo con descrizione ricca sì
- [ ] Il report giornaliero contiene la tabella "Salute fonti bandi per priorità"
- [ ] Il numero di bandi esposti senza link scende sotto il 15% (oggi 34%)

---

# APPENDICE — Estendere il controllo a TUTTE le sezioni (01/08/2026)

**Richiesta Silvano:** «dobbiamo controllare fonti relative ai podcast, video, leggi,
pubblicazioni e libri e norme **sempre**» — non un controllo una tantum, ma
permanente, come quello costruito per i bandi.

## Evidenza già raccolta (verifica del 01/08, ore 08:44)

Nuovi contenuti nella settimana corrente, per sezione:

| Sezione | Nuovi 7gg | Stato |
|---|---|---|
| News | 988 | sano |
| Norme | 15 | sano |
| **Bandi** | 0 | in ripartenza (canale RSS riattivato il 31/07) |
| **Podcast** | 0 | **da verificare** |
| **Video** | 0 | **da verificare** |
| **Libri / Pubblicazioni** | 0 | **da verificare** |
| **Lavoro cultura** | 0 | atteso: la GU pubblica a ondate |
| **Capitali & candidature** | 0 | **da verificare** |
| **Social** | 0 | **da verificare** |

Dato aggiuntivo dal report QA del 31/07: *«Feed attivi: 113 rss / 12 pod / **0 video**»*
e *«Fonti RSS a 0 record (candidate morte): 19»*. Lo zero sui video non è un caso:
i canali YouTube potrebbero non essere registrati come fonti attive.

## Ipotesi da verificare, in ordine di probabilità

Sono le stesse quattro cause trovate sui bandi — vanno cercate su ogni canale:

1. **Scanner non schedulato** — è successo per il canale RSS bandi (167 fonti mai
   scansionate). Controllare che `scanPodcastBisettimanale` copra davvero podcast
   *e* video, e che esista un job per Pubblicazioni e Capitali.
2. **Schema di scrittura disallineato** — è successo due volte (`_fasSaveBando_` nel
   2026-04, `ScannerRssSpecializzato` il 31/07): array posizionale che slitta di una
   colonna e rende i record inutilizzabili. Verificare l'append di ogni scanner
   rispetto allo schema del foglio di destinazione.
3. **Fonti morte non sostituite** — sui bandi ne sono emerse 5 (una ferma dal 2024).
   Serve la stessa misura di freschezza: data dell'item più recente per feed.
4. **Contatore che guarda il foglio sbagliato** — è successo per il badge "lavoro"
   (leggeva un foglio inesistente). Verificare che ogni contatore legga la fonte
   realmente servita.

## Cosa riusare (già scritto e collaudato sui bandi)

- `frSaluteFonti()` — KPI per tier: attive, scansionate 7gg, silenti, in errore.
  Va generalizzata al foglio fonti di ciascun canale.
- `frNaturaFonte()` — separazione bandi/news. Per gli altri canali serve l'equivalente:
  una fonte podcast non deve finire tra i video e viceversa.
- Diagnosi di freschezza dello scanner RSS (`ultimoItem`, `giorniDaUltimoItem`) —
  è la misura che ha smascherato le fonti morte: replicarla per podcast/video.
- Endpoint `?diag=tutto` — aggiungere una sezione per sezione con: fonti attive,
  ultimo contenuto entrato, contenuti esposti, contenuti scartati e perché.

## Criterio di accettazione

Per ogni sezione (podcast, video, libri, norme, capitali, social) si deve poter
rispondere a tre domande **con un numero**, non con un'impressione:
1. quante fonti attive ha, e quante hanno prodotto negli ultimi 7 giorni
2. quando è entrato l'ultimo contenuto
3. quanti contenuti sono esposti e quanti scartati, con il motivo

Finché una sezione non risponde a queste tre domande, non è governata.
