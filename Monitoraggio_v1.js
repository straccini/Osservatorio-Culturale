/**
 * ============================================================================
 *  Monitoraggio_v1.js — Cruscotto di monitoraggio (Sinopia)
 * ============================================================================
 *  Due endpoint pubblici per il frontend:
 *    getStatoFontiDashboard(opts) — salute fonti per CATEGORIA + risultati
 *                                   scansioni ultimi N giorni + API/CKAN/agenti
 *    getUtenteGrowth()            — utenti registrati totali + serie mensile
 *
 *  Principio: aggrega i getter già esistenti in modo DIFENSIVO (ogni chiamata
 *  in try/catch) così un singolo guasto non rompe l'intero cruscotto.
 * ============================================================================
 */

// ============================================================================
// SALUTE FONTI — dashboard per categoria
// ============================================================================

/**
 * @return {Object} {
 *   ok, generatedAt, giorni,
 *   categorie: [{categoria, totale, attive, ok, silenti, semaforo, nuovi}],
 *   scan: {bandi, news, podcast, video, totale},   // record negli ultimi N giorni
 *   api: [{id, nome, stato, alimenta}],
 *   ckanPortali: [{nome, livello, regione}],
 *   agenti: [{id, nome, ambiti, scanFrequenza}],
 *   healthScore,                                    // 0-100 (% fonti non silenti)
 *   errori: []
 * }
 */
function getStatoFontiDashboard(opts) {
  opts = opts || {};
  var giorni = Number(opts.giorni) || 10;
  var out = {
    ok: true, generatedAt: new Date().toISOString(), giorni: giorni,
    categorie: [], scan: null, api: [], ckanPortali: [], agenti: [],
    alert: [], ultimaScansione: null, healthScore: null, errori: []
  };

  // 1) Categorie feed (bandi/news/podcast/video) da getFontiCounters
  try {
    if (typeof getFontiCounters === 'function') {
      var fc = getFontiCounters();
      if (fc && fc.ok && fc.counters) {
        ['bandi', 'news', 'podcast', 'video'].forEach(function(k) {
          var c = fc.counters[k];
          if (c) out.categorie.push({
            categoria: k,
            totale: Number(c.totale) || 0,
            attive: Number(c.attive) || 0,
            ok: Number(c.ok) || 0,
            silenti: Number(c.silenti) || 0,
            semaforo: _monSemaforoCat_(c)
          });
        });
      }
    }
  } catch (e) { out.errori.push('fontiCounters: ' + e.message); }

  // 2) Risultati scansioni ultimi N giorni (record creati per categoria)
  try { out.scan = _monScanRisultati_(giorni); } catch (e) { out.errori.push('scan: ' + e.message); }

  // 3) API strutturate (FAS registry)
  try {
    if (typeof FAS_API_REGISTRY !== 'undefined' && FAS_API_REGISTRY.length) {
      out.api = FAS_API_REGISTRY.map(function(a) {
        return { id: a.id, nome: a.nome, stato: a.stato || 'n/d', alimenta: a.alimenta || '' };
      });
    }
  } catch (e) { out.errori.push('api: ' + e.message); }

  // 4) Portali CKAN open data
  try {
    if (typeof FAS_CKAN_PORTALS !== 'undefined' && FAS_CKAN_PORTALS.length) {
      out.ckanPortali = FAS_CKAN_PORTALS.map(function(p) {
        return { nome: p.nome, livello: p.livello || '', regione: p.regione || '' };
      });
    }
  } catch (e) { out.errori.push('ckan: ' + e.message); }

  // 5) Agenti AG1-AG5
  try {
    if (typeof OC_AGENTI !== 'undefined' && OC_AGENTI.length) {
      out.agenti = OC_AGENTI.map(function(ag) {
        return {
          id: ag.id || ag.codice || '',
          nome: ag.nome || ag.nomeBreve || '',
          ambiti: ag.ambiti || [],
          scanFrequenza: ag.scanFrequenza || ''
        };
      });
    }
  } catch (e) { out.errori.push('agenti: ' + e.message); }

  // 6) Health score = % fonti attive non silenti (da categorie)
  try {
    var tot = 0, sil = 0;
    out.categorie.forEach(function(c) { tot += c.attive; sil += c.silenti; });
    out.healthScore = tot > 0 ? Math.round(((tot - sil) / tot) * 100) : null;
  } catch (e) { out.errori.push('health: ' + e.message); }

  // 7) Fonti problematiche (silenti/in errore) + ultima scansione globale (da getFontiUnified)
  try {
    if (typeof getFontiUnified === 'function') {
      var fu = getFontiUnified();
      if (fu && fu.ok && fu.fonti && fu.fonti.length) {
        var ultima = null;
        fu.fonti.forEach(function(f) {
          var us = f.ultimaScan ? new Date(f.ultimaScan) : null;
          if (us && !isNaN(us.getTime()) && (!ultima || us > ultima)) ultima = us;
          var fc = Number(f.failConsec) || 0;
          var esito = String(f.ultimoEsito || '').toUpperCase();
          var attiva = (f.attiva === true || f.attiva === 'TRUE' || f.attiva === 1 || String(f.attiva).toLowerCase() === 'true');
          // Problema = fonte attiva con fallimenti consecutivi o ultimo esito non-OK
          if (attiva && (fc >= 1 || (esito && esito !== 'OK'))) {
            out.alert.push({
              nome: String(f.nome || f.id || ''),
              tipo: String(f.tipo || ''),
              esito: String(f.ultimoEsito || ''),
              failConsec: fc
            });
          }
        });
        out.ultimaScansione = ultima ? ultima.toISOString() : null;
        out.alert.sort(function(a, b) { return b.failConsec - a.failConsec; });
        if (out.alert.length > 25) out.alert = out.alert.slice(0, 25);
      }
    }
  } catch (e) { out.errori.push('alert: ' + e.message); }

  return out;
}

