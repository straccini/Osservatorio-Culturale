/**
 * ============================================================================
 *  FontiFeed.js — Archivio unico fonti "feed" (News/RSS + Podcast + Video)
 * ============================================================================
 *  Data: 2026-06-02
 *  Spec:  docs/superpowers/specs/2026-06-02-fonti-feed-unificazione-design.md
 *  Piano: docs/superpowers/plans/2026-06-02-fonti-feed-unificazione.md
 *
 *  Obiettivo: un solo foglio `FontiFeed` per gestire News, Podcast e Video,
 *  oggi sparse tra il foglio `Fonti`, l'array hardcoded `FONTI_PODCAST` e il
 *  foglio `FontiPodcast`.
 *
 *  SICUREZZA — flag PER-TIPO (ScriptProperties), tutti default OFF:
 *    USE_FONTI_FEED_RSS / USE_FONTI_FEED_PODCAST / USE_FONTI_FEED_VIDEO
 *  Con flag OFF l'adattatore replica ESATTAMENTE la sorgente attuale del tipo
 *  → l'app si comporta come prima. Con flag ON legge `FontiFeed`.
 *  Rollback istantaneo: disableFontiFeed('rss'|'podcast'|'video').
 *
 *  TEST: non esiste runner CLI (GAS). Le funzioni `_test_*_()` loggano PASS/FAIL
 *  e vanno eseguite dall'editor GAS dopo `clasp push`.
 * ============================================================================
 */

var FONTIFEED_SHEET = 'FontiFeed';

var FONTIFEED_HEADERS = [
  'ID','Nome','Gruppo','Tipo','URL_Feed','URL_Sito','Ambito','AmbitoLabel',
  'Dimensioni','Categoria','Priorita','Attiva','DataAggiunta','UltimaScan',
  'UltimoEsito','NRecordTotali','NRecordUltimo','FailConsecutivi','UltimoErrore','Note'
];

var FONTIFEED_FLAG_PROPS = {
  rss:     'USE_FONTI_FEED_RSS',
  podcast: 'USE_FONTI_FEED_PODCAST',
  video:   'USE_FONTI_FEED_VIDEO'
};

// ============================================================================
// FLAG PER-TIPO
// ============================================================================

function isFontiFeedEnabled_(tipo) {
  var p = FONTIFEED_FLAG_PROPS[String(tipo).toLowerCase()];
  if (!p) return false;
  return String(PropertiesService.getScriptProperties().getProperty(p)) === 'true';
}
function enableFontiFeed(tipo) {
  var p = FONTIFEED_FLAG_PROPS[String(tipo).toLowerCase()];
  if (p) { PropertiesService.getScriptProperties().setProperty(p, 'true'); Logger.log(p + ' = true'); }
}
function disableFontiFeed(tipo) {
  var p = FONTIFEED_FLAG_PROPS[String(tipo).toLowerCase()];
  if (p) { PropertiesService.getScriptProperties().setProperty(p, 'false'); Logger.log(p + ' = false'); }
}
function disableAllFontiFeed() { ['rss','podcast','video'].forEach(disableFontiFeed); }

// ============================================================================
// HELPER
// ============================================================================

// mini-assert per i test: logga PASS/FAIL, non lancia
function _ffAssert_(cond, msg) { Logger.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); return !!cond; }

// Forma standard con alias news + podcast (così gli scanner non cambiano i loop):
//   news (scanSources):                 .ID .Nome .RSSURL .URL .Ambito .Attiva
//   podcast/video (scanPodcast/Video):  .nome .url .tematica .priorita
function _ffShape_(o) {
  o = o || {};
  var attiva = o.attiva !== false;
  return {
    id: o.id || '', nome: o.nome || '', gruppo: o.gruppo || '', tipo: o.tipo || '',
    urlFeed: o.urlFeed || '', urlSito: o.urlSito || '', ambito: o.ambito || '',
    categoria: o.categoria || '', priorita: Number(o.priorita) || 1, attiva: attiva,
    // alias news (scanSources)
    ID: o.id || '', Nome: o.nome || '', RSSURL: o.urlFeed || '',
    URL: o.urlSito || o.urlFeed || '', Ambito: o.ambito || '', Attiva: attiva,
    // alias podcast/video
    url: o.urlFeed || '', tematica: o.categoria || ''
  };
}

