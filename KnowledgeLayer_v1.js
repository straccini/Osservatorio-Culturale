// ============================================================================
// KnowledgeLayer_v1.js — L1: estrazione entità + temi (Fase 3)
// Spec:  docs/superpowers/specs/2026-06-07-l1-knowledge-layer-design.md
// Piano: docs/superpowers/plans/2026-06-07-l1-knowledge-layer.md
// File ADDITIVO e ISOLATO: nessuno lo chiama finché non si fa l'integrazione (Task 6).
// ============================================================================

// --- Costanti -----------------------------------------------------------------
var OC_KB_SHEETS = { entita: 'Entita', occorrenze: 'Occorrenze' };
var OC_KB_TIPI   = ['persona', 'struttura', 'tema', 'progetto'];
var OC_KB_PESI   = { occ: 40, fonti: 25, recency: 20, ambiti: 15 };
var OC_KB_BOOST_AUTOREVOLE = 1.15;
// chiavi normalizzate (parziali) delle fonti autorevoli del settore
var OC_FONTI_AUTOREVOLI = ['symbola', 'fitzcarraldo', 'federculture', 'icom', 'nemo', 'mic', 'treccani', 'iccd'];
var OC_KB_BACKFILL_CAP = 80; // record per esecuzione del backfill (Task 7)

var OC_KB_ENTITA_HEADER = ['id','chiave','nome_canonico','tipo','alias_json','ambiti_json',
  'n_occorrenze','fonti_json','n_fonti','prima_data','ultima_data','score_autorevolezza','stato','note'];
var OC_KB_OCC_HEADER = ['id','entita_id','contenuto_id','tipo_contenuto','titolo_contenuto',
  'data','ambito','fonte','fonte_autorevole'];

function _kb_ss_(){ return (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet(); }

function kb_ensureSheets_(){
  var ss = _kb_ss_();
  if (!ss.getSheetByName(OC_KB_SHEETS.entita))     { ss.insertSheet(OC_KB_SHEETS.entita).appendRow(OC_KB_ENTITA_HEADER); }
  if (!ss.getSheetByName(OC_KB_SHEETS.occorrenze)) { ss.insertSheet(OC_KB_SHEETS.occorrenze).appendRow(OC_KB_OCC_HEADER); }
}

// --- Helper di test -----------------------------------------------------------
function _assert_(c, m){ if (!c) throw new Error('ASSERT FALLITO: ' + m); Logger.log('  ok: ' + m); }

// --- Normalizzazione nomi (pura) ---------------------------------------------
function kb_normalizeKey_(nome, tipo){
  var s = String(nome || '').toLowerCase();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');   // rimuove accenti
  s = s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); // punteggiatura + spazi
  return s;
}

// --- Score autorevolezza (puro) ----------------------------------------------
function kb_recency_(iso){
  if (!iso) return 0;
  var d = new Date(iso); if (isNaN(d.getTime())) return 0;
  var days = (new Date().getTime() - d.getTime()) / 86400000;
  if (days <= 90) return 1;
  if (days >= 365) return 0;
  return 1 - (days - 90) / 275;
}
function kb_scoreAutorevolezza_(o){
  o = o || {};
  var occ   = Math.min(1, Math.log(1 + (Number(o.n_occorrenze) || 0)) / Math.log(31));
  var fonti = Math.min(1, (Number(o.n_fonti) || 0) / 8);
  var rec   = kb_recency_(o.ultima_data);
  var amb   = Math.min(1, (Number(o.n_ambiti) || 0) / 5);
  var base  = OC_KB_PESI.occ * occ + OC_KB_PESI.fonti * fonti + OC_KB_PESI.recency * rec + OC_KB_PESI.ambiti * amb;
  if (o.has_autorevole) base *= OC_KB_BOOST_AUTOREVOLE;
  return Math.round(Math.min(100, base) * 10) / 10;
}
function kb_fonteAutorevole_(fonte){
  var f = kb_normalizeKey_(fonte, '');
  for (var i = 0; i < OC_FONTI_AUTOREVOLI.length; i++){ if (f.indexOf(OC_FONTI_AUTOREVOLI[i]) >= 0) return true; }
  return false;
}

// --- Scrittura: upsert entità + append occorrenza ----------------------------
function _kb_jsonSet_(raw, val){
  var a = []; try { a = JSON.parse(raw || '[]'); if (!Array.isArray(a)) a = []; } catch(_){ a = []; }
  if (val !== '' && val != null && a.indexOf(val) < 0) a.push(val);
  return a;
}
function _kb_newId_(p){ return p + Date.now() + Math.floor(Math.random() * 1000); }

