package actor

import (
	"testing"

	"kaijuengine.com/matrix"
)

const steeringEpsilon = 0.01

// --- ChaseVelocity ---------------------------------------------------------

func TestChaseVelocityPointsAtTarget(t *testing.T) {
	pos := matrix.NewVec2(0, 0)
	target := matrix.NewVec2(10, 0)
	got := ChaseVelocity(pos, target, 3)
	if matrix.Abs(got.X()-3) > steeringEpsilon || matrix.Abs(got.Y()) > steeringEpsilon {
		t.Fatalf("ChaseVelocity = %v, want (3, 0)", got)
	}
}

func TestChaseVelocityMagnitudeEqualsSpeedRegardlessOfDistance(t *testing.T) {
	pos := matrix.NewVec2(0, 0)
	const speed = 5
	near := ChaseVelocity(pos, matrix.NewVec2(1, 0), speed)
	far := ChaseVelocity(pos, matrix.NewVec2(1000, 0), speed)
	if matrix.Abs(near.Length()-speed) > steeringEpsilon {
		t.Fatalf("near velocity magnitude = %v, want %v", near.Length(), speed)
	}
	if matrix.Abs(far.Length()-speed) > steeringEpsilon {
		t.Fatalf("far velocity magnitude = %v, want %v", far.Length(), speed)
	}
}

func TestChaseVelocityZeroAtTarget(t *testing.T) {
	pos := matrix.NewVec2(4, 4)
	got := ChaseVelocity(pos, pos, 5)
	if !got.IsZero() {
		t.Fatalf("ChaseVelocity at target = %v, want zero", got)
	}
	if got.IsNaN() {
		t.Fatal("ChaseVelocity at target produced NaN")
	}
}

// --- StandoffVelocity --------------------------------------------------------

func TestStandoffVelocityApproachesWhenFar(t *testing.T) {
	target := matrix.NewVec2(0, 0)
	pos := matrix.NewVec2(10, 0) // distance 10, standoff 5: well outside
	got := StandoffVelocity(pos, target, 2, 5)
	// Should move toward the target: negative X.
	if got.X() >= 0 {
		t.Fatalf("StandoffVelocity while far = %v, want negative X (approaching)", got)
	}
	if matrix.Abs(got.Length()-2) > steeringEpsilon {
		t.Fatalf("StandoffVelocity magnitude = %v, want speed 2", got.Length())
	}
}

func TestStandoffVelocityRetreatsWhenClose(t *testing.T) {
	target := matrix.NewVec2(0, 0)
	pos := matrix.NewVec2(1, 0) // distance 1, standoff 5: well inside
	got := StandoffVelocity(pos, target, 2, 5)
	// Should move away from the target: positive X.
	if got.X() <= 0 {
		t.Fatalf("StandoffVelocity while close = %v, want positive X (retreating)", got)
	}
	if matrix.Abs(got.Length()-2) > steeringEpsilon {
		t.Fatalf("StandoffVelocity magnitude = %v, want speed 2", got.Length())
	}
}

func TestStandoffVelocityZeroExactlyAtStandoff(t *testing.T) {
	target := matrix.NewVec2(0, 0)
	pos := matrix.NewVec2(5, 0) // distance exactly equals standoff
	got := StandoffVelocity(pos, target, 2, 5)
	if !got.IsZero() {
		t.Fatalf("StandoffVelocity at exact standoff = %v, want zero", got)
	}
}

func TestStandoffVelocityZeroInsideDeadband(t *testing.T) {
	target := matrix.NewVec2(0, 0)
	// Just inside the deadband on both sides of the standoff distance.
	inner := matrix.NewVec2(5-StandoffDeadband*0.5, 0)
	outer := matrix.NewVec2(5+StandoffDeadband*0.5, 0)
	if got := StandoffVelocity(inner, target, 2, 5); !got.IsZero() {
		t.Fatalf("StandoffVelocity just inside standoff = %v, want zero", got)
	}
	if got := StandoffVelocity(outer, target, 2, 5); !got.IsZero() {
		t.Fatalf("StandoffVelocity just outside standoff = %v, want zero", got)
	}
}

func TestStandoffVelocityNonZeroOutsideDeadband(t *testing.T) {
	target := matrix.NewVec2(0, 0)
	// Clearly beyond the deadband on both sides.
	far := matrix.NewVec2(5+StandoffDeadband*3, 0)
	near := matrix.NewVec2(5-StandoffDeadband*3, 0)
	if got := StandoffVelocity(far, target, 2, 5); got.IsZero() {
		t.Fatal("StandoffVelocity clearly outside standoff = zero, want nonzero (approach)")
	}
	if got := StandoffVelocity(near, target, 2, 5); got.IsZero() {
		t.Fatal("StandoffVelocity clearly inside standoff = zero, want nonzero (retreat)")
	}
}

func TestStandoffVelocityHandlesCoincidentPositions(t *testing.T) {
	// pos == target: direction is undefined. Must not produce NaN.
	p := matrix.NewVec2(3, 3)
	got := StandoffVelocity(p, p, 2, 5)
	if got.IsNaN() {
		t.Fatal("StandoffVelocity at coincident positions produced NaN")
	}
}

// --- Lancer charge cycle -----------------------------------------------------

