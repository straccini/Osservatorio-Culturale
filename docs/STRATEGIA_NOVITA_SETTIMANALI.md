# Strategia — Novità settimanali per TUTTE le categorie di contenuto

**Data**: 2026-07-20 · **Origine**: segnalazione stampa 2026-07-19 (caso Turrell/ARoS) + analisi flussi v4.27.40
**Obiettivo**: ogni lunedì, ogni sezione dell'Osservatorio (News, Bandi, Podcast, Video, Libri, Norme, Lavoro, Social wall) deve mostrare almeno una novità della settimana.

---

## 1. Stato dei flussi (misurato, diag ?diag=contatori 2026-07-19)

| Categoria | Novità/settimana | Stato | Collo di bottiglia |
|---|---|---|---|
| News | ~1.300 | ✅ abbondante | nessuno (semmai rumore) |
| Podcast | ~50 | ✅ ok | — |
| Norme | ~31 | ✅ ok | — |
| Video | variabile | ⚠ da monitorare | canali YouTube poco frequenti |
| Lavoro cultura | ~1 | ⚠ scarso | filtro L2 appena ampliato (v4.27.37) |
| Bandi | 26 ingressi → 1 sopravvissuto | 🔴 critico | agente qualità archivia il 96% (scaduti/incompleti) |
| Libri | solo discovery sabato | ⚠ lento | 1 sola scansione/settimana |
| Social wall | 0 | 🔴 dormiente | nessun feed persona; serve rilancio manuale |

## 2. Interventi per categoria

### News — consolidare qualità internazionale (fatto v4.27.41)
- Batch `fontiAggiungiBatchDesignArte`: Designboom, ArchDaily, Artsy News, Galerie,
  Sole 24 Ore EN (Musei e Biennali + Arti visive), Dezeen*, Archpaper* (*test dal gate GAS).
- Il Sole 24 Ore EN è **gratuito** e copre gli stessi temi della Domenica (arte, musei):
  compensa il paywall della fonte primaria segnalata.
- Azione ricorrente: audit mensile fonti mute già attivo (`podcastAuditMensile` + `fontiScannerDiagnosi`).

### Bandi — il problema NON è la quantità di fonti ma la freschezza
- Diagnosi 2026-07-19: 25/26 bandi archiviati perché scaduti o incompleti.
- Azione 1: eseguire "🔎 Valida bandi anteprima" e classificare gli scarti (upstream stantio vs filtro severo).
- Azione 2: se upstream → privilegiare connettori API strutturati (TED, SEDIA) rispetto agli aggregatori RSS che ripubblicano bandi vecchi.
- KPI: ≥3 bandi vivi/settimana entro fine agosto.

### Lavoro cultura — osservare 2 settimane il nuovo filtro L2 (blacklist, v4.27.37)
- Se resta <2/settimana: aggiungere fonte complementare (portali ATS/inPA con filtro cultura).

### Video — allineare la cadenza alla realtà dei canali ✅ FATTO v4.27.47
- Report 21/07: +0 video/7gg, 0 fonti video in FontiFeed → confermato collo di bottiglia.
- `videoAggiungiCanaliIntl()`: Louisiana Channel, ARoS, MoMA, Tate (@handle risolti
  lato GAS da `_youtubeChannelToFeedUrl`, dedup su feedUrl). Auto-seed `videoIntlSeedOnce`
  dal dispatcher (daily 08) + bottone admin "+ Video intl".
- ⚠ DA VERIFICARE dopo il primo run: scanner video legge FontiPodcast legacy
  (flag `USE_FONTI_FEED_VIDEO` off) — controllare che i 4 canali producano VID*.

### Libri — seconda finestra settimanale ✅ FATTO v4.27.47
- Report 21/07: +0 libri/7gg nonostante la finestra del sabato → aggiunta 2ª finestra.
- `pubDiscoveryScan` ora anche mercoledì 06:00 (OC_CRON_EXTRA).
- ⚠ Se anche mercoledì produce 0: il problema non è la frequenza ma la discovery
  stessa (fonti editoria mute) → diagnosi dedicata.

### Social wall — risveglio con rito settimanale ibrido
Il wall è dormiente perché i feed-persona quasi non esistono (audit 2026-06-08: solo Solima).
Strategia a 3 livelli:
1. **Automatico (già attivo)**: feed Mastodon #CulturalHeritage/#GLAM/#digitalheritage entrano nel flusso news.
2. **Rito manuale del venerdì (15 min)**: insieme al flusso redazionale (`redazionaleVenerdi`, ven 18:00),
   rilanciare 3-5 post della settimana via `rilanciaPost` (SocialWall_v1). Bacino: gli account IG/LinkedIn
   di ARoS, Gagosian, Almine Rech, MAXXI, Triennale + opinion leader del dossier B.1-B.4.
3. **Segnale d'ingresso**: iscrivere la casella alle newsletter senza feed (ARoS/heyloyalty, Almine Rech)
   → `scanNewsletterGmail` già attivo le intercetta come materia prima per il rilancio.
- KPI: ≥3 card social/settimana per 4 settimane consecutive.

## 3. Presidio (già in macchina, non creare nuovi report)
- `reportUnificatoGiornaliero` (08:00) — aggiungere in coda la riga "novità settimana per categoria"
  leggendo `getWeeklyNewCounts()`: se una categoria è a 0 il giovedì, alert esplicito.
- Badge NEW sidebar = il KPI visibile all'utente: obiettivo "nessun badge a zero il lunedì mattina".

## 4. Attendibilità (metodo monitoraggio-mercato)

| Aspetto | Certo | Probabile | Da confermare |
|---|---|---|---|
| Feed Designboom/ArchDaily/Artsy/Galerie/Sole24 EN validi | ✅ fetch 2026-07-20 | | |
| Dezeen/Archpaper raggiungibili da GAS | | ✅ (WAF spesso passa da IP Google) | esito gate al primo run |
| ARoS/Gagosian/Almine Rech senza feed | ✅ verificato | | |
| Causa bandi a zero (upstream vs filtro) | | | 🔎 Valida bandi anteprima |
| Canali YouTube ARoS/Louisiana ad alta cadenza | | ✅ | verifica channel_id prima del batch |
