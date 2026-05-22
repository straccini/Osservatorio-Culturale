// ============================================================================
//  KB_v1.gs — Knowledge Base Duemilamusei in JSON (v4.18.16 · 2026-05-12)
// ----------------------------------------------------------------------------
//  Traduce in codice la KB scritta in /musemu matrix/KB_Duemilamusei.md (v1.1).
//  5 assi: Tematiche T1-T9 · Strumenti STR-A/E · Erogatore · Beneficiario ·
//          Modelli operativi M1-M14 · Linee di servizio LS1-LS3 · Candidature
//
//  Endpoint pubblico:
//    getKnowledgeBase()  — ritorna tutta la KB in oggetto JS (frontend la consuma)
//
//  Filosofia F2 principio 5 (verifiche incrociate): ogni bando rilevato può
//  essere arricchito automaticamente con: tematica T_n + modello M_n attivabile
//  + linea di servizio LS_n applicabile. Questo è il "monitoraggio intelligente
//  che orienta la progettazione" descritto da Silvano il 2026-05-11.
// ============================================================================

// ============================================================================
// ASSE 1 — TEMATICHE (T1-T9) — mappate sugli ambiti pubblici 01-05
// ============================================================================
var KB_TEMATICHE = [
  { codice:'T1', nome:'Riqualificazione, progettazione, musealizzazione spazi della cultura',
    descrizione:'Recupero edifici, restauri funzionali, allestimenti, concept museografico.',
    ambitoPubblico:3 },
  { codice:'T2', nome:'Sistemi HW/SW e AI per la fruizione di musei e luoghi della cultura',
    descrizione:'Piattaforme, app, audioguide AI, virtual center, catalogo digitale, CMS museali.',
    ambitoPubblico:5 },
  { codice:'T3', nome:'Accessibilità integrata',
    descrizione:'Fisica, cognitiva, sensoriale: LIS, ETR, CAA, Braille semplificato.',
    ambitoPubblico:2 },
  { codice:'T5', nome:'Audience, partecipazione, ingaggio, welfare culturale, co-progettazione',
    descrizione:'Community engagement, mediazione culturale, edutainment, governance condivisa.',
    ambitoPubblico:4 },
  { codice:'T6', nome:'Gestione e valorizzazione patrimonio per EE.PP.',
    descrizione:'Piani di gestione, modelli organizzativi, sostenibilità economica.',
    ambitoPubblico:5 },
  { codice:'T7', nome:'Sviluppo di asset turistici a base culturale',
    descrizione:'DMC, DMO, valorizzazione borghi, heritage tourism, gastronomia, paesaggio.',
    ambitoPubblico:4 },
  { codice:'T8', nome:'Sviluppo territoriale integrato',
    descrizione:'Sistemi cultura + turismo + ambiente, GAL, contratti di fiume, distretti.',
    ambitoPubblico:4 },
  { codice:'T9', nome:'Creazione e gestione contenuti culturali e museali',
    descrizione:'Storytelling, narrazione, didattica, cataloghi, contenuti scientifici.',
    ambitoPubblico:1 }
];

// ============================================================================
// ASSE 2 — STRUMENTI (STR-A/E) — tipo di documento monitorato
// ============================================================================
var KB_STRUMENTI = [
  { codice:'STR-A', nome:'Bando di finanziamento',
    ruoloDM:'pre-progettazione gratuita per l\'ente beneficiario · partner di candidatura' },
  { codice:'STR-B', nome:'Gara d\'appalto (lavori/servizi/forniture)',
    ruoloDM:'fornitore diretto · capofila RTI/RTP' },
  { codice:'STR-C', nome:'Manifestazione di interesse / affidamento diretto',
    ruoloDM:'fornitore diretto' },
  { codice:'STR-D', nome:'Concorso di idee / progettazione',
    ruoloDM:'partecipante (singolo o RTP)' },
  { codice:'STR-E', nome:'Convenzione / partenariato / co-progettazione (art. 55/56 D.Lgs. 117/2017)',
    ruoloDM:'partner' }
];

