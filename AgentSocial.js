// ============================================================================
//  AgentSocial.js — Agente social Sinopia (AG6 · v4.18.61 · 2026-05-16)
// ----------------------------------------------------------------------------
//  Selezione + rielaborazione contenuti per Instagram + LinkedIn.
//
//  3 LAYER (separati, attivabili indipendentemente):
//    Layer 1 GENERAZIONE  → questo file (no API esterne attive subito)
//    Layer 2 APPROVAZIONE → UI admin "Coda social" (AgentAdmin.js + Index.html)
//    Layer 3 PUBBLICAZIONE → AgentSocialPublish.js (stub: attivabile post-aperture profili)
//
//  Pipeline Layer 1:
//    1. Trigger ogni 2gg → generateNextSocialDraft()
//    2. _selectNewsForSocial_() seleziona news non socializzata, rispettando:
//         - score >= 6
//         - data ultimi 7gg
//         - tematica DIFFERENTE da ultime 3 pubblicate (rotazione)
//    3. _composeSocialDraft_() chiama Claude per generare:
//         - captionIg (max 2200 char, hashtag)
//         - postLi (max 3000 char, tono pro)
//         - altText (max 125 char)
//    4. _extractOgImage_() prova og:image dell'articolo
//    5. Scrive su SocialQueue (stato='draft')
//    6. Telegram alert admin
//
//  Setup obbligatorio (1 volta):
//    setupSocialQueue()        — crea foglio SocialQueue
//    setupSocialTrigger()      — installa cron ogni 2 giorni 09:00
//
//  Endpoint admin (chiamabili anche da UI):
//    generateNextSocialDraft()       genera 1 draft ora
//    getSocialQueueList(filterStato) lista coda paginata
//    approveSocialPost(id)           approva singolo
//    rejectSocialPost(id, motivo)    rifiuta
//    regenerateSocialPost(id)        rielabora con altro tono
//    updateSocialPost(body)          modifica manuale testi/immagine
//
//  Autore: Claude (Cowork) per Silvano Straccini / Sinopia
// ============================================================================


// ============================================================================
// CONFIGURAZIONE
// ============================================================================

var SOCIAL_QUEUE_SHEET = 'SocialQueue';
var SOCIAL_QUEUE_HEADERS = [
  'ID', 'DataCreazione', 'DataProgrammata',
  'SourceTipo', 'SourceId', 'NewsTitolo', 'NewsUrl', 'NewsFonte',
  'Tematica', 'Ambito',
  'CaptionInstagram', 'PostLinkedIn', 'AltText', 'Hashtags',
  'ImageUrl', 'ImageSource',
  'Stato', 'NoteAdmin', 'ApprovatoDa',
  'PubblicatoIG_at', 'PubblicatoLI_at',
  'IGPostId', 'LIPostId', 'IGPostUrl', 'LIPostUrl',
  'ErroreIG', 'ErroreLI'
];

// Stati ammessi
var SOCIAL_STATI = ['draft', 'approved', 'scheduled', 'published', 'rejected', 'error'];

// Hashtag base (sempre presenti, mediati con tematici)
// Brand: sinopiaconsulting (handle Instagram + LinkedIn + dominio sinopiaconsulting.it)
var SOCIAL_HASHTAGS_BASE = [
  '#sinopiaconsulting', '#sinopia', '#osservatoriocultura',
  '#museiitaliani', '#culturaitaliana', '#beniculturali'
];

// Hashtag tematici per area (rotazione)
var SOCIAL_HASHTAGS_TEMATICI = {
  'innovazione':    ['#culturadigitale', '#culturainnovazione', '#futurocultura', '#aiapplicataallacultura'],
  'accessibilita':  ['#museiaccessibili', '#culturaperitutti', '#welfareculturale', '#musei4all'],
  'comunita':       ['#comunitaecultura', '#culturapartecipata', '#patrimoniocomune', '#cultureforall'],
  'finanziamenti':  ['#bandiculturali', '#pnrrcultura', '#fesrcultura', '#culturafinanziata'],
  'identita':       ['#patrimoniomondiale', '#heritageitaliano', '#raccontareilmuseo'],
  'normativa':      ['#policyculturali', '#culturalpolicy', '#museumstandards']
};

// Mappa ambito OC → cluster hashtag
var AMBITO_TO_HASHTAG_CLUSTER = {
  1: 'identita',     // Identità museale
  2: 'accessibilita',// Inclusione
  3: 'innovazione',  // Programma
  4: 'comunita',     // Comunità
  5: 'innovazione'   // Digital
};

// Dominio brand (sinopiaconsulting.it quando DNS attivo, fallback sinopia.netlify.app)
// Letto da ScriptProperty OC_SOCIAL_DOMAIN, fallback hardcoded.
function _getSocialDomain_() {
  try {
    var d = PropertiesService.getScriptProperties().getProperty('OC_SOCIAL_DOMAIN');
    if (d) return String(d).trim();
  } catch(_){}
  return 'sinopia.netlify.app';
}

function _getSocialCtaText_() { return 'link in bio · ' + _getSocialDomain_(); }
function _getSocialCtaLi_()   { return 'Visita ' + _getSocialDomain_() + ' per l\'analisi completa'; }

