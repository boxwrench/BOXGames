package horde

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/weapon"
	"kaijuengine.com/matrix"
)

// *Enemy must satisfy weapon.Target structurally -- weapon does not import
// horde, so this is the only place that can prove the fit compiles.
var _ weapon.Target = (*Enemy)(nil)

func TestEnemyPositionMatchesPos(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Mote, 10)
	if !ok {
		t.Fatal("Spawn failed")
	}
	e := s.Get(h)
	if !e.Position().Equals(e.Pos) {
		t.Fatalf("Position() = %v, want Pos %v", e.Position(), e.Pos)
	}
	e.Pos = matrix.NewVec2(3, 4)
	if !e.Position().Equals(matrix.NewVec2(3, 4)) {
		t.Fatalf("Position() = %v after Pos changed, want (3,4)", e.Position())
	}
}

func TestEnemyRadiusMatchesArchetypeSize(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	for _, a := range []actor.Archetype{actor.Mote, actor.Dendrite, actor.Aberrant, actor.Lancer, actor.Overfit} {
		h, ok := s.Spawn(a, 10)
		if !ok {
			t.Fatalf("Spawn(%v) failed", a)
		}
		e := s.Get(h)
		want := actor.StatsFor(a).Size
		if e.Radius() != want {
			t.Fatalf("%v.Radius() = %v, want %v", a.Name(), e.Radius(), want)
		}
		s.Despawn(h)
	}
}
