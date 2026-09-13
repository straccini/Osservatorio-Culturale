# Osservatorio Culturale — briefing per una nuova conversazione

Copia e incolla questo testo all'inizio di una chat nuova. È autosufficiente: chi legge
non ha nessun ricordo delle conversazioni precedenti.

---

## Contesto

**Osservatorio Culturale** (marchio: Sinopia) — web app in Google Apps Script con frontend
HTML e backend su Google Sheets. Monitora bandi, news, podcast, video, libri per musei e
operatori culturali, e manda newsletter e digest agli iscritti.
Titolare: Silvano Straccini · Duemilamusei.

**Silvano non è uno sviluppatore.** Metodo concordato: le modifiche al codice le scrive
Claude sul repository, lui le porta in produzione con `git pull` + `clasp push` + nuovo
deploy. Niente modifiche a mano nell'editor.

## Coordinate

| | |
|---|---|
| Script ID | `1VXXzcHRB6kv34Dvqfp5p0x1zMzRtDhSDzmf-jsMtiD2hK2U0gG6uaTPx` |
| URL produzione | `https://script.google.com/macros/s/AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs/exec` |
| Repository | `github.com/straccini/Osservatorio-Culturale` |
| Deploy attivo | @983 o superiore (era @982 il 20/08) |
| Cartella locale | `%USERPROFILE%\Desktop\OC-produzione` (creata con `clasp clone` il 20/08) |

**Rami git** — attenzione, `master` è vecchio:

| Ramo | Cosa contiene |
|---|---|
| `sync/produzione-20260820` | **il codice vero**, 132 file, da `clasp clone` del 20/08 |
| `feat/fonti-feed-unificazione` | sviluppo fino al 6 agosto (@941) |
| `master` | fermo al 28 maggio, 56 file — **non usare come riferimento** |

**Mai `clasp push` da `master`**: cancellerebbe metà del progetto.

## Trappole di questo progetto

- **Apps Script ha un unico spazio dei nomi**: tutti i `.gs` condividono lo stesso scope.
  Due file che definiscono la stessa funzione → sopravvive solo quella caricata per ultima
  (ordine alfabetico). È già costato due guasti seri. Controllo:
  ```bash
  node -e 'const fs=require("fs"),d=new Map();for(const f of fs.readdirSync(".").filter(f=>f.endsWith(".js")))fs.readFileSync(f,"utf8").split("\n").forEach((l,i)=>{const m=/^function\s+([A-Za-z0-9_$]+)\s*\(/.exec(l);if(m){if(!d.has(m[1]))d.set(m[1],[]);d.get(m[1]).push(f+":"+(i+1));}});let n=0;for(const[k,v]of[...d].sort())if(v.length>1){n++;console.log(k+"\n   "+v.join("\n   "));}console.log(n?"TOTALE: "+n:"nessuna collisione");'
  ```
- **Le funzioni con underscore finale sono private** e non sono invocabili da
  `google.script.run`.
- **`ScriptApp.getService().getUrl()` restituisce `/dev` quando gira da un trigger**, non
  `/exec`. Usare la costante `ADMTK_PROD_URL` (in `AdminToken_v1.js`).
- **Il progetto ha 87+ proprietà script**: oltre 50 l'editor diventa di sola lettura e si
  modificano solo da codice (`PropertiesService`).
- **Per leggere il codice live senza fare il pull**: nell'editor,
  `Logger.log(nomeFunzione.toString())` stampa il sorgente della versione deployata.

---

## Stato al 20 agosto 2026

### Risolto: la newsletter non partiva da due settimane

Causa: **due file definivano le stesse funzioni della pagina di approvazione**.
`Server_v44_doGet_patch.js` (comparso dopo il 6 agosto) sovrascriveva
`Newsletter_approve.js` imponendo una vecchia implementazione con `<form method="get"
action="">`, il cui submit non tornava mai a `doGet`: la pagina si apriva, il click non
produceva nessuna esecuzione, l'invio non partiva mai.

Rimosso il file duplicato + nuovo deploy. Verificato che la versione live usa
`ADMTK_PROD_URL` e un link assoluto con `target="_top"`.

### Prova finale: lunedì 24 agosto

Il ciclo è pilotato da un unico trigger orario, `CronDispatcher.js`:
venerdì 18:00 `redazionaleVenerdi` crea la bozza · lunedì 10:00 `redazionaleLunedi` manda
la richiesta di autorizzazione su Telegram e via email al superadmin.

