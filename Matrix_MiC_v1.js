// ============================================================================
//  Matrix_MiC_v1.gs — Estensione MuseMu Matrix con autovalutazione MiC SM-LUQV
//  v4.18.26 · 2026-05-13
// ----------------------------------------------------------------------------
//  Step opzionale post-Matrix: somministra il questionario di autovalutazione
//  degli Standard Minimi di qualità per i musei NON accreditati al Sistema
//  Museale Nazionale (DM 113/2018 · Allegato A4).
//
//  Flusso:
//    1. Compilatore termina Matrix → riceve report standard
//    2. Schermata transizione: "Vuoi anche la certificazione di compliance
//       MiC SM-LUQV?" (SI prosegue, NO chiude)
//    3. Sistema PRE-COMPILA dalle 10 dimensioni Matrix le risposte ricavabili
//       (~70% del questionario MiC)
//    4. Compilatore conferma / corregge / integra solo le domande mancanti
//       (status giuridico, numero visitatori 3 anni, atti formali responsabili)
//    5. Output: report aggiuntivo con % SM rispettati, gap critici, roadmap
//
//  Storage: foglio "ResponsesMatrixMiC" parallelo a ResponsesMatrix, con
//  chiave esterna su responseId Matrix per join.
//
//  Endpoint pubblici:
//    getMicSchema()                   → schema completo questionario
//    getMicPrecompiled(matrixId)      → risposte pre-compilate da Matrix
//    saveMicResponse(data)            → salva risposte + calcola compliance
//    getMicReport(micId)              → report finale per il compilatore
// ============================================================================

var OC_MIC_SHEET = 'ResponsesMatrixMiC';
var OC_MIC_SCHEMA_VERSION = 'mic-luqv-v1.0-2026-05-13';

// ============================================================================
// SCHEMA QUESTIONARIO MiC SM-LUQV (DM 113/2018 · Allegato A4)
// ============================================================================
// Ogni domanda ha:
//   id           — codice univoco (es. "1.1", "1.3.3a")
//   sezione      — Organizzazione · Collezioni · Comunicazione
//   sottoSez     — sottosezione (es. "Status giuridico")
//   testo        — testo della domanda come da PDF MiC
//   tipo         — radio | checkbox-multi | numero | testo
//   opzioni      — array {valore, label} per radio/checkbox-multi
//   sm           — true se è uno Standard Minimo obbligatorio
//   mapMatrix    — array dimensioni Matrix da cui pre-compilare
//   precompileFn — funzione opzionale che riceve matrixScores e ritorna risposta suggerita

