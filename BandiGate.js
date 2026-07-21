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

// v4.27.49 — Titoli con natura di PUBBLICAZIONE/REPORT/EVENTO, non di bando.
// Casi reali dal report qualità del 21/07 (entrati e poi archiviati ogni
// giorno dall'agente): 'Rapporto sociale 2024', 'Minicifre della cultura',
// 'Performance dei Musei Civici', 'Aggiunti al Calendario di Timely'.
var _BANDO_PUBBLICAZIONE_RE = /^\s*(rapporto\s|report\s+(annuale|sociale)\b|minicifre\b|newsletter\b|calendario\s|bilancio\s+(sociale|di\s+missione)\b|atti\s+del\b|aggiunti\s+al\b|performance\s+dei\b|programma\s+(annuale|culturale)\s*\d*\s*$)/i;

/**
 * true se il record NON è un vero bando (voce di menu/legale/navigazione,
 * titolo-URL, titolo vuoto o titolo con natura di pubblicazione/report).
 */
function _bandiNonBando_(b) {
  var t = String((b && b.titolo) || '').trim();
  if (!t) return true;                        // titolo vuoto
  if (/^https?:\/\//i.test(t)) return true;   // titolo = URL → voce di menu
  if (/\bgdpr\b/i.test(t)) return true;       // "... GDPR Compliance"
  if (_BANDO_JUNK_RE.test(t)) return true;    // voce di navigazione/legale
  if (_BANDO_PUBBLICAZIONE_RE.test(t)) return true; // v4.27.49 — pubblicazione/report
  return false;
}

/**
 * v4.27.49 — GATE D'INGRESSO (scanner → foglio Bandi_v5): blocca al
 * SALVATAGGIO i record senza natura di bando, invece di lasciarli entrare e
 * farli archiviare il giorno dopo dall'agente qualità (15 archiviati il
 * 21/07). Conservativo: in dubbio lascia passare — l'agente qualità e il
 * gate di esposizione restano come seconda e terza rete.
 */
function bandoIngressoValido_(b) {
  if (!b) return false;
  var t = String(b.titolo || '').trim();
  if (!t || t.length < 8) return false;                    // titolo assente/troppo corto
  if (_bandiNonBando_({ titolo: t })) return false;        // junk/nav/pubblicazione
  if (_BANDO_TITOLO_NUMERO_RE.test(t)) return false;       // titolo solo-numero
  return true;
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

// v4.27.24 — Titolo "solo numero" (TED Notice rotto): NNNNN, NNNNN-YYYY, ecc.
var _BANDO_TITOLO_NUMERO_RE = /^(?:ted\s+notice\s+)?\d{3,}[-\/]?\d*$/i;

/**
 * v4.27.24 — VALIDATORE DI ESPOSIZIONE (spec Silvano: "meglio un bando in meno
 * che uno scaduto o senza informazioni base"). Ritorna false se il bando NON
 * deve essere mostrato:
 *  - titolo solo-numero (parse TED fallito) → MAI;
 *  - scaduto (giorni < 0) → MAI;
 *  - senza scadenza E senza una descrizione utile → MAI (nessuna info base).
 * I bandi senza scadenza ma CON descrizione (es. finanziamenti a sportello)
 * restano ammessi. Ritorna anche il motivo per il report.
 */
function _bandiMotivoScarto_(b) {
  var tit = String((b && b.titolo) || '').trim();
  if (!tit || _BANDO_TITOLO_NUMERO_RE.test(tit)) return 'titolo-non-informativo';
  var g = (b && b.giorni !== undefined) ? b.giorni : null;
  if (g !== null && g < 0) return 'scaduto';
  var descr = String((b && b.sommario) || '').replace(/\s+/g, ' ').trim();
  if (g === null && descr.length < 20) return 'senza-scadenza-e-senza-descrizione';
  return '';
}

/**
 * GATE FINALE — validazione + filtro cultura + normalizzazione link su un array
 * di bandi GIÀ mappati. Idempotente (proprietà __gated). Ritorna i soli bandi
 * VALIDI e culturali.
 *
 * @param {Array<Object>} arr
 * @return {Array<Object>}
 */
function bandiGateFinale_(arr) {
  if (!arr || !arr.length) return arr || [];
  var out = [];
  var scartatiCultura = 0;
  var scartatiJunk = 0;
  var scartatiInvalidi = 0;
  for (var i = 0; i < arr.length; i++) {
    var b = arr[i];
    if (!b) continue;

    if (b.__gated) { out.push(b); continue; }

    // 0) FILTRO ANTI-SPAZZATURA (voci di menu/legali scrapate, non bandi)
    if (_bandiNonBando_(b)) { scartatiJunk++; continue; }

    // 0-bis) VALIDAZIONE ESPOSIZIONE (scaduti / senza-info / titolo-numero)
    if (_bandiMotivoScarto_(b)) { scartatiInvalidi++; continue; }

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
  if (scartatiCultura > 0 || scartatiJunk > 0 || scartatiInvalidi > 0) {
    Logger.log('[bandiGateFinale_] scartati: ' + scartatiJunk + ' non-bando + ' +
      scartatiInvalidi + ' invalidi (scaduti/senza-info) + ' +
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
