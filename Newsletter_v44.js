/**
 * ================================================================
 * OSSERVATORIO CULTURALE — Newsletter_v44.gs  (v4.4)
 * ----------------------------------------------------------------
 * Composizione HTML newsletter + invio a MailingList attiva.
 *
 * Usato da Admin_v44.gs:
 *   buildNewsletterHtml_(draft)
 *   sendNewsletterEmail_(soggetto, html)
 *
 * Sheet richiesta: MailingList (Email, Nome, Ruolo, Ambiti, Token, Attivo)
 *
 * Colori ambiti (mantengono la palette frontend):
 *   1 viola  #534AB7 — Beni culturali e musei
 *   2 verde  #0F6E56 — Turismo e territorio
 *   3 blu    #185FA5 — Spettacolo e performing arts
 *   4 marr.  #854F0B — Formazione e ricerca
 *   5 teal   #0E7490 — Industrie culturali creative
 * ================================================================
 */

// Sprint 1.3 (2026-05-01) - allineato Matrix
var OC_AMB_COLORS_ = {
  '1': { bg:'#EEEBFF', fg:'#534AB7', label:'Identità e narrazione museale' },
  '2': { bg:'#E1F4EE', fg:'#0F6E56', label:'Inclusione e accessibilità' },
  '3': { bg:'#E2EEFA', fg:'#185FA5', label:'Programma, mostre e collezioni' },
  '4': { bg:'#F5ECD8', fg:'#854F0B', label:'Comunità e welfare culturale' },
  '5': { bg:'#D7EDF1', fg:'#0E7490', label:'Digital, AI e governance' }
};

// ================== COMPOSER ==================

/**
 * Costruisce l'HTML completo della newsletter a partire dal draft.
 * draft = { soggetto, autore, createdAt, bandiUrgenti, bandiRecenti, news, podcast }
 */
function buildNewsletterHtml_(draft) {
  draft = draft || {};
  var tz   = Session.getScriptTimeZone();
  var data = Utilities.formatDate(new Date(draft.createdAt || Date.now()), tz, 'dd/MM/yyyy');

  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) { webUrl = ''; }

  var parts = [];
  parts.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+_h_(draft.soggetto)+'</title></head>');
  parts.push('<body style="margin:0;padding:0;background:#F4F4F6;font-family:Inter,Helvetica,Arial,sans-serif;color:#1D1D1F;">');
  parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F4F6;padding:24px 0;">');
  parts.push('<tr><td align="center">');
  parts.push('<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#FFFFFF;border-radius:12px;overflow:hidden;">');

  // Header
  parts.push('<tr><td style="padding:28px 28px 16px 28px;background:#1D1D1F;color:#FFFFFF;">');
  parts.push('<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#A8A8AA;">Osservatorio Culturale · ' + _h_(data) + '</div>');
  parts.push('<div style="font-size:22px;font-weight:700;margin-top:6px;">' + _h_(draft.soggetto||'Digest') + '</div>');
  parts.push('</td></tr>');

  // Intro
  parts.push('<tr><td style="padding:20px 28px 4px 28px;">');
  parts.push('<p style="margin:0;font-size:14px;line-height:1.55;color:#3A3A3C;">Una selezione dei bandi in scadenza, delle ultime notizie e dei podcast più recenti del settore culturale e creativo. Clicca su ogni elemento per approfondire.</p>');
  parts.push('</td></tr>');

  // Bandi urgenti
  var urg = (draft.bandiUrgenti || []);
  if (urg.length) {
    parts.push(_nlSectionHeader_('🔥 Bandi in scadenza'));
    urg.forEach(function(b){ parts.push(_nlBandoCard_(b, /*urgent=*/true)); });
  }

  // Bandi recenti
  var rec = (draft.bandiRecenti || []);
  if (rec.length) {
    parts.push(_nlSectionHeader_('📌 Ultimi bandi monitorati'));
    rec.forEach(function(b){ parts.push(_nlBandoCard_(b, /*urgent=*/false)); });
  }

  // News
  var news = (draft.news || []);
  if (news.length) {
    parts.push(_nlSectionHeader_('📰 Ultime notizie'));
    news.forEach(function(n){ parts.push(_nlNewsCard_(n)); });
  }

  // Podcast
  var pod = (draft.podcast || []);
  if (pod.length) {
    parts.push(_nlSectionHeader_('🎙️ Podcast'));
    pod.forEach(function(p){ parts.push(_nlPodcastCard_(p)); });
  }

  // CTA
  if (webUrl) {
    parts.push('<tr><td style="padding:24px 28px;text-align:center;">');
    parts.push('<a href="' + _h_(webUrl) + '" style="display:inline-block;background:#1D1D1F;color:#FFFFFF;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Apri Osservatorio Culturale →</a>');
    parts.push('</td></tr>');
  }

  // Footer
  parts.push('<tr><td style="padding:16px 28px 28px 28px;border-top:1px solid #ECECEE;">');
  parts.push('<p style="margin:0;font-size:11px;line-height:1.5;color:#8A8A8E;">Ricevi questa newsletter in quanto iscritto all\'Osservatorio Culturale. Per modificare le preferenze o cancellarti, rispondi a questo messaggio.</p>');
  parts.push('</td></tr>');

  parts.push('</table></td></tr></table></body></html>');
  return parts.join('');
}