var OC_MIC_SCHEMA = {
  meta: {
    version: OC_MIC_SCHEMA_VERSION,
    fonte: 'DM 113/2018 · Allegato A4 · Questionario autovalutazione SM-LUQV per musei NON accreditati al SMN',
    promotore: 'Ministero della Cultura (MiC)',
    sezioni: [
      { id:'1', nome:'Organizzazione', sottoSezioni: 9 },
      { id:'2', nome:'Collezioni',     sottoSezioni: 5 },
      { id:'3', nome:'Comunicazione',  sottoSezioni: 7 }
    ]
  },

  domande: [
    // ============ 1. ORGANIZZAZIONE ============

    // 1.1 Status giuridico
    {
      id:'1.1', sezione:'1', sottoSez:'Status giuridico',
      testo:'Il museo è dotato di statuto e/o regolamento?',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'statuto',     label:'Statuto' },
        { valore:'regolamento', label:'Regolamento' }
      ],
      mapMatrix:['D9'], // governance
      note:'Domanda non sempre derivabile dal Matrix — chiedere conferma esplicita.'
    },

    // 1.2 Contabilità e finanze
    {
      id:'1.2', sezione:'1', sottoSez:'Contabilità e finanze',
      testo:'Il museo è dotato di un documento economico-finanziario?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D10'], // sostenibilità
      precompileFn:'D10_to_documentoEcoFin'
    },

    // 1.3 Struttura — spazi idonei
    {
      id:'1.3', sezione:'1', sottoSez:'Struttura · spazi idonei',
      testo:'Il museo dispone di spazi idonei e adeguati alle funzioni di:',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'conservazione', label:'Conservazione' },
        { valore:'esposizione',   label:'Esposizione permanente' },
        { valore:'accoglienza',   label:'Accoglienza, informazioni, biglietteria' },
        { valore:'disabili',      label:'Servizi anche per persone con disabilità' }
      ],
      mapMatrix:['D3','D7'], // conservazione + accessibilità
      precompileFn:'D3D7_to_spaziIdonei'
    },

    // 1.3.3 Accesso disabili — strutture
    {
      id:'1.3.3a', sezione:'1', sottoSez:'Accesso alle persone con disabilità',
      testo:'È garantito l\'accesso alle strutture museali alle persone con disabilità?',
      tipo:'radio', sm:true,
      opzioni:[
        {valore:'si',label:'Sì'}, {valore:'no',label:'No'},
        {valore:'parziale',label:'Parzialmente'},
        {valore:'deroga',label:'Edificio con deroga per impossibilità tecnica/vincolo tutela'}
      ],
      mapMatrix:['D7'],
      precompileFn:'D7_to_accessoDisabili'
    },

    // 1.3.3 Accesso disabili — percorso minimo
    {
      id:'1.3.3b', sezione:'1', sottoSez:'Accesso alle persone con disabilità',
      testo:'È individuato un percorso minimo per persone con disabilità?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D7'],
      precompileFn:'D7_to_percorsoMinimo'
    },

    // 1.3.4 Sicurezza
    {
      id:'1.3.4a', sezione:'1', sottoSez:'Sicurezza',
      testo:'È rispettata la normativa in materia di sicurezza?',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'strutture', label:'Per le strutture' },
        { valore:'persone',   label:'Per le persone' },
        { valore:'opere',     label:'Per le opere' }
      ],
      mapMatrix:['D3','D9'],
      note:'Non sempre derivabile dal Matrix — di solito serve conferma diretta.'
    },

    // 1.3.4 Barriere architettoniche
    {
      id:'1.3.4b', sezione:'1', sottoSez:'Sicurezza',
      testo:'La struttura è a norma in materia di superamento delle barriere architettoniche?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D7'],
      precompileFn:'D7_to_barriereArch'
    },

    // 1.4.1 Apertura
    {
      id:'1.4.1', sezione:'1', sottoSez:'Apertura al pubblico',
      testo:'Il museo è aperto:',
      tipo:'radio', sm:true,
      opzioni:[
        { valore:'12h-sett', label:'Almeno 12 ore settimanali garantite + apertura su prenotazione' },
        { valore:'60gg-stag', label:'Aperture stagionali: almeno 60 giorni/anno + apertura su prenotazione' },
        { valore:'nessuno',  label:'Nessuno dei due' }
      ],
      mapMatrix:[], // domanda specifica, non in Matrix
      note:'Da chiedere esplicitamente.'
    },

    // 1.4.1 INFO orario dettagliato
    {
      id:'1.4.1-info', sezione:'1', sottoSez:'Apertura al pubblico',
      testo:'Specificare in modo dettagliato l\'articolazione dell\'orario di apertura settimanale (effettivo e su prenotazione), indicando il numero totale delle ore.',
      tipo:'testo', sm:false,
      mapMatrix:[]
    },

    // 1.4.2 Registrazione ingressi
    {
      id:'1.4.2a', sezione:'1', sottoSez:'Registrazione degli ingressi',
      testo:'È effettuata la registrazione puntuale degli ingressi, anche se a titolo gratuito?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D6'], // digital maturity
      precompileFn:'D6_to_registrazioneIngressi'
    },
    {
      id:'1.4.2b', sezione:'1', sottoSez:'Registrazione degli ingressi',
      testo:'Indicare con quale modalità',
      tipo:'checkbox-multi', sm:false,
      opzioni:[
        { valore:'biglietti',  label:'Numero biglietti staccati' },
        { valore:'cartaceo',   label:'Registro cartaceo dei visitatori' },
        { valore:'elettronico',label:'Registro elettronico dei visitatori' },
        { valore:'altro',      label:'Altro' }
      ],
      mapMatrix:['D6']
    },
    {
      id:'1.4.2-info-2024', sezione:'1', sottoSez:'Registrazione degli ingressi',
      testo:'Numero visitatori complessivo — Anno 2024',
      tipo:'numero', sm:false, mapMatrix:[]
    },
    {
      id:'1.4.2-info-2023', sezione:'1', sottoSez:'Registrazione degli ingressi',
      testo:'Numero visitatori complessivo — Anno 2023',
      tipo:'numero', sm:false, mapMatrix:[]
    },
    {
      id:'1.4.2-info-2022', sezione:'1', sottoSez:'Registrazione degli ingressi',
      testo:'Numero visitatori complessivo — Anno 2022',
      tipo:'numero', sm:false, mapMatrix:[]
    },

    // 1.4.3 Piano annuale attività
    {
      id:'1.4.3a', sezione:'1', sottoSez:'Pianificazione',
      testo:'Il museo elabora un piano annuale delle attività?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D1','D2'],
      precompileFn:'D1D2_to_pianoAnnuale'
    },
    {
      id:'1.4.3b', sezione:'1', sottoSez:'Pianificazione',
      testo:'Il museo elabora un piano annuale delle attività educative?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D5'],
      precompileFn:'D5_to_pianoEducative'
    },

    // 1.5 Responsabili formali
    {
      id:'1.5.1', sezione:'1', sottoSez:'Responsabili · Direttore',
      testo:'È individuata mediante atto formale la figura del Direttore con specifica competenza ed esperienza professionale (anche in condivisione con altri istituti)?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D9'],
      precompileFn:'D9_to_direttore'
    },
    {
      id:'1.5.2', sezione:'1', sottoSez:'Responsabili · Collezioni',
      testo:'La funzione di Responsabile delle collezioni è svolta da personale con specifica competenza professionale, con attribuzione formale dell\'incarico (anche in condivisione)?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D3','D9'],
      precompileFn:'D3D9_to_respCollezioni'
    },
    {
      id:'1.5.3', sezione:'1', sottoSez:'Responsabili · Sicurezza',
      testo:'La figura di Responsabile della sicurezza (RSA e RSPP) è individuata con attribuzione formale dell\'incarico (anche in condivisione)?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D9'],
      note:'Spesso richiede conferma diretta — la sicurezza esula dal Matrix.'
    },
    {
      id:'1.5.4', sezione:'1', sottoSez:'Responsabili · Servizi educativi',
      testo:'La funzione di Responsabile dei servizi educativi è svolta da personale con specifica competenza professionale, con attribuzione formale?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D5','D9'],
      precompileFn:'D5D9_to_respEducativi'
    },
    {
      id:'1.5.5', sezione:'1', sottoSez:'Responsabili · Amministrazione e Finanza',
      testo:'La funzione di Responsabile delle procedure amministrative ed economico-finanziarie è svolta da personale con specifica competenza professionale, con attribuzione formale?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D10'],
      precompileFn:'D10_to_respAmmFin'
    },
    {
      id:'1.5.7', sezione:'1', sottoSez:'Responsabili · Comunicazione',
      testo:'La funzione di Responsabile della comunicazione (anche digitale) è svolta da personale con specifica competenza professionale, con attribuzione formale?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D6','D9'],
      precompileFn:'D6D9_to_respComunicazione'
    },

    // ============ 2. COLLEZIONI ============

    {
      id:'2.1', sezione:'2', sottoSez:'Monitoraggio stato conservativo',
      testo:'È effettuato il rilevamento e monitoraggio periodico delle condizioni microclimatiche?',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'temperatura',  label:'Temperatura' },
        { valore:'umidita',      label:'Umidità relativa' },
        { valore:'illuminazione',label:'Illuminazione' }
      ],
      mapMatrix:['D3'],
      precompileFn:'D3_to_monitoraggioMicro'
    },
    {
      id:'2.4', sezione:'2', sottoSez:'Registrazione, documentazione, catalogazione',
      testo:'Il museo è dotato di inventari e documenti di catalogazione del patrimonio?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D3','D6'],
      precompileFn:'D3D6_to_inventari'
    },
    {
      id:'2.5', sezione:'2', sottoSez:'Esposizione permanente',
      testo:'La selezione, l\'ordinamento e la presentazione delle opere esposte sono effettuati sulla base di un progetto scientifico?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D1','D3','D4'],
      precompileFn:'D1D3D4_to_progettoScientifico'
    },
    {
      id:'2.7', sezione:'2', sottoSez:'Studio e ricerca',
      testo:'Il museo svolge attività di studio e ricerca scientifica sulle proprie collezioni, adeguatamente documentata?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D4'],
      precompileFn:'D4_to_studioRicerca'
    },
    {
      id:'2.8', sezione:'2', sottoSez:'Organizzazione depositi',
      testo:'I beni non esposti sono ordinati e conservati secondo criteri di funzionalità e sicurezza?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D3'],
      precompileFn:'D3_to_depositi'
    },

    // ============ 3. COMUNICAZIONE ============

    {
      id:'3.1.1a', sezione:'3', sottoSez:'Segnaletica esterna',
      testo:'È presente una indicazione chiara ed evidente all\'esterno della sede?',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'denominazione', label:'Denominazione completa dell\'istituto' },
        { valore:'orari',         label:'Orari di apertura' }
      ],
      mapMatrix:[]
    },
    {
      id:'3.1.1b', sezione:'3', sottoSez:'Segnaletica interna',
      testo:'Sono presenti gli strumenti essenziali di informazione e orientamento all\'interno del museo (segnaletica informativa, direzionale, identificativa)?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:[]
    },
    {
      id:'3.1.2a', sezione:'3', sottoSez:'Strumenti informativi · sito web',
      testo:'Il museo dispone di:',
      tipo:'radio', sm:true,
      opzioni:[
        { valore:'sito-proprio',label:'Un sito web specifico' },
        { valore:'sezione-ente',label:'Una sezione all\'interno del sito web dell\'ente di appartenenza' },
        { valore:'nessuno',     label:'Nessuno' }
      ],
      mapMatrix:['D6'],
      precompileFn:'D6_to_sitoWeb'
    },
    {
      id:'3.1.2b', sezione:'3', sottoSez:'Strumenti informativi · materiale',
      testo:'È disponibile materiale informativo nel museo?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D6']
    },
    {
      id:'3.1.2c', sezione:'3', sottoSez:'Strumenti informativi · contenuti sito',
      testo:'Sono pubblicati sul sito web (o sezione) informazioni essenziali e aggiornate su:',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'museo',        label:'Museo' },
        { valore:'documenti',    label:'Documenti istituzionali (statuti, carta dei servizi…)' },
        { valore:'patrimoni',    label:'Patrimoni' },
        { valore:'attivita',     label:'Attività' },
        { valore:'servizi',      label:'Servizi offerti' }
      ],
      mapMatrix:['D6'],
      precompileFn:'D6_to_contenutiSito'
    },
    {
      id:'3.1.3', sezione:'3', sottoSez:'Comunicazione integrata nell\'allestimento',
      testo:'Il museo dispone di:',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'didascalie', label:'Didascalie con informazioni chiare e leggibili' },
        { valore:'pannelli',   label:'Pannelli informativi chiari e leggibili' }
      ],
      mapMatrix:['D2','D7']
    },
    {
      id:'3.1.4', sezione:'3', sottoSez:'Attività educative e di valorizzazione',
      testo:'Sono previsti:',
      tipo:'checkbox-multi', sm:true,
      opzioni:[
        { valore:'educative',  label:'Attività educative per diverse fasce di pubblico' },
        { valore:'visite',     label:'Visite guidate' },
        { valore:'percorsi',   label:'Percorsi tematici' }
      ],
      mapMatrix:['D5'],
      precompileFn:'D5_to_attivitaEducative'
    },
    {
      id:'3.1.5', sezione:'3', sottoSez:'Relazioni con il pubblico',
      testo:'Sono disponibili sul sito web i principali recapiti?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D6']
    },
    {
      id:'3.2.3', sezione:'3', sottoSez:'Coinvolgimento territoriale',
      testo:'Il museo effettua l\'analisi del contesto territoriale e dei soggetti che vi operano?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D8'],
      precompileFn:'D8_to_analisiTerritorio'
    },
    {
      id:'3.2.4', sezione:'3', sottoSez:'Coinvolgimento stakeholder',
      testo:'Nei documenti programmatici elaborati dal museo sono individuati gli stakeholder e i possibili strumenti di dialogo con essi?',
      tipo:'radio', sm:true,
      opzioni:[ {valore:'si',label:'Sì'}, {valore:'no',label:'No'} ],
      mapMatrix:['D8'],
      precompileFn:'D8_to_stakeholder'
    }
  ]
};

