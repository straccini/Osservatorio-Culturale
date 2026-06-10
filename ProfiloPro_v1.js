/**
 * ============================================================================
 *  ProfiloPro_v1.js — Profilo Professionale lettore (v4.19.0)
 * ============================================================================
 *  2026-05-30 — Modulo autocontenuto (costanti embed, zero dipendenze esterne
 *  a livello globale). Tutte le dipendenze sono chiamate DENTRO le funzioni.
 * ============================================================================
 */

// Costanti embed (evita dipendenza da Constants.js a livello di caricamento)
var PROFILO_PRO_SHEET = 'ProfiliPro';
// Categorie professionali con sottocategorie (la sottocategoria si sblocca in base alla categoria)
var _PRO_CATEGORIE = {
  'Direzione e management': ['Direttore/Direttrice','Vicedirettore','Responsabile amministrativo','Segretario generale','Coordinatore di area'],
  'Conservazione e patrimonio': ['Curatore/Curatrice','Conservatore/Restauratore','Registrar','Catalogatore','Responsabile collezioni'],
  'Educazione e mediazione': ['Educatore museale','Mediatore culturale','Responsabile didattica','Operatore laboratori','Guida/Accompagnatore'],
  'Comunicazione e pubblici': ['Responsabile comunicazione','Social media manager','Ufficio stampa','Grafico/Visual designer','Fundraiser'],
  'Tecnologie e digitale': ['Responsabile digitale','Sviluppatore/Web designer','Data analyst','Esperto multimedia','Responsabile IT'],
  'Servizi e accoglienza': ['Responsabile servizi al pubblico','Operatore di sala','Biglietteria','Bookshop manager','Custode/Guardiano'],
  'Progettazione e allestimenti': ['Museografo/Allestitore','Architetto museale','Lighting designer','Progettista culturale','Exhibition designer'],
  'Ricerca e formazione': ['Ricercatore/Docente universitario','Dottorando','Borsista/Assegnista','Formatore','Studente'],
  'Pubblica Amministrazione': ['Funzionario beni culturali','Dirigente ente locale','Assessore/Consigliere','Responsabile cultura','Funzionario regionale'],
  'Consulenza e libera professione': ['Consulente strategico','Progettista bandi','Consulente accessibilita','Consulente digitale','Consulente gestionale'],
  'Altro': ['Volontario','Tirocinante','Appassionato','Giornalista culturale','Altro']
};
var _PRO_ENTI = {
  'Istituzione museale': ['Museo statale','Museo civico','Museo diocesano','Museo privato','Ecomuseo','Museo universitario'],
  'Ente pubblico': ['Comune','Provincia/Citta metropolitana','Regione','Soprintendenza','Ministero della Cultura'],
  'Fondazione e non profit': ['Fondazione di partecipazione','Fondazione bancaria','Fondazione privata','Associazione culturale','Cooperativa sociale'],
  'Impresa e servizi': ['Impresa culturale','Startup innovativa','Societa di servizi museali','Studio professionale','Agenzia di comunicazione'],
  'Formazione e ricerca': ['Universita','Accademia di Belle Arti','Scuola di specializzazione','Centro di ricerca','Istituto di formazione'],
  'Reti e sistemi': ['Sistema museale regionale','Rete museale tematica','Distretto culturale','DMO/DMC turistica','Consorzio culturale'],
  'Altro': ['Altro ente','Privato cittadino']
};
var _PRO_DIM_STRUTTURA = ['Micro','Piccola','Media','Grande'];
var _PRO_SENIORITY = ['<3 anni','3-10 anni','10-20 anni','>20 anni'];
var _PRO_DIM_HELP = {
  D1:{titolo:'Identita e marca',desc:'Branding e identita visiva museale, naming, posizionamento, reputazione e storytelling istituzionale.',
    temi:['Branding e identita visiva museale','Naming e posizionamento','Reputazione e brand del territorio','Storytelling istituzionale']},
  D2:{titolo:'Patrimonio e collezioni',desc:'Catalogazione, conservazione, digitalizzazione, prestiti, ricerca e provenienza.',
    temi:['Catalogazione e inventari','Conservazione e restauro','Digitalizzazione e open data del patrimonio','Prestiti e movimentazione','Ricerca e provenienza']},
  D3:{titolo:'Spazi e allestimenti',desc:'Museografia, illuminotecnica, segnaletica, riallestimenti e sostenibilita espositiva.',
    temi:['Museografia e progettazione espositiva','Illuminotecnica','Segnaletica e wayfinding','Riallestimenti e nuovi percorsi','Sostenibilita degli allestimenti']},
  D4:{titolo:'Programma educativo',desc:'Didattica scuole, laboratori famiglie, BES, formazione insegnanti, educazione al patrimonio.',
    temi:['Didattica per le scuole','Laboratori e attivita famiglie','Programmi per BES e fragilita','Formazione insegnanti','Educazione al patrimonio']},
  D5:{titolo:'Servizi al visitatore',desc:'Accoglienza, biglietteria, bookshop, membership e qualita dell esperienza.',
    temi:['Accoglienza e front office','Biglietteria e prenotazioni','Bookshop e servizi aggiuntivi','Membership e fidelizzazione','Qualita dell esperienza']},
  D6:{titolo:'Maturita digitale',desc:'AI applicata, app, analytics, realta aumentata/virtuale e trasformazione digitale.',
    temi:['Intelligenza artificiale applicata','App e web app per il pubblico','Analytics e dati di visita','Realta aumentata / virtuale','Innovazione e trasformazione digitale']},
  D7:{titolo:'Accessibilita',desc:'Accessibilita fisica e sensoriale, LIS, CAA, easy-to-read, percorsi cognitivi e progettazione universale.',
    temi:['Accessibilita fisica e sensoriale','LIS e audiodescrizioni','CAA ed easy-to-read','Percorsi cognitivi e inclusione','Progettazione universale']},
  D8:{titolo:'Audience engagement',desc:'Audience development, partecipazione, social media, pubblici giovani e edutainment.',
    temi:['Audience development','Partecipazione e co-creazione','Social media e community','Pubblici giovani e nuovi pubblici','Edutainment']},
  D9:{titolo:'Governance',desc:'Modelli gestionali, bandi e fondi UE/PNRR, reti museali, sostenibilita economica e PPP.',
    temi:['Modelli gestionali e forme giuridiche','Bandi, PNRR e fondi UE','Reti e sistemi museali','Sostenibilita economica','Partenariati pubblico-privato']},
  D10:{titolo:'Welfare culturale',desc:'Cultura e salute, impatto sociale, cultura di comunita, coesione e presidio territoriale.',
    temi:['Cultura e salute / benessere','Impatto sociale e valutazione','Cultura di comunita','Coesione e inclusione sociale','Cultura come presidio territoriale']}
};
var _PRO_DIM_BY_RUOLO = {
  'Direttore':['D1','D9','D10'],'Curatore':['D2','D3'],
  'Educatore/Mediatore':['D4','D7','D8'],'Comunicazione/Marketing':['D1','D8'],
  'Funzionario PA':['D9','D10'],'Libero professionista/Consulente':['D6','D9'],
  'Ricercatore/Docente':['D2','D4'],'Studente':['D4','D8'],'Altro':[]
};