// Score minimo per essere candidato a social
var SOCIAL_MIN_SCORE = 6;

// Quante tematiche ricordare per evitare ripetizioni
var SOCIAL_ROTATION_MEMORY = 3;


// ============================================================================
// SETUP
// ============================================================================

function setupSocialQueue(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
  if (sh) {
    return { ok:true, action:'exists', rows: sh.getLastRow() - 1 };
  }
  sh = ss.insertSheet(SOCIAL_QUEUE_SHEET);
  sh.getRange(1, 1, 1, SOCIAL_QUEUE_HEADERS.length).setValues([SOCIAL_QUEUE_HEADERS])
    .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidth(11, 320); // CaptionInstagram
  sh.setColumnWidth(12, 320); // PostLinkedIn
  sh.setColumnWidth(15, 280); // ImageUrl
  return { ok:true, action:'created' };
}

function setupSocialTrigger(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
  // Rimuovi trigger esistenti
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function(t){
    if (t.getHandlerFunction() === 'generateNextSocialDraft') {
      ScriptApp.deleteTrigger(t); removed++;
    }
  });
  // Trigger ogni 2 giorni alle 09:00 (Apps Script approxima a "ogni 2 giorni")
  // Implementazione: trigger daily 09:00, decide internamente se è giorno "buono"
  ScriptApp.newTrigger('generateNextSocialDraft')
    .timeBased().atHour(9).nearMinute(0).everyDays(1).create();
  Logger.log('Trigger social installato: daily 09:00 (logica every-2-days interna)');
  return { ok:true, schedule:'daily 09:00 (filter every-2-days)', rimossi: removed };
}


// ============================================================================
// ENTRY POINT — chiamato dal trigger giornaliero
// ============================================================================

/**
 * Genera il prossimo draft social.
 * Chiamato dal trigger giornaliero alle 09:00 — verifica internamente se è giorno
 * "buono" (ultimo post >= 2gg fa). Se è admin che la chiama manualmente, salta il check.
 *
 * @param {Object} [opts] {force: bool} se true, salta il check 2-day cooldown
 * @return {Object} { ok, draft?, motivo? }
 */
function generateNextSocialDraft(opts, token) {
  opts = opts || {};
  var isManual = !!opts.force || (typeof _isCurrentUserAdmin_ === 'function' && _isCurrentUserAdmin_(token || opts.token));

  try {
    // 1. Cooldown 2gg (skippa se chiamato manualmente)
    if (!isManual) {
      var lastDraft = _getLastDraftDate_();
      if (lastDraft) {
        var hoursSince = (new Date() - lastDraft) / 3600000;
        if (hoursSince < 44) { // ~2gg con margine 4h
          Logger.log('Social: cooldown attivo, ultimo draft ' + hoursSince.toFixed(1) + 'h fa');
          return { ok:true, motivo:'cooldown_attivo', oreResidue: (48 - hoursSince).toFixed(1) };
        }
      }
    }

    // 2. Seleziona news
    var news = _selectNewsForSocial_();
    if (!news) {
      Logger.log('Social: nessuna news candidata trovata');
      return { ok:true, motivo:'nessuna_news_candidata' };
    }

    // 3. Componi draft via Claude
    var draft = _composeSocialDraft_(news);
    if (!draft || !draft.captionIg || !draft.postLi) {
      Logger.log('Social: composizione Claude fallita');
      return { ok:false, error:'compose_fallito', news: news };
    }

    // 3-bis. v4.27.51 — REFERENZE: rassegna stampa cross-fonte della notizia
    // (richiesta Silvano 21/07: "le referenze e le fonti dei post più famosi",
    // come la rassegna manuale del caso Turrell/ARoS). La riga "Ne parlano
    // anche:" dà autorevolezza al post e mostra il lavoro dell'osservatorio.
    try {
      var rassegna = newsRassegnaStampa_(news.titolo, news.fonte, 45);
      if (rassegna.length) {
        var fontiR = rassegna.map(function(r){ return r.fonte; })
          .filter(function(v, i, a){ return v && a.indexOf(v) === i; }).slice(0, 5);
        if (fontiR.length) {
          var lineaR = 'Ne parlano anche: ' + fontiR.join(' · ');
          if (draft.postLi.length + lineaR.length + 2 < 3000) draft.postLi += '\n\n' + lineaR;
          if (draft.captionIg.length + lineaR.length + 1 < 2200) draft.captionIg += '\n' + lineaR;
        }
      }
    } catch(eR) { Logger.log('Social rassegna: ' + eR.message); }

    // 4. Estrai og:image
    var imageInfo = _extractOgImage_(news.url);

    // 5. Scrivi su SocialQueue
    var draftId = 'S' + new Date().getTime() + Math.random().toString(36).substring(2, 5);
    var row = _writeDraftToQueue_(draftId, news, draft, imageInfo);

    // 6. Telegram alert
    _sendSocialAlert_(draftId, news);

    Logger.log('✓ Social draft creato: ' + draftId + ' · ' + news.titolo.substring(0, 60));
    return {
      ok: true,
      draftId: draftId,
      newsTitle: news.titolo,
      tematica: news.tematica,
      captionLength: draft.captionIg.length,
      postLength: draft.postLi.length,
      hasImage: !!imageInfo.imageUrl
    };
  } catch(e) {
    Logger.log('Social draft ERROR: ' + (e && e.message));
    return { ok:false, error: e.message };
  }
}