/**
 * @private Semaforo per una categoria di fonti: 'verde' | 'giallo' | 'rosso'.
 */
function _monSemaforoCat_(c) {
  var attive = Number(c.attive) || 0;
  var silenti = Number(c.silenti) || 0;
  if (attive === 0) return 'rosso';
  if (silenti === 0) return 'verde';
  if (silenti >= attive / 2) return 'rosso';
  return 'giallo';
}

/**
 * @private Conta i record creati negli ultimi N giorni per categoria, leggendo
 * direttamente i fogli dati (proxy "cosa hanno prodotto le scansioni").
 *   Bandi_v5 → DataRilevamento ; Items → DataAcquisizione ; Podcast → DataRilevamento
 *   (i video sono righe Podcast con ID che inizia per 'VID').
 */
function _monScanRisultati_(giorni) {
  var soglia = new Date(Date.now() - giorni * 86400000);
  var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
  var res = { bandi: 0, news: 0, podcast: 0, video: 0, totale: 0 };

  function _contaFoglio(nome, colData, classifica) {
    var sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getDataRange().getValues();
    var H = vals[0].map(function(h) { return String(h || '').trim(); });
    var iData = -1, iId = -1;
    for (var c = 0; c < H.length; c++) {
      if (iData < 0 && colData.indexOf(H[c]) >= 0) iData = c;
      if (iId < 0 && H[c] === 'ID') iId = c;
    }
    if (iData < 0) return;
    for (var r = 1; r < vals.length; r++) {
      var raw = vals[r][iData];
      var d = (raw instanceof Date) ? raw : (raw ? new Date(raw) : null);
      if (!d || isNaN(d.getTime()) || d < soglia) continue;
      classifica(res, (iId >= 0 ? String(vals[r][iId] || '') : ''));
    }
  }

  // Bandi
  _contaFoglio('Bandi_v5', ['DataRilevamento', 'Data_Rilevamento'], function(o) { o.bandi++; });
  // News
  _contaFoglio('Items', ['DataAcquisizione', 'DataAcquisizione'], function(o) { o.news++; });
  // Podcast + Video (stesso foglio Podcast, video = ID VID*)
  _contaFoglio('Podcast', ['DataRilevamento', 'DataRilevamento'], function(o, id) {
    if (String(id).indexOf('VID') === 0) o.video++; else o.podcast++;
  });

  res.totale = res.bandi + res.news + res.podcast + res.video;
  return res;
}

