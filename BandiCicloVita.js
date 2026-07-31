// ============================================================================
//  BandiCicloVita.js — Stato e tempo del bando: archivio, data archiviazione,
//  purge automatica, normalizzazione regione.
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · v4.27.74 (2026-07-31)
//
//  PERCHÉ ESISTE (diagnosi 31/07/2026):
//  Il foglio legacy 'RADAR BANDI' è morto dal v4.27.32: getSheetRadar() punta
//  già a Bandi_v5. Ma i chiamanti storici continuano a usare lo schema di
//  colonne LEGACY (COL, indici del vecchio RADAR) su un foglio che ha lo
//  schema COL_B. Collisioni verificate:
//     COL.STATO_RECORD = 18  →  COL_B.URL_VALIDATO   (l'archiviazione non
//                                                     veniva mai registrata)
//     COL.LETTO_BANDO  = 20  →  COL_B.SOMMARIO       (il "letto" avrebbe
//                                                     sovrascritto la descrizione)
//     COL.TITOLO       = 2   →  COL_B.FINGERPRINT
//  Conseguenza osservata: Archivio SEMPRE vuoto (il filtro cercava
//  'archiviato' nella colonna UrlValidato) e purge che non cancellava nulla.
//  Danno ai dati misurato il 31/07: 0 righe corrotte su 2421 — la mina non era
//  ancora esplosa. Questo modulo la disinnesca usando SOLO COL_B.
//
//  REGOLA (Silvano): meglio un bando in meno che uno scaduto o senza info.
// ============================================================================

var BCV_PURGE_GIORNI = 20;   // richiesta 31/07: archiviati da >20gg → cancellati

/** @private Foglio Bandi_v5 (fonte unica dei bandi) o null. */
function _bcvSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var nome = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
  return ss.getSheetByName(nome);
}

/** @private Data robusta: Date | ISO | dd/MM/yyyy → Date o null. */
function _bcvData_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** @private Indice 0-based della colonna DataArchiviazione (-1 se assente). */
function _bcvColDataArch_(head) {
  for (var i = 0; i < head.length; i++) {
    if (String(head[i] || '').trim() === 'DataArchiviazione') return i;
  }
  return -1;
}

/**
 * Garantisce la colonna DataArchiviazione in coda al foglio. Idempotente.
 * @return {number} indice 0-based, -1 se il foglio manca
 */
function bcvEnsureColonnaDataArch() {
  var sh = _bcvSheet_();
  if (!sh) return -1;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = _bcvColDataArch_(head);
  if (i >= 0) return i;
  var col = sh.getLastColumn() + 1;
  sh.getRange(1, col).setValue('DataArchiviazione').setFontWeight('bold');
  Logger.log('[bcv] colonna DataArchiviazione creata (col ' + col + ')');
  return col - 1;
}

/**
 * Imposta lo stato di una riga di Bandi_v5 tracciando QUANDO è stata archiviata.
 * Unico punto di scrittura dello stato bando: usa COL_B, mai COL.
 * @param {number} riga 1-based (= id servito al frontend)
 * @param {string} stato 'archiviato' | 'attivo'
 */
function bcvSetStato(riga, stato) {
  try {
    riga = Number(riga);
    if (!riga || riga < 2) return { ok: false, error: 'riga non valida: ' + riga };
    var sh = _bcvSheet_();
    if (!sh) return { ok: false, error: 'foglio Bandi_v5 assente' };
    if (riga > sh.getLastRow()) return { ok: false, error: 'riga fuori range' };
    sh.getRange(riga, COL_B.STATO_RECORD).setValue(stato);
    var iArch = bcvEnsureColonnaDataArch();
    if (iArch >= 0) sh.getRange(riga, iArch + 1).setValue(stato === 'archiviato' ? new Date() : '');
    Logger.log('[bcv] riga ' + riga + ' → ' + stato);
    return { ok: true, riga: riga, stato: stato };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Bandi archiviati, dal più recente. Sostituisce la lettura che cercava
 * l'header 'STATO_RECORD' (Bandi_v5 lo chiama 'StatoRecord') e ripiegava
 * sull'indice 17 = UrlValidato: da lì l'Archivio sempre vuoto.
 * @param {number} [limit] default 200
 */
function bcvArchiviati(limit) {
  var n = Number(limit) || 200;
  var out = [];
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return out;
    var vals = sh.getDataRange().getValues();
    var iArch = _bcvColDataArch_(vals[0]);
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() !== 'archiviato') continue;
      var dArch = (iArch >= 0) ? _bcvData_(row[iArch]) : null;
      var scad = _bcvData_(row[COL_B.SCADENZA - 1]);
      out.push({
        id: String(r),
        titolo: String(row[COL_B.TITOLO - 1] || ''),
        ente: String(row[COL_B.ENTE - 1] || ''),
        settore: String(row[COL_B.SETTORE - 1] || ''),
        regione: String(row[COL_B.REGIONE - 1] || ''),
        scadenza: scad ? Utilities.formatDate(scad, 'Europe/Rome', 'dd/MM/yyyy') : '',
        dataArch: dArch ? Utilities.formatDate(dArch, 'Europe/Rome', 'dd/MM/yyyy') : '',
        link: String(row[COL_B.URL_BANDO - 1] || ''),
        _ord: dArch ? dArch.getTime() : 0,
        tipo: 'bando'
      });
    }
    out.sort(function (a, b) { return b._ord - a._ord; });
    if (out.length > n) out = out.slice(0, n);
  } catch (e) { Logger.log('[bcvArchiviati] ' + e.message); }
  return out;
}