// ============================================================================
// FUNZIONI DI PRE-COMPILAZIONE — dimensione Matrix → risposta MiC suggerita
// ============================================================================
// Convenzione: ogni funzione riceve l'oggetto matrixScores (D1..D10 con score
// 1-5) e ritorna { valore, confidence, motivazione }
// - confidence: 'alta' | 'media' | 'bassa' (mostra rispettivamente
//   "compilato da Matrix" / "suggerito" / "da verificare")
// - motivazione: stringa breve mostrata al compilatore

var OC_MIC_PRECOMPILE = {

  D10_to_documentoEcoFin: function(scores) {
    var d10 = scores.D10 || 0;
    return {
      valore: d10 >= 3 ? 'si' : 'no',
      confidence: d10 >= 4 ? 'alta' : 'media',
      motivazione: 'Dalla dimensione Matrix D10 (Sostenibilità economica): score ' + d10 + '/5'
    };
  },

  D3D7_to_spaziIdonei: function(scores) {
    var sel = [];
    if ((scores.D3 || 0) >= 3) { sel.push('conservazione'); sel.push('esposizione'); }
    if ((scores.D3 || 0) >= 2) sel.push('accoglienza');
    if ((scores.D7 || 0) >= 3) sel.push('disabili');
    return {
      valore: sel,
      confidence: 'media',
      motivazione: 'Da D3 (Conservazione) e D7 (Accessibilità)'
    };
  },

  D7_to_accessoDisabili: function(scores) {
    var d7 = scores.D7 || 0;
    var v = d7 >= 4 ? 'si' : (d7 >= 2 ? 'parziale' : 'no');
    return {
      valore: v,
      confidence: d7 >= 4 || d7 <= 1 ? 'alta' : 'media',
      motivazione: 'Da D7 Accessibilità: ' + d7 + '/5'
    };
  },

  D7_to_percorsoMinimo: function(scores) {
    return {
      valore: (scores.D7 || 0) >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D7 Accessibilità'
    };
  },

  D7_to_barriereArch: function(scores) {
    return {
      valore: (scores.D7 || 0) >= 4 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D7 Accessibilità (richiede però verifica certificazione tecnica)'
    };
  },

  D6_to_registrazioneIngressi: function(scores) {
    return {
      valore: (scores.D6 || 0) >= 2 ? 'si' : 'no',
      confidence: 'alta',
      motivazione: 'Da D6 Maturità digitale'
    };
  },

  D1D2_to_pianoAnnuale: function(scores) {
    var avg = ((scores.D1 || 0) + (scores.D2 || 0)) / 2;
    return {
      valore: avg >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D1 (Identità) + D2 (Mostre): media ' + avg.toFixed(1)
    };
  },

  D5_to_pianoEducative: function(scores) {
    return {
      valore: (scores.D5 || 0) >= 3 ? 'si' : 'no',
      confidence: 'alta',
      motivazione: 'Da D5 Educazione'
    };
  },

  D9_to_direttore: function(scores) {
    return {
      valore: (scores.D9 || 0) >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D9 Governance (richiede però verifica esistenza atto formale)'
    };
  },

  D3D9_to_respCollezioni: function(scores) {
    var avg = ((scores.D3 || 0) + (scores.D9 || 0)) / 2;
    return {
      valore: avg >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D3 (Conservazione) + D9 (Governance)'
    };
  },

  D5D9_to_respEducativi: function(scores) {
    var avg = ((scores.D5 || 0) + (scores.D9 || 0)) / 2;
    return {
      valore: avg >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D5 (Educazione) + D9 (Governance)'
    };
  },

  D10_to_respAmmFin: function(scores) {
    return {
      valore: (scores.D10 || 0) >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D10 Sostenibilità'
    };
  },

  D6D9_to_respComunicazione: function(scores) {
    var avg = ((scores.D6 || 0) + (scores.D9 || 0)) / 2;
    return {
      valore: avg >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D6 (Maturità digitale) + D9 (Governance)'
    };
  },

  D3_to_monitoraggioMicro: function(scores) {
    var d3 = scores.D3 || 0;
    var sel = [];
    if (d3 >= 3) { sel.push('temperatura'); sel.push('umidita'); }
    if (d3 >= 4) sel.push('illuminazione');
    return {
      valore: sel,
      confidence: 'media',
      motivazione: 'Da D3 Conservazione: ' + d3 + '/5'
    };
  },

  D3D6_to_inventari: function(scores) {
    var avg = ((scores.D3 || 0) + (scores.D6 || 0)) / 2;
    return {
      valore: avg >= 2.5 ? 'si' : 'no',
      confidence: 'alta',
      motivazione: 'Da D3 (Conservazione) + D6 (Digital): media ' + avg.toFixed(1)
    };
  },

  D1D3D4_to_progettoScientifico: function(scores) {
    var avg = ((scores.D1 || 0) + (scores.D3 || 0) + (scores.D4 || 0)) / 3;
    return {
      valore: avg >= 3 ? 'si' : 'no',
      confidence: 'alta',
      motivazione: 'Da D1 (Identità) + D3 (Conservazione) + D4 (Ricerca): media ' + avg.toFixed(1)
    };
  },

  D4_to_studioRicerca: function(scores) {
    return {
      valore: (scores.D4 || 0) >= 3 ? 'si' : 'no',
      confidence: 'alta',
      motivazione: 'Da D4 Ricerca'
    };
  },

  D3_to_depositi: function(scores) {
    return {
      valore: (scores.D3 || 0) >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D3 Conservazione'
    };
  },

  D6_to_sitoWeb: function(scores) {
    var d6 = scores.D6 || 0;
    return {
      valore: d6 >= 4 ? 'sito-proprio' : (d6 >= 2 ? 'sezione-ente' : 'nessuno'),
      confidence: 'alta',
      motivazione: 'Da D6 Maturità digitale: ' + d6 + '/5'
    };
  },

  D6_to_contenutiSito: function(scores) {
    var d6 = scores.D6 || 0;
    var sel = [];
    if (d6 >= 2) sel.push('museo');
    if (d6 >= 3) { sel.push('patrimoni'); sel.push('attivita'); }
    if (d6 >= 4) { sel.push('servizi'); sel.push('documenti'); }
    return {
      valore: sel,
      confidence: 'media',
      motivazione: 'Da D6 Maturità digitale'
    };
  },

  D5_to_attivitaEducative: function(scores) {
    var d5 = scores.D5 || 0;
    var sel = [];
    if (d5 >= 2) sel.push('visite');
    if (d5 >= 3) sel.push('educative');
    if (d5 >= 4) sel.push('percorsi');
    return {
      valore: sel,
      confidence: 'alta',
      motivazione: 'Da D5 Educazione'
    };
  },

  D8_to_analisiTerritorio: function(scores) {
    return {
      valore: (scores.D8 || 0) >= 3 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D8 Comunità'
    };
  },

  D8_to_stakeholder: function(scores) {
    return {
      valore: (scores.D8 || 0) >= 4 ? 'si' : 'no',
      confidence: 'media',
      motivazione: 'Da D8 Comunità'
    };
  }
};