// ============================================================================
// SELEZIONE NEWS — rotazione tematica obbligatoria
// ============================================================================

function _selectNewsForSocial_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shItems = ss.getSheetByName(SH.ITEMS || 'Items');
  if (!shItems || shItems.getLastRow() < 2) return null;

  // Ultime N tematiche già socializzate (evita ripetizioni)
  var ultime = _getLastSocializedTematiche_(SOCIAL_ROTATION_MEMORY);

  var vals = shItems.getDataRange().getValues();
  var h = vals[0];
  var idx = {
    id: h.indexOf('ID'),
    titolo: h.indexOf('Titolo'),
    sommarioAI: h.indexOf('SommarioAI'),
    fonteURL: h.indexOf('FonteURL'),
    fonte: h.indexOf('Fonte'),
    score: h.indexOf('Score'),
    dataPub: h.indexOf('DataPubblicazione'),
    dataAcq: h.indexOf('DataAcquisizione'),
    ambito: h.indexOf('Ambito'),
    arch: h.indexOf('Archiviato'),
    tag: h.indexOf('TagAI')
  };

  var soglia7gg = new Date(); soglia7gg.setDate(soglia7gg.getDate() - 7);
  // Items già socializzati (evita)
  var socializedIds = _getSocializedIds_();

  var candidates = [];
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    if (idx.arch >= 0 && row[idx.arch] === true) continue;
    var id = row[idx.id];
    if (!id || socializedIds[id]) continue;
    var score = Number(row[idx.score] || 0);
    if (score < SOCIAL_MIN_SCORE) continue;
    var dataPub = row[idx.dataPub] instanceof Date ? row[idx.dataPub] : (row[idx.dataPub] ? new Date(row[idx.dataPub]) : null);
    if (!dataPub || dataPub < soglia7gg) continue;
    var ambito = Number(row[idx.ambito] || 0);
    var tematicaCluster = AMBITO_TO_HASHTAG_CLUSTER[ambito] || 'identita';

    // Skip se tematica negli ultimi N
    if (ultime.indexOf(tematicaCluster) >= 0) continue;

    candidates.push({
      id: id,
      titolo: String(row[idx.titolo] || ''),
      sommario: String(row[idx.sommarioAI] || ''),
      url: String(row[idx.fonteURL] || ''),
      fonte: String(row[idx.fonte] || ''),
      score: score,
      dataPub: dataPub,
      ambito: ambito,
      tag: idx.tag >= 0 ? String(row[idx.tag] || '') : '',
      tematica: tematicaCluster
    });
  }

  if (!candidates.length) {
    // Fallback: rilassa rotazione tematica se nessun candidato (raro)
    Logger.log('Social: nessun candidato con rotazione · fallback senza vincolo tematica');
    return null;
  }

  // Ordina per score DESC + recenti
  candidates.sort(function(a, b){
    if (b.score !== a.score) return b.score - a.score;
    return b.dataPub - a.dataPub;
  });

  return candidates[0];
}

function _getLastSocializedTematiche_(n) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    if (!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var iTem = h.indexOf('Tematica');
    var iDC = h.indexOf('DataCreazione');
    var iStato = h.indexOf('Stato');
    if (iTem < 0) return [];
    var rows = [];
    for (var r = 1; r < vals.length; r++) {
      if (iStato >= 0 && vals[r][iStato] === 'rejected') continue;
      rows.push({ tematica: String(vals[r][iTem] || ''), data: vals[r][iDC] || new Date(0) });
    }
    rows.sort(function(a,b){ return new Date(b.data) - new Date(a.data); });
    return rows.slice(0, n).map(function(x){ return x.tematica; });
  } catch(_){ return []; }
}

function _getSocializedIds_() {
  var out = {};
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    if (!sh || sh.getLastRow() < 2) return out;
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var iSrcId = h.indexOf('SourceId');
    if (iSrcId < 0) return out;
    for (var r = 1; r < vals.length; r++) {
      var sid = vals[r][iSrcId];
      if (sid) out[sid] = true;
    }
  } catch(_){}
  return out;
}

function _getLastDraftDate_() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    if (!sh || sh.getLastRow() < 2) return null;
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var iDC = h.indexOf('DataCreazione');
    var iStato = h.indexOf('Stato');
    if (iDC < 0) return null;
    var latest = null;
    for (var r = 1; r < vals.length; r++) {
      if (iStato >= 0 && vals[r][iStato] === 'rejected') continue;
      var d = vals[r][iDC];
      if (d instanceof Date && (!latest || d > latest)) latest = d;
    }
    return latest;
  } catch(_){ return null; }
}


// ============================================================================
// COMPOSIZIONE CLAUDE
// ============================================================================

