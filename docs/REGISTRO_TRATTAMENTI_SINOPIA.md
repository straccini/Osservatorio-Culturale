# Registro delle attività di trattamento
### Sinopia · Osservatorio Culturale — ai sensi dell'art. 30 GDPR

**Versione 1.1 — giugno 2026** · coerente con l'informativa privacy in-app (pagina "Privacy & GDPR", giugno 2026)

> ⚠️ **NOTA.** Bozza operativa predisposta per la fase di **test/beta**. Da validare/firmare dal Titolare. I campi 🔎 vanno confermati.

## Titolare del trattamento
**Sinopia S.r.l.** — Via del Raku 10, 06053 Deruta (PG), Italia · C.F./P.IVA 03766660546 · PEC sinopiaconsulting@pec.it · Contatto: sinopiaconsulting@gmail.com
*Responsabile della Protezione dei Dati (DPO):* 🔎 non nominato / [eventuale nominativo].

---

## Attività di trattamento

### T1 — Account e accesso al servizio
- **Finalità:** registrazione, autenticazione (magic-link), area personale.
- **Interessati:** referenti di musei/enti culturali registrati.
- **Categorie di dati:** email, nome, ruolo; token di sessione.
- **Base giuridica:** consenso / misure precontrattuali.
- **Conservazione:** 🔎 fino a revoca o 24 mesi di inattività.
- **Sistemi:** Google Sheets (fogli `Utenti`, `Sessioni_v1`, `ConsensiLog`).

### T2 — Comunicazioni e digest personalizzati
- **Finalità:** invio di bandi/news/podcast/pubblicazioni profilati sugli interessi.
- **Interessati:** iscritti che hanno prestato consenso.
- **Categorie di dati:** email, preferenze/ambiti di interesse.
- **Base giuridica:** consenso (revocabile via link di disiscrizione).
- **Conservazione:** fino alla disiscrizione.
- **Sistemi:** fogli `MailingList`, `ProfiloAgenti`; invio via Google MailApp.

### T3 — Autovalutazione (MuseMu Matrix) e sondaggi
- **Finalità:** autovalutazione del museo e restituzione di un report.
- **Interessati:** compilatori (referenti).
- **Categorie di dati:** risposte al questionario + profilo del museo (in forma **anonima/pseudonimizzata**: `ResponsesMatrix` separata dai contatti `ContactsMatrix`); UA in hash.
- **Base giuridica:** consenso.
- **Conservazione:** risposte anonime senza limite (statistica); contatti fino a revoca.
- **Sistemi:** fogli `ResponsesMatrix`, `ContactsMatrix`, `SondaggiMirati`.

### T4 — Valutazione interesse e gestione consulenze (CRM)
- **Finalità:** *lead scoring* (punteggio di interesse) e gestione prenotazioni di consulenza.
- **Interessati:** referenti che interagiscono con il servizio.
- **Categorie di dati:** email, nome, museo, regione, punteggio e storico eventi.
- **Base giuridica:** consenso; (profilazione **senza** decisioni automatizzate ex art. 22).
- **Conservazione:** 🔎 24 mesi dall'ultimo contatto.
- **Sistemi:** fogli `CRM_Leads`, `RichiestePrenotazione`, `ProfiliPro`.

### T5 — Sicurezza, log e adempimenti
- **Finalità:** prevenzione abusi, audit, esercizio dei diritti.
- **Categorie di dati:** parametri UTM/UA in hash; log disiscrizioni; registro cancellazioni (identificativo in hash).
- **Base giuridica:** legittimo interesse / obbligo legale.
- **Sistemi:** fogli `UtmLog`, `UnsubscribeLog`, `ForgetAudit`, `ConsensiLog`.

---

## Responsabili e sub-responsabili (art. 28) e trasferimenti

| Fornitore | Ruolo | Cosa tratta | Trasferimento extra-UE |
|---|---|---|---|
| **Google** (Workspace / Apps Script / Sheets / Gmail) | Responsabile | Hosting app, archiviazione dati, invio email | Possibile USA — SCC / Data Privacy Framework 🔎 (accettare Google DPA) |
| **Anthropic, PBC** (Claude) | Responsabile | Elaborazione di **soli contenuti pubblici** (bandi/news); **nessun dato personale dei referenti** | USA — SCC/DPF 🔎 (accettare Anthropic DPA) |
| **Telegram** | Strumento di notifica interna | Notifiche all'admin **senza dati identificativi diretti** (solo museo/regione/score) | Extra-UE 🔎 |

---

## Misure di sicurezza adottate
- Accesso ai dati riservato al Titolare (account Google) e alle funzioni admin protette da token di sessione (livello editor/admin).
- Funzioni che espongono dati personali (lista lead, mailing list) **non accessibili in forma anonima** (gate server-side, v4.23.0).
- Notifiche esterne (Telegram) prive di email/nome (v4.23.0).
- Diritto alla cancellazione esteso a **tutti** i fogli con dati personali, incluso `UtmLog` (`forgetMyData`, v637).
- **Minimizzazione/retention**: funzione `purgeContattiObsoleti()` (Privacy_v1.js) per la rimozione dei contatti rifiutati/sospesi oltre N mesi (in fase di test eseguita su iniziativa del Titolare; predisposta per trigger periodico al passaggio a regime).
- Registro dei consensi con data/ora e versione del testo (`ConsensiLog`, v4.23.0).
- Sanitizzazione anti-formula sui dati scritti nei fogli; validazione delle URL di redirect (anti open-redirect/XSS, v4.23.2).
- Trasmissione in HTTPS; token di sessione generati con funzione crittografica (UUID).

---

## Diritti degli interessati
Accesso, rettifica, cancellazione, limitazione, portabilità, opposizione, revoca del consenso. Esercizio: sinopiaconsulting@gmail.com, link di disiscrizione nelle email (interrompe le comunicazioni e disattiva il contatto; cancellazione completa su richiesta), funzione "Cancella i miei dati" in app. Reclamo: Garante (www.gpdp.it).

---

### Da completare/validare (Titolare)
- [ ] Confermare DPO (di norma non obbligatorio per Srl di questa dimensione).
- [ ] Accettare/archiviare **Google DPA** e **Anthropic DPA**.
- [ ] Confermare i periodi di conservazione 🔎.
- [ ] Firmare e datare il registro.
