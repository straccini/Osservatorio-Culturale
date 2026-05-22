# Landing Netlify — sinopia.netlify.app → app.sinopiaconsulting.it

Pagina di benvenuto + redirect alla webapp Google Apps Script. Risolve 3 problemi:
1. URL produzione GAS lungo e illegible → adesso `sinopia.netlify.app` (e in futuro `app.sinopiaconsulting.it`)
2. SEO (Google scansiona questo HTML statico, non la webapp GAS)
3. Brand consistency (testata, meta tags, JSON-LD)

## ✅ Stato attuale (2026-05-15)

- **Account Netlify**: creato
- **Deploy iniziale**: ✓ caricata cartella `landing-netlify/`
- **Nome sito**: `sinopia` (rinominato da `profound-pika-4e0fa2`)
- **URL pubblico provvisorio**: https://sinopia.netlify.app
- **Dominio custom `app.sinopiaconsulting.it`**: ⏳ da configurare quando avremo accesso al pannello DNS del registrar

## Cosa fa

- Mostra una landing minimal brandizzata Sinopia
- Dopo 0,8 secondi fa redirect alla webapp GAS preservando la query string (magic-link `?t=TOKEN` funziona)
- Bot SEO (Google, Bing) NON vengono reindirizzati → leggono i meta tags e indicizzano la pagina
- `_redirects` Netlify: catch-all per sottopath inattesi

## Setup passo-passo (solo prima volta)

### 1. Crea account Netlify (gratis)
- Vai su https://www.netlify.com → Sign up con Google
- Piano Free è sufficiente (100 GB bandwidth/mese, build illimitate)

### 2. Deploy della cartella

**Opzione A — Drag&drop (più veloce, 30 sec)**:
- Netlify dashboard → **Sites** → trascina questa cartella `landing-netlify/` nel box "Want to deploy a new site without connecting to Git?"
- Netlify assegna un sottodominio temporaneo tipo `peaceful-otter-abc123.netlify.app`
- Apri quel URL per verificare che funzioni: vedi la landing → dopo 0,8s redirect alla webapp GAS

**Opzione B — Connetti a GitHub**:
- Più complesso ma redeploy automatico ad ogni push
- Crea repo `sinopia-landing` su GitHub con questa cartella
- Netlify → New site from Git → connetti repo

### 3. Configura dominio personalizzato `app.sinopiaconsulting.it`

In Netlify:
- Sito appena creato → **Domain management** → **Add custom domain**
- Inserisci: `app.sinopiaconsulting.it`
- Netlify ti dirà di creare un record DNS

Nel **pannello DNS** di sinopiaconsulting.it (registrar dove hai comprato il dominio — Aruba/Register/altri):
- Aggiungi un record **CNAME**:
  - **Nome**: `app`
  - **Valore/Target**: `<il sottodominio Netlify che ti ha assegnato>` (es. `peaceful-otter-abc123.netlify.app`)
  - **TTL**: 3600 (1h) o default

Aspetta la propagazione DNS (di solito 5-30 min, max 24h).

### 4. HTTPS automatico
Netlify installa automaticamente un certificato SSL Let's Encrypt sul tuo dominio personalizzato — non devi fare nulla. Aspetta 1-5 minuti dopo che il DNS si è propagato.

### 5. Test finale
Apri `https://app.sinopiaconsulting.it` → dovrebbe:
1. Mostrare la landing Sinopia per 0,8 secondi
2. Reindirizzare alla webapp GAS
3. Per test magic-link: `https://app.sinopiaconsulting.it/?t=TOKEN_REALE` → preserva `?t=` nel redirect

## Aggiornamenti landing

Se modifichi `index.html` localmente, fai redeploy:
- Drag&drop: trascini di nuovo la cartella in Netlify dashboard del sito
- Git: `git push` e Netlify rebuilds automaticamente

## Note importanti

- `WEBAPP_URL` nel file `index.html` deve corrispondere all'URL GAS produzione corrente (v4.18.x). Se cambia il deployment GAS, aggiornare quella costante.
- Il `_redirects` ha un catch-all 302 verso GAS: utile se qualcuno apre `app.sinopiaconsulting.it/qualcosa-di-strano`, viene comunque reindirizzato all'app principale.
- Per disabilitare il redirect automatico (esempio: pagina speciale di promo), modifica il `setTimeout(..., 800)` in `index.html`.

## Update OC_APP_PUBLIC_URL su Apps Script

**Dopo aver attivato il dominio**, vai sul progetto GAS Sinopia → editor → menu **Properties** (oppure esegui da editor):

```js
PropertiesService.getScriptProperties().setProperty('OC_APP_PUBLIC_URL', 'https://app.sinopiaconsulting.it');
```

Questa property è letta da `_buildMagicLink_` in `Sessioni_v1.js` per generare i magic-link nelle email. Senza questa property, l'email userà l'URL GAS lungo.
