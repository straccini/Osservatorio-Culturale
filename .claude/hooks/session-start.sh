#!/bin/bash
# SessionStart hook — Osservatorio Culturale
# Inietta CLAUDE.md (mappa del codebase) nel contesto a OGNI avvio di
# processo/sessione Claude Code: startup, resume, clear e compact,
# sia in locale che in Claude Code on the web.
# Lo stdout di un hook SessionStart viene aggiunto al contesto della sessione.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"

if [ -f "$CLAUDE_MD" ]; then
  echo "=== CLAUDE.md — Osservatorio Culturale: mappa codebase e regole operative (caricato dallo startup hook, da seguire sempre) ==="
  cat "$CLAUDE_MD"
  echo ""
  echo "=== Fine CLAUDE.md ==="
else
  # Non bloccare l'avvio della sessione: segnala soltanto.
  echo "ATTENZIONE: CLAUDE.md non trovato in $CLAUDE_MD — contesto di progetto non caricato." >&2
fi

# ---------------------------------------------------------------------------
# v4.38 — Promemoria skill "gstack-openclaw" (richiesta Silvano 25/09/2026).
# A OGNI inizio/ripresa sessione, se sono passate >4h dall'ultimo promemoria,
# propone di riattivare le competenze che aiutano nella risoluzione e nella
# costruzione del percorso. Lo stamp sta in /tmp (fuori dal repo, così non
# crea file non tracciati) ed è per-container: in una sessione nuova sul web
# il file non c'è ancora → il promemoria compare; alla ripresa entro 4h resta
# silenzioso (evita di ripeterlo a ogni compact/clear).
# ---------------------------------------------------------------------------
GSTACK_STAMP="${TMPDIR:-/tmp}/oc-gstack-last-prompt"
GSTACK_NOW=$(date +%s)
GSTACK_LAST=0
[ -f "$GSTACK_STAMP" ] && GSTACK_LAST=$(cat "$GSTACK_STAMP" 2>/dev/null || echo 0)
if [ $(( GSTACK_NOW - GSTACK_LAST )) -ge 14400 ]; then
  echo "$GSTACK_NOW" > "$GSTACK_STAMP" 2>/dev/null || true
  echo ""
  echo "=== Promemoria inizio sessione — competenze gstack-openclaw ==="
  echo "Proponi a Silvano di riattivare le competenze che ci aiutano nel percorso"
  echo "(risoluzione problemi e costruzione del lavoro). Chiedi se vuole usarne una ora:"
  echo "  • /gstack-openclaw-office-hours — validare un'idea PRIMA di scrivere codice"
  echo "  • /gstack-openclaw-ceo-review   — rivedere un piano (allargare/ridurre lo scope)"
  echo "  • /gstack-openclaw-investigate  — debug con analisi della causa radice"
  echo "  • /gstack-openclaw-retro        — retrospettiva settimanale sui commit"
  echo "Se è inizio settimana, suggerisci la retro; altrimenti scegli la più utile al contesto."
  echo "=== Fine promemoria ==="
fi

exit 0
