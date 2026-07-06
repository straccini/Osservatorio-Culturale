// ============================================================================
//  AgenteQualita.js — Agenti automatici di qualità dati (bandi + fonti)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · 2026-07-06
//
//  DUE AGENTI:
//
//  1) agenteQualitaBandi() — TRIGGER GIORNALIERO (05:00)
//     Controlla OGNI bando attivo in Bandi_v5 e archivia alla fonte:
//       a) SCADUTI       — scadenza < oggi
//       b) NON PERTINENTI— junk (voci menu/legali) + non-cultura (isBandoCulturale)
//       c) SENZA LINK    — non archivia (il gate fornisce link di ricerca) ma li
//                          CONTA e li elenca nel report per il monitoraggio
//     Setup: agenteQualitaBandiSetupTrigger()
//
//  2) agenteFontiMute() — TRIGGER OGNI 5 GIORNI (07:00)
//     Rivede TUTTE le fonti news attive "mute" (0 record, esito EMPTY/ERROR,
//     o mai scansionate da >10gg) e per ciascuna DIAGNOSTICA il problema con
//     un fetch live del feed:
//       - HTTP xxx        → il server rifiuta/blocca (403 WAF, 404 morto, 5xx)
//       - NON-RSS         → l'URL risponde ma non è un feed
//       - FEED VUOTO      → feed valido ma senza <item>/<entry>
//       - FEED OK         → il feed funziona: il problema è dello SCANNER
//                           (non scansionata / mapping) — da investigare lato app
//     Invia il report email all'admin con il problema di ciascuna fonte.
//     Setup: agenteFontiMuteSetupTrigger()
//
//  3) fontiRipristinaPrimarie() — ONE-SHOT
//     Iscrive le fonti PRIMARIE con URL RSS verificati live il 2026-07-06:
//     ANSA Cultura, AgCult, ICOM Italia, ICOM International, The Art Newspaper,
//     MiC (media.beniculturali.it — 403 dal cloud, ritestato dalla rete GAS).
//     Ogni candidato ripassa dal gate fontiAggiungiFeedVerificato (HTTP+RSS+dedup).
//
//  NON DISPONIBILI (verificato 2026-07-06, nessun feed RSS pubblico):
//     FAI (404), Treccani (pagine 200 ma non feed), Touring Club (404),
//     Il Giornale dell'Arte (404), Apollo Magazine (500), Rai Cultura (404).
// ============================================================================

var AQ_DEST_DEFAULT = 's.straccini@gmail.com';

function _aqDest_() {
  try { if (typeof _qaDestinatario_ === 'function') return _qaDestinatario_(); } catch (_) {}
  return AQ_DEST_DEFAULT;
}

// ============================================================================
//  1) AGENTE QUALITÀ BANDI — giornaliero
// ============================================================================

/**
 * Scansiona Bandi_v5 e archivia scaduti / junk / non-cultura.
 * I bandi senza link NON vengono archiviati (restano consultabili via ricerca
 * del gate) ma vengono contati ed elencati nel report.
 * @param {Object} opts { dryRun:bool, email:bool }
 */