function _normalizeFeedUrl_(url) {
  var s = String(url || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('?')[0].split('#')[0];
  return s.replace(/\/+$/, '');
}

// ============================================================================
// FOGLIO
// ============================================================================

function ensureFontiFeedSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FONTIFEED_SHEET);
    sh.getRange(1, 1, 1, FONTIFEED_HEADERS.length).setValues([FONTIFEED_HEADERS])
      .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 200); sh.setColumnWidth(3, 140); sh.setColumnWidth(5, 320);
    Logger.log('FontiFeed creato (' + FONTIFEED_HEADERS.length + ' colonne)');
  }
  return sh;
}

// ============================================================================
// LETTORI LEGACY (sorgenti attuali per ciascun tipo)
// ============================================================================

// News ← foglio `Fonti`
function _ffReadFonti_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Fonti'); if (!sh) return [];
  var v = sh.getDataRange().getValues(); if (v.length < 2) return [];
  var h = v[0].map(function(x){ return String(x || '').trim(); });
  function c(n){ return h.indexOf(n); }
  var iId=c('ID'), iNome=c('Nome'), iUrl=c('URL'), iRss=c('RSSURL'), iAmb=c('Ambito'),
      iAmbL=c('AmbitoLabel'), iAtt=c('Attiva'), iScan=c('UltimaScansione'), iNum=c('NumItemRaccolti');
  var out = [];
  for (var r=1; r<v.length; r++) {
    var row = v[r]; if (iId>=0 && !row[iId]) continue;
    var nome = String(row[iNome] || '').trim();
    out.push({
      nome: nome, gruppo: nome.split(/[—\-|:]/)[0].trim() || nome, tipo: 'rss',
      urlFeed: String((iRss>=0?row[iRss]:'') || '').trim() || String((iUrl>=0?row[iUrl]:'') || '').trim(),
      urlSito: String((iUrl>=0?row[iUrl]:'') || '').trim(), ambito: iAmb>=0?row[iAmb]:'',
      ambitoLabel: iAmbL>=0?row[iAmbL]:'', categoria: '', priorita: 2,
      attiva: String((iAtt>=0?row[iAtt]:'')).toUpperCase()==='TRUE' || row[iAtt]===true,
      ultimaScan: iScan>=0?row[iScan]:'', nRecTot: Number((iNum>=0?row[iNum]:0) || 0), note: ''
    });
  }
  return out;
}

// Podcast/Video ← foglio `FontiPodcast` filtrato per TipoContenuto.
//   wanted: 'audio' (include vuoto) | 'video'
function _ffReadFontiPodcast_(wanted) {
  var sh = (typeof _getFontiPodSheet === 'function') ? _getFontiPodSheet() : null;
  if (!sh) {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    sh = ss.getSheetByName('FontiPodcast');
  }
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function(x){ return String(x || '').trim(); });
  function c(n){ return h.indexOf(n); }
  var iNome=c('Nome'), iUrl=c('URL_RSS'), iTema=c('Tematica'), iAtt=c('Attiva'),
      iTipo=c('TipoContenuto'), iScan=c('UltimaScan'), iNum=c('NumEpisodi');
  var out = [];
  for (var r=1; r<v.length; r++) {
    var row = v[r]; if (iUrl<0 || !row[iUrl]) continue;
    var tipoC = iTipo>=0 ? String(row[iTipo] || '').toLowerCase() : '';
    var match = (wanted === 'video') ? (tipoC === 'video') : (tipoC === 'audio' || tipoC === '');
    if (!match) continue;
    out.push({
      nome: String(row[iNome] || ''), gruppo: String(row[iNome] || ''),
      tipo: wanted === 'video' ? 'video' : 'podcast', urlFeed: String(row[iUrl] || '').trim(),
      urlSito: '', ambito: '', categoria: String(iTema>=0?row[iTema]:''), priorita: 1,
      attiva: !(row[iAtt]===false || String(row[iAtt]).toLowerCase()==='false'),
      ultimaScan: iScan>=0?row[iScan]:'', nRecTot: Number((iNum>=0?row[iNum]:0) || 0), note: ''
    });
  }
  return out;
}

// Podcast ← array hardcoded `FONTI_PODCAST` (Scannerbandi.js)
function _ffReadPodcastArray_() {
  if (typeof FONTI_PODCAST === 'undefined') return [];
  return FONTI_PODCAST.map(function(f){
    return {
      nome: f.nome, gruppo: f.nome, tipo: 'podcast', urlFeed: f.url, urlSito: '',
      ambito: '', categoria: f.tematica || '', priorita: Number(f.priorita) || 1,
      attiva: true, ultimaScan: '', nRecTot: 0, note: ''
    };
  });
}

