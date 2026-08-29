# Where things stand

Last updated: 2026-08-29 (after gameplay tasks 1–5). Update this when the state below stops being true.

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
| NOISE FLOOR binary | First playable. Paper field, corruption stain eating inward, WASD movement clamped to the shrinking safe zone. |
| `shared/palette`, `shared/pool` | Implemented, tested |
| `shared/kaijuboot` layered content database | Implemented |
| `shared/spritesheet` | Tests only — they pin engine limitations. No implementation yet. |
| `shared/juice` | Empty, doc only |
| `tools/spritegen` | Plan only, no code |

`make test` passes.

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

Gameplay tasks 1–5 are on branch **`feat/noise-floor-gameplay`**, not `main`.
Six commits off `dc1489d`:

| Commit | What |
| --- | --- |
| `81f4b1c` | `arena.Corruption` — CPU-authoritative shrinking boundary |
| `53ab871` | `actor.Player` — movement, safe-zone clamping |
| `9817524` | `actor.SampleMove` — WASD/arrow input sampling |
| `d44e174` | `boxstain` shader, shader + material descriptors |
| `4dfc732` | arena assembly — first playable |
| `23d5e48` | stain quad geometry fix (frustum coverage) |

The authoritative record of the run — every dispatch, every review verdict,
every deferred minor, and every ruling made on your behalf — is the SDD ledger:
`.superpowers/sdd/2026-08-29-noise-floor-gameplay/progress.md`. It is
git-ignored scratch, so `git clean -fdx` destroys it; the commits above survive
regardless. Task briefs, implementer reports, and review diffs sit beside it.

### Immediately next, in order

1. **Task 5b is in flight** — a debug screenshot hook
   (`games/noise-floor/internal/debugcap`) using the engine's
   `rendering.GPUDevice.ScreenshotRGBA()`. Pulled forward from plan Task 11 by
   ruling, because nothing else on this box can see what the game renders. Brief
   is at `task-5b-brief.md` in the ledger directory; if the dispatch was lost,
   re-dispatch from that brief. Check `git log` first — it may have landed.
2. **Final whole-branch review has NOT run.** It is the last gate before the
   branch is finishable, and it should triage the deferred minors the per-task
   reviews parked (they are listed inline in the ledger, tagged
   `minor (deferred)`). Use `scripts/review-package <plan> dc1489d HEAD` and the
   `superpowers:requesting-code-review` reviewer prompt, on the most capable
   model.
3. **Then finish the branch** — `superpowers:finishing-a-development-branch`.
   Nothing has been merged to `main` and nothing has been pushed anywhere.

### After that

[`games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md`](../games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md)
tasks 6–14. **They are specified but not expanded to step level** (files,
interfaces, and test strategy only). Expand a task before executing it. Note
that plan Task 11's screenshot slice is partly consumed by 5b above.

Same split in the art pipeline plan ([`tools/spritegen/PLAN.md`](../tools/spritegen/PLAN.md)):
tasks 1–2 ready, 3–6 need expanding.

### Demo notes worth carrying forward

- The plan's framing numbers were wrong and a review caught it. Perspective
  camera, 60° **vertical** FOV: at distance *d* the visible height is
  `2*d*tan(30°)` and width is that times the aspect ratio. Any future
  full-screen backdrop must be sized from that, at its own depth, not eyeballed.
- Per-task review earned its cost twice: once for the geometry bug above, once
  for catching a factually wrong claim in an implementer's own report.
- Cheap models handled transcription-shaped tasks and single-constant fixes
  without trouble. Judgment-shaped work (arena assembly, the capture hook)
  needed a mid-tier model.

## Open decisions

1. ~~**Execution mode**~~ — resolved: subagent-driven. Fresh implementer per
   task on sonnet/haiku, an independent task review after each, this session as
   QC. Ledger at `.superpowers/sdd/2026-08-29-noise-floor-gameplay/progress.md`.
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
