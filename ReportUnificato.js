// ============================================================================
//  ReportUnificato.js — UN solo controllo + UNA sola email al giorno (08:00)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · 2026-07-13
//
//  Sostituisce le 3 email separate (spec Silvano: "ottimizziamo questi
//  controlli in un'unica mail e unico controllo"):
//    1) [OC] Agente qualità bandi        (era daily 05:00)
//    2) Report FONTI Osservatorio        (era daily 08:00)
//    3) QA Osservatorio — report notturno (era daily 23:00)
//
//  Come: riusa i CORE già esistenti (nessuna logica duplicata):
//    agenteQualitaBandi({email:false})  → esegue le AZIONI (archivia scaduti/
//                                         junk/non-cultura) senza inviare
//    _frEsegui_()  + _frEmailHtml_()    → report fonti (aggregatori/silenti/link)
//    _qaEsegui_()  + _qaEmailHtml_()    → QA contenuti/integrità/scansioni
//  e invia UNA email con le 3 sezioni + un riquadro KPI di testa.
//
//  Le 3 funzioni originali restano intatte e lanciabili a mano (pannello admin);
//  nel dispatcher le loro entry sono sostituite dall'unica entry delle 08:00.
// ============================================================================

function reportUnificatoGiornaliero() {
  var dest = (typeof _qaDestinatario_ === 'function') ? _qaDestinatario_() : 's.straccini@gmail.com';
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var dataStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  var esiti = { bandi: null, fonti: null, qa: null, errori: [] };
  var sezioni = [];

  // ── 1) QUALITÀ BANDI — esegue le azioni, email soppressa ──────────────────
  try {
    esiti.bandi = agenteQualitaBandi({ email: false });
    sezioni.push(_ruSezione_('1 · Qualità bandi (azioni eseguite)', _aqEmailBandi_(esiti.bandi)));
  } catch (e) { esiti.errori.push('bandi: ' + e.message); }

  // ── 2) FONTI — aggregatori, silenti, morte, link bandi ────────────────────
  try {
    esiti.fonti = _frEsegui_();
    sezioni.push(_ruSezione_('2 · Fonti e aggregatori', _frEmailHtml_(esiti.fonti)));
  } catch (e2) { esiti.errori.push('fonti: ' + e2.message); }

  // ── 3) QA CONTENUTI — conteggi, integrità fogli, salute scansioni ─────────
  try {
    esiti.qa = _qaEsegui_();
    sezioni.push(_ruSezione_('3 · Contenuti e integrità', _qaEmailHtml_(esiti.qa)));
  } catch (e3) { esiti.errori.push('qa: ' + e3.message); }

  // ── KPI di testa (colpo d'occhio) ──────────────────────────────────────────
  var kArch = esiti.bandi ? (esiti.bandi.scaduti + esiti.bandi.junk + esiti.bandi.nonCultura) : '—';
  var kNoLink = esiti.bandi ? esiti.bandi.senzaLink : '—';
  var kAggKo = (esiti.fonti && esiti.fonti.aggregatori) ? esiti.fonti.aggregatori.filter(function(a){ return a.stato !== 'OK'; }).length : '—';
  var kSilenti = (esiti.fonti && esiti.fonti.silenti) ? esiti.fonti.silenti.totale : '—';
  function kpi(v, lbl, warn) {
    var col = warn && Number(v) > 0 ? '#8B3A1F' : '#3F7A5E';
    var bg = warn && Number(v) > 0 ? '#F3EDE4' : '#E5EFE7';
    return '<div style="flex:1;min-width:110px;background:' + bg + ';border-radius:8px;padding:10px 12px">' +
      '<div style="font-size:22px;font-weight:700;color:' + col + '">' + v + '</div>' +
      '<div style="font-size:11px;color:#666">' + lbl + '</div></div>';
  }
  var testata =
    '<div style="font-family:-apple-system,Arial,sans-serif;max-width:660px;margin:0 auto;color:#1a1a1a">' +
    '<div style="background:#1a1a1a;padding:18px 22px;border-radius:12px 12px 0 0">' +
    '<div style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#E89B7C">Sinopia</div>' +
    '<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bbb;margin-top:4px">Report giornaliero unificato &middot; ' + dataStr + '</div></div>' +
    '<div style="border:1px solid #e8e5e0;border-top:none;padding:16px 22px">' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
    kpi(kArch, 'bandi archiviati oggi', false) +
    kpi(kNoLink, 'bandi senza link', true) +
    kpi(kAggKo, 'aggregatori KO', true) +
    kpi(kSilenti, 'fonti silenti', true) +
    '</div>' +
    (esiti.errori.length ? '<div style="margin-top:10px;padding:8px 12px;background:#FCEBEB;border-radius:8px;font-size:12px;color:#A32D2D">Sezioni in errore: ' + esiti.errori.join(' · ') + '</div>' : '') +
    '</div></div><div style="height:14px"></div>';

  var html = testata + sezioni.join('<div style="height:14px"></div>');
  try {
    MailApp.sendEmail({
      to: dest,
      subject: '[OC] Report giornaliero — ' + kArch + ' archiviati · ' + kAggKo + ' aggregatori KO · ' + kSilenti + ' silenti',
      htmlBody: html
    });
    esiti.emailInviata = dest;
  } catch (eM) { esiti.emailErrore = eM.message; }
  Logger.log('[reportUnificato] bandi=' + JSON.stringify(esiti.bandi ? { arch: kArch, noLink: kNoLink } : null) +
    ' · aggKO=' + kAggKo + ' · silenti=' + kSilenti + ' · errori=' + esiti.errori.length);
  return esiti;
}

/** Wrappa un blocco HTML esistente con un'etichetta di sezione. */
function _ruSezione_(titolo, blocco) {
  return '<div style="max-width:660px;margin:0 auto">' +
    '<div style="font-family:-apple-system,Arial,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8B3A1F;font-weight:700;margin:0 0 6px 2px">' + titolo + '</div>' +
    blocco + '</div>';
}
