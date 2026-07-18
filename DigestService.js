// ============================================================================
// DigestService.js — Gestione digest, token, invio email, filtri per ruolo
// Estratto da Codice.js (Sprint 2 refactoring — 2026-05-26)
// Osservatorio Culturale - Sinopia / Silvano Straccini
// ============================================================================
// Dipendenze (tutte globali in GAS, definite in altri file):
//   getMainSS(), SH.MAILING, SH.ITEMS, SH.PODCAST, SH.LOG
//   getMailingList(), getItemsByIds(), getBandiRadar(), getFonti()
//   AMBITO_COLOR, AMBITO_LABEL, formatDate()
//   _digestUnsubFooter_() (Unsubscribe_v1.js)
// ============================================================================

function _ensureMailingColumns(sh) {
  // Garantisce che Token, TokenExpiry, DigestIds esistano nel foglio
  // Aggiunge una colonna alla volta con re-read per evitare disallineamenti
  var changed = false;
  var h = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (h.indexOf('Token') < 0) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('Token');
    SpreadsheetApp.flush();
    h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    changed = true;
  }
  if (h.indexOf('TokenExpiry') < 0) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('TokenExpiry');
    SpreadsheetApp.flush();
    h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    changed = true;
  }
  if (h.indexOf('DigestIds') < 0) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('DigestIds');
    SpreadsheetApp.flush();
    changed = true;
  }
  return changed;
}

function _getOrCreateToken(email) {
  var sh = getMainSS().getSheetByName(SH.MAILING);
  if (!sh) { Logger.log('_getOrCreateToken: foglio MAILING non trovato'); return null; }

  // Assicura colonne presenti con flush garantito
  _ensureMailingColumns(sh);

  // Rilegge tutto dopo eventuale aggiunta colonne
  var allRows = sh.getDataRange().getValues();
  var h = allRows[0];
  var eI = h.indexOf('Email'), tI = h.indexOf('Token'), xI = h.indexOf('TokenExpiry');

  if (eI < 0 || tI < 0 || xI < 0) {
    Logger.log('_getOrCreateToken: colonne obbligatorie mancanti: Email=' + eI + ' Token=' + tI + ' TokenExpiry=' + xI);
    return null;
  }

  var emailNorm = String(email||'').toLowerCase().trim();
  for (var i = 1; i < allRows.length; i++) {
    if (String(allRows[i][eI]||'').toLowerCase().trim() !== emailNorm) continue;
    var now = new Date();
    var exp = allRows[i][xI] ? new Date(allRows[i][xI]) : null;
    // Riusa token se ancora valido (scade fra più di 1 giorno)
    if (allRows[i][tI] && exp && (exp - now) > 86400000) {
      return String(allRows[i][tI]);
    }
    // Genera nuovo token
    var token = Utilities.getUuid().replace(/-/g,'');
    var expiry = new Date(now.getTime() + 30*24*60*60*1000); // 30 giorni
    sh.getRange(i+1, tI+1).setValue(token);
    sh.getRange(i+1, xI+1).setValue(expiry.toISOString());
    SpreadsheetApp.flush(); // scrittura immediata prima di _saveDigestForToken
    Logger.log('_getOrCreateToken: nuovo token generato per ' + email);
    return token;
  }
  Logger.log('_getOrCreateToken: email non trovata nella mailing list: ' + email);
  return null;
}

function _saveDigestForToken(token, itemIds, bandiIds, podcastIds) {
  const sh = getMainSS().getSheetByName(SH.MAILING);
  const rows = sh.getDataRange().getValues(), h = rows[0];
  const tokI = h.indexOf('Token'), digI = h.indexOf('DigestIds');
  if (tokI < 0 || digI < 0) return;
  const payload = JSON.stringify({itemIds:itemIds||[], bandiIds:bandiIds||[], podcastIds:podcastIds||[], savedAt: new Date().toISOString()});
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][tokI]||'') === token) {
      sh.getRange(i+1, digI+1).setValue(payload);
      return;
    }
  }
}

