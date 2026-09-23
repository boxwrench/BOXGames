#!/usr/bin/env bash
# Build a game's flat content database from its authored assets.
#
# Usage: scripts/build-content.sh <game-dir-name>
#
# Authored assets live in games/<game>/assets/ organised in subfolders for human
# benefit. The engine needs a flat directory keyed by bare filename, so this
# flattens them into games/<game>/content/ (generated, gitignored) and compiles
# any GLSL under assets/shaders/src/ to SPIR-V alongside.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAME="${1:?usage: build-content.sh <game>}"
ASSETS="$REPO_ROOT/games/$GAME/assets"
CONTENT="$REPO_ROOT/games/$GAME/content"
ENGINE_GLSL="$REPO_ROOT/third_party/kaiju/src/editor/editor_embedded_content/editor_content/renderer/src"

[ -d "$ASSETS" ] || { echo "No assets dir for game '$GAME' at $ASSETS" >&2; exit 1; }

rm -rf "$CONTENT"
mkdir -p "$CONTENT"

# 1. Compile GLSL -> SPIR-V. Includes resolve against the engine's shader
#    sources so kaiju.glsl and the .inl helpers are available.
shader_count=0
if [ -d "$ASSETS/shaders/src" ]; then
  if ! command -v glslc >/dev/null 2>&1; then
    echo "glslc not found but $ASSETS/shaders/src exists; install shaderc" >&2
    exit 1
  fi
  for src in "$ASSETS"/shaders/src/*.frag "$ASSETS"/shaders/src/*.vert; do
    [ -e "$src" ] || continue
    stage="${src##*.}"
    out="$CONTENT/$(basename "$src").spv"
    glslc -fshader-stage="$stage" -I "$ENGINE_GLSL" -I "$ASSETS/shaders/src" "$src" -o "$out"
    shader_count=$((shader_count + 1))
  done
fi

# 2. Flatten everything else. shaders/src is excluded: only compiled .spv ships.
while IFS= read -r -d '' file; do
  cp "$file" "$CONTENT/$(basename "$file")"
done < <(find "$ASSETS" -type f -not -path "$ASSETS/shaders/src/*" -print0)

echo "Built games/$GAME/content ($(find "$CONTENT" -type f | wc -l) files, $shader_count shaders compiled)"
