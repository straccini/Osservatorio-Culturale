/**
 * ============================================================================
 *  QA_Notturna.js — "Binario B": QA notturna nativa GAS (no repo / no clasp / no rete agente)
 * ============================================================================
 *  Autore: Claude (Cowork) per Silvano Straccini / Sinopia — 2026-06-26
 *
 *  Scopo: coprire le Fasi 4 (Fonti) e 6 (Chiusura+email) della procedura
 *  verifica-code-mod quando il run notturno gira in un ambiente SENZA accesso
 *  a git/clasp/repo. Tutto gira dentro Apps Script (accesso pieno a fogli +
 *  rete Google + MailApp), quindi non dipende dalla whitelist dell'agente.
 *
 *  Le Fasi 1-3 e 5 (snapshot git, diff codice, harness node, riparazioni)
 *  richiedono il repo e restano alla sessione presidiata.
 *
 *  Funzioni pubbliche (selezionabili da editor GAS):
 *    qaNotturnaSetupTrigger()  — installa il trigger giornaliero (23:30)
 *    qaNotturnaGAS()           — esegue e INVIA il report via email (target trigger)
 *    qaNotturnaPreview()       — esegue e ritorna il report SENZA inviare email (test sicuro)
 * ============================================================================
 */

var QA_NOTTURNA_ORA = 23;            // ora del trigger giornaliero
var QA_NOTTURNA_DEST_DEFAULT = 's.straccini@gmail.com';

// ----------------------------------------------------------------------------
// TRIGGER
// ----------------------------------------------------------------------------
function qaNotturnaSetupTrigger() {
  var trovati = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'qaNotturnaGAS') { ScriptApp.deleteTrigger(t); trovati++; }
  });
  try {
    ScriptApp.newTrigger('qaNotturnaGAS').timeBased().everyDays(1).atHour(QA_NOTTURNA_ORA).create();
  } catch (e) {
    var tot = ScriptApp.getProjectTriggers().length;
    Logger.log('qaNotturnaSetupTrigger ERRORE: ' + e.message + ' (trigger presenti: ' + tot + '/20). Esegui qaListaTrigger() e poi qaDeduplicaTrigger() per liberare slot.');
    return { ok: false, error: e.message, triggerPresenti: tot, suggerimento: 'Esegui qaListaTrigger() poi qaDeduplicaTrigger() per liberare uno slot, quindi ripeti.' };
  }
  Logger.log('qaNotturnaSetupTrigger: rimossi ' + trovati + ', creato trigger giornaliero alle ' + QA_NOTTURNA_ORA + ':00');
  return { ok: true, rimossi: trovati, ora: QA_NOTTURNA_ORA };
}

/** Diagnostico (sola lettura): elenca tutti i trigger del progetto. GAS ne consente max 20. */
function qaListaTrigger() {
  var ts = ScriptApp.getProjectTriggers();
  var conteggio = {};
  var lista = ts.map(function(t) {
    var fn = t.getHandlerFunction();
    conteggio[fn] = (conteggio[fn] || 0) + 1;
    return { handler: fn, tipo: String(t.getEventType()), id: t.getUniqueId() };
  });
  var dup = Object.keys(conteggio).filter(function(k) { return conteggio[k] > 1; })
    .map(function(k) { return k + ' ×' + conteggio[k]; });
  var rep = { totale: ts.length, max: 20, duplicati: dup, perHandler: conteggio, trigger: lista };
  Logger.log('qaListaTrigger: ' + JSON.stringify(rep, null, 2));
  return rep;
}

/** Rimuove i trigger DUPLICATI (stesso handler più volte), tenendone uno per handler. Reversibile ricreando il trigger. */
function qaDeduplicaTrigger() {
  var visti = {}, rimossi = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (visti[fn]) { ScriptApp.deleteTrigger(t); rimossi.push(fn); }
    else { visti[fn] = true; }
  });
  var tot = ScriptApp.getProjectTriggers().length;
  Logger.log('qaDeduplicaTrigger: rimossi ' + rimossi.length + ' duplicati → ora ' + tot + '/20. ' + JSON.stringify(rimossi));
  return { ok: true, rimossi: rimossi, rimanenti: tot };
}

