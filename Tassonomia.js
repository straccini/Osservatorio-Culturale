// ============================================================================
// Tassonomia.js — Classificazione T1–T10 con grado di aderenza
// v4.28.1 — 2026-08-02 · Fase 2 del piano regia fonti
// (docs/superpowers/plans/2026-08-02-regia-fonti-tassonomia.md)
//
// Ogni contenuto riceve: Tipologia (T1..T10, principale) + Aderenza (0–100).
// Decisione confermata: si classificano i NUOVI contenuti e gli ATTIVI/esposti,
// non l'archivio profondo.
//
// Architettura:
//   - _txEuristica_(testo)  → ipotesi da parole chiave (offline, testabile)
//   - _txClaudeBatch_(items) → classificazione Claude Haiku a lotti di 12
//   - txBatchNotturno(opts) → batch sui contenuti attivi senza tipologia
//   - txStato()             → copertura per foglio (numeri, non impressioni)
//
// Le colonne Tipologia/Aderenza vengono AGGIUNTE IN CODA ai fogli: gli indici
// posizionali esistenti (COL_B ecc.) non si muovono.
// ============================================================================

var TX_BATCH_CLAUDE = 12;      // contenuti per chiamata Claude
var TX_CAP_RUN = 60;           // contenuti massimi per esecuzione batch

// Parole chiave per l'ipotesi euristica (usata come fallback se l'API non
// risponde e come prior nel prompt). Non è la classificazione finale.
var TX_KEYWORDS = {
  T1:  /(restaur|riqualificazion|allestiment|museografi|musealizzazion|recupero\s+(?:edifici|immobil)|cantiere|architettonic)/i,
  T2:  /(app\b|piattaform|audioguid|realt[aà]\s+(?:virtuale|aumentata)|\bvr\b|\bar\b|digitalizzazion|catalogo\s+digitale|\bcms\b|intelligenza\s+artificiale|\bai\b|chatbot|multimedial)/i,
  T3:  /(accessibilit|\blis\b|braille|\betr\b|easy\s+to\s+read|\bcaa\b|disabilit|barriere|inclusion|ipovedent|sordit|autism)/i,
  T5:  /(audience|partecipazion|co-?progettazion|community|welfare\s+cultural|mediazion|edutainment|engagement|volontariat|pubblico\s+giovan)/i,
  T6:  /(piano\s+di\s+gestione|governance|sostenibilit[aà]\s+economic|modello\s+organizzativ|bilancio|fundraising|gestione\s+(?:del\s+)?patrimonio|ente\s+pubblic)/i,
  T7:  /(turism|\bdmc\b|\bdmo\b|borgh|itinerar|ospitalit|enogastronom|gastronom|cammin|destinazion)/i,
  T8:  /(\bgal\b|sviluppo\s+(?:local|territorial)|distrett|contratt[oi]\s+di\s+fiume|area\s+intern|strategia\s+territorial|rigenerazione\s+urban)/i,
  T9:  /(storytelling|narrazion|didattic|catalog|mostra|esposizion|curatel|contenut[oi]\s+(?:cultural|scientific|museal)|collezion|archiv)/i,
  T10: /(design|arti\s+performativ|teatro|danza|cinema|musica|festival|editoria|fotografi|moda\b)/i
};

// ---------------------------------------------------------------------------
// Euristica offline
// ---------------------------------------------------------------------------

/**
 * Ipotesi da parole chiave: tipologia col maggior numero di match.
 * @return {Object} { tipologia:'T1'..'T10'|null, punteggio:int }
 */
function _txEuristica_(testo) {
  var t = String(testo || '');
  var best = null, bestN = 0;
  Object.keys(TX_KEYWORDS).forEach(function (cod) {
    var re = new RegExp(TX_KEYWORDS[cod].source, 'gi');
    var n = (t.match(re) || []).length;
    if (n > bestN) { bestN = n; best = cod; }
  });
  return { tipologia: best, punteggio: bestN };
}

/** Normalizza la risposta del modello: solo codici validi, aderenza 0–100. */
function _txNormalizza_(o) {
  var codici = OC_TIPOLOGIE.map(function (t) { return t.cod; });
  var cod = String((o && o.tipologia) || '').toUpperCase().trim();
  if (codici.indexOf(cod) < 0) return null;
  var ad = Number((o && o.aderenza));
  if (isNaN(ad)) ad = 0;
  ad = Math.max(0, Math.min(100, Math.round(ad)));
  return { tipologia: cod, aderenza: ad };
}

