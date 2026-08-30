# Demo notes — iteration log

Notes taken while building, kept for the next demo. Newest session first.

## 2026-08-30 — Outlines, the horde seam, and combat

Four tasks plus three fix rounds, each independently reviewed, then a whole-branch review.
The horde is now mortal: roughly 12–14 kills per 15 seconds with one weapon wired.

### Reordering the plan was the right call

The plan puts the wave director before weapons. But the director's defining behaviour is clear
detection — a wave ends when no enemies remain — and nothing could kill an enemy, so it would
have stalled on wave 1 forever and its central path would have been unexercisable. Kills came
first; the director now gets to be written against a horde that actually dies.

**Generalisable:** when a task's main behaviour depends on a capability that does not exist yet,
building it first means discovering how it really behaves two tasks later.

### Tests that cannot fail are worse than no tests

The index-to-handle mapping test looked thorough: spawn four, despawn one, spawn a replacement,
assert the parallel slices agree. It could not fail. `shared/pool` uses a LIFO free list, so the
replacement landed back in the slot just freed, live handles stayed contiguous, and enumeration
position equalled handle for every entry — the exact coincidence the test was written to rule
out. A buggy implementation using a counter instead of the real handle would have passed.

Catching it needed reading the pool's *reuse policy*, not the test. The rewrite forces a
persistent hole (despawn a middle handle, no replacement) so live handles `[0,2,3,4,5]` sit at
positions `[0,1,2,3,4]`, and it was then demonstrated failing against a deliberately broken
implementation.

**A test counted as coverage while unable to fail is worse than a known gap.**

### Bugs that only detonate later are worth more than bugs that fail today

Across two whole-branch reviews the highest-value findings were all latent:

- A spawn timer accumulating without bound — harmless until death lands, then the first kill
  triggers a spawn every frame until the banked credit drains.
- A despawn path that would nil-panic, because the archetype needed to release the sprite was
  only reachable through the pool entry being freed.
- A `Hit` carrying a frame-local slice index rather than a handle — correct today because it is
  consumed immediately, ruinous for the deferred effects juice and XP are made of.

Today's failure is visible. Next month's is a debugging session.

### Ask for the number that would be wrong

Every visual and behavioural claim this session was pinned to a measurement chosen so a plausible
wrong answer could not pass:

- Not "do enemies appear" but a **kill count** — frames look perfect while the damage loop is
  disconnected.
- Not "does the outline show" but **outline luminance against body luminance**, where the
  mechanism requires exactly half. That relationship caught a bad sample whose numbers were
  otherwise believable.
- Not "does it look round" but **horizontal versus vertical extent in world units**.

Where a measurement has a checkable algebraic relationship, require the report to state and check
it — then a bad sample is self-evident rather than merely plausible.

### Structural refactors go first, in their own commit

`horde.Step` was the first commit of this branch and it landed clean, was reviewed on its own,
and the combat work inherited a good seam. The same pattern is queued for the next branch:
`Arena` has reached 22 fields, and the reviewer priced the extraction at an hour now versus a day
after juice and XP. Recorded as blocking rather than as a backlog note, because the whole point
is that it gets more expensive.

### Process notes

- Two more implementers were killed mid-task by spend limits; resuming preserved their context
  both times. That is now four for four.
- One implementer mutation-tested its own new tests unprompted — deliberately breaking ordering
  and dropping a latch to confirm they failed. That is the standard to aim for.
- One reported a clean negative result with a correct diagnosis rather than tuning constants to
  make a metric pass. Briefs that demand a number and say "an honest negative beats a green
  checkmark" get honest negatives.

## 2026-08-29 — Boundary calibration, sprites, enemies (tasks A, 6, 7a–7c)

Same agent-driven shape as the previous session. Five tasks plus three fix
rounds, each independently reviewed, then a whole-branch review.

### What the demo can show now

A cream page. A corruption boundary that eats inward and **is** the gameplay
boundary — not a decoration that resembles it. BX-77 as an arrowhead under WASD.
Five enemy archetypes spawning out in the ink and walking in, staying legible
whichever side of the boundary they are on. Still no weapons, damage, or waves.

### The expensive lesson: look at the picture

Three separate defects this session were invisible to tests and obvious in a
screenshot:

- The player was still a placeholder square long after we had generated an
  arrowhead for it — the entire silhouette exercise was not on screen.
- Enemies standing in the ink were dark-on-dark and effectively invisible.
- A quantitative silhouette check reported every shape as identical, because
  compositing RGBA onto RGB turned the transparent background black. The art
  was fine; the measurement was broken. It was only caught because "every pair
  is 1.00" is implausible rather than merely bad.

**Every visual claim in this session was checked by decoding pixels, and the
important ones by looking at the image as well.** Both were necessary.

### Choose the acceptance measure before you need it

The brief for drawing the horde asked for a count of dark connected components,
expecting one blob per enemy. Useless: once corruption advances, the ink field
is itself a single dark component of 629,950 pixels and swamps every actor. The
measure that worked was luminance contrast between an actor and the ground
immediately beside it, plus position-distinctness to prove sprites were not all
stacked on one transform.

### Tint is multiplicative — author art white

The horde value treatment was correct, well-tested, and did nothing, because
every atlas was pre-baked in ink and `texture * tint` can only darken. Measured:
enemy 21.4 against ink 22.6. With white atlases, 711 against 72.

This is the standard technique across engines, not a workaround. Base art is
authored greyscale precisely so tint has full range:

- [Ronja's sprite shaders](https://www.ronja-tutorials.com/post/007-sprite-shaders/)
- [Cyanilux on colour swapping](https://www.cyanilux.com/tutorials/color-swap/)

Also worth carrying: 3–4 independently recolourable regions pack into one
greyscale texture's R/G/B/A channels.

### Value flips have a crossover; outlines do not

A pure ink↔paper crossfade passes through a point where the actor matches the
ground. Visible in our own captures — an enemy sitting on the boundary is
half-lost against the rim. The pixel-art consensus is that an outline "should
always increase contrast, and never decrease it", and that edge contrast is what
carries readability in fast reactive games:

- [Lospec on outlines](https://lospec.com/articles/pixel-art-outlines-part-2-using-color/)
- [Derek Yu's pixel art tutorial](https://www.derekyu.com/makegames/pixelart.html)
- [2D silhouette lighting](https://gamineai.com/blog/lighting-2d-action-game-silhouettes-rim-ambient-shader-basics-2026)

Crossfade plus outline is the robust answer. Outline not yet implemented.

### Two ramps that "match" because the numbers look alike

`actorTintBand = 0.6` was commented as matching the shader's front softness. It
did not: the shader's 0.6 is in stain-plane units (≈0.49 gameplay units, the
planes are at different depths) and its ramp is one-sided while the actor's was
two-sided. Fixed by *deriving* the band from the shader constant with the depth
conversion, so they are the same ramp by construction rather than by
coincidence. Contrast improved as a side effect, 307 → 711.

Generalisable: when two systems must agree on a number, derive one from the
other. Two independently written constants that happen to be equal will drift.

### What whole-branch review caught that per-task review could not

Both sessions, the most valuable finding came from the final review, because
each per-task reviewer only ever sees one diff. This time: four latent bugs that
would each have detonated in a *later* task — an unbounded spawn timer that
becomes "instant refill" the moment death lands, and a despawn path that would
nil-panic because the archetype is unreachable after the pool entry is freed.

A bug that only fails two tasks from now is worth more to fix than one that
fails today, because today's failure is visible.

### Process notes

- Two implementers were killed mid-task by spend limits, both immediately before
  committing. Both times the work survived uncommitted and resuming the same
  agent — rather than restarting — preserved its context and cost one message.
- Briefs that demand a *number* get honest answers. Two implementers reported
  clean negative results with correct diagnoses rather than tuning constants
  until a metric passed, because the brief told them that was the expected move.

## 2026-08-29 — NOISE FLOOR gameplay tasks 1–5 (+5b, 5c)

Built agent-driven: a fresh implementer subagent per task on sonnet/haiku, an
independent review after each, the main session as QC. 11 commits on
`feat/noise-floor-gameplay`.

### What the demo can actually show now

A cream page with real paper grain, a corruption model eating inward, and BX-77
as a black square you can drive with WASD, clamped to the shrinking safe zone.
It is a *first playable*, not a game: no enemies, no weapons, no waves.

### The thing that cost the most: we could not see the game

For most of the session nobody knew what the game looked like. External capture
is broken here — this is a Wayland session and the only installed tools
(`import`, `ffmpeg`) are X11-only, so `x11grab` returns a blank Xwayland root.
No `grim`, `wf-recorder`, or `spectacle`.

The fix was the engine's own GPU-side `rendering.GPUDevice.ScreenshotRGBA()`,
wired up as `games/noise-floor/internal/debugcap`. Run:

```sh
cd games/noise-floor
NOISEFLOOR_CAPTURE=/tmp/shot.png NOISEFLOOR_CAPTURE_FRAMES=360 ./bin/noise-floor
```

**Do this first on any future visual work.** Two real bugs were invisible until
the first capture existed, and both would have survived into the demo.

### Findings worth carrying forward

**Capture by frame count does not control what you capture.** This box renders
uncapped at roughly 3300fps, so 360 frames is ~108ms of wall time, not ~6s.
Corruption integrates real elapsed time, so the mechanic is still invisible at
that point. Visual regression (plan Task 14) needs a deterministic clock, not a
frame count.

**Inspect pixels, not file sizes.** Every capture claim in this session was
checked by decoding the PNG and counting: 676 pixels below luminance 450,
forming a 26×26 square with centre of mass (639.5, 359.5) against a frame centre
of (640, 360), colour exactly `palette.Ink()`. "A file was produced" proves
nothing — the first capture was a 735KB PNG of pure cream.

**Perspective camera maths, since the plan got it wrong.** The engine's primary
camera has a 60° **vertical** FOV. At distance *d* the visible height is
`2·d·tan(30°)` and the width is that times the aspect ratio. The plan asserted
"cameraZ frames roughly 26×15 world units" and every number in it was wrong,
which produced a backdrop that under-covered the screen. Any full-screen quad
must be sized from that formula, at its own depth.

**Per-task review caught things worth its cost.** The undersized backdrop, and a
factually wrong claim in an implementer's own report (it described a value
receiver as a pointer receiver). The whole-branch review then caught something
no per-task review structurally could: the stain front and the gameplay boundary
are not calibrated to each other, because each task's diff was correct alone.

**Model tiering held up.** Cheapest tier handled transcription-shaped tasks and
single-constant fixes without trouble. Mid-tier was needed wherever judgment
was involved. The most capable model was worth it only for the whole-branch
review, which is where the cross-cutting finding came from.

### Process notes

- One implementer was killed mid-task by a spend limit, immediately before
  committing. Its work survived uncommitted and it was resumed rather than
  restarted, keeping its context. Worth knowing the failure is recoverable.
- A fix-round agent swept an unrelated uncommitted docs edit into its commit.
  Harmless here, but the controller should commit its own edits before
  dispatching, not leave them in the tree.
- The plan carried two task lists that disagreed from Task 6 onward, so every
  task number after 5 was ambiguous. Corrected. Worth a consistency check on any
  plan before executing it.
