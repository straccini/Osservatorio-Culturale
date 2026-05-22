/**
 * ============================================================================
 *  ROC_v1.gs — Radar Opportunita Cultura
 * ============================================================================
 *  Sprint 5 (2026-05-11)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Scopo: motore outbound bando-driven Duemilamusei. Affianca MuseMu Matrix
 *  (inbound) come secondo motore di acquisizione lead.
 *
 *  Workflow operativo (decisione 2026-05-08):
 *    Step 1: roc_triageBando(bando)         -> automatico dentro scanFontiTutte
 *    Step 2: roc_notifyTelegramDecision()   -> Silvano riceve scheda + 2 bottoni
 *    Step 3: roc_matchMusei(bandoId)        -> top 10-20 musei prioritizzati
 *    Step 4: roc_buildEmailBatch(bandoId)   -> genera email personalizzate
 *    Step 5: roc_approveBatch(batchId)      -> Silvano OK -> invio
 *    Step 6: invio + tracking via UTM
 *    Step 7: follow-up automatico a 14gg
 *
 *  4 FILTRI TRIAGE (AND, confermati 2026-05-08):
 *    - Area Duemilamusei (match catalogo D4)
 *    - Importo >= 50.000 EUR
 *    - Scadenza >= 45 giorni
 *    - Perimetro >= regionale
 *
 *  Cap pre-progettazioni gratuite: 5-8/mese (capacita Silvano).
 *  Tono email: 'noi' Duemilamusei + firma personale Silvano.
 * ============================================================================
 */

// ============================================================================
// COSTANTI ROC
// ============================================================================

var ROC_TRIAGE_LOG_SHEET   = 'ROC_TriageLog';
var ROC_BATCH_LOG_SHEET    = 'ROC_BatchLog';
var ROC_OUTREACH_SHEET     = 'ROC_Outreach';
var ROC_EXCLUDE_SHEET      = 'ROC_ExcludePermanent';
var ROC_MUSEI_SHEET        = 'MuseiDB_v1';

// Soglie triage
var ROC_IMPORTO_MIN        = 50000;     // EUR
var ROC_SCADENZA_MIN_GG    = 45;
var ROC_PERIMETRO_MIN      = ['regionale','interregionale','nazionale','europeo'];
// Aree di interesse Duemilamusei (catalogo D4)
var ROC_AREE_VALIDE        = ['musealizzazione','accessibilita','digital','ai','governance','allestimento','formazione','audience'];

// Cap pre-progettazioni gratuite mese
var ROC_CAP_PREPROG_MESE   = 8;

// ============================================================================
// STEP 1 — roc_triageBando(bando)
// ----------------------------------------------------------------------------
// Applica 4 filtri AND, calcola match-score con catalogo D4.
// Output: { passa: bool, score, motivi: [...], suggerimenti_servizi: [...] }
// Chiamato automaticamente da scanFontiTutte() dopo _saveBandoV5_().
// ============================================================================

function roc_triageBando(bando) {
  try {
    bando = bando || {};
    var motivi = [];
    var passa = true;

    // Filtro 1: area
    var settore = String(bando.settore || bando.titolo || bando.sommario || '').toLowerCase();
    var areaMatch = ROC_AREE_VALIDE.filter(function(a){ return settore.indexOf(a) >= 0; });
    if (areaMatch.length === 0) { passa = false; motivi.push('area_non_target'); }
    else motivi.push('area_ok:' + areaMatch.join(','));

    // Filtro 2: importo
    var importo = Number(bando.importo || 0);
    if (importo < ROC_IMPORTO_MIN) { passa = false; motivi.push('importo_sotto_soglia:' + importo); }
    else motivi.push('importo_ok:' + importo);

    // Filtro 3: scadenza
    var scad = bando.scadenza ? new Date(bando.scadenza) : null;
    if (!scad || isNaN(scad.getTime())) { passa = false; motivi.push('scadenza_mancante'); }
    else {
      var gg = Math.ceil((scad.getTime() - Date.now()) / 86400000);
      if (gg < ROC_SCADENZA_MIN_GG) { passa = false; motivi.push('scadenza_troppo_breve:' + gg + 'gg'); }
      else motivi.push('scadenza_ok:' + gg + 'gg');
    }

    // Filtro 4: perimetro
    var liv = String(bando.livello || '').toLowerCase();
    var perimetroOk = false;
    ROC_PERIMETRO_MIN.forEach(function(p){ if (liv.indexOf(p) >= 0) perimetroOk = true; });
    if (!perimetroOk) { passa = false; motivi.push('perimetro_sotto_regionale:' + liv); }
    else motivi.push('perimetro_ok:' + liv);

    var matchScore = areaMatch.length * 25 + (importo >= 200000 ? 25 : 10);
    if (matchScore > 100) matchScore = 100;

    // Log triage (sempre, anche se non passa)
    _roc_logTriage_(bando, passa, matchScore, motivi);

    var result = { passa: passa, score: matchScore, motivi: motivi, areeMatch: areaMatch };
    if (passa) {
      // Notifica Telegram asincrona se passa
      try { roc_notifyTelegramDecision(bando, result); } catch(e) { Logger.log('notify err: ' + e.message); }
    }
    return result;
  } catch(e) {
    Logger.log('roc_triageBando ERRORE: ' + e.message);
    return { passa: false, error: e.message };
  }
}

