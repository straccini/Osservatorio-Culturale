/**
 * ============================================================================
 *  Constants.gs — Single Source of Truth per costanti condivise OC
 * ============================================================================
 *  Sprint 1.1 (INT-4 · 2026-04-29)
 *  Autore: Silvano Straccini / Duemilamusei
 *
 *  Scopo: centralizzare in UN SOLO file tutte le costanti condivise tra
 *  backend GAS e frontend HTML. Sostituisce le 4 dichiarazioni duplicate
 *  precedentemente sparse in:
 *    - Sidebar.html        (nomi e colori CSS)
 *    - HomeView.html       (nomi, descrizioni, colori)
 *    - Navigation.html     (oggetto JS AMBITI)
 *    - Codice.js           (AMBITO_LABEL, AMBITO_COLOR)
 *
 *  REGOLA: se un nome/colore/descrizione di ambito cambia, si modifica
 *  qui e basta. Il frontend riceve i dati via getOcConstants() in fase
 *  di hydrate iniziale.
 *
 *  Per la migrazione progressiva, le costanti AMBITO_LABEL e AMBITO_COLOR
 *  restano disponibili come alias backward-compatible (vedi fondo file)
 *  finché tutti i punti di chiamata legacy in Codice.js non sono migrati.
 *
 * ============================================================================
 */

// ============================================================================
// AMBITI TEMATICI (5)
// ============================================================================

/**
 * Source of truth dei 5 ambiti tematici dell'Osservatorio Culturale.
 * Ogni ambito ha: id, num (etichetta breve), nome (titolo lungo),
 * nomeBreve (per badge/tag), descrizione, color (hex), colorCls (var CSS).
 */
// Sprint 1.3 (2026-05-01): rinomina ambiti per allineamento Matrix v1.0.2.
// Codici interni (id, color, colorCls, cssVar) INVARIATI per retrocompatibilita.
// Mappatura ambiti -> dimensioni Matrix:
//   01 -> D1 (Identita) + D8 parz (Audience/storytelling)
//   02 -> D7 (Accessibilita ampliata: fisica/cognitiva/sensoriale/linguistica)
//   03 -> D2+D3+D4+D5 (i fondamentali del mestiere museale)
//   04 -> D8 (Audience) + D10 (Welfare culturale)
//   05 -> D6 (Digital maturity) + D9 (Governance/strategia/fundraising)
var OC_AMBITI = [
  {
    id: 1, num: '01',
    nome:      'Identita e narrazione museale',
    nomeBreve: 'Identita',
    desc:      'Identita del museo, posizionamento strategico, marca istituzionale e narrazione contemporanea. Storytelling, branding museale e visione dinsieme.',
    matrixDims: ['D1','D8'],
    color:     '#6B5C9A',
    colorCls:  'a1',
    cssVar:    '--amb-1'
  },
  {
    id: 2, num: '02',
    nome:      'Inclusione e accessibilita',
    nomeBreve: 'Inclusione',
    desc:      'Accessibilita ampliata: fisica, cognitiva, sensoriale, linguistica. Easy-to-Read, percorsi tattili, sottotitolazione, mediazione plurilingue. Pubblici fragili e diritto culturale.',
    matrixDims: ['D7'],
    color:     '#3F7A5E',
    colorCls:  'a2',
    cssVar:    '--amb-2'
  },
  {
    id: 3, num: '03',
    nome:      'Programma, mostre e collezioni',
    nomeBreve: 'Programma',
    desc:      'Programma educativo, mostre temporanee, gestione collezioni, conservazione, ricerca scientifica, allestimenti permanenti e servizi al visitatore. I fondamentali del mestiere museale.',
    matrixDims: ['D2','D3','D4','D5'],
    color:     '#3C6A95',
    colorCls:  'a3',
    cssVar:    '--amb-3'
  },
  {
    id: 4, num: '04',
    nome:      'Comunita e welfare culturale',
    nomeBreve: 'Comunita',
    desc:      'Audience engagement, comunita locali, partecipazione, welfare culturale e impatto sociale. Programmi per pubblici fragili, partnership territoriali, rigenerazione.',
    matrixDims: ['D8','D10'],
    color:     '#9C6A36',
    colorCls:  'a4',
    cssVar:    '--amb-4'
  },
  {
    id: 5, num: '05',
    nome:      'Digital, AI e governance',
    nomeBreve: 'Digital & Gov',
    desc:      'Maturita digitale, AI applicata al patrimonio, dati e KPI, infrastruttura tecnologica, governance, partnership istituzionali, fundraising e sostenibilita economica.',
    matrixDims: ['D6','D9'],
    color:     '#4A7884',
    colorCls:  'a5',
    cssVar:    '--amb-5'
  }
];

