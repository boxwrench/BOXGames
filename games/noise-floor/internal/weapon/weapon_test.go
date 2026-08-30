package weapon

import "testing"

// tick mirrors the call site's pattern for tests that don't care about
// targeting: advance the timer and, if a shot is ready, consume it and
// report so. This lets most of the tests below read almost exactly like the
// old Tick-based tests while actually exercising Advance/Ready/Consume.
func tick(w *Weapon, dt float64) bool {
	w.Advance(dt)
	if w.Ready() {
		w.Consume()
		return true
	}
	return false
}

func TestWeaponFiresOnceCooldownElapses(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.5})
	if tick(w, 0.4) {
		t.Fatal("tick(0.4) fired before cooldown elapsed")
	}
	if !tick(w, 0.1) {
		t.Fatal("tick(0.1) after 0.4 accumulated did not fire at exactly cooldown")
	}
}

func TestWeaponAtMostOneShotPerAdvanceConsumeCycle(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.1})
	// dt is many times the cooldown -- must still only report firing once:
	// the return value is a bool, never a burst count.
	if !tick(w, 10.0) {
		t.Fatal("tick(10.0) with a 0.1s cooldown did not fire")
	}
	// The surplus time carries forward rather than being discarded, so the
	// weapon is immediately due again -- but each individual cycle still
	// reports at most one shot.
	if !w.Ready() {
		t.Fatal("Ready() = false after a huge-dt Advance+Consume, want true: the surplus must carry forward, not be discarded")
	}
	if !tick(w, 0.0) {
		t.Fatal("tick(0.0) right after a huge-dt cycle did not fire, want true: the carried remainder should let it fire again")
	}
}

func TestWeaponReadyReflectsPendingShot(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.5})
	if w.Ready() {
		t.Fatal("Ready() = true before any time has passed")
	}
	tick(w, 0.4)
	if w.Ready() {
		t.Fatal("Ready() = true before cooldown elapsed (0.4 < 0.5)")
	}
	tick(w, 0.1) // timer reaches exactly 0.5s; this cycle fires
	if w.Ready() {
		t.Fatal("Ready() = true immediately after firing with zero remainder")
	}
	// Overshoot by more than a full cooldown in one Advance: it still only
	// fires once, but the surplus over Cooldown carries forward, so Ready()
	// must report the weapon as already due again.
	tick(w, 1.1)
	if !w.Ready() {
		t.Fatal("Ready() = false after an overshooting Advance+Consume left a carried remainder >= Cooldown, want true")
	}
}

func TestTimerIndependence(t *testing.T) {
	// The plan's own named test: a fast weapon and a slow weapon run
	// together across many frames. The slow one must fire exactly on its
	// own schedule and never skip a beat because the fast one fired.
	fast := New(Spec{Name: "fast", Cooldown: 0.1})
	slow := New(Spec{Name: "slow", Cooldown: 1.0})

	const dt = 0.05
	const frames = 200 // 10 seconds of simulated time

	fastShots, slowShots := 0, 0
	for i := 0; i < frames; i++ {
		if tick(fast, dt) {
			fastShots++
		}
		if tick(slow, dt) {
			slowShots++
		}
	}

	wantFast := int(float64(frames) * dt / 0.1) // 100
	wantSlow := int(float64(frames) * dt / 1.0) // 10

	if fastShots != wantFast {
		t.Fatalf("fast weapon fired %d times, want %d", fastShots, wantFast)
	}
	if slowShots != wantSlow {
		t.Fatalf("slow weapon fired %d times over the same run, want %d -- slow weapon must not skip a beat because the fast one fired", slowShots, wantSlow)
	}
}

