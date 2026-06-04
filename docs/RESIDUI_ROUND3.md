# Residui Round 3 (NON-login) — da chiudere

**Base:** verifica file-per-file dopo i brief Round 2 + Impostazioni. La maggior parte è fatta; questi sono i punti **non realizzati o regrediti**. Il login è trattato a parte (`BRIEF_CLAUDE_CODE_LOGIN.md`).

> Esecuzione: flusso unico continuo, un commit per gruppo, report finale.

---

## 🔴 R3-1 — Configurazione commerciale orfanata e IRRAGGIUNGIBILE (regressione)
`#page-admin` (`Index.html:955-1031`) contiene gli **unici** controlli per URL calendario consulenza + PDF Musei Sensibili (`cfgCalendarUrl`/`cfgMuseiSensibili`/`saveCommercialConfig`, `:1014-1022`) e per il supervisore manuale, MA la pagina è **redirezionata via** (`Index.html:2167` `if(page==='admin'){go('settings');return;}`) e il contenuto NON è stato spostato. → **L'admin non può più impostare il calendario/PDF dall'interfaccia.**
**Fix:** spostare la card "Configurazione commerciale" e i controlli SAS nel tab **Configurazione** di `#page-settings`; rimuovere il redirect orfano. *Accettazione: l'admin configura calendario/PDF e lancia il supervisore dal pannello Impostazioni.*

## 🔴 R3-2 — Supervisore notturno NON archivia i bandi scaduti di Bandi_v5 (regressione funzionale)
`sasRun` → MA5 chiama `cleanupBandiV5Scaduti(30)` (`AgentSupervisore.js:174`) che è **gated admin** (`Bandi_v5.js:2262`). Sotto trigger (e dal bottone "Esegui ciclo supervisore" `Index.html:9761`) NON c'è token utente → `_isCurrentUserAdmin_()` = false → **`forbidden`** → i bandi scaduti del foglio Bandi_v5 non vengono archiviati.
**Causa sistemica:** alcune funzioni di manutenzione sono state gated in FASE 1 ma sono **anche chiamate da trigger** (senza contesto utente). **Verificare TUTTE le funzioni gated `_isCurrentUserAdmin_` che sono anche schedulate/chiamate da `sasRun`/trigger** e applicare il pattern: *gating solo quando la chiamata arriva dal frontend* (es. una variante interna `_cleanupBandiV5ScadutiSystem_` senza gate per i trigger, oppure `if (chiamataDaFrontend && !admin) return forbidden`).
**Inoltre** consolidare: oggi i bandi scaduti sono archiviati da **MA1** (`autoArchiveOld('bando')` su foglio RADAR, `:381`) **e** MA5 (Bandi_v5) → tenere un solo punto canonico che copra il foglio attivo (`Bandi_v5`).

## 🔴 R3-3 — "Cestino" ancora finto
`#page-cestino` (`Index.html:782`) + `emptyTrash` (`:8538-8545`) operano solo su `_trash={}` lato browser (il confirm stesso lo ammette). → rimuovere la voce "Cestino" (e usare solo Archivio → Elimina definitivamente, già sicuro), **oppure** implementare un soft-delete reale con foglio + svuotamento gated. *Accettazione: nessuna voce UI che finge.*

