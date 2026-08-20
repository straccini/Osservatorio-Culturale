// ==================================================================
// ScannerBandi.gs - Scanner automatico bandi e contenuti culturali
// Osservatorio Culturale - Sinopia / Silvano Straccini
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
  // SILENTE — JS-rendered, no RSS disponibile (verificato 2026-05-26)
  { nome:'MiC - Bandi e Concorsi',       url:'https://cultura.gov.it/comunicati/bandi-e-concorsi',                                 livello:'Nazionale', ente_default:'MiC - Ministero della Cultura',  url_ente:'https://cultura.gov.it', priorita:1, nota:'JS-rendered, no RSS' },
  { nome:'MiC - Avvisi',                  url:'https://cultura.gov.it/comunicati/avvisi',                                           livello:'Nazionale', ente_default:'MiC - Ministero della Cultura',  url_ente:'https://cultura.gov.it', priorita:1, nota:'JS-rendered, no RSS' },
  // SILENTE — WordPress dinamico, no RSS dedicato bandi (verificato 2026-05-26)
  { nome:'Ministero del Turismo - Bandi', url:'https://www.ministeroturismo.gov.it/bandi/',                                         livello:'Nazionale', ente_default:'Ministero del Turismo',          url_ente:'https://www.ministeroturismo.gov.it', priorita:1, nota:'JS-rendered, no RSS' },
  // v5.0.6 — Cambiato da pagina HTML (404) a feed RSS generico (verificato 2026-05-26: 11 items, include bandi PA)
  { nome:'ANCI - Bandi e Opportunita',    url:'https://www.anci.it/feed/',                                                          livello:'Nazionale', ente_default:'ANCI',                           url_ente:'https://www.anci.it', priorita:2 },
  // SILENTE — React SPA, no RSS (verificato 2026-05-26)
  { nome:'Italia Domani - PNRR',          url:'https://www.italiadomani.gov.it/it/opportunita/bandi-amministrazioni-titolari.html', livello:'Nazionale', ente_default:'PNRR - Italia Domani',           url_ente:'https://www.italiadomani.gov.it', priorita:2, nota:'React SPA, no RSS' },
  // SILENTE — no RSS, URL generico (verificato 2026-05-26)
  { nome:'Invitalia - Bandi Cultura',     url:'https://www.invitalia.it/cosa-facciamo/rafforziamo-le-imprese',                      livello:'Nazionale', ente_default:'Invitalia',                      url_ente:'https://www.invitalia.it', priorita:2, nota:'No RSS, URL generico' },
];