// ----------------------------------------------------------------------------
// ENTRYPOINT — esegue e invia
// ----------------------------------------------------------------------------
function qaNotturnaGAS() {
  var rep = _qaEsegui_();
  try {
    var dest = _qaDestinatario_();
    MailApp.sendEmail({
      to: dest,
      subject: 'QA Osservatorio Culturale — report notturno ' + rep.data,
      htmlBody: _qaEmailHtml_(rep)
    });
    rep.emailInviata = dest;
    Logger.log('qaNotturnaGAS: report inviato a ' + dest);
  } catch (e) {
    rep.errori.push('Invio email fallito: ' + e.message);
    Logger.log('qaNotturnaGAS email err: ' + e.message);
  }
  return rep;
}

/** Test sicuro: esegue ma NON invia email. */
function qaNotturnaPreview() {
  var rep = _qaEsegui_();
  Logger.log(JSON.stringify(rep, null, 2));
  return rep;
}

// ----------------------------------------------------------------------------
// CORE
// ----------------------------------------------------------------------------
function _qaEsegui_() {
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var rep = {
    data: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    ora: Utilities.formatDate(new Date(), tz, 'HH:mm'),
    fonti: null,
    conteggi: null,
    integrita: null,
    scanHealth: null,
    errori: []
  };

  // --- FASE 4a: salute fonti (letture foglio, niente rete) ---
  try {
    var f = { morteRss: null, feedPerTipo: null };
    if (typeof anteprimaFontiMorte === 'function') {
      var m = anteprimaFontiMorte();
      if (m && m.ok) f.morteRss = { candidate: m.candidate, fonti: (m.fonti || []).slice(0, 20) };
    }
    if (typeof verificaFontiFeed === 'function') {
      var vf = verificaFontiFeed();
      if (vf) f.feedPerTipo = vf.feedPerTipo;
    }
    rep.fonti = f;
  } catch (e) { rep.errori.push('Fonti: ' + e.message); }

  // --- FASE 4b: conteggi categoria (tot + ultimi 7/30 gg) ---
  try {
    rep.conteggi = {
      news:    _qaCount_(_qaSheet_(_qaName_('ITEMS', 'Items')), ['DataAcquisizione', 'DataPubblicazione', 'Data'], 'Archiviato'),
      podcast: _qaCountPodcast_(false),
      video:   _qaCountPodcast_(true),
      libri:   _qaCount_(_qaSheet_(_qaName_('LIBRI', 'Pubblicazioni')), ['DataAggiunta', 'Data'], null),
      bandi:   _qaCountBandi_()
    };
  } catch (e) { rep.errori.push('Conteggi: ' + e.message); }

  // --- FASE base: integrità fogli chiave ---
  try {
    var attesi = [_qaName_('ITEMS', 'Items'), _qaName_('PODCAST', 'Podcast'), _qaName_('LIBRI', 'Pubblicazioni'), 'FontiFeed', 'ScanLog'];
    var ss = getMainSS();
    rep.integrita = attesi.map(function(n) {
      var sh = ss.getSheetByName(n);
      return { foglio: n, presente: !!sh, righe: sh ? Math.max(0, sh.getLastRow() - 1) : 0 };
    });
  } catch (e) { rep.errori.push('Integrità: ' + e.message); }

  // --- FASE 4c: salute scansioni da FontiFeed ---
  // NB: lo sheet 'ScanLog' e' DEPRECATO (nessun chiamante reale di _logScan_). Lo scanner
  // attuale (NewsScanner.scanSources) scrive gli esiti nelle colonne di FontiFeed via
  // updateFeedSourceStats: UltimaScan / UltimoEsito / NRecordTotali / FailConsecutivi.
  try {
    rep.scanHealth = _qaScanHealthFontiFeed_();
  } catch (e) { rep.errori.push('ScanHealth: ' + e.message); }

  return rep;
}

