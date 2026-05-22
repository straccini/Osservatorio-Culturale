// ============================================================================
//  Sondaggi_v1.gs — Sondaggi mirati LS2 (v4.18.17 · 2026-05-12)
// ----------------------------------------------------------------------------
//  6 sondaggi corti di pre-valutazione per la linea di servizio LS2
//  (pre-consulenza gestionale / sondaggi mirati di pre-valutazione).
//
//  Logica: ogni sondaggio = 6-7 domande Likert 1-5 + 1 nota libera + email opt-in.
//  Allineato a KB_Duemilamusei.md v1.1 (modelli operativi M_n + tematiche T_n).
//
//  Endpoint pubblici (frontend via google.script.run):
//    getSondaggioSchema(codice)  — ritorna schema del sondaggio richiesto
//    listSondaggi()              — ritorna meta dei 6 sondaggi disponibili
//    saveSondaggio(data)         — salva risposte nel foglio SondaggiMirati + notifica admin
//    setupSondaggiSheet()        — crea foglio (one-shot)
// ============================================================================

var OC_SONDAGGI_SHEET = 'SondaggiMirati';
var OC_SONDAGGI_HEADERS = [
  'response_id','timestamp','sondaggio_codice','sondaggio_nome',
  'risposte_json','nota_libera','email','consent','museo_nome','user_agent_hash'
];