// ============================================================================
// MIGRAZIONE (non distruttiva, idempotente, con report)
// ============================================================================

function migraFontiFeed() {
  var sh = ensureFontiFeedSheet_();
  var h = sh.getRange(1, 1, 1, FONTIFEED_HEADERS.length).getValues()[0];
  var iFeed = h.indexOf('URL_Feed');
  var existing = {};
  var cur = sh.getDataRange().getValues();
  for (var r=1; r<cur.length; r++) { var k = _normalizeFeedUrl_(cur[r][iFeed]); if (k) existing[k] = true; }

  var legacy = _ffReadFonti_()
    .concat(_ffReadPodcastArray_())
    .concat(_ffReadFontiPodcast_('audio'))
    .concat(_ffReadFontiPodcast_('video'));

  var added = 0, dup = 0, silenti = 0;
  legacy.forEach(function(f){
    var key = _normalizeFeedUrl_(f.urlFeed); if (!key) return;
    if (existing[key]) { dup++; return; }
    existing[key] = true;
    if (f.nRecTot === 0) silenti++;
    var o = {
      ID: 'FF' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      Nome: f.nome, Gruppo: f.gruppo, Tipo: f.tipo, URL_Feed: f.urlFeed, URL_Sito: f.urlSito || '',
      Ambito: f.ambito || '', AmbitoLabel: f.ambitoLabel || '', Dimensioni: '', Categoria: f.categoria || '',
      Priorita: f.priorita || 2, Attiva: f.attiva, DataAggiunta: new Date(), UltimaScan: f.ultimaScan || '',
      UltimoEsito: '', NRecordTotali: f.nRecTot || 0, NRecordUltimo: 0, FailConsecutivi: 0, UltimoErrore: '', Note: f.note || ''
    };
    sh.appendRow(FONTIFEED_HEADERS.map(function(col){ return o[col] !== undefined ? o[col] : ''; }));
    added++;
  });
  var rep = { migrate: added, doppioniSaltati: dup, silentiZeroRecord: silenti };
  Logger.log('migraFontiFeed: ' + JSON.stringify(rep));
  return rep;
}

// ============================================================================
// ADATTATORE DI LETTURA
// ============================================================================

function _ffReadFromFeed_(tipo) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET); if (!sh) return [];
  var v = sh.getDataRange().getValues(); if (v.length < 2) return [];
  var h = v[0]; function c(n){ return h.indexOf(n); }
  var iId=c('ID'), iNome=c('Nome'), iGr=c('Gruppo'), iTipo=c('Tipo'), iFeed=c('URL_Feed'),
      iSito=c('URL_Sito'), iAmb=c('Ambito'), iCat=c('Categoria'), iPri=c('Priorita'), iAtt=c('Attiva');
  var out = [];
  for (var r=1; r<v.length; r++) {
    var row = v[r]; if (!row[iId]) continue;
    if (String(row[iTipo]).toLowerCase() !== tipo) continue;
    if (!(row[iAtt]===true || String(row[iAtt]).toUpperCase()==='TRUE')) continue;
    out.push(_ffShape_({
      id: row[iId], nome: row[iNome], gruppo: row[iGr], tipo: tipo, urlFeed: row[iFeed],
      urlSito: row[iSito], ambito: row[iAmb], categoria: row[iCat], priorita: row[iPri], attiva: true
    }));
  }
  return out;
}

/**
 * Unico punto da cui gli scanner prendono le fonti.
 * @param {string} tipo  'rss' | 'podcast' | 'video'
 * @return {Array} oggetti _ffShape_ (con alias news + podcast)
 */
function getFeedSources(tipo) {
  tipo = String(tipo || 'rss').toLowerCase();
  if (isFontiFeedEnabled_(tipo)) return _ffReadFromFeed_(tipo);

  // OFF — replica la sorgente attuale del tipo
  if (tipo === 'rss') {
    return (typeof getFonti === 'function') ? getFonti().fonti.filter(function(f){ return f.Attiva; }) : [];
  }
  if (tipo === 'podcast') {
    var out = _ffReadPodcastArray_().map(_ffShape_);
    _ffReadFontiPodcast_('audio').forEach(function(o){
      var k = _normalizeFeedUrl_(o.urlFeed);
      if (out.some(function(x){ return _normalizeFeedUrl_(x.urlFeed) === k; })) return;
      out.push(_ffShape_(o));
    });
    return out;
  }
  if (tipo === 'video') {
    return _ffReadFontiPodcast_('video').map(_ffShape_);
  }
  return [];
}