const FONTI_REGIONI = [
  { nome:'Regione Marche - Bandi',      url:'https://www.regione.marche.it/Entra-in-Regione/Bandi',                                 livello:'Regionale', ente_default:'Regione Marche',                 url_ente:'https://www.regione.marche.it', priorita:1, nota:'No RSS, HTML statico' },
  { nome:'Regione Marche - Turismo',    url:'https://www.regione.marche.it/Regione-Utile/Turismo/Bandi-e-finanziamenti',           livello:'Regionale', ente_default:'Regione Marche - Turismo',       url_ente:'https://www.regione.marche.it', priorita:1, nota:'No RSS, HTML statico' },
  { nome:'Regione Marche - Cultura',    url:'https://www.regione.marche.it/Regione-Utile/Cultura/Bandi-di-finanziamento',           livello:'Regionale', ente_default:'Regione Marche - Cultura',       url_ente:'https://www.regione.marche.it', priorita:1, nota:'No RSS, HTML statico' },
  { nome:'Regione Umbria - Bandi',      url:'https://www.regione.umbria.it/avvisi',                                                  livello:'Regionale', ente_default:'Regione Umbria',                 url_ente:'https://www.regione.umbria.it', priorita:1, nota:'No RSS, feed vuoto' },
  // NB v4.13.1 - rimosso "Regione Puglia - Turismo" perche' URL precedente 404 e categoria specifica non esiste piu' in portale.
  // I bandi turismo Puglia sono comunque indicizzati dalla voce "Regione Puglia - Bandi" piu sotto e da PUGLIAPROMOZIONE.
  { nome:'PugliaPromozione - Bandi',    url:'https://www.agenziapugliapromozione.it/portal/bandi-e-avvisi',                          livello:'Regionale', ente_default:'PugliaPromozione',               url_ente:'https://www.agenziapugliapromozione.it', priorita:2 },
  // v4.18.55 — Disattivata: HTTP 404 confermato audit 2026-05-15. Bandi Puglia coperti da "Regione Puglia - Bandi" e PUGLIAPROMOZIONE.
  // { nome:'Regione Puglia - Cultura',    url:'https://www.regione.puglia.it/web/cultura/avvisi-e-bandi',                             livello:'Regionale', ente_default:'Regione Puglia - Cultura',       url_ente:'https://www.regione.puglia.it', priorita:1 },
  { nome:'Regione Puglia - Bandi',      url:'https://www.regione.puglia.it/web/portale-bandi/home',                                 livello:'Regionale', ente_default:'Regione Puglia',                 url_ente:'https://www.regione.puglia.it', priorita:1 },
  { nome:'PUGLIAPROMOZIONE',            url:'https://www.pugliapromozione.it/bandi-e-avvisi/',                                      livello:'Regionale', ente_default:'PUGLIAPROMOZIONE',               url_ente:'https://www.pugliapromozione.it', priorita:1 },
  { nome:'Puglia Capitale Sociale',     url:'https://www.sistema.puglia.it/portal/page/portal/SistemaPuglia/BandiAvvisi',           livello:'Regionale', ente_default:'Regione Puglia - Politiche Sociali', url_ente:'https://www.sistema.puglia.it', priorita:2 },
  { nome:'Regione Sardegna - Cultura',  url:'https://www.regione.sardegna.it/j/v/2552?s=1&v=9&c=25&na=1&n=10',                     livello:'Regionale', ente_default:'Regione Sardegna',               url_ente:'https://www.regione.sardegna.it', priorita:1, nota:'No RSS (404)' },
  // v5.0.6 — Cambiato a feed RSS (verificato 2026-05-26: 15 items RDF validi, bandi cultura ER)
  { nome:'Emilia-Romagna - Patrimonio', url:'https://patrimonioculturale.regione.emilia-romagna.it/leggi-atti-bandi/avvisi-e-bandi/RSS',livello:'Regionale', ente_default:'Regione Emilia-Romagna',    url_ente:'https://www.regione.emilia-romagna.it', priorita:1 },
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
  // v4.27.57 — Testate europee arte contemporanea
  { nome:'Contemporary Lynx',   url:'https://contemporarylynx.co.uk/feed',       ambito:'Arte Contemporanea', priorita:2 },
  { nome:'Spike Art Magazine',   url:'https://www.spikeartmagazine.com/feed',     ambito:'Arte Contemporanea', priorita:2 },
  // v4.27.58 — Testate internazionali arte e cultura (batch 2)
  { nome:'Hyperallergic',        url:'https://hyperallergic.com/feed/',           ambito:'Arte & Cultura',     priorita:1 },
  { nome:'ArtReview',            url:'https://artreview.com/feed/',               ambito:'Arte Contemporanea', priorita:1 },
  { nome:'e-flux',               url:'https://www.e-flux.com/feed/',              ambito:'Arte Contemporanea', priorita:1 },
  { nome:'Juliet Art Magazine',  url:'https://www.juliet-artmagazine.com/en/feed/', ambito:'Arte Contemporanea', priorita:1 },
  { nome:'Aesthetica Magazine',  url:'https://aestheticamagazine.com/feed/',      ambito:'Arte & Cultura',     priorita:2 },
  { nome:'Studio International', url:'https://www.studiointernational.com/feed/', ambito:'Arte Contemporanea', priorita:2 },
  { nome:'Sleek Magazine',       url:'https://www.sleek-mag.com/feed/',           ambito:'Arte & Cultura',     priorita:2 },
  { nome:'Aperture',             url:'https://aperture.org/feed/',                ambito:'Fotografia & Cultura', priorita:2 },
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
  // v4.19.1 — Testate generaliste cultura (gate semantico passaFiltroCulturaMusei_ in scanSources)
  { nome:'Il Sole 24 Ore — Cultura', url:'https://www.ilsole24ore.com/rss/cultura.xml',              ambito:'Cultura & Societa',     priorita:2 },
  { nome:'Repubblica — Cultura',     url:'https://www.repubblica.it/rss/cultura/rss2.0.xml',         ambito:'Cultura & Societa',     priorita:2 },
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

// v4.28.39 — Accessor globali per rfMigra (le const sopra sono file-scoped in V8)
function _rfGetFontiNewsIstituzionali_() { return FONTI_NEWS_ISTITUZIONALI; }
function _rfGetFontiArticoliArte_()      { return FONTI_ARTICOLI_ARTE; }
function _rfGetFontiAICultura_()         { return FONTI_AI_CULTURA; }
function _rfGetFontiPodcast_()           { return FONTI_PODCAST; }

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
    var url = ANTHROPIC_API_URL;
    var opts = {
      method:'post', muteHttpExceptions:true, deadline:30,
      headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','content-type':'application/json'},
      payload:JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:2500, messages:[{role:'user',content:prompt}] }),
    };
    var risposta = UrlFetchApp.fetch(url, opts);
    var code = risposta.getResponseCode();
    // Retry once on 429 (rate limit) or 5xx (server error)
    if (code === 429 || code >= 500) {
      Utilities.sleep(3000);
      risposta = UrlFetchApp.fetch(url, opts);
      code = risposta.getResponseCode();
    }
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
  // v4.28.56 — RESTYLING: formato chiaro, sezioni ben separate, KPI in testa,
  // bandi raggruppati per livello (EU/Nazionale/Regionale), link cliccabili.
  var bandi = (typeof getBandiV5 === 'function') ? getBandiV5(1000) : [];
  var oggi = new Date();
  var tz = Session.getScriptTimeZone() || 'Europe/Rome';
  var dataIT = Utilities.formatDate(oggi, tz, 'dd/MM/yyyy');
  var unaSett = new Date(oggi.getTime() - 7*24*60*60*1000);

  var nuovi = bandi.filter(function(b) { return b.dataRil && new Date(b.dataRil) >= unaSett; });
  var inScadenza = bandi.filter(function(b) {
    return b.giorni !== null && b.giorni >= 0 && b.giorni <= GIORNI_ALERT;
  }).sort(function(a,b) { return (a.giorni || 999) - (b.giorni || 999); });
  var conScadenza = bandi.filter(function(b) { return b.giorni !== null && b.giorni >= 0; });

  // ── HEADER ──
  var msg = '*OSSERVATORIO CULTURALE*\n';
  msg += 'Report settimanale ' + dataIT + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

  // ── KPI ──
  msg += '*QUADRO GENERALE*\n';
  msg += 'Bandi attivi: *' + bandi.length + '*\n';
  msg += 'Con scadenza: *' + conScadenza.length + '*\n';
  msg += 'Nuovi 7gg: *' + nuovi.length + '*\n';
  msg += 'In scadenza ' + GIORNI_ALERT + 'gg: *' + inScadenza.length + '*\n\n';

  // ── URGENZE ──
  if (inScadenza.length > 0) {
    msg += '*IN SCADENZA*\n';
    inScadenza.slice(0, 8).forEach(function(b) {
      var livello = String(b.livello || '').toUpperCase();
      var flag = livello === 'EU' ? 'EU' : (livello === 'REGIONALE' ? 'REG' : 'NAZ');
      msg += '*' + b.giorni + 'gg* [' + flag + '] ' + String(b.titolo || '').slice(0, 50) + '\n';
      msg += '    ' + (b.ente || '—') + '\n';
      if (b.scadenza) msg += '    Scade: ' + b.scadenza + '\n';
      if (b.link) msg += '    ' + b.link + '\n';
      msg += '\n';
    });
    if (inScadenza.length > 8) msg += '_...altri ' + (inScadenza.length - 8) + ' in scadenza_\n\n';
  } else {
    msg += '*Nessuna scadenza nei prossimi ' + GIORNI_ALERT + ' giorni*\n\n';
  }

  // ── NUOVI DELLA SETTIMANA raggruppati per livello ──
  if (nuovi.length > 0) {
    msg += '*NUOVI BANDI (' + nuovi.length + ')*\n';
    var perLiv = { EU: [], NAZ: [], REG: [], ALTRO: [] };
    nuovi.forEach(function(b) {
      var liv = String(b.livello || '').toLowerCase();
      if (liv === 'eu' || /europ|ted|creative europe|horizon/i.test(String(b.ente || '') + ' ' + String(b.settore || ''))) perLiv.EU.push(b);
      else if (liv === 'regionale' || liv === 'regione') perLiv.REG.push(b);
      else if (liv === 'nazionale' || liv === 'fondazione' || !liv) perLiv.NAZ.push(b);
      else perLiv.ALTRO.push(b);
    });
    var labels = { EU: 'Europei', NAZ: 'Nazionali', REG: 'Regionali', ALTRO: 'Altri' };
    ['EU', 'NAZ', 'REG', 'ALTRO'].forEach(function(k) {
      if (perLiv[k].length === 0) return;
      msg += '\n_' + labels[k] + ' (' + perLiv[k].length + ')_\n';
      perLiv[k].slice(0, 4).forEach(function(b) {
        msg += '• ' + String(b.titolo || '').slice(0, 50) + '\n';
        msg += '   ' + (b.ente || '—');
        if (b.scadenza) msg += ' | Scad: ' + b.scadenza;
        msg += '\n';
      });
      if (perLiv[k].length > 4) msg += '   _...altri ' + (perLiv[k].length - 4) + '_\n';
    });
    msg += '\n';
  }

  // ── FOOTER ──
  msg += '━━━━━━━━━━━━━━━━━━━━━━\n';
  msg += '_Sinopia . Osservatorio Culturale_';
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

// v4.28.38 — setupTriggersUnificati RIMOSSA (stub deprecato, zero callers)

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

// v4.28.38 — addFontiAIDefolt e addPodcastDefolt RIMOSSE (zero callers, seed one-time)

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

// v4.28.38 — testScannerBandi RIMOSSA (zero callers, diagnostica manuale obsoleta)
// v4.28.38 — auditBandiSystem RIMOSSA (zero callers in .js e HTML; ~230 righe)
//            getFontiDiagnostics (attiva, frontend) la sostituisce per la diagnostica.


// v4.28.38 — resetBandiPerNuovoScanV13 RIMOSSA (zero callers, ~100 righe)

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
      url: f.url,
      nota: f.nota || null
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