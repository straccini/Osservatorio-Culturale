// ============================================================================
//  TrendNews_v1.js — Notizia di TREND con approvazione Telegram
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · v4.27.59 (2026-07-29)
//
//  FLUSSO (richiesta Silvano 29/07):
//   1. Ogni 2 giorni (cron daily 9:00 + guardia 44h) trendProponi() seleziona
//      la news con lo Score più alto delle ultime 72h non ancora proposta.
//   2. La proposta va su Telegram a Silvano (TELEGRAM_CHAT_ID) e Riccardo
//      (TELEGRAM_CHAT_ID_RICCARDO, opzionale) con 2 link: Pubblica / Scarta.
//   3. Se PUBBLICATA → diventa la "Notizia in evidenza" nella home (slot
//      dedicato sopra le news); una nuova pubblicazione sostituisce la
//      precedente (che resta tra le news normali).
//   4. Se NON confermata → resta una semplice news; la proposta pendente si
//      cancella da sola dopo 14 giorni, oppure manualmente dall'area di
//      gestione (Impostazioni → Sistema → Gestione Trend).
//
//  Foglio `TrendProposte`: [ID, ItemID, Titolo, Fonte, Url, DataProposta,
//                           Stato, Token, DataEsito]
//  Stati: proposta | pubblicata | scartata
//  Evidenza corrente: ScriptProperty OC_TREND_EVIDENZA (JSON).
// ============================================================================

var TR_SHEET = 'TrendProposte';
var TR_HEADERS = ['ID', 'ItemID', 'Titolo', 'Fonte', 'Url', 'DataProposta', 'Stato', 'Token', 'DataEsito'];
var TR_GIORNI_SCADENZA_PROPOSTA = 14;   // pulizia proposte non confermate
var TR_ORE_MIN_TRA_PROPOSTE = 44;       // "ogni 2 giorni" con margine sul cron daily

function _trSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TR_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TR_SHEET);
    sh.appendRow(TR_HEADERS);
    sh.getRange(1, 1, 1, TR_HEADERS.length).setFontWeight('bold').setBackground('#6B5C9A').setFontColor('#fff');
  }
  return sh;
}

/** Invio Telegram a UNA chat esplicita (riusa il token di Telegram_v44). */
function _trTgSendTo_(chatId, text) {
  var tok = (typeof _tgToken_ === 'function') ? _tgToken_() : '';
  if (!tok || !chatId) return { ok: false, error: 'telegram_not_configured' };
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, deadline: 10,
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: false })
    });
    return { ok: resp.getResponseCode() < 300, code: resp.getResponseCode() };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Invia a Silvano + Riccardo (se configurato). Ritorna il conteggio inviati. */
function _trTgBroadcast_(text) {
  var p = PropertiesService.getScriptProperties();
  var chats = [];
  var c1 = p.getProperty('TELEGRAM_CHAT_ID') || '';
  var c2 = p.getProperty('TELEGRAM_CHAT_ID_RICCARDO') || '';
  if (c1) chats.push(c1);
  if (c2 && c2 !== c1) chats.push(c2);
  var inviati = 0;
  chats.forEach(function (c) { if (_trTgSendTo_(c, text).ok) inviati++; });
  return { inviati: inviati, configurate: chats.length };
}

/**
 * CRON (daily 9:00) — propone una news di trend ogni ~2 giorni.
 * Guardie: distanza minima 44h dall'ultima proposta; nessuna proposta pendente.
 * Include la pulizia delle proposte scadute (>14gg non confermate).
 */
