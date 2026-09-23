# PJ's Dirt Jumper

Endless side-on arcade dirt jumping. PJ — a sendy teen who'd rather be fishing — pumps, pops and flips down a seeded trail. Stunts give speed; speed gives bigger stunts.

**Status:** Milestone 2 — air: pops, flips, grabs, graded landings and bails on bot-designed jumps. Design: [docs/specs](docs/specs/2026-09-22-pj-dirt-jumper-design.md).

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

Land with the bike lined up with the slope; let go of grabs before touchdown. `?autopilot=1` lets the reference bot ride.

`?seed=123` rides a specific trail; the default is today's Daily Line.
