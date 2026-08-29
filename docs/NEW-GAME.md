# Adding a demo

Replace `<game>` with a kebab-case directory name; the Go module uses the
squashed form (`noise-floor` → `noisefloor`).

## 1. Structure

```sh
mkdir -p games/<game>/{cmd/<game>,internal,docs/specs}
mkdir -p games/<game>/assets/{shaders/src,materials,textures,sheets}
```

## 2. Module

`games/<game>/go.mod`:

```
module boxwrench.dev/boxgames/games/<game>

go 1.26.0

require (
	boxwrench.dev/boxgames/shared v0.0.0
	kaijuengine.com v0.0.0
)

replace (
	boxwrench.dev/boxgames/shared => ../../shared
	kaijuengine.com => ../../third_party/kaiju/src
)
```

Add it to `go.work`:

```
use (
	./shared
	./games/noise-floor
	./games/<game>
)
```

## 3. Entry point

Copy `games/noise-floor/cmd/noisefloor/main.go`. It implements
`bootstrap.GameInterface` — `Launch`, `PluginRegistry`, `ContentDatabase` —
and uses `kaijuboot.NewGameDatabase` to layer game content over stock.

The engine registers no updates of its own: every system adds its own update
in `Launch`.

## 4. Design first

Write a spec to `games/<game>/docs/specs/YYYY-MM-DD-<topic>-design.md` before
implementing. See `games/noise-floor/docs/specs/` for the shape.

## 5. Build

```sh
make run GAME=<game>
```

## Conventions

- Colors come from `shared/palette`, never literals.
- Anything spawned in quantity comes from `shared/pool`.
- Never edit `third_party/kaiju/` — it is re-cloned when the pin moves.
- Read [KAIJU-NOTES.md](KAIJU-NOTES.md) before writing shaders or content.