func TestLancerCruisesOutsideTriggerRange(t *testing.T) {
	brain := &LancerBrain{}
	pos := matrix.NewVec2(0, 0)
	target := matrix.NewVec2(10, 0) // distance 10 > LancerTriggerRange (6.0)
	vel := brain.Update(0.1, pos, target)
	if brain.State() != LancerCruise {
		t.Fatalf("State() = %v, want LancerCruise", brain.State())
	}
	want := ChaseVelocity(pos, target, LancerCruiseSpeed)
	if matrix.Abs(vel.X()-want.X()) > steeringEpsilon || matrix.Abs(vel.Y()-want.Y()) > steeringEpsilon {
		t.Fatalf("cruise velocity = %v, want %v", vel, want)
	}
}

func TestLancerEntersTelegraphWithinTriggerRange(t *testing.T) {
	brain := &LancerBrain{}
	pos := matrix.NewVec2(0, 0)
	target := matrix.NewVec2(5, 0) // distance 5 <= LancerTriggerRange (6.0)
	vel := brain.Update(0.1, pos, target)
	if brain.State() != LancerTelegraph {
		t.Fatalf("State() = %v, want LancerTelegraph", brain.State())
	}
	if !vel.IsZero() {
		t.Fatalf("velocity on entering Telegraph = %v, want zero", vel)
	}
}

// TestLancerFullCycle drives a Lancer through Cruise -> Telegraph -> Charge ->
// Cruise with a fixed dt, asserting velocity is zero throughout Telegraph and
// has the charge speed's magnitude throughout Charge.
func TestLancerFullCycle(t *testing.T) {
	const dt = 0.05
	brain := &LancerBrain{}
	pos := matrix.NewVec2(0, 0)
	target := matrix.NewVec2(5, 0) // within trigger range

	vel := brain.Update(dt, pos, target)
	if brain.State() != LancerTelegraph {
		t.Fatalf("State() after first update = %v, want LancerTelegraph", brain.State())
	}
	if !vel.IsZero() {
		t.Fatalf("velocity entering Telegraph = %v, want zero", vel)
	}

	// Step through Telegraph. Velocity must stay zero the whole time.
	steps := 0
	for brain.State() == LancerTelegraph {
		vel = brain.Update(dt, pos, target)
		steps++
		if steps > 1000 {
			t.Fatal("Telegraph never transitioned to Charge")
		}
		if brain.State() == LancerTelegraph && !vel.IsZero() {
			t.Fatalf("velocity during Telegraph = %v, want zero", vel)
		}
	}
	if brain.State() != LancerCharge {
		t.Fatalf("State() after Telegraph = %v, want LancerCharge", brain.State())
	}
	if matrix.Abs(vel.Length()-LancerChargeSpeed) > steeringEpsilon {
		t.Fatalf("charge velocity magnitude = %v, want %v", vel.Length(), LancerChargeSpeed)
	}

	// Step through Charge. Velocity magnitude must stay at charge speed.
	steps = 0
	for brain.State() == LancerCharge {
		got := brain.Update(dt, pos, target)
		steps++
		if steps > 1000 {
			t.Fatal("Charge never transitioned back to Cruise")
		}
		if brain.State() == LancerCharge && matrix.Abs(got.Length()-LancerChargeSpeed) > steeringEpsilon {
			t.Fatalf("velocity during Charge = %v (len %v), want magnitude %v", got, got.Length(), LancerChargeSpeed)
		}
	}
	if brain.State() != LancerCruise {
		t.Fatalf("State() after Charge = %v, want LancerCruise", brain.State())
	}
}

// TestLancerDirectionLocksAtTelegraphStart is the important one: the charge
// direction must be fixed the instant Telegraph begins and must not change
// even if the target moves during Telegraph or Charge.
func TestLancerDirectionLocksAtTelegraphStart(t *testing.T) {
	const dt = 0.05
	brain := &LancerBrain{}
	pos := matrix.NewVec2(0, 0)
	target := matrix.NewVec2(5, 0) // locks a direction of (1, 0)

	brain.Update(dt, pos, target) // enters Telegraph, should lock direction toward (5,0)
	if brain.State() != LancerTelegraph {
		t.Fatalf("State() = %v, want LancerTelegraph", brain.State())
	}

	// Move the target during Telegraph — direction must not change.
	movedTarget := matrix.NewVec2(0, 5) // now "north" instead of "east"
	steps := 0
	for brain.State() == LancerTelegraph {
		brain.Update(dt, pos, movedTarget)
		steps++
		if steps > 1000 {
			t.Fatal("Telegraph never transitioned to Charge")
		}
	}
	if brain.State() != LancerCharge {
		t.Fatalf("State() = %v, want LancerCharge", brain.State())
	}

	// Charge velocity direction should be the ORIGINAL lock (1,0), not
	// toward the moved target (0,5).
	chargeVel := brain.Update(dt, pos, movedTarget)
	if matrix.Abs(chargeVel.X()-LancerChargeSpeed) > steeringEpsilon || matrix.Abs(chargeVel.Y()) > steeringEpsilon {
		t.Fatalf("charge velocity = %v, want (%v, 0) — direction should have locked at Telegraph start",
			chargeVel, LancerChargeSpeed)
	}

	// Move the target again during Charge — direction must still not change.
	movedAgain := matrix.NewVec2(-5, -5)
	if brain.State() == LancerCharge {
		chargeVel2 := brain.Update(dt, pos, movedAgain)
		if brain.State() == LancerCharge {
			if matrix.Abs(chargeVel2.X()-LancerChargeSpeed) > steeringEpsilon || matrix.Abs(chargeVel2.Y()) > steeringEpsilon {
				t.Fatalf("charge velocity mid-Charge with moved target = %v, want (%v, 0)",
					chargeVel2, LancerChargeSpeed)
			}
		}
	}
}
