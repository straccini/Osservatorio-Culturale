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
  return PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN') || '';
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
    muteHttpExceptions: true
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
function setupTelegram() {
  setTelegramConfig(
    '8033930905:AAHRSwFlg1xHCNVD4y5i6viOrDLP8P_c0KY',
    '5830184824'
  );
  Logger.log('Configurazione Telegram salvata.');
  Logger.log('Status: ' + JSON.stringify(getTelegramConfigStatus()));
}