#!/usr/bin/env bash
# REGIA: installa nel progetto corrente (default) o in ~/.claude (--global).
# Uso: ./install.sh [cartella-progetto] [--global] [--dry-run] [--yes]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Serve Node 20 o superiore (node non trovato)." >&2; exit 1
fi
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 20 ]; then
  echo "Serve Node 20 o superiore (trovato $(node -v))." >&2; exit 1
fi

ARGS=("$@")
GLOBAL=0; YES=0; DRY=0
for a in "$@"; do
  case "$a" in
    --global) GLOBAL=1 ;;
    --yes) YES=1 ;;
    --dry-run) DRY=1 ;;
  esac
done

# Regola 7: l'installazione globale chiede sempre conferma.
if [ "$GLOBAL" = 1 ] && [ "$YES" = 0 ] && [ "$DRY" = 0 ]; then
  echo "Installazione GLOBALE in ~/.claude (vale per tutti i progetti)."
  echo "Prima viene fatto il backup di ~/.claude/settings.json e ~/.claude.json, poi il merge."
  read -r -p "Scrivi SI per confermare: " RISPOSTA
  if [ "$RISPOSTA" != "SI" ]; then echo "Annullato."; exit 0; fi
  ARGS+=("--yes")
fi

exec node "$HERE/scripts/installer.mjs" install ${ARGS[@]+"${ARGS[@]}"}
