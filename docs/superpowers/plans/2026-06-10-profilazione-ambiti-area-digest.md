# Profilazione ambiti nell'area + digest generalista filtrato — Piano di intervento

> **Per chi esegue:** ambiente Google Apps Script (no framework di test). La "verifica" di ogni task = `node --check` sul file + deploy via `sync-oc-to-gas.ps1` + controllo nel browser/funzione diagnostica. Gli step usano checkbox `- [ ]`.

**Goal:** Trasformare la selezione degli ambiti in una leva di personalizzazione reale: il lettore sceglie i suoi ambiti dall'area "La tua area" (con prompt finché non profila), e — se NON ha fatto il Matrix — riceve la newsletter generalista **filtrata** su quegli ambiti. Se ha fatto il Matrix, vince il digest sui 3 gap (invariato).

**Architecture:** Le 10 dimensioni Matrix restano la "lingua comune". I 5 ambiti pubblici mappano alle dimensioni via `OC_AMBITI[].matrixDims` (Constants.js). Il profilo continua a memorizzare `interessi_dimensioni` (D1–D10); i 5 ambiti sono una vista semplificata sopra le dimensioni. Il filtro del digest avviene per **Ambito** (1–5), campo già presente sui contenuti.

**Tech Stack:** GAS V8 (.js) + HTML Service (Index.html) + Google Sheets. Deploy: `sync-oc-to-gas.ps1`.

**Decisioni bloccate (dal committente):**
- Sidebar invariata: "Il mio profilo", "Valuta il tuo museo" (Matrix), "Autovalutazione rapida", accordion 5 ambiti → restano. Nulla rimosso.
- "La tua area" guadagna: prompt "completa il profilo" (finché vuoto, non bloccante) + chip ambiti modificabili.
- Profilazione = profilo completo (resta in "Il mio profilo" per l'editing pieno; i chip nell'area sono la scorciatoia sui 5 ambiti).
- Digest: solo-ambiti → generalista **filtrata**; **Matrix prevale** se entrambi.

---

## File toccati

| File | Responsabilità | Modifica |
|---|---|---|
| `Constants.js` | mapping ambiti↔dimensioni già presente (`OC_AMBITI[].matrixDims`) | + helper `ambitiFromDims()` / `dimsFromAmbiti()` |
| `ProfiloPro_v1.js` | profilo + sync interessi | + `setAmbitoInteresse(ambito,on,token)` (toggle rapido) + esporre interessi |
| `Sessioni_v1.js` | `getUserWorkspaceData` | + `out.profilo.ambitiInteresse` nel payload area |
| `DigestService.js` | `buildDigestHTML` | + 4° parametro `filterAmbiti` (filtra sezioni) |
| `Digest_routing.js` | coorti + invio | attacca `ambiti` ai generalisti + passa a `buildDigestHTML` |
| `Index.html` | render area + chip | prompt + chip ambiti in `renderWorkspacePage` + `OC.toggleAmbitoInteresse` |

---

## Task 1 — Helper mapping ambiti ↔ dimensioni (Constants.js)

**Files:**
- Modify: `Constants.js` (in fondo, dopo `OC_AMBITI`)

- [ ] **Step 1: aggiungere i due helper**

In coda a `Constants.js` (dopo la definizione di `OC_AMBITI`):

```javascript
/**
 * v4.24 — Mapping ambiti (1-5) <-> dimensioni Matrix (D1-D10), data-driven da OC_AMBITI.
 * ambitiFromDims('D7,D9') -> [2,5]   (ambiti che contengono almeno una di quelle dim)
 * dimsFromAmbiti([2,5])   -> ['D7','D6','D9']  (dim degli ambiti indicati)
 */
function ambitiFromDims(dimsCsv) {
  var dims = (typeof dimsCsv === 'string' ? dimsCsv.split(',') : (dimsCsv || []))
    .map(function(d){ return String(d).trim().toUpperCase(); }).filter(Boolean);
  if (!dims.length || typeof OC_AMBITI === 'undefined') return [];
  var out = [];
  OC_AMBITI.forEach(function(a){
    var hit = (a.matrixDims || []).some(function(d){ return dims.indexOf(String(d).toUpperCase()) >= 0; });
    if (hit) out.push(a.id);
  });
  return out;
}

function dimsFromAmbiti(ambiti) {
  ambiti = (ambiti || []).map(function(x){ return Number(x); });
  if (typeof OC_AMBITI === 'undefined') return [];
  var set = {};
  OC_AMBITI.forEach(function(a){
    if (ambiti.indexOf(a.id) >= 0) (a.matrixDims || []).forEach(function(d){ set[String(d).toUpperCase()] = true; });
  });
  return Object.keys(set);
}
```

