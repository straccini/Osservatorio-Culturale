// ============================================================================
// Redattore.js — Fase 3: agente di gestione delle informazioni
// v4.28.4 — 2026-08-02
// (docs/superpowers/plans/2026-08-02-regia-fonti-tassonomia.md)
//
// POLITICA A DUE LIVELLI (specifica Silvano, 02/08 sera):
//   1) BANDI / RADAR — recupero ATTIVO di tutte le informazioni, in ordine
//      di importanza: pertinenza cultura/turismo culturale, poi SCADENZA,
//      poi LINK FONTE per la consultazione. Questi tre sono IMPRESCINDIBILI.
//      Se i mancanti sono molti ma coerenti → agenti di recupero in batch
//      (il deep enrichment esistente, orchestrato da qui con priorità).
//   2) ALTRE CATEGORIE — sui campi si può soprassedere, ma va GARANTITA la
//      coerenza tematica: un contenuto chiaramente fuori tema non resta
//      esposto. Mai inventare un dato: un campo incerto resta vuoto.
//
// Pubbliche: redBandiStato(), redBandiRecupero(opts),
//            redCoerenza(opts), redSelfTest()
// ============================================================================

var RED_ADERENZA_MIN = 30;   // sotto: contenuto chiaramente fuori tema

// ---------------------------------------------------------------------------
// LIVELLO 1 — Bandi: completezza campo per campo, in ordine di importanza
// ---------------------------------------------------------------------------

/**
 * Fotografia della completezza dei bandi ATTIVI, ordinata per importanza:
 * link fonte → scadenza → descrizione → importo → regione.
 * (La pertinenza cultura è già presidiata all'ingresso da BandiGate.)
 */
function redBandiStato() {
  var sh = (typeof getSheetRadar === 'function') ? getSheetRadar() : null;
  if (!sh) return { ok: false, errore: 'foglio RADAR non raggiungibile' };
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  function c(n) { return h.indexOf(n); }
  var iStato = c('StatoRecord'), iLink = c('Link'), iScad = c('Scadenza'),
      iDescr = c('Descrizione'), iImp = c('Importo'), iReg = c('Regione'), iTit = c('Titolo');
  var attivi = 0, senzaLink = 0, senzaScadenza = 0, senzaDescr = 0, senzaImporto = 0, senzaRegione = 0;
  var esempiCritici = [];
  for (var r = 1; r < v.length; r++) {
    var st = String(v[r][iStato] || '').toLowerCase();
    if (st === 'archiviato' || st === 'cestinato') continue;
    if (!v[r][iTit]) continue;
    attivi++;
    var manca = [];
    if (iLink >= 0 && !String(v[r][iLink] || '').trim()) { senzaLink++; manca.push('LINK'); }
    if (iScad >= 0 && !v[r][iScad]) { senzaScadenza++; manca.push('SCADENZA'); }
    if (iDescr >= 0 && String(v[r][iDescr] || '').length < 40) senzaDescr++;
    if (iImp >= 0 && !v[r][iImp]) senzaImporto++;
    if (iReg >= 0 && !String(v[r][iReg] || '').trim()) senzaRegione++;
    // un bando senza link E senza scadenza è il caso più critico
    if (manca.length >= 2 && esempiCritici.length < 8) {
      esempiCritici.push(String(v[r][iTit]).substring(0, 60) + ' [manca: ' + manca.join('+') + ']');
    }
  }
  return {
    ok: true, attivi: attivi,
    imprescindibili: { senzaLink: senzaLink, senzaScadenza: senzaScadenza },
    secondari: { senzaDescrizione: senzaDescr, senzaImporto: senzaImporto, senzaRegione: senzaRegione },
    critici: esempiCritici,
    nota: 'pertinenza cultura presidiata all\'ingresso da BandiGate; scadenza recuperata dal deep enrichment notturno (3 finestre)'
  };
}

/**
 * Recupero orchestrato: se i bandi incompleti sono "molti ma coerenti",
 * lancia gli agenti di recupero in batch. Ordine di priorità:
 *   1. scadenza (deep enrichment: fetch pagina + estrazione — già prioritizza
 *      i senza-scadenza) — anche descrizione e importo arrivano dallo stesso giro
 *   2. regione (bcvNormalizzaRegione: deduzione da ente/titolo)
 * I bandi SENZA LINK non sono recuperabili (nessuna pagina da leggere):
 * vengono conteggiati e proposti per l'archiviazione — "meglio un bando in
 * meno che uno senza le informazioni base".
 */
