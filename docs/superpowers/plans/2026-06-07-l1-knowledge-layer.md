# L1 — Knowledge Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, modalità A) per implementare task-by-task. Steps con checkbox (`- [ ]`).

**Goal:** estrarre entità (persone, strutture, temi, progetti) e accumularle nel tempo dai contenuti già raccolti, in due fogli (`Entita`, `Occorrenze`), come fondamento per trend (L2), opinion leader (L3) ed editoriale (E1).

**Architecture:** un file nuovo `KnowledgeLayer_v1.js` con funzioni pure (normalizzazione, score) testabili in dry-run + funzioni di scrittura (upsert/append) + un backfill cost-aware. L'estrazione è **additiva** alle 3 chiamate Claude esistenti (agenti, news, bandi) e isolata in `kb_recordEntities_` (try/catch: non rompe mai lo scanner).

**Tech Stack:** Google Apps Script (V8), Google Sheets, Claude (via le chiamate esistenti). Deploy attuale **@495**.

**Spec:** `docs/superpowers/specs/2026-06-07-l1-knowledge-layer-design.md`.

---

## Flusso di verifica per OGNI task (👤 tu, in PowerShell + editor GAS)

Dopo che io scrivo il codice di un task:
1. **PowerShell**, dalla cartella `musemu matrix`:
   ```powershell
   .\sync-oc-to-gas.ps1
   ```
   (sincronizza `oc-codebase` e fa `clasp push` su GAS)
2. **Editor GAS** → seleziona la funzione di test del task (es. `_test_kb_normalize_`) → **Esegui** → controlla nel log: deve finire con `TUTTI OK`.
3. Niente deploy finché L1 non è completo. Quando lo faremo: Distribuisci → Gestisci distribuzioni → ✏️ sulla distribuzione **@495** → **Nuova versione** → Distribuisci (mai "+ Nuova distribuzione").

Helper di test (incluso nel file al Task 1):
```javascript
function _assert_(c, m){ if(!c) throw new Error('ASSERT FALLITO: '+m); Logger.log('  ok: '+m); }
```

---

## File Structure

| File | Stato | Responsabilità |
|---|---|---|
| `KnowledgeLayer_v1.js` | **nuovo** | costanti KB, fogli, normalizzazione, score, upsert/append, recordEntities, estrazione Claude per backfill, backfill, vista admin, test |
| `AgentScanner.js` | modifica | `entita[]` nel prompt/schema (AG1-6) + chiamata `kb_recordEntities_` |
| `Codice.js` (`processWithAI`) | modifica | idem per le news |
| `Bandi_v5.js` (`_estraiConClaudeV5_`) | modifica | idem per i bandi |
| `Index.html` | modifica minima | pannello admin "Entità" (Task 8, opzionale) |

---

## Task 1 — Costanti, fogli, helper di test

**Files:** Create `KnowledgeLayer_v1.js`

- [ ] **Step 1: crea il file con costanti, ensure-sheets, helper**

