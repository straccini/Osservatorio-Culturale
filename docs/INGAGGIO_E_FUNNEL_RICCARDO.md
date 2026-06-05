# Sistema di ingaggio Sinopia + mappatura sul funnel di Riccardo

**Base:** analisi file-per-file (3 agenti) del sistema CRM/outreach, digest e profilazione, post deploy 488. Verifica a livello di codice (le funzioni non sono state eseguite live: l'esecuzione GAS è bloccata).
**Lente:** il funnel di outreach proposto da Riccardo Giovane (cold mail → registrazione → benvenuto+incontro → re-invio mirato, cadenza 2 settimane, ciclo 1 mese).

---

## 1. Le 4 tipologie di utente e cosa ricevono (verificato)

| Tipologia | Chi è | Digest che riceve | Contenuti | Stato |
|---|---|---|---|---|
| **Lettore** | iscritto base (MailingList) | Coorte A, lunedì 07:00 | **solo news** per ambito, uguali per tutti | ⚠️ niente bandi/podcast; si svuota se 0 item marcati |
| **Profilato** | lead con sessione/prenotazione, senza Matrix | Coorte B "tematico", lun 07:00 | **solo news** filtrate per keyword tematica | ⚠️ fallback debole (8 news generiche); senza tematica = come lettore |
| **Matrix** | ha compilato l'autovalutazione | Coorte B "Layout 1", lun 07:00 | **bandi + news + podcast** per i 3 gap del museo | ✅ l'unico davvero mirato — ma vuoto se il tagging `MatrixDim` non è popolato |
| **Museo profilato** | profilo agenti (ProfiloAgenti) | Email Agenti AG1-AG5, daily 07:30 | contenuti per agente, relevance ≥40 | ⚠️ zero se AgentScanResults non popolato o score bassi |

**Problemi trasversali del digest:**
- 🔴 **Single point of failure**: se nessun item ha `InclusiNelDigest=true`, **salta TUTTO** (anche Matrix e tematici) — `Digest_routing.js:220`.
- 🔴 **Bandi non arrivano a lettori/profilati**: il flusso coorti passa solo le news; i bandi reali compaiono **solo** nel digest Matrix e in quello agenti.
- 🟠 **Anti-duplicato → "starvation"**: chi è in più sistemi riceve **un solo** digest ogni 5 giorni, e "vince" il primo cronologico (coorti lun 07:00) anche se l'email agente sarebbe più mirata — `Digest_routing.js:670`.
- 🟠 **Tagging Matrix**: gira ogni notte (`tagMatrixDimRetroattivo` in `sasRun` 04:30), ma a batch 100/foglio → con molti contenuti nuovi va in **backlog**, e il digest Matrix si svuota perché il fallback per-ambito scatta solo se la colonna è del tutto **assente**, non se è presente-ma-vuota (`Matrix_digest.js:349`).

---

## 2. La profilazione Matrix — "dimensioni soddisfatte" (verificato, è solida)

- **10 dimensioni** (D1-D10), **43 domande**, mappate sui **5 ambiti** di Sinopia (`Matrix_schema.js`, `Constants.js:44`). Questionario **adattivo** (domande avanzate solo se il museo è già maturo su quella dimensione).
- **Score per dimensione** 0-100; lo **score sintetico** è la media. I **"gap"** = le **3 dimensioni più basse** (ranking relativo, non soglia fissa). Ogni gap ha una lettura testuale e un **servizio Sinopia raccomandato** con cross-link all'ambito (es. D7→testi E2R, D9→scouting bandi) — `Matrix_v1.js:650`.
- **Profili P1-P5** (Tradizionale / Ancoraggio / Scalabilità / Sensibile-Ecosistema / a Rischio) classificati su tradizionali (D1-5) vs contemporanee (D6-10).
- **Output al compilatore**: report a schermo + **PDF privato** + email con CTA "sessione gratuita 30 min" + roadmap 3 fasi + (opz.) sezione **MiC** (standard minimi ministeriali, pre-compilati ~70% dal Matrix → leva forte per musei non accreditati).
- **La lista lead profilata esiste già**: `getCompilatoriMatrixSummary` (`Matrix_digest.js:810`) restituisce per ogni compilatore museo/profilo/3 gap/email/opt-in → **è già la lista pronta per l'outreach mirato**.

🔴 **Benchmark non collegato**: il confronto reale con gli altri musei (mediana/p25/p75) **esiste e funziona** (`Matrix_benchmark_v1.js`) ma il report/PDF mostrano un **placeholder** "in costruzione" (`Matrix_v1.js:723`). È un argomento di vendita pronto, basta cablarlo.

---

## 3. Lo stato dell'ingaggio commerciale — 3 motori scollegati + un bug critico

**Tre tracciamenti di stato che NON si parlano:**
- `Utenti` (registrazione: pending/attivo) ← non comunica con il CRM.
- `CRM_Leads` (lead scoring: lead→mql→hot→cliente).
- `MuseiDB_v1` (relazione ROC: mai_contattato/contattato/in_trattativa/cliente).

🔴 **BUG CRITICO che rende inerte la pipeline "lead caldo":** quando un museo compila il Matrix e lascia l'email, l'hook CRM `crm_onMatrixOptIn` cerca le chiavi `contatto_consulenziale`/`digest_tematico` (`CRM_v1.js:293`), ma il questionario completo (`MatrixApp.html`) invia altre chiavi (`bandi_pnrr_mic`, `bandi_fondazioni`…). **Non combaciano mai** → l'opt-in vale +1 invece di +30 → il lead resta a ~11 punti (`mql`), **non diventa mai "hot"**, e **l'alert Telegram a Silvano non scatta**. In pratica: profili ottimi, ma il sistema non ti avvisa di chi è un lead caldo.

🔴 **Chiave CRM incoerente**: gli hook Matrix usano `responseId`, Prenotazioni/Digest usano l'`email` → lo stesso museo finisce in **due righe scollegate** e i punti non si sommano.

🟠 **Mail di benvenuto con proposta di incontro: non esiste** come tale. C'è solo il magic-link (generico, parte dopo Matrix/prenotazione, non da cold mail) e la welcome di approvazione admin. Nessuna delle due propone uno slot di incontro.

🟠 **ROC (outreach su bando) è semi-manuale e a vicolo cieco**: i bottoni Telegram `?roc=avvia/skip` **non sono gestiti** in doGet → Silvano deve lanciare le funzioni dall'editor GAS; il follow-up a 14gg (`followup_due`) è **scritto ma mai letto**; `meeting_booked +20` non viene mai registrato.

🟠 **Nessun motore di sequenze temporizzate**: tutta la logica "dopo 2 settimane rimanda/riscrivi" del funnel di Riccardo **non esiste in nessuna forma**.

---

## 4. Mappatura sul funnel di Riccardo

| Nodo funnel | Componente Sinopia esistente | Cosa manca |
|---|---|---|
| **Cold mail "iscriviti all'Osservatorio"** | ROC genera email mirate su bando (`roc_buildEmailBatch`); `MuseiDB_v1` come lista target | Manca un template cold "registrati" + **link tracciato per-museo** (UTM) per sapere chi si registra; invio solo manuale |
| **"Si registrano?" (SÌ/NO)** | `registraUtente`→foglio `Utenti`; UTM tracking esiste | Nessun collegamento cold-mail → registrazione → il ramo SÌ/NO **non è calcolabile** dal sistema |
| **SÌ → benvenuto + proposta incontro** | magic-link / welcome admin | **Va creata** una welcome con CTA calendario, agganciata a `registraUtente` |
| **"Rispondono?" → incontro** | `savePrenotazioneIntent` cattura la richiesta (+5pt) + calendario esterno | Manca il rilevamento "non risponde da 14gg"; manca l'hook `meeting_booked +20` |
| **NO → dopo 2 settimane: re-invio mirato (loro bandi/progetti)** | concettualmente = ROC + digest Matrix (gap→bandi) | Manca il **timer a 14gg** e l'aggancio ROC↔lead-stato; `followup_due` è morto |
| **NO-registrazione → re-invio cold dopo 2 settimane** | — | **Inesistente**: nessuna coda di re-invio |
| **Ciclo 1 mese → valutazione** | KPI sparsi (CRM, digest, prenotazioni) | Manca una **vista di coorte** "mese 1: N contattati → N registrati → N incontri" (i 3 stati vanno uniti) |

**In sintesi:** Sinopia è un forte motore **inbound** (attrai con il Matrix → profila → nutri col digest). Il funnel di Riccardo è **outbound nurturing** (contatti a freddo → registrazione → incontro). I **dati e i contenuti per il funnel esistono già** (lista lead profilata, bandi taggati per dimensione, digest mirato, benchmark, booking). Manca **l'orchestrazione**: la sequenza temporizzata, gli stati uniti, e qualche pezzo di automazione.

---

## 5. Cosa serve per operare il funnel di Riccardo (piano)

**Quick win (alto valore, poche righe):**
1. 🔴 **Fix lead scoring opt-in** — mappare le chiavi `bandi_*`/preferenze D12.1 (e D11.6 "interesse scouting bandi") in `crm_onMatrixOptIn` come segnale consulenziale (+30) → riattiva l'alert "lead caldo" a Silvano. (`CRM_v1.js:293`)
2. 🔴 **Cablare il benchmark reale** nel report/PDF (`getMatrixReport`→`getMatrixCompareWithBenchmark`) → argomento di vendita "sei sotto la mediana su accessibilità". (`Matrix_v1.js:723`)
3. 🟠 **Unificare la chiave CRM** su email (non responseId) → i punti si sommano, un solo record per museo.
4. 🟠 **Welcome email con proposta di incontro** agganciata a `registraUtente` (CTA calendario).

**Costruzione (il cuore del funnel di Riccardo):**
5. **Motore di sequenze temporizzate** ("outreach engine"): un foglio `OutreachSequence` con `email, step, prossima_azione_il, stato` + un trigger giornaliero che: rileva chi non si è registrato/non ha risposto da 14gg → genera lo step successivo (re-invio cold / mail mirata sui loro bandi). Riusa i contenuti già pronti (digest Matrix per museo, ROC per bando).
6. **Unire i 3 stati** (Utenti + CRM_Leads + MuseiDB_v1) in una vista lead unica, così il funnel è misurabile end-to-end.
7. **Cold-mail "registrati" con link tracciato per-museo** (UTM) → il sistema sa chi si è registrato → calcola il ramo SÌ/NO.
8. **Completare ROC**: wiring dei bottoni Telegram `?roc=avvia/skip` in doGet + funzione `roc_runFollowup` (leggere `followup_due`) + hook `meeting_booked`.
9. **Cruscotto di coorte mensile** per la "valutazione e rianalisi" del ciclo.

**Sistemare prima (igiene digest):** il single-point-of-failure delle coorti, i bandi assenti per lettori/profilati, la starvation da dedup, il backlog tagging.

---

## Nota per Riccardo
Il suo funnel è **compatibile e complementare** col sistema: Sinopia fornisce **la materia prima** (musei profilati, gap reali, bandi pertinenti, contenuti mirati, prenotazione incontri). Il funnel di Riccardo è **il layer di orchestrazione umano/semi-automatico** sopra questi dati. La via più efficiente: partire dai **quick win** (1-4) per attivare subito gli alert lead-caldo e i materiali di vendita, poi costruire il **motore di sequenze** (5) che automatizza i "dopo 2 settimane".