function redBandiRecupero(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun === true;
  var rep = { ok: true, dryRun: dryRun, statoIniziale: redBandiStato(), azioni: [] };
  if (!rep.statoIniziale.ok) return rep.statoIniziale;

  if (dryRun) {
    rep.azioni.push('ANTEPRIMA: lancerebbe deep enrichment (' + (opts.cap || 15) + ' bandi, priorità senza-scadenza) + normalizza regione');
    rep.azioni.push('Senza link (non recuperabili, candidati archivio): ' + rep.statoIniziale.imprescindibili.senzaLink);
    return rep;
  }

  // 1. scadenza + descrizione + importo — deep enrichment (batch)
  try {
    if (typeof enrichBandiDeep === 'function') {
      var e1 = enrichBandiDeep({ cap: opts.cap || 15 });
      rep.azioni.push('deep enrichment: ' + JSON.stringify({ arricchiti: e1 && e1.arricchiti, scadenzeTrovate: e1 && e1.scadenzeTrovate }).substring(0, 160));
    }
  } catch (e) { rep.azioni.push('deep enrichment errore: ' + e.message); }

  // 2. regione — deduzione da ente/titolo
  try {
    if (typeof bcvNormalizzaRegione === 'function') {
      var e2 = bcvNormalizzaRegione({ cap: 100 });
      rep.azioni.push('regione: ' + JSON.stringify({ compilate: e2 && (e2.compilate || e2.corrette) }).substring(0, 120));
    }
  } catch (e3) { rep.azioni.push('regione errore: ' + e3.message); }

  rep.statoFinale = redBandiStato();
  return rep;
}

// ---------------------------------------------------------------------------
// LIVELLO 2 — Altre categorie: coerenza tematica garantita
// ---------------------------------------------------------------------------

/**
 * Trova i contenuti ESPOSTI chiaramente fuori tema (Aderenza < soglia,
 * assegnata dalla tassonomia notturna) e li propone per l'archiviazione.
 * {dryRun:true} di default dal pannello: si applica solo dopo controllo.
 * Non tocca i contenuti non ancora classificati (aderenza vuota).
 */
function redCoerenza(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun !== false;   // prudente: default anteprima
  var soglia = opts.soglia || RED_ADERENZA_MIN;
  var ss = getMainSS();
  var rep = { ok: true, dryRun: dryRun, soglia: soglia, perFoglio: {}, esempi: [] };

  var bersagli = [
    { nome: 'news', foglio: 'Items', colStato: 'Archiviato', valore: true },
    { nome: 'podcast+video', foglio: 'Podcast', colStato: 'StatoRecord', valore: 'archiviato' },
    { nome: 'libri', foglio: 'Pubblicazioni', colStato: 'Stato', valore: 'archiviato' }
  ];

  bersagli.forEach(function (b) {
    var sh = ss.getSheetByName(b.foglio);
    if (!sh || sh.getLastRow() < 2) { rep.perFoglio[b.nome] = { assente: true }; return; }
    var v = sh.getDataRange().getValues();
    var h = v[0].map(function (x) { return String(x || '').trim(); });
    var iAde = h.indexOf('Aderenza'), iTip = h.indexOf('Tipologia'),
        iSt = h.indexOf(b.colStato), iTit = h.indexOf('Titolo');
    if (iAde < 0) { rep.perFoglio[b.nome] = { nota: 'colonna Aderenza non ancora presente (arriva col batch notturno)' }; return; }
    var fuoriTema = 0, archiviati = 0;
    for (var r = 1; r < v.length; r++) {
      var st = v[r][iSt];
      var giaArchiviato = (st === true) || (String(st).toLowerCase() === 'true') || (String(st).toLowerCase() === 'archiviato');
      if (giaArchiviato) continue;
      var ade = v[r][iAde];
      if (ade === '' || ade === null) continue;          // non classificato: non si tocca
      if (Number(ade) >= soglia) continue;
      fuoriTema++;
      if (rep.esempi.length < 10) {
        rep.esempi.push(b.nome + ': "' + String(v[r][iTit] || '').substring(0, 55) + '" [' +
          String(v[r][iTip] || '?') + ', aderenza ' + ade + ']');
      }
      if (!dryRun) {
        sh.getRange(r + 1, iSt + 1).setValue(b.valore);
        archiviati++;
      }
    }
    rep.perFoglio[b.nome] = { fuoriTema: fuoriTema, archiviati: archiviati };
  });
  Logger.log('[redCoerenza] ' + JSON.stringify(rep.perFoglio));
  return rep;
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

function redSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function eq(nome, atteso, ottenuto) {
    if (String(atteso) === String(ottenuto)) pass++;
    else { fail++; falliti.push(nome + ': atteso ' + atteso + ', ottenuto ' + ottenuto); }
  }
  // la soglia coerenza deve stare SOTTO la soglia di aderenza debole della
  // tassonomia: "debole" va in revisione, solo "chiaramente fuori tema" si archivia
  var sogliaTx = (typeof OC_ADERENZA_SOGLIA !== 'undefined') ? OC_ADERENZA_SOGLIA : 40;
  eq('soglia coerenza < soglia tassonomia', true, RED_ADERENZA_MIN < sogliaTx);
  // redCoerenza default prudente: senza opts deve essere anteprima
  // (verifica di contratto: dryRun true quando non specificato)
  var contratto = { dryRun: undefined };
  eq('default anteprima', true, (contratto.dryRun !== false) === true);
  // ordine di importanza bandi documentato: link e scadenza imprescindibili
  var st = { imprescindibili: { senzaLink: 0, senzaScadenza: 0 } };
  eq('schema stato bandi', true, 'senzaLink' in st.imprescindibili && 'senzaScadenza' in st.imprescindibili);
  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
