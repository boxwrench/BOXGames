#!/usr/bin/env bash
# Bootstrap a working BOXGames checkout from nothing.
#
# Installs a private Go toolchain, satisfies the engine's C build dependencies
# without root, clones the pinned Kaiju engine, and syncs its stock content.
# Safe to re-run: every step is skipped if already satisfied.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLCHAIN_DIR="${BOXGAMES_TOOLCHAIN_DIR:-/ai/toolchains}"
GO_VERSION="${BOXGAMES_GO_VERSION:-1.27.0}"
ENGINE_REPO="https://github.com/KaijuEngine/kaiju.git"
ENGINE_DIR="$REPO_ROOT/third_party/kaiju"
ENGINE_PIN="$(tr -d '[:space:]' < "$REPO_ROOT/third_party/ENGINE_PIN")"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# 1. Host tools we cannot install ourselves
# ---------------------------------------------------------------------------
say "Checking host tools"
missing=()
for t in gcc git curl tar; do have "$t" || missing+=("$t"); done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing required host tools: ${missing[*]}" >&2
  echo "Install them with your package manager, then re-run." >&2
  exit 1
fi
# Shader compilation is needed to build custom materials, and ffmpeg is needed
# for the engine's video-capture integration tests. Warn rather than fail:
# neither is required just to build and run a game.
for t in glslc ffmpeg; do
  have "$t" || echo "  warning: $t not found (needed for shaders / video tests)"
done
echo "  host tools ok"

# ---------------------------------------------------------------------------
# 2. Go toolchain (private, not on PATH)
# ---------------------------------------------------------------------------
GO_ROOT="$TOOLCHAIN_DIR/go"
if [ -x "$GO_ROOT/bin/go" ] && "$GO_ROOT/bin/go" version | grep -q "go$GO_VERSION"; then
  say "Go $GO_VERSION already installed"
else
  say "Installing Go $GO_VERSION to $GO_ROOT"
  mkdir -p "$TOOLCHAIN_DIR"
  tmp="$(mktemp -d)"
  curl -sSL -o "$tmp/go.tgz" "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
  rm -rf "$GO_ROOT"
  tar -C "$TOOLCHAIN_DIR" -xzf "$tmp/go.tgz"
  rm -rf "$tmp"
fi
"$GO_ROOT/bin/go" version

# ---------------------------------------------------------------------------
# 3. X11 / ALSA development headers, without root
# ---------------------------------------------------------------------------
# The engine links X11 (Vulkan surface + clipboard) and ALSA (Soloud audio).
# Their -dev packages normally need `sudo apt install`, which is unavailable in
# non-interactive environments. Downloading and extracting the .deb files into a
# private prefix gives the same headers and link symlinks with no root.
#
# If you would rather install them properly, this is the equivalent:
#   sudo apt install -y libx11-dev libxcursor-dev libxrandr-dev libxi-dev \
#                       libxinerama-dev libasound2-dev
X11_ROOT="$TOOLCHAIN_DIR/x11deps/root"
if [ -f /usr/include/X11/Xlib.h ]; then
  say "System X11 headers present, skipping private prefix"
  X11_ROOT=""
elif [ -f "$X11_ROOT/usr/include/X11/Xlib.h" ]; then
  say "Private X11 prefix already present"
else
  say "Fetching X11/ALSA dev headers into $X11_ROOT"
  debs="$TOOLCHAIN_DIR/x11deps/debs"
  mkdir -p "$debs" "$X11_ROOT"
  ( cd "$debs" && apt-get download \
      libx11-dev libxcb1-dev libxau-dev libxdmcp-dev x11proto-dev \
      libxcursor-dev libxrandr-dev libxrender-dev libxfixes-dev \
      libxi-dev libxext-dev libxinerama-dev libasound2-dev )
  for d in "$debs"/*.deb; do dpkg -x "$d" "$X11_ROOT"; done

  # The -dev packages ship libFoo.so as a relative symlink to the runtime
  # libFoo.so.N, which lives outside our prefix. Repoint each at the installed
  # system runtime so the linker can resolve it.
  ( cd "$X11_ROOT/usr/lib/x86_64-linux-gnu"
    for l in *.so; do
      tgt="$(readlink "$l" || true)"
      [ -n "$tgt" ] && [ ! -e "$tgt" ] && [ -e "/usr/lib/x86_64-linux-gnu/$tgt" ] \
        && ln -sf "/usr/lib/x86_64-linux-gnu/$tgt" "$l"
    done )
fi

# ---------------------------------------------------------------------------
# 4. Pinned engine checkout
# ---------------------------------------------------------------------------
if [ -d "$ENGINE_DIR/.git" ] && \
   [ "$(git -C "$ENGINE_DIR" rev-parse HEAD)" = "$ENGINE_PIN" ]; then
  say "Engine already at pin $ENGINE_PIN"
else
  say "Cloning Kaiju engine at $ENGINE_PIN"
  rm -rf "$ENGINE_DIR"
  git clone --recurse-submodules "$ENGINE_REPO" "$ENGINE_DIR"
  git -C "$ENGINE_DIR" checkout --quiet "$ENGINE_PIN"
  git -C "$ENGINE_DIR" submodule update --init --recursive
fi

# ---------------------------------------------------------------------------
# 5. Stock content
# ---------------------------------------------------------------------------
say "Syncing engine stock content"
"$REPO_ROOT/scripts/sync-stock-content.sh"

# ---------------------------------------------------------------------------
# 6. Build environment file
# ---------------------------------------------------------------------------
say "Writing scripts/env.sh"
{
  echo "# Generated by scripts/bootstrap.sh — do not edit, re-run bootstrap instead."
  echo "export PATH=\"$GO_ROOT/bin:\$PATH\""
  echo "export GOPATH=\"$TOOLCHAIN_DIR/gopath\""
  if [ -n "$X11_ROOT" ]; then
    echo "export CGO_CFLAGS=\"-I$X11_ROOT/usr/include\""
    echo "export CGO_LDFLAGS=\"-L$X11_ROOT/usr/lib/x86_64-linux-gnu\""
  fi
} > "$REPO_ROOT/scripts/env.sh"

say "Bootstrap complete"
echo "Next:  make build GAME=noise-floor"
echo "       make run   GAME=noise-floor"
