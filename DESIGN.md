---
name: Sinopia · Osservatorio Culturale
description: Intelligence platform for Italian museums and cultural heritage professionals
colors:
  sinopia-siena: "#8B4513"
  sinopia-siena-deep: "#6D360F"
  carta-avorio: "#FAFAF7"
  carta-calda: "#F3F0EA"
  superficie: "#FFFFFF"
  superficie-calda: "#F7F5F0"
  bordo-seta: "#E8E4DC"
  bordo-forte: "#D5D0C4"
  inchiostro: "#1D1D1F"
  inchiostro-2: "#3A3631"
  inchiostro-3: "#6E6A62"
  inchiostro-4: "#9A958B"
  inchiostro-5: "#BBB6AC"
  viola-pergamena: "#6B5C9A"
  verde-salvia: "#3F7A5E"
  blu-prussia: "#3C6A95"
  petrolio-polvere: "#4A7884"
  pericolo: "#8C2626"
  attenzione: "#9A6A14"
  conferma: "#2E5E3A"
  urgente: "#C8102E"
typography:
  display:
    fontFamily: "'DM Serif Display', 'Newsreader', Georgia, serif"
    fontSize: "2.4rem"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "normal"
  headline:
    fontFamily: "'DM Serif Display', 'Newsreader', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "'DM Serif Display', Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "'DM Sans', 'Inter', -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'DM Sans', 'Inter', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.sinopia-siena}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "12px 28px"
  button-primary-hover:
    backgroundColor: "{colors.sinopia-siena-deep}"
    textColor: "#FFFFFF"
  button-secondary:
    backgroundColor: "{colors.superficie-calda}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.sm}"
    padding: "12px 28px"
  button-secondary-hover:
    backgroundColor: "{colors.bordo-seta}"
    textColor: "{colors.inchiostro}"
  chip-active:
    backgroundColor: "{colors.sinopia-siena}"
    textColor: "#FFFFFF"
    rounded: "24px"
    padding: "6px 16px"
  chip-inactive:
    backgroundColor: "transparent"
    textColor: "{colors.inchiostro-3}"
    rounded: "24px"
    padding: "6px 16px"
  card-content:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  input-default:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
---

# Design System: Sinopia

## 1. Overview

**Creative North Star: "La Carta Preparatoria"**

L'interfaccia di Sinopia funziona come una sinopia: il disegno in terra rossa che l'artista traccia sull'intonaco grezzo prima dell'affresco. Ogni elemento prepara il terreno per una decisione operativa. Il design non decora: organizza, orienta, anticipa.

Il sistema visivo parte dalla carta da museo. Le superfici sono calde, mai bianche, mai grigie. Il colore primario, la terra di Siena, attraversa l'intera esperienza come un filo rosso: nei link, negli accenti, nei momenti in cui il sistema chiede attenzione. I cinque ambiti tematici (identita, inclusione, programma, comunita, digital) portano ciascuno un colore desaturato e riconoscibile, ma nessuno compete con il siena.

La tipografia e il cuore editoriale: DM Serif Display per i titoli, Newsreader per gli italic, DM Sans per il corpo. Il contrasto serif/sans comunica autorita senza pesantezza. L'impaginazione segue il ritmo di una rivista culturale, non di un gestionale.

Questo sistema rifiuta esplicitamente: la leggerezza decorativa (illustrazioni infantili, bordi arrotondati eccessivi), il formalismo burocratico (layout da portale ministeriale), la freddezza corporate (dashboard SaaS blu), il minimalismo vuoto, il tono didascalico.

**Key Characteristics:**
- Calore materico: superfici avorio, ombre con tinta bruna, mai nero puro
- Gerarchia tipografica netta: serif editoriale per i titoli, sans per l'operativita
- Cinque ambiti come sistema cromatico secondario, sempre subordinato al siena
- Dark mode con la stessa temperatura calda, mai freddo-blu
- Densita informativa alta: il professionista museale ha poco tempo

## 2. Colors

La palette parte dalla terra: siena, avorio, pergamena. I colori funzionali sono desaturati e caldi, mai elettrici.

