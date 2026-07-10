/**
 * ============================================================================
 *  Segnalazioni_v1.js — Segnalazioni Community (v4.19.0)
 * ============================================================================
 *  2026-05-30 — Modulo autocontenuto.
 * ============================================================================
 */

var SEG_SHEET = 'Segnalazioni';
var _SEG_TIPI = ['Mostra','Evento','Bando/Opportunita','Progetto','Pubblicazione','Buona pratica','Altro'];
var _SEG_RATE_LIMIT = { perGiorno: 5, minIntervalloMin: 2 };

// ============================================================================
// BOOTSTRAP
// ============================================================================

function ensureSheetSegnalazioni_() {
  var ss = getMainSS();
  var sh = ss.getSheetByName(SEG_SHEET);
  if (sh) { return { ok:true, action:'exists', rows:sh.getLastRow()-1 }; }
  var h = ['segnalazioneId','email_autore','nome_autore','titolo','descrizione',
    'url','tipo','dimensioni','area_geografica','stato','note_redazione',
    'editor_assegnato','dataInvio','dataDecisione','dataPubblicazione'];
  sh = ss.insertSheet(SEG_SHEET);
  sh.getRange(1,1,1,h.length).setValues([h]);
  sh.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#E8F5E9');
  sh.setFrozenRows(1);
  return { ok:true, action:'created', columns:h.length };
}

// ============================================================================
// FUNZIONI PUBBLICHE — LETTORE (livello >= 1)
// ============================================================================

function inviaSegnalazione(payload) {
  payload = payload || {};
  var user = _segGetUser_(1, payload.token);
  if (!user) return { ok:false, error:'Accedi per inviare una segnalazione.' };
  payload = payload || {};
  if (!payload.titolo || String(payload.titolo).trim().length < 5)
    return { ok:false, error:'Il titolo deve avere almeno 5 caratteri.' };
  if (!payload.descrizione || String(payload.descrizione).trim().length < 20)
    return { ok:false, error:'La descrizione deve avere almeno 20 caratteri.' };
  if (payload.tipo && _SEG_TIPI.indexOf(payload.tipo) === -1)
    return { ok:false, error:'Tipo non valido.' };
  var rateCheck = _segCheckRateLimit_(user.email);
  if (!rateCheck.ok) return rateCheck;
  var dimensioni = '';
  if (payload.dimensioni) {
    if (Array.isArray(payload.dimensioni)) {
      dimensioni = payload.dimensioni.filter(function(d){return /^D(10|[1-9])$/.test(d);}).join(',');
    } else { dimensioni = String(payload.dimensioni); }
  } else {
    var testo = String(payload.titolo||'')+' '+String(payload.descrizione||'');
    if (typeof _tagMatrixDim_ === 'function') { try { dimensioni = _tagMatrixDim_(testo)||''; } catch(e){} }
  }
  var ss = getMainSS();
  var sh = ss.getSheetByName(SEG_SHEET);
  if (!sh) { ensureSheetSegnalazioni_(); sh = ss.getSheetByName(SEG_SHEET); }
  var id = 'SEG-' + Utilities.getUuid().substring(0,8);
  var now = new Date().toISOString();
  sh.appendRow([id, user.email, _sanitizeForCell_(user.nome||''), _sanitizeForCell_(String(payload.titolo).trim()),
    _sanitizeForCell_(String(payload.descrizione).trim()), _sanitizeForCell_(String(payload.url||'').trim()),
    _sanitizeForCell_(payload.tipo||'Altro'), dimensioni, _sanitizeForCell_(String(payload.area_geografica||'').trim()),
    'pending', '', '', now, '', '']);
  return { ok:true, segnalazioneId:id, dimensioni:dimensioni };
}

// v4.25.14 — FIX: mancava il token di sessione → su deploy anonimo Session è
// vuota e il gate falliva SEMPRE ("Accedi per vedere le tue segnalazioni" anche
// da loggati/superadmin). Stesso pattern dello sweep token v4.24.8.
function getMieSegnalazioni(token) {
  var user = _segGetUser_(1, token);
  if (!user) return { ok:false, error:'Accedi per vedere le tue segnalazioni.' };
  var sh = getMainSS().getSheetByName(SEG_SHEET);
  if (!sh || sh.getLastRow()<2) return { ok:true, segnalazioni:[] };
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var emailLc = user.email.toLowerCase();
  var risultati = [];
  for (var r=1; r<data.length; r++) {
    if (String(data[r][1]).trim().toLowerCase() === emailLc) {
      var obj = {};
      for (var c=0; c<headers.length; c++) obj[headers[c]] = data[r][c];
      risultati.push(obj);
    }
  }
  risultati.sort(function(a,b){ return String(b.dataInvio||'').localeCompare(String(a.dataInvio||'')); });
  return { ok:true, segnalazioni:risultati };
}

