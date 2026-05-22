/**
 * ============================================================================
 *  AgentConfig.js — Configurazione 5 Agenti Intelligence (v4.18.55)
 * ----------------------------------------------------------------------------
 *  Single source of truth per il sistema multi-agente OC.
 *  Ogni agente ha: id, nome, ambiti OC, dimensioni Matrix, frequenze,
 *  categorie fonti, prompt Claude specializzato, template email.
 *
 *  Usato da: AgentScanner.js, AgentDigest.js, AgentRouting.js
 * ============================================================================
 */

// ============================================================================
// DEFINIZIONI AGENTI
// ============================================================================

var OC_AGENTI = [
  {
    id: 1,
    codice: 'AG1',
    nome: 'Radar Bandi & Finanziamenti',
    nomeBreve: 'Bandi',
    descrizione: 'Monitora bandi, finanziamenti e opportunita per musei e luoghi della cultura',
    ambiti: [1, 2, 3, 4, 5],  // trasversale
    matrixDims: ['D9', 'D6', 'D7'],
    lineaServizio: 'LS1',
    color: '#C8102E',
    icon: '🎯',
    fontiCategorie: ['ministero', 'regione', 'ue', 'aggregatore', 'fondazione', 'associazione', 'rivista'],
    fontiTipo: ['HTML', 'RSS'],
    scanFrequenza: 'ogni_6h',
    emailFrequenza: 'settimanale',  // lunedi
    emailGiorni: [1],  // 1=lunedi
    emailOra: 7,
    maxContenuti: 10,
    promptSpecializzato: 'Sei esperto di finanziamenti pubblici per la cultura. Estrai SOLO bandi/avvisi/call pertinenti a: musei, patrimonio culturale, turismo culturale, digitalizzazione beni culturali, accessibilita, valorizzazione territoriale. Regioni prioritarie: Marche, Umbria, Puglia, Sardegna, Emilia-Romagna.',
    ctaText: 'Vuoi una pre-progettazione gratuita su questo bando?',
    ctaUrl: 'mailto:s.straccini@gmail.com?subject=Pre-progettazione bando'
  },
  {
    id: 2,
    codice: 'AG2',
    nome: 'Normativa & Compliance Culturale',
    nomeBreve: 'Normativa',
    descrizione: 'Monitora decreti, circolari, standard e adempimenti per musei e gestori culturali',
    ambiti: [5],  // Digital, AI e governance
    matrixDims: ['D9', 'D7', 'D6'],
    lineaServizio: 'LS2',
    color: '#1A237E',
    icon: '⚖️',
    fontiCategorie: ['normativa', 'istituzionale', 'standard'],
    fontiTipo: ['HTML', 'RSS'],
    scanFrequenza: 'ogni_12h',
    emailFrequenza: 'mensile',  // 1o lunedi del mese
    emailGiorni: [1],
    emailOra: 8,
    emailSettimana: 1,  // prima settimana del mese
    maxContenuti: 8,
    promptSpecializzato: 'Sei esperto di normativa museale italiana ed europea. Estrai SOLO: decreti ministeriali, circolari MiC, aggiornamenti LUQ (Livelli Uniformi di Qualita), standard ICOM, normativa accessibilita (PEBA, WCAG), GDPR applicato a musei, sicurezza beni culturali, appalti cultura (D.Lgs 36/2023), volontariato culturale (D.Lgs 117/2017), Art Bonus, AI Act applicato alla cultura.',
    tassonomia: ['NRM-01', 'NRM-02', 'NRM-03', 'NRM-04', 'NRM-05', 'NRM-06', 'NRM-07', 'NRM-08', 'NRM-09', 'NRM-10'],
    ctaText: 'Hai dubbi sull\'applicazione? Prenota una consulenza',
    ctaUrl: 'consulenza'
  },
  {
    id: 3,
    codice: 'AG3',
    nome: 'Innovazione & Best Practice Museali',
    nomeBreve: 'Innovazione',
    descrizione: 'Case study, trend internazionali, nuovi modelli di gestione museale',
    ambiti: [1, 3],  // Identita + Programma
    matrixDims: ['D1', 'D2', 'D4', 'D5'],
    lineaServizio: 'LS2',
    color: '#FF6F00',
    icon: '����',
    fontiCategorie: ['innovazione', 'internazionale', 'ricerca', 'editoriale'],
    fontiTipo: ['RSS'],
    scanFrequenza: 'ogni_12h',
    emailFrequenza: 'quindicinale',  // 1o e 3o mercoledi
    emailGiorni: [3],  // 3=mercoledi
    emailOra: 8,
    emailSettimane: [1, 3],  // settimane 1 e 3 del mese
    maxContenuti: 8,
    promptSpecializzato: 'Sei esperto di museologia e innovazione culturale. Seleziona SOLO articoli su: nuovi modelli gestionali per musei, case study di successo, best practice internazionali, audience development, allestimenti innovativi, nuovi servizi al visitatore, membership, fundraising museale, co-progettazione.',
    ctaText: 'Vuoi applicare queste idee al tuo museo?',
    ctaUrl: 'consulenza'
  },
  {
    id: 4,
    codice: 'AG4',
    nome: 'Comunita, Welfare Culturale & Accessibilita',
    nomeBreve: 'Comunita',
    descrizione: 'Welfare culturale, accessibilita radicale, audience development, pubblici fragili',
    ambiti: [2, 4],  // Inclusione + Comunita
    matrixDims: ['D7', 'D8', 'D10', 'D5'],
    lineaServizio: 'LS2',
    color: '#2E7D32',
    icon: '🤝',
    fontiCategorie: ['welfare', 'accessibilita', 'audience', 'sociale'],
    fontiTipo: ['RSS', 'HTML'],
    scanFrequenza: 'ogni_24h',
    emailFrequenza: 'mensile',  // 2o martedi del mese
    emailGiorni: [2],  // 2=martedi
    emailOra: 8,
    emailSettimana: 2,  // seconda settimana del mese
    maxContenuti: 8,
    promptSpecializzato: 'Sei esperto di welfare culturale e accessibilita museale. Seleziona SOLO contenuti su: accessibilita fisica/cognitiva/sensoriale/linguistica, LIS, Easy to Read, CAA, Braille, pubblici fragili (Alzheimer, disabilita, migranti, detenuti), audience development, mediazione culturale, co-progettazione, edutainment, rapporti musei-scuole, rapporti musei-sanita.',
    ctaText: 'Vuoi un assessment accessibilita del tuo museo?',
    ctaUrl: 'consulenza'
  },
  {
    id: 5,
    codice: 'AG5',
    nome: 'Digital, AI & Governance Museale',
    nomeBreve: 'Digital',
    descrizione: 'Maturita digitale, AI applicata, data analytics, piattaforme museali',
    ambiti: [5],  // Digital, AI e governance
    matrixDims: ['D6', 'D1', 'D9'],
    lineaServizio: 'LS2',
    color: '#0097A7',
    icon: '🤖',
    fontiCategorie: ['digital', 'ai', 'tech', 'open_data'],
    fontiTipo: ['RSS'],
    scanFrequenza: 'ogni_12h',
    emailFrequenza: 'quindicinale',  // 2o e 4o giovedi
    emailGiorni: [4],  // 4=giovedi
    emailOra: 8,
    emailSettimane: [2, 4],  // settimane 2 e 4 del mese
    maxContenuti: 8,
    promptSpecializzato: 'Sei esperto di digital transformation per musei e beni culturali. Seleziona SOLO contenuti su: AI applicata a musei, chatbot museali, catalogazione digitale, IIIF, open data, analytics visitatori, CRM museale, biglietteria digitale, audioguide AI, realta aumentata/virtuale, social media strategy musei, NEMO Digital Roadmap, piattaforme CMS museali.',
    ctaText: 'Vuoi una roadmap digitale per il tuo museo?',
    ctaUrl: 'consulenza'
  }
];

