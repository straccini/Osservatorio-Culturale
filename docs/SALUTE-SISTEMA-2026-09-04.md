# Salute del sistema — verifica del 4 settembre 2026

*Verifica dal vivo su produzione: app web, foglio dati aggiornato a oggi, casella Gmail,
feed Gazzetta Ufficiale, Routine cloud. Completa l'analisi delle newsletter
(`docs/NEWSLETTER-MATRIX-PROFILATI.md`) con i riscontri reali.*

---

## 1. Semaforo generale

| Componente | Stato | Evidenza |
|---|---|---|
| App web | 🟢 attiva | HTTP 200, pagina completa servita |
| Newsletter generalista (lunedì) | 🟢 funziona | 31/08 ore 9:01, mittente **sinopiaconsulting@gmail.com** ✓, invii a tutta la MailingList |
| Digest profilati (martedì) | 🟡 funziona con difetti | 01/09: 5 invii (1 Matrix + 4 fallback) — ma **partiti da s.straccini@gmail.com**, non dall'alias; e 1 caso provato di **doppio invio** lun+mar allo stesso lettore |
| Bozze Matrix domenicali | 🔴 ramo morto | 36 bozze `draft` accumulate da luglio (4/settimana), ultimo invio dalla coda: maggio |
| Trend / notizia in evidenza | 🔴 in attesa di deploy | nessuna proposta dal 10/08; la correzione del 27/08 (parsing date) non è in produzione |
| **Lavoro cultura (GU S4)** | 🔴 mai funzionato | **18 scansioni su 18 a "0 nuovi salvati" dall'attivazione (15/07)** — diagnosi e correzione sotto |
| Scout fonti (Routine lunedì) | 🟢 funziona | run 31/08 06:17→06:23 SUCCEEDED; prossimo 07/09 |
| Auto-applica decisioni scout | 🔴 in attesa di deploy | `scApplicaDecisioni` nel dispatcher è nel pacchetto non ancora deployato |
| Fonti news | 🟢 flusso vivo | 60–90 contenuti/giorno acquisiti nell'ultima settimana |

**Il collo di bottiglia unico è il deploy**: 6 commit pronti (trend, scout, lavoro) aspettano
`.\deploy.ps1` dal 25/08.

## 2. Lavoro cultura — la diagnosi che chiedevi

Il tuo sospetto era fondato, con una precisazione: i concorsi **non vengono trovati e poi
scartati come "non pertinenti" — non vengono mai trovati**. Dall'attivazione del 15 luglio,
tutte le 18 email "[OC] Lavoro Cultura" dicono `0 nuovi salvati (L1 ente: 0 · L2 professione: 0)`
su feed di 50–86 concorsi a numero. Tre cause, verificate dal vivo sul feed GU di oggi:

1. **Il tetto delle verifiche tagliava proprio i comuni.** Il filtro L2 apre fino a 40
   pagine di dettaglio *nell'ordine del feed*, che in Gazzetta è: ministeri → decine di
   istituti CNR (quasi mai culturali) → università → **enti locali in coda**. Il budget si
   esauriva sul CNR e i comuni — i datori di lavoro culturali più frequenti (istruttori
   culturali, bibliotecari) — finivano sistematicamente "oltre cap", mai verificati.
   → **Corretto**: ora le pagine si verificano in ordine di priorità culturale
   (comuni/fondazioni prima, CNR per ultimo). Test sul feed di oggi: con il nuovo ordine
   gli 8 esclusi dal tetto sono tutti istituti CNR.
2. **La pagina di dettaglio GU contiene solo l'abstract di una riga** (verificato: ~14 KB,
   niente testo integrale). Il match di professione può scattare solo se il profilo è
   nell'abstract — per i comuni di solito c'è ("un posto di istruttore direttivo area
   cultura"), per altri enti no. Limite strutturale noto, mitigato dal punto 1.
3. **Scarsità reale**: interi numeri GU senza enti culturali in intestazione sono normali
   (nel numero di oggi: zero). Il problema era la combinazione con il punto 1.

**Errore inverso trovato e corretto**: tre bandi CER della Regione Puglia ("Avviso per la
selezione di proposte progettuali…") erano classificati `lavoro` e finivano nella pagina
concorsi. Il classificatore ora distingue la selezione *di cose* (proposte, progetti,
partner, sponsor → non lavoro) dalla selezione *di persone* (8/8 casi di collaudo passati,
compreso il direttore della Fondazione Marche Cultura che resta `lavoro`).

Le email dei mercoledì/sabato erano quindi **oneste** ("0 salvati" era vero): il difetto
stava nella scansione, non nel report.

## 3. Newsletter — riscontri dal vivo (integrano il dossier)

- **P2 confermato con i numeri**: la coda DigestQueue accumula 4 bozze Matrix ogni domenica
  da luglio (36 righe `draft`), che nessuno invia perché il martedì il sistema rigenera e
  invia direttamente. Da decidere: opzione B del dossier (eliminare la doppia generazione).
- **P5 confermato dal vivo**: i digest del martedì partono da `s.straccini@gmail.com`
  (GmailApp senza `from`); la generalista del lunedì parte correttamente dall'alias.
- **Sovrapposizione lun/mar provata**: almeno un lettore (in MailingList *e* fra i lead) ha
  ricevuto sia la newsletter del 31/08 sia il digest fallback dell'1/09 con contenuti
  sovrapponibili. Il registro anti-duplicato non copre la newsletter generalista.
- **3 disiscrizioni il 31/08** subito dopo la newsletter (fra cui un contatto del Comune di
  Pesaro). Con ~50 iscritti, 3 in un giorno è un segnale da guardare: probabile effetto del
  doppio invio o della frequenza percepita.

## 4. Cosa serve da te

1. **Deploy** (5 minuti, sblocca tutto): `.\deploy.ps1 -Descrizione "v4.33 trend+scout+lavoro"`.
   Attiva: trend riparato + box home + autopilota martedì, auto-applica scout,
   correzioni lavoro. Dopo il deploy, il collaudo trend: apri
   `[URL app]?trend=proponi&rinnova=sinopia2026` → deve arrivare la proposta su Telegram.
2. **Lavoro**: la prossima scansione utile è sabato 06/09 ore 8. Se anche con la correzione
   resta a zero per 2–3 numeri, il passo successivo è aggiungere una fonte complementare
   (es. portale inPA via scraping mirato) — decidiamo dopo l'osservazione.
3. **Decisioni aperte** (dal dossier newsletter): destino della coda DigestQueue (consiglio
   opzione B), mittente unico per i profilati, fallback tematico onesto.

*Nessuna modifica al foglio dati o alla produzione è stata fatta da questa verifica:
solo letture e correzioni al codice nel repository.*