Se lunedì il giro funziona senza interventi, il problema è chiuso. Se si blocca di nuovo,
**la prima cosa da guardare è il registro Esecuzioni**: se non compare nessun `doGet` dopo
il click, il problema è di nuovo a monte del server.

---

## Aperto, in ordine di priorità

**1 · Tre collisioni di namespace ancora attive** (su 1.528 funzioni, 7 trovate, 4 risolte):

| Funzione | File | Effetto |
|---|---|---|
| `_findCol_` | `Identity_v1.js:432`, `Matrix_digest.js:468`, `UltimiBandi.js:457` | firme incompatibili (stringa vs array): o il filtro per identità torna vuoto, o saltano le liste podcast/video/libri |
| `_xmlText_` | `Bandi_v5.js:971`, `NewsScanner.js:627` | una opera su Element XmlService, l'altra su stringhe: il parser RSS dei bandi ne risente |
| `_h_` | `Matrix_digest.js:54`, `Newsletter_v44.js:393` | escape HTML con set di caratteri diverso |

Correzione: rinominare le definizioni con un prefisso di modulo e aggiornare tutti i punti
di chiamata di quel file.

**2 · Tetto di 100 mail al giorno.** Iscritti: 12 → 14 → 18 → 24 → 32 → 39 → 45 → 48 → 50,
circa +4 a settimana. Quando si supera, `MailApp` smette di mandare — e per via del punto 3
nessuno se ne accorge. Serve un servizio di invio esterno.

**3 · Errore silenzioso nell'invio.** `sendNewsletterEmail_` (in `Newsletter_v44.js`)
cattura ogni errore per destinatario e ritorna normalmente: un invio parziale risulta
riuscito. Il 19/08 è stato corretto solo il caso «zero mail inviate».

**4 · L'invio gira dentro la richiesta web.** 50 `MailApp.sendEmail` in un `doGet`:
browser appeso, rischio timeout, bozza congelata su `invio_in_corso` (lucchetto senza
scadenza). Andrebbe spezzato: la conferma segna «approvata», un trigger manda a lotti.

**5 · Le bozze stanno nelle proprietà dello script.** Una ventina mai ripulite, tetto di
9 KB per valore. Andrebbero su un foglio con pulizia automatica.

**6 · Sette mittenti indipendenti** — `Newsletter_v44`, `Redazionale_v1`, `Digest_routing`,
`Matrix_digest`, `AgentDigest`, `Editoriale_v1`, `DigestService` — attingono alla stessa
quota senza sapere l'uno dell'altro. 6.470 righe con logica duplicata.

**7 · Ripiego MailingList rotto.** In `sendNewsletterEmail_` il fallback legge `r[0]` come
email e `r[5]` come "attivo", ma lo schema è `ID | Nome | Email | Ruolo | Attivo | …`.
Dormiente finché il foglio `Utenti` risponde.

**8 · Sicurezza, non ancora affrontata.** Token Telegram in chiaro nella storia git di un
repository pubblico (da revocare da @BotFather; esistono due proprietà,
`TELEGRAM_BOT_TOKEN` e `TELEGRAM_TOKEN`). `ADMIN_PASSWORD` di 4 caratteri e
`EDITOR_PASSWORD` di 6 cifre, confrontate direttamente col token su endpoint pubblico.
~45 endpoint di scrittura senza guardia server-side.

**9 · Fonti.** Sondaggio del 14/08: 133 URL non funzionanti su 436 (30%), di cui 20 con
certificato TLS non valido — fra questi `icom-italia.org`, presente in 5 punti.

---

## Documenti nel repository

- `docs/RIPRESA-2026-08-20.md` — ricostruzione dettagliata del guasto newsletter
- `QA_2026-08-14.md` — verifica completa: 21 difetti, fonti, versioni
- `docs/MERGE-DOPO-CLASP-PULL.md` — scheda delle correzioni del 19/08
- `AUDIT_2026-05-14.md` — audit precedente

**Nota**: `QA_2026-08-14.md` e `CLAUDE.md` contengono un'affermazione ormai superata —
dicono che 70 funzioni «non erano mai state committate in git». Erano su
`feat/fonti-feed-unificazione`, ramo non scaricato al momento di quell'analisi.