function _composeSocialDraft_(news) {
  var apiKey = '';
  try { apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY') || ''; } catch(_){}
  if (!apiKey) {
    Logger.log('Social compose: CLAUDE_API_KEY mancante');
    return null;
  }

  var hashtags = _selectHashtagsForTematica_(news.tematica);
  var prompt = ''
    + 'Sei l\'editor social di Sinopia, osservatorio culturale italiano.\n'
    + 'Stile: RIFLESSIVO/MANIFESTO. Sinopia è una voce critica e curatoriale, non un canale di news secche.\n'
    + 'Tono: pacato, professionale, evocativo. NO buzzword commerciali. NO emoji eccessivi (max 1-2). NO esclamativi.\n'
    + 'Riferimento brand: la sinopia è il disegno preparatorio in terra rossa sotto l\'affresco — Sinopia è ciò che precede e prepara l\'opera culturale.\n'
    + '\n'
    + 'CONTENUTO DA RIELABORARE:\n'
    + '- Titolo: ' + String(news.titolo || '').substring(0, 200) + '\n'
    + '- Sommario: ' + String(news.sommario || '').substring(0, 600) + '\n'
    + '- Fonte: ' + String(news.fonte || '') + '\n'
    + '- Tematica: ' + news.tematica + '\n'
    + '\n'
    + 'GENERA:\n'
    + '\n'
    + '1. CAPTION INSTAGRAM (max 2200 char totali, hashtag inclusi):\n'
    + '   - Hook iniziale (1 riga forte, riflessiva)\n'
    + '   - Contesto (3-4 frasi, mai elenchi, sempre prosa)\n'
    + '   - Perché conta per i musei italiani (1-2 frasi, valore culturale non commerciale)\n'
    + '   - CTA: "' + _getSocialCtaText_() + '"\n'
    + '   - Hashtag finali (10-12): usa questi: ' + hashtags.join(' ') + '\n'
    + '\n'
    + '2. POST LINKEDIN (max 3000 char, tono executive ma riflessivo):\n'
    + '   - Apertura strong (1-2 righe, anche una citazione)\n'
    + '   - Contesto strutturato (4-6 frasi, prosa)\n'
    + '   - Implicazione per il settore culturale (2 frasi)\n'
    + '   - CTA professional: "' + _getSocialCtaLi_() + '"\n'
    + '   - 3-5 hashtag tecnici alla fine\n'
    + '\n'
    + '3. ALT TEXT immagine (max 125 char, descrittivo per accessibilità WCAG)\n'
    + '\n'
    + 'OUTPUT JSON (solo JSON, niente markdown, niente preamboli):\n'
    + '{\n'
    + '  "captionIg": "...",\n'
    + '  "postLi": "...",\n'
    + '  "altText": "...",\n'
    + '  "hashtagsUsati": ["#tag1", ...]\n'
    + '}\n';

  try {
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      deadline: 30,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: OC_CLAUDE_MODEL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log('Claude social: HTTP ' + code + ' · ' + res.getContentText().substring(0, 200));
      return null;
    }

    var data = JSON.parse(res.getContentText());
    var text = (data && data.content && data.content[0] && data.content[0].text) || '';
    if (!text) return null;

    // Estrai JSON dal testo (potrebbe avere preamboli)
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    var parsed = JSON.parse(jsonMatch[0]);

    return {
      captionIg: String(parsed.captionIg || '').substring(0, 2200),
      postLi:    String(parsed.postLi    || '').substring(0, 3000),
      altText:   String(parsed.altText   || '').substring(0, 125),
      hashtags:  Array.isArray(parsed.hashtagsUsati) ? parsed.hashtagsUsati : hashtags
    };
  } catch(e) {
    Logger.log('Claude social ERR: ' + e.message);
    return null;
  }
}

function _selectHashtagsForTematica_(tematica) {
  var tematici = SOCIAL_HASHTAGS_TEMATICI[tematica] || SOCIAL_HASHTAGS_TEMATICI['identita'];
  // Mix base + tematici
  return SOCIAL_HASHTAGS_BASE.concat(tematici).slice(0, 12);
}


// ============================================================================
// ESTRAZIONE og:image
// ============================================================================

function _extractOgImage_(url) {
  if (!url) return { imageUrl: '', imageSource: 'none' };
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      deadline: 10,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SinopiaBot/1.0)' }
    });
    if (res.getResponseCode() !== 200) return { imageUrl: '', imageSource: 'http_err' };
    var html = res.getContentText().substring(0, 30000); // first 30K chars

    // og:image
    var match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
             || html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    if (match && match[1]) {
      var imgUrl = match[1].trim();
      // Risolvi URL relativi
      if (imgUrl.indexOf('//') === 0) imgUrl = 'https:' + imgUrl;
      else if (imgUrl.indexOf('/') === 0) {
        try {
          var m = url.match(/^https?:\/\/[^\/]+/);
          if (m) imgUrl = m[0] + imgUrl;
        } catch(_){}
      }
      return { imageUrl: imgUrl, imageSource: 'og' };
    }

    // twitter:image fallback
    var twMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
    if (twMatch && twMatch[1]) {
      return { imageUrl: twMatch[1].trim(), imageSource: 'twitter' };
    }

    return { imageUrl: '', imageSource: 'not_found' };
  } catch(e) {
    return { imageUrl: '', imageSource: 'error', error: e.message };
  }
}


// ============================================================================
// SCRITTURA SU SOCIAL QUEUE
// ============================================================================

