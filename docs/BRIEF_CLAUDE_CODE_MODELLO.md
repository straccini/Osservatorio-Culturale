# Brief Claude Code — Modello di ingaggio Sinopia (rivista + profilazione progressiva + outreach)

**Razionale:** `docs/MODELLO_INGAGGIO_SINOPIA.md` (leggere prima).
**Obiettivo:** trasformare Sinopia in una "rivista tecnica" che converte Ospite→Lettore→Profilato→Matrix→Lead caldo, con newsletter calibrate sul grado di profilazione e CTA "Candidatura Capitale" ovunque.
**Già fatto (NON rifare):** alert lead-caldo collegati (`crm_onMatrixOptIn`); digest Matrix riparato.

## MODALITÀ
- **Flusso unico e continuo**, un commit per FASE. Riporta solo a fine. Fermati su blocco reale.
- **NON toccare** il login email/magic-link (brief separato).
- Riusa il più possibile ciò che esiste (sotto indicato con file:riga). Test digest in **dry-run**, niente invii reali in sviluppo. `clasp push` (deploy manuale = utente).
- Pagina target candidature: **`#page-capitali`** ("Capitali della Cultura & candidature speciali", Index.html:1307), voce sidebar `data-page="capitali"`.

---

## FASE 1 — QUICK WIN (poche righe, alto valore)

### 1.1 Footer "Candidatura Capitale" in TUTTE le newsletter
I 3 template usano già `_digestUnsubFooter_`. Aggiungere, **subito sopra** il footer unsub, un blocco CTA condiviso che rimanda alla pagina Capitali.
- Creare helper `_digestCapitaleCta_()` (in `DigestService.js` o `Unsubscribe_v1.js`): blocco HTML brandizzato "🏛️ Candidature da Capitale della Cultura — il tuo territorio può candidarsi. Scopri scadenze e percorso →" con link al portale che apre la pagina Capitali.
- Inserirlo in: `buildDigestHTML` (DigestService.js:197, generica), `buildTematicDigest` (Digest_routing.js:455, profilata), `_buildDigestSegmentatoHtml_` (Matrix_digest.js:539, Matrix).
- **Deep-link**: il CTA punta a `<appUrl>?goto=capitali`. Aggiungere nel frontend (Index.html, in fase di hydrate/boot) la lettura di `?goto=<page>` → `OC.go(page)`; se assente, aggiungerlo. (appUrl = `ScriptApp.getService().getUrl()` lato server o `OC_APP_PUBLIC_URL`.)
- *Accettazione:* le 3 newsletter (anche in anteprima `previewDigestPerEmail`) mostrano in fondo il blocco Capitale che apre `#page-capitali`.

### 1.2 Bandi nella newsletter PROFILATA (oggi solo news)
`buildTematicDigest` (Digest_routing.js:389) filtra solo `items` (news). Aggiungere una **sezione bandi** filtrati per gli interessi del lead.
- Sorgente bandi: `getSheetRadar()` / `getBandiV5` (Bandi_v5.js). Filtrare per ambito/keyword corrispondenti alla tematica del lead (riusa la mappa keyword già presente in `buildTematicDigest`, e per gli interessi `bandi_*` mappa: pnrr/fondazioni/regionali/europei→filtro su Ente/Settore/Ambito del bando).
- Mostrare 3-5 bandi pertinenti in scadenza, con titolo/ente/scadenza/link, sopra la sezione news.
- *Accettazione:* un profilato con interesse "bandi_regionali" riceve in newsletter i bandi regionali pertinenti, non solo news.

*Commit:* `feat(newsletter): footer Capitale ovunque + bandi nella newsletter profilata (modello F1)`

---

## FASE 2 — ESPERIENZA: rivista + profilazione progressiva (riusa ProfiloPro)

### 2.1 Home "rivista" — ridurre il carosello
`HomeView.html`: il blocco `home-carosello` (le slide promo) va **ridimensionato** a favore del contenuto editoriale.
- Ridurre il carosello a 1 slide compatta (o spostarlo in basso) e dare risalto in alto a: ultimi articoli/news, bandi in scadenza, approfondimenti — come una testata.
- La CTA di registrazione cambia messaggio: da "iscriviti" a **"Attiva il tuo profilo di consultazione — informazione mirata sui tuoi interessi + i bandi giusti per te"**.
- *Accettazione:* la home "legge" come una rivista; meno slideshow, più contenuto.

### 2.2 Profilazione progressiva — valorizzare ProfiloPro (esiste già)
`ProfiloPro_v1.js` cattura già: `categoria_pro`, `ruolo_funzione`, `tipo_ente`, `area_geografica`, `interessi_dimensioni`, `completezza` + `suggestDimensioniByRuolo` (ProfiloPro_v1.js:187) + `_proSyncOptIn_` (sincronizza opt-in dagli interessi).
- Rendere **prominente** il form profilo per il Lettore appena registrato: dopo `registraUtente`, invitarlo a "completare il profilo" (chi sei / categoria: professionista · tecnico PA · amministratore · museo · / ambiti / interessi).
- Collegare `interessi_dimensioni` alla **newsletter profilata** (F1.2) e ai **filtri** della webapp (i filtri ambito si pre-impostano sugli interessi dichiarati).
- *Accettazione:* un lettore che compila il profilo riceve newsletter e filtri allineati ai suoi interessi; la % `completezza` cresce.