// ============================================================================
// SCHEMA DEI 6 SONDAGGI (allineato KB modelli M_n + tematiche T_n)
// ============================================================================
var OC_SONDAGGI_SCHEMA = [
  {
    codice: 'gestione',
    nome: 'Gestione & modelli organizzativi',
    descrizione: 'Per capire la maturità organizzativa del tuo museo: ruoli, processi, sostenibilità, governance.',
    tematicaKB: 'T6 Gestione e valorizzazione patrimonio',
    modelliKB: ['M3 Concessione gestione contenitori', 'M11 Direzione apicale enti culturali'],
    domande: [
      { id:'g1', testo:'Il museo ha un piano di gestione formalizzato (3-5 anni) aggiornato?',           tipo:'likert' },
      { id:'g2', testo:'Esiste un organigramma chiaro con ruoli e responsabilità definite?',              tipo:'likert' },
      { id:'g3', testo:'I servizi di accoglienza, custodia e mediazione sono coperti in modo stabile?',   tipo:'likert' },
      { id:'g4', testo:'Il budget annuale è chiuso entro l\'inizio dell\'anno e monitorato?',             tipo:'likert' },
      { id:'g5', testo:'Avete un sistema di KPI di gestione (visitatori, costi, ricavi propri)?',         tipo:'likert' },
      { id:'g6', testo:'L\'ente di riferimento (Comune/Fondazione) supporta strategicamente il museo?',   tipo:'likert' }
    ]
  },
  {
    codice: 'accessibilita',
    nome: 'Accessibilità integrata',
    descrizione: 'Accessibilità fisica, cognitiva, sensoriale e linguistica. Conformità WCAG, LIS, ETR, CAA, Braille.',
    tematicaKB: 'T3 Accessibilità integrata',
    modelliKB: ['M14 Accessibilità integrata (LIS via partner ALCO)'],
    domande: [
      { id:'a1', testo:'Il percorso principale è accessibile a persone con disabilità motoria?',                  tipo:'likert' },
      { id:'a2', testo:'Sono presenti contenuti in LIS (Lingua dei Segni Italiana)?',                              tipo:'likert' },
      { id:'a3', testo:'Sono presenti materiali in Easy to Read (ETR) o CAA?',                                     tipo:'likert' },
      { id:'a4', testo:'Sono presenti supporti tattili o audio-descrittivi per non vedenti?',                      tipo:'likert' },
      { id:'a5', testo:'Il sito web del museo rispetta WCAG 2.1 AA (verifica accessibilità digitale)?',            tipo:'likert' },
      { id:'a6', testo:'Avete formazione attiva del personale sull\'accoglienza pubblici fragili?',                tipo:'likert' }
    ]
  },
  {
    codice: 'digital',
    nome: 'Digital, AI e fruizione tecnologica',
    descrizione: 'Sistemi HW/SW, app, AI narrante, virtual center, catalogo digitale, presenza online.',
    tematicaKB: 'T2 Sistemi HW/SW e AI per la fruizione',
    modelliKB: ['M2 Project Financing beni culturali (sw museale)', 'M8 Progettazione musealizzazione (digital)'],
    domande: [
      { id:'d1', testo:'Avete un sito web aggiornato con calendario eventi e biglietteria online?',          tipo:'likert' },
      { id:'d2', testo:'Esiste un\'app o audioguida digitale per il percorso?',                              tipo:'likert' },
      { id:'d3', testo:'Le collezioni sono catalogate in un database digitale (CMS) consultabile?',          tipo:'likert' },
      { id:'d4', testo:'Avete sperimentato AI per la fruizione (chatbot, narrazione, traduzione)?',          tipo:'likert' },
      { id:'d5', testo:'Avete piattaforme di realtà aumentata, virtual tour o virtual center?',              tipo:'likert' },
      { id:'d6', testo:'Raccogliete e analizzate dati di visita digitale (analytics)?',                      tipo:'likert' }
    ]
  },
  {
    codice: 'audience',
    nome: 'Audience, partecipazione e welfare culturale',
    descrizione: 'Coinvolgimento del pubblico, mediazione culturale, co-progettazione, welfare e impatto sociale.',
    tematicaKB: 'T5 Audience, partecipazione, welfare culturale, co-progettazione',
    modelliKB: ['M4 Convenzione di Faro / welfare culturale', 'M5 Reti culturali / DCE'],
    domande: [
      { id:'p1', testo:'Avete un piano di sviluppo dei pubblici (audience development) formalizzato?',         tipo:'likert' },
      { id:'p2', testo:'Esistono percorsi di mediazione culturale stabili (laboratori, didattica, visite)?',   tipo:'likert' },
      { id:'p3', testo:'Lavorate con comunità locali e gruppi target (anziani, scuole, migranti, disabili)?',  tipo:'likert' },
      { id:'p4', testo:'Avete attivato progetti di co-progettazione con utenti/cittadini?',                    tipo:'likert' },
      { id:'p5', testo:'Misurate l\'impatto sociale del museo oltre i numeri di visita?',                      tipo:'likert' },
      { id:'p6', testo:'Il museo è hub di welfare culturale per il territorio (servizi sociali, salute)?',     tipo:'likert' }
    ]
  },
  {
    codice: 'turismo',
    nome: 'Turismo culturale e asset territoriali',
    descrizione: 'Integrazione tra museo, destinazione turistica, IAT/DMC/DMO, gastronomia e paesaggio.',
    tematicaKB: 'T7 Sviluppo di asset turistici a base culturale',
    modelliKB: ['M10 Marketing territoriale / IAT-DMC-DMO', 'M7 Programmazione internazionale'],
    domande: [
      { id:'t1', testo:'Il museo è integrato in un sistema turistico locale (DMC/DMO)?',                       tipo:'likert' },
      { id:'t2', testo:'Esistono pacchetti turistici che includono il museo?',                                  tipo:'likert' },
      { id:'t3', testo:'Avete connessioni stabili con strutture ricettive del territorio?',                    tipo:'likert' },
      { id:'t4', testo:'Il sito è promosso su canali turistici nazionali e/o internazionali?',                  tipo:'likert' },
      { id:'t5', testo:'Avete una segnaletica turistica chiara e percorsi tematici nel territorio?',           tipo:'likert' },
      { id:'t6', testo:'Esiste una strategia per attrarre turisti culturali stranieri?',                        tipo:'likert' }
    ]
  },
  {
    codice: 'reti',
    nome: 'Reti culturali e Distretti Culturali Evoluti',
    descrizione: 'Partecipazione a sistemi territoriali, partenariati, progetti di rete su scala regionale o nazionale.',
    tematicaKB: 'T8 Sviluppo territoriale integrato',
    modelliKB: ['M5 Reti culturali / DCE', 'M6 Direzione Capitali Italiane / ECoC'],
    domande: [
      { id:'r1', testo:'Il museo fa parte di un sistema museale territoriale o regionale?',                    tipo:'likert' },
      { id:'r2', testo:'Avete progetti attivi di rete con altri musei o luoghi della cultura?',                tipo:'likert' },
      { id:'r3', testo:'Avete partecipato (o partecipate) a candidature Capitale Italiana della Cultura?',      tipo:'likert' },
      { id:'r4', testo:'Avete partenariati con università, fondazioni o associazioni di settore?',              tipo:'likert' },
      { id:'r5', testo:'Esistono progettualità europee in corso o programmate (Creative Europe, Horizon)?',     tipo:'likert' },
      { id:'r6', testo:'Avete fund-raising attivo da fondazioni private (Cariplo, S.Paolo, MAXXI…)?',           tipo:'likert' }
    ]
  }
];

