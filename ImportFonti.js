// ============================================================================
// ImportFonti.js — Importazione fonti da archivio esterno
// v4.28.22 — 2026-08-04
//
// Percorso: chi compila riempie un foglio con poche colonne chiare, poi
// l'anteprima dice cosa entrerebbe e cosa no (con il motivo), e solo dopo si
// applica. Nessuna scrittura senza anteprima — la regola di questo progetto.
//
// CONTROLLI SVOLTI, in ordine:
//   1. campi obbligatori e valori ammessi (categoria, URL http/https)
//   2. duplicati DENTRO il file stesso
//   3. duplicati verso l'esistente: RegistroFonti, FontiFeed, FontiBandi_v5,
//      SocialFonti, FontiPodcast, FontiCandidate (comprese le SCARTATE: una
//      fonte già valutata e respinta non deve rientrare da un'altra porta)
//   4. SOVRAPPOSIZIONI: stesso dominio con URL diversa — non è un duplicato,
//      ma va visto (es. il feed generale e quello di categoria dello stesso
//      sito, che porterebbero gli stessi contenuti due volte)
//
// Le fonti importate entrano in QUARANTENA: raccolgono, ma i contenuti non
// vengono esposti finché la fonte non dimostra di produrre in modo pulito.
// Stessa politica dello Scout.
// ============================================================================

var IMP_SHEET = 'ImportFonti';

// Il modello: poche colonne, nomi in italiano, obbligatorie prima.
var IMP_COLONNE = [
  { nome: 'Categoria',  obbl: true,  aiuto: 'bandi | news | podcast | video | norme | libri | social | lavoro' },
  { nome: 'Nome',       obbl: true,  aiuto: 'Nome leggibile della fonte, come apparirà nei report' },
  { nome: 'URL',        obbl: true,  aiuto: 'Indirizzo del FEED (RSS/Atom) se esiste, altrimenti del sito' },
  { nome: 'Ente',       obbl: false, aiuto: 'Chi pubblica: ministero, regione, fondazione, testata…' },
  { nome: 'SitoWeb',    obbl: false, aiuto: 'Home page, se diversa dall’URL del feed' },
  { nome: 'Copertura',  obbl: false, aiuto: 'nazionale | regionale | internazionale | locale' },
  { nome: 'Regione',    obbl: false, aiuto: 'Solo per fonti regionali o locali' },
  { nome: 'Lingua',     obbl: false, aiuto: 'it | en | fr … (vuoto = it)' },
  { nome: 'Tipologie',  obbl: false, aiuto: 'Codici tassonomia separati da virgola: T1,T3,T9' },
  { nome: 'Ambiti',     obbl: false, aiuto: 'Numeri ambito separati da virgola: 1,3,5' },
  { nome: 'Note',       obbl: false, aiuto: 'Qualsiasi indicazione utile a chi valuterà la fonte' }
];

var IMP_CATEGORIE = ['bandi', 'news', 'podcast', 'video', 'norme', 'libri', 'social', 'lavoro'];

// ---------------------------------------------------------------------------
// Il modello da far compilare
// ---------------------------------------------------------------------------

/**
 * Crea (o ripristina) il foglio ImportFonti con intestazioni, legenda e due
 * righe di esempio. Idempotente: se il foglio esiste con dei dati, non li
 * tocca — aggiunge solo le colonne mancanti.
 */
function impCreaModello() {
  var ss = getMainSS();
  var sh = ss.getSheetByName(IMP_SHEET);
  var intest = IMP_COLONNE.map(function (c) { return c.nome; });

  if (!sh) {
    sh = ss.insertSheet(IMP_SHEET);
    sh.getRange(1, 1, 1, intest.length).setValues([intest])
      .setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#fff');
    sh.setFrozenRows(1);
    // legenda come nota sulla cella: non occupa righe, si legge al passaggio
    IMP_COLONNE.forEach(function (c, i) {
      sh.getRange(1, i + 1).setNote((c.obbl ? 'OBBLIGATORIA — ' : 'facoltativa — ') + c.aiuto);
    });
    sh.getRange(2, 1, 2, intest.length).setValues([
      ['bandi', 'Fondazione Esempio — Bandi cultura', 'https://esempio.it/bandi/feed', 'Fondazione Esempio',
       'https://esempio.it', 'nazionale', '', 'it', 'T1,T5', '3,4', 'riga di esempio: cancellare'],
      ['news', 'Rivista Esempio', 'https://rivista.esempio.it/rss', 'Rivista Esempio',
       '', 'internazionale', '', 'en', 'T9', '1', 'riga di esempio: cancellare']
    ]).setFontColor('#9A958B').setFontStyle('italic');
    sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 320);
  } else {
    var h = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
      .map(function (x) { return String(x || '').trim(); });
    var mancanti = intest.filter(function (n) { return h.indexOf(n) < 0; });
    if (mancanti.length) {
      sh.getRange(1, h.length + 1, 1, mancanti.length).setValues([mancanti])
        .setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#fff');
    }
  }
  return {
    ok: true, foglio: IMP_SHEET,
    colonne: IMP_COLONNE.map(function (c) { return c.nome + (c.obbl ? ' *' : ''); }),
    istruzioni: 'Compilare una riga per fonte. Le colonne con * sono obbligatorie. ' +
                'Cancellare le due righe di esempio prima di importare. ' +
                'Si può incollare direttamente da Excel o da un CSV.'
  };
}

