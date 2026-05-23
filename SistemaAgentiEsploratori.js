/**
 * ============================================================================
 *  SistemaAgentiEsploratori.gs — SEAS (Sinopia Exploratory Agent System)
 * ============================================================================
 *  v4.18.68 (2026-05-23)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Sistema multi-agente esplorativo che:
 *  1. Scopre nuove fonti potenziali (RSS/HTML) da URL seed
 *  2. Classifica le fonti scoperte per rilevanza culturale
 *  3. Propone fonti candidate all'admin per approvazione
 *  4. Monitora la qualita delle fonti nel tempo
 *
 *  Foglio stato: AgentExplorationState (creato automaticamente)
 *  API: Claude Haiku per classificazione, Sonnet per estrazione semantica
 *
 *  Funzioni pubbliche:
 *    seasExplore(opts)                — ciclo esplorativo principale
 *    seasClassifyUrl(url)             — classifica una URL singola
 *    seasGetCandidates(opts)          — ritorna fonti candidate per approvazione
 *    seasApproveCandidate(candidateId)— approva e aggiunge alle fonti attive
 *    seasRejectCandidate(candidateId) — rifiuta candidata
 *    seasSetupSheet()                 — crea/verifica foglio stato
 *    seasDiagnostica()                — report stato sistema
 *
 *  Prefisso unico: seas_ / _seas* per evitare collisioni con le 682 funzioni esistenti
 * ============================================================================
 */

// ============================================================================
// COSTANTI
// ============================================================================

var SEAS_SHEET_NAME = 'AgentExplorationState';
var SEAS_HEADERS = [
  'ID',              // seas_YYYYMMDD_XXXX
  'URL',             // URL scoperta
  'Dominio',         // dominio estratto
  'TipoRisorsa',     // RSS | HTML | Sitemap | Unknown
  'Titolo',          // titolo pagina/feed
  'Descrizione',     // descrizione breve
  'Ambito',          // cultura | turismo | accessibilita | innovazione | governance
  'RilevanzaScore',  // 0-100 (classificazione Claude)
  'Stato',           // candidata | approvata | rifiutata | errore
  'FonteSeed',       // URL da cui e stata scoperta
  'DataScoperta',    // timestamp
  'DataClassifica',  // timestamp classificazione
  'DataDecisione',   // timestamp approvazione/rifiuto
  'ClassificaJSON',  // JSON con dettagli classificazione
  'Note',            // note admin
  'FonteIDCreata'    // ID fonte creata in FontiBandi_v5/FontiNews (se approvata)
];

var SEAS_STATI = {
  CANDIDATA: 'candidata',
  APPROVATA: 'approvata',
  RIFIUTATA: 'rifiutata',
  ERRORE: 'errore'
};

// URL seed di partenza per l'esplorazione (portali aggregatori, directory, hub)
var SEAS_SEED_URLS = [
  { url: 'https://cultura.gov.it/bandi',            ambito: 'cultura',       nome: 'MiC Bandi' },
  { url: 'https://www.icom-italia.org/',             ambito: 'cultura',       nome: 'ICOM Italia' },
  { url: 'https://www.federculture.it/',             ambito: 'governance',    nome: 'Federculture' },
  { url: 'https://www.museumnext.com/',              ambito: 'innovazione',   nome: 'MuseumNext' },
  { url: 'https://www.ne-mo.org/',                   ambito: 'governance',    nome: 'NEMO' },
  { url: 'https://pro.europeana.eu/',                ambito: 'innovazione',   nome: 'Europeana Pro' },
  { url: 'https://www.artribune.com/',               ambito: 'cultura',       nome: 'Artribune' },
  { url: 'https://www.beniculturali.it/',            ambito: 'cultura',       nome: 'Beni Culturali' },
  { url: 'https://www.agendadigitale.eu/',           ambito: 'innovazione',   nome: 'Agenda Digitale' },
  { url: 'https://culturalwelfare.center/',          ambito: 'accessibilita', nome: 'CCW' }
];

// ============================================================================
// SETUP FOGLIO
// ============================================================================