/** Salute scansioni leggendo le colonne di stato di FontiFeed (sostituisce ScanLog deprecato). */
function _qaScanHealthFontiFeed_() {
  var sh = _qaSheet_('FontiFeed');
  if (!sh || sh.getLastRow() < 2) return { feed: 0 };
  var v = sh.getDataRange().getValues(); var h = v[0];
  function c(n) { return h.indexOf(n); }
  var iAtt = c('Attiva'), iScan = c('UltimaScan'), iEsito = c('UltimoEsito');
  var now = Date.now(), tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var tot = 0, attive = 0, scan48 = 0, vuote = 0, errore = 0, ultimaScan = null, perEsito = {};
  for (var r = 1; r < v.length; r++) {
    if (!v[r][0]) continue;
    tot++;
    if (iAtt >= 0 && (v[r][iAtt] === true || String(v[r][iAtt]).toUpperCase() === 'TRUE')) attive++;
    var es = String((iEsito >= 0 ? v[r][iEsito] : '') || '');
    if (es) perEsito[es] = (perEsito[es] || 0) + 1;
    if (es.toUpperCase().indexOf('EMPTY') === 0) vuote++;
    if (es.toUpperCase().indexOf('ERROR') === 0) errore++;
    var d = iScan >= 0 ? _qaParseDate_(v[r][iScan]) : null;
    if (d) { if (!ultimaScan || d > ultimaScan) ultimaScan = d; if ((now - d.getTime()) / 3600000 <= 48) scan48++; }
  }
  return {
    feed: tot, attive: attive, scanUlt48h: scan48, esitoEmpty: vuote, esitoError: errore,
    ultimaScan: ultimaScan ? Utilities.formatDate(ultimaScan, tz, 'yyyy-MM-dd HH:mm') : null,
    perEsito: perEsito
  };
}

/**
 * Diagnosi ON-DEMAND delle fonti RSS morte (NRecordTotali=0): fetcha davvero ogni feed
 * (UrlFetchApp, lato GAS) e classifica il motivo. Lanciare da editor GAS quando serve.
 * @param {number} maxFeed limite feed da analizzare (default 40)
 */
function qaDiagnosiFontiMorte(maxFeed) {
  var sh = _qaSheet_('FontiFeed');
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'FontiFeed assente o vuoto' };
  var v = sh.getDataRange().getValues(); var h = v[0];
  function c(n) { return h.indexOf(n); }
  var iNome = c('Nome'), iTipo = c('Tipo'), iUrl = c('URL_Feed'), iAtt = c('Attiva'), iTot = c('NRecordTotali');
  var lim = Number(maxFeed) || 40, out = [], classi = {};
  for (var r = 1; r < v.length && out.length < lim; r++) {
    if (!v[r][0]) continue;
    if (String(v[r][iTipo]).toLowerCase() !== 'rss') continue;
    if (!(v[r][iAtt] === true || String(v[r][iAtt]).toUpperCase() === 'TRUE')) continue;
    if (Number(v[r][iTot] || 0) > 0) continue; // solo le morte
    var nome = String(v[r][iNome] || ''), url = String(v[r][iUrl] || ''), cls = '?', det = '';
    try {
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, deadline: 8, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher/4.0)' } });
      var code = resp.getResponseCode();
      if (code !== 200) { cls = 'HTTP ' + code; }
      else {
        var ct = resp.getContentText('UTF-8') || '';
        if (ct.indexOf('<?xml') < 0 && ct.indexOf('<rss') < 0 && ct.indexOf('<feed') < 0) { cls = 'NON-RSS (HTML/blocco)'; det = ct.substring(0, 50).replace(/\s+/g, ' '); }
        else { cls = 'RSS-OK-ma-vuoto'; det = 'feed valido, 0 record: rivedere parsing/filtro'; }
      }
    } catch (e) { cls = 'IRRAGGIUNGIBILE'; det = String(e.message).substring(0, 60); }
    classi[cls] = (classi[cls] || 0) + 1;
    out.push({ nome: nome, classe: cls, dettaglio: det, url: url });
    Utilities.sleep(150);
  }
  var rep = { ok: true, analizzate: out.length, perClasse: classi, fonti: out };
  Logger.log('qaDiagnosiFontiMorte: ' + JSON.stringify(rep, null, 2));
  return rep;
}

/**
 * Applica i fix alle fonti morte: corregge gli URL recuperabili (testandoli live PRIMA di
 * scrivere) e disattiva (Attiva=FALSE, reversibile) quelle morte/senza-RSS.
 * Mappa curata dalla diagnosi del 2026-06-26.
 * @param {boolean} dryRun se true (default) mostra solo il piano senza scrivere.
 */
