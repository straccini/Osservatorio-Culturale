// ============================================================================
//  Unsubscribe_v1.gs — Sistema cancellazione iscrizione digest/newsletter
//  v4.18.54 (2026-05-16)
//
//  Flusso:
//    1. Email digest contiene link footer "Se non vuoi più ricevere ... clicca qui"
//    2. Click → ?action=unsubscribe&e=<email>&s=<hmac>
//    3. doGet (Codice.gs) intercetta, chiama _handleUnsubscribe_
//    4. Si valida HMAC, si disattiva in MailingList + Sessioni_v1, si invia email conferma
//    5. Si mostra pagina HTML conferma brandizzata Sinopia
//
//  Sicurezza:
//    - HMAC SHA-256 con secret in ScriptProperties (no DB lookup necessario)
//    - URL = email + signature → impossibile disiscrivere altri senza accesso al secret
//    - Secret rigenerato 1 volta in setup (poi resta stabile)
//
//  Autore: Claude (Cowork) per Silvano Straccini / Sinopia
// ============================================================================

// ============================================================================
// 1. HELPER — Secret + signing
// ============================================================================

/**
 * Ritorna il secret HMAC, generandolo al primo uso se non esiste.
 * Salvato in ScriptProperties come OC_UNSUB_SECRET.
 */
function _unsubSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('OC_UNSUB_SECRET');
  if (!secret) {
    // Genera 32 byte random base64
    var bytes = [];
    for (var i = 0; i < 32; i++) bytes.push(Math.floor(Math.random() * 256));
    secret = Utilities.base64Encode(bytes);
    props.setProperty('OC_UNSUB_SECRET', secret);
    Logger.log('Unsubscribe: generato nuovo secret OC_UNSUB_SECRET');
  }
  return secret;
}

/**
 * Firma HMAC-SHA256 della email, base64 url-safe (senza padding).
 * Output: stringa ~43 char.
 */
function _unsubSig_(email) {
  var em = String(email || '').trim().toLowerCase();
  var raw = Utilities.computeHmacSha256Signature(em, _unsubSecret_());
  // base64 url-safe
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}

/**
 * Genera l'URL completo di unsubscribe per una email.
 * Usa OC_APP_PUBLIC_URL se presente (sinopia.netlify.app),
 * altrimenti fallback su ScriptApp.getService().getUrl().
 */
function _buildUnsubscribeUrl_(email) {
  var em = String(email || '').trim().toLowerCase();
  if (!em) return '#';
  var base = '';
  try {
    base = PropertiesService.getScriptProperties().getProperty('OC_APP_PUBLIC_URL') || '';
  } catch(_){}
  if (!base) {
    try { base = ScriptApp.getService().getUrl() || ''; } catch(_){}
  }
  if (!base) return '#';
  var sep = (base.indexOf('?') >= 0) ? '&' : '?';
  return base + sep + 'action=unsubscribe&e=' + encodeURIComponent(em) + '&s=' + _unsubSig_(em);
}

// ============================================================================
// 2. HANDLER PRINCIPALE — chiamato da doGet
// ============================================================================

/**
 * Gestisce il click sul link unsubscribe.
 * @param {Object} params = e.parameter di doGet
 * @return {string} HTML della pagina di conferma (da wrappare in HtmlService)
 */
function _handleUnsubscribe_(params) {
  try {
    var email = String((params && params.e) || '').trim().toLowerCase();
    var sig   = String((params && params.s) || '').trim();
    if (!email || !sig) {
      return _renderUnsubscribePage_('', false, 'Link non valido (parametri mancanti).');
    }
    // Validazione signature (constant-time best-effort)
    var expected = _unsubSig_(email);
    if (sig !== expected) {
      return _renderUnsubscribePage_(email, false, 'Link non valido o scaduto.');
    }

    // Esegui disiscrizione
    var result = unsubscribeUser(email, sig);
    if (!result.ok) {
      return _renderUnsubscribePage_(email, false, result.error || 'Errore disiscrizione.');
    }

    // Invia email di conferma (best-effort)
    try { _sendUnsubscribeConfirmEmail_(email); } catch(eMail) {
      Logger.log('Errore invio email conferma unsub: ' + eMail.message);
    }

    return _renderUnsubscribePage_(email, true, null, result);
  } catch(e) {
    Logger.log('_handleUnsubscribe_ ERRORE: ' + (e && e.message));
    return _renderUnsubscribePage_('', false, 'Errore interno: ' + (e && e.message ? e.message : 'unknown'));
  }
}

