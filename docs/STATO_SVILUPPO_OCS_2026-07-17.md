# Osservatorio Culturale Sinopia — Stato di Sviluppo

**Data**: 17 luglio 2026
**Versione**: v4.27.32 (deploy @806)
**Codebase**: 93 file JS + 10 file HTML = 78.932 righe di codice
**URL produzione**: `https://script.google.com/macros/s/AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs/exec`
**Script ID**: `1VXXzcHRB6kv34Dvqfp5p0x1zMzRtDhSDzmf-jsMtiD2hK2U0gG6uaTPx`

---

## 1. Architettura

| Componente | Tecnologia | Note |
|---|---|---|
| Backend | Google Apps Script (V8 runtime) | 93 moduli JS |
| Frontend | HTML/CSS/JS monopagina (SPA) | 10 file HTML (include pattern) |
| Database | Google Sheets (multi-foglio) | ~15 fogli attivi |
| Deploy | clasp CLI + GAS web deploy | Deployment ID fisso, versioni incrementali |
| Auth | Sessioni magic-link + admin token | 3 livelli: guest/lettore/admin |
| AI | Claude API (sommari, tagging, editoriale) | Integrata in scanner e digest |

### Stack frontend
- **Design system**: Inter + Inter Tight (font-ui), EB Garamond (font-serif per titoli pagina)
- **Tema**: Light/Dark mode, palette carta da museo
- **Layout**: Sidebar + main content, responsive

### Moduli backend principali

| Modulo | File | Funzione |
|---|---|---|
| Core routing | `Codice.js` | doGet/doPost, scanner, mailing, stats |
| Bandi v5 | `Bandi_v5.js` | Schema v5, fonti, dedup, quality check |
| Fonti unificate | `Fonti_v1.js`, `FontiFeed.js`, `FontiApiStrutturate.js` | CRUD fonti, RSS, API strutturate (TED, SEDIA, CKAN) |
| Qualita bandi | `AgenteQualita.js`, `BandiGate.js` | Validazione TED/scadenza, filtro cultura, gate esposizione |
| Norme cultura | `NormeCultura.js`, `UltimiBandi.js` | Auto-popolamento norme da news, dataset ICOM |
| Lavoro cultura | `LavoroCultura.js` | GU 4a Serie concorsi, monitor settimanale |
| Scanner news | `NewsScanner.js`, `ScannerRssSpecializzato.js` | RSS round-robin, 4 run/giorno |
| Sistema agenti | `AgentConfig.js` ... `AgentSupervisore.js` | 5 agenti tematici (AG1-AG5) |
| MuseMu Matrix | `Matrix_v1.js`, `Matrix_schema.js` | Questionario 43 domande, 10 dimensioni |
| CRM | `CRM_v1.js`, `ROC_v1.js` | Lead scoring, outreach bando-driven |
| Digest | `DigestService.js`, `Digest_routing.js` | 2 coorti (generalisti + profilati), flusso redazionale |
| Newsletter | `Newsletter_v44.js`, `Editoriale_v1.js` | Approvazione Telegram, editoriale AI settimanale |

---

## 2. Sezioni della webapp

| Sezione | Stato | Accesso | Note |
|---|---|---|---|
| Home | Attiva | Tutti | Hero, stats, bandi, news, podcast, video, libri |
| Chi siamo | Attiva | Tutti | Placeholder (da definire editorialmente) |
| Radar Bandi | Attiva | Tutti | 47+ fonti, filtri tipo/regione/CPV, ordinamento |
| News | Attiva | Tutti | 5 ambiti tematici, filtri, sommari AI |
| Capitali & candidature | Attiva | Registrati | CIC, ECoC, UNESCO |
| Lavoro cultura | Attiva | Registrati | Concorsi GU + opportunita/residenze |
| Podcast | Attiva | Registrati | RSS auto-scan, tematiche |
| Video | Attiva | Registrati | YouTube canali musei |
| Libri e pubblicazioni | Attiva | Registrati | Catalogo curato |
| Norme | Attiva | Registrati | 22+ normative ICOM + auto-popolamento da news |
| Social Wall | Attiva | Registrati | Monitor istituzionale |
| Archivio | Attiva | Registrati (Strumenti) | Multi-tipo con ripristino |
| MuseMu Matrix | Attiva | Tutti | Autovalutazione museo 43 domande |
| Digest/Newsletter | Attiva | Admin | Flusso redazionale ven->lun |
| Impostazioni | Attiva | Admin | Fonti, sistema, strumenti admin |

---

## 3. Modifiche sessione 15-17 luglio 2026

### 3.1 Normative ICOM (deploy @796-799)
- Estratte 22 normative dalla pagina ICOM Italia (`icom-italia.org/documenti-smn/`)
- Categorie: normativa nazionale, decreti SMN, standard ICOM, accessibilita, documenti MiBAC, contributi ICOM, quaderni ICOM
- Funzione `popolaNormativeICOM()` con controllo doppioni automatico su titolo normalizzato
- Pulsanti admin: "ICOM - anteprima" (dry-run) e "ICOM - popola normative"
- 1 doppione rilevato (DM 113/2018 presente sia in ICOM che nel dataset esistente)

### 3.2 Sidebar riordinata (deploy @797-806)
**Nuovo ordine sezioni:**
1. Radar Bandi (badge NEW settimanale)
2. News (badge NEW)
3. Capitali & candidature (badge NEW, guest-locked)
4. Lavoro cultura (badge NEW, guest-locked)
5. Altre fonti (accordion, stile identico ad "Ambiti tematici")
   - Multimedia: Podcast, Video
   - Riferimenti: Libri e pubblicazioni, Norme, Social Wall

