# Validazione economica — Fase 2

**Data:** 7 giugno 2026 · **Autore:** Silvano Straccini / Duemilamusei
**Scopo:** stimare la sostenibilità economica del modello a partire dai tassi del funnel (Fase 1) e dai parametri di ricavo. Modello a scenari; le assunzioni non ancora misurate sono **dichiarate** e si calibreranno con i dati reali di Fase 1.
**Collegato a:** `superpowers/specs/2026-06-06-funnel-strumentazione-design.md` (§9), `MODELLO_OPERATIVO_SINOPIA_RICCARDO.md`.

---

## 1. Parametri di ricavo (dati forniti)

| Voce | Valore | Note |
|---|---|---|
| **Consulenza per cliente** | 4.000 – 10.000 € | onorario dell'incarico professionale |
| **Bando medio finanziato** | 400.000 € | valore medio del progetto |
| **Indotto (forniture beni/servizi)** | 5% – 8% del bando = **20.000 – 32.000 €** | si concretizza solo se il progetto è **finanziato** e Duemilamusei **fornisce** |

Il valore per cliente ha quindi due componenti: una **certa** (consulenza, all'ingaggio) e una **condizionata** (indotto, a valle del successo del bando).

---

## 2. Assunzioni dichiarate (da confermare / calibrare)

> Questi sono gli unici numeri non forniti. Li tengo prudenti e li espongo come leve: appena Fase 1 misura i tassi reali, l'indotto e la capacità reali, la stima si aggiorna.

| Assunzione | Pessimista | Atteso | Ottimista | Da dove |
|---|---|---|---|---|
| **Tasso concretizzazione indotto** (presenta × vince × fornisce) | 20% | 35% | 50% | esperienza bandi culturali |
| **Conversione outbound → cliente** (cold mail) | 1% | 2% | 3% | benchmark B2B di nicchia |
| **Capacità erogazione** (clienti/anno) | 8 | 15 | 24 | **LEVA CHIAVE — da confermare** |
| **Cap cold mail** | 8/mese (96/anno) | " | " | documentato (ROC) |
| **Costo acquisizione marginale** | ~0 (piattaforma) + tempo | " | " | GAS quasi gratis; costo = tempo |

---

## 3. Valore atteso per cliente

`valore/cliente = consulenza + (tasso concretizzazione × indotto)`

| Scenario | Consulenza | Indotto atteso | **Valore/cliente** |
|---|---|---|---|
| Pessimista | 4.000 | 0,20 × 20.000 = 4.000 | **8.000 €** |
| Atteso | 7.000 | 0,35 × 26.000 = 9.100 | **16.100 €** |
| Ottimista | 10.000 | 0,50 × 32.000 = 16.000 | **26.000 €** |

**Osservazione chiave:** l'**indotto domina il valore** per cliente. La consulenza (4-10k) è la parte minore; il valore vero sta nei progetti finanziati con fornitura. Conviene orientare gli incarichi verso consulenze che sfociano in bandi vinti dove Duemilamusei fornisce beni/servizi.

---

## 4. Ricavi annui (limitati dalla capacità di erogazione)

`ricavi/anno = clienti/anno × valore/cliente`

| Scenario | Clienti/anno | Valore/cliente | **Ricavi/anno** | di cui consulenza | di cui indotto |
|---|---|---|---|---|---|
| Pessimista | 8 | 8.000 | **64.000 €** | 32.000 | 32.000 |
| Atteso | 15 | 16.100 | **241.500 €** | 105.000 | 136.500 |
| Ottimista | 24 | 26.000 | **624.000 €** | 240.000 | 384.000 |

I ricavi scalano **linearmente con la capacità** finché l'acquisizione riesce ad alimentarla (vedi §5).

---

## 5. Verifica dell'acquisizione — il vincolo vero

Quanti contatti servono per alimentare la capacità? E l'outbound da solo basta?

- **Outbound (cold mail):** 96 contatti/anno × 2% = **~2 clienti/anno**. Con il cap a 8/mese, l'outbound da solo copre solo **~13%** del fabbisogno dello scenario atteso (15 clienti).
- **Serve l'inbound:** per arrivare a 15 clienti/anno occorrono ~13 conversioni dall'inbound. A una conversione visitatore→cliente dello 0,5% servono **~2.600 contatti qualificati/anno** (~50/settimana); all'1%, **~1.300/anno**.

**Conseguenza diretta:** senza un forte inbound, il modello è tappato a **~2-3 clienti/anno** (solo outbound). È l'inbound generato dalle **fonti** a sbloccare la capacità.

> Questo **valida economicamente la Fase 3**: la gestione professionale delle fonti (bandi, news, podcast, video, social wall, libri/pubblicazioni, sempre aggiornate e profilate) non è un abbellimento editoriale — è il **motore di acquisizione** che rende raggiungibili gli scenari atteso/ottimista. Le fonti deboli tengono i ricavi nello scenario pessimista a prescindere dalla capacità.

---

## 6. Pareggio e costi

- **Costi fissi:** la piattaforma (Google Apps Script) è prossima allo zero. Il costo reale è **tempo**: l'analisi preliminare gratuita (~mezza giornata per lead qualificato) e l'erogazione della consulenza.
- **Pareggio monetario:** con costi vivi quasi nulli, **1 solo cliente/anno** copre la piattaforma. Anche lo scenario pessimista (64.000 €) è ampiamente sostenibile sul piano monetario.
- **Il vero costo è il tempo-opportunità:** a fronte di un valore atteso/cliente di ~16.000 €, anche un'analisi gratuita "a vuoto" (lead che non converte) costa poche centinaia di euro di tempo. Il rapporto valore/costo regge anche con tassi di conversione bassi.

---

## 7. Sensibilità — su cosa agire

In ordine di impatto sui ricavi:

1. **Capacità di erogazione** — tetto lineare. Più clienti si riescono a seguire (eventualmente con una rete di fornitori/collaboratori per l'indotto), più alti i ricavi. **Leva n.1 da confermare.**
2. **Tasso di concretizzazione dell'indotto** — l'indotto domina il valore/cliente: passare dal 20% al 50% quasi **triplica** la componente indotto. Si alza presidiando la fase progettuale e la fornitura.
3. **Volume inbound dalle fonti** — alimenta la capacità. È il moltiplicatore di acquisizione (Fase 3).

La consulenza base (4-10k) è la leva **meno** sensibile: ritoccarla sposta poco rispetto a indotto e volume.

---

## 8. Verdetto

- **Unit economics: molto favorevoli.** Valore per cliente 8.000–26.000 € contro un costo di acquisizione marginale prossimo a zero (piattaforma quasi gratis; costo = tempo). Pochi clienti ripagano abbondantemente i costi.
- **Il limite non è la convenienza, è la capacità + il volume inbound.** Il modello "tiene" già nel pessimista; cresce con capacità e fonti.
- **Le fonti sono economicamente decisive** (Fase 3 validata): sono il motore che alimenta la capacità. È coerente con la tua tesi di partenza.
- **L'indotto è il driver del valore:** orientare le consulenze verso progetti finanziati con fornitura è la scelta a più alto ritorno.
- **Prudenza:** l'indotto è condizionato al successo del bando — tenerlo a tasso prudente finché Fase 1 e i primi cicli reali non danno dati.

**Range di ricavo annuo stimato: 64.000 € (pessimista) – 241.500 € (atteso) – 624.000 € (ottimista)**, dominato dall'indotto e governato da capacità e qualità delle fonti.

---

## 9. Cosa rende questa stima "viva"

I tre numeri che la spostano di più — **capacità/anno, tasso di concretizzazione indotto, volume inbound** — sono assunzioni. Due si misurano con Fase 1 (conversioni del funnel) e con i primi cicli reali (indotto); la capacità la definisci tu. Appena arrivano i dati, gli scenari si stringono attorno al valore reale.

> Disponibile un modello Excel con celle di input modificabili (consulenza, %indotto, valore bando, tasso concretizzazione, conversioni, capacità) e scenari ricalcolati in automatico, se utile per simulazioni.
