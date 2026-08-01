// ============================================================================
//  FontiRegia.js — Governo delle fonti bandi per PRIORITÀ (tier A/B/C)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · v4.27.75 (2026-07-31)
//
//  PERCHÉ: il 31/07 su 408 bandi esaminati 274 erano voci di menu di siti GAL
//  ("Commercio e turismo", "La Strategia LEADER", "Incontri di concertazione").
//  Trattare TED e un GAL con la stessa soglia produce rumore che soffoca il
//  segnale. Il tier governa: soglia di ingresso, ordine di esposizione,
//  attenzione nel monitoraggio.
//
//  La colonna 'Priorita' di FontiBandi_v5 (COL_F_HEADERS) diventa il campo
//  operativo: 'A' | 'B' | 'C'.
//    A — nazionali/UE/MEPA: TED, EU Portal, Creative Europe, MiC, ANAC, Consip
//    B — regionali e fondazioni maggiori
//    C — GAL, fondazioni locali, associazioni, enti minori
// ============================================================================

var FR_SHEET = 'FontiBandi_v5';

/** Riconoscimento tier dal nome/URL della fonte. */
var FR_TIER_A_RE = /(\bted\b|tenders?\s*electronic|europa\.eu|ec\.europa|funding.*tender|creative\s*europe|europa\s*creativa|cultura\.gov|beniculturali|ministero|\bmic\b|\banac\b|bdncp|consip|mepa|acquistinretepa|pnrr|agenzia\s+(per\s+la\s+)?coesione|invitalia|cordis|horizon|interreg|erasmus)/i;
var FR_TIER_B_RE = /(regione|regional|citt[aà]\s+metropolitana|provincia\s+autonoma|fondazione\s+(cariplo|compagnia|crt|cariverona|caritro|con\s+il\s+sud)|compagnia\s+di\s+san\s*paolo|camera\s+di\s+commercio|unioncamere)/i;
// tutto il resto → C

/** @private */
function _frSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(FR_SHEET);
}

/** Tier di una fonte a partire da nome+url. @return {'A'|'B'|'C'} */
function frTierDaFonte(nome, url) {
  var t = String(nome || '') + ' ' + String(url || '');
  if (FR_TIER_A_RE.test(t)) return 'A';
  if (FR_TIER_B_RE.test(t)) return 'B';
  return 'C';
}

/**
 * Assegna il tier alle fonti che non ce l'hanno (o a tutte con force).
 * Idempotente: non sovrascrive le classificazioni già valide.
 * @param {Object} [opts] { force:false, dryRun:false }
 */
function frBackfillTier(opts) {
  opts = opts || {};
  var rep = { ok: true, dryRun: !!opts.dryRun, totale: 0, assegnati: 0, perTier: { A: 0, B: 0, C: 0 }, esempiA: [], esempiB: [] };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'foglio ' + FR_SHEET + ' assente o vuoto' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL'), iPri = head.indexOf('Priorita');
    if (iPri < 0) return { ok: false, error: 'colonna Priorita assente in ' + FR_SHEET };
    for (var r = 1; r < vals.length; r++) {
      if (!vals[r][iNome] && !vals[r][iUrl]) continue;
      rep.totale++;
      var attuale = String(vals[r][iPri] || '').trim().toUpperCase();
      if (attuale && 'ABC'.indexOf(attuale) >= 0 && attuale.length === 1 && !opts.force) { rep.perTier[attuale]++; continue; }
      var tier = frTierDaFonte(vals[r][iNome], vals[r][iUrl]);
      rep.perTier[tier]++;
      rep.assegnati++;
      if (tier === 'A' && rep.esempiA.length < 8) rep.esempiA.push(String(vals[r][iNome] || '').substring(0, 45));
      if (tier === 'B' && rep.esempiB.length < 8) rep.esempiB.push(String(vals[r][iNome] || '').substring(0, 45));
      if (!opts.dryRun) sh.getRange(r + 1, iPri + 1).setValue(tier);
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[frBackfillTier] assegnati=' + rep.assegnati + ' A=' + rep.perTier.A + ' B=' + rep.perTier.B + ' C=' + rep.perTier.C);
  return rep;
}

var _FR_CACHE_ = null;   // { nomeFonteLower: tier } — snapshot per esecuzione

/** Mappa {nomeFonte: tier} per lookup rapido in ingestione/esposizione. */
function frMappaTier() {
  var mappa = {};
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return mappa;
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL'), iPri = head.indexOf('Priorita');
    for (var r = 1; r < vals.length; r++) {
      var tier = String(vals[r][iPri] || '').trim().toUpperCase();
      if (tier.length !== 1 || 'ABC'.indexOf(tier) < 0) tier = frTierDaFonte(vals[r][iNome], vals[r][iUrl]);
      var nome = String(vals[r][iNome] || '').trim().toLowerCase();
      if (nome) mappa[nome] = tier;
    }
  } catch (e) { Logger.log('[frMappaTier] ' + e.message); }
  return mappa;
}

