/**
 * ============================================================================
 *  Matrix_schema.gs — Schema MuseMu Matrix v1.0.2 embedded (auto-generato)
 * ============================================================================
 *  Sprint 2 (2026-04-30)
 *  Source: D2_Master_Questionario_v1.0.2.json (generato dal team Duemilamusei)
 *
 *  IMPORTANTE: NON modificare manualmente questo file.
 *  Per aggiornare lo schema:
 *    1. Modificare il file di sviluppo D2_Master_Questionario_v1.0.2.json
 *    2. Rigenerare questo file con build_matrix_schema_gs.sh
 *
 *  Esposto come variabile globale OC_MATRIX_SCHEMA disponibile a Matrix_v1.gs.
 * ============================================================================
 */

var OC_MATRIX_SCHEMA = {
  "metadata": {
    "modelName": "MuseMu Matrix",
    "modelVersion": "1.0.2",
    "releaseDate": "2026-04-29",
    "language": "it",
    "totalQuestions": 43,
    "totalAnagraphic": 6,
    "totalSection11": 6,
    "totalSection12": 3,
    "estimatedCompletionTime": {
      "min": "5-6 minuti",
      "tipo": "7-10 minuti",
      "max": "10-11 minuti"
    },
    "scoringScale": {
      "min": 0,
      "max": 100,
      "mappingLikert": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      }
    },
    "multiselectThresholds": [
      {
        "selectedRatio": 0,
        "score": 0
      },
      {
        "ratioMaxLT": 0.2,
        "score": 25
      },
      {
        "ratioMaxLT": 0.4,
        "score": 50
      },
      {
        "ratioMaxLT": 0.7,
        "score": 75
      },
      {
        "ratioMaxGTE": 0.7,
        "score": 100
      }
    ],
    "weights": {
      "policy": "uniform",
      "note": "v1.0.2: pesi uguali per tutte dimensioni e domande. v1.1: pesi differenziati per profilo istituzionale calibrati su dati pilota."
    },
    "references": {
      "icomDefinition2022": {
        "source": "ICOM, Praga 24 agosto 2022",
        "quote": "Un museo è un'istituzione permanente, senza scopo di lucro, al servizio della società..."
      },
      "welfareCulturale2020": {
        "source": "Cicerchia A., Rossi Ghiglione A., Seia C., Treccani 2020",
        "quote": "Nuovo modello integrato di promozione del benessere e della salute degli individui e delle comunità..."
      },
      "henkel2016": {
        "source": "Henkel M., Embassy of Culture, Berlino 2016",
        "note": "Museum Matrix originario, ispirazione metodologica Big Five BCFPS"
      },
      "moiFramework": {
        "source": "NEMO, Creative Europe 2022",
        "note": "Framework europeo di autovalutazione impatto sociale musei"
      }
    },
    "privacy": {
      "consentRequired": true,
      "anonymous": true,
      "storageScheme": "Two disaccoppiati: RESPONSES (anonima UUID) + CONTACTS (opt-in separato)",
      "gdprBasis": "consenso esplicito + legittimo interesse per dataset aggregato anonimo",
      "dataController": "Duemilamusei — Silvano Straccini, Fano (PU)"
    }
  },
  "dimensions": [
    {
      "code": "D1",
      "name": "Brand & Identity",
      "origin": "Henkel 2016",
      "subDimensions": [
        "Personality",
        "Communication"
      ]
    },
    {
      "code": "D2",
      "name": "Collection & Heritage",
      "origin": "Henkel + ICOM 2022 + ICCD/MIC",
      "subDimensions": [
        "Quality",
        "Quantity & depth",
        "Conservation",
        "Research & cataloging",
        "Digital heritage management"
      ]
    },
    {
      "code": "D3",
      "name": "Facility & Spatial Experience",
      "origin": "Henkel + Musei Sensibili Pilastro III",
      "subDimensions": [
        "Architecture & comfort",
        "Location & logistics",
        "Spatial integration"
      ]
    },
    {
      "code": "D4",
      "name": "Program & Cultural Offer",
      "origin": "Henkel + costruttivismo + postura attiva MS",
      "subDimensions": [
        "Exhibition",
        "Accompanying program",
        "Research & didactics",
        "Visitor posture"
      ]
    },
    {
      "code": "D5",
      "name": "Service & Third Place",
      "origin": "Henkel · Oldenburg",
      "subDimensions": [
        "Third Place quality",
        "Participation",
        "Hospitality & retail"
      ]
    },
    {
      "code": "D6",
      "name": "Digital Maturity & Tech Integration",
      "origin": "Duemilamusei + NEMO Digital Roadmap",
      "subDimensions": [
        "Web & social presence",
        "Digital content & catalog",
        "Virtual experiences",
        "Data & analytics",
        "AI readiness"
      ]
    },
    {
      "code": "D7",
      "name": "Accessibility Radicale (4 livelli)",
      "origin": "Musei Sensibili Pilastro I",
      "subDimensions": [
        "Fisica",
        "Cognitiva",
        "Sensoriale",
        "Digitale-linguistica"
      ]
    },
    {
      "code": "D8",
      "name": "Audience Engagement & Edutainment",
      "origin": "Musei Sensibili Pilastro II",
      "subDimensions": [
        "Audience segmentation",
        "Offerta giovani",
        "Rapporto scuole",
        "Edutainment & gamification",
        "Co-creazione"
      ]
    },
    {
      "code": "D9",
      "name": "Governance, Sustainability & Territorial Ecosystem",
      "origin": "Duemilamusei + ESG",
      "subDimensions": [
        "Governance & networks",
        "Financial sustainability",
        "Environmental & social sustainability",
        "Territorial ecosystem"
      ]
    },
    {
      "code": "D10",
      "name": "Welfare Culturale & Impatto Sociale",
      "origin": "Cicerchia/Rossi Ghiglione/Seia · Treccani 2020 · WHO · MOI!",
      "subDimensions": [
        "Programmi welfare formalizzati",
        "Pubblici fragili",
        "Empowerment & apprendimento",
        "Misurazione impatto sociale"
      ]
    }
  ],
  "anagrafica": [
    {
      "code": "A1",
      "text": "Tipologia",
      "type": "single",
      "required": true,
      "options": [
        "museo civico",
        "museo statale",
        "fondazione",
        "casa-museo",
        "parco o area archeologica",
        "sistema museale",
        "luogo della cultura ecclesiastico",
        "altro"
      ]
    },
    {
      "code": "A2",
      "text": "Natura giuridica",
      "type": "single",
      "required": true,
      "options": [
        "pubblica",
        "privata",
        "mista"
      ]
    },
    {
      "code": "A3",
      "text": "Visitatori nell'ultimo anno solare",
      "type": "single",
      "required": false,
      "options": [
        "meno di 5.000",
        "5.000-20.000",
        "20.000-100.000",
        "100.000-500.000",
        "oltre 500.000",
        "preferisco non rispondere"
      ]
    },
    {
      "code": "A4",
      "text": "Mq espositivi",
      "type": "single",
      "required": true,
      "options": [
        "meno di 200",
        "200-500",
        "500-1.500",
        "1.500-5.000",
        "oltre 5.000"
      ]
    },
    {
      "code": "A5",
      "text": "Addetti FTE",
      "type": "single",
      "required": true,
      "options": [
        "meno di 2",
        "2-5",
        "6-15",
        "16-50",
        "oltre 50"
      ]
    },
    {
      "code": "A_OPT_NAME",
      "text": "Nome dell'istituzione (opzionale)",
      "type": "open",
      "required": false,
      "note": "campo opzionale; se compilato consente report personalizzato e benchmark territoriali"
    }
  ],
  "questions": [
    {
      "code": "D1.1",
      "dimension": "D1",
      "subDimension": "Personality",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di costruzione di un'identità museale riconoscibile?",
      "labels": [
        "Stiamo iniziando a immaginarla — c'è interesse ma non abbiamo formalizzato",
        "Stiamo costruendo le basi — abbiamo idee chiare, le stiamo mettendo in ordine",
        "Abbiamo le basi consolidate — mission/vision/valori sono definiti e condivisi",
        "Siamo in crescita — identità definita, comunicazione coerente in costruzione",
        "Siamo maturi — brand riconoscibile, comunicazione strategica strutturata"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Vision è la direzione strategica a 5-10 anni; mission è la ragione d'essere oggi; valori sono i principi di comportamento. Idealmente sono documentati, condivisi con lo staff e percepibili dal pubblico.",
        "example": "Il Mauritshuis (L'Aia) si presenta come «the most beautiful living room of the Netherlands»: vision sintetica, distintiva e comunicata coerentemente in tutti i canali.",
        "reference": "Henkel 2016, Brand Personality. ICOM 2022, principio «operate ethically, professionally». D.M. 113/2018 LL.GG. Sistema Museale Nazionale, ambito Identità."
      }
    },
    {
      "code": "D1.2",
      "dimension": "D1",
      "subDimension": "Communication",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D1.1>=3",
      "text": "La comunicazione del museo (sito web, social, materiali stampati, segnaletica, comunicazione interna) ha coerenza visiva e di tono?",
      "labels": [
        "Stiamo iniziando a lavorarci",
        "Stiamo costruendo coordinazione visiva",
        "Abbiamo basi coerenti su alcuni canali",
        "Siamo in crescita su tutti i canali principali",
        "Brand book applicato e integrato su ogni touchpoint"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Brand consistency: stessa palette colori, stessi font, stesso tono di voce, stesso registro iconografico su tutti i punti di contatto con il pubblico.",
        "example": "La Pinacoteca di Brera con il restyling 2015-2022 ha unificato linguaggio visivo, tono delle didascalie, social, segnaletica interna.",
        "reference": "Wheeler, «Designing Brand Identity» (Wiley). Henkel 2016: «brand-based communication should be a matter of course in the non-profit sector»."
      }
    },
    {
      "code": "D1.3",
      "dimension": "D1",
      "subDimension": "Personality",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D1.1>=4",
      "text": "Il museo è percepito esternamente con un'identità chiara? Pubblico, finanziatori, partner ricordano il museo per qualcosa di specifico?",
      "labels": [
        "Stiamo lavorando per essere conosciuti",
        "Conosciuti localmente",
        "Riconosciuti come «il museo di…» in ambito regionale",
        "Riconosciuti per una cifra distintiva a livello nazionale",
        "Riconosciuti come riferimento di identità unica"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Brand awareness e brand recall. Si misura con indagini di pubblico, citazioni stampa, premi, presenza in classifiche e guide. Non è il numero di visitatori, ma la specificità del posizionamento mentale.",
        "example": "Il MUSE di Trento è riconosciuto nazionalmente come «il museo della scienza alpina»: posizionamento chiaro che differenzia da altri musei scientifici.",
        "reference": "Aaker, «Brand Equity» (Free Press). D.M. 113/2018 ambito Identità."
      }
    },
    {
      "code": "D1.4",
      "dimension": "D1",
      "subDimension": "Communication",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D1.1>=5",
      "text": "La direzione del museo agisce come portavoce autentico dell'istituzione? La comunicazione è guidata strategicamente dal vertice?",
      "labels": [
        "Stiamo riflettendo sul ruolo della direzione",
        "Comunicazione delegata al solo ufficio stampa",
        "La direzione interviene su occasioni specifiche",
        "La direzione guida la strategia comunicativa",
        "La direzione è portavoce autentico riconosciuto nei media e nei convegni"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La comunicazione è una funzione direzionale, non solo operativa. Il direttore o conservatore-capo dovrebbe rappresentare autenticamente il museo nei media, nei convegni, nelle occasioni pubbliche.",
        "example": "James Bradburne (ex-direttore Brera) ha esercitato leadership comunicativa con interventi pubblici sistematici su musei e patrimonio nazionale.",
        "reference": "Henkel 2016: «communication is a managerial task». Bonet & Donato, «The Museum Director: Profile, Skills and Roles»."
      }
    },
    {
      "code": "D2.1",
      "dimension": "D2",
      "subDimension": "Quality",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è la valorizzazione della rilevanza e unicità della vostra collezione (anche in assenza di masterpieces in senso classico)?",
      "labels": [
        "Stiamo iniziando a definire l'identità della collezione",
        "Riconosciamo il valore d'interesse locale",
        "Caratteristiche distintive di interesse regionale identificate",
        "Unicità riconosciuta a livello nazionale",
        "Collezione riconosciuta a livello internazionale per rilevanza o unicità"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La rilevanza non si limita alla presenza di «masterpieces». Anche un piccolo museo etnografico può avere unicità nazionale documentando tradizioni perdute o saperi marginali.",
        "example": "Il Museo della Carta di Fabriano non ha «masterpieces» classici ma ha unicità nazionale per la documentazione completa della produzione cartaria storica italiana.",
        "reference": "Henkel 2016, Collection Quality. ICOM 2022, «tangible and intangible heritage». UNESCO 2003 Convenzione patrimonio culturale immateriale."
      }
    },
    {
      "code": "D2.2",
      "dimension": "D2",
      "subDimension": "Quantity & depth",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D2.1>=3",
      "text": "La collezione è quantitativamente sufficiente e tematicamente coerente per sostenere il racconto del museo?",
      "labels": [
        "Stiamo costruendo la collezione",
        "Presente ma frammentaria",
        "Adeguata, con alcune lacune tematiche",
        "Buona, coerente con la mission",
        "Eccellente, esaustiva, con piano di acquisizioni programmato"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Non solo numeri assoluti (quanti oggetti) ma copertura tematica.",
        "example": "Il Museo Egizio di Torino ha eccellente profondità tematica, anche se conta «soltanto» 30.000 oggetti rispetto a collezioni di milioni di pezzi.",
        "reference": "Henkel 2016. ICOM Italia, Carta nazionale delle professioni museali."
      }
    },
    {
      "code": "D2.3",
      "dimension": "D2",
      "subDimension": "Conservation",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D2.1>=4",
      "text": "Sono attive politiche formali di conservazione preventiva (controllo microclima, illuminazione, sicurezza, restauri programmati) e lo stato della collezione è documentato?",
      "labels": [
        "Stiamo iniziando ad affrontare il tema",
        "Solo interventi emergenziali quando necessario",
        "Monitoraggio di base attivo (microclima, sicurezza)",
        "Piano di conservazione preventiva strutturato",
        "Eccellenza certificata su standard MIC/ICCROM, laboratorio interno o convenzioni"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Conservazione preventiva: monitoraggio del microclima (temperatura, UR, lux, UV), pest management, piani di emergenza, schede di stato di conservazione, restauri programmati.",
        "example": "I Musei Vaticani hanno laboratorio interno di conservazione e piano di conservazione preventiva con orizzonte decennale.",
        "reference": "Codice BBCC D.Lgs 42/2004 art. 29. D.M. 113/2018 LL.GG. ambito Strutture e ambito Sicurezza. ICCROM Re-Org."
      }
    },
    {
      "code": "D2.4",
      "dimension": "D2",
      "subDimension": "Research & cataloging",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D2.1>=3",
      "text": "Quali strumenti e standard di catalogazione scientifica utilizzate per la vostra collezione?",
      "options": [
        {
          "value": "iccd_schede",
          "label": "Schede ICCD compilate e aggiornate (F, OA, RA, BDI, ecc.)"
        },
        {
          "value": "sigecweb",
          "label": "SIGECweb (Sistema Informativo Generale del Catalogo, ICCD)"
        },
        {
          "value": "cultura_italia",
          "label": "Caricamento progressivo su Cultura Italia / Digital Library MIC"
        },
        {
          "value": "inventario_digitale",
          "label": "Inventario digitale interno (database custom o foglio elettronico strutturato)"
        },
        {
          "value": "open_data_scheda",
          "label": "Pubblicazione open data della scheda catalografica"
        },
        {
          "value": "foto_scheda",
          "label": "Documentazione fotografica strutturata e collegata alla scheda"
        },
        {
          "value": "bibliografia",
          "label": "Bibliografia scientifica collegata a ciascuna opera"
        },
        {
          "value": "collab_universita",
          "label": "Collaborazioni di ricerca con università o istituti accademici"
        },
        {
          "value": "pubblicazioni_periodiche",
          "label": "Pubblicazioni scientifiche periodiche del museo"
        },
        {
          "value": "convegni",
          "label": "Convegni o seminari scientifici annuali ospitati"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Catalogazione scientifica e ricerca. ICCD è lo standard nazionale italiano. Il MIC sta promuovendo ampie campagne di digitalizzazione attraverso il PNRR e la Digital Library.",
        "example": "Il Museo Archeologico Nazionale di Napoli ha collezione su SIGECweb ICCD, pubblicazioni scientifiche periodiche e collaborazioni stabili con università e CNR.",
        "reference": "ICCD, Standard catalografici nazionali. PNRR M1C3 Investimento 1.1. Piano nazionale digitalizzazione MIC."
      }
    },
    {
      "code": "D2.5",
      "dimension": "D2",
      "subDimension": "Digital heritage management",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D2.1>=3",
      "text": "Quali funzioni di gestione del patrimonio sono presidiate da software digitali strutturati nel vostro museo?",
      "options": [
        {
          "value": "inventario_unitario",
          "label": "Inventario digitale unitario (tutti gli oggetti tracciati in unico sistema)"
        },
        {
          "value": "location_tracking",
          "label": "Tracciamento ubicazione e movimentazioni interne"
        },
        {
          "value": "loan_in",
          "label": "Gestione prestiti in entrata"
        },
        {
          "value": "loan_out",
          "label": "Gestione prestiti in uscita"
        },
        {
          "value": "conservazione_schede",
          "label": "Schede stato di conservazione digitalizzate e aggiornate"
        },
        {
          "value": "restauro_log",
          "label": "Registro interventi di restauro con storico completo"
        },
        {
          "value": "foto_integrata",
          "label": "Documentazione fotografica integrata nel sistema gestionale"
        },
        {
          "value": "reportistica",
          "label": "Reportistica automatica (statistiche, condizioni, movimenti)"
        },
        {
          "value": "cms_dedicato",
          "label": "Software di scheda museale dedicato (Adlib/Axiell, TMS, Mimsy, MuseumPlus, Erco, gestionali italiani)"
        },
        {
          "value": "integrazione_iccd",
          "label": "Integrazione con catalogo scientifico ICCD/SIGECweb"
        },
        {
          "value": "backup_dr",
          "label": "Backup automatici e disaster recovery del database collezioni"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Software di scheda museale (Collection Management System): gestiscono in modo integrato l'intero ciclo di vita del patrimonio.",
        "example": "I Musei Vaticani usano un CMS integrato. Soluzioni più contenute come Adlib o MuseumPlus sono diffuse anche in musei di media dimensione.",
        "reference": "PNRR M1C3 Investimento 1.1. ICCD. Digital Library MIC. ICOM CIDOC. UNI 11675:2017."
      }
    },
    {
      "code": "D3.1",
      "dimension": "D3",
      "subDimension": "Architecture & comfort",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di qualificazione degli spazi espositivi e dell'esperienza di visita?",
      "labels": [
        "Gli spazi sono nelle condizioni di partenza, stiamo iniziando a progettarne il miglioramento",
        "Stiamo costruendo le basi: alcuni interventi puntuali fatti, piano complessivo in elaborazione",
        "Abbiamo basi consolidate: spazi funzionali, allestimento coerente, comfort di visita adeguato",
        "Siamo in crescita strutturata: allestimento curato, esperienza di visita pensata, comfort elevato",
        "Spazi di riferimento per qualità progettuale, comfort e narrazione integrata"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La qualità complessiva include sia l'edificio sia il modo in cui gli spazi sono allestiti.",
        "example": "Il MAXXI di Roma (Zaha Hadid). Anche piccoli musei come la Casa Museo di Goethe a Roma esprimono ottima qualità d'esperienza con interventi minimali ma coerenti.",
        "reference": "Henkel 2016, Facility. D.M. 113/2018 LL.GG. ambito Strutture. Musei Sensibili Pilastro III."
      }
    },
    {
      "code": "D3.2",
      "dimension": "D3",
      "subDimension": "Architecture & comfort",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D3.1>=3",
      "text": "Il vostro allestimento garantisce comfort di visita su questi aspetti: illuminazione adeguata alle opere, sosta confortevole, percorsi chiari, supporti didascalici leggibili?",
      "labels": [
        "Stiamo iniziando a curare questi aspetti",
        "Stiamo costruendo: alcuni elementi presenti, altri in costruzione",
        "Comfort base presente su tutti gli aspetti",
        "Comfort curato e integrato in tutto il percorso",
        "Comfort di eccellenza, riconosciuto in indagini di pubblico"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Comfort: illuminazione equilibrata, panchine/punti di sosta, didascalie leggibili (font ≥18pt), percorsi chiari, microclima accettabile.",
        "example": "La Galleria Borghese ha sostituito illuminazione e didascalie nel 2018 ottenendo riscontri molto positivi su comfort percepito.",
        "reference": "D.M. 113/2018 LL.GG. ambito Strutture. Musei Sensibili. Linee guida AAM su Visitor Experience."
      }
    },
    {
      "code": "D3.3",
      "dimension": "D3",
      "subDimension": "Location & logistics",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D3.1>=4",
      "text": "Il museo è facilmente raggiungibile? Posizione, segnaletica esterna, parcheggi, trasporti pubblici, percorsi pedonali sono adeguati?",
      "labels": [
        "La raggiungibilità è una sfida da affrontare",
        "Stiamo costruendo soluzioni (segnaletica, accordi trasporti)",
        "Raggiungibilità adeguata, alcuni aspetti da consolidare",
        "Raggiungibilità buona e ben comunicata",
        "Raggiungibilità eccellente, integrazione completa con il sistema di mobilità urbana"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Include segnaletica esterna nel raggio di 1 km, distanza da fermata trasporto pubblico, parcheggi, accessibilità pedonale.",
        "example": "Il Museo dell'Ara Pacis è raggiungibile a piedi dal centro di Roma. Il Castello di Rivoli ha attivato navetta da Torino centro.",
        "reference": "Henkel 2016, Location in the city. D.Lgs 42/2004 art. 6. Linee guida MIC accessibilità destinazioni culturali."
      }
    },
    {
      "code": "D3.4",
      "dimension": "D3",
      "subDimension": "Architecture & comfort",
      "type": "factual_single",
      "isGateway": false,
      "activeIf": "D3.1>=3",
      "text": "Quando è stato realizzato l'ultimo intervento di ristrutturazione architettonica o riallestimento significativo del museo?",
      "choices": [
        {
          "value": "12mesi",
          "label": "Negli ultimi 12 mesi",
          "score": 100
        },
        {
          "value": "5anni",
          "label": "Negli ultimi 5 anni",
          "score": 100
        },
        {
          "value": "5_15",
          "label": "Tra 5 e 15 anni fa",
          "score": 75
        },
        {
          "value": "15_30",
          "label": "Tra 15 e 30 anni fa",
          "score": 50
        },
        {
          "value": "oltre30",
          "label": "Oltre 30 anni fa",
          "score": 25
        },
        {
          "value": "mai",
          "label": "Mai realizzato un intervento significativo",
          "score": 0
        }
      ],
      "tooltip": {
        "definition": "Per «intervento significativo» si intende ristrutturazione architettonica (>50% degli spazi), riallestimento generale dell'esposizione permanente, riprogettazione della comunicazione espositiva.",
        "example": "Il riallestimento delle sale 1-9 della Pinacoteca di Brera (2015-2018) è un intervento significativo. Una semplice tinteggiatura no.",
        "reference": "D.Lgs 42/2004 art. 29. Codice deontologico ICOM."
      }
    },
    {
      "code": "D4.1",
      "dimension": "D4",
      "subDimension": "Exhibition",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di costruzione di un'offerta culturale ricca, variata e capace di parlare a pubblici diversi?",
      "labels": [
        "Offriamo essenzialmente la visita all'esposizione permanente, stiamo iniziando ad arricchire",
        "Stiamo costruendo: prime mostre temporanee o eventi occasionali realizzati",
        "Abbiamo basi consolidate: esposizione permanente curata + alcune mostre temporanee + programma eventi annuale",
        "Siamo in crescita: programma articolato di mostre, eventi, laboratori, didattica strutturata",
        "Offerta culturale di riferimento: ampia, continuativa, multistrato, con ricerca e produzione propria"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "L'offerta culturale comprende esposizione permanente, mostre temporanee, programma di accompagnamento, didattica scolastica, laboratori, eventi speciali, ricerca scientifica.",
        "example": "Il MAXXI di Roma alterna grandi mostre temporanee, eventi serali settimanali, laboratori didattici. Anche piccoli musei come il Museo del Tessuto di Prato sviluppano programma annuale articolato.",
        "reference": "Henkel 2016, Program. D.M. 113/2018 LL.GG. ambito Servizi al Pubblico. ICOM Code of Ethics art. 4."
      }
    },
    {
      "code": "D4.2",
      "dimension": "D4",
      "subDimension": "Exhibition",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D4.1>=3",
      "text": "Le esposizioni temporanee del museo (frequenza, qualità curatoriale, capacità di attrarre pubblico nuovo)?",
      "labels": [
        "Stiamo iniziando a programmarle",
        "Una mostra temporanea ogni 12-24 mesi",
        "1-2 mostre temporanee/anno con curatela strutturata",
        "3+ mostre/anno con qualità curatoriale e attrattività",
        "Programma espositivo di riferimento, con co-produzioni internazionali e ricerca propria"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La qualità di una mostra temporanea si misura su: presenza di curatore identificato, catalogo scientifico pubblicato, supporti didattici dedicati, comunicazione strutturata.",
        "example": "Il MAR di Ravenna realizza ogni anno 2-3 mostre temporanee con catalogo Skira/Silvana e itineranza internazionale.",
        "reference": "Henkel 2016, Exhibition. Standard MIC LL.GG. ICOM Italia Carta delle professioni museali."
      }
    },
    {
      "code": "D4.3",
      "dimension": "D4",
      "subDimension": "Accompanying program",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D4.1>=3",
      "text": "Quali tipologie di programmi di accompagnamento sono attive nel vostro museo?",
      "options": [
        {
          "value": "vg_libere",
          "label": "Visite guidate generali per pubblico libero"
        },
        {
          "value": "vg_tematiche",
          "label": "Visite guidate tematiche o speciali (curatori, autori, esperti)"
        },
        {
          "value": "conferenze",
          "label": "Conferenze e tavole rotonde"
        },
        {
          "value": "presentazioni",
          "label": "Presentazioni editoriali / dialoghi con autori"
        },
        {
          "value": "lab_scuole",
          "label": "Laboratori didattici per scuole (infanzia, primaria, secondaria)"
        },
        {
          "value": "lab_famiglie",
          "label": "Laboratori per famiglie / kid friendly"
        },
        {
          "value": "lab_adulti",
          "label": "Laboratori per adulti / formazione continua"
        },
        {
          "value": "eventi_serali",
          "label": "Eventi serali / aperture straordinarie"
        },
        {
          "value": "performance",
          "label": "Concerti, spettacoli, performance dal vivo"
        },
        {
          "value": "cinema",
          "label": "Programma cinema / proiezioni"
        },
        {
          "value": "residenze",
          "label": "Residenze artistiche o di ricerca"
        },
        {
          "value": "accessibilita_progr",
          "label": "Programmi di accessibilità dedicati (LIS, audiodescrizioni, percorsi tattili)"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Chiediamo cosa è EFFETTIVAMENTE attivo nell'ultimo anno solare. Un singolo programma occasionale non si conta.",
        "example": "Il Palazzo Strozzi di Firenze attiva tutte le tipologie sopra. Molti musei medi si concentrano su 3-4 tipologie consolidate.",
        "reference": "Henkel 2016, Accompanying program. D.M. 113/2018 ambito Servizi al Pubblico. Hooper-Greenhill. Falk & Dierking."
      }
    },
    {
      "code": "D4.4",
      "dimension": "D4",
      "subDimension": "Visitor posture",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D4.1>=4",
      "text": "L'offerta del museo promuove una postura attiva del visitatore (dialogo, co-creazione, learning by doing) o resta sul registro classico della contemplazione passiva?",
      "labels": [
        "Offerta principalmente contemplativa, stiamo iniziando a riflettere sull'attivazione del pubblico",
        "Alcune sperimentazioni di attivazione (es. laboratori interattivi occasionali)",
        "Postura mista: contemplazione + attivazione presente in modo strutturato in alcune occasioni",
        "Postura attiva integrata trasversalmente nell'offerta (laboratori, dialoghi, percorsi partecipativi)",
        "Modello dichiaratamente partecipativo: il pubblico co-crea contenuti, programmi, percorsi"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La postura attiva è un orientamento progettuale. Si manifesta in laboratori dove il visitatore «fa», percorsi con domande aperte, format VTS, co-progettazione.",
        "example": "Il Museum of Contemporary Art di Chicago organizza percorsi VTS. Il Museo della Mente di Roma costruisce intere sezioni espositive in co-progettazione.",
        "reference": "Bourriaud, Estetica relazionale (Postmedia, 2010). Bruner. Hooper-Greenhill. Musei Sensibili (postura attiva). VTS (Yenawine, Housen)."
      }
    },
    {
      "code": "D5.1",
      "dimension": "D5",
      "subDimension": "Third Place quality",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di costruzione di un'esperienza che vada oltre la pura visita all'esposizione, e che renda il museo un luogo dove le persone si trattengono volentieri?",
      "labels": [
        "Offriamo essenzialmente la visita all'esposizione, stiamo iniziando a pensare a servizi di accoglienza",
        "Stiamo costruendo: alcuni servizi di base presenti, il resto è in pianificazione",
        "Abbiamo basi consolidate: bookshop o caffetteria attivi, accoglienza curata, comfort di sosta presente",
        "Siamo in crescita: servizi accessori integrati, programmi di membership, attività che fanno tornare il pubblico",
        "Il museo è un «terzo luogo» riconosciuto: caffetteria/ristorante di qualità, bookshop curato, eventi serali, community attiva"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Il «terzo luogo» (Oldenburg): dopo casa e lavoro, le persone hanno bisogno di luoghi neutri di socialità informale.",
        "example": "Il MAXXI di Roma. Il Museo del Novecento di Milano. Anche piccoli musei come il Museo delle Terre Marchigiane di San Lorenzo in Campo.",
        "reference": "Oldenburg, The Great Good Place (Marlowe, 1989). Henkel 2016. D.M. 113/2018."
      }
    },
    {
      "code": "D5.2",
      "dimension": "D5",
      "subDimension": "Hospitality & retail",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D5.1>=3",
      "text": "L'accoglienza al visitatore è curata? Punto info chiaro, biglietteria efficiente, deposito, segnaletica interna, personale presente?",
      "labels": [
        "Stiamo iniziando a strutturare l'accoglienza",
        "Stiamo costruendo: alcuni elementi base presenti",
        "Accoglienza adeguata: info point, deposito, segnaletica, personale formato",
        "Accoglienza curata: linguaggio multilingue, supporti per il visitatore, esperienza fluida",
        "Accoglienza di eccellenza, riconosciuta in indagini di gradimento"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Hospitality: info point, biglietteria veloce, deposito gratuito, supporti multilingue, segnaletica interna chiara, comfort delle aree di accesso.",
        "example": "La Pinacoteca di Brera dopo il restyling 2015-2022. La Galleria degli Uffizi ha investito in biglietteria online.",
        "reference": "D.M. 113/2018 LL.GG. ambito Servizi al Pubblico. ICOM Code of Ethics art. 4.10. Standard ENIT."
      }
    },
    {
      "code": "D5.3",
      "dimension": "D5",
      "subDimension": "Hospitality & retail",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D5.1>=3",
      "text": "Quali servizi accessori sono attivi nel vostro museo?",
      "options": [
        {
          "value": "bookshop",
          "label": "Bookshop / shop con merchandise dedicato"
        },
        {
          "value": "caffetteria",
          "label": "Caffetteria interna o con concessione"
        },
        {
          "value": "ristorante",
          "label": "Ristorante / bistrot"
        },
        {
          "value": "picnic",
          "label": "Area picnic o spazi all'aperto fruibili"
        },
        {
          "value": "area_bambini",
          "label": "Area bambini / family corner attrezzata"
        },
        {
          "value": "audioguide",
          "label": "Audioguide tradizionali (apparecchio) o digitali (app)"
        },
        {
          "value": "app",
          "label": "App dedicata del museo"
        },
        {
          "value": "wifi",
          "label": "Wi-Fi gratuito per visitatori"
        },
        {
          "value": "location_rental",
          "label": "Spazi per eventi privati (location rental, matrimoni, convegni)"
        },
        {
          "value": "prenotazione_vg",
          "label": "Servizio prenotazione visite guidate (online o telefonico)"
        },
        {
          "value": "membership",
          "label": "Programmi di membership / abbonamento annuale"
        },
        {
          "value": "fedelta",
          "label": "Tessera fedeltà o programma punti"
        },
        {
          "value": "bagni_acc",
          "label": "Bagni accessibili e fasciatoio"
        },
        {
          "value": "newsletter",
          "label": "Servizio newsletter / comunicazione continuativa al pubblico"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Chiediamo cosa è EFFETTIVAMENTE attivo. Un servizio «in pianificazione» non si conta.",
        "example": "Il Museo Egizio di Torino ha attivato 13 dei 14 servizi. Un museo civico medio attiva 6-8 servizi.",
        "reference": "Henkel 2016, Service. D.M. 113/2018. NEMO Audience Development Toolkit."
      }
    },
    {
      "code": "D5.4",
      "dimension": "D5",
      "subDimension": "Participation",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D5.1>=4",
      "text": "Il museo coltiva una community di sostenitori che lo visitano regolarmente, ne sostengono l'attività, partecipano alla vita dell'istituzione?",
      "labels": [
        "Stiamo iniziando a riflettere su programmi di fidelizzazione",
        "Esiste una mailing list, alcune azioni di comunicazione continuativa",
        "Membership attiva con tessera annuale, vantaggi base per i soci",
        "Community strutturata: membership con livelli, eventi dedicati, anteprime",
        "Modello di membership di riferimento (centinaia/migliaia di soci attivi)"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La membership trasforma il visitatore occasionale in «ambasciatore» del museo.",
        "example": "Il Castello di Rivoli ha programma «Amici» con migliaia di iscritti. La Pinacoteca di Brera ha lanciato «Brera+». MoMA ha 130.000 membri.",
        "reference": "Oldenburg (op.cit.). Falk & Dierking. NEMO Membership Programs Best Practices."
      }
    },
    {
      "code": "D6.1",
      "dimension": "D6",
      "subDimension": "Web & social presence",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di trasformazione digitale del museo, sia nei processi interni sia nella relazione con il pubblico?",
      "labels": [
        "Siamo all'inizio: stiamo riflettendo su come il digitale possa supportare il museo",
        "Stiamo costruendo le basi: presenza social attiva, sito web aggiornato, alcune sperimentazioni",
        "Abbiamo basi consolidate: presenza digitale curata, contenuti pubblicati con regolarità, primi strumenti di analytics",
        "Siamo in crescita: strategia digitale strutturata, contenuti immersivi, raccolta dati di visita",
        "Maturità digitale di riferimento: integrazione completa fra fisico e digitale, AI integrata, dati guidano le decisioni"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La maturità digitale non è «quante tecnologie usate», ma «quanto il digitale è integrato nella vostra missione».",
        "example": "Il Rijksmuseum di Amsterdam (digitalizzazione open data). Il MAXXI usa AI per analisi del flusso visitatori. La Pinacoteca di Brera ricostruisce digitalmente opere disperse.",
        "reference": "NEMO Digital Roadmap for Museums 2020-2025. UNESCO 2020. AGID Linee guida design servizi digitali. Musei Sensibili Pilastro III."
      }
    },
    {
      "code": "D6.2",
      "dimension": "D6",
      "subDimension": "Web & social presence",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D6.1>=3",
      "text": "Il sito web e i canali social del museo sono curati, aggiornati con regolarità, riconoscibili come riferimento dal pubblico?",
      "labels": [
        "Stiamo iniziando a strutturare la presenza digitale",
        "Sito web di base, social presenti ma con pubblicazione irregolare",
        "Sito web aggiornato, social attivi con pubblicazione settimanale",
        "Sito web professionale, social con strategia editoriale e pubblicazione regolare",
        "Presenza digitale di riferimento: sito moderno e accessibile, social curati con strategia editoriale forte e community engagement"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Include qualità del sito (responsive, accessibile), presenza sui social principali, frequenza di pubblicazione, strategia editoriale.",
        "example": "La Pinacoteca di Brera con Bradburne. Il MUSE di Trento.",
        "reference": "NEMO Digital Roadmap. AGID Linee guida design servizi digitali. ICOM Italia best practices social."
      }
    },
    {
      "code": "D6.3",
      "dimension": "D6",
      "subDimension": "Digital content & catalog",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D6.1>=3",
      "text": "Quali strumenti digitali sono attualmente attivi per il vostro pubblico?",
      "options": [
        {
          "value": "sito_web",
          "label": "Sito web professionale e aggiornato regolarmente"
        },
        {
          "value": "biglietteria_online",
          "label": "Biglietteria online integrata"
        },
        {
          "value": "audioguida_digitale",
          "label": "Audioguida digitale (app dedicata o web app)"
        },
        {
          "value": "newsletter_curata",
          "label": "Newsletter periodica con contenuti curati"
        },
        {
          "value": "tour_360",
          "label": "Tour virtuale 360° dell'esposizione"
        },
        {
          "value": "ar_sala",
          "label": "Realtà aumentata (AR) in sala su opere selezionate"
        },
        {
          "value": "vr",
          "label": "Realtà virtuale (VR) per esperienze immersive"
        },
        {
          "value": "chatbot",
          "label": "Chatbot o assistente conversazionale per visitatori"
        },
        {
          "value": "catalogo_digitale",
          "label": "Catalogo digitale della collezione consultabile online"
        },
        {
          "value": "open_data",
          "label": "Open data della collezione (licenza aperta)"
        },
        {
          "value": "analytics",
          "label": "Analytics di visita (digital + on-site con sensori/conteggi)"
        },
        {
          "value": "crm",
          "label": "Profilazione pubblici e CRM strutturato"
        },
        {
          "value": "video_originali",
          "label": "Contenuti video originali (YouTube, podcast, web series)"
        },
        {
          "value": "educativo_digitale",
          "label": "Programma educativo digitale per scuole (DAD-friendly)"
        },
        {
          "value": "personalizzazione",
          "label": "Personalizzazione dell'esperienza basata su preferenze utente"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Chiediamo cosa è attivo OGGI, non in pianificazione. Le 15 opzioni coprono l'intero spettro della maturità digitale museale.",
        "example": "Il MUSE di Trento ha attivato circa 11 di queste 15 opzioni. Un museo civico medio ne ha 5-7.",
        "reference": "NEMO Digital Roadmap. NEMO Survey Digital Skills. ICOM Italia."
      }
    },
    {
      "code": "D6.4",
      "dimension": "D6",
      "subDimension": "Web & social presence",
      "type": "factual_single",
      "isGateway": false,
      "activeIf": "D6.1>=4",
      "text": "Quando avete pubblicato l'ultimo contenuto sui vostri canali social principali (Instagram o Facebook)?",
      "choices": [
        {
          "value": "7gg",
          "label": "Negli ultimi 7 giorni",
          "score": 100
        },
        {
          "value": "30gg",
          "label": "Negli ultimi 30 giorni",
          "score": 75
        },
        {
          "value": "90gg",
          "label": "Negli ultimi 90 giorni",
          "score": 50
        },
        {
          "value": "6mesi",
          "label": "Oltre 6 mesi fa",
          "score": 25
        },
        {
          "value": "no_canali",
          "label": "Non abbiamo canali social attivi",
          "score": 0
        }
      ],
      "tooltip": {
        "definition": "Un canale social dichiarato «attivo» deve avere almeno una pubblicazione mensile.",
        "example": "I musei più attivi pubblicano 3-5 post settimanali.",
        "reference": "AGID Linee guida comunicazione digitale PA. Hootsuite/Sprout Social Industry Benchmarks."
      }
    },
    {
      "code": "D7.1",
      "dimension": "D7",
      "subDimension": "Fisica",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di costruzione di un'accessibilità radicale, intesa come ecosistema integrato e non come checklist normativa?",
      "labels": [
        "Stiamo iniziando: gli interventi di base sono in fase di progettazione",
        "Stiamo costruendo: rispetto della normativa fisica garantito, primi sperimenti su altri livelli",
        "Abbiamo basi consolidate: accessibilità fisica completa, primi interventi su cognitiva e sensoriale",
        "Siamo in crescita: 3 dei 4 livelli attivi con interventi strutturati",
        "Modello di riferimento: tutti i 4 livelli integrati in modo ecosistemico, riconosciuto come buona pratica"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "L'accessibilità nel modello Musei Sensibili è un ecosistema a 4 livelli (fisica, cognitiva, sensoriale, digitale-linguistica).",
        "example": "Il Museo Tattile Anteros di Bologna. Il Museo della Mente di Roma. La Biblioteca Italiana per i Ciechi «Regina Margherita» di Monza.",
        "reference": "Musei Sensibili Pilastro I. Convenzione ONU 2006. L. 4/2004 Stanca. AGID WCAG 2.1 AA. ICOM 2022."
      }
    },
    {
      "code": "D7.2",
      "dimension": "D7",
      "subDimension": "Fisica",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D7.1>=3",
      "text": "Quali interventi di accessibilità fisica sono attivi nel vostro museo?",
      "options": [
        {
          "value": "ingresso_no_barriere",
          "label": "Ingresso senza barriere architettoniche (rampe, ascensori)"
        },
        {
          "value": "percorsi_accessibili",
          "label": "Percorsi interni tutti accessibili a sedia a rotelle"
        },
        {
          "value": "bagni_accessibili",
          "label": "Bagni accessibili"
        },
        {
          "value": "posti_riservati",
          "label": "Posti riservati a sedia a rotelle in sala conferenze/laboratori"
        },
        {
          "value": "sedute",
          "label": "Sedute ergonomiche distribuite lungo il percorso"
        },
        {
          "value": "parcheggi_riservati",
          "label": "Parcheggi riservati nelle vicinanze"
        },
        {
          "value": "personale_formato",
          "label": "Personale formato sull'accoglienza di persone con disabilità motoria"
        },
        {
          "value": "sedie_rotelle",
          "label": "Sedie a rotelle disponibili gratuitamente per i visitatori"
        },
        {
          "value": "segnaletica_universale",
          "label": "Segnaletica con simboli universali ben visibili"
        },
        {
          "value": "didascalie_ergonomiche",
          "label": "Altezza didascalie ergonomica (90-130 cm dal pavimento)"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Livello base regolato dalla normativa italiana (DM 236/89, DPR 503/96). Un museo veramente accessibile va oltre.",
        "example": "I Musei Vaticani hanno accessibilità completa con percorsi alternativi documentati.",
        "reference": "DM 236/89, DPR 503/96. MIC Linee guida superamento barriere architettoniche luoghi cultura (2018)."
      }
    },
    {
      "code": "D7.3",
      "dimension": "D7",
      "subDimension": "Cognitiva",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D7.1>=4",
      "text": "Quali interventi di accessibilità cognitiva sono attivi?",
      "options": [
        {
          "value": "e2r",
          "label": "Didascalie / pannelli scritti in linguaggio Easy-to-Read (E2R) europeo"
        },
        {
          "value": "caa",
          "label": "Pittogrammi e simboli CAA (Comunicazione Aumentativa Alternativa) nei supporti"
        },
        {
          "value": "versioni_semplificate",
          "label": "Versioni semplificate del catalogo o della guida del museo"
        },
        {
          "value": "percorsi_dis_intellettiva",
          "label": "Percorsi specifici per persone con disabilità intellettive"
        },
        {
          "value": "personale_autismo",
          "label": "Personale formato all'accoglienza di persone con autismo o disturbi cognitivi"
        },
        {
          "value": "materiali_tattili_supp",
          "label": "Materiali tattili/manipolativi a supporto della comprensione"
        },
        {
          "value": "mappe_simboli",
          "label": "Mappe del museo con simboli e percorsi semplificati"
        },
        {
          "value": "bes",
          "label": "Programmi educativi specifici per studenti con BES (Bisogni Educativi Speciali)"
        },
        {
          "value": "quiet_hours",
          "label": "Quiet hours / aperture dedicate a persone con sensibilità sensoriale (autismo)"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Mira a rendere comprensibili contenuti e percorsi a persone con difficoltà di lettura, disabilità intellettive, autismo, demenze.",
        "example": "Il Museo del Novecento di Milano ha versioni E2R di alcuni testi. Il Museo di Capodimonte ha «quiet hours» per persone con autismo.",
        "reference": "Inclusion Europe, Information for All (E2R 2014). ANFFAS Linee guida CAA musei. Centro Risorse E2R AIPD."
      }
    },
    {
      "code": "D7.4",
      "dimension": "D7",
      "subDimension": "Sensoriale",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D7.1>=4",
      "text": "Quali interventi di accessibilità sensoriale (per persone con disabilità visiva o uditiva) e digitale-linguistica (per stranieri e migranti) sono attivi?",
      "options": [
        {
          "value": "audiodescrizioni",
          "label": "Audiodescrizioni delle opere principali (su app, audioguida o QR)"
        },
        {
          "value": "mappe_tattili",
          "label": "Mappe tattili dell'edificio o riproduzioni tattili di opere"
        },
        {
          "value": "vg_lis",
          "label": "Visite guidate in LIS (Lingua dei Segni Italiana) su prenotazione"
        },
        {
          "value": "avatar_lis",
          "label": "Avatar/digital human in LIS integrato in percorsi multimediali"
        },
        {
          "value": "captioning",
          "label": "Sottotitoli (captioning) sui contenuti video del museo"
        },
        {
          "value": "audio_amplificato",
          "label": "Audio amplificato o anelli magnetici per persone ipoudenti in sale conferenze"
        },
        {
          "value": "materiali_inglese",
          "label": "Materiali in inglese disponibili (didascalie, app, sito web)"
        },
        {
          "value": "materiali_lingue",
          "label": "Materiali in altre lingue oltre l'inglese (almeno 2 lingue extra-italiane)"
        },
        {
          "value": "traduzione_ai",
          "label": "Traduzione AI in tempo reale su app o totem"
        },
        {
          "value": "l2_facilitato",
          "label": "Materiali in linguaggio facilitato per stranieri italiani L2"
        },
        {
          "value": "mediazione_migranti",
          "label": "Programmi di mediazione culturale per migranti e nuovi cittadini"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Due livelli combinati. Sensoriale: audiodescrizioni, mappe tattili, LIS. Digitale-linguistica: multilingua, traduzioni AI, supporto migranti.",
        "example": "Il Museo Tattile Anteros. La GAM di Torino ha avatar digital human in LIS. Il Museo Egizio offre audioguide in 8+ lingue.",
        "reference": "ENS Linee guida accessibilità musei. UICI. Council of Europe. AGID Linee guida accessibilità multilingue."
      }
    },
    {
      "code": "D7.5",
      "dimension": "D7",
      "subDimension": "Fisica",
      "type": "factual_single",
      "isGateway": false,
      "activeIf": "D7.1>=3",
      "text": "Esiste nel vostro museo un Piano di Accessibilità formalmente approvato e pubblicato?",
      "choices": [
        {
          "value": "si_pubblicato",
          "label": "Sì, esiste un piano formale pubblicato e disponibile pubblicamente",
          "score": 100
        },
        {
          "value": "si_interno",
          "label": "Sì, esiste un piano formale ma a uso interno (non pubblicato)",
          "score": 75
        },
        {
          "value": "in_redazione",
          "label": "È in corso di redazione",
          "score": 50
        },
        {
          "value": "pianificato",
          "label": "Non esiste ma è nei piani futuri (entro 12 mesi)",
          "score": 25
        },
        {
          "value": "no",
          "label": "Non esiste e non è in pianificazione",
          "score": 0
        }
      ],
      "tooltip": {
        "definition": "Documento strategico approvato dal vertice (direzione/CdA) con orizzonte 3-5 anni che definisce obiettivi, interventi, tempi, risorse per i 4 livelli.",
        "example": "La GAM di Torino ha pubblicato il proprio Piano di Accessibilità 2022-2025 sul sito web.",
        "reference": "MIC Linee guida PEBA. Convenzione ONU 2006 art. 30."
      }
    },
    {
      "code": "D8.1",
      "dimension": "D8",
      "subDimension": "Audience segmentation",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di sviluppo dei pubblici, con particolare attenzione ai giovani, alle scuole e alle comunità locali?",
      "labels": [
        "Siamo all'inizio: stiamo riflettendo su come segmentare e attrarre pubblici diversi",
        "Stiamo costruendo: alcune attività dedicate occasionali (scuole, famiglie)",
        "Abbiamo basi consolidate: programma scolastico annuale, qualche attività dedicata a giovani e famiglie",
        "Siamo in crescita: segmentazione strutturata, offerta diversificata per fasce d'età, primi format di edutainment",
        "Riferimento: audience development integrata, edutainment e gamification consolidati, co-creazione con pubblici diversi"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Audience development non è «fare più visitatori», ma «costruire relazioni significative con pubblici diversi».",
        "example": "Palazzo Strozzi di Firenze. Il Museo del Novecento di Milano «Studenti del Novecento».",
        "reference": "Audience Development Strategy EU. Falk & Dierking. Musei Sensibili Pilastro II. NEMO Audience Toolkit."
      }
    },
    {
      "code": "D8.2",
      "dimension": "D8",
      "subDimension": "Audience segmentation",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D8.1>=3",
      "text": "Conoscete i vostri pubblici? Avete dati profilati su chi viene al museo, perché viene, con quale frequenza, da dove?",
      "labels": [
        "Stiamo iniziando a riflettere sulla profilazione",
        "Conteggiamo i visitatori totali ma senza segmentazione",
        "Profilazione di base (residenti/turisti, famiglie/individuali)",
        "Profilazione strutturata su fasce d'età, motivazione, frequenza",
        "Profilazione avanzata con CRM, indagini regolari, segmenti comportamentali"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Profilazione: segmentazione anagrafica + motivazionale + comportamentale + preferenze.",
        "example": "Il MUSE di Trento conduce indagini di pubblico annuali. Il MAXXI usa sensori in sala. Palazzo Strozzi ha CRM avanzato.",
        "reference": "NEMO Audience Toolkit. Falk, Identity and the Museum Visitor Experience."
      }
    },
    {
      "code": "D8.3",
      "dimension": "D8",
      "subDimension": "Rapporto scuole",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D8.1>=3",
      "text": "Quali attività dedicate a scuole e giovani (under-25) sono attive nel vostro museo?",
      "options": [
        {
          "value": "didattica_infanzia_primaria",
          "label": "Programma didattico annuale per scuole infanzia/primaria"
        },
        {
          "value": "didattica_secondaria_1",
          "label": "Programma didattico annuale per scuole secondarie di I grado"
        },
        {
          "value": "didattica_secondaria_2",
          "label": "Programma didattico annuale per scuole secondarie di II grado"
        },
        {
          "value": "convenzioni_scuole",
          "label": "Convenzioni quadro con istituti scolastici del territorio"
        },
        {
          "value": "pcto",
          "label": "Percorsi PCTO (Percorsi Competenze Trasversali e Orientamento) attivi"
        },
        {
          "value": "service_learning",
          "label": "Attività di Service Learning con scuole o università"
        },
        {
          "value": "materiali_didattici",
          "label": "Materiali didattici scaricabili gratuitamente sul sito"
        },
        {
          "value": "educativo_digitale_scuole",
          "label": "Programmi educativi digitali (DAD-friendly, in continuità con scuola digitale)"
        },
        {
          "value": "vg_giovani",
          "label": "Visite guidate dedicate a giovani 18-25 con linguaggio peer-to-peer"
        },
        {
          "value": "eventi_giovani",
          "label": "Eventi serali / aperture straordinarie pensate per pubblico giovane"
        },
        {
          "value": "carta_giovani",
          "label": "Tariffa giovani / Carta Cultura / 18app accettate"
        },
        {
          "value": "partnership_universita",
          "label": "Partnership con università locali"
        },
        {
          "value": "formazione_insegnanti",
          "label": "Programmi di formazione per insegnanti"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Chiediamo presenza EFFETTIVA delle attività. I giovani sono pubblico cruciale: investimento sui giovani genera ritorno a 10-20 anni.",
        "example": "Il Museo del Novecento ha PCTO con licei. La GAM di Torino ha «Educare alla bellezza».",
        "reference": "D.M. 113/2018 LL.GG. Linee guida MIM-MIC patti educativi territoriali. Carta Cultura Giovani DPCM 2023."
      }
    },
    {
      "code": "D8.4",
      "dimension": "D8",
      "subDimension": "Edutainment & gamification",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D8.1>=4",
      "text": "Adottate format di edutainment e meccaniche di gamification per coinvolgere il pubblico in modo emotivo e memorabile?",
      "labels": [
        "Stiamo iniziando a esplorare il tema",
        "Una sperimentazione occasionale (es. una caccia al tesoro per famiglie)",
        "Format consolidato in qualche occasione (laboratori interattivi annuali, apps con quiz)",
        "Edutainment integrato nell'offerta regolare (escape room, narrazione interattiva, percorsi adattivi)",
        "Format di riferimento: gamification consolidata, alternate reality games, percorsi narrativi immersivi"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Edutainment: combinazione di educazione ed entertainment. Riferimento: Museum of Dreamers (4 step: stimolo → azione → attivazione → ritenzione).",
        "example": "Il Museum of Dreamers (Roma, Fondazione Leonardo). Il Museo Egizio ha sviluppato escape room «Papiri scomparsi».",
        "reference": "Musei Sensibili Pilastro II. VTS (Yenawine, Housen). Jenkins, Convergence Culture."
      }
    },
    {
      "code": "D8.5",
      "dimension": "D8",
      "subDimension": "Co-creazione",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D8.1>=4",
      "text": "Il pubblico partecipa ai processi di creazione del museo (programmi, contenuti, mostre, comunicazione) o è destinatario passivo di un'offerta predefinita?",
      "labels": [
        "Pubblico destinatario di offerta predefinita, stiamo riflettendo sulla co-creazione",
        "Sperimentazioni occasionali di raccolta input (questionari, suggerimenti)",
        "Co-progettazione con comunità per progetti specifici (singole mostre, programmi pilota)",
        "Co-creazione integrata: advisory board cittadini, gruppi di prossimità, programmi co-progettati regolarmente",
        "Modello partecipativo di riferimento: il pubblico co-cura mostre, contenuti, programmi, comunicazione"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Co-creazione trasforma il visitatore in co-autore: advisory board, mostre co-curate, programmi pilota co-progettati.",
        "example": "Il Museo della Mente di Roma costruisce sezioni espositive in co-progettazione con persone con esperienza di disagio psichico.",
        "reference": "Simon, The Participatory Museum (2010). Musei Sensibili. Bourriaud."
      }
    },
    {
      "code": "D9.1",
      "dimension": "D9",
      "subDimension": "Governance & networks",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è la vostra governance complessiva (struttura, sostenibilità finanziaria, integrazione territoriale, sostenibilità ambientale)?",
      "labels": [
        "Stiamo costruendo le basi della governance e della sostenibilità",
        "Governance di base attiva, sostenibilità finanziaria fragile, alcune partnership territoriali",
        "Governance strutturata, equilibrio finanziario raggiunto, alcune reti attive",
        "Governance professionale, fundraising diversificato, integrazione territoriale strutturata, primi obiettivi ESG",
        "Modello di governance di riferimento: sostenibilità a 360°, ruolo guida nell'ecosistema territoriale"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "La governance non è solo «chi decide» ma il sistema complessivo di guida del museo: organi, processi decisionali, reti, equilibrio finanziario, ESG.",
        "example": "La Fondazione Musei Civici di Venezia. Pinacoteca di Brera-Biblioteca Braidense come Istituto autonomo MIC. SMA Marche, Pesaro Musei.",
        "reference": "ICOM 2022. MIC LL.GG. ambiti Organizzazione e Risorse umane. UN SDGs 2030. NEMO Sustainability Toolkit. D.Lgs 117/2017."
      }
    },
    {
      "code": "D9.2",
      "dimension": "D9",
      "subDimension": "Financial sustainability",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D9.1>=3",
      "text": "Come è strutturata la sostenibilità finanziaria del museo? Le entrate sono diversificate o dipendono fortemente da una sola fonte?",
      "labels": [
        "Dipendiamo principalmente da contributi pubblici annuali, equilibrio fragile",
        "Equilibrio garantito ma con poca diversificazione",
        "Equilibrio raggiunto con 2-3 fonti principali (pubblico + biglietteria + qualche sponsor)",
        "Diversificazione strutturata (4+ fonti)",
        "Fundraising professionale di riferimento: bandi vinti regolarmente, sponsor istituzionali"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Capacità di non dipendere da una sola fonte: contributi pubblici, biglietteria, sponsor, fundraising privato, bandi, proventi accessori.",
        "example": "La Fondazione Brescia Musei. Palazzo Strozzi finanzia il 60% con fundraising privato. Tate Modern ha 5 fonti equilibrate.",
        "reference": "NEMO Sustainability Toolkit. Fondazione Cariplo Cultura sostenibile. Symbola."
      }
    },
    {
      "code": "D9.3",
      "dimension": "D9",
      "subDimension": "Territorial ecosystem",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D9.1>=3",
      "text": "Quali reti, partnership e integrazioni territoriali sono attive per il vostro museo?",
      "options": [
        {
          "value": "sistema_museale",
          "label": "Sistema museale territoriale (MIC o regionale)"
        },
        {
          "value": "biglietti_integrati",
          "label": "Convenzioni con altri musei locali per biglietti integrati"
        },
        {
          "value": "dmo",
          "label": "Partnership con DMO (Destination Management Organisation) regionale o locale"
        },
        {
          "value": "network_internazionali",
          "label": "Adesione a network internazionali (NEMO, ICOM, AAM, MOI!)"
        },
        {
          "value": "tour_operator",
          "label": "Convenzioni con tour operator e agenzie turistiche"
        },
        {
          "value": "universita_ricerca",
          "label": "Partnership stabili con università o centri di ricerca"
        },
        {
          "value": "terzo_settore",
          "label": "Reti con associazioni del Terzo Settore"
        },
        {
          "value": "reti_scuole",
          "label": "Reti con scuole e istituti formativi del territorio"
        },
        {
          "value": "imprese_locali",
          "label": "Partnership con imprese locali (sponsor o servizi)"
        },
        {
          "value": "bandi_europei",
          "label": "Adesione a programmi e bandi europei (Creative Europe, Horizon)"
        },
        {
          "value": "soprintendenza",
          "label": "Coordinamento con Soprintendenza territoriale"
        },
        {
          "value": "circuiti_tematici",
          "label": "Adesione a circuiti culturali tematici"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Il museo non è isola — fa parte di reti territoriali, settoriali, internazionali.",
        "example": "Il MUSE di Trento è in NEMO, ICOM, ECSITE. Pesaro Musei ha integrato sistema museale civico.",
        "reference": "D.M. 113/2018 LL.GG. Sistema Museale Nazionale MIC. NEMO membership."
      }
    },
    {
      "code": "D9.4",
      "dimension": "D9",
      "subDimension": "Environmental & social sustainability",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D9.1>=4",
      "text": "Adottate politiche di sostenibilità ambientale (riduzione consumi, gestione rifiuti, fornitori green) e sociale (inclusione lavorativa, gender balance, welfare aziendale)?",
      "labels": [
        "Stiamo riflettendo sui temi ESG",
        "Alcune azioni occasionali (es. raccolta differenziata)",
        "Policy di base scritte, prime azioni strutturate (LED, riduzione carta)",
        "Policy ESG formalizzata, monitoraggio dei consumi, fornitori selezionati",
        "Bilancio di sostenibilità pubblicato, certificazioni (ISO 14001, EMAS), modello di riferimento"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "ESG = Environmental, Social, Governance. Per i musei: consumi energetici, rifiuti, fornitori green, gender balance, inclusione lavorativa, welfare aziendale, trasparenza.",
        "example": "Il Museo Nazionale Romano (efficientamento energetico). Il MAXXI ha pubblicato bilancio di sostenibilità 2022. Tate Modern net-zero al 2030.",
        "reference": "UN SDGs 2030. NEMO Sustainability Toolkit. MIC Linee guida sostenibilità ambientale luoghi cultura. Standard GRI."
      }
    },
    {
      "code": "D10.1",
      "dimension": "D10",
      "subDimension": "Programmi welfare formalizzati",
      "type": "likert",
      "isGateway": true,
      "activeIf": null,
      "text": "A che punto è il vostro percorso di costruzione del museo come dispositivo relazionale di benessere sociale e di welfare culturale?",
      "labels": [
        "Stiamo iniziando a esplorare il tema del welfare culturale",
        "Alcune attività occasionali di apertura a pubblici fragili (visite per gruppi specifici)",
        "Abbiamo basi consolidate: protocolli formalizzati con almeno 1-2 partner socio-sanitari o educativi",
        "Siamo in crescita: 3-4 programmi continuativi, partnership strutturate, primi indicatori di impatto raccolti",
        "Riferimento di welfare culturale: programma articolato e continuativo, misurazione formale dell'impatto"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Welfare culturale (Cicerchia/Rossi Ghiglione/Seia, Treccani 2020): modello integrato di promozione del benessere e della salute attraverso pratiche fondate su arti visive, performative e patrimonio culturale.",
        "example": "Il Museo della Mente di Roma. Il programma «Musei e Alzheimer» (Capodimonte, Brera, MAXXI). Internazionalmente: «Meet Me at MoMA» dal 2007.",
        "reference": "Cicerchia, Rossi Ghiglione, Seia, Treccani 2020. WHO HEN Synthesis Report 67/2019. CCW Cultural Welfare Center. Manifesto Welfare Culturale. MOI! Museums of Impact."
      }
    },
    {
      "code": "D10.2",
      "dimension": "D10",
      "subDimension": "Programmi welfare formalizzati",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D10.1>=3",
      "text": "Con quali tipologie di partner socio-sanitari ed educativi avete protocolli formali per programmi continuativi di welfare culturale?",
      "options": [
        {
          "value": "ausl",
          "label": "AUSL / ASL / Aziende Sanitarie Locali"
        },
        {
          "value": "rsa",
          "label": "RSA, residenze per anziani, hospice"
        },
        {
          "value": "ospedali",
          "label": "Ospedali (oncologia, geriatria, neuropsichiatria)"
        },
        {
          "value": "alzheimer",
          "label": "Centri diurni Alzheimer e demenze"
        },
        {
          "value": "salute_mentale",
          "label": "Servizi di salute mentale del territorio"
        },
        {
          "value": "scuole_inclusive",
          "label": "Scuole di ogni ordine e grado per programmi inclusivi"
        },
        {
          "value": "carceri",
          "label": "Istituti penitenziari (case circondariali, comunità per minori)"
        },
        {
          "value": "servizi_sociali",
          "label": "Servizi sociali del Comune"
        },
        {
          "value": "migranti_centri",
          "label": "Centri di accoglienza per migranti e richiedenti asilo"
        },
        {
          "value": "terzo_settore_welfare",
          "label": "Associazioni del Terzo Settore di area welfare"
        },
        {
          "value": "cooperative_sociali",
          "label": "Cooperative sociali"
        },
        {
          "value": "associazioni_pazienti",
          "label": "Associazioni di pazienti o caregiver"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "Chiediamo PROTOCOLLI FORMALI per attività CONTINUATIVE. Una visita occasionale non si conta.",
        "example": "Il Museo della Mente di Roma ha protocolli formali con AUSL Roma 5, ASL territoriali, scuole superiori, istituti penitenziari. La Fondazione Brescia Musei ha «Musei e demenze» con ATS Brescia.",
        "reference": "Manifesto Welfare Culturale (Promo PA). CCW Cultural Welfare Center. Convenzioni quadro nazionali MIC-Ministero Salute."
      }
    },
    {
      "code": "D10.3",
      "dimension": "D10",
      "subDimension": "Pubblici fragili",
      "type": "multiselect_compositive",
      "isGateway": false,
      "activeIf": "D10.1>=3",
      "text": "Quali pubblici fragili o vulnerabili sono effettivamente raggiunti dai vostri programmi di welfare culturale?",
      "options": [
        {
          "value": "anziani_autonomi",
          "label": "Anziani autosufficienti (programmi di invecchiamento attivo)"
        },
        {
          "value": "anziani_fragili",
          "label": "Anziani con fragilità o pre-demenza"
        },
        {
          "value": "demenze",
          "label": "Persone con demenze (Alzheimer e simili)"
        },
        {
          "value": "parkinson",
          "label": "Persone con morbo di Parkinson"
        },
        {
          "value": "dis_motorie",
          "label": "Persone con disabilità motorie"
        },
        {
          "value": "dis_sensoriali",
          "label": "Persone con disabilità sensoriali"
        },
        {
          "value": "dis_intellettive",
          "label": "Persone con disabilità intellettive o neurodivergenti"
        },
        {
          "value": "disagio_psichico",
          "label": "Persone con disagio psichico"
        },
        {
          "value": "oncologici",
          "label": "Pazienti oncologici e caregiver"
        },
        {
          "value": "migranti",
          "label": "Migranti e richiedenti asilo"
        },
        {
          "value": "marginalizzazione",
          "label": "Persone in marginalizzazione (homeless, area socio-economica svantaggiata)"
        },
        {
          "value": "detenuti",
          "label": "Detenuti (adulti o minori)"
        },
        {
          "value": "bes_poverta_educativa",
          "label": "Bambini e ragazzi con BES o povertà educativa"
        },
        {
          "value": "donne_emancipazione",
          "label": "Donne in percorsi di emancipazione (es. case rifugio)"
        }
      ],
      "allowOther": true,
      "scoringRule": "normalized_thresholds",
      "scoringThresholds": [
        {
          "selectedRatio": 0,
          "score": 0
        },
        {
          "maxRatio": 0.2,
          "score": 25
        },
        {
          "maxRatio": 0.4,
          "score": 50
        },
        {
          "maxRatio": 0.7,
          "score": 75
        },
        {
          "maxRatio": 1,
          "score": 100
        }
      ],
      "tooltip": {
        "definition": "I 14 pubblici riproducono i 9 vettori della definizione Treccani 2020: invecchiamento attivo, inclusione disabilità, contrasto disuguaglianze, mitigazione degenerative, empowerment marginalizzati, ecc.",
        "example": "Il Museo della Mente raggiunge 10+ pubblici. Il Museo del Tessuto di Prato ha programma con migranti. Il Castello Sforzesco ha «Capolavori da toccare».",
        "reference": "Cicerchia, Rossi Ghiglione, Seia, Treccani 2020 (9 vettori). WHO HEN Report 67/2019. CCW casi studio italiani. ICOM Italia."
      }
    },
    {
      "code": "D10.4",
      "dimension": "D10",
      "subDimension": "Misurazione impatto sociale",
      "type": "likert",
      "isGateway": false,
      "activeIf": "D10.1>=4",
      "text": "Misurate formalmente l'impatto sociale dei vostri programmi di welfare culturale (con framework riconosciuti, indicatori, valutazione partecipativa)?",
      "labels": [
        "Non misuriamo, stiamo riflettendo sul tema",
        "Misurazione di base (numeri di partecipanti, gradimento)",
        "Indicatori strutturati per singolo programma (benessere percepito, partecipazione, ecc.)",
        "Framework riconosciuto adottato (es. MOI! Museums of Impact, SROI, indicatori OMS)",
        "Misurazione integrata e pubblicata: report annuale di impatto, valutazione partecipativa, dato condiviso con stakeholder"
      ],
      "scoring": {
        "1": 0,
        "2": 25,
        "3": 50,
        "4": 75,
        "5": 100
      },
      "tooltip": {
        "definition": "Misurazione oltre il «quanti partecipanti»: indicatori di benessere soggettivo percepito, empowerment, outcome socio-sanitari. Strumenti: MOI!, SROI, indicatori OMS, valutazione partecipativa.",
        "example": "Il MAXXI ha pubblicato primo report di impatto sociale 2022. Il Museo della Mente misura indicatori di benessere percepito condivisi con AUSL. Manchester Museum applica MOI! framework.",
        "reference": "MOI! Museums of Impact (NEMO/Creative Europe 2022). NEF Consulting SROI. Fancourt & Finn (WHO 2019). CCW kit valutazione impatto."
      }
    }
  ],
  "section11": {
    "title": "Auto-prioritizzazione e percezione del bisogno AI",
    "description": "Quattro item finali a risposta predefinita per raccogliere il punto di vista soggettivo del compilatore. Confronto con profilo D1-D10 = dato qualitativo strategico per consulenza.",
    "items": [
      {
        "code": "D11.1",
        "text": "Pensando al vostro museo nei prossimi 12 mesi, quali sono le 3 aree prioritarie su cui vorreste lavorare?",
        "type": "multiselect_max3",
        "options": [
          {
            "value": "D1",
            "label": "D1 Brand & Identity"
          },
          {
            "value": "D2",
            "label": "D2 Collection & Heritage"
          },
          {
            "value": "D3",
            "label": "D3 Facility & Spatial Experience"
          },
          {
            "value": "D4",
            "label": "D4 Program & Cultural Offer"
          },
          {
            "value": "D5",
            "label": "D5 Service & Third Place"
          },
          {
            "value": "D6",
            "label": "D6 Digital Maturity & Tech Integration"
          },
          {
            "value": "D7",
            "label": "D7 Accessibility Radicale (4 livelli)"
          },
          {
            "value": "D8",
            "label": "D8 Audience Engagement & Edutainment"
          },
          {
            "value": "D9",
            "label": "D9 Governance, Sustainability & Territorial Ecosystem"
          },
          {
            "value": "D10",
            "label": "D10 Welfare Culturale & Impatto Sociale"
          }
        ]
      },
      {
        "code": "D11.2",
        "text": "Su queste priorità, ritenete che soluzioni di consulenza digitale e intelligenza artificiale possano darvi un sostegno?",
        "type": "likert",
        "labels": [
          "Non riteniamo prioritario il tema",
          "Curiosità iniziale, vorremmo capire meglio",
          "Interesse moderato",
          "Interesse forte e attivo",
          "Urgenza operativa, stiamo già cercando soluzioni"
        ],
        "scoring": {
          "1": 0,
          "2": 25,
          "3": 50,
          "4": 75,
          "5": 100
        }
      },
      {
        "code": "D11.3",
        "text": "Su quali aspetti specifici l'intelligenza artificiale potrebbe darvi un contributo più rilevante?",
        "type": "multiselect",
        "options": [
          {
            "value": "gestione_interna",
            "label": "Gestione interna (workflow, archivi, automazione amministrativa)"
          },
          {
            "value": "mediazione_visitatori",
            "label": "Mediazione visitatori in sala (chatbot, audioguide AI, contenuti adattivi)"
          },
          {
            "value": "accessibilita_traduzioni",
            "label": "Accessibilità e traduzioni (LIS digitale, multilingua, captioning, E2R automatico)"
          },
          {
            "value": "audience_analytics",
            "label": "Audience analytics (profilazione visitatori, predizione affluenze)"
          },
          {
            "value": "contenuti",
            "label": "Generazione di contenuti (testi, social, materiali educativi)"
          },
          {
            "value": "fundraising_bandi",
            "label": "Fundraising e ricerca bandi (analisi opportunità, redazione candidature)"
          },
          {
            "value": "catalogazione",
            "label": "Catalogazione assistita (riconoscimento immagini, completamento schede)"
          },
          {
            "value": "educativi_gamification",
            "label": "Programmi educativi e gamification (escape room AI-driven, percorsi adattivi)"
          },
          {
            "value": "altro",
            "label": "Altro (specifica)"
          }
        ],
        "allowOther": true
      },
      {
        "code": "D11.4",
        "text": "Cosa vi trattiene oggi dall'introdurre soluzioni digitali avanzate?",
        "type": "multiselect",
        "options": [
          {
            "value": "budget",
            "label": "Disponibilità di budget"
          },
          {
            "value": "competenze",
            "label": "Competenze tecniche interne"
          },
          {
            "value": "tempo",
            "label": "Tempo del personale"
          },
          {
            "value": "diffidenza",
            "label": "Diffidenza verso le nuove tecnologie"
          },
          {
            "value": "normativa",
            "label": "Vincoli normativi e privacy"
          },
          {
            "value": "orientamento",
            "label": "Non sappiamo da dove cominciare"
          },
          {
            "value": "altro",
            "label": "Altro (specifica)"
          }
        ],
        "allowOther": true
      },
      {
        "code": "D11.5",
        "text": "Quanto le risposte fornite riflettono la situazione attuale del vostro museo, secondo la vostra percezione?",
        "type": "likert",
        "labels": [
          "Le abbiamo probabilmente sottostimate",
          "Un po' sottostimate",
          "Aderenti alla realtà",
          "Un po' sovrastimate",
          "Ne abbiamo dato un quadro ottimistico"
        ],
        "note": "Domanda riflessiva, non altera lo scoring grezzo. Coefficiente di auto-calibrazione."
      },
      {
        "code": "D11.6",
        "text": "Per le opportunità di sviluppo che vorreste affrontare, sareste interessati a un supporto Duemilamusei nello scouting di bandi pubblici/privati e nella progettazione candidabile?",
        "type": "likert",
        "labels": [
          "Nessun interesse al momento",
          "Curiosità iniziale, vorremmo capire meglio",
          "Interesse moderato",
          "Interesse forte e attivo",
          "Urgenza operativa, abbiamo già scadenze in vista"
        ],
        "scoring": {
          "1": 0,
          "2": 25,
          "3": 50,
          "4": 75,
          "5": 100
        }
      }
    ]
  },
  "section12": {
    "title": "Follow-up premiale opt-in",
    "description": "Sezione finale facoltativa. Email chiesta solo se almeno una preferenza selezionata. Consenso GDPR esplicito separato.",
    "items": [
      {
        "code": "D12.1",
        "text": "Vuoi ricevere informazioni mirate gratuite? Seleziona i contenuti di interesse:",
        "type": "multiselect",
        "options": [
          {
            "value": "bandi_pnrr_mic",
            "label": "Bandi PNRR e Ministero della Cultura (newsletter mensile dedicata)"
          },
          {
            "value": "bandi_fondazioni",
            "label": "Bandi delle Fondazioni bancarie (Cariplo, Compagnia di San Paolo, ecc.)"
          },
          {
            "value": "bandi_regionali",
            "label": "Bandi Regione Marche (e regioni limitrofe)"
          },
          {
            "value": "bandi_europei",
            "label": "Bandi europei (Creative Europe, Horizon Europe componente cultura)"
          },
          {
            "value": "avvisi_locali",
            "label": "Avvisi pubblici locali e bandi di fondazioni territoriali"
          },
          {
            "value": "casi_studio",
            "label": "Casi studio italiani di trasformazione digitale museale"
          },
          {
            "value": "podcast_tematici",
            "label": "Podcast tematici: welfare culturale · AI · accessibilità · audience · edutainment"
          },
          {
            "value": "webinar",
            "label": "Webinar e corsi gratuiti Duemilamusei"
          },
          {
            "value": "matrix_aggiornamenti",
            "label": "Aggiornamenti sul framework MuseMu Matrix e versioni successive"
          },
          {
            "value": "convegni_eventi",
            "label": "Convegni ed eventi di settore"
          }
        ]
      },
      {
        "code": "D12.2",
        "text": "Email di contatto",
        "type": "email",
        "required": false,
        "conditional": "compilare solo se selezionata almeno una preferenza in D12.1"
      },
      {
        "code": "D12.3",
        "text": "Acconsento al trattamento dei miei dati di contatto per le finalità di follow-up sopra selezionate, ai sensi del Regolamento UE 2016/679. So di poter revocare il consenso in qualunque momento. Il presente consenso non è condizione per ricevere il report di autovalutazione di base.",
        "type": "consent_checkbox",
        "required": false,
        "conditional": "obbligatorio solo se compilata D12.2"
      }
    ]
  },
  "profiles": [
    {
      "code": "P1",
      "name": "Museo Tradizionale",
      "rule": "media tradizionali (D1-D5) > 60 AND media contemporanee (D6-D10) < 40",
      "description": "Profilo solido sui fondamentali tradizionali, all'inizio del percorso di trasformazione contemporanea. Soluzioni prioritarie: introduzione delle prime tecnologie di mediazione digitale, primi protocolli di accessibilità."
    },
    {
      "code": "P2",
      "name": "Museo in Ancoraggio",
      "rule": "default (tutti gli altri casi)",
      "description": "Si trova nella prima fase della roadmap Musei Sensibili. Soluzioni prioritarie: completamento del piano di accessibilità, strutturazione della comunicazione digitale, formazione del personale."
    },
    {
      "code": "P3",
      "name": "Museo in Scalabilità",
      "rule": "media contemporanee (D6-D10) tra 45 e 70",
      "description": "Si trova nella seconda fase della roadmap. Soluzioni prioritarie: format di edutainment e gamification, audience analytics avanzata, primi programmi di welfare culturale formalizzati."
    },
    {
      "code": "P4",
      "name": "Museo Sensibile / Ecosistema",
      "rule": "media complessiva >= 65 AND media contemporanee >= 60",
      "description": "Modello di riferimento del framework Musei Sensibili. Soluzioni prioritarie: AI generativa per contenuti, dashboard di impatto sociale integrata, leadership di network territoriale."
    },
    {
      "code": "P5",
      "name": "Museo a Rischio Performance",
      "rule": "media complessiva < 30",
      "description": "Profilo che richiede intervento consulenziale strutturato e prioritario. Il report è formulato con particolare cura del tono per accompagnare e non scoraggiare."
    }
  ],
  "questionsByDimension": {
    "D1": [
      "D1.1",
      "D1.2",
      "D1.3",
      "D1.4"
    ],
    "D2": [
      "D2.1",
      "D2.2",
      "D2.3",
      "D2.4",
      "D2.5"
    ],
    "D3": [
      "D3.1",
      "D3.2",
      "D3.3",
      "D3.4"
    ],
    "D4": [
      "D4.1",
      "D4.2",
      "D4.3",
      "D4.4"
    ],
    "D5": [
      "D5.1",
      "D5.2",
      "D5.3",
      "D5.4"
    ],
    "D6": [
      "D6.1",
      "D6.2",
      "D6.3",
      "D6.4"
    ],
    "D7": [
      "D7.1",
      "D7.2",
      "D7.3",
      "D7.4",
      "D7.5"
    ],
    "D8": [
      "D8.1",
      "D8.2",
      "D8.3",
      "D8.4",
      "D8.5"
    ],
    "D9": [
      "D9.1",
      "D9.2",
      "D9.3",
      "D9.4"
    ],
    "D10": [
      "D10.1",
      "D10.2",
      "D10.3",
      "D10.4"
    ]
  },
  "gatewayQuestions": [
    "D1.1",
    "D2.1",
    "D3.1",
    "D4.1",
    "D5.1",
    "D6.1",
    "D7.1",
    "D8.1",
    "D9.1",
    "D10.1"
  ]
};