// ============================================================================
// ASSE 5 — MODELLI OPERATIVI (M1-M14) — leve di vantaggio competitivo
// ============================================================================
var KB_MODELLI = [
  { codice:'M1', nome:'PSPP — Partenariato Speciale Pubblico-Privato (art. 134 D.Lgs. 36/2023)',
    evidence:'b2.2 MAMA Macerata · b2.2 San Severino Marche (in corso)',
    quandoSiAttiva:'bando con premialità PSPP esplicita (es. PR FESR Umbria 4.6.1 = 20 pt su 100)',
    forza:3 },
  { codice:'M2', nome:'Project Financing per beni culturali / contenitori culturali',
    evidence:'Infinito Recanati 2017/2027 · Macerata Culture 2018/2027 · Pesaro Musei 2011-2021',
    quandoSiAttiva:'concessioni 10/15+ anni con PEF, gestione integrata multi-contenitore',
    forza:3 },
  { codice:'M3', nome:'Concessione gestione contenitori culturali',
    evidence:'Fortezza Albornoz Urbino · Circuito Cagli · MuSA San Giorgio · Teatro Fortuna Fano · Rocca Malatestiana',
    quandoSiAttiva:'affidamento gestione singolo o circuito museale',
    forza:3 },
  { codice:'M4', nome:'Convenzione di Faro / welfare culturale',
    evidence:'Pesaro CIC 2024 (1200 eventi, 50 comuni, community engagement)',
    quandoSiAttiva:'bandi con dimensione comunitaria / inclusione / presidio identitario',
    forza:2 },
  { codice:'M5', nome:'Reti culturali / Distretti Culturali Evoluti (DCE)',
    evidence:'DCE Provincia PU · Archeoprovincia · Panorami di cultura · INPUT · Genius loci',
    quandoSiAttiva:'bandi di sistema, territoriali, regionali',
    forza:3 },
  { codice:'M6', nome:'Direzione Capitali Italiane / Europee della Cultura',
    evidence:'DG Pesaro CIC 2024 · supporto Urbino-Pesaro-Fano ECoC 2033',
    quandoSiAttiva:'candidature CIC, ECoC, supporto strategico al dossier',
    forza:3 },
  { codice:'M7', nome:'Programmazione culturale di alto impatto internazionale',
    evidence:'Marina Abramović "The Life" · Ryuichi Sakamoto "Kagami" · Lorenzo Lotto · Bauhaus 100 · Federico da Montefeltro · Tonino Guerra',
    quandoSiAttiva:'grandi eventi espositivi, curatela artistica, mostre internazionali',
    forza:3 },
  { codice:'M8', nome:'Progettazione e direzione musealizzazione',
    evidence:'Museo Nazionale Rossini Pesaro · Fellini Museum · Museo Bicicletta · Villa Franceschi · Museo Musica Recanati · Casa Rossini · Museo Terre Marchigiane',
    quandoSiAttiva:'nuovi allestimenti, ri-musealizzazioni, museum design',
    forza:3 },
  { codice:'M9', nome:'Bandi vinti PNRR / MIC / Fondazioni',
    evidence:'MIC Borghi PNRR 2022 Gradara (finanziato) · MIC Fondo Cultura 2021 Pescheria + Gradara (finanziati)',
    quandoSiAttiva:'scrittura progetto, gestione candidatura, rendicontazione',
    forza:2 },
  { codice:'M10', nome:'Marketing territoriale / IAT-DMC-DMO',
    evidence:'IAT-Tipico.tips Recanati e Macerata · settore turismo Sistema Museo 2015-19 · Cagli accoglienza 2007-10',
    quandoSiAttiva:'governance turistica integrata, accoglienza, promozione territori',
    forza:2 },
  { codice:'M11', nome:'Direzione apicale enti culturali',
    evidence:'DG Pesaro CIC 2024 · DG Fondazione Pescheria (RUP) · Dir. Area Musei Fondazione Marche · Pres. Gradara Innova · Dir. Coop Sistema Museo (20 anni)',
    quandoSiAttiva:'incarichi RUP, DG, Presidenza CdA, Direttore Sistema',
    forza:3 },
  { codice:'M14', nome:'Accessibilità integrata (LIS via partner ALCO)',
    evidence:'Partnership formale Duemilamusei × ALCO per LIS (in corso) · Pesaro CIC 2024 ufficio accessibilità',
    quandoSiAttiva:'bandi con linea accessibilità o premialità accessibilità cognitiva',
    forza:2 }
];