/**
 * Tier di un bando dal nome della sua fonte/ente.
 * Default 'C' (severo) solo se non si riconosce nulla: in dubbio si chiede
 * più prova, coerente con "meglio un bando in meno".
 */
function frTierBando(b) {
  if (!b) return 'C';
  var fonte = String(b.fonteNome || b.fonte || '').trim();
  var ente = String(b.ente || '').trim();
  var chiave = (fonte || ente).toLowerCase();
  if (!chiave) return 'C';
  if (!_FR_CACHE_) _FR_CACHE_ = frMappaTier();
  if (_FR_CACHE_[chiave]) return _FR_CACHE_[chiave];
  // fallback: riconoscimento diretto su fonte + ente (copre i bandi importati
  // da API senza corrispondenza esatta nel foglio fonti)
  return frTierDaFonte(fonte + ' ' + ente, String(b.link || b.url || ''));
}

/**
 * Salute delle fonti bandi per tier. Distingue i tre stati che contano:
 *   SILENTE  — scansionata di recente ma 0 record raccolti (non pubblica o è rotta)
 *   IN ERRORE — fail consecutivi ≥ 3
 *   SANA     — produce
 * I problemi sulle fonti di tier A pesano più di quelli sul tier C.
 */
function frSaluteFonti() {
  var rep = { ok: true, generato: Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy HH:mm'),
              perTier: {}, silenti: [], inErrore: [] };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'foglio fonti assente' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iPri = head.indexOf('Priorita'), iAtt = head.indexOf('Attiva');
    var iScan = head.indexOf('UltimaScan'), iTot = head.indexOf('NRecordTotali'), iFail = head.indexOf('FailConsecutivi');
    var ora = Date.now();
    ['A', 'B', 'C'].forEach(function (t) { rep.perTier[t] = { fonti: 0, attive: 0, scan7gg: 0, silenti: 0, inErrore: 0 }; });
    for (var r = 1; r < vals.length; r++) {
      var nome = String(vals[r][iNome] || '').trim();
      if (!nome) continue;
      // v4.27.75 — la colonna Priorita contiene ancora valori storici (1/2/3
      // o vuoto): senza questo fallback tutte le fonti risultavano tier C e
      // il KPI era inutile (verificato: 167 su 167 in C).
      var tier = String(vals[r][iPri] || '').trim().toUpperCase();
      if (tier.length !== 1 || 'ABC'.indexOf(tier) < 0) tier = frTierDaFonte(vals[r][iNome], head.indexOf('URL') >= 0 ? vals[r][head.indexOf('URL')] : '');
      var T = rep.perTier[tier];
      T.fonti++;
      var attivaRaw = vals[r][iAtt];
      var attiva = (attivaRaw === true || String(attivaRaw).toLowerCase() === 'true' || String(attivaRaw).toLowerCase() === 'si');
      if (!attiva) continue;
      T.attive++;
      var d = (iScan >= 0) ? _frData_(vals[r][iScan]) : null;
      var recente = d && (ora - d.getTime()) <= 7 * 86400000;
      if (recente) T.scan7gg++;
      var tot = Number(vals[r][iTot] || 0);
      if (recente && tot === 0) {
        T.silenti++;
        rep.silenti.push({ tier: tier, nome: nome.substring(0, 50) });
      }
      var fail = Number(vals[r][iFail] || 0);
      if (fail >= 3) {
        T.inErrore++;
        rep.inErrore.push({ tier: tier, nome: nome.substring(0, 50), fail: fail });
      }
    }
    var ord = { A: 0, B: 1, C: 2 };
    rep.silenti.sort(function (a, b) { return ord[a.tier] - ord[b.tier]; });
    rep.inErrore.sort(function (a, b) { return ord[a.tier] - ord[b.tier]; });
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  return rep;
}

