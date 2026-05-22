/**
 * ============================================================================
 *  AgentSetup.js — Setup fogli e seed fonti per sistema multi-agente (v4.18.55)
 * ----------------------------------------------------------------------------
 *  Funzioni one-shot per creare struttura dati agenti.
 *  Eseguire dall'editor GAS una volta sola.
 *
 *  Funzioni:
 *    setupFontiAgenti()    — crea foglio FontiAgenti + popola da fonti esistenti
 *    setupProfiloAgenti()  — crea foglio ProfiloAgenti
 *    seedFontiNormativa()  — aggiunge 12 fonti AG2 (normativa)
 *    seedFontiWelfare()    — aggiunge 12 fonti AG4 (welfare/accessibilita)
 *    seedFontiDigital()    — aggiunge 11 fonti AG5 (digital/AI)
 * ============================================================================
 */

var FONTI_AGENTI_SHEET = 'FontiAgenti';
var PROFILO_AGENTI_SHEET = 'ProfiloAgenti';

var FONTI_AGENTI_HEADERS = [
  'ID', 'Nome', 'URL', 'RSS_URL', 'Agente', 'Tipo', 'Categoria',
  'Priorita', 'Attiva', 'DataAggiunta', 'UltimaScan', 'UltimoHash',
  'UltimoEsito', 'NRecordTotali', 'FailConsecutivi', 'Note'
];

var PROFILO_AGENTI_HEADERS = [
  'ResponseID', 'Email', 'NomeMuseo',
  'OptIn_AG1', 'OptIn_AG2', 'OptIn_AG3', 'OptIn_AG4', 'OptIn_AG5',
  'Freq_AG1', 'Freq_AG2', 'Freq_AG3', 'Freq_AG4', 'Freq_AG5',
  'UltimoInvio_AG1', 'UltimoInvio_AG2', 'UltimoInvio_AG3', 'UltimoInvio_AG4', 'UltimoInvio_AG5',
  'ScoreEngagement', 'DataCreazione', 'DataAggiornamento'
];

// ============================================================================
// SETUP FOGLIO FONTIAGENTI
// ============================================================================

function setupFontiAgenti() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTI_AGENTI_SHEET);
  if (sh) {
    Logger.log('Foglio ' + FONTI_AGENTI_SHEET + ' esiste gia. Nessuna azione.');
    return { ok: true, action: 'exists', rows: sh.getLastRow() - 1 };
  }

  sh = ss.insertSheet(FONTI_AGENTI_SHEET);
  sh.getRange(1, 1, 1, FONTI_AGENTI_HEADERS.length).setValues([FONTI_AGENTI_HEADERS]);
  sh.getRange(1, 1, 1, FONTI_AGENTI_HEADERS.length).setFontWeight('bold').setBackground('#E8EAF6');
  sh.setFrozenRows(1);

  // Popola con fonti bandi esistenti (AG1)
  var countAG1 = _seedFromExistingBandi_(sh);

  // Popola con fonti news RSS esistenti (AG3/AG5)
  var countNews = _seedFromExistingNews_(sh);

  Logger.log('FontiAgenti creato: ' + countAG1 + ' fonti bandi (AG1), ' + countNews + ' fonti news (AG3/AG5)');
  return { ok: true, action: 'created', fontiAG1: countAG1, fontiNews: countNews };
}

function _seedFromExistingBandi_(sh) {
  // Importa TUTTE_LE_FONTI_BANDI da Scannerbandi.js (se disponibile a runtime)
  if (typeof TUTTE_LE_FONTI_BANDI === 'undefined') {
    Logger.log('TUTTE_LE_FONTI_BANDI non disponibile — skip seed bandi');
    return 0;
  }
  var count = 0;
  var now = new Date().toISOString();
  TUTTE_LE_FONTI_BANDI.forEach(function(f, i) {
    var id = 'FA-B' + String(i + 1).padStart(3, '0');
    var categoria = _detectCategoriaBandi_(f);
    sh.appendRow([
      id, f.nome, f.url, '', 1, 'HTML', categoria,
      f.priorita || 2, true, now, '', '', '', 0, 0, f.livello || ''
    ]);
    count++;
  });
  return count;
}

function _seedFromExistingNews_(sh) {
  var allNews = [];
  if (typeof FONTI_NEWS_ISTITUZIONALI !== 'undefined') allNews = allNews.concat(FONTI_NEWS_ISTITUZIONALI);
  if (typeof FONTI_AI_CULTURA !== 'undefined') allNews = allNews.concat(FONTI_AI_CULTURA);
  if (typeof FONTI_ARTICOLI_ARTE !== 'undefined') allNews = allNews.concat(FONTI_ARTICOLI_ARTE);
  if (allNews.length === 0) {
    Logger.log('Fonti news non disponibili a runtime — skip seed news');
    return 0;
  }
  var count = 0;
  var now = new Date().toISOString();
  allNews.forEach(function(f, i) {
    var id = 'FA-N' + String(i + 1).padStart(3, '0');
    var agente = _detectAgenteNews_(f);
    sh.appendRow([
      id, f.nome, f.url, f.url, agente, 'RSS', f.ambito || 'generale',
      f.priorita || 2, true, now, '', '', '', 0, 0, ''
    ]);
    count++;
  });
  return count;
}

