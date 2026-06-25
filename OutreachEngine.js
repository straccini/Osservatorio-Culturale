// ============================================================================
// OutreachEngine.js — Motore sequenze temporizzate per outreach
// v4.20 (2026-06-05)
// Gestisce: cold mail, follow-up 14gg, welcome post-registrazione,
// stati lead unificati, cruscotto coorte mensile.
// ============================================================================

var OE_SHEET_NAME = 'OutreachSequence';
var OE_STEP_INTERVAL_DAYS = 14;
var OE_MAX_STEPS = 3;

// ============================================================================
// SETUP
// ============================================================================

function setupOutreachSheet() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok: false, error: 'forbidden' };
  }
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OE_SHEET_NAME);
  if (sh) return { ok: true, action: 'exists', rows: sh.getLastRow() - 1 };
  sh = ss.insertSheet(OE_SHEET_NAME);
  sh.appendRow(['Email','MuseoNome','Step','UltimoContatto','ProssimaAzione','Stato','Sorgente','Note','CreatedAt']);
  sh.setFrozenRows(1);
  return { ok: true, action: 'created' };
}

// ============================================================================
// LEAD UNIFICATO
// ============================================================================

/**
 * Fonde i 3 stati (Utenti + CRM_Leads + MuseiDB_v1) in un unico profilo lead.
 * @param {string} email
 * @return {Object} { email, nome, ruolo, stato, crmScore, matrixDone, prenotazione, outreachStep, ... }
 */
function getLeadUnificato(email) {
  if (!email) return null;
  email = String(email).toLowerCase().trim();
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var lead = { email: email, nome: '', ruolo: 'sconosciuto', stato: 'cold', crmScore: 0, matrixDone: false, prenotazione: false, outreachStep: 0 };

  // 1. Utenti
  try {
    var shU = ss.getSheetByName('Utenti');
    if (shU && shU.getLastRow() > 1) {
      var uVals = shU.getDataRange().getValues();
      var uHead = uVals[0].map(function(h){ return String(h||'').trim(); });
      var iUE = uHead.indexOf('Email'); if (iUE < 0) iUE = uHead.indexOf('email');
      var iUN = uHead.indexOf('Nome'); if (iUN < 0) iUN = uHead.indexOf('nome');
      var iUR = uHead.indexOf('Ruolo'); if (iUR < 0) iUR = uHead.indexOf('ruolo');
      var iUS = uHead.indexOf('Stato'); if (iUS < 0) iUS = uHead.indexOf('stato');
      for (var r = 1; r < uVals.length; r++) {
        if (String(uVals[r][iUE]||'').toLowerCase().trim() === email) {
          lead.nome = iUN >= 0 ? String(uVals[r][iUN]||'') : '';
          lead.ruolo = iUR >= 0 ? String(uVals[r][iUR]||'') : 'lettore';
          lead.stato = iUS >= 0 ? String(uVals[r][iUS]||'') : 'attivo';
          break;
        }
      }
    }
  } catch(_){}

  // 2. CRM_Leads
  try {
    var shC = ss.getSheetByName('CRM_Leads');
    if (shC && shC.getLastRow() > 1) {
      var cVals = shC.getDataRange().getValues();
      var cHead = cVals[0].map(function(h){ return String(h||'').trim(); });
      var iCE = cHead.indexOf('Email'); if (iCE < 0) iCE = cHead.indexOf('email');
      var iCS = cHead.indexOf('Score'); if (iCS < 0) iCS = cHead.indexOf('score');
      for (var cr = 1; cr < cVals.length; cr++) {
        if (String(cVals[cr][iCE]||'').toLowerCase().trim() === email) {
          lead.crmScore = Number(cVals[cr][iCS]) || 0;
          break;
        }
      }
    }
  } catch(_){}

  // 3. Matrix
  try {
    var shM = ss.getSheetByName('ContactsMatrix');
    if (shM && shM.getLastRow() > 1) {
      var mVals = shM.getDataRange().getValues();
      var mHead = mVals[0].map(function(h){ return String(h||'').trim(); });
      var iME = mHead.indexOf('email'); if (iME < 0) iME = mHead.indexOf('Email');
      for (var mr = 1; mr < mVals.length; mr++) {
        if (String(mVals[mr][iME]||'').toLowerCase().trim() === email) {
          lead.matrixDone = true;
          break;
        }
      }
    }
  } catch(_){}

  // 4. Prenotazione
  try {
    var shP = ss.getSheetByName('RichiestePrenotazione');
    if (shP && shP.getLastRow() > 1) {
      var pVals = shP.getDataRange().getValues();
      var pHead = pVals[0].map(function(h){ return String(h||'').trim(); });
      var iPE = pHead.indexOf('Email'); if (iPE < 0) iPE = pHead.indexOf('email');
      for (var pr = 1; pr < pVals.length; pr++) {
        if (String(pVals[pr][iPE]||'').toLowerCase().trim() === email) {
          lead.prenotazione = true;
          break;
        }
      }
    }
  } catch(_){}

  // 5. Outreach step
  try {
    var shO = ss.getSheetByName(OE_SHEET_NAME);
    if (shO && shO.getLastRow() > 1) {
      var oVals = shO.getDataRange().getValues();
      for (var or_ = 1; or_ < oVals.length; or_++) {
        if (String(oVals[or_][0]||'').toLowerCase().trim() === email) {
          lead.outreachStep = Number(oVals[or_][2]) || 0;
          lead.outreachStato = String(oVals[or_][5]||'');
          break;
        }
      }
    }
  } catch(_){}

  return lead;
}

