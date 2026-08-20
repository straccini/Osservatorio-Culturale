// ============================================================================
// PubDiscovery_v1.js — Automatic publication discovery via free APIs
// v1.0 — 2026-06-24
//
// Queries Open Library, Crossref, and OpenAlex for museum/cultural heritage
// publications. Normalizes results to the Pubblicazioni sheet schema,
// deduplicates against existing content, scores quality, and writes new rows.
//
// Public:  pubDiscoveryScan(opts), pubDiscoveryTest(),
//          pubDiscoverySetupTrigger(), pubDiscoveryStatus()
// Private: _pub_* (prefixed helpers)
//
// Dependencies (global): getMainSS, SH, LIBRI_HEADERS
// ============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

var _PUB_MAILTO_ = 'sinopiaconsulting@gmail.com';
var _PUB_SCORE_THRESHOLD_ = 45;
var _PUB_LOG_PREFIX_ = '[PubDiscovery]';

// Claude Haiku filter — optional relevance refinement step after keyword scoring.
// Enable/disable via ScriptProperty PUB_CLAUDE_FILTER_ENABLED ('true'/'false').
// Default: disabled (safe — won't break scan if API key is missing or rate limit is hit).
var _PUB_CLAUDE_FILTER_DEFAULT_ = false;   // change to true to enable globally
var _PUB_CLAUDE_SCORE_THRESHOLD_ = 60;     // Claude relevance score >= this passes
var _PUB_CLAUDE_BATCH_SIZE_ = 20;          // send top N candidates to Claude
var _PUB_CLAUDE_DAILY_CAP_ = 10;           // max filter calls per day (each = 1 batch)
var _PUB_CLAUDE_CAP_PROP_ = 'PUB_CLAUDE_CALLS_';

// v4.27.97 — pool ampliato da 6 a 20 query. Con sole 6 ricerche fisse la
// rotazione ripeteva le stesse interrogazioni ogni pochi giorni: i risultati
// erano già tutti in archivio e la deduplica li scartava, quindi la sezione
// Libri risultava ferma (ultimo ingresso 06/07/2026) pur senza alcun errore.
// Le nuove query coprono i cinque ambiti dell'Osservatorio e alternano
// italiano e inglese sulle tre API.
var _PUB_QUERIES_ = [
  { api: 'openlibrary',  q: 'museologia patrimonio culturale museo' },
  { api: 'openalex',     q: 'museum heritage digital AI Italy' },
  { api: 'crossref',     q: 'cultural heritage accessibility' },
  { api: 'openalex',     q: 'audience engagement community museum' },
  { api: 'openlibrary',  q: 'accessibilita museo inclusione' },
  { api: 'crossref',     q: 'museum digital transformation' },
  // Ambito 1 — identità e narrazione
  { api: 'openlibrary',  q: 'allestimento museale narrazione mostra' },
  { api: 'crossref',     q: 'museum storytelling interpretation exhibition' },
  // Ambito 2 — inclusione e accessibilità
  { api: 'crossref',     q: 'universal design cultural institutions disability' },
  { api: 'openalex',     q: 'sign language easy to read museum accessibility' },
  // Ambito 3 — collezioni, mostre, conservazione
  { api: 'openlibrary',  q: 'conservazione restauro beni culturali' },
  { api: 'openalex',     q: 'collection management provenance digitisation' },
  // Ambito 4 — comunità e welfare culturale
  { api: 'crossref',     q: 'participatory heritage co-creation community' },
  { api: 'openalex',     q: 'culture health wellbeing museums social prescribing' },
  { api: 'openlibrary',  q: 'educazione museale mediazione culturale pubblico' },
  // Ambito 5 — digitale, AI, governance
  { api: 'openalex',     q: 'artificial intelligence galleries libraries archives museums' },
  { api: 'crossref',     q: 'cultural policy governance funding evaluation' },
  { api: 'openlibrary',  q: 'management economia della cultura' },
  // Trasversali
  { api: 'openalex',     q: 'cultural tourism heritage territory regeneration' },
  { api: 'crossref',     q: 'museum visitor studies evaluation impact' }
];

var _PUB_KEYWORDS_ = [
  'museo', 'musei', 'museum', 'museologia', 'patrimonio culturale',
  'heritage', 'accessibilit', 'inclusione', 'audience', 'digitale',
  'lis', 'braille', 'easy to read', 'caa'
];

