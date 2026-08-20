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
      case 'fontiArteEU':        r = addFontiArteDefolt(); break;           // RSS arte contemporanea EU (SocialFonti)
      case 'videoIntl':          r = videoAggiungiCanaliIntl(); break;       // canali video internazionali (piano novità)
      case 'podcastAttivi':      r = podcastAggiungiBatchAttivi(); break;    // podcast internazionali attivi (rianimazione +0/30gg)
      case 'socialEditoriale':   r = generateSocialDraftFromEditoriale({ force: true }); break; // editoriale → coda social (manuale)
      case 'rassegnaTop':        r = rassegnaTopNews(); break;               // referenze multi-fonte delle top news
      case 'socialStato':        r = socialStatoCanali(); break;             // stato canali IG/LI + ponte
      case 'socialPubblica':     r = socialPubblicaApprovati({ cap: 3 }); break; // pubblica/ponte i post approvati
      case 'socialPonte':        r = socialPubblicaApprovati({ cap: 3, soloPonte: true }); break; // solo ponte Telegram
      case 'fontiPodcast':       r = fontiAggiungiBatchPodcast(); break;   // Tappa P
      case 'fontiSocial':        r = fontiAggiungiBatchSocial(); break;    // Tappa 4
      case 'fontiPodcastSocial': r = { podcast: fontiAggiungiBatchPodcast(), social: fontiAggiungiBatchSocial() }; break; // entrambe in 1 clic (idempotente)
      case 'podcastAudit':       r = podcastAuditFonti(); break;           // Tappa P
      case 'segOgImage':         r = segBackfillOgImage({ cap: 20 }); break; // miniature segnalazioni
      case 'digestAssets':       r = digestAssetsSetup(); break; // one-shot: logo+masthead digest su Drive
      case 'diagContatori':      r = diagContatoriBadge(); break; // diagnosi badge NEW + stato lavoro
      // ── Ciclo di vita bandi (v4.27.74) ──────────────────────────────────
      case 'archivioBandi':      r = { totale: bcvArchiviati(1000).length, primi: bcvArchiviati(10) }; break;
      case 'purgeArchivioDry':   r = bcvPurgeArchiviati({ dryRun: true }); break;
      case 'purgeArchivioApply': r = bcvPurgeArchiviati({}); break;
      case 'regioneDry':         r = bcvNormalizzaRegione({ dryRun: true }); break;
      case 'regioneApply':       r = bcvNormalizzaRegione({}); break;
      case 'bcvSelfTest':        r = bcvSelfTest(); break;
      // Pulizia copie archivio (v4.28.30)
      case 'dedupArchivioDry':   r = bcvDeduplicaArchivio({ dryRun: true }); break;
      case 'dedupArchivioApply': r = bcvDeduplicaArchivio({ dryRun: false, cap: 400 }); break;
      // ── Regia fonti per tier (v4.27.75) ─────────────────────────────────
      case 'fontiTierDry':       r = frBackfillTier({ dryRun: true }); break;
      case 'fontiTierApply':     r = frBackfillTier({}); break;
      case 'fontiSalute':        r = frSaluteFonti(); break;
      case 'frSelfTest':         r = frSelfTest(); break;
      // ── Canale RSS bandi + riparazione schema (v4.27.80) ────────────────
      case 'rssBandiDry':        r = bandiRssScanRotazione({ maxFonti: 10, dryRun: true }); break;
      case 'rssBandiScan':       r = bandiRssScanRotazione({ maxFonti: 45 }); break;
      case 'riparaSlittateDry':  r = bcvRiparaSlittate({ dryRun: true }); break;
      case 'riparaSlittateApply':r = bcvRiparaSlittate({}); break;
      // ── Separazione canali bandi/news (v4.27.84) ────────────────────────
      case 'canaliDry':          r = frSeparaCanali({ dryRun: true }); break;
      case 'canaliApply':        r = frSeparaCanali({ dryRun: false, disattiva: true }); break;
      case 'puliziaNewsDry':     r = bcvPuliziaCanaleNews({ dryRun: true }); break;
      case 'puliziaNewsApply':   r = bcvPuliziaCanaleNews({}); break;
      case 'scadenzeFalseDry':   r = bcvAzzeraScadenzeFalse({ dryRun: true }); break;
      case 'scadenzeFalseApply': r = bcvAzzeraScadenzeFalse({}); break;
      case 'fontiDuplicate':     r = frTrovaDuplicati(); break;
      case 'ripristinaFontiDry': r = frRipristinaFontiBandi({ dryRun: true }); break;
      case 'ripristinaFonti':    r = frRipristinaFontiBandi({}); break;
      // ── Registro fonti unico (v4.28.0 — Fase 1 regia fonti) ─────────────
      case 'rfSetup':            r = rfSetup(); break;
      case 'rfMigraDry':         r = rfMigra({ dryRun: true }); break;
      case 'rfMigraApply':       r = rfMigra({}); break;
      case 'rfStato':            r = rfStato(); break;
      case 'rfAttiva':           r = rfAttiva(); break;
      case 'rfDisattiva':        r = rfDisattiva(); break;
      case 'rfSelfTest':         r = rfSelfTest(); break;
      case 'rfConfronto':        r = rfConfronto(); break;   // cancello di parità pre-switch
      case 'rfRiallineaDry':     r = rfRiallineaStato({ dryRun: true }); break;
      case 'rfRiallineaApply':   r = rfRiallineaStato({}); break;
      case 'rfFixCampiDry':      r = rfFixCampiOperativi({ dryRun: true }); break;
      case 'rfFixCampiApply':    r = rfFixCampiOperativi({}); break;
      case 'rfArchiviaLegacyDry':  r = rfArchiviaFogliLegacy({ dryRun: true }); break;
      case 'rfArchiviaLegacy':     r = rfArchiviaFogliLegacy({}); break;
      // ── Tassonomia T1-T10 (v4.28.1 — Fase 2 regia fonti) ────────────────
      case 'txBatchDry':         r = txBatchNotturno({ dryRun: true }); break;
      case 'txBatchApply':       r = txBatchNotturno({ cap: 60 }); break;
      case 'txStato':            r = txStato(); break;
      case 'txSelfTest':         r = txSelfTest(); break;
      // ── Scout fonti (v4.28.3 — Fase 3) ──────────────────────────────────
      case 'scStato':            r = scStato(); break;
      case 'scMinerNow':         r = scMinerRun(); break;
      case 'scUniversitaNow':    r = scUniversitaRun({}); break;
      case 'scSettimanaleNow':   r = scSettimanale(); break;
      case 'scApplicaDecisioni': r = scApplicaDecisioni(); break;
      case 'scRiparaAnci':       r = scRiparaAnci(); break;
      case 'scSelfTest':         r = scSelfTest(); break;
      // ── Redattore (v4.28.4 — Fase 3, politica a due livelli) ────────────
      case 'redBandiStato':      r = redBandiStato(); break;
      case 'redBandiRecuperoDry':r = redBandiRecupero({ dryRun: true }); break;
      case 'redBandiRecupero':   r = redBandiRecupero({ cap: 15 }); break;
      case 'redCoerenzaDry':     r = redCoerenza({ dryRun: true }); break;
      case 'redCoerenzaApply':   r = redCoerenza({ dryRun: false }); break;
      case 'redSelfTest':        r = redSelfTest(); break;
      // ── Newsletter: sezioni complete (v4.28.15) ─────────────────────────
      case 'digestSezioniStato': r = digestSezioniStato(); break;
      case 'dsSelfTest':         r = dsSelfTest(); break;
      case 'trStatoApprovatori': r = trStatoApprovatori(token); break;
      case 'trSelfTest':         r = trSelfTest(); break;
      // Import fonti da archivio esterno (v4.28.22)
      case 'impCreaModello':     r = impCreaModello(); break;
      case 'impModelloCsv':      r = impModelloCsv(); break;
      case 'impAnteprima':       r = impAnteprima(token); break;
      case 'impApplica':         r = impApplica(token, {}); break;
      case 'impApplicaConSovr':  r = impApplica(token, { includiSovrapposte: true }); break;
      case 'impVerificaTecnica': r = impVerificaTecnica(token, {}); break;
      case 'impSelfTest':        r = impSelfTest(); break;
      case 'nlDiagnosiBozza':    r = nlDiagnosiBozza(); break;
      case 'nlTestataSelfTest':  r = nlTestataSelfTest(); break;
      // ── Fonti podcast/video: riallineamento su FontiFeed (v4.27.97) ──────
      case 'sezioniAnteprima':   r = fsAnteprima(); break;
      case 'podcastMigraDry':    r = fsRiallineaPodcast({ dryRun: true }); break;
      case 'podcastMigraApply':  r = fsRiallineaPodcast({}); break;
      case 'videoRiseminaDry':   r = fsRiseminaVideo({ dryRun: true }); break;
      case 'videoRiseminaApply': r = fsRiseminaVideo({}); break;
      case 'fsSelfTest':         r = fsSelfTest(); break;
      case 'scanPodcastVideo':   r = scanPodcastBisettimanale(); break;
      case 'pubScan':            r = pubDiscoveryScan({ queryCount: 5 }); break;
      // forzatura canale: adminRunTool(tool, token) non passa parametri liberi,
      // quindi i casi di confine hanno una voce dedicata ciascuno (v4.27.89)
      case 'canaleBandi_progettareEuropa': r = frForzaCanale('Progettare in Europa', 'bandi'); break;
      case 'canaleBandi_aib':              r = frForzaCanale('AIB', 'bandi'); break;
      case 'canaleBandi_nemo':             r = frForzaCanale('NEMO - European Museum Network', 'bandi'); break;
      case 'canaleBandi_ccw':              r = frForzaCanale('CCW', 'bandi'); break;
      case 'canaleBandi_gu':               r = frForzaCanale('Gazzetta Ufficiale', 'bandi'); break;
      case 'trendProponi':       r = trendProponi({ force: true, sostituisciPendente: true }); break; // proponi trend ora (scarta l'eventuale pendente e rivaluta)
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
      case 'enrichDeepDry':      r = enrichBandiDeep({ dryRun: true }); break;
      case 'enrichDeepApply':    r = enrichBandiDeep({ cap: 15 }); break;
      case 'puliziaNonBandoDry': r = puliziaRecordNonBando({ dryRun: true }); break;
      case 'puliziaNonBandoApply': r = puliziaRecordNonBando({ dryRun: false }); break;
      case 'archiviaVecchiDry':  r = archiviaVecchiSenzaScadenza({ dryRun: true }); break;
      case 'archiviaVecchiApply': r = archiviaVecchiSenzaScadenza({ dryRun: false }); break;
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