// ================== SENDER ==================

/**
 * Invia l'HTML a tutti gli iscritti Attivo=true nella sheet MailingList.
 * Ritorna { count, errors:[...] }
 */
function sendNewsletterEmail_(subject, html) {
  // Sprint 1.4 (2026-05-01): legge da Utenti (OptInDigest=true && Stato=attivo) via Auth.gs.
  // Fallback su vecchia MailingList se Utenti vuoto.
  var sender   = _safeEmail_() || 's.straccini@gmail.com';
  var senderName = 'Osservatorio Culturale';
  var sent = 0;
  var errors = [];
  var destinatari = [];
  try {
    if (typeof getUtentiPerOptIn === 'function') {
      var utentiOptIn = getUtentiPerOptIn('digest');
      if (utentiOptIn && utentiOptIn.length) {
        destinatari = utentiOptIn.map(function(u){ return u.email; });
      }
    }
  } catch(e) { errors.push({ source:'utenti', err: e.message }); }
  if (!destinatari.length) {
    try {
      var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
      if (!ss) return { count:0, errors:['spreadsheet_null'] };
      var sh = ss.getSheetByName(OC_ML_SHEET_);
      if (sh) {
        var vals = sh.getDataRange().getValues();
        for (var i = 1; i < vals.length; i++) {
          var r = vals[i];
          var em = String(r[0] || '').trim();
          if (!em) continue;
          var attivo = r[5];
          var isActive = (attivo === true || attivo === 1 || String(attivo).toLowerCase() === 'true' || attivo === '');
          if (isActive) destinatari.push(em);
        }
      }
    } catch(e2) { errors.push({ source:'mailinglist', err: e2.message }); }
  }
  if (!destinatari.length) return { count:0, errors: errors.concat([{source:'all', err:'nessun destinatario'}]) };
  destinatari = Array.from(new Set(destinatari.map(function(e){ return e.toLowerCase().trim(); })));
  destinatari.forEach(function(email) {
    try {
      MailApp.sendEmail({
        to:      email,
        subject: subject,
        htmlBody: html,
        name:    senderName,
        replyTo: sender
      });
      sent++;
    } catch(e) {
      errors.push({ email:email, err:e.message });
    }
  });
  return { count: sent, errors: errors, totale_destinatari: destinatari.length };
}

// ================== SECTION & CARD BUILDERS ==================

function _nlSectionHeader_(title) {
  return '<tr><td style="padding:28px 28px 6px 28px;">' +
         '<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A8A8E;font-weight:700;">' +
         _h_(title) + '</div></td></tr>';
}

function _nlBandoCard_(b, urgent) {
  var amb = _ambFor_(b.ambito || b.ambitoId);
  var stripe = amb.fg;
  var titolo = b.titolo || b.Titolo || '(senza titolo)';
  var ente   = b.ente   || b.Ente   || '';
  var sett   = b.settore|| b.Settore|| '';
  var scad   = b.scadenza || b.Scadenza || '';
  var url    = b.url || b.URL || b.link || '';
  var giorni = (b.giorni != null ? b.giorni : b.giorniAllaScadenza);

  var sub = [];
  if (ente) sub.push(_h_(ente));
  if (sett) sub.push(_h_(sett));

  var scadText = '';
  if (scad) {
    scadText = 'Scadenza: ' + _h_(scad);
    if (urgent && giorni != null) {
      scadText += ' <span style="background:' + amb.bg + ';color:' + amb.fg + ';padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;">' + (giorni <= 0 ? 'oggi' : giorni + 'gg') + '</span>';
    }
  }

  return '<tr><td style="padding:8px 28px;">' +
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:' + amb.bg + '40;border-left:3px solid ' + stripe + ';border-radius:6px;">' +
         '<tr><td style="padding:12px 14px;">' +
           '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + amb.fg + ';font-weight:700;">' + _h_(amb.label) + '</div>' +
           '<div style="font-size:15px;line-height:1.35;color:#1D1D1F;font-weight:600;margin-top:3px;">' +
             (url ? '<a href="' + _h_(url) + '" style="color:#1D1D1F;text-decoration:none;">' + _h_(titolo) + ' →</a>' : _h_(titolo)) +
           '</div>' +
           (sub.length ? '<div style="font-size:12px;color:#5A5A5E;margin-top:4px;">' + sub.join(' · ') + '</div>' : '') +
           (scadText ? '<div style="font-size:12px;color:#5A5A5E;margin-top:6px;">' + scadText + '</div>' : '') +
         '</td></tr></table></td></tr>';
}

