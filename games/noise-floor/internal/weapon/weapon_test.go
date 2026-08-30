package weapon

import "testing"

func TestWeaponFiresOnceCooldownElapses(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.5})
	if w.Tick(0.4) {
		t.Fatal("Tick(0.4) fired before cooldown elapsed")
	}
	if !w.Tick(0.1) {
		t.Fatal("Tick(0.1) after 0.4 accumulated did not fire at exactly cooldown")
	}
}

func TestWeaponAtMostOneShotPerTick(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.1})
	// dt is many times the cooldown -- must still only report firing once
	// per Tick call: the return value is a bool, never a burst count.
	if !w.Tick(10.0) {
		t.Fatal("Tick(10.0) with a 0.1s cooldown did not fire")
	}
	// The surplus time carries forward rather than being discarded, so the
	// weapon is immediately due again -- but each individual Tick call still
	// reports at most one shot.
	if !w.Ready() {
		t.Fatal("Ready() = false after a huge-dt Tick, want true: the surplus must carry forward, not be discarded")
	}
	if !w.Tick(0.0) {
		t.Fatal("Tick(0.0) right after a huge-dt Tick did not fire, want true: the carried remainder should let it fire again")
	}
}

func TestWeaponReadyReflectsNextTick(t *testing.T) {
	w := New(Spec{Name: "test", Cooldown: 0.5})
	if w.Ready() {
		t.Fatal("Ready() = true before any time has passed")
	}
	w.Tick(0.4)
	if w.Ready() {
		t.Fatal("Ready() = true before cooldown elapsed (0.4 < 0.5)")
	}
	w.Tick(0.1) // timer reaches exactly 0.5s; this Tick call fires
	if w.Ready() {
		t.Fatal("Ready() = true immediately after firing with zero remainder")
	}
	// Overshoot by more than a full cooldown in one Tick: it still only
	// fires once, but the surplus over Cooldown carries forward, so Ready()
	// must report the weapon as already due again.
	w.Tick(1.1)
	if !w.Ready() {
		t.Fatal("Ready() = false after an overshooting Tick left a carried remainder >= Cooldown, want true")
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
		if fast.Tick(dt) {
			fastShots++
		}
		if slow.Tick(dt) {
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
		if w.Tick(dt) {
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
	if !w.Tick(30.0) {
		t.Fatal("Tick(30.0) did not fire")
	}

	// Follow with normal-sized frames: 0.05 per frame (half the cooldown).
	// At normal cadence, the weapon should fire every ~2 frames.
	// Without capping: timer would be 29.9, firing every frame for all 50.
	// With capping: timer capped to 0.1, firing every ~2 frames for ~26 shots.
	shots := 0
	for i := 0; i < 50; i++ {
		if w.Tick(0.05) {
			shots++
		}
	}

	// With cap: expect ~26 shots (2 immediately from the overlap, then ~24 at normal cadence).
	// Without cap: expect ~50 shots (one per frame).
	// Threshold: 35 is well above normal cadence but below uncapped burst.
	if shots > 35 {
		t.Fatalf("After large Tick(30), got %d shots over 50 normal frames (want ~26), indicates burst not capped", shots)
	}
}
