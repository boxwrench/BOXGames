# NOISE FLOOR

BX-77 holds a Citadel deck while entropy eats the page out from under him.

A survivors-like in the Brotato shape: fixed single-screen arena, discrete
waves, weapons on independent auto-fire timers, a RECALIBRATION shop between
waves.

**The hook:** the corruption stain *is* the arena boundary. The cream paper
field is the play area and ink is death, and corruption creeps inward as a wave
runs — so the safe zone shrinks and pushes you into the horde. Difficulty
curve, art direction, and spatial pressure are one object.

## Run

```sh
make run GAME=noise-floor      # from the repo root
```

## Status

**Scaffold.** Boots, clears to paper, sets the fixed camera. No systems wired.

## Layout

| Path | What |
| --- | --- |
| `cmd/noisefloor/` | Entry point, `bootstrap.GameInterface` |
| `internal/arena/` | Fixed camera, bounds, corruption model |
| `internal/actor/` | Player and enemy behaviours |
| `internal/weapon/` | Fire timers, projectile pools |
| `internal/horde/` | Spawner, wave director |
| `internal/vfx/` | Shard bursts, corruption splashes, visor sweep |
| `internal/progression/` | XP, Directive cards, shop |
| `internal/render/` | Corruption stain shader, materials, draw order |
| `assets/` | Authored assets (committed) |
| `content/` | Generated flat database (gitignored) |

## Design

[docs/specs/2026-08-29-noise-floor-design.md](docs/specs/2026-08-29-noise-floor-design.md)
