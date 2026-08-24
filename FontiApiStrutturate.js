/**
 * ============================================================================
 *  FontiApiStrutturate.js — Parser per fonti strutturate (TED, PNRR, CKAN)
 * ============================================================================
 *  v4.18.70 (2026-06-13)
 *  Autore: Claude (Cowork) per Silvano Straccini / Sinopia
 *
 *  Fase 1: RSS feeds + auto-retry fonti silenti
 *  Fase 2: OpenCoesione API + CKAN regionale (dati.gov.it, dati.puglia.it)
 *
 *  Funzioni pubbliche:
 *    fasParserTedRss()              — scarica bandi EU da TED RSS (cultura/musei)
 *    fasParserItaliaDomaniRss()     — scarica bandi PNRR da Italia Domani
 *    fasRetryFontiSilenti()         — riprova fonti con 3+ fail, riattiva se OK
 *    fasRunFase1()                  — orchestratore: RSS + retry
 *    fasParserOpenCoesione()        — Fase 2: progetti coesione cultura/turismo
 *    fasParserCkanRegionale()       — Fase 2: bandi da portali open data regionali
 *    fasRunFase2()                  — orchestratore Fase 2
 *    fasRunCompleto()               — Fase 1 + Fase 2
 *    fasSetupTrigger()              — installa trigger giornaliero
 *    fasDiagnostica()               — report stato
 *
 *  Prefisso unico: fas_ / _fas*
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

// TED RSS — bandi EU cultura/musei/patrimonio
// TED e Italia Domani bloccano richieste server-to-server (403/400).
// Fase 2: integrazione via Gmail scan o proxy.
var FAS_TED_FEEDS = [];

// v5.3 — Feed PNRR + MiC + Fondazione Scuola Patrimonio
var FAS_PNRR_FEEDS = [
  {
    nome: 'Italia Domani — Bandi Amministrazioni',
    url: 'https://www.italiadomani.gov.it/content/sogei-ng/it/it/feed-rss.makers_notices_feed_rss.xml',
    ente: 'PNRR Italia Domani', livello: 'Nazionale',
    filtroKeyword: /cultur|museo|musei|patrimonio|archiv|bibliote|restaur|digital.*heritage|spettacol|M1C3/i
  },
  {
    nome: 'Italia Domani — Bandi Soggetti Attuatori',
    url: 'https://www.italiadomani.gov.it/content/sogei-ng/it/it/feed-rss.recipients_notices_feed_rss.xml',
    ente: 'PNRR Italia Domani', livello: 'Nazionale',
    filtroKeyword: /cultur|museo|musei|patrimonio|archiv|bibliote|restaur|performing art|spettacol|M1C3/i
  },
  {
    nome: 'PNRR Cultura MiC',
    url: 'https://pnrr.cultura.gov.it/feed/',
    ente: 'Ministero della Cultura — PNRR', livello: 'Nazionale',
    filtroKeyword: null
  },
  {
    nome: 'Ministero Cultura — Avvisi',
    url: 'https://cultura.gov.it/comunicati/avvisi/feed',
    ente: 'Ministero della Cultura', livello: 'Nazionale',
    filtroKeyword: /bando|avviso|contribut|finanziament|selezione|concorso|premio/i
  },
  {
    nome: 'Spettacolo MiC',
    url: 'https://spettacolo.cultura.gov.it/feed/',
    ente: 'MiC — Direzione Generale Spettacolo', livello: 'Nazionale',
    filtroKeyword: null
  },
  {
    nome: 'Fondazione Scuola Patrimonio — Generale',
    url: 'https://www.fondazionescuolapatrimonio.it/feed/',
    ente: 'SNaPAC — Scuola Nazionale Patrimonio', livello: 'Nazionale',
    filtroKeyword: /formazione|bando|avviso|cantiere|ricerca|museo|patrimonio|accessib/i
  },
  {
    nome: 'Fondazione Scuola Patrimonio — Editoria',
    url: 'https://www.fondazionescuolapatrimonio.it/categoria/editoria/feed/',
    ente: 'SNaPAC — Scuola Nazionale Patrimonio', livello: 'Nazionale',
    filtroKeyword: null
  }
];

// ============================================================================
// PARSER TED RSS
// ============================================================================

/**
 * Scarica bandi EU da TED tramite RSS/API.
 * Salva nuovi bandi in Bandi_v5 come "nuovo_da_triage".
 *
 * @param {Object} [opts] {dryRun, maxItems}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
function fasParserTedRss(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxItems = opts.maxItems || 30;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var i = 0; i < FAS_TED_FEEDS.length; i++) {
    var feed = FAS_TED_FEEDS[i];
    try {
      var items = _fasFetchRss_(feed.url, feed.tipo);
      if (!items || items.length === 0) {
        report.dettagli.push({ fonte: feed.nome, azione: 'empty', items: 0 });
        continue;
      }

      var count = 0;
      for (var j = 0; j < Math.min(items.length, maxItems); j++) {
        var item = items[j];
        if (!item.link) continue;
        if (existingUrls[item.link.toLowerCase()]) { report.duplicati++; continue; }

        if (!dryRun) {
          _fasSaveBando_({
            titolo: item.titolo || '',
            ente: feed.ente,
            livello: feed.livello,
            regione: '',
            settore: 'Cultura e patrimonio',
            urlBando: item.link,
            sommario: item.descrizione || '',
            scadenza: item.data || '',
            ambito: feed.ambito,
            fonteNome: feed.nome
          });
          existingUrls[item.link.toLowerCase()] = true;
        }
        report.nuovi++;
        count++;
      }
      report.dettagli.push({ fonte: feed.nome, azione: 'ok', items: items.length, nuovi: count });
      Logger.log('[FAS] TED ' + feed.nome + ': ' + items.length + ' items, ' + count + ' nuovi');
    } catch(e) {
      report.errori++;
      report.dettagli.push({ fonte: feed.nome, azione: 'errore', errore: e.message });
      Logger.log('[FAS] TED errore ' + feed.nome + ': ' + e.message);
    }
  }

  return report;
}

// ============================================================================
// PARSER ITALIA DOMANI / MiC RSS
// ============================================================================

/**
 * Scarica bandi PNRR e avvisi MiC da feed RSS.
 */
function fasParserItaliaDomaniRss(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxItems = opts.maxItems || 30;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var i = 0; i < FAS_PNRR_FEEDS.length; i++) {
    var feed = FAS_PNRR_FEEDS[i];
    try {
      var items = _fasFetchRss_(feed.url, 'RSS');
      if (!items || items.length === 0) {
        report.dettagli.push({ fonte: feed.nome, azione: 'empty', items: 0 });
        continue;
      }

      var count = 0;
      for (var j = 0; j < Math.min(items.length, maxItems); j++) {
        var item = items[j];
        if (!item.link) continue;
        if (existingUrls[item.link.toLowerCase()]) { report.duplicati++; continue; }
        // v5.3: filtro keyword se il feed lo richiede
        if (feed.filtroKeyword) {
          var testo = (item.titolo || '') + ' ' + (item.descrizione || '');
          if (!feed.filtroKeyword.test(testo)) continue;
        }

        if (!dryRun) {
          var bando = {
            titolo: item.titolo || '',
            ente: feed.ente,
            livello: feed.livello,
            regione: '',
            settore: feed.filtroKeyword ? 'Cultura — ' + feed.nome : 'PNRR / Cultura',
            urlBando: item.link,
            sommario: item.descrizione || '',
            scadenza: item.data || '',
            ambito: feed.ambito,
            fonteNome: feed.nome
          };
          // Triage PNRR automatico
          if (typeof verificaETracciaStatoPNRR === 'function') {
            try { verificaETracciaStatoPNRR(bando); } catch(_){}
          }
          _fasSaveBando_(bando);
          existingUrls[item.link.toLowerCase()] = true;
        }
        report.nuovi++;
        count++;
      }
      report.dettagli.push({ fonte: feed.nome, azione: 'ok', items: items.length, nuovi: count });
      Logger.log('[FAS] PNRR ' + feed.nome + ': ' + items.length + ' items, ' + count + ' nuovi');
    } catch(e) {
      report.errori++;
      report.dettagli.push({ fonte: feed.nome, azione: 'errore', errore: e.message });
      Logger.log('[FAS] PNRR errore ' + feed.nome + ': ' + e.message);
    }
  }

  return report;
}

// ============================================================================
// AUTO-RETRY FONTI SILENTI
// ============================================================================

/**
 * Riprova le fonti con FailConsecutivi >= 3 (disattivate automaticamente).
 * Per ogni fonte: tenta un fetch. Se HTTP 200 + contenuto > 200 char → riattiva.
 *
 * @param {Object} [opts] {maxFonti, dryRun}
 * @return {Object} {ok, testate, riattivate, ancoraFallite, dettagli[]}
 */
function fasRetryFontiSilenti(opts) {
  opts = opts || {};
  var maxFonti = opts.maxFonti || 20;
  var dryRun = !!opts.dryRun;
  var report = { ok: true, testate: 0, riattivate: 0, ancoraFallite: 0, dettagli: [] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

    // Cerca fonti silenti in tutti i fogli fonti
    var sheetNames = ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'];
    sheetNames.forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh || sh.getLastRow() < 2) return;

      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = head.indexOf('URL'), iAtt = head.indexOf('Attiva'),
          iFail = head.indexOf('FailConsecutivi'), iNome = head.indexOf('Nome'),
          iEsito = head.indexOf('UltimoEsito'), iScan = head.indexOf('UltimaScan'),
          iErr = head.indexOf('UltimoErrore');

      for (var r = 1; r < vals.length && report.testate < maxFonti; r++) {
        var fail = Number(vals[r][iFail] || 0);
        if (fail < 3) continue; // solo fonti silenti

        var url = String(vals[r][iUrl] || '').trim();
        var nome = String(vals[r][iNome] || '').trim();
        if (!url) continue;

        report.testate++;
        try {
          var resp = UrlFetchApp.fetch(url, {
            muteHttpExceptions: true,
            followRedirects: true,
            deadline: 10,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)' }
          });
          var code = resp.getResponseCode();
          var contentLen = resp.getContentText().length;

          if (code === 200 && contentLen > 200) {
            // Fonte recuperata
            if (!dryRun) {
              sh.getRange(r + 1, iFail + 1).setValue(0);
              sh.getRange(r + 1, iAtt + 1).setValue(true);
              sh.getRange(r + 1, iEsito + 1).setValue('RECOVERED');
              sh.getRange(r + 1, iScan + 1).setValue(new Date());
              if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('');
            }
            report.riattivate++;
            report.dettagli.push({ nome: nome, sheet: shName, azione: 'riattivata', code: code, chars: contentLen });
            Logger.log('[FAS] RIATTIVATA: ' + nome + ' (' + code + ', ' + contentLen + ' chars)');
          } else {
            report.ancoraFallite++;
            report.dettagli.push({ nome: nome, sheet: shName, azione: 'ancora_fallita', code: code, chars: contentLen });
          }
        } catch(eF) {
          report.ancoraFallite++;
          report.dettagli.push({ nome: nome, sheet: shName, azione: 'network_error', errore: eF.message });
        }
      }
    });

    Logger.log('[FAS] Retry silenti: ' + report.testate + ' testate, ' + report.riattivate + ' riattivate, ' + report.ancoraFallite + ' ancora fallite');
    return report;
  } catch(e) {
    report.ok = false;
    report.error = e.message;
    return report;
  }
}

// ============================================================================
// PARSER TED API v3 (POST) — v4.24.18
// ============================================================================

/**
 * Scarica bandi EU da TED usando l'API v3 con richiesta POST.
 *
 * Il test di connessione restituisce HTTP 202 (Accepted) perché TED non serve
 * dati via GET: l'endpoint richiede un body JSON con la query. Questo parser
 * risolve il problema usando POST con CPV 92xxx (servizi culturali) + keyword.
 *
 * @param {Object} [opts] {dryRun, maxItems}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
/**
 * v5.5 — Estrae testo da un campo TED v3 multilingua.
 * TED restituisce {"eng":"...", "ita":"..."} o {"eng":["..."]} (valori array).
 * Preferenza: ita → eng → prima lingua disponibile. Robusto a stringa/array/oggetto.
 */