var _PUB_AMBITI_KEYWORDS_ = {
  1: ['narrazione', 'storytelling', 'identit', 'storia', 'museologia', 'allestimento', 'curatela'],
  2: ['accessibilit', 'inclusione', 'disabilit', 'lis', 'braille', 'easy to read', 'caa', 'barriere', 'universale'],
  3: ['collezioni', 'mostre', 'catalogo', 'conservazione', 'restauro', 'patrimonio'],
  4: ['comunit', 'welfare', 'partecipazione', 'audience', 'coinvolgimento', 'educazione', 'mediazione', 'turismo'],
  5: ['digitale', 'digital', 'ai', 'intelligenza artificiale', 'governance', 'gestione', 'innovazione', 'tecnologi']
};

// ---------------------------------------------------------------------------
// Public: main orchestrator
// ---------------------------------------------------------------------------

/**
 * Main discovery scan. Rotates through query pool, fetches from 3 APIs,
 * normalizes, scores, deduplicates, and writes new publications.
 *
 * @param {Object} [opts] - Options.
 * @param {boolean} [opts.dryRun=false] - If true, skip writing to sheet.
 * @param {number} [opts.limit=15] - Max results per API call.
 * @param {number} [opts.queryCount=3] - How many queries to run this scan.
 * @return {Object} Summary of scan results.
 */
function pubDiscoveryScan(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var limit = opts.limit || 15;
  var queryCount = opts.queryCount || 3;

  Logger.log(_PUB_LOG_PREFIX_ + ' Scan started — dryRun=' + dryRun + ', limit=' + limit);

  var SS = getMainSS();
  var sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) {
    Logger.log(_PUB_LOG_PREFIX_ + ' Sheet "' + SH.LIBRI + '" not found. Creating...');
    setupPubblicazioniSheet();
    sh = SS.getSheetByName(SH.LIBRI);
  }

  // Build dedup index from existing data
  var existingIndex = _pub_buildExistingIndex_(sh);
  Logger.log(_PUB_LOG_PREFIX_ + ' Existing index built — ' + existingIndex.titles.size + ' titles, ' +
    existingIndex.urls.size + ' URLs, ' + existingIndex.ids.size + ' DOI/ISBNs');

  // Select queries for this scan (rotate based on day-of-year)
  var today = new Date();
  var dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  var startIdx = (dayOfYear * queryCount) % _PUB_QUERIES_.length;

  var allItems = [];
  var apiCalls = 0;
  var errors = [];

  for (var qi = 0; qi < queryCount; qi++) {
    var queryDef = _PUB_QUERIES_[(startIdx + qi) % _PUB_QUERIES_.length];
    Logger.log(_PUB_LOG_PREFIX_ + ' Query ' + (qi + 1) + '/' + queryCount + ': [' + queryDef.api + '] "' + queryDef.q + '"');

    try {
      var rawResults = [];
      if (queryDef.api === 'openlibrary') {
        rawResults = _pub_fetchOpenLibrary_(queryDef.q, limit);
      } else if (queryDef.api === 'crossref') {
        rawResults = _pub_fetchCrossref_(queryDef.q, limit);
      } else if (queryDef.api === 'openalex') {
        rawResults = _pub_fetchOpenAlex_(queryDef.q, limit);
      }
      apiCalls++;
      Logger.log(_PUB_LOG_PREFIX_ + ' Got ' + rawResults.length + ' raw results from ' + queryDef.api);

      for (var ri = 0; ri < rawResults.length; ri++) {
        var normalized = _pub_normalize_(rawResults[ri], queryDef.api);
        if (normalized && normalized.titolo) {
          allItems.push(normalized);
        }
      }
    } catch (e) {
      var errMsg = queryDef.api + ': ' + e.message;
      errors.push(errMsg);
      Logger.log(_PUB_LOG_PREFIX_ + ' ERROR — ' + errMsg);
    }

    // Polite delay between API calls
    if (qi < queryCount - 1) {
      Utilities.sleep(500);
    }
  }

  Logger.log(_PUB_LOG_PREFIX_ + ' Total normalized items: ' + allItems.length);

  // Score and filter
  var scored = [];
  for (var si = 0; si < allItems.length; si++) {
    var item = allItems[si];
    item.score = _pub_qualityScore_(item);
    item.ambito = _pub_inferAmbito_(item);
    if (item.score >= _PUB_SCORE_THRESHOLD_) {
      scored.push(item);
    }
  }
  Logger.log(_PUB_LOG_PREFIX_ + ' Items above threshold (' + _PUB_SCORE_THRESHOLD_ + '): ' + scored.length);

  // Deduplicate against existing sheet content
  var newItems = [];
  var dupCount = 0;
  for (var di = 0; di < scored.length; di++) {
    if (_pub_isDuplicate_(scored[di], existingIndex)) {
      dupCount++;
    } else {
      newItems.push(scored[di]);
    }
  }
  Logger.log(_PUB_LOG_PREFIX_ + ' After dedup: ' + newItems.length + ' new, ' + dupCount + ' duplicates skipped');

  // Optional Claude Haiku relevance filter
  // Reads PUB_CLAUDE_FILTER_ENABLED from ScriptProperties; falls back to _PUB_CLAUDE_FILTER_DEFAULT_.
  var claudeFilterEnabled = _PUB_CLAUDE_FILTER_DEFAULT_;
  try {
    var cfeProp = PropertiesService.getScriptProperties().getProperty('PUB_CLAUDE_FILTER_ENABLED');
    if (cfeProp !== null) claudeFilterEnabled = (cfeProp === 'true');
  } catch(e) { /* ignore — ScriptProperties unavailable */ }

  var claudeFiltered = 0;
  if (claudeFilterEnabled && newItems.length > 0) {
    var preFilter = newItems.length;
    newItems = _pub_claudeFilter_(newItems);
    claudeFiltered = preFilter - newItems.length;
    Logger.log(_PUB_LOG_PREFIX_ + ' Claude filter: ' + preFilter + ' in → ' + newItems.length + ' out (' + claudeFiltered + ' filtered out)');
  }

  // Write to sheet
  var written = 0;
  if (!dryRun && newItems.length > 0) {
    written = _pub_writeToSheet_(sh, newItems);
    Logger.log(_PUB_LOG_PREFIX_ + ' Written ' + written + ' new rows');
  } else if (dryRun) {
    Logger.log(_PUB_LOG_PREFIX_ + ' DRY RUN — would write ' + newItems.length + ' rows');
    written = 0;
  }

  // Store scan result in PropertiesService for status reporting
  var summary = {
    timestamp: today.toISOString(),
    dryRun: dryRun,
    apiCalls: apiCalls,
    totalFetched: allItems.length,
    aboveThreshold: scored.length,
    duplicates: dupCount,
    claudeFilterEnabled: claudeFilterEnabled,
    claudeFiltered: claudeFiltered,
    written: dryRun ? 0 : written,
    wouldWrite: dryRun ? newItems.length : 0,
    errors: errors,
    newItems: newItems.map(function(it) { return { titolo: it.titolo, score: it.score, fonte: it.fonte }; })
  };

  try {
    PropertiesService.getScriptProperties().setProperty(
      'PUB_DISCOVERY_LAST_SCAN', JSON.stringify(summary)
    );
  } catch (e) {
    Logger.log(_PUB_LOG_PREFIX_ + ' Could not save scan summary to properties: ' + e.message);
  }

  Logger.log(_PUB_LOG_PREFIX_ + ' Scan complete. Summary: ' + JSON.stringify(summary));
  return summary;
}

