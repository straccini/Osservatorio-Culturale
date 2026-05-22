/**
 * ============================================================================
 *  Fonti_v1.gs — Modulo unificato gestione fonti (bandi, news, podcast, video)
 * ============================================================================
 *  Sprint 2 anticipato (2026-05-11) — blocco B1
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Scopo: introdurre uno schema 18 colonne (FU17) identico per tutte le fonti, con
 *  helper unico per leggere/scrivere indipendentemente dal tipo.
 *
 *  Fogli gestiti:
 *    FontiBandi_v5  - schema gia' allineato (Bandi_v5.js COL_F)
 *    FontiNews      - nuovo, unisce SocialFonti + pipeline news editoriale
 *    FontiPodcast   - solo audio RSS dopo split video
 *    FontiVideo     - canali YouTube separati
 *
 *  Decisioni operative confermate 2026-05-09:
 *    Fogli separati ma stesso schema (no foglio unico con campo Tipo).
 *    RSS feed e News editoriali unificati sotto FontiNews con tag.
 *    Tab admin unica "Tutte le Fonti" con filtri (vedi blocco B3).
 *
 *  Funzioni esportate (chiamate da google.script.run):
 *    getFontiUnified(filtro)         - lookup su tutti i fogli con filtro
 *    getFonteSheet(tipo)             - ritorna il foglio per tipo
 *    addFonteUnificataV2(body)       - add fonte qualsiasi tipo schema 18col FU17
 *    toggleFonteUnified(tipo, id, attiva)
 *    deleteFonteUnified(tipo, id)
 *    getFontiCounters()              - counter per dashboard admin (per tipo)
 * ============================================================================
 */

// ============================================================================
// SCHEMA UNIFICATO (18 colonne FU17, 1-indexed per Sheets)
// ============================================================================

var FU_COL = {
  ID:              1,
  NOME:            2,
  URL:             3,
  TIPO:            4,   // RSS | HTML | Sitemap | YouTube | Gmail
  TAG:             5,   // istituzionale | editoriale | audio | video | settoriale
  CATEGORIA:       6,
  PRIORITA:        7,   // 1=alta | 2=media | 3=bassa
  ATTIVA:          8,   // bool
  DATA_AGGIUNTA:   9,
  ULTIMA_SCAN:     10,
  ULTIMO_ESITO:    11,  // OK | HTTP_ERR | EMPTY | PARSE_ERR | NETWORK | DISABLED
  N_REC_TOTALI:    12,
  N_REC_ULTIMO:    13,
  FAIL_CONSECUTIVI:14,
  ULTIMO_ERRORE:   15,  // FU17: descrizione errore ultimo fallimento
  ENTE_DEFAULT:    16,  // FU17: ente emittente default (bandi)
  LIVELLO:         17,  // FU17: Nazionale | Regionale | EU | Locale
  EXTRAS_JSON:     18   // FU17: JSON con campi specifici per tipo
};

var FU_HEADERS = [
  'ID','Nome','URL','Tipo','Tag','Categoria','Priorita','Attiva',
  'DataAggiunta','UltimaScan','UltimoEsito',
  'NRecordTotali','NRecordUltimo','FailConsecutivi',
  'UltimoErrore','EnteDefault','Livello','extras_json'
];

// Mappatura tipo -> nome foglio Drive
var FU_SHEETS = {
  bandi:   'FontiBandi_v5',
  news:    'FontiNews',
  podcast: 'FontiPodcast',
  video:   'FontiVideo'
};

// Tag validi per ogni tipo (per validazione + filtri UI)
var FU_TAGS_PER_TIPO = {
  bandi:   ['ministero','regione','ue','aggregatore','fondazione','rivista','associazione'],
  news:    ['istituzionale','editoriale','settoriale','rivista'],
  podcast: ['audio'],
  video:   ['video']
};