function _tedText_(field) {
  if (!field) return '';
  if (typeof field === 'string') return field.trim();
  if (Array.isArray(field)) return field.length ? _tedText_(field[0]) : '';
  if (typeof field === 'object') {
    var pref = ['ita', 'it', 'eng', 'en'];
    for (var i = 0; i < pref.length; i++) {
      if (field[pref[i]] !== undefined) {
        var v = field[pref[i]];
        return Array.isArray(v) ? String(v[0] || '').trim() : String(v || '').trim();
      }
    }
    // nessuna lingua preferita → prima chiave disponibile
    var keys = Object.keys(field);
    if (keys.length) {
      var w = field[keys[0]];
      return Array.isArray(w) ? String(w[0] || '').trim() : String(w || '').trim();
    }
  }
  return '';
}

/** v5.5 — Mappa notice-type TED → tipologia leggibile in italiano. */
function _tedTipologia_(nt) {
  var t = String(nt || '').toLowerCase();
  if (t.indexOf('can') === 0) return 'Aggiudicazione';
  if (t.indexOf('pin') === 0) return 'Avviso di preinformazione';
  if (t.indexOf('cn') === 0) return 'Bando di gara';
  if (t.indexOf('social') >= 0) return 'Servizi sociali/culturali';
  if (t.indexOf('qs') === 0 || t.indexOf('design') >= 0) return 'Concorso di progettazione';
  return t ? ('Avviso (' + nt + ')') : '';
}

/** v5.5 — Descrizione settore dai CPV cultura (usa la tassonomia CpvCultura). */
function _tedCpvDescrizione_(cpvArr) {
  if (!cpvArr || !cpvArr.length) return '';
  for (var i = 0; i < cpvArr.length; i++) {
    if (typeof getCpvDescrizione === 'function') {
      var d = getCpvDescrizione(cpvArr[i]);
      if (d) return d;
    }
  }
  return '';
}

function fasParserTedApiPost(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxItems = opts.maxItems || 20;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();

  // v4.25.8 — TED v3: campo "PC" (Product Classification) per CPV cultura.
  // Sintassi verificata: PC = "code" OR PC = "code" (no wildcard, no IN).
  // Query 1: CPV 925xx (biblioteche, archivi, musei, servizi culturali)
  // Query 2: CPV 454xx (restauro monumenti, scavi archeologici, musei)
  // Query 3: fulltext + scope culturale per catturare bandi con CPV non standard
  // v4.28.14 — DUE CORREZIONI VERIFICATE DAL VIVO (03/08/2026):
  //
  // 1. notice-type IN (cn-standard cn-social) — senza questo filtro la query
  //    ingeriva anche gli avvisi di AGGIUDICAZIONE (can-standard/can-social),
  //    che sono ESITI di gara e per natura non hanno scadenza. Sul campione
  //    reale erano 41 su 79 (52%): finivano nel Radar come bandi senza data,
  //    non venivano mai esposti e affollavano la coda dell'enrichment.
  //    Con il filtro: 0 avvisi senza scadenza su 50 esaminati.
  //
  // 2. publication-date >= finestra — i risultati arrivano dal più vecchio,
  //    quindi senza finestra si pescava dal 2016. Con 45 giorni: 470 avvisi
  //    disponibili nel perimetro CPV, 23 con scadenza futura nel primo
  //    centinaio.
  var _fasDa = new Date(Date.now() - 45 * 86400000);
  var _fasYmd = Utilities.formatDate(_fasDa, 'Europe/Rome', 'yyyyMMdd');
  var _fasCoda = ' AND notice-type IN (cn-standard cn-social) AND publication-date >= ' + _fasYmd;

  var payloads = [
    {
      label: 'CPV-925-Cultura',
      query: '(PC = "92500000" OR PC = "92510000" OR PC = "92511000" OR PC = "92512000" OR PC = "92520000" OR PC = "92521000" OR PC = "92521100" OR PC = "92521200" OR PC = "92522000" OR PC = "92522100" OR PC = "92522200")' + _fasCoda
    },
    {
      label: 'CPV-923-Spettacolo',
      query: '(PC = "92300000" OR PC = "92310000" OR PC = "92311000" OR PC = "92312000" OR PC = "92312100" OR PC = "92320000")' + _fasCoda
    },
    {
      label: 'CPV-454-Restauro',
      query: '(PC = "45454100" OR PC = "45212350" OR PC = "45212310" OR PC = "45212313" OR PC = "45112450")' + _fasCoda
    }
  ];

  payloads.forEach(function(p) {
    try {
      var body = {
        query: p.query,
        limit: maxItems,
        scope: 'ACTIVE',
        // v5.5 — campi REALI TED v3: notice-title = oggetto dell'appalto (multilingua),
        // buyer-name = ente, notice-type = tipologia, classification-cpv per descrizione.
        // v4.28.14 — CAMPO SCADENZA CORRETTO. Il nome usato finora
        // ('deadline-receipt-tender-date-lot') NON esiste nell'API TED v3:
        // verificato il 03/08/2026, restituisce null su OGNI avviso, mentre
        // 'deadline-receipt-request' è popolato al 100%. È il motivo per cui
        // TUTTI i bandi TED arrivavano senza scadenza e quindi non venivano
        // mai esposti (la regola richiede scadenza certa).
        fields: ['publication-number', 'notice-title', 'buyer-name', 'notice-type', 'classification-cpv', 'deadline-receipt-request']
      };

      var resp = UrlFetchApp.fetch('https://api.ted.europa.eu/v3/notices/search', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(body),
        muteHttpExceptions: true,
        deadline: 20,
        headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaOC/1.0 (cultural-observatory)' }
      });

      var status = resp.getResponseCode();
      if (status !== 200) {
        report.errori++;
        report.dettagli.push({ fonte: 'TED v3 POST ' + p.label, errore: 'HTTP ' + status });
        Logger.log('[FAS] TED POST ' + p.label + ' HTTP ' + status);
        return;
      }

      var data;
      try { data = JSON.parse(resp.getContentText()); } catch(eJ) {
        report.errori++;
        report.dettagli.push({ fonte: 'TED v3 POST ' + p.label, errore: 'JSON parse: ' + eJ.message });
        return;
      }

      var notices = data.notices || data.results || data.content || [];
      var count = 0;

      notices.forEach(function(n) {
        // v5.2: parsing risposta TED v3 (publication-number + links)
        var pubNumber = n['publication-number'] || n.publicationId || n.id || '';
        var nLinks = n.links || {};
        var htmlLinks = nLinks.html || {};
        var link = htmlLinks.ITA || htmlLinks.ENG || htmlLinks.MUL || '';
        if (!link && pubNumber) link = 'https://ted.europa.eu/it/notice/-/detail/' + pubNumber;

        // v5.5 — OGGETTO dell'appalto dal campo multilingua notice-title (era il
        // bug: prima il titolo era solo il numero pubblicazione e la descrizione
        // finiva "[object Object]"). _tedText_ estrae IT→EN→prima lingua.
        var oggetto = _tedText_(n['notice-title']);
        var buyer = _tedText_(n['buyer-name']);
        var cpvArr = n['classification-cpv'] || [];
        var tipologia = _tedTipologia_(n['notice-type']);
        var cpvDesc = _tedCpvDescrizione_(cpvArr);

        var titolo = oggetto || pubNumber;   // oggetto reale, fallback al numero
        if (!titolo || !link) return;
        if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }

        // v4.25.6 — Filtro post-fetch: scarta bandi chiaramente non culturali
        // (ora sul titolo REALE → filtro molto più preciso)
        if (typeof isBandoCulturale === 'function') {
          if (!isBandoCulturale(titolo, 'TED ' + cpvDesc, oggetto, cpvArr[0] || '')) {
            Logger.log('[FAS] TED SCARTATO (non culturale): ' + titolo.substring(0, 60));
            return;
          }
        }

        // Descrizione macro: tipologia + settore CPV + numero pubblicazione
        var sommario = [
          tipologia ? ('Tipologia: ' + tipologia) : '',
          cpvDesc ? ('Settore: ' + cpvDesc) : '',
          pubNumber ? ('Pubblicazione TED ' + pubNumber) : ''
        ].filter(Boolean).join(' · ');

        // v4.28.14 — l'API restituisce un ARRAY di date (una per lotto):
        // si prende la prima. Fallback sul vecchio nome per sicurezza.
        var _dl = n['deadline-receipt-request'] || n['deadline-receipt-tender-date-lot'] || '';
        if (Object.prototype.toString.call(_dl) === '[object Array]') _dl = _dl.length ? _dl[0] : '';
        var scad = _fasNormalizzaData_(_dl);

        if (!dryRun) {
          _fasSaveBando_({
            titolo: titolo.substring(0, 300),
            ente: buyer || 'Committente UE (TED)',
            livello: 'EU',
            regione: '',
            settore: 'Appalti pubblici cultura — TED',
            tipoBando: 'servizio_fornitura',
            urlBando: link,
            sommario: sommario.substring(0, 500),
            scadenza: scad,
            ambito: 3,
            fonteNome: 'TED — FAS v3 (' + p.label + ')'
          });
          existingUrls[link.toLowerCase()] = true;
        }
        report.nuovi++;
        count++;
      });

      report.dettagli.push({ fonte: 'TED v3 POST ' + p.label, notices: notices.length, nuovi: count });
      Logger.log('[FAS] TED POST ' + p.label + ': ' + notices.length + ' notice, ' + count + ' nuovi');
      Utilities.sleep(500);
    } catch(e) {
      report.errori++;
      report.dettagli.push({ fonte: 'TED v3 POST ' + p.label, errore: e.message });
      Logger.log('[FAS] TED POST ' + p.label + ' errore: ' + e.message);
    }
  });

  return report;
}

/**
 * v5.5 — Pulizia one-shot: archivia i bandi TED MALFORMATI salvati prima del fix
 * (titolo = solo numero pubblicazione tipo "136970-2024", oppure sommario
 * "[object Object]"). I nuovi scan TED sono corretti; questa ripulisce lo storico.
 * @param {Object} opts { dryRun:bool (default true) }
 */
function bandiPuliziaTedMalformati(opts) {
  opts = opts || {};
  var dryRun = (opts.dryRun === undefined) ? true : !!opts.dryRun;
  var rep = { ok: true, dryRun: dryRun, esaminati: 0, malformati: 0, archiviati: 0, esempi: [] };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName((typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5');
    if (!sh || sh.getLastRow() < 2) { rep.ok = false; rep.error = 'foglio vuoto'; return rep; }
    var vals = sh.getDataRange().getValues();
    var iTit = COL_B.TITOLO - 1, iSom = COL_B.SOMMARIO - 1, iFonte = COL_B.FONTE_NOME - 1, iStato = COL_B.STATO_RECORD - 1;
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[0]) continue;
      if (String(row[iStato] || '').toLowerCase() === 'archiviato') continue;
      var fonte = String(row[iFonte] || '');
      if (fonte.indexOf('TED') < 0) continue; // solo TED
      rep.esaminati++;
      var tit = String(row[iTit] || '').trim();
      var som = String(row[iSom] || '');
      var soloNumero = /^\d{3,}-\d{4}$/.test(tit);          // "136970-2024"
      var objBug = som.indexOf('[object Object]') >= 0;      // sommario rotto
      if (soloNumero || objBug) {
        rep.malformati++;
        if (rep.esempi.length < 8) rep.esempi.push(tit.substring(0, 40));
        if (!dryRun) { sh.getRange(r + 1, iStato + 1).setValue('archiviato'); rep.archiviati++; }
      }
    }
    if (!dryRun) SpreadsheetApp.flush();
    Logger.log('[TED cleanup] esaminati=' + rep.esaminati + ' · malformati=' + rep.malformati +
      ' · archiviati=' + rep.archiviati + (dryRun ? ' [DRY-RUN]' : '') + ' · es: ' + rep.esempi.join(', '));
  } catch (e) { rep.ok = false; rep.error = e.message; Logger.log('[TED cleanup] ERR: ' + e.message); }
  return rep;
}

// ============================================================================
// ORCHESTRATORE FASE 1
// ============================================================================

/**
 * Esegue tutti i parser Fase 1: TED + PNRR + retry silenti.
 * Chiamato dal trigger giornaliero o manualmente.
 */
