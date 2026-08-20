// ============================================================================
//  DigestDedup.js — Registro anti-ripetizione risorse nelle newsletter
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · v4.27.48 (2026-07-21)
//
//  REGOLA (richiesta Silvano 21/07): una risorsa inviata a una CATEGORIA di
//  newsletter non deve più uscire in quella categoria. Categorie (coorti):
//    'generalista' — newsletter lettori (draft admin + coorte A 2-coorti)
//    'profilati'   — email agenti tematiche + lead tematici/fallback
//    'matrix'      — digest personalizzati MuseMu Matrix
//
//  Foglio `DigestInviati`: [Chiave, Tipo, Coorte, DataInvio, Titolo].
//  La chiave preferisce l'URL normalizzato (stabile tra sistemi diversi che
//  mappano lo stesso record con id diversi), poi l'ID, poi il titolo.
//
//  COERENZA nello stesso run: il set degli inviati si carica UNA volta per
//  esecuzione (cache globale) → tutti i destinatari dello stesso run filtrano
//  sullo stesso bacino; le marcature diventano efficaci dal run successivo.
//
//  Include anche ddTipoCoerente(tipo, item): controllo di NATURA della risorsa
//  (es. un "Rapporto sociale 2024" non è un bando e non deve uscire tra i
//  bandi — visto nel report qualità del 21/07).
// ============================================================================

var DD_SHEET = 'DigestInviati';
var DD_HEADERS = ['Chiave', 'Tipo', 'Coorte', 'DataInvio', 'Titolo'];
var _DD_CACHE_ = null; // { coorte: {chiave:true} } — snapshot per esecuzione

function _ddSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DD_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DD_SHEET);
    sh.appendRow(DD_HEADERS);
    sh.getRange(1, 1, 1, DD_HEADERS.length).setFontWeight('bold').setBackground('#3C6A95').setFontColor('#fff');
  }
  return sh;
}

/** Chiave stabile di una risorsa: url normalizzato → id → titolo. */
function _ddChiave_(tipo, item) {
  if (!item) return '';
  var url = String(item.link || item.url || item.Link || item.URL || item.url_bando || '').trim();
  var base = '';
  if (url) base = url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!base) base = String(item.id || item.ID || '').trim();
  if (!base) base = 'T:' + String(item.titolo || item.Titolo || '').trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 160);
  if (base === 'T:') return '';
  return String(tipo || 'x') + '|' + base;
}

/** Set delle chiavi già inviate a una coorte (snapshot per esecuzione). */
// v4.28.20 — FINESTRA ANTI-RIPETIZIONE. Prima il filtro escludeva TUTTO ciò
// che era uscito negli ultimi 180 giorni (la durata del registro). Con news,
// podcast, video e libri che ruotano poco, dopo qualche settimana ogni sezione
// si svuotava e la newsletter restava con i soli bandi — verificato il 04/08:
// i provider restituivano 5 news, 3 podcast, 4 video, 4 libri, e il digest
// mostrava solo bandi.
// La richiesta originale (31/07) era non ripubblicare la STESSA cosa nei
// numeri ravvicinati: 45 giorni la rispettano pienamente e tengono piena la
// newsletter. Il registro continua a conservare 180 giorni di storico.
var DD_FINESTRA_GIORNI = 45;

function _ddSentSet_(coorte) {
  if (!_DD_CACHE_) {
    _DD_CACHE_ = {};
    try {
      var sh = _ddSheet_();
      if (sh.getLastRow() > 1) {
        // colonne: Chiave, Tipo, Coorte, DataInvio
        var v = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
        var limite = Date.now() - DD_FINESTRA_GIORNI * 86400000;
        for (var i = 0; i < v.length; i++) {
          var d = v[i][3];
          var dt = (d instanceof Date) ? d : (d ? new Date(d) : null);
          // senza data valida si resta prudenti e si considera "già inviato"
          if (dt && !isNaN(dt.getTime()) && dt.getTime() < limite) continue;
          var co = String(v[i][2] || '');
          if (!_DD_CACHE_[co]) _DD_CACHE_[co] = {};
          _DD_CACHE_[co][String(v[i][0] || '')] = true;
        }
      }
    } catch (e) { Logger.log('[ddSentSet] ' + e.message); }
  }
  return _DD_CACHE_[String(coorte || '')] || {};
}

/**
 * Filtra via le risorse GIÀ USCITE nella coorte. Fail-open: in caso di errore
 * ritorna la lista intatta (meglio un doppione che un digest vuoto).
 */
function ddFilterNotSent(coorte, tipo, items) {
  try {
    var sent = _ddSentSet_(coorte);
    return (items || []).filter(function (it) {
      var k = _ddChiave_(tipo, it);
      return !k || !sent[k];
    });
  } catch (e) { Logger.log('[ddFilterNotSent] ' + e.message); return items || []; }
}

/**
 * Registra le risorse uscite verso una coorte. groups = { tipo: items[] }.
 * Idempotente: salta chiavi già presenti (snapshot + batch corrente).
 */
function ddMarkSent(coorte, groups) {
  try {
    var sh = _ddSheet_();
    var sent = _ddSentSet_(coorte);
    var now = new Date();
    var rows = [], inBatch = {};
    Object.keys(groups || {}).forEach(function (tipo) {
      (groups[tipo] || []).forEach(function (it) {
        var k = _ddChiave_(tipo, it);
        if (!k || sent[k] || inBatch[k]) return;
        inBatch[k] = true;
        rows.push([k, tipo, String(coorte || ''), now, String(it.titolo || it.Titolo || '').substring(0, 180)]);
      });
    });
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, DD_HEADERS.length).setValues(rows);
      // aggiorna lo snapshot in memoria (per eventuali chiamate successive nello stesso run)
      if (_DD_CACHE_) {
        if (!_DD_CACHE_[String(coorte || '')]) _DD_CACHE_[String(coorte || '')] = {};
        rows.forEach(function (r) { _DD_CACHE_[String(coorte || '')][r[0]] = true; });
      }
    }
    Logger.log('[ddMarkSent] coorte=' + coorte + ' registrate=' + rows.length);
    return { ok: true, registrate: rows.length };
  } catch (e) { Logger.log('[ddMarkSent] ' + e.message); return { ok: false, error: e.message }; }
}