```javascript
// ============================================================================
// KnowledgeLayer_v1.js — L1: estrazione entità + temi (Fase 3)
// Vedi spec docs/superpowers/specs/2026-06-07-l1-knowledge-layer-design.md
// ============================================================================

var OC_KB_SHEETS = { entita: 'Entita', occorrenze: 'Occorrenze' };
var OC_KB_TIPI   = ['persona','struttura','tema','progetto'];
var OC_KB_PESI   = { occ: 40, fonti: 25, recency: 20, ambiti: 15 };
var OC_KB_BOOST_AUTOREVOLE = 1.15;
// chiavi normalizzate (parziali) delle fonti autorevoli
var OC_FONTI_AUTOREVOLI = ['symbola','fitzcarraldo','federculture','icom','nemo','mic','treccani','iccd'];
var OC_KB_BACKFILL_CAP = 80; // record per esecuzione backfill

var OC_KB_ENTITA_HEADER = ['id','chiave','nome_canonico','tipo','alias_json','ambiti_json',
  'n_occorrenze','fonti_json','n_fonti','prima_data','ultima_data','score_autorevolezza','stato','note'];
var OC_KB_OCC_HEADER = ['id','entita_id','contenuto_id','tipo_contenuto','titolo_contenuto',
  'data','ambito','fonte','fonte_autorevole'];

function _kb_ss_(){ return (typeof getMainSS==='function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet(); }

function kb_ensureSheets_(){
  var ss=_kb_ss_();
  if(!ss.getSheetByName(OC_KB_SHEETS.entita)){ ss.insertSheet(OC_KB_SHEETS.entita).appendRow(OC_KB_ENTITA_HEADER); }
  if(!ss.getSheetByName(OC_KB_SHEETS.occorrenze)){ ss.insertSheet(OC_KB_SHEETS.occorrenze).appendRow(OC_KB_OCC_HEADER); }
}

function _assert_(c,m){ if(!c) throw new Error('ASSERT FALLITO: '+m); Logger.log('  ok: '+m); }

function _test_kb_costanti_(){
  _assert_(OC_KB_TIPI.length===4,'4 tipi');
  kb_ensureSheets_();
  _assert_(_kb_ss_().getSheetByName('Entita')!==null,'foglio Entita creato');
  _assert_(_kb_ss_().getSheetByName('Occorrenze')!==null,'foglio Occorrenze creato');
  Logger.log('TUTTI OK');
}
```

- [ ] **Step 2: verifica** — esegui flusso di verifica → `_test_kb_costanti_` → atteso `TUTTI OK` + due fogli creati.
- [ ] **Step 3: commit**
```bash
git add KnowledgeLayer_v1.js
git commit -m "feat(L1): costanti knowledge layer + fogli Entita/Occorrenze"
```

---

## Task 2 — `kb_normalizeKey_` (pura, TDD)

**Files:** Modify `KnowledgeLayer_v1.js`

- [ ] **Step 1: test che fallisce**
```javascript
function _test_kb_normalize_(){
  _assert_(kb_normalizeKey_('ICOM Italia','struttura')==='icom italia','spazi/maiuscole');
  _assert_(kb_normalizeKey_('I.C.O.M.','struttura')==='icom','punteggiatura');
  _assert_(kb_normalizeKey_('Università','struttura')==='universita','accenti');
  _assert_(kb_normalizeKey_('  AI  nei   musei ','tema')==='ai nei musei','spazi multipli');
  Logger.log('TUTTI OK');
}
```
- [ ] **Step 2: esegui** → deve FALLIRE (funzione non definita).
- [ ] **Step 3: implementa**
```javascript
function kb_normalizeKey_(nome, tipo){
  var s=String(nome||'').toLowerCase();
  s=s.normalize('NFD').replace(/[̀-ͯ]/g,''); // accenti via
  s=s.replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  return s;
}
```
- [ ] **Step 4: esegui** → `TUTTI OK`.
- [ ] **Step 5: commit** `feat(L1): kb_normalizeKey_ (normalizzazione nomi)`

---

## Task 3 — Score autorevolezza + recency + fonte autorevole (pure, TDD)

**Files:** Modify `KnowledgeLayer_v1.js`