// ============================================================================
// BOOTSTRAP
// ============================================================================

function ensureSheetProfiliPro_() {
  var ss = getMainSS();
  var sh = ss.getSheetByName(PROFILO_PRO_SHEET);
  if (sh) { return { ok:true, action:'exists', rows:sh.getLastRow()-1 }; }
  var h = ['profileId','email','categoria_pro','ruolo_funzione','categoria_ente','tipo_ente','area_geografica',
    'dimensione_struttura','seniority','interessi_dimensioni','completezza',
    'consenso_profilazione','consenso_ts','dataCreazione','dataAggiornamento',
    'note_libere','q_visitatori','q_staff','q_ai','q_accessibilita'];
  sh = ss.insertSheet(PROFILO_PRO_SHEET);
  sh.getRange(1,1,1,h.length).setValues([h]);
  sh.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#EDE7F6');
  sh.setFrozenRows(1);
  return { ok:true, action:'created', columns:h.length };
}

// ============================================================================
// FUNZIONI PUBBLICHE
// ============================================================================

function getProfilo(token) {
  var user = _proGetUser_(token);
  if (!user) return null;
  return _proFindByEmail_(user.email);
}

function saveProfilo(payload) {
  payload = payload || {};
  // v4.24.6 — token di sessione dal frontend (deploy anonimo: niente Session.getActiveUser)
  var _tok = payload.__token || null;
  try { delete payload.__token; } catch(_){}
  var user = _proGetUser_(_tok);
  if (!user) return { ok:false, error:'Accesso non autorizzato. Effettua il login.' };
  var existing = _proFindByEmail_(user.email);
  if (!existing && payload.consenso_profilazione !== true) {
    return { ok:false, error:'Il consenso alla profilazione e necessario per salvare il profilo.' };
  }
  var errori = _proValidate_(payload);
  if (errori.length > 0) return { ok:false, error:errori.join('; ') };
  var interessi = '';
  if (Array.isArray(payload.interessi_dimensioni)) {
    interessi = payload.interessi_dimensioni.filter(function(d){ return /^D(10|[1-9])$/.test(d); }).join(',');
  } else if (typeof payload.interessi_dimensioni === 'string') {
    interessi = payload.interessi_dimensioni.split(',').map(function(s){return s.trim();})
      .filter(function(d){ return /^D(10|[1-9])$/.test(d); }).join(',');
  }
  var completezza = _proCalcCompletezza_(payload, interessi);
  var ss = getMainSS();
  var sh = ss.getSheetByName(PROFILO_PRO_SHEET);
  if (!sh) { ensureSheetProfiliPro_(); sh = ss.getSheetByName(PROFILO_PRO_SHEET); }
  var isNew = !existing;
  var now = new Date().toISOString();
  var profileId = existing ? existing.profileId : Utilities.getUuid();
  var notaLibera = _sanitizeForCell_(String(payload.note_libere||'').substring(0,2000));
  var rowData = [profileId, user.email, _sanitizeForCell_(payload.categoria_pro||''), _sanitizeForCell_(payload.ruolo_funzione||''),
    _sanitizeForCell_(payload.categoria_ente||''), _sanitizeForCell_(payload.tipo_ente||''),
    _sanitizeForCell_(payload.area_geografica||''), _sanitizeForCell_(payload.dimensione_struttura||''), _sanitizeForCell_(payload.seniority||''),
    interessi, completezza, payload.consenso_profilazione===true,
    payload.consenso_profilazione===true ? now : (existing ? existing.consenso_ts : ''),
    existing ? existing.dataCreazione : now, now,
    notaLibera, _sanitizeForCell_(payload.q_visitatori||''), _sanitizeForCell_(payload.q_staff||''), _sanitizeForCell_(payload.q_ai||''), _sanitizeForCell_(payload.q_accessibilita||'')];
  if (isNew) { sh.appendRow(rowData); }
  else {
    var data = sh.getDataRange().getValues();
    for (var r=1; r<data.length; r++) {
      if (String(data[r][1]).toLowerCase() === user.email.toLowerCase()) {
        sh.getRange(r+1, 1, 1, rowData.length).setValues([rowData]); break;
      }
    }
  }
  _proSyncOptIn_(user.email, interessi);
  if (typeof crm_recordEvent === 'function') {
    try {
      var rid = _proGetResponseId_(user.email);
      if (rid) crm_recordEvent(rid, 'profilo_salvato', isNew?10:2, {completezza:completezza});
    } catch(e){}
  }
  return { ok:true, profileId:profileId, completezza:completezza, isNew:isNew };
}