function _detectCategoriaBandi_(fonte) {
  var nome = (fonte.nome || '').toLowerCase();
  if (nome.indexOf('mic') >= 0 || nome.indexOf('ministero') >= 0 || nome.indexOf('anci') >= 0 || nome.indexOf('pnrr') >= 0 || nome.indexOf('invitalia') >= 0) return 'ministero';
  if (nome.indexOf('regione') >= 0 || nome.indexOf('puglia') >= 0 || nome.indexOf('marche') >= 0 || nome.indexOf('umbria') >= 0 || nome.indexOf('sardegna') >= 0 || nome.indexOf('emilia') >= 0 || nome.indexOf('art-er') >= 0) return 'regione';
  if (nome.indexOf('europa') >= 0 || nome.indexOf('creativa') >= 0 || nome.indexOf('obiettivo') >= 0) return 'ue';
  if (nome.indexOf('contributi') >= 0 || nome.indexOf('granter') >= 0 || nome.indexOf('indice') >= 0) return 'aggregatore';
  if (nome.indexOf('fondazione') >= 0 || nome.indexOf('cariplo') >= 0 || nome.indexOf('wikimedia') >= 0 || nome.indexOf('compagnia') >= 0) return 'fondazione';
  if (nome.indexOf('icom') >= 0 || nome.indexOf('federculture') >= 0 || nome.indexOf('symbola') >= 0 || nome.indexOf('mab') >= 0 || nome.indexOf('amaci') >= 0 || nome.indexOf('nemo') >= 0 || nome.indexOf('museum') >= 0 || nome.indexOf('fitzcarraldo') >= 0) return 'associazione';
  if (nome.indexOf('giornale') >= 0 || nome.indexOf('artribune') >= 0 || nome.indexOf('tafter') >= 0) return 'rivista';
  return 'altro';
}

function _detectAgenteNews_(fonte) {
  var ambito = (fonte.ambito || '').toLowerCase();
  var nome = (fonte.nome || '').toLowerCase();
  if (ambito.indexOf('ai') >= 0 || ambito.indexOf('digital') >= 0 || nome.indexOf('agenda digitale') >= 0 || nome.indexOf('technology') >= 0 || nome.indexOf('ai news') >= 0) return 5;
  if (ambito.indexOf('welfare') >= 0 || ambito.indexOf('accessib') >= 0 || ambito.indexOf('inclusio') >= 0) return 4;
  if (ambito.indexOf('governance') >= 0 || ambito.indexOf('politiche') >= 0 || ambito.indexOf('gestione') >= 0) return 5;
  if (ambito.indexOf('innovazione') >= 0 || ambito.indexOf('musei') >= 0 || ambito.indexOf('patrimonio') >= 0) return 3;
  return 3; // default: innovazione
}

// ============================================================================
// SETUP FOGLIO PROFILOAGENTI
// ============================================================================

function setupProfiloAgenti() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFILO_AGENTI_SHEET);
  if (sh) {
    Logger.log('Foglio ' + PROFILO_AGENTI_SHEET + ' esiste gia. Nessuna azione.');
    return { ok: true, action: 'exists' };
  }

  sh = ss.insertSheet(PROFILO_AGENTI_SHEET);
  sh.getRange(1, 1, 1, PROFILO_AGENTI_HEADERS.length).setValues([PROFILO_AGENTI_HEADERS]);
  sh.getRange(1, 1, 1, PROFILO_AGENTI_HEADERS.length).setFontWeight('bold').setBackground('#E8F5E9');
  sh.setFrozenRows(1);
  Logger.log('ProfiloAgenti creato con ' + PROFILO_AGENTI_HEADERS.length + ' colonne.');
  return { ok: true, action: 'created' };
}

// ============================================================================
// SEED FONTI AG2 — NORMATIVA (12 fonti nuove)
// ============================================================================

function seedFontiNormativa() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTI_AGENTI_SHEET);
  if (!sh) return { ok: false, error: 'Eseguire prima setupFontiAgenti()' };

  var fonti = [
    { nome: 'MiC - Decreti e Circolari',         url: 'https://cultura.gov.it/comunicati',                                   tipo: 'HTML', cat: 'normativa', pr: 1 },
    { nome: 'SMN - Sistema Museale Nazionale',    url: 'https://musei.beniculturali.it/notizie',                               tipo: 'HTML', cat: 'standard', pr: 1 },
    { nome: 'AGID - Accessibilita digitale',      url: 'https://www.agid.gov.it/it/design-servizi/accessibilita',              tipo: 'HTML', cat: 'normativa', pr: 1 },
    { nome: 'Garante Privacy - Cultura',          url: 'https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/',   tipo: 'HTML', cat: 'normativa', pr: 2 },
    { nome: 'ICOM Italia - Documenti',            url: 'https://www.icom-italia.org/categoria/documenti/',                     tipo: 'HTML', cat: 'standard', pr: 1 },
    { nome: 'ANCI - Normativa EELL',              url: 'https://www.anci.it/categorie/normativa/',                             tipo: 'HTML', cat: 'istituzionale', pr: 2 },
    { nome: 'Gazzetta Ufficiale - Cultura',       url: 'https://www.gazzettaufficiale.it/ricerca/testolibero/0/0/0.5/3',      tipo: 'HTML', cat: 'normativa', pr: 1 },
    { nome: 'Conf. Stato-Regioni - Cultura',      url: 'http://www.statoregioni.it/it/ricerca-provvedimenti/',                tipo: 'HTML', cat: 'istituzionale', pr: 2 },
    { nome: 'NEMO - Policy Updates',              url: 'https://www.ne-mo.org/news.html',                                     tipo: 'HTML', cat: 'standard', pr: 2 },
    { nome: 'UE - AI Act / Digital Services',     url: 'https://digital-strategy.ec.europa.eu/en/policies',                    tipo: 'HTML', cat: 'normativa', pr: 2 },
    { nome: 'Soprintendenza Marche - Circolari',  url: 'https://sabapmarche.cultura.gov.it/',                                  tipo: 'HTML', cat: 'normativa', pr: 2 },
    { nome: 'Soprintendenza Puglia - Circolari',  url: 'https://sabappuglia.cultura.gov.it/',                                  tipo: 'HTML', cat: 'normativa', pr: 2 },
  ];

  var now = new Date().toISOString();
  var added = 0;
  fonti.forEach(function(f, i) {
    var id = 'FA-NRM' + String(i + 1).padStart(3, '0');
    sh.appendRow([id, f.nome, f.url, '', 2, f.tipo, f.cat, f.pr, true, now, '', '', '', 0, 0, 'AG2 normativa']);
    added++;
  });
  Logger.log('Seed AG2 normativa: ' + added + ' fonti aggiunte.');
  return { ok: true, added: added };
}

