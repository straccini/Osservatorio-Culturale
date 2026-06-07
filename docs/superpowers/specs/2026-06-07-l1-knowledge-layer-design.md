# L1 — Knowledge Layer (estrazione entità + temi) — Specifica

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script)
**Branch:** `feat/fonti-feed-unificazione`
**Data:** 2026-06-07 · **Stato:** design approvato — pronto per il piano
**Obiettivo:** trasformare i contenuti già raccolti in conoscenza strutturata (entità + temi accumulati nel tempo), fondamento per trend (L2) e mappa opinion leader (L3).
**Collegato a:** `docs/ANALISI_FONTI_FASE3.md`, `docs/MODELLO_OPERATIVO_SINOPIA_RICCARDO.md`.

---

## 0. TL;DR

Ogni scanner che già chiama Claude per estrarre un contenuto **estrae anche le entità** (persone, strutture, temi, progetti) nella **stessa chiamata** (costo aggiuntivo minimo). Un helper unico normalizza i nomi e scrive in due fogli nuovi: **`Entita`** (una riga per entità unica) e **`Occorrenze`** (una riga per menzione, con data). Un **backfill** una-tantum popola lo storico. Niente algoritmi di trend o ranking opinion leader qui: L1 **accumula** i segnali; L2/L3 li interpretano.

---

## 1. Contesto e decisioni

Il sistema ha un motore di **raccolta** solido ma nessun **livello di conoscenza**: i contenuti sono isolati, le persone non sono mai un oggetto, i temi non si aggregano. L1 colma questo, in modo additivo.

**Decisioni prese (brainstorming 2026-06-07):**
| Decisione | Scelta |
|---|---|
| Entità da estrarre | **Persone · Strutture/Organizzazioni · Temi · Progetti** (no Luoghi) |
| Quando estrarre | **Integrata nello scanner + backfill** una-tantum (piggyback sulla chiamata Claude esistente) |
| Fonti opinion leader | **Dai contenuti già raccolti** in L1; fonti persona-centriche rimandate a L3/L4 |
| Unione duplicati | **Chiave normalizzata + alias + merge confermabile dall'admin** |

---

## 2. Ambito

**Dentro L1:**
- Estrazione entità integrata nelle 3 pipeline Claude esistenti + backfill storico.
- Normalizzazione/dedup dei nomi (chiave + alias).
- Accumulo con date (`Occorrenze`) + conteggi base + un `score_autorevolezza` semplice.
- Vista admin minima "Entità" (top per occorrenze/recenza) per verificare il funzionamento.

**Fuori (rimandato):** algoritmi di trend/momentum (L2); ranking + grafo relazioni opinion leader (L3); fonti persona-centriche / social wall (L3/L4); merge automatico per somiglianza avanzata (oltre la chiave normalizzata).

---

## 3. Architettura / flusso

```
1. Scanner estrae il contenuto        (come oggi)
2. STESSA chiamata Claude estrae anche  entita: [{nome, tipo, ruolo?}]
3. kb_recordEntities_() normalizza      chiave + alias
4. upsert Entita  +  append Occorrenza  (con data, ambito, fonte)
   ── + Backfill una-tantum su AgentScanResults / Items / Bandi_v5 ──
```

Principio: **una sola estrazione** alimenta tutto. Il passo entità è **additivo e protetto**: se fallisce, l'estrazione del contenuto resta invariata.

---

## 4. Modello dati (2 fogli nuovi)

**Foglio `Entita`** — una riga per entità unica:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | string | `ENT` + timestamp/random |
| `chiave` | string | chiave normalizzata (univoca, vedi §6) |
| `nome_canonico` | string | forma "bella" scelta (prima occorrenza o più frequente) |
| `tipo` | enum | `persona` \| `struttura` \| `tema` \| `progetto` |
| `alias_json` | JSON array | varianti grezze viste ("ICOM", "ICOM Italia") |
| `ambiti` | CSV | ambiti 1-5 in cui compare |
| `n_occorrenze` | int | totale menzioni |
| `n_fonti` | int | fonti distinte in cui compare |
| `prima_data` | ISO | prima menzione |
| `ultima_data` | ISO | ultima menzione |
| `score_autorevolezza` | number | euristica leggera (§7) |
| `stato` | enum | `auto` \| `confermato` \| `unito_in:<id>` |
| `note` | string | libero |