// Esiti scansione (uniformi tra moduli)
var FU_OUTCOME = {
  OK:        'OK',
  HTTP_ERR:  'HTTP_ERR',
  EMPTY:     'EMPTY',
  PARSE_ERR: 'PARSE_ERR',
  NETWORK:   'NETWORK',
  DISABLED:  'DISABLED'
};

var FU_FAIL_DISABLE_SOGLIA = 3;

// ============================================================================
// HELPER: getFonteSheet(tipo) — ritorna foglio Drive per tipo
// ============================================================================

function getFonteSheet(tipo) {
  var sheetName = FU_SHEETS[String(tipo).toLowerCase()];
  if (!sheetName) return null;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    // Crea foglio con header se non esiste (idempotente)
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 1, FU_HEADERS.length).setValues([FU_HEADERS])
      .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 220);  // Nome
    sh.setColumnWidth(3, 320);  // URL
    Logger.log('getFonteSheet: foglio ' + sheetName + ' creato con schema unificato');
  }
  return sh;
}

// ============================================================================
// HELPER: _fuRowToObj_(row, tipo) — converte riga sheet in oggetto JSON
// ============================================================================

function _fuRowToObj_(row, tipo) {
  return {
    id:           String(row[FU_COL.ID - 1] || ''),
    nome:         String(row[FU_COL.NOME - 1] || ''),
    url:          String(row[FU_COL.URL - 1] || ''),
    tipo:         tipo,
    tipoFonte:    String(row[FU_COL.TIPO - 1] || ''),
    tag:          String(row[FU_COL.TAG - 1] || ''),
    categoria:    String(row[FU_COL.CATEGORIA - 1] || ''),
    priorita:     Number(row[FU_COL.PRIORITA - 1] || 2),
    attiva:       row[FU_COL.ATTIVA - 1] === true || row[FU_COL.ATTIVA - 1] === 'TRUE',
    dataAggiunta: row[FU_COL.DATA_AGGIUNTA - 1] || null,
    ultimaScan:   row[FU_COL.ULTIMA_SCAN - 1] || null,
    ultimoEsito:  String(row[FU_COL.ULTIMO_ESITO - 1] || ''),
    nRecTotali:   Number(row[FU_COL.N_REC_TOTALI - 1] || 0),
    nRecUltimo:   Number(row[FU_COL.N_REC_ULTIMO - 1] || 0),
    failConsec:   Number(row[FU_COL.FAIL_CONSECUTIVI - 1] || 0),
    ultimoErrore: String(row[FU_COL.ULTIMO_ERRORE - 1] || ''),
    enteDefault:  String(row[FU_COL.ENTE_DEFAULT - 1] || ''),
    livello:      String(row[FU_COL.LIVELLO - 1] || ''),
    extrasJson:   String(row[FU_COL.EXTRAS_JSON - 1] || '')
  };
}

// ============================================================================
// MAIN: getFontiUnified(filtro)
// ----------------------------------------------------------------------------
// Restituisce TUTTE le fonti di TUTTI i tipi, con opzionale filtraggio.
//
// @param filtro {Object} opzionale:
//    { tipo: 'bandi|news|podcast|video',  // filtra per tipo
//      q: 'parola',                        // ricerca testuale su nome+url
//      stato: 'ok|fail|silente|stantia',   // filtro stato semaforo
//      attiva: true|false }                // solo attive o solo disattive
// @return { ok, fonti: [...], totale, perTipo: {bandi:N, news:N, ...} }
// ============================================================================

