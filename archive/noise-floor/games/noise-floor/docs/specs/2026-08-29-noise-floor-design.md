# NOISE FLOOR — Design

**Date:** 2026-08-29
**Status:** Approved for planning
**Engine:** Kaiju Engine (Go + Vulkan)

A survivors-like demo starring BX-77 "Boxwrench", built to evaluate the Kaiju
Engine. Visual quality deliberately outpaces mechanical complexity: this is a
showcase, not a full game.

---

## 1. Premise

BX-77 holds a Citadel deck while entropy eats the page out from under him.

The shape is Brotato's: a fixed single-screen arena with no camera scroll,
discrete waves, weapons that fire on their own timers, and a shop between
waves. The fixed camera is an art decision as much as a design one — every
sprite sits at a known scale, so detail is never wasted at distance nor lost
at scale.

### 1.1 The hook

**The corruption stain is the arena boundary.**

The cream paper field is the play area; ink is death. Corruption creeps inward
as a wave runs, so the safe zone shrinks and pushes the player into the horde.
Clearing a wave washes the page back toward cream.

This makes the difficulty curve, the art direction, and the spatial pressure a
single object rather than three systems that have to be balanced against each
other. It is the one element that distinguishes this from a genre exercise,
and the most structure hangs off it.

---

## 2. Visual direction

Established and validated in the spike (see §9).

**Key:** light field, dark corruption. The palette is the boxwrench design
system's armor-sampled tokens, used unchanged:

| Token | Hex | Use |
| --- | --- | --- |
| `paper` | `#F4EFE4` | clean field |
| `paper-raised` | `#EAE2D2` | UI surfaces |
| `ink` | `#17161B` | corruption, linework |
| `ink-muted` | `#5E594F` | secondary text |
| `rule` | `#CDC3AF` | dividers |
| `chrome` | `#878D94` | BX-77 armor |
| `brass` | `#A57C33` | command plating, XP gems, hatch grid |
| `visor` | `#C33A2B` | optical scanner, noise entities, corruption rim |

Text-safe variants `brass-text #7A5A22` and `visor-text #A32B1D` are the only
accents permitted to carry words.

Nothing in the survivors genre reads light. The risk is that bloom and additive
glow — the genre's cheap wins — do not work on cream, so contrast must come
from ink weight and saturation instead. This is a constraint on every art
decision downstream, not a preference.

---

## 3. Lore mapping

The lorebook already contains these mechanics. Nothing here is parallel fiction
invented to fit the genre; each row is drawn from the source document.

| Game element | Lore equivalent | Source |
| --- | --- | --- |
| Enemies | Uncalibrated noise / Logic-Thermal Waste | Directive 05 |
| XP pickups | Telemetry weighting / observational vector | Section V |
| Level-up event | "Posterior probability recalculated" | Directive 01 |
| Shop screen | RECALIBRATION | Directive 01 |
| Upgrade cards | Directives 01–06 | Section III |
| Splitting enemy | Overfit — high variance, memorizes noise | Section V |
| Tank enemy | Dendrite — anode needle lattice | Section V |
| Boss | Local Optimum — a trap that must be escaped | Section V |
| Death / fail state | "Compute cycle denied" | Directive 05 |

### 3.1 Weapons

Six slots, independent timers, all firing simultaneously. Collectively they are
most of the screen's motion.

| Weapon | Behaviour |
| --- | --- |
| Torque Wrench | Orbital melee, constant rotation |
| Monovision Beam | Sweeping crimson laser from the visor |
| Precision Escalation | Slow, high damage, tight tolerance |
| Prior/Posterior | Homing; damage rises with consecutive hits |
| Gradient Lock | Area slow field |
| Schiltron Wall | Deployable directional shield |

### 3.2 Horde

Distinguished by silhouette so they stay readable at a glance under pressure.

| Enemy | Silhouette | Behaviour |
| --- | --- | --- |
| Mote | Tiny | Fast, swarms |
| Dendrite | Large, spiky | Slow, tanky |
| Aberrant | Medium, fractured | Ranged, chromatic shards |
| Lancer | Elongated | Charges in a straight line |
| Overfit | Medium | Splits into smaller copies on death |

**Constraint carried from the spike:** crimson shards with dark cores become
nearly invisible against ink once the field inverts beneath them. Horde art
requires a value treatment that survives the ground flipping from cream to
ink — either a light/emissive variant that engages as local corruption rises,
or a permanent light rim. This is a first-order art requirement, not a
polish item.

---

## 4. Juice layer

The cheapest perceived-quality win in the project, and nearly free in art cost.
Brotato's game feel is almost entirely this rather than its art.

- Hit flash: target flashes white for ~60 ms
- Knockback on hit, scaled to damage
- Damage numbers arcing upward and fading
- Screen shake scaled to damage dealt
- Hit-stop: ~40 ms freeze on kills
- Shard burst on enemy death
- XP gems that magnetise and streak toward the player
- Per-weapon muzzle flash, tracer, and impact

---

## 5. Architecture

```
games/noise-floor/
  cmd/noisefloor/          main + bootstrap.GameInterface implementation
  internal/
    arena/                 fixed camera, bounds, corruption model
    actor/                 player, enemy behaviours
    weapon/                fire timers, projectile pools
    horde/                 spawner, wave director
    vfx/                   demo-specific effects; game feel lives in shared/juice
    progression/           XP, Directive cards, shop
    render/                stain shader, materials, sheet binding
  assets/                  authored content, organised (committed)
  content/                 generated flat database (gitignored)
  docs/specs/              this document
```