// ============================================================================
// LINEE DI SERVIZIO COMMERCIALE (LS1 / LS2 / LS3)
// ============================================================================
var KB_LINEE_SERVIZIO = [
  { codice:'LS1', nome:'Pre-progettazione gratuita su bando specifico',
    trigger:'Scanner rileva bando coerente con tematica T_n + modello M_n attivabile',
    output:'1h call + concept 2-3 pagine + ipotesi intervento + stima massimale',
    beneficiario:'Ente potenzialmente candidato al bando (es. Comune, Fondazione partecipata)',
    cap:'5-8 pre-progettazioni gratuite al mese' },
  { codice:'LS2', nome:'Pre-consulenza gestionale / sondaggi mirati di pre-valutazione',
    trigger:'Compilazione sondaggio mirato (inbound) o invio outbound qualificato',
    output:'Diagnosi gap + 2-3 raccomandazioni operative + servizi Duemilamusei attivabili',
    beneficiario:'Direttore/responsabile museo',
    cap:'Soft: gestito via funnel Matrix' },
  { codice:'LS3', nome:'Candidature speciali (CIC, ECoC, Arte Contemporanea, UNESCO…)',
    trigger:'Calendario candidature — almeno 6 mesi prima della scadenza',
    output:'Outreach proattivo "hai pensato di candidare X a Y?" + supporto strategico bid-book',
    beneficiario:'Sindaco / Direttore cultura Comune',
    cap:'Cadenza in base a calendario eventi' }
];

