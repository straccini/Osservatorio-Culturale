# Modello operativo integrato — Sinopia & funnel di ingaggio

**Versione:** 1.0 — 6 giugno 2026
**Autore:** Silvano Straccini / Duemilamusei
**Natura del documento:** operativo interno. Integra il modello di outreach proposto da Riccardo Giovane con l'infrastruttura Sinopia, definendo ruoli, cadenze e indicatori. Profilo commerciale volutamente contenuto in questa fase; impostazione professionale e verificabile.
**Documenti collegati:** `MODELLO_INGAGGIO_SINOPIA.md`, `INGAGGIO_E_FUNNEL_RICCARDO.md`, `superpowers/specs/2026-06-06-funnel-strumentazione-design.md`.

---

## 1. Posizionamento e principio guida

Sinopia non è una vetrina commerciale: è un'**infrastruttura informativa professionale** per chi opera nella cultura — professionisti, tecnici della pubblica amministrazione, amministratori, direzioni di musei e luoghi della cultura.

Il principio che regge l'intero sistema è uno **scambio di valore**: l'utente riceve informazione di settore curata e, man mano che dichiara chi è e su cosa lavora, la riceve sempre più mirata. La relazione commerciale non si apre con una proposta di vendita, ma con un **servizio gratuito di reale utilità**: l'analisi preliminare e la consulenza introduttiva.

In una riga:

> **Le fonti generano interesse → l'interesse si profila → la profilazione qualifica → il museo qualificato accede a una consulenza gratuita → da lì la competenza dei consulenti apre le occasioni di business.**

La consulenza gratuita è l'**obiettivo della web app**, non il punto di arrivo del rapporto: è la soglia oltre la quale entra in gioco il lavoro professionale di Duemilamusei.

---

## 2. Il motore di valore: le fonti

Le **fonti** (bandi, news, podcast, video, pubblicazioni, e i contenuti normativi) sono il vero elemento differenziante. Sono la ragione per cui un operatore torna sul portale e accetta di profilarsi.

Caratteristiche che le rendono un *plus* e non un aggregatore qualsiasi:
- **Curatela tematica** sui 5 ambiti Sinopia (Identità, Inclusione, Programma, Comunità, Digital & Governance), non un flusso indistinto.
- **Pertinenza per chi legge**: i contenuti sono taggati per ambito e per dimensione di autovalutazione, così possono essere recapitati in modo selettivo.
- **Tempestività sui bandi**: il radar bandi è la leva di interesse più alta per i tecnici della PA e le direzioni museali.
- **Profondità**: pubblicazioni e contenuti normativi danno autorevolezza, non solo aggiornamento.

**Implicazione operativa:** la qualità e la copertura delle fonti vanno trattate come la priorità infrastrutturale. Un funnel ben strumentato su fonti deboli non produce nulla; fonti forti rendono ogni passo successivo più facile. La **regolazione delle fonti** (unificazione feed, controllo qualità, copertura per ambito, tagging per dimensione Matrix) è perciò il filo conduttore di questa fase di messa a punto.

---

## 3. Il percorso dell'utente (inbound)

Il portale accompagna l'utente per livelli, ciascuno dei quali sblocca più valore in cambio di più profilazione:

| Livello | Chi è | Cosa riceve | Cosa fornisce |
|---|---|---|---|
| **L0 — Ospite** | anonimo | rivista pubblica (fonti curate) | nulla |
| **L1 — Lettore** | registrato | spazio personale, salvataggi, newsletter base | email + chi è |
| **L2 — Profilato** | ha dichiarato ambiti e interessi | newsletter mirata, filtri avanzati | ruolo, ambiti, interessi |
| **L3 — Matrix** | ha completato l'autovalutazione | report, benchmark, roadmap, digest sui propri 3 gap | 43 risposte sullo stato del museo |
| **L4 — Lead qualificato** | ha mostrato interesse a bandi/consulenza | contatto introduttivo dedicato | disponibilità al dialogo |

