# 2 agosto 2026 — riepilogo della giornata e piano per domani

**Da v4.27.95 a v4.28.7** · 11 commit · locale = GitHub allineati
**Backup**: `../oc-codebase-backup-2026-08-02-sera` (123 file, v4.28.7)

---

## STATO DEPLOY — tutto allineato ✅

| Dove | Versione | Nota |
|---|---|---|
| Repo locale + GitHub | **v4.28.7** | tutto committato |
| Progetto GAS (codice) | **v4.28.7** | push riuscito |
| Webapp in produzione | **v4.28.7 (@915)** | deploy riuscito |

**Verificato in produzione**: 170 test, 0 falliti (12 suite).
Cancello di parità interrogato dal vivo: **NON PRONTO** con l'elenco esatto
(111 news + 12 podcast mancanti = registro non ancora migrato, comportamento
corretto e atteso), baseline riconosciuta = FontiFeed per tutti e tre i tipi.

**Nota sul limite versioni**: il primo tentativo di deploy di v4.28.6 era stato
respinto con «Script has reached the limit of 200 versions». Al tentativo
successivo il deploy è passato senza interventi manuali. Il limite resta un
punto di attenzione: se si ripresenta, liberare versioni dalla Cronologia
progetto di Apps Script **senza toccare** @698, @819 e l'ultima attiva.

---

## Cosa è stato fatto

### 1. Diagnosi e riparazione delle sezioni ferme (v4.27.96–97)
- **`?diag=sezioni`**: per ogni canale risponde con numeri a tre domande —
  fonti attive, ultimo contenuto entrato, quanti esposti
- **Causa trovata**: migrazione a FontiFeed lasciata a metà. Podcast 12 fonti
  su 121, **video ZERO** → scanner fermo da 87 giorni restituendo 0 in silenzio
- **`FontiSezioni.js`**: riallineamento podcast + reseed 25 canali YouTube
- **Libri**: pool query 6 → 20 (era esaurito: stesse ricerche, tutto deduplicato)

### 2. Registro fonti unico (v4.28.0)
- **`RegistroFonti.js`**: schema formale 26 colonne per tutte le categorie
  non-bandi; FontiBandi_v5 resta dedicato al Radar
- Migrazione con anteprima da 4 fogli storici, dedup per URL, fogli storici
  **non toccati**
- Anche le fonti API (GU, Open Library, Crossref, OpenAlex) registrate come
  righe consultabili: il registro elenca TUTTO ciò che il sistema monitora
- Adapter dietro flag `USE_REGISTRO_FONTI`, reversibile
- **Pulizia**: 25 bottoni obsoleti rimossi dal pannello Strumenti

### 3. Tassonomia T1–T10 (v4.28.1)
- `OC_TIPOLOGIE` in Constants come source of truth (T4 non esiste: un test
  verifica che non venga reintrodotto)
- Classificatore Claude Haiku a lotti di 12 + fallback euristico
- Ogni contenuto riceve **Tipologia + Aderenza 0–100**
- Batch notturno 02:00 sui contenuti ATTIVI (archivio profondo escluso)

### 4. Revisione trigger (v4.28.2)
- **Rimossi**: 4 seed one-shot che giravano a vuoto ogni giorno;
  `lunediMattina` ridotto al solo alert Telegram (tutto il resto duplicato);
  TED tolto dal giro settimanale (già quotidiano)
- **Sospesi** in attesa del report unico: `agenteFontiMute`, `podcastAuditMensile`
- **Riconversione**: AG1–AG5 sospesi con property `OC_AGENTI_ATTIVI`
- **Intatti**: digest Coorte B martedì, digest Matrix domenica, social draft,
  flusso redazionale

### 5. Agenti Scout (v4.28.3)
- **Miner** sui link dentro le news + bibliografie via Crossref
- **Scout università**: 22 atenei cultura/beni culturali/turismo
- Feed autodiscovery; se non c'è feed, propone il link newsletter (iscrizione
  manuale su sinopiaconsulting@gmail.com, **mai automatica**)
- Ciclo settimanale: domenica 17:00 riepilogo → decidi sul foglio
  `FontiCandidate` → "Applica decisioni"
- **Memoria permanente**: una fonte scartata non viene mai più riproposta
- Approvate → registro in **quarantena**
- **ANCI verificato**: vivo su `www.anci.it/rss` (il dominio senza www non
  risolve — causa storica del feed morto); feed di categoria vuoti

### 6. Redattore (v4.28.4)
- **Bandi**: recupero attivo per importanza — pertinenza, scadenza e link
  imprescindibili; i senza-link sono non recuperabili → candidati archivio
- **Altre categorie**: si soprassiede sui campi, si garantisce la coerenza
  tematica (aderenza < 30 = fuori tema, anteprima obbligatoria)

### 7. Verifica compatibilità (v4.28.5)
- **2 difetti corretti**: alias maiuscoli mancanti in `rfLeggi` (le news si
  sarebbero fermate in silenzio); nomi colonna `Link`/`Descrizione` inesistenti
  in Bandi_v5 (i reali sono `UrlBando`/`Sommario`) → "senza link" sempre 0
- **Cancello di parità** `rfConfronto` + `?diag=confronto`

### 8. Security review (v4.28.6)
- **1 finding Medium corretto**: formula injection nel foglio `FontiCandidate`
  (metadati Crossref e HTML esterni scritti senza `_sanitizeForCell_`).
  Scenario reale: il ciclo settimanale prevede che l'admin APRA quel foglio
- Sanitizzazione + ri-sanificazione alla copia + validazione schema URL
  (solo http/https entra: le URL finiscono in UrlFetchApp)

