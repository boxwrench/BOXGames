# PJ's Dirt Jumper — Design Spec

**Date:** 2026-09-22 · **Status:** approved in brainstorming, awaiting spec review
**Location:** `/ai/github/BOXGames/pj-dirt-jumper/` (web game, sibling of `Droppie/` and `frontier-block/`)

## 1. Pitch

An endless, side-on, arcade mountain-bike game. PJ — a sendy teenage rider who would rather be fishing when not riding — pumps rollers, pops lips and throws flips and grabs down a procedurally generated trail. **Stunts give speed, speed gives bigger stunts.** Over-the-top 3D visuals, full-on dirt-jump slang, and fishing jokes everywhere.

**Pillars**

1. **Flow feels incredible.** Pumping and landing are the core joy; everything else is garnish.
2. **One more run.** Short runs, instant restart, always a goal in reach.
3. **Loud and silly.** Spectacle and humour scale with how rad the move was.
4. **Phone-first parity.** Everything plays as well with thumbs as with a keyboard.

**Out of scope (v1):** online leaderboards, multiplayer, hand-built courses, physics ragdoll, monetisation of any kind.

## 2. Platform & stack

- Vite + TypeScript + vanilla three.js, matching `frontier-block/`. No physics engine, no runtime asset downloads (all art procedural, all audio synthesised).
- Targets: desktop Chrome/Firefox/Safari, iOS Safari, Android Chrome. Must run at 60 fps on a mid-range phone via adaptive quality.
- Installable PWA (manifest + service worker) so it launches fullscreen and plays offline after first load.
- Landscape is the primary layout; portrait is supported with a wider camera and a dismissible "flip your phone" hint.

## 3. Camera & presentation model

Side-on **2.5D**: all gameplay happens on a single 2D line (x = distance, y = height); the world is rendered in 3D and viewed from the side with slight perspective. The camera follows PJ with look-ahead proportional to speed.

## 4. Controls

A single action model shared by every input device.

| Action | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Pump / preload (hold, ground) | Space or ↓ | Hold left thumb pad | A (hold) |
| Pop (release, ground) | release Space/↓, or ↑ | Release left thumb pad | release A |
| Spin back / forward (air) | ← / → | Drag left pad left / right (further = faster) | Left stick X |
| Grab 1 — Superman 🐟 | J | Right-thumb button 1 | X |
| Grab 2 — Tailwhip 🎣 | K | Right-thumb button 2 | Y |
| Grab 3 — No-Hander 🐠 | L | Right-thumb button 3 | B |
| Pause | P / Esc | Pause button | Start |

- Touch buttons are large (≥ 64 CSS px), sit inside safe-area insets, and support multitouch (pump pad + a grab at the same time).
- Haptics via `navigator.vibrate` where supported (landings, bails, perfects).

## 5. Core mechanics

All tuning values below are starting points, kept in one `tuning.ts` file.

### 5.1 Rider state machine

`GROUNDED → AIRBORNE → (LANDED → GROUNDED) | BAILED`. A run ends on `BAILED` or on **stall-out** (speed < 2 m/s for 3 s — "Skunked.").

### 5.2 Riding and pumping (grounded)

- PJ always rides left → right. No throttle; speed only changes through the rules below.
- Gravity along the slope: `a = -g · sin(θ)` with g = 20 m/s² (arcade-heavy).
- Rolling resistance: −0.6 m/s², plus drag `−0.004 · v²`.
- **Pumping:** while pump is held, extra acceleration `a_pump = k_pump · (−sin θ) · curvatureFactor`, k_pump = 9. Positive on downslopes (gain speed), negative on upslopes (lose speed). Pumping over the back of a roller is the main skill.
- Preload: holding pump compresses the rider pose; preload charges over 0.35 s.
- Max speed = 22 m/s base, +1 m/s per Flow level (see 5.6).

### 5.3 Pop and airtime

- Leaving the ground where the surface curves away faster than the ballistic path launches PJ.
- **Pop:** releasing a charged preload within the lip window (last 1.2 m before takeoff) adds vertical velocity `+4.5 m/s × preload`. A "perfect pop" (release within the final 0.3 m) adds a further +1.5 m/s and triggers a "POPPED!" callout.
- Airborne motion is ballistic (same g), no air control of trajectory.

### 5.4 Tricks (airborne)

- **Spin:** angular acceleration toward target rate ±420°/s (keyboard/gamepad full input; touch is proportional). Completed rotations counted as whole backflips/frontflips at each ±360°.
- **Grabs:** hold a grab button to enter that pose (0.15 s transition in, 0.15 s out). Points accrue per 0.1 s held. **Rotation is locked while a grab is held.**
- **Combo within one air:** each distinct trick (a flip, or a grab held ≥ 0.25 s) adds to the air's trick list; each additional distinct trick raises the air multiplier by +1.
- **Named combos** (fishing variants), for example:
  - Backflip + Superman → "Bluegill Backflip"
  - Tailwhip during a flip → "Largemouth Tailwhip"
  - No-Hander released at the apex (±0.15 s) → "Catch-and-Release"
  - Double backflip → "The Double Hookset"
  - Triple flip → "Lunker Loop"
  - All three grabs in one air → "Full Tackle Box"

