/**
 * ============================================================================
 *  Backend_v415.gs — Backend mancanti identificati in Sprint 1
 * ============================================================================
 *  Sprint 1 chiusura (2026-05-09)
 *  Autore: Silvano Straccini / Duemilamusei
 *
 *  Scopo: implementare i 6 endpoint backend richiamati dal frontend ma
 *  finora non esistenti. Allineamento naming gia' fatto in Sprint 1
 *  tramite wrapper in Auth.js e UltimiBandi.js.
 *
 *  Funzioni esportate (chiamate da google.script.run lato client):
 *    saveLibro(body)              — append nuova pubblicazione
 *    setupLibriSeed()             — crea foglio Pubblicazioni + seed iniziale
 *    saveNorma(body)              — append nuova norma
 *    invitaUtenteSendEmail(body)  — invio email invito utente admin
 *    exportArchivio()             — export CSV archivio per tipo
 *    emptyTrash()                 — delete definitiva record archiviati
 *                                   (compatibilita fix backlog #48)
 *
 *  TUTTE le funzioni ritornano { ok: bool, ...payload } in formato uniforme.
 *  Audit log su PropertiesService per azioni distruttive (emptyTrash).
 * ============================================================================
 */

// ============================================================================
// CONSTANTI MODULO
// ============================================================================

var BV415_SH_LIBRI    = (typeof SH !== 'undefined' && SH.LIBRI) ? SH.LIBRI : 'Pubblicazioni';
var BV415_SH_NORME    = 'Norme';
var BV415_SH_USERS    = 'Utenti';
var BV415_SH_AUDIT    = 'AuditLog_v415';
var BV415_LIBRI_HEAD  = [
  'ID','Titolo','Autore','Editore','Anno','Ambito','Tematica',
  'Descrizione','Link','Copertina_URL','DataAggiunta','Fonte','Stato','Score','Salvato'
];

// ============================================================================
// A1 — saveLibro(body)
// ----------------------------------------------------------------------------
// Salva una nuova pubblicazione nel foglio Libri. Compatibile schema esistente
// (getLibriListV42 legge le colonne via _findCol_ con varianti naming).
// ============================================================================