function _nlNewsCard_(n) {
  var amb = _ambFor_(n.ambito || n.ambitoId);
  var titolo = n.titolo || n.Titolo || '(senza titolo)';
  var somm   = n.sommario || n.SommarioAI || n.descrizione || '';
  var fonte  = n.fonte || n.Fonte || '';
  var data   = n.data  || n.Data  || '';
  var url    = n.url   || n.URL   || n.link || '';

  return '<tr><td style="padding:8px 28px;">' +
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:' + amb.bg + '40;border-left:3px solid ' + amb.fg + ';border-radius:6px;">' +
         '<tr><td style="padding:12px 14px;">' +
           '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + amb.fg + ';font-weight:700;">' + _h_(amb.label) + '</div>' +
           '<div style="font-size:15px;line-height:1.35;color:#1D1D1F;font-weight:600;margin-top:3px;">' +
             (url ? '<a href="' + _h_(url) + '" style="color:#1D1D1F;text-decoration:none;">' + _h_(titolo) + ' →</a>' : _h_(titolo)) +
           '</div>' +
           (somm ? '<div style="font-size:12px;color:#3A3A3C;margin-top:5px;line-height:1.5;">' + _h_(_trunc_(somm, 180)) + '</div>' : '') +
           (fonte || data ? '<div style="font-size:11px;color:#8A8A8E;margin-top:6px;">' + _h_([fonte,data].filter(String).join(' · ')) + '</div>' : '') +
         '</td></tr></table></td></tr>';
}

function _nlPodcastCard_(p) {
  var amb = _ambFor_(p.ambito || p.ambitoId || '5');
  var titolo = p.titolo || p.Titolo || '(senza titolo)';
  var show   = p.show   || p.Show   || p.showName || '';
  var durata = p.durata || p.Durata || '';
  var url    = p.url    || p.URL    || p.link || '';

  return '<tr><td style="padding:8px 28px;">' +
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:' + amb.bg + '40;border-left:3px solid ' + amb.fg + ';border-radius:6px;">' +
         '<tr><td style="padding:12px 14px;">' +
           '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + amb.fg + ';font-weight:700;">' + _h_(amb.label) + '</div>' +
           '<div style="font-size:15px;line-height:1.35;color:#1D1D1F;font-weight:600;margin-top:3px;">' +
             (url ? '<a href="' + _h_(url) + '" style="color:#1D1D1F;text-decoration:none;">▶ ' + _h_(titolo) + '</a>' : '▶ ' + _h_(titolo)) +
           '</div>' +
           (show || durata ? '<div style="font-size:12px;color:#5A5A5E;margin-top:4px;">' + _h_([show,durata].filter(String).join(' · ')) + '</div>' : '') +
         '</td></tr></table></td></tr>';
}

// ================== UTILS ==================

function _ambFor_(id) {
  var k = String(id || '').trim();
  return OC_AMB_COLORS_[k] || { bg:'#F2F2F4', fg:'#5A5A5E', label:'Osservatorio' };
}

function _h_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _trunc_(s, n) {
  s = String(s || '');
  if (s.length <= n) return s;
  return s.substring(0, n-1).replace(/\s+\S*$/, '') + '…';
}

// ============================================================================
// SPRINT 1.3 (2026-05-01) — TEST INVIO DIGEST GENERALISTA
// ============================================================================

