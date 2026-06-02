# Report di verifica — Funzionalità e corrispondenza Fonti → Risorse
**Data**: 2026-06-02 · **Deploy**: @438 (v4.19.x + commit `7d6d271`)
**Oggetto**: web app Osservatorio Culturale + spreadsheet backend `15TgAkx…SMO5Xk` ("Osservatorio Culturale")
**Metodo**: lettura codice locale (lato deploy) + dump completo del foglio live (≈40 tab, 691k caratteri) analizzato fuori contesto con script Python.

---

## 1. Sintesi esecutiva (semaforo)

| Risorsa | Fonti configurate | Risorse raccolte | Stato |
|---|---|---|---|
| **News** | 68 (foglio `Fonti`) | 124 item | 🟡 Funziona, ma ~56% fonti morte |
| **Podcast** | 43 (`SocialFonti`) | 78 podcast | 🟡 Funziona, contatori fonti non aggiornati |
| **Video** | (stesse fonti podcast) | 59 video | 🟢 OK |
| **Libri** | manuale | 7 | 🟢 OK (pochi, atteso) |
| **Bandi** | 155 (`FontiAgenti`) + 59 (FU17) | **3 demo scaduti** | 🔴 **Pipeline ferma** |
| **Segnalazioni** (v4.19) | — | 3 | 🟢 OK |
| **ProfiliPro** (v4.19) | — | **0** | 🔴 Nessun profilo salvato |

---

## 2. Problema CRITICO #1 — I bandi non arrivano alla pagina

- `getSheetRadar()` (Codice.js:1613) dopo l'unificazione punta a **`Bandi_v5`** nel file principale.
- Il foglio `Bandi_v5` contiene **solo 3 record**: `B001` Europa Creativa, `B002` ANCI, `B003` Fondazione Cariplo — **tutti con scadenza già passata** (29/05, 03/04, 27/04). Sono i seed demo.
- Conseguenza: la pagina **Radar Bandi** mostra di fatto 3 bandi vecchi/scaduti.
- Le fonti bandi **non alimentano** questo foglio:
  - `FontiAgenti` (155 fonti multi-agente): **67 silenti** (fail ≥ 3), **125 a zero record**. Ultimo esito: 70 `EMPTY`, 59 `NO_MATCH`, solo 26 `OK`. Tutte le istituzionali chiave sono mute: MiC, ANCI, Italia Domani-PNRR, Regione Puglia, PugliaPromozione, Regione Sardegna, Europa Creativa, Cariplo, ICOM, Federculture, Symbola…
  - Foglio FU17 bandi (59 fonti): 40 a zero record, 5 `HTTP_ERR`, 4 `PARSE_ERR`, 2 `DEPRECATED`, 15 disattivate.
- **Nota**: lo spreadsheet RADAR separato (`1cz35EBUY63kLBe3hpkIYG8ReEr6oNwRLwRzzKm_t7t0`) citato in CLAUDE.md **non è raggiungibile** da questo accesso ("entity not found"): o spostato/eliminato, o non condiviso. Da verificare se contenga ancora i bandi storici.
- Inoltre, alcuni item di tipo bando (es. "Regione Marche - Bandi", "Invitalia - Bandi Cultura") finiscono nel foglio **ItemsAgenti**, non in `Bandi_v5`: c'è un **disallineamento di destinazione** nel routing.

➡️ **Azione**: ricondurre il pipeline bandi a `Bandi_v5`; ricontrollare le fonti `EMPTY`/`HTTP_ERR` (URL/RSS rotti); confermare sorte dello spreadsheet RADAR.

---

## 3. Problema CRITICO #2 — Sistemi-fonti multipli e concorrenti (ambiguità "source of truth")

Esistono **almeno 5 elenchi-fonti paralleli** nel foglio:

| Foglio | Schema | Righe | Chi lo usa davvero |
|---|---|---|---|
| `Fonti` | 9 col legacy | 68 | ✅ Lo scanner news `scanSources()` legge **questo** (Codice.js:2361, 2527) |
| `SocialFonti` | 11 col legacy | 43 | Fonti podcast |
| foglio "redazioni" | 3 col, **senza header** | 7 | malformato (riga 1 dati interpretata come intestazione) |
| `FontiAgenti` | 16 col | 155 | Sistema multi-agente (AG1–AG5) |
| FU17 unificate | 18 col | 44 + 59 (+1 vuoto) | `Fonti_v1.js` / dashboard admin |

