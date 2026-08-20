// ============================================================================
//  AgentAdmin.js — Endpoint admin + lettore per sistema agenti (v4.18.60)
// ----------------------------------------------------------------------------
//  Tutti gli endpoint chiamabili da frontend (admin card + workspace lettore).
//
//  Endpoint admin (richiedono ruolo admin):
//    getAgentSystemSummary()           panoramica completa stato
//    getAgentScanResultsList(opts)     lista risultati paginata
//    getProfiloAgentiList()            tabella ProfiloAgenti
//    quickScanAgente(agenteId, n)      scan limitato per popolare risultati
//    quickScanAllAgenti(maxFonti)      scan tutti gli agenti in sequenza
//    sendTestEmailAgente(ag, email)    invio test per singolo agente
//    addProfiloManuale(body)           aggiunge musei profilati
//    updateProfiloOptIn(body)          toggle opt-in
//    removeProfilo(email)              elimina profilo
//    getAgentConfigList()              ritorna la tassonomia 5 agenti per UI
//
//  Endpoint lettore (livello >=1):
//    getMyAgentiProfile(token)         leggi opt-in del lettore corrente
//    saveMyAgentiOptIn(token, body)    salva opt-in del lettore corrente
//    getMyAgentiContent(token)         contenuti agenti opt-in (anteprima webapp)
//
//  Autore: Claude (Cowork) per Silvano Straccini / Sinopia
// ============================================================================


// ============================================================================
// HELPERS DI GATING
// ============================================================================

function _requireAgentAdmin_() {
  if (typeof _isCurrentUserAdmin_ !== 'function' || !_isCurrentUserAdmin_()) {
    throw new Error('forbidden — solo admin');
  }
}

function _findProfiloRow_(emailLc) {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('ProfiloAgenti');
  if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getDataRange().getValues();
  var h = vals[0];
  var iEm = h.indexOf('Email');
  if (iEm < 0) return null;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][iEm] || '').toLowerCase() === emailLc) {
      return { sheet: sh, row: r + 1, header: h, values: vals[r] };
    }
  }
  return null;
}


// ============================================================================
// 1. PANORAMICA SISTEMA — usato dalla card admin (1 sola call)
// ============================================================================

