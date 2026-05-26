// ==================================================================
// ScannerBandi.gs - Scanner automatico bandi e contenuti culturali
// Osservatorio Culturale - Duemilamusei / Silvano Straccini
// v4.0 - Riscrittura pulita - Aprile 2026
// ==================================================================

const ANTHROPIC_API_URL  = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_KEY_PROP = 'CLAUDE_API_KEY';

const REGIONI_PRIORITARIE = ['Marche','Umbria','Puglia','Sardegna','Emilia-Romagna'];

const SETTORI_INTERESSE = [
  'musei','pinacoteche','luoghi della cultura','patrimonio culturale',
  'beni culturali','turismo culturale','turismo sostenibile',
  'valorizzazione','borghi storici','digitalizzazione cultura',
  'piattaforme digitali cultura','reti museali','reti culturali',
  'sviluppo territoriale','DMO','destination management',
  'restauro','patrimonio immateriale','accessibilita culturale',
  'Interreg','Creative Europe','Europa Creativa',
  'intelligenza artificiale cultura','AI musei','AI patrimonio',
];

// ==================================================================
// FONTI BANDI - 35 URL in 6 categorie
// ==================================================================

// ====================================================================
// AUDIT FONTI 2026-05-15: 30/46 fonti silenti (mai prodotto bandi).
// Causa principale: siti JS-rendered → UrlFetchApp riceve HTML senza contenuto.
// Strategia: mantenere fonti raggiungibili (HTTP 200 + >10KB), commentare le irrecuperabili.
// Le fonti istituzionali (MiC, Regioni) sono raggiungibili ma il contenuto è caricato via JS.
// Piano: Fase 1 Agenti → sostituire con RSS feed o scan Gmail come workaround.
// ====================================================================

const FONTI_MINISTERI = [
  // SILENTE ma raggiungibile (126KB HTML, 162 link) — contenuto JS-rendered, link presenti in HTML statico
  { nome:'MiC - Bandi e Concorsi',       url:'https://cultura.gov.it/comunicati/bandi-e-concorsi',                                 livello:'Nazionale', ente_default:'MiC - Ministero della Cultura',  url_ente:'https://cultura.gov.it', priorita:1 },
  // SILENTE ma raggiungibile (126KB, 162 link) — stessa struttura di sopra
  { nome:'MiC - Avvisi',                  url:'https://cultura.gov.it/comunicati/avvisi',                                           livello:'Nazionale', ente_default:'MiC - Ministero della Cultura',  url_ente:'https://cultura.gov.it', priorita:1 },
  // SILENTE ma raggiungibile (367KB, 329 link) — contenuto ricco, potenzialmente estraibile con prompt migliorato
  { nome:'Ministero del Turismo - Bandi', url:'https://www.ministeroturismo.gov.it/bandi/',                                         livello:'Nazionale', ente_default:'Ministero del Turismo',          url_ente:'https://www.ministeroturismo.gov.it', priorita:1 },
  // SILENTE — probabilmente JS-rendered (WordPress con caricamento dinamico)
  { nome:'ANCI - Bandi e Opportunita',    url:'https://www.anci.it/categorie/bandi-e-concorsi/',                                    livello:'Nazionale', ente_default:'ANCI',                           url_ente:'https://www.anci.it', priorita:2 },
  // SILENTE — JS-rendered (React SPA)
  { nome:'Italia Domani - PNRR',          url:'https://www.italiadomani.gov.it/it/opportunita/bandi-amministrazioni-titolari.html', livello:'Nazionale', ente_default:'PNRR - Italia Domani',           url_ente:'https://www.italiadomani.gov.it', priorita:2 },
  // SILENTE — URL generico (non pagina bandi dedicata)
  { nome:'Invitalia - Bandi Cultura',     url:'https://www.invitalia.it/cosa-facciamo/rafforziamo-le-imprese',                      livello:'Nazionale', ente_default:'Invitalia',                      url_ente:'https://www.invitalia.it', priorita:2 },
];

const FONTI_REGIONI = [
  { nome:'Regione Marche - Bandi',      url:'https://www.regione.marche.it/Entra-in-Regione/Bandi',                                 livello:'Regionale', ente_default:'Regione Marche',                 url_ente:'https://www.regione.marche.it', priorita:1 },
  { nome:'Regione Marche - Turismo',    url:'https://www.regione.marche.it/Regione-Utile/Turismo/Bandi-e-finanziamenti',           livello:'Regionale', ente_default:'Regione Marche - Turismo',       url_ente:'https://www.regione.marche.it', priorita:1 },
  { nome:'Regione Marche - Cultura',    url:'https://www.regione.marche.it/Regione-Utile/Cultura/Bandi-di-finanziamento',           livello:'Regionale', ente_default:'Regione Marche - Cultura',       url_ente:'https://www.regione.marche.it', priorita:1 },
  { nome:'Regione Umbria - Bandi',      url:'https://www.regione.umbria.it/avvisi',                                                  livello:'Regionale', ente_default:'Regione Umbria',                 url_ente:'https://www.regione.umbria.it', priorita:1 },
  // NB v4.13.1 - rimosso "Regione Puglia - Turismo" perche' URL precedente 404 e categoria specifica non esiste piu' in portale.
  // I bandi turismo Puglia sono comunque indicizzati dalla voce "Regione Puglia - Bandi" piu sotto e da PUGLIAPROMOZIONE.
  { nome:'PugliaPromozione - Bandi',    url:'https://www.agenziapugliapromozione.it/portal/bandi-e-avvisi',                          livello:'Regionale', ente_default:'PugliaPromozione',               url_ente:'https://www.agenziapugliapromozione.it', priorita:2 },
  // v4.18.55 — Disattivata: HTTP 404 confermato audit 2026-05-15. Bandi Puglia coperti da "Regione Puglia - Bandi" e PUGLIAPROMOZIONE.
  // { nome:'Regione Puglia - Cultura',    url:'https://www.regione.puglia.it/web/cultura/avvisi-e-bandi',                             livello:'Regionale', ente_default:'Regione Puglia - Cultura',       url_ente:'https://www.regione.puglia.it', priorita:1 },
  { nome:'Regione Puglia - Bandi',      url:'https://www.regione.puglia.it/web/portale-bandi/home',                                 livello:'Regionale', ente_default:'Regione Puglia',                 url_ente:'https://www.regione.puglia.it', priorita:1 },
  { nome:'PUGLIAPROMOZIONE',            url:'https://www.pugliapromozione.it/bandi-e-avvisi/',                                      livello:'Regionale', ente_default:'PUGLIAPROMOZIONE',               url_ente:'https://www.pugliapromozione.it', priorita:1 },
  { nome:'Puglia Capitale Sociale',     url:'https://www.sistema.puglia.it/portal/page/portal/SistemaPuglia/BandiAvvisi',           livello:'Regionale', ente_default:'Regione Puglia - Politiche Sociali', url_ente:'https://www.sistema.puglia.it', priorita:2 },
  { nome:'Regione Sardegna - Cultura',  url:'https://www.regione.sardegna.it/j/v/2552?s=1&v=9&c=25&na=1&n=10',                     livello:'Regionale', ente_default:'Regione Sardegna',               url_ente:'https://www.regione.sardegna.it', priorita:1 },
  { nome:'Emilia-Romagna - Patrimonio', url:'https://patrimonioculturale.regione.emilia-romagna.it/leggi-atti-bandi/avvisi-e-bandi',livello:'Regionale', ente_default:'Regione Emilia-Romagna',         url_ente:'https://www.regione.emilia-romagna.it', priorita:1 },
  { nome:'ART-ER Emilia-Romagna',       url:'https://first.art-er.it/news',                                                         livello:'Regionale', ente_default:'ART-ER',                         url_ente:'https://art-er.it', priorita:2 },
];

const FONTI_UE = [
  { nome:'Europa Creativa - Desk Italia',  url:'https://europacreativa.cultura.gov.it/',                                           livello:'EU', ente_default:'Europa Creativa / EACEA',        url_ente:'https://europacreativa.cultura.gov.it', priorita:1 },
  { nome:'EuropaFacile - Europa Creativa', url:'https://www.europafacile.net/bandi/programma?programma_nid=50843',                 livello:'EU', ente_default:'Europa Creativa',                url_ente:'https://www.europafacile.net', priorita:1 },
  { nome:'Progettare in Europa',           url:'https://www.progettareineuropa.com/',                                              livello:'EU', ente_default:'Vari UE',                        url_ente:'https://www.progettareineuropa.com', priorita:2 },
  { nome:'Europa Innovazione - Cultura',   url:'https://www.europainnovazione.com/bandi-europei/',                                 livello:'EU', ente_default:'Vari UE',                        url_ente:'https://www.europainnovazione.com', priorita:2 },
  { nome:'Obiettivo Europa - Arte',        url:'https://www.obiettivoeuropa.com/bandi/aperti/settore/arte-e-cultura/pagina/1/',    livello:'EU', ente_default:'Vari UE',                        url_ente:'https://www.obiettivoeuropa.com', priorita:2 },
];