- [ ] **Step 2: verifica sintassi**

Run: `node --check Constants.js`
Expected: nessun errore.

- [ ] **Step 3: commit**

```bash
git add Constants.js
git commit -m "feat(constants): helper ambitiFromDims / dimsFromAmbiti"
```

---

## Task 2 — `buildDigestHTML` accetta un filtro per ambiti (DigestService.js)

**Files:**
- Modify: `DigestService.js:180` (`function buildDigestHTML`) e il loop `for(let a=1;a<=5;a++)` a `:193`

- [ ] **Step 1: aggiungere il 4° parametro e il filtro**

Cambiare la firma (riga 180):

```javascript
function buildDigestHTML(items, dest, readerUrl, filterAmbiti) {
```

Subito dopo `const grouped={1:[],2:[],3:[],4:[],5:[]};` (riga 190) aggiungere:

```javascript
  // v4.24 — Filtro per ambiti scelti dal lettore (solo-ambiti, no Matrix). Vuoto/assente = tutti i 5.
  var _ambitiSet = (Array.isArray(filterAmbiti) && filterAmbiti.length)
    ? filterAmbiti.reduce(function(m,n){ m[Number(n)] = true; return m; }, {})
    : null;
```

Nel loop, cambiare la prima riga del corpo (riga 194) da:

```javascript
    if(!grouped[a].length) continue;
```

a:

```javascript
    if(!grouped[a].length) continue;
    if(_ambitiSet && !_ambitiSet[a]) continue;   // v4.24 — salta ambiti non scelti
```

> Backward-compatible: chi chiama `buildDigestHTML(items, dest, readerUrl)` senza 4° parametro vede tutti i 5 ambiti come prima.

- [ ] **Step 2: verifica sintassi**

Run: `node --check DigestService.js`
Expected: nessun errore.

- [ ] **Step 3: commit**

```bash
git add DigestService.js
git commit -m "feat(digest): buildDigestHTML supporta filtro per ambiti"
```

---

## Task 3 — Attaccare gli ambiti scelti ai generalisti e passarli all'invio (Digest_routing.js)

**Files:**
- Modify: `Digest_routing.js` — blocco coorte A in `getDigestRecipientsByCohort` (sezione E, ~riga 150) e loop invio in `sendDigestAuto2coorti:255-268`

- [ ] **Step 1: leggere gli interessi del generalista e calcolarne gli ambiti**

Nella sezione E (coorte A / MailingList) di `getDigestRecipientsByCohort`, dove ogni generalista viene messo in `generalisti.push({...})`, arricchire l'oggetto con gli ambiti. Subito **prima** del `return { ok:true, generalisti:..., leadCaldi:... }`, aggiungere un arricchimento via ContactsMatrix:

