// ============================================================================
// CPV CULTURA v1.0 - Tassonomia CPV settore culturale
// ----------------------------------------------------------------------------
// Classificazione automatica dei bandi per settore culturale basata su:
//   1. Codici CPV (Common Procurement Vocabulary)
//   2. Keyword matching su titolo + settore + sommario
//   3. Lista esclusione per bandi chiaramente non-culturali
// ----------------------------------------------------------------------------
// Osservatorio Culturale - Sinopia / Silvano Straccini
// Sprint CPV Cultura v1.0 - 2026-06-29
// ============================================================================

// ============================================================================
// MAPPA CPV CULTURA — codici ufficiali rilevanti per il settore culturale
// ============================================================================

var CPV_CULTURA_CODES = {
  // 92xxx — Servizi culturali, ricreativi, sportivi
  '92521000': 'Servizi museali',
  '92521100': 'Servizi di esposizione in musei',
  '92521200': 'Conservazione di reperti ed esemplari',
  '92521210': 'Servizi di conservazione di reperti',
  '92522000': 'Servizi di conservazione di edifici e monumenti storici',
  '92522100': 'Servizi di conservazione di edifici storici',
  '92522200': 'Servizi di conservazione di monumenti storici',
  '92520000': 'Servizi di musei e di preservazione di siti storici',
  '92511000': 'Servizi di biblioteche',
  '92512000': 'Servizi di archivi',
  '92310000': 'Servizi di creazione ed interpretazione artistica e letteraria',
  '92311000': 'Opere d\'arte',
  '92312000': 'Servizi artistici',
  '92312100': 'Rappresentazioni teatrali',
  '92312200': 'Servizi prestati da autori, compositori, scultori e artisti',
  '92320000': 'Servizi di gestione di strutture artistiche',
  '92330000': 'Servizi per aree ricreative',
  '92300000': 'Servizi di intrattenimento',
  // 45xxx — Lavori cultura
  '45212350': 'Edifici di particolare interesse storico o architettonico',
  '45454100': 'Lavori di restauro',
  '45212310': 'Lavori di costruzione connessi con edifici destinati a mostre',
  '45212313': 'Lavori di costruzione di musei',
  '45112450': 'Lavori di scavo in siti archeologici',
  // 79xxx — Servizi professionali cultura
  '79950000': 'Servizi di organizzazione di mostre, fiere e congressi',
  '79952000': 'Servizi di organizzazione di eventi',
  '79930000': 'Servizi di disegno specializzati',
  // 72xxx — IT per cultura
  '72212520': 'Servizi di sviluppo di software multimediale',
  // 39xxx — Arredi/allestimenti
  '39154000': 'Attrezzature per esposizioni',
  '39150000': 'Arredi e attrezzature diverse'
};

// ============================================================================
// MAPPA CPV → SETTORE (prefissi CPV raggruppati per settore culturale)
// ============================================================================

var _CPV_PREFIX_SETTORE = [
  { prefix: '92521', settore: 'musei' },
  { prefix: '92520', settore: 'musei' },
  { prefix: '45212313', settore: 'musei' },
  { prefix: '92511', settore: 'biblioteche' },
  { prefix: '92512', settore: 'biblioteche' },
  { prefix: '92522', settore: 'patrimonio' },
  { prefix: '45212350', settore: 'patrimonio' },
  { prefix: '45454100', settore: 'patrimonio' },
  { prefix: '45212310', settore: 'patrimonio' },
  { prefix: '92310', settore: 'spettacolo' },
  { prefix: '92311', settore: 'spettacolo' },
  { prefix: '92312', settore: 'spettacolo' },
  { prefix: '92320', settore: 'spettacolo' },
  { prefix: '92300', settore: 'spettacolo' },
  { prefix: '92330', settore: 'spettacolo' },
  { prefix: '79950', settore: 'spettacolo' },
  { prefix: '79952', settore: 'spettacolo' },
  { prefix: '45112450', settore: 'archeologia' }
];

// ============================================================================
// KEYWORD MATCHING — regex per classificazione settore culturale
// ============================================================================

