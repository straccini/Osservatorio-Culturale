// ============================================================================
// DigestSezioni.js — Sezioni complete della newsletter
// v4.28.15 — 2026-08-03
//
// PROBLEMA: buildDigestHTML riceveva SOLO le news (items raggruppati per
// ambito). Bandi, podcast, video, libri e segnalazioni non entravano affatto,
// salvo un singolo bando lavoro. La newsletter era una rassegna stampa, non
// il digest dell'Osservatorio.
//
// Qui vivono le sezioni mancanti, rese in HTML email-safe (tabelle, stili
// inline, nessuna variabile CSS: i client di posta non le supportano).
//
// DIREZIONE VISIVA — «Graticcio» (DESIGN.md §7, autoritativa):
//   angoli vivi (nessun border-radius), accento vermiglio del marchio,
//   cobalto per dati e conteggi, nessuna ombra, il rilievo lo dà il filetto.
//   Niente bordi laterali colorati (regola esplicita del design system).
// ============================================================================

// Palette del marchio in esadecimale: oklch non è supportato dai client email.
var DS_VERMIGLIO   = '#B8351A';   // accento: azione, urgenza
var DS_COBALTO     = '#1E3A8A';   // dati, conteggi, riferimenti istituzionali
var DS_INCHIOSTRO  = '#1D1D1F';
var DS_INCHIOSTRO2 = '#3A3631';
var DS_INCHIOSTRO3 = '#6E6A62';
var DS_BORDO       = '#E8E4DC';
var DS_BORDO_FORTE = '#D5D0C4';
var DS_CARTA       = '#FAFAF7';

/** Testo sicuro per HTML. */
function _dsEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Taglia senza mozzare le parole a metà. */
function _dsTronca_(s, n) {
  var t = String(s || '').trim();
  if (t.length <= n) return t;
  var tagliato = t.substring(0, n);
  var spazio = tagliato.lastIndexOf(' ');
  return (spazio > n * 0.6 ? tagliato.substring(0, spazio) : tagliato) + '…';
}

function _dsData_(d) {
  if (!d) return '';
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return Utilities.formatDate(dt, 'Europe/Rome', 'd MMM yyyy');
}

/**
 * Testata di sezione: eyebrow in maiuscoletto + filetto pieno.
 * Il conteggio va in cobalto (è un dato), il titolo in inchiostro.
 */
function _dsTestata_(titolo, conteggio, appUrl, goto) {
  var link = (appUrl && goto)
    ? '<a href="' + appUrl + '?goto=' + goto + '" style="color:' + DS_VERMIGLIO +
      ';text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Vedi tutti &rarr;</a>'
    : '';
  return '<tr><td style="padding:30px 0 0">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td align="left" style="font-family:Georgia,serif;font-size:19px;color:' + DS_INCHIOSTRO + ';padding-bottom:6px">'
    + _dsEsc_(titolo)
    + (conteggio ? '<span style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:' + DS_COBALTO + ';padding-left:10px">' + conteggio + '</span>' : '')
    + '</td>'
    + '<td align="right" style="padding-bottom:6px">' + link + '</td>'
    + '</tr></table>'
    + '<div style="border-top:2px solid ' + DS_INCHIOSTRO + ';font-size:0;line-height:0">&nbsp;</div>'
    + '</td></tr>';
}

/** Riga di contenuto: filetto sottile in basso, nessun contenitore, nessuna ombra. */
function _dsRiga_(o) {
  var meta = [];
  if (o.fonte) meta.push(_dsEsc_(_dsTronca_(o.fonte, 34)));
  if (o.data) meta.push(_dsEsc_(o.data));
  var metaHtml = meta.length
    ? '<div style="font-size:11px;color:' + DS_INCHIOSTRO3 + ';letter-spacing:.03em;margin-bottom:5px">' + meta.join(' &middot; ') + '</div>'
    : '';
  // La scadenza è l'informazione che decide: vermiglio, in evidenza, mai un badge tondo
  var scadHtml = o.scadenza
    ? '<div style="font-size:12px;font-weight:700;color:' + DS_VERMIGLIO + ';margin-top:6px">Scadenza ' + _dsEsc_(o.scadenza) + '</div>'
    : '';
  var sommario = o.sommario
    ? '<div style="font-size:13px;line-height:1.6;color:' + DS_INCHIOSTRO2 + ';margin-top:5px">' + _dsEsc_(_dsTronca_(o.sommario, 165)) + '</div>'
    : '';
  var titolo = o.link
    ? '<a href="' + _dsEsc_(o.link) + '" style="color:' + DS_INCHIOSTRO + ';text-decoration:none">' + _dsEsc_(o.titolo) + '</a>'
    : _dsEsc_(o.titolo);
  return '<tr><td style="padding:14px 0;border-bottom:1px solid ' + DS_BORDO + '">'
    + metaHtml
    + '<div style="font-family:Georgia,serif;font-size:15px;line-height:1.35;color:' + DS_INCHIOSTRO + '">' + titolo + '</div>'
    + sommario + scadHtml
    + '</td></tr>';
}