function getAgentSystemSummary() {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }

  try {
    var diag = (typeof diagnosticaAgenti === 'function') ? diagnosticaAgenti() : { ok:false, error:'diagnosticaAgenti mancante' };
    var stats = (typeof getAgentEmailStats === 'function') ? getAgentEmailStats() : null;
    var cfg = (typeof getAllAgents === 'function') ? getAllAgents() : [];

    // Per ogni agente, calcola contenuti ultimo scan + ultimo invio
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var perAgente = {};
    cfg.forEach(function(a){
      perAgente[a.id] = {
        id: a.id, codice: a.codice, nome: a.nome, nomeBreve: a.nomeBreve,
        descrizione: a.descrizione, color: a.color, icon: a.icon,
        scanFreq: a.scanFrequenza, emailFreq: a.emailFrequenza,
        fonti_totali: (diag.fonti_per_agente && diag.fonti_per_agente[a.id]) || 0,
        fonti_attive: 0, // popolato sotto
        contenuti_totali: 0,
        contenuti_30gg: 0,
        ultima_scan: null,
        ultimo_invio: null,
        n_invii: 0,
        n_invii_falliti: 0,
        optin_musei: (diag.profilo_musei && diag.profilo_musei.optin_per_agente && diag.profilo_musei.optin_per_agente[a.id]) || 0
      };
    });

    // Conta fonti attive per agente
    var shF = ss.getSheetByName('FontiAgenti');
    if (shF && shF.getLastRow() > 1) {
      var vF = shF.getDataRange().getValues();
      var hF = vF[0];
      var iAg = hF.indexOf('Agente');
      var iAtt = hF.indexOf('Attiva');
      var iLS = hF.indexOf('UltimaScan');
      for (var r = 1; r < vF.length; r++) {
        var ag = Number(vF[r][iAg] || 0);
        if (perAgente[ag]) {
          if (vF[r][iAtt] === true) perAgente[ag].fonti_attive++;
          var ts = vF[r][iLS];
          if (ts instanceof Date) {
            if (!perAgente[ag].ultima_scan || ts > new Date(perAgente[ag].ultima_scan)) {
              perAgente[ag].ultima_scan = ts.toISOString();
            }
          }
        }
      }
    }

    // Conta contenuti per agente
    var shR = ss.getSheetByName('AgentScanResults');
    if (shR && shR.getLastRow() > 1) {
      var vR = shR.getDataRange().getValues();
      var hR = vR[0];
      var iAgR = hR.indexOf('AgenteID');
      var iDataA = hR.indexOf('DataAcquisizione');
      var iArch = hR.indexOf('Archiviato');
      var soglia30 = new Date(); soglia30.setDate(soglia30.getDate() - 30);
      for (var rr = 1; rr < vR.length; rr++) {
        var agR = Number(vR[rr][iAgR] || 0);
        if (!perAgente[agR]) continue;
        if (vR[rr][iArch] === true) continue;
        perAgente[agR].contenuti_totali++;
        var d = vR[rr][iDataA];
        if (d instanceof Date && d > soglia30) perAgente[agR].contenuti_30gg++;
      }
    }

    // Aggrega stats invii (se disponibili)
    if (stats && stats.byAgent) {
      Object.keys(stats.byAgent).forEach(function(k){
        var sId = Number(k);
        if (perAgente[sId]) {
          perAgente[sId].n_invii = stats.byAgent[k].sent || 0;
          perAgente[sId].n_invii_falliti = stats.byAgent[k].failed || 0;
          perAgente[sId].ultimo_invio = stats.byAgent[k].lastSent || null;
        }
      });
    }

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      sintesi: diag.sintesi,
      agenti: Object.keys(perAgente).map(function(k){ return perAgente[k]; }).sort(function(a,b){ return a.id - b.id; }),
      claude_api_key_presente: !!diag.claude_api_key_presente,
      trigger_attivi: (diag.trigger_attivi || []).length,
      profilo_musei_totali: (diag.profilo_musei && diag.profilo_musei.totali) || 0,
      raccomandazione: diag.sintesi && diag.sintesi.raccomandazione
    };
  } catch(e) {
    return { ok:false, error: e.message };
  }
}


// ============================================================================
// 2. LISTA RISULTATI SCAN — paginata
// ============================================================================

function getAgentScanResultsList(opts) {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }

  opts = opts || {};
  var agenteId = opts.agenteId ? Number(opts.agenteId) : null;
  var limit = Number(opts.limit) || 50;
  var offset = Number(opts.offset) || 0;

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('AgentScanResults');
    if (!sh || sh.getLastRow() < 2) return { ok:true, items:[], total:0 };

    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var idx = {
      id: h.indexOf('ID'),
      ag: h.indexOf('AgenteID'),
      tit: h.indexOf('Titolo'),
      fonte: h.indexOf('Fonte'),
      fonteNome: h.indexOf('FonteNome'),
      url: h.indexOf('URL'),
      dataPub: h.indexOf('DataPubblicazione'),
      somm: h.indexOf('SommarioAI'),
      tag: h.indexOf('TagAI'),
      ambito: h.indexOf('Ambito'),
      score: h.indexOf('Score'),
      tipo: h.indexOf('Tipo'),
      dataAcq: h.indexOf('DataAcquisizione'),
      arch: h.indexOf('Archiviato')
    };

    var all = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (idx.arch >= 0 && row[idx.arch] === true) continue;
      var agR = Number(row[idx.ag] || 0);
      if (agenteId && agR !== agenteId) continue;
      all.push({
        id: row[idx.id],
        agenteId: agR,
        titolo: row[idx.tit],
        fonte: row[idx.fonte],
        fonteNome: row[idx.fonteNome],
        url: row[idx.url],
        dataPubblicazione: row[idx.dataPub] instanceof Date ? row[idx.dataPub].toISOString() : row[idx.dataPub],
        sommario: idx.somm >= 0 ? row[idx.somm] : '',
        tag: idx.tag >= 0 ? row[idx.tag] : '',
        ambito: idx.ambito >= 0 ? row[idx.ambito] : null,
        score: idx.score >= 0 ? row[idx.score] : null,
        tipo: idx.tipo >= 0 ? row[idx.tipo] : '',
        dataAcquisizione: row[idx.dataAcq] instanceof Date ? row[idx.dataAcq].toISOString() : row[idx.dataAcq]
      });
    }

    // Ordina per DataAcquisizione DESC
    all.sort(function(a,b){
      var da = a.dataAcquisizione ? new Date(a.dataAcquisizione).getTime() : 0;
      var db = b.dataAcquisizione ? new Date(b.dataAcquisizione).getTime() : 0;
      return db - da;
    });

    var sliced = all.slice(offset, offset + limit);
    return { ok:true, items: sliced, total: all.length, limit: limit, offset: offset };
  } catch(e) { return { ok:false, error: e.message }; }
}