- [ ] **Step 1: test che fallisce**
```javascript
function _test_kb_score_(){
  var oggi=new Date().toISOString();
  var basso=kb_scoreAutorevolezza_({n_occorrenze:1,n_fonti:1,ultima_data:oggi,n_ambiti:1,has_autorevole:false});
  var alto =kb_scoreAutorevolezza_({n_occorrenze:25,n_fonti:6,ultima_data:oggi,n_ambiti:4,has_autorevole:false});
  _assert_(alto>basso,'più occorrenze/fonti/ambiti → score più alto');
  var conAut=kb_scoreAutorevolezza_({n_occorrenze:25,n_fonti:6,ultima_data:oggi,n_ambiti:4,has_autorevole:true});
  _assert_(conAut>alto,'fonte autorevole dà boost');
  _assert_(kb_scoreAutorevolezza_({n_occorrenze:0,n_fonti:0,ultima_data:'',n_ambiti:0})>=0,'mai NaN/negativo');
  _assert_(kb_fonteAutorevole_('Fondazione Symbola')===true,'riconosce Symbola');
  _assert_(kb_fonteAutorevole_('Blog personale')===false,'non autorevole');
  Logger.log('TUTTI OK');
}
```
- [ ] **Step 2: esegui** → FALLISCE.
- [ ] **Step 3: implementa**
```javascript
function kb_recency_(iso){
  if(!iso) return 0;
  var d=new Date(iso); if(isNaN(d.getTime())) return 0;
  var days=(new Date().getTime()-d.getTime())/86400000;
  if(days<=90) return 1;
  if(days>=365) return 0;
  return 1-(days-90)/275;
}
function kb_scoreAutorevolezza_(o){
  o=o||{};
  var occ=Math.min(1, Math.log(1+(Number(o.n_occorrenze)||0))/Math.log(31));
  var fonti=Math.min(1,(Number(o.n_fonti)||0)/8);
  var rec=kb_recency_(o.ultima_data);
  var amb=Math.min(1,(Number(o.n_ambiti)||0)/5);
  var base=OC_KB_PESI.occ*occ + OC_KB_PESI.fonti*fonti + OC_KB_PESI.recency*rec + OC_KB_PESI.ambiti*amb;
  if(o.has_autorevole) base*=OC_KB_BOOST_AUTOREVOLE;
  return Math.round(Math.min(100,base)*10)/10;
}
function kb_fonteAutorevole_(fonte){
  var f=kb_normalizeKey_(fonte,'');
  for(var i=0;i<OC_FONTI_AUTOREVOLI.length;i++){ if(f.indexOf(OC_FONTI_AUTOREVOLI[i])>=0) return true; }
  return false;
}
```
- [ ] **Step 4: esegui** → `TUTTI OK`.
- [ ] **Step 5: commit** `feat(L1): score autorevolezza + recency + fonte autorevole`

---

## Task 4 — Scrittura: upsert Entità + append Occorrenza + recordEntities

**Files:** Modify `KnowledgeLayer_v1.js`