// ============================================================================
// CRESCITA UTENTI — totale + serie mensile (per grafico statistiche)
// ============================================================================

/**
 * Utenti registrati (dedup per email, data di registrazione = sessione più antica)
 * con serie mensile cumulativa per il grafico andamento.
 *
 * @return {Object} {
 *   ok, totalUsers,
 *   byMonth: [{month:'yyyy-MM', count, cumulative}],
 *   ultimi30gg
 * }
 */
/**
 * @private Riempie i mesi mancanti in una serie [{month:'yyyy-MM', count}] ordinata,
 * inserendo count=0 per i mesi senza registrazioni, e calcola la cumulata.
 * @return {Array} [{month, count, cumulative}]
 */
function _monRiempiMesi_(serie) {
  if (!serie || !serie.length) return [];
  var idx = {};
  serie.forEach(function(s) { idx[s.month] = s.count; });
  function toNum(m) { var p = String(m).split('-'); return parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1); }
  function toStr(n) { var y = Math.floor(n / 12); var mo = (n % 12) + 1; return y + '-' + String(mo).padStart(2, '0'); }
  var start = toNum(serie[0].month);
  var end = toNum(serie[serie.length - 1].month);
  if (isNaN(start) || isNaN(end) || end < start) {
    // fallback: cumulata semplice senza riempimento
    var cumF = 0;
    return serie.map(function(s) { cumF += s.count; return { month: s.month, count: s.count, cumulative: cumF }; });
  }
  var out = [], cum = 0;
  for (var n = start; n <= end; n++) {
    var k = toStr(n);
    var c = idx[k] || 0;
    cum += c;
    out.push({ month: k, count: c, cumulative: cum });
  }
  return out;
}

function getUtenteGrowth() {
  try {
    var ss = (typeof getMainSS === 'function') ? getMainSS() : SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Sessioni_v1');
    if (!sh || sh.getLastRow() < 2) return { ok: true, totalUsers: 0, byMonth: [], ultimi30gg: 0 };

    var vals = sh.getDataRange().getValues();
    var H = vals[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
    var iEmail = H.indexOf('email');
    var iCreated = H.indexOf('created_at');
    if (iEmail < 0) iEmail = 1;
    if (iCreated < 0) iCreated = 7;

    // email → data di registrazione più antica (un utente può avere più sessioni)
    var primaData = {};
    for (var r = 1; r < vals.length; r++) {
      var email = String(vals[r][iEmail] || '').trim().toLowerCase();
      if (!email) continue;
      var raw = vals[r][iCreated];
      var d = (raw instanceof Date) ? raw : (raw ? new Date(raw) : null);
      if (!d || isNaN(d.getTime())) continue;
      if (!primaData[email] || d < primaData[email]) primaData[email] = d;
    }

    var tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone) ? Session.getScriptTimeZone() : 'Europe/Rome';
    var byMonth = {};
    var ultimi30gg = 0;
    var soglia30 = new Date(Date.now() - 30 * 86400000);
    Object.keys(primaData).forEach(function(email) {
      var d = primaData[email];
      var mese = (typeof Utilities !== 'undefined' && Utilities.formatDate)
        ? Utilities.formatDate(d, tz, 'yyyy-MM')
        : (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
      byMonth[mese] = (byMonth[mese] || 0) + 1;
      if (d >= soglia30) ultimi30gg++;
    });

    var sorted = Object.keys(byMonth).sort();
    var serie0 = sorted.map(function(m) { return { month: m, count: byMonth[m] }; });
    var serie = _monRiempiMesi_(serie0); // riempie i mesi intermedi senza registrazioni (count 0)
    var totale = serie.length ? serie[serie.length - 1].cumulative : 0;

    return { ok: true, totalUsers: totale, byMonth: serie, ultimi30gg: ultimi30gg };
  } catch (e) {
    return { ok: false, error: e.message, totalUsers: 0, byMonth: [], ultimi30gg: 0 };
  }
}
