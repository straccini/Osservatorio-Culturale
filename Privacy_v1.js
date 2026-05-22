/**
 * ============================================================================
 *  Privacy_v1.gs — UTM tracking + Right-to-be-forgotten + Trasparenza
 * ============================================================================
 *  Sprint 4 (2026-05-11) — Sezioni S4.2, S4.3, S4.4
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Tre responsabilita' nel modulo:
 *
 *   A. UTM TRACKING (S4.2)
 *      Endpoint chiamabile via doGet(?utm=...&id=...) che logga click in foglio
 *      UtmLog e fa redirect a target. Pixel tracking opt-in only.
 *
 *   B. RIGHT-TO-BE-FORGOTTEN (S4.3)
 *      Endpoint forgetMyData(uuid|email) che cancella entro 30gg da:
 *      ResponsesMatrix, ContactsMatrix, CRM_Leads, MailingList.
 *      Audit log su PropertiesService con timestamp.
 *
 *   C. TRASPARENZA (S4.4)
 *      Endpoint getTrasparenzaData() che restituisce dati AGGREGATI E ANONIMI:
 *      N compilazioni, distribuzione regioni, tempo medio, KPI funnel.
 *      Nessun dato personale.
 *
 *  Schema fogli supporto:
 *    UtmLog        - timestamp, utm_source, utm_campaign, utm_content, target, response_id_anon (hash)
 *    ForgetAudit   - timestamp, request_type, identifier_hash, deleted_from, exit_status
 *    OptInAudit    - timestamp, response_id, action (opt-in|opt-out|modify), prefs_before, prefs_after, ip_hash
 * ============================================================================
 */

// ============================================================================
// A. UTM TRACKING
// ============================================================================

var UTM_LOG_SHEET = 'UtmLog';
var UTM_LOG_HEADERS = ['timestamp','utm_source','utm_campaign','utm_content','target_url','response_id_anon','user_agent_hash'];

function _utmGetSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(UTM_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(UTM_LOG_SHEET);
    sh.appendRow(UTM_LOG_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Logga un click UTM (chiamato dal redirect endpoint o pixel).
 * @param meta {Object} { utm_source, utm_campaign, utm_content, target_url, response_id, ua }
 */
function utm_logClick(meta) {
  try {
    meta = meta || {};
    var sh = _utmGetSheet_();
    var ridAnon = '';
    if (meta.response_id) {
      ridAnon = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(meta.response_id))
        .map(function(b){ b = (b<0)?b+256:b; var s = b.toString(16); return s.length===1?'0'+s:s; })
        .join('').substring(0, 16);
    }
    var uaHash = '';
    if (meta.ua) {
      uaHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(meta.ua))
        .map(function(b){ b = (b<0)?b+256:b; var s = b.toString(16); return s.length===1?'0'+s:s; })
        .join('').substring(0, 12);
    }
    sh.appendRow([
      new Date().toISOString(),
      meta.utm_source || '',
      meta.utm_campaign || '',
      meta.utm_content || '',
      meta.target_url || '',
      ridAnon,
      uaHash
    ]);
    // Hook CRM: se il click ha response_id e content == servizio Duemilamusei, scoring +5
    if (meta.response_id && /servizio|service/i.test(String(meta.utm_content || ''))) {
      try {
        if (typeof crm_recordEvent === 'function') {
          crm_recordEvent(meta.response_id, 'service_clicked', 5, { utm: meta });
        }
      } catch(e) {}
    }
    // Hook CRM: digest_opened
    if (meta.response_id && /digest/i.test(String(meta.utm_source || ''))) {
      try {
        if (typeof crm_recordEvent === 'function') {
          crm_recordEvent(meta.response_id, 'digest_opened', 1, { utm: meta });
        }
      } catch(e) {}
    }
    return { ok: true };
  } catch(e) {
    Logger.log('utm_logClick ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Genera URL trackato per uso in digest.
 * Es. utm_buildTrackedUrl('https://example.com', {source:'digest', campaign:'weekly20', content:'bando_pnrr', responseId:'uuid-...'})
 *   -> URL della webapp con parametro ?track=...&t=... che a sua volta redirige.
 */
function utm_buildTrackedUrl(targetUrl, params) {
  params = params || {};
  var qs = [
    'utm_source='   + encodeURIComponent(params.source || ''),
    'utm_campaign=' + encodeURIComponent(params.campaign || ''),
    'utm_content='  + encodeURIComponent(params.content || ''),
    'utm_target='   + encodeURIComponent(targetUrl || ''),
    'utm_rid='      + encodeURIComponent(params.responseId || '')
  ].join('&');
  var webappUrl = '';
  try { webappUrl = ScriptApp.getService().getUrl() || ''; } catch(e) {}
  return webappUrl + '?utm=track&' + qs;
}

/**
 * Handler chiamato da doGet quando query string contiene ?utm=track
 * Logga e fa redirect HTML alla destinazione.
 */
function utm_handleRedirect(eventQueryString) {
  try {
    var params = {};
    String(eventQueryString || '').split('&').forEach(function(kv){
      var p = kv.split('=');
      if (p.length === 2) params[p[0]] = decodeURIComponent(p[1] || '');
    });
    var target = params.utm_target || '/';
    utm_logClick({
      utm_source:   params.utm_source,
      utm_campaign: params.utm_campaign,
      utm_content:  params.utm_content,
      target_url:   target,
      response_id:  params.utm_rid
    });
    var html = '<html><head><meta http-equiv="refresh" content="0;url=' + target + '"></head>'
      + '<body>Redirect in corso... Se non vieni reindirizzato, <a href="' + target + '">clicca qui</a>.</body></html>';
    return HtmlService.createHtmlOutput(html);
  } catch(e) {
    return HtmlService.createHtmlOutput('Errore redirect: ' + e.message);
  }
}

// ============================================================================
// B. RIGHT-TO-BE-FORGOTTEN
// ============================================================================

var FORGET_AUDIT_SHEET = 'ForgetAudit';
var FORGET_AUDIT_HEADERS = ['timestamp','request_type','identifier_hash','deleted_from','exit_status'];

function _forgetGetAuditSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FORGET_AUDIT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FORGET_AUDIT_SHEET);
    sh.appendRow(FORGET_AUDIT_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function _forgetHash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))
    .map(function(b){ b = (b<0)?b+256:b; var x = b.toString(16); return x.length===1?'0'+x:x; })
    .join('').substring(0, 16);
}

