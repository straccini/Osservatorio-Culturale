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

## B. PERSONE / opinion leader — DA TROVARE INSIEME
> Silvano fornisce i nomi; per ciascuno verifico se ha un feed (→ Aggiungi fonte) o se va in Rilancio manuale.

| # | Nome | Ruolo / perché | Piattaforma | Feed trovato (URL) | Stato | Origine |
|---|---|---|---|---|---|---|
| 1 | _(da inserire)_ | | | | da verificare | online |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**Stato possibili:** `da verificare` · `feed ok → aggiunta a SocialFonti` · `senza feed → rilancio manuale`.

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
