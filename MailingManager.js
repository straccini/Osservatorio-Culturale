// ============================================================================
// MailingManager.js — Mailing list CRUD
// v4.22 — Extracted from Codice.js (file-organization refactor)
//
// Functions: getMailingList, getMailingListSummary, saveMailing, deleteMailing,
//   toggleMailingField, _sendConfirmationEmail, _handleConfirmNewsletter,
//   getDigestLog
//
// Dependencies (global): getMainSS, SH, _sheetToObjects, _deleteRowById,
//   _toggleField, formatDate, _autoRegisterUser_, escTok_
// ============================================================================

// v4.23 — Dati grezzi mailing list. INTERNA (nessun gate): usata da doPost (già gated)
// e da authenticate(). Non esporre direttamente al frontend.
function _getMailingListData_() {
  var list = _sheetToObjects(SH.MAILING);
  list.forEach(function(m) {
    if (m.DataIscrizione instanceof Date) m.DataIscrizione = formatDate(m.DataIscrizione);
  });
  return {list: list};
}

// v4.23 SICUREZZA — Wrapper pubblico (google.script.run): SOLO editor/admin.
// Prima un anonimo poteva scaricare tutte le email iscritte. Ora serve token.
function getMailingList(token) {
  if (!_requireAdminGSR_(token || null)) return { error: 'forbidden', list: [] };
  return _getMailingListData_();
}

/** v4.20 — Riepilogo lettori registrati per pagina Compilatori e lettori */
function getMailingListSummary(token) {
  try {
    if (!_requireAdminGSR_(token || null)) return { ok:false, error:'forbidden' }; // v4.23 SEC: era PII esposta a anonimi
    var sh = getMainSS().getSheetByName(SH.MAILING);
    if (!sh || sh.getLastRow() < 2) return { ok:true, destinatari:[] };
    var data = sh.getDataRange().getValues();
    var head = data[0].map(function(h){ return String(h||'').trim(); });
    var iEmail = head.indexOf('Email'), iNome = head.indexOf('Nome'), iAttivo = head.indexOf('Attivo');
    if (iEmail < 0) return { ok:true, destinatari:[] };
    var list = [];
    for (var r = 1; r < data.length; r++) {
      var email = String(data[r][iEmail] || '').trim();
      if (!email) continue;
      list.push({ email: email, nome: (iNome >= 0 ? String(data[r][iNome]||'') : ''), stato: (iAttivo >= 0 && data[r][iAttivo] === true) ? 'attivo' : 'inattivo' });
    }
    return { ok:true, destinatari:list };
  } catch(e) { return { ok:false, error: e.message }; }
}

function saveMailing(body) {
  var email = String(body.email || body.Email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return {error: 'Email non valida'};
  // GDPR: consenso obbligatorio per nuove iscrizioni
  if (!body.id && !body.ConsensoGDPR) return {error: 'Consenso GDPR obbligatorio'};

  var sh = getMainSS().getSheetByName(SH.MAILING);
  var rows = sh.getDataRange().getValues(), h = rows[0];

  // Ensure GDPR columns exist
  var gdprCols = ['ConsensoGDPR','TimestampConsenso','Sorgente','Stato'];
  var lastCol = h.length;
  gdprCols.forEach(function(col) {
    if (h.indexOf(col) < 0) {
      lastCol++;
      sh.getRange(1, lastCol).setValue(col);
      h.push(col);
    }
  });

  // Update existing
  if (body.id) {
    var idCol = h.indexOf('ID');
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][idCol] === body.id) {
        sh.getRange(i+1, 1, 1, h.length).setValues([[body.id, body.nome||'', email, body.ruolo||'lettore', body.attivo!==false, rows[i][h.indexOf('DataIscrizione')],
          rows[i][h.indexOf('Token')]||'', rows[i][h.indexOf('TokenExpiry')]||'', rows[i][h.indexOf('DigestIds')]||'',
          body.ConsensoGDPR||rows[i][h.indexOf('ConsensoGDPR')]||false,
          body.TimestampConsenso||rows[i][h.indexOf('TimestampConsenso')]||'',
          body.Sorgente||rows[i][h.indexOf('Sorgente')]||'',
          body.Stato||rows[i][h.indexOf('Stato')]||'confermato'
        ]]);
        return {ok:true};
      }
    }
  }

  // Check duplicate email
  var emailCol = h.indexOf('Email');
  for (var j = 1; j < rows.length; j++) {
    if (String(rows[j][emailCol]||'').toLowerCase().trim() === email) {
      return {ok:true, id: rows[j][h.indexOf('ID')], existing: true};
    }
  }

  // New subscriber
  var id = 'M' + Date.now();
  var newRow = [id, body.nome||'', email, body.ruolo||'lettore', true, new Date()];
  // Pad for Token, TokenExpiry, DigestIds (may already exist)
  while (newRow.length < h.indexOf('ConsensoGDPR')) newRow.push('');
  // GDPR fields
  var iGdpr = h.indexOf('ConsensoGDPR');
  while (newRow.length < iGdpr) newRow.push('');
  newRow[iGdpr] = true;
  newRow[h.indexOf('TimestampConsenso')] = new Date().toISOString();
  newRow[h.indexOf('Sorgente')] = body.Sorgente || 'modal';
  newRow[h.indexOf('Stato')] = 'pending'; // double opt-in: starts as pending

  sh.appendRow(newRow);

  // Send confirmation email (double opt-in)
  try { _sendConfirmationEmail(email, id); } catch(e) { Logger.log('Confirm email err: ' + e.message); }

  // Auto-register as lettore (self-service upgrade from ospite)
  try { _autoRegisterUser_(email, body.nome || body.Nome || '', 'newsletter'); } catch(e) { Logger.log('Auto-register err: ' + e.message); }

  return {ok:true, id:id, pendingConfirmation:true};
}