function getFontiUnified(filtro) {
  try {
    filtro = filtro || {};
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var tipi = filtro.tipo ? [filtro.tipo.toLowerCase()] : Object.keys(FU_SHEETS);
    var out = [];
    var perTipo = { bandi:0, news:0, podcast:0, video:0 };

    tipi.forEach(function(tipo) {
      var sheetName = FU_SHEETS[tipo];
      if (!sheetName) return;
      var sh = ss.getSheetByName(sheetName);
      if (!sh) return;
      var vals = sh.getDataRange().getValues();
      if (vals.length < 2) return;
      for (var r = 1; r < vals.length; r++) {
        if (!vals[r][FU_COL.ID - 1]) continue;
        var obj = _fuRowToObj_(vals[r], tipo);

        // Filtri
        if (filtro.attiva !== undefined && obj.attiva !== filtro.attiva) continue;
        if (filtro.q) {
          var q = String(filtro.q).toLowerCase();
          if (obj.nome.toLowerCase().indexOf(q) < 0 && obj.url.toLowerCase().indexOf(q) < 0) continue;
        }
        if (filtro.stato) {
          var stato = _fuStatoSemaforo_(obj);
          if (stato !== filtro.stato) continue;
        }

        out.push(obj);
        perTipo[tipo] = (perTipo[tipo] || 0) + 1;
      }
    });

    // Ordinamento opzionale
    var sortBy = filtro.sortBy || 'stato';  // stato | nome | ultimaScan
    if (sortBy === 'nome') {
      out.sort(function(a, b) { return a.nome.localeCompare(b.nome); });
    } else if (sortBy === 'ultimaScan') {
      out.sort(function(a, b) {
        var ta = a.ultimaScan ? new Date(a.ultimaScan).getTime() : 0;
        var tb = b.ultimaScan ? new Date(b.ultimaScan).getTime() : 0;
        return tb - ta;
      });
    } else {
      // stato: silente -> fail -> stantia -> ok -> mai
      var ordStato = { silente:0, fail:1, stantia:2, mai:3, ok:4 };
      out.sort(function(a, b) {
        return (ordStato[_fuStatoSemaforo_(a)] || 5) - (ordStato[_fuStatoSemaforo_(b)] || 5);
      });
    }

    return { ok: true, fonti: out, totale: out.length, perTipo: perTipo };
  } catch(e) {
    Logger.log('getFontiUnified ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// HELPER: _fuStatoSemaforo_(fonte) — classifica stato per filtri/UI
// ============================================================================

function _fuStatoSemaforo_(f) {
  if (f.failConsec >= 3) return 'silente';
  if (f.failConsec >= 1) return 'fail';
  if (!f.ultimaScan) return 'mai';
  var hours = (Date.now() - new Date(f.ultimaScan).getTime()) / 3600000;
  if (f.ultimoEsito === 'OK' && hours < 36) return 'ok';
  return 'stantia';
}

// ============================================================================
// MAIN: addFonteUnificataV2(body)
// ----------------------------------------------------------------------------
// Aggiunge una fonte di qualsiasi tipo con schema 18 colonne (FU17).
//
// @param body {Object}: { tipo, nome, url, tipoFonte, tag, categoria, priorita, note }
// @return { ok, id, tipo, sheetName } | { ok:false, error }
// ============================================================================

function addFonteUnificataV2(body) {
  try {
    body = body || {};
    var tipo = String(body.tipo || '').toLowerCase();
    if (!FU_SHEETS[tipo]) {
      return { ok: false, error: 'Tipo fonte non valido: ' + tipo + '. Validi: ' + Object.keys(FU_SHEETS).join(', ') };
    }
    if (!body.nome || !body.url) {
      return { ok: false, error: 'Nome e URL sono obbligatori' };
    }
    var sh = getFonteSheet(tipo);
    if (!sh) return { ok: false, error: 'Foglio ' + FU_SHEETS[tipo] + ' non disponibile' };

    var prefix = { bandi:'FB', news:'FN', podcast:'FP', video:'FV' }[tipo] || 'FF';
    var id = prefix + Date.now();

    var row = new Array(FU_HEADERS.length).fill('');
    row[FU_COL.ID - 1]              = id;
    row[FU_COL.NOME - 1]            = String(body.nome).trim();
    row[FU_COL.URL - 1]             = String(body.url).trim();
    row[FU_COL.TIPO - 1]            = String(body.tipoFonte || 'RSS').trim();
    row[FU_COL.TAG - 1]             = String(body.tag || (FU_TAGS_PER_TIPO[tipo] || ['settoriale'])[0]).trim();
    row[FU_COL.CATEGORIA - 1]       = String(body.categoria || '').trim();
    row[FU_COL.PRIORITA - 1]        = Number(body.priorita) || 2;
    row[FU_COL.ATTIVA - 1]          = true;
    row[FU_COL.DATA_AGGIUNTA - 1]   = new Date();
    row[FU_COL.ULTIMA_SCAN - 1]     = '';
    row[FU_COL.ULTIMO_ESITO - 1]    = '';
    row[FU_COL.N_REC_TOTALI - 1]    = 0;
    row[FU_COL.N_REC_ULTIMO - 1]    = 0;
    row[FU_COL.FAIL_CONSECUTIVI - 1]= 0;
    row[FU_COL.ULTIMO_ERRORE - 1] = '';
    row[FU_COL.ENTE_DEFAULT - 1]  = String(body.enteDefault || '').trim();
    row[FU_COL.LIVELLO - 1]       = String(body.livello || '').trim();
    row[FU_COL.EXTRAS_JSON - 1]   = body.extrasJson ? JSON.stringify(body.extrasJson) : '';

    sh.appendRow(row);
    Logger.log('addFonteUnificataV2 OK: ' + tipo + ' ' + body.nome + ' (id=' + id + ')');
    return { ok: true, id: id, tipo: tipo, sheetName: FU_SHEETS[tipo] };
  } catch(e) {
    Logger.log('addFonteUnificataV2 ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// MAIN: toggleFonteUnified(tipo, id, attiva)
// ============================================================================

function toggleFonteUnified(tipo, id, attiva) {
  try {
    var sh = getFonteSheet(tipo);
    if (!sh) return { ok: false, error: 'Foglio non trovato per tipo ' + tipo };
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][FU_COL.ID - 1]) === String(id)) {
        sh.getRange(r + 1, FU_COL.ATTIVA).setValue(!!attiva);
        if (attiva) sh.getRange(r + 1, FU_COL.FAIL_CONSECUTIVI).setValue(0);
        return { ok: true, id: id, attiva: !!attiva };
      }
    }
    return { ok: false, error: 'Fonte non trovata: ' + id };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// MAIN: deleteFonteUnified(tipo, id)
// ============================================================================

function deleteFonteUnified(tipo, id) {
  try {
    var sh = getFonteSheet(tipo);
    if (!sh) return { ok: false, error: 'Foglio non trovato per tipo ' + tipo };
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][FU_COL.ID - 1]) === String(id)) {
        sh.deleteRow(r + 1);
        return { ok: true, id: id };
      }
    }
    return { ok: false, error: 'Fonte non trovata: ' + id };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// MAIN: getFontiCounters() — counter dashboard admin
// ============================================================================

/**
 * v4.18.29 — Counter robusto su schemi disomogenei.
 *
 * Bug precedente: assumeva ATTIVA in colonna 8 (schema FU unificato), ma
 * FontiBandi_v5 ha ATTIVA in col 7 (schema Bandi_v5.COL_F) e FontiPodcast
 * legacy ha ATTIVA in col 7. Risultato: 0 attive falso per bandi e podcast.
 *
 * Fix: legge la riga di header e mappa per nome ("Attiva", "ID",
 * "FailConsecutivi", "UltimoEsito"). Funziona con qualunque schema purché
 * gli header siano denominati correttamente.
 */
function getFontiCounters() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var out = { bandi:{}, news:{}, podcast:{}, video:{}, totaleGenerale:0, silentiGenerale:0 };
    Object.keys(FU_SHEETS).forEach(function(tipo) {
      var sh = ss.getSheetByName(FU_SHEETS[tipo]);
      if (!sh) { out[tipo] = { totale:0, attive:0, silenti:0, ok:0, note:'foglio assente' }; return; }
      var vals = sh.getDataRange().getValues();
      if (vals.length < 1) { out[tipo] = { totale:0, attive:0, silenti:0, ok:0 }; return; }

      // Cerca le colonne per nome (case-insensitive, accetta sinonimi)
      var header = vals[0].map(function(h){ return String(h || '').trim().toLowerCase(); });
      function findCol_(names) {
        for (var i = 0; i < names.length; i++) {
          var idx = header.indexOf(names[i].toLowerCase());
          if (idx >= 0) return idx;
        }
        return -1;
      }
      var iId    = findCol_(['id']);
      var iAtt   = findCol_(['attiva']);
      var iFail  = findCol_(['failconsecutivi','fail_consecutivi','fail']);
      var iEsito = findCol_(['ultimoesito','ultimo_esito','esito']);

      var t = 0, a = 0, s = 0, ok = 0;
      for (var r = 1; r < vals.length; r++) {
        if (iId >= 0 && !vals[r][iId]) continue;
        if (iId < 0 && !vals[r][0]) continue; // fallback se non c'è header ID
        t++;
        if (iAtt >= 0) {
          var v = vals[r][iAtt];
          if (v === true || String(v).toUpperCase() === 'TRUE' || String(v).toUpperCase() === 'SI') a++;
        }
        if (iFail >= 0) {
          var fc = Number(vals[r][iFail] || 0);
          if (fc >= 3) s++;
        }
        if (iEsito >= 0 && String(vals[r][iEsito] || '') === 'OK') ok++;
      }
      out[tipo] = {
        totale:t, attive:a, silenti:s, ok:ok,
        _schema: { iId:iId, iAttiva:iAtt, iFail:iFail, iEsito:iEsito }  // diagnostica
      };
      out.totaleGenerale += t;
      out.silentiGenerale += s;
    });
    return { ok: true, counters: out };
  } catch(e) { return { ok: false, error: e.message }; }
}