// ============================================================================
// 3. BACKEND — Disattiva utente nei fogli rilevanti
// ============================================================================

/**
 * Disattiva l'email da:
 *   - MailingList.Attivo = false (se presente)
 *   - Sessioni_v1.revoked = true (se presente)
 *   - Log in UnsubscribeLog (audit)
 *
 * Idempotente: rieseguibile senza side effects.
 *
 * @param {string} email
 * @param {string} sig — firma HMAC (gia validata dal caller, qui solo per audit log)
 * @return {Object} { ok, email, disattivati: { mailing, sessioni } }
 */
function unsubscribeUser(email, sig) {
  try {
    var em = String(email || '').trim().toLowerCase();
    if (!em) return { ok:false, error:'email_mancante' };

    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var report = { mailing: 0, sessioni: 0 };

    // --- A) MailingList ---
    try {
      var shM = ss.getSheetByName(typeof SH !== 'undefined' && SH && SH.MAILING ? SH.MAILING : 'MailingList');
      if (shM && shM.getLastRow() > 1) {
        var vM = shM.getDataRange().getValues();
        var hM = vM[0];
        var iEm = hM.indexOf('Email');
        var iAt = hM.indexOf('Attivo');
        if (iEm >= 0 && iAt >= 0) {
          for (var r = 1; r < vM.length; r++) {
            var rowEm = String(vM[r][iEm] || '').trim().toLowerCase();
            if (rowEm === em && vM[r][iAt] !== false) {
              shM.getRange(r + 1, iAt + 1).setValue(false);
              report.mailing++;
            }
          }
        }
      }
    } catch(eM) { Logger.log('unsubscribeUser MailingList ERR: ' + eM.message); }

    // --- B) Sessioni_v1 ---
    try {
      var shS = ss.getSheetByName('Sessioni_v1');
      if (shS && shS.getLastRow() > 1) {
        var vS = shS.getDataRange().getValues();
        var hS = vS[0];
        var iEmS = hS.indexOf('email');
        var iRev = hS.indexOf('revoked');
        if (iEmS >= 0 && iRev >= 0) {
          for (var rs = 1; rs < vS.length; rs++) {
            var rowEmS = String(vS[rs][iEmS] || '').trim().toLowerCase();
            if (rowEmS === em && vS[rs][iRev] !== true) {
              shS.getRange(rs + 1, iRev + 1).setValue(true);
              report.sessioni++;
            }
          }
        }
      }
    } catch(eS) { Logger.log('unsubscribeUser Sessioni_v1 ERR: ' + eS.message); }

    // --- C) Audit log ---
    try { _appendUnsubscribeLog_(em, sig, report); } catch(_){}

    return { ok:true, email: em, disattivati: report };
  } catch(e) {
    Logger.log('unsubscribeUser ERRORE: ' + (e && e.message));
    return { ok:false, error: (e && e.message) || String(e) };
  }
}

/**
 * Append log su foglio UnsubscribeLog (creato on-the-fly se non esiste).
 */
function _appendUnsubscribeLog_(email, sig, report) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('UnsubscribeLog');
  if (!sh) {
    sh = ss.insertSheet('UnsubscribeLog');
    sh.getRange(1, 1, 1, 5).setValues([['Timestamp','Email','SigSnippet','MailingDisattivate','SessioniRevocate']])
      .setFontWeight('bold').setBackground('#1A1815').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  sh.appendRow([
    new Date(),
    email,
    String(sig || '').substring(0, 12) + '…',
    (report && report.mailing) || 0,
    (report && report.sessioni) || 0
  ]);
}

// ============================================================================
// 4. PAGINA HTML CONFERMA — brandizzata Sinopia
// ============================================================================