const FONTI_AGGREGATORI = [
  { nome:'ContributiRegione - Cultura',   url:'https://bandi.contributiregione.it/settore-attivita/cultura',     livello:'Vari', ente_default:'Vari', url_ente:'https://bandi.contributiregione.it', priorita:1 },
  { nome:'ContributiRegione - Turismo',   url:'https://bandi.contributiregione.it/settore-attivita/turismo',     livello:'Vari', ente_default:'Vari', url_ente:'https://bandi.contributiregione.it', priorita:1 },
  { nome:'ContributiRegione - Marche',    url:'https://bandi.contributiregione.it/regione/marche',               livello:'Regionale', ente_default:'Regione Marche', url_ente:'https://bandi.contributiregione.it', priorita:1 },
  { nome:'Granter - Arte Cultura Musei',  url:'https://granter.it/cerca-bandi/arte-cultura-musei-monumenti/',   livello:'Vari', ente_default:'Vari', url_ente:'https://granter.it', priorita:1 },
  { nome:'IndiceBandi - Cultura',         url:'https://www.indicebandi.it/it/categoria/cultura-arte-e-spettacolo', livello:'Vari', ente_default:'Vari', url_ente:'https://www.indicebandi.it', priorita:2 },
  { nome:'Europa Innovazione - Nazionali',url:'https://www.europainnovazione.com/bandi-nzl-prova/',              livello:'Vari', ente_default:'Vari', url_ente:'https://www.europainnovazione.com', priorita:2 },
];

const FONTI_FONDAZIONI = [
  { nome:'Fondazione Marche Cultura',    url:'https://www.fondazionemarchecultura.it/',                                           livello:'Fondazione', ente_default:'Fondazione Marche Cultura', url_ente:'https://www.fondazionemarchecultura.it', priorita:1 },
  { nome:'Fondazione con il Sud',        url:'https://www.fondazioneconilsud.it/',                                                livello:'Fondazione', ente_default:'Fondazione con il Sud',     url_ente:'https://www.fondazioneconilsud.it', priorita:2 },
  { nome:'Fondazione Cariplo - Cultura', url:'https://www.fondazionecariplo.it/it/cosa-facciamo/arte-e-cultura.html',            livello:'Fondazione', ente_default:'Fondazione Cariplo',         url_ente:'https://www.fondazionecariplo.it', priorita:2 },
  { nome:'Wikimedia Italia - Musei',     url:'https://www.wikimedia.it/cosa-facciamo/partnership/bando-musei-archivi-biblioteche/', livello:'Fondazione', ente_default:'Wikimedia Italia',       url_ente:'https://www.wikimedia.it', priorita:3 },
];

const FONTI_RIVISTE = [
  { nome:'Il Giornale delle Fondazioni', url:'https://www.ilgiornaledellefondazioni.com/bandi',                  livello:'Rivista', ente_default:'Vari (da rivista)', url_ente:'https://www.ilgiornaledellefondazioni.com', priorita:2 },
  { nome:'Artribune - Bandi',            url:'https://www.artribune.com/tag/bandi/',                             livello:'Rivista', ente_default:'Vari (da rivista)', url_ente:'https://www.artribune.com', priorita:2 },
  { nome:'Tafter Journal',               url:'https://www.tafterjournal.it/',                                    livello:'Rivista', ente_default:'Vari (da rivista)', url_ente:'https://www.tafterjournal.it', priorita:3 },
];

// Sprint G (2026-05-03): fonti associazioni e reti istituzionali musei/cultura
const FONTI_ASSOCIAZIONI = [
  { nome:'ICOM Italia - Opportunità',       url:'https://www.icom-italia.org/categoria/avvisi-e-bandi/',      livello:'Associazione', ente_default:'ICOM Italia',         url_ente:'https://www.icom-italia.org', priorita:1 },
  { nome:'Federculture - Bandi',            url:'https://www.federculture.it/categoria/bandi/',               livello:'Associazione', ente_default:'Federculture',        url_ente:'https://www.federculture.it', priorita:1 },
  { nome:'Fondazione Symbola - Bandi',      url:'https://symbola.net/approfondimento/bandi-e-opportunita/',   livello:'Fondazione',   ente_default:'Fondazione Symbola',  url_ente:'https://symbola.net', priorita:1 },
  { nome:'Fondazione Symbola - Notizie',    url:'https://symbola.net/approfondimento/notizie/',               livello:'Fondazione',   ente_default:'Fondazione Symbola',  url_ente:'https://symbola.net', priorita:2 },
  { nome:'MAB Italia - Bandi',              url:'https://www.mab-italia.org/attivita/bandi-e-concorsi/',      livello:'Associazione', ente_default:'MAB Italia',          url_ente:'https://www.mab-italia.org', priorita:2 },
  { nome:'AMACI - Opportunità',             url:'https://www.amaci.org/bandi/',                               livello:'Associazione', ente_default:'AMACI',               url_ente:'https://www.amaci.org', priorita:2 },
  { nome:'Fondazione Fitzcarraldo',         url:'https://www.fitzcarraldo.it/ricerca/bandi/',                 livello:'Fondazione',   ente_default:'Fondazione Fitzcarraldo', url_ente:'https://www.fitzcarraldo.it', priorita:2 },
  { nome:'Fondazione Compagnia di San Paolo',url:'https://www.compagniadisanpaolo.it/it/bandi-e-concorsi/',  livello:'Fondazione',   ente_default:'Compagnia di San Paolo', url_ente:'https://www.compagniadisanpaolo.it', priorita:2 },
  { nome:'NEMO - European Museum Network',  url:'https://www.ne-mo.org/agenda/calls-for-proposals.html',     livello:'EU',           ente_default:'NEMO',                url_ente:'https://www.ne-mo.org', priorita:3 },
  { nome:'MuseumNext - Opportunities',      url:'https://www.museumnext.com/opportunities/',                  livello:'Internazionale', ente_default:'MuseumNext',        url_ente:'https://www.museumnext.com', priorita:3 },
];

const TUTTE_LE_FONTI_BANDI = [
  ...FONTI_MINISTERI, ...FONTI_REGIONI, ...FONTI_UE,
  ...FONTI_AGGREGATORI, ...FONTI_FONDAZIONI, ...FONTI_RIVISTE,
  ...FONTI_ASSOCIAZIONI,
];

// ==================================================================
// FONTI ARTICOLI ARTE - RSS verificati
// ==================================================================

const FONTI_ARTICOLI_ARTE = [
  { nome:'Exibart',              url:'https://www.exibart.com/feed/',             ambito:'Arte Contemporanea', priorita:1 },
  { nome:'Flash Art Italia',     url:'https://flash---art.it/feed/',              ambito:'Arte Contemporanea', priorita:1 },
  { nome:'ATP Diary',            url:'https://www.atpdiary.com/feed/',            ambito:'Arte Contemporanea', priorita:1 },
  { nome:'Artuu Magazine',       url:'https://www.artuu.it/feed/',                ambito:'Mostre & Arte',      priorita:1 },
  { nome:'ArtsLife',             url:'https://www.artslife.com/feed/',            ambito:'Arte Contemporanea', priorita:2 },
  { nome:'Collezione da Tiffany',url:'https://collezionedatiffany.com/feed/',     ambito:'Arte & Mercato',     priorita:2 },
  { nome:'Colossal',             url:'https://www.thisiscolossal.com/feed/',      ambito:'Arte Contemporanea', priorita:2 },
  { nome:'My Modern Met',        url:'https://mymodernmet.com/feed/',             ambito:'Arte & Design',      priorita:2 },
  { nome:'ArtNews',              url:'https://www.artnews.com/feed/',             ambito:'Arte & Mercato',     priorita:2 },
  { nome:'Artforum',             url:'https://www.artforum.com/feed/',            ambito:'Arte Contemporanea', priorita:3 },
];

// ==================================================================
// FONTI AI PER LA CULTURA - RSS verificati
// ==================================================================

const FONTI_AI_CULTURA = [
  { nome:'Agenda Digitale',      url:'https://www.agendadigitale.eu/feed/',        ambito:'AI & Cultura', priorita:1 },
  { nome:'We Make Money Not Art',url:'https://we-make-money-not-art.com/feed/',    ambito:'AI & Arte',    priorita:1 },
  { nome:'MIT Technology Review',url:'https://www.technologyreview.com/feed/',     ambito:'AI & Cultura', priorita:2 },
  { nome:'AI News Italia',       url:'https://ainews.it/feed/',                    ambito:'AI & Cultura', priorita:2 },
  { nome:'FrizziFrizzi Arte',    url:'https://www.frizzifrizzi.it/category/arte/feed/', ambito:'Arte & Design', priorita:2 },
  { nome:'Artspecialday',        url:'https://www.artspecialday.com/feed/',         ambito:'Arte & Cultura', priorita:3 },
];