function deleteProfilo() {
  var user = _proGetUser_();
  if (!user) return { ok:false, error:'Accesso non autorizzato.' };
  var ss = getMainSS();
  var sh = ss.getSheetByName(PROFILO_PRO_SHEET);
  if (!sh) return { ok:true };
  var data = sh.getDataRange().getValues();
  for (var r=1; r<data.length; r++) {
    if (String(data[r][1]).toLowerCase() === user.email.toLowerCase()) {
      sh.deleteRow(r+1); break;
    }
  }
  // v4.20 — Purga diretta fogli GDPR (utente gia autenticato da _proGetUser_)
  var emailLower = String(user.email).toLowerCase().trim();
  try {
    var ssPurge = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    ['ResponsesMatrix','ContactsMatrix','CRM_Leads','MailingList','ProfiloPro'].forEach(function(shName){
      var shPurge = ssPurge.getSheetByName(shName);
      if (!shPurge) return;
      var dataPurge = shPurge.getDataRange().getValues();
      var head = dataPurge[0].map(function(h){ return String(h||'').toLowerCase().trim(); });
      var iEmail = -1;
      ['email','e-mail','emailutente'].forEach(function(c){ var idx = head.indexOf(c); if (idx >= 0) iEmail = idx; });
      if (iEmail < 0) return;
      for (var rp = dataPurge.length - 1; rp >= 1; rp--) {
        if (String(dataPurge[rp][iEmail]||'').toLowerCase().trim() === emailLower) {
          shPurge.deleteRow(rp + 1);
        }
      }
    });
  } catch(ePurge) { Logger.log('deleteProfilo purge GDPR: ' + (ePurge && ePurge.message)); }
  return { ok:true };
}

