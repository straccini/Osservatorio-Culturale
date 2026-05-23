/**
 * ============================================================================
 *  AgentDigest.js — Composizione e invio email tematiche per agente (v4.18.55)
 * ----------------------------------------------------------------------------
 *  Per ogni agente, compone una email HTML personalizzata con i contenuti
 *  piu rilevanti per ogni museo profilato, e la invia nei giorni previsti.
 *
 *  Funzioni trigger:
 *    sendAgentEmails()                — verifica quale agente deve inviare oggi e invia
 *    sendAgentEmailForced(agenteId)   — forza invio per un agente specifico
 *
 *  Funzioni admin:
 *    previewAgentEmail(agenteId, email) — anteprima HTML senza invio
 *    getAgentEmailStats()             — statistiche invii per agente
 *
 *  Dipendenze: AgentConfig.js, AgentRouting.js, AgentScanner.js
 * ============================================================================
 */

var AGENT_DELIVERY_SHEET = 'AgentDeliveryLog';
var AGENT_DELIVERY_HEADERS = ['ID', 'Email', 'AgenteID', 'AgenteCodice', 'Data', 'NumContenuti', 'Subject', 'Errore'];

// ============================================================================
// TRIGGER PRINCIPALE — Chiamato da trigger giornaliero
// ============================================================================

/**
 * Verifica quali agenti devono inviare oggi e lancia l'invio per ciascuno.
 * Da installare come trigger giornaliero (07:00).
 */
function sendAgentEmails() {
  var today = new Date();
  var results = [];

  OC_AGENTI.forEach(function(agent) {
    if (isAgentEmailDay(agent, today)) {
      Logger.log('Invio ' + agent.codice + ' (' + agent.nomeBreve + ') — oggi e giorno di invio');
      var r = _sendForAgent_(agent.id);
      results.push(r);
    }
  });

  if (results.length === 0) {
    Logger.log('Nessun agente deve inviare oggi (' + today.toISOString().split('T')[0] + ')');
  }
  return results;
}

/**
 * Forza invio per un agente specifico (admin/test).
 * @param {number} agenteId
 * @param {Object} [opts] — {dryRun, maxDestinatari}
 */
function sendAgentEmailForced(agenteId, opts) {
  opts = opts || {};
  var agent = getAgentConfig(agenteId);
  if (!agent) return { ok: false, error: 'Agente non trovato' };
  return _sendForAgent_(agenteId, opts);
}

// ============================================================================
// LOGICA INVIO
// ============================================================================

function _sendForAgent_(agenteId, opts) {
  opts = opts || {};
  var t0 = Date.now();
  var agent = getAgentConfig(agenteId);

  try {
    // 1. Carica destinatari (musei profilati con opt-in per questo agente)
    var destinatari = _getAgentRecipients_(agenteId);
    if (opts.maxDestinatari) destinatari = destinatari.slice(0, opts.maxDestinatari);

    if (destinatari.length === 0) {
      Logger.log('  ' + agent.codice + ': nessun destinatario con opt-in');
      return { ok: true, agenteId: agenteId, inviati: 0, note: 'nessun destinatario' };
    }

    Logger.log('  ' + agent.codice + ': ' + destinatari.length + ' destinatari');

    // v4.18.68 — Quota check
    var remainingQuota = 0;
    try { remainingQuota = MailApp.getRemainingDailyQuota(); } catch(_){}
    if (remainingQuota < 1) {
      Logger.log('WARN: quota email esaurita, invio sospeso');
      return { ok:false, error:'quota_esaurita' };
    }

    // 2. Per ogni destinatario, calcola contenuti rilevanti e invia
    var inviati = 0, errori = 0;
    var deliverySheet = opts.dryRun ? null : _getOrCreateDeliverySheet_();

    destinatari.forEach(function(dest) {
      try {
        var relevant = getRelevantContent(dest.email, agenteId, agent.maxContenuti || 10);
        if (!relevant.ok || relevant.items.length === 0) return;

        var html = _buildAgentEmailHtml_(agent, relevant.items, dest, relevant.museo);
        var subject = _buildAgentSubject_(agent, relevant.items);

        if (!opts.dryRun) {
          try { if (MailApp.getRemainingDailyQuota() < 1) { Logger.log('Quota esaurita, invio parziale'); break; } } catch(_){}
          MailApp.sendEmail({
            to: dest.email,
            subject: subject,
            htmlBody: html,
            name: 'Sinopia · Osservatorio Culturale',
            replyTo: 's.straccini@gmail.com'
          });

          // Log
          if (deliverySheet) {
            var logId = 'AD-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5);
            deliverySheet.appendRow([logId, dest.email, agenteId, agent.codice, new Date().toISOString(), relevant.items.length, subject, '']);
          }

          // CRM hook
          if (typeof crm_recordEvent === 'function') {
            crm_recordEvent(dest.responseId || dest.email, 'digest_sent', 1, { agente: agent.codice });
          }
        }
        inviati++;
      } catch(eMail) {
        errori++;
        Logger.log('    Errore invio a ' + dest.email + ': ' + eMail.message);
        if (deliverySheet) {
          deliverySheet.appendRow(['', dest.email, agenteId, agent.codice, new Date().toISOString(), 0, '', eMail.message]);
        }
      }
    });

    var elapsed = Date.now() - t0;
    Logger.log('  ' + agent.codice + ' completato: ' + inviati + ' inviati, ' + errori + ' errori (' + Math.round(elapsed / 1000) + 's)');
    return { ok: true, agenteId: agenteId, inviati: inviati, errori: errori, tempoMs: elapsed };
  } catch(e) {
    return { ok: false, agenteId: agenteId, error: e.message };
  }
}

