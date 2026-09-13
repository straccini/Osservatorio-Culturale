# Scheda di rientro — cosa fare di ogni modifica QA dopo `clasp pull`

Il repository è indietro rispetto alla produzione (@980). Le correzioni della QA del
14/08/2026 sono state fatte su un'istantanea del 28/05: **non vanno pushate**, vanno
riapplicate sopra il codice vero, una alla volta, verificando ciascuna.

Questa scheda serve a rendere quel merge meccanico. Ordinata dalla più piccola alla più
grande, così si può fermarsi a qualsiasi punto senza lasciare le cose a metà.

---

## Regola d'ingaggio

```
clasp pull                 # stato reale @980 in locale
git add -A && git commit   # fotografa la produzione: questa e' la baseline vera
# poi, una riga alla volta, la tabella qui sotto
clasp push                 # solo alla fine, dopo aver verificato
```

**Mai `clasp push` prima del pull.** In produzione ci sono 70 endpoint e 5 pagine che
qui non esistono: un push da questo repository li cancellerebbe.

---

## Le modifiche, dalla più piccola in su

### 1 · `Sprint0_Module.js` — `'ITEMS'` → `SH.ITEMS`
**Una riga.** Il foglio si chiama `Items`, `getSheetByName` è case-sensitive, quindi
`_h2c_dumpForLabeling()` non trovava mai il foglio e lanciava eccezione.
**Verifica in produzione**: non possibile (backend non servito).
**Dopo il pull**: cercare `getSheetByName('ITEMS')`. Se c'è ancora, riapplicare. Se non
c'è, è già stato corretto online.
**Rischio**: nullo. È uno strumento manuale da editor.

### 2 · `Bandi_v5.js` — rimossa la coppia morta `enableBandiV5`/`disableBandiV5`
Erano definite due volte nello stesso file; la prima coppia era sovrascritta dalla
seconda e quindi codice morto.
**Dopo il pull**: verificare che le duplicate esistano ancora, poi rimuovere solo la
prima (riga ~413), mai la seconda.
**Rischio**: nullo se si rimuove quella giusta.

### 3 · `Codice.js` — `saveMailing` non accetta più `ruolo` dal client ⭐
**L'unica correzione verificata come ancora pertinente sulla produzione.**
`saveMailing` è un endpoint pubblico di iscrizione alla newsletter e scriveva la colonna
`Ruolo` da `body.ruolo`; `authenticate()` accetta l'email come token e restituisce quel
ruolo. Bastava iscriversi come `admin`.
**Verifica in produzione (fatta)**: `saveMailing` è ancora invocata in 3 punti del
frontend live e **nessuno passa `ruolo`** — quindi forzarlo a `lettore` non rompe nulla
di legittimo, e la falla è plausibilmente ancora aperta.
**Dopo il pull**: applicare per prima. Due punti, ramo creazione e ramo update.
**Rischio**: basso. Da controllare solo che il pannello Utenti non usi `saveMailing` per
promuovere qualcuno — se lo fa, va spostato su un endpoint dedicato con guardia.