- [ ] **Step 1: implementa gli helper di scrittura**
```javascript
function _kb_jsonSet_(raw, val){
  var a=[]; try{ a=JSON.parse(raw||'[]'); if(!Array.isArray(a)) a=[]; }catch(_){ a=[]; }
  if(val!==''&&val!=null&&a.indexOf(val)<0) a.push(val);
  return a;
}
function _kb_newId_(p){ return p+Date.now()+Math.floor(Math.random()*1000); }

function kb_upsertEntita_(e, meta, fa){
  var sh=_kb_ss_().getSheetByName(OC_KB_SHEETS.entita);
  var chiave=kb_normalizeKey_(e.nome,e.tipo); if(!chiave) return null;
  var vals=sh.getDataRange().getValues(), H=vals[0];
  var c=function(n){return H.indexOf(n);};
  var now=new Date().toISOString();
  for(var r=1;r<vals.length;r++){
    if(String(vals[r][c('chiave')])===chiave && String(vals[r][c('tipo')])===e.tipo){
      var alias=_kb_jsonSet_(vals[r][c('alias_json')],e.nome);
      var ambiti=_kb_jsonSet_(vals[r][c('ambiti_json')],meta.ambito);
      var fonti=_kb_jsonSet_(vals[r][c('fonti_json')],meta.fonte);
      var nocc=(Number(vals[r][c('n_occorrenze')])||0)+1;
      var score=kb_scoreAutorevolezza_({n_occorrenze:nocc,n_fonti:fonti.length,ultima_data:now,n_ambiti:ambiti.length,has_autorevole:fa});
      sh.getRange(r+1,c('alias_json')+1).setValue(JSON.stringify(alias));
      sh.getRange(r+1,c('ambiti_json')+1).setValue(JSON.stringify(ambiti));
      sh.getRange(r+1,c('fonti_json')+1).setValue(JSON.stringify(fonti));
      sh.getRange(r+1,c('n_occorrenze')+1).setValue(nocc);
      sh.getRange(r+1,c('n_fonti')+1).setValue(fonti.length);
      sh.getRange(r+1,c('ultima_data')+1).setValue(now);
      sh.getRange(r+1,c('score_autorevolezza')+1).setValue(score);
      return { id:String(vals[r][c('id')]), nuovo:false };
    }
  }
  var id=_kb_newId_('ENT');
  var ambiti0=(meta.ambito!==''&&meta.ambito!=null)?[meta.ambito]:[];
  var fonti0=meta.fonte?[meta.fonte]:[];
  var score0=kb_scoreAutorevolezza_({n_occorrenze:1,n_fonti:fonti0.length,ultima_data:now,n_ambiti:ambiti0.length,has_autorevole:fa});
  sh.appendRow([id,chiave,e.nome,e.tipo,JSON.stringify([e.nome]),JSON.stringify(ambiti0),1,JSON.stringify(fonti0),fonti0.length,now,now,score0,'auto','']);
  return { id:id, nuovo:true };
}

function kb_appendOccorrenza_(entitaId, e, meta, fa, dedup){
  var sh=_kb_ss_().getSheetByName(OC_KB_SHEETS.occorrenze);
  if(dedup){
    var v=sh.getDataRange().getValues(), H=v[0], iE=H.indexOf('entita_id'), iC=H.indexOf('contenuto_id');
    for(var r=1;r<v.length;r++){ if(String(v[r][iE])===entitaId && String(v[r][iC])===String(meta.contenuto_id)) return false; }
  }
  sh.appendRow([_kb_newId_('OCC'),entitaId,meta.contenuto_id||'',meta.tipo_contenuto||'',meta.titolo||'',meta.data||'',meta.ambito||'',meta.fonte||'',!!fa]);
  return true;
}

function kb_recordEntities_(entitaArray, meta){
  try{
    if(!entitaArray||!entitaArray.length) return {ok:true,n:0};
    kb_ensureSheets_();
    meta=meta||{}; var fa=kb_fonteAutorevole_(meta.fonte); var n=0;
    for(var i=0;i<entitaArray.length;i++){
      var e=entitaArray[i]; if(!e||!e.nome||!e.tipo||OC_KB_TIPI.indexOf(e.tipo)<0) continue;
      var ent=kb_upsertEntita_(e,meta,fa);
      if(ent){ kb_appendOccorrenza_(ent.id,e,meta,fa,!!meta.dedup); n++; }
    }
    return {ok:true,n:n};
  }catch(err){ Logger.log('[kb_recordEntities_] '+err.message); return {ok:false,error:err.message}; }
}
```

- [ ] **Step 2: test dry-run con dati sintetici**
```javascript
function _test_kb_record_(){
  kb_ensureSheets_();
  var meta1={contenuto_id:'T1',tipo_contenuto:'news',titolo:'Test',data:new Date().toISOString(),ambito:5,fonte:'Symbola'};
  kb_recordEntities_([{nome:'Mario Rossi',tipo:'persona',ruolo:'studioso'},{nome:'ICOM Italia',tipo:'struttura'}],meta1);
  var meta2={contenuto_id:'T2',tipo_contenuto:'podcast',titolo:'Test2',data:new Date().toISOString(),ambito:2,fonte:'Fitzcarraldo'};
  kb_recordEntities_([{nome:'Mario Rossi',tipo:'persona'}],meta2); // stessa persona, nuova menzione
  var sh=_kb_ss_().getSheetByName('Entita'); var vals=sh.getDataRange().getValues(); var H=vals[0];
  var found=null; for(var r=1;r<vals.length;r++){ if(String(vals[r][H.indexOf('chiave')])==='mario rossi'){found=vals[r];break;} }
  _assert_(found!==null,'entità Mario Rossi creata');
  _assert_(Number(found[H.indexOf('n_occorrenze')])===2,'2 occorrenze sommate (no duplicato entità)');
  _assert_(Number(found[H.indexOf('n_fonti')])===2,'2 fonti distinte');
  Logger.log('Pulisci le righe T1/T2 e mario rossi/icom italia dopo il test.');
  Logger.log('TUTTI OK');
}
```
- [ ] **Step 3: esegui** → `TUTTI OK` (poi rimuovi a mano le righe di test dai fogli).
- [ ] **Step 4: commit** `feat(L1): upsert entità + append occorrenza + recordEntities (con try/catch)`