```javascript
    // v4.24 — Arricchisci i generalisti con gli ambiti di interesse (da ContactsMatrix.preferences_json.dimensioni)
    try {
      var shCpref = ss.getSheetByName('ContactsMatrix');
      if (shCpref && shCpref.getLastRow() > 1) {
        var cpVals = shCpref.getDataRange().getValues();
        var cpH = cpVals[0];
        var iCpEm = cpH.indexOf('email'), iCpPref = cpH.indexOf('preferences_json');
        var prefByEmail = {};
        if (iCpEm >= 0 && iCpPref >= 0) {
          for (var rcp = 1; rcp < cpVals.length; rcp++) {
            var emCp = String(cpVals[rcp][iCpEm] || '').trim().toLowerCase();
            if (!emCp) continue;
            var prefObj = {};
            try { prefObj = cpVals[rcp][iCpPref] ? JSON.parse(cpVals[rcp][iCpPref]) : {}; } catch(_){}
            if (prefObj && prefObj.dimensioni) prefByEmail[emCp] = prefObj.dimensioni;
          }
        }
        generalisti.forEach(function(g){
          var dimsG = prefByEmail[String(g.email).toLowerCase()];
          g.ambiti = (dimsG && typeof ambitiFromDims === 'function') ? ambitiFromDims(dimsG) : [];
        });
      }
    } catch(ePref) { Logger.log('coorte A ambiti enrich: ' + ePref.message); }
```

> Se un generalista non ha interessi salvati, `g.ambiti = []` → digest pieno (5 ambiti), comportamento attuale.

- [ ] **Step 2: passare gli ambiti a `buildDigestHTML` nell'invio coorte A**

In `sendDigestAuto2coorti`, riga 263, cambiare:

```javascript
          var html = buildDigestHTML(items, { Nome: dest.nome, Email: dest.email }, readerUrl);
```

in:

```javascript
          var html = buildDigestHTML(items, { Nome: dest.nome, Email: dest.email }, readerUrl, dest.ambiti || []);
```

- [ ] **Step 3: verifica sintassi**

Run: `node --check Digest_routing.js`
Expected: nessun errore.

- [ ] **Step 4: commit**

```bash
git add Digest_routing.js
git commit -m "feat(digest): generalista filtrata sugli ambiti scelti dal lettore"
```

---

## Task 4 — Toggle rapido di un ambito + esporre gli interessi (ProfiloPro_v1.js)

**Files:**
- Modify: `ProfiloPro_v1.js` — aggiungere `setAmbitoInteresse` e `getAmbitiInteresse`

- [ ] **Step 1: funzione toggle (accende/spegne un ambito = aggiunge/rimuove le sue dimensioni)**

In coda a `ProfiloPro_v1.js`:

```javascript
/**
 * v4.24 — Toggle rapido di un ambito dai chip dell'area. Accende/spegne tutte le dim dell'ambito.
 * Richiede sessione valida (livello >= 1).
 */
function setAmbitoInteresse(ambito, on, token) {
  try {
    var u = (typeof getRuoloCorrente === 'function') ? getRuoloCorrente(token || null, token || null) : null;
    if (!u || !u.email || Number(u.livello) < 1) return { ok:false, error:'forbidden' };
    var email = String(u.email).toLowerCase().trim();
    var ss = getMainSS();
    var sh = ss.getSheetByName(PROFILO_PRO_SHEET);
    if (!sh) { ensureSheetProfiliPro_(); sh = ss.getSheetByName(PROFILO_PRO_SHEET); }
    var data = sh.getDataRange().getValues();
    var h = data[0];
    var iEmail = h.indexOf('email'), iInt = h.indexOf('interessi_dimensioni'), iCons = h.indexOf('consenso_profilazione');
    var ambDims = (typeof dimsFromAmbiti === 'function') ? dimsFromAmbiti([Number(ambito)]) : [];
    if (!ambDims.length) return { ok:false, error:'ambito_non_valido' };
    var rowIdx = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][iEmail]).toLowerCase().trim() === email) { rowIdx = r; break; }
    }
    var cur = (rowIdx >= 0) ? String(data[rowIdx][iInt] || '').split(',').map(function(s){return s.trim();}).filter(Boolean) : [];
    var set = cur.reduce(function(m,d){ m[d.toUpperCase()] = true; return m; }, {});
    ambDims.forEach(function(d){ if (on) set[d.toUpperCase()] = true; else delete set[d.toUpperCase()]; });
    var newCsv = Object.keys(set).join(',');
    if (rowIdx >= 0) {
      sh.getRange(rowIdx+1, iInt+1).setValue(newCsv);
    } else {
      // Nessun profilo: crea riga minima con consenso (il toggle implica consenso esplicito dall'area)
      var pid = Utilities.getUuid(); var now = new Date().toISOString();
      var rowData = new Array(h.length).fill('');
      rowData[h.indexOf('profileId')] = pid; rowData[iEmail] = email; rowData[iInt] = newCsv;
      if (iCons >= 0) rowData[iCons] = true;
      sh.appendRow(rowData);
    }
    if (typeof _proSyncOptIn_ === 'function') _proSyncOptIn_(email, newCsv);
    return { ok:true, ambito:Number(ambito), on:!!on, ambiti:(typeof ambitiFromDims==='function'?ambitiFromDims(newCsv):[]) };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

/** v4.24 — Ritorna gli ambiti di interesse correnti dell'utente (per i chip dell'area). */
function getAmbitiInteresse(token) {
  try {
    var u = (typeof getRuoloCorrente === 'function') ? getRuoloCorrente(token || null, token || null) : null;
    if (!u || !u.email) return { ok:true, ambiti:[] };
    var ex = _proFindByEmail_(String(u.email).toLowerCase().trim());
    var dims = ex ? (ex.interessi_dimensioni || '') : '';
    return { ok:true, ambiti:(typeof ambitiFromDims==='function'?ambitiFromDims(dims):[]) };
  } catch(e) { return { ok:false, error:e.message }; }
}
```

