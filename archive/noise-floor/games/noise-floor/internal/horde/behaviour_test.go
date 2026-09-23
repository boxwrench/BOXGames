package horde

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"kaijuengine.com/matrix"
)

// stubZone is a minimal actor.SafeZone for testing without a real
// arena.Corruption -- a circle at the origin is enough, since that is what
// arena.Corruption is.
type stubZone struct {
	radius float32
}

func (z stubZone) SafeRadius() float32         { return z.radius }
func (z stubZone) Contains(p matrix.Vec2) bool { return p.Length() <= z.radius }

// --- clampArmed (moved from arena/enemies_test.go) --------------------------

func TestClampArmedNotClampedBeforeFirstEntry(t *testing.T) {
	zone := stubZone{radius: 5}
	outside := matrix.NewVec2(10, 0) // well outside the zone
	clamp, entered := clampArmed(false, outside, zone)
	if clamp {
		t.Fatal("clampArmed(never entered, outside) clamp = true, want false: " +
			"a freshly spawned enemy outside the safe zone must not be clamped " +
			"or it teleports onto the boundary at spawn")
	}
	if entered {
		t.Fatal("clampArmed(never entered, outside) entered = true, want false")
	}
}

func TestClampArmedClampedOnceEntered(t *testing.T) {
	zone := stubZone{radius: 5}
	outside := matrix.NewVec2(10, 0)
	clamp, entered := clampArmed(true, outside, zone)
	if !clamp {
		t.Fatal("clampArmed(already entered, outside) clamp = false, want true: " +
			"an enemy that has been inside the safe zone must be clamped even " +
			"if it is outside again this frame")
	}
	if !entered {
		t.Fatal("clampArmed(already entered, outside) entered = false, want true")
	}
}

func TestClampArmedLatchesPermanently(t *testing.T) {
	zone := stubZone{radius: 5}
	inside := matrix.NewVec2(1, 0)
	outside := matrix.NewVec2(10, 0)

	// First frame: enters the zone. Flag arms.
	_, entered := clampArmed(false, inside, zone)
	if !entered {
		t.Fatal("clampArmed(never entered, inside) entered = false, want true: entering should arm the flag")
	}

	// Second frame: walks back outside. The flag must stay armed and the
	// enemy must still be clamped -- entering once arms it permanently.
	clamp, entered := clampArmed(entered, outside, zone)
	if !clamp {
		t.Fatal("clampArmed after latching, now outside: clamp = false, want true (latch must persist)")
	}
	if !entered {
		t.Fatal("clampArmed after latching, now outside: entered = false, want true (latch must persist)")
	}
}

// --- Step -------------------------------------------------------------------

// TestStepNotClampedBeforeFirstEntryAndWalksInward drives several frames for
// an enemy spawned outside the zone and confirms it is never clamped (the
// entered latch never arms) while its distance from the centre steadily
// decreases as it walks in under its own steering.
func TestStepNotClampedBeforeFirstEntryAndWalksInward(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Mote, 5)
	if !ok {
		t.Fatal("spawn failed unexpectedly")
	}
	s.Get(h).Pos = matrix.NewVec2(10, 0) // deterministic start, well outside radius 5

	zone := stubZone{radius: 5}
	target := matrix.Vec2Zero()
	const dt = 1.0 / 60.0

	prevDist := s.Get(h).Pos.Length()
	for i := 0; i < 30; i++ {
		s.Step(dt, target, zone)
		e := s.Get(h)
		if e.entered {
			t.Fatalf("frame %d: entered latched true while still outside the zone (dist=%v, radius=%v)",
				i, e.Pos.Length(), zone.radius)
		}
		dist := e.Pos.Length()
		if dist >= prevDist {
			t.Fatalf("frame %d: distance from centre = %v, did not decrease from %v", i, dist, prevDist)
		}
		prevDist = dist
	}
}

// TestStepClampsPermanentlyOnceEntered confirms that once an enemy has been
// inside the zone, Step clamps it back onto the boundary from then on, even
// after it is moved back outside -- the latch is permanent.
func TestStepClampsPermanentlyOnceEntered(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Mote, 5)
	if !ok {
		t.Fatal("spawn failed unexpectedly")
	}
	zone := stubZone{radius: 5}
	target := matrix.Vec2Zero()
	const dt = 1.0 / 60.0

	// Start inside the zone so the first Step call latches entered.
	s.Get(h).Pos = matrix.NewVec2(1, 0)
	s.Step(dt, target, zone)
	e := s.Get(h)
	if !e.entered {
		t.Fatal("entered did not latch after a frame starting inside the zone")
	}

	// Push the enemy back outside by hand and step again: a latched enemy
	// must be pulled back onto the boundary, not left to wander free the
	// way a never-entered enemy would.
	s.Get(h).Pos = matrix.NewVec2(50, 0)
	s.Step(dt, target, zone)
	e = s.Get(h)
	if !e.entered {
		t.Fatal("entered flag un-latched after the enemy moved back outside; the latch must be permanent")
	}
	dist := e.Pos.Length()
	if matrix.Abs(dist-zone.radius) > 0.01 {
		t.Fatalf("clamped enemy distance from centre = %v, want ~%v (pulled back onto the boundary)", dist, zone.radius)
	}
}