// ============================================================================
// VERSIONE WEBAPP
// ============================================================================

var OC_VERSION = 'v4.18.63';
var OC_VERSION_DATE = '2026-05-16';
var OC_VERSION_NOTES = 'Sprint 2-5 anticipati (2026-05-11) - tutto in codebase locale, deploy non eseguito. SPRINT 2: schema unificato fonti 14 colonne (Fonti_v1.js), migrazione SocialFonti->FontiNews + split video (FontiMigration_v1.js), tab unica Tutte le Fonti in admin con filtri Tipo/Stato/Attiva + ricerca + counters dashboard. Toggle accessibilita topbar Aa+ piu visibile. SPRINT 3: Matrix radar chart Chart.js nel report con benchmark dinamico (Matrix_benchmark_v1.js - mediana/percentili compilatori). Card esplicativa Matrix in home con 3 pittogrammi + CTA dominante. SPRINT 4: CRM_v1.js con lead scoring automatico secondo tabella punti (compilazione+10 / opt-in followup+30 / click servizio+5 / digest open+1...). Notifica Telegram lead hot >=30pt. Privacy_v1.js con UTM tracking endpoint, right-to-be-forgotten /forget, pagina /trasparenza con dati aggregati anonimi. SPRINT 5: ROC_v1.js Radar Opportunita Cultura - 5 moduli outbound bando-driven (triage 4 filtri AND, notify Telegram, match musei, email batch personalizzate, approvazione manuale Silvano). Database MuseiDB_v1.tsv con 260 musei italiani curati. Cap pre-progettazioni 5-8/mese. Tono email noi Duemilamusei + firma Silvano. Da eseguire manualmente post-deploy: setupLibriSeed, runFullMigration_Fonti, roc_setupMuseiDB + import CSV MuseiDB_v1.tsv. Backend mancanti Sprint 1 risolti in Backend_v415.js (saveLibro, setupLibriSeed, saveNorma, invitaUtenteSendEmail, exportArchivio, emptyTrash).';

// ============================================================================
// SOGLIE OPERATIVE
// ============================================================================

var OC_BANDI_URGENTI_DAYS = 7;     // soglia "in scadenza" per la home
var OC_AUTO_ARCH_NEWS_DAYS = 30;   // dopo quanti giorni archiviare news non salvate
var OC_AUTO_ARCH_BANDI_DAYS = 30;  // dopo quanti giorni dalla scadenza archiviare bandi
var OC_AUTO_DELETE_MONTHS = 12;    // dopo quanti mesi eliminare definitivamente archiviati

// v4.18.10 (2026-05-12) — URL del calendario condiviso per prenotazione consulenza gratuita
// FALLBACK statico. Il valore attivo viene letto da ScriptProperties via getCommercialConfig()
// (configurabile da card admin "Setup commerciale" — più professionale di editare codice).
var OC_CALENDAR_URL = '';

// v4.18.18 (2026-05-13) — URL PDF Musei Sensibili (documento strategico scaricabile dalla home)
// Stesso pattern: fallback statico + valore dinamico in ScriptProperties.
var OC_MUSEI_SENSIBILI_URL = '';