### 4 · `Codice.js` — reader del digest
Due difetti: `_doGetReader` cercava `renderDigestReaderPage()`, che non esiste in nessun
file, e `_serveDigestReader` apriva `'DigestReader'` mentre il file è `Digestreader.html`
(case-sensitive). Risultato: la pagina reader da 30 KB non è mai stata servita.
**Verifica in produzione**: non possibile dal frontend (è una rotta `doGet` raggiunta
dalle email, non dall'app).
**Dopo il pull**: verificare se `renderDigestReaderPage` esiste ora. In produzione
`getDigestByTokenPublic` è ancora referenziata, quindi il reader è ancora in uso.
**Rischio**: basso, `_serveDigestReader` ha già una sua pagina di errore.

### 5 · Collisioni di namespace globale GAS ⭐
Il gruppo più importante da rifare, ma **da rilevare di nuovo, non da trasportare**.

In Apps Script tutti i `.gs` condividono un solo scope: quando la stessa funzione è
definita in più file, una sola sopravvive. Nell'istantanea del 28/05 ce n'erano cinque:

| Funzione | File | Effetto |
|---|---|---|
| `_findCol_` | `Identity_v1.js`, `Matrix_digest.js`, `UltimiBandi.js` | firme incompatibili: o il filtro identità torna vuoto, o saltano le liste podcast/video/libri |
| `_xmlText_` | `Bandi_v5.js`, `Codice.js` | il parser RSS dei bandi v5 fallisce e le fonti risultano morte per un bug |
| `_h_` | `Matrix_digest.js`, `Newsletter_v44.js` | escape HTML con set diverso |

Rinominate in `_idFindCol_`, `_mdFindCol_`, `_xmlChildText_`, `_mdH_`.

**La produzione ha più file di questo repo, quindi può avere più collisioni.**
**Dopo il pull**: rilanciare il rilevatore (sotto) sul codice vero e trattare quello che
esce, non questa lista.
**Rischio**: medio — sono rinomine meccaniche ma vanno fatte su tutti i punti di chiamata
insieme, altrimenti si rompe.

### 6 · `Constants.js` e `Sidebar.html` — versioni
Nel repo `OC_VERSION` era `v4.18.63` con la codebase a `v5.1.9`. Allineata, e aggiunto
`OC_DEPLOYMENT_GAS = '@980'`.
**Attenzione**: la produzione dichiara **v4.23.0** nella sidebar — una numerazione che in
git non è mai esistita. Dopo il pull vale quella, non `v5.1.9`.
**Rischio**: nullo, ma se non si corregge dopo il pull si reintroduce confusione.

### 7 · `Telegram_v44.js` — credenziale rimossa dal sorgente
La rimozione dal codice **non chiude nulla da sola**: il token è nella storia git di un
repository pubblico. Va revocato da @BotFather e rigenerato, poi reimpostato con
`setupTelegram('<token>','<chat_id>')` dall'editor GAS.
**Questa azione è indipendente dal pull e va fatta comunque.**

---

## Modifiche ritirate

### `Auth.js` + `Index.html` — wrapper `autoRegisterUser` — **RITIRATA**
Nell'istantanea del 28/05 il modal chiamava `google.script.run._autoRegisterUser_()`, e
le funzioni con underscore finale sono private in Apps Script: la registrazione falliva
sempre. Avevo aggiunto un wrapper pubblico.

**Verificato il 14/08: in produzione quel codice non esiste più.** Il frontend live usa
`registraUtente()` e `loginConEmail()`, endpoint che in questo repository non ci sono. La
correzione era per codice già superato, quindi è stata annullata.

Il difetto resta però documentato: se in futuro ricompare una chiamata a una funzione con
underscore finale da `google.script.run`, è quella la causa.

---

## Documentazione — nessun rischio

`.claspignore` esclude `*.md`, `.claude/**` e `landing-netlify/**`: questi file **non
finiscono mai su GAS**. `QA_2026-08-14.md`, `CLAUDE.md`, `ROADMAP_2026-05.md`, `docs/` e
questa scheda si possono tenere così come sono, prima o dopo il pull, senza conseguenze.

---

## Strumenti da rilanciare sul codice riconciliato

Sono i tre controlli che hanno prodotto i risultati della QA. Vanno rieseguiti dopo il
pull: è quello il controllo che conta.

**Collisioni di namespace globale** — la classe di bug più insidiosa in GAS:

```bash
node -e '
const fs=require("fs"), d=new Map();
for(const f of fs.readdirSync(".").filter(f=>f.endsWith(".js")))
  fs.readFileSync(f,"utf8").split("\n").forEach((l,i)=>{
    const m=/^function\s+([A-Za-z0-9_$]+)\s*\(/.exec(l);
    if(m){ if(!d.has(m[1])) d.set(m[1],[]); d.get(m[1]).push(f+":"+(i+1)); }
  });
let n=0;
for(const [k,v] of [...d].sort()) if(v.length>1){ n++; console.log(k+"  ->  "+v.join("  |  ")); }
console.log(n?("TOTALE: "+n):"nessuna collisione");
'
```

**Sintassi su tutto** — backend e blocchi `<script>` inline:

```bash
for f in *.js; do node --check "$f" || echo "ERRORE $f"; done
```

**Endpoint orfani** — `google.script.run.X()` senza backend corrispondente. Dopo il pull
il conteggio dovrebbe salire da 166 a ~237 e gli orfani devono essere zero: se non lo
sono, sono chiamate rotte nel frontend live.

---

## Ordine consigliato

1. Revocare il token Telegram — indipendente da tutto, fallo subito.
2. `clasp pull` + commit della baseline vera.
3. Rilanciare i tre strumenti sopra e leggere cosa esce.
4. Applicare il punto 3 (`saveMailing`): piccolo, verificato, chiude una falla.
5. Trattare le collisioni che il rilevatore trova sul codice vero.
6. Il resto, in ordine di dimensione crescente.