// ============================================================================
// v4.28.48 — Disattiva fonti con dominio morto o endpoint rimosso
// ============================================================================

/**
 * Cerca nel foglio FontiBandi_v5 le fonti con URL che matchano domini morti
 * e le disattiva (Attiva = false) + annota UltimoErrore.
 * Chiamabile da ?op=disattivaFontiMorte&k=sinopia2026
 */
function _disattivaFontiMorte_() {
  var DOMINI_MORTI = [
    { pattern: /bandiup\.it/i, motivo: 'Dominio bandiup.it non risolvibile (DNS morto, 12/08/2026)' },
    { pattern: /serviziocontrattipubblici\.it\/it\/open-data/i, motivo: 'Endpoint open-data rimosso (HTTP 404, 12/08/2026). Piattaforma migrata a HUB Contratti Pubblici senza API pubblica.' }
  ];

  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('FontiBandi_v5');
  if (!sh || sh.getLastRow() < 2) return { ok: false, errore: 'FontiBandi_v5 assente o vuoto' };

  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h) { return String(h || '').trim(); });
  var iUrl = head.indexOf('URL');
  var iAtt = head.indexOf('Attiva');
  var iNome = head.indexOf('Nome');
  var iErr = head.indexOf('UltimoErrore');
  if (iUrl < 0 || iAtt < 0) return { ok: false, errore: 'colonne URL/Attiva non trovate' };

  var disattivate = [];
  for (var r = 1; r < vals.length; r++) {
    var url = String(vals[r][iUrl] || '');
    var attiva = vals[r][iAtt];
    if (attiva !== true && String(attiva).toLowerCase() !== 'true') continue; // già inattiva

    for (var d = 0; d < DOMINI_MORTI.length; d++) {
      if (DOMINI_MORTI[d].pattern.test(url)) {
        var nome = String(vals[r][iNome] || '').substring(0, 60);
        // Disattiva
        sh.getRange(r + 1, iAtt + 1).setValue(false);
        if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue(DOMINI_MORTI[d].motivo);
        disattivate.push({ riga: r + 1, nome: nome, motivo: DOMINI_MORTI[d].motivo });
        break;
      }
    }
  }

  return { ok: true, disattivate: disattivate.length, dettagli: disattivate };
}

// ============================================================================
// v4.28.49 — Audit completo FontiBandi_v5: breakdown per stato e causa inattività
// ============================================================================

/**
 * Legge TUTTE le 167 righe di FontiBandi_v5 e restituisce un JSON con:
 *   - Riepilogo numerico (totale, attive, inattive)
 *   - Breakdown per Tipo, Categoria, Tier (colonna Priorita A/B/C)
 *   - Per le inattive: classificazione della CAUSA (failConsecutivi ≥ 3,
 *     mai scansionata, disattivata manualmente, dominio morto noto,
 *     spostata su canale news, altro errore)
 *   - Lista completa di ogni fonte con i campi diagnostici chiave
 *
 * Sola lettura — non scrive nulla.
 * Chiamabile da ?op=fontiBandiAudit&k=sinopia2026
 *
 * @return {Object} Struttura JSON dell'audit
 */
