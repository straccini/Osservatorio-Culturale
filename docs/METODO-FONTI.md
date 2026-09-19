# Metodo fonti — responso unico (25/08/2026)

Documento di metodo nato dalla prima valutazione completa delle candidate del
miner (85 righe, 24-25/08). Vale come riferimento per tutti i cicli futuri
della skill `scout-fonti-settimanale`.

## Il verdetto sull'impostazione

**Il principio del miner è giusto e va tenuto**: scavare la bibliografia e i
riferimenti citati dentro i contenuti già acquisiti è il modo più naturale di
scoprire fonti pertinenti — una fonte citata da una fonte buona parte
avvantaggiata. I casi di rumore osservati non sono un difetto del principio ma
della sua applicazione: il miner raccoglieva QUALUNQUE dominio linkato,
compresa l'impalcatura tecnica delle pagine (font, CDN, tag manager, consent,
pubblicità, social embed). Da qui le tre cinte ora nel codice:

1. **Cinta piattaforme** (storica): social, wiki, big tech
2. **Cinta infrastruttura** (24/08): CDN, analytics, ads, consent, shortener,
   piattaforme email, font
3. **Cinta sottodomini di servizio** (24/08): `shop.` `cdn.` `docs.` `ads.`
   `service.` `static.` ecc. — appendici tecniche di fonti spesso già censite

Regola operativa: quando nel riepilogo compare rumore nuovo, NON scartarlo a
mano e basta — **aggiungere il pattern alla cinta**, così sparisce per sempre.

## La classificazione che ha retto alla prova

| Verdetto | Criterio |
|---|---|
| **INTEGRA** | feed/API verificati VIVI con item recenti + contenuti pertinenti |
| **INVITO NEWSLETTER** | fonte viva senza feed ma con newsletter — iscrizione manuale con sinopiaconsulting@gmail.com |
| **RIVEDI** | vivo ma dubbio: feed vuoto alla sonda esterna (possibile anti-bot → ritestare da GAS con `scanFonteSingola`), pertinenza incerta, rate-limit |
| **SCARTA** | infrastruttura, fuori tema, sottodominio di fonte già censita, feed morto da >6 mesi |

Tre trappole imparate sul campo:
- **feed sintatticamente valido ≠ feed vivo**: eureka3d e borsaturismo hanno
  feed WP corretti ma VUOTI alla sonda esterna — servono ritest da GAS prima
  di condannarli (l'IP del datacenter è spesso trattato diversamente)
- **il feed dichiarato dal seed va sempre riverificato**: unimc dichiarava un
  rss fermo al 2021; unitus dichiarava il feed di una "pagina di esempio" WP
  mentre il feed principale `/feed` è vivo e aggiornato
- **la citazione non qualifica la fonte**: qualifica L'ARTICOLO che la cita.
  Se l'articolo è spazzatura, i suoi link sono spazzatura (v. sotto)

## Il segnale più importante: il miner come termometro di Items

Il rumore del miner ha rivelato un problema A MONTE: dentro Items ci sono
articoli fuori tema o spam (un pezzo su un casinò in tedesco, sport
universitario colombiano, migrazione francese). Significa che una o più fonti
censite stanno servendo contenuti non pertinenti e il filtro AI (soglia 3) li
lascia passare.

**Procedura quando succede**: risalire dall'articolo alla colonna Fonte in
Items → ispezionare la fonte → se compromessa o derivata, ritirarla → se il
filtro ha fallito, annotare il caso per la taratura. Il miner, scavando ciò
che è entrato, fa gratis da termometro della qualità dell'ingest: ogni suo
"rumore" con citazione strana è un indizio su Items, non solo sulla candidata.

## Esito della prima applicazione (24-25/08, 85 candidate)

- **INTEGRA subito (feed vivi, sonda di oggi)**: Sapienza (`uniroma1.it/rss.xml`,
  aggiornato oggi) · Statale Milano (`lastatalenews.unimi.it/rss.xml`, oggi) ·
  Firenze (`unifi.it/rss.xml`, oggi) · Tuscia (`unitus.it/feed`, oggi — NON il
  feed dichiarato dal seed) · IUAV (`iuav.it/rss.xml`, 20/08) · Bergamo
  (`unibg.it/rss.xml`, giu 2026) · Pisa (`unipi.it/feed`, apr 2026) ·
  exibartprize (`exibartprize.com/feed`, lug 2026)
- **INVITO NEWSLETTER**: IULM · Perugia
- **RIVEDI**: eureka3d, borsaturismoarcheologico, exibartstreet (feed vuoti
  alla sonda → ritest da GAS) · magazine.unibo (atom stantio, sito vivo) ·
  unimc (feed 2021) · unive, unipd, unito, unina, unisalento, unipa, imtlucca
  (nessun feed esposto → newsletter o scraping) · museiprovincialucca,
  villaggiominerarioasproni (istituzionali locali, pertinenti ma micro) ·
  new.artsmia.org (429) · europeanheritagehub.eu (403 WAF alla sonda, fonte
  MOLTO pertinente: ritentare da GAS) · produzionidalbasso (niente feed;
  possibile monitor progetti cultura via scraping mirato)
- **SCARTA**: tutta l'infrastruttura (coperta dalle cinte), i sottodomini
  exibart/finestresullarte/lastampa/ldh, sport colombiano, assicurazioni/
  acque/fotocamere citate da articoli di costume, reputationmanager
