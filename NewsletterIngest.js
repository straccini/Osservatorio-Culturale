/**
 * ============================================================================
 *  NewsletterIngest.js — Ingestione notizie dalle newsletter (canale #2)
 * ============================================================================
 *  Autore: Claude (Cowork) per Silvano Straccini / Sinopia — 2026-06-26
 *
 *  Molte testate hanno dismesso l'RSS ma inviano newsletter. Questo modulo
 *  legge le newsletter raccolte in un'etichetta Gmail dedicata, ne estrae i
 *  link-articolo, li valuta con l'AI esistente (processWithAI) e salva in
 *  Items solo quelli rilevanti — esattamente come una fonte RSS.
 *
 *  Flusso: l'utente (o un filtro Gmail) applica l'etichetta 'Osservatorio' alle
 *  newsletter. scanNewsletterGmail() le elabora e le sposta su
 *  'Osservatorio-Elaborata' così non vengono riprocessate.
 *
 *  GmailApp è già autorizzato nel progetto (Digest_routing/Matrix_digest).
 *
 *  Funzioni pubbliche:
 *    scanNewsletterSetup()     — installa il trigger settimanale (lun 06:00)
 *    scanNewsletterGmail()     — elabora le newsletter etichettate (target trigger)
 *    scanNewsletterAnteprima() — DRY-RUN: mostra cosa estrarrebbe senza salvare
 * ============================================================================
 */

var NL_LABEL = 'Osservatorio';
var NL_LABEL_DONE = 'Osservatorio-Elaborata';
var NL_MAX_THREADS = 15;          // newsletter per run
var NL_MAX_LINK_PER_MAIL = 8;     // link candidati per newsletter
var NL_SCORE_MIN = 3;             // soglia rilevanza AI (1-5)
var NL_BUDGET_MS = 280000;        // ~4,6 min (limite GAS 6 min)

// ----------------------------------------------------------------------------
// TRIGGER
// ----------------------------------------------------------------------------
function scanNewsletterSetup() {
  var rimossi = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'scanNewsletterGmail') { ScriptApp.deleteTrigger(t); rimossi++; }
  });
  try {
    ScriptApp.newTrigger('scanNewsletterGmail').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  } catch (e) {
    var tot = ScriptApp.getProjectTriggers().length;
    Logger.log('scanNewsletterSetup ERRORE: ' + e.message + ' (trigger ' + tot + '/20). Usa qaDeduplicaTrigger().');
    return { ok: false, error: e.message, triggerPresenti: tot };
  }
  Logger.log('scanNewsletterSetup: rimossi ' + rimossi + ', creato trigger settimanale (lun 06:00)');
  return { ok: true, rimossi: rimossi, quando: 'lunedì 06:00 settimanale' };
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------
function scanNewsletterGmail() { return _nlEsegui_(false); }

/** Anteprima senza salvare né spostare le mail: utile per tarare le soglie. */
function scanNewsletterAnteprima() { return _nlEsegui_(true); }

