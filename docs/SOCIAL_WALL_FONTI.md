# Social Wall — lista fonti da gestire

**Scopo:** lista di lavoro per popolare il Social Wall della home. Si gestisce tra fonti **importate** (seed) e fonti **trovate online**, inserite sempre via *Aggiungi fonte* (foglio `SocialFonti`) quando hanno un feed, oppure via *Rilancio manuale* quando non ce l'hanno.

## Due meccanismi
| Meccanismo | Per cosa | Come |
|---|---|---|
| **Aggiungi fonte** (foglio `SocialFonti`) | testate/istituzioni/persone **con feed** (RSS, Substack, Mastodon `…/@utente.rss`, YouTube) | admin → "Aggiungi fonte" (nome, URL feed, tipo, categoria) → il wall la pesca da sola |
| **Rilancio manuale** (`SocialWall_v1.js` → `rilanciaPost`) | **post singoli** da piattaforme chiuse (X, Instagram, LinkedIn) o persone senza feed | incolli l'URL → precompila (OG) → pubblichi nel wall |

**Fattibilità feed automatico:** ✅ RSS · ✅ Substack · ✅ Mastodon (`https://<istanza>/@utente.rss`) · ✅ YouTube (canale) · ❌ X/Instagram/LinkedIn di terzi (chiusi → rilancio manuale). Account **propri di Sinopia** (futuri): se hanno blog/Mastodon → feed; altrimenti rilancio manuale / API owned.

---

## A. Testate / istituzioni — GIÀ ATTIVE (seed `SocialFonti`)
MiC (Comunicati, Musei) · ICOM Italia · Federculture · MAB Italia · AMACI · Fondazione Symbola · Fondazione Fitzcarraldo · Fondazione Feltrinelli · MAXXI · Triennale Milano · FAI · Artribune · Il Giornale delle Fondazioni · MuseumNext · Exibart · Finestre sull'Arte · Flash Art · Doppiozero · Secondo Welfare · Agenda Digitale · Compagnia di San Paolo · Touring Club · AIB · Treccani Magazine · Il Sole 24 Ore Cultura · Repubblica Cultura.

→ Copertura testate **buona**. Si aggiungono altre via *Aggiungi fonte* quando le troviamo.

---

## B. PERSONE / opinion leader — TROVATE (ricerca web 2026-06-08, con fonti)
> Quasi tutti sono raggiungibili solo via **LinkedIn** (chiuso → **rilancio manuale**). I pochi con feed reale → **aggiungi fonte**. Gli URL LinkedIn vanno confermati a vista (omonimie); per il rilancio manuale conta comunque l'URL del singolo post.

### B.1 — Firme/curatori "Io sono Cultura" (Symbola) 2023-2025
| Nome | Ruolo | Online | Stato proposto |
|---|---|---|---|
| Ermete Realacci | Presidente Symbola | LinkedIn | rilancio manuale |
| Domenico Sturabotti | Direttore Symbola (regia rapporto) | LinkedIn | rilancio manuale |
| Annalisa Cicerchia | Economista cultura, comitato scientifico | accademica | rilancio manuale |
| Catterina Seia | Cultural Welfare Center | LinkedIn | rilancio manuale |
| Alessio Re | Fondazione Santagata (economia cultura) | LinkedIn | rilancio manuale |
| Ugo Bacchella · Luca Dal Pozzolo | Fondazione Fitzcarraldo | LinkedIn | rilancio manuale |

### B.2 — Federculture (convegni + Rapporto, 2024-2025)
| Nome | Ruolo | Online | Stato |
|---|---|---|---|
| Andrea Cancellato | Presidente Federculture | LinkedIn + autore Artribune | feed via Artribune / manuale |
| Francesco Spano | Direttore Federculture | — | manuale |
| Alberto Bonisoli | Ufficio Studi Federculture (ex Ministro) | LinkedIn | manuale |
| Daniela Picconi | VP Federculture | — | manuale |
| Patrizia Asproni | Fondazione Cariplo | LinkedIn | manuale |
| Davide Usai | DG FAI | LinkedIn | manuale |

### B.3 — Firme "La Domenica" Sole 24 Ore
| Nome | Ruolo | Online | Stato |
|---|---|---|---|
| Marco Carminati | Resp. pagine arte Domenica | pagina-autore Sole24 | feed da verificare |
| Stefano Salis | Responsabile Domenica | LinkedIn + pagina-autore | feed da verificare |
| Fulvio Irace | Architettura (dal 1986) | pagina-autore | feed da verificare |
| Lina Bolzoni | Letteratura | pagina-autore | feed da verificare |
| Ada Masoero | Arte/mostre | — | manuale |

