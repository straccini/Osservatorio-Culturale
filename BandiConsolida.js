/**
 * ============================================================================
 *  BandiConsolida.js — Tutte le fonti bandi in UN unico foglio: FontiBandi_v5
 * ============================================================================
 *  Data: 2026-06-03
 *  Scopo: trasferire TUTTE le sorgenti di fonti bandi in FontiBandi_v5 (schema
 *  FU17 a 18 colonne, COL_F_HEADERS in Bandi_v5.js), senza perdere nulla.
 *
 *  Sorgenti consolidate:
 *    1. Array hardcoded TUTTE_LE_FONTI_BANDI (41) — via seedFontiV5() (Bandi_v5.js)
 *    2. Vecchio foglio FontiBandi (ID,Nome,URL,Categoria,Attiva,Note)
 *    3. Foglio FontiAgenti (16 col: ID,Nome,URL,RSS_URL,Agente,Tipo,Categoria,...)
 *
 *  Proprieta':
 *    - NON distruttivo: scrive SOLO su FontiBandi_v5; i fogli sorgente restano intatti.
 *    - Idempotente: dedup per URL normalizzato (rilanciabile senza creare doppioni).
 *    - Con report dettagliato.
 *
 *  La deprecazione dei fogli sorgente e il redirect del codice avvengono DOPO,
 *  in passi separati e verificati (non qui).
 * ============================================================================
 */

var BANDI_V5_SHEET = 'FontiBandi_v5';

/**
 * PONTE: promuove i bandi trovati dagli AGENTI (AgentScanResults, es. BandiUp/TED/
 * EU F&T) nel foglio bandi che l'APP legge, cosi' compaiono nella pagina "Radar
 * Bandi" e non solo nelle email digest.
 *
 * Riusa salvaNewBandi() (scrittura formato Bandi_v5 a 26 col + dedup per titolo +
 * triage ROC), scrivendo su getSheetRadar() (lo stesso foglio dello scanner classico).
 * Default: solo AG1 (l'agente bandi). NON distruttivo, idempotente (dedup titolo).
 *
 * IMPORTANTE: lanciare contaBandiContenitori() PRIMA, per verificare che getSheetRadar()
 * e il frontend leggano lo STESSO foglio (flag USE_BANDI_V5). Se disallineati, prima
 * allineare il flag, altrimenti i bandi finiscono in un foglio non letto dall'app.
 *
 * @param {Object} opts { agenti?: number[] (default [1]) }
 */
function promuoviBandiAgenti(opts) {
  opts = opts || {};
  var agenti = opts.agenti || [1];
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shA = ss.getSheetByName('AgentScanResults');
  if (!shA || shA.getLastRow() < 2) { Logger.log('AgentScanResults vuoto'); return { ok: false }; }
  if (typeof getSheetRadar !== 'function' || typeof salvaNewBandi !== 'function' || typeof normalizzaBandi !== 'function') {
    Logger.log('Funzioni richieste assenti (getSheetRadar/salvaNewBandi/normalizzaBandi)'); return { ok: false };
  }
  var sheet = getSheetRadar();
  if (!sheet) { Logger.log('Foglio bandi non trovato'); return { ok: false }; }
  Logger.log('Promuovo verso il foglio: ' + sheet.getName());

  // Titoli gia' presenti nel foglio bandi (per dedup tramite salvaNewBandi).
  var titoliEsistenti = [];
  if (sheet.getLastRow() > 1) {
    var bh = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var iTitB = bh.indexOf('Titolo'); if (iTitB < 0) iTitB = 3;
    sheet.getRange(2, iTitB + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(r) {
      if (r[0]) titoliEsistenti.push(normalizzaBandi(String(r[0])));
    });
  }

  var data = shA.getDataRange().getValues();
  var h = data[0];
  var iAg = h.indexOf('AgenteID'), iTit = h.indexOf('Titolo'), iUrl = h.indexOf('URL'),
      iSom = h.indexOf('SommarioAI'), iFonte = h.indexOf('FonteNome'), iArch = h.indexOf('Archiviato');
  var promossi = 0, esaminati = 0;
  for (var r = 1; r < data.length; r++) {
    if (agenti.indexOf(Number(data[r][iAg])) < 0) continue;
    if (iArch >= 0 && (data[r][iArch] === true || String(data[r][iArch]).toLowerCase() === 'true')) continue;
    esaminati++;
    var bandiObj = {
      titolo: String(data[r][iTit] || ''),
      url_bando: String(data[r][iUrl] || ''),
      note: iSom >= 0 ? String(data[r][iSom] || '') : '',
      sommario: iSom >= 0 ? String(data[r][iSom] || '') : '',
      settore: 'Valorizzazione'
    };
    var fonte = { nome: (iFonte >= 0 ? String(data[r][iFonte] || '') : '') || ('Agente AG' + data[r][iAg]),
                  ente_default: '', livello: '', url_ente: '' };
    promossi += salvaNewBandi(sheet, [bandiObj], fonte, titoliEsistenti);
  }
  Logger.log('=== PROMUOVI BANDI AGENTI: ' + promossi + ' promossi su ' + esaminati + ' esaminati (AG' + agenti.join(',') + ') verso ' + sheet.getName() + ' ===');
  return { ok: true, promossi: promossi, esaminati: esaminati, foglio: sheet.getName() };
}

/**
 * DIAGNOSTICA (sola lettura): conta le righe nei contenitori di BANDI (i record,
 * non le fonti) per capire dove vivono davvero i dati prima di consolidare.
 * Lanciare dall'editor (Esegui -> contaBandiContenitori) e leggere il Log.
 *  - 'Bandi_v5'            = contenitore nuovo (lo scanner ci scrive se il foglio esiste)
 *  - 'RADAR BANDI'         = contenitore vecchio (frontend lo legge se flag OFF)
 *  - '_RADAR_BANDI_LEGACY_'= archivio storico
 *  - 'AgentScanResults'    = bandi trovati dagli agenti (BandiUp/TED), oggi isolati
 * Riporta anche lo stato del flag USE_BANDI_V5 e quale foglio getSheetRadar() usa.
 */