function qaApplicaFixFonti(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var sh = _qaSheet_('FontiFeed');
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'FontiFeed assente o vuoto' };
  var v = sh.getDataRange().getValues(); var h = v[0];
  function c(n) { return h.indexOf(n); }
  var iNome = c('Nome'), iUrl = c('URL_Feed'), iAtt = c('Attiva'), iFail = c('FailConsecutivi'), iNote = c('Note');

  // URL corretti VERIFICATI (Artribune/Exibart testati ok; Finestre/Arte.it dal feed-hub ufficiale)
  var CORREZIONI = {
    'Artribune Digit.': 'https://www.artribune.com/feed/',
    'Exibart Mostre': 'https://www.exibart.com/feed/',
    "Finestre sull'Arte": 'https://www.finestresullarte.info/finestresullarte.xml',
    'Arte.it Mostre': 'https://www.arte.it/rss/feed_eventi.php?lang=it'
  };
  // Morte/senza-RSS/garbage → disattivazione reversibile
  var DISATTIVA = ['Artribune Mostre', 'Artefatti', 'Flash Art', 'CCW Welfare Cult.', 'MiC Comunicati',
    'ANCI Cultura', 'FAI - Fondo Ambiente', "Il Giornale dell'Arte", 'Il Giornale delle Fondazioni',
    "L'Eurispes Cult.", 'MuseumNext Dig.', 'CORDIS Heritage', 'Itinerari Arte', 'ArtNews Exhib.',
    'Artnet Exhib.', 'CoE Culture', 'FASI Europa Creat.', 'EuropaFacile Cult.', 'Patrimonio Culturale ER',
    'Treccani Magazine', 'Apollo Magazine', 'Touring Club Italiano', 'Europeana Blog'];

  var azioni = [];
  for (var r = 1; r < v.length; r++) {
    var nome = String(v[r][iNome] || ''); if (!nome) continue;
    var rr = r + 1;
    if (CORREZIONI[nome] !== undefined) {
      var nuovo = CORREZIONI[nome], valido = false, motivo = '';
      try {
        var resp = UrlFetchApp.fetch(nuovo, { muteHttpExceptions: true, followRedirects: true, deadline: 8, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher/4.0)' } });
        if (resp.getResponseCode() === 200) {
          var ct = resp.getContentText('UTF-8') || '';
          valido = (ct.indexOf('<?xml') >= 0 || ct.indexOf('<rss') >= 0 || ct.indexOf('<feed') >= 0);
          motivo = valido ? 'RSS valido' : '200 ma non-RSS';
        } else motivo = 'HTTP ' + resp.getResponseCode();
      } catch (e) { motivo = 'IRRAGGIUNGIBILE: ' + String(e.message).substring(0, 40); }
      if (valido && !dryRun) {
        sh.getRange(rr, iUrl + 1).setValue(nuovo);
        if (iAtt >= 0) sh.getRange(rr, iAtt + 1).setValue(true);
        if (iFail >= 0) sh.getRange(rr, iFail + 1).setValue(0);
        if (iNote >= 0) sh.getRange(rr, iNote + 1).setValue('URL corretto QA 2026-06-26 (prec: ' + String(v[r][iUrl]).substring(0, 50) + ')');
      }
      azioni.push({ nome: nome, azione: valido ? 'CORREGGI' : 'SALTATO (test fallito)', nuovoUrl: nuovo, test: motivo });
    } else if (DISATTIVA.indexOf(nome) >= 0) {
      if (!dryRun && iAtt >= 0) sh.getRange(rr, iAtt + 1).setValue(false);
      azioni.push({ nome: nome, azione: 'DISATTIVA', test: '' });
    }
  }
  var rep = { ok: true, dryRun: dryRun, totAzioni: azioni.length, corretti: azioni.filter(function(a){return a.azione==='CORREGGI';}).length, disattivati: azioni.filter(function(a){return a.azione==='DISATTIVA';}).length, azioni: azioni };
  Logger.log('qaApplicaFixFonti(dryRun=' + dryRun + '): ' + JSON.stringify(rep, null, 2));
  return rep;
}

// ----------------------------------------------------------------------------
// HELPER conteggi
// ----------------------------------------------------------------------------
function _qaName_(key, fallback) {
  try { if (typeof SH !== 'undefined' && SH && SH[key]) return SH[key]; } catch (_) {}
  return fallback;
}
function _qaSheet_(name) { try { return getMainSS().getSheetByName(name); } catch (_) { return null; } }

