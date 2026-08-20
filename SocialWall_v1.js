// ============================================================================
// SocialWall_v1.js — Rilancio manuale di post nel Social Wall (curato editoriale)
// Complementa l'aggregatore RSS (Codice.js: getSocialWall/SocialFonti):
// permette di "riprendere e rilanciare" un singolo post da QUALSIASI piattaforma
// (anche X / Instagram / LinkedIn, che non hanno feed pubblici).
// File ADDITIVO. L'unico aggancio esterno è in fetchAndCacheSocialWall (Codice.js),
// che chiama _sw_manualPosts_() se esiste (try/catch).
// ============================================================================

var SW_POST_SHEET = 'SocialWallPost';
var SW_POST_HEADER = ['id', 'data_rilancio', 'autore', 'tipo', 'piattaforma',
  'titolo', 'estratto', 'url', 'imgUrl', 'dataISO', 'attivo'];

function _sw_ss_() { return (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet(); }

function _sw_ensurePostSheet_() {
  var ss = _sw_ss_(); var sh = ss.getSheetByName(SW_POST_SHEET);
  if (!sh) { sh = ss.insertSheet(SW_POST_SHEET); sh.getRange(1, 1, 1, SW_POST_HEADER.length).setValues([SW_POST_HEADER]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}

function _sw_isEditor_() {
  var u = (typeof getCurrentUser_v44 === 'function') ? getCurrentUser_v44() : null;
  return !!(u && (u.ruolo === 'admin' || u.ruolo === 'editor'));
}

// Best-effort: estrae OG title/description/image da una URL (per precompilare il form).
function _sw_fetchOg_(url) {
  var out = { titolo: '', estratto: '', imgUrl: '' };
  if (!url) return out;
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true });
    if (resp.getResponseCode() >= 400) return out;
    var html = String(resp.getContentText() || '').substring(0, 200000);
    function meta(prop) {
      var re1 = new RegExp('<meta[^>]+(?:property|name)=["\\\']' + prop + '["\\\'][^>]*content=["\\\']([^"\\\']+)["\\\']', 'i');
      var re2 = new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]*(?:property|name)=["\\\']' + prop + '["\\\']', 'i');
      var m = html.match(re1) || html.match(re2); return m ? m[1] : '';
    }
    out.titolo = meta('og:title') || ((html.match(/<title[^>]*>([^<]+)</i) || [])[1] || '');
    out.estratto = meta('og:description') || meta('description') || '';
    out.imgUrl = meta('og:image') || '';
  } catch (e) {}
  return out;
}

// API frontend: precompila i campi da una URL (chiamata dal form prima del salvataggio).
function rilancioPreview(url) {
  if (!_sw_isEditor_()) return { error: 'Riservato a editor/admin' };
  return { ok: true, og: _sw_fetchOg_(String(url || '')) };
}

// API frontend: pubblica un post curato nel wall.
function rilanciaPost(body) {
  if (!_sw_isEditor_()) return { error: 'Riservato a editor/admin' };
  body = body || {};
  if (!body.url && !body.titolo) return { error: 'Serve almeno una URL o un titolo' };
  var sh = _sw_ensurePostSheet_();
  var id = 'SWP' + Date.now();
  var now = new Date().toISOString();
  sh.appendRow([id, now, String(body.autore || ''), String(body.tipo || 'persona'), String(body.piattaforma || ''),
    String(body.titolo || ''), String(body.estratto || '').substring(0, 300), String(body.url || ''),
    String(body.imgUrl || ''), String(body.dataISO || now), true]);
  try { PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME'); } catch (e) {} // forza refresh del wall
  return { ok: true, id: id };
}

// Post manuali ATTIVI, nel formato card del wall (consumato da fetchAndCacheSocialWall).
function _sw_manualPosts_() {
  var sh = _sw_ss_().getSheetByName(SW_POST_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues(), H = vals[0], c = function (n) { return H.indexOf(n); };
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    var att = vals[r][c('attivo')];
    if (!(att === true || String(att).toUpperCase() === 'TRUE')) continue;
    var autore = String(vals[r][c('autore')] || '');
    out.push({
      fonte: autore || String(vals[r][c('piattaforma')] || 'Social'),
      tipo: String(vals[r][c('tipo')] || 'persona'),
      categoria: 'Rilancio',
      avatar: (autore || '?').charAt(0).toUpperCase(),
      titolo: String(vals[r][c('titolo')] || ''),
      estratto: String(vals[r][c('estratto')] || ''),
      url: String(vals[r][c('url')] || ''),
      imgUrl: String(vals[r][c('imgUrl')] || ''),
      dataISO: String(vals[r][c('dataISO')] || vals[r][c('data_rilancio')] || new Date().toISOString()),
      rilancio: true
    });
  }
  return out;
}

// Admin: lista completa (anche inattivi) per la gestione.
function getRilanciList() {
  if (!_sw_isEditor_()) return { error: 'Riservato a editor/admin' };
  var sh = _sw_ss_().getSheetByName(SW_POST_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, posts: [] };
  return { ok: true, posts: _sheetToObjects ? _sheetToObjects(SW_POST_SHEET) : [] };
}
function deleteRilancio(id) {
  if (!_sw_isEditor_()) return { error: 'Riservato a editor/admin' };
  try { PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME'); } catch (e) {}
  return (typeof _deleteRowById === 'function') ? _deleteRowById(_sw_ensurePostSheet_(), id) : { error: 'helper assente' };
}
function toggleRilancio(id) {
  if (!_sw_isEditor_()) return { error: 'Riservato a editor/admin' };
  try { PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME'); } catch (e) {}
  return (typeof _toggleField === 'function') ? _toggleField(_sw_ensurePostSheet_(), id, 'attivo') : { error: 'helper assente' };
}

// === ESEGUI nell'editor GAS per provare: aggiunge un post di esempio al wall ===
function swTestRilancio() {
  _sw_ensurePostSheet_();
  var sh = _sw_ensurePostSheet_();
  sh.appendRow(['SWP_TEST_' + Date.now(), new Date().toISOString(), 'Test Persona', 'persona', 'X',
    'Post di prova rilancio manuale', 'Estratto di prova per verificare il social wall.', 'https://example.com', '', new Date().toISOString(), true]);
  try { PropertiesService.getScriptProperties().deleteProperty('SW_CACHE_TIME'); } catch (e) {}
  Logger.log('swTestRilancio: post di prova aggiunto. Apri la home (Ctrl+Shift+R) per vederlo nel Social Wall. Poi cancella la riga SWP_TEST_* dal foglio SocialWallPost.');
}