> NB: verificare il nome esatto della costante foglio (`PROFILO_PRO_SHEET`) e dell'helper `_proFindByEmail_` in cima a `ProfiloPro_v1.js`; sono già usati in `saveProfilo`.

- [ ] **Step 2: verifica sintassi**

Run: `node --check ProfiloPro_v1.js`
Expected: nessun errore.

- [ ] **Step 3: commit**

```bash
git add ProfiloPro_v1.js
git commit -m "feat(profilo): setAmbitoInteresse + getAmbitiInteresse per i chip dell'area"
```

---

## Task 5 — Esporre gli ambiti nel payload dell'area (Sessioni_v1.js)

**Files:**
- Modify: `Sessioni_v1.js` — `getUserWorkspaceData`, sezione profilo (vicino a dove popola `out.profilo`)

- [ ] **Step 1: aggiungere gli ambiti di interesse al payload**

Dentro `getUserWorkspaceData`, dopo che `out.profilo` è valorizzato (e comunque prima del `return out;`), aggiungere:

```javascript
    // v4.24 — Ambiti di interesse correnti (per prompt + chip nell'area)
    try {
      out.profilo = out.profilo || {};
      var _ai = (typeof getAmbitiInteresse === 'function') ? getAmbitiInteresse(token) : null;
      out.profilo.ambitiInteresse = (_ai && _ai.ok) ? _ai.ambiti : [];
    } catch(eAI) { out.profilo.ambitiInteresse = []; }
```

- [ ] **Step 2: verifica sintassi**

Run: `node --check Sessioni_v1.js`
Expected: nessun errore.

- [ ] **Step 3: commit**

```bash
git add Sessioni_v1.js
git commit -m "feat(area): esporre ambitiInteresse nel payload workspace"
```

---

## Task 6 — Prompt profilo + chip ambiti in "La tua area" (Index.html)

**Files:**
- Modify: `Index.html` — `renderWorkspacePage` (riga 3584, subito dopo `var html = '';`) + API pubblica `OC` (aggiungere `toggleAmbitoInteresse`)

- [ ] **Step 1: inserire il selettore ambiti COMPILABILE INLINE in cima all'area**

> v4.24.1 — Scelta del committente: il "test ambiti" si compila **dentro l'area**, non con un link che porta fuori. Il selettore è SEMPRE mostrato e compilabile sul posto. Quando è vuoto, headline più incisiva (invito); quando è pieno, mostra lo stato modificabile. Niente navigazione.

In `renderWorkspacePage`, subito dopo `var html = '';` (riga 3584) inserire:

```javascript
    // v4.24.1 — Selettore ambiti SEMPRE compilabile inline nell'area (no link-out).
    var _ambSel = (data.profilo && data.profilo.ambitiInteresse) ? data.profilo.ambitiInteresse : [];
    var _vuoto = !_ambSel.length;
    var _AMB = [
      {id:1,n:'Identità museale'},{id:2,n:'Inclusione e accessibilità'},
      {id:3,n:'Mostre e collezioni'},{id:4,n:'Comunità e welfare'},{id:5,n:'Digital, AI e gov.'}
    ];
    html += '<div id="wsAmbitiCard" style="background:' + (_vuoto ? '#F3E6E2;border:1px solid #935851' : 'var(--surface-2,#F1EEE7);border:1px solid var(--rule,#E5E5E7)') + ';border-radius:12px;padding:18px 22px;margin:0 0 22px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px">';
    html += '<div style="font-weight:700;font-size:15px;color:' + (_vuoto ? '#8B3A1F' : 'var(--ink)') + '">' + (_vuoto ? 'Scegli i tuoi ambiti di interesse' : 'I tuoi ambiti di interesse') + '</div>';
    html += '<a href="#" onclick="OC.go(\'profilo-pro\');return false" style="font-size:12px;color:var(--accent,#935851);font-weight:600">Profilo professionale completo &rarr;</a>';
    html += '</div>';
    html += '<div style="font-size:12.5px;color:' + (_vuoto ? '#7A4A40' : 'var(--ink-3)') + ';line-height:1.5;margin-bottom:12px">' + (_vuoto ? 'Tocca gli ambiti che ti interessano: riceverai un digest su misura invece della newsletter generale. Bastano pochi secondi, qui.' : 'Tocca un ambito per attivarlo/disattivarlo. Il digest si adatta.') + '</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    _AMB.forEach(function(a){
      var on = _ambSel.indexOf(a.id) >= 0;
      html += '<button type="button" onclick="OC.toggleAmbitoInteresse(' + a.id + ',this)" data-amb="' + a.id + '" data-on="' + (on?'1':'0') + '" '
        + 'style="cursor:pointer;border-radius:999px;padding:7px 15px;font-size:12.5px;font-weight:600;transition:all .15s;'
        + (on ? 'background:var(--accent,#935851);color:#fff;border:1px solid var(--accent,#935851)' : 'background:#fff;color:var(--ink-2,#3A3A3C);border:1px solid var(--rule,#D9D4CA)') + '">'
        + (on ? '✓ ' : '') + esc(a.n) + '</button>';
    });
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--ink-3);margin-top:10px">Se hai completato il Matrix, resta prioritario il digest sui tuoi 3 gap.</div>';
    html += '</div>';
```

> Il `data-on` è già impostato qui in base allo stato iniziale, coerente con `OC.toggleAmbitoInteresse` (Step 2).

- [ ] **Step 2: aggiungere `OC.toggleAmbitoInteresse`**

Vicino agli altri metodi `OC.*` (es. dopo `OC.loadProfiloPro`), aggiungere:

```javascript
  OC.toggleAmbitoInteresse = function(ambito, btnEl) {
    if (typeof google === 'undefined' || !google.script) return;
    var on = !(btnEl && btnEl.getAttribute('data-on') === '1');
    // feedback ottimistico
    if (btnEl) {
      btnEl.setAttribute('data-on', on ? '1' : '0');
      btnEl.style.background = on ? 'var(--accent,#935851)' : '#fff';
      btnEl.style.color = on ? '#fff' : 'var(--ink-2,#3A3A3C)';
      btnEl.style.borderColor = on ? 'var(--accent,#935851)' : 'var(--rule,#D9D4CA)';
    }
    google.script.run
      .withSuccessHandler(function(r){
        if (r && r.ok && typeof showToast === 'function') showToast(on ? 'Ambito attivato' : 'Ambito disattivato', 'ok');
        else if (r && !r.ok && typeof showToast === 'function') showToast('Errore: ' + (r.error||''), 'err');
      })
      .withFailureHandler(function(e){ if (typeof showToast === 'function') showToast('Errore di rete', 'err'); })
      .setAmbitoInteresse(ambito, on, (window.OC_SESSION && window.OC_SESSION.token) || null);
  };
```