// ============================================================================
// 3. LISTA PROFILI AGENTI
// ============================================================================

function getProfiloAgentiList() {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }

  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('ProfiloAgenti');
    if (!sh || sh.getLastRow() < 2) return { ok:true, items:[], total:0 };

    var vals = sh.getDataRange().getValues();
    var h = vals[0];
    var items = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      var obj = { _row: r + 1 };
      for (var c = 0; c < h.length; c++) {
        var k = h[c];
        var v = row[c];
        if (v instanceof Date) v = v.toISOString();
        obj[k] = v;
      }
      items.push(obj);
    }

    return { ok:true, items: items, total: items.length };
  } catch(e) { return { ok:false, error: e.message }; }
}


// ============================================================================
// 4. QUICK SCAN — generalizzato
// ============================================================================

function quickScanAgente(agenteId, maxFonti) {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }
  if (typeof scanAgente !== 'function') return { ok:false, error:'scanAgente non disponibile' };
  var ag = Number(agenteId);
  if (ag < 1 || ag > 5) return { ok:false, error:'agenteId fuori range (1-5)' };
  var n = Number(maxFonti) || 5;
  try {
    return scanAgente(ag, { maxFonti: n, verbose: true });
  } catch(e) { return { ok:false, error: e.message }; }
}

function quickScanAllAgenti(maxFontiPerAgente) {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }
  if (typeof scanAgente !== 'function') return { ok:false, error:'scanAgente non disponibile' };
  var n = Number(maxFontiPerAgente) || 5;
  var results = [];
  for (var ag = 1; ag <= 5; ag++) {
    try {
      var r = scanAgente(ag, { maxFonti: n, verbose: true });
      results.push({ agenteId: ag, ok: true, result: r });
    } catch(e) {
      results.push({ agenteId: ag, ok: false, error: e.message });
    }
  }
  return { ok: true, results: results };
}


// ============================================================================
// 5. TEST EMAIL SINGOLO AGENTE
// ============================================================================

function sendTestEmailAgente(agenteId, destinatario) {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }
  var ag = Number(agenteId);
  if (ag < 1 || ag > 5) return { ok:false, error:'agenteId fuori range' };
  var email = String(destinatario || '').trim().toLowerCase();
  if (!email) {
    try {
      email = String(PropertiesService.getScriptProperties().getProperty('OC_ADMIN_EMAILS') || '').split(',')[0].trim().toLowerCase();
    } catch(_){}
  }
  if (!email) return { ok:false, error:'destinatario non specificato' };

  try {
    if (typeof _profilaUtenteInAgenti_ === 'function') {
      var optIn = { 1:false, 2:false, 3:false, 4:false, 5:false }; optIn[ag] = true;
      _profilaUtenteInAgenti_(email, { optIn: optIn });
    }
    var preview = (typeof previewAgentEmail === 'function') ? previewAgentEmail(ag, email) : null;
    if (!preview || !preview.html) return { ok:false, error:'preview vuota' };
    var agConf = (typeof getAgentConfig === 'function') ? getAgentConfig(ag) : null;
    var subj = '[TEST ' + (agConf ? agConf.codice : ('AG' + ag)) + '] ' + (agConf ? agConf.nome : 'Sinopia Agente ' + ag);
    MailApp.sendEmail({
      to: email, subject: subj, htmlBody: preview.html,
      name: 'Sinopia · Osservatorio Culturale'
    });
    return { ok:true, destinatario: email, agente: ag, subject: subj, htmlSize: preview.html.length };
  } catch(e) { return { ok:false, error: e.message }; }
}


