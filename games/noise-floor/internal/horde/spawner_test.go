package horde

import (
	"math"
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"kaijuengine.com/matrix"
)

const spawnEpsilon = 0.01

func TestSpawnPositionsOutsideSafeRadius(t *testing.T) {
	safeRadii := []float32{5, 10, 25.5, 100}
	for _, safeRadius := range safeRadii {
		s := NewSpawner(64, rand.New(rand.NewSource(1)))
		for i := 0; i < 20; i++ {
			handle, ok := s.Spawn(actor.Mote, safeRadius)
			if !ok {
				t.Fatalf("Spawn failed unexpectedly at safeRadius=%v", safeRadius)
			}
			e := s.Get(handle)
			if e == nil {
				t.Fatalf("Get(%d) = nil right after Spawn", handle)
			}
			dist := e.Pos.Length()
			if dist <= safeRadius {
				t.Fatalf("spawn distance %v is not outside safeRadius %v", dist, safeRadius)
			}
			want := safeRadius + SpawnMargin
			if matrix.Abs(dist-want) > spawnEpsilon {
				t.Fatalf("spawn distance = %v, want %v (safeRadius + SpawnMargin)", dist, want)
			}
			s.Despawn(handle)
		}
	}
}

func TestSpawnPoolExhaustion(t *testing.T) {
	const capacity = 8
	s := NewSpawner(capacity, rand.New(rand.NewSource(1)))
	handles := make([]int, 0, capacity)
	for i := 0; i < capacity; i++ {
		h, ok := s.Spawn(actor.Mote, 10)
		if !ok {
			t.Fatalf("Spawn %d failed before pool was full", i)
		}
		handles = append(handles, h)
	}
	if s.Live() != capacity {
		t.Fatalf("Live() = %d, want %d", s.Live(), capacity)
	}
	if s.Available() != 0 {
		t.Fatalf("Available() = %d, want 0", s.Available())
	}

	_, ok := s.Spawn(actor.Mote, 10)
	if ok {
		t.Fatal("Spawn on a full pool returned ok=true, want false")
	}
	if s.Live() != capacity {
		t.Fatalf("Live() after exhausted spawn attempt = %d, want unchanged %d", s.Live(), capacity)
	}

	s.Despawn(handles[0])
	if s.Live() != capacity-1 {
		t.Fatalf("Live() after Despawn = %d, want %d", s.Live(), capacity-1)
	}
	if s.Available() != 1 {
		t.Fatalf("Available() after Despawn = %d, want 1", s.Available())
	}

	_, ok = s.Spawn(actor.Mote, 10)
	if !ok {
		t.Fatal("Spawn after Despawn returned ok=false, want true — Despawn should free a slot")
	}
	if s.Live() != capacity {
		t.Fatalf("Live() after respawn = %d, want %d", s.Live(), capacity)
	}
}

func TestSpawnAnglesVary(t *testing.T) {
	s := NewSpawner(256, rand.New(rand.NewSource(42)))
	angles := map[float64]bool{}
	for i := 0; i < 50; i++ {
		h, ok := s.Spawn(actor.Mote, 10)
		if !ok {
			t.Fatalf("Spawn %d failed", i)
		}
		e := s.Get(h)
		angle := math.Atan2(float64(e.Pos.Y()), float64(e.Pos.X()))
		// Round so float noise doesn't split one angle into many buckets.
		angles[math.Round(angle*1000)/1000] = true
	}
	if len(angles) < 10 {
		t.Fatalf("only %d distinct angles across 50 spawns, want spawn angles to vary widely", len(angles))
	}
}

func TestSpawnDeterministicWithSameSeed(t *testing.T) {
	s1 := NewSpawner(64, rand.New(rand.NewSource(7)))
	s2 := NewSpawner(64, rand.New(rand.NewSource(7)))
	for i := 0; i < 20; i++ {
		h1, ok1 := s1.Spawn(actor.Mote, 10)
		h2, ok2 := s2.Spawn(actor.Mote, 10)
		if ok1 != ok2 {
			t.Fatalf("spawn %d: ok1=%v ok2=%v", i, ok1, ok2)
		}
		p1 := s1.Get(h1).Pos
		p2 := s2.Get(h2).Pos
		if matrix.Abs(p1.X()-p2.X()) > spawnEpsilon || matrix.Abs(p1.Y()-p2.Y()) > spawnEpsilon {
			t.Fatalf("spawn %d: positions differ between same-seed spawners: %v vs %v", i, p1, p2)
		}
	}
}

func TestSpawnSetsArchetypeAndHealth(t *testing.T) {
	s := NewSpawner(4, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Dendrite, 10)
	if !ok {
		t.Fatal("Spawn failed")
	}
	e := s.Get(h)
	if e.Archetype != actor.Dendrite {
		t.Fatalf("Archetype = %v, want Dendrite", e.Archetype)
	}
	want := actor.StatsFor(actor.Dendrite).Health
	if e.Health != want {
		t.Fatalf("Health = %d, want %d", e.Health, want)
	}
}

func TestSpawnerEachVisitsAllLiveEnemies(t *testing.T) {
	s := NewSpawner(8, rand.New(rand.NewSource(1)))
	for i := 0; i < 5; i++ {
		if _, ok := s.Spawn(actor.Mote, 10); !ok {
			t.Fatalf("spawn %d failed", i)
		}
	}
	seen := 0
	s.Each(func(handle int, e *Enemy) {
		seen++
		if e == nil {
			t.Fatal("Each visited a nil enemy")
		}
	})
	if seen != 5 {
		t.Fatalf("Each visited %d enemies, want 5", seen)
	}
}

func TestDespawnRemovesFromEach(t *testing.T) {
	s := NewSpawner(8, rand.New(rand.NewSource(1)))
	h, ok := s.Spawn(actor.Mote, 10)
	if !ok {
		t.Fatal("Spawn failed")
	}
	s.Despawn(h)
	if s.Live() != 0 {
		t.Fatalf("Live() after Despawn = %d, want 0", s.Live())
	}
	s.Each(func(handle int, e *Enemy) {
		t.Fatalf("Each visited handle %d after it was despawned", handle)
	})
	if got := s.Get(h); got != nil {
		t.Fatalf("Get(%d) after Despawn = %v, want nil", h, got)
	}
}
