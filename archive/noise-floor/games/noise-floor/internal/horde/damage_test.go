package horde

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
)

func TestDamageReducesHealth(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Overfit, 10) // Health 5
	if !ok {
		t.Fatal("Spawn failed")
	}
	died := s.Damage(h, 2)
	if died {
		t.Fatal("Damage(2) on a 5-health enemy reported died=true, want false")
	}
	e := s.Get(h)
	if e.Health != 3 {
		t.Fatalf("Health after Damage(2) = %d, want 3", e.Health)
	}
}

func TestDamageReportsDeathExactlyOnce(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Mote, 10) // Health 1
	if !ok {
		t.Fatal("Spawn failed")
	}
	died := s.Damage(h, 5) // overkill
	if !died {
		t.Fatal("Damage(5) on a 1-health enemy reported died=false, want true")
	}
	// A second hit landing in the same frame on the already-dead enemy
	// must not report a second death -- otherwise later tasks would award
	// XP twice and play two death effects.
	diedAgain := s.Damage(h, 1)
	if diedAgain {
		t.Fatal("Damage on an already-dead enemy reported died=true a second time, want false")
	}
}

func TestDamageFalseWhileHealthRemains(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Dendrite, 10) // Health 12
	if !ok {
		t.Fatal("Spawn failed")
	}
	for i := 0; i < 11; i++ {
		if died := s.Damage(h, 1); died {
			t.Fatalf("Damage reported died=true after only %d damage on a 12-health enemy", i+1)
		}
	}
	e := s.Get(h)
	if e.Health != 1 {
		t.Fatalf("Health after 11 points of damage = %d, want 1", e.Health)
	}
	if died := s.Damage(h, 1); !died {
		t.Fatal("Damage reported died=false on the exact killing blow, want true")
	}
}

func TestDamageDoesNotDespawn(t *testing.T) {
	// Damage lives where health lives (horde), but despawn releases
	// sprites and animators, which horde must not know about -- the
	// caller despawns, not Damage.
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Mote, 10)
	if !ok {
		t.Fatal("Spawn failed")
	}
	s.Damage(h, 100)
	if s.Get(h) == nil {
		t.Fatal("enemy was despawned by Damage, want it to remain live until the caller despawns it")
	}
	if s.Live() != 1 {
		t.Fatalf("Live() after a killing Damage = %d, want 1 (still live until caller despawns)", s.Live())
	}
}

func TestDamageOnExhaustedHandleDoesNotPanic(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	if died := s.Damage(99, 5); died {
		t.Fatal("Damage on an invalid handle reported died=true, want false")
	}
}