/**
 * Right-to-be-forgotten endpoint.
 * @param identifier {string} email O response_id (UUID Matrix)
 * @return { ok, deletedFrom: ['ResponsesMatrix','ContactsMatrix','CRM_Leads','MailingList'], audit }
 */
function forgetMyData(identifier) {
  try {
    if (!identifier) return { ok: false, error: 'identifier mancante (email o response_id)' };
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var isEmail = String(identifier).indexOf('@') > 0;
    var idLow = String(identifier).toLowerCase().trim();
    var deletedFrom = [];

    function purgeSheet(sheetName, colIdx) {
      var sh = ss.getSheetByName(sheetName);
      if (!sh) return 0;
      var vals = sh.getDataRange().getValues();
      var count = 0;
      for (var r = vals.length - 1; r >= 1; r--) {
        if (String(vals[r][colIdx]).toLowerCase().trim() === idLow) {
          sh.deleteRow(r + 1);
          count++;
        }
      }
      return count;
    }

    // ResponsesMatrix: cancella se response_id corrisponde (NO email — disaccoppiata)
    if (!isEmail) {
      var n1 = purgeSheet('ResponsesMatrix', 0);
      if (n1 > 0) deletedFrom.push('ResponsesMatrix (' + n1 + ')');
    }
    // ContactsMatrix: ha colonna email (1) e response_id (0)
    var n2 = isEmail ? purgeSheet('ContactsMatrix', 1) : purgeSheet('ContactsMatrix', 0);
    if (n2 > 0) deletedFrom.push('ContactsMatrix (' + n2 + ')');
    // CRM_Leads: email (1) o response_id (0)
    var n3 = isEmail ? purgeSheet('CRM_Leads', 1) : purgeSheet('CRM_Leads', 0);
    if (n3 > 0) deletedFrom.push('CRM_Leads (' + n3 + ')');
    // MailingList: email
    if (isEmail) {
      var n4 = purgeSheet('MailingList', 0);
      if (n4 > 0) deletedFrom.push('MailingList (' + n4 + ')');
    }

    // Audit
    var auditSh = _forgetGetAuditSheet_();
    auditSh.appendRow([
      new Date().toISOString(),
      isEmail ? 'email' : 'response_id',
      _forgetHash_(idLow),
      deletedFrom.join(', '),
      deletedFrom.length ? 'success' : 'no_records'
    ]);

    Logger.log('forgetMyData: ' + idLow + ' -> ' + deletedFrom.join(', '));
    return {
      ok: true,
      identifierType: isEmail ? 'email' : 'response_id',
      deletedFrom: deletedFrom,
      totalDeleted: deletedFrom.length,
      message: deletedFrom.length > 0
        ? 'Cancellazione completata. I dati sono stati rimossi.'
        : 'Nessun record trovato per questo identificatore.'
    };
  } catch(e) {
    Logger.log('forgetMyData ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// C. TRASPARENZA — dati AGGREGATI ANONIMI
// ============================================================================

/**
 * Restituisce dati aggregati per pagina /trasparenza pubblica.
 * Nessun dato personale. Tutti i conteggi sono numerici aggregati.
 */
function getTrasparenzaData() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var out = {
      ok: true,
      generatedAt: new Date().toISOString(),
      matrix: { totalCompilations: 0, complete: 0, partial: 0, distribReg: {}, tempoMedioMin: null },
      funnel: { lead: 0, mql: 0, sql: 0, hot: 0, cliente: 0 },
      bandi: { totaleMonitorati: 0 },
      fonti: { totale: 0, attive: 0, silenti: 0 }
    };

    // Matrix
    var shM = ss.getSheetByName('ResponsesMatrix');
    if (shM && shM.getLastRow() > 1) {
      var vals = shM.getDataRange().getValues();
      var head = vals[0].map(function(h){ return String(h||'').trim(); });
      var iStatus = head.indexOf('completion_status');
      var iProfile = head.indexOf('museum_profile_json');
      var iTimeIn  = head.indexOf('timestamp_inizio');
      var iTimeOut = head.indexOf('timestamp_fine');
      var totMin = 0, totCount = 0;
      for (var r = 1; r < vals.length; r++) {
        if (!vals[r][0]) continue;
        out.matrix.totalCompilations++;
        var stat = String(vals[r][iStatus] || '');
        if (stat === 'complete') out.matrix.complete++;
        else if (stat === 'partial') out.matrix.partial++;
        try {
          var prof = typeof vals[r][iProfile] === 'string' ? JSON.parse(vals[r][iProfile]) : vals[r][iProfile];
          if (prof && prof.regione) {
            out.matrix.distribReg[prof.regione] = (out.matrix.distribReg[prof.regione] || 0) + 1;
          }
        } catch(e){}
        if (stat === 'complete' && vals[r][iTimeIn] && vals[r][iTimeOut]) {
          var t1 = new Date(vals[r][iTimeIn]).getTime();
          var t2 = new Date(vals[r][iTimeOut]).getTime();
          if (t2 > t1) { totMin += (t2 - t1) / 60000; totCount++; }
        }
      }
      if (totCount > 0) out.matrix.tempoMedioMin = Math.round(totMin / totCount * 10) / 10;
    }

    // Funnel
    var shC = ss.getSheetByName('CRM_Leads');
    if (shC && shC.getLastRow() > 1) {
      var vC = shC.getDataRange().getValues();
      for (var r2 = 1; r2 < vC.length; r2++) {
        if (!vC[r2][0]) continue;
        var stato = String(vC[r2][10] || 'lead');
        if (out.funnel[stato] != null) out.funnel[stato]++;
      }
    }

    // Bandi monitorati
    var shB = ss.getSheetByName('RADAR BANDI');
    if (shB && shB.getLastRow() > 1) out.bandi.totaleMonitorati = shB.getLastRow() - 1;

    // Fonti
    if (typeof getFontiCounters === 'function') {
      var fc = getFontiCounters();
      if (fc.ok && fc.counters) {
        out.fonti.totale = fc.counters.totaleGenerale || 0;
        out.fonti.silenti = fc.counters.silentiGenerale || 0;
        ['bandi','news','podcast','video'].forEach(function(t){
          out.fonti.attive += (fc.counters[t] && fc.counters[t].attive) || 0;
        });
      }
    }

    return out;
  } catch(e) {
    Logger.log('getTrasparenzaData ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// TEST
// ============================================================================

function testPrivacyModule() {
  Logger.log('=== Test UTM ===');
  Logger.log(JSON.stringify(utm_logClick({utm_source:'digest_test', utm_content:'bando_test', target_url:'/'}), null, 2));
  Logger.log('=== Test Trasparenza ===');
  Logger.log(JSON.stringify(getTrasparenzaData(), null, 2));
}

// ============================================================================
// FINE MODULO Privacy_v1.gs
// ============================================================================
