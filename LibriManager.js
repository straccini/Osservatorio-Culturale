// ============================================================================
// LibriManager.js — Books/publications management
// v4.22 — Extracted from Codice.js (file-organization refactor)
//
// Functions: setupPubblicazioniSheet, getLibriList, addLibro,
//   seedLibriMuseologia2026, LIBRI_HEADERS
//
// Dependencies (global): getMainSS, SH, formatDate
// ============================================================================

// Schema foglio Pubblicazioni:
// ID | Titolo | Autore | Editore | Anno | Ambito | Tematica | Descrizione | Link | Copertina_URL | DataAggiunta | Fonte | Stato | Score | Letto | Salvato
const LIBRI_HEADERS = ['ID','Titolo','Autore','Editore','Anno','Ambito','Tematica','Descrizione','Link','Copertina_URL','DataAggiunta','Fonte','Stato','Score','Letto','Salvato'];

function setupPubblicazioniSheet() {
  const SS = getMainSS();
  let sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) {
    sh = SS.insertSheet(SH.LIBRI);
    Logger.log('Foglio Pubblicazioni creato');
  }
  // Intestazione
  sh.getRange(1, 1, 1, LIBRI_HEADERS.length).setValues([LIBRI_HEADERS]).setFontWeight('bold').setBackground('#4A3F7A').setFontColor('#fff');
  sh.setFrozenRows(1);

  // Seed: 10 titoli di riferimento su museologia e gestione culturale
  const now = new Date();
  const seed = [
    ['LIB001','Il museo relazionale','Andrea Pancino','FrancoAngeli',2022,1,'Identità e narrazione museale','Ripensare il museo come spazio di relazione e mediazione culturale nel XXI secolo.','https://www.francoangeli.it','','','manuale','attivo',90,false,false],
    ['LIB002','Musei e digitale','AA.VV.','Electa',2023,5,'Digital, AI e governance','Trasformazione digitale nei musei italiani: strumenti, esperienze e prospettive.','https://www.electaweb.it','','','manuale','attivo',88,false,false],
    ['LIB003','Accessibilità nei musei','Simona Bodo','Carocci',2021,2,'Inclusione e accessibilità','Progettare percorsi museali inclusivi per persone con disabilità fisiche e cognitive.','https://www.carocci.it','','','manuale','attivo',92,false,false],
    ['LIB004','Audience Development','Francesca Pola','Il Mulino',2022,4,'Comunità e welfare culturale','Strategie di coinvolgimento del pubblico nei luoghi della cultura contemporanea.','https://www.mulino.it','','','manuale','attivo',85,false,false],
    ['LIB005','Heritage Management','AA.VV.','Laterza',2020,3,'Programma, mostre e collezioni','Gestione del patrimonio culturale tra conservazione, valorizzazione e partecipazione.','https://www.laterza.it','','','manuale','attivo',87,false,false],
    ['LIB006','AI per la cultura','Luca Ferretti','Hoepli',2023,5,'Digital, AI e governance','Intelligenza artificiale applicata ai musei e agli archivi culturali: casi d\'uso e prospettive.','https://www.hoepli.it','','','manuale','attivo',91,false,false],
    ['LIB007','Il turismo culturale','Elena Pirazzoli','FrancoAngeli',2021,4,'Comunità e welfare culturale','Analisi e strategie per lo sviluppo del turismo culturale nei territori italiani.','https://www.francoangeli.it','','','manuale','attivo',82,false,false],
    ['LIB008','Storytelling museale','Marco Borrelli','Carocci',2022,1,'Identità e narrazione museale','Tecniche narrative per la comunicazione museale: dalla didascalia ai contenuti digitali.','https://www.carocci.it','','','manuale','attivo',84,false,false],
    ['LIB009','Mostre temporanee','Giulia Amantini','Electa',2023,3,'Programma, mostre e collezioni','Progettazione e allestimento di mostre temporanee: dalla curatela alla fruizione.','https://www.electaweb.it','','','manuale','attivo',86,false,false],
    ['LIB010','Comunità e patrimonio','Roberta De Luca','Il Mulino',2021,4,'Comunità e welfare culturale','Co-progettazione partecipata nei processi di valorizzazione del patrimonio culturale locale.','https://www.mulino.it','','','manuale','attivo',89,false,false],
  ];
  const existing = sh.getLastRow();
  if (existing < 2) {
    seed.forEach(function(row){
      row[10] = now; // DataAggiunta
      sh.appendRow(row);
    });
    Logger.log('Seed 10 libri inserito');
  }
  Logger.log('[OK] setupPubblicazioniSheet completato');
  return { foglio: SH.LIBRI, righe: sh.getLastRow() - 1 };
}