function _analisiCompletaFontiBandi_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('FontiBandi_v5');
  if (!sh || sh.getLastRow() < 2) {
    return { ok: false, errore: 'FontiBandi_v5 assente o vuoto' };
  }

  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h) { return String(h || '').trim(); });

  // Indici colonne per nome (robusto a riordini futuri)
  function col(n) { return head.indexOf(n); }
  var iNome   = col('Nome');
  var iUrl    = col('URL');
  var iTipo   = col('Tipo');
  var iTag    = col('Tag');
  var iCat    = col('Categoria');
  var iPri    = col('Priorita');   // contiene tier A/B/C oppure 1/2/3 legacy
  var iAtt    = col('Attiva');
  var iScan   = col('UltimaScan');
  var iEsito  = col('UltimoEsito');
  var iTot    = col('NRecordTotali');
  var iFail   = col('FailConsecutivi');
  var iErr    = col('UltimoErrore');
  var iLiv    = col('Livello');

  if (iNome < 0 || iAtt < 0) {
    return { ok: false, errore: 'Colonne obbligatorie (Nome, Attiva) non trovate nell\'intestazione' };
  }

  // Pattern domini/tag noti che indicano disattivazione automatica
  var RE_DOMINIO_MORTO = /DNS morto|dominio morto|endpoint rimosso|HTTP 404|non risolvibile/i;
  var RE_SPOSTATA_NEWS  = /spostata-su-news/i;

  // Contatori aggregati
  var totale    = 0;
  var nAttive   = 0;
  var nInattive = 0;

  var perTipo     = {};
  var perCategoria = {};
  var perTier     = { A: 0, B: 0, C: 0, altro: 0 };
  var perTierInattive = { A: 0, B: 0, C: 0, altro: 0 };

  // Cause di inattività (contatori)
  var cause = {
    failConsecutivi:   0,  // FailConsecutivi >= 3
    dominiMorti:       0,  // UltimoErrore contiene indicatori di dominio/endpoint morto
    spostataSuNews:    0,  // Tag contiene [spostata-su-news]
    maiScansionata:    0,  // UltimaScan vuota e NRecordTotali = 0
    disattivataManu:   0,  // Nessuna delle cause automatiche riconosciute
    altroErrore:       0   // UltimoErrore valorizzato ma non dominio morto
  };

  // Lista dettagliata di tutte le fonti
  var elencoTutte    = [];
  var elencoInattive = [];

  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    var nome  = String(row[iNome] || '').trim();
    if (!nome) continue;  // salta righe vuote

    totale++;

    var url    = String((iUrl  >= 0 ? row[iUrl]  : '') || '').trim();
    var tipo   = String((iTipo >= 0 ? row[iTipo] : '') || '').trim() || '—';
    var tag    = String((iTag  >= 0 ? row[iTag]  : '') || '').trim();
    var cat    = String((iCat  >= 0 ? row[iCat]  : '') || '').trim() || '—';
    var livRaw = String((iLiv  >= 0 ? row[iLiv]  : '') || '').trim();
    var esito  = String((iEsito >= 0 ? row[iEsito]: '') || '').trim();
    var err    = String((iErr  >= 0 ? row[iErr]  : '') || '').trim();

    // Tier: accetta A/B/C (nuovo) o 1/2/3 (legacy) o vuoto
    var priRaw = String((iPri >= 0 ? row[iPri] : '') || '').trim().toUpperCase();
    var tier;
    if (priRaw === 'A' || priRaw === 'B' || priRaw === 'C') {
      tier = priRaw;
    } else if (priRaw === '1') {
      tier = 'A';
    } else if (priRaw === '2') {
      tier = 'B';
    } else if (priRaw === '3') {
      tier = 'C';
    } else {
      // Fallback: deduzione da nome/URL se la colonna è vuota
      tier = (typeof frTierDaFonte === 'function') ? frTierDaFonte(nome, url) : 'altro';
    }

    var nTot   = Number((iTot  >= 0 ? row[iTot]  : 0) || 0);
    var nFail  = Number((iFail >= 0 ? row[iFail] : 0) || 0);

    var scanRaw = (iScan >= 0) ? row[iScan] : '';
    var scanDate = null;
    if (scanRaw instanceof Date && !isNaN(scanRaw.getTime())) {
      scanDate = scanRaw;
    } else if (scanRaw) {
      var parsed = new Date(scanRaw);
      if (!isNaN(parsed.getTime())) scanDate = parsed;
    }
    var scanStr = scanDate ? scanDate.toISOString().slice(0, 10) : '';

    var attivaRaw = (iAtt >= 0) ? row[iAtt] : false;
    var attiva = (attivaRaw === true || String(attivaRaw).toLowerCase() === 'true');

    // Contatori breakdown
    perTipo[tipo]     = (perTipo[tipo]     || 0) + 1;
    perCategoria[cat] = (perCategoria[cat] || 0) + 1;
    var tierKey = (tier === 'A' || tier === 'B' || tier === 'C') ? tier : 'altro';
    perTier[tierKey]++;

    // Costruisci record sintetico (incluso nell'elenco completo)
    var rec = {
      riga:    r + 1,
      nome:    nome.substring(0, 60),
      tipo:    tipo,
      cat:     cat,
      tier:    tier,
      attiva:  attiva,
      scan:    scanStr || null,
      nTot:    nTot,
      nFail:   nFail,
      esito:   esito || null,
      errore:  err ? err.substring(0, 120) : null
    };
    elencoTutte.push(rec);

    if (attiva) {
      nAttive++;
    } else {
      nInattive++;
      perTierInattive[tierKey]++;

      // Classificazione causa inattività (le cause non sono mutuamente esclusive:
      // si usa la prima che scatta in ordine di priorità)
      var causa;
      if (RE_SPOSTATA_NEWS.test(tag) || RE_SPOSTATA_NEWS.test(err)) {
        causa = 'spostataSuNews';
      } else if (RE_DOMINIO_MORTO.test(err)) {
        causa = 'dominiMorti';
      } else if (nFail >= 3) {
        causa = 'failConsecutivi';
      } else if (!scanStr && nTot === 0) {
        causa = 'maiScansionata';
      } else if (err) {
        causa = 'altroErrore';
      } else {
        causa = 'disattivataManu';
      }
      cause[causa]++;

      elencoInattive.push({
        riga:   r + 1,
        nome:   nome.substring(0, 60),
        url:    url.substring(0, 80),
        tipo:   tipo,
        cat:    cat,
        tier:   tier,
        scan:   scanStr || null,
        nTot:   nTot,
        nFail:  nFail,
        causa:  causa,
        errore: err ? err.substring(0, 120) : null,
        tag:    tag ? tag.substring(0, 80) : null
      });
    }
  }

  // Ordinamento per leggibilità: inattive per tier poi per causa
  var ordTier = { A: 0, B: 1, C: 2, altro: 3 };
  elencoInattive.sort(function(a, b) {
    var ta = ordTier[a.tier] !== undefined ? ordTier[a.tier] : 3;
    var tb = ordTier[b.tier] !== undefined ? ordTier[b.tier] : 3;
    if (ta !== tb) return ta - tb;
    if (a.causa < b.causa) return -1;
    if (a.causa > b.causa) return 1;
    return 0;
  });

  return {
    ok:        true,
    generato:  new Date().toISOString(),
    foglio:    'FontiBandi_v5',
    riepilogo: {
      totale:   totale,
      attive:   nAttive,
      inattive: nInattive
    },
    breakdownTipo:      perTipo,
    breakdownCategoria: perCategoria,
    breakdownTier:      perTier,
    breakdownTierInattive: perTierInattive,
    causeInattivita: {
      _legenda: {
        failConsecutivi:  'FailConsecutivi >= 3 (fonte in errore persistente)',
        dominiMorti:      'UltimoErrore indica dominio/endpoint non raggiungibile',
        spostataSuNews:   'Tag/Errore contiene [spostata-su-news]: disattivata da frSeparaCanali',
        maiScansionata:   'Nessuna scansione rilevata (UltimaScan vuota e NRecordTotali=0)',
        altroErrore:      'UltimoErrore valorizzato ma causa non classificata',
        disattivataManu:  'Nessuna causa automatica rilevata: presumibilmente disattivata manualmente'
      },
      conteggi: cause
    },
    inattive:   elencoInattive,
    tutte:      elencoTutte
  };
}