func TestCooldownCarriesRemainder(t *testing.T) {
	// An awkward dt that never divides evenly into Cooldown. If the
	// remainder were dropped instead of carried, the effective fire rate
	// would drift low over a long run.
	w := New(Spec{Name: "test", Cooldown: 0.3})
	const dt = 0.07 // 0.3 / 0.07 = 4.2857..., does not divide evenly
	const frames = 1000
	const simSeconds = float64(frames) * dt

	shots := 0
	for i := 0; i < frames; i++ {
		if tick(w, dt) {
			shots++
		}
	}

	want := simSeconds / 0.3
	diff := float64(shots) - want
	if diff < -1 || diff > 1 {
		t.Fatalf("shots = %d over %.2fs at cooldown 0.3s, want within 1 of %.2f (rate drifted with frame size)", shots, simSeconds, want)
	}
}

func TestWeaponBurstAfterLargeDeltaNotOnePerFrame(t *testing.T) {
	// After a catastrophic frame with a massive delta, the weapon must not
	// machine-gun for many frames. The remainder is clamped to at most one
	// Cooldown so subsequent normal frames follow the regular cadence.
	w := New(Spec{Name: "test", Cooldown: 0.1})

	// A massive delta that, if uncapped, would bank enough timer credit to
	// fire every frame for ~600 frames.
	if !tick(w, 30.0) {
		t.Fatal("tick(30.0) did not fire")
	}

	// Follow with normal-sized frames: 0.05 per frame (half the cooldown).
	// At normal cadence, the weapon should fire every ~2 frames.
	// Without capping: timer would be 29.9, firing every frame for all 50.
	// With capping: timer capped to 0.1, firing every ~2 frames for ~26 shots.
	shots := 0
	for i := 0; i < 50; i++ {
		if tick(w, 0.05) {
			shots++
		}
	}

	// With cap: expect ~26 shots (2 immediately from the overlap, then ~24 at normal cadence).
	// Without cap: expect ~50 shots (one per frame).
	// Threshold: 35 is well above normal cadence but below uncapped burst.
	if shots > 35 {
		t.Fatalf("After large tick(30), got %d shots over 50 normal frames (want ~26), indicates burst not capped", shots)
	}
}

// TestWeaponStaysReadyAcrossAdvanceCallsWithNoConsume is the bug-1
// regression test: with a combined Tick(dt), a caller that found no target
// in range still consumed the cooldown just by calling it, because Tick both
// accumulated and fired in one step. Advance/Ready/Consume must not have
// that failure mode -- a caller that calls Advance every frame but only
// calls Consume when it actually fires must not lose readiness on the
// frames it doesn't fire.
func TestWeaponStaysReadyAcrossAdvanceCallsWithNoConsume(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.5})
	w.Advance(0.5)
	if !w.Ready() {
		t.Fatal("Ready() = false after accumulating exactly one Cooldown")
	}

	// Simulate several frames where the caller finds no target in range and
	// therefore never calls Consume.
	for i := 0; i < 5; i++ {
		w.Advance(0.01)
		if !w.Ready() {
			t.Fatalf("Ready() = false after Advance(0.01) with no Consume call (frame %d); an unfired weapon must not lose its readiness", i)
		}
	}

	// The instant a target appears, the caller fires without having lost
	// anything to the frames spent with nothing in range.
	w.Consume()
	if w.Ready() {
		t.Fatal("Ready() = true immediately after Consume with no accumulated surplus")
	}
}

// TestWeaponFiresImmediatelyOnceTargetAppears is the scenario from the bug
// report itself: the weapon reaches Cooldown with nothing in range, and a
// target enters range a moment later. It must be able to fire right then --
// not wait out another full Cooldown for a shot that was never actually
// taken.
func TestWeaponFiresImmediatelyOnceTargetAppears(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.5})

	// t=0.00: cooldown reached, but nothing is in range -- the caller
	// checks Ready(), finds no target, and does not call Consume.
	w.Advance(0.5)
	if !w.Ready() {
		t.Fatal("weapon not ready at t=0.00 after accumulating a full Cooldown")
	}

	// t=0.01: a target enters range. Because the previous frame never
	// consumed the readiness, the weapon must be able to fire right now --
	// not at t=0.50, a full cooldown after the missed opportunity.
	w.Advance(0.01)
	if !w.Ready() {
		t.Fatal("weapon not ready at t=0.01, want ready: an unconsumed shot must not be lost")
	}
	w.Consume()
}
