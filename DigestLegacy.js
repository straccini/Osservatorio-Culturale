// ============================================================================
//  DigestLegacy.js — Funzioni digest legacy (preparaBozzaDigestLunedi, lunediMattina)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//  v4.27.36 — Estratto da Codice.js (refactoring modularizzazione)
//
//  Contiene le funzioni legacy del digest settimanale.
//  Il sistema attuale usa weeklyNewsletterAuthRequest (Editoriale_v1.js)
//  ma queste restano come fallback e per compatibilita trigger.
//
//  Dipendenze: getMainSS(), SH, COL, getBandiRadar(), sendTelegram(),
//              formatDate(), MailApp
// ============================================================================

// AGGIUNTA A ScannerBandi.gs — v4.2
// Incollare DOPO la funzione setupTriggersUnificati()
// ==================================================================

// ==================================================================
// BOZZA DIGEST AUTOMATICA — ogni lunedì dopo lunediMattina()
// Selezione: max 10 bandi (urgenti prima) + max 20 notizie (score↓) + 1 podcast
// ==================================================================
function preparaBozzaDigestLunedi() {
  const SS = getMainSS();
  const oggi = new Date();
  const cutoff14 = new Date(oggi.getTime() - 14 * 86400000);

  // --- 1. BANDI: urgenti (≤14gg) prima, poi per importo, max 10 ---
  const tuttiBandi = getBandiRadar().filter(b =>
    b.statoRecord !== 'archiviato' &&
    !['Scaduto', 'Archiviato'].includes(b.status)
  );
  const bandiSel = tuttiBandi
    .map(b => {
      const dl = b.scadenza ? Math.ceil((new Date(b.scadenza) - oggi) / 86400000) : null;
      return { ...b, _dl: dl };
    })
    .sort((a, b) => {
      const aU = (a._dl !== null && a._dl >= 0 && a._dl <= 14) ? 0 : 1;
      const bU = (b._dl !== null && b._dl >= 0 && b._dl <= 14) ? 0 : 1;
      if (aU !== bU) return aU - bU;
      if (a._dl !== null && b._dl !== null && !aU) return a._dl - b._dl;
      return (b.importo || 0) - (a.importo || 0);
    })
    .slice(0, 10);

  // --- 2. NOTIZIE: score desc, ultimi 14 giorni, non archiviate, max 20 ---
  const shN = SS.getSheetByName(SH.ITEMS);
  let notizieCount = 0;
  if (shN && shN.getLastRow() > 1) {
    const rows = shN.getDataRange().getValues();
    const h = rows[0];
    const idI    = h.indexOf('ID'),
          archI  = h.indexOf('Archiviato'),
          digI   = h.indexOf('InclusiNelDigest'),
          salvI  = h.indexOf('Salvato'),
          scoreI = h.indexOf('Score'),
          dataI  = h.indexOf('DataAcquisizione');

    const candidati = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[idI] || r[archI] || r[digI]) continue;
      const d = r[dataI] instanceof Date ? r[dataI] : new Date(r[dataI]);
      if (!isNaN(d) && d >= cutoff14) {
        candidati.push({ rowIdx: i + 1, id: r[idI], score: r[scoreI] || 0, data: d });
      }
    }
    candidati.sort((a, b) => (b.score - a.score) || (b.data - a.data));
    const selezionate = candidati.slice(0, 20);

    // Segna InclusiNelDigest = true
    selezionate.forEach(n => {
      shN.getRange(n.rowIdx, digI + 1).setValue(true);
    });
    SpreadsheetApp.flush();
    notizieCount = selezionate.length;
  }

  // --- 3. PODCAST: 1 solo, score più alto, non ascoltato, non già in digest ---
  let podCount = 0;
  const shP = SS.getSheetByName(SH.PODCAST || 'Podcast');
  if (shP && shP.getLastRow() > 1) {
    const pr = shP.getDataRange().getValues();
    const ph = pr[0];
    const pidI = ph.indexOf('ID'),
          pascI = ph.indexOf('Ascoltato'),
          pdigI = ph.indexOf('InclusiNelDigest'),
          psrI  = ph.indexOf('StatoRecord'),
          pscI  = ph.indexOf('Score');

    const candidati = [];
    for (let i = 1; i < pr.length; i++) {
      const r = pr[i];
      if (!r[pidI]) continue;
      if (String(r[psrI] || 'attivo').toLowerCase() === 'archiviato') continue;
      if (r[pascI] || r[pdigI]) continue;
      candidati.push({ rowIdx: i + 1, score: r[pscI] || 0 });
    }
    if (candidati.length > 0) {
      candidati.sort((a, b) => b.score - a.score);
      shP.getRange(candidati[0].rowIdx, pdigI + 1).setValue(true);
      SpreadsheetApp.flush();
      podCount = 1;
    }
  }

  // --- 4. EDITORIA: ultime 5 pubblicazioni/podcast dalla ricerca ---
  let editoriaCount = 0;
  let editoriaItems = [];
  try {
    if (typeof getEditoria === 'function') {
      const edData = getEditoria();
      if (edData && edData.items) {
        editoriaItems = edData.items.slice(0, 5);
        editoriaCount = editoriaItems.length;
      }
    }
  } catch(e) { Logger.log('Editoria per digest err: ' + e.message); }

  const totale = bandiSel.length + notizieCount + podCount + editoriaCount;
  Logger.log('[BOZZA DIGEST LUN] Bandi: ' + bandiSel.length +
             ' | Notizie: ' + notizieCount +
             ' | Podcast: ' + podCount +
             ' | Editoria: ' + editoriaCount +
             ' | TOTALE: ' + totale);

  // Telegram: bozza pronta
  const dataFmt = Utilities.formatDate(oggi, 'Europe/Rome', 'EEEE dd/MM/yyyy');
  const msg = '📋 *Bozza Digest* pronta — ' + dataFmt + '\n\n' +
    '📊 *' + bandiSel.length + '* bandi\n' +
    '📰 *' + notizieCount + '* notizie\n' +
    '🎙 *' + podCount + '* podcast\n' +
    '📄 *' + editoriaCount + '* dalla ricerca\n' +
    '─────────────────\n' +
    'Totale: *' + totale + '* contenuti\n\n' +
    '_Rivedi e invia dall\'Osservatorio → Email Digest_\n' +
    '_Sinopia_';
  try { sendTelegram(msg); } catch(e) { Logger.log('TG bozza err: ' + e.message); }

  return { bandi: bandiSel.length, notizie: notizieCount, podcast: podCount, editoria: editoriaCount, editoriaItems: editoriaItems, totale };
}


