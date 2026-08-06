# Importare fonti da un archivio esterno

Istruzioni per chi compila il file e per chi lo importa.
Modello pronto: **`modello-import-fonti.csv`** (in questa cartella).

---

## Parte 1 — Per chi compila

### Il file

Aprire `modello-import-fonti.csv` con Excel, Numbers o Fogli Google.
**Cancellare le tre righe di esempio** e inserire una riga per ogni fonte.

Il separatore è il **punto e virgola** (`;`), quello che usa l'Excel italiano.
Se il file si apre con tutto in una colonna sola, in Excel: *Dati → Testo in
colonne → Delimitato → Punto e virgola*.

### Le colonne

Le prime tre sono **obbligatorie**, le altre facoltative ma utili.

| Colonna | Obbl. | Cosa scrivere |
|---|---|---|
| **Categoria** | sì | Una fra: `bandi`, `news`, `podcast`, `video`, `norme`, `libri`, `social`, `lavoro` |
| **Nome** | sì | Come si chiama la fonte. È il nome che comparirà nei report |
| **URL** | sì | L'indirizzo del **feed RSS/Atom** se esiste, altrimenti del sito |
| Ente | no | Chi pubblica: ministero, regione, fondazione, testata… |
| SitoWeb | no | La home page, se diversa dall'URL del feed |
| Copertura | no | `nazionale`, `regionale`, `internazionale`, `locale` |
| Regione | no | Solo per fonti regionali o locali |
| Lingua | no | `it`, `en`, `fr`… (vuoto significa `it`) |
| Tipologie | no | Codici della tassonomia separati da virgola: `T1,T3,T9` |
| Ambiti | no | Numeri di ambito separati da virgola: `1,3,5` |
| Note | no | Qualsiasi indicazione utile a chi valuterà la fonte |

### Come trovare l'URL del feed

Il valore più prezioso è il **feed**, non la home page: con il feed la fonte
si aggiorna da sola.

- Cercare sul sito le parole *RSS*, *Feed*, *Abbonati*, o l'icona arancione
- Provare ad aggiungere `/feed`, `/rss` o `/feed/` all'indirizzo del sito
- Su un canale YouTube: l'indirizzo del feed è
  `https://www.youtube.com/feeds/videos.xml?channel_id=` seguito dall'ID del
  canale (quello che comincia per `UC`)
- Se non si trova, va bene l'indirizzo del sito: il sistema proverà a
  individuarlo da solo

**Se una fonte ha solo la newsletter e nessun feed**, scriverlo nelle Note:
verrà gestita iscrivendo l'indirizzo dell'Osservatorio.

### Le tipologie (facoltative, ma aiutano)

| | |
|---|---|
| **T1** | Riqualificazione, progettazione, musealizzazione degli spazi |
| **T2** | Sistemi HW/SW e AI per la fruizione |
| **T3** | Accessibilità integrata (LIS, ETR, CAA, Braille) |
| **T5** | Audience, partecipazione, welfare culturale, co-progettazione |
| **T6** | Gestione e valorizzazione del patrimonio per enti pubblici |
| **T7** | Sviluppo di asset turistici a base culturale |
| **T8** | Sviluppo territoriale integrato (GAL, distretti) |
| **T9** | Creazione e gestione di contenuti culturali e museali |
| **T10** | Altre espressioni culturali: design, arti performative, cinema… |

*(T4 non esiste: non è un errore di stampa.)*

### Cosa NON serve fare

- **Non serve controllare i duplicati**: lo fa il sistema, sia dentro il file
  sia rispetto alle fonti già presenti
- **Non serve ordinare le righe** né mantenere l'ordine delle colonne: il
  sistema riconosce le colonne dal nome, e accetta anche sinonimi ragionevoli
  (`Titolo` per Nome, `Feed` o `Link` per URL, `Editore` per Ente…)
- **Non serve verificare che i feed funzionino**: c'è una verifica tecnica
  apposita dopo l'importazione

---

## Parte 2 — Per chi importa

Tutto da **Impostazioni → Sistema → Strumenti**, blocco *Import fonti*.

### La sequenza

1. **Carica CSV** — si incolla il contenuto del file. Il sistema riconosce da
   solo il separatore (virgola o punto e virgola), gestisce i campi tra
   virgolette e mappa le colonne per nome. Riferisce quali ha trovato e quali
   no. *Questo passo non importa nulla: riempie solo il foglio di lavoro.*
2. **Anteprima** — dice, riga per riga:
   - quante fonti sono **importabili**
   - quante **scartate** e perché (categoria non valida, URL malformata,
     campi mancanti)
   - quante **duplicate dentro il file stesso**
   - quante **già presenti** nel sistema, e dove
   - quante hanno una **sovrapposizione di dominio**: non sono duplicati, ma
     provengono da un sito già monitorato. Vanno guardate: spesso sono il
     feed generale e quello di categoria dello stesso sito, che porterebbero
     gli stessi contenuti due volte
3. **Importa** — scrive le fonti. Le non-bandi vanno nel `RegistroFonti`, le
   bandi in `FontiBandi_v5`.
4. **Verifica tecnica** — prova i feed importati e dice quali rispondono
   davvero, quali rispondono ma non sono feed, quali sono in errore.

### Dove finiscono

Tutte le fonti importate entrano in **quarantena**: raccolgono contenuti, ma
questi non vengono esposti finché la fonte non dimostra di produrre in modo
pulito. Le fonti bandi entrano **inattive** e si attivano dopo la verifica.

È la stessa politica degli agenti Scout: nulla arriva al pubblico senza
essere passato da un controllo.

### Il controllo duplicati, in dettaglio

L'anteprima confronta ogni riga con **sei registri**: `RegistroFonti`,
`FontiFeed`, `FontiBandi_v5`, `SocialFonti`, `FontiPodcast` e
`FontiCandidate`.

Quest'ultimo comprende anche le fonti **già valutate e scartate** dagli
agenti Scout: una fonte respinta non deve poter rientrare da un'altra porta.

Il confronto usa l'URL normalizzata — stessa fonte con o senza `www`, con o
senza `https`, con o senza barra finale — ma **conserva i parametri
significativi**: due canali YouTube che differiscono solo per `channel_id`
sono due fonti diverse, non un duplicato. (Questo dettaglio ha causato un
guasto reale: un dedup troppo aggressivo aveva cancellato 21 canali museali.)

---

## Domande frequenti

**Quante fonti posso importare in una volta?**
Non c'è un limite fisso. Oltre le 200 righe conviene spezzare il file, perché
la verifica tecnica interroga i siti uno a uno e ha un tetto di tempo.

**Posso reimportare lo stesso file?**
Sì. Le fonti già presenti vengono riconosciute e saltate, non duplicate.

**Cosa succede se sbaglio una categoria?**
La riga viene scartata con il motivo scritto, e le altre passano. Si corregge
il file e si ripete.

**Posso importare fonti senza feed?**
Sì, indicando l'indirizzo del sito. Resteranno in quarantena finché non si
individua un canale di aggiornamento.
