/**
 * ============================================================================
 *  ConnettoreANAC_OCDS.js — Bandi ANAC da OCP Data Registry (bulk OCDS)
 * ============================================================================
 *  Autore: Claude (Cowork) per Silvano Straccini / Sinopia — 2026-06-26
 *
 *  Sorgente PRIMARIA robusta (no WAF, CC BY 4.0): OCP Data Registry, pubblicazione
 *  "Italy — ANAC" (publication/117). File annuali .jsonl.gz scaricabili da GAS e
 *  decompressi con Utilities.ungzip(). Alternativa più stabile all'API ANAC diretta
 *  usata da fasParserAnac() (dati.anticorruzione.it), storicamente soggetta a WAF.
 *
 *  ⚠️ Adattamenti rispetto alla spec originale (che era per un altro progetto/Rhino):
 *   - progetto su V8;
 *   - salvataggio su RADAR BANDI tramite _fasSaveBando_() (schema esistente), NON
 *     colonne "API_COL_ANAC" inventate;
 *   - il trigger NON è autonomo: va agganciato al dispatcher (OC_CRON_EXTRA in
 *     CronDispatcher.js) per non sforare il limite 20 trigger.
 *
 *  ORDINE DI ATTIVAZIONE:
 *   1) api_testANAC_OCDS_dry()  — verifica che GAS regga download+ungzip (NON scrive)
 *   2) [dopo test ok] api_connettoreANAC_OCDS() — import reale su RADAR
 *   3) apiSetupANAC_OCDS()      — registra il job (settimanale) nel dispatcher
 * ============================================================================
 */

// Anni da importare. 2024 (~55MB) e full (~190MB) ESCLUSI: oltre il limite UrlFetchApp.
var ANAC_ANNI_OCP = ['2025'];

// Parole/CPV cultura per il filtro di pertinenza.
var ANAC_CULTURA_RE = /cultur|museo|musei|patrimoni|restaur|archeolog|monument|bibliotec|archiv|teatr|turis|UNESCO|beni cultural/i;

/** URL bulk OCP Data Registry per un anno. */
function _anacOcpUrl_(anno) {
  return 'https://www.open-contracting.org/en/publication/117/download?name=' + anno + '.jsonl.gz';
}

// ----------------------------------------------------------------------------
// STEP 1 — TEST (dry): scarica, ungzippa, conta i record. NON scrive nulla.
// ----------------------------------------------------------------------------
function api_testANAC_OCDS_dry() {
  var anno = ANAC_ANNI_OCP[0] || '2025';
  var url = _anacOcpUrl_(anno);
  var t0 = Date.now();
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    var code = resp.getResponseCode();
    if (code !== 200) { Logger.log('api_testANAC_OCDS_dry: HTTP ' + code); return { ok: false, http: code, url: url }; }

    var gz = resp.getBlob();
    var kbComp = Math.round(gz.getBytes().length / 1024);
    var dec = Utilities.ungzip(gz);
    var s = dec.getDataAsString('UTF-8');
    var mb = Math.round(s.length / 1048576 * 10) / 10;

    // conta righe SENZA creare un array enorme (loop su indexOf)
    var righe = 0, idx = 0;
    while ((idx = s.indexOf('\n', idx)) !== -1) { righe++; idx++; }
    if (s.length && s.charAt(s.length - 1) !== '\n') righe++;

    // campiona la prima riga
    var nl = s.indexOf('\n');
    var primaRiga = nl > 0 ? s.substring(0, nl) : s.substring(0, 2000);
    var titolo = '', cultura = false;
    try {
      var o = JSON.parse(primaRiga);
      var rel = o.releases ? o.releases[0] : o;
      titolo = (rel && rel.tender && rel.tender.title) || (rel && rel.id) || o.ocid || '';
      cultura = ANAC_CULTURA_RE.test(primaRiga);
    } catch (e) { titolo = 'parse err: ' + e.message; }

    var rep = { ok: true, http: 200, anno: anno, kbCompresso: kbComp, mbDecompresso: mb, recordTotali: righe, primoRecord: String(titolo).substring(0, 120), culturaNelPrimo: cultura, secondi: Math.round((Date.now() - t0) / 1000) };
    Logger.log('api_testANAC_OCDS_dry: ' + JSON.stringify(rep, null, 2));
    return rep;
  } catch (e) {
    // qui scopriamo se GAS NON regge memoria/tempo: messaggio informativo
    Logger.log('api_testANAC_OCDS_dry ERRORE (possibile limite memoria/tempo GAS): ' + e.message);
    return { ok: false, error: e.message, url: url, nota: 'Se è memoria/tempo, l\'import dovrà processare a finestre o ridurre l\'anno.', secondi: Math.round((Date.now() - t0) / 1000) };
  }
}
