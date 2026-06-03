# Audit Production-Readiness — Sinopia / Osservatorio Culturale

**Data:** 2026-06-03 · **Versione:** v4.19.1 · **Tipo:** audit pre-pubblicazione (4 agenti: sicurezza, deploy/config, robustezza, frontend/dati)

> Nota: alcune affermazioni vanno **verificate sul campo** prima di agire (segnate con ⚠️verifica). L'app funziona nel percorso normale; questi sono i punti da chiudere per una pubblicazione pubblica solida.

---

## 🔴 BLOCCANTI — da chiudere prima di pubblicare

1. **Login/auth completo** *(già noto)*
   - `authenticate()` (Codice.js:1364): il login via email non verifica il **ruolo** — basta essere in mailing list per entrare come "lettore". Va validato contro `OC_ADMIN_EMAILS`/`OC_EDITOR_EMAILS`.
   - `loginConEmail` (Sessioni_v1.js:175): accesso con sola email, senza password. Esiste il flag `OC_AUTH_REQUIRE_PASSWORD` ma **non è usato**. ⚠️verifica se è esposto al frontend.
   - Sessioni **permanenti senza scadenza** (Sessioni_v1.js:64): un token rubato resta valido per sempre → introdurre TTL.

2. **Segreto hardcoded nel codice**
   - `MAINT_KEY = 'oc-maint-4K9xZq2p8vR1'` (Codice.js:669) in chiaro → spostare in ScriptProperties (come già fatto per `OC_MAINT_KEY` nel doGet).

3. **Endpoint GDPR `forgetMyData` senza autenticazione** (Privacy_v1.js:176)
   - Cancella dati da ResponsesMatrix/ContactsMatrix/CRM_Leads/MailingList. ⚠️verifica se è raggiungibile pubblicamente (sembra NON wirato in doPost). Se lo è: proteggere con token + conferma email.

4. **`doPost()` senza try/catch esterno** (Codice.js:495)
   - `JSON.parse(e.postData.contents)` su input malformato → crash non gestito. Avvolgere in try/catch con risposta d'errore pulita.

5. **Pagina "Chi siamo" vuota** (Index.html:1257)
   - Solo placeholder ("—"). Serve contenuto reale: missione, cosa è Sinopia, contatti.

6. **Controllo di avvio (bootstrap)**
   - Se `SHEET_ID` o `CLAUDE_API_KEY` mancano, o manca `Matrix_schema`, l'app si rompe in modo poco chiaro. Aggiungere un `initCheck_()` chiamato in doGet che verifica le dipendenze critiche.

---

## 🟠 IMPORTANTI — robustezza e UX

7. **Gestione errori lato client mancante**: diverse `loadX()` hanno solo `withSuccessHandler` → se la chiamata fallisce, skeleton infinito. Aggiungere `withFailureHandler` con messaggio "Caricamento fallito, riprova".
8. **`UrlFetchApp.fetch()` senza timeout** (scanner, FontiFeed, AgentScanner): possibile blocco. Aggiungere `timeout`.
9. **`console.error()` invece di `Logger.log()`** (UltimiBandi.js, Bandi_v5.js): in GAS l'output è scartato → errori invisibili.
10. **Rate limiting assente** su endpoint pubblici (survey, unsubscribe, reader): rischio spam/abuso.
11. **Validazione input** (Prenotazioni_v1.js:41): email non validata; dati non sanitizzati prima di scrivere su foglio.
12. **CSV injection**: celle che iniziano con `= + @ -` non prefissate (rischio se si apre l'export in Excel).
13. **Admin tools nascosti solo via CSS** (display:none) senza gating server-side: visibili forzando da console.

---

## 🟡 PULIZIA / POLISH

14. **Rimuovere file backup**: `*.bak`, `Constants.js.v419` (8+ file) — confondono e inquinano.
15. **Funzioni test con side-effect in produzione**: `_test_updateFeedSourceStats_()` (FontiFeed.js:774) modifica la config.
16. **TODO irrisolvibili**: `retroactiveFixOldBandiLinks()` citata ma inesistente (Scannerbandi.js:904).
17. **`setupSocialCredentials()` placeholder** (AgentSocial.js:737): Layer 3 social non implementato → documentare come "futuro" o rimuovere.
18. **Branding/SEO**: `<title>` da uniformare a "Sinopia · Osservatorio Culturale"; favicon; logo.
19. **Accessibilità**: `alt` mancanti sulle immagini; verificare contrasto WCAG AA; hero su mobile <600px.
20. **ID hardcoded** (radar spreadsheet `1cz35…`, deploy URL in AdminToken_v1.js:36): un problema solo se l'app viene **clonata**. Per il deploy singolo attuale, OK.

---

## ✅ GIÀ A POSTO

- `appsscript.json`: `executeAs USER_DEPLOYING` + `ANYONE_ANONYMOUS` (corretto per web app pubblica).
- `SHEET_ID` letto da ScriptProperties con fallback.
- Empty state + skeleton presenti in tutte le sezioni.
- Mobile: 4-5 media query attive.
- GDPR: doppio opt-in newsletter, unsubscribe, right-to-be-forgotten (da proteggere).
- Contenuti già popolati: 951 bandi, 2503 news, 10 podcast, 59 video, 7 libri (le sezioni NON sono vuote).

---

## Setup obbligatorio al primo deploy (già documentato in CLAUDE.md)

1. **Script Properties**: `SHEET_ID`, `CLAUDE_API_KEY` (+ opz. `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`).
2. **Funzioni setup** (una volta): `runAllSetupV418()`, `setupMasterCompleto()`, poi `setupMasterDiagnostica()`.
3. **Trigger**: installati da `setupMasterCompleto` (16 attivi, sotto il limite di 20).
4. **Deploy**: stesso URL (matita ✏️ → Nuova versione).

---

## Ordine di lavoro consigliato (stima ~1-2 giornate)

1. Auth/login completo (#1) — il più importante.
2. Hardening rapido: #2, #3, #4, #6 (poche righe ciascuno).
3. Contenuto "Chi siamo" (#5).
4. Robustezza: #7, #8, #9 (errori client, timeout, log).
5. Pulizia: #14, #15, #16, #18.
6. Resto (#10-13, #17, #19, #20) come rifinitura.