// ============================================================================
// 6. ADD / UPDATE / DELETE PROFILO
// ============================================================================

function addProfiloManuale(body) {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }
  body = body || {};
  var email = String(body.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok:false, error:'email_non_valida' };
  if (typeof _profilaUtenteInAgenti_ !== 'function') return { ok:false, error:'_profilaUtenteInAgenti_ mancante' };
  try {
    var r = _profilaUtenteInAgenti_(email, {
      nomeMuseo: body.nomeMuseo || '',
      optIn: body.optIn || { 1:true, 2:false, 3:false, 4:false, 5:false },
      freq: body.freq || { 1:'settimanale' }
    });
    return { ok:true, action: r.action, email: email };
  } catch(e) { return { ok:false, error: e.message }; }
}

function updateProfiloOptIn(body) {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }
  body = body || {};
  var email = String(body.email || '').trim().toLowerCase();
  if (!email) return { ok:false, error:'email_mancante' };
  if (typeof _profilaUtenteInAgenti_ !== 'function') return { ok:false, error:'_profilaUtenteInAgenti_ mancante' };
  try {
    var r = _profilaUtenteInAgenti_(email, { optIn: body.optIn || {} });
    return { ok:true, action: r.action };
  } catch(e) { return { ok:false, error: e.message }; }
}

function removeProfilo(email) {
  try {
    _requireAgentAdmin_();
  } catch(e) { return { ok:false, error: e.message }; }
  var em = String(email || '').trim().toLowerCase();
  if (!em) return { ok:false, error:'email_mancante' };
  try {
    var found = _findProfiloRow_(em);
    if (!found) return { ok:false, error:'profilo_non_trovato' };
    found.sheet.deleteRow(found.row);
    return { ok:true, email: em };
  } catch(e) { return { ok:false, error: e.message }; }
}


// ============================================================================
// 7. CONFIG LIST (per UI — non richiede gating)
// ============================================================================

function getAgentConfigList() {
  // Esposta anche al frontend non-admin per il form opt-in del lettore.
  // Restituisce metadati pubblici, no prompt Claude.
  if (typeof getAllAgents !== 'function') return { ok:false, error:'AgentConfig non disponibile' };
  var agents = getAllAgents().map(function(a){
    return {
      id: a.id,
      codice: a.codice,
      nome: a.nome,
      nomeBreve: a.nomeBreve,
      descrizione: a.descrizione,
      ambiti: a.ambiti,
      matrixDims: a.matrixDims,
      color: a.color,
      icon: a.icon,
      scanFrequenza: a.scanFrequenza,
      emailFrequenza: a.emailFrequenza,
      maxContenuti: a.maxContenuti,
      ctaText: a.ctaText
    };
  });
  return { ok:true, agents: agents };
}


// ============================================================================
// 8. ENDPOINT LETTORE — opt-in personale (richiede magic-link token)
// ============================================================================

function _resolveTokenEmail_(token) {
  if (!token || typeof validaSessione !== 'function') return null;
  var s = validaSessione(token);
  if (!s || !s.ok || !s.valid) return null;
  return String(s.email || '').toLowerCase();
}

