# Report di ripresa — 11 giugno 2026
### Stato al termine della sessione del 10/06/2026 (sera) · v4.24.7 · deploy @560

> **Scopo**: riprendere da qui domani. Contiene: cosa è stato fatto oggi, le scoperte architetturali CRITICHE, cosa va verificato sul digest, i rischi residui e i setup one-shot pendenti.

---

## 1. STATO ATTUALE — funzionante e verificato

| Cosa | Stato |
|---|---|
| Accesso anonimo webapp (50 referenti senza account Google) | ✅ verificato (curl `?warm=1` → `ok`) |
| Login super-admin s.straccini@gmail.com | ✅ verificato in-browser (topbar "S Straccini", sessione ripristinata al load) |
| Logout/login in-place (senza reload) | ✅ deployato, confermato dall'utente ("si funziona") |
| Funnel area personale (ambiti → autovalutazione → Matrix) | ✅ deployato (v4.24.0–.2) — **verifica end-to-end digest DA FARE domani** |
| Branch | `feat/fonti-feed-unificazione`, ultimo commit `fd8cae2` + v4.24.7, tutto pushato |

**URL produzione (invariato)**: `https://script.google.com/macros/s/AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs/exec`

---

## 2. SCOPERTE ARCHITETTURALI CRITICHE (da tenere SEMPRE presenti)

Queste quattro regole spiegano i bug di oggi e condizionano OGNI sviluppo futuro:

1. **`webapp.access` DEVE essere `ANYONE_ANONYMOUS`** (manifest `appsscript.json`). Era scivolato ad `ANYONE` nella cartella clasp (= solo utenti Google loggati). Lo script `sync-oc-to-gas.ps1` ora copia il manifest dalla sorgente a ogni run e **annulla il push** se non è ANYONE_ANONYMOUS. Non toccare.
2. **La sandbox GAS per accessi anonimi BLOCCA `window.top.location.href`** (in silenzio, niente errore). Quindi: **MAI fare affidamento su reload/navigazione post-azione**. Login e logout sono ora IN-PLACE (`_postLoginApply_` in Index.html ~5015 e `doLogout` ~4967). La navigazione resta solo come best-effort in try/catch.
3. **`Session.getActiveUser()` è SEMPRE VUOTO su deploy anonimo.** Qualsiasi funzione server che identifica l'utente così è ROTTA: l'identità deve arrivare dal **token di sessione** passato dal frontend (`window.OC_SESSION.token`). Fix già fatto per il profilo (`_proGetUser_(token)`, `getProfilo(token)`, `saveProfilo(payload.__token)`). **⚠️ Rischio residuo: altre funzioni della stessa classe — vedi §4.**
4. **Index.html ha DUE IIFE separate** (righe ~2298–11763 e ~12015–12444). Le funzioni della prima NON sono visibili nella seconda (dove vivono i gate handler `OC._gateDoLogin`, `OC.toggleAmbitoInteresse`, `OC.saveProfiloSettings`...). Per condividere: export su `window` (fatto per `_postLoginApply_` e `_wsSondaggiNextHtml_`). Questo bug di scope era la causa storica dei "reload mai partiti" dal gate.

Strumento nuovo: `tools/check-inline-js.js` — syntax-check dei blocchi `<script>` negli HTML (`node tools/check-inline-js.js Index.html`). Usarlo prima di ogni deploy che tocca gli HTML.

---

## 3. AGENDA DOMANI — digest: modifiche e verifiche