// ============================================================================
// SEED FONTI AG4 — WELFARE & ACCESSIBILITA (12 fonti nuove)
// ============================================================================

function seedFontiWelfare() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTI_AGENTI_SHEET);
  if (!sh) return { ok: false, error: 'Eseguire prima setupFontiAgenti()' };

  var fonti = [
    { nome: 'CCW - Cultural Welfare Center',       url: 'https://culturalwelfare.center/news/',              tipo: 'HTML', cat: 'welfare', pr: 1 },
    { nome: 'MOI! - Officine Immaginario',         url: 'https://www.museiofficine.it/news/',                tipo: 'HTML', cat: 'welfare', pr: 1 },
    { nome: 'Fondazione Fitzcarraldo - Ricerca',   url: 'https://www.fitzcarraldo.it/ricerca/',             tipo: 'RSS',  cat: 'audience', pr: 1 },
    { nome: 'Museo per Tutti (L\'abilita)',        url: 'https://www.museopertutti.org/news/',               tipo: 'HTML', cat: 'accessibilita', pr: 1 },
    { nome: 'ICOM CECA - Education',              url: 'https://ceca.mini.icom.museum/news/',               tipo: 'HTML', cat: 'audience', pr: 2 },
    { nome: 'ENS - Ente Nazionale Sordi',          url: 'https://www.ens.it/notizie/',                      tipo: 'HTML', cat: 'accessibilita', pr: 2 },
    { nome: 'UICI - Unione Ciechi',                url: 'https://www.uiciechi.it/uilc-news/',               tipo: 'HTML', cat: 'accessibilita', pr: 2 },
    { nome: 'FISH - Superamento Handicap',         url: 'https://www.fishonlus.it/notizie/',                tipo: 'HTML', cat: 'accessibilita', pr: 2 },
    { nome: 'Progetto MiC Accessibilita',          url: 'https://cultura.gov.it/pagina/accessibilita',      tipo: 'HTML', cat: 'accessibilita', pr: 1 },
    { nome: 'Audience Agency (UK)',                url: 'https://www.theaudienceagency.org/news',            tipo: 'HTML', cat: 'audience', pr: 2 },
    { nome: 'Age-Friendly Museum Network',         url: 'https://museumsandaging.org/news/',                tipo: 'HTML', cat: 'welfare', pr: 2 },
    { nome: 'We Are Museums',                      url: 'https://www.wearemuseums.com/blog',                tipo: 'HTML', cat: 'audience', pr: 2 },
  ];

  var now = new Date().toISOString();
  var added = 0;
  fonti.forEach(function(f, i) {
    var id = 'FA-WLF' + String(i + 1).padStart(3, '0');
    sh.appendRow([id, f.nome, f.url, '', 4, f.tipo, f.cat, f.pr, true, now, '', '', '', 0, 0, 'AG4 welfare']);
    added++;
  });
  Logger.log('Seed AG4 welfare: ' + added + ' fonti aggiunte.');
  return { ok: true, added: added };
}

// ============================================================================
// SEED FONTI AG5 — DIGITAL & AI (11 fonti nuove)
// ============================================================================

function seedFontiDigital() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTI_AGENTI_SHEET);
  if (!sh) return { ok: false, error: 'Eseguire prima setupFontiAgenti()' };

  var fonti = [
    { nome: 'MuseWeb',                     url: 'https://www.museweb.net/blog/',                                tipo: 'HTML', cat: 'digital', pr: 1 },
    { nome: 'MCN - Museum Computer Network',url: 'https://mcn.edu/blog/',                                       tipo: 'HTML', cat: 'digital', pr: 1 },
    { nome: 'Europeana Pro Blog',           url: 'https://pro.europeana.eu/news',                                tipo: 'RSS',  cat: 'open_data', pr: 1 },
    { nome: 'CIDOC - Documentation',        url: 'http://cidoc.mini.icom.museum/news/',                          tipo: 'HTML', cat: 'digital', pr: 2 },
    { nome: 'IIIF Community News',          url: 'https://iiif.io/news/',                                        tipo: 'HTML', cat: 'tech', pr: 2 },
    { nome: 'AI4Culture (EU)',              url: 'https://ai4culture.eu/news/',                                   tipo: 'HTML', cat: 'ai', pr: 1 },
    { nome: 'NEMO Digital Updates',         url: 'https://www.ne-mo.org/advocacy/digital-transformation.html',   tipo: 'HTML', cat: 'digital', pr: 1 },
    { nome: 'AgID - PA Digitale Cultura',   url: 'https://www.agid.gov.it/it/notizie',                           tipo: 'HTML', cat: 'digital', pr: 2 },
    { nome: 'Google Arts & Culture Blog',   url: 'https://blog.google/outreach-initiatives/arts-culture/',       tipo: 'HTML', cat: 'ai', pr: 2 },
    { nome: 'Agenda Digitale - PA Cultura', url: 'https://www.agendadigitale.eu/cultura-digitale/feed/',         tipo: 'RSS',  cat: 'digital', pr: 1 },
    { nome: 'Digital Heritage Lab UNESCO',  url: 'https://www.unesco.org/en/digital-heritage',                   tipo: 'HTML', cat: 'digital', pr: 2 },
  ];

  var now = new Date().toISOString();
  var added = 0;
  fonti.forEach(function(f, i) {
    var id = 'FA-DIG' + String(i + 1).padStart(3, '0');
    sh.appendRow([id, f.nome, f.url, '', 5, f.tipo, f.cat, f.pr, true, now, '', '', '', 0, 0, 'AG5 digital']);
    added++;
  });
  Logger.log('Seed AG5 digital: ' + added + ' fonti aggiunte.');
  return { ok: true, added: added };
}

