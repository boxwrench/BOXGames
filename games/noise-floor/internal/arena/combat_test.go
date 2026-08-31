package arena

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/weapon"

	"kaijuengine.com/matrix"
)

// --- refillTargets ----------------------------------------------------

// TestRefillTargetsHandleAtIndexMatchesTargetAtIndex is the mapping this
// task's brief calls out as the one most likely to damage the wrong enemy if
// it is wrong: for every i, handles[i] must be the pool handle that produced
// targets[i]. This test creates a persistent hole: it spawns 6 enemies then
// despawns one in the middle without replacement, so enumeration indices
// diverge from pool handles. Enumeration yields indices [0,1,2,3,4] for
// handles [0,2,3,4,5] -- if refillTargets wrongly used an enumeration counter
// instead of the real handle from Each's callback, it would report [0,1,2,3,4]
// for handles and the test would fail when verifying that each handle is live.
func TestRefillTargetsHandleAtIndexMatchesTargetAtIndex(t *testing.T) {
	s := horde.NewSpawner(8, rand.New(rand.NewSource(1)))
	var handles []int
	for i := 0; i < 6; i++ {
		h, ok := s.Spawn(actor.Mote, 10)
		if !ok {
			t.Fatalf("Spawn %d failed", i)
		}
		handles = append(handles, h)
	}
	// Despawn one in the middle (handle at index 1) and leave the hole empty.
	// This creates a persistent gap: live enemies are at handles [0,2,3,4,5],
	// but enumeration position != handle for all handles after the gap.
	s.Despawn(handles[1])

	targets := make([]weapon.Target, 0, 8)
	handleScratch := make([]int, 0, 8)
	targets, handleScratch = refillTargets(s, targets, handleScratch)

	if len(targets) != len(handleScratch) {
		t.Fatalf("len(targets)=%d, len(handles)=%d, want equal", len(targets), len(handleScratch))
	}
	if got := s.Live(); len(targets) != got {
		t.Fatalf("len(targets) = %d, want spawner.Live() = %d", len(targets), got)
	}
	// The crucial check: every handle must be live, and targets[i] must
	// actually correspond to handles[i]. If refillTargets wrongly used an
	// enumeration counter instead of the real handle, this will fail: the
	// second iteration (i=1) would have handle=1 (the hole), which is not live.
	for i, tgt := range targets {
		h := handleScratch[i]
		e := s.Get(h)
		if e == nil {
			t.Fatalf("handles[%d] = %d is not a live handle (persisted hole at handle 1)", i, h)
		}
		if tgt.Position() != e.Position() || tgt.Radius() != e.Radius() {
			t.Fatalf("targets[%d] = %+v does not correspond to handles[%d] = %d (enemy %+v)", i, tgt, i, h, e)
		}
	}
	// Verify the despawned handle does not appear.
	despawnedHandle := handles[1]
	for _, h := range handleScratch {
		if h == despawnedHandle {
			t.Fatalf("despawned handle %d should not appear in refilled handles", despawnedHandle)
		}
	}
}

// TestRefillTargetsReusesBackingArrays confirms the scratch slices are
// reused via [:0]+append rather than reallocated: refilling with fewer live
// enemies than a previous call must not leave stale entries past the new
// length, and the returned slices must be indistinguishable in cap when the
// same backing arrays are threaded through repeated calls.
func TestRefillTargetsReusesBackingArrays(t *testing.T) {
	s := horde.NewSpawner(8, rand.New(rand.NewSource(1)))
	h1, _ := s.Spawn(actor.Mote, 10)
	h2, _ := s.Spawn(actor.Mote, 10)

	targets := make([]weapon.Target, 0, 8)
	handles := make([]int, 0, 8)
	targets, handles = refillTargets(s, targets, handles)
	if len(targets) != 2 {
		t.Fatalf("len(targets) = %d, want 2", len(targets))
	}

	s.Despawn(h1)
	s.Despawn(h2)
	targets, handles = refillTargets(s, targets, handles)
	if len(targets) != 0 {
		t.Fatalf("len(targets) after despawning both = %d, want 0", len(targets))
	}
	if len(handles) != 0 {
		t.Fatalf("len(handles) after despawning both = %d, want 0", len(handles))
	}
}

// --- resolveHits --------------------------------------------------------

// TestResolveHitsKillReportsHandleDead covers a hit that finishes off an
// enemy: the projectile is despawned from the battery and the handle comes
// back in the died list.
func TestResolveHitsKillReportsHandleDead(t *testing.T) {
	s := horde.NewSpawner(4, rand.New(rand.NewSource(1)))
	b := weapon.NewBattery(4)
	h, ok := s.Spawn(actor.Mote, 10) // Mote health 1
	if !ok {
		t.Fatal("Spawn failed")
	}
	ph, ok := b.Fire(s.Get(h).Position(), s.Get(h).Position(), 1, 3, 10)
	if !ok {
		t.Fatal("Fire failed")
	}
	hits := []weapon.Hit{{Projectile: ph, TargetHandle: h, Damage: 3}}

	died := resolveHits(hits, []int{}, b, s)

	if len(died) != 1 || died[0] != h {
		t.Fatalf("died = %v, want [%d]", died, h)
	}
	if b.Live() != 0 {
		t.Fatalf("battery.Live() after resolveHits = %d, want 0 (projectile despawned)", b.Live())
	}
	if e := s.Get(h); e == nil || e.Health > 0 {
		t.Fatalf("enemy after lethal hit: %+v, want health <= 0 (still live in pool until despawnEnemy runs)", e)
	}
}

