// ============================================================================
//  DiagnosticaMigrazione.js — Diagnostica, ispezioni, migrazioni, test
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini
//  v4.27.34 — Estratto da Codice.js (refactoring modularizzazione)
//
//  Contiene funzioni di diagnostica (diag*, inspect*, audit*),
//  migrazione dati (recupera*, correggi*, migra*, setup*),
//  statistiche fonti (getFontiStats), utility (getMainSheetUrl, getWebAppUrl),
//  e test (debugProps, testGetBandiRadar).
//
//  Queste funzioni sono chiamate raramente (one-shot o admin tool).
//  Dipendenze: getMainSS(), SH, COL, SHEET_RADAR, getBandiRadar(),
//              getCurrentUser_v44(), AMBITO_LABEL
// ============================================================================

// (spazio vuoto — codice podcast rimosso, ora in PodcastManager.js)

// seedSocialFontiV2 — ESTRATTA in SocialManager.js (v4.27.33)


function getFontiStats() {
  var stats = {
    fontiBandi: { totale: 0, attive: 0 },
    fontiPodcast: { totale: 0, attive: 0, audio: 0, video: 0 }
  };
  try {
    var fb = getFontiBandi();
    if (fb && fb.fonti) {
      stats.fontiBandi.totale = fb.fonti.length;
      stats.fontiBandi.attive = fb.fonti.filter(function(f){ return f.Attiva === true; }).length;
    }
  } catch(e) { Logger.log('getFontiStats bandi err: ' + e.message); }
  try {
    var fp = getFontiPodcast();
    if (fp && fp.fonti) {
      stats.fontiPodcast.totale = fp.fonti.length;
      stats.fontiPodcast.attive = fp.fonti.filter(function(f){ return f.Attiva === true; }).length;
      stats.fontiPodcast.audio = fp.fonti.filter(function(f){ return (f.TipoContenuto||'audio') === 'audio'; }).length;
      stats.fontiPodcast.video = fp.fonti.filter(function(f){ return f.TipoContenuto === 'video'; }).length;
    }
  } catch(e) { Logger.log('getFontiStats podcast err: ' + e.message); }
  return stats;
}


// ==================================================================
// FIX FONTI PROBLEMATICHE - eseguire una sola volta dal GAS editor
// Corregge URL errati e disattiva fonti non funzionanti nel foglio Fonti
// ==================================================================
function fixFontiProblematiche() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return; }

  const rows = sh.getDataRange().getValues();
  const h = rows[0];
  const nomeCol  = h.indexOf('Nome')  + 1;
  const urlCol   = h.indexOf('URL')   + 1;
  const rssCol   = h.indexOf('RSSURL')+ 1;
  const attivaCol= h.indexOf('Attiva')+ 1;

  // URL da correggere: { cerca: stringa nell'URL, nuovoRSS: nuovo valore }
  const correzioni = [
    { cerca:'flashartonline.it', nuovoRSS:'https://flash---art.it/feed/', log:'Flash Art URL corretto' },
  ];

  // Parole chiave nel nome per disattivare la fonte
  const daDisattivare = [
    'ANCI Cultura','CCW Welfare','Artefatti','FASI Europa',
    'Itinerari Arte','flashartonline',
  ];

  let corretti = 0, disattivati = 0;

  for (let i = 1; i < rows.length; i++) {
    const nome = String(rows[i][nomeCol-1]||'');
    const url  = String(rows[i][urlCol-1]||'');
    const rss  = String(rows[i][rssCol-1]||'');

    // Correzioni URL
    correzioni.forEach(fix => {
      if (url.includes(fix.cerca) || rss.includes(fix.cerca)) {
        if (rssCol > 0) sh.getRange(i+1, rssCol).setValue(fix.nuovoRSS);
        if (urlCol > 0) sh.getRange(i+1, urlCol).setValue('https://flash---art.it/');
        Logger.log('[FIX] ' + fix.log + ' (riga ' + (i+1) + ')');
        corretti++;
      }
    });

    // Disattivazioni
    const daDisatt = daDisattivare.some(kw => nome.toLowerCase().includes(kw.toLowerCase()) || url.toLowerCase().includes(kw.toLowerCase()));
    if (daDisatt && attivaCol > 0) {
      const attiva = rows[i][attivaCol-1];
      if (attiva === true || attiva === 'TRUE' || attiva === 1) {
        sh.getRange(i+1, attivaCol).setValue(false);
        Logger.log('[OFF] Disattivata: ' + nome + ' (riga ' + (i+1) + ')');
        disattivati++;
      }
    }
  }

  Logger.log('[OK] fixFontiProblematiche: ' + corretti + ' corrette, ' + disattivati + ' disattivate');
  SpreadsheetApp.flush();
}


// Aggiunge le fonti AI al foglio Fonti con Ambito=5 (eseguire una sola volta)
function addFontiAIAlFoglioFonti() {
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.FONTI);
  if (!sh) { Logger.log('Foglio Fonti non trovato'); return 0; }
  const existing = sh.getDataRange().getValues().map(r => r[2]||r[3]); // URL o RSSURL
  const fontiAI = [
    { nome:'Agenda Digitale',       url:'https://www.agendadigitale.eu/', rss:'https://www.agendadigitale.eu/feed/' },
    { nome:'We Make Money Not Art', url:'https://we-make-money-not-art.com/', rss:'https://we-make-money-not-art.com/feed/' },
    { nome:'MIT Technology Review', url:'https://www.technologyreview.com/', rss:'https://www.technologyreview.com/feed/' },
    { nome:'AI News Italia',        url:'https://ainews.it/', rss:'https://ainews.it/feed/' },
    { nome:'FrizziFrizzi Arte',     url:'https://www.frizzifrizzi.it/', rss:'https://www.frizzifrizzi.it/category/arte/feed/' },
    { nome:'Artspecialday',         url:'https://www.artspecialday.com/', rss:'https://www.artspecialday.com/feed/' },
  ];
  let added = 0;
  fontiAI.forEach(f => {
    if (!existing.includes(f.rss) && !existing.includes(f.url)) {
      const id = 'AI' + Date.now();
      sh.appendRow([id, f.nome, f.url, f.rss, 5, 'Digital, AI e governance', true, '', 0]);
      added++;
      Utilities.sleep(100);
    }
  });
  Logger.log('[OK] addFontiAIAlFoglioFonti: ' + added + ' fonti AI aggiunte al foglio Fonti');
  return added;
}


