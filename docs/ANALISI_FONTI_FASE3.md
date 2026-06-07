# Fase 3 — Analisi delle fonti e architettura del sistema di intelligence

**Data:** 7 giugno 2026 · **Autore:** Silvano Straccini / Duemilamusei
**Scopo:** verifica e analisi dello stato attuale del sistema fonti+agenti, e proposta di architettura per un sistema di *intelligence sulle fonti culturali* (trend + opinion leader) — super-profilato, autonomo, IT+EU, potenzialmente esportabile.
**Metodo:** due analisi tecniche parallele in sola lettura del codice (sistema agenti/API + strato dati fonti).

---

## 1. Stato attuale — cosa esiste (motore di RACCOLTA, solido)

**Tre livelli di agenti:**
- **Agenti tematici di contenuto** AG1-AG5 (`AgentConfig.js`, `AgentScanner.js`): AG1 bandi, AG2 normativa, AG3 innovazione/best practice, AG4 comunità/welfare/accessibilità, AG5 digital/AI/governance. Scansione 1 agente/giorno (lun-ven 07:00), estrazione via Claude (`titolo, sommario, tags[], score 1-5, tipo`), scrittura in `AgentScanResults`, digest email tematici.
- **Agenti raccolta bandi** (paralleli): **AgentRegionale** (BUR + Open Data di 20 regioni, CKAN/Socrata/WP-JSON/scraping), **FAS** (`FontiApiStrutturate.js`, API strutturate), **SEAS** (`SistemaAgentiEsploratori.js`, *scoperta di nuove fonti* con classificazione Claude e auto-approvazione ≥80).
- **AG6 Social** (`AgentSocial.js`): genera bozze post IG/LinkedIn dalle news interne (solo *outbound*; pubblicazione = stub). **Supervisore MA1-MA6** (`AgentSupervisore.js`): igiene dati, quality check, audit, scoperta fonti, archiviazione.

**Routing per-museo** (`AgentRouting.js`): scoring ibrido a 2 fasi — hard rules (geografia, beneficiari) + soft rules pesate (`30×regione + 25×gap-dimensione + 20×tipologia + 15×profilo-P + 10×priorità`), soglia 40, badge "Consigliato per te" ≥70. Profilo museo derivato da Matrix (regione, tipologia, profilo P1-P5, top-3 gap).

**Tipi di fonte gestiti:** bandi (`Bandi_v5`, estrazione Claude ricca: importo, scadenza, beneficiari, rischi), news (`Items`, Claude Haiku), podcast/video (`Podcast`), libri (`Pubblicazioni`, manuale), norme (via AG2 → `AgentScanResults`/`Bandi_v5`).

**API esterne:** TED (POST), CORDIS (GET JSON), SEDIA/EUFT funzionanti via `AgentScanner`; OpenCoesione/CKAN in sviluppo. **4 disabilitate** (ANAC, OpenCUP, SEDIA-legacy, Lombardia) per endpoint inerti. TED/PNRR-RSS azzerati (403 server-to-server da GAS).

---

## 2. Il gap — cosa manca per la visione (confermato assente nel codice)

| # | Capacità mancante | Evidenza | Conseguenza |
|---|---|---|---|
| 1 | **Trend intelligence** | i `tags[]` sono salvati per-record ma mai aggregati/storicizzati | nessuna rilevazione di temi emergenti del settore |
| 2 | **Estrazione entità (NER)** | nessun modulo estrae persone/organizzazioni; nessun foglio `Entita` | impossibile mappare gli opinion leader |
| 3 | **Sentiment / popolarità** | lo "score" è qualità editoriale, non risonanza | nessun segnale di "chi/cosa fa rumore" |
| 4 | **Social wall inbound** | `AgentSocial` è solo outbound; nessun ingest social | nessun polso del dibattito social |
| 5 | **Norme strutturate** | AG2 esiste ma manca foglio `Norme`; tassonomia NRM-01..10 definita ma **mai scritta**; niente Normattiva/EUR-Lex | norme non navigabili né autorevoli |
| 6 | **Copertura EU** | `FAS_TED_FEEDS`/`PNRR_FEEDS` vuoti; TED `bloccata` (403 da GAS) | EU tentata ma fragile |
| 7 | **Super-profilazione profonda** | `prioritaSoggettive` sempre vuote; nessun apprendimento dai click; profilo statico | profilazione superficiale |
| 8 | **Sintesi cross-agente** | gli agenti producono liste; nessun meta-brief che colleghi bando↔trend↔leader↔museo | manca il "racconto" che crea valore |

**Debiti tecnici da sanare lungo il percorso:** `validateHttpsCertificates:false` su molti fetch (rischio MITM); frammentazione schema fonti (più fogli `Fonti*`, unificazione `FontiFeed` in corso ma con flag OFF); `Matrix_tagger` retroattivo a batch e **non agganciato agli scanner** → rischio backlog di `MatrixDim` vuoti.

---

## 3. L'intuizione architetturale

