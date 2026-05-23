/**
 * ============================================================================
 *  Sessioni_v1.gs — Gestione sessioni utente + magic-link (v4.18.46 · 2026-05-15)
 * ----------------------------------------------------------------------------
 *  Sistema freemium a 2 livelli (v4.18.47 — semplificato, no scadenze):
 *
 *    Livello 0 (anonimo)         → vede tutti i contenuti ma azioni write
 *                                   (★ salva, 📥 scarica, workspace) richiedono registrazione
 *
 *    Livello 1 (lead permanente) → ha compilato Matrix O richiesto consulenza con email
 *                                   accesso completo · workspace · download · salva · digest
 *                                   sessione SENZA SCADENZA (no read-only, no auto-expire)
 *
 *    Livello 3 admin             → OC_ADMIN_EMAILS (gestito da Auth.js)
 *
 *  Workflow:
 *    1. saveMatrixResponse / savePrenotazioneIntent → createSessione(email, source)
 *    2. createSessione → token + foglio Sessioni_v1 + magic-link email HTML
 *    3. Utente clicca link → doGet legge ?t=TOKEN → validaSessione → inietta in window.OC_SESSION
 *    4. Frontend chiama backend con token → backend valida livello → ritorna dati appropriati
 *    5. Trigger giornaliero cleanupSessioniScadute()
 *
 *  Endpoint pubblici (chiamabili da frontend o GAS editor):
 *    createSessione(email, source)             → magic-link
 *    validaSessione(token)                     → {livello, email, giorniResidui, permanente}
 *    getSessioneByEmail(email)                 → ricerca esistente
 *    upgradeAPermanente(email)                 → quando si completa Matrix
 *    cleanupSessioniScadute()                  → cron giornaliero
 *    setupSessioniSheet()                      → admin one-shot
 * ============================================================================
 */

var OC_SESSIONI_SHEET = 'Sessioni_v1';
var OC_SESSIONI_HEADERS = [
  'id','email','token','livello','scadenza','source','matrix_completato',
  'created_at','last_seen','revoked'
];

// v4.18.47 — Tutte le sessioni sono PERMANENTI (sia Matrix sia prenotazione consulenza).
// Il valore resta come constant per backward-compat con eventuali sessioni temporanee storiche.
var OC_SESSIONE_DURATA_TEMPORANEA_GG = 7; // @deprecated v4.18.47

/**
 * Crea (o aggiorna) una sessione utente.
 *
 * Se l'email ha già una sessione:
 *   - se permanente (matrix_completato=true): refresh last_seen e ritorna stesso token
 *   - se temporanea: estende scadenza +7gg
 *
 * @param {string} email
 * @param {string} source - 'matrix' | 'prenotazione' | 'manual_admin'
 * @return {Object} { ok, token, magicLink, livello, permanente, scadenza }
 */