function preTagDimensioni(testo) {
  if (!testo) return { ok:true, dimensioni:'' };
  if (typeof _tagMatrixDim_ !== 'function') return { ok:true, dimensioni:'' };
  try { return { ok:true, dimensioni:_tagMatrixDim_(String(testo))||'' }; }
  catch(e) { return { ok:true, dimensioni:'' }; }
}

// ============================================================================
// FUNZIONI PUBBLICHE — HOME (nessun gating)
// ============================================================================

function getSegnalazioniPubblicate(limit) {
  limit = Number(limit) || 5;
  var sh = getMainSS().getSheetByName(SEG_SHEET);
  if (!sh || sh.getLastRow()<2) return { ok:true, segnalazioni:[] };
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iStato = headers.indexOf('stato');
  var pubblicati = [];
  for (var r=1; r<data.length; r++) {
    if (String(data[r][iStato]).trim() === 'published') {
      var obj = {};
      for (var c=0; c<headers.length; c++) obj[headers[c]] = data[r][c];
      delete obj.email_autore;
      pubblicati.push(obj);
    }
  }
  pubblicati.sort(function(a,b){ return String(b.dataPubblicazione||'').localeCompare(String(a.dataPubblicazione||'')); });
  return { ok:true, segnalazioni:pubblicati.slice(0, limit) };
}

// ============================================================================
// FUNZIONI PUBBLICHE — MODERAZIONE (livello >= 2)
// ============================================================================

function getSegnalazioniCoda(stato, token) {
  var user = _segGetUser_(2, token);
  if (!user) return { ok:false, error:'Solo editor e admin possono accedere alla coda.' };
  stato = stato || 'pending';
  var sh = getMainSS().getSheetByName(SEG_SHEET);
  if (!sh || sh.getLastRow()<2) return { ok:true, segnalazioni:[], count:0 };
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iStato = headers.indexOf('stato');
  var risultati = [];
  for (var r=1; r<data.length; r++) {
    var sRiga = String(data[r][iStato]).trim();
    if (stato==='all' || sRiga===stato) {
      var obj = {};
      for (var c=0; c<headers.length; c++) obj[headers[c]] = data[r][c];
      risultati.push(obj);
    }
  }
  risultati.sort(function(a,b){
    if (a.stato==='pending' && b.stato!=='pending') return -1;
    if (b.stato==='pending' && a.stato!=='pending') return 1;
    return String(b.dataInvio||'').localeCompare(String(a.dataInvio||''));
  });
  return { ok:true, segnalazioni:risultati, count:risultati.length };
}

function approvaSegnalazione(id, note, token) {
  var user = _segGetUser_(2, token);
  if (!user) return { ok:false, error:'Non autorizzato.' };
  return _segTransition_(id, 'approved', user.email, note||'');
}

function rifiutaSegnalazione(id, note, token) {
  var user = _segGetUser_(2, token);
  if (!user) return { ok:false, error:'Non autorizzato.' };
  if (!note || String(note).trim().length < 3)
    return { ok:false, error:'La nota di motivazione e obbligatoria per il rifiuto.' };
  return _segTransition_(id, 'rejected', user.email, note);
}

function pubblicaSegnalazione(id, token) {
  var user = _segGetUser_(2, token);
  if (!user) return { ok:false, error:'Non autorizzato.' };
  var ss = getMainSS();
  var sh = ss.getSheetByName(SEG_SHEET);
  if (!sh) return { ok:false, error:'Foglio Segnalazioni non trovato.' };
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iId = headers.indexOf('segnalazioneId');
  var iStato = headers.indexOf('stato');
  var iDataPubb = headers.indexOf('dataPubblicazione');
  var rowIdx = -1, seg = null;
  for (var r=1; r<data.length; r++) {
    if (String(data[r][iId]).trim() === String(id).trim()) {
      rowIdx = r+1; seg = {};
      for (var c=0; c<headers.length; c++) seg[headers[c]] = data[r][c];
      break;
    }
  }
  if (!seg) return { ok:false, error:'Segnalazione non trovata.' };
  if (seg.stato !== 'approved')
    return { ok:false, error:'Solo segnalazioni approvate possono essere pubblicate.' };
  var now = new Date().toISOString();
  sh.getRange(rowIdx, iStato+1).setValue('published');
  sh.getRange(rowIdx, iDataPubb+1).setValue(now);
  // Promuovi in Items
  var shItems = ss.getSheetByName('Items');
  if (shItems) {
    var itemId = 'COMM-' + String(id).replace('SEG-','');
    shItems.appendRow([itemId, '', '', 'Community', seg.url||'', seg.titolo||'', '',
      seg.descrizione||'', '', '', 7, seg.tipo||'Segnalazione', new Date(), new Date(),
      '', false, false, false, false, seg.dimensioni||'']);
  }
  // Telegram
  if (typeof _tgSend_ === 'function') {
    try {
      var msg = '* Nuova segnalazione community pubblicata*\n'
        + 'Titolo: ' + (seg.titolo||'-') + '\nTipo: ' + (seg.tipo||'-')
        + '\nAutore: ' + (seg.nome_autore||'Community');
      _tgSend_(msg);
    } catch(e){}
  }
  return { ok:true };
}

