/**
 * ============================================================================
 *  Constants.gs — Single Source of Truth per costanti condivise OC
 * ============================================================================
 *  Sprint 1.1 (INT-4 · 2026-04-29)
 *  Autore: Silvano Straccini / Duemilamusei
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

// ============================================================================
// VERSIONE WEBAPP
// ============================================================================

var OC_VERSION = 'v4.13.1';
var OC_VERSION_DATE = '2026-05-04';
var OC_VERSION_NOTES = 'Sprint H (2026-05-04) - FIX CRITICO MONITORAGGIO BANDI: pulisciHtmlBandi ora preserva i link <a href> trasformandoli in marker [URL: ...] cosi Claude estrae link diretti del bando (prima eliminava tutti i tag, Claude vedeva solo URL fonte → tutti i link in webapp portavano alla pagina lista invece del bando). Aggiunto buffer testo 9KB→12KB. Aggiunto auditBandiSystem() funzione diagnostica completa (richiamabile da editor GAS) che fotografa stato RADAR BANDI + qualita link diretti vs generici + fonti silenti + reachability fonti P1. Include Sprint F/G (Matrix integrato) e tutti gli sprint precedenti.';

// ============================================================================
// SOGLIE OPERATIVE
// ============================================================================

var OC_BANDI_URGENTI_DAYS = 7;     // soglia "in scadenza" per la home
var OC_AUTO_ARCH_NEWS_DAYS = 30;   // dopo quanti giorni archiviare news non salvate
var OC_AUTO_ARCH_BANDI_DAYS = 30;  // dopo quanti giorni dalla scadenza archiviare bandi
var OC_AUTO_DELETE_MONTHS = 12;    // dopo quanti mesi eliminare definitivamente archiviati

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
    }
  };
}

/**
 * Helper: mappa id ambito → oggetto completo.
 */
function getAmbitoById(id) {
  var n = Number(id);
  for (var i = 0; i < OC_AMBITI.length; i++) {
    if (OC_AMBITI[i].id === n) return OC_AMBITI[i];
  }
  return null;
}

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
// FINE Constants.gs
// ============================================================================
