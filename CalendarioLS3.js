/**
 * ============================================================================
 *  CalendarioLS3.js — Candidature Speciali: outreach proattivo
 * ============================================================================
 *  v4.18.60 (2026-05-16)
 *  Autore: Silvano Straccini / Duemilamusei
 *
 *  SCOPO
 *  -----
 *  Monitora scadenze candidature culturali (CIC, ECoC, UNESCO, ecc.)
 *  e genera outreach proattivo 6 mesi prima della deadline verso enti
 *  potenzialmente candidabili.
 *
 *  FLUSSO
 *  ------
 *  1. CalendarioLS3 (foglio) contiene le scadenze ricorrenti
 *  2. Trigger settimanale controlla quali scadono entro 6-9 mesi
 *  3. Per ciascuna: genera batch email outreach personalizzate
 *  4. Silvano approva via admin panel → invio
 *  5. CRM traccia risposte
 *
 *  DIPENDENZE: CRM_v1.js (scoring), Telegram_v44.js (notifiche),
 *              ROC_v1.js (MuseiDB per targeting), MailApp
 * ============================================================================
 */

var LS3_SHEET = 'CalendarioLS3';
var LS3_OUTREACH_SHEET = 'LS3_Outreach';
var LS3_HEADERS = [
  'id', 'riconoscimento', 'ciclo', 'prossima_scadenza', 'beneficiario_tipo',
  'promotore', 'regione_target', 'popolazione_min', 'note_requisiti',
  'template_email', 'evidence_modelli', 'attivo', 'ultimo_outreach'
];
var LS3_OUTREACH_HEADERS = [
  'id', 'ls3_id', 'riconoscimento', 'email_destinatario', 'ente', 'comune',
  'regione', 'data_generazione', 'data_invio', 'stato', 'risposta', 'note'
];