function _writeDraftToQueue_(draftId, news, draft, imageInfo, sourceTipo) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
  if (!sh) {
    setupSocialQueue();
    sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
  }
  var now = new Date();
  var dataProg = new Date(now.getTime() + 24 * 3600 * 1000); // pubblicazione consigliata domani
  var ambitoLabel = '';
  try {
    if (typeof OC_AMBITI !== 'undefined' && OC_AMBITI && OC_AMBITI[news.ambito - 1]) {
      ambitoLabel = OC_AMBITI[news.ambito - 1].nome || '';
    }
  } catch(_){}

  var row = [
    draftId,
    now,
    dataProg,
    sourceTipo || 'news',   // v4.27.51 — anche 'editoriale'
    news.id,
    news.titolo,
    news.url,
    news.fonte,
    news.tematica,
    ambitoLabel,
    draft.captionIg,
    draft.postLi,
    draft.altText,
    (draft.hashtags || []).join(' '),
    imageInfo.imageUrl || '',
    imageInfo.imageSource || 'none',
    'draft',
    '', // NoteAdmin
    '', // ApprovatoDa
    '', '', '', '', '', '', '', '' // PubblicatoIG_at, PubblicatoLI_at, IGPostId, LIPostId, IGPostUrl, LIPostUrl, ErroreIG, ErroreLI
  ];
  // Allinea lunghezza headers
  while (row.length < SOCIAL_QUEUE_HEADERS.length) row.push('');
  sh.appendRow(row);
  return { row: sh.getLastRow() };
}


// ============================================================================
// TELEGRAM ALERT
// ============================================================================

function _sendSocialAlert_(draftId, news) {
  if (typeof _tgSend_ !== 'function') return;
  try {
    var msg = '📱 *Nuovo draft social Sinopia*\n'
      + '`' + draftId + '`\n'
      + '*Titolo:* ' + String(news.titolo || '').substring(0, 100) + '\n'
      + '*Tematica:* ' + news.tematica + '\n'
      + '*Fonte:* ' + (news.fonte || '—') + '\n\n'
      + 'Vai a Pannello admin → Coda social per approvare.';
    _tgSend_(msg);
  } catch(_){}
}


// ============================================================================
// v4.27.51 — RASSEGNA STAMPA cross-fonte (le "referenze" dei post famosi)
// ----------------------------------------------------------------------------
// Data una notizia, cerca in Items (ultimi N giorni) le notizie che coprono la
// STESSA storia da fonti DIVERSE (similarità Jaccard sulle parole significative
// del titolo). È l'automazione della rassegna manuale del caso Turrell/ARoS.
// ============================================================================

