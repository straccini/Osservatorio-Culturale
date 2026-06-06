# Specifica — Strumentazione Funnel + Attribuzione (modello ibrido)

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script)
**Branch:** `feat/fonti-feed-unificazione`
**Data:** 2026-06-06
**Stato:** design approvato (livello "ibrido") — pronto per piano di implementazione
**Obiettivo finale:** validazione **economica** del modello di business. Questo documento copre il prerequisito: **misurare il funnel reale** per ottenere tassi di conversione veri su cui poggiare i conti.

---

## 0. TL;DR

I conteggi del funnel esistono già, sparsi in due funzioni scollegate che **non calcolano i tassi**. Il vero buco è l'**attribuzione**: oggi il cold mail non contiene nemmeno un link cliccabile, quindi è impossibile sapere chi si registra "per colpa" di un contatto. La soluzione ibrida:

1. aggiungere un **link tracciato** nel cold mail (porta un "braccialetto" museo+bando);
2. **catturare la provenienza alla registrazione** e salvarla sull'utente;
3. **seguire la coorte per email** a valle (Matrix → CRM → cliente), riusando `getLeadUnificato()`;
4. unificare tutto in **una sola funzione** `getFunnelCompleto()` che produce conteggi **e** tassi per stadio;
5. mostrarlo in un **cruscotto admin** con flag di affidabilità statistica.

I tassi misurati diventano l'input della **Fase 2 economica** (`tasso × prezzo × capacità → ricavi, CAC, break-even`).

---

## 1. Contesto e problema

Il modello di ingaggio (vedi `docs/MODELLO_INGAGGIO_SINOPIA.md`) è un funnel a livelli a scambio di valore: **L0 ospite → L1 lettore → L2 profilato → L3 Matrix → L4 lead caldo → cliente**. La rivista regala valore per attrarre operatori; il ricavo arriva solo in fondo (consulenza Silvano/Riccardo).

**Cosa esiste già** (riusare, non rifare):

| Funzione | File | Cosa restituisce |
|---|---|---|
| `getOutreachFunnelMensile()` | `OutreachEngine.js:293` | conteggi *fronte*: `{contattati, registrati, profilati, matrix, prenotazioni}` |
| `getTrasparenzaData()` | `Privacy_v1.js:259` | conteggi *retro* CRM: `funnel{lead, mql, sql, hot, cliente}` |
| `crm_listLeads(filtro)` | `CRM_v1.js:190` | lead per stato + totale |
| `getLeadUnificato(email)` | `OutreachEngine.js:38` | fonde Utenti + CRM_Leads + ContactsMatrix + RichiestePrenotazione + OutreachSequence per email |
| infra UTM | `Privacy_v1.js:106` (`utm_buildTrackedUrl`), `:124` (redirect), foglio `UtmLog` | costruzione link tracciati + log click |

**I tre difetti che impediscono la misura vera:**

1. **Nessun tasso.** Le due funzioni contano, ma nessuna calcola la conversione tra stadi.
2. **Popolazioni diverse.** `getOutreachFunnelMensile().registrati` conta *tutti* gli iscritti attivi, non solo quelli contattati. Il rapporto "contattati→registrati" divide insiemi scollegati: non è una conversione.
3. **Nessun aggancio outbound.** Il cold mail (`ROC_v1.js:334-354`) è **testo semplice senza link**: la CTA è "rispondi a questa mail". Non esiste niente da tracciare tra museo contattato ed eventuale registrazione.

---

## 2. Obiettivo e criterio di successo

**Obiettivo:** una sola fonte di verità che, dato un periodo, produca per ogni stadio del funnel il **conteggio** e il **tasso di conversione** rispetto allo stadio precedente, con tassi *veri di coorte* sul tratto outbound.

**Criterio di successo (verificabile):**
- Esiste `getFunnelCompleto({dateFrom, dateTo})` che ritorna stadi con `count` e `rateFromPrev`.
- Un museo che clicca il link del cold mail e si registra risulta **attribuito** a quel museo/bando (verificabile su dati sintetici di test).
- Il cruscotto admin mostra l'imbuto con i tassi e segnala "campione insufficiente" sotto soglia.
- Nessun dato personale esposto fuori dall'area admin.