// Candidature italiane e internazionali con scadenze note
var LS3_CANDIDATURE = [
  {
    id: 'cic', riconoscimento: 'Capitale Italiana della Cultura',
    ciclo: 'annuale', mesi_anticipo: 8,
    beneficiario: 'Comune', promotore: 'MiC',
    requisiti: 'Bid-book pubblico. Comuni italiani senza vincoli dimensionali.',
    evidence: 'M6 (Pesaro CIC 2024 — DG, 1200 eventi, 50 comuni)',
    template_subject: 'Capitale Italiana della Cultura {anno} — il vostro Comune ci ha pensato?',
    template_body: 'Gentile {nome},\n\nla scadenza per la candidatura a Capitale Italiana della Cultura {anno} si avvicina ({scadenza}).\n\nDuemilamusei ha diretto Pesaro Capitale Italiana della Cultura 2024 (oltre 1200 eventi in 50 comuni, grandi eventi internazionali). Offriamo supporto strategico gratuito per una prima valutazione di fattibilita.\n\nVuole esplorare questa opportunita per {comune}?\n\nCordiali saluti,\nSilvano Straccini\nDuemilamusei'
  },
  {
    id: 'cil', riconoscimento: 'Capitale Italiana del Libro',
    ciclo: 'annuale', mesi_anticipo: 6,
    beneficiario: 'Comune', promotore: 'MiC - Cepell',
    requisiti: 'Promozione lettura. Comuni italiani.',
    evidence: 'M6 + M4 (community engagement culturale)',
    template_subject: 'Capitale Italiana del Libro {anno} — una candidatura per {comune}?',
    template_body: 'Gentile {nome},\n\nla candidatura a Capitale Italiana del Libro {anno} si apre a breve (scadenza: {scadenza}).\n\nDuemilamusei offre supporto alla redazione del dossier, forte dell\'esperienza nella direzione di Pesaro CIC 2024 e nella progettazione di palinsesti culturali partecipativi.\n\nPossiamo fissare una call esplorativa?\n\nCordiali saluti,\nSilvano Straccini'
  },
  {
    id: 'ciac', riconoscimento: 'Capitale Italiana Arte Contemporanea',
    ciclo: 'biennale', mesi_anticipo: 7,
    beneficiario: 'Comune', promotore: 'MiC - DGCC',
    requisiti: 'Target arte contemporanea. Cadenza da confermare.',
    evidence: 'M7 (Marina Abramovic, Ryuichi Sakamoto) + M8 (Castello di Rivoli network)',
    template_subject: 'Arte Contemporanea {anno} — il vostro territorio come candidato?',
    template_body: 'Gentile {nome},\n\nil MiC ha lanciato la Capitale Italiana dell\'Arte Contemporanea. Con la nostra esperienza nella programmazione di grandi eventi internazionali (Marina Abramovic, Ryuichi Sakamoto a Pesaro 2024), possiamo supportare la costruzione di un dossier credibile.\n\nInteressa una valutazione preliminare per {comune}?\n\nSilvano Straccini — Duemilamusei'
  },
  {
    id: 'cig', riconoscimento: 'Capitale Italiana dei Giovani',
    ciclo: 'annuale', mesi_anticipo: 6,
    beneficiario: 'Comune', promotore: 'Min. Sport e Giovani',
    requisiti: 'Target under 35.',
    evidence: 'M4 (welfare, partecipazione) + M5 (reti culturali)',
    template_subject: 'Capitale dei Giovani {anno} — {comune} potrebbe candidarsi',
    template_body: 'Gentile {nome},\n\nla Capitale Italiana dei Giovani {anno} e un\'opportunita per comuni che investono su cultura, partecipazione e innovazione per gli under 35.\n\nDuemilamusei puo supportare la redazione del dossier con esperienza in audience development e progettazione partecipativa.\n\nVuole saperne di piu?\n\nSilvano Straccini'
  },
  {
    id: 'ecoc', riconoscimento: 'Capitale Europea della Cultura',
    ciclo: 'annuale (Italia 2033)', mesi_anticipo: 12,
    beneficiario: 'Comune + Regione', promotore: 'UE / MiC',
    requisiti: 'Bid-book 4-5 anni prima. Italia 2033 (Urbino-Pesaro-Fano gia attivo).',
    evidence: 'M6 (Pesaro CIC + supporto Urbino-Pesaro-Fano ECoC 2033)',
    template_subject: 'Capitale Europea della Cultura — supporto strategico per la candidatura',
    template_body: 'Gentile {nome},\n\nla prossima Capitale Europea della Cultura in Italia sara nel 2033. La preparazione inizia ora.\n\nDuemilamusei sta gia collaborando con la candidatura Urbino-Pesaro-Fano 2033. Offriamo supporto alla costruzione del bid-book e del programma culturale.\n\nPossiamo condividere la nostra esperienza?\n\nSilvano Straccini'
  },
  {
    id: 'unesco_cc', riconoscimento: 'UNESCO Citta Creative',
    ciclo: 'biennale (anni dispari)', mesi_anticipo: 9,
    beneficiario: 'Comune', promotore: 'UNESCO',
    requisiti: '7 ambiti: artigianato, design, cinema, gastronomia, letteratura, musica, media arts.',
    evidence: 'M5 (DCE, reti) + M10 (marketing territoriale) + M8 (musealizzazione artigianato)',
    template_subject: 'UNESCO Citta Creative — {comune} nel network mondiale?',
    template_body: 'Gentile {nome},\n\nil programma UNESCO Citta Creative accoglie candidature biennali (prossima: {anno}). I 7 ambiti (artigianato, design, gastronomia, musica...) offrono opportunita di posizionamento internazionale.\n\nDuemilamusei ha esperienza in progettazione di reti culturali e distretti creativi. Possiamo valutare insieme se {comune} ha i requisiti?\n\nSilvano Straccini'
  }
];

// ============================================================================
// SETUP
// ============================================================================