---

## Task 5 — Vista admin `kb_getTopEntita_` (gated)

**Files:** Modify `KnowledgeLayer_v1.js`

- [ ] **Step 1: implementa**
```javascript
function kb_getTopEntita_(tipo, limite, token){
  if(typeof _isCurrentUserAdmin_==='function' && !_isCurrentUserAdmin_(token||null)) return {ok:false,error:'forbidden'};
  limite=limite||50;
  var sh=_kb_ss_().getSheetByName(OC_KB_SHEETS.entita);
  if(!sh||sh.getLastRow()<2) return {ok:true,entita:[]};
  var vals=sh.getDataRange().getValues(),H=vals[0],c=function(n){return H.indexOf(n);};
  var out=[];
  for(var r=1;r<vals.length;r++){
    if(String(vals[r][c('stato')]).indexOf('unito_in')===0) continue;
    if(tipo && String(vals[r][c('tipo')])!==tipo) continue;
    out.push({nome:vals[r][c('nome_canonico')],tipo:vals[r][c('tipo')],
      n_occorrenze:Number(vals[r][c('n_occorrenze')])||0,n_fonti:Number(vals[r][c('n_fonti')])||0,
      ultima_data:vals[r][c('ultima_data')],score:Number(vals[r][c('score_autorevolezza')])||0});
  }
  out.sort(function(a,b){return b.score-a.score;});
  return {ok:true,entita:out.slice(0,limite)};
}
function getTopEntita(opts){ opts=opts||{}; return kb_getTopEntita_(opts.tipo||null,opts.limite||50,opts.token||null); }
```
- [ ] **Step 2: test**
```javascript
function _test_kb_top_(){
  var r=kb_getTopEntita_(null,10,null); // admin in editor
  _assert_(r.ok===true,'ok'); _assert_(Array.isArray(r.entita),'array');
  Logger.log(JSON.stringify(r.entita.slice(0,5))); Logger.log('TUTTI OK');
}
```
- [ ] **Step 3: esegui** → `TUTTI OK`.
- [ ] **Step 4: commit** `feat(L1): vista admin kb_getTopEntita_ + endpoint getTopEntita`

---

## Task 6 — Integrazione additiva nelle 3 estrazioni

**Files:** Modify `AgentScanner.js`, `Codice.js`, `Bandi_v5.js`

> Per ciascun sito: (a) **leggi la funzione attuale**, (b) aggiungi al prompt la richiesta `entita[]`, (c) dopo il parse, chiama l'helper. Snippet condiviso da aggiungere al prompt:

```
Inoltre estrai le ENTITÀ citate come array JSON "entita": [{ "nome": "...", "tipo": "...", "ruolo": "..." }]
tipo ∈ persona | struttura | tema | progetto.
persona = direttori, studiosi, autori, relatori; struttura = musei, fondazioni, enti, università, reti;
tema = argomenti/topic ricorrenti; progetto = mostre, programmi, progetti finanziati.
ruolo = breve (es. "direttore", "autore") o "". Max 12, solo entità realmente citate.
```

Chiamata helper da inserire dopo il parse del risultato Claude (con i campi reali del sito):
```javascript
try {
  if (typeof kb_recordEntities_ === 'function' && parsed && parsed.entita) {
    kb_recordEntities_(parsed.entita, {
      contenuto_id: <ID_REALE>, tipo_contenuto: '<bando|news|norma|pubblicazione|podcast|video>',
      titolo: <TITOLO>, data: <DATA_ISO>, ambito: <AMBITO_1_5>, fonte: <NOME_FONTE>
    });
  }
} catch(eKb){ Logger.log('[kb hook] '+eKb.message); }
```

