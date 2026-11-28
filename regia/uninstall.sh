#!/usr/bin/env bash
# REGIA: disinstalla dal progetto corrente (default) o da ~/.claude (--global).
# Uso: ./uninstall.sh [cartella-progetto] [--global] [--purge]
# Rimuove solo cio che REGIA ha aggiunto; i file tornano identici se non li hai modificati.
# --purge cancella anche memoria, statistiche e backup in ~/.regia.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$HERE/scripts/installer.mjs" uninstall "$@"
