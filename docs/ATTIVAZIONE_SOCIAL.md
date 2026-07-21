# Pubblicazione social (Instagram + LinkedIn) — stato e attivazione

**Data**: 2026-07-21 · **Versione**: v4.27.52 · **Canali**: `@sinopia_osservatorio` (IG) · profilo/pagina Sinopia su LinkedIn (aperto da Riccardo)

---

## 1. Cosa è già in funzione (nessun prerequisito)

| Fase | Stato | Dove |
|---|---|---|
| **Generazione** post da news | ✅ attivo | `AgentSocial.js` — Claude scrive caption IG + testo LinkedIn nel tono "manifesto" Sinopia |
| **Generazione** post da **editoriale** | ✅ NUOVO v4.27.51 | parte da sola quando la newsletter viene inviata; bottone "📣 Editoriale → social" per farlo a mano |
| **Referenze multi-fonte** ("Ne parlano anche: …") | ✅ NUOVO v4.27.51 | rassegna stampa automatica dal nostro archivio, chiude ogni post |
| **Approvazione** | ✅ attivo | pannello admin → Coda social (`draft` → `approved`) |
| **Ponte Telegram** | ✅ NUOVO v4.27.52 | i post approvati arrivano su Telegram pronti da copiare/incollare |
| **Pubblicazione via API** | ⏸ pronta, spenta | `AgentSocialPublish.js` — si accende impostando i token |

**Cadenza**: martedì e venerdì ore 10:00 il sistema prende i post approvati e li pubblica (se le API sono attive) o li manda su Telegram.

---

## 2. Come funziona il ponte Telegram (da subito)

1. Il post viene generato (da news o dall'editoriale) → arriva l'alert Telegram.
2. In **Impostazioni → Sistema → Coda social** si rivede e si approva.
3. Martedì/venerdì alle 10:00 — oppure subito col bottone **"▶ Invia post su Telegram"** — arrivano 3 messaggi:
   - foto + titolo,
   - **caption Instagram** completa di hashtag,
   - **testo LinkedIn**.
4. Si copia e si incolla. Nessuna riscrittura: il testo è già nella forma finale.

> Il ponte resta utile anche dopo l'attivazione delle API, come ultima revisione prima della pubblicazione.

---

## 3. Attivazione API — prerequisiti e tempi

### 3.1 LinkedIn (profilo/pagina di Riccardo per Sinopia)

Il codice è **agnostico**: pubblica dove indica `OC_LI_AUTHOR_URN`, quindi va bene sia il profilo (`urn:li:person:…`) sia la pagina (`urn:li:organization:…`) senza modifiche.

| Passo | Chi | Tempo |
|---|---|---|
| App su [LinkedIn Developers](https://www.linkedin.com/developers/) associata all'account Sinopia | Riccardo | 30 min |
| Prodotto **"Share on LinkedIn"** + "Sign In with LinkedIn" (self-service, nessuna revisione) → permesso `w_member_social` | Riccardo | immediato |
| Generare l'access token OAuth e leggere l'URN dell'autore | Riccardo (o io, con le sue credenziali davanti) | 30 min |
| Incollare token + URN nelle ScriptProperties | Silvano/io | 5 min |
| **Totale realistico** | | **1–2 giorni** (tempo di coordinamento) |

⚠️ **Se invece si vuole pubblicare sulla PAGINA aziendale** serve il prodotto *Community Management API*, che richiede una **domanda di accesso con revisione LinkedIn**: settimane, esito non garantito per realtà piccole. Per questo si parte dal profilo.

🔁 **Manutenzione**: il token LinkedIn dura 60 giorni (rinnovabile 365 con refresh token). Va rigenerato periodicamente — il sistema segnala l'errore in `ErroreLI` e ripiega automaticamente sul ponte Telegram, quindi nessun post si perde.

### 3.2 Instagram

| Passo | Chi | Tempo |
|---|---|---|
| Verificare che `@sinopia_osservatorio` sia account **Business o Creator** (non personale) | Silvano | 5 min |
| Collegarlo a una **Pagina Facebook** (requisito Meta, anche pagina poco usata) | Silvano | 15 min |
| App su [Meta for Developers](https://developers.facebook.com/) + permessi `instagram_basic`, `instagram_content_publish` | io/Riccardo | 1 ora |
| Token: preferibile **System User** da Business Manager (non scade) | Riccardo | 30 min |
| Eventuale **verifica business** di Meta (documenti azienda) | Silvano | **da 2 giorni a 2 settimane** |
| **Totale realistico** | | **3 giorni – 2 settimane** (dipende dalla verifica Meta) |

⚠️ **Vincolo tecnico**: Instagram non accetta l'upload diretto del file — scarica l'immagine da un **URL pubblico**. I link di Google Drive spesso vengono rifiutati. Soluzione già a portata: pubblicare le immagini sullo spazio Netlify che ospita già la landing (`sinopia.netlify.app`), oppure usare le immagini originali degli articoli (og:image), che sono già URL pubblici — è ciò che il sistema estrae di default.

---

## 4. Ordine di attivazione consigliato

```
OGGI          ponte Telegram          → post pronti da copiare, zero attese
+2 giorni     LinkedIn (profilo)      → pubblicazione automatica su LinkedIn
+1/2 settimane Instagram              → pubblicazione automatica su IG
quando serve  Pagina LinkedIn         → domanda Community Management API
```

Ogni fase è indipendente: se Instagram tarda, LinkedIn pubblica lo stesso; se entrambe tardano, il ponte Telegram copre tutto.

---

## 5. Interruttori (ScriptProperties)

| Chiave | Valore | Effetto |
|---|---|---|
| `OC_SOCIAL_AUTOPUB` | `true` | accende la pubblicazione via API (senza, solo ponte) |
| `OC_LI_AUTHOR_URN` | `urn:li:person:…` o `urn:li:organization:…` | destinatario LinkedIn |
| `OC_LI_TOKEN` | access token | credenziale LinkedIn |
| `OC_IG_USER_ID` | id numerico account IG business | destinatario Instagram |
| `OC_IG_TOKEN` | access token Meta | credenziale Instagram |

Verifica in ogni momento con **"📊 Stato canali social"** nel pannello admin: dice cosa è pronto, cosa manca e quanti post sono in attesa.

---

## 6. Sicurezza

- Si pubblica **solo** ciò che è stato approvato in Coda social: nessuna bozza esce da sola.
- Cap di 3 post per esecuzione (evita raffiche).
- Se un'API fallisce, l'errore viene registrato e il post passa al ponte Telegram: **nessun contenuto va perso**.
- Nessun token nel codice: tutto in ScriptProperties.