// ============================================================================
// v4.28.51 — Report qualità dati bandi per fonte (foglio Bandi_v5)
// ============================================================================

/**
 * Analizza la qualità dei dati nel foglio Bandi_v5 (bandi attivi, non archiviati).
 * Raggruppa per FONTE_NOME e calcola, per ciascuna fonte:
 *   - totale bandi attivi
 *   - bandi con scadenza valorizzata
 *   - bandi con sommario > 50 caratteri
 *   - bandi con ente valorizzato
 *   - bandi aggiunti negli ultimi 30 giorni
 *   - lunghezza media del sommario
 *   - score qualità: media di (has_scadenza + has_sommario + has_ente) / 3
 * Risultato ordinato per score qualità decrescente.
 *
 * Sola lettura — non scrive nulla.
 * Chiamabile da ?op=qualitaBandi&k=sinopia2026
 *
 * @return {Object} { ok, generato, foglio, totaleAttivi, fonti[] }
 */
function _qualitaBandiReport_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Bandi_v5');
  if (!sh || sh.getLastRow() < 2) {
    return { ok: false, errore: 'Bandi_v5 assente o vuoto' };
  }

  var vals = sh.getDataRange().getValues();
  // vals[0] è la riga di intestazione — usiamo COL_B (1-indexed) direttamente
  // Accumulatori per fonte: { [fonteNome]: { totale, conScadenza, conSommario, conEnte, recenti, lunghezzeSommario[] } }
  var mappa = {};
  var ora = new Date();
  var trentaGiorni = ora.getTime() - 30 * 24 * 3600 * 1000;

  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];

    // Salta righe senza ID
    if (!row[COL_B.ID - 1]) continue;

    // Considera solo record attivi (non archiviati)
    var statoRecord = String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase().trim();
    if (statoRecord === 'archiviato') continue;

    var fonte = String(row[COL_B.FONTE_NOME - 1] || '').trim() || '(fonte sconosciuta)';

    if (!mappa[fonte]) {
      mappa[fonte] = {
        totale:          0,
        conScadenza:     0,
        conSommario:     0,
        conEnte:         0,
        recenti:         0,
        lunghezzeSommario: []
      };
    }

    var acc = mappa[fonte];
    acc.totale++;

    // Scadenza: qualsiasi valore non vuoto
    var rawScad = row[COL_B.SCADENZA - 1];
    if (rawScad && String(rawScad).trim() !== '') acc.conScadenza++;

    // Sommario: stringa con lunghezza > 50
    var sommario = String(row[COL_B.SOMMARIO - 1] || '').trim();
    var lunghezza = sommario.length;
    acc.lunghezzeSommario.push(lunghezza);
    if (lunghezza > 50) acc.conSommario++;

    // Ente: qualsiasi valore non vuoto
    var ente = String(row[COL_B.ENTE - 1] || '').trim();
    if (ente !== '') acc.conEnte++;

    // Recenti: DataRilevamento negli ultimi 30 giorni
    var rawRil = row[COL_B.DATA_RILEVAMENTO - 1];
    if (rawRil) {
      var dataRil = (rawRil instanceof Date) ? rawRil : new Date(rawRil);
      if (!isNaN(dataRil.getTime()) && dataRil.getTime() >= trentaGiorni) {
        acc.recenti++;
      }
    }
  }

  // Costruisci array risultati per fonte
  var fonti = [];
  var nomiSorted = Object.keys(mappa);

  for (var i = 0; i < nomiSorted.length; i++) {
    var nome = nomiSorted[i];
    var d    = mappa[nome];
    var tot  = d.totale;

    // Score qualità: media di tre flag booleani (0..1 ciascuno)
    var pScadenza = tot > 0 ? d.conScadenza / tot : 0;
    var pSommario = tot > 0 ? d.conSommario / tot : 0;
    var pEnte     = tot > 0 ? d.conEnte     / tot : 0;
    var score     = (pScadenza + pSommario + pEnte) / 3;

    // Lunghezza media sommario
    var totaleLun = 0;
    for (var j = 0; j < d.lunghezzeSommario.length; j++) totaleLun += d.lunghezzeSommario[j];
    var mediaLunghezza = tot > 0 ? Math.round(totaleLun / tot) : 0;

    fonti.push({
      fonte:              nome,
      totale:             tot,
      conScadenza:        d.conScadenza,
      pctScadenza:        Math.round(pScadenza * 100),
      conSommario:        d.conSommario,
      pctSommario:        Math.round(pSommario * 100),
      conEnte:            d.conEnte,
      pctEnte:            Math.round(pEnte * 100),
      recentiUltimi30gg:  d.recenti,
      mediaLunghezzaSommario: mediaLunghezza,
      scoreQualita:       Math.round(score * 100) / 100
    });
  }

  // Ordina per score qualità decrescente, poi per totale decrescente come tiebreak
  fonti.sort(function(a, b) {
    if (b.scoreQualita !== a.scoreQualita) return b.scoreQualita - a.scoreQualita;
    return b.totale - a.totale;
  });

  var totaleAttivi = 0;
  for (var k = 0; k < fonti.length; k++) totaleAttivi += fonti[k].totale;

  return {
    ok:          true,
    generato:    ora.toISOString(),
    foglio:      'Bandi_v5',
    totaleAttivi: totaleAttivi,
    numFonti:    fonti.length,
    fonti:       fonti
  };
}

