# Brief operativo per Claude Code — Remediation pre-pubblicazione

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script web app)
**Riferimento problemi:** `docs/AUDIT_PUBBLICAZIONE_v2_ESAUSTIVO.md` (audit v2 esaustivo, corregge v1)
**Brief operativo:** `docs/BRIEF_CLAUDE_CODE_REMEDIATION.md` (istruzioni dettagliate per fase)
**Obiettivo:** rendere la web app pubblicabile in sicurezza, con **login attivabile dall'admin tramite flag dedicato**.
**Data creazione:** 2026-06-03
**Ultimo aggiornamento:** 2026-06-04
**Stato:** DA INIZIARE — domani sessione 4 giugno

---

## Stato avanzamento

| Fase | Titolo | Stato | Commit |
|------|--------|-------|--------|
| 0 | Token Telegram | ⬜ DA FARE | — |
| 1 | Gating admin funzioni distruttive | ⬜ DA FARE | — |
| 2 | Login attivabile da admin (FLAG) | ⬜ DA FARE | — |
| 3 | Sessioni TTL + gate ruolo write | ⬜ DA FARE | — |
| 4 | Bug funzionali certi | ⬜ DA FARE | — |
| 5 | Setup trigger unico + branding | ⬜ DA FARE | — |
| 6 | Robustezza / privacy / quota | ⬜ DA FARE | — |
| 7 | Polish | ⬜ DA FARE | — |

---

## Prerequisiti già completati (sessione 3 giugno sera)

Commit `c9daa43` — audit sicurezza e robustezza (8 interventi):
- ✅ MAINT_KEY migrata a ScriptProperties
- ✅ forgetMyData wirato in doPost
- ✅ withFailureHandler su 18 chiamate google.script.run
- ✅ deadline su ~40 UrlFetchApp.fetch
- ✅ console.log → Logger.log
- ✅ Rate limiting su endpoint pubblici (survey/reader/unsub)
- ✅ Protezione CSV injection (_sanitizeForCell_)
- ✅ Test function deprecata rimossa
- ✅ Alt mancante img dinamica
- ✅ Email validation saveMailing migliorata

---

## FASE 0 — URGENTE (azione MANUALE + codice)

- **Revocare il token bot Telegram** via @BotFather (`/revoke`)
- Impostare in ScriptProperties: `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`
- In `Telegram_v44.js` rimuovere i literal e leggere SEMPRE da ScriptProperties
- Nessun token nei `Logger.log`
- **Accettazione**: `grep` = 0 risultati per il token nel repo

---

## FASE 1 — Gating admin su funzioni distruttive/privilegiate

Aggiungere guard admin in testa a:
- `emptyTrash()` — `Backend_v415.js:335`
- `exportArchivio()` — `Backend_v415.js:259` + rimuovere sharing pubblico Drive
- `invitaUtenteSendEmail()` — `Backend_v415.js:199`
- `saveLibro()` `:46`, `saveNorma()` `:156` — almeno `editor|admin`
- `setupMasterTriggers()` `:135`, `setupMasterFogli()` `:298`, `setupMasterCompleto()` `:349`
- `Sheet_Cleanup.js`: `runSheetCleanup`, `archiviaFogliObsoleti`, `dailyDedupCheck`

**Accettazione**: sessione anonima → `{ok:false,error:'forbidden'}`; admin → funziona

---

## FASE 2 — LOGIN attivabile dall'ADMIN tramite flag (RICHIESTA PRINCIPALE)

### Flag: `OC_PUBLIC_LOGIN_ENABLED`
- Assente o diverso da `'true'` = login CHIUSO (fail-closed)
- Solo `'true'` = login attivo

### Backend (Sessioni_v1.js)
- Helper `isPublicLoginEnabled_()`
- Guard in `loginConEmail()` come primissima riga
- Blocco ruoli elevati (admin/editor → `usa_accesso_admin`)
- Funzioni toggle: `abilitaLoginPubblico()`, `disabilitaLoginPubblico()`, `statoLoginPubblico()`

### Frontend (Index.html)
- Form login visibile solo se `statoLoginPubblico().enabled === true`
- Pannello admin: interruttore ON/OFF con toast
- Admin via `?adm=TOKEN` sempre funzionante

---

## FASE 3 — Sessioni TTL + gate ruolo write

- TTL sessioni via `OC_SESSION_TTL_DAYS`
- `validaSessione` rifiuta token scaduti
- `cleanupSessioniScadute` revoca effettivamente
- doPost write: gate `editor|admin` per contenuto globale
- AdminToken: scadenza/rotazione o documentazione esplicita

---

## FASE 4 — Bug funzionali certi

- Toolbar Norme/Social: definire funzioni mancanti o rimuovere
- `getUserWorkspaceData`: fix `sess` undefined nel ramo admin
- `data-action` admin morti: implementare o rimuovere bottoni
- `statSondaggi`: fix catena senza metodo terminale
- Matrix: `getMicReport`, `section12`, `_matrixComputeConsistencyFlags_`

---

## FASE 5 — Setup trigger unico + branding

- `setupMasterTriggers()` come unico setup
- Deprecare setup trigger duplicati
- Allineare audit trigger
- Documentare `saveCommercialConfig` per branding

---

## FASE 6 — Robustezza / privacy / quota

- XSS Digestreader
- SurveyPublic `getAppUrl()` fix
- Rate-limit prenotazioni/sondaggi
- Sanitize in Segnalazioni/ProfiloPro
- Privacy: forgetMyData check obbligatorio
- HMAC unsubscribe: CSPRNG
- Quota email: check + early-stop
- Centralizzare modello Claude
- Fix agenti (NRecordTotali, stats, cursore)

---

## FASE 7 — Polish

- Logger.log secondo argomento
- Palette ambiti da OC_AMBITI
- Versione da getOcConstants()
- Numeri Matrix coerenti
- Dark mode var(--paper)
- File .bak/.disabled cleanup
- Favicon
- validateHttpsCertificates limitato
- Test functions con guard admin
