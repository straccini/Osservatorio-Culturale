// ============================================================================
// SheetHelpers.js — Helper generici per accesso fogli Google Sheets
// Elimina boilerplate ripetuto 12+ volte in Codice.js
// Osservatorio Culturale - Duemilamusei / Silvano Straccini
// Sprint DRY Backend (2026-05-26)
// ============================================================================
// Dipendenze (globali GAS): getMainSS()
// ============================================================================

/**
 * Carica un foglio e restituisce dati grezzi.
 * @param {string} sheetName - Nome del foglio (es. SH.ITEMS, 'SocialFonti')
 * @returns {{ sh: Sheet, rows: Array[], headers: string[] } | null}
 */
function _loadSheet(sheetName) {
  var ss = getMainSS();
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getDataRange().getValues();
  return { sh: sh, rows: rows, headers: rows[0] };
}

/**
 * Carica foglio e mappa ogni riga in un oggetto {colName: value}.
 * @param {string} sheetName
 * @param {function(Object, number): boolean} [filterFn] - Filtro opzionale (obj, rowIndex) => boolean
 * @returns {Object[]}
 */
function _sheetToObjects(sheetName, filterFn) {
  var d = _loadSheet(sheetName);
  if (!d) return [];
  var h = d.headers, result = [];
  for (var i = 1; i < d.rows.length; i++) {
    if (!d.rows[i][0]) continue;
    var obj = {};
    h.forEach(function(col, idx) { obj[col] = d.rows[i][idx]; });
    if (!filterFn || filterFn(obj, i)) result.push(obj);
  }
  return result;
}