function agenteQualitaBandi(opts) {
  opts = opts || {};
  var dryRun = !!opts.dryRun;
  var rep = {
    ok: true, data: new Date().toISOString(), dryRun: dryRun,
    esaminati: 0, scaduti: 0, junk: 0, nonCultura: 0, senzaLink: 0,
    esempi: { scaduti: [], junk: [], nonCultura: [], senzaLink: [] }
  };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shName = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
    var sh = ss.getSheetByName(shName);
    if (!sh || sh.getLastRow() < 2) { rep.ok = false; rep.error = 'foglio vuoto'; return rep; }

    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function(h){ return String(h||'').trim(); });
    var iSC = head.indexOf('SettoreCultura');
    var iCPV = head.indexOf('CPV');
    var oggi = new Date(); oggi.setHours(0,0,0,0);

    var iTit  = COL_B.TITOLO - 1;
    var iSet  = COL_B.SETTORE - 1;
    var iSom  = COL_B.SOMMARIO - 1;
    var iScad = COL_B.SCADENZA - 1;
    var iStat = COL_B.STATO_RECORD - 1;
    var iUrlB = COL_B.URL_BANDO - 1;
    var iUrlE = COL_B.URL_ENTE - 1;

    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[0]) continue;
      if (String(row[iStat]||'').toLowerCase() === 'archiviato') continue;
      rep.esaminati++;

      var titolo = String(row[iTit]||'');
      var motivo = '';

      // a) SCADUTO
      var rawScad = row[iScad];
      var scad = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
      if (scad && !isNaN(scad.getTime()) && scad.getTime() < oggi.getTime()) motivo = 'scaduti';

      // b) NON PERTINENTE — junk (voci menu) poi non-cultura
      if (!motivo && typeof _bandiNonBando_ === 'function' && _bandiNonBando_({ titolo: titolo })) motivo = 'junk';
      if (!motivo && typeof isBandoCulturale === 'function') {
        var cpv = iCPV >= 0 ? String(row[iCPV]||'') : '';
        if (!isBandoCulturale(titolo, String(row[iSet]||''), String(row[iSom]||''), cpv)) motivo = 'nonCultura';
      }

      if (motivo) {
        rep[motivo]++;
        if (rep.esempi[motivo].length < 10) rep.esempi[motivo].push(titolo.substring(0, 70));
        if (!dryRun) sh.getRange(r + 1, iStat + 1).setValue('archiviato');
        continue;
      }

      // c) SENZA LINK — solo conteggio + elenco (non archivia)
      var link = String(row[iUrlB]||'').trim() || String(row[iUrlE]||'').trim();
      if (!/^https?:\/\//i.test(link)) {
        rep.senzaLink++;
        if (rep.esempi.senzaLink.length < 10) rep.esempi.senzaLink.push(titolo.substring(0, 70));
      }
    }
    if (!dryRun) SpreadsheetApp.flush();

    Logger.log('[agenteQualitaBandi] esaminati=' + rep.esaminati +
      ' archiviati: scaduti=' + rep.scaduti + ' junk=' + rep.junk +
      ' nonCultura=' + rep.nonCultura + ' | senzaLink=' + rep.senzaLink +
      (dryRun ? ' (DRY-RUN, nessuna scrittura)' : ''));

    // Email solo se ha trovato qualcosa (o se richiesta esplicitamente)
    var trovati = rep.scaduti + rep.junk + rep.nonCultura;
    if (opts.email !== false && (trovati > 0 || opts.email === true)) {
      try {
        MailApp.sendEmail({
          to: _aqDest_(),
          subject: '[OC] Agente qualità bandi — ' + trovati + ' archiviati, ' + rep.senzaLink + ' senza link',
          htmlBody: _aqEmailBandi_(rep)
        });
        rep.emailInviata = true;
      } catch (e) { rep.emailErrore = e.message; }
    }
  } catch (e) { rep.ok = false; rep.error = e.message; Logger.log('[agenteQualitaBandi] ERR: ' + e.message); }
  return rep;
}

function _aqEmailBandi_(rep) {
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  function blocco(nome, n, esempi) {
    if (!n) return '';
    var li = (esempi||[]).map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('');
    return '<h3 style="margin:14px 0 4px">' + nome + ': ' + n + '</h3><ul>' + li + '</ul>';
  }
  return '<div style="font-family:Georgia,serif;max-width:640px">' +
    '<h2>Agente qualità bandi — report</h2>' +
    '<p>Esaminati <b>' + rep.esaminati + '</b> bandi attivi' + (rep.dryRun ? ' <b>(DRY-RUN)</b>' : '') + '.</p>' +
    blocco('Scaduti archiviati', rep.scaduti, rep.esempi.scaduti) +
    blocco('Voci non-bando archiviate', rep.junk, rep.esempi.junk) +
    blocco('Non pertinenti (non cultura) archiviati', rep.nonCultura, rep.esempi.nonCultura) +
    blocco('Senza link (esposti con link di ricerca)', rep.senzaLink, rep.esempi.senzaLink) +
    '<p style="color:#888;font-size:12px">Osservatorio Culturale · agenteQualitaBandi</p></div>';
}

