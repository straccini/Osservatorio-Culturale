/**
 * ============================================================================
 *  Constants.gs — Single Source of Truth per costanti condivise OC
 * ============================================================================
 *  Sprint 1.1 (INT-4 · 2026-04-29)
 *  Autore: Silvano Straccini / Sinopia
 *
 *  Scopo: centralizzare in UN SOLO file tutte le costanti condivise tra
 *  backend GAS e frontend HTML. Sostituisce le 4 dichiarazioni duplicate
 *  precedentemente sparse in:
 *    - Sidebar.html        (nomi e colori CSS)
 *    - HomeView.html       (nomi, descrizioni, colori)
 *    - Navigation.html     (oggetto JS AMBITI)
 *    - Codice.js           (AMBITO_LABEL, AMBITO_COLOR)
 *
 *  REGOLA: se un nome/colore/descrizione di ambito cambia, si modifica
 *  qui e basta. Il frontend riceve i dati via getOcConstants() in fase
 *  di hydrate iniziale.
 *
 *  Per la migrazione progressiva, le costanti AMBITO_LABEL e AMBITO_COLOR
 *  restano disponibili come alias backward-compatible (vedi fondo file)
 *  finché tutti i punti di chiamata legacy in Codice.js non sono migrati.
 *
 * ============================================================================
 */

// ============================================================================
// AMBITI TEMATICI (5)
// ============================================================================

/**
 * Source of truth dei 5 ambiti tematici dell'Osservatorio Culturale.
 * Ogni ambito ha: id, num (etichetta breve), nome (titolo lungo),
 * nomeBreve (per badge/tag), descrizione, color (hex), colorCls (var CSS).
 */
// Sprint 1.3 (2026-05-01): rinomina ambiti per allineamento Matrix v1.0.2.
// Codici interni (id, color, colorCls, cssVar) INVARIATI per retrocompatibilita.
// Mappatura ambiti -> dimensioni Matrix:
//   01 -> D1 (Identita) + D8 parz (Audience/storytelling)
//   02 -> D7 (Accessibilita ampliata: fisica/cognitiva/sensoriale/linguistica)
//   03 -> D2+D3+D4+D5 (i fondamentali del mestiere museale)
//   04 -> D8 (Audience) + D10 (Welfare culturale)
//   05 -> D6 (Digital maturity) + D9 (Governance/strategia/fundraising)
var OC_AMBITI = [
  {
    id: 1, num: '01',
    nome:      'Identita e narrazione museale',
    nomeBreve: 'Identita',
    desc:      'Identita del museo, posizionamento strategico, marca istituzionale e narrazione contemporanea. Storytelling, branding museale e visione dinsieme.',
    matrixDims: ['D1','D8'],
    color:     '#6B5C9A',
    colorCls:  'a1',
    cssVar:    '--amb-1'
  },
  {
    id: 2, num: '02',
    nome:      'Inclusione e accessibilita',
    nomeBreve: 'Inclusione',
    desc:      'Accessibilita ampliata: fisica, cognitiva, sensoriale, linguistica. Easy-to-Read, percorsi tattili, sottotitolazione, mediazione plurilingue. Pubblici fragili e diritto culturale.',
    matrixDims: ['D7'],
    color:     '#3F7A5E',
    colorCls:  'a2',
    cssVar:    '--amb-2'
  },
  {
    id: 3, num: '03',
    nome:      'Programma, mostre e collezioni',
    nomeBreve: 'Programma',
    desc:      'Programma educativo, mostre temporanee, gestione collezioni, conservazione, ricerca scientifica, allestimenti permanenti e servizi al visitatore. I fondamentali del mestiere museale.',
    matrixDims: ['D2','D3','D4','D5'],
    color:     '#3C6A95',
    colorCls:  'a3',
    cssVar:    '--amb-3'
  },
  {
    id: 4, num: '04',
    nome:      'Comunita e welfare culturale',
    nomeBreve: 'Comunita',
    desc:      'Audience engagement, comunita locali, partecipazione, welfare culturale e impatto sociale. Programmi per pubblici fragili, partnership territoriali, rigenerazione.',
    matrixDims: ['D8','D10'],
    color:     '#9C6A36',
    colorCls:  'a4',
    cssVar:    '--amb-4'
  },
  {
    id: 5, num: '05',
    nome:      'Digital, AI e governance',
    nomeBreve: 'Digital & Gov',
    desc:      'Maturita digitale, AI applicata al patrimonio, dati e KPI, infrastruttura tecnologica, governance, partnership istituzionali, fundraising e sostenibilita economica.',
    matrixDims: ['D6','D9'],
    color:     '#4A7884',
    colorCls:  'a5',
    cssVar:    '--amb-5'
  }
];

/**
 * v4.24 — Mapping ambiti (1-5) <-> dimensioni Matrix (D1-D10), data-driven da OC_AMBITI.
 * ambitiFromDims('D7,D9') -> [2,5]   (ambiti che contengono almeno una di quelle dim)
 * dimsFromAmbiti([2,5])   -> ['D7','D6','D9']  (dim degli ambiti indicati)
 */
function ambitiFromDims(dimsCsv) {
  var dims = (typeof dimsCsv === 'string' ? dimsCsv.split(',') : (dimsCsv || []))
    .map(function(d){ return String(d).trim().toUpperCase(); }).filter(Boolean);
  if (!dims.length || typeof OC_AMBITI === 'undefined') return [];
  var out = [];
  OC_AMBITI.forEach(function(a){
    var hit = (a.matrixDims || []).some(function(d){ return dims.indexOf(String(d).toUpperCase()) >= 0; });
    if (hit) out.push(a.id);
  });
  return out;
}