// Sprint G (2026-05-03): fonti istituzionali musei/cultura (ICOM, Federculture, Symbola + rete)
// RSS feeds per monitoraggio notizie (usato da scanSources via foglio Fonti)
const FONTI_NEWS_ISTITUZIONALI = [
  { nome:'ICOM Italia',             url:'https://www.icom-italia.org/feed/',                  ambito:'Musei & Patrimonio',    priorita:1 },
  { nome:'Federculture',            url:'https://www.federculture.it/feed/',                  ambito:'Politiche Culturali',   priorita:1 },
  { nome:'Fondazione Symbola',      url:'https://symbola.net/feed/',                          ambito:'Governance & Cultura',  priorita:1 },
  { nome:'Fondazione Fitzcarraldo', url:'https://www.fitzcarraldo.it/feed/',                  ambito:'Gestione Culturale',    priorita:2 },
  { nome:'MuseumNext',              url:'https://www.museumnext.com/feed/',                   ambito:'Innovazione Museale',   priorita:2 },
  { nome:'Artribune',               url:'https://www.artribune.com/feed/',                    ambito:'Arte & Mostre',         priorita:1 },
  { nome:'Il Giornale delle Fondazioni', url:'https://www.ilgiornaledellefondazioni.com/feed/', ambito:'Politiche Culturali', priorita:2 },
  { nome:'Doppiozero Cultura',      url:'https://www.doppiozero.com/feed',                    ambito:'Cultura & Società',     priorita:2 },
  { nome:'Tafter Journal',          url:'https://www.tafterjournal.it/feed/',                 ambito:'Gestione Culturale',    priorita:2 },
  { nome:'Patrimonio Culturale ER', url:'https://patrimonioculturale.regione.emilia-romagna.it/feed', ambito:'Musei & Patrimonio', priorita:2 },
  // Sprint N1 (2026-05-05): nuove fonti news cultura
  { nome:'Finestre sull\'Arte',     url:'https://www.finestresullarte.info/feed',                    ambito:'Arte & Mostre',         priorita:1 },
  { nome:'Exibart',                 url:'https://www.exibart.com/feed/',                             ambito:'Arte & Mostre',         priorita:1 },
  { nome:'Il Giornale dell\'Arte',  url:'https://www.ilgiornaledellarte.com/feed/',                  ambito:'Arte & Mostre',         priorita:1 },
  { nome:'FAI - Fondo Ambiente',    url:'https://www.fondoambiente.it/feed/',                        ambito:'Musei & Patrimonio',    priorita:1 },
  { nome:'MiC Comunicati',          url:'https://comunicati.cultura.gov.it/feed/',                   ambito:'Politiche Culturali',   priorita:1 },
  { nome:'The Art Newspaper',       url:'https://www.theartnewspaper.com/feed',                      ambito:'Arte & Mostre',         priorita:2 },
  { nome:'Treccani Magazine',       url:'https://www.treccani.it/magazine/feed/',                    ambito:'Cultura & Società',     priorita:2 },
  { nome:'Apollo Magazine',         url:'https://www.apollo-magazine.com/feed/',                     ambito:'Arte & Mostre',         priorita:2 },
  { nome:'AIB Associazione Bibl.',  url:'https://www.aib.it/feed/',                                  ambito:'Gestione Culturale',    priorita:2 },
  { nome:'Touring Club Italiano',   url:'https://www.touringclub.it/feed/',                          ambito:'Musei & Patrimonio',    priorita:2 },
];

// ==================================================================
// FONTI PODCAST CULTURALI - RSS verificati
// ==================================================================

// NOTA: usare solo feed Spreaker in formato show/ID (NON user/ID — DNS error da GAS).
// I feed RAI (raiplaysound.it) bloccano le IP di Google usate da GAS.
// Formato verificato: https://www.spreaker.com/show/SHOWID/episodes/feed
const FONTI_PODCAST = [
  // Priorità 1 — Spreaker show-feed verificati
  { nome:'Giuditta - Storia Arte',        url:'https://www.spreaker.com/show/4545413/episodes/feed', tematica:'Arte & Mostre',        priorita:1 },
  { nome:'Artribune Podcast',             url:'https://www.spreaker.com/show/4281664/episodes/feed', tematica:'Arte & Mostre',        priorita:1 },
  { nome:'Storia dell\'Arte - Gaudio',    url:'https://www.spreaker.com/show/3293837/episodes/feed', tematica:'Arte & Mostre',        priorita:1 },
  { nome:'Art and Talk - Il podcast',     url:'https://www.spreaker.com/show/3208447/episodes/feed', tematica:'Arte & Mostre',        priorita:1 },
  { nome:'Le Comari dell\'Arte',          url:'https://www.spreaker.com/show/5806902/episodes/feed', tematica:'Arte & Mostre',        priorita:1 },
  // Priorità 2 — scansione alternata (settimane pari)
  { nome:'Ad Arti Spiegate',              url:'https://www.spreaker.com/show/4287650/episodes/feed', tematica:'Arte & Mostre',        priorita:2 },
  { nome:'Fondazione Golinelli',          url:'https://podcasts-audio.fondazionegolinelli.it/podcast/fondazionegolinelli.xml', tematica:'Innovazione', priorita:2 },
];

// ==================================================================
// PROMPT AI v4.0 - estrae url_bando E url_ente
// ==================================================================

function buildPromptBandi(testo, nomeFonte, urlFonte) {
  return 'Sei un esperto di finanza agevolata per cultura, musei e turismo in Italia e in Europa.\n\nAnalizza il testo estratto da "' + nomeFonte + '" e individua ESCLUSIVAMENTE bandi pertinenti per:\n- Musei, pinacoteche, luoghi della cultura, reti museali\n- Turismo culturale, borghi storici, turismo sostenibile\n- Patrimonio culturale, digitalizzazione, reti culturali, DMO, restauro\n- Intelligenza artificiale applicata a musei, valorizzazione, accessibilita culturale\n\nREGIONI PRIORITARIE: Marche, Umbria, Puglia, Sardegna, Emilia-Romagna\n\n=== FORMATO INPUT IMPORTANTE (v4.12.3) ===\nNel testo qui sotto i link reali dei bandi sono mantenuti nel formato:\n  Titolo del bando [URL: https://...]\n\nDEVI cercare il marker "[URL: ...]" che segue (o e vicino a) il titolo del bando e usarlo come "url_bando".\nQuesto e fondamentale: NON usare la url della pagina lista come url_bando se trovi un link specifico al bando nel testo.\n\nPer ogni bando trovato restituisci questo JSON:\n{\n  "titolo": "nome completo del bando (senza il marker [URL:...])",\n  "ente": "nome ente erogatore",\n  "livello": "Nazionale|Regionale|EU|Fondazione|PNRR",\n  "regione": "nome regione oppure Tutte",\n  "settore": "Musei|Turismo|Valorizzazione|Borghi|Digitale Cultura|Restauro|Sviluppo Territoriale|Patrimonio Immateriale|Reti Culturali|DMO|AI Cultura",\n  "soggetti": "Comune-PA|Museo|Impresa|No-profit|Fondazione|GAL|DMO|Tutti",\n  "importo": 100000,\n  "cofin": 20,\n  "scadenza": "yyyy-mm-dd",\n  "url_bando": "URL diretto alla pagina del bando estratto dal marker [URL:...] vicino al titolo. Se proprio nessun link specifico: usa ' + (urlFonte||'') + '",\n  "url_ente": "URL homepage istituzionale dell ente (NON l aggregatore). Se non trovato: stringa vuota",\n  "priorita_regionale": true,\n  "sommario": "Sintesi del bando in 2-3 frasi: cosa finanzia, chi puo partecipare, importo/percentuale, scadenza se nota. Max 350 caratteri.",\n  "note": "nota strategica max 100 caratteri"\n}\n\nREGOLE:\n1. url_bando deve preferire il marker [URL: X] vicino al titolo del bando. Solo come ULTIMO fallback usa "' + (urlFonte||'') + '"\n2. Solo bandi con scadenza futura o sportello aperto\n3. Escludi concorsi per assunzioni e appalti lavori\n4. Se non trovi nulla: []\n5. Restituisci SOLO il JSON array, niente testo prima o dopo\n\nTESTO:\n' + testo;
}

// ==================================================================
// SCANNER PRINCIPALE BANDI
// ==================================================================

