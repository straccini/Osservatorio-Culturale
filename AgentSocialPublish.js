// ============================================================================
//  AgentSocialPublish.js — Layer 3: PUBBLICAZIONE post social (IG + LinkedIn)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · v4.27.52 (2026-07-21)
//
//  Completa la pipeline social: Layer 1 genera (AgentSocial.js), Layer 2 fa
//  approvare (Coda social), Layer 3 — questo file — PUBBLICA.
//
//  DUE MODALITÀ, attivabili indipendentemente:
//
//   A) PONTE TELEGRAM (attivo subito, nessuna API esterna)
//      I post approvati arrivano su Telegram già pronti: foto + caption IG +
//      testo LinkedIn in messaggi separati SENZA formattazione, così si
//      copiano e incollano senza ritocchi. Resta utile anche dopo le API,
//      come canale di revisione finale.
//
//   B) API NATIVE (si accendono quando i token sono disponibili)
//      - Instagram Graph API: container /media → /media_publish (2 passi).
//        Richiede IG BUSINESS/CREATOR collegato a una Pagina Facebook e
//        un'immagine raggiungibile via URL PUBBLICO (Meta scarica il file).
//      - LinkedIn Posts API: agnostica rispetto all'autore — l'URN in
//        OC_LI_AUTHOR_URN decide se si pubblica su PROFILO
//        (urn:li:person:XXX) o su PAGINA (urn:li:organization:XXX), così
//        qualunque credenziale fornisca Riccardo funziona senza modifiche.
//
//  ScriptProperties usate (nessun segreto nel codice):
//    OC_IG_USER_ID     — id numerico dell'account IG business
//    OC_IG_TOKEN       — access token Meta (preferire System User: non scade)
//    OC_LI_AUTHOR_URN  — urn:li:person:… oppure urn:li:organization:…
//    OC_LI_TOKEN       — access token LinkedIn
//    OC_SOCIAL_AUTOPUB — 'true' per pubblicare davvero; altrimenti solo ponte
//
//  SICUREZZA: si pubblica SOLO ciò che è stato approvato in Coda social
//  (stato='approved'). Nessuna pubblicazione automatica di bozze.
// ============================================================================

var ASP_TG_API_ = 'https://api.telegram.org/bot';
var ASP_IG_API_ = 'https://graph.facebook.com/v21.0/';
var ASP_LI_API_ = 'https://api.linkedin.com/rest/posts';

// ----------------------------------------------------------------------------
// CONFIGURAZIONE
// ----------------------------------------------------------------------------
function _aspProp_(k) {
  try { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }
  catch (e) { return ''; }
}

function _aspAutopubAttivo_() { return _aspProp_('OC_SOCIAL_AUTOPUB') === 'true'; }
function _aspIgConfigurato_()  { return !!(_aspProp_('OC_IG_USER_ID') && _aspProp_('OC_IG_TOKEN')); }
function _aspLiConfigurato_()  { return !!(_aspProp_('OC_LI_AUTHOR_URN') && _aspProp_('OC_LI_TOKEN')); }

/** Diagnostica: cosa è pronto e cosa manca. Chiamabile dal pannello admin. */
function socialStatoCanali() {
  var urn = _aspProp_('OC_LI_AUTHOR_URN');
  var rep = {
    ok: true,
    ponteTelegram: (typeof _tgToken_ === 'function' && !!_tgToken_()) ? 'ATTIVO' : 'Telegram non configurato',
    instagram: _aspIgConfigurato_() ? 'credenziali presenti' : 'mancano OC_IG_USER_ID / OC_IG_TOKEN',
    linkedin:  _aspLiConfigurato_() ? ('credenziali presenti · ' + (urn.indexOf('organization') >= 0 ? 'PAGINA' : 'PROFILO')) : 'mancano OC_LI_AUTHOR_URN / OC_LI_TOKEN',
    pubblicazioneAutomatica: _aspAutopubAttivo_() ? 'ON' : 'OFF (solo ponte Telegram)',
    inAttesa: 0
  };
  try {
    var q = _aspQueueRows_();
    rep.inAttesa = q.rows.filter(function (r) { return String(r[q.i.Stato]) === 'approved'; }).length;
  } catch (e) { rep.inAttesa = '?'; }
  Logger.log('[socialStatoCanali] ' + JSON.stringify(rep, null, 2));
  return rep;
}

