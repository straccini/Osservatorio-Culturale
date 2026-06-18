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

// Italia Domani RSS — PNRR
// v4.20 — Disabilitato: questi sono feed NEWS, non bandi PNRR. Rimuovere o ricategorizzare.
var FAS_PNRR_FEEDS = [];

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

        if (!dryRun) {
          var bando = {
            titolo: item.titolo || '',
            ente: feed.ente,
            livello: feed.livello,
            regione: '',
            settore: 'PNRR / Cultura',
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
// Gate pertinenza TED — bilingue IT/EN (le notice TED sono multilingua), allineato ai
// termini delle query FT ~ "...". Usato per scartare i match full-text che non sono cultura
// (termine presente solo nel nome del buyer). Applicato SOLO se la notice ha una descrizione.
var FAS_TED_CULTURA_RX = /mus(eo|ei|eum)|bibliotec|librar|archiv|cultural|patrimonio|heritage|monument|restaur|restor|teatr|theat|archeolog|archaeolog|spettacol|exhibit|mostr|beni cultural/i;

function fasParserTedApiPost(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxItems = opts.maxItems || 20;
  var report = { ok: true, nuovi: 0, duplicati: 0, scartati: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();

  // v5.2 fix: TED v3 expert query — FT ~ "term" (full text), non PC IN (...) che da HTTP 400
  var payloads = [
    {
      label: 'Musei-Biblioteche-Archivi',
      query: 'FT ~ "museum" OR FT ~ "biblioteca" OR FT ~ "archivio" OR FT ~ "museo"'
    },
    {
      label: 'Patrimonio-Restauro-Spettacolo',
      query: 'FT ~ "cultural heritage" OR FT ~ "restauro" OR FT ~ "patrimonio culturale" OR FT ~ "teatro"'
    }
  ];

  payloads.forEach(function(p) {
    try {
      var body = {
        query: p.query,
        limit: maxItems,
        scope: 'ACTIVE',
        fields: ['organisation-country-buyer', 'deadline-receipt-tender-date-lot', 'description-proc']
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
        var link = htmlLinks.ITA || htmlLinks.ENG || '';
        if (!link && pubNumber) link = 'https://ted.europa.eu/it/notice/-/detail/' + pubNumber;

        // v5.3: titolo/sommario leggibili da description-proc (gestisce stringa o oggetto
        // multilingua {ita|eng|...}); fallback al publication-number se assente.
        var descTxt = _fasTedTesto_(n['description-proc']);
        var titolo = descTxt ? descTxt.substring(0, 160) : pubNumber;
        // scadenza dal termine ricezione offerte (può essere stringa/array/oggetto per lotto)
        var scad = _fasNormalizzaData_(_fasTedTesto_(n['deadline-receipt-tender-date-lot']));

        if (!titolo || !link) return;
        // GATE PERTINENZA (solo se c'è una descrizione): la query FT ~ "..." matcha il
        // termine anche nel nome del buyer → scarta i non-cultura. Se manca la descrizione
        // si tiene il record (si confida nella query), per non azzerare TED.
        if (descTxt && !FAS_TED_CULTURA_RX.test((titolo + ' ' + descTxt).toLowerCase())) {
          report.scartati++; return;
        }
        if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }

        if (!dryRun) {
          _fasSaveBando_({
            titolo: titolo.substring(0, 300),
            ente: String(n['organisation-country-buyer'] || 'TED EU'),
            livello: 'EU',
            regione: '',
            settore: 'Appalti pubblici cultura — TED',
            urlBando: link,
            sommario: descTxt ? descTxt.substring(0, 500) : '',
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
        _tgSend_('📡 *Fonti Strutturate*\n\n' +
          (report.ted ? 'TED EU: ' + report.ted.nuovi + ' nuovi\n' : '') +
          (report.pnrr ? 'PNRR/MiC: ' + report.pnrr.nuovi + ' nuovi\n' : '') +
          (report.retry ? 'Fonti riattivate: ' + report.retry.riattivate + '/' + report.retry.testate : ''));
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
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Bandi_v5');
    if (!sh) return;

    var id = 'BF' + Date.now() + Math.random().toString(36).substring(2, 4);
    sh.appendRow([
      id,                               // ID
      '',                                // Fingerprint
      new Date(),                        // DataRilevamento
      String(bando.titolo || '').substring(0, 300), // Titolo
      String(bando.ente || ''),          // Ente
      String(bando.livello || 'Vari'),   // Livello
      String(bando.regione || ''),       // Regione
      String(bando.settore || ''),       // Settore
      String(bando.soggetti || ''),     // Soggetti (backward-compat: altri parser non lo passano → '')
      (bando.importo != null && bando.importo !== '' ? bando.importo : ''), // Importo
      '',                                // Cofin
      bando.scadenza || '',              // Scadenza
      'FAS',                             // FonteID
      String(bando.fonteNome || ''),     // FonteNome
      String(bando.urlBando || ''),      // UrlBando
      '',                                // UrlEnte
      '',                                // UrlValidato
      '',                                // DataValidazione
      String(bando.sommario || '').substring(0, 500), // Sommario
      bando.ambito || '',                // Ambito
      '',                                // PrioritaRegionale
      'nuovo_da_triage',                 // Status
      'attivo',                          // StatoRecord
      false,                             // Letto
      false,                             // Salvato
      ''                                 // Note
    ]);
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

/**
 * @private Estrae testo da un campo TED v3 che può essere stringa, array (per-lotto)
 * o oggetto multilingua { ita|it|eng|en|... }. Ritorna stringa pulita ('' se vuoto).
 */
function _fasTedTesto_(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (Array.isArray(v)) {
    for (var i = 0; i < v.length; i++) { var t = _fasTedTesto_(v[i]); if (t) return t; }
    return '';
  }
  if (typeof v === 'object') {
    var pref = v.ita || v.it || v.eng || v.en;
    if (pref) return _fasTedTesto_(pref);
    for (var k in v) { if (v[k]) { var tt = _fasTedTesto_(v[k]); if (tt) return tt; } }
    return '';
  }
  return String(v).trim();
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

// Gate cultura CKAN — i dataset open-data sono indicizzati su titolo/note/tag e la query
// di portale ('bandi cultura musei...') è OR → CKAN può restituire dataset che matchano solo
// 'bandi'. Si richiede un termine realmente culturale nel testo del dataset. Stem 'cultur'
// (matcha cultura/culturale/culturali), '\barte\b' con confine di parola (evita "parte"),
// e termini del dominio Sinopia (gastronomia, borghi).
var FAS_CKAN_CULTURA_RX = /cultur|mus(eo|ei|eal)|bibliotec|archiv|patrimonio|monument|restaur|archeolog|teatr|spettacol|mostr|\barte\b|beni cultural|gastronom|borg|heritage/i;

/**
 * Cerca dataset bandi/cultura sui portali CKAN regionali e nazionali.
 * CKAN API: package_search?q=bandi+cultura&rows=20
 *
 * @param {Object} [opts] {dryRun, maxPerPortale}
 * @return {Object} {ok, nuovi, duplicati, scartati, errori, dettagli[]}
 */
function fasParserCkanRegionale(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var maxPerPortale = opts.maxPerPortale || 20;
  var report = { ok: true, nuovi: 0, duplicati: 0, scartati: 0, errori: 0, dettagli: [] };

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

        // GATE CULTURA — richiede un termine realmente culturale in titolo/note/tag del dataset.
        // (rimosso il vecchio bypass "se la query del portale contiene cultura accetta tutto",
        //  che disattivava il filtro: ogni query di portale contiene 'cultura').
        var allText = (titolo + ' ' + (ds.notes || '') + ' ' + (ds.tags || []).map(function(t) { return t.name || t; }).join(' ')).toLowerCase();
        if (!FAS_CKAN_CULTURA_RX.test(allText)) { report.scartati++; continue; }

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

  Logger.log('[FAS] CKAN totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup, ' + report.scartati + ' scartati (non-cultura)');
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

// Gate di pertinenza culturale: la ricerca full-text BDNCP matcha la keyword OVUNQUE,
// anche nel nome della stazione appaltante (es. "...PATRIMONIO SRL", "AZIENDA BENI COMUNI...").
// Per accettare un bando il termine culturale deve comparire nel TITOLO o nella DESCRIZIONE
// CPV (la classificazione reale del bando), non solo nel nome dell'ente.
// Verificato live (18/06): su kw "patrimonio culturale" scarta il ~53% di falsi positivi
// (gestione bar, assicurazioni, rifiuti, servizi cimiteriali) senza perdere i bandi veri.
var FAS_BDNCP_CULTURA_RX = /mus(eo|ei|eal)|bibliotec|archiv|cultural|patrimonio|monument|restaur|archeolog|teatr|mostr|spettacol|allestiment|beni cultural/i;

// Mappa nome-provincia → regione: il BDNCP riporta in luogo_nuts il nome della PROVINCIA
// (es. "Firenze"), non la regione. La colonna Regione di Bandi_v5 alimenta i filtri regionali
// della pagina Bandi → serve la regione vera ("Toscana"). Fallback: nome provincia se non mappata.
var FAS_PROVINCE_REGIONE = {
  'TORINO':'Piemonte','VERCELLI':'Piemonte','NOVARA':'Piemonte','CUNEO':'Piemonte','ASTI':'Piemonte','ALESSANDRIA':'Piemonte','BIELLA':'Piemonte','VERBANO-CUSIO-OSSOLA':'Piemonte','VERBANIA':'Piemonte',
  'AOSTA':"Valle d'Aosta","VALLE D'AOSTA":"Valle d'Aosta",
  'VARESE':'Lombardia','COMO':'Lombardia','SONDRIO':'Lombardia','MILANO':'Lombardia','BERGAMO':'Lombardia','BRESCIA':'Lombardia','PAVIA':'Lombardia','CREMONA':'Lombardia','MANTOVA':'Lombardia','LECCO':'Lombardia','LODI':'Lombardia','MONZA E DELLA BRIANZA':'Lombardia','MONZA E BRIANZA':'Lombardia',
  'BOLZANO':'Trentino-Alto Adige','BOLZANO/BOZEN':'Trentino-Alto Adige','TRENTO':'Trentino-Alto Adige',
  'VERONA':'Veneto','VICENZA':'Veneto','BELLUNO':'Veneto','TREVISO':'Veneto','VENEZIA':'Veneto','PADOVA':'Veneto','ROVIGO':'Veneto',
  'UDINE':'Friuli-Venezia Giulia','GORIZIA':'Friuli-Venezia Giulia','TRIESTE':'Friuli-Venezia Giulia','PORDENONE':'Friuli-Venezia Giulia',
  'IMPERIA':'Liguria','SAVONA':'Liguria','GENOVA':'Liguria','LA SPEZIA':'Liguria',
  'PIACENZA':'Emilia-Romagna','PARMA':'Emilia-Romagna','REGGIO EMILIA':'Emilia-Romagna',"REGGIO NELL'EMILIA":'Emilia-Romagna','MODENA':'Emilia-Romagna','BOLOGNA':'Emilia-Romagna','FERRARA':'Emilia-Romagna','RAVENNA':'Emilia-Romagna','FORLI-CESENA':'Emilia-Romagna',"FORLI'-CESENA":'Emilia-Romagna','RIMINI':'Emilia-Romagna',
  'MASSA-CARRARA':'Toscana','MASSA CARRARA':'Toscana','LUCCA':'Toscana','PISTOIA':'Toscana','FIRENZE':'Toscana','LIVORNO':'Toscana','PISA':'Toscana','AREZZO':'Toscana','SIENA':'Toscana','GROSSETO':'Toscana','PRATO':'Toscana',
  'PERUGIA':'Umbria','TERNI':'Umbria',
  'PESARO E URBINO':'Marche','ANCONA':'Marche','MACERATA':'Marche','ASCOLI PICENO':'Marche','FERMO':'Marche',
  'VITERBO':'Lazio','RIETI':'Lazio','ROMA':'Lazio','LATINA':'Lazio','FROSINONE':'Lazio',
  "L'AQUILA":'Abruzzo','TERAMO':'Abruzzo','PESCARA':'Abruzzo','CHIETI':'Abruzzo',
  'CAMPOBASSO':'Molise','ISERNIA':'Molise',
  'CASERTA':'Campania','BENEVENTO':'Campania','NAPOLI':'Campania','AVELLINO':'Campania','SALERNO':'Campania',
  'FOGGIA':'Puglia','BARI':'Puglia','TARANTO':'Puglia','BRINDISI':'Puglia','LECCE':'Puglia','BARLETTA-ANDRIA-TRANI':'Puglia',
  'POTENZA':'Basilicata','MATERA':'Basilicata',
  'COSENZA':'Calabria','CATANZARO':'Calabria','REGGIO CALABRIA':'Calabria','REGGIO DI CALABRIA':'Calabria','CROTONE':'Calabria','VIBO VALENTIA':'Calabria',
  'TRAPANI':'Sicilia','PALERMO':'Sicilia','MESSINA':'Sicilia','AGRIGENTO':'Sicilia','CALTANISSETTA':'Sicilia','ENNA':'Sicilia','CATANIA':'Sicilia','RAGUSA':'Sicilia','SIRACUSA':'Sicilia',
  'SASSARI':'Sardegna','NUORO':'Sardegna','CAGLIARI':'Sardegna','ORISTANO':'Sardegna','SUD SARDEGNA':'Sardegna'
};

function _fasProvinciaRegione_(prov) {
  if (!prov) return '';
  return FAS_PROVINCE_REGIONE[String(prov).toUpperCase().replace(/\s+/g, ' ').trim()] || '';
}

/**
 * @private true se la data (yyyy-mm-dd) è valida ED è strettamente nel passato (scaduta).
 * Date vuote/malformate → false (nel dubbio si tiene il bando).
 */
function _fasIsScaduta_(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return false;
  var d = new Date(String(iso).slice(0, 10) + 'T23:59:59');
  if (isNaN(d.getTime())) return false;
  var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return d < oggi;
}

function fasParserBdncpCultura(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var giorni = opts.giorni || 7;
  var sizePerKw = opts.sizePerKw || 50;
  var report = { ok: true, nuovi: 0, duplicati: 0, scartati: 0, scaduti: 0, errori: 0, dettagli: [] };
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

        // GATE PERTINENZA — il termine culturale deve essere nel titolo o nella descrizione
        // CPV, non solo nel nome dell'ente (evita falsi positivi tipo "...PATRIMONIO SRL"
        // con CPV rifiuti/cimiteriale/bar). Vedi FAS_BDNCP_CULTURA_RX.
        var _blob = (info.titolo + ' ' + (info.cpv || '')).toLowerCase();
        if (!FAS_BDNCP_CULTURA_RX.test(_blob)) { report.scartati++; return; }

        var link = info.docLink ||
          (id ? 'https://pubblicitalegale.anticorruzione.it/bandi/' + id : '');
        if (!link) return;
        if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }

        // La query full-text non ha filtro data → scarta i bandi già scaduti (importarli è inutile).
        var scadIso = info.scadenza || _fasNormalizzaData_(av.dataScadenza || '');
        if (_fasIsScaduta_(scadIso)) { report.scaduti++; return; }

        if (!dryRun) {
          _fasSaveBando_({
            titolo: info.titolo.substring(0, 300),
            ente: info.ente || 'BDNCP',
            livello: 'Nazionale',
            regione: _fasProvinciaRegione_(info.luogo) || info.luogo || '',
            soggetti: info.luogo || '',
            importo: (info.importo && !isNaN(Number(info.importo))) ? Number(info.importo) : (info.importo || ''),
            settore: info.cpv || 'Appalto cultura — BDNCP/ANAC',
            urlBando: link,
            sommario: (info.titolo + (info.importo ? ' — EUR ' + info.importo : '')).substring(0, 500),
            scadenza: scadIso,
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

  Logger.log('[FAS] BDNCP totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup, ' + report.scartati + ' scartati (non-cultura), ' + report.scaduti + ' scaduti, ' + report.errori + ' errori');
  return report;
}

/**
 * ONE-SHOT — Bonifica i bandi BDNCP già salvati che NON sono culturali (falsi positivi
 * del full-text pre-gate: enti con "PATRIMONIO"/"BENI" nel nome ma CPV rifiuti/cimiteriale/
 * bar/assicurazione/ecc.). Applica FAS_BDNCP_CULTURA_RX su Titolo + Settore(=descrizione CPV).
 * Marca StatoRecord='archiviato' (REVERSIBILE — non distrugge nulla).
 *
 * @param {boolean} [dryRun=true] se true riporta SOLO cosa verrebbe archiviato, senza scrivere.
 * @return {Object} {ok, dryRun, esaminatiBdncp, nonCultura, esempi[]}
 */
function cleanupBandiNonCulturaBdncp(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Bandi_v5');
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'Bandi_v5 vuoto o assente' };
  var vals = sh.getDataRange().getValues();
  var H = vals[0];
  var iTit = H.indexOf('Titolo'), iSet = H.indexOf('Settore'),
      iFon = H.indexOf('FonteNome'), iStato = H.indexOf('StatoRecord');
  if (iTit < 0 || iFon < 0 || iStato < 0) return { ok: false, error: 'colonne Titolo/FonteNome/StatoRecord mancanti' };
  var esaminati = 0, hit = 0, esempi = [];
  for (var r = 1; r < vals.length; r++) {
    if (!/BDNCP/i.test(String(vals[r][iFon] || ''))) continue;
    if (String(vals[r][iStato] || '').toLowerCase() === 'archiviato') continue;
    esaminati++;
    var blob = (String(vals[r][iTit] || '') + ' ' + (iSet >= 0 ? String(vals[r][iSet] || '') : '')).toLowerCase();
    if (FAS_BDNCP_CULTURA_RX.test(blob)) continue; // è cultura → tieni
    hit++;
    if (esempi.length < 15) esempi.push({ titolo: String(vals[r][iTit] || '').slice(0, 50), cpv: iSet >= 0 ? String(vals[r][iSet] || '').slice(0, 30) : '' });
    if (!dryRun) sh.getRange(r + 1, iStato + 1).setValue('archiviato');
  }
  Logger.log('[BDNCP cleanup] BDNCP esaminati: ' + esaminati + ' | non-cultura: ' + hit + (dryRun ? ' (DRY-RUN, nulla scritto)' : ' → ARCHIVIATI'));
  return { ok: true, dryRun: dryRun, esaminatiBdncp: esaminati, nonCultura: hit, esempi: esempi };
}

/**
 * Wrapper di comodo — esegue la bonifica IN MODALITÀ APPLICA (archivia davvero).
 * Serve perché il pulsante "Esegui" dell'editor GAS non permette di passare argomenti:
 *   - cleanupBandiNonCulturaBdncp        → dry-run (anteprima, non scrive)
 *   - cleanupBandiNonCulturaBdncpApplica → archivia i non-cultura (reversibile)
 */
function cleanupBandiNonCulturaBdncpApplica() {
  return cleanupBandiNonCulturaBdncp(false);
}

/**
 * Wrapper GATED per il pulsante "Bonifica" del cruscotto Salute (chiamato da frontend).
 * Archivia i bandi BDNCP non-cultura. Richiede admin (modifica dati).
 * @param {string} [token] token admin (sessionStorage oc_admin_token)
 * @return {Object} report di cleanupBandiNonCulturaBdncp, oppure {ok:false,error:'forbidden'}
 */
function bonificaFontiNonCultura(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  return cleanupBandiNonCulturaBdncp(false);
}

/**
 * DIAGNOSTICA (read-only) — scansiona TUTTI i bandi attivi (qualsiasi fonte) e applica
 * il gate cultura su Titolo+Settore. Riporta quanti record NON contengono un termine
 * culturale e da QUALE FonteNome provengono. Serve a capire se i bandi non-cultura visti
 * (es. cimiteri/rifiuti) arrivano da una fonte diversa da BDNCP. Non scrive nulla.
 *
 * @return {Object} {ok, attivi, nonCultura, perFonte:{<fonte>:n}, esempi[]}
 */
function diagBandiNonCulturaTutte() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Bandi_v5');
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'Bandi_v5 vuoto o assente' };
  var vals = sh.getDataRange().getValues();
  var H = vals[0];
  var iTit = H.indexOf('Titolo'), iSet = H.indexOf('Settore'),
      iFon = H.indexOf('FonteNome'), iStato = H.indexOf('StatoRecord');
  if (iTit < 0) return { ok: false, error: 'colonna Titolo mancante' };
  var attivi = 0, nonCult = 0, perFonte = {}, esempi = [];
  for (var r = 1; r < vals.length; r++) {
    if (iStato >= 0 && String(vals[r][iStato] || '').toLowerCase() === 'archiviato') continue;
    attivi++;
    var blob = (String(vals[r][iTit] || '') + ' ' + (iSet >= 0 ? String(vals[r][iSet] || '') : '')).toLowerCase();
    if (FAS_BDNCP_CULTURA_RX.test(blob)) continue; // ha un termine cultura → ok
    nonCult++;
    var fonte = iFon >= 0 ? String(vals[r][iFon] || '(vuota)') : '(vuota)';
    perFonte[fonte] = (perFonte[fonte] || 0) + 1;
    if (esempi.length < 20) esempi.push({
      fonte: fonte.slice(0, 32),
      titolo: String(vals[r][iTit] || '').slice(0, 45),
      settore: iSet >= 0 ? String(vals[r][iSet] || '').slice(0, 30) : ''
    });
  }
  Logger.log('[DIAG non-cultura] attivi: ' + attivi + ' | non-cultura: ' + nonCult + ' | per fonte: ' + JSON.stringify(perFonte));
  return { ok: true, attivi: attivi, nonCultura: nonCult, perFonte: perFonte, esempi: esempi };
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
 * API: https://dati.anticorruzione.it/opendata/ocds_it
 */
function fasParserAnac(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();

  // Endpoint: gare attive con keyword cultura/musei
  var endpoints = [
    { url: 'https://dati.anticorruzione.it/opendata/dataset/contrattipubblicistipula.json', nome: 'ANAC Contratti' },
    { url: 'https://dati.anticorruzione.it/opendata/api/3/action/package_search?q=cultura+museo+patrimonio&rows=30', nome: 'ANAC CKAN cultura' }
  ];

  endpoints.forEach(function(ep) {
    try {
      var resp = UrlFetchApp.fetch(ep.url, {
        muteHttpExceptions: true, deadline: 10,
        headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
      });
      if (resp.getResponseCode() !== 200) {
        report.dettagli.push({ fonte: ep.nome, errore: 'HTTP ' + resp.getResponseCode() });
        return;
      }
      var data;
      try { data = JSON.parse(resp.getContentText()); } catch(_) {
        report.errori++;
        report.dettagli.push({ fonte: ep.nome, errore: 'JSON parse' });
        return;
      }

      // CKAN format
      var results = (data.result && data.result.results) || [];
      // OCDS format
      if (!results.length && data.releases) results = data.releases;
      if (!results.length && Array.isArray(data)) results = data;

      results.forEach(function(item) {
        var titolo = item.title || (item.tender && item.tender.title) || item.name || '';
        var link = item.url || (item.tender && item.tender.url) || '';
        if (!link && item.id) link = 'https://dati.anticorruzione.it/opendata/dataset/' + item.id;
        if (!titolo || !link) return;

        // Filtra solo cultura/musei
        var allText = (titolo + ' ' + (item.notes || item.description || '')).toLowerCase();
        if (!/cultur|museo|musei|patrimoni|restaur|archeolog|monument|turis/.test(allText)) return;

        if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }
        if (!dryRun) {
          _fasSaveBando_({
            titolo: titolo.substring(0, 300),
            ente: (item.organization && item.organization.title) || 'ANAC',
            livello: 'Nazionale',
            settore: 'Contratti pubblici cultura',
            urlBando: link,
            sommario: String(item.notes || item.description || '').substring(0, 500),
            ambito: 3,
            fonteNome: ep.nome
          });
          existingUrls[link.toLowerCase()] = true;
        }
        report.nuovi++;
      });
      report.dettagli.push({ fonte: ep.nome, risultati: results.length });
      Logger.log('[FAS] ' + ep.nome + ': ' + results.length + ' risultati');
    } catch(e) {
      report.errori++;
      report.dettagli.push({ fonte: ep.nome, errore: e.message });
      Logger.log('[FAS] ' + ep.nome + ' errore: ' + e.message);
    }
  });

  Logger.log('[FAS] ANAC totale: ' + report.nuovi + ' nuovi, ' + report.duplicati + ' dup');
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
 */
function fasParserSediaEU(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var report = { ok: true, nuovi: 0, duplicati: 0, errori: 0, dettagli: [] };
  var existingUrls = _fasLoadExistingUrls_();

  var searchUrl = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=museum+OR+cultural+heritage+OR+patrimonio+culturale&pageSize=20&pageNumber=1';

  try {
    var resp = UrlFetchApp.fetch(searchUrl, {
      method: 'get',
      muteHttpExceptions: true, deadline: 10,
      headers: { 'Accept': 'application/json', 'User-Agent': 'SinopiaBot/1.0' }
    });
    if (resp.getResponseCode() !== 200) {
      // Prova POST con payload
      resp = UrlFetchApp.fetch('https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=cultural+heritage', {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true, deadline: 10,
        payload: JSON.stringify({ query: 'museum OR cultural heritage', languages: ['en','it'], sortField: 'sortDate', sortOrder: 'DESC' }),
        headers: { 'User-Agent': 'SinopiaBot/1.0' }
      });
    }
    if (resp.getResponseCode() !== 200) {
      report.dettagli.push({ fonte: 'SEDIA EU', errore: 'HTTP ' + resp.getResponseCode() });
      Logger.log('[FAS] SEDIA EU HTTP ' + resp.getResponseCode());
      return report;
    }

    var data;
    try { data = JSON.parse(resp.getContentText()); } catch(_) {
      report.errori++;
      report.dettagli.push({ fonte: 'SEDIA EU', errore: 'JSON parse' });
      return report;
    }

    var results = data.results || data.content || [];
    results.forEach(function(item) {
      var titolo = item.title || item.name || '';
      if (typeof titolo === 'object') titolo = titolo.en || titolo.it || Object.values(titolo)[0] || '';
      var link = item.url || item.uri || '';
      if (!link && item.identifier) link = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/' + item.identifier;
      if (!titolo || !link) return;
      if (existingUrls[link.toLowerCase()]) { report.duplicati++; return; }

      if (!dryRun) {
        _fasSaveBando_({
          titolo: String(titolo).substring(0, 300),
          ente: 'Commissione Europea',
          livello: 'EU',
          settore: 'EU Funding cultura',
          urlBando: link,
          sommario: String(item.description || item.summary || '').substring(0, 500),
          scadenza: _fasNormalizzaData_(item.deadlineDate || item.deadline || ''),
          ambito: 3,
          fonteNome: 'SEDIA EU Funding & Tenders'
        });
        existingUrls[link.toLowerCase()] = true;
      }
      report.nuovi++;
    });
    report.dettagli.push({ fonte: 'SEDIA EU', risultati: results.length });
    Logger.log('[FAS] SEDIA EU: ' + results.length + ' risultati, ' + report.nuovi + ' nuovi');
  } catch(e) {
    report.errori++;
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

  // v4.20 — ANAC, OpenCUP, SEDIA, Lombardia disabilitati: endpoint inerti (0 risultati / errori costanti).
  // Riabilitare singolarmente quando gli endpoint tornano operativi.
  Logger.log('[FAS] FASE 2b — SKIP: endpoint ANAC/OpenCUP/SEDIA/Lombardia disabilitati (v4.20)');
  report.anac = { ok: true, skipped: true, motivo: 'endpoint inerte (v4.20)' };
  report.opencup = { ok: true, skipped: true, motivo: 'endpoint inerte (v4.20)' };
  report.sedia = { ok: true, skipped: true, motivo: 'endpoint inerte (v4.20)' };
  report.lombardia = { ok: true, skipped: true, motivo: 'endpoint inerte (v4.20)' };

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
 * Wrapper DRY-RUN di fasDeprecaFontiIrrecuperabili — ri-testa le fonti silenti (>=3 fail)
 * e riporta cosa verrebbe RECUPERATO vs DEPRECATO, SENZA scrivere nulla.
 * Eseguire questo PRIMA dell'apply (fasDeprecaFontiIrrecuperabili senza argomenti).
 */
function fasDeprecaFontiDryRun() {
  return fasDeprecaFontiIrrecuperabili({ dryRun: true });
}

// ============================================================================
// RIPRISTINO FONTI CULTURA — URL/feed corretti (ricerca verificata 2026-06-19)
// ============================================================================
// Mappa nome-fonte → {url, tipo, nota}. URL verificati live (contenuti giugno 2026).
// 13 fonti recuperate; 2 restano deprecate (non incluse qui):
//   - "Il Giornale delle Fondazioni": testata CHIUSA (non pubblica più) + sito irraggiungibile
//   - "Regione Sardegna - Cultura": listato bandi dietro motore JS (Coveo), nessun RSS
var FAS_FONTI_RIPRISTINO = {
  'Italia Domani - PNRR':            { url: 'https://www.italiadomani.gov.it/content/sogei-ng/it/it/feed-rss.news_feed_rss.xml', tipo: 'RSS', nota: 'feed news PNRR (403 era solo sul layer HTML)' },
  'Fondazione Cariplo - Cultura':    { url: 'https://www.fondazionecariplo.it/feed/', tipo: 'RSS', nota: 'feed WordPress sito-wide, filtrare cultura' },
  'ICOM Italia - Opportunità':       { url: 'https://www.icom-italia.org/feed/', tipo: 'RSS', nota: 'feed generale attivo (giu 2026)' },
  'Federculture - Bandi':            { url: 'https://www.federculture.it/feed/', tipo: 'RSS', nota: 'pubblica i Bollettino Bandi' },
  'Fondazione Symbola - Bandi':      { url: 'https://symbola.net/feed/', tipo: 'RSS', nota: 'feed generale (feed eventi dedicato e morto)' },
  'Fondazione Symbola - Notizie':    { url: 'https://symbola.net/tipologia/news/feed/', tipo: 'RSS', nota: 'feed tassonomia News' },
  'Fondazione Fitzcarraldo':         { url: 'https://www.fitzcarraldo.it/feed/', tipo: 'RSS', nota: '' },
  'NEMO - European Museum Network':  { url: 'https://www.ne-mo.org/news-events/', tipo: 'HTML', nota: 'nessun RSS (sito custom): scrape HTML del listing' },
  'MuseumNext - Opportunities':      { url: 'https://www.museumnext.com/feed/', tipo: 'RSS', nota: '' },
  'ANCI - Bandi e Opportunita':      { url: 'https://www.anci.it/feed/', tipo: 'RSS', nota: 'feed generale, filtrare bandi' },
  'Regione Puglia - Bandi':          { url: 'https://www.regione.puglia.it/feed-bandi-regione-puglia?p_p_id=com_liferay_asset_publisher_web_portlet_AssetPublisherPortlet_INSTANCE_zY8SiKCyhUKl&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=getRSS&p_p_cacheability=cacheLevelPage', tipo: 'RSS', nota: 'feed bandi nuovo portale Liferay, filtrare cultura' },
  'IndiceBandi - Cultura':           { url: 'https://www.indicebandi.it/it/taxonomy/term/5/feed', tipo: 'RSS', nota: 'gia pre-filtrato cultura (Drupal taxonomy)' },
  'MAB Italia - Bandi':              { url: 'https://anai.org/feed/', tipo: 'RSS', nota: 'PROXY ANAI: MAB non ha feed proprio, ANAI pubblica le news MAB' }
};

function _fasNormNome_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Ripristina le fonti cultura deprecate con URL/feed corretti (vedi FAS_FONTI_RIPRISTINO).
 * Cerca per Nome (accent/case-insensitive) nei fogli FontiBandi_v5/News/Podcast/Video,
 * aggiorna URL+Tipo, riattiva (Attiva=true, FailConsecutivi=0, UltimoEsito='RESTORED').
 *
 * @param {boolean} [dryRun=true] anteprima senza scrivere.
 * @return {Object} {ok, dryRun, aggiornate, nonTrovate[], dettagli[]}
 */
function fasRipristinaFontiCultura(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var report = { ok: true, dryRun: dryRun, aggiornate: 0, nonTrovate: [], dettagli: [] };

  // Indice normalizzato della mappa
  var mapNorm = {};
  Object.keys(FAS_FONTI_RIPRISTINO).forEach(function(k) { mapNorm[_fasNormNome_(k)] = { key: k, val: FAS_FONTI_RIPRISTINO[k] }; });
  var trovati = {};

  ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'].forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getDataRange().getValues();
    var H = vals[0];
    var iNome = H.indexOf('Nome'), iUrl = H.indexOf('URL'), iTipo = H.indexOf('Tipo'),
        iAtt = H.indexOf('Attiva'), iFail = H.indexOf('FailConsecutivi'),
        iEsito = H.indexOf('UltimoEsito'), iErr = H.indexOf('UltimoErrore');
    if (iNome < 0 || iUrl < 0) return;
    for (var r = 1; r < vals.length; r++) {
      var hit = mapNorm[_fasNormNome_(vals[r][iNome])];
      if (!hit) continue;
      trovati[hit.key] = true;
      var m = hit.val;
      if (!dryRun) {
        sh.getRange(r + 1, iUrl + 1).setValue(m.url);
        if (iTipo >= 0 && m.tipo) sh.getRange(r + 1, iTipo + 1).setValue(m.tipo);
        if (iAtt >= 0) sh.getRange(r + 1, iAtt + 1).setValue(true);
        if (iFail >= 0) sh.getRange(r + 1, iFail + 1).setValue(0);
        if (iEsito >= 0) sh.getRange(r + 1, iEsito + 1).setValue('RESTORED');
        if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('[RESTORED ' + new Date().toISOString().slice(0, 10) + '] ' + (m.nota || 'URL aggiornato'));
      }
      report.aggiornate++;
      report.dettagli.push({ nome: String(vals[r][iNome] || ''), sheet: shName, nuovoUrl: m.url, tipo: m.tipo || '' });
    }
  });

  Object.keys(FAS_FONTI_RIPRISTINO).forEach(function(k) { if (!trovati[k]) report.nonTrovate.push(k); });
  Logger.log('[FAS] Ripristino fonti cultura: ' + report.aggiornate + ' aggiornate' + (dryRun ? ' (DRY-RUN, nulla scritto)' : '') + ', non trovate nei fogli: ' + report.nonTrovate.length);
  return report;
}

/** Wrapper APPLICA (scrive davvero) — il pulsante Esegui non passa argomenti. */
function fasRipristinaFontiCulturaApplica() {
  return fasRipristinaFontiCultura(false);
}

/**
 * ONE-SHOT — aggiunge ANAI (Associazione Nazionale Archivistica Italiana) come fonte News.
 * Feed verificato live (2026-06-19): https://anai.org/feed/ — RSS 2.0, contenuti giugno 2026,
 * pubblica anche le news MAB. Usa addFonteUnificataV2 (gestisce dedup per URL → idempotente).
 *
 * @return {Object} risultato di addFonteUnificataV2
 */
function fasAggiungiFonteANAI() {
  if (typeof addFonteUnificataV2 !== 'function') {
    return { ok: false, error: 'addFonteUnificataV2 non disponibile (Fonti_v1.js)' };
  }
  return addFonteUnificataV2({
    tipo: 'news',
    nome: 'ANAI - Notizie e Bandi',
    url: 'https://anai.org/feed/',
    tipoFonte: 'RSS',
    tag: 'istituzionale',
    categoria: 'cultura',
    priorita: 2,
    enteDefault: 'ANAI - Associazione Nazionale Archivistica Italiana',
    livello: 'Nazionale'
  });
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