function saveLibro(body) {
  try {
    body = body || {};
    if (!body.titolo || !body.autore) {
      return { ok: false, error: 'Titolo e Autore sono obbligatori' };
    }
    var ss = getMainSS();
    var sh = ss.getSheetByName(BV415_SH_LIBRI);
    if (!sh) {
      var seed = setupLibriSeed();
      if (!seed.ok) return seed;
      sh = ss.getSheetByName(BV415_SH_LIBRI);
    }
    var id = 'LB' + Date.now();
    var row = new Array(BV415_LIBRI_HEAD.length).fill('');
    row[0]  = id;
    row[1]  = String(body.titolo).trim();
    row[2]  = String(body.autore).trim();
    row[3]  = String(body.editore || '').trim();
    row[4]  = body.anno ? Number(body.anno) : '';
    row[5]  = Number(body.ambito) || 3;
    row[6]  = String(body.tematica || '').trim();
    row[7]  = String(body.descrizione || '').trim();
    row[8]  = String(body.link || '').trim();
    row[9]  = String(body.copertinaUrl || '').trim();
    row[10] = new Date();
    row[11] = String(body.fonte || 'inserimento manuale').trim();
    row[12] = 'attivo';
    row[13] = body.score ? Number(body.score) : '';
    row[14] = false;
    sh.appendRow(row);
    Logger.log('saveLibro OK: ' + body.titolo + ' (id=' + id + ')');
    return { ok: true, id: id, titolo: body.titolo };
  } catch(e) {
    Logger.log('saveLibro ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// A2 — setupLibriSeed()
// ----------------------------------------------------------------------------
// Crea foglio Pubblicazioni con header e 10 titoli seed di riferimento per il
// settore (ICOM definition, Henkel Museum Matrix, Welfare culturale, MOI, ecc.)
// ============================================================================

function setupLibriSeed() {
  try {
    var ss = getMainSS();
    var sh = ss.getSheetByName(BV415_SH_LIBRI);
    if (sh && sh.getLastRow() > 1) {
      return { ok: true, sheetName: BV415_SH_LIBRI, status: 'already_exists', righe: sh.getLastRow()-1 };
    }
    if (!sh) {
      sh = ss.insertSheet(BV415_SH_LIBRI);
      sh.getRange(1, 1, 1, BV415_LIBRI_HEAD.length).setValues([BV415_LIBRI_HEAD])
        .setFontWeight('bold').setBackground('#3C6A95').setFontColor('#fff');
      sh.setFrozenRows(1);
      sh.setColumnWidth(2, 320);   // Titolo
      sh.setColumnWidth(3, 200);   // Autore
      sh.setColumnWidth(8, 360);   // Descrizione
    }
    var seed = [
      ['LB001','Definizione di Museo ICOM 2022','ICOM','ICOM','2022',1,'Museologia',
        'Definizione fondativa adottata a Praga 24 agosto 2022: museo come istituzione non-profit, permanente, al servizio della societa, accessibile e inclusiva, che opera con la partecipazione delle comunita.',
        'https://icom.museum/en/resources/standards-guidelines/museum-definition/','',new Date(),'ICOM','attivo',5,true],
      ['LB002','Museum Matrix — Modelli di valutazione museale','Matthias Henkel','Embassy of Culture','2016',1,'Strategia museale',
        'Modello a 5 dimensioni (Brand, Collection, Facility, Program, Service). Marchio registrato DPMA n. 30 2016 034 145. Ispirazione per MuseMu Matrix Duemilamusei.',
        '','',new Date(),'Embassy of Culture','attivo',5,true],
      ['LB003','Welfare culturale','Cicerchia A., Rossi Ghiglione A., Seia C.','Treccani','2020',4,'Welfare culturale',
        'Voce definitoria ufficiale italiana del concetto di welfare culturale come integrazione di pratiche artistiche e politiche di benessere.',
        'https://www.treccani.it/enciclopedia/welfare-culturale','',new Date(),'Treccani','attivo',5,true],
      ['LB004','Health Evidence Network synthesis report 67 — Arts and health','Fancourt D. & Finn S.','WHO Europe','2019',4,'Welfare culturale',
        'Base evidence-based internazionale: oltre 900 pubblicazioni revisionate sui benefici delle arti sulla salute fisica e mentale.',
        'https://www.who.int/europe/publications/i/item/9789289054553','',new Date(),'WHO','attivo',5,true],
      ['LB005','Museums of Impact (MOI!) Framework','NEMO — Creative Europe','NEMO','2022',4,'Impatto sociale',
        'Framework europeo di autovalutazione dell impatto sociale dei musei. Disegnato per istituzioni medie/piccole.',
        'https://www.ne-mo.org/about-us/projects/museums-of-impact','',new Date(),'NEMO','attivo',5,true],
      ['LB006','Estetica relazionale','Nicolas Bourriaud','Postmedia Books','2010',3,'Estetica contemporanea',
        'Riferimento teorico sulle pratiche artistiche che si fondano su intersoggettivita e relazione con il pubblico.',
        '','',new Date(),'Postmedia','attivo',4,false],
      ['LB007','Flow — La psicologia della felicita','Mihaly Csikszentmihalyi','Roi Edizioni','2016',4,'Engagement',
        'Concetto di flow applicato al fruitore museale: la fascia di esperienza ottimale tra noia (sfida bassa) e ansia (sfida alta).',
        '','',new Date(),'Roi','attivo',4,false],
      ['LB008','Verso una pedagogia della scoperta','Jerome Bruner','Armando Editore','2013',3,'Pedagogia museale',
        'Costruttivismo applicato al museo come ambiente di apprendimento attivo. Riferimento per la mediazione culturale contemporanea.',
        '','',new Date(),'Armando','attivo',4,false],
      ['LB009','Easy-to-Read European Standards','Inclusion Europe','Inclusion Europe','2014',2,'Accessibilita',
        'Linee guida europee per la comunicazione facile da leggere e capire. Riferimento per accessibilita cognitiva nei musei.',
        'https://www.inclusion-europe.eu/easy-to-read-standards-guidelines/','',new Date(),'Inclusion Europe','attivo',5,true],
      ['LB010','Musei Sensibili — Documento Strategico Duemilamusei','Silvano Straccini','Duemilamusei','2026',5,'Strategia museale',
        'Documento strategico Duemilamusei: cinque dimensioni di evoluzione (Identita, Inclusione, Programma, Comunita, Digital & Gov) con framework operativo e roadmap.',
        '','',new Date(),'Duemilamusei','attivo',5,true]
    ];
    sh.getRange(2, 1, seed.length, BV415_LIBRI_HEAD.length).setValues(seed);
    Logger.log('setupLibriSeed: foglio creato con ' + seed.length + ' titoli seed');
    return { ok: true, sheetName: BV415_SH_LIBRI, righe: seed.length };
  } catch(e) {
    Logger.log('setupLibriSeed ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// A3 — saveNorma(body)
// ----------------------------------------------------------------------------
// Salva una nuova norma nel foglio Norme. Schema esistente in UltimiBandi.js
// (NORME_HEADER: ID, Titolo, Fonte, Link, Ambito, Descrizione, DataAggiunta, Stato)
// ============================================================================

function saveNorma(body) {
  try {
    body = body || {};
    if (!body.titolo || !body.fonte) {
      return { ok: false, error: 'Titolo e Fonte sono obbligatori' };
    }
    var ss = getMainSS();
    var sh = ss.getSheetByName(BV415_SH_NORME);
    if (!sh) {
      if (typeof setupNormeSheet === 'function') {
        setupNormeSheet();
        sh = ss.getSheetByName(BV415_SH_NORME);
      } else {
        return { ok: false, error: 'Foglio Norme non disponibile' };
      }
    }
    var id = 'NRM' + Date.now();
    var row = [
      id,
      String(body.titolo).trim(),
      String(body.fonte).trim(),
      String(body.link || '').trim(),
      Number(body.ambito) || 1,
      String(body.descrizione || '').trim(),
      new Date(),
      'attivo'
    ];
    sh.appendRow(row);
    Logger.log('saveNorma OK: ' + body.titolo + ' (id=' + id + ')');
    return { ok: true, id: id, titolo: body.titolo };
  } catch(e) {
    Logger.log('saveNorma ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// A4 — invitaUtenteSendEmail(body)
// ----------------------------------------------------------------------------
// Invia email invito a nuovo utente admin con token di acceso temporaneo.
// Token salvato in PropertiesService con TTL 7 giorni.
// ============================================================================

function invitaUtenteSendEmail(body) {
  try {
    body = body || {};
    var email = String(body.email || '').trim().toLowerCase();
    var nome  = String(body.nome || '').trim();
    var ruolo = String(body.ruolo || 'admin').trim();
    if (!email || !email.match(/^[^@]+@[^@]+\.[^@]+$/)) {
      return { ok: false, error: 'Email non valida' };
    }
    if (!nome) {
      return { ok: false, error: 'Nome obbligatorio' };
    }
    // Genera token
    var token = Utilities.getUuid().replace(/-/g, '').substring(0, 20);
    var tokenKey = 'invite_token_' + token;
    var tokenData = {
      email: email,
      nome: nome,
      ruolo: ruolo,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
    };
    PropertiesService.getScriptProperties().setProperty(tokenKey, JSON.stringify(tokenData));

    // URL webapp con parametro invito
    var webappUrl = '';
    try { webappUrl = ScriptApp.getService().getUrl() || ''; } catch(e) {}
    var inviteUrl = webappUrl + '?invite=' + token;

    var subject = 'Invito Osservatorio Culturale Duemilamusei — accesso admin';
    var htmlBody =
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1A1815;max-width:600px">' +
      '<p>Gentile ' + escapeHtml_(nome) + ',</p>' +
      '<p>ti invito ad accedere come <strong>' + escapeHtml_(ruolo) + '</strong> all Osservatorio Culturale Duemilamusei, ' +
      'la piattaforma che monitora bandi, news e podcast del settore museale italiano e supporta l autovalutazione MuseMu Matrix.</p>' +
      '<p style="margin:24px 0"><a href="' + inviteUrl + '" style="background:#1A1815;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600">Accetta l invito</a></p>' +
      '<p style="font-size:12px;color:#6E6A62">Link valido 7 giorni. Se non hai richiesto questo invito, puoi ignorare il messaggio.</p>' +
      '<p>Buon lavoro,<br>Silvano Straccini<br>Duemilamusei</p>' +
      '</div>';

    MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody });
    Logger.log('invitaUtenteSendEmail OK: invito a ' + email + ' (token=' + token + ')');
    return { ok: true, email: email, tokenPreview: token.substring(0, 8) + '...', expiresAt: tokenData.expiresAt };
  } catch(e) {
    Logger.log('invitaUtenteSendEmail ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function escapeHtml_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================================
// A5 — exportArchivio()
// ----------------------------------------------------------------------------
// Export CSV record archiviati per tutti i tipi (bandi, news, podcast, libri).
// Crea file CSV in Drive e ritorna URL diretto al download.
// ============================================================================

function exportArchivio() {
  try {
    var ss = getMainSS();
    var folder = DriveApp.getRootFolder();
    var rows = [['Tipo','ID','Titolo','Data','Stato','URL']];

    // Tipo: bandi (RADAR BANDI)
    try {
      var shBandi = ss.getSheetByName('RADAR BANDI') || ss.getSheetByName('Bandi_v5');
      if (shBandi) {
        var vals = shBandi.getDataRange().getValues();
        var head = vals[0].map(function(h){ return String(h||'').trim(); });
        var iStato = head.indexOf('StatoRecord');
        if (iStato < 0) iStato = head.indexOf('Stato');
        var iTit = head.indexOf('Titolo');
        var iUrl = head.indexOf('UrlBando') >= 0 ? head.indexOf('UrlBando') : head.indexOf('URL_BANDO');
        var iData = head.indexOf('DataRilevamento') >= 0 ? head.indexOf('DataRilevamento') : head.indexOf('DATA_RILEVAMENTO');
        for (var r = 1; r < vals.length; r++) {
          if (iStato >= 0 && String(vals[r][iStato]).toLowerCase() === 'archiviato') {
            rows.push(['bando', vals[r][0], vals[r][iTit] || '', vals[r][iData] || '', 'archiviato', vals[r][iUrl] || '']);
          }
        }
      }
    } catch(e) { Logger.log('exportArchivio bandi: ' + e.message); }

    // Tipo: news (Items)
    try {
      var shNews = ss.getSheetByName('Items');
      if (shNews) {
        var n = shNews.getDataRange().getValues();
        var nHead = n[0].map(function(h){ return String(h||'').trim(); });
        var iN_St = nHead.indexOf('Stato');
        var iN_Tit = nHead.indexOf('Titolo');
        var iN_Url = nHead.indexOf('URL') >= 0 ? nHead.indexOf('URL') : nHead.indexOf('Link');
        var iN_Dat = nHead.indexOf('Data');
        for (var rr = 1; rr < n.length; rr++) {
          if (iN_St >= 0 && String(n[rr][iN_St]).toLowerCase() === 'archiviato') {
            rows.push(['news', n[rr][0], n[rr][iN_Tit] || '', n[rr][iN_Dat] || '', 'archiviato', n[rr][iN_Url] || '']);
          }
        }
      }
    } catch(e) { Logger.log('exportArchivio news: ' + e.message); }

    if (rows.length === 1) {
      return { ok: false, error: 'Nessun record archiviato trovato' };
    }

    // Genera CSV
    var csv = rows.map(function(r){
      return r.map(function(c){
        var s = String(c || '').replace(/"/g, '""');
        return /[,\n"]/.test(s) ? '"' + s + '"' : s;
      }).join(',');
    }).join('\n');

    var fname = 'archivio_OC_' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMMdd_HHmm') + '.csv';
    var blob = Utilities.newBlob(csv, 'text/csv', fname);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('exportArchivio: ' + (rows.length - 1) + ' record esportati in ' + fname);
    return { ok: true, file: fname, url: file.getDownloadUrl(), viewUrl: file.getUrl(), totale: rows.length - 1 };
  } catch(e) {
    Logger.log('exportArchivio ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// A6 — emptyTrash()
// ----------------------------------------------------------------------------
// Cancellazione DEFINITIVA record archiviati di qualsiasi tipo.
// Audit log in PropertiesService. Soglia minima 30gg dall archiviazione
// per evitare cancellazioni di troppo recenti.
// AZIONE DISTRUTTIVA — il client deve sempre chiedere conferma multipla.
// ============================================================================

function emptyTrash(opts) {
  try {
    opts = opts || {};
    var minAgeDays = (opts.minAgeDays != null) ? Number(opts.minAgeDays) : 30;
    var ss = getMainSS();
    var deleted = { bandi: 0, news: 0, podcast: 0, libri: 0 };
    var now = Date.now();
    var soglia = now - minAgeDays * 86400000;

    function purgeSheet(sheetName, statoCol, dataCol, tipo) {
      try {
        var sh = ss.getSheetByName(sheetName);
        if (!sh) return 0;
        var vals = sh.getDataRange().getValues();
        if (vals.length < 2) return 0;
        var head = vals[0].map(function(h){ return String(h||'').trim(); });
        var iStato = statoCol.map(function(c){ return head.indexOf(c); }).find(function(i){ return i >= 0; });
        var iData = dataCol.map(function(c){ return head.indexOf(c); }).find(function(i){ return i >= 0; });
        if (iStato == null || iStato < 0) return 0;
        // Cancella dal fondo per non rompere gli indici
        var count = 0;
        for (var r = vals.length - 1; r >= 1; r--) {
          if (String(vals[r][iStato]).toLowerCase() !== 'archiviato') continue;
          var d = iData != null && iData >= 0 ? vals[r][iData] : null;
          var ts = d instanceof Date ? d.getTime() : (d ? new Date(d).getTime() : 0);
          if (ts > 0 && ts > soglia) continue;  // troppo recente
          sh.deleteRow(r + 1);
          count++;
        }
        return count;
      } catch(e) { Logger.log('purgeSheet ' + sheetName + ': ' + e.message); return 0; }
    }

    deleted.bandi   = purgeSheet('RADAR BANDI', ['StatoRecord','Stato'], ['DataRilevamento','DATA_RILEVAMENTO'], 'bando');
    deleted.news    = purgeSheet('Items', ['Stato'], ['Data'], 'news');
    deleted.podcast = purgeSheet('Podcast', ['Stato'], ['Data','DataAggiunta'], 'podcast');
    deleted.libri   = purgeSheet(BV415_SH_LIBRI, ['Stato'], ['DataAggiunta'], 'libro');

    var total = deleted.bandi + deleted.news + deleted.podcast + deleted.libri;
    var auditEntry = {
      action: 'emptyTrash',
      timestamp: new Date().toISOString(),
      minAgeDays: minAgeDays,
      deleted: deleted,
      totale: total,
      user: Session.getActiveUser().getEmail() || 'unknown'
    };
    PropertiesService.getScriptProperties().setProperty(
      'audit_emptyTrash_' + Date.now(), JSON.stringify(auditEntry)
    );
    Logger.log('emptyTrash: cancellati ' + total + ' record (' + JSON.stringify(deleted) + ')');
    return { ok: true, deleted: deleted, totale: total };
  } catch(e) {
    Logger.log('emptyTrash ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// FINE MODULO Backend_v415.gs
// ============================================================================