function contaBandiContenitori() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var nomi = ['Bandi_v5', 'RADAR BANDI', '_RADAR_BANDI_LEGACY_', 'AgentScanResults'];
  var out = {};
  Logger.log('=== CONTEGGIO CONTENITORI BANDI ===');
  nomi.forEach(function(n) {
    var sh = ss.getSheetByName(n);
    var righe = (sh && sh.getLastRow() > 1) ? (sh.getLastRow() - 1) : 0;
    out[n] = sh ? righe : '(foglio assente)';
    Logger.log('  ' + n + ': ' + out[n] + (sh ? ' righe' : ''));
  });

  // Dettaglio AgentScanResults per agente (quanti bandi di AG1 = BandiUp/TED).
  var shA = ss.getSheetByName('AgentScanResults');
  if (shA && shA.getLastRow() > 1) {
    var data = shA.getDataRange().getValues();
    var iAg = data[0].indexOf('AgenteID');
    var perAgente = {};
    if (iAg >= 0) {
      for (var r = 1; r < data.length; r++) {
        var a = String(data[r][iAg] || '?');
        perAgente[a] = (perAgente[a] || 0) + 1;
      }
    }
    Logger.log('  -> AgentScanResults per agente: ' + JSON.stringify(perAgente));
    out._agentScanPerAgente = perAgente;
  }

  // Stato flag e foglio realmente usato da getSheetRadar().
  var flag = false;
  try { flag = (typeof isBandiV5Active === 'function') ? isBandiV5Active() : null; } catch(e) {}
  var foglioRadar = '(n/d)';
  try { var sr = (typeof getSheetRadar === 'function') ? getSheetRadar() : null; if (sr) foglioRadar = sr.getName(); } catch(e2) {}
  out._flag_USE_BANDI_V5 = flag;
  out._getSheetRadar_usa = foglioRadar;
  Logger.log('  FLAG USE_BANDI_V5: ' + flag + '  |  getSheetRadar() usa il foglio: ' + foglioRadar);
  Logger.log('  (Se lo scanner scrive su "' + foglioRadar + '" ma il flag e\' OFF, il frontend potrebbe leggere un foglio diverso => sfasamento.)');
  return out;
}

// Legge un foglio e restituisce le righe come oggetti {Header: valore}.
function _bcSheetObjs_(name) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function(x){ return String(x || '').trim(); });
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var o = {};
    for (var c = 0; c < h.length; c++) o[h[c]] = v[r][c];
    out.push(o);
  }
  return out;
}

// Per i bandi (e soprattutto le API) la QUERY STRING e' significativa
// (es. ?categoria=cultura vs ?q=musei): la teniamo. Togliamo solo protocollo/www/anchor/slash.
function _bcUrlKey_(u) {
  var s = String(u || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '');
  return s.replace(/\/+$/, '');
}

function _bcTipoFromUrl_(url) {
  var u = String(url || '').toLowerCase();
  if (u.indexOf('/feed') >= 0 || u.indexOf('/rss') >= 0 || u.indexOf('feed.xml') >= 0) return 'RSS';
  if (u.indexOf('sitemap') >= 0) return 'Sitemap';
  return 'HTML';
}

// Appende righe sorgente (oggetti) in FontiBandi_v5, dedup per URL. Ritorna {added, dup}.
function _bcAppendToV5_(righeObj, esistenti, shV5) {
  var added = 0, dup = 0;
  righeObj.forEach(function(f) {
    var url = f.URL || f.RSS_URL || '';
    var key = _bcUrlKey_(url);
    if (!key) return;
    if (esistenti[key]) { dup++; return; }
    esistenti[key] = true;
    var attiva = !(f.Attiva === false || String(f.Attiva).toUpperCase() === 'FALSE');
    var o = {
      ID: f.ID || ('fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      Nome: String(f.Nome || ''), URL: String(url), Tipo: f.Tipo || _bcTipoFromUrl_(url),
      Tag: f.Tag || 'settoriale', Categoria: f.Categoria || 'Aggregatore',
      Priorita: Number(f.Priorita) || 2, Attiva: attiva,
      DataAggiunta: new Date(), UltimaScan: '', UltimoEsito: '',
      NRecordTotali: 0, NRecordUltimo: 0, FailConsecutivi: 0, UltimoErrore: '',
      EnteDefault: String(f.EnteDefault || ''), Livello: String(f.Livello || ''),
      extras_json: JSON.stringify({ note: String(f.Note || ''), agente: String(f.Agente || ''), origine: String(f._origine || '') })
    };
    shV5.appendRow(COL_F_HEADERS.map(function(c){ return o[c] !== undefined ? o[c] : ''; }));
    added++;
  });
  return { added: added, dup: dup };
}

/**
 * Consolida TUTTE le fonti bandi in FontiBandi_v5. Non distruttivo, idempotente.
 * Eseguire dall'editor GAS.
 */
function consolidaBandiFonti() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shV5 = ss.getSheetByName(BANDI_V5_SHEET);
  if (!shV5) return { ok: false, error: 'FontiBandi_v5 non esiste. Lancia prima setupBandiV5Schema().' };
  if (typeof COL_F_HEADERS === 'undefined') return { ok: false, error: 'COL_F_HEADERS non definito (Bandi_v5.js mancante?).' };

  // 1) hardcoded 41 via seedFontiV5 (idempotente)
  var seedRep;
  try { seedRep = (typeof seedFontiV5 === 'function') ? seedFontiV5() : { note: 'seedFontiV5 assente' }; }
  catch(e) { seedRep = { error: e.message }; }

  // indice URL gia presenti in FontiBandi_v5 (dopo il seed)
  var esistenti = {};
  var cur = shV5.getDataRange().getValues();
  var iUrl = cur[0].map(function(x){ return String(x || '').trim(); }).indexOf('URL');
  for (var r = 1; r < cur.length; r++) { var k = _bcUrlKey_(cur[r][iUrl]); if (k) esistenti[k] = true; }

  // 2) vecchio foglio FontiBandi
  var oldFB = _bcSheetObjs_('FontiBandi').map(function(o){ o._origine = 'FontiBandi'; return o; });
  var repFB = _bcAppendToV5_(oldFB, esistenti, shV5);

  // 3) FontiAgenti
  var ag = _bcSheetObjs_('FontiAgenti').map(function(o){ o._origine = 'FontiAgenti'; return o; });
  var repAG = _bcAppendToV5_(ag, esistenti, shV5);

  // 4) dedup finale (pulisce eventuali doppioni pre-esistenti)
  var dedupRep = dedupFontiBandiV5();

  var rep = {
    ok: true,
    seed_hardcoded: seedRep,
    da_FontiBandi: repFB,
    da_FontiAgenti: repAG,
    dedup: dedupRep,
    totale_FontiBandi_v5: shV5.getLastRow() - 1
  };
  Logger.log('consolidaBandiFonti: ' + JSON.stringify(rep, null, 2));
  return rep;
}