function fasRunFase1() {
  var t0 = Date.now();
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    ted: null,
    pnrr: null,
    retry: null,
    totaleNuovi: 0,
    durataMs: 0
  };

  Logger.log('================================================================');
  Logger.log('[FAS] FASE 1 — TED + PNRR + Retry silenti — ' + new Date().toISOString());
  Logger.log('================================================================');

  // 1. TED API v3 POST — CPV 92* (servizi culturali) + keyword patrimonio/musei
  try {
    report.ted = fasParserTedApiPost();
    report.totaleNuovi += report.ted.nuovi;
  } catch(e) {
    report.ted = { ok: false, error: e.message };
    Logger.log('[FAS] TED ERRORE: ' + e.message);
  }

  // 2. PNRR + MiC RSS
  try {
    report.pnrr = fasParserItaliaDomaniRss();
    report.totaleNuovi += report.pnrr.nuovi;
  } catch(e) {
    report.pnrr = { ok: false, error: e.message };
    Logger.log('[FAS] PNRR ERRORE: ' + e.message);
  }

  // 3. Retry fonti silenti (max 10 per esecuzione)
  try {
    report.retry = fasRetryFontiSilenti({ maxFonti: 10 });
  } catch(e) {
    report.retry = { ok: false, error: e.message };
    Logger.log('[FAS] Retry ERRORE: ' + e.message);
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[FAS] Fase 1 completata: ' + report.totaleNuovi + ' nuovi bandi, ' +
    (report.retry ? report.retry.riattivate : 0) + ' fonti riattivate (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  // Telegram alert se nuovi bandi trovati
  if (report.totaleNuovi > 0) {
    try {
      if (typeof _tgSend_ === 'function') {
        // QA 24/08/2026 — righe SOLO se portano un numero: le voci a zero sono
        // rumore, e "riattivate 0/8" ripetuto ogni giorno insegna a ignorare il
        // canale. Le fonti silenti restano nel report settimanale, il posto
        // giusto per i trend.
        var _righeFas = [];
        if (report.ted && report.ted.nuovi > 0)   _righeFas.push('TED EU: ' + report.ted.nuovi + ' nuovi');
        if (report.pnrr && report.pnrr.nuovi > 0) _righeFas.push('PNRR/MiC: ' + report.pnrr.nuovi + ' nuovi');
        if (report.retry && report.retry.riattivate > 0)
          _righeFas.push('✅ Fonti riattivate: ' + report.retry.riattivate + '/' + report.retry.testate);
        if (_righeFas.length) _tgSend_('📡 *Fonti Strutturate*\n' + _righeFas.join('\n'));
      }
    } catch(_){}
  }

  return report;
}

// ============================================================================
// TRIGGER + DIAGNOSTICA
// ============================================================================

/**
 * Installa trigger giornaliero per Fase 1 (ore 06:00, prima del digest).
 */
function fasSetupTrigger() {
  // v4.20 DEPRECATO — usare setupMasterTriggers() come unico setup trigger
  Logger.log('[DEPRECATO] fasSetupTrigger — usare setupMasterTriggers()');
  return { ok: false, deprecato: true, message: 'Usare setupMasterTriggers()' };
}

/**
 * Report diagnostico fonti strutturate.
 */
function fasDiagnostica() {
  var out = { ok: true, timestamp: new Date().toISOString() };

  // Conta fonti silenti
  try {
    if (typeof getFontiCounters === 'function') {
      var fc = getFontiCounters();
      out.fontiSilenti = (fc && fc.counters) ? fc.counters.silentiGenerale : 0;
    }
  } catch(_){}

  // Trigger installato?
  try {
    var triggers = ScriptApp.getProjectTriggers();
    out.triggerAttivo = triggers.some(function(t) { return t.getHandlerFunction() === 'fasRunCompleto'; });
  } catch(_){}

  // Feed configurati
  out.feedTED = FAS_TED_FEEDS.length;
  out.feedPNRR = FAS_PNRR_FEEDS.length;

  Logger.log('[FAS] Diagnostica: ' + JSON.stringify(out));
  return out;
}

// ============================================================================
// v4.22 — REGISTRY API + STATUS PER MATRICE ADMIN
// ============================================================================

var FAS_API_REGISTRY = [
  {
    id: 'ted_eu',
    nome: 'TED — Bandi europei',
    endpoint: 'https://api.ted.europa.eu/v3/notices/search',
    formato: 'JSON (POST — query CPV 92xxx)',
    auth: 'Nessuna (public API)',
    alimenta: 'Bandi',
    stato: 'operativa',
    motivoBlocco: '',
    limiteRate: '100 richieste/giorno (API pubblica)',
    mappaCampi: 'ND->Titolo, AA->Ente, DT->Scadenza, publicationId->Link'
  },
  {
    id: 'opencoesione',
    nome: 'OpenCoesione — Progetti PNRR',
    endpoint: 'https://opencoesione.gov.it/api/v2/progetti/',
    formato: 'JSON',
    auth: 'Nessuna (open data)',
    alimenta: 'Bandi',
    stato: 'in_sviluppo',
    motivoBlocco: 'Endpoint aggiornato a API v2 con parametro temi_sintetici=Cultura e turismo (testo, non codice numerico). In test produzione.',
    limiteRate: 'Non documentato',
    mappaCampi: 'oc_titolo_progetto->Titolo, denominazione_soggetto->Ente, data_fine_prevista->Scadenza, url->Link'
  },
  {
    id: 'ckan_regionale',
    nome: 'CKAN — Portali open data regionali',
    endpoint: 'https://dati.puglia.it/ckan/api/3/action/package_search',
    formato: 'JSON',
    auth: 'Nessuna (open data)',
    alimenta: 'Bandi',
    stato: 'in_sviluppo',
    motivoBlocco: 'Copertura nazionale completa: 20 regioni + ANAC + dati.gov.it (22 portali totali). Portali non raggiungibili saltati silenziosamente. Filtro rilevanza permissivo (tutti i risultati accettati se query contiene cultura/turismo).',
    limiteRate: 'Variabile per portale',
    mappaCampi: 'title->Titolo, organization->Ente, notes->SommarioAI, resources[0].url->Link'
  },
  // v4.27.57 — Connettori musei europei + aggregatore Europeana
  {
    id: 'europeana',
    nome: 'Europeana — Patrimonio culturale europeo',
    endpoint: 'https://api.europeana.eu/record/v2/search.json',
    formato: 'JSON (GET — apikey + query)',
    auth: 'API key gratuita (pro.europeana.eu/pages/get-api)',
    alimenta: 'Editoria',
    stato: 'in_sviluppo',
    motivoBlocco: 'Richiede EUROPEANA_API_KEY in ScriptProperties. Usare parametro apikey (non wskey, deprecato). Registrazione gratuita: pro.europeana.eu/pages/get-api (10.000 req/giorno).',
    limiteRate: '10.000 req/giorno (API gratuita)',
    mappaCampi: 'title[0]->Titolo, dcCreator[0]->Autore, guid->Link, dataProvider[0]->Fonte'
  },
  {
    id: 'rijksmuseum',
    nome: 'Rijksmuseum — Collezione Amsterdam',
    endpoint: 'https://www.rijksmuseum.nl/api/en/collection',
    formato: 'JSON (GET — key + query)',
    auth: 'API key gratuita (data.rijksmuseum.nl)',
    alimenta: 'Editoria',
    stato: 'bloccata',
    motivoBlocco: 'HTTP 410 GONE (12/08/2026): API migrata su data.rijksmuseum.nl. Serve nuova chiave gratuita e aggiornamento endpoint.',
    limiteRate: '10.000 req/giorno',
    mappaCampi: 'title->Titolo, principalOrFirstMaker->Autore, links.web->Link'
  },
  {
    id: 'va_museum',
    nome: 'V&A Museum — Collezione Londra',
    endpoint: 'https://api.vam.ac.uk/v2/objects/search',
    formato: 'JSON (GET — pubblica)',
    auth: 'Nessuna (API pubblica)',
    alimenta: 'Editoria',
    stato: 'in_sviluppo',
    motivoBlocco: '',
    limiteRate: 'Non documentato',
    mappaCampi: '_primaryTitle->Titolo, _primaryMaker.name->Autore, systemNumber->Link'
  },
  {
    id: 'smk_dk',
    nome: 'SMK — Statens Museum for Kunst (Danimarca)',
    endpoint: 'https://api.smk.dk/api/v1/art/search/',
    formato: 'JSON (GET — pubblica)',
    auth: 'Nessuna (API pubblica)',
    alimenta: 'Editoria',
    stato: 'in_sviluppo',
    motivoBlocco: 'HTTP 500 intermittente (12/08/2026): API instabile, aggiunto retry nell\'orchestratore.',
    limiteRate: 'Non documentato',
    mappaCampi: 'titles[0].title->Titolo, production[0].creator->Autore, object_number->Link'
  },
  {
    id: 'science_museum',
    nome: 'Science Museum Group — Collezione UK',
    endpoint: 'https://collection.sciencemuseumgroup.org.uk/search/objects',
    formato: 'JSON (GET — pubblica)',
    auth: 'Nessuna (API pubblica)',
    alimenta: 'Editoria',
    stato: 'in_sviluppo',
    motivoBlocco: '',
    limiteRate: 'Non documentato',
    mappaCampi: 'attributes.summary.title->Titolo, lifecycle.creation[0].maker->Autore, links.self->Link'
  },
  {
    id: 'bdncp_pubblicita',
    nome: 'BDNCP — Pubblicità Legale ANAC (sotto-soglia)',
    endpoint: 'https://pubblicitalegale.anticorruzione.it/api/v0/avvisi',
    formato: 'JSON (GET — keywords cultura, codiceScheda=2,4)',
    auth: 'Nessuna (pubblica)',
    alimenta: 'Bandi',
    stato: 'operativa',
    motivoBlocco: '',
    limiteRate: 'Non documentato (cortesia 300ms/keyword)',
    mappaCampi: 'metadata.descrizione->Titolo, soggetti_sa[0].denominazione->Ente, dataScadenza->Scadenza, documenti_di_gara_link->Link'
  },
  // v4.28.13 — ANAC e OpenCUP hanno i parser (fasParserAnac, fasParserOpenCup,
  // Fase 2b) ma NON erano dichiarate qui: il report cercava il loro stato, non
  // lo trovava e stampava "undefined". Ora sono dichiarate con lo stato REALE,
  // verificato dal vivo il 03/08/2026.
  {
    id: 'anac_ocds',
    nome: 'ANAC — Contratti pubblici OCDS REST',
    endpoint: 'https://anticorruzione.it/tender/ids + /releases/tender/{id}',
    formato: 'JSON (OCDS REST API)',
    auth: 'Nessuna (pubblica)',
    alimenta: 'Bandi',
    stato: 'in_sviluppo',
    motivoBlocco: 'v4.28.47: riscritto per usare API REST OCDS (anticorruzione.it) al posto del CKAN ' +
                  'bloccato dal WAF. Flusso: /tender/ids → lista ID → /releases/tender/{id} → dettagli. ' +
                  'Filtro cultura applicato sul titolo/descrizione. Max 50 bandi/run con cortesia 300ms.',
    limiteRate: 'n/d',
    mappaCampi: 'result.results[].title->Titolo (quando raggiungibile)'
  },
  {
    id: 'opencup',
    nome: 'OpenCUP — Investimenti pubblici cultura',
    endpoint: 'https://www.dati.gov.it/opendata/api/3/action/package_search (proxy CKAN)',
    formato: 'JSON (CKAN)',
    auth: 'Nessuna (pubblica)',
    alimenta: 'Bandi',
    stato: 'bloccata',
    motivoBlocco: 'Nessuna API REST pubblica (12/08/2026): l\'endpoint CKAN restituisce il catalogo dataset, ' +
                  'non progetti con scadenza. OpenCUP offre solo bulk CSV da opencup.gov.it/opendata. ' +
                  'Alternativa: OpenBDAP (openbdap.mef.gov.it) per investimenti pubblici cultura.',
    limiteRate: 'n/d',
    mappaCampi: 'n/d — endpoint da ridefinire'
  }
];