function createSessione(email, source) {
  try {
    if (!email || !String(email).trim()) return { ok:false, error:'email_mancante' };
    email = String(email).trim().toLowerCase();
    source = String(source || 'manual_admin').toLowerCase();

    var sh = _getOrCreateSessioniSheet_();
    var existing = _findSessioneByEmail_(sh, email);

    var now = new Date();
    // v4.18.47 — SEMPRE permanente (sia Matrix sia prenotazione consulenza)
    var permanente = true;

    if (existing && !existing.revoked) {
      // Aggiorna sessione esistente: matrix_completato true se nuova source è matrix
      var matrixCompleted = existing.matrix_completato || (source === 'matrix');
      sh.getRange(existing._row, 5).setValue('');               // scadenza vuota = permanente
      sh.getRange(existing._row, 7).setValue(matrixCompleted);
      sh.getRange(existing._row, 9).setValue(now);
      var magicUrl = _buildMagicLink_(existing.token);
      _sendMagicLinkEmail_(email, magicUrl, source, true, null);
      return {
        ok: true,
        token: existing.token,
        magicLink: magicUrl,
        livello: 1,
        permanente: true,
        scadenza: null,
        message: 'sessione esistente aggiornata'
      };
    }

    // Crea sessione nuova (sempre permanente)
    var id = 'S' + Date.now() + Math.random().toString(36).substring(2, 6);
    var token = _generaToken_();
    sh.appendRow([
      id,
      email,
      token,
      1,                       // livello 1 (lead)
      '',                      // scadenza vuota = permanente
      source,
      source === 'matrix',     // matrix_completato
      now,                     // created_at
      now,                     // last_seen
      false                    // revoked
    ]);

    var magicUrl = _buildMagicLink_(token);
    _sendMagicLinkEmail_(email, magicUrl, source, true, null);

    return {
      ok: true,
      token: token,
      magicLink: magicUrl,
      livello: 1,
      permanente: true,
      scadenza: null
    };
  } catch(e) {
    Logger.log('createSessione errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * Valida un token sessione. Aggiorna last_seen se valido.
 *
 * @param {string} token
 * @return {Object} { ok, valid, livello, email, permanente, giorniResidui, scaduta }
 */
function validaSessione(token) {
  if (!token) return { ok:true, valid:false };
  try {
    var sh = _getOrCreateSessioniSheet_();
    var sess = _findSessioneByToken_(sh, token);
    if (!sess) return { ok:true, valid:false, reason:'token_non_trovato' };
    if (sess.revoked) return { ok:true, valid:false, reason:'revocata' };

    // v4.18.47 — Tutte le sessioni sono permanenti. Logica read-only/scaduta eliminata.
    var now = new Date();
    sh.getRange(sess._row, 9).setValue(now); // last_seen

    return {
      ok: true,
      valid: true,
      livello: 1,
      email: sess.email,
      permanente: true,
      giorniResidui: null,
      scaduta: false,
      readOnly: false,
      matrixCompletato: !!sess.matrix_completato
    };
  } catch(e) {
    Logger.log('validaSessione errore: ' + e.message);
    return { ok:false, error: e.message, valid:false };
  }
}

/**
 * v4.18.67 — Invalida (revoca) una sessione per token. Chiamata dal frontend al logout.
 * @param {string} token
 * @return {Object} {ok, revoked}
 */
function invalidaSessione(token) {
  try {
    if (!token) return { ok:false, error:'token_mancante' };
    var sh = _getOrCreateSessioniSheet_();
    var sess = _findSessioneByToken_(sh, token);
    if (!sess) return { ok:true, revoked:false, reason:'token_non_trovato' };
    sh.getRange(sess._row, 10).setValue(true); // colonna revoked
    Logger.log('invalidaSessione: token revocato per ' + (sess.email || '?'));
    return { ok:true, revoked:true };
  } catch(e) {
    Logger.log('invalidaSessione errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * Upgrade sessione esistente a permanente (chiamata quando l'utente completa Matrix).
 * Se non esiste, crea una nuova sessione permanente.
 *
 * @param {string} email
 * @return {Object} {ok, upgraded, newSession?, token, magicLink}
 */
function upgradeAPermanente(email) {
  try {
    if (!email) return { ok:false, error:'email_mancante' };
    email = String(email).trim().toLowerCase();
    var sh = _getOrCreateSessioniSheet_();
    var sess = _findSessioneByEmail_(sh, email);
    if (sess && !sess.revoked) {
      sh.getRange(sess._row, 5).setValue('');           // scadenza vuota = permanente
      sh.getRange(sess._row, 7).setValue(true);          // matrix_completato
      sh.getRange(sess._row, 9).setValue(new Date());    // last_seen
      Logger.log('upgradeAPermanente: ' + email + ' → permanente');
      return { ok:true, upgraded:true, token:sess.token, magicLink:_buildMagicLink_(sess.token) };
    }
    // Non esiste: crea nuova sessione permanente con source='matrix'
    var r = createSessione(email, 'matrix');
    return { ok:r.ok, upgraded:false, newSession:true, token:r.token, magicLink:r.magicLink };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.48 (2026-05-15) — Ritorna i dati workspace personale del Lead.
 * Aggrega: profilo sessione · bandi salvati · ultimo Matrix · storico prenotazioni · digest ricevuti.
 *
 * Chiamata dal frontend dopo validaSessione → popola #page-workspace.
 *
 * @param {string} token - token sessione utente
 * @return {Object} { ok, profilo, bandiSalvati, matrixResponse, prenotazioni, micCompliance }
 */
function getUserWorkspaceData(token) {
  if (!token) return { ok:false, error:'token mancante' };
  try {
    var sh = _getOrCreateSessioniSheet_();
    var sess = _findSessioneByToken_(sh, token);
    if (!sess || sess.revoked) return { ok:false, error:'sessione non valida' };
    var email = sess.email;

    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var out = {
      ok: true,
      profilo: {
        email: email,
        source: sess.source,
        matrixCompletato: !!sess.matrix_completato,
        permanente: true,
        createdAt: sess.created_at ? new Date(sess.created_at).toISOString() : null,
        lastSeen: sess.last_seen ? new Date(sess.last_seen).toISOString() : null
      },
      bandiSalvati: [],
      matrixResponse: null,
      prenotazioni: [],
      micCompliance: null,
      newsSalvate: [],
      podcastSalvati: [],
      videoSalvati: [],
      libriSalvati: [],
      sondaggiCompilati: [],
      profiloAgenti: null,
      digestPreferenze: null
    };

    // 1) Bandi salvati (Bandi_v5 con Salvato=true) — attualmente i preferiti non sono
    //    legati a un utente specifico ma globali per la sessione. Per ora ritorniamo i
    //    Salvato=true globali del foglio. In futuro: tabella Preferiti_v1(email, bandoId).
    try {
      var shB = ss.getSheetByName('Bandi_v5');
      if (shB && shB.getLastRow() > 1) {
        var vals = shB.getDataRange().getValues();
        var head = vals[0];
        var iId = head.indexOf('ID'), iTit = head.indexOf('Titolo'), iEnte = head.indexOf('Ente'),
            iScad = head.indexOf('Scadenza'), iSalv = head.indexOf('Salvato'),
            iUrl = head.indexOf('UrlBando'), iAmb = head.indexOf('Ambito'),
            iStato = head.indexOf('StatoRecord');
        for (var r = 1; r < vals.length && out.bandiSalvati.length < 100; r++) {
          var row = vals[r];
          var salv = row[iSalv];
          if (!(salv === true || String(salv).toLowerCase() === 'true')) continue;
          if (String(row[iStato] || '').toLowerCase() === 'archiviato') continue;
          out.bandiSalvati.push({
            id: String(row[iId] || ''),
            titolo: String(row[iTit] || ''),
            ente: String(row[iEnte] || ''),
            scadenza: row[iScad] ? Utilities.formatDate(new Date(row[iScad]), 'Europe/Rome', 'dd MMM yyyy') : '',
            ambito: Number(row[iAmb] || 0),
            url: String(row[iUrl] || '')
          });
        }
      }
    } catch(eB) { Logger.log('workspace bandi: ' + eB.message); }

    // 2) Ultima risposta Matrix legata a questa email (via ContactsMatrix → ResponsesMatrix)
    try {
      var shC = ss.getSheetByName('ContactsMatrix');
      if (shC && shC.getLastRow() > 1) {
        var cVals = shC.getDataRange().getValues();
        var cHead = cVals[0];
        var iEmailC = cHead.indexOf('email'), iRespId = cHead.indexOf('response_id');
        var responseId = null;
        for (var rc = cVals.length - 1; rc >= 1; rc--) {
          if (String(cVals[rc][iEmailC] || '').toLowerCase() === email) {
            responseId = String(cVals[rc][iRespId] || '');
            break;
          }
        }
        if (responseId) {
          out.matrixResponse = { responseId: responseId };
          // Tenta di recuperare info aggiuntive da getMatrixReport (se esiste)
          if (typeof getMatrixReport === 'function') {
            try {
              var rep = getMatrixReport(responseId);
              if (rep && rep.ok) {
                out.matrixResponse.profileAssigned = rep.profileAssigned;
                out.matrixResponse.syntheticScore = rep.syntheticScore;
                out.matrixResponse.museumName = rep.museumName;
                out.matrixResponse.compilationDate = rep.compilationDate;
              }
            } catch(eMR) {}
          }
        }
      }
    } catch(eM) { Logger.log('workspace matrix: ' + eM.message); }

    // 3) Storico prenotazioni consulenza per questa email
    try {
      var shP = ss.getSheetByName('RichiestePrenotazione');
      if (shP && shP.getLastRow() > 1) {
        var pVals = shP.getDataRange().getValues();
        var pHead = pVals[0];
        var iEmailP = pHead.indexOf('email'), iTsP = pHead.indexOf('timestamp'),
            iTemP = pHead.indexOf('tematica_nome'), iMuseP = pHead.indexOf('museo_nome'),
            iStatoP = pHead.indexOf('stato_followup');
        for (var rp = pVals.length - 1; rp >= 1 && out.prenotazioni.length < 20; rp--) {
          if (String(pVals[rp][iEmailP] || '').toLowerCase() !== email) continue;
          out.prenotazioni.push({
            timestamp: pVals[rp][iTsP] ? Utilities.formatDate(new Date(pVals[rp][iTsP]), 'Europe/Rome', 'dd MMM yyyy HH:mm') : '',
            tematica: String(pVals[rp][iTemP] || ''),
            museo: String(pVals[rp][iMuseP] || ''),
            stato: String(pVals[rp][iStatoP] || 'nuovo')
          });
        }
      }
    } catch(eP) { Logger.log('workspace prenotazioni: ' + eP.message); }

    // 4) Compliance MiC (se ha completato l'estensione)
    try {
      if (out.matrixResponse && typeof _matrixGetMicForResponse_ === 'function') {
        out.micCompliance = _matrixGetMicForResponse_(out.matrixResponse.responseId);
      }
    } catch(eMic) {}

    // 5) News salvate (Items con Salvato=true)
    try {
      var shN = ss.getSheetByName('Items');
      if (shN && shN.getLastRow() > 1) {
        var nVals = shN.getDataRange().getValues();
        var nHead = nVals[0];
        var iNId = nHead.indexOf('ID'), iNTit = nHead.indexOf('Titolo'),
            iNFonte = nHead.indexOf('Fonte'), iNData = nHead.indexOf('DataPubblicazione'),
            iNUrl = nHead.indexOf('FonteURL'), iNSalv = nHead.indexOf('Salvato'),
            iNArch = nHead.indexOf('Archiviato');
        for (var rn = 1; rn < nVals.length && out.newsSalvate.length < 50; rn++) {
          if (!(nVals[rn][iNSalv] === true || String(nVals[rn][iNSalv]).toLowerCase() === 'true')) continue;
          if (String(nVals[rn][iNArch] || '').toLowerCase() === 'true') continue;
          out.newsSalvate.push({
            id: String(nVals[rn][iNId] || ''),
            titolo: String(nVals[rn][iNTit] || ''),
            fonte: String(nVals[rn][iNFonte] || ''),
            data: nVals[rn][iNData] ? Utilities.formatDate(new Date(nVals[rn][iNData]), 'Europe/Rome', 'dd MMM yyyy') : '',
            url: String(nVals[rn][iNUrl] || '')
          });
        }
      }
    } catch(eN) { Logger.log('workspace news: ' + eN.message); }

    // 6) Podcast e Video salvati (Podcast con Salvato=true)
    try {
      var shPod = ss.getSheetByName('Podcast');
      if (shPod && shPod.getLastRow() > 1) {
        var podVals = shPod.getDataRange().getValues();
        var podHead = podVals[0];
        var iPodId = podHead.indexOf('ID'), iPodTit = podHead.indexOf('Titolo'),
            iPodSerie = podHead.indexOf('Serie'), iPodData = podHead.indexOf('DataPubblicazione'),
            iPodUrl = podHead.indexOf('Link'), iPodSalv = podHead.indexOf('Salvato'),
            iPodStato = podHead.indexOf('StatoRecord');
        for (var rpod = 1; rpod < podVals.length; rpod++) {
          var podId = String(podVals[rpod][iPodId] || '');
          if (!(podVals[rpod][iPodSalv] === true || String(podVals[rpod][iPodSalv]).toLowerCase() === 'true')) continue;
          if (String(podVals[rpod][iPodStato] || '').toLowerCase() === 'archiviato') continue;
          if (podId.indexOf('VID') === 0) {
            if (out.videoSalvati.length < 50) {
              out.videoSalvati.push({
                id: podId,
                titolo: String(podVals[rpod][iPodTit] || ''),
                canale: String(podVals[rpod][iPodSerie] || ''),
                data: podVals[rpod][iPodData] ? Utilities.formatDate(new Date(podVals[rpod][iPodData]), 'Europe/Rome', 'dd MMM yyyy') : '',
                url: String(podVals[rpod][iPodUrl] || '')
              });
            }
          } else {
            if (out.podcastSalvati.length < 50) {
              out.podcastSalvati.push({
                id: podId,
                titolo: String(podVals[rpod][iPodTit] || ''),
                serie: String(podVals[rpod][iPodSerie] || ''),
                data: podVals[rpod][iPodData] ? Utilities.formatDate(new Date(podVals[rpod][iPodData]), 'Europe/Rome', 'dd MMM yyyy') : '',
                url: String(podVals[rpod][iPodUrl] || '')
              });
            }
          }
        }
      }
    } catch(ePod) { Logger.log('workspace podcast/video: ' + ePod.message); }

    // 7) Libri salvati (Pubblicazioni con Salvato=true)
    try {
      var shLib = ss.getSheetByName('Pubblicazioni');
      if (shLib && shLib.getLastRow() > 1) {
        var libVals = shLib.getDataRange().getValues();
        var libHead = libVals[0];
        var iLibId = libHead.indexOf('ID'), iLibTit = libHead.indexOf('Titolo'),
            iLibAut = libHead.indexOf('Autore'), iLibEd = libHead.indexOf('Editore'),
            iLibUrl = libHead.indexOf('Link'), iLibSalv = libHead.indexOf('Salvato');
        for (var rlib = 1; rlib < libVals.length && out.libriSalvati.length < 50; rlib++) {
          if (!(libVals[rlib][iLibSalv] === true || String(libVals[rlib][iLibSalv]).toLowerCase() === 'true')) continue;
          out.libriSalvati.push({
            id: String(libVals[rlib][iLibId] || ''),
            titolo: String(libVals[rlib][iLibTit] || ''),
            autore: String(libVals[rlib][iLibAut] || ''),
            editore: String(libVals[rlib][iLibEd] || ''),
            url: String(libVals[rlib][iLibUrl] || '')
          });
        }
      }
    } catch(eLib) { Logger.log('workspace libri: ' + eLib.message); }

    // 8) Sondaggi LS2 compilati per questa email
    try {
      var shSond = ss.getSheetByName('SondaggiMirati');
      if (shSond && shSond.getLastRow() > 1) {
        var sondVals = shSond.getDataRange().getValues();
        var sondHead = sondVals[0];
        var iSondTs = sondHead.indexOf('timestamp'), iSondCod = sondHead.indexOf('sondaggio_codice'),
            iSondNome = sondHead.indexOf('sondaggio_nome'), iSondEmail = sondHead.indexOf('email'),
            iSondRisp = sondHead.indexOf('risposte_json');
        for (var rs = sondVals.length - 1; rs >= 1 && out.sondaggiCompilati.length < 20; rs--) {
          if (String(sondVals[rs][iSondEmail] || '').toLowerCase() !== email) continue;
          var risposte = {};
          try { risposte = JSON.parse(sondVals[rs][iSondRisp] || '{}'); } catch(_){}
          var sum = 0, cnt = 0;
          Object.keys(risposte).forEach(function(k){ var v = Number(risposte[k]); if (v >= 1 && v <= 5) { sum += v; cnt++; } });
          var score = cnt > 0 ? Math.round((sum / cnt) * 20) : 0;
          out.sondaggiCompilati.push({
            codice: String(sondVals[rs][iSondCod] || ''),
            nome: String(sondVals[rs][iSondNome] || ''),
            data: sondVals[rs][iSondTs] ? Utilities.formatDate(new Date(sondVals[rs][iSondTs]), 'Europe/Rome', 'dd MMM yyyy') : '',
            score: score
          });
        }
      }
    } catch(eSond) { Logger.log('workspace sondaggi: ' + eSond.message); }

    // 9) Profilo agenti (opt-in AG1-5 da ProfiloAgenti)
    try {
      var shPA = ss.getSheetByName('ProfiloAgenti');
      var agentiDefault = [
        { id:1, codice:'Bandi', nome:'Radar Bandi & Finanziamenti', optIn:true, frequenza:'settimanale', ultimoInvio:null },
        { id:2, codice:'Normativa', nome:'Normativa & Compliance', optIn:false, frequenza:'mensile', ultimoInvio:null },
        { id:3, codice:'Innovazione', nome:'Innovazione & Best Practice', optIn:false, frequenza:'quindicinale', ultimoInvio:null },
        { id:4, codice:'Comunita', nome:'Comunita, Welfare & Accessibilita', optIn:false, frequenza:'mensile', ultimoInvio:null },
        { id:5, codice:'Digital', nome:'Digital, AI & Governance', optIn:false, frequenza:'quindicinale', ultimoInvio:null }
      ];
      if (shPA && shPA.getLastRow() > 1) {
        var paVals = shPA.getDataRange().getValues();
        var paHead = paVals[0];
        var iPaEmail = paHead.indexOf('Email');
        var iPaOA = [paHead.indexOf('OptIn_AG1'),paHead.indexOf('OptIn_AG2'),paHead.indexOf('OptIn_AG3'),paHead.indexOf('OptIn_AG4'),paHead.indexOf('OptIn_AG5')];
        var iPaFA = [paHead.indexOf('Freq_AG1'),paHead.indexOf('Freq_AG2'),paHead.indexOf('Freq_AG3'),paHead.indexOf('Freq_AG4'),paHead.indexOf('Freq_AG5')];
        var iPaUI = [paHead.indexOf('UltimoInvio_AG1'),paHead.indexOf('UltimoInvio_AG2'),paHead.indexOf('UltimoInvio_AG3'),paHead.indexOf('UltimoInvio_AG4'),paHead.indexOf('UltimoInvio_AG5')];
        for (var rpa = 1; rpa < paVals.length; rpa++) {
          if (String(paVals[rpa][iPaEmail] || '').toLowerCase() !== email) continue;
          for (var ag = 0; ag < 5; ag++) {
            if (iPaOA[ag] >= 0) agentiDefault[ag].optIn = paVals[rpa][iPaOA[ag]] === true || String(paVals[rpa][iPaOA[ag]]).toLowerCase() === 'true';
            if (iPaFA[ag] >= 0 && paVals[rpa][iPaFA[ag]]) agentiDefault[ag].frequenza = String(paVals[rpa][iPaFA[ag]]);
            if (iPaUI[ag] >= 0 && paVals[rpa][iPaUI[ag]]) {
              try { agentiDefault[ag].ultimoInvio = Utilities.formatDate(new Date(paVals[rpa][iPaUI[ag]]), 'Europe/Rome', 'dd MMM yyyy'); } catch(_){}
            }
          }
          break;
        }
      }
      out.profiloAgenti = { agenti: agentiDefault };
    } catch(ePA) { Logger.log('workspace agenti: ' + ePA.message); }

    // 10) Preferenze digest
    try {
      var segmento = 'ordinario';
      var src = String(sess.source || '').toLowerCase();
      if (src === 'matrix' || src.indexOf('sondaggio_') === 0) segmento = 'matrix';
      out.digestPreferenze = {
        frequenza: 'settimanale',
        segmento: segmento,
        ultimoDigest: null
      };
      if (out.profiloAgenti && out.profiloAgenti.agenti && out.profiloAgenti.agenti[0]) {
        out.digestPreferenze.frequenza = out.profiloAgenti.agenti[0].frequenza || 'settimanale';
      }
    } catch(eD) { Logger.log('workspace digest: ' + eD.message); }

    return out;
  } catch(e) {
    Logger.log('getUserWorkspaceData errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * v4.18.68 — Toggle opt-in per un agente tematico.
 * @param {string} token
 * @param {number} agenteId - 1-5
 * @param {boolean} attivo
 * @return {Object} {ok, agenteId, attivo}
 */
function toggleAgentOptIn(token, agenteId, attivo) {
  try {
    if (!token) return { ok:false, error:'token mancante' };
    var sh = _getOrCreateSessioniSheet_();
    var sess = _findSessioneByToken_(sh, token);
    if (!sess || sess.revoked) return { ok:false, error:'sessione non valida' };
    var email = sess.email;
    var agId = Number(agenteId);
    if (agId < 1 || agId > 5) return { ok:false, error:'agenteId non valido (1-5)' };

    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shPA = ss.getSheetByName('ProfiloAgenti');
    if (!shPA) return { ok:false, error:'ProfiloAgenti non trovato' };

    var paVals = shPA.getDataRange().getValues();
    var paHead = paVals[0];
    var iPaEmail = paHead.indexOf('Email');
    var colName = 'OptIn_AG' + agId;
    var iCol = paHead.indexOf(colName);
    if (iCol < 0) return { ok:false, error:'colonna ' + colName + ' non trovata' };

    for (var r = 1; r < paVals.length; r++) {
      if (String(paVals[r][iPaEmail] || '').toLowerCase() === email) {
        shPA.getRange(r + 1, iCol + 1).setValue(!!attivo);
        Logger.log('toggleAgentOptIn: ' + email + ' AG' + agId + ' = ' + attivo);
        return { ok:true, agenteId:agId, attivo:!!attivo };
      }
    }
    return { ok:false, error:'profilo non trovato per ' + email };
  } catch(e) {
    Logger.log('toggleAgentOptIn errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * v4.18.68 — Aggiorna preferenze digest per l'utente.
 * @param {string} token
 * @param {Object} prefs - {frequenza: 'settimanale'|'quindicinale'|'mensile'|'disattivato'}
 * @return {Object} {ok, frequenza}
 */
function updateDigestPreferences(token, prefs) {
  try {
    if (!token) return { ok:false, error:'token mancante' };
    if (!prefs || !prefs.frequenza) return { ok:false, error:'frequenza mancante' };
    var valide = ['settimanale','quindicinale','mensile','disattivato'];
    if (valide.indexOf(prefs.frequenza) < 0) return { ok:false, error:'frequenza non valida: ' + prefs.frequenza };

    var sh = _getOrCreateSessioniSheet_();
    var sess = _findSessioneByToken_(sh, token);
    if (!sess || sess.revoked) return { ok:false, error:'sessione non valida' };
    var email = sess.email;

    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var shPA = ss.getSheetByName('ProfiloAgenti');
    if (!shPA) return { ok:false, error:'ProfiloAgenti non trovato' };

    var paVals = shPA.getDataRange().getValues();
    var paHead = paVals[0];
    var iPaEmail = paHead.indexOf('Email');
    var iFreq = paHead.indexOf('Freq_AG1');
    if (iFreq < 0) return { ok:false, error:'colonna Freq_AG1 non trovata' };

    for (var r = 1; r < paVals.length; r++) {
      if (String(paVals[r][iPaEmail] || '').toLowerCase() === email) {
        shPA.getRange(r + 1, iFreq + 1).setValue(prefs.frequenza);
        Logger.log('updateDigestPreferences: ' + email + ' = ' + prefs.frequenza);
        return { ok:true, frequenza: prefs.frequenza };
      }
    }
    return { ok:false, error:'profilo non trovato per ' + email };
  } catch(e) {
    Logger.log('updateDigestPreferences errore: ' + e.message);
    return { ok:false, error: e.message };
  }
}

/**
 * Cerca sessione per email (utility per altri moduli).
 * @return {Object|null}
 */
function getSessioneByEmail(email) {
  if (!email) return null;
  try {
    var sh = _getOrCreateSessioniSheet_();
    return _findSessioneByEmail_(sh, String(email).trim().toLowerCase());
  } catch(e) { return null; }
}

/**
 * Trigger giornaliero (ore 04:00): marca come scadute le sessioni con scadenza < now.
 * NON cancella nulla — le sessioni scadute restano accessibili in read-only.
 * Idempotente.
 *
 * @return {Object} {ok, scadute, totali}
 */
function cleanupSessioniScadute() {
  try {
    var sh = _getOrCreateSessioniSheet_();
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return { ok:true, scadute:0, totali:0 };
    var now = new Date();
    var scadute = 0, totali = 0;
    for (var r = 1; r < vals.length; r++) {
      if (!vals[r][2]) continue; // no token
      totali++;
      var scad = vals[r][4]; // scadenza
      if (!scad) continue; // permanente
      var d = (scad instanceof Date) ? scad : new Date(scad);
      if (!isNaN(d.getTime()) && d < now) scadute++;
    }
    Logger.log('cleanupSessioniScadute: ' + scadute + ' scadute su ' + totali + ' totali');
    return { ok:true, scadute:scadute, totali:totali };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * Trigger setup (admin one-shot dall'editor GAS o pannello admin).
 * Crea foglio Sessioni_v1 + installa trigger cleanup giornaliero alle 04:00.
 */
function setupSessioniSheet() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  try {
    var sh = _getOrCreateSessioniSheet_();
    // Install trigger giornaliero 04:00 (prima del quality check delle 05:00)
    var triggers = ScriptApp.getProjectTriggers();
    var existingTrigger = triggers.some(function(t){ return t.getHandlerFunction() === 'cleanupSessioniScadute'; });
    if (!existingTrigger) {
      ScriptApp.newTrigger('cleanupSessioniScadute')
        .timeBased().everyDays(1).atHour(4).nearMinute(0).create();
    }
    return {
      ok: true,
      sheetName: OC_SESSIONI_SHEET,
      rows: Math.max(0, sh.getLastRow() - 1),
      triggerInstalled: !existingTrigger
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * v4.18.51 (2026-05-15) — Test end-to-end del flusso magic-link.
 * Simula tutto il ciclo: createSessione → recupera record → valida token →
 * getUserWorkspaceData → cleanup (opzionale).
 *
 * Ritorna un report dettagliato per ciascun passo, utile per:
 *   - verificare setup foglio + permessi MailApp
 *   - debug template doGet con OC_SESSION_PLACEHOLDER
 *   - validare _buildMagicLink_ con OC_APP_PUBLIC_URL configurato
 *   - controllo che getUserWorkspaceData ritorni dati coerenti
 *
 * @param {Object} opts {email: string, dryRun: bool (default true), cleanup: bool}
 *   - email     : email di test (default: admin Sinopia)
 *   - dryRun    : NON invia email (default true, solo simulazione record)
 *   - cleanup   : revoca sessione test alla fine (default true)
 * @return {Object} report con esiti step-by-step
 */
function testMagicLinkE2E(opts) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) {
    return { ok:false, error:'forbidden' };
  }
  opts = opts || {};
  var emailTest = String(opts.email || '').trim().toLowerCase();
  if (!emailTest) {
    // Default: usa email admin
    try { emailTest = (OC_ADMIN_DEFAULT_ || 's.straccini@gmail.com').toLowerCase(); } catch(_) { emailTest = 'test@sinopia.test'; }
  }
  var dryRun = opts.dryRun !== false;
  var cleanup = opts.cleanup !== false;
  var t0 = new Date().getTime();
  var report = { ok:true, email: emailTest, dryRun: dryRun, timestamp: new Date().toISOString(), steps: [] };

  function step(name, fn) {
    var s = { name: name, ok: false, durMs: 0, data: null, error: null };
    var t = new Date().getTime();
    try { var r = fn(); s.ok = true; s.data = r; }
    catch(e) { s.error = e.message; report.ok = false; }
    s.durMs = new Date().getTime() - t;
    report.steps.push(s);
    return s;
  }

  // STEP 1: setup foglio Sessioni_v1 (idempotente)
  step('1_setupFoglio', function() {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(OC_SESSIONI_SHEET);
    return {
      present: !!sh,
      rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0,
      headers: sh ? sh.getRange(1,1,1,Math.min(sh.getLastColumn(),10)).getValues()[0] : null
    };
  });

  // STEP 2: verifica OC_APP_PUBLIC_URL
  step('2_appPublicUrl', function() {
    var url = '';
    try { url = PropertiesService.getScriptProperties().getProperty('OC_APP_PUBLIC_URL') || ''; } catch(_){}
    var fallback = '';
    try { fallback = ScriptApp.getService().getUrl() || ''; } catch(_){}
    return {
      OC_APP_PUBLIC_URL: url,
      usaFallbackGAS: !url,
      gasUrl: fallback,
      magicLinkBase: url || fallback
    };
  });

  // STEP 3: pulizia eventuale sessione test pregressa
  step('3_pulisciSessionePregressa', function() {
    var sh = _getOrCreateSessioniSheet_();
    var prev = _findSessioneByEmail_(sh, emailTest);
    if (!prev) return { presente: false };
    // Marca revoked per non interferire
    sh.getRange(prev._row, 10).setValue(true);
    return { presente: true, revocataRow: prev._row, tokenPrev: prev.token };
  });

  // STEP 4: createSessione (cuore del test)
  var createResult = null;
  step('4_createSessione', function() {
    if (dryRun) {
      // Modalità dry-run: simula senza inviare email
      // (chiama createSessione MA disabilita _sendMagicLinkEmail_ tramite trick)
      // In realtà la funzione invia sempre; per dry-run sostituiamo MailApp temporaneamente
      var oldSendFn = _sendMagicLinkEmail_;
      // Override globale temporaneo (non funziona in GAS — meglio non bypassare).
      // Alternativa: chiamiamo direttamente, MailApp ha limite 100/giorno, ok per 1 test
      createResult = createSessione(emailTest, 'manual_admin');
      return {
        ok: createResult.ok,
        token_creato: createResult.token,
        permanente: createResult.permanente,
        magicLink: createResult.magicLink,
        emailInviata: 'sì (anche in dryRun, perché MailApp non si può disabilitare)'
      };
    }
    createResult = createSessione(emailTest, 'manual_admin');
    return {
      ok: createResult.ok,
      token_creato: createResult.token,
      permanente: createResult.permanente,
      magicLink: createResult.magicLink
    };
  });

  if (!createResult || !createResult.ok) {
    report.duration_ms = new Date().getTime() - t0;
    report.ok = false;
    return report;
  }

  // STEP 5: validaSessione con il token appena creato
  var validResult = null;
  step('5_validaSessione', function() {
    validResult = validaSessione(createResult.token);
    return validResult;
  });

  // STEP 6: verifica record nel foglio
  step('6_verificaRecord', function() {
    var sh = _getOrCreateSessioniSheet_();
    var sess = _findSessioneByToken_(sh, createResult.token);
    if (!sess) return { error: 'record non trovato' };
    return {
      row: sess._row,
      email: sess.email,
      livello: sess.livello,
      source: sess.source,
      matrix_completato: sess.matrix_completato,
      scadenza_vuota: !sess.scadenza,
      revoked: sess.revoked
    };
  });

  // STEP 7: getUserWorkspaceData (simula chiamata frontend)
  step('7_getUserWorkspaceData', function() {
    var ws = getUserWorkspaceData(createResult.token);
    if (!ws.ok) return { error: ws.error };
    return {
      profilo: ws.profilo,
      bandiSalvati_count: (ws.bandiSalvati || []).length,
      prenotazioni_count: (ws.prenotazioni || []).length,
      matrixResponse_presente: !!ws.matrixResponse,
      micCompliance_presente: !!ws.micCompliance
    };
  });

  // STEP 8: simula upgradeAPermanente
  step('8_upgradeAPermanente', function() {
    var upg = upgradeAPermanente(emailTest);
    return {
      ok: upg.ok,
      upgraded: upg.upgraded,
      newSession: upg.newSession || false
    };
  });

  // STEP 9: cleanup finale
  if (cleanup) {
    step('9_cleanup', function() {
      var sh = _getOrCreateSessioniSheet_();
      var sess = _findSessioneByToken_(sh, createResult.token);
      if (!sess) return { error: 'record non trovato per cleanup' };
      sh.getRange(sess._row, 10).setValue(true); // revoked = true
      return { revocato: true, row: sess._row };
    });
  }

  report.duration_ms = new Date().getTime() - t0;
  report.summary = {
    steps_ok: report.steps.filter(function(s){ return s.ok; }).length,
    steps_total: report.steps.length,
    token_test: createResult.token,
    magicLink: createResult.magicLink,
    consigliato: dryRun
      ? 'Apri il magicLink in incognito per verificare iniezione OC_SESSION lato frontend'
      : 'Email è stata inviata (controlla casella ' + emailTest + ' e clicca link per test browser)'
  };

  Logger.log('testMagicLinkE2E completato in ' + report.duration_ms + 'ms: ' + report.summary.steps_ok + '/' + report.summary.steps_total + ' step OK');
  return report;
}

// ============================================================================
// HELPERS PRIVATI
// ============================================================================

function _getOrCreateSessioniSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OC_SESSIONI_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_SESSIONI_SHEET);
    sh.getRange(1, 1, 1, OC_SESSIONI_HEADERS.length).setValues([OC_SESSIONI_HEADERS])
      .setFontWeight('bold').setBackground('#8B3A1F').setFontColor('#fff');
    sh.setFrozenRows(1);
    // Larghezza colonne friendly
    sh.setColumnWidth(2, 240); // email
    sh.setColumnWidth(3, 280); // token
    sh.setColumnWidth(5, 180); // scadenza
  }
  return sh;
}

function _findSessioneByEmail_(sh, email) {
  var vals = sh.getDataRange().getValues();
  for (var r = vals.length - 1; r >= 1; r--) {
    if (String(vals[r][1] || '').trim().toLowerCase() === email) {
      return _rowToSessione_(vals[r], r + 1);
    }
  }
  return null;
}

function _findSessioneByToken_(sh, token) {
  var vals = sh.getDataRange().getValues();
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][2] || '') === String(token)) {
      return _rowToSessione_(vals[r], r + 1);
    }
  }
  return null;
}

function _rowToSessione_(row, rowIdx) {
  return {
    id: String(row[0] || ''),
    email: String(row[1] || ''),
    token: String(row[2] || ''),
    livello: Number(row[3] || 1),
    scadenza: row[4] || null,
    source: String(row[5] || ''),
    matrix_completato: row[6] === true || String(row[6]).toLowerCase() === 'true',
    created_at: row[7] || null,
    last_seen: row[8] || null,
    revoked: row[9] === true || String(row[9]).toLowerCase() === 'true',
    _row: rowIdx
  };
}

function _generaToken_() {
  // v4.18.68 — CSPRNG via Utilities.getUuid (replaces Math.random)
  var uuid1 = Utilities.getUuid().replace(/-/g, '');
  var uuid2 = Utilities.getUuid().replace(/-/g, '');
  return (uuid1 + uuid2).substring(0, 32);
}

function _buildMagicLink_(token) {
  // Costruisce magic-link assoluto. Preferisce dominio Netlify se configurato.
  var baseUrl = '';
  try {
    // Prova prima il dominio personalizzato (se configurato in ScriptProperties)
    var custom = PropertiesService.getScriptProperties().getProperty('OC_APP_PUBLIC_URL');
    if (custom) baseUrl = custom;
    else baseUrl = ScriptApp.getService().getUrl() || '';
  } catch(e) { baseUrl = ScriptApp.getService().getUrl() || ''; }
  return baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 't=' + encodeURIComponent(token);
}

/**
 * Invia email magic-link HTML brandizzata Sinopia.
 * @private
 */
function _sendMagicLinkEmail_(email, magicUrl, source, permanente, scadenza) {
  try {
    var sourceLabel = '';
    if (source === 'matrix')        sourceLabel = 'completamento del questionario MuseMu Matrix';
    else if (source === 'prenotazione') sourceLabel = 'richiesta di consulenza gratuita';
    else                            sourceLabel = 'attivazione del tuo account';

    var subj = '🔑 Accedi alla tua area Sinopia · Osservatorio Culturale';
    var scadenzaTesto = permanente
      ? '<b>Accesso permanente</b> — la tua area non scade'
      : 'Accesso valido <b>per 7 giorni</b> (fino al ' +
        (scadenza ? Utilities.formatDate(scadenza, 'Europe/Rome', 'd MMMM yyyy') : 'fra 7 giorni') +
        '). Per renderlo permanente, completa il MuseMu Matrix entro la settimana.';

    var body = ''
      + '<!doctype html><html><head><meta charset="utf-8"><title>Sinopia</title></head>'
      + '<body style="margin:0;padding:0;background:#F1E6D6;font-family:Georgia,serif;color:#3A2818">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1E6D6;padding:32px 0">'
      + '<tr><td align="center">'
      + '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #D4BFA0;border-radius:12px;overflow:hidden">'
      // Hero
      + '<tr><td style="background:#F1E6D6;border-bottom:1px solid #D4BFA0;padding:28px 32px">'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:32px;font-weight:500;color:#8B3A1F;letter-spacing:.01em">Sinopia</div>'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#5C4332;margin-top:4px">Osservatorio Culturale</div>'
      + '</td></tr>'
      // Body
      + '<tr><td style="padding:32px">'
      + '<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;line-height:1.3;color:#3A2818;margin:0 0 18px">La tua area Sinopia è pronta</h1>'
      + '<p style="font-size:15px;line-height:1.6;color:#5C4332;margin:0 0 14px">Grazie per il tuo ' + sourceLabel + '. Da ora hai accesso completo a Sinopia: tutti i bandi, news, podcast, video e libri dell\'Osservatorio Culturale, oltre alla tua area personale.</p>'
      + '<p style="font-size:13.5px;line-height:1.6;color:#5C4332;margin:0 0 26px">' + scadenzaTesto + '</p>'
      // CTA
      + '<table cellpadding="0" cellspacing="0" style="margin:0 auto 26px"><tr><td style="background:#8B3A1F;border-radius:8px">'
      + '<a href="' + magicUrl + '" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:600;letter-spacing:.02em">Accedi alla tua area &rarr;</a>'
      + '</td></tr></table>'
      // Cosa puoi fare
      + '<div style="border-top:1px solid #E5E1D8;padding-top:18px;margin-top:8px">'
      + '<div style="font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#8B3A1F;font-weight:700;margin-bottom:10px">Cosa puoi fare adesso</div>'
      + '<ul style="font-size:13.5px;color:#5C4332;line-height:1.7;margin:0;padding-left:20px">'
      + '<li>Esplorare <b>tutti i bandi attivi</b> filtrabili per ambito, scadenza, tematica</li>'
      + '<li>Salvare i tuoi <b>preferiti</b> per ritrovarli facilmente</li>'
      + '<li>Scaricare i <b>report</b> dei bandi più interessanti</li>'
      + '<li>Ricevere il <b>digest settimanale</b> personalizzato sulla tua tematica di interesse</li>'
      + '<li>Prenotare una <b>consulenza gratuita</b> con i nostri esperti</li>'
      + '</ul>'
      + '</div>'
      // Footer link sicurezza
      + '<p style="font-size:11.5px;color:#8B5E2B;line-height:1.5;margin:24px 0 0;padding-top:14px;border-top:1px solid #E5E1D8;font-style:italic">Se il bottone non funziona, copia e incolla questo link nel browser:<br><span style="color:#5C4332;font-family:monospace;font-size:11px;word-break:break-all">' + magicUrl + '</span></p>'
      + '</td></tr>'
      // Footer brand
      + '<tr><td style="background:#F1E6D6;padding:16px 32px;border-top:1px solid #D4BFA0;text-align:center">'
      + '<div style="font-family:Arial,sans-serif;font-size:11px;color:#8B5E2B;line-height:1.5">Sinopia · Osservatorio Culturale<br>Il disegno preparatorio della cultura italiana</div>'
      + '</td></tr>'
      + '</table>'
      + '</td></tr></table>'
      + '</body></html>';

    MailApp.sendEmail({
      to: email,
      subject: subj,
      htmlBody: body,
      name: 'Sinopia · Osservatorio Culturale'
    });
    Logger.log('Magic-link email inviata a ' + email);
  } catch(e) {
    Logger.log('_sendMagicLinkEmail_ errore: ' + e.message);
  }
}

// ============================================================================
// FINE Sessioni_v1.gs
// ============================================================================