/**
 * Rimuove i doppioni (stesso URL normalizzato) in FontiBandi_v5, tenendo la prima
 * occorrenza. Reversibile solo da backup. Eseguire dall'editor.
 */
function dedupFontiBandiV5() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'FontiBandi_v5 vuoto' };
  var v = sh.getDataRange().getValues();
  var iUrl = v[0].map(function(x){ return String(x || '').trim(); }).indexOf('URL');
  if (iUrl < 0) return { ok: false, error: 'colonna URL non trovata' };
  var seen = {}, toDelete = [];
  for (var r = 1; r < v.length; r++) {
    var k = _bcUrlKey_(v[r][iUrl]);
    if (!k) continue;
    if (seen[k]) toDelete.push(r + 1); else seen[k] = true;
  }
  toDelete.sort(function(a, b){ return b - a; }).forEach(function(rowNum){ sh.deleteRow(rowNum); });
  var rep = { ok: true, rimossi: toDelete.length, rimanenti: sh.getLastRow() - 1 };
  Logger.log('dedupFontiBandiV5: ' + JSON.stringify(rep));
  return rep;
}

/**
 * INVENTARIO (sola lettura): fotografia completa di FontiBandi_v5 per "fare ordine".
 * Lanciare dall'editor (Esegui -> inventarioFontiBandi) e leggere il Log.
 * Mostra: totale, attive/inattive, doppioni per URL, mai scansionate, produttive,
 * distribuzione per Agente e per UltimoEsito (e per VerificaHTTP se presente).
 */
function inventarioFontiBandi() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) { Logger.log('FontiBandi_v5 vuoto'); return { ok: false }; }
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function(x) { return String(x || '').trim(); });
  var iUrl = h.indexOf('URL'), iAtt = h.indexOf('Attiva'), iAg = h.indexOf('Agente'),
      iScan = h.indexOf('UltimaScan'), iEsito = h.indexOf('UltimoEsito'),
      iTot = h.indexOf('NRecordTotali'), iVer = h.indexOf('VerificaHTTP');
  var tot = v.length - 1, attive = 0, inattive = 0, mai = 0, produttive = 0;
  var perAgente = {}, perEsito = {}, perVerifica = {}, urlSeen = {}, dupRighe = 0;
  for (var r = 1; r < v.length; r++) {
    var row = v[r];
    var attiva = !(row[iAtt] === false || String(row[iAtt]).toLowerCase() === 'false');
    if (attiva) attive++; else inattive++;
    var ag = (String(row[iAg] == null ? '' : row[iAg]).trim()) || '(nessuno)';
    perAgente[ag] = (perAgente[ag] || 0) + 1;
    var es = (String(row[iEsito] || '').trim()) || '(mai)';
    perEsito[es] = (perEsito[es] || 0) + 1;
    if (!row[iScan]) mai++;
    if (Number(row[iTot]) > 0) produttive++;
    if (iVer >= 0) { var vv = (String(row[iVer] || '').trim()) || '(non verif.)'; perVerifica[vv] = (perVerifica[vv] || 0) + 1; }
    var k = _bcUrlKey_(row[iUrl]);
    if (k) { if (urlSeen[k]) dupRighe++; else urlSeen[k] = true; }
  }
  Logger.log('=== INVENTARIO FontiBandi_v5 ===');
  Logger.log('Totale righe: ' + tot + '  |  attive: ' + attive + '  |  inattive: ' + inattive);
  Logger.log('Doppioni per URL (righe ridondanti): ' + dupRighe + '  -> rimuovili con dedupFontiBandiV5');
  Logger.log('Mai scansionate (UltimaScan vuota): ' + mai);
  Logger.log('Produttive (NRecordTotali>0): ' + produttive);
  Logger.log('Per Agente: ' + JSON.stringify(perAgente));
  Logger.log('Per UltimoEsito: ' + JSON.stringify(perEsito));
  Logger.log(iVer >= 0 ? ('Per VerificaHTTP: ' + JSON.stringify(perVerifica))
                       : 'VerificaHTTP: colonna assente (lancia verificaFontiBandi per crearla)');
  return { ok: true, tot: tot, attive: attive, inattive: inattive, dupRighe: dupRighe,
           mai: mai, produttive: produttive, perAgente: perAgente, perEsito: perEsito, perVerifica: perVerifica };
}

/**
 * VERIFICA: testa ogni fonte di FontiBandi_v5 facendo una richiesta reale e segna
 * l'esito nella colonna VerificaHTTP (OK / EMPTY / ERR / NO_URL) + VerificaData.
 * Usa _agentFetchUrl_ (gestisce anche TED POST). Anti-timeout: budget 4.5min +
 * cursore; se si ferma, RILANCIA la funzione e riprende da dove era.
 * Di default verifica solo le fonti ATTIVE (opts.soloAttive=false per tutte).
 * NON tocca UltimoEsito (dati degli agenti): scrive in colonne dedicate.
 */
