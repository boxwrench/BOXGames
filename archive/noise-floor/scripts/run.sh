#!/usr/bin/env bash
# Build and run one game. Usage: scripts/run.sh <game-dir-name> [game args]
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAME="${1:?usage: run.sh <game> [args...]}"; shift || true
"$REPO_ROOT/scripts/build.sh" "$GAME"
# Content paths are resolved relative to the game directory.
cd "$REPO_ROOT/games/$GAME"
exec "./bin/$GAME" "$@"