// v4.18.33 (2026-05-13) — URL branding visivo (logo sidebar + immagine hero home)
// Caricare i file su Drive con permission "Chiunque con link può visualizzare"
// e incollare l'URL nella card admin "Setup commerciale".
// Formato URL Drive supportato: drive.google.com/file/d/{ID}/view oppure /uc?id={ID}
var OC_LOGO_URL = '';
var OC_HERO_IMAGE_URL = '';

// ScriptProperty keys
var OC_PROP_KEY_COMMERCIAL = 'OC_COMMERCIAL_CONFIG_V1';

// ============================================================================
// API PUBBLICA — chiamata da Navigation.html in fase di hydrate
// ============================================================================

/**
 * Restituisce al frontend tutte le costanti utili per il rendering.
 * Chiamata via google.script.run.getOcConstants() in fase di hydrate.
 *
 * @return {Object}
 *   {
 *     ambiti:  Array<{id,num,nome,nomeBreve,desc,color,colorCls,cssVar}>,
 *     version: { number, date, notes },
 *     soglie:  { bandiUrgentiDays, autoArchNewsDays, ... }
 *   }
 */
function getOcConstants() {
  return {
    ambiti: OC_AMBITI,
    version: {
      number: OC_VERSION,
      date:   OC_VERSION_DATE,
      notes:  OC_VERSION_NOTES
    },
    soglie: {
      bandiUrgentiDays:  OC_BANDI_URGENTI_DAYS,
      autoArchNewsDays:  OC_AUTO_ARCH_NEWS_DAYS,
      autoArchBandiDays: OC_AUTO_ARCH_BANDI_DAYS,
      autoDeleteMonths:  OC_AUTO_DELETE_MONTHS
    },
    // v4.18.10/v4.18.18/v4.18.33 — Config commerciale (priorità: ScriptProperties → fallback Constants.js)
    calendarUrl:        _getCommercialField_('calendarUrl', OC_CALENDAR_URL),
    museiSensibiliUrl:  _getCommercialField_('museiSensibiliUrl', OC_MUSEI_SENSIBILI_URL),
    logoUrl:            _normalizeDriveUrl_(_getCommercialField_('logoUrl', OC_LOGO_URL)),
    heroImageUrl:       _normalizeDriveUrl_(_getCommercialField_('heroImageUrl', OC_HERO_IMAGE_URL))
  };
}

/**
 * v4.18.41 (2026-05-15) — Canonicalizza un URL per uso in chiavi di deduplicazione.
 *
 * Normalizza: lowercase, rimuove www., protocollo, trailing slash, anchor,
 * parametri di tracking (utm_*, fbclid, gclid, msclkid, ref, source, share).
 * Stessa risorsa con varianti diverse → stessa chiave.
 *
 * Esempi:
 *   https://www.Example.com/Articolo/?utm_source=feed#top
 *   http://example.com/Articolo
 *   → "example.com/articolo"
 *
 * @param {string} url
 * @return {string} URL canonicalizzato (chiave di dedup) — '' se url vuoto
 */