// ============================================================================
// ENDPOINT PUBBLICI
// ============================================================================

/**
 * Ritorna lo schema completo del questionario MiC, con conteggio domande
 * coperte da Matrix vs domande nuove da somministrare.
 */
function getMicSchema() {
  var totali = OC_MIC_SCHEMA.domande.length;
  var sm = OC_MIC_SCHEMA.domande.filter(function(q){ return q.sm; }).length;
  var coperte = OC_MIC_SCHEMA.domande.filter(function(q){ return q.precompileFn; }).length;
  return {
    ok: true,
    meta: OC_MIC_SCHEMA.meta,
    stats: { totali: totali, standardMinimi: sm, coperteDaMatrix: coperte, dasomministrare: totali - coperte },
    domande: OC_MIC_SCHEMA.domande
  };
}

/**
 * Pre-compila il questionario MiC partendo dalle dimensioni Matrix di una
 * risposta esistente (ResponsesMatrix).
 *
 * @param {string} matrixResponseId - ID della risposta Matrix esistente
 * @return {Object} { ok, precompiled: [{id, valore, confidence, motivazione}], daSomministrare: [id...] }
 */
function getMicPrecompiled(matrixResponseId) {
  try {
    var matrixScores = _getMatrixScores_(matrixResponseId);
    if (!matrixScores) return { ok:false, error:'Matrix response non trovata' };

    var precompiled = [];
    var daSomministrare = [];

    OC_MIC_SCHEMA.domande.forEach(function(q){
      if (q.precompileFn && OC_MIC_PRECOMPILE[q.precompileFn]) {
        var r = OC_MIC_PRECOMPILE[q.precompileFn](matrixScores);
        precompiled.push({
          id: q.id,
          valore: r.valore,
          confidence: r.confidence,
          motivazione: r.motivazione,
          sezione: q.sezione,
          sottoSez: q.sottoSez,
          testo: q.testo
        });
      } else {
        daSomministrare.push({
          id: q.id,
          sezione: q.sezione,
          sottoSez: q.sottoSez,
          testo: q.testo,
          tipo: q.tipo,
          opzioni: q.opzioni || []
        });
      }
    });

    return {
      ok: true,
      matrixResponseId: matrixResponseId,
      precompiled: precompiled,
      daSomministrare: daSomministrare,
      stats: { totali: OC_MIC_SCHEMA.domande.length, precompiled: precompiled.length, daSomministrare: daSomministrare.length }
    };
  } catch (e) {
    return { ok:false, error: e.message };
  }
}