// ============================================================================
// ADATTATORE DI SCRITTURA CONTATORI
// ============================================================================

/**
 * OFF: news → updateFonteLastScan (foglio Fonti); podcast/video → no-op
 *      (la logica contatori legacy esistente resta invariata).
 * ON:  scrive UltimaScan/UltimoEsito/contatori/Fail su FontiFeed.
 */
function updateFeedSourceStats(tipo, fonte, esito, nRecord, errore) {
  tipo = String(tipo || 'rss').toLowerCase();
  nRecord = Number(nRecord || 0);
  esito = esito || (nRecord > 0 ? 'OK' : 'EMPTY');

  if (!isFontiFeedEnabled_(tipo)) {
    if (tipo === 'rss' && typeof updateFonteLastScan === 'function' && fonte && fonte.ID) {
      var SS = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
      try { updateFonteLastScan(SS, fonte.ID, nRecord); } catch(e) {}
    }
    return; // podcast/video OFF: no-op
  }

  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET); if (!sh) return;
  var v = sh.getDataRange().getValues(); var h = v[0]; function c(n){ return h.indexOf(n); }
  var iId=c('ID'), iFeed=c('URL_Feed'), iScan=c('UltimaScan'), iEsito=c('UltimoEsito'),
      iTot=c('NRecordTotali'), iUlt=c('NRecordUltimo'), iFail=c('FailConsecutivi'), iErr=c('UltimoErrore');
  var keyId = fonte && fonte.id ? String(fonte.id) : (fonte && fonte.ID ? String(fonte.ID) : '');
  var keyFeed = _normalizeFeedUrl_(fonte && (fonte.urlFeed || fonte.RSSURL || fonte.url));
  for (var r=1; r<v.length; r++) {
    var hit = (keyId && String(v[r][iId]) === keyId) || (keyFeed && _normalizeFeedUrl_(v[r][iFeed]) === keyFeed);
    if (!hit) continue;
    var rr = r + 1;
    sh.getRange(rr, iScan+1).setValue(new Date());
    sh.getRange(rr, iEsito+1).setValue(esito);
    sh.getRange(rr, iTot+1).setValue(Number(v[r][iTot] || 0) + nRecord);
    sh.getRange(rr, iUlt+1).setValue(nRecord);
    sh.getRange(rr, iFail+1).setValue(esito === 'OK' ? 0 : Number(v[r][iFail] || 0) + 1);
    if (errore) sh.getRange(rr, iErr+1).setValue(String(errore).substring(0, 120));
    return;
  }
}

// ============================================================================
// VERIFICA (confronto non distruttivo legacy vs FontiFeed, per tipo)
// ============================================================================

function verificaFontiFeed() {
  var legacyRss = _ffReadFonti_().filter(function(f){ return f.attiva; });
  var legacyPod = _ffReadPodcastArray_().concat(_ffReadFontiPodcast_('audio')).filter(function(f){ return f.attiva; });
  var legacyVid = _ffReadFontiPodcast_('video').filter(function(f){ return f.attiva; });

  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  var keys = { rss:{}, podcast:{}, video:{} }, perTipo = { rss:0, podcast:0, video:0 };
  if (sh) {
    var v = sh.getDataRange().getValues(); var h = v[0];
    var iId=h.indexOf('ID'), iFeed=h.indexOf('URL_Feed'), iTipo=h.indexOf('Tipo'), iAtt=h.indexOf('Attiva');
    for (var r=1; r<v.length; r++) {
      if (!v[r][iId]) continue;
      if (!(v[r][iAtt]===true || String(v[r][iAtt]).toUpperCase()==='TRUE')) continue;
      var t = String(v[r][iTipo]).toLowerCase();
      if (keys[t]) { keys[t][_normalizeFeedUrl_(v[r][iFeed])] = true; perTipo[t]++; }
    }
  }
  function manc(arr, t) {
    return arr.filter(function(f){ return !keys[t][_normalizeFeedUrl_(f.urlFeed)]; }).map(function(f){ return f.nome; });
  }
  var rep = {
    feedPerTipo: perTipo,
    rssMancanti: manc(legacyRss, 'rss'),
    podMancanti: manc(legacyPod, 'podcast'),
    vidMancanti: manc(legacyVid, 'video')
  };
  Logger.log('verificaFontiFeed: ' + JSON.stringify(rep, null, 2));
  return rep;
}