/**
 * Crea o verifica il foglio AgentExplorationState con header corretti.
 * Idempotente.
 * @return {Object} {ok, action: 'created'|'exists', rows}
 */
function seasSetupSheet() {
  try {
    var sh = _seasGetOrCreateSheet_();
    return { ok: true, action: sh._created ? 'created' : 'exists', rows: sh.getLastRow() - 1 };
  } catch(e) {
    Logger.log('[SEAS] setupSheet errore: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * @private Accede o crea il foglio con header.
 */
function _seasGetOrCreateSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SEAS_SHEET_NAME);
  if (sh) return sh;

  sh = ss.insertSheet(SEAS_SHEET_NAME);
  sh.getRange(1, 1, 1, SEAS_HEADERS.length).setValues([SEAS_HEADERS])
    .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidth(2, 350); // URL
  sh.setColumnWidth(5, 250); // Titolo
  sh._created = true;
  Logger.log('[SEAS] Foglio ' + SEAS_SHEET_NAME + ' creato con ' + SEAS_HEADERS.length + ' colonne');
  return sh;
}

// ============================================================================
// ESPLORAZIONE PRINCIPALE
// ============================================================================

/**
 * Ciclo esplorativo: visita i seed URL, scopre link a RSS/feed, classifica.
 *
 * @param {Object} [opts] {maxSeeds: number, maxLinksPerSeed: number, dryRun: boolean}
 * @return {Object} {ok, seedVisitati, linkScoperti, classificati, errori, dettagli[]}
 */
function seasExplore(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  opts = opts || {};
  var maxSeeds = opts.maxSeeds || SEAS_SEED_URLS.length;
  var maxLinks = opts.maxLinksPerSeed || 5;
  var dryRun = !!opts.dryRun;

  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    seedVisitati: 0,
    linkScoperti: 0,
    classificati: 0,
    errori: 0,
    dettagli: []
  };

  // Setup foglio
  var sh;
  try { sh = _seasGetOrCreateSheet_(); } catch(e) {
    return { ok: false, error: 'foglio: ' + e.message };
  }

  // Carica URL gia esplorate per dedup
  var existingUrls = _seasLoadExistingUrls_(sh);

  // API key
  var apiKey = '';
  try { apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY') || ''; } catch(_){}

  var startTime = Date.now();

  for (var i = 0; i < Math.min(maxSeeds, SEAS_SEED_URLS.length); i++) {
    var seed = SEAS_SEED_URLS[i];
    report.seedVisitati++;

    // Wall-clock guard (4 minuti)
    if (Date.now() - startTime > 240000) {
      Logger.log('[SEAS] Timeout 4min, interrompo esplorazione');
      report.dettagli.push({ azione: 'timeout', seedRimanenti: SEAS_SEED_URLS.length - i });
      break;
    }

    try {
      var links = _seasDiscoverLinks_(seed.url, maxLinks);
      report.linkScoperti += links.length;

      for (var j = 0; j < links.length; j++) {
        var link = links[j];
        if (existingUrls[link.url.toLowerCase()]) continue;

        // Classifica con Claude (se API key disponibile)
        var classifica = null;
        if (apiKey) {
          try {
            classifica = _seasClassifyWithClaude_(apiKey, link, seed);
            report.classificati++;
          } catch(eCl) {
            Logger.log('[SEAS] Classificazione fallita: ' + eCl.message);
          }
        }

        // Salva candidata
        if (!dryRun) {
          _seasSaveCandidate_(sh, link, seed, classifica);
          existingUrls[link.url.toLowerCase()] = true;
        }
        report.dettagli.push({
          url: link.url,
          titolo: link.titolo || '',
          tipo: link.tipo,
          seed: seed.nome,
          score: classifica ? classifica.score : null
        });
      }
    } catch(eSeed) {
      report.errori++;
      report.dettagli.push({ seed: seed.nome, errore: eSeed.message });
      Logger.log('[SEAS] Errore seed ' + seed.nome + ': ' + eSeed.message);
    }
  }

  Logger.log('[SEAS] Esplorazione completata: ' + report.seedVisitati + ' seed, ' +
    report.linkScoperti + ' link, ' + report.classificati + ' classificati, ' +
    report.errori + ' errori');
  return report;
}

// ============================================================================
// SCOPERTA LINK
// ============================================================================

/**
 * Visita una pagina e cerca link a feed RSS, pagine bandi, risorse culturali.
 * @private
 * @return {Array} [{url, titolo, tipo}]
 */
function _seasDiscoverLinks_(pageUrl, maxLinks) {
  var links = [];
  var resp;
  try {
    resp = UrlFetchApp.fetch(pageUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SinopiaExplorer/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  } catch(eNet) {
    Logger.log('[SEAS] Network error su ' + pageUrl + ': ' + eNet.message);
    return links;
  }

  if (resp.getResponseCode() !== 200) return links;
  var html = resp.getContentText();

  // 1. Cerca link a feed RSS/Atom nel <head>
  var rssMatches = html.match(/<link[^>]*type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]*>/gi) || [];
  rssMatches.forEach(function(tag) {
    var hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    var titleMatch = tag.match(/title=["']([^"']+)["']/i);
    if (hrefMatch && hrefMatch[1]) {
      var feedUrl = _seasResolveUrl_(hrefMatch[1], pageUrl);
      if (feedUrl && links.length < maxLinks) {
        links.push({ url: feedUrl, titolo: (titleMatch && titleMatch[1]) || '', tipo: 'RSS' });
      }
    }
  });

  // 2. Cerca link a pagine bandi/opportunita nel body
  var bandiPattern = /href=["']([^"']*(?:bandi|opportunit|finanziament|avvis|concors|grant|funding|call)[^"']*)["']/gi;
  var match;
  while ((match = bandiPattern.exec(html)) !== null && links.length < maxLinks) {
    var url = _seasResolveUrl_(match[1], pageUrl);
    if (url && !links.some(function(l){ return l.url === url; })) {
      links.push({ url: url, titolo: '', tipo: 'HTML' });
    }
  }

  // 3. Cerca link a feed nella pagina (common patterns)
  var feedPattern = /href=["']([^"']*(?:\/feed\/?|\/rss\/?|\/atom\.xml|\.rss|rss\.xml)[^"']*)["']/gi;
  while ((match = feedPattern.exec(html)) !== null && links.length < maxLinks) {
    var feedUrl2 = _seasResolveUrl_(match[1], pageUrl);
    if (feedUrl2 && !links.some(function(l){ return l.url === feedUrl2; })) {
      links.push({ url: feedUrl2, titolo: '', tipo: 'RSS' });
    }
  }

  return links;
}

/**
 * Risolve URL relativo in assoluto.
 * @private
 */
function _seasResolveUrl_(href, baseUrl) {
  if (!href) return null;
  href = href.trim();
  if (href.indexOf('http://') === 0 || href.indexOf('https://') === 0) return href;
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (href.indexOf('/') === 0) {
    var baseMatch = baseUrl.match(/^(https?:\/\/[^\/]+)/);
    return baseMatch ? baseMatch[1] + href : null;
  }
  // Relativo
  var lastSlash = baseUrl.lastIndexOf('/');
  return baseUrl.substring(0, lastSlash + 1) + href;
}

// ============================================================================
// CLASSIFICAZIONE CON CLAUDE
// ============================================================================

/**
 * Classifica una URL scoperta usando Claude Haiku.
 * @private
 * @return {Object} {score, ambito, motivo, tipo_contenuto}
 */
function _seasClassifyWithClaude_(apiKey, link, seed) {
  var prompt = 'Analizza questa risorsa web e valuta se e utile per un osservatorio culturale italiano ' +
    'che monitora bandi, finanziamenti, normative, innovazione e accessibilita per musei.\n\n' +
    'URL: ' + link.url + '\n' +
    'Tipo rilevato: ' + link.tipo + '\n' +
    'Titolo: ' + (link.titolo || 'non disponibile') + '\n' +
    'Scoperta da: ' + seed.nome + ' (' + seed.ambito + ')\n\n' +
    'Rispondi SOLO con un JSON:\n' +
    '{\n' +
    '  "score": 0-100,\n' +
    '  "ambito": "cultura|turismo|accessibilita|innovazione|governance|non_pertinente",\n' +
    '  "motivo": "spiegazione breve",\n' +
    '  "tipo_contenuto": "bandi|news|normativa|ricerca|formazione|altro"\n' +
    '}';

  // Usa _claudeApiCall_ se disponibile (Bandi_v5.js), altrimenti chiamata diretta
  if (typeof _claudeApiCall_ === 'function') {
    var result = _claudeApiCall_(apiKey, 'claude-haiku-4-5-20251001', prompt, 256, 1);
    if (result.fallback) return { score: 0, ambito: 'non_pertinente', motivo: 'API fallita', tipo_contenuto: 'altro' };
    return _seasParseClassifica_(result.text);
  }

  // Fallback: chiamata diretta
  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      return { score: 0, ambito: 'non_pertinente', motivo: 'HTTP ' + resp.getResponseCode(), tipo_contenuto: 'altro' };
    }
    var body = JSON.parse(resp.getContentText());
    var text = (body.content && body.content[0]) ? body.content[0].text : '';
    return _seasParseClassifica_(text);
  } catch(e) {
    return { score: 0, ambito: 'non_pertinente', motivo: e.message, tipo_contenuto: 'altro' };
  }
}

