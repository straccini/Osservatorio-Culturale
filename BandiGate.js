// ============================================================================
//  BandiGate.js — Gate FINALE di esposizione bandi (cultura + link)
// ----------------------------------------------------------------------------
//  Osservatorio Culturale — Sinopia / Silvano Straccini · 2026-07-05
//
//  PROBLEMA RISOLTO
//  ----------------
//  Prima di questo modulo, la classificazione culturale (isBandoCulturale) era
//  applicata SOLO nel backfill one-shot backfillSettoreCultura() che archivia.
//  I bandi non ancora ri-classificati (o classificati male) sfuggivano al filtro
//  e finivano esposti in home/pagina bandi. Analogamente, i bandi con link
//  mancante venivano mostrati con un pulsante "Apri" vuoto.
//
//  SOLUZIONE
//  ---------
//  bandiGateFinale_(arr) è un cancello UNICO applicato a valle di TUTTE le
//  funzioni che espongono bandi al frontend (getBandiV5, getUltimiBandiV5, e i
//  rami RADAR di getBandiListV42 / getUltimiBandiMonitorati). Per ogni bando:
//
//   1) FILTRO CULTURA — isBandoCulturale(titolo, settore, sommario, cpv):
//      se il bando è chiaramente NON culturale (sanità, trasporti, rifiuti,
//      pulizie, ...) viene SCARTATO dall'esposizione (rete di sicurezza live,
//      indipendente dal backfill).
//
//   2) NORMALIZZAZIONE LINK — ogni bando esce SEMPRE con un link cliccabile:
//      - linkDiretto : URL specifico del bando (se il link punta alla pagina
//                      del bando e non a una homepage/sezione generica);
//      - linkConsulta: URL da usare per "consultare il sito" — il link diretto
//                      se disponibile, altrimenti l'URL generico dell'ente,
//                      altrimenti una ricerca web mirata su titolo+ente;
//      - linkTipo    : 'diretto' | 'generico' | 'consulta' (nessun link reale).
//      - link        : compat retro — resta valorizzato con il miglior URL
//                      disponibile, così i pulsanti esistenti continuano a
//                      funzionare senza modifiche al frontend.
//
//  NOTA su "controllare che siano attivi"
//  --------------------------------------
//  Un bando esposto è ATTIVO per costruzione: le funzioni a monte scartano già
//  i bandi scaduti e quelli senza scadenza futura certa. Una verifica HTTP live
//  per-bando in fase di render non è praticabile (UrlFetchApp × N bandi manda in
//  timeout la doGet). L'attività è quindi garantita dalla scadenza futura; il
//  link "consulta" assicura comunque un accesso utile anche quando il link
//  diretto non è disponibile.
// ============================================================================

/** true se url è un http(s) valido. */
function _bandiUrlValido_(u) {
  u = String(u || '').trim();
  return /^https?:\/\/\S+/i.test(u) ? u : '';
}

// Titoli che NON sono bandi ma voci di navigazione/legali scrapate dai siti
// (soprattutto portali GAL): privacy, cookie, credits, "chi siamo", ecc.
var _BANDO_JUNK_RE = /^\s*(accetto\s+privacy|informativa(?:\s+privacy)?|privacy(?:\s*[-–&]|\s+e\s+cookie|\s+policy|\s*$)|cookie|credits?\b|crediti\b|organizzazione\s*&?\s*soci|associarsi\b|diventa\s+socio|chi\s+siamo|contatti\b|dove\s+siamo|come\s+raggiungerci|mappa\s+del\s+sito|mappa\s+dei\s+finanziamenti|area\s+riservata|accedi\b|log\s*in|iscriviti\b|newsletter\b|note\s+legali|termini\s+e\s+condizioni|amministrazione\s+trasparente)/i;

/**
 * true se il record NON è un vero bando (voce di menu/legale/navigazione o
 * titolo che è di fatto un URL o un titolo vuoto).
 */
