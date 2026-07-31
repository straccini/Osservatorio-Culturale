// v4.22 PERF — Lazy config: PropertiesService lette UNA volta (on-demand), non a parse-time.
// Prima: 8 getProperty() ad ogni esecuzione GAS (anche per funzioni che non le usano).
// Dopo: 1 getProperties() alla prima chiamata, poi cache in-memory.
var _OC_CONFIG_CACHE_ = null;
function _getConfig_() {
  if (_OC_CONFIG_CACHE_) return _OC_CONFIG_CACHE_;
  var p = PropertiesService.getScriptProperties().getProperties();
  _OC_CONFIG_CACHE_ = {
    CLAUDE_API_KEY:   p.CLAUDE_API_KEY || '',
    ADMIN_PWD:        p.ADMIN_PASSWORD || '',
    EDITOR_PWD:       p.EDITOR_PASSWORD || '',
    TELEGRAM_TOKEN:   p.TELEGRAM_TOKEN || p.TELEGRAM_BOT_TOKEN || '',  // v4.23 FIX — unifica le 2 chiavi-token (TELEGRAM_TOKEN / TELEGRAM_BOT_TOKEN) usate dai 2 sottosistemi
    TELEGRAM_CHAT_ID: p.TELEGRAM_CHAT_ID || '',
    GIORNI_ALERT:     parseInt(p.GIORNI_SCADENZA_ALERT || '10'),
    SHEET_ID:         p.SHEET_ID || ''
  };
  return _OC_CONFIG_CACHE_;
}

// Backward-compat: costanti lazy (le vecchie const erano parse-time, ora sono getter)
// Usare _getConfig_().CAMPO nelle nuove funzioni.
var SHEET_ID; // inizializzata sotto dopo getMainSS
try { SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || ''; } catch(_) { SHEET_ID = ''; }
// Le altre costanti legacy diventano funzioni getter per retrocompatibilita
function _claudeKey_()    { return _getConfig_().CLAUDE_API_KEY; }
function _telegramToken_(){ return _getConfig_().TELEGRAM_TOKEN; }
function _telegramChat_() { return _getConfig_().TELEGRAM_CHAT_ID; }
function _giorniAlert_()  { return _getConfig_().GIORNI_ALERT; }

// Backward-compat alias: le vecchie const globali ora sono var lazy
// (le funzioni che le usano le leggono a runtime, non a parse-time)
var CLAUDE_API_KEY, ADMIN_PWD, EDITOR_PWD, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, GIORNI_ALERT;
function _initLegacyConsts_() {
  var c = _getConfig_();
  CLAUDE_API_KEY = c.CLAUDE_API_KEY; ADMIN_PWD = c.ADMIN_PWD; EDITOR_PWD = c.EDITOR_PWD;
  TELEGRAM_TOKEN = c.TELEGRAM_TOKEN; TELEGRAM_CHAT_ID = c.TELEGRAM_CHAT_ID; GIORNI_ALERT = c.GIORNI_ALERT;
}

// v4.22 PERF — Singleton: evita openById ripetuti nella stessa esecuzione GAS
var _mainSS_cached_ = null;
function getMainSS() {
  if (_mainSS_cached_) return _mainSS_cached_;
  if (SHEET_ID) { _mainSS_cached_ = SpreadsheetApp.openById(SHEET_ID); return _mainSS_cached_; }
  try {
    const parents = DriveApp.getFileById(ScriptApp.getScriptId()).getParents();
    if (parents.hasNext()) { _mainSS_cached_ = SpreadsheetApp.open(parents.next()); return _mainSS_cached_; }
  } catch(e) {}
  throw new Error('Aggiungi SHEET_ID nelle Script Properties del progetto');
}

const COL = {
  DATA_RILEVAMENTO: 1, TITOLO: 2, ENTE: 3, LIVELLO: 4, REGIONE: 5,
  SETTORE: 6, SOGGETTI: 7, IMPORTO: 8, COFIN: 9, SCADENZA: 10,
  STATUS: 11, CLIENTE: 12, LINK: 13, NOTE: 14, FONTE: 15,
  PRIORITA: 16, NASCOSTO: 17,
  STATO_RECORD: 18,  // * v3.0: attivo | archiviato
  URL_ENTE:     19,  // * v3.0: homepage ente pubblicante
  LETTO_BANDO:  20,  // * v3.1: true | false (flag lettura bando)
  DESCRIZIONE:  21,  // * v4.27: descrizione testuale arricchita via Claude API
  TIPO_APPALTO: 22,  // * v4.27: servizi|forniture|lavori|misto|finanziamento
};

const SHEET_RADAR = 'RADAR BANDI';

const SH = {
  ITEMS: 'Items', BANDI: 'Bandi', FONTI: 'Fonti',
  MAILING: 'MailingList', LOG: 'DigestLog',
  PODCAST: 'Podcast',     // * v3.2
  LIBRI: 'Pubblicazioni'  // * Sprint N4
};

// Sprint 1.3 (2026-05-01): rinomina ambiti per allineamento Matrix
const AMBITO_LABEL = {
  1:'Identita e narrazione museale', 2:'Inclusione e accessibilita',
  3:'Programma, mostre e collezioni', 4:'Comunita e welfare culturale',
  5:'Digital, AI e governance'
};
const AMBITO_COLOR = { 1:'#6B5C9A', 2:'#3F7A5E', 3:'#3C6A95', 4:'#9C6A36', 5:'#4A7884' };

// Helper escape HTML per output sicuro nei messaggi di errore / pagine login
function escTok_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ============================================================================
// doGet sub-handlers — estratti per ridurre CC (Sprint DRY 2026-05-26)
// ============================================================================

function _doGetLanding() {
  return HtmlService.createHtmlOutputFromFile('LandingPublic')
    .setTitle('Sinopia · Osservatorio Culturale — Piattaforma per Musei e Patrimonio Culturale')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width,initial-scale=1');
}

function _doGetSurvey(params) {
  var surveyTemplate = HtmlService.createTemplateFromFile('SurveyPublic');
  surveyTemplate.surveyCode = String(params.survey).trim();
  return surveyTemplate.evaluate()
    .setTitle('Sondaggio MuseMu Matrix — Autovalutazione Musei')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width,initial-scale=1');
}