var _SETTORE_CULTURA_RE = {
  musei:       /\b(muse[oai]|museo|museal[ei]|galleri[ae]|collezioni?|esposizion[ei]|allestiment[oi]|pinacotec[ae])\b/i,
  biblioteche: /\b(bibliotec[ahe]|archivi[oi]?|emerotec[ae]|mediatec[ae]|catalogazion[ei]|inventari[oi])\b/i,
  patrimonio:  /\b(restaur[oi]|patrimoni[oi]|monument[oi]|beni\s+cultural|conservazion[ei]|vincolat[oi]|tutela|valorizzazion[ei]|paesagg|storico.artistico|recupero|riqualificazion[ei])\b/i,
  spettacolo:  /\b(teatr[oi]|spettacol[oi]|music[ae]|danz[ae]|festival|liric[aeo]|concert[oi]|opera\s+lirica|performan|arti\s+sceniche|coreografi[ae])\b/i,
  archeologia: /\b(archeolog|scav[oi]|repert[oi]|sito\s+archeologico|necropoli|paleontolog)\b/i
};

// ============================================================================
// EXCLUSION LIST — keyword che indicano bandi NON culturali
// ============================================================================

var _ESCLUSIONE_NON_CULTURA_RE = /\b(sanitari[aeo]|ospedale|ospedalier[aeo]|asl\b|ulss\b|farmac|infermier|medical[ei]|medicinale|ambulanz[ae]|ambulatori[aeo]|pronto\s+soccorso|rsa\b|residenz[ae]\s+sanitar|chirurg|radiolog|ecograf|protesi\s+dentari|laboratorio\s+analis|reagent[ei]|vaccin|dialisi|emotec|trasfusion[ei]|camera\s+mortuari|obitorio|salma|pompe\s+funebr|cimiter|trasporto\s+defunt|mensa\s+scolastic[ae]|ristorazion[ei]\s+collettiv[ae]|derattizzazion[ei]|disinfestazion[ei]|pulizia\s+uffic|pulizia\s+scolastic|lavaggio\s+biancheri|raccolta\s+rifiut[ei]|nettezza\s+urban|spazzament|igiene\s+urban|potatura|sfalcio|verde\s+pubblico\s+(?:manutenzione|gestione)|manutenzione\s+stradale|asfaltat|bituminat|segnaletica\s+stradal|illuminazione\s+pubblica|impianti?\s+elettric[oi]\s+(?:civile|industriale)|impianti?\s+idraulic[oi]|fognatur[ae]|acquedott|depurazion[ei]|autobus|trasporto\s+(?:pubblico|scolastico|urbano)|scuolabus|vigilanza\s+(?:armata|notturna|generica)|guardiania|portierato|reception\s+(?:ufficio|portineria)|assicurazion[ei]\s+(?:rc|auto|flotta)|carburant[ei]|buoni?\s+pasto|ticket\s+restaurant|cancelleria|toner|cartucce|stampant[ei]|fotocopiatric[ei]|agricol[ae]|zootecn|allev|mangim[ei]|sementi|pesticid[ei]|fitosanitar|edilizia\s+residenzial[ei]|edilizia\s+scola|edilizia\s+sportiv[ae]|palestra|piscina\s+(?:comunale|pubblica)|campo\s+da\s+calcio|tribun[ae]\s+sportiv)\b/i;

// ============================================================================
// FUNZIONI PUBBLICHE
// ============================================================================

/**
 * Classifica il settore culturale di un bando.
 * @param {string} titolo — Titolo del bando
 * @param {string} settore — Settore/categoria del bando
 * @param {string} sommario — Sommario o descrizione del bando
 * @param {string} cpvCode — Codice CPV (opzionale)
 * @return {string} 'musei'|'biblioteche'|'patrimonio'|'spettacolo'|'archeologia'|''
 */