// ============================================================================
// ENDPOINT PUBBLICI
// ============================================================================

/**
 * Lista meta dei 6 sondaggi disponibili (per UI catalogo).
 */
function listSondaggi() {
  return OC_SONDAGGI_SCHEMA.map(function(s){
    return { codice:s.codice, nome:s.nome, descrizione:s.descrizione, tematicaKB:s.tematicaKB, numDomande:s.domande.length };
  });
}

/**
 * Schema completo di un sondaggio (per il renderer frontend).
 * @param {string} codice — uno tra gestione/accessibilita/digital/audience/turismo/reti
 */
function getSondaggioSchema(codice) {
  if (!codice) return { ok:false, error:'codice mancante' };
  for (var i = 0; i < OC_SONDAGGI_SCHEMA.length; i++) {
    if (OC_SONDAGGI_SCHEMA[i].codice === codice) {
      return { ok:true, sondaggio: OC_SONDAGGI_SCHEMA[i] };
    }
  }
  return { ok:false, error:'sondaggio non trovato: ' + codice };
}

/**
 * Salva risposte sondaggio nel foglio SondaggiMirati + notifica admin.
 * @param {Object} data — { codice, risposte, nota, email, consent, museoNome }
 */
function saveSondaggio(data) {
  try {
    if (!data || !data.codice) return { ok:false, error:'codice sondaggio mancante' };
    if (!data.risposte || typeof data.risposte !== 'object') return { ok:false, error:'risposte mancanti' };

    var schemaRes = getSondaggioSchema(data.codice);
    if (!schemaRes.ok) return { ok:false, error: schemaRes.error };
    var sondaggio = schemaRes.sondaggio;

    // Calcola scoring sintetico (media risposte 1-5 → /100)
    var sum = 0, n = 0;
    Object.keys(data.risposte).forEach(function(k){
      var v = Number(data.risposte[k]);
      if (v >= 1 && v <= 5) { sum += v; n++; }
    });
    var scoreSintetico = n > 0 ? Math.round((sum / n) * 20) : 0;

    // Salva foglio
    var sh = _getOrCreateSondaggiSheet_();
    var responseId = 'SND' + Date.now() + Math.random().toString(36).substring(2, 6);
    sh.appendRow([
      responseId,
      new Date(),
      sondaggio.codice,
      sondaggio.nome,
      JSON.stringify(data.risposte),
      String(data.nota || ''),
      String(data.email || ''),
      data.consent === true ? true : false,
      String(data.museoNome || ''),
      ''
    ]);

    // Email notifica admin (solo se email opt-in)
    if (data.email && data.consent === true) {
      try { _emailNotificaSondaggio_(sondaggio, data, responseId, scoreSintetico); } catch(eMail) { Logger.log('Mail notifica: ' + eMail.message); }

      // Sblocco sessione permanente (come Matrix)
      var sessioneResult = null;
      try {
        if (typeof createSessione === 'function') {
          sessioneResult = createSessione(data.email, 'sondaggio_' + sondaggio.codice);
          Logger.log('Sessione sondaggio: ' + JSON.stringify(sessioneResult));
        } else {
          Logger.log('WARN: createSessione non disponibile a runtime');
        }
      } catch(eSess) { Logger.log('Sessione post-sondaggio ERRORE: ' + eSess.message); }

      // CRM lead scoring (+10pt compilazione sondaggio)
      try {
        if (typeof crm_recordEvent === 'function') {
          crm_recordEvent(responseId, 'sondaggio_compilato', 10, {
            codice: sondaggio.codice,
            tematica: sondaggio.tematicaKB,
            score: scoreSintetico
          });
          // +5pt extra se nota libera significativa
          if (data.nota && String(data.nota).trim().length > 10) {
            crm_recordEvent(responseId, 'sondaggio_nota_libera', 5, { length: String(data.nota).trim().length });
          }
        }
      } catch(eCrm) { Logger.log('CRM hook sondaggio: ' + eCrm.message); }
    }

    var sessioneOk = !!(sessioneResult && sessioneResult.ok);
    return {
      ok: true,
      responseId: responseId,
      scoreSintetico: scoreSintetico,
      sondaggio: sondaggio.nome,
      sessioneCreata: sessioneOk,
      sessioneErrore: (sessioneResult && !sessioneResult.ok) ? (sessioneResult.error || 'unknown') : null,
      magicLink: (sessioneResult && sessioneResult.magicLink) || null,
      modelliKB: sondaggio.modelliKB || []
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * Setup foglio SondaggiMirati (one-shot, idempotente).
 */
function setupSondaggiSheet() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  try {
    var sh = _getOrCreateSondaggiSheet_();
    return { ok:true, sheetName: OC_SONDAGGI_SHEET, headers: OC_SONDAGGI_HEADERS, rows: sh.getLastRow() - 1 };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// HELPERS PRIVATE
// ============================================================================

function _getOrCreateSondaggiSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OC_SONDAGGI_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_SONDAGGI_SHEET);
    sh.getRange(1, 1, 1, OC_SONDAGGI_HEADERS.length).setValues([OC_SONDAGGI_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _emailNotificaSondaggio_(sondaggio, data, responseId, score) {
  var admin = (typeof OC_ADMIN_DEFAULT_ !== 'undefined') ? OC_ADMIN_DEFAULT_ : 's.straccini@gmail.com';
  var subj = '[Osservatorio] Nuovo sondaggio ' + sondaggio.codice + ' compilato' + (data.museoNome ? ' · ' + data.museoNome : '');
  var body = ''
    + 'Nuovo sondaggio mirato LS2 compilato.\n\n'
    + 'Sondaggio: ' + sondaggio.nome + '\n'
    + 'Codice:    ' + sondaggio.codice + '\n'
    + 'Tematica:  ' + sondaggio.tematicaKB + '\n'
    + 'Modelli M attivabili: ' + (sondaggio.modelliKB || []).join(' · ') + '\n\n'
    + 'Compilatore email: ' + (data.email || '(non fornita)') + '\n'
    + 'Museo:             ' + (data.museoNome || '(non specificato)') + '\n'
    + 'Score sintetico:   ' + score + '/100\n'
    + 'Response id:       ' + responseId + '\n\n'
    + 'Nota libera del compilatore:\n' + (data.nota || '(nessuna)') + '\n\n'
    + 'Risposte dettagliate:\n' + JSON.stringify(data.risposte, null, 2) + '\n';
  MailApp.sendEmail({ to: admin, subject: subj, body: body });
}

// ============================================================================
// FINE Sondaggi_v1.gs
// ============================================================================