// ---------------------------------------------------------------------------
// CSV — il formato di consegna
// ---------------------------------------------------------------------------

/**
 * Parser CSV robusto per il caso reale: chi compila usa Excel, e l'Excel
 * italiano salva con il PUNTO E VIRGOLA, non con la virgola. Gestisce anche
 * i campi tra virgolette (che possono contenere il separatore), le virgolette
 * raddoppiate, il BOM di Windows e le righe terminate CRLF.
 * @return {Array<Array<string>>} righe di celle
 */
function impParseCsv(testo) {
  var s = String(testo || '').replace(/^﻿/, '');   // via il BOM
  if (!s.trim()) return [];
  // separatore: quello più frequente nella prima riga fuori dalle virgolette
  var primaRiga = s.split(/\r?\n/)[0];
  var fuori = primaRiga.replace(/"[^"]*"/g, '');
  var sep = (fuori.split(';').length > fuori.split(',').length) ? ';' : ',';

  var righe = [], cella = '', riga = [], dentroVirgolette = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (dentroVirgolette) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cella += '"'; i++; }   // virgoletta raddoppiata
        else dentroVirgolette = false;
      } else cella += ch;
      continue;
    }
    if (ch === '"') { dentroVirgolette = true; continue; }
    if (ch === sep) { riga.push(cella); cella = ''; continue; }
    if (ch === '\n') { riga.push(cella); righe.push(riga); riga = []; cella = ''; continue; }
    if (ch === '\r') continue;
    cella += ch;
  }
  if (cella !== '' || riga.length) { riga.push(cella); righe.push(riga); }
  return righe.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

/**
 * Carica un CSV nel foglio ImportFonti, mappando le colonne per NOME (non per
 * posizione): chi compila può riordinarle o aggiungerne, purché le tre
 * obbligatorie ci siano. Dopo il caricamento si passa dall'anteprima come
 * sempre — questo non importa nulla nel sistema, riempie solo il foglio.
 */
