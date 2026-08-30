# Where things stand

Last updated: 2026-08-29 (after gameplay tasks 1–7, both branches merged to main). Update this when the state below stops being true.

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
| NOISE FLOOR binary | Playable. Cream page, a corruption boundary that eats inward and matches the gameplay boundary exactly, BX-77 under WASD, and five enemy archetypes spawning out of the ink and walking in. No weapons, damage, death, or waves yet. |
| `shared/palette`, `shared/pool` | Implemented, tested |
| `shared/kaijuboot` layered content database | Implemented |
| `shared/spritesheet` | Implemented: sheet schema, atlas loader, UV conversion, per-entity animator. Replaces the engine's broken sprite path. |
| `shared/juice` | Empty, doc only |
| `tools/spritegen` | Plan, plus `placeholder.py` generating the white silhouette atlases. No ComfyUI pipeline yet. |

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

All of it is on `main`. Two branches were merged: `feat/noise-floor-gameplay`
(plan tasks 1–5, the first playable) and `feat/boundary-calibration`
(boundary calibration, sprites, enemies).

Iteration notes for the next demo: [DEMO-NOTES.md](DEMO-NOTES.md).

### Two blocking prerequisites, each attached to the task it blocks

These came out of whole-branch reviews and must not be lost — each is cheap
now and expensive later.

**Before Task 8 (wave director): move enemy simulation into `internal/horde`.**
Right now `internal/horde` owns only a pool wrapper, and *all* enemy simulation
— steering dispatch, integration, safe-zone clamping — lives inside
`arena.updateHorde`'s closure in `internal/arena/enemies.go`. Task 8's director
and Task 10's damage and death have nowhere to go but that same closure. The
decoupling seam already exists and is unused: `actor.SafeZone`. Moving
`enemyVelocity`, the integration step and `clampArmed` into a
`horde.Step(dt, target, zone)` leaves `enemies.go` as pure view-sync and gives
both later tasks an obvious home. `aberrantStandoff` is archetype design data
currently sitting in the render-wiring file for want of that seam; it moves too.

**Before Task 10 (damage and death): pool the animator.** `spawnEnemy`
allocates a fresh `spritesheet.Animator` per spawn. That is bounded and harmless
today because nothing despawns, but spec §5.2 names allocation churn and GC
pauses during a wave as the measured risk, and death is what starts enemies
cycling. `despawnEnemy` already exists and owns the unwind — pool the animator
in the same change that first calls it.

### Then

[`games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md`](../games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md)
tasks 8–14. **Specified but not expanded to step level** — expand before
executing. Tasks 6 and 7 were expanded by hand during execution because the
plan referenced a clip schema and a UV flip formula that did not exist, and
gave the five enemy archetypes no numbers at all; expect the same of the rest.

Same split in the art pipeline plan ([`tools/spritegen/PLAN.md`](../tools/spritegen/PLAN.md)):
tasks 1–2 ready, 3–6 need expanding.

### A binding constraint on all future sprite art

**Atlases must be authored white or greyscale, never pre-coloured.** The sprite
shader multiplies texture by tint, so a pre-coloured atlas can only ever darken
— an ink-coloured sprite tinted toward paper stays ink. This is what the actor
value treatment depends on, and it was found the hard way: enemies standing in
the ink measured luminance 21.4 against ink at 22.6, invisible. With white
atlases the same measurement is 711 against 72.

This is the standard technique, not a workaround — see DEMO-NOTES.md for
sources. It binds `tools/spritegen` and everything ComfyUI ever generates for
this game. A related trick worth knowing: up to 3–4 independently recolourable
regions can be packed into one greyscale texture's R/G/B/A channels, which is
how BX-77 gets separate brass and visor accents without extra atlases.

### Seeing the game

External screen capture does not work here (see Risks). Use the built-in hook:

```sh
cd games/noise-floor
NOISEFLOOR_CAPTURE=/tmp/shot.png NOISEFLOOR_CAPTURE_FRAMES=45000 ./bin/noise-floor
```

It writes a PNG of the last presented frame and exits. Frame counts are large
because the game renders uncapped at roughly 9000fps; corruption reaches full
ink in about 8.3 seconds of real time, so aim by wall-clock, not frames.

## Open decisions

1. ~~**Execution mode**~~ — resolved: subagent-driven. Fresh implementer per
   task on sonnet/haiku, an independent task review after each, this session as
   QC. The run's working ledger was scratch and has been deleted; its conclusions
   live in [DEMO-NOTES.md](DEMO-NOTES.md) and in this file.
2. **`spike-kaiju/` is still on disk** — ~130 MB of throwaway feasibility spike
   (engine clone, binary, video capture). Gitignored and safe to delete; kept
   only because deleting it was never explicitly approved.
3. ~~**Horde value treatment**~~ — resolved: actors crossfade ink↔paper based on
   the ground they stand on, so they invert as the page does. Implemented for
   both the player and the horde; closes spec §10 open risk 1.
   **One open follow-up:** a pure value crossfade has a crossover point where an
   actor on the boundary matches the ground. The standard fix is a 1px
   opposite-value outline, which is complementary rather than an alternative —
   the crossfade handles broad value match, the outline guarantees a hard edge.
   Cheap to add in `tools/spritegen/placeholder.py`. Not yet decided.

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