function getMyAgentiProfile(token) {
  try {
    var email = _resolveTokenEmail_(token);
    if (!email) return { ok:false, error:'sessione_non_valida' };

    var found = _findProfiloRow_(email);
    var optIn = { 1:false, 2:false, 3:false, 4:false, 5:false };
    var freq  = { 1:'', 2:'', 3:'', 4:'', 5:'' };
    var nomeMuseo = '';
    if (found) {
      var h = found.header, v = found.values;
      nomeMuseo = String(v[h.indexOf('NomeMuseo')] || '');
      for (var k = 1; k <= 5; k++) {
        var iO = h.indexOf('OptIn_AG' + k);
        var iF = h.indexOf('Freq_AG' + k);
        optIn[k] = (iO >= 0) && (v[iO] === true || String(v[iO]).toLowerCase() === 'true');
        freq[k]  = (iF >= 0) ? String(v[iF] || '') : '';
      }
    }
    var cfg = (typeof getAllAgents === 'function') ? getAllAgents() : [];
    return {
      ok: true,
      email: email,
      nomeMuseo: nomeMuseo,
      hasProfile: !!found,
      optIn: optIn,
      freq: freq,
      agenti: cfg.map(function(a){
        return { id:a.id, codice:a.codice, nome:a.nome, nomeBreve:a.nomeBreve, descrizione:a.descrizione, color:a.color, icon:a.icon, emailFrequenza:a.emailFrequenza };
      })
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

function saveMyAgentiOptIn(token, body) {
  try {
    var email = _resolveTokenEmail_(token);
    if (!email) return { ok:false, error:'sessione_non_valida' };
    body = body || {};
    var optIn = body.optIn || {};
    var nomeMuseo = body.nomeMuseo || '';

    if (typeof _profilaUtenteInAgenti_ !== 'function') return { ok:false, error:'_profilaUtenteInAgenti_ mancante' };
    var r = _profilaUtenteInAgenti_(email, {
      nomeMuseo: nomeMuseo || undefined,
      optIn: optIn
    });
    return { ok:true, action: r.action, email: email };
  } catch(e) { return { ok:false, error: e.message }; }
}

function getMyAgentiContent(token, opts) {
  try {
    var email = _resolveTokenEmail_(token);
    if (!email) return { ok:false, error:'sessione_non_valida' };
    opts = opts || {};
    var limit = Number(opts.limit) || 20;

    var found = _findProfiloRow_(email);
    if (!found) return { ok:true, items:[], total:0, note:'profilo_assente — completa opt-in prima' };

    // Determina agenti opt-in
    var h = found.header, v = found.values;
    var optAgents = [];
    for (var k = 1; k <= 5; k++) {
      var iO = h.indexOf('OptIn_AG' + k);
      if (iO >= 0 && v[iO] === true) optAgents.push(k);
    }
    if (!optAgents.length) return { ok:true, items:[], total:0, note:'nessun_agente_attivo' };

    // Carica contenuti dai loro AgentScanResults
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('AgentScanResults');
    if (!sh || sh.getLastRow() < 2) return { ok:true, items:[], total:0 };

    var vals = sh.getDataRange().getValues();
    var hR = vals[0];
    var iAg = hR.indexOf('AgenteID');
    var iArch = hR.indexOf('Archiviato');
    var iDataA = hR.indexOf('DataAcquisizione');

    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (iArch >= 0 && row[iArch] === true) continue;
      var agR = Number(row[iAg]);
      if (optAgents.indexOf(agR) < 0) continue;
      var obj = {};
      for (var c = 0; c < hR.length; c++) {
        var key = hR[c];
        var vv = row[c];
        if (vv instanceof Date) vv = vv.toISOString();
        obj[key] = vv;
      }
      out.push(obj);
    }
    out.sort(function(a,b){
      var da = a.DataAcquisizione ? new Date(a.DataAcquisizione).getTime() : 0;
      var db = b.DataAcquisizione ? new Date(b.DataAcquisizione).getTime() : 0;
      return db - da;
    });

    return {
      ok: true,
      items: out.slice(0, limit),
      total: out.length,
      agentiAttivi: optAgents
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// FINE AgentAdmin.js
// ============================================================================