function _doGetReader(params) {
  if (typeof renderDigestReaderPage === 'function') {
    return renderDigestReaderPage(params.t);
  }
  return HtmlService
    .createHtmlOutput('<h1>Digest Reader</h1><p>Token: ' + escTok_(params.t) + '</p>')
    .setTitle('Osservatorio \xb7 Digest')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet(e) {
  _initLegacyConsts_(); // v4.22 PERF — lazy init delle costanti config
  var params = (e && e.parameter) || {};

  // ---------- 0-warm) Keep-warm self-ping (?warm=1) — vedi KeepWarm_v1.js ----------
  // Causa principale della "pagina bianca" all'avvio: Google deve caricare/compilare
  // il progetto GAS in una nuova istanza V8 (cold start) prima di servire la pagina.
  // Un ping periodico a ?warm=1 tiene calda l'istanza: risposta ultraleggera, NON
  // assembla né trasferisce l'HTML. Non tocca il flusso di caricamento normale.
  if (params.warm) {
    return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
  }

  // v4.19.1 — Bootstrap check: se mancano le dipendenze critiche, pagina di errore
  var _bootErrors = [];
  if (!SHEET_ID) _bootErrors.push('SHEET_ID mancante nelle ScriptProperties');
  if (!CLAUDE_API_KEY) _bootErrors.push('CLAUDE_API_KEY mancante nelle ScriptProperties');
  try { if (typeof OC_MATRIX_SCHEMA === 'undefined' || !OC_MATRIX_SCHEMA) _bootErrors.push('Matrix_schema non caricato'); } catch(_){}
  if (_bootErrors.length > 0) {
    return HtmlService.createHtmlOutput(
      '<h2 style="color:#935851;font-family:sans-serif">Sinopia — Errore di configurazione</h2>'
      + '<p style="font-family:sans-serif">L\'app non puo avviarsi. Problemi rilevati:</p>'
      + '<ul style="font-family:sans-serif">' + _bootErrors.map(function(e){ return '<li>'+e+'</li>'; }).join('') + '</ul>'
      + '<p style="font-family:sans-serif;color:#666">Configura le ScriptProperties nel pannello GAS e rideploya.</p>'
    ).setTitle('Sinopia — Setup richiesto');
  }

  // v4.18.1 (2026-05-11) — Token admin URL: ?adm=TOKEN attiva sessione admin 24h
  if (params.adm) {
    try {
      if (typeof checkAdminSession === 'function') {
        var ok = checkAdminSession(params);
        Logger.log('doGet token admin check: ' + (ok ? 'OK' : 'INVALID'));
      }
    } catch(err) { Logger.log('checkAdminSession err: ' + err.message); }
  }

  // ---------- 0a) Landing pubblica — URL base senza parametri + utente anonimo ----------
  // Su deploy ANYONE: getActiveUser() restituisce l'email (utente loggato)
  // Su deploy ANYONE_ANONYMOUS: getActiveUser() restituisce '' (anonimo)
  var _hasAnyParam = false;
  for (var _pk in params) { if (params.hasOwnProperty(_pk)) { _hasAnyParam = true; break; } }
  // v4.18.66 — Gate landing rimosso: utenti anonimi accedono all'app completa (L0 freemium).
  // Il frontend gestisce le restrizioni L0 (azioni protette richiedono registrazione).
  // LandingPublic.html resta disponibile via ?landing=1 se serve.
  if (params.landing === '1') return _doGetLanding();

  // v4.27.59 — Trend: lancio proposta via URL (?trend=proponi). SENZA force:
  // la guardia delle 44h dentro trendProponi rende l'endpoint non abusabile
  // (al massimo anticipa una proposta già dovuta).
  if (params.trend === 'proponi') {
    var _tp;
    // &rinnova=sinopia2026: scarta l'eventuale pendente e rivaluta subito
    // (chiave fissa nel codice: basta a impedire lo spam Telegram anonimo)
    var _tpForce = (params.rinnova === 'sinopia2026');
    try { _tp = trendProponi(_tpForce ? { force: true, sostituisciPendente: true } : {}); }
    catch (eTp) { _tp = { ok: false, errore: eTp.message }; }
    return ContentService.createTextOutput(JSON.stringify(_tp, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }

  // v4.27.59 — Trend: esito approvazione da link Telegram (?trend=ok|no&id=&tk=)
  if (params.trend === 'ok' || params.trend === 'no') {
    try { return _trRenderEsitoPage_(params); }
    catch (eTr) { return HtmlService.createHtmlOutput('<p>Errore: ' + String(eTr.message).replace(/</g, '&lt;') + '</p>'); }
  }

  // v4.27.39 — Diagnostica contatori NEW via URL (?diag=contatori): solo conteggi
  // aggregati e titoli di concorsi pubblici GU — nessun dato sensibile. Serve a
  // verificare i badge settimanali senza passare dall'editor GAS.
  // v4.27.73 — Diagnostica gate bandi (?diag=bandi): SOLA LETTURA. Esegue il
  // self-test del gate e verifica quanti bandi realmente serviti verrebbero
  // scartati dai filtri (auguri/junk/senza-info), con esempi.
  if (params.diag === 'bandi') {
    var _dgB = { versione: (typeof OC_VERSION !== 'undefined' ? OC_VERSION : '?') };
    try { _dgB.selfTest = (typeof bandiGateSelfTest === 'function') ? bandiGateSelfTest() : 'assente'; }
    catch (e1) { _dgB.selfTestErrore = e1.message; }
    try {
      var _serviti = (typeof getBandiListV42 === 'function') ? getBandiListV42(2000) : [];
      var _scarti = { junk: 0, motivo: 0, esempi: [] };
      _serviti.forEach(function (b) {
        var j = (typeof _bandiNonBando_ === 'function') && _bandiNonBando_(b);
        var m = (typeof _bandiMotivoScarto_ === 'function') ? _bandiMotivoScarto_(b) : '';
        if (j || m) {
          if (j) _scarti.junk++; else _scarti.motivo++;
          if (_scarti.esempi.length < 12) _scarti.esempi.push(String(b.titolo || '').substring(0, 70) + ' [' + (j ? 'junk' : m) + ']');
        }
      });
      _dgB.serviti = _serviti.length;
      _dgB.nonPertinentiAncoraEsposti = _scarti;
    } catch (e2) { _dgB.scanErrore = e2.message; }
    // v4.27.74 — DANNO DA SCHEMA MISTO: il vecchio schema COL (indici del
    // foglio RADAR) veniva applicato a Bandi_v5, che ha COL_B. Collisioni:
    // COL.LETTO_BANDO=20 → COL_B.SOMMARIO (il "letto" cancellava la
    // descrizione), COL.STATO_RECORD=18 → COL_B.URL_VALIDATO.
    try {
      var _ss = getMainSS(), _sh = _ss.getSheetByName('Bandi_v5');
      if (_sh && _sh.getLastRow() > 1) {
        var _v = _sh.getDataRange().getValues();
        var _d = { righe: _v.length - 1, sommarioBooleano: 0, urlValidatoStato: 0, header20: String(_v[0][19]||''), header18: String(_v[0][17]||'') };
        for (var _r = 1; _r < _v.length; _r++) {
          var _som = _v[_r][COL_B.SOMMARIO - 1];
          if (_som === true || _som === false || /^(true|false)$/i.test(String(_som||''))) _d.sommarioBooleano++;
          var _uv = String(_v[_r][COL_B.URL_VALIDATO - 1] || '').toLowerCase();
          if (_uv === 'archiviato' || _uv === 'attivo') _d.urlValidatoStato++;
        }
        _dgB.dannoSchemaMisto = _d;
      }
    } catch (e4) { _dgB.dannoErrore = e4.message; }
    try {
      _dgB.archivio = (typeof bcvArchiviati === 'function') ? { totale: bcvArchiviati(2000).length, primi: bcvArchiviati(3) } : 'modulo assente';
      _dgB.purgeSimulata = (typeof bcvPurgeArchiviati === 'function') ? bcvPurgeArchiviati({ dryRun: true }) : 'modulo assente';
      _dgB.regioneSimulata = (typeof bcvNormalizzaRegione === 'function') ? bcvNormalizzaRegione({ dryRun: true, cap: 2000 }) : 'modulo assente';
      _dgB.bcvSelfTest = (typeof bcvSelfTest === 'function') ? bcvSelfTest() : 'modulo assente';
      _dgB.frSelfTest = (typeof frSelfTest === 'function') ? frSelfTest() : 'modulo assente';
      _dgB.tierFonti = (typeof frBackfillTier === 'function') ? frBackfillTier({ dryRun: true }) : 'modulo assente';
      _dgB.saluteFonti = (typeof frSaluteFonti === 'function') ? frSaluteFonti() : 'modulo assente';
      // distribuzione REALE dei valori Regione tra i bandi serviti: serve a
      // capire perché la mappa mostra poche bolle
      var _srv = (typeof getBandiListV42 === 'function') ? getBandiListV42(2000) : [];
      var _dist = {}, _tierDist = {};
      _srv.forEach(function (b) {
        var k = String(b.regione || '(vuoto)').trim() || '(vuoto)';
        _dist[k] = (_dist[k] || 0) + 1;
        var t = (typeof frTierBando === 'function') ? frTierBando(b) : '?';
        _tierDist[t] = (_tierDist[t] || 0) + 1;
      });
      _dgB.regioniServiti = _dist;
      _dgB.tierServiti = _tierDist;
    } catch (e5) { _dgB.cicloVitaErrore = e5.message; }
    return ContentService.createTextOutput(JSON.stringify(_dgB, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }

  // v4.27.80 — ANALISI FONTI E SCADENZE (?diag=fonti): sola lettura.
  // Risponde a tre domande con i DATI, non con le colonne di servizio:
  //  1) da quali fonti sono arrivati bandi, e QUANDO l'ultimo (la colonna
  //     UltimaScan non è affidabile: i connettori API non la aggiornano)
  //  2) i bandi attivi hanno la scadenza? quanti sono scaduti davvero?
  //  3) i fogli fonti sono allineati o ce ne sono di morti?
  if (params.diag === 'fonti') {
    var _f = { versione: (typeof OC_VERSION !== 'undefined' ? OC_VERSION : '?') };
    try {
      var _ssf = getMainSS();
      // -- 1) fogli fonti esistenti e loro stato
      _f.fogliFonti = {};
      ['FontiBandi_v5', 'FontiFeed', 'Fonti', 'FontiBandi', 'FontiAgenti'].forEach(function (n) {
        var s = _ssf.getSheetByName(n);
        if (!s) { _f.fogliFonti[n] = 'ASSENTE'; return; }
        var lr = s.getLastRow();
        var info = { righe: Math.max(0, lr - 1), scan7gg: 0, scan30gg: 0, maiScansionate: 0 };
        if (lr > 1) {
          var vv = s.getDataRange().getValues();
          var hh = vv[0].map(function (x) { return String(x || '').trim(); });
          var iS = hh.indexOf('UltimaScan'); if (iS < 0) iS = hh.indexOf('UltimaScansione');
          if (iS >= 0) {
            var now = Date.now();
            for (var q = 1; q < vv.length; q++) {
              var dd = vv[q][iS];
              var dt = (dd instanceof Date) ? dd : (dd ? new Date(dd) : null);
              if (!dt || isNaN(dt.getTime())) { info.maiScansionate++; continue; }
              var age = now - dt.getTime();
              if (age <= 7 * 86400000) info.scan7gg++;
              if (age <= 30 * 86400000) info.scan30gg++;
            }
          } else info.nota = 'colonna UltimaScan assente';
        }
        _f.fogliFonti[n] = info;
      });

      // -- 2) bandi ATTIVI in Bandi_v5: scadenze e freschezza per fonte
      var shB = _ssf.getSheetByName('Bandi_v5');
      var perFonte = {}, scad = { conScadenza: 0, senzaScadenza: 0, scaduti: 0, futuri: 0 };
      var oggi0 = new Date(); oggi0.setHours(0, 0, 0, 0);
      if (shB && shB.getLastRow() > 1) {
        var vb = shB.getDataRange().getValues();
        for (var rb = 1; rb < vb.length; rb++) {
          var row = vb[rb];
          if (!row[COL_B.ID - 1]) continue;
          if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
          var fn = String(row[COL_B.FONTE_NOME - 1] || row[COL_B.FONTE_ID - 1] || '(senza fonte)').trim() || '(senza fonte)';
          if (!perFonte[fn]) perFonte[fn] = { attivi: 0, ultimoRilev: '', _ts: 0, conScad: 0, scaduti: 0 };
          var P = perFonte[fn];
          P.attivi++;
          var dr = row[COL_B.DATA_RILEVAMENTO - 1];
          var drt = (dr instanceof Date) ? dr : (dr ? new Date(dr) : null);
          if (drt && !isNaN(drt.getTime()) && drt.getTime() > P._ts) {
            P._ts = drt.getTime();
            P.ultimoRilev = Utilities.formatDate(drt, 'Europe/Rome', 'dd/MM/yyyy');
          }
          var sc = row[COL_B.SCADENZA - 1];
          var sct = (sc instanceof Date) ? sc : (sc ? new Date(sc) : null);
          if (sct && !isNaN(sct.getTime())) {
            scad.conScadenza++; P.conScad++;
            if (sct.getTime() < oggi0.getTime()) { scad.scaduti++; P.scaduti++; } else scad.futuri++;
          } else scad.senzaScadenza++;
        }
      }
      var elenco = Object.keys(perFonte).map(function (k) {
        var P = perFonte[k];
        return { fonte: k.substring(0, 46), attivi: P.attivi, ultimoRilev: P.ultimoRilev,
                 conScadenza: P.conScad, scaduti: P.scaduti,
                 tier: (typeof frTierDaFonte === 'function') ? frTierDaFonte(k, '') : '?' };
      }).sort(function (a, b) { return b.attivi - a.attivi; });
      _f.bandiAttiviPerFonte = elenco.slice(0, 25);
      _f.scadenze = scad;
      _f.fontiConBandiAttivi = elenco.length;
      // quante fonti hanno prodotto negli ultimi 7 e 30 giorni (dato REALE)
      var n7 = 0, n30 = 0, now2 = Date.now();
      elenco.forEach(function (e) {
        if (!e.ultimoRilev) return;
        var p = e.ultimoRilev.split('/');
        var t = new Date(+p[2], +p[1] - 1, +p[0]).getTime();
        if (now2 - t <= 7 * 86400000) n7++;
        if (now2 - t <= 30 * 86400000) n30++;
      });
      _f.fontiProduttive = { ultimi7gg: n7, ultimi30gg: n30 };
      // v4.27.80 — quante righe hanno la firma dello schema slittato
      try { _f.schemaSlittato = (typeof bcvRiparaSlittate === 'function') ? bcvRiparaSlittate({ dryRun: true, cap: 5000 }) : 'modulo assente'; }
      catch (eRip) { _f.riparaErrore = eRip.message; }
    } catch (eF) { _f.errore = eF.message; }
    return ContentService.createTextOutput(JSON.stringify(_f, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }

  if (params.diag === 'contatori') {
    var _dg;
    try { _dg = (typeof diagContatoriBadge === 'function') ? diagContatoriBadge() : { errore: 'tool assente' }; }
    catch (eDg) { _dg = { errore: eDg.message, stack: String(eDg.stack || '').substring(0, 300) }; }
    return ContentService.createTextOutput(JSON.stringify(_dg, null, 2)).setMimeType(ContentService.MimeType.JSON);
  }

  // ---------- 0b) Sondaggio pubblico (?survey=accessibilita) — NO AUTH ----------
  if (params.survey) {
    if (_rateLimited_('survey', 30, 3600)) return HtmlService.createHtmlOutput('<h1>Troppe richieste</h1><p>Riprova tra qualche minuto.</p>');
    try { return _doGetSurvey(params); }
    catch(eSurvey) {
      return HtmlService.createHtmlOutput('<h1>Errore</h1><p>' + String(eSurvey.message) + '</p>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 0c) Sondaggio LS2 diretto (?sondaggio=accessibilita) — inline ----------
  if (params.sondaggio) {
    try {
      var sondTemplate = HtmlService.createTemplateFromFile('Index');
      sondTemplate.sondaggioCodice = String(params.sondaggio).trim();
      return sondTemplate.evaluate()
        .setTitle('Autovalutazione Museale · Osservatorio Culturale Sinopia')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch(eSond) { Logger.log('doGet sondaggio error: ' + eSond.message); }
  }

  // ---------- 1) Flusso Digest Reader (token) ----------
  if (params.reader === '1' && params.t) {
    if (_rateLimited_('reader', 60, 3600)) return HtmlService.createHtmlOutput('<h1>Troppe richieste</h1><p>Riprova tra qualche minuto.</p>');
    try { return _doGetReader(params); }
    catch(err) {
      return HtmlService
        .createHtmlOutput('<h1>Errore</h1><pre>' + escTok_(String(err)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-bis-0a) v4.18.54 — Unsubscribe (?action=unsubscribe&e=...&s=...) ----------
  // Pubblico: NON richiede login (i destinatari delle email non sono autenticati).
  if (params.action === 'unsubscribe') {
    if (_rateLimited_('unsub', 10, 3600)) return HtmlService.createHtmlOutput('<h1>Troppe richieste</h1><p>Riprova tra qualche minuto.</p>');
    try {
      if (typeof _handleUnsubscribe_ === 'function') {
        return HtmlService.createHtmlOutput(_handleUnsubscribe_(params))
          .setTitle('Disiscrizione · Sinopia')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }
      return HtmlService.createHtmlOutput('<h1>Servizio non disponibile</h1><p>Funzione unsubscribe non trovata.</p>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(errU) {
      return HtmlService.createHtmlOutput('<h1>Errore</h1><pre>' + escTok_(String(errU)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-bis-NL) v5.1.0 — Conferma newsletter double opt-in (?action=confirmNl&e=...&s=...) ----------
  if (params.action === 'confirmNl' && params.e && params.s) {
    try {
      var confirmResult = _handleConfirmNewsletter(params);
      return HtmlService.createHtmlOutput(confirmResult)
        .setTitle('Conferma iscrizione · Sinopia')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(errC) {
      return HtmlService.createHtmlOutput('<h1>Errore</h1><pre>' + escTok_(String(errC)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-bis-UTM) v4.18.55 — UTM redirect tracker (?utm_target=URL&utm_source=...) ----------
  if (params.utm_target && typeof utm_handleRedirect === 'function') {
    return utm_handleRedirect(e.queryString || '');
  }

  // ---------- 1-bis-0) Manutenzione remota via GET (?maint=KEY&fn=NOME) ----------
  if (params.maint) {
    var _maintKey = '';
    try { _maintKey = PropertiesService.getScriptProperties().getProperty('OC_MAINT_KEY') || ''; } catch(_){}
    if (!_maintKey || params.maint !== _maintKey) {
      return HtmlService.createHtmlOutput('{"error":"Chiave non valida"}').setMimeType(ContentService.MimeType.JSON);
    }
    var ALLOWED_FN = {
      correggiSocialFontiFallite: correggiSocialFontiFallite,
      fetchAndCacheSocialWall:    fetchAndCacheSocialWall,
      pulisciFontiPodcastBloccate: pulisciFontiPodcastBloccate,
      scanPodcastDiretto:         scanPodcastDiretto,
      scanSources:                scanSources,
      setupFontiAgenti:           setupFontiAgenti,
      setupProfiloAgenti:         setupProfiloAgenti,
      seedFontiNormativa:         seedFontiNormativa,
      seedFontiWelfare:           seedFontiWelfare,
      seedFontiDigital:           seedFontiDigital,
      testAgentScan:              testAgentScan,
      apiScanEditoria:            typeof apiScanEditoria === 'function' ? apiScanEditoria : null,
      pubDiscoveryTest:           typeof pubDiscoveryTest === 'function' ? pubDiscoveryTest : null,
      pubDiscoveryScan:           typeof pubDiscoveryScan === 'function' ? pubDiscoveryScan : null,
      pubDiscoveryStatus:         typeof pubDiscoveryStatus === 'function' ? pubDiscoveryStatus : null,
      populaSeedVideoYoutubeMusei: typeof populaSeedVideoYoutubeMusei === 'function' ? populaSeedVideoYoutubeMusei : null
    };
    var fnName = params.fn || '';
    var fn = ALLOWED_FN[fnName];
    if (!fn) {
      return ContentService.createTextOutput(JSON.stringify({error:'Funzione non in whitelist: '+fnName})).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var res = fn();
      return ContentService.createTextOutput(JSON.stringify({ok:true, fn:fnName, result:res})).setMimeType(ContentService.MimeType.JSON);
    } catch(e) {
      return ContentService.createTextOutput(JSON.stringify({ok:false, fn:fnName, error:e.message})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ---------- 1-bis) v4.4 — Autorizzazione invio newsletter via link Telegram ----------
  if (params.approveNl && params.t) {
    try {
      var nlHtml44 = (params.confirm === '1')
        ? _executeApproveNewsletter_(params.approveNl, params.t)
        : _renderApproveNewsletterPage_(params.approveNl, params.t);
      return HtmlService.createHtmlOutput(nlHtml44)
        .setTitle('Approvazione invio — Osservatorio Culturale')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(errNl) {
      return HtmlService
        .createHtmlOutput('<h1>Errore autorizzazione</h1><pre>' + escTok_(String(errNl)) + '</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // ---------- 1-ter) Gate AUTH RIMOSSO (v5.1.10, 2026-05-29) ----------
  // Il gate server-side e stato rimosso per il modello freemium L0.
  // L'accesso alle funzioni protette e gestito dal frontend (go() gate + _requireLead_)
  // e dai singoli endpoint backend (requireAuth per operazioni sensibili).
  // La pagina renderLoginPage() resta disponibile per usi futuri.

  // ---------- 2) App principale (template con scriptlet) ----------
  var t = HtmlService.createTemplateFromFile('Index');

  var page = t.evaluate()
    .setTitle('Osservatorio Culturale · Sinopia — Bandi, News e Risorse per Musei e Cultura')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  var url = ScriptApp.getService().getUrl();

  // v4.18.7 (2026-05-11) — Iniezione server-side del token admin nel HTML.
  // Google sandbox strappa ?adm= dal location.search del frontend, quindi
  // il token deve essere passato via variabile JS server-side validata.
  var injectedToken = '';
  try {
    var rawTok = (params && params.adm) ? String(params.adm).trim() : '';
    if (rawTok && typeof _validateAdminToken_ === 'function' && _validateAdminToken_(rawTok)) {
      injectedToken = rawTok;
    }
  } catch(injErr) {}

  // v4.18.46 (2026-05-15) — Iniezione token sessione utente (magic-link ?t=TOKEN).
  // Se valido, frontend si comporta come "Lead identificato" (livello 1); altrimenti anonimo (livello 0).
  var injectedSession = '{}';
  try {
    var sessTok = (params && params.t && !params.reader && !params.approveNl) ? String(params.t).trim() : '';
    if (sessTok && typeof validaSessione === 'function') {
      var sessInfo = validaSessione(sessTok);
      if (sessInfo && sessInfo.ok && sessInfo.valid) {
        // v4.22 — Determina se l'utente è già attivo (no GDPR overlay per utenti esistenti)
        var _userAlreadyActive = false;
        try {
          if (typeof getUtenteByEmail_ === 'function') {
            var _ut = getUtenteByEmail_(sessInfo.email);
            _userAlreadyActive = !!(_ut && _ut.stato === 'attivo');
          }
        } catch(_){}
        injectedSession = JSON.stringify({
          token: sessTok,
          email: sessInfo.email || '',
          livello: sessInfo.livello || 1,
          permanente: !!sessInfo.permanente,
          giorniResidui: sessInfo.giorniResidui,
          scaduta: !!sessInfo.scaduta,
          readOnly: !!sessInfo.readOnly,
          matrixCompletato: !!sessInfo.matrixCompletato,
          alreadyActive: _userAlreadyActive
        });
      }
    }
  } catch(injErr) { Logger.log('inject sessione fallita: ' + injErr.message); }

  var rawHtml = page.getContent();
  // v4.20 — Debug: verifica che i placeholder esistano nel HTML renderizzato
  var hasAdmPlaceholder = rawHtml.indexOf('OC_ADMIN_TOKEN_PLACEHOLDER') >= 0;
  var hasUrlPlaceholder = rawHtml.indexOf('GAS_URL_PLACEHOLDER') >= 0;
  Logger.log('[doGet] Placeholder check: ADM=' + hasAdmPlaceholder + ' URL=' + hasUrlPlaceholder + ' injectedToken=' + (injectedToken ? injectedToken.substring(0,6)+'...' : 'EMPTY'));

  var html = rawHtml
    .replace(/GAS_URL_PLACEHOLDER/g, url)
    .replace(/OC_ADMIN_TOKEN_PLACEHOLDER/g, injectedToken)
    .replace(/OC_SESSION_PLACEHOLDER/g, injectedSession);

  return HtmlService.createHtmlOutput(html)
    .setTitle('Osservatorio Culturale · Sinopia — Bandi, News e Risorse per Musei e Cultura')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Sprint 1.4 (2026-05-01) — Render pagina di login/richiesta accesso.
 * Stile "Direzione B · Bianca Editoriale" (Claude Design).
 */
function renderLoginPage(auth) {
  auth = auth || { email: '', stato: 'not_logged' };
  var emailDetected = auth.email || '';
  var stato = auth.stato || 'not_logged';
  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) {}
  var statusMsg = ''; var statusType = '';
  if (stato === 'pending') { statusMsg = 'Richiesta in attesa di approvazione. Riceverai una email quando approvata.'; statusType = 'warn'; }
  else if (stato === 'sospeso') { statusMsg = 'Account sospeso. Per riattivarlo scrivi a sinopiaconsulting@gmail.com.'; statusType = 'error'; }
  else if (stato === 'rifiutato') { statusMsg = 'Richiesta non approvata. Per informazioni scrivi a sinopiaconsulting@gmail.com.'; statusType = 'error'; }

  return ''
+ '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
+ '<title>Accesso · Osservatorio Culturale</title>'
+ '<meta name="viewport" content="width=device-width, initial-scale=1">'
+ '<link rel="preconnect" href="https://fonts.googleapis.com">'
+ '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
+ '<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
+ '<style>'
+ ':root{--b-bg:#FAF8F4;--b-ink:#1A1815;--b-mute:#6E6A62;--b-line:#E5E1D8;--b-soft:#F3F0E9;--b-red:#7A2A1A;--b-surface:#FFFFFF;}'
+ '*{margin:0;padding:0;box-sizing:border-box}'
+ 'html,body{background:var(--b-bg);color:var(--b-ink);font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}'
+ '.b-page{min-height:100vh;display:flex;flex-direction:column}'
+ '.b-nav{padding:20px 36px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--b-line)}'
+ '.b-logo{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:20px;letter-spacing:-0.01em;color:var(--b-red)}'
+ '.b-logo-tag{font-size:9px;font-weight:500;color:var(--b-ink);letter-spacing:0.22em;text-transform:uppercase;margin-left:4px}'
+ '.b-nav-meta{font-family:"Inter",sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--b-mute);font-weight:600}'
+ '.b-grid{flex:1;display:grid;grid-template-columns:1fr 1.1fr;min-height:calc(100vh - 65px)}'
+ '@media (max-width:900px){.b-grid{grid-template-columns:1fr}}'
+ '.b-left{padding:56px 64px 48px;display:flex;flex-direction:column;justify-content:center;border-right:1px solid var(--b-line)}'
+ '@media (max-width:900px){.b-left{padding:32px 28px;border-right:none;border-bottom:1px solid var(--b-line)}}'
+ '.b-eyebrow{font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--b-red);font-family:"Inter",sans-serif}'
+ '.b-h1{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-size:54px;line-height:1.0;letter-spacing:-0.02em;font-weight:400;margin:14px 0 8px;color:var(--b-ink)}'
+ '@media (max-width:900px){.b-h1{font-size:38px}}'
+ '.b-h1 em{color:var(--b-red);font-style:italic;font-weight:500}'
+ '.b-lead{font-size:14px;color:var(--b-mute);line-height:1.5;margin:0 0 32px;max-width:420px}'
+ '.b-status{padding:12px 16px;background:var(--b-soft);border-left:3px solid var(--b-ink);font-size:13px;line-height:1.5;margin-bottom:24px;color:var(--b-ink)}'
+ '.b-status.warn{border-left-color:#B8902A}.b-status.error{border-left-color:var(--b-red)}'
+ '.b-email-box{padding:12px 16px;background:var(--b-soft);border:1px solid var(--b-line);border-left:3px solid var(--b-red);font-size:13px;color:var(--b-ink);margin-bottom:18px;font-family:"Inter",sans-serif;line-height:1.5}'
+ '.b-google-btn{display:flex;align-items:center;justify-content:center;gap:12px;background:var(--b-ink);color:#fff;border:none;padding:18px 22px;font-family:inherit;font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;width:100%;cursor:pointer;text-decoration:none;transition:background .15s}'
+ '.b-google-btn:hover{background:#000}'
+ '.b-google-btn .b-arrow{margin-left:auto;font-size:18px}'
+ '.b-divider{display:flex;align-items:center;gap:14px;margin:26px 0 18px;color:var(--b-mute);font-family:"Inter",sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600}'
+ '.b-divider-line{flex:1;height:1px;background:var(--b-line)}'
+ '.b-signup-cta{margin-top:28px;font-size:13px;color:var(--b-ink)}'
+ '.b-signup-cta a{color:var(--b-red);font-weight:600;border-bottom:1px solid var(--b-red);text-decoration:none;padding-bottom:1px;cursor:pointer}'
+ '.b-form{margin-top:18px;display:none}.b-form.show{display:block}'
+ '.b-field{margin-bottom:16px}'
+ '.b-field-label{font-family:"Inter",sans-serif;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:var(--b-mute);margin-bottom:6px}'
+ '.b-field input,.b-field textarea{width:100%;border:none;border-bottom:2px solid var(--b-ink);padding:10px 2px;font-family:inherit;font-size:16px;color:var(--b-ink);background:transparent;outline:none;resize:none}'
+ '.b-field input:focus,.b-field textarea:focus{border-bottom-color:var(--b-red)}'
+ '.b-field input::placeholder,.b-field textarea::placeholder{color:var(--b-mute);font-weight:400}'
+ '.b-row{display:flex;gap:12px;margin-top:18px}'
+ '.b-btn-primary{flex:1;background:var(--b-ink);color:#fff;border:none;padding:14px 20px;font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;display:flex;justify-content:space-between;align-items:center}'
+ '.b-btn-primary:hover{background:#000}'
+ '.b-btn-secondary{background:transparent;color:var(--b-ink);border:1px solid var(--b-ink);padding:14px 20px;font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer}'
+ '.b-result{margin-top:14px;font-size:13px;min-height:18px}'
+ '.b-right{background:var(--b-soft);padding:48px 56px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}'
+ '@media (max-width:900px){.b-right{padding:32px 28px}}'
+ '.b-circle-1{position:absolute;right:-120px;top:-120px;width:480px;height:480px;border-radius:50%;background:var(--b-red);opacity:0.08;pointer-events:none}'
+ '.b-circle-2{position:absolute;right:-40px;top:-40px;width:320px;height:320px;border-radius:50%;border:1.5px solid var(--b-red);opacity:0.25;pointer-events:none}'
+ '.b-circle-3{position:absolute;right:60px;top:60px;width:180px;height:180px;border-radius:50%;border:1.5px solid var(--b-red);opacity:0.4;pointer-events:none}'
+ '.b-right-content{position:relative;z-index:1}'
+ '.b-right-eyebrow{font-family:"Inter",sans-serif;font-size:10px;color:var(--b-red);letter-spacing:0.18em;text-transform:uppercase;font-weight:600}'
+ '.b-right-h2{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-size:42px;line-height:1.05;letter-spacing:-0.02em;font-weight:400;margin:14px 0 10px;max-width:460px;color:var(--b-ink)}'
+ '@media (max-width:900px){.b-right-h2{font-size:30px}}'
+ '.b-right-h2 em{color:var(--b-red);font-weight:500}'
+ '.b-right-lead{font-size:14px;color:var(--b-mute);line-height:1.55;max-width:460px;margin:0}'
+ '.b-features{position:relative;display:flex;flex-direction:column;gap:14px;z-index:1;margin-top:32px}'
+ '.b-features-title{font-family:"Inter",sans-serif;font-size:10px;color:var(--b-ink);letter-spacing:0.18em;text-transform:uppercase;font-weight:600}'
+ '.b-feature{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:baseline;padding-top:12px;border-top:1px solid var(--b-line)}'
+ '.b-feature-num{font-family:"Inter",sans-serif;font-size:12px;color:var(--b-red);font-weight:600}'
+ '.b-feature-title{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-size:19px;line-height:1.2;letter-spacing:-0.01em;font-weight:500;color:var(--b-ink)}'
+ '.b-feature-desc{font-size:12.5px;color:var(--b-mute);margin-top:2px}'
+ '.b-footer{padding:14px 36px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--b-line);font-family:"Inter",sans-serif;font-size:10px;letter-spacing:0.1em;color:var(--b-mute);font-weight:600;text-transform:uppercase}'
+ '@media (max-width:900px){.b-footer{flex-direction:column;gap:6px;font-size:9px}}'
+ '</style></head><body>'
+ '<div class="b-page">'
+ '<div class="b-nav">'
+ '<div class="b-logo">'
+   '<svg width="22" height="22" viewBox="0 0 32 32" style="vertical-align:middle;margin-right:2px"><circle cx="14" cy="14" r="11" fill="none" stroke="#C8102E" stroke-width="3"/><circle cx="14" cy="14" r="4" fill="#C8102E"/><line x1="22.5" y1="22.5" x2="29" y2="29" stroke="#C8102E" stroke-width="3" stroke-linecap="round"/></svg>'
+   '<span>sservatorio</span><span class="b-logo-tag">Culturale</span>'
+ '</div>'
+ '<div class="b-nav-meta">DUEMILAMUSEI · v4.9.0</div>'
+ '</div>'
+ '<div class="b-grid">'
+ '<div class="b-left">'
+ '<div class="b-eyebrow">Area riservata</div>'
+ '<h1 class="b-h1">Accedi <em>all\'osservatorio.</em></h1>'
+ '<p class="b-lead">Profilo dell\'istituzione, risultati del test MuseMu Matrix, bandi pertinenti, archivio personale. Una sola identita per tutto l\'osservatorio.</p>'
+ (statusMsg ? '<div class="b-status ' + statusType + '">' + statusMsg + '</div>' : '')
+ (emailDetected
    ? '<div class="b-email-box">Account Google rilevato: ' + escTok_(emailDetected) + ' &mdash; non risulta autorizzato. Compila il form qui sotto per richiedere accesso.</div>'
    : '<div class="b-email-box" style="background:#FFF8E7;border-color:#F0D78C;color:#7A5A00">Per accedere all\'area riservata compila il form di richiesta accesso. L\'amministratore approvera la tua richiesta entro 24h e riceverai una email di conferma.</div>')
+ ((stato === 'pending' || stato === 'sospeso' || stato === 'rifiutato')
    ? '<a href="' + webUrl + '" class="b-google-btn"><span>Riprova accesso</span><span class="b-arrow">&rarr;</span></a>'
    : (
    '<div class="b-form show" id="requestForm">'
  + '<div class="b-field"><div class="b-field-label">Nome e cognome</div><input type="text" id="reqNome" placeholder="es. Anna Ricci" /></div>'
  + '<div class="b-field"><div class="b-field-label">Email istituzionale</div><input type="email" id="reqEmail" value="' + escTok_(emailDetected) + '" placeholder="direzione@museo.it" /></div>'
  + '<div class="b-field"><div class="b-field-label">Istituzione e ruolo</div><textarea id="reqMotivo" rows="3" placeholder="Es. Direttore Museo Civico di Pesaro / Conservatore Pinacoteca / Responsabile didattica..."></textarea></div>'
  + '<div class="b-row">'
  + '<button class="b-btn-primary" onclick="submitAccessRequest()"><span>Invia richiesta accesso</span><span>&rarr;</span></button>'
  + '</div>'
  + '<div class="b-result" id="requestResult"></div>'
  + '</div>'
  ))
+ '</div>'
+ '<div class="b-right">'
+ '<div class="b-circle-1"></div><div class="b-circle-2"></div><div class="b-circle-3"></div>'
+ '<div class="b-right-content">'
+   '<div class="b-right-eyebrow">Lettura del giorno</div>'
+   '<h2 class="b-right-h2">Dieci dimensioni, una sola lente: per leggere l\'<em>identita culturale</em> di un\'istituzione.</h2>'
+   '<p class="b-right-lead">Il framework MuseMu Matrix dell\'Osservatorio Culturale Sinopia. Riservato agli iscritti.</p>'
+ '</div>'
+ '<div class="b-features">'
+   '<div class="b-features-title">Cosa trovi nell\'area riservata</div>'
+   '<div class="b-feature"><span class="b-feature-num">01</span><div><div class="b-feature-title">Test e dashboard</div><div class="b-feature-desc">Profilo dell\'istituzione su 10 dimensioni MuseMu Matrix.</div></div></div>'
+   '<div class="b-feature"><span class="b-feature-num">02</span><div><div class="b-feature-title">Bandi salvati</div><div class="b-feature-desc">Radar personalizzato sulle dimensioni deboli.</div></div></div>'
+   '<div class="b-feature"><span class="b-feature-num">03</span><div><div class="b-feature-title">Archivio letture</div><div class="b-feature-desc">News, podcast, video segnalati per te.</div></div></div>'
+ '</div>'
+ '</div>'
+ '</div>'
+ '<div class="b-footer">'
+ '<span>OSSERVATORIO CULTURALE · AREA RISERVATA</span>'
+ '<span>SSL · GDPR · ITA-IT · DUEMILAMUSEI 1988</span>'
+ '</div>'
+ '</div>'
+ '<script>'
+ 'var WEB_URL=' + JSON.stringify(webUrl) + ';'
+ 'function submitAccessRequest(){'
+ '  var nome=(document.getElementById("reqNome")||{}).value||"";'
+ '  var email=(document.getElementById("reqEmail")||{}).value||"";'
+ '  var motivo=(document.getElementById("reqMotivo")||{}).value||"";'
+ '  var out=document.getElementById("requestResult");'
+ '  if(!email.trim()){ out.innerHTML="<span style=\\"color:#C8102E\\">Email obbligatoria.</span>"; return; }'
+ '  out.innerHTML="<span style=\\"color:#6F6F6F\\">Invio in corso...</span>";'
+ '  google.script.run'
+ '    .withSuccessHandler(function(r){'
+ '      if(r&&r.ok){'
+ '        if(r.alreadyActive && r.email){'
+ '          var entraUrl = WEB_URL + (WEB_URL.indexOf("?")>=0 ? "&" : "?") + "accessAs=" + encodeURIComponent(r.email);'
+ '          out.innerHTML = "<div style=\\"color:#0F6E56;margin-bottom:10px\\">"+(r.message||"OK")+"</div>"'
+ '            + "<a href=\\""+entraUrl+"\\" class=\\"b-google-btn\\" style=\\"text-decoration:none;display:inline-flex;padding:14px 24px\\"><span>ENTRA NELL\\u0027OSSERVATORIO</span><span class=\\"b-arrow\\" style=\\"margin-left:14px\\">&rarr;</span></a>";'
+ '        } else { out.innerHTML="<span style=\\"color:#0F6E56\\">"+(r.message||"OK")+"</span>"; }'
+ '      }'
+ '      else{ out.innerHTML="<span style=\\"color:#C8102E\\">Errore: "+((r&&r.error)||"sconosciuto")+"</span>"; }'
+ '    })'
+ '    .withFailureHandler(function(e){ out.innerHTML="<span style=\\"color:#C8102E\\">Errore di rete: "+e+"</span>"; })'
+ '    .requestAccess({email:email.trim(),nome:nome.trim(),motivo:motivo.trim()});'
+ '}'
+ '</script>'
+ '</body></html>';
}

/**
 * Sprint 2 (2026-04-30): helper per includere file HTML in template.
 * Usato in Index.html come <?!= include('MatrixApp'); ?> per montare il modulo
 * questionario MuseMu Matrix come componente separato.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function _serveDigestReader(token) {
  try {
    var data = _getDigestByToken(token);
    var page = HtmlService.createHtmlOutputFromFile('DigestReader');
    var html = page.getContent()
      .replace('READER_DATA_PLACEHOLDER', JSON.stringify(data))
      .replace('GAS_URL_PLACEHOLDER', ScriptApp.getService().getUrl());
    page.setContent(html);
    page.setTitle('Digest Osservatorio Culturale - ' + (data.destinatario || ''));
    page.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    page.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return page;
  } catch(e) {
    Logger.log('_serveDigestReader error: ' + e.message);
    var motivo = e.message || 'Errore sconosciuto';
    var errHtml = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link non valido</title>'
      + '<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8f7f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}'
      + '.box{background:#fff;border-radius:16px;padding:36px 32px;max-width:460px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}'
      + '.ico{font-size:48px;margin-bottom:16px}'
      + 'h2{color:#A32D2D;font-size:20px;margin-bottom:10px}'
      + 'p{color:#5a5a5a;font-size:14px;line-height:1.6;margin-bottom:20px}'
      + '.detail{font-size:12px;color:#aaa;background:#f4f2ed;border-radius:8px;padding:10px 14px;margin-bottom:20px;text-align:left}'
      + 'a.btn{display:inline-block;background:#0F2744;color:#fff;text-decoration:none;padding:11px 24px;border-radius:9px;font-size:14px;font-weight:600}'
      + '</style></head><body>'
      + '<div class="box">'
      + '<div class="ico">&#128279;</div>'
      + '<h2>Link non accessibile</h2>'
      + '<p>Il link del tuo digest personale non è più valido. I link hanno una durata di <strong>30 giorni</strong> e vengono rigenerati ad ogni nuovo invio.</p>'
      + '<div class="detail">Motivo tecnico: ' + motivo + '</div>'
      + '<a class="btn" href="mailto:sinopiaconsulting@gmail.com">Richiedi un nuovo digest</a>'
      + '</div></body></html>';
    var err = HtmlService.createHtmlOutput(errHtml);
    err.setTitle('Link non valido — Osservatorio Culturale');
    err.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return err;
  }
}

/**
 * v4.19.1 — Sanitizza valore utente prima di scrivere in cella Google Sheets.
 * Previene CSV injection: celle che iniziano con = + @ - vengono prefissate con apice singolo.
 * @param {*} val — valore da sanitizzare
 * @return {string}
 */
function _sanitizeForCell_(val) {
  var s = String(val == null ? '' : val);
  if (/^[=+@\-]/.test(s)) return "'" + s;
  return s;
}

/**
 * v4.19.1 — Rate limiter semplice via CacheService. Max N richieste per chiave in finestra T secondi.
 * @return {boolean} true se il rate limit è superato (= bloccare la richiesta)
 */
function _rateLimited_(key, maxPerWindow, windowSec) {
  try {
    var cache = CacheService.getScriptCache();
    var ck = 'rl_' + key;
    var count = parseInt(cache.get(ck) || '0');
    if (count >= maxPerWindow) return true;
    cache.put(ck, String(count + 1), windowSec || 60);
    return false;
  } catch(_) { return false; }
}

function doPost(e) {
  _initLegacyConsts_(); // v4.22 PERF — lazy init
  try {
    const body = JSON.parse(e.postData.contents);
    const token = body.token || '';
    const role = authenticate(token);
    if (body.action !== 'login' && !role) return jsonOk({ error: 'Non autorizzato' });

    switch (body.action) {
      case 'login': return jsonOk(role ? { ok:true, role } : { error:'Password errata' });

      // Read
      case 'getItems':        return jsonOk(getItems(body));
      case 'getBandi':        return jsonOk(getBandi());
      case 'getFonti':        return jsonOk(getFonti());
      case 'getStats':        return jsonOk(getStats());
      case 'getHomepageData': return jsonOk(getHomepageData());
      case 'getMailing':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(_getMailingListData_()); // v4.23: doPost già gated per ruolo
      case 'getDigestLog':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(getDigestLog());

      // Items — write di contenuto globale: editor o admin
      case 'editSommario':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(editSommario(body));
      case 'toggleSaved':     return jsonOk(toggleItemField(body.id,'Salvato'));       // personale
      case 'toggleArchived':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleItemField(body.id,'Archiviato'));
      case 'toggleDigest':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleItemField(body.id,'InclusiNelDigest'));
      case 'markRead':        return jsonOk(setItemField(body.id,'Letto',true));       // personale
      case 'deleteItem':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(_deleteRowById(getMainSS().getSheetByName(SH.ITEMS),body.id));
      case 'deleteItems':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteItemsBulk(body.ids||[]));

      // Mailing
      case 'saveMailing':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(saveMailing(body));
      case 'deleteMailing':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteMailing(body.id));
      case 'toggleMailingActive':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleMailingField(body.id,'Attivo'));

      // Email
      case 'sendDigestNow':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(sendDigest(body.itemIds||null));
      case 'previewDigest':
        return jsonOk({ html: buildDigestHTML(getItemsByIds(body.itemIds)) });

      // Radar Bandi CRUD
      case 'getBandiRadar':        return jsonOk(getBandiRadar());
      case 'diagBandiSheet':       return jsonOk(diagBandiSheet());
      case 'saveBandoRadar':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(saveBandoRadar(body));
      case 'updateBandoRadar':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(updateBandoRadar(body));
      case 'toggleNascostoRadar':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleNascostoRadar(body.id,body.nascosto));
      case 'deleteBandoRadar':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteBandoRadar(body.id));
      case 'testTelegramRadar':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(sendTestTelegram());

      // * Archivio Bandi v3.0
      case 'toggleLettoBando': return jsonOk(toggleLettoBando(body));          // personale
      case 'archiviaRecord':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(archiviaRecord(body));
      case 'ripristinaRecord':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(ripristinaRecord(body));
      case 'deleteArchiviato':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteArchiviato(body));
      case 'deleteArchivioBulk':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteArchivioBulk(body.ids||[], body.token));
      case 'deleteArchivioTutto':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteArchivioTutto(body.token));

      // Scanner
      case 'runScanner':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk({ ok:true, added: scanSources() });
      case 'runPodScanner':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        try { const added=scanPodcast(); return jsonOk({ok:true, added}); }
        catch(e) { return jsonOk({error:e.message}); }

      // Fonti
      case 'toggleFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleFonteField(body.id,'Attiva'));
      case 'addFonteArticoli':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addFonteArticoli(body));
      case 'deleteFonteArticoli':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteFonteArticoli(body.id));
      case 'getFontiBandi':    return jsonOk(getFontiBandi());
      case 'addFonteBandi':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addFonteBandi(body));
      case 'deleteFonteBandi':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteFonteBandiById(body.id));
      case 'toggleFonteBandi':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleFonteBandiField(body.id,'Attiva'));

      // Social Wall
      case 'getSocialWall':    return jsonOk(getSocialWall());
      case 'refreshSocialWall':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(fetchAndCacheSocialWall());
      case 'getSocialFonti':   return jsonOk(getSocialFontiList());
      case 'addSocialFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addSocialFonte(body));
      case 'deleteSocialFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteSocialFonteById(body.id));
      case 'toggleSocialFonte':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleSocialFonteField(body.id,'Attiva'));

      // * PODCAST v3.2
      case 'getPodcasts':     return jsonOk(getPodcasts(body));
      case 'savePodcast':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(savePodcast(body));
      case 'togglePodField':
        if (role!=='editor' && role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(togglePodField(body));
      case 'deletePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deletePodcast(body.id));

      // Fonti Podcast
      case 'getFontiPodcast':   return jsonOk(getFontiPodcast());
      case 'addFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(addFontePodcast(body));
      case 'deleteFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(deleteFontePodcastById(body.id));
      case 'toggleFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(toggleFontePodcastField(body.id,'Attiva'));
      case 'scanFontePodcast':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(scanSingolaFontePodcast(body.id));

      // Libri / Pubblicazioni (Sprint N4)
      case 'addLibro':
        if (role!=='admin' && role!=='editor') return jsonOk({error:'Accesso negato'});
        return jsonOk(addLibro(body));
      case 'getLibriList':
        return jsonOk(getLibriList(body));
      case 'setupPubblicazioniSheet':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(setupPubblicazioniSheet());

      // GDPR — Right to be forgotten (richiede autenticazione)
      case 'forgetMyData':
        return jsonOk(forgetMyData(body.identifier || '', token));

      // Gestione dati
      case 'getGestioneStats':  return jsonOk(getGestioneStats());
      case 'archiviaOlderThan':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(archiviaNotizieOlderThan(body.giorni||30));
      case 'eliminaArchiviatiTutti':
        if (role!=='admin') return jsonOk({error:'Accesso negato'});
        return jsonOk(eliminaArchiviatiTutti());

      // Digest Reader pubblico (token-based, no auth richiesta)
      case 'getDigestByToken': return jsonOk(getDigestByTokenPublic(body.token||''));

      // Manutenzione remota (chiave segreta, senza login utente)
      case 'runMaintenance': {
        // v4.19.1 — Rate limit: max 5 tentativi manutenzione per minuto
        if (_rateLimited_('maint', 5, 60)) return jsonOk({ error: 'Troppi tentativi. Riprova tra un minuto.' });
        var MAINT_KEY = PropertiesService.getScriptProperties().getProperty('OC_MAINT_KEY') || '';
        if (!MAINT_KEY || body.key !== MAINT_KEY) return jsonOk({ error: 'Chiave non valida' });
        const ALLOWED = {
          correggiSocialFontiFallite: correggiSocialFontiFallite,
          fetchAndCacheSocialWall:    fetchAndCacheSocialWall,
          pulisciFontiPodcastBloccate: pulisciFontiPodcastBloccate,
          scanPodcastDiretto:         scanPodcastDiretto,
          scanSources:                scanSources
        };
        const fn = ALLOWED[body.fn];
        if (!fn) return jsonOk({ error: 'Funzione non in whitelist: ' + body.fn });
        try {
          const result = fn();
          return jsonOk({ ok: true, fn: body.fn, result: result });
        } catch(e) {
          return jsonOk({ ok: false, fn: body.fn, error: e.message });
        }
      }

      default: return jsonOk({ error:'Azione non riconosciuta' });
    }
  } catch(err) {
    Logger.log('doPost error: ' + (err && err.message) + '\n' + (err && err.stack));
    return jsonOk({ error: 'Errore interno del server' });
  }
}

// ==================================================================
// FONTI PODCAST — ESTRATTE in PodcastManager.js (v4.27.33)
// ==================================================================
// Le seguenti funzioni sono ora in PodcastManager.js:
// _getFontiPodSheet, getFontiPodcast, addFontePodcast, deleteFontePodcastById,
// toggleFontePodcastField, scanSingolaFontePodcast, _scanSingolaFontePodcastRSS,
// _youtubeChannelToFeedUrl, addFonteVideoYoutube, _ensureFontiPodTipoContenuto_,
// populaSeedVideoYoutubeMusei, seedFontiPodcastRSS, pulisciFontiPodcastBloccate,
// seedFontiPodcastV2
// getPodcastSheet, getPodcasts, savePodcast, togglePodField, deletePodcast
// ==================================================================

// [ELIMINATO: blocco fonti podcast 420 righe — ora in PodcastManager.js]

// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
function authenticate(token) {
  if (!token) return null;
  // Autenticazione classica tramite password nelle Script Properties
  if (token === ADMIN_PWD)  return 'admin';
  if (token === EDITOR_PWD) return 'editor';
  // FIX v4.3: autenticazione via email — pw = email
  // L'utente invia la propria email come token; viene verificata nella MailingList
  try {
    const emailNorm = token.toLowerCase().trim();
    // Formato email minimo
    if (!emailNorm.includes('@') || emailNorm.length < 5) return null;
    const list = _getMailingListData_().list; // v4.23: usa interna (getMailingList ora gated)
    const user = list.find(function(m) {
      return m.Email && m.Email.toLowerCase().trim() === emailNorm
             && (m.Attivo === true || m.Attivo === 'TRUE' || m.Attivo === 1);
    });
    if (user) {
      Logger.log('authenticate: accesso email per ' + emailNorm + ' ruolo=' + (user.Ruolo||'lettore'));
      return user.Ruolo || 'lettore';
    }
  } catch(e) {
    Logger.log('authenticate: errore verifica email: ' + e.message);
  }
  return null;
}

function jsonOk(data) {
  const out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// v4.22 — Moved to StatsManager.js: getStats (with double-read fix)

// ==================================================================
// HOMEPAGE DATA (* nuovo v3.0)
// ==================================================================

function getHomepageData() {
  try {
    // * NON chiama getBandiRadar() - il frontend ha gia RB_ALL caricato
    // Solo conta bandi attivi velocemente dal foglio senza costruire oggetti
    const bandiNuovi = [];
    try {
      const shR = getSheetRadar();
      if (shR && shR.getLastRow() > 1) {
        const hdr = shR.getRange(1,1,1,shR.getLastColumn()).getValues()[0];
        const titI = hdr.indexOf('TITOLO'), stI = hdr.indexOf('STATUS'), srI = hdr.indexOf('StatoRecord');
        const rows = shR.getRange(2,1,shR.getLastRow()-1,shR.getLastColumn()).getValues();
        rows.forEach(r => {
          if (!r[titI]) return;
          const sr = String(r[srI]||'').toLowerCase();
          if (sr === 'archiviato') return;
          if (String(r[stI]) === 'Nuovo') bandiNuovi.push({titolo:String(r[titI])});
        });
      }
    } catch(e2) {}

    const ultimaScansione = getUltimaScansione();

    const notizieNuove = [];
    try {
      const sh = getMainSS().getSheetByName(SH.ITEMS);
      if (sh) {
        const rows=sh.getDataRange().getValues(), h=rows[0];
        const lettoI=h.indexOf('Letto'), archI=h.indexOf('Archiviato'),
              titI=h.indexOf('Titolo'), fonteI=h.indexOf('Fonte'),
              urlI=h.indexOf('FonteURL'), dataI=h.indexOf('DataAcquisizione');
        const cutoff=new Date(Date.now()-7*86400000);
        for (let i=1;i<rows.length&&notizieNuove.length<6;i++) {
          const r=rows[i]; if(!r[0]||r[archI]) continue;
          const d=r[dataI] instanceof Date?r[dataI]:new Date(r[dataI]);
          if(isNaN(d)||d<cutoff||r[lettoI]) continue;
          notizieNuove.push({
            titolo:String(r[titI]||''), fonte:String(r[fonteI]||''),
            url:String(r[urlI]||''), data:formatDate(d)
          });
        }
      }
    } catch(e2) {}

    // Podcast nuovi (non ascoltati, ultima settimana)
    let podcastNuovi = 0;
    try {
      const podSh = getPodcastSheet();
      if (podSh && podSh.getLastRow() > 1) {
        const pr = podSh.getRange(1,1,podSh.getLastRow(),podSh.getLastColumn()).getValues();
        const ph = pr[0];
        const ascI = ph.indexOf('Ascoltato'), stI = ph.indexOf('StatoRecord');
        for (let i=1;i<pr.length;i++) {
          if (!pr[i][0]) continue;
          const sr = String(pr[i][stI]||'attivo').toLowerCase().trim();
          if (sr==='archiviato') continue;
          if (!pr[i][ascI]) podcastNuovi++;
        }
      }
    } catch(e2) { Logger.log('podcastNuovi err: '+e2.message); }
    return { ok:true, bandiNuovi, notizieNuove, ultimaScansione, podcastNuovi };
  } catch(e) {
    return { ok:false, error:e.message, bandiNuovi:[], notizieNuove:[], ultimaScansione:null };
  }
}
// [bandi CRUD estratto in BandiCRUD.js]
function formatDateIT(d) {
  if(!d||!(d instanceof Date)) return '-';
  return Utilities.formatDate(d,'Europe/Rome','dd/MM/yyyy');
}
function formatEur(n) { if(!n) return '-'; return 'EUR'+Number(n).toLocaleString('it-IT'); }
// [bandi CRUD estratto in BandiCRUD.js]
function getFonti() {
  var fonti = _sheetToObjects(SH.FONTI);
  fonti.forEach(function(f) {
    if (f.UltimaScansione instanceof Date) f.UltimaScansione = formatDate(f.UltimaScansione);
  });
  return {fonti: fonti};
}

function toggleFonteField(id,field) {
  const sh=getMainSS().getSheetByName(SH.FONTI);
  return _toggleField(sh,id,field);
}

// v4.22 — Moved to MailingManager.js: getMailingList, getMailingListSummary, saveMailing, deleteMailing, toggleMailingField, _sendConfirmationEmail, _handleConfirmNewsletter, getDigestLog

// --- Digest send/build functions extracted to DigestService.js (Sprint 2, 2026-05-26) ---

// v4.22 — Moved to NewsScanner.js: scanSources, fetchRSS, processWithAI, saveItem, getItems, getItemsByIds, editSommario, getExistingURLs, updateFonteLastScan, backfillRegioneNews, scanPodcastDiretto, scanVideoYoutube, FONTI_GENERALISTE, passaFiltroCulturaMusei_, _parseRSSItems_, _parseYoutubeAtom_, _xmlText_

// ==================================================================
// SOCIAL WALL + FONTI ARTICOLI — ESTRATTI in SocialManager.js (v4.27.33)
// getSocialWall, fetchAndCacheSocialWall, getSocialFontiList, addSocialFonte,
// deleteSocialFonteById, toggleSocialFonteField, seedSocialFontiIstituzionali,
// [bandi CRUD estratto in BandiCRUD.js]
function _codice_podcast_crud_removed_() {} // segnalibro

// HELPERS
// ==================================================================

function deleteItemsBulk(ids) {
  if(!ids||!ids.length) return {error:'Nessun ID'};
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  if(!sh) return {error:'Foglio non trovato'};
  const rows=sh.getDataRange().getValues(), idCol=rows[0].indexOf('ID'), toDelete=[];
  for(let i=rows.length-1;i>=1;i--) if(ids.includes(rows[i][idCol])) toDelete.push(i+1);
  toDelete.forEach(r=>sh.deleteRow(r));
  return {ok:true,deleted:toDelete.length};
}

function _deleteRowById(sh,id) {
  if(!sh) return {error:'Foglio non trovato'};
  const rows=sh.getDataRange().getValues(), idCol=rows[0].indexOf('ID');
  for(let i=1;i<rows.length;i++) if(rows[i][idCol]===id){sh.deleteRow(i+1);return {ok:true};}
  return {error:'Elemento non trovato'};
}

function _toggleField(sh,id,field) {
  if(!sh) return {error:'Foglio non trovato'};
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), fieldCol=h.indexOf(field);
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]===id){const nv=!rows[i][fieldCol];sh.getRange(i+1,fieldCol+1).setValue(nv);return {ok:true,value:nv};}
  }
  return {error:'Non trovato'};
}

// v4.18.38 (audit 2026-05-14) — Rimossa initSheetsIfMissing(): sostituita da runAllSetupV418()
// in Setup_v418.js. La nuova catena setup è più completa e idempotente.

function setupSheets() {
  const SS=getMainSS();
  const config={
    [SH.ITEMS]:['ID','Ambito','AmbitoLabel','Fonte','FonteURL','Titolo','Estratto','SommarioAI','SommarioEditato','TagAI','Score','Tipologia','DataPubblicazione','DataAcquisizione','Scadenza','Letto','Salvato','Archiviato','InclusiNelDigest'],
    [SH.BANDI]:['ID','Titolo','Fonte','FonteURL','DataScadenza','Descrizione','Salvato','Stato'],
    [SH.FONTI]:['ID','Nome','URL','RSSURL','Ambito','AmbitoLabel','Attiva','UltimaScansione','NumItemRaccolti'],
    [SH.MAILING]:['ID','Nome','Email','Ruolo','Attivo','DataIscrizione'],
    [SH.LOG]:['ID','DataInvio','NumItem','Destinatari','Stato']
  };
  for(const [name,headers] of Object.entries(config)) {
    let sh=SS.getSheetByName(name); if(!sh) sh=SS.insertSheet(name);
    sh.clearFormats();
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    sh.setFrozenRows(1); sh.setColumnWidth(1,180);
  }
  Logger.log('[OK] Setup completato');
}

function setupTriggers() {
  // v4.20 DEPRECATO — usare setupMasterTriggers()
  Logger.log('[DEPRECATO] setupTriggers — usare setupMasterTriggers()');
  return { ok: false, deprecato: true, message: 'Usare setupMasterTriggers()' };
}
// ==================================================================
// [digest estratto in DigestLegacy.js]
function formatDate(date) {
  if(!date) return '';
  const d=date instanceof Date?date:new Date(date);
  if(isNaN(d)) return '';
  const m=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
// [22 funzioni diagnostica/migrazione estratte in DiagnosticaMigrazione.js]