function getDimHelp() { return _PRO_DIM_HELP; }

function getEnumProfilo() {
  return { categorie:_PRO_CATEGORIE, enti:_PRO_ENTI, dimensioneStruttura:_PRO_DIM_STRUTTURA,
    seniority:_PRO_SENIORITY, ambiti:(typeof OC_AMBITI!=='undefined'?OC_AMBITI:[]), dimHelp:_PRO_DIM_HELP };
}

function suggestDimensioniByRuolo(ruolo) {
  if (!ruolo) return [];
  return _PRO_DIM_BY_RUOLO[ruolo] || [];
}

function getProfiloDashboard() {
  var user = _proGetUser_();
  if (!user) return { ok:false, error:'Non autorizzato.' };
  var ss = getMainSS();
  var sh = ss.getSheetByName(PROFILO_PRO_SHEET);
  if (!sh || sh.getLastRow()<2) return { ok:true, totale:0, completezzaMedia:0, distribuzione:{ruoli:{},enti:{},dimensioni:{},territori:{},interessi:{}} };
  var data = sh.getDataRange().getValues();
  var h = data[0];
  var iR=h.indexOf('ruolo_funzione'),iE=h.indexOf('tipo_ente'),iA=h.indexOf('area_geografica'),
      iD=h.indexOf('dimensione_struttura'),iI=h.indexOf('interessi_dimensioni'),iC=h.indexOf('completezza');
  var stats={ruoli:{},enti:{},dimensioni:{},territori:{},interessi:{}};
  var tot=0, sommC=0;
  for (var r=1; r<data.length; r++) {
    if (!data[r][1]) continue; tot++;
    var rv=String(data[r][iR]||'').trim(), ev=String(data[r][iE]||'').trim(),
        av=String(data[r][iA]||'').trim(), dv=String(data[r][iD]||'').trim(),
        iv=String(data[r][iI]||''), cv=Number(data[r][iC])||0;
    sommC+=cv;
    if(rv) stats.ruoli[rv]=(stats.ruoli[rv]||0)+1;
    if(ev) stats.enti[ev]=(stats.enti[ev]||0)+1;
    if(dv) stats.dimensioni[dv]=(stats.dimensioni[dv]||0)+1;
    if(av) { var reg=av.split(',')[0].trim(); stats.territori[reg]=(stats.territori[reg]||0)+1; }
    if(iv) iv.split(',').forEach(function(d){d=d.trim();if(d)stats.interessi[d]=(stats.interessi[d]||0)+1;});
  }
  return { ok:true, totale:tot, completezzaMedia:tot>0?Math.round(sommC/tot):0, distribuzione:stats };
}

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

