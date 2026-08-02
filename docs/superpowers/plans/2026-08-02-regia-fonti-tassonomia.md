# Regia fonti, tassonomia T1–T10, agenti — piano verso il lancio di settembre

**Data**: 2026-08-02 · **Decisioni confermate da Silvano** (sessione 02/08)
**Obiettivo**: lancio nazionale a settembre. Il sistema deve essere completo,
preciso, consultabile con ordine. Niente pagine inutili, niente comandi morti.

---

## Decisioni architetturali (confermate)

1. **Due registri fonti**:
   - `FontiBandi_v5` — dedicato al Radar Bandi (resta com'è: tier A/B/C,
     natura bandi/news, semaforo, contatori)
   - `RegistroFonti` — NUOVO foglio unico per TUTTE le altre categorie:
     news, lavoro, podcast, video, norme, libri, social — estensibile a
     categorie future senza cambiare schema
2. **Tassonomia T1–T10** con grado di aderenza 0–100, applicata a nuovi
   contenuti + attivi/esposti (non all'archivio profondo)
3. **Due famiglie di agenti**:
   - **Scout** — cercano NUOVE fonti per categoria; le candidate entrano in
     coda di approvazione (assunzione: nessuna fonte entra in produzione
     senza ok admin, coerente col flusso trend/newsletter)
   - **Redattori** — gestiscono le informazioni delle fonti: assegnano
     categoria, tipologia T1–T10, grado di aderenza, compilano tutti i campi
4. **Candidature Capitali/UNESCO** — sezione autonoma della webapp, fuori
   dal Radar Bandi (le candidature hanno cicli lunghi, non scadenze da bando)

## Tassonomia (fonte: Silvano, 02/08)

| Cod. | Nome | Ambito |
|---|---|---|
| T1 | Riqualificazione, progettazione, musealizzazione spazi della cultura | 03 Programma |
| T2 | Sistemi HW/SW e AI per la fruizione | 05 Digital & Gov |
| T3 | Accessibilità integrata (LIS, ETR, CAA, Braille) | 02 Inclusione |
| T5 | Audience, partecipazione, welfare culturale, co-progettazione | 04 Comunità |
| T6 | Gestione e valorizzazione patrimonio per EE.PP. | 05 Digital & Gov |
| T7 | Sviluppo asset turistici a base culturale | 04 Comunità |
| T8 | Sviluppo territoriale integrato (GAL, distretti) | 04 Comunità |
| T9 | Creazione e gestione contenuti culturali e museali | 01 Identità |
| T10 | Altre espressioni culturali pertinenti (design, arti performative, turismo culturale non-T7) | trasversale |

Nota: T4 non esiste nella numerazione ufficiale — NON inventarlo.
Ogni contenuto riceve: `Tipologia` (una principale, eventuali secondarie),
`Aderenza` (0–100). Sotto soglia di aderenza (da tarare, default 40) il
contenuto è pertinente ma non classificabile → T10 o scarto motivato.

## Schema RegistroFonti (formale, 24 colonne)

```
ID · Categoria · Nome · Ente/Gruppo · URL_Feed · URL_Sito · Formato
(rss/atom/api/youtube/html) · Lingua · Copertura (naz/reg/int) · Tier
(A/B/C) · Tipologie (CSV T1..T10) · Ambiti (CSV 1..5) · Stato
(attiva/quarantena/sospesa/morta) · Origine (seed/scout/manuale) ·
DataAggiunta · ApprovataDa · UltimaScan · UltimoEsito · UltimoContenuto ·
NRecordTotali · NRecord30gg · FailConsecutivi · UltimoErrore · Note
```

Regole: URL_Feed unica (dedup); Stato "morta" = 0 contenuti in 90gg o
fail persistente; "quarantena" = fonte nuova in osservazione.

## Fasi

### Fase 1 — Fondamenta (02/08, questa sessione)
- [x] Piano scritto e confermato
- [ ] `RegistroFonti.js`: setup foglio, migrazione con anteprima da
      FontiFeed + SocialFonti + FontiPodcast residui + FontiNews + Fonti
      legacy, dedup per URL, mappa categoria
- [ ] Adapter `getFeedSources` → RegistroFonti dietro flag
      `USE_REGISTRO_FONTI` (pattern FontiFeed: nessuna rottura, si accende
      dopo verifica)
- [ ] Pulizia pannello Strumenti: rimozione bottoni one-shot già eseguiti
      e riparazioni concluse; riorganizzazione per categoria
- [ ] Self-test + deploy + verifica

### Fase 2 — Tassonomia T1–T10
- [ ] `OC_TIPOLOGIE` in Constants.js (source of truth, con T10)
- [ ] `Tassonomia.js`: classificatore Claude Haiku {tipologia, secondarie,
      aderenza 0–100} con self-test su casi reali
- [ ] Colonne `Tipologia`+`Aderenza` su Items, RADAR BANDI, Podcast,
      Pubblicazioni, Norme
- [ ] Hook all'ingestione (scanner) + batch notturno per attivi/esposti
- [ ] Filtri UI per tipologia nelle sezioni

### Fase 3 — Agenti Scout e Redattori
- [ ] `AgenteScout.js`: per categoria, settimanale; genera candidate
      (directory di settore, OPML, indici podcast, ricerche mirate),
      valida tecnicamente (feed vivo? produce? che qualità?), scrive in
      `FontiCandidate` + notifica Telegram con Approva/Scarta
- [ ] `AgenteRedattore.js`: pipeline di compilazione campi completa
      all'ingestione (estende il classificatore di Fase 2 con tutti i
      campi gestionali)