function _qaParseDate_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v === null || v === undefined || v === '') return null;
  var s = String(v).trim();
  // Formato italiano gg/mm/aaaa o gg-mm-aaaa: interpretato PRIMA di new Date (che userebbe mm/gg)
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    var dd = +m[1], mm = +m[2], yy = +m[3]; if (yy < 100) yy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      var d2 = new Date(yy, mm - 1, dd);
      if (!isNaN(d2.getTime())) return d2;
    }
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Prima data valida tra più colonne candidate, valutata PER RIGA (gestisce colonne vuote). */
function _qaRowDate_(row, idxs) {
  for (var k = 0; k < idxs.length; k++) {
    if (idxs[k] < 0) continue;
    var d = _qaParseDate_(row[idxs[k]]);
    if (d) return d;
  }
  return null;
}

/** Conta righe totali + ultimi 7/30gg di un foglio, escludendo gli archiviati se indicato. */
function _qaCount_(sh, dateCols, archiviatoCol) {
  if (!sh || sh.getLastRow() < 2) return { tot: 0, g7: 0, g30: 0 };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var idxs = dateCols.map(function(n) { return h.indexOf(n); });
  var iArch = archiviatoCol ? h.indexOf(archiviatoCol) : -1;
  var now = Date.now(), tot = 0, g7 = 0, g30 = 0;
  for (var r = 1; r < v.length; r++) {
    if (!v[r][0]) continue;
    if (iArch >= 0) { var a = v[r][iArch]; if (a === true || String(a).toLowerCase() === 'true' || String(a).toLowerCase() === 'archiviato') continue; }
    tot++;
    var d = _qaRowDate_(v[r], idxs);
    if (d) { var gg = (now - d.getTime()) / 86400000; if (gg <= 7) g7++; if (gg <= 30) g30++; }
  }
  return { tot: tot, g7: g7, g30: g30 };
}

/** Podcast/Video dal foglio Podcast (video = ID che inizia con VID). */
function _qaCountPodcast_(soloVideo) {
  var sh = _qaSheet_(_qaName_('PODCAST', 'Podcast'));
  if (!sh || sh.getLastRow() < 2) return { tot: 0, g7: 0, g30: 0 };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var idxs = ['DataPubblicazione', 'DataRilevamento', 'Data'].map(function(n) { return h.indexOf(n); });
  var iStato = h.indexOf('StatoRecord');
  var now = Date.now(), tot = 0, g7 = 0, g30 = 0;
  for (var r = 1; r < v.length; r++) {
    var id = String(v[r][0] || ''); if (!id) continue;
    var isVid = id.indexOf('VID') === 0;
    if (soloVideo !== isVid) continue;
    if (iStato >= 0 && String(v[r][iStato]).toLowerCase() === 'archiviato') continue;
    tot++;
    var d = _qaRowDate_(v[r], idxs);
    if (d) { var gg = (now - d.getTime()) / 86400000; if (gg <= 7) g7++; if (gg <= 30) g30++; }
  }
  return { tot: tot, g7: g7, g30: g30 };
}

/** Bandi dal foglio standalone RADAR BANDI (esclude archiviati). */
function _qaCountBandi_() {
  var sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
  if (!sh || sh.getLastRow() < 2) return { tot: 0, g7: 0, g30: 0 };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var idxs = ['Data_Rilevamento', 'DataRilevamento', 'Data'].map(function(n) { return h.indexOf(n); });
  if (idxs.every(function(i) { return i < 0; })) idxs = [0]; // RADAR: col 1 = Data_Rilevamento
  var iStato = h.indexOf('StatoRecord');
  var now = Date.now(), tot = 0, g7 = 0, g30 = 0;
  for (var r = 1; r < v.length; r++) {
    if (!v[r][1] && !v[r][0]) continue; // titolo o data presenti
    if (iStato >= 0 && String(v[r][iStato]).toLowerCase() === 'archiviato') continue;
    tot++;
    var d = _qaRowDate_(v[r], idxs);
    if (d) { var gg = (now - d.getTime()) / 86400000; if (gg <= 7) g7++; if (gg <= 30) g30++; }
  }
  return { tot: tot, g7: g7, g30: g30 };
}

function _qaDestinatario_() {
  try {
    var csv = PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || '';
    var first = csv.split(',')[0].trim();
    if (first && first.indexOf('@') > 0) return first;
  } catch (_) {}
  return QA_NOTTURNA_DEST_DEFAULT;
}