function _roc_logTriage_(bando, passa, score, motivi) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ROC_TRIAGE_LOG_SHEET);
    if (!sh) {
      sh = ss.insertSheet(ROC_TRIAGE_LOG_SHEET);
      sh.appendRow(['timestamp','bando_id','titolo','ente','importo','scadenza','livello','passa','match_score','motivi','decisione_silvano','batch_id']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      new Date().toISOString(),
      bando.id || '',
      bando.titolo || '',
      bando.ente || '',
      Number(bando.importo || 0),
      bando.scadenza || '',
      bando.livello || '',
      passa ? 'SI' : 'NO',
      score,
      motivi.join(' | '),
      '',  // decisione_silvano da popolare via Telegram
      ''
    ]);
  } catch(e) { Logger.log('_roc_logTriage_ err: ' + e.message); }
}

// ============================================================================
// STEP 2 — roc_notifyTelegramDecision
// ----------------------------------------------------------------------------
// Notifica Silvano con scheda triage + 2 bottoni inline.
// Telegram inline_keyboard non e' nativo in MailApp; uso link callback.
// ============================================================================

function roc_notifyTelegramDecision(bando, triageResult) {
  try {
    if (typeof sendTelegram !== 'function') return { ok: false, error: 'sendTelegram non disponibile' };

    var webappUrl = '';
    try { webappUrl = ScriptApp.getService().getUrl() || ''; } catch(e){}
    var avviaUrl = webappUrl + '?roc=avvia&bid=' + encodeURIComponent(bando.id);
    var skipUrl  = webappUrl + '?roc=skip&bid=' + encodeURIComponent(bando.id);

    var msg = '*ROC - Bando triage approvato*\n\n';
    msg += '*' + (bando.titolo || 'Senza titolo') + '*\n';
    msg += 'Ente: ' + (bando.ente || '-') + '\n';
    msg += 'Importo: EUR ' + (bando.importo || '?') + '\n';
    msg += 'Scadenza: ' + (bando.scadenza || '?') + '\n';
    msg += 'Livello: ' + (bando.livello || '?') + '\n';
    msg += 'Match-score: ' + triageResult.score + '/100\n';
    msg += 'Aree: ' + (triageResult.areeMatch || []).join(', ') + '\n\n';
    msg += '[Avvia scouting]( ' + avviaUrl + ' )\n';
    msg += '[Skip]( ' + skipUrl + ' )\n';
    if (bando.urlBando) msg += '\n[Apri scheda bando]( ' + bando.urlBando + ' )';

    sendTelegram(msg);
    return { ok: true, sent: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// STEP 3 — roc_matchMusei(bandoId)
// ----------------------------------------------------------------------------
// Lookup nel database musei MuseiDB_v1, applica 4 criteri di matching,
// restituisce top 10-20 musei prioritizzati.
// ============================================================================

function roc_matchMusei(bandoId, opts) {
  try {
    opts = opts || {};
    var maxRisultati = Number(opts.max) || 20;
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    // Carica bando
    var shB = ss.getSheetByName('RADAR BANDI') || ss.getSheetByName('Bandi_v5');
    if (!shB) return { ok: false, error: 'foglio bandi non trovato' };
    var bVals = shB.getDataRange().getValues();
    var bHead = bVals[0].map(function(h){ return String(h||'').trim(); });
    var iId = bHead.indexOf('ID'); if (iId < 0) iId = 0;
    var iTit = bHead.indexOf('Titolo');
    var iEnte = bHead.indexOf('Ente');
    var iLiv = bHead.indexOf('Livello');
    var iReg = bHead.indexOf('Regione');
    var iSet = bHead.indexOf('Settore');
    var iImp = bHead.indexOf('Importo');
    var iScad = bHead.indexOf('Scadenza');
    var bando = null;
    for (var r = 1; r < bVals.length; r++) {
      if (String(bVals[r][iId]) === String(bandoId)) {
        bando = {
          id: bVals[r][iId], titolo: bVals[r][iTit], ente: bVals[r][iEnte],
          livello: bVals[r][iLiv], regione: bVals[r][iReg], settore: bVals[r][iSet],
          importo: bVals[r][iImp], scadenza: bVals[r][iScad]
        };
        break;
      }
    }
    if (!bando) return { ok: false, error: 'bando ' + bandoId + ' non trovato' };

    // Carica musei
    var shM = ss.getSheetByName(ROC_MUSEI_SHEET);
    if (!shM) return { ok: false, error: 'Database musei MuseiDB_v1 non trovato. Esegui roc_setupMuseiDB() prima.' };
    var mVals = shM.getDataRange().getValues();
    if (mVals.length < 2) return { ok: false, error: 'Database musei vuoto' };
    var mHead = mVals[0].map(function(h){ return String(h||'').trim(); });
    var iMid = mHead.indexOf('id');
    var iMnome = mHead.indexOf('nome');
    var iMtip = mHead.indexOf('tipologia');
    var iMreg = mHead.indexOf('regione');
    var iMdim = mHead.indexOf('visitatori_anno');
    var iMemail = mHead.indexOf('email_direzionale');
    var iMrel = mHead.indexOf('relazione_dm');
    var iMmat = mHead.indexOf('matrix_compilato');

    // Carica exclude list permanente
    var excludeIds = {};
    var shEx = ss.getSheetByName(ROC_EXCLUDE_SHEET);
    if (shEx && shEx.getLastRow() > 1) {
      shEx.getRange(2, 1, shEx.getLastRow() - 1, 1).getValues().forEach(function(row){
        if (row[0]) excludeIds[String(row[0]).toLowerCase()] = true;
      });
    }

    // Scoring
    var bandoSettore = String(bando.settore || '').toLowerCase();
    var bandoLivello = String(bando.livello || '').toLowerCase();
    var bandoRegione = String(bando.regione || '').toLowerCase();
    var importoNum = Number(bando.importo || 0);

    var results = [];
    for (var rr = 1; rr < mVals.length; rr++) {
      var m = mVals[rr];
      if (!m[iMid]) continue;
      var idLow = String(m[iMid]).toLowerCase();
      if (excludeIds[idLow]) continue;

      var rel = String(m[iMrel] || 'mai_contattato').toLowerCase();
      if (rel === 'no_contattare') continue;

      var score = 0;
      var motivi = [];

      // Criterio 1: geografia
      var mReg = String(m[iMreg] || '').toLowerCase();
      if (bandoLivello.indexOf('regionale') >= 0 || bandoLivello.indexOf('interregionale') >= 0) {
        if (mReg === bandoRegione || _isRegioneConfinante_(mReg, bandoRegione)) {
          score += 40; motivi.push('regione_match');
        } else continue;  // fuori regione: salta
      } else {
        score += 20;  // nazionale/europeo: tutti pertinenti
      }

      // Criterio 2: tipologia
      var mTip = String(m[iMtip] || '').toLowerCase();
      if (bandoSettore && mTip && bandoSettore.indexOf(mTip) >= 0) {
        score += 25; motivi.push('tipo_match');
      } else if (bandoSettore.indexOf('access') >= 0) {
        score += 15; motivi.push('tipo_trasversale');  // accessibilita e' trasversale
      }

      // Criterio 3: dimensione
      var vis = Number(m[iMdim] || 0);
      if (importoNum >= 500000 && vis >= 15000) { score += 20; motivi.push('dimensione_grande_match'); }
      else if (importoNum >= 50000 && importoNum < 200000 && vis < 30000) { score += 20; motivi.push('dimensione_piccola_match'); }
      else if (importoNum >= 200000 && importoNum < 500000) { score += 15; motivi.push('dimensione_media'); }

      // Criterio 4: stato relazione Duemilamusei
      if (rel === 'cliente') { score += 50; motivi.push('cliente_attivo'); }
      else if (rel === 'in_trattativa') { score += 35; motivi.push('in_trattativa'); }
      else if (rel === 'contattato') { score += 10; motivi.push('gia_contattato'); }
      if (m[iMmat] === true || m[iMmat] === 'TRUE') { score += 20; motivi.push('matrix_compilato'); }

      results.push({
        id: m[iMid],
        nome: m[iMnome],
        tipologia: mTip,
        regione: mReg,
        visitatori: vis,
        email: m[iMemail],
        relazione: rel,
        score: score,
        motivi: motivi
      });
    }

    results.sort(function(a, b){ return b.score - a.score; });
    var top = results.slice(0, maxRisultati);

    return { ok: true, bando: bando, musei: top, totaleCandidati: results.length };
  } catch(e) {
    Logger.log('roc_matchMusei ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function _isRegioneConfinante_(r1, r2) {
  // Mappa semplificata regioni confinanti (per match geografico esteso)
  var conf = {
    'marche': ['umbria','toscana','emilia-romagna','abruzzo','lazio'],
    'lazio': ['toscana','umbria','marche','abruzzo','molise','campania'],
    'toscana': ['liguria','emilia-romagna','marche','umbria','lazio'],
    'emilia-romagna': ['lombardia','veneto','marche','toscana','liguria'],
    'lombardia': ['piemonte','veneto','trentino-alto adige','emilia-romagna'],
    'veneto': ['trentino-alto adige','lombardia','emilia-romagna','friuli-venezia giulia']
  };
  r1 = String(r1).toLowerCase(); r2 = String(r2).toLowerCase();
  return (conf[r1] && conf[r1].indexOf(r2) >= 0) || (conf[r2] && conf[r2].indexOf(r1) >= 0);
}

// ============================================================================
// STEP 4 — roc_buildEmailBatch(bandoId)
// ----------------------------------------------------------------------------
// Per ogni museo del match restituisce email personalizzata + meta.
// Tono 'noi' Duemilamusei + firma Silvano Straccini.
// ============================================================================

function roc_buildEmailBatch(bandoId, opts) {
  try {
    opts = opts || {};
    var match = roc_matchMusei(bandoId, { max: opts.max || 15 });
    if (!match.ok) return match;

    var bando = match.bando;
    var batchId = 'BATCH_' + Date.now();
    var emails = match.musei.map(function(m){
      var subject = 'Bando ' + (bando.ente || '') + ' - opportunita per ' + (m.nome || 'il vostro museo');
      var body = '' +
        'Gentile direttore,\n\n' +
        'mi chiamo Silvano Straccini, fondatore di Duemilamusei. Da oltre trent\'anni accompagniamo ' +
        'strutture culturali italiane in progetti di musealizzazione, accessibilita e governance ' +
        '— tra gli altri il Museo Nazionale Rossini, il Fellini Museum di Rimini, Pesaro Capitale ' +
        'Italiana della Cultura 2024.\n\n' +
        'Le scriviamo perche e\' uscito un bando che crediamo possa essere di interesse per ' + (m.nome || 'la vostra struttura') + ':\n\n' +
        '  "' + (bando.titolo || '') + '"\n' +
        '  Ente: ' + (bando.ente || '') + '\n' +
        '  Scadenza: ' + (bando.scadenza || '') + '\n' +
        '  Importo: EUR ' + (bando.importo || '') + '\n\n' +
        'Se l\'opportunita vi interessa, vorremmo proporvi un\'analisi gratuita di pre-progettazione: ' +
        '1 ora di call con voi per inquadrare le esigenze del museo + un concept di 2-3 pagine con prima ' +
        'ipotesi di intervento, scopo dell\'iniziativa e stima massimale del progetto. Senza alcun impegno.\n\n' +
        'Per dare un\'idea del nostro approccio, sul sito di Duemilamusei trovate il modello "Musei Sensibili" ' +
        'e l\'autovalutazione gratuita MuseMu Matrix.\n\n' +
        'Resto a disposizione per un\'introduzione, anche solo per esplorare.\n\n' +
        'Buona giornata,\n' +
        'Silvano Straccini\n' +
        'Duemilamusei\n' +
        'bandi@duemilamusei.it';

      return {
        museoId: m.id,
        museoNome: m.nome,
        emailTo: m.email,
        subject: subject,
        body: body,
        bodyHtml: body.replace(/\n/g, '<br>'),
        matchScore: m.score,
        motivi: m.motivi,
        batchId: batchId,
        status: 'draft'
      };
    });

    // Salva il batch in foglio per approvazione
    _roc_saveBatch_(batchId, bando, emails);
    return { ok: true, batchId: batchId, bando: bando, emails: emails, totale: emails.length };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function _roc_saveBatch_(batchId, bando, emails) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ROC_BATCH_LOG_SHEET);
    if (!sh) {
      sh = ss.insertSheet(ROC_BATCH_LOG_SHEET);
      sh.appendRow(['batch_id','bando_id','bando_titolo','created_at','approved_at','sent_at','n_emails','approved_by','status','emails_json']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      batchId,
      bando.id || '',
      bando.titolo || '',
      new Date().toISOString(),
      '', '',
      emails.length,
      '',
      'pending_approval',
      JSON.stringify(emails)
    ]);
  } catch(e) { Logger.log('_roc_saveBatch_ err: ' + e.message); }
}

// ============================================================================
// STEP 5 — roc_approveBatch(batchId)
// ----------------------------------------------------------------------------
// Silvano approva e invia il batch. Approvazione manuale obbligatoria.
// ============================================================================

function roc_approveBatch(batchId, approverEmail) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ROC_BATCH_LOG_SHEET);
    if (!sh) return { ok: false, error: 'ROC_BatchLog non trovato' };
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iId = head.indexOf('batch_id');
    var iStatus = head.indexOf('status');
    var iEmails = head.indexOf('emails_json');
    var iAppr = head.indexOf('approved_at');
    var iSent = head.indexOf('sent_at');
    var iApprBy = head.indexOf('approved_by');
    for (var r = 1; r < vals.length; r++) {
      if (String(vals[r][iId]) === String(batchId)) {
        if (String(vals[r][iStatus]) !== 'pending_approval') {
          return { ok: false, error: 'Batch in stato ' + vals[r][iStatus] + ' non approvabile' };
        }
        var emails = JSON.parse(vals[r][iEmails] || '[]');
        var sent = 0, failed = 0;
        emails.forEach(function(em){
          if (!em.emailTo) { failed++; return; }
          try {
            MailApp.sendEmail({
              to: em.emailTo, subject: em.subject,
              htmlBody: em.bodyHtml, name: 'Duemilamusei',
              replyTo: 'bandi@duemilamusei.it'
            });
            em.status = 'sent'; em.sentAt = new Date().toISOString();
            sent++;
            _roc_logOutreach_(batchId, em, 'sent');
          } catch(e) {
            em.status = 'failed'; em.error = e.message;
            failed++;
            _roc_logOutreach_(batchId, em, 'failed');
          }
        });
        sh.getRange(r + 1, iStatus + 1).setValue(failed === 0 ? 'sent' : 'partial_sent');
        sh.getRange(r + 1, iAppr + 1).setValue(new Date().toISOString());
        sh.getRange(r + 1, iSent + 1).setValue(new Date().toISOString());
        sh.getRange(r + 1, iApprBy + 1).setValue(approverEmail || Session.getActiveUser().getEmail() || '');
        sh.getRange(r + 1, iEmails + 1).setValue(JSON.stringify(emails));
        return { ok: true, batchId: batchId, sent: sent, failed: failed };
      }
    }
    return { ok: false, error: 'batch ' + batchId + ' non trovato' };
  } catch(e) { return { ok: false, error: e.message }; }
}

function _roc_logOutreach_(batchId, email, status) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ROC_OUTREACH_SHEET);
    if (!sh) {
      sh = ss.insertSheet(ROC_OUTREACH_SHEET);
      sh.appendRow(['timestamp','batch_id','museo_id','museo_nome','email_to','status','match_score','followup_due','esito']);
      sh.setFrozenRows(1);
    }
    var due = new Date(); due.setDate(due.getDate() + 14);
    sh.appendRow([
      new Date().toISOString(),
      batchId, email.museoId, email.museoNome, email.emailTo,
      status, email.matchScore,
      due.toISOString(), ''
    ]);
  } catch(e) { Logger.log('_roc_logOutreach_ err: ' + e.message); }
}

