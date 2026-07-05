/**
 * ============================================================================
 *  Editoriale_v1.js — E1 "Capo Redattore" — Editoriale settimanale
 * ============================================================================
 *  v4.22 (2026-06-07)
 *  Autore: Silvano Straccini / Sinopia + Claude
 *
 *  SCOPO
 *  -----
 *  Ogni settimana assembla un brief dal Knowledge Layer (entità/temi caldi)
 *  + contenuti freschi (norme, studi, podcast/video, news autorevoli), poi
 *  Claude scrive un editoriale di 250-400 parole con voce da capo redattore.
 *  L'editoriale viene approvato dall'admin e anteposto alla newsletter.
 *
 *  FUNZIONI PUBBLICHE (menu Esegui GAS)
 *  -------------------------------------
 *  editorialeGenera()           — genera bozza editoriale per la settimana corrente
 *  editorialeApprova()          — approva la bozza più recente
 *  editorialeTest()             — dry-run: costruisce brief e lo logga (no Claude)
 *  editorialeSetupTrigger()     — installa trigger settimanale (domenica 18:00)
 *  getEditorialeCorrente()      — ritorna l'editoriale approvato per la settimana (usato dal digest builder)
 *
 *  DIPENDENZE
 *  ----------
 *  - KnowledgeLayer_v1.js (fogli Entita + Occorrenze)
 *  - Constants.js (OC_EDITORIALI_SHEET, OC_FONTI_AUTOREVOLI, OC_EDITORIALE_CONFIG)
 *  - Codice.js (_getConfig_() per CLAUDE_API_KEY)
 *
 * ============================================================================
 */

// ============================================================================
// SETUP FOGLIO
// ============================================================================

function _ed_ss_() {
  return (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
}

function _ed_ensureSheet_() {
  var ss = _ed_ss_();
  var sh = ss.getSheetByName(OC_EDITORIALI_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_EDITORIALI_SHEET);
    sh.appendRow(OC_EDITORIALI_HEADERS);
    sh.getRange(1, 1, 1, OC_EDITORIALI_HEADERS.length)
      .setFontWeight('bold').setBackground('#8B3A1F').setFontColor('#fff');
    sh.setFrozenRows(1);
    Logger.log('[Editoriale] Foglio ' + OC_EDITORIALI_SHEET + ' creato');
  }
  return sh;
}

// ============================================================================
// SETTIMANA ISO (es. "2026-W23")
// ============================================================================

function _ed_isoWeek_(d) {
  d = d || new Date();
  var jan1 = new Date(d.getFullYear(), 0, 1);
  var days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  var week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + (week < 10 ? '0' : '') + week;
}

// ============================================================================
// BRIEF SETTIMANALE — assembla i dati per il prompt
// ============================================================================