// ============================================================================
// LETTURA ADMIN (schema-safe, per NOME colonna)
// ----------------------------------------------------------------------------
// getFontiUnified()/_fuRowToObj_ (Fonti_v1.js) usano indici FU17 fissi a 18 col
// e leggerebbero FontiFeed (20 col, layout diverso) in modo CORROTTO. Questo
// lettore dedicato mappa per nome colonna: usarlo per il pannello admin del
// nuovo archivio. Chiamabile da google.script.run.
// ============================================================================

function getFontiFeedAdmin(filtro) {
  filtro = filtro || {};
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, fonti: [], totale: 0 };
  var v = sh.getDataRange().getValues();
  var h = v[0]; function c(n){ return h.indexOf(n); }
  var idx = {}; FONTIFEED_HEADERS.forEach(function(name){ idx[name] = c(name); });
  function g(row, name){ var i = idx[name]; return i >= 0 ? row[i] : ''; }
  if (idx.ID < 0) return { ok: false, error: 'Header FontiFeed non riconosciuti', fonti: [], totale: 0 };
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var row = v[r]; if (!g(row, 'ID')) continue;
    var attiva = g(row, 'Attiva') === true || String(g(row, 'Attiva')).toUpperCase() === 'TRUE';
    var tipo = String(g(row, 'Tipo') || '').toLowerCase();
    if (filtro.tipo && tipo !== String(filtro.tipo).toLowerCase()) continue;
    if (filtro.attiva !== undefined && attiva !== filtro.attiva) continue;
    out.push({
      id: String(g(row, 'ID')), nome: String(g(row, 'Nome') || ''), gruppo: String(g(row, 'Gruppo') || ''),
      tipo: tipo, url: String(g(row, 'URL_Feed') || ''), urlSito: String(g(row, 'URL_Sito') || ''),
      ambito: g(row, 'Ambito'), categoria: String(g(row, 'Categoria') || ''), dimensioni: String(g(row, 'Dimensioni') || ''),
      priorita: Number(g(row, 'Priorita')) || 2, attiva: attiva,
      ultimaScan: g(row, 'UltimaScan'), ultimoEsito: String(g(row, 'UltimoEsito') || ''),
      nRecTotali: Number(g(row, 'NRecordTotali')) || 0, failConsec: Number(g(row, 'FailConsecutivi')) || 0,
      note: String(g(row, 'Note') || '')
    });
  }
  return { ok: true, fonti: out, totale: out.length };
}

// ============================================================================
// AZIONI ADMIN su FontiFeed (toggle / delete / add) — auth via token sessione
// (la web app e' "Chiunque": usare getCurrentUserAuth(token), non requireAuth)
// ============================================================================

function toggleFontiFeed(id, attiva, token) {
  var auth = getCurrentUserAuth(token || null);
  if (!auth || !auth.isAdmin) return { error: 'Accesso negato (non admin)' };
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh) return { error: 'FontiFeed assente' };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var iId = h.indexOf('ID'), iAtt = h.indexOf('Attiva'), iFail = h.indexOf('FailConsecutivi');
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][iId]) === String(id)) {
      sh.getRange(r + 1, iAtt + 1).setValue(!!attiva);
      if (attiva && iFail >= 0) sh.getRange(r + 1, iFail + 1).setValue(0);
      return { ok: true, id: id, attiva: !!attiva };
    }
  }
  return { error: 'fonte non trovata: ' + id };
}

function deleteFontiFeed(id, token) {
  var auth = getCurrentUserAuth(token || null);
  if (!auth || !auth.isAdmin) return { error: 'Accesso negato (non admin)' };
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh) return { error: 'FontiFeed assente' };
  var v = sh.getDataRange().getValues(); var iId = v[0].indexOf('ID');
  for (var r = v.length - 1; r >= 1; r--) {
    if (String(v[r][iId]) === String(id)) { sh.deleteRow(r + 1); return { ok: true, id: id }; }
  }
  return { error: 'fonte non trovata: ' + id };
}

