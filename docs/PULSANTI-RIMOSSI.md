# Pulsanti tolti dal pannello admin — e come si eseguono lo stesso

Togliere un pulsante **non cancella la funzione**: resta nel progetto e si può lanciare
dall'editor Apps Script (Editor → tendina delle funzioni → Esegui). Qui c'è la memoria di
cosa è stato tolto e come richiamarlo.

---

## Rimossi il 20/08/2026 — erano rotti

Chiamavano funzioni backend **che non esistono in nessuno dei 114 file**: cliccarli non
faceva niente, o dava un errore di rete.

| Pulsante | Dove | Chiamava | Stato |
|---|---|---|---|
| «Bonifica» | Salute fonti | `bonificaFontiNonCultura()` | ❌ funzione inesistente |
| «🔍 Verifica rilevamento profilati» | Digest profilati | `getDiagnosiCoorti()` | ❌ funzione inesistente |
| «Prova di invio» + campo email | Digest profilati | `testDigestProfilatoUI()` | ❌ funzione inesistente |

Le funzioni JS lato pagina (`bonificaFonti`, `verificaProfilati`, `testDigestProfilatoInvio`)
sono rimaste nel file ma non sono più raggiungibili. Se un giorno il backend viene scritto,
basta rimettere il pulsante.

---

## Da decidere — 37 comandi da strumento occasionale ancora nel pannello

Li ho trovati e classificati, ma **la scelta è di Silvano**: dal codice non si vede quali
siano ancora in uso. Dimmi quali togliere e lo faccio.

### Consiglio di togliere — una tantum già eseguite

Migrazioni e popolamenti iniziali. Rieseguirli per sbaglio nella migliore delle ipotesi non
fa nulla, nella peggiore sovrascrive dati.

| Comando | Cosa faceva |
|---|---|
| `migraUtentiDaTutto` | migrazione MailingList + ContactsMatrix → foglio Utenti |
| `migraBandiAmbito` | assegnazione ambito ai bandi esistenti |
| `migrateAllSheetsToFU17` | migrazione schema fonti a 17 colonne |
| `popolaProfiloAgentiDaMatrix` | popolamento iniziale ProfiloAgenti |
| `seedFontiPodcastRSS` | seed fonti podcast |
| `seedSocialFontiIstituzionali` | seed fonti social |
| `setupNormeSheet` · `setupPubblicazioniSheet` · `setupMatrixDimColumns` · `setupSocialQueue` · `setupSocialCredentials` | creazione fogli e colonne |
| `runAllSetupV418` | setup completo v4.18 |
| `runSinopiaFix` | correzione una tantum |
| `importTsvToSheet` | ⚠️ **il più pericoloso**: fa `sh.clear()` su un foglio arbitrario prima di importare |

### Consiglio di togliere — creano trigger che ora confliggono

⚠️ Punto importante. I trigger sono stati consolidati in **un unico dispatcher orario**
(`CronDispatcher.js`, giugno 2026) proprio perché Apps Script ne ammette al massimo 20 per
progetto. Questi pulsanti installano trigger singoli: premerli oggi **crea doppioni** che
girano in parallelo al dispatcher.

`setupDedupAutoTrigger` · `setupMatrixDigestTrigger` · `setupQualityCheckBandiTrigger` ·
`setupSocialTrigger` · `setupWeeklyNewsletterAuthTrigger`

### Consiglio di tenere — diagnostica ricorrente

Servono a guardare lo stato senza modificare niente.

`testApiConnessione` · `diagnosticaAgenti` · `runAllSetupV418Status` · `debugAuth`

### Consiglio di tenere — manutenzione ricorrente

`cleanupBandiV5Scaduti` · `dedupItemsByFingerprint` · `dedupTuttiIFogli` ·
`resetFailFonteV5ByUrl` · `resetChiSiamoContent`

### Da decidere insieme — prove di invio

Mandano email vere. Utili prima di un invio reale, ma consumano quota giornaliera (tetto
100/giorno, lista a 50 iscritti): ogni prova toglie spazio all'invio della newsletter.

`testInviaDigestGeneralista` · `testInviaDigestMatrix` · `testInviaDigestHeader` ·
`testDigestInviaAdmin` · `testDigestMatrixForEmail` · `testGenerateDigestSegmentato` ·
`testEmailAgentiAdmin` · `testCronGenerateDigestWeekly` · `testMagicLinkE2E` ·
`testMatrixTagger`

---

## Come lanciare a mano una funzione tolta dal pannello

1. Editor Apps Script → icona `< >` a sinistra
2. Apri il file che la contiene (o creane uno temporaneo con un richiamo)
3. Selezionala nella tendina in alto → **Esegui**
4. Il risultato compare nel **Log di esecuzione** in basso

Se non compare nella tendina, il file non è stato salvato: **Ctrl+S** e riprova.

---

## Nota di metodo

Il markup dei pulsanti è generato dentro stringhe JavaScript, non è HTML statico: toglierne
molti a colpi di ricerca-e-sostituzione su un file da 660 KB è rischioso. Vanno fatti a
mano, pochi per volta, verificando ogni volta che i `<div>` restino bilanciati e che i
blocchi `<script>` continuino a compilare.
