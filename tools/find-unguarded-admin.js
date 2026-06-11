// Trova le funzioni server con _isCurrentUserAdmin_() SENZA token e dice se sono
// chiamate dal frontend (google.script.run nei file HTML) -> quelle sono rotte su deploy anonimo.
// Uso: node tools/find-unguarded-admin.js
var fs = require('fs');
var path = require('path');
var dir = path.resolve(__dirname, '..');

var jsFiles = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); });
var htmlFiles = fs.readdirSync(dir).filter(function (f) { return /\.html$/.test(f); });
var htmlAll = htmlFiles.map(function (f) { return fs.readFileSync(path.join(dir, f), 'utf8'); }).join('\n');

// Mappa: nome funzione -> [ {file, line} ] per ogni call-site _isCurrentUserAdmin_() senza arg
var hits = {};
jsFiles.forEach(function (f) {
  var src = fs.readFileSync(path.join(dir, f), 'utf8');
  var lines = src.split('\n');
  // indicizza le dichiarazioni di funzione con il loro numero di riga
  var decls = [];
  lines.forEach(function (l, i) {
    var m = l.match(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/);
    if (m) decls.push({ name: m[1], line: i + 1 });
  });
  lines.forEach(function (l, i) {
    if (l.indexOf('_isCurrentUserAdmin_()') < 0) return;
    if (/^\s*(\/\/|\*)/.test(l)) return; // commento
    // trova la dichiarazione di funzione piu vicina sopra
    var fn = null;
    for (var d = decls.length - 1; d >= 0; d--) {
      if (decls[d].line <= i + 1) { fn = decls[d].name; break; }
    }
    if (!fn) fn = '(top-level)';
    if (!hits[fn]) hits[fn] = [];
    hits[fn].push(f + ':' + (i + 1));
  });
});

// Per ogni funzione: e' chiamata dal frontend? (".nome(" preceduto da run/handler nelle vicinanze)
var rows = [];
Object.keys(hits).sort().forEach(function (fn) {
  var re = new RegExp('\\.' + fn + '\\s*\\(');
  var fromFrontend = re.test(htmlAll);
  rows.push({ fn: fn, frontend: fromFrontend, sites: hits[fn] });
});

var broken = rows.filter(function (r) { return r.frontend; });
var safe = rows.filter(function (r) { return !r.frontend; });

console.log('=== ROTTE su deploy anonimo (chiamate dal frontend, check senza token) ===');
broken.forEach(function (r) { console.log('  ' + r.fn + '  ->  ' + r.sites.join(', ')); });
console.log('');
console.log('=== OK (solo editor/trigger, nessuna chiamata frontend trovata) ===');
safe.forEach(function (r) { console.log('  ' + r.fn + '  ->  ' + r.sites.join(', ')); });
console.log('');
console.log('Totale: ' + broken.length + ' da correggere, ' + safe.length + ' ok');
