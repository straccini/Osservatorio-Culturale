# Roadmap miglioramento Sinopia · Osservatorio Culturale
**Versione corrente**: v4.18.45 · deploy @282 (2026-05-15)

**Aggiornamento 2026-05-15**: completato cleanup notturno (v4.18.38→.39) + estensione MiC + duplicati + quality check bandi + icone sidebar uniformate + logo SVG inline. Roadmap reimpostata su **apertura piattaforma freemium**.

---

## 🚀 PIANO OPERATIVO APERTURA PIATTAFORMA (target: 4 settimane)

**Decisione strategica concordata (2026-05-15)**: aprire Sinopia al pubblico con modello **freemium senza pagamento**, dominio proprio `app.sinopiaconsulting.it`.

### 📋 Modello accesso a 2 livelli

| Livello | Chi | Vede | Può | Workspace |
|---|---|---|---|---|
| **0 · Anonimo** | URL diretto, niente login | **Max 10 bandi/news/podcast/video/libri** preview · sommari tagliati a 100 char | Browse, Matrix, prenotare consulenza | ❌ |
| **1 · Lead 7gg** | Ha **prenotato consulenza** con email | Tutto a piena visibilità · download · ★ salva | Tutto + #page-workspace | ✅ 7gg → poi read-only |
| **1·∞ · Lead permanente** | Ha **compilato Matrix** (1 volta basta) | Tutto · sblocco DEFINITIVO senza scadenza | Tutto + workspace permanente | ✅ ∞ |
| **3 · Admin** | Team Sinopia | Tutto + pannello admin | Tutto | ✅ permanente |

**Trigger di conversione chiave**: Matrix = "magic key" che sblocca per sempre. Prenotazione consulenza = 7gg workspace temporaneo, ma se durante quei 7gg compila Matrix → upgrade permanente.

### 📅 Sprint settimanali

#### Sprint 1 — Backend sessioni & magic-link (settimana 1 · v4.18.46)
- [ ] Nuovo modulo `Sessioni_v1.js` con foglio `Sessioni_v1` (id, email, token, livello, scadenza, source, created_at, matrix_completato bool)
- [ ] Funzioni: `createSessione(email, source)`, `validaSessione(token)`, `upgradeAPermanente(email)`, `cleanupSessioniScadute()`
- [ ] Hook in `saveMatrixResponse` (Matrix_v1.js) → al completion crea sessione + upgrade permanente se già esiste sessione 7gg per stessa email
- [ ] Hook in `savePrenotazioneIntent` (Prenotazioni_v1.js) → crea sessione 7gg
- [ ] Email magic-link **HTML brandizzata** Sinopia (logo SVG inline + colori sinopia + bottone CTA grande)
- [ ] `doGet` Codice.js: intercetta `?t=TOKEN`, valida, inietta sessione in `window.OC_SESSION` lato frontend

#### Sprint 2 — Restrizioni anonimo + workspace (settimana 2 · v4.18.47)
- [ ] Modificare mapper backend (`getBandiListV42`, `getNewsListV42`, ecc.) per accettare `livello`: livello 0 → max 10 record + sommario tagliato a 100 char
- [ ] **Banner sticky anonimo** in Topbar: "Sblocca tutto compilando Matrix gratis (1 volta) →" con CTA
- [ ] Bottoni "📥 Scarica" / "★ Salva" disabilitati per anonimo + tooltip "Compila Matrix per accedere"
- [ ] Nuova pagina `#page-workspace` con: saluto · giorni residui (o ∞) · bandi salvati · report Matrix scaricabile · CTA rinnovo se temporaneo
- [ ] Trigger giornaliero `cleanupSessioniScadute` ore 04:00 (prima del quality check delle 05:00)

#### Sprint 3 — Dominio + landing Netlify (settimana 3 · v4.18.48)
- [ ] Preparare cartella `landing-netlify/` con file `index.html` minimal: redirect a webapp GAS + meta SEO + JSON-LD structured data
- [ ] Documentare procedura DNS per Silvano: registro pannello del dominio → CNAME `app.sinopiaconsulting.it` → Netlify
- [ ] Setup Netlify account + deploy cartella (drag&drop o git connect) — istruzioni passo-passo
- [ ] Aggiornare brand sub sidebar: "Osservatorio Culturale · app.sinopiaconsulting.it"
- [ ] Aggiornare URL in tutte le email (magic-link, prenotazioni notify) con il dominio nuovo