// ============================================================================
// SETUP DATABASE MUSEI (chiamato una-tantum)
// ============================================================================

function roc_setupMuseiDB() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ROC_MUSEI_SHEET);
    if (sh) return { ok: true, status: 'already_exists', righe: sh.getLastRow() - 1 };
    sh = ss.insertSheet(ROC_MUSEI_SHEET);
    var headers = [
      'id','nome','ente_gestore','tipologia','regione','provincia','comune','indirizzo',
      'visitatori_anno','fonte_dato','email_direzionale','sito_web','telefono',
      'relazione_dm','data_ultimo_contatto','esito_ultimo_contatto','note',
      'matrix_compilato','matrix_uuid'
    ];
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#9C6A36').setFontColor('#FFFFFF');
    sh.setColumnWidth(2, 280);  // nome
    sh.setColumnWidth(11, 260); // email
    return { ok: true, status: 'created', headers: headers };
  } catch(e) { return { ok: false, error: e.message }; }
}

/**
 * v4.18.29 — Importa MuseiDB_v1.tsv da Drive nel foglio MuseiDB_v1.
 *
 * PRE-REQUISITO: il file MuseiDB_v1.tsv deve essere uploadato in Drive
 * (qualunque cartella, basta che il proprietario sia l'utente che esegue).
 *
 * Comportamento idempotente: salta righe con `id` già presente nel foglio,
 * inserisce solo i nuovi. Garantisce header coerente.
 *
 * @param {Object} [opts] {fileName, fileId, dryRun}
 * @return {Object} { ok, righeImportate, righeSaltate, totaleNelFile, dryRun }
 */