// ---------------------------------------------------------------------------
// Classificazione Claude (a lotti)
// ---------------------------------------------------------------------------

function _txPromptCatalogo_() {
  return OC_TIPOLOGIE.map(function (t) {
    return t.cod + ' — ' + t.nome + ' (es.: ' + t.esempi + ')';
  }).join('\n');
}

/**
 * Classifica un lotto di contenuti. items: [{id, titolo, testo}].
 * @return {Object} mappa id → {tipologia, aderenza}; {} se l'API non risponde.
 */
function _txClaudeBatch_(items) {
  var apiKey = (typeof _claudeKey_ === 'function') ? _claudeKey_() : null;
  if (!apiKey || !items.length) return {};

  var elenco = items.map(function (it, i) {
    return (i + 1) + '. [' + it.id + '] ' + String(it.titolo || '').substring(0, 160) +
      (it.testo ? ' — ' + String(it.testo).substring(0, 280) : '');
  }).join('\n');

  var prompt = 'Sei il classificatore dell\'Osservatorio Culturale Sinopia (musei, patrimonio, cultura).\n'
    + 'Tassonomia (assegna UNA tipologia principale per contenuto):\n'
    + _txPromptCatalogo_() + '\n\n'
    + 'Aderenza = quanto il contenuto è centrato sulla tipologia assegnata E pertinente al mondo '
    + 'della cultura/musei/patrimonio (0 = fuori tema, 100 = perfettamente centrato). '
    + 'Se un contenuto è culturale ma non rientra in T1-T9, usa T10. '
    + 'Se non è affatto culturale, aderenza sotto 30.\n\n'
    + 'Contenuti:\n' + elenco + '\n\n'
    + 'Rispondi SOLO con un array JSON valido, un elemento per contenuto:\n'
    + '[{"id":"<id>","tipologia":"T1".."T10","aderenza":0-100}]';

  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', muteHttpExceptions: true,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      payload: JSON.stringify({
        model: (typeof OC_CLAUDE_MODEL !== 'undefined' ? OC_CLAUDE_MODEL : 'claude-haiku-4-5-20251001'),
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('[Tassonomia] HTTP ' + resp.getResponseCode());
      return {};
    }
    var body = JSON.parse(resp.getContentText());
    var txt = (body.content && body.content[0] && body.content[0].text) || '';
    var m = txt.match(/\[[\s\S]*\]/);
    if (!m) return {};
    var arr = JSON.parse(m[0]);
    var out = {};
    arr.forEach(function (o) {
      var norm = _txNormalizza_(o);
      if (norm && o.id) out[String(o.id)] = norm;
    });
    return out;
  } catch (e) {
    Logger.log('[Tassonomia] errore API: ' + e.message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Colonne sui fogli — SEMPRE aggiunte in coda (gli indici COL_B non si muovono)
// ---------------------------------------------------------------------------

function _txEnsureColonne_(sh) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h || '').trim(); });
  var out = { iTip: head.indexOf('Tipologia'), iAde: head.indexOf('Aderenza') };
  if (out.iTip < 0) {
    var col = sh.getLastColumn() + 1;
    sh.getRange(1, col).setValue('Tipologia').setFontWeight('bold');
    out.iTip = col - 1;
  }
  if (out.iAde < 0) {
    var col2 = sh.getLastColumn() + 1;
    sh.getRange(1, col2).setValue('Aderenza').setFontWeight('bold');
    out.iAde = col2 - 1;
  }
  return out;   // indici 0-based
}

// ---------------------------------------------------------------------------
// Batch notturno — contenuti attivi/recenti senza tipologia
// ---------------------------------------------------------------------------