// ---------------------------------------------------------------------------
// Public: test (dry run)
// ---------------------------------------------------------------------------

/**
 * Test scan without writing. Run from GAS editor to verify API connectivity
 * and result quality.
 */
function pubDiscoveryTest() {
  return pubDiscoveryScan({ dryRun: true });
}

// ---------------------------------------------------------------------------
// Public: setup weekly trigger (Monday 05:00)
// ---------------------------------------------------------------------------

/**
 * Creates a time-driven trigger to run pubDiscoveryScan every Monday at 05:00.
 * Idempotent: removes existing PubDiscovery triggers before creating.
 */
function pubDiscoverySetupTrigger() {
  // Remove existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pubDiscoveryScan') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log(_PUB_LOG_PREFIX_ + ' Removed existing trigger');
    }
  }

  ScriptApp.newTrigger('pubDiscoveryScan')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(5)
    .create();

  Logger.log(_PUB_LOG_PREFIX_ + ' Trigger created: Monday 05:00');
  return { status: 'ok', schedule: 'Monday 05:00' };
}

// ---------------------------------------------------------------------------
// Public: status report
// ---------------------------------------------------------------------------

/**
 * Returns the result of the last scan, or a message if no scan has been run.
 */
function pubDiscoveryStatus() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('PUB_DISCOVERY_LAST_SCAN');
    if (!raw) {
      Logger.log(_PUB_LOG_PREFIX_ + ' No scan has been run yet');
      return { status: 'no_scan', message: 'No scan has been run yet.' };
    }
    var data = JSON.parse(raw);
    Logger.log(_PUB_LOG_PREFIX_ + ' Last scan: ' + data.timestamp + ' — written=' + data.written);
    return data;
  } catch (e) {
    Logger.log(_PUB_LOG_PREFIX_ + ' Error reading status: ' + e.message);
    return { status: 'error', message: e.message };
  }
}