function _dsSezione_(titolo, righe, appUrl, goto) {
  if (!righe || !righe.length) return '';
  return _dsTestata_(titolo, righe.length, appUrl, goto)
    + '<tr><td><table width="100%" cellpadding="0" cellspacing="0">' + righe.join('') + '</table></td></tr>';
}

// ---------------------------------------------------------------------------
// Le sezioni
// ---------------------------------------------------------------------------

/** Bandi con scadenza certa, i più urgenti per primi. Mai bandi senza data. */
function _dsBandi_(appUrl, quanti) {
  try {
    if (typeof getBandiListV42 !== 'function') return '';
    var tutti = getBandiListV42(200) || [];
    var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    var conScad = tutti.filter(function (b) {
      if (!b.scadenza) return false;
      var d = new Date(b.scadenza);
      return !isNaN(d.getTime()) && d.getTime() >= oggi.getTime();
    }).sort(function (a, b) { return new Date(a.scadenza) - new Date(b.scadenza); });
    if (!conScad.length) return '';
    var righe = conScad.slice(0, quanti || 5).map(function (b) {
      return _dsRiga_({
        titolo: b.titolo, fonte: b.ente || b.fonte, link: b.link,
        scadenza: _dsData_(b.scadenza), sommario: b.sommario || b.descrizione
      });
    });
    return _dsSezione_('Bandi in scadenza', righe, appUrl, 'bandi');
  } catch (e) { Logger.log('[DigestSezioni] bandi: ' + e.message); return ''; }
}

function _dsPodcast_(appUrl, quanti) {
  try {
    if (typeof getPodcastListV42 !== 'function') return '';
    var l = (getPodcastListV42(40) || []).slice(0, quanti || 3);
    if (!l.length) return '';
    return _dsSezione_('Podcast', l.map(function (p) {
      return _dsRiga_({ titolo: p.titolo, fonte: p.serie || p.autore, data: _dsData_(p.data), link: p.link, sommario: p.sommario });
    }), appUrl, 'podcast');
  } catch (e) { Logger.log('[DigestSezioni] podcast: ' + e.message); return ''; }
}

function _dsVideo_(appUrl, quanti) {
  try {
    if (typeof getVideoListV42 !== 'function') return '';
    var l = (getVideoListV42(40) || []).slice(0, quanti || 3);
    if (!l.length) return '';
    return _dsSezione_('Video', l.map(function (v) {
      return _dsRiga_({ titolo: v.titolo, fonte: v.canale, data: _dsData_(v.data), link: v.link });
    }), appUrl, 'video');
  } catch (e) { Logger.log('[DigestSezioni] video: ' + e.message); return ''; }
}

function _dsLibri_(appUrl, quanti) {
  try {
    if (typeof getLibriListV42 !== 'function') return '';
    var l = (getLibriListV42(40) || []).slice(0, quanti || 3);
    if (!l.length) return '';
    return _dsSezione_('Pubblicazioni', l.map(function (b) {
      var f = [b.autore, b.editore, b.anno].filter(Boolean).join(', ');
      return _dsRiga_({ titolo: b.titolo, fonte: f, link: b.link, sommario: b.descrizione });
    }), appUrl, 'libri');
  } catch (e) { Logger.log('[DigestSezioni] libri: ' + e.message); return ''; }
}

/** Segnalazioni dalla comunità: sono il contributo dei lettori, vanno viste. */
function _dsSegnalazioni_(appUrl, quanti) {
  try {
    if (typeof getSegnalazioniPubblicate !== 'function') return '';
    var l = (getSegnalazioniPubblicate(20) || []).slice(0, quanti || 3);
    if (!l.length) return '';
    return _dsSezione_('Segnalato dalla comunità', l.map(function (s) {
      return _dsRiga_({
        titolo: s.titolo || s.Titolo, fonte: s.autore || s.Ente || s.ente,
        link: s.link || s.Link, data: _dsData_(s.data || s.Data),
        sommario: s.descrizione || s.Descrizione
      });
    }), appUrl, 'segnala');
  } catch (e) { Logger.log('[DigestSezioni] segnalazioni: ' + e.message); return ''; }
}