// ==================================================================
// SISTEMA TOKEN DIGEST READER v4.3-fix
// Colonne extra MailingList: Token | TokenExpiry | DigestIds
// FIX: colonne aggiunte correttamente una alla volta + flush + null-check
// ==================================================================

// --- Digest functions extracted to DigestService.js (Sprint 2, 2026-05-26) ---



function diagBandiSheet() {
  const sheet=getSheetRadar();
  if(!sheet) return {error:'Foglio RADAR BANDI non trovato'};
  const lastCol=sheet.getLastColumn();
  const headers=sheet.getRange(1,1,1,lastCol).getValues()[0];
  const atteso=Object.entries(COL).map(([k,v])=>({campo:k,colAttesa:v,intestazione:headers[v-1]||'(vuota)'}));
  const sample=sheet.getLastRow()>1
    ?sheet.getRange(2,1,1,lastCol).getValues()[0].map((v,i)=>({col:i+1,header:headers[i]||'?',val:String(v).substring(0,40)}))
    :[];
  return {totalCol:lastCol,totalRighe:sheet.getLastRow()-1,headers,atteso,sample};
}

const COL_NAMES = {
  DATA_RILEVAMENTO:['Data','DataRilevamento','Data Rilevamento'],
  TITOLO:['Titolo','titolo','Nome','Bando'],
  ENTE:['Ente','ente','Organizzazione'],
  LIVELLO:['Livello','livello'],
  REGIONE:['Regione','regione'],
  SETTORE:['Settore','settore'],
  SOGGETTI:['Soggetti','soggetti','Beneficiari'],
  IMPORTO:['Importo','importo','Budget'],
  COFIN:['Cofin','cofin','Cofinanziamento'],
  SCADENZA:['Scadenza','scadenza','Deadline'],
  STATUS:['Status','status','Stato'],
  CLIENTE:['Cliente','cliente'],
  LINK:['Link','link','URL','url','Fonte URL','Link Bando'],
  NOTE:['Note','note','Descrizione'],
  FONTE:['Fonte','fonte','Sorgente'],
  PRIORITA:['Priorita','priorita','Priorita','priorita'],
  NASCOSTO:['Nascosto','nascosto','Hidden'],
  STATO_RECORD:['StatoRecord','statoRecord','stato_record','STATO_RECORD'],
  URL_ENTE:['UrlEnte','urlEnte','url_ente','URL_ENTE','LinkEnte'],
  LETTO_BANDO:['LettoBando','lettoBando','letto_bando','LETTO_BANDO'],
  TIPO_BANDO:['TipoBando','tipoBando','tipo_bando','TIPO_BANDO'],
  AMBITO:['Ambito','ambito','AMBITO'],
  SETTORE_CULTURA:['SettoreCultura','settoreCultura','SETTORE_CULTURA'],
  CPV:['CPV','cpv','CpvCode'],
  DESCRIZIONE:['Descrizione','descrizione','DESCRIZIONE','Description'],
  TIPO_APPALTO:['TipoAppalto','tipoAppalto','tipo_appalto','TIPO_APPALTO'],
};

/**
 * v4.25.13 — Diagnostica fogli utenti: verifica presenza e contenuto.
 * Eseguire dall'editor GAS per capire cosa è successo ai profili.
 */
function diagUtentiSheets() {
  Logger.log('=== DIAGNOSTICA FOGLI UTENTI ===');
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e1) {}
  if (!ss) { try { ss = getMainSS(); } catch(e2) {} }
  if (!ss) {
    try {
      var sid = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
      Logger.log('SHEET_ID: ' + (sid || 'NON TROVATO'));
      if (sid) ss = SpreadsheetApp.openById(sid);
    } catch(e3) { Logger.log('Errore openById: ' + e3.message); }
  }
  if (!ss) { Logger.log('ERRORE: nessun spreadsheet trovato'); return { error: 'nessun spreadsheet' }; }
  Logger.log('Spreadsheet: ' + ss.getName() + ' (ID: ' + ss.getId() + ')');
  var fogli = ss.getSheets();
  var report = { spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), fogli: [] };

  // Elenca TUTTI i fogli con righe
  fogli.forEach(function(sh) {
    var nome = sh.getName();
    var righe = sh.getLastRow();
    var cols = sh.getLastColumn();
    var hidden = sh.isSheetHidden();
    report.fogli.push({ nome: nome, righe: righe, colonne: cols, nascosto: hidden });
  });

  // Controlla specificamente i fogli utenti
  var userSheets = ['Utenti', 'Sessioni_v1', 'ProfiliPro', 'ContactsMatrix', 'ResponsesMatrix', 'MailingList', 'ProfiloAgenti', 'DigestQueue'];
  userSheets.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      Logger.log('MANCANTE: ' + name);
      return;
    }
    var righe = sh.getLastRow();
    var cols = sh.getLastColumn();
    Logger.log(name + ': ' + righe + ' righe, ' + cols + ' colonne' + (sh.isSheetHidden() ? ' [NASCOSTO]' : ''));
    if (righe > 1 && righe <= 6) {
      // Poche righe — mostra contenuto per debug
      var data = sh.getDataRange().getValues();
      Logger.log('  Headers: ' + JSON.stringify(data[0]));
      for (var r = 1; r < data.length; r++) {
        Logger.log('  Riga ' + (r+1) + ': ' + JSON.stringify(data[r].slice(0, 5)));
      }
    } else if (righe > 6) {
      var headers = sh.getRange(1, 1, 1, cols).getValues()[0];
      Logger.log('  Headers: ' + JSON.stringify(headers));
      Logger.log('  Ultima riga: ' + JSON.stringify(sh.getRange(righe, 1, 1, Math.min(cols, 5)).getValues()[0]));
    }
  });

  Logger.log('=== FINE DIAGNOSTICA ===');
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Diagnostica OptIn utenti — verifica valori OptInMatrix nel foglio.
 */
