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

// v4.20 — Palette da OC_AMBITI (source of truth in Constants.js)
var OC_AMB_COLORS_ = {};
if (typeof OC_AMBITI !== 'undefined') {
  OC_AMBITI.forEach(function(a){ OC_AMB_COLORS_[String(a.id)] = { bg:'#F2F2F4', fg:a.color, label:a.nome }; });
}

// ================== DATA HELPER — sempre lunedì ==================

/**
 * Ritorna la data del prossimo (o corrente) lunedì, formattata dd/MM/yyyy.
 * Se oggi è lunedì, ritorna oggi. Altrimenti il lunedì successivo.
 * Usato sia nel digest sia nell'editoriale per data coerente.
 */
function _prossimoLunedi_(rifDate) {
  var d = rifDate ? new Date(rifDate) : new Date();
  var day = d.getDay(); // 0=dom, 1=lun, …
  var diff = (day === 0) ? 1 : (day === 1) ? 0 : (8 - day);
  d.setDate(d.getDate() + diff);
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'dd/MM/yyyy');
}

// ================== COMPOSER ==================

/**
 * Costruisce l'HTML completo della newsletter a partire dal draft.
 * draft = { soggetto, autore, createdAt, bandiUrgenti, bandiRecenti, news, podcast }
 */
function buildNewsletterHtml_(draft) {
  draft = draft || {};
  var data = _prossimoLunedi_(draft.createdAt);

  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) { webUrl = ''; }

  var parts = [];
  parts.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+_h_(draft.soggetto)+'</title></head>');
  parts.push('<body style="margin:0;padding:0;background:#E4E0D8;font-family:Inter,Helvetica,Arial,sans-serif;color:#1D1D1F;">');
  parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#E4E0D8;padding:24px 0;">');
  parts.push('<tr><td align="center">');
  parts.push('<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#FFFFFF">');

  // v4.27.43 — Testata design «traiettorie sottotraccia» approvato 2026-07-18
  // (fondo bianco, logo a SX, data a DX, filetti terra, masthead, nav, social).
  // Sostituisce il vecchio header scuro centrato. Helper condiviso: _nlMastheadHtml_.
  parts.push(_nlMastheadHtml_(data));

  // v4.22 E1 — Editoriale settimanale (se approvato, sostituisce l'intro generica)
  var _editoriale = null;
  try { if (typeof getEditorialeCorrente === 'function') _editoriale = getEditorialeCorrente(); } catch(_){}
  if (_editoriale && _editoriale.testo) {
    parts.push('<tr><td style="padding:20px 28px 4px 28px;">');
    // v4.25.14 — RIPRISTINO regressione 1ff01773: foto banner + firma (da 2775252c)
    if (_editoriale.foto) parts.push('<img src="' + String(_editoriale.foto) + '" alt="" width="564" style="width:100%;max-width:564px;display:block;margin-bottom:14px"/>');
    parts.push('<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8B3A1F;font-weight:700;margin-bottom:8px;">Approfondimento della settimana</div>');
    parts.push('<div style="font-size:16px;font-weight:700;color:#1D1D1F;margin-bottom:10px;">' + _h_(_editoriale.titolo) + '</div>');
    parts.push('<p style="margin:0;font-size:14px;line-height:1.65;color:#3A3A3C;">' + _h_(_editoriale.testo).replace(/\n/g, '<br>') + '</p>');
    if (_editoriale.firma) parts.push('<div style="margin-top:12px;font-style:italic;font-size:13px;color:#6E6A62;">' + _h_(_editoriale.firma) + '</div>');
    parts.push('<div style="margin-top:14px;border-bottom:1px solid #E5E5E7;padding-bottom:6px"></div>');
    parts.push('</td></tr>');
  } else {
    // Intro generica (fallback se nessun editoriale approvato)
    parts.push('<tr><td style="padding:20px 28px 4px 28px;">');
    parts.push('<p style="margin:0;font-size:14px;line-height:1.55;color:#3A3A3C;">Una selezione dei bandi in scadenza, delle ultime notizie e dei podcast piu recenti del settore culturale e creativo. Clicca su ogni elemento per approfondire.</p>');
    parts.push('</td></tr>');
  }

  // v4.27.44 — SEGNALAZIONE DELLA COMMUNITY: l'ultima pubblicata non ancora
  // uscita nei digest precedenti (selezionata in _generateDigestDraftCore_).
  // v4.27.46 — impaginazione rivista (feedback Silvano 20/07): etichetta con lo
  // STESSO stile delle altre sezioni (via _nlSectionHeader_, niente emoji né
  // evidenziazione), foto ridotta a 170px in colonna accanto al testo.
  // v4.27.59 — restyling (richiesta 29/07): NESSUNA evidenziazione — via fondo
  // colorato, bordo e bottone pieno. Stessa grammatica grafica delle altre
  // sezioni: titolo Georgia, testo grigio, link testuale terra, filetto sotto.
  if (draft.segnalazione && draft.segnalazione.titolo) {
    var _sg = draft.segnalazione;
    parts.push(_nlSectionHeader_('Dalla community · Segnalazione della settimana'));
    parts.push('<tr><td style="padding:0 28px 8px 28px;">');
    parts.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>');
    if (_sg.og_image) {
      parts.push('<td width="150" style="vertical-align:top;"><img src="' + _sg.og_image + '" alt="" width="150" style="width:150px;max-width:150px;height:auto;display:block;" /></td>');
      parts.push('<td style="vertical-align:top;padding-left:16px;">');
    } else {
      parts.push('<td style="vertical-align:top;">');
    }
    parts.push('<div style="font-family:Georgia,serif;font-size:15.5px;font-weight:700;color:#111111;line-height:1.4;margin-bottom:6px;">' + _h_(_sg.titolo) + '</div>');
    if (_sg.descrizione) parts.push('<p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#3A3A3C;">' + _h_(_sg.descrizione) + '</p>');
    var _sgFirma = _sg.autore ? '<span style="font-size:12px;color:#8A8578;font-style:italic;">segnalata da ' + _h_(_sg.autore) + '</span>' : '';
    if (_sg.url) parts.push('<a href="' + _h_(_sg.url) + '" style="font-size:13px;font-weight:700;color:#A65138;text-decoration:none;">Approfondisci &rarr;</a>' + (_sgFirma ? '&nbsp;&nbsp;' + _sgFirma : ''));
    else if (_sgFirma) parts.push(_sgFirma);
    parts.push('</td></tr></table>');
    parts.push('<div style="border-bottom:1px solid #E5E5E7;margin-top:14px;font-size:0">&nbsp;</div>');
    parts.push('</td></tr>');
  }

  // v4.24 — Dedup cross-sezione esatto + fuzzy: nessun titolo duplicato o simile nella newsletter
  var _nlSeen = {};
  function _nlDedup(items, keyFn) {
    var exactDedup = (items || []).filter(function(it) {
      var key = String(keyFn(it) || '').trim().toLowerCase().replace(/\s+/g,' ');
      if (!key || _nlSeen[key]) return false;
      _nlSeen[key] = true;
      return true;
    });
    // Dedup fuzzy tra gli item passati in questa sezione
    if (typeof _dedupFuzzyByTitle_ === 'function') {
      var mapped = exactDedup.map(function(it) { return { titolo: keyFn(it) || '', _orig: it }; });
      mapped = _dedupFuzzyByTitle_(mapped);
      return mapped.map(function(m) { return m._orig; });
    }
    return exactDedup;
  }

  // Bandi urgenti
  var urg = _nlDedup(draft.bandiUrgenti, function(b){ return b.titolo||b.Titolo; });
  if (urg.length) {
    parts.push(_nlSectionHeader_('Bandi in scadenza'));
    urg.forEach(function(b){ parts.push(_nlBandoCard_(b, /*urgent=*/true)); });
  }

  // Bandi recenti (dedup anche vs urgenti)
  var rec = _nlDedup(draft.bandiRecenti, function(b){ return b.titolo||b.Titolo; });
  if (rec.length) {
    parts.push(_nlSectionHeader_('Ultimi bandi monitorati'));
    rec.forEach(function(b){ parts.push(_nlBandoCard_(b, /*urgent=*/false)); });
  }

  // News (dedup vs bandi)
  var news = _nlDedup(draft.news, function(n){ return n.titolo||n.Titolo; });
  if (news.length) {
    parts.push(_nlSectionHeader_('Ultime notizie'));
    news.forEach(function(n){ parts.push(_nlNewsCard_(n)); });
  }

  // Podcast (dedup vs tutto)
  var pod = _nlDedup(draft.podcast, function(p){ return p.titolo||p.Titolo; });
  if (pod.length) {
    parts.push(_nlSectionHeader_('Podcast'));
    pod.forEach(function(p){ parts.push(_nlPodcastCard_(p)); });
  }

  // v4.25.15 — Video (mix esteso, card compatta stile editoria)
  var vid = _nlDedup(draft.video, function(v){ return v.titolo||v.Titolo; });
  if (vid.length) {
    parts.push(_nlSectionHeader_('Video'));
    vid.forEach(function(v) {
      parts.push('<tr><td style="padding:8px 28px;">');
      parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>');
      parts.push('<td style="vertical-align:top;width:28px;font-size:18px;padding-right:10px">🎬</td>');
      parts.push('<td style="vertical-align:top">');
      parts.push('<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8A8A8E;margin-bottom:2px">Video · ' + _h_(v.canale || v.fonte || '') + '</div>');
      if (v.link) parts.push('<a href="' + _h_(v.link) + '" style="color:#1D1D1F;text-decoration:none;font-size:14px;font-weight:600;line-height:1.4">' + _h_(v.titolo || '') + '</a>');
      else parts.push('<div style="font-size:14px;font-weight:600;color:#1D1D1F;line-height:1.4">' + _h_(v.titolo || '') + '</div>');
      parts.push('</td></tr></table>');
      parts.push('</td></tr>');
    });
  }

  // v4.25.15 — Libri e pubblicazioni (mix esteso)
  var lib = _nlDedup(draft.libri, function(l){ return l.titolo||l.Titolo; });
  if (lib.length) {
    parts.push(_nlSectionHeader_('Libri e pubblicazioni'));
    lib.forEach(function(l) {
      parts.push('<tr><td style="padding:8px 28px;">');
      parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>');
      parts.push('<td style="vertical-align:top;width:28px;font-size:18px;padding-right:10px">📚</td>');
      parts.push('<td style="vertical-align:top">');
      parts.push('<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8A8A8E;margin-bottom:2px">' + _h_((l.autore || '') + (l.editore ? ' · ' + l.editore : '') + (l.anno ? ' · ' + l.anno : '')) + '</div>');
      if (l.link) parts.push('<a href="' + _h_(l.link) + '" style="color:#1D1D1F;text-decoration:none;font-size:14px;font-weight:600;line-height:1.4">' + _h_(l.titolo || '') + '</a>');
      else parts.push('<div style="font-size:14px;font-weight:600;color:#1D1D1F;line-height:1.4">' + _h_(l.titolo || '') + '</div>');
      parts.push('</td></tr></table>');
      parts.push('</td></tr>');
    });
  }

  // Editoria — pubblicazioni e podcast dalla ricerca (foglio Editoria via getEditoria)
  var editoria = draft.editoria || [];
  if (editoria.length) {
    parts.push(_nlSectionHeader_('Dalla ricerca'));
    editoria.slice(0, 5).forEach(function(e) {
      var icon = e.tipo === 'podcast' ? '🎙' : e.tipo === 'video' ? '🎬' : '📄';
      var tipoLabel = e.tipo === 'podcast' ? 'Podcast' : e.tipo === 'video' ? 'Video' : 'Pubblicazione';
      parts.push('<tr><td style="padding:8px 28px;">');
      parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>');
      parts.push('<td style="vertical-align:top;width:28px;font-size:18px;padding-right:10px">' + icon + '</td>');
      parts.push('<td style="vertical-align:top">');
      parts.push('<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8A8A8E;margin-bottom:2px">' + _h_(tipoLabel) + ' · ' + _h_(e.fonte || '') + '</div>');
      if (e.url) parts.push('<a href="' + _h_(e.url) + '" style="color:#1D1D1F;text-decoration:none;font-size:14px;font-weight:600;line-height:1.4">' + _h_(e.titolo || '') + '</a>');
      else parts.push('<div style="font-size:14px;font-weight:600;color:#1D1D1F;line-height:1.4">' + _h_(e.titolo || '') + '</div>');
      if (e.autore) parts.push('<div style="font-size:12px;color:#6E6E73;margin-top:2px">' + _h_(e.autore) + '</div>');
      if (e.note) parts.push('<div style="font-size:12px;color:#8A8A8E;margin-top:4px;line-height:1.4">' + _h_(String(e.note).substring(0, 150)) + '</div>');
      parts.push('</td></tr></table>');
      parts.push('</td></tr>');
    });
  }

  // CTA
  if (webUrl) {
    parts.push('<tr><td style="padding:24px 28px;text-align:center;">');
    parts.push('<a href="' + _h_(webUrl) + '" style="display:inline-block;background:#B8351A;color:#FFFFFF;padding:13px 30px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">Apri l&#39;Osservatorio</a>');
    parts.push('</td></tr>');
  }

  // Social links
  parts.push('<tr><td style="padding:16px 28px 4px;text-align:center;border-top:1px solid #ECECEE;">');
  parts.push('<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8A8A8E;margin-bottom:10px;">Seguici</div>');
  parts.push('<a href="https://www.linkedin.com/company/sinopiaconsulting/" style="display:inline-block;background:#FFFFFF;color:#1D1D1F;border:1px solid #1D1D1F;padding:8px 20px;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin:0 4px">LinkedIn</a>');
  parts.push('<a href="https://www.instagram.com/sinopia_osservatorio?igsh=MTFhdjY2ZXZubzVpYg==" style="display:inline-block;background:#FFFFFF;color:#1D1D1F;border:1px solid #1D1D1F;padding:8px 20px;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin:0 4px">Instagram</a>');
  parts.push('<a href="mailto:sinopiaconsulting@gmail.com" style="display:inline-block;background:#FFFFFF;color:#1D1D1F;border:1px solid #1D1D1F;padding:8px 20px;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin:0 4px">Email</a>');
  parts.push('</td></tr>');

  // Footer
  parts.push('<tr><td style="padding:12px 28px 28px 28px;">');
  parts.push('<p style="margin:0;font-size:11px;line-height:1.5;color:#8A8A8E;text-align:center;">&copy; Sinopia Srl unipersonale &middot; Deruta (PG) &middot; Osservatorio Culturale<br>Ricevi questa newsletter in quanto iscritto. Per modificare le preferenze o cancellarti, usa il link di disiscrizione in fondo.</p>');
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
  var sender   = _safeEmail_() || 'sinopiaconsulting@gmail.com';
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
          var isActive = (attivo === true || attivo === 1 || String(attivo).toLowerCase() === 'true');
          if (isActive) destinatari.push(em);
        }
      }
    } catch(e2) { errors.push({ source:'mailinglist', err: e2.message }); }
  }
  if (!destinatari.length) return { count:0, errors: errors.concat([{source:'all', err:'nessun destinatario'}]) };
  destinatari = Array.from(new Set(destinatari.map(function(e){ return e.toLowerCase().trim(); })));
  destinatari.forEach(function(email) {
    try {
      // v4.23 GDPR — link di disiscrizione firmato per-destinatario (come i digest)
      var htmlDest = html;
      try { if (typeof _digestUnsubFooter_ === 'function') htmlDest = html.replace('</body>', _digestUnsubFooter_(email) + '</body>'); } catch(_uf){}
      MailApp.sendEmail({
        to:      email,
        subject: subject,
        htmlBody: htmlDest,
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
      scadText += ' <span style="color:#B8351A;font-size:11px;font-weight:700;letter-spacing:.04em">' + (giorni <= 0 ? 'oggi' : giorni + 'gg') + '</span>';
    }
  }

  return '<tr><td style="padding:8px 28px;">' +
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-bottom:1px solid #E8E4DC">' +
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
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-bottom:1px solid #E8E4DC">' +
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
         '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFFFFF;border-bottom:1px solid #E8E4DC">' +
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

// v4.22 CLEANUP — Allineato con Matrix_digest._h_ (aggiunto single-quote escape)
function _h_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
function testInviaDigestGeneralista(emailDest, token) {
  // v4.21 — Auth via token per deploy "Chiunque"
  var tk = token || null;
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(tk)) return { ok:false, error:'forbidden' };
  emailDest = emailDest || 's.straccini@gmail.com';
  Logger.log('=== TEST DIGEST GENERALISTA ===');
  Logger.log('Destinatario test: ' + emailDest);

  try {
    // 1) Genera bozza usando il flusso normale
    Logger.log('--- 1. Generazione bozza ---');
    var draftRes = adminGenerateDigestDraft({
      token: tk, // v4.24.10 FIX — senza token la catena interna falliva 'draft_failed: forbidden' su deploy anonimo
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
    try { sender = Session.getActiveUser().getEmail() || 'sinopiaconsulting@gmail.com'; } catch(e) { sender = 'sinopiaconsulting@gmail.com'; }
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

// ============================================================================
// TESTATA CONDIVISA — design «traiettorie sottotraccia» (approvato 2026-07-18)
// ----------------------------------------------------------------------------
// Stessa testata di DigestService.buildDigestHTML: fondo BIANCO, logo OCS
// allineato a SINISTRA (linkato al sito), data in blu a destra, filetto terra,
// lockup masthead a sinistra, secondo filetto, nav Osservatorio/Segnala/
// Contattaci, icone social in + IG + sito. Email-safe (tabelle, niente flex).
// ============================================================================
function _nlMastheadHtml_(dataLabel) {
  var assets = (typeof _digestAssetUrls_ === 'function') ? _digestAssetUrls_() : {};
  var appUrl = '';
  try { appUrl = ScriptApp.getService().getUrl() || ''; } catch(e) { appUrl = ''; }
  var sito = 'https://sinopia.netlify.app/';
  var linkedin = 'https://www.linkedin.com/company/sinopiaconsulting';
  var instagram = 'https://www.instagram.com/sinopia_osservatorio?igsh=MTFhdjY2ZXZubzVpYg==';
  var logo = assets.logo
    ? '<a href="' + sito + '" style="text-decoration:none"><img src="' + assets.logo + '" alt="OCS — Osservatorio Culturale Sinopia" width="100" height="70" style="display:block;border:0" /></a>'
    : '<a href="' + sito + '" style="text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:28px;color:#111111">OCS</a>';
  var masthead = assets.masthead
    ? '<img src="' + assets.masthead + '" alt="traiettorie sottotraccia" width="301" height="78" style="display:block;border:0" />'
    : '<div style="font-family:Georgia,serif;font-size:34px;color:#111111;text-align:left;line-height:1.1">traiettorie<br>sottotraccia</div>';
  // v4.27.59 — REVISIONE TESTATA (richiesta Silvano 29/07): lockup «traiettorie
  // sottotraccia» CENTRATO in prima riga (il logo OCS resta nel footer), UN solo
  // filetto terra (via il secondo che incorniciava il vecchio blocco logo),
  // data centrata sotto il lockup, riga unica ordinata con tutti i link di
  // accesso: nav + social, centrati e spaziati regolarmente.
  // v4.28.16 — TESTATA RIDISEGNATA (richiesta Silvano 04/08: "sotto il logo
  // c'è disordine, font e colori; logo al centro; pulsanti eleganti che
  // richiamano la home"). Direzione «Graticcio» (DESIGN.md §7, autoritativa).
  //
  // Il disordine aveva cause precise, non generiche:
  //   · due famiglie di colore — data e link in #1F3F8F, un blu ESTRANEO alla
  //     palette del marchio, accanto ai filetti in #A65138
  //   · tre geometrie nelle sole pastiglie social: raggi 6px, 8px e 50%
  //   · nessun pulsante vero: le tre voci erano testo blu separato da punti
  //   · il logo OCS non compariva affatto in testata
  //
  // Ora: un solo asse centrale (logo, data, masthead, navigazione), angoli
  // vivi ovunque, vermiglio del marchio per l'azione, cobalto solo per la
  // data (è un dato, non un titolo), pulsanti pieni/bordati come nella home,
  // una sola geometria per i social. Nessuna ombra, nessun gradiente.
  var VERMIGLIO = '#B8351A', COBALTO = '#1E3A8A', INCHIOSTRO = '#1D1D1F', BORDO = '#D5D0C4';
  function btn(href, testo, primario) {
    return primario
      ? '<a href="' + href + '" style="display:inline-block;background:' + VERMIGLIO + ';color:#ffffff;text-decoration:none;padding:9px 20px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">' + testo + '</a>'
      : '<a href="' + href + '" style="display:inline-block;background:#ffffff;color:' + INCHIOSTRO + ';text-decoration:none;padding:8px 19px;border:1px solid ' + INCHIOSTRO + ';font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">' + testo + '</a>';
  }
  var p = [];
  // il logo apre la testata, centrato: è il primo segno del marchio
  p.push('<tr><td align="center" style="padding:28px 28px 0;background:#FFFFFF">' + logo + '</td></tr>');
  p.push('<tr><td align="center" style="padding:10px 28px 0;background:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:' + COBALTO + '">' + _h_(dataLabel || '') + '</td></tr>');
  p.push('<tr><td style="padding:16px 28px 0;background:#FFFFFF"><div style="border-top:2px solid ' + INCHIOSTRO + ';font-size:0;line-height:0">&nbsp;</div></td></tr>');
  // il lockup sullo stesso asse del logo
  p.push('<tr><td align="center" style="padding:20px 28px 18px;background:#FFFFFF">' + masthead + '</td></tr>');
  p.push('<tr><td style="padding:0 28px;background:#FFFFFF"><div style="border-top:1px solid ' + BORDO + ';font-size:0;line-height:0">&nbsp;</div></td></tr>');
  // navigazione a pulsanti, come nella home del sito
  p.push('<tr><td align="center" style="padding:18px 28px 0;background:#FFFFFF">');
  p.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>');
  p.push('<td style="padding:0 5px">' + btn(sito, 'Osservatorio', true) + '</td>');
  p.push('<td style="padding:0 5px">' + btn(appUrl + '?goto=segnala', 'Segnala', false) + '</td>');
  p.push('<td style="padding:0 5px">' + btn(appUrl + '?goto=consulenza', 'Contattaci', false) + '</td>');
  p.push('</tr></table></td></tr>');
  // social: una sola geometria, quadrata come tutto il resto
  p.push('<tr><td align="center" style="padding:16px 28px 20px;background:#FFFFFF">');
  p.push('<a href="' + linkedin + '" style="display:inline-block;width:26px;height:24px;border:1px solid #6E6A62;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:#6E6A62;text-decoration:none;line-height:24px;margin:0 5px">in</a>');
  p.push('<a href="' + instagram + '" style="display:inline-block;width:26px;height:24px;border:1px solid #6E6A62;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#6E6A62;text-decoration:none;line-height:24px;margin:0 5px">IG</a>');
  p.push('</td></tr>');
  return p.join('');
}

/**
 * v4.28.16 — DIAGNOSI DELLA BOZZA: quante voci porta OGGI ciascuna sezione
 * della newsletter, interrogando gli stessi provider che usa il generatore.
 * Serve a distinguere "sezione vuota perché non ci sono dati" da "sezione
 * esclusa dal mix" da "provider in errore" — senza doverlo dedurre dal
 * risultato finale.
 */
function nlDiagnosiBozza() {
  function prova(nome, fn) {
    try {
      var r = fn();
      var n = Array.isArray(r) ? r.length : (r ? 1 : 0);
      return { voci: n, esito: n > 0 ? 'ok' : 'vuoto' };
    } catch (e) { return { voci: 0, esito: 'ERRORE', errore: e.message }; }
  }
  var home = null;
  try { home = getHomepageDataV42(); } catch (e) { home = { _errore: e.message }; }
  return {
    ok: true,
    versione: (typeof OC_VERSION !== 'undefined' ? OC_VERSION : '?'),
    nota: 'La preview mostra una BOZZA SALVATA: finché non la si rigenera, resta com\'era al momento della creazione.',
    daHomepage: {
      news:    (home && home.news) ? home.news.length : 0,
      podcast: (home && home.podcast) ? home.podcast.length : 0,
      bandiUrgenti: (home && home.bandiUrgenti) ? home.bandiUrgenti.length : 0,
      errore: home && home._errore ? home._errore : null
    },
    bandiRecenti: prova('bandi', function () { return getUltimiBandiMonitorati(8); }),
    video:        prova('video', function () { return getVideoListV42(4); }),
    libri:        prova('libri', function () { return getLibriListV42(4); }),
    segnalazioni: prova('segnalazioni', function () {
      var r = getSegnalazioniPubblicate(3);
      return (r && r.segnalazioni) ? r.segnalazioni : r;
    }),
    segnalazioniGiaInviate: (function () {
      try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('OC_DIGEST_SEGN_SENT') || '[]').length; }
      catch (e) { return 'n/d'; }
    })()
  };
}

/**
 * v4.28.16 — Verifica che la testata rispetti il design system.
 * Controlla il codice GENERATO, non le intenzioni: è il modo per accorgersi
 * di una regressione grafica senza doverla vedere.
 */
function nlTestataSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function ok(nome, cond) { if (cond) pass++; else { fail++; falliti.push(nome); } }
  var h = '';
  try { h = _nlMastheadHtml_('4 agosto 2026'); } catch (e) { return { ok: false, pass: 0, fail: 1, falliti: ['errore: ' + e.message] }; }
  ok('nessun border-radius (angoli vivi)', h.indexOf('border-radius') < 0);
  ok('nessuna ombra', h.indexOf('box-shadow') < 0);
  ok('nessun gradiente', h.indexOf('gradient') < 0);
  ok('blu estraneo #1F3F8F rimosso', h.indexOf('1F3F8F') < 0);
  ok('accento vermiglio presente', h.indexOf('B8351A') > 0);
  ok('cobalto sulla data', h.indexOf('1E3A8A') > 0);
  ok('pulsanti veri (non testo)', h.indexOf('padding:9px 20px') > 0);
  ok('tre voci di navigazione', (h.match(/goto=segnala|goto=consulenza|sinopia\.netlify/g) || []).length >= 3);
  ok('due social, non tre', (h.match(/linkedin|instagram/g) || []).length === 2);
  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}

// ============================================================================
// HEADER-ONLY — per prova di invio "solo testata"
// ============================================================================

/**
 * Costruisce un HTML con la SOLA intestazione del digest:
 * logo/masthead grafico, data (lunedì), editoriale (se approvato),
 * link social e CTA webapp. Nessun bando/news/podcast.
 */
function buildDigestHeaderOnlyHtml_() {
  var data = _prossimoLunedi_();
  var webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch(e) { webUrl = ''; }

  var parts = [];
  parts.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Osservatorio Culturale — Digest</title></head>');
  parts.push('<body style="margin:0;padding:0;background:#E4E0D8;font-family:Inter,Helvetica,Arial,sans-serif;color:#1D1D1F;">');
  parts.push('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#E4E0D8;padding:24px 0;">');
  parts.push('<tr><td align="center">');
  parts.push('<table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#FFFFFF">');

  // v4.27.43 — Testata design «traiettorie sottotraccia» (helper condiviso)
  parts.push(_nlMastheadHtml_(data));

  // Editoriale (se approvato)
  var _editoriale = null;
  try { if (typeof getEditorialeCorrente === 'function') _editoriale = getEditorialeCorrente(); } catch(_){}
  if (_editoriale && _editoriale.testo) {
    parts.push('<tr><td style="padding:20px 28px 4px 28px;">');
    if (_editoriale.foto) parts.push('<img src="' + String(_editoriale.foto) + '" alt="" width="564" style="width:100%;max-width:564px;display:block;margin-bottom:14px"/>');
    parts.push('<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8B3A1F;font-weight:700;margin-bottom:8px;">Approfondimento della settimana</div>');
    parts.push('<div style="font-size:16px;font-weight:700;color:#1D1D1F;margin-bottom:10px;">' + _h_(_editoriale.titolo) + '</div>');
    parts.push('<p style="margin:0;font-size:14px;line-height:1.65;color:#3A3A3C;">' + _h_(_editoriale.testo).replace(/\n/g, '<br>') + '</p>');
    if (_editoriale.firma) parts.push('<div style="margin-top:12px;font-style:italic;font-size:13px;color:#6E6A62;">' + _h_(_editoriale.firma) + '</div>');
    parts.push('<div style="margin-top:14px;border-bottom:1px solid #E5E5E7;padding-bottom:6px"></div>');
    parts.push('</td></tr>');
  }

  // CTA webapp
  if (webUrl) {
    parts.push('<tr><td style="padding:24px 28px 12px;text-align:center;">');
    parts.push('<a href="' + _h_(webUrl) + '" style="display:inline-block;background:#B8351A;color:#FFFFFF;padding:13px 30px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">Apri l&#39;Osservatorio</a>');
    parts.push('</td></tr>');
  }

  // Social links
  parts.push('<tr><td style="padding:12px 28px 8px;text-align:center;">');
  parts.push('<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8A8A8E;margin-bottom:10px;">Seguici</div>');
  parts.push('<a href="https://www.linkedin.com/company/sinopiaconsulting/" style="display:inline-block;background:#FFFFFF;color:#1D1D1F;border:1px solid #1D1D1F;padding:8px 20px;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin:0 4px">LinkedIn</a>');
  parts.push('<a href="https://www.instagram.com/sinopia_osservatorio?igsh=MTFhdjY2ZXZubzVpYg==" style="display:inline-block;background:#FFFFFF;color:#1D1D1F;border:1px solid #1D1D1F;padding:8px 20px;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin:0 4px">Instagram</a>');
  parts.push('<a href="mailto:sinopiaconsulting@gmail.com" style="display:inline-block;background:#FFFFFF;color:#1D1D1F;border:1px solid #1D1D1F;padding:8px 20px;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin:0 4px">Email</a>');
  parts.push('</td></tr>');

  // Footer
  parts.push('<tr><td style="padding:16px 28px 28px 28px;border-top:1px solid #ECECEE;">');
  parts.push('<p style="margin:0;font-size:11px;line-height:1.5;color:#8A8A8E;text-align:center;">&copy; Sinopia Srl unipersonale &middot; Deruta (PG) &middot; Osservatorio Culturale<br>Ricevi questa email in quanto iscritto. Per cancellarti, usa il link di disiscrizione.</p>');
  parts.push('</td></tr>');

  parts.push('</table></td></tr></table></body></html>');
  return parts.join('');
}

/**
 * Prova di invio: manda SOLO l'intestazione del digest (header grafico +
 * editoriale + social links) senza bandi/news/podcast. Per verificare
 * la resa grafica prima dell'invio completo.
 */
function testInviaDigestHeader(emailDest, token) {
  var tk = token || null;
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(tk)) return { ok:false, error:'forbidden' };
  emailDest = emailDest || 's.straccini@gmail.com';
  try {
    var html = buildDigestHeaderOnlyHtml_();
    var sender = '';
    try { sender = Session.getActiveUser().getEmail() || 'sinopiaconsulting@gmail.com'; } catch(e) { sender = 'sinopiaconsulting@gmail.com'; }
    MailApp.sendEmail({
      to:       emailDest,
      subject:  '[PROVA] Osservatorio Culturale — Intestazione digest ' + _prossimoLunedi_(),
      htmlBody: html,
      name:     'Osservatorio Culturale (TEST)',
      replyTo:  sender
    });
    // v4.27.44 — diagnostica asset: conferma se la testata usa i PNG da Drive
    // (logo OCS + lockup materico) o il fallback testuale (= eseguire il tool
    // admin "🖼 Asset grafici digest" per caricarli).
    var _ast = (typeof _digestAssetUrls_ === 'function') ? _digestAssetUrls_() : {};
    return { ok: true, emailSent: emailDest,
      assets: { logoPng: !!_ast.logo, mastheadPng: !!_ast.masthead },
      message: 'Intestazione digest inviata a ' + emailDest
        + (_ast.logo && _ast.masthead ? ' (testata con PNG logo+masthead)' : ' ⚠ ASSET PNG MANCANTI: eseguire "Asset grafici digest" dal pannello') };
  } catch(e) {
    return { ok:false, error: e.message };
  }
}

/**
 * Variante: invia il digest generalista a TUTTI gli iscritti reali
 * della MailingList (bypass workflow Telegram). Solo per test admin.
 * Usare con cautela: se ci sono iscritti reali, riceveranno l'email!
 */
function testInviaDigestATuttiGliIscritti() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
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