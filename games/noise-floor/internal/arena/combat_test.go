package arena

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/weapon"
)

// --- refillTargets ----------------------------------------------------

// TestRefillTargetsHandleAtIndexMatchesTargetAtIndex is the mapping this
// task's brief calls out as the one most likely to damage the wrong enemy if
// it is wrong: for every i, handles[i] must be the pool handle that produced
// targets[i]. It spawns several enemies, despawns one, and spawns a
// replacement so a pool slot is reused with a different enemy at the same
// handle before refilling -- the case a naive index==handle assumption would
// get right by accident and a real bug would not.
func TestRefillTargetsHandleAtIndexMatchesTargetAtIndex(t *testing.T) {
	s := horde.NewSpawner(8, rand.New(rand.NewSource(1)))
	var handles []int
	for i := 0; i < 4; i++ {
		h, ok := s.Spawn(actor.Mote, 10)
		if !ok {
			t.Fatalf("Spawn %d failed", i)
		}
		handles = append(handles, h)
	}
	// Despawn one and spawn a different archetype into the reused slot, so
	// refillTargets must reflect the CURRENT occupant, not a stale one.
	s.Despawn(handles[1])
	replacement, ok := s.Spawn(actor.Dendrite, 10)
	if !ok {
		t.Fatal("replacement Spawn failed")
	}

	targets := make([]weapon.Target, 0, 8)
	handleScratch := make([]int, 0, 8)
	targets, handleScratch = refillTargets(s, targets, handleScratch)

	if len(targets) != len(handleScratch) {
		t.Fatalf("len(targets)=%d, len(handles)=%d, want equal", len(targets), len(handleScratch))
	}
	if got := s.Live(); len(targets) != got {
		t.Fatalf("len(targets) = %d, want spawner.Live() = %d", len(targets), got)
	}
	for i, tgt := range targets {
		h := handleScratch[i]
		e := s.Get(h)
		if e == nil {
			t.Fatalf("handles[%d] = %d is not a live handle", i, h)
		}
		if tgt.Position() != e.Position() || tgt.Radius() != e.Radius() {
			t.Fatalf("targets[%d] = %+v does not correspond to handles[%d] = %d (enemy %+v)", i, tgt, i, h, e)
		}
	}
	// The reused slot's replacement (Dendrite) must appear, not the
	// despawned Mote that used to occupy it.
	foundReplacement := false
	for i, h := range handleScratch {
		if h == replacement {
			foundReplacement = true
			if targets[i].Radius() != actor.StatsFor(actor.Dendrite).Size {
				t.Fatalf("reused slot's target radius = %v, want Dendrite's %v", targets[i].Radius(), actor.StatsFor(actor.Dendrite).Size)
			}
		}
	}
	if !foundReplacement {
		t.Fatal("replacement handle not found in refilled handles -- reused slot missing from targets")
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
	handles := []int{h}
	hits := []weapon.Hit{{Projectile: ph, Target: 0, Damage: 3}}

	died := resolveHits(hits, handles, b, s)

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
	handles := []int{h}
	hits := []weapon.Hit{{Projectile: ph, Target: 0, Damage: 3}}

	died := resolveHits(hits, handles, b, s)

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
	handles := []int{h}
	hits := []weapon.Hit{
		{Projectile: ph1, Target: 0, Damage: 3},
		{Projectile: ph2, Target: 0, Damage: 3},
	}

	died := resolveHits(hits, handles, b, s)

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