**Spostamenti:**
- Archivio + Cestino spostati nella sezione "Strumenti" (admin)
- Lavoro cultura reso guest-locked (prima accessibile a tutti)

### 3.3 Badge NEW settimanali (deploy @797-806)
- Badge viola discreto su ogni voce della sidebar
- Conteggio contenuti nuovi nella settimana corrente (lun 00:00 - dom 23:59)
- Reset automatico a mezzanotte di domenica
- Badge aggregato sul pulsante "Altre fonti" (somma podcast+video+libri+norme+social)
- Funzione backend `getWeeklyNewCounts()` in `StatsManager.js`
- Conta da: Items (news), Bandi_v5 (bandi), Podcast (podcast+video), Pubblicazioni (libri), Norme, LavoroCultura

### 3.4 Font e design system (deploy @802-806)
- `.br-title` cambiato da `font-serif` (EB Garamond) a `font-ui` (Inter) per uniformita
- `.br-estratto` definito con `font-ui`, 0.8125rem, line-clamp 2
- `.nr-data-right` allineato al design system
- Badge NEW: sfondo trasparente viola, testo "new N", font 0.5625rem, peso 400

### 3.5 Ordinamento bandi (deploy @802-804)
- I bandi con `isRecente=true` compaiono sempre per primi, qualsiasi ordinamento attivo
- Sort client-side in `renderBandiList`: priorita isRecente > sort selezionato

### 3.6 Accesso ospiti (deploy @803-804)
- Voci `nav-guest-locked` ora con `pointer-events:none` (non cliccabili)
- `_GUEST_PAGES` ridotto a: home, bandi, matrix, chisiamo, profilo-pro, privacy, news
- Rimossi da guest: lavoro, podcast, video, social, editoria, capitali, norme, libri

---

## 4. Sistema qualita bandi (attivo)

| Funzione | File | Trigger | Cosa fa |
|---|---|---|---|
| `agenteQualitaBandi` | AgenteQualita.js | Daily 05:00 | Archivia: scaduti, TED rotti (titolo-numero), senza info, junk, non-cultura |
| `bandiPuliziaTedMalformati` | FontiApiStrutturate.js | Manuale (admin) | Archivia TED con titolo solo-numero o `[object Object]` |
| `puliziBandiTedVuoti` | CpvCultura_v1.js | Manuale (admin) | Archivia TED vuoti senza scadenza |
| `bandiGateFinale_` | BandiGate.js | Automatico (pipeline) | Filtro cultura live + normalizzazione link + anti-spazzatura |

---

## 5. Trigger automatici

| Funzione | Frequenza | Ora |
|---|---|---|
| `scanSources` (news) | Ogni 6h | Round-robin, budget 270s |
| `scanBandiAutomatico` | Ogni 6h | Continuo |
| `scanPodcast` | Ogni 24h | 03:00 |
| `agenteQualitaBandi` | Daily | 05:00 |
| `reportUnificatoGiornaliero` | Daily | 08:00 |
| `weeklyNewsletterAuthRequest` | Settimanale | Lunedi 09:00 |
| `normeAutoPopolaRun` | Settimanale | Via CronDispatcher |
| `lavoroCulturaMonitor` | 2x/settimana | Mer + Sab |

---

## 6. Aree critiche da monitorare

### Priorita ALTA
1. **Codebase monolitico** — `Codice.js` ha 100+ funzioni; spacchettamento progressivo in corso ma incompleto
2. **Anti-clobber** — Sessioni parallele rischiano di sovrascrivere il progetto GAS; protocollo manuale (pull+diff prima di push)
3. **Quota GAS** — Execution time (6 min), email giornaliere (100/giorno), URL fetch (20k/giorno)
4. **Doppia sorgente bandi** — RADAR BANDI (sheet separato) + Bandi_v5 (sheet principale); migrazione in corso ma non completata

### Priorita MEDIA
5. **Accessibilita WCAG** — Quick wins fatti (contrasto, focus ring, aria), ma mancano: tastiera su card, focus-trap modali, target tocco 44px
6. **Dark mode incompleto** — 3 modali statici (registrazione, newsletter, prenotazione) non adattati
7. **Test automatici** — Solo self-test manuali (normeCulturaSelfTest, bandiGateSelfTest); nessun framework di test
8. **Documentazione utente** — "Chi siamo" ancora placeholder

### Priorita BASSA
9. **Naming file** — Suffissi versione legacy (`_v44`, `_v1`) da rinominare progressivamente
10. **Cache client** — Nessuna invalidation automatica; utente deve fare hard refresh per vedere aggiornamenti

---

## 7. Metriche codebase

| Metrica | Valore |
|---|---|
| File totali | 103 (93 JS + 10 HTML) |
| Righe di codice | 78.932 |
| Deployment corrente | @806 |
| Versione | v4.27.32 |
| Commit git (branch) | feat/fonti-feed-unificazione |
| Fogli Google Sheets attivi | ~15 |
| Fonti RSS monitorate | 120+ |
| Normative catalogate | 22+ (ICOM) + 5 seed + auto-popolamento |
| Ambiti tematici | 5 |
| Agenti AI | 5 (AG1-AG5) |

---

*Documento generato il 17 luglio 2026 — Osservatorio Culturale Sinopia v4.27.32*
