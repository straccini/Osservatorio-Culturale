// ============================================================================
// TelegramManager.js — Telegram bot functions
// v4.22 — Extracted from Codice.js (file-organization refactor)
//
// Functions: sendTelegram, sendTestTelegram
//
// Dependencies (global): TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, formatDateIT
// ============================================================================

function sendTelegram(message) {
  if(!TELEGRAM_TOKEN||!TELEGRAM_CHAT_ID) return {ok:false,error:'Token o Chat ID mancanti'};
  try {
    const resp=UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,{
      method:'post', contentType:'application/json',
      payload:JSON.stringify({chat_id:TELEGRAM_CHAT_ID,text:message,parse_mode:'Markdown',disable_web_page_preview:false}),
      muteHttpExceptions:true, deadline:30,
    });
    const result=JSON.parse(resp.getContentText());
    if(!result.ok) throw new Error('Telegram: '+result.description);
    return {ok:true, messageId:result.result.message_id};
  } catch(err) {
    Logger.log('Errore Telegram: '+err.message);
    return {ok:false, error:err.message};
  }
}

function sendTestTelegram() {
  return sendTelegram(`OK *Test OSSERVATORIO CULTURALE v3.0*\nData: ${formatDateIT(new Date())}\n_Sinopia_`);
}