function _canonicalUrl_(url) {
  if (!url) return '';
  var u = String(url).trim().toLowerCase();
  // Rimuovi protocollo
  u = u.replace(/^https?:\/\//, '');
  // Rimuovi www.
  u = u.replace(/^www\./, '');
  // Rimuovi anchor (#frammenti)
  u = u.replace(/#.*$/, '');
  // Rimuovi parametri di tracking
  u = u.replace(/[?&](utm_[a-z]+|fbclid|gclid|msclkid|ref|source|share|mc_cid|mc_eid|_ga|_gl)=[^&]*/g, '');
  // Pulisci ?& orfani residui
  u = u.replace(/\?&/, '?').replace(/&&+/g, '&').replace(/\?$/, '').replace(/&$/, '');
  // Rimuovi trailing slash (dopo aver tolto query)
  u = u.replace(/\/+$/, '');
  return u;
}

/**
 * v4.18.35 — Risolve URL Drive in data URI per embed in <img src>.
 *
 * Apps Script iframe blocca quasi tutti gli endpoint Drive (thumbnail, uc?export=view, lh3…)
 * per anti-clickjacking. Soluzione: leggere il file via DriveApp server-side e
 * ritornare il binario come data:image/...;base64,... — embeddato nel payload getOcConstants.
 *
 * Se il file non è accessibile via DriveApp (es. file di altro proprietario senza condivisione
 * esplicita), fallback all'URL Drive normalizzato (potrebbe comunque non rendere).
 *
 * @param {string} url - URL Drive in qualunque forma
 * @return {string} data URI oppure URL fallback
 */
function _normalizeDriveUrl_(url) {
  if (!url) return '';
  var s = String(url).trim();
  if (/^data:image\//i.test(s)) return s; // già data URI

  // Estrai ID Drive da tutte le forme note
  var id = '';
  var m = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  if (!id) { var m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/); if (m2) id = m2[1]; }
  if (!id) return s; // URL esterno, non Drive

  // Cache lookup (6h) — evita re-encoding ad ogni getOcConstants
  var cache = null, cacheKey = 'oc_asset_v1_' + id;
  try { cache = CacheService.getScriptCache(); } catch(_){}
  if (cache) {
    var cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  // Prova a leggere via DriveApp e ritornare data URI
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    var mime = blob.getContentType() || 'image/png';
    if (mime.indexOf('image/') !== 0) return s; // non è un'immagine
    var b64 = Utilities.base64Encode(blob.getBytes());
    var dataUri = 'data:' + mime + ';base64,' + b64;
    // Cache solo se < 100KB (limite CacheService per chiave)
    if (cache && dataUri.length < 99000) {
      try { cache.put(cacheKey, dataUri, 21600); } catch(_){}
    }
    return dataUri;
  } catch(e) {
    Logger.log('_normalizeDriveUrl_ DriveApp fallita per ID=' + id + ': ' + e.message);
    return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
  }
}

// ============================================================================
// v4.18.18 (2026-05-13) — CONFIG COMMERCIALE DINAMICA (ScriptProperties)
// ----------------------------------------------------------------------------
// Permette di configurare URL operativi (calendario consulenza, PDF Musei Sensibili,
// e in futuro altri) direttamente dalla card admin senza editare codice/deployare.
// Storage: chiave OC_PROP_KEY_COMMERCIAL in ScriptProperties (JSON).
// ============================================================================

/**
 * Helper privato: legge un campo dalla config commerciale (ScriptProperties),
 * fallback al valore statico passato come default.
 */
function _getCommercialField_(field, defaultValue) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(OC_PROP_KEY_COMMERCIAL);
    if (!raw) return defaultValue || '';
    var cfg = JSON.parse(raw);
    return (cfg && typeof cfg[field] === 'string' && cfg[field]) ? cfg[field] : (defaultValue || '');
  } catch(e) { return defaultValue || ''; }
}

/**
 * Endpoint admin: ritorna la config commerciale attuale (per popolare form).
 */
