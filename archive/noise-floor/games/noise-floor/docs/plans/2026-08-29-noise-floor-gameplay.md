# NOISE FLOOR Gameplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NOISE FLOOR as a playable survivors-like — fixed arena, shrinking corruption boundary, auto-firing weapons, waves, juice, and progression — using placeholder art, so gameplay never blocks on asset generation.

**Architecture:** A Kaiju game consumes the engine as a library by implementing `bootstrap.GameInterface`. Gameplay systems are plain Go packages under `internal/`, each registering its own update function with `host.Updater` — the engine registers none of its own. Everything spawned in quantity comes from `shared/pool`. The corruption boundary is a CPU-owned radius that the fragment shader decorates but does not define.

**Tech Stack:** Go 1.26+ · Kaiju Engine (pinned, `third_party/ENGINE_PIN`) · Vulkan via RADV · GLSL compiled to SPIR-V with `glslc` · Go standard `testing`

**Spec:** [`games/noise-floor/docs/specs/2026-08-29-noise-floor-design.md`](../specs/2026-08-29-noise-floor-design.md)

**Companion plan:** Art generation (`tools/spritegen`) is a separate plan. This plan uses placeholder art throughout and defines the sprite-sheet contract that plan must satisfy.

## Global Constraints

- **Go version:** 1.26.0 minimum (engine requirement).
- **Never edit `third_party/kaiju/`.** It is deleted and re-cloned when the pin changes. Custom shaders and content go in `games/noise-floor/assets/`.
- **Colors come from `shared/palette`, never literals.** Tokens: `paper #F4EFE4`, `paper-raised #EAE2D2`, `ink #17161B`, `ink-muted #5E594F`, `rule #CDC3AF`, `chrome #878D94`, `brass #A57C33`, `visor #C33A2B`. Text-only accents: `brass-text #7A5A22`, `visor-text #A32B1D`.
- **No bloom, no additive glow.** The light key makes them unavailable; contrast comes from ink weight and saturation (spec §2).
- **Asset keys are bare filenames.** The engine's content database is flat. Authored files live in `assets/`, are flattened into generated `content/` by `scripts/build-content.sh`, and are layered over stock content by `shared/kaijuboot`.
- **`DrawInstanceData` must be set explicitly** in every `.shader` descriptor. An empty value falls back to the shader name; an unregistered name resolves to `standard`, which has no `UVs` field, so UVs silently collapse to zero and the shader renders flat **with no error**.
- **Everything spawned in quantity uses `shared/pool`.** Throughput is not the risk (~20,000 sprites fit a 60fps budget); GC pauses mid-wave are.
- **Sprites live in the XY plane**, camera on +Z looking at the origin. Movement is X/Y, never X/Z.
- **Build and run:** `make build GAME=noise-floor` / `make run GAME=noise-floor` from the repo root. `make test` runs the whole workspace.

## Verified engine API reference

Confirmed against the pinned checkout. Use these exact names.

```go
// Update registration — the engine registers no updates for you.
id := host.Updater.AddUpdate(func(deltaTime float64) { /* ... */ }) // engine/updater.go:62
host.Updater.RemoveUpdate(&id)                                      // engine/updater.go:77
// type UpdateId int. Also available: host.LateUpdater, host.UIUpdater, host.UILateUpdater.

// Input — polled automatically before updates run; no opt-in needed.
kb := &host.Window.Keyboard
kb.KeyHeld(hid.KeyboardKeyW)  // continuous (true while down) — use for movement
kb.KeyDown(hid.KeyboardKeyW)  // edge: pressed this frame
kb.KeyUp(hid.KeyboardKeyW)    // edge: released this frame
// Keys: KeyboardKeyW/A/S/D, KeyboardKeyUp/Down/Left/Right, KeyboardKeyEscape, KeyboardKeySpace

mouse := &host.Window.Mouse
mouse.Position()      // bottom-left origin window space
mouse.Held(hid.MouseButtonLeft)

ctrl := &host.Window.Controller
ctrl.Available(0)
ctrl.Axis(0, hid.ControllerAxisLeftHorizontal) // -1..1

// Entities and transforms
e := engine.NewEntity(host.WorkGroup())        // engine/entity.go:55
e.Transform.SetPosition(matrix.NewVec3(x, y, z))
e.Transform.Position()                          // Vec3
e.Transform.SetScale(matrix.NewVec3(w, h, 1))

// Vectors — NOTE the exact names, they are not the conventional ones:
//   Vec2 has: Add, Subtract, Multiply, Divide, Scale, Length, Normal, Negative,
//             Abs, Distance, IsZero, X(), Y(), AsVec3()
//   Vec2 has NO LengthSquared (Vec3 does). Normalising is Normal(), NOT Normalized().
//   matrix.Float is the scalar type; matrix.Abs is generic.

// Camera
host.Cameras.Primary.Camera.SetPositionAndLookAt(eye, target)

// Renderer
host.RunOnRenderThread(func(device *rendering.GPUDevice) {
    device.SetSwapChainClearColor(palette.Paper())
})
```

---

## File structure

| File | Responsibility |
| --- | --- |
| `internal/arena/corruption.go` | Corruption radius model: advance, recede, containment test |
| `internal/arena/arena.go` | Fixed camera framing, world bounds, wiring corruption to render |
| `internal/actor/player.go` | Player state, movement, health |
| `internal/actor/enemy.go` | Enemy archetypes and steering |
| `internal/render/stain.go` | Stain material setup, per-frame corruption upload |
| `assets/shaders/src/boxstain.frag` | Corruption fragment shader |
| `assets/shaders/boxstain.shader` | Shader descriptor (`DrawInstanceData: "unlit"`) |
| `assets/materials/boxstain.material` | Material descriptor |
| `internal/weapon/weapon.go` | Weapon definitions and fire timers |
| `internal/weapon/projectile.go` | Pooled projectiles and collision |
| `internal/horde/spawner.go` | Spawn placement outside the safe zone |
| `internal/horde/director.go` | Wave schedule and composition |
| `internal/vfx/*.go` | Demo-specific effects atop `shared/juice` |
| `internal/progression/*.go` | XP, Directive cards, shop |