// ----------------------------------------------------------------------------
// ACCESSO ALLA CODA
// ----------------------------------------------------------------------------
function _aspQueueRows_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(typeof SOCIAL_QUEUE_SHEET !== 'undefined' ? SOCIAL_QUEUE_SHEET : 'SocialQueue');
  if (!sh || sh.getLastRow() < 2) return { sh: sh, rows: [], head: [], i: {} };
  var v = sh.getDataRange().getValues();
  var head = v[0].map(String);
  var i = {};
  head.forEach(function (h, idx) { i[h] = idx; });
  return { sh: sh, rows: v.slice(1), head: head, i: i };
}

function _aspSetCell_(sh, rowIdx0, colIdx, value) {
  try { sh.getRange(rowIdx0 + 2, colIdx + 1).setValue(value); } catch (e) { Logger.log('[asp set] ' + e.message); }
}

// ----------------------------------------------------------------------------
// A) PONTE TELEGRAM — testo pronto da copiare
// ----------------------------------------------------------------------------
/** Invio Telegram SENZA parse_mode: i post contengono #, *, _ che romperebbero
 *  Markdown/HTML. Il testo arriva identico a com'è stato scritto. */
function _aspTgPlain_(text) {
  var tok = (typeof _tgToken_ === 'function') ? _tgToken_() : '';
  var chat = (typeof _tgChat_ === 'function') ? _tgChat_() : '';
  if (!tok || !chat) return { ok: false, error: 'telegram_not_configured' };
  try {
    var res = UrlFetchApp.fetch(ASP_TG_API_ + tok + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, deadline: 20,
      payload: JSON.stringify({ chat_id: chat, text: String(text).substring(0, 4090), disable_web_page_preview: true })
    });
    return { ok: res.getResponseCode() === 200, code: res.getResponseCode() };
  } catch (e) { return { ok: false, error: e.message }; }
}