function _rsWords_(titolo) {
  var STOP = { il:1, lo:1, la:1, le:1, li:1, gli:1, un:1, una:1, uno:1, di:1, del:1, dei:1,
    della:1, delle:1, dello:1, degli:1, da:1, dal:1, in:1, nel:1, nei:1, nella:1, nelle:1,
    a:1, al:1, ai:1, alla:1, alle:1, con:1, su:1, sul:1, sulla:1, per:1, tra:1, fra:1,
    e:1, ed:1, o:1, ma:1, che:1, piu:1, più:1,
    the:1, of:1, and:1, for:1, to:1, an:1, on:1, at:1, by:1, with:1, its:1, his:1, her:1, new:1,
    // stopword di DOMINIO: onnipresenti nel corpus dell'osservatorio, creerebbero
    // falsi accostamenti tra storie diverse
    museo:1, musei:1, museum:1, museums:1, museale:1, arte:1, art:1, mostra:1, mostre:1,
    cultura:1, culturale:1, culturali:1, cultural:1, nuovo:1, nuova:1, grande:1, inside:1,
    italia:1, italiano:1, italiana:1, italiani:1 };
  return String(titolo || '').toLowerCase()
    .replace(/[–—:;,.!?'’"«»()\[\]]/g, ' ')
    .split(/\s+/)
    .filter(function(w) { return w.length >= 3 && !STOP[w]; });
}

function _rsJaccard_(a, b) {
  if (!a.length || !b.length) return { sim: 0, comuni: 0 };
  var sb = {}; b.forEach(function(w){ sb[w] = true; });
  var sa = {}, inter = 0;
  a.forEach(function(w){ if (!sa[w]) { sa[w] = true; if (sb[w]) inter++; } });
  var union = Object.keys(sa).length + Object.keys(sb).length - inter;
  return { sim: union > 0 ? inter / union : 0, comuni: inter };
}

/**
 * Rassegna stampa per un titolo: item simili da fonti DIVERSE.
 * @return {Array<{fonte, titolo, url, sim}>} max 6, ordinati per similarità.
 */
function newsRassegnaStampa_(titolo, fonteEsclusa, giorni) {
  giorni = Number(giorni) || 45;
  var out = [];
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName((typeof SH !== 'undefined' && SH.ITEMS) || 'Items');
    if (!sh || sh.getLastRow() < 2) return out;
    var v = sh.getDataRange().getValues(); var h = v[0].map(String);
    var iTit = h.indexOf('Titolo'), iFonte = h.indexOf('Fonte'), iUrl = h.indexOf('FonteURL'),
        iData = h.indexOf('DataPubblicazione'), iArch = h.indexOf('Archiviato');
    if (iTit < 0) return out;
    var wRef = _rsWords_(titolo);
    if (wRef.length < 2) return out;
    var cutoff = Date.now() - giorni * 86400000;
    var fLc = String(fonteEsclusa || '').toLowerCase().trim();
    var perFonte = {}; // tiene il match migliore per fonte
    for (var r = 1; r < v.length; r++) {
      if (iArch >= 0 && (v[r][iArch] === true || String(v[r][iArch]).toUpperCase() === 'TRUE')) continue;
      var fonte = String(v[r][iFonte] || '').trim();
      if (!fonte || fonte.toLowerCase() === fLc) continue;
      var d = v[r][iData];
      var dt = (d instanceof Date) ? d : (d ? new Date(d) : null);
      if (dt && !isNaN(dt.getTime()) && dt.getTime() < cutoff) continue;
      var j = _rsJaccard_(wRef, _rsWords_(v[r][iTit]));
      // Stessa storia se: >=3 parole significative comuni (nomi propri: i titoli
      // multilingua hanno Jaccard basso — caso Turrell: sim 0.18-0.33 ma 3-5
      // parole comuni), oppure >=2 comuni con similarità complessiva decente.
      if (!(j.comuni >= 3 || (j.comuni >= 2 && j.sim >= 0.3))) continue;
      var fk = fonte.toLowerCase();
      if (!perFonte[fk] || perFonte[fk].sim < j.sim) {
        perFonte[fk] = { fonte: fonte, titolo: String(v[r][iTit] || ''), url: String(iUrl >= 0 ? v[r][iUrl] || '' : ''), sim: Math.round(j.sim * 100) / 100 };
      }
    }
    out = Object.keys(perFonte).map(function(k){ return perFonte[k]; });
    out.sort(function(a, b){ return b.sim - a.sim; });
    out = out.slice(0, 6);
  } catch(e) { Logger.log('[rassegna] ' + e.message); }
  return out;
}

/**
 * DIAGNOSTICA admin: rassegna stampa delle top-5 news per score degli ultimi
 * 7 giorni — per vedere quali storie hanno copertura multi-fonte.
 */
function rassegnaTopNews() {
  var rep = { ok: true, storie: [] };
  try {
    var news = (typeof getNewsListV42 === 'function') ? getNewsListV42(400) : [];
    var cutoff = Date.now() - 7 * 86400000;
    var recenti = (news || []).filter(function(n) {
      var d = n.data ? new Date(n.data) : null;
      return d && !isNaN(d.getTime()) && d.getTime() >= cutoff;
    });
    recenti.sort(function(a, b){ return Number(b.score || 0) - Number(a.score || 0); });
    recenti.slice(0, 5).forEach(function(n) {
      var ras = newsRassegnaStampa_(n.titolo, n.fonte, 45);
      rep.storie.push({ titolo: n.titolo, fonte: n.fonte, score: n.score,
        referenze: ras.map(function(r){ return r.fonte + ' (' + r.sim + ')'; }) });
    });
  } catch(e) { rep.ok = false; rep.error = e.message; }
  Logger.log('[rassegnaTopNews] ' + JSON.stringify(rep, null, 2));
  return rep;
}


// ============================================================================
// v4.27.51 — EDITORIALE → CODA SOCIAL (IG + LinkedIn)
// ----------------------------------------------------------------------------
// Richiesta Silvano 21/07: gli editoriali vanno pubblicati sui social come
// predisposto (Layer 1+2 esistenti). Questa funzione genera la bozza social
// dall'editoriale APPROVATO corrente e la mette in SocialQueue (stato draft →
// approvazione admin → pubblicazione col Layer 3 quando attivo).
// Idempotente per settimana (SourceId 'ED-<settimana>'). Viene chiamata
// automaticamente alla partenza della newsletter (adminConfirmSendWithToken).
// ============================================================================
function generateSocialDraftFromEditoriale(opts) {
  opts = opts || {};
  try {
    if (typeof getEditorialeCorrente !== 'function') return { ok: false, error: 'modulo editoriale assente' };
    var ed = getEditorialeCorrente();
    if (!ed || !ed.testo) return { ok: true, motivo: 'nessun_editoriale_approvato' };

    var srcId = 'ED-' + (ed.settimana || String(ed.titolo || '').toLowerCase().replace(/\W+/g, '').substring(0, 40));
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getDataRange().getValues(); var h = v[0];
      var iSid = h.indexOf('SourceId');
      for (var r = 1; r < v.length; r++) {
        if (String(v[r][iSid]) === srcId) return { ok: true, motivo: 'gia_in_coda', draftId: String(v[r][0]) };
      }
    }

    var pseudo = {
      id: srcId,
      titolo: ed.titolo || 'Editoriale della settimana',
      sommario: String(ed.testo || '').replace(/\s+/g, ' ').substring(0, 900),
      fonte: 'Editoriale Sinopia' + (ed.firma ? (' · ' + ed.firma) : ''),
      tematica: 'identita',
      ambito: 1,
      url: 'https://' + _getSocialDomain_()
    };
    var draft = _composeSocialDraft_(pseudo);
    if (!draft || !draft.captionIg || !draft.postLi) return { ok: false, error: 'compose_fallito' };

    var imageInfo = { imageUrl: ed.foto || '', imageSource: ed.foto ? 'editoriale' : 'none' };
    var draftId = 'SE' + new Date().getTime();
    _writeDraftToQueue_(draftId, pseudo, draft, imageInfo, 'editoriale');
    _sendSocialAlert_(draftId, { titolo: pseudo.titolo, tematica: 'editoriale', fonte: pseudo.fonte });
    Logger.log('✓ Social draft EDITORIALE creato: ' + draftId + ' · ' + pseudo.titolo.substring(0, 60));
    return { ok: true, draftId: draftId, titolo: pseudo.titolo, hasImage: !!ed.foto };
  } catch(e) {
    Logger.log('Social editoriale ERROR: ' + e.message);
    return { ok: false, error: e.message };
  }
}