function verificaFontiBandi(opts) {
  opts = opts || {};
  var soloAttive = opts.soloAttive !== false;
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) { Logger.log('FontiBandi_v5 vuoto'); return { ok: false }; }
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(x) { return String(x || '').trim(); });
  var iVer = h.indexOf('VerificaHTTP');
  if (iVer < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue('VerificaHTTP'); h.push('VerificaHTTP'); iVer = h.length - 1; }
  var iVerD = h.indexOf('VerificaData');
  if (iVerD < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue('VerificaData'); h.push('VerificaData'); iVerD = h.length - 1; }
  var iUrl = h.indexOf('URL'), iAtt = h.indexOf('Attiva');
  var data = sh.getDataRange().getValues();
  var t0 = Date.now(), MAX_MS = 270000, cursorKey = 'VERIFICA_FONTI_CURSOR';
  var startIdx = 1;
  try { startIdx = parseInt(PropertiesService.getScriptProperties().getProperty(cursorKey) || '1', 10) || 1; } catch(e) {}
  if (startIdx >= data.length || startIdx < 1) startIdx = 1;
  if (startIdx > 1) Logger.log('  [ripresa] riparto da riga ' + startIdx + '/' + (data.length - 1));
  var i = startIdx, interrotto = false, stats = { ok: 0, empty: 0, err: 0, skip: 0 };
  for (; i < data.length; i++) {
    if (Date.now() - t0 > MAX_MS) { interrotto = true; break; }
    var row = data[i];
    var attiva = !(row[iAtt] === false || String(row[iAtt]).toLowerCase() === 'false');
    if (soloAttive && !attiva) { stats.skip++; continue; }
    var url = String(row[iUrl] || '').trim();
    var esito;
    if (!url) esito = 'NO_URL';
    else {
      var txt = (typeof _agentFetchUrl_ === 'function') ? _agentFetchUrl_(url) : null;
      esito = (txt === null) ? 'ERR' : (txt.length < 200 ? 'EMPTY' : 'OK');
    }
    if (esito === 'OK') stats.ok++; else if (esito === 'EMPTY') stats.empty++; else stats.err++;
    sh.getRange(i + 1, iVer + 1).setValue(esito);
    sh.getRange(i + 1, iVerD + 1).setValue(new Date());
  }
  try {
    if (i >= data.length) PropertiesService.getScriptProperties().deleteProperty(cursorKey);
    else PropertiesService.getScriptProperties().setProperty(cursorKey, String(i));
  } catch(e2) {}
  var fine = interrotto ? ('PARZIALE — riparte da riga ' + i + '/' + (data.length - 1) + ' al prossimo lancio (RILANCIA)') : 'COMPLETATO';
  Logger.log('=== VERIFICA FontiBandi ' + fine + ' === OK:' + stats.ok + ' EMPTY:' + stats.empty + ' ERR:' + stats.err + ' skip:' + stats.skip + ' (' + Math.round((Date.now() - t0) / 1000) + 's)');
  return { ok: true, completato: !interrotto, prossimaRiga: (interrotto ? i : 1), stats: stats };
}

/**
 * BONIFICA MORTE: disattiva le fonti con VerificaHTTP = ERR o NO_URL (link rotti
 * certi, rilevati da verificaFontiBandi). REVERSIBILE: marca UltimoErrore=
 * 'BONIFICATO_MORTA' e mette Attiva=false. Ripristino: annullaBonificaFontiBandiMorte().
 * Lanciare DOPO verificaFontiBandi (serve la colonna VerificaHTTP).
 */
function bonificaFontiBandiMorte() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) { Logger.log('FontiBandi_v5 vuoto'); return { ok: false }; }
  var data = sh.getDataRange().getValues();
  var h = data[0].map(function(x) { return String(x || '').trim(); });
  var iAtt = h.indexOf('Attiva'), iNome = h.indexOf('Nome'), iErr = h.indexOf('UltimoErrore'), iVer = h.indexOf('VerificaHTTP');
  if (iVer < 0) { Logger.log('Colonna VerificaHTTP assente: lancia prima verificaFontiBandi'); return { ok: false }; }
  var disattivate = [];
  for (var r = 1; r < data.length; r++) {
    var attiva = !(data[r][iAtt] === false || String(data[r][iAtt]).toLowerCase() === 'false');
    if (!attiva) continue;
    var ver = String(data[r][iVer] || '').trim();
    if (ver === 'ERR' || ver === 'NO_URL') {
      sh.getRange(r + 1, iAtt + 1).setValue(false);
      if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('BONIFICATO_MORTA');
      disattivate.push(data[r][iNome] + ' (' + ver + ')');
    }
  }
  Logger.log('=== BONIFICA MORTE: disattivate ' + disattivate.length + ' fonti (ERR/NO_URL) ===');
  disattivate.forEach(function(n) { Logger.log('  - ' + n); });
  Logger.log('Per annullare: annullaBonificaFontiBandiMorte()');
  return { ok: true, disattivate: disattivate.length, nomi: disattivate };
}

/** Annulla bonificaFontiBandiMorte: riattiva le fonti marcate 'BONIFICATO_MORTA'. */
function annullaBonificaFontiBandiMorte() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var data = sh.getDataRange().getValues();
  var h = data[0].map(function(x) { return String(x || '').trim(); });
  var iAtt = h.indexOf('Attiva'), iNome = h.indexOf('Nome'), iErr = h.indexOf('UltimoErrore');
  if (iErr < 0) { Logger.log('Colonna UltimoErrore assente'); return { ok: false }; }
  var riattivate = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iErr] || '') === 'BONIFICATO_MORTA') {
      sh.getRange(r + 1, iAtt + 1).setValue(true);
      sh.getRange(r + 1, iErr + 1).setValue('');
      riattivate.push(data[r][iNome]);
    }
  }
  Logger.log('=== ANNULLA BONIFICA MORTE: riattivate ' + riattivate.length + ' fonti ===');
  riattivate.forEach(function(n) { Logger.log('  - ' + n); });
  return { ok: true, riattivate: riattivate.length };
}

/**
 * Corregge i valori 'Agente' malformati: un punto tra cifre (es. "2.3") deve essere
 * una virgola ("2,3" = multi-agente AG2+AG3). Senza fix, quella fonte non viene
 * scansionata da nessun agente. Logga le correzioni.
 */
function correggiAgentiMalformati() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) { Logger.log('FontiBandi_v5 vuoto'); return { ok: false }; }
  var data = sh.getDataRange().getValues();
  var h = data[0].map(function(x) { return String(x || '').trim(); });
  var iAg = h.indexOf('Agente'), iNome = h.indexOf('Nome');
  if (iAg < 0) { Logger.log('Colonna Agente assente'); return { ok: false }; }
  var corrette = [];
  for (var r = 1; r < data.length; r++) {
    var val = String(data[r][iAg] == null ? '' : data[r][iAg]).trim();
    // Multi-agente malformato: punto O virgola tra cifre. In locale IT la virgola
    // verrebbe letta come decimale, quindi usiamo il PUNTO E VIRGOLA (";") e
    // forziamo il formato TESTO sulla cella, cosi' non viene piu' coerciuto a numero.
    if (/\d[.,]\d/.test(val)) {
      var nuovo = val.replace(/[.,]/g, ';');
      var cell = sh.getRange(r + 1, iAg + 1);
      cell.setNumberFormat('@');  // testo semplice
      cell.setValue(nuovo);
      corrette.push(data[r][iNome] + ': "' + val + '" -> "' + nuovo + '"');
    }
  }
  Logger.log('=== CORREGGI AGENTI: ' + corrette.length + ' corrette ===');
  corrette.forEach(function(c) { Logger.log('  - ' + c); });
  return { ok: true, corrette: corrette.length, dettaglio: corrette };
}