// ============================================================================
// SEED FONTI AG3 — INNOVAZIONE & BEST PRACTICE (12 fonti nuove)
// ============================================================================

function seedFontiInnovazione() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FONTI_AGENTI_SHEET);
  if (!sh) return { ok: false, error: 'Eseguire prima setupFontiAgenti()' };

  var fonti = [
    { nome: 'MuseumNext - Innovation',       url: 'https://www.museumnext.com/articles/',               tipo: 'HTML', cat: 'innovazione', pr: 1 },
    { nome: 'AAM - American Alliance Museums',url: 'https://www.aam-us.org/programs/resource-library/',  tipo: 'HTML', cat: 'best_practice', pr: 1 },
    { nome: 'NEMO - European Museum Org',     url: 'https://www.ne-mo.org/news.html',                   tipo: 'HTML', cat: 'innovazione', pr: 1 },
    { nome: 'Artribune - Musei',              url: 'https://www.artribune.com/category/arti-visive/feed/',tipo: 'RSS', cat: 'musei', pr: 1 },
    { nome: 'Museum of the Future Blog',      url: 'https://museumofthefuture.ae/en/stories',           tipo: 'HTML', cat: 'innovazione', pr: 2 },
    { nome: 'MAXXI - Programma',              url: 'https://www.maxxi.art/events/',                     tipo: 'HTML', cat: 'musei', pr: 2 },
    { nome: 'Musei Italiani - News',          url: 'https://musei-italiani.org/news/',                  tipo: 'HTML', cat: 'musei', pr: 1 },
    { nome: 'Flash Art Italia',               url: 'https://flash---art.it/category/articles/',         tipo: 'HTML', cat: 'musei', pr: 2 },
    { nome: 'Il Giornale dell\'Arte',         url: 'https://www.ilgiornaledellarte.com/news/',          tipo: 'HTML', cat: 'musei', pr: 1 },
    { nome: 'Domus - Arte e Architettura',    url: 'https://www.domusweb.it/it/arte.html',             tipo: 'HTML', cat: 'innovazione', pr: 2 },
    { nome: 'Fondazione Symbola - Ricerche',  url: 'https://www.symbola.net/ricerche/',                 tipo: 'HTML', cat: 'best_practice', pr: 1 },
    { nome: 'Treccani Cultura',               url: 'https://www.treccani.it/magazine/cultura/',         tipo: 'HTML', cat: 'musei', pr: 2 },
  ];

  var now = new Date().toISOString();
  var added = 0;
  fonti.forEach(function(f, i) {
    var id = 'FA-INN' + String(i + 1).padStart(3, '0');
    sh.appendRow([id, f.nome, f.url, '', 3, f.tipo, f.cat, f.pr, true, now, '', '', '', 0, 0, 'AG3 innovazione']);
    added++;
  });
  Logger.log('Seed AG3 innovazione: ' + added + ' fonti aggiunte.');
  return { ok: true, added: added };
}

// ============================================================================
// v4.18.57 (2026-05-16) — ORCHESTRATOR ONE-SHOT: Sprint A attivazione agenti
// ============================================================================

/**
 * Esegue in sequenza tutto il setup dei 5 agenti e ne attiva i trigger.
 *
 * Idempotente: rieseguibile più volte senza side-effects.
 *
 * Sequenza:
 *   1. setupFontiAgenti()       — crea foglio FontiAgenti + seed da fonti storiche
 *   2. setupProfiloAgenti()     — crea foglio ProfiloAgenti
 *   3. seedFontiNormativa()     — +12 fonti AG2
 *   3b. seedFontiInnovazione()  — +12 fonti AG3
 *   4. seedFontiWelfare()       — +12 fonti AG4
 *   5. seedFontiDigital()       — +11 fonti AG5
 *   6. setupAgentTriggers()     — attiva 5 scan automatici (6h/12h/24h)
 *   7. setupAgentEmailTrigger() — attiva digest giornaliero 07:30
 *   8. testAgentScan(1, 2)      — dry-run su AG1 con 2 fonti (verifica Claude API)
 *
 * @return {Object} report dettagliato di ogni step
 */