// ============================================================================
// SEQUENZA OUTREACH — trigger giornaliero
// ============================================================================

/**
 * Eseguita dal trigger giornaliero. Per ogni contatto con prossima_azione <= oggi,
 * esegue lo step e pianifica il successivo a +14gg.
 * Si ferma su registrazione/risposta.
 */
function outreachRunDaily() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OE_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return { ok: true, processati: 0 };

  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var vals = sh.getDataRange().getValues();
  var processati = 0, inviati = 0, fermati = 0;

  for (var r = 1; r < vals.length; r++) {
    var email = String(vals[r][0] || '').trim();
    var step = Number(vals[r][2]) || 0;
    var prossimaAzione = vals[r][4];
    var stato = String(vals[r][5] || '').toLowerCase();

    if (!email || stato === 'completato' || stato === 'fermato' || stato === 'registrato') continue;
    if (step >= OE_MAX_STEPS) { sh.getRange(r+1, 6).setValue('completato'); fermati++; continue; }

    var prossima = (prossimaAzione instanceof Date) ? prossimaAzione : new Date(prossimaAzione);
    if (isNaN(prossima.getTime()) || prossima > oggi) continue;

    // Verifica se nel frattempo si e registrato
    var lead = getLeadUnificato(email);
    if (lead && lead.stato === 'attivo' && lead.ruolo !== 'sconosciuto') {
      sh.getRange(r+1, 6).setValue('registrato');
      fermati++;
      continue;
    }

    // Quota check
    if (MailApp.getRemainingDailyQuota() < 5) break;

    // Invio step
    var museo = String(vals[r][1] || '');
    var nextStep = step + 1;
    try {
      _outreachSendStep_(email, museo, nextStep);
      sh.getRange(r+1, 3).setValue(nextStep); // Step
      sh.getRange(r+1, 4).setValue(new Date()); // UltimoContatto
      sh.getRange(r+1, 5).setValue(new Date(oggi.getTime() + OE_STEP_INTERVAL_DAYS * 86400000)); // ProssimaAzione
      sh.getRange(r+1, 6).setValue('in_corso');
      inviati++;
    } catch(e) {
      sh.getRange(r+1, 8).setValue('Errore step ' + nextStep + ': ' + e.message);
    }
    processati++;
  }
  Logger.log('[OUTREACH] Processati: ' + processati + ', inviati: ' + inviati + ', fermati: ' + fermati);
  return { ok: true, processati: processati, inviati: inviati, fermati: fermati };
}

