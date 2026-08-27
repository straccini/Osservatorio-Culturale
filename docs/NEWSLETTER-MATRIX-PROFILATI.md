# Newsletter Matrix e Profilati — come funzionano davvero

*Analisi del 27/08/2026 sul codice di produzione (branch `fix/collisioni-namespace`).*
*Scopo: descrizione dettagliata di tutto il sistema per capire come migliorarlo.*

---

## 1. La mappa generale: chi riceve cosa e quando

Nel sistema convivono **tre newsletter diverse** che condividono contenuti e registri:

| Newsletter | Destinatari | Contenuto | Quando parte | Come parte |
|---|---|---|---|---|
| **Generalista** (quella che approvi da Telegram) | MailingList (Attivo=true), ~50 iscritti | Editoriale + bandi 8 + news 6 + podcast/video (mix 2 ita:1 estero, editoriale troncato con "Continua") | Bozza generata ven 18:00 e lun 10:00 (redazionale); invio dopo TUA approvazione | `adminGenerateDigestDraft` → link Telegram → `adminConfirmSendWithToken` → `sendNewsletterEmail_` |
| **Matrix** (personalizzata) | Chi ha compilato il questionario MuseMu Matrix (ContactsMatrix) E ha `OptInMatrix=true` nel foglio Utenti | Digest costruito sui **3 gap peggiori** del suo museo (dimensioni D1–D10): per ogni gap fino a 4 bandi + 3 news + 2 podcast taggati su quella dimensione | Bozze: domenica 18:00. Invio diretto Coorte B: martedì 07:30 | `cronGenerateDigestWeekly` (bozze in DigestQueue) + `sendDigestProfilatiMartedi` (invio diretto) |
| **Profilati / 2 coorti** | Coorte A = MailingList meno chi è in B. Coorte B = "lead caldi": sessioni attive con email (Sessioni_v1) + richieste di consulenza (RichiestePrenotazione) | A: digest standard arricchito con gli ambiti scelti dai chip dell'area personale. B: tre layout in cascata — Matrix personalizzato, tematico (T1–T9), fallback standard | A: **manuale** (dal v4.24 nessun trigger la invia). B: martedì 07:30 | `sendDigestAuto2coorti` |

Punto chiave da capire subito: **"Matrix" e "Profilati" non sono due sistemi separati**. Il martedì
`sendDigestProfilatiMartedi` chiama `sendDigestAuto2coorti({onlyLead:true})`, che per ogni lead della
Coorte B prova prima il layout Matrix (`generateDigestForUser`), poi il tematico, poi il fallback.
La newsletter Matrix è quindi il "layout 1" del flusso profilati, più una coda di bozze
(DigestQueue) generata la domenica che l'admin può inviare a mano dal pannello.

---

## 2. Il flusso Matrix nel dettaglio (`Matrix_digest.js`)

### 2.1 Da dove nasce la personalizzazione

1. L'utente compila il questionario **MuseMu Matrix**: le risposte finiscono in `ResponsesMatrix`
   (profilo + punteggi per 10 dimensioni D1–D10), il contatto in `ContactsMatrix`
   (`response_id`, `email`, `preferences_json`, consenso).
2. `getMatrixReport(responseId)` calcola il report e le `top3Opportunities`: le 3 dimensioni
   con punteggio più basso (i "gap" del museo).
3. Ogni contenuto del sistema (bandi, news, podcast) viene taggato da `Matrix_tagger` con la
   colonna **MatrixDim** ("D3,D7" ecc.). È questo tag che rende possibile il filtro.

### 2.2 Composizione del digest (`generateDigestForUser`, riga 77)

Per ciascuna delle 3 dimensioni-gap:
- **bandi**: query di 6 candidati taggati su quella dim → tiene i primi 4;
- **news**: 5 candidati → primi 3;
- **podcast**: 4 candidati → primi 2.

Su questi passano quattro filtri in serie:
1. **dedup esatto cross-dimensione** (stesso titolo non appare in due sezioni);
2. **`ddTipoCoerente`** (solo bandi che sono davvero bandi);
3. **`ddFilterNotSent('matrix', …)`** — registro anti-ripetizione DigestInviati: mai riproporre
   alla coorte matrix un contenuto già uscito;
4. **dedup fuzzy sui titoli** (`_dedupFuzzyByTitle_`): titoli quasi uguali → ne resta uno.