function setupAgentiCompleto() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    steps: [],
    errors: [],
    nextSteps: []
  };
  var t0 = new Date();

  function _step_(name, fn) {
    var s0 = new Date();
    try {
      var res = fn();
      var dur = (new Date() - s0);
      report.steps.push({
        step: name,
        ok: (res && res.ok !== false),
        durationMs: dur,
        result: res
      });
      Logger.log('✓ ' + name + ' (' + dur + 'ms): ' + JSON.stringify(res));
    } catch(e) {
      var dur2 = (new Date() - s0);
      report.steps.push({ step: name, ok:false, durationMs: dur2, error: (e && e.message) || String(e) });
      report.errors.push(name + ': ' + ((e && e.message) || String(e)));
      report.ok = false;
      Logger.log('✗ ' + name + ' FAIL: ' + ((e && e.message) || e));
    }
  }

  // === FASE 1: SETUP FOGLI ===
  _step_('1_setupFontiAgenti',   function() {
    if (typeof setupFontiAgenti !== 'function') throw new Error('setupFontiAgenti non definita');
    return setupFontiAgenti();
  });
  _step_('2_setupProfiloAgenti', function() {
    if (typeof setupProfiloAgenti !== 'function') throw new Error('setupProfiloAgenti non definita');
    return setupProfiloAgenti();
  });

  // === FASE 2: SEED FONTI ===
  _step_('3_seedFontiNormativa', function() {
    if (typeof seedFontiNormativa !== 'function') throw new Error('seedFontiNormativa non definita');
    return seedFontiNormativa();
  });
  _step_('3b_seedFontiInnovazione', function() {
    if (typeof seedFontiInnovazione !== 'function') throw new Error('seedFontiInnovazione non definita');
    return seedFontiInnovazione();
  });
  _step_('4_seedFontiWelfare',   function() {
    if (typeof seedFontiWelfare !== 'function') throw new Error('seedFontiWelfare non definita');
    return seedFontiWelfare();
  });
  _step_('5_seedFontiDigital',   function() {
    if (typeof seedFontiDigital !== 'function') throw new Error('seedFontiDigital non definita');
    return seedFontiDigital();
  });

  // === FASE 3: TRIGGER ===
  _step_('6_setupAgentTriggers',     function() {
    if (typeof setupAgentTriggers !== 'function') throw new Error('setupAgentTriggers non definita');
    return setupAgentTriggers();
  });
  _step_('7_setupAgentEmailTrigger', function() {
    if (typeof setupAgentEmailTrigger !== 'function') throw new Error('setupAgentEmailTrigger non definita');
    return setupAgentEmailTrigger();
  });

  // === FASE 4: TEST DRY-RUN (verifica Claude API) ===
  // Non blocca il setup se fallisce — solo report.
  try {
    if (typeof testAgentScan === 'function') {
      var s0t = new Date();
      var testRes = testAgentScan(1, 2); // AG1 Bandi, max 2 fonti
      report.steps.push({
        step: '8_testAgentScan',
        ok: true,
        durationMs: (new Date() - s0t),
        result: testRes,
        note: 'dry-run AG1 con 2 fonti, verifica Claude API'
      });
      Logger.log('✓ Test dry-run AG1: ' + JSON.stringify(testRes).substring(0, 300));
    }
  } catch(eT) {
    report.steps.push({ step:'8_testAgentScan', ok:false, error: (eT && eT.message) || String(eT) });
    report.errors.push('testAgentScan: ' + ((eT && eT.message) || eT));
    Logger.log('⚠ Test dry-run fallito (non bloccante): ' + (eT && eT.message));
  }

  // === STATO FINALE ===
  report.totalDurationMs = new Date() - t0;
  report.stepsOk = report.steps.filter(function(s){ return s.ok; }).length;
  report.stepsTotal = report.steps.length;

  // Next steps suggeriti
  if (report.ok) {
    report.nextSteps = [
      'I 5 agenti scaneranno automaticamente nelle prossime 6-24h.',
      'Verifica AgentScanResults: dopo prossima scan, dovrebbero apparire righe.',
      'Profila almeno 1 museo in ProfiloAgenti per ricevere email tematiche (opt-in AG1-AG5 = true).',
      'Lancia testAgentScan(N, 5) per ogni agente N per test individuale rapido.',
      'Lancia previewAgentEmail(1, "tua@email.com") per vedere come arriva l\'email AG1.'
    ];
  } else {
    report.nextSteps = [
      'Risolvi gli errori segnalati in report.errors prima di riprovare.',
      'Se "forbidden": verifica che OC_ADMIN_EMAILS contenga la tua email.',
      'Se "CLAUDE_API_KEY mancante": configura la ScriptProperty.'
    ];
  }

  return report;
}

/**
 * Wrapper diagnostico per ispezionare lo stato del sistema agenti.
 * Da usare in qualsiasi momento dopo setupAgentiCompleto per verifica.
 *
 * @return {Object} { fonti_per_agente, trigger_attivi, risultati_recenti, profilo_musei }
 */