/**
 * @private Parsa risposta classificazione Claude.
 */
function _seasParseClassifica_(text) {
  if (!text) return { score: 0, ambito: 'non_pertinente', motivo: 'risposta vuota', tipo_contenuto: 'altro' };
  var clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    var obj = JSON.parse(clean);
    return {
      score: Math.max(0, Math.min(100, Number(obj.score) || 0)),
      ambito: String(obj.ambito || 'non_pertinente'),
      motivo: String(obj.motivo || ''),
      tipo_contenuto: String(obj.tipo_contenuto || 'altro')
    };
  } catch(_) {
    var m = clean.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        var obj2 = JSON.parse(m[0]);
        return {
          score: Math.max(0, Math.min(100, Number(obj2.score) || 0)),
          ambito: String(obj2.ambito || 'non_pertinente'),
          motivo: String(obj2.motivo || ''),
          tipo_contenuto: String(obj2.tipo_contenuto || 'altro')
        };
      } catch(_2) {}
    }
  }
  return { score: 0, ambito: 'non_pertinente', motivo: 'parse fallito', tipo_contenuto: 'altro' };
}

// ============================================================================
// CLASSIFICAZIONE SINGOLA URL (pubblica)
// ============================================================================

/**
 * Classifica una singola URL. Endpoint per admin.
 * @param {string} url
 * @return {Object} {ok, classificazione}
 */
