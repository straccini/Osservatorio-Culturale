# Sicurezza — intervento del 7 settembre 2026

## Sintesi
Audit dell'intera superficie di funzioni chiamabili dal browser (227 funzioni).
**Buona notizia**: la parte critica è già ben protetta — gestione utenti
(`approveUser`, `deleteUser`, `saveUserStatoRuolo`), moderazione segnalazioni
(`approvaSegnalazione`, `pubblicaSegnalazione`), profili (`removeProfilo`) hanno
tutti i controlli di ruolo (`requireAuth`, `getCurrentUserAuth().isAdmin`,
`_segGetUser_`, `_requireAgentAdmin_`).

Restavano scoperte alcune funzioni di **manutenzione admin**: chiamabili da chiunque
conosca l'URL dell'app (deploy "Chiunque"). Ne ho protette 8, le più pericolose e
sicure da chiudere; le altre hanno chiamanti legittimi interni e restano come backlog.

## Fix applicati (v4.34) — 8 funzioni ora richiedono admin
Ognuna ora rifiuta la chiamata senza token admin valido; il pannello admin passa il
token di sessione, quindi per te continua a funzionare, mentre un chiamante anonimo
viene bloccato. Nessuna di queste è usata dai cron, quindi l'automazione non è toccata.

| Funzione | Rischio chiuso |
|---|---|
| `autoDeleteAllVeryOld` | cancellazione massiva di record |
| `deleteFonteUnified` | eliminazione di una fonte |
| `resetFailFonteV5ByUrl` | azzeramento contatori di una fonte |
| `setupDedupAutoTrigger` | installazione trigger |
| `setupMatrixDimColumns` | modifica struttura fogli |
| `migraUtentiDaTutto` | migrazione/riscrittura utenti |
| `runAllSetupV418` | esecuzione setup completo |
| `runAllSetupV418Status` | lettura stato setup |

## Non toccate di proposito (hanno chiamanti legittimi)
- `saveMailing` → è anche l'iscrizione pubblica alla newsletter (route doPost): NON va
  chiusa all'admin, la userebbero i visitatori.
- `setupNormeSheet`, `setupPubblicazioniSheet` → chiamate in automatico per creare il
  foglio se manca (lazy-init): un lucchetto le romperebbe.
- `deleteSocialFonteById` → esposta anche come route HTTP JSON (doPost) in Codice.js:
  serve un intervento a livello di route, non di funzione.
- `migraBandiAmbito` → chiamata da un wrapper diagnostico.
- `sendAgentEmails` → chiamata dai cron (Digest_routing): per chiuderla senza rompere
  l'automazione serve il pattern "blocca solo se arriva un token non-admin", che però
  non ferma un anonimo senza token. Richiede una scelta di disegno.
- `saveProfilo`, `saveMyAgentiOptIn`, `savePrenotazioneIntent`, `saveSondaggio`,
  `inviaSegnalazione`, `getSegnalazioniPubblicate` → azioni pubbliche/utente per
  disegno (iscrizioni, sondaggi, prenotazioni): corrette così.

## Backlog di sicurezza (da valutare insieme, non urgente)
1. Route HTTP JSON non autenticate in `Codice.js` (doPost): `deleteSocialFonteById`,
   `saveMailing` scrivono senza verifica del chiamante. Serve un token condiviso per le
   route interne. Intervento medio, da fare con calma e test.
2. Funzioni cron+frontend (`sendAgentEmails`, `sendDigestAuto2coorti`,
   `generateDigestQueueAll`): oggi un anonimo senza token può invocarle. Chiuderle
   richiede distinguere "trigger" da "web anonimo" (es. secret interno per i cron).

## Revisione catena Admin Token (richiesta 07/09) — 10 punti

Analisi di `AdminToken_v1.js`, `CurrentUser_v44.js`, `Auth.js`, e dell'iniezione in
`Codice.js` (doGet). Il modello: token statico da 24 caratteri in ScriptProperties
(`oc_admin_token_v1`), accesso via `?adm=TOKEN`, iniettato nella pagina e validato
lato server a ogni chiamata.

