# E1 — Editoriale settimanale "Capo Redattore" — Specifica

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script)
**Branch:** `feat/fonti-feed-unificazione`
**Data:** 2026-06-07 · **Stato:** design approvato (v1 generale) — pronto per il piano (dopo L1)
**Obiettivo:** un agente che ogni settimana sintetizza "cosa si muove nel settore" e produce l'**editoriale che apre la newsletter**, dando peso a norme (credibilità), studi/scoperte (pubblicazioni), contenuto dinamico (podcast/video) e fonti autorevoli.
**Dipende da:** L1 (`2026-06-07-l1-knowledge-layer-design.md`).

---

## 0. TL;DR

Un job settimanale assembla un **brief** dal knowledge layer (entità/temi che si muovono questa settimana) + i contenuti freschi (con priorità a norme, pubblicazioni/studi, podcast/video e fonti autorevoli), poi Claude scrive un **editoriale di 250-400 parole** con una voce da capo redattore. L'editoriale viene **approvato dall'admin** e **anteposto come introduzione** alla newsletter. v1: **un solo editoriale generale** (non personalizzato).

---

## 1. Decisioni

| Tema | Scelta v1 |
|---|---|
| Tipo | **Un editoriale generale** per tutte le newsletter (personalizzato per profilo = fase successiva, riuserà il routing per-museo) |
| Frequenza | **Settimanale**, allineato all'invio newsletter |
| Lunghezza | **250-400 parole** |
| Pilastri | **Norme** (cosa cambia nelle regole) · **Studi/scoperte** (dalle pubblicazioni) · **Il dinamico** (podcast/video) · **News** da strutture autorevoli |
| Fonti privilegiate | **Symbola, Fitzcarraldo, Federculture** + enti certificati e studiosi (`fonte_autorevole`) |
| Controllo | **Approvazione admin** prima dell'invio (riusa il flusso digest esistente) |

---

## 2. Input — il "brief" settimanale

Assemblato da `KnowledgeLayer` (L1) + contenuti recenti:

1. **Cosa si muove** — top entità/temi per **delta di occorrenze** "questa settimana vs media 4 settimane" (segnale di trend *leggero*, calcolato sulle date di `Occorrenze` — **non** richiede L2). Privilegia entità con `fonte_autorevole`.
2. **Norme** — aggiornamenti normativi della settimana (`tipo_contenuto=norma`): pilastro di credibilità.
3. **Studi/scoperte** — pubblicazioni recenti (`tipo_contenuto=pubblicazione`) + entità `persona`=studiosi.
4. **Il dinamico** — podcast/video recenti (sommari).
5. **News autorevoli** — news con `fonte_autorevole=true`.

Il brief è una struttura compatta (titoli + sommari + entità/temi caldi), non i testi integrali, per contenere i token.

---

## 3. Processo

`editoriale_generaSettimanale()` (trigger settimanale, **prima** dell'invio newsletter):
1. costruisce il brief (§2) → 2. lo passa a Claude con un prompt "capo redattore" (voce professionale, italiano, struttura a pilastri, 250-400 parole, niente hype) → 3. salva la bozza in foglio **`Editoriali`** con `stato=bozza` → 4. notifica admin (Telegram/email) per **approvazione** → 5. all'approvazione `stato=approvato`; alla generazione newsletter, `getEditorialeCorrente()` restituisce l'editoriale approvato più recente, **anteposto** come intro.

---

## 4. Modello dati

**Foglio `Editoriali`:** `id · settimana (ISO week) · data_generazione · titolo · testo · pilastri_json (entità/temi/contenuti citati) · stato (bozza|approvato|inviato) · approvato_da · data_approvazione · note`.

---

## 5. Integrazione newsletter

Hook nel costruttore digest/newsletter (es. `buildDigestHTML` / coorti in `Digest_routing.js`): se esiste un editoriale `approvato` per la settimana, **prepende** un blocco "Editoriale — cosa si muove nel settore" prima dei contenuti. Se assente → la newsletter parte senza intro (degradazione morbida).

---

## 6. Gestione errori e guardrail

- Se la generazione fallisce o non c'è editoriale approvato → newsletter inviata **senza** intro (nessun blocco all'invio).
- Bozza sempre **revisionabile/rigenerabile** dall'admin prima dell'approvazione.
- Additivo: nuovo foglio `Editoriali`, nuovo job, un hook nel builder newsletter. Nessun contenuto esistente alterato.
- Approvazione obbligatoria prima dell'invio (nessun editoriale auto-pubblicato).

---

## 7. Piano di test (dry-run)

1. **Brief:** `_editoriale_costruisciBrief_()` su una settimana di dati sintetici restituisce i 5 blocchi con i "movimenti" attesi e privilegia `fonte_autorevole`.
2. **Generazione:** produce un testo 250-400 parole con i pilastri presenti (norme, studi, dinamico, news).
3. **Persistenza/approvazione:** bozza salvata; approvazione cambia stato; `getEditorialeCorrente` ritorna l'approvato.
4. **Integrazione:** con editoriale approvato la newsletter lo antepone; senza, parte regolarmente.
5. **Sicurezza:** generazione/approvazione gated admin.

---

## 8. File coinvolti

| File | Stato | Intervento |
|---|---|---|
| `Editoriale_v1.js` | **nuovo** | brief + generazione Claude + persistenza + `getEditorialeCorrente` + test |
| `Constants.js` | modifica | foglio `Editoriali`, lista `fonte_autorevole`, parametri (lunghezza, finestra delta) |
| `Digest_routing.js` / builder newsletter | modifica (hook) | prepende l'editoriale approvato |
| `Index.html` / admin | modifica (minima) | revisione/approvazione bozza editoriale (riusa pattern approvazione) |
| trigger settimanale | setup | `editoriale_generaSettimanale` prima dell'invio newsletter |

---

## 9. Punti aperti (da affinare)

1. **Voce/tono:** definire 1-2 esempi di editoriale di riferimento (registro, lunghezza, struttura).
2. **Allineamento temporale** col digest esistente (giorno/ora di generazione vs invio).
3. **Lista `fonte_autorevole`** iniziale e criterio di "ente certificato/studioso".
4. **Personalizzazione** (per profilo/coorte): rimandata; valutare in una v2 sul routing per-museo.