// ============================================================================
// CANDIDATURE SPECIALI LS3 (9 monitorate · validate 2026-05-11)
// ============================================================================
// v4.18.24 — esteso con scadenze, link ufficiali, stato e note operative
// NOTA: scadenze indicative aggiornate al 2026-05-13; verificare sul sito ufficiale
var KB_CANDIDATURE = [
  {
    codice:'CIC', ambito:'IT', icona:'IT',
    nome:'Capitale Italiana della Cultura',
    ciclo:'annuale', beneficiario:'Comune', promotore:'MiC',
    scadenzaProssima:'2026-09-30', annoTarget:'2028',
    stato:'aperto',
    link:'https://cultura.gov.it/capitaleitaliana',
    descrizioneBreve:'Riconoscimento annuale al Comune con il miglior dossier su sviluppo culturale, turismo e coesione territoriale.',
    impegno:'18-24 mesi', budgetRif:'€ 1.000.000 al vincitore + visibilità'
  },
  {
    codice:'CILIBRO', ambito:'IT', icona:'CL',
    nome:'Capitale Italiana del Libro',
    ciclo:'annuale', beneficiario:'Comune', promotore:'MiC – Cepell',
    scadenzaProssima:'2026-10-15', annoTarget:'2027',
    stato:'aperto',
    link:'https://cepell.it/capitale-del-libro',
    descrizioneBreve:'Promozione lettura, librerie indipendenti, biblioteche, festival letterari.',
    impegno:'12-18 mesi', budgetRif:'€ 500.000 al vincitore'
  },
  {
    codice:'CIAC', ambito:'IT', icona:'CA',
    nome:'Capitale Italiana dell\'Arte Contemporanea',
    ciclo:'biennale', beneficiario:'Comune', promotore:'MiC – DGCC',
    scadenzaProssima:'2026-11-30', annoTarget:'2027',
    stato:'aperto',
    link:'https://creativitacontemporanea.cultura.gov.it',
    descrizioneBreve:'Valorizzazione della creatività contemporanea visiva: mostre, residenze, public art, gallerie.',
    impegno:'12-18 mesi', budgetRif:'€ 1.000.000 al vincitore'
  },
  {
    codice:'CIG', ambito:'IT', icona:'CG',
    nome:'Capitale Italiana dei Giovani',
    ciclo:'annuale', beneficiario:'Comune', promotore:'Min. Sport e Giovani',
    scadenzaProssima:'2026-07-31', annoTarget:'2027',
    stato:'aperto',
    link:'https://giovani.governo.it',
    descrizioneBreve:'Politiche giovanili integrate: cultura, lavoro, partecipazione, spazi.',
    impegno:'12-18 mesi', budgetRif:'€ 1.000.000 al vincitore'
  },
  {
    codice:'ECOC', ambito:'EU', icona:'EU',
    nome:'Capitale Europea della Cultura (ECoC)',
    ciclo:'annuale', beneficiario:'Comune + Regione', promotore:'UE / MiC',
    scadenzaProssima:'2027-03-31', annoTarget:'2033',
    stato:'in-preparazione',
    link:'https://culture.ec.europa.eu/policies/culture-in-cities-and-regions/european-capitals-of-culture',
    descrizioneBreve:'Riconoscimento europeo a una città italiana per il 2033 (preselezione 2026-27, decisione 2028).',
    impegno:'4-6 anni', budgetRif:'€ 1.5M premio Melina Mercouri + budget locale €30-100M'
  },
  {
    codice:'ECST', ambito:'EU', icona:'ST',
    nome:'Capitale Europea Smart Tourism',
    ciclo:'annuale', beneficiario:'Comune', promotore:'UE Commissione',
    scadenzaProssima:'2026-06-15', annoTarget:'2027',
    stato:'aperto',
    link:'https://smart-tourism-capital.ec.europa.eu',
    descrizioneBreve:'Innovazione, accessibilità, sostenibilità e patrimonio culturale nel turismo urbano.',
    impegno:'8-12 mesi', budgetRif:'Visibilità UE + accesso fondi Cosme'
  },
  {
    codice:'UNESCO-WH', ambito:'UNESCO', icona:'UN',
    nome:'UNESCO Patrimonio Mondiale',
    ciclo:'multi-anno', beneficiario:'Stato / Comune via MiC', promotore:'UNESCO',
    scadenzaProssima:'2027-02-01', annoTarget:'2030',
    stato:'in-preparazione',
    link:'https://whc.unesco.org/en/tentativelists',
    descrizioneBreve:'Iscrizione di siti culturali o naturali nella World Heritage List. Tempi lunghi, dossier complesso.',
    impegno:'5-10 anni', budgetRif:'Investimento valorizzazione sito + visibilità globale'
  },
  {
    codice:'UNESCO-CC', ambito:'UNESCO', icona:'UC',
    nome:'UNESCO Città Creative (UCCN)',
    ciclo:'biennale', beneficiario:'Comune', promotore:'UNESCO',
    scadenzaProssima:'2027-06-30', annoTarget:'2027',
    stato:'in-preparazione',
    link:'https://en.unesco.org/creative-cities/home',
    descrizioneBreve:'7 campi: artigianato, design, cinema, gastronomia, letteratura, media arts, musica.',
    impegno:'12-24 mesi', budgetRif:'Solo visibilità + rete UCCN'
  },
  {
    codice:'BORGHI', ambito:'IT', icona:'BI',
    nome:'Borghi più Belli d\'Italia',
    ciclo:'continuo', beneficiario:'Comune', promotore:'Associazione',
    scadenzaProssima:null, annoTarget:'continuo',
    stato:'sempre-aperto',
    link:'https://borghipiubelliditalia.it',
    descrizioneBreve:'Marchio di qualità per piccoli borghi storici (< 15.000 abitanti). Criteri urbanistico-architettonici.',
    impegno:'6-12 mesi istruttoria', budgetRif:'Marchio + presenza guide turistiche'
  }
];

/**
 * v4.18.24 — Helper: candidature ordinate per scadenza prossima, con giorni residui.
 * Usata dal box home "Remember Capitali" e dalla pagina dedicata.
 *
 * @param {Object} [opts] {limit:number, soloAperti:bool}
 * @return {Array} candidature arricchite con {giorniResidui, scadenzaFormat, urgenza}
 */
