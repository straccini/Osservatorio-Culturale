/**
 * ============================================================================
 *  BandiConsolida.js — Tutte le fonti bandi in UN unico foglio: FontiBandi_v5
 * ============================================================================
 *  Data: 2026-06-03
 *  Scopo: trasferire TUTTE le sorgenti di fonti bandi in FontiBandi_v5 (schema
 *  FU17 a 18 colonne, COL_F_HEADERS in Bandi_v5.js), senza perdere nulla.
 *
 *  Sorgenti consolidate:
 *    1. Array hardcoded TUTTE_LE_FONTI_BANDI (41) — via seedFontiV5() (Bandi_v5.js)
 *    2. Vecchio foglio FontiBandi (ID,Nome,URL,Categoria,Attiva,Note)
 *    3. Foglio FontiAgenti (16 col: ID,Nome,URL,RSS_URL,Agente,Tipo,Categoria,...)
 *
 *  Proprieta':
 *    - NON distruttivo: scrive SOLO su FontiBandi_v5; i fogli sorgente restano intatti.
 *    - Idempotente: dedup per URL normalizzato (rilanciabile senza creare doppioni).
 *    - Con report dettagliato.
 *
 *  La deprecazione dei fogli sorgente e il redirect del codice avvengono DOPO,
 *  in passi separati e verificati (non qui).
 * ============================================================================
 */

var BANDI_V5_SHEET = 'FontiBandi_v5';

// Legge un foglio e restituisce le righe come oggetti {Header: valore}.
function _bcSheetObjs_(name) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function(x){ return String(x || '').trim(); });
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var o = {};
    for (var c = 0; c < h.length; c++) o[h[c]] = v[r][c];
    out.push(o);
  }
  return out;
}

function _bcUrlKey_(u) {
  return (typeof _normalizeFeedUrl_ === 'function') ? _normalizeFeedUrl_(u) : String(u || '').trim().toLowerCase().replace(/\/+$/, '');
}

function _bcTipoFromUrl_(url) {
  var u = String(url || '').toLowerCase();
  if (u.indexOf('/feed') >= 0 || u.indexOf('/rss') >= 0 || u.indexOf('feed.xml') >= 0) return 'RSS';
  if (u.indexOf('sitemap') >= 0) return 'Sitemap';
  return 'HTML';
}