function getApiStrutturateStatus(token) {
  // v4.22 SEC — Auth obbligatoria
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  var apis = FAS_API_REGISTRY.map(function(api) {
    var recordTotali = 0;
    var record30gg = 0;
    var ultimoPrelievo = null;
    try {
      var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
      var shBandi = ss.getSheetByName('FontiBandi_v5');
      if (shBandi && shBandi.getLastRow() >= 2) {
        var vals = shBandi.getDataRange().getValues();
        var head = vals[0].map(function(h){ return String(h||'').toLowerCase(); });
        var iNome = head.indexOf('nome');
        var iScan = head.indexOf('ultimascan');
        var iRec = head.indexOf('nrecordtotali');
        var soglia30 = Date.now() - 30 * 86400000;
        for (var r = 1; r < vals.length; r++) {
          if (String(vals[r][iNome]||'').toLowerCase().indexOf(api.id.split('_')[0]) >= 0) {
            recordTotali += Number(vals[r][iRec] || 0);
            var scanDate = vals[r][iScan] ? new Date(vals[r][iScan]) : null;
            if (scanDate && scanDate.getTime() > soglia30) record30gg += Number(vals[r][iRec] || 0);
            if (scanDate && (!ultimoPrelievo || scanDate > new Date(ultimoPrelievo))) {
              ultimoPrelievo = scanDate.toISOString();
            }
          }
        }
      }
    } catch(_){}

    return {
      id: api.id, nome: api.nome, endpoint: api.endpoint, formato: api.formato,
      auth: api.auth, alimenta: api.alimenta, stato: api.stato,
      motivoBlocco: api.motivoBlocco, limiteRate: api.limiteRate, mappaCampi: api.mappaCampi,
      recordTotali: recordTotali, record30gg: record30gg, ultimoPrelievo: ultimoPrelievo
    };
  });

  var contatori = {
    totale: apis.length,
    operative: apis.filter(function(a){ return a.stato === 'operativa'; }).length,
    inSviluppo: apis.filter(function(a){ return a.stato === 'in_sviluppo'; }).length,
    bloccate: apis.filter(function(a){ return a.stato === 'bloccata'; }).length,
    recordTotali: apis.reduce(function(s,a){ return s + a.recordTotali; }, 0)
  };

  return { ok: true, apis: apis, contatori: contatori };
}

function testApiConnessione(apiId, token) {
  // v4.22 SEC — Auth obbligatoria
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  var api = null;
  for (var i = 0; i < FAS_API_REGISTRY.length; i++) {
    if (FAS_API_REGISTRY[i].id === apiId) { api = FAS_API_REGISTRY[i]; break; }
  }
  if (!api) return { ok: false, error: 'API non trovata: ' + apiId };

  var start = Date.now();
  try {
    var resp = UrlFetchApp.fetch(api.endpoint, {
      muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true,
      headers: { 'User-Agent': 'SinopiaOC/1.0 (cultural-observatory)' },
      deadline: 10
    });
    var elapsed = Date.now() - start;
    var status = resp.getResponseCode();
    return {
      ok: status >= 200 && status < 400, apiId: apiId, httpStatus: status,
      responseTime: elapsed + 'ms', contentLength: resp.getContentText().length,
      accessibile: status >= 200 && status < 400, bloccata: status === 403 || status === 401
    };
  } catch(e) {
    return {
      ok: false, apiId: apiId, httpStatus: 0, responseTime: (Date.now() - start) + 'ms',
      error: e.message, accessibile: false, bloccata: true
    };
  }
}

// ============================================================================
// HELPERS PRIVATI
// ============================================================================

/**
 * @private Fetch e parsing RSS/Atom generico.
 */
function _fasFetchRss_(url, tipo) {
  var items = [];
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      deadline: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/json, */*'
      }
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('[FAS] Feed HTTP ' + resp.getResponseCode() + ': ' + url);
      return items;
    }

    var content = resp.getContentText();

    // Prova JSON (TED API)
    if (tipo === 'API' || content.trim().charAt(0) === '{' || content.trim().charAt(0) === '[') {
      try {
        var json = JSON.parse(content);
        var notices = json.notices || json.results || json.items || (Array.isArray(json) ? json : []);
        notices.forEach(function(n) {
          items.push({
            titolo: n.title || n['title-or-short-title'] || n.name || '',
            link: n.link || n.uri || n.url || (n.links && n.links[0] && n.links[0].href) || '',
            descrizione: n.summary || n.description || n.content || '',
            data: _fasNormalizzaData_(n['publication-date'] || n.pubDate || n.published || n.date || '')
          });
        });
        return items;
      } catch(_){}
    }

    // RSS/Atom XML
    try {
      var doc = XmlService.parse(content);
      var root = doc.getRootElement();
      var ns = root.getNamespace();

      // RSS 2.0
      var channel = root.getChild('channel', ns) || root.getChild('channel');
      var xmlItems = [];
      if (channel) {
        xmlItems = channel.getChildren('item') || [];
      }
      // Atom
      if (xmlItems.length === 0) {
        var atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
        xmlItems = root.getChildren('entry', atomNs) || root.getChildren('entry') || [];
      }

      xmlItems.forEach(function(el) {
        var title = _fasXmlVal_(el, 'title') || '';
        var link = _fasXmlVal_(el, 'link') || '';
        var desc = _fasXmlVal_(el, 'description') || _fasXmlVal_(el, 'summary') || _fasXmlVal_(el, 'content') || '';
        var date = _fasXmlVal_(el, 'pubDate') || _fasXmlVal_(el, 'published') || _fasXmlVal_(el, 'updated') || '';

        // Atom link con href
        if (!link) {
          try {
            var linkEl = el.getChild('link', XmlService.getNamespace('http://www.w3.org/2005/Atom')) || el.getChild('link');
            if (linkEl && linkEl.getAttribute('href')) link = linkEl.getAttribute('href').getValue();
          } catch(_){}
        }

        if (title && link) {
          items.push({
            titolo: title.trim(),
            link: link.trim(),
            descrizione: _fasStripHtml_(desc).substring(0, 500),
            data: _fasNormalizzaData_(date)
          });
        }
      });
    } catch(eXml) {
      Logger.log('[FAS] XML parse error: ' + eXml.message);
    }
  } catch(eNet) {
    Logger.log('[FAS] Network error: ' + eNet.message);
  }

  return items;
}

/**
 * @private Salva un bando nel foglio Bandi_v5.
 */
function _fasSaveBando_(bando) {
  try {
    // v4.27.49 — gate d'ingresso: pubblicazioni/report/voci non-bando NON entrano
    if (typeof bandoIngressoValido_ === 'function' && !bandoIngressoValido_(bando)) {
      Logger.log('[FAS] scartato all\'ingresso (non-bando): ' + String((bando && bando.titolo) || '').slice(0, 80));
      return;
    }
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh) return;

    // v4.25.11 — FIX CRITICO: la vecchia appendRow aveva 26 valori su 27 colonne
    // (mancava TipoBando, col 9 aggiunta in v4.25) → tutto da col 9 in poi slittava
    // di una colonna (Scadenza finiva in Cofin, 'FAS' in Scadenza, ecc.).
    // Ora la riga è costruita PER INDICE via COL_B: robusta a futuri cambi schema.
    var id = 'BF' + Date.now() + Math.random().toString(36).substring(2, 4);
    var nCol = COL_B_HEADERS.length;
    var riga = new Array(nCol);
    for (var i = 0; i < nCol; i++) riga[i] = '';
    riga[COL_B.ID - 1]               = id;
    riga[COL_B.DATA_RILEVAMENTO - 1] = new Date();
    riga[COL_B.TITOLO - 1]           = String(bando.titolo || '').substring(0, 300);
    riga[COL_B.ENTE - 1]             = String(bando.ente || '');
    riga[COL_B.LIVELLO - 1]          = String(bando.livello || 'Vari');
    riga[COL_B.REGIONE - 1]          = String(bando.regione || '');
    riga[COL_B.SETTORE - 1]          = String(bando.settore || '');
    riga[COL_B.TIPO_BANDO - 1]       = String(bando.tipoBando || ((typeof _classificaTipoBando_ === 'function') ? _classificaTipoBando_(bando) : ''));
    riga[COL_B.SCADENZA - 1]         = bando.scadenza || '';
    riga[COL_B.FONTE_ID - 1]         = 'FAS';
    riga[COL_B.FONTE_NOME - 1]       = String(bando.fonteNome || '');
    riga[COL_B.URL_BANDO - 1]        = String(bando.urlBando || '');
    riga[COL_B.SOMMARIO - 1]         = String(bando.sommario || '').substring(0, 500);
    riga[COL_B.AMBITO - 1]           = bando.ambito || '';
    riga[COL_B.STATUS - 1]           = 'nuovo_da_triage';
    riga[COL_B.STATO_RECORD - 1]     = 'attivo';
    riga[COL_B.LETTO - 1]            = false;
    riga[COL_B.SALVATO - 1]          = false;
    sh.appendRow(riga);
  } catch(e) {
    Logger.log('[FAS] _fasSaveBando_ errore: ' + e.message);
  }
}

/**
 * @private Carica URL bandi esistenti per dedup.
 */
function _fasLoadExistingUrls_() {
  var urls = {};
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh || sh.getLastRow() < 2) return urls;
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iUrl = head.indexOf('UrlBando');
    if (iUrl < 0) iUrl = head.indexOf('URL');
    if (iUrl < 0) return urls;
    for (var r = 1; r < vals.length; r++) {
      var u = String(vals[r][iUrl] || '').trim().toLowerCase();
      if (u) urls[u] = true;
    }
  } catch(_){}
  return urls;
}

function _fasXmlVal_(el, tagName) {
  try {
    var child = el.getChild(tagName);
    if (!child) {
      child = el.getChild(tagName, XmlService.getNamespace('http://www.w3.org/2005/Atom'));
    }
    return child ? child.getValue() : null;
  } catch(_) { return null; }
}

function _fasStripHtml_(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function _fasNormalizzaData_(dateStr) {
  if (!dateStr) return '';
  var s = String(dateStr).trim();
  // ISO 8601
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  // GG/MM/AAAA
  var slash = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (slash) return slash[3] + '-' + slash[2].padStart(2, '0') + '-' + slash[1].padStart(2, '0');
  // RFC 2822 / altri
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
      return Utilities.formatDate(d, 'Europe/Rome', 'yyyy-MM-dd');
    }
  } catch(_){}
  return '';
}

// ============================================================================
// FASE 2: OpenCoesione API + CKAN regionale
// ============================================================================

/**
 * Endpoint OpenCoesione e CKAN.
 */
var FAS_OPENCOESIONE = {
  base: 'https://opencoesione.gov.it',
  // API v2: tema come stringa, non codice numerico
  // Endpoint: /api/v2/progetti/?temi_sintetici=Cultura+e+turismo&format=json
  temiCultura: ['Cultura e turismo'],
  maxPagine: 3,
  perPagina: 20
};

// Tutti i portali open data regionali italiani (CKAN o compatibile).
// I portali non raggiungibili vengono saltati silenziosamente (HTTP != 200 → continue).
// v5.2 audit 17/06/2026: solo portali CKAN che rispondono HTTP 200. Portali morti commentati.
var FAS_CKAN_PORTALS = [
  // ── NAZIONALE ──────────────────────────────────────────────────────────
  { nome: 'dati.gov.it — Open Data PA',     base: 'https://www.dati.gov.it/opendata/api/3/action',          query: 'bandi cultura musei patrimonio',       ambito: 1, livello: 'Nazionale', regione: '' },
  // v4.27.57 — Portale dati aperti UE (CKAN-compatible)
  { nome: 'data.europa.eu — Open Data UE',  base: 'https://data.europa.eu/api/hub/search',                  query: 'cultural heritage museum',             ambito: 1, livello: 'Europeo',   regione: '' },

  // ── REGIONALI FUNZIONANTI (HTTP 200 testati 17/06/2026) ────────────────
  { nome: 'Trentino-AA Open Data',           base: 'https://dati.trentino.it/api/3/action',                  query: 'bandi cultura patrimonio musei',       ambito: 1, livello: 'Regionale', regione: 'Trentino-AA' },
  { nome: 'Emilia-Romagna Open Data',        base: 'https://dati.emilia-romagna.it/api/3/action',            query: 'bandi cultura turismo patrimonio',     ambito: 1, livello: 'Regionale', regione: 'Emilia-Romagna' },
  { nome: 'Toscana Open Data',               base: 'https://dati.toscana.it/api/3/action',                   query: 'bandi cultura musei patrimonio',       ambito: 1, livello: 'Regionale', regione: 'Toscana' },
  { nome: 'Umbria Open Data',                base: 'https://dati.regione.umbria.it/api/3/action',            query: 'bandi cultura patrimonio musei',       ambito: 1, livello: 'Regionale', regione: 'Umbria' },
  { nome: 'Lazio Open Data',                 base: 'https://dati.lazio.it/api/3/action',                     query: 'bandi cultura musei patrimonio',       ambito: 1, livello: 'Regionale', regione: 'Lazio' },
  { nome: 'Liguria Open Data',               base: 'https://dati.regione.liguria.it/api/3/action',           query: 'bandi cultura patrimonio',             ambito: 1, livello: 'Regionale', regione: 'Liguria' },
  { nome: 'Campania Open Data',              base: 'https://dati.regione.campania.it/ckan/api/3/action',     query: 'bandi cultura musei patrimonio',       ambito: 1, livello: 'Regionale', regione: 'Campania' },
  // Sicilia: dati.regione.sicilia.it intermittente (unreachable da GAS, 17/06/2026)
  { nome: 'Puglia Open Data',                base: 'https://dati.puglia.it/ckan/api/3/action',               query: 'bandi cultura turismo musei',          ambito: 1, livello: 'Regionale', regione: 'Puglia' }
  // ── OFFLINE 17/06/2026 (migrati a DCAT-RDF, no API CKAN) ──────────────
  // VdA DNS err | Piemonte 404 | Lombardia 404 | Veneto 404 | Friuli 404
  // Marche DNS | Abruzzo unreachable | Molise DNS | Basilicata unreachable
  // Calabria 404 | Sardegna DNS | ANAC non e CKAN (coperto da BDNCP)
];