function trendProponi(opts) {
  opts = opts || {};
  var out = { ok: true, proposta: null, motivoSkip: '', pulite: 0 };
  try {
    out.pulite = _trPulisciScadute_();

    var p = PropertiesService.getScriptProperties();
    if (!opts.force) {
      var last = Number(p.getProperty('OC_TREND_LAST') || 0);
      if (last && (Date.now() - last) < TR_ORE_MIN_TRA_PROPOSTE * 3600000) {
        out.motivoSkip = 'ultima proposta < ' + TR_ORE_MIN_TRA_PROPOSTE + 'h fa';
        return out;
      }
    }
    // una sola proposta pendente alla volta (con sostituisciPendente la
    // pendente viene scartata e si rivaluta — usato dal rilancio manuale)
    var sh = _trSheet_();
    var v = sh.getDataRange().getValues();
    var proposteIds = {};
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][6] || '') === 'proposta') {
        if (opts.sostituisciPendente) {
          sh.getRange(i + 1, 7).setValue('scartata');
          sh.getRange(i + 1, 9).setValue(new Date());
          out.sostituita = String(v[i][0]);
          continue; // l'item resta riproponibile: non lo aggiungo a proposteIds
        }
        out.motivoSkip = 'proposta gia pendente: ' + v[i][0];
        return out;
      }
      proposteIds[String(v[i][1] || '')] = true;
    }

    // Candidata: news ultime 72h, non archiviata, Score più alto, mai proposta
    var cand = _trSelezionaCandidata_(proposteIds);
    if (!cand) { out.motivoSkip = 'nessuna candidata nelle ultime 72h'; return out; }

    var id = 'TR' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Rome', 'yyyyMMddHHmm');
    var token = Utilities.getUuid().replace(/-/g, '');
    sh.appendRow([id, cand.id, cand.titolo, cand.fonte, cand.link, new Date(), 'proposta', token, '']);
    p.setProperty('OC_TREND_LAST', String(Date.now()));

    var appUrl = '';
    try { appUrl = ScriptApp.getService().getUrl() || ''; } catch (_) {}
    var esc = function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var msg = '📈 <b>Notizia di TREND proposta</b>\n\n'
      + '<b>' + esc(cand.titolo) + '</b>\n'
      + (cand.fonte ? esc(cand.fonte) + (cand.score ? ' · score ' + cand.score : '') + '\n' : '')
      + (cand.motivo ? '\n📝 <i>' + esc(cand.motivo) + '</i>\n' : '')
      + (cand.link ? esc(cand.link) + '\n' : '')
      + '\n✅ Pubblica in evidenza:\n' + appUrl + '?trend=ok&id=' + id + '&tk=' + token
      + '\n\n❌ Scarta:\n' + appUrl + '?trend=no&id=' + id + '&tk=' + token
      + '\n\nSenza conferma la proposta decade tra ' + TR_GIORNI_SCADENZA_PROPOSTA + ' giorni (la news resta in elenco).';
    var tg = _trTgBroadcast_(msg);
    out.proposta = { id: id, itemId: cand.id, titolo: cand.titolo, fonte: cand.fonte, motivo: cand.motivo || '(fallback score)', telegram: tg };
    Logger.log('[trend] proposta ' + id + ' — tg inviati ' + tg.inviati + '/' + tg.configurate);
  } catch (e) { out.ok = false; out.errore = e.message; Logger.log('[trendProponi] ' + e.message); }
  return out;
}

/**
 * @private Seleziona la news candidata con CRITERIO EDITORIALE (v4.27.60,
 * richiesta Silvano 29/07): non il semplice score, ma la notizia più "da
 * tendenza" — progetti complessi, territoriali, modelli partecipativi,
 * progetti originali anche esteri, di interesse anche per un pubblico tecnico.
 * Claude sceglie tra le top candidate; fallback allo score se l'API non risponde.
 * Finestra 72h; se le candidate sono poche (<8) si allarga a 7 giorni.
 */
