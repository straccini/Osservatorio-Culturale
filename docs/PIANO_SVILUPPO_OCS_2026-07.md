# Piano di Sviluppo OCS — Nuove aree informative
**Osservatorio Culturale Sinopia · luglio 2026 · v1.0 (bozza da condividere)**

---

## Premessa: su cosa costruiamo

Il piano NON parte da zero: ogni tappa riusa l'infrastruttura già in produzione (v729).

| Capacità esistente | Cosa offre alle nuove aree |
|---|---|
| **Corsia PRECISIONE** (Bandi_v5 + connettori fasParser* + BandiGate) | pipeline con dedup, gate cultura+link, campo `TipoBando` e `Livello` già presenti |
| **Corsia FRESCHEZZA** (FontiFeed + scanSources round-robin ×4/giorno) | aggiungere una fonte news = 1 riga nel foglio, zero codice |
| **Corsia PROFONDITÀ** (podcast/video daily, pubDiscovery weekly) | pattern per categorie a bassa frequenza |
| **CronDispatcher** (1 trigger orario, 14 slot liberi) | ogni nuovo job = 1 riga in `OC_CRON_EXTRA`, zero trigger nuovi |
| **Agenti qualità** (bandi daily + fonti mute /5gg con diagnosi) | sorveglianza automatica estendibile alle nuove categorie |
| **Gate di verifica fonti** (`fontiAggiungiFeedVerificato`) | ogni nuova fonte è testata (HTTP+RSS+dedup) prima dell'iscrizione |
| **Digest & Matrix tagger** | le nuove categorie entrano nei digest profilati senza rifare il routing |

**Vincolo guida confermato**: modifiche additive; l'assetto della webapp si tocca solo dove esplicitamente deciso (nuove sezioni).

---

## TAPPA 0 — Consolidamento (subito, 2-3 giorni)
*Prerequisito di tutto: verificare che il motore v729 giri da solo.*

- [ ] `ocCronSetup(false)` applicato → 6 trigger totali
- [ ] Verifica dopo 48h: email agenteQualitaBandi ricevuta · news fresche in home 4×/giorno · ScanLog regolare
- [ ] KPI baseline da annotare: item/giorno, bandi attivi, fonti attive (per misurare le tappe successive)

**Criticità**: nessuna. **Costo**: zero sviluppo.

---

## TAPPA 1 — Aree professionali: "Lavoro Cultura" (settimane 1-3) ⭐ priorità Silvano
*Concorsi pubblici e opportunità professionali del settore — nessuno le aggrega bene in Italia: è il primo tassello del "sistema unico".*

### Fonti candidate (da verificare live una per una, metodo collaudato)
| Fonte | Canale | Note |
|---|---|---|
| GU 4ª Serie Concorsi | RSS (serie S4, stesso schema S5 già testato) | filtro keyword cultura: curatore, museo, bibliotecario, archivista, storico dell'arte, funzionario MiC, restauratore… |
| inPA (reclutamento PA) | da verificare (open data / RSS?) | il canale ufficiale post-riforma |
| MiC concorsi | pagina/feed da verificare | |
| Fitzcarraldo / AgCult job | segnalano posizioni settore | già fonti attive: estrazione mirata |
| Artribune Jobs, Exibart lavoro | rubriche da verificare | |

### Integrazione (Opzione A — raccomandata)
**Riuso della pipeline bandi**: i concorsi entrano in Bandi_v5 con `TipoBando='concorso-lavoro'`.
- Connettore `fasParserGuS4Lavoro` (clone del pattern S5 già costruito, con filtro professioni cultura)
- Il BandiGate li protegge già (link certi, pertinenza)
- UI: **solo un filter chip** "Lavoro" nella pagina Bandi → zero modifiche strutturali
- Digest: nuova voce nelle preferenze interessi (dimensione già gestita dal tagger)

### Opzione B (alternativa, più avanti)
Sezione dedicata "Professioni" in sidebar con foglio proprio — più visibilità ma tocca l'assetto. Consiglio: partire con A, promuovere a B se il volume/interesse lo giustifica (>15 item/mese).

**Criticità e soluzioni**
1. *GU S4 rumorosa come la S5?* → dry-run prima di attivare (metodo GU S5: costruire → testare → verdetto). Il filtro professioni è più selettivo del filtro appalti.
2. *inPA accesso ignoto* → verifica live; se WAF-bloccato, fallback su GU S4 sola.
3. *Scadenze concorsi rigide* → l'agenteQualitaBandi li archivia già alla scadenza.

**Deliverable**: connettore + 3-5 fonti verificate + chip UI + report dry-run condiviso prima dell'attivazione.

---

## TAPPA 2 — Opportunità estere/internazionali (settimane 3-6) ⭐ priorità Silvano
*Bandi UE, residenze, premi, open call, lavoro internazionale.*

