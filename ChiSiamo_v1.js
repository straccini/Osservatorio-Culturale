/**
 * ============================================================================
 *  ChiSiamo_v1.js — Testi editabili della pagina "Chi siamo"
 * ----------------------------------------------------------------------------
 *  v1 (2026-06-15) — su richiesta di Silvano.
 *
 *  I testi narrativi chiave della pagina #page-chisiamo possono essere
 *  modificati dall'admin (Impostazioni → scheda "Chi siamo") senza toccare il
 *  codice. Salvati in ScriptProperties come JSON. Se non impostati, il frontend
 *  usa i testi di default già presenti nell'HTML (fallback).
 *
 *  Campi editabili:
 *    titolo, sottotitolo, sinopiaTitolo, sinopiaP1, sinopiaP2,
 *    manifestoTitolo, manifestoP
 *  (è ammesso markup leggero <em>/<b> — contenuto autoriale admin, fidato.)
 *
 *  Funzioni:
 *    getChiSiamoContent()           — lettura pubblica (per il render della pagina)
 *    saveChiSiamoContent(p, token)  — salvataggio admin-gated
 *    resetChiSiamoContent(token)    — ripristina i default (cancella l'override)
 * ============================================================================
 */

var OC_CHISIAMO_PROP   = 'OC_CHISIAMO_CONTENT';
var OC_CHISIAMO_FIELDS = ['titolo','sottotitolo','sinopiaTitolo','sinopiaP1','sinopiaP2','manifestoTitolo','manifestoP'];

/** Lettura pubblica: ritorna l'oggetto testi salvato, o null se mai impostato (→ default HTML). */
function getChiSiamoContent() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(OC_CHISIAMO_PROP);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** Salvataggio admin-gated. payload = oggetto (o JSON string) coi campi editabili. */
function saveChiSiamoContent(payload, token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  try {
    var data = (typeof payload === 'string') ? JSON.parse(payload) : (payload || {});
    var clean = {};
    OC_CHISIAMO_FIELDS.forEach(function (k) {
      if (data[k] !== undefined && data[k] !== null) clean[k] = String(data[k]).substring(0, 4000);
    });
    PropertiesService.getScriptProperties().setProperty(OC_CHISIAMO_PROP, JSON.stringify(clean));
    Logger.log('[ChiSiamo] salvato ' + Object.keys(clean).length + ' campi');
    return { ok: true, saved: Object.keys(clean).length, content: clean };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Ripristina i default (rimuove l'override → il frontend torna ai testi dell'HTML). */
function resetChiSiamoContent(token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  PropertiesService.getScriptProperties().deleteProperty(OC_CHISIAMO_PROP);
  return { ok: true, reset: true };
}