Se richiesto (`includeAgentContent:true`, cioè l'invio del martedì), aggiunge i contenuti degli
agenti tematici (`getAllAgentContentForUser`) deduplicati contro i contenuti Matrix.
Nota: con gli agenti AG1–AG5 sospesi (`OC_AGENTI_ATTIVI` ≠ true, v4.28.2) questa sezione è
di fatto sempre vuota.

L'HTML è composto da `_buildDigestSegmentatoHtml_` (oggetto: `[Personalizzato] Aggiornamenti per
<museo> — data`). Alla generazione con salvataggio (o all'invio diretto del martedì) i contenuti
mostrati vengono registrati con `ddMarkSent('matrix', …)` — così la settimana dopo non si ripetono.

### 2.3 La coda bozze (DigestQueue)

`generateDigestQueueAll` (riga 230) scorre ContactsMatrix e genera una bozza per ogni contatto che:
- ha email + response_id;
- ha **`OptInMatrix=true` nel foglio Utenti** (via `getUtentiPerOptIn('matrix')`, `Auth.js:1132` —
  se il foglio Utenti è vuoto il filtro si disattiva e passano tutti);
- non ha già una bozza `draft` degli ultimi 6 giorni (idempotenza settimanale).

Le bozze restano in stato `draft` in DigestQueue. L'invio è manuale dal pannello admin
(`sendQueuedDigest` singolo o `sendAllPendingDigest` in blocco, quest'ultimo con token admin
obbligatorio). L'invio dalla coda usa **MailApp** con mittente "Osservatorio Culturale · MuseMu
Matrix" e `replyTo: sinopiaconsulting@gmail.com`.

### 2.4 Il cron della domenica (`cronGenerateDigestWeekly`, riga 846)

Domenica 18:00 (trigger in `SetupMaster.js`, nonostante le costanti nel file dicano ancora
"martedì 06:00" — vale il trigger installato):
1. genera tutte le bozze segmentate Matrix (`generateDigestQueueAll`);
2. genera la bozza **generalista** (`adminGenerateDigestDraft` con 8 bandi / 6 news / 3 podcast);
3. ti manda su Telegram "*Digest weekly · bozze pronte*… Apri il pannello admin per revisione e invio";
4. salva timestamp+esito in ScriptProperties (`OC_DIGEST_LAST_RUN` / `OC_DIGEST_LAST_RESULT`).

**Non invia nulla**: l'invio resta un atto manuale tuo (per il generalista, il solito giro Telegram).

---

## 3. Il flusso Profilati nel dettaglio (`Digest_routing.js`)

### 3.1 Come si formano le due coorti (`getDigestRecipientsByCohort`, riga 61)

**Coorte B ("lead caldi")** — unione di:
- `Sessioni_v1`: chiunque abbia una sessione con email non revocata. Il campo `source`
  determina il segmento: `matrix` o `sondaggio_*` → segmento matrix, il resto → ordinario;
- `RichiestePrenotazione`: chi ha chiesto una consulenza (stati attivi: nuovo/caldo/contattato),
  porta con sé la **tematica** (T1–T9, PRE_BANDO) e il nome del museo;
- arricchimento da `ContactsMatrix`: se l'email ha un response_id, il lead diventa
  "matrixCompletato" (prende il response_id più recente);
- lead score dal CRM (`crm_getLeadScore`), usato per gli alert Telegram "lead caldo" (soglia 30).

**Coorte A ("generalisti")** = MailingList attivi **meno** chi è già in B (mai doppio invio).
Dal v4.24 ogni generalista viene arricchito con gli **ambiti di interesse**: fonte primaria il
foglio `ProfiliPro` (colonna `interessi_dimensioni`, cioè i chip che il lettore accende nella sua
area), fallback `ContactsMatrix.preferences_json.dimensioni`.

### 3.2 L'invio a 2 coorti (`sendDigestAuto2coorti`, riga 245)

Protezioni in testa: lock anti-concorrenza (LockService), quota email < 10 → abort.

Contenuto news: prende gli Items con flag `InclusiNelDigest`, applica `ddFilterNotSent('generalista')`
(anti-ripetizione, registro **condiviso con la newsletter che approvi da Telegram**) e
`ddCapPerFonte(2)` (max 2 pezzi per testata). Dal v4.28.33 il digest parte anche con zero news
purché bandi/norme/podcast/video/libri abbiano contenuto ("il digest non è fatto solo di news").

**Coorte A** (solo se invocata senza `onlyLead`, quindi oggi solo a mano): per ogni destinatario
crea/riusa un token lettore (`_getOrCreateToken`) e un link "leggi nell'app", costruisce
`buildDigestHTML` con i suoi ambiti, invia via **GmailApp** come "Sinopia · Osservatorio Culturale".

**Coorte B** (il martedì): cascata a tre layout per ogni lead —
1. *Matrix*: se `matrixCompletato` + response_id → `generateDigestForUser(email, rid, {save:false,
   markSent:true, includeAgentContent:true})`. Oggetto: "Sinopia · Il tuo digest personalizzato…".
2. *Tematico*: se ha una tematica → `buildTematicDigest` (riga 494): filtra gli items sulle
   keyword della tematica (es. T2 = inclusione/accessibilità/LIS/CAA…), aggiunge fino a 5 bandi
   dal Radar che matchano le stesse keyword, CTA verso l'area Sinopia.
   **Se nessun item matcha le keyword, manda comunque i primi 8 items qualsiasi** (fallback interno).
3. *Fallback*: `buildDigestHTML` standard con l'oggetto generalista.

Dopo ogni invio B: `crm_recordEvent(+1pt digest_sent)`, eventuale alert Telegram lead caldo,
e registrazione nel registro anti-duplicato.

### 3.3 Il trigger del martedì (`sendDigestProfilatiMartedi`, riga 738)

Gira **ogni giorno** alle 07:30 ma:
- solo il **martedì** (getDay()===2) invia la Coorte B;
- gli altri giorni farebbe le email agenti — che però sono **sospese** dal v4.28.2
  (`OC_AGENTI_ATTIVI` ≠ true), quindi di fatto 6 giorni su 7 il trigger fa solo il check
  del social draft (`generateNextSocialDraft`, cooldown interno 44h).

### 3.4 Anti-duplicato tra sistemi

Doppio livello:
- **per persona** — `DigestSentLog` (`_digestWasRecentlySent_`, riga 997): nessuno riceve due
  digest di qualunque tipo entro **5 giorni** (`OC_DIGEST_DEDUP_DAYS`, Constants.js:176).
  Vi scrivono coorti, Matrix, agenti e outreach. È il motivo per cui A lunedì e B martedì
  non si pestano i piedi;
- **per contenuto** — registro `DigestInviati` con coorti separate (`generalista` / `matrix` /
  `profilati`): un contenuto uscito per una coorte non le viene riproposto (pulizia mensile
  righe >180gg via `ddPrune`).

### 3.5 Opt-in e preferenze (`ProfiloPro_v1.js`)

- `saveProfilo` / `setAmbitoInteresse` (i chip dell'area personale) scrivono
  `interessi_dimensioni` in `ProfiliPro` e sincronizzano `ContactsMatrix.preferences_json.dimensioni`
  (`_proSyncOptIn_`, riga 282).
- Questi interessi guidano **la Coorte A** (sezioni ambiti nel digest standard) — non il layout
  Matrix, che si basa solo sui gap del questionario.
- L'opt-in alle bozze Matrix è invece la colonna `OptInMatrix` del foglio **Utenti**.
- Footer email: link unsubscribe (`_digestUnsubFooter_`) + "Modifica le tue preferenze" → area profilo.

---

## 4. Punti deboli individuati

**P1 — La Coorte A è orfana.** Dal v4.24 `sendDigestAuto2coorti` per i generalisti è "manuale
(lunedì)": nessun trigger la chiama. In pratica i generalisti ricevono solo la newsletter che
approvi da Telegram — il che va bene (evita doppioni), ma allora il ramo Coorte A è codice morto
che confonde: due pipeline generaliste (`buildDigestHTML` vs la newsletter di `Admin_v44`) con
due template diversi e due punti di manutenzione.

**P2 — DigestQueue: bozze generate ma invio incerto.** La domenica nascono le bozze Matrix in
coda "per revisione e invio manuale", ma il martedì la Coorte B viene **rigenerata e inviata
direttamente** (`save:false`), ignorando la coda. Le bozze della domenica restano quindi `draft`
per sempre (a meno di invio manuale dal pannello) e il loro unico effetto reale è il conteggio
nel messaggio Telegram. Doppio lavoro di generazione + una coda che cresce senza scopo.

**P3 — Chi ha compilato Matrix ma non ha sessione attiva non riceve nulla in automatico.**
L'invio del martedì parte da `Sessioni_v1`/`RichiestePrenotazione`; ContactsMatrix serve solo ad
arricchire. Un compilatore Matrix la cui sessione è scaduta/revocata e che non ha mai prenotato
è raggiungibile solo dalla coda manuale (P2). Rischio: i profilati "storici" si perdono.

**P4 — Fallback tematico troppo generoso.** In `buildTematicDigest`, se zero items matchano la
tematica si mandano "i primi 8 qualsiasi" con oggetto "N contenuti su [tematica]" — email che
promette pertinenza e non la mantiene. Meglio saltare l'invio (o degradare a oggetto generalista).

**P5 — Due mittenti e due canali di invio.** Coda Matrix → MailApp, nome "MuseMu Matrix";
coorti → GmailApp, nome "Sinopia · Osservatorio Culturale"; newsletter generalista → alias
sinopiaconsulting@gmail.com. Il lettore profilato può ricevere email dallo stesso progetto con
mittenti diversi. Da uniformare sull'alias ufficiale come già fatto per la generalista.

**P6 — Sezione agenti annunciata ma vuota.** `includeAgentContent:true` è sempre attivo il
martedì, ma con AG1–AG5 sospesi non produce nulla. Si lega alla decisione aperta
"reinstate/dismiss agenti": finché non si decide, è un ramo in più da eseguire per niente.

**P7 — Incoerenze di documentazione interna.** Le costanti di `Matrix_digest.js` dicono
"martedì 06:00", il trigger vero è domenica 18:00; l'intestazione di `Digest_routing.js` dice
"cron lunedì 07:00" ma quel trigger non esiste più. Chi legge il codice (o una futura sessione
di lavoro) viene fuorviato.

**P8 — Nessuna misura di efficacia.** Non c'è traccia di aperture/click (comprensibile senza
tracking), ma nemmeno un contatore semplice di ritorni: quanti destinatari B cliccano "Apri la
tua area Sinopia"? Il token lettore della Coorte A esiste già (`?reader=1&t=`), quindi
l'infrastruttura minima per contare i rientri c'è.

## 5. Proposte di miglioramento (in ordine di resa/sforzo)

1. **Decidere il destino della coda DigestQueue** (P2+P3, la scelta più importante):
   - *Opzione A — coda come unica via*: la domenica genera, il martedì **invia la coda**
     (non rigenera). Ti dà la revisione vera che il messaggio Telegram promette e recupera i
     profilati senza sessione attiva.
   - *Opzione B — invio diretto come unica via*: si smette di generare bozze la domenica
     (solo la generalista) e il martedì l'invio diretto pesca **anche da ContactsMatrix**
     (non solo da Sessioni_v1), così i compilatori storici rientrano.
   In entrambi i casi sparisce il doppio lavoro. Consiglio la B: meno passaggi manuali,
   coerente con "mi comunichi solo gli esiti".
2. **Spegnere il ramo Coorte A o dichiararlo ufficialmente morto** (P1): rimuovere il ramo
   dal codice o segnare nel codice/documentazione che la generalista viaggia solo via
   newsletter approvata. Evita che un futuro trigger la riaccenda creando doppioni.
3. **Fallback tematico onesto** (P4): se zero match, skip dell'invio per quel lead (riceverà
   comunque la generalista se è in MailingList) oppure oggetto neutro senza promessa tematica.
4. **Mittente unico** (P5): portare coda Matrix e coorti sullo stesso alias
   sinopiaconsulting@gmail.com già verificato, stesso nome mittente "Sinopia · Osservatorio
   Culturale".
5. **Ramo agenti dietro la decisione** (P6): quando deciderai su AG1–AG5, o si riattiva
   `OC_AGENTI_ATTIVI` o si toglie `includeAgentContent` dal martedì.
6. **Contatore rientri** (P8): estendere il token lettore anche alla Coorte B/Matrix e loggare
   gli accessi `?reader=1` — un numero a settimana nel report Telegram ("X lettori hanno aperto
   l'area dopo il digest") basta per capire se la personalizzazione rende.
7. **Allineare i commenti/costanti ai trigger reali** (P7): pura igiene, 10 minuti.

Nessuna di queste modifiche è stata applicata: questo documento è la base per decidere.