/**
 * Helper privato: estrae i punteggi D1-D10 di una risposta Matrix esistente.
 * Da implementare appoggiandosi al foglio ResponsesMatrix.
 *
 * @private
 */
function _getMatrixScores_(matrixResponseId) {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('ResponsesMatrix');
    if (!sh) return null;
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return null;
    var header = data[0];
    var idxId = header.indexOf('responseId');
    var idxScores = header.indexOf('punteggi_dimensioni');
    if (idxId < 0) return null;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][idxId]) === String(matrixResponseId)) {
        if (idxScores >= 0 && data[r][idxScores]) {
          try { return JSON.parse(data[r][idxScores]); } catch(e) {}
        }
        // Fallback: estrai da colonne dedicate D1..D10 se presenti
        var scores = {};
        for (var d = 1; d <= 10; d++) {
          var idxD = header.indexOf('D' + d);
          if (idxD >= 0) scores['D' + d] = Number(data[r][idxD]) || 0;
        }
        return scores;
      }
    }
    return null;
  } catch (e) {
    Logger.log('_getMatrixScores_ error: ' + e.message);
    return null;
  }
}

/**
 * Salva le risposte MiC (precompilate + integrate dal compilatore) e calcola
 * la compliance complessiva (% SM rispettati su totale).
 *
 * @param {Object} data { matrixResponseId, risposte: {qId: valore}, museoNome, email }
 * @return {Object} { ok, micId, complianceScore, smRispettati, smTotali, gapCritici, urlReport }
 */
