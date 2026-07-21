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
      case 'fontiOsservatori':  r = fontiAggiungiBatchOsservatori(); break;
      case 'fontiDesignArte':    r = fontiAggiungiBatchDesignArte(); break;  // segnalazione 2026-07 (Turrell/ARoS)
      case 'videoIntl':          r = videoAggiungiCanaliIntl(); break;       // canali video internazionali (piano novità)
      case 'podcastAttivi':      r = podcastAggiungiBatchAttivi(); break;    // podcast internazionali attivi (rianimazione +0/30gg)
      case 'socialEditoriale':   r = generateSocialDraftFromEditoriale({ force: true }); break; // editoriale → coda social (manuale)
      case 'rassegnaTop':        r = rassegnaTopNews(); break;               // referenze multi-fonte delle top news
      case 'fontiPodcast':       r = fontiAggiungiBatchPodcast(); break;   // Tappa P
      case 'fontiSocial':        r = fontiAggiungiBatchSocial(); break;    // Tappa 4
      case 'fontiPodcastSocial': r = { podcast: fontiAggiungiBatchPodcast(), social: fontiAggiungiBatchSocial() }; break; // entrambe in 1 clic (idempotente)
      case 'podcastAudit':       r = podcastAuditFonti(); break;           // Tappa P
      case 'segOgImage':         r = segBackfillOgImage({ cap: 20 }); break; // miniature segnalazioni
      case 'digestAssets':       r = digestAssetsSetup(); break; // one-shot: logo+masthead digest su Drive
      case 'diagContatori':      r = diagContatoriBadge(); break; // diagnosi badge NEW + stato lavoro
      case 'lavoroScanDry':      r = fasParserGuS4Cultura({ dryRun: true, deepCap: 40 }); break; // anteprima filtri nuovi

      // ── Contenuti: scansioni "adesso" ────────────────────────────────────
      case 'reportUnificato':    r = reportUnificatoGiornaliero(); break;  // 1 controllo + 1 email
      case 'lavoroScan':         r = lavoroCulturaMonitor(); break;
      case 'sediaScan':          r = fasParserSediaEU({ dryRun: false }); break;
      case 'normeDry':           r = normeAutoPopola({ dryRun: true, giorni: 60 }); break;
      case 'normeApply':         r = normeAutoPopola({ dryRun: false, cap: 15, giorni: 60 }); break;
      case 'normeICOM':          r = popolaNormativeICOM({ dryRun: false }); break;
      case 'normeICOMDry':       r = popolaNormativeICOM({ dryRun: true }); break;

      // ── Validazione / pulizia bandi ──────────────────────────────────────
      case 'validaBandiDry':     r = agenteQualitaBandi({ dryRun: true, email: false }); break;  // anteprima criticità
      case 'validaBandiApply':   r = agenteQualitaBandi({ dryRun: false, email: false }); break; // archivia invalidi
      case 'enrichV5Dry':        r = arricchisciBandiV5({ dryRun: true }); break;
      case 'enrichV5Apply':      r = arricchisciBandiV5({ cap: 30 }); break;
      case 'tedMalformatiDry':   r = bandiPuliziaTedMalformati({ dryRun: true }); break;
      case 'tedMalformatiApply': r = bandiPuliziaTedMalformati({ dryRun: false }); break;
      case 'backfillCultura':    r = backfillSettoreCultura(); break;
      case 'tedVuoti':           r = puliziBandiTedVuoti(); break;

      // ── Arricchimento bandi v4.27 ───────────────────────────────────────
      case 'enrichRadarSetup':   r = addColonneRadar_v427(); break;
      case 'enrichRadarDry':     r = arricchisciBandiRadar({ dryRun: true }); break;
      case 'enrichRadarApply':   r = arricchisciBandiRadar({ cap: 20 }); break;
      case 'enrichRadarBatch':   r = enrichBandiRadarBatch(); break;

      // ── Diagnostica / test (non scrivono nulla) ──────────────────────────
      case 'gateSelfTest':       r = bandiGateSelfTest(); break;
      case 'ddSelfTest':         r = ddSelfTest(); break;                 // registro anti-ripetizione digest
      case 'ddPrune':            r = ddPrune(180); break;                 // pulizia registro (manuale)
      case 'lavoroSelfTest':     r = lavoroCulturaSelfTest(); break;
      case 'normeSelfTest':      r = normeCulturaSelfTest(); break;
      case 'runAllTests':        r = ocRunAllTests(); break;
      case 'quota':              r = { ok: true, quotaEmailRimaste: MailApp.getRemainingDailyQuota() }; break;

      default:
        return { ok: false, error: 'tool sconosciuto: ' + t };
    }
    return { ok: true, tool: t, result: r };
  } catch (e) {
    return { ok: false, tool: t, error: e && e.message ? e.message : String(e) };
  }
}