function scanBandiAutomatico() {
  var apiKey = PropertiesService.getScriptProperties().getProperty(ANTHROPIC_KEY_PROP);
  if (!apiKey) {
    Logger.log('ERR API Key mancante');
    sendTelegram('! *OSSERVATORIO* - Scanner bandi non avviato. Manca API key.');
    return { totalNuovi:0, fonti:[], errori:0 };
  }

  var sheet = getSheetRadar();
  var bandiEsistenti = getBandiRadar();
  var titoliEsistenti = bandiEsistenti.map(function(b) { return normalizzaBandi(b.titolo); });
  var totalNuovi = 0;
  var riepilogo = [];
  var errori = 0;

  var oggi = new Date();
  var settimanaAnno = getWeekNumberBandi(oggi);
  var primoLunediMese = oggi.getDate() <= 7;

  var fontiAttive = TUTTE_LE_FONTI_BANDI.filter(function(f) {
    if (f.priorita === 1) return true;
    if (f.priorita === 2) return settimanaAnno % 2 === 0;
    if (f.priorita === 3) return primoLunediMese;
    return false;
  });

  Logger.log('=== SCAN BANDI AUTOMATICO v4.0 ===');
  Logger.log('Fonti attive: ' + fontiAttive.length + '/' + TUTTE_LE_FONTI_BANDI.length);

  fontiAttive.forEach(function(fonte) {
    try {
      Logger.log(' ' + fonte.nome);
      var risposta = UrlFetchApp.fetch(fonte.url, {
        muteHttpExceptions:true, followRedirects:true, deadline:8,
        headers:{'User-Agent':'Mozilla/5.0 (compatible; OsservatorioRadarBandi/4.0)'},
      });
      if (risposta.getResponseCode() !== 200) {
        Logger.log('  ! HTTP ' + risposta.getResponseCode());
        return;
      }
      // v4.12.3: passa baseUrl per risolvere href relativi → estrazione URL bandi corretta
      var testo = pulisciHtmlBandi(risposta.getContentText(), fonte.url).slice(0, 12000);
      if (testo.length < 200) { Logger.log('  -> Pagina vuota'); return; }
      var bandi = estraiConClaudeBandi(buildPromptBandi(testo, fonte.nome, fonte.url), apiKey);
      if (bandi && bandi.length > 0) {
        var nuovi = salvaNewBandi(sheet, bandi, fonte, titoliEsistenti);
        totalNuovi += nuovi;
        riepilogo.push({ fonte:fonte.nome, nuovi:nuovi });
        Logger.log('  OK ' + nuovi + ' nuovi bandi');
      } else {
        Logger.log('  -> Nessun bando pertinente');
      }
      Utilities.sleep(2000);
    } catch(e) {
      Logger.log('  ERR ' + e.message);
      errori++;
    }
  });

  try {
    Logger.log(' Gmail scan bandi...');
    var bandiGmail = scanGmailBandi(apiKey);
    if (bandiGmail && bandiGmail.length > 0) {
      var nuoviGmail = salvaNewBandi(sheet, bandiGmail, { nome:'Gmail', livello:'Vari', ente_default:'Da newsletter', url_ente:'' }, titoliEsistenti);
      totalNuovi += nuoviGmail;
      riepilogo.push({ fonte:'Gmail', nuovi:nuoviGmail });
    }
  } catch(e) { Logger.log('  ERR Gmail: ' + e.message); errori++; }

  Logger.log('=== SCAN COMPLETATO - ' + totalNuovi + ' nuovi bandi, ' + errori + ' errori ===');
  return { totalNuovi:totalNuovi, fonti:riepilogo, errori:errori };
}

// ==================================================================
// CHIAMATA CLAUDE API
// ==================================================================

function estraiConClaudeBandi(prompt, apiKey) {
  try {
    var risposta = UrlFetchApp.fetch(ANTHROPIC_API_URL, {
      method:'post', muteHttpExceptions:true,
      headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','content-type':'application/json'},
      payload:JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:2500, messages:[{role:'user',content:prompt}] }),
    });
    var dati = JSON.parse(risposta.getContentText());
    if (dati.error) { Logger.log('  ! Claude: ' + dati.error.message); return []; }
    if (!dati.content || !dati.content[0]) return [];
    var match = dati.content[0].text.trim().match(/\[[\s\S]*\]/);
    if (!match) return [];
    var parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) { Logger.log('  ERR Claude API: ' + e.message); return []; }
}

// ==================================================================
// GMAIL SCAN
// ==================================================================

function scanGmailBandi(apiKey) {
  var settimanaFa = new Date();
  settimanaFa.setDate(settimanaFa.getDate() - 8);
  var dataStr = Utilities.formatDate(settimanaFa, 'Europe/Rome', 'yyyy/MM/dd');
  var query = 'after:' + dataStr + ' (bando OR avviso OR finanziamento OR "fondo perduto" OR contributo) (cultura OR musei OR turismo OR "patrimonio culturale" OR borghi) (-is:sent -is:draft)';
  var threads = GmailApp.search(query, 0, 20);
  if (!threads.length) return [];
  var corpus = '';
  threads.slice(0, 10).forEach(function(thread) {
    var msg = thread.getMessages()[0];
    corpus += '\n\n[EMAIL: ' + msg.getSubject() + ']\n' + msg.getPlainBody().slice(0, 2000);
  });
  if (!corpus.trim()) return [];
  return estraiConClaudeBandi(buildPromptBandi(corpus.slice(0, 10000), 'Gmail', ''), apiKey);
}

// ==================================================================
// SALVATAGGIO BANDI v4.0
// ==================================================================

function salvaNewBandi(sheet, bandi, fonte, titoliEsistenti) {
  var count = 0;
  bandi.forEach(function(b) {
    if (!b.titolo || b.titolo.length < 8) return;
    var titoloNorm = normalizzaBandi(b.titolo);
    if (titoliEsistenti.some(function(t) { return somiglianzaBandi(t, titoloNorm) > 0.72; })) return;
    var prioritaColore = b.priorita_regionale ? 'arancio' : 'blu';
    var urlBando = b.url_bando || b.link || '';
    var urlEnte  = b.url_ente  || fonte.url_ente || '';
    // v5.1: scrivi in formato Bandi_v5 (26 colonne)
    var id = 'SB' + Date.now() + Math.random().toString(36).substring(2, 4);
    var riga = [
      id,                          // 1: ID
      '',                          // 2: Fingerprint
      new Date(),                  // 3: DataRilevamento
      b.titolo,                    // 4: Titolo
      b.ente || fonte.ente_default, // 5: Ente
      b.livello || fonte.livello || 'Nazionale', // 6: Livello
      b.regione || 'Tutte',       // 7: Regione
      b.settore || 'Valorizzazione', // 8: Settore
      b.soggetti || '',            // 9: Soggetti
      b.importo || '',             // 10: Importo
      b.cofin || '',               // 11: Cofin
      b.scadenza ? new Date(b.scadenza) : '', // 12: Scadenza
      'ScannerBandi',              // 13: FonteID
      fonte.nome,                  // 14: FonteNome
      urlBando,                    // 15: UrlBando
      urlEnte,                     // 16: UrlEnte
      '',                          // 17: UrlValidato
      '',                          // 18: DataValidazione
      (b.note || ''),              // 19: Sommario
      '',                          // 20: Ambito
      b.priorita_regionale ? 'si' : '', // 21: PrioritaRegionale
      'Nuovo',                     // 22: Status
      'attivo',                    // 23: StatoRecord
      false,                       // 24: Letto
      false,                       // 25: Salvato
      '[auto:' + fonte.nome + ']'  // 26: Note
    ];
    sheet.appendRow(riga);
    titoliEsistenti.push(titoloNorm);
    count++;

    // v4.18.55 — ROC triage automatico: valuta se il bando è candidabile per outreach musei
    try {
      if (typeof roc_triageBando === 'function') {
        roc_triageBando({
          titolo: b.titolo,
          ente: b.ente || fonte.ente_default,
          settore: b.settore || 'Valorizzazione',
          importo: b.importo || 0,
          scadenza: b.scadenza || '',
          livello: b.livello || fonte.livello || '',
          url_bando: urlBando,
          sommario: b.sommario || b.note || ''
        });
      }
    } catch(eRoc) { /* non bloccante */ }
  });
  return count;
}

// RIMOSSA lunediMattina v4.0 il 2026-04-28 — sostituita dalla v4.2 in Codice.gs
// (vedi commento "SOSTITUZIONE v4.2"). Confronto e decisione documentati nella sessione Cowork.

// ==================================================================
// ALERT TELEGRAM SETTIMANALE
// ==================================================================

function sendWeeklyAlert() {
  var bandi = getBandiRadar().filter(function(b) { return b.statoRecord !== 'archiviato'; });
  var oggi = new Date();
  var unaSett = new Date(oggi.getTime() - 7*24*60*60*1000);
  var nuovi = bandi.filter(function(b) { return b.data && new Date(b.data) >= unaSett && b.status === 'Nuovo'; });
  var inScadenza = bandi.filter(function(b) {
    if (!b.scadenza) return false;
    var dl = Math.ceil((new Date(b.scadenza) - oggi) / 86400000);
    return dl >= 0 && dl <= GIORNI_ALERT;
  }).sort(function(a,b) { return new Date(a.scadenza) - new Date(b.scadenza); });
  var totValore = bandi.reduce(function(s,b) { return s + (b.importo||0); }, 0);

  var msg = ' *RADAR BANDI - Lunedi ' + formatDateIT(oggi) + '*\n_Osservatorio Culturale . Duemilamusei_\n\n';
  msg += ' *Statistiche*\n Bandi attivi: *' + bandi.length + '*\n Valore totale: *' + (totValore > 0 ? 'EUR' + Math.round(totValore/1000) + 'k' : 'n.d.') + '*\n\n';

  if (inScadenza.length > 0) {
    msg += ' *IN SCADENZA entro ' + GIORNI_ALERT + ' giorni*\n';
    inScadenza.forEach(function(b) {
      var dl = Math.ceil((new Date(b.scadenza) - oggi) / 86400000);
      msg += '*' + b.titolo.slice(0,55) + '*\n    ' + formatDateIT(new Date(b.scadenza)) + ' - ' + dl + 'gg\n    ' + b.ente + '\n';
      if (b.importo) msg += '    ' + formatEur(b.importo) + '\n';
      if (b.link) msg += '    ' + b.link + '\n';
      msg += '\n';
    });
  } else {
    msg += 'OK *Nessuna scadenza nei prossimi ' + GIORNI_ALERT + ' giorni*\n\n';
  }

  if (nuovi.length > 0) {
    msg += ' *NUOVI questa settimana (' + nuovi.length + ')*\n';
    nuovi.slice(0,5).forEach(function(b) {
      msg += '*' + b.titolo.slice(0,55) + '*\n    ' + b.ente + ' . ' + b.regione + '\n';
      if (b.importo) msg += '    ' + formatEur(b.importo) + '\n';
      if (b.scadenza) msg += '    Scad: ' + formatDateIT(new Date(b.scadenza)) + '\n';
      msg += '\n';
    });
    if (nuovi.length > 5) msg += '   _...e altri ' + (nuovi.length-5) + ' bandi_\n\n';
  }
  msg += '_Osservatorio Culturale . Duemilamusei_';
  return sendTelegram(msg);
}