// ---------------------------------------------------------------------------
// Private: API fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch from Open Library search API.
 * @param {string} q - Search query.
 * @param {number} limit - Max results.
 * @return {Array<Object>} Raw result objects.
 */
function _pub_fetchOpenLibrary_(q, limit) {
  var url = 'https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&limit=' + limit;
  Logger.log(_PUB_LOG_PREFIX_ + ' GET ' + url);

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, deadline: 15 });
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('OpenLibrary returned HTTP ' + code);
  }

  var json = JSON.parse(response.getContentText());
  var docs = json.docs || [];
  var results = [];

  for (var i = 0; i < docs.length; i++) {
    var d = docs[i];
    var isbn = (d.isbn && d.isbn.length > 0) ? d.isbn[0] : '';
    var coverId = d.cover_i ? d.cover_i : '';
    var coverUrl = coverId ? 'https://covers.openlibrary.org/b/id/' + coverId + '-M.jpg' : '';

    results.push({
      _source: 'openlibrary',
      title: d.title || '',
      author: (d.author_name && d.author_name.length > 0) ? d.author_name.join(', ') : '',
      publisher: (d.publisher && d.publisher.length > 0) ? d.publisher[0] : '',
      year: d.first_publish_year || '',
      isbn: isbn,
      doi: '',
      url: d.key ? 'https://openlibrary.org' + d.key : '',
      cover: coverUrl,
      description: (d.subtitle || ''),
      subject: (d.subject && d.subject.length > 0) ? d.subject.slice(0, 5).join(', ') : ''
    });
  }

  return results;
}

/**
 * Fetch from Crossref works API.
 * @param {string} q - Search query.
 * @param {number} limit - Max results.
 * @return {Array<Object>} Raw result objects.
 */
function _pub_fetchCrossref_(q, limit) {
  var url = 'https://api.crossref.org/works?query=' + encodeURIComponent(q) +
    '&rows=' + limit + '&mailto=' + _PUB_MAILTO_;
  Logger.log(_PUB_LOG_PREFIX_ + ' GET ' + url);

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, deadline: 15 });
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Crossref returned HTTP ' + code);
  }

  var json = JSON.parse(response.getContentText());
  var items = (json.message && json.message.items) ? json.message.items : [];
  var results = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];

    // Extract first author or 'AA.VV.'
    var authorStr = 'AA.VV.';
    if (it.author && it.author.length > 0) {
      var names = [];
      for (var a = 0; a < Math.min(it.author.length, 3); a++) {
        var au = it.author[a];
        var name = '';
        if (au.given) name += au.given + ' ';
        if (au.family) name += au.family;
        if (name.trim()) names.push(name.trim());
      }
      if (names.length > 0) authorStr = names.join(', ');
      if (it.author.length > 3) authorStr += ' et al.';
    }

    // Extract title
    var title = '';
    if (it.title && it.title.length > 0) title = it.title[0];

    // Extract year from published-print or published-online or created
    var year = '';
    var dateParts = null;
    if (it['published-print'] && it['published-print']['date-parts']) {
      dateParts = it['published-print']['date-parts'];
    } else if (it['published-online'] && it['published-online']['date-parts']) {
      dateParts = it['published-online']['date-parts'];
    } else if (it.created && it.created['date-parts']) {
      dateParts = it.created['date-parts'];
    }
    if (dateParts && dateParts[0] && dateParts[0][0]) {
      year = dateParts[0][0];
    }

    // Publisher / container
    var publisher = it.publisher || '';
    var container = (it['container-title'] && it['container-title'].length > 0)
      ? it['container-title'][0] : '';

    // ISBN
    var isbn = '';
    if (it.ISBN && it.ISBN.length > 0) isbn = it.ISBN[0];

    // URL
    var url2 = it.URL || (it.DOI ? 'https://doi.org/' + it.DOI : '');

    results.push({
      _source: 'crossref',
      title: title,
      author: authorStr,
      publisher: publisher || container,
      year: year,
      isbn: isbn,
      doi: it.DOI || '',
      url: url2,
      cover: '',
      description: it.abstract ? it.abstract.replace(/<[^>]*>/g, '').substring(0, 500) : '',
      subject: (it.subject && it.subject.length > 0) ? it.subject.slice(0, 5).join(', ') : ''
    });
  }

  return results;
}

/**
 * Fetch from OpenAlex works API.
 * @param {string} q - Search query.
 * @param {number} limit - Max results.
 * @return {Array<Object>} Raw result objects.
 */
