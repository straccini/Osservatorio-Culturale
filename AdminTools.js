// ============================================================================
//  AdminTools.js — Entry-point unico gated per lanciare le funzioni one-shot
//                  dalla webapp (pannello Impostazioni → Sistema → Strumenti)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · 2026-07-10
//
//  MOTIVO: evitare l'editor GAS (e il conflitto salvataggio-vecchie-versioni)
//  per le azioni manuali rare. La webapp gira come USER_DEPLOYING (owner) →
//  ha già tutti i permessi; qui NON servono nuovi scope né clasp run.
//
//  SICUREZZA: un solo punto d'ingresso, gated _isCurrentUserAdmin_(token), con
//  WHITELIST esplicita dei tool ammessi. Niente esecuzione di codice arbitrario.
// ============================================================================

/**
 * Esegue un tool amministrativo dalla whitelist. Ritorna { ok, tool, result } o
 * { ok:false, error }. Le funzioni chiamate sono quelle già definite altrove.
 * @param {string} tool  chiave whitelistata
 * @param {string} token token di sessione (gate admin)
 */
function adminRunTool(tool, token) {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  var t = String(tool || '');
  try {
    var r;
    switch (t) {
      // ── Setup / automazione ──────────────────────────────────────────────
      case 'cronSetupDry':       r = ocCronSetup(true); break;
      case 'cronSetupApply':     r = ocCronSetup(false); break;
      case 'cronStato':          r = ocCronStato(); break;
      case 'redazionaleSetup':   r = redazionaleSetup(); break;

      // ── Fonti ────────────────────────────────────────────────────────────
      case 'fontiDiagnosi':      r = fontiScannerDiagnosi(); break;
      case 'fontiAttivaRssDry':  r = fontiScannerAttivaRss(true); break;
      case 'fontiAttivaRssApply':r = fontiScannerAttivaRss(false); break;
      case 'fontiEstero':        r = fontiAggiungiBatchEstero(); break;
      case 'fontiNormativa':     r = fontiAggiungiBatchNormativa(); break;
      case 'fontiPrimarie':      r = fontiRipristinaPrimarie(); break;

      // ── Contenuti: scansioni "adesso" ────────────────────────────────────
      case 'lavoroScan':         r = lavoroCulturaMonitor(); break;
      case 'sediaScan':          r = fasParserSediaEU({ dryRun: false }); break;
      case 'normeDry':           r = normeAutoPopola({ dryRun: true, giorni: 60 }); break;
      case 'normeApply':         r = normeAutoPopola({ dryRun: false, cap: 15, giorni: 60 }); break;

      // ── Pulizia bandi ────────────────────────────────────────────────────
      case 'tedMalformatiDry':   r = bandiPuliziaTedMalformati({ dryRun: true }); break;
      case 'tedMalformatiApply': r = bandiPuliziaTedMalformati({ dryRun: false }); break;
      case 'backfillCultura':    r = backfillSettoreCultura(); break;
      case 'tedVuoti':           r = puliziBandiTedVuoti(); break;

      // ── Diagnostica / test (non scrivono nulla) ──────────────────────────
      case 'gateSelfTest':       r = bandiGateSelfTest(); break;
      case 'lavoroSelfTest':     r = lavoroCulturaSelfTest(); break;
      case 'normeSelfTest':      r = normeCulturaSelfTest(); break;
      case 'quota':              r = { ok: true, quotaEmailRimaste: MailApp.getRemainingDailyQuota() }; break;

      default:
        return { ok: false, error: 'tool sconosciuto: ' + t };
    }
    return { ok: true, tool: t, result: r };
  } catch (e) {
    return { ok: false, tool: t, error: e && e.message ? e.message : String(e) };
  }
}