// ============================================================================
// PARSER OPENCOESIONE
// ============================================================================

/**
 * Scarica progetti/opportunita da OpenCoesione API filtrati per tema cultura.
 * API: https://opencoesione.gov.it/api/progetti/?tema_sintetico=06&formato=json
 *
 * @param {Object} [opts] {dryRun, maxPagine}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
function fasParserOpenCoesione(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxPag = opts.maxPagine || FAS_OPENCOESIONE.maxPagine;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, pagine: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var tema = 0; tema < FAS_OPENCOESIONE.temiCultura.length; tema++) {
    var temaCode = FAS_OPENCOESIONE.temiCultura[tema];

    for (var pag = 1; pag <= maxPag; pag++) {
      try {
        var url = FAS_OPENCOESIONE.base + '/api/v2/progetti/' +
          '?temi_sintetici=' + encodeURIComponent(temaCode) +
          '&format=json&ordering=-data_inizio_prevista&page=' + pag +
          '&page_size=' + FAS_OPENCOESIONE.perPagina;

        var resp = UrlFetchApp.fetch(url, {
          muteHttpExceptions: true, deadline: 10,
          headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
        });

        if (resp.getResponseCode() !== 200) {
          report.dettagli.push({ fonte: 'OpenCoesione', pagina: pag, errore: 'HTTP ' + resp.getResponseCode() });
          if (resp.getResponseCode() === 403 || resp.getResponseCode() === 429) break;
          continue;
        }

        var data;
        try { data = JSON.parse(resp.getContentText()); } catch(eJ) {
          report.errori++;
          report.dettagli.push({ fonte: 'OpenCoesione', pagina: pag, errore: 'JSON parse: ' + eJ.message });
          continue;
        }

        var risultati = data.risultati || data.results || data.objects || [];
        if (!risultati.length) break; // nessun risultato, stop paginazione

        report.pagine++;
        for (var i = 0; i < risultati.length; i++) {
          var prog = risultati[i];
          var titolo = String(prog.titolo_progetto || prog.oc_titolo_progetto || prog.titolo || '').trim();
          var linkProg = prog.url || (FAS_OPENCOESIONE.base.replace('/api', '') + '/progetti/' + (prog.codice_locale || prog.cod_locale || ''));
          var ente = String(prog.denominazione_soggetto || prog.soggetto_programmatore || '');

          if (!titolo || !linkProg) continue;
          if (existingUrls[linkProg.toLowerCase()]) { report.duplicati++; continue; }

          if (!dryRun) {
            _fasSaveBando_({
              titolo: titolo.substring(0, 300),
              ente: ente || 'OpenCoesione',
              livello: 'Nazionale',
              regione: String(prog.den_regione || ''),
              settore: 'Coesione — Cultura e turismo',
              urlBando: linkProg,
              sommario: String(prog.oc_descrizione_sintetica || prog.descrizione || '').substring(0, 500),
              scadenza: _fasNormalizzaData_(prog.data_fine_prevista || prog.data_fine_effettiva || ''),
              ambito: 1,
              fonteNome: 'OpenCoesione API (tema ' + temaCode + ')'
            });
            existingUrls[linkProg.toLowerCase()] = true;
          }
          report.nuovi++;
        }

        Logger.log('[FAS] OpenCoesione tema=' + temaCode + ' pag=' + pag + ': ' + risultati.length + ' risultati');
        Utilities.sleep(500); // rate limit cortesia
      } catch(e) {
        report.errori++;
        report.dettagli.push({ fonte: 'OpenCoesione', pagina: pag, errore: e.message });
        Logger.log('[FAS] OpenCoesione errore pag ' + pag + ': ' + e.message);
      }
    }
  }

  Logger.log('[FAS] OpenCoesione totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup, ' + report.pagine + ' pagine');
  return report;
}

// ============================================================================
// PARSER CKAN REGIONALE
// ============================================================================

/**
 * Cerca dataset bandi/cultura sui portali CKAN regionali e nazionali.
 * CKAN API: package_search?q=bandi+cultura&rows=20
 *
 * @param {Object} [opts] {dryRun, maxPerPortale}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
function fasParserCkanRegionale(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxPerPortale = opts.maxPerPortale || 20;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };

  var existingUrls = _fasLoadExistingUrls_();

  for (var p = 0; p < FAS_CKAN_PORTALS.length; p++) {
    var portal = FAS_CKAN_PORTALS[p];
    try {
      var url = portal.base + '/package_search?q=' + encodeURIComponent(portal.query) +
        '&rows=' + maxPerPortale + '&sort=metadata_modified+desc';

      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true, deadline: 10,
        headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
      });

      if (resp.getResponseCode() !== 200) {
        report.errori++;
        report.dettagli.push({ portale: portal.nome, errore: 'HTTP ' + resp.getResponseCode() });
        Logger.log('[FAS] CKAN ' + portal.nome + ' HTTP ' + resp.getResponseCode());
        continue;
      }

      var data;
      try { data = JSON.parse(resp.getContentText()); } catch(eJ) {
        report.errori++;
        report.dettagli.push({ portale: portal.nome, errore: 'JSON parse' });
        continue;
      }

      var results = (data.result && data.result.results) || [];
      Logger.log('[FAS] CKAN ' + portal.nome + ': ' + results.length + ' dataset trovati');

      for (var i = 0; i < results.length; i++) {
        var ds = results[i];
        var titolo = String(ds.title || ds.name || '').trim();
        var dsUrl = '';

        // Cerca URL utile nelle risorse del dataset
        if (ds.resources && ds.resources.length > 0) {
          // Preferisci risorse con formato HTML o PDF
          var bestRes = ds.resources.find(function(r) {
            var fmt = String(r.format || '').toLowerCase();
            return fmt === 'html' || fmt === 'pdf' || fmt === 'csv';
          }) || ds.resources[0];
          dsUrl = bestRes.url || '';
        }
        if (!dsUrl) dsUrl = ds.url || (portal.base.replace('/api/3/action', '') + '/dataset/' + ds.name);

        if (!titolo || !dsUrl) continue;
        if (existingUrls[dsUrl.toLowerCase()]) { report.duplicati++; continue; }

        // Filtra dataset rilevanti per cultura/musei/bandi
        var allText = (titolo + ' ' + (ds.notes || '') + ' ' + (ds.tags || []).map(function(t) { return t.name || t; }).join(' ')).toLowerCase();
        var isRelevant = /bando|bandi|cultur|museo|musei|patrimoni|finanziament|contribut|turism|concorso|avviso|arte|teatro|biblioteca|archivi/.test(allText);
        // Se la query del portale include già 'cultura'/'turismo', accetta comunque
        if (!isRelevant && /cultur|turism/.test(portal.query.toLowerCase())) isRelevant = true;
        if (!isRelevant) continue;

        if (!dryRun) {
          _fasSaveBando_({
            titolo: titolo.substring(0, 300),
            ente: String(ds.organization && ds.organization.title || portal.nome),
            livello: portal.livello,
            regione: portal.regione || (portal.livello === 'Regionale' ? portal.nome.split(' ')[0] : ''),
            settore: 'Open Data — Cultura',
            urlBando: dsUrl,
            sommario: String(ds.notes || '').substring(0, 500),
            scadenza: '',
            ambito: portal.ambito,
            fonteNome: portal.nome
          });
          existingUrls[dsUrl.toLowerCase()] = true;
        }
        report.nuovi++;
      }

      report.dettagli.push({ portale: portal.nome, dataset: results.length, nuovi: report.nuovi });
      Utilities.sleep(300);
    } catch(e) {
      report.errori++;
      report.dettagli.push({ portale: portal.nome, errore: e.message });
      Logger.log('[FAS] CKAN ' + portal.nome + ' errore: ' + e.message);
    }
  }

  Logger.log('[FAS] CKAN totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup');
  return report;
}

// ============================================================================
// PARSER BDNCP — Pubblicità Legale ANAC (bandi APERTI, anche SOTTO-SOGLIA)
// ============================================================================

/**
 * Monitora i bandi/avvisi di indizione APERTI pubblicati sulla BDNCP — Piattaforma
 * di Pubblicità a Valore Legale ANAC (obbligatoria dal 2024 per TUTTE le gare,
 * incl. sotto-soglia che TED non copre). Copre il buco lasciato da TED (solo
 * sopra-soglia UE).
 *
 * API (reverse-engineered dalla SPA, raggiungibile server-side, niente WAF):
 *   GET /api/v0/avvisi?dataPubblicazioneStart=DD/MM/YYYY&dataPubblicazioneEnd=...
 *       &page=&size=&codiceScheda=2,4&keywords=<termine>
 *   codiceScheda 2,4 = "bandi e avvisi di indizione". Filtro testuale via keywords
 *   (il param cpv non filtra lato API → usiamo le keyword culturali, piu' efficaci).
 *
 * @param {Object} [opts] {dryRun, giorni (default 7), sizePerKw (default 50)}
 * @return {Object} {ok, nuovi, duplicati, errori, dettagli[]}
 */
// v5.2: endpoint full-text (struttura template con titolo, ente, CPV, importo)
var FAS_BDNCP_BASE = 'https://pubblicitalegale.anticorruzione.it/api/v0/avvisi-full-text';
var FAS_BDNCP_KEYWORDS = [
  'museo', 'musei', 'biblioteca', 'patrimonio culturale', 'beni culturali',
  'archivio', 'restauro', 'archeolog', 'teatro', 'mostra', 'allestimento',
  'valorizzazione culturale'
];

function fasParserBdncpCultura(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var giorni = opts.giorni || 7;
  var sizePerKw = opts.sizePerKw || 50;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();
  var visti = {}; // dedup per idAvviso tra keyword diverse

  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var oggi = new Date();
  var start = new Date(oggi.getTime() - giorni * 86400000);
  var dStart = Utilities.formatDate(start, tz, 'dd/MM/yyyy');
  var dEnd = Utilities.formatDate(oggi, tz, 'dd/MM/yyyy');

  FAS_BDNCP_KEYWORDS.forEach(function(kw) {
    try {
      // v5.2: endpoint full-text, codiceScheda=4 (Bandi), niente date (full-text cerca tutto)
      var url = FAS_BDNCP_BASE +
        '?page=0&size=' + sizePerKw + '&codiceScheda=4' +
        '&keywords=' + encodeURIComponent(kw);

      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true, deadline: 20,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; SinopiaOC/1.0; cultural-observatory)',
          'Referer': 'https://pubblicitalegale.anticorruzione.it/ricerca-avanzata'
        }
      });
      if (resp.getResponseCode() !== 200) {
        report.errori++;
        report.dettagli.push({ kw: kw, errore: 'HTTP ' + resp.getResponseCode() });
        return;
      }
      var data;
      try { data = JSON.parse(resp.getContentText()); } catch(eJ) {
        report.errori++; report.dettagli.push({ kw: kw, errore: 'JSON parse' }); return;
      }
      var content = data.content || [];
      var nuoviKw = 0;

      content.forEach(function(av) {
        var id = av.idAvviso || '';
        if (id && visti[id]) return; // gia' preso da un'altra keyword
        if (id) visti[id] = true;

        var info = _fasBdncpEstrai_(av);
        if (!info.titolo) return;

        var link = info.docLink ||
          (id ? 'https://pubblicitalegale.anticorruzione.it/bandi/' + id : '');
        if (!link) return;
        if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }

        if (!dryRun) {
          _fasSaveBando_({
            titolo: info.titolo.substring(0, 300),
            ente: info.ente || 'BDNCP',
            livello: 'Nazionale',
            regione: info.luogo || '',
            settore: info.cpv || 'Appalto cultura — BDNCP/ANAC',
            urlBando: link,
            sommario: (info.titolo + (info.importo ? ' — EUR ' + info.importo : '')).substring(0, 500),
            scadenza: info.scadenza || _fasNormalizzaData_(av.dataScadenza || ''),
            ambito: 3,
            fonteNome: 'BDNCP — Pubblicità Legale ANAC',
            cpv: info.cpv || ''
          });
          existingUrls[link.toLowerCase()] = true;
        }
        report.nuovi++; nuoviKw++;
      });

      report.dettagli.push({ kw: kw, totali: data.totalElements, nuovi: nuoviKw });
      Logger.log('[FAS] BDNCP "' + kw + '": ' + (data.totalElements||0) + ' totali, ' + nuoviKw + ' nuovi');
      Utilities.sleep(300);
    } catch(e) {
      report.errori++;
      report.dettagli.push({ kw: kw, errore: e.message });
      Logger.log('[FAS] BDNCP "' + kw + '" errore: ' + e.message);
    }
  });

  Logger.log('[FAS] BDNCP totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup, ' + report.errori + ' errori');
  return report;
}

