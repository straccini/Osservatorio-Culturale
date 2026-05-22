# Piano Deploy v4.14.0 — Sessione 1 audit 2026-05-08

**Data preparazione**: 2026-05-08
**Autore modifiche**: Claude (Cowork) in coppia con Silvano Straccini
**Versione target**: v4.14.0 (da v4.13.1)
**Tipo deploy**: aggiornamento incrementale, additivo, no breaking changes

---

## A. Decisioni utente alla base degli interventi

| Decisione | Scelta confermata 2026-05-08 |
|---|---|
| Tipografia base | 17px (era 16px), conversione globale px → rem |
| Toggle accessibilità A/A+/A++ | Lasciare 3 livelli con default = piccolo (invariato) |
| Asset Musei Sensibili | Foglio dedicato base64 nel file principale (Sessione 2) |
| Cron scan bandi | Lun-Mer-Ven 01:00 (era 07:00) |

## B. Interventi eseguiti

| # | Intervento | File toccati |
|---|---|---|
| 1 | Conversione tipografica px → rem (188 dichiarazioni) + base html 17px | `Styles.html` |
| 2 | Verifica scala toggle A/A+/A++ — nessun ribilanciamento richiesto | (nessuno) |
| 3 | Pulsante "▶ Avvia scan completo bandi" + handler `OC.runScanBandiV5` | `Index.html` |
| 4 | `homeUpdateInfo` reso visibile + chiamata fallback a `getLastFontiUpdate()` | `HomeView.html`, `Index.html`, `Bandi_v5.js` |
| 5 | Semaforo stato fonti bandi + colonna "Ultima scan" + pulsante Reset | `Codice.js` (enrich), `Index.html`, `Bandi_v5.js` (`resetFailFonteV5ByUrl`) |
| 6 | Cron `setupBandiV5Triggers` Lun-Mer-Ven 01:00 (era 07:00) | `Bandi_v5.js` |
| 7 | Bump `OC_VERSION` v4.13.1 → v4.14.0 + changelog + nota release | `Constants.js`, `PIANO_DEPLOY_v4.14.md` |

## C. Backup creati (in oc-codebase/)

- `Styles.html.bak_2026-05-08`
- `Index.html.bak_2026-05-08`
- `HomeView.html.bak_2026-05-08`
- `Codice.js.bak_2026-05-08`
- `Bandi_v5.js.bak_2026-05-08_pre-ui` (snapshot intermedio dopo intervento 4)
- `Constants.js.bak_2026-05-08`

Rollback: `cp <file>.bak_2026-05-08 <file>` per ogni file singolo, poi nuovo push.

## D. Procedura deploy

1. Apri PowerShell:
   ```
   cd "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\musemu matrix"
   .\sync-oc-to-gas.ps1
   ```
2. Apri editor Apps Script del progetto.
3. **DOPO il push**, esegui MANUALMENTE da editor: `setupBandiV5Triggers()` per riallineare i 3 trigger cron al nuovo orario 01:00.
4. Esegui `getLastFontiUpdate()` per verificare che la nuova funzione restituisca un payload valido.
5. Deploy via matita ✏️ → Nuova versione → conferma. URL produzione invariato.
6. Apri webapp e verifica:
   - Home: leggibilità (font più grandi), pill "homeUpdateInfo" visibile con etichetta tipo "aggiornato 12 ore fa · 47 fonti attive · 5 silenti"
   - Impostazioni > Fonti bandi: nuovo pulsante "▶ Avvia scan completo bandi", semaforo nelle righe, colonna "Ultima scan", bottone "Reset" su fonti con fail consecutivi
   - Toggle A/A+/A++ in topbar continua a scalare correttamente

## E. Test post-deploy consigliati

- [ ] Click "▶ Avvia scan completo bandi": dialog conferma, output live, conteggio finale OK/Fail/Saltate/Nuovi
- [ ] Click "Reset" su una fonte silente: dialog conferma, ricarica tabella, semaforo torna verde/grigio
- [ ] Verifica trigger: editor GAS > Trigger > devono essere 3 trigger settimanali per `scanFontiTutte` ai giorni Lun/Mer/Ven ore 01:00
- [ ] Verifica conteggio fonti silenti coerente con foglio FontiBandi_v5 colonna FailConsecutivi
- [ ] Toggle A+/A++ in topbar: verifica che dimensioni continuino a scalare proporzionalmente

## F. Note operative

- L'enrichment `getFontiBandi()` ora fa join con `FontiBandi_v5` su URL: se la corrispondenza fallisce (fonte solo in v4 vecchio o solo in v5), il semaforo mostra grigio "—". Comportamento atteso e non bloccante.
- Il pulsante "Reset" appare solo se `failConsec >= 1`: per fonti pulite non si vede.
- Il backend `getLastFontiUpdate()` legge solo FontiBandi_v5; se ci sono solo fonti v4 (nessuna v5) la pill mostrerà "nessuna fonte" — atteso.
