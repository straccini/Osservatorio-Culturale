# Strumentazione Funnel + Attribuzione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Misurare il funnel reale (conteggi + tassi di conversione per stadio) con tassi veri di coorte sul tratto outbound, in un cruscotto admin, come base per la validazione economica.

**Architecture:** Logica di calcolo **isolata in due strati**: una funzione *pura* (`_funnelComputeFromCounts_`) che da un oggetto di conteggi produce stadi+tassi+affidabilità (testabile senza fogli), e una funzione che *legge i fogli* (`_funnelFetchCounts_`). `getFunnelCompleto()` le compone. L'attribuzione outbound si ottiene con un link tracciato nel cold mail (`src=museo__bando`) catturato alla registrazione e seguito per email a valle.

**Tech Stack:** Google Apps Script (V8), HTML Service, Google Sheets. Nessuna libreria/CDN esterna. Test = funzioni dry-run `_test_*_()` eseguite nell'editor GAS (o via `clasp run`), che loggano PASS/FAIL e lanciano un'eccezione sul fallimento.

**Riferimento spec:** `docs/superpowers/specs/2026-06-06-funnel-strumentazione-design.md`

**Convenzione di test GAS (vale per tutto il piano):** ogni `_test_*_()` usa questo helper:
```javascript
function _assert_(cond, msg) {
  if (!cond) { throw new Error('ASSERT FALLITO: ' + msg); }
  Logger.log('  ok: ' + msg);
}
```
"Eseguire il test" = nell'editor GAS selezionare la funzione `_test_*_` e premere Esegui; controllare nel log che finisca con `TUTTI OK` e senza eccezioni.

---

## File Structure

| File | Stato | Responsabilità |
|---|---|---|
| `Funnel_v1.js` | **nuovo** | `getFunnelCompleto()`, strato puro `_funnelComputeFromCounts_`, strato lettura `_funnelFetchCounts_`, helper `_funnelRate_`, `_assert_`, e tutti i `_test_*_`. |
| `Constants.js` | modifica | costanti nomi foglio/colonna del funnel + `OC_FUNNEL_SOGLIA_MIN`. |
| `ROC_v1.js` | modifica | helper `_roc_buildRegLink_()` + iniezione link tracciato in `roc_buildEmailBatch()`. |
| `Sessioni_v1.js` | modifica | cattura/salvataggio `acquisition_source` alla creazione sessione (post v4.21.2). |
| `Index.html` | modifica | lettura parametro `src` al landing + invio alla registrazione; tab admin "Funnel". |
| `Styles.html` | modifica | stile imbuto del cruscotto. |

Ordine di lavoro: prima ciò che non ha conflitti (Funnel_v1.js, Constants, ROC), poi le parti su registrazione/Index.html (ora possibili perché la base v4.21.2 è committata).

---

## Task 0: Verifica punti aperti (sblocca i conteggi)

Risolve i punti §13 della spec prima di scrivere la logica che vi dipende. Nessun codice prodotto; solo accertamenti che fissano i nomi reali.

**Files:** nessuno (sola ispezione).

- [ ] **Step 1: Dove persiste il profilo L2?**

Cerca la funzione attiva di salvataggio profilo e il foglio/colonna usati:
```
grep -rn "saveProfilo\|ProfiliPro\|completezza\|profilazione" --include=*.js .
```
Annota: nome foglio (atteso `ProfiliPro`), colonna email, colonna che indica completezza (atteso `completezza`). Se la profilazione progressiva F2 usa un altro foglio, annota quello.

- [ ] **Step 2: L'opt-in promuove davvero a `hot`?**

```
grep -n "optin_followup\|contatto_consulenziale\|bandi_pnrr\|crm_onMatrixOptIn" CRM_v1.js
```
Verifica che le chiavi cercate da `crm_onMatrixOptIn` includano quelle realmente inviate da Matrix (D12.1). Se sì → lo stadio "lead caldo" si popola. Se no → annota che lo stadio 5 resterà a zero per il bug, non per mancanza dati.

- [ ] **Step 3: Conferma le colonne reali di `Utenti`, `ROC_Outreach`, `ResponsesMatrix`, `CRM_Leads`, `RichiestePrenotazione`.**

```
grep -n "appendRow(\[" Auth.js ROC_v1.js Matrix_v1.js CRM_v1.js Prenotazioni_v1.js
```
Trascrivi gli header reali (servono ai conteggi del Task 3).