/**
 * @private Estrae titolo/ente/link documenti dalla struttura annidata di un avviso BDNCP.
 * descrizione → template[0].template.metadata.descrizione
 * committente → section con fields.soggetti_sa[].denominazione_amministrazione
 * link docs   → section con fields.documenti_di_gara_link
 */
// v5.2: estrazione arricchita dalla struttura template BDNCP
function _fasBdncpEstrai_(av) {
  var out = { titolo: '', ente: '', docLink: '', cpv: '', importo: '', luogo: '', scadenza: '' };
  try {
    var tpl = av.template && av.template[0] && av.template[0].template;
    if (!tpl) return out;

    // Titolo: preferisci metadata.titolo, fallback descrizione
    if (tpl.metadata) {
      out.titolo = String(tpl.metadata.titolo || tpl.metadata.descrizione || '');
    }

    // Scadenza dal livello superiore
    out.scadenza = av.dataScadenza ? String(av.dataScadenza).substring(0, 10) : '';

    var sections = tpl.sections || [];
    sections.forEach(function(s) {
      var f = s.fields || {};
      var items = s.items || [];

      // SEZ. A — Committente
      if (!out.ente && f.soggetti_sa && f.soggetti_sa.length) {
        out.ente = String(f.soggetti_sa[0].denominazione_amministrazione || f.soggetti_sa[0].denominazione || '');
      }

      // SEZ. B — Link gara
      if (!out.docLink && f.documenti_di_gara_link) {
        out.docLink = String(f.documenti_di_gara_link);
      }

      // SEZ. C — Lotti: CPV, importo, luogo
      items.forEach(function(item) {
        if (!out.cpv && item.cpv) out.cpv = String(item.cpv);
        if (!out.importo && item.valore_complessivo_stimato) out.importo = String(item.valore_complessivo_stimato);
        if (!out.luogo && (item.luogo_nuts || item.luogo_istat)) out.luogo = String(item.luogo_nuts || item.luogo_istat || '');
      });
    });
  } catch(_) {}
  return out;
}

// ============================================================================
// ORCHESTRATORE FASE 2
// ============================================================================

/**
 * Esegue tutti i parser Fase 2: OpenCoesione + CKAN.
 */
function fasRunFase2() {
  var t0 = Date.now();
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    openCoesione: null,
    ckan: null,
    bdncp: null,
    totaleNuovi: 0,
    durataMs: 0
  };

  Logger.log('================================================================');
  Logger.log('[FAS] FASE 2 — OpenCoesione + CKAN + BDNCP — ' + new Date().toISOString());
  Logger.log('================================================================');

  // 1. OpenCoesione API
  try {
    report.openCoesione = fasParserOpenCoesione();
    report.totaleNuovi += report.openCoesione.nuovi;
  } catch(e) {
    report.openCoesione = { ok: false, error: e.message };
    Logger.log('[FAS] OpenCoesione ERRORE: ' + e.message);
  }

  // 2. CKAN Regionali
  try {
    report.ckan = fasParserCkanRegionale();
    report.totaleNuovi += report.ckan.nuovi;
  } catch(e) {
    report.ckan = { ok: false, error: e.message };
    Logger.log('[FAS] CKAN ERRORE: ' + e.message);
  }

  // 3. BDNCP Pubblicità Legale ANAC — bandi aperti sotto-soglia cultura
  try {
    report.bdncp = fasParserBdncpCultura();
    report.totaleNuovi += report.bdncp.nuovi;
  } catch(e) {
    report.bdncp = { ok: false, error: e.message };
    Logger.log('[FAS] BDNCP ERRORE: ' + e.message);
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[FAS] Fase 2 completata: ' + report.totaleNuovi + ' nuovi (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  // Telegram alert
  if (report.totaleNuovi > 0) {
    try {
      if (typeof _tgSend_ === 'function') {
        _tgSend_('📡 *Fonti Strutturate Fase 2*\n\n' +
          'OpenCoesione: ' + (report.openCoesione ? report.openCoesione.nuovi : 0) + ' nuovi\n' +
          'CKAN regionali: ' + (report.ckan ? report.ckan.nuovi : 0) + ' nuovi\n' +
          'BDNCP sotto-soglia: ' + (report.bdncp ? report.bdncp.nuovi : 0) + ' nuovi');
      }
    } catch(_){}
  }

  return report;
}

// ============================================================================
// ORCHESTRATORE COMPLETO (Fase 1 + Fase 2)
// ============================================================================

/**
 * Esegue tutto: RSS + retry + OpenCoesione + CKAN.
 * Usare come trigger giornaliero al posto di fasRunFase1.
 */
function fasRunCompleto() {
  var t0 = Date.now();
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    fase1: null,
    fase2: null,
    totaleNuovi: 0,
    durataMs: 0
  };

  Logger.log('================================================================');
  Logger.log('[FAS] RUN COMPLETO — Fase 1 + Fase 2 — ' + new Date().toISOString());
  Logger.log('================================================================');

  // Wall-clock guard: 5 minuti totali
  var startTime = Date.now();

  // Fase 1
  try {
    report.fase1 = fasRunFase1();
    report.totaleNuovi += (report.fase1.totaleNuovi || 0);
  } catch(e) {
    report.fase1 = { ok: false, error: e.message };
  }

  // Fase 2 (solo se c'e tempo)
  if (Date.now() - startTime < 180000) {
    try {
      report.fase2 = fasRunFase2();
      report.totaleNuovi += (report.fase2.totaleNuovi || 0);
    } catch(e) {
      report.fase2 = { ok: false, error: e.message };
    }
  } else {
    report.fase2 = { ok: true, skipped: true, motivo: 'timeout 3min' };
  }

  // Fase 2b: ANAC + OpenCUP + SEDIA + Lombardia (solo se c'e tempo)
  if (Date.now() - startTime < 270000) {
    try {
      report.fase2b = fasRunFase2b();
      report.totaleNuovi += (report.fase2b.totaleNuovi || 0);
    } catch(e) {
      report.fase2b = { ok: false, error: e.message };
    }
  } else {
    report.fase2b = { ok: true, skipped: true, motivo: 'timeout' };
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[FAS] Run completo: ' + report.totaleNuovi + ' nuovi totali (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  // v5.2: Alert Telegram con riepilogo scan
  try {
    if (typeof sendTelegram === 'function') {
      var errori = (report.fase1 && report.fase1.errori ? report.fase1.errori : 0) +
                   (report.fase2 && report.fase2.errori ? report.fase2.errori : 0);
      var icon = errori > 0 ? '⚠️' : (report.totaleNuovi > 0 ? '✅' : 'ℹ️');
      var tgMsg = icon + ' *Scan fonti completato*\n\n' +
        '📊 Nuovi bandi: *' + report.totaleNuovi + '*\n' +
        '⏱ Durata: ' + Math.round(report.durataMs / 1000) + 's\n';
      if (errori > 0) tgMsg += '❌ Errori: *' + errori + '*\n';
      tgMsg += '\n_Sinopia · Osservatorio Culturale_';
      sendTelegram(tgMsg);
    }
  } catch(e) { Logger.log('[FAS] Telegram alert err: ' + e.message); }

  return report;
}

// ============================================================================
// FASE 2b: ANAC OCDS + OpenCUP + SEDIA EU + Lombardia OData
// ============================================================================

/**
 * Parser ANAC OCDS — Contratti pubblici cultura/musei.
 * v4.28.47 — Riscritto per usare le API REST OCDS (anticorruzione.it)
 * al posto del CKAN bloccato dal WAF.
 * Swagger UI: anticorruzione.it (documentazione OCDS)
 * Flusso: /tender/ids → lista ID → /releases/tender/{id} → dettagli bando
 */
function fasParserAnac(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxBandi = Number(opts.maxBandi) || 50;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, scartati: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();
  var BASE = 'https://anticorruzione.it';

  try {
    // 1. Recupera lista ID bandi recenti
    var idsResp = UrlFetchApp.fetch(BASE + '/tender/ids', {
      muteHttpExceptions: true, deadline: 15,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0 (+https://sinopiaconsulting.it)' }
    });
    if (idsResp.getResponseCode() !== 200) {
      report.ok = false;
      report.dettagli.push({ fonte: 'ANAC OCDS /tender/ids', errore: 'HTTP ' + idsResp.getResponseCode() });
      Logger.log('[FAS] ANAC OCDS: /tender/ids HTTP ' + idsResp.getResponseCode());
      return report;
    }
    var idsData;
    try { idsData = JSON.parse(idsResp.getContentText()); } catch(_) {
      report.ok = false;
      report.dettagli.push({ fonte: 'ANAC OCDS', errore: 'JSON parse su /tender/ids' });
      return report;
    }

    // L'API può restituire { ids: [...] } o un array diretto
    var ids = Array.isArray(idsData) ? idsData : (idsData.ids || idsData.data || []);
    Logger.log('[FAS] ANAC OCDS: ' + ids.length + ' ID bandi trovati');
    report.dettagli.push({ fase: 'ids', totale: ids.length });

    // 2. Per ogni ID, recupera il dettaglio e filtra cultura
    var processati = 0;
    for (var i = 0; i < ids.length && processati < maxBandi; i++) {
      var ocid = typeof ids[i] === 'object' ? (ids[i].ocid || ids[i].id || '') : String(ids[i]);
      if (!ocid) continue;

      try {
        Utilities.sleep(300); // cortesia API
        var relResp = UrlFetchApp.fetch(BASE + '/releases/tender/' + encodeURIComponent(ocid), {
          muteHttpExceptions: true, deadline: 10,
          headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
        });
        if (relResp.getResponseCode() !== 200) { report.errori++; continue; }

        var relData;
        try { relData = JSON.parse(relResp.getContentText()); } catch(_) { report.errori++; continue; }

        // OCDS standard: releases[0].tender
        var releases = relData.releases || [relData];
        for (var r = 0; r < releases.length; r++) {
          var rel = releases[r];
          var tender = rel.tender || {};
          var titolo = tender.title || tender.description || '';
          if (!titolo) continue;

          // Filtra solo cultura/musei/patrimonio
          var allText = (titolo + ' ' + (tender.description || '')).toLowerCase();
          if (!/cultur|museo|musei|patrimoni|restaur|archeolog|monument|turis|bibliote/.test(allText)) {
            report.scartati++;
            continue;
          }

          var link = '';
          if (tender.documents && tender.documents.length > 0) link = tender.documents[0].url || '';
          if (!link) link = BASE + '/releases/tender/' + ocid;

          if (existingUrls[link.toLowerCase()]) { report.duplicati++; continue; }

          var ente = '';
          if (rel.buyer && rel.buyer.name) ente = rel.buyer.name;
          else if (rel.parties && rel.parties.length > 0) ente = rel.parties[0].name || 'ANAC';

          var scadenza = tender.tenderPeriod && tender.tenderPeriod.endDate ? tender.tenderPeriod.endDate : '';

          if (!dryRun) {
            _fasSaveBando_({
              titolo: titolo.substring(0, 300),
              ente: ente || 'ANAC',
              livello: 'Nazionale',
              settore: 'Contratti pubblici cultura',
              urlBando: link,
              sommario: String(tender.description || '').substring(0, 500),
              scadenza: scadenza,
              ambito: 3,
              fonteNome: 'ANAC OCDS'
            });
            existingUrls[link.toLowerCase()] = true;
          }
          report.nuovi++;
          processati++;
        }
      } catch(eRel) {
        report.errori++;
        if (report.errori <= 3) report.dettagli.push({ ocid: ocid, errore: eRel.message });
      }
    }
  } catch(e) {
    report.ok = false;
    report.errori++;
    report.dettagli.push({ fonte: 'ANAC OCDS', errore: e.message });
    Logger.log('[FAS] ANAC OCDS errore: ' + e.message);
  }

  Logger.log('[FAS] ANAC OCDS totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup, ' + report.scartati + ' non-cultura');
  return report;
}

/**
 * Parser OpenCUP — Investimenti pubblici cultura.
 * API: https://opencup.gov.it/portale/progetto/-/cup/
 */
function fasParserOpenCup(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();

  // OpenCUP non ha API REST aperta, usiamo il portale CKAN di dati.gov.it
  var url = 'https://www.dati.gov.it/opendata/api/3/action/package_search?q=CUP+cultura+museo+patrimonio&rows=30&sort=metadata_modified+desc';
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, deadline: 10,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
    });
    if (resp.getResponseCode() !== 200) {
      report.dettagli.push({ fonte: 'OpenCUP via dati.gov.it', errore: 'HTTP ' + resp.getResponseCode() });
      return report;
    }
    var data = JSON.parse(resp.getContentText());
    var results = (data.result && data.result.results) || [];

    results.forEach(function(ds) {
      var titolo = String(ds.title || ds.name || '').trim();
      var dsUrl = '';
      if (ds.resources && ds.resources.length > 0) {
        var best = ds.resources.find(function(r) {
          return /html|pdf|csv|json/.test(String(r.format || '').toLowerCase());
        }) || ds.resources[0];
        dsUrl = best.url || '';
      }
      if (!dsUrl) dsUrl = 'https://www.dati.gov.it/opendata/dataset/' + ds.name;
      if (!titolo || !dsUrl) return;
      if (existingUrls[dsUrl.toLowerCase()]) { report.duplicati++; return; }

      if (!dryRun) {
        _fasSaveBando_({
          titolo: titolo.substring(0, 300),
          ente: (ds.organization && ds.organization.title) || 'OpenCUP / dati.gov.it',
          livello: 'Nazionale',
          settore: 'Investimenti pubblici cultura',
          urlBando: dsUrl,
          sommario: String(ds.notes || '').substring(0, 500),
          ambito: 5,
          fonteNome: 'OpenCUP via dati.gov.it'
        });
        existingUrls[dsUrl.toLowerCase()] = true;
      }
      report.nuovi++;
    });
    report.dettagli.push({ fonte: 'OpenCUP', risultati: results.length });
    Logger.log('[FAS] OpenCUP: ' + results.length + ' dataset, ' + report.nuovi + ' nuovi');
  } catch(e) {
    report.errori++;
    report.dettagli.push({ fonte: 'OpenCUP', errore: e.message });
  }
  return report;
}