function classificaSettoreCultura(titolo, settore, sommario, cpvCode) {
  // 1. Se c'e un codice CPV, prova il match per prefisso
  if (cpvCode) {
    var cpvStr = String(cpvCode).replace(/[^0-9]/g, '');
    if (cpvStr.length >= 5) {
      for (var i = 0; i < _CPV_PREFIX_SETTORE.length; i++) {
        if (cpvStr.indexOf(_CPV_PREFIX_SETTORE[i].prefix) === 0) {
          return _CPV_PREFIX_SETTORE[i].settore;
        }
      }
    }
  }

  // 2. Keyword matching su titolo + settore + sommario
  var testo = String(titolo || '') + ' ' + String(settore || '') + ' ' + String(sommario || '');
  if (!testo.trim()) return '';

  var settori = ['musei', 'biblioteche', 'patrimonio', 'spettacolo', 'archeologia'];
  for (var j = 0; j < settori.length; j++) {
    if (_SETTORE_CULTURA_RE[settori[j]].test(testo)) {
      return settori[j];
    }
  }

  return '';
}

/**
 * Determina se un bando e culturale (true) o chiaramente NON culturale (false).
 * Usa una lista di esclusione per rigettare bandi di sanita, trasporti, pulizie, ecc.
 * Se il bando non ha keyword culturali E non ha keyword di esclusione, ritorna true
 * (principio di inclusione: nel dubbio, lo mostriamo).
 * @param {string} titolo
 * @param {string} settore
 * @param {string} sommario
 * @param {string} cpvCode
 * @return {boolean}
 */
// CPV ESCLUSI — prefissi che non sono MAI culturali
var _CPV_NON_CULTURALI = [
  '85',    // Servizi sanitari e di assistenza sociale
  '33',    // Apparecchiature mediche, farmaceutiche
  '34',    // Attrezzature di trasporto
  '60',    // Servizi di trasporto
  '63',    // Servizi di supporto trasporti
  '66',    // Servizi finanziari e assicurativi
  '50',    // Servizi di riparazione e manutenzione
  '44',    // Materiali da costruzione (generici)
  '03',    // Prodotti agricoli, allevamento, pesca
  '15',    // Prodotti alimentari
  '90',    // Servizi fognari, rifiuti, pulizia, ambiente
  '98',    // Altri servizi (lavanderia, parrucchiere, pompe funebri)
  '71',    // Servizi architettonici (SOLO se non restauro — gestito sotto)
  '35',    // Sicurezza, difesa, equipaggiamento polizia
  '14',    // Prodotti minerari
  '24',    // Prodotti chimici
  '31',    // Apparecchiature elettriche
  '42',    // Macchinari industriali
  '43',    // Macchinari da miniera/cava
  '16',    // Macchinari agricoli
  '18',    // Abbigliamento, calzature (non costumi)
  '55',    // Servizi alberghieri/ristorazione (non culturali)
];

function isBandoCulturale(titolo, settore, sommario, cpvCode) {
  var testo = String(titolo || '') + ' ' + String(settore || '') + ' ' + String(sommario || '');

  // Se ha un CPV culturale, e sicuramente culturale
  if (cpvCode) {
    var cpvStr = String(cpvCode).replace(/[^0-9]/g, '');
    if (cpvStr.length >= 2) {
      // Check CPV culturale (inclusione)
      for (var i = 0; i < _CPV_PREFIX_SETTORE.length; i++) {
        if (cpvStr.indexOf(_CPV_PREFIX_SETTORE[i].prefix) === 0) return true;
      }
      // Check CPV NON culturale (esclusione)
      var cpv2 = cpvStr.substring(0, 2);
      for (var e = 0; e < _CPV_NON_CULTURALI.length; e++) {
        if (cpv2 === _CPV_NON_CULTURALI[e]) {
          Logger.log('[CPV ESCLUSO] ' + cpvStr + ' (' + cpv2 + 'xxx) — ' + String(titolo||'').substring(0,60));
          return false;
        }
      }
    }
  }

  // Se ha keyword culturali esplicite, e culturale
  var settori = ['musei', 'biblioteche', 'patrimonio', 'spettacolo', 'archeologia'];
  for (var j = 0; j < settori.length; j++) {
    if (_SETTORE_CULTURA_RE[settori[j]].test(testo)) return true;
  }

  // Se ha keyword di esclusione nel testo, NON e culturale
  if (_ESCLUSIONE_NON_CULTURA_RE.test(testo)) return false;

  // Nel dubbio, inclusivo (potrebbe essere culturale, lo mostriamo)
  return true;
}

