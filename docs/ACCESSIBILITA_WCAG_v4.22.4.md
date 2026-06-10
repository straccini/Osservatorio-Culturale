# Accessibilità WCAG 2.1 AA — Correzioni v4.22.4

**App:** Sinopia · Osservatorio Culturale (Google Apps Script)
**Data:** 2026-06-09 · **Standard:** WCAG 2.1 AA
**Tipo:** correzioni "quick win" — additive, basso rischio, nessun impatto sul funzionamento.

---

## 1. Cosa è stato corretto in questo rilascio

| # | Problema | Criterio WCAG | File | Modifica |
|---|----------|---------------|------|----------|
| 1 | Testo secondario poco leggibile (`--ink-4 #A1A1A6` = 2.6:1) | 1.4.3 Contrasto | `Styles.html` | Token `--ink-4` → `#74747A` (**4.7:1** su bianco) |
| 2 | Focus ring quasi invisibile sui bottoni (ring `--accent-soft #F0E6E4` ≈ 1.1:1) | 2.4.7 Focus visibile · 1.4.11 Contrasto non-testo | `Styles.html` | `.btn:focus-visible` e `.br-act:focus-visible` → `outline 2px solid var(--accent)` (5.6:1) |
| 3 | Input di accesso etichettati solo dal `placeholder` | 3.3.2 Etichette · 4.1.2 Nome/Ruolo/Valore | `Index.html` (`_gateOspite`) | `aria-label` su `_gateEmail`, `_gateNome`, `_gateCognome`, `_gateRegEmail` |
| 4 | Messaggio di esito login non annunciato dallo screen reader | 3.3.1 · 4.1.3 | `Index.html` | `#_gateMsg` → `role="alert" aria-live="assertive"` |
| 5 | Modale di accesso senza ruolo dialog | 4.1.2 | `Index.html` | overlay `_gateOspite` → `role="dialog" aria-modal="true" aria-label="Accedi o registrati"` |
| 6 | Menu utente senza stato apertura | 4.1.2 | `Topbar.html` + `Index.html` | `#topbarUserBtn` → `aria-haspopup="menu" aria-expanded` (sincronizzato in `toggleUserMenu`); `#topbarUserMenu` → `role="menu"` |

**Versione:** `OC_VERSION` → **v4.22.4** (`Constants.js`).

> Nota su #1: `--ink-4` è usato anche per alcuni bordi/icone e per lo sfondo dei bottoni disabilitati. Diventeranno leggermente più scuri — è l'effetto voluto (più leggibili). Se vuoi un grigio più tenue mantenendo l'AA, il limite è circa `#767676`.

---

## 2. Deploy — da copiare nel PowerShell

```powershell
cd "C:\Users\sstra\Desktop\01_DUEMILAMUSEI_PROGETTI\musemu matrix"
.\sync-oc-to-gas.ps1
```

Copia i file, fa `clasp push` e l'auto-deploy sulla produzione (URL invariato). Nessun passo manuale aggiuntivo: sono tutte modifiche frontend.

---

## 3. Come verificare

1. Apri l'app in incognito → `Ctrl+Shift+R`. In sidebar deve comparire **V4.22.4**.
2. **Tastiera:** premi `Tab` tra i bottoni → ora si vede un contorno terracotta netto.
3. **Contrasto:** date, fonti e didascalie grigie sono più leggibili.
4. **Screen reader (NVDA/VoiceOver):** apri "Accedi" → annuncia "dialogo, Accedi o registrati"; i campi annunciano "Email", "Nome", ecc.; un errore di login viene letto subito.

---

## 4. FASE 2 — rimanente (prompt pronto per Claude Code)

> Queste correzioni toccano il comportamento (JS) e vanno fatte con cura. Incolla il blocco sotto in Claude Code quando vuoi procedere.

```
Obiettivo: completare l'accessibilità WCAG 2.1 AA dell'app Sinopia (oc-codebase), in modo ADDITIVO senza stravolgere il funzionamento. Poi deploy con sync-oc-to-gas.ps1.

1) TASTIERA SULLE CARD CLICCABILI (WCAG 2.1.1 / 4.1.2) — priorità alta.
   Le righe/card che aprono il dettaglio hanno onclick su <div>. Per ognuna (es. _brRowHtml_, _newsCardHtml_, _podcastCardHtml_, _videoCardHtml_, _libroCardHtml_, _archivioCardHtml_, le tile del social wall):
   - aggiungere role="button" e tabindex="0" all'elemento cliccabile;
   - aggiungere un handler globale (delegato) keydown: se il target ha [role=button][tabindex] e il tasto è Enter o Spazio, prevenire il default e invocare lo stesso onclick.
   In alternativa, un solo listener delegato su document che gestisce Enter/Space per gli elementi marcati.

2) FOCUS-TRAP + ESC NEI MODALI (WCAG 2.1.2 / 2.4.3).
   Per gli overlay (oc-regform-overlay/_gateOspite, oc-gdpr-gate, detail overlay, guida, servizi):
   - Esc chiude il modale;
   - il focus resta dentro il modale (ciclo tra gli elementi focusabili);
   - alla chiusura, il focus torna all'elemento che ha aperto il modale.

3) TARGET TOCCO >=44px (WCAG 2.5.5/2.5.8) — bottoni azione .br-act e icone topbar: ampliare area cliccabile (padding) mantenendo la grafica.

4) CONTRASTO BADGE AMBITO 2 (verde --amb-2 #10916D ~4:1) per testo piccolo: valutare #0F7B5A.

5) Estendere aria-label/role=alert anche a _showRegForm_ (form di accesso legacy) se ancora in uso.

Dopo le modifiche: node --check sui file .js, poi sync-oc-to-gas.ps1.
```

---

*Riferimento: audit WCAG 2.1 AA del 2026-06-09. Punti già conformi prima del fix: `lang="it"`, controllo dimensione testo a 3 livelli, ricerca con `role="search"`+`aria-label`, toast `aria-live`, landmark `<nav aria-label>`, dark mode, focus-visible sugli input.*