// ============================================================================
// v4.28.53 — Pulizia norme false (senza riferimento normativo nel titolo)
// ============================================================================

/**
 * Rimuove dal foglio Norme i record il cui titolo NON contiene un riferimento
 * normativo esplicito (D.Lgs, decreto, circolare, WCAG, etc.).
 * Usa la stessa regex _NORME_RE di NormeCultura.js (disponibile nel global scope GAS).
 */
function _puliziaNormeFalse_(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun !== false;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Norme');
  if (!sh || sh.getLastRow() < 2) return { ok: false, errore: 'Foglio Norme assente o vuoto' };

  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h) { return String(h || '').trim(); });
  var iTit = head.indexOf('Titolo');
  if (iTit < 0) return { ok: false, errore: 'Colonna Titolo non trovata' };

  // Usa la regex globale di NormeCultura.js se disponibile
  var re = (typeof _NORME_RE !== 'undefined') ? _NORME_RE :
    /\b(decret[oi]|d\.?\s?lgs|d\.?\s?l\.|d\.?\s?m\.|circolar[ei]|direttiva\s+(?:ue|europea)|legge\s+n|art\.?\s?bonus|codice\s+dei\s+beni\s+cultural|gdpr|wcag|peba\b|eaa\b|ai\s+act|codice\s+appalti|terzo\s+settore|standard\s+icom|livelli\s+uniformi)/i;

  var daEliminare = [];
  for (var r = 1; r < vals.length; r++) {
    var titolo = String(vals[r][iTit] || '').trim();
    if (!titolo) continue;
    if (!re.test(titolo)) {
      daEliminare.push({ riga: r + 1, titolo: titolo.substring(0, 70) });
    }
  }

  if (!dryRun && daEliminare.length > 0) {
    daEliminare.sort(function(a, b) { return b.riga - a.riga; });
    for (var i = 0; i < daEliminare.length; i++) {
      sh.deleteRow(daEliminare[i].riga);
    }
  }

  return { ok: true, dryRun: dryRun, eliminate: daEliminare.length, totaleNorme: vals.length - 1,
           rimaste: (vals.length - 1) - daEliminare.length, esempi: daEliminare.slice(0, 10) };
}

// ============================================================================
// v4.28.51 — Archivia bandi non-bandi (articoli, esiti, dataset nel radar)
// ============================================================================

/**
 * Archivia i record del foglio Bandi_v5 provenienti da fonti che NON producono
 * bandi reali (articoli di magazine, esiti/aggiudicazioni, dataset open data).
 * Imposta STATO_RECORD = 'archiviato' sui record di queste fonti.
 */
function _archiviaBandiNonBandi_(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun !== false;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Bandi_v5');
  if (!sh || sh.getLastRow() < 2) return { ok: false, errore: 'Bandi_v5 assente o vuoto' };

  // Fonti che NON sono bandi — articoli/news/dataset/esiti
  var FONTI_NON_BANDI = [
    'Artribune - Musei',
    'MIT Technology Review',
    'TED — Esiti/Aggiudicazioni',
    'dati.gov.it — Open Data PA'
  ];

  var vals = sh.getDataRange().getValues();
  var iF = (typeof COL_B !== 'undefined' && COL_B.FONTE_NOME) ? COL_B.FONTE_NOME - 1 : -1;
  var iS = (typeof COL_B !== 'undefined' && COL_B.STATO_RECORD) ? COL_B.STATO_RECORD - 1 : -1;
  if (iF < 0 || iS < 0) return { ok: false, errore: 'COL_B.FONTE_NOME o STATO_RECORD non definiti' };

  var archiviati = 0;
  var perFonte = {};
  var righe = [];

  for (var r = 1; r < vals.length; r++) {
    var fonte = String(vals[r][iF] || '').trim();
    var stato = String(vals[r][iS] || '').trim().toLowerCase();
    if (stato === 'archiviato') continue;
    var match = false;
    for (var f = 0; f < FONTI_NON_BANDI.length; f++) {
      if (fonte === FONTI_NON_BANDI[f]) { match = true; break; }
    }
    if (!match) continue;
    archiviati++;
    perFonte[fonte] = (perFonte[fonte] || 0) + 1;
    if (!dryRun) righe.push(r + 1);
  }

  if (!dryRun && righe.length > 0) {
    for (var i = 0; i < righe.length; i++) {
      sh.getRange(righe[i], iS + 1).setValue('archiviato');
    }
  }

  return { ok: true, dryRun: dryRun, archiviati: archiviati, perFonte: perFonte };
}

// ============================================================================
// v4.28.50 — Pulizia fonti orfane/deprecate da FontiBandi_v5
// ============================================================================

/**
 * Elimina dal foglio FontiBandi_v5 le righe con UltimoErrore che contiene
 * ORFANA_OFF o DEPRECATA. Queste fonti non sono mai state collegate a scanner
 * attivi o hanno endpoint dismessi — occupano spazio e inquinano i contatori.
 *
 * @param {Object} [opts] { dryRun: true }
 * @return {Object} { ok, dryRun, eliminate, dettagli[] }
 */
function _puliziaFontiOrfane_(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun !== false; // prudente: anteprima di default
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('FontiBandi_v5');
  if (!sh || sh.getLastRow() < 2) return { ok: false, errore: 'FontiBandi_v5 assente o vuoto' };

  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h) { return String(h || '').trim(); });
  var iNome = head.indexOf('Nome');
  var iAtt  = head.indexOf('Attiva');
  var iErr  = head.indexOf('UltimoErrore');
  if (iNome < 0 || iErr < 0) return { ok: false, errore: 'colonne Nome/UltimoErrore non trovate' };

  var RE_ELIMINA = /ORFANA_OFF|\[DEPRECATA/i;
  var daEliminare = []; // righe da eliminare (indice 1-based), dal basso verso l'alto

  for (var r = 1; r < vals.length; r++) {
    var nome = String(vals[r][iNome] || '').trim();
    var err  = String(vals[r][iErr] || '').trim();
    var attiva = vals[r][iAtt];
    if (attiva === true || String(attiva).toLowerCase() === 'true') continue; // non toccare le attive

    if (RE_ELIMINA.test(err)) {
      daEliminare.push({ riga: r + 1, nome: nome.substring(0, 60), errore: err.substring(0, 80) });
    }
  }

  if (!dryRun && daEliminare.length > 0) {
    // Elimina dal basso verso l'alto per non spostare gli indici
    daEliminare.sort(function(a, b) { return b.riga - a.riga; });
    for (var i = 0; i < daEliminare.length; i++) {
      sh.deleteRow(daEliminare[i].riga);
    }
  }

  return { ok: true, dryRun: dryRun, eliminate: daEliminare.length, dettagli: daEliminare };
}