// ============================================================================
// DESTINATARI
// ============================================================================

function _getAgentRecipients_(agenteId) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

  // Prima fonte: ProfiloAgenti (opt-in esplicito per agente)
  var shP = ss.getSheetByName('ProfiloAgenti');
  if (shP && shP.getLastRow() > 1) {
    var pData = shP.getDataRange().getValues();
    var pHead = pData[0];
    var iEmail = pHead.indexOf('Email');
    var iOptIn = pHead.indexOf('OptIn_AG' + agenteId);
    var iRespId = pHead.indexOf('ResponseID');

    if (iOptIn >= 0 && iEmail >= 0) {
      var recipients = [];
      var _seenEmails = {};
      for (var r = 1; r < pData.length; r++) {
        if (pData[r][iOptIn] === true || String(pData[r][iOptIn]).toLowerCase() === 'true') {
          var em = String(pData[r][iEmail] || '').trim().toLowerCase();
          if (_seenEmails[em]) continue;
          _seenEmails[em] = true;
          recipients.push({
            email: em,
            responseId: pData[r][iRespId] || ''
          });
        }
      }
      if (recipients.length > 0) return recipients;
    }
  }

  // Fallback: tutti i lead con sessione attiva (Sessioni_v1)
  var shS = ss.getSheetByName('Sessioni_v1');
  if (!shS || shS.getLastRow() < 2) return [];

  var sData = shS.getDataRange().getValues();
  var sHead = sData[0];
  var iSEmail = sHead.indexOf('email');
  var iRevoked = sHead.indexOf('revoked');
  var iMatrix = sHead.indexOf('matrix_completato');

  var fallback = [];
  var _seenEmails = {};
  for (var r2 = 1; r2 < sData.length; r2++) {
    var em = String(sData[r2][iSEmail] || '').trim().toLowerCase();
    if (!em) continue;
    if (_seenEmails[em]) continue;
    if (sData[r2][iRevoked] === true) continue;
    // Solo chi ha completato Matrix riceve le email degli agenti
    if (sData[r2][iMatrix] !== true && String(sData[r2][iMatrix]).toLowerCase() !== 'true') continue;
    _seenEmails[em] = true;
    fallback.push({ email: em, responseId: '' });
  }
  return fallback;
}

// ============================================================================
// HTML EMAIL BUILDER
// ============================================================================

