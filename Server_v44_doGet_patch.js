/**
 * ================================================================
 * OSSERVATORIO CULTURALE — Server_v44_doGet_patch.gs  (v4.4)
 * ----------------------------------------------------------------
 * Handler aggiuntivo per il flow di approvazione newsletter via link.
 *
 * Non sostituisce doGet() esistente: aggiunge una funzione
 * _renderApproveNewsletter_(e) che deve essere invocata da doGet()
 * all'inizio, prima del rendering Home.
 *
 * ISTRUZIONI DI INNESTO (da applicare al doGet esistente in Server_v42_ALL.gs):
 * ----------------------------------------------------------------
 * All'inizio della funzione doGet(e), subito dopo var params = e && e.parameter || {};
 * aggiungere questo blocco:
 *
 *    if (params.approveNl && params.t) {
 *      var html = _renderApproveNewsletterPage_(params.approveNl, params.t);
 *      return HtmlService.createHtmlOutput(html)
 *        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
 *        .setTitle('Approvazione invio — Osservatorio Culturale');
 *    }
 *
 * ================================================================
 */

/**
 * Genera la pagina di conferma approvazione quando si apre il link
 * arrivato via Telegram. L'utente deve essere admin e il token deve
 * corrispondere a quello della bozza.
 */
function _renderApproveNewsletterPage_(draftId, token) {
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch(e) { email = ''; }

  var css = 'body{font-family:Inter,system-ui,sans-serif;background:#F4F4F6;margin:0;padding:40px 20px;color:#1D1D1F;}' +
            '.card{max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.06);}' +
            'h1{font-size:20px;margin:0 0 8px;}' +
            'p{font-size:14px;line-height:1.55;color:#3A3A3C;margin:8px 0;}' +
            '.btn{display:inline-block;padding:12px 24px;border-radius:8px;background:#1D1D1F;color:#fff;text-decoration:none;font-weight:600;font-size:14px;margin-top:16px;}' +
            '.btn.danger{background:#C0392B;}' +
            '.box{background:#F7F7F9;padding:12px 14px;border-radius:8px;font-size:13px;color:#5A5A5E;margin:12px 0;}' +
            '.err{background:#FBECEC;color:#8B1E1E;padding:12px 14px;border-radius:8px;}' +
            '.ok{background:#E8F5EE;color:#1B7A3E;padding:12px 14px;border-radius:8px;}' +
            '.meta{font-size:12px;color:#8A8A8E;margin-top:14px;}';

  // Verifica admin
  var admins;
  try { admins = _getAdminSet_(); } catch(e) { admins = { 's.straccini@gmail.com': true }; }
  var isAdmin = email && (admins[email.toLowerCase()] === true);

  if (!email) {
    return _approvePage_(css,
      '<h1>Accesso richiesto</h1>' +
      '<p>Per autorizzare l\'invio della newsletter devi essere connesso con un account Google amministratore.</p>');
  }
  if (!isAdmin) {
    return _approvePage_(css,
      '<h1>Permesso negato</h1>' +
      '<div class="err">L\'utente <b>' + _hEsc_(email) + '</b> non è amministratore dell\'Osservatorio Culturale.</div>');
  }

  // Carica draft
  var draft = null;
  try {
    var json = PropertiesService.getScriptProperties().getProperty('OC_NL_DRAFT_' + draftId);
    if (json) draft = JSON.parse(json);
  } catch(e) {}
  if (!draft) {
    return _approvePage_(css,
      '<h1>Bozza non trovata</h1>' +
      '<div class="err">La bozza <code>' + _hEsc_(draftId) + '</code> non esiste o è scaduta.</div>');
  }
  if (!draft.authToken || draft.authToken !== token) {
    return _approvePage_(css,
      '<h1>Token non valido</h1>' +
      '<div class="err">Il link di approvazione non è valido o è già stato usato.</div>');
  }
  if (draft.stato === 'inviato') {
    return _approvePage_(css,
      '<h1>Già inviata</h1>' +
      '<div class="ok">Questa newsletter è già stata inviata a ' + (draft.sentTo||0) + ' destinatari.</div>');
  }

  // Pagina di conferma: richiede click per confermare (evita invio per preview)
  var cnf = (draft.bandiUrgenti||[]).length + (draft.bandiRecenti||[]).length;
  var body =
    '<h1>Autorizza invio newsletter</h1>' +
    '<div class="box">' +
      '<b>Soggetto:</b> ' + _hEsc_(draft.soggetto||'') + '<br>' +
      '<b>ID bozza:</b> <code>' + _hEsc_(draft.id||'') + '</code><br>' +
      '<b>Contenuti:</b> ' + cnf + ' bandi · ' +
        ((draft.news||[]).length) + ' news · ' +
        ((draft.podcast||[]).length) + ' podcast' +
    '</div>' +
    '<p>Stai per autorizzare l\'invio della newsletter a tutti gli iscritti attivi della MailingList.</p>' +
    '<p class="meta">Richiesto da: ' + _hEsc_(draft.autore||'—') + ' · Approvato da: ' + _hEsc_(email) + '</p>' +
    '<form method="get" action="">' +
      '<input type="hidden" name="approveNl" value="' + _hEsc_(draftId) + '">' +
      '<input type="hidden" name="t" value="' + _hEsc_(token) + '">' +
      '<input type="hidden" name="confirm" value="1">' +
      '<button type="submit" class="btn">✉️ Invia adesso</button>' +
    '</form>';

  // Se confirm=1, esegui invio
  var e = { parameter: { approveNl: draftId, t: token, confirm: '' } };
  // NB: il parametro confirm viene letto dal chiamante; qui fungiamo solo da renderer.
  return _approvePage_(css, body);
}

/**
 * Esegue l'invio quando l'admin ha cliccato "Invia adesso" (confirm=1).
 * Richiamata da doGet() quando params.approveNl && params.t && params.confirm.
 */
function _executeApproveNewsletter_(draftId, token) {
  var css = 'body{font-family:Inter,system-ui,sans-serif;background:#F4F4F6;margin:0;padding:40px 20px;color:#1D1D1F;}' +
            '.card{max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.06);}' +
            'h1{font-size:20px;margin:0 0 8px;}' +
            '.ok{background:#E8F5EE;color:#1B7A3E;padding:12px 14px;border-radius:8px;font-size:14px;}' +
            '.err{background:#FBECEC;color:#8B1E1E;padding:12px 14px;border-radius:8px;font-size:14px;}';

  var res = adminConfirmSendWithToken(draftId, token);
  if (!res || !res.ok) {
    return _approvePage_(css,
      '<h1>Errore invio</h1>' +
      '<div class="err">' + _hEsc_(res && res.error || 'errore_sconosciuto') + '</div>');
  }
  var msg = 'Newsletter inviata con successo a <b>' + (res.sent||0) + '</b> destinatari.';
  if (res.errors && res.errors.length) {
    msg += ' (' + res.errors.length + ' errori — vedi log)';
  }
  return _approvePage_(css, '<h1>Invio completato</h1><div class="ok">' + msg + '</div>');
}

function _approvePage_(css, inner) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head>' +
         '<body><div class="card">' + inner + '</div></body></html>';
}

function _hEsc_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}