| # | Domanda | Esito |
|---|---|---|
| 1 | Il token compare nei log? | Sì, ma **solo nel log dell'editor** (`showAdminToken`/`diagAdminToken`/`generateAdminToken` fanno `Logger.log`), visibile al solo proprietario. Il `[doGet]` logga solo i primi 6 caratteri. Accettabile. |
| 2 | Può finire nella cronologia del browser? | Sì: è nell'URL `?adm=` che si salva come bookmark → resta in cronologia/preferiti. **Rischio inerente al modello a URL.** Mitigato: il sandbox di Google rimuove `?adm` dal frame interno e sposta il token in `sessionStorage`. |
| 3 | Può trapelare via Referer? | Possibile, basso: l'URL esterno `script.google.com/...?adm=` potrebbe finire nell'header Referer verso risorse esterne caricate dalla pagina. I browser moderni tagliano la query cross-origin di default. |
| 4 | Salvato in localStorage/sessionStorage? | In **sessionStorage** (`oc_admin_token`), non localStorage: si cancella alla chiusura della scheda. Scelta corretta. |
| 5 | Passato dal client a ogni chiamata? | Sì, e **validato lato server ogni volta** (`_validateAdminToken_`, stateless). È la parte robusta del disegno. |
| 6 | Chi ha il token può impersonare l'admin per sempre? | Sì, finché non lo si rigenera: **il token non ha scadenza**. Chi lo ottiene (cronologia, bookmark, log) è admin fino a `resetAdminToken`. Da tenere presente. |
| 7 | Esiste scadenza reale o solo della cache? | Solo la sessione cache (24h) scade; **il token in ScriptProperties non scade**. I controlli usano la validazione stateless, quindi la cache è di fatto ininfluente. |
| 8 | `resetAdminToken` invalida subito gli accessi precedenti? | Sì: cancella la proprietà → `_validateAdminToken_` rifiuta immediatamente il vecchio token su tutte le chiamate `google.script.run`. |
| 9 | Si può ottenere il token via `google.script.run`? | **ERA IL BUCO CRITICO — ORA CHIUSO.** `showAdminToken`/`diagAdminToken`/`generateAdminToken` restituivano il token nel valore di ritorno; poiché in Apps Script ogni funzione è invocabile via `google.script.run`, un anonimo poteva chiamarle e leggere il segreto. Ora il token resta **solo nel log dell'editor**, non torna al browser. |
| 10 | Le funzioni admin possono girare senza verifica server indipendente? | I controlli validano il token lato server a ogni chiamata (bene). Le funzioni di manutenzione senza guard sono state affrontate sopra (8 protette). |

**Fix applicati (v4.34):**
- `showAdminToken`, `diagAdminToken`, `generateAdminToken` → non restituiscono più il
  token/URL al chiamante (solo log editor). Chiude l'esfiltrazione via `google.script.run`.
- `resetAdminToken(confirmToken)` → richiede il token corrente come conferma: niente più
  reset anonimo (DoS sull'accesso admin). Recupero se perso: eliminare la proprietà
  `oc_admin_token_v1` dall'editor, poi `generateAdminToken()`.

**Residui accettati (rischio inerente al modello, non risolvibili senza redesign):**
punti 2, 3, 6, 7 — il token vive in un URL e non scade. Mitigazione pratica: non
condividere mai lo screenshot/bookmark con `?adm=`, e rigenerare il token
periodicamente. Un redesign (token a scadenza + rotazione) è un lavoro a parte.

## Le TUE azioni (le uniche che non posso fare io)
Queste vivono fuori dal codice e richiedono te:

1. **Rigenerare il token del bot Telegram** (il più importante). Il token attuale è nel
   codice/proprietà da tempo. Su Telegram:
   - apri **@BotFather** → `/mybots` → scegli il bot → **API Token** → **Revoke current token**
   - copia il nuovo token
   - nell'editor Apps Script → *Impostazioni progetto → Proprietà script*: aggiorna
     **`TELEGRAM_BOT_TOKEN`** e **`TELEGRAM_TOKEN`** col nuovo valore
2. **Password admin/editor più forti**: nelle Proprietà script, `ADMIN_PASSWORD` (oggi
   corta) ed `EDITOR_PASSWORD` — sostituiscile con passphrase lunghe (4+ parole).

*Nota: le 8 funzioni protette si attivano col prossimo deploy. Nessuna modifica alla
produzione o al foglio è stata fatta da questa sessione.*