/**
 * v4.19.1 — Seed 16 libri di museologia selezionati (giugno 2026).
 * Idempotente: salta titoli già presenti. Eseguire dall'editor GAS.
 */
function seedLibriMuseologia2026() {
  var SS = getMainSS();
  var sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) { setupPubblicazioniSheet(); sh = SS.getSheetByName(SH.LIBRI); }
  var existing = sh.getDataRange().getValues();
  var titoli = {};
  for (var i = 1; i < existing.length; i++) titoli[String(existing[i][1]||'').trim().toLowerCase()] = true;
  var now = new Date();
  var seed = [
    ['LIB101','I musei e le forme dello Storytelling digitale','Elisa Bonacini','Aracne',2020,1,'Storytelling digitale','','https://www.libreriauniversitaria.it/musei-forme-storytelling-digitale-bonacini/libro/9788825533699','',now,'Libreria Universitaria','attivo',90,false,false],
    ['LIB102','Il museo come cura. Guida alla prescrizione museale','Angela Savino, Ottavio De Clemente','Universitalia',2025,4,'Cura museale','','https://www.libreriauniversitaria.it/museo-cura-guida-prescrizione-museale/libro/9788832938517','',now,'Libreria Universitaria','attivo',88,false,false],
    ['LIB103','Manuale di gestione e cura delle collezioni museali','Federica Manoli','Le Monnier Università',2022,3,'Gestione collezioni','','https://www.libreriauniversitaria.it/manuale-gestione-cura-collezioni-museali/libro/9788800862264','',now,'Libreria Universitaria','attivo',92,false,false],
    ['LIB104','Il museo nella storia. Dallo studiolo al museo virtuale','Maria Teresa Fiorio','Pearson',2023,1,'Storia dei musei','','https://www.libreriauniversitaria.it/museo-storia-studiolo-museo-virtuale/libro/9788891932099','',now,'Libreria Universitaria','attivo',85,false,false],
    ['LIB105','Il museo nel mondo contemporaneo. La teoria e la prassi','Maria Vittoria Marini Clarelli','Carocci',2024,1,'Teoria e prassi museale','','https://www.libreriauniversitaria.it/museo-mondo-contemporaneo-teoria-prassi/libro/9788829022403','',now,'Libreria Universitaria','attivo',87,false,false],
    ['LIB106','Esperienza o interpretazione. Il dilemma del museo d\'arte moderna','Nicholas Serota','Kappa',2002,3,'Musei d\'arte moderna','','https://www.libreriauniversitaria.it/esperienza-interpretazione-dilemma-museo-arte/libro/9788878904583','',now,'Libreria Universitaria','attivo',91,false,false],
    ['LIB107','Il museo necessario. Mappe per tempi complessi','S. Bodo, A. C. Cimoli','Nomos Edizioni',2023,4,'Museologia sociale','','https://www.libreriauniversitaria.it/museo-necessario-mappe-tempi-complessi/libro/9791259580917','',now,'Libreria Universitaria','attivo',50,false,false],
    ['LIB108','Economia e gestione dei beni culturali e dei musei','Mara Cerquetti, Marta Maria Montella','McGraw-Hill',2024,5,'Gestione d\'impresa nei musei','Il volume discute i paradigmi dell\'economia e gestione delle imprese applicandoli ai beni culturali.','','',now,'McGraw-Hill','attivo',0,false,false],
    ['LIB109','Acquisizioni museali: etica, pratiche e visioni','Valeria Arrabito, Ilaria Navarro','ICOM Italia - CEDOM',2025,3,'Etica e diritto museale','Il volume offre uno sguardo ampio e concreto sul mondo delle acquisizioni museali, trattando provenienze e traffici illeciti.','','',now,'ICOM Italia','attivo',0,false,false],
    ['LIB110','Museologia del presente. Musei sostenibili e inclusivi si diventa','M. Lanzinger, D. Piraina, M. Vanni','Pacini Editore',2024,2,'Sostenibilità e inclusione','Gli autori sottolineano l\'importanza di una progettualità etica e del ruolo olistico, inclusivo e sostenibile (biomuseologia) del museo.','https://www.libreriauniversitaria.it/museologia-presente-musei-sostenibili-inclusivi/libro/9791254863855','',now,'Federculture / Libreria Univ.','attivo',0,false,false],
    ['LIB111','Museologia radicale. Ovvero, cos\'è «contemporaneo» nei musei d\'arte contemporanea?','Claire Bishop','Johan & Levi',2025,3,'Arte contemporanea','','https://www.libreriauniversitaria.it/museologia-radicale-ovvero-cos-contemporaneo/libro/9788860103925','',now,'Libreria Universitaria','attivo',0,false,false],
    ['LIB112','Diritto del patrimonio culturale','Carla Barbati, Marco Cammelli, Lorenzo Casini','Il Mulino',2025,5,'Tutela dei beni culturali','','','',now,'IBS','attivo',0,false,false],
    ['LIB113','Crossroads. Incroci (Museografia e Allestimento nella dimensione "Post-Digitale")','M. Borsotti','Politecnico di Milano',2025,5,'Post-digitale','Contributo in atti di convegno sul rapporto tra musei, spazi espositivi e implementazioni di tecnologie digitali.','https://hdl.handle.net/11311/1300513','',now,'Re.Public@polimi','attivo',0,false,false],
    ['LIB114','Il digitale per i musei. Comunicazione, fruizione, valorizzazione','Nicolette Mandarano','Carocci',2024,5,'Digitalizzazione museale','','https://www.libreriauniversitaria.it/digitale-musei-comunicazione-fruizione-valorizzazione/libro/9788829027354','',now,'Libreria Universitaria','attivo',0,false,false],
    ['LIB115','Il museo immediato. Digitale per la cultura: da Arpanet all\'intelligenza artificiale','Giuliano Gaia','Editrice Bibliografica',2024,5,'Intelligenza artificiale nei musei','','https://www.libreriauniversitaria.it/museo-immediato-digitale-cultura-arpanet/libro/9788893576369','',now,'Libreria Universitaria','attivo',0,false,false],
    ['LIB116','ICOM Italia dalle origini ad oggi (1947-2024). La storia, i temi, i protagonisti','Adele Maresca Compagna','Gangemi Editore',2025,1,'Storia ICOM','','https://www.libreriauniversitaria.it/icom-italia-origini-oggi-1947/libro/9788849251869','',now,'Libreria Universitaria','attivo',0,false,false]
  ];
  var added = 0, skip = 0;
  seed.forEach(function(row) {
    var key = String(row[1]).trim().toLowerCase();
    if (titoli[key]) { skip++; return; }
    sh.appendRow(row);
    titoli[key] = true;
    added++;
    Utilities.sleep(100);
  });
  Logger.log('[seedLibriMuseologia2026] Aggiunti: ' + added + ', Già presenti: ' + skip);
  return { ok: true, aggiunti: added, skip: skip };
}

