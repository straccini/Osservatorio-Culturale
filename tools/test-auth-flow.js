/**
 * test-auth-flow.js — Verifica l'ACCESSO AUTOMATICO (la "chiave" magic-link) eseguendo il
 * codice GAS REALE con fogli finti: createSessione → validaSessione (rientro nel profilo) +
 * loginConEmail (auto-registrazione light) + attivazione pending al click.
 *
 * Eseguire: node tools/test-auth-flow.js  (tools/ in .claspignore → mai su GAS)
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- Foglio finto ----
function FakeSheet(name, header, rows) { this.name = name; this._d = [header.slice()].concat((rows || []).map(r => r.slice())); }
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

// Header reali
const SESS_H = ['id', 'email', 'token', 'livello', 'scadenza', 'source', 'matrix_completato', 'created_at', 'last_seen', 'revoked'];
const UT_H = ['ID', 'Email', 'Nome', 'Ruolo', 'Stato', 'OptInDigest', 'OptInBandi', 'OptInMatrix', 'DataIscrizione', 'DataApprovazione', 'AggiuntoDa', 'Note'];

let sessSheet = new FakeSheet('Sessioni_v1', SESS_H, []);
let utSheet = new FakeSheet('Utenti', UT_H, []);
const emails = [];

const realGlobals = {
  Logger: { log: () => {} },
  Session: { getScriptTimeZone: () => 'Europe/Rome', getActiveUser: () => ({ getEmail: () => '' }) },
  Utilities: { getUuid: () => 'uuid-' + Math.random().toString(36).slice(2) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/x/exec' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  MailApp: { sendEmail: () => {}, getRemainingDailyQuota: () => 1000 },
  console, JSON, Math, Date, RegExp, Number, String, Array, Object, Boolean, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
};
const ctx = new Proxy(realGlobals, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(ctx);
try { vm.runInContext(read('Sessioni_v1.js') + '\n' + read('Auth.js'), ctx); }
catch (e) { console.error('LOAD FAILED:', e.message); process.exit(2); }

// Override dei provider di foglio + email + flag (dopo il load, così vincono i miei)
vm.runInContext(`
  _getOrCreateSessioniSheet_ = function(){ return __sess; };
  _getOrCreateUtentiSheet_  = function(){ return __ut; };
  _sendMagicLinkEmail_ = function(){ return true; };
  sendWelcomeEmail = function(){ return true; };
  isPublicLoginEnabled_ = function(){ return true; };   // login pubblico ON (come al lancio)
  getMainSS = function(){ return { getSheetByName: function(n){ return n==='Utenti'?__ut:(n==='Sessioni_v1'?__sess:null); } }; };
`, ctx);
ctx.__sess = sessSheet; ctx.__ut = utSheet;

let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('OK  ' + n); } else { fail++; console.log('XX  ' + n); } }
function tokenOf(email) { // ultimo token in Sessioni per email
  let t = null; for (let i = 1; i < sessSheet._d.length; i++) if (String(sessSheet._d[i][1]).toLowerCase() === email) t = sessSheet._d[i][2]; return t;
}
function statoUtente(email) { for (let i = 1; i < utSheet._d.length; i++) if (String(utSheet._d[i][1]).toLowerCase() === email) return String(utSheet._d[i][4]); return null; }

console.log('\n=== ACCESSO AUTOMATICO (chiave magic-link) — codice reale ===\n');

// 1. createSessione genera una chiave, validaSessione la riconosce → rientro nel profilo
const E1 = 'nuovo@museo.it';
const cs = ctx.createSessione(E1, 'manual_admin');
ok(cs && cs.ok && cs.token, '1a createSessione genera token+magicLink');
const vs = ctx.validaSessione(cs.token);
ok(vs && vs.valid === true, '1b validaSessione(token) → sessione VALIDA (accesso automatico)');
ok(vs && String(vs.email).toLowerCase() === E1, '1c la chiave riporta al profilo corretto (email giusta)');

// 2. loginConEmail con email NON registrata → auto-registra lettore + prepara la chiave
const E2 = 'visitatore@nuovo.it';
const lg = ctx.loginConEmail(E2);
ok(lg && lg.ok, '2a loginConEmail(nuovo) ok (light: non respinge)');
ok(statoUtente(E2) === 'attivo', '2b auto-registrato come lettore ATTIVO');
ok(!!tokenOf(E2), '2c chiave (sessione) creata per il nuovo visitatore');
ok(ctx.validaSessione(tokenOf(E2)).valid === true, '2d la sua chiave funziona → accesso automatico');

// 3. Email PENDING → loginConEmail NON blocca, e il click sulla chiave attiva l'utente
utSheet.appendRow(['U9', 'santini@x.it', 'Santini', 'lettore', 'pending', true, true, false, 'iso', '', 'import', '']);
const lp = ctx.loginConEmail('santini@x.it');
ok(lp && lp.ok, '3a pending NON bloccato al login (catch-22 risolto)');
const tP = tokenOf('santini@x.it');
ok(!!tP, '3b chiave generata per il pending');
const vp = ctx.validaSessione(tP);
ok(vp && vp.valid === true, '3c la chiave del pending è valida');
ok(statoUtente('santini@x.it') === 'attivo', '3d click sulla chiave → utente ATTIVATO automaticamente');

// 4. Sospeso/rifiutato → bloccati (sicurezza preservata)
utSheet.appendRow(['U8', 'sospeso@x.it', 'X', 'lettore', 'sospeso', true, true, false, 'iso', '', 'x', '']);
const ls = ctx.loginConEmail('sospeso@x.it');
ok(ls && ls.ok === false && ls.error === 'account_non_attivo', '4a sospeso → bloccato (corretto)');

console.log('\n' + '='.repeat(56));
console.log('  PASS: ' + pass + '   FAIL: ' + fail);
console.log('='.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
