/**
 * ============================================================================
 *  SeedFontiSpecializzateV2.gs — Fonti RSS specializzate + triage PNRR
 * ============================================================================
 *  v4.18.68 (2026-05-23)
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Funzioni:
 *    seedNuoveFontiSpecializzate()     — aggiunge fonti RSS cultura/territorio/turismo
 *    verificaETracciaStatoPNRR(bando)  — classifica bandi PNRR (attivo vs attuazione)
 *
 *  Usa lo schema FU17 (18 colonne) di Fonti_v1.js.
 *  Foglio target: FontiBandi_v5 (creato automaticamente se assente).
 * ============================================================================
 */

// ============================================================================
// 1. SEED FONTI SPECIALIZZATE
// ============================================================================

/**
 * Aggiunge fonti RSS specializzate per Cultura, Sviluppo Territoriale e Turismo.
 * Idempotente: skip fonti gia presenti (match per URL).
 *
 * @return {Object} {ok, aggiunte, duplicate, errori, dettagli[]}
 */
function seedNuoveFontiSpecializzate() {
  try {
    var FONTI = [
      {
        nome: 'Ministero della Cultura - News e Bandi',
        url: 'https://cultura.gov.it/feed/',
        ambito: 'Cultura',
        tag: 'ministero',
        categoria: 'Cultura',
        livello: 'Nazionale',
        enteDefault: 'Ministero della Cultura',
        priorita: 1
      },
      {
        nome: 'Lazio Europa - Opportunita',
        url: 'https://www.lazioeuropa.it/feed/',
        ambito: 'Sviluppo Territoriale',
        tag: 'regione',
        categoria: 'Sviluppo Territoriale',
        livello: 'Regionale',
        enteDefault: 'Regione Lazio',
        priorita: 2
      },
      {
        nome: 'Regione Lombardia - Servizio Bandi',
        url: 'https://www.bandi.regione.lombardia.it/servizi/servizio/rss',
        ambito: 'Sviluppo Territoriale',
        tag: 'regione',
        categoria: 'Sviluppo Territoriale',
        livello: 'Regionale',
        enteDefault: 'Regione Lombardia',
        priorita: 2
      },
      {
        nome: 'Toscana Europa - Opportunita',
        url: 'https://www.regione.toscana.it/bandi-e-opportunita/rss',
        ambito: 'Sviluppo Territoriale',
        tag: 'regione',
        categoria: 'Sviluppo Territoriale',
        livello: 'Regionale',
        enteDefault: 'Regione Toscana',
        priorita: 2
      },
      {
        nome: 'FASI - Finanziamenti Agevolati',
        url: 'https://fasi.eu/it/rss.html',
        ambito: 'Turismo',
        tag: 'aggregatore',
        categoria: 'Turismo',
        livello: 'Nazionale',
        enteDefault: 'FASI.eu',
        priorita: 1
      }
    ];

    // Accedi al foglio FontiBandi_v5 (o crealo se non esiste)
    var sh = _getOrCreateFontiBandiSheet_();
    if (!sh) return { ok: false, error: 'Impossibile accedere/creare foglio fonti bandi' };

    // Carica URL esistenti per dedup
    var existingUrls = {};
    if (sh.getLastRow() > 1) {
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = head.indexOf('URL');
      if (iUrl < 0) iUrl = 2; // fallback colonna 3
      for (var r = 1; r < vals.length; r++) {
        var u = String(vals[r][iUrl] || '').trim().toLowerCase();
        if (u) existingUrls[u] = true;
      }
    }

    var aggiunte = 0, duplicate = 0, errori = 0;
    var dettagli = [];
    var now = new Date();

    FONTI.forEach(function(f) {
      var urlLow = f.url.toLowerCase().trim();
      if (existingUrls[urlLow]) {
        duplicate++;
        dettagli.push({ nome: f.nome, azione: 'skip_duplicata' });
        return;
      }

      try {
        // Usa addFonteUnificataV2 se disponibile, altrimenti appendRow diretto
        if (typeof addFonteUnificataV2 === 'function') {
          var result = addFonteUnificataV2({
            tipo: 'bandi',
            nome: f.nome,
            url: f.url,
            tipoFonte: 'RSS',
            tag: f.tag,
            categoria: f.categoria,
            priorita: f.priorita,
            enteDefault: f.enteDefault,
            livello: f.livello
          });
          if (result && result.ok) {
            aggiunte++;
            dettagli.push({ nome: f.nome, azione: 'aggiunta', id: result.id });
          } else {
            errori++;
            dettagli.push({ nome: f.nome, azione: 'errore', error: (result && result.error) || 'sconosciuto' });
          }
        } else {
          // Fallback: appendRow diretto con schema FU17
          var id = 'FB' + Date.now() + Math.random().toString(36).substring(2, 4);
          var row = [
            id, f.nome, f.url, 'RSS', f.tag, f.categoria, f.priorita, true,
            now, '', '', 0, 0, 0,
            '', f.enteDefault, f.livello, ''
          ];
          sh.appendRow(row);
          aggiunte++;
          dettagli.push({ nome: f.nome, azione: 'aggiunta_diretta', id: id });
        }
      } catch(e) {
        errori++;
        dettagli.push({ nome: f.nome, azione: 'errore', error: e.message });
      }
    });

    Logger.log('seedNuoveFontiSpecializzate: ' + aggiunte + ' aggiunte, ' + duplicate + ' duplicate, ' + errori + ' errori');
    return { ok: true, aggiunte: aggiunte, duplicate: duplicate, errori: errori, dettagli: dettagli };
  } catch(e) {
    Logger.log('seedNuoveFontiSpecializzate ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Accede al foglio FontiBandi_v5 o lo crea con header FU17 se non esiste.
 * @private
 * @return {Sheet|null}
 */
function _getOrCreateFontiBandiSheet_() {
  try {
    // Prova getFonteSheet se disponibile (Fonti_v1.js)
    if (typeof getFonteSheet === 'function') {
      return getFonteSheet('bandi');
    }
    // Fallback manuale
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = 'FontiBandi_v5';
    var sh = ss.getSheetByName(sheetName);
    if (sh) return sh;

    // Crea con header FU17
    var headers = [
      'ID','Nome','URL','Tipo','Tag','Categoria','Priorita','Attiva',
      'DataAggiunta','UltimaScan','UltimoEsito',
      'NRecordTotali','NRecordUltimo','FailConsecutivi',
      'UltimoErrore','EnteDefault','Livello','extras_json'
    ];
    sh = ss.insertSheet(sheetName);
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#8B3A1F').setFontColor('#fff');
    sh.setFrozenRows(1);
    Logger.log('Foglio ' + sheetName + ' creato con schema FU17 (18 colonne)');
    return sh;
  } catch(e) {
    Logger.log('_getOrCreateFontiBandiSheet_ errore: ' + e.message);
    return null;
  }
}

// ============================================================================
// 2. VERIFICA E TRACCIA STATO PNRR
// ============================================================================

/**
 * Keyword PNRR per detection.
 * @private
 */
var _PNRR_KEYWORDS_ = [
  'pnrr', 'piano nazionale ripresa', 'piano nazionale di ripresa',
  'next generation', 'nextgeneration', 'nextgenerationeu',
  'm1c3', 'm1c2', 'm1c1', 'm2c4', 'm5c2', 'm5c3',
  'missione 1', 'missione 2', 'missione 5',
  'componente c3', 'componente 3'
];

/**
 * Keyword che indicano bando PNRR chiuso o in attuazione.
 * @private
 */
var _PNRR_CHIUSO_KEYWORDS_ = [
  'graduatoria', 'scorrimento', 'attuazione', 'monitoraggio',
  'rendicontazione', 'stato avanzamento', 'sal',
  'decreto di ammissione', 'ammessi al finanziamento',
  'elenco beneficiari', 'assegnazione risorse',
  'chiuso', 'chiusura', 'concluso', 'terminat'
];

/**
 * Analizza un oggetto bando e determina lo stato PNRR.
 *
 * Se il bando contiene keyword PNRR, verifica se e attivo o in fase di chiusura.
 * Aggiunge campi:
 *   bando.pnrr = true|false
 *   bando.pnrr_stato = 'attivo' | 'attuazione_chiuso'
 *   bando.pnrr_nota = stringa informativa (se chiuso)
 *
 * @param {Object} bando — oggetto bando (da _estraiConClaudeV5_ o simile)
 * @return {Object} bando arricchito (mutato in place + restituito)
 */
function verificaETracciaStatoPNRR(bando) {
  if (!bando) return bando;

  try {
    // Costruisci testo da analizzare (null-safe)
    var testo = (
      String(bando.titolo || '') + ' ' +
      String(bando.sommario || '') + ' ' +
      String(bando.descrizione || '') + ' ' +
      String(bando.ente || '') + ' ' +
      String(bando.settore || '')
    ).toLowerCase();

    // Detection PNRR
    var isPnrr = _PNRR_KEYWORDS_.some(function(kw) {
      return testo.indexOf(kw) >= 0;
    });

    bando.pnrr = isPnrr;

    if (!isPnrr) {
      bando.pnrr_stato = null;
      bando.pnrr_nota = '';
      return bando;
    }

    // PNRR trovato: verifica se chiuso o in attuazione
    var isChiuso = _PNRR_CHIUSO_KEYWORDS_.some(function(kw) {
      return testo.indexOf(kw) >= 0;
    });

    if (isChiuso) {
      bando.pnrr_stato = 'attuazione_chiuso';
      bando.pnrr_nota = 'ATTENZIONE: Misure PNRR in fase di chiusura/attuazione. Opportunita limitata a scorrimenti di graduatoria o subappalti per fornitori.';
      // Aggiungi ai rischi se il campo esiste
      if (Array.isArray(bando.rischi_bando)) {
        if (bando.rischi_bando.indexOf('PNRR in fase di attuazione/chiusura') < 0) {
          bando.rischi_bando.push('PNRR in fase di attuazione/chiusura');
        }
      } else {
        bando.rischi_bando = ['PNRR in fase di attuazione/chiusura'];
      }
    } else {
      bando.pnrr_stato = 'attivo';
      bando.pnrr_nota = '';
    }

    Logger.log('PNRR check: "' + String(bando.titolo || '').substring(0, 60) + '" → ' + bando.pnrr_stato);
    return bando;
  } catch(e) {
    Logger.log('verificaETracciaStatoPNRR errore: ' + e.message);
    // Non bloccare: ritorna bando senza arricchimento
    bando.pnrr = false;
    bando.pnrr_stato = null;
    bando.pnrr_nota = '';
    return bando;
  }
}

// ============================================================================
// FINE SeedFontiSpecializzateV2.gs
// ============================================================================

// ============================================================================
// v5.0.5 — Seed fonti da ricerca NotebookLM (25/05/2026)
// ============================================================================

function seedFontiDaRicerca() {
  var FONTI = [
    {
      nome: 'SCP - Servizio Contratti Pubblici (MIT)',
      url: 'https://www.serviziocontrattipubblici.it/it/open-data/',
      ambito: 'Governance',
      tag: 'ministero',
      categoria: 'Contratti pubblici',
      livello: 'Nazionale',
      enteDefault: 'MIT - Infrastrutture e Trasporti',
      priorita: 1
    },
    {
      nome: 'PA Digitale 2026 - PNRR Open Data',
      url: 'https://padigitale2026.gov.it/open-data',
      ambito: 'Digital',
      tag: 'ministero',
      categoria: 'PNRR Digitalizzazione',
      livello: 'Nazionale',
      enteDefault: 'Dipartimento Trasformazione Digitale',
      priorita: 1
    },
    {
      nome: 'MiC Trasparenza - Gare e Contratti',
      url: 'https://trasparenza.cultura.gov.it/pagina566_bandi-di-gara-e-contratti.html',
      ambito: 'Cultura',
      tag: 'ministero',
      categoria: 'Gare cultura',
      livello: 'Nazionale',
      enteDefault: 'Ministero della Cultura',
      priorita: 1
    },
    {
      nome: 'Fondazione Cariplo - Bandi Cultura',
      url: 'https://www.fondazionecariplo.it/contributi/bandi/',
      ambito: 'Cultura',
      tag: 'fondazione',
      categoria: 'Fondazioni',
      livello: 'Regionale',
      enteDefault: 'Fondazione Cariplo',
      priorita: 1
    },
    {
      nome: 'Toscana - Contributi Enti Locali Open Data',
      url: 'https://www.regione.toscana.it/-/contributi-agli-enti-locali-per-l-elaborazione-dati-e-la-fornitura-di-open-data',
      ambito: 'Digital',
      tag: 'regione',
      categoria: 'Open Data regionale',
      livello: 'Regionale',
      enteDefault: 'Regione Toscana',
      priorita: 2
    },
    {
      nome: 'OpenCUP - Investimenti Pubblici Open Data',
      url: 'https://www.programmazioneeconomica.gov.it/it/mip-cup-mgo/open-cup/opendata/',
      ambito: 'Governance',
      tag: 'ministero',
      categoria: 'Investimenti pubblici',
      livello: 'Nazionale',
      enteDefault: 'DIPE - MEF',
      priorita: 1
    },
    {
      nome: 'ANAC - Dataset Contratti Pubblici',
      url: 'https://dati.anticorruzione.it/opendata/dataset',
      ambito: 'Governance',
      tag: 'ministero',
      categoria: 'Contratti pubblici',
      livello: 'Nazionale',
      enteDefault: 'ANAC',
      priorita: 1
    },
    {
      nome: 'EU Funding & Tenders Portal API',
      url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/apis',
      ambito: 'Governance',
      tag: 'ue',
      categoria: 'Bandi EU',
      livello: 'EU',
      enteDefault: 'Commissione Europea',
      priorita: 1
    }
  ];

  try {
    var sh = _getOrCreateFontiBandiSheet_();
    if (!sh) return { ok: false, error: 'Foglio fonti non disponibile' };

    var existingUrls = {};
    if (sh.getLastRow() > 1) {
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = head.indexOf('URL');
      if (iUrl < 0) iUrl = 2;
      for (var r = 1; r < vals.length; r++) {
        var u = String(vals[r][iUrl] || '').trim().toLowerCase();
        if (u) existingUrls[u] = true;
      }
    }

    // Controlla anche FontiNews
    try {
      var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
      var shN = ss.getSheetByName('FontiNews');
      if (shN && shN.getLastRow() > 1) {
        var nVals = shN.getDataRange().getValues();
        var nHead = nVals[0];
        var iNUrl = nHead.indexOf('URL');
        for (var rn = 1; rn < nVals.length; rn++) {
          var nu = String(nVals[rn][iNUrl] || '').trim().toLowerCase();
          if (nu) existingUrls[nu] = true;
        }
      }
    } catch(_){}

    var aggiunte = 0, duplicate = 0, dettagli = [];
    FONTI.forEach(function(f) {
      var urlLow = f.url.toLowerCase().trim();
      if (existingUrls[urlLow]) {
        duplicate++;
        dettagli.push({ nome: f.nome, azione: 'gia_presente' });
        return;
      }
      try {
        if (typeof addFonteUnificataV2 === 'function') {
          var result = addFonteUnificataV2({
            tipo: 'bandi',
            nome: f.nome,
            url: f.url,
            tipoFonte: 'HTML',
            tag: f.tag,
            categoria: f.categoria,
            priorita: f.priorita,
            enteDefault: f.enteDefault,
            livello: f.livello
          });
          if (result && result.ok) {
            aggiunte++;
            dettagli.push({ nome: f.nome, azione: 'aggiunta', id: result.id });
          }
        }
      } catch(e) {
        dettagli.push({ nome: f.nome, azione: 'errore', error: e.message });
      }
    });

    Logger.log('seedFontiDaRicerca: ' + aggiunte + ' aggiunte, ' + duplicate + ' gia presenti');
    return { ok: true, aggiunte: aggiunte, duplicate: duplicate, dettagli: dettagli };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// v5.0.6 — Seed fonti da seconda ricerca + TED API + LOD (25/05/2026)
// ============================================================================

function seedFontiRicerca2() {
  var FONTI = [
    // === API e portali bandi ===
    { nome: 'TED API — Appalti EU Cultura (Swagger)', url: 'https://api.ted.europa.eu/v3/notices/search', tag: 'ue', cat: 'Appalti EU', liv: 'EU', ente: 'TED — Ufficio Pubblicazioni UE', tipo: 'bandi', pr: 1 },
    { nome: 'TED Developer Portal', url: 'https://developer.ted.europa.eu/', tag: 'ue', cat: 'Appalti EU', liv: 'EU', ente: 'TED', tipo: 'bandi', pr: 2 },
    { nome: 'ANAC Pubblicita Legale BDNCP', url: 'https://pubblicitalegale.anticorruzione.it/bdncp', tag: 'ministero', cat: 'Contratti pubblici', liv: 'Nazionale', ente: 'ANAC', tipo: 'bandi', pr: 1 },
    { nome: 'Portale Operatori Turismo — Italia.it', url: 'https://portaleoperatori.italia.it', tag: 'ministero', cat: 'Turismo', liv: 'Nazionale', ente: 'Ministero del Turismo', tipo: 'bandi', pr: 2 },
    { nome: 'PDND — Catalogo API PA', url: 'https://api.gov.it/en', tag: 'ministero', cat: 'Interoperabilita PA', liv: 'Nazionale', ente: 'AgID / DTD', tipo: 'news', pr: 2 },
    { nome: 'Developers Italia', url: 'https://developers.italia.it', tag: 'istituzionale', cat: 'Open source PA', liv: 'Nazionale', ente: 'DTD', tipo: 'news', pr: 2 },
    // === Linked Open Data Cultura ===
    { nome: 'MiC SPARQL — Beni Culturali LOD', url: 'http://dati.beniculturali.it/sparql', tag: 'ministero', cat: 'LOD Cultura', liv: 'Nazionale', ente: 'MiC — ArCo', tipo: 'news', pr: 2 },
    { nome: 'MiC Open Data e Linked Data', url: 'https://dati.cultura.gov.it', tag: 'ministero', cat: 'Open Data Cultura', liv: 'Nazionale', ente: 'Ministero della Cultura', tipo: 'news', pr: 1 },
    { nome: 'MiC Open Data pagina ufficiale', url: 'https://cultura.gov.it/open-data-e-linked-data', tag: 'ministero', cat: 'Open Data Cultura', liv: 'Nazionale', ente: 'Ministero della Cultura', tipo: 'news', pr: 2 },
    { nome: 'CulturaItalia — Linked Open Data', url: 'https://www.culturaitalia.it/linked-open-data/', tag: 'istituzionale', cat: 'LOD Federato', liv: 'Nazionale', ente: 'ICCU — CulturaItalia', tipo: 'news', pr: 2 },
    { nome: 'SAN — Sistema Archivistico Nazionale LOD', url: 'http://www.san.beniculturali.it/web/san/dati-san-lod', tag: 'istituzionale', cat: 'Archivi LOD', liv: 'Nazionale', ente: 'SAN', tipo: 'news', pr: 2 }
  ];

  try {
    // Carica URL esistenti da tutti i fogli fonti per dedup
    var existingUrls = {};
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    ['FontiBandi_v5', 'FontiNews', 'FontiPodcast', 'FontiVideo'].forEach(function(shName) {
      var sh = ss.getSheetByName(shName);
      if (!sh || sh.getLastRow() < 2) return;
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var iUrl = head.indexOf('URL');
      if (iUrl < 0) return;
      for (var r = 1; r < vals.length; r++) {
        var u = String(vals[r][iUrl] || '').trim().toLowerCase();
        if (u) existingUrls[u] = true;
      }
    });

    var aggiunte = 0, duplicate = 0, dettagli = [];
    FONTI.forEach(function(f) {
      var urlLow = f.url.toLowerCase().trim();
      if (existingUrls[urlLow]) { duplicate++; dettagli.push({ nome: f.nome, azione: 'gia_presente' }); return; }
      try {
        if (typeof addFonteUnificataV2 === 'function') {
          var result = addFonteUnificataV2({
            tipo: f.tipo || 'bandi',
            nome: f.nome,
            url: f.url,
            tipoFonte: 'HTML',
            tag: f.tag,
            categoria: f.cat,
            priorita: f.pr || 2,
            enteDefault: f.ente || '',
            livello: f.liv || 'Nazionale'
          });
          if (result && result.ok) { aggiunte++; dettagli.push({ nome: f.nome, azione: 'aggiunta', id: result.id }); }
          else { dettagli.push({ nome: f.nome, azione: 'errore', error: (result && result.error) || '?' }); }
        }
      } catch(e) { dettagli.push({ nome: f.nome, azione: 'errore', error: e.message }); }
    });

    Logger.log('seedFontiRicerca2: ' + aggiunte + ' aggiunte, ' + duplicate + ' gia presenti');
    return { ok: true, aggiunte: aggiunte, duplicate: duplicate, dettagli: dettagli };
  } catch(e) { return { ok: false, error: e.message }; }
}