function kb_upsertEntita_(e, meta, fa){
  var sh = _kb_ss_().getSheetByName(OC_KB_SHEETS.entita);
  var chiave = kb_normalizeKey_(e.nome, e.tipo); if (!chiave) return null;
  var vals = sh.getDataRange().getValues(), H = vals[0];
  var c = function(n){ return H.indexOf(n); };
  var now = new Date().toISOString();
  for (var r = 1; r < vals.length; r++){
    if (String(vals[r][c('chiave')]) === chiave && String(vals[r][c('tipo')]) === e.tipo){
      var alias  = _kb_jsonSet_(vals[r][c('alias_json')],  e.nome);
      var ambiti = _kb_jsonSet_(vals[r][c('ambiti_json')], meta.ambito);
      var fonti  = _kb_jsonSet_(vals[r][c('fonti_json')],  meta.fonte);
      var nocc   = (Number(vals[r][c('n_occorrenze')]) || 0) + 1;
      var score  = kb_scoreAutorevolezza_({ n_occorrenze: nocc, n_fonti: fonti.length, ultima_data: now, n_ambiti: ambiti.length, has_autorevole: fa });
      sh.getRange(r+1, c('alias_json')+1).setValue(JSON.stringify(alias));
      sh.getRange(r+1, c('ambiti_json')+1).setValue(JSON.stringify(ambiti));
      sh.getRange(r+1, c('fonti_json')+1).setValue(JSON.stringify(fonti));
      sh.getRange(r+1, c('n_occorrenze')+1).setValue(nocc);
      sh.getRange(r+1, c('n_fonti')+1).setValue(fonti.length);
      sh.getRange(r+1, c('ultima_data')+1).setValue(now);
      sh.getRange(r+1, c('score_autorevolezza')+1).setValue(score);
      return { id: String(vals[r][c('id')]), nuovo: false };
    }
  }
  var id = _kb_newId_('ENT');
  var ambiti0 = (meta.ambito !== '' && meta.ambito != null) ? [meta.ambito] : [];
  var fonti0  = meta.fonte ? [meta.fonte] : [];
  var score0  = kb_scoreAutorevolezza_({ n_occorrenze: 1, n_fonti: fonti0.length, ultima_data: now, n_ambiti: ambiti0.length, has_autorevole: fa });
  sh.appendRow([id, chiave, e.nome, e.tipo, JSON.stringify([e.nome]), JSON.stringify(ambiti0),
                1, JSON.stringify(fonti0), fonti0.length, now, now, score0, 'auto', '']);
  return { id: id, nuovo: true };
}

function kb_appendOccorrenza_(entitaId, e, meta, fa, dedup){
  var sh = _kb_ss_().getSheetByName(OC_KB_SHEETS.occorrenze);
  if (dedup){
    var v = sh.getDataRange().getValues(), H = v[0], iE = H.indexOf('entita_id'), iC = H.indexOf('contenuto_id');
    for (var r = 1; r < v.length; r++){ if (String(v[r][iE]) === entitaId && String(v[r][iC]) === String(meta.contenuto_id)) return false; }
  }
  sh.appendRow([_kb_newId_('OCC'), entitaId, meta.contenuto_id || '', meta.tipo_contenuto || '',
                meta.titolo || '', meta.data || '', meta.ambito || '', meta.fonte || '', !!fa]);
  return true;
}

// API additiva chiamata dagli scanner (Task 6). Isolata in try/catch: non rompe mai lo scanner.
function kb_recordEntities_(entitaArray, meta){
  try {
    if (!entitaArray || !entitaArray.length) return { ok: true, n: 0 };
    kb_ensureSheets_();
    meta = meta || {};
    var fa = kb_fonteAutorevole_(meta.fonte), n = 0;
    for (var i = 0; i < entitaArray.length; i++){
      var e = entitaArray[i];
      if (!e || !e.nome || !e.tipo || OC_KB_TIPI.indexOf(e.tipo) < 0) continue;
      var ent = kb_upsertEntita_(e, meta, fa);
      if (ent){ kb_appendOccorrenza_(ent.id, e, meta, fa, !!meta.dedup); n++; }
    }
    return { ok: true, n: n };
  } catch(err){ Logger.log('[kb_recordEntities_] ' + err.message); return { ok: false, error: err.message }; }
}

// --- Vista admin --------------------------------------------------------------
function kb_getTopEntita_(tipo, limite, token){
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token || null)) return { ok: false, error: 'forbidden' };
  limite = limite || 50;
  var sh = _kb_ss_().getSheetByName(OC_KB_SHEETS.entita);
  if (!sh || sh.getLastRow() < 2) return { ok: true, entita: [] };
  var vals = sh.getDataRange().getValues(), H = vals[0], c = function(n){ return H.indexOf(n); };
  var out = [];
  for (var r = 1; r < vals.length; r++){
    if (String(vals[r][c('stato')]).indexOf('unito_in') === 0) continue;
    if (tipo && String(vals[r][c('tipo')]) !== tipo) continue;
    out.push({
      nome: vals[r][c('nome_canonico')], tipo: vals[r][c('tipo')],
      n_occorrenze: Number(vals[r][c('n_occorrenze')]) || 0, n_fonti: Number(vals[r][c('n_fonti')]) || 0,
      ultima_data: vals[r][c('ultima_data')], score: Number(vals[r][c('score_autorevolezza')]) || 0
    });
  }
  out.sort(function(a, b){ return b.score - a.score; });
  return { ok: true, entita: out.slice(0, limite) };
}
// endpoint pubblico per il frontend admin
function getTopEntita(opts){ opts = opts || {}; return kb_getTopEntita_(opts.tipo || null, opts.limite || 50, opts.token || null); }

