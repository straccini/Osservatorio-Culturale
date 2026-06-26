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
    scanlog: null,
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

  // --- FASE 4c: ultimi esiti ScanLog ---
  try {
    var sl = getMainSS().getSheetByName('ScanLog');
    if (sl && sl.getLastRow() >= 2) {
      var lastN = Math.min(5, sl.getLastRow() - 1);
      var vals = sl.getRange(sl.getLastRow() - lastN + 1, 1, lastN, Math.min(6, sl.getLastColumn())).getValues();
      rep.scanlog = vals.map(function(row) { return row.map(function(c) { return String(c); }).join(' · '); });
    }
  } catch (e) { rep.errori.push('ScanLog: ' + e.message); }

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

/** Conta righe totali + ultimi 7/30gg di un foglio, escludendo gli archiviati se indicato. */
function _qaCount_(sh, dateCols, archiviatoCol) {
  if (!sh || sh.getLastRow() < 2) return { tot: 0, g7: 0, g30: 0 };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var iDate = -1;
  for (var k = 0; k < dateCols.length && iDate < 0; k++) iDate = h.indexOf(dateCols[k]);
  var iArch = archiviatoCol ? h.indexOf(archiviatoCol) : -1;
  var now = Date.now(), tot = 0, g7 = 0, g30 = 0;
  for (var r = 1; r < v.length; r++) {
    if (!v[r][0]) continue;
    if (iArch >= 0) { var a = v[r][iArch]; if (a === true || String(a).toLowerCase() === 'true' || String(a).toLowerCase() === 'archiviato') continue; }
    tot++;
    if (iDate >= 0) {
      var d = _qaParseDate_(v[r][iDate]);
      if (d) { var gg = (now - d.getTime()) / 86400000; if (gg <= 7) g7++; if (gg <= 30) g30++; }
    }
  }
  return { tot: tot, g7: g7, g30: g30 };
}

/** Podcast/Video dal foglio Podcast (video = ID che inizia con VID). */
function _qaCountPodcast_(soloVideo) {
  var sh = _qaSheet_(_qaName_('PODCAST', 'Podcast'));
  if (!sh || sh.getLastRow() < 2) return { tot: 0, g7: 0, g30: 0 };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var iDate = h.indexOf('DataPubblicazione'); if (iDate < 0) iDate = h.indexOf('DataRilevamento');
  var iStato = h.indexOf('StatoRecord');
  var now = Date.now(), tot = 0, g7 = 0, g30 = 0;
  for (var r = 1; r < v.length; r++) {
    var id = String(v[r][0] || ''); if (!id) continue;
    var isVid = id.indexOf('VID') === 0;
    if (soloVideo !== isVid) continue;
    if (iStato >= 0 && String(v[r][iStato]).toLowerCase() === 'archiviato') continue;
    tot++;
    if (iDate >= 0) { var d = _qaParseDate_(v[r][iDate]); if (d) { var gg = (now - d.getTime()) / 86400000; if (gg <= 7) g7++; if (gg <= 30) g30++; } }
  }
  return { tot: tot, g7: g7, g30: g30 };
}

/** Bandi dal foglio standalone RADAR BANDI (esclude archiviati). */
function _qaCountBandi_() {
  var sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
  if (!sh || sh.getLastRow() < 2) return { tot: 0, g7: 0, g30: 0 };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var iDate = h.indexOf('Data_Rilevamento'); if (iDate < 0) iDate = 0;
  var iStato = h.indexOf('StatoRecord');
  var now = Date.now(), tot = 0, g7 = 0, g30 = 0;
  for (var r = 1; r < v.length; r++) {
    if (!v[r][1] && !v[r][0]) continue; // titolo o data presenti
    if (iStato >= 0 && String(v[r][iStato]).toLowerCase() === 'archiviato') continue;
    tot++;
    var d = _qaParseDate_(v[r][iDate]);
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
  var scan = (rep.scanlog || []).map(function(s) { return '<div style="font-size:11px;color:#6E6A62;padding:2px 0">' + s.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>'; }).join('') || '<div style="font-size:12px;color:#999">nessun log</div>';
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
    + '<h3 style="font-size:13px;margin:16px 0 6px;color:#8B3A1F">Ultime scansioni</h3>' + scan
    + err
    + '</div></div>';
}
