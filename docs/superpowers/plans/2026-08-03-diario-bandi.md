# 3 agosto 2026 — diario di lavoro sui bandi

Traccia di quello che abbiamo fatto, nel bene e nel male. Ogni riga è
verificata con una misura, non con un'impressione.

---

## Il problema di partenza

Silvano: la newsletter non è partita per mancanza di bandi; il report dice
69 nuovi in una settimana ma il totale è 71; ANAC e OpenCUP risultano
`undefined`.

---

## Cosa abbiamo misurato

```
Entrati in 7 giorni:      740
Archiviati subito:        655   (88%)
Bandi attivi:             153
  con scadenza:            35
  con scadenza FUTURA:     30   ← il serbatoio reale
  senza alcuna scadenza:  118
```

Per fonte, il dato che ha aperto l'indagine:

| Fonte | Attivi | Con scadenza |
|---|---|---|
| EU Funding (SEDIA) | 19 | **19** |
| Regione Puglia | 16 | 0 |
| TED Esiti | 15 | 0 |
| Artribune Musei | 11 | 0 |
| MuseumNext | 10 | 0 |

Una sola fonte consegnava le scadenze.

---

## I difetti trovati (e la loro storia)

### 1. TED chiedeva un campo che non esiste — CAUSA PRINCIPALE
`FontiApiStrutturate.js` · parser giornaliero `fasParserTedApiPost`

Il parser chiedeva all'API il campo `deadline-receipt-tender-date-lot`.
Verificato dal vivo il 03/08: quel nome **restituisce `null` su ogni
avviso**. Il campo giusto è `deadline-receipt-request`, popolato al 100%.

Conseguenza: **ogni bando TED è sempre arrivato senza scadenza**, quindi
non è mai stato esposto (la regola richiede scadenza certa), è stato
archiviato e infine cancellato. Per mesi.

Misura prima/dopo sulla stessa query:
- prima: 0 avvisi su 20 con scadenza
- dopo: **20 su 20**, di cui 5 con scadenza futura

### 2. TED ingeriva gli esiti di gara
Stessa funzione, query senza filtro sul tipo di avviso.

Su 79 avvisi culturali italiani in 120 giorni, **41 erano avvisi di
AGGIUDICAZIONE** (`can-standard`, `can-social`): risultati di gara, che
per natura non hanno scadenza. Finivano nel Radar come bandi senza data.

Aggiunto `notice-type IN (cn-standard cn-social)`. Con il filtro: zero
avvisi senza scadenza su 50 esaminati.

### 3. TED pescava dal 2016
Nessuna finestra temporale: i risultati arrivano dal più vecchio. Aggiunto
`publication-date >= (oggi - 45 giorni)`. Nel perimetro CPV cultura:
**149 avvisi disponibili**.

### 4. ANAC è bloccata dal WAF, e lo nascondeva
`dati.anticorruzione.it` risponde **HTTP 200 con una pagina HTML
"Request Rejected"** invece del JSON. Il parser non trovava dati e
riportava zero senza mai segnalare un errore.

### 5. OpenCUP interroga l'endpoint sbagliato
Funziona, ma chiede al **catalogo** open data di dati.gov.it: restituisce
8 descrittori di dataset, non bandi con scadenza.

### 6. ANAC e OpenCUP non erano dichiarate nel registro
`FAS_API_REGISTRY` aveva 9 voci, nessuna delle due — pur avendo i parser
attivi in Fase 2b. Il report cercava il loro stato, non lo trovava,
stampava `undefined`. Ora sono dichiarate con lo stato reale e il motivo
scritto per esteso.

---

## Cosa NON era vero (autocorrezioni)

**"Archiviazione di massa di bandi validi"** — l'avevo definita *sospetto
grave* dopo aver visto tre bandi con scadenza 2026/2030 in cima
all'archivio (Sardegna, Bolzano, FVG). Falso: su 1.395 archiviati, quelli
con scadenza futura sono **20**, di cui 15 recuperabili. Avevo
generalizzato da tre esempi.

**"Il lavoro sui CPV è perso"** — non è perso. È tutto in
`BandiConsolida.js`, tre query con le famiglie CPV complete, mai rimosso.
Non è mai stato *acceso*: `setupFontiApiTed()` è una setup one-shot che
nessuno richiama. Il parser giornaliero usa una lista CPV anche più ricca
(22 codici) — il problema era il campo scadenza, non i CPV.

**"MEPA perso"** — mai esistito. Controllata tutta la storia git: nessun
codice per MEPA o Consip. Il nome compare solo come etichetta del tier A
(`FontiRegia.js:400`) e nei titoli del pannello. Fonte prevista e
classificata, mai implementata; nel piano del 2 giugno era dichiarata
esplicitamente fuori scope.

**Il "69 su 71" non è un errore**: 71 = esposti adesso, 69 = entrati negli
ultimi 7 giorni. Coincidono perché il sistema non accumula.

---

## Cosa abbiamo fatto

| Versione | Intervento |
|---|---|
| v4.28.12 | `?diag=archiviati` — archiviati con scadenza futura, con la regola che li scarta |
| v4.28.13 | Enrichment 15 → **40 per finestra**, quarta finestra alle 23 (45 → 160 tentativi/notte). ANAC e OpenCUP dichiarate con stato reale |
| v4.28.14 | **TED: campo scadenza corretto + filtro tipo avviso + finestra 45 giorni** |

Decisioni di Silvano applicate:
- enrichment intensivo sui 118 senza scadenza — fatto
- newsletter: resta la regola "solo scadenza certa, anche se pochi" — nessuna modifica
- ANAC: provato il canale diretto, non individuabile alla cieca (8 varianti,
  incluse le rotte OpenAPI standard); applicata la strategia di sostituzione

---

## Cosa resta aperto

**ANAC/BDNCP**: il portale della Pubblicità Legale ha un'API vera (risponde
`application/problem+json` sui 404), ma il percorso corretto non è
individuabile senza documentazione. Da riprendere con le specifiche
ufficiali. È la fonte più ricca per le gare italiane sotto-soglia.

**MEPA/Consip**: da costruire da zero. Prima di impegnare tempo, va
verificato se Consip esponga un accesso pubblico ai bandi MEPA o richieda
autenticazione.

**Copertura geografica TED**: la query è EU-wide (nel campione: Germania,
Belgio, Spagna, Italia). Più offerta, ma per musei italiani una parte è
rumore. Da valutare se aggiungere `place-of-performance=ITA` o tenere il
respiro europeo — il filtro cultura del gate e la tassonomia lavorano
comunque a valle.

**I 15 archiviati recuperabili**: da ripristinare, porterebbero
l'esposizione da 71 a ~86.

---

## Cosa verificare domattina

Dopo la notte (4 finestre di enrichment × 40 + scansione TED corretta):

1. `📋 Bandi: completezza` — quanti dei 118 senza scadenza ne hanno
   recuperata una
2. `?diag=contatori` — se i bandi con scadenza futura salgono da 30
3. Se TED comincia a produrre bandi **con** scadenza: è la prova che il fix
   del campo funziona in produzione

Il numero da guardare è uno solo: **bandi con scadenza futura certa**. Se
domani supera 50, la newsletter settimanale ha un serbatoio. Se resta
intorno a 30, il problema è la composizione delle fonti e va affrontato lì.