function impCaricaCsv(testoCsv, token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  var righe = impParseCsv(testoCsv);
  if (righe.length < 2) return { ok: false, error: 'CSV vuoto o con la sola intestazione.' };

  var intestCsv = righe[0].map(function (x) { return String(x || '').trim(); });
  var intestCsvLower = intestCsv.map(function (x) { return x.toLowerCase(); });
  // sinonimi tollerati: chi compila non deve indovinare il nome esatto
  var SINONIMI = {
    'categoria': ['categoria', 'tipo', 'sezione', 'canale'],
    'nome': ['nome', 'titolo', 'fonte', 'denominazione'],
    'url': ['url', 'feed', 'rss', 'link', 'indirizzo', 'url_feed'],
    'ente': ['ente', 'editore', 'organizzazione', 'istituzione'],
    'sitoweb': ['sitoweb', 'sito', 'homepage', 'sito web', 'url_sito'],
    'copertura': ['copertura', 'ambito geografico', 'scala'],
    'regione': ['regione', 'territorio'],
    'lingua': ['lingua', 'language'],
    'tipologie': ['tipologie', 'tipologia', 'tassonomia'],
    'ambiti': ['ambiti', 'ambito'],
    'note': ['note', 'commento', 'osservazioni']
  };
  function trovaCol(nomeTarget) {
    var alt = SINONIMI[nomeTarget.toLowerCase()] || [nomeTarget.toLowerCase()];
    for (var a = 0; a < alt.length; a++) {
      var i = intestCsvLower.indexOf(alt[a]);
      if (i >= 0) return i;
    }
    return -1;
  }

  var mappa = {}, mancanti = [];
  IMP_COLONNE.forEach(function (c) {
    var i = trovaCol(c.nome);
    mappa[c.nome] = i;
    if (i < 0 && c.obbl) mancanti.push(c.nome);
  });
  if (mancanti.length) {
    return { ok: false,
      error: 'Nel CSV mancano le colonne obbligatorie: ' + mancanti.join(', '),
      intestazioniTrovate: intestCsv };
  }

  // scrive nel foglio secondo l'ordine del modello
  impCreaModello();
  var sh = getMainSS().getSheetByName(IMP_SHEET);
  // ripulisce i dati precedenti, lasciando l'intestazione
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();

  var ordine = IMP_COLONNE.map(function (c) { return c.nome; });
  var out = [];
  for (var r = 1; r < righe.length; r++) {
    var src = righe[r];
    out.push(ordine.map(function (n) {
      var i = mappa[n];
      return (i >= 0 && i < src.length) ? String(src[i] || '').trim() : '';
    }));
  }
  if (out.length) sh.getRange(2, 1, out.length, ordine.length).setValues(out);

  return {
    ok: true, righeCaricate: out.length,
    separatore: (impParseCsv(testoCsv.split(/\r?\n/)[0])[0] || []).length > 1 ? 'riconosciuto' : 'riconosciuto',
    colonneMappate: ordine.filter(function (n) { return mappa[n] >= 0; }),
    colonneAssenti: ordine.filter(function (n) { return mappa[n] < 0; }),
    nota: 'Dati caricati nel foglio ' + IMP_SHEET + '. Ora esegui l\'ANTEPRIMA prima di importare.'
  };
}

/** Il modello CSV pronto da consegnare, come testo. */
function impModelloCsv() {
  var intest = IMP_COLONNE.map(function (c) { return c.nome; }).join(';');
  var esempi = [
    'bandi;Fondazione Esempio — Bandi cultura;https://esempio.it/bandi/feed;Fondazione Esempio;https://esempio.it;nazionale;;it;"T1,T5";"3,4";riga di esempio: cancellare',
    'news;Rivista Esempio;https://rivista.esempio.it/rss;Rivista Esempio;;internazionale;;en;T9;1;riga di esempio: cancellare'
  ];
  return {
    ok: true,
    csv: [intest].concat(esempi).join('\n'),
    separatore: 'punto e virgola (;) — compatibile con Excel italiano',
    obbligatorie: IMP_COLONNE.filter(function (c) { return c.obbl; }).map(function (c) { return c.nome; }),
    legenda: IMP_COLONNE.map(function (c) { return c.nome + (c.obbl ? ' *' : '') + ' — ' + c.aiuto; })
  };
}

// ---------------------------------------------------------------------------
// Lettura e validazione
// ---------------------------------------------------------------------------

