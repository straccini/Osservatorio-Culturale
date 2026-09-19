// ============================================================================
// TrendRedazione.js — Gestione redazionale del trend + onboarding Telegram
// v4.28.21 — 2026-08-04
//
// Il modulo TrendNews_v1 (v4.27.60) seleziona e propone; qui vive tutto ciò
// che serve alla REDAZIONE per governarlo dall'app invece che solo da Telegram:
//   · autorizzazione estesa ai redattori nominati (non solo super-admin)
//   · scoperta del chat-id Telegram di un nuovo approvatore, senza chiedergli
//     di trovarlo a mano
//
// AUTORIZZAZIONE — chi può pubblicare o scartare un trend:
//   1. gli admin (già previsto)
//   2. gli indirizzi in OC_EDITOR_EMAILS (i redattori)
//   3. chi possiede il token della proposta (i link nel messaggio Telegram)
// Il punto 2 è la novità: prima un redattore non poteva agire dall'app.
// ============================================================================

var TR_PROP_CHAT_RICCARDO = 'TELEGRAM_CHAT_ID_RICCARDO';

/**
 * L'utente corrente può gestire i trend?
 * Admin oppure redattore nominato in OC_EDITOR_EMAILS.
 */
function trPuoGestireTrend(token) {
  try {
    if (typeof _isCurrentUserAdmin_ === 'function' && _isCurrentUserAdmin_(token)) return true;
    var email = '';
    try {
      if (typeof _sessEmailFromToken_ === 'function') email = _sessEmailFromToken_(token) || '';
      if (!email && typeof Session !== 'undefined') email = Session.getActiveUser().getEmail() || '';
    } catch (e) {}
    if (!email) return false;
    var csv = PropertiesService.getScriptProperties().getProperty('OC_EDITOR_EMAILS') || '';
    return csv.toLowerCase().split(',').map(function (s) { return s.trim(); })
              .filter(Boolean).indexOf(String(email).toLowerCase().trim()) >= 0;
  } catch (e) { return false; }
}

/**
 * Elenco proposte per la redazione. Stessa forma di getTrendProposte, ma il
 * gate accetta anche i redattori.
 */
function trProposteRedazione(token) {
  if (!trPuoGestireTrend(token)) return { ok: false, error: 'forbidden' };
  var out = [];
  try {
    var sh = _trSheet_();
    if (sh.getLastRow() > 1) {
      var v = sh.getDataRange().getValues();
      for (var i = v.length - 1; i >= 1 && out.length < 25; i--) {
        var d = v[i][5];
        out.push({
          id: String(v[i][0]), titolo: String(v[i][2]), fonte: String(v[i][3]),
          url: String(v[i][4]),
          data: (d instanceof Date) ? Utilities.formatDate(d, 'Europe/Rome', 'dd/MM HH:mm') : String(d || ''),
          stato: String(v[i][6] || 'proposta')
        });
      }
    }
  } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, proposte: out, evidenza: getTrendInEvidenza(), criterio: trCriterioAttivo(),
           autopilota: (typeof _trAutopilotaOn_ === 'function') ? _trAutopilotaOn_() : false };
}

/**
 * v4.32 — Accende/spegne l'autopilota del martedì (silenzio-assenso):
 * con l'autopilota attivo, una proposta rimasta senza risposta viene
 * pubblicata da sola il martedì mattina dal cron trendProponi.
 */
function trAutopilotaImposta(on, token) {
  if (!trPuoGestireTrend(token)) return { ok: false, error: 'forbidden' };
  var p = PropertiesService.getScriptProperties();
  if (on) p.setProperty('OC_TREND_AUTOPILOT', 'on');
  else p.deleteProperty('OC_TREND_AUTOPILOT');
  return { ok: true, autopilota: !!on };
}

/** Azione dalla redazione: pubblica / scarta / elimina. */
function trAzioneRedazione(id, azione, token) {
  if (!trPuoGestireTrend(token)) return { ok: false, error: 'forbidden' };
  // trendEsegui accetta adminToken oppure il token della proposta; qui abbiamo
  // già verificato il permesso, quindi si passa il token amministrativo.
  return trendEsegui(id, azione, { adminToken: token, _redazione: true });
}

/** Il criterio editoriale in vigore, per mostrarlo a chi decide. */
function trCriterioAttivo() {
  return {
    versione: 'v4.27.60',
    priorita: [
      'progetti culturali complessi e strutturati (non mostre o eventi spot)',
      'dimensione territoriale: rigenerazione, borghi, reti locali',
      'modelli partecipativi: co-progettazione, comunità, governance condivisa',
      'progetti originali anche esteri che aprono prospettive',
      'interesse per un pubblico tecnico: progettisti, funzionari, operatori'
    ],
    esclusioni: 'annunci di mostre, anniversari, cronaca locale senza modello replicabile',
    facolta: 'Claude può rispondere "nessuna all\'altezza": in quel caso il giro salta — meglio nessun trend che uno debole',
    fallback: 'se l\'API non risponde si torna al punteggio, segnalato come tale'
  };
}

// ---------------------------------------------------------------------------
// ONBOARDING TELEGRAM — trovare il chat-id di un nuovo approvatore
// ---------------------------------------------------------------------------

/**
 * Legge gli ultimi messaggi ricevuti dal bot e restituisce i mittenti con il
 * loro chat-id. È il modo per registrare un nuovo approvatore senza chiedergli
 * di cercare il proprio id: gli si fa scrivere una parola al bot e qui compare.
 *
 * Nessuna scrittura: solo lettura da Telegram.
 */
