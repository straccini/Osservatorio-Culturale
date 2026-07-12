// ============================================================================
//  LavoroCultura.js — TAPPA 1: concorsi pubblici settore cultura (GU 4ª Serie)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · 2026-07-06
//  Piano: docs/PIANO_SVILUPPO_OCS_2026-07.md (T1 — Lavoro Cultura)
//
//  FONTE: Gazzetta Ufficiale 4ª Serie Speciale Concorsi — RSS ufficiale
//         https://www.gazzettaufficiale.it/rss/S4   (verificato live 2026-07-06:
//         HTTP 200, RSS valido, ~58 item; esce il martedì e il venerdì)
//         Copre A MONTE tutti i concorsi pubblici italiani (pubblicazione in GU
//         obbligatoria) — inPA non espone RSS (SPA, verificato 404).
//
//  STRUTTURA FEED (rilevata): titolo = "ENTE - CONCORSO (scad. 18 luglio 2026)",
//  descrizione VUOTA, link = pagina eli/id GU. Il profilo professionale NON è
//  nel titolo → filtro a 2 livelli:
//   L1 — ENTE CULTURALE nel titolo (soprintendenze, musei, biblioteche, MiC,
//        accademie, conservatori, teatri, parchi archeologici…) → dentro subito
//   L2 — enti generalisti (comuni, province, regioni, università…): fetch della
//        pagina di dettaglio GU e ricerca keyword di PROFESSIONE culturale
//        (bibliotecario, archivista, storico dell'arte, restauratore, curatore,
//        L-ART, museologia…). Budget-capped (default 15 fetch/run).
//
//  INTEGRAZIONE (Opzione A del piano): i concorsi entrano in Bandi_v5 via
//  _fasSaveBando_ con tipoBando='lavoro' → protetti dal BandiGate (link/scadenza)
//  e dall'agenteQualitaBandi (archivio a scadenza). UI: badge "Lavoro" (chip
//  filtro da attivare DOPO il verdetto del dry-run).
//
//  PROTOCOLLO: NON wirato in FASE2/dispatcher. Prima:
//    1) lavoroCulturaSelfTest()                → test filtri e parsing date
//    2) fasParserGuS4Cultura({dryRun:true})    → dry-run reale, incollare log
//    3) verdetto condiviso → attivazione (dispatcher daily + chip UI)
// ============================================================================

var LC_RSS_S4 = 'https://www.gazzettaufficiale.it/rss/S4';

// L1 — enti culturali certi (titoli GU in MAIUSCOLO, regex case-insensitive)
var LC_ENTE_CULTURA_RE = /(MINISTERO DELLA CULTURA|SOPRINTENDENZ|MUSE[OI]\b|POLO MUSEALE|BIBLIOTEC|ARCHIVIO DI STATO|ARCHIVI DI STATO|ACCADEMIA DI BELLE ARTI|ACCADEMIA NAZIONALE|CONSERVATORIO DI MUSICA|TEATRO\b|FONDAZIONE LIRIC|PARCO ARCHEOLOGICO|GALLERI[AE]\b|PINACOTEC|ISTITUTO CENTRALE|BENI CULTURALI|ISTITUTO SUPERIORE PER LA CONSERVAZIONE)/i;

// L2 — enti generalisti che POSSONO bandire ruoli cultura (richiede verifica dettaglio)
var LC_ENTE_GENERICO_RE = /^(COMUNE DI|PROVINCIA|CITTA' METROPOLITANA|REGIONE|UNIONE (DEI |DI )?COMUNI|UNIVERSITA)/i;

// L2 — professioni/discipline culturali cercate nella pagina di dettaglio
var LC_PROFESSIONE_RE = /(bibliotecari|archivist[ai]|storico dell'arte|storia dell'arte|restaurator|curator[ei]|museal[ei]|museolog|beni culturali|funzionari[oa][^.]{0,40}cultur|istruttore[^.]{0,40}cultural|educatore museale|assistente[^.]{0,30}(museo|biblioteca|archivio)|servizi cultural|settore cultura|promozione cultural|archeolog|L-ART|M-STO\/08|biblioteconomia)/i;

/** Estrae la scadenza dal titolo GU: "(scad. 18 luglio 2026)" → Date. */
function _lcParseScadenza_(titolo) {
  var m = String(titolo || '').match(/scad\.\s*(\d{1,2})\s+([a-zà]+)\s+(\d{4})/i);
  if (!m) return '';
  var mesi = { gennaio:0, febbraio:1, marzo:2, aprile:3, maggio:4, giugno:5,
               luglio:6, agosto:7, settembre:8, ottobre:9, novembre:10, dicembre:11 };
  var mese = mesi[m[2].toLowerCase()];
  if (mese === undefined) return '';
  var d = new Date(Number(m[3]), mese, Number(m[1]));
  return isNaN(d.getTime()) ? '' : d;
}

/** Ente = parte del titolo prima di " - " (formato GU costante). */
function _lcParseEnte_(titolo) {
  var t = String(titolo || '');
  var cut = t.indexOf(' - ');
  return (cut > 0 ? t.substring(0, cut) : t).substring(0, 150).trim();
}

/**
 * Parser GU 4ª Serie Concorsi filtrato cultura.
 * @param {Object} opts { dryRun:bool, deepCap:number (default 15), noDeep:bool }
 * @return {Object} report
 */
function fasParserGuS4Cultura(opts) {
  opts = opts || {};
  // v2 — SICUREZZA: dryRun di DEFAULT finché non wirato (per scrivere davvero
  // serve passare {dryRun:false} esplicito). Evita salvataggi accidentali da editor.
  var dryRun = (opts.dryRun === undefined) ? true : !!opts.dryRun;
  var deepCap = (opts.deepCap === undefined) ? 15 : Number(opts.deepCap);
  var report = { ok: true, dryRun: dryRun, totFeed: 0, l1Cultura: 0, l2Candidati: 0,
                 l2Fetch: 0, l2Match: 0, l2Errori: 0, l2SaltatiPerCap: 0, duplicati: 0, nuovi: 0,
                 esclusi: 0, dettagli: [] };
  try {
    var resp = UrlFetchApp.fetch(LC_RSS_S4, {
      muteHttpExceptions: true, followRedirects: true, deadline: 15,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher/4.0)' }
    });
    if (resp.getResponseCode() !== 200) {
      report.ok = false; report.errore = 'HTTP ' + resp.getResponseCode();
      Logger.log('[LC] GU S4 ' + report.errore);
      return report;
    }
    var xml = resp.getContentText('UTF-8') || '';
    var items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    report.totFeed = items.length;

    var existingUrls = (typeof _fasLoadExistingUrls_ === 'function') ? _fasLoadExistingUrls_() : {};

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var mT = it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      var mL = it.match(/<link>([\s\S]*?)<\/link>/);
      var titolo = mT ? mT[1].replace(/\s+/g, ' ').trim() : '';
      var link = mL ? mL[1].trim() : '';
      if (!titolo || !link) continue;
      // v2 — il feed GU usa link http:// → forza https (fetch più affidabile)
      link = link.replace(/^http:\/\//i, 'https://');

      // Salta annullamenti/rettifiche e avvisi senza scadenza concorsuale
      if (/ANNULLAMENTO|RETTIFICA|REVOCA/i.test(titolo)) { report.esclusi++; continue; }

      var isCultura = LC_ENTE_CULTURA_RE.test(titolo);
      var motivo = isCultura ? 'L1-ente-cultura' : '';

      // L2 — ente generalista: verifica professione nella pagina di dettaglio
      if (!isCultura && !opts.noDeep && LC_ENTE_GENERICO_RE.test(titolo)) {
        report.l2Candidati++;
        if (report.l2Fetch >= deepCap) { report.l2SaltatiPerCap++; continue; }
        report.l2Fetch++;
        try {
          var det = UrlFetchApp.fetch(link, {
            muteHttpExceptions: true, followRedirects: true, deadline: 12,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          if (det.getResponseCode() === 200) {
            var body = det.getContentText('UTF-8') || '';
            var mProf = body.match(LC_PROFESSIONE_RE);
            if (mProf) { isCultura = true; motivo = 'L2-professione: ' + mProf[1]; report.l2Match++; }
          } else {
            // v2 — fetch fallito: contato nel report (distingue "nessun match" da "fetch KO")
            report.l2Errori++;
            Logger.log('[LC] L2 HTTP ' + det.getResponseCode() + ' — ' + titolo.substring(0, 60));
          }
          Utilities.sleep(300);
        } catch (eDet) {
          report.l2Errori++;
          Logger.log('[LC] L2 errore fetch: ' + eDet.message.substring(0, 80) + ' — ' + titolo.substring(0, 60));
        }
      }

      if (!isCultura) { report.esclusi++; continue; }

      if (existingUrls[link.toLowerCase()]) { report.duplicati++; continue; }

      var scad = _lcParseScadenza_(titolo);
      var ente = _lcParseEnte_(titolo);
      if (report.dettagli.length < 25) {
        report.dettagli.push({ titolo: titolo.substring(0, 110), motivo: motivo,
          scadenza: scad ? Utilities.formatDate(scad, 'Europe/Rome', 'dd/MM/yyyy') : 'n.d.' });
      }

      if (!dryRun) {
        _fasSaveBando_({
          titolo: titolo,
          ente: ente,
          livello: 'Nazionale',
          settore: 'Concorso pubblico — cultura',
          tipoBando: 'lavoro',
          urlBando: link,
          sommario: 'Concorso pubblico (GU 4ª Serie Speciale). ' + motivo,
          scadenza: scad,
          ambito: 1,
          fonteNome: 'GU 4ª Serie Concorsi'
        });
        existingUrls[link.toLowerCase()] = true;
      }
      report.nuovi++;
    }

    Logger.log('[LC] GU S4: feed=' + report.totFeed + ' · L1 cultura=' + report.l1Cultura +
      ' · L2 fetch=' + report.l2Fetch + '/' + report.l2Candidati + ' (match ' + report.l2Match + ')' +
      ' · nuovi=' + report.nuovi + ' · dup=' + report.duplicati + ' · esclusi=' + report.esclusi +
      (dryRun ? ' [DRY-RUN]' : ''));
    // conteggio L1 = nuovi+duplicati che non vengono da L2
    report.l1Cultura = report.nuovi + report.duplicati - report.l2Match;
    Logger.log(JSON.stringify(report, null, 2));
  } catch (e) {
    report.ok = false; report.errore = e.message;
    Logger.log('[LC] errore: ' + e.message);
  }
  return report;
}

// ============================================================================
//  SCAN 2×/SETTIMANA — ATTIVAZIONE PIENA (Piano T1, promosso da Silvano 2026-07-10)
// ----------------------------------------------------------------------------
//  Gira mercoledì e sabato (via CronDispatcher, dopo le uscite GU di mar+ven):
//  SALVA davvero i concorsi cultura in Bandi_v5 (tipoBando='lavoro') e invia
//  all'admin il report di cosa ha aggiunto. I concorsi appaiono nella pagina
//  "Lavoro cultura" e nel blocco rotante dei digest lettori.
// ============================================================================
function lavoroCulturaMonitor() {
  // v4.25.16 — dryRun:false = attivazione piena (era monitor osservativo)
  // v4.25.21 — deepCap 40: controlla più pagine di dettaglio GU per intercettare
  // i concorsi universitari in discipline culturali (L-ART, storia dell'arte,
  // archeologia, museologia, restauro), che appaiono più spesso dei concorsi museali.
  var rep = fasParserGuS4Cultura({ dryRun: false, deepCap: 40 });
  var dest = (typeof _aqDest_ === 'function') ? _aqDest_() : 's.straccini@gmail.com';
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  var righe = (rep.dettagli || []).map(function(d){
    return '<tr><td style="padding:5px;border-bottom:1px solid #eee">' + esc(d.titolo) +
      '</td><td style="padding:5px;border-bottom:1px solid #eee;white-space:nowrap">' + esc(d.scadenza) +
      '</td><td style="padding:5px;border-bottom:1px solid #eee;font-size:11px;color:#666">' + esc(d.motivo) + '</td></tr>';
  }).join('');
  var html = '<div style="font-family:Georgia,serif;max-width:680px">' +
    '<h2>Lavoro Cultura — GU 4ª Serie (attivo)</h2>' +
    '<p>Feed: <b>' + rep.totFeed + '</b> concorsi · <b>' + rep.nuovi + '</b> nuovi salvati' +
    ' (L1 ente: ' + Math.max(0, rep.l1Cultura) + ' · L2 professione: ' + rep.l2Match + ')' +
    ' · duplicati: ' + rep.duplicati +
    ' · L2 verificati: ' + rep.l2Fetch + '/' + rep.l2Candidati +
    (rep.l2Errori ? ' · <span style="color:#B91C1C">fetch KO: ' + rep.l2Errori + '</span>' : '') +
    (rep.l2SaltatiPerCap ? ' · oltre cap: ' + rep.l2SaltatiPerCap : '') + '</p>' +
    (righe ? '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
      '<tr><th style="text-align:left;padding:5px;border-bottom:2px solid #333">Concorso</th>' +
      '<th style="text-align:left;padding:5px;border-bottom:2px solid #333">Scadenza</th>' +
      '<th style="text-align:left;padding:5px;border-bottom:2px solid #333">Match</th></tr>' + righe + '</table>'
      : '<p style="color:#888">Nessun concorso culturale in questo numero (normale: escono periodicamente).</p>') +
    '<p style="color:#888;font-size:12px;margin-top:12px">I concorsi nuovi sono nella sezione <b>Lavoro cultura</b> e nel blocco opportunità dei digest lettori.</p></div>';
  try {
    MailApp.sendEmail({ to: dest, subject: '[OC] Lavoro Cultura — ' + rep.nuovi + ' nuovi concorsi salvati', htmlBody: html });
    rep.emailInviata = dest;
  } catch (e) { rep.emailErrore = e.message; }
  return rep;
}

// ============================================================================
//  SELF-TEST — nessun fetch, nessuna scrittura: verifica filtri e parsing
// ============================================================================
function lavoroCulturaSelfTest() {
  var casi = [
    // L1 — devono passare
    { t: "MINISTERO DELLA CULTURA - CONCORSO (scad. 20 agosto 2026)", att: 'L1' },
    { t: "SOPRINTENDENZA ARCHEOLOGIA BELLE ARTI E PAESAGGIO PER LA CITTA' DI FIRENZE - CONCORSO (scad. 1 settembre 2026)", att: 'L1' },
    { t: "ACCADEMIA DI BELLE ARTI DI BRERA - CONCORSO (scad. 5 agosto 2026)", att: 'L1' },
    { t: "BIBLIOTECA NAZIONALE CENTRALE DI ROMA - AVVISO (scad. 12 luglio 2026)", att: 'L1' },
    { t: "TEATRO ALLA SCALA - CONCORSO (scad. 30 luglio 2026)", att: 'L1' },
    // L2 — candidati (ente generico: passerebbero SOLO col fetch dettaglio)
    { t: "COMUNE DI PESARO - CONCORSO (scad. 15 agosto 2026)", att: 'L2' },
    { t: "UNIVERSITA' DI BOLOGNA «ALMA MATER STUDIORUM» - CONCORSO (scad. 2 agosto 2026)", att: 'L2' },
    // ESCLUSI — non devono passare
    { t: "AZIENDA SANITARIA LOCALE DI TARANTO - CONCORSO (scad. 10 agosto 2026)", att: 'NO' },
    { t: "CONSIGLIO NAZIONALE DELLE RICERCHE - ISTITUTO DI FOTONICA - CONCORSO (scad. 18 luglio 2026)", att: 'NO' },
    { t: "UNIVERSITA' DI MILANO - ANNULLAMENTO", att: 'NO' }
  ];
  var pass = 0, fail = 0;
  casi.forEach(function(c) {
    var skip = /ANNULLAMENTO|RETTIFICA|REVOCA/i.test(c.t);
    var eff = skip ? 'NO' : (LC_ENTE_CULTURA_RE.test(c.t) ? 'L1' : (LC_ENTE_GENERICO_RE.test(c.t) ? 'L2' : 'NO'));
    var ok = eff === c.att;
    if (ok) pass++; else fail++;
    Logger.log((ok ? 'PASS' : 'FAIL') + ' [' + eff + ' vs atteso ' + c.att + '] ' + c.t.substring(0, 70));
  });
  // parsing scadenza
  var d = _lcParseScadenza_("COMUNE DI X - CONCORSO (scad. 18 luglio 2026)");
  var okData = d && d.getDate() === 18 && d.getMonth() === 6 && d.getFullYear() === 2026;
  Logger.log((okData ? 'PASS' : 'FAIL') + ' parsing scadenza "18 luglio 2026" → ' + d);
  if (okData) pass++; else fail++;
  // parsing ente
  var ente = _lcParseEnte_("SOPRINTENDENZA XYZ - CONCORSO (scad. 1 agosto 2026)");
  var okEnte = ente === 'SOPRINTENDENZA XYZ';
  Logger.log((okEnte ? 'PASS' : 'FAIL') + ' parsing ente → "' + ente + '"');
  if (okEnte) pass++; else fail++;
  Logger.log('=== lavoroCulturaSelfTest: ' + pass + '/' + (pass + fail) + ' PASS ===');
  return { ok: fail === 0, pass: pass, fail: fail };
}

// ============================================================================
//  OPPORTUNITÀ PROFESSIONALI (v4.25.21) — popola la sezione anche quando i
//  concorsi GU scarseggiano. Pesca dalle NEWS già raccolte le residenze, open
//  call, borse, premi e mobilità del settore cultura: fonti dedicate (Res Artis,
//  On the Move, AAM) + match keyword su titolo/sommario. Nessuna nuova fonte,
//  nessuna scrittura: è una VISTA sui dati già presenti nel foglio Items.
// ============================================================================

// Fonti che pubblicano SOLO opportunità/residenze → dentro tutte
var _LC_FONTI_OPPORTUNITA = /res\s*artis|on\s*the\s*move|alliance of museums|\bAAM\b/i;
// Keyword opportunità (per le altre fonti news)
var _LC_OPPORTUNITA_RE = /\b(residenz[ae]|residency|residencies|open\s+call|call\s+for|bando|borsa\s+di\s+studio|borse|fellowship|premio|premi\b|award|grant|mobilit|scholarship|artist[- ]in[- ]residence|selezione\s+pubblica|posizione\s+aperta|job\s+opportunit|vacancy|reclutament|assunzion)\b/i;

/**
 * Ritorna le opportunità professionali cultura dalle news (Items).
 * @param {number} limit
 * @return {Array<Object>} [{titolo, link, fonte, data, ambito, sommario, tipoOpp}]
 */
function getLavoroOpportunita(limit) {
  var n = Number(limit) || 40;
  var out = [];
  try {
    var news = (typeof getNewsListV42 === 'function') ? getNewsListV42(400) : [];
    for (var i = 0; i < news.length; i++) {
      var x = news[i];
      var fonte = String(x.fonte || '');
      var blob = String(x.titolo || '') + ' ' + String(x.sommario || '');
      var daFonte = _LC_FONTI_OPPORTUNITA.test(fonte);
      var daKeyword = _LC_OPPORTUNITA_RE.test(blob);
      if (!daFonte && !daKeyword) continue;
      var t = 'opportunita';
      if (/residenz|residency|artist[- ]in[- ]residence/i.test(blob)) t = 'residenza';
      else if (/open\s+call|call\s+for/i.test(blob)) t = 'call';
      else if (/borsa|fellowship|scholarship|grant|mobilit/i.test(blob)) t = 'borsa';
      else if (/premio|premi\b|award/i.test(blob)) t = 'premio';
      out.push({
        id: x.id, titolo: String(x.titolo || ''), link: String(x.link || ''),
        fonte: fonte, data: String(x.data || ''), ambito: String(x.ambito || ''),
        sommario: String(x.sommario || ''), tipoOpp: t,
        isRecente: !!x.isRecente, salvato: !!x.salvato
      });
      if (out.length >= n) break;
    }
  } catch (e) { Logger.log('[getLavoroOpportunita] ' + (e && e.message || e)); }
  return out;
}