function setupCalendarioLS3() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

  // Foglio calendario
  var sh = ss.getSheetByName(LS3_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LS3_SHEET);
    sh.appendRow(LS3_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, LS3_HEADERS.length).setFontWeight('bold').setBackground('#534AB7').setFontColor('#FFFFFF');
  }

  // Seed candidature
  var existIds = {};
  if (sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
    vals.forEach(function(r){ if (r[0]) existIds[r[0]] = true; });
  }

  var inserite = 0;
  LS3_CANDIDATURE.forEach(function(c) {
    if (existIds[c.id]) return;
    sh.appendRow([
      c.id, c.riconoscimento, c.ciclo, '', c.beneficiario,
      c.promotore, '', '', c.requisiti,
      c.template_subject + '\n---\n' + c.template_body,
      c.evidence, true, ''
    ]);
    inserite++;
  });

  // Foglio outreach
  var shO = ss.getSheetByName(LS3_OUTREACH_SHEET);
  if (!shO) {
    shO = ss.insertSheet(LS3_OUTREACH_SHEET);
    shO.appendRow(LS3_OUTREACH_HEADERS);
    shO.setFrozenRows(1);
    shO.getRange(1, 1, 1, LS3_OUTREACH_HEADERS.length).setFontWeight('bold').setBackground('#534AB7').setFontColor('#FFFFFF');
  }

  return { ok: true, candidature_inserite: inserite, foglio: LS3_SHEET };
}

// ============================================================================
// CHECK SCADENZE — Trigger settimanale
// ============================================================================

/**
 * Controlla quali candidature scadono entro 6-9 mesi.
 * Per quelle in finestra: genera notifica Telegram a Silvano.
 * Chiamato da trigger settimanale (mercoledi 09:00).
 */
function checkScadenzeLS3() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LS3_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, message: 'Nessuna candidatura nel calendario' };

  var vals = sh.getDataRange().getValues();
  var headers = vals[0];
  var iId = 0, iNome = 1, iScad = 3, iAttivo = 11, iUltimo = 12;

  var oggi = new Date();
  var mesi6 = new Date(oggi); mesi6.setMonth(mesi6.getMonth() + 6);
  var mesi9 = new Date(oggi); mesi9.setMonth(mesi9.getMonth() + 9);

  var inFinestra = [];
  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    if (!row[iAttivo]) continue;
    var scadStr = row[iScad];
    if (!scadStr) continue;
    var scad = new Date(scadStr);
    if (isNaN(scad.getTime())) continue;

    // In finestra 6-9 mesi
    if (scad >= mesi6 && scad <= mesi9) {
      // Controlla se outreach gia fatto (ultimo_outreach entro 60gg)
      var ultimo = row[iUltimo] ? new Date(row[iUltimo]) : null;
      if (ultimo && (oggi.getTime() - ultimo.getTime()) < 60 * 86400000) continue;

      inFinestra.push({
        id: row[iId],
        nome: row[iNome],
        scadenza: scad,
        giorni: Math.round((scad.getTime() - oggi.getTime()) / 86400000)
      });
    }
  }

  if (inFinestra.length === 0) {
    return { ok: true, message: 'Nessuna candidatura in finestra 6-9 mesi' };
  }

  // Notifica Telegram
  var msg = '🏛️ <b>LS3 — Candidature in finestra</b>\n\n';
  inFinestra.forEach(function(c) {
    msg += '• <b>' + c.nome + '</b> — scade tra ' + c.giorni + 'gg\n';
  });
  msg += '\nVuoi generare l\'outreach? Esegui <code>generateLS3Outreach()</code> dall\'editor GAS.';

  try {
    if (typeof sendTelegram === 'function') sendTelegram(msg);
    else if (typeof _tgSend_ === 'function') _tgSend_(msg);
  } catch(e) { Logger.log('LS3 Telegram err: ' + e.message); }

  return { ok: true, inFinestra: inFinestra };
}

// ============================================================================
// GENERA OUTREACH BATCH
// ============================================================================

/**
 * Per ogni candidatura in finestra, genera email personalizzate
 * usando il database musei (MuseiDB_v1) filtrato per requisiti.
 * Le email vengono salvate in LS3_Outreach con stato 'draft'.
 * Silvano approva poi con approveLS3Batch().
 */
