# Brief Claude Code — Riorganizzazione pagina IMPOSTAZIONI

**Progetto:** Sinopia / Osservatorio Culturale (Google Apps Script web app)
**Razionale e mappatura completa:** `docs/PIANO_IMPOSTAZIONI.md` (leggere prima)
**Obiettivo:** rendere la pagina Impostazioni completa e ordinata: gestione **digest 3 tipologie**, **pannello unico risorse** esteso a tutti i tipi, **manutenzione** archivio/cestino/bandi scaduti, **manutenzioni periodiche**. Massima efficienza, nessuna regressione sul flusso pubblico.

## MODALITÀ DI ESECUZIONE
- **Flusso unico e continuo**: FASI 1→5 in sequenza, **senza fermarsi** per approvazione. **Un commit per fase**, poi prosegui.
- **Efficienza**: FASE 2 e FASE 5 toccano entrambe il blocco `#page-settings` di `Index.html` → leggilo **una volta** e applica le modifiche di entrambe (puoi committare separatamente). Stesso per i file digest in FASE 1.
- Riporta **solo alla fine** (riepilogo per fase + commit + Definition of Done), o fermati su blocco reale.
- Quasi tutto è **area admin** (basso rischio per il pubblico anonimo). Eccezione sensibile: la logica di **invio digest** (FASE 1) — testa con dry-run, non inviare email reali durante lo sviluppo.
- Vincoli GAS: scope globale unico; gating admin via `_isCurrentUserAdmin_()` (token-based) su ogni azione distruttiva/di invio; segreti in ScriptProperties; `clasp push` (deploy manuale lo fa l'utente).
- **NON toccare** il login email/magic-link (fuori scope, come da round precedente).

---

## FASE 1 — DIGEST: 3 tipologie gestibili da un pannello, senza spam (PRIORITÀ)
**File:** `Digest_routing.js`, `Matrix_digest.js`, `AgentDigest.js`, `DigestService.js`, `Codice.js`, `Admin_v44.js`, `Index.html` (#page-digest), `Constants.js`

1. **🔴 Anti-duplicato cross-sistema** — oggi un compilatore Matrix può ricevere fino a **3 email** (coorte B `Digest_routing.js:284`, coda Matrix `Matrix_digest.js:257`, agenti `AgentDigest.js:31`). Introdurre un registro "ultimo invio per email" (foglio `DigestSentLog` o ScriptProperty) scritto da TUTTI i mittenti; ogni invio salta i destinatari contattati negli ultimi `OC_DIGEST_DEDUP_DAYS` (default 5). *Accettazione: nessuna email allo stesso indirizzo entro la finestra, qualunque sia il sistema.*
2. **🔴 Garantire il tagging Matrix** — `generateDigestForUser` (`Matrix_digest.js:75`) si svuota se la colonna `MatrixDim` non è popolata (`_queryContenutiPerDim_:316` → `[]`). Prima della generazione, lanciare il tagger (`Matrix_tagger`) se i contenuti recenti non sono taggati, **oppure** aggiungere un fallback per-dimensione (contenuti per ambito mappato). *Accettazione: il digest Matrix non ha sezioni vuote quando ci sono contenuti recenti.*
3. **🟠 Esporre il cron Lettore+Profilato in UI** — la card "Automazione" (`Index.html:1574`) è solo testo. Aggiungere bottoni **Attiva / Stop / Esegui ora / Dry-run** per `sendDigestAuto2coorti` (la funzione accetta già `{dryRun:true}`), con stato del trigger, come già fatto per il cron Matrix (`Index.html:5608-5660`). *Accettazione: l'admin avvia un dry-run e vede il report senza inviare.*
4. **🟠 Anteprima per destinatario** — `previewDigestPerEmail` (`Digest_routing.js:470`) esiste ma non è collegata. Aggiungere nel pannello un campo email + bottone "Anteprima" + iframe che mostra cosa riceverà quell'indirizzo. *Accettazione: incollo un'email e vedo il suo digest.*
5. **🟠 Wirare le email Agenti nel pannello** — `previewAgentEmail`, `sendAgentEmailForced`, `getAgentEmailStats` (`AgentDigest.js`) non sono in nessun HTML. Aggiungere una sotto-sezione "Email Agenti (musei profilati)" con anteprima, invio forzato (gated admin) e statistiche. *Accettazione: le email agenti sono visibili e gestibili dalla UI.*
6. **🟠 `getAgentEmailStats` formato** — ritorna `{perAgente:int}` ma chi lo legge si aspetta `{byAgent:{id:{sent,failed,lastSent}}}` (`AgentAdmin.js:130`). Allineare (vedi anche brief Round 2). *Accettazione: le statistiche invii non sono più sempre 0.*
7. **🟡 "Test mio profilo" = dry-run** — `testGenerateDigestSegmentato` (`Matrix_digest.js:561`) **invia davvero** a te. Renderlo dry-run (anteprima) o aggiungere conferma esplicita "invio reale".
8. **🟡 Rimuovere il legacy** `sendDigestAuto`/`sendDigest` (`DigestService.js:168/183`, orfani) e allineare `getDigestLog` (`Codice.js:2347`) allo schema realmente scritto (righe posizionali senza header `DataInvio`).
9. **🟡 Doppio generalista** — coorte A (`buildDigestHTML`) e newsletter (`buildNewsletterHtml_`) sono due flussi per gli stessi iscritti base: scegliere un solo template/flusso (consigliato: tenere la newsletter con approvazione Telegram come "generalista" ufficiale, e usare la coorte A solo per chi non è nella newsletter).
10. **🟡 Centralizzare** frequenze/soglie/subject digest in `Constants.js` (oggi sparsi in 5 file), così il pannello potrà diventare configurabile.

*Commit:* `feat(digest): anti-duplicato + cron coorti in UI + anteprima/email agenti + dry-run (impostazioni F1)`

---

## FASE 2 — PANNELLO UNICO RISORSE esteso a tutti i tipi
**File:** `Index.html` (#page-settings, tab Fonti)

Stato: il tab **Fonti** (`reloadFontiUnified` `Index.html:5780`) gestisce già bandi/news/podcast/video. **Libri, Norme/Leggi, Social Wall** hanno backend+UI già pronti ma nel tab **`altre` nascosto** (`display:none`, `Index.html:1649-1655`; card Libri:1829, Norme:1871, Social:1905).

1. **Integrare Libri/Norme/Social nel pannello principale** (opzione pulita): estendere il filtro tipo del pannello Fonti con **Libri, Norme, Social**, e popolare la tabella unificata anche con questi tipi tramite i backend già esistenti:
   - Libri: `getLibriListV42`/`addLibro`/`setupLibri` (foglio `Pubblicazioni`).
   - Norme: `getNormeList`/`addNorma`/`setupNormeSheet` (`UltimiBandi.js:499-547`, foglio `Norme`).
   - Social: `getSocialFontiList`/`addSocialFonte`/`toggleSocialFonteField`/`deleteSocialFonteById`/`seedSocialFontiIstituzionali` (`Codice.js:2684-2725`, foglio `SocialFonti`).
   I relativi handler frontend esistono già (`saveLibroSettings:3111`, `saveNormaSettings:3136`, social `10940-10998`) — riusarli.
   *(Alternativa rapida se serve: rendere semplicemente visibile il tab `altre` rinominandolo "Libri · Norme · Social". Ma l'integrazione nel pannello unico è l'obiettivo.)*
2. **Rimuovere i tab nascosti ridondanti** `bandi` e `podcast` (assorbiti dal pannello Fonti) e togliere la chiamata inutile `reloadFontiBandiTable()` da `loadSettingsPage` (`Index.html:5673`).
3. **Nota** (non in questa fase): Norme/Libri sono solo inserimento manuale (nessuno scanner) — va bene; un eventuale `scanNorme` è un progetto separato.

*Accettazione: dal pannello Risorse si gestiscono (aggiungi/attiva/elimina/archivia) tutti e 7 i tipi: bandi, news, podcast, video, libri, norme, social.*
*Commit:* `feat(impostazioni): pannello risorse unico esteso a libri/norme/social + rimozione tab ridondanti (F2)`

---

## FASE 3 — MANUTENZIONE archivio / cestino / bandi scaduti
**File:** `Workflow_unified.js`, `Bandi_v5.js`, `GalMonitor.js`, `AgentSupervisore.js`, `Codice.js`, `Backend_v415.js`, `Index.html`

1. **🔴 Cestino reale o rimosso** — `emptyTrash` (`Index.html:8629`) opera solo su `_trash={}` client, nessun backend. **Scelta consigliata**: eliminare il concetto "Cestino" come terzo stato e trasformarlo in "Archivio → Elimina definitivamente" (vedi punto 2). In alternativa, implementare un soft-delete vero (stato `cestino` + svuotamento gated admin + auto-purge >30gg). *Accettazione: nessuna voce UI che finge di fare qualcosa.*
2. **🔴 `autoDeleteVeryOld` sicuro** — oggi cancella **TUTTI** gli archiviati ignorando la soglia mesi (`Workflow_unified.js:298,301`) e non è gated admin. Applicare davvero il filtro età (`>12 mesi`) + `_isCurrentUserAdmin_()`. *Accettazione: elimina solo gli archiviati più vecchi della soglia, solo se admin.*
3. **🟠 Archiviazione bandi scaduti UNIFICATA** — oggi 3 funzioni (`cleanupBandiV5Scaduti` `Bandi_v5.js:2261`, `autoArchiviaBandiScaduti` `GalMonitor.js:573`, `autoArchiviaScaduti` `Codice.js:2026`) girano fino a 3×/giorno (sasRun MA1 `AgentSupervisore.js:390` + MA4:168 + MA5:183) con soglie diverse. Tenere **una** funzione canonica (`cleanupBandiV5Scaduti(30)`), rimuovere i richiami doppi e il trigger standalone GAL. *Accettazione: i bandi scaduti vengono archiviati una sola volta/giorno con soglia 30gg.*
4. **🟠 Sezione "Manutenzione" in Impostazioni** con bottoni chiari + conferma + report: *Archivia vecchi (30gg)* (`runAutoArchive`), *Archivia bandi scaduti ora* (`cleanupBandiV5Scaduti`, collegare l'handler orfano `f2Cleanup` `Index.html:10770`), *Elimina definitivamente archiviati >12 mesi* (gated), *Esporta archivio CSV* (`exportArchivio`). *Accettazione: l'admin lancia ognuna dal pannello e vede l'esito.*

*Commit:* `fix(impostazioni): manutenzione archivio sicura + cestino + scaduti unificati (F3)`

---

## FASE 4 — MANUTENZIONI PERIODICHE di allineamento (esposte in UI)
**File:** `BandiConsolida.js`, `FontiFeed.js`, `Bandi_v5.js`, `Sheet_Cleanup.js`, `AgentSupervisore.js`, `Index.html`

1. **Card "Manutenzione periodica"** in Impostazioni che, per ciascuna voce, mostra *ultimo esito* + bottone *Esegui ora* (collegare le funzioni già esistenti, alcune con handler orfani da cablare):
   - **Verifica fonti bandi vive/morte** → `verificaFontiBandi` (`BandiConsolida.js:449`) + `bonificaFontiBandiMorte` (`:499`).
   - **Verifica fonti news** → `verificaFontiNews` (`FontiFeed.js:403`) + `potaFontiMorte` (`:716`).
   - **Quality check bandi** → `qualityCheckBandi` (`Bandi_v5.js:2565`); collegare gli handler orfani `qcBandiAudit/qcBandiFixDup/qcBandiFixTem` (`Index.html:9970-9978`, i div report esistono già).
   - **Dedup contenuti** → una sola policy reversibile; collegare `_dedupTuttiRun_` (`Index.html:9228`).
   - **Audit fogli** (sola lettura) → `auditFogli` (`BandiConsolida.js:178`).
2. **Eliminare i doppioni nel supervisore** (`sasRun`): quality-check eseguito due volte (MA2 `AgentSupervisore.js:457` + MA6:195) → tenerne uno; due dedup news in conflitto (`dailyDedupCheck` hard `Sheet_Cleanup.js:442` vs `dedupTuttiIFogli` soft `Bandi_v5.js:2531`) → scegliere la policy soft/reversibile.
3. **Evitare doppia schedulazione**: alcune funzioni hanno sia trigger dedicato (`setupQualityCheckBandiTrigger` 05:00, `setupDedupAutoTrigger` lun 06:30) sia esecuzione in `sasRun` → tenerne una sola.

*Accettazione: l'admin lancia le manutenzioni dal pannello con report; nessuna manutenzione gira due volte nello stesso ciclo.*
*Commit:* `feat(impostazioni): manutenzioni periodiche esposte in UI + deduplica supervisore (F4)`

---

## FASE 5 — RIORDINO pagina Impostazioni
**File:** `Index.html` (#page-settings, #page-admin), `Styles.html`

1. **Unificare la configurazione**: spostare la "Configurazione commerciale" (calendario, PDF) da `#page-admin` (`Index.html:955-1028`) dentro il tab **Configurazione** di `#page-settings`. Un solo punto di config.
2. **De-duplicare**: azioni Archivia/Elimina presenti in 2 tab (`Index.html:2031-2033` e `2268-2269`) → tenerle solo nella nuova sezione Manutenzione; stats duplicate (`#page-stats:1455` ≡ tab `gestione:2045`) → tenerne una; diagnostica duplicata (`#page-fonti-diagnostica:1463` ≡ tab `diagnostica`) → una.
3. **Recuperare/rimuovere i tab nascosti** `gestione` e `diagnostica` (contenuto utile ma orfano: stats, release log, email log, stato fonti, conteggi fogli) → integrarli in Diagnostica/Backup; rimuovere `bandi`/`podcast`/`altre` ormai assorbiti.
4. **Tab finali (visibili, non doppi):** **Risorse · Digest · Utenti · Segnalazioni · Manutenzione · Configurazione · Diagnostica/Backup**. Aggiornare `switchSettingsTab` (`Index.html:5677`) e la barra tab (`:1629`).

*Accettazione: nessun tab nascosto irraggiungibile; nessuna azione/stat duplicata; configurazione in un solo punto.*
*Commit:* `refactor(impostazioni): riordino tab, config unica, de-duplicazione (F5)`

---

## Definition of Done
- [ ] **Digest**: 3 tipologie gestibili dal pannello; nessuna email doppia allo stesso destinatario; cron coorti con dry-run; anteprima per email; email agenti visibili; "test" non invia di nascosto; legacy rimosso.
- [ ] **Risorse**: pannello unico con tutti e 7 i tipi (bandi/news/podcast/video/libri/norme/social); tab ridondanti rimossi.
- [ ] **Manutenzione**: cestino reale o rimosso; `autoDeleteVeryOld` rispetta età + admin; bandi scaduti archiviati una sola volta; sezione con bottoni e report.
- [ ] **Periodiche**: verifica fonti/quality/dedup/audit esposte con esegui-ora; doppioni supervisore rimossi.
- [ ] **Riordino**: tab puliti, config unica, niente duplicati.
- [ ] `clasp push` ok; nessuna regressione sul flusso pubblico; login non toccato.

*Al termine: riepilogo per fase con i commit e lo stato della Definition of Done. Deploy manuale (stesso URL) e nuova verifica a cura dell'utente.*