**Foglio `Occorrenze`** — una riga per menzione (la serie storica):

| Colonna | Tipo | Note |
|---|---|---|
| `id` | string | |
| `entita_id` | string | → `Entita.id` |
| `contenuto_id` | string | id del record sorgente |
| `tipo_contenuto` | enum | `bando` \| `news` \| `norma` \| `podcast` \| `video` |
| `titolo_contenuto` | string | per leggibilità |
| `data` | ISO | data del contenuto (`DataPubblicazione`/`timestamp_fine`/…) |
| `ambito` | int | 1-5 |
| `fonte` | string | nome fonte |

---

## 5. Estrazione integrata (3 punti, additiva)

Si aggiunge al prompt e allo schema JSON di ciascuna estrazione esistente il campo `entita: [{nome, tipo, ruolo?}]`, poi si chiama l'helper comune:

| Pipeline | File / funzione | Modello | Intervento |
|---|---|---|---|
| Agenti AG1-AG6 | `AgentScanner.js` → `_agentExtractWithClaude_` (~703) | `OC_CLAUDE_MODEL` | aggiungi `entita[]` al prompt/schema; dopo il parse → `kb_recordEntities_(entita, meta)` |
| News | `Codice.js` → `processWithAI` (~2518) | Haiku | idem (prompt news + chiamata helper) |
| Bandi | `Bandi_v5.js` → `_estraiConClaudeV5_` (~624) | Sonnet | idem (già estrae `Ente`; aggiunge persone/strutture/progetti/temi) |

`meta` = `{ contenuto_id, tipo_contenuto, titolo, data, ambito, fonte }`.

**Helper comune — nuovo file `KnowledgeLayer_v1.js`:**
- `kb_recordEntities_(entitaArray, meta)` — per ogni entità: normalizza → upsert in `Entita` → append in `Occorrenze` → aggiorna contatori/score. Tutto in `try/catch` (non rompe mai lo scanner).
- `kb_normalizeKey_(nome, tipo)` — vedi §6.
- `kb_upsertEntita_(chiave, nome, tipo, meta)` · `kb_appendOccorrenza_(entita_id, meta)` · `kb_scoreAutorevolezza_(entitaRow)`.
- `kb_backfill_(tipo_contenuto, limite, cursore)` — §8.
- `kb_getTopEntita_(tipo, limite)` — vista admin.

---

## 6. Normalizzazione e dedup

`kb_normalizeKey_`: minuscolo → rimozione accenti → rimozione punteggiatura e spazi multipli → trim. Esempi: "ICOM Italia" → `icom italia`; "I.C.O.M." → `icom`. Per le **strutture**, mappa opzionale di sigle note (ICOM, NEMO, MiC, …) per unire sigla↔estesa.

Regola L1 (semplice e prudente): match per **chiave esatta normalizzata**; ogni variante grezza vista si accumula in `alias_json`. I quasi-duplicati (chiavi diverse ma stessa entità) **non** vengono uniti automaticamente: restano separati e l'admin può **confermare un merge** (imposta `stato=unito_in:<id>` e somma i contatori). La UI di merge è minima in L1 (anche solo una funzione admin), il raffinamento automatico è rimandato.

---

## 7. Score di autorevolezza (leggero, fondante)

Euristica trasparente (i pesi in `Constants.js`, ritoccabili):

```
score = 40*norm(log(1+n_occorrenze)) + 25*norm(n_fonti) + 20*recency + 15*norm(ampiezza_ambiti)
recency = 1 se ultima_data < 90gg, decresce fino a 0 oltre 12 mesi
```

È un **segnale grezzo**, non il ranking definitivo: L3 introdurrà centralità di rete e fonti persona-centriche. Serve solo a ordinare la vista admin e a dare a L2/L3 un punto di partenza.