### 3a. Verifica end-to-end della GENERALISTA FILTRATA sugli ambiti (v4.24.0 — mai testata!)
Flusso da provare con un utente test (o l'admin):
1. "La tua area" → selettore ambiti inline → attivare 1–2 ambiti (chip) → verificare toast e che `ProfiliPro.interessi_dimensioni` + `ContactsMatrix.preferences_json.dimensioni` si aggiornino.
2. Admin → Digest → **Anteprima per email** (fix forbidden v4.23.8): inserire l'email del test → l'anteprima generalista deve mostrare **solo le sezioni degli ambiti scelti**.
3. Invio test reale a un lettore con ambiti → email con sole quelle sezioni; lettore senza ambiti → generalista piena.
4. **Caso Matrix prevale**: utente con Matrix completato → riceve il digest sui 3 gap, NON la generalista filtrata (coorte B esclude da A).
- ⚠️ Rischio noto (annotato nel piano): se il lettore non ha riga in `ContactsMatrix`, `_proSyncOptIn_` non scrive nulla → `g.ambiti=[]` → digest pieno. Se succede: fallback in `Digest_routing.js` leggendo direttamente da `ProfiliPro`.

### 3b. Pagina Digest (admin) — verifiche post-razionalizzazione v4.23.8
- Tab **Lettori**: ciclo completo (prepara → anteprima → test reale via email → invio).
- Tab **Profilati**: i "test" generano BOZZE in coda (nessun invio); "Invia tutti i pending" = invio reale.
- **Richiedi autorizzazione invio** (newsletter): dipende dal bot Telegram → prima eseguire `diagnosiTelegram()` (vedi §5).
- ⚠️ Le funzioni digest admin usano `_isCurrentUserAdmin_(token)`: verificare che TUTTI i bottoni passino il token (pattern v4.23.8) — su deploy anonimo qualunque check senza token fallisce.

### 3c. Gate "Invia link" (terzo flusso di login) — rifinitura non bloccante
Il gate che si apre dalle pagine bloccate (`_showGuestGate_`, campo "La tua email" + bottone "Invia link"): il login riesce e salva il token, ma la UI si aggiorna solo al reload. Allinearlo al flusso in-place: nel suo success handler chiamare `window._postLoginApply_(r)` quando `r.directLogin && r.token` (stesso pattern di `OC._gateDoLogin`).

### 3d. Sweep "identità senza token" (stessa classe del bug profilo — §2.3)
Grep mirato e correzione dove serve:
- `getRuoloCorrente()` **senza argomenti** nei file server.
- `Session.getActiveUser()` usato per identificare l'utente nelle funzioni chiamate dal frontend.
- `_isCurrentUserAdmin_()` **senza token** in endpoint chiamati via `google.script.run` (es. `getTelegramConfigStatus` in Telegram_v44.js:35 — sospetto).
Candidati noti da controllare: KB_v1, Sondaggi_v1 (submit), Segnalazioni_v1, Prenotazioni_v1, Newsletter_v44/Admin_v44 (già token-based in gran parte), StatsManager.

---

## 4. CRONOLOGIA FIX DI OGGI (v4.23.8 → v4.24.7)

| v | Cosa | Note |
|---|---|---|
| 4.23.8 @548 | Anteprima digest "forbidden" (token mancante) + pagina Digest razionalizzata (legenda + etichette verde/arancio/blu) | commit `902a554` |
| 4.23.9 @549 | Telegram: unificate le 2 chiavi-token (`TELEGRAM_TOKEN`/`TELEGRAM_BOT_TOKEN`), + `diagnosiTelegram()` | `2d526e8` |
| 4.23.10 @550 | Super-admin sempre livello 3 (login diretto) anche con ruolo errato nel foglio Utenti | `261f149` |
| 4.24.0 @553 | **Profilazione ambiti**: helper `ambitiFromDims`/`dimsFromAmbiti` (Constants), `buildDigestHTML(..., filterAmbiti)`, coorte A arricchita con ambiti, `setAmbitoInteresse`/`getAmbitiInteresse`, selettore inline in "La tua area" | piano in `docs/superpowers/plans/2026-06-10-profilazione-ambiti-area-digest.md` |
| 4.24.1 @553 | Box di sblocco: "Il tuo profilo" al posto di "Autovalutazione rapida" → porta a La tua area | `d550044` |
| 4.24.2 @554 | Autovalutazione rapida: via dalla sidebar, card "Prossimo passo" nell'area DOPO conferma ambiti (mapping sondaggi↔ambiti: gestione/digital→5, accessibilita→2, audience→1+4, turismo→1+3, reti→4+5), esclude già compilati, update live al toggle | `868d49f` |
| 4.24.3 @555 | Menu utente: `.topbar-user-menu-item[hidden]{display:none}` (display:block sovrascriveva hidden) | `021ef7e` |
| — @556 | **Manifest ripristinato ANYONE_ANONYMOUS** + guardia nello script sync | `673b078` |
| 4.24.4 @557 | Token nell'URL al reload post-login (`?t=`) | `facbb91` |
| 4.24.5 @558 | **Login/logout IN-PLACE** (`_postLoginApply_`, doLogout senza dipendenza dalla navigazione) | `fd8cae2` |
| 4.24.6 @559 | Profilo token-based (`_proGetUser_(token)` ecc.) — fix "Accesso non autorizzato" | `fd8cae2` |
| 4.24.7 @560 | **Fix scope IIFE**: `window._postLoginApply_` + `window._wsSondaggiNextHtml_` | pushato |

---

## 5. SETUP ONE-SHOT PENDENTI (da eseguire nell'editor GAS, una volta)

1. **`diagnosiTelegram()`** (Telegram_v44.js) → verifica chiavi + invia 2 messaggi di test (mittente alert/digest + mittente autorizzazione newsletter). Se `tokenPresente: MANCANTE` → `setTelegramConfig('BOT_TOKEN','CHAT_ID')`.
2. **`setupKeepWarmTrigger()`** (KeepWarm_v1.js) → trigger anti cold-start ogni 5 min (se non già attivo).
3. ScriptProperties da verificare: `OC_ADMIN_EMAILS`, `OC_UNSUB_SECRET`, `TELEGRAM_TOKEN`/`TELEGRAM_CHAT_ID`, `OC_PUBLIC_LOGIN_ENABLED` (per il pilota: `true`).
4. 👤 (fuori app) Pubblicare l'informativa su `sinopiaconsulting.it/privacy` (doc pronto: `docs/INFORMATIVA_PRIVACY_SINOPIA.md`) e verificare www vs apex.

---

## 6. DIFFERITI NOTI (non bloccanti, già documentati)
- Dark-mode dei 3 modali statici (registrazione/newsletter/prenotazione).
- Rinomina `crm_recordEvent` + gate `roc_*`; spacchettamento Codice.js; schema URL nelle card frontend; rate-limit per-IP.
- Decisione aperta: auto-attivazione agenti AG1-5 sui 3 gap dopo Matrix (opzione A consigliata, mai deciso).
- Merge `feat/fonti-feed-unificazione` → `master` (~200 commit avanti): quando il pilota è stabile.

## 7. COME SI DEPLOYA (promemoria)
```powershell
# check sintassi (js toccati + HTML)
node --check <file.js>
node tools/check-inline-js.js Index.html
# deploy completo (copia + manifest + clasp push + deploy stesso ID)
& "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\musemu matrix\sync-oc-to-gas.ps1"
```
Bump versione in `Constants.js` (`OC_VERSION` + nota in `OC_VERSION_NOTES`) a ogni release.
