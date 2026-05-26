// ============================================================================
// DigestService.js — Gestione digest, token, invio email, filtri per ruolo
// Estratto da Codice.js (Sprint 2 refactoring — 2026-05-26)
// Osservatorio Culturale - Duemilamusei / Silvano Straccini
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
  const sh=getMainSS().getSheetByName(SH.ITEMS);
  const rows=sh.getDataRange().getValues(), h=rows[0];
  const idCol=h.indexOf('ID'), digCol=h.indexOf('InclusiNelDigest'), archCol=h.indexOf('Archiviato');
  const itemIds=[];
  for(let i=1;i<rows.length;i++) {
    if(rows[i][idCol]&&rows[i][digCol]&&!rows[i][archCol]) itemIds.push(rows[i][idCol]);
  }
  if(!itemIds.length){ Logger.log('Digest: nessun item'); return; }
  const result=sendDigest(itemIds);
  if(result.ok) {
    for(let i=1;i<rows.length;i++) { if(itemIds.includes(rows[i][idCol])) sh.getRange(i+1,digCol+1).setValue(false); }
  }
}

function sendDigest(itemIds, bandiIds, podcastIds) {
  const items = itemIds ? getItemsByIds(itemIds) : [];
  const mailingList = getMailingList().list.filter(m => m.Attivo);
  if (!mailingList.length) return {error:'Nessun destinatario'};
  const baseUrl = ScriptApp.getService().getUrl();
  const subject = 'Osservatorio Culturale - Digest ' + formatDate(new Date());
  let sent = 0;

  for (const dest of mailingList) {
    try {
      // Genera token personale (FIX v4.3: controllo null esplicito)
      const token = _getOrCreateToken(dest.Email);
      if (!token) {
        Logger.log('sendDigest: token null per ' + dest.Email + ' — invio senza link reader');
        // Invia comunque la mail, senza il link reader personalizzato
        const htmlNoReader = buildDigestHTML(items, dest, null);
        GmailApp.sendEmail(dest.Email, subject, 'Visualizza in HTML.', {
          htmlBody: htmlNoReader,
          name: 'Sinopia · Osservatorio Culturale',
          replyTo: Session.getEffectiveUser().getEmail()
        });
        sent++;
        Utilities.sleep(300);
        continue;
      }
      // Salva il digest per questo token
      _saveDigestForToken(token, itemIds||[], bandiIds||[], podcastIds||[]);
      // Link personalizzato
      const readerUrl = baseUrl + '?reader=1&t=' + token;
      // HTML mail con link reader
      const html = buildDigestHTML(items, dest, readerUrl);
      GmailApp.sendEmail(dest.Email, subject, 'Visualizza in HTML.', {
        htmlBody: html,
        name: 'Osservatorio Culturale - Duemilamusei',
        replyTo: Session.getEffectiveUser().getEmail()
      });
      sent++;
      Utilities.sleep(300);
    } catch(e) { Logger.log('sendDigest errore per ' + dest.Email + ': ' + e.message); }
  }

  getMainSS().getSheetByName(SH.LOG).appendRow(
    ['D'+Date.now(), new Date(), items.length, mailingList.map(m=>m.Email).join(', '), 'inviato']
  );
  return {ok:true, items:items.length, recipients:sent};
}