function dimsFromAmbiti(ambiti) {
  ambiti = (ambiti || []).map(function(x){ return Number(x); });
  if (typeof OC_AMBITI === 'undefined') return [];
  var set = {};
  OC_AMBITI.forEach(function(a){
    if (ambiti.indexOf(a.id) >= 0) (a.matrixDims || []).forEach(function(d){ set[String(d).toUpperCase()] = true; });
  });
  return Object.keys(set);
}

// ============================================================================
// VERSIONE WEBAPP
// ============================================================================

var OC_VERSION = 'v4.27.48';
var OC_VERSION_DATE = '2026-07-20';
var OC_PRIVACY_VERSION = 'v1.0-2026-06'; // versione testo informativa/consenso (docs/INFORMATIVA_PRIVACY_SINOPIA.md)
var OC_VERSION_NOTES = 'v4.25.16 (STABILE, 2026-07-10) — Segnalazioni + flusso redazionale + Lavoro cultura + mix digest. SEGNALAZIONI: fix token getMieSegnalazioni (su deploy anonimo la lista era sempre vuota) + pulsante Segnala iniziativa nel tab Impostazioni. FLUSSO REDAZIONALE (Redazionale_v1.js): creazione VEN 18:00 (editoriale+bozza digest, avviso admin email+Telegram) -> revisione admin fino a LUN 10:00 (solo admin, redattori esclusi) -> richiesta invio al SUPERADMIN via email con bozza definitiva completa (foto+editoriale+digest) e pulsante INVIA, o conferma anticipata; stamp anti-doppio; weeklyNewsletterAuthRequest delega al nuovo flusso; redazionaleSetup rimuove i trigger obsoleti; pannello Digest con Stato/Rigenera mix/Conferma. RIPRISTINO REGRESSIONE (persa in 1ff01773): editorialeSalvaRevisione + _ed_uploadFoto_ + foto/firma in Newsletter+DigestService + colonne firma/foto_url. FIX foto editoriale: compressione client <350KB + watchdog 60s (payload grandi facevano morire google.script.run in silenzio). LAVORO CULTURA: pagina dedicata #page-lavoro con filtri propri (preset + 7 categorie per tipo ente), concorsi tipoBando=lavoro EPURATI dalla pagina Bandi e dalle liste bandi del digest; il blocco 1-opportunita nei digest lettori ora RUOTA senza ripetere le scelte (memoria OC_DIGEST_LAVORO_ROT). MIX DIGEST ESTESO: pannello redazionale con Bandi/News/Podcast/Video/Libri configurabili (0=escludi), sezioni Video e Libri rese nella newsletter. | v4.25.13 (STABILE, 2026-07-08) — Sessione sistema informativo + piano sviluppo. SISTEMA 3 VELOCITA: news quotidiane 4 run/giorno (07/11/15/19) con rotazione round-robin anti-timeout (scanSources riparte dal checkpoint OC_SCAN_RR_IDX, budget 270s), bandi corsia precisione (BandiGate: filtro cultura live + anti-spazzatura menu/legali GAL + normalizzazione link diretto/consulta/ricerca), profondita podcast/video/pubblicazioni. AGENTI QUALITA (via CronDispatcher, +tipo monthdays): agenteQualitaBandi daily 05 (archivia scaduti/junk/non-cultura), agenteFontiMute ogni 5gg con diagnosi per-fonte (HTTP/NON-RSS/FEED-OK=scanner). FIX SCANNER: causa fonti mute = scanSources leggeva legacy Fonti mentre i batch scrivono FontiFeed; risolto con flag + import. T1 LAVORO CULTURA: connettore GU 4a Serie Concorsi (filtro L1 ente + L2 professione da pagina dettaglio), monitor dry-run mer+sab, UI chip + voce sidebar auto-visibile, blocco "1 bando lavoro" nei digest lettori+profilati (non Matrix). T2 ESTERO: SEDIA EU sbloccato (multipart form-data, era [object]/0 estratti -> 18 bandi cultura UE, filtro cultura 12/12 + dedup EN/IT + paginazione), riattivato in FASE 2b daily; +3 fonti internazionali (Res Artis, On the Move, AAM). T3 NORMATIVA: auto-popolamento sezione Norme dal flusso news (doppio match normativa+cultura, anti-rumore newsletter/advocacy USA, self-test 12/12), +2 fonti giuridiche (Artribune Diritto, Fondazione Scuola Patrimonio), settimanale. FIX TED: estrazione oggetto reale appalto da notice-title multilingua (_tedText_ IT>EN) + ente buyer-name + tipologia notice-type + descrizione CPV (era numero pubblicazione + "[object Object]"); bandiPuliziaTedMalformati per storico. FIX CRITICO _fasSaveBando_: scriveva 26 valori su 27 colonne (mancava TipoBando) -> tutte le colonne slittate; ora per indice via COL_B. CONTENUTI: Home+Chi siamo aggiornati (branding OCS), landing Netlify semplificata. Piano sviluppo in docs/PIANO_SVILUPPO_OCS_2026-07.md (T4 social, T5 UX, Tappa P discovery podcast). | v4.24.19 — CKAN: portali estesi da 5 a 22 (tutte le 20 regioni italiane + ANAC + dati.gov.it). Portali non raggiungibili saltati silenziosamente. | v4.24.18 — FIX fonti strutturate: (1) TED: GET restituiva HTTP 202 perché l\'API v3 richiede POST con body JSON (query CPV 92xxx servizi culturali + keyword museo/patrimonio); implementato fasParserTedApiPost(); stato aggiornato da bloccata a in_sviluppo. (2) OpenCoesione: endpoint aggiornato da /api/progetti/ a /api/v2/progetti/ + parametro temi_sintetici=Cultura e turismo (testo non codice numerico) + format=json. (3) CKAN: portali estesi da 2 a 5 (aggiunto Marche, Emilia-Romagna, Toscana); filtro rilevanza calibrato (regex più permissiva + fallback se query contiene cultura/turismo). | v4.24.17 — FIX CRITICO gate lettori: la risposta magic_link_inviato (lettori = ok senza token) cadeva nel ramo errore -> il box mostrava "Errore: sconosciuto" MENTRE il link era stato inviato davvero; il lettore riprovava e riceveva altri link in loop. Ora messaggio verde "Ti abbiamo inviato il link via email - controlla la casella". Stesso fix su _gateDoLoginWith post-registrazione (restava muto su Accesso in corso). NB: tutti i link gia ricevuti dal lettore sono VALIDI e identici (stessa sessione riusata): cliccarne uno qualsiasi fa entrare. | v4.24.16 — FIX grafico Impostazioni > Manutenzione dati: scritte sovrapposte nei 4 bottoni (la classe .btn e inline-flex con white-space:nowrap -> i div interni etichetta+descrizione finivano in riga e straripavano). Ora i bottoni sono card: display block, testo a capo, angoli 10px. | v4.24.15 — Gate Accedi/Registrati: messaggi di errore comprensibili (login_disabilitato/account_non_attivo/quota ecc.) al posto dei codici grezzi. NB: il caso segnalato dal lettore (Errore: login_disabilitato) NON e un bug ma il flag OC_PUBLIC_LOGIN_ENABLED non attivo (fail-closed): per il pilota va ATTIVATO da Impostazioni -> Login pubblico -> Attiva (o eseguendo abilitaLoginPubblico dall editor GAS). | v4.24.14 — FIX stato newsletter fermo su bozza/pending dopo invio riuscito: _updateLogRow_ saltava la scrittura IN SILENZIO se l intestazione del foglio NewsletterLog non combaciava (match esatto) -> ora case-insensitive + auto-riparazione colonne + log. adminConfirmSendWithToken reso IDEMPOTENTE: lock invio_in_corso anti doppio-click; "already sent" ora e una pagina amichevole "Gia inviata" (non un errore) e RIPARA lo Storico; un problema di sola persistenza non maschera piu un invio riuscito (warning in pagina, non errore). | v4.24.13 — FIX "Invia adesso" della pagina di autorizzazione newsletter: il form GET relativo faceva submit all URL transitorio dell iframe googleusercontent (confirm=1 non tornava MAI a doGet -> invio mai eseguito, stato fermo su in_attesa_approvazione = "si blocca"). Ora link assoluto a /exec con target=_top (pattern magic-link). + AUTOMAZIONE LUNEDI 09:00: nuovo trigger weeklyNewsletterAuthRequest (prepara bozza + richiesta autorizzazione su Telegram, NESSUN invio senza conferma), flag OC_NL_LUNEDI_AUTH, attivazione/stato dalla pagina Digest (box "Newsletter lunedi 09:00"); l attivazione rimuove i vecchi invii automatici senza autorizzazione (lunediMattina/sendDigestAuto*). Estratti _generateDigestDraftCore_/_requestSendAuthorizationCore_ senza gate per i trigger. | v4.24.12 — "Richiedi autorizzazione invio" senza confirm()/alert() nativi: esito su toast + box Telegram (con link diretto di fallback se il bot non risponde). Canale Telegram VERIFICATO end-to-end: ping di test ricevuto in chat. | v4.24.11 — Telegram: (SEC) setTelegramConfig ora richiede admin (prima chiunque poteva dirottare le notifiche sul proprio bot via google.script.run; dall editor GAS continua a funzionare); bottone "Test" senza confirm()/alert() nativi, esito inline su #telegramStatus. | v4.24.10 — FIX test reale newsletter lettori: testInviaDigestGeneralista non propagava il token ad adminGenerateDigestDraft (catena interna) -> "draft_failed: forbidden" su deploy anonimo. Trovato testando in-browser. | v4.24.9 — Test digest REALI dalla pagina Digest, senza dialoghi nativi: (1) Lettori: input inline al posto di prompt()/confirm() (congelavano la sandbox sotto automazione); (2) Profilati: NUOVO "Invia test reale (email)" -> testInviaDigestMatrix(email, token): genera e invia subito un digest profilato vero (usa la compilazione Matrix dell email; se assente, l ultima disponibile come campione, segnalato), soggetto [TEST], non tocca la coda, guardia quota email. | v4.24.8 — SWEEP "identita senza token" (3d del report): 31 funzioni admin chiamate dal frontend ricevevano forbidden su deploy anonimo perche _isCurrentUserAdmin_() era senza token (Session vuota). Aggiunto param token a tutte (Bandi_v5 fonti/quality/dedup, AgentSocial coda social, Crossref, AgentSetup diagnostica/test email, login pubblico on/off, config commerciale, Telegram status, migrazione FU17, test magic-link, export archivio, svuota cestino) + helper _tok_() nel frontend e token passato in TUTTI i 31 call-site. SBLOCCATA APPROVAZIONE NEWSLETTER: la pagina del link Telegram pretendeva Session.getActiveUser (sempre vuoto su anonimo) -> "Accesso richiesto" per chiunque; ora autorizza il possesso dell authToken segreto per-bozza (gia verificato), rimosso anche da adminConfirmSendWithToken. Verificati gia a posto: gate "Invia link" in-place (v4.24.5) e fallback ProfiliPro nel routing digest. Tool nuovo: tools/find-unguarded-admin.js. | v4.24.7 — FIX SCOPE login gate: OC._gateDoLogin vive in una IIFE separata da _postLoginApply_/_reloadApp_ -> la chiamata era un ReferenceError SILENZIOSO nel setTimeout ("Accesso riuscito!" ma overlay fermo, nessuna sessione applicata; stessa causa dei vecchi reload-mai-partiti dal gate). Export window._postLoginApply_ + window._wsSondaggiNextHtml_. | v4.24.6 — FIX profilo "Accesso non autorizzato" con sessione valida: con deploy ANONIMO Session.getActiveUser() e sempre vuoto, quindi _proGetUser_/getProfilo/saveProfilo ora ricevono il token di sessione dal frontend (payload.__token / parametro). Stesso pattern token-based del resto dell app. | v4.24.5 — FIX DEFINITIVO login/logout: la sandbox GAS per accessi ANONIMI blocca la navigazione del top frame (window.top.location.href senza effetto) -> il reload post-login non partiva MAI ("Accesso riuscito" ma Ospite) e il logout sembrava morto. Verificato in-browser con test reale (click Esci: chiamate server partite, nessuna navigazione). Ora login e logout sono IN-PLACE: _postLoginApply_ applica sessione+topbar+profilo senza reload e chiude i gate; doLogout passa subito alla UI ospite. La navigazione resta solo come best-effort dentro try/catch. Rimossa la pagina di conferma "Entra in Sinopia" (vicolo cieco). | v4.24.4 — FIX login che restava Ospite dopo "Accesso riuscito" (incognito/browser con storage di terze parti bloccato): il token ora viaggia nell URL al reload (?t=, stesso flusso magic-link) e doGet inietta la sessione server-side; prima il token viveva solo in localStorage, che nell iframe GAS in incognito non sopravvive al reload. + FIX deploy: manifest appsscript.json era scivolato ad access=ANYONE nel target clasp (webapp dietro login Google); ripristinato ANYONE_ANONYMOUS e sync-oc-to-gas.ps1 ora copia/verifica il manifest a ogni run. | v4.24.3 — FIX menu utente topbar: "Accedi / Registrati" compariva anche da loggati (e "Esci" anche da ospiti). Causa: .topbar-user-menu-item { display:block } sovrascriveva l attributo hidden impostato da setUser. Aggiunta regola .topbar-user-menu-item[hidden]{display:none}. | v4.24.2 — Autovalutazione rapida integrata nel funnel dell area personale: voce rimossa dalla sidebar; in La tua area, DOPO la conferma degli ambiti, appare la card "Prossimo passo: autovalutazione rapida" che suggerisce i sondaggi pertinenti agli ambiti scelti (mapping gestione/digital->amb5, accessibilita->amb2, audience->amb1+4, turismo->amb1+3, reti->amb4+5), esclude i gia compilati e si aggiorna live al toggle dei chip. Catalogo completo sempre raggiungibile (link "Tutte le autovalutazioni"). | v4.24.1 — Box di sblocco allineati al funnel: nei 2 modali ("Sblocca salvataggi/workspace" + popup "Sblocca tutte le funzioni") la CTA "Autovalutazione rapida" e sostituita da "Il tuo profilo" (2 min, ambiti di interesse) che porta a La tua area (ospite -> gate registrazione -> area col selettore). "Autovalutazione rapida" resta in sidebar. | v4.24.0 — Profilazione ambiti integrata in "La tua area": selettore 5 ambiti compilabile INLINE (chip toggle, salvataggio immediato via setAmbitoInteresse), invito finche vuoto. Il lettore che sceglie ambiti (senza Matrix) riceve la newsletter GENERALISTA FILTRATA su quegli ambiti (buildDigestHTML con 4o param filterAmbiti + ambiti attaccati ai generalisti in getDigestRecipientsByCohort). Matrix resta PRIORITARIO (digest sui 3 gap). Sidebar invariata; "Il mio profilo" resta per il profilo professionale completo. Helper ambitiFromDims/dimsFromAmbiti in Constants. | v4.23.10 — FIX login super-admin (completa il v4.23.7): il livello di accesso ora deriva ANCHE dall appartenenza alle liste admin/editor, non solo dal ruolo nel foglio Utenti. Prima un super-admin con riga "lettore"/vuota nel foglio otteneva livello 1 -> solo magic-link via email invece del login diretto (= "non mi fa loggare"). Ora super-admin = sempre livello 3 = login diretto col token. | v4.23.9 — FIX collegamento Telegram: i 2 sottosistemi leggevano il token da chiavi diverse (TELEGRAM_TOKEN per alert/bandi/digest/CRM via sendTelegram; TELEGRAM_BOT_TOKEN per autorizzazione invio newsletter via _tgSend_). Con una sola chiave impostata meta delle notifiche falliva (= "collegamento saltato"). Ora ENTRAMBI i mittenti accettano ENTRAMBE le chiavi (fallback). Aggiunta diagnosiTelegram() da eseguire nell editor per verifica + doppio test. | v4.23.8 — FIX anteprima digest "Errore: forbidden" (previewDigestPerEmail non riceveva il token admin -> ora lo passa). Razionalizzazione pagina Digest: legenda d uso + etichette chiare per azione (invio reale verde / crea bozza arancio / solo anteprima blu). Tab Lettori = ciclo completo (test reale via email); tab Profilati = i "test" generano BOZZE in coda, nessun invio; Anteprima per email = solo verifica a campione. | v4.23.7 — FIX accesso super-admin: loginConEmail ora riconosce SEMPRE il super-admin (s.straccini@gmail.com) e usa OC_ADMIN_DEFAULT_ come fallback se OC_ADMIN_EMAILS non e impostata. Prima, con property vuota + login pubblico disattivo, il super-admin restava bloccato fuori. | v4.23.6 — "Chi siamo" semplificato a placeholder (da definire) e brand precedente rimosso da TUTTE le superfici utente (servizi/KB/tassonomia/landing/report -> Sinopia). Restano solo metadati invisibili (commenti-header dei file) e contenuti storici admin (template LS3, KB, seed) che contengono affermazioni di merito da riscrivere editorialmente, non rinominare. | v4.23.5 — A7c completato: link di disiscrizione firmato (per-destinatario) anche nella newsletter admin (prima diceva solo "rispondi al messaggio" = gap GDPR). | v4.23.4 — Link informativa privacy spostati da duemilamusei.it/privacy a sinopiaconsulting.it/privacy (4 link in HomeView/Index + documento). Verificare www vs apex sull hosting. | v4.23.3 — Rebrand: rimossi i riferimenti "Duemilamusei" dalle superfici utente. Brand -> Sinopia (footer/titoli/eyebrow/landing/digest/survey); Titolare e dataController -> Sinopia Srl; email -> info@sinopiaconsulting.it. LASCIATI di proposito: riferimenti storici/di merito (Pesaro CIC 2024, studio dal 1988, "Servizi Duemilamusei"/KB), dominio duemilamusei.it (sito + URL privacy), commenti-header dei file e documenti interni. | v4.23.2 — FASE C (igiene sicurezza, additive): utm_handleRedirect ora valida la URL (solo http(s)) ed esegue escape -> niente open-redirect/XSS; sanitizzazione anti-formula sui campi esterni dello scanner news (saveItem); registro trattamenti art.30 in docs. DIFFERITO (non bloccante): schema URL nelle card frontend, rate-limit per-IP, altri scanner (bandi/podcast), dark-mode 3 modali statici, spacchettamento Codice.js. | v4.23.1 — FASE B (UX/grafica, additive): banner di errore sulla home se i contenuti non caricano (con Riprova), CTA "Valuta il tuo museo" nell hero, onerror sulle cover (niente icona rotta), topbar piu pulita su telefono (<=640px nascondi ricerca), fallback versione sidebar allineato, dark-mode del modale di login. DIFFERITO: dark-mode dei 3 modali statici (registrazione/newsletter/prenotazione) — richiede revisione dei colori del testo per evitare scuro-su-scuro. | v4.23.0 — Pre-pilota FASE A. SICUREZZA: gate _requireAdminGSR_ su crm_listLeads/getMailingList/getMailingListSummary/crm_unsubscribe (niente PII a anonimi via google.script.run); crm_notifyHotLead reso interno. PRIVACY: niente email/nome su Telegram; forgetMyData esteso a tutti i fogli con PII; registro ConsensiLog (data+versione) alla registrazione; rimossa falsa promessa cancellazione CRM. PRODUZIONE: guardia quota email sul magic-link. Informativa Sinopia Srl in docs/INFORMATIVA_PRIVACY_SINOPIA.md. DIFFERITO (rischio/caller): rinomina crm_recordEvent + gate roc_*, footer unsubscribe newsletter admin, FASE B/C. | v4.22.4 — Accessibilita WCAG 2.1 AA (quick wins): contrasto --ink-4 (#A1A1A6 2.6:1 -> #74747A 4.7:1); focus ring VISIBILE su .btn e .br-act (prima ring accent-soft ~1.1:1); login modal _gateOspite con role=dialog + aria-modal + aria-label, input con aria-label, _gateMsg role=alert; menu utente con aria-haspopup/aria-expanded + role=menu. FASE 2 (da fare): tastiera sulle card cliccabili (role=button+tabindex+keydown Enter/Space), focus-trap + Esc nei modali, target tocco >=44px. | v4.22.3 — Logout senza window.confirm() nativo (attrito + bloccava il test automatico del browser; logout immediato). | v4.22.2 — FIX pagina bianca al RE-LOGIN dopo logout: i reload post-login usavano location.reload(), che nella sandbox IFRAME di GAS ricarica l\'URL googleusercontent transitorio, dando pagina bianca. Fix: helper _reloadApp_() che naviga il TOP frame (window.top.location.href, stesso pattern di doLogout) in _gateDoLogin, _gateDoLoginWith e nel bottone Ricarica-e-accedi. | v4.22.1 — Anti "pagina bianca" all\'avvio. (1) KeepWarm_v1.js: self-ping periodico a ?warm=1 (early-return leggero in doGet) per ridurre i cold-start del web app; trigger ogni 5 min via setupKeepWarmTrigger(). (2) Index.html: boot-splash brandizzato Sinopia che copre il lampo di parse client e si auto-nasconde (JS + failsafe CSS a 6s, non puo restare bloccato). Modifiche 100% additive: nessun impatto sul flusso esistente. Da eseguire post-deploy UNA VOLTA: setupKeepWarmTrigger().';

