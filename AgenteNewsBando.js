// ============================================================================
//  AgenteNewsBando.js — v4.38 (2026-09-27)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//
//  OBIETTIVO (richiesta Silvano 25-27/09)
//  --------------------------------------
//  Quando una NOTIZIA (foglio Items) cita una gara / selezione / bando, questo
//  agente cerca il BANDO UFFICIALE su BDNCP/ANAC (la banca dati che copre TUTTI
//  i CIG, anche sotto-soglia) e:
//    · se trova un bando con confidenza ALTA → lo aggiunge al Radar Bandi con il
//      LINK UFFICIALE, passando dai filtri (_fasSaveBando_ → gate anti-notizia);
//    · se la confidenza è MEDIA → registra una candidata da rivedere a mano
//      (foglio BandiCandidatiL2, lo stesso di Crossref);
//    · se non trova nulla di pertinente → non fa nulla (nessuna notizia entra
//      nei bandi).
//
//  IMPORTANTE
//  ----------
//  · NON esegue ricerche sul web (qui non esiste): usa la BDNCP full-text come
//    motore di ricerca, riusando lo stesso fetch del parser BDNCP già in uso.
//  · È PRUDENTE per costruzione (precisione prima del volume, come da tua regola):
//    aggiunge da solo solo con match forte; il resto va nella coda di revisione.
//  · OFF di default: nessun trigger. Si lancia a mano — agenteNewsBando() — e per
//    la prima verifica agenteNewsBando({ dryRun:true }) (non scrive niente).
// ============================================================================

// Segnali FORTI di menzione bando in una notizia (più stretti delle keyword
// generiche di Crossref: qui vogliamo alta precisione).
var ANB_SEGNALE_RE = /(\bbando\b|avviso\s+pubblico|manifestazione\s+d.?interesse|call\s+for\s+proposals|invito\s+a\s+presentare\s+(proposte|progetti|domande)|contributo\s+a\s+fondo\s+perduto|procedura\s+(aperta|negoziata|ristretta)|selezione\s+pubblica|concorso\s+pubblico|domand[ae]\s+di\s+(partecipazione|contributo|ammissione))/i;

// Soglie di confidenza del match notizia↔bando (0..1).
var ANB_SOGLIA_AUTO = 0.55;   // >= → aggiunge da solo il bando ufficiale
var ANB_SOGLIA_CAND = 0.32;   // >= → candidata da rivedere a mano

// Parole troppo comuni per identificare un bando: escluse dai termini di ricerca.
var ANB_STOP = {};
('il lo la i gli le un uno una di a da in con su per tra fra del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle e ed o od ma se che chi cui come dove quando bando avviso pubblico gara call selezione concorso contributo contributi finanziamento progetto progetti nuovo nuova aperta aperto ancora regione comune città museo musei cultura culturale culturali')
  .split(' ').forEach(function (w) { ANB_STOP[w] = true; });

/**
 * Estrae fino a `max` termini salienti da un titolo di notizia (nomi propri e
 * parole lunghe non banali), per costruire la query verso la BDNCP.
 */