---

## 3. Definizione del funnel unificato

Stadi canonici e loro fonte dati:

| # | Stadio | Fonte dati | Come si conta | Timestamp per il periodo |
|---|---|---|---|---|
| 1 | **Contattati** | `ROC_Outreach` | righe con `status='sent'` | `timestamp` invio |
| 2 | **Registrati** | `Utenti` (+ `Sessioni_v1`) | utenti con `acquisition_source` valorizzato (tratto outbound) o tutti gli attivi (vista globale) | `DataIscrizione` / `created_at` |
| 3 | **Profilati (L2)** | `ProfiliPro` *(da confermare: vedi §13)* | profilo con `completezza ≥ soglia` | `dataCreazione` |
| 4 | **Matrix (L3)** | `ResponsesMatrix` | `completion_status='complete'` | `timestamp_fine` |
| 5 | **Lead caldo (L4)** | `CRM_Leads` | `stato='hot'` (score ≥ 30) | `ultimo_evento` |
| 6 | **Prenotazione** | `RichiestePrenotazione` | righe con stato follow-up valido | `data_richiesta` |
| 7 | **Cliente** | `CRM_Leads` | `stato='cliente'` (score ≥ 100) | `ultimo_evento` |

**Due tratti, due metodi di misura:**
- **Tratto outbound** (1→2→…→4): misura **per coorte** via attribuzione `acquisition_source` (§4). I tassi qui sono "veri".
- **Tratto interno** (4→5→6→7): misura via CRM/email con i timestamp già presenti in `CRM_Leads.score_history_json`.

---

## 4. Meccanismo di attribuzione (il cuore)

L'attribuzione si fa in **3 passi + fallback**, senza dipendere dal bridge click→email (che in GAS non è affidabile):

**Passo 1 — Il "braccialetto" nel cold mail.**
In `roc_buildEmailBatch()` ogni email riceve una CTA cliccabile:
```
👉 Attiva la tua analisi gratuita:
   {APP_URL}?reg=1&src=<museoId>__<bandoId>
```
`<museoId>` viene da `m.id` (già presente nel match), `<bandoId>` da `bando.id`. Il link sostituisce/affianca l'attuale CTA testuale "rispondi a bandi@duemilamusei.it".

**Passo 2 — Cattura alla registrazione.**
- Al landing (`doGet`), il parametro `src` viene letto e passato al frontend.
- Quando l'utente completa la registrazione (`createSessione` / `richiediAccesso`), si salva `acquisition_source = "<museoId>__<bandoId>"` su una **nuova colonna** del foglio `Utenti` (e/o `Sessioni_v1`).
- Da quel momento l'email "ricorda" la provenienza.

**Passo 3 — Join per email a valle.**
Per gli stadi 3-7 si segue la stessa persona **per email**, riusando il pattern di `getLeadUnificato(email)` che già fonde tutti i fogli. La coorte = insieme delle email con `acquisition_source` valorizzato (o, per vista per-bando, con `bandoId` corrispondente).

**Fallback (attribuzione parziale).**
Se l'utente non clicca ma risponde e si registra a mano, si tenta il match `email_registrante == ROC_Outreach.email_to`. Copre i casi senza click.

**Schema di flusso:**
```
cold mail (src=museo__bando)
      │ click
      ▼
landing ?src=…  ──►  registrazione  ──►  Utenti.acquisition_source = "museo__bando"
                                              │ (join per email)
                                              ▼
                          ProfiliPro → ResponsesMatrix → CRM_Leads → RichiestePrenotazione
```

---

## 5. Modifiche al modello dati

Minime e additive (nessuna colonna esistente toccata):

| Foglio | Nuova colonna | Scopo |
|---|---|---|
| `Utenti` | `AcquisitionSource` | provenienza `museoId__bandoId` catturata alla registrazione |
| `Sessioni_v1` | `acquisition_source` (opz.) | ridondanza per sessioni; utile se `Utenti` non è popolato in tempo |
| `ROC_Outreach` | *(nessuna)* | già contiene `museo_id`, `email_to`, `timestamp`, `status` |