### 5.5 Landing

On touchdown, compare bike pitch to the surface angle, and check grab/transition state:

| Grade | Condition | Speed effect | Flow |
|---|---|---|---|
| **PERFECT** ("BUTTERED AND BATTERED") | angle error ≤ 8° **and** landing on a downslope | +3 m/s | +2 |
| **Buttery** | ≤ 15° | +1.5 m/s | +1 |
| **Clean** | ≤ 25° | 0 | 0 |
| **Sketchy** | ≤ 40° | −3 m/s, wobble 0.5 s | −1 |
| **Bail** | > 40°; or a grab still held or transitioning; or "huck to flat" — landing where the surface slopes down less than 3° with vertical impact speed > 12 m/s | run ends | — |

- A landing's trick points are banked only on Clean or better; Sketchy banks 50%.
- Hit-stop (60 ms) and camera punch on PERFECT.

### 5.6 Flow meter

- Levels 0–5. Gained from landings (table above); lost by Sketchy landings; decays one level after 4 s on the ground without landing a trick (never below 0).
- Effects per level: score multiplier ×(1 + level × 0.5), max speed +1 m/s, visual escalation (speed lines → dirt rooster tail → fire trail at Flow 5).

### 5.7 Scoring

`score = distance_m × 1 + Σ(banked air points)` where air points = `Σ trick base × air multiplier × Flow multiplier × landing bonus` (Perfect ×1.5, Buttery ×1.2).

Trick base values: flip 500 each (double = 1,200, triple = 2,000), grabs 60 per 0.1 s, perfect pop +150.

### 5.8 Collectibles

- **Lures** placed along good lines (on the ideal arc of each jump, some only reachable with big air). +1 lure currency, +50 points, reel "zzzing".
- **Golden Bluegill:** ≤ 1 per 800 m, placed at a high-skill arc. +25 lures, +2,500 points.

## 6. The endless trail

- Seeded generator (mulberry32, like `frontier-block`). Output is a sequence of **sections**, each a list of control points joined into a smooth C¹ height curve, plus metadata: feature spans (lip, landing, gap), lure positions, biome.
- **Section catalogue:** flat run-in, pump rollers (2–6), tabletop, double (gap), step-up, step-down, hip-and-berm, canyon gap, mega-hip.
- **Difficulty tiers by distance** (each tier unlocks sections and widens gaps):

| Distance | Tier | New features |
|---|---|---|
| 0–400 m | Backyard Pump Track | rollers, tabletops |
| 400–1,200 m | Local Dirt Jumps | doubles, step-ups |
| 1,200–2,500 m | Pine Forest | step-downs, bigger doubles |
| 2,500–4,000 m | Desert Canyon | canyon gaps |
| 4,000 m + | Volcano Send-Zone | mega-hips, max gaps |

- **Fairness rule:** every gap either (a) is clearable by the reference bot at the speed it can reasonably have on arrival, or (b) has a ride-around (a lower line through the gap). Big gaps are preceded by a pump section that can build the needed speed.
- **Daily Line:** seed = UTC date `YYYYMMDD`. **Free Ride:** random seed. URL `?seed=N&beat=S` shares a line and a target score.

## 7. Visuals

- Stylised, saturated, golden-hour diorama. Everything procedural; no textures heavier than small canvas-generated ones.
- **Track rendering:** extruded ribbon along the curve with depth, berm edges, ruts, grass tufts, wooden lips on kickers. Streamed in chunks ahead of the camera and disposed behind it.
- **Parallax backdrop:** sky gradient + sun, 3–4 layers (mountains, ridge pines, lake with a bass boat, near foliage). Layer contents change per biome.
- **PJ:** original character — helmet, goggles, oversized tee, backpack with a lure keychain. Jointed rig (torso, head, arms, legs, bike frame, fork, wheels); tricks and states are keyframed poses blended by the renderer.
- **Spectacle:** speed-scaled FOV and speed lines; dust on pumps and landings; apex slow-mo (time scale 0.6 for 0.35 s) when airtime > 1.2 s; shockwave ring + freeze-frame on PERFECT; fire trail at Flow 5; confetti/fireworks for new records.
- **Bail:** hand-animated "yard sale" — rider tumbles on a scripted arc, bike cartwheels separately, gear props (cap, water bottle, fishing lure) fly off, freeze-frame + caption, then results.
- Pooled effects (instanced debris, recycled sprites), reusing the approach in `frontier-block/src/fx.ts`.

## 8. Humour & voice

