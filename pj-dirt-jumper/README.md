# PJ's Dirt Jumper

Endless side-on arcade dirt jumping. PJ — a sendy teen who'd rather be fishing — pumps, pops and flips down a seeded trail. Stunts give speed; speed gives bigger stunts.

**Status:** Milestone 3 — attitude: scoring, fishing-named combos, Flow meter, slang callouts, particles, slow-mo, yard-sale crashes, golden-hour art and a synth punk soundtrack. Design: [docs/specs](docs/specs/2026-09-22-pj-dirt-jumper-design.md).

## Run

```sh
npm install
npm run dev      # http://127.0.0.1:5200/
npm test         # physics, generator + fairness (200 seeds x 3 km) tests
npm run smoke    # headless screenshots (dev server must be running)
npm run build
```

## Controls

| | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Pump (hold on downslopes) | Space / ↓ / S | hold left half | A |
| Pop (release on the lip) | release | lift thumb | release A |
| Backflip / frontflip | ← / → (A / D) | drag the held thumb left / right in the air | left stick |
| Superman / Tailwhip / No-Hander | J / K / L | 🐟 🎣 🐠 buttons | X / Y / B |
| Restart | R / Enter | button | — |

Land with the bike lined up with the slope; let go of grabs before touchdown. **M** mutes. `?autopilot` lets the reference bot ride (`?autopilot=tricks` adds grabs).

## Scoring

Distance plus air points: trick base (flip 500 / double 1,200 / triple 2,000, grabs 60 per 0.1 s, perfect pop +150) × number of different tricks × Flow (1 + 0.5 per level) × landing (Perfect 1.5, Buttery 1.2). Sketchy landings bank half. Perfect/Buttery landings fill Flow; at 5 you're ON FIRE. Named combos: Bluegill Backflip, Largemouth Tailwhip, The Double Hookset, Lunker Loop, Full Tackle Box, Catch-and-Release.

`?seed=123` rides a specific trail; the default is today's Daily Line.