/** Bersagli: quali fogli, quali righe considerare "attive/esposte". */
function _txBersagli_() {
  var ss = getMainSS();
  var lista = [];

  // News: ultime 30gg non archiviate
  var shI = ss.getSheetByName('Items');
  if (shI) lista.push({
    nome: 'news', sh: shI, colId: 'ID', colTitolo: 'Titolo', colTesto: 'SommarioAI',
    filtro: function (row, h) {
      var arch = row[h.indexOf('Archiviato')];
      if (arch === true || String(arch).toLowerCase() === 'true') return false;
      var d = row[h.indexOf('DataAcquisizione')];
      var dt = (d instanceof Date) ? d : (d ? new Date(d) : null);
      return dt && !isNaN(dt) && (Date.now() - dt.getTime()) <= 30 * 86400000;
    }
  });

  // Bandi: attivi (foglio RADAR BANDI, spreadsheet separato)
  try {
    var shB = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
    if (shB) lista.push({
      // v4.28.5 — il testo dei bandi sta in 'Sommario' (COL_B_HEADERS), non 'Descrizione'
      nome: 'bandi', sh: shB, colId: 'ID', colTitolo: 'Titolo', colTesto: 'Sommario',
      filtro: function (row, h) {
        var st = String(row[h.indexOf('StatoRecord')] || '').toLowerCase();
        return st !== 'archiviato' && st !== 'cestinato';
      }
    });
  } catch (eB) {}

  // Podcast + video: non archiviati
  var shP = ss.getSheetByName('Podcast');
  if (shP) lista.push({
    nome: 'podcast+video', sh: shP, colId: 'ID', colTitolo: 'Titolo', colTesto: 'SommarioAI',
    filtro: function (row, h) {
      return String(row[h.indexOf('StatoRecord')] || '').toLowerCase() !== 'archiviato';
    }
  });

  // Pubblicazioni: tutte quelle esposte
  var shL = ss.getSheetByName('Pubblicazioni');
  if (shL) lista.push({
    nome: 'libri', sh: shL, colId: 'ID', colTitolo: 'Titolo', colTesto: 'Descrizione',
    filtro: function (row, h) {
      var iS = h.indexOf('Stato');
      return iS < 0 || String(row[iS] || '').toLowerCase() !== 'archiviato';
    }
  });

  // Norme
  var shN = ss.getSheetByName('Norme');
  if (shN) lista.push({
    nome: 'norme', sh: shN, colId: 'ID', colTitolo: 'Titolo', colTesto: 'Descrizione',
    filtro: function () { return true; }
  });

  return lista;
}

/**
 * Classifica i contenuti attivi privi di Tipologia. Schedulato di notte,
 * eseguibile anche dal pannello. {dryRun:true} conta senza chiamare l'API.
 */
function txBatchNotturno(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var cap = opts.cap || TX_CAP_RUN;
  var rep = { ok: true, dryRun: dryRun, daClassificare: 0, classificati: 0, perFoglio: {}, esempi: [] };
  var budget = cap;

  _txBersagli_().forEach(function (b) {
    if (budget <= 0) return;
    try {
      var cols = dryRun ? null : _txEnsureColonne_(b.sh);
      var v = b.sh.getDataRange().getValues();
      var h = v[0].map(function (x) { return String(x || '').trim(); });
      var iId = h.indexOf(b.colId), iTit = h.indexOf(b.colTitolo), iTxt = h.indexOf(b.colTesto);
      var iTip = h.indexOf('Tipologia');
      var candidati = [];
      for (var r = 1; r < v.length && candidati.length < budget; r++) {
        if (!v[r][iId]) continue;
        if (iTip >= 0 && v[r][iTip]) continue;              // già classificato
        if (!b.filtro(v[r], h)) continue;
        candidati.push({ id: String(v[r][iId]), titolo: v[r][iTit],
                         testo: iTxt >= 0 ? v[r][iTxt] : '', riga: r + 1 });
      }
      rep.daClassificare += candidati.length;
      rep.perFoglio[b.nome] = { candidati: candidati.length, scritti: 0 };
      if (dryRun || !candidati.length) return;

      // A lotti verso Claude; fallback euristico se l'API non risponde
      for (var i = 0; i < candidati.length; i += TX_BATCH_CLAUDE) {
        var lotto = candidati.slice(i, i + TX_BATCH_CLAUDE);
        var esiti = _txClaudeBatch_(lotto);
        lotto.forEach(function (c) {
          var e = esiti[c.id];
          if (!e) {
            var eur = _txEuristica_(String(c.titolo || '') + ' ' + String(c.testo || ''));
            if (!eur.tipologia) return;
            e = { tipologia: eur.tipologia, aderenza: Math.min(35, eur.punteggio * 10) };
          }
          b.sh.getRange(c.riga, cols.iTip + 1).setValue(e.tipologia);
          b.sh.getRange(c.riga, cols.iAde + 1).setValue(e.aderenza);
          rep.classificati++;
          rep.perFoglio[b.nome].scritti++;
          if (rep.esempi.length < 8) rep.esempi.push(e.tipologia + '(' + e.aderenza + ') ' + String(c.titolo || '').substring(0, 60));
        });
        Utilities.sleep(600);
      }
      budget -= candidati.length;
    } catch (e) {
      rep.perFoglio[b.nome] = { errore: e.message };
    }
  });

  Logger.log('[txBatchNotturno] classificati ' + rep.classificati + '/' + rep.daClassificare);
  return rep;
}