function addFontiFeed(body, token) {
  var auth = getCurrentUserAuth(token || null);
  if (!auth || !auth.isAdmin) return { error: 'Accesso negato (non admin)' };
  body = body || {};
  var tipo = String(body.tipo || 'rss').toLowerCase();
  if (['rss','podcast','video','html'].indexOf(tipo) < 0) return { error: 'tipo non valido: ' + tipo };
  if (!body.nome || !body.urlFeed) return { error: 'Nome e URL feed obbligatori' };
  var sh = ensureFontiFeedSheet_();
  var h = sh.getRange(1, 1, 1, FONTIFEED_HEADERS.length).getValues()[0];
  var iFeed = h.indexOf('URL_Feed');
  var cur = sh.getDataRange().getValues();
  var key = _normalizeFeedUrl_(body.urlFeed);
  for (var r = 1; r < cur.length; r++) {
    if (_normalizeFeedUrl_(cur[r][iFeed]) === key) return { error: 'fonte gia presente (stesso URL feed)' };
  }
  var o = {
    ID: 'FF' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    Nome: String(body.nome).trim(), Gruppo: String(body.gruppo || body.nome).trim(), Tipo: tipo,
    URL_Feed: String(body.urlFeed).trim(), URL_Sito: String(body.urlSito || '').trim(),
    Ambito: body.ambito || '', AmbitoLabel: '', Dimensioni: String(body.dimensioni || ''),
    Categoria: String(body.categoria || ''), Priorita: Number(body.priorita) || 2, Attiva: true,
    DataAggiunta: new Date(), UltimaScan: '', UltimoEsito: '', NRecordTotali: 0, NRecordUltimo: 0,
    FailConsecutivi: 0, UltimoErrore: '', Note: String(body.note || '')
  };
  sh.appendRow(FONTIFEED_HEADERS.map(function(c){ return o[c] !== undefined ? o[c] : ''; }));
  return { ok: true, id: o.ID, tipo: tipo };
}

// ============================================================================
// TEST (eseguire dall'editor GAS dopo clasp push; loggano PASS/FAIL)
// ============================================================================

function _test_ffFlags_() {
  disableAllFontiFeed();
  _ffAssert_(isFontiFeedEnabled_('rss') === false, 'rss parte OFF');
  enableFontiFeed('rss');
  _ffAssert_(isFontiFeedEnabled_('rss') === true, 'rss ON dopo enable');
  _ffAssert_(isFontiFeedEnabled_('podcast') === false, 'podcast resta OFF (indipendente)');
  disableAllFontiFeed();
  _ffAssert_(isFontiFeedEnabled_('rss') === false, 'tutti OFF a fine test');
}

function _test_normalizeFeedUrl_() {
  _ffAssert_(_normalizeFeedUrl_('https://Site.it/Feed/') === 'site.it/feed', 'protocollo+lowercase+slash');
  _ffAssert_(_normalizeFeedUrl_('http://www.site.it/feed') === 'site.it/feed', 'www+http');
  _ffAssert_(_normalizeFeedUrl_('  https://site.it/feed?x=1 ') === 'site.it/feed', 'trim+query');
  _ffAssert_(_normalizeFeedUrl_('') === '', 'vuoto');
}

function _test_ensureFontiFeedSheet_() {
  ensureFontiFeedSheet_(); ensureFontiFeedSheet_();
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var n = ss.getSheets().filter(function(s){ return s.getName() === FONTIFEED_SHEET; }).length;
  _ffAssert_(n === 1, 'un solo foglio FontiFeed');
  var hdr = ss.getSheetByName(FONTIFEED_SHEET).getRange(1, 1, 1, 20).getValues()[0];
  _ffAssert_(hdr[0] === 'ID' && hdr[4] === 'URL_Feed' && hdr[19] === 'Note', 'header corretti');
}

function _test_migraFontiFeed_() {
  var r1 = migraFontiFeed();
  _ffAssert_(r1.migrate > 0, 'prima migrazione >0 (migrate=' + r1.migrate + ')');
  var r2 = migraFontiFeed();
  _ffAssert_(r2.migrate === 0, 'seconda non duplica (migrate=' + r2.migrate + ')');
}