> Nota: lo Step 1 imposta già `data-on` su ogni chip in base allo stato iniziale; `toggleAmbitoInteresse` lo legge e lo inverte. Nessuna aggiunta necessaria.

- [ ] **Step 3: verifica (no node --check su .html — è HTML+JS inline)**

Verifica manuale: aprire l'app, `Ctrl+Shift+R`, andare in "La tua area".
- Profilo vuoto → compare il prompt "Personalizza i tuoi contenuti".
- Dopo aver scelto ambiti (dal profilo o dai chip) → compaiono i 5 chip, quelli scelti evidenziati; toccandoli cambiano stato e arriva il toast.

- [ ] **Step 4: commit**

```bash
git add Index.html
git commit -m "feat(area): prompt profilazione + chip ambiti modificabili in La tua area"
```

---

## Task 7 — Deploy, bump versione e verifica end-to-end

- [ ] **Step 1: bump versione** in `Constants.js`: `OC_VERSION` → `v4.24.0`; prependere nota a `OC_VERSION_NOTES` (riassunto: profilazione ambiti nell'area + generalista filtrata; Matrix prevale).

- [ ] **Step 2: node --check** su tutti i `.js` toccati (Constants, DigestService, Digest_routing, ProfiloPro_v1, Sessioni_v1).

- [ ] **Step 3: deploy**

```
cd "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\musemu matrix"; .\sync-oc-to-gas.ps1
```

- [ ] **Step 4: verifica end-to-end**
  1. In "La tua area" (lettore senza Matrix): prompt visibile → completo profilo con 1 ambito → chip mostrato attivo.
  2. Admin → Digest → "Anteprima digest per email": inserire l'email del lettore → l'anteprima generalista mostra **solo** le sezioni degli ambiti scelti.
  3. Lettore con Matrix: anteprima resta il digest sui 3 gap (Matrix prevale).

- [ ] **Step 5: commit finale + push**

```bash
git add Constants.js
git commit -m "release: profilazione ambiti area + generalista filtrata (v4.24.0)"
git push origin feat/fonti-feed-unificazione
```

---

## Self-review (coperture)
- Selettore ambiti **compilabile inline** nell'area (sempre visibile; stato vuoto = invito incisivo, niente link-out) → Task 6 Step 1. ✓
- Chip modificabili dal cruscotto → Task 6 (chip + `toggleAmbitoInteresse`) + Task 4 (`setAmbitoInteresse`). ✓
- Digest solo-ambiti = generalista filtrata → Task 2 + Task 3. ✓
- Matrix prevale → invariato: `sendDigestAuto2coorti` coorte B usa `generateDigestForUser` (gap) e la coorte A esclude chi è in B (logica esistente in `getDigestRecipientsByCohort`). ✓
- Sidebar invariata → nessun task la tocca. ✓
- "Il mio profilo" resta editing completo → invariato (Task 6 rimanda lì con "Modifica profilo completo"). ✓

## Rischi / note
- **Coorte A vs B**: un lettore che ha solo profilato ambiti (no Matrix, no prenotazione) deve stare in **coorte A** (generalisti) per ricevere la generalista filtrata. Verificare che profilare NON lo sposti in coorte B (oggi B = matrix_completato/prenotazione/responseId: profilare ambiti non setta nessuno dei tre → resta in A ✓). Da confermare in test.
- **Doppia fonte interessi**: `interessi_dimensioni` vive in `ProfiliPro`; il digest legge `ContactsMatrix.preferences_json.dimensioni` (sincronizzato da `_proSyncOptIn_`). Se un lettore non ha riga in `ContactsMatrix`, il sync non scrive nulla → `g.ambiti=[]` → digest pieno. Se in test risulta un problema, aggiungere fallback: leggere direttamente da `ProfiliPro` in Task 3.