// ---------------------------------------------------------------------------
// Stato — copertura per foglio
// ---------------------------------------------------------------------------

function txStato() {
  var out = { ok: true, soglia: (typeof OC_ADERENZA_SOGLIA !== 'undefined' ? OC_ADERENZA_SOGLIA : 40), perFoglio: {} };
  _txBersagli_().forEach(function (b) {
    try {
      var v = b.sh.getDataRange().getValues();
      var h = v[0].map(function (x) { return String(x || '').trim(); });
      var iTip = h.indexOf('Tipologia'), iAde = h.indexOf('Aderenza'), iId = h.indexOf(b.colId);
      var attivi = 0, classificati = 0, deboli = 0, perT = {};
      for (var r = 1; r < v.length; r++) {
        if (!v[r][iId] || !b.filtro(v[r], h)) continue;
        attivi++;
        var tip = iTip >= 0 ? String(v[r][iTip] || '') : '';
        if (!tip) continue;
        classificati++;
        perT[tip] = (perT[tip] || 0) + 1;
        if (iAde >= 0 && Number(v[r][iAde] || 0) < out.soglia) deboli++;
      }
      out.perFoglio[b.nome] = { attivi: attivi, classificati: classificati,
                                daFare: attivi - classificati, aderenzaDebole: deboli, perTipologia: perT };
    } catch (e) { out.perFoglio[b.nome] = { errore: e.message }; }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Self-test — euristica e normalizzazione (offline, nessuna chiamata API)
// ---------------------------------------------------------------------------

function txSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function eq(nome, atteso, ottenuto) {
    if (String(atteso) === String(ottenuto)) pass++;
    else { fail++; falliti.push(nome + ': atteso ' + atteso + ', ottenuto ' + ottenuto); }
  }
  // euristica su casi netti
  eq('T3 accessibilità', 'T3', _txEuristica_('Percorsi LIS e Braille per visitatori con disabilità: abbattere le barriere').tipologia);
  eq('T1 restauro', 'T1', _txEuristica_('Restauro e riqualificazione dell\'ala nord con nuovo allestimento museografico').tipologia);
  eq('T7 turismo', 'T7', _txEuristica_('Itinerari enogastronomici nei borghi: la DMC punta sull\'ospitalità diffusa').tipologia);
  eq('T8 GAL', 'T8', _txEuristica_('Il GAL finanzia la strategia di sviluppo locale delle aree interne').tipologia);
  eq('T2 digitale', 'T2', _txEuristica_('Nuova app con audioguida e realtà aumentata, catalogo digitale del museo').tipologia);
  eq('T10 performing', 'T10', _txEuristica_('Festival di danza contemporanea e teatro: il cartellone').tipologia);
  eq('nessun match', 'null', String(_txEuristica_('Risultati della partita di ieri sera').tipologia));
  // normalizzazione
  eq('norm valida', 'T5', (_txNormalizza_({ tipologia: 't5', aderenza: 80 }) || {}).tipologia);
  eq('norm clamp >100', '100', (_txNormalizza_({ tipologia: 'T9', aderenza: 250 }) || {}).aderenza);
  eq('norm clamp <0', '0', (_txNormalizza_({ tipologia: 'T9', aderenza: -5 }) || {}).aderenza);
  eq('T4 inesistente rifiutato', 'null', String(_txNormalizza_({ tipologia: 'T4', aderenza: 50 })));
  eq('codice inventato rifiutato', 'null', String(_txNormalizza_({ tipologia: 'T99', aderenza: 50 })));
  // catalogo: T4 assente, T10 presente
  var codici = OC_TIPOLOGIE.map(function (t) { return t.cod; });
  eq('catalogo senza T4', -1, codici.indexOf('T4'));
  eq('catalogo con T10', true, codici.indexOf('T10') >= 0);
  eq('catalogo 9 tipologie', 9, codici.length);
  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
