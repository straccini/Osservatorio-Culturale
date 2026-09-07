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