function _outreachSendStep_(email, museo, step) {
  var appUrl = '';
  try { appUrl = ScriptApp.getService().getUrl(); } catch(_){}
  var subject, body;

  if (step === 1) {
    // Cold mail
    subject = 'Sinopia — Osservatorio Culturale per ' + (museo || 'il tuo territorio');
    body = '<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px">'
      + '<div style="font-size:22px;font-weight:700;color:#935851;margin-bottom:16px">Scopri l\'Osservatorio Culturale</div>'
      + '<p style="font-size:15px;color:#333;line-height:1.6">Sinopia monitora ogni giorno <b>bandi, notizie, podcast e opportunita</b> per musei e operatori culturali. Tutto gratuito, tutto mirato.</p>'
      + '<p style="font-size:15px;color:#333;line-height:1.6">Registrandoti ricevi una newsletter settimanale con i contenuti piu rilevanti per ' + (museo || 'la tua realta') + '.</p>'
      + '<a href="' + appUrl + '" style="display:inline-block;background:#935851;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;margin:16px 0">Visita Sinopia &rarr;</a>'
      + '<p style="font-size:13px;color:#888;margin-top:20px">Silvano Straccini — Sinopia<br>sinopiaconsulting@gmail.com</p></div>';
  } else if (step === 2) {
    // Follow-up
    subject = 'Hai visto le opportunita per ' + (museo || 'il tuo territorio') + '?';
    body = '<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px">'
      + '<p style="font-size:15px;color:#333;line-height:1.6">Ti scrivo di nuovo perche ci sono <b>nuovi bandi e opportunita</b> che potrebbero interessare ' + (museo || 'la tua organizzazione') + '.</p>'
      + '<p style="font-size:15px;color:#333;line-height:1.6">In pochi minuti puoi attivare il tuo profilo e ricevere solo contenuti pertinenti:</p>'
      + '<a href="' + appUrl + '?goto=profilo-pro" style="display:inline-block;background:#935851;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;margin:16px 0">Attiva il tuo profilo &rarr;</a>'
      + '<p style="font-size:13px;color:#888;margin-top:20px">Silvano Straccini — Sinopia</p></div>';
  } else {
    // Step 3: ultimo tentativo
    subject = 'Ultima segnalazione per ' + (museo || 'il tuo territorio');
    body = '<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px">'
      + '<p style="font-size:15px;color:#333;line-height:1.6">Questa e l\'ultima volta che ti scrivo. Se preferisci non ricevere aggiornamenti, non devi fare nulla.</p>'
      + '<p style="font-size:15px;color:#333;line-height:1.6">Se invece vuoi restare informato su bandi e opportunita culturali, il portale e sempre aperto:</p>'
      + '<a href="' + appUrl + '" style="display:inline-block;background:#935851;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;margin:16px 0">Visita Sinopia &rarr;</a>'
      + '<p style="font-size:13px;color:#888;margin-top:20px">Silvano Straccini — Sinopia</p></div>';
  }

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: body,
    name: 'Silvano Straccini — Sinopia',
    replyTo: 'sinopiaconsulting@gmail.com'
  });
  if (typeof _digestMarkSent_ === 'function') _digestMarkSent_(email, 'outreach_step' + step);
}

// ============================================================================
// WELCOME EMAIL post-registrazione
// ============================================================================