- Callouts escalate with rad-ness:
  - Small: "Sendy!", "Steezy.", "Clean.", "Nice cast."
  - Big: "FULL SENDER!", "Absolute lunker!", "That's a keeper!", "Hooked it!"
  - Bails: "Yard sale!", "Huck to flat, bro.", "Got skunked.", "Snagged a root.", "Throw that one back.", "Line snapped."
- Lines live in one `lines.ts` table keyed by event and intensity, chosen randomly without immediate repeats.
- Rider titles: Bait Kid → Pond Shredder → Creek Sender → Lake Legend → Lunker Legend.
- Tone: teen, sendy, goofy; no swearing.

## 9. Audio

All WebAudio synthesis (pattern from `frontier-block/src/sound.ts`): speed-pitched tyre crunch, freewheel buzz in air, pop whoosh, landing thump (heavier on bigger drops), reel "zzzing" on lures, bail crash, and a procedural punk-ish beat whose layers increase with Flow. Mute toggle persisted.

## 10. Progression

- **Save data** (localStorage, versioned `{ v: 1, ... }` with migrations): best score, best distance, best combo, biggest air, lures, XP/level, owned + equipped cosmetics, challenge state, settings, tutorial-done flag.
- **Bait Bucket:** 3 active challenges; a completed one pays lures + XP and is immediately replaced from a pool (≈ 20 challenge templates, e.g. "Land a Double Hookset", "Chain 4 tricks in one air", "Grab 10 lures in a run", "Ride 1,000 m with no sketchy landings", "Hit 3 perfect pops in a row").
- **Tackle Shop:** cosmetics only — bike paints, helmets (including a bass helmet), tyre trails (fire, rainbow, bubbles). Prices in lures; some gated by rider level.
- **Rider level:** XP from distance, tricks and challenges. Level-ups unlock titles and shop items.
- **Ghost flag** on the trail where your best run on that seed ended.
- **Tutorial:** first launch plays a short guided backyard run with contextual prompts; skippable afterwards.
- **Share:** results card (PNG) + link with seed and score, as in Frontier Block.

## 11. Architecture

```
pj-dirt-jumper/src/
  tuning.ts            all gameplay constants
  rng.ts               mulberry32
  track/               generator: seed → sections → height curve, features, lures   [pure]
  sim/                 rider state machine, fixed 120 Hz step(state, actions, track) → events   [pure]
  score/               combo building, trick naming, Flow, landing grades   [pure]
  progress/            save/load + migrations, challenges, shop, XP   [pure except storage adapter]
  lines.ts             slang/humour table   [pure]
  input/               keyboard, touch, gamepad → Actions
  render/              scene, track chunks, parallax, rider rig + poses, fx, camera director
  quality.ts           FPS monitor → DPR / shadow / post-fx tiers
  audio/               synth SFX + music
  ui/                  DOM HUD, menus, shop, results, share card
  main.ts              wiring + fixed-timestep loop
```

**Data flow:** Input → Actions → `sim.step` at fixed 120 Hz → Events (`takeoff`, `trick`, `land{grade}`, `bail`, `lure`, …) → score/progress/audio/UI subscribers. Render reads the latest two sim states and interpolates.

**Boundaries:** `track`, `sim`, `score`, `progress`, `lines` import nothing from three.js or the DOM, so they run under `node --test`.

**Error handling:** storage failures fall back to in-memory saves (as `frontier-block/src/rules.ts#storage` does); corrupt or future-version saves reset with a toast; WebGL context loss pauses the game; no WebGL shows a friendly fallback page.

## 12. Testing

- **Unit (`node --test`):** pump gain on downslope / loss on upslope; stall-out; pop window and perfect pop; rotation counting; grab lock; landing grade thresholds; bail on held grab; scoring and multipliers; Flow gain/decay; named-combo detection; challenge completion; save migration; generator determinism per seed.
- **Fairness sim:** a reference bot (perfect pump + pop, no tricks) rides the first 3 km of 200 seeds; every gap must be cleared or have a ride-around. Runs as part of `npm test`.
- **Browser:** Playwright headless Chromium scripted runs at 1440×900 and 390×844 (portrait) and 844×390 (landscape) with screenshots and console-error capture; a frame-time check.
- **Manual:** open in Firefox locally (Chrome on this workstation has no WebGL).

## 13. Milestones

1. **Pump track feel** — generator (rollers/tabletops), sim grounded + pump, basic render, keyboard + touch pad. *Playable.*
2. **Air** — pop, spins, grabs, landing grades, bail, jumps catalogue, fairness test.
3. **Juice** — scoring, callouts/slang, Flow, spectacle FX, rider poses, audio.
4. **Progression** — save, Bait Bucket, Tackle Shop, levels, daily line, share, tutorial.
5. **Mobile polish** — adaptive quality, PWA, haptics, portrait layout, perf pass.

Each milestone ends with a playable build opened for the user.