/** Trigger giornaliero 05:00 per agenteQualitaBandi. Idempotente. */
function agenteQualitaBandiSetupTrigger() {
  var rimossi = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'agenteQualitaBandi') { ScriptApp.deleteTrigger(t); rimossi++; }
  });
  ScriptApp.newTrigger('agenteQualitaBandi').timeBased().everyDays(1).atHour(5).create();
  Logger.log('agenteQualitaBandiSetupTrigger: attivo (05:00 daily), rimossi ' + rimossi + ' precedenti');
  return { ok: true, rimossi: rimossi };
}

// ============================================================================
//  2) AGENTE FONTI MUTE — ogni 5 giorni, diagnosi per-fonte
// ============================================================================

/**
 * Diagnostica live di UNA fonte: fetch dell'URL feed e classificazione problema.
 * @return {Object} { problema, dettaglio }
 */
function _aqDiagnosiFeed_(url) {
  url = String(url||'').trim();
  if (!/^https?:\/\//i.test(url)) return { problema: 'URL NON VALIDO', dettaglio: url || '(vuoto)' };
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true, deadline: 12,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher/4.0)' }
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      var motivo = code === 403 ? 'bloccato dal server (WAF/anti-bot)' :
                   code === 404 ? 'feed rimosso o URL cambiato' :
                   code >= 500  ? 'errore del server della fonte' : 'risposta inattesa';
      return { problema: 'HTTP ' + code, dettaglio: motivo };
    }
    var ct = resp.getContentText('UTF-8') || '';
    var head600 = ct.substring(0, 600);
    if (head600.indexOf('<?xml') < 0 && head600.indexOf('<rss') < 0 && head600.indexOf('<feed') < 0) {
      return { problema: 'NON-RSS', dettaglio: 'l\'URL risponde 200 ma non è un feed (probabile redirect a homepage)' };
    }
    var nItem = (ct.match(/<item[\s>]/gi) || []).length + (ct.match(/<entry[\s>]/gi) || []).length;
    if (nItem === 0) return { problema: 'FEED VUOTO', dettaglio: 'feed XML valido ma senza item/entry' };
    return { problema: 'FEED OK (' + nItem + ' item)', dettaglio: 'il feed funziona → problema lato scanner (scansione/mapping), non della fonte' };
  } catch (e) {
    return { problema: 'IRRAGGIUNGIBILE', dettaglio: e.message };
  }
}

/**
 * Rivede tutte le fonti news ATTIVE "mute" e diagnostica ciascuna.
 * Muta = 0 record totali, o ultimo esito EMPTY/ERROR, o mai scansionata da >10gg.
 * @param {Object} opts { email:bool } — default: invia email
 */