/**
 * Genera la pagina HTML mostrata all'utente dopo il click sul link.
 *
 * @param {string} email
 * @param {boolean} success
 * @param {string|null} errorMsg
 * @param {Object} [details] — { disattivati: {mailing, sessioni} } in caso success
 * @return {string} HTML completo
 */
function _renderUnsubscribePage_(email, success, errorMsg, details) {
  var emEsc = _h_unsub_(email || '');
  var bodyHtml;
  if (success) {
    var details2 = details && details.disattivati ? details.disattivati : { mailing:0, sessioni:0 };
    var detailRow = '';
    if ((details2.mailing || 0) + (details2.sessioni || 0) === 0) {
      detailRow = '<p style="font-size:13px;color:#8B5E2B;margin:14px 0 0;font-style:italic">'
        + 'Risultavi già disiscritto/a. Nessuna ulteriore azione necessaria.'
        + '</p>';
    }
    bodyHtml = ''
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:38px;color:#8B3A1F;text-align:center;margin:0 0 6px">Sinopia</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:.20em;text-transform:uppercase;color:#5C4332;text-align:center;margin:0 0 32px">Osservatorio Culturale</div>'
      + '<h1 style="font-family:Georgia,serif;font-size:24px;font-weight:500;color:#3A2818;line-height:1.3;margin:0 0 16px">Disiscrizione confermata</h1>'
      + '<p style="font-size:15px;line-height:1.6;color:#3A2818;margin:0 0 14px">L\'indirizzo <b>' + emEsc + '</b> è stato rimosso dalla lista di invio.</p>'
      + '<p style="font-size:14px;line-height:1.6;color:#5C4332;margin:0 0 22px">Non riceverai più digest settimanali, alert bandi e altre comunicazioni dall\'Osservatorio Sinopia. Ti abbiamo inviato una email di conferma.</p>'
      + detailRow
      + '<div style="background:#F5F0E1;border-left:3px solid #B8902A;padding:14px 16px;border-radius:6px;font-size:13px;line-height:1.6;color:#6B5418;margin:24px 0">'
      + '<b>Hai cambiato idea?</b><br>Puoi reiscriverti in qualsiasi momento dalla home di Sinopia o richiedendo una consulenza gratuita.'
      + '</div>'
      + '<div style="text-align:center;margin:32px 0 0">'
      + '<a href="https://sinopia.netlify.app" style="display:inline-block;background:#8B3A1F;color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;font-weight:600">Torna a Sinopia &rarr;</a>'
      + '</div>';
  } else {
    bodyHtml = ''
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:38px;color:#8B3A1F;text-align:center;margin:0 0 6px">Sinopia</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:.20em;text-transform:uppercase;color:#5C4332;text-align:center;margin:0 0 32px">Osservatorio Culturale</div>'
      + '<h1 style="font-family:Georgia,serif;font-size:24px;font-weight:500;color:#A32D2D;line-height:1.3;margin:0 0 16px">Non è stato possibile completare la cancellazione</h1>'
      + '<p style="font-size:15px;line-height:1.6;color:#3A2818;margin:0 0 14px">' + _h_unsub_(errorMsg || 'Errore non specificato') + '</p>'
      + '<p style="font-size:13px;line-height:1.6;color:#5C4332;margin:0 0 22px">Se il problema persiste, scrivi una email a <a href="mailto:s.straccini@gmail.com?subject=Disiscrizione%20Sinopia&body=Vorrei%20disiscrivermi%20dalla%20newsletter%20Sinopia" style="color:#8B3A1F">s.straccini@gmail.com</a> con oggetto "RIMUOVI" e ti rimuoveremo manualmente entro 48h.</p>'
      + '<div style="text-align:center;margin:32px 0 0">'
      + '<a href="https://sinopia.netlify.app" style="display:inline-block;background:#5C4332;color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;font-weight:600">Torna a Sinopia</a>'
      + '</div>';
  }

  return ''
    + '<!doctype html><html lang="it"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + (success ? 'Disiscrizione confermata' : 'Errore disiscrizione') + ' · Sinopia</title>'
    + '<style>body{margin:0;padding:0;background:#F1E6D6;font-family:Georgia,serif;color:#3A2818}'
    + '.wrap{max-width:560px;margin:48px auto;padding:0 20px}'
    + '.card{background:#FFFFFF;border:1px solid #D4BFA0;border-radius:14px;padding:42px 36px;box-shadow:0 4px 14px rgba(58,40,24,.05)}'
    + '@media(max-width:600px){.wrap{margin:24px auto}.card{padding:28px 22px}}'
    + '</style></head>'
    + '<body><div class="wrap"><div class="card">' + bodyHtml + '</div>'
    + '<p style="text-align:center;font-size:11px;color:#8B5E2B;margin:24px 0 0;font-style:italic">Sinopia · Osservatorio Culturale · Il disegno preparatorio della cultura italiana</p>'
    + '</div></body></html>';
}