function generateLS3Outreach(opts) {
  opts = opts || {};
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LS3_SHEET);
  var shO = ss.getSheetByName(LS3_OUTREACH_SHEET);
  var shM = ss.getSheetByName('MuseiDB_v1');

  if (!sh || !shO) return { ok: false, error: 'Esegui setupCalendarioLS3() prima' };
  if (!shM || shM.getLastRow() < 2) return { ok: false, error: 'Database musei vuoto. Esegui roc_seedMuseiPilota().' };

  var vals = sh.getDataRange().getValues();
  var mVals = shM.getDataRange().getValues();
  var mHead = mVals[0];
  var iMNome = mHead.indexOf('nome'), iMEnte = mHead.indexOf('ente_gestore');
  var iMReg = mHead.indexOf('regione'), iMCom = mHead.indexOf('comune');
  var iMEmail = mHead.indexOf('email_direzionale'), iMRel = mHead.indexOf('relazione_dm');

  var oggi = new Date();
  var mesi6 = new Date(oggi); mesi6.setMonth(mesi6.getMonth() + 6);
  var mesi9 = new Date(oggi); mesi9.setMonth(mesi9.getMonth() + 9);

  // Dedup: carica outreach esistenti per evitare duplicati
  var existingKeys = {};
  if (shO.getLastRow() > 1) {
    var oVals = shO.getDataRange().getValues();
    for (var oe = 1; oe < oVals.length; oe++) {
      var oKey = String(oVals[oe][1] || '') + '|' + String(oVals[oe][3] || '').toLowerCase();
      existingKeys[oKey] = true;
    }
  }

  var batchRows = [];  // raccoglie righe per batch write
  var counter = 0;

  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    if (!row[11]) continue; // non attivo
    var scadStr = row[3];
    if (!scadStr) continue;
    var scad = new Date(scadStr);
    if (isNaN(scad.getTime())) continue;
    if (scad < mesi6 || scad > mesi9) continue;

    var candidatura = LS3_CANDIDATURE.filter(function(c){ return c.id === row[0]; })[0];
    if (!candidatura) continue;

    var anno = scad.getFullYear();
    var scadFormatted = Utilities.formatDate(scad, 'Europe/Rome', 'dd/MM/yyyy');
    var museiGenerati = 0;

    for (var m = 1; m < mVals.length; m++) {
      var museo = mVals[m];
      var rel = String(museo[iMRel] || '').toLowerCase();
      if (rel === 'no_contattare') continue;
      var email = String(museo[iMEmail] || '').trim();
      if (!email) continue;  // skip musei senza email

      // Dedup: salta se gia generato per questa candidatura+email
      var dedupKey = String(row[0]) + '|' + email.toLowerCase();
      if (existingKeys[dedupKey]) continue;

      var comune = museo[iMCom] || '';
      var nome = museo[iMNome] || '';
      var subject = candidatura.template_subject
        .replace('{anno}', anno)
        .replace('{comune}', comune);

      counter++;
      var outId = 'LS3-' + row[0] + '-' + Date.now() + '-' + counter;
      batchRows.push([
        outId, row[0], row[1], email,
        museo[iMEnte] || nome, comune, museo[iMReg] || '',
        new Date().toISOString(), '', 'draft', '',
        anno + '|' + scadFormatted + '|' + subject  // note: anno + scadenza per approveLS3Batch
      ]);
      existingKeys[dedupKey] = true;
      museiGenerati++;
    }

    // Aggiorna ultimo_outreach solo se abbiamo generato almeno 1 draft
    if (museiGenerati > 0) {
      sh.getRange(r + 1, 13).setValue(new Date().toISOString());
    }
  }

  // Batch write: tutte le righe in un solo call
  if (batchRows.length > 0) {
    shO.getRange(shO.getLastRow() + 1, 1, batchRows.length, batchRows[0].length).setValues(batchRows);
  }

  return { ok: true, draft_generati: batchRows.length };
}