function seasClassifyUrl(url) {
  if (!url) return { ok: false, error: 'URL mancante' };
  var apiKey = '';
  try { apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY') || ''; } catch(_){}
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY non configurata' };

  var link = { url: String(url).trim(), titolo: '', tipo: 'Unknown' };
  var seed = { nome: 'Manuale', ambito: 'cultura' };

  try {
    var classifica = _seasClassifyWithClaude_(apiKey, link, seed);
    return { ok: true, classificazione: classifica };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// GESTIONE CANDIDATI
// ============================================================================

/**
 * Ritorna fonti candidate ordinate per score.
 * @param {Object} [opts] {stato: 'candidata'|'approvata'|'rifiutata', minScore: number, limit: number}
 */
function seasGetCandidates(opts) {
  opts = opts || {};
  var stato = opts.stato || SEAS_STATI.CANDIDATA;
  var minScore = opts.minScore || 0;
  var limit = opts.limit || 50;

  try {
    var sh = _seasGetOrCreateSheet_();
    if (sh.getLastRow() < 2) return { ok: true, candidati: [], totale: 0 };

    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iId = head.indexOf('ID'), iUrl = head.indexOf('URL'),
        iDom = head.indexOf('Dominio'), iTipo = head.indexOf('TipoRisorsa'),
        iTit = head.indexOf('Titolo'), iDesc = head.indexOf('Descrizione'),
        iAmb = head.indexOf('Ambito'), iScore = head.indexOf('RilevanzaScore'),
        iStato = head.indexOf('Stato'), iSeed = head.indexOf('FonteSeed'),
        iData = head.indexOf('DataScoperta'), iNote = head.indexOf('Note');

    var candidati = [];
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iStato] || '') !== stato) continue;
      var score = Number(vals[r][iScore] || 0);
      if (score < minScore) continue;
      candidati.push({
        id: String(vals[r][iId] || ''),
        url: String(vals[r][iUrl] || ''),
        dominio: String(vals[r][iDom] || ''),
        tipo: String(vals[r][iTipo] || ''),
        titolo: String(vals[r][iTit] || ''),
        descrizione: String(vals[r][iDesc] || ''),
        ambito: String(vals[r][iAmb] || ''),
        score: score,
        seed: String(vals[r][iSeed] || ''),
        data: vals[r][iData] || '',
        note: String(vals[r][iNote] || ''),
        _row: r + 1
      });
    }

    candidati.sort(function(a, b) { return b.score - a.score; });
    return { ok: true, candidati: candidati.slice(0, limit), totale: candidati.length };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Approva una candidata e la aggiunge alle fonti attive.
 * @param {string} candidateId
 * @return {Object} {ok, fonteId}
 */
function seasApproveCandidate(candidateId) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  try {
    var sh = _seasGetOrCreateSheet_();
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iId = head.indexOf('ID'), iUrl = head.indexOf('URL'),
        iTit = head.indexOf('Titolo'), iTipo = head.indexOf('TipoRisorsa'),
        iAmb = head.indexOf('Ambito'), iStato = head.indexOf('Stato'),
        iDec = head.indexOf('DataDecisione'), iFonte = head.indexOf('FonteIDCreata');

    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iId]) !== String(candidateId)) continue;
      if (String(vals[r][iStato]) !== SEAS_STATI.CANDIDATA) {
        return { ok: false, error: 'non in stato candidata' };
      }

      // Determina tipo fonte (bandi vs news)
      var tipoFonte = String(vals[r][iTipo] || 'HTML');
      var ambitoVal = String(vals[r][iAmb] || 'cultura');
      var targetTipo = (ambitoVal === 'turismo' || ambitoVal === 'governance') ? 'bandi' : 'news';

      // Aggiungi alle fonti attive
      var fonteResult = null;
      if (typeof addFonteUnificataV2 === 'function') {
        fonteResult = addFonteUnificataV2({
          tipo: targetTipo,
          nome: String(vals[r][iTit] || vals[r][iUrl]),
          url: String(vals[r][iUrl]),
          tipoFonte: tipoFonte,
          tag: 'settoriale',
          categoria: ambitoVal,
          priorita: 2
        });
      }

      // Aggiorna stato
      sh.getRange(r + 1, iStato + 1).setValue(SEAS_STATI.APPROVATA);
      sh.getRange(r + 1, iDec + 1).setValue(new Date());
      if (fonteResult && fonteResult.ok && fonteResult.id) {
        sh.getRange(r + 1, iFonte + 1).setValue(fonteResult.id);
      }

      Logger.log('[SEAS] Candidata approvata: ' + candidateId + ' → fonte ' + (fonteResult && fonteResult.id || '?'));
      return { ok: true, fonteId: (fonteResult && fonteResult.id) || null };
    }
    return { ok: false, error: 'candidata non trovata: ' + candidateId };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Rifiuta una candidata.
 * @param {string} candidateId
 * @param {string} [motivo]
 */