// TestStepComputesVelocityFromStartOfFramePosition pins the ordering Step
// must preserve: velocity is computed from the position as of the start of
// the frame, before that frame's integration happens. A Lancer's trigger
// check is position-sensitive, so it makes an ordering bug observable: this
// test places the Lancer just outside its trigger range, with a large enough
// dt that the post-integration position would be well inside that range. If
// Step fed the post-integration position into steering instead of the
// frame-start position, the Lancer would enter its telegraph this same
// frame; it must not.
func TestStepComputesVelocityFromStartOfFramePosition(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Lancer, 100) // large safe radius: clamp never engages here
	if !ok {
		t.Fatal("spawn failed unexpectedly")
	}

	startDist := actor.LancerTriggerRange + 0.05 // just outside trigger range
	s.Get(h).Pos = matrix.NewVec2(startDist, 0)
	target := matrix.Vec2Zero()
	const dt = 1.0 // exaggerated so the ordering bug is measurable

	s.Step(dt, target, stubZone{radius: 100})

	e := s.Get(h)
	if e.Lancer.State() != actor.LancerCruise {
		t.Fatalf("Lancer state after one Step = %v, want LancerCruise: the trigger check must use the "+
			"frame's starting position (dist=%.2f > trigger range %.2f), not the post-integration position",
			e.Lancer.State(), startDist, actor.LancerTriggerRange)
	}
	wantX := startDist - actor.LancerCruiseSpeed*float32(dt)
	if matrix.Abs(e.Pos.X()-wantX) > 0.01 {
		t.Fatalf("Pos.X = %v, want %v (moved at cruise speed from the frame-starting position)", e.Pos.X(), wantX)
	}
}

// TestStepPreservesLancerChargeDirectionAcrossFrames drives a Lancer through
// its full cruise -> telegraph -> charge cycle using only Step, with the
// target moved far off to the side partway through. If Step (or a refactor
// of it) rebuilt the LancerBrain each frame instead of mutating it in place,
// or re-aimed on transition into Charge, the charge would bend toward the
// moved target; it must not -- the direction is locked the instant telegraph
// begins and stays locked through Charge, purely from state carried across
// Step calls.
func TestStepPreservesLancerChargeDirectionAcrossFrames(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Lancer, 100)
	if !ok {
		t.Fatal("spawn failed unexpectedly")
	}
	zone := stubZone{radius: 100}
	const dt = 0.05

	// Close enough to trigger the telegraph on the very first frame, locking
	// the charge direction toward the origin.
	s.Get(h).Pos = matrix.NewVec2(1, 0)
	s.Step(dt, matrix.Vec2Zero(), zone)
	e := s.Get(h)
	if e.Lancer.State() != actor.LancerTelegraph {
		t.Fatalf("Lancer state after trigger frame = %v, want LancerTelegraph", e.Lancer.State())
	}

	// Drive through the rest of telegraph into charge, moving the target far
	// to the side every subsequent frame.
	movedTarget := matrix.NewVec2(0, 500)
	const maxFrames = 1000
	frames := 0
	for e.Lancer.State() != actor.LancerCharge {
		s.Step(dt, movedTarget, zone)
		e = s.Get(h)
		frames++
		if frames > maxFrames {
			t.Fatalf("Lancer never reached LancerCharge within %d frames; stuck in state %v", maxFrames, e.Lancer.State())
		}
	}

	posAtChargeStart := e.Pos
	s.Step(dt, movedTarget, zone)
	e = s.Get(h)
	if e.Lancer.State() != actor.LancerCharge {
		t.Fatalf("Lancer state = %v mid-charge, want LancerCharge", e.Lancer.State())
	}
	moved := e.Pos.Subtract(posAtChargeStart)

	// The locked direction is (-1, 0), toward the original target (0,0)
	// from the spawn position (1,0). The charge must move that way, not
	// toward movedTarget (0, 500).
	if matrix.Abs(moved.Y()) > 0.01 {
		t.Fatalf("charge displacement = %v, want Y ~= 0: the locked direction must not bend toward the moved target", moved)
	}
	if moved.X() >= 0 {
		t.Fatalf("charge displacement.X = %v, want negative: still charging along the originally locked direction", moved.X())
	}
}

// TestStepNoLiveEnemiesIsNoop confirms Step is a safe no-op when nothing is
// alive.
func TestStepNoLiveEnemiesIsNoop(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	zone := stubZone{radius: 5}
	s.Step(1.0/60.0, matrix.Vec2Zero(), zone)
	if s.Live() != 0 {
		t.Fatalf("Live() = %d after Step with no live enemies, want 0", s.Live())
	}
}