#### Sprint 4 — Agenti social IG/LinkedIn (settimana 4 · v4.18.49-v4.18.50)
- [ ] Nuovo modulo `SocialAgents_v1.js`:
  - `agentBandoToPost(bando)` → Claude API genera 3 varianti copy
  - `postToInstagram(payload)` → Meta Graph API
  - `postToLinkedIn(payload)` → LinkedIn Marketing API
- [ ] Foglio `SocialDrafts_v1` (stato pending/approved/scartato) + `SocialPublishLog_v1`
- [ ] Notifica Telegram con 3 varianti + bottoni inline approve/skip
- [ ] Trigger: bando con `Score ≥ 4` → genera draft auto
- [ ] Setup OAuth Meta + LinkedIn (preparazione token long-lived)

---

## 🎯 Successo misurabile

Al termine delle 4 settimane:
- **Anonimo → Lead conversion rate**: target ≥15% (compilano Matrix dopo aver visto i 10 bandi preview)
- **Lead 7gg → Lead permanente**: target ≥40% (compilano Matrix durante la finestra workspace)
- **Post social settimanali**: target 8-12 post/settimana auto-generati (con approvazione Telegram)
- **Sessioni attive**: tracking via `Sessioni_v1` + dashboard stats admin

---

Stato dopo audit notturno: codice pulito (15 funzioni morte rimosse), 1 file rinominato, 10 backup + 2 docs archiviati. Vedi `AUDIT_2026-05-14.md` per dettaglio.

---

## 🔴 PRIORITÀ 1 — Operativo immediato (1-3 giorni)

### 1.1 Profili "Chi siamo" — dati reali
**Cosa**: sostituire URL LinkedIn inferiti + descrizioni placeholder con i dati reali dei 7 profili
**Effort**: 30 min / 7 profili (servono solo URL + 2-3 frasi per ciascuno)
**Bloccato da**: input dell'utente (URL handle + ruoli reali)
**File coinvolti**: `Index.html` (sezione `#page-chisiamo`, righe 1146-1240)

### 1.2 Decisione 18 fonti bandi disattivate (FALSE esplicito)
**Cosa**: in `FontiBandi_v5` ci sono 18 fonti con `Attiva=FALSE` esplicito (no celle vuote, scelta deliberata in passato)
**Azioni possibili**:
  - **Elencarle a video** (5 min — aggiungo bottone admin "Mostra fonti spente")
  - **Riattivarle in massa** se erano rotte solo temporaneamente
  - **Rimuoverle definitivamente** se sono morte (URL non più validi)
**Effort**: 30 min review manuale dopo elenco

### 1.3 Tag `@deprecated` formale su 12 funzioni legacy workflow
**Cosa**: aggiungere JSDoc `@deprecated` sopra le funzioni elencate in `CLAUDE.md` riga 115 (`toggleLettoBando`, `archiviaRecord`, `ripristinaRecord`, ecc.)
**Effort**: 20 min
**Beneficio**: gli editor IDE mostrano warning, futuro cleanup più chiaro
**File coinvolti**: `Codice.js` (12 punti)

---

## 🟡 PRIORITÀ 2 — Sprint successivo (1-2 settimane)

### 2.1 Digest a 2 coorti (sezione 8 audit) ⭐ alto impatto commerciale
**Cosa**: distinguere lettore generico vs lead caldo nel `sendDigestAuto()`
**Architettura completa**: vedi `AUDIT_2026-05-14.md` sezione 8

**Step concreti**:
1. Aggiungere `OptInDigestSegmentato` a `ContactsMatrix` (Matrix_v1.js schema)
2. Aggiungere `OptInDigest` a `RichiestePrenotazione` (Prenotazioni_v1.js)
3. Nuovo modulo `Digest_routing.js`:
   - `getDigestRecipientsByCohort()` — query 3 fogli con dedup per email
   - `buildTematicDigest(items, tematica)` — layout HTML focalizzato tematica