function roc_importMuseiDB_fromDrive(opts) {
  opts = opts || {};
  var fileName = opts.fileName || 'MuseiDB_v1.tsv';
  var dryRun = opts.dryRun === true;
  try {
    var file = null;
    if (opts.fileId) {
      file = DriveApp.getFileById(opts.fileId);
    } else {
      var it = DriveApp.getFilesByName(fileName);
      if (!it.hasNext()) {
        return { ok: false, error: 'File "' + fileName + '" non trovato in Drive. Caricalo (qualunque cartella) e riesegui.' };
      }
      file = it.next();
      if (it.hasNext()) {
        return { ok: false, error: 'Trovati più file "' + fileName + '" in Drive. Specifica fileId per disambiguare.' };
      }
    }
    var content = file.getBlob().getDataAsString('UTF-8');
    return roc_importMuseiDB_fromString({ tsv: content, dryRun: dryRun, fileName: file.getName(), fileId: file.getId() });
  } catch(e) {
    return { ok: false, error: 'Errore lettura Drive: ' + e.message };
  }
}

/**
 * v4.18.29 — Importa MuseiDB da una stringa TSV (Tab Separated Values).
 * Utile per debug o input diretto. Vedi anche roc_importMuseiDB_fromDrive.
 *
 * @param {Object} opts {tsv, dryRun}
 */