function buildDigestHTML(items, dest, readerUrl) {
  const nomeDestinatario = dest ? (dest.Nome||dest.Email) : '';
  const grouped={1:[],2:[],3:[],4:[],5:[]};  // * FIX v4.3: aggiunto Ambito 5 "AI per la Cultura"
  items.forEach(i=>{if(grouped[i.Ambito])grouped[i.Ambito].push(i);});
  let sectionsHTML='';
  for(let a=1;a<=5;a++) {  // FIX v4.3: loop fino ad Ambito 5
    if(!grouped[a].length) continue;
    const color=AMBITO_COLOR[a], label=AMBITO_LABEL[a];
    const itemsHTML=grouped[a].map(item=>{
      const tags=(item.TagAI||'').split(',').slice(0,3).map(t=>`<span style="font-size:11px;color:${color};background:${color}18;padding:2px 8px;border-radius:20px;border:1px solid ${color}28;display:inline-block;margin:0 4px 4px 0">${t.trim()}</span>`).join('');
      const scad=item.Scadenza?`<span style="font-size:11px;font-weight:600;color:#A32D2D;background:#FCEBEB;padding:2px 8px;border-radius:20px;margin-left:6px">! Scade: ${item.Scadenza}</span>`:'';
      return `<tr><td style="padding:16px 0;border-bottom:1px solid #f0ede8"><div style="margin-bottom:6px"><span style="font-size:11px;font-weight:600;color:${color};background:${color}18;padding:2px 8px;border-radius:20px;text-transform:uppercase">${item.Tipologia||'articolo'}</span><span style="font-size:11px;color:#888;margin-left:8px">${item.Fonte||''} &middot; ${item.DataPubblicazione||''}</span>${scad}</div><div style="font-size:15px;font-weight:600;color:#1a1a1a;line-height:1.4;margin-bottom:8px"><a href="${item.FonteURL||'#'}" style="color:#1a1a1a;text-decoration:none">${item.Titolo||''}</a></div><div style="font-size:13px;color:#555;line-height:1.65;margin-bottom:10px">${item.SommarioAI||''}</div><div>${tags}</div><a href="${item.FonteURL||'#'}" style="font-size:12px;font-weight:600;color:${color};text-decoration:none">&#x2197; Leggi</a></td></tr>`;
    }).join('');
    sectionsHTML+=`<tr><td style="padding:24px 0 12px"><div style="display:flex;align-items:center"><div style="width:4px;height:18px;background:${color};border-radius:2px;margin-right:10px;display:inline-block"></div><span style="font-size:12px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.06em">${label}</span><span style="font-size:12px;color:#aaa;margin-left:8px">${grouped[a].length} item</span></div></td></tr><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e5e0">${itemsHTML}</table>`;
  }
  const readerBtn = readerUrl ? `<tr><td style="padding:16px 36px 8px"><div style="background:linear-gradient(135deg,#0F2744,#185FA5);border-radius:10px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px"><div><div style="font-size:13px;font-weight:600;color:#fff">Ciao${nomeDestinatario?' '+nomeDestinatario:''}!</div><div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px">Seleziona gli articoli che ti interessano e scarica il tuo PDF personalizzato.</div></div><a href="${readerUrl}" style="display:inline-block;background:#B8902A;color:#fff;text-decoration:none;padding:9px 18px;border-radius:7px;font-size:12px;font-weight:700;white-space:nowrap">Apri il tuo digest &rarr;</a></div></td></tr>` : '';
  // v4.18.54 — Footer unsubscribe (link cancellazione iscrizione)
  const unsubFooter = (dest && (dest.Email || dest.email) && typeof _digestUnsubFooter_ === 'function')
    ? _digestUnsubFooter_(dest.Email || dest.email, { style: 'standard' })
    : '';
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Digest</title></head><body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f3ee" style="padding:28px 0"><tr><td align="center"><table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e8e5e0"><tr><td style="background:#1a1a1a;padding:28px 36px 24px"><div style="font-family:Georgia,serif;font-style:italic;font-size:24px;font-weight:500;color:#E89B7C;letter-spacing:.01em">Sinopia</div><div style="font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:#bbb;margin-top:6px">Osservatorio Culturale &middot; Digest del ${formatDate(new Date())}</div></td></tr>${readerBtn}<tr><td style="padding:4px 36px 36px"><table width="100%" cellpadding="0" cellspacing="0">${sectionsHTML}</table></td></tr><tr><td style="border-top:1px solid #eee">${unsubFooter}</td></tr></table></td></tr></table></body></html>`;
}