4. Refactor `sendDigestAuto()` con loop per coorte
5. Estendere `DigestLog` con campo `Coorte`
6. Hook CRM: `digest_sent +1pt` per lead caldo, notifica Telegram se score ≥30
7. Admin UI: tab `Generalisti | Tematici | Matrix-personalizzati`
8. Cadenza: generalisti lunedì, lead caldi lunedì + mercoledì extra

**Effort**: ~1 sprint (3-5 giorni)
**Beneficio**: lead nurturing automatico, conversione consulenza più alta, alerts hot lead via Telegram

### 2.2 Setup completi mancanti
- `setupSondaggiSheet()` — eseguire una-tantum per attivare i 6 sondaggi mirati LS2
- `setupMicSheet()` — già eseguito stanotte via `runSinopiaFix`
- Verificare che tutti i fogli aggiunti durante la giornata 2026-05-13 siano popolati

### 2.3 Popolamento `FontiVideo`
**Cosa**: oggi `FontiVideo` ha 0 fonti, va alimentato manualmente
**Step**: usare il bottone admin "Aggiungi YouTube" (pagina Video) per inserire 10-20 canali rilevanti (musei nazionali, ICOM, divulgazione culturale)

---

## 🟢 PRIORITÀ 3 — Medio termine (2-4 settimane)

### 3.1 Unificazione schema fonti FU17 (sezione 7 audit)
**Cosa**: oggi `FontiBandi_v5` ha 18 colonne, `FontiPodcast` legacy 10, `FontiNews/FontiVideo` 14. Disallineamento risolto a runtime con `findCol_` ma codice difensivo.

**Schema target 17 colonne unificato**:
```
ID, Nome, URL, Tipo, Tag, Categoria, Priorita, Attiva,
DataAggiunta, UltimaScan, UltimoEsito,
NRecordTotali, NRecordUltimo, FailConsecutivi,
UltimoErrore, EnteDefault, Livello
```

**Step**:
1. Nuova funzione `migrateBandiV5ToFU17(dryRun)` in `FontiMigration_v1.js`
2. Snapshot backup `FontiBandi_v5_pre_FU17`
3. Stessa migrazione per `FontiPodcast` (da 10col legacy)
4. Aggiornare `COL_F` in `Bandi_v5.js` al nuovo schema
5. Rimuovere fallback `findCol_` in `Fonti_v1.js getFontiCounters`

**Effort**: ~2-3 giorni
**Beneficio**: codice più pulito, schema robusto, base per il punto 4.1

### 3.2 Rinomina file `*_v44`
**Cosa**: CLAUDE.md dice di abolire suffissi versione nei nomi file
**File da rinominare**:
- `Admin_v44.js` → `Admin.js`
- `CurrentUser_v44.js` → `CurrentUser.js`
- `Newsletter_v44.js` → `Newsletter.js`
- `Telegram_v44.js` → `Telegram.js`

**Strategia**: rename con alias backward-compat se funzioni richiamate per nome via `google.script.run`
**Effort**: 1 giorno
**Beneficio**: convenzione naming uniforme

---

## 🔵 PRIORITÀ 4 — Lungo termine (1-2 mesi)

### 4.1 Agenti AI di scouting fonti (sezione 7 audit) ⭐ visione strategica
**Cosa**: nuovo file `Scouting_v1.js` con 3 endpoint Claude-powered:
- `scoutNewSourceFromUrl(url, tipoHint)` — Claude classifica URL e suggerisce metadata, pre-compila la fonte
- `scoutSimilarSources(seedId, n=5)` — trova fonti simili a una esistente (embedding-based)
- `scoutTrendingTopics(window='7d', tipo='bandi')` — cluster tematici emergenti dai titoli recenti

**UI**: nuovo tab "Scouting AI" nel pannello admin fonti
**Flag**: `OC_SCOUT_ENABLED` in ScriptProperties
**Workflow**: agente propone → admin approva → `addFonteUnificataV2` aggiunge

**Effort**: ~3-4 settimane (Claude API integration + UI + workflow approvazione)
**Beneficio**: la gestione fonti diventa autonoma, sistema scopre fonti rilevanti senza intervento manuale

### 4.2 Sistema UTM tracking + CRM scoring
**Cosa**: il modulo `Privacy_v1.js` ha già 3 funzioni UTM (`utm_logClick`, `utm_buildTrackedUrl`, `utm_handleRedirect`) + hook CRM (`crm_recordEvent`) pronti ma non collegati