/**
 * Parser SEDIA — EU Funding & Tenders Portal (bandi europei cultura).
 * API: https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA
 *
 * v2 (2026-07-07, T2 Estero) — SBLOCCATO. Debug live della risposta:
 *  - GET → 405; POST con body JSON → 200 ma la query viene IGNORATA e tornano
 *    FAQ (DATASOURCE SEDIA_FAQ) senza campo title → per questo "10 risultati, 0 nuovi".
 *  - L'API vuole MULTIPART FORM-DATA con parti JSON: query / languages / sort.
 *    In GAS: payload con Utilities.newBlob(..., 'application/json') forza il multipart.
 *  - I bandi veri sono type 1/2 (topic/call); status 31094501=FORTHCOMING,
 *    31094502=OPEN. Campi in item.metadata (array): title, identifier,
 *    deadlineDate (ISO), status. Verificato live: 125 bandi open/forthcoming.
 *  - L'indice contiene anche OPEN con scadenza passata → filtro deadline >= oggi.
 * SICUREZZA: dryRun default TRUE finché non wirato in FASE 2.
 */
function fasParserSediaEU(opts) {
  opts = opts || {};
  var dryRun = (opts.dryRun === undefined) ? true : !!opts.dryRun;
  var report = { ok: true, dryRun: dryRun, totale: 0, nuovi: 0, duplicati: 0, scadutiIndice: 0, senzaTitolo: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();

  try {
    // v2.1 — PAGINAZIONE: l'ordinamento ASC mette le scadenze passate (voci
    // stantie dell'indice) nelle prime pagine → si scorrono fino a 5 pagine
    // (250 voci) raccogliendo solo le scadenze future.
    var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    var results = [];
    for (var pg = 1; pg <= 5; pg++) {
      var searchUrl = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=culture+OR+cultural+heritage+OR+museum&pageSize=50&pageNumber=' + pg;
      var resp = UrlFetchApp.fetch(searchUrl, {
        method: 'post',
        muteHttpExceptions: true, deadline: 25,
        payload: {
          query: Utilities.newBlob(JSON.stringify({ bool: { must: [
            { terms: { type: ['1', '2'] } },
            { terms: { status: ['31094501', '31094502'] } }
          ]}}), 'application/json', 'query.json'),
          languages: Utilities.newBlob(JSON.stringify(['en', 'it']), 'application/json', 'languages.json'),
          sort: Utilities.newBlob(JSON.stringify({ field: 'deadlineDate', order: 'ASC' }), 'application/json', 'sort.json')
        },
        headers: { 'User-Agent': 'SinopiaBot/1.0' }
      });
      if (resp.getResponseCode() !== 200) {
        if (pg === 1) {
          report.ok = false;
          report.dettagli.push({ fonte: 'SEDIA EU', errore: 'HTTP ' + resp.getResponseCode() });
          Logger.log('[FAS] SEDIA EU HTTP ' + resp.getResponseCode());
          return report;
        }
        break; // pagine successive fallite: si lavora con quanto raccolto
      }
      var data;
      try { data = JSON.parse(resp.getContentText()); } catch(_) {
        if (pg === 1) { report.ok = false; report.errori++; report.dettagli.push({ fonte: 'SEDIA EU', errore: 'JSON parse' }); return report; }
        break;
      }
      var pageResults = data.results || [];
      report.totale = Number(data.totalResults) || report.totale;
      results = results.concat(pageResults);
      if (pageResults.length < 50) break; // ultima pagina
      Utilities.sleep(300);
    }

    // v2.2 — la ricerca testuale è larga (il cluster HORIZON-CL2 mescola HERITAGE
    // con DEMOCRACY/TRANSFO): filtro cultura RIGOROSO su identifier+titolo.
    // Verificato sui 142 risultati: tiene HERITAGE/CULTUR/CCI/arts, scarta
    // democracy/biodiv/gender/postdoc.
    var _sediaCulturaRe = /(HERITAGE|CULTUR|CREAT|\bCCI\b|\bARTS?\b|\bARTIST|MUSE[OU]|PATRIMON|ARCHAEO|ARCHEOLOG|LINGUISTIC|CINEMA|MEDIA-|AUDIOVISU|BOOK|MUSIC|architett|design)/i;

    // PRE-PASS dedup EN/IT: raggruppa per identifier, sceglie 1 versione (IT>EN).
    // Le voci senza identifier restano tutte (chiave = titolo).
    var _byIdent = {};
    var _deduped = [];
    results.forEach(function(item) {
      var md = item.metadata || {};
      var ident = (md.identifier && md.identifier.length) ? String(md.identifier[0]) : '';
      var lang = (md.language && md.language.length) ? String(md.language[0]).toLowerCase() : '';
      if (!ident) { _deduped.push(item); return; }
      var cur = _byIdent[ident];
      if (cur === undefined) { _byIdent[ident] = _deduped.length; _deduped.push(item); return; }
      // già visto: sostituisci solo se questo è IT e il precedente non lo era
      var prev = _deduped[cur].metadata || {};
      var prevLang = (prev.language && prev.language.length) ? String(prev.language[0]).toLowerCase() : '';
      if (lang === 'it' && prevLang !== 'it') _deduped[cur] = item;
    });

    _deduped.forEach(function(item) {
      var md = item.metadata || {};
      function g(k) { var v = md[k]; return (v && v.length) ? String(v[0]) : ''; }

      var titolo = g('title');
      var ident = g('identifier');
      if (!titolo) { report.senzaTitolo++; return; }

      // FILTRO CULTURA — scarta i bandi non culturali del cluster largo
      if (!_sediaCulturaRe.test(ident + ' ' + titolo)) { report.esclusiNonCultura = (report.esclusiNonCultura||0) + 1; return; }

      // Scadenza: ISO in metadata.deadlineDate — scarta le scadenze passate
      // presenti nell'indice (voci OPEN stantie verificate nel debug)
      var scad = null;
      var rawDl = g('deadlineDate');
      if (rawDl) { var d = new Date(rawDl); if (!isNaN(d.getTime())) scad = d; }
      if (scad && scad.getTime() < oggi.getTime()) { report.scadutiIndice++; return; }

      var link = String(item.url || '');
      if (!link && ident) link = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/' + encodeURIComponent(ident.toLowerCase());
      if (!link) return;
      if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }

      var statoLbl = g('status') === '31094501' ? 'FORTHCOMING' : 'OPEN';
      if (report.dettagli.length < 20) {
        report.dettagli.push({ titolo: titolo.substring(0, 90), id: ident, stato: statoLbl,
          scadenza: scad ? Utilities.formatDate(scad, 'Europe/Rome', 'dd/MM/yyyy') : 'n.d.' });
      }

      if (!dryRun) {
        _fasSaveBando_({
          titolo: String(titolo).substring(0, 300),
          ente: 'Commissione Europea',
          livello: 'EU',
          settore: 'EU Funding cultura',
          tipoBando: 'finanziamento',
          urlBando: link,
          sommario: ('Call ' + statoLbl + (ident ? ' — ' + ident : '') + '. ' + String(item.summary || '')).substring(0, 500),
          scadenza: scad || '',
          ambito: 3,
          fonteNome: 'EU Funding & Tenders (SEDIA)'
        });
        existingUrls[link.toLowerCase()] = true;
      }
      report.nuovi++;
    });
    Logger.log('[FAS] SEDIA EU v2.2: indice=' + report.totale + ' · raccolti=' + results.length +
      ' · dopo-dedup=' + _deduped.length + ' · nuovi=' + report.nuovi +
      ' · esclusi-non-cultura=' + (report.esclusiNonCultura||0) +
      ' · scaduti=' + report.scadutiIndice + ' · dup=' + report.duplicati + (dryRun ? ' [DRY-RUN]' : ''));
    Logger.log(JSON.stringify(report, null, 2));
  } catch(e) {
    report.ok = false; report.errori++;
    report.dettagli.push({ fonte: 'SEDIA EU', errore: e.message });
    Logger.log('[FAS] SEDIA EU errore: ' + e.message);
  }
  return report;
}

/**
 * Parser Lombardia OData — Open data bandi regionali.
 * API: https://dati.lombardia.it basato su Socrata/SODA.
 */
function fasParserLombardia(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();

  // SODA API query per bandi cultura
  var url = 'https://www.dati.lombardia.it/resource/ks5g-bke7.json?$where=contains(upper(titolo_bando),\'CULTUR\')+OR+contains(upper(titolo_bando),\'MUSEO\')&$limit=30&$order=data_pubblicazione+DESC';

  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, deadline: 10,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
    });
    if (resp.getResponseCode() !== 200) {
      // Fallback: CKAN API
      url = 'https://www.dati.lombardia.it/api/views.json?category=Bandi&limit=20';
      resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, deadline: 10, headers: { 'Accept': 'application/json' } });
    }
    if (resp.getResponseCode() !== 200) {
      report.dettagli.push({ fonte: 'Lombardia OData', errore: 'HTTP ' + resp.getResponseCode() });
      return report;
    }

    var data;
    try { data = JSON.parse(resp.getContentText()); } catch(_) {
      report.errori++;
      return report;
    }
    if (!Array.isArray(data)) data = data.results || data.result || [];

    data.forEach(function(item) {
      var titolo = item.titolo_bando || item.title || item.name || '';
      var link = item.link_bando || item.url || '';
      if (!link && item.id) link = 'https://www.dati.lombardia.it/resource/' + item.id;
      if (!titolo || !link) return;

      var allText = (titolo + ' ' + (item.descrizione || item.description || '')).toLowerCase();
      if (!/cultur|museo|musei|patrimoni|turis|restaur/.test(allText)) return;

      if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }
      if (!dryRun) {
        _fasSaveBando_({
          titolo: String(titolo).substring(0, 300),
          ente: 'Regione Lombardia',
          livello: 'Regionale',
          regione: 'Lombardia',
          settore: 'Bandi regionali cultura',
          urlBando: link,
          sommario: String(item.descrizione || item.description || '').substring(0, 500),
          scadenza: _fasNormalizzaData_(item.data_scadenza || item.scadenza || ''),
          ambito: 1,
          fonteNome: 'Lombardia OData'
        });
        existingUrls[link.toLowerCase()] = true;
      }
      report.nuovi++;
    });
    report.dettagli.push({ fonte: 'Lombardia', risultati: data.length });
    Logger.log('[FAS] Lombardia: ' + data.length + ' risultati, ' + report.nuovi + ' nuovi');
  } catch(e) {
    report.errori++;
    report.dettagli.push({ fonte: 'Lombardia', errore: e.message });
  }
  return report;
}