function unpublishSegnalazione(id, token) {
  var user = _segGetUser_(2, token);
  if (!user) return { ok:false, error:'Non autorizzato.' };
  return _segTransition_(id, 'unpublished', user.email, 'ritirata da ' + user.email);
}

function cancellaSegnalazione(id, token) {
  var user = _segGetUser_(2, token);
  if (!user) return { ok:false, error:'Non autorizzato.' };
  var ss = getMainSS();
  var sh = ss.getSheetByName(SEG_SHEET);
  if (!sh) return { ok:false, error:'Foglio Segnalazioni non trovato.' };
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var iId = headers.indexOf('segnalazioneId');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iId]).trim() === String(id).trim()) {
      sh.deleteRow(r + 1);
      Logger.log('cancellaSegnalazione: rimossa riga ' + (r+1) + ' id=' + id + ' da ' + user.email);
      return { ok:true };
    }
  }
  return { ok:false, error:'Segnalazione non trovata.' };
}

// ============================================================================
// FUNZIONI PRIVATE
// ============================================================================

function _segGetUser_(minLivello, token) {
  if (typeof getRuoloCorrente !== 'function') return null;
  try {
    var user = getRuoloCorrente(token || null, token || null);
    if (!user || !user.email || (user.livello||0) < minLivello) return null;
    return user;
  } catch(e) { return null; }
}

function _segCheckRateLimit_(email) {
  var sh = getMainSS().getSheetByName(SEG_SHEET);
  if (!sh || sh.getLastRow()<2) return { ok:true };
  var data = sh.getDataRange().getValues();
  var emailLc = String(email).trim().toLowerCase();
  var now = new Date();
  var oggi = now.toISOString().split('T')[0];
  var countOggi = 0, ultimoInvio = null;
  for (var r=1; r<data.length; r++) {
    if (String(data[r][1]).trim().toLowerCase() !== emailLc) continue;
    var di = String(data[r][12]||'');
    if (di.indexOf(oggi)===0) countOggi++;
    if (!ultimoInvio || di > ultimoInvio) ultimoInvio = di;
  }
  if (countOggi >= _SEG_RATE_LIMIT.perGiorno)
    return { ok:false, error:'Hai raggiunto il limite di '+_SEG_RATE_LIMIT.perGiorno+' segnalazioni per oggi.' };
  if (ultimoInvio) {
    var diff = (now.getTime() - new Date(ultimoInvio).getTime()) / 60000;
    if (diff < _SEG_RATE_LIMIT.minIntervalloMin)
      return { ok:false, error:'Attendi almeno '+_SEG_RATE_LIMIT.minIntervalloMin+' minuti tra una segnalazione e l altra.' };
  }
  return { ok:true };
}

function _segTransition_(id, nuovoStato, editorEmail, note) {
  var ss = getMainSS();
  var sh = ss.getSheetByName(SEG_SHEET);
  if (!sh) return { ok:false, error:'Foglio non trovato.' };
  var data = sh.getDataRange().getValues();
  var h = data[0];
  var iId=h.indexOf('segnalazioneId'), iSt=h.indexOf('stato'),
      iNo=h.indexOf('note_redazione'), iEd=h.indexOf('editor_assegnato'), iDd=h.indexOf('dataDecisione');
  for (var r=1; r<data.length; r++) {
    if (String(data[r][iId]).trim() === String(id).trim()) {
      var now = new Date().toISOString();
      sh.getRange(r+1, iSt+1).setValue(nuovoStato);
      sh.getRange(r+1, iNo+1).setValue(note||'');
      sh.getRange(r+1, iEd+1).setValue(editorEmail);
      sh.getRange(r+1, iDd+1).setValue(now);
      return { ok:true };
    }
  }
  return { ok:false, error:'Segnalazione non trovata.' };
}
