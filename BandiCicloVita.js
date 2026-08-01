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
  // v4.27.75 — CAP per esecuzione: deleteRow costa ~100ms, oltre ~400 righe si
  // sfora il limite di 6 minuti di GAS. L'arretrato (2261 righe il 31/07) viene
  // drenato dalle esecuzioni notturne successive, senza timeout.
  var cap = dryRun ? 1e9 : (Number(opts.cap) || 400);
  var rep = { ok: true, giorni: gg, dryRun: dryRun, cap: cap, archiviatiTotali: 0, cancellati: 0, troppoRecenti: 0, senzaData: 0, residui: 0, esempi: [] };
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
      if (rep.cancellati >= cap) { rep.residui++; continue; }
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
  'sassari':'Sardegna','nuoro':'Sardegna','grottaglie':'Puglia','deruta':'Umbria',
  // v4.27.75 — aggiunte dai valori sporchi trovati in produzione il 31/07
  'piombino':'Toscana','livorno':'Toscana','arezzo':'Toscana','prato':'Toscana','grosseto':'Toscana',
  'pordenone':'Friuli-Venezia Giulia','gorizia':'Friuli-Venezia Giulia',
  'reggio emilia':'Emilia-Romagna','ferrara':'Emilia-Romagna','forl':'Emilia-Romagna','rimini':'Emilia-Romagna',
  'piacenza':'Emilia-Romagna','cesena':'Emilia-Romagna','vicenza':'Veneto','treviso':'Veneto',
  'belluno':'Veneto','rovigo':'Veneto','como':'Lombardia','pavia':'Lombardia','mantova':'Lombardia',
  'cremona':'Lombardia','varese':'Lombardia','monza':'Lombardia','lecco':'Lombardia','sondrio':'Lombardia',
  'novara':'Piemonte','asti':'Piemonte','alessandria':'Piemonte','cuneo':'Piemonte','biella':'Piemonte',
  'vercelli':'Piemonte','savona':'Liguria','imperia':'Liguria','la spezia':'Liguria',
  'macerata':'Marche','fermo':'Marche','ascoli':'Marche','viterbo':'Lazio','latina':'Lazio',
  'frosinone':'Lazio','rieti':'Lazio','caserta':'Campania','benevento':'Campania','avellino':'Campania',
  'sorrento':'Campania','foggia':'Puglia','brindisi':'Puglia','barletta':'Puglia','andria':'Puglia',
  'messina':'Sicilia','trapani':'Sicilia','agrigento':'Sicilia','ragusa':'Sicilia','enna':'Sicilia',
  'caltanissetta':'Sicilia','oristano':'Sardegna','olbia':'Sardegna','teramo':'Abruzzo','chieti':'Abruzzo',
  'isernia':'Molise','cosenza':'Calabria','crotone':'Calabria','vibo':'Calabria','spoleto':'Umbria',
  'assisi':'Umbria','foligno':'Umbria','gubbio':'Umbria','orvieto':'Umbria'
};

/** @private normalizza per confronto (solo lettere minuscole) */
function _bcvNorm_(s) { return String(s || '').toLowerCase().replace(/[^a-zà-ù]/g, ''); }

/**
 * Riempie la colonna Regione dove vuota, deducendola da ente/titolo/sommario.
 * @param {Object} [opts] { dryRun:false, cap:400 }
 */
/**
 * @private true se il valore è già una regione riconoscibile dalla mappa.
 * Confronto per PREFISSO, non per uguaglianza: le geometrie ISTAT usano le
 * forme bilingui ("Trentino-Alto Adige/Südtirol", "Valle d'Aosta/Vallée
 * d'Aoste") che sono corrette e non vanno "corrette" in altro.
 */
function _bcvRegioneValida_(v) {
  var k = _bcvNorm_(v);
  if (!k) return false;
  for (var i = 0; i < BCV_REGIONI.length; i++) {
    var g = _bcvNorm_(BCV_REGIONI[i]);
    if (k.indexOf(g) === 0 || g.indexOf(k) === 0) return true;
  }
  return false;
}