// ============================================================================
// ENDPOINT ADMIN (chiamabili da UI o editor GAS)
// ============================================================================

function getSocialQueueList(filterStato, token) {
  try {
    if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
      return { ok:false, error:'forbidden' };
    }
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    if (!sh || sh.getLastRow() < 2) return { ok:true, items:[], total:0 };
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var items = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (filterStato && row[h.indexOf('Stato')] !== filterStato) continue;
      var obj = { _row: r + 1 };
      for (var c = 0; c < h.length; c++) {
        var v = row[c];
        if (v instanceof Date) v = v.toISOString();
        obj[h[c]] = v;
      }
      items.push(obj);
    }
    // Ordina per DataCreazione DESC
    items.sort(function(a,b){
      var da = a.DataCreazione ? new Date(a.DataCreazione).getTime() : 0;
      var db = b.DataCreazione ? new Date(b.DataCreazione).getTime() : 0;
      return db - da;
    });
    return { ok:true, items: items, total: items.length };
  } catch(e) { return { ok:false, error: e.message }; }
}

function approveSocialPost(draftId) {
  return _updateSocialStato_(draftId, 'approved');
}
function rejectSocialPost(draftId, motivo) {
  return _updateSocialStato_(draftId, 'rejected', motivo || '');
}

function _updateSocialStato_(draftId, nuovoStato, nota) {
  try {
    if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
      return { ok:false, error:'forbidden' };
    }
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    if (!sh || sh.getLastRow() < 2) return { ok:false, error:'queue_vuota' };
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var iId = h.indexOf('ID');
    var iStato = h.indexOf('Stato');
    var iApp = h.indexOf('ApprovatoDa');
    var iNote = h.indexOf('NoteAdmin');
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iId]) === String(draftId)) {
        sh.getRange(r + 1, iStato + 1).setValue(nuovoStato);
        if (iApp >= 0) {
          var em = '';
          try { em = Session.getEffectiveUser().getEmail() || ''; } catch(_){}
          sh.getRange(r + 1, iApp + 1).setValue(em);
        }
        if (nota && iNote >= 0) {
          sh.getRange(r + 1, iNote + 1).setValue(nota);
        }
        return { ok:true, draftId: draftId, stato: nuovoStato };
      }
    }
    return { ok:false, error:'draft_non_trovato' };
  } catch(e) { return { ok:false, error: e.message }; }
}

function updateSocialPost(body, token) {
  try {
    if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token || (body && body.__token))) {
      return { ok:false, error:'forbidden' };
    }
    body = body || {};
    if (!body.draftId) return { ok:false, error:'draftId_mancante' };
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    if (!sh) return { ok:false, error:'queue_assente' };
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var iId = h.indexOf('ID');
    var iCap = h.indexOf('CaptionInstagram');
    var iLi = h.indexOf('PostLinkedIn');
    var iAlt = h.indexOf('AltText');
    var iImg = h.indexOf('ImageUrl');
    var iImgSrc = h.indexOf('ImageSource');
    var iNote = h.indexOf('NoteAdmin');
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iId]) === String(body.draftId)) {
        if (body.captionIg != null && iCap >= 0)  sh.getRange(r + 1, iCap + 1).setValue(String(body.captionIg).substring(0, 2200));
        if (body.postLi    != null && iLi  >= 0)  sh.getRange(r + 1, iLi  + 1).setValue(String(body.postLi).substring(0, 3000));
        if (body.altText   != null && iAlt >= 0)  sh.getRange(r + 1, iAlt + 1).setValue(String(body.altText).substring(0, 125));
        if (body.imageUrl  != null && iImg >= 0) {
          sh.getRange(r + 1, iImg + 1).setValue(body.imageUrl);
          if (iImgSrc >= 0) sh.getRange(r + 1, iImgSrc + 1).setValue('manual');
        }
        if (body.noteAdmin != null && iNote >= 0) sh.getRange(r + 1, iNote + 1).setValue(String(body.noteAdmin));
        return { ok:true, draftId: body.draftId };
      }
    }
    return { ok:false, error:'draft_non_trovato' };
  } catch(e) { return { ok:false, error: e.message }; }
}