// ============================================================================
// TASSONOMIA NORMATIVA (AG2)
// ============================================================================

var OC_NORMATIVA_CATEGORIE = {
  'NRM-01': { nome: 'Gestione e organizzazione museale', keywords: ['luq', 'livelli uniformi', 'accreditamento', 'sistema museale', 'standard museali', 'carta dei servizi'] },
  'NRM-02': { nome: 'Accessibilita e barriere', keywords: ['peba', 'wcag', 'barriere architettoniche', 'accessibilita', 'l. 104', 'disabilita', 'lis'] },
  'NRM-03': { nome: 'Sicurezza e conservazione', keywords: ['antincendio', 'd.lgs 42/2004', 'codice beni culturali', 'restauro', 'vincolo', 'soprintendenza', 'tutela'] },
  'NRM-04': { nome: 'Privacy e dati', keywords: ['gdpr', 'privacy', 'videosorveglianza', 'cookie', 'dati personali', 'consenso', 'registro trattamenti'] },
  'NRM-05': { nome: 'Lavoro e volontariato', keywords: ['ccnl', 'federculture', 'volontari', 'd.lgs 117', 'terzo settore', 'ets', 'servizio civile'] },
  'NRM-06': { nome: 'Appalti e concessioni', keywords: ['d.lgs 36/2023', 'appalto', 'concessione', 'ppp', 'partenariato', 'affidamento', 'gara', 'art. 55', 'art. 56'] },
  'NRM-07': { nome: 'Fiscalita e Art Bonus', keywords: ['art bonus', '5x1000', 'erogazioni liberali', 'iva', 'detrazione', 'credito imposta'] },
  'NRM-08': { nome: 'Proprieta intellettuale', keywords: ['diritto autore', 'copyright', 'riproduzione', 'creative commons', 'open access', 'dominio pubblico'] },
  'NRM-09': { nome: 'Sostenibilita ambientale', keywords: ['cam', 'gpp', 'green public procurement', 'sostenibilita', 'bilancio sociale', 'esg'] },
  'NRM-10': { nome: 'Digitale e AI', keywords: ['ai act', 'regolamento ia', 'open data', 'interoperabilita', 'spid', 'cie', 'pagopa', 'cloud pa'] }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Ritorna la configurazione di un agente per ID o codice.
 * @param {number|string} idOrCode — ID numerico (1-5) o codice stringa ('AG1'-'AG5')
 * @return {Object|null}
 */
function getAgentConfig(idOrCode) {
  if (typeof idOrCode === 'number') {
    return OC_AGENTI.find(function(a) { return a.id === idOrCode; }) || null;
  }
  var code = String(idOrCode).toUpperCase();
  return OC_AGENTI.find(function(a) { return a.codice === code; }) || null;
}

/**
 * Ritorna tutti gli agenti.
 * @return {Array}
 */
function getAllAgents() {
  return OC_AGENTI;
}

/**
 * Ritorna gli agenti rilevanti per una dimensione Matrix.
 * @param {string} dimCode — es. 'D7'
 * @return {Array} agenti che monitorano quella dimensione
 */
function getAgentsForDimension(dimCode) {
  return OC_AGENTI.filter(function(a) {
    return a.matrixDims.indexOf(dimCode) >= 0;
  });
}

/**
 * Ritorna gli agenti rilevanti per un ambito OC.
 * @param {number} ambitoId — 1-5
 * @return {Array}
 */
function getAgentsForAmbito(ambitoId) {
  return OC_AGENTI.filter(function(a) {
    return a.ambiti.indexOf(ambitoId) >= 0;
  });
}

/**
 * Determina se oggi e giorno di invio email per un agente.
 * @param {Object} agent — config agente
 * @param {Date} [date] — data da verificare (default: oggi)
 * @return {boolean}
 */
function isAgentEmailDay(agent, date) {
  date = date || new Date();
  var dayOfWeek = date.getDay(); // 0=dom, 1=lun, ...
  var weekOfMonth = Math.ceil(date.getDate() / 7);

  // Controlla giorno della settimana
  if (agent.emailGiorni.indexOf(dayOfWeek) < 0) return false;

  // Se ha settimane specifiche, controlla
  if (agent.emailSettimane) {
    return agent.emailSettimane.indexOf(weekOfMonth) >= 0;
  }
  if (agent.emailSettimana) {
    return weekOfMonth === agent.emailSettimana;
  }

  // Settimanale: ogni settimana va bene
  return true;
}

/**
 * Ritorna il calendario invii del mese per tutti gli agenti.
 * @param {number} [year] — anno (default: corrente)
 * @param {number} [month] — mese 0-11 (default: corrente)
 * @return {Array} [{data, agente, codice}]
 */
function getAgentCalendar(year, month) {
  var now = new Date();
  year = year || now.getFullYear();
  month = (month !== undefined) ? month : now.getMonth();
  var result = [];
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  for (var d = 1; d <= daysInMonth; d++) {
    var date = new Date(year, month, d);
    OC_AGENTI.forEach(function(ag) {
      if (isAgentEmailDay(ag, date)) {
        result.push({
          data: date.toISOString().split('T')[0],
          agente: ag.nomeBreve,
          codice: ag.codice,
          ora: ag.emailOra + ':00'
        });
      }
    });
  }
  return result;
}
