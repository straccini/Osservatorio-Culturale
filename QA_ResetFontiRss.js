/**
 * ============================================================================
 * QA_ResetFontiRss.gs — ripristino fonti RSS falsamente marcate morte
 * ============================================================================
 * QA 20/08/2026 — strumento una tantum, da eseguire DOPO il deploy della
 * correzione sulla collisione _xmlText_.
 *
 * PERCHE' SERVE
 * Bandi_v5.js e NewsScanner.js definivano entrambi _xmlText_ con firme
 * incompatibili. In Apps Script i .gs condividono un unico scope, quindi
 * sopravviveva quella di NewsScanner (ordine alfabetico), che lavora su
 * stringhe. Il parser RSS dei bandi v5 le passava invece Element di
 * XmlService: eccezione a ogni item, _scanSingolaFonte_ la classificava
 * PARSE_ERR e incrementava FailConsecutivi.
 *
 * Risultato: fonti RSS perfettamente sane accumulavano fallimenti e finivano
 * nei report come "morte" o "irrecuperabili". Il contatore va azzerato prima
 * di rifare una scansione, altrimenti si continua a decidere su dati falsati.
 *
 * USO (dall'editor GAS, dalla tendina delle funzioni)
 *   1. qaRssDiagnosi()     — solo lettura: elenca le fonti RSS con fallimenti
 *   2. qaRssResetDryRun()  — mostra cosa verrebbe modificato, senza scrivere
 *   3. qaRssResetEsegui()  — azzera davvero FailConsecutivi e UltimoErrore
 *
 * NON tocca la colonna Attiva: se una fonte era stata disattivata a mano
 * resta disattivata. La riattivazione e' una decisione editoriale, non
 * qualcosa che uno strumento debba fare da solo.
 * ============================================================================
 */

/** Elenca le fonti RSS con FailConsecutivi > 0. Sola lettura. */
function qaRssDiagnosi() {
  var d = _qaRssRaccogli_();
  if (!d) return;
  Logger.log('Fonti totali nel foglio: ' + d.totali);
  Logger.log('Fonti di tipo RSS: ' + d.rss);
  Logger.log('RSS con fallimenti accumulati: ' + d.candidate.length);
  Logger.log('');
  d.candidate.forEach(function(c) {
    Logger.log('  fail=' + String(c.fail).padStart(3) +
               '  attiva=' + (c.attiva ? 'si' : 'NO ') +
               '  ' + c.nome);
    if (c.errore) Logger.log('        ultimo errore: ' + String(c.errore).slice(0, 110));
  });
  return { candidate: d.candidate.length };
}

/** Mostra cosa verrebbe modificato, senza scrivere niente. */
function qaRssResetDryRun() { return _qaRssReset_(false); }

/** Azzera davvero FailConsecutivi e UltimoErrore sulle fonti RSS. */
function qaRssResetEsegui() { return _qaRssReset_(true); }

// ─── interne ──────────────────────────────────────────────────────────────

function _qaRssRaccogli_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SH_FONTI_V5);
  if (!sh) { Logger.log('Foglio ' + SH_FONTI_V5 + ' non trovato.'); return null; }

  var rows = sh.getDataRange().getValues();
  var out = { sh: sh, totali: rows.length - 1, rss: 0, candidate: [] };

  for (var r = 1; r < rows.length; r++) {
    var tipo = String(rows[r][COL_F.TIPO - 1] || '').trim().toUpperCase();
    if (tipo !== 'RSS') continue;
    out.rss++;

    var fail = parseInt(rows[r][COL_F.FAIL_CONSECUTIVI - 1], 10) || 0;
    if (fail <= 0) continue;

    var attivaRaw = rows[r][COL_F.ATTIVA - 1];
    out.candidate.push({
      riga:   r + 1,
      nome:   String(rows[r][COL_F.NOME - 1] || '(senza nome)'),
      fail:   fail,
      errore: rows[r][COL_F.ULTIMO_ERRORE - 1] || '',
      attiva: (attivaRaw === true || String(attivaRaw).toLowerCase() === 'true')
    });
  }
  return out;
}

function _qaRssReset_(esegui) {
  var d = _qaRssRaccogli_();
  if (!d) return { ok: false };

  Logger.log(esegui ? '=== RESET IN CORSO ===' : '=== SIMULAZIONE (nessuna scrittura) ===');
  Logger.log('RSS con fallimenti da azzerare: ' + d.candidate.length + ' su ' + d.rss + ' fonti RSS');

  var disattivate = 0;
  d.candidate.forEach(function(c) {
    if (!c.attiva) disattivate++;
    Logger.log('  ' + (esegui ? 'azzerata' : 'da azzerare') +
               '  fail=' + c.fail + '  ' + c.nome);
    if (esegui) {
      d.sh.getRange(c.riga, COL_F.FAIL_CONSECUTIVI).setValue(0);
      d.sh.getRange(c.riga, COL_F.ULTIMO_ERRORE).setValue('');
    }
  });

  if (disattivate) {
    Logger.log('');
    Logger.log('ATTENZIONE: ' + disattivate + ' di queste sono DISATTIVE.');
    Logger.log('Il contatore viene azzerato ma restano spente: riattivarle e\' una');
    Logger.log('scelta editoriale. Usa toggleFonteUnified() su quelle che vuoi riaccendere.');
  }

  Logger.log('');
  Logger.log(esegui
    ? 'Fatto. Ora una scansione (scanFontiTutte) riparte da contatori puliti.'
    : 'Nessuna modifica. Per eseguire davvero: qaRssResetEsegui()');

  return { ok: true, candidate: d.candidate.length, disattivate: disattivate, eseguito: !!esegui };
}