function regenerateSocialPost(draftId, token) {
  try {
    if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
      return { ok:false, error:'forbidden' };
    }
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SOCIAL_QUEUE_SHEET);
    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var iId = h.indexOf('ID');
    var iSrcId = h.indexOf('SourceId');
    var iTit = h.indexOf('NewsTitolo');
    var iUrl = h.indexOf('NewsUrl');
    var iFonte = h.indexOf('NewsFonte');
    var iTem = h.indexOf('Tematica');
    var iCap = h.indexOf('CaptionInstagram');
    var iLi = h.indexOf('PostLinkedIn');
    var iAlt = h.indexOf('AltText');
    var iHt = h.indexOf('Hashtags');
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iId]) !== String(draftId)) continue;
      // Ricostruisce news object dalla riga
      var news = {
        id: vals[r][iSrcId],
        titolo: vals[r][iTit],
        sommario: '', // ricarica da Items
        url: vals[r][iUrl],
        fonte: vals[r][iFonte],
        tematica: vals[r][iTem]
      };
      // Recupera sommario aggiornato da Items
      try {
        var shItems = ss.getSheetByName(SH.ITEMS || 'Items');
        var vI = shItems.getDataRange().getValues();
        var hI = vI[0];
        var iIid = hI.indexOf('ID'), iIs = hI.indexOf('SommarioAI');
        for (var ri = 1; ri < vI.length; ri++) {
          if (String(vI[ri][iIid]) === String(news.id)) {
            news.sommario = String(vI[ri][iIs] || ''); break;
          }
        }
      } catch(_){}
      var newDraft = _composeSocialDraft_(news);
      if (!newDraft) return { ok:false, error:'compose_fallito' };
      sh.getRange(r + 1, iCap + 1).setValue(newDraft.captionIg);
      sh.getRange(r + 1, iLi + 1).setValue(newDraft.postLi);
      sh.getRange(r + 1, iAlt + 1).setValue(newDraft.altText);
      if (iHt >= 0) sh.getRange(r + 1, iHt + 1).setValue((newDraft.hashtags || []).join(' '));
      return { ok:true, draftId: draftId, regenerated: true };
    }
    return { ok:false, error:'draft_non_trovato' };
  } catch(e) { return { ok:false, error: e.message }; }
}


// ============================================================================
// SETUP CREDENZIALI SOCIAL (placeholder per Layer 3 pubblicazione)
// ============================================================================

/**
 * Predispone le ScriptProperties placeholder per IG + LinkedIn.
 * Crea solo se non già esistenti — idempotente.
 * I valori reali vanno inseriti quando apri i profili sinopiaconsulting.
 *
 * Properties create:
 *   OC_SOCIAL_DOMAIN        — dominio CTA (default: sinopia.netlify.app)
 *   IG_HANDLE               — handle Instagram (default: sinopiaconsulting)
 *   IG_USER_ID              — id business IG (vuoto, da compilare)
 *   IG_ACCESS_TOKEN         — long-lived token Meta Graph (vuoto)
 *   LI_HANDLE               — handle LinkedIn (default: sinopiaconsulting)
 *   LI_ORG_URN              — urn:li:organization:XXXXXX (vuoto)
 *   LI_ACCESS_TOKEN         — token OAuth con w_organization_social (vuoto)
 */
function setupSocialCredentials(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
  var props = PropertiesService.getScriptProperties();
  var defaults = {
    OC_SOCIAL_DOMAIN: 'sinopia.netlify.app',
    IG_HANDLE: 'sinopiaconsulting',
    IG_USER_ID: '',
    IG_ACCESS_TOKEN: '',
    LI_HANDLE: 'sinopiaconsulting',
    LI_ORG_URN: '',
    LI_ACCESS_TOKEN: ''
  };
  var created = [], existing = [];
  Object.keys(defaults).forEach(function(k){
    var cur = props.getProperty(k);
    if (cur === null) {
      props.setProperty(k, defaults[k]);
      created.push(k);
    } else {
      existing.push(k);
    }
  });
  Logger.log('Social credentials: ' + created.length + ' create · ' + existing.length + ' esistenti');
  return {
    ok: true,
    created: created,
    existing: existing,
    note: 'Inserisci i valori reali (IG_USER_ID, IG_ACCESS_TOKEN, LI_ORG_URN, LI_ACCESS_TOKEN) quando apri i profili sinopiaconsulting.'
  };
}

/**
 * Ritorna lo stato delle credenziali social (per UI admin).
 * Mai mostra i token completi, solo lunghezza e presenza.
 */
function getSocialCredentialsStatus(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok:false, error:'forbidden' };
  }
  var props = PropertiesService.getScriptProperties();
  function _safeStatus(key) {
    var v = props.getProperty(key) || '';
    return { presente: !!v, length: v.length };
  }
  return {
    ok: true,
    domain: props.getProperty('OC_SOCIAL_DOMAIN') || 'sinopia.netlify.app (default)',
    instagram: {
      handle: props.getProperty('IG_HANDLE') || 'sinopiaconsulting',
      userIdSet: _safeStatus('IG_USER_ID'),
      accessTokenSet: _safeStatus('IG_ACCESS_TOKEN'),
      pronto_per_pubblicazione: !!(props.getProperty('IG_USER_ID') && props.getProperty('IG_ACCESS_TOKEN'))
    },
    linkedin: {
      handle: props.getProperty('LI_HANDLE') || 'sinopiaconsulting',
      orgUrnSet: _safeStatus('LI_ORG_URN'),
      accessTokenSet: _safeStatus('LI_ACCESS_TOKEN'),
      pronto_per_pubblicazione: !!(props.getProperty('LI_ORG_URN') && props.getProperty('LI_ACCESS_TOKEN'))
    }
  };
}

// ============================================================================
// FINE AgentSocial.js
// ============================================================================