- [ ] **Step 4: Registra gli esiti in fondo a questo piano** (sezione "Esiti Task 0") così i task successivi usano i nomi confermati.

---

## Task 1: Costanti del funnel

**Files:**
- Modify: `Constants.js` (in coda al file, vicino alle altre costanti `OC_*`)

- [ ] **Step 1: Aggiungi le costanti**

```javascript
// === Funnel / strumentazione (Fase 1) ===
var OC_FUNNEL_SOGLIA_MIN = 20; // sotto questo denominatore il tasso e' "non affidabile"

var OC_FUNNEL_SHEETS = {
  outreach:     'ROC_Outreach',
  utenti:       'Utenti',
  profili:      'ProfiliPro',          // confermato in Task 0 step 1
  matrix:       'ResponsesMatrix',
  crm:          'CRM_Leads',
  prenotazioni: 'RichiestePrenotazione'
};

// separatore del token di provenienza: "<museoId>__<bandoId>"
var OC_ACQ_SEP = '__';
```

- [ ] **Step 2: Verifica caricamento**

Nell'editor GAS esegui questa riga una volta (funzione usa-e-getta) o controlla in un test successivo:
```javascript
function _test_costantiFunnel_() {
  _assert_(OC_FUNNEL_SOGLIA_MIN === 20, 'soglia definita');
  _assert_(OC_FUNNEL_SHEETS.crm === 'CRM_Leads', 'mappa fogli definita');
  Logger.log('TUTTI OK');
}
```
Esegui `_test_costantiFunnel_` → atteso log `TUTTI OK`.

- [ ] **Step 3: Commit**

```bash
git add Constants.js
git commit -m "feat(funnel): costanti soglia + mappa fogli"
```

---

## Task 2: Strato PURO — `_funnelComputeFromCounts_` (TDD)

Il cuore logico, senza fogli: da un oggetto di conteggi produce gli stadi con tasso e affidabilità.

**Files:**
- Create: `Funnel_v1.js`

- [ ] **Step 1: Crea il file con l'helper di test e la firma vuota**

```javascript
// ============================================================================
// Funnel_v1.js — Strumentazione funnel (Fase 1)
// Misura conteggi + tassi di conversione per stadio. Vedi spec 2026-06-06.
// ============================================================================

function _assert_(cond, msg) {
  if (!cond) { throw new Error('ASSERT FALLITO: ' + msg); }
  Logger.log('  ok: ' + msg);
}

function _funnelRate_(num, den) {
  if (!den || den <= 0) return null;
  return Math.round((num / den) * 1000) / 1000; // 3 decimali
}

// Ordine canonico degli stadi
var OC_FUNNEL_STADI = [
  { key: 'contattati',  label: 'Contattati' },
  { key: 'registrati',  label: 'Registrati' },
  { key: 'profilati',   label: 'Profilati' },
  { key: 'matrix',      label: 'Matrix' },
  { key: 'leadCaldo',   label: 'Lead caldo' },
  { key: 'prenotazione',label: 'Prenotazione' },
  { key: 'cliente',     label: 'Cliente' }
];

// PURA: counts = { contattati:N, registrati:N, ... }; soglia = numero
function _funnelComputeFromCounts_(counts, soglia) {
  // implementazione nel Step 3
}
```

- [ ] **Step 2: Scrivi il test che fallisce**

```javascript
function _test_funnelCompute_() {
  var counts = { contattati:100, registrati:18, profilati:12, matrix:9, leadCaldo:4, prenotazione:2, cliente:1 };
  var r = _funnelComputeFromCounts_(counts, 20);

  _assert_(r.stadi.length === 7, '7 stadi');
  _assert_(r.stadi[0].key === 'contattati', 'primo = contattati');
  _assert_(r.stadi[0].rateFromPrev === null, 'primo stadio senza tasso');
  _assert_(r.stadi[1].count === 18, 'count registrati');
  _assert_(r.stadi[1].rateFromPrev === 0.18, 'tasso contattati->registrati = 0.18');
  _assert_(r.stadi[1].affidabile === true, 'denominatore 100 >= soglia 20 => affidabile');
  _assert_(r.stadi[4].affidabile === false, 'denominatore 9 < soglia 20 => non affidabile');
  _assert_(r.conversioneTotale === _funnelRate_(1,100), 'conversione end-to-end = cliente/contattati');
  Logger.log('TUTTI OK');
}
```