function _h_unsub_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================================
// 5. EMAIL CONFERMA AUTOMATICA
// ============================================================================

/**
 * Invia all'utente disiscritto una email di conferma.
 * Tono cortese, link reiscrizione, no CTA aggressive.
 */
function _sendUnsubscribeConfirmEmail_(email) {
  var em = String(email || '').trim().toLowerCase();
  if (!em) return;

  var appUrl = '';
  try { appUrl = PropertiesService.getScriptProperties().getProperty('OC_APP_PUBLIC_URL') || ScriptApp.getService().getUrl() || 'https://sinopia.netlify.app'; } catch(_){}

  var html = ''
    + '<!doctype html><html><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:0;background:#F1E6D6;font-family:Georgia,serif;color:#3A2818">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1E6D6;padding:32px 0">'
    + '<tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #D4BFA0;border-radius:12px;overflow:hidden">'
    // Header
    + '<tr><td style="background:#F1E6D6;border-bottom:1px solid #D4BFA0;padding:24px 28px">'
    + '<div style="font-family:Georgia,serif;font-style:italic;font-size:28px;font-weight:500;color:#8B3A1F">Sinopia</div>'
    + '<div style="font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#5C4332;margin-top:4px">Osservatorio Culturale</div>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:32px 28px">'
    + '<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;line-height:1.3;color:#3A2818;margin:0 0 16px">La tua disiscrizione è confermata</h1>'
    + '<p style="font-size:14px;line-height:1.65;color:#3A2818;margin:0 0 14px">Ti confermiamo che <b>' + _h_unsub_(em) + '</b> è stato rimosso dalle nostre liste di invio.</p>'
    + '<p style="font-size:14px;line-height:1.65;color:#5C4332;margin:0 0 22px">Non riceverai più:</p>'
    + '<ul style="font-size:13.5px;line-height:1.7;color:#5C4332;margin:0 0 22px;padding-left:20px">'
    + '<li>Il digest settimanale con news, bandi e podcast culturali</li>'
    + '<li>Gli alert sui bandi in scadenza nei prossimi giorni</li>'
    + '<li>Eventuali comunicazioni promozionali</li>'
    + '</ul>'
    + '<div style="background:#F5F0E1;border-left:3px solid #B8902A;padding:14px 18px;border-radius:6px;margin:0 0 24px">'
    + '<p style="font-size:13.5px;line-height:1.6;color:#6B5418;margin:0 0 6px"><b>Hai cambiato idea?</b></p>'
    + '<p style="font-size:13px;line-height:1.6;color:#6B5418;margin:0">Puoi reiscriverti in qualsiasi momento dalla home di Sinopia o richiedendo una consulenza gratuita: <a href="' + _h_unsub_(appUrl) + '" style="color:#8B3A1F;font-weight:600">' + _h_unsub_(appUrl) + '</a></p>'
    + '</div>'
    + '<p style="font-size:13px;line-height:1.6;color:#5C4332;margin:0">Grazie per averci dato fiducia.<br>Per qualsiasi domanda, scrivici a <a href="mailto:s.straccini@gmail.com" style="color:#8B3A1F">s.straccini@gmail.com</a>.</p>'
    + '<p style="font-size:13px;line-height:1.6;color:#3A2818;margin:18px 0 0;font-style:italic">Silvano Straccini<br>Sinopia · Osservatorio Culturale</p>'
    + '</td></tr>'
    // Footer
    + '<tr><td style="background:#F1E6D6;padding:14px 28px;border-top:1px solid #D4BFA0;text-align:center">'
    + '<div style="font-family:Arial,sans-serif;font-size:11px;color:#8B5E2B">Sinopia · Osservatorio Culturale · Il disegno preparatorio della cultura italiana</div>'
    + '<div style="font-family:Arial,sans-serif;font-size:10px;color:#A78A65;margin-top:4px">Questa è una email di conferma automatica, non rispondere.</div>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';

  MailApp.sendEmail({
    to: em,
    subject: 'Sinopia · Disiscrizione confermata',
    htmlBody: html,
    name: 'Sinopia · Osservatorio Culturale'
  });

  Logger.log('Email conferma unsub inviata a: ' + em);
}

