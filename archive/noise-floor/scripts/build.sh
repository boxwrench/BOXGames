#!/usr/bin/env bash
# Build one game. Usage: scripts/build.sh <game-dir-name> [extra go build flags]
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAME="${1:?usage: build.sh <game> [flags...]}"; shift || true
GAME_DIR="$REPO_ROOT/games/$GAME"
[ -d "$GAME_DIR" ] || { echo "No such game: $GAME (see games/)" >&2; exit 1; }
[ -f "$REPO_ROOT/scripts/env.sh" ] || { echo "Run scripts/bootstrap.sh first." >&2; exit 1; }
# shellcheck source=/dev/null
source "$REPO_ROOT/scripts/env.sh"
cd "$GAME_DIR"
# The debug tag enables the in-game console (F1) and the integration test
# framework used for visual regression.
go build -tags="debug" "$@" -o "$GAME_DIR/bin/$GAME" ./cmd/...
echo "Built games/$GAME/bin/$GAME"