// ==================================================================
// PROMPT PODCAST
// ==================================================================

function buildPromptPodcast(testo, nomeFonte) {
  return 'Sei un esperto di cultura, musei e turismo culturale in Italia.\n\nAnalizza il testo estratto dal feed podcast "' + nomeFonte + '" e individua episodi pertinenti per professionisti del settore culturale.\n\nTEMATICHE: Musei & Patrimonio | Turismo Culturale | Gestione Culturale | Accessibilita | Tecnologia & Cultura | Politiche Culturali | Arte & Mostre\n\nPer ogni episodio trovato restituisci JSON:\n{\n  "titolo": "titolo episodio",\n  "serie": "nome del podcast",\n  "autore": "conduttore o autore",\n  "tematica": "una delle tematiche sopra",\n  "durata": 0,\n  "dataPubl": "yyyy-mm-dd oppure null",\n  "link": "URL diretto episodio",\n  "sommario": "2-3 frasi in italiano max 300 caratteri",\n  "tag": ["tag1","tag2","tag3"],\n  "score": 4\n}\n\nScore (1-5): 5=essenziale, 4=molto utile, 3=interessante, 2=marginale.\nSe non trovi nulla: []. Solo JSON array.\n\nTESTO:\n' + testo;
}

// ==================================================================
// SCANNER PODCAST
// ==================================================================

function scanPodcast() {
  var apiKey = PropertiesService.getScriptProperties().getProperty(ANTHROPIC_KEY_PROP);
  if (!apiKey) { Logger.log('ERR API Key mancante per scanner podcast'); return 0; }

  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var SS;
  try { SS = SpreadsheetApp.getActiveSpreadsheet() || (sheetId ? SpreadsheetApp.openById(sheetId) : null); } catch(e) { SS = sheetId ? SpreadsheetApp.openById(sheetId) : null; }
  if (!SS) { Logger.log('ERR scanPodcast: nessun foglio disponibile'); return 0; }
  var sh = SS.getSheetByName('Podcast');
  if (!sh) {
    sh = SS.insertSheet('Podcast');
    var h = ['ID','DataRilevamento','Titolo','Serie','Autore','Tematica','Durata','DataPubblicazione','Link','SommarioAI','TagAI','Score','Fonte','Ascoltato','DaAscoltare','InclusiNelDigest','StatoRecord'];
    sh.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold').setBackground('#5B2D8E').setFontColor('#fff');
    sh.setFrozenRows(1);
  }

  var existing = new Set();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 9, sh.getLastRow()-1, 1).getValues().forEach(function(r) {
      if (r[0]) existing.add(String(r[0]).trim());
    });
  }

  var totalNuovi = 0;
  var oggi = new Date();
  var settimanaAnno = getWeekNumberBandi(oggi);

  FONTI_PODCAST.forEach(function(fonte) {
    if (fonte.priorita === 2 && settimanaAnno % 2 !== 0) return;
    try {
      Logger.log(' Podcast: ' + fonte.nome);
      var resp = UrlFetchApp.fetch(fonte.url, {
        muteHttpExceptions:true, followRedirects:true, deadline:8,
        headers:{'User-Agent':'Mozilla/5.0 (compatible; OsservatorioRadarBandi/4.0)'}
      });
      if (resp.getResponseCode() !== 200) { Logger.log('  ! HTTP ' + resp.getResponseCode()); return; }
      var testo = pulisciHtmlBandi(resp.getContentText()).slice(0, 8000);
      if (testo.length < 100) return;
      var episodi = estraiConClaudeBandi(buildPromptPodcast(testo, fonte.nome), apiKey);
      if (!episodi || !episodi.length) { Logger.log('  -> Nessun episodio'); return; }
      episodi.forEach(function(ep) {
        if (!ep.titolo || ep.titolo.length < 5) return;
        var link = ep.link || '';
        if (link && existing.has(link)) return;
        var id = 'POD' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
        sh.appendRow([
          id, new Date(), ep.titolo||'', ep.serie||fonte.nome, ep.autore||'',
          ep.tematica||fonte.tematica||'Musei & Patrimonio',
          ep.durata||0,
          ep.dataPubl ? new Date(ep.dataPubl) : '',
          link,
          ep.sommario||'', (ep.tag||[]).join(', '), ep.score||3,
          fonte.nome, false, false, false, 'attivo'
        ]);
        if (link) existing.add(link);
        totalNuovi++;
        Utilities.sleep(500);
      });
      Logger.log('  OK ' + episodi.length + ' episodi trovati');
    } catch(e) { Logger.log('  ERR ' + e.message); }
  });

  Logger.log('=== PODCAST SCAN: ' + totalNuovi + ' nuovi episodi ===');
  return totalNuovi;
}

// ==================================================================
// TRIGGER
// ==================================================================

function setupTriggersUnificati() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  // Lunedì 06:00 — scan completo + digest settimanale
  ScriptApp.newTrigger('lunediMattina').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();

  // Martedì 07:00 — scan news RSS + scan podcast/video
  ScriptApp.newTrigger('scanSources').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(7).create();
  ScriptApp.newTrigger('scanPodcast').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(7).nearMinute(30).create();

  // Martedì 08:00 — digest automatico
  ScriptApp.newTrigger('sendDigestAuto').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(8).create();

  // Giovedì 07:00 — scan news RSS + scan podcast/video
  ScriptApp.newTrigger('scanSources').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(7).create();
  ScriptApp.newTrigger('scanPodcast').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(7).nearMinute(30).create();

  // Giovedì 08:00 — digest automatico
  ScriptApp.newTrigger('sendDigestAuto').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(8).create();

  Logger.log('OK Trigger v4.1: Lun 06:00 | Mar+Gio 07:00 scanSources | Mar+Gio 07:30 scanPodcast | Mar+Gio 08:00 sendDigestAuto');
}

// ==================================================================
// SETUP FONTI DEFAULT - eseguire una volta sola
// ==================================================================