- La migrazione FU17 (`Fonti_v1.js`) ha creato `FontiNews` (44) e `FontiBandi_v5` (59), **ma lo scanner news continua a leggere il vecchio `Fonti`**: quindi `FontiNews` FU17 è **dato morto** non utilizzato.
- Il foglio FU17 news ha `UltimoEsito` tutto vuoto e nessuna `UltimaScan` → non viene mai scansionato.

➡️ **Azione**: decidere un unico source-of-truth per tipo e deprecare gli altri (con alias), altrimenti contatori dashboard e scansioni reali divergono.

---

## 4. Problema MEDIO — News: oltre metà delle fonti non produce nulla

- `Fonti`: 66/68 attive, **38 fonti a zero item raccolti**.
- Solo ~11–14 fonti distinte alimentano i 124 item: Artribune, AgenziaCult, Artnet News, ArtNews, Agenda Digitale, Exibart (16 ciascuna), poi Agenda Dig. AI, AI News Italia, Artsy, MIT Tech Review, Federculture, Symbola.
- Il `ScanLog` conferma feed vuoti/rotti ripetuti (`feed_vuoto`): The Art Newspaper, Europeana, Artribune Digit., CORDIS Heritage, Flash Art, Exibart Mostre, ArtNews Exhib., Itinerari Arte, Arte.it Mostre, ecc.
- **Bug data**: almeno una fonte (`ANSA – Cultura`) ha `UltimaScansione` = **08/06/2026** (data nel futuro rispetto a oggi) → problema di formattazione/fuso o data errata.

➡️ **Azione**: ripulire/sostituire le 38 fonti morte; correggere parsing RSS dove `feed_vuoto`.

---

## 5. Problema MEDIO — Podcast: contatori fonte non aggiornati + colonna disallineata

- Risorsa `Podcast`: 137 record (78 podcast + 59 video) → contenuti **ci sono**.
- Ma `SocialFonti` mostra **tutte e 43 le fonti a 0 `NumItemRaccolti`** e **nessuna `UltimaScansione`**: i contatori sul foglio fonti **non vengono scritti** dopo lo scan (diagnostica/dashboard fuorviante).
- In `Podcast` la colonna `Fonte` per 33 record vale `"3"` (numero) invece di un nome → **probabile disallineamento colonne** in scrittura (uno Score/Ambito finito in `Fonte`).

➡️ **Azione**: wirare l'aggiornamento contatori sulle fonti podcast; verificare il mapping colonne in fase di append.

---

## 6. Problema MEDIO — Sistema multi-agente parziale

- `ItemsAgenti`: 155 item, ma solo dagli **agenti 1, 3, 5** (73 / 59 / 23). **Agenti 2 e 4 → 0 item**.
- `FontiAgenti`: 67/155 silenti. Esiti dominati da `EMPTY` (70) e `NO_MATCH` (59).

➡️ **Azione**: verificare perché AG2 e AG4 non producono; rivedere soglia relevance/`NO_MATCH`.

---

## 7. Problema MEDIO — v4.19 `ProfiliPro` a zero

- Foglio `ProfiliPro` presente ma **0 righe**, nonostante 1 utente registrato "via profilo" oggi (msmarrelli).
- Possibili cause: `ensureSheetProfiliPro_()` esegue ma `saveProfilo` non persiste, oppure nessuno ha completato l'onboarding, oppure il passo manuale post-deploy non è stato eseguito.
- `Segnalazioni` invece funziona (3 record) → la parte v4.19 community è viva.

➡️ **Azione**: test end-to-end `saveProfilo` → verifica scrittura riga in `ProfiliPro`.

---

## 8. Cosa NON ho potuto verificare da qui

- **Spreadsheet RADAR separato** (bandi storici): non accessibile con questo collegamento Drive.
- **Esecuzione runtime** dei trigger (clasp run non configurato come API executable): le verifiche sono su **dati a riposo** nel foglio, non su una scansione lanciata ora.
- Render finale frontend: i mapper (`getNewsListV42`, `getPodcastListV42`, `getBandiListV42`) sono coerenti con le colonne reali viste; le pagine News/Podcast/Video mostrano dati, la pagina Bandi mostra i 3 demo.

---

## 9. Priorità consigliate

1. 🔴 **Bandi**: confermare dove sono i bandi reali (RADAR separato?) e ricollegare il pipeline a `Bandi_v5`.
2. 🔴 **ProfiliPro**: test salvataggio profilo.
3. 🟡 **Source-of-truth fonti**: scegliere un elenco per tipo, deprecare i doppioni.
4. 🟡 **News**: potare le 38 fonti morte, correggere data ANSA nel futuro.
5. 🟡 **Podcast**: aggiornare contatori fonte + fix colonna `Fonte="3"`.
6. 🟡 **Agenti 2 e 4**: capire perché non raccolgono.