// ============================================================================
// APPROVA E INVIA BATCH
// ============================================================================

function approveLS3Batch(opts) {
  opts = opts || {};
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shO = ss.getSheetByName(LS3_OUTREACH_SHEET);
  if (!shO || shO.getLastRow() < 2) return { ok: false, error: 'Nessun outreach da approvare' };

  var vals = shO.getDataRange().getValues();
  var iEmail = 3, iStato = 9, iDataInvio = 8, iNote = 11;

  var inviati = 0, saltati = 0;
  for (var r = 1; r < vals.length; r++) {
    if (vals[r][iStato] !== 'draft') continue;
    var email = String(vals[r][iEmail] || '').trim();

    // Email validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      shO.getRange(r + 1, iStato + 1).setValue('skipped_invalid_email');
      saltati++;
      continue;
    }

    var candidatura = vals[r][2]; // riconoscimento
    var ls3Id = vals[r][1];       // id candidatura
    var ente = vals[r][4];
    var comune = vals[r][5];

    // Leggi anno e scadenza dalla colonna note (formato: "anno|scadenza|subject")
    var noteParts = String(vals[r][iNote] || '').split('|');
    var anno = noteParts[0] || String(new Date().getFullYear() + 1);
    var scadFormatted = noteParts[1] || '';
    var subject = noteParts[2] || 'Opportunita candidatura — ' + candidatura;

    // Trova template per ID (piu robusto che per nome)
    var cand = LS3_CANDIDATURE.filter(function(c){ return c.id === ls3Id; })[0]
            || LS3_CANDIDATURE.filter(function(c){ return c.riconoscimento === candidatura; })[0];
    var body = cand ? cand.template_body
      .replace('{nome}', 'Direttore/Responsabile')
      .replace('{comune}', comune)
      .replace('{anno}', anno)
      .replace('{scadenza}', scadFormatted || 'prossimi mesi')
      : 'Gentile Direttore, vi contatto per segnalare l\'opportunita di candidatura a ' + candidatura + '.';

    try {
      MailApp.sendEmail({
        to: email,
        subject: subject,
        body: body,
        name: 'Silvano Straccini — Duemilamusei',
        replyTo: 's.straccini@gmail.com'
      });
      shO.getRange(r + 1, iStato + 1).setValue('sent');
      shO.getRange(r + 1, iDataInvio + 1).setValue(new Date().toISOString());
      inviati++;

      // CRM hook
      try {
        if (typeof crm_recordEvent === 'function') {
          crm_recordEvent(email, 'ls3_outreach', 2, { candidatura: candidatura, comune: comune });
        }
      } catch(_) {}
    } catch(eM) {
      shO.getRange(r + 1, iStato + 1).setValue('error: ' + eM.message);
      saltati++;
    }
  }

  return { ok: true, inviati: inviati, saltati: saltati };
}

// ============================================================================
// TRIGGER SETUP
// ============================================================================

function setupLS3Trigger() {
  // Rimuovi trigger esistente
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'checkScadenzeLS3') ScriptApp.deleteTrigger(t);
  });
  // Nuovo: ogni mercoledi alle 09:00
  ScriptApp.newTrigger('checkScadenzeLS3')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(9)
    .create();
  Logger.log('Trigger LS3 installato: checkScadenzeLS3 ogni mercoledi 09:00');
  return { ok: true };
}

// ============================================================================
// ADMIN: lista candidature con stato
// ============================================================================

function getCalendarioLS3Status() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LS3_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: true, candidature: [], message: 'Calendario vuoto. Esegui setupCalendarioLS3().' };

  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    out.push({
      id: vals[r][0], nome: vals[r][1], ciclo: vals[r][2],
      scadenza: vals[r][3] || '(da impostare)',
      attivo: !!vals[r][11], ultimoOutreach: vals[r][12] || null
    });
  }
  return { ok: true, candidature: out };
}