/**
 * Orchestratore Fase 2b: ANAC + OpenCUP + SEDIA + Lombardia.
 */
function fasRunFase2b() {
  var t0 = Date.now();
  var report = {
    ok: true, timestamp: new Date().toISOString(),
    anac: null, opencup: null, sedia: null, lombardia: null,
    totaleNuovi: 0, durataMs: 0
  };

  // v4.20 — ANAC, OpenCUP, Lombardia disabilitati: endpoint inerti (0 risultati / errori costanti).
  // v2.2 (T2, 2026-07-08) — SEDIA EU RIATTIVATO: parser multipart corretto e
  // verificato (18 bandi cultura UE, filtro 12/12, dedup EN/IT). Gli altri restano OFF.
  report.anac = { ok: true, skipped: true, motivo: 'endpoint inerte (v4.20)' };
  report.opencup = { ok: true, skipped: true, motivo: 'endpoint inerte (v4.20)' };
  report.lombardia = { ok: true, skipped: true, motivo: 'endpoint inerte (v4.20)' };
  try {
    report.sedia = fasParserSediaEU({ dryRun: false });
    report.totaleNuovi += (report.sedia && report.sedia.nuovi) ? report.sedia.nuovi : 0;
    Logger.log('[FAS] FASE 2b — SEDIA EU: ' + (report.sedia ? report.sedia.nuovi : 0) + ' bandi UE cultura nuovi');
  } catch (eSedia) {
    report.sedia = { ok: false, errore: eSedia.message };
    Logger.log('[FAS] FASE 2b — SEDIA EU errore: ' + eSedia.message);
  }

  report.durataMs = Date.now() - t0;
  Logger.log('[FAS] Fase 2b completata: ' + report.totaleNuovi + ' nuovi (' + report.durataMs + 'ms)');
  Logger.log('================================================================');

  if (report.totaleNuovi > 0 && typeof _tgSend_ === 'function') {
    try {
      _tgSend_('*Fonti Fase 2b*\nANAC: ' + (report.anac ? report.anac.nuovi : 0) +
        '\nOpenCUP: ' + (report.opencup ? report.opencup.nuovi : 0) +
        '\nSEDIA EU: ' + (report.sedia ? report.sedia.nuovi : 0) +
        '\nLombardia: ' + (report.lombardia ? report.lombardia.nuovi : 0));
    } catch(_){}
  }
  return report;
}

// Aggiorna fasRunCompleto per includere Fase 2b
var _originalFasRunCompleto = typeof fasRunCompleto === 'function' ? fasRunCompleto : null;

// ============================================================================
// FINE FontiApiStrutturate.js (principale)
// ============================================================================

// ============================================================================
// FASE 3: Deprecazione fonti HTML irrecuperabili
// ============================================================================

/**
 * Identifica e disattiva definitivamente le fonti che restano silenti
 * dopo i retry (JS-rendered, 403 permanenti, DNS irraggiungibili).
 * Aggiunge nota esplicativa nel campo UltimoErrore.
 *
 * @param {Object} [opts] {dryRun, minFail: soglia minima fail (default 3)}
 * @return {Object} {ok, analizzate, deprecate, mantenute, dettagli[]}
 */
function fasDeprecaFontiIrrecuperabili(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var minFail = opts.minFail || 3;
  var report = { ok: true, analizzate: 0, deprecate: 0, mantenute: 0, dettagli: [] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sheetNames = ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'];

    sheetNames.forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh || sh.getLastRow() < 2) return;

      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = head.indexOf('URL'), iAtt = head.indexOf('Attiva'),
          iFail = head.indexOf('FailConsecutivi'), iNome = head.indexOf('Nome'),
          iEsito = head.indexOf('UltimoEsito'), iErr = head.indexOf('UltimoErrore'),
          iTipo = head.indexOf('Tipo');

      for (var r = 1; r < vals.length; r++) {
        var fail = Number(vals[r][iFail] || 0);
        if (fail < minFail) continue;

        var url = String(vals[r][iUrl] || '').trim();
        var nome = String(vals[r][iNome] || '').trim();
        var tipo = String(vals[r][iTipo] || '').trim();
        var esito = String(vals[r][iEsito] || '');
        var attiva = vals[r][iAtt];
        report.analizzate++;

        // Test finale: un ultimo tentativo
        var raggiungibile = false;
        var motivo = 'irrecuperabile';
        try {
          var resp = UrlFetchApp.fetch(url, {
            muteHttpExceptions: true,
            followRedirects: true,
            deadline: 10,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)' }
          });
          var code = resp.getResponseCode();
          var len = resp.getContentText().length;
          if (code === 200 && len > 500) {
            raggiungibile = true;
          } else if (code === 403) {
            motivo = 'HTTP 403 permanente (server blocca bot)';
          } else if (code === 404) {
            motivo = 'HTTP 404 (pagina rimossa)';
          } else if (code === 200 && len <= 500) {
            motivo = 'JS-rendered (HTTP 200 ma contenuto vuoto, ' + len + ' chars)';
          } else {
            motivo = 'HTTP ' + code;
          }
        } catch(eNet) {
          motivo = 'Network: ' + eNet.message.substring(0, 100);
        }

        if (raggiungibile) {
          // Fonte recuperata all'ultimo tentativo
          if (!dryRun) {
            sh.getRange(r + 1, iFail + 1).setValue(0);
            sh.getRange(r + 1, iAtt + 1).setValue(true);
            sh.getRange(r + 1, iEsito + 1).setValue('RECOVERED_FASE3');
            if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('');
          }
          report.mantenute++;
          report.dettagli.push({ nome: nome, sheet: shName, azione: 'recuperata' });
          Logger.log('[FAS] F3 RECUPERATA: ' + nome);
        } else {
          // Depreca definitivamente
          if (!dryRun) {
            sh.getRange(r + 1, iAtt + 1).setValue(false);
            sh.getRange(r + 1, iFail + 1).setValue(fail);
            sh.getRange(r + 1, iEsito + 1).setValue('DEPRECATED');
            if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('[FASE3 ' + new Date().toISOString().substring(0, 10) + '] ' + motivo);
          }
          report.deprecate++;
          report.dettagli.push({ nome: nome, sheet: shName, azione: 'deprecata', motivo: motivo });
          Logger.log('[FAS] F3 DEPRECATA: ' + nome + ' — ' + motivo);
        }
      }
    });

    Logger.log('[FAS] Fase 3: ' + report.analizzate + ' analizzate, ' +
      report.deprecate + ' deprecate, ' + report.mantenute + ' mantenute');
    return report;
  } catch(e) {
    report.ok = false;
    report.error = e.message;
    return report;
  }
}

/**
 * Report completo fonti: attive, silenti, deprecate, per tipo.
 */
// ============================================================================
// FUNZIONI DI TEST RAPIDO — solo HTTP, nessuna scrittura su sheet
// ============================================================================

/** Test TED API v3 POST — verifica raggiungibilità e struttura risposta */
function testTedApiQuick() {
  Logger.log('[TEST] TED API v3 POST — avvio');
  try {
    // v4.24.18 FIX: sintassi corretta TED v3 expert query (PC IN, page/limit)
    var body = {
      query: 'PC IN (92521000, 92500000)',
      page: 1, limit: 3,
      fields: ['ND','TY','OJ','DT','CY']
    };
    var resp = UrlFetchApp.fetch('https://api.ted.europa.eu/v3/notices/search', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      deadline: 15,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaOC/1.0 (s.straccini@gmail.com)' }
    });
    var status = resp.getResponseCode();
    var body200 = resp.getContentText().substring(0, 400);
    Logger.log('[TEST] TED status: ' + status);
    Logger.log('[TEST] TED body: ' + body200);
  } catch(e) {
    Logger.log('[TEST] TED eccezione: ' + e.message);
  }
  Logger.log('[TEST] TED — fine');
}

/** Test OpenCoesione API v2 — verifica raggiungibilità e struttura risposta */
function testOpenCogSioneQuick() {
  Logger.log('[TEST] OpenCoesione v2 — avvio');
  try {
    var url = 'https://opencoesione.gov.it/api/v2/progetti/' +
      '?temi_sintetici=' + encodeURIComponent('Cultura e turismo') +
      '&format=json&ordering=-data_inizio_prevista&page=1&page_size=3';
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      deadline: 15,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaOC/1.0' }
    });
    var status = resp.getResponseCode();
    var body = resp.getContentText().substring(0, 400);
    Logger.log('[TEST] OpenCoesione status: ' + status);
    Logger.log('[TEST] OpenCoesione body: ' + body);
  } catch(e) {
    Logger.log('[TEST] OpenCoesione eccezione: ' + e.message);
  }
  Logger.log('[TEST] OpenCoesione — fine');
}

/** Test CKAN Puglia — verifica raggiungibilità e struttura risposta */
function testCkanQuick() {
  Logger.log('[TEST] CKAN Puglia — avvio');
  try {
    var url = 'https://dati.puglia.it/ckan/api/3/action/package_search' +
      '?q=bandi+cultura+turismo+musei&rows=3&sort=metadata_modified+desc';
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      deadline: 15,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaOC/1.0' }
    });
    var status = resp.getResponseCode();
    var body = resp.getContentText().substring(0, 400);
    Logger.log('[TEST] CKAN Puglia status: ' + status);
    Logger.log('[TEST] CKAN Puglia body: ' + body);
  } catch(e) {
    Logger.log('[TEST] CKAN Puglia eccezione: ' + e.message);
  }
  Logger.log('[TEST] CKAN Puglia — fine');
}

/** Esegue i 3 test rapidi in sequenza */
function testTutteLeApi() {
  testTedApiQuick();
  testOpenCogSioneQuick();
  testCkanQuick();
  Logger.log('[TEST] COMPLETATO — vedi righe sopra per risultati');
}

function fasReportFontiCompleto() {
  var out = { ok: true, timestamp: new Date().toISOString(), fogli: {} };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'].forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh || sh.getLastRow() < 2) { out.fogli[shName] = { totale: 0 }; return; }
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iAtt = head.indexOf('Attiva'), iFail = head.indexOf('FailConsecutivi'),
          iEsito = head.indexOf('UltimoEsito');
      var stats = { totale: 0, attive: 0, silenti: 0, deprecate: 0, ok: 0 };
      for (var r = 1; r < vals.length; r++) {
        if (!vals[r][0]) continue;
        stats.totale++;
        var att = vals[r][iAtt] === true || String(vals[r][iAtt]).toUpperCase() === 'TRUE';
        var fail = Number(vals[r][iFail] || 0);
        var esito = String(vals[r][iEsito] || '');
        if (esito === 'DEPRECATED') stats.deprecate++;
        else if (!att || fail >= 3) stats.silenti++;
        else if (esito === 'OK' || esito === 'RECOVERED' || esito === 'RECOVERED_FASE3') stats.ok++;
        if (att) stats.attive++;
      }
      out.fogli[shName] = stats;
    });
    // Totali
    out.totaleAttive = 0; out.totaleSilenti = 0; out.totaleDeprecate = 0;
    Object.keys(out.fogli).forEach(function(k) {
      out.totaleAttive += out.fogli[k].attive || 0;
      out.totaleSilenti += out.fogli[k].silenti || 0;
      out.totaleDeprecate += out.fogli[k].deprecate || 0;
    });
    Logger.log('[FAS] Report fonti: attive=' + out.totaleAttive + ' silenti=' + out.totaleSilenti + ' deprecate=' + out.totaleDeprecate);
  } catch(e) { out.ok = false; out.error = e.message; }
  return out;
}