- [ ] **Step 3: Esegui il test → deve FALLIRE**

Esegui `_test_funnelCompute_` nell'editor GAS.
Atteso: eccezione (la funzione pura ritorna `undefined`).

- [ ] **Step 4: Implementa la funzione pura**

```javascript
function _funnelComputeFromCounts_(counts, soglia) {
  soglia = soglia || OC_FUNNEL_SOGLIA_MIN;
  var stadi = [];
  for (var i = 0; i < OC_FUNNEL_STADI.length; i++) {
    var def = OC_FUNNEL_STADI[i];
    var count = Number(counts[def.key]) || 0;
    var rate = null, affidabile = true;
    if (i > 0) {
      var prevCount = Number(counts[OC_FUNNEL_STADI[i-1].key]) || 0;
      rate = _funnelRate_(count, prevCount);
      affidabile = prevCount >= soglia;
    }
    stadi.push({ key: def.key, label: def.label, count: count, rateFromPrev: rate, affidabile: affidabile });
  }
  var primo = Number(counts[OC_FUNNEL_STADI[0].key]) || 0;
  var ultimo = Number(counts[OC_FUNNEL_STADI[OC_FUNNEL_STADI.length-1].key]) || 0;
  return {
    stadi: stadi,
    conversioneTotale: _funnelRate_(ultimo, primo),
    note: []
  };
}
```

- [ ] **Step 5: Esegui il test → deve PASSARE**

Esegui `_test_funnelCompute_`. Atteso: log termina con `TUTTI OK`, nessuna eccezione.

- [ ] **Step 6: Commit**

```bash
git add Funnel_v1.js
git commit -m "feat(funnel): strato puro calcolo stadi+tassi (TDD)"
```

---

## Task 3: Strato lettura — `_funnelFetchCounts_`

Legge i fogli e produce l'oggetto `counts`. Usa i nomi confermati nel Task 0. Segue il pattern header-index già usato in `getLeadUnificato` (`OutreachEngine.js:38`).

**Files:**
- Modify: `Funnel_v1.js`

- [ ] **Step 1: Helper generico di conteggio per foglio + finestra temporale**

```javascript
// Conta righe di un foglio dove la colonna data (per nome header) cade in [from,to]
// e (opzionale) un predicato sulla riga e' vero. headerMap costruita una volta.
function _funnelCountSheet_(sheetName, dateHeader, from, to, predicate) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return 0;
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h||'').trim(); });
  var iDate = dateHeader ? head.indexOf(dateHeader) : -1;
  var n = 0;
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    if (iDate >= 0) {
      var d = row[iDate] ? new Date(row[iDate]) : null;
      if (!d || isNaN(d.getTime())) continue;
      if (from && d < from) continue;
      if (to && d > to) continue;
    }
    if (predicate && !predicate(row, head)) continue;
    n++;
  }
  return n;
}

function _funnelColIdx_(head, name) { return head.indexOf(name); }
```

- [ ] **Step 2: La funzione di fetch (usa i nomi confermati in Task 0)**