### 9. Code review indipendente (v4.28.7) — 4 Critical + 4 Important
- **C1**: lo switch al registro AVREBBE cambiato i risultati — `Priorita`
  assente dallo schema e dedotta dal Tier → priorità 2 per ogni fonte migrata
  → scanner podcast a vuoto nelle settimane dispari, in silenzio
- **C2**: la tematica andava persa → filtri di 2° livello di Podcast e Video
  svuotati
- **C3**: `rfConfronto` dava PRONTO su C1 e C2 (confrontava solo le URL) e
  usava la baseline sbagliata con un flag FontiFeed spento
- **C4**: fonte approvata persa per sempre se il registro non esisteva ancora
- **I1**: fallback euristico sotto la soglia di archiviazione → una notte di
  API muta avrebbe fatto archiviare contenuti pertinenti
- **I2**: coda notturna bloccabile su contenuti non classificabili
- **I7**: Scout schedulato alle 05 dietro tre job pesanti → mai eseguito.
  Spostato alle 21 (miner) e 20 (università)
- **I8 + difetto della v4.27.95**: `\b` in JavaScript è definito su
  `[A-Za-z0-9_]` → dopo una lettera accentata non c'è confine di parola.
  NOVITÀ, ATTIVITÀ, UNIVERSITÀ, CITTÀ non venivano MAI deduplicate — proprio
  la parola del caso GAL. Corretto: 47.078 → 28.828 caratteri, zero residui

---

## Da fare domani

### Priorità 1 — attivare il registro, nell'ordine
- [ ] `🗂 Registro: setup`
- [ ] `🔎 Migra (anteprima)` → controllare l'esito insieme
- [ ] `🗂 Migra (applica)`
- [ ] `⚖ Confronto pre-switch` → **deve dire PRONTO**
      (il cancello NUOVO: confronta anche priorità, tematica, ambito)
- [ ] `⚡ Registro: attiva` → 48h di osservazione su `?diag=sezioni`
- [ ] Se qualcosa non torna: `↩ Disattiva` (ritorno immediato, zero perdite)

✅ v4.28.7 è in produzione: il cancello attivo è quello NUOVO (confronta
anche priorità, tematica e ambito). Il vecchio avrebbe dato luce verde su due
regressioni certe.

### Priorità 2 — fonti podcast/video e libri
- [ ] Blocco "Fonti podcast, video e libri": anteprime → applica → scan di
      verifica
- [ ] Controllare quante delle 121 fonti podcast legacy sono ancora vive

### Priorità 3 — report unico (progettazione insieme, lunedì)
Base già pronta: consolidare in UNA email ciò che facevano reportUnificato +
agenteFontiMute + podcastAuditMensile, leggendo da `rfStato()`,
`frSaluteFonti()`, `txStato()`, `?diag=sezioni`. Principio: per ogni sezione
tre numeri (fonti attive/produttive, ultimo ingresso, esposti vs scartati),
mai impressioni.

### Priorità 4 — Fase 4: sezione Candidature
Decisioni già prese: perimetro ampio (Capitali italiana/europea, UNESCO WHL/
Creative Cities/MoW/immateriale, riconoscimenti minori), **entrambe le viste**
(lista con filtro per tipo + schede con timeline a fasi), schemi chiari e
dedicati. ANCI come fonte chiave già verificata.

### MINOR dalla code review (post-lancio)
- ID duplicati fra rami di migrazione diversi (`RFPOD_12` da due sorgenti)
- Email admin hardcoded in `scSettimanale` invece di `OC_ADMIN_EMAILS`
- `setValue` in loop nella tassonomia (120 round-trip per 60 contenuti)
- Scout università diventa no-op a giro completo: conviene auto-disattivarlo
- Memoria scartate fragile: vive nelle righe di `FontiCandidate`, che qualcuno
  potrebbe cancellare per leggibilità → foglio append-only dedicato
- Miner: il puntatore posizionale non raggiunge mai l'archivio (ancorare all'ID)
- `scanPodcastVideo` da pannello può superare i 6 minuti

### Backlog precedente ancora aperto
- 17 fonti bandi duplicate
- 5 feed morti da sostituire (FrizziFrizzi 732gg, MuseumNext, Cariplo 403,
  ANCI ora riparato, Treccani XML malformato)
- Migrazione mittente email (decisione Workspace)
- Chat-ID Telegram di Riccardo per le approvazioni trend
- Repository ricerca atenei via OpenAIRE (seconda battuta dello Scout)

---

## Numeri di oggi

- **11 commit**, 7 file nuovi (`FontiSezioni`, `RegistroFonti`, `Tassonomia`,
  `ScoutFonti`, `Redattore` + 2 doc)
- **~2.400 righe** aggiunte
- **Self-test**: da 106 a 159 in produzione + 56 casi locali sui moduli nuovi
- **25 comandi obsoleti rimossi** dal pannello, 7 attività schedulate eliminate
- **9 difetti reali corretti**, di cui 5 trovati da review indipendenti
  (security + code review) e 1 in un mio fix del giorno prima

## Il filo conduttore

Tre volte in tre giorni il guasto è stato **un canale che restituisce zero in
silenzio**: il canale RSS bandi mai schedulato, l'estrazione che leggeva il
menu, le fonti mai travasate. Un contatore a zero non distingue "non c'è
niente" da "non sto guardando" — e finché non lo distingue, il sistema può
stare fermo per mesi sembrando sano.

Tutto il lavoro di oggi va in quella direzione: diagnostica che risponde con
numeri, contatori scritti per ogni categoria, memoria permanente delle
decisioni, e cancelli che rifiutano di procedere quando i risultati
cambierebbero.
