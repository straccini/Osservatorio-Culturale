# Setup connettori MCP — Osservatorio Culturale

> Ultimo aggiornamento: 2026-10-30 · Owner: Silvano Straccini · Duemilamusei

Questo progetto è configurato con **4 connettori MCP** per Claude Code, dichiarati in
[`.mcp.json`](../.mcp.json) alla radice del repository (scope *progetto*: qualsiasi
sessione Claude Code aperta su questo repo li carica automaticamente, incluse le
sessioni cloud su claude.ai/code).

| Connettore | Cosa fa | API key | Costo |
|---|---|---|---|
| **perplexity** | Ricerca web in tempo reale con sintesi AI (`perplexity_search`, `perplexity_ask`, `perplexity_research`, `perplexity_reason`) | ✅ `PERPLEXITY_API_KEY` | A consumo (a pagamento) |
| **firecrawl** | Scraping e analisi di siti web — anche pagine bandi senza RSS | ✅ `FIRECRAWL_API_KEY` | Piano gratuito ~500 crediti |
| **playwright** | Automazione browser: form, test E2E, navigazione (collaudo web app GAS) | ❌ nessuna | Gratuito |
| **rube** (Composio) | Hub unico per centinaia di app: Gmail, Slack, Notion, Google Sheets… | ❌ OAuth via browser | Piano gratuito |

⚠️ `.mcp.json` è escluso dal push clasp via `.claspignore`: **non** deve finire su Google Apps Script.

---

## 1 · Dove prendere le API key

### Perplexity (`PERPLEXITY_API_KEY`, inizia con `pplx-`)
1. Accedi su [perplexity.ai](https://www.perplexity.ai) → **Settings → API** (`perplexity.ai/settings/api`)
2. Aggiungi un metodo di pagamento o crediti (bastano pochi dollari per iniziare)
3. **Generate API Key** → copia la chiave

### Firecrawl (`FIRECRAWL_API_KEY`, inizia con `fc-`)
1. Registrati su [firecrawl.dev](https://www.firecrawl.dev)
2. Dashboard → **API Keys** → copia la chiave

---

## 2 · Setup sul PC locale (Windows)

Le chiavi **non vanno mai committate**: `.mcp.json` le legge dalle variabili
d'ambiente (`${PERPLEXITY_API_KEY}`, `${FIRECRAWL_API_KEY}`).

In PowerShell, una volta sola (variabili utente permanenti):

```powershell
[Environment]::SetEnvironmentVariable("PERPLEXITY_API_KEY", "pplx-LA-TUA-CHIAVE", "User")
[Environment]::SetEnvironmentVariable("FIRECRAWL_API_KEY", "fc-LA-TUA-CHIAVE", "User")
```

Poi chiudi e riapri il terminale. Aprendo Claude Code nella cartella del progetto,
alla prima sessione verrà chiesto di approvare i server di `.mcp.json`: approva tutti e 4.

### Alternativa: installazione a scope utente (vale per TUTTI i progetti)

Se vuoi i connettori disponibili ovunque (non solo in questo repo), su Windows nativo:

```bash
claude mcp add perplexity -s user --env PERPLEXITY_API_KEY=pplx-LA-TUA-CHIAVE -- cmd /c npx -y @perplexity-ai/mcp-server
claude mcp add firecrawl  -s user --env FIRECRAWL_API_KEY=fc-LA-TUA-CHIAVE  -- cmd /c npx -y firecrawl-mcp
claude mcp add playwright -s user -- cmd /c npx -y @playwright/mcp@latest
claude mcp add --transport http rube -s user "https://rube.app/mcp"
```

(Su Mac/Linux/WSL: stessi comandi senza il prefisso `cmd /c`.)

---

## 3 · Setup nelle sessioni cloud (claude.ai/code)

I server partono automaticamente da `.mcp.json`. Per far funzionare Perplexity e
Firecrawl bisogna aggiungere le due chiavi come **secret dell'ambiente**:
claude.ai/code → impostazioni dell'ambiente del repo → **Secrets / variabili
d'ambiente** → aggiungi `PERPLEXITY_API_KEY` e `FIRECRAWL_API_KEY`.
Playwright funziona subito (Chromium è preinstallato); Rube richiede
l'autenticazione OAuth al primo uso.

Esiti verificati in sessione cloud (2026-10-30):
- **playwright**: ✅ connesso e funzionante senza configurazione
- **perplexity / firecrawl**: server avviati, ma le chiamate restituiscono
  `401 Unauthorized` finché i due secrets non vengono aggiunti all'ambiente
- **rube**: ⚠️ il proxy di rete dell'ambiente cloud rifiuta il tunnel verso
  `rube.app` (`ERR_PROXY_TUNNEL 502`). Per usarlo nelle sessioni cloud occorre
  consentire il dominio `rube.app` nella **network policy** dell'ambiente
  (claude.ai/code → impostazioni ambiente → accesso di rete). Sul PC locale
  Rube funziona normalmente, senza proxy di mezzo.

---

## 4 · Autenticazione Rube (Composio)

1. In una sessione Claude Code digita `/mcp` → seleziona **rube** → **Authenticate**
2. Si apre il browser: accedi o crea l'account Composio
3. Lo stato passa a **connected**
4. Alla prima azione su un'app (es. "manda una mail") autorizzi quella singola app
   (Gmail, Slack, Notion…) una volta sola; resta collegata al tuo account Composio

---

## 5 · Verifica

```bash
claude mcp list
```

Devono comparire `perplexity`, `firecrawl`, `playwright`, `rube` con stato ✔ connected.
In sessione: `/mcp` mostra stato e strumenti di ciascun server.

## 6 · Problemi tipici

| Sintomo | Causa | Rimedio |
|---|---|---|
| `npx` non trovato | Node.js assente | Installa Node.js LTS da [nodejs.org](https://nodejs.org) |
| Server "failed" su Windows | Manca il wrapper `cmd /c` (solo scope utente) | Riaggiungi il server con `-- cmd /c npx ...` |
| Perplexity/Firecrawl "failed" | Variabile d'ambiente mancante o chiave errata | Verifica `echo $env:PERPLEXITY_API_KEY` in PowerShell |
| Rube "needs authentication" | OAuth non completato | `/mcp` → rube → Authenticate |
| `401 Unauthorized` da Perplexity/Firecrawl | Chiave mancante o non valida (il server parte comunque) | Imposta/correggi la variabile d'ambiente o il secret cloud |
| Rube "failed" in sessione cloud (`ERR_PROXY_TUNNEL 502`) | Network policy dell'ambiente blocca `rube.app` | Consenti `rube.app` nelle impostazioni di rete dell'ambiente |
| Playwright non apre il browser | Browser non scaricato | `npx playwright install chromium` |

## 7 · Riferimenti

- [Perplexity MCP — docs ufficiali](https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server)
- [Firecrawl MCP](https://docs.firecrawl.dev/mcp)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Rube by Composio](https://github.com/composiohq/rube)
- [Claude Code — MCP](https://code.claude.com/docs/en/mcp)
