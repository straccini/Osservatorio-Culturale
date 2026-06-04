# Piano di implementazione — Pagina IMPOSTAZIONI (Sinopia)

**Base:** mappatura file-per-file (3 agenti) di digest, pannello risorse, manutenzione.
**Scoperta chiave:** quasi tutto ciò che sembra "mancante" (Norme/Leggi, Social Wall, gestione video) **ha già backend + UI completi**, ma è dentro **tab nascosti** (`display:none`) o handler senza bottone. Il lavoro è soprattutto **riorganizzare ed esporre**, non costruire da zero.

---

## PRIORITÀ 0 — Verifica DIGEST 3 tipologie (da fare per prima)

### Stato reale
I "3 destinatari" non sono 3 sistemi puliti: ci sono **4 sistemi di digest sovrapposti**.

| Tipologia | Come è gestita oggi | Stato | Problema |
|---|---|---|---|
| **LETTORE** (iscritto base) | Coorte A di `sendDigestAuto2coorti` (foglio MailingList) — lun 07:00 | ✅ funziona | cron non controllabile da UI (solo testo) |
| **PROFILATO** (lead) | Coorte B "tematico/fallback" — lun 07:00 | ✅ funziona | match per keyword hardcoded (debole) |
| **MATRIX** (compilatore) | **3 strade diverse**: Coorte B-matrix (lun) + coda `Matrix_digest` (mar) + email Agenti AI (daily 07:30) | ⚠️ frammentato | **lo stesso utente può ricevere 3 email** (nessun anti-duplicato); digest **vuoto** se il tagger `MatrixDim` non gira; email Agenti **invisibili** in UI |
| (GENERALISTA newsletter) | `adminGenerateDigestDraft` + approvazione Telegram — manuale | ✅ funziona | **doppione** con Coorte A (due template per gli stessi iscritti) |
| (LEGACY `sendDigestAuto`) | nessun trigger | 🗑️ orfano | da rimuovere |

### Cosa c'è già nel pannello Digest (`#page-digest`)
KPI, "Prepara newsletter" + preview, test su mia email, "Genera digest Matrix", "Invia bozze pending", controlli cron Matrix (attiva/stop/esegui-ora), Telegram, storico invii.