/**
 * v4.18.29 — Bulk activation: setta ATTIVA=TRUE su tutte le righe con cella vuota.
 * Non sovrascrive valori esistenti (TRUE o FALSE espliciti). Idempotente.
 *
 * @param {string} tipo - 'bandi'|'news'|'podcast'|'video'|undefined (tutti)
 * @return {Object} { ok, perTipo: { tipo: {totale, attivate, giaPositive, giaNegative} } }
 */
function attivaFontiVuote(tipo) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var tipi = tipo ? [tipo] : Object.keys(FU_SHEETS);
    var out = {};
    tipi.forEach(function(t) {
      var sheetName = FU_SHEETS[t];
      if (!sheetName) { out[t] = { error: 'tipo non valido' }; return; }
      var sh = ss.getSheetByName(sheetName);
      if (!sh) { out[t] = { error: 'foglio ' + sheetName + ' assente' }; return; }
      var vals = sh.getDataRange().getValues();
      if (vals.length < 2) { out[t] = { totale: 0, attivate: 0, giaPositive: 0, giaNegative: 0 }; return; }

      var header = vals[0].map(function(h){ return String(h || '').trim().toLowerCase(); });
      var iAtt = header.indexOf('attiva');
      var iId  = header.indexOf('id');
      if (iAtt < 0) { out[t] = { error: 'header Attiva mancante in ' + sheetName }; return; }

      var totale = 0, attivate = 0, giaPositive = 0, giaNegative = 0;
      for (var r = 1; r < vals.length; r++) {
        if (iId >= 0 && !vals[r][iId]) continue;
        totale++;
        var v = vals[r][iAtt];
        if (v === true || String(v).toUpperCase() === 'TRUE' || String(v).toUpperCase() === 'SI') {
          giaPositive++;
        } else if (v === false || String(v).toUpperCase() === 'FALSE' || String(v).toUpperCase() === 'NO') {
          giaNegative++;
        } else {
          // cella vuota o valore non riconosciuto → attiva
          sh.getRange(r + 1, iAtt + 1).setValue(true);
          attivate++;
        }
      }
      out[t] = { totale: totale, attivate: attivate, giaPositive: giaPositive, giaNegative: giaNegative, sheetName: sheetName };
    });
    return { ok: true, perTipo: out };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// FINE MODULO Fonti_v1.gs
// ============================================================================