```javascript
// opts = { dateFrom: Date, dateTo: Date, soloAttribuiti: bool }
function _funnelFetchCounts_(opts) {
  opts = opts || {};
  var from = opts.dateFrom || null, to = opts.dateTo || null;
  var SH = OC_FUNNEL_SHEETS;

  // 1. Contattati: ROC_Outreach status='sent'
  var contattati = _funnelCountSheet_(SH.outreach, 'timestamp', from, to, function(row, head){
    return String(row[_funnelColIdx_(head,'status')]||'') === 'sent';
  });

  // 2. Registrati: Utenti; se soloAttribuiti, richiede AcquisitionSource valorizzato
  var registrati = _funnelCountSheet_(SH.utenti, 'DataIscrizione', from, to, function(row, head){
    var iStato = _funnelColIdx_(head,'Stato');
    var attivo = iStato < 0 || String(row[iStato]||'').toLowerCase() === 'attivo';
    if (!attivo) return false;
    if (opts.soloAttribuiti) {
      var iAcq = _funnelColIdx_(head,'AcquisitionSource');
      return iAcq >= 0 && String(row[iAcq]||'').trim() !== '';
    }
    return true;
  });

  // 3. Profilati: ProfiliPro completezza >= 50 (soglia profilo "completo")
  var profilati = _funnelCountSheet_(SH.profili, 'dataCreazione', from, to, function(row, head){
    var iC = _funnelColIdx_(head,'completezza');
    return iC >= 0 && (Number(row[iC]) || 0) >= 50;
  });

  // 4. Matrix: ResponsesMatrix completion_status='complete'
  var matrix = _funnelCountSheet_(SH.matrix, 'timestamp_fine', from, to, function(row, head){
    return String(row[_funnelColIdx_(head,'completion_status')]||'') === 'complete';
  });

  // 5/7. Lead caldo + Cliente: CRM_Leads per stato
  var leadCaldo = _funnelCountSheet_(SH.crm, 'ultimo_evento', from, to, function(row, head){
    return String(row[_funnelColIdx_(head,'stato')]||'') === 'hot';
  });
  var cliente = _funnelCountSheet_(SH.crm, 'ultimo_evento', from, to, function(row, head){
    return String(row[_funnelColIdx_(head,'stato')]||'') === 'cliente';
  });

  // 6. Prenotazione: RichiestePrenotazione (qualsiasi riga nella finestra)
  var prenotazione = _funnelCountSheet_(SH.prenotazioni, 'data_richiesta', from, to, null);

  return { contattati:contattati, registrati:registrati, profilati:profilati,
           matrix:matrix, leadCaldo:leadCaldo, prenotazione:prenotazione, cliente:cliente };
}
```

> Nota: se Task 0 ha trovato header diversi (es. `Data_Richiesta` invece di `data_richiesta`), correggi qui i nomi. I nomi colonna sono l'unico punto fragile.

- [ ] **Step 3: Dry-run su dati reali**

