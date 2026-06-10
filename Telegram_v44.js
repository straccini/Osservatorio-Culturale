/**
 * ================================================================
 * OSSERVATORIO CULTURALE — Telegram_v44.gs  (v4.4)
 * ----------------------------------------------------------------
 * Integrazione Telegram Bot API per notifiche e richieste di
 * autorizzazione invio newsletter.
 *
 * ScriptProperties richieste:
 *   TELEGRAM_BOT_TOKEN   — token del bot (ottenibile da @BotFather)
 *   TELEGRAM_CHAT_ID     — chat_id dell'admin (ottenibile da @userinfobot)
 *
 * Setup (eseguire una volta manualmente):
 *   setTelegramConfig('123:ABCdef...','123456789')
 *
 * Funzioni pubbliche:
 *   telegramTest()                    — invia "ping" di prova
 *   telegramNotifyAuthRequest_(obj)   — (interna) notifica richiesta autorizzazione
 *   setTelegramConfig(token, chatId)  — setup
 *   getTelegramConfigStatus()         — verifica config (solo admin)
 * ================================================================
 */

var TG_API_BASE_ = 'https://api.telegram.org/bot';

// ================== SETUP ==================

function setTelegramConfig(botToken, chatId) {
  var p = PropertiesService.getScriptProperties();
  if (botToken) p.setProperty('TELEGRAM_BOT_TOKEN', String(botToken).trim());
  if (chatId)   p.setProperty('TELEGRAM_CHAT_ID',   String(chatId).trim());
  return { ok:true, configured: !!(_tgToken_() && _tgChat_()) };
}

function getTelegramConfigStatus() {
  if (!_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  return {
    ok:        true,
    hasToken:  !!_tgToken_(),
    hasChat:   !!_tgChat_()
  };
}

// ================== PUBBLICHE ==================

/**
 * Invia un messaggio di test. Utile per verificare la configurazione.
 * Richiamabile da editor GAS.
 */
function telegramTest() {
  var tz = Session.getScriptTimeZone();
  var ts = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
  return _tgSend_('🟢 <b>Osservatorio Culturale</b>\nPing di test — ' + ts);
}

// ================== USATE DA Admin_v44 ==================

/**
 * Notifica richiesta di autorizzazione invio newsletter.
 * obj: { draftId, soggetto, autore, approveUrl, counts }
 */
function telegramNotifyAuthRequest_(obj) {
  obj = obj || {};
  var lines = [
    '🟡 <b>Richiesta autorizzazione invio</b>',
    '',
    '<b>Soggetto:</b> ' + _tgEsc_(obj.soggetto || '—'),
    '<b>Autore:</b> '   + _tgEsc_(obj.autore   || '—'),
    '<b>ID bozza:</b> <code>' + _tgEsc_(obj.draftId || '—') + '</code>'
  ];
  if (obj.counts) {
    lines.push('');
    lines.push('<b>Contenuti</b>');
    lines.push('• Bandi: '   + (obj.counts.bandi   || 0));
    lines.push('• News: '    + (obj.counts.news    || 0));
    lines.push('• Podcast: ' + (obj.counts.podcast || 0));
  }
  lines.push('');
  lines.push('Per <b>autorizzare l\'invio</b>, apri il link sotto:');
  lines.push(obj.approveUrl || '(link non disponibile)');

  return _tgSend_(lines.join('\n'));
}

// ================== LOW-LEVEL ==================

function _tgToken_() {
  // v4.23 FIX — accetta ENTRAMBE le chiavi-token usate nel progetto, unificando i 2 sottosistemi Telegram.
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('TELEGRAM_BOT_TOKEN') || p.getProperty('TELEGRAM_TOKEN') || '';
}

function _tgChat_() {
  return PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID') || '';
}

function _tgSend_(text) {
  var tok  = _tgToken_();
  var chat = _tgChat_();
  if (!tok || !chat) {
    return { ok:false, error:'telegram_not_configured' };
  }
  var url = TG_API_BASE_ + tok + '/sendMessage';
  var payload = {
    chat_id:    chat,
    text:       text,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };
  var opts = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    deadline: 10
  };
  try {
    var resp = UrlFetchApp.fetch(url, opts);
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code >= 200 && code < 300) {
      return { ok:true, code:code };
    }
    return { ok:false, code:code, body:body };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

function _tgEsc_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
/**
 * Setup Telegram — i valori vanno impostati via ScriptProperties nell'editor GAS:
 *   TELEGRAM_TOKEN e TELEGRAM_CHAT_ID
 * Questa funzione verifica solo che siano presenti.
 */
function setupTelegram() {
  var tok = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN') || '';
  var chat = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID') || '';
  if (!tok || !chat) {
    Logger.log('ATTENZIONE: TELEGRAM_TOKEN e/o TELEGRAM_CHAT_ID non impostati nelle ScriptProperties.');
    return { ok: false, error: 'Imposta TELEGRAM_TOKEN e TELEGRAM_CHAT_ID nelle ScriptProperties.' };
  }
  Logger.log('Configurazione Telegram OK.');
  Logger.log('Status: ' + JSON.stringify(getTelegramConfigStatus()));
  return { ok: true };
}

/**
 * v4.23 — DIAGNOSTICA UNICA TELEGRAM. Eseguire dall'editor GAS (Esegui -> diagnosiTelegram).
 * Mostra quali chiavi ScriptProperties sono impostate e prova ENTRAMBI i mittenti:
 *   - sendTelegram   -> alert bandi, recap scan, digest bozza, CRM, editoriale, ROC
 *   - _tgSend_       -> "Richiedi autorizzazione invio" newsletter
 * Se vedi 2 messaggi di test su Telegram, entrambi i collegamenti funzionano.
 */
function diagnosiTelegram() {
  try { if (typeof _initLegacyConsts_ === 'function') _initLegacyConsts_(); } catch(_) {}
  var p = PropertiesService.getScriptProperties();
  var kTok  = p.getProperty('TELEGRAM_TOKEN')     || '';
  var kBot  = p.getProperty('TELEGRAM_BOT_TOKEN') || '';
  var kChat = p.getProperty('TELEGRAM_CHAT_ID')   || '';
  function mask(s){ return s ? ('impostata (' + s.length + ' char, ...' + s.slice(-4) + ')') : 'NON impostata'; }
  var report = {
    TELEGRAM_TOKEN:     mask(kTok),
    TELEGRAM_BOT_TOKEN: mask(kBot),
    TELEGRAM_CHAT_ID:   mask(kChat),
    tokenPresente:      (kTok || kBot) ? 'OK (almeno una chiave token c-e)' : 'MANCANTE (nessuna delle due chiavi-token)',
    chatPresente:       kChat ? 'OK' : 'MANCANTE'
  };
  try { report.test_alert_bandi_digest = (typeof sendTelegram === 'function') ? sendTelegram('Diagnostica Telegram - mittente alert/bandi/digest (sendTelegram) OK') : 'sendTelegram assente'; }
  catch(e){ report.test_alert_bandi_digest = { ok:false, error:e.message }; }
  try { report.test_autorizzazione_newsletter = _tgSend_('Diagnostica Telegram - mittente autorizzazione newsletter (_tgSend_) OK'); }
  catch(e){ report.test_autorizzazione_newsletter = { ok:false, error:e.message }; }
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}