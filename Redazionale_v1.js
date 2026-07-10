// ============================================================================
//  Redazionale_v1.js — Flusso redazionale settimanale (specifica Silvano 2026-07-10)
// ----------------------------------------------------------------------------
//  FLUSSO:
//   1) VENERDÌ 18:00 — il sistema genera l'editoriale (Claude) + la bozza digest
//      e MANDA COMUNICAZIONE della creazione agli admin (email + Telegram).
//   2) FINESTRA DI REVISIONE (ven 18:00 → lun 10:00) — SOLO GLI ADMIN (non i
//      redattori) possono: modificare/sostituire l'editoriale (testo, firma,
//      foto banner — UI esistente "Revisiona"), e rigenerare la COMPOSIZIONE
//      del digest scegliendo il mix (quanti bandi/news/podcast) dal pannello.
//   3) CONFERMA — un admin preme "Conferma e predisponi invio" → richiesta
//      inviata SUBITO. Oppure, allo SCADERE del termine (lunedì 10:00), il
//      sistema la invia automaticamente.
//   4) AUTORIZZAZIONE — email al SUPERADMIN con la bozza definitiva COMPLETA
//      (foto banner + editoriale + contenuto digest) e pulsante INVIA
//      (riusa la pagina di approvazione ?approveNl=ID&t=TOKEN già collaudata)
//      + avviso Telegram.
//
//  PERMESSI: revisione/conferma = admin+superadmin (_isCurrentUserAdmin_).
//  I redattori NON partecipano (loro: fonti + moderazione segnalazioni).
//
//  SCHEDULING: via CronDispatcher (OC_CRON_EXTRA) — ven 18 + lun 10.
//  redazionaleSetup() rimuove i vecchi trigger standalone (editorialeGenera
//  domenica 18 + weeklyNewsletterAuthRequest lunedì 9) ora superati.
//  Anti-doppio invio: stamp settimanale OC_RED_AUTH_SENT_<isoweek>.
// ============================================================================

var RED_PROP_DRAFT = 'OC_RED_WEEK_DRAFT';   // draftId della bozza settimanale corrente
var RED_PROP_SENT  = 'OC_RED_AUTH_SENT_';   // prefisso stamp anti-doppio (+ isoweek)
var RED_MIX_DEFAULT = { maxBandi: 8, maxNews: 6, maxPodcast: 3 };

/** Email del superadmin (override con ScriptProperty OC_SUPERADMIN_EMAIL). */
function _redSuperadmin_() {
  return PropertiesService.getScriptProperties().getProperty('OC_SUPERADMIN_EMAIL') || 's.straccini@gmail.com';
}

/** Lista email admin per le notifiche di creazione (CSV OC_ADMIN_EMAILS, fallback superadmin). */
function _redAdminEmails_() {
  var csv = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || '';
  var list = csv.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if (list.indexOf(_redSuperadmin_()) < 0) list.push(_redSuperadmin_());
  return list;
}

function _redWeek_() {
  return (typeof _ed_isoWeek_ === 'function') ? _ed_isoWeek_(new Date())
    : Utilities.formatDate(new Date(), 'Europe/Rome', 'YYYY-ww');
}