/**
 * ELENCO ORFANE (sola lettura): le fonti SENZA agente assegnato. Probabilmente non
 * lette da nessuno (agenti leggono solo le taggate; lo scanner classico usa altra
 * lista). Serve a decidere se assegnarle a un agente o disattivarle.
 */
function elencaFontiOrfane() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) { Logger.log('FontiBandi_v5 vuoto'); return []; }
  var data = sh.getDataRange().getValues();
  var h = data[0].map(function(x) { return String(x || '').trim(); });
  var iAg = h.indexOf('Agente'), iNome = h.indexOf('Nome'), iAtt = h.indexOf('Attiva'),
      iVer = h.indexOf('VerificaHTTP'), iCat = h.indexOf('Categoria');
  var out = [];
  Logger.log('=== FONTI ORFANE (senza agente) ===');
  for (var r = 1; r < data.length; r++) {
    var ag = String(data[r][iAg] == null ? '' : data[r][iAg]).trim();
    if (ag) continue;
    var attiva = !(data[r][iAtt] === false || String(data[r][iAtt]).toLowerCase() === 'false');
    var rec = { nome: data[r][iNome], attiva: attiva,
                verifica: iVer >= 0 ? String(data[r][iVer] || '') : '(n/d)',
                categoria: iCat >= 0 ? String(data[r][iCat] || '') : '' };
    out.push(rec);
    Logger.log((attiva ? '✓ ' : '✗ ') + rec.nome + ' | verifica: ' + rec.verifica + ' | cat: ' + rec.categoria);
  }
  Logger.log('--- Totale orfane: ' + out.length + ' ---');
  return out;
}

/**
 * Assegna un agente a una fonte di FontiBandi_v5 cercandola per Nome (trim,
 * case-insensitive). Riattiva la fonte se era spenta. Riutilizzabile (es. domani
 * per l'API EU Funding & Tenders). Multi-agente: passa "1,3" come 'agente'.
 */
function assegnaAgenteAFonte(nome, agente) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'FontiBandi_v5 vuoto' };
  var data = sh.getDataRange().getValues();
  var h = data[0].map(function(x) { return String(x || '').trim(); });
  var iNome = h.indexOf('Nome'), iAg = h.indexOf('Agente'), iAtt = h.indexOf('Attiva');
  if (iNome < 0 || iAg < 0) return { ok: false, error: 'colonne Nome/Agente assenti' };
  var target = String(nome || '').trim().toLowerCase();
  var fatte = [];
  var ag = String(agente);
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iNome] || '').trim().toLowerCase() === target) {
      var cell = sh.getRange(r + 1, iAg + 1);
      if (/[,;.]/.test(ag)) cell.setNumberFormat('@');  // multi-agente -> forza testo (locale IT)
      cell.setValue(ag);
      if (iAtt >= 0) sh.getRange(r + 1, iAtt + 1).setValue(true);
      fatte.push(data[r][iNome] + ' -> AG' + ag);
    }
  }
  Logger.log('assegnaAgenteAFonte("' + nome + '", ' + agente + '): ' + JSON.stringify(fatte));
  return { ok: true, assegnate: fatte.length, dettaglio: fatte };
}

/** Assegna ad AG1 le 2 orfane "buone" (gare cultura/appalti italiane, vive). */
function assegnaFontiOrfaneBuone() {
  var nomi = ['MiC Trasparenza - Gare e Contratti', 'SCP - Servizio Contratti Pubblici (MIT)'];
  var out = nomi.map(function(n) { return assegnaAgenteAFonte(n, 1); });
  var tot = out.reduce(function(s, o) { return s + (o.assegnate || 0); }, 0);
  Logger.log('=== ASSEGNA ORFANE BUONE -> AG1: ' + tot + ' assegnate ===');
  return out;
}

/**
 * Disattiva (REVERSIBILE) tutte le fonti SENZA agente. Marker UltimoErrore='ORFANA_OFF'.
 * Lanciare DOPO assegnaFontiOrfaneBuone (cosi' le 2 buone, ora con agente, restano attive).
 * Ripristino: annullaDisattivaFontiOrfane().
 */
function disattivaFontiOrfane() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var data = sh.getDataRange().getValues();
  var h = data[0].map(function(x) { return String(x || '').trim(); });
  var iAg = h.indexOf('Agente'), iAtt = h.indexOf('Attiva'), iNome = h.indexOf('Nome'), iErr = h.indexOf('UltimoErrore');
  var spente = [];
  for (var r = 1; r < data.length; r++) {
    var ag = String(data[r][iAg] == null ? '' : data[r][iAg]).trim();
    if (ag) continue;
    var attiva = !(data[r][iAtt] === false || String(data[r][iAtt]).toLowerCase() === 'false');
    if (!attiva) continue;
    sh.getRange(r + 1, iAtt + 1).setValue(false);
    if (iErr >= 0) sh.getRange(r + 1, iErr + 1).setValue('ORFANA_OFF');
    spente.push(data[r][iNome]);
  }
  Logger.log('=== DISATTIVA ORFANE: spente ' + spente.length + ' fonti senza agente ===');
  spente.forEach(function(n) { Logger.log('  - ' + n); });
  Logger.log('Per annullare: annullaDisattivaFontiOrfane()');
  return { ok: true, spente: spente.length, nomi: spente };
}

/** Annulla disattivaFontiOrfane: riattiva le fonti marcate 'ORFANA_OFF'. */
function annullaDisattivaFontiOrfane() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok: false };
  var data = sh.getDataRange().getValues();
  var h = data[0].map(function(x) { return String(x || '').trim(); });
  var iAtt = h.indexOf('Attiva'), iNome = h.indexOf('Nome'), iErr = h.indexOf('UltimoErrore');
  if (iErr < 0) return { ok: false };
  var on = [];
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iErr] || '') === 'ORFANA_OFF') {
      sh.getRange(r + 1, iAtt + 1).setValue(true);
      sh.getRange(r + 1, iErr + 1).setValue('');
      on.push(data[r][iNome]);
    }
  }
  Logger.log('=== ANNULLA DISATTIVA ORFANE: riattivate ' + on.length + ' ===');
  return { ok: true, riattivate: on.length };
}