function seasRejectCandidate(candidateId, motivo) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  try {
    var sh = _seasGetOrCreateSheet_();
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iId = head.indexOf('ID'), iStato = head.indexOf('Stato'),
        iDec = head.indexOf('DataDecisione'), iNote = head.indexOf('Note');

    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iId]) !== String(candidateId)) continue;
      sh.getRange(r + 1, iStato + 1).setValue(SEAS_STATI.RIFIUTATA);
      sh.getRange(r + 1, iDec + 1).setValue(new Date());
      if (motivo && iNote >= 0) sh.getRange(r + 1, iNote + 1).setValue(String(motivo));
      Logger.log('[SEAS] Candidata rifiutata: ' + candidateId);
      return { ok: true };
    }
    return { ok: false, error: 'candidata non trovata' };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// DIAGNOSTICA
// ============================================================================

/**
 * Report stato sistema SEAS.
 */
function seasDiagnostica() {
  try {
    var sh = _seasGetOrCreateSheet_();
    var out = { ok: true, timestamp: new Date().toISOString() };

    if (sh.getLastRow() < 2) {
      out.totale = 0;
      out.perStato = { candidata: 0, approvata: 0, rifiutata: 0, errore: 0 };
      out.perAmbito = {};
      out.scoreMediaCandidati = 0;
    } else {
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iStato = head.indexOf('Stato'), iAmb = head.indexOf('Ambito'), iScore = head.indexOf('RilevanzaScore');
      var perStato = { candidata: 0, approvata: 0, rifiutata: 0, errore: 0 };
      var perAmbito = {};
      var scoreSum = 0, scoreCnt = 0;

      for (var r = 1; r < vals.length; r++) {
        var stato = String(vals[r][iStato] || '');
        perStato[stato] = (perStato[stato] || 0) + 1;
        var ambito = String(vals[r][iAmb] || 'altro');
        perAmbito[ambito] = (perAmbito[ambito] || 0) + 1;
        if (stato === 'candidata') {
          scoreSum += Number(vals[r][iScore] || 0);
          scoreCnt++;
        }
      }

      out.totale = vals.length - 1;
      out.perStato = perStato;
      out.perAmbito = perAmbito;
      out.scoreMediaCandidati = scoreCnt > 0 ? Math.round(scoreSum / scoreCnt) : 0;
    }

    // API key check
    var hasKey = false;
    try { hasKey = !!PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY'); } catch(_){}
    out.claudeApiKey = hasKey;

    Logger.log('[SEAS] Diagnostica: ' + JSON.stringify(out));
    return out;
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// HELPERS PRIVATI
// ============================================================================

/**
 * @private Carica URL gia presenti nel foglio per dedup.
 */
function _seasLoadExistingUrls_(sh) {
  var urls = {};
  try {
    if (sh.getLastRow() < 2) return urls;
    var vals = sh.getDataRange().getValues();
    var iUrl = vals[0].indexOf('URL');
    for (var r = 1; r < vals.length; r++) {
      var u = String(vals[r][iUrl] || '').trim().toLowerCase();
      if (u) urls[u] = true;
    }
  } catch(_) {}
  return urls;
}

/**
 * @private Salva una candidata nel foglio.
 */
function _seasSaveCandidate_(sh, link, seed, classifica) {
  try {
    var id = 'seas_' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMMdd') + '_' +
             Math.random().toString(36).substring(2, 6);
    var dominio = '';
    try { dominio = link.url.match(/^https?:\/\/([^\/]+)/)[1]; } catch(_){}

    var row = new Array(SEAS_HEADERS.length).fill('');
    row[0]  = id;
    row[1]  = link.url;
    row[2]  = dominio;
    row[3]  = link.tipo || 'Unknown';
    row[4]  = link.titolo || '';
    row[5]  = classifica ? classifica.motivo : '';
    row[6]  = classifica ? classifica.ambito : seed.ambito;
    row[7]  = classifica ? classifica.score : 0;
    row[8]  = SEAS_STATI.CANDIDATA;
    row[9]  = seed.url;
    row[10] = new Date();
    row[11] = classifica ? new Date() : '';
    row[12] = '';
    row[13] = classifica ? JSON.stringify(classifica) : '';
    row[14] = '';
    row[15] = '';

    sh.appendRow(row);
  } catch(e) {
    Logger.log('[SEAS] _seasSaveCandidate_ errore: ' + e.message);
  }
}

// ============================================================================
// FINE SistemaAgentiEsploratori.gs
// ============================================================================