function saveMicResponse(data) {
  try {
    data = data || {};
    if (!data.matrixResponseId) return { ok:false, error:'matrixResponseId mancante' };
    if (!data.risposte || typeof data.risposte !== 'object') return { ok:false, error:'risposte mancanti' };

    var sh = _getOrCreateMicSheet_();
    var micId = 'MIC' + Date.now() + Math.random().toString(36).substring(2, 6);

    // Calcola compliance
    var smTotali = 0, smRispettati = 0, gapCritici = [];
    OC_MIC_SCHEMA.domande.forEach(function(q){
      if (!q.sm) return;
      smTotali++;
      var r = data.risposte[q.id];
      var rispettato = _isMicSmFulfilled_(q, r);
      if (rispettato) smRispettati++;
      else gapCritici.push({ id: q.id, sezione: q.sezione, sottoSez: q.sottoSez, testo: q.testo });
    });
    var complianceScore = smTotali > 0 ? Math.round((smRispettati / smTotali) * 100) : 0;

    sh.appendRow([
      micId,
      new Date(),
      data.matrixResponseId,
      JSON.stringify(data.risposte),
      smRispettati,
      smTotali,
      complianceScore,
      JSON.stringify(gapCritici.map(function(g){ return g.id; })),
      String(data.museoNome || ''),
      String(data.email || ''),
      OC_MIC_SCHEMA_VERSION
    ]);

    return {
      ok: true,
      micId: micId,
      complianceScore: complianceScore,
      smRispettati: smRispettati,
      smTotali: smTotali,
      gapCritici: gapCritici
    };
  } catch (e) {
    return { ok:false, error: e.message };
  }
}