/**
 * v4.25.15 — Corregge OptInMatrix: true SOLO per email in ContactsMatrix.
 * Rimuove OptInMatrix=true per utenti che sono solo in ProfiliPro/Sessioni.
 */
function correggiOptInMatrix() {
  Logger.log('=== CORREGGI OptInMatrix ===');
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

  // Email che hanno REALMENTE compilato Matrix (ContactsMatrix)
  var matrixEmails = {};
  var shC = ss.getSheetByName('ContactsMatrix');
  if (shC && shC.getLastRow() > 1) {
    var cV = shC.getDataRange().getValues(), cH = cV[0];
    var iCE = cH.indexOf('email');
    for (var r = 1; r < cV.length; r++) {
      var em = String(cV[r][iCE]||'').trim().toLowerCase();
      if (em) matrixEmails[em] = true;
    }
  }
  Logger.log('Email in ContactsMatrix: ' + Object.keys(matrixEmails).join(', '));

  // Aggiorna foglio Utenti
  var shU = ss.getSheetByName('Utenti');
  if (!shU || shU.getLastRow() < 2) { Logger.log('Utenti vuoto'); return; }
  var uV = shU.getDataRange().getValues(), uH = uV[0];
  var iUE = uH.indexOf('Email'), iUM = uH.indexOf('OptInMatrix');

  var corretti = 0, confermati = 0;
  for (var r = 1; r < uV.length; r++) {
    var em = String(uV[r][iUE]||'').trim().toLowerCase();
    if (!em) continue;
    var deveEssereTrue = !!matrixEmails[em];
    var attuale = uV[r][iUM] === true || String(uV[r][iUM]).toLowerCase() === 'true';

    if (deveEssereTrue && !attuale) {
      shU.getRange(r + 1, iUM + 1).setValue(true);
      Logger.log('SET true: ' + em);
      corretti++;
    } else if (!deveEssereTrue && attuale) {
      shU.getRange(r + 1, iUM + 1).setValue(false);
      Logger.log('SET false: ' + em + ' (non in ContactsMatrix)');
      corretti++;
    } else if (deveEssereTrue) {
      confermati++;
    }
  }

  Logger.log('=== COMPLETATO: ' + corretti + ' corretti, ' + confermati + ' confermati, ' + Object.keys(matrixEmails).length + ' email Matrix ===');
  return { ok: true, corretti: corretti, confermati: confermati };
}

function diagUtentiOptIn() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Utenti');
  if (!sh || sh.getLastRow() < 2) { Logger.log('Foglio Utenti vuoto'); return; }
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(function(h){ return String(h||'').trim(); });
  var iEmail = head.indexOf('Email');
  var iDigest = head.indexOf('OptInDigest');
  var iBandi = head.indexOf('OptInBandi');
  var iMatrix = head.indexOf('OptInMatrix');
  Logger.log('Colonne OptIn: Digest=' + iDigest + ' Bandi=' + iBandi + ' Matrix=' + iMatrix);
  var mxTrue = 0, mxFalse = 0;
  for (var r = 1; r < vals.length; r++) {
    var mx = vals[r][iMatrix];
    if (mx === true || mx === 'TRUE' || String(mx).toLowerCase() === 'true') { mxTrue++; } else { mxFalse++; }
    // Mostra solo quelli con Matrix=true
    if (mx === true || mx === 'TRUE' || String(mx).toLowerCase() === 'true') {
      Logger.log('✓ MATRIX: ' + String(vals[r][iEmail]||'').substring(0,30) + ' (riga ' + (r+1) + ')');
    }
  }
  Logger.log('TOTALE: ' + mxTrue + ' con Matrix=true, ' + mxFalse + ' senza');
  return { ok: true };
}

/**
 * v4.25.13 — Trova profilati mancanti e recuperali nel foglio Utenti.
 * 1. Confronta ContactsMatrix + Sessioni_v1 + ProfiliPro con Utenti
 * 2. Aggiunge gli utenti mancanti
 * 3. Aggiorna OptInMatrix=true per chi ha compilato Matrix
 */