function addFontiArteDefolt() {
  var _sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss; try { ss = SpreadsheetApp.getActiveSpreadsheet() || (_sheetId ? SpreadsheetApp.openById(_sheetId) : null); } catch(e) { ss = _sheetId ? SpreadsheetApp.openById(_sheetId) : null; }
  if (!ss) { Logger.log('ERR: nessun foglio disponibile'); return 0; }
  var sh = ss.getSheetByName('SocialFonti');
  if (!sh) {
    sh = ss.insertSheet('SocialFonti');
    sh.getRange(1,1,1,8).setValues([['ID','Nome','URL','Tipo','Categoria','Avatar','Attiva','Note']]);
    sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  var existing = sh.getDataRange().getValues().map(function(r) { return r[2]; });
  var added = 0;
  FONTI_ARTICOLI_ARTE.forEach(function(f) {
    if (!existing.includes(f.url)) {
      sh.appendRow(['art_' + Date.now(), f.nome, f.url, 'rivista', f.ambito, f.nome.charAt(0), true, '']);
      added++;
      Utilities.sleep(50);
    }
  });
  Logger.log('[OK] addFontiArteDefolt: ' + added + ' fonti arte aggiunte');
  return added;
}

function addFontiAIDefolt() {
  var _sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss; try { ss = SpreadsheetApp.getActiveSpreadsheet() || (_sheetId ? SpreadsheetApp.openById(_sheetId) : null); } catch(e) { ss = _sheetId ? SpreadsheetApp.openById(_sheetId) : null; }
  if (!ss) { Logger.log('ERR: nessun foglio disponibile'); return 0; }
  var sh = ss.getSheetByName('SocialFonti');
  if (!sh) {
    sh = ss.insertSheet('SocialFonti');
    sh.getRange(1,1,1,8).setValues([['ID','Nome','URL','Tipo','Categoria','Avatar','Attiva','Note']]);
    sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  var existing = sh.getDataRange().getValues().map(function(r) { return r[2]; });
  var added = 0;
  FONTI_AI_CULTURA.forEach(function(f) {
    if (!existing.includes(f.url)) {
      sh.appendRow(['ai_' + Date.now(), f.nome, f.url, 'rivista', f.ambito, f.nome.charAt(0), true, '']);
      added++;
      Utilities.sleep(50);
    }
  });
  Logger.log('[OK] addFontiAIDefolt: ' + added + ' fonti AI aggiunte');
  return added;
}

function addPodcastDefolt() {
  var _sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss; try { ss = SpreadsheetApp.getActiveSpreadsheet() || (_sheetId ? SpreadsheetApp.openById(_sheetId) : null); } catch(e) { ss = _sheetId ? SpreadsheetApp.openById(_sheetId) : null; }
  if (!ss) { Logger.log('ERR: nessun foglio disponibile'); return 0; }
  var sh = ss.getSheetByName('SocialFonti');
  if (!sh) {
    sh = ss.insertSheet('SocialFonti');
    sh.getRange(1,1,1,8).setValues([['ID','Nome','URL','Tipo','Categoria','Avatar','Attiva','Note']]);
    sh.getRange(1,1,1,8).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  var existing = sh.getDataRange().getValues().map(function(r) { return r[2]; });
  var added = 0;
  FONTI_PODCAST.filter(function(f) { return f.priorita <= 2; }).forEach(function(f) {
    if (!existing.includes(f.url)) {
      sh.appendRow(['pod_' + Date.now(), f.nome, f.url, 'podcast', f.tematica, f.nome.charAt(0), true, '']);
      added++;
      Utilities.sleep(50);
    }
  });
  Logger.log('[OK] addPodcastDefolt: ' + added + ' podcast aggiunti');
  return added;
}

// ==================================================================
// UTILITA
// ==================================================================

function getWeekNumberBandi(d) {
  var onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
}

/**
 * v4.12.3 FIX CRITICO (2026-05-04): preserva gli href dei link prima di stripppare i tag.
 * Prima del fix, <a href="URL"> veniva rimosso → Claude non vedeva mai gli URL dei bandi
 * → restituiva solo l'URL della fonte (pagina lista) → tutti i link su webapp puntavano alla lista.
 * Ora trasforma <a href="X">Testo</a> in "Testo [URL: X]" così Claude estrae link diretti.
 *
 * Optional: baseUrl param per rendere assoluti gli href relativi (es. "/bando/123" → "https://dominio/bando/123").
 */
function pulisciHtmlBandi(html, baseUrl) {
  baseUrl = baseUrl || '';
  var origin = '';
  try {
    if (baseUrl) {
      var m = baseUrl.match(/^(https?:\/\/[^\/]+)/i);
      if (m) origin = m[1];
    }
  } catch(e) {}

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // PRESERVA link: <a href="URL">testo</a> → "testo [URL: URL]"
    .replace(/<a\b[^>]*?href\s*=\s*["']([^"'\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi, function(_, href, txt) {
      var clean = String(txt || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!href) return clean;
      if (href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return clean;
      // Risolvi href relativi quando possibile
      var absUrl = href;
      if (/^\/\//.test(href))      absUrl = 'https:' + href;
      else if (/^\//.test(href) && origin) absUrl = origin + href;
      else if (!/^https?:/i.test(href) && origin) absUrl = origin + '/' + href.replace(/^\.?\//, '');
      if (!clean) clean = '(link)';
      return clean + ' [URL: ' + absUrl + ']';
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n').trim();
}

function normalizzaBandi(s) {
  return String(s||'').toLowerCase().trim();
}

function somiglianzaBandi(a, b) {
  if (a === b) return 1;
  if (a.length < 6 || b.length < 6) return 0;
  var inizio = Math.min(a.length, b.length, 35);
  if (a.slice(0, inizio) === b.slice(0, inizio)) return 0.95;
  var pa = new Set(a.split(' ').filter(function(w) { return w.length > 4; }));
  var pb = new Set(b.split(' ').filter(function(w) { return w.length > 4; }));
  var comuni = [...pa].filter(function(w) { return pb.has(w); }).length;
  var totale = new Set([...pa, ...pb]).size;
  return totale > 0 ? comuni / totale : 0;
}

// ==================================================================
// DIAGNOSTICA
// ==================================================================

function testScannerBandi() {
  Logger.log('=== TEST SCANNER BANDI v4.0 ===');
  var apiKey = PropertiesService.getScriptProperties().getProperty(ANTHROPIC_KEY_PROP);
  Logger.log('API Key: ' + (apiKey ? 'SI (configurata)' : 'NO'));
  if (!apiKey) return;
  var testoProva = 'Avviso Unico Cultura 2026 - Regione Marche. Scadenza 15 maggio 2026. Contributi per musei e reti museali. Importo massimo 100.000 euro.';
  var bandi = estraiConClaudeBandi(buildPromptBandi(testoProva, 'TEST', 'https://www.regione.marche.it'), apiKey);
  Logger.log('Bandi estratti: ' + JSON.stringify(bandi));
  if (bandi.length > 0) Logger.log('OK Scanner funzionante!');
}

// v4.18.38 (audit 2026-05-14) — Rimossa riepilogoFontiBandi():
//   diagnostica RSS legacy mai chiamata; auditBandiSystem() (subito sotto) la sostituisce
//   con output più ricco e via google.script.run dal pannello admin.

// ==================================================================
// AUDIT COMPLETO SISTEMA BANDI (v4.12.3 - 2026-05-04)
// ==================================================================
/**
 * Lancia auditBandiSystem() dall'editor GAS o dal pannello admin.
 * Produce un report dettagliato che fotografa lo stato REALE di:
 *  - Foglio RADAR BANDI: numero record, qualita link, distribuzione fonti/ambiti, anzianita
 *  - Fonti scanner: quante online, quante danno HTML utile, quante hanno gia' prodotto bandi
 *  - Indice "salute sistema": stima percentuale link diretti vs link generici di lista
 *
 * Output: { ok, summary, byFonte, problemiLink, fontiSilenti, fontiNonRaggiungibili, raccomandazioni }
 * Da chiamare anche via google.script.run dal pannello admin (presto wrapper UI).
 */
function auditBandiSystem() {
  var startTime = new Date().getTime();
  Logger.log('================================================================');
  Logger.log('AUDIT BANDI SYSTEM v4.12.3 - inizio');
  Logger.log('================================================================');

  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    summary: {},
    byFonte: {},
    byAmbito: {},
    problemiLink: [],
    fontiSilenti: [],
    fontiNonRaggiungibili: [],
    raccomandazioni: []
  };

  // === FASE 1: Foglio RADAR BANDI ===
  try {
    var sheet = getSheetRadar();
    if (!sheet) {
      report.ok = false;
      report.summary.error = 'Foglio RADAR BANDI non trovato';
      return report;
    }
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) {
      report.summary.totale = 0;
      report.raccomandazioni.push('Foglio RADAR BANDI vuoto. Lancia scanBandiAutomatico() per popolarlo.');
      return report;
    }
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var iLink = headers.indexOf('LINK');     if (iLink < 0) iLink = COL.LINK - 1;
    var iFonte = headers.indexOf('FONTE');   if (iFonte < 0) iFonte = COL.FONTE - 1;
    var iScad = headers.indexOf('SCADENZA');  if (iScad < 0) iScad = COL.SCADENZA - 1;
    var iStato = headers.indexOf('STATO_RECORD'); if (iStato < 0) iStato = COL.STATO_RECORD - 1;
    var iDataRil = headers.indexOf('DATA_RILEVAMENTO'); if (iDataRil < 0) iDataRil = COL.DATA_RILEVAMENTO - 1;
    var iAmbito = headers.indexOf('AMBITO'); if (iAmbito < 0) iAmbito = headers.indexOf('AMBITI'); if (iAmbito < 0) iAmbito = headers.indexOf('Ambiti'); if (iAmbito < 0) iAmbito = headers.indexOf('Ambito');

    var stats = {
      totale: data.length,
      attivi: 0,
      archiviati: 0,
      scaduti: 0,
      conLink: 0,
      senzaLink: 0,
      linkDiretti: 0,        // link che NON sono nelle URL fonti note
      linkGenerici: 0,       // link che corrispondono a una pagina lista fonte
      linkRotti404: 0,       // (non testato qui per costo, solo placeholder)
      conAmbito: 0,
      senzaAmbito: 0,
      ultimi7gg: 0,
      ultimi30gg: 0,
      vecchi90gg: 0
    };

    var fontiUrlSet = {};
    TUTTE_LE_FONTI_BANDI.forEach(function(f) { fontiUrlSet[f.url.toLowerCase().replace(/\/$/, '')] = f.nome; });
    var byFonte = {};
    var byAmbito = { '1':0, '2':0, '3':0, '4':0, '5':0, 'null':0 };
    var oggi = new Date();

    data.forEach(function(row, idx) {
      var stato = String(row[iStato] || 'attivo');
      var link  = String(row[iLink] || '').trim();
      var fonte = String(row[iFonte] || '(senza fonte)');
      var scad  = row[iScad];
      var dataRil = row[iDataRil];
      var ambito = parseInt(row[iAmbito]) || null;

      if (stato === 'attivo' || !stato) stats.attivi++;
      else if (stato === 'archiviato') stats.archiviati++;

      if (scad instanceof Date && scad < oggi) stats.scaduti++;

      if (link) {
        stats.conLink++;
        var linkClean = link.toLowerCase().replace(/\/$/, '').replace(/\?.*/, '');
        var isLista = false;
        for (var k in fontiUrlSet) {
          if (linkClean === k || linkClean === k.replace(/\/$/, '')) { isLista = true; break; }
        }
        if (isLista) {
          stats.linkGenerici++;
          if (report.problemiLink.length < 30) {
            report.problemiLink.push({ riga: idx+2, titolo: String(row[1]||'').slice(0,80), link: link, fonte: fonte });
          }
        } else {
          stats.linkDiretti++;
        }
      } else {
        stats.senzaLink++;
      }

      if (ambito && ambito >= 1 && ambito <= 5) {
        stats.conAmbito++;
        byAmbito[String(ambito)]++;
      } else {
        stats.senzaAmbito++;
        byAmbito['null']++;
      }

      byFonte[fonte] = (byFonte[fonte] || 0) + 1;

      if (dataRil instanceof Date) {
        var giorni = Math.floor((oggi - dataRil) / 86400000);
        if (giorni <= 7) stats.ultimi7gg++;
        if (giorni <= 30) stats.ultimi30gg++;
        if (giorni > 90) stats.vecchi90gg++;
      }
    });

    report.summary = stats;
    report.byFonte = byFonte;
    report.byAmbito = byAmbito;

    // Calcolo % salute link
    var pctLinkDiretti = stats.conLink > 0 ? Math.round(stats.linkDiretti / stats.conLink * 100) : 0;
    report.summary.percLinkDiretti = pctLinkDiretti;
    report.summary.percSenzaLink = stats.totale > 0 ? Math.round(stats.senzaLink / stats.totale * 100) : 0;
    report.summary.percSenzaAmbito = stats.totale > 0 ? Math.round(stats.senzaAmbito / stats.totale * 100) : 0;

    Logger.log('--- FOGLIO RADAR BANDI ---');
    Logger.log('Totale record: ' + stats.totale + ' (attivi=' + stats.attivi + ', archiviati=' + stats.archiviati + ')');
    Logger.log('Con link: ' + stats.conLink + ' / Senza link: ' + stats.senzaLink + ' (=' + report.summary.percSenzaLink + '% vuoti)');
    Logger.log('Link diretti (non lista): ' + stats.linkDiretti + ' / Link generici (lista fonte): ' + stats.linkGenerici + ' (' + pctLinkDiretti + '% diretti)');
    Logger.log('Con ambito: ' + stats.conAmbito + ' / Senza ambito: ' + stats.senzaAmbito + ' (=' + report.summary.percSenzaAmbito + '%)');
    Logger.log('Scaduti: ' + stats.scaduti + ' / Recenti 30gg: ' + stats.ultimi30gg + ' / Vecchi 90gg+: ' + stats.vecchi90gg);
    Logger.log('Distribuzione ambiti: ' + JSON.stringify(byAmbito));
    Logger.log('Top 10 fonti per numero bandi:');
    Object.keys(byFonte).sort(function(a,b){return byFonte[b]-byFonte[a];}).slice(0,10).forEach(function(f){
      Logger.log('  ' + f + ': ' + byFonte[f]);
    });

  } catch(e) {
    Logger.log('ERR fase 1: ' + e.message);
    report.ok = false;
    report.summary.error1 = e.message;
  }

  // === FASE 2: Quali fonti del codice non hanno mai prodotto bandi ===
  try {
    var fontiProduttive = Object.keys(report.byFonte || {});
    TUTTE_LE_FONTI_BANDI.forEach(function(f) {
      if (fontiProduttive.indexOf(f.nome) === -1) {
        report.fontiSilenti.push({ nome: f.nome, livello: f.livello, priorita: f.priorita, url: f.url });
      }
    });
    Logger.log('--- FONTI SILENTI (mai prodotto bandi) ---');
    Logger.log('Numero: ' + report.fontiSilenti.length + ' / ' + TUTTE_LE_FONTI_BANDI.length);
    report.fontiSilenti.slice(0, 15).forEach(function(f) { Logger.log('  ' + f.nome + ' (priorita ' + f.priorita + ') - ' + f.url); });
  } catch(e) {
    Logger.log('ERR fase 2: ' + e.message);
  }

  // === FASE 3: Test reachability fonti priorita 1 (max 8 per non saturare timeouts) ===
  try {
    var fontiP1 = TUTTE_LE_FONTI_BANDI.filter(function(f){ return f.priorita === 1; }).slice(0, 8);
    Logger.log('--- TEST REACHABILITY FONTI PRIORITA 1 (' + fontiP1.length + ') ---');
    fontiP1.forEach(function(f) {
      try {
        var r = UrlFetchApp.fetch(f.url, { muteHttpExceptions:true, followRedirects:true, deadline:5,
          headers:{'User-Agent':'Mozilla/5.0 (compatible; OsservatorioAudit/1.0)'} });
        var code = r.getResponseCode();
        var size = r.getContentText().length;
        var hasLinks = (r.getContentText().match(/<a\b[^>]*href\s*=/gi) || []).length;
        Logger.log('  ' + f.nome + ' -> HTTP ' + code + ', ' + size + ' bytes, ' + hasLinks + ' link href');
        if (code !== 200 || size < 1000) {
          report.fontiNonRaggiungibili.push({ nome: f.nome, url: f.url, code: code, size: size });
        }
      } catch(e) {
        Logger.log('  ' + f.nome + ' -> ERR ' + e.message);
        report.fontiNonRaggiungibili.push({ nome: f.nome, url: f.url, error: e.message });
      }
      Utilities.sleep(800);
    });
  } catch(e) {
    Logger.log('ERR fase 3: ' + e.message);
  }

  // === FASE 4: Raccomandazioni automatiche ===
  if (report.summary.percSenzaLink > 5) {
    report.raccomandazioni.push('CRITICO: ' + report.summary.percSenzaLink + '% bandi senza link. Verifica salvaNewBandi e il fallback url_bando.');
  }
  if (report.summary.percLinkDiretti < 40) {
    report.raccomandazioni.push('GRAVE: solo ' + report.summary.percLinkDiretti + '% dei link sono diretti al bando. La maggioranza punta alla pagina lista. Fix pulisciHtmlBandi v4.12.3 risolve. Lancia retroactiveFixOldBandiLinks() (TODO) o re-scan completo.');
  }
  if (report.summary.percSenzaAmbito > 20) {
    report.raccomandazioni.push('Ambiti mancanti su ' + report.summary.percSenzaAmbito + '% bandi. Lancia migraBandiAmbito() per ricalcolare via tagger.');
  }
  if (report.fontiSilenti.length > 10) {
    report.raccomandazioni.push(report.fontiSilenti.length + ' fonti silenti su ' + TUTTE_LE_FONTI_BANDI.length + '. Probabilmente JS-rendered o url cambiato. Considerare RSS dove disponibili.');
  }
  if (report.fontiNonRaggiungibili.length > 0) {
    report.raccomandazioni.push(report.fontiNonRaggiungibili.length + ' fonti P1 non raggiungibili nel test. Vedi report.fontiNonRaggiungibili per dettaglio.');
  }

  Logger.log('--- RACCOMANDAZIONI ---');
  report.raccomandazioni.forEach(function(r){ Logger.log('  - ' + r); });
  var elapsed = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('================================================================');
  Logger.log('AUDIT BANDI completato in ' + elapsed + ' secondi');
  Logger.log('================================================================');

  return report;
}

// ==================================================================
// RESET BANDI PER NUOVO SCAN - OPZIONE A (v4.13.1 - 2026-05-04)
// ==================================================================
/**
 * STRATEGIA OPZIONE A:
 * 1. Marca come 'archiviato' tutti i bandi ATTIVI che hanno link GENERICO
 *    (= URL della pagina lista fonte, non link diretto al bando)
 * 2. Mantiene per storico tutti i bandi gia' archiviati e quelli con link diretti validi
 * 3. Rilancia scanBandiAutomatico() che ora usa pulisciHtmlBandi v4.13.1 - estrae link diretti
 * 4. Lancia migraBandiAmbito() per ricalcolare gli ambiti sui nuovi bandi
 *
 * Reversibile: nessun record viene cancellato, solo archiviato.
 * Idempotente: lanciabile piu' volte senza danni.
 *
 * Uso: dall'editor GAS, seleziona resetBandiPerNuovoScanV13() → Esegui.
 * Tempo stimato: 5-10 minuti (scan + ambiti).
 *
 * @param {boolean} [skipScan=false] - se true, archivia ma non rilancia lo scan
 * @param {boolean} [skipAmbiti=false] - se true, archivia + scan ma non ricalcola ambiti
 */
function resetBandiPerNuovoScanV13(skipScan, skipAmbiti) {
  var startTime = new Date().getTime();
  Logger.log('================================================================');
  Logger.log('RESET BANDI PER NUOVO SCAN v4.13.1 - OPZIONE A');
  Logger.log('================================================================');
  var report = { ok:true, archiviati:0, scanResult:null, ambitiResult:null, errors:[] };

  // === FASE 1: archivia bandi attivi con link generico ===
  try {
    var sheet = getSheetRadar();
    if (!sheet) { report.ok = false; report.errors.push('Foglio RADAR non trovato'); return report; }
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) { Logger.log('Foglio vuoto, skip archiviazione'); }
    else {
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var iLink = headers.indexOf('LINK');     if (iLink < 0) iLink = COL.LINK - 1;
      var iStato = headers.indexOf('STATO_RECORD'); if (iStato < 0) iStato = COL.STATO_RECORD - 1;

      var fontiUrlSet = {};
      TUTTE_LE_FONTI_BANDI.forEach(function(f) { fontiUrlSet[f.url.toLowerCase().replace(/\/$/, '')] = true; });

      var righeDaArchiviare = [];
      data.forEach(function(row, idx) {
        var stato = String(row[iStato] || 'attivo');
        var link  = String(row[iLink] || '').trim();
        if (stato !== 'attivo') return;
        if (!link) return;  // bandi senza link li lascio attivi (problema diverso)
        var linkClean = link.toLowerCase().replace(/\/$/, '').replace(/\?.*/, '');
        if (fontiUrlSet[linkClean]) {
          righeDaArchiviare.push(idx + 2); // +2 perche' partiamo da row 2
        }
      });

      Logger.log('FASE 1: trovati ' + righeDaArchiviare.length + ' bandi con link generico (= URL fonte) - ARCHIVIO');
      righeDaArchiviare.forEach(function(rowNum) {
        sheet.getRange(rowNum, iStato + 1).setValue('archiviato');
        report.archiviati++;
      });
      Logger.log('FASE 1 OK: archiviati ' + report.archiviati + ' bandi');
    }
  } catch(e) {
    Logger.log('ERR fase 1 archiviazione: ' + e.message);
    report.errors.push('Archiviazione: ' + e.message);
  }

  // === FASE 2: nuovo scan con pulisciHtmlBandi v4.13.1 ===
  if (!skipScan) {
    try {
      Logger.log('FASE 2: lancio scanBandiAutomatico() con fix v4.13.1...');
      report.scanResult = scanBandiAutomatico();
      Logger.log('FASE 2 OK: ' + (report.scanResult.totalNuovi || 0) + ' nuovi bandi importati');
    } catch(e) {
      Logger.log('ERR fase 2 scan: ' + e.message);
      report.errors.push('Scan: ' + e.message);
    }
  } else {
    Logger.log('FASE 2 SKIP (skipScan=true)');
  }

  // === FASE 3: ricalcola ambiti via tagger ===
  if (!skipAmbiti) {
    try {
      Logger.log('FASE 3: lancio migraBandiAmbito() per ricalcolare ambiti...');
      if (typeof migraBandiAmbito === 'function') {
        report.ambitiResult = migraBandiAmbito();
        Logger.log('FASE 3 OK: ' + JSON.stringify(report.ambitiResult));
      } else {
        Logger.log('FASE 3 SKIP: migraBandiAmbito non disponibile');
      }
    } catch(e) {
      Logger.log('ERR fase 3 ambiti: ' + e.message);
      report.errors.push('Ambiti: ' + e.message);
    }
  } else {
    Logger.log('FASE 3 SKIP (skipAmbiti=true)');
  }

  var elapsed = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('================================================================');
  Logger.log('RESET COMPLETATO in ' + elapsed + ' secondi');
  Logger.log('Archiviati: ' + report.archiviati + ' | Nuovi importati: ' + (report.scanResult ? report.scanResult.totalNuovi : 'N/A'));
  Logger.log('Errori: ' + report.errors.length);
  Logger.log('================================================================');
  Logger.log('PROSSIMO STEP: lancia auditBandiSystem() per misurare il miglioramento');
  Logger.log('Atteso: % link diretti deve salire da ~12% a 60-80%');
  Logger.log('================================================================');

  return report;
}

// ==================================================================
// DIAGNOSTICA FONTI — Sprint 1 (2026-05-26)
// Endpoint leggero per dashboard frontend (admin + editor)
// ==================================================================

function getFontiDiagnostics() {
  // Gate: solo editor o admin
  try {
    var user = getCurrentUser_v44();
    var ruolo = (user && user.ruolo) || 'guest';
    if (ruolo !== 'admin' && ruolo !== 'editor') {
      return { ok: false, error: 'unauthorized' };
    }
  } catch(e) {
    return { ok: false, error: 'auth_error: ' + e.message };
  }

  var report = {
    ok: true,
    timestamp: new Date().toISOString(),
    kpi: {},
    fonti: [],
    raccomandazioni: []
  };

  // --- Fase 1: conta bandi per fonte dal foglio RADAR ---
  var bandiPerFonte = {};
  var ultimoPerFonte = {};
  var statsLink = { totali: 0, diretti: 0, generici: 0, vuoti: 0 };
  var bandiUltimi30 = 0;
  var bandiTotali = 0;
  var ultimoScanGlobale = null;
  var oggi = new Date();

  try {
    var sheet = getSheetRadar();
    if (sheet && sheet.getLastRow() > 1) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      var iFonte = headers.indexOf('FONTE');       if (iFonte < 0) iFonte = 13;
      var iLink  = headers.indexOf('LINK');        if (iLink < 0) iLink = 14;
      var iStato = headers.indexOf('STATO_RECORD'); if (iStato < 0) iStato = 22;
      var iDataRil = headers.indexOf('DATA_RILEVAMENTO'); if (iDataRil < 0) iDataRil = 2;

      var fontiUrlSet = {};
      TUTTE_LE_FONTI_BANDI.forEach(function(f) {
        fontiUrlSet[f.url.toLowerCase().replace(/\/$/, '')] = true;
      });

      data.forEach(function(row) {
        var stato = String(row[iStato] || 'attivo');
        if (stato === 'archiviato') return;

        bandiTotali++;
        var fonte = String(row[iFonte] || '(senza fonte)');
        var link  = String(row[iLink] || '').trim();
        var dataRil = row[iDataRil];

        bandiPerFonte[fonte] = (bandiPerFonte[fonte] || 0) + 1;

        if (dataRil instanceof Date) {
          if (!ultimoPerFonte[fonte] || dataRil > ultimoPerFonte[fonte]) {
            ultimoPerFonte[fonte] = dataRil;
          }
          if (!ultimoScanGlobale || dataRil > ultimoScanGlobale) {
            ultimoScanGlobale = dataRil;
          }
          var giorni = Math.floor((oggi - dataRil) / 86400000);
          if (giorni <= 30) bandiUltimi30++;
        }

        statsLink.totali++;
        if (!link) {
          statsLink.vuoti++;
        } else {
          var linkClean = link.toLowerCase().replace(/\/$/, '').replace(/\?.*/, '');
          if (fontiUrlSet[linkClean]) statsLink.generici++;
          else statsLink.diretti++;
        }
      });
    }
  } catch(e) {
    report.ok = false;
    report.kpi.error = 'Errore lettura foglio: ' + e.message;
  }

  // --- Fase 2: classifica ogni fonte ---
  var nAttive = 0;
  var nSilenti = 0;

  TUTTE_LE_FONTI_BANDI.forEach(function(f) {
    var count = bandiPerFonte[f.nome] || 0;
    var stato = count > 0 ? 'attiva' : 'silente';
    if (stato === 'attiva') nAttive++;
    else nSilenti++;

    var ultimoBando = ultimoPerFonte[f.nome];
    report.fonti.push({
      nome: f.nome,
      categoria: f.livello || 'Altro',
      priorita: f.priorita || 3,
      stato: stato,
      nBandi: count,
      ultimoBando: ultimoBando ? ultimoBando.toISOString() : null,
      url: f.url
    });
  });

  report.fonti.sort(function(a, b) {
    if (a.stato !== b.stato) return a.stato === 'silente' ? -1 : 1;
    if (a.priorita !== b.priorita) return a.priorita - b.priorita;
    return a.nome.localeCompare(b.nome);
  });

  // --- Fase 3: KPI ---
  var totFonti = TUTTE_LE_FONTI_BANDI.length;
  var percAttive = totFonti > 0 ? Math.round(nAttive / totFonti * 100) : 0;
  var percLinkDiretti = statsLink.totali > 0 ? Math.round(statsLink.diretti / statsLink.totali * 100) : 0;

  report.kpi = {
    totali: totFonti,
    attive: nAttive,
    silenti: nSilenti,
    percAttive: percAttive,
    percLinkDiretti: percLinkDiretti,
    ultimoScan: ultimoScanGlobale ? ultimoScanGlobale.toISOString() : null,
    bandiTotali: bandiTotali,
    bandiUltimi30gg: bandiUltimi30
  };

  // --- Fase 4: Raccomandazioni ---
  var pctSilenti = totFonti > 0 ? Math.round(nSilenti / totFonti * 100) : 0;

  if (pctSilenti > 50) {
    report.raccomandazioni.push({
      livello: 'critico',
      testo: nSilenti + ' fonti silenti su ' + totFonti + ' (' + pctSilenti + '%). La maggioranza delle fonti non produce risultati. Causa probabile: siti JS-rendered.'
    });
  } else if (pctSilenti > 20) {
    report.raccomandazioni.push({
      livello: 'warning',
      testo: nSilenti + ' fonti silenti su ' + totFonti + '. Considerare RSS alternativi o scan via agente.'
    });
  }

  if (percLinkDiretti < 40) {
    report.raccomandazioni.push({
      livello: 'critico',
      testo: 'Solo ' + percLinkDiretti + '% dei link punta al bando. La maggioranza punta alla pagina lista fonte.'
    });
  } else if (percLinkDiretti < 70) {
    report.raccomandazioni.push({
      livello: 'warning',
      testo: percLinkDiretti + '% link diretti. Margine di miglioramento.'
    });
  }

  if (bandiUltimi30 === 0) {
    report.raccomandazioni.push({
      livello: 'critico',
      testo: 'Nessun bando rilevato negli ultimi 30 giorni. Verificare scanner e trigger.'
    });
  }

  if (report.raccomandazioni.length === 0) {
    report.raccomandazioni.push({
      livello: 'info',
      testo: 'Sistema nella norma. Nessun problema critico rilevato.'
    });
  }

  return report;
}