/**
 * Cancella definitivamente i bandi archiviati da più di N giorni.
 * FIX rispetto a _purgeBandiArchiviatiVecchi_: l'età si misura sulla
 * DataArchiviazione (fallback DataRilevamento), NON sulla scadenza — con la
 * vecchia regola i 274 archiviati "senza scadenza" del 31/07 non sarebbero
 * mai stati eliminati.
 * @param {Object} [opts] { giorni:20, dryRun:false }
 */
function bcvPurgeArchiviati(opts) {
  opts = opts || {};
  var gg = (opts.giorni != null) ? Number(opts.giorni) : BCV_PURGE_GIORNI;
  var dryRun = !!opts.dryRun;
  var rep = { ok: true, giorni: gg, dryRun: dryRun, archiviatiTotali: 0, cancellati: 0, troppoRecenti: 0, senzaData: 0, esempi: [] };
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    var iArch = _bcvColDataArch_(vals[0]);
    var soglia = Date.now() - gg * 86400000;
    for (var r = vals.length - 1; r >= 1; r--) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() !== 'archiviato') continue;
      rep.archiviatiTotali++;
      var d = (iArch >= 0) ? _bcvData_(row[iArch]) : null;
      if (!d) d = _bcvData_(row[COL_B.DATA_RILEVAMENTO - 1]); // archiviati prima della colonna
      if (!d) { rep.senzaData++; continue; }
      if (d.getTime() >= soglia) { rep.troppoRecenti++; continue; }
      if (rep.esempi.length < 10) rep.esempi.push(String(row[COL_B.TITOLO - 1] || '').substring(0, 60));
      if (!dryRun) sh.deleteRow(r + 1);
      rep.cancellati++;
    }
    Logger.log('[bcvPurge] ' + rep.cancellati + '/' + rep.archiviatiTotali + ' cancellati (>' + gg + 'gg)' + (dryRun ? ' [DRY]' : ''));
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  return rep;
}

// ============================================================================
//  NORMALIZZAZIONE REGIONE — riempie le bolle della mappa del Radar.
//  Deterministica: riconoscimento testuale, nessuna chiamata AI.
// ============================================================================

var BCV_REGIONI = ['Abruzzo','Basilicata','Calabria','Campania','Emilia-Romagna','Friuli-Venezia Giulia',
  'Lazio','Liguria','Lombardia','Marche','Molise','Piemonte','Puglia','Sardegna','Sicilia','Toscana',
  'Trentino-Alto Adige','Umbria',"Valle d'Aosta",'Veneto'];