function _proGetUser_(token) {
  if (typeof getRuoloCorrente !== 'function') return null;
  try {
    // v4.24.6 — Con deploy ANONIMO Session.getActiveUser() e VUOTO: l'identita
    // DEVE arrivare dal token di sessione passato dal frontend, altrimenti
    // "Accesso non autorizzato" anche con sessione valida.
    var user = getRuoloCorrente(token || null, token || null);
    if (!user || !user.email || (user.livello||0) < 1) return null;
    return user;
  } catch(e) { return null; }
}

function _proFindByEmail_(email) {
  var ss = getMainSS();
  var sh = ss.getSheetByName(PROFILO_PRO_SHEET);
  if (!sh || sh.getLastRow()<2) return null;
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var emailLc = String(email).trim().toLowerCase();
  for (var r=1; r<data.length; r++) {
    if (String(data[r][1]).trim().toLowerCase() === emailLc) {
      var obj = {};
      for (var c=0; c<headers.length; c++) obj[headers[c]] = data[r][c];
      return obj;
    }
  }
  return null;
}

function _proValidate_(payload) {
  var err = [];
  // Valida categoria (chiave di _PRO_CATEGORIE)
  if (payload.categoria_pro && !_PRO_CATEGORIE[payload.categoria_pro]) err.push('Categoria professionale non valida');
  // Valida sottocategoria (deve appartenere alla categoria)
  if (payload.ruolo_funzione && payload.categoria_pro && _PRO_CATEGORIE[payload.categoria_pro]) {
    if (_PRO_CATEGORIE[payload.categoria_pro].indexOf(payload.ruolo_funzione)===-1) err.push('Ruolo non valido per la categoria selezionata');
  }
  // Valida categoria ente (chiave di _PRO_ENTI)
  if (payload.categoria_ente && !_PRO_ENTI[payload.categoria_ente]) err.push('Categoria ente non valida');
  if (payload.dimensione_struttura && _PRO_DIM_STRUTTURA.indexOf(payload.dimensione_struttura)===-1) err.push('Dimensione non valida');
  if (payload.seniority && _PRO_SENIORITY.indexOf(payload.seniority)===-1) err.push('Seniority non valida');
  return err;
}

function _proCalcCompletezza_(payload, interessi) {
  var tot=7, ok=0;
  if(payload.ruolo_funzione)ok++;
  if(payload.tipo_ente)ok++;
  if(payload.area_geografica)ok++;
  if(payload.dimensione_struttura)ok++;
  if(payload.seniority)ok++;
  if(interessi&&interessi.length>0)ok++;
  if(payload.consenso_profilazione===true)ok++;
  return Math.round((ok/tot)*100);
}

function _proSyncOptIn_(email, interessiCsv) {
  var ss = getMainSS();
  var sh = ss.getSheetByName('ContactsMatrix');
  if (!sh || sh.getLastRow()<2) return;
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iEmail = headers.indexOf('email');
  var iOptIn = headers.indexOf('preferences_json');
  if (iOptIn===-1) iOptIn = 7;
  if (iEmail===-1) return;
  var emailLc = String(email).trim().toLowerCase();
  var dims = interessiCsv ? interessiCsv.split(',') : [];
  for (var r=1; r<data.length; r++) {
    if (String(data[r][iEmail]).trim().toLowerCase() === emailLc) {
      var optIn = {};
      try { var raw=data[r][iOptIn]; if(raw&&typeof raw==='string') optIn=JSON.parse(raw); } catch(e){}
      optIn.dimensioni = dims;
      sh.getRange(r+1, iOptIn+1).setValue(JSON.stringify(optIn));
      return;
    }
  }
}