function roc_importMuseiDB_fromString(opts) {
  opts = opts || {};
  if (!opts.tsv) return { ok: false, error: 'opts.tsv (stringa) richiesto' };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(ROC_MUSEI_SHEET);
    if (!sh) {
      // Crea il foglio se mancante
      var setup = roc_setupMuseiDB();
      if (!setup.ok) return { ok: false, error: 'Setup foglio fallito: ' + setup.error };
      sh = ss.getSheetByName(ROC_MUSEI_SHEET);
    }

    // Parse TSV (split per riga e per tab, trim righe vuote)
    var righe = opts.tsv.split(/\r?\n/).map(function(l){ return l; });
    while (righe.length && !righe[righe.length-1].trim()) righe.pop(); // rimuove righe vuote in coda
    if (righe.length < 2) return { ok: false, error: 'TSV vuoto o solo header (' + righe.length + ' righe)' };

    var headerTsv = righe[0].split('\t').map(function(h){ return String(h || '').trim().toLowerCase(); });
    var iIdTsv = headerTsv.indexOf('id');
    if (iIdTsv < 0) return { ok: false, error: 'Header "id" mancante nel TSV' };

    // Header attuali del foglio (per ordine colonne)
    var existingHeader = sh.getDataRange().getValues()[0].map(function(h){ return String(h || '').trim().toLowerCase(); });
    if (existingHeader.length < 19) {
      return { ok: false, error: 'Foglio MuseiDB_v1 ha header < 19 colonne. Ricreare con roc_setupMuseiDB().' };
    }

    // Mappa indice colonna TSV → indice colonna foglio
    var colMap = headerTsv.map(function(h){ return existingHeader.indexOf(h); });

    // Set degli ID già presenti nel foglio (dedup)
    var existingIds = {};
    var existingVals = sh.getDataRange().getValues();
    var iIdSheet = existingHeader.indexOf('id');
    for (var r = 1; r < existingVals.length; r++) {
      if (existingVals[r][iIdSheet]) existingIds[String(existingVals[r][iIdSheet]).trim()] = true;
    }

    // Costruisci batch nuove righe
    var batch = [];
    var saltati = 0;
    for (var i = 1; i < righe.length; i++) {
      var cells = righe[i].split('\t');
      var id = String(cells[iIdTsv] || '').trim();
      if (!id) { saltati++; continue; }
      if (existingIds[id]) { saltati++; continue; }

      var rowOut = new Array(existingHeader.length).fill('');
      cells.forEach(function(val, idx) {
        var target = colMap[idx];
        if (target >= 0) {
          // Cast specifici per visitatori_anno (numero) e matrix_compilato (bool)
          var headerName = headerTsv[idx];
          if (headerName === 'visitatori_anno') {
            var n = parseInt(String(val).replace(/[^\d-]/g,''), 10);
            rowOut[target] = isNaN(n) ? '' : n;
          } else if (headerName === 'matrix_compilato') {
            rowOut[target] = String(val).toUpperCase() === 'TRUE';
          } else {
            rowOut[target] = String(val || '').trim();
          }
        }
      });
      batch.push(rowOut);
      existingIds[id] = true; // evita dup nel batch stesso
    }

    if (!opts.dryRun && batch.length > 0) {
      var lastRow = sh.getLastRow();
      sh.getRange(lastRow + 1, 1, batch.length, existingHeader.length).setValues(batch);
    }

    return {
      ok: true,
      dryRun: !!opts.dryRun,
      righeImportate: opts.dryRun ? 0 : batch.length,
      righePronte: batch.length,
      righeSaltate: saltati,
      totaleNelFile: righe.length - 1,
      fileName: opts.fileName || null
    };
  } catch(e) {
    return { ok: false, error: 'Errore import: ' + e.message };
  }
}