function getCommercialConfig() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(OC_PROP_KEY_COMMERCIAL);
    var cfg = raw ? JSON.parse(raw) : {};
    return {
      ok: true,
      calendarUrl: cfg.calendarUrl || OC_CALENDAR_URL || '',
      museiSensibiliUrl: cfg.museiSensibiliUrl || OC_MUSEI_SENSIBILI_URL || '',
      logoUrl: cfg.logoUrl || OC_LOGO_URL || '',
      heroImageUrl: cfg.heroImageUrl || OC_HERO_IMAGE_URL || '',
      lastUpdate: cfg.lastUpdate || ''
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * Endpoint admin: salva la config commerciale in ScriptProperties.
 * @param {Object} payload — { calendarUrl, museiSensibiliUrl, logoUrl, heroImageUrl }
 */
function saveCommercialConfig(payload) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  try {
    payload = payload || {};
    // Validazione URL (basic): se non vuoti, devono iniziare con http(s):// (data URI accettati per i 2 visual)
    var cal  = String(payload.calendarUrl || '').trim();
    var ms   = String(payload.museiSensibiliUrl || '').trim();
    var lg   = String(payload.logoUrl || '').trim();
    var hi   = String(payload.heroImageUrl || '').trim();
    function isUrlOk(u) { return /^https?:\/\//i.test(u) || /^data:image\//i.test(u); }
    if (cal && !/^https?:\/\//i.test(cal)) return { ok:false, error:'URL calendario non valido' };
    if (ms  && !/^https?:\/\//i.test(ms))  return { ok:false, error:'URL Musei Sensibili non valido' };
    if (lg  && !isUrlOk(lg))               return { ok:false, error:'URL logo non valido' };
    if (hi  && !isUrlOk(hi))               return { ok:false, error:'URL immagine hero non valido' };

    var cfg = {
      calendarUrl: cal,
      museiSensibiliUrl: ms,
      logoUrl: lg,
      heroImageUrl: hi,
      lastUpdate: new Date().toISOString()
    };
    PropertiesService.getScriptProperties().setProperty(OC_PROP_KEY_COMMERCIAL, JSON.stringify(cfg));
    Logger.log('saveCommercialConfig OK: cal=' + (cal?'set':'empty') + ' ms=' + (ms?'set':'empty') + ' lg=' + (lg?'set':'empty') + ' hi=' + (hi?'set':'empty'));
    return { ok:true, calendarUrl:cal, museiSensibiliUrl:ms, logoUrl:lg, heroImageUrl:hi, lastUpdate:cfg.lastUpdate };
  } catch(e) { return { ok:false, error: e.message }; }
}

// v4.18.39 (audit 2026-05-14) — Rimossa getAmbitoById(id): helper definito ma mai chiamato.
//   Se necessario in futuro, lookup diretto: OC_AMBITI.filter(a => a.id === Number(id))[0]

// ============================================================================
// NOTA SU ALIAS BACKWARD-COMPATIBLE
// ----------------------------------------------------------------------------
// In una prima versione di questo file erano presenti le dichiarazioni:
//   var AMBITO_LABEL = { ... };
//   var AMBITO_COLOR = { ... };
//   var AMBITO_DESC  = { ... };
// concepite come alias backward-compatible per non dover migrare subito i
// call site legacy. Sono state RIMOSSE perché in Google Apps Script tutti i
// file .gs condividono lo stesso namespace globale, e Codice.gs dichiara già
// `const AMBITO_LABEL` e `const AMBITO_COLOR` (vedi Codice.gs righe 42 e 47).
// La doppia dichiarazione causava SyntaxError "Identifier 'AMBITO_LABEL' has
// already been declared" bloccando l'intero progetto.
//
// Per ora i call site legacy continuano a usare le costanti dichiarate in
// Codice.gs. La migrazione progressiva verso OC_AMBITI / getAmbitoById /
// getOcConstants() avverrà nei prossimi sprint, sostituendo i riferimenti
// uno alla volta nei file che li usano (Codice.gs, Addon_v42.gs,
// Sprint0_Module.gs).
// ============================================================================

// ============================================================================
// LANDING PUBBLICA — flag per servire LandingPublic.html come homepage anonima
// ============================================================================

/** Attiva la landing pubblica come homepage di default per utenti anonimi. */
function enablePublicLanding() {
  PropertiesService.getScriptProperties().setProperty('OC_PUBLIC_LANDING', 'true');
  Logger.log('Landing pubblica ATTIVATA. URL base servira LandingPublic.html per anonimi.');
  return { ok: true, status: 'enabled' };
}

/** Disattiva la landing pubblica (torna a servire la webapp completa). */
function disablePublicLanding() {
  PropertiesService.getScriptProperties().deleteProperty('OC_PUBLIC_LANDING');
  Logger.log('Landing pubblica DISATTIVATA. URL base servira la webapp completa.');
  return { ok: true, status: 'disabled' };
}

// ============================================================================
// FINE Constants.gs
// ============================================================================
