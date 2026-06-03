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
 * Marca con prefisso _OLD_ i fogli bandi non piu' usati. DA LANCIARE SOLO DOPO
 * consolidaBandiFonti() e verifica del pannello. NON cancella: rinomina, cosi' li
 * riconosci nel foglio Google e li elimini tu a mano.
 *
 * Sicuri perche' (verificato): FontiBandi -> getFontiBandi/add/delete/toggle ora
 * puntano a FontiBandi_v5; i 2 riferimenti residui sono diagnostici e null-safe.
 * FontiBandi_v5_pre_FU17 -> solo backup pre-migrazione.
 * NON tocca: FontiAgenti (letto da scanAgente), RADAR BANDI / _RADAR_BANDI_LEGACY_ (fallback).
 */
function deprecaFontiBandiOld() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var candidati = ['FontiBandi', 'FontiBandi_v5_pre_FU17'];
  var fatti = [], saltati = [];
  candidati.forEach(function(nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) { saltati.push(nome + ' (assente)'); return; }
    var target = '_OLD_' + nome;
    if (ss.getSheetByName(target)) {
      target = '_OLD_' + nome + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    }
    sh.setName(target);
    fatti.push(nome + ' -> ' + target);
  });
  var rep = { ok: true, rinominati: fatti, saltati: saltati,
    nota: 'Ora puoi cancellare a mano i fogli che iniziano con _OLD_. NON cancellare FontiAgenti, RADAR BANDI, _RADAR_BANDI_LEGACY_.' };
  Logger.log('deprecaFontiBandiOld: ' + JSON.stringify(rep, null, 2));
  return rep;
}

/**
 * Aggiunge a FontiBandi_v5 le colonne 'Agente' (quale agente gestisce la fonte)
 * e 'UltimoHash' (per la dedup hash-first dello scanner agenti), popolandole da
 * FontiAgenti per URL. Multi-agente -> lista "1,3". Da lanciare DOPO consolidaBandiFonti.
 * Cosi' nel foglio unico si VEDE quali fonti sono gestite da agenti specifici.
 */
function assegnaAgentiFontiBandi() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shV5 = ss.getSheetByName(BANDI_V5_SHEET);
  if (!shV5) return { ok: false, error: 'FontiBandi_v5 assente' };

  // 1. assicura colonne Agente + UltimoHash (in coda, non sposta le 18 esistenti)
  var hdr = shV5.getRange(1, 1, 1, shV5.getLastColumn()).getValues()[0];
  function ensureCol(name) {
    var i = hdr.indexOf(name);
    if (i >= 0) return i;
    shV5.getRange(1, shV5.getLastColumn() + 1).setValue(name);
    hdr = shV5.getRange(1, 1, 1, shV5.getLastColumn()).getValues()[0];
    return hdr.indexOf(name);
  }
  var iAgente = ensureCol('Agente');
  var iHash = ensureCol('UltimoHash');
  var iUrl = hdr.indexOf('URL');

  // 2. mappa da FontiAgenti: URL normalizzato -> {agenti:{}, hash}
  var ag = _bcSheetObjs_('FontiAgenti');
  var mapUrl = {};
  ag.forEach(function(o) {
    var k = _bcUrlKey_(o.URL || o.RSS_URL || '');
    if (!k) return;
    if (!mapUrl[k]) mapUrl[k] = { agenti: {}, hash: '' };
    var a = String(o.Agente == null ? '' : o.Agente).trim();
    if (a) mapUrl[k].agenti[a] = true;
    if (o.UltimoHash) mapUrl[k].hash = String(o.UltimoHash);
  });

  // 3. scrivi Agente + UltimoHash sulle righe FontiBandi_v5 corrispondenti per URL
  var v = shV5.getDataRange().getValues();
  var assegnati = 0;
  for (var r = 1; r < v.length; r++) {
    var k = _bcUrlKey_(v[r][iUrl]);
    var m = mapUrl[k];
    if (!m) continue;
    var lista = Object.keys(m.agenti).join(',');
    if (lista) { shV5.getRange(r + 1, iAgente + 1).setValue(lista); assegnati++; }
    if (m.hash) shV5.getRange(r + 1, iHash + 1).setValue(m.hash);
  }
  var rep = { ok: true, colonna_Agente: iAgente + 1, colonna_UltimoHash: iHash + 1, righe_con_agente: assegnati };
  Logger.log('assegnaAgentiFontiBandi: ' + JSON.stringify(rep));
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

// ============================================================================
// FONTI API — aggiunta in FontiBandi_v5 con tutti i campi (Tipo=API, Agente)
// ============================================================================

/**
 * Aggiunge UNA fonte API a FontiBandi_v5, riutilizzabile per ogni API futura.
 * Scrive per nome colonna (compatibile con lo schema 18+Agente+UltimoHash),
 * dedup per URL. Assegna Tipo=API e l'agente indicato.
 *
 * @param {Object} opts { nome, url, agente=1, categoria='Aggregatore',
 *                        priorita=1, id?, enteDefault?, livello?, note? }
 */
function aggiungiFonteApiAgente(opts) {
  opts = opts || {};
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh) return { ok: false, error: 'FontiBandi_v5 assente' };
  if (!opts.nome || !opts.url) return { ok: false, error: 'nome e url obbligatori' };

  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  // assicura la colonna Agente (in coda)
  if (h.indexOf('Agente') < 0) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('Agente');
    h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  }
  var iUrl = h.indexOf('URL');

  // dedup per URL normalizzato
  var cur = sh.getDataRange().getValues();
  var key = _bcUrlKey_(opts.url);
  for (var r = 1; r < cur.length; r++) {
    if (_bcUrlKey_(cur[r][iUrl]) === key) return { ok: false, error: 'fonte gia presente (stesso URL) alla riga ' + (r + 1) };
  }

  var rowObj = {
    ID: opts.id || ('api_' + Date.now()),
    Nome: String(opts.nome), URL: String(opts.url), Tipo: 'API',
    Tag: 'settoriale', Categoria: opts.categoria || 'Aggregatore',
    Priorita: Number(opts.priorita) || 1, Attiva: true,
    DataAggiunta: new Date(), UltimaScan: '', UltimoEsito: '',
    NRecordTotali: 0, NRecordUltimo: 0, FailConsecutivi: 0, UltimoErrore: '',
    EnteDefault: String(opts.enteDefault || ''), Livello: String(opts.livello || ''),
    extras_json: JSON.stringify({ tipoFonte: 'API', note: String(opts.note || '') }),
    Agente: String(opts.agente || 1),
    UltimoHash: ''
  };
  sh.appendRow(h.map(function(name) { return rowObj[name] !== undefined ? rowObj[name] : ''; }));
  var rep = { ok: true, nome: opts.nome, tipo: 'API', agente: opts.agente || 1, riga: sh.getLastRow() };
  Logger.log('aggiungiFonteApiAgente: ' + JSON.stringify(rep));
  return rep;
}

/** Pronta: aggiunge la fonte API BandiUp — Cultura (agente 1, bandi cultura aperti). */
function aggiungiBandiUpCultura() {
  return aggiungiFonteApiAgente({
    id: 'bandiup_cultura',
    nome: 'BandiUp — Cultura (API)',
    url: 'https://bandiup.it/api/bandi?categoria=cultura&stato=aperto&limit=25',
    agente: 1,
    categoria: 'Aggregatore',
    priorita: 1,
    note: 'API pubblica JSON. Filtro: categoria=cultura, stato=aperto. Estrazione via Claude (prompt AG1).'
  });
}
