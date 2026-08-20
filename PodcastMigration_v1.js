/**
 * ============================================================================
 *  PodcastMigration_v1.js — Sposta i PODCAST finiti per errore nel foglio
 *  Pubblicazioni (Libri) verso il foglio Podcast, lasciando in Pubblicazioni
 *  SOLO libri/pubblicazioni.
 * ----------------------------------------------------------------------------
 *  v1 (2026-06-15) — su richiesta di Silvano.
 *
 *  Funzioni:
 *    dryRunSpostaPodcast()  — SOLO log: elenca le righe che SAREBBERO spostate (nessuna modifica)
 *    eseguiSpostaPodcast()  — esegue lo spostamento (append su Podcast + delete da Pubblicazioni)
 *
 *  Scrittura su Podcast per NOME COLONNA (robusto allo schema). Cancellazione
 *  da Pubblicazioni dal basso verso l'alto. Idempotente nei limiti del dedup link.
 *  Recuperabile dalla cronologia versioni di Google Sheet.
 * ============================================================================
 */

var PM_SHEET_PUB = 'Pubblicazioni';
var PM_SHEET_POD = 'Podcast';

/** @private Una riga di Pubblicazioni "sembra" un podcast? (euristica conservativa) */
function _pmIsPodcast_(o) {
  var link  = String(o.Link || o.URL || o.Url || '').toLowerCase();
  var fonte = String(o.Fonte || o.Source || '').toLowerCase();
  var tema  = String(o.Tematica || o.Settore || o.Topic || '').toLowerCase();
  var tit   = String(o.Titolo || o.Title || '').toLowerCase();
  var tipo  = String(o.Tipo || o.Tipologia || '').toLowerCase();
  var byLink  = /spotify\.com\/(show|episode)|anchor\.fm|spreaker|buzzsprout|podbean|apple\.com\/.*podcast|podcasts\.|\/podcast/.test(link);
  var byField = /podcast/.test(fonte) || /podcast/.test(tema) || /podcast/.test(tipo) || /podcast|episodio\b/.test(tit);
  return byLink || byField;
}