L'autovalutazione **MuseMu Matrix** è il cardine: 10 dimensioni, 43 domande, profili P1-P5, individuazione dei **3 gap prioritari** con per ciascuno un servizio Duemilamusei pertinente. È al tempo stesso strumento di valore per il museo e qualificazione del lead per noi.

---

## 4. L'integrazione del funnel di Riccardo (outbound)

Il funnel proposto da Riccardo è il **layer di orchestrazione del contatto**, complementare al motore inbound. Porta nuovi operatori dentro la rivista e li accompagna fino alla soglia della consulenza. Mappa così sull'infrastruttura esistente:

| Nodo del funnel | Come opera in Sinopia | Stato |
|---|---|---|
| **1. Cold mail mirata su bando** | `ROC` seleziona il bando (triage), individua i musei pertinenti da `MuseiDB_v1`, genera l'email personalizzata; invio dopo approvazione manuale, con tetto mensile | operativo |
| **2. Link tracciato → registrazione** | la cold mail porta un link con provenienza `museo__bando`; alla registrazione la provenienza viene salvata sull'utente | in attivazione (Fase 1 funnel) |
| **3a. Si registra → benvenuto + incontro** | email di benvenuto con proposta di sessione introduttiva | da consolidare |
| **3b. Non si registra → re-invio a 14 giorni** | il motore di sequenze (`OutreachSequence`) pianifica lo step successivo; re-invio mirato sui bandi/temi del museo | motore presente |
| **4. Risponde → incontro** | la richiesta di consulenza viene registrata e contribuisce al punteggio del lead | operativo |
| **5. Ciclo mensile → valutazione** | vista di coorte "contattati → registrati → … → consulenze" con i tassi reali | in costruzione (cruscotto Fase 1) |

**Saldatura inbound/outbound:** il punteggio lead (CRM) unisce i segnali. Quando un museo profilato o contattato mostra interesse concreto (apertura, click su servizi, opt-in consulenziale, prenotazione), il punteggio cresce e, superata la soglia, scatta l'**alert** che porta la persona giusta al contatto uno-a-uno. Sinopia fornisce la materia prima (musei profilati, gap reali, bandi pertinenti); l'orchestrazione del contatto resta umana.

---

## 5. Il punto di conversione: la consulenza gratuita

La consulenza gratuita è offerta come **analisi preliminare professionale**, non come gancio commerciale. Forma tipica: una sessione introduttiva (circa 30-60 minuti) con una lettura sintetica dello stato del museo — alimentata, dove disponibile, dai risultati Matrix e dal benchmark con musei comparabili — e una prima ipotesi di intervento.

Caratteristiche coerenti con il **basso profilo commerciale** di questa fase:
- si propone **valore e competenza**, non un preventivo;
- l'innesco è un **segnale dell'utente** (ha compilato, ha chiesto, ha mostrato interesse), non una spinta nostra;
- il tono è quello di un confronto tra professionisti, non di una vendita.

È da questa soglia che, in funzione delle reali esigenze emerse e della capacità dei consulenti coinvolti, nascono le occasioni di incarico.

---

## 6. Il ciclo di misura

Per governare il modello servono **tassi reali**, non impressioni. La strumentazione del funnel (Fase 1) introduce una vista unica che, per ogni stadio, mostra il numero e il tasso di conversione rispetto allo stadio precedente:

```
Contattati → Registrati → Profilati → Matrix → Lead qualificato → Prenotazione → Consulenza
```

I tassi del tratto outbound sono misurati **per coorte** (grazie alla provenienza tracciata), quelli del tratto interno tramite gli stati del CRM. Sotto una soglia minima di numeri il dato è segnalato come non affidabile, per non prendere decisioni su campioni troppo piccoli.