function agenteFontiMute(opts) {
  opts = opts || {};
  var rep = { ok: true, data: new Date().toISOString(), esaminate: 0, mute: 0, fonti: [] };
  try {
    var sh = (typeof _qaSheet_ === 'function') ? _qaSheet_('FontiFeed')
           : ((typeof getMainSS === 'function') ? getMainSS().getSheetByName('FontiFeed') : null);
    if (!sh || sh.getLastRow() < 2) { rep.ok = false; rep.error = 'FontiFeed assente/vuoto'; return rep; }

    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(function(h){ return String(h||'').trim(); });
    function c(n){ return head.indexOf(n); }
    var iNome = c('Nome'), iTipo = c('Tipo'), iUrl = c('URL_Feed'), iAtt = c('Attiva'),
        iScan = c('UltimaScan'), iEsito = c('UltimoEsito'), iTot = c('NRecordTotali'),
        iFail = c('FailConsecutivi'), iNote = c('Note');
    var oraMs = Date.now();

    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[0]) continue;
      var attiva = row[iAtt] === true || String(row[iAtt]).toUpperCase() === 'TRUE';
      if (!attiva) continue;
      rep.esaminate++;

      var tot = Number(row[iTot] || 0);
      var esito = String(row[iEsito] || '').toUpperCase();
      var scan = row[iScan];
      var scanDate = (scan instanceof Date) ? scan : (scan ? new Date(scan) : null);
      var ggScan = (scanDate && !isNaN(scanDate.getTime())) ? Math.round((oraMs - scanDate.getTime()) / 86400000) : null;

      var motivi = [];
      if (tot === 0) motivi.push('0 record raccolti');
      if (esito.indexOf('EMPTY') === 0 || esito.indexOf('ERROR') === 0) motivi.push('ultimo esito ' + esito);
      if (ggScan === null) motivi.push('mai scansionata');
      else if (ggScan > 10) motivi.push('non scansionata da ' + ggScan + 'gg');
      if (!motivi.length) continue; // fonte sana

      rep.mute++;
      var diag = _aqDiagnosiFeed_(String(row[iUrl] || ''));
      var fonte = {
        nome: String(row[iNome] || ''),
        tipo: String(row[iTipo] || ''),
        url: String(row[iUrl] || ''),
        motivi: motivi.join(' · '),
        problema: diag.problema,
        dettaglio: diag.dettaglio,
        failConsecutivi: Number(row[iFail] || 0)
      };
      rep.fonti.push(fonte);

      // Annota la diagnosi in Note (audit trail, non distruttivo)
      if (iNote >= 0) {
        try {
          var nota = '[diagnosi ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Rome', 'dd/MM') + '] ' + diag.problema;
          sh.getRange(r + 1, iNote + 1).setValue((String(row[iNote] || '') + ' ' + nota).trim().slice(-500));
        } catch (_) {}
      }
      Utilities.sleep(200); // gentile con i server
    }

    Logger.log('[agenteFontiMute] attive=' + rep.esaminate + ' mute=' + rep.mute);
    rep.fonti.forEach(function(f){ Logger.log('  · ' + f.nome + ' → ' + f.problema + ' (' + f.dettaglio + ')'); });

    if (opts.email !== false && rep.mute > 0) {
      try {
        MailApp.sendEmail({
          to: _aqDest_(),
          subject: '[OC] Fonti mute — ' + rep.mute + '/' + rep.esaminate + ' con diagnosi',
          htmlBody: _aqEmailFonti_(rep)
        });
        rep.emailInviata = true;
      } catch (e) { rep.emailErrore = e.message; }
    }
  } catch (e) { rep.ok = false; rep.error = e.message; Logger.log('[agenteFontiMute] ERR: ' + e.message); }
  return rep;
}