---

## Task 1: Corruption model

The spec's central mechanic. Pure logic with no engine dependency, so it is fully unit-testable and comes first.

**Files:**
- Create: `games/noise-floor/internal/arena/corruption.go`
- Test: `games/noise-floor/internal/arena/corruption_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Corruption struct`, `func NewCorruption(maxRadius, minRadius float32) *Corruption`, `(*Corruption) Advance(dt float64, pressure float32)`, `(*Corruption) Recede(dt float64)`, `(*Corruption) SafeRadius() float32`, `(*Corruption) Level() float32`, `(*Corruption) Contains(p matrix.Vec2) bool`, `(*Corruption) Reset()`.

`Level()` returns 0 (clean page) to 1 (fully consumed) and is what the shader consumes. `SafeRadius()` is the CPU-authoritative boundary — the shader decorates it, never defines it (spec §5.1).

- [ ] **Step 1: Write the failing test**

```go
package arena

import (
	"testing"

	"kaijuengine.com/matrix"
)

func TestStartsClean(t *testing.T) {
	c := NewCorruption(10, 2)
	if got := c.SafeRadius(); got != 10 {
		t.Fatalf("SafeRadius() = %v, want 10 (a fresh page is fully clean)", got)
	}
	if got := c.Level(); got != 0 {
		t.Fatalf("Level() = %v, want 0", got)
	}
}

func TestAdvanceShrinksSafeZone(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(1.0, 1.0)
	if got := c.SafeRadius(); got >= 10 {
		t.Fatalf("SafeRadius() = %v, want < 10 after advancing", got)
	}
	if got := c.Level(); got <= 0 {
		t.Fatalf("Level() = %v, want > 0 after advancing", got)
	}
}

func TestAdvanceClampsAtMinRadius(t *testing.T) {
	c := NewCorruption(10, 2)
	for range 1000 {
		c.Advance(1.0, 1.0)
	}
	if got := c.SafeRadius(); got != 2 {
		t.Fatalf("SafeRadius() = %v, want exactly 2 (clamped at min)", got)
	}
	if got := c.Level(); got != 1 {
		t.Fatalf("Level() = %v, want exactly 1 when fully corrupted", got)
	}
}

func TestRecedeRestoresTowardClean(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(3.0, 1.0)
	shrunk := c.SafeRadius()
	c.Recede(1.0)
	if got := c.SafeRadius(); got <= shrunk {
		t.Fatalf("SafeRadius() = %v, want > %v after receding", got, shrunk)
	}
}

func TestRecedeClampsAtMaxRadius(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(1.0, 1.0)
	for range 1000 {
		c.Recede(1.0)
	}
	if got := c.SafeRadius(); got != 10 {
		t.Fatalf("SafeRadius() = %v, want exactly 10 (clamped at max)", got)
	}
}

func TestContainsUsesSafeRadius(t *testing.T) {
	c := NewCorruption(10, 2)
	if !c.Contains(matrix.NewVec2(0, 0)) {
		t.Fatal("origin must be inside a clean page")
	}
	if !c.Contains(matrix.NewVec2(9.9, 0)) {
		t.Fatal("point just inside the radius must be contained")
	}
	if c.Contains(matrix.NewVec2(10.1, 0)) {
		t.Fatal("point outside the radius must not be contained")
	}
}

func TestPressureScalesAdvanceRate(t *testing.T) {
	slow := NewCorruption(10, 2)
	fast := NewCorruption(10, 2)
	slow.Advance(1.0, 0.5)
	fast.Advance(1.0, 2.0)
	if fast.SafeRadius() >= slow.SafeRadius() {
		t.Fatalf("higher pressure must shrink faster: fast=%v slow=%v",
			fast.SafeRadius(), slow.SafeRadius())
	}
}

func TestResetRestoresCleanPage(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(5.0, 1.0)
	c.Reset()
	if c.SafeRadius() != 10 || c.Level() != 0 {
		t.Fatalf("Reset() left radius=%v level=%v, want 10 and 0",
			c.SafeRadius(), c.Level())
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /ai/github/BOXGames && . scripts/env.sh && go test ./games/noise-floor/internal/arena/ -v`

Expected: FAIL — `undefined: NewCorruption`.

- [ ] **Step 3: Write the minimal implementation**

Create `games/noise-floor/internal/arena/corruption.go`:

```go
// Package arena owns the fixed single-screen play space: camera framing,
// bounds, and the corruption model that doubles as the arena boundary.
package arena

import "kaijuengine.com/matrix"

// Tuning constants. advanceRate is world units per second at pressure 1.0.
const (
	advanceRate = 0.6
	recedeRate  = 3.0
)

// Corruption is the shrinking safe zone that is simultaneously the difficulty
// curve and the art direction (design spec §1.1).
//
// The boundary is a plain radius owned here on the CPU. The fragment shader
// decorates it with noise but never defines it — see spec §5.1 for why
// bit-identical noise in Go and GLSL was rejected.
type Corruption struct {
	maxRadius float32
	minRadius float32
	radius    float32
}

func NewCorruption(maxRadius, minRadius float32) *Corruption {
	return &Corruption{
		maxRadius: maxRadius,
		minRadius: minRadius,
		radius:    maxRadius,
	}
}

// Advance eats the page inward. pressure scales the rate, letting the wave
// director push harder as a wave runs on.
func (c *Corruption) Advance(dt float64, pressure float32) {
	c.radius -= advanceRate * pressure * float32(dt)
	if c.radius < c.minRadius {
		c.radius = c.minRadius
	}
}

// Recede washes the page back toward cream, used on wave clear.
func (c *Corruption) Recede(dt float64) {
	c.radius += recedeRate * float32(dt)
	if c.radius > c.maxRadius {
		c.radius = c.maxRadius
	}
}

// SafeRadius is the CPU-authoritative boundary. Gameplay hit-tests this.
func (c *Corruption) SafeRadius() float32 { return c.radius }

// Level is 0 for a clean page and 1 for one fully consumed. This is the value
// handed to the stain shader.
func (c *Corruption) Level() float32 {
	span := c.maxRadius - c.minRadius
	if span <= 0 {
		return 0
	}
	return (c.maxRadius - c.radius) / span
}

// Contains reports whether a world point is still on clean paper.
func (c *Corruption) Contains(p matrix.Vec2) bool {
	return p.Length() <= c.radius
}

// Reset restores a clean page.
func (c *Corruption) Reset() { c.radius = c.maxRadius }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /ai/github/BOXGames && . scripts/env.sh && go test ./games/noise-floor/internal/arena/ -v`

Expected: PASS, all eight tests.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add games/noise-floor/internal/arena/
git commit -m "feat(arena): add CPU-authoritative corruption model"
```

---

## Task 2: Player movement

**Files:**
- Create: `games/noise-floor/internal/actor/player.go`
- Test: `games/noise-floor/internal/actor/player_test.go`

**Interfaces:**
- Consumes: nothing. **Deliberately does not import `arena`.**
- Produces: `type SafeZone interface`, `type MoveInput struct{ X, Y float32 }`, `func MoveDelta(in MoveInput, speed float32, dt float64) matrix.Vec2`, `func ClampToSafeZone(pos matrix.Vec2, z SafeZone) matrix.Vec2`, `type Player struct`, `func NewPlayer(host *engine.Host, speed float32) *Player`, `(*Player) Update(in MoveInput, z SafeZone, dt float64)`, `(*Player) Position() matrix.Vec2`.

**Import-cycle warning.** `arena` imports `actor` (Task 5 builds the Player), so `actor` must NOT import `arena` — Go rejects the cycle at compile time. `actor` therefore declares a small `SafeZone` interface that `*arena.Corruption` satisfies structurally. This is also what lets these tests run without constructing a Corruption at all.

Movement maths is separated from input reading so it is testable without a window. `Player.Update` takes an already-sampled `MoveInput`; the game layer reads the keyboard and fills it.

- [ ] **Step 1: Write the failing test**

```go
package actor

import (
	"testing"

	"kaijuengine.com/matrix"
)

// fakeZone stands in for *arena.Corruption. Depending on an interface rather
// than the concrete type is what keeps actor free of an import cycle.
type fakeZone struct{ radius float32 }

func (z fakeZone) SafeRadius() float32                { return z.radius }
func (z fakeZone) Contains(p matrix.Vec2) bool        { return p.Length() <= z.radius }

func TestMoveDeltaIsZeroWithNoInput(t *testing.T) {
	got := MoveDelta(MoveInput{}, 5, 1.0)
	if !got.IsZero() {
		t.Fatalf("MoveDelta with no input = %v, want zero", got)
	}
}

func TestMoveDeltaScalesBySpeedAndTime(t *testing.T) {
	got := MoveDelta(MoveInput{X: 1}, 5, 2.0)
	if got.X() != 10 {
		t.Fatalf("MoveDelta().X() = %v, want 10 (speed 5 * dt 2)", got.X())
	}
	if got.Y() != 0 {
		t.Fatalf("MoveDelta().Y() = %v, want 0", got.Y())
	}
}

// Diagonal input must not be faster than cardinal input — the classic bug.
func TestDiagonalMovementIsNormalized(t *testing.T) {
	cardinal := MoveDelta(MoveInput{X: 1}, 5, 1.0)
	diagonal := MoveDelta(MoveInput{X: 1, Y: 1}, 5, 1.0)
	const epsilon = 0.001
	if matrix.Abs(diagonal.Length()-cardinal.Length()) > epsilon {
		t.Fatalf("diagonal length %v != cardinal length %v",
			diagonal.Length(), cardinal.Length())
	}
}

func TestClampToSafeZoneLeavesInteriorAlone(t *testing.T) {
	c := fakeZone{radius: 10}
	pos := matrix.NewVec2(3, 4) // length 5, well inside
	if got := ClampToSafeZone(pos, c); !got.Equals(pos) {
		t.Fatalf("ClampToSafeZone(%v) = %v, want unchanged", pos, got)
	}
}

func TestClampToSafeZonePullsBackToBoundary(t *testing.T) {
	c := fakeZone{radius: 10}
	pos := matrix.NewVec2(30, 40) // length 50, far outside
	got := ClampToSafeZone(pos, c)
	const epsilon = 0.001
	if matrix.Abs(got.Length()-10) > epsilon {
		t.Fatalf("clamped length = %v, want 10 (the safe radius)", got.Length())
	}
	// Direction must be preserved: (30,40) normalises to (0.6,0.8).
	if matrix.Abs(got.X()-6) > epsilon || matrix.Abs(got.Y()-8) > epsilon {
		t.Fatalf("clamped to %v, want (6,8) — direction must be preserved", got)
	}
}