Trend (gap #1) e opinion leader (gap #2) dipendono dallo **stesso prerequisito**: estrarre e **accumulare nel tempo** entità (persone/strutture/enti) e temi dai contenuti che gli agenti **già raccolgono**. È un **livello di conoscenza** (knowledge layer) oggi assente.

```
   [ RACCOLTA ]                 [ CONOSCENZA ]              [ INTELLIGENCE ]
   agenti AG1-6, API   ──►   estrazione entità+temi   ──►   trend emergenti
   bandi/news/norme/...      storicizzati nel tempo         mappa opinion leader
   (ESISTE)                  (DA COSTRUIRE = L1)            super-profilazione
```

Costruito il knowledge layer (L1), **trend e opinion-leader emergono dall'aggregazione**. È il fondamento del "caso unico".

---

## 4. Scomposizione in sotto-progetti

Sistema troppo grande per una sola specifica: si costruisce a strati, ciascuno con valore proprio e una propria specifica → piano → runbook.

| Layer | Contenuto | Dipende da | Valore |
|---|---|---|---|
| **L0 — Consolidamento** | unifica schema fonti (`FontiFeed`), aggancia `Matrix_tagger` agli scanner (no backlog), fix SSL, completa minimamente gap norme/EU | — | igiene abilitante |
| **L1 — Knowledge layer** ★ | estrazione NER (persone, strutture, enti, temi) dai contenuti raccolti → fogli `Entita` e `Temi` con occorrenze datate; normalizzazione/dedup nomi | L0 | **fondamento** di trend e opinion-leader |
| **L2 — Trend intelligence** | aggregazione temporale di temi/entità → temi emergenti, "momentum", serie storiche, cruscotto tendenze | L1 | differenziatore visibile |
| **L3 — Mappa opinion leader** | scoring di autorevolezza/centralità + grafo relazioni persona↔struttura + fonti persona-centriche (relatori convegni, autori, profili) → "chi fa tendenza" IT/EU | L1 | differenziatore visibile |
| **L4 — Espansione fonti** | social wall *inbound* (account/hashtag) · norme strutturate (foglio `Norme` + NRM + Normattiva/EUR-Lex) · EU via proxy (sblocca TED 403) | L0 | copertura e profondità |
| **L5 — Super-profiling & meta-sintesi** | apprendimento dai comportamenti (click/letture retroazionano lo scoring) + meta-brief cross-agente (bando↔trend↔leader↔museo) | L1-L4 | il "racconto" che converte |

**Sequenza consigliata:** L0 (sottile) → **L1 (fondamento)** → L2 e L3 (i differenziatori) → L4/L5.

---

## 5. Nota sulle API ("verifica diretta tramite API")

- **Funzionano oggi** (da GAS): TED via POST, CORDIS JSON, SEDIA/EUFT; OpenCoesione/CKAN da testare in produzione.
- **Bloccate da GAS**: TED-RSS, Italia Domani (403 server-to-server). Per sbloccarle serve un **proxy** (es. Cloud Function/worker che fa da intermediario) — è un tassello di L4.
- **Disabilitate per endpoint inerti**: ANAC, OpenCUP, SEDIA-legacy, Lombardia (parser presenti, riattivabili quando gli endpoint tornano vivi).
- **Per opinion leader/trend serviranno fonti nuove**: profili relatori/convegni, autori pubblicazioni, e — per il social wall — API o aggregatori social. Da valutare in L3/L4 (alcune a pagamento o con limiti di ToS).

---

## 6. Raccomandazione

Partire dal **Knowledge layer (L1)** — eventualmente preceduto da un L0 sottile — perché è ciò che trasforma Sinopia da *aggregatore* a *sistema di intelligence*, e abilita sia i trend (L2) sia gli opinion leader (L3). È il vero elemento di unicità, ed è esportabile perché lavora sui contenuti, non su una singola lingua/paese.

Ogni layer manterrà il metodo: **specifica → piano → runbook Claude Code**, con interventi additivi e senza stravolgere il motore di raccolta esistente.

---

## 7. Aggiornamento 2026-06-07 — Editoriale "Capo Redattore" + priorità norme/pubblicazioni

- **Nuovo componente E1 — Editoriale settimanale ("Capo Redattore"):** consuma L1 (entità/temi + delta settimanale) e i contenuti freschi per produrre l'editoriale che **apre la newsletter**. Usa un segnale di trend *leggero* (delta questa-settimana vs 4 settimane) senza attendere L2. Sequenza aggiornata: **L0 → L1 → E1** (primo payoff visibile) → L2/L3. Spec: `superpowers/specs/2026-06-07-e1-editoriale-capo-redattore-design.md`.
- **Norme e pubblicazioni salgono di priorità (L4):** sono pilastri di **credibilità** (norme) e di **valore scientifico** (studi/scoperte degli studiosi, oggi serviti solo in parte) e oggi sono **fonti carenti**. Vanno rafforzate (foglio `Norme` dedicato + fonti ufficiali Normattiva/EUR-Lex; pubblicazioni meno manuali) perché alimentano l'editoriale. L1+E1 partono col contenuto attuale e migliorano man mano.
- **Fonti autorevoli di riferimento:** Symbola, Fitzcarraldo, Federculture (+ enti certificati e studiosi) → flag `fonte_autorevole` che pesa su autorevolezza e selezione editoriale.
