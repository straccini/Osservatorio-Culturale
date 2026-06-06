# CHANGELOG v4.19.0 — Profilo Professionale + Segnalazioni Community

**Data**: 30 maggio 2026  
**Autore**: Silvano Straccini / Duemilamusei  
**Deploy**: NON eseguito (a cura di Silvano)

---

## Nuove funzionalità

### 1. Profilo Professionale lettore

- **Onboarding soft**: modale non bloccante al primo accesso (lettore, livello ≥ 1). 3 domande: ruolo, tipo ente, 2-4 interessi. Saltabile con "Completa dopo", ritrovabile in Impostazioni → Profilo.
- **Tab Impostazioni → Profilo**: form completo con barra completezza animata. Campi: ruolo/funzione, tipo ente, area geografica, dimensione struttura, seniority, 10 dimensioni di interesse (chip), consenso GDPR.
- **Chip interessi**: 10 dimensioni raggruppate con codice colorato + tooltip "?" (titolo + descrizione + contenuti correlati). Al cambio ruolo, pre-evidenziazione automatica delle dimensioni suggerite.
- **Sincronizzazione opt-in**: ad ogni salvataggio, le dimensioni di interesse vengono scritte in `ContactsMatrix.optIn.dimensioni` — il digest segmentato riceve le preferenze aggiornate senza stati divergenti.
- **Lead scoring CRM**: primo salvataggio +10pt, aggiornamenti successivi +2pt.
- **Cancella profilo**: rimozione dati + invocazione `forgetMyData()` (GDPR right-to-be-forgotten).

### 2. Segnalazioni Community

- **Form invio**: modale con titolo, descrizione, URL, tipo, area geografica, chip dimensioni con pre-tag automatico (al blur, chiama `_tagMatrixDim_`).
- **Rate-limit**: max 5 segnalazioni/giorno + intervallo minimo 2 minuti.
- **Gating**: anonimo → invito ad accedere; lettore → form; editor/admin → moderazione.
- **"Le mie segnalazioni"**: pagina personale con stato + note redazione.

### 3. Moderazione & pubblicazione (editor/admin)

- **Coda moderazione**: tab "Segnalazioni" in Impostazioni, con filtro per stato (pending/approved/rejected/published/all).
- **Azioni**: Approva (+ nota opzionale) → Rifiuta (nota obbligatoria) → Pubblica.
- **Pubblicazione**: stato→published + append in Items (fonte='Community', MatrixDim=tag, Score=7) + notifica Telegram.
- **Audit trail**: ogni transizione con editor, data, nota.

### 4. Sezione home "Segnalazioni dai lettori"

- Blocco in HomeView con ultime 5 segnalazioni published.
- CTA "Segnala un'iniziativa" con gating anonimo/lettore.
- Pagina completa `/segnalazioni` con fino a 50 segnalazioni.
- Badge dimensioni (D1-D10) su ogni card.

### 5. Personalizzazione "Per te"

- **Badge viola "Per te"**: mostrato su news e segnalazioni il cui `MatrixDim` interseca gli `interessi_dimensioni` del profilo utente.
- **Ordinamento prioritario**: contenuti "per te" vengono portati in cima nelle liste home.

### 6. Mini-dashboard admin

- **Pannello aggregato anonimo** nella tab Moderazione: totale profili, completezza media, distribuzione per ruoli/enti/territori/interessi.
- **Nessun dato individuale esposto** (coerente con /trasparenza).
- Barre orizzontali colorate per ogni distribuzione.

---

## File nuovi

| File | Righe | Scopo |
|---|---|---|
| `ProfiloPro_v1.js` | ~470 | Backend profilo + dashboard admin |
| `Segnalazioni_v1.js` | ~470 | Backend segnalazioni + moderazione + pubblicazione |
| `CHANGELOG_v4.19.0.md` | questo file | Note di rilascio |

## File modificati

| File | Backup | Modifiche |
|---|---|---|
| `Constants.js` | `Constants.js.bak` | Enum PRO_*, SEG_*, bootstrap fogli, version bump |
| `Index.html` | `Index.html.bak` | Modale onboarding, modale segnalazione, tab Profilo, tab Moderazione, pagina segnalazioni, pagina "le mie", handler JS, badge "Per te", dashboard |
| `HomeView.html` | `HomeView.html.bak` | Sezione "Segnalazioni dai lettori" |
| `Styles.html` | `Styles.html.bak` | Classi .pro-* per chip e form |