func TestClampToSafeZoneHandlesOrigin(t *testing.T) {
	c := fakeZone{radius: 10}
	// Normalising a zero vector divides by zero; the origin must be safe.
	got := ClampToSafeZone(matrix.NewVec2(0, 0), c)
	if got.IsNaN() {
		t.Fatal("ClampToSafeZone at the origin produced NaN")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /ai/github/BOXGames && . scripts/env.sh && go test ./games/noise-floor/internal/actor/ -v`

Expected: FAIL — `undefined: MoveDelta`.

- [ ] **Step 3: Write the minimal implementation**

Create `games/noise-floor/internal/actor/player.go`:

```go
// Package actor holds the player and enemy behaviours.
package actor

import (
	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
)

// SafeZone is the part of the corruption model movement needs. Declaring it
// here rather than importing arena avoids an import cycle: arena imports actor
// to build the Player, so actor must not import arena.
//
// *arena.Corruption satisfies this structurally; no declaration is needed there.
type SafeZone interface {
	SafeRadius() float32
	Contains(p matrix.Vec2) bool
}

// MoveInput is a sampled movement intent, each axis in -1..1. Keeping it
// separate from the keyboard lets movement be tested without a window.
type MoveInput struct {
	X, Y float32
}

// MoveDelta converts an intent into a world-space offset for this frame.
// Diagonals are normalised so they are not faster than cardinals.
func MoveDelta(in MoveInput, speed float32, dt float64) matrix.Vec2 {
	dir := matrix.NewVec2(in.X, in.Y)
	if dir.IsZero() {
		return matrix.Vec2Zero()
	}
	return dir.Normal().Scale(speed * float32(dt))
}

// ClampToSafeZone pulls a position back onto the corruption boundary,
// preserving direction. The safe zone is the play area; ink is death.
func ClampToSafeZone(pos matrix.Vec2, z SafeZone) matrix.Vec2 {
	if z.Contains(pos) {
		return pos
	}
	if pos.IsZero() {
		return pos // guard: normalising zero divides by zero
	}
	return pos.Normal().Scale(z.SafeRadius())
}

// Player is BX-77.
type Player struct {
	Entity *engine.Entity
	Speed  float32
	pos    matrix.Vec2
}

func NewPlayer(host *engine.Host, speed float32) *Player {
	return &Player{
		Entity: engine.NewEntity(host.WorkGroup()),
		Speed:  speed,
	}
}

// Update advances the player by one frame of already-sampled input.
func (p *Player) Update(in MoveInput, z SafeZone, dt float64) {
	p.pos = ClampToSafeZone(p.pos.Add(MoveDelta(in, p.Speed, dt)), z)
	// Sprites live in the XY plane; z carries draw order, never depth of field.
	p.Entity.Transform.SetPosition(matrix.NewVec3(p.pos.X(), p.pos.Y(), 0.1))
}

func (p *Player) Position() matrix.Vec2 { return p.pos }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /ai/github/BOXGames && . scripts/env.sh && go test ./games/noise-floor/internal/actor/ -v`

Expected: PASS, all six tests.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add games/noise-floor/internal/actor/
git commit -m "feat(actor): add player movement with safe-zone clamping"
```

---

## Task 3: Keyboard sampling

Bridges the engine's input to the testable `MoveInput`. Small, but it owns the only place raw key constants appear.

**Files:**
- Create: `games/noise-floor/internal/actor/input.go`
- Test: `games/noise-floor/internal/actor/input_test.go`

**Interfaces:**
- Consumes: `MoveInput` from Task 2.
- Produces: `type KeyState interface{ KeyHeld(key hid.KeyboardKey) bool }`, `func SampleMove(kb KeyState) MoveInput`.

Taking an interface rather than `*hid.Keyboard` is what makes this testable — a fake key state needs no window.

- [ ] **Step 1: Write the failing test**

```go
package actor

import (
	"testing"

	"kaijuengine.com/platform/hid"
)

// fakeKeys implements KeyState for tests, with no window required.
type fakeKeys map[hid.KeyboardKey]bool

func (f fakeKeys) KeyHeld(key hid.KeyboardKey) bool { return f[key] }

func TestSampleMoveNoKeys(t *testing.T) {
	got := SampleMove(fakeKeys{})
	if got.X != 0 || got.Y != 0 {
		t.Fatalf("SampleMove with no keys = %+v, want zero", got)
	}
}

func TestSampleMoveWASD(t *testing.T) {
	cases := []struct {
		name   string
		key    hid.KeyboardKey
		wantX  float32
		wantY  float32
	}{
		{"W is up", hid.KeyboardKeyW, 0, 1},
		{"S is down", hid.KeyboardKeyS, 0, -1},
		{"A is left", hid.KeyboardKeyA, -1, 0},
		{"D is right", hid.KeyboardKeyD, 1, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := SampleMove(fakeKeys{tc.key: true})
			if got.X != tc.wantX || got.Y != tc.wantY {
				t.Fatalf("SampleMove = %+v, want {X:%v Y:%v}", got, tc.wantX, tc.wantY)
			}
		})
	}
}

func TestSampleMoveArrowKeysMatchWASD(t *testing.T) {
	wasd := SampleMove(fakeKeys{hid.KeyboardKeyW: true})
	arrow := SampleMove(fakeKeys{hid.KeyboardKeyUp: true})
	if wasd != arrow {
		t.Fatalf("arrow %+v != wasd %+v", arrow, wasd)
	}
}

func TestSampleMoveOpposingKeysCancel(t *testing.T) {
	got := SampleMove(fakeKeys{hid.KeyboardKeyA: true, hid.KeyboardKeyD: true})
	if got.X != 0 {
		t.Fatalf("A+D held gave X=%v, want 0", got.X)
	}
}

func TestSampleMoveDiagonal(t *testing.T) {
	got := SampleMove(fakeKeys{hid.KeyboardKeyW: true, hid.KeyboardKeyD: true})
	if got.X != 1 || got.Y != 1 {
		t.Fatalf("W+D gave %+v, want {X:1 Y:1}", got)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /ai/github/BOXGames && . scripts/env.sh && go test ./games/noise-floor/internal/actor/ -run TestSampleMove -v`

Expected: FAIL — `undefined: SampleMove`.

- [ ] **Step 3: Write the minimal implementation**

Create `games/noise-floor/internal/actor/input.go`:

```go
package actor

import "kaijuengine.com/platform/hid"

// KeyState is the slice of the keyboard this package needs. Depending on an
// interface rather than *hid.Keyboard keeps input sampling testable without a
// window.
//
// KeyHeld is the continuous "is down right now" query, which is what movement
// wants. KeyDown and KeyUp are edge-triggered and fire for a single frame.
type KeyState interface {
	KeyHeld(key hid.KeyboardKey) bool
}

// SampleMove reads movement intent. Arrow keys mirror WASD, and opposing keys
// cancel. The result is un-normalised; MoveDelta handles that.
func SampleMove(kb KeyState) MoveInput {
	var in MoveInput
	if kb.KeyHeld(hid.KeyboardKeyW) || kb.KeyHeld(hid.KeyboardKeyUp) {
		in.Y++
	}
	if kb.KeyHeld(hid.KeyboardKeyS) || kb.KeyHeld(hid.KeyboardKeyDown) {
		in.Y--
	}
	if kb.KeyHeld(hid.KeyboardKeyD) || kb.KeyHeld(hid.KeyboardKeyRight) {
		in.X++
	}
	if kb.KeyHeld(hid.KeyboardKeyA) || kb.KeyHeld(hid.KeyboardKeyLeft) {
		in.X--
	}
	return in
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /ai/github/BOXGames && . scripts/env.sh && go test ./games/noise-floor/internal/actor/ -v`

Expected: PASS.

- [ ] **Step 5: Verify the real keyboard satisfies the interface**

Add to `games/noise-floor/internal/actor/input.go`:

```go
// Compile-time proof that the engine's keyboard satisfies KeyState.
var _ KeyState = (*hid.Keyboard)(nil)
```

Run: `cd /ai/github/BOXGames && . scripts/env.sh && go build ./games/noise-floor/...`

Expected: builds clean. If it fails, `hid.Keyboard.KeyHeld` has a value receiver — use `var _ KeyState = hid.Keyboard{}` instead.

- [ ] **Step 6: Commit**

```bash
cd /ai/github/BOXGames
git add games/noise-floor/internal/actor/
git commit -m "feat(actor): sample movement input from the keyboard"
```

---

## Remaining tasks

Tasks 4–14 are drafted below and finalised once the outstanding API research lands (sprite-sheet format and UI system). They are listed here so the shape of the whole plan is visible. **This summary is authoritative only for numbering; the expanded entries further down are the requirements.**

- **Task 4:** Stain shader re-authored in `assets/`, with `DrawInstanceData: "unlit"`, driven per-frame by `Corruption.Level()`.
- **Task 5:** Arena assembly — fixed camera, paper clear color, stain background, player wired to input. First playable: move BX-77 around a shrinking page.
- **Task 6:** Sprite animator in `shared/spritesheet` — the engine's own path is broken, see below.
- **Task 7:** Enemy archetypes and pooled spawning outside the safe zone.
- **Task 8:** Wave director — schedule, composition, clear detection, corruption recede on clear.
- **Task 9:** Weapons and pooled projectiles with independent fire timers.
- **Task 10:** Damage, health, death, and the juice layer (hit flash, knockback, shake, hit-stop, damage numbers).
- **Task 11:** XP gems with magnetism, levelling, Directive cards, RECALIBRATION shop.
- **Task 12:** Horde value treatment — gates all horde art generation.
- **Task 13:** Boss: Local Optimum.
- **Task 14:** Visual regression integration tests using the engine's screenshot and video capture.

---

## Engine constraints discovered during planning

Verified against the pinned checkout. These are not opinions — they change what the plan can do.

### The engine's world-sprite animation path is broken

`sprite.Sprite.InitSheet` is the only atlas-animation entry point for world sprites, and **it cannot load any clip that has frames**. `NewSheetFromBin` (`sprite_sheet.go:79-88`) passes frame fields to `streaming.StreamRead` **by value instead of by pointer**, and `binary.Read` rejects a non-pointer `int32`. Separately, the decoded `frame` is never stored into `clip.Frames[j]`, so even a successful read would yield all-zero frames.

Proven empirically — `shared/spritesheet/engine_limits_test.go` asserts the failure and will start failing (loudly, with instructions) if the engine is ever fixed:

```
NewSheetFromBin err = binary.Read: invalid type int32
```

`InitUVAnimation` is not an alternative: `AnimatedUV`'s fields are unexported with no public constructor, so `[]AnimatedUV` cannot be built from outside the `sprite` package.

`InitFlipBook` works but creates **one `rendering.Drawing`, material instance, and shader-data buffer per frame**, all resident every frame with only one activated. For hundreds of animated enemies that multiplies GPU-side records by frame count and blocks batching.

**Consequence — Task 6 builds our own animator in `shared/spritesheet`:** one `Sprite` per entity created with `InitFromTexture` against a shared atlas, animated by writing `ShaderDataUnlit.UVs` each frame. One drawing per entity, atlas shared across entities, and it gives us what the engine lacks anyway — per-clip fps, play-once clips, and clip-end callbacks (engine playback loops unconditionally, ignores the `Hold` field entirely, and has no end event).

**We do not edit `third_party/kaiju`.** Fixing it upstream is a separate contribution, not this plan.

### Sheet metadata format

Emit the schema `sprite.NewSheetFromJson` accepts, so our data stays engine-compatible if the bug is fixed:

```json
[
  {"Name": "idle", "Frames": [
    {"Hold": 6, "Rectangle": [0, 0, 32, 48]},
    {"Hold": 6, "Rectangle": [32, 0, 32, 48]}
  ]}
]
```

`Rectangle` is `[x, y, width, height]` in **atlas pixels, top-left origin**. Do not pre-normalise and do not pre-flip V — consumers convert to GPU UVs. The convention actually exercised in the engine is `<name>.png` beside `<name>.png.json`.

Conversion to GPU UVs (V flipped to bottom-left origin), as the engine does it:

```
u0 = x / texW
v0 = 1 - (y / texH) - (h / texH)
uw = w / texW
vh = h / texH
```

### UI findings

- `ui.Manager` registers on `host.UIUpdater`; `ui.Label`, `ui.Panel`, `ui.Button`, `ui.ProgressBar` are created via `uiMan.Add().ToLabel()` etc. then `Init(...)`.
- `ProgressBar.Init(fg, bg *rendering.Texture)` + `SetValue(0..1)` is a direct fit for health and XP bars.
- **There is no world→screen projection helper.** `cameras.Camera` exposes only the reverse (`RayCast`, `TryPlaneHit`). Floating damage numbers must project manually via `View()`/`Projection()`.
- The engine's 3D-text path (`MaterialDefinitionText3D`, `FontCache.RenderMeshes(is3D:true)`) exists but has **zero callers anywhere in the engine** — an unexercised primitive with no precedent to copy. Damage numbers use pooled UI `Label`s instead.
- `tweening.DoTween(&val, target, seconds, easing)` runs inside `Host.Update` and is a ready-made driver for arcs and fades.
- Markup (`markup.DocumentFromHTMLAsset` + `Document.DuplicateElement` + `onclick` funcMap) suits the shop's templated card grid. The HUD updates every frame and markup offers no data-rebind, so the HUD is built programmatically.

---

## Task 4: Stain shader in game assets

Re-authors the spike's shader where it belongs. Not a copy — the spike edited the engine tree, which this repo forbids.

**Files:**
- Create: `games/noise-floor/assets/shaders/src/boxstain.frag`
- Create: `games/noise-floor/assets/shaders/boxstain.shader`
- Create: `games/noise-floor/assets/materials/boxstain.material`

**Interfaces:**
- Consumes: nothing.
- Produces: asset keys `boxstain.material`, `boxstain.shader`, `boxstain.frag.spv`, consumed by Task 5.

- [ ] **Step 1: Write the fragment shader**

Create `games/noise-floor/assets/shaders/src/boxstain.frag`. Corruption level arrives per-instance in `fragColor.r`, so no new uniform plumbing is needed. `time` and `screenSize` are already in the engine's global uniform block.

```glsl
#version 460
#define FRAGMENT_SHADER

#define SAMPLER_COUNT 1

#define LAYOUT_FRAG_COLOR 0
#define LAYOUT_FRAG_TEX_COORDS 1
#define LAYOUT_FRAG_FLAGS 2
#define LAYOUT_FRAG_POS 3
#define LAYOUT_FRAG_NORMAL 4

#include "kaiju.glsl"

// Entropy staining the page. Corruption level arrives as fragColor.r.
// The CPU owns the true boundary radius; this only decorates it (spec 5.1).

const vec3 PAPER = vec3(0.957, 0.937, 0.894); // #F4EFE4
const vec3 INK   = vec3(0.090, 0.086, 0.106); // #17161B
const vec3 BRASS = vec3(0.647, 0.486, 0.200); // #A57C33
const vec3 VISOR = vec3(0.765, 0.227, 0.169); // #C33A2B

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0, 0)), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; ++i) {
        v += a * valueNoise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = fragTexCoords;
    float corruption = clamp(fragColor.r, 0.0, 1.0);

    vec2 q = uv * 4.0;
    float drift = time * 0.06;
    float n = fbm(q + vec2(drift, -drift * 0.7));
    n = mix(n, fbm(q * 2.3 - vec2(drift * 1.7, drift)), 0.45);

    // Edges rot first; the centre holds longest.
    float edge = length((uv - 0.5) * 2.0);
    float bias = smoothstep(0.15, 1.25, edge);
    float field = n * 0.6 + bias * 0.4;
    float t = 1.12 - corruption * 1.24;
    float stain = smoothstep(t, t + 0.22, field);

    vec3 col = mix(PAPER, INK, stain);

    // Crimson rim where the rot is actively eating.
    float rim = smoothstep(0.35, 0.5, stain) * (1.0 - smoothstep(0.5, 0.72, stain));
    col = mix(col, VISOR, rim * 0.85 * (0.35 + corruption));

    // Engraved hatch grid on clean paper, fading as it is consumed.
    vec2 g = fract(uv * 42.0);
    float hatch = min(smoothstep(0.0, 0.045, g.x), smoothstep(0.0, 0.045, g.y));
    col = mix(col, mix(col, BRASS, 0.16), (1.0 - hatch) * (1.0 - stain) * 0.55);

    // Paper tooth, so the clean field is never a flat fill.
    col += (hash(uv * 900.0) - 0.5) * 0.022 * (1.0 - stain);

    processFinalColor(vec4(col, 1.0));
}
```

- [ ] **Step 2: Write the shader descriptor**

Derive it from the engine's `unlit.shader` so the layout blocks match exactly, then override three fields. **`DrawInstanceData` must be `"unlit"`** — the global constraint above explains the silent failure otherwise.

```bash
cd /ai/github/BOXGames
python3 - <<'PY'
import json
src = "third_party/kaiju/src/editor/editor_embedded_content/editor_content/renderer/shaders/unlit.shader"
sh = json.load(open(src))
sh["Name"] = "boxstain"
sh["Fragment"] = "boxstain.frag"
sh["FragmentSpv"] = "boxstain.frag.spv"
sh["DrawInstanceData"] = "unlit"   # REQUIRED — empty falls back to the name -> "standard" -> no UVs
json.dump(sh, open("games/noise-floor/assets/shaders/boxstain.shader", "w"), separators=(",", ":"))

mat = json.load(open("third_party/kaiju/src/editor/editor_embedded_content/editor_content/renderer/materials/unlit.material"))
mat["Name"] = "boxstain"
mat["Shader"] = "boxstain.shader"
json.dump(mat, open("games/noise-floor/assets/materials/boxstain.material", "w"), separators=(",", ":"))
print("descriptors written")
PY
```

- [ ] **Step 3: Verify it compiles to valid SPIR-V**

Run:
```bash
./scripts/build-content.sh noise-floor
spirv-val games/noise-floor/content/boxstain.frag.spv && echo "SPIRV VALID"
```

Expected: `Built games/noise-floor/content (... 1 shaders compiled)` then `SPIRV VALID`.

- [ ] **Step 4: Verify DrawInstanceData survived**

Run:
```bash
cd /ai/github/BOXGames
python3 -c "import json;d=json.load(open('games/noise-floor/content/boxstain.shader'));print('DrawInstanceData =', repr(d['DrawInstanceData']));assert d['DrawInstanceData']=='unlit'"
```

Expected: `DrawInstanceData = 'unlit'`.

- [ ] **Step 5: Commit**

```bash
cd /ai/github/BOXGames
git add games/noise-floor/assets/
git commit -m "feat(render): add corruption stain shader"
```

---

## Task 5: Arena assembly — first playable

Wires Tasks 1–4 into something you can run and move around in. This is the first task whose deliverable is visible.

**Files:**
- Create: `games/noise-floor/internal/render/stain.go`
- Create: `games/noise-floor/internal/arena/arena.go`
- Modify: `games/noise-floor/cmd/noisefloor/main.go`

**Interfaces:**
- Consumes: `arena.Corruption`, `actor.Player`, `actor.SampleMove`, asset keys from Task 4.
- Produces: `func render.NewStain(host *engine.Host, width, height float32) (*render.Stain, error)`, `(*render.Stain) SetLevel(level float32)`, `func arena.New(host *engine.Host) (*Arena, error)`, `(*Arena) Update(dt float64)`.

- [ ] **Step 1: Write the stain renderer**

Create `games/noise-floor/internal/render/stain.go`:

```go
// Package render owns the corruption stain shader and material, sprite sheet
// binding, and draw ordering.
package render

import (
	"fmt"

	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
	"kaijuengine.com/registry/shader_data_registry"
	"kaijuengine.com/rendering"
	"kaijuengine.com/rendering/textures"
)

// Stain is the full-arena background quad running the boxstain shader.
type Stain struct {
	shaderData *shader_data_registry.ShaderDataUnlit
	entity     *engine.Entity
}

// NewStain creates the background quad. width and height are in world units and
// should over-cover the visible arena so the stain reaches the screen edges.
func NewStain(host *engine.Host, width, height float32) (*Stain, error) {
	mat, err := host.MaterialCache().Material("boxstain.material")
	if err != nil {
		return nil, fmt.Errorf("render: loading boxstain.material: %w", err)
	}
	tex, err := host.TextureCache().Texture("square.png", textures.TextureFilterLinear)
	if err != nil {
		return nil, fmt.Errorf("render: loading fallback texture: %w", err)
	}
	mat = mat.CreateInstance([]*rendering.Texture{tex})

	// The shader descriptor sets DrawInstanceData to "unlit", so this asserts
	// to ShaderDataUnlit. If this panics, that field was lost — see
	// docs/KAIJU-NOTES.md.
	sd, ok := shader_data_registry.Create(mat.Shader.DrawInstanceDataName()).(*shader_data_registry.ShaderDataUnlit)
	if !ok {
		return nil, fmt.Errorf(
			"render: boxstain resolved instance data %q, want \"unlit\"; check DrawInstanceData in the shader descriptor",
			mat.Shader.DrawInstanceDataName())
	}
	sd.Color = matrix.NewColor(0, 0, 0, 1) // .r carries corruption level
	sd.UVs = matrix.NewVec4(0, 0, 1, 1)

	e := engine.NewEntity(host.WorkGroup())
	e.Transform.SetPosition(matrix.NewVec3(0, 0, -3)) // behind all gameplay sprites
	e.Transform.SetScale(matrix.NewVec3(width, height, 1))

	host.Drawings.AddDrawing(rendering.Drawing{
		Material:   mat,
		Mesh:       rendering.NewMeshQuad(host.MeshCache()),
		ShaderData: sd,
		Transform:  &e.Transform,
		ViewCuller: &host.Cameras.Primary,
	})
	return &Stain{shaderData: sd, entity: e}, nil
}

// SetLevel uploads the corruption level, 0 (clean) to 1 (consumed).
func (s *Stain) SetLevel(level float32) {
	s.shaderData.Color = matrix.NewColor(level, 0, 0, 1)
}
```

- [ ] **Step 2: Write the arena**

Create `games/noise-floor/internal/arena/arena.go`:

```go
package arena

import (
	"fmt"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/shared/palette"

	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
	"kaijuengine.com/rendering"
)

// Arena framing. The camera never scrolls, so every sprite sits at a known
// scale (design spec 1). cameraZ frames roughly 26x15 world units at 16:9.
const (
	cameraZ       = 14.0
	stainWidth    = 26.0
	stainHeight   = 15.0
	safeRadiusMax = 6.5
	safeRadiusMin = 1.5
	playerSpeed   = 4.5
)

type Arena struct {
	host       *engine.Host
	Corruption *Corruption
	Player     *actor.Player
	stain      *render.Stain
	updateID   engine.UpdateId
}

func New(host *engine.Host) (*Arena, error) {
	host.RunOnRenderThread(func(device *rendering.GPUDevice) {
		device.SetSwapChainClearColor(palette.Paper())
	})
	host.Cameras.Primary.Camera.SetPositionAndLookAt(
		matrix.NewVec3(0, 0, cameraZ),
		matrix.NewVec3(0, 0, 0),
	)

	stain, err := render.NewStain(host, stainWidth, stainHeight)
	if err != nil {
		return nil, fmt.Errorf("arena: creating stain: %w", err)
	}

	a := &Arena{
		host:       host,
		Corruption: NewCorruption(safeRadiusMax, safeRadiusMin),
		Player:     actor.NewPlayer(host, playerSpeed),
		stain:      stain,
	}
	a.updateID = host.Updater.AddUpdate(a.Update)
	return a, nil
}

// Update advances one frame. Corruption advances continuously for now; the wave
// director takes over the pressure input in Task 7.
func (a *Arena) Update(dt float64) {
	a.Corruption.Advance(dt, 1.0)
	a.stain.SetLevel(a.Corruption.Level())
	a.Player.Update(actor.SampleMove(&a.host.Window.Keyboard), a.Corruption, dt)
}
```

- [ ] **Step 3: Wire it into Launch**

In `games/noise-floor/cmd/noisefloor/main.go`, replace the body of `Launch` after the `g.host = host` line with:

```go
func (g *Game) Launch(host *engine.Host) {
	g.host = host
	a, err := arena.New(host)
	if err != nil {
		slog.Error("noisefloor: failed to build the arena", "error", err)
		os.Exit(1)
	}
	g.arena = a
	slog.Info("NOISE FLOOR launched")
}
```

Add `arena *arena.Arena` to the `Game` struct, import
`"boxwrench.dev/boxgames/games/noisefloor/internal/arena"`, and delete the now-unused
camera and clear-color code from `Launch` (the arena owns both).

- [ ] **Step 4: Build and run**

Run: `cd /ai/github/BOXGames && make run GAME=noise-floor`

Expected: a cream window; the page darkens from the edges inward over ~10 seconds. WASD does not visibly move anything yet — the player has no sprite until Task 6 — but the log shows no errors.

**If the page is uniformly ink from frame one**, `DrawInstanceData` was lost: UVs collapsed to zero and the noise is constant. Re-check Task 4 Step 4.

- [ ] **Step 6: Commit**

```bash
cd /ai/github/BOXGames
git add games/noise-floor/
git commit -m "feat(arena): assemble arena with stain background and player"
```

---

## Remaining tasks (6-11)

These are specified but not yet expanded to step level. Expand each before execution.

**Task 6 — Sprite animator (`shared/spritesheet`).** Build `Clip`, `Atlas`, and `Animator`: load the JSON clip schema above, convert pixel rects to GPU UVs with the flip formula given, and drive `ShaderDataUnlit.UVs` on a single `sprite.Sprite` per entity. Support per-clip fps, play-once, and an on-end callback — all things the engine lacks. Unit-test UV conversion against hand-computed values, frame advance at a fixed dt, loop wrap, and play-once clamping. Placeholder atlas: generate a 4-frame flat-color strip with Pillow so the game is playable before real art exists.

**Task 7 — Enemies and spawning.** `actor.Enemy` with the five archetypes (Mote, Dendrite, Aberrant, Lancer, Overfit) differing in speed, health, size, and steering. `horde.Spawner` places them on a ring outside the safe radius using `shared/pool`. Unit-test that spawn positions are outside `Corruption.SafeRadius()`, that pool exhaustion is handled, and that Overfit's split produces the right count and positions.

**Task 8 — Wave director.** `horde.Director` owns the schedule: 8 waves, each a composition and duration, with corruption pressure rising through a wave and `Recede` on clear. Unit-test wave progression, clear detection, and that pressure is monotonic within a wave.

**Task 9 — Weapons and projectiles.** `weapon.Weapon` with independent fire timers; `weapon.Projectile` pooled, with collision against enemies. Six weapons per spec 3.1. Unit-test timer independence (a slow weapon must not skip when a fast one fires), pooled projectile reuse, and that damage applies once per projectile per target.

**Task 10 — Damage, death, and juice.** Health and damage application; then `shared/juice`: hit flash (~60ms white), knockback, screen shake scaled to damage, ~40ms hit-stop on kills, shard burst on death, and pooled UI `Label` damage numbers projected world→screen manually (no helper exists) and animated with `tweening.DoTween`. Unit-test the pure parts — flash timing, shake decay, hit-stop duration — with a fake clock.

**Task 11 — Progression and shop.** XP gems with magnetism toward the player, levelling curve, 12 Directive cards, and the RECALIBRATION shop between waves using the markup system (`markup.DocumentFromHTMLAsset` + `Document.DuplicateElement` for card templates + `onclick` funcMap). Unit-test the levelling curve and card-selection effects.

**Task 12 — Horde value treatment (spec §10 risk 1).** Resolve how noise entities stay readable once the ground inverts from cream to ink. Implement the chosen treatment — a light rim, or an emissive variant that engages as local corruption rises — and prove it with screenshots at corruption 0.0, 0.5 and 1.0. **The spec calls this the first implementation task**, and it gates Plan 2: generating a full horde before this is decided means regenerating all of it. Schedule it immediately after Task 7 introduces enemies, not at the end.

**Task 13 — Boss: Local Optimum (spec §8).** One boss for the final wave — a trap that must be escaped, per the lore mapping in spec §3. Distinct phases, a telegraphed attack, and a death sequence that washes the page clean.

**Task 14 — Visual regression.** Integration tests using the engine's screenshot and video capture, asserting known frames per system. Note this requires the `debug` build tag and registering tests in the engine's `tests` map — which lives in the engine tree, so this needs a game-side equivalent rather than editing `third_party`.