function _aqEmailFonti_(rep) {
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  var righe = rep.fonti.map(function(f){
    var koCol = f.problema.indexOf('FEED OK') === 0 ? '#B45309' : '#B91C1C';
    return '<tr>' +
      '<td style="padding:6px;border-bottom:1px solid #eee"><b>' + esc(f.nome) + '</b><br><span style="color:#888;font-size:11px">' + esc(f.motivi) + '</span></td>' +
      '<td style="padding:6px;border-bottom:1px solid #eee;color:' + koCol + '"><b>' + esc(f.problema) + '</b><br><span style="font-size:11px;color:#555">' + esc(f.dettaglio) + '</span></td>' +
      '</tr>';
  }).join('');
  return '<div style="font-family:Georgia,serif;max-width:680px">' +
    '<h2>Fonti mute — diagnosi (' + rep.mute + '/' + rep.esaminate + ' attive)</h2>' +
    '<p>Per ogni fonte: perché è considerata muta e qual è il problema rilevato dal test live del feed.</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
    '<tr><th style="text-align:left;padding:6px;border-bottom:2px solid #333">Fonte</th><th style="text-align:left;padding:6px;border-bottom:2px solid #333">Problema</th></tr>' +
    righe + '</table>' +
    '<p style="color:#888;font-size:12px;margin-top:14px">Legenda: <b>FEED OK</b> = il feed funziona, il problema è dello scanner interno · <b>HTTP 403</b> = il server blocca i bot · <b>HTTP 404</b> = feed rimosso, cercare nuovo URL · <b>NON-RSS</b> = l\'URL non è più un feed.</p>' +
    '<p style="color:#888;font-size:12px">Osservatorio Culturale · agenteFontiMute (ogni 5 giorni)</p></div>';
}

/** Trigger ogni 5 giorni (07:00) per agenteFontiMute. Idempotente. */
function agenteFontiMuteSetupTrigger() {
  var rimossi = 0;
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'agenteFontiMute') { ScriptApp.deleteTrigger(t); rimossi++; }
  });
  ScriptApp.newTrigger('agenteFontiMute').timeBased().everyDays(5).atHour(7).create();
  Logger.log('agenteFontiMuteSetupTrigger: attivo (ogni 5gg, 07:00), rimossi ' + rimossi + ' precedenti');
  return { ok: true, rimossi: rimossi };
}

// ============================================================================
//  3) RIPRISTINO FONTI PRIMARIE — one-shot (URL verificati live 2026-07-06)
// ============================================================================

/**
 * Iscrive le fonti primarie con feed RSS VERIFICATI live (curl, 2026-07-06).
 * Ogni candidato ripassa dal gate fontiAggiungiFeedVerificato (HTTP+RSS+dedup
 * dalla rete GAS — MiC 403 dal cloud potrebbe passare da qui).
 * Fonti senza feed reperibile (FAI, Treccani, Touring, Giornale dell'Arte,
 * Apollo, Rai Cultura) documentate nell'header del file.
 */
function fontiRipristinaPrimarie() {
  var candidati = [
    { url: 'https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml', nome: 'ANSA Cultura',          ambito: 3 }, // agenzia primaria
    { url: 'https://www.agenziacult.it/feed/',                        nome: 'AgCult',                 ambito: 5 }, // politiche culturali
    { url: 'https://www.icom-italia.org/feed/',                       nome: 'ICOM Italia',            ambito: 1 }, // musei IT
    { url: 'https://icom.museum/en/feed/',                            nome: 'ICOM International',     ambito: 1 }, // musei INT
    { url: 'https://www.theartnewspaper.com/rss.xml',                 nome: 'The Art Newspaper',      ambito: 3 }, // arte INT
    { url: 'https://media.beniculturali.it/rss',                      nome: 'MiC — Comunicati Media', ambito: 4 }  // 403 dal cloud: ritestato da GAS
  ];
  var esiti = candidati.map(function(c) {
    var r = fontiAggiungiFeedVerificato(c.url, c.nome, c.ambito, 'Primarie-verificate 2026-07');
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e){ return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('fontiRipristinaPrimarie: ' + aggiunte + '/' + candidati.length + '\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

// ============================================================================
//  SETUP UNICO — attiva entrambi gli agenti in un colpo
// ============================================================================
function agentiQualitaSetupTutto() {
  var a = agenteQualitaBandiSetupTrigger();
  var b = agenteFontiMuteSetupTrigger();
  Logger.log('agentiQualitaSetupTutto: bandi daily 05:00 ✓ · fonti mute ogni 5gg 07:00 ✓');
  return { ok: true, bandi: a, fontiMute: b };
}