- [ ] **Step 1: AgentScanner.js** — in `_agentExtractWithClaude_` (~703): aggiungi lo snippet al prompt e la chiamata helper dopo il parse (tipo_contenuto dal tipo estratto: `norma`→'norma', altrimenti 'news'/'bando' come da `tipo`). `contenuto_id`/`fonte`/`ambito` dai campi che la funzione già calcola.
- [ ] **Step 2: Codice.js** — in `processWithAI` (~2518): idem; `tipo_contenuto='news'`, `fonte` e `ambito` dai parametri dell'item.
- [ ] **Step 3: Bandi_v5.js** — in `_estraiConClaudeV5_` (~624): idem; `tipo_contenuto='bando'`, `fonte`/`ambito` dai campi del bando.
- [ ] **Step 4: verifica non-regressione** — `_test_kb_hook_robusto_`:
```javascript
function _test_kb_hook_robusto_(){
  var r=kb_recordEntities_(null,{}); _assert_(r.ok===true,'entita nulle: nessun errore');
  var r2=kb_recordEntities_([{nome:'X',tipo:'tipo_inesistente'}],{contenuto_id:'Z',fonte:'f',ambito:1});
  _assert_(r2.ok===true,'tipo non valido ignorato senza crash');
  Logger.log('TUTTI OK');
}
```
  Poi `sync` + esegui uno scan reale di un agente (o attendi il trigger) e controlla che `Entita`/`Occorrenze` si popolino e che lo scan **non** vada in errore.
- [ ] **Step 5: commit** `feat(L1): hook estrazione entità in agenti/news/bandi (additivo, protetto)`

---

## Task 7 — Backfill storico (cost-aware, idempotente)

**Files:** Modify `KnowledgeLayer_v1.js`

- [ ] **Step 1: estrazione entità da testo (per il backfill) + backfill**
```javascript
function _kb_extractEntitiesFromText_(titolo, sommario){
  // Riusa il modello/credenziali già usati dagli scanner. Se esiste un helper centrale (es. _agentCallClaude_), usalo.
  var prompt='Estrai le entità citate nel testo come SOLO JSON array "entita":[{"nome","tipo","ruolo"}], '+
    'tipo ∈ persona|struttura|tema|progetto. Testo:\n"'+String(titolo||'')+'. '+String(sommario||'')+'"';
  try{
    var raw=(typeof _agentCallClaude_==='function')?_agentCallClaude_(prompt,800):null; // adatta al nome reale
    if(!raw) return [];
    var m=raw.match(/\[[\s\S]*\]/); if(!m) return [];
    var arr=JSON.parse(m[0]); return Array.isArray(arr)?arr:[];
  }catch(_){ return []; }
}

function kb_backfill_(tipo_contenuto, cap){
  cap=cap||OC_KB_BACKFILL_CAP;
  var prop=PropertiesService.getScriptProperties(); var key='KB_BACKFILL_CUR_'+tipo_contenuto;
  var cur=Number(prop.getProperty(key)||'1');
  var cfg=_kb_backfillSource_(tipo_contenuto); if(!cfg) return {ok:false,error:'tipo non gestito'};
  var sh=_kb_ss_().getSheetByName(cfg.foglio); if(!sh||sh.getLastRow()<2) return {ok:true,processed:0,done:true};
  var vals=sh.getDataRange().getValues(),H=vals[0],c=function(n){return H.indexOf(n);};
  var done=0,r=cur;
  for(; r<vals.length && done<cap; r++){
    var titolo=vals[r][c(cfg.colTitolo)], sommario=vals[r][c(cfg.colSommario)]||'';
    var ent=_kb_extractEntitiesFromText_(titolo,sommario);
    kb_recordEntities_(ent,{contenuto_id:String(vals[r][c(cfg.colId)]),tipo_contenuto:tipo_contenuto,
      titolo:titolo,data:vals[r][c(cfg.colData)]||'',ambito:vals[r][c(cfg.colAmbito)]||'',fonte:vals[r][c(cfg.colFonte)]||'',dedup:true});
    done++;
  }
  prop.setProperty(key,String(r));
  return {ok:true,processed:done,prossima_riga:r,done:(r>=vals.length)};
}
// mappa colonne per foglio sorgente — adatta ai nomi reali (verificati in Task 0 della spec)
function _kb_backfillSource_(tipo){
  if(tipo==='news') return {foglio:'Items',colId:'ID',colTitolo:'Titolo',colSommario:'SommarioAI',colData:'DataPubblicazione',colAmbito:'Ambito',colFonte:'Fonte'};
  if(tipo==='bando') return {foglio:'AgentScanResults',colId:'id',colTitolo:'titolo',colSommario:'sommario',colData:'data',colAmbito:'ambito',colFonte:'fonte'};
  return null;
}
```
- [ ] **Step 2: test su pochi record**
```javascript
function _test_kb_backfill_(){
  var r=kb_backfill_('news',3);
  _assert_(r.ok===true,'backfill ok'); Logger.log(JSON.stringify(r)); Logger.log('TUTTI OK (verifica Entita/Occorrenze popolati)');
}
```
- [ ] **Step 3: esegui** su 3 record; poi, a regime, lancialo a lotti (cap 80) finché `done:true`.
- [ ] **Step 4: commit** `feat(L1): backfill storico cost-aware con cursore + idempotenza`