function _pub_fetchOpenAlex_(q, limit) {
  var url = 'https://api.openalex.org/works?search=' + encodeURIComponent(q) +
    '&per-page=' + limit + '&mailto=' + _PUB_MAILTO_;
  Logger.log(_PUB_LOG_PREFIX_ + ' GET ' + url);

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, deadline: 15 });
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('OpenAlex returned HTTP ' + code);
  }

  var json = JSON.parse(response.getContentText());
  var works = json.results || [];
  var results = [];

  for (var i = 0; i < works.length; i++) {
    var w = works[i];

    // Authors
    var authorStr = 'AA.VV.';
    if (w.authorships && w.authorships.length > 0) {
      var names = [];
      for (var a = 0; a < Math.min(w.authorships.length, 3); a++) {
        var aship = w.authorships[a];
        if (aship.author && aship.author.display_name) {
          names.push(aship.author.display_name);
        }
      }
      if (names.length > 0) authorStr = names.join(', ');
      if (w.authorships.length > 3) authorStr += ' et al.';
    }

    // Title
    var title = w.title || w.display_name || '';

    // Year
    var year = w.publication_year || '';

    // Publisher from primary_location or host_venue
    var publisher = '';
    if (w.primary_location && w.primary_location.source) {
      publisher = w.primary_location.source.display_name || '';
    }

    // DOI
    var doi = w.doi || '';
    // Remove https://doi.org/ prefix if present for consistent storage
    var doiClean = doi.replace('https://doi.org/', '');

    // URL: prefer DOI landing page, then OpenAlex page
    var url2 = doi || (w.id || '');

    // Open access PDF
    var oaPdf = '';
    if (w.open_access && w.open_access.oa_url) {
      oaPdf = w.open_access.oa_url;
    }

    results.push({
      _source: 'openalex',
      title: title,
      author: authorStr,
      publisher: publisher,
      year: year,
      isbn: '',
      doi: doiClean,
      url: url2,
      cover: '',
      description: '',
      subject: '',
      oaPdf: oaPdf
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Private: normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a raw API result to the Pubblicazioni sheet schema.
 * Schema: ID | Titolo | Autore | Editore | Anno | Ambito | Tematica |
 *         Descrizione | Link | Copertina_URL | DataAggiunta | Fonte |
 *         Stato | Score | Letto | Salvato
 *
 * @param {Object} raw - Raw result from an API fetcher.
 * @param {string} fonte - API source name.
 * @return {Object|null} Normalized item or null if unusable.
 */
function _pub_normalize_(raw, fonte) {
  if (!raw || !raw.title || raw.title.trim().length < 3) return null;

  var titolo = raw.title.trim();
  // Clean up HTML entities that sometimes appear in titles
  titolo = titolo.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

  // Truncate very long titles (some Crossref entries have multi-paragraph titles)
  if (titolo.length > 300) titolo = titolo.substring(0, 297) + '...';

  var anno = '';
  if (raw.year) {
    anno = parseInt(raw.year, 10);
    if (isNaN(anno) || anno < 1800 || anno > 2030) anno = '';
  }

  var link = raw.url || '';
  if (!link && raw.oaPdf) link = raw.oaPdf;

  var descrizione = raw.description || '';
  if (!descrizione && raw.subject) descrizione = raw.subject;
  // Clean HTML from Crossref abstracts
  descrizione = descrizione.replace(/<[^>]*>/g, '').trim();
  if (descrizione.length > 500) descrizione = descrizione.substring(0, 497) + '...';

  var fonteLabel = 'API-' + fonte;

  return {
    titolo: titolo,
    autore: raw.author || '',
    editore: raw.publisher || '',
    anno: anno,
    tematica: raw.subject || '',
    descrizione: descrizione,
    link: link,
    copertina: raw.cover || '',
    fonte: fonteLabel,
    doi: raw.doi || '',
    isbn: raw.isbn || '',
    // These will be set later
    ambito: '',
    score: 0
  };
}

// ---------------------------------------------------------------------------
// Private: quality scoring
// ---------------------------------------------------------------------------

/**
 * Compute a quality score 0-100 based on keyword matches, field completeness,
 * and recency.
 *
 * @param {Object} item - Normalized item.
 * @return {number} Score 0-100.
 */
function _pub_qualityScore_(item) {
  var score = 0;

  // Build a searchable text blob (lowercase)
  var blob = [
    item.titolo, item.autore, item.editore, item.tematica, item.descrizione
  ].join(' ').toLowerCase();

  // --- Keyword relevance (max 50 points) ---
  var keywordHits = 0;
  for (var ki = 0; ki < _PUB_KEYWORDS_.length; ki++) {
    if (blob.indexOf(_PUB_KEYWORDS_[ki]) !== -1) {
      keywordHits++;
    }
  }
  // Each keyword hit = 5 points, max 50
  score += Math.min(keywordHits * 5, 50);

  // --- Field completeness (max 25 points) ---
  if (item.titolo && item.titolo.length > 5) score += 5;
  if (item.autore && item.autore.length > 2 && item.autore !== 'AA.VV.') score += 5;
  if (item.editore && item.editore.length > 2) score += 5;
  if (item.link && item.link.length > 10) score += 5;
  if (item.descrizione && item.descrizione.length > 20) score += 5;

  // --- Recency (max 15 points) ---
  if (item.anno) {
    var currentYear = new Date().getFullYear();
    var age = currentYear - item.anno;
    if (age <= 1) score += 15;
    else if (age <= 3) score += 12;
    else if (age <= 5) score += 8;
    else if (age <= 10) score += 4;
    // Older than 10 years: 0 recency points
  }

  // --- Cover image bonus (max 5 points) ---
  if (item.copertina && item.copertina.length > 10) score += 5;

  // --- DOI/ISBN bonus (max 5 points) ---
  if (item.doi || item.isbn) score += 5;

  // Clamp
  return Math.min(Math.max(score, 0), 100);
}

// ---------------------------------------------------------------------------
// Private: ambito inference
// ---------------------------------------------------------------------------

/**
 * Infer ambito (1-5) from item text using keyword matching.
 * Returns the ambito ID with the most keyword hits, or '' if none match.
 *
 * @param {Object} item - Normalized item.
 * @return {number|string} Ambito ID (1-5) or ''.
 */
function _pub_inferAmbito_(item) {
  var blob = [
    item.titolo, item.autore, item.tematica, item.descrizione
  ].join(' ').toLowerCase();

  var bestAmbito = '';
  var bestCount = 0;

  for (var ambitoId in _PUB_AMBITI_KEYWORDS_) {
    var keywords = _PUB_AMBITI_KEYWORDS_[ambitoId];
    var count = 0;
    for (var ki = 0; ki < keywords.length; ki++) {
      if (blob.indexOf(keywords[ki]) !== -1) {
        count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestAmbito = parseInt(ambitoId, 10);
    }
  }

  return bestCount > 0 ? bestAmbito : '';
}

// ---------------------------------------------------------------------------
// Private: deduplication
// ---------------------------------------------------------------------------

/**
 * Build a dedup index from existing Pubblicazioni sheet data.
 * Three levels: DOI/ISBN, URL, title fingerprint.
 *
 * @param {Sheet} sh - The Pubblicazioni sheet.
 * @return {Object} Index with .ids (Set), .urls (Set), .titles (Set).
 */
function _pub_buildExistingIndex_(sh) {
  var index = {
    ids: new Set(),
    urls: new Set(),
    titles: new Set()
  };

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return index;

  var data = sh.getRange(2, 1, lastRow - 1, LIBRI_HEADERS.length).getValues();

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    // Schema: ID(0) | Titolo(1) | Autore(2) | Editore(3) | Anno(4) | Ambito(5) |
    //         Tematica(6) | Descrizione(7) | Link(8) | Copertina_URL(9) |
    //         DataAggiunta(10) | Fonte(11) | Stato(12) | Score(13) | Letto(14) | Salvato(15)

    var titolo = String(row[1] || '');
    var link = String(row[8] || '');
    var id = String(row[0] || '');

    // Title fingerprint
    if (titolo) {
      index.titles.add(_pub_titleFingerprint_(titolo));
    }

    // URL
    if (link && link.length > 5) {
      index.urls.add(link.toLowerCase().trim());
    }

    // DOI/ISBN — look in ID field (may contain DOI) and link (may contain DOI URL)
    if (id) {
      index.ids.add(id.toLowerCase().trim());
    }
    // Extract DOI from link if present
    var doiMatch = link.match(/10\.\d{4,9}\/[^\s]+/);
    if (doiMatch) {
      index.ids.add(doiMatch[0].toLowerCase());
    }
  }

  return index;
}

/**
 * Check if an item is a duplicate against the existing index.
 * Three levels checked in order: DOI/ISBN, URL, title fingerprint.
 *
 * @param {Object} item - Normalized item.
 * @param {Object} index - Dedup index from _pub_buildExistingIndex_.
 * @return {boolean} True if duplicate.
 */
function _pub_isDuplicate_(item, index) {
  // Level 1: DOI or ISBN
  if (item.doi && item.doi.length > 3) {
    var doiLower = item.doi.toLowerCase().replace('https://doi.org/', '');
    if (index.ids.has(doiLower)) return true;
  }
  if (item.isbn && item.isbn.length > 5) {
    if (index.ids.has(item.isbn.toLowerCase().trim())) return true;
  }

  // Level 2: URL
  if (item.link && item.link.length > 5) {
    if (index.urls.has(item.link.toLowerCase().trim())) return true;
  }

  // Level 3: Title fingerprint
  if (item.titolo) {
    var fp = _pub_titleFingerprint_(item.titolo);
    if (fp.length > 3 && index.titles.has(fp)) return true;
  }

  return false;
}

/**
 * Create a normalized fingerprint from a title for fuzzy dedup.
 * Lowercase, strip punctuation, sort words alphabetically, join with _.
 *
 * @param {string} title - Publication title.
 * @return {string} Fingerprint.
 */
function _pub_titleFingerprint_(title) {
  if (!title) return '';
  var clean = title.toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F]/g, '')  // keep letters (incl. accented) and spaces
    .replace(/\s+/g, ' ')
    .trim();
  var words = clean.split(' ').filter(function(w) { return w.length > 1; });
  words.sort();
  return words.join('_');
}

// ---------------------------------------------------------------------------
// Private: Claude Haiku relevance filter
// ---------------------------------------------------------------------------

/**
 * Optional Claude Haiku filter. Takes up to _PUB_CLAUDE_BATCH_SIZE_ items
 * (highest keyword score first), sends all titles+descriptions in ONE prompt,
 * and returns only those whose Claude relevance score >= _PUB_CLAUDE_SCORE_THRESHOLD_.
 *
 * Graceful degradation: if CLAUDE_API_KEY is missing, daily cap is exceeded,
 * or the API call fails, the function returns the input unchanged so the scan
 * can continue with the keyword-scored list.
 *
 * @param {Array<Object>} items - Normalized, deduped items (all passing keyword threshold).
 * @return {Array<Object>} Filtered items (unchanged if filter is skipped/fails).
 */
function _pub_claudeFilter_(items) {
  // --- Guard: API key ---
  var apiKey = '';
  try { apiKey = (typeof _claudeKey_ === 'function') ? _claudeKey_() : ''; } catch(e) { apiKey = ''; }
  if (!apiKey) {
    Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] SKIP — CLAUDE_API_KEY not set');
    return items;
  }

  // --- Guard: daily cap (stored as "YYYY-MM-DD:count" in ScriptProperties) ---
  var today = new Date();
  var dateKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  var capPropKey = _PUB_CLAUDE_CAP_PROP_ + dateKey;
  var callsToday = 0;
  try {
    callsToday = parseInt(PropertiesService.getScriptProperties().getProperty(capPropKey) || '0', 10);
  } catch(e) { callsToday = 0; }

  if (callsToday >= _PUB_CLAUDE_DAILY_CAP_) {
    Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] SKIP — daily cap reached (' + callsToday + '/' + _PUB_CLAUDE_DAILY_CAP_ + ')');
    return items;
  }

  // --- Sort by keyword score desc, take top batch ---
  var batch = items.slice().sort(function(a, b) { return b.score - a.score; });
  batch = batch.slice(0, _PUB_CLAUDE_BATCH_SIZE_);

  // Items outside the batch pass through automatically (already lower-scored)
  var remainder = items.slice(_PUB_CLAUDE_BATCH_SIZE_);

  // --- Build prompt ---
  // One JSON array of {i, titolo, descrizione} → Claude returns [{i, score, reason}]
  var inputArr = [];
  for (var bi = 0; bi < batch.length; bi++) {
    var it = batch[bi];
    inputArr.push({
      i: bi,
      titolo: (it.titolo || '').substring(0, 200),
      descrizione: (it.descrizione || '').substring(0, 300)
    });
  }

  var systemPrompt = 'Sei un esperto di museologia e patrimonio culturale italiano. '
    + 'Valuti la rilevanza di pubblicazioni accademiche e professionali per professionisti di musei, '
    + 'con focus su: museologia, accessibilita, audience development, heritage digitale, '
    + 'inclusione, patrimonio culturale, tecnologie per i musei.';

  var userPrompt = 'Valuta la rilevanza di queste pubblicazioni per un osservatorio di cultura e musei.\n\n'
    + 'Per ogni pubblicazione assegna:\n'
    + '- score: intero 0-100 (0=irrilevante, 100=perfettamente pertinente)\n'
    + '- reason: stringa breve (max 60 caratteri) che spiega il punteggio\n\n'
    + 'Rispondi SOLO con un JSON array, nessun testo esterno:\n'
    + '[{"i":0,"score":75,"reason":"..."},{"i":1,"score":30,"reason":"..."},...]\n\n'
    + 'Input:\n' + JSON.stringify(inputArr);

  // --- Call API ---
  try {
    Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] Calling API — batch size: ' + batch.length);
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: OC_CLAUDE_MODEL,
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      muteHttpExceptions: true,
      deadline: 30
    });

    var code = resp.getResponseCode();

    // Rate-limited: skip filter
    if (code === 429) {
      Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] SKIP — HTTP 429 rate limit from Anthropic API');
      return items;
    }

    if (code !== 200) {
      Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] SKIP — HTTP ' + code);
      return items;
    }

    // Increment daily cap counter
    try {
      PropertiesService.getScriptProperties().setProperty(capPropKey, String(callsToday + 1));
    } catch(e) { /* ignore */ }

    // Parse response
    var body = JSON.parse(resp.getContentText());
    var text = (body.content && body.content[0] && body.content[0].text) || '[]';

    // Extract JSON array (Claude sometimes wraps in markdown fences)
    var m = text.match(/\[[\s\S]*\]/);
    if (!m) {
      Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] Could not extract JSON array from response — using all batch items');
      return items;
    }

    var results = JSON.parse(m[0]);

    // Build score lookup {index -> claudeScore}
    var scoreMap = {};
    for (var ri = 0; ri < results.length; ri++) {
      var r = results[ri];
      if (typeof r.i !== 'undefined' && typeof r.score === 'number') {
        scoreMap[r.i] = { score: r.score, reason: r.reason || '' };
      }
    }

    // Filter batch: keep items whose Claude score >= threshold
    var kept = [];
    for (var ki = 0; ki < batch.length; ki++) {
      var claudeResult = scoreMap[ki];
      var claudeScore = claudeResult ? claudeResult.score : -1;
      if (claudeScore < 0) {
        // Claude didn't score this item — keep it (safe default)
        Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] Item ' + ki + ' not scored — keeping: "' + batch[ki].titolo + '"');
        kept.push(batch[ki]);
      } else if (claudeScore >= _PUB_CLAUDE_SCORE_THRESHOLD_) {
        batch[ki].claudeScore = claudeScore;
        batch[ki].claudeReason = claudeResult.reason;
        kept.push(batch[ki]);
        Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] PASS ' + claudeScore + ' — "' + batch[ki].titolo + '" (' + claudeResult.reason + ')');
      } else {
        Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] DROP ' + claudeScore + ' — "' + batch[ki].titolo + '" (' + claudeResult.reason + ')');
      }
    }

    // Combine kept (from batch) + remainder (items beyond batch size, pass through)
    Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] Batch: ' + batch.length + ' in → ' + kept.length + ' kept; remainder (auto-pass): ' + remainder.length);
    return kept.concat(remainder);

  } catch (e) {
    Logger.log(_PUB_LOG_PREFIX_ + ' [Claude filter] ERROR — ' + e.message + ' — returning all items unfiltered');
    return items;
  }
}