function getCapitaliRemember(opts) {
  opts = opts || {};
  var limit = Number(opts.limit) || 999;
  var soloAperti = opts.soloAperti === true;
  var oggi = new Date(); oggi.setHours(0,0,0,0);

  var out = KB_CANDIDATURE.map(function(c){
    var giorni = null, fmt = '', urg = 'normale';
    if (c.scadenzaProssima) {
      var sc = new Date(c.scadenzaProssima);
      giorni = Math.floor((sc - oggi) / 86400000);
      fmt = sc.toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' });
      if (giorni < 0) urg = 'scaduto';
      else if (giorni <= 60) urg = 'urgente';
      else if (giorni <= 180) urg = 'imminente';
    }
    return {
      codice: c.codice,
      nome: c.nome,
      icona: c.icona || 'C',
      ambito: c.ambito,
      ciclo: c.ciclo,
      beneficiario: c.beneficiario,
      promotore: c.promotore,
      scadenzaProssima: c.scadenzaProssima,
      scadenzaFormat: fmt,
      annoTarget: c.annoTarget,
      giorniResidui: giorni,
      urgenza: urg,
      stato: c.stato,
      link: c.link,
      descrizioneBreve: c.descrizioneBreve,
      impegno: c.impegno,
      budgetRif: c.budgetRif
    };
  });

  if (soloAperti) {
    out = out.filter(function(c){ return c.stato === 'aperto' || c.stato === 'sempre-aperto'; });
  }

  // Ordina: prima le scadenze più imminenti (positive ascendenti), poi quelle senza scadenza
  out.sort(function(a, b){
    if (a.giorniResidui == null) return 1;
    if (b.giorniResidui == null) return -1;
    if (a.giorniResidui < 0 && b.giorniResidui >= 0) return 1;
    if (b.giorniResidui < 0 && a.giorniResidui >= 0) return -1;
    return a.giorniResidui - b.giorniResidui;
  });

  return { ok:true, count: out.length, list: out.slice(0, limit) };
}

// ============================================================================
// AMBITI PUBBLICI 01-05 — riferimento per mapping con tematiche T_n
// ============================================================================
var KB_AMBITI_PUBBLICI = [
  { num:1, codice:'01', nome:'Identità e narrazione museale',         nomeBreve:'Identità' },
  { num:2, codice:'02', nome:'Inclusione e accessibilità',            nomeBreve:'Inclusione' },
  { num:3, codice:'03', nome:'Programma, mostre e collezioni',        nomeBreve:'Programma' },
  { num:4, codice:'04', nome:'Comunità e welfare culturale',          nomeBreve:'Comunità' },
  { num:5, codice:'05', nome:'Digital, AI e governance',              nomeBreve:'Digital & Gov' }
];

// ============================================================================
// ENDPOINT PUBBLICO — chiamato dal frontend via google.script.run
// ============================================================================

/**
 * Ritorna l'intera Knowledge Base Duemilamusei come oggetto JSON.
 * Usata da frontend per popolare pagina admin "📚 KB Tassonomia".
 *
 * @return {Object} { ambitiPubblici, tematiche, strumenti, modelli, lineeServizio, candidature, meta }
 */
function getKnowledgeBase() {
  return {
    meta: {
      versione: 'v1.1',
      data: '2026-05-11',
      origine: '/musemu matrix/KB_Duemilamusei.md',
      filosofia: 'Filosofia F2 (6 principi) · KB come fonte-verità per monitoraggio intelligente'
    },
    ambitiPubblici: KB_AMBITI_PUBBLICI,
    tematiche: KB_TEMATICHE,
    strumenti: KB_STRUMENTI,
    modelli: KB_MODELLI,
    lineeServizio: KB_LINEE_SERVIZIO,
    candidature: KB_CANDIDATURE
  };
}

// ============================================================================
// FINE KB_v1.gs
// ============================================================================