- [ ] Pannello admin: coda candidate con anteprima produzione della fonte
- [ ] Radar Bandi corsia rafforzata: le fonti bandi candidate richiedono
      ANCHE la prova "ha pubblicato un bando vero con scadenza negli
      ultimi 60gg" prima di poter essere approvate

### Fase 4 — Sezione Candidature (Capitali/UNESCO)
- [ ] Foglio `Candidature` + scanner dedicato (MiC Capitale italiana,
      Commissione UE Capitale europea, UNESCO calls, Memory of the World,
      Creative Cities)
- [ ] Pagina webapp autonoma con timeline (le candidature hanno fasi:
      avviso → dossier → shortlist → designazione), non scadenze secche
- [ ] Voce sidebar + card home

### Fase 5 — QA di lancio (fine agosto)
- [ ] Ogni sezione risponde con numeri alle 3 domande (fonti attive/
      produttive, ultimo ingresso, esposti vs scartati con motivo)
- [ ] Zero fonti morte attive, zero duplicate
- [ ] Tutti i self-test verdi, report riprogettato attivo
- [ ] Giro completo utente: home → ogni sezione → filtri → dettaglio

## Pulizia strumenti (Fase 1) — comandi da RIMUOVERE dal pannello

Seed one-shot già eseguiti: fontiEstero, fontiNormativa, fontiPrimarie,
fontiOsservatori, fontiDesignArte, fontiArteEU, videoIntl, podcastAttivi,
fontiPodcast, fontiSocial, fontiPodcastSocial.
Riparazioni concluse: riparaSlittate*, scadenzeFalse*, tedMalformati*,
tedVuoti, backfillCultura, canaleBandi_* (5 casi di confine già applicati),
enrichRadarSetup.
Regola: si tolgono i BOTTONI dal pannello; le funzioni restano nel codice
(richiamabili dall'editor GAS in emergenza) finché la Fase 5 non conferma
che possono sparire del tutto.

## Revisione trigger (02/08 sera, v4.28.2 — decisioni Silvano)

Censimento: ~40 attività schedulate, 3 gruppi di intervento.

**Rimossi (ridondanza pura):**
- 4 seed one-shot (discoveryAutoSeed, fontiDesignArteSeed, videoIntlSeed,
  podcastAttiviSeed): già eseguiti, giravano ogni giorno alle 8 a vuoto
- `lunediMattina` ridotto al SOLO sendWeeklyAlert (Telegram scadenze):
  ogni altro passo era duplicato (sasRun notturno, rotazione RSS bandi,
  scan podcast/news quotidiani, flusso redazionale)
- TED tolto dal giro settimanale apiScanTutto (già quotidiano via
  fasRunCompleto 05:15); resta l'editoria iTunes+DOAJ+YouTube

**Sospesi in attesa del report unico (riattivabili scommentando):**
- `agenteFontiMute` (email ogni 5gg) e `podcastAuditMensile` (email
  mensile): ridondanti col RegistroFonti, confluiranno nel report nuovo

**Riconversione Fase 3 (property OC_AGENTI_ATTIVI='true' per riattivare):**
- AG1–AG5 (scan tematici Claude lun–ven) sospesi: si sovrapponevano alla
  pipeline principale. Config, prompt, fonti e destinatari opt-in saranno
  la base degli agenti Scout/Redattori
- Email agenti quotidiane sospese; INTATTI: digest Coorte B martedì,
  digest Matrix domenica sera, social draft, flusso redazionale

**Restano attivi (verificati non sovrapposti):** sasRun (igiene+purge 20gg,
04:30), fasRunCompleto (API bandi, 05:15), agrRunOggi (regioni), galRunOggi
(GAL), bandiRssScanRotazione (06/18), scanSources (07/11/15/19),
scanPodcastBisettimanale (07:30), enrichBandiDeep (01/04/22),
enrichBandiRadar (03), txBatchNotturno (02), bcvNormalizzaRegione (02),
pubDiscoveryScan (mer+sab), lavoroCulturaMonitor (mer+sab),
normeAutoPopolaRun (gio), trendProponi (09), redazionale (ven+lun),
socialPubblicaApprovati (mar+ven), scanNewsletterGmail (lun), frBackfillTier
(lun), ddPrune (mensile), cronGenerateDigestWeekly (dom — pubblico Matrix).

### Input per il report unico di lunedì (fonti e schede)
Il report riprogettato dovrà consolidare in UNA email ciò che facevano
reportUnificato + agenteFontiMute + podcastAuditMensile, leggendo dalle
nuove viste: `rfStato()` (registro per categoria), `frSaluteFonti()` (bandi
per tier), `txStato()` (copertura tassonomia + aderenza debole),
`?diag=sezioni` (contenuti per sezione). Principio: per ogni sezione i 3
numeri (fonti attive/produttive, ultimo ingresso, esposti vs scartati) —
mai impressioni.

## Vincoli permanenti

- "Meglio un bando in meno che uno scaduto o senza le informazioni base"
- Nessuna scrittura senza anteprima; nessuna fonte in produzione senza
  approvazione admin
- Righe sempre scritte per NOME colonna, mai per posizione
- Ogni canale deve saper distinguere "zero contenuti" da "non sto
  guardando" (lezione dei tre guasti silenziosi di luglio/agosto)
