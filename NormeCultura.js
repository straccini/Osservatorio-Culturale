// ============================================================================
//  NormeCultura.js — TAPPA 3: alimentazione automatica sezione "Norme"
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · 2026-07-08
//  Piano: docs/PIANO_SVILUPPO_OCS_2026-07.md (T3 — Normativa cultura)
//
//  SCELTA ARCHITETTURALE (verificata live 2026-07-08):
//   - GU Serie Generale RSS = solo Corte Costituzionale (sentenze/ordinanze),
//     titoli generici → inadeguato al filtro cultura (come GU S5).
//   - EUR-Lex RSS generico = 0 item (serve una ricerca salvata per-account).
//   → Strada scelta dal piano: NON un connettore GU/EUR-Lex fragile, ma
//     (a) alimentare l'agente AG2 con 2 fonti giuridico-culturali verificate,
//     (b) AUTO-POPOLARE il foglio "Norme" dal flusso news già scansionato,
//         filtrando con keyword normative FORTI (decreti, D.Lgs, circolari MiC,
//         direttive UE, GDPR, Art Bonus, WCAG/PEBA, AI Act, standard ICOM…).
//
//  Il foglio Norme (header: ID|Titolo|Fonte|Link|Ambito|Descrizione|DataAggiunta|
//  Stato) era alimentato a mano: ora si arricchisce da solo, in modo additivo.
//
//  PROTOCOLLO: non distruttivo. normeAutoPopola ha dryRun; dedup per link;
//  cap per run; idempotente. Registrabile nel dispatcher (settimanale).
// ============================================================================

// Keyword NORMATIVE forti: un item entra in Norme solo se il titolo/sommario
// contiene un riferimento normativo esplicito.
var _NORME_RE = /\b(decret[oi]|d\.?\s?lgs|d\.?\s?l\.|d\.?\s?m\.|d\.?p\.?c\.?m|d\.?p\.?r|circolar[ei]|regolament[oi]|direttiva\s+(?:ue|europea)|regolamento\s+(?:ue|europeo)|legge\s+n|l\.\s?\d|art\.?\s?bonus|art\s+bonus|codice\s+dei\s+beni\s+cultural|d\.?lgs\.?\s*42\/2004|gdpr|privacy\s+by\s+design|wcag|peba\b|eaa\b|european\s+accessibility\s+act|ai\s+act|codice\s+appalti|d\.?lgs\.?\s*36\/2023|terzo\s+settore|d\.?lgs\.?\s*117|linee\s+guida\s+(?:mic|ministeri|agid)|standard\s+icom|luq\b|livelli\s+uniformi|normativ)/i;

// Contesto CULTURA obbligatorio (evita norme generiche non pertinenti).
var _NORME_CULTURA_RE = /\b(musei?|museal|patrimoni|beni\s+cultural|bibliotec|archiv|soprintendenz|mic\b|ministero\s+della\s+cultura|accessibilit|restaur|paesagg|arte|artistic|espositiv|collezion|unesco|icom|teatr|spettacol|cinema|audiovisiv|editori|creativ)/i;

// ANTI-RUMORE: newsletter generiche, alert advocacy USA, notizie estere non IT/UE.
// Il foglio Norme è curato: meglio pochi riferimenti solidi che tanti deboli.
var _NORME_ESCLUDI_RE = /\b(notiziario|newsletter|advocacy\s+alert|take\s+action|congress|appropriations|\bomb\b|federal\s+grant|uniform\s+guidance|invite\s+congress|capitol\s+hill|\bh\.r\.|\bs\.\s?\d+\s+bill)\b/i;

/** Colonne Items (flessibile). */
function _ncCol_(head, names) {
  for (var i = 0; i < names.length; i++) {
    var ix = head.indexOf(names[i]);
    if (ix >= 0) return ix;
  }
  return -1;
}

/** true se il testo è una notizia a rilevanza normativa cultura. */
function _ncIsNorma_(titolo, sommario) {
  var testo = String(titolo || '') + ' ' + String(sommario || '');
  if (!testo.trim()) return false;
  if (_NORME_ESCLUDI_RE.test(testo)) return false;
  return _NORME_RE.test(testo) && _NORME_CULTURA_RE.test(testo);
}

/**
 * Auto-popola il foglio Norme dal foglio Items (news già scansionate).
 * @param {Object} opts { dryRun:bool (default true), cap:number (default 15),
 *                        giorni:number (finestra, default 60) }
 */
