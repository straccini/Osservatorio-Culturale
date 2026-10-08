# Osservatorio Culturale (Sinopia) — Ripartenza 2026-10-08

Sintesi del lavoro svolto dal **25/09 al 08/10/2026**. Documento di handoff: può essere
usato come primo messaggio in una nuova chat per ripartire con tutto il contesto.

## Contesto fisso
- Web app **Google Apps Script (GAS) + Google Sheets**, brand **Sinopia**.
- Silvano non tecnico: **il deploy lo fa lui dal PC** (clasp non è disponibile nel cloud, per scelta di sicurezza).
- Ramo di lavoro: `fix/collisioni-namespace` → **PR #2** (aperta, draft, *mergeable: clean*, base `sync/produzione-20260820`).

## Newsletter (3 flussi settimanali)
- **Terzo invio: mail tematica del venerdì** ai soli iscritti **profilati** (in aggiunta alla generalista del lunedì), con deduplica "scoped" così il venerdì non viene bloccato dall'invio del lunedì.
- **Box "Profilati"** negli invii generalisti (mostrato solo a chi non è ancora profilato).
- **Fix doppio invio**: stop all'invio doppio lunedì + martedì.

## Bandi / Radar Bandi
- **Rete anti-notizia**: le news editoriali non entrano più tra i bandi (era un problema visibile a schermo).
- **Più recall sotto-soglia** via ANAC/BDNCP; **riattivato ANAC OCDS** in sicurezza (con test dry-run); **fix connettore Lombardia** (non veniva mai eseguito).
- **Agente news→bando**: quando una notizia cita un bando, cerca quello ufficiale su ANAC; fix Crossref (link ufficiale + gate d'ingresso).
- **Monitor salute connettori** API strutturati + alert Telegram sui cambi di stato.

## Fonti (super-agente)
- **Super-agente fonti** con gate "alta confidenza": auto-approva solo se molto sicuro (score ≥ 85 + tier A/B + pertinenza), mette il resto in coda.
- **Schermina di revisione** nel pannello admin con pulsanti **approva/rifiuta**.

## Qualità / manutenzione
- **Fix accenti** (è/à) mancanti in profilazione e questionario pubblico (pre-lancio).
- **Pulizia pannello Sistema**: rimossi 17 pulsanti obsoleti + 3 funzioni JS morte, riordinato il blocco Trend, allineata versione, aggiornata scheda "Agenti AI".
- `.claspignore` indurito: tooling skill (`.claude/`, `.clawhub/`, `memory/`) **non** finisce mai nel push clasp.

## Skill / organizzazione (ultimi 2 giorni)
- Creata **super-skill di regia** `regia-progettazione-culturale` (dispatcher che instrada alle skill verticali culturali) — caricata su claude.ai; sorgente in `docs/skills/regia-progettazione-culturale/SKILL.md` (description compattata < 1040 caratteri per il caricamento).

## In sospeso
- **Deploy dal PC** e **verifica live** di: newsletter venerdì, pannello super-agente (approva/rifiuta), rete anti-notizie, recall bandi.
- **Merge PR #2** in produzione quando soddisfatto.
- Azioni manuali: **ruotare il token del bot Telegram**, rafforzare le password.
- Collaudo a livello codice (Fasi 1-2 della skill `qa-osservatorio-culturale`) interrotto su richiesta: da riprendere se si vuole un check statico pre-deploy.

## Riferimento commit (25/09 → 08/10)
- 2026-10-08 — compatta description skill regia < 1040 caratteri
- 2026-10-06 — super-skill di regia per la progettazione culturale (+ gitignore .zip)
- 2026-10-02 — riordino blocco Trend + rimozione 3 funzioni JS morte
- 2026-09-29 — rimozione 17 pulsanti obsoleti dal pannello Sistema
- 2026-09-28 — pannello Sistema aggiornato; schermina coda revisione approva/rifiuta; super-agente gate alta confidenza; monitor salute connettori; fix accenti
- 2026-09-27 — agente news→bando via ANAC + fix Crossref; riattivazione ANAC OCDS
- 2026-09-25 — recall sotto-soglia BDNCP/ANAC + fix Lombardia; rete anti-notizia; v4.37 stop doppio invio + triage FontiCandidate; terzo invio venerdì profilati; box profilati; stop doppio invio lun+mar; .claspignore tooling skill