> ⚠️ Sovrapposizione: la registrazione/sessione è proprio l'area che l'altra sessione sta editando (v4.21.2 magic-link). Le nuove colonne vanno coordinate con quel lavoro (vedi §11).

---

## 6. Motore di calcolo: `getFunnelCompleto()`

**Nuovo file:** `Funnel_v1.js`

**Firma:** `getFunnelCompleto(opts)` dove `opts = {dateFrom, dateTo, source}` (tutti opzionali; default = ultimi 90 giorni, tutte le sorgenti).

**Logica:**
1. Per ogni stadio (§3) conta le entità nel periodo, riusando dove possibile le funzioni esistenti:
   - fronte → estende `getOutreachFunnelMensile()` con il filtro `acquisition_source`;
   - retro → `crm_listLeads({stato})` / logica di `getTrasparenzaData()`.
2. Calcola `rateFromPrev = count[i] / count[i-1]` (0 se denominatore 0).
3. Marca `affidabile = (count[i-1] >= SOGLIA_MIN)` con `SOGLIA_MIN` in `Constants.js` (default 20).
4. Compone le note (es. "tratto outbound su coorte attribuita", "campione insufficiente").

**Output:**
```js
{
  periodo: { from, to },
  stadi: [
    { key:'contattati',  label:'Contattati',  count: N, rateFromPrev: null, affidabile: true },
    { key:'registrati',  label:'Registrati',  count: N, rateFromPrev: 0.18, affidabile: true },
    ...
    { key:'cliente',     label:'Cliente',     count: N, rateFromPrev: 0.05, affidabile: false }
  ],
  note: [ ... ]
}
```

**Gating:** admin-only (`_isCurrentUserAdmin_(token)`), coerente con le altre funzioni privilegiate.

---

## 7. Cruscotto admin (UI)

Nuova tab **"Funnel"** in Impostazioni (`Index.html` + `Styles.html`):
- selettore periodo (ultimi 30/90/365 gg o intervallo);
- imbuto verticale: per ogni stadio una barra con `label`, `count`, e tra una barra e l'altra il `tasso %`;
- badge grigio "dato indicativo — campione insufficiente" quando `affidabile=false`;
- riga di sintesi: conversione end-to-end `contattati → cliente`.

Chiama `getFunnelCompleto()` via `google.script.run`. Nessuna libreria esterna (coerente col vincolo "no CDN").

---

## 8. Onestà statistica

- Sotto `SOGLIA_MIN` il tasso è mostrato ma etichettato non affidabile (niente decisioni su 3 dati).
- Le note esplicitano il metodo di ogni tratto (coorte attribuita vs CRM).
- **Verità da tenere a mente:** lo strumento mostrerà numeri vicini a zero finché non parte una **campagna outreach reale** che genera la coorte. La misura è metà del lavoro; l'altra metà è il traffico (azione operativa, non codice).

---

## 9. Ponte alla validazione economica (Fase 2)

Quando i tassi sono misurati, l'economia si costruisce sopra con questa struttura (i numeri tra `<…>` li fornisce Silvano):

**Input richiesti (Fase 2):**
- `prezzo_medio_consulenza` = `<€ per incarico>`
- `costo_per_contatto` = `<€ o ore × tariffa, per cold mail + analisi gratuita>`
- `capacita_mensile` = `<n. consulenze erogabili al mese da Silvano/Riccardo>`

**Formule:**
```
conversione_totale = Π(tassi di stadio)            // contattati → cliente
clienti_attesi      = contattati × conversione_totale
ricavi_attesi       = clienti_attesi × prezzo_medio_consulenza
CAC                 = (contattati × costo_per_contatto) / clienti_attesi
break_even_contatti = costo_fisso / (conversione_totale × prezzo_medio_consulenza − costo_per_contatto)
tetto_ricavi        = capacita_mensile × prezzo_medio_consulenza   // vincolo di capacità
```