function _trSelezionaCandidata_(proposteIds) {
  var news = (typeof getNewsListV42 === 'function') ? getNewsListV42(400) : [];
  function raccogli(oreFinestra) {
    var cutoff = Date.now() - oreFinestra * 3600000;
    var out = [];
    for (var i = 0; i < news.length; i++) {
      var n = news[i];
      if (!n || !n.id || proposteIds[String(n.id)]) continue;
      var d = n.dataAcquisizione || n.data || '';
      var dt = d ? new Date(d) : null;
      if (!dt || isNaN(dt.getTime()) || dt.getTime() < cutoff) continue;
      out.push({ id: String(n.id), titolo: String(n.titolo || ''), fonte: String(n.fonte || ''),
                 link: String(n.link || ''), score: Number(n.score || 0),
                 sommario: String(n.sommario || ''), ambito: String(n.ambito || '') });
    }
    return out;
  }
  var cand = raccogli(72);
  if (cand.length < 8) cand = raccogli(168);
  if (!cand.length) return null;
  cand.sort(function (a, b) { return b.score - a.score; });
  var top = cand.slice(0, 15);

  // ── Scelta editoriale con Claude ──
  try {
    var apiKey = (typeof _claudeKey_ === 'function') ? _claudeKey_() : '';
    if (apiKey && typeof _claudeApiCall_ === 'function') {
      var lista = top.map(function (c, i) {
        return (i + 1) + '. [id:' + c.id + '] ' + c.titolo + ' — ' + c.fonte
          + (c.sommario ? '\n   ' + c.sommario.substring(0, 220) : '');
      }).join('\n');
      var prompt = 'Sei il curatore editoriale dell\'Osservatorio Culturale Sinopia (musei, patrimonio, '
        + 'politiche culturali). Scegli UNA sola notizia da mettere "in evidenza" come TREND.\n\n'
        + 'CRITERI, in ordine di priorità:\n'
        + '1. Progetti culturali COMPLESSI e strutturati (non singole mostre o eventi spot)\n'
        + '2. Dimensione TERRITORIALE: rigenerazione, borghi, reti locali, sviluppo a base culturale\n'
        + '3. MODELLI PARTECIPATIVI: co-progettazione, comunità, governance condivisa\n'
        + '4. Progetti ORIGINALI o internazionali che aprono prospettive nuove\n'
        + '5. Interesse anche per un pubblico TECNICO (progettisti, funzionari, operatori museali)\n\n'
        + 'EVITA: semplici annunci di mostre, anniversari, gossip culturale, notizie locali senza modello replicabile.\n\n'
        + 'CANDIDATE:\n' + lista + '\n\n'
        + 'Rispondi SOLO con JSON: {"id":"<id scelto>","motivo":"<max 25 parole, in italiano>"}. '
        + 'Se nessuna merita davvero l\'evidenza, {"id":null,"motivo":"..."}.';
      var model = (typeof OC_CLAUDE_MODEL !== 'undefined') ? OC_CLAUDE_MODEL : 'claude-haiku-4-5-20251001';
      var r = _claudeApiCall_(apiKey, model, prompt, 300, 2);
      var js = (typeof _cleanParseJson_ === 'function') ? _cleanParseJson_(r.text) : null;
      if (js && js.id) {
        for (var k = 0; k < top.length; k++) {
          if (String(top[k].id) === String(js.id)) {
            top[k].motivo = String(js.motivo || '').substring(0, 200);
            Logger.log('[trend] scelta editoriale Claude: ' + top[k].titolo + ' — ' + top[k].motivo);
            return top[k];
          }
        }
      }
      if (js && js.id === null) {
        Logger.log('[trend] Claude: nessuna candidata all\'altezza — ' + (js.motivo || ''));
        return null; // meglio saltare un giro che proporre una notizia debole
      }
    }
  } catch (e) { Logger.log('[trend] selezione Claude fallita, fallback score: ' + e.message); }

  // Fallback: score più alto
  return top[0];
}

/** @private Elimina proposte pendenti più vecchie di 14 giorni. */
function _trPulisciScadute_() {
  var sh = _trSheet_();
  if (sh.getLastRow() < 2) return 0;
  var v = sh.getDataRange().getValues();
  var cutoff = Date.now() - TR_GIORNI_SCADENZA_PROPOSTA * 86400000;
  var del = [];
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][6] || '') !== 'proposta') continue;
    var d = v[i][5];
    var dt = (d instanceof Date) ? d : (d ? new Date(d) : null);
    if (dt && !isNaN(dt.getTime()) && dt.getTime() < cutoff) del.push(i + 1);
  }
  del.forEach(function (r) { try { sh.deleteRow(r); } catch (_) {} });
  return del.length;
}

/**
 * Esegue l'azione su una proposta. Chiamata dal link Telegram (id+token) o
 * dall'area di gestione admin (id + sessione admin, token proposta ignorato).
 * @param {string} id proposta · @param {string} azione pubblica|scarta|elimina
 * @param {Object} auth { tk: tokenProposta } oppure { adminToken: sessione }
 */