function _impNorm_(u) {
  if (typeof _normalizeFeedUrl_ === 'function') return _normalizeFeedUrl_(u);
  return String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

function _impDominio_(u) {
  var m = String(u || '').match(/^https?:\/\/([^\/\?#]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

/**
 * Indice di TUTTO l'esistente: per URL normalizzata e per dominio.
 * Il secondo serve a scoprire le sovrapposizioni, che i controlli per URL
 * non vedono.
 */
function _impEsistente_() {
  var ss = getMainSS();
  var perUrl = {}, perDominio = {};
  function assorbi(foglio, colonne, etichetta) {
    var sh = ss.getSheetByName(foglio);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getDataRange().getValues();
    var h = v[0].map(function (x) { return String(x || '').trim(); });
    var iNome = h.indexOf('Nome');
    var idx = colonne.map(function (c) { return h.indexOf(c); }).filter(function (i) { return i >= 0; });
    for (var r = 1; r < v.length; r++) {
      var nome = (iNome >= 0 ? String(v[r][iNome] || '') : '') || '(senza nome)';
      idx.forEach(function (i) {
        var u = String(v[r][i] || '');
        if (!u) return;
        var k = _impNorm_(u);
        if (k && !perUrl[k]) perUrl[k] = etichetta + ': ' + nome;
        var d = _impDominio_(u);
        if (d && !perDominio[d]) perDominio[d] = etichetta + ': ' + nome;
      });
    }
  }
  assorbi('RegistroFonti',  ['URL_Feed', 'URL_Sito'], 'Registro');
  assorbi('FontiFeed',      ['URL_Feed', 'URL_Sito'], 'FontiFeed');
  assorbi('FontiBandi_v5',  ['URL', 'RSS_URL', 'URL_Feed'], 'Fonti bandi');
  assorbi('SocialFonti',    ['URL'], 'Social');
  assorbi('FontiPodcast',   ['URL', 'URL_RSS'], 'Podcast legacy');
  // Le candidate contano ANCHE se scartate: una fonte già respinta non deve
  // rientrare da un'importazione. È la memoria permanente dello Scout.
  assorbi('FontiCandidate', ['URLPagina', 'FeedRilevato'], 'Candidate Scout');
  return { perUrl: perUrl, perDominio: perDominio };
}

/**
 * Anteprima dell'importazione: cosa entrerebbe, cosa no e perché.
 * Nessuna scrittura.
 */
function impAnteprima(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  var ss = getMainSS();
  var sh = ss.getSheetByName(IMP_SHEET);
  if (!sh || sh.getLastRow() < 2) {
    return { ok: false, error: 'Foglio ' + IMP_SHEET + ' assente o vuoto. Usa prima "Crea modello".' };
  }
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  function c(n) { return h.indexOf(n); }
  var iCat = c('Categoria'), iNome = c('Nome'), iUrl = c('URL'), iEnte = c('Ente'),
      iSito = c('SitoWeb'), iCop = c('Copertura'), iReg = c('Regione'), iLin = c('Lingua'),
      iTip = c('Tipologie'), iAmb = c('Ambiti'), iNote = c('Note');
  if (iCat < 0 || iNome < 0 || iUrl < 0) {
    return { ok: false, error: 'Mancano le colonne obbligatorie Categoria, Nome, URL. Usa "Crea modello".' };
  }

  var esistente = _impEsistente_();
  var vistiFile = {};
  var rep = {
    ok: true, righeLette: 0,
    importabili: [], scartate: [], duplicateNelFile: [], giaPresenti: [], sovrapposizioni: [],
    perCategoria: {}
  };

  for (var r = 1; r < v.length; r++) {
    var cat  = String(v[r][iCat] || '').trim().toLowerCase();
    var nome = String(v[r][iNome] || '').trim();
    var url  = String(v[r][iUrl] || '').trim();
    if (!cat && !nome && !url) continue;                 // riga vuota
    if (/riga di esempio/i.test(String(v[r][iNote] || ''))) continue;   // esempi del modello
    rep.righeLette++;
    var rigaN = r + 1;

    // 1. validazione
    if (!nome || !url) { rep.scartate.push({ riga: rigaN, nome: nome || '(vuoto)', motivo: 'Nome o URL mancante' }); continue; }
    if (IMP_CATEGORIE.indexOf(cat) < 0) {
      rep.scartate.push({ riga: rigaN, nome: nome, motivo: 'Categoria "' + cat + '" non valida (ammesse: ' + IMP_CATEGORIE.join(', ') + ')' });
      continue;
    }
    if (!/^https?:\/\//i.test(url)) {
      rep.scartate.push({ riga: rigaN, nome: nome, motivo: 'URL deve iniziare con http:// o https://' });
      continue;
    }

    var k = _impNorm_(url), dom = _impDominio_(url);

    // 2. duplicati dentro il file
    if (vistiFile[k]) {
      rep.duplicateNelFile.push({ riga: rigaN, nome: nome, giaAllaRiga: vistiFile[k] });
      continue;
    }
    vistiFile[k] = rigaN;

    // 3. già presenti nel sistema
    if (esistente.perUrl[k]) {
      rep.giaPresenti.push({ riga: rigaN, nome: nome, dove: esistente.perUrl[k] });
      continue;
    }

    // 4. sovrapposizione di dominio: entra, ma segnalata
    var sovrapp = esistente.perDominio[dom] || '';
    if (sovrapp) rep.sovrapposizioni.push({ riga: rigaN, nome: nome, dominio: dom, esistente: sovrapp });

    rep.perCategoria[cat] = (rep.perCategoria[cat] || 0) + 1;
    rep.importabili.push({
      riga: rigaN, categoria: cat, nome: nome, url: url,
      ente: iEnte >= 0 ? String(v[r][iEnte] || '') : '',
      sito: iSito >= 0 ? String(v[r][iSito] || '') : '',
      copertura: iCop >= 0 ? String(v[r][iCop] || '') : '',
      regione: iReg >= 0 ? String(v[r][iReg] || '') : '',
      lingua: iLin >= 0 ? String(v[r][iLin] || '') : 'it',
      tipologie: iTip >= 0 ? String(v[r][iTip] || '') : '',
      ambiti: iAmb >= 0 ? String(v[r][iAmb] || '') : '',
      note: iNote >= 0 ? String(v[r][iNote] || '') : '',
      sovrapposizione: sovrapp
    });
  }

  rep.riepilogo = {
    lette: rep.righeLette,
    importabili: rep.importabili.length,
    scartate: rep.scartate.length,
    duplicateNelFile: rep.duplicateNelFile.length,
    giaPresenti: rep.giaPresenti.length,
    conSovrapposizione: rep.sovrapposizioni.length
  };
  // negli elenchi lunghi si mostra un campione: il riepilogo ha i totali
  ['importabili', 'scartate', 'duplicateNelFile', 'giaPresenti', 'sovrapposizioni'].forEach(function (k2) {
    if (rep[k2].length > 12) rep[k2] = rep[k2].slice(0, 12).concat([{ nota: '… e altre ' + (rep.riepilogo[k2] || rep[k2].length) }]);
  });
  return rep;
}

// ---------------------------------------------------------------------------
// Applicazione
// ---------------------------------------------------------------------------

/**
 * Scrive le fonti importabili. Le non-bandi vanno nel RegistroFonti, i bandi
 * in FontiBandi_v5. Tutte in QUARANTENA.
 * @param {Object} [opts] {includiSovrapposte:false}
 */
function impApplica(token, opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  opts = opts || {};
  var ant = impAnteprima(token);
  if (!ant.ok) return ant;
  // l'anteprima tronca gli elenchi: qui serve la lista completa
  var completa = _impRileggiImportabili_(token);
  if (!completa.ok) return completa;

  var lista = completa.importabili.filter(function (f) {
    return opts.includiSovrapposte === true || !f.sovrapposizione;
  });
  if (!lista.length) return { ok: true, scritte: 0, nota: 'Nessuna fonte da importare con i criteri correnti.' };

  var scritteRegistro = 0, scritteBandi = 0, errori = [];

  // non-bandi → RegistroFonti
  var nonBandi = lista.filter(function (f) { return f.categoria !== 'bandi'; });
  if (nonBandi.length && typeof _rfSheet_ === 'function') {
    try {
      var shR = _rfSheet_(true);
      var hr = shR.getRange(1, 1, 1, shR.getLastColumn()).getValues()[0].map(function (x) { return String(x || '').trim(); });
      var righe = nonBandi.map(function (f, i) {
        return _rfRiga_(hr, {
          id: 'RFIMP_' + Date.now() + '_' + i,
          categoria: f.categoria, nome: f.nome, ente: f.ente,
          urlFeed: f.url, urlSito: f.sito,
          formato: /youtube\.com\/feeds/i.test(f.url) ? 'youtube' : 'rss',
          lingua: f.lingua || 'it', copertura: f.copertura,
          tipologie: f.tipologie, ambiti: f.ambiti,
          stato: 'quarantena', origine: 'import:archivio-esterno',
          approvataDa: 'import ' + Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy'),
          note: [f.note, f.regione ? ('Regione: ' + f.regione) : '',
                 f.sovrapposizione ? ('Sovrapposta a ' + f.sovrapposizione) : ''].filter(Boolean).join(' · ')
        });
      });
      shR.getRange(shR.getLastRow() + 1, 1, righe.length, hr.length).setValues(righe);
      scritteRegistro = righe.length;
    } catch (e) { errori.push('RegistroFonti: ' + e.message); }
  }

  // bandi → FontiBandi_v5 (schema proprio, scritto per nome colonna)
  var bandi = lista.filter(function (f) { return f.categoria === 'bandi'; });
  if (bandi.length) {
    try {
      var shB = getMainSS().getSheetByName('FontiBandi_v5');
      if (!shB) throw new Error('foglio FontiBandi_v5 assente');
      var hb = shB.getRange(1, 1, 1, shB.getLastColumn()).getValues()[0].map(function (x) { return String(x || '').trim(); });
      var rb = bandi.map(function (f, i) {
        var riga = new Array(hb.length);
        for (var j = 0; j < hb.length; j++) riga[j] = '';
        function set(col, val) { var j2 = hb.indexOf(col); if (j2 >= 0) riga[j2] = val; }
        set('ID', 'FBIMP_' + Date.now() + '_' + i);
        set('Nome', f.nome);
        set('URL', f.url);
        set('Tipo', 'rss');
        set('Categoria', f.copertura || '');
        set('Priorita', 2);
        set('Attiva', false);           // quarantena: si attiva dopo verifica
        set('DataAggiunta', new Date());
        set('EnteDefault', f.ente);
        set('Livello', f.copertura || '');
        set('UltimoErrore', '');
        set('Note', ['import archivio esterno', f.note,
                     f.sovrapposizione ? ('sovrapposta a ' + f.sovrapposizione) : ''].filter(Boolean).join(' · '));
        return riga;
      });
      shB.getRange(shB.getLastRow() + 1, 1, rb.length, hb.length).setValues(rb);
      scritteBandi = rb.length;
    } catch (e) { errori.push('FontiBandi_v5: ' + e.message); }
  }

  return {
    ok: errori.length === 0,
    scritte: scritteRegistro + scritteBandi,
    nelRegistro: scritteRegistro, traLeFontiBandi: scritteBandi,
    escluseSovrapposte: opts.includiSovrapposte ? 0 : completa.importabili.filter(function (f) { return !!f.sovrapposizione; }).length,
    errori: errori,
    nota: 'Le fonti importate sono in QUARANTENA: raccolgono, ma i contenuti non vengono esposti ' +
          'finché non dimostrano di produrre in modo pulito. Le fonti bandi sono inattive: ' +
          'attivarle dopo la verifica tecnica.'
  };
}

/** Rilegge gli importabili senza troncare gli elenchi (uso interno). */
function _impRileggiImportabili_(token) {
  var ant = impAnteprima(token);
  if (!ant.ok) return ant;
  // impAnteprima tronca a 12: si rifà la lettura completa
  var ss = getMainSS(), sh = ss.getSheetByName(IMP_SHEET);
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  function c(n) { return h.indexOf(n); }
  var esistente = _impEsistente_(), visti = {}, out = [];
  var iCat = c('Categoria'), iNome = c('Nome'), iUrl = c('URL');
  for (var r = 1; r < v.length; r++) {
    var cat = String(v[r][iCat] || '').trim().toLowerCase();
    var nome = String(v[r][iNome] || '').trim();
    var url = String(v[r][iUrl] || '').trim();
    if (!nome || !url || IMP_CATEGORIE.indexOf(cat) < 0 || !/^https?:\/\//i.test(url)) continue;
    if (/riga di esempio/i.test(String(v[r][c('Note')] || ''))) continue;
    var k = _impNorm_(url);
    if (visti[k] || esistente.perUrl[k]) continue;
    visti[k] = true;
    function g(n) { var i = c(n); return i >= 0 ? String(v[r][i] || '') : ''; }
    out.push({
      categoria: cat, nome: nome, url: url, ente: g('Ente'), sito: g('SitoWeb'),
      copertura: g('Copertura'), regione: g('Regione'), lingua: g('Lingua') || 'it',
      tipologie: g('Tipologie'), ambiti: g('Ambiti'), note: g('Note'),
      sovrapposizione: esistente.perDominio[_impDominio_(url)] || ''
    });
  }
  return { ok: true, importabili: out };
}

/**
 * Verifica tecnica su richiesta: prova le fonti importate e dice quali
 * rispondono davvero. Serve prima di far uscire dalla quarantena.
 * @param {Object} [opts] {cap:15}
 */
function impVerificaTecnica(token, opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) {
    return { ok: false, error: 'forbidden' };
  }
  opts = opts || {};
  var cap = opts.cap || 15;
  var sh = getMainSS().getSheetByName('RegistroFonti');
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'RegistroFonti assente' };
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x || '').trim(); });
  var iU = h.indexOf('URL_Feed'), iN = h.indexOf('Nome'), iS = h.indexOf('Stato'), iO = h.indexOf('Origine');
  var esiti = { vive: [], vuote: [], errore: [] }, provate = 0;
  for (var r = 1; r < v.length && provate < cap; r++) {
    if (String(v[r][iS] || '').toLowerCase() !== 'quarantena') continue;
    if (String(v[r][iO] || '').indexOf('import') < 0) continue;
    var url = String(v[r][iU] || ''), nome = String(v[r][iN] || '');
    if (!url) continue;
    provate++;
    try {
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, deadline: 12,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OsservatorioImport/1.0)' } });
      var code = resp.getResponseCode();
      if (code !== 200) { esiti.errore.push(nome + ' — HTTP ' + code); continue; }
      var corpo = resp.getContentText().substring(0, 3000);
      if (/<(rss|feed|channel)[\s>]/i.test(corpo)) esiti.vive.push(nome);
      else esiti.vuote.push(nome + ' — risponde ma non è un feed');
    } catch (e) { esiti.errore.push(nome + ' — ' + e.message); }
    Utilities.sleep(250);
  }
  return {
    ok: true, provate: provate,
    feedValidi: esiti.vive.length, nonFeed: esiti.vuote.length, inErrore: esiti.errore.length,
    dettaglio: esiti,
    nota: 'Le fonti con feed valido possono uscire dalla quarantena. Le altre vanno corrette o sospese.'
  };
}

