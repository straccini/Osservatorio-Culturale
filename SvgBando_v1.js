/**
 * ============================================================================
 *  SvgBando_v1.gs — Template SVG card bandi auto-generate
 * ============================================================================
 *  Sprint 2 anticipato (2026-05-11) — blocco C2
 *  Autore: Claude (Cowork) per Silvano Straccini / Duemilamusei
 *
 *  Scopo: generare SVG inline per le card bandi mostrate nel carosello hero
 *  della home (Sprint 2 home redesign). Branding Duemilamusei coerente,
 *  costo zero, sempre disponibile.
 *
 *  Funzione esportata:
 *    renderSvgCardBando(bando)
 *      @param  bando { titolo, ente, scadenza, importo, ambito, urlBando }
 *      @return { ok, svg, dataUrl }  — SVG inline + data:image/svg+xml URL
 *
 *  Il chiamante decide se usare svg (inline) o dataUrl (per src="data:...").
 * ============================================================================
 */

// ============================================================================
// COLORI AMBITI (allineati a Constants.js OC_AMBITI)
// ============================================================================

var SVG_BANDO_COLORS = {
  1: { main: '#6B5C9A', soft: '#EDE8F4', label: 'Identita' },
  2: { main: '#3F7A5E', soft: '#E5EFE7', label: 'Inclusione' },
  3: { main: '#3C6A95', soft: '#E4ECF3', label: 'Programma' },
  4: { main: '#9C6A36', soft: '#F1E7DA', label: 'Comunita' },
  5: { main: '#4A7884', soft: '#E5EDEF', label: 'Digital & Gov' }
};

// ============================================================================
// HELPER: escape XML
// ============================================================================

function _svgXmlEsc_(s) {
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}

// ============================================================================
// HELPER: formattazione importo (€)
// ============================================================================

function _fmtImporto_(importo) {
  if (!importo || isNaN(Number(importo))) return '';
  var n = Number(importo);
  if (n >= 1000000) return '€ ' + (n / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1000)    return '€ ' + Math.round(n / 1000) + 'K';
  return '€ ' + n;
}

// ============================================================================
// HELPER: giorni rimasti alla scadenza
// ============================================================================

function _giorniRimasti_(scadenza) {
  if (!scadenza) return null;
  var d = scadenza instanceof Date ? scadenza : new Date(scadenza);
  if (isNaN(d.getTime())) return null;
  var diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  return diff;
}

// ============================================================================
// HELPER: testo wrap (max N caratteri per riga, max M righe)
// ============================================================================

