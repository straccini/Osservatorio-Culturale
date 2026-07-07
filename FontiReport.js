/**
 * ============================================================================
 *  FontiReport.js — Skill FONTI giornaliera (salute fonti + aggregatori + link bandi)
 * ============================================================================
 *  Autore: Claude (Cowork) per Silvano Straccini / Sinopia — 2026-06-26
 *
 *  Report giornaliero nativo GAS ("Binario B") che copre:
 *   #1  fonti silenti / in errore (riusa qaFontiSilenti + anteprimaFontiMorte)
 *   #3  outage degli aggregatori critici (TED, ANAC/BDNCP, Creative Europe, CORDIS,
 *       EU Funding&Tenders, MiC) + top fonti news andate a zero
 *   #4  bandi che NON puntano a un link specifico (homepage/sezione invece del bando)
 *  e invia il report via email all'admin.
 *
 *  La scoperta di nuove fonti (#2) richiede la ricerca web: gira nel cloud-agent
 *  (skill schedulata) che, per i candidati verificati, chiama fontiAggiungiFeedVerificato().
 *
 *  Funzioni pubbliche:
 *    fontiReportSetupTrigger()        — trigger giornaliero (08:00)
 *    fontiReportGiornaliero()         — esegue e INVIA il report (target trigger)
 *    fontiReportAnteprima()           — esegue e ritorna il report SENZA inviare
 *    fontiAggiungiFeedVerificato(...) — #2: testa e auto-iscrive un feed RSS news
 * ============================================================================
 */

var FR_ORA = 8;
var FR_DEST_DEFAULT = 's.straccini@gmail.com';

// Aggregatori critici da sorvegliare (#3). reachable = HTTP 2xx/3xx.
var FR_AGGREGATORI = [
  { nome: 'TED — Tenders Electronic Daily (UE)', url: 'https://ted.europa.eu/en/', cat: 'bandi UE' },
  { nome: 'ANAC BDNCP — Pubblicità Legale (bandi aperti)', url: 'https://pubblicitalegale.anticorruzione.it/', cat: 'appalti IT' }, // NON dati.anticorruzione.it (opendata WAF-bloccato, storico → non usato)
  { nome: 'Creative Europe (UE)', url: 'https://culture.ec.europa.eu/creative-europe', cat: 'bandi cultura UE' },
  { nome: 'CORDIS (UE)', url: 'https://cordis.europa.eu/', cat: 'progetti UE' },
  { nome: 'EU Funding & Tenders Portal', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home', cat: 'bandi UE' },
  { nome: 'MiC — Ministero della Cultura (IT)', url: 'https://cultura.gov.it/', cat: 'istituzionale IT' }
];

// ----------------------------------------------------------------------------
// TRIGGER
// ----------------------------------------------------------------------------
function fontiReportSetupTrigger() {
  var rimossi = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'fontiReportGiornaliero') { ScriptApp.deleteTrigger(t); rimossi++; }
  });
  try {
    ScriptApp.newTrigger('fontiReportGiornaliero').timeBased().everyDays(1).atHour(FR_ORA).create();
  } catch (e) {
    var tot = ScriptApp.getProjectTriggers().length;
    return { ok: false, error: e.message, triggerPresenti: tot, suggerimento: 'Esegui qaDeduplicaTrigger() per liberare uno slot.' };
  }
  return { ok: true, rimossi: rimossi, ora: FR_ORA };
}

// ----------------------------------------------------------------------------
// ENTRYPOINT
// ----------------------------------------------------------------------------
function fontiReportGiornaliero() {
  var rep = _frEsegui_();
  try {
    var dest = (typeof _qaDestinatario_ === 'function') ? _qaDestinatario_() : FR_DEST_DEFAULT;
    MailApp.sendEmail({ to: dest, subject: 'Report FONTI Osservatorio — ' + rep.data, htmlBody: _frEmailHtml_(rep) });
    rep.emailInviata = dest;
  } catch (e) { rep.errori.push('Email: ' + e.message); }
  return rep;
}

function fontiReportAnteprima() {
  var rep = _frEsegui_();
  Logger.log(JSON.stringify(rep, null, 2));
  return rep;
}

function _frEsegui_() {
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var rep = {
    data: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'),
    silenti: null, morteRss: null, aggregatori: null, topAZero: null, bandiLink: null, errori: []
  };

  // #1 — silenti + morte
  try { if (typeof qaFontiSilenti === 'function') { var s = qaFontiSilenti(14); rep.silenti = { totale: s.totaleSilenti, fonti: (s.fonti || []).slice(0, 15) }; } } catch (e) { rep.errori.push('Silenti: ' + e.message); }
  try { if (typeof anteprimaFontiMorte === 'function') { var m = anteprimaFontiMorte(); if (m && m.ok) rep.morteRss = { candidate: m.candidate, fonti: (m.fonti || []).slice(0, 15) }; } } catch (e) { rep.errori.push('Morte: ' + e.message); }

  // #3a — aggregatori critici
  try { rep.aggregatori = _frAggregatori_(); } catch (e) { rep.errori.push('Aggregatori: ' + e.message); }
  // #3b — top fonti news andate a zero/errore
  try { rep.topAZero = _frTopFontiKO_(); } catch (e) { rep.errori.push('TopKO: ' + e.message); }

  // #4 — bandi senza link specifico
  try { rep.bandiLink = _frBandiLink_(); } catch (e) { rep.errori.push('BandiLink: ' + e.message); }

  return rep;
}

// ----------------------------------------------------------------------------
// #3a — reachability aggregatori
// ----------------------------------------------------------------------------
function _frAggregatori_() {
  return FR_AGGREGATORI.map(function(a) {
    var stato = 'OK', codice = 0;
    try {
      var resp = UrlFetchApp.fetch(a.url, { muteHttpExceptions: true, followRedirects: true, deadline: 12, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioBot/1.0)' } });
      codice = resp.getResponseCode();
      if (codice < 200 || codice >= 400) stato = 'KO (HTTP ' + codice + ')';
    } catch (e) { stato = 'IRRAGGIUNGIBILE'; }
    return { nome: a.nome, cat: a.cat, stato: stato, codice: codice };
  });
}

// ----------------------------------------------------------------------------
// #3b — top fonti per volume andate KO (EMPTY/ERROR o ferme)
// ----------------------------------------------------------------------------
function _frTopFontiKO_() {
  var sh = (typeof _qaSheet_ === 'function') ? _qaSheet_('FontiFeed') : null;
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues(); var h = v[0];
  function c(n) { return h.indexOf(n); }
  var iNome = c('Nome'), iAtt = c('Attiva'), iEsito = c('UltimoEsito'), iTot = c('NRecordTotali'), iUlt = c('NRecordUltimo');
  var rows = [];
  for (var r = 1; r < v.length; r++) {
    if (!v[r][0]) continue;
    if (!(v[r][iAtt] === true || String(v[r][iAtt]).toUpperCase() === 'TRUE')) continue;
    rows.push({ nome: String(v[r][iNome] || ''), tot: Number(v[r][iTot] || 0), ult: Number(v[r][iUlt] || 0), esito: String(v[r][iEsito] || '') });
  }
  rows.sort(function(a, b) { return b.tot - a.tot; });
  // top 12 per volume storico → segnala quelle con ultimo esito EMPTY/ERROR
  return rows.slice(0, 12).filter(function(x) {
    var e = x.esito.toUpperCase();
    return e.indexOf('EMPTY') === 0 || e.indexOf('ERROR') === 0;
  });
}

// ----------------------------------------------------------------------------
// #4 — bandi senza link specifico (homepage/sezione invece del bando)
// ----------------------------------------------------------------------------
function _frLinkGenerico_(url) {
  url = String(url || '').trim();
  if (!url) return 'vuoto';
  if (!/^https?:\/\//i.test(url)) return 'non-url';
  var senzaProto = url.replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  var parti = senzaProto.split('/');
  // solo dominio (es. ente.it) → generico
  if (parti.length <= 1) return 'homepage';
  // path corto e senza identificatore (no cifre, no slug lungo) → probabile sezione generica
  var path = parti.slice(1).join('/');
  var haId = /\d{2,}/.test(path) || /[a-z0-9-]{12,}/i.test(parti[parti.length - 1]);
  if (path.length < 6 || !haId) return 'sezione-generica';
  return '';
}

function _frBandiLink_() {
  var sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
  if (!sh || sh.getLastRow() < 2) return { attivi: 0, problemi: 0, dettaglio: [] };
  var v = sh.getDataRange().getValues(); var h = v[0];
  var iLink = h.indexOf('LINK'); if (iLink < 0) iLink = h.indexOf('Link'); if (iLink < 0) iLink = 12; // COL.LINK=13 → idx 12
  var iTit = h.indexOf('Titolo'); if (iTit < 0) iTit = 1;
  var iEnte = h.indexOf('Ente'); if (iEnte < 0) iEnte = 2;
  var iStato = h.indexOf('StatoRecord');
  var attivi = 0, problemi = 0, dettaglio = [];
  for (var r = 1; r < v.length; r++) {
    if (!v[r][iTit] && !v[r][0]) continue;
    if (iStato >= 0 && String(v[r][iStato]).toLowerCase() === 'archiviato') continue;
    attivi++;
    var motivo = _frLinkGenerico_(v[r][iLink]);
    if (motivo) {
      problemi++;
      if (dettaglio.length < 20) dettaglio.push({ titolo: String(v[r][iTit] || '').slice(0, 70), ente: String(v[r][iEnte] || '').slice(0, 40), link: String(v[r][iLink] || ''), motivo: motivo });
    }
  }
  return { attivi: attivi, problemi: problemi, perc: attivi ? Math.round(problemi * 100 / attivi) : 0, dettaglio: dettaglio };
}

// ----------------------------------------------------------------------------
// #2 — auto-iscrizione di un feed RSS news verificato (chiamata dal discovery)
// Gate: HTTP 200 + contenuto RSS + non già presente. Audit in Note.
// ----------------------------------------------------------------------------
function fontiAggiungiFeedVerificato(url, nome, ambito, gruppo) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) return { ok: false, error: 'URL non valido' };
    var sh = (typeof _qaSheet_ === 'function') ? _qaSheet_('FontiFeed') : getMainSS().getSheetByName('FontiFeed');
    if (!sh) return { ok: false, error: 'FontiFeed assente' };
    var v = sh.getDataRange().getValues(); var h = v[0];
    var iFeed = h.indexOf('URL_Feed');
    // dedup: già presente?
    var norm = (typeof _normalizeFeedUrl_ === 'function') ? _normalizeFeedUrl_(url) : String(url).toLowerCase();
    for (var r = 1; r < v.length; r++) {
      var ex = (typeof _normalizeFeedUrl_ === 'function') ? _normalizeFeedUrl_(v[r][iFeed]) : String(v[r][iFeed]).toLowerCase();
      if (ex && ex === norm) return { ok: false, error: 'già presente', nome: String(v[r][1] || '') };
    }
    // gate accessibilità + RSS valido
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, deadline: 10, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher/4.0)' } });
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'HTTP ' + resp.getResponseCode() };
    var ct = resp.getContentText('UTF-8') || '';
    if (ct.indexOf('<?xml') < 0 && ct.indexOf('<rss') < 0 && ct.indexOf('<feed') < 0) return { ok: false, error: 'non è un feed RSS' };
    var amb = Number(ambito) || 1; if (amb < 1 || amb > 5) amb = 1;
    var ambLbl = (typeof AMBITO_LABEL !== 'undefined' && AMBITO_LABEL[amb]) ? AMBITO_LABEL[amb] : '';
    var id = 'FF' + Date.now();
    // riga conforme a FONTIFEED_HEADERS (20 col)
    sh.appendRow([id, String(nome || url), String(gruppo || 'Auto-discovery'), 'rss', url, '', amb, ambLbl,
      '', '', 3, true, new Date(), '', '', 0, 0, 0, '', 'Auto-iscritta (QA discovery) 2026-06-26 — verificata RSS valido']);
    Logger.log('fontiAggiungiFeedVerificato: aggiunta "' + nome + '" (' + url + ')');
    return { ok: true, id: id, nome: String(nome || url), ambito: amb };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Batch curato: aggiunge le fonti RSS già verificate (discovery Via 1).
 * Ogni candidato passa per il cancello fontiAggiungiFeedVerificato (ri-testa HTTP+RSS+dedup).
 * I 403 dal mio fetch (Europeana Pro/Artslife) spesso passano dalla rete GAS: se falliscono,
 * vengono saltati in sicurezza.
 */
function fontiAggiungiBatch() {
  var candidati = [
    { url: 'https://www.inexhibit.com/feed/',            nome: 'Inexhibit',             ambito: 1 }, // museografia/allestimenti
    { url: 'https://www.europanostra.org/feed/',         nome: 'Europa Nostra',         ambito: 1 }, // patrimonio/heritage UE
    { url: 'https://hyperallergic.com/feed/',            nome: 'Hyperallergic',         ambito: 3 }, // arte contemporanea
    { url: 'https://www.digitalmeetsculture.net/feed/',  nome: 'Digital Meets Culture', ambito: 5 }, // digital heritage
    { url: 'https://pro.europeana.eu/rss/news.rss',      nome: 'Europeana Pro',         ambito: 5 }, // (403 dal mio fetch: testare da GAS)
    { url: 'https://www.artslife.com/feed/',             nome: 'Artslife',              ambito: 3 }  // (403 dal mio fetch: testare da GAS)
  ];
  var esiti = candidati.map(function(c) {
    var r = fontiAggiungiFeedVerificato(c.url, c.nome, c.ambito, 'Discovery-curata 2026-06');
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e) { return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('fontiAggiungiBatch: ' + aggiunte + '/' + candidati.length + ' aggiunte\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

/**
 * Batch ADDITIVI VERIFICATI (pipeline news): feed RSS controllati uno per uno (HTTP 200 + RSS
 * valido) durante la verifica profonda del 2026-06-28. Tutti tematici/basso rumore.
 *  - Regioni.it Cultura + Turismo (URL per-sezione dall'indice ufficiale regioni.it/feed.php)
 *  - Riviste d'arte: Arte Magazine, Juliet, Espoarte (feed verificati validi)
 * Ogni candidato ripassa per fontiAggiungiFeedVerificato (HTTP200 + RSS + dedup + audit).
 * NB: esclusi di proposito (verifica): Gazzetta 5ª Serie (tutti i contratti = alto rumore, serve
 * connettore bandi dedicato), Senato (403/WAF), SEDIA EU (richiede POST → test lato GAS).
 */
function fontiAggiungiBatchIstituzionali() {
  var candidati = [
    { url: 'https://www.regioni.it/feed/news/cultura/', nome: 'Regioni.it — Cultura', ambito: 4 }, // comunità/territorio
    { url: 'https://www.regioni.it/feed/news/turismo/', nome: 'Regioni.it — Turismo', ambito: 1 }, // identità/territorio
    { url: 'https://www.artemagazine.it/feed/',          nome: 'Arte Magazine',        ambito: 3 }, // mostre/musei
    { url: 'https://www.juliet-artmagazine.com/feed/',   nome: 'Juliet Art Magazine',  ambito: 3 }, // arte contemporanea
    { url: 'https://www.espoarte.net/feed/',             nome: 'Espoarte',             ambito: 3 }  // arte contemporanea
  ];
  var esiti = candidati.map(function(c) {
    var r = fontiAggiungiFeedVerificato(c.url, c.nome, c.ambito, 'Istituzionali-discovery 2026-06');
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e) { return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('fontiAggiungiBatchIstituzionali: ' + aggiunte + '/' + candidati.length + '\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

/**
 * T2 ESTERO — Batch fonti internazionali VERIFICATE live (curl, 2026-07-07):
 *  - Res Artis (resartis.org/feed/) — rete mondiale residenze artistiche, 123 item
 *  - On the Move (on-the-move.org/feed) — finanziamenti mobilità culturale internazionale
 *  - AAM American Alliance of Museums (aam-us.org/feed/) — musei USA
 * NON disponibili (verificato): e-flux (nessun RSS pubblico), TransArtists (404),
 * ArtRabbit (404), Museums Association UK (feed vuoto), culture360 (502),
 * NEMO (nessun feed). Ogni candidato ripassa dal gate fontiAggiungiFeedVerificato.
 */
function fontiAggiungiBatchEstero() {
  var candidati = [
    { url: 'https://resartis.org/feed/',      nome: 'Res Artis — Residenze',      ambito: 3 }, // open call residenze mondiali
    { url: 'https://on-the-move.org/feed',    nome: 'On the Move — Mobilità',     ambito: 3 }, // funding mobilità artisti/operatori
    { url: 'https://www.aam-us.org/feed/',    nome: 'AAM — Alliance of Museums',  ambito: 1 }  // musei USA/internazionale
  ];
  var esiti = candidati.map(function(c) {
    var r = fontiAggiungiFeedVerificato(c.url, c.nome, c.ambito, 'Estero-T2 2026-07');
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e) { return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('fontiAggiungiBatchEstero: ' + aggiunte + '/' + candidati.length + '\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

// ----------------------------------------------------------------------------
// EMAIL
// ----------------------------------------------------------------------------
function _frEmailHtml_(rep) {
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var agg = (rep.aggregatori || []).map(function(a) {
    var ko = a.stato !== 'OK';
    return '<tr><td style="padding:5px 10px;border-bottom:1px solid #eee;font-size:12.5px">' + esc(a.nome) + '</td>'
      + '<td style="padding:5px 10px;border-bottom:1px solid #eee;font-size:12px;color:#888">' + esc(a.cat) + '</td>'
      + '<td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:' + (ko ? '#B3261E' : '#3F7A5E') + '">' + esc(a.stato) + '</td></tr>';
  }).join('');
  var aggKO = (rep.aggregatori || []).filter(function(a) { return a.stato !== 'OK'; }).length;

  var sil = rep.silenti ? rep.silenti.totale : '—';
  var morte = rep.morteRss ? rep.morteRss.candidate : '—';
  var topko = (rep.topAZero || []).map(function(x) { return '<li style="font-size:12.5px;color:#B3261E">' + esc(x.nome) + ' — ' + esc(x.esito) + ' (storico ' + x.tot + ' record)</li>'; }).join('') || '<li style="font-size:12.5px;color:#3F7A5E">nessuna top-fonte ferma</li>';

  var bl = rep.bandiLink || { attivi: 0, problemi: 0, perc: 0, dettaglio: [] };
  var blRows = (bl.dettaglio || []).slice(0, 12).map(function(d) {
    return '<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px">' + esc(d.titolo) + '</td>'
      + '<td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;color:#888">' + esc(d.ente) + '</td>'
      + '<td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;color:#A35200">' + esc(d.motivo) + '</td></tr>';
  }).join('');

  var err = rep.errori.length ? '<div style="margin-top:12px;padding:8px 12px;background:#FDF3F3;border:1px solid #F3C9C9;border-radius:8px;font-size:12px;color:#B3261E">Anomalie: ' + rep.errori.map(esc).join(' · ') + '</div>' : '';

  return '<div style="font-family:-apple-system,Arial,sans-serif;max-width:660px;margin:0 auto;color:#1a1a1a">'
    + '<div style="background:#1a1a1a;padding:18px 22px;border-radius:12px 12px 0 0"><div style="font-family:Georgia,serif;font-style:italic;font-size:20px;color:#E89B7C">Sinopia</div><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#bbb;margin-top:4px">Report FONTI &middot; ' + esc(rep.data) + '</div></div>'
    + '<div style="border:1px solid #e8e5e0;border-top:none;border-radius:0 0 12px 12px;padding:18px 22px">'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
    + '<div style="flex:1;min-width:120px;background:' + (aggKO ? '#FDF3F3' : '#E5EFE7') + ';border-radius:8px;padding:10px 12px"><div style="font-size:22px;font-weight:700;color:' + (aggKO ? '#B3261E' : '#3F7A5E') + '">' + aggKO + '</div><div style="font-size:11px;color:#666">aggregatori KO</div></div>'
    + '<div style="flex:1;min-width:120px;background:#F3EDE4;border-radius:8px;padding:10px 12px"><div style="font-size:22px;font-weight:700;color:#8B3A1F">' + sil + '</div><div style="font-size:11px;color:#666">fonti silenti</div></div>'
    + '<div style="flex:1;min-width:120px;background:#F3EDE4;border-radius:8px;padding:10px 12px"><div style="font-size:22px;font-weight:700;color:#8B3A1F">' + morte + '</div><div style="font-size:11px;color:#666">RSS morte (0 record)</div></div>'
    + '<div style="flex:1;min-width:120px;background:#F3EDE4;border-radius:8px;padding:10px 12px"><div style="font-size:22px;font-weight:700;color:#A35200">' + bl.problemi + '</div><div style="font-size:11px;color:#666">bandi link generico (' + bl.perc + '%)</div></div>'
    + '</div>'
    + '<h3 style="font-size:13px;margin:14px 0 6px;color:#8B3A1F">Aggregatori critici (#3)</h3>'
    + '<table style="width:100%;border-collapse:collapse">' + agg + '</table>'
    + '<h3 style="font-size:13px;margin:16px 0 6px;color:#8B3A1F">Top fonti news ferme (#3)</h3><ul style="margin:0;padding-left:18px">' + topko + '</ul>'
    + '<h3 style="font-size:13px;margin:16px 0 6px;color:#8B3A1F">Bandi senza link specifico (#4) — ' + bl.problemi + ' su ' + bl.attivi + '</h3>'
    + (blRows ? '<table style="width:100%;border-collapse:collapse">' + blRows + '</table>' : '<div style="font-size:12px;color:#3F7A5E">tutti i bandi hanno un link specifico</div>')
    + '<div style="margin-top:14px;font-size:11.5px;color:#999">#1 silenti/morte: dettaglio con qaFontiSilenti()/qaDiagnosiFontiMorte(). #2 scoperta nuove fonti: gira nel discovery (cloud-agent) → fontiAggiungiFeedVerificato().</div>'
    + err
    + '</div></div>';
}