// ============================================================================
// v4.28.52 — Audit coerenza contenuti per sezione (sola lettura)
// ============================================================================

/**
 * Verifica la coerenza dei contenuti nelle sezioni principali della webapp
 * (esclusa News, già trattata altrove). Per ogni sezione:
 *   - Totale record attivi
 *   - Record aggiunti negli ultimi 30 giorni
 *   - Campione di 20 titoli recenti
 *   - Check campi obbligatori specifici della sezione
 *   - Segnalazione possibili misclassificazioni (titoli anomali)
 *
 * Sola lettura — non scrive nulla.
 * Chiamabile da ?op=auditSezioni&k=sinopia2026
 *
 * @return {Object} { ok, generato, sezioni: { podcast, pubblicazioni, norme, lavoro } }
 */
function _auditCoerenzaSezioni_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var ora = new Date();
  var trentaGgMs = 30 * 24 * 3600 * 1000;
  var soglia30gg = ora.getTime() - trentaGgMs;

  // ─── helper: legge un foglio → { sh, vals, head } o null ────────────────
  function _leggi(nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) return null;
    var vals = sh.getDataRange().getValues();
    return { sh: sh, vals: vals, head: vals[0].map(function(h){ return String(h||'').trim(); }) };
  }

  // ─── helper: indice colonna per nome (prima corrispondenza tra alias) ────
  function _col(head, names) {
    for (var n = 0; n < names.length; n++) {
      var ix = head.indexOf(names[n]);
      if (ix >= 0) return ix;
    }
    return -1;
  }

  // ─── helper: controlla se un titolo sembra misclassificato ──────────────
  // Restituisce una stringa descrittiva se il titolo appare fuori contesto,
  // stringa vuota se tutto ok.
  var _RE_NEWS    = /\b(notizia|comunicato stampa|conferenza stampa|intervista)\b/i;
  var _RE_BANDO   = /\b(bando|avviso|invito a presentare|scadenz|finanziamento|contributo)\b/i;
  var _RE_PODCAST_KW = /\b(podcast|episod|puntata|stagione|serie|ascolto|intervista audio)\b/i;
  var _RE_LIBRO   = /\b(libro|volume|monografia|edizione|isbn|doi|editore|autore)\b/i;
  var _RE_NORMA   = /\b(decret|circolar|legge|d\.lgs|d\.m\.|wcag|regolamento|direttiva)\b/i;
  var _RE_CONCORSO= /\b(concorso|selezione pubblica|avviso di selezione|assunzione|posto|graduatoria)\b/i;

  function _flagMisclass(titolo, sezione) {
    var t = String(titolo || '').toLowerCase();
    var flags = [];
    if (sezione !== 'podcast'       && _RE_PODCAST_KW.test(t)) flags.push('sembra podcast');
    if (sezione !== 'pubblicazioni' && _RE_LIBRO.test(t))       flags.push('sembra libro/pubblicazione');
    if (sezione !== 'norme'         && _RE_NORMA.test(t))       flags.push('sembra norma');
    if (sezione !== 'lavoro'        && _RE_CONCORSO.test(t))    flags.push('sembra concorso');
    if (_RE_NEWS.test(t))                                        flags.push('sembra notizia generica');
    if (sezione !== 'lavoro' && sezione !== 'bandi' && _RE_BANDO.test(t)) flags.push('sembra bando');
    return flags.join('; ');
  }

  // ─── helper: analisi campione titoli ─────────────────────────────────────
  function _campioneTitoli(vals, iTitolo, iData, sezione, iStato) {
    var items = [];
    for (var r = 1; r < vals.length; r++) {
      if (!vals[r][iTitolo]) continue;
      // Salta archiviati se colonna disponibile
      if (iStato >= 0) {
        var st = String(vals[r][iStato] || '').toLowerCase().trim();
        if (st === 'archiviato') continue;
      }
      var dataVal = (iData >= 0) ? vals[r][iData] : null;
      var dataMs = 0;
      if (dataVal instanceof Date) dataMs = dataVal.getTime();
      else if (dataVal) { var d = new Date(dataVal); if (!isNaN(d.getTime())) dataMs = d.getTime(); }
      items.push({ titolo: String(vals[r][iTitolo]).substring(0, 100), dataMs: dataMs, riga: r + 1 });
    }
    // Ordina per data decrescente, poi prendi i 20 più recenti
    items.sort(function(a, b) { return b.dataMs - a.dataMs; });
    var campione = items.slice(0, 20);
    var misclassificati = [];
    campione.forEach(function(it) {
      var flag = _flagMisclass(it.titolo, sezione);
      if (flag) misclassificati.push({ titolo: it.titolo, riga: it.riga, flag: flag });
    });
    return { campione: campione.map(function(i){ return i.titolo; }), misclassificati: misclassificati };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. PODCAST — foglio "Podcast" (= SH.PODCAST)
  //    Campi attesi: Serie, Durata, Link (audio/episodio)
  //    Schema: ID | DataRilevamento | Titolo | Serie | Autore | Tematica |
  //            Durata | DataPubblicazione | Link | SommarioAI | ...
  // ──────────────────────────────────────────────────────────────────────────
  var auditPodcast = { sezione: 'Podcast', foglio: 'Podcast', ok: false };
  try {
    var dPod = _leggi('Podcast');
    if (!dPod) {
      auditPodcast.errore = 'Foglio Podcast assente o vuoto';
    } else {
      var hP = dPod.head, vP = dPod.vals;
      var iPodTit   = _col(hP, ['Titolo','Title']);
      var iPodSerie = _col(hP, ['Serie','Serie/Programma']);
      var iPodDur   = _col(hP, ['Durata','Duration']);
      var iPodLink  = _col(hP, ['Link','URL','AudioUrl']);
      var iPodData  = _col(hP, ['DataRilevamento','DataPubblicazione','Data']);
      var iPodStato = _col(hP, ['StatoRecord','Stato']);

      var podTot = 0, podRecenti = 0, podSenzaSerie = 0, podSenzaDurata = 0, podSenzaLink = 0;
      for (var r = 1; r < vP.length; r++) {
        var row = vP[r];
        if (!row[iPodTit]) continue;
        if (iPodStato >= 0 && String(row[iPodStato]||'').toLowerCase().trim() === 'archiviato') continue;
        podTot++;
        var dataMs = 0;
        if (iPodData >= 0 && row[iPodData]) {
          var dv = (row[iPodData] instanceof Date) ? row[iPodData] : new Date(row[iPodData]);
          if (!isNaN(dv.getTime())) dataMs = dv.getTime();
        }
        if (dataMs >= soglia30gg) podRecenti++;
        if (iPodSerie >= 0 && !String(row[iPodSerie]||'').trim()) podSenzaSerie++;
        if (iPodDur   >= 0 && !String(row[iPodDur]  ||'').trim()) podSenzaDurata++;
        if (iPodLink  >= 0 && !String(row[iPodLink] ||'').trim()) podSenzaLink++;
      }

      var campiMancanti = [];
      if (iPodSerie  < 0) campiMancanti.push('Serie (colonna assente)');
      if (iPodDur    < 0) campiMancanti.push('Durata (colonna assente)');
      if (iPodLink   < 0) campiMancanti.push('Link audio (colonna assente)');

      var anal = _campioneTitoli(vP, iPodTit, iPodData, 'podcast', iPodStato);

      auditPodcast.ok            = true;
      auditPodcast.totale        = podTot;
      auditPodcast.recentiUltimi30gg = podRecenti;
      auditPodcast.campiObbligatori = {
        senzaSerie:   podSenzaSerie,
        senzaDurata:  podSenzaDurata,
        senzaLinkAudio: podSenzaLink
      };
      auditPodcast.campiMancanti    = campiMancanti;
      auditPodcast.campione20Titoli = anal.campione;
      auditPodcast.misclassificati  = anal.misclassificati;
    }
  } catch (eP) {
    auditPodcast.errore = eP.message;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. PUBBLICAZIONI — foglio "Pubblicazioni" (= SH.LIBRI)
  //    Campi attesi: Autore, Editore, (ISBN/DOI → colonna Link o dedicata)
  //    Schema: ID | Titolo | Autore | Editore | Anno | Ambito | Tematica |
  //            Descrizione | Link | Copertina_URL | DataAggiunta | Fonte | Stato | ...
  // ──────────────────────────────────────────────────────────────────────────
  var auditPub = { sezione: 'Pubblicazioni', foglio: 'Pubblicazioni', ok: false };
  try {
    var dLib = _leggi('Pubblicazioni');
    if (!dLib) {
      auditPub.errore = 'Foglio Pubblicazioni assente o vuoto';
    } else {
      var hL = dLib.head, vL = dLib.vals;
      var iLibTit    = _col(hL, ['Titolo','Title']);
      var iLibAutore = _col(hL, ['Autore','Author']);
      var iLibEdit   = _col(hL, ['Editore','Publisher']);
      var iLibLink   = _col(hL, ['Link','URL','DOI','ISBN']);
      var iLibData   = _col(hL, ['DataAggiunta','DataPubblicazione','Anno','Data']);
      var iLibStato  = _col(hL, ['Stato','StatoRecord']);

      var libTot = 0, libRecenti = 0, libSenzaAutore = 0, libSenzaEdit = 0, libSenzaLink = 0;
      for (var r = 1; r < vL.length; r++) {
        var row = vL[r];
        if (!row[iLibTit]) continue;
        if (iLibStato >= 0 && String(row[iLibStato]||'').toLowerCase().trim() === 'archiviato') continue;
        libTot++;
        var dataMs = 0;
        if (iLibData >= 0 && row[iLibData]) {
          var dv = (row[iLibData] instanceof Date) ? row[iLibData] : new Date(row[iLibData]);
          if (!isNaN(dv.getTime())) dataMs = dv.getTime();
        }
        if (dataMs >= soglia30gg) libRecenti++;
        if (iLibAutore >= 0 && !String(row[iLibAutore]||'').trim()) libSenzaAutore++;
        if (iLibEdit   >= 0 && !String(row[iLibEdit]  ||'').trim()) libSenzaEdit++;
        if (iLibLink   >= 0 && !String(row[iLibLink]  ||'').trim()) libSenzaLink++;
      }

      var campiLib = [];
      if (iLibAutore < 0) campiLib.push('Autore (colonna assente)');
      if (iLibEdit   < 0) campiLib.push('Editore (colonna assente)');
      if (iLibLink   < 0) campiLib.push('Link/DOI/ISBN (colonna assente)');

      var anal = _campioneTitoli(vL, iLibTit, iLibData, 'pubblicazioni', iLibStato);

      auditPub.ok              = true;
      auditPub.totale          = libTot;
      auditPub.recentiUltimi30gg = libRecenti;
      auditPub.campiObbligatori = {
        senzaAutore: libSenzaAutore,
        senzaEditore: libSenzaEdit,
        senzaLinkIsbnDoi: libSenzaLink
      };
      auditPub.campiMancanti    = campiLib;
      auditPub.campione20Titoli = anal.campione;
      auditPub.misclassificati  = anal.misclassificati;
    }
  } catch (eL) {
    auditPub.errore = eL.message;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. NORME — foglio "Norme"
  //    Campi attesi: Titolo contiene riferimento normativo (_NORME_RE),
  //                  Fonte, Link, Ambito
  //    Schema: ID | Titolo | Fonte | Link | Ambito | Descrizione | DataAggiunta | Stato
  // ──────────────────────────────────────────────────────────────────────────
  var auditNorme = { sezione: 'Norme', foglio: 'Norme', ok: false };
  try {
    var dNrm = _leggi('Norme');
    if (!dNrm) {
      auditNorme.errore = 'Foglio Norme assente o vuoto';
    } else {
      var hN = dNrm.head, vN = dNrm.vals;
      var iNrmTit   = _col(hN, ['Titolo','Title']);
      var iNrmFonte = _col(hN, ['Fonte','Source']);
      var iNrmLink  = _col(hN, ['Link','URL']);
      var iNrmAmb   = _col(hN, ['Ambito']);
      var iNrmData  = _col(hN, ['DataAggiunta','Data','DataPubblicazione']);
      var iNrmStato = _col(hN, ['Stato','StatoRecord']);

      // Usa la stessa _NORME_RE definita in NormeCultura.js (global scope GAS)
      var hasNormeRe = (typeof _NORME_RE !== 'undefined');

      var nrmTot = 0, nrmRecenti = 0, nrmSenzaRifNorm = 0, nrmSenzaFonte = 0, nrmSenzaLink = 0;
      var nrmTitoliAnomali = [];
      for (var r = 1; r < vN.length; r++) {
        var row = vN[r];
        if (iNrmTit < 0 || !row[iNrmTit]) continue;
        if (iNrmStato >= 0 && String(row[iNrmStato]||'').toLowerCase().trim() === 'archiviato') continue;
        nrmTot++;
        var titNrm = String(row[iNrmTit] || '');
        var dataMs = 0;
        if (iNrmData >= 0 && row[iNrmData]) {
          var dv = (row[iNrmData] instanceof Date) ? row[iNrmData] : new Date(row[iNrmData]);
          if (!isNaN(dv.getTime())) dataMs = dv.getTime();
        }
        if (dataMs >= soglia30gg) nrmRecenti++;
        if (iNrmFonte >= 0 && !String(row[iNrmFonte]||'').trim()) nrmSenzaFonte++;
        if (iNrmLink  >= 0 && !String(row[iNrmLink] ||'').trim()) nrmSenzaLink++;
        // Verifica presenza riferimento normativo nel titolo
        if (hasNormeRe && !_NORME_RE.test(titNrm)) {
          nrmSenzaRifNorm++;
          if (nrmTitoliAnomali.length < 10) {
            nrmTitoliAnomali.push({ titolo: titNrm.substring(0, 100), riga: r + 1, flag: 'nessun riferimento normativo nel titolo' });
          }
        }
      }

      var campiNrm = [];
      if (iNrmFonte < 0) campiNrm.push('Fonte (colonna assente)');
      if (iNrmLink  < 0) campiNrm.push('Link (colonna assente)');
      if (iNrmAmb   < 0) campiNrm.push('Ambito (colonna assente)');
      if (!hasNormeRe) campiNrm.push('_NORME_RE non disponibile (NormeCultura.js non caricato?)');

      var anal = _campioneTitoli(vN, iNrmTit, iNrmData, 'norme', iNrmStato);

      auditNorme.ok              = true;
      auditNorme.totale          = nrmTot;
      auditNorme.recentiUltimi30gg = nrmRecenti;
      auditNorme.campiObbligatori = {
        senzaRiferimentoNormativo: nrmSenzaRifNorm,
        senzaFonte: nrmSenzaFonte,
        senzaLink:  nrmSenzaLink
      };
      auditNorme.campiMancanti    = campiNrm;
      auditNorme.titoliSenzaRifNorm = nrmTitoliAnomali; // titoli che non matchano _NORME_RE
      auditNorme.campione20Titoli = anal.campione;
      auditNorme.misclassificati  = anal.misclassificati;
    }
  } catch (eN) {
    auditNorme.errore = eN.message;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. LAVORO CULTURA — record in Bandi_v5 con tipoBando='lavoro'
  //    (non esiste un foglio dedicato: i concorsi vivono in Bandi_v5)
  //    Campi attesi: Ente, Scadenza, Link (alla pagina GU o bando)
  // ──────────────────────────────────────────────────────────────────────────
  var auditLavoro = { sezione: 'LavoroCultura', foglio: 'Bandi_v5 (tipoBando=lavoro)', ok: false };
  try {
    var dLav = _leggi('Bandi_v5');
    if (!dLav) {
      auditLavoro.errore = 'Foglio Bandi_v5 assente o vuoto';
    } else {
      var hLav = dLav.head, vLav = dLav.vals;

      // Usa COL_B se disponibile (indici 1-based), altrimenti fallback per nome colonna
      var usaColB = (typeof COL_B !== 'undefined');
      var iLavTit    = usaColB ? (COL_B.TITOLO    - 1) : _col(hLav, ['Titolo','Title']);
      var iLavEnte   = usaColB ? (COL_B.ENTE      - 1) : _col(hLav, ['Ente','Organizzazione']);
      var iLavScad   = usaColB ? (COL_B.SCADENZA  - 1) : _col(hLav, ['Scadenza','DataScadenza']);
      var iLavLink   = usaColB ? (COL_B.URL_FONTE - 1) : _col(hLav, ['URL_Fonte','Link','URL']);
      var iLavData   = usaColB ? (COL_B.DATA_RILEVAMENTO - 1) : _col(hLav, ['DataRilevamento','Data']);
      var iLavTipo   = usaColB ? (COL_B.TIPO_BANDO - 1) : _col(hLav, ['TipoBando','Tipo']);
      var iLavStato  = usaColB ? (COL_B.STATO_RECORD - 1) : _col(hLav, ['StatoRecord','Stato']);

      var lavTot = 0, lavRecenti = 0, lavSenzaEnte = 0, lavSenzaScad = 0, lavSenzaLink = 0;
      var lavCampioneTitoli = [];
      for (var r = 1; r < vLav.length; r++) {
        var row = vLav[r];
        if (!row[0]) continue; // riga vuota (ID mancante)
        // Solo concorsi lavoro
        if (iLavTipo >= 0 && String(row[iLavTipo]||'').toLowerCase().trim() !== 'lavoro') continue;
        // Salta archiviati
        if (iLavStato >= 0 && String(row[iLavStato]||'').toLowerCase().trim() === 'archiviato') continue;
        lavTot++;
        var dataMs = 0;
        if (iLavData >= 0 && row[iLavData]) {
          var dv = (row[iLavData] instanceof Date) ? row[iLavData] : new Date(row[iLavData]);
          if (!isNaN(dv.getTime())) dataMs = dv.getTime();
        }
        if (dataMs >= soglia30gg) lavRecenti++;
        if (iLavEnte >= 0 && !String(row[iLavEnte]||'').trim()) lavSenzaEnte++;
        if (iLavScad >= 0 && !String(row[iLavScad]||'').trim()) lavSenzaScad++;
        if (iLavLink >= 0 && !String(row[iLavLink]||'').trim()) lavSenzaLink++;
        var titLav = iLavTit >= 0 ? String(row[iLavTit]||'').substring(0, 100) : '';
        if (titLav && lavCampioneTitoli.length < 20) lavCampioneTitoli.push({ titolo: titLav, dataMs: dataMs });
      }
      lavCampioneTitoli.sort(function(a, b){ return b.dataMs - a.dataMs; });

      // Misclassificati: concorsi lavoro che non contengono keyword concorso nel titolo
      var lavAnomal = [];
      lavCampioneTitoli.forEach(function(it) {
        if (!_RE_CONCORSO.test(it.titolo.toLowerCase())) {
          lavAnomal.push({ titolo: it.titolo, flag: 'titolo non contiene keyword concorso/selezione' });
        }
      });

      auditLavoro.ok              = true;
      auditLavoro.totale          = lavTot;
      auditLavoro.recentiUltimi30gg = lavRecenti;
      auditLavoro.campiObbligatori = {
        senzaEnte:    lavSenzaEnte,
        senzaScadenza: lavSenzaScad,
        senzaLink:    lavSenzaLink
      };
      auditLavoro.campione20Titoli = lavCampioneTitoli.map(function(i){ return i.titolo; });
      auditLavoro.misclassificati  = lavAnomal;
    }
  } catch (eLav) {
    auditLavoro.errore = eLav.message;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Riepilogo finale
  // ──────────────────────────────────────────────────────────────────────────
  return {
    ok:       true,
    generato: ora.toISOString(),
    nota:     'Audit coerenza contenuti (sola lettura). Bandi_v5 escluso (analizzato separatamente). News esclusa per design.',
    sezioni: {
      podcast:       auditPodcast,
      pubblicazioni: auditPub,
      norme:         auditNorme,
      lavoro:        auditLavoro
    }
  };
}