function _nlEsegui_(dryRun) {
  var lbl = GmailApp.getUserLabelByName(NL_LABEL) || GmailApp.createLabel(NL_LABEL);
  var done = GmailApp.getUserLabelByName(NL_LABEL_DONE) || GmailApp.createLabel(NL_LABEL_DONE);
  var threads = lbl.getThreads(0, NL_MAX_THREADS);
  if (!threads.length) { Logger.log('scanNewsletterGmail: nessuna newsletter etichettata "' + NL_LABEL + '"'); return { ok: true, dryRun: !!dryRun, mail: 0, salvati: 0, dettaglio: [] }; }

  var SS = getMainSS();
  var sh = SS.getSheetByName(SH.ITEMS);
  var existing = getExistingURLs(sh);
  var start = Date.now(), totSalvati = 0, totMail = 0, dettaglio = [];

  for (var t = 0; t < threads.length; t++) {
    if (Date.now() - start > NL_BUDGET_MS) { Logger.log('scanNewsletterGmail: budget tempo esaurito, mi fermo'); break; }
    var th = threads[t];
    try {
      var msgs = th.getMessages();
      var msg = msgs[msgs.length - 1];
      var sender = _nlMittente_(msg.getFrom());
      var candidati = _nlEstraiLink_(msg.getBody() || '').slice(0, NL_MAX_LINK_PER_MAIL);
      var salvatiMail = 0;
      for (var c = 0; c < candidati.length; c++) {
        if (Date.now() - start > NL_BUDGET_MS) break;
        var link = candidati[c];
        var canon = (typeof _canonicalUrl_ === 'function') ? _canonicalUrl_(link.url) : link.url;
        if (!canon || existing.has(canon)) continue;
        var amb = (typeof _classificaAmbitoV5_ === 'function') ? (Number(_classificaAmbitoV5_(link.titolo, link.titolo)) || 1) : 1;
        Utilities.sleep(600);
        var ai = processWithAI(link.titolo, '', amb);
        if ((ai.score || 0) < NL_SCORE_MIN) continue;
        if (!dryRun) {
          saveItem(sh, { titolo: link.titolo, url: link.url, imgUrl: '', estratto: link.titolo, data: msg.getDate() }, { Nome: 'Newsletter: ' + sender, Ambito: amb }, ai);
        }
        existing.add(canon);
        totSalvati++; salvatiMail++;
        if (dryRun) dettaglio.push({ mittente: sender, titolo: link.titolo, score: ai.score, ambito: amb });
      }
      totMail++;
      if (!dryRun) th.removeLabel(lbl).addLabel(done);
      Logger.log('  ' + sender + ': ' + salvatiMail + ' notizie salvate (' + candidati.length + ' candidati)');
    } catch (e) {
      Logger.log('scanNewsletterGmail thread err: ' + e.message);
    }
  }
  Logger.log('scanNewsletterGmail' + (dryRun ? ' [DRY-RUN]' : '') + ': ' + totMail + ' newsletter, ' + totSalvati + ' notizie salvate');
  return { ok: true, dryRun: !!dryRun, mail: totMail, salvati: totSalvati, dettaglio: dettaglio };
}

// ----------------------------------------------------------------------------
// HELPER
// ----------------------------------------------------------------------------
function _nlMittente_(from) {
  var m = String(from || '').match(/^(.*?)\s*<([^>]+)>/);
  if (m && m[1].replace(/["']/g, '').trim()) return m[1].replace(/["']/g, '').trim();
  if (m) return (m[2].split('@')[1] || m[2]);
  return String(from || '').split('@')[1] || 'newsletter';
}

/** Estrae i link-articolo da una newsletter HTML, scartando rumore (unsubscribe/social/tracking). */
function _nlEstraiLink_(html) {
  var out = [], seen = {};
  var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1].trim();
    var txt = m[2].replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (txt.length < 25) continue;             // anchor troppo corta → non è un titolo
    if (_nlScarta_(url, txt)) continue;
    var key = url.split('?')[0];
    if (seen[key]) continue; seen[key] = true;
    out.push({ url: url, titolo: txt.substring(0, 200) });
  }
  return out;
}

function _nlScarta_(url, txt) {
  var u = url.toLowerCase();
  var badUrl = ['unsubscribe', 'list-manage', 'mailchi.mp', '/preferences', '/privacy', '/cookie',
    'facebook.com', 'twitter.com', 'x.com/', 'instagram.com', 'linkedin.com', 'youtube.com',
    'whatsapp', 't.me/', 'mailto:', 'tel:', 'apple.com/app', 'play.google.com'];
  for (var i = 0; i < badUrl.length; i++) if (u.indexOf(badUrl[i]) >= 0) return true;
  return /^(iscriviti|disiscriviti|unsubscribe|leggi online|view in browser|visualizza nel browser|segui|follow|privacy|cookie|gestisci|preferenze|scarica l'app|download)/i.test(txt);
}