/** @private data robusta (autonoma: il modulo non dipende da altri file) */
function _frData_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ============================================================================
//  NATURA DELLA FONTE — v4.27.84 (regola Silvano 31/07)
// ----------------------------------------------------------------------------
//  I due canali NON sono intercambiabili:
//    BANDI — fonti sicure per quella funzione. Ciò che conta è la SCADENZA
//            CERTA, l'ente che pubblica e le informazioni minime per capire
//            di cosa si tratta.
//    NEWS  — testate e magazine. Non hanno scadenza: contano la novità e la
//            categoria tematica di appartenenza.
//  Il 31/07 il canale bandi si era riempito di articoli di testate (Finestre
//  sull'Arte 60, Doppiozero 60, Tafter 30, The Art Newspaper 30, Exibart,
//  Artforum...): contenuti giusti, canale sbagliato. Quelle fonti alimentano
//  già la sezione News (4834 record) e qui vanno escluse.
// ============================================================================

/** Feed che pubblicano BANDI: il nome/URL lo dichiara esplicitamente. */
// v4.27.91 — il confine di parola DOPO "bandi" escludeva "BandiUp", che è una
// fonte di bandi per definizione (le sue voci: "Gara per illuminazione Parco
// Archeologico", "PR Puglia FESR - Avviso"). Ora il confine è PRIMA: prende
// "Bandi", "BandiUp", "bandi-cultura" e non prende "bandiera"/"abbandono".
// v4.27.93 — "bandi" va riconosciuto ovunque compaia nei nomi composti:
//   BandiUp        → all'inizio  (serve il confine PRIMA)
//   IndiceBandi    → alla fine   (serve il confine DOPO)
// Entrambe le forme sono fonti di bandi ed entrambe erano state scartate.
// L'unione delle due condizioni le prende; il lookahead (?!era) evita
// "Bandiera", e "abbandono/contrabbando" non hanno confine né prima né dopo.
var FR_NATURA_BANDI_RE = /((?:\bband[oi](?!era)|band[oi]\b)|\bbandi[- ]|avvis[oi]\b|opportunit|finanziament|contribut|\bgare?\b|appalt|concors|\bcall\b|tender|grant|funding|sovvenzion|\bpremi\b|\bborse?\b|graduatori|progettare\s+in\s+europa|obiettivo\s+europa|europroget)/i;

/** Testate/magazine/blog: canale NEWS, non bandi. */
var FR_NATURA_NEWS_RE = /(magazine|journal\b|giornale|quotidian|rivista|newspaper|news\b|notizie|notiziario|rassegna\s+stampa|blog\b|diary|press\b|approfondiment|editorial|artribune$|exibart|artforum|flash\s*art|doppiozero|tafter|finestre\s+sull|atp\s+diary|artuu|treccani|frizzifrizzi|we\s+make\s+money|agenda\s+digitale|il\s+giornale\s+dell|apollo\b|hyperallergic|domus|abitare)/i;

/**
 * ENTI che pubblicano bandi anche senza dirlo nel nome del feed: agenzie
 * regionali, fondazioni, portali appalti, consorzi, atenei.
 * Necessario perché una prima versione della regola classificava come "news"
 * fonti come "SCP — Servizio Contratti Pubblici (MIT)" e "ART-ER Emilia-
 * Romagna", che sono portali di bandi a tutti gli effetti.
 */
var FR_NATURA_ENTE_RE = /(fondazione|agenzia|art-?er\b|regione|provincia|comune\b|ministero|\bmit\b|servizio\s+contratti|contratti\s+pubblici|portale|consorzio|camera\s+di\s+commercio|universit|politecnico|accademia|sviluppo|invitalia|unioncamere|ales\b|arti\b|sistema\s+museale|distretto|opencoesione|coesione|\bckan\b|open\s*data|dati\s+aperti|fesr|fse\b|psr\b|leader\b|\bgal\b)/i;

/**
 * Natura di una fonte: 'bandi' | 'news'.
 * Ordine delle prove:
 *   1) il nome dichiara bandi/avvisi/opportunità → BANDI (vale anche per i
 *      feed di categoria delle testate, es. "Artribune - Bandi")
 *   2) è una testata giornalistica riconosciuta → NEWS
 *   3) è un ente/istituzione (tier A/B o pattern ente) → BANDI: il gate di
 *      contenuto pretende comunque il segnale-bando nel titolo, quindi un
 *      convegno pubblicato da una fondazione non passa lo stesso
 *   4) in dubbio → NEWS (esporre un articolo tra i bandi è peggio che perderlo)
 */