---

## 8. Backfill (una-tantum)

`kb_backfill_(tipo_contenuto, limite, cursore)`: scorre i contenuti storici (`AgentScanResults`, `Items`, `Bandi_v5`), per ciascuno chiama l'estrazione entità (stessa logica) e popola `Entita`/`Occorrenze`. **Cost-aware:** lotti con `cursore` salvato in ScriptProperties (come gli scanner) e cap per esecuzione; è un costo Claude una-tantum, da stimare contando i record storici. Idempotente: ri-eseguibile senza duplicare (dedup per `contenuto_id`+`entita_id` in `Occorrenze`).

---

## 9. Vista admin minima

Funzione `kb_getTopEntita_(tipo, limite)` + un pannello "Entità" in area admin (riusa il pattern delle tab esistenti): tabella top entità per `score`/`n_occorrenze`/`ultima_data`, filtrabile per `tipo`. Serve a **vedere il sistema funzionare**; i cruscotti ricchi sono L2/L3.

---

## 10. Gestione errori e guardrail ("non stravolgere")

- Il passo entità è **additivo** al prompt e **isolato** in `kb_recordEntities_` con `try/catch`: un errore di estrazione/scrittura entità **non** interrompe la scansione del contenuto.
- Parsing difensivo: se `entita` manca o è malformato, si salta (log, nessuna eccezione propagata).
- Solo **fogli nuovi** (`Entita`, `Occorrenze`) e **campi aggiuntivi** nei prompt: nessuna colonna esistente modificata.
- Nessun `clasp push`/deploy automatico (manuale).

---

## 11. Piano di test (dry-run GAS)

1. **Estrazione:** dato un testo di esempio, l'estrazione restituisce `entita[]` con tipi corretti.
2. **Scrittura:** `kb_recordEntities_` crea le righe `Entita` (nuova) e `Occorrenze` attese; una seconda menzione della stessa entità **non** duplica `Entita` ma incrementa `n_occorrenze` e aggiunge un'`Occorrenza`.
3. **Normalizzazione:** "ICOM" e "ICOM Italia" → stessa `chiave` (con mappa sigle) o, senza mappa, due entità con alias tracciati; verifica `alias_json`.
4. **Score:** `kb_scoreAutorevolezza_` cresce con occorrenze/fonti/recenza.
5. **Backfill:** su pochi record storici popola correttamente; ri-eseguito non duplica `Occorrenze`.
6. **Non-regressione:** se il passo entità lancia un'eccezione simulata, lo scanner scrive comunque il contenuto.
7. **Sicurezza:** `kb_getTopEntita_` gated admin.

---

## 12. File coinvolti

| File | Stato | Intervento |
|---|---|---|
| `KnowledgeLayer_v1.js` | **nuovo** | helper estrazione/normalizzazione/upsert/backfill/vista + test |
| `Constants.js` | modifica | nomi fogli `Entita`/`Occorrenze`, enum tipi, pesi score |
| `AgentScanner.js` | modifica | `entita[]` nel prompt/schema + chiamata `kb_recordEntities_` |
| `Codice.js` (`processWithAI`) | modifica | idem per le news |
| `Bandi_v5.js` (`_estraiConClaudeV5_`) | modifica | idem per i bandi |
| `Index.html` | modifica (minima) | pannello admin "Entità" (o rimandabile a micro-task) |

---

## 13. Punti aperti (da affinare in implementazione, non bloccanti)

1. **Qualità estrazione temi** da sommari brevi: i `sommario` news (≤300 char) sono corti; valutare se per i temi serve un set controllato/seed iniziale.
2. **Wording dei prompt** per ciascun sito (agenti/news/bandi) — coerenza dei `tipo` restituiti.
3. **Stima costo backfill:** contare i record storici (× token) prima di lanciarlo; eseguirlo a lotti.
4. **Mappa sigle strutture** iniziale (ICOM, NEMO, MiC, ANCI, Federculture…): quanto ampia in v1.