function recuperaProfilati() {
  Logger.log('=== RECUPERA PROFILATI ===');
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();

  // Raccogli tutti i profilati da fonti diverse
  var profilati = {}; // email → { fonte, responseId, nome }

  // ContactsMatrix
  var shC = ss.getSheetByName('ContactsMatrix');
  if (shC && shC.getLastRow() > 1) {
    var cV = shC.getDataRange().getValues(), cH = cV[0];
    var iCE = cH.indexOf('email'), iCR = cH.indexOf('response_id');
    for (var r = 1; r < cV.length; r++) {
      var em = String(cV[r][iCE]||'').trim().toLowerCase();
      if (em) profilati[em] = { fonte: 'ContactsMatrix', responseId: String(cV[r][iCR]||'') };
    }
  }
  Logger.log('ContactsMatrix: ' + Object.keys(profilati).length);

  // Sessioni_v1 con matrix_completato=true
  var shS = ss.getSheetByName('Sessioni_v1');
  if (shS && shS.getLastRow() > 1) {
    var sV = shS.getDataRange().getValues(), sH = sV[0];
    var iSE = sH.indexOf('email'), iSM = sH.indexOf('matrix_completato');
    for (var r = 1; r < sV.length; r++) {
      var em = String(sV[r][iSE]||'').trim().toLowerCase();
      var mx = sV[r][iSM];
      if (em && (mx === true || String(mx).toLowerCase() === 'true')) {
        if (!profilati[em]) profilati[em] = { fonte: 'Sessioni' };
        else profilati[em].fonte += '+Sessioni';
      }
    }
  }

  // ProfiliPro
  var shP = ss.getSheetByName('ProfiliPro');
  if (shP && shP.getLastRow() > 1) {
    var pV = shP.getDataRange().getValues(), pH = pV[0];
    var iPE = pH.indexOf('email');
    for (var r = 1; r < pV.length; r++) {
      var em = String(pV[r][iPE]||'').trim().toLowerCase();
      if (em) {
        if (!profilati[em]) profilati[em] = { fonte: 'ProfiliPro' };
        else profilati[em].fonte += '+ProfiliPro';
      }
    }
  }

  // ResponsesMatrix → nome museo via response_id
  var shR = ss.getSheetByName('ResponsesMatrix');
  var nomiMuseo = {};
  if (shR && shR.getLastRow() > 1) {
    var rV = shR.getDataRange().getValues(), rH = rV[0];
    var iRR = rH.indexOf('response_id'), iRN = rH.indexOf('museum_name');
    for (var r = 1; r < rV.length; r++) {
      var rid = String(rV[r][iRR]||'');
      var nome = String(rV[r][iRN]||'');
      if (rid && nome) nomiMuseo[rid] = nome;
    }
  }

  Logger.log('Profilati totali: ' + Object.keys(profilati).length);

  // Leggi Utenti
  var shU = ss.getSheetByName('Utenti');
  if (!shU) { Logger.log('Foglio Utenti non trovato!'); return { ok:false, error:'Utenti non trovato' }; }
  var uV = shU.getDataRange().getValues(), uH = uV[0];
  var iUE = uH.indexOf('Email'), iUM = uH.indexOf('OptInMatrix'), iUN = uH.indexOf('Nome');
  var utentiMap = {};
  for (var r = 1; r < uV.length; r++) {
    var em = String(uV[r][iUE]||'').trim().toLowerCase();
    if (em) utentiMap[em] = { row: r + 1, optInMatrix: uV[r][iUM], nome: String(uV[r][iUN]||'') };
  }

  var aggiunti = 0, aggiornati = 0;

  Object.keys(profilati).forEach(function(em) {
    var p = profilati[em];
    var nomeMuseo = p.responseId ? (nomiMuseo[p.responseId] || '') : '';

    if (!utentiMap[em]) {
      // MANCANTE: aggiungi riga in Utenti
      var id = 'U' + Date.now() + Math.floor(Math.random()*1000);
      var now = new Date().toISOString();
      shU.appendRow([id, em, nomeMuseo, 'lettore', 'attivo', true, false, true, now, '', 'recupero_profilati', 'Recuperato da ' + p.fonte]);
      Logger.log('AGGIUNTO: ' + em + ' (' + p.fonte + ')' + (nomeMuseo ? ' — ' + nomeMuseo : ''));
      aggiunti++;
    } else if (!utentiMap[em].optInMatrix || utentiMap[em].optInMatrix === false) {
      // PRESENTE ma OptInMatrix=false: aggiorna
      shU.getRange(utentiMap[em].row, iUM + 1).setValue(true);
      Logger.log('AGGIORNATO OptInMatrix: ' + em + ' (riga ' + utentiMap[em].row + ')');
      aggiornati++;
    }
  });

  SpreadsheetApp.flush();
  Logger.log('=== COMPLETATO: ' + aggiunti + ' aggiunti, ' + aggiornati + ' OptInMatrix aggiornati ===');
  return { ok: true, aggiunti: aggiunti, aggiornati: aggiornati, profilatiTotali: Object.keys(profilati).length };
}

function diagBandiRadarFields() {
  var bandi = getBandiRadar();
  var sample = bandi.slice(0, 5);
  var tipoCount = { vuoto: 0, finanziamento: 0, servizio_fornitura: 0, lavori: 0, altro: 0 };
  bandi.forEach(function(b) {
    var t = b.tipoBando || '';
    if (!t) tipoCount.vuoto++;
    else if (tipoCount[t] !== undefined) tipoCount[t]++;
    else tipoCount.altro++;
  });

  var result = {
    totale: bandi.length,
    tipoCount: tipoCount,
    campione: sample.map(function(b) {
      return {
        titolo: (b.titolo || '').substring(0, 40),
        tipoBando: b.tipoBando || '(VUOTO)',
        settoreCultura: b.settoreCultura || '(VUOTO)',
        cpv: b.cpv || '(VUOTO)',
        settore: b.settore || '(VUOTO)',
        regione: b.regione || '(VUOTO)'
      };
    })
  };

  // Verifica colonne nel foglio
  var sheet = getSheetRadar();
  if (sheet) {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var tipoBandoCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === 'TipoBando') { tipoBandoCol = i + 1; break; }
    }
    result.sheetHeaders = headers.map(function(h) { return String(h).trim(); });
    result.tipoBandoCol = tipoBandoCol;
    // Leggi un campione dalla colonna TipoBando
    if (tipoBandoCol > 0 && sheet.getLastRow() > 1) {
      var vals = sheet.getRange(2, tipoBandoCol, Math.min(5, sheet.getLastRow() - 1), 1).getValues();
      result.tipoBandoSample = vals.map(function(r) { return String(r[0] || ''); });
    }
  }

  Logger.log('diagBandiRadarFields: ' + JSON.stringify(result, null, 2));
  return result;
}


/**
 * Sprint 1.3 D2.5 (2026-05-01) — URL del foglio Drive principale (per pulsanti "Apri foglio").
 */
function getMainSheetUrl() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActive();
    return ss ? ss.getUrl() : '';
  } catch(e) { return ''; }
}

/**
 * Sprint 1.3 D2.5 (2026-05-01) — URL pubblico della webapp (per pannello Configurazione).
 */
function getWebAppUrl() {
  try { return ScriptApp.getService().getUrl() || ''; } catch(e) { return ''; }
}

/**
 * Sprint 1.3 D2.5 (2026-05-01) — Wrapper sicuro per migraBandiAmbito.
 * Se la funzione esiste nel codebase, la chiama. Altrimenti applica una
 * migrazione minimale basata su keyword sui titoli/settori.
 */