// ============================================================================
// TEST DRY-RUN (eseguire nell'editor GAS dopo sync-oc-to-gas.ps1)
// ============================================================================
function _test_kb_costanti_(){
  _assert_(OC_KB_TIPI.length === 4, '4 tipi');
  kb_ensureSheets_();
  _assert_(_kb_ss_().getSheetByName('Entita') !== null, 'foglio Entita creato');
  _assert_(_kb_ss_().getSheetByName('Occorrenze') !== null, 'foglio Occorrenze creato');
  Logger.log('TUTTI OK');
}
function _test_kb_normalize_(){
  _assert_(kb_normalizeKey_('ICOM Italia','struttura') === 'icom italia', 'spazi/maiuscole');
  _assert_(kb_normalizeKey_('I.C.O.M.','struttura') === 'icom', 'punteggiatura');
  _assert_(kb_normalizeKey_('Università','struttura') === 'universita', 'accenti');
  _assert_(kb_normalizeKey_('  AI  nei   musei ','tema') === 'ai nei musei', 'spazi multipli');
  Logger.log('TUTTI OK');
}
function _test_kb_score_(){
  var oggi = new Date().toISOString();
  var basso = kb_scoreAutorevolezza_({ n_occorrenze:1,  n_fonti:1, ultima_data:oggi, n_ambiti:1, has_autorevole:false });
  var alto  = kb_scoreAutorevolezza_({ n_occorrenze:25, n_fonti:6, ultima_data:oggi, n_ambiti:4, has_autorevole:false });
  _assert_(alto > basso, 'più occorrenze/fonti/ambiti → score più alto');
  var conAut = kb_scoreAutorevolezza_({ n_occorrenze:25, n_fonti:6, ultima_data:oggi, n_ambiti:4, has_autorevole:true });
  _assert_(conAut > alto, 'fonte autorevole dà boost');
  _assert_(kb_scoreAutorevolezza_({ n_occorrenze:0, n_fonti:0, ultima_data:'', n_ambiti:0 }) >= 0, 'mai NaN/negativo');
  _assert_(kb_fonteAutorevole_('Fondazione Symbola') === true, 'riconosce Symbola');
  _assert_(kb_fonteAutorevole_('Blog personale') === false, 'non autorevole');
  Logger.log('TUTTI OK');
}
function _test_kb_record_(){
  kb_ensureSheets_();
  var meta1 = { contenuto_id:'T1', tipo_contenuto:'news', titolo:'Test', data:new Date().toISOString(), ambito:5, fonte:'Symbola' };
  kb_recordEntities_([{ nome:'Mario Rossi', tipo:'persona', ruolo:'studioso' }, { nome:'ICOM Italia', tipo:'struttura' }], meta1);
  var meta2 = { contenuto_id:'T2', tipo_contenuto:'podcast', titolo:'Test2', data:new Date().toISOString(), ambito:2, fonte:'Fitzcarraldo' };
  kb_recordEntities_([{ nome:'Mario Rossi', tipo:'persona' }], meta2); // stessa persona, nuova menzione
  var sh = _kb_ss_().getSheetByName('Entita'); var vals = sh.getDataRange().getValues(), H = vals[0];
  var found = null;
  for (var r = 1; r < vals.length; r++){ if (String(vals[r][H.indexOf('chiave')]) === 'mario rossi'){ found = vals[r]; break; } }
  _assert_(found !== null, 'entità Mario Rossi creata');
  _assert_(Number(found[H.indexOf('n_occorrenze')]) === 2, '2 occorrenze sommate (entità non duplicata)');
  _assert_(Number(found[H.indexOf('n_fonti')]) === 2, '2 fonti distinte');
  Logger.log('NB: rimuovi a mano le righe di test (T1/T2, mario rossi, icom italia) dai fogli.');
  Logger.log('TUTTI OK');
}
function _test_kb_top_(){
  var r = kb_getTopEntita_(null, 10, null); // eseguito da editor = admin
  _assert_(r.ok === true, 'ok');
  _assert_(Array.isArray(r.entita), 'array');
  Logger.log(JSON.stringify(r.entita.slice(0, 5)));
  Logger.log('TUTTI OK');
}
function _test_kb_hook_robusto_(){
  var r = kb_recordEntities_(null, {}); _assert_(r.ok === true, 'entità nulle: nessun errore');
  var r2 = kb_recordEntities_([{ nome:'X', tipo:'tipo_inesistente' }], { contenuto_id:'Z', fonte:'f', ambito:1 });
  _assert_(r2.ok === true, 'tipo non valido ignorato senza crash');
  Logger.log('TUTTI OK');
}