function normeAutoPopola(opts) {
  opts = opts || {};
  var dryRun = (opts.dryRun === undefined) ? true : !!opts.dryRun;
  var cap = (opts.cap === undefined) ? 15 : Number(opts.cap);
  var giorni = (opts.giorni === undefined) ? 60 : Number(opts.giorni);
  var rep = { ok: true, dryRun: dryRun, esaminati: 0, candidati: 0, aggiunti: 0, duplicati: 0, dettagli: [] };
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shItems = ss.getSheetByName((typeof SH !== 'undefined' && SH && SH.ITEMS) ? SH.ITEMS : 'Items');
    if (!shItems || shItems.getLastRow() < 2) { rep.ok = false; rep.error = 'Items vuoto'; return rep; }

    // Norme esistenti — dedup per link normalizzato
    var shN = ss.getSheetByName(SH_NORME);
    if (!shN) { if (typeof setupNormeSheet === 'function') setupNormeSheet(); shN = ss.getSheetByName(SH_NORME); }
    var esistenti = {};
    if (shN && shN.getLastRow() > 1) {
      var nv = shN.getRange(2, 1, shN.getLastRow() - 1, NORME_HEADER.length).getValues();
      nv.forEach(function(r) { var l = String(r[3] || '').trim().toLowerCase().replace(/\/+$/, ''); if (l) esistenti[l] = true; });
    }

    var vals = shItems.getDataRange().getValues();
    var head = vals[0].map(function(h){ return String(h||'').trim(); });
    var iTit = _ncCol_(head, ['Titolo','Title']);
    var iLink = _ncCol_(head, ['FonteURL','Link','URL']);
    var iFonte = _ncCol_(head, ['Fonte','Source']);
    var iSomm = _ncCol_(head, ['SommarioAI','Sommario','Estratto','Descrizione']);
    var iData = _ncCol_(head, ['DataPubblicazione','Data','DataAcquisizione']);
    var iAmb = _ncCol_(head, ['Ambito']);
    var iArch = _ncCol_(head, ['Archiviato','archiviato']);
    if (iTit < 0) iTit = 1;

    var soglia = new Date(Date.now() - giorni * 86400000);
    var daAggiungere = [];

    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[iTit]) continue;
      if (iArch >= 0 && (row[iArch] === true || String(row[iArch]).toUpperCase() === 'TRUE')) continue;
      rep.esaminati++;

      var titolo = String(row[iTit] || '');
      var somm = iSomm >= 0 ? String(row[iSomm] || '') : '';
      if (!_ncIsNorma_(titolo, somm)) continue;

      // finestra temporale (se disponibile)
      if (iData >= 0 && row[iData]) {
        var d = (row[iData] instanceof Date) ? row[iData] : new Date(row[iData]);
        if (!isNaN(d.getTime()) && d < soglia) continue;
      }
      rep.candidati++;

      var link = iLink >= 0 ? String(row[iLink] || '').trim() : '';
      var linkKey = link.toLowerCase().replace(/\/+$/, '');
      if (!link || esistenti[linkKey]) { rep.duplicati++; continue; }
      esistenti[linkKey] = true;

      var amb = iAmb >= 0 ? String(row[iAmb] || '5') : '5';
      var fonte = iFonte >= 0 ? String(row[iFonte] || '') : '';
      if (rep.dettagli.length < 20) rep.dettagli.push({ titolo: titolo.substring(0, 90), fonte: fonte });
      daAggiungere.push([
        'NRM' + Date.now() + Math.floor(r), titolo.substring(0, 300), fonte, link,
        amb, somm.substring(0, 400), new Date(), 'attivo'
      ]);
      if (daAggiungere.length >= cap) break;
    }

    if (!dryRun && daAggiungere.length) {
      shN.getRange(shN.getLastRow() + 1, 1, daAggiungere.length, NORME_HEADER.length).setValues(daAggiungere);
      SpreadsheetApp.flush();
    }
    rep.aggiunti = dryRun ? 0 : daAggiungere.length;
    rep.candidatiTotali = daAggiungere.length;
    Logger.log('[Norme] esaminati=' + rep.esaminati + ' · candidati=' + rep.candidati +
      ' · nuovi=' + daAggiungere.length + ' · dup=' + rep.duplicati + (dryRun ? ' [DRY-RUN, non scritti]' : ' [SCRITTI]'));
    Logger.log(JSON.stringify(rep, null, 2));
  } catch (e) { rep.ok = false; rep.error = e.message; Logger.log('[Norme] ERR: ' + e.message); }
  return rep;
}