function _getDigestByToken(token) {
  // FIX v4.3: validazioni robuste su token e colonne
  if (!token || token === 'null' || token === 'undefined' || token.length < 8) {
    throw new Error('Token non valido (parametro mancante o malformato)');
  }
  const sh = getMainSS().getSheetByName(SH.MAILING);
  if (!sh) throw new Error('Foglio mailing non trovato');

  const rows = sh.getDataRange().getValues(), h = rows[0];
  const tokI = h.indexOf('Token'), expI = h.indexOf('TokenExpiry'),
        digI = h.indexOf('DigestIds'), nomeI = h.indexOf('Nome'),
        emailI = h.indexOf('Email'), ruoloI = h.indexOf('Ruolo');

  if (tokI < 0) throw new Error('Colonna Token non inizializzata — invia un nuovo digest per attivare i link personalizzati');

  const tokenClean = token.trim();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][tokI]||'').trim() !== tokenClean) continue;
    // Verifica scadenza
    const exp = (expI >= 0 && rows[i][expI]) ? new Date(rows[i][expI]) : null;
    if (!exp) throw new Error('Token senza data di scadenza — invia un nuovo digest');
    if (exp < new Date()) throw new Error('Il link è scaduto (validità 30 giorni). Richiedi un nuovo digest.');
    // Recupera il digest salvato (tollerante a payload mancante)
    let payload = {};
    try {
      if (digI >= 0 && rows[i][digI]) payload = JSON.parse(String(rows[i][digI]));
    } catch(pe) { Logger.log('_getDigestByToken: payload JSON non valido: ' + pe.message); }
    const ruolo = String((ruoloI >= 0 ? rows[i][ruoloI] : '')||'lettore');
    const nome  = String((nomeI  >= 0 ? rows[i][nomeI]  : '')||'');
    const email = String((emailI >= 0 ? rows[i][emailI] : '')||'');
    // Carica i contenuti filtrati per ruolo
    const items   = _getItemsForRole(payload.itemIds||[], ruolo);
    const bandi   = _getBandiForRole(payload.bandiIds||[], ruolo);
    const podcast = _getPodcastForRole(payload.podcastIds||[], ruolo);
    return { ok:true, token:tokenClean, destinatario:nome, email, ruolo,
             items, bandi, podcast,
             savedAt: payload.savedAt||null, scadenza: exp.toISOString() };
  }
  throw new Error('Link non riconosciuto. Potrebbe essere già stato rigenerato — controlla l\'ultima email ricevuta.');
}

function _getItemsForRole(itemIds, ruolo) {
  if (!itemIds.length) return [];
  const items = getItemsByIds(itemIds);
  // Admin e editor vedono tutto; lettore vede solo score>=3
  if (ruolo === 'lettore') return items.filter(i => (i.Score||0) >= 3);
  return items;
}

function _getBandiForRole(bandiIds, ruolo) {
  if (!bandiIds.length) return [];
  const all = getBandiRadar();
  const selected = all.filter(b => bandiIds.includes(b.id));
  // Lettore: solo bandi pubblici (non privati/cliente)
  if (ruolo === 'lettore') return selected.filter(b => !b.cliente);
  return selected;
}

function _getPodcastForRole(podcastIds, ruolo) {
  if (!podcastIds.length) return [];
  try {
    const sh = getMainSS().getSheetByName(SH.PODCAST);
    if (!sh || sh.getLastRow() < 2) return [];
    const rows = sh.getDataRange().getValues(), hh = rows[0];
    return rows.slice(1)
      .filter(r => r[0] && podcastIds.includes(String(r[0])))
      .map(r => { const o={}; hh.forEach((col,i)=>o[col]=r[i]); return o; });
  } catch(e) { return []; }
}