// ============================================================================
// SEED — 20 musei pilota per test ROC (regioni target Duemilamusei)
// ============================================================================

function roc_seedMuseiPilota() {
  var setup = roc_setupMuseiDB();
  if (!setup.ok && setup.status !== 'already_exists') return setup;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ROC_MUSEI_SHEET);
  var existIds = {};
  if (sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
    vals.forEach(function(r){ if (r[0]) existIds[r[0]] = true; });
  }

  var SEED = [
    ['m01','Museo Civico Palazzo Mosca','Comune di Pesaro','museo civico','Marche','PU','Pesaro','','20000-100000','D6','','https://www.pesaromusei.it','','nessuna','','','Target pilota Marche',false,''],
    ['m02','Museo della Città','Comune di Rimini','museo civico','Emilia-Romagna','RN','Rimini','','20000-100000','D6','','https://www.museicomunalirimini.it','','nessuna','','','Target pilota ER',false,''],
    ['m03','Pinacoteca Civica','Comune di Fano','museo civico','Marche','PU','Fano','','5000-20000','D6','','','','nessuna','','','Target pilota Marche',false,''],
    ['m04','Museo Archeologico Nazionale','MiC','museo statale','Marche','PU','Urbino','','20000-100000','D6','','','','nessuna','','','Target pilota Marche',false,''],
    ['m05','Galleria Nazionale delle Marche','MiC','museo statale','Marche','PU','Urbino','','100000-500000','D6','','https://www.gallerianazionalemarche.it','','nessuna','','','Palazzo Ducale',false,''],
    ['m06','Museo della Ceramica','Comune di Grottaglie','museo civico','Puglia','TA','Grottaglie','','5000-20000','D6','','','','progetto_in_corso','','','Castello Episcopio - progetto attivo',false,''],
    ['m07','Museo Civico Medievale','Comune di Bologna','museo civico','Emilia-Romagna','BO','Bologna','','20000-100000','D6','','https://www.museibologna.it','','nessuna','','','Target pilota ER',false,''],
    ['m08','MUSE','Provincia Autonoma Trento','fondazione','Trentino-Alto Adige','TN','Trento','','oltre 500000','D6','','https://www.muse.it','','nessuna','','','Benchmark accessibilita',false,''],
    ['m09','Museo della Scienza','Comune di Milano','fondazione','Lombardia','MI','Milano','','oltre 500000','D6','','https://www.museoscienza.org','','nessuna','','','Benchmark digital',false,''],
    ['m10','Castello di Rivoli','Regione Piemonte','fondazione','Piemonte','TO','Rivoli','','100000-500000','D6','','https://www.castellodirivoli.org','','nessuna','','','Target arte contemporanea',false,''],
    ['m11','Museo Civico di Recanati','Comune di Recanati','museo civico','Marche','MC','Recanati','','5000-20000','D6','','','','cliente_attivo','','','Gestione Duemilamusei 2017-2027',false,''],
    ['m12','Museo dei Brettii','Comune di Cosenza','museo civico','Calabria','CS','Cosenza','','5000-20000','D6','','','','nessuna','','','Target Sud',false,''],
    ['m13','Pinacoteca di Brera','MiC','museo statale','Lombardia','MI','Milano','','oltre 500000','D6','','https://pinacotecabrera.org','','nessuna','','','Benchmark nazionale',false,''],
    ['m14','Museo Tattile Omero','Comune di Ancona','museo civico','Marche','AN','Ancona','','20000-100000','D6','','https://www.museoomero.it','','nessuna','','','Benchmark accessibilita sensoriale',false,''],
    ['m15','Palazzo Buonaccorsi','Comune di Macerata','museo civico','Marche','MC','Macerata','','20000-100000','D6','','','','cliente_attivo','','','Gestione Duemilamusei 2018-2027',false,''],
    ['m16','Museo della Carta','Comune di Fabriano','museo civico','Marche','AN','Fabriano','','5000-20000','D6','','','','nessuna','','','Target pilota Marche',false,''],
    ['m17','MART','Provincia Autonoma Trento','fondazione','Trentino-Alto Adige','TN','Rovereto','','100000-500000','D6','','https://www.mart.trento.it','','nessuna','','','Benchmark arte contemporanea',false,''],
    ['m18','Museo Civico Archeologico','Comune di Bologna','museo civico','Emilia-Romagna','BO','Bologna','','20000-100000','D6','','https://www.museibologna.it','','nessuna','','','Target ER',false,''],
    ['m19','Museo del Territorio','Comune di San Lorenzo in Campo','museo civico','Marche','PU','San Lorenzo in Campo','','meno di 5000','D6','','','','cliente_attivo','','','Fondato da Silvano Straccini',false,''],
    ['m20','Museo Nazionale Rossini','Comune di Pesaro','museo statale','Marche','PU','Pesaro','','20000-100000','D6','','https://www.museonazionalerossini.it','','cliente_attivo','','','Progettazione Duemilamusei 2019',false,'']
  ];

  var inseriti = 0;
  SEED.forEach(function(row) {
    if (existIds[row[0]]) return; // già presente
    sh.appendRow(row);
    inseriti++;
  });

  return { ok: true, inseriti: inseriti, totale: sh.getLastRow() - 1 };
}

// ============================================================================
// TEST
// ============================================================================

function testROC() {
  Logger.log('Setup database musei:');
  Logger.log(JSON.stringify(roc_setupMuseiDB(), null, 2));
  Logger.log('Triage bando di test:');
  var test = roc_triageBando({
    id: 'TEST001',
    titolo: 'PNRR M1C3 Accessibilita musei',
    ente: 'MiC',
    importo: 250000,
    scadenza: new Date(Date.now() + 60 * 86400000),
    livello: 'nazionale',
    settore: 'accessibilita'
  });
  Logger.log(JSON.stringify(test, null, 2));
}

// ============================================================================
// FINE MODULO ROC_v1.gs
// ============================================================================