/** @private core */
function _pmCore_(dryRun) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shPub = ss.getSheetByName(PM_SHEET_PUB);
  var shPod = ss.getSheetByName(PM_SHEET_POD);
  if (!shPub) return { ok: false, error: 'Foglio Pubblicazioni assente' };
  if (!shPod) return { ok: false, error: 'Foglio Podcast assente' };
  if (shPub.getLastRow() < 2) return { ok: true, candidati: 0, spostati: 0, nota: 'Pubblicazioni vuoto' };

  var vals = shPub.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h || '').trim(); });
  // header Podcast per scrittura per-nome
  var podHead = shPod.getRange(1, 1, 1, shPod.getLastColumn()).getValues()[0].map(function(h){ return String(h || '').trim(); });

  function col(o, names) { for (var i=0;i<names.length;i++){ if (o[names[i]] !== undefined && o[names[i]] !== '') return o[names[i]]; } return ''; }

  var righeDaCancellare = [];   // indici riga (1-based) in Pubblicazioni
  var report = { ok: true, candidati: 0, spostati: 0, dettagli: [], dryRun: !!dryRun };

  Logger.log('=== SPOSTA PODCAST da Pubblicazioni → Podcast (' + (dryRun ? 'DRY-RUN' : 'LIVE') + ') ===');

  for (var r = 1; r < vals.length; r++) {
    var o = {};
    for (var c = 0; c < head.length; c++) o[head[c]] = vals[r][c];
    if (!o.Titolo && !o.Title) continue;
    if (!_pmIsPodcast_(o)) continue;

    report.candidati++;
    var titolo = String(o.Titolo || o.Title || '');
    report.dettagli.push({ riga: r + 1, titolo: titolo, link: String(o.Link || o.URL || ''), fonte: String(o.Fonte || '') });
    Logger.log('  • riga ' + (r + 1) + ': "' + titolo.substring(0, 70) + '"  | fonte=' + (o.Fonte || '-') + ' | link=' + String(o.Link || o.URL || '').substring(0, 60));

    if (!dryRun) {
      // Mappa Pubblicazioni → Podcast per nome colonna
      var podRow = {
        ID:               'POD' + Date.now() + Math.random().toString(36).substring(2, 4),
        DataRilevamento:  col(o, ['DataAggiunta','DataAcquisizione','Data']) || new Date(),
        Titolo:           titolo.substring(0, 300),
        Serie:            col(o, ['Fonte','Editore','Source']),
        Autore:           col(o, ['Autore','Author']),
        Tematica:         col(o, ['Tematica','Settore','Topic']),
        Durata:           '',
        DataPubblicazione: col(o, ['Anno','DataAggiunta','Data']),
        Link:             col(o, ['Link','URL','Url']),
        SommarioAI:       col(o, ['Descrizione','Sommario','Abstract']),
        TagAI:            '',
        Score:            col(o, ['Score']),
        Fonte:            col(o, ['Fonte','Source']) || 'Migrato da Pubblicazioni',
        Ascoltato:        false,
        DaAscoltare:      false,
        InclusiNelDigest: false,
        StatoRecord:      'attivo',
        Ambito:           col(o, ['Ambito','Ambito_ID'])
      };
      shPod.appendRow(podHead.map(function(h){ return podRow[h] !== undefined ? podRow[h] : ''; }));
      righeDaCancellare.push(r + 1);
      report.spostati++;
    }
  }

  if (!dryRun && righeDaCancellare.length) {
    // cancella dal basso verso l'alto per non sfasare gli indici
    righeDaCancellare.sort(function(a, b){ return b - a; }).forEach(function(rn){ shPub.deleteRow(rn); });
  }

  Logger.log('=== ' + (dryRun ? 'DRY-RUN' : 'COMPLETATO') + ': candidati=' + report.candidati + ' spostati=' + report.spostati + ' ===');
  return report;
}

/** SOLO log — non modifica nulla. Lancia questa PRIMA per verificare. */
function dryRunSpostaPodcast() { return _pmCore_(true); }

/** Esegue lo spostamento reale (append su Podcast + delete da Pubblicazioni). */
function eseguiSpostaPodcast() { return _pmCore_(false); }

/** DIAGNOSTICA — dump compatto del foglio Pubblicazioni per capire cosa contiene. */
function diagDumpPubblicazioni() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PM_SHEET_PUB);
  if (!sh) { Logger.log('Foglio Pubblicazioni assente'); return { ok:false }; }
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h||'').trim(); });
  Logger.log('=== DUMP Pubblicazioni — ' + (vals.length-1) + ' righe ===');
  Logger.log('HEADER: ' + JSON.stringify(head));
  var iT = head.indexOf('Titolo'); if (iT<0) iT=1;
  var iF = head.indexOf('Fonte');
  var iTe= head.indexOf('Tematica'); if(iTe<0) iTe=head.indexOf('Settore');
  var iL = head.indexOf('Link'); if(iL<0) iL=head.indexOf('URL');
  var iTi= head.indexOf('Tipo'); if(iTi<0) iTi=head.indexOf('Tipologia');
  for (var r=1; r<vals.length; r++){
    if (!vals[r][iT]) continue;
    Logger.log('  ['+(r+1)+'] T="'+String(vals[r][iT]).substring(0,55)+'"'
      + ' | Fonte='+(iF>=0?vals[r][iF]:'-')
      + ' | Tema='+(iTe>=0?vals[r][iTe]:'-')
      + ' | Tipo='+(iTi>=0?vals[r][iTi]:'-')
      + ' | Link='+String(iL>=0?vals[r][iL]:'').substring(0,50));
  }
  return { ok:true, righe: vals.length-1, header: head };
}