/**
 * Verifica se una singola domanda SM è stata rispettata in base alla risposta.
 * @private
 */
function _isMicSmFulfilled_(q, risposta) {
  if (risposta == null || risposta === '' || (Array.isArray(risposta) && risposta.length === 0)) return false;
  if (q.tipo === 'radio') {
    // SI / parziale / risposte positive = SM rispettato
    var positive = ['si','statuto','regolamento','sito-proprio','sezione-ente','12h-sett','60gg-stag','parziale','deroga'];
    return positive.indexOf(String(risposta)) >= 0;
  }
  if (q.tipo === 'checkbox-multi') {
    return Array.isArray(risposta) && risposta.length > 0;
  }
  return true; // testo/numero: presenza = ok
}

/**
 * Crea o restituisce il foglio ResponsesMatrixMiC.
 * @private
 */
function _getOrCreateMicSheet_() {
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(OC_MIC_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OC_MIC_SHEET);
    sh.getRange(1, 1, 1, 11).setValues([[
      'micId','timestamp','matrixResponseId','risposte_json',
      'sm_rispettati','sm_totali','compliance_score',
      'gap_critici_ids','museo_nome','email','schema_version'
    ]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Setup foglio MiC (admin one-shot).
 */
function setupMicSheet() {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_()) return { ok:false, error:'forbidden' };
  try {
    var sh = _getOrCreateMicSheet_();
    return { ok:true, sheetName: OC_MIC_SHEET, rows: Math.max(0, sh.getLastRow() - 1) };
  } catch(e) { return { ok:false, error: e.message }; }
}

// ============================================================================
// FINE Matrix_MiC_v1.gs
// ============================================================================