/** @private valori che indicano "nessun territorio specifico" (non sono errori) */
var BCV_REGIONE_NEUTRA = { 'tutte':1,'tutto il territorio':1,'vari':1,'varie':1,'nazionale':1,'italia':1,'europa':1,'ue':1,'estero':1,'internazionale':1 };

function bcvNormalizzaRegione(opts) {
  opts = opts || {};
  var cap = Number(opts.cap) || 400;
  var rep = { ok: true, dryRun: !!opts.dryRun, esaminati: 0, compilati: 0, corretti: 0, nonDedotti: 0, esempi: [], esempiCorretti: [] };
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    var regNorm = BCV_REGIONI.map(function (r) { return { nome: r, k: _bcvNorm_(r) }; });
    for (var r = 1; r < vals.length && (rep.compilati + rep.corretti) < cap; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
      // v4.27.75 — non basta riempire i vuoti: il campo conteneva valori
      // NON-REGIONE (città 'Udine'/'Modena'/'PIOMBINO', sigle 'SE') che la
      // mappa non sa disegnare. Quelli vanno CONVERTITI in regione.
      var _att = String(row[COL_B.REGIONE - 1] || '').trim();
      var _daCorreggere = false;
      if (_att) {
        if (_bcvRegioneValida_(_att)) continue;                    // già a posto
        if (BCV_REGIONE_NEUTRA[_att.toLowerCase()]) continue;      // senza territorio: lasciare
        _daCorreggere = true;
      }
      rep.esaminati++;
      // il valore sporco (es. 'Udine') è il primo indizio, poi ente/titolo/sommario
      var testoRaw = _att + ' ' + String(row[COL_B.ENTE - 1] || '') + ' ' + String(row[COL_B.TITOLO - 1] || '') + ' ' + String(row[COL_B.SOMMARIO - 1] || '');
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
      if (!opts.dryRun) sh.getRange(r + 1, COL_B.REGIONE).setValue(trovata);
      if (_daCorreggere) {
        if (rep.esempiCorretti.length < 10) rep.esempiCorretti.push(_att + ' → ' + trovata);
        rep.corretti++;
      } else {
        if (rep.esempi.length < 10) rep.esempi.push(String(row[COL_B.ENTE - 1] || '').substring(0, 40) + ' → ' + trovata);
        rep.compilati++;
      }
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[bcvNormalizzaRegione] compilati=' + rep.compilati + ' corretti=' + rep.corretti + ' nonDedotti=' + rep.nonDedotti);
  return rep;
}

// ============================================================================
//  RIPARAZIONE RECORD SLITTATI (v4.27.80)
//  ScannerRssSpecializzato scriveva un array posizionale di 26 valori su 27
//  colonne: mancava TipoBando (col 9) e tutto slittava di uno da lì in poi.
//  Firma del difetto, verificabile riga per riga:
//     Cofin (12)      contiene una DATA  → è la Scadenza
//     Scadenza (13)   contiene un ID/testo fonte (non una data)
//     FonteNome (15)  contiene un URL    → è UrlBando
//  La riparazione rimette a posto SOLO le righe con questa firma esatta.
// ============================================================================

/** @private true se il valore sembra un URL */
function _bcvPareUrl_(v) { return /^https?:\/\//i.test(String(v || '').trim()); }

/**
 * Ripara le righe scritte con lo schema slittato.
 * @param {Object} [opts] { dryRun:false, cap:500 }
 */
function bcvRiparaSlittate(opts) {
  opts = opts || {};
  var cap = Number(opts.cap) || 500;
  var rep = { ok: true, dryRun: !!opts.dryRun, esaminate: 0, riparate: 0, esempi: [] };
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length && rep.riparate < cap; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      // v4.27.80 — RIPARARE SOLO DOVE SI GUADAGNA QUALCOSA. Una prima firma
      // più larga intercettava 785 righe, quasi tutte vecchi avvisi TED già
      // archiviati e destinati alla purge: 785 scritture per nessun beneficio
      // reale, con il rischio di toccare righe sane. Ora si interviene solo
      // sui bandi ATTIVI in cui Cofin contiene davvero una data (= la
      // scadenza perduta) e la Scadenza attuale non è una data.
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
      rep.esaminate++;
      var cofin = row[COL_B.COFIN - 1];
      var scadCorrente = row[COL_B.SCADENZA - 1];
      var fonteNome = row[COL_B.FONTE_NOME - 1];
      var urlBando = row[COL_B.URL_BANDO - 1];
      var cofinData = _bcvData_(cofin);
      var scadNonData = !_bcvData_(scadCorrente);
      var urlInFonte = _bcvPareUrl_(fonteNome);
      if (!cofinData) continue;        // nessuna scadenza da recuperare
      if (!scadNonData) continue;      // la scadenza è già a posto
      if (!urlInFonte) continue;       // manca la firma dello slittamento
      // ricostruzione: sposta indietro di una posizione i campi dalla 12 in poi
      var nuoviValori = {};
      nuoviValori[COL_B.SCADENZA] = cofinData ? cofinData : '';
      nuoviValori[COL_B.FONTE_ID] = String(scadCorrente || '');
      nuoviValori[COL_B.FONTE_NOME] = '';
      nuoviValori[COL_B.URL_BANDO] = String(fonteNome || '');
      nuoviValori[COL_B.COFIN] = '';
      // il nome fonte vero era slittato in UrlBando
      if (!_bcvPareUrl_(urlBando) && String(urlBando || '').trim()) nuoviValori[COL_B.FONTE_NOME] = String(urlBando);
      if (rep.esempi.length < 8) {
        rep.esempi.push(String(row[COL_B.TITOLO - 1] || '').substring(0, 45)
          + ' | scad→' + (cofinData ? Utilities.formatDate(cofinData, 'Europe/Rome', 'dd/MM/yyyy') : '(vuota)')
          + ' | link→' + String(fonteNome || '').substring(0, 30));
      }
      if (!opts.dryRun) {
        for (var col in nuoviValori) sh.getRange(r + 1, Number(col)).setValue(nuoviValori[col]);
      }
      rep.riparate++;
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[bcvRiparaSlittate] riparate=' + rep.riparate + '/' + rep.esaminate);
  return rep;
}

/**
 * v4.27.84 — PULIZIA CANALE: archivia i record entrati in Bandi_v5 da fonti
 * di natura NEWS (testate/magazine). Non sono bandi: non hanno scadenza certa
 * né ente banditore, e la loro sede è la sezione News.
 * Archivia (non cancella): la purge a 20gg li rimuoverà da sola.
 * @param {Object} [opts] { dryRun:false, cap:800 }
 */
function bcvPuliziaCanaleNews(opts) {
  opts = opts || {};
  var cap = Number(opts.cap) || 800;
  var rep = { ok: true, dryRun: !!opts.dryRun, esaminati: 0, archiviati: 0, perFonte: {}, esempi: [] };
  try {
    if (typeof frNaturaFonte !== 'function') return { ok: false, error: 'FontiRegia non disponibile' };
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    var iArch = bcvEnsureColonnaDataArch();
    var cacheNatura = {};
    for (var r = 1; r < vals.length && rep.archiviati < cap; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
      rep.esaminati++;
      var fonte = String(row[COL_B.FONTE_NOME - 1] || '').trim();
      if (!fonte) continue;
      if (cacheNatura[fonte] === undefined) cacheNatura[fonte] = frNaturaFonte(fonte, '');
      if (cacheNatura[fonte] !== 'news') continue;
      rep.perFonte[fonte] = (rep.perFonte[fonte] || 0) + 1;
      if (rep.esempi.length < 8) rep.esempi.push(fonte + ' — ' + String(row[COL_B.TITOLO - 1] || '').substring(0, 45));
      if (!opts.dryRun) {
        sh.getRange(r + 1, COL_B.STATO_RECORD).setValue('archiviato');
        if (iArch >= 0) sh.getRange(r + 1, iArch + 1).setValue(new Date());
      }
      rep.archiviati++;
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[bcvPuliziaCanaleNews] archiviati=' + rep.archiviati + '/' + rep.esaminati);
  return rep;
}

/**
 * v4.27.84 — SCADENZE FALSE: azzera le scadenze che in realtà erano la data di
 * PUBBLICAZIONE dell'articolo RSS (lo scanner le scriveva in Scadenza fino al
 * 31/07). Firma: scadenza <= data di rilevamento, cioè "scaduto prima ancora
 * di essere rilevato" — impossibile per un bando vero.
 * @param {Object} [opts] { dryRun:false, cap:1500 }
 */
function bcvAzzeraScadenzeFalse(opts) {
  opts = opts || {};
  var cap = Number(opts.cap) || 1500;
  var rep = { ok: true, dryRun: !!opts.dryRun, esaminati: 0, azzerate: 0, esempi: [] };
  try {
    var sh = _bcvSheet_();
    if (!sh || sh.getLastRow() < 2) return rep;
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length && rep.azzerate < cap; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      rep.esaminati++;
      var sc = _bcvData_(row[COL_B.SCADENZA - 1]);
      var dr = _bcvData_(row[COL_B.DATA_RILEVAMENTO - 1]);
      if (!sc || !dr) continue;
      // scadenza precedente o uguale al rilevamento = era la data di pubblicazione
      if (sc.getTime() > dr.getTime()) continue;
      if (rep.esempi.length < 8) {
        rep.esempi.push(String(row[COL_B.TITOLO - 1] || '').substring(0, 40)
          + ' | scad ' + Utilities.formatDate(sc, 'Europe/Rome', 'dd/MM') + ' ≤ rilev ' + Utilities.formatDate(dr, 'Europe/Rome', 'dd/MM'));
      }
      if (!opts.dryRun) {
        sh.getRange(r + 1, COL_B.SCADENZA).setValue('');
        var note = String(row[COL_B.NOTE - 1] || '');
        if (note.indexOf('pubblicato') < 0) {
          sh.getRange(r + 1, COL_B.NOTE).setValue((note ? note + ' · ' : '') + 'pubblicato ' + Utilities.formatDate(sc, 'Europe/Rome', 'dd/MM/yyyy'));
        }
      }
      rep.azzerate++;
    }
  } catch (e) { rep.ok = false; rep.errore = e.message; }
  Logger.log('[bcvAzzeraScadenzeFalse] azzerate=' + rep.azzerate + '/' + rep.esaminati);
  return rep;
}

/** Self-test senza scritture: verifica il riconoscimento regione. */
function bcvSelfTest() {
  var casi = [
    { t: 'Regione Toscana — Direzione Cultura', att: 'Toscana' },
    { t: 'Comune di Grottaglie', att: 'Puglia' },
    { t: 'Fondazione Musei Civici di Venezia', att: 'Veneto' },
    // v4.27.94 — Sorrento è entrata nella tabella città→regione: la deduzione
    // corretta ora è Campania (il test precedente si aspettava "nessuna").
    { t: 'GAL Terra Protetta — Sorrento', att: 'Campania' },
    { t: 'Ministero della Cultura', att: '' },
    { t: 'Comune di Piombino', att: 'Toscana' },
    { t: 'Commissione Europea', att: '' }
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
  // v4.27.94 — il runner unificato legge r.pass e r.fail: senza 'fail'
  // numerico mostrava "4/4 KO", nascondendo quale caso non passava.
  return { ok: fail.length === 0, pass: pass, fail: fail.length, totale: casi.length, falliti: fail };
}