// Appende righe sorgente (oggetti) in FontiBandi_v5, dedup per URL. Ritorna {added, dup}.
function _bcAppendToV5_(righeObj, esistenti, shV5) {
  var added = 0, dup = 0;
  righeObj.forEach(function(f) {
    var url = f.URL || f.RSS_URL || '';
    var key = _bcUrlKey_(url);
    if (!key) return;
    if (esistenti[key]) { dup++; return; }
    esistenti[key] = true;
    var attiva = !(f.Attiva === false || String(f.Attiva).toUpperCase() === 'FALSE');
    var o = {
      ID: f.ID || ('fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      Nome: String(f.Nome || ''), URL: String(url), Tipo: f.Tipo || _bcTipoFromUrl_(url),
      Tag: f.Tag || 'settoriale', Categoria: f.Categoria || 'Aggregatore',
      Priorita: Number(f.Priorita) || 2, Attiva: attiva,
      DataAggiunta: new Date(), UltimaScan: '', UltimoEsito: '',
      NRecordTotali: 0, NRecordUltimo: 0, FailConsecutivi: 0, UltimoErrore: '',
      EnteDefault: String(f.EnteDefault || ''), Livello: String(f.Livello || ''),
      extras_json: JSON.stringify({ note: String(f.Note || ''), agente: String(f.Agente || ''), origine: String(f._origine || '') })
    };
    shV5.appendRow(COL_F_HEADERS.map(function(c){ return o[c] !== undefined ? o[c] : ''; }));
    added++;
  });
  return { added: added, dup: dup };
}

/**
 * Consolida TUTTE le fonti bandi in FontiBandi_v5. Non distruttivo, idempotente.
 * Eseguire dall'editor GAS.
 */
function consolidaBandiFonti() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shV5 = ss.getSheetByName(BANDI_V5_SHEET);
  if (!shV5) return { ok: false, error: 'FontiBandi_v5 non esiste. Lancia prima setupBandiV5Schema().' };
  if (typeof COL_F_HEADERS === 'undefined') return { ok: false, error: 'COL_F_HEADERS non definito (Bandi_v5.js mancante?).' };

  // 1) hardcoded 41 via seedFontiV5 (idempotente)
  var seedRep;
  try { seedRep = (typeof seedFontiV5 === 'function') ? seedFontiV5() : { note: 'seedFontiV5 assente' }; }
  catch(e) { seedRep = { error: e.message }; }

  // indice URL gia presenti in FontiBandi_v5 (dopo il seed)
  var esistenti = {};
  var cur = shV5.getDataRange().getValues();
  var iUrl = cur[0].map(function(x){ return String(x || '').trim(); }).indexOf('URL');
  for (var r = 1; r < cur.length; r++) { var k = _bcUrlKey_(cur[r][iUrl]); if (k) esistenti[k] = true; }

  // 2) vecchio foglio FontiBandi
  var oldFB = _bcSheetObjs_('FontiBandi').map(function(o){ o._origine = 'FontiBandi'; return o; });
  var repFB = _bcAppendToV5_(oldFB, esistenti, shV5);

  // 3) FontiAgenti
  var ag = _bcSheetObjs_('FontiAgenti').map(function(o){ o._origine = 'FontiAgenti'; return o; });
  var repAG = _bcAppendToV5_(ag, esistenti, shV5);

  // 4) dedup finale (pulisce eventuali doppioni pre-esistenti)
  var dedupRep = dedupFontiBandiV5();

  var rep = {
    ok: true,
    seed_hardcoded: seedRep,
    da_FontiBandi: repFB,
    da_FontiAgenti: repAG,
    dedup: dedupRep,
    totale_FontiBandi_v5: shV5.getLastRow() - 1
  };
  Logger.log('consolidaBandiFonti: ' + JSON.stringify(rep, null, 2));
  return rep;
}

/**
 * Rimuove i doppioni (stesso URL normalizzato) in FontiBandi_v5, tenendo la prima
 * occorrenza. Reversibile solo da backup. Eseguire dall'editor.
 */
function dedupFontiBandiV5() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'FontiBandi_v5 vuoto' };
  var v = sh.getDataRange().getValues();
  var iUrl = v[0].map(function(x){ return String(x || '').trim(); }).indexOf('URL');
  if (iUrl < 0) return { ok: false, error: 'colonna URL non trovata' };
  var seen = {}, toDelete = [];
  for (var r = 1; r < v.length; r++) {
    var k = _bcUrlKey_(v[r][iUrl]);
    if (!k) continue;
    if (seen[k]) toDelete.push(r + 1); else seen[k] = true;
  }
  toDelete.sort(function(a, b){ return b - a; }).forEach(function(rowNum){ sh.deleteRow(rowNum); });
  var rep = { ok: true, rimossi: toDelete.length, rimanenti: sh.getLastRow() - 1 };
  Logger.log('dedupFontiBandiV5: ' + JSON.stringify(rep));
  return rep;
}

/**
 * Anteprima (NON modifica): quante fonti porterebbe dentro la consolidazione.
 */
function anteprimaConsolidaBandi() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shV5 = ss.getSheetByName(BANDI_V5_SHEET);
  var rep = {
    FontiBandi_v5_attuali: shV5 ? shV5.getLastRow() - 1 : '(assente)',
    hardcoded: (typeof TUTTE_LE_FONTI_BANDI !== 'undefined') ? TUTTE_LE_FONTI_BANDI.length : '(assente)',
    vecchio_FontiBandi: _bcSheetObjs_('FontiBandi').length,
    FontiAgenti: _bcSheetObjs_('FontiAgenti').length
  };
  Logger.log('anteprimaConsolidaBandi: ' + JSON.stringify(rep, null, 2));
  return rep;
}
