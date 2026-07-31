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
  Logger.log('[frSelfTest] ' + pass + '/' + casi.length);
  return { ok: falliti.length === 0, pass: pass, totale: casi.length, falliti: falliti };
}