// ============================================================================
// SOGLIE OPERATIVE
// ============================================================================

var OC_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

var OC_BANDI_URGENTI_DAYS = 7;     // soglia "in scadenza" per la home
var OC_AUTO_ARCH_NEWS_DAYS = 30;   // dopo quanti giorni archiviare news non salvate
var OC_AUTO_ARCH_BANDI_DAYS = 30;  // dopo quanti giorni dalla scadenza archiviare bandi
var OC_AUTO_DELETE_MONTHS = 12;    // dopo quanti mesi eliminare definitivamente archiviati

// v4.20 — Digest dedup e subject centralizzati
var OC_DIGEST_DEDUP_DAYS = 5;
var OC_DIGEST_SUBJECT_NEWSLETTER = 'Sinopia · Digest settimanale';
var OC_DIGEST_SUBJECT_MATRIX = 'Sinopia · Digest personalizzato per il tuo museo';
var OC_DIGEST_SUBJECT_AGENT_PREFIX = 'Sinopia · ';

// v4.18.10 (2026-05-12) — URL del calendario condiviso per prenotazione consulenza gratuita
// FALLBACK statico. Il valore attivo viene letto da ScriptProperties via getCommercialConfig()
// (configurabile da card admin "Setup commerciale" — più professionale di editare codice).
var OC_CALENDAR_URL = 'https://calendar.app.google/SghRRPLHFGcsEzvk7';

