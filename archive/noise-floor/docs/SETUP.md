# Setup

```sh
make bootstrap
```

Safe to re-run; every step is skipped when already satisfied. Nothing is
installed system-wide and no root is required.

## What it does

1. **Checks host tools.** Requires `gcc`, `git`, `curl`, `tar`. Warns (but does
   not fail) if `glslc` or `ffmpeg` are missing — those are needed for custom
   shaders and for the engine's video-capture integration tests respectively,
   not to build and run.
2. **Installs Go** to `/ai/toolchains/go`, deliberately off `PATH` so it cannot
   shadow a system Go. Override with `BOXGAMES_TOOLCHAIN_DIR` /
   `BOXGAMES_GO_VERSION`.
3. **Provides X11 + ALSA dev headers** (see below).
4. **Clones the pinned engine** to `third_party/kaiju` at the commit in
   `third_party/ENGINE_PIN`, with submodules (prebuilt Soloud, content tools).
5. **Syncs stock content** into `third_party/stock_content`.
6. **Writes `scripts/env.sh`** with `PATH`, `GOPATH`, and the cgo flags. Every
   build script sources it.

## The X11 workaround

The engine links X11 (Vulkan surface and clipboard) and ALSA (Soloud audio).
Their `-dev` packages normally need root:

```sh
sudo apt install -y libx11-dev libxcursor-dev libxrandr-dev libxi-dev \
                    libxinerama-dev libasound2-dev
```

`sudo` needs a TTY, which non-interactive and agent-driven sessions do not
have. So when system headers are absent, bootstrap downloads the `.deb` files
with `apt-get download` (no root) and extracts them to
`/ai/toolchains/x11deps/root`, then points `CGO_CFLAGS`/`CGO_LDFLAGS` at that
prefix.

One subtlety: `-dev` packages ship `libFoo.so` as a *relative* symlink to the
runtime `libFoo.so.N`, which lives outside the private prefix. Bootstrap
repoints each at the installed system runtime, otherwise linking fails with
unresolved symlinks.

If system headers are present, the private prefix is skipped entirely.

## Troubleshooting

**`X11/Xlib.h: No such file or directory`** — bootstrap did not run, or
`scripts/env.sh` was not sourced. Build via `make`, which sources it.

**`asset "swapchain.renderpass" not found in any content layer`** — stock
content is missing or unflattened. Run `make sync-content`.

**`unrecognized import path "boxwrench.dev/boxgames/shared"`** — Go is resolving
a monorepo module over the network. Check `go env GOWORK` points at the repo's
`go.work`, and that the `replace` directives in the game's `go.mod` are intact.

**`radv is not a conformant Vulkan implementation`** and **`Could not find
validation layer`** — benign on Mesa/RADV. Not errors.

**Engine pin changed** — re-run `make bootstrap`. It re-clones the engine and
re-syncs stock content. Never fix this by editing `third_party/kaiju/`.

## Verified environment

Ubuntu 24.04 · Linux 7.0 · Wayland with XWayland · Mesa RADV · Radeon RX 7900 XT
· Vulkan 1.3.275 · Go 1.27.0
