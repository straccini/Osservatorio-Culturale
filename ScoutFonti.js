// ============================================================================
// ScoutFonti.js — Fase 3: agenti di ricerca fonti (Scout-Miner + Università)
// v4.28.3 — 2026-08-02
// (docs/superpowers/plans/2026-08-02-regia-fonti-tassonomia.md)
//
// SPECIFICHE CONFERMATE (Silvano, 02/08 sera):
//   - Il miner scava in TUTTE le fonti già censite, con gradualità: piccole
//     quote ogni giorno, lavoro continuo e minuzioso senza cadenze forzate
//   - Ciclo SETTIMANALE di conferma/scarto delle candidate trovate
//   - MEMORIA PERMANENTE: una fonte scartata o già integrata non rientra
//     MAI più nelle valutazioni successive
//   - Università italiane: news di dipartimento + ricerca
//   - Newsletter: l'agente propone con link pronto, l'iscrizione su
//     sinopiaconsulting@gmail.com la fa l'admin (niente iscrizioni automatiche)
//   - Nessuna fonte entra in produzione senza approvazione admin: le
//     approvate entrano nel RegistroFonti in stato QUARANTENA
//
// Flusso settimanale:
//   1. il miner accumula candidate in FontiCandidate (Stato=in_valutazione)
//   2. domenica 17:00 scSettimanale() manda il riepilogo (email+Telegram)
//   3. l'admin apre il foglio FontiCandidate e imposta Stato = approvata
//      oppure scartata sulle righe da decidere
//   4. il bottone "Applica decisioni" (scApplicaDecisioni) porta le approvate
//      nel RegistroFonti (quarantena) e sigilla le scartate per sempre
// ============================================================================

var SC_SHEET = 'FontiCandidate';
var SC_HEADERS = [
  'ID', 'Nome', 'Dominio', 'URLPagina', 'FeedRilevato', 'Metodo',
  'CategoriaProposta', 'TrovataDa', 'Provenienza', 'Occorrenze',
  'DataTrovata', 'Stato', 'DataDecisione', 'Note'
];

// Domini che non saranno MAI proposti come fonte (piattaforme generaliste)
var SC_BLACKLIST_RE = /(facebook\.|youtube\.|youtu\.be|twitter\.|x\.com|instagram\.|linkedin\.|google\.|wikipedia\.|amazon\.|apple\.|spotify\.|whatsapp\.|telegram\.|tiktok\.|doi\.org|bit\.ly|t\.co\b|mailchi\.mp|substack\.com\/?$|gov\.uk|w3\.org|creativecommons\.)/i;

// Atenei italiani con facoltà/dipartimenti cultura, beni culturali, turismo.
// Sono SEED del canale università: passano comunque dalla coda di approvazione.
var SC_UNIVERSITA = [
  { nome: 'Università di Bologna — Magazine', url: 'https://magazine.unibo.it' },
  { nome: 'Ca\' Foscari Venezia', url: 'https://www.unive.it' },   // v4.28.5: /news era 404 (verifica online)
  { nome: 'IULM Milano', url: 'https://www.iulm.it' },
  { nome: 'Università di Macerata', url: 'https://www.unimc.it' },
  { nome: 'Federico II Napoli', url: 'https://www.unina.it' },
  { nome: 'Sapienza Roma', url: 'https://www.uniroma1.it' },
  { nome: 'Statale Milano — News', url: 'https://lastatalenews.unimi.it' },
  { nome: 'Università di Bergamo', url: 'https://www.unibg.it' },
  { nome: 'Università di Firenze', url: 'https://www.unifi.it' },
  { nome: 'Università di Pisa', url: 'https://www.unipi.it' },
  { nome: 'Università di Padova', url: 'https://www.unipd.it' },
  { nome: 'Università di Torino', url: 'https://www.unito.it' },
  { nome: 'Università del Salento', url: 'https://www.unisalento.it' },
  { nome: 'Università di Palermo', url: 'https://www.unipa.it' },
  { nome: 'IUAV Venezia', url: 'https://www.iuav.it' },
  { nome: 'IMT Scuola Alti Studi Lucca', url: 'https://www.imtlucca.it' },
  { nome: 'Università della Tuscia', url: 'https://www.unitus.it' },
  { nome: 'Università di Perugia', url: 'https://www.unipg.it' },
  { nome: 'L\'Orientale Napoli', url: 'https://www.unior.it' },
  { nome: 'Cattolica — News', url: 'https://www.cattolicanews.it' },
  { nome: 'Università di Siena', url: 'https://www.unisi.it' },
  { nome: 'Roma Tre', url: 'https://www.uniroma3.it' }
];