// v4.18.18 (2026-05-13) — URL PDF Musei Sensibili (documento strategico scaricabile dalla home)
// Stesso pattern: fallback statico + valore dinamico in ScriptProperties.
var OC_MUSEI_SENSIBILI_URL = '';

// v4.18.33 (2026-05-13) — URL branding visivo (logo sidebar + immagine hero home)
// Caricare i file su Drive con permission "Chiunque con link può visualizzare"
// e incollare l'URL nella card admin "Setup commerciale".
// Formato URL Drive supportato: drive.google.com/file/d/{ID}/view oppure /uc?id={ID}
//
// ⚠ PRE GO-LIVE: chiamare saveCommercialConfig({calendarUrl, museiSensibiliUrl, logoUrl, heroImageUrl})
//   dalla card admin "Setup commerciale" per popolare tutti e 4 i valori.
//   Senza questa configurazione, logo, hero, calendario e PDF Musei Sensibili
//   resteranno vuoti in produzione. La funzione è definita più avanti in questo file (riga ~299).
var OC_LOGO_URL = '';
var OC_HERO_IMAGE_URL = '';

// ScriptProperty keys
var OC_PROP_KEY_COMMERCIAL = 'OC_COMMERCIAL_CONFIG_V1';

// ============================================================================
// API PUBBLICA — chiamata da Navigation.html in fase di hydrate
// ============================================================================