// ============================================================================
//  1) VENERDÌ 18:00 — creazione bozza + comunicazione
// ============================================================================
function redazionaleVenerdi() {
  var rep = { ok: true, settimana: _redWeek_(), editoriale: null, digest: null, notifiche: [] };
  // 1a) Editoriale (notifica admin interna già in _ed_notificaAdmin_)
  try {
    var ed = (typeof editorialeGenera === 'function') ? editorialeGenera() : null;
    rep.editoriale = ed && ed.ok !== false ? 'generato' : ('errore: ' + ((ed && ed.error) || '?'));
  } catch (e) { rep.editoriale = 'errore: ' + e.message; }

  // 1b) Bozza digest con mix di default
  try {
    var gen = _generateDigestDraftCore_(RED_MIX_DEFAULT);
    if (gen && gen.ok) {
      PropertiesService.getScriptProperties().setProperty(RED_PROP_DRAFT, gen.id);
      rep.digest = { id: gen.id, counts: gen.counts };
    } else rep.digest = { errore: (gen && gen.error) || 'draft_failed' };
  } catch (e2) { rep.digest = { errore: e2.message }; }

  // 1c) Comunicazione della creazione agli admin
  var appUrl = '';
  try { appUrl = ScriptApp.getService().getUrl() || ''; } catch (_) {}
  var msg = 'Bozza redazionale della settimana creata.\n' +
    '- Editoriale: ' + rep.editoriale + '\n' +
    '- Digest: ' + (rep.digest && rep.digest.id ? rep.digest.id : JSON.stringify(rep.digest)) + '\n\n' +
    'Finestra di revisione: da ora a LUNEDÌ 10:00.\n' +
    'Potete modificare l\'editoriale (testo, firma, foto) e il mix del digest dalla pagina Digest.\n' +
    'Senza modifiche, lunedì alle 10:00 parte automaticamente la richiesta di invio al superadmin.';
  try {
    MailApp.sendEmail({
      to: _redAdminEmails_().join(','),
      subject: '[OCS] Bozza redazionale creata — revisione entro lunedì 10:00',
      htmlBody: '<div style="font-family:Georgia,serif;max-width:560px">' +
        '<h2 style="margin:0 0 10px">Bozza redazionale creata</h2>' +
        '<p style="line-height:1.6">' + msg.replace(/\n/g, '<br>') + '</p>' +
        (appUrl ? '<p><a href="' + appUrl + '" style="display:inline-block;background:#8B3A1F;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600">Apri la pagina Digest &rarr;</a></p>' : '') +
        '</div>'
    });
    rep.notifiche.push('email admin');
  } catch (eM) { rep.notifiche.push('email KO: ' + eM.message); }
  try { if (typeof sendTelegram === 'function') { sendTelegram('📰 ' + msg); rep.notifiche.push('telegram'); } } catch (_) {}

  Logger.log('[Redazionale] venerdì: ' + JSON.stringify(rep));
  return rep;
}

// ============================================================================
//  2) REVISIONE — rigenera il digest col mix scelto dal pannello (solo admin)
// ============================================================================
function redazionaleRigenera(opts, token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) return { ok: false, error: 'forbidden' };
  opts = opts || {};
  var mix = {
    maxBandi:   Math.max(0, Math.min(20, Number(opts.maxBandi)   || RED_MIX_DEFAULT.maxBandi)),
    maxNews:    Math.max(0, Math.min(20, Number(opts.maxNews)    || RED_MIX_DEFAULT.maxNews)),
    maxPodcast: Math.max(0, Math.min(10, Number(opts.maxPodcast) || RED_MIX_DEFAULT.maxPodcast)),
    filtroAmbito: String(opts.filtroAmbito || '').trim()
  };
  var gen = _generateDigestDraftCore_(mix);
  if (gen && gen.ok) {
    PropertiesService.getScriptProperties().setProperty(RED_PROP_DRAFT, gen.id);
    return { ok: true, id: gen.id, counts: gen.counts, mix: mix };
  }
  return { ok: false, error: (gen && gen.error) || 'draft_failed' };
}

// ============================================================================
//  3) CONFERMA ANTICIPATA (admin) o SCADENZA TERMINE (lunedì 10:00)
// ============================================================================
function redazionaleConferma(token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) return { ok: false, error: 'forbidden' };
  return _redInviaRichiesta_('conferma admin');
}

function redazionaleLunedi() {
  var week = _redWeek_();
  if (PropertiesService.getScriptProperties().getProperty(RED_PROP_SENT + week)) {
    Logger.log('[Redazionale] lunedì: richiesta già inviata per ' + week + ' (conferma anticipata) — skip');
    return { ok: true, skipped: true, settimana: week };
  }
  return _redInviaRichiesta_('scadenza termine lunedì 10:00');
}