function diagnosticaAgenti() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  var out = { ok:true, timestamp:new Date().toISOString() };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

    // 1) Fonti per agente
    var shF = ss.getSheetByName(FONTI_AGENTI_SHEET);
    var fontiPerAgente = { 1:0, 2:0, 3:0, 4:0, 5:0, attive:0, totali:0 };
    if (shF && shF.getLastRow() > 1) {
      var vals = shF.getDataRange().getValues();
      var h = vals[0];
      var iAg = h.indexOf('Agente'), iAt = h.indexOf('Attiva');
      for (var r = 1; r < vals.length; r++) {
        fontiPerAgente.totali++;
        var ag = Number(vals[r][iAg] || 0);
        var att = vals[r][iAt] === true || String(vals[r][iAt]).toLowerCase() === 'true';
        if (ag >= 1 && ag <= 5) fontiPerAgente[ag]++;
        if (att) fontiPerAgente.attive++;
      }
    }
    out.fonti_per_agente = fontiPerAgente;

    // 2) Trigger attivi
    var triggers = ScriptApp.getProjectTriggers();
    var agentTriggers = triggers.filter(function(t){
      var fn = t.getHandlerFunction();
      return fn.indexOf('scanAgente') === 0 || fn === 'sendAgentEmails';
    }).map(function(t){
      return { fn: t.getHandlerFunction(), tipo: String(t.getEventType()) };
    });
    out.trigger_attivi = agentTriggers;

    // 3) Risultati recenti
    var shR = ss.getSheetByName('AgentScanResults');
    out.risultati_recenti = { totali: 0, ultimi_7gg: 0, esiste: !!shR };
    if (shR && shR.getLastRow() > 1) {
      out.risultati_recenti.totali = shR.getLastRow() - 1;
      // Conta ultimi 7gg
      var vR = shR.getDataRange().getValues();
      var hR = vR[0];
      var iData = hR.indexOf('DataAcquisizione');
      if (iData < 0) iData = hR.indexOf('Data');
      var soglia = new Date(); soglia.setDate(soglia.getDate() - 7);
      var cnt7 = 0;
      for (var rr = 1; rr < vR.length; rr++) {
        var d = vR[rr][iData];
        if (d instanceof Date && d > soglia) cnt7++;
      }
      out.risultati_recenti.ultimi_7gg = cnt7;
    }

    // 4) Profilo musei
    var shP = ss.getSheetByName(PROFILO_AGENTI_SHEET);
    out.profilo_musei = { esiste: !!shP, totali: 0, optin_per_agente: { 1:0, 2:0, 3:0, 4:0, 5:0 } };
    if (shP && shP.getLastRow() > 1) {
      out.profilo_musei.totali = shP.getLastRow() - 1;
      var vP = shP.getDataRange().getValues();
      var hP = vP[0];
      var iOA = [hP.indexOf('OptIn_AG1'),hP.indexOf('OptIn_AG2'),hP.indexOf('OptIn_AG3'),hP.indexOf('OptIn_AG4'),hP.indexOf('OptIn_AG5')];
      for (var rp = 1; rp < vP.length; rp++) {
        for (var k = 0; k < 5; k++) {
          if (iOA[k] >= 0 && vP[rp][iOA[k]] === true) out.profilo_musei.optin_per_agente[k+1]++;
        }
      }
    }

    // 5) ScriptProperty CLAUDE_API_KEY presente?
    var hasClaudeKey = false;
    try { hasClaudeKey = !!PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY'); } catch(_){}
    out.claude_api_key_presente = hasClaudeKey;

    // 6) Sintesi stato
    out.sintesi = {
      fonti_pronte: fontiPerAgente.attive > 0,
      trigger_installati: agentTriggers.length >= 5,
      api_key_configurata: hasClaudeKey,
      pronti_per_invio_email: out.profilo_musei.totali > 0,
      raccomandazione: ''
    };
    if (!out.sintesi.api_key_configurata) {
      out.sintesi.raccomandazione = 'Configura CLAUDE_API_KEY in ScriptProperties.';
    } else if (!out.sintesi.fonti_pronte) {
      out.sintesi.raccomandazione = 'Esegui setupAgentiCompleto() per inizializzare fonti.';
    } else if (!out.sintesi.trigger_installati) {
      out.sintesi.raccomandazione = 'Esegui setupAgentTriggers() per attivare scan.';
    } else if (!out.sintesi.pronti_per_invio_email) {
      out.sintesi.raccomandazione = 'Popola ProfiloAgenti con almeno 1 museo opt-in per testare email.';
    } else if (out.risultati_recenti.ultimi_7gg === 0) {
      out.sintesi.raccomandazione = 'Tutto configurato. Attendi prossima scan o lancia testAgentScan(1, 5).';
    } else {
      out.sintesi.raccomandazione = 'Sistema operativo. ' + out.risultati_recenti.ultimi_7gg + ' nuovi contenuti negli ultimi 7gg.';
    }

  } catch(e) {
    out.ok = false;
    out.error = (e && e.message) || String(e);
  }

  // v4.18.58 — Log esplicito del risultato (GAS editor non mostra il return value)
  try {
    Logger.log('═══════ DIAGNOSTICA AGENTI ═══════');
    Logger.log('Fonti totali:    ' + (out.fonti_per_agente && out.fonti_per_agente.totali));
    Logger.log('Fonti attive:    ' + (out.fonti_per_agente && out.fonti_per_agente.attive));
    Logger.log('  AG1 Bandi:     ' + (out.fonti_per_agente && out.fonti_per_agente[1]));
    Logger.log('  AG2 Normativa: ' + (out.fonti_per_agente && out.fonti_per_agente[2]));
    Logger.log('  AG3 Innovaz.:  ' + (out.fonti_per_agente && out.fonti_per_agente[3]));
    Logger.log('  AG4 Comunita:  ' + (out.fonti_per_agente && out.fonti_per_agente[4]));
    Logger.log('  AG5 Digital:   ' + (out.fonti_per_agente && out.fonti_per_agente[5]));
    Logger.log('Trigger attivi:  ' + (out.trigger_attivi ? out.trigger_attivi.length : 0));
    if (out.trigger_attivi) {
      out.trigger_attivi.forEach(function(t){ Logger.log('  - ' + t.fn); });
    }
    Logger.log('Risultati scan:  ' + (out.risultati_recenti && out.risultati_recenti.totali) + ' totali · ' + (out.risultati_recenti && out.risultati_recenti.ultimi_7gg) + ' ultimi 7gg');
    Logger.log('Profilo musei:   ' + (out.profilo_musei && out.profilo_musei.totali) + ' musei profilati');
    if (out.profilo_musei && out.profilo_musei.optin_per_agente) {
      Logger.log('  Opt-in:        AG1=' + out.profilo_musei.optin_per_agente[1]
        + ' AG2=' + out.profilo_musei.optin_per_agente[2]
        + ' AG3=' + out.profilo_musei.optin_per_agente[3]
        + ' AG4=' + out.profilo_musei.optin_per_agente[4]
        + ' AG5=' + out.profilo_musei.optin_per_agente[5]);
    }
    Logger.log('Claude API key:  ' + (out.claude_api_key_presente ? 'OK' : 'MANCANTE'));
    Logger.log('───────────────────────────────────');
    Logger.log('RACCOMANDAZIONE: ' + (out.sintesi && out.sintesi.raccomandazione));
    Logger.log('═══════════════════════════════════');
    Logger.log('JSON completo: ' + JSON.stringify(out));
  } catch(eLog) {
    Logger.log('Errore logging: ' + eLog.message);
  }

  return out;
}

// ============================================================================
// v4.18.59 (2026-05-16) — TEST EMAIL AGENTI per admin
// ============================================================================

/**
 * Profila l'admin come museo test in ProfiloAgenti (tutti opt-in) e invia
 * 5 email anteprima (una per agente) alla sua casella.
 *
 * Comportamento:
 *  - Se ProfiloAgenti non ha già l'admin, lo aggiunge con opt-in attivo per tutti
 *  - Per ogni agente 1-5: chiama previewAgentEmail() per generare HTML
 *  - Se HTML ha contenuti reali (>500 char), invia subito con prefix [TEST AGn]
 *  - Se HTML vuoto (scan ancora da fare), salta con messaggio nel report
 *
 * @return {Object} { ok, destinatario, inviati, saltati, errori, dettagli }
 */
