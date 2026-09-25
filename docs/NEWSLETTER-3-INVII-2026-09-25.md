# I 3 invii settimanali — architettura (v4.38, 25/09/2026)

Requisito (Silvano, 25/09): ogni settimana partono **tre** newsletter distinte.

| # | Quando | A chi | Contenuto | Come |
|---|--------|-------|-----------|------|
| **a** | **Lunedì** (manuale) | **Tutti** gli iscritti attivi (MailingList / Utenti OptInDigest) | Generalista: panoramica bandi/news/podcast + editoriale | `buildNewsletterHtml_` → `sendNewsletterEmail_` (Newsletter_v44.js) |
| **c** | **Martedì** (auto ~07:30) | **Musei** che hanno compilato Matrix (Coorte B) | Digest personalizzato sui gap del museo | `sendDigestProfilatiMartedi` → `sendDigestAuto2coorti({onlyLead:true})` → Layout 1 (`generateDigestForUser`) |
| **b** | **Venerdì** (auto ~07:30) | **Iscritti profilati** = hanno scelto gli ambiti nell'area (`ProfiliPro.interessi_dimensioni`), esclusi i musei della Coorte B | Selezione **tematica**: news degli ultimi 7 giorni filtrate sugli ambiti scelti + sezioni standard | `sendDigestTematicoProfilati` (Digest_routing.js) |

## Punti chiave del venerdì (flusso b) — v4.38

- **In aggiunta, non al posto**: il profilato riceve SIA la generalista del lunedì SIA la tematica del venerdì (scelta di Silvano). I contenuti sono diversi (panoramica vs selezione tematica).
- **Nessun trigger nuovo da installare**: il venerdì gira dentro `sendDigestProfilatiMartedi`, che è un trigger **daily** (già attivo) e si auto-instrada per giorno della settimana (martedì → musei, venerdì → tematica). Chiamata con `noLock:true` perché il lock del dispatcher è già acquisito.
- **Anti-doppione per-tipo** (`_digestWasRecentlySentScope_`): il venerdì controlla SOLO le tematiche precedenti, non "ha ricevuto qualcosa". Altrimenti salterebbe tutti (hanno già avuto la generalista lunedì). Registra `Sistema='tematica'` in `DigestSentLog`.
- **Fonte contenuti** (`_digestNewsRecentiPerDigest_`): legge il foglio `Items` per **recenza** (ultimi 7 giorni), NON dal pool `InclusiNelDigest` — che il martedì viene azzerato (`sendDigestAuto2coorti` step 5). Stessa forma di `getItemsByIds`, così `buildDigestHTML` la consuma senza modifiche.
- **Filtro ambiti**: `buildDigestHTML(items, dest, readerUrl, dest.ambiti)` filtra le sezioni news sugli ambiti scelti. Le altre sezioni (bandi/podcast/video/libri) restano complete.
- **Destinatari e ambiti**: da `getDigestRecipientsByCohort().generalisti` (= MailingList meno Coorte B, già arricchiti con `.ambiti`). Si prendono solo quelli con `ambiti.length > 0`.
- **Mittente**: alias ufficiale `sinopiaconsulting@gmail.com` se verificato (come gli altri invii).

## Perché non c'è rischio di doppio invio (come a settembre)

Il doppio invio di settembre nasceva perché la Coorte B del martedì, senza contenuto Matrix, ripiegava sulla generalista → chi era anche in MailingList la riceveva due volte. Quel ripiego è stato rimosso (v4.37). Il venerdì (v4.38):

- colpisce **solo iscritti profilati NON musei** (i musei sono in Coorte B, esclusi dai `generalisti`);
- nessun profilato riceve mai un mark `'tematica'` che possa far saltare il martedì dei musei (insiemi disgiunti);
- il lunedì manuale non fa alcun controllo dedup, quindi non è influenzato dai mark del venerdì.

## Box "Profilati" nella generalista (v4.38)

Nella newsletter di **tutti** gli iscritti (lunedì) compare un box che invita a profilarsi
per ricevere news e bandi per categorie specifiche. Non sostituisce l'invio.
- `_ocProfilazioneBoxRow_` (DigestService.js), racchiuso tra `<!--OC_PROFBOX_START-->` / `END`.
- `sendNewsletterEmail_` toglie il box a chi è **già** profilato (`_ocProfiledEmailsSet_`).
- In `buildDigestHTML` il box appare solo se il destinatario non ha ambiti (non profilato).

## Come provarlo (dal pannello, senza editor)

Pannello **Digest** → sezione **"Mail tematica del venerdì (iscritti profilati)"** →
inserisci la **tua** email → **Invia prova tematica**. Usa i tuoi ambiti; se non ne hai,
mostra un campione con tutti. È un invio reale [TEST], non registra l'anti-doppione.

Funzioni server: `sendDigestTematicoProfilati(opts)`, `testInviaDigestTematico(email, token)`.
Per un invio manuale immediato a tutti i profilati (fuori dal venerdì):
`sendDigestTematicoProfilati({force:true})` dall'editor.
