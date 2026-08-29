# Demo notes — iteration log

Notes taken while building, kept for the next demo. Newest session first.

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