/**
 * Marca con prefisso _OLD_ i fogli bandi non piu' usati. DA LANCIARE SOLO DOPO
 * consolidaBandiFonti() e verifica del pannello. NON cancella: rinomina, cosi' li
 * riconosci nel foglio Google e li elimini tu a mano.
 *
 * Sicuri perche' (verificato): FontiBandi -> getFontiBandi/add/delete/toggle ora
 * puntano a FontiBandi_v5; i 2 riferimenti residui sono diagnostici e null-safe.
 * FontiBandi_v5_pre_FU17 -> solo backup pre-migrazione.
 * NON tocca: FontiAgenti (letto da scanAgente), RADAR BANDI / _RADAR_BANDI_LEGACY_ (fallback).
 */
function deprecaFontiBandiOld() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var candidati = ['FontiBandi', 'FontiBandi_v5_pre_FU17'];
  var fatti = [], saltati = [];
  candidati.forEach(function(nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) { saltati.push(nome + ' (assente)'); return; }
    var target = '_OLD_' + nome;
    if (ss.getSheetByName(target)) {
      target = '_OLD_' + nome + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    }
    sh.setName(target);
    fatti.push(nome + ' -> ' + target);
  });
  var rep = { ok: true, rinominati: fatti, saltati: saltati,
    nota: 'Ora puoi cancellare a mano i fogli che iniziano con _OLD_. NON cancellare FontiAgenti, RADAR BANDI, _RADAR_BANDI_LEGACY_.' };
  Logger.log('deprecaFontiBandiOld: ' + JSON.stringify(rep, null, 2));
  return rep;
}

/**
 * Aggiunge a FontiBandi_v5 le colonne 'Agente' (quale agente gestisce la fonte)
 * e 'UltimoHash' (per la dedup hash-first dello scanner agenti), popolandole da
 * FontiAgenti per URL. Multi-agente -> lista "1,3". Da lanciare DOPO consolidaBandiFonti.
 * Cosi' nel foglio unico si VEDE quali fonti sono gestite da agenti specifici.
 */
function assegnaAgentiFontiBandi() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shV5 = ss.getSheetByName(BANDI_V5_SHEET);
  if (!shV5) return { ok: false, error: 'FontiBandi_v5 assente' };

  // 1. assicura colonne Agente + UltimoHash (in coda, non sposta le 18 esistenti)
  var hdr = shV5.getRange(1, 1, 1, shV5.getLastColumn()).getValues()[0];
  function ensureCol(name) {
    var i = hdr.indexOf(name);
    if (i >= 0) return i;
    shV5.getRange(1, shV5.getLastColumn() + 1).setValue(name);
    hdr = shV5.getRange(1, 1, 1, shV5.getLastColumn()).getValues()[0];
    return hdr.indexOf(name);
  }
  var iAgente = ensureCol('Agente');
  var iHash = ensureCol('UltimoHash');
  var iUrl = hdr.indexOf('URL');

  // 2. mappa da FontiAgenti: URL normalizzato -> {agenti:{}, hash}
  var ag = _bcSheetObjs_('FontiAgenti');
  var mapUrl = {};
  ag.forEach(function(o) {
    var k = _bcUrlKey_(o.URL || o.RSS_URL || '');
    if (!k) return;
    if (!mapUrl[k]) mapUrl[k] = { agenti: {}, hash: '' };
    var a = String(o.Agente == null ? '' : o.Agente).trim();
    if (a) mapUrl[k].agenti[a] = true;
    if (o.UltimoHash) mapUrl[k].hash = String(o.UltimoHash);
  });

  // 3. scrivi Agente + UltimoHash sulle righe FontiBandi_v5 corrispondenti per URL
  var v = shV5.getDataRange().getValues();
  var assegnati = 0;
  for (var r = 1; r < v.length; r++) {
    var k = _bcUrlKey_(v[r][iUrl]);
    var m = mapUrl[k];
    if (!m) continue;
    var lista = Object.keys(m.agenti).join(',');
    if (lista) { shV5.getRange(r + 1, iAgente + 1).setValue(lista); assegnati++; }
    if (m.hash) shV5.getRange(r + 1, iHash + 1).setValue(m.hash);
  }
  var rep = { ok: true, colonna_Agente: iAgente + 1, colonna_UltimoHash: iHash + 1, righe_con_agente: assegnati };
  Logger.log('assegnaAgentiFontiBandi: ' + JSON.stringify(rep));
  return rep;
}

/**
 * Anteprima (NON modifica): quante fonti porterebbe dentro la consolidazione.
 */
function anteprimaConsolidaBandi() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var shV5 = ss.getSheetByName(BANDI_V5_SHEET);
  var rep = {
    FontiBandi_v5_attuali: shV5 ? shV5.getLastRow() - 1 : '(assente)',
    hardcoded: (typeof TUTTE_LE_FONTI_BANDI !== 'undefined') ? TUTTE_LE_FONTI_BANDI.length : '(assente)',
    vecchio_FontiBandi: _bcSheetObjs_('FontiBandi').length,
    FontiAgenti: _bcSheetObjs_('FontiAgenti').length
  };
  Logger.log('anteprimaConsolidaBandi: ' + JSON.stringify(rep, null, 2));
  return rep;
}

// ============================================================================
// FONTI API — aggiunta in FontiBandi_v5 con tutti i campi (Tipo=API, Agente)
// ============================================================================

/**
 * Aggiunge UNA fonte API a FontiBandi_v5, riutilizzabile per ogni API futura.
 * Scrive per nome colonna (compatibile con lo schema 18+Agente+UltimoHash),
 * dedup per URL. Assegna Tipo=API e l'agente indicato.
 *
 * @param {Object} opts { nome, url, agente=1, categoria='Aggregatore',
 *                        priorita=1, id?, enteDefault?, livello?, note? }
 */