## File NON modificati (riusati via le loro funzioni pubbliche)

- `Auth.js` / `CurrentUser_v44.js` — `getRuoloCorrente()`
- `CRM_v1.js` — `crm_recordEvent()`
- `Matrix_tagger.js` — `_tagMatrixDim_()`
- `Privacy_v1.js` — `forgetMyData()`
- `Telegram_v44.js` — `_tgSend_()`, `_tgEsc_()`

---

## Passi manuali una-tantum (post-deploy)

```
Dall'editor GAS, eseguire UNA VOLTA:
  1. ensureSheetProfiliPro_()    → crea foglio ProfiliPro (13 colonne)
  2. ensureSheetSegnalazioni_()  → crea foglio Segnalazioni (15 colonne)
```

---

## Checklist QA end-to-end

| # | Test | Atteso | Note |
|---|---|---|---|
| 1 | Onboarding compare al primo accesso (lettore) | Modale con 3 domande dopo 2s | Flag in-sessione impedisce ri-apertura |
| 2 | Onboarding saltabile con "Completa dopo" | Si chiude, non riappare nella sessione | Ritrovabile in Impostazioni → Profilo |
| 3 | saveProfilo persiste in ProfiliPro | Riga con tutti i campi + completezza | Verifica foglio |
| 4 | saveProfilo sincronizza optIn.dimensioni | ContactsMatrix.preferences_json aggiornato | Verifica che digest riceva le dims |
| 5 | Chip interessi: help per dimensione | Tooltip con titolo + desc + contenuti | Hover su "?" |
| 6 | Pre-evidenza per ruolo | Chip si illuminano al cambio select ruolo | Solo se nessun interesse già scelto |
| 7 | Barra completezza aggiornata | Si muove al salvataggio | Badge % in alto a destra |
| 8 | Consenso GDPR obbligatorio (primo salvataggio) | Errore se checkbox non spuntata | Nei successivi non bloccante |
| 9 | deleteProfilo cancella + forgetMyData | Riga rimossa + GDPR invocato | Conferma JS prima |
| 10 | Segnalazione: form apre (lettore) | Dialog con campi | data-action="apriFormSegnalazione" |
| 11 | Segnalazione: gating anonimo | Mostra modale registrazione | Se livello < 1 |
| 12 | Segnalazione: pre-tag automatico | Chip si evidenziano al blur | Chiama preTagDimensioni() |
| 13 | Segnalazione: rate-limit attivo | Errore gentile dopo 5/giorno | Messaggio italiano |
| 14 | Segnalazione: stato pending | Riga in Segnalazioni con stato=pending | Verifica foglio |
| 15 | "Le mie segnalazioni": lista con stati | Mostra stato + note redazione | Pagina dedicata |
| 16 | Moderazione: coda visibile solo editor/admin | Tab "Segnalazioni" in Impostazioni | getSegnalazioniCoda gating livello ≥ 2 |
| 17 | Approva → approved | Stato cambia + editor + data | Nota opzionale |
| 18 | Rifiuta → rejected con nota | Nota obbligatoria, errore se < 3 char | Feedback autore |
| 19 | Pubblica → published | Append in Items + Telegram | fonte='Community', MatrixDim dai tag |
| 20 | Home: sezione segnalazioni | Ultime 5 published con card | Skeleton → contenuto |
| 21 | Home: CTA "Segnala" gating | Anonimo → registrazione; lettore → form | data-action |
| 22 | Badge "Per te" su news | Viola se intersezione MatrixDim∩interessi | Solo se profilo compilato |
| 23 | Badge "Per te" su segnalazioni | Idem | + ordinamento prioritario |
| 24 | Dashboard admin aggregata | Barre per ruoli/enti/territori/interessi | Solo dati aggregati |
| 25 | Nessuna regressione Auth/sessioni | Login/logout/magic-link funzionano | getRuoloCorrente non modificato |
| 26 | Tutti i nuovi accessi via getMainSS() | Nessun openById nel codice nuovo | Verifica grep |

---

## Dipendenze e compatibilità

- **Nessun framework/CDN esterno nuovo** introdotto
- **Google Apps Script V8** + HTML service (invariato)
- **Retrocompatibile**: tutte le funzionalità esistenti invariate
- **Fogli**: ProfiliPro e Segnalazioni sono addizionali (non modificano fogli esistenti)