function _agTermini_(titolo, max) {
  max = max || 4;
  var parole = String(titolo || '')
    .replace(/[^\wàèéìòùáíóúü'\s-]/gi, ' ')
    .split(/\s+/);
  var out = [], visti = {};
  // priorità ai nomi propri (iniziale maiuscola, non a inizio frase banale)
  parole.forEach(function (p) {
    var pl = p.toLowerCase();
    if (p.length < 5 || ANB_STOP[pl] || visti[pl]) return;
    if (/^[A-ZÀ-Þ]/.test(p)) { out.push(p); visti[pl] = true; }
  });
  // poi parole lunghe non banali
  parole.forEach(function (p) {
    var pl = p.toLowerCase();
    if (out.length >= max) return;
    if (p.length < 6 || ANB_STOP[pl] || visti[pl]) return;
    out.push(p); visti[pl] = true;
  });
  return out.slice(0, max);
}

/** Tokenizza per il confronto (minuscolo, no stopword, no parole corte). */
function _agTok_(s) {
  var t = {};
  String(s || '').toLowerCase().replace(/[^\wàèéìòùáíóúü\s]/g, ' ').split(/\s+/).forEach(function (w) {
    if (w.length >= 4 && !ANB_STOP[w]) t[w] = true;
  });
  return t;
}

/**
 * Punteggio di match notizia↔bando (0..1): Jaccard sui token del titolo, con
 * bonus se l'ente della notizia e quello del bando condividono un token.
 */
function _agMatch_(newsTit, newsEnte, bandoTit, bandoEnte) {
  var a = _agTok_(newsTit), b = _agTok_(bandoTit);
  var ka = Object.keys(a), kb = Object.keys(b);
  if (!ka.length || !kb.length) return 0;
  var inter = 0;
  ka.forEach(function (w) { if (b[w]) inter++; });
  var uni = ka.length + kb.length - inter;
  var jac = uni ? inter / uni : 0;
  // bonus ente (token condiviso tra i due enti)
  var ea = _agTok_(newsEnte), eb = _agTok_(bandoEnte);
  var enteMatch = false;
  Object.keys(ea).forEach(function (w) { if (eb[w]) enteMatch = true; });
  var score = jac + (enteMatch ? 0.2 : 0);
  return score > 1 ? 1 : score;
}

/**
 * @private Cerca sulla BDNCP full-text (stesso endpoint del parser BDNCP) e
 * ritorna una lista di bandi candidati normalizzati. Nessuna scrittura.
 */
function _bdncpCerca_(query, size) {
  var q = String(query || '').trim();
  if (!q) return [];
  size = size || 15;
  var base = (typeof FAS_BDNCP_BASE !== 'undefined')
    ? FAS_BDNCP_BASE : 'https://pubblicitalegale.anticorruzione.it/api/v0/avvisi-full-text';
  var url = base + '?page=0&size=' + size + '&codiceScheda=4&keywords=' + encodeURIComponent(q);
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, deadline: 20,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; SinopiaOC/1.0; cultural-observatory)',
        'Referer': 'https://pubblicitalegale.anticorruzione.it/ricerca-avanzata'
      }
    });
    if (resp.getResponseCode() !== 200) return [];
    var data = JSON.parse(resp.getContentText());
    var content = data.content || [];
    var out = [];
    content.forEach(function (av) {
      var info = (typeof _fasBdncpEstrai_ === 'function') ? _fasBdncpEstrai_(av) : null;
      if (!info || !info.titolo) return;
      var id = av.idAvviso || '';
      var link = info.docLink || (id ? 'https://pubblicitalegale.anticorruzione.it/bandi/' + id : '');
      if (!link) return;
      out.push({
        titolo: info.titolo, ente: info.ente || '', link: link, cpv: info.cpv || '',
        importo: info.importo || '', luogo: info.luogo || '',
        scadenza: info.scadenza || (typeof _fasNormalizzaData_ === 'function' ? _fasNormalizzaData_(av.dataScadenza || '') : '')
      });
    });
    return out;
  } catch (e) {
    Logger.log('[AgenteNewsBando] _bdncpCerca_ "' + q + '" errore: ' + e.message);
    return [];
  }
}

/**
 * Agente news→bando. Scansiona le notizie recenti che citano un bando, cerca il
 * bando ufficiale su BDNCP/ANAC e aggiorna la sezione Bandi (o la coda di revisione).
 *
 * @param {Object} [opts] {dryRun:bool, giorni:int (default 14), maxNews:int (default 60), token}
 * @return {Object} report
 */