function aggiungiFonteApiAgente(opts) {
  opts = opts || {};
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BANDI_V5_SHEET);
  if (!sh) return { ok: false, error: 'FontiBandi_v5 assente' };
  if (!opts.nome || !opts.url) return { ok: false, error: 'nome e url obbligatori' };

  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  // assicura la colonna Agente (in coda)
  if (h.indexOf('Agente') < 0) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('Agente');
    h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  }
  var iUrl = h.indexOf('URL');

  // dedup per URL normalizzato
  var cur = sh.getDataRange().getValues();
  var key = _bcUrlKey_(opts.url);
  for (var r = 1; r < cur.length; r++) {
    if (_bcUrlKey_(cur[r][iUrl]) === key) return { ok: false, error: 'fonte gia presente (stesso URL) alla riga ' + (r + 1) };
  }

  var rowObj = {
    ID: opts.id || ('api_' + Date.now()),
    Nome: String(opts.nome), URL: String(opts.url), Tipo: 'API',
    Tag: 'settoriale', Categoria: opts.categoria || 'Aggregatore',
    Priorita: Number(opts.priorita) || 1, Attiva: true,
    DataAggiunta: new Date(), UltimaScan: '', UltimoEsito: '',
    NRecordTotali: 0, NRecordUltimo: 0, FailConsecutivi: 0, UltimoErrore: '',
    EnteDefault: String(opts.enteDefault || ''), Livello: String(opts.livello || ''),
    extras_json: JSON.stringify({ tipoFonte: 'API', note: String(opts.note || '') }),
    Agente: String(opts.agente || 1),
    UltimoHash: ''
  };
  sh.appendRow(h.map(function(name) { return rowObj[name] !== undefined ? rowObj[name] : ''; }));
  var rep = { ok: true, nome: opts.nome, tipo: 'API', agente: opts.agente || 1, riga: sh.getLastRow() };
  Logger.log('aggiungiFonteApiAgente: ' + JSON.stringify(rep));
  return rep;
}

/** Pronta: aggiunge la fonte API BandiUp — Cultura (agente 1, bandi cultura aperti). */
function aggiungiBandiUpCultura() {
  return aggiungiFonteApiAgente({
    id: 'bandiup_cultura',
    nome: 'BandiUp — Cultura (API)',
    url: 'https://bandiup.it/api/bandi?categoria=cultura&stato=aperto&limit=25',
    agente: 1,
    categoria: 'Aggregatore',
    priorita: 1,
    note: 'API pubblica JSON. Filtro: categoria=cultura, stato=aperto. Estrazione via Claude (prompt AG1).'
  });
}

/**
 * Set curato di fonti API BandiUp (agente 1) che copre i temi cultura/musei.
 * Idempotente (dedup per URL): rilanciabile, aggiunge solo le mancanti.
 */
function setupFontiApiBandiUp() {
  var fonti = [
    { id: 'bandiup_cultura',  nome: 'BandiUp — Cultura aperti (API)',     url: 'https://bandiup.it/api/bandi?categoria=cultura&stato=aperto&limit=25',     note: 'cultura, aperti' },
    { id: 'bandiup_musei',    nome: 'BandiUp — Musei (API)',              url: 'https://bandiup.it/api/bandi?q=musei&stato=aperto&limit=20',               note: 'ricerca testuale musei' },
    { id: 'bandiup_scadenza', nome: 'BandiUp — Cultura in scadenza (API)', url: 'https://bandiup.it/api/bandi?categoria=cultura&stato=in_scadenza&limit=15', note: 'cultura, urgenti in scadenza' }
  ];
  var out = [];
  fonti.forEach(function(f) {
    f.agente = 1; f.categoria = 'Aggregatore'; f.priorita = 1;
    out.push(aggiungiFonteApiAgente(f));
  });
  Logger.log('setupFontiApiBandiUp: ' + JSON.stringify(out, null, 2));
  return out;
}

/**
 * Set ESTESO di fonti API BandiUp (agente 1) per coprire PIU' BANDI.
 *
 * Perche': la ricerca "cultura" ha ~33 bandi su 7 pagine, ma una singola query
 * mostra solo la prima pagina (e il buffer Claude da 20KB tronca oltre ~15 record).
 * Qui registriamo le PAGINE SUCCESSIVE (page=2, page=3) come fonti a se', cosi'
 * l'agente AG1 le scansiona e raccoglie anche i bandi oltre la prima pagina.
 * limit=15 = ogni pagina rientra intera nel buffer senza troncamenti.
 *
 * Aggiunge anche una ricerca testuale "patrimonio" (cattura bandi non taggati
 * come categoria=cultura ma pertinenti al patrimonio culturale).
 *
 * Idempotente (dedup per URL normalizzato, query-string inclusa): rilanciabile.
 * Lanciare DOPO setupFontiApiBandiUp(). I duplicati di titolo tra pagine vengono
 * gestiti a valle dal dedup dell'archivio bandi.
 */
function setupFontiApiBandiUpEsteso() {
  var fonti = [
    { id: 'bandiup_cultura_p2', nome: 'BandiUp — Cultura aperti pag.2 (API)', url: 'https://bandiup.it/api/bandi?categoria=cultura&stato=aperto&limit=15&page=2', note: 'cultura aperti, pagina 2 (bandi successivi)' },
    { id: 'bandiup_cultura_p3', nome: 'BandiUp — Cultura aperti pag.3 (API)', url: 'https://bandiup.it/api/bandi?categoria=cultura&stato=aperto&limit=15&page=3', note: 'cultura aperti, pagina 3 (bandi successivi)' },
    { id: 'bandiup_patrimonio', nome: 'BandiUp — Patrimonio (API)',           url: 'https://bandiup.it/api/bandi?q=patrimonio&stato=aperto&limit=15',         note: 'ricerca testuale patrimonio culturale' }
  ];
  var out = [];
  fonti.forEach(function(f) {
    f.agente = 1; f.categoria = 'Aggregatore'; f.priorita = 1;
    out.push(aggiungiFonteApiAgente(f));
  });
  Logger.log('setupFontiApiBandiUpEsteso: ' + JSON.stringify(out, null, 2));
  return out;
}

/**
 * TED — Tenders Electronic Daily (appalti pubblici UE). AGENTE 1.
 *
 * Fonte UFFICIALE UE: bandi/appalti veri, pertinenti a cultura e musei (codici CPV
 * famiglia 925x = servizi bibliotecari/archivi/musei + conservazione beni culturali).
 * Nessuna API key. ATTENZIONE: TED usa POST con body JSON; lo scanner lo gestisce
 * via _tedFetch_/_tedBuildBody_ (AgentScanner.js) riconoscendo l'endpoint.
 *
 * Convenzione URL fonte: endpoint /v3/notices/search + ?query=<expert query>&limit=N.
 * La query viene tradotta in POST. PRIMA di attivare, lanciare testTedApi() per
 * confermare la sintassi della expert query e i nomi dei campi.
 *
 * Idempotente (dedup per URL). Lanciare DOPO la verifica con testTedApi().
 */