function _test_getFeedSources_off_() {
  disableAllFontiFeed();
  var rss = getFeedSources('rss').length;
  var rssLegacy = (typeof getFonti === 'function') ? getFonti().fonti.filter(function(f){ return f.Attiva; }).length : -1;
  _ffAssert_(rss === rssLegacy, 'rss OFF: ' + rss + ' == ' + rssLegacy);
  _ffAssert_(getFeedSources('podcast').length > 0, 'podcast OFF ritorna fonti (array+foglio)');
  _ffAssert_(getFeedSources('video').length >= 0, 'video OFF ritorna lista');
}

function _test_updateFeedSourceStats_() {
  enableFontiFeed('podcast');
  var src = getFeedSources('podcast')[0];
  _ffAssert_(!!src, 'esiste fonte podcast in FontiFeed');
  updateFeedSourceStats('podcast', src, 'OK', 3, '');
  var ss = getMainSS();
  var v = ss.getSheetByName(FONTIFEED_SHEET).getDataRange().getValues(); var h = v[0];
  var iId = h.indexOf('ID'), iUlt = h.indexOf('NRecordUltimo'); var ok = false;
  for (var r=1; r<v.length; r++) { if (String(v[r][iId]) === String(src.id || src.ID)) { ok = Number(v[r][iUlt]) === 3; break; } }
  _ffAssert_(ok, 'NRecordUltimo=3 scritto');
  disableAllFontiFeed();
}

function _test_verificaFontiFeed_() {
  var r = verificaFontiFeed();
  _ffAssert_(r.rssMancanti.length === 0, '0 rss persi (' + r.rssMancanti.join(', ') + ')');
  _ffAssert_(r.podMancanti.length === 0, '0 podcast persi (' + r.podMancanti.join(', ') + ')');
  _ffAssert_(r.vidMancanti.length === 0, '0 video persi (' + r.vidMancanti.join(', ') + ')');
}

function _test_scanSources_off_() {
  disableAllFontiFeed();
  _ffAssert_(
    getFeedSources('rss').length === getFonti().fonti.filter(function(f){ return f.Attiva; }).length,
    'scanSources OFF vede le stesse fonti'
  );
}

function _test_getFontiFeedAdmin_() {
  var res = getFontiFeedAdmin({});
  _ffAssert_(res && res.ok === true, 'getFontiFeedAdmin ok');
  _ffAssert_(res.totale > 0, 'admin vede ' + res.totale + ' fonti feed');
  var primaConUrl = res.fonti.filter(function(f){ return f.url; }).length;
  _ffAssert_(primaConUrl === res.totale, 'tutte le fonti hanno un url (lettura per nome colonna corretta)');
}

// ============================================================================
// CONTROLLI A UN CLICK (per la tendina "Esegui" dell'editor — niente argomenti)
// ----------------------------------------------------------------------------
// Accendono/spengono i flag per-tipo. Dopo aver attivato un tipo, esegui lo
// scanner relativo: News -> scanSources() | Podcast -> scanPodcastDiretto() |
// Video -> scanVideoYoutube(). Rollback istantaneo con spegni*().
// ============================================================================

function attivaNews()    { enableFontiFeed('rss');     Logger.log('NEWS: FontiFeed ATTIVO. Ora esegui scanSources() per provare. Rollback: spegniNews().'); }
function attivaPodcast() { enableFontiFeed('podcast');  Logger.log('PODCAST: FontiFeed ATTIVO. Ora esegui scanPodcastDiretto(). Rollback: spegniPodcast().'); }
function attivaVideo()   { enableFontiFeed('video');    Logger.log('VIDEO: FontiFeed ATTIVO. Ora esegui scanVideoYoutube(). Rollback: spegniVideo().'); }

function spegniNews()    { disableFontiFeed('rss');     Logger.log('NEWS: tornato alle fonti legacy (foglio Fonti).'); }
function spegniPodcast() { disableFontiFeed('podcast'); Logger.log('PODCAST: tornato alle fonti legacy.'); }
function spegniVideo()   { disableFontiFeed('video');   Logger.log('VIDEO: tornato alle fonti legacy.'); }
function spegniTutto()   { disableAllFontiFeed();        Logger.log('TUTTO OFF: app al comportamento originale.'); }

// Scorciatoie di scansione (chiamano gli scanner in Codice.gs, ma stanno qui
// così fai tutto da FontiFeed.gs senza cambiare file).
function scansionaNews()    { var n = scanSources();        Logger.log('scansionaNews: ' + n + ' news nuove raccolte'); return n; }
function scansionaPodcast() { var n = scanPodcastDiretto(); Logger.log('scansionaPodcast: ' + n + ' episodi nuovi'); return n; }
function scansionaVideo()   { var n = scanVideoYoutube();   Logger.log('scansionaVideo: ' + n + ' video nuovi'); return n; }