function _ed_costruisciBrief_() {
  var cfg = OC_EDITORIALE_CONFIG;
  var ss = _ed_ss_();
  var now = new Date();
  var soglia = new Date(now.getTime() - cfg.FINESTRA_SETTIMANA_GG * 86400000);
  var sogliaMedia = new Date(now.getTime() - cfg.FINESTRA_MEDIA_SETTIMANE * 7 * 86400000);

  var brief = {
    settimana: _ed_isoWeek_(now),
    dataGenerazione: now.toISOString(),
    cosasiMuove: [],    // top entità con delta occorrenze (da L2)
    opinionLeader: [],  // top persone influenti (da L3)
    norme: [],          // contenuti tipo norma
    studi: [],          // pubblicazioni/studi recenti
    dinamico: [],       // podcast/video recenti
    newsAutorevoli: []  // news da fonti autorevoli
  };

  // --- 1. COSA SI MUOVE (dal Trend Layer L2, con fallback) ---
  try {
    if (typeof trendTop === 'function') {
      var trends = trendTop({ limite: cfg.MAX_ENTITA_BRIEF });
      if (trends && trends.ok) {
        // Unisci crescita + esplosivi + emergenti (priorità: esplosivi, poi emergenti, poi crescita)
        var allTrend = [].concat(trends.esplosivi || [], trends.emergenti || [], trends.crescita || []);
        brief.cosasiMuove = allTrend.slice(0, cfg.MAX_ENTITA_BRIEF).map(function(t) {
          return {
            nome: String(t.nome_entita || ''), tipo: String(t.tipo_entita || ''),
            score: Number(t.score_autorevolezza || 0),
            occorrenzeSettimana: Number(t.occ_settimana || 0),
            delta: Number(t.momentum || 0),
            segnale: String(t.segnale || '')
          };
        });
      }
    }
  } catch (e) { Logger.log('[Brief] cosasiMuove (L2) err: ' + e.message); }

  // --- 1b. OPINION LEADER (dal Leader Layer L3) ---
  try {
    if (typeof leaderTop === 'function') {
      var leaders = leaderTop({ limite: 5 });
      if (leaders && leaders.ok && leaders.leader) {
        brief.opinionLeader = leaders.leader.map(function(l) {
          return {
            nome: String(l.nome || ''),
            strutture: String(l.strutture_associate || ''),
            score: Number(l.score_leader || 0),
            occorrenze: Number(l.n_occorrenze || 0)
          };
        });
      }
    }
  } catch (e) { Logger.log('[Brief] opinionLeader (L3) err: ' + e.message); }

  // --- 2-5. CONTENUTI RECENTI (news, norme, podcast, video, pubblicazioni) ---
  var fontiAutorevoli = (typeof OC_FONTI_AUTOREVOLI !== 'undefined') ? OC_FONTI_AUTOREVOLI : [];

  // Helper: legge un foglio e filtra per data recente
  function readSheet(sheetName, dateCol, limit) {
    try {
      var sh = ss.getSheetByName(sheetName);
      if (!sh || sh.getLastRow() < 2) return [];
      var vals = sh.getDataRange().getValues();
      var H = vals[0];
      var iDate = H.indexOf(dateCol);
      // v4.22 fix: se la colonna data non esiste, prova varianti comuni
      if (iDate < 0) iDate = H.indexOf('DataPubblicazione');
      if (iDate < 0) iDate = H.indexOf('Data');
      if (iDate < 0) iDate = H.indexOf('data');
      if (iDate < 0) return []; // nessuna colonna data trovata → skip intero foglio
      var items = [];
      for (var ri = 1; ri < vals.length; ri++) {
        var dt = vals[ri][iDate] ? new Date(vals[ri][iDate]) : null;
        if (!dt || isNaN(dt.getTime()) || dt < soglia) continue;
        var obj = {};
        for (var ci = 0; ci < H.length; ci++) obj[String(H[ci])] = vals[ri][ci];
        obj._date = dt;
        items.push(obj);
      }
      items.sort(function(a, b) { return b._date - a._date; });
      return items.slice(0, limit);
    } catch (e) { return []; }
  }

  function isFonteAutorevole(fonteName) {
    if (!fonteName) return false;
    var lower = String(fonteName).toLowerCase();
    return fontiAutorevoli.some(function(fa) { return lower.indexOf(fa) >= 0; });
  }

  // 2. NORME
  try {
    var allItems = readSheet('Items', 'DataPubblicazione', 200);
    // Filtra per tipologia "norma" o parole chiave normative
    var normeKw = ['decreto', 'circolare', 'legge', 'dpcm', 'regolamento', 'direttiva', 'normativa', 'dm ', 'gazzetta'];
    brief.norme = allItems.filter(function(it) {
      var txt = (String(it.Titolo || '') + ' ' + String(it.SommarioAI || '')).toLowerCase();
      return normeKw.some(function(kw) { return txt.indexOf(kw) >= 0; });
    }).slice(0, cfg.MAX_NORME_BRIEF).map(function(it) {
      return { titolo: String(it.Titolo || ''), sommario: String(it.SommarioAI || '').substring(0, 200), fonte: String(it.Fonte || it.AmbitoLabel || '') };
    });
  } catch (e) { Logger.log('[Brief] norme err: ' + e.message); }

  // 3. STUDI/PUBBLICAZIONI
  try {
    var pubItems = readSheet('Pubblicazioni', 'DataAggiunta', cfg.MAX_STUDI_BRIEF * 2);
    brief.studi = pubItems.slice(0, cfg.MAX_STUDI_BRIEF).map(function(it) {
      return { titolo: String(it.Titolo || ''), autore: String(it.Autore || ''), editore: String(it.Editore || '') };
    });
  } catch (e) { Logger.log('[Brief] studi err: ' + e.message); }

  // 4. DINAMICO (podcast + video recenti)
  try {
    var podItems = readSheet('Podcast', 'DataPubblicazione', cfg.MAX_DINAMICO_BRIEF * 3);
    brief.dinamico = podItems.slice(0, cfg.MAX_DINAMICO_BRIEF).map(function(it) {
      var isPod = !String(it.ID || '').toUpperCase().startsWith('VID');
      return { titolo: String(it.Titolo || ''), tipo: isPod ? 'podcast' : 'video', serie: String(it.Serie || '') };
    });
  } catch (e) { Logger.log('[Brief] dinamico err: ' + e.message); }

  // 5. NEWS AUTOREVOLI
  try {
    var newsItems = readSheet('Items', 'DataPubblicazione', 100);
    brief.newsAutorevoli = newsItems.filter(function(it) {
      return isFonteAutorevole(it.Fonte || it.AmbitoLabel || '');
    }).slice(0, cfg.MAX_NEWS_AUTOREVOLI_BRIEF).map(function(it) {
      return { titolo: String(it.Titolo || ''), sommario: String(it.SommarioAI || '').substring(0, 200), fonte: String(it.Fonte || '') };
    });
  } catch (e) { Logger.log('[Brief] newsAutorevoli err: ' + e.message); }

  return brief;
}