/**
 * Testa end-to-end la generazione + invio del digest generalista.
 * Bypassa il workflow di autorizzazione Telegram e invia direttamente al
 * destinatario di test specificato (default: s.straccini@gmail.com).
 *
 * Esegui dall'editor GAS per verificare:
 *   - che la bozza si componga senza errori
 *   - che il template HTML sia ben formato
 *   - che l'email arrivi davvero
 *   - che i nuovi nomi ambiti (Sprint 1.3) appaiano correttamente
 *
 * @param {string} [emailDest='s.straccini@gmail.com'] destinatario test
 * @return {Object} { ok, draftId, htmlPreviewLength, emailSent, error? }
 */
function testInviaDigestGeneralista(emailDest) {
  emailDest = emailDest || 's.straccini@gmail.com';
  Logger.log('=== TEST DIGEST GENERALISTA ===');
  Logger.log('Destinatario test: ' + emailDest);

  try {
    // 1) Genera bozza usando il flusso normale
    Logger.log('--- 1. Generazione bozza ---');
    var draftRes = adminGenerateDigestDraft({
      maxBandi: 6,
      maxNews: 5,
      maxPodcast: 3,
      soggetto: '[TEST] Osservatorio Culturale — Digest pilota Sprint 1.3'
    });
    Logger.log(JSON.stringify(draftRes, null, 2));
    if (!draftRes.ok) {
      return { ok:false, error: 'draft_failed: ' + draftRes.error };
    }

    // 2) Carica draft completa
    Logger.log('--- 2. Caricamento draft completo ---');
    var draftKey = OC_DRAFT_PROP_PFX_ + draftRes.id;
    var draftJson = PropertiesService.getScriptProperties().getProperty(draftKey);
    if (!draftJson) {
      return { ok:false, error: 'draft_not_persisted' };
    }
    var draft = JSON.parse(draftJson);
    Logger.log('Bandi urgenti: ' + (draft.bandiUrgenti||[]).length);
    Logger.log('Bandi recenti: ' + (draft.bandiRecenti||[]).length);
    Logger.log('News: ' + (draft.news||[]).length);
    Logger.log('Podcast: ' + (draft.podcast||[]).length);

    // 3) Costruisci HTML
    Logger.log('--- 3. Build HTML ---');
    var html = buildNewsletterHtml_(draft);
    Logger.log('HTML lunghezza: ' + html.length + ' caratteri');

    // 4) Invio diretto al destinatario test (bypass MailingList)
    Logger.log('--- 4. Invio email diretto ---');
    var sender = '';
    try { sender = Session.getActiveUser().getEmail() || 's.straccini@gmail.com'; } catch(e) { sender = 's.straccini@gmail.com'; }
    MailApp.sendEmail({
      to:       emailDest,
      subject:  draft.soggetto,
      htmlBody: html,
      name:     'Osservatorio Culturale (TEST)',
      replyTo:  sender
    });
    Logger.log('Email inviata a ' + emailDest);

    return {
      ok: true,
      draftId: draftRes.id,
      counts: draftRes.counts,
      htmlPreviewLength: html.length,
      emailSent: emailDest,
      message: 'Verifica casella ' + emailDest + ' (anche cartella Spam). Subject: ' + draft.soggetto
    };
  } catch(e) {
    Logger.log('ERRORE: ' + e.message + '\n' + e.stack);
    return { ok:false, error: e.message };
  }
}

/**
 * Variante: invia il digest generalista a TUTTI gli iscritti reali
 * della MailingList (bypass workflow Telegram). Solo per test admin.
 * Usare con cautela: se ci sono iscritti reali, riceveranno l'email!
 */
function testInviaDigestATuttiGliIscritti() {
  Logger.log('=== TEST INVIO A MAILINGLIST INTERA ===');
  try {
    var draftRes = adminGenerateDigestDraft({
      maxBandi: 8, maxNews: 6, maxPodcast: 3,
      soggetto: '[TEST] Osservatorio Culturale — Digest a MailingList'
    });
    if (!draftRes.ok) return { ok:false, error: draftRes.error };

    var draftJson = PropertiesService.getScriptProperties().getProperty(OC_DRAFT_PROP_PFX_ + draftRes.id);
    var draft = JSON.parse(draftJson);
    var html = buildNewsletterHtml_(draft);
    var sendRes = sendNewsletterEmail_(draft.soggetto, html);

    Logger.log('Email inviate: ' + sendRes.count);
    if (sendRes.errors.length) Logger.log('Errori: ' + JSON.stringify(sendRes.errors));
    return { ok:true, draftId: draftRes.id, sent: sendRes.count, errors: sendRes.errors };
  } catch(e) {
    Logger.log('ERRORE: ' + e.message);
    return { ok:false, error: e.message };
  }
}