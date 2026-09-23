# PJ's Dirt Jumper

Endless side-on arcade dirt jumping. PJ — a sendy teen who'd rather be fishing — pumps, pops and flips down a seeded trail. Stunts give speed; speed gives bigger stunts.

**Status:** Milestone 1 — pump track feel. Design: [docs/specs](docs/specs/2026-09-22-pj-dirt-jumper-design.md).

## Run

```sh
npm install
npm run dev      # http://127.0.0.1:5200/
npm test         # physics + generator unit tests
npm run smoke    # headless screenshots (dev server must be running)
npm run build
```

## Controls (M1)

- Hold **Space / ↓ / S**, or hold the left half of the screen, to pump. Pump on the downslopes, let go on the ups.
- **R / Enter** or the button restarts after a stall.

`?seed=123` rides a specific trail; the default is today's Daily Line.