/** Norme: poche, ma quando ci sono contano. */
function _dsNorme_(appUrl, quanti) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : null;
    var sh = ss && ss.getSheetByName('Norme');
    if (!sh || sh.getLastRow() < 2) return '';
    var v = sh.getDataRange().getValues();
    var h = v[0].map(function (x) { return String(x || '').trim(); });
    var iT = h.indexOf('Titolo'), iL = h.indexOf('Link'), iD = h.indexOf('DataAggiunta'),
        iF = h.indexOf('Fonte'), iS = h.indexOf('Descrizione');
    if (iT < 0) return '';
    var righe = [];
    for (var r = v.length - 1; r >= 1 && righe.length < (quanti || 2); r--) {
      if (!v[r][iT]) continue;
      righe.push(_dsRiga_({
        titolo: v[r][iT], link: iL >= 0 ? v[r][iL] : '', fonte: iF >= 0 ? v[r][iF] : '',
        data: iD >= 0 ? _dsData_(v[r][iD]) : '', sommario: iS >= 0 ? v[r][iS] : ''
      }));
    }
    return _dsSezione_('Norme e regolamenti', righe, appUrl, 'norme');
  } catch (e) { Logger.log('[DigestSezioni] norme: ' + e.message); return ''; }
}

/**
 * Tutte le sezioni oltre le news, nell'ordine di importanza per il lettore:
 * ciò che scade prima, poi ciò che si ascolta e si legge, poi la comunità.
 * Ogni sezione è indipendente: se una fallisce o è vuota, semplicemente non
 * compare e le altre restano.
 * @param {string} appUrl  URL della webapp per i link "vedi tutti"
 * @param {Object} [mix]   quantità per sezione; 0 esclude
 */
function digestSezioniComplete(appUrl, mix) {
  mix = mix || {};
  function q(nome, def) { return (mix[nome] === undefined) ? def : Number(mix[nome]); }
  var out = '';
  if (q('bandi', 5))        out += _dsBandi_(appUrl, q('bandi', 5));
  if (q('norme', 2))        out += _dsNorme_(appUrl, q('norme', 2));
  if (q('podcast', 3))      out += _dsPodcast_(appUrl, q('podcast', 3));
  if (q('video', 3))        out += _dsVideo_(appUrl, q('video', 3));
  if (q('libri', 3))        out += _dsLibri_(appUrl, q('libri', 3));
  if (q('segnalazioni', 3)) out += _dsSegnalazioni_(appUrl, q('segnalazioni', 3));
  return out;
}

/**
 * Diagnostica: quante righe produrrebbe ogni sezione adesso. Serve a capire
 * se una sezione manca perché è vuota o perché è rotta — la distinzione che
 * questo progetto insegue da giorni.
 */
function digestSezioniStato() {
  var appUrl = '';
  try { appUrl = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  function conta(fn, nome) {
    try {
      var html = fn(appUrl, 99);
      var n = (html.match(/border-bottom:1px solid/g) || []).length;
      return { righe: n, reso: html.length > 0 };
    } catch (e) { return { errore: e.message }; }
  }
  return {
    ok: true,
    bandi: conta(_dsBandi_),
    norme: conta(_dsNorme_),
    podcast: conta(_dsPodcast_),
    video: conta(_dsVideo_),
    libri: conta(_dsLibri_),
    segnalazioni: conta(_dsSegnalazioni_)
  };
}

// ---------------------------------------------------------------------------
// Self-test (offline: nessuna lettura di fogli)
// ---------------------------------------------------------------------------

function dsSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function ok(nome, cond) { if (cond) pass++; else { fail++; falliti.push(nome); } }

  ok('escape < >', _dsEsc_('<script>') === '&lt;script&gt;');
  ok('escape virgolette', _dsEsc_('a"b') === 'a&quot;b');
  ok('null gestito', _dsEsc_(null) === '');
  ok('tronca sulle parole', _dsTronca_('parola molto lunga da tagliare', 12).indexOf('…') > 0);
  ok('non tronca se corto', _dsTronca_('breve', 20) === 'breve');

  var riga = _dsRiga_({ titolo: 'T', link: 'https://x.it', scadenza: '1 set 2026' });
  // DESIGN.md: angoli vivi, niente ombre, niente bordi laterali colorati
  ok('nessun border-radius', riga.indexOf('border-radius') < 0);
  ok('nessuna ombra', riga.indexOf('box-shadow') < 0);
  ok('nessun bordo laterale', riga.indexOf('border-left') < 0 && riga.indexOf('border-right') < 0);
  ok('nessun gradiente', riga.indexOf('gradient') < 0);
  ok('scadenza in vermiglio', riga.indexOf(DS_VERMIGLIO) > 0);

  var t = _dsTestata_('Bandi', 5, 'https://app', 'bandi');
  ok('conteggio in cobalto', t.indexOf(DS_COBALTO) > 0);
  ok('testata senza radius', t.indexOf('border-radius') < 0);

  ok('sezione vuota non rende nulla', _dsSezione_('X', [], '', '') === '');
  ok('mix a zero esclude', digestSezioniComplete('', { bandi: 0, norme: 0, podcast: 0, video: 0, libri: 0, segnalazioni: 0 }) === '');

  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
