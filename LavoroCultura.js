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
  var dryRun = !!opts.dryRun;
  var deepCap = (opts.deepCap === undefined) ? 15 : Number(opts.deepCap);
  var report = { ok: true, dryRun: dryRun, totFeed: 0, l1Cultura: 0, l2Candidati: 0,
                 l2Fetch: 0, l2Match: 0, l2SaltatiPerCap: 0, duplicati: 0, nuovi: 0,
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
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Feedfetcher/4.0)' }
          });
          if (det.getResponseCode() === 200) {
            var body = det.getContentText('UTF-8') || '';
            var mProf = body.match(LC_PROFESSIONE_RE);
            if (mProf) { isCultura = true; motivo = 'L2-professione: ' + mProf[1]; report.l2Match++; }
          }
          Utilities.sleep(300);
        } catch (eDet) { /* dettaglio irraggiungibile → scarta in sicurezza */ }
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
