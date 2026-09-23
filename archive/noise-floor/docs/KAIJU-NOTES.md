# Kaiju Engine notes

Engine behaviours that are non-obvious, cost real debugging time, or shape how
this repo is laid out. Pinned commit is in
[`third_party/ENGINE_PIN`](../third_party/ENGINE_PIN).

The engine is **production-ready; its editor is not**, per its own README. We
use it as a library and do not use the editor.

---

## Content databases are flat and keyed by filename

`assets.FileDatabase` does an exact lookup of the key against its root
directory. Asset keys are **bare filenames** — `"swapchain.renderpass"`,
`"unlit.material"`, `"square.png"` — not paths. A content database is therefore
a single flat directory, and two assets anywhere in the tree that share a
filename will collide.

This is why:

- `scripts/sync-stock-content.sh` flattens the engine's content, mirroring the
  engine's own `gameCopyEditorContent` in `src/main.test.go`, and warns on
  collisions.
- `scripts/build-content.sh` flattens each game's `assets/` into a generated
  `content/` directory rather than shipping the authored folder structure.

Two subtrees are excluded when flattening, matching the engine: `editor/`
(editor-only assets) and `renderer/src` (GLSL sources — only compiled `.spv`
is loaded at runtime).

**Symptom if you get this wrong:** `failed to initialize the GPU: asset
"swapchain.renderpass" not found`, during renderer init, long before any of
your own code runs.

## Games layer their own content over stock

`assets.Database` takes a single root, so `shared/kaijuboot.LayeredDatabase`
resolves a key against game content first, then stock. This keeps the engine
checkout pinned and read-only, and lets stock content be deleted and
regenerated at will.

The engine's sample game instead copies stock content into the game folder on
first run. That leaves an unmanaged copy on disk which silently goes stale when
the engine pin moves.

## `DrawInstanceData` must be set explicitly

A `.shader` descriptor with an empty `DrawInstanceData` falls back to the
shader's **name**. An unregistered name then resolves to `standard`
(`ShaderDataStandard`), which has no `UVs` field — so per-instance UVs collapse
to zero, `fragTexCoords` is constant across the whole mesh, and the shader
renders flat.

**No error is reported.** The shader compiles, links, and draws; it is simply
wrong. Diagnosed during the spike by outputting `vec4(uv.x, uv.y, param, 1)`
and finding red and green pinned while blue tracked correctly.

Registered instance-data names live in
`src/registry/shader_data_registry/` (e.g. `"unlit"` →
`ShaderDataUnlit`, which has both `Color` and `UVs`).

## Per-instance shader parameters work, and are the cheap path

Driving a shader from Go per-instance via the instance colour needs no new
uniform plumbing — `ShaderDataUnlit.Color` arrives as `fragColor`. Packing a
scalar into an unused channel is a legitimate and very cheap way to drive an
effect.

## Sprite throughput is not a constraint

Measured on an RX 7900 XT (RADV), uncapped, one sprite per draw:

| Sprites | mean | p99 |
| ---: | ---: | ---: |
| 300 | 0.34 ms | 0.59 ms |
| 1,000 | 0.88 ms | 1.15 ms |
| 3,000 | 2.51 ms | 3.01 ms |
| 8,000 | 6.04 ms | 6.73 ms |
| 20,000 | 14.60 ms | 15.98 ms |

Linear at ~0.73 µs/sprite; roughly 20,000 fits a 60 fps budget. Design for
allocation churn and GC pauses instead — hence `shared/pool`.

## Integration tests capture screenshots and video

The engine ships an integration-test framework explicitly built for
agent-driven verification (`src/integration_testing/`). Register a launch
function in `tests`, build with the `debug` tag, and run with
`-integrationtest=<name>`.

- `takeScreenshotToFile(host, path)` writes a PNG.
- `startVideoRecording(host, videoRecordingOptions{...})` streams frames to
  `ffmpeg` (MP4/WebM). Call `rec.Stop()` before any `os.Exit` or the file is
  never finalised.

This is how rendering gets verified without a human watching a window, and is
the basis of visual regression testing here.

## Build tags

- `debug` — in-game console (F1) and the integration-test framework
- `editor` — the editor; not used by this repo
- `filedrop`, `rawsrc` — editor-adjacent conveniences

Games are built with `debug` only (see `scripts/build.sh`).

## Platform entry point

`bootstrap.Main(game, platformState)` takes a platform state that is **nil on
Linux and Windows**; only Android and macOS supply one. Mirrors the engine's own
`src/main.go`.

## Linux build dependencies

The engine links X11 (Vulkan surface + clipboard via `golang.design/x/clipboard`)
and ALSA (Soloud audio). Missing X11 headers fail at cgo compile time with
`X11/Xlib.h: No such file or directory`. See [SETUP.md](SETUP.md) for the
rootless workaround `bootstrap.sh` uses.

`WARNING: radv is not a conformant Vulkan implementation` and
`Could not find validation layer VK_LAYER_KHRONOS_validation` are both benign
on Mesa/RADV.