// ============================================================================
//  4) RICHIESTA DI AUTORIZZAZIONE — email al superadmin con bozza completa + INVIA
// ============================================================================
function _redInviaRichiesta_(motivo) {
  var props = PropertiesService.getScriptProperties();
  var week = _redWeek_();
  var rep = { ok: true, settimana: week, motivo: motivo };

  // Bozza della settimana (fallback: genera al volo se manca)
  var draftId = props.getProperty(RED_PROP_DRAFT) || '';
  var draft = draftId ? _loadDraft_(draftId) : null;
  if (!draft) {
    var gen = _generateDigestDraftCore_(RED_MIX_DEFAULT);
    if (!gen || !gen.ok) {
      rep.ok = false; rep.error = 'nessuna bozza e generazione fallita: ' + ((gen && gen.error) || '?');
      try { if (typeof sendTelegram === 'function') sendTelegram('⚠️ Redazionale: richiesta invio FALLITA (' + rep.error + ')'); } catch (_) {}
      return rep;
    }
    draftId = gen.id; draft = _loadDraft_(draftId);
    props.setProperty(RED_PROP_DRAFT, draftId);
  }

  // Token + stato in_attesa_approvazione + Telegram (riusa il core collaudato)
  var req = _requestSendAuthorizationCore_(draftId);
  if (!req || !req.ok) { rep.ok = false; rep.error = 'auth core: ' + ((req && req.error) || '?'); return rep; }
  rep.draftId = draftId;
  rep.approveUrl = req.approveUrl;

  // Email al SUPERADMIN: bozza definitiva COMPLETA (editoriale+foto+firma inclusi
  // da buildNewsletterHtml_) + pulsante INVIA in testa
  var htmlNewsletter = '';
  try { htmlNewsletter = buildNewsletterHtml_(_loadDraft_(draftId)); } catch (eB) { htmlNewsletter = '<p>(anteprima non disponibile: ' + eB.message + ')</p>'; }
  var testata =
    '<div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;padding:18px;background:#FFF8F0;border:2px solid #8B3A1F;border-radius:12px">' +
    '<h2 style="margin:0 0 8px;color:#8B3A1F">Richiesta di autorizzazione invio</h2>' +
    '<p style="margin:0 0 6px;line-height:1.55">Newsletter settimana <b>' + week + '</b> · motivo: <b>' + motivo + '</b>.<br>' +
    'Qui sotto la <b>bozza definitiva completa</b> (foto, editoriale e contenuti digest) così come arriverà ai lettori.</p>' +
    '<p style="margin:14px 0 4px"><a href="' + req.approveUrl + '" style="display:inline-block;background:#2E7D32;color:#fff;text-decoration:none;padding:14px 34px;border-radius:10px;font-size:16px;font-weight:700">✉️ INVIA la newsletter &rarr;</a></p>' +
    '<p style="margin:4px 0 0;font-size:12px;color:#8A8A8A">Il pulsante apre la pagina di conferma: nessun invio parte senza il tuo click finale lì.</p>' +
    '</div><div style="height:18px"></div>';
  try {
    MailApp.sendEmail({
      to: _redSuperadmin_(),
      subject: '[OCS] AUTORIZZAZIONE INVIO — newsletter ' + week + ' (bozza definitiva)',
      htmlBody: testata + htmlNewsletter
    });
    rep.emailSuperadmin = _redSuperadmin_();
  } catch (eM) { rep.emailErrore = eM.message; }

  props.setProperty(RED_PROP_SENT + week, new Date().toISOString());
  Logger.log('[Redazionale] richiesta invio (' + motivo + ') → ' + _redSuperadmin_() + ' · draft ' + draftId);
  return rep;
}

// ============================================================================
//  STATO (per il pannello UI) + SETUP
// ============================================================================
function redazionaleStato(token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) return { ok: false, error: 'forbidden' };
  var props = PropertiesService.getScriptProperties();
  var week = _redWeek_();
  var draftId = props.getProperty(RED_PROP_DRAFT) || '';
  var draft = draftId ? _loadDraft_(draftId) : null;
  var ed = null;
  try { ed = (typeof getEditoriale === 'function') ? getEditoriale({}) : null; } catch (_) {}
  return {
    ok: true, settimana: week,
    draft: draft ? { id: draft.id, stato: draft.stato, soggetto: draft.soggetto,
      counts: { bandiUrgenti: (draft.bandiUrgenti||[]).length, bandiRecenti: (draft.bandiRecenti||[]).length, news: (draft.news||[]).length, podcast: (draft.podcast||[]).length } } : null,
    editoriale: ed && ed.ok !== false ? { titolo: (ed.titolo||''), stato: (ed.stato||'') } : null,
    richiestaInviata: !!props.getProperty(RED_PROP_SENT + week)
  };
}

/**
 * SETUP one-shot: rimuove i vecchi trigger standalone ora superati
 * (editorialeGenera domenica 18 + weeklyNewsletterAuthRequest lunedì 9).
 * Il nuovo flusso gira nel CronDispatcher (ven 18 + lun 10) — nessun nuovo trigger.
 */
function redazionaleSetup() {
  var rimossi = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'editorialeGenera' || fn === 'weeklyNewsletterAuthRequest') {
      ScriptApp.deleteTrigger(t); rimossi.push(fn);
    }
  });
  Logger.log('redazionaleSetup: rimossi trigger obsoleti: ' + (rimossi.join(', ') || 'nessuno') +
    ' — il flusso gira nel dispatcher (ven 18:00 creazione, lun 10:00 richiesta invio).');
  return { ok: true, rimossi: rimossi };
}