// ----------------------------------------------------------------------------
// EMAIL HTML
// ----------------------------------------------------------------------------
function _qaEmailHtml_(rep) {
  function row(label, c) {
    c = c || { tot: 0, g7: 0, g30: 0 };
    return '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;color:#1a1a1a">' + label + '</td>'
      + '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#1a1a1a">' + c.tot + '</td>'
      + '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#3F7A5E">+' + c.g7 + '</td>'
      + '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#6E6A62">+' + c.g30 + '</td></tr>';
  }
  var co = rep.conteggi || {};
  var fonti = rep.fonti || {};
  var morte = fonti.morteRss ? fonti.morteRss.candidate : '—';
  var feed = fonti.feedPerTipo ? (fonti.feedPerTipo.rss + ' rss / ' + fonti.feedPerTipo.podcast + ' pod / ' + fonti.feedPerTipo.video + ' video') : '—';
  var integr = (rep.integrita || []).map(function(i) {
    return '<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border-radius:10px;font-size:11px;background:' + (i.presente ? '#E5EFE7;color:#3F7A5E' : '#F8E0E0;color:#B3261E') + '">' + i.foglio + ': ' + (i.presente ? i.righe : 'ASSENTE') + '</span>';
  }).join('');
  var sh2 = rep.scanHealth || {};
  var scan = '<div style="font-size:12.5px;color:#3A3A3C;line-height:1.6">Feed: <b>' + (sh2.feed || 0) + '</b> (' + (sh2.attive || 0) + ' attivi) &middot; scansionati nelle ultime 48h: <b>' + (sh2.scanUlt48h || 0) + '</b> &middot; ultima scansione: <b>' + (sh2.ultimaScan || '—') + '</b><br>Esiti registrati &mdash; EMPTY: <b>' + (sh2.esitoEmpty || 0) + '</b> &middot; ERROR: <b>' + (sh2.esitoError || 0) + '</b></div>';
  var err = rep.errori.length
    ? '<div style="margin-top:14px;padding:10px 12px;background:#FDF3F3;border:1px solid #F3C9C9;border-radius:8px;font-size:12px;color:#B3261E"><b>Anomalie raccolte (' + rep.errori.length + '):</b><br>' + rep.errori.map(function(e) { return '&bull; ' + String(e).replace(/</g, '&lt;'); }).join('<br>') + '</div>'
    : '<div style="margin-top:14px;padding:10px 12px;background:#E5EFE7;border:1px solid #BBD9C4;border-radius:8px;font-size:12px;color:#3F7A5E">Nessuna anomalia raccolta.</div>';

  return ''
    + '<div style="font-family:-apple-system,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">'
    + '<div style="background:#1a1a1a;padding:18px 22px;border-radius:12px 12px 0 0">'
    + '<div style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#E89B7C">Sinopia</div>'
    + '<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bbb;margin-top:4px">QA notturna &middot; Osservatorio Culturale &middot; ' + rep.data + ' ' + rep.ora + '</div></div>'
    + '<div style="border:1px solid #e8e5e0;border-top:none;border-radius:0 0 12px 12px;padding:18px 22px">'
    + '<p style="font-size:13px;color:#3A3A3C;margin:0 0 12px">Report automatico (Binario B nativo GAS). Copre <b>Fonti</b> e <b>conteggi/integrità</b>. Le verifiche codice/harness (Fasi 1-3,5) sono eseguite nelle sessioni presidiate.</p>'
    + '<h3 style="font-size:13px;margin:14px 0 6px;color:#8B3A1F">Contenuti per categoria</h3>'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#9A958B;font-size:11px;text-transform:uppercase;letter-spacing:.04em"><td style="padding:4px 10px">Categoria</td><td style="padding:4px 10px;text-align:right">Totale</td><td style="padding:4px 10px;text-align:right">7gg</td><td style="padding:4px 10px;text-align:right">30gg</td></tr>'
    + row('News', co.news) + row('Bandi', co.bandi) + row('Podcast', co.podcast) + row('Video', co.video) + row('Libri', co.libri)
    + '</table>'
    + '<h3 style="font-size:13px;margin:16px 0 6px;color:#8B3A1F">Fonti</h3>'
    + '<div style="font-size:13px;color:#3A3A3C">Feed attivi: <b>' + feed + '</b> &middot; Fonti RSS a 0 record (candidate morte): <b>' + morte + '</b></div>'
    + '<h3 style="font-size:13px;margin:16px 0 6px;color:#8B3A1F">Integrità fogli</h3><div>' + integr + '</div>'
    + '<h3 style="font-size:13px;margin:16px 0 6px;color:#8B3A1F">Salute scansioni (FontiFeed)</h3>' + scan
    + err
    + '</div></div>';
}