/**
 * Restituisce al frontend tutte le costanti utili per il rendering.
 * Chiamata via google.script.run.getOcConstants() in fase di hydrate.
 *
 * @return {Object}
 *   {
 *     ambiti:  Array<{id,num,nome,nomeBreve,desc,color,colorCls,cssVar}>,
 *     version: { number, date, notes },
 *     soglie:  { bandiUrgentiDays, autoArchNewsDays, ... }
 *   }
 */
function getOcConstants() {
  return {
    ambiti: OC_AMBITI,
    version: {
      number: OC_VERSION,
      date:   OC_VERSION_DATE,
      notes:  OC_VERSION_NOTES
    },
    soglie: {
      bandiUrgentiDays:  OC_BANDI_URGENTI_DAYS,
      autoArchNewsDays:  OC_AUTO_ARCH_NEWS_DAYS,
      autoArchBandiDays: OC_AUTO_ARCH_BANDI_DAYS,
      autoDeleteMonths:  OC_AUTO_DELETE_MONTHS
    },
    // v4.18.10/v4.18.18/v4.18.33 — Config commerciale (priorità: ScriptProperties → fallback Constants.js)
    calendarUrl:        _getCommercialField_('calendarUrl', OC_CALENDAR_URL),
    museiSensibiliUrl:  _getCommercialField_('museiSensibiliUrl', OC_MUSEI_SENSIBILI_URL),
    logoUrl:            _normalizeDriveUrl_(_getCommercialField_('logoUrl', OC_LOGO_URL)),
    heroImageUrl:       _normalizeDriveUrl_(_getCommercialField_('heroImageUrl', OC_HERO_IMAGE_URL))
  };
}

