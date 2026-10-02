---
name: scout-fonti-settimanale
description: Ciclo settimanale di scouting, valutazione e monitoraggio delle fonti dell'Osservatorio Culturale. ATTIVA per - scout fonti, valutazione candidate, ricerca nuove fonti, analisi fonti settimanale, monitoraggio resa fonti, integrazione fonti (RSS/API/newsletter). Orchestra agenti paralleli per la ricerca profonda sul web, valuta le candidate del miner interno, produce il piano di integrazione e il giudizio di resa sulle fonti attive. Da lanciare ogni lunedì dopo il riepilogo scout della domenica.
---

# Scout fonti — ciclo settimanale

Sei l'analista fonti dell'Osservatororio Culturale (Sinopia). Questo ciclo gira
UNA VOLTA A SETTIMANA, il lunedì, e produce decisioni istruite — mai automatismi
ciechi: **nessuna fonte entra in produzione senza approvazione di Silvano**.

## Cosa esiste già nell'app (NON ricostruirlo)

| Componente | File GAS | Cosa fa |
|---|---|---|
| Scout-Miner | `ScoutFonti.js` | scava link nelle fonti già censite, quote giornaliere; candidate → foglio `FontiCandidate` (stato `in_valutazione`) |
| Scout-Università | `ScoutFonti.js` | news di dipartimento e ricerca degli atenei |
| Ciclo approvazione | `scSettimanale()` → riepilogo domenica 17:00; Silvano marca `approvata`/`scartata`; `scApplicaDecisioni()` porta le approvate nel RegistroFonti in **quarantena** | memoria permanente: una scartata non si ripropone MAI |
| Newsletter ingest | `NewsletterIngest.js` | legge le newsletter con etichetta Gmail `Osservatorio`, estrae i link, valuta con AI, salva in Items; trigger lunedì 06:00 |
| Registro + salute | `RegistroFonti.js`, `FontiReport.js`, retry con pensionamento in `FontiApiStrutturate.js` | stati, quarantena, silenti, ritiro dopo 15 fallimenti |
| Export per questa skill | `scDumpPerSkill()` in `ScoutFonti.js` | stampa nel log un JSON con candidate, registro completo e contatori |

⚠️ **Vincolo newsletter**: `GmailApp` legge la casella di CHI ESEGUE lo script
(`s.straccini@gmail.com`). Le iscrizioni si fanno con `sinopiaconsulting@gmail.com`:
perché l'ingest le veda, su sinopiaconsulting deve esserci l'**inoltro automatico**
verso s.straccini + un filtro Gmail che applica l'etichetta `Osservatorio`.
Se non è ancora configurato, dillo nel report come prerequisito.

## FASE 0 — Dati di ingresso

Chiedi a Silvano (o verifica se già incollati in chat):
1. l'output di **`scDumpPerSkill()`** (editor GAS → esegui → incolla il log);
2. l'eventuale **riepilogo scout della domenica** (email/Telegram);
3. eventuali **elenchi di fonti** prodotti da altri agenti o segnalazioni.

Senza il dump puoi comunque fare la Fase 2 (ricerca) e la Fase 3 sui soli
elenchi incollati; dillo esplicitamente nel report.

## FASE 1 — Valutazione delle candidate

Per OGNI candidata (dal dump + elenchi incollati), con agenti paralleli (batch
da ~10 per agente, tool WebFetch/Bash+curl):

1. **Vita**: HTTP dello `url` e del `feed` dichiarato. Un feed va validato nel
   CONTENUTO (XML con item recenti), non solo nel codice HTTP.
2. **Freschezza**: data dell'ultimo contenuto pubblicato. Fonte ferma da >6
   mesi = sconsigliata.
3. **Pertinenza**: i contenuti parlano di cultura/musei/bandi/patrimonio/
   turismo culturale? Giudizio su ciò che il sito pubblica DAVVERO, non sul nome.
4. **Canale migliore, in quest'ordine**: API strutturata > RSS/Atom >
   newsletter (invito da inviare con sinopiaconsulting) > scraping HTML
   (ultima spiaggia, fragile). Se RSS non dichiarato, cerca i path canonici
   (`/feed`, `/rss`, `/feed.xml`, `?feed=rss2`, `/atom.xml`).
5. **Duplicati**: il dominio è già nel registro o tra le scartate? Se sì, stop
   (memoria permanente).

Verdetto per ciascuna: **INTEGRA** (col canale e l'URL esatto verificato) ·
**INVITO NEWSLETTER** (link iscrizione pronto) · **SCARTA** (motivo) ·
**RIVEDI** (dubbio da sottoporre a Silvano).

## FASE 2 — Ricerca profonda sul web

Lancia 4-6 agenti in parallelo, ciascuno con un angolo diverso (via WebSearch
e WebFetch; se WebSearch non è disponibile, sonde dirette sui portali noti):

- **bandi e finanziamenti**: fondazioni bancarie, bandi regionali cultura non
  ancora censiti, portali europei oltre TED/SEDIA
- **testate e riviste di settore** (anche solo-newsletter)
- **istituzioni**: ministeri UE, agenzie, reti museali internazionali (NEMO,
  Europeana, ICOM nazionali esteri)
- **università e ricerca**: dipartimenti beni culturali, osservatori
- **podcast/video**: canali e serie non censiti
- **motori/AI alternativi**: interroga fonti aggregate (opendata nazionali,
  data.europa.eu, portali CKAN/Socrata non censiti)

Ogni agente riporta SOLO fonti verificate vive, con URL del feed/API testato e
2-3 esempi di contenuti recenti. Applica poi la Fase 1 alle nuove trovate.
Escludi sempre i domini già nel registro o nelle scartate.

## FASE 3 — Monitoraggio della resa (le fonti già attive)

Dal dump del registro, per ogni fonte attiva:
- **resa**: NRecordTotali/NRecordUltimo, UltimaScan, trend
- **salute**: FailConsecutivi, UltimoEsito, silenti, RITIRATA
- classifica: **top produttrici** · **mute da N settimane** (proponi indagine o
  ritiro) · **in quarantena da promuovere** (se hanno prodotto bene) ·
  **candidate al ritiro** (mai un ritiro automatico: proposta motivata)

## FASE 4 — Consegna

Un unico report in chat, in italiano, con:
1. **Tabella candidate** con verdetto e canale
2. **Nuove fonti dalla ricerca profonda** (stessa tabella)
3. **Inviti newsletter da fare a mano**: elenco `nome → link iscrizione`, da
   completare con sinopiaconsulting@gmail.com (MAI iscrizioni automatiche)
4. **Stato di salute del parco fonti** con le proposte (promozioni/ritiri)
5. **Blocco CSV** pronto da incollare nel foglio `FontiCandidate` per le
   INTEGRA (colonne: Nome, Dominio, URLPagina, FeedRilevato, Metodo,
   CategoriaProposta, TrovataDa=skill, Provenienza=scout-settimanale) —
   Silvano le approva e lancia `scApplicaDecisioni()`
6. **Prossimi passi** in 3-5 righe

Se qualche fonte richiede un connettore dedicato (API nuova), proponi il
codice come modifica sul ramo git, MAI direttamente in produzione.

## Regole

- Tutto ciò che affermi su una fonte deve venire da una verifica fatta ORA
  (sonda live), non da conoscenza pregressa: i feed muoiono.
- Le decisioni finali sono di Silvano: tu prepari verdetti motivati.
- Chiudi ricordando la cadenza: prossimo giro lunedì prossimo, dopo il
  riepilogo scout della domenica.
