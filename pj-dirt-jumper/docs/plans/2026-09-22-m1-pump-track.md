# PJ's Dirt Jumper — Milestone 1: Pump Track Feel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable browser build where PJ rides an endless, seeded backyard pump track and all speed comes from pumping the downslopes.

**Architecture:** Pure TypeScript modules (`track/`, `sim/`) hold the trail geometry and the rider physics and are unit-tested with `node --test`. A thin three.js layer (`render/`) draws them, `input/` maps keyboard and touch to one `Actions` shape, and `game.ts` runs a fixed 120 Hz simulation with interpolated rendering. In M1 the rider stays glued to the trail (airtime arrives in M2).

**Tech Stack:** Vite 7, TypeScript 5.9 (strict), three.js 0.180, tsx + `node:test`, playwright-core (smoke screenshots with the locally cached Chromium).

**Spec:** `pj-dirt-jumper/docs/specs/2026-09-22-pj-dirt-jumper-design.md`

## Global Constraints

- Game lives at `/ai/github/BOXGames/pj-dirt-jumper/`; work on branch `feat/pj-dirt-jumper`.
- No physics engine, no runtime asset downloads: all art procedural, all audio synthesised.
- `track/`, `sim/`, `score/`, `progress/`, `lines.ts` must not import three.js or touch the DOM.
- All gameplay constants live in `src/tuning.ts`.
- Seeded randomness uses mulberry32; Daily Line seed = UTC date `YYYYMMDD`; URL `?seed=N` overrides.
- Tone: teen, sendy, goofy; no swearing.
- Must work with keyboard and touch (touch targets ≥ 64 CSS px, multitouch-safe).
- Dev server port **5200** (Frontier Block uses 5199). Chrome on this workstation has no WebGL: manual checks use Firefox; automated checks use headless Chromium with SwiftShader.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map (M1)

```
pj-dirt-jumper/
  package.json, tsconfig.json, vite.config.ts, index.html, .gitignore, README.md
  scripts/smoke.mjs            headless Chromium run + screenshots
  src/
    main.ts                    boot, seed from URL/date, WebGL fallback
    game.ts                    fixed-step loop wiring everything
    styles.css                 HUD, pump pad, end card
    tuning.ts                  gameplay constants
    rng.ts (+ rng.test.ts)     mulberry32
    track/track.ts (+ test)    Track: Hermite height curve, sections
    track/generate.ts (+ test) TrackGen: seeded endless backyard trail
    sim/rider.ts (+ test)      Rider state, Actions, step()
    input/input.ts             keyboard + touch pad → Actions
    render/stage.ts            renderer, scene, sky, lights, fog
    render/trackView.ts        streamed track chunks
    render/backdrop.ts         parallax ridges, field, sun
    render/riderView.ts        bike + PJ rig with pump crouch
    render/cameraRig.ts        side-on follow camera, speed FOV
    ui/hud.ts                  speed/distance, pump pad, stall warning, end card
```

---

### Task 1: Project scaffold, RNG and tuning

**Files:**
- Create: `pj-dirt-jumper/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `pj-dirt-jumper/src/rng.ts`, `src/tuning.ts`
- Test: `pj-dirt-jumper/src/rng.test.ts`

**Interfaces:**
- Produces: `mulberry32(seed: number): () => number` (values in [0, 1)); `T` constant object (see Step 5) imported as `import { T } from "../tuning"`.

- [ ] **Step 1: Create package and config files**

`pj-dirt-jumper/package.json`:
```json
{
  "name": "pj-dirt-jumper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 5200 --strictPort",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1 --port 5200",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "smoke": "node scripts/smoke.mjs"
  },
  "dependencies": {
    "three": "^0.180.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/three": "^0.180.0",
    "playwright-core": "^1.58.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vite": "^7.1.0"
  }
}
```

`pj-dirt-jumper/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src"]
}
```

`pj-dirt-jumper/vite.config.ts`:
```ts
import { defineConfig } from "vite";
// Relative base so the build also works from a subfolder (e.g. GitHub Pages).
export default defineConfig({ base: "./" });
```

`pj-dirt-jumper/.gitignore`:
```
node_modules/
dist/
smoke-out/
```

`pj-dirt-jumper/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no" />
    <meta name="theme-color" content="#241a4f" />
    <meta name="description" content="PJ's Dirt Jumper — pump it, pop it, send it." />
    <title>PJ's Dirt Jumper</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Install dependencies**

Run: `cd /ai/github/BOXGames/pj-dirt-jumper && npm install`
Expected: completes; `node_modules/three` exists.

- [ ] **Step 3: Write the failing RNG test**

`src/rng.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "./rng";
test("same seed gives the same sequence; values stay in [0, 1)", () => {
  const a = mulberry32(20260922),
    b = mulberry32(20260922),
    seq = Array.from({ length: 200 }, () => a());
  assert.deepEqual(seq, Array.from({ length: 200 }, () => b()));
  assert.ok(seq.every((n) => n >= 0 && n < 1));
});
test("different seeds diverge", () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./rng`.

- [ ] **Step 5: Implement `rng.ts` and `tuning.ts`**

`src/rng.ts`:
```ts
export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`src/tuning.ts`:
```ts
// Every gameplay number lives here so feel can be tuned in one place (spec §5).
export const T = {
  simHz: 120,
  gravity: 20, // m/s², arcade-heavy
  rollingResistance: 0.6, // m/s²
  drag: 0.004, // × v²
  pumpGain: 9, // m/s² at a 90° slope
  curvatureFactor: 1, // reserved: scales pump by surface curvature in later milestones
  maxSpeed: 22, // m/s before Flow bonuses
  startSpeed: 8, // m/s
  stallSpeed: 2, // m/s
  stallSeconds: 3,
  preloadSeconds: 0.35,
} as const;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
cd /ai/github/BOXGames
git add pj-dirt-jumper/package.json pj-dirt-jumper/package-lock.json pj-dirt-jumper/tsconfig.json pj-dirt-jumper/vite.config.ts pj-dirt-jumper/index.html pj-dirt-jumper/.gitignore pj-dirt-jumper/src/rng.ts pj-dirt-jumper/src/rng.test.ts pj-dirt-jumper/src/tuning.ts
git commit -m "Scaffold PJ's Dirt Jumper with seeded RNG and tuning table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Track height curve

**Files:**
- Create: `pj-dirt-jumper/src/track/track.ts`
- Test: `pj-dirt-jumper/src/track/track.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Knot { x: number; y: number; m: number } // m = dy/dx at the knot
  export type SectionKind = "runin" | "rollers" | "tabletop";
  export interface Section { kind: SectionKind; x0: number; x1: number }
  export class Track {
    readonly knots: Knot[]; readonly sections: Section[];
    get end(): number;               // x of last knot (0 when empty)
    add(k: Knot): void;              // throws if k.x <= end
    heightAt(x: number): number;     // cubic Hermite; flat outside [first, end]
    slopeAt(x: number): number;      // dy/dx; 0 outside the range
    angleAt(x: number): number;      // Math.atan(slopeAt(x)), radians
  }
  ```

- [ ] **Step 1: Write the failing tests**