### 2a. Bandi e fondi UE (canale precisione)
- **Sblocco SEDIA EU**: il parser esiste (`fasParserSediaEU`) ma scarta i risultati per mismatch del JSON (10 risultati, 0 estratti). Piano di debug: loggare la risposta raw → adattare il mapping campi → dry-run → attivazione. È il nodo che apre **Creative Europe + CERV** in automatico.
- CORDIS già monitorato (aggregatore OK). TED già attivo con filtro CPV cultura.

### 2b. Residenze, premi, open call (canale freschezza/profondità)
| Fonte | Canale | Note |
|---|---|---|
| e-flux Announcements | RSS da verificare | la fonte più ricca al mondo per open call arte |
| TransArtists / Res Artis | da verificare | residenze artistiche |
| ArtRabbit, Curatorial calls | da verificare | |
| British Council / Goethe / Pro Helvetia | pagine opportunità | spesso senza RSS → vedi criticità 2 |
| UNESCO / Europa Nostra (già attiva) | news | Europa Nostra già raccoglie |

### 2c. Lavoro internazionale musei
| Fonte | Note |
|---|---|
| Museums Association Jobs (UK) | da verificare RSS |
| AAM JobHQ (US) | da verificare |
| ICOM opportunità | ICOM Int. già fonte attiva |

**Integrazione**: bandi/call → Bandi_v5 con `Livello='EU'/'INT'` (campo esistente, già filtrabile); notizie di opportunità → FontiFeed ambito dedicato. Chip "Estero" nella pagina Bandi.

**Criticità e soluzioni**
1. *SEDIA parser* → debug strutturato (1 sessione dedicata); alternativa: RSS del Funding & Tenders Portal (esiste una subscription RSS, rilevata a giugno — da riverificare).
2. *Fonti estere senza RSS o WAF* → **soluzione cloud-agent**: una skill schedulata (come la discovery fonti già in uso) naviga le pagine dal cloud, estrae le call verificate e le consegna a GAS via `fontiAggiungiFeedVerificato`/`_fasSaveBando_`. Aggira i 403 senza toccare l'assetto GAS.
3. *Lingua* → i digest restano in italiano: sommario AI già traduce (processWithAI); costo API in aumento → vedi criticità trasversali.

**Deliverable**: SEDIA sbloccato o alternativa RSS attiva + 4-6 fonti internazionali verificate + chip "Estero".

---

## TAPPA 3 — Normativa cultura (settimane 6-8)
*La sezione Norme esiste già (foglio + UI): oggi è alimentata a mano.*

- **EUR-Lex**: feed RSS per aree tematiche (da verificare URL esatti) → norme UE cultura
- **GU Serie Generale**: RSS disponibile → filtro keyword (decreto cultura, MiC, patrimonio…)
- **AG2 Normativa** (agente esistente, gira il martedì): potenziarlo è l'alternativa a costo minimo — già scrive nel sistema
- Camera/Senato: WAF-bloccati (verificato) → esclusi, coperti indirettamente da AgCult

**Raccomandazione**: partire dal potenziamento di AG2 (zero nuove strutture), aggiungere EUR-Lex come fonte del suo ciclo.

**Criticità**: linguaggio giuridico = rumore alto → doppio gate (keyword + AI score). Volume basso: cadenza settimanale basta.

---

## TAPPA 4 — Social monitoring inbound (settimane 8-10)
*Segnali dai profili istituzionali, non solo rilanci (SocialWall attuale è outbound).*

- **Fattibile subito**: Bluesky (RSS pubblico per profilo) e Mastodon (`/@utente.rss`) — musei e istituzioni culturali che li usano; YouTube già coperto
- **Non fattibile senza costi**: Instagram/Facebook/X (API a pagamento, no RSS) → dichiararlo apertamente nel piano
- **Alternativa ponte**: newsletter istituzionali via `scanNewsletterGmail` (già attivo!) — iscrivere la casella alle newsletter di MiC, ICOM, Federculture = monitoraggio "social-like" senza API

**Raccomandazione**: iniziare dalla via newsletter (già funzionante, zero codice) + lista curata di 10-15 profili Bluesky/Mastodon verificati.

**Criticità**: presenza italiana su Bluesky/Mastodon ancora scarsa → valore iniziale limitato; rivalutare a 3 mesi.

---

## TAPPA 5 — Consolidamento UX + digest (settimane 10-12)
- Chip/sezioni per Lavoro + Estero definitivi (decisione A→B in base ai volumi)
- Digest: nuove dimensioni interesse ("Opportunità professionali", "Estero") nel profilo lettore e nel tagger Matrix
- CRM: segmento nuovo — chi cerca lavoro ≠ chi dirige un museo → percorsi commerciali distinti
- KPI review vs baseline Tappa 0 → decidere Tappa 6 (candidati: eventi/mostre in calendario, formazione/call for papers)

