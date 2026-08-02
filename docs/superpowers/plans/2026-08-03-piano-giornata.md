# 3 agosto 2026 — piano operativo della giornata

**Punto di partenza**: v4.28.11 · deploy @919 · locale = GAS = GitHub allineati
**Backup**: `../oc-codebase-backup-2026-08-02-sera`
**Obiettivo di fondo**: lancio nazionale a settembre. Ordine, precisione,
completezza. Nessuna scrittura senza anteprima.

---

## PRIMA COSA DELLA MATTINA — leggere l'esito della notte

Dopo la scansione automatica delle 07:30 (podcast + video, la prima con i
contatori attivi) e le finestre notturne di enrichment e tassonomia.

**Comando**: `?diag=sezioni` oppure il bottone `📊 Registro: stato`

**Cosa deve rispondere, per podcast e video:**
- quante delle 124 fonti hanno prodotto (`OK`)
- quante sono vuote (`EMPTY`)
- quante in errore, **con il motivo** (`HTTP_404`, `NON_RSS`, `NON_ATOM`, `ERROR`)

È il primo quadro onesto del patrimonio podcast/video da quando esiste il
sistema. Metti in conto che una parte risulterà morta: non è una cattiva
notizia, è l'informazione che permette di potare con criterio.

**Decisione che ne consegue**: quali fonti disattivare. Criterio proposto —
`HTTP_404` e `NON_RSS` ripetuti su 2 scansioni → sospendere; `EMPTY` →
lasciare in osservazione (un podcast può non pubblicare per settimane).

---

## BLOCCO 1 — Registro fonti unico: lo switch

Sequenza rigida, ogni passo verificato prima del successivo.

1. `🗂 Registro: setup` — crea il foglio (26 colonne)
2. `🔎 Registro: migra (anteprima)` — **mandare l'esito prima di applicare**
   Attesi: ~113 news + 97 podcast + 27 video + 7 social + 6 API strutturate
3. `🗂 Registro: migra (applica)`
4. `⚖ Registro: confronto pre-switch` — **deve dire PRONTO**
   Il cancello nuovo confronta anche priorità, tematica e ambito, non solo le
   URL, e usa come baseline la sorgente che gira davvero. Se dice NON PRONTO
   elenca esattamente cosa manca: si corregge e si ripete.
5. `⚡ Registro: attiva`
6. **48 ore di osservazione** su `?diag=sezioni`: i "nuovi 7gg" non devono
   calare. Al primo segnale storto → `↩ Registro: disattiva` (ritorno
   immediato, zero perdite)

⚠️ Il passo 4 non è una formalità: ieri il cancello vecchio dava luce verde
su due regressioni certe (priorità e tematica perse). Se dice NON PRONTO,
non si procede.

---

## BLOCCO 2 — Pulizia dei residui YouTube (~30 min)

**Problema**: 46 feed con `youtube.com` in FontiFeed, ma solo 27 di tipo
`video`. Uno è Rai Cultura (tipo `rss`, 432 contenuti, funziona — non
toccare). Restano ~18 righe con l'URL della **pagina** del canale
(`youtube.com/@nome` o `/channel/UC...`) invece del feed: inservibili anche
prima, perché una pagina HTML non si legge come RSS. Ereditate dal foglio
legacy.

**Rimedio**: funzione di conversione con anteprima, che usa
`_youtubeChannelToFeedUrl` (la stessa che ieri ha risolto i tre `@handle`)
per trasformare l'URL della pagina nel feed corrispondente e correggere il
tipo. Le non convertibili si sospendono con motivo scritto.

**Da verificare nello stesso giro**: Fondazione Sandretto compare con due
`channel_id` diversi (legacy `UC2LpJYisK7TJ51VXuX3LQ5w` vs catalogo seed
`UCYrENk9lYuC3o91lF-gJPSw`). Con la normalizzazione corretta sono due fonti
distinte: una delle due è probabilmente obsoleta.

---

## BLOCCO 3 — Report unico (progettazione insieme)

Era stato sospeso il 1º agosto per riprogettarlo. Ora le fonti dati ci sono
tutte.

