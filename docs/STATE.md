# Where things stand

Last updated: 2026-08-29. Update this when the state below stops being true.

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
| NOISE FLOOR binary | Boots, clears to paper, sets the fixed camera. **No gameplay yet.** |
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

Execute the gameplay plan, tasks 1–5:
[`games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md`](../games/noise-floor/docs/plans/2026-08-29-noise-floor-gameplay.md)

That sequence ends with a running game: cream field, corruption eating inward
from the edges, WASD movement clamped to the shrinking safe zone.

**Tasks 1–5 are execution-ready** — real tests, real code, real commands.
**Tasks 6–14 are specified but not expanded to step level** (files, interfaces,
and test strategy only). Expand a task before executing it.

Same split in the art pipeline plan ([`tools/spritegen/PLAN.md`](../tools/spritegen/PLAN.md)):
tasks 1–2 ready, 3–6 need expanding.

## Open decisions

1. **Execution mode** — subagent-driven (fresh subagent per task, review between)
   or inline (batch with checkpoints). Not yet chosen.
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

**ComfyUI is not running** and is never started by tooling. Launch it by hand
when the art pipeline is needed:

```sh
/ai/scripts/minimax-h3/h3.sh        # binds 127.0.0.1:8188, HIP_VISIBLE_DEVICES=1
```

**The engine's sprite-sheet path is broken** at the pinned commit, which is why
`shared/spritesheet` exists at all. `shared/spritesheet/engine_limits_test.go`
pins the broken behaviour and fails loudly if the engine is ever fixed — that
failure is good news, not a regression. See [KAIJU-NOTES.md](KAIJU-NOTES.md).