`src/track/track.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Track } from "./track";
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
function sample() {
  const t = new Track();
  t.add({ x: 0, y: 0, m: 0 });
  t.add({ x: 4, y: 2, m: 0.5 });
  t.add({ x: 10, y: -1, m: 0 });
  return t;
}
test("passes through every knot with the knot's slope", () => {
  const t = sample();
  for (const k of t.knots) close(t.heightAt(k.x), k.y);
  for (const k of t.knots.slice(0, -1)) close(t.slopeAt(k.x), k.m);
});
test("slope matches the curve's finite difference (C¹ smooth)", () => {
  const t = sample(),
    e = 1e-5;
  for (let x = 0.1; x < 9.9; x += 0.7) close(t.slopeAt(x), (t.heightAt(x + e) - t.heightAt(x - e)) / (2 * e), 1e-5);
});
test("is flat outside its range", () => {
  const t = sample();
  close(t.heightAt(-5), 0);
  close(t.heightAt(50), -1);
  close(t.slopeAt(-5), 0);
  close(t.slopeAt(50), 0);
});
test("angleAt is the arctangent of the slope", () => {
  const t = sample();
  close(t.angleAt(2.5), Math.atan(t.slopeAt(2.5)));
});
test("rejects knots that don't move forward", () => {
  const t = sample();
  assert.throws(() => t.add({ x: 10, y: 0, m: 0 }));
  assert.equal(t.end, 10);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `./track`.

- [ ] **Step 3: Implement `track.ts`**

`src/track/track.ts`:
```ts
export interface Knot {
  x: number;
  y: number;
  /** Slope dy/dx at the knot. */
  m: number;
}
export type SectionKind = "runin" | "rollers" | "tabletop";
export interface Section {
  kind: SectionKind;
  x0: number;
  x1: number;
}
/** The trail's height line: knots joined by cubic Hermite segments, so height and slope are continuous. */
export class Track {
  readonly knots: Knot[] = [];
  readonly sections: Section[] = [];
  get end() {
    return this.knots.at(-1)?.x ?? 0;
  }
  add(k: Knot) {
    if (this.knots.length && k.x <= this.end) throw new Error(`Knot at x=${k.x} must come after x=${this.end}`);
    this.knots.push(k);
  }
  /** Index i with knots[i].x <= x < knots[i+1].x; callers guarantee x is inside the range. */
  private segment(x: number) {
    let lo = 0,
      hi = this.knots.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.knots[mid].x <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  private outside(x: number) {
    return this.knots.length < 2 || x < this.knots[0].x || x >= this.end;
  }
  heightAt(x: number) {
    if (this.outside(x)) return x < (this.knots[0]?.x ?? 0) ? (this.knots[0]?.y ?? 0) : (this.knots.at(-1)?.y ?? 0);
    const i = this.segment(x),
      a = this.knots[i],
      b = this.knots[i + 1],
      h = b.x - a.x,
      t = (x - a.x) / h,
      t2 = t * t,
      t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * h * a.m + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * h * b.m;
  }
  slopeAt(x: number) {
    if (this.outside(x)) return 0;
    const i = this.segment(x),
      a = this.knots[i],
      b = this.knots[i + 1],
      h = b.x - a.x,
      t = (x - a.x) / h,
      t2 = t * t;
    return ((6 * t2 - 6 * t) * a.y + (3 * t2 - 4 * t + 1) * h * a.m + (-6 * t2 + 6 * t) * b.y + (3 * t2 - 2 * t) * h * b.m) / h;
  }
  angleAt(x: number) {
    return Math.atan(this.slopeAt(x));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add pj-dirt-jumper/src/track
git commit -m "Add smooth Hermite track curve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Seeded backyard trail generator

**Files:**
- Create: `pj-dirt-jumper/src/track/generate.ts`
- Test: `pj-dirt-jumper/src/track/generate.test.ts`

**Interfaces:**
- Consumes: `Track`, `SectionKind` from `./track`; `mulberry32` from `../rng`.
- Produces: `class TrackGen { readonly track: Track; constructor(seed: number); ensure(x: number): void }` — `ensure` appends sections until `track.end >= x`. The first section is always a `"runin"` from (0, 6) down to (32, 0).

- [ ] **Step 1: Write the failing tests**

`src/track/generate.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackGen } from "./generate";
test("same seed builds the same trail", () => {
  const a = new TrackGen(42),
    b = new TrackGen(42);
  a.ensure(1000);
  b.ensure(1000);
  assert.deepEqual(a.track.knots, b.track.knots);
});
test("different seeds build different trails", () => {
  const a = new TrackGen(1),
    b = new TrackGen(2);
  a.ensure(500);
  b.ensure(500);
  assert.notDeepEqual(a.track.knots.slice(0, 40), b.track.knots.slice(0, 40));
});
test("ensure extends the trail past the requested distance", () => {
  const g = new TrackGen(1);
  g.ensure(750);
  assert.ok(g.track.end >= 750);
});
test("knots move forward and stay at backyard heights", () => {
  const g = new TrackGen(9);
  g.ensure(3000);
  const k = g.track.knots;
  for (let i = 1; i < k.length; i++) assert.ok(k[i].x > k[i - 1].x);
  assert.ok(k.every((p) => p.y >= -0.5 && p.y <= 8));
});
test("every run starts on a downhill run-in", () => {
  const g = new TrackGen(7);
  assert.equal(g.track.sections[0].kind, "runin");
  assert.ok(g.track.slopeAt(6) < -0.1);
});
test("sections tile the trail with no gaps", () => {
  const g = new TrackGen(3);
  g.ensure(1200);
  const s = g.track.sections;
  assert.equal(s[0].x0, 0);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].x0, s[i - 1].x1);
  assert.equal(s.at(-1)!.x1, g.track.end);
});
test("the backyard mixes rollers and tabletops", () => {
  const g = new TrackGen(11);
  g.ensure(1000);
  const kinds = new Set(g.track.sections.map((s) => s.kind));
  assert.ok(kinds.has("rollers") && kinds.has("tabletop"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `./generate`.

- [ ] **Step 3: Implement `generate.ts`**

`src/track/generate.ts`:
```ts
import { mulberry32 } from "../rng";
import { Track, type SectionKind } from "./track";
/** Knot relative to its section's start: [dx, y, slope]. */
type Point = [number, number, number];
/** Builds the endless trail one seeded section at a time. M1 is the Backyard tier only. */
export class TrackGen {
  readonly track = new Track();
  private readonly rand: () => number;
  constructor(seed: number) {
    this.rand = mulberry32(seed);
    this.track.add({ x: 0, y: 6, m: 0 });
    this.section("runin", [
      [12, 3, -0.45],
      [24, 0, 0],
      [32, 0, 0],
    ]);
  }
  ensure(x: number) {
    while (this.track.end < x) this.next();
  }
  private next() {
    if (this.rand() < 0.62) this.rollers();
    else this.tabletop();
  }
  private section(kind: SectionKind, points: Point[]) {
    const x0 = this.track.end;
    for (const [dx, y, m] of points) this.track.add({ x: x0 + dx, y, m });
    this.track.sections.push({ kind, x0, x1: this.track.end });
  }
  /** 2–6 rollers: crest and trough knots with zero slope give a smooth wave. */
  private rollers() {
    const n = 2 + Math.floor(this.rand() * 5),
      points: Point[] = [];
    let dx = 0;
    for (let i = 0; i < n; i++) {
      const length = 5 + this.rand() * 2,
        height = 0.8 + this.rand() * 0.7;
      points.push([dx + length / 2, height, 0], [dx + length, 0, 0]);
      dx += length;
    }
    points.push([dx + 3, 0, 0]);
    this.section("rollers", points);
  }
  /** Ramp up, flat table, ramp down to a short flat. */
  private tabletop() {
    const height = 1.6 + this.rand() * 0.8,
      top = 4 + this.rand() * 3;
    this.section("tabletop", [
      [1.5, 0.2, 0.3],
      [4.5, height, 0],
      [4.5 + top, height, 0],
      [9 + top, 0, 0],
      [12 + top, 0, 0],
    ]);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add pj-dirt-jumper/src/track/generate.ts pj-dirt-jumper/src/track/generate.test.ts
git commit -m "Generate a seeded endless backyard pump track

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rider physics (grounded, pumping, stall-out)

**Files:**
- Create: `pj-dirt-jumper/src/sim/rider.ts`
- Test: `pj-dirt-jumper/src/sim/rider.test.ts`

**Interfaces:**
- Consumes: `Track` (`slopeAt`), `TrackGen` (test only), `T` from `../tuning`.
- Produces:
  ```ts
  export interface Actions { pump: boolean; spin: number; grab: [boolean, boolean, boolean] } // spin ∈ [-1, 1]; spin/grab unused until M2
  export const NO_ACTIONS: Actions;
  export interface Rider { x: number; v: number; distance: number; pump: boolean; preload: number; stall: number; state: "riding" | "stalled" }
  export type SimEvent = { type: "stalled" };
  export function createRider(): Rider;               // x = 2, v = T.startSpeed
  export function step(r: Rider, a: Actions, track: Track, dt: number): SimEvent[]; // mutates r
  ```

- [ ] **Step 1: Write the failing tests**

`src/sim/rider.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRider, step, NO_ACTIONS, type Actions, type SimEvent } from "./rider";
import { Track } from "../track/track";
import { TrackGen } from "../track/generate";
import { T } from "../tuning";
const PUMP: Actions = { ...NO_ACTIONS, pump: true };
const dt = 1 / T.simHz;
/** A straight line with the given slope, long enough for any test. */
function line(slope: number) {
  const t = new Track();
  t.add({ x: -1000, y: -1000 * slope, m: slope });
  t.add({ x: 1000, y: 1000 * slope, m: slope });
  return t;
}
function ride(track: Track, a: Actions, seconds: number, v = 8) {
  const r = createRider(),
    events: SimEvent[] = [];
  r.x = 0;
  r.v = v;
  for (let i = 0; i < Math.round(seconds * T.simHz); i++) events.push(...step(r, a, track, dt));
  return { r, events };
}
test("pumping a downslope gains speed", () => {
  const down = line(-0.4);
  assert.ok(ride(down, PUMP, 1).r.v > ride(down, NO_ACTIONS, 1).r.v + 1);
});
test("pumping an upslope bleeds speed", () => {
  const up = line(0.4);
  assert.ok(ride(up, PUMP, 1, 12).r.v < ride(up, NO_ACTIONS, 1, 12).r.v - 1);
});
test("on the flat, pumping does nothing and friction slows you", () => {
  const flat = line(0);
  assert.equal(ride(flat, PUMP, 2).r.v, ride(flat, NO_ACTIONS, 2).r.v);
  assert.ok(ride(flat, NO_ACTIONS, 2).r.v < 7);
});
test("speed is capped at maxSpeed", () => {
  assert.equal(ride(line(-1), PUMP, 10).r.v, T.maxSpeed);
});
test("crawling under stallSpeed for stallSeconds ends the run once", () => {
  const { r, events } = ride(line(0), NO_ACTIONS, T.stallSeconds + 0.1, 1);
  assert.equal(r.state, "stalled");
  assert.deepEqual(events, [{ type: "stalled" }]);
  const x = r.x;
  assert.deepEqual(step(r, PUMP, line(0), dt), []);
  assert.equal(r.x, x);
});
test("preload charges while pumping and resets on release", () => {
  const flat = line(0),
    r = createRider();
  for (let i = 0; i < 0.2 * T.simHz; i++) step(r, PUMP, flat, dt);
  assert.ok(Math.abs(r.preload - 0.2 / T.preloadSeconds) < 0.02);
  for (let i = 0; i < 0.3 * T.simHz; i++) step(r, PUMP, flat, dt);
  assert.equal(r.preload, 1);
  step(r, NO_ACTIONS, flat, dt);
  assert.equal(r.preload, 0);
});
test("distance follows the slope while x advances horizontally", () => {
  const { r } = ride(line(-1), NO_ACTIONS, 1, 10);
  assert.ok(r.distance > r.x + 1);
});
test("a rider who pumps the backsides keeps rolling; a coaster stalls", () => {
  const g = new TrackGen(20260922);
  g.ensure(1500);
  const run = (pumper: boolean) => {
    const r = createRider();
    for (let i = 0; i < 180 * T.simHz && r.state === "riding" && r.x < 1200; i++)
      step(r, { ...NO_ACTIONS, pump: pumper && g.track.slopeAt(r.x) < 0 }, g.track, dt);
    return r;
  };
  const pumper = run(true),
    coaster = run(false);
  assert.equal(pumper.state, "riding");
  assert.ok(pumper.x >= 1200, `pumper only reached ${pumper.x.toFixed(0)} m`);
  assert.equal(coaster.state, "stalled");
  assert.ok(coaster.x < 400, `coaster rolled ${coaster.x.toFixed(0)} m`);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `./rider`.

- [ ] **Step 3: Implement `rider.ts`**

`src/sim/rider.ts`:
```ts
import type { Track } from "../track/track";
import { T } from "../tuning";
export interface Actions {
  pump: boolean;
  /** −1 back … +1 forward; used from M2. */
  spin: number;
  grab: [boolean, boolean, boolean];
}
export const NO_ACTIONS: Actions = { pump: false, spin: 0, grab: [false, false, false] };
export interface Rider {
  /** Horizontal position along the trail, metres. */
  x: number;
  /** Speed along the surface, m/s. */
  v: number;
  /** Distance travelled along the surface, metres. */
  distance: number;
  pump: boolean;
  /** 0…1, how compressed PJ is for a pop. */
  preload: number;
  /** Seconds spent under stallSpeed. */
  stall: number;
  state: "riding" | "stalled";
}
export type SimEvent = { type: "stalled" };
export const createRider = (): Rider => ({ x: 2, v: T.startSpeed, distance: 0, pump: false, preload: 0, stall: 0, state: "riding" });
/** Advances a grounded rider by dt. Pumping adds speed on downslopes and costs it on upslopes (spec §5.2). */
export function step(r: Rider, a: Actions, track: Track, dt: number): SimEvent[] {
  if (r.state !== "riding") return [];
  const slope = track.slopeAt(r.x),
    norm = Math.sqrt(1 + slope * slope),
    sin = slope / norm,
    cos = 1 / norm;
  let accel = -T.gravity * sin - T.rollingResistance - T.drag * r.v * r.v;
  if (a.pump) accel += T.pumpGain * -sin * T.curvatureFactor;
  r.v = Math.min(T.maxSpeed, Math.max(0, r.v + accel * dt));
  r.x += r.v * cos * dt;
  r.distance += r.v * dt;
  r.pump = a.pump;
  r.preload = a.pump ? Math.min(1, r.preload + dt / T.preloadSeconds) : 0;
  r.stall = r.v < T.stallSpeed ? r.stall + dt : 0;
  if (r.stall >= T.stallSeconds) {
    r.state = "stalled";
    return [{ type: "stalled" }];
  }
  return [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 22 tests. If only the pumper/coaster test fails, adjust `pumpGain` or `rollingResistance` in `tuning.ts` (not the test) until a pumper sustains the trail and a coaster stalls; record the change in the commit message.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add pj-dirt-jumper/src/sim
git commit -m "Add grounded rider physics: pump for speed, stall-out ends the run

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Playable shell — stage, streamed track, bike, camera, input, HUD, loop

**Files:**
- Create: `src/render/stage.ts`, `src/render/trackView.ts`, `src/render/riderView.ts`, `src/render/cameraRig.ts`, `src/input/input.ts`, `src/ui/hud.ts`, `src/styles.css`, `src/game.ts`, `src/main.ts`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `TrackGen`, `Track`, `createRider`, `step`, `Actions`, `Rider`, `T`, `mulberry32`.
- Produces (used by Task 6):
  - `createStage(container: HTMLElement): Stage` with `Stage = { renderer; scene; camera: PerspectiveCamera; sun: DirectionalLight; resize(): void }`
  - `class RiderView { root: Group; update(x, y, angle, pumping: boolean, speed: number, dt: number): void }`
  - `class Game { rider: Rider; gen: TrackGen; reset(seed?: number): void }` exposed as `window.game` in dev.

- [ ] **Step 1: Stage**

`src/render/stage.ts`:
```ts
import * as THREE from "three";
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  resize(): void;
}
function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 512;
  const g = c.getContext("2d")!,
    grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#241a4f");
  grad.addColorStop(0.45, "#8a4f9e");
  grad.addColorStop(0.75, "#ff8a5c");
  grad.addColorStop(1, "#ffd59a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Golden-hour scene: gradient sky, warm key light that follows the rider, fog that melts into the horizon. */
export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog("#ffb489", 60, 260);
  scene.add(new THREE.HemisphereLight("#ffe2c4", "#5a4a7a", 1.4));
  const sun = new THREE.DirectionalLight("#ffc27a", 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  const resize = () => {
    const w = container.clientWidth || innerWidth,
      h = container.clientHeight || innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  return { renderer, scene, camera, sun, resize };
}
```

- [ ] **Step 2: Streamed track view**

`src/render/trackView.ts`:
```ts
import * as THREE from "three";
import type { Track } from "../track/track";
import { mulberry32 } from "../rng";
const CHUNK = 40,
  STEP = 0.25,
  HALF = 1.8,
  FLOOR = -40;
const dirt = new THREE.MeshStandardMaterial({ color: "#c9824a", roughness: 0.95, side: THREE.DoubleSide });
const soil = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
const grass = new THREE.MeshStandardMaterial({ color: "#6cc04a", roughness: 0.9, side: THREE.DoubleSide });
const tuftGeo = new THREE.ConeGeometry(0.14, 0.45, 5);
/** Triangle strip over pairs of vertices: [a0, b0, a1, b1, …]. */
function strip(positions: number[], material: THREE.Material, colors?: number[]) {
  const geo = new THREE.BufferGeometry(),
    index: number[] = [];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  for (let k = 0; k < positions.length / 6 - 1; k++) {
    const a = 2 * k;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
/** Builds the trail in 40 m chunks just ahead of the camera and frees them just behind it. */
export class TrackView {
  readonly root = new THREE.Group();
  private chunks = new Map<number, THREE.Group>();
  constructor(private track: Track) {}
  reset(track: Track) {
    for (const i of [...this.chunks.keys()]) this.drop(i);
    this.track = track;
  }
  update(camX: number) {
    const first = Math.floor((camX - 60) / CHUNK),
      last = Math.floor((camX + 120) / CHUNK);
    for (const i of [...this.chunks.keys()]) if (i < first || i > last) this.drop(i);
    for (let i = Math.max(0, first); i <= last; i++)
      if (!this.chunks.has(i) && (i + 1) * CHUNK <= this.track.end) {
        const g = this.build(i);
        this.chunks.set(i, g);
        this.root.add(g);
      }
  }
  private drop(i: number) {
    const g = this.chunks.get(i)!;
    this.root.remove(g);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) if (o.geometry !== tuftGeo) o.geometry.dispose();
    });
    this.chunks.delete(i);
  }
  private build(i: number) {
    const g = new THREE.Group(),
      x0 = i * CHUNK,
      n = CHUNK / STEP + 1,
      top: number[] = [],
      face: number[] = [],
      faceColors: number[] = [],
      bank: number[] = [],
      upper = new THREE.Color("#9a5a32"),
      lower = new THREE.Color("#3a2418");
    for (let k = 0; k < n; k++) {
      const x = x0 + k * STEP,
        y = this.track.heightAt(x);
      top.push(x, y, HALF, x, y, -HALF);
      face.push(x, y, HALF, x, FLOOR, HALF);
      faceColors.push(upper.r, upper.g, upper.b, lower.r, lower.g, lower.b);
      bank.push(x, y, -HALF, x, y + 0.35, -HALF - 0.6);
    }
    const surface = strip(top, dirt);
    surface.receiveShadow = true;
    g.add(surface, strip(face, soil, faceColors), strip(bank, grass));
    const rand = mulberry32(i * 7919 + 1),
      tufts = new THREE.InstancedMesh(tuftGeo, grass, 18),
      m = new THREE.Matrix4();
    for (let k = 0; k < 18; k++) {
      const x = x0 + rand() * CHUNK;
      m.makeTranslation(x, this.track.heightAt(x) + 0.35, -HALF - 0.2 - rand() * 0.5);
      tufts.setMatrixAt(k, m);
    }
    g.add(tufts);
    return g;
  }
}
```

- [ ] **Step 3: Bike view (PJ's body is added in Task 6)**

`src/render/riderView.ts`:
```ts
import * as THREE from "three";
const UP = new THREE.Vector3(0, 1, 0);
export const WHEEL_RADIUS = 0.34;
export const mat = (color: THREE.ColorRepresentation, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, roughness });
/** Unit cylinder stretched between two points; call again to re-aim it. */
export function aim(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a),
    len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
  return mesh;
}
export function tube(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10), material);
  m.castShadow = true;
  parent.add(m);
  return aim(m, a, b);
}
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
/** The dirt-jump bike, facing +x with the contact point at the origin. */
export class RiderView {
  readonly root = new THREE.Group();
  readonly bike = new THREE.Group();
  private wheels: THREE.Group[] = [];
  constructor() {
    this.root.add(this.bike);
    const frame = mat("#c6ff3d", 0.35),
      black = mat("#1b1b1f", 0.8),
      rim = mat("#ff4fa3", 0.4);
    for (const x of [-0.55, 0.55]) {
      const w = new THREE.Group();
      w.position.set(x, WHEEL_RADIUS, 0);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.04, 0.065, 10, 28), black);
      tyre.castShadow = true;
      w.add(tyre, new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.1, 0.025, 6, 24), rim));
      for (const a of [0, Math.PI / 2]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, (WHEEL_RADIUS - 0.1) * 2, 0.02), rim);
        spoke.rotation.z = a;
        w.add(spoke);
      }
      this.bike.add(w);
      this.wheels.push(w);
    }
    tube(this.bike, v(-0.2, 0.86), v(0.42, 0.9), 0.045, frame);
    tube(this.bike, v(0.42, 0.9), v(0, 0.4), 0.05, frame);
    tube(this.bike, v(0, 0.4), v(-0.22, 0.95), 0.04, frame);
    for (const z of [-0.06, 0.06]) {
      tube(this.bike, v(0, 0.4, z), v(-0.55, WHEEL_RADIUS, z), 0.028, frame);
      tube(this.bike, v(-0.22, 0.9, z), v(-0.55, WHEEL_RADIUS, z), 0.025, frame);
      tube(this.bike, v(0.42, 0.95, z), v(0.55, WHEEL_RADIUS, z), 0.032, frame);
    }
    tube(this.bike, v(0.42, 0.9), v(0.45, 1.1), 0.035, frame);
    tube(this.bike, v(0.45, 1.1, -0.3), v(0.45, 1.1, 0.3), 0.025, black);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.12), black);
    saddle.position.set(-0.24, 0.98, 0);
    this.bike.add(saddle);
  }
  update(x: number, y: number, angle: number, _pumping: boolean, speed: number, dt: number) {
    this.root.position.set(x, y, 0);
    this.root.rotation.z = angle;
    for (const w of this.wheels) w.rotation.z -= (speed * dt) / WHEEL_RADIUS;
  }
}
```

- [ ] **Step 4: Camera rig**

`src/render/cameraRig.ts`:
```ts
import * as THREE from "three";
/** Side-on follow camera: looks further ahead and pulls back as speed rises. */
export class CameraRig {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private snapNext = true;
  constructor(private camera: THREE.PerspectiveCamera) {}
  snap() {
    this.snapNext = true;
  }
  update(x: number, y: number, speed: number, dt: number, portrait: boolean) {
    const ahead = 3 + speed * 0.45,
      back = (portrait ? 26 : 15) + speed * 0.35,
      look = new THREE.Vector3(x + ahead, y + 1.2, 0),
      pos = new THREE.Vector3(x + ahead * 0.8, y + 3 + speed * 0.08, back);
    if (this.snapNext) {
      this.pos.copy(pos);
      this.look.copy(look);
      this.snapNext = false;
    } else {
      this.pos.lerp(pos, 1 - Math.exp(-dt * 5));
      this.look.lerp(look, 1 - Math.exp(-dt * 6));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    const fov = Math.min(70, 50 + speed * 0.5);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
```

- [ ] **Step 5: Input**

`src/input/input.ts`:
```ts
import type { Actions } from "../sim/rider";
const PUMP_KEYS = ["Space", "ArrowDown", "KeyS"];
/** Keyboard and the touch pump pad, merged into one Actions snapshot per frame. */
export class Input {
  private keys = new Set<string>();
  private pointers = new Set<number>();
  constructor(win: Window, pad: HTMLElement) {
    win.addEventListener("keydown", (e) => {
      if (PUMP_KEYS.includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    win.addEventListener("keyup", (e) => this.keys.delete(e.code));
    win.addEventListener("blur", () => {
      this.keys.clear();
      this.pointers.clear();
      pad.classList.remove("down");
    });
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.pointers.add(e.pointerId);
      pad.setPointerCapture(e.pointerId);
      pad.classList.add("down");
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) pad.classList.remove("down");
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) pad.addEventListener(type, up);
  }
  actions(): Actions {
    return { pump: this.pointers.size > 0 || PUMP_KEYS.some((k) => this.keys.has(k)), spin: 0, grab: [false, false, false] };
  }
}
```

- [ ] **Step 6: HUD and styles**

`src/ui/hud.ts`:
```ts
import type { Rider } from "../sim/rider";
const $ = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!;
const ENDINGS = ["Skunked.", "Zero bites.", "Ran outta line.", "Line went slack."];
/** DOM overlay: speed, distance, the touch pump pad, a stall warning and the end card. */
export class Hud {
  readonly el = document.createElement("div");
  readonly pad: HTMLElement;
  onRestart = () => {};
  private last = 0;
  constructor(parent: HTMLElement) {
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="stats"><div><b data-speed>0</b><span>KM/H</span></div><div><b data-dist>0</b><span>M</span></div></div>
      <div class="pad" data-pad aria-label="Hold to pump"><i><span>HOLD<br>TO PUMP</span></i></div>
      <p class="tip" data-tip>Hold <kbd>Space</kbd> or the pad on the <b>downslopes</b>. Let go on the ups.</p>
      <p class="warn" data-warn>PUMP IT, PJ!</p>
      <div class="end hidden" data-end role="dialog" aria-label="Run over"><h1 data-title></h1><p data-summary></p><button data-again>SEND IT AGAIN ↻</button></div>`;
    parent.append(this.el);
    this.pad = $(this.el, "[data-pad]");
    $(this.el, "[data-again]").onclick = () => this.onRestart();
  }
  update(r: Rider) {
    const now = performance.now();
    if (now - this.last < 80) return;
    this.last = now;
    $(this.el, "[data-speed]").textContent = String(Math.round(r.v * 3.6));
    $(this.el, "[data-dist]").textContent = String(Math.floor(r.distance));
    $(this.el, "[data-warn]").classList.toggle("show", r.state === "riding" && r.stall > 0.6);
    $(this.el, "[data-tip]").classList.toggle("hidden", r.distance > 120);
  }
  showEnd(r: Rider) {
    $(this.el, "[data-title]").textContent = ENDINGS[Math.floor(Math.random() * ENDINGS.length)];
    $(this.el, "[data-summary]").textContent = `${Math.floor(r.distance)} m of trail. Pump the backsides to keep your speed.`;
    $(this.el, "[data-end]").classList.remove("hidden");
    $(this.el, "[data-again]").focus();
  }
  hideEnd() {
    $(this.el, "[data-end]").classList.add("hidden");
  }
}
```

`src/styles.css`:
```css
:root{--ink:#1b1233;--cream:#fff4e0;--lime:#c6ff3d;--pink:#ff4fa3;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--cream)}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#241a4f;overscroll-behavior:none}
#app{position:fixed;inset:0}#app canvas{display:block;width:100%;height:100%;touch-action:none}
.hidden{display:none!important}
.hud{position:fixed;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none}
.stats{position:absolute;top:max(14px,env(safe-area-inset-top));left:max(16px,env(safe-area-inset-left));display:flex;gap:18px}
.stats div{display:grid;line-height:1}.stats b{font-size:38px;font-weight:900;letter-spacing:-1px;-webkit-text-stroke:1.5px var(--ink);paint-order:stroke fill;text-shadow:0 3px 0 var(--ink)}.stats span{font-size:10px;font-weight:800;letter-spacing:2px;opacity:.85}
.pad{position:absolute;left:0;top:0;bottom:0;width:50%;pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent}
.pad i{position:absolute;left:max(24px,env(safe-area-inset-left));bottom:max(24px,env(safe-area-inset-bottom));width:112px;height:112px;border-radius:50%;border:3px solid #ffffff66;background:#1b123355;display:grid;place-items:center;font-style:normal;transition:transform .08s,background .08s}
.pad i span{font-size:11px;font-weight:900;letter-spacing:1px;text-align:center}
.pad.down i{transform:scale(.9);background:var(--lime);color:var(--ink);border-color:var(--lime)}
@media (pointer:fine){.pad i{opacity:.5}}
.tip{position:absolute;left:50%;bottom:max(28px,env(safe-area-inset-bottom));translate:-50% 0;margin:0;padding:10px 16px;border-radius:30px;background:#1b1233cc;font-size:14px;white-space:nowrap}
.tip kbd{font:inherit;font-weight:800;border:1px solid #fff8;border-radius:5px;padding:0 5px}
.warn{position:absolute;left:50%;top:22%;translate:-50% 0;margin:0;font-size:clamp(28px,6vw,56px);font-weight:900;color:var(--pink);-webkit-text-stroke:2px var(--ink);paint-order:stroke fill;opacity:0;transition:opacity .2s}
.warn.show{opacity:1;animation:wobble .4s ease-in-out infinite alternate}
@keyframes wobble{from{transform:rotate(-3deg) scale(1)}to{transform:rotate(3deg) scale(1.08)}}
.end{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:8px;background:#1b1233b3;pointer-events:auto;text-align:center;padding:24px}
.end h1{margin:0;font-size:clamp(48px,10vw,96px);font-weight:900;color:var(--lime);-webkit-text-stroke:3px var(--ink);paint-order:stroke fill;text-shadow:0 6px 0 var(--ink)}
.end p{margin:0 0 12px;font-size:16px;max-width:420px}
.end button{font:inherit;font-size:18px;font-weight:900;letter-spacing:1px;padding:16px 28px;min-height:64px;border:0;border-radius:14px;background:var(--lime);color:var(--ink);cursor:pointer;box-shadow:0 6px 0 var(--ink)}
.end button:active{translate:0 4px;box-shadow:0 2px 0 var(--ink)}
.fallback{padding:10vh 8%;max-width:720px}.fallback h1{font-size:40px}
@media (orientation:portrait){.stats b{font-size:30px}.tip{white-space:normal;width:86%;text-align:center}}
```

- [ ] **Step 7: Game loop and entry point**

`src/game.ts`:
```ts
import { createStage, type Stage } from "./render/stage";
import { TrackView } from "./render/trackView";
import { RiderView } from "./render/riderView";
import { CameraRig } from "./render/cameraRig";
import { Input } from "./input/input";
import { Hud } from "./ui/hud";
import { TrackGen } from "./track/generate";
import { createRider, step, type Rider } from "./sim/rider";
import { T } from "./tuning";
/** Fixed-step simulation (T.simHz) with interpolated rendering. */
export class Game {
  readonly stage: Stage;
  readonly hud: Hud;
  readonly input: Input;
  readonly trackView: TrackView;
  readonly riderView = new RiderView();
  readonly cam: CameraRig;
  gen: TrackGen;
  rider: Rider;
  private prevX = 0;
  private acc = 0;
  private last = 0;
  constructor(
    container: HTMLElement,
    public seed: number,
  ) {
    this.stage = createStage(container);
    this.hud = new Hud(container);
    this.input = new Input(window, this.hud.pad);
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.prevX = this.rider.x;
    this.trackView = new TrackView(this.gen.track);
    this.cam = new CameraRig(this.stage.camera);
    this.stage.scene.add(this.trackView.root, this.riderView.root);
    this.hud.onRestart = () => this.reset();
    addEventListener("resize", () => this.stage.resize());
    addEventListener("keydown", (e) => {
      if ((e.code === "KeyR" || e.code === "Enter") && this.rider.state !== "riding") this.reset();
    });
    this.stage.resize();
    requestAnimationFrame((t) => this.frame(t));
  }
  reset(seed = this.seed) {
    this.seed = seed;
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.prevX = this.rider.x;
    this.acc = 0;
    this.trackView.reset(this.gen.track);
    this.cam.snap();
    this.hud.hideEnd();
  }
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const elapsed = Math.min(0.1, (now - (this.last || now)) / 1000),
      dt = 1 / T.simHz,
      actions = this.input.actions();
    this.last = now;
    this.acc += elapsed;
    while (this.acc >= dt) {
      this.prevX = this.rider.x;
      for (const e of step(this.rider, actions, this.gen.track, dt)) if (e.type === "stalled") this.hud.showEnd(this.rider);
      this.acc -= dt;
    }
    this.gen.ensure(this.rider.x + 240);
    const track = this.gen.track,
      x = this.prevX + (this.rider.x - this.prevX) * (this.acc / dt),
      y = track.heightAt(x);
    this.riderView.update(x, y, track.angleAt(x), this.rider.pump, this.rider.v, elapsed);
    this.trackView.update(x);
    this.cam.update(x, y, this.rider.v, elapsed, innerHeight > innerWidth);
    this.stage.sun.position.set(x - 12, y + 22, 16);
    this.stage.sun.target.position.set(x, y, 0);
    this.hud.update(this.rider);
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }
}
```

`src/main.ts`:
```ts
import "./styles.css";
import { Game } from "./game";
const app = document.getElementById("app")!,
  q = new URLSearchParams(location.search).get("seed"),
  seed = q && /^\d+$/.test(q) ? Number(q) >>> 0 : Number(new Date().toISOString().slice(0, 10).replaceAll("-", ""));
try {
  const game = new Game(app, seed);
  if (import.meta.env.DEV) Object.assign(window, { game });
} catch (error) {
  console.error(error);
  app.innerHTML =
    '<div class="fallback"><h1>PJ can’t find the trail</h1><p>This browser couldn’t start 3D graphics (WebGL). Try another browser, or turn on hardware acceleration.</p></div>';
}
```

- [ ] **Step 8: Smoke script**

`scripts/smoke.mjs`:
```js
// Headless play-test: node scripts/smoke.mjs [url]. Needs the dev server running.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const url = process.argv[2] ?? "http://127.0.0.1:5200/?seed=20260922";
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = join(homedir(), ".cache/ms-playwright"),
    dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
  if (!dir) throw new Error("No cached Chromium; set CHROMIUM_PATH");
  return join(root, dir, "chrome-linux64/chrome");
}
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const problems = [];
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone-landscape", { width: 844, height: 390 }], ["phone-portrait", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, hasTouch: name !== "desktop" });
  page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: ${m.text()}`));
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `smoke-out/${name}-start.png` });
  // Bot: hold pump on downslopes for 8 s of wall time.
  const until = Date.now() + 8000;
  let held = false;
  while (Date.now() < until) {
    const down = await page.evaluate(() => window.game.gen.track.slopeAt(window.game.rider.x) < 0);
    if (down !== held) await (down ? page.keyboard.down("Space") : page.keyboard.up("Space"));
    held = down;
    await page.waitForTimeout(30);
  }
  await page.keyboard.up("Space");
  await page.screenshot({ path: `smoke-out/${name}-riding.png` });
  const state = await page.evaluate(() => ({ x: Math.round(window.game.rider.x), v: +window.game.rider.v.toFixed(1), state: window.game.rider.state }));
  console.log(name, state);
  if (state.x < 30) problems.push(`${name}: rider barely moved (${state.x} m)`);
  await page.close();
}
await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("smoke OK — screenshots in smoke-out/");
```

- [ ] **Step 9: Typecheck and build**

Run: `cd /ai/github/BOXGames/pj-dirt-jumper && npm run build`
Expected: `tsc` passes, Vite writes `dist/`. (A chunk-size warning from three.js is acceptable.)

- [ ] **Step 10: Run the smoke test**

Run (two terminals, dev server outside the sandbox so browsers can reach it): `npm run dev`, then `npm run smoke`
Expected: `smoke OK`; each viewport logs `state: 'riding'` with x well above 30. Open `smoke-out/*-riding.png` and confirm: trail visible with dirt top, soil face and grass bank; bike sits on the trail and tilts with the slope; HUD shows speed and distance; pump pad visible bottom-left.

- [ ] **Step 11: Commit**

```bash
cd /ai/github/BOXGames
git add pj-dirt-jumper/src pj-dirt-jumper/scripts
git commit -m "Playable pump-track shell: streamed trail, bike, follow cam, touch + keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Art pass — PJ, pump crouch, parallax backdrop

**Files:**
- Create: `src/render/backdrop.ts`
- Modify: `src/render/riderView.ts` (add PJ's rig; `update` drives the crouch)
- Modify: `src/game.ts` (add `Backdrop` to the scene and update it each frame)

**Interfaces:**
- Consumes: `aim`, `tube`, `mat`, `WHEEL_RADIUS` from `riderView.ts`; `mulberry32`.
- Produces: `class Backdrop { root: Group; update(camX: number): void }`.

- [ ] **Step 1: Backdrop**

`src/render/backdrop.ts`:
```ts
import * as THREE from "three";
import { mulberry32 } from "../rng";
interface LayerSpec {
  z: number;
  width: number;
  height: number;
  bumps: number;
  color: string;
}
/** Near forest ridge, mid purple hills, far mountains. Real 3D depth gives the parallax. */
const LAYERS: LayerSpec[] = [
  { z: -35, width: 90, height: 6, bumps: 18, color: "#2f6b45" },
  { z: -90, width: 220, height: 20, bumps: 14, color: "#5a4f8f" },
  { z: -200, width: 480, height: 55, bumps: 10, color: "#8b6fa8" },
];
function ridge(spec: LayerSpec, rand: () => number) {
  const s = new THREE.Shape();
  s.moveTo(0, -80);
  for (let i = 0; i <= spec.bumps; i++) {
    const edge = i === 0 || i === spec.bumps,
      y = edge ? spec.height * 0.5 : spec.height * (0.3 + rand() * 0.7);
    s.lineTo((i / spec.bumps) * spec.width, y);
  }
  s.lineTo(spec.width, -80);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}
export class Backdrop {
  readonly root = new THREE.Group();
  private layers: { spec: LayerSpec; tiles: THREE.Mesh[] }[] = [];
  private ground: THREE.Mesh;
  private sun: THREE.Mesh;
  constructor() {
    const rand = mulberry32(99);
    for (const spec of LAYERS) {
      const geo = ridge(spec, rand),
        material = new THREE.MeshBasicMaterial({ color: spec.color }),
        tiles = [0, 1, 2].map(() => {
          const m = new THREE.Mesh(geo, material);
          m.position.set(0, -3, spec.z);
          this.root.add(m);
          return m;
        });
      this.layers.push({ spec, tiles });
    }
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 320), new THREE.MeshStandardMaterial({ color: "#4f8a4a", roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -1.2, -160);
    this.ground.receiveShadow = true;
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(20, 48), new THREE.MeshBasicMaterial({ color: "#fff0b0", fog: false }));
    this.sun.position.set(0, 45, -320);
    this.root.add(this.ground, this.sun);
  }
  update(camX: number) {
    for (const { spec, tiles } of this.layers) {
      const base = Math.floor(camX / spec.width) * spec.width;
      tiles.forEach((t, i) => (t.position.x = base + (i - 1) * spec.width));
    }
    this.ground.position.x = camX;
    this.sun.position.x = camX + 60;
  }
}
```

- [ ] **Step 2: Add PJ's rig to `RiderView`**

Replace the `RiderView` class in `src/render/riderView.ts` (keep `aim`, `tube`, `mat`, `v`, `WHEEL_RADIUS` above it) with:
```ts
/** Two-bone IK: returns the joint for limbs of length l1/l2 from a to b, bending toward `bend`. */
function joint(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3) {
  const d = Math.min(a.distanceTo(b), l1 + l2 - 1e-3),
    along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
    off = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
    dir = b.clone().sub(a).normalize();
  const side = bend.clone().sub(dir.clone().multiplyScalar(bend.dot(dir))).normalize();
  return a.clone().addScaledVector(dir, along).addScaledVector(side, off);
}
/** The dirt-jump bike plus PJ, facing +x with the contact point at the origin. */
export class RiderView {
  readonly root = new THREE.Group();
  readonly bike = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private limbs: THREE.Mesh[] = [];
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private pack: THREE.Group;
  private crouch = 0;
  constructor() {
    this.root.add(this.bike);
    const frame = mat("#c6ff3d", 0.35),
      black = mat("#1b1b1f", 0.8),
      rim = mat("#ff4fa3", 0.4);
    for (const x of [-0.55, 0.55]) {
      const w = new THREE.Group();
      w.position.set(x, WHEEL_RADIUS, 0);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.04, 0.065, 10, 28), black);
      tyre.castShadow = true;
      w.add(tyre, new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.1, 0.025, 6, 24), rim));
      for (const a of [0, Math.PI / 2]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, (WHEEL_RADIUS - 0.1) * 2, 0.02), rim);
        spoke.rotation.z = a;
        w.add(spoke);
      }
      this.bike.add(w);
      this.wheels.push(w);
    }
    tube(this.bike, v(-0.2, 0.86), v(0.42, 0.9), 0.045, frame);
    tube(this.bike, v(0.42, 0.9), v(0, 0.4), 0.05, frame);
    tube(this.bike, v(0, 0.4), v(-0.22, 0.95), 0.04, frame);
    for (const z of [-0.06, 0.06]) {
      tube(this.bike, v(0, 0.4, z), v(-0.55, WHEEL_RADIUS, z), 0.028, frame);
      tube(this.bike, v(-0.22, 0.9, z), v(-0.55, WHEEL_RADIUS, z), 0.025, frame);
      tube(this.bike, v(0.42, 0.95, z), v(0.55, WHEEL_RADIUS, z), 0.032, frame);
    }
    tube(this.bike, v(0.42, 0.9), v(0.45, 1.1), 0.035, frame);
    tube(this.bike, v(0.45, 1.1, -0.3), v(0.45, 1.1, 0.3), 0.025, black);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.12), black);
    saddle.position.set(-0.24, 0.98, 0);
    this.bike.add(saddle);
    // PJ: oversized orange tee, dark pants, teal helmet, goggles, backpack with a lure keychain.
    const tee = mat("#ff8a3d", 0.8),
      pants = mat("#2c2f4a", 0.9),
      skin = mat("#f1c29a", 0.7);
    // Limbs 0–3 are legs (shin, thigh ×2), 4–7 are sleeved arms (upper, forearm ×2), matching pose().
    for (let k = 0; k < 8; k++) {
      const leg = k < 4,
        r = leg ? 0.075 : 0.055,
        limb = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), leg ? pants : tee);
      limb.castShadow = true;
      this.root.add(limb);
      this.limbs.push(limb);
    }
    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 1, 10), tee);
    this.torso.castShadow = true;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin),
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat("#18b5a4", 0.3)),
      visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.26), mat("#18b5a4", 0.3)),
      goggles = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), mat("#ff4fa3", 0.2));
    helmet.position.y = 0.02;
    visor.position.set(0.14, 0.08, 0);
    goggles.position.set(0.14, 0.02, 0);
    this.head.add(face, helmet, visor, goggles);
    this.pack = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.3), mat("#3553a8", 0.8)),
      lure = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.03), mat("#ffd23a", 0.3)),
      tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 6), mat("#ff3b2f", 0.3));
    lure.position.set(-0.12, -0.2, 0.1);
    tail.position.set(-0.12, -0.29, 0.1);
    tail.rotation.z = Math.PI;
    this.pack.add(bag, lure, tail);
    this.root.add(this.torso, this.head, this.pack);
    this.pose(0);
  }
  /** Places PJ's body for a crouch amount 0 (standing) … 1 (fully compressed). */
  private pose(c: number) {
    const hip = v(-0.14, 1.22 - c * 0.38),
      shoulder = hip.clone().add(v(0.3 + c * 0.1, 0.5 - c * 0.12)),
      forward = v(1, 0),
      back = v(-1, -0.3);
    let i = 0;
    for (const z of [-0.12, 0.12]) {
      const foot = v(0.02, 0.42, z),
        hipZ = hip.clone().setZ(z * 0.8),
        knee = joint(foot, hipZ, 0.46, 0.46, forward);
      aim(this.limbs[i++], foot, knee);
      aim(this.limbs[i++], knee, hipZ);
    }
    for (const z of [-0.26, 0.26]) {
      const hand = v(0.45, 1.1, z),
        sh = shoulder.clone().setZ(z * 0.7),
        elbow = joint(sh, hand, 0.32, 0.32, back);
      aim(this.limbs[i++], sh, elbow);
      aim(this.limbs[i++], elbow, hand);
    }
    aim(this.torso, hip, shoulder);
    this.head.position.copy(shoulder).add(v(0.1, 0.24));
    this.pack.position.copy(hip).lerp(shoulder, 0.6).add(v(-0.2, 0));
    this.pack.rotation.z = this.torso.rotation.z;
  }
  update(x: number, y: number, angle: number, pumping: boolean, speed: number, dt: number) {
    this.root.position.set(x, y, 0);
    this.root.rotation.z = angle;
    for (const w of this.wheels) w.rotation.z -= (speed * dt) / WHEEL_RADIUS;
    this.crouch += ((pumping ? 1 : 0) - this.crouch) * Math.min(1, dt * 14);
    this.pose(this.crouch);
  }
}
```

- [ ] **Step 3: Wire the backdrop into `game.ts`**

In `src/game.ts`: add `import { Backdrop } from "./render/backdrop";`, add a field `readonly backdrop = new Backdrop();`, change the scene line to `this.stage.scene.add(this.backdrop.root, this.trackView.root, this.riderView.root);`, and after `this.trackView.update(x);` add `this.backdrop.update(this.stage.camera.position.x);`.

- [ ] **Step 4: Build and smoke**

Run: `npm run build && npm run smoke` (dev server running)
Expected: build passes, `smoke OK`. In the screenshots: PJ stands on the pedals with arms to the bars; purple/green ridges layer behind the trail with fog; the sun disc sits in the sky. Compare a `-riding` screenshot taken while pumping: PJ visibly lower.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add pj-dirt-jumper/src
git commit -m "Art pass: PJ with pump crouch, parallax ridges and sunset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Milestone wrap-up

**Files:**
- Create: `pj-dirt-jumper/README.md`
- Modify: `/ai/github/BOXGames/README.md` — add a row to the Games table

- [ ] **Step 1: Game README**

`pj-dirt-jumper/README.md`:
````markdown
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
````

- [ ] **Step 2: Repo README row**

In `/ai/github/BOXGames/README.md`, under the Games table header rows, add:
```markdown
| [pj-dirt-jumper](pj-dirt-jumper/) | Web (Vite + three.js). Endless arcade dirt-jump/pump-track with PJ, a sendy teen angler. | Milestone 1 |
```

- [ ] **Step 3: Full verification**

Run: `cd /ai/github/BOXGames/pj-dirt-jumper && npm test && npm run build && npm run smoke`
Expected: all tests pass, build succeeds, `smoke OK`.

- [ ] **Step 4: Commit**

```bash
cd /ai/github/BOXGames
git add pj-dirt-jumper/README.md README.md
git commit -m "Document PJ's Dirt Jumper milestone 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand to the user**