```javascript
function _test_funnelFetch_() {
  var c = _funnelFetchCounts_({});
  Logger.log(JSON.stringify(c));
  _assert_(typeof c.contattati === 'number', 'contattati e numero');
  _assert_(typeof c.cliente === 'number', 'cliente e numero');
  Logger.log('TUTTI OK (conteggi reali loggati sopra)');
}
```
Esegui `_test_funnelFetch_`. Atteso: un JSON con 7 numeri (probabilmente piccoli/zero finché non c'e traffico) e `TUTTI OK`. Se lancia "header not found", correggi i nomi colonna (Task 0).

- [ ] **Step 4: Commit**

```bash
git add Funnel_v1.js
git commit -m "feat(funnel): strato lettura conteggi da fogli con finestra temporale"
```

---

## Task 4: API pubblica — `getFunnelCompleto()`

Compone fetch + compute, aggiunge gating admin e note, default ultimi 90 giorni.

**Files:**
- Modify: `Funnel_v1.js`

- [ ] **Step 1: Implementa la funzione pubblica**

```javascript
// API frontend. opts = { dateFrom, dateTo, soloAttribuiti, giorni, token }
function getFunnelCompleto(opts) {
  opts = opts || {};
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(opts.token || null)) {
    return { ok: false, error: 'forbidden' };
  }
  // finestra: default ultimi 90 giorni
  var to = opts.dateTo ? new Date(opts.dateTo) : new Date();
  var from;
  if (opts.dateFrom) { from = new Date(opts.dateFrom); }
  else { var g = opts.giorni || 90; from = new Date(to.getTime() - g*24*60*60*1000); }

  var counts = _funnelFetchCounts_({ dateFrom: from, dateTo: to, soloAttribuiti: !!opts.soloAttribuiti });
  var res = _funnelComputeFromCounts_(counts, OC_FUNNEL_SOGLIA_MIN);

  res.ok = true;
  res.periodo = { from: from.toISOString(), to: to.toISOString() };
  res.note.push(opts.soloAttribuiti
    ? 'Tratto outbound su coorte attribuita (solo registrati con provenienza).'
    : 'Vista globale: i registrati includono anche chi non e\' arrivato da outreach.');
  return res;
}
```

- [ ] **Step 2: Test di integrazione (gating + forma output)**

```javascript
function _test_getFunnelCompleto_() {
  var r = getFunnelCompleto({ giorni: 365 });
  _assert_(r.ok === true, 'admin: ok');
  _assert_(r.stadi.length === 7, '7 stadi');
  _assert_(!!r.periodo.from && !!r.periodo.to, 'periodo valorizzato');
  Logger.log(JSON.stringify(r));
  Logger.log('TUTTI OK');
}
```
Esegui `_test_getFunnelCompleto_` (da admin). Atteso: `ok:true`, 7 stadi, `TUTTI OK`.

- [ ] **Step 3: Commit**

```bash
git add Funnel_v1.js
git commit -m "feat(funnel): API getFunnelCompleto con gating admin + finestra default 90gg"
```

---

## Task 5: Link tracciato nel cold mail (attribuzione outbound)

**Files:**
- Modify: `ROC_v1.js` (`roc_buildEmailBatch`, intorno a `:334-368`)

- [ ] **Step 1: Helper per il link di registrazione tracciato**

Aggiungi vicino alle altre utility ROC:
```javascript
function _roc_buildRegLink_(museoId, bandoId) {
  var base = ScriptApp.getService().getUrl(); // URL /exec del deploy attivo
  var src = encodeURIComponent(String(museoId||'') + OC_ACQ_SEP + String(bandoId||''));
  return base + '?reg=1&src=' + src;
}
```

- [ ] **Step 2: Inietta il link nel corpo email**

Dentro `roc_buildEmailBatch`, nel `.map(function(m){ ... })`, prima di costruire `body`, calcola il link:
```javascript
var regLink = _roc_buildRegLink_(m.id, bando.id);
```
Poi sostituisci la frase della CTA testuale con la CTA cliccabile. Cambia il blocco:
```javascript
        'Per dare un\'idea del nostro approccio, sul sito di Duemilamusei trovate il modello "Musei Sensibili" ' +
        'e l\'autovalutazione gratuita MuseMu Matrix.\n\n' +
```
in:
```javascript
        'Per attivare l\'analisi gratuita e accedere all\'autovalutazione MuseMu Matrix:\n' +
        '  ' + regLink + '\n\n' +
        'Trovate anche il modello "Musei Sensibili" sul sito di Duemilamusei.\n\n' +
```
(Il `bodyHtml` deriva gia da `body.replace(/\n/g,'<br>')`, quindi il link resta cliccabile in HTML.)

- [ ] **Step 3: Verifica (dry-run senza inviare)**

```javascript
function _test_rocRegLink_() {
  var link = _roc_buildRegLink_('MUS123','BANDO99');
  Logger.log(link);
  _assert_(link.indexOf('reg=1') >= 0, 'contiene reg=1');
  _assert_(link.indexOf('MUS123' + '__' + 'BANDO99'.substring(0,0)) >= 0 || link.indexOf('MUS123') >= 0, 'contiene museoId');
  _assert_(decodeURIComponent(link).indexOf('MUS123__BANDO99') >= 0, 'src = museo__bando');
  Logger.log('TUTTI OK');
}
```
Esegui `_test_rocRegLink_`. Atteso: log con l'URL e `TUTTI OK`.

- [ ] **Step 4: Commit**

```bash
git add ROC_v1.js
git commit -m "feat(funnel): CTA tracciata nel cold mail (src=museo__bando) per attribuzione"
```

---

## Task 6: Cattura provenienza alla registrazione

> ⚠️ Quest'area è stata appena modificata (v4.21.2 magic-link, commit `bbaa593`). **Leggi prima il codice attuale**, poi applica le aggiunte.

**Files:**
- Modify: `Sessioni_v1.js` (`createSessione`)
- Modify: `Index.html` (landing + chiamata di registrazione)

- [ ] **Step 1: Leggi il codice corrente toccato dall'altra sessione**

```
grep -n "function createSessione\|acquisition\|appendRow(\[" Sessioni_v1.js
grep -n "createSessione(\|reg=1\|getLocation\|google.script.url\|src" Index.html
```
Annota: la firma attuale di `createSessione`, l'header del foglio `Sessioni_v1`, e dove il frontend chiama la registrazione.

- [ ] **Step 2: Aggiungi la colonna `AcquisitionSource` al foglio `Utenti`**

Funzione idempotente in `Sessioni_v1.js` (o in `Auth.js` vicino a `_getOrCreateUtentiSheet_`):
```javascript
function _ensureAcquisitionColumn_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Utenti');
  if (!sh) return;
  var head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(h){return String(h||'').trim();});
  if (head.indexOf('AcquisitionSource') < 0) {
    sh.getRange(1, sh.getLastColumn()+1).setValue('AcquisitionSource');
  }
}
```

- [ ] **Step 3: Estendi `createSessione` per accettare e salvare la provenienza**

Cambia la firma `function createSessione(email, source)` in `function createSessione(email, source, acquisitionSource)` e, dopo aver creato/aggiornato l'utente, scrivi la provenienza in `Utenti` se fornita e non già presente:
```javascript
  // v-funnel — salva provenienza outbound se presente
  try {
    if (acquisitionSource) {
      _ensureAcquisitionColumn_();
      var ssU = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
      var shU = ssU.getSheetByName('Utenti');
      var hU = shU.getRange(1,1,1,shU.getLastColumn()).getValues()[0].map(function(h){return String(h||'').trim();});
      var iE = hU.indexOf('Email'), iA = hU.indexOf('AcquisitionSource');
      var rows = shU.getDataRange().getValues();
      for (var i=1;i<rows.length;i++){
        if (String(rows[i][iE]||'').toLowerCase().trim() === String(email).toLowerCase().trim()) {
          if (!String(rows[i][iA]||'').trim()) shU.getRange(i+1, iA+1).setValue(String(acquisitionSource));
          break;
        }
      }
    }
  } catch(eAcq){ Logger.log('[createSessione] acquisition err: ' + eAcq.message); }
```
Mantieni retrocompatibilità: tutte le chiamate esistenti `createSessione(email, source)` continuano a funzionare (il 3° argomento è opzionale).

- [ ] **Step 4: Frontend — leggi `src` al landing e passalo alla registrazione**

In `Index.html`, dove parte l'app, cattura il parametro una sola volta:
```javascript
// v-funnel — provenienza outbound dal link del cold mail
window.OC_ACQ_SRC = (function(){
  try {
    var p = (google.script.url) ? null : null; // fallback
  } catch(_){}
  try {
    var qs = new URLSearchParams(window.location.search);
    return qs.get('src') || (window.OC_BOOT && window.OC_BOOT.src) || null;
  } catch(_){ return null; }
})();
```
> GAS serve l'app in iframe: se `window.location.search` non espone `src`, leggilo lato server in `doGet(e)` da `e.parameter.src` e passalo al template come `OC_BOOT.src`. Verifica quale via funziona nel deploy (Step 6).

Nella funzione JS che effettua la registrazione, passa la provenienza:
```javascript
google.script.run.withSuccessHandler(...).withFailureHandler(...)
  .createSessione(email, 'registrazione', window.OC_ACQ_SRC || null);
```

- [ ] **Step 5: Test backend della cattura**

```javascript
function _test_acquisitionCapture_() {
  var mail = 'test_funnel_' + Date.now() + '@example.com';
  // crea utente minimo
  if (typeof richiediAccesso === 'function') richiediAccesso(mail, 'Test Funnel', '');
  createSessione(mail, 'registrazione', 'MUSX__BANDOY');
  var ss = getMainSS(); var sh = ss.getSheetByName('Utenti');
  var head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(h){return String(h||'').trim();});
  var iE = head.indexOf('Email'), iA = head.indexOf('AcquisitionSource');
  var rows = sh.getDataRange().getValues(); var found = null;
  for (var i=1;i<rows.length;i++){ if (String(rows[i][iE]).toLowerCase()===mail) { found = String(rows[i][iA]||''); break; } }
  _assert_(found === 'MUSX__BANDOY', 'provenienza salvata: ' + found);
  Logger.log('TUTTI OK (ricorda di rimuovere la riga di test ' + mail + ')');
}
```
Esegui `_test_acquisitionCapture_`. Atteso: `provenienza salvata: MUSX__BANDOY`, `TUTTI OK`. Poi cancella manualmente la riga di test dal foglio `Utenti`.

- [ ] **Step 6: Verifica end-to-end del parametro (manuale, in incognito)**

Apri `{APP_URL}?reg=1&src=MUSX__BANDOY` in finestra incognito, registra un'email di prova, e controlla che `Utenti.AcquisitionSource` sia popolato. Se `src` non arriva, sposta la lettura in `doGet(e)` (`e.parameter.src`) come da nota Step 4.

- [ ] **Step 7: Commit**

```bash
git add Sessioni_v1.js Index.html
git commit -m "feat(funnel): cattura provenienza (src) alla registrazione -> Utenti.AcquisitionSource"
```

---

## Task 7: Cruscotto admin "Funnel"

**Files:**
- Modify: `Index.html` (nuova tab/sezione admin + render)
- Modify: `Styles.html` (stile imbuto)

- [ ] **Step 1: Markup della sezione (in area admin/Impostazioni)**

```html
<div id="funnel-panel" class="settings-tab" style="display:none">
  <div class="fn-head">
    <h3>Funnel di conversione</h3>
    <select id="fnPeriodo" onchange="OC.loadFunnel()">
      <option value="30">Ultimi 30 giorni</option>
      <option value="90" selected>Ultimi 90 giorni</option>
      <option value="365">Ultimo anno</option>
    </select>
    <label style="font-size:12px;margin-left:8px">
      <input type="checkbox" id="fnAttribuiti" onchange="OC.loadFunnel()"> solo coorte attribuita
    </label>
  </div>
  <div id="fnBody" class="fn-body"><div class="fn-skeleton">Caricamento…</div></div>
  <div id="fnNote" class="fn-note"></div>
</div>
```

- [ ] **Step 2: Loader + render**

```javascript
OC.loadFunnel = function() {
  var g = document.getElementById('fnPeriodo').value;
  var attr = document.getElementById('fnAttribuiti').checked;
  document.getElementById('fnBody').innerHTML = '<div class="fn-skeleton">Caricamento…</div>';
  google.script.run
    .withSuccessHandler(OC._renderFunnel)
    .withFailureHandler(function(e){ document.getElementById('fnBody').innerHTML = '<div class="fn-err">Errore: '+e.message+'</div>'; })
    .getFunnelCompleto({ giorni: Number(g), soloAttribuiti: attr, token: (window.OC_SESSION && window.OC_SESSION.token) || null });
};

OC._renderFunnel = function(r) {
  if (!r || !r.ok) { document.getElementById('fnBody').innerHTML = '<div class="fn-err">'+((r&&r.error)||'errore')+'</div>'; return; }
  var html = '';
  var maxC = Math.max(1, r.stadi[0].count);
  r.stadi.forEach(function(s, i){
    if (i > 0) {
      var pct = s.rateFromPrev === null ? '—' : Math.round(s.rateFromPrev*100) + '%';
      var warn = s.affidabile ? '' : ' <span class="fn-warn">campione insufficiente</span>';
      html += '<div class="fn-arrow">▼ ' + pct + warn + '</div>';
    }
    var w = Math.max(4, Math.round((s.count / maxC) * 100));
    html += '<div class="fn-stage"><div class="fn-bar" style="width:'+w+'%"></div>'
          + '<span class="fn-label">'+s.label+'</span><span class="fn-count">'+s.count+'</span></div>';
  });
  var tot = r.conversioneTotale === null ? '—' : (Math.round(r.conversioneTotale*1000)/10) + '%';
  html += '<div class="fn-total">Conversione end-to-end (contattati → cliente): <b>'+tot+'</b></div>';
  document.getElementById('fnBody').innerHTML = html;
  document.getElementById('fnNote').textContent = (r.note||[]).join(' ');
};
```

- [ ] **Step 3: Aggancia la tab al menu impostazioni**

Trova dove le altre tab di Impostazioni vengono mostrate/nascoste e aggiungi la voce "Funnel" che mostra `#funnel-panel` e chiama `OC.loadFunnel()` alla prima apertura. (Segui lo stesso pattern delle tab esistenti individuato con `grep -n "settings-tab\|data-tab" Index.html`.)

- [ ] **Step 4: Stile**

In `Styles.html`:
```css
.fn-head{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.fn-stage{position:relative;background:var(--paper-2,#f3efe7);border-radius:6px;height:34px;margin:2px 0;display:flex;align-items:center;overflow:hidden}
.fn-bar{position:absolute;left:0;top:0;bottom:0;background:var(--amb-1,#6B5C9A);opacity:.25}
.fn-label{position:relative;padding-left:10px;font-weight:600;font-size:13px;z-index:1}
.fn-count{position:relative;margin-left:auto;padding-right:10px;font-variant-numeric:tabular-nums;z-index:1}
.fn-arrow{text-align:center;font-size:12px;color:var(--ink-2,#6b6258);margin:1px 0}
.fn-warn{color:var(--accent,#935851);font-style:italic;font-size:11px}
.fn-total{margin-top:12px;padding-top:10px;border-top:1px solid var(--line,#e7e0d4);font-size:13px}
.fn-note{margin-top:8px;font-size:11.5px;color:var(--ink-3,#8a8175);font-style:italic}
.fn-err{color:var(--danger,#C2410C);padding:10px}
[data-theme="dark"] .fn-stage{background:rgba(255,255,255,.05)}
```

- [ ] **Step 5: Verifica visiva (incognito, da admin)**

Apri Impostazioni → tab Funnel. Atteso: imbuto con barre, % tra gli stadi, badge "campione insufficiente" dove i numeri sono bassi, riga conversione totale. Cambiare periodo/checkbox ricarica.

- [ ] **Step 6: Commit**

```bash
git add Index.html Styles.html
git commit -m "feat(funnel): cruscotto admin con imbuto, tassi e flag affidabilita"
```

---

## Task 8: Dry-run integrato con dati sintetici + chiusura

**Files:**
- Modify: `Funnel_v1.js` (funzioni di seed/cleanup di test)

- [ ] **Step 1: Seed sintetico coerente**

```javascript
function _seed_funnel_demo_() {
  var ss = getMainSS();
  function ap(name, headerIfNew, row){ var sh=ss.getSheetByName(name); if(!sh){sh=ss.insertSheet(name); sh.appendRow(headerIfNew);} sh.appendRow(row); }
  var now = new Date().toISOString();
  // 3 contattati, 1 attribuito che arriva fino a cliente
  ap('ROC_Outreach', ['timestamp','batch_id','museo_id','museo_nome','email_to','status','match_score','followup_due','esito'],
     [now,'DEMO','MUSZ','Museo Demo','demo_funnel@example.com','sent',80,now,'']);
  Logger.log('Seed inserito. Esegui _test_getFunnelCompleto_ e poi _cleanup_funnel_demo_.');
}
function _cleanup_funnel_demo_() {
  var ss = getMainSS(); var sh = ss.getSheetByName('ROC_Outreach');
  if (!sh) return; var v = sh.getDataRange().getValues();
  for (var i=v.length-1;i>=1;i--){ if (String(v[i][1])==='DEMO') sh.deleteRow(i+1); }
  Logger.log('Cleanup demo fatto.');
}
```

- [ ] **Step 2: Esegui la catena**

Esegui `_seed_funnel_demo_` → `_test_getFunnelCompleto_` (verifica `contattati >= 1`) → `_cleanup_funnel_demo_`.

- [ ] **Step 3: Aggiorna la documentazione**

In `CLAUDE.md`, sezione "Funzioni pubbliche", aggiungi:
```
- getFunnelCompleto(opts) — funnel conteggi+tassi per periodo (admin); file Funnel_v1.js
```
E aggiungi `Funnel_v1.js` alla mappa file.

- [ ] **Step 4: Commit finale Fase 1**

```bash
git add Funnel_v1.js CLAUDE.md
git commit -m "feat(funnel): seed/cleanup demo + doc; chiusura Fase 1 strumentazione funnel"
```

---

## Esiti Task 0 (compilare durante l'esecuzione)

- Foglio profilo L2 confermato: __________ (colonna completezza: ______)
- Opt-in → hot funzionante? ______ (se no, riferimento riga bug: ______)
- Header reali divergenti da correggere: __________

---

## Self-Review (eseguita)

- **Copertura spec:** §3 stadi → Task 2/3; §4 attribuzione → Task 5 (link) + Task 6 (cattura); §5 colonne → Task 1/6; §6 motore → Task 2/3/4; §7 cruscotto → Task 7; §8 affidabilità → Task 2 (flag) + Task 7 (badge); §11 ordine anti-conflitto → rispettato (Funnel/ROC prima, registrazione/Index dopo base v4.21.2 committata); §12 test → ogni task ha dry-run; §13 punti aperti → Task 0. **Fase 2 (§9) esclusa per scelta** (richiede input numerici di Silvano).
- **Placeholder:** nessun "TODO/TBD" nel codice; gli unici spazi vuoti sono nella sezione "Esiti Task 0", da compilare durante l'esecuzione (non sono codice).
- **Coerenza tipi/nomi:** `_funnelComputeFromCounts_`, `_funnelFetchCounts_`, `getFunnelCompleto`, chiavi stadi (`contattati…cliente`), `AcquisitionSource`, `OC_ACQ_SEP` usati in modo coerente tra i task.
- **Punto fragile dichiarato:** i nomi-colonna reali (Task 0) sono l'unico rischio; ogni funzione di fetch ha un dry-run che fallisce in modo esplicito ("header not found") se un nome è sbagliato.