Questa misura è la premessa della **validazione economica** (fase successiva), che con i tassi reali e tre parametri — prezzo medio della consulenza, costo per contatto, capacità mensile di erogazione — stabilirà se e a quali condizioni il modello è sostenibile e dove sta il collo di bottiglia.

---

## 7. Ruoli e responsabilità

| Soggetto | Responsabilità |
|---|---|
| **Sinopia (la piattaforma)** | curare le fonti, profilare, qualificare, misurare; fornire la materia prima |
| **Silvano Straccini** | curatela strategica, contenuti, conduzione delle consulenze e degli incarichi |
| **Riccardo Giovane** | orchestrazione del contatto: selezione, sequenze, follow-up, gestione della relazione fino all'incontro |

Confine operativo: la piattaforma **automatizza ciò che è ripetibile** (selezione, invio, misura) e lascia all'umano **ciò che richiede giudizio** (qualità del contatto, conduzione del dialogo professionale).

---

## 8. Cadenze operative

| Cadenza | Attività | Responsabile |
|---|---|---|
| Continua | scansione fonti (bandi, news, podcast) | piattaforma |
| Settimanale | newsletter/digest profilati per coorte | piattaforma |
| Settimanale | revisione qualità fonti e tagging per dimensione | curatela |
| Mensile | batch outreach mirato su bando (entro il tetto concordato) | orchestrazione contatto |
| Continua (a soglia) | alert lead qualificato → contatto uno-a-uno | orchestrazione contatto |
| Mensile | lettura del cruscotto funnel (coorte: contattati → consulenze) | Silvano + Riccardo |

Il **tetto mensile** sull'invio a freddo è una scelta di metodo: pochi contatti ben mirati, coerenti con un posizionamento professionale e con la capacità reale di seguire chi risponde.

---

## 9. Indicatori (coerenti con il funnel)

- **Tasso contattati → registrati** (efficacia del cold mail e del link tracciato)
- **Tasso registrati → Matrix** (profondità di ingaggio; il Matrix è la qualificazione)
- **Tasso Matrix → lead qualificato** (interesse concreto)
- **Tasso lead qualificato → consulenza** (conversione utile)
- **Conversione end-to-end** contattati → consulenza
- **Tempo medio** tra gli stadi (lunghezza del ciclo)

Tutti leggibili dal cruscotto, per periodo, con flag di affidabilità.

---

## 10. Principi di professionalità e tutela

- **Trasparenza**: pagina pubblica di trasparenza con dati aggregati e anonimi; nessuna esposizione di dati individuali.
- **GDPR**: profilazione su consenso, diritto all'oblio attivo, dati di provenienza usati per la sola misura interna.
- **Qualità prima della quantità**: meglio poche fonti autorevoli e pochi contatti mirati che volume indifferenziato.
- **Basso profilo commerciale in questa fase**: la leva è la competenza dimostrata attraverso contenuti e analisi, non la pressione di vendita.

---

## 11. Stato e roadmap

| Fase | Contenuto | Stato |
|---|---|---|
| **Infrastruttura ingaggio** | rivista, profilazione progressiva, Matrix, CRM, motore sequenze, ROC, welcome, lead unificato | in larga parte realizzata |
| **Fase 1 — Misura del funnel** | link tracciato, cattura provenienza, cruscotto conteggi+tassi | pianificata (spec + piano + runbook pronti) |
| **Fase 2 — Validazione economica** | modello a scenari sui tassi reali (prezzo, costo, capacità) | da avviare (richiede i tre parametri) |
| **Filo conduttore — Fonti** | unificazione feed, qualità, copertura per ambito, tagging per dimensione | prossima messa a punto prioritaria |

**Sintesi per Riccardo:** il funnel proposto è pienamente compatibile con il sistema e in buona parte già implementato. Il completamento passa dalla **misura** (sapere a quali tassi convertiamo, per coorte) e dalla **qualità delle fonti** (ciò che genera l'interesse iniziale). Su questa base, il contatto umano e la consulenza professionale fanno il resto.