NOISE FLOOR is one demo in the BOXGames monorepo; anything a second demo would
also want lives higher up (`shared/palette`, `shared/pool`, `shared/juice`,
`shared/kaijuboot`, `tools/spritegen`). See `docs/ARCHITECTURE.md`.

A game consumes Kaiju as a library: implement `bootstrap.GameInterface`
(`Launch`, `PluginRegistry`, `ContentDatabase`) and call `bootstrap.Main`.
Because the game supplies its own `ContentDatabase`, all project content lives
in this repo and the engine checkout stays pinned and read-only.

The engine's asset database is flat and keyed by bare filename, so authored
assets in `assets/` are flattened into a generated `content/` directory at build
time, then layered over the engine's stock content by
`shared/kaijuboot.LayeredDatabase`. See `docs/KAIJU-NOTES.md`.

### 5.1 Corruption is CPU-authoritative

The corruption boundary is a plain radius owned and hit-tested by the CPU. The
fragment shader's noise decorates that boundary within a band; it does not
define it.

The alternative — bit-identical fbm evaluated in both Go and GLSL — is a
synchronisation bug waiting to happen, in exchange for a difference no player
can perceive. The visual edge wobbles roughly ±5% around the radius the CPU
owns.

### 5.2 Pooling

Every actor, projectile, gem, and particle comes from a pool. The spike
measured ~20,000 sprites inside a 60 fps budget, so raw throughput is not the
risk; allocation churn and GC pauses during a wave are.

### 5.3 Generation is offline

`tools/spritegen` drives local ComfyUI and writes committed sprite sheets. The
game builds and runs with no ComfyUI present and no diffusion models on disk.
No model inference happens at runtime.

---

## 6. Art pipeline

Local generation, driven through ComfyUI. The user runs MiniMax H3 routinely;
the pipeline is treated as available.

**Animation — MiniMax H3 video, frames extracted.** A video model's purpose is
temporal consistency, which is exactly what per-frame still generation fails
at: independent samples make rivets crawl, the cape rehang, and the crest
wobble, and the artifacts are worst on high-frequency detail — which BX-77's
armor is made of.

- `ref2v` takes an existing BX-77 stance as reference, so the character stays
  the character rather than being re-invented per frame.
- `fl2v` takes a first and last frame. Supplying **the same image for both**
  yields a seamless loop — the exact requirement for idle and walk cycles,
  solved structurally instead of by hand-fixing the wrap.
- `RIFE` resamples to the target frame count.
- `SeedVR2` cleans up before packing.

**Stills — Flux 2 Klein 9B.** Horde variants, boss designs, weapon icons, shop
card art. An `80sFantasyKlein9b` LoRA is on disk and is close to the lorebook's
"1980s retro-futuristic robotics" brief.

**Source art.** `/ai/github/boxwrench` holds a six-angle cel turnaround pose
sheet, three alpha-cut stances, a 3K headshot, and six lore illustrations.
These are the style reference and the `ref2v` seed.

**Output.** Frames are alpha-cut, trimmed, packed into sheets, and committed
alongside Kaiju sprite-sheet clip data.

---

## 7. Testing

Kaiju ships an integration-test framework with both screenshot and video
capture, designed for agent-driven verification. It was used throughout the
spike to verify rendering without a human watching a window, and it becomes the
visual regression suite here.

- **Visual regression:** integration tests capturing known frames per system
- **Unit tests:** wave director scheduling, damage math, pool reuse
- **Performance:** sprite-count sweep retained as a regression guard

---

## 8. Scope

8 waves · 6 weapons · 5 enemy types · 1 boss · 12 Directive cards.

This is a demo. Scope is fixed at these numbers; anything beyond is a separate
decision.

---

## 9. Prior spike

A feasibility spike on 2026-08-29 answered three gating questions.

1. **Kaiju builds and runs** on this machine (Ubuntu 24.04, RADV, RX 7900 XT).
   Go 1.27 installed at `/ai/toolchains/go`; X11 dev headers extracted without
   root to `/ai/toolchains/x11deps/root`, with `.so` symlinks repointed at the
   installed runtime libraries. Build environment: `/ai/toolchains/kaiju-env.sh`.
2. **Sprite throughput is not a constraint.** Cost is linear at ~0.73 µs per
   sprite: 300 sprites at 0.34 ms mean, 1,000 at 0.88 ms, 3,000 at 2.51 ms,
   8,000 at 6.04 ms, 20,000 at 14.6 ms. The 60 fps budget is roughly 20,000
   sprites against a genre norm of 300–1,500.
3. **Custom fragment shaders work end to end.** GLSL compiled to SPIR-V,
   registered via `.shader`/`.material` descriptors, driven by a per-instance
   parameter. The corruption ramp rendered correctly from clean paper to
   consumed page.

**Engine gotcha to carry forward:** a `.shader` descriptor with an empty
`DrawInstanceData` falls back to the shader *name*; an unregistered name
resolves to `standard`, which has no `UVs` field, so UVs silently collapse to
zero and the shader renders flat with no error reported. Always set
`DrawInstanceData` explicitly.

All spike code under `spike-kaiju/` is throwaway. It edits shaders and
materials inside the vendored engine tree, which this design explicitly
forbids. The concept survives; the code does not.

---

## 10. Open risks

1. **Horde visibility against inverted ground** (§3.2). Requires a value
   treatment decision before horde art is generated. First implementation task.
2. **Light-key contrast without bloom** (§2). The genre's standard tricks are
   unavailable; contrast must be carried by ink weight and saturation.
