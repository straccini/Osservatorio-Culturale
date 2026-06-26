/* Genera il documento Word operativo per l'iscrizione alle newsletter (per Riccardo). */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, ExternalHyperlink, HeadingLevel,
  BorderStyle, WidthType, ShadingType, VerticalAlign
} = require('docx');

const ACCENT = '935851';
const INK = '1A1815';
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const COLS = [2300, 2100, 4960]; // Fonte | Ambito | Iscrizione  (sum 9360)
const TABLE_W = 9360;

function headerRow(labels) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((t, i) => new TableCell({
      borders, width: { size: COLS[i], type: WidthType.DXA },
      shading: { fill: ACCENT, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: 'FFFFFF', size: 20 })] })]
    }))
  });
}

function cell(i, children, fill) {
  return new TableCell({
    borders, width: { size: COLS[i], type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children
  });
}

function txt(s, opts) { return new Paragraph({ children: [new TextRun(Object.assign({ text: s, size: 20 }, opts || {}))] }); }

function linkPara(label, url) {
  return new Paragraph({
    children: [new ExternalHyperlink({ children: [new TextRun({ text: label, style: 'Hyperlink', size: 20 })], link: url })]
  });
}

function rigaFonte(nome, ambito, linkLabel, url, note) {
  const isMail = !url;
  const terzaCol = isMail
    ? [txt(linkLabel, { italics: true })]
    : [linkPara(linkLabel, url)].concat(note ? [txt(note, { size: 18, color: '6E6A62' })] : []);
  return new TableRow({
    children: [
      cell(0, [txt(nome, { bold: true })]),
      cell(1, [txt(ambito, { size: 19, color: '3A3631' })]),
      cell(2, terzaCol)
    ]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, color: INK, font: 'Calibri' },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, color: ACCENT, font: 'Calibri' },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
    ]
  },
  numbering: {
    config: [
      { reference: 'passi', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 320 } } } }] },
      { reference: 'punti', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 280 } } } }] },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1276, bottom: 1440, left: 1276 } } },
    children: [
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'SINOPIA · OSSERVATORIO CULTURALE', bold: true, size: 18, color: ACCENT, characterSpacing: 40 })] }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Iscrizione alle newsletter delle fonti culturali')] }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } }, spacing: { after: 160 }, children: [new TextRun({ text: 'Guida operativa per Riccardo', italics: true, size: 22, color: '6E6A62' })] }),

      new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'A cosa serve. ', bold: true, size: 22 }), new TextRun({ text: 'Molte testate e istituzioni culturali non pubblicano più un feed automatico (RSS). Inviano però una newsletter. Raccogliamo queste newsletter nella casella indicata da Silvano e le contrassegniamo con un’etichetta: il nostro sistema legge poi automaticamente quelle email ed estrae le notizie utili per l’Osservatorio.', size: 22 })] }),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: 'Il tuo compito in due mosse: ', bold: true, size: 22 }), new TextRun({ text: '(1) iscriverti a ciascuna newsletter qui sotto; (2) etichettare le email che arrivano. Tempo stimato: 20–30 minuti.', size: 22 })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Passo 1 — Iscrizione (per ogni fonte in elenco)')] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, children: [new TextRun({ text: 'Usa SEMPRE l’indirizzo email indicato da Silvano (', size: 21 }), new TextRun({ text: 's.straccini@gmail.com', bold: true, size: 21 }), new TextRun({ text: ', salvo diversa indicazione).', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, children: [new TextRun({ text: 'Apri il link “Iscrizione” della fonte, inserisci l’email nel modulo e invia.', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, children: [new TextRun({ text: 'Controlla la posta: spesso arriva un’email di “conferma iscrizione” — aprila e clicca il link di conferma (altrimenti l’iscrizione non è valida).', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, spacing: { after: 120 }, children: [new TextRun({ text: 'Dove non c’è un link ma un’email (es. Federculture), invia tu una breve email chiedendo l’iscrizione alla newsletter.', size: 21 })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Passo 2 — Etichettare le newsletter in Gmail')] }),
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'Quando arriva la prima email di una testata, assegnale l’etichetta ', size: 21 }), new TextRun({ text: 'Osservatorio', bold: true, size: 21 }), new TextRun({ text: ' (già creata nella casella):', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, children: [new TextRun({ text: 'Apri l’email della newsletter.', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, children: [new TextRun({ text: 'In alto clicca il menu ⋮ (tre puntini) → “Filtra messaggi simili”.', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, children: [new TextRun({ text: 'Clicca “Crea filtro” → spunta “Applica l’etichetta: Osservatorio” e “Applica anche alle conversazioni corrispondenti” → “Crea filtro”.', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'passi', level: 0 }, spacing: { after: 160 }, children: [new TextRun({ text: 'Così, da quel momento, le email di quella testata vengono etichettate da sole. Ripeti per ogni nuova testata.', size: 21 })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Elenco fonti da iscrivere')] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('A. Testate culturali (hanno dismesso l’RSS)')] }),
      new Table({ width: { size: TABLE_W, type: WidthType.DXA }, columnWidths: COLS, rows: [
        headerRow(['Fonte', 'Ambito', 'Iscrizione']),
        rigaFonte('FAI – Fondo Ambiente', 'Identità · Territorio', 'fondoambiente.it/registrati-alla-newsletter-del-fai', 'https://fondoambiente.it/registrati-alla-newsletter-del-fai/'),
        rigaFonte('Il Giornale dell’Arte', 'Programma · Mostre', 'ilgiornaledellarte.com', 'https://www.ilgiornaledellarte.com/', 'Modulo a fondo pagina (footer)'),
        rigaFonte('Treccani – Il Tascabile', 'Identità · Cultura', 'iltascabile.com/newsletter', 'https://www.iltascabile.com/newsletter/'),
        rigaFonte('Touring Club Italiano', 'Comunità · Territorio', 'touringclub.it/newsletter', 'https://www.touringclub.it/newsletter'),
        rigaFonte('Il Giornale delle Fondazioni', 'Comunità · Governance', 'ilgiornaledellefondazioni.com/newsletter/signup', 'https://www.ilgiornaledellefondazioni.com/newsletter/signup'),
      ]}),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('B. Osservatori e istituzioni di settore')] }),
      new Table({ width: { size: TABLE_W, type: WidthType.DXA }, columnWidths: COLS, rows: [
        headerRow(['Fonte', 'Ambito', 'Iscrizione']),
        rigaFonte('Fondazione Scuola del Patrimonio', 'Identità · Programma', 'Modulo di iscrizione diretto', 'https://fondazionescuolapatrimonio.us20.list-manage.com/subscribe?u=8b31b0750707f9ac1dbfa5045&id=5c33577d8e'),
        rigaFonte('Symbola', 'Digital · Economia della cultura', 'symbola.net/registrati', 'https://symbola.net/registrati/'),
        rigaFonte('cheFare', 'Comunità · Innovazione', 'che-fare.com', 'https://che-fare.com/', 'Modulo a fondo pagina (footer)'),
        rigaFonte('CCW – Cultural Welfare Center', 'Inclusione · Cultura & salute', 'culturalwelfare.center', 'https://culturalwelfare.center/', 'Modulo/contatti in pagina'),
        rigaFonte('Federculture', 'Comunità · Governance', 'Via email a rete@federculture.it (newsletter “CULT NEWS”)', null),
        rigaFonte('OCP – Oss. Culturale del Piemonte', 'Ricerca · Dati di settore', 'ocp.piemonte.it', 'https://ocp.piemonte.it/', 'In alternativa: ocp@fitzcarraldo.it'),
      ]}),

      new Paragraph({ spacing: { before: 240, after: 80 }, heading: HeadingLevel.HEADING_2, children: [new TextRun('Note utili')] }),
      new Paragraph({ numbering: { reference: 'punti', level: 0 }, children: [new TextRun({ text: 'Se un’email di conferma non arriva, controlla la cartella Spam/Promozioni.', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'punti', level: 0 }, children: [new TextRun({ text: 'Non serve disattivare nulla: le email restano nella casella, vengono solo etichettate.', size: 21 })] }),
      new Paragraph({ numbering: { reference: 'punti', level: 0 }, children: [new TextRun({ text: 'Quando hai finito, segnala a Silvano quali iscrizioni sono andate a buon fine e quali no.', size: 21 })] }),

      new Paragraph({ spacing: { before: 280 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 6 } }, children: [new TextRun({ text: 'Sinopia · Osservatorio Culturale — documento operativo interno', size: 16, color: '9A958B' })] }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(process.argv[2] || 'Iscrizione_Newsletter_Osservatorio.docx', buffer);
  console.log('OK documento generato');
});