function _sendConfirmationEmail(email, mailingId) {
  var baseUrl = ScriptApp.getService().getUrl();
  var secret = PropertiesService.getScriptProperties().getProperty('OC_UNSUB_SECRET') || 'sinopia2026';
  var raw = email + ':confirmNl:' + secret;
  var sig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  var confirmUrl = baseUrl + '?action=confirmNl&e=' + encodeURIComponent(email) + '&s=' + sig;

  var html = '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:20px">'
    + '<div style="font-size:22px;font-weight:600;margin-bottom:12px">Conferma la tua iscrizione</div>'
    + '<p style="color:#555;line-height:1.6">Hai richiesto di ricevere la newsletter settimanale di <b>Sinopia - Osservatorio Culturale</b>.</p>'
    + '<p style="color:#555;line-height:1.6">Clicca il bottone per confermare:</p>'
    + '<a href="' + confirmUrl + '" style="display:inline-block;background:#935851;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Confermo la mia iscrizione</a>'
    + '<p style="font-size:12px;color:#999;margin-top:24px">Se non hai richiesto questa iscrizione, ignora questa email.</p>'
    + '</body></html>';

  MailApp.sendEmail({
    to: email,
    subject: 'Conferma iscrizione newsletter · Sinopia',
    htmlBody: html,
    name: 'Sinopia · Osservatorio Culturale'
  });
}

function deleteMailing(id) {
  return _deleteRowById(getMainSS().getSheetByName(SH.MAILING), id);
}

// v5.1.0 — Conferma newsletter double opt-in
function _handleConfirmNewsletter(params) {
  var email = decodeURIComponent(params.e || '').trim().toLowerCase();
  var sig = params.s || '';
  if (!email || !sig) return '<h1>Link non valido</h1>';

  // Verify HMAC
  var secret = PropertiesService.getScriptProperties().getProperty('OC_UNSUB_SECRET') || 'sinopia2026';
  var raw = email + ':confirmNl:' + secret;
  var expected = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)
    .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  if (sig !== expected) return '<h1>Link non valido</h1><p>La firma non corrisponde. Richiedi una nuova iscrizione.</p>';

  // Find subscriber and update Stato
  var sh = getMainSS().getSheetByName(SH.MAILING);
  if (!sh) return '<h1>Errore</h1><p>Foglio mailing non trovato.</p>';
  var rows = sh.getDataRange().getValues(), h = rows[0];
  var emailCol = h.indexOf('Email'), statoCol = h.indexOf('Stato');
  if (emailCol < 0 || statoCol < 0) return '<h1>Errore</h1><p>Colonne mancanti.</p>';

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][emailCol] || '').toLowerCase().trim() === email) {
      sh.getRange(i + 1, statoCol + 1).setValue('confermato');
      return '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:20px;text-align:center">'
        + '<div style="font-size:48px;margin-bottom:16px">&#10003;</div>'
        + '<h1 style="font-size:24px;color:#1a1a1a">Iscrizione confermata!</h1>'
        + '<p style="color:#555;line-height:1.6">Riceverai la newsletter settimanale di <b>Sinopia</b> con bandi, news e opportunita selezionate per il settore culturale.</p>'
        + '<a href="' + ScriptApp.getService().getUrl() + '" style="display:inline-block;margin-top:20px;background:#935851;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Vai all\'Osservatorio</a>'
        + '</body></html>';
    }
  }
  return '<h1>Email non trovata</h1><p>Nessuna iscrizione in attesa per questo indirizzo.</p>';
}

function toggleMailingField(id,field) {
  return _toggleField(getMainSS().getSheetByName(SH.MAILING),id,field);
}

function getDigestLog() {
  var log = _sheetToObjects(SH.LOG);
  log.forEach(function(entry) {
    ['DataInvio','Data','data','Timestamp','timestamp'].forEach(function(k){
      if (entry[k] instanceof Date) entry[k] = formatDate(entry[k]);
    });
  });
  log.reverse();
  return {log: log};
}