function testEmailAgentiAdmin() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  var report = { ok:true, inviati: 0, saltati: 0, errori: 0, dettagli: [] };

  // 1) Risolvi email admin
  var emailAdmin = '';
  try {
    var csv = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || '';
    emailAdmin = String(csv.split(',')[0] || '').trim().toLowerCase();
  } catch(_){}
  if (!emailAdmin) {
    try { emailAdmin = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch(_){}
  }
  if (!emailAdmin) return { ok:false, error:'email_admin_non_trovata' };
  report.destinatario = emailAdmin;

  // 2) Add/update in ProfiloAgenti
  try {
    _profilaUtenteInAgenti_(emailAdmin, {
      nomeMuseo: 'Test Admin Silvano',
      optIn: { 1:true, 2:true, 3:true, 4:true, 5:true },
      freq:  { 1:'settimanale', 2:'mensile', 3:'quindicinale', 4:'mensile', 5:'quindicinale' }
    });
    report.dettagli.push({ step: 'profilazione', ok: true, msg: 'admin profilato con tutti opt-in attivi' });
  } catch(eP) {
    report.dettagli.push({ step: 'profilazione', ok: false, error: eP.message });
    report.ok = false;
  }

  // 3) Per ogni agente: preview + send
  for (var ag = 1; ag <= 5; ag++) {
    try {
      var preview = null;
      if (typeof previewAgentEmail === 'function') {
        preview = previewAgentEmail(ag, emailAdmin);
      }
      var html = (preview && preview.html) ? preview.html : '';
      if (!html || html.length < 500) {
        report.saltati++;
        report.dettagli.push({
          agente: ag,
          azione: 'skip',
          motivo: 'HTML vuoto o troppo corto (' + html.length + ' char). Probabilmente AgentScanResults ancora vuoto per questo agente. Il sistema raccoglierà contenuti nelle prossime ' + (ag === 4 ? '24h' : ag === 1 ? '6h' : '12h') + '.'
        });
        continue;
      }

      // Send reale
      var agConf = (typeof getAgentConfig === 'function') ? getAgentConfig(ag) : null;
      var subj = '[TEST ' + (agConf ? agConf.codice : ('AG' + ag)) + '] '
        + (agConf ? agConf.nome : 'Sinopia Agente ' + ag);

      MailApp.sendEmail({
        to: emailAdmin,
        subject: subj,
        htmlBody: html,
        name: 'Sinopia · Osservatorio Culturale'
      });
      report.inviati++;
      report.dettagli.push({
        agente: ag,
        azione: 'send',
        subject: subj,
        htmlSize: html.length,
        nContenuti: (preview && preview.nContenuti) || null
      });
      Logger.log('✓ Email test AG' + ag + ' inviata (' + html.length + ' char)');
    } catch(eS) {
      report.errori++;
      report.dettagli.push({ agente: ag, azione: 'error', error: eS.message });
      Logger.log('✗ Errore invio AG' + ag + ': ' + eS.message);
    }
  }

  Logger.log('═══ TEST EMAIL AGENTI ═══');
  Logger.log('Destinatario: ' + emailAdmin);
  Logger.log('Inviati:      ' + report.inviati + '/5');
  Logger.log('Saltati:      ' + report.saltati + ' (HTML vuoto, scan da fare)');
  Logger.log('Errori:       ' + report.errori);
  Logger.log('═════════════════════════');

  return report;
}

/**
 * Helper privato — aggiunge/aggiorna riga ProfiloAgenti per una email.
 *
 * @param {string} email
 * @param {Object} opts { nomeMuseo, optIn:{1:bool..5}, freq:{1:str..5}, responseId? }
 */
function _profilaUtenteInAgenti_(email, opts) {
  opts = opts || {};
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFILO_AGENTI_SHEET);
  if (!sh) throw new Error('ProfiloAgenti non esiste — esegui setupProfiloAgenti() prima');

  var emailLc = String(email).trim().toLowerCase();
  var vals = sh.getDataRange().getValues();
  var h = vals[0];
  var iEm = h.indexOf('Email');
  var iNm = h.indexOf('NomeMuseo');
  var iRid = h.indexOf('ResponseID');
  var iOA = [h.indexOf('OptIn_AG1'),h.indexOf('OptIn_AG2'),h.indexOf('OptIn_AG3'),h.indexOf('OptIn_AG4'),h.indexOf('OptIn_AG5')];
  var iFA = [h.indexOf('Freq_AG1'),h.indexOf('Freq_AG2'),h.indexOf('Freq_AG3'),h.indexOf('Freq_AG4'),h.indexOf('Freq_AG5')];
  var iDC = h.indexOf('DataCreazione');
  var iDA = h.indexOf('DataAggiornamento');

  // Cerca esistente
  var rowFound = -1;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][iEm] || '').toLowerCase() === emailLc) { rowFound = r + 1; break; }
  }

  var now = new Date();
  if (rowFound > 0) {
    // Aggiorna
    if (opts.nomeMuseo)  sh.getRange(rowFound, iNm + 1).setValue(opts.nomeMuseo);
    if (opts.responseId) sh.getRange(rowFound, iRid + 1).setValue(opts.responseId);
    if (opts.optIn) {
      for (var k = 0; k < 5; k++) {
        if (opts.optIn[k+1] !== undefined && iOA[k] >= 0) sh.getRange(rowFound, iOA[k] + 1).setValue(!!opts.optIn[k+1]);
      }
    }
    if (opts.freq) {
      for (var k2 = 0; k2 < 5; k2++) {
        if (opts.freq[k2+1] !== undefined && iFA[k2] >= 0) sh.getRange(rowFound, iFA[k2] + 1).setValue(opts.freq[k2+1]);
      }
    }
    if (iDA >= 0) sh.getRange(rowFound, iDA + 1).setValue(now);
    return { action: 'updated', row: rowFound };
  }

  // Crea nuova riga
  var newRow = new Array(h.length).fill('');
  if (iRid >= 0) newRow[iRid] = opts.responseId || '';
  if (iEm >= 0)  newRow[iEm]  = emailLc;
  if (iNm >= 0)  newRow[iNm]  = opts.nomeMuseo || '';
  for (var k3 = 0; k3 < 5; k3++) {
    if (iOA[k3] >= 0) newRow[iOA[k3]] = !!(opts.optIn && opts.optIn[k3+1]);
    if (iFA[k3] >= 0) newRow[iFA[k3]] = (opts.freq && opts.freq[k3+1]) || '';
  }
  if (iDC >= 0) newRow[iDC] = now;
  if (iDA >= 0) newRow[iDA] = now;
  sh.appendRow(newRow);
  return { action: 'inserted', row: sh.getLastRow() };
}