// ---------------------------------------------------------------------------
// Self-test (offline)
// ---------------------------------------------------------------------------

function impSelfTest() {
  var pass = 0, fail = 0, falliti = [];
  function ok(nome, cond) { if (cond) pass++; else { fail++; falliti.push(nome); } }
  ok('modello con 11 colonne', IMP_COLONNE.length === 11);
  ok('tre colonne obbligatorie', IMP_COLONNE.filter(function (c) { return c.obbl; }).length === 3);
  ok('categorie ammesse: 8', IMP_CATEGORIE.length === 8);
  ok('dominio estratto', _impDominio_('https://www.esempio.it/feed?x=1') === 'esempio.it');
  ok('dominio da url non valida', _impDominio_('non-un-url') === '');
  // la normalizzazione deve distinguere i feed YouTube (difetto corretto in v4.28.9)
  var y1 = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCaaa';
  var y2 = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbbb';
  ok('feed YouTube distinti', _impNorm_(y1) !== _impNorm_(y2));
  ok('stessa fonte, stessa chiave', _impNorm_('http://x.it/feed/') === _impNorm_('https://www.x.it/feed'));
  ok('categoria inventata rifiutata', IMP_CATEGORIE.indexOf('pippo') < 0);
  ok('schema URL: solo http(s)', !/^https?:\/\//i.test('javascript:alert(1)'));

  // CSV — i casi che si presentano davvero quando il file arriva da fuori
  var conVirgola = 'Categoria,Nome,URL\nnews,Test,https://x.it/feed';
  var r1 = impParseCsv(conVirgola);
  ok('csv con virgola', r1.length === 2 && r1[1][2] === 'https://x.it/feed');

  var conPuntoVirgola = 'Categoria;Nome;URL\nnews;Test;https://x.it/feed';
  var r2 = impParseCsv(conPuntoVirgola);
  ok('csv Excel italiano (;)', r2.length === 2 && r2[1][1] === 'Test');

  // un titolo con la virgola dentro, tra virgolette: il caso che rompe i
  // parser ingenui e sposta tutte le colonne
  var conVirgolette = 'Categoria,Nome,URL\nnews,"Musei, arte e territorio",https://x.it/feed';
  var r3 = impParseCsv(conVirgolette);
  ok('virgola dentro le virgolette', r3[1][1] === 'Musei, arte e territorio' && r3[1][2] === 'https://x.it/feed');

  var doppie = 'A,B\n1,"dice ""ciao"" a tutti"';
  ok('virgolette raddoppiate', impParseCsv(doppie)[1][1] === 'dice "ciao" a tutti');

  var conBom = '﻿Categoria,Nome,URL\nnews,T,https://x.it';
  ok('BOM di Windows rimosso', impParseCsv(conBom)[0][0] === 'Categoria');

  ok('CRLF gestito', impParseCsv('A,B\r\n1,2').length === 2);
  ok('righe vuote saltate', impParseCsv('A,B\n\n1,2\n\n').length === 2);
  ok('csv vuoto', impParseCsv('').length === 0);

  var mod = impModelloCsv();
  ok('modello csv con intestazione', mod.csv.split('\n')[0].indexOf('Categoria') === 0);
  ok('modello csv separato da ;', mod.csv.split('\n')[0].indexOf(';') > 0);

  return { ok: fail === 0, pass: pass, fail: fail, totale: pass + fail, falliti: falliti };
}
