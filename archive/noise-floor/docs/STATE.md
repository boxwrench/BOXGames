# Where things stand

Last updated: 2026-08-30 (after the wave director; four branches merged, pushed to origin). Update this when the state below stops being true.

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
| NOISE FLOOR binary | A game. Eight waves with rising composition and corruption pressure, clear detection, a lull where the page washes back as the reward, and Overfit splits. Peak field 3→15 live across waves; ~5 waves cleared in 90s with one weapon. No juice or XP yet. |
| `shared/palette`, `shared/pool` | Implemented, tested |
| `shared/kaijuboot` layered content database | Implemented |
| `shared/spritesheet` | Implemented: sheet schema, atlas loader, UV conversion, per-entity animator. Replaces the engine's broken sprite path. |
| `shared/juice` | Empty, doc only |
| `tools/spritegen` | Plan, plus `placeholder.py` generating white silhouette atlases with 1px outlines. No ComfyUI pipeline yet. |

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

### No blocking prerequisites

The `Arena` state split is done — `hordeView` and `projectileView` own their own
presentation state and `Arena.Update` is pure orchestration. Both earlier
prerequisites (pool the animator before death; split state before the director)
are closed.

### Carry into the juice task

- **Extract `onEnemyDeath(handle)`.** The death path in `combat.go` already reads
  the enemy before despawning, so archetype and position are in hand for XP and
  shard bursts — but the Overfit branch is inline there and will accrete.
- **A hit-flash timer belongs on `enemyView`.** `hordeView.Sync` sets tint
  unconditionally from `actorColor`, so a flash must be *composed* there rather
  than written to the sprite from outside, or `Sync` will overwrite it.
- **`fakeSpriteBank` has no-op methods that record nothing.** `Release` and
  `SyncOne` both no-op in the fake while the real `SpriteSet` acts, so tests
  through it can pass against production code that is wrong. This has already
  produced one test that proved nothing. Make the fake record its calls.
- **A `playerView` earns its keep once the player has hit flash or i-frames** —
  until then it would wrap two fields and four lines.

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
3. ~~**Horde value treatment**~~ — **fully resolved**, closing spec §10 open risk 1.
   Actors crossfade ink↔paper based on the ground they stand on, *and* carry a
   1px mid-grey outline. The two are complementary: the crossfade handles broad
   value match, the outline guarantees a hard edge at the crossover where an
   actor's value would otherwise equal the ground's. Mid-grey works because the
   shader multiplies — a mid-grey texel always renders at half the body's
   luminance, whichever way the actor is tinted.

## Risks worth knowing

~~**There is no git remote.**~~ Resolved 2026-08-30: `origin` is
https://github.com/boxwrench/BOXGames.git and `main` tracks it. Push after
merging a branch; the working tree carries no generated content, engine clone,
binaries or `env.sh`, so a push is authored source only.

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