function trTelegramMittenti(token) {
  if (!trPuoGestireTrend(token)) return { ok: false, error: 'forbidden' };
  var p = PropertiesService.getScriptProperties();
  var bot = p.getProperty('TELEGRAM_TOKEN') || p.getProperty('TELEGRAM_BOT_TOKEN') || '';
  if (!bot) return { ok: false, error: 'Bot Telegram non configurato (TELEGRAM_TOKEN)' };
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + bot + '/getUpdates?limit=50',
                                 { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'Telegram HTTP ' + resp.getResponseCode() };
    var data = JSON.parse(resp.getContentText());
    if (!data.ok) return { ok: false, error: 'Telegram: ' + (data.description || 'errore') };
    var visti = {}, mittenti = [];
    (data.result || []).forEach(function (u) {
      var m = u.message || u.edited_message || u.channel_post;
      if (!m || !m.chat) return;
      var id = String(m.chat.id);
      if (visti[id]) return;
      visti[id] = true;
      var nome = [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' ') ||
                 m.chat.title || m.chat.username || '(senza nome)';
      mittenti.push({
        chatId: id,
        nome: nome,
        username: m.chat.username ? '@' + m.chat.username : '',
        ultimoMessaggio: String(m.text || '').substring(0, 40),
        gia_registrato: (id === p.getProperty('TELEGRAM_CHAT_ID')) ? 'Silvano'
                      : (id === p.getProperty(TR_PROP_CHAT_RICCARDO)) ? 'Riccardo' : ''
      });
    });
    return {
      ok: true,
      mittenti: mittenti,
      nota: mittenti.length
        ? 'Copia il chatId della persona e registralo con "Registra Riccardo".'
        : 'Nessun messaggio recente. Fai scrivere al bot un messaggio qualsiasi e ricarica. ' +
          'Telegram conserva gli aggiornamenti per 24 ore.',
      giaConfigurati: {
        silvano: p.getProperty('TELEGRAM_CHAT_ID') ? 'sì' : 'no',
        riccardo: p.getProperty(TR_PROP_CHAT_RICCARDO) ? 'sì' : 'no'
      }
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Registra il chat-id di Riccardo e gli manda subito un messaggio di prova:
 * se lo riceve, il canale funziona davvero — non "dovrebbe funzionare".
 */
function trRegistraRiccardo(chatId, token) {
  if (!trPuoGestireTrend(token)) return { ok: false, error: 'forbidden' };
  var id = String(chatId || '').trim();
  if (!/^-?\d+$/.test(id)) return { ok: false, error: 'chatId non valido: attesi solo numeri (es. 123456789)' };
  PropertiesService.getScriptProperties().setProperty(TR_PROP_CHAT_RICCARDO, id);
  var prova = { ok: false };
  try {
    prova = _trTgSendTo_(id, '✅ <b>Osservatorio Culturale</b>\n\nCanale attivato. ' +
      'Da ora riceverai le proposte di notizia in evidenza con i pulsanti per pubblicare o scartare.');
  } catch (e) { prova = { ok: false, error: e.message }; }
  return {
    ok: true, chatIdRegistrato: id,
    messaggioDiProva: prova.ok ? 'inviato' : ('NON inviato: ' + (prova.error || 'errore')),
    nota: prova.ok ? 'Chiedi conferma della ricezione: se è arrivato, il canale è operativo.'
                   : 'Il chat-id è salvato ma il messaggio non è partito: verifica che abbia avviato il bot con /start.'
  };
}

/** Stato del canale di approvazione: chi riceve le proposte. */
function trStatoApprovatori(token) {
  if (!trPuoGestireTrend(token)) return { ok: false, error: 'forbidden' };
  var p = PropertiesService.getScriptProperties();
  var bot = p.getProperty('TELEGRAM_TOKEN') || p.getProperty('TELEGRAM_BOT_TOKEN') || '';
  return {
    ok: true,
    bot: bot ? 'configurato' : 'MANCANTE',
    silvano: p.getProperty('TELEGRAM_CHAT_ID') || '(non configurato)',
    riccardo: p.getProperty(TR_PROP_CHAT_RICCARDO) || '(non configurato)',
    redattoriAbilitati: p.getProperty('OC_EDITOR_EMAILS') || '(nessuno)',
    nota: 'Gli approvatori Telegram ricevono la proposta con i link Pubblica/Scarta. ' +
          'I redattori in OC_EDITOR_EMAILS possono agire anche dall\'app, sezione Segnalazioni.'
  };
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

function trSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function ok(nome, cond) { if (cond) pass++; else { fail++; falliti.push(nome); } }
  var c = trCriterioAttivo();
  ok('cinque criteri di priorità', c.priorita.length === 5);
  ok('esclusioni dichiarate', /mostre/.test(c.esclusioni));
  ok('facoltà di non scegliere', /nessuna all/.test(c.facolta));
  // validazione chatId: solo cifre, eventualmente negative (i gruppi)
  ok('chatId con lettere rifiutato', !/^-?\d+$/.test('abc123'));
  ok('chatId numerico accettato', /^-?\d+$/.test('123456789'));
  ok('chatId di gruppo accettato', /^-?\d+$/.test('-1001234567890'));
  ok('chatId vuoto rifiutato', !/^-?\d+$/.test(''));
  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