// ============================================================================
// GENERAZIONE EDITORIALE VIA CLAUDE
// ============================================================================

function _ed_generaConClaude_(brief) {
  var apiKey = '';
  try {
    if (typeof _getConfig_ === 'function') apiKey = _getConfig_().CLAUDE_API_KEY;
    if (!apiKey && typeof _claudeKey_ === 'function') apiKey = _claudeKey_();
  } catch (_) {}
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY mancante' };

  // Costruisci il prompt
  var briefText = '## BRIEF SETTIMANALE — ' + brief.settimana + '\n\n';

  briefText += '### COSA SI MUOVE (entita/temi in crescita)\n';
  if (brief.cosasiMuove.length) {
    brief.cosasiMuove.forEach(function(e) {
      briefText += '- ' + e.nome + ' (' + e.tipo + ', score ' + e.score + ', +' + e.delta + ' vs media)\n';
    });
  } else { briefText += '- Nessun trend significativo questa settimana.\n'; }

  briefText += '\n### VOCI AUTOREVOLI (opinion leader del settore)\n';
  if (brief.opinionLeader && brief.opinionLeader.length) {
    brief.opinionLeader.forEach(function(l) {
      briefText += '- ' + l.nome + (l.strutture ? ' (' + l.strutture + ')' : '') + ' — score ' + l.score + ', ' + l.occorrenze + ' citazioni\n';
    });
  } else { briefText += '- Nessun opinion leader rilevante questa settimana.\n'; }

  briefText += '\n### NORME E REGOLAMENTI\n';
  if (brief.norme.length) {
    brief.norme.forEach(function(n) { briefText += '- ' + n.titolo + ' [' + n.fonte + ']: ' + n.sommario + '\n'; });
  } else { briefText += '- Nessun aggiornamento normativo rilevante.\n'; }

  briefText += '\n### STUDI E PUBBLICAZIONI\n';
  if (brief.studi.length) {
    brief.studi.forEach(function(s) { briefText += '- ' + s.titolo + ' di ' + s.autore + (s.editore ? ' (' + s.editore + ')' : '') + '\n'; });
  } else { briefText += '- Nessuna pubblicazione recente.\n'; }

  briefText += '\n### PODCAST E VIDEO\n';
  if (brief.dinamico.length) {
    brief.dinamico.forEach(function(d) { briefText += '- [' + d.tipo + '] ' + d.titolo + (d.serie ? ' — ' + d.serie : '') + '\n'; });
  } else { briefText += '- Nessun contenuto multimediale recente.\n'; }

  briefText += '\n### NEWS DA FONTI AUTOREVOLI\n';
  if (brief.newsAutorevoli.length) {
    brief.newsAutorevoli.forEach(function(n) { briefText += '- ' + n.titolo + ' [' + n.fonte + ']: ' + n.sommario + '\n'; });
  } else { briefText += '- Nessuna news da fonti autorevoli.\n'; }

  var systemPrompt = 'Sei il capo redattore di Sinopia, l\'Osservatorio Culturale italiano per professionisti di musei e luoghi della cultura. '
    + 'Scrivi un approfondimento settimanale di ' + OC_EDITORIALE_CONFIG.MIN_PAROLE + '-' + OC_EDITORIALE_CONFIG.MAX_PAROLE + ' parole. '
    + 'Il titolo della rubrica e "Approfondimento della settimana" — il titolo che generi deve essere specifico sul contenuto, mai generico. '
    + 'Stile: autorevole ma accessibile, professionale, mai promozionale ne sensazionalistico. '
    + 'REGOLE IMPORTANTI: '
    + '- NON iniziare MAI con "La settimana che si chiude" o formule simili. Entra subito nel merito del tema. '
    + '- Il titolo deve essere specifico e incisivo (max 10 parole), mai generico. '
    + '- Cita le fonti nel testo: quando menzioni un dato, uno studio o una notizia, indica tra parentesi la fonte (es. "secondo Symbola", "come riporta Artribune", "dati Federculture"). '
    + '- Struttura: apri con il tema dominante, poi tocca i pilastri (norme, studi, voci dal settore). '
    + '- Chiudi con una riflessione o domanda aperta per il lettore. '
    + 'Lingua: italiano. NO emoji, NO bullet point, NO titoli di sezione interni — testo discorsivo fluido.';

  var userPrompt = 'Ecco il brief settimanale con i dati dell\'Osservatorio. Scrivi l\'approfondimento basandoti su questi dati. Cita sempre le fonti nel testo.\n\n' + briefText
    + '\n\nRispondi SOLO con un JSON valido con due campi: {"titolo":"...","testo":"..."}. Nessun testo fuori dal JSON.';

  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: (typeof OC_CLAUDE_MODEL !== 'undefined') ? OC_CLAUDE_MODEL : 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      muteHttpExceptions: true,
      deadline: 30
    });

    var code = resp.getResponseCode();
    if (code !== 200) {
      return { ok: false, error: 'Claude HTTP ' + code + ': ' + resp.getContentText().substring(0, 300) };
    }

    var body = JSON.parse(resp.getContentText());
    var text = (body.content && body.content[0] && body.content[0].text) || '';

    // Estrai JSON dalla risposta
    var jsonMatch = text.match(/\{[\s\S]*"titolo"[\s\S]*"testo"[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: 'Risposta Claude non contiene JSON valido', raw: text.substring(0, 500) };

    var result = JSON.parse(jsonMatch[0]);
    return { ok: true, titolo: result.titolo || '', testo: result.testo || '' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// PERSISTENZA — salva/legge bozze nel foglio Editoriali
// ============================================================================

function _ed_salvaBozza_(titolo, testo, brief) {
  var sh = _ed_ensureSheet_();
  var id = 'ED' + Date.now();
  var settimana = _ed_isoWeek_();
  var pilastri = {
    entitaCitate: (brief.cosasiMuove || []).map(function(e) { return e.nome; }),
    norme: (brief.norme || []).length,
    studi: (brief.studi || []).length,
    dinamico: (brief.dinamico || []).length,
    newsAutorevoli: (brief.newsAutorevoli || []).length
  };

  sh.appendRow([
    id,
    settimana,
    new Date().toISOString(),
    titolo,
    testo,
    JSON.stringify(pilastri),
    'bozza',        // stato
    '',             // approvato_da
    '',             // data_approvazione
    'Generato automaticamente'
  ]);

  return { ok: true, id: id, settimana: settimana, titolo: titolo, parole: testo.split(/\s+/).length };
}

function _ed_approva_(token) {
  var sh = _ed_ensureSheet_();
  if (sh.getLastRow() < 2) return { ok: false, error: 'Nessuna bozza da approvare' };

  var vals = sh.getDataRange().getValues();
  var H = vals[0];
  var iStato = H.indexOf('stato');
  var iAppr = H.indexOf('approvato_da');
  var iDataAppr = H.indexOf('data_approvazione');

  // Trova l'ultima bozza (dal fondo)
  for (var r = vals.length - 1; r >= 1; r--) {
    if (String(vals[r][iStato]) === 'bozza') {
      sh.getRange(r + 1, iStato + 1).setValue('approvato');
      var adminEmail = '';
      try {
        if (typeof getCurrentUserAuth === 'function') {
          var auth = getCurrentUserAuth(token);
          adminEmail = (auth && auth.email) || '';
        }
      } catch (_) {}
      sh.getRange(r + 1, iAppr + 1).setValue(adminEmail || 'admin');
      sh.getRange(r + 1, iDataAppr + 1).setValue(new Date().toISOString());
      return { ok: true, id: vals[r][0], titolo: vals[r][H.indexOf('titolo')], stato: 'approvato' };
    }
  }
  return { ok: false, error: 'Nessuna bozza in stato "bozza" trovata' };
}

/**
 * Ritorna l'editoriale approvato per la settimana corrente (o la più recente).
 * Usato dal builder newsletter per anteporre l'intro.
 * @return {Object|null} {titolo, testo, settimana} o null se non c'è
 */
function getEditorialeCorrente() {
  try {
    var sh = _ed_ss_().getSheetByName(OC_EDITORIALI_SHEET);
    if (!sh || sh.getLastRow() < 2) return null;

    var vals = sh.getDataRange().getValues();
    var H = vals[0];
    var iStato = H.indexOf('stato');
    var iTitolo = H.indexOf('titolo');
    var iTesto = H.indexOf('testo');
    var iSett = H.indexOf('settimana');

    // Cerca l'ultimo approvato (dal fondo)
    for (var r = vals.length - 1; r >= 1; r--) {
      if (String(vals[r][iStato]) === 'approvato') {
        return {
          titolo: String(vals[r][iTitolo] || ''),
          testo: String(vals[r][iTesto] || ''),
          settimana: String(vals[r][iSett] || '')
        };
      }
    }
    return null;
  } catch (e) {
    Logger.log('[getEditorialeCorrente] err: ' + e.message);
    return null;
  }
}

/**
 * Ritorna l'ultima bozza (per preview admin).
 */
function getEditoriale(opts) {
  opts = opts || {};
  try {
    var sh = _ed_ss_().getSheetByName(OC_EDITORIALI_SHEET);
    if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'Nessun editoriale' };
    var vals = sh.getDataRange().getValues();
    var H = vals[0];
    var r = vals.length - 1; // ultima riga
    var obj = {};
    for (var c = 0; c < H.length; c++) obj[H[c]] = vals[r][c];
    return { ok: true, editoriale: obj };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ============================================================================
// NOTIFICA ADMIN
// ============================================================================

function _ed_notificaAdmin_(titolo, parole) {
  try {
    if (typeof sendTelegram === 'function') {
      sendTelegram('*Editoriale settimanale pronto*\n\n'
        + 'Titolo: _' + titolo + '_\n'
        + 'Parole: ' + parole + '\n\n'
        + 'Apri il pannello admin > Newsletter per revisionare e approvare.');
    }
  } catch (_) {}
  try {
    var adminEmails = (typeof OC_ADMIN_EMAILS !== 'undefined') ? OC_ADMIN_EMAILS : [];
    adminEmails.forEach(function(email) {
      MailApp.sendEmail({
        to: email,
        subject: '[Sinopia] Editoriale settimanale pronto per approvazione',
        htmlBody: '<div style="font-family:sans-serif;max-width:600px;color:#333">'
          + '<h2 style="color:#8B3A1F">Editoriale pronto</h2>'
          + '<p><b>Titolo:</b> ' + titolo + '</p>'
          + '<p><b>Parole:</b> ' + parole + '</p>'
          + '<p>Apri il pannello admin per revisionare e approvare l\'editoriale prima dell\'invio della newsletter.</p>'
          + '<p style="color:#888;font-size:12px">Sinopia — Osservatorio Culturale</p></div>',
        name: 'Sinopia — Osservatorio Culturale'
      });
    });
  } catch (_) {}
}

// ============================================================================
// TRIGGER SETUP
// ============================================================================

function _ed_setupTrigger_() {
  // Rimuovi trigger esistenti per evitare duplicati
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'editorialeGenera') ScriptApp.deleteTrigger(t);
  });
  // Domenica 18:00 (prima del digest del lunedì)
  ScriptApp.newTrigger('editorialeGenera')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(18)
    .create();
  Logger.log('[Editoriale] Trigger settimanale installato: domenica 18:00');
  return { ok: true, giorno: 'domenica', ora: 18 };
}

// ============================================================================
// ENTRY POINT PUBBLICI (menu Esegui GAS)
// ============================================================================

/** Genera bozza editoriale per la settimana corrente */
function editorialeGenera() {
  if (typeof _initLegacyConsts_ === 'function') _initLegacyConsts_();
  Logger.log('=== EDITORIALE SETTIMANALE — GENERAZIONE ===');

  // 1. Costruisci brief
  var brief = _ed_costruisciBrief_();
  Logger.log('[Editoriale] Brief: ' + JSON.stringify({
    entita: brief.cosasiMuove.length,
    norme: brief.norme.length,
    studi: brief.studi.length,
    dinamico: brief.dinamico.length,
    newsAutorevoli: brief.newsAutorevoli.length
  }));

  // 2. Genera con Claude
  var gen = _ed_generaConClaude_(brief);
  if (!gen.ok) {
    Logger.log('[Editoriale] Generazione FALLITA: ' + gen.error);
    return gen;
  }
  Logger.log('[Editoriale] Generato: "' + gen.titolo + '" (' + gen.testo.split(/\s+/).length + ' parole)');

  // 3. Salva bozza
  var saved = _ed_salvaBozza_(gen.titolo, gen.testo, brief);
  Logger.log('[Editoriale] Bozza salvata: ' + saved.id);

  // 4. Notifica admin
  _ed_notificaAdmin_(gen.titolo, gen.testo.split(/\s+/).length);

  return saved;
}

/** Approva la bozza più recente */
function editorialeApprova(token) {
  var tk = token || null;
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(tk)) {
    return { ok: false, error: 'forbidden' };
  }
  return _ed_approva_(tk);
}

/** Dry-run: costruisce il brief e lo logga (senza chiamare Claude) */
function editorialeTest() {
  if (typeof _initLegacyConsts_ === 'function') _initLegacyConsts_();
  Logger.log('=== EDITORIALE TEST (dry-run) ===');
  var brief = _ed_costruisciBrief_();
  Logger.log('Brief completo:\n' + JSON.stringify(brief, null, 2));
  return { ok: true, brief: brief };
}

/** Installa trigger settimanale */
function editorialeSetupTrigger() {
  return _ed_setupTrigger_();
}