// ---------------------------------------------------------------------------
// Private: write to sheet
// ---------------------------------------------------------------------------

/**
 * Write new items to the Pubblicazioni sheet using appendRow.
 * ID format: 'API' + timestamp.
 *
 * @param {Sheet} sh - The Pubblicazioni sheet.
 * @param {Array<Object>} items - Normalized, scored, deduplicated items.
 * @return {number} Number of rows written.
 */
function _pub_writeToSheet_(sh, items) {
  var written = 0;
  var now = new Date();

  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    // Generate unique ID: API + timestamp + index
    var ts = now.getTime().toString(36).toUpperCase();
    var id = 'API' + ts + String(i).padStart(2, '0');

    // Map ambito number to label for consistency with existing data
    var ambitoVal = item.ambito || '';

    var row = [
      id,                     // ID
      item.titolo,            // Titolo
      item.autore,            // Autore
      item.editore,           // Editore
      item.anno,              // Anno
      ambitoVal,              // Ambito
      item.tematica,          // Tematica
      item.descrizione,       // Descrizione
      item.link,              // Link
      item.copertina,         // Copertina_URL
      now,                    // DataAggiunta
      item.fonte,             // Fonte
      'attivo',               // Stato
      item.score,             // Score
      false,                  // Letto
      false                   // Salvato
    ];

    try {
      sh.appendRow(row);
      written++;
    } catch (e) {
      Logger.log(_PUB_LOG_PREFIX_ + ' Error writing row "' + item.titolo + '": ' + e.message);
    }
  }

  return written;
}
