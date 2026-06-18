/**
 * test-fixes.js — Suite di test per le fix della sessione 2026-06-18.
 * Carica il codice GAS REALE in un sandbox vm con i global mockati ed esercita
 * le funzioni pure: _fasTedTesto_, gate FAS_BDNCP_CULTURA_RX, getEditoria.
 *
 * Eseguire: node tools/test-fixes.js
 * NB: cartella tools/ è in .claspignore → non viene mai pushata su GAS.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// --- Sandbox con Proxy: identificatori sconosciuti → undefined (no ReferenceError a load) ---
const logs = [];
const realGlobals = {
  Logger: { log: (m) => logs.push(String(m)) },
  Session: { getScriptTimeZone: () => 'Europe/Rome' },
  Utilities: { formatDate: () => '01/01/2026' },
  console, JSON, Math, Date, RegExp, Number, String, Array, Object, Boolean,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
};
const ctx = new Proxy(realGlobals, {
  has: () => true,                                   // ogni identificatore "esiste"
  get: (t, k) => (k in t ? t[k] : undefined),         // ...e vale undefined se non definito
  set: (t, k, v) => { t[k] = v; return true; }
});
vm.createContext(ctx);

// Carica i file reali (solo dichiarazioni + literal al top-level → load sicuro)
try {
  vm.runInContext(read('FontiApiStrutturate.js') + '\n' + read('UltimiBandi.js') + '\n' + read('Newsletter_v44.js'), ctx);
} catch (e) {
  console.error('LOAD FAILED:', e.message);
  process.exit(2);
}

// --- Mini framework asserzioni ---
let pass = 0, fail = 0;
const fails = [];
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; fails.push(`${name}\n     atteso: ${e}\n     ottenuto: ${a}`); }
}
function ok(cond, name) { if (cond) pass++; else { fail++; fails.push(name); } }

// ============================================================================
// TEST 1 — _fasTedTesto_  (estrazione testo da stringa/array/oggetto multilingua)
// ============================================================================
const ted = ctx._fasTedTesto_;
ok(typeof ted === 'function', 'T1.0 _fasTedTesto_ è definita');
eq(ted('  ciao   mondo '), 'ciao mondo', 'T1.1 stringa con spazi collassati');
eq(ted(['', 'primo', 'secondo']), 'primo', 'T1.2 array → primo non vuoto');
eq(ted({ eng: 'english', ita: 'italiano' }), 'italiano', 'T1.3 oggetto multilingua preferisce ITA');
eq(ted({ eng: 'english' }), 'english', 'T1.4 oggetto solo ENG');
eq(ted({ fra: 'francais' }), 'francais', 'T1.5 fallback prima lingua disponibile');
eq(ted(null), '', 'T1.6 null → vuoto');
eq(ted(undefined), '', 'T1.7 undefined → vuoto');
eq(ted(123), '123', 'T1.8 numero → stringa');
eq(ted([{ ita: 'annidato' }]), 'annidato', 'T1.9 array di oggetti (ricorsione)');
eq(ted({}), '', 'T1.10 oggetto vuoto → vuoto');

// ============================================================================
// TEST 2 — FAS_BDNCP_CULTURA_RX  (gate pertinenza: titolo+CPV, non nome ente)
// ============================================================================
const RX = ctx.FAS_BDNCP_CULTURA_RX;
// NB: regex creata nel sandbox vm → instanceof cross-realm fallirebbe; verifico l'interfaccia.
ok(RX && typeof RX.test === 'function', 'T2.0 FAS_BDNCP_CULTURA_RX è una RegExp utilizzabile');
const gate = (titolo, cpv) => RX.test((titolo + ' ' + cpv).toLowerCase());

// Casi REALI dallo screenshot — devono essere SCARTATI (match era solo sul nome ente)
ok(!gate('Accordo quadro servizi cimiteriali gestione cimiteri di Maranello', 'Servizi di manutenzione cimiteriale'), 'T2.1 Maranello cimiteri → SCARTA');
ok(!gate('Procedura trattamento frazione multimateriale rifiuti porta a porta', 'Servizi di trattamento e smaltimento di rifiuti'), 'T2.2 Latina rifiuti → SCARTA');
ok(!gate('Gestione bar interno', 'Servizi di gestione bar'), 'T2.3 gestione bar → SCARTA');
ok(!gate('Affidamento servizio di assicurazione proprietà', 'Servizi di assicurazione di proprietà'), 'T2.4 assicurazione → SCARTA');
ok(!gate('Manutenzione aree verdi e terreni', 'Servizi di manutenzione terreni'), 'T2.5 manutenzione terreni → SCARTA');
ok(!gate('Servizio di ristorazione scolastica', 'Servizi di ristorazione'), 'T2.6 ristorazione NON deve matchare /restaur/');
ok(!gate('Consulenza in sistemi informatici', 'Servizi di consulenza informatica'), 'T2.7 consulenza IT → SCARTA');

// Casi cultura REALI — devono essere ACCETTATI
ok(gate('Servizi di biglietteria e custodia dei musei Kosmos', 'Servizi di musei'), 'T2.8 musei Pavia → ACCETTA');
ok(gate('Restauro degli affreschi della cappella', 'Lavori di restauro e manutenzione'), 'T2.9 restauro → ACCETTA');
ok(gate('Gestione della biblioteca comunale', 'Servizi di biblioteche'), 'T2.10 biblioteca → ACCETTA');
ok(gate('Riordino e inventariazione archivio storico', 'Servizi di archivi'), 'T2.11 archivio → ACCETTA');
ok(gate('Servizi di pulizia del Museo Civico', 'Servizi di pulizia'), 'T2.12 pulizia DI un museo (titolo cita museo) → ACCETTA');
ok(gate('Allestimento mostra fotografica', 'Servizi di organizzazione di mostre'), 'T2.13 mostra/allestimento → ACCETTA');
ok(gate('Scavo archeologico area forense', 'Lavori archeologici'), 'T2.14 archeolog → ACCETTA');
ok(gate('Stagione teatrale 2026', 'Servizi teatrali'), 'T2.15 teatro → ACCETTA');

// ============================================================================
// TEST 3 — getEditoria  (normalizzazione pubblicazioni + podcast)
// ============================================================================
// Inietta provider mockati nel sandbox
vm.runInContext(`
  getLibriListV42 = function(n){ return [
    { titolo:'Libro Recente', autore:'Aut A', editore:'Editore X', fonte:'FonteL', link:'http://libro', descrizione:'desc libro', isRecente:true }
  ]; };
  getPodcastListV42 = function(n){ return [
    { titolo:'Podcast Vecchio', show:'Show Y', link:'http://pod', tematica:'tema pod', isRecente:false }
  ]; };
`, ctx);

const ge = ctx.getEditoria;
ok(typeof ge === 'function', 'T3.0 getEditoria è definita');
const res = ge(5);
ok(res && res.ok === true, 'T3.1 ritorna {ok:true}');
ok(Array.isArray(res.items) && res.items.length === 2, 'T3.2 2 item (1 libro + 1 podcast)');
// Recente (libro) deve venire prima del non-recente (podcast)
eq(res.items[0].tipo, 'pubblicazione', 'T3.3 ordinamento: recente (libro) per primo');
eq(res.items[0], { tipo:'pubblicazione', titolo:'Libro Recente', autore:'Aut A', fonte:'Editore X', url:'http://libro', note:'desc libro' }, 'T3.4 mapping libro corretto + nessun _recente residuo');
eq(res.items[1], { tipo:'podcast', titolo:'Podcast Vecchio', autore:'Show Y', fonte:'Show Y', url:'http://pod', note:'tema pod' }, 'T3.5 mapping podcast corretto');
ok(!('_recente' in res.items[0]) && !('_recente' in res.items[1]), 'T3.6 flag interno _recente rimosso');
// limit rispettato
eq(ge(1).items.length, 1, 'T3.7 limit=1 → 1 solo item (il recente)');

// Resilienza: provider assenti → items vuoto, niente crash
vm.runInContext(`getLibriListV42 = undefined; getPodcastListV42 = undefined;`, ctx);
const resEmpty = ge(5);
eq(resEmpty, { ok:true, items:[] }, 'T3.8 provider assenti → {ok:true, items:[]} (no crash)');

// ============================================================================
// TEST 4 — cleanupBandiNonCulturaBdncp  (bonifica record esistenti, foglio finto)
// ============================================================================
// Foglio finto: header + righe miste (BDNCP cultura, BDNCP rumore, non-BDNCP, già archiviato)
const HEADER = ['ID', 'Titolo', 'Ente', 'Settore', 'FonteNome', 'StatoRecord'];
function makeFakeSheet() {
  const rows = [
    HEADER,
    ['1', 'Gestione biblioteca comunale', 'Comune X', 'Servizi di biblioteche', 'BDNCP — Pubblicità Legale ANAC', 'attivo'],            // KEEP (cultura)
    ['2', 'Servizi cimiteriali di Maranello', 'Maranello Patrimonio SRL', 'Servizi di manutenzione cimiteriale', 'BDNCP — Pubblicità Legale ANAC', 'attivo'], // ARCHIVE
    ['3', 'Trattamento rifiuti urbani', 'Azienda Beni Comuni', 'Servizi di trattamento di rifiuti', 'BDNCP', 'attivo'],                  // ARCHIVE
    ['4', 'Servizio di gestione bar', 'Ente Y', 'Servizi di gestione bar', 'TED — FAS v3', 'attivo'],                                    // SKIP (non BDNCP)
    ['5', 'Servizio di assicurazione', 'Ente Z', 'Servizi di assicurazione', 'BDNCP', 'archiviato']                                      // SKIP (già archiviato)
  ];
  const writes = [];
  const sheet = {
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (r, c) => ({ setValue: (v) => writes.push({ row: r, col: c, val: v }) })
  };
  return { sheet, writes };
}
let fake = makeFakeSheet();
vm.runInContext('getMainSS = function(){ return __FAKE_SS__; };', ctx);
ctx.__FAKE_SS__ = { getSheetByName: (name) => (name === 'Bandi_v5' ? fake.sheet : null) };

const clean = ctx.cleanupBandiNonCulturaBdncp;
ok(typeof clean === 'function', 'T4.0 cleanupBandiNonCulturaBdncp è definita');

// Dry-run: conta ma non scrive
const dry = clean(true);
ok(dry.ok && dry.dryRun === true, 'T4.1 dry-run flag corretto');
eq(dry.esaminatiBdncp, 3, 'T4.2 esaminati 3 BDNCP attivi (righe 1,2,3; salta non-BDNCP e già archiviato)');
eq(dry.nonCultura, 2, 'T4.3 2 non-cultura individuati (cimiteri + rifiuti)');
eq(fake.writes.length, 0, 'T4.4 dry-run NON scrive nulla');

// Apply: archivia le 2 righe rumore (sheet row = indice+1 → righe 3 e 4)
fake = makeFakeSheet();
ctx.__FAKE_SS__ = { getSheetByName: (name) => (name === 'Bandi_v5' ? fake.sheet : null) };
const applied = clean(false);
eq(applied.nonCultura, 2, 'T4.5 apply: 2 non-cultura');
eq(fake.writes.length, 2, 'T4.6 apply: esattamente 2 scritture');
ok(fake.writes.every(w => w.val === 'archiviato'), 'T4.7 scrive sempre "archiviato"');
const StatoCol = HEADER.indexOf('StatoRecord') + 1;
ok(fake.writes.every(w => w.col === StatoCol), 'T4.8 scrive nella colonna StatoRecord');
eq(fake.writes.map(w => w.row).sort(), [3, 4], 'T4.9 archivia le righe giuste (cimiteri r3, rifiuti r4)');

// ============================================================================
// TEST 5 — buildNewsletterHtml_  (render sezione "Dalla ricerca")
// ============================================================================
const build = ctx.buildNewsletterHtml_;
ok(typeof build === 'function', 'T5.0 buildNewsletterHtml_ è definita');
let html = '';
let buildErr = null;
try {
  html = build({
    soggetto: 'Test', webUrl: '',
    bandiUrgenti: [], bandiRecenti: [], news: [], podcast: [],
    editoria: [
      { tipo: 'pubblicazione', titolo: 'Libro Test', autore: 'Aut', fonte: 'Editore', url: 'http://libro', note: 'nota libro' },
      { tipo: 'podcast', titolo: 'Podcast Test', autore: 'Show', fonte: 'Show', url: 'http://pod', note: 'nota pod' }
    ]
  });
} catch (e) { buildErr = e.message; }
ok(!buildErr, 'T5.1 build senza eccezioni' + (buildErr ? ' → ' + buildErr : ''));
ok(typeof html === 'string' && html.length > 0, 'T5.2 produce HTML');
ok(html.indexOf('Dalla ricerca') >= 0, 'T5.3 contiene header sezione "Dalla ricerca"');
ok(html.indexOf('Libro Test') >= 0, 'T5.4 renderizza titolo pubblicazione');
ok(html.indexOf('Podcast Test') >= 0, 'T5.5 renderizza titolo podcast');
ok(html.indexOf('http://libro') >= 0, 'T5.6 include il link della pubblicazione');

// Editoria vuota → nessuna sezione "Dalla ricerca" (no header orfano)
let htmlEmpty = '';
try { htmlEmpty = build({ soggetto: 'T', webUrl: '', bandiUrgenti: [], bandiRecenti: [], news: [], podcast: [], editoria: [] }); } catch (e) { htmlEmpty = 'ERR:' + e.message; }
ok(htmlEmpty.indexOf('Dalla ricerca') < 0, 'T5.7 editoria vuota → nessuna sezione orfana');

// ============================================================================
// TEST 6 — FAS_TED_CULTURA_RX  (gate pertinenza TED, bilingue IT/EN)
// ============================================================================
const TRX = ctx.FAS_TED_CULTURA_RX;
ok(TRX && typeof TRX.test === 'function', 'T6.0 FAS_TED_CULTURA_RX è una RegExp utilizzabile');
const tgate = (s) => TRX.test(String(s).toLowerCase());
// Cultura (IT + EN) → ACCETTA
ok(tgate('Museum services and conservation'), 'T6.1 EN museum → accetta');
ok(tgate('Cultural heritage restoration works'), 'T6.2 EN cultural heritage/restoration → accetta');
ok(tgate('Servizi di restauro affreschi'), 'T6.3 IT restauro → accetta');
ok(tgate('Gestione teatro comunale'), 'T6.4 IT teatro → accetta');
ok(tgate('Library and archive digitisation'), 'T6.5 EN library/archive → accetta');
ok(tgate('Valorizzazione del patrimonio culturale'), 'T6.6 IT patrimonio culturale → accetta');
// Non-cultura → SCARTA
ok(!tgate('Waste management and disposal services'), 'T6.7 EN waste → scarta');
ok(!tgate('Road construction and asphalt works'), 'T6.8 EN road construction → scarta');
ok(!tgate('Servizio di assicurazione e brokeraggio'), 'T6.9 IT assicurazione → scarta');
ok(!tgate('Insurance and financial advisory'), 'T6.10 EN insurance → scarta');
// "restoration" (EN) deve matchare via /restor/, "ristorazione" (IT catering) NO
ok(tgate('building restoration'), 'T6.11 EN restoration → accetta (/restor/)');
ok(!tgate('servizio di ristorazione scolastica'), 'T6.12 IT ristorazione NON deve matchare');

// ============================================================================
// TEST 7 — _fasProvinciaRegione_  (mappa provincia → regione)
// ============================================================================
const pr = ctx._fasProvinciaRegione_;
ok(typeof pr === 'function', 'T7.0 _fasProvinciaRegione_ è definita');
eq(pr('Firenze'), 'Toscana', 'T7.1 Firenze → Toscana');
eq(pr('Caserta'), 'Campania', 'T7.2 Caserta → Campania');
eq(pr('Milano'), 'Lombardia', 'T7.3 Milano → Lombardia');
eq(pr('Bari'), 'Puglia', 'T7.4 Bari → Puglia');
eq(pr('Trieste'), 'Friuli-Venezia Giulia', 'T7.5 Trieste → FVG');
eq(pr('Sassari'), 'Sardegna', 'T7.6 Sassari → Sardegna');
eq(pr("Reggio nell'Emilia"), 'Emilia-Romagna', 'T7.7 variante Reggio Emilia');
eq(pr('Reggio di Calabria'), 'Calabria', 'T7.8 variante Reggio Calabria');
eq(pr('  trieste  '), 'Friuli-Venezia Giulia', 'T7.9 case+spazi normalizzati');
eq(pr('Provincia Inesistente'), '', 'T7.10 non mappata → vuoto (fallback gestito nel save)');
eq(pr(''), '', 'T7.11 vuoto → vuoto');

// ============================================================================
// TEST 8 — _fasSaveBando_  (scrittura Soggetti/Importo nelle colonne giuste)
// ============================================================================
// Ordine colonne appendRow: 0 ID,1 Fingerprint,2 DataRilevamento,3 Titolo,4 Ente,5 Livello,
// 6 Regione,7 Settore,8 Soggetti,9 Importo,10 Cofin,11 Scadenza,...
let captured = null;
vm.runInContext('getMainSS = function(){ return { getSheetByName: function(){ return { appendRow: function(r){ __CAP__(r); } }; } }; };', ctx);
ctx.__CAP__ = (r) => { captured = r; };

const save = ctx._fasSaveBando_;
ok(typeof save === 'function', 'T8.0 _fasSaveBando_ è definita');
// Con soggetti + importo
save({ titolo: 'X', ente: 'E', regione: 'Toscana', soggetti: 'Firenze', importo: 225948.4, settore: 'Servizi di musei' });
ok(captured !== null, 'T8.1 appendRow chiamato');
eq(captured[6], 'Toscana', 'T8.2 col Regione');
eq(captured[8], 'Firenze', 'T8.3 col Soggetti popolata');
eq(captured[9], 225948.4, 'T8.4 col Importo numerica popolata');
// Backward-compat: parser che non passano soggetti/importo → ''
captured = null;
save({ titolo: 'Y', ente: 'E2' });
eq(captured[8], '', 'T8.5 Soggetti vuoto se non passato (backward-compat)');
eq(captured[9], '', 'T8.6 Importo vuoto se non passato (backward-compat)');

// ============================================================================
// TEST 9 — _fasIsScaduta_  (skip bandi con scadenza passata)
// ============================================================================
const isScaduta = ctx._fasIsScaduta_;
ok(typeof isScaduta === 'function', 'T9.0 _fasIsScaduta_ è definita');
ok(isScaduta('2020-01-01') === true, 'T9.1 data passata → scaduta');
ok(isScaduta('2099-12-31') === false, 'T9.2 data futura → non scaduta');
ok(isScaduta('2020-07-12T13:00:00Z') === true, 'T9.3 ISO con orario passato → scaduta');
ok(isScaduta('') === false, 'T9.4 vuoto → non scaduta (nel dubbio si tiene)');
ok(isScaduta(null) === false, 'T9.5 null → non scaduta');
ok(isScaduta('abc') === false, 'T9.6 malformata → non scaduta');
ok(isScaduta('2099-13-99') === false, 'T9.7 data impossibile → non scaduta (no crash)');

// ============================================================================
// TEST 10 — FAS_CKAN_CULTURA_RX  (gate cultura CKAN, casi reali della verifica live)
// ============================================================================
const CRX = ctx.FAS_CKAN_CULTURA_RX;
ok(CRX && typeof CRX.test === 'function', 'T10.0 FAS_CKAN_CULTURA_RX è una RegExp utilizzabile');
const cgate = (s) => CRX.test(String(s).toLowerCase());
// Reali da dati.gov.it / Toscana → ACCETTA
ok(cgate("Opere d'Arte conservate nei Musei del Comune di Milano"), 'T10.1 opere d arte/musei → accetta');
ok(cgate('Reperti Archeologici classificati nei Musei'), 'T10.2 archeologici/musei → accetta');
ok(cgate('Patrimonio Culturale - Comune di Muro Leccese'), 'T10.3 patrimonio culturale → accetta');
ok(cgate('Regione Toscana - eventi sistema cultura'), 'T10.4 "cultura" scema (stem cultur) → accetta');
ok(cgate('Musei emiliano-romagnoli'), 'T10.5 musei → accetta');
ok(cgate('Vetrina Toscana ristoranti e botteghe — cultura enogastronomica'), 'T10.6 gastronomia/cultur (dominio Sinopia) → accetta');
// Non-cultura → SCARTA
ok(!cgate('Bando contributi per agricoltura biologica'), 'T10.7 bando agricoltura → scarta');
ok(!cgate('Raccolta e smaltimento rifiuti urbani'), 'T10.8 rifiuti → scarta');
ok(!cgate('Anagrafe della popolazione residente'), 'T10.9 anagrafe → scarta');
// Edge: \barte\b non deve matchare "parte"
ok(!cgate('parte seconda del capitolato di gara'), 'T10.10 "parte" NON deve matchare \\barte\\b');
ok(cgate("esposizione di opere d'arte contemporanea"), 'T10.11 "arte" come parola → accetta');

// ============================================================================
// RISULTATI
// ============================================================================
console.log('\n══════════ TEST FIX 2026-06-18 ══════════');
if (fails.length) {
  console.log('\nFAIL:');
  fails.forEach(f => console.log('  ✗ ' + f));
}
console.log(`\n  PASS: ${pass}   FAIL: ${fail}`);
console.log('═════════════════════════════════════════');
process.exit(fail ? 1 : 0);