/**
 * Restituisce la descrizione human-readable di un codice CPV culturale.
 * @param {string} cpvCode
 * @return {string} Descrizione o '' se non culturale
 */
function getCpvDescrizione(cpvCode) {
  if (!cpvCode) return '';
  var cpvStr = String(cpvCode).replace(/[^0-9]/g, '');
  if (CPV_CULTURA_CODES[cpvStr]) return CPV_CULTURA_CODES[cpvStr];
  // Prova anche con prefissi (es. 925210009 → 92521000)
  if (cpvStr.length > 8) cpvStr = cpvStr.substring(0, 8);
  if (CPV_CULTURA_CODES[cpvStr]) return CPV_CULTURA_CODES[cpvStr];
  return '';
}

/**
 * Backfill: legge Bandi_v5, classifica ogni riga, scrive SettoreCultura.
 * Aggiunge la colonna se mancante. Marca come 'archiviato' i bandi chiaramente non-culturali.
 * @return {Object} Report { ok, classificati, archiviati, totale }
 */
function backfillSettoreCultura() {
  Logger.log('=== backfillSettoreCultura START ===');
  var ss;
  try { ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet(); }
  catch(e) { ss = SpreadsheetApp.getActiveSpreadsheet(); }
  if (!ss) { Logger.log('ERR: spreadsheet null'); return { ok:false, error:'spreadsheet null' }; }

  var shName = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
  Logger.log('Foglio: ' + shName);
  var sh = ss.getSheetByName(shName);
  if (!sh) { Logger.log('ERR: foglio non trovato: ' + shName); return { ok: false, error: 'Foglio ' + shName + ' non trovato' }; }

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  Logger.log('Righe: ' + lastRow + ' Colonne: ' + lastCol);
  if (lastRow < 2) { Logger.log('Foglio vuoto'); return { ok: true, classificati: 0, archiviati: 0, totale: 0 }; }

  // Trova o crea colonna SettoreCultura
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var colSC = -1;
  var colCPV = -1;
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (hdr === 'SettoreCultura') colSC = h + 1;
    if (hdr === 'CPV' || hdr === 'CpvCode') colCPV = h + 1;
  }

  // Se SettoreCultura non esiste, aggiungila DOPO l'ultima colonna
  if (colSC < 0) {
    colSC = lastCol + 1;
    sh.getRange(1, colSC).setValue('SettoreCultura');
    lastCol = colSC;
  }
  // Se CPV non esiste, aggiungila dopo SettoreCultura
  if (colCPV < 0) {
    colCPV = lastCol + 1;
    sh.getRange(1, colCPV).setValue('CPV');
    lastCol = colCPV;
  }

  // Leggi tutti i dati
  var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  // Indici colonne per lettura (0-based)
  var iTitolo = COL_B.TITOLO - 1;
  var iSettore = COL_B.SETTORE - 1;
  var iSommario = COL_B.SOMMARIO - 1;
  var iStatoRecord = COL_B.STATO_RECORD - 1;
  var iSC = colSC - 1;
  var iCPV = colCPV - 1;

  var classificati = 0;
  var archiviati = 0;
  var scUpdates = [];
  var srUpdates = [];

  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var titolo = String(row[iTitolo] || '');
    var settore = String(row[iSettore] || '');
    var sommario = String(row[iSommario] || '');
    var cpv = iCPV < row.length ? String(row[iCPV] || '') : '';
    var statoRecord = String(row[iStatoRecord] || '').toLowerCase();

    // Skip gia archiviati
    if (statoRecord === 'archiviato') continue;

    // Classifica settore cultura
    var sc = classificaSettoreCultura(titolo, settore, sommario, cpv);
    if (sc) classificati++;

    // Scrivi SettoreCultura nella colonna (capitalizza prima lettera)
    var scCapital = sc ? (sc.charAt(0).toUpperCase() + sc.slice(1)) : '';
    scUpdates.push({ row: r + 2, val: scCapital });

    // Se chiaramente non culturale, marca come archiviato
    if (!isBandoCulturale(titolo, settore, sommario, cpv)) {
      srUpdates.push({ row: r + 2, val: 'archiviato' });
      archiviati++;
    }
  }

  // Scrittura batch: SettoreCultura
  if (scUpdates.length > 0) {
    var scValues = [];
    for (var s = 0; s < scUpdates.length; s++) {
      scValues.push([scUpdates[s].val]);
    }
    // Scrivi riga per riga per evitare problemi con righe non contigue
    for (var w = 0; w < scUpdates.length; w++) {
      sh.getRange(scUpdates[w].row, colSC).setValue(scUpdates[w].val);
    }
  }

  // Scrittura batch: StatoRecord per archiviati
  for (var a = 0; a < srUpdates.length; a++) {
    sh.getRange(srUpdates[a].row, COL_B.STATO_RECORD).setValue(srUpdates[a].val);
  }

  SpreadsheetApp.flush();

  var result = {
    ok: true,
    classificati: classificati,
    archiviati: archiviati,
    totale: data.length,
    colSettoreCultura: colSC,
    colCPV: colCPV
  };
  Logger.log('=== backfillSettoreCultura DONE: ' + JSON.stringify(result) + ' ===');
  return result;
}

