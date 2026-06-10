// Syntax-check di tutti i blocchi <script> inline nei file HTML GAS.
// Uso: node tools/check-inline-js.js Index.html Topbar.html ...
var fs = require('fs');
var path = require('path');
var totalBad = 0;
process.argv.slice(2).forEach(function (file) {
  var html = fs.readFileSync(file, 'utf8');
  var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  var m, i = 0, bad = 0;
  while ((m = re.exec(html))) {
    i++;
    var attrs = m[1] || '';
    var src = m[2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;        // script esterni
    if (!src.trim()) continue;
    if (src.indexOf('<?') >= 0) {                  // scriptlet GAS: skip (valutati server-side)
      console.log('[' + path.basename(file) + '] script #' + i + ': contiene scriptlet GAS, saltato');
      continue;
    }
    try {
      new Function(src);
    } catch (e) {
      bad++; totalBad++;
      var line = html.slice(0, m.index).split('\n').length;
      console.log('ERRORE [' + path.basename(file) + '] script #' + i + ' (apre a riga ' + line + '): ' + e.message);
    }
  }
  console.log(path.basename(file) + ': ' + i + ' blocchi script, ' + bad + ' con errori');
});
process.exit(totalBad ? 1 : 0);