function agenteNewsBando(opts) {
  opts = opts || {};
  if (opts.token && typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(opts.token)) {
    return { ok: false, error: 'forbidden' };
  }
  var dryRun = !!opts.dryRun;
  var giorni = opts.giorni || 14;
  var maxNews = opts.maxNews || 60;
  var report = { ok: true, dryRun: dryRun, newsScansionate: 0, newsConMenzione: 0, bandiAggiunti: 0, candidateRevisione: 0, senzaMatch: 0, dettagli: [] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName((typeof SH !== 'undefined' && SH && SH.ITEMS) ? SH.ITEMS : 'Items');
    if (!sh || sh.getLastRow() < 2) return report;
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var iTit = h.indexOf('Titolo'), iSom = h.indexOf('SommarioAI'), iFonte = h.indexOf('Fonte');
    var iData = h.indexOf('DataPubblicazione'); if (iData < 0) iData = h.indexOf('Data');
    var iArch = h.indexOf('Archiviato');
    if (iTit < 0) return { ok: false, error: 'colonna Titolo assente' };

    var cutoff = new Date(Date.now() - giorni * 86400000);
    var existingUrls = (typeof _fasLoadExistingUrls_ === 'function') ? _fasLoadExistingUrls_() : {};

    for (var r = 1; r < vals.length && report.newsScansionate < maxNews; r++) {
      var row = vals[r];
      var tit = String(row[iTit] || '').trim();
      if (!tit) continue;
      if (iArch >= 0 && (row[iArch] === true || String(row[iArch]).toLowerCase() === 'true')) continue;
      if (iData >= 0) {
        var raw = row[iData];
        var d = (raw instanceof Date) ? raw : (raw ? new Date(raw) : null);
        if (d && !isNaN(d.getTime()) && d < cutoff) continue;
      }
      report.newsScansionate++;

      var somm = iSom >= 0 ? String(row[iSom] || '') : '';
      if (!ANB_SEGNALE_RE.test(tit) && !ANB_SEGNALE_RE.test(somm)) continue; // non menziona un bando
      report.newsConMenzione++;

      var fonte = iFonte >= 0 ? String(row[iFonte] || '') : '';
      var termini = _agTermini_(tit, 4);
      if (!termini.length) { report.senzaMatch++; continue; }

      // cerca il bando ufficiale su BDNCP con i termini della notizia
      var candidati = _bdncpCerca_(termini.join(' '), 15);
      var best = null, bestScore = 0;
      candidati.forEach(function (c) {
        var s = _agMatch_(tit, fonte, c.titolo, c.ente);
        if (s > bestScore) { bestScore = s; best = c; }
      });

      if (best && bestScore >= ANB_SOGLIA_AUTO) {
        // MATCH FORTE → aggiungi il bando ufficiale (link ANAC, passa dal gate)
        if (best.link && existingUrls[best.link.toLowerCase()]) { report.dettagli.push({ news: tit.slice(0, 60), esito: 'gia-presente', score: bestScore }); continue; }
        if (!dryRun && typeof _fasSaveBando_ === 'function') {
          _fasSaveBando_({
            titolo: String(best.titolo).substring(0, 300),
            ente: best.ente || 'BDNCP',
            livello: 'Nazionale',
            regione: best.luogo || '',
            settore: best.cpv || 'Appalto cultura — via notizia (BDNCP/ANAC)',
            urlBando: best.link,
            sommario: (best.titolo + (best.importo ? ' — EUR ' + best.importo : '') + ' · segnalato da: ' + fonte).substring(0, 500),
            scadenza: best.scadenza || '',
            ambito: 3,
            fonteNome: 'News→Bando (ANAC)',
            cpv: best.cpv || ''
          });
          if (best.link) existingUrls[best.link.toLowerCase()] = true;
        }
        report.bandiAggiunti++;
        report.dettagli.push({ news: tit.slice(0, 60), bando: String(best.titolo).slice(0, 60), score: Number(bestScore.toFixed(2)), esito: dryRun ? 'match-forte(dry)' : 'aggiunto' });
      } else if (best && bestScore >= ANB_SOGLIA_CAND) {
        // MATCH MEDIO → candidata da rivedere a mano
        if (!dryRun && typeof _anbRegistraCandidata_ === 'function') {
          _anbRegistraCandidata_(tit, fonte, best);
        }
        report.candidateRevisione++;
        report.dettagli.push({ news: tit.slice(0, 60), bando: String(best.titolo).slice(0, 60), score: Number(bestScore.toFixed(2)), esito: 'da-rivedere' });
      } else {
        report.senzaMatch++;
      }
      Utilities.sleep(300); // cortesia API
    }
  } catch (e) {
    report.ok = false; report.error = e.message;
    Logger.log('[AgenteNewsBando] FATAL: ' + e.message);
  }

  Logger.log('[AgenteNewsBando] ' + JSON.stringify({ menzioni: report.newsConMenzione, aggiunti: report.bandiAggiunti, revisione: report.candidateRevisione, senzaMatch: report.senzaMatch, dryRun: dryRun }));
  return report;
}