**Deve consolidare in UNA email** ciò che facevano `reportUnificato` +
`agenteFontiMute` + `podcastAuditMensile`, leggendo da:
- `rfStato()` — registro per categoria (attive, quarantena, morte, in errore)
- `frSaluteFonti()` — fonti bandi per tier A/B/C
- `txStato()` — copertura tassonomia + aderenza debole
- `?diag=sezioni` — contenuti per sezione

**Principio non negoziabile**: per ogni sezione tre numeri — fonti
attive/produttive, ultimo ingresso, esposti vs scartati con il motivo. Mai
impressioni, mai aggettivi.

**Da decidere insieme**: destinatari (solo admin o anche Riccardo), frequenza
(quotidiana o 2-3 volte a settimana), e soglie di allarme che meritano una
riga in evidenza.

---

## BLOCCO 4 — Fase 4: sezione Candidature

Decisioni già prese il 2 agosto, da implementare:
- **Perimetro ampio**: Capitale italiana della cultura (+ libro, arte
  contemporanea), Capitale europea, UNESCO (Lista Patrimonio Mondiale,
  Creative Cities, Memory of the World, patrimonio immateriale),
  riconoscimenti minori (Città che legge, European Heritage Label, Bandiere
  arancioni, Borghi più belli)
- **Entrambe le viste, con schemi chiari e dedicati**: lista avvisi con
  filtro per tipo di riconoscimento + schede candidatura con timeline a fasi
  (avviso → dossier → shortlist → designazione)
- **ANCI** come fonte chiave, già verificata: `www.anci.it/rss` (il dominio
  senza www non risolve; i feed di categoria rispondono 200 ma sono vuoti →
  feed generale con filtro a valle)

**Lavoro**: foglio `Candidature`, scanner dedicato, pagina webapp autonoma,
voce sidebar, card home.

---

## BLOCCO 5 — Verifiche di qualità in coda

- **Bandi**: `📋 Bandi: completezza` — quanti senza link e senza scadenza
  dopo tre notti di enrichment con l'estrazione corretta (il fix delle
  parole accentate è attivo da ieri sera)
- **Tassonomia**: `📊 Tassonomia: stato` — copertura dopo due notti di batch;
  se procede bene, aggiungere i filtri per tipologia nelle sezioni
- **Scout**: il primo miner gira stanotte alle 21 e il riepilogo candidate
  arriva domenica alle 17. Nessuna azione fino ad allora.

---

## Ordine consigliato

1. Lettura esito notte (10 min) → decisioni sulle fonti morte
2. Blocco 1 registro (30 min, con le pause per controllare le anteprime)
3. Blocco 2 pulizia YouTube (30 min)
4. Blocco 3 report unico — è il pezzo che richiede la tua testa, non solo
   le tue mani: meglio a mente fresca
5. Blocco 4 Candidature — il più lungo, va bene anche nel pomeriggio
6. Blocco 5 verifiche — di passaggio, quando capita

Se la giornata si accorcia: i blocchi 1 e 2 sono quelli che sbloccano tutto
il resto. Il 3 e il 4 possono slittare senza danni.

---

## Backlog aperto (non urgente, ma da non perdere)

- 17 fonti bandi duplicate
- 5 feed morti da sostituire (FrizziFrizzi 732gg, MuseumNext, Cariplo HTTP
  403, Treccani XML malformato; ANCI risolto ieri)
- MINOR dalla code review: ID duplicati fra rami di migrazione, email admin
  hardcoded in `scSettimanale`, `setValue` in loop nella tassonomia, Scout
  università no-op a giro completo, memoria scartate da spostare su foglio
  append-only, puntatore del miner che non raggiunge l'archivio
- Migrazione mittente email (decisione Workspace)
- Chat-ID Telegram di Riccardo per le approvazioni trend
- Repository ricerca atenei via OpenAIRE (seconda battuta dello Scout)
- Limite 200 versioni GAS: tenerlo d'occhio, se si ripresenta liberare la
  Cronologia progetto senza toccare @698, @819 e l'ultima attiva