// ---------------------------------------------------------------------------
// Infrastruttura
// ---------------------------------------------------------------------------

function _scSheet_(crea) {
  var ss = getMainSS();
  var sh = ss.getSheetByName(SC_SHEET);
  if (!sh && crea) {
    sh = ss.insertSheet(SC_SHEET);
    sh.getRange(1, 1, 1, SC_HEADERS.length).setValues([SC_HEADERS])
      .setFontWeight('bold').setBackground('#B8351A').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Dominio normalizzato: host minuscolo senza www. '' se non valido. */
function _scDominio_(url) {
  var m = String(url || '').match(/^https?:\/\/([^\/\?#]+)/i);
  if (!m) return '';
  return m[1].toLowerCase().replace(/^www\./, '');
}

/**
 * MEMORIA PERMANENTE delle decisioni: l'insieme dei domini che non vanno
 * più proposti — tutte le candidate (qualunque Stato: anche le scartate
 * restano nel foglio come registro storico) + tutte le fonti già presenti
 * nel RegistroFonti, in FontiFeed e in FontiBandi_v5.
 */
function _scDominiDecisi_() {
  var set = {};
  var ss = getMainSS();
  function assorbi(nomeFoglio, colonne) {
    var sh = ss.getSheetByName(nomeFoglio);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getDataRange().getValues();
    var h = v[0].map(function (x) { return String(x || '').trim(); });
    var idx = colonne.map(function (c) { return h.indexOf(c); }).filter(function (i) { return i >= 0; });
    for (var r = 1; r < v.length; r++) {
      idx.forEach(function (i) {
        var d = _scDominio_(v[r][i]);
        if (d) set[d] = true;
      });
    }
  }
  assorbi(SC_SHEET, ['URLPagina', 'FeedRilevato', 'Dominio']);
  assorbi('RegistroFonti', ['URL_Feed', 'URL_Sito']);
  assorbi('FontiFeed', ['URL_Feed', 'URL_Sito']);
  assorbi('FontiBandi_v5', ['URL', 'RSS_URL', 'URL_Feed']);
  assorbi('SocialFonti', ['URL']);
  // il foglio candidate indicizza anche per colonna Dominio (testo puro)
  var shc = ss.getSheetByName(SC_SHEET);
  if (shc && shc.getLastRow() > 1) {
    var vc = shc.getDataRange().getValues();
    var hd = vc[0].map(function (x) { return String(x || '').trim(); });
    var iD = hd.indexOf('Dominio');
    for (var r2 = 1; r2 < vc.length; r2++) {
      var dd = String(vc[r2][iD] || '').toLowerCase().replace(/^www\./, '');
      if (dd) set[dd] = true;
    }
  }
  return set;
}

/**
 * Autodiscovery del feed di un sito: <link rel="alternate"> nella home,
 * poi i percorsi comuni. Ritorna { feed:'url'|'' , metodo:'rss'|'newsletter'|'nessuno', linkIscrizione:'' }.
 */
function _scFeedDiscovery_(urlSito) {
  var esito = { feed: '', metodo: 'nessuno', linkIscrizione: '' };
  var html = '';
  try {
    var r = UrlFetchApp.fetch(urlSito, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioScout/1.0)' } });
    if (r.getResponseCode() === 200) html = r.getContentText().substring(0, 120000);
  } catch (e) { return esito; }

  // 1. <link rel="alternate" type="application/rss+xml|atom+xml" href="...">
  var m = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i);
  if (m) {
    var href = m[0].match(/href=["']([^"']+)["']/i);
    if (href) {
      var f = href[1];
      if (f.indexOf('http') !== 0) f = urlSito.replace(/\/+$/, '') + (f.indexOf('/') === 0 ? '' : '/') + f;
      esito.feed = f; esito.metodo = 'rss';
      return esito;
    }
  }
  // 2. percorsi comuni
  var base = urlSito.replace(/\/+$/, '');
  var tentativi = ['/feed/', '/rss', '/feed', '/rss.xml', '/atom.xml', '/it/feed/'];
  for (var i = 0; i < tentativi.length; i++) {
    try {
      var rf = UrlFetchApp.fetch(base + tentativi[i], { muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioScout/1.0)' } });
      if (rf.getResponseCode() === 200) {
        var corpo = rf.getContentText().substring(0, 2000);
        if (/<(rss|feed|channel)[\s>]/i.test(corpo)) {
          esito.feed = base + tentativi[i]; esito.metodo = 'rss';
          return esito;
        }
      }
    } catch (e2) {}
    Utilities.sleep(150);
  }
  // 3. niente feed: c'è una newsletter? (proposta manuale, MAI iscrizione automatica)
  var nl = html.match(/<a[^>]+href=["']([^"']*(?:newsletter|iscriviti|subscribe)[^"']*)["']/i);
  if (nl) {
    var lk = nl[1];
    if (lk.indexOf('http') !== 0) lk = base + (lk.indexOf('/') === 0 ? '' : '/') + lk;
    esito.metodo = 'newsletter'; esito.linkIscrizione = lk;
  }
  return esito;
}

/**
 * v4.28.6 SICUREZZA — sanitizzazione anti formula-injection sui campi testuali
 * di origine ESTERNA (metadati Crossref, HTML dei siti). Stesso pattern adottato
 * in v4.23.2 per lo scanner news (saveItem). Necessario qui perché il ciclo
 * settimanale prevede che l'admin APRA il foglio FontiCandidate per decidere:
 * una formula in cella verrebbe valutata alla visualizzazione e potrebbe
 * esfiltrare dati di altri fogli dello stesso spreadsheet (es. MailingList).
 * Fallback locale se l'helper globale non è caricato.
 */
function _scSafe_(v) {
  if (typeof _sanitizeForCell_ === 'function') return _sanitizeForCell_(v);
  var s = String(v == null ? '' : v);
  return /^[=+@\-]/.test(s) ? ("'" + s) : s;
}

/** Scrive una candidata (per nome colonna). Ritorna false se dominio già deciso. */
function _scProponi_(cand, decisi) {
  var dom = cand.dominio || _scDominio_(cand.urlPagina);
  if (!dom || decisi[dom] || SC_BLACKLIST_RE.test(dom)) return false;
  // v4.28.6 SICUREZZA: solo http(s). Le URL arrivano da HTML esterno e da
  // metadati Crossref e finiscono in UrlFetchApp: uno schema diverso
  // (javascript:, data:, file:) non deve mai entrare nel registro.
  if (cand.urlPagina && !/^https?:\/\//i.test(String(cand.urlPagina))) return false;
  if (cand.feed && !/^https?:\/\//i.test(String(cand.feed))) { cand.feed = ''; cand.metodo = 'nessuno'; }
  decisi[dom] = true;
  var sh = _scSheet_(true);
  var riga = new Array(SC_HEADERS.length);
  for (var i = 0; i < SC_HEADERS.length; i++) riga[i] = '';
  function set(c, v) { var j = SC_HEADERS.indexOf(c); if (j >= 0) riga[j] = v; }
  set('ID', 'SC' + Date.now() + '_' + Math.random().toString(36).substr(2, 3));
  set('Nome', _scSafe_(cand.nome || dom));
  set('Dominio', _scSafe_(dom));
  set('URLPagina', _scSafe_(cand.urlPagina || ''));
  set('FeedRilevato', _scSafe_(cand.feed || ''));
  set('Metodo', cand.metodo || 'nessuno');           // valore interno controllato
  set('CategoriaProposta', cand.categoria || 'news'); // valore interno controllato
  set('TrovataDa', cand.trovataDa);                   // valore interno controllato
  set('Provenienza', _scSafe_(cand.provenienza || ''));
  set('Occorrenze', Number(cand.occorrenze) || 1);
  set('DataTrovata', new Date());
  set('Stato', 'in_valutazione');
  set('Note', _scSafe_(cand.note || ''));
  sh.appendRow(riga);
  return true;
}

// ---------------------------------------------------------------------------
// MINER 1 — link dentro le news già censite (graduale, con puntatore)
// ---------------------------------------------------------------------------

function scMinerNews(opts) {
  opts = opts || {};
  var cap = opts.cap || 8;               // articoli per run: gradualità
  var maxProposte = opts.maxProposte || 5;
  var ss = getMainSS();
  var sh = ss.getSheetByName('Items');
  if (!sh || sh.getLastRow() < 2) return { ok: false, errore: 'Items vuoto' };

  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iUrl = h.indexOf('FonteURL'), iTit = h.indexOf('Titolo');
  var props = PropertiesService.getScriptProperties();
  var idx = Number(props.getProperty('SC_MINER_IDX') || 0);
  var decisi = _scDominiDecisi_();
  var contati = {};   // dominio → { n, esempio }
  var esaminati = 0;

  // scorre le news dalla più recente, riparte da dove era arrivato
  var righe = [];
  for (var r = v.length - 1; r >= 1; r--) if (v[r][iUrl]) righe.push(r);
  for (var k = idx; k < righe.length && esaminati < cap; k++) {
    var rr = righe[k];
    try {
      var resp = UrlFetchApp.fetch(String(v[rr][iUrl]), { muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioScout/1.0)' } });
      if (resp.getResponseCode() === 200) {
        var html = resp.getContentText().substring(0, 150000);
        var artDom = _scDominio_(String(v[rr][iUrl]));
        var mm, reA = /href=["'](https?:\/\/[^"']+)["']/gi;
        while ((mm = reA.exec(html)) !== null) {
          var d = _scDominio_(mm[1]);
          if (!d || d === artDom || decisi[d] || SC_BLACKLIST_RE.test(d)) continue;
          if (!contati[d]) contati[d] = { n: 0, esempio: mm[1], articolo: String(v[rr][iTit] || '').substring(0, 70) };
          contati[d].n++;
        }
      }
    } catch (e) {}
    esaminati++;
    Utilities.sleep(300);
  }
  props.setProperty('SC_MINER_IDX', String((idx + esaminati) % Math.max(1, righe.length)));

  // propone i domini più citati (con feed discovery)
  var ordinati = Object.keys(contati).sort(function (a, b) { return contati[b].n - contati[a].n; });
  var proposte = 0, dettagli = [];
  for (var p = 0; p < ordinati.length && proposte < maxProposte; p++) {
    var dom = ordinati[p];
    var disc = _scFeedDiscovery_('https://' + dom);
    var okP = _scProponi_({
      dominio: dom, nome: dom, urlPagina: 'https://' + dom,
      feed: disc.feed, metodo: disc.metodo,
      categoria: 'news', trovataDa: 'miner-news',
      provenienza: 'citato in: ' + contati[dom].articolo,
      occorrenze: contati[dom].n,
      note: disc.linkIscrizione ? ('Iscrizione newsletter (manuale): ' + disc.linkIscrizione) : ''
    }, decisi);
    if (okP) { proposte++; dettagli.push(dom + ' (' + contati[dom].n + '×, ' + disc.metodo + ')'); }
  }
  var rep = { ok: true, articoliEsaminati: esaminati, puntatore: (idx + esaminati), dominiVisti: ordinati.length, proposte: proposte, dettagli: dettagli };
  Logger.log('[scMinerNews] ' + JSON.stringify(rep));
  return rep;
}

// ---------------------------------------------------------------------------
// MINER 2 — bibliografie delle pubblicazioni (Crossref references)
// ---------------------------------------------------------------------------

function scMinerBiblio(opts) {
  opts = opts || {};
  var cap = opts.cap || 4;
  var ss = getMainSS();
  var sh = ss.getSheetByName('Pubblicazioni');
  if (!sh || sh.getLastRow() < 2) return { ok: false, errore: 'Pubblicazioni vuoto' };

  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iLink = h.indexOf('Link'), iTit = h.indexOf('Titolo');
  var props = PropertiesService.getScriptProperties();
  var idx = Number(props.getProperty('SC_BIBLIO_IDX') || 0);
  var decisi = _scDominiDecisi_();

  // pubblicazioni con DOI nel link
  var conDoi = [];
  for (var r = 1; r < v.length; r++) {
    var mDoi = String(v[r][iLink] || '').match(/10\.\d{4,}\/[^\s\/"']+/);
    if (mDoi) conDoi.push({ doi: mDoi[0], titolo: String(v[r][iTit] || '') });
  }
  if (!conDoi.length) return { ok: true, doiTotali: 0, proposte: 0 };

  var esaminate = 0, proposte = 0, dettagli = [];
  for (var k = 0; k < cap && conDoi.length; k++) {
    var pub = conDoi[(idx + k) % conDoi.length];
    try {
      var resp = UrlFetchApp.fetch('https://api.crossref.org/works/' + encodeURIComponent(pub.doi),
        { muteHttpExceptions: true, headers: { 'User-Agent': 'OsservatorioScout/1.0 (mailto:sinopiaconsulting@gmail.com)' } });
      if (resp.getResponseCode() === 200) {
        var msg = JSON.parse(resp.getContentText()).message || {};
        var refs = msg.reference || [];
        refs.forEach(function (ref) {
          if (proposte >= 3) return;
          var u = ref.URL || '';
          var d = _scDominio_(u);
          if (!d || decisi[d] || SC_BLACKLIST_RE.test(d)) return;
          var disc = _scFeedDiscovery_('https://' + d);
          if (_scProponi_({
            dominio: d, nome: (ref['container-title'] || ref.unstructured || d).toString().substring(0, 60),
            urlPagina: u, feed: disc.feed, metodo: disc.metodo,
            categoria: 'libri', trovataDa: 'miner-biblio',
            provenienza: 'bibliografia di: ' + pub.titolo.substring(0, 70),
            note: disc.linkIscrizione ? ('Iscrizione newsletter (manuale): ' + disc.linkIscrizione) : ''
          }, decisi)) { proposte++; dettagli.push(d); }
        });
      }
    } catch (e) {}
    esaminate++;
    Utilities.sleep(400);
  }
  props.setProperty('SC_BIBLIO_IDX', String((idx + esaminate) % conDoi.length));
  var rep = { ok: true, doiTotali: conDoi.length, esaminate: esaminate, proposte: proposte, dettagli: dettagli };
  Logger.log('[scMinerBiblio] ' + JSON.stringify(rep));
  return rep;
}

/** Run quotidiano del miner: piccole quote, lavoro continuo. */
function scMinerRun() {
  var out = { news: null, biblio: null };
  try { out.news = scMinerNews({}); } catch (e) { out.news = { errore: e.message }; }
  try { out.biblio = scMinerBiblio({}); } catch (e2) { out.biblio = { errore: e2.message }; }
  return out;
}

// ---------------------------------------------------------------------------
// SCOUT UNIVERSITÀ — atenei italiani cultura/turismo (settimanale)
// ---------------------------------------------------------------------------

function scUniversitaRun(opts) {
  opts = opts || {};
  var cap = opts.cap || 6;   // atenei per run (graduale: il giro completo in ~4 settimane)
  var props = PropertiesService.getScriptProperties();
  var idx = Number(props.getProperty('SC_UNI_IDX') || 0);
  var decisi = _scDominiDecisi_();
  var proposte = 0, esaminati = 0, dettagli = [];

  for (var k = 0; k < cap; k++) {
    var uni = SC_UNIVERSITA[(idx + k) % SC_UNIVERSITA.length];
    esaminati++;
    var dom = _scDominio_(uni.url);
    if (decisi[dom]) continue;
    var disc = _scFeedDiscovery_(uni.url);
    if (_scProponi_({
      dominio: dom, nome: uni.nome, urlPagina: uni.url,
      feed: disc.feed, metodo: disc.metodo,
      categoria: 'news', trovataDa: 'universita',
      provenienza: 'seed atenei cultura/turismo',
      note: (disc.linkIscrizione ? ('Iscrizione newsletter (manuale): ' + disc.linkIscrizione + ' · ') : '') +
            'Ricerca: repository IRIS/OpenAIRE in seconda battuta'
    }, decisi)) { proposte++; dettagli.push(uni.nome + ' (' + disc.metodo + ')'); }
    Utilities.sleep(400);
  }
  props.setProperty('SC_UNI_IDX', String((idx + esaminati) % SC_UNIVERSITA.length));
  var rep = { ok: true, esaminati: esaminati, proposte: proposte, dettagli: dettagli };
  Logger.log('[scUniversitaRun] ' + JSON.stringify(rep));
  return rep;
}

// ---------------------------------------------------------------------------
// CICLO SETTIMANALE — riepilogo e applicazione decisioni
// ---------------------------------------------------------------------------

/** Domenica 17:00 — riepilogo delle candidate in attesa (email + Telegram). */
function scSettimanale() {
  var sh = _scSheet_(false);
  if (!sh || sh.getLastRow() < 2) return { ok: true, pendenti: 0 };
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iStato = h.indexOf('Stato'), iNome = h.indexOf('Nome'), iMet = h.indexOf('Metodo'),
      iDa = h.indexOf('TrovataDa'), iProv = h.indexOf('Provenienza');
  var pendenti = [];
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][iStato]) === 'in_valutazione') {
      pendenti.push('· ' + v[r][iNome] + ' [' + v[r][iMet] + ', ' + v[r][iDa] + '] — ' + String(v[r][iProv] || '').substring(0, 60));
    }
  }
  if (!pendenti.length) return { ok: true, pendenti: 0 };

  var corpo = 'Fonti candidate in attesa di decisione: ' + pendenti.length + '\n\n' +
    pendenti.slice(0, 30).join('\n') +
    (pendenti.length > 30 ? '\n… e altre ' + (pendenti.length - 30) : '') +
    '\n\nCome decidere: aprire il foglio FontiCandidate, impostare Stato =\n' +
    'approvata oppure scartata, poi premere "Scout: applica decisioni" nel\n' +
    'pannello Strumenti. Le approvate entrano nel Registro in QUARANTENA;\n' +
    'le scartate non verranno mai più riproposte.';
  try {
    MailApp.sendEmail('s.straccini@gmail.com', '[OCS] Scout fonti — ' + pendenti.length + ' candidate da decidere', corpo);
  } catch (e) { Logger.log('[scSettimanale] email: ' + e.message); }
  try {
    if (typeof sendTelegram === 'function') sendTelegram('🔭 *Scout fonti*: ' + pendenti.length + ' candidate in attesa di conferma/scarto (dettagli via email)');
  } catch (e2) {}
  return { ok: true, pendenti: pendenti.length };
}

/**
 * Applica le decisioni prese sul foglio: approvata → RegistroFonti in
 * quarantena; scartata → sigillata (memoria permanente). Idempotente.
 */
function scApplicaDecisioni() {
  var sh = _scSheet_(false);
  if (!sh || sh.getLastRow() < 2) return { ok: true, applicate: 0 };
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  function c(n) { return h.indexOf(n); }
  var iStato = c('Stato'), iDec = c('DataDecisione'), iNome = c('Nome'), iFeed = c('FeedRilevato'),
      iUrlP = c('URLPagina'), iMet = c('Metodo'), iCat = c('CategoriaProposta'), iDa = c('TrovataDa'), iNote = c('Note');
  var approvate = 0, scartate = 0, senzaFeed = [];

  for (var r = 1; r < v.length; r++) {
    var stato = String(v[r][iStato] || '').toLowerCase().trim();
    if (v[r][iDec]) continue;                       // già processata
    if (stato !== 'approvata' && stato !== 'scartata') continue;

    if (stato === 'approvata') {
      var metodo = String(v[r][iMet] || 'nessuno');
      var urlFeed = String(v[r][iFeed] || '');
      if (metodo === 'rss' && urlFeed) {
        // nel registro unico, in QUARANTENA (contenuti non esposti finché
        // la fonte non dimostra 2 settimane di produzione pulita)
        var shR = getMainSS().getSheetByName('RegistroFonti');
        if (shR && typeof RF_HEADERS !== 'undefined') {
          var hr = shR.getRange(1, 1, 1, shR.getLastColumn()).getValues()[0].map(function (x) { return String(x || '').trim(); });
          // v4.28.6 SICUREZZA: ri-sanifica alla copia — il foglio candidate è
          // editabile a mano, quindi non si assume che il contenuto sia pulito
          var riga = _rfRiga_(hr, {
            id: 'RFSC_' + Date.now() + '_' + r,
            categoria: String(v[r][iCat] || 'news'), nome: _scSafe_(String(v[r][iNome] || '')),
            urlFeed: _scSafe_(urlFeed), urlSito: _scSafe_(String(v[r][iUrlP] || '')),
            formato: 'rss', stato: 'quarantena',
            origine: 'scout:' + String(v[r][iDa] || ''),
            approvataDa: 'admin (foglio FontiCandidate)',
            note: _scSafe_(String(v[r][iNote] || ''))
          });
          shR.getRange(shR.getLastRow() + 1, 1, 1, hr.length).setValues([riga]);
        }
      } else if (metodo === 'newsletter') {
        senzaFeed.push(String(v[r][iNome] || '') + ' → iscrizione manuale: ' + String(v[r][iNote] || ''));
      } else {
        senzaFeed.push(String(v[r][iNome] || '') + ' → nessun canale rilevato, servirà verifica manuale');
      }
      approvate++;
    } else {
      scartate++;   // resta nel foglio: memoria permanente anti-riproposta
    }
    sh.getRange(r + 1, iDec + 1).setValue(new Date());
  }
  var rep = { ok: true, approvate: approvate, scartate: scartate, daGestireManualmente: senzaFeed };
  Logger.log('[scApplicaDecisioni] ' + JSON.stringify(rep));
  return rep;
}

// ---------------------------------------------------------------------------
// Stato + riparazioni
// ---------------------------------------------------------------------------

function scStato() {
  var sh = _scSheet_(false);
  if (!sh) return { ok: true, foglio: 'non ancora creato (si crea alla prima proposta)' };
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iStato = h.indexOf('Stato'), iDa = h.indexOf('TrovataDa'), iMet = h.indexOf('Metodo');
  var per = { in_valutazione: 0, approvata: 0, scartata: 0 }, perOrigine = {}, perMetodo = {};
  for (var r = 1; r < v.length; r++) {
    var s = String(v[r][iStato] || '?');
    per[s] = (per[s] || 0) + 1;
    var o = String(v[r][iDa] || '?'); perOrigine[o] = (perOrigine[o] || 0) + 1;
    var m = String(v[r][iMet] || '?'); perMetodo[m] = (perMetodo[m] || 0) + 1;
  }
  var props = PropertiesService.getScriptProperties();
  return { ok: true, totale: sh.getLastRow() - 1, perStato: per, perOrigine: perOrigine, perMetodo: perMetodo,
           puntatori: { minerNews: props.getProperty('SC_MINER_IDX') || 0,
                        biblio: props.getProperty('SC_BIBLIO_IDX') || 0,
                        universita: props.getProperty('SC_UNI_IDX') || 0 } };
}

/**
 * ANCI (verifica approfondita 02/08): il dominio senza www NON risolve
 * (DNS), ma https://www.anci.it/rss è vivo e aggiornato. I feed di
 * categoria (/category/bandi/feed/) rispondono 200 ma sono VUOTI: si usa
 * il feed generale col filtro cultura a valle. Questa funzione corregge
 * l'URL della fonte ANCI ovunque sia registrata.
 */
function scRiparaAnci() {
  var corrette = 0, ss = getMainSS();
  ['FontiFeed', 'RegistroFonti', 'Fonti'].forEach(function (nomeFoglio) {
    var sh = ss.getSheetByName(nomeFoglio);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getDataRange().getValues();
    var h = v[0].map(function (x) { return String(x || '').trim(); });
    ['URL_Feed', 'RSSURL', 'URL'].forEach(function (col) {
      var i = h.indexOf(col);
      if (i < 0) return;
      for (var r = 1; r < v.length; r++) {
        var u = String(v[r][i] || '');
        if (/^https?:\/\/(www\.)?anci\.it/i.test(u) && u !== 'https://www.anci.it/rss') {
          sh.getRange(r + 1, i + 1).setValue('https://www.anci.it/rss');
          corrette++;
        }
      }
    });
  });
  return { ok: true, corrette: corrette, nota: 'Feed vivo: https://www.anci.it/rss (categoria bandi vuota, si filtra a valle)' };
}

// ---------------------------------------------------------------------------
// Self-test (offline)
// ---------------------------------------------------------------------------

function scSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function eq(nome, atteso, ottenuto) {
    if (String(atteso) === String(ottenuto)) pass++;
    else { fail++; falliti.push(nome + ': atteso ' + atteso + ', ottenuto ' + ottenuto); }
  }
  eq('dominio normalizzato', 'anci.it', _scDominio_('https://www.anci.it/rss'));
  eq('dominio con porta/path', 'museo.it', _scDominio_('http://museo.it/mostre?id=3'));
  eq('dominio non valido', '', _scDominio_('non-un-url'));
  eq('blacklist facebook', true, SC_BLACKLIST_RE.test('facebook.com'));
  eq('blacklist youtube', true, SC_BLACKLIST_RE.test('youtube.com'));
  eq('non in blacklist', false, SC_BLACKLIST_RE.test('fondazionefitzcarraldo.it'));
  // catalogo università: domini tutti validi e senza duplicati
  var visti = {}, dup = 0, invalidi = 0;
  SC_UNIVERSITA.forEach(function (u) {
    var d = _scDominio_(u.url);
    if (!d) invalidi++;
    if (visti[d]) dup++;
    visti[d] = true;
  });
  eq('atenei con URL validi', 0, invalidi);
  eq('atenei senza duplicati', 0, dup);
  eq('atenei almeno 20', true, SC_UNIVERSITA.length >= 20);
  // schema candidate senza colonne duplicate
  var seen = {}, dupH = 0;
  SC_HEADERS.forEach(function (n) { if (seen[n]) dupH++; seen[n] = 1; });
  eq('header candidate senza duplicati', 0, dupH);
  // SICUREZZA v4.28.6 — anti formula-injection (security review 02/08).
  // I metadati Crossref e l'HTML esterno finiscono in un foglio che l'admin
  // APRE per il ciclo settimanale: una formula verrebbe valutata lì.
  eq('formula = neutralizzata', "'=IMPORTXML(\"http://evil\")", _scSafe_('=IMPORTXML("http://evil")'));
  eq('formula + neutralizzata', "'+cmd", _scSafe_('+cmd'));
  eq('formula @ neutralizzata', "'@SUM(A1)", _scSafe_('@SUM(A1)'));
  eq('formula - neutralizzata', "'-1+1", _scSafe_('-1+1'));
  eq('testo normale intatto', 'Museo Egizio', _scSafe_('Museo Egizio'));
  eq('null gestito', '', _scSafe_(null));
  // schema URL: solo http(s) può entrare
  eq('javascript: rifiutato', false, /^https?:\/\//i.test('javascript:alert(1)'));
  eq('data: rifiutato', false, /^https?:\/\//i.test('data:text/html,<script>'));
  eq('https accettato', true, /^https?:\/\//i.test('https://museo.it/feed'));
  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