### Cosa MANCA (azioni)
1. **Anti-duplicato cross-sistema**: registro "ultimo invio per email" → non inviare a chi è già stato contattato negli ultimi N giorni (oggi il destinatario Matrix prende fino a 3 email). 🔴
2. **Anteprima per destinatario**: `previewDigestPerEmail` esiste già lato server ma **non è collegata** → aggiungere campo email + iframe.
3. **Esporre il cron Lettore+Profilato (coorte A+B)** in UI (oggi solo testo statico): bottoni attiva/stop/esegui-ora/**dry-run** su `sendDigestAuto2coorti`.
4. **Wirare le email Agenti** (`previewAgentEmail`/`sendAgentEmailForced`/`getAgentEmailStats`): esistono ma **zero UI**.
5. **Garantire il tagging `MatrixDim`** prima del digest Matrix (oggi se non gira → digest vuoto), o fallback per-dimensione.
6. **Unificare la fonte-verità destinatari**: oggi 4 letture diverse (MailingList / Sessioni / ContactsMatrix / Utenti). Una sola `getDigestAudience()` → {lettori, profilati, matrix}.
7. **Risolvere il doppio generalista** (Coorte A vs newsletter): un solo template/flusso per gli iscritti base.
8. **Rendere "Test mio profilo" un vero dry-run** (oggi invia davvero a te) + rimuovere il legacy `sendDigestAuto/sendDigest`.

➡️ **Risultato atteso:** un pannello "Digest" che mostra i 3 segmenti (Lettore / Profilato / Matrix) con, per ciascuno: n. destinatari, anteprima, invio manuale + dry-run, stato del cron, e **un solo invio per persona**.

---

## PRIORITÀ 1 — Pannello unico risorse esteso (la più importante per te)

### Stato reale
Il **tab Fonti** (visibile) gestisce già con CRUD completo: **bandi, news, podcast, video**.
**Libri, Norme/Leggi, Social Wall** hanno **backend + UI + handler già pronti e funzionanti**, ma stanno nel **tab "altre" che è `display:none`** → di fatto irraggiungibili dall'interfaccia. Non manca il codice: manca l'**accesso**.

| Tipo | CRUD nel pannello? | Backend | Cosa serve |
|---|---|---|---|
| Bandi / News / Podcast / Video | ✅ sì | ✅ | niente |
| **Libri** | ❌ (tab nascosto) | ✅ `addLibro`/`setupLibri` | **esporre UI** (manuale, no scanner) |
| **Norme/Leggi** | ❌ (tab nascosto) | ✅ `addNorma`/`getNormeList`/`setupNormeSheet` | **esporre UI** + (opz.) scanner `scanNorme` |
| **Social Wall** | ❌ (tab nascosto) | ✅ CRUD completo + seed | **solo esporre UI** (tutto pronto) |

### Implementazione
1. **Riportare Libri + Norme + Social** nel pannello principale: due opzioni —
   - **(a) rapida**: rendere visibile il tab "altre" (togliere `display:none`) e rinominarlo "Libri · Norme · Social". *Mezz'ora.*
   - **(b) pulita**: estendere il **pannello Fonti unificato** con questi tipi (filtro tipo: + Libri/Norme/Social), così tutto si gestisce da un'unica tabella con add/attiva/elimina/archivia. *Mezza giornata.* ← consigliata.
2. **Norme/Leggi**: oggi solo inserimento manuale. Se vuoi monitoraggio automatico, aggiungere uno `scanNorme` (come per news) su fonti dedicate (es. Gazzetta/MiC) — *progetto a sé, fase 2*.
3. **Video**: già gestiti; ricordare che il foglio va popolato con `seedVideoEMigra` (i canali YouTube).
4. **Rimuovere i tab nascosti ridondanti** `bandi` e `podcast` (assorbiti dal pannello Fonti) e togliere la `reloadFontiBandiTable()` inutile all'avvio.

➡️ **Risultato:** un solo pannello "Risorse/Fonti" che gestisce **tutti e 7 i tipi** (bandi, news, podcast, video, libri, norme, social).

---

## PRIORITÀ 2 — Manutenzione archivio / cestino (bandi scaduti)

### Stato reale
- **Archivio** = soft-delete in-place (flag sulla riga) per bandi/news/podcast/video/libri. ✅ funziona. (Norme/Social **non** hanno archivio.)
- **"Cestino" è finto**: `emptyTrash` opera solo su una variabile lato browser (`_trash={}`), nessun backend. Illude.
- **Bandi scaduti**: archiviati **fino a 3 volte al giorno** (sasRun MA1+MA4+MA5) con 3 funzioni e soglie diverse (0gg vs 30gg). Ridondante.
- **`autoDeleteVeryOld`**: ⚠️ **cancella TUTTI gli archiviati**, non solo i >12 mesi come dice la UI, e **non è gated admin** (solo conferma lato client). Pericoloso.
- Comando manuale "pulizia scaduti" (`f2Cleanup`) esiste ma **senza bottone**.

### Implementazione
1. **Consolidare l'archiviazione bandi scaduti** in **una sola** funzione canonica (`cleanupBandiV5Scaduti(30)`) con soglia unica; rimuovere i richiami doppi MA4/MA5 e il trigger standalone GAL.
2. **Cestino reale o rimosso**: o si implementa un soft-delete vero (stato `cestino` + svuotamento gated admin + auto-purge >30gg), oppure si toglie la voce "Cestino" per non illudere. *(Consiglio: trasformarlo in "Archivio → Elimina definitivamente" gated, senza un terzo stato.)*
3. **`autoDeleteVeryOld`**: applicare davvero la soglia mesi + `_isCurrentUserAdmin_()`.
4. **Sezione "Manutenzione" in Impostazioni** con bottoni chiari: *Archivia vecchi (30gg)* · *Archivia bandi scaduti ora* · *Elimina definitivamente archiviati >12 mesi (admin)* · *Ripristina*. Con conferma e report.

---

## PRIORITÀ 3 — Manutenzioni periodiche di allineamento

### Stato reale
Esistono molte funzioni di allineamento ma **quasi tutte solo da editor GAS** o come handler senza bottone:
- **Dedup**: due sistemi in conflitto (`dailyDedupCheck` cancella vs `dedupTuttiIFogli` archivia).
- **Quality check bandi**: eseguito **doppio** (MA2 + MA6) nello stesso ciclo.
- **Verifica fonti vive/morte** (bandi e news), **bonifica morte**, **audit fogli**, **consolidamento fonti**: tutte solo da GAS.
- Handler UI orfani (codice ma niente bottone): `qcBandi*`, `f2DedupItems`, `_dedupTuttiRun_`, `installQcTrigger`.

### Implementazione
1. **Card "Manutenzione periodica"** in Impostazioni che espone, con *ultimo esito* + bottone *Esegui ora*:
   - Verifica fonti bandi vive/morte (`verificaFontiBandi` + `bonificaFontiBandiMorte`)
   - Verifica fonti news (`verificaFontiNews` + `potaFontiMorte`)
   - Quality check bandi (`qualityCheckBandi`) — con report
   - Dedup contenuti (una sola policy, reversibile)
   - Audit fogli (`auditFogli`) — sola lettura
2. **Eliminare i doppioni** nel supervisore: un solo dedup, un solo quality-check, un solo punto di archiviazione scaduti.
3. **Collegare gli handler orfani** ai relativi bottoni (i div report `qcBandiReport`/`dedupReport` li aspettano già) o rimuoverli.

---

## PRIORITÀ 4 — Pulizia/riordino della pagina Impostazioni

- **Unificare la configurazione**: oggi è divisa tra `#page-admin` (config commerciale: calendario, PDF) e tab "Configurazione". Un solo punto.
- **De-duplicare**: azioni Archivia/Elimina compaiono in 2 tab; stats duplicate (`#page-stats` ≡ tab "gestione"); diagnostica duplicata. Tenerne una.
- **Tab finali consigliati** (visibili, non doppi):
  **Risorse** (fonti+tutti i 7 tipi) · **Digest** · **Utenti** · **Segnalazioni** · **Manutenzione** (archivio/cestino + periodiche) · **Configurazione** (setup+commerciale+sistema) · **Diagnostica/Backup**.
- Rimuovere/recuperare i 5 tab nascosti (`bandi`, `podcast`, `altre`, `gestione`, `diagnostica`).

---

## Roadmap suggerita (efficienza)

| Fase | Cosa | Effort | Valore |
|---|---|---|---|
| **F1** | Digest: anti-duplicato + esporre cron coorti + anteprima per email + wiring email Agenti + dry-run reale | 1 g | alto (eviti spam, controllo reale) |
| **F2** | Pannello risorse: estendere a Libri/Norme/Social (opz. b) + rimuovere tab nascosti ridondanti | 0,5 g | alto (gestione completa) |
| **F3** | Manutenzione: cestino vero o rimosso + archiviazione scaduti unica + autoDelete sicuro + sezione bottoni | 0,5 g | medio-alto (sicurezza dati) |
| **F4** | Manutenzioni periodiche: card con esegui-ora + report; eliminare doppioni supervisore | 0,5 g | medio |
| **F5** | Riordino tab + config unica + de-dup | 0,5 g | medio (chiarezza/credibilità) |

*Le fasi sono indipendenti e si possono dare a Claude Code una alla volta in flusso continuo. F1 (digest) per prima, come richiesto.*