---

## Criticità trasversali (valgono per tutte le tappe)

| # | Criticità | Impatto | Mitigazione |
|---|---|---|---|
| 1 | **Quote GAS** (UrlFetch/giorno, 6 min/esecuzione) | scanner si ferma | già mitigata: round-robin + budget; monitorare ScanLog; se si satura → ridurre run a 3/giorno |
| 2 | **Costo API Claude** cresce con gli item | budget | gate semantico PRIMA della chiamata AI (già per generaliste → estendere a tutte le nuove categorie); valutare batch |
| 3 | **403/WAF da IP Google** | fonti perse | cloud-agent schedulato per il fetch esterno (pattern già in uso per la discovery) |
| 4 | **Crescita fogli** (Items, Bandi_v5) | lentezza | retention: autoArchive esiste; aggiungere purge >12 mesi (manuale, con conferma) |
| 5 | **Manutenzione fonti** | decadimento silenzioso | già coperta: agenteFontiMute ogni 5gg con diagnosi per-fonte |

---

## TAPPA P — Discovery attiva fonti PODCAST e VIDEO ⭐ priorità Silvano (aggiunta 2026-07-08)
*Motivazione: podcast e video sono elementi redazionali di valore, ma oggi il parco fonti è statico e poco aggiornato. Serve una ricerca di fonti ATTIVA e COSTANTE, non un seed una-tantum.*

**Priorità: PODCAST prima** (contenuto editoriale forte, ascolto in crescita nel settore cultura), poi VIDEO.

### Cosa costruire
1. **Audit del parco attuale** — quante fonti podcast/video attive, quante mute/ferme (riusare `agenteFontiMute` esteso ai tipi podcast/video: oggi diagnostica soprattutto RSS news).
2. **Discovery ricorrente** — una skill/agente schedulato (mensile) che cerca nuovi podcast cultura italiani verificati e li propone via `fontiAggiungiFeedVerificato` (gate HTTP+RSS+dedup già pronto). Canali: Spreaker/Spotify RSS pubblici, Apple Podcasts, feed dei musei/festival/riviste.
3. **Fonti candidate da verificare** (prima sessione): podcast di musei top (Uffizi, MAXXI, Triennale…), riviste (Il Post cultura, Chora/Will cultura), festival, università, ICOM. Per i video: canali YouTube museali (Atom feed, già supportato da `scanVideoYoutube`).
4. **Freschezza** — lo scan podcast+video è già quotidiano (07:30); il collo di bottiglia è la QUANTITÀ e QUALITÀ delle fonti, non la frequenza.

**Criticità/soluzioni**: Spotify non espone sempre RSS diretto (usare l'RSS originario del publisher); Apple Podcasts ha un lookup API pubblico per risolvere il feed. Rischio duplicati tra podcast e video → dedup per feed URL già attivo.

**Deliverable T-P.1**: audit + 8-12 nuove fonti podcast verificate live; poi ciclo discovery mensile nel dispatcher.

---

## Alternative di sviluppo ulteriori (non in piano, da valutare dopo)

1. **Eventi & mostre in calendario** — Arte.it Mostre già attiva; un calendario navigabile per regione sarebbe una feature UI nuova (tocca l'assetto → decisione dedicata)
2. **Formazione & call for papers** — università, master cultura, convegni: pubblico giovane/professionale, ottimo per CRM
3. **Osservatorio prezzi/appalti** (dati BDNCP già in casa): benchmark economici per chi prepara offerte — feature premium potenziale
4. **API/feed OCS in uscita** — offrire NOI un feed RSS/JSON dei bandi cultura qualificati: da "aggregatore" a "fonte primaria" citabile (posizionamento "sistema unico in Italia")
5. **Migrazione oltre GAS** (Cloud Run / Supabase) — solo se le quote diventano il collo di bottiglia strutturale; oggi non necessario

---

## Sequenza riassuntiva e decisioni richieste a Silvano

| Tappa | Settimane | Decisione richiesta |
|---|---|---|
| 0 Consolidamento | ora | — (solo verifica) |
| 1 Lavoro Cultura | 1-3 | ✅/❌ Opzione A (chip in Bandi) come partenza? |
| 2 Estero | 3-6 | ✅/❌ dedicare 1 sessione al debug SEDIA? Cloud-agent per fonti 403 sì/no? |
| 3 Normativa | 6-8 | ✅/❌ potenziare AG2 invece di nuova pipeline? |
| 4 Social inbound | 8-10 | ✅/❌ partire dalla via newsletter Gmail? |
| 5 UX + digest | 10-12 | dopo i volumi delle tappe 1-2 |

*Ogni tappa segue il protocollo: verifica fonti live → dry-run → verdetto condiviso → attivazione → sorveglianza automatica.*