### Primary
- **Terra di Siena** (#8B4513): accento primario, link, CTA, azioni di archiviazione. Il colore della sinopia stessa. Presente su meno del 15% di qualsiasi schermata.
- **Siena Profondo** (#6D360F): hover state del primario, enfasi su azioni confermate.

### Secondary
- **Viola Pergamena** (#6B5C9A): ambito 01, Identita e narrazione museale.
- **Verde Salvia** (#3F7A5E): ambito 02, Inclusione e accessibilita. Anche usato per azioni "letto" e conferme positive.
- **Blu Prussia** (#3C6A95): ambito 03, Programma, mostre e collezioni.
- **Petrolio Polvere** (#4A7884): ambito 05, Digital, AI e governance.

### Neutral
- **Carta Avorio** (#FAFAF7): sfondo principale, la "carta da museo" dell'intera interfaccia.
- **Carta Calda** (#F3F0EA): superfici secondarie, hover state, box informativi.
- **Superficie** (#FFFFFF): card e contenitori che si sollevano dalla carta.
- **Bordo Seta** (#E8E4DC): divisori sottili, bordi card. Caldo, mai grigio puro.
- **Inchiostro** (#1D1D1F): testo principale. Quasi nero, con una punta calda.
- **Inchiostro 2** (#3A3631): testo secondario, sottotitoli.
- **Inchiostro 3** (#6E6A62): metadata, label, timestamp.
- **Inchiostro 4** (#9A958B): placeholder, testo disabilitato.

### Status
- **Pericolo** (#8C2626): rosso scuro per azioni distruttive.
- **Urgente** (#C8102E): rosso ciliegia per deadline imminenti, bandi in scadenza.
- **Attenzione** (#9A6A14): ambra per avvisi non critici.
- **Conferma** (#2E5E3A): verde scuro per successo, sempre desaturato.

### Named Rules
**The Siena Rule.** Il terra di siena (#8B4513) e l'unico colore ad alta saturazione nell'interfaccia. Non compete mai con i cinque ambiti. La sua rarita e il punto: quando appare, il professionista sa che e un'azione o un link.

**The Warm Neutral Rule.** Nessun grigio puro nell'interfaccia. Ogni neutro ha una tinta calda (sottotono pergamena). Questo vale anche in dark mode: i fondi scuri sono marroni profondi (#1A1815), mai blu-grigi.

## 3. Typography

**Display Font:** DM Serif Display (con Newsreader fallback, Georgia ultimo)
**Body Font:** DM Sans (con Inter fallback, system sans ultimo)
**Italic Font:** Instrument Serif (italic editoriale per enfasi nei titoli)
**Mono Font:** JetBrains Mono (solo per codice e token tecnici)

**Character:** Il contrasto tra il serif editoriale dei titoli e il sans pulito del corpo crea la tensione visiva di una rivista culturale: autorevole nell'intestazione, chiara nel testo. L'italic di Instrument Serif aggiunge un tocco calligrafico senza cadere nel decorativo.

### Hierarchy
- **Display** (400, 2.4rem, line-height 1.15): titoli di pagina, hero section. Solo DM Serif Display.
- **Headline** (400, 1.5rem, line-height 1.25): titoli di sezione, card principali. DM Serif Display con italic Instrument Serif per enfasi via `<em>`.
- **Title** (500, 1.25rem, line-height 1.3): sottotitoli, nomi bandi, titoli card secondarie.
- **Body** (400, 1rem/15px, line-height 1.6): testo corrente. Max 65-75ch per riga. DM Sans.
- **Label** (600, 0.75rem, letter-spacing 0.08em, uppercase): eyebrow, metadata, badge, contatori. DM Sans.

### Named Rules
**The Bembo Rule.** Il font target dell'identita e Bembo. Quando sara disponibile come webfont (o self-hosted), sostituira DM Serif Display come display font. Fino ad allora, DM Serif Display e il proxy operativo. Il carattere e lo stesso: autorevole, classico, mai decorativo.

**The Serif-for-Structure Rule.** I titoli sono sempre serif. Il corpo e sempre sans. Non mischiare. L'unica eccezione e l'italic editoriale (`<em>` con Instrument Serif) nei titoli composti tipo "Autovalutazione *rapida*".

## 4. Elevation

Il sistema e prevalentemente piatto. Le superfici si distinguono per tono (carta avorio vs superficie bianca), non per ombra. Le ombre appaiono solo come risposta a uno stato: hover, focus, modale.

### Shadow Vocabulary
- **Soft** (`0 1px 0 rgba(26,24,21,.04), 0 8px 24px -12px rgba(26,24,21,.10)`): ombra di default per card in hover. Doppia: una linea sottile in alto + alone diffuso in basso. Il colore e marrone scuro (#1A1815), mai nero puro.
- **Medium** (`0 4px 16px rgba(26,24,21,.08)`): elevazione intermedia per dropdown, popover.
- **Deep** (`0 10px 32px rgba(26,24,21,.12)`): modali, dialog, overlay. L'ombra piu intensa del sistema.

### Named Rules
**The Flat-by-Default Rule.** Le superfici sono piatte a riposo. L'ombra appare solo come feedback (hover su card, apertura modale). Se un elemento ha ombra permanente, e un errore di design.

## 5. Components

### Buttons
- **Shape:** Angoli leggermente arrotondati (6px radius), mai pill
- **Primary:** Terra di Siena (#8B4513) fondo, testo bianco, padding 12px 28px, font-weight 600, font-size 13px
- **Hover:** Siena Profondo (#6D360F), nessuna animazione di scala
- **Secondary:** Superficie calda (#F7F5F0) fondo, bordo Bordo Seta, testo Inchiostro
- **Ghost (azioni card):** Sfondo quasi trasparente con bordo sottile, colore tematico (verde per "letto", siena per "archivia", rosso per "elimina")
- **Transition:** `background 0.15s, color 0.15s` -- nessuna trasformazione geometrica

### Chips
- **Active:** Fondo siena (#8B4513), testo bianco, pill radius (24px), padding 6px 16px
- **Inactive:** Trasparente, bordo bordo-seta, testo inchiostro-3, stesso radius
- **Ambito chips:** Fondo soft dell'ambito (es. #EDE8F4 per viola), testo nel colore ambito, pill

### Cards / Containers
- **Corner Style:** Angoli medi (10px radius)
- **Background:** Superficie (#FFFFFF) su Carta Avorio (#FAFAF7), la differenza tonale crea profondita senza ombra
- **Shadow Strategy:** Nessuna a riposo. Soft shadow solo in hover.
- **Border:** 1px solid Bordo Seta (#E8E4DC). In dark mode il bordo diventa #2E2A24.
- **Internal Padding:** 16px 20px standard, 18px 22px per card principali

### Inputs / Fields
- **Style:** Bordo 1px Bordo Seta (#E8E4DC), fondo Superficie (#FFFFFF), radius 6px
- **Focus:** Bordo passa a Inchiostro (#1D1D1F), nessun glow, nessun outline colorato
- **Placeholder:** Inchiostro 4 (#9A958B), font-style normal

### Navigation
- **Sidebar:** 280px larghezza, fondo Carta Avorio, voci con padding 8px 12px, radius 6px
- **Active state:** Fondo Superficie Calda (#F7F5F0), testo Inchiostro, font-weight 500
- **Hover:** Fondo Superficie Calda, transizione 0.12s
- **Topbar:** 64px altezza, fondo Carta Avorio, bordo inferiore 1px Bordo Seta
- **Mobile:** Sidebar collassa in overlay con backdrop blur

### Matrix Questionnaire (componente firma)
- **Hero:** Cerchi decorativi in colore ambito desaturato, titolo DM Serif Display, sottotitolo Instrument Serif italic
- **Domande Likert:** Griglia 5 colonne con bordo + fondo toggle su selezione (colore ambito pieno, testo bianco)
- **Progress bar:** Altezza 3px, riempimento con colore ambito, animazione width 0.4s ease-out
- **Report:** Barre orizzontali colorate per dimensione, 3 fasce (rosso basso / oro medio / verde alto)

## 6. Do's and Don'ts

### Do:
- **Do** usare sempre superfici calde (avorio, pergamena) come sfondo. Mai bianco puro (#FFFFFF) come sfondo pagina; riservarlo solo alle card.
- **Do** mantenere il contrasto serif (titoli) / sans (corpo) in ogni schermata.
- **Do** usare il terra di siena (#8B4513) solo per link, CTA e azioni primarie. Mai come sfondo di sezioni intere.
- **Do** tintare le ombre con il colore base caldo (rgba 26,24,21) invece di nero puro.
- **Do** riservare i colori ambito (viola, verde, blu, petrolio) solo alla classificazione tematica, mai come accenti decorativi.
- **Do** supportare tre livelli di dimensione testo (normal, large +15%, xlarge +30%) per accessibilita.

### Don't:
- **Don't** usare bordi laterali colorati (border-left > 1px) come accento decorativo su card o liste. Se un bordo laterale esiste, e per stato (urgente = rosso ciliegia #C8102E) e solo per quello.
- **Don't** creare layout da portale istituzionale: griglie rigide, banner con stemmi, sfondo grigio burocratico.
- **Don't** usare dashboard SaaS fredde: card identiche ripetute, blu corporate, metriche hero con gradiente.
- **Don't** aggiungere decorazioni leziose: illustrazioni infantili, icone colorate, bordi arrotondati eccessivi (>14px su elementi non-pill).
- **Don't** essere didascalici: niente wizard infiniti, tooltip su ogni elemento, testo che spiega l'ovvio.
- **Don't** semplificare eccessivamente: il professionista museale lavora con densita informativa. Uno schermo vuoto con un solo bottone non e minimalismo, e un'interfaccia inutile.
- **Don't** usare grigi puri. Ogni neutro ha sottotono caldo. Anche in dark mode, i fondi sono marroni profondi (#1A1815), mai blu-grigi.
- **Don't** usare gradient text (`background-clip: text`).
- **Don't** usare glassmorphism come default.