function getLibriList(params) {
  params = params || {};
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) return { libri: [], total: 0 };
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return { libri: [], total: 0 };
  const head = rows[0];
  const libri = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const item = {};
    head.forEach((col, idx) => { item[col] = r[idx]; });
    if (item.Stato === 'archiviato') continue;
    if (params.ambito && item.Ambito != params.ambito) continue;
    if (params.q) {
      const q = params.q.toLowerCase();
      if (!((item.Titolo||'').toLowerCase().includes(q) ||
            (item.Autore||'').toLowerCase().includes(q) ||
            (item.Editore||'').toLowerCase().includes(q) ||
            (item.Descrizione||'').toLowerCase().includes(q))) continue;
    }
    if (item.DataAggiunta instanceof Date) item.DataAggiunta = formatDate(item.DataAggiunta);
    libri.push(item);
  }
  libri.sort((a, b) => {
    const da = a.DataAggiunta ? new Date(a.DataAggiunta).getTime() : 0;
    const db = b.DataAggiunta ? new Date(b.DataAggiunta).getTime() : 0;
    return db - da;
  });
  return { libri, total: libri.length };
}

function addLibro(body) {
  if (!body || !body.titolo) return { error: 'Titolo obbligatorio' };
  const SS = getMainSS();
  const sh = SS.getSheetByName(SH.LIBRI);
  if (!sh) return { error: 'Foglio Pubblicazioni non trovato. Eseguire setupPubblicazioniSheet().' };
  const id = 'LIB' + Date.now();
  const row = [
    id,
    body.titolo || '',
    body.autore || '',
    body.editore || '',
    body.anno || '',
    parseInt(body.ambito) || 0,
    body.tematica || '',
    body.descrizione || '',
    body.link || '',
    body.copertina_url || '',
    new Date(),            // DataAggiunta
    body.fonte || 'manuale',
    'attivo',
    parseInt(body.score) || 50,
    false,
    false
  ];
  sh.appendRow(row);
  return { ok: true, id };
}