// ============================================================================
// FASE 1 — strumenti rollout (Video seed + potatura fonti morte)
// ============================================================================

/**
 * Seed dei canali YouTube musei (in FontiPodcast) + migrazione in FontiFeed.
 * Da lanciare UNA volta prima di accendere i Video (oggi 0 fonti video).
 */
function seedVideoEMigra() {
  var seeded;
  if (typeof populaSeedVideoYoutubeMusei === 'function') {
    try { populaSeedVideoYoutubeMusei(); seeded = 'ok'; } catch(e) { seeded = 'ERR: ' + e.message; }
  } else {
    seeded = 'populaSeedVideoYoutubeMusei assente';
  }
  Logger.log('seedVideoEMigra: seed canali video -> ' + seeded);
  var rep = migraFontiFeed();
  Logger.log('seedVideoEMigra: migrazione -> ' + JSON.stringify(rep));
  return { seed: seeded, migrazione: rep };
}

/** Anteprima (NON modifica): elenca le fonti rss a 0 record raccolti. */
function anteprimaFontiMorte() { return _potaFontiMorte_(true); }

/** Disattiva (Attiva=FALSE, NON cancella) le fonti rss a 0 record. Reversibile. */
function potaFontiMorte() { return _potaFontiMorte_(false); }

function _potaFontiMorte_(soloAnteprima) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTIFEED_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'FontiFeed vuoto' };
  var v = sh.getDataRange().getValues(); var h = v[0];
  function c(n){ return h.indexOf(n); }
  var iId = c('ID'), iNome = c('Nome'), iTipo = c('Tipo'), iAtt = c('Attiva'), iTot = c('NRecordTotali');
  var morte = [], disattivate = 0;
  for (var r = 1; r < v.length; r++) {
    if (!v[r][iId]) continue;
    if (String(v[r][iTipo]).toLowerCase() !== 'rss') continue;
    var attiva = (v[r][iAtt] === true || String(v[r][iAtt]).toUpperCase() === 'TRUE');
    var tot = Number(v[r][iTot] || 0);
    if (attiva && tot === 0) {
      morte.push(String(v[r][iNome] || ''));
      if (!soloAnteprima) { sh.getRange(r + 1, iAtt + 1).setValue(false); disattivate++; }
    }
  }
  var rep = { ok: true, soloAnteprima: !!soloAnteprima, candidate: morte.length, disattivate: disattivate, fonti: morte };
  Logger.log((soloAnteprima ? 'anteprimaFontiMorte' : 'potaFontiMorte') + ': ' + JSON.stringify(rep));
  return rep;
}

function statoFlagFonti() {
  ['rss','podcast','video'].forEach(function(t){
    Logger.log(t.toUpperCase() + ': ' + (isFontiFeedEnabled_(t) ? 'FontiFeed (ON)' : 'legacy (OFF)'));
  });
}

// ============================================================================
// RUNNER PUBBLICO — selezionabile dalla tendina "Esegui" dell'editor GAS.
// (Le funzioni _test_*_ iniziano con "_" e GAS le nasconde dal menu: questo
//  wrapper le richiama tutte in fila e logga PASS/FAIL.)
// NB: esegue anche migraFontiFeed() → CREA e POPOLA il foglio FontiFeed.
//     È innocuo: i flag restano OFF, quindi l'app non cambia comportamento.
// ============================================================================

function runFontiFeedTests() {
  Logger.log('===== runFontiFeedTests — INIZIO =====');
  disableAllFontiFeed();
  _test_ffFlags_();
  _test_normalizeFeedUrl_();
  _test_ensureFontiFeedSheet_();
  _test_migraFontiFeed_();        // crea+popola FontiFeed (idempotente, non distruttivo)
  _test_getFeedSources_off_();
  _test_scanSources_off_();
  _test_updateFeedSourceStats_(); // usa flag podcast ON temporaneo, poi rimette OFF
  _test_verificaFontiFeed_();
  _test_getFontiFeedAdmin_();
  disableAllFontiFeed();
  Logger.log('===== runFontiFeedTests — FINE (flag tutti OFF) =====');
}

// ============================================================================
// FINE FontiFeed.js
// ============================================================================