function _buildAgentEmailHtml_(agent, items, dest, museo) {
  var headerColor = agent.color || '#1A1815';
  var museoName = (museo && museo.found) ? (museo.tipologia || 'il tuo museo') : 'il tuo museo';

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:Georgia,serif;background:#FAF8F4;">';

  // Header
  html += '<div style="background:' + headerColor + ';padding:24px 32px;text-align:center;">';
  html += '<h1 style="color:#fff;font-size:22px;margin:0;">' + agent.icon + ' ' + agent.nome + '</h1>';
  html += '<p style="color:rgba(255,255,255,0.8);font-size:13px;margin:6px 0 0;">Sinopia · Osservatorio Culturale</p>';
  html += '</div>';

  // Intro
  html += '<div style="padding:28px 32px;max-width:600px;margin:0 auto;">';
  if (museo && museo.found) {
    html += '<p style="font-size:15px;color:#3A3631;">Contenuti selezionati per <strong>' + museoName + '</strong>:</p>';
  } else {
    html += '<p style="font-size:15px;color:#3A3631;">I contenuti piu rilevanti della settimana:</p>';
  }

  // Items
  items.forEach(function(item, idx) {
    var badge = item.badge ? '<span style="background:#E8F5E9;color:#1B5E20;font-size:10px;padding:2px 6px;border-radius:3px;margin-left:8px;">' + item.badge + '</span>' : '';
    html += '<div style="border-left:3px solid ' + headerColor + ';padding:12px 16px;margin:16px 0;background:#fff;border-radius:4px;">';
    html += '<h3 style="margin:0 0 6px;font-size:16px;color:#1A1815;">' + _agentEsc_(item.titolo) + badge + '</h3>';
    if (item.sommario) html += '<p style="margin:0 0 8px;font-size:13px;color:#6E6A62;line-height:1.4;">' + _agentEsc_(item.sommario) + '</p>';
    var meta = [];
    if (item.fonte) meta.push(item.fonte);
    if (item.data) meta.push(item.data);
    if (item.relevanceScore) meta.push('Match: ' + item.relevanceScore + '%');
    if (meta.length) html += '<p style="margin:0;font-size:11px;color:#9E9A92;">' + meta.join(' · ') + '</p>';
    if (item.url) html += '<a href="' + item.url + '" style="display:inline-block;margin-top:8px;font-size:12px;color:' + headerColor + ';text-decoration:none;font-weight:600;">Leggi →</a>';
    html += '</div>';
  });

  // CTA
  html += '<div style="text-align:center;margin:32px 0 16px;padding:20px;background:#F5F3EF;border-radius:8px;">';
  html += '<p style="font-size:14px;color:#3A3631;margin:0 0 12px;">' + (agent.ctaText || 'Vuoi saperne di piu?') + '</p>';
  html += '<a href="mailto:s.straccini@gmail.com?subject=' + encodeURIComponent(agent.nomeBreve + ' - richiesta info') + '" style="display:inline-block;padding:10px 24px;background:' + headerColor + ';color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Contattaci</a>';
  html += '</div>';

  // Footer
  html += '<p style="font-size:11px;color:#9E9A92;text-align:center;margin-top:32px;">Ricevi questa email perche hai compilato MuseMu Matrix.<br>Per non ricevere piu: rispondi STOP.</p>';
  html += '</div></body></html>';

  return html;
}

function _buildAgentSubject_(agent, items) {
  var count = items.length;
  var subjects = {
    1: 'Radar Bandi · ' + count + ' opportunita per il tuo museo',
    2: 'Normativa Musei · Aggiornamenti del mese',
    3: 'Innovare il Museo · ' + count + ' idee e best practice',
    4: 'Museo & Comunita · Welfare, accessibilita, pubblici',
    5: 'Museo Digitale · AI, dati e strumenti'
  };
  return 'Sinopia · ' + (subjects[agent.id] || agent.nomeBreve);
}

function _agentEsc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================================
// DELIVERY LOG
// ============================================================================

function _getOrCreateDeliverySheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AGENT_DELIVERY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(AGENT_DELIVERY_SHEET);
    sh.getRange(1, 1, 1, AGENT_DELIVERY_HEADERS.length).setValues([AGENT_DELIVERY_HEADERS]);
    sh.getRange(1, 1, 1, AGENT_DELIVERY_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ============================================================================
// ADMIN PREVIEW
// ============================================================================

/**
 * Genera anteprima HTML per un agente + email specifica (senza inviare).
 */
function previewAgentEmail(agenteId, email) {
  var agent = getAgentConfig(agenteId || 1);
  if (!agent) return { ok: false, error: 'Agente non trovato' };

  email = email || 's.straccini@gmail.com';
  var relevant = getRelevantContent(email, agent.id, agent.maxContenuti || 10);
  if (!relevant.ok) return relevant;

  var html = _buildAgentEmailHtml_(agent, relevant.items, { email: email }, relevant.museo);
  return { ok: true, html: html, items: relevant.items.length, museo: relevant.museo ? 'profilato' : 'generico' };
}

/**
 * Statistiche invii per agente.
 */
function getAgentEmailStats() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AGENT_DELIVERY_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, totale: 0, perAgente: {} };

  var data = sh.getDataRange().getValues();
  var stats = { totale: 0, perAgente: {} };
  for (var r = 1; r < data.length; r++) {
    var codice = data[r][3] || 'unknown';
    stats.totale++;
    stats.perAgente[codice] = (stats.perAgente[codice] || 0) + 1;
  }
  return { ok: true, totale: stats.totale, perAgente: stats.perAgente };
}

// ============================================================================
// SETUP TRIGGER INVIO EMAIL AGENTI
// ============================================================================

/**
 * Installa trigger giornaliero per verifica invio email agenti.
 * Controlla ogni mattina alle 07:30 quali agenti devono inviare.
 */
function setupAgentEmailTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendAgentEmails') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('sendAgentEmails')
    .timeBased()
    .atHour(7).nearMinute(30)
    .everyDays(1)
    .create();
  Logger.log('Trigger sendAgentEmails installato: ogni giorno 07:30');
  return { ok: true };
}
