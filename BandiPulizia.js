/**
 * ============================================================================
 *  BandiPulizia.js — Archivia i bandi non più di interesse dal RADAR
 * ============================================================================
 *  Autore: Claude (Cowork) per Silvano Straccini / Sinopia — 2026-06-26
 *
 *  bandiPulisciVecchi() archivia (StatoRecord='archiviato', reversibile — NON cancella)
 *  SOLO i bandi SCADUTI (scadenza < oggi). I bandi ancora APERTI restano, a prescindere
 *  dalla data di rilevamento. Scrive la colonna StatoRecord in un colpo solo. dryRun=true.
 * ============================================================================
 */

function bandiPulisciVecchi(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'RADAR BANDI vuoto o assente' };

  var v = sh.getDataRange().getValues(); var h = v[0];
  function c(n) { return h.indexOf(n); }
  var iScad = c('Scadenza'); if (iScad < 0) iScad = 9;          // COL.SCADENZA=10 → idx 9
  var iRil = c('Data_Rilevamento'); if (iRil < 0) iRil = 0;     // COL.DATA_RILEVAMENTO=1 → idx 0
  var iStato = c('StatoRecord'); if (iStato < 0) iStato = 17;   // COL.STATO_RECORD=18 → idx 17
  var iTit = c('Titolo'); if (iTit < 0) iTit = 1;

  var now = Date.now();
  var attivi = 0, scaduti = 0, daArchiviare = 0, esempi = [];
  var nuovaStatoCol = [];

  for (var r = 1; r < v.length; r++) {
    var statoCur = String(v[r][iStato] || '');
    nuovaStatoCol.push([statoCur]);
    if (statoCur.toLowerCase() === 'archiviato') continue;
    if (!v[r][iTit] && !v[r][0]) continue;
    attivi++;

    var scad = (typeof _qaParseDate_ === 'function') ? _qaParseDate_(v[r][iScad]) : (v[r][iScad] instanceof Date ? v[r][iScad] : null);

    var motivo = '';
    if (scad && scad.getTime() < now) { motivo = 'scaduto'; scaduti++; }

    if (motivo) {
      daArchiviare++;
      nuovaStatoCol[nuovaStatoCol.length - 1] = ['archiviato'];
      if (esempi.length < 15) esempi.push({ titolo: String(v[r][iTit] || '').slice(0, 60), motivo: motivo, scadenza: String(v[r][iScad] || ''), rilevato: String(v[r][iRil] || '') });
    }
  }

  if (!dryRun && daArchiviare > 0) {
    sh.getRange(2, iStato + 1, nuovaStatoCol.length, 1).setValues(nuovaStatoCol);
  }

  var rep = {
    ok: true, dryRun: dryRun, attivi: attivi, daArchiviare: daArchiviare, scaduti: scaduti,
    archiviatiOra: dryRun ? 0 : daArchiviare, restanoAttivi: attivi - daArchiviare, esempi: esempi
  };
  Logger.log('bandiPulisciVecchi(dryRun=' + dryRun + '): ' + JSON.stringify(rep, null, 2));
  return rep;
}

/**
 * Applica davvero l'archiviazione degli scaduti (= bandiPulisciVecchi(false)).
 * Lanciabile direttamente dal selettore funzioni dell'editor GAS (niente argomenti).
 * Usare DOPO aver controllato l'anteprima con bandiPulisciVecchi().
 */
function bandiPulisciVecchiApplica() {
  return bandiPulisciVecchi(false);
}