function _wrapText_(text, maxCharsPerLine, maxLines) {
  if (!text) return [];
  var words = String(text).split(/\s+/);
  var lines = [];
  var current = '';
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if ((current + ' ' + w).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines - 1) {
        if (current.length > maxCharsPerLine) current = current.substring(0, maxCharsPerLine - 1) + '...';
        break;
      }
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

// ============================================================================
// MAIN: renderSvgCardBando(bando)
// ============================================================================

/**
 * Genera SVG card bando per carosello hero home.
 *
 * @param {Object} bando — { titolo, ente, scadenza, importo, ambito, urlBando }
 * @return {Object} { ok: true, svg: '<svg>...</svg>', dataUrl: 'data:image/svg+xml;base64,...' }
 */
function renderSvgCardBando(bando) {
  try {
    bando = bando || {};
    var amb = Number(bando.ambito) || 3;
    var col = SVG_BANDO_COLORS[amb] || SVG_BANDO_COLORS[3];
    var titolo = _svgXmlEsc_(bando.titolo || 'Bando senza titolo');
    var ente   = _svgXmlEsc_(String(bando.ente || '').toUpperCase());
    var importo = _fmtImporto_(bando.importo);
    var giorni  = _giorniRimasti_(bando.scadenza);
    var scadenzaTxt = '';
    if (giorni != null) {
      if (giorni < 0)       scadenzaTxt = 'SCADUTO';
      else if (giorni === 0) scadenzaTxt = 'OGGI';
      else if (giorni === 1) scadenzaTxt = 'DOMANI';
      else if (giorni <= 7)  scadenzaTxt = giorni + ' GIORNI';
      else if (giorni <= 30) scadenzaTxt = giorni + ' GIORNI';
      else                   scadenzaTxt = giorni + ' GG';
    }
    var urgente = giorni != null && giorni >= 0 && giorni <= 7;
    var badgeColor = urgente ? '#8C2626' : col.main;

    var lineeTitolo = _wrapText_(titolo, 38, 3);
    var titoloSvg = lineeTitolo.map(function(line, i) {
      return '<tspan x="80" dy="' + (i === 0 ? 0 : 88) + '">' + line + '</tspan>';
    }).join('');

    // Pattern decorativo: cerchi concentrici angolo top-right
    var pattern =
      '<circle cx="1280" cy="180" r="220" fill="' + col.main + '" opacity="0.06"/>' +
      '<circle cx="1280" cy="180" r="160" fill="' + col.main + '" opacity="0.08"/>' +
      '<circle cx="1280" cy="180" r="100" fill="' + col.main + '" opacity="0.10"/>';

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 810" preserveAspectRatio="xMidYMid slice">' +
      // Background gradient (carta da museo + tinta ambito)
      '<defs>' +
        '<linearGradient id="bg' + amb + '" x1="0%" y1="0%" x2="100%" y2="100%">' +
          '<stop offset="0%" stop-color="#FAF8F4"/>' +
          '<stop offset="100%" stop-color="' + col.soft + '"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<rect width="1440" height="810" fill="url(#bg' + amb + ')"/>' +
      pattern +
      // Top bar Duemilamusei brand
      '<g font-family="Inter, Arial, sans-serif" font-size="13" letter-spacing="3" fill="#6E6A62">' +
        '<text x="80" y="80" font-weight="700">OSSERVATORIO CULTURALE · DUEMILAMUSEI</text>' +
        '<line x1="80" y1="105" x2="1360" y2="105" stroke="#D5D0C4" stroke-width="1"/>' +
      '</g>' +
      // Eyebrow ambito
      '<g font-family="Inter, Arial, sans-serif" font-size="14" letter-spacing="4" font-weight="700" fill="' + col.main + '">' +
        '<text x="80" y="180">BANDO · 0' + amb + ' ' + col.label.toUpperCase() + '</text>' +
      '</g>' +
      // Titolo bando (Newsreader serif, 3 righe max)
      '<g font-family="Newsreader, Georgia, serif" font-size="68" font-weight="500" fill="#1A1815">' +
        '<text y="290">' + titoloSvg + '</text>' +
      '</g>' +
      // Ente
      '<g font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="2" font-weight="600" fill="#3A3631">' +
        '<text x="80" y="650">' + ente + '</text>' +
      '</g>' +
      // Importo (sotto ente)
      (importo ? '<g font-family="Newsreader, Georgia, serif" font-size="44" font-weight="600" fill="#1A1815">' +
        '<text x="80" y="715">' + _svgXmlEsc_(importo) + '</text>' +
      '</g>' : '') +
      // Badge scadenza (top-right)
      (scadenzaTxt ?
        '<g transform="translate(1200,160)">' +
          '<rect x="0" y="-50" width="200" height="80" rx="4" fill="' + badgeColor + '"/>' +
          '<text x="100" y="-22" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="11" letter-spacing="2" font-weight="700" fill="#FFFFFF" opacity="0.8">SCADENZA</text>' +
          '<text x="100" y="6" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="700" fill="#FFFFFF">' + _svgXmlEsc_(scadenzaTxt) + '</text>' +
        '</g>' : '') +
      // Footer brand
      '<g font-family="Inter, Arial, sans-serif" font-size="12" letter-spacing="2" fill="#9A958B">' +
        '<line x1="80" y1="755" x2="1360" y2="755" stroke="#D5D0C4" stroke-width="1"/>' +
        '<text x="80" y="780">SCOPRI IL BANDO COMPLETO SU OSSERVATORIO CULTURALE</text>' +
        '<text x="1360" y="780" text-anchor="end">DUEMILAMUSEI.IT</text>' +
      '</g>' +
      '</svg>';

    // Genera anche dataUrl per uso in img src
    var dataUrl = 'data:image/svg+xml;base64,' + Utilities.base64Encode(svg);

    return { ok: true, svg: svg, dataUrl: dataUrl };
  } catch(e) {
    Logger.log('renderSvgCardBando ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// HELPER: renderSvgCardBandiBatch(bandi)
// Genera N SVG in un colpo per il carosello (chiamato dal frontend in hydrate)
// ============================================================================

function renderSvgCardBandiBatch(bandi, max) {
  try {
    var lim = Math.min(Number(max) || 6, (bandi || []).length);
    var out = [];
    for (var i = 0; i < lim; i++) {
      var r = renderSvgCardBando(bandi[i]);
      if (r.ok) {
        out.push({
          id: bandi[i].id || ('B' + i),
          titolo: bandi[i].titolo,
          urlBando: bandi[i].urlBando,
          ambito: bandi[i].ambito,
          svgDataUrl: r.dataUrl
        });
      }
    }
    return { ok: true, cards: out, totale: out.length };
  } catch(e) {
    Logger.log('renderSvgCardBandiBatch ERRORE: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ============================================================================
// TEST: testRenderSvgCardBando()
// Lancia da editor GAS per validare visivamente
// ============================================================================

function testRenderSvgCardBando() {
  var sample = {
    titolo: 'PNRR M1C3 — Accessibilita musei statali e bibliografici',
    ente: 'Ministero della Cultura',
    scadenza: new Date(Date.now() + 23 * 86400000),
    importo: 250000,
    ambito: 2,
    urlBando: 'https://cultura.gov.it/bando/pnrr-m1c3'
  };
  var r = renderSvgCardBando(sample);
  Logger.log(r.ok ? 'SVG generato, ' + r.svg.length + ' bytes' : 'ERRORE: ' + r.error);
  Logger.log('Preview dataUrl (primi 200 chars): ' + r.dataUrl.substring(0, 200) + '...');
  return r;
}

// ============================================================================
// FINE MODULO SvgBando_v1.gs
// ============================================================================
