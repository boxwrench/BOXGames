package arena

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
)

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

// --- despawnEnemy ----------------------------------------------------------
//
// fakeSpriteBank, the spriteBank double these tests and hordeView's own
// tests share, lives in horde_view_test.go.

// TestDespawnEnemyReturnsSpriteAndHandle spawns one enemy by hand (acquiring
// via hordeView.Acquire the same way spawnEnemy would) and confirms
// despawnEnemy returns both resources: the sprite goes back to its
// archetype's bank (releasing it and fully restoring the bank's
// availability), and the pool handle goes back to the spawner (Get returns
// nil and Live drops to 0).
func TestDespawnEnemyReturnsSpriteAndHandle(t *testing.T) {
	const arch = actor.Mote
	const capacity = 4
	bank := newFakeSpriteBank(2)

	a := &Arena{
		spawner:   horde.NewSpawner(capacity, rand.New(rand.NewSource(1))),
		hordeView: newHordeView(map[actor.Archetype]spriteBank{arch: bank}, capacity),
	}

	handle, ok := a.spawner.Spawn(arch, 10)
	if !ok {
		t.Fatal("spawner.Spawn failed unexpectedly")
	}
	if ok := a.hordeView.Acquire(handle, arch); !ok {
		t.Fatal("hordeView.Acquire failed unexpectedly")
	}
	// The one sprite currently live in the bank -- captured by identity so
	// the released-sprite assertion below can confirm despawnEnemy returned
	// exactly this one, not merely "a" sprite.
	var sp *render.Sprite
	for k := range bank.live {
		sp = k
	}

	if got := bank.available(); got != 1 {
		t.Fatalf("bank.available() after one Acquire = %d, want 1", got)
	}

	a.despawnEnemy(handle)

	if got := bank.available(); got != 2 {
		t.Fatalf("bank.available() after despawnEnemy = %d, want 2 (full capacity restored)", got)
	}
	if len(bank.released) != 1 || bank.released[0] != sp {
		t.Fatalf("despawnEnemy released %v, want exactly the sprite that was acquired (%p)", bank.released, sp)
	}
	if got := a.spawner.Get(handle); got != nil {
		t.Fatalf("spawner.Get(handle) after despawnEnemy = %v, want nil: the pool handle must be released", got)
	}
	if got := a.spawner.Live(); got != 0 {
		t.Fatalf("spawner.Live() after despawnEnemy = %d, want 0", got)
	}
}

// TestDespawnEnemyOnBareHandleOnlyReleasesPool covers spawnEnemy's other
// failure path: the pool handle was taken but the sprite bank was
// exhausted, so hordeView's enemyViews[handle] is still zero-valued (sprite
// == nil) when despawnEnemy runs. It must release the pool handle without
// touching any sprite bank.
func TestDespawnEnemyOnBareHandleOnlyReleasesPool(t *testing.T) {
	const arch = actor.Mote
	const capacity = 4
	bank := newFakeSpriteBank(2)

	a := &Arena{
		spawner:   horde.NewSpawner(capacity, rand.New(rand.NewSource(1))),
		hordeView: newHordeView(map[actor.Archetype]spriteBank{arch: bank}, capacity),
	}

	handle, ok := a.spawner.Spawn(arch, 10)
	if !ok {
		t.Fatal("spawner.Spawn failed unexpectedly")
	}
	// hordeView's enemyViews[handle] is left zero-valued, as it would be if
	// Acquire had never been called for it -- exactly spawnEnemy's failure
	// path when the sprite bank is exhausted.

	a.despawnEnemy(handle)

	if len(bank.released) != 0 {
		t.Fatalf("despawnEnemy released %v, want none: no sprite was ever acquired", bank.released)
	}
	if got := a.spawner.Live(); got != 0 {
		t.Fatalf("spawner.Live() after despawnEnemy = %d, want 0", got)
	}
}