// ============================================================================
// v4.18.59 — POPOLAMENTO AUTOMATICO PROFILOAGENTI da Matrix
// ============================================================================

/**
 * Popola ProfiloAgenti leggendo i compilatori Matrix da ContactsMatrix +
 * topGap da ResponsesMatrix. Per ogni museo:
 *  - Estrae top3 dimensioni di gap dal report Matrix
 *  - Mappa ogni dim → agenti rilevanti tramite getAgentsForDimension()
 *  - Imposta opt-in per quegli agenti, oltre ad AG1 (Bandi sempre rilevante)
 *
 * Idempotente: rieseguibile, aggiorna profili esistenti.
 *
 * @return {Object} { ok, processati, profilati, skipped, errori, dettagli[] }
 */
function popolaProfiloAgentiDaMatrix() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  var report = { ok:true, processati:0, profilati:0, skipped:0, errori:0, dettagli:[] };

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shC = ss.getSheetByName('ContactsMatrix');
    if (!shC || shC.getLastRow() < 2) {
      return { ok:false, error:'ContactsMatrix vuoto o assente' };
    }

    var vC = shC.getDataRange().getValues();
    var hC = vC[0];
    var iEm = hC.indexOf('email');
    var iNm = hC.indexOf('museum_name'); if (iNm < 0) iNm = hC.indexOf('nome_museo');
    var iRid = hC.indexOf('response_id');
    if (iEm < 0 || iRid < 0) {
      return { ok:false, error:'ContactsMatrix mancano colonne email/response_id', header: hC };
    }

    for (var rc = 1; rc < vC.length; rc++) {
      report.processati++;
      var email = String(vC[rc][iEm] || '').trim().toLowerCase();
      var nomeMuseo = (iNm >= 0) ? String(vC[rc][iNm] || '') : '';
      var responseId = String(vC[rc][iRid] || '').trim();

      if (!email || !responseId) {
        report.skipped++;
        continue;
      }

      // Determina opt-in basato su topGap Matrix
      var optIn = { 1:true, 2:false, 3:false, 4:false, 5:false }; // AG1 Bandi sempre attivo
      var topDims = [];

      try {
        if (typeof getMatrixReport === 'function') {
          var rep = getMatrixReport(responseId);
          if (rep && rep.ok && rep.top3Opportunities) {
            topDims = rep.top3Opportunities.slice(0, 3).map(function(o){ return o.dimensionCode; });
            // Per ogni dim top, attiva agenti rilevanti
            topDims.forEach(function(dim) {
              if (typeof getAgentsForDimension === 'function') {
                var rilevanti = getAgentsForDimension(dim);
                rilevanti.forEach(function(a) { optIn[a.id] = true; });
              }
            });
          }
        }
      } catch(eM) {
        Logger.log('Errore lettura Matrix per ' + email + ': ' + eM.message);
      }

      try {
        var r = _profilaUtenteInAgenti_(email, {
          nomeMuseo: nomeMuseo,
          responseId: responseId,
          optIn: optIn,
          freq: { 1:'settimanale', 2:'mensile', 3:'quindicinale', 4:'mensile', 5:'quindicinale' }
        });
        report.profilati++;
        report.dettagli.push({
          email: email,
          nomeMuseo: nomeMuseo,
          action: r.action,
          topDims: topDims,
          optIn: optIn
        });
      } catch(eW) {
        report.errori++;
        report.dettagli.push({ email: email, action: 'error', error: eW.message });
      }
    }

    Logger.log('═══ POPOLAMENTO PROFILOAGENTI da MATRIX ═══');
    Logger.log('Processati:  ' + report.processati);
    Logger.log('Profilati:   ' + report.profilati);
    Logger.log('Skipped:     ' + report.skipped);
    Logger.log('Errori:      ' + report.errori);
    Logger.log('═══════════════════════════════════════════');

  } catch(e) {
    report.ok = false;
    report.error = e.message;
  }
  return report;
}

// ============================================================================
// v4.18.59 — UTILITY: scan AG1 limitato per popolare AgentScanResults
// ============================================================================

/**
 * Esegue uno scan reale di AG1 limitato a N fonti, per popolare velocemente
 * AgentScanResults senza aspettare il prossimo trigger automatico (max 6h).
 *
 * @param {number} [maxFonti=5]
 * @return {Object} risultato scan
 */
function quickScanAG1(maxFonti) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  if (typeof scanAgente !== 'function') return { ok:false, error:'scanAgente non disponibile' };
  var n = Number(maxFonti) || 5;
  Logger.log('Quick scan AG1 con max ' + n + ' fonti...');
  var res = scanAgente(1, { maxFonti: n, verbose: true });
  Logger.log('Quick scan AG1: ' + JSON.stringify(res));
  return res;
}

// ============================================================================
// FINE AgentSetup.js
// ============================================================================