---

## Task 8 — Vista admin "Entità" (minima) + doc + chiusura

**Files:** Modify `Index.html`, `CLAUDE.md`

- [ ] **Step 1: Index.html** — aggiungi (riusando il pattern delle tab admin) una sezione `#kb-panel` che chiama `getTopEntita({tipo,limite,token})` e mostra una tabella (nome · tipo · n_occorrenze · n_fonti · score · ultima_data), con filtro per tipo. (Se preferisci, rimandabile: è solo visibilità.)
- [ ] **Step 2: CLAUDE.md** — aggiungi `KnowledgeLayer_v1.js` alla mappa file e `getTopEntita` alle funzioni pubbliche.
- [ ] **Step 3: deploy** — `sync-oc-to-gas.ps1` → editor GAS test finale → **deploy** (✏️ su @495 → Nuova versione → Distribuisci).
- [ ] **Step 4: commit** `feat(L1): vista admin Entità + doc; chiusura L1 knowledge layer`

---

## Self-Review (eseguita)

- **Copertura spec:** entità 4 tipi → Task 4/6; estrazione integrata → Task 6; normalizzazione+alias → Task 2/4; score+autorevolezza → Task 3; fogli Entita/Occorrenze → Task 1; backfill → Task 7; vista admin → Task 5/8; guardrail try/catch → Task 4/6 (`_test_kb_hook_robusto_`). `pubblicazione`/`fonte_autorevole` → header/score/hook coperti.
- **Placeholder:** nessun TODO nel codice; gli unici punti "adatta ai nomi reali" (Task 6 campi, Task 7 mappa colonne, nome `_agentCallClaude_`) sono **integrazioni da verificare sul codice esistente**, con i nomi attesi indicati — non placeholder logici.
- **Coerenza nomi:** `kb_recordEntities_`, `kb_upsertEntita_`, `kb_appendOccorrenza_`, `kb_normalizeKey_`, `kb_scoreAutorevolezza_`, `kb_fonteAutorevole_`, `kb_backfill_`, `kb_getTopEntita_`/`getTopEntita`, header `Entita`/`Occorrenze` usati in modo coerente tra i task.
- **Punto fragile dichiarato:** i nomi reali di colonne/funzioni nei 3 siti di integrazione (Task 6) e nella mappa backfill (Task 7) sono l'unico rischio; ogni test fallisce in modo esplicito se un nome è errato.