**Step**:
1. Wirare `utm_handleRedirect` in `doGet` di Codice.js (intercetta `?utm=track&...`)
2. Aggiornare template digest per usare `utm_buildTrackedUrl` sui link
3. Hook automatico CRM: scoring +5pt per click servizio, +1pt per digest_opened
4. Pannello admin "Lead scoring dashboard" con classifica lead caldi

**Effort**: 1 settimana
**Beneficio**: visione dei comportamenti di engagement, lead scoring automatico

### 4.3 Report MiC dedicato PDF (estensione Sprint Matrix→MiC)
**Cosa**: oggi il PDF Matrix include una "sezione 6 MiC" se compilata. Estendere con:
- Roadmap personalizzata per colmare i gap critici
- Tempi e budget di adeguamento per ogni SM mancante
- Servizio Duemilamusei pertinente per ciascuna lacuna

**Effort**: 1 settimana
**Beneficio**: prodotto premium per la consulenza accreditamento SMN

---

## 🟣 PRIORITÀ 5 — Visione e infrastruttura

### 5.1 Backup automatico fogli Google
**Cosa**: trigger settimanale che esporta tutti i fogli (Bandi_v5, Items, ContactsMatrix, ecc.) come Sheets di backup
**Cartella**: `Backups Sinopia` su Drive
**Retention**: ultime 8 settimane
**Effort**: 1 giorno

### 5.2 Knowledge Base estesa per Claude
**Cosa**: oggi `KB_v1.js` ha tassonomia, candidature, ambiti. Estendere con:
- Documenti progettuali Duemilamusei (Pesaro 2024, Castello Grottaglie, Urbino 2033) accessibili via endpoint
- Template offerta tecnica, scheda progetto, audioguida → libreria riusabile
- Glossario museologico (LIS, CAA, ETR, accessibilità integrata)

**Beneficio**: scouting AI e digest tematico più precisi grazie al contesto profondo

### 5.3 Mobile-first redesign
**Cosa**: la webapp è stata sviluppata desktop-first. Verificare e ottimizzare:
- Sidebar mobile (hamburger)
- Card responsive (bandi, news, capitali)
- Wizard prenotazione su touch
- Matrix questionario su mobile

**Effort**: 1 settimana

### 5.4 Performance + caching
**Cosa**:
- Cache aggressivo per `getHomepageDataV42` (oggi ricalcolato a ogni hydrate)
- Lazy-load delle pagine: oggi tutto in Index.html monolitico
- Compressione asset (Index.html è 480KB)

**Effort**: 2-3 giorni

---

## 📅 Sequenza consigliata

```
SETTIMANA 1
├─ Lun-Mar:   1.1 LinkedIn profili + 1.2 fonti disattivate + 1.3 @deprecated tags
└─ Mer-Ven:   2.1 Digest 2 coorti (parte 1/2)

SETTIMANA 2
├─ Lun-Mer:   2.1 Digest 2 coorti (parte 2/2) + test
└─ Gio-Ven:   2.3 Popolamento FontiVideo + 3.2 rinomina file _v44

SETTIMANA 3-4
└─ Sprint:    3.1 Unificazione schema fonti FU17

MESE 2
├─ Settimana 1: 4.2 UTM tracking + CRM
└─ Settimane 2-4: 4.1 Agenti AI scouting fonti
```

---

## 🎯 Bilancio strategico

Le priorità 1+2 (operativo immediato + sprint successivo) sbloccano:
- **Lead nurturing automatico** (digest 2 coorti)
- **Conversione consulenza più alta** (lead caldi ricevono contenuti pertinenti)
- **Visibilità hot lead** (notifica Telegram)
- **Pulizia operativa** (fonti disattivate gestite)

Le priorità 3+4 (medio-lungo termine) sbloccano:
- **Sistema autonomo** (agenti AI scoprono fonti senza intervento)
- **Scoring automatico** (UTM + CRM)
- **Prodotto premium consulenza** (report MiC dedicato)

Tempo stimato a fine luglio per arrivare alla **versione "matura"** v5.0 con tutte le priorità 1-4 chiuse: ~6-8 settimane.