function sendWelcomeEmail(email, nome) {
  if (!email) return;
  try {
    var appUrl = '';
    try { appUrl = ScriptApp.getService().getUrl(); } catch(_){}
    var calUrl = '';
    try { calUrl = PropertiesService.getScriptProperties().getProperty('OC_CALENDARIO_URL') || ''; } catch(_){}

    MailApp.sendEmail({
      to: email,
      subject: 'Benvenuto su Sinopia — il tuo Osservatorio Culturale',
      htmlBody: '<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px">'
        + '<div style="font-size:22px;font-weight:700;color:#935851;margin-bottom:16px">Benvenuto' + (nome ? ', ' + nome : '') + '!</div>'
        + '<p style="font-size:15px;color:#333;line-height:1.6">La tua registrazione su Sinopia e attiva. Ogni settimana riceverai un digest con bandi, notizie e opportunita selezionate per il settore culturale.</p>'
        + '<p style="font-size:15px;color:#333;line-height:1.6"><b>Prossimo passo:</b> completa il tuo profilo per ricevere contenuti mirati sui tuoi interessi specifici.</p>'
        + '<a href="' + appUrl + '?goto=profilo-pro" style="display:inline-block;background:#935851;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;margin:16px 0">Completa il tuo profilo &rarr;</a>'
        + (calUrl ? '<p style="font-size:14px;color:#555;margin-top:20px;padding:14px;background:#F7F4EE;border-radius:8px"><b>Vuoi una consulenza gratuita?</b> Prenota 30 minuti con noi per capire come valorizzare il tuo progetto culturale.<br><a href="' + calUrl + '" style="color:#935851;font-weight:600">Prenota ora &rarr;</a></p>' : '')
        + '<p style="font-size:13px;color:#888;margin-top:20px">Silvano Straccini — Sinopia<br><a href="' + appUrl + '" style="color:#935851">Sinopia · Osservatorio Culturale</a></p></div>',
      name: 'Sinopia — Osservatorio Culturale',
      replyTo: 'sinopiaconsulting@gmail.com'
    });
    Logger.log('[WELCOME] Email inviata a ' + email);
  } catch(e) { Logger.log('[WELCOME] Errore: ' + e.message); }
}

// ============================================================================
// AGGIUNTA CONTATTO alla sequenza outreach
// ============================================================================

function addOutreachContact(email, museoNome, sorgente) {
  if (!email) return { ok: false, error: 'email mancante' };
  email = String(email).toLowerCase().trim();
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OE_SHEET_NAME);
  if (!sh) { setupOutreachSheet(); sh = ss.getSheetByName(OE_SHEET_NAME); }
  if (!sh) return { ok: false, error: 'foglio non creato' };

  // Dedup
  if (sh.getLastRow() > 1) {
    var vals = sh.getDataRange().getValues();
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][0]||'').toLowerCase().trim() === email) return { ok: true, action: 'exists' };
    }
  }

  var oggi = new Date();
  var prossima = new Date(oggi.getTime() + 1 * 86400000); // domani
  sh.appendRow([email, museoNome || '', 0, '', prossima, 'nuovo', sorgente || 'manuale', '', oggi.toISOString()]);
  return { ok: true, action: 'added' };
}

// ============================================================================
// CRUSCOTTO COORTE MENSILE
// ============================================================================

function getOutreachFunnelMensile() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var funnel = { contattati: 0, registrati: 0, profilati: 0, matrix: 0, prenotazioni: 0 };

  // Contattati (OutreachSequence)
  try {
    var shO = ss.getSheetByName(OE_SHEET_NAME);
    if (shO && shO.getLastRow() > 1) funnel.contattati = shO.getLastRow() - 1;
  } catch(_){}

  // Registrati (Utenti attivi)
  try {
    var shU = ss.getSheetByName('Utenti');
    if (shU && shU.getLastRow() > 1) {
      var uVals = shU.getDataRange().getValues();
      for (var r = 1; r < uVals.length; r++) {
        var st = String(uVals[r][uVals[0].indexOf('Stato')]||'').toLowerCase();
        if (st === 'attivo') funnel.registrati++;
      }
    }
  } catch(_){}

  // Profilati (ProfiloPro con completezza > 30%)
  try {
    var shP = ss.getSheetByName('ProfiloPro');
    if (shP && shP.getLastRow() > 1) funnel.profilati = shP.getLastRow() - 1;
  } catch(_){}

  // Matrix completati
  try {
    var shM = ss.getSheetByName('ContactsMatrix');
    if (shM && shM.getLastRow() > 1) funnel.matrix = shM.getLastRow() - 1;
  } catch(_){}

  // Prenotazioni
  try {
    var shR = ss.getSheetByName('RichiestePrenotazione');
    if (shR && shR.getLastRow() > 1) funnel.prenotazioni = shR.getLastRow() - 1;
  } catch(_){}

  return { ok: true, funnel: funnel };
}

// ============================================================================
// FINE OutreachEngine.js
// ============================================================================
