/**
 * simula-profili.js — Simulazione di TUTTE le tipologie di profilo e le combinazioni
 * con la profilazione, eseguendo il codice GAS REALE in un sandbox vm con fogli finti.
 *
 * Esercita:
 *   A) _autoRegisterUser_  (Auth.js)        → esito registrazione per ogni stato email
 *   B) getDigestRecipientsByCohort (Digest_routing.js) → coorte digest per ogni combinazione
 *
 * Eseguire: node tools/simula-profili.js
 * NB: tools/ è in .claspignore → non viene mai pushato su GAS. Nessun foglio reale toccato.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- Fogli finti in memoria ----
function FakeSheet(name, header, rows) {
  this.name = name;
  this._d = [header.slice()].concat((rows || []).map(r => r.slice()));
}
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getLastRow = function () { return this._d.length; };
FakeSheet.prototype.getLastColumn = function () { return this._d[0] ? this._d[0].length : 0; };
FakeSheet.prototype.getDataRange = function () { const s = this; return { getValues: () => s._d.map(r => r.slice()) }; };
FakeSheet.prototype.appendRow = function (row) { this._d.push(row.slice()); };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  const s = this;
  return {
    setValue: function (v) { s._d[r - 1][c - 1] = v; return this; },
    setValues: function (vals) { for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals[i].length; j++) s._d[r - 1 + i][c - 1 + j] = vals[i][j]; return this; },
    getValues: function () { const o = []; for (let i = 0; i < (nr || 1); i++) { const rr = []; for (let j = 0; j < (nc || 1); j++) rr.push(s._d[r - 1 + i][c - 1 + j]); o.push(rr); } return o; }
  };
};
function FakeSS(sheets) { this._s = sheets || {}; }
FakeSS.prototype.getSheetByName = function (n) { return this._s[n] || null; };

// ---- Sandbox Proxy (identificatori sconosciuti → undefined) ----
const realGlobals = {
  Logger: { log: () => {} },
  Session: { getScriptTimeZone: () => 'Europe/Rome', getActiveUser: () => ({ getEmail: () => '' }) },
  Utilities: { getUuid: () => 'uuid-' + Math.random().toString(36).slice(2) },
  SpreadsheetApp: { getActiveSpreadsheet: () => null },
  console, JSON, Math, Date, RegExp, Number, String, Array, Object, Boolean,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  // costanti/helper che il codice si aspetta come globali
  SH: { MAILING: 'MailingList', ITEMS: 'Items' },
  _getDigestSegmento_: (s) => String(s || ''),
  ambitiFromDims: () => [],
  _logConsenso_: () => {},
  sendWelcomeEmail: () => {}
};
const ctx = new Proxy(realGlobals, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : undefined),
  set: (t, k, v) => { t[k] = v; return true; }
});
vm.createContext(ctx);
try {
  vm.runInContext(read('Auth.js') + '\n' + read('Digest_routing.js'), ctx);
} catch (e) { console.error('LOAD FAILED:', e.message); process.exit(2); }

// ============================================================================
// Utility per costruire i fogli delle coorti
// ============================================================================
const H = {
  sess: ['email', 'source', 'matrix_completato', 'revoked'],
  pren: ['email', 'tematica_codice', 'museo_nome', 'stato_followup'],
  cont: ['email', 'response_id', 'preferences_json'],
  mail: ['Email', 'Nome', 'Attivo'],
  prof: ['email', 'interessi_dimensioni']
};
function buildSS(spec) {
  const s = {};
  if (spec.sess) s['Sessioni_v1'] = new FakeSheet('Sessioni_v1', H.sess, spec.sess);
  if (spec.pren) s['RichiestePrenotazione'] = new FakeSheet('RichiestePrenotazione', H.pren, spec.pren);
  if (spec.cont) s['ContactsMatrix'] = new FakeSheet('ContactsMatrix', H.cont, spec.cont);
  if (spec.mail) s['MailingList'] = new FakeSheet('MailingList', H.mail, spec.mail);
  if (spec.prof) s['ProfiliPro'] = new FakeSheet('ProfiliPro', H.prof, spec.prof);
  if (spec.items) s['Items'] = new FakeSheet('Items', ['ID', 'InclusiNelDigest', 'Archiviato'], []);
  return new FakeSS(s);
}
function cohortOf(res, email) {
  email = email.toLowerCase();
  if ((res.leadCaldi || []).some(x => x.email === email)) return 'B (Matrix/lead)';
  if ((res.profilati || []).some(x => x.email === email)) return 'C (profilato)';
  if ((res.generalisti || []).some(x => x.email === email)) return 'A (generalista)';
  return '— (nessuna)';
}

const T = 'test@x.it';
let pass = 0, fail = 0; const rows = [];
function scenarioCohort(nome, spec, atteso) {
  ctx.getMainSS = () => buildSS(spec);
  let got, err = null;
  try { const res = ctx.getDigestRecipientsByCohort(); got = res.ok ? cohortOf(res, T) : ('ERR:' + res.error); }
  catch (e) { got = 'EXC'; err = e.message; }
  const okk = got === atteso;
  if (okk) pass++; else fail++;
  rows.push([okk ? 'OK ' : 'XX ', nome, atteso, got + (err ? ' (' + err + ')' : '')]);
}

console.log('\n=== B) ASSEGNAZIONE COORTE DIGEST (getDigestRecipientsByCohort REALE) ===\n');
// 1. Solo newsletter (MailingList attivo, nessun interesse, no Matrix)
scenarioCohort('Solo newsletter (no profilo, no Matrix)', { mail: [[T, 'Test', true]] }, 'A (generalista)');
// 2. Profilato (ProfiliPro con interessi) NON iscritto alla newsletter  ← il bug risolto
scenarioCohort('Profilato senza newsletter (FIX coorte C)', { prof: [[T, 'D7,D8']] }, 'C (profilato)');
// 3. Profilato + anche in MailingList → C, tolto da A
scenarioCohort('Profilato + iscritto newsletter', { prof: [[T, 'D7']], mail: [[T, '', true]] }, 'C (profilato)');
// 4. Compilatore Matrix (Sessioni matrix_completato)
scenarioCohort('Compilatore Matrix', { sess: [[T, 'matrix', true, false]] }, 'B (Matrix/lead)');
// 5. Matrix + anche profilato → B ha precedenza
scenarioCohort('Matrix + profilato (precedenza B)', { sess: [[T, 'matrix', true, false]], prof: [[T, 'D7']] }, 'B (Matrix/lead)');
// 6. Prenotazione consulenza (no Matrix)
scenarioCohort('Prenotazione consulenza', { pren: [[T, 'TEM1', 'Museo X', 'nuovo']] }, 'B (Matrix/lead)');
// 7. Profilo SENZA interessi + in MailingList → resta A
scenarioCohort('Profilo senza interessi + newsletter', { prof: [[T, '']], mail: [[T, '', true]] }, 'A (generalista)');
// 8. Disiscritto (MailingList Attivo=false)
scenarioCohort('Disiscritto (Attivo=false)', { mail: [[T, '', false]] }, '— (nessuna)');
// 9. Interessi solo da ContactsMatrix (fallback, non in Sessioni → non B)
scenarioCohort('Interessi via ContactsMatrix (fallback)', { cont: [[T, 'R1', '{"dimensioni":["D9"]}']] }, 'C (profilato)');
// 10. Prenotazione archiviata → esclusa
scenarioCohort('Prenotazione archiviata', { pren: [[T, 'TEM1', 'Museo X', 'archiviato']] }, '— (nessuna)');

// ============================================================================
// A) ESITO REGISTRAZIONE (_autoRegisterUser_ REALE) per ogni stato email
// ============================================================================
console.log(pad('', 4) + pad('SCENARIO', 42) + pad('ATTESO', 20) + 'OTTENUTO');
rows.forEach(r => console.log(pad(r[0], 4) + pad(r[1], 42) + pad(r[2], 20) + r[3]));

const utHeader = ['ID', 'Email', 'Nome', 'Ruolo', 'Stato', 'OptInDigest', 'OptInBandi', 'OptInMatrix', 'DataIscrizione', 'DataApprovazione', 'AggiuntoDa', 'Note'];
function reg(nome, existingRow, email, atteso) {
  const sh = new FakeSheet('Utenti', utHeader, existingRow ? [existingRow] : []);
  ctx._getOrCreateUtentiSheet_ = () => sh;
  let got;
  try { const r = ctx._autoRegisterUser_(email, 'Tester', 'profilo_pro'); got = r.ok ? ('ok:' + r.action) : ('err:' + r.error); }
  catch (e) { got = 'EXC:' + e.message; }
  const okk = got === atteso;
  if (okk) pass++; else fail++;
  console.log(pad(okk ? 'OK ' : 'XX ', 4) + pad(nome, 42) + pad(atteso, 20) + got);
}
console.log('\n=== A) AUTO-REGISTRAZIONE compilando "Il mio profilo" (_autoRegisterUser_ REALE) ===\n');
console.log(pad('', 4) + pad('SCENARIO (stato email)', 42) + pad('ATTESO', 20) + 'OTTENUTO');
const row = (email, nome, ruolo, stato) => ['U1', email, nome, ruolo, stato, true, true, false, 'iso', '', 'x', ''];
reg('Email nuova → nuovo lettore', null, T, 'ok:created');
reg('Email gia attiva → deve accedere', row(T, 'Tizio', 'lettore', 'attivo'), T, 'err:gia_registrato');
reg('Email pending → riattivata lettore', row(T, '', 'ospite', 'pending'), T, 'ok:reactivated');
reg('Email rifiutata → bloccata', row(T, 'Tizio', 'lettore', 'rifiutato'), T, 'err:accesso_rifiutato');
reg('Email sospesa → bloccata', row(T, 'Tizio', 'lettore', 'sospeso'), T, 'err:account_sospeso');
reg('Email non valida', null, 'non-una-email', 'err:email non valida');

// ============================================================================
// Riepilogo
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('  PASS: ' + pass + '   FAIL: ' + fail);
console.log('='.repeat(60) + '\n');
process.exit(fail ? 1 : 0);

function pad(s, n) { s = String(s); return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length); }
