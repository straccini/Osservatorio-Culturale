# Newsletter Sinopia — Design System (v3)

Art direction **bloccata** il 2026-06-16. Questi file sono i *modelli sorgente* del
redesign newsletter; vanno poi cablati nel generatore GAS `buildDigestHTML`
(`DigestService.js`) e nelle varianti (profilati, Matrix, outreach ROC), che
condividono la stessa shell.

## File
- `digest-lettori-v3.html` — template email canonico (lettori). Table-based, CSS inline,
  email-safe (no flex, no SVG inline), con segnaposto `{{...}}`.
- `filtro-sfumato-sinopia.ps1` — prototipo del filtro immagini "segno Sinopia"
  (download CC0 Met + duotono sfumato sinopia). Validato su foto reale.

## Identità visiva
- Accento brand **sinopia `#935851`** (terra rossa) — unico colore primario (testata, CTA, accenti).
- Carta da museo: bg `#F5F3EE`; card `#FFFFFF`; testata/footer `#FBF7F3`; bordi `#E8E5E0`.
- Testo `#1A1A1A`, secondario `#5A5A5A`/`#7A746E`.
- Testata e titoli: serif (`Georgia, 'Times New Roman', serif`); corpo: sans di sistema.
- 5 ambiti, colore-tag (solo pastiglie): 1 `#6B5C9A` · 2 `#3F7A5E` · 3 `#3C6A95` · 4 `#9C6A36` · 5 `#4A7884`.

## Struttura (in ordine)
1. Preheader nascosto · 2. Testata chiara (wordmark *Sinopia* + n./data + firma grafica) ·
3. **Bandi in scadenza** (blocco in evidenza, badge giorni) · 4. Editoriale con **cover** ·
5. Sezioni per ambito (header immagine opzionale + articoli) · 6. Modulo **Candidature** (moderno) ·
7. Footer bookend (firma grafica + crediti + disiscrizione).

## Immagini — regole diritti (vincolanti)
- **Mai** le foto delle testate/articoli aggregati (anche stilizzate = opera derivata = violazione).
- Fonti ammesse: **CC0 museale** (Met, Rijksmuseum, Europeana, Wikimedia CC0), CC-BY (con attribuzione), foto proprie.
- Le immagini stanno solo a livello **testata/cover/sezione**, mai accanto al singolo articolo aggregato (lì resta il link alla fonte).
- Ogni immagine memorizza la propria **attribuzione**, stampata in didascalia + riga crediti nel footer.

## Segno "Sinopia" (stile immagini)
Matita posata di piatto: **sfumato**, contorno **appena percepibile**, chiaroscuro morbido,
monocromo sinopia su carta. Due vie di produzione (pre-elaborazione, non in GAS → PNG ospitati):
- **Algoritmico** (`filtro-sfumato-sinopia.ps1`): luminanza → duotono sfumato sinopia. Gratis,
  deterministico, identico in serie. Cavallo di battaglia per header news/sezioni.
- **AI img2img**: opzione premium per la cover editoriale (tocco "a mano").
- La firma grafica (archi sinopia) di testata/footer = piccola **PNG** (Gmail/Outlook eliminano l'SVG inline).

## Vincoli email
- Layout SOLO `<table>` (no flex/grid). CSS inline. Larghezza `max-width:600px` fluida.
- Immagini: ospitate pubblicamente, leggere, con `alt` e **bgcolor di fallback** (molti client le bloccano di default).
- Preheader nascosto per l'anteprima inbox.

## TODO wiring (prossimo passo)
1. Generare le PNG (firma testata/footer + cover) e ospitarle (Drive pubblico / dominio / CDN).
2. Costruire la **libreria immagini CC0 per ambito** con attribuzione (foglio o Properties).
3. Sostituire `buildDigestHTML` con questa shell; mappare i `{{...}}` ai dati reali.
4. Applicare la stessa shell a profilati / Matrix / ROC.