function _bandiNonBando_(b) {
  var t = String((b && b.titolo) || '').trim();
  if (!t) return true;                        // titolo vuoto
  if (/^https?:\/\//i.test(t)) return true;   // titolo = URL → voce di menu
  if (/\bgdpr\b/i.test(t)) return true;       // "... GDPR Compliance"
  if (_BANDO_JUNK_RE.test(t)) return true;    // voce di navigazione/legale
  return false;
}

/**
 * Classifica un URL come 'diretto' (pagina specifica del bando) o 'generico'
 * (homepage / sezione). Riusa l'euristica già validata _frLinkGenerico_ di
 * FontiReport.js; se assente, usa un fallback locale equivalente.
 */
function _bandiLinkTipo_(url) {
  var u = _bandiUrlValido_(url);
  if (!u) return 'assente';
  if (typeof _frLinkGenerico_ === 'function') {
    return _frLinkGenerico_(u) ? 'generico' : 'diretto';
  }
  // Fallback locale (stessa logica di _frLinkGenerico_)
  var senzaProto = u.replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  var parti = senzaProto.split('/');
  if (parti.length <= 1) return 'generico';
  var path = parti.slice(1).join('/');
  var haId = /\d{2,}/.test(path) || /[a-z0-9-]{12,}/i.test(parti[parti.length - 1]);
  if (path.length < 6 || !haId) return 'generico';
  return 'diretto';
}

/** Link di ricerca web mirato — "consulta il sito" quando manca un URL reale. */
function _bandiLinkRicerca_(b) {
  var titolo = String((b && b.titolo) || '').slice(0, 120);
  var ente = String((b && b.ente) || '').slice(0, 80);
  var q = (titolo ? ('"' + titolo + '"') : '') + (ente ? (' ' + ente) : '');
  q = q.trim() || 'bandi cultura';
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

/**
 * GATE FINALE — applica filtro cultura + normalizzazione link a un array di
 * bandi GIÀ mappati (oggetti con .titolo/.settore/.sommario/.cpv/.link/.ente).
 * Idempotente: se un bando è già stato "gated" (proprietà __gated) non viene
 * ri-processato. Ritorna un NUOVO array coi soli bandi culturali.
 *
 * @param {Array<Object>} arr
 * @return {Array<Object>}
 */
function bandiGateFinale_(arr) {
  if (!arr || !arr.length) return arr || [];
  var out = [];
  var scartatiCultura = 0;
  var scartatiJunk = 0;
  for (var i = 0; i < arr.length; i++) {
    var b = arr[i];
    if (!b) continue;

    if (b.__gated) { out.push(b); continue; }

    // 0) FILTRO ANTI-SPAZZATURA (voci di menu/legali scrapate, non bandi)
    if (_bandiNonBando_(b)) { scartatiJunk++; continue; }

    // 1) FILTRO CULTURA (rete di sicurezza live)
    if (typeof isBandoCulturale === 'function') {
      var okCultura = isBandoCulturale(b.titolo, b.settore, b.sommario, b.cpv);
      if (!okCultura) { scartatiCultura++; continue; }
    }

    // 2) NORMALIZZAZIONE LINK
    var urlRaw = _bandiUrlValido_(b.link);
    var tipo = urlRaw ? _bandiLinkTipo_(urlRaw) : 'assente';
    if (tipo === 'diretto') {
      b.linkDiretto = urlRaw;
      b.linkConsulta = urlRaw;
      b.linkTipo = 'diretto';
      b.link = urlRaw;
    } else if (tipo === 'generico') {
      b.linkDiretto = '';
      b.linkConsulta = urlRaw;      // usabile per "consulta il sito"
      b.linkTipo = 'generico';
      b.link = urlRaw;
    } else {
      // nessun link reale → ricerca web mirata
      var ricerca = _bandiLinkRicerca_(b);
      b.linkDiretto = '';
      b.linkConsulta = ricerca;
      b.linkTipo = 'consulta';
      b.link = ricerca;             // il frontend ha comunque un link cliccabile
    }

    b.__gated = true;
    out.push(b);
  }
  if (scartatiCultura > 0 || scartatiJunk > 0) {
    Logger.log('[bandiGateFinale_] scartati: ' + scartatiJunk + ' non-bando + ' +
      scartatiCultura + ' non-cultura / ' + arr.length);
  }
  return out;
}

// ============================================================================
//  AUTO-TEST — eseguibile dall'editor GAS: bandiGateSelfTest()
//  Verifica il comportamento del gate su casi campione. Ritorna un report e
//  logga PASS/FAIL per ogni asserzione. Nessuna scrittura sui fogli.
// ============================================================================
function bandiGateSelfTest() {
  var casi = [
    // --- CULTURA: devono PASSARE ---
    { in:{ titolo:'Restauro del Museo Civico e allestimento nuove sale', settore:'patrimonio', sommario:'', cpv:'92521000', link:'https://comune.esempio.it/bandi/restauro-museo-2026-id12345' }, attesoIn:true, attesoTipo:'diretto', nome:'Museo con link diretto' },
    { in:{ titolo:'Servizi di biblioteca e catalogazione', settore:'', sommario:'gestione emeroteca', cpv:'', link:'https://biblioteca.esempio.it' }, attesoIn:true, attesoTipo:'generico', nome:'Biblioteca con homepage' },
    { in:{ titolo:'Festival teatrale estivo — direzione artistica', settore:'spettacolo', sommario:'', cpv:'', link:'' }, attesoIn:true, attesoTipo:'consulta', nome:'Teatro senza link' },
    // --- NON CULTURA: devono essere SCARTATI ---
    { in:{ titolo:'Fornitura di ambulanze e presidi sanitari per ASL', settore:'sanità', sommario:'pronto soccorso', cpv:'34114121', link:'https://asl.esempio.it/bando' }, attesoIn:false, nome:'Ambulanze (sanità)' },
    { in:{ titolo:'Servizio di raccolta rifiuti urbani e nettezza urbana', settore:'ambiente', sommario:'', cpv:'90511000', link:'' }, attesoIn:false, nome:'Rifiuti (ambiente)' },
    { in:{ titolo:'Manutenzione stradale e segnaletica orizzontale', settore:'', sommario:'asfaltatura', cpv:'45233141', link:'' }, attesoIn:false, nome:'Strade (lavori)' },
    // --- SPAZZATURA (voci di menu/legali): devono essere SCARTATE ---
    { in:{ titolo:'Accetto Privacy - GDPR Compliance', settore:'', sommario:'', cpv:'', link:'' }, attesoIn:false, nome:'Junk: privacy/GDPR' },
    { in:{ titolo:'Credits: Alea.pro', settore:'', sommario:'', cpv:'', link:'' }, attesoIn:false, nome:'Junk: credits' },
    { in:{ titolo:'Organizzazione & Soci', settore:'', sommario:'', cpv:'', link:'' }, attesoIn:false, nome:'Junk: organizzazione' },
    { in:{ titolo:'Associarsi a VeGAL', settore:'', sommario:'', cpv:'', link:'' }, attesoIn:false, nome:'Junk: associarsi' },
    { in:{ titolo:'https://agriculture.ec.europa.eu/common-agricultural-policy', settore:'', sommario:'', cpv:'', link:'' }, attesoIn:false, nome:'Junk: titolo-URL' }
  ];

  var risultati = [];
  var pass = 0, fail = 0;
  for (var i = 0; i < casi.length; i++) {
    var c = casi[i];
    var gated = bandiGateFinale_([JSON.parse(JSON.stringify(c.in))]);
    var passato = gated.length === 1;
    var okIn = (passato === c.attesoIn);
    var okTipo = true;
    if (c.attesoIn && passato && c.attesoTipo) {
      okTipo = (gated[0].linkTipo === c.attesoTipo);
    }
    var ok = okIn && okTipo;
    if (ok) pass++; else fail++;
    var dett = {
      caso: c.nome,
      atteso_esposto: c.attesoIn,
      effettivo_esposto: passato,
      atteso_linkTipo: c.attesoTipo || '—',
      effettivo_linkTipo: (passato ? gated[0].linkTipo : '—'),
      esito: ok ? 'PASS' : 'FAIL'
    };
    risultati.push(dett);
    Logger.log('[selftest] ' + dett.esito + ' — ' + c.nome +
      ' | esposto atteso=' + c.attesoIn + ' effettivo=' + passato +
      ' | linkTipo atteso=' + (c.attesoTipo||'—') + ' effettivo=' + dett.effettivo_linkTipo);
  }
  var report = { ok: fail === 0, pass: pass, fail: fail, totale: casi.length, dettagli: risultati };
  Logger.log('=== bandiGateSelfTest: ' + pass + '/' + casi.length + ' PASS ===');
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
