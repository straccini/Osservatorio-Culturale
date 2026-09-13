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

exit 0