/**
 * COERENZA TIPOLOGICA: la risorsa ha la natura giusta per la sezione?
 *  - bando: serve un link E (ente O scadenza), e il titolo non deve avere
 *    forma di pubblicazione/report/evento (i falsi-bandi visti in produzione).
 *  - altri tipi: basta un titolo non vuoto (la natura è data dal foglio di origine).
 */
function ddTipoCoerente(tipo, item) {
  if (!item) return false;
  var tit = String(item.titolo || item.Titolo || '').trim();
  if (!tit) return false;
  if (String(tipo) === 'bando') {
    var link = String(item.link || item.url || item.url_bando || item.URL || '').trim();
    var ente = String(item.ente || item.Ente || '').trim();
    var scad = item.scadenza || item.Scadenza || item.giorni;
    var nonBando = /^(rapporto|report annuale|minicifre|newsletter|calendario|bilancio|atti del|programma culturale|performance dei|aggiunti al)/i.test(tit);
    return !!link && (!!ente || !!scad) && !nonBando;
  }
  return true;
}

/**
 * v4.27.59 — MAX N CONTENUTI PER FONTE (richiesta Silvano 29/07): in un digest
 * non devono uscire più di 2 pezzi dalla stessa testata — non è elegante.
 * Mantiene l'ordine di ingresso (già ordinato per rilevanza a monte) e tiene
 * i primi N per fonte; le risorse senza fonte non vengono limitate.
 */
function ddCapPerFonte(items, maxPerFonte) {
  var cap = Number(maxPerFonte) || 2;
  var visti = {};
  return (items || []).filter(function (it) {
    var f = String((it && (it.fonte || it.Fonte)) || '').trim().toLowerCase();
    if (!f) return true;
    visti[f] = (visti[f] || 0) + 1;
    return visti[f] <= cap;
  });
}

/** Pulizia registro: elimina le righe più vecchie di N giorni (default 180). */
function ddPrune(giorni) {
  giorni = Number(giorni) || 180;
  try {
    var sh = _ddSheet_();
    if (sh.getLastRow() < 2) return { ok: true, eliminate: 0 };
    var cutoff = new Date(Date.now() - giorni * 86400000);
    var v = sh.getDataRange().getValues();
    var del = [];
    for (var r = v.length - 1; r >= 1; r--) {
      var d = v[r][3];
      var dt = (d instanceof Date) ? d : (d ? new Date(d) : null);
      if (dt && !isNaN(dt.getTime()) && dt < cutoff) del.push(r + 1);
    }
    del.forEach(function (row) { try { sh.deleteRow(row); } catch (_) {} });
    Logger.log('[ddPrune] eliminate ' + del.length + ' righe >' + giorni + 'gg');
    return { ok: true, eliminate: del.length };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Self-test della sola logica (nessuna scrittura su foglio). */
function ddSelfTest() {
  // v4.28.20 — la finestra deve essere piu' corta della durata del registro:
  // se fossero uguali, il filtro tornerebbe a svuotare le sezioni.
  var casi = [
    { nome: 'chiave da url normalizzato', ok: _ddChiave_('news', { link: 'https://www.exibart.com/articolo/?utm=x' }) === 'news|exibart.com/articolo' },
    { nome: 'chiave da id senza url',     ok: _ddChiave_('bando', { id: 'B123' }) === 'bando|B123' },
    { nome: 'chiave da titolo fallback',  ok: _ddChiave_('libro', { titolo: '  Il Museo  Relazionale ' }).indexOf('libro|T:il museo relazionale') === 0 },
    { nome: 'item vuoto → chiave vuota',  ok: _ddChiave_('news', {}) === '' },
    { nome: 'bando valido passa',         ok: ddTipoCoerente('bando', { titolo: 'Avviso pubblico musei', url: 'https://x.it/b', ente: 'MiC' }) === true },
    { nome: 'bando senza link bocciato',  ok: ddTipoCoerente('bando', { titolo: 'Avviso pubblico musei', ente: 'MiC' }) === false },
    { nome: 'rapporto non è un bando',    ok: ddTipoCoerente('bando', { titolo: 'Rapporto sociale 2024', url: 'https://x.it', ente: 'Ente' }) === false },
    { nome: 'minicifre non è un bando',   ok: ddTipoCoerente('bando', { titolo: 'Minicifre della cultura. Edizione 2025', url: 'https://x.it', scadenza: '01/09/2026' }) === false },
    { nome: 'news con titolo passa',      ok: ddTipoCoerente('news', { titolo: 'Nuova mostra' }) === true },
    { nome: 'news senza titolo bocciata', ok: ddTipoCoerente('news', {}) === false }
  ];
  var falliti = casi.filter(function (c) { return !c.ok; });
  Logger.log('[ddSelfTest] ' + (casi.length - falliti.length) + '/' + casi.length + ' ok' + (falliti.length ? ' — FALLITI: ' + falliti.map(function (c) { return c.nome; }).join(', ') : ''));
  // v4.27.94 — pass/fail numerici per il runner unificato (mostrava 0/0)
  return { ok: falliti.length === 0, pass: casi.length - falliti.length, fail: falliti.length,
           totale: casi.length, falliti: falliti.map(function (c) { return c.nome; }) };
}
