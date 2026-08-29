#!/usr/bin/env bash
# Flatten the engine's stock content into third_party/stock_content.
#
# The engine's asset database keys assets by BARE FILENAME, not by path
# (assets.FileDatabase does an exact lookup against its root), so a content
# database is a single flat directory. This mirrors the engine's own
# gameCopyEditorContent in src/main.test.go.
#
# Two subtrees are excluded, matching the engine:
#   editor/       editor-only assets a game never needs
#   renderer/src  GLSL sources; only the compiled .spv is loaded at runtime
#
# Generated and gitignored: delete and re-run at any time. Never edit by hand —
# game-specific assets belong in games/<game>/assets/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/third_party/kaiju/src/editor/editor_embedded_content/editor_content"
DST="$REPO_ROOT/third_party/stock_content"

if [ ! -d "$SRC" ]; then
  echo "Engine content not found at $SRC" >&2
  echo "Run scripts/bootstrap.sh first." >&2
  exit 1
fi

rm -rf "$DST"
mkdir -p "$DST"

collisions=0
while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  if [ -e "$DST/$base" ]; then
    echo "  warning: name collision on '$base' (flat database keys by filename)" >&2
    collisions=$((collisions + 1))
  fi
  cp "$file" "$DST/$base"
done < <(find "$SRC" -type f \
           -not -path "$SRC/editor/*" \
           -not -path "$SRC/renderer/src/*" \
           -print0)

echo "Synced stock content -> $DST ($(find "$DST" -type f | wc -l) files, $collisions collisions)"