**Domanda a cui risponde:** *a quali tassi e a quale prezzo il modello è sostenibile, e qual è il collo di bottiglia — acquisizione (CAC) o capacità di erogazione?* La Fase 2 produrrà un piccolo modello a scenari (pessimista/atteso/ottimista) su questi parametri.

---

## 10. Ambito escluso (YAGNI, per non gonfiare)

Rinviati a quando i dati lo giustificano:
- snapshot storici giornalieri / serie temporali e analisi di coorte nel tempo;
- attribuzione anche sul tratto interno (Matrix→cliente);
- cattura automatica delle risposte alle cold mail (campo `ROC_Outreach.esito`);
- stadio `sql` discreto (oggi `optin_followup` salta direttamente a `hot`).

---

## 11. Mappa file da toccare

| File | Intervento | Sovrapposizione altra sessione |
|---|---|---|
| `ROC_v1.js` | link tracciato nel corpo email (`roc_buildEmailBatch`) + helper URL | bassa |
| `Sessioni_v1.js` / `Auth.js` | cattura + salvataggio `acquisition_source` alla registrazione | **ALTA** (v4.21.2 magic-link) → coordinare |
| `Index.html` | lettura `src` al landing + tab "Funnel" admin | **ALTA** → coordinare |
| `Funnel_v1.js` *(nuovo)* | `getFunnelCompleto()` | nessuna |
| `Constants.js` | nomi colonne/fogli + `SOGLIA_MIN` | media |
| `Styles.html` | stile imbuto | bassa |

> **Regola operativa:** iniziare da `Funnel_v1.js` (zero conflitti) e dal link in `ROC_v1.js`. Le modifiche a registrazione/`Index.html` vanno fatte **dopo** che il lavoro v4.21.2 è committato, per non collidere.

---

## 12. Piano di test

1. **Dati sintetici:** seedare 2-3 righe `ROC_Outreach` (sent) + utenti in `Utenti` con `AcquisitionSource` coerente + righe `ResponsesMatrix` complete + `CRM_Leads` (hot/cliente).
2. **Conteggi:** `getFunnelCompleto()` ritorna i count attesi per stadio nel periodo.
3. **Tassi:** `rateFromPrev` corretto; denominatore 0 → 0 senza errori.
4. **Affidabilità:** sotto `SOGLIA_MIN` → `affidabile=false`.
5. **Attribuzione:** un utente con `AcquisitionSource="museoX__bandoY"` compare nella coorte di quel bando; un iscritto senza source resta fuori dal tratto outbound.
6. **Periodo:** filtro `dateFrom/dateTo` esclude correttamente fuori-finestra.
7. **Sicurezza:** chiamata anonima → `forbidden`; nessun PII nel payload mostrato fuori admin.

---

## 13. Rischi e punti aperti (da confermare in implementazione, non bloccanti)

1. **L2 "profilato" — dove persiste oggi?** `ProfiloPro_v1.js` risulta `.disabled` nel repo, ma la profilazione progressiva F2 è attiva. Da confermare il foglio/colonna reale prima di contare lo stadio 3.
2. **Bug opt-in lead caldo:** un commit recente (`c07f7ea`) sembra averlo risolto (le chiavi D12.1 sono riconosciute). Verificare che `hot` si popoli davvero, altrimenti lo stadio 5 resta a zero per motivi sbagliati.
3. **Email diversa** tra museo contattato e registrante: mitigata dal token `src`; il fallback per email copre solo i casi di stessa casella.
4. **Volumi bassi** all'avvio: i tassi non saranno significativi finché non parte l'outreach reale.
5. **Coordinamento** con la sessione che edita login/registrazione/`Index.html`.

---

## 14. Roadmap

- **Fase 1 (questa specifica):** `Funnel_v1.js` + link tracciato + cattura provenienza + cruscotto admin → *misura del funnel*.
- **Fase 2:** modello economico a scenari sui tassi misurati → *validazione economica* (richiede gli input di §9).
- **Fase 3 (futura):** serie storiche, attribuzione interna, cattura risposte ROC.