/**
 * @private Registra una candidata news→bando nel foglio BandiCandidatiL2 (lo
 * stesso di Crossref), per la revisione manuale, senza duplicare.
 */
function _anbRegistraCandidata_(newsTit, fonte, bando) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var name = (typeof CR_CANDIDATES_SHEET !== 'undefined') ? CR_CANDIDATES_SHEET : 'BandiCandidatiL2';
    var sh = ss.getSheetByName(name);
    if (!sh && typeof _getOrCreateCandidatesSheet_ === 'function') sh = _getOrCreateCandidatesSheet_();
    if (!sh) return;
    var vals = sh.getDataRange().getValues();
    var head = vals[0] || [];
    var iLink = head.indexOf('news_link');
    // dedup sul link del bando ufficiale
    for (var i = 1; i < vals.length; i++) {
      if (iLink >= 0 && String(vals[i][iLink] || '') === String(bando.link || '')) return;
    }
    sh.appendRow([
      'ANB-' + Date.now(), new Date(), '', newsTit, fonte, bando.link || '', '',
      'news→bando (score medio)', 'pending', 'Bando ufficiale proposto: ' + String(bando.titolo || '').slice(0, 120), ''
    ]);
  } catch (e) { Logger.log('[AgenteNewsBando] _anbRegistraCandidata_ errore: ' + e.message); }
}

/**
 * Self-test della logica di estrazione termini e di match (nessuna rete, nessuna
 * scrittura). Eseguibile dall'editor: agenteNewsBandoSelfTest().
 */
function agenteNewsBandoSelfTest() {
  var casi = [
    { news: 'Il Comune di Spoleto pubblica il bando per il restauro della Rocca Albornoziana', ente: 'Comune di Spoleto',
      bando: 'Lavori di restauro e consolidamento della Rocca Albornoziana', bandoEnte: 'Comune di Spoleto', attesoMin: ANB_SOGLIA_AUTO, nome: 'Match forte stesso ente+opera' },
    { news: 'Avviso pubblico: contributi per la digitalizzazione dei musei civici di Perugia', ente: 'Regione Umbria',
      bando: 'Fornitura servizi di digitalizzazione musei civici', bandoEnte: 'Comune di Perugia', attesoMin: ANB_SOGLIA_CAND, nome: 'Match medio (tema condiviso)' },
    { news: 'Le imperfezioni in mostra a Roma: intervista alla curatrice', ente: 'Artribune',
      bando: 'Servizio di pulizia uffici comunali', bandoEnte: 'Comune di Milano', attesoMax: ANB_SOGLIA_CAND, nome: 'Nessun match (news vs bando estraneo)' }
  ];
  var out = [], pass = 0, fail = 0;
  casi.forEach(function (c) {
    var s = _agMatch_(c.news, c.ente, c.bando, c.bandoEnte);
    var ok = (c.attesoMin !== undefined) ? (s >= c.attesoMin) : (s < c.attesoMax);
    ok ? pass++ : fail++;
    out.push({ caso: c.nome, score: Number(s.toFixed(3)), esito: ok ? 'PASS' : 'FAIL' });
    Logger.log('[ANB selftest] ' + (ok ? 'PASS' : 'FAIL') + ' — ' + c.nome + ' score=' + s.toFixed(3));
  });
  var rep = { ok: fail === 0, pass: pass, fail: fail, dettagli: out };
  Logger.log('[ANB selftest] ' + pass + '/' + casi.length + ' PASS');
  return rep;
}