function trendEsegui(id, azione, auth) {
  auth = auth || {};
  try {
    var sh = _trSheet_();
    var v = sh.getDataRange().getValues();
    var row = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) { row = i; break; }
    if (row < 0) return { ok: false, error: 'proposta non trovata' };

    var isAdmin = auth.adminToken && typeof _isCurrentUserAdmin_ === 'function' && _isCurrentUserAdmin_(auth.adminToken);
    var tokenOk = auth.tk && String(auth.tk) === String(v[row][7] || '');
    if (!isAdmin && !tokenOk) return { ok: false, error: 'non autorizzato' };

    var titolo = String(v[row][2] || '');
    if (azione === 'elimina') {
      sh.deleteRow(row + 1);
      return { ok: true, azione: 'elimina', titolo: titolo };
    }
    if (azione === 'pubblica') {
      var ev = { itemId: String(v[row][1] || ''), titolo: titolo, fonte: String(v[row][3] || ''),
                 url: String(v[row][4] || ''), dataPubblicazione: new Date().toISOString() };
      PropertiesService.getScriptProperties().setProperty('OC_TREND_EVIDENZA', JSON.stringify(ev));
      sh.getRange(row + 1, 7).setValue('pubblicata');
      sh.getRange(row + 1, 9).setValue(new Date());
      try { _trTgBroadcast_('✅ Trend PUBBLICATA in evidenza: ' + titolo); } catch (_) {}
      return { ok: true, azione: 'pubblica', titolo: titolo };
    }
    if (azione === 'scarta') {
      sh.getRange(row + 1, 7).setValue('scartata');
      sh.getRange(row + 1, 9).setValue(new Date());
      return { ok: true, azione: 'scarta', titolo: titolo };
    }
    return { ok: false, error: 'azione sconosciuta: ' + azione };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Rimuove la notizia in evidenza corrente (torna una news normale). */
function trendRimuoviEvidenza(adminToken) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(adminToken)) {
    return { ok: false, error: 'forbidden' };
  }
  PropertiesService.getScriptProperties().deleteProperty('OC_TREND_EVIDENZA');
  return { ok: true };
}

/** Evidenza corrente per la home (pubblico, nessun dato sensibile). */
function getTrendInEvidenza() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('OC_TREND_EVIDENZA');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/** Lista proposte per l'area di gestione admin (ultime 25, più recenti prima). */
function getTrendProposte(adminToken) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(adminToken)) {
    return { ok: false, error: 'forbidden' };
  }
  var out = [];
  try {
    var sh = _trSheet_();
    if (sh.getLastRow() > 1) {
      var v = sh.getDataRange().getValues();
      for (var i = v.length - 1; i >= 1 && out.length < 25; i--) {
        var d = v[i][5];
        out.push({
          id: String(v[i][0]), itemId: String(v[i][1]), titolo: String(v[i][2]),
          fonte: String(v[i][3]), url: String(v[i][4]),
          data: (d instanceof Date) ? Utilities.formatDate(d, 'Europe/Rome', 'dd/MM/yyyy HH:mm') : String(d || ''),
          stato: String(v[i][6])
        });
      }
    }
  } catch (e) { return { ok: false, error: e.message }; }
  var ev = getTrendInEvidenza();
  return { ok: true, proposte: out, evidenza: ev };
}

/** Pagina HTML minima di esito per i link Telegram (?trend=ok|no). */
function _trRenderEsitoPage_(params) {
  var azione = (params.trend === 'ok') ? 'pubblica' : 'scarta';
  var r = trendEsegui(params.id, azione, { tk: params.tk });
  var colore = r.ok ? '#3F7A5E' : '#B91C1C';
  var titolo = r.ok
    ? (azione === 'pubblica' ? 'Notizia pubblicata in evidenza' : 'Proposta scartata')
    : 'Operazione non riuscita';
  var dett = r.ok ? String(r.titolo || '') : String(r.error || '');
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Georgia,serif;max-width:560px;margin:60px auto;padding:0 20px;text-align:center">'
    + '<div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#A65138;font-weight:700">Osservatorio Culturale Sinopia</div>'
    + '<h1 style="font-size:26px;color:' + colore + ';margin:18px 0 10px">' + titolo + '</h1>'
    + '<p style="font-size:15px;color:#3A3A3C;line-height:1.6">' + dett.replace(/</g, '&lt;') + '</p>'
    + '<p style="font-size:13px;color:#8A8578;margin-top:26px">Puoi chiudere questa pagina.</p>'
    + '</div>'
  ).setTitle('OCS — Trend').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