// ============================================================================
// 6. HELPER PER FOOTER DIGEST — usato dai builder dei 3 layout
// ============================================================================

/**
 * Ritorna l'HTML del footer "unsubscribe" da incorporare nei digest.
 * Stile editoriale Sinopia (testo piccolo, colore desaturato, link discreto).
 *
 * @param {string} email
 * @param {Object} [opts] { style: 'standard' | 'tematic' | 'matrix' }
 * @return {string} HTML del footer
 */
function _digestUnsubFooter_(email, opts) {
  opts = opts || {};
  var url = _buildUnsubscribeUrl_(email);
  var style = opts.style || 'standard';

  if (style === 'tematic') {
    // Stile coerente col tematico (palette terra)
    return ''
      + '<p style="font-size:10.5px;color:#8B5E2B;line-height:1.5;margin:18px 0 0;padding-top:12px;border-top:1px solid #E5E1D8;text-align:center">'
      + 'Se non vuoi più ricevere comunicazioni da questa newsletter, '
      + '<a href="' + _h_unsub_(url) + '" style="color:#8B3A1F;text-decoration:underline">clicca qui per disiscriverti</a>.'
      + '</p>';
  }

  if (style === 'matrix') {
    // Stile coerente con il digest matrix-personalizzato (tono editoriale neutro)
    return ''
      + '<p style="margin:14px 0 0;font-size:11px;line-height:1.5;color:#8A8A8E;">'
      + 'Se non vuoi più ricevere comunicazioni da questa newsletter, '
      + '<a href="' + _h_unsub_(url) + '" style="color:#0E7490;text-decoration:underline">clicca qui per disiscriverti</a>.'
      + '</p>';
  }

  // standard (digest generico)
  return ''
    + '<div style="padding:18px 36px 28px;font-size:11px;color:#888;text-align:center;line-height:1.5">'
    + 'Se non vuoi più ricevere comunicazioni da questa newsletter, '
    + '<a href="' + _h_unsub_(url) + '" style="color:#bbb;text-decoration:underline">clicca qui per disiscriverti</a>.'
    + '</div>';
}

// ============================================================================
// 7. SETUP ONE-SHOT — admin only
// ============================================================================

/**
 * Inizializza il secret HMAC (idempotente — se già esiste, lo lascia).
 * Da chiamare 1 volta dall'editor GAS post-deploy.
 */
function setupUnsubscribeSecret() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  var secret = _unsubSecret_(); // genera se mancante
  return {
    ok: true,
    secretLength: secret.length,
    message: 'OC_UNSUB_SECRET attivo (' + secret.length + ' char base64).'
  };
}

/**
 * Test rapido — genera URL unsubscribe per email admin e mostra anche conferma signature.
 * Da chiamare dall'editor GAS per ispezionare l'URL prima di pubblicare.
 */
function testUnsubscribeUrl() {
  var adminEmail = '';
  try {
    adminEmail = String(PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || '').split(',')[0].trim().toLowerCase();
  } catch(_){}
  if (!adminEmail) adminEmail = 's.straccini@gmail.com';
  return {
    email: adminEmail,
    url: _buildUnsubscribeUrl_(adminEmail),
    sig: _unsubSig_(adminEmail),
    note: 'Copia URL e prova a cliccarlo in browser per testare il flusso completo.'
  };
}

// ============================================================================
// FINE Unsubscribe_v1.gs
// ============================================================================