// Aggiunge caso doPost per getDigestByToken
// (il reader chiama questo per caricare i dati via JS)
function getDigestByTokenPublic(token) {
  try { return _getDigestByToken(token); } catch(e) { return {error:e.message}; }
}

// -- EMAIL DIGEST --------------------------------------------------
function sendDigestAuto() {
  // v4.20 DEPRECATO — usare sendDigestAuto2coorti
  Logger.log('[DEPRECATO] sendDigestAuto — usare sendDigestAuto2coorti()');
  return { ok: false, deprecato: true };
}

function sendDigest(itemIds, bandiIds, podcastIds) {
  // v4.20 DEPRECATO — usare sendDigestAuto2coorti
  Logger.log('[DEPRECATO] sendDigest — usare sendDigestAuto2coorti()');
  return { ok: false, deprecato: true };
}

function buildDigestHTML(items, dest, readerUrl, filterAmbiti) {
  const nomeDestinatario = dest ? (dest.Nome||dest.Email) : '';
  // v4.24 — Dedup esatto + fuzzy: nessun contenuto duplicato nel digest
  const _dsSeen = {};
  var _exactDedup = (items||[]).filter(function(i){
    const key = String(i.Titolo||'').trim().toLowerCase().replace(/\s+/g,' ');
    if (!key || _dsSeen[key]) return false;
    _dsSeen[key] = true;
    return true;
  });
  // Dedup fuzzy (Jaccard sui titoli simili)
  var dedupItems = (typeof _dedupFuzzyByTitle_ === 'function')
    ? _dedupFuzzyByTitle_(_exactDedup.map(function(it){ return { titolo: it.Titolo||it.titolo||'', _orig: it }; })).map(function(m){ return m._orig; })
    : _exactDedup;
  const grouped={1:[],2:[],3:[],4:[],5:[]};
  dedupItems.forEach(i=>{if(grouped[i.Ambito])grouped[i.Ambito].push(i);});
  // v4.24 — Filtro per ambiti scelti dal lettore (solo-ambiti, no Matrix). Vuoto/assente = tutti i 5.
  var _ambitiSet = (Array.isArray(filterAmbiti) && filterAmbiti.length)
    ? filterAmbiti.reduce(function(m,n){ m[Number(n)] = true; return m; }, {})
    : null;
  let sectionsHTML='';
  for(let a=1;a<=5;a++) {  // FIX v4.3: loop fino ad Ambito 5
    if(!grouped[a].length) continue;
    if(_ambitiSet && !_ambitiSet[a]) continue;   // v4.24 — salta ambiti non scelti
    const color=AMBITO_COLOR[a], label=AMBITO_LABEL[a];
    const itemsHTML=grouped[a].map(item=>{
      const tags=(item.TagAI||'').split(',').slice(0,3).map(t=>`<span style="font-size:11px;color:${color};background:${color}18;padding:2px 8px;border-radius:20px;border:1px solid ${color}28;display:inline-block;margin:0 4px 4px 0">${t.trim()}</span>`).join('');
      const scad=item.Scadenza?`<span style="font-size:11px;font-weight:600;color:#A32D2D;background:#FCEBEB;padding:2px 8px;border-radius:20px;margin-left:6px">! Scade: ${item.Scadenza}</span>`:'';
      return `<tr><td style="padding:16px 0;border-bottom:1px solid #f0ede8"><div style="margin-bottom:6px"><span style="font-size:11px;font-weight:600;color:${color};background:${color}18;padding:2px 8px;border-radius:20px;text-transform:uppercase">${item.Tipologia||'articolo'}</span><span style="font-size:11px;color:#888;margin-left:8px">${item.Fonte||''} &middot; ${item.DataPubblicazione||''}</span>${scad}</div><div style="font-size:15px;font-weight:600;color:#1a1a1a;line-height:1.4;margin-bottom:8px"><a href="${item.FonteURL||'#'}" style="color:#1a1a1a;text-decoration:none">${item.Titolo||''}</a></div><div style="font-size:13px;color:#555;line-height:1.65;margin-bottom:10px">${item.SommarioAI||''}</div><div>${tags}</div><a href="${item.FonteURL||'#'}" style="font-size:12px;font-weight:600;color:${color};text-decoration:none">&#x2197; Leggi</a></td></tr>`;
    }).join('');
    sectionsHTML+=`<tr><td style="padding:24px 0 12px"><div style="display:flex;align-items:center"><div style="width:4px;height:18px;background:${color};border-radius:2px;margin-right:10px;display:inline-block"></div><span style="font-size:12px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.06em">${label}</span><span style="font-size:12px;color:#aaa;margin-left:8px">${grouped[a].length} item</span></div></td></tr><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e5e0">${itemsHTML}</table>`;
  }
  // v4.22 E1 — Editoriale settimanale (hook additivo, try-catch per sicurezza)
  let editorialeBlock = '';
  try {
    const _ed = (typeof getEditorialeCorrente === 'function') ? getEditorialeCorrente() : null;
    if (_ed && _ed.testo) {
      const _edTesto = String(_ed.testo).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
      const _edTitolo = String(_ed.titolo||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      // v4.25.14 — RIPRISTINO regressione 1ff01773: foto banner + firma (da 2775252c)
      const _edFoto = (_ed.foto) ? `<img src="${String(_ed.foto)}" alt="" width="548" style="width:100%;max-width:548px;border-radius:10px;display:block;margin-bottom:14px"/>` : '';
      const _edFirma = (_ed.firma) ? `<div style="margin-top:12px;font-style:italic;font-size:13px;color:#6E6A62">${String(_ed.firma).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>` : '';
      editorialeBlock = `<tr><td style="padding:20px 36px 4px">${_edFoto}<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8B3A1F;font-weight:700;margin-bottom:8px">Approfondimento della settimana</div><div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:10px">${_edTitolo}</div><p style="margin:0;font-size:14px;line-height:1.65;color:#3A3A3C">${_edTesto}</p>${_edFirma}<div style="margin-top:14px;border-bottom:1px solid #e8e5e0"></div></td></tr>`;
    }
  } catch(_edErr) { Logger.log('[DigestService] editoriale hook err: ' + _edErr.message); }

  const readerBtn = readerUrl ? `<tr><td style="padding:16px 36px 8px"><div style="background:linear-gradient(135deg,#0F2744,#185FA5);border-radius:10px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px"><div><div style="font-size:13px;font-weight:600;color:#fff">Ciao${nomeDestinatario?' '+nomeDestinatario:''}!</div><div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px">Seleziona gli articoli che ti interessano e scarica il tuo PDF personalizzato.</div></div><a href="${readerUrl}" style="display:inline-block;background:#B8902A;color:#fff;text-decoration:none;padding:9px 18px;border-radius:7px;font-size:12px;font-weight:700;white-space:nowrap">Apri il tuo digest &rarr;</a></div></td></tr>` : '';
  // v4.24 — Footer: tipo digest esplicito + unsubscribe + modifica preferenze
  var _destEmail = dest ? (dest.Email || dest.email) : '';
  const unsubFooter = (_destEmail && typeof _digestUnsubFooter_ === 'function')
    ? '<div style="padding:18px 36px 0;font-size:11px;color:#888;text-align:center;line-height:1.5">'
      + 'Questa è la <strong>digest settimanale</strong> dell\'Osservatorio Culturale Sinopia.</div>'
      + _digestUnsubFooter_(_destEmail, { style: 'standard' })
      + (readerUrl ? '<div style="padding:0 36px 8px;font-size:11px;color:#888;text-align:center;line-height:1.5">'
        + 'Vuoi ricevere contenuti diversi? <a href="' + readerUrl.split('?')[0] + '#profilo-agenti" style="color:#bbb;text-decoration:underline;">Modifica le tue preferenze</a>.'
        + '</div>' : '')
    : '';
  // v4.20 — CTA Candidature Capitale della Cultura
  const capitaleCta = (typeof _digestCapitaleCta_ === 'function') ? _digestCapitaleCta_(readerUrl || '') : '';
  // T1 Lavoro Cultura — 1 bando lavoro fisso nelle newsletter lettori (A) e profilati (C).
  // La coorte C usa questo stesso builder (fallback); il digest Matrix (B) ha un builder
  // separato in Matrix_digest.js e NON è toccato. Hook additivo con try-catch.
  let lavoroBlock = '';
  try {
    lavoroBlock = (typeof _digestBandoLavoroBlock_ === 'function') ? _digestBandoLavoroBlock_(readerUrl || '') : '';
  } catch(_lvErr) { Logger.log('[DigestService] lavoro hook err: ' + _lvErr.message); }
  // v4.27.26 — Design «traiettorie sottotraccia» (approvato 2026-07-18):
  // masthead a due righe con graticcio rosso terra (PNG da Drive, vedi
  // DigestAssets.js), filetti terra, nav + social cablati, piede chiaro col logo.
  var _assets = (typeof _digestAssetUrls_ === 'function') ? _digestAssetUrls_() : { logo: null, masthead: null };
  var _appUrl = readerUrl ? readerUrl.split('?')[0] : '';
  if (!_appUrl) { try { _appUrl = ScriptApp.getService().getUrl() || ''; } catch(_) {} }
  var _sito = 'https://sinopia.netlify.app/';
  var _linkedin = 'https://www.linkedin.com/company/sinopiaconsulting';
  var _logoTop = _assets.logo
    ? `<a href="${_sito}" style="text-decoration:none"><img src="${_assets.logo}" alt="OCS — Osservatorio Culturale Sinopia" width="100" height="70" style="display:block;border:0" /></a>`
    : `<a href="${_sito}" style="text-decoration:none;font-family:Georgia,serif;font-weight:700;font-size:28px;color:#111111">OCS</a>`;
  var _masthead = _assets.masthead
    ? `<img src="${_assets.masthead}" alt="traiettorie sottotraccia" width="269" height="111" style="display:block;border:0;margin:0 auto" />`
    : `<div style="font-family:Georgia,serif;font-size:34px;color:#111111;text-align:center;line-height:1.1">traiettorie<br>sottotraccia</div>`;
  var _logoFoot = _assets.logo
    ? `<a href="${_sito}" style="text-decoration:none"><img src="${_assets.logo}" alt="OCS" width="60" height="42" style="display:block;border:0" /></a>`
    : '';
  var _headerHtml =
    `<tr><td style="padding:24px 36px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td align="left" style="vertical-align:middle">${_logoTop}</td>`
    + `<td align="right" style="vertical-align:middle;font-size:14px;font-weight:700;color:#1F3F8F">${formatDate(new Date())}</td>`
    + `</tr></table></td></tr>`
    + `<tr><td style="padding:14px 36px 0"><div style="border-top:2px solid #A65138;font-size:0;line-height:0">&nbsp;</div></td></tr>`
    + `<tr><td align="center" style="padding:14px 36px 6px">${_masthead}</td></tr>`
    + `<tr><td style="padding:8px 36px 0"><div style="border-top:2px solid #A65138;font-size:0;line-height:0">&nbsp;</div></td></tr>`
    + `<tr><td style="padding:12px 36px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td align="left" style="font-size:14px;font-weight:700"><a href="${_sito}" style="color:#1F3F8F;text-decoration:none">Osservatorio</a></td>`
    + `<td align="center" style="font-size:14px;font-weight:700"><a href="${_appUrl}?goto=segnala" style="color:#1F3F8F;text-decoration:none">Segnala</a></td>`
    + `<td align="right" style="font-size:14px;font-weight:700"><a href="${_appUrl}?goto=consulenza" style="color:#1F3F8F;text-decoration:none">Contattaci</a></td>`
    + `</tr></table></td></tr>`
    + `<tr><td align="center" style="padding:14px 36px 20px">`
    + `<a href="${_linkedin}" style="display:inline-block;width:28px;height:26px;border:2px solid #111111;border-radius:6px;text-align:center;font-size:13px;font-weight:800;color:#111111;text-decoration:none;line-height:26px;margin:0 8px">in</a>`
    + `<a href="${_sito}" style="display:inline-block;width:28px;height:26px;border:2px solid #111111;border-radius:50%;text-align:center;font-size:14px;font-weight:800;color:#111111;text-decoration:none;line-height:26px;margin:0 8px">&#8853;</a>`
    + `</td></tr>`;
  var _footerLogoHtml =
    `<tr><td style="padding:16px 36px 4px"><table width="100%" cellpadding="0" cellspacing="0"><tr>`
    + `<td align="left" style="vertical-align:middle">${_logoFoot}</td>`
    + `<td align="left" style="vertical-align:middle;padding-left:10px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8A8578">Osservatorio Culturale Sinopia</td>`
    + `</tr></table></td></tr>`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Digest</title></head><body style="margin:0;padding:0;background:#E4E0D8;font-family:Arial,Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" bgcolor="#E4E0D8" style="padding:28px 0"><tr><td align="center"><table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #cfc9be">${_headerHtml}${editorialeBlock}${readerBtn}<tr><td style="padding:4px 36px 36px"><table width="100%" cellpadding="0" cellspacing="0">${sectionsHTML}</table>${lavoroBlock}${capitaleCta}</td></tr><tr><td style="border-top:2px solid #111111">${_footerLogoHtml}${unsubFooter}</td></tr></table></td></tr></table></body></html>`;
}

/**
 * T1 Lavoro Cultura — blocco "Lavoro nella cultura" per il digest lettori/profilati.
 * Seleziona 1 bando tipoBando='lavoro' attivo con la scadenza più vicina (futura).
 * Ritorna '' se non ci sono concorsi (il blocco semplicemente non appare).
 * @param {string} [appUrl] URL webapp per il link "vedi tutti"
 * @return {string} HTML block
 */
function _digestBandoLavoroBlock_(appUrl) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shName = (typeof SH_BANDI_V5 !== 'undefined') ? SH_BANDI_V5 : 'Bandi_v5';
    var sh = ss.getSheetByName(shName);
    if (!sh || sh.getLastRow() < 2) return '';
    var vals = sh.getDataRange().getValues();
    var oggi = new Date(); oggi.setHours(0,0,0,0);
    // Candidati: concorsi attivi con scadenza futura, ordinati per scadenza
    var candidati = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      if (!row[COL_B.ID - 1]) continue;
      if (String(row[COL_B.TIPO_BANDO - 1] || '') !== 'lavoro') continue;
      if (String(row[COL_B.STATO_RECORD - 1] || '').toLowerCase() === 'archiviato') continue;
      var rawScad = row[COL_B.SCADENZA - 1];
      var scad = (rawScad instanceof Date) ? rawScad : (rawScad ? new Date(rawScad) : null);
      if (!scad || isNaN(scad.getTime()) || scad.getTime() < oggi.getTime()) continue;
      candidati.push({ id: String(row[COL_B.ID - 1]), scad: scad,
        titolo: String(row[COL_B.TITOLO - 1] || ''), ente: String(row[COL_B.ENTE - 1] || ''),
        link: String(row[COL_B.URL_BANDO - 1] || row[COL_B.URL_ENTE - 1] || '') });
    }
    if (!candidati.length) return '';
    candidati.sort(function(a, b){ return a.scad.getTime() - b.scad.getTime(); });

    // v4.25.15 — ROTAZIONE SENZA RIPETIZIONI tra un invio e il successivo:
    // la scelta è stabile per l'intera settimana (tutti i lettori dello stesso
    // invio vedono lo stesso concorso), e la settimana dopo si passa al primo
    // concorso NON ancora proposto (memoria in ScriptProperties). Quando tutti
    // sono già stati proposti, la memoria si azzera e il giro ricomincia.
    var props = PropertiesService.getScriptProperties();
    var week = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Rome', "YYYY-'W'ww");
    var rot = {};
    try { rot = JSON.parse(props.getProperty('OC_DIGEST_LAVORO_ROT') || '{}'); } catch(_) { rot = {}; }
    var sent = Array.isArray(rot.sent) ? rot.sent : [];
    var best = null;
    if (rot.week === week && rot.id) {
      for (var c0 = 0; c0 < candidati.length; c0++) if (candidati[c0].id === rot.id) { best = candidati[c0]; break; }
    }
    if (!best) {
      for (var c1 = 0; c1 < candidati.length; c1++) if (sent.indexOf(candidati[c1].id) < 0) { best = candidati[c1]; break; }
      if (!best) { sent = []; best = candidati[0]; } // giro completo → ricomincia
      if (sent.indexOf(best.id) < 0) sent.push(best.id);
      try { props.setProperty('OC_DIGEST_LAVORO_ROT', JSON.stringify({ week: week, id: best.id, sent: sent.slice(-100) })); } catch(_) {}
    }
    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    var tz = Session.getScriptTimeZone() || 'Europe/Rome';
    var scadFmt = Utilities.formatDate(best.scad, tz, 'd MMMM yyyy');
    // v4.27.26 — palette design «traiettorie sottotraccia»: carta, nero, blu, terra
    var tuttiLink = appUrl ? ('<a href="' + appUrl + '?goto=lavoro" style="font-size:12px;color:#1F3F8F;text-decoration:underline">Vedi tutti i concorsi nella sezione Lavoro cultura &rarr;</a>') : '';
    return '<div style="background:#F4F1EB;border:1px solid #111111;padding:16px 18px;margin:24px 0">'
      + '<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#1F3F8F;font-weight:800;margin-bottom:8px">&#128100; Lavoro nella cultura</div>'
      + '<div style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#111111;line-height:1.4;margin-bottom:6px">' + esc(best.titolo).substring(0, 200) + '</div>'
      + '<div style="font-size:12.5px;color:#777;margin-bottom:10px">' + esc(best.ente) + ' &middot; <b style="color:#C0331B">scade il ' + scadFmt + '</b></div>'
      + (best.link ? '<a href="' + esc(best.link) + '" style="display:inline-block;background:#A65138;color:#ffffff;text-decoration:none;padding:8px 18px;font-size:13px;font-weight:700;margin-bottom:6px">Vai al concorso &rarr;</a><br>' : '')
      + tuttiLink
      + '</div>';
  } catch(e) { Logger.log('[_digestBandoLavoroBlock_] ' + e.message); return ''; }
}

/**
 * v4.20 — CTA "Candidatura Capitale della Cultura" per newsletter.
 * Inserito in tutti i 3 template digest.
 * @param {string} [appUrl] URL webapp per deep-link
 * @return {string} HTML block
 */
function _digestCapitaleCta_(appUrl) {
  var link = (appUrl || '') + '?goto=capitali';
  return '<div style="background:linear-gradient(135deg,#F7F4EE 0%,#EDE8DF 100%);border:2px solid #935851;border-radius:12px;padding:20px 24px;margin:24px 0;text-align:center">'
    + '<div style="font-size:18px;font-weight:700;color:#935851;margin-bottom:8px">Candidature Capitale della Cultura</div>'
    + '<div style="font-size:14px;color:#5A5A5A;line-height:1.5;margin-bottom:14px">Il tuo territorio puo candidarsi. Scopri scadenze, percorsi e requisiti per le candidature italiane ed europee.</div>'
    + '<a href="' + link + '" style="display:inline-block;background:#935851;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600">Scopri le candidature aperte &rarr;</a>'
    + '</div>';
}