### B.4 — Professori (beni culturali / management cultura) su LinkedIn
| Nome | Univ. | Online | Stato |
|---|---|---|---|
| **Ludovico Solima** | Vanvitelli/Suor Orsola — museum management | LinkedIn + blog WordPress | **feed ok → aggiungi fonte** |
| Michele Trimarchi | Catanzaro/IUAV — cultural economics | LinkedIn + Tafter | feed (Tafter) / manuale |
| Stefano Monti | Gregoriana — Monti&Taft | LinkedIn + Tafter | feed (Tafter) / manuale |
| Franco Broccardi | Bergamo — economia/fisco cultura | LinkedIn (molto attivo) | manuale |
| Pier Luigi Sacco | IULM — cultura e benessere | LinkedIn | manuale |
| Nicolette Mandarano | IULM — musei e digitale | LinkedIn | manuale |

**Legenda:** `feed ok → aggiungi fonte` (RSS reale) · `feed da verificare` (probabile RSS pagina-autore/blog) · `rilancio manuale` (solo LinkedIn/social chiuso).

### ✅ Feed verificati con fetch reali (2026-06-08)
| Candidato | Esito | Azione |
|---|---|---|
| **Ludovico Solima** — `https://opzionecultura.wordpress.com/feed/` | ✅ VALIDO (RSS, in target, bassa cadenza) | **Aggiungi fonte** (tipo `persona`) |
| Tafter (Trimarchi/Monti) | ❌ dominio storico offline; `tafterjournal.it` dirottato a **spam casinò** | NON usare → rilancio manuale |
| Sole 24 Ore — firme Domenica | ❌ nessun feed per-autore (solo categoria `ilsole24ore.com/rss/cultura.xml`, già fonte SW35) | rilancio manuale |
| Artribune / Cancellato | ❌ feed fermo al 2015 | rilancio manuale |

**Conclusione:** per gli opinion leader individuali i feed automatici quasi non esistono → il **rilancio manuale** è il meccanismo principale del social wall. Unico feed-persona utile finora: **Solima**.

---

## B.5 — Musei e gallerie internazionali (segnalazione 2026-07-19, caso Turrell/ARoS)
> Verifica feed con fetch reali 2026-07-20. Le gallerie commerciali e i musei internazionali
> quasi mai espongono RSS → il canale per il wall è il **rilancio manuale** dei loro
> post/annunci migliori (Instagram/LinkedIn), oppure la newsletter come segnale d'ingresso.

| Candidato | Esito verifica | Azione |
|---|---|---|
| **ARoS Aarhus** (aros.dk) | ❌ nessun RSS/API; newsletter (heyloyalty) + IG/FB/LinkedIn attivi; sezione press | rilancio manuale (annunci mostre/skyspace); newsletter come alert |
| **Gagosian** (gagosian.com/news) | ❌ 403 al fetch, nessun feed noto; news frequenti | rilancio manuale (committenze/mostre major) |
| **Almine Rech** (alminerech.com) | ❌ nessun feed (verificato HTML: no rel=alternate) | rilancio manuale |
| Designboom / Dezeen / ArchDaily / Artsy / Galerie / Archpaper | ✅/⚠ feed RSS → entrano come **fonti news** (batch `fontiAggiungiBatchDesignArte`, v4.27.42) | NON social wall: già coperte dal flusso news |

**Nota API**: l'API pubblica di Artsy (api.artsy.net) richiede credenziali e non è più aperta a
nuovi utenti generici → si usa il feed RSS `artsy.net/rss/news`. Il Sole 24 Ore EN espone un
indice RSS completo (`en.ilsole24ore.com/rss`) — è di fatto la sua "API" gratuita.

---

## C. Account Sinopia (futuri)
Da aggiungere quando attivati (blog/Mastodon = feed; IG/LinkedIn = rilancio manuale o API owned). Tipo: `sinopia`.

---

## Workflow operativo
1. Silvano manda 3-5 nomi (con eventuale handle/sito).
2. Per ciascuno: cerco e **verifico il feed** (RSS/Substack/Mastodon/YouTube).
3. **Con feed** → lo aggiungo a `SocialFonti` (via *Aggiungi fonte*), tipo `persona`.
4. **Senza feed** → resta come candidato per il *Rilancio manuale* dei suoi post migliori.
5. Aggiorno questa tabella con lo stato.