function _proGetResponseId_(email) {
  var ss = getMainSS();
  var sh = ss.getSheetByName('ContactsMatrix');
  if (!sh || sh.getLastRow()<2) return null;
  var data = sh.getDataRange().getValues();
  var h = data[0];
  var iE=h.indexOf('email'), iR=h.indexOf('response_id');
  if (iE===-1||iR===-1) return null;
  var emailLc = String(email).trim().toLowerCase();
  for (var r=1; r<data.length; r++) {
    if (String(data[r][iE]).trim().toLowerCase()===emailLc) return String(data[r][iR]||'');
  }
  return null;
}

/**
 * v4.24 — Toggle rapido di un ambito dai chip dell'area. Accende/spegne tutte le dim dell'ambito.
 * Richiede sessione valida (livello >= 1). Crea la riga profilo se assente (il toggle implica consenso esplicito).
 */
function setAmbitoInteresse(ambito, on, token) {
  try {
    var u = (typeof getRuoloCorrente === 'function') ? getRuoloCorrente(token || null, token || null) : null;
    if (!u || !u.email || Number(u.livello) < 1) return { ok:false, error:'forbidden' };
    var email = String(u.email).toLowerCase().trim();
    var ss = getMainSS();
    var sh = ss.getSheetByName(PROFILO_PRO_SHEET);
    if (!sh) { ensureSheetProfiliPro_(); sh = ss.getSheetByName(PROFILO_PRO_SHEET); }
    var data = sh.getDataRange().getValues();
    var h = data[0];
    var iEmail = h.indexOf('email'), iInt = h.indexOf('interessi_dimensioni'), iCons = h.indexOf('consenso_profilazione');
    var ambDims = (typeof dimsFromAmbiti === 'function') ? dimsFromAmbiti([Number(ambito)]) : [];
    if (!ambDims.length) return { ok:false, error:'ambito_non_valido' };
    var rowIdx = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][iEmail]).toLowerCase().trim() === email) { rowIdx = r; break; }
    }
    var cur = (rowIdx >= 0) ? String(data[rowIdx][iInt] || '').split(',').map(function(s){return s.trim();}).filter(Boolean) : [];
    var set = cur.reduce(function(m,d){ m[d.toUpperCase()] = true; return m; }, {});
    ambDims.forEach(function(d){ if (on) set[d.toUpperCase()] = true; else delete set[d.toUpperCase()]; });
    var newCsv = Object.keys(set).join(',');
    if (rowIdx >= 0) {
      sh.getRange(rowIdx+1, iInt+1).setValue(newCsv);
    } else {
      var pid = Utilities.getUuid(); var now = new Date().toISOString();
      var rowData = new Array(h.length).fill('');
      rowData[h.indexOf('profileId')] = pid; rowData[iEmail] = email; rowData[iInt] = newCsv;
      if (iCons >= 0) rowData[iCons] = true;
      sh.appendRow(rowData);
    }
    if (typeof _proSyncOptIn_ === 'function') _proSyncOptIn_(email, newCsv);
    return { ok:true, ambito:Number(ambito), on:!!on, ambiti:(typeof ambitiFromDims==='function'?ambitiFromDims(newCsv):[]) };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

/** v4.24 — Ritorna gli ambiti di interesse correnti dell'utente (per i chip dell'area). */
function getAmbitiInteresse(token) {
  try {
    var u = (typeof getRuoloCorrente === 'function') ? getRuoloCorrente(token || null, token || null) : null;
    if (!u || !u.email) return { ok:true, ambiti:[] };
    var ex = _proFindByEmail_(String(u.email).toLowerCase().trim());
    var dims = ex ? (ex.interessi_dimensioni || '') : '';
    return { ok:true, ambiti:(typeof ambitiFromDims==='function'?ambitiFromDims(dims):[]) };
  } catch(e) { return { ok:false, error:e.message }; }
}