/**
 * v4.18.41 (2026-05-15) — Canonicalizza un URL per uso in chiavi di deduplicazione.
 *
 * Normalizza: lowercase, rimuove www., protocollo, trailing slash, anchor,
 * parametri di tracking (utm_*, fbclid, gclid, msclkid, ref, source, share).
 * Stessa risorsa con varianti diverse → stessa chiave.
 *
 * Esempi:
 *   https://www.Example.com/Articolo/?utm_source=feed#top
 *   http://example.com/Articolo
 *   → "example.com/articolo"
 *
 * @param {string} url
 * @return {string} URL canonicalizzato (chiave di dedup) — '' se url vuoto
 */
function _canonicalUrl_(url) {
  if (!url) return '';
  var u = String(url).trim().toLowerCase();
  // Rimuovi protocollo
  u = u.replace(/^https?:\/\//, '');
  // Rimuovi www.
  u = u.replace(/^www\./, '');
  // Rimuovi anchor (#frammenti)
  u = u.replace(/#.*$/, '');
  // Rimuovi parametri di tracking
  u = u.replace(/[?&](utm_[a-z]+|fbclid|gclid|msclkid|ref|source|share|mc_cid|mc_eid|_ga|_gl)=[^&]*/g, '');
  // Pulisci ?& orfani residui
  u = u.replace(/\?&/, '?').replace(/&&+/g, '&').replace(/\?$/, '').replace(/&$/, '');
  // Rimuovi trailing slash (dopo aver tolto query)
  u = u.replace(/\/+$/, '');
  return u;
}

/**
 * v4.18.35 — Risolve URL Drive in data URI per embed in <img src>.
 *
 * Apps Script iframe blocca quasi tutti gli endpoint Drive (thumbnail, uc?export=view, lh3…)
 * per anti-clickjacking. Soluzione: leggere il file via DriveApp server-side e
 * ritornare il binario come data:image/...;base64,... — embeddato nel payload getOcConstants.
 *
 * Se il file non è accessibile via DriveApp (es. file di altro proprietario senza condivisione
 * esplicita), fallback all'URL Drive normalizzato (potrebbe comunque non rendere).
 *
 * @param {string} url - URL Drive in qualunque forma
 * @return {string} data URI oppure URL fallback
 */
function _normalizeDriveUrl_(url) {
  if (!url) return '';
  var s = String(url).trim();
  if (/^data:image\//i.test(s)) return s; // già data URI

  // Estrai ID Drive da tutte le forme note
  var id = '';
  var m = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  if (!id) { var m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/); if (m2) id = m2[1]; }
  if (!id) return s; // URL esterno, non Drive

  // Cache lookup (6h) — evita re-encoding ad ogni getOcConstants
  var cache = null, cacheKey = 'oc_asset_v1_' + id;
  try { cache = CacheService.getScriptCache(); } catch(_){}
  if (cache) {
    var cached = cache.get(cacheKey);
    if (cached) return cached;
  }

  // Prova a leggere via DriveApp e ritornare data URI
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    var mime = blob.getContentType() || 'image/png';
    if (mime.indexOf('image/') !== 0) return s; // non è un'immagine
    var b64 = Utilities.base64Encode(blob.getBytes());
    var dataUri = 'data:' + mime + ';base64,' + b64;
    // Cache solo se < 100KB (limite CacheService per chiave)
    if (cache && dataUri.length < 99000) {
      try { cache.put(cacheKey, dataUri, 21600); } catch(_){}
    }
    return dataUri;
  } catch(e) {
    Logger.log('_normalizeDriveUrl_ DriveApp fallita per ID=' + id + ': ' + e.message);
    return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
  }
}

// ============================================================================
// v4.18.18 (2026-05-13) — CONFIG COMMERCIALE DINAMICA (ScriptProperties)
// ----------------------------------------------------------------------------
// Permette di configurare URL operativi (calendario consulenza, PDF Musei Sensibili,
// e in futuro altri) direttamente dalla card admin senza editare codice/deployare.
// Storage: chiave OC_PROP_KEY_COMMERCIAL in ScriptProperties (JSON).
// ============================================================================

/**
 * Helper privato: legge un campo dalla config commerciale (ScriptProperties),
 * fallback al valore statico passato come default.
 */
function _getCommercialField_(field, defaultValue) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(OC_PROP_KEY_COMMERCIAL);
    if (!raw) return defaultValue || '';
    var cfg = JSON.parse(raw);
    return (cfg && typeof cfg[field] === 'string' && cfg[field]) ? cfg[field] : (defaultValue || '');
  } catch(e) { return defaultValue || ''; }
}