/**
 * v4.27.89 — OVERRIDE MANUALE. La classificazione automatica sbaglia sui casi
 * di confine (associazioni e portali che pubblicano sia notizie sia bandi).
 * Scrivendo [canale:bandi] o [canale:news] nella colonna Tag della fonte, la
 * scelta umana vince sempre: nessuna modifica al codice per correggere una
 * singola fonte.
 */
function frNaturaDaTag(tag) {
  var t = String(tag || '').toLowerCase();
  if (t.indexOf('[canale:bandi]') >= 0) return 'bandi';
  if (t.indexOf('[canale:news]') >= 0) return 'news';
  return '';
}

function frNaturaFonte(nome, url, tag) {
  var forzata = frNaturaDaTag(tag);
  if (forzata) return forzata;
  var n = String(nome || '');
  var t = n + ' ' + String(url || '');
  // 1) dichiarazione esplicita di bandi (nome o URL: /bandi/, /avvisi/…)
  if (FR_NATURA_BANDI_RE.test(t)) return 'bandi';
  // 2) testata riconosciuta — SOLO sul NOME. v4.27.87: testare anche l'URL
  //    classificava come news i portali di bandi il cui feed sta sotto
  //    /news/ (ART-ER, Progettare in Europa): errore grave, sono fonti bandi.
  if (FR_NATURA_NEWS_RE.test(n)) return 'news';
  // 3) ente/istituzione → bandi (il gate di contenuto filtra comunque i
  //    contenuti che non hanno natura di bando)
  var tier = frTierDaFonte(nome, url);
  if (tier === 'A' || tier === 'B') return 'bandi';
  if (FR_NATURA_ENTE_RE.test(t)) return 'bandi';
  // 4) in dubbio → news
  return 'news';
}

/**
 * Censimento delle fonti del canale bandi per natura.
 * @param {Object} [opts] { dryRun:true, disattiva:false }
 *   disattiva:true → mette Attiva=false sulle fonti di natura 'news'
 */