### 2.3 Tabella 3 colonne — "cosa hai / cosa sblocchi"
Nuova sezione (nello spazio personale e/o nella pagina di registrazione/profilo) con 3 colonne **Ospite · Lettore · Profilato/Matrix** e le righe servizi (vedi MODELLO §4: leggere/salvare/filtri/newsletter/spazio/digest bandi/Matrix/benchmark/report).
- Le celle si "accendono" in base allo **stato utente** (`_ocLivello()`) e alla `completezza` di ProfiloPro.
- Ogni cella spenta è una **CTA** ("sblocca dicendoci di più" → apre il form profilo o invita alla registrazione/Matrix).
- *Accettazione:* l'utente vede a colpo d'occhio cosa ha sbloccato e cosa ottiene profilandosi; i CTA portano al passo successivo.

### 2.4 (Opzionale) Autovalutazione interessi "leggera" per non-musei
Per professionisti/PA/amministratori senza museo, il form ProfiloPro è già la versione leggera. Verificare che il flusso non forzi campi "museo" per chi non lo è (campi `tipo_ente`/`dimensione_struttura` opzionali per categoria non-museo). Il Matrix completo resta riservato a musei/luoghi della cultura.

*Commit:* `feat(esperienza): home-rivista + profilazione progressiva ProfiloPro + tabella 3 colonne (modello F2)`

---

## FASE 3 — OUTREACH ENGINE (funnel di Riccardo, la parte nuova)

Obiettivo: portare nuovi operatori dentro la rivista con sequenze temporizzate, e misurare il funnel.

### 3.1 Stati lead unificati
Oggi 3 stati scollegati: `Utenti` (registrazione), `CRM_Leads` (scoring), `MuseiDB_v1` (relazione ROC). + chiave CRM incoerente (responseId vs email).
- Unificare la **chiave CRM su email** (oltre a responseId) così i punti si sommano per persona; collegare registrazione → CRM (registrarsi crea/aggiorna il lead).
- Una funzione `getLeadUnificato(email)` che fonde i 3 stati per la vista funnel.

### 3.2 Motore di sequenze temporizzate (il "dopo 2 settimane")
- Nuovo foglio `OutreachSequence`: `email, museo, step, ultimo_contatto, prossima_azione_il, stato`.
- Trigger giornaliero `outreachRunDaily()`: per ogni contatto, se `prossima_azione_il <= oggi` esegue lo step previsto (cold mail / re-invio / mail mirata sui loro bandi) e pianifica il successivo a +14gg; si ferma su registrazione/risposta/incontro.
- Riusa i contenuti già pronti: digest Matrix per museo, ROC per bando.
- *Accettazione:* un contatto non registrato riceve il re-invio dopo 14gg in automatico; alla registrazione la sequenza si ferma.

### 3.3 Cold mail + welcome + incontro
- **Cold mail "scopri l'Osservatorio"**: template + link tracciato per-museo (UTM) → alla registrazione il sistema sa chi è arrivato da quel contatto (calcola il ramo SÌ/NO del funnel).
- **Welcome email con proposta di incontro** agganciata a `registraUtente` (oggi assente): CTA calendario consulenza.
- **ROC completamento**: wiring dei bottoni Telegram `?roc=avvia/skip` in doGet (oggi dead-end); funzione `roc_runFollowup()` che legge `followup_due`; hook `meeting_booked +20` al ritorno dal calendario.

### 3.4 Cruscotto di coorte mensile
- Vista "Funnel mese": N contattati → N registrati → N profilati → N Matrix → N incontri → N clienti (per la "valutazione e rianalisi" del ciclo di Riccardo). Da `getLeadUnificato` + DigestLog + RichiestePrenotazione.

*Commit:* `feat(outreach): stati lead unificati + sequenze temporizzate + cold/welcome + ROC + cruscotto coorte (modello F3)`

---

## Definition of Done
- [ ] Footer "Candidatura Capitale" (→ #page-capitali) in generica + profilata + Matrix.
- [ ] Newsletter profilata include bandi filtrati per interesse.
- [ ] Home più "rivista" (meno carosello); CTA "attiva profilo".
- [ ] Profilazione ProfiloPro valorizzata; interessi pilotano newsletter + filtri; tabella 3 colonne con CTA.
- [ ] Outreach engine: stati unificati, sequenze a 14gg, cold/welcome, ROC completato, cruscotto coorte.
- [ ] `clasp push` ok; flusso pubblico anonimo intatto; login non toccato; digest testati in dry-run.

*Priorità: F1 subito (quick win), poi F2 (esperienza/conversione), infine F3 (outbound). Le fasi sono indipendenti: si possono dare a Claude Code una alla volta.*