/** @private città/provincia → regione, per gli enti che non nominano la regione */
var BCV_CITTA_REGIONE = {
  'roma':'Lazio','milano':'Lombardia','torino':'Piemonte','napoli':'Campania','firenze':'Toscana',
  'venezia':'Veneto','bologna':'Emilia-Romagna','palermo':'Sicilia','genova':'Liguria','bari':'Puglia',
  'cagliari':'Sardegna','trieste':'Friuli-Venezia Giulia','udine':'Friuli-Venezia Giulia',
  'perugia':'Umbria','terni':'Umbria','ancona':'Marche','pesaro':'Marche','urbino':'Marche',
  'trento':'Trentino-Alto Adige','bolzano':'Trentino-Alto Adige','aosta':"Valle d'Aosta",
  'campobasso':'Molise','potenza':'Basilicata','matera':'Basilicata','catanzaro':'Calabria',
  'reggio calabria':'Calabria','l\'aquila':'Abruzzo','pescara':'Abruzzo','catania':'Sicilia',
  'siracusa':'Sicilia','verona':'Veneto','padova':'Veneto','brescia':'Lombardia','bergamo':'Lombardia',
  'modena':'Emilia-Romagna','parma':'Emilia-Romagna','ravenna':'Emilia-Romagna','siena':'Toscana',
  'pisa':'Toscana','lucca':'Toscana','lecce':'Puglia','taranto':'Puglia','salerno':'Campania',
  'sassari':'Sardegna','nuoro':'Sardegna','grottaglie':'Puglia','deruta':'Umbria'
};

/** @private normalizza per confronto (solo lettere minuscole) */
function _bcvNorm_(s) { return String(s || '').toLowerCase().replace(/[^a-zà-ù]/g, ''); }

/**
 * Riempie la colonna Regione dove vuota, deducendola da ente/titolo/sommario.
 * @param {Object} [opts] { dryRun:false, cap:400 }
 */
function bcvNormalizzaRegione(opts) {
  opts = opts || {};
  var cap = Number(opts.cap) || 400;
  var rep = { ok: true, dryRun: !!opts.dryRun, esaminati: 0, compilati: 0, nonDedotti: 0, esempi: [] };
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    var regNorm = BCV_REGIONI.map(function (r) { return { nome: r, k: _bcvNorm_(r) }; });
    for (var r = 1; r < vals.length && rep.compilati < cap; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
      if (String(row[COL_B.REGIONE - 1] || '').trim()) continue;
      rep.esaminati++;
      var testoRaw = String(row[COL_B.ENTE - 1] || '') + ' ' + String(row[COL_B.TITOLO - 1] || '') + ' ' + String(row[COL_B.SOMMARIO - 1] || '');
      var testoLow = testoRaw.toLowerCase();
      var testoNorm = _bcvNorm_(testoRaw);
      var trovata = '';
      for (var i = 0; i < regNorm.length; i++) {
        if (testoNorm.indexOf(regNorm[i].k) >= 0) { trovata = regNorm[i].nome; break; }
      }
      if (!trovata) {
        for (var citta in BCV_CITTA_REGIONE) {
          if (testoLow.indexOf(citta) >= 0) { trovata = BCV_CITTA_REGIONE[citta]; break; }
        }
      }
      if (!trovata) { rep.nonDedotti++; continue; }
      if (rep.esempi.length < 10) rep.esempi.push(String(row[COL_B.ENTE - 1] || '').substring(0, 40) + ' → ' + trovata);
      if (!opts.dryRun) sh.getRange(r + 1, COL_B.REGIONE).setValue(trovata);
      rep.compilati++;
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[bcvNormalizzaRegione] compilati=' + rep.compilati + ' nonDedotti=' + rep.nonDedotti);
  return rep;
}

/** Self-test senza scritture: verifica il riconoscimento regione. */
function bcvSelfTest() {
  var casi = [
    { t: 'Regione Toscana — Direzione Cultura', att: 'Toscana' },
    { t: 'Comune di Grottaglie', att: 'Puglia' },
    { t: 'Fondazione Musei Civici di Venezia', att: 'Veneto' },
    { t: 'GAL Terra Protetta — Sorrento', att: '' },
    { t: 'Ministero della Cultura', att: '' }
  ];
  var pass = 0, fail = [];
  casi.forEach(function (c) {
    var testoNorm = _bcvNorm_(c.t), testoLow = c.t.toLowerCase(), trovata = '';
    for (var i = 0; i < BCV_REGIONI.length; i++) {
      if (testoNorm.indexOf(_bcvNorm_(BCV_REGIONI[i])) >= 0) { trovata = BCV_REGIONI[i]; break; }
    }
    if (!trovata) {
      for (var citta in BCV_CITTA_REGIONE) {
        if (testoLow.indexOf(citta) >= 0) { trovata = BCV_CITTA_REGIONE[citta]; break; }
      }
    }
    if (trovata === c.att) pass++; else fail.push(c.t + ' → "' + trovata + '" (atteso "' + c.att + '")');
  });
  Logger.log('[bcvSelfTest] ' + pass + '/' + casi.length);
  return { ok: fail.length === 0, pass: pass, totale: casi.length, falliti: fail };
}