## 🔴 R3-4 — Digest Matrix può uscire VUOTO (tagging non garantito)
`_queryContenutiPerDim_` (`Matrix_digest.js:323/338`) ritorna `[]` se la colonna `MatrixDim` non è popolata; nessun fallback. → prima di `generateDigestForUser`, lanciare il tagger se i contenuti recenti non sono taggati, **oppure** fallback per-ambito (contenuti dell'ambito mappato alla dimensione). *Accettazione: nessuna sezione vuota quando esistono contenuti recenti.*

## 🟠 R3-5 — Pannello Risorse: Libri/Norme/Social solo "aggiungi"
`_addFonteUniversale` gestisce l'inserimento di tutti e 7 i tipi, ma la **tabella** unificata (`reloadFontiUnified` `Index.html:5595-5615`, renderer `:5626`) conosce solo bandi/news/podcast/video → selezionando Libri/Norme/Social la lista è **vuota** (niente toggle/elimina). → estendere `reloadFontiUnified` + renderer per fetchare e mostrare anche `getLibriListV42`/`getNormeList`/`getSocialFontiList` con attiva/elimina. *Accettazione: CRUD completo per tutti e 7 i tipi.*

## 🟠 R3-6 — Benchmark reale nel PDF Matrix
`_matrixGetBenchmarkForProfile_` (`Matrix_v1.js:723`) ritorna ancora `{placeholder:true}` → il PDF mostra "Benchmark in costruzione". Cablare `getMatrixCompareWithBenchmark` (`Matrix_benchmark_v1.js:119`, già funzionante a schermo). *Accettazione: il PDF mostra il benchmark reale.*

## 🟠 R3-7 — SurveyPublic radar 9 vs testo 10
Il sondaggio breve dichiara "10 dimensioni/assi" (`SurveyPublic.html:218,248,376`) ma `buildRadar9`/`renderReport` disegnano **9 assi** (`:316-357`). → allineare a 10 **oppure** etichettare esplicitamente "anteprima a 9 assi". *Accettazione: numeri coerenti col Matrix completo.*

## 🟠 R3-8 — "Test mio profilo" invia email reali
`testGenerateDigestSegmentato` → `sendQueuedDigest` (`Matrix_digest.js:568`) invia davvero senza conferma. → renderlo dry-run o aggiungere conferma "invio reale".

## 🟡 R3-9 — Dettagli digest
- Report dry-run coorti mostra sempre 0: l'handler legge `coorteA_count/sent` (`Index.html:6903,6917`) ma `report` espone `generalisti_inviati/leadCaldi_inviati` (`Digest_routing.js:235`). Allineare i nomi.
- `getDigestLog` legge `DataInvio` inesistente nelle righe posizionali (`Codice.js:2334`) → data non mostrata.
- `sendQueuedDigest` singolo senza quota check (`Matrix_digest.js:239`).
- `_previewForEmail` su lead Matrix crea una bozza spuria in DigestQueue (`Matrix_digest.js:114`) → l'anteprima non deve scrivere.
- Bottoni cron coorti: mancano Attiva/Stop del trigger (ci sono solo Dry-run/Esegui).

## 🟡 R3-10 — Pulizia varia
- `reloadFontiBandiTable()` inutile ancora in `loadSettingsPage` (`Index.html:5419`) + branch tab `bandi`/`podcast`/`gestione`/`diagnostica` in `switchSettingsTab` (`:5423-5440`) → rimuovere.
- Redirect `stats→gestione` / `fonti-diagnostica→diagnostica` (`Index.html:2179-2180`) puntano a tab inesistenti → vista vuota (latente).
- `UrlBando` in `COL_NAMES.LINK` (`Codice.js:1681`) + `enableBandiV5()` auto in `runAllSetupV418` (ridondanza richiesta, oggi coperta da `_radarBandiRows_` schema-safe).
- `emptyTrash` accumula `audit_emptyTrash_<ts>` in ScriptProperties senza retention (`Backend_v415.js:397`).
- `validateHttpsCertificates:false` globale → limitare alle fonti inaffidabili.
- Codice morto sotto i `return` deprecato in `DigestService.js:172-234`.

---

## Definition of Done
- [ ] Config commerciale + SAS raggiungibili da Impostazioni (R3-1).
- [ ] Bandi scaduti archiviati dal supervisore (gating compatibile con trigger) + un solo punto (R3-2).
- [ ] Cestino reale o rimosso (R3-3).
- [ ] Digest Matrix mai vuoto (R3-4).
- [ ] Pannello Risorse CRUD completo 7 tipi (R3-5).
- [ ] Benchmark PDF reale (R3-6); survey radar coerente (R3-7); test=dry-run (R3-8).
- [ ] Dettagli digest + pulizia (R3-9, R3-10).