// ==================================================================
// SOSTITUZIONE lunediMattina() — v4.2
// Sostituisce COMPLETAMENTE la funzione lunediMattina() esistente
// ==================================================================
function lunediMattina() {
  // v4.28.2 — REVISIONE TRIGGER (decisione Silvano 02/08): questo mega-job
  // del lunedì è stato ridotto al SOLO alert Telegram delle scadenze, perché
  // ogni altro passo è duplicato altrove:
  //   - cleanupBandiV5Scaduti  → sasRun MA5 (ogni notte 04:30)
  //   - autoArchiviaNotizieVecchie → sasRun MA4 (ogni notte)
  //   - scanBandiAutomatico (legacy) → bandiRssScanRotazione 2×/gg + fasRunCompleto daily
  //   - scanPodcast → scanPodcastBisettimanale (ogni giorno 07:30)
  //   - scanSources → già 4 run/giorno (07/11/15/19)
  //   - preparaBozzaDigestLunedi → flusso redazionale ven 18:00 → lun 10:00
  // La versione integrale resta nella history git (tag v4.28.1).
  _initLegacyConsts_();
  Logger.log('=== LUNEDI MATTINA (solo alert scadenze, v4.28.2) ===');
  try { sendWeeklyAlert(); } catch (e) { Logger.log('sendWeeklyAlert: ' + e.message); }
  Logger.log('=== LUNEDI COMPLETATO ===');
}

function lunediMattina_integrale_DISMESSO_() {
  _initLegacyConsts_(); // v4.22 — trigger entry point
  Logger.log('=== LUNEDI MATTINA v4.2 - OSSERVATORIO CULTURALE ===');

  // 1. Auto-archiviazione bandi scaduti (v4.20 — usa cleanupBandiV5Scaduti)
  try {
    if (typeof cleanupBandiV5Scaduti === 'function') cleanupBandiV5Scaduti(30);
  } catch(e) { Logger.log('cleanupBandiV5Scaduti: ' + e.message); }

  // 2. Auto-archiviazione notizie > 30gg
  try {
    const archiviate = autoArchiviaNotizieVecchie();
    Logger.log('Notizie archiviate (>30gg): ' + archiviate);
  } catch(e) { Logger.log('autoArchiviaNotizieVecchie: ' + e.message); }

  // 3. Scanner bandi automatico
  let risultatoBandi = { totalNuovi: 0, fonti: [], errori: 0 };
  try {
    risultatoBandi = scanBandiAutomatico();
  } catch(e) { Logger.log('scanBandiAutomatico: ' + e.message); }

  // 4. Scanner podcast
  let nuoviPod = 0;
  try {
    nuoviPod = scanPodcast();
    Logger.log('Podcast: ' + nuoviPod + ' nuovi episodi');
  } catch(e) { Logger.log('scanPodcast err: ' + e.message); }

  // 5. Scanner articoli RSS (chiama scanSources da Code.gs)
  let nuoveNotizie = 0;
  try {
    nuoveNotizie = scanSources();
    Logger.log('Notizie RSS: ' + nuoveNotizie + ' nuove');
  } catch(e) { Logger.log('scanSources err: ' + e.message); }

  // Pausa prima dei report
  Utilities.sleep(3000);

  // 6. Bozza digest automatica
  let bozza = { bandi: 0, notizie: 0, podcast: 0, totale: 0 };
  try {
    bozza = preparaBozzaDigestLunedi();
  } catch(e) { Logger.log('preparaBozzaDigest err: ' + e.message); }

  // 7. Alert settimanale scadenze
  try { sendWeeklyAlert(); } catch(e) { Logger.log('sendWeeklyAlert: ' + e.message); }

  // 8. Riepilogo Telegram scanner
  const msgScan = '✅ *Scanner Lunedì completato*\n\n' +
    (risultatoBandi.totalNuovi > 0 ? '📊 *' + risultatoBandi.totalNuovi + '* nuovi bandi\n' : '') +
    (nuoveNotizie > 0 ? '📰 *' + nuoveNotizie + '* nuove notizie RSS\n' : '') +
    (nuoviPod > 0 ? '🎙 *' + nuoviPod + '* nuovi episodi podcast\n' : '') +
    '\n_Osservatorio Culturale · Sinopia_';
  try { sendTelegram(msgScan); } catch(e) { Logger.log('TG scan recap: ' + e.message); }

  Logger.log('=== LUNEDI COMPLETATO ===');
}