/** Wrapper attivazione piena per il dispatcher (scrive davvero). */
function normeAutoPopolaRun() {
  return normeAutoPopola({ dryRun: false, cap: 15, giorni: 30 });
}

/**
 * T3 — Batch fonti NORMATIVA verificate live (curl, 2026-07-08).
 *  - Artribune Diritto (category/professioni/diritto/feed) — beni culturali,
 *    diritto d'autore, AI e diritto, 10 item.
 *  - Fondazione Scuola del Patrimonio — formazione/normativa patrimonio, 10 item.
 * Ambito 5 (Digital, AI e governance). Ripassano dal gate fontiAggiungiFeedVerificato.
 */
function fontiAggiungiBatchNormativa() {
  var candidati = [
    { url: 'https://www.artribune.com/category/professioni/diritto/feed/', nome: 'Artribune — Diritto', ambito: 5 },
    { url: 'https://www.fondazionescuolapatrimonio.it/feed/',              nome: 'Fondazione Scuola Patrimonio', ambito: 5 }
  ];
  var esiti = candidati.map(function(c) {
    var r = fontiAggiungiFeedVerificato(c.url, c.nome, c.ambito, 'Normativa-T3 2026-07');
    return { nome: c.nome, esito: r && r.ok ? 'AGGIUNTA' : ('saltata: ' + ((r && r.error) || '?')) };
  });
  var aggiunte = esiti.filter(function(e) { return e.esito === 'AGGIUNTA'; }).length;
  Logger.log('fontiAggiungiBatchNormativa: ' + aggiunte + '/' + candidati.length + '\n' + JSON.stringify(esiti, null, 2));
  return { ok: true, aggiunte: aggiunte, totale: candidati.length, esiti: esiti };
}

// ============================================================================
//  SELF-TEST — nessuna scrittura: verifica il classificatore normativa+cultura
// ============================================================================
function normeCulturaSelfTest() {
  var casi = [
    { t: 'Nuovo decreto MiC sui Livelli Uniformi di Qualità dei musei', s: '', att: true },
    { t: 'Circolare del Ministero della Cultura sull\'Art Bonus 2026', s: '', att: true },
    { t: 'Beni culturali e diritto d\'autore: la nuova direttiva UE', s: 'regolamento europeo', att: true },
    { t: 'WCAG 2.2 e accessibilità dei siti museali', s: 'obblighi PEBA', att: true },
    { t: 'AI Act: impatti sulla gestione museale', s: 'regolamento europeo intelligenza artificiale musei', att: true },
    // NON normativa cultura → esclusi
    { t: 'Grande mostra di Caravaggio a Roma', s: 'esposizione dipinti', att: false },
    { t: 'Nuovo decreto sulla sanità pubblica', s: 'ospedali e ASL', att: false },
    { t: 'Il museo inaugura un nuovo allestimento', s: 'sale interattive', att: false },
    { t: 'Regolamento UE sui dazi doganali industriali', s: 'commercio', att: false },
    // Rumore reale rilevato nel dry-run 2026-07-08 → deve essere ESCLUSO
    { t: 'NOTIZIARIO N. 6/2026', s: 'Federculture aggiornamenti normativa cultura', att: false },
    { t: 'July Advocacy Alert: Take Action on the Proposed Rule on Federal Grants, Invite Congress', s: 'museum advocacy', att: false },
    { t: 'A Future of "Uniform Guidance"', s: 'federal grant museums regulation', att: false }
  ];
  var pass = 0, fail = 0;
  casi.forEach(function(c) {
    var got = _ncIsNorma_(c.t, c.s);
    var ok = got === c.att;
    if (ok) pass++; else fail++;
    Logger.log((ok ? 'PASS' : 'FAIL') + ' [' + (got ? 'NORMA' : 'no') + ' vs ' + (c.att ? 'NORMA' : 'no') + '] ' + c.t.substring(0, 60));
  });
  Logger.log('=== normeCulturaSelfTest: ' + pass + '/' + (pass + fail) + ' PASS ===');
  return { ok: fail === 0, pass: pass, fail: fail };
}