// TestResolveHitsNonLethalReportsNothing covers a hit that damages but does
// not kill: no handle should appear in died.
func TestResolveHitsNonLethalReportsNothing(t *testing.T) {
	s := horde.NewSpawner(4, rand.New(rand.NewSource(1)))
	b := weapon.NewBattery(4)
	h, ok := s.Spawn(actor.Dendrite, 10) // Dendrite health 12
	if !ok {
		t.Fatal("Spawn failed")
	}
	ph, ok := b.Fire(s.Get(h).Position(), s.Get(h).Position(), 1, 3, 10)
	if !ok {
		t.Fatal("Fire failed")
	}
	hits := []weapon.Hit{{Projectile: ph, TargetHandle: h, Damage: 3}}

	died := resolveHits(hits, []int{}, b, s)

	if len(died) != 0 {
		t.Fatalf("died = %v, want none (Dendrite survives 3 damage on 12 health)", died)
	}
	if e := s.Get(h); e == nil || e.Health != 9 {
		t.Fatalf("enemy health after non-lethal hit = %+v, want 9", e)
	}
}

// TestResolveHitsSameEnemyTwiceInOneFrameDiesOnce is the brief's third named
// case: two hits landing on the same enemy in the same frame (e.g. two
// projectiles converging) must report it dead exactly once, not twice --
// horde.Damage already guards this by checking Health <= 0, but the wiring
// here must not accidentally add its own duplicate.
func TestResolveHitsSameEnemyTwiceInOneFrameDiesOnce(t *testing.T) {
	s := horde.NewSpawner(4, rand.New(rand.NewSource(1)))
	b := weapon.NewBattery(4)
	h, ok := s.Spawn(actor.Mote, 10) // Mote health 1: the first hit alone kills.
	if !ok {
		t.Fatal("Spawn failed")
	}
	pos := s.Get(h).Position()
	ph1, ok := b.Fire(pos, pos, 1, 3, 10)
	if !ok {
		t.Fatal("Fire 1 failed")
	}
	ph2, ok := b.Fire(pos, pos, 1, 3, 10)
	if !ok {
		t.Fatal("Fire 2 failed")
	}
	hits := []weapon.Hit{
		{Projectile: ph1, TargetHandle: h, Damage: 3},
		{Projectile: ph2, TargetHandle: h, Damage: 3},
	}

	died := resolveHits(hits, []int{}, b, s)

	if len(died) != 1 {
		t.Fatalf("died = %v, want exactly one entry (reported dead once, not twice)", died)
	}
	if died[0] != h {
		t.Fatalf("died[0] = %d, want %d", died[0], h)
	}
	if b.Live() != 0 {
		t.Fatalf("battery.Live() after resolveHits = %d, want 0 (both projectiles despawned)", b.Live())
	}
}

// --- spawnOverfitSplits --------------------------------------------------
//
// The task-8b brief's SplitPositions wiring test: an Overfit death produces
// actor.SplitCount Motes at actor.SplitPositions' expected positions. These
// are extra spawns outside the wave director's release list, but they must
// count toward horde.Spawner.Live() -- spawnOverfitSplits achieves that for
// free by going through the same shared pool every other enemy uses.

// TestSpawnOverfitSplitsSpawnsMotesAtExpectedPositions confirms the split
// children are exactly actor.SplitCount live Motes, at exactly the positions
// actor.SplitPositions computes for the given death position.
func TestSpawnOverfitSplitsSpawnsMotesAtExpectedPositions(t *testing.T) {
	const capacity = 16
	bank := newFakeSpriteBank(8)
	a := &Arena{
		spawner:   horde.NewSpawner(capacity, rand.New(rand.NewSource(1))),
		hordeView: newHordeView(map[actor.Archetype]spriteBank{actor.Mote: bank}, capacity),
	}

	deathPos := matrix.NewVec2(3, 4)
	a.spawnOverfitSplits(deathPos)

	want := actor.SplitPositions(deathPos, actor.SplitRadius)
	if got := a.spawner.Live(); got != len(want) {
		t.Fatalf("spawner.Live() after spawnOverfitSplits = %d, want %d (actor.SplitCount)", got, len(want))
	}

	gotPositions := map[matrix.Vec2]int{}
	a.spawner.Each(func(handle int, e *horde.Enemy) {
		if e.Archetype != actor.Mote {
			t.Fatalf("split child archetype = %v, want Mote", e.Archetype)
		}
		gotPositions[e.Pos]++
	})
	for _, p := range want {
		if gotPositions[p] != 1 {
			t.Fatalf("expected exactly one split child at %v, got %d (all positions: %v)", p, gotPositions[p], gotPositions)
		}
	}
}

// TestSpawnOverfitSplitsSkipsSilentlyWhenBankExhausted confirms a split
// spawn that cannot acquire a sprite (archetype bank exhausted) is a silent
// skip -- the same expected-not-error condition spawnEnemy documents -- and
// does not panic or leave a half-acquired pool handle live without a view.
func TestSpawnOverfitSplitsSkipsSilentlyWhenBankExhausted(t *testing.T) {
	const capacity = 16
	bank := newFakeSpriteBank(1) // room for only one of SplitCount children
	a := &Arena{
		spawner:   horde.NewSpawner(capacity, rand.New(rand.NewSource(1))),
		hordeView: newHordeView(map[actor.Archetype]spriteBank{actor.Mote: bank}, capacity),
	}

	a.spawnOverfitSplits(matrix.NewVec2(0, 0))

	if got := a.spawner.Live(); got != 1 {
		t.Fatalf("spawner.Live() with a 1-slot bank = %d, want 1 (only the first child acquires a sprite; the rest are skipped)", got)
	}
}