function setupFontiApiTed() {
  var endpoint = 'https://api.ted.europa.eu/v3/notices/search';
  // Expert query: CPV famiglia cultura/musei + luogo di esecuzione Italia, attivi.
  var qCultura = 'classification-cpv IN (92500000 92520000 92521000 92521100 92522000 92522100 45212313) AND place-of-performance=ITA';
  // CPV lavori/allestimenti museali (restauro, costruzione musei, architettura,
  // allestimento espositivo). Esempi dati: 45212313 (costruzione musei),
  // 71250000 (architettura/ingegneria) + restauro e esposizioni.
  var qLavori = 'classification-cpv IN (45212313 45212350 45454100 71250000 92521100 92522000) AND place-of-performance=ITA';
  var fonti = [
    { id: 'ted_cultura_it', nome: 'TED — Appalti cultura/musei Italia (API)',
      url: endpoint + '?query=' + encodeURIComponent(qCultura) + '&limit=20',
      note: 'TED UE, POST JSON. CPV cultura/musei, luogo Italia, ultimi 365gg. Confermato HTTP 200.' },
    { id: 'ted_cultura_eu', nome: 'TED — Appalti cultura/musei UE (API)',
      url: endpoint + '?query=' + encodeURIComponent('classification-cpv IN (92520000 92521000 92522000)') + '&limit=20',
      note: 'TED UE, POST JSON. CPV cultura/musei, tutta UE, ultimi 365gg. Confermato HTTP 200.' },
    { id: 'ted_lavori_it', nome: 'TED — Lavori/allestimenti musei Italia (API)',
      url: endpoint + '?query=' + encodeURIComponent(qLavori) + '&limit=20',
      note: 'TED UE, POST JSON. CPV lavori/restauro/architettura/allestimento museale, luogo Italia, ultimi 365gg.' }
  ];
  var out = [];
  fonti.forEach(function(f) {
    f.agente = 1; f.categoria = 'Aggregatore'; f.priorita = 1;
    out.push(aggiungiFonteApiAgente(f));
  });
  Logger.log('setupFontiApiTed: ' + JSON.stringify(out, null, 2));
  return out;
}

/**
 * EU Funding & Tenders Portal (SEDIA) — call/bandi UE. AGENTE 1.
 * Metodo verificato: POST form-urlencoded (HTTP 200). Il filtro stato "aperto" via
 * API non e' raggiungibile da GAS, quindi: keyword cultura nell'URL (text=...) +
 * filtro stato lato fetch (_euftFetch_ tiene solo Aperto/Imminente) + filtro Claude AG1.
 * Una riga per parola chiave (come per le altre scansioni). Idempotente (dedup URL).
 */
function setupFontiApiEuFt() {
  var base = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=';
  var kw = [
    { id: 'euft_culture',  kw: 'culture',           nome: 'EU F&T — Culture (API)' },
    { id: 'euft_heritage', kw: 'cultural heritage',  nome: 'EU F&T — Cultural heritage (API)' },
    { id: 'euft_museum',   kw: 'museum',             nome: 'EU F&T — Museum (API)' },
    { id: 'euft_creative', kw: 'creative europe',    nome: 'EU F&T — Creative Europe (API)' }
  ];
  var out = kw.map(function(k) {
    return aggiungiFonteApiAgente({
      id: k.id, nome: k.nome,
      url: base + encodeURIComponent(k.kw),
      agente: 1, categoria: 'Aggregatore', priorita: 1,
      note: 'EU F&T SEDIA, POST form. Keyword="' + k.kw + '". Solo call aperte (filtro stato lato fetch) + filtro Claude AG1.'
    });
  });
  Logger.log('setupFontiApiEuFt: ' + JSON.stringify(out, null, 2));
  return out;
}

/**
 * Pronta: dataset/cataloghi open-data culturali da dati.gov.it (CKAN) — AGENTE 5.
 * NB: sono DATASET (es. "Luoghi della cultura", inventari beni culturali), NON bandi.
 * Adatti ad AG5 (Digital/open data), non ad AG1 (bandi).
 */
function aggiungiDatiGovCultura() {
  return aggiungiFonteApiAgente({
    id: 'datigov_cultura',
    nome: 'dati.gov.it — Cultura / Open Data (API)',
    url: 'https://dati.gov.it/opendata/api/3/action/package_search?q=cultura&rows=10',
    agente: 5,
    categoria: 'Aggregatore',
    priorita: 2,
    note: 'CKAN open data nazionale. Dataset/cataloghi culturali (musei, beni culturali), NON bandi. Agente AG5.'
  });
}

/**
 * Pronta: OpenCoesione via CKAN (dati.gov.it) — AGENTE 5 (open data / analisi territoriale).
 * NB: sono PROGETTI FINANZIATI/CONCLUSI (coesione, cultura, turismo), NON call aperte.
 * Verificato: l'endpoint CKAN /api/3/action/package_search risponde (success:true).
 * Utile per analisi investimenti culturali sul territorio, non per "bandi aperti".
 */
function aggiungiOpenCoesione() {
  return aggiungiFonteApiAgente({
    id: 'opencoesione_cultura',
    nome: 'OpenCoesione — Cultura/Turismo (API CKAN)',
    url: 'https://dati.gov.it/opendata/api/3/action/package_search?q=opencoesione cultura turismo&rows=10',
    agente: 5,
    categoria: 'Aggregatore',
    priorita: 2,
    note: 'CKAN dati.gov.it (federa OpenCoesione). Dataset progetti finanziati coesione cultura/turismo. AG5 open data, non bandi.'
  });
}

/**
 * Pronta: CORDIS — progetti UE finanziati in cultura/turismo — AGENTE 5 (analisi).
 * Verificato: endpoint pubblico GET JSON senza chiave. Utile per mappare CHI ha
 * vinto i bandi UE cultura (partner, competitor, reti), NON sono call aperte.
 * Lo scanner usa _cordisFetch_ (compatta la risposta verbosa).
 */
function aggiungiCordisCultura() {
  var q = "contenttype='project' AND ('cultural heritage' OR 'museum' OR 'cultural tourism')";
  return aggiungiFonteApiAgente({
    id: 'cordis_cultura',
    nome: 'CORDIS — Progetti UE cultura/turismo (API)',
    url: 'https://cordis.europa.eu/search?q=' + encodeURIComponent(q) + '&p=1&num=20&format=json',
    agente: 5,
    categoria: 'Aggregatore',
    priorita: 2,
    note: 'CORDIS GET JSON pubblico. Progetti UE finanziati cultura/musei/turismo. AG5 analisi, non bandi aperti.'
  });
}
