# Where things stand

Last updated: 2026-08-29 (after gameplay tasks 1–5, branch reviewed and complete). Update this when the state below stops being true.

## Cold start

```sh
cd /ai/github/BOXGames
make bootstrap              # safe to re-run; skips anything already satisfied
make run GAME=noise-floor
```

Nothing needs `sudo`. Nothing needs to be installed system-wide. If `make
bootstrap` is skipped, `make build` fails with `Run scripts/bootstrap.sh first.`
rather than doing something confusing.

Verified from an empty environment (`env -i`, no `PATH` additions, no
`scripts/env.sh`): bootstrap → build → test → run all succeed.

## What works right now

| Thing | State |
| --- | --- |
| Monorepo scaffold, workspace, build scripts | Working |
| `make bootstrap / build / run / test / vet / fmt / clean` | Working |
| NOISE FLOOR binary | First playable **on `feat/noise-floor-gameplay`, not `main`**. Paper field with grain, corruption model, BX-77 as a placeholder ink square under WASD. No enemies, weapons, or waves. |
| `shared/palette`, `shared/pool` | Implemented, tested |
| `shared/kaijuboot` layered content database | Implemented |
| `shared/spritesheet` | Tests only — they pin engine limitations. No implementation yet. |
| `shared/juice` | Empty, doc only |
| `tools/spritegen` | Plan only, no code |

`make test` passes, and the suite is clean under `-race`.

## What is generated, not committed

All reproducible by `make bootstrap`. None of it is in git:

- `third_party/kaiju/` — engine clone at the pin in `third_party/ENGINE_PIN`
- `third_party/stock_content/` — flattened engine stock content
- `scripts/env.sh` — toolchain paths and cgo flags
- `games/*/content/` — flattened game content database
- `games/*/bin/` — built binaries

Also outside the repo, and surviving reboots on `/ai` (ext4):
`/ai/toolchains/go` (Go 1.27.0) and `/ai/toolchains/x11deps/root` (rootless X11
and ALSA headers).

## Next step

### Where the work lives

Gameplay tasks 1–5, plus two follow-ups, are on branch
**`feat/noise-floor-gameplay`** — 11 commits off `dc1489d`, **not merged to
`main`**. Every task was independently reviewed, the whole branch passed a final
review, and the test suite is clean under `-race`.

| Commit | What |
| --- | --- |
| `81f4b1c` | `arena.Corruption` — CPU-authoritative shrinking boundary |
| `53ab871` | `actor.Player` — movement, safe-zone clamping |
| `9817524` | `actor.SampleMove` — WASD/arrow input sampling |
| `d44e174` | `boxstain` shader, shader + material descriptors |
| `4dfc732` | arena assembly — first playable |
| `23d5e48` | stain quad geometry fix (frustum coverage) |
| `de23fa1` | `debugcap` — GPU screenshot hook |
| `84bdd51` | `make fmt` fix, player marker, configurable capture frames |
| `af63444` | final review fixes (clamp, tests, palette tripwire) |

Iteration notes for the next demo: [DEMO-NOTES.md](DEMO-NOTES.md).

### Blocking prerequisite before Task 7

**The visual stain front and `SafeRadius()` are not calibrated to each other.**
Found by the whole-branch review; no per-task review could see it, because the
shader task and the arena task were each correct alone.

`safeRadiusMax = 6.5` clamps the player to roughly 45% of the visible width, so
on launch you can hold D and stop dead in unmarked cream paper with a third of
the screen still visibly playable. Separately, `boxstain.frag` thresholds its
noise field in the *quad's* UV space, and the stain quad is 48×22 — anisotropic
— so the stain front is a screen-space ellipse with no world-unit relationship
to the boundary the CPU owns at any corruption level. Spec §5.1 promises the
visual edge wobbles ±5% around that radius. It does not.

Fix direction: pass the shader `SafeRadius()/quadHalfExtent` rather than
`Level()`, and scale UV by the quad's aspect so `edge` is isotropic. Or, as a
floor, raise `safeRadiusMax` to ~8.0 so the clamp meets the vertical screen edge.

**Settle this before Task 7 (enemies).** Task 7 spawns enemies "outside the safe
zone", which at 6.5 is still well inside the visible field — enemies would pop
into view on clean paper, and spawn placement would have to be redone after any
framing change. Task 8 owns corruption pressure, but the framing must be right
first. Doing this also retires the known cosmetic defect where the shader leaves
faint unconsumed specks at corruption level 1.

Nobody has yet captured the stain at a corruption level above ~0.06, so its
appearance mid-transition is still unobserved. Capture it before changing it.

### Then

[`games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md`](../games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md)
tasks 6–14. **They are specified but not expanded to step level.** Expand a task
before executing it. The plan's task-summary list previously disagreed with its
own expanded entries; it has been corrected, and the expanded entries own the
requirements.

Same split in the art pipeline plan ([`tools/spritegen/PLAN.md`](../tools/spritegen/PLAN.md)):
tasks 1–2 ready, 3–6 need expanding.

### Seeing the game

External screen capture does not work here (see Risks). Use the built-in hook:

```sh
cd games/noise-floor
NOISEFLOOR_CAPTURE=/tmp/shot.png NOISEFLOOR_CAPTURE_FRAMES=360 ./bin/noise-floor
```

It writes a PNG of the last presented frame and exits on its own.

## Open decisions

1. ~~**Execution mode**~~ — resolved: subagent-driven. Fresh implementer per
   task on sonnet/haiku, an independent task review after each, this session as
   QC. The run's working ledger was scratch and has been deleted; its conclusions
   live in [DEMO-NOTES.md](DEMO-NOTES.md) and in this file.
2. **`spike-kaiju/` is still on disk** — ~130 MB of throwaway feasibility spike
   (engine clone, binary, video capture). Gitignored and safe to delete; kept
   only because deleting it was never explicitly approved.
3. **Horde value treatment** — how noise entities stay readable once the ground
   inverts from cream to ink. The spec calls this the first implementation task
   and it gates all horde art generation. Unresolved.

## Risks worth knowing

**There is no git remote.** The repo is local-only on `/dev/nvme1n1p1`. A reboot
is fine — the disk is persistent — but a disk failure loses everything including
the design spec and both plans. Pushing to a remote is a one-time cost worth
paying before real implementation starts.

**Visual output cannot be captured from outside the process.** This is a Wayland
session (`XDG_SESSION_TYPE=wayland`) and the only capture tools installed,
`import` and `ffmpeg`, are X11-only — `x11grab` returns a blank Xwayland root,
not the game surface. `grim` / `wf-recorder` / `spectacle` are not available.
The working path is the engine's own GPU-side `rendering.GPUDevice.Screenshot()`
/ `ScreenshotRGBA()`, which is what the debug capture hook and plan Task 11 use.

**ComfyUI is not running** and is never started by tooling. Launch it by hand
when the art pipeline is needed:

```sh
/ai/scripts/minimax-h3/h3.sh        # binds 127.0.0.1:8188, HIP_VISIBLE_DEVICES=1
```

**The engine's sprite-sheet path is broken** at the pinned commit, which is why
`shared/spritesheet` exists at all. `shared/spritesheet/engine_limits_test.go`
pins the broken behaviour and fails loudly if the engine is ever fixed — that
failure is good news, not a regression. See [KAIJU-NOTES.md](KAIJU-NOTES.md).
