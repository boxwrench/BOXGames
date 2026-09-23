# BOXGames

A monorepo of game demos built on the [Kaiju Engine](https://github.com/KaijuEngine/kaiju)
(Go + Vulkan), starring BX-77 "Boxwrench" and the world from
[boxwrench.dev](https://www.boxwrench.dev/).

## Quickstart

```sh
make bootstrap              # toolchain, pinned engine, stock content
make run GAME=noise-floor   # build and play
```

`make bootstrap` is safe to re-run and installs nothing system-wide — it puts a
private Go toolchain and the engine's C dependencies under `/ai/toolchains`,
and needs no root. See [docs/SETUP.md](docs/SETUP.md) if it fails.

## Games

| Game | Description | Status |
| --- | --- | --- |
| [noise-floor](games/noise-floor/) | Survivors-like. BX-77 holds a Citadel deck while entropy eats the page out from under him. | Scaffold |
| [pj-dirt-jumper](pj-dirt-jumper/) | Web (Vite + three.js). Endless arcade dirt-jump/pump-track with PJ, a sendy teen angler. | Milestone 1 |

## Layout

```
shared/         Go packages every demo can use (palette, pooling, juice, bootstrap)
games/<game>/   One demo. Self-contained: its own module, assets, docs, spec.
tools/          Offline asset generation (ComfyUI drivers). Never runtime.
third_party/    Pinned engine checkout + synced stock content. Generated, gitignored.
scripts/        Bootstrap and build. The Makefile delegates to these.
docs/           Cross-cutting docs. Game-specific docs live under the game.
```

**The rule:** if a second demo would want it, it goes in `shared/` or `docs/`.
If only one demo will ever want it, it goes under `games/<game>/`.

## Common commands

| Command | Does |
| --- | --- |
| `make bootstrap` | Install toolchain, fetch pinned engine, sync stock content |
| `make build GAME=x` | Build a game (rebuilds its content database first) |
| `make run GAME=x` | Build and run |
| `make test` | All Go tests across the workspace |
| `make vet` / `make fmt` | Vet / format everything |
| `make content GAME=x` | Rebuild one game's content database |
| `make sync-content` | Re-sync engine stock content |
| `make clean` | Remove build output and generated content |

Run `make` with no target for the full list.

## Adding a demo

See [docs/NEW-GAME.md](docs/NEW-GAME.md).

## Documentation

- **[docs/STATE.md](docs/STATE.md) — where things stand and what to do next. Start here.**
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layout, module strategy, and why
- [docs/SETUP.md](docs/SETUP.md) — toolchain details and troubleshooting
- [docs/KAIJU-NOTES.md](docs/KAIJU-NOTES.md) — engine gotchas that cost real time
- [docs/ART-PIPELINE.md](docs/ART-PIPELINE.md) — local sprite generation