/**
 * Endpoint admin: ritorna la config commerciale attuale (per popolare form).
 */
function getCommercialConfig(token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token)) return { ok:false, error:'forbidden' };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(OC_PROP_KEY_COMMERCIAL);
    var cfg = raw ? JSON.parse(raw) : {};
    return {
      ok: true,
      calendarUrl: cfg.calendarUrl || OC_CALENDAR_URL || '',
      museiSensibiliUrl: cfg.museiSensibiliUrl || OC_MUSEI_SENSIBILI_URL || '',
      logoUrl: cfg.logoUrl || OC_LOGO_URL || '',
      heroImageUrl: cfg.heroImageUrl || OC_HERO_IMAGE_URL || '',
      lastUpdate: cfg.lastUpdate || ''
    };
  } catch(e) { return { ok:false, error: e.message }; }
}

/**
 * Endpoint admin: salva la config commerciale in ScriptProperties.
 * @param {Object} payload — { calendarUrl, museiSensibiliUrl, logoUrl, heroImageUrl }
 */
function saveCommercialConfig(payload, token) {
  if (typeof _isCurrentUserAdmin_ === 'function' && !_isCurrentUserAdmin_(token || (payload && payload.__token))) return { ok:false, error:'forbidden' };
  try {
    payload = payload || {};
    // Validazione URL (basic): se non vuoti, devono iniziare con http(s):// (data URI accettati per i 2 visual)
    var cal  = String(payload.calendarUrl || '').trim();
    var ms   = String(payload.museiSensibiliUrl || '').trim();
    var lg   = String(payload.logoUrl || '').trim();
    var hi   = String(payload.heroImageUrl || '').trim();
    function isUrlOk(u) { return /^https?:\/\//i.test(u) || /^data:image\//i.test(u); }
    if (cal && !/^https?:\/\//i.test(cal)) return { ok:false, error:'URL calendario non valido' };
    if (ms  && !/^https?:\/\//i.test(ms))  return { ok:false, error:'URL Musei Sensibili non valido' };
    if (lg  && !isUrlOk(lg))               return { ok:false, error:'URL logo non valido' };
    if (hi  && !isUrlOk(hi))               return { ok:false, error:'URL immagine hero non valido' };

    // v4.25.13 — calendarUrl NON modificabile da webapp (hardcoded in OC_CALENDAR_URL)
    var cfg = {
      calendarUrl: OC_CALENDAR_URL,
      museiSensibiliUrl: ms,
      logoUrl: lg,
      heroImageUrl: hi,
      lastUpdate: new Date().toISOString()
    };
    PropertiesService.getScriptProperties().setProperty(OC_PROP_KEY_COMMERCIAL, JSON.stringify(cfg));
    Logger.log('saveCommercialConfig OK: cal=' + (cal?'set':'empty') + ' ms=' + (ms?'set':'empty') + ' lg=' + (lg?'set':'empty') + ' hi=' + (hi?'set':'empty'));
    return { ok:true, calendarUrl:cal, museiSensibiliUrl:ms, logoUrl:lg, heroImageUrl:hi, lastUpdate:cfg.lastUpdate };
  } catch(e) { return { ok:false, error: e.message }; }
}

// v4.18.39 (audit 2026-05-14) — Rimossa getAmbitoById(id): helper definito ma mai chiamato.
//   Se necessario in futuro, lookup diretto: OC_AMBITI.filter(a => a.id === Number(id))[0]

// ============================================================================
// NOTA SU ALIAS BACKWARD-COMPATIBLE
// ----------------------------------------------------------------------------
// In una prima versione di questo file erano presenti le dichiarazioni:
//   var AMBITO_LABEL = { ... };
//   var AMBITO_COLOR = { ... };
//   var AMBITO_DESC  = { ... };
// concepite come alias backward-compatible per non dover migrare subito i
// call site legacy. Sono state RIMOSSE perché in Google Apps Script tutti i
// file .gs condividono lo stesso namespace globale, e Codice.gs dichiara già
// `const AMBITO_LABEL` e `const AMBITO_COLOR` (vedi Codice.gs righe 42 e 47).
// La doppia dichiarazione causava SyntaxError "Identifier 'AMBITO_LABEL' has
// already been declared" bloccando l'intero progetto.
//
// Per ora i call site legacy continuano a usare le costanti dichiarate in
// Codice.gs. La migrazione progressiva verso OC_AMBITI / getAmbitoById /
// getOcConstants() avverrà nei prossimi sprint, sostituendo i riferimenti
// uno alla volta nei file che li usano (Codice.gs, Addon_v42.gs,
// Sprint0_Module.gs).
// ============================================================================

// ============================================================================
// LANDING PUBBLICA — flag per servire LandingPublic.html come homepage anonima
// ============================================================================

/** Attiva la landing pubblica come homepage di default per utenti anonimi. */
function enablePublicLanding() {
  PropertiesService.getScriptProperties().setProperty('OC_PUBLIC_LANDING', 'true');
  Logger.log('Landing pubblica ATTIVATA. URL base servira LandingPublic.html per anonimi.');
  return { ok: true, status: 'enabled' };
}

/** Disattiva la landing pubblica (torna a servire la webapp completa). */
function disablePublicLanding() {
  PropertiesService.getScriptProperties().deleteProperty('OC_PUBLIC_LANDING');
  Logger.log('Landing pubblica DISATTIVATA. URL base servira la webapp completa.');
  return { ok: true, status: 'disabled' };
}

// ============================================================================
// E1 — EDITORIALE SETTIMANALE "CAPO REDATTORE" (v4.22)
// ============================================================================

/** Nome foglio per le bozze editoriali */
var OC_EDITORIALI_SHEET = 'Editoriali';

/** Headers del foglio Editoriali */
var OC_EDITORIALI_HEADERS = [
  'id','settimana','data_generazione','titolo','testo',
  'pilastri_json','stato','approvato_da','data_approvazione','note',
  'firma','foto_url'  // v4.25.14 — RIPRISTINO regressione 1ff01773 (da 2775252c)
];

/** Fonti considerate autorevoli — il brief dà peso a contenuti da queste fonti */
var OC_FONTI_AUTOREVOLI = [
  'symbola', 'fitzcarraldo', 'federculture',
  'icom', 'icom italia', 'nemo',
  'mic', 'ministero della cultura',
  'fondazione cariplo', 'compagnia di san paolo',
  'artribune', 'il giornale dell\'arte',
  'museumnext', 'aib',
  'treccani', 'iccd'
];

/** Parametri editoriale */
var OC_EDITORIALE_CONFIG = {
  MIN_PAROLE: 250,
  MAX_PAROLE: 400,
  FINESTRA_SETTIMANA_GG: 7,     // contenuti degli ultimi 7 giorni
  FINESTRA_MEDIA_SETTIMANE: 4,  // media di confronto per delta trend
  MAX_ENTITA_BRIEF: 10,         // top entità per il brief
  MAX_NORME_BRIEF: 5,
  MAX_STUDI_BRIEF: 5,
  MAX_DINAMICO_BRIEF: 4,
  MAX_NEWS_AUTOREVOLI_BRIEF: 6
};

// ============================================================================
// FINE Constants.gs
// ============================================================================
