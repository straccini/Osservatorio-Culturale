// ============================================================================
//  Discovery_v1.js — TAPPA P (podcast/video) + TAPPA 4 (social inbound)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · 2026-07-10
//  Piano: docs/PIANO_SVILUPPO_OCS_2026-07.md (Tappa P, Tappa 4)
//
//  TAPPA P — PODCAST: il parco fonti podcast era statico. Qui: (a) variante
//  podcast del gate di iscrizione (scrive FontiFeed con tipo='podcast'), (b) un
//  batch di podcast museali/culturali VERIFICATI live (curl, 2026-07-10), (c)
//  audit del parco podcast/video per capire quante fonti sono mute.
//
//  TAPPA 4 — SOCIAL INBOUND: monitoraggio dei profili istituzionali via RSS
//  pubblici (Mastodon: profilo + '.rss'). Aggiunge come fonti news solo i feed
//  verificati live. Instagram/X/Facebook = niente RSS pubblico → esclusi (il
//  canale "social-like" già attivo è scanNewsletterGmail).
//
//  Tutto ADDITIVO: passa dal gate (HTTP 200 + feed valido + dedup). Idempotente.
// ============================================================================

// ----------------------------------------------------------------------------
//  Gate generico per-tipo (podcast/video/rss) — clone di fontiAggiungiFeedVerificato
// ----------------------------------------------------------------------------
function _discAggiungiFeed_(url, nome, ambito, gruppo, tipo, urlSito) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) return { ok: false, error: 'URL non valido' };
    tipo = (tipo === 'video' || tipo === 'podcast') ? tipo : 'rss';
    var sh = (typeof _qaSheet_ === 'function') ? _qaSheet_('FontiFeed') : getMainSS().getSheetByName('FontiFeed');
    if (!sh) return { ok: false, error: 'FontiFeed assente' };
    var v = sh.getDataRange().getValues(); var h = v[0];
    var iFeed = h.indexOf('URL_Feed');
    var norm = (typeof _normalizeFeedUrl_ === 'function') ? _normalizeFeedUrl_(url) : String(url).toLowerCase();
    for (var r = 1; r < v.length; r++) {
      var ex = (typeof _normalizeFeedUrl_ === 'function') ? _normalizeFeedUrl_(v[r][iFeed]) : String(v[r][iFeed]).toLowerCase();
      if (ex && ex === norm) return { ok: false, error: 'già presente', nome: String(v[r][1] || '') };
    }
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, deadline: 12, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher/4.0)' } });
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'HTTP ' + resp.getResponseCode() };
    var ct = resp.getContentText('UTF-8') || '';
    if (ct.indexOf('<?xml') < 0 && ct.indexOf('<rss') < 0 && ct.indexOf('<feed') < 0) return { ok: false, error: 'non è un feed valido' };
    var amb = Number(ambito) || 1; if (amb < 1 || amb > 5) amb = 1;
    var ambLbl = (typeof AMBITO_LABEL !== 'undefined' && AMBITO_LABEL[amb]) ? AMBITO_LABEL[amb] : '';
    var id = 'FF' + Date.now() + Math.floor(Math.random() * 1000);
    var categoria = tipo === 'podcast' ? 'podcast' : (tipo === 'video' ? 'video' : 'social');
    sh.appendRow([id, String(nome || url), String(gruppo || 'Discovery'), tipo, url, String(urlSito || ''), amb, ambLbl,
      '', categoria, 3, true, new Date(), '', '', 0, 0, 0, '', 'Discovery verificata 2026-07-10 (' + tipo + ')']);
    Utilities.sleep(30);
    Logger.log('_discAggiungiFeed_ [' + tipo + ']: aggiunta "' + nome + '" (' + url + ')');
    return { ok: true, id: id, nome: String(nome || url), ambito: amb, tipo: tipo };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ============================================================================
//  TAPPA P — BATCH PODCAST museali/culturali (verificati live 2026-07-10)
// ============================================================================
function fontiAggiungiBatchPodcast() {
  var candidati = [
    { url: 'https://www.spreaker.com/show/4782449/episodes/feed', nome: 'FMStreaming — Fondazione Musei Senesi', ambito: 1, sito: 'https://www.museisenesi.org' },
    { url: 'https://www.spreaker.com/show/4917700/episodes/feed', nome: "L'arte con chi ne fa parte — Abbonamento Musei", ambito: 1, sito: 'https://abbonamentomusei.it' },
    { url: 'https://www.spreaker.com/show/5687484/episodes/feed', nome: 'Contemporaneamente — Firmani (Artribune/Treccani)', ambito: 3, sito: 'https://www.artribune.com' },
    { url: 'https://www.spreaker.com/show/5954500/episodes/feed', nome: 'Visto Italia — Collezione Farnesina (exibart)', ambito: 3, sito: 'https://www.exibart.com' }
  ];
  var esiti = candidati.map(function(c) {
    var r = _discAggiungiFeed_(c.url, c.nome, c.ambito, 'Podcast-cultura T-P 2026-07', 'podcast', c.sito);
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e) { return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('fontiAggiungiBatchPodcast: ' + aggiunte + '/' + candidati.length + '\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

// ============================================================================
//  TAPPA P — AUDIT parco podcast/video: quante fonti mute (0 record o vecchie)
// ============================================================================
function podcastAuditFonti() {
  var rep = { ok: true, podcast: { totali: 0, attive: 0, mute: 0, fonti: [] }, video: { totali: 0, attive: 0, mute: 0, fonti: [] } };
  try {
    var sh = (typeof getMainSS === 'function') ? getMainSS().getSheetByName('FontiFeed') : null;
    if (!sh || sh.getLastRow() < 2) { rep.ok = false; rep.error = 'FontiFeed assente'; return rep; }
    var v = sh.getDataRange().getValues(); var h = v[0].map(String);
    function c(n){ return h.indexOf(n); }
    var iNome = c('Nome'), iTipo = c('Tipo'), iAtt = c('Attiva'), iTot = c('NRecordTotali'), iScan = c('UltimaScan'), iEsito = c('UltimoEsito');
    var oraMs = Date.now();
    for (var r = 1; r < v.length; r++) {
      if (!v[r][0]) continue;
      var tipo = String(v[r][iTipo] || '').toLowerCase();
      if (tipo !== 'podcast' && tipo !== 'video') continue;
      var g = rep[tipo]; g.totali++;
      var att = v[r][iAtt] === true || String(v[r][iAtt]).toUpperCase() === 'TRUE';
      if (!att) continue;
      g.attive++;
      var tot = Number(v[r][iTot] || 0);
      var scan = v[r][iScan]; var scanDate = (scan instanceof Date) ? scan : (scan ? new Date(scan) : null);
      var gg = (scanDate && !isNaN(scanDate.getTime())) ? Math.round((oraMs - scanDate.getTime()) / 86400000) : null;
      var esito = String(v[r][iEsito] || '').toUpperCase();
      var muta = tot === 0 || esito.indexOf('EMPTY') === 0 || esito.indexOf('ERROR') === 0 || gg === null || gg > 14;
      if (muta) { g.mute++; if (g.fonti.length < 20) g.fonti.push({ nome: String(v[r][iNome] || ''), record: tot, ggScan: gg, esito: esito || '—' }); }
    }
    Logger.log('[podcastAudit] podcast ' + rep.podcast.attive + ' attive / ' + rep.podcast.mute + ' mute · video ' + rep.video.attive + ' attive / ' + rep.video.mute + ' mute');
    Logger.log(JSON.stringify(rep, null, 2));
  } catch (e) { rep.ok = false; rep.error = e.message; }
  return rep;
}

// ----------------------------------------------------------------------------
//  Audit mensile via email (parte "ricorrente" della Tappa P) — dispatcher
// ----------------------------------------------------------------------------
function podcastAuditMensile() {
  var rep = podcastAuditFonti();
  if (!rep || !rep.ok) return rep;
  var dest = (typeof _aqDest_ === 'function') ? _aqDest_() : 's.straccini@gmail.com';
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  function tabella(g, tipo) {
    if (!g.mute) return '<p style="color:#3F7A5E">✔ Nessuna fonte ' + tipo + ' muta (' + g.attive + ' attive).</p>';
    var righe = g.fonti.map(function(f){
      return '<tr><td style="padding:4px;border-bottom:1px solid #eee">' + esc(f.nome) + '</td>' +
        '<td style="padding:4px;border-bottom:1px solid #eee">' + f.record + ' record</td>' +
        '<td style="padding:4px;border-bottom:1px solid #eee">' + (f.ggScan === null ? 'mai' : f.ggScan + 'gg') + ' · ' + esc(f.esito) + '</td></tr>';
    }).join('');
    return '<h3>' + tipo + ': ' + g.mute + ' mute / ' + g.attive + ' attive</h3>' +
      '<table style="border-collapse:collapse;width:100%;font-size:13px">' + righe + '</table>';
  }
  var html = '<div style="font-family:Georgia,serif;max-width:640px">' +
    '<h2>Audit fonti podcast &amp; video</h2>' +
    '<p>Controllo mensile della salute del parco podcast/video. Le fonti &laquo;mute&raquo; non producono record da &gt;14gg o sono in errore.</p>' +
    tabella(rep.podcast, 'Podcast') + tabella(rep.video, 'Video') +
    '<p style="color:#888;font-size:12px;margin-top:12px">Per aggiungere nuovi podcast cultura: Impostazioni → Sistema → Strumenti → &laquo;+ Podcast cultura&raquo;.</p></div>';
  try { MailApp.sendEmail({ to: dest, subject: '[OC] Audit podcast/video — ' + (rep.podcast.mute + rep.video.mute) + ' fonti mute', htmlBody: html }); rep.emailInviata = dest; }
  catch (e) { rep.emailErrore = e.message; }
  return rep;
}

// ============================================================================
//  v4.27.50 — PODCAST ATTIVI: rianimazione sezione podcast (+0 episodi/30gg
//  al 21/07). Diagnosi: i feed in parco sono VIVI ma le trasmissioni sono
//  FERME (Artribune ultimo ep. 04/2026, Contemporaneamente 02/2025, Giuditta
//  2020, L'arte con chi ne fa parte 2021). Questi 2 show internazionali
//  pubblicano OGNI SETTIMANA (verificati live 2026-07-21, episodi di giugno).
//  Il sommario AI traduce; entrano da FontiFeed tipo 'podcast'.
// ============================================================================
function podcastAggiungiBatchAttivi() {
  var candidati = [
    { url: 'https://feeds.acast.com/public/shows/the-week-in-art-by-the-art-newspaper', nome: 'The Week in Art — The Art Newspaper', ambito: 3, sito: 'https://www.theartnewspaper.com' },
    { url: 'https://feeds.acast.com/public/shows/talkart',                              nome: 'Talk Art — Tovey & Diament',          ambito: 3, sito: 'https://talkart.co.uk' }
  ];
  var esiti = candidati.map(function(c) {
    var r = _discAggiungiFeed_(c.url, c.nome, c.ambito, 'Podcast-attivi 2026-07', 'podcast', c.sito || '');
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e) { return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('podcastAggiungiBatchAttivi: ' + aggiunte + '/' + candidati.length + '\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

/** v4.27.50 — Auto-seed una tantum dei podcast attivi (pattern discoveryAutoSeedOnce). */
function podcastAttiviSeedOnce() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('OC_PODATTIVI_SEEDED') === 'true') return { ok: true, skipped: true };
  var rep;
  try { rep = podcastAggiungiBatchAttivi(); } catch (e) { rep = { ok: false, error: e.message }; }
  props.setProperty('OC_PODATTIVI_SEEDED', 'true');
  Logger.log('[podcastAttiviSeedOnce] podcast attivi seminati una tantum: ' + JSON.stringify(rep));
  return rep;
}

// ============================================================================
//  TAPPA 4 — SOCIAL INBOUND: feed RSS pubblici Mastodon (verificati live 2026-07-10)
// ----------------------------------------------------------------------------
//  Mastodon espone RSS per profilo (profilo + '.rss') e per HASHTAG
//  (istanza + '/tags/<tag>.rss'). Gli hashtag aggregano molti autori sullo
//  stesso tema → segnale più ricco di un singolo account. Selezionati i tag più
//  on-topic e a-basso-rumore; entrano nel flusso news (tipo 'rss'), quindi il
//  gate cultura + lo score AI fanno da filtro. Internazionali (EN): il sommario
//  AI traduce. Instagram/X/Facebook NON hanno RSS pubblico → esclusi; il canale
//  social-like italiano resta scanNewsletterGmail (già attivo).
//  Reversibile: disattivare le righe in FontiFeed o disableFontiFeed('rss').
// ============================================================================
function fontiAggiungiBatchSocial() {
  var candidati = [
    // Hashtag (aggregano molti autori — alto segnale)
    { url: 'https://mastodon.social/tags/CulturalHeritage.rss', nome: 'Mastodon #CulturalHeritage', ambito: 1 },
    { url: 'https://mastodon.social/tags/GLAM.rss',             nome: 'Mastodon #GLAM (musei/archivi/biblioteche)', ambito: 1 },
    { url: 'https://mastodon.social/tags/digitalheritage.rss',  nome: 'Mastodon #digitalheritage', ambito: 5 },
    // Voce autorevole open-GLAM (policy, funding, riuso digitale del patrimonio)
    { url: 'https://mastodon.social/@CultureDoug.rss',          nome: 'Douglas McCarthy — Open GLAM', ambito: 5, sito: 'https://mastodon.social/@CultureDoug' }
  ];
  var esiti = candidati.map(function(c) {
    var r = _discAggiungiFeed_(c.url, c.nome, c.ambito, 'Social-Mastodon T4 2026-07', 'rss', c.sito || '');
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e) { return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('fontiAggiungiBatchSocial: ' + aggiunte + '/' + candidati.length + '\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

// ============================================================================
//  AUTO-SEED UNA TANTUM — attiva podcast + social senza intervento manuale.
//  Gira dal dispatcher (giornaliero); alla prima esecuzione aggiunge i batch e
//  imposta un flag → le volte successive è un no-op immediato. Idempotente anche
//  senza flag grazie al dedup del gate.
// ============================================================================
function discoveryAutoSeedOnce() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('OC_DISCOVERY_SEEDED') === 'true') {
    return { ok: true, skipped: true };
  }
  var rep = { ok: true, podcast: null, social: null };
  try { rep.podcast = fontiAggiungiBatchPodcast(); } catch (e) { rep.podcast = { error: e.message }; }
  try { rep.social = fontiAggiungiBatchSocial(); } catch (e2) { rep.social = { error: e2.message }; }
  props.setProperty('OC_DISCOVERY_SEEDED', 'true');
  Logger.log('[discoveryAutoSeedOnce] podcast+social attivati una tantum: ' + JSON.stringify(rep));
  return rep;
}

// ============================================================================
//  SELF-TEST — verifica la logica del gate senza scrivere nulla
// ============================================================================
function discoverySelfTest() {
  var casi = [
    { url: '', atteso: false, nome: 'URL vuoto' },
    { url: 'ftp://x.it/feed', atteso: false, nome: 'schema non http' },
    { url: 'https://www.spreaker.com/show/4782449/episodes/feed', atteso: true, nome: 'URL http valido (forma)' }
  ];
  var pass = 0, fail = 0;
  casi.forEach(function(c) {
    var valido = !!(c.url && /^https?:\/\//i.test(c.url));
    var ok = valido === c.atteso;
    if (ok) pass++; else fail++;
    Logger.log((ok ? 'PASS' : 'FAIL') + ' [' + valido + ' vs ' + c.atteso + '] ' + c.nome);
  });
  Logger.log('=== discoverySelfTest: ' + pass + '/' + (pass + fail) + ' PASS ===');
  return { ok: fail === 0, pass: pass, fail: fail };
}