/**
 * v4.25.8 — Pulizia bandi TED con dati inutili.
 * Archivia bandi che hanno:
 *   - Titolo = solo numero pubblicazione TED (es. "TED Notice 283014-2016")
 *   - Nessuna scadenza
 *   - Nessun sommario utile
 * Eseguire una volta dall'editor GAS.
 */
function puliziBandiTedVuoti() {
  Logger.log('=== puliziBandiTedVuoti START ===');
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shName = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
  var sh = ss.getSheetByName(shName);
  if (!sh || sh.getLastRow() < 2) { Logger.log('Foglio vuoto'); return { ok:false }; }

  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h||'').trim(); });
  var iTit = head.indexOf('Titolo');
  var iScad = head.indexOf('Scadenza');
  var iSomm = head.indexOf('Sommario');
  var iFonte = head.indexOf('FonteNome');
  var iStato = head.indexOf('StatoRecord');

  var archiviati = 0;
  var samples = [];
  for (var r = 1; r < vals.length; r++) {
    var stato = String(vals[r][iStato]||'').toLowerCase();
    if (stato === 'archiviato') continue;

    var titolo = String(vals[r][iTit]||'').trim();
    var scadenza = vals[r][iScad];
    var sommario = String(vals[r][iSomm]||'').trim();
    var fonte = String(vals[r][iFonte]||'').toLowerCase();

    // Bando TED con solo numero pubblicazione come titolo
    var isTedNumero = /^(TED\s+Notice\s+)?\d{3,}-\d{4}$/.test(titolo) || /^\d{6,}-\d{4}$/.test(titolo);
    // Bando senza scadenza valida
    var haScadenza = false;
    if (scadenza instanceof Date && !isNaN(scadenza.getTime())) haScadenza = true;
    else if (scadenza && String(scadenza).match(/\d{4}/)) haScadenza = true;

    // Archivia se: titolo inutile (solo numero) E senza scadenza, OPPURE titolo vuoto
    if ((isTedNumero && !haScadenza) || !titolo) {
      sh.getRange(r + 1, iStato + 1).setValue('archiviato');
      archiviati++;
      if (samples.length < 5) samples.push(titolo.substring(0, 50));
    }
  }

  Logger.log('=== puliziBandiTedVuoti DONE: ' + archiviati + ' archiviati ===');
  if (samples.length) Logger.log('Esempi: ' + samples.join(' | '));
  return { ok: true, archiviati: archiviati, esempi: samples };
}