function frSeparaCanali(opts) {
  opts = opts || {};
  var rep = { ok: true, dryRun: opts.dryRun !== false, esaminate: 0, bandi: 0, news: 0, disattivate: 0, elencoNews: [] };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'foglio ' + FR_SHEET + ' assente' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL'), iAtt = head.indexOf('Attiva'), iTag = head.indexOf('Tag');
    for (var r = 1; r < vals.length; r++) {
      var nome = String(vals[r][iNome] || '').trim();
      if (!nome) continue;
      var attivaRaw = vals[r][iAtt];
      var attiva = (attivaRaw === true || String(attivaRaw).toLowerCase() === 'true');
      if (!attiva) continue;
      rep.esaminate++;
      var tagRiga = (iTag >= 0) ? vals[r][iTag] : '';
      var nat = frNaturaFonte(nome, vals[r][iUrl], tagRiga);
      var forzata = frNaturaDaTag(tagRiga);
      if (nat === 'bandi') { rep.bandi++; if (forzata) rep.forzateBandi = (rep.forzateBandi || 0) + 1; continue; }
      rep.news++;
      if (rep.elencoNews.length < 60) rep.elencoNews.push(nome.substring(0, 46) + (forzata ? ' [forzata]' : ''));
      if (opts.disattiva && !opts.dryRun) {
        sh.getRange(r + 1, iAtt + 1).setValue(false);
        if (iTag >= 0) sh.getRange(r + 1, iTag + 1).setValue(String(vals[r][iTag] || '') + ' [spostata-su-news v4.27.84]');
        rep.disattivate++;
      }
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[frSeparaCanali] bandi=' + rep.bandi + ' news=' + rep.news + ' disattivate=' + rep.disattivate);
  return rep;
}

/**
 * v4.27.89 — Scrive [canale:bandi] o [canale:news] nel Tag di una fonte:
 * la decisione umana batte la classificazione automatica.
 * @param {string} nomeFonte  nome esatto (o frammento) della fonte
 * @param {string} canale     'bandi' | 'news'
 */
function frForzaCanale(nomeFonte, canale) {
  canale = String(canale || '').toLowerCase();
  if (canale !== 'bandi' && canale !== 'news') return { ok: false, error: "canale deve essere 'bandi' o 'news'" };
  var cerca = String(nomeFonte || '').trim().toLowerCase();
  if (!cerca) return { ok: false, error: 'nome fonte mancante' };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'foglio fonti assente' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iTag = head.indexOf('Tag'), iAtt = head.indexOf('Attiva');
    if (iTag < 0) return { ok: false, error: 'colonna Tag assente' };
    var toccate = [];
    for (var r = 1; r < vals.length; r++) {
      var nome = String(vals[r][iNome] || '').trim();
      if (!nome || nome.toLowerCase().indexOf(cerca) < 0) continue;
      var tag = String(vals[r][iTag] || '').replace(/\[canale:(bandi|news)\]/gi, '').trim();
      sh.getRange(r + 1, iTag + 1).setValue((tag ? tag + ' ' : '') + '[canale:' + canale + ']');
      // riattiva se la si riporta sui bandi dopo una disattivazione
      if (canale === 'bandi' && iAtt >= 0) sh.getRange(r + 1, iAtt + 1).setValue(true);
      toccate.push(nome);
    }
    Logger.log('[frForzaCanale] ' + canale + ' → ' + toccate.join(', '));
    return { ok: true, canale: canale, fonti: toccate, totale: toccate.length };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * v4.27.93 — RIPRISTINO. La separazione dei canali disattiva le fonti
 * riconosciute come testate; se la regola di riconoscimento viene poi
 * corretta (è successo con "IndiceBandi - Cultura", disattivata perché
 * "bandi" alla fine di una parola composta non veniva visto), le fonti
 * ingiustamente escluse vanno riaccese. Qui si riesaminano SOLO quelle
 * disattivate dalla separazione (marcate [spostata-su-news]) e si
 * riattivano quelle che oggi risultano di natura bandi.
 * @param {Object} [opts] { dryRun:false }
 */
function frRipristinaFontiBandi(opts) {
  opts = opts || {};
  var rep = { ok: true, dryRun: !!opts.dryRun, esaminate: 0, riattivate: 0, elenco: [] };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'foglio fonti assente' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL'), iAtt = head.indexOf('Attiva'), iTag = head.indexOf('Tag');
    for (var r = 1; r < vals.length; r++) {
      var nome = String(vals[r][iNome] || '').trim();
      if (!nome) continue;
      var tag = String(vals[r][iTag] || '');
      if (tag.indexOf('[spostata-su-news') < 0) continue;   // non toccata dalla separazione
      rep.esaminate++;
      if (frNaturaFonte(nome, vals[r][iUrl], tag) !== 'bandi') continue;
      if (!opts.dryRun) {
        sh.getRange(r + 1, iAtt + 1).setValue(true);
        sh.getRange(r + 1, iTag + 1).setValue(tag.replace(/\[spostata-su-news[^\]]*\]/gi, '').trim() + ' [ripristinata v4.27.93]');
      }
      rep.riattivate++;
      if (rep.elenco.length < 30) rep.elenco.push(nome.substring(0, 46));
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[frRipristinaFontiBandi] riattivate=' + rep.riattivate + '/' + rep.esaminate);
  return rep;
}

/**
 * v4.27.89 — Fonti duplicate nel foglio (stesso nome o stesso URL): il
 * censimento del 01/08 ha mostrato "Tafter Journal" due volte.
 */
function frTrovaDuplicati() {
  var rep = { ok: true, perNome: [], perUrl: [] };
  try {
    var sh = _frSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function (h) { return String(h || '').trim(); });
    var iNome = head.indexOf('Nome'), iUrl = head.indexOf('URL');
    var vistiN = {}, vistiU = {};
    for (var r = 1; r < vals.length; r++) {
      var n = String(vals[r][iNome] || '').trim().toLowerCase();
      var u = String(vals[r][iUrl] || '').trim().toLowerCase().replace(/\/+$/, '');
      if (n) { if (vistiN[n]) { if (rep.perNome.indexOf(n) < 0) rep.perNome.push(n); } else vistiN[n] = true; }
      if (u) { if (vistiU[u]) { if (rep.perUrl.indexOf(u) < 0) rep.perUrl.push(u.substring(0, 60)); } else vistiU[u] = true; }
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  return rep;
}

/** Self-test del riconoscimento tier (nessuna scrittura). */
function frSelfTest() {
  var casi = [
    { n: 'TED — Tenders Electronic Daily (UE)', att: 'A' },
    { n: 'EU Funding & Tenders Portal', att: 'A' },
    { n: 'MiC — Ministero della Cultura (IT)', att: 'A' },
    { n: 'ANAC BDNCP — Pubblicità Legale', att: 'A' },
    { n: 'Consip / MEPA — Acquisti in rete PA', att: 'A' },
    { n: 'Creative Europe (UE)', att: 'A' },
    { n: 'Regione Toscana — Bandi cultura', att: 'B' },
    { n: 'Fondazione Cariplo', att: 'B' },
    { n: 'Camera di Commercio di Milano', att: 'B' },
    { n: 'GAL Terra Protetta', att: 'C' },
    { n: 'Associazione culturale Le Rondini', att: 'C' },
    { n: 'Fondazione locale di comunità', att: 'C' }
  ];
  var pass = 0, falliti = [];
  casi.forEach(function (c) {
    var eff = frTierDaFonte(c.n, '');
    if (eff === c.att) pass++; else falliti.push(c.n + ' → ' + eff + ' (atteso ' + c.att + ')');
  });
  // v4.27.84 — natura del canale: casi reali visti in produzione il 31/07
  var casiNat = [
    { n: 'Artribune - Bandi', att: 'bandi' },
    { n: 'Regione Puglia - Bandi', att: 'bandi' },
    { n: 'IndiceBandi - Cultura', att: 'bandi' },
    { n: 'SCP - Servizio Contratti Pubblici (MIT)', att: 'bandi' },
    { n: 'ART-ER Emilia-Romagna', att: 'bandi' },
    { n: 'Fondazione Marche Cultura', att: 'bandi' },
    { n: 'ICOM Italia - Opportunità', att: 'bandi' },
    { n: 'Artribune', att: 'news' },
    { n: "Finestre sull'Arte", att: 'news' },
    { n: 'Doppiozero Cultura', att: 'news' },
    { n: 'Tafter Journal', att: 'news' },
    { n: 'The Art Newspaper', att: 'news' },
    { n: 'Exibart', att: 'news' },
    { n: 'Flash Art Italia', att: 'news' },
    { n: 'Agenda Digitale', att: 'news' },
    { n: 'Fondazione Symbola - Notizie', att: 'news' },
    // v4.27.90 — casi dell'anteprima 01/08: portali istituzionali di
    // finanziamento che finivano tra le testate
    { n: 'OpenCoesione — Cultura/Turismo (API CKAN)', att: 'bandi' },
    // v4.27.91 — casi dell'anteprima pulizia del 01/08
    { n: 'BandiUp — Cultura aperti (API)', att: 'bandi' },
    { n: 'IndiceBandi - Cultura', att: 'bandi' },
    { n: 'Bandiera Blu Magazine', att: 'news' },
    { n: 'BandiUp — Musei (API)', att: 'bandi' },
    { n: 'BandiUp — Cultura aperti pag.2 (API)', att: 'bandi' },
    { n: 'Obiettivo Europa - Arte', att: 'bandi' },
    { n: 'Progettare in Europa', att: 'bandi' },
    { n: 'Bandiera Blu Magazine', att: 'news' },
    { n: 'GAL Terre di Argil', att: 'bandi' },
    { n: 'MAXXI - Programma', att: 'news' },
    { n: 'Google Arts & Culture Blog', att: 'news' },
    { n: 'Domus - Arte e Architettura', att: 'news' }
  ];
  var passN = 0;
  casiNat.forEach(function (c) {
    var eff = frNaturaFonte(c.n, '');
    if (eff === c.att) passN++; else falliti.push('[natura] ' + c.n + ' → ' + eff + ' (atteso ' + c.att + ')');
  });
  Logger.log('[frSelfTest] tier ' + pass + '/' + casi.length + ' · natura ' + passN + '/' + casiNat.length);
  // v4.27.94 — pass/fail numerici per il runner unificato (prima mostrava 0/0)
  return { ok: falliti.length === 0, pass: pass + passN, fail: falliti.length,
           tier: pass + '/' + casi.length, natura: passN + '/' + casiNat.length, falliti: falliti };
}