/**
 * Sprint 1.3 D2.5 (2026-05-01) — Diagnostica colonne RADAR.
 * Esegui dall'editor GAS per vedere quali colonne ha realmente il foglio.
 */
function inspectRadarHeaders() {
  try {
    var sh = getSheetRadar();
    if (!sh) { Logger.log('ERR: getSheetRadar() ritorna null'); return { error:'sheet null' }; }
    var lastCol = sh.getLastColumn();
    var lastRow = sh.getLastRow();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    Logger.log('=== HEADERS FOGLIO RADAR (file usato da getSheetRadar) ===');
    Logger.log('Nome foglio: ' + sh.getName());
    Logger.log('Righe totali: ' + lastRow + ' (escluso header: ' + (lastRow-1) + ')');
    Logger.log('Colonne totali: ' + lastCol);
    Logger.log('Headers:');
    headers.forEach(function(h, i) {
      Logger.log('  Col ' + (i+1) + ': "' + h + '"');
    });
    return { sheetName: sh.getName(), totRows: lastRow, totCols: lastCol, headers: headers };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

/**
 * Sprint 1.3 D2.5b (2026-05-01) — Diagnostica ENTRAMBI i file con foglio RADAR BANDI.
 * Identifica quale dei due file e' effettivamente in uso (quello con piu righe).
 */
/**
 * Sprint 1.3 D2.5c (2026-05-01) — One-shot: aggiunge colonna AMBITO al RADAR + esegue migrazione.
 * Idempotente.
 */
function setupAmbitoEmigra() {
  Logger.log('=== SETUP COLONNA AMBITO + MIGRAZIONE BANDI ===');
  try {
    var sh = getSheetRadar();
    if (!sh) return { error:'sheet RADAR non trovato' };
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var iAmbito = -1;
    var headersLow = headers.map(function(h){ return String(h||'').toLowerCase().trim(); });
    for (var i = 0; i < headersLow.length; i++) {
      if (headersLow[i] === 'ambito' || headersLow[i].indexOf('ambito') >= 0) {
        iAmbito = i; break;
      }
    }
    if (iAmbito < 0) {
      var newCol = lastCol + 1;
      sh.getRange(1, newCol).setValue('AMBITO')
        .setFontWeight('bold').setBackground('#0F2744').setFontColor('#fff');
      Logger.log('Colonna AMBITO creata in posizione ' + newCol);
    } else {
      Logger.log('Colonna AMBITO gia presente in posizione ' + (iAmbito+1) + ' ("' + headers[iAmbito] + '")');
    }
    Logger.log('--- Avvio migrazione ---');
    var res = migraBandiAmbito();
    Logger.log(JSON.stringify(res, null, 2));
    return { ok:true, columnSetup:'done', migration: res };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

/**
 * Sprint 1.3 D2.5d (2026-05-01) — AUDIT COMPLETO della struttura dati.
 * Stampa nel Log quale file/foglio usa effettivamente la webapp per ogni cosa.
 */
/**
 * Sprint 1.3 D2.5e (2026-05-01) — Ispeziona i fogli "vecchi" delle fonti
 * nel file principale per capire dove sono le fonti bandi reali.
 */
/**
 * Sprint 1.3 D2.5f (2026-05-01) — Recupera fonti bandi dal foglio "Fonti" (47 righe).
 * Importa nel foglio "FontiBandi" mappando colonne. Idempotente.
 */
/**
 * Sprint 1.3 D2.5g (2026-05-01) — Mostra le 47 righe del foglio "Fonti" + headers.
 */
function inspectFontiVecchieDettaglio() {
  Logger.log('=== INSPECT DETTAGLIO FOGLIO "Fonti" ===');
  try {
    var ss = getMainSS();
    var sh = ss.getSheetByName('Fonti');
    if (!sh) return { error:'foglio "Fonti" non trovato' };
    var rows = sh.getLastRow();
    var cols = sh.getLastColumn();
    Logger.log('Righe totali: ' + rows + ' · Colonne: ' + cols);
    if (cols === 0) return { error:'foglio vuoto' };
    var headers = sh.getRange(1, 1, 1, cols).getValues()[0];
    Logger.log('HEADERS:');
    headers.forEach(function(h, i) {
      Logger.log('  Col ' + (i+1) + ': "' + h + '"');
    });
    Logger.log('');
    Logger.log('PRIME 5 RIGHE DI ESEMPIO:');
    var sample = sh.getRange(2, 1, Math.min(5, rows-1), cols).getValues();
    sample.forEach(function(r, i) {
      Logger.log('  Riga ' + (i+2) + ':');
      r.forEach(function(c, j) {
        var s = String(c||'');
        if (s.length > 70) s = s.substring(0,70) + '…';
        Logger.log('     ' + headers[j] + ': ' + s);
      });
    });
    Logger.log('');
    Logger.log('CONTEGGIO ATTUALE FontiBandi:');
    var fb = ss.getSheetByName('FontiBandi');
    if (fb) {
      Logger.log('  Righe: ' + fb.getLastRow() + ' (escluso header: ' + (fb.getLastRow()-1) + ')');
    } else {
      Logger.log('  FONTIBANDI NON ESISTE');
    }
    return { ok:true, fontiHeaders: headers, fontiRows: rows-1, fontibandiRows: fb ? fb.getLastRow()-1 : 0 };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

function recuperaFontiVecchie() {
  Logger.log('=== RECUPERO FONTI VECCHIE da "Fonti" -> "FontiBandi" ===');
  try {
    var ss = getMainSS();
    var shVecchio = ss.getSheetByName('Fonti');
    if (!shVecchio) return { error:'foglio "Fonti" non trovato' };
    var rowsVecchio = shVecchio.getLastRow();
    if (rowsVecchio < 2) return { ok:true, importati:0, note:'foglio "Fonti" vuoto' };
    var headersVecchio = shVecchio.getRange(1,1,1,shVecchio.getLastColumn()).getValues()[0];
    var headersLow = headersVecchio.map(function(h){ return String(h||'').toLowerCase().trim(); });
    var iNome  = _findIdx_(headersLow, ['nome','name','denominazione']);
    var iUrl   = _findIdx_(headersLow, ['url','link','feed']);
    var iCat   = _findIdx_(headersLow, ['categoria','category','tipologia','tipo']);
    var iAtt   = _findIdx_(headersLow, ['attiva','active','attivo','enabled']);
    var iNote  = _findIdx_(headersLow, ['note','notes','descrizione']);
    Logger.log('Indici colonne foglio Fonti: nome=' + iNome + ' url=' + iUrl + ' cat=' + iCat + ' att=' + iAtt + ' note=' + iNote);
    if (iNome < 0 || iUrl < 0) {
      return { error:'foglio "Fonti": colonne nome o url non trovate. Headers: ' + headersVecchio.join(', ') };
    }
    var dataVecchio = shVecchio.getRange(2, 1, rowsVecchio-1, headersVecchio.length).getValues();
    var shNuovo;
    try {
      shNuovo = ss.getSheetByName('FontiBandi');
      if (!shNuovo) shNuovo = _createFontiBandiSheet(ss);
    } catch(e) { return { error:'errore apertura FontiBandi: ' + e.message }; }
    var existingUrls = new Set();
    if (shNuovo.getLastRow() > 1) {
      var existRows = shNuovo.getRange(2, 1, shNuovo.getLastRow()-1, shNuovo.getLastColumn()).getValues();
      var headersNuovo = shNuovo.getRange(1,1,1,shNuovo.getLastColumn()).getValues()[0];
      var iUrlNuovo = headersNuovo.indexOf('URL');
      if (iUrlNuovo >= 0) {
        existRows.forEach(function(r){ if (r[iUrlNuovo]) existingUrls.add(String(r[iUrlNuovo]).trim()); });
      }
    }
    var importati = 0, skipped = 0, errori = 0;
    dataVecchio.forEach(function(r, i) {
      try {
        var url = String(r[iUrl]||'').trim();
        if (!url) return;
        if (existingUrls.has(url)) { skipped++; return; }
        var nome = String(r[iNome]||'').trim() || ('Fonte ' + (i+1));
        var cat  = iCat >= 0 ? String(r[iCat]||'') : '';
        var att  = iAtt >= 0 ? (r[iAtt] === true || r[iAtt] === 1 || String(r[iAtt]).toLowerCase() === 'true' || String(r[iAtt]).toLowerCase() === 'si') : true;
        var note = iNote >= 0 ? String(r[iNote]||'') : 'Importato da foglio "Fonti" il ' + new Date().toISOString().substring(0,10);
        var id = 'FB' + Date.now() + '_' + i;
        shNuovo.appendRow([id, nome, url, cat, att, note]);
        existingUrls.add(url);
        importati++;
      } catch(e) {
        errori++;
        Logger.log('Errore riga ' + (i+2) + ': ' + e.message);
      }
    });
    Logger.log('=== Importazione completata: ' + importati + ' importati, ' + skipped + ' gia presenti, ' + errori + ' errori ===');
    return { ok:true, importati: importati, skipped: skipped, errori: errori };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

function _findIdx_(headersLow, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headersLow.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

function inspectFogliFontiVecchi() {
  Logger.log('=== INSPECT FOGLI FONTI VECCHI ===');
  try {
    var ss = getMainSS();
    Logger.log('File: ' + ss.getName() + ' (id ' + ss.getId() + ')');
    var fogliDaIspezionare = ['Fonti','FontiBandi','FontiPodcast','SocialFonti','Bandi'];
    fogliDaIspezionare.forEach(function(name) {
      Logger.log('');
      Logger.log('--- Foglio "' + name + '" ---');
      var sh = ss.getSheetByName(name);
      if (!sh) { Logger.log('  Non esiste'); return; }
      var rows = sh.getLastRow();
      var cols = sh.getLastColumn();
      Logger.log('  Righe: ' + rows + ' · Colonne: ' + cols);
      if (cols === 0) return;
      var headers = sh.getRange(1, 1, 1, cols).getValues()[0];
      Logger.log('  Headers: [' + headers.map(function(h){return '"'+h+'"';}).join(', ') + ']');
      if (rows > 1) {
        var sample = sh.getRange(2, 1, Math.min(3, rows-1), cols).getValues();
        sample.forEach(function(r, i) {
          Logger.log('  Riga ' + (i+2) + ': ' + r.map(function(c){
            var s = String(c||''); return s.length > 60 ? s.substring(0,60)+'…' : s;
          }).join(' | '));
        });
      }
    });
    Logger.log('');
    Logger.log('=== FINE ===');
    return { ok:true };
  } catch(e) {
    Logger.log('ERR: ' + e.message);
    return { error: e.message };
  }
}

function auditFullSystem() {
  Logger.log('================================================================');
  Logger.log('=== AUDIT COMPLETO STRUTTURA DATI OSSERVATORIO CULTURALE ===');
  Logger.log('================================================================');
  var report = {};
  var FILE_STANDALONE = '1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0';
  var FILE_PRINCIPALE = '15TgAkxCTTMdfSHjk4AoXt8Fh6TRVnvzW5FVRQSMO5Xk';

  Logger.log('');
  Logger.log('▸ getMainSS() — file usato per FontiBandi/FontiPodcast/Items/Podcast/MailingList');
  try {
    var ss = getMainSS();
    var mainId = ss.getId();
    Logger.log('   Nome file: ' + ss.getName());
    Logger.log('   ID: ' + mainId);
    Logger.log('   URL: ' + ss.getUrl());
    Logger.log('   = file standalone? ' + (mainId === FILE_STANDALONE ? 'SI' : 'NO'));
    Logger.log('   = file principale? ' + (mainId === FILE_PRINCIPALE ? 'SI' : 'NO'));
    report.mainSS = { id: mainId, name: ss.getName(), url: ss.getUrl() };
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ getSheetRadar() — foglio usato per leggere i bandi RADAR');
  try {
    var sh = getSheetRadar();
    var radarSS = sh.getParent();
    Logger.log('   Nome foglio: ' + sh.getName());
    Logger.log('   Righe (escluso header): ' + (sh.getLastRow() - 1));
    Logger.log('   File contenitore: ' + radarSS.getName());
    Logger.log('   ID file: ' + radarSS.getId());
    Logger.log('   = file standalone? ' + (radarSS.getId() === FILE_STANDALONE ? 'SI' : 'NO'));
    Logger.log('   = file principale? ' + (radarSS.getId() === FILE_PRINCIPALE ? 'SI' : 'NO'));
    Logger.log('   = STESSO file di getMainSS()? ' + (report.mainSS && radarSS.getId() === report.mainSS.id ? 'SI' : 'NO'));
    report.radarSheet = { id: radarSS.getId(), name: radarSS.getName(), sheetName: sh.getName(), rows: sh.getLastRow()-1 };
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ Foglio FontiBandi (gestito via getMainSS)');
  try {
    var fb = report.mainSS ? SpreadsheetApp.openById(report.mainSS.id).getSheetByName('FontiBandi') : null;
    if (fb) {
      Logger.log('   Foglio "FontiBandi" trovato in: ' + report.mainSS.name);
      Logger.log('   Righe (escluso header): ' + (fb.getLastRow() - 1));
      report.fontiBandiCount = fb.getLastRow() - 1;
    } else {
      Logger.log('   FOGLIO "FontiBandi" NON ESISTE nel file principale');
      report.fontiBandiCount = 0;
    }
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ Fonti bandi: hardcoded vs foglio dinamico');
  try {
    var nHardcoded = (typeof TUTTE_LE_FONTI_BANDI !== 'undefined') ? TUTTE_LE_FONTI_BANDI.length : 'undefined';
    Logger.log('   Fonti hardcoded in TUTTE_LE_FONTI_BANDI (Scannerbandi.gs): ' + nHardcoded);
    Logger.log('   Fonti nel foglio FontiBandi (UI Impostazioni mostra queste): ' + (report.fontiBandiCount || 0));
    if (nHardcoded !== 'undefined' && nHardcoded !== (report.fontiBandiCount || 0)) {
      Logger.log('   ⚠ DISCORDANZA: lo scanner usa quelle hardcoded, non quelle del foglio!');
    }
    report.fontiHardcoded = nHardcoded;
  } catch(e) { Logger.log('   ERR: ' + e.message); }

  Logger.log('');
  Logger.log('▸ Apertura diretta dei 2 file noti');
  [{id:FILE_STANDALONE, label:'STANDALONE (hardcoded in getSheetRadar)'},
   {id:FILE_PRINCIPALE, label:'PRINCIPALE (Osservatorio Culturale)'}].forEach(function(f){
    try {
      var s = SpreadsheetApp.openById(f.id);
      var sheets = s.getSheets();
      Logger.log('   ' + f.label);
      Logger.log('     Nome: ' + s.getName() + ' · ID: ' + f.id);
      Logger.log('     Numero fogli: ' + sheets.length);
      sheets.forEach(function(sh){
        Logger.log('       ▸ "' + sh.getName() + '": ' + sh.getLastRow() + ' righe');
      });
    } catch(e) { Logger.log('   ' + f.label + ': ERR ' + e.message); }
  });

  Logger.log('');
  Logger.log('=== FINE AUDIT ===');
  return report;
}

function inspectAllRadarSheets() {
  Logger.log('=== INSPECT ALL RADAR FILES ===');
  var fileIds = [
    { id:'1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0', label:'File standalone "RADAR BANDI"' },
    { id:'15TgAkxCTTMdfSHjk4AoXt8Fh6TRVnvzW5FVRQSMO5Xk', label:'File principale "Osservatorio Culturale"' }
  ];
  var results = [];
  fileIds.forEach(function(f) {
    Logger.log('');
    Logger.log('--- ' + f.label + ' (id=' + f.id + ') ---');
    try {
      var ss = SpreadsheetApp.openById(f.id);
      var sheets = ss.getSheets();
      Logger.log('  Nome file: ' + ss.getName());
      Logger.log('  Numero fogli: ' + sheets.length);
      var radarInfo = null;
      sheets.forEach(function(sh) {
        var name = sh.getName();
        var rows = sh.getLastRow();
        var cols = sh.getLastColumn();
        Logger.log('    ▸ Foglio "' + name + '": ' + rows + ' righe x ' + cols + ' colonne');
        if (/radar|bandi/i.test(name) && cols > 0) {
          var headers = sh.getRange(1,1,1,cols).getValues()[0];
          Logger.log('       Headers: [' + headers.map(function(h){return '"'+h+'"';}).join(', ') + ']');
          var hasAmbito = headers.some(function(h){ return /^(ambito|amb)/i.test(String(h||'').trim()); });
          Logger.log('       Colonna ambito presente: ' + (hasAmbito ? 'SI' : 'NO'));
          radarInfo = { sheetName: name, rows: rows, cols: cols, headers: headers, hasAmbito: hasAmbito };
        }
      });
      results.push({ fileId: f.id, label: f.label, fileName: ss.getName(), totSheets: sheets.length, radar: radarInfo });
    } catch(e) {
      Logger.log('  ERR apertura file: ' + e.message);
      results.push({ fileId: f.id, label: f.label, error: e.message });
    }
  });
  Logger.log('');
  Logger.log('=== RIEPILOGO ===');
  results.forEach(function(r) {
    if (r.error) Logger.log(r.label + ': ERRORE ' + r.error);
    else if (r.radar) Logger.log(r.label + ': foglio "' + r.radar.sheetName + '" con ' + (r.radar.rows-1) + ' bandi · AMBITO=' + (r.radar.hasAmbito?'SI':'NO'));
    else Logger.log(r.label + ': nessun foglio "radar/bandi" trovato');
  });
  return results;
}

function migraBandiAmbito() {
  try {
    if (typeof _migraBandiAmbitoLegacy === 'function') {
      return _migraBandiAmbitoLegacy();
    }
  } catch(e) {}

  try {
    var sh = getSheetRadar();
    if (!sh) return { error:'sheet RADAR non trovato' };
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) return { ok:true, aggiornati:0, saltati:0, note:'foglio vuoto' };
    var headers = sh.getRange(1,1,1,lastCol).getValues()[0];

    // Sprint 1.3 (2026-05-01) FIX: ricerca tollerante della colonna ambito
    var iAmbito = -1;
    var candidates = [
      'AMBITO','Ambito','ambito',
      'AMBITO_ID','AmbitoId','AmbitoID','AMBITO ID','Ambito ID',
      'AMB','Amb','amb','AMBITO_NUM','AmbitoNum','Ambito Num',
      'Ambito Strategico','Ambito strategico','AMBITO STRATEGICO',
      'Tema','TEMA','Tema Strategico','Tema strategico',
      'Categoria','CATEGORIA','Categoria Tematica','Categoria tematica',
      'Macro Ambito','Macro ambito','MacroAmbito',
      'Area','AREA','Area Tematica','Area tematica'
    ];
    var headersLow = headers.map(function(h){ return String(h||'').toLowerCase().trim(); });
    for (var c = 0; c < candidates.length; c++) {
      var idx = headersLow.indexOf(candidates[c].toLowerCase());
      if (idx >= 0) { iAmbito = idx; break; }
    }
    // Fallback: cerca substring "ambit" (matcha sia "ambito" sia "ambiti")
    if (iAmbito < 0) {
      for (var h = 0; h < headersLow.length; h++) {
        if (headersLow[h].indexOf('ambit') >= 0) { iAmbito = h; Logger.log('Match per substring "ambit": col ' + (h+1) + ' "' + headers[h] + '"'); break; }
      }
    }
    if (iAmbito < 0) {
      var headerList = headers.map(function(h, i){ return (i+1)+':"'+h+'"'; }).join(', ');
      return {
        error: 'Colonna AMBITO non trovata. Headers attuali: ' + headerList +
               '. Soluzione: apri il foglio RADAR (vedi URL via getMainSheetUrl), aggiungi una colonna chiamata esattamente "AMBITO" (maiuscolo) e riprova.'
      };
    }
    Logger.log('Colonna ambito trovata: ' + headers[iAmbito] + ' (col ' + (iAmbito+1) + ')');
    var iTit = headers.indexOf('TITOLO'); if (iTit < 0) iTit = headers.indexOf('Titolo');
    var iSet = headers.indexOf('SETTORE'); if (iSet < 0) iSet = headers.indexOf('Settore');
    var iNote = headers.indexOf('NOTE'); if (iNote < 0) iNote = headers.indexOf('Note');
    var data = sh.getRange(2, 1, lastRow-1, lastCol).getValues();
    var rules = [
      { amb:2, kw:['accessib','disabil','easy-to-read','e2r','barrier','inclus','sensoriale','tattile','autismo','alzheimer','sordo','non vedente','lis '] },
      { amb:5, kw:['digital','ai ','intelligenza artificiale','machine learning','metaverso','realta virtuale','realta aumentata','open data','cloud','nft','blockchain','digitalizzazione','governance','fundraising','sponsor','art bonus','europa creativa','horizon','erasmus','pnrr'] },
      { amb:4, kw:['welfare','comunita','partecipazione','cocreation','crowdsourcing','citizen science','quartiere','rigenerazione urbana','audience','community','arte terapia','ospedale','carcere','quartieri','periferia'] },
      { amb:3, kw:['mostra','allestimento','esposiz','curatela','collezion','catalogazione','iccd','restauro','conservazione','patrimonio','ricerca','didattica','educat','laborator','workshop','servizi al visitatore','membership','ticketing','accoglienza'] },
      { amb:1, kw:['identita','marca','brand','rebranding','posizionamento','storytelling','narrazione','vision','missione','manifesto culturale'] }
    ];
    var aggiornati = 0, saltati = 0;
    for (var i = 0; i < data.length; i++) {
      var attuale = data[i][iAmbito];
      if (attuale && String(attuale).trim() !== '' && Number(attuale) >= 1 && Number(attuale) <= 5) { saltati++; continue; }
      var text = ((iTit>=0?String(data[i][iTit]||''):'') + ' ' + (iSet>=0?String(data[i][iSet]||''):'') + ' ' + (iNote>=0?String(data[i][iNote]||''):'')).toLowerCase();
      var assigned = 0;
      for (var r = 0; r < rules.length; r++) {
        var matched = rules[r].kw.some(function(k){ return text.indexOf(k) >= 0; });
        if (matched) { assigned = rules[r].amb; break; }
      }
      if (!assigned) assigned = 3;
      sh.getRange(i+2, iAmbito+1).setValue(assigned);
      aggiornati++;
    }
    return { ok:true, aggiornati: aggiornati, saltati: saltati };
  } catch(e) {
    return { error: e.message };
  }
}

/**
 * Sprint 1.3 (2026-05-01) — Test scan di una singola fonte bandi.
 * Verifica raggiungibilita HTTP e ritorna riepilogo (no salvataggio nuovi bandi).
 * @param {string} id  ID fonte
 * @return {Object} { ok, status, contentLength, error?, fonte? }
 */

function debugProps() {
  const p=PropertiesService.getScriptProperties().getProperties();
  Logger.log('SHEET_ID: '+p.SHEET_ID); Logger.log('ADMIN_PASSWORD: '+p.ADMIN_PASSWORD);
  Logger.log('CLAUDE_API_KEY: '+(p.CLAUDE_API_KEY?'SI':'NO'));
}

function testGetBandiRadar() {
  const bandi=getBandiRadar();
  Logger.log('Totale: '+bandi.length+' | Attivi: '+bandi.filter(b=>b.statoRecord!=='archiviato').length+' | Archiviati: '+bandi.filter(b=>b.statoRecord==='archiviato').length);
}