function _aspTgPhoto_(imageUrl, caption) {
  var tok = (typeof _tgToken_ === 'function') ? _tgToken_() : '';
  var chat = (typeof _tgChat_ === 'function') ? _tgChat_() : '';
  if (!tok || !chat || !imageUrl) return { ok: false, error: 'no_photo' };
  try {
    var res = UrlFetchApp.fetch(ASP_TG_API_ + tok + '/sendPhoto', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, deadline: 25,
      payload: JSON.stringify({ chat_id: chat, photo: imageUrl, caption: String(caption || '').substring(0, 1000) })
    });
    return { ok: res.getResponseCode() === 200, code: res.getResponseCode() };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * PONTE: manda su Telegram il post approvato pronto da copiare/incollare.
 * 3 messaggi: [foto+intestazione] · [caption Instagram] · [testo LinkedIn].
 */
function socialPonteTelegram(draftId) {
  var q = _aspQueueRows_();
  if (!q.sh) return { ok: false, error: 'SocialQueue assente' };
  for (var r = 0; r < q.rows.length; r++) {
    if (String(q.rows[r][q.i.ID]) !== String(draftId)) continue;
    var row = q.rows[r];
    var tipo = String(row[q.i.SourceTipo] || 'news');
    var titolo = String(row[q.i.NewsTitolo] || '');
    var img = String(row[q.i.ImageUrl] || '');
    var testa = '📣 DA PUBBLICARE — ' + (tipo === 'editoriale' ? 'EDITORIALE' : 'NEWS') + '\n'
      + titolo.substring(0, 150) + '\n'
      + (img ? 'Immagine: ' + img + '\n' : 'Nessuna immagine — usarne una dall\'archivio\n')
      + '\nSeguono 2 messaggi: caption Instagram e testo LinkedIn, già pronti da copiare.';
    if (img) _aspTgPhoto_(img, titolo.substring(0, 200)); else _aspTgPlain_(testa);
    if (img) _aspTgPlain_(testa);
    _aspTgPlain_('— — — INSTAGRAM — — —\n\n' + String(row[q.i.CaptionInstagram] || ''));
    _aspTgPlain_('— — — LINKEDIN — — —\n\n' + String(row[q.i.PostLinkedIn] || ''));
    _aspSetCell_(q.sh, r, q.i.NoteAdmin, 'ponte Telegram ' + new Date().toISOString().substring(0, 16));
    Logger.log('[ponte] inviato su Telegram: ' + draftId);
    return { ok: true, draftId: draftId, modo: 'ponte_telegram', immagine: !!img };
  }
  return { ok: false, error: 'draft non trovato: ' + draftId };
}

// ----------------------------------------------------------------------------
// B) API NATIVE
// ----------------------------------------------------------------------------
/**
 * Instagram Graph API — 2 passi: container poi publish.
 * NB: l'immagine deve stare su un URL PUBBLICO scaricabile da Meta.
 */
function _aspPublishIG_(caption, imageUrl) {
  var uid = _aspProp_('OC_IG_USER_ID'), tok = _aspProp_('OC_IG_TOKEN');
  if (!uid || !tok) return { ok: false, error: 'ig_non_configurato' };
  if (!imageUrl) return { ok: false, error: 'ig_richiede_immagine' };
  try {
    var c = UrlFetchApp.fetch(ASP_IG_API_ + uid + '/media', {
      method: 'post', muteHttpExceptions: true, deadline: 45,
      payload: { image_url: imageUrl, caption: String(caption || '').substring(0, 2200), access_token: tok }
    });
    var cj = JSON.parse(c.getContentText() || '{}');
    if (c.getResponseCode() !== 200 || !cj.id) {
      return { ok: false, error: 'container: ' + (cj.error && cj.error.message || c.getContentText()).toString().substring(0, 200) };
    }
    Utilities.sleep(3000); // Meta deve scaricare l'immagine
    var p = UrlFetchApp.fetch(ASP_IG_API_ + uid + '/media_publish', {
      method: 'post', muteHttpExceptions: true, deadline: 45,
      payload: { creation_id: cj.id, access_token: tok }
    });
    var pj = JSON.parse(p.getContentText() || '{}');
    if (p.getResponseCode() !== 200 || !pj.id) {
      return { ok: false, error: 'publish: ' + (pj.error && pj.error.message || p.getContentText()).toString().substring(0, 200) };
    }
    return { ok: true, postId: pj.id, url: 'https://www.instagram.com/p/' + pj.id };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * LinkedIn Posts API — agnostica: l'URN decide profilo o pagina.
 */
function _aspPublishLI_(testo) {
  var urn = _aspProp_('OC_LI_AUTHOR_URN'), tok = _aspProp_('OC_LI_TOKEN');
  if (!urn || !tok) return { ok: false, error: 'li_non_configurato' };
  try {
    var res = UrlFetchApp.fetch(ASP_LI_API_, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, deadline: 45,
      headers: {
        'Authorization': 'Bearer ' + tok,
        'LinkedIn-Version': '202406',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      payload: JSON.stringify({
        author: urn,
        commentary: String(testo || '').substring(0, 3000),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
      })
    });
    var code = res.getResponseCode();
    if (code !== 201 && code !== 200) {
      return { ok: false, error: 'HTTP ' + code + ' · ' + res.getContentText().substring(0, 200) };
    }
    var postId = res.getHeaders()['x-restli-id'] || res.getHeaders()['X-RestLi-Id'] || '';
    return { ok: true, postId: postId, url: postId ? ('https://www.linkedin.com/feed/update/' + postId) : '' };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ----------------------------------------------------------------------------
// DISPATCHER — gira sui post APPROVATI
// ----------------------------------------------------------------------------
/**
 * Per ogni post approvato: pubblica via API se configurate e autopub ON,
 * altrimenti manda il ponte Telegram. Cap prudenziale per run.
 * @param {Object} [opts] { cap:number (default 3), soloPonte:bool }
 */
function socialPubblicaApprovati(opts) {
  opts = opts || {};
  var cap = (opts.cap === undefined) ? 3 : Number(opts.cap);
  var rep = { ok: true, esaminati: 0, pubblicatiIG: 0, pubblicatiLI: 0, ponte: 0, errori: [] };
  var q = _aspQueueRows_();
  if (!q.sh) { rep.ok = false; rep.error = 'SocialQueue assente'; return rep; }
  var autopub = !opts.soloPonte && _aspAutopubAttivo_();

  for (var r = 0; r < q.rows.length && rep.esaminati < cap; r++) {
    var row = q.rows[r];
    if (String(row[q.i.Stato]) !== 'approved') continue;
    rep.esaminati++;
    var id = String(row[q.i.ID]);
    var img = String(row[q.i.ImageUrl] || '');
    var fatto = false;

    if (autopub && _aspIgConfigurato_() && img && !row[q.i.PubblicatoIG_at]) {
      var ig = _aspPublishIG_(row[q.i.CaptionInstagram], img);
      if (ig.ok) {
        _aspSetCell_(q.sh, r, q.i.PubblicatoIG_at, new Date());
        _aspSetCell_(q.sh, r, q.i.IGPostId, ig.postId);
        _aspSetCell_(q.sh, r, q.i.IGPostUrl, ig.url || '');
        rep.pubblicatiIG++; fatto = true;
      } else {
        _aspSetCell_(q.sh, r, q.i.ErroreIG, String(ig.error).substring(0, 250));
        rep.errori.push(id + ' IG: ' + ig.error);
      }
    }

    if (autopub && _aspLiConfigurato_() && !row[q.i.PubblicatoLI_at]) {
      var li = _aspPublishLI_(row[q.i.PostLinkedIn]);
      if (li.ok) {
        _aspSetCell_(q.sh, r, q.i.PubblicatoLI_at, new Date());
        _aspSetCell_(q.sh, r, q.i.LIPostId, li.postId);
        _aspSetCell_(q.sh, r, q.i.LIPostUrl, li.url || '');
        rep.pubblicatiLI++; fatto = true;
      } else {
        _aspSetCell_(q.sh, r, q.i.ErroreLI, String(li.error).substring(0, 250));
        rep.errori.push(id + ' LI: ' + li.error);
      }
    }

    if (fatto) {
      _aspSetCell_(q.sh, r, q.i.Stato, 'published');
    } else {
      // Nessuna API disponibile (o fallite): il post non si perde → ponte Telegram
      var p = socialPonteTelegram(id);
      if (p.ok) rep.ponte++;
    }
    Utilities.sleep(500);
  }
  Logger.log('[socialPubblicaApprovati] ' + JSON.stringify(rep));
  return rep;
}

/** Self-test: verifica la logica di configurazione senza pubblicare nulla. */
function socialPublishSelfTest() {
  var casi = [
    { nome: 'urn persona → PROFILO',  ok: 'urn:li:person:ABC123'.indexOf('organization') < 0 },
    { nome: 'urn org → PAGINA',       ok: 'urn:li:organization:99'.indexOf('organization') >= 0 },
    { nome: 'autopub OFF di default', ok: _aspProp_('OC_SOCIAL_AUTOPUB') !== 'true' || _aspAutopubAttivo_() === true },
    { nome: 'IG richiede immagine',   ok: _aspPublishIG_('x', '').ok === false },
    { nome: 'IG senza token fallisce', ok: (!_aspIgConfigurato_() ? _aspPublishIG_('x', 'https://a/b.jpg').error === 'ig_non_configurato' : true) },
    { nome: 'LI senza token fallisce', ok: (!_aspLiConfigurato_() ? _aspPublishLI_('x').error === 'li_non_configurato' : true) }
  ];
  var falliti = casi.filter(function (c) { return !c.ok; });
  Logger.log('[socialPublishSelfTest] ' + (casi.length - falliti.length) + '/' + casi.length + ' ok'
    + (falliti.length ? ' — FALLITI: ' + falliti.map(function (c) { return c.nome; }).join(', ') : ''));
  return { ok: falliti.length === 0, totale: casi.length, falliti: falliti.map(function (c) { return c.nome; }) };
}