Start the dev server outside the sandbox and open `http://127.0.0.1:5200/` in Firefox. Ask the user how the pumping feels (too easy / too hard / too slow) before planning milestone 2.

---

## Later milestones (each gets its own detailed plan when the previous one is playable)

- **M2 — Air:** takeoff detection (surface curves away faster than the ballistic path), pop window and perfect pop, ballistic flight, spins with rotation counting, three grabs with rotation lock, landing grades and speed effects, bail + stall, jump catalogue (doubles, step-ups/downs, canyon gaps, mega-hip) with distance tiers, the fairness bot over 200 seeds, touch drag-to-spin and grab buttons, gamepad.
- **M3 — Juice:** scoring and air multiplier, named fishing combos, Flow meter, `lines.ts` slang callouts, pooled FX (dust, rooster tail, fire trail, shockwave), apex slow-mo, hit-stop, camera punch, trick poses, yard-sale bail animation, synthesized SFX and music.
- **M4 — Progression:** versioned save, Bait Bucket challenges, lures + golden bluegill, Tackle Shop cosmetics, XP and titles, ghost flag, Daily Line / Free Ride, share link + card, guided tutorial, biome skins.
- **M5 — Mobile polish:** adaptive quality tiers, PWA manifest + service worker, haptics, portrait layout and flip hint, safe areas, frame-time budget pass on a phone.
