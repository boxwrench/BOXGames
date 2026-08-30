package arena

import (
	"testing"

	"kaijuengine.com/matrix"
)

// --- shouldSpawn -------------------------------------------------------

func TestShouldSpawnFiresWhenTimerPastIntervalAndRoom(t *testing.T) {
	if !shouldSpawn(0.6, 0.6, 5, 40) {
		t.Fatal("shouldSpawn(timer==interval, room) = false, want true")
	}
	if !shouldSpawn(0.9, 0.6, 5, 40) {
		t.Fatal("shouldSpawn(timer>interval, room) = false, want true")
	}
}

func TestShouldSpawnDoesNotFireAtMaxLive(t *testing.T) {
	if shouldSpawn(1.0, 0.6, 40, 40) {
		t.Fatal("shouldSpawn(timer past interval, live==max) = true, want false")
	}
	if shouldSpawn(1.0, 0.6, 41, 40) {
		t.Fatal("shouldSpawn(timer past interval, live>max) = true, want false")
	}
}

func TestShouldSpawnDoesNotFireEarly(t *testing.T) {
	if shouldSpawn(0.3, 0.6, 0, 40) {
		t.Fatal("shouldSpawn(timer<interval) = true, want false")
	}
}

// --- clampArmed ----------------------------------------------------------

// stubZone is a minimal actor.SafeZone for testing clampArmed without a real
// Corruption.
type stubZone struct {
	radius float32
}

func (z stubZone) SafeRadius() float32         { return z.radius }
func (z stubZone) Contains(p matrix.Vec2) bool { return p.Length() <= z.radius }

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

// --- capacity agreement ---------------------------------------------------

// TestSpawnerCapacityMatchesArchetypeBanks guards the invariant the brief
// requires: the horde model's pool capacity must equal
// 5 * enemyCapacityPerArchetype, derived from the archetype list rather than
// a literal, so the model (horde.Spawner) and the rendering (one
// render.SpriteSet per archetype) can never drift apart.
func TestSpawnerCapacityMatchesArchetypeBanks(t *testing.T) {
	if len(enemyArchetypes) != 5 {
		t.Fatalf("len(enemyArchetypes) = %d, want 5 (Mote, Dendrite, Aberrant, Lancer, Overfit)", len(enemyArchetypes))
	}
	want := 5 * enemyCapacityPerArchetype
	if spawnerCapacity != want {
		t.Fatalf("spawnerCapacity = %d, want %d (5 * enemyCapacityPerArchetype)", spawnerCapacity, want)
	}
	if spawnerCapacity != len(enemyArchetypes)*enemyCapacityPerArchetype {
		t.Fatalf("spawnerCapacity = %d is not derived from len(enemyArchetypes) * enemyCapacityPerArchetype", spawnerCapacity)
	}
}
