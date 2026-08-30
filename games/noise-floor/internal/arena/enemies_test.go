package arena

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
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

// --- clampSpawnTimer -------------------------------------------------------

// TestSpawnTimerDoesNotGrowUnboundedlyAtCap drives many frames with the
// horde at maxLiveEnemies and asserts the timer stays bounded rather than
// banking unlimited credit. Before this fix, spawnTimer += dt ran every
// frame regardless of shouldSpawn's live<max gate, so a long stretch at the
// cap (which nothing hits today, since nothing despawns, but which death --
// a later task -- will) would leave the timer arbitrarily large.
func TestSpawnTimerDoesNotGrowUnboundedlyAtCap(t *testing.T) {
	timer := 0.0
	const dt = 1.0 / 60.0
	for i := 0; i < 100000; i++ {
		timer += dt
		timer = clampSpawnTimer(timer, spawnInterval, maxLiveEnemies, maxLiveEnemies)
	}
	if timer > spawnInterval {
		t.Fatalf("spawn timer = %v after many frames at the live cap, want <= spawnInterval (%v): "+
			"the timer must not bank unlimited credit while spawning is blocked", timer, spawnInterval)
	}
}

// TestSpawnTimerProducesExactlyOneSpawnWhenSlotOpens banks as much credit as
// clampSpawnTimer allows while blocked at the cap, then opens exactly one
// slot and confirms only one spawn fires -- not a burst draining every
// frame's worth of banked time at once.
func TestSpawnTimerProducesExactlyOneSpawnWhenSlotOpens(t *testing.T) {
	timer := 0.0
	const dt = 1.0 / 60.0
	for i := 0; i < 100000; i++ {
		timer += dt
		timer = clampSpawnTimer(timer, spawnInterval, maxLiveEnemies, maxLiveEnemies)
	}

	live := maxLiveEnemies - 1 // one slot opens
	spawns := 0
	for shouldSpawn(timer, spawnInterval, live, maxLiveEnemies) {
		timer -= spawnInterval
		spawns++
		live++ // the spawn itself fills the slot back up
	}
	if spawns != 1 {
		t.Fatalf("slot opening produced %d spawns, want exactly 1 (not a burst)", spawns)
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

// --- despawnEnemy ----------------------------------------------------------

// fakeSpriteBank is a minimal spriteBank double. render.SpriteSet cannot be
// constructed in a unit test -- it needs a live, GPU-backed engine.Host,
// which nothing in this package's tests has -- so despawnEnemy's unwind
// logic is exercised against this fake instead. It tracks acquired/released
// *render.Sprite identities using zero-value Sprite pointers (new(render.Sprite)),
// which is safe here because the fake never calls any Sprite method -- it
// only compares pointer identity, the same way the real SpriteSet's free
// list only ever compares sp.index and sp pointer identity.
type fakeSpriteBank struct {
	capacity int
	live     map[*render.Sprite]bool
	released []*render.Sprite
}

func newFakeSpriteBank(capacity int) *fakeSpriteBank {
	return &fakeSpriteBank{capacity: capacity, live: make(map[*render.Sprite]bool)}
}

func (b *fakeSpriteBank) Acquire() (*render.Sprite, bool) {
	if len(b.live) >= b.capacity {
		return nil, false
	}
	sp := new(render.Sprite)
	b.live[sp] = true
	return sp, true
}

func (b *fakeSpriteBank) Release(sp *render.Sprite) {
	if !b.live[sp] {
		return
	}
	delete(b.live, sp)
	b.released = append(b.released, sp)
}

func (b *fakeSpriteBank) available() int { return b.capacity - len(b.live) }

// TestDespawnEnemyReturnsSpriteAndHandle spawns one enemy by hand (acquiring
// from the fake bank the same way spawnEnemy would) and confirms
// despawnEnemy returns both resources: the sprite goes back to its
// archetype's bank (releasing it and fully restoring the bank's
// availability), and the pool handle goes back to the spawner (Get returns
// nil and Live drops to 0).
func TestDespawnEnemyReturnsSpriteAndHandle(t *testing.T) {
	const arch = actor.Mote
	const capacity = 4
	bank := newFakeSpriteBank(2)

	a := &Arena{
		spawner:    horde.NewSpawner(capacity, rand.New(rand.NewSource(1))),
		spriteSets: map[actor.Archetype]spriteBank{arch: bank},
		enemyViews: make([]enemyView, capacity),
	}

	handle, ok := a.spawner.Spawn(arch, 10)
	if !ok {
		t.Fatal("spawner.Spawn failed unexpectedly")
	}
	sp, ok := bank.Acquire()
	if !ok {
		t.Fatal("bank.Acquire failed unexpectedly")
	}
	a.enemyViews[handle] = enemyView{sprite: sp, archetype: arch}

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
// exhausted, so enemyViews[handle] is still zero-valued (sprite == nil) when
// despawnEnemy runs. It must release the pool handle without touching any
// sprite bank.
func TestDespawnEnemyOnBareHandleOnlyReleasesPool(t *testing.T) {
	const arch = actor.Mote
	const capacity = 4
	bank := newFakeSpriteBank(2)

	a := &Arena{
		spawner:    horde.NewSpawner(capacity, rand.New(rand.NewSource(1))),
		spriteSets: map[actor.Archetype]spriteBank{arch: bank},
		enemyViews: make([]enemyView, capacity),
	}

	handle, ok := a.spawner.Spawn(arch, 10)
	if !ok {
		t.Fatal("spawner.Spawn failed unexpectedly")
	}
	// enemyViews[handle] is left zero-valued, as it would be if Acquire had
	// failed before spawnEnemy ever wrote to it.

	a.despawnEnemy(handle)

	if len(bank.released) != 0 {
		t.Fatalf("despawnEnemy released %v, want none: no sprite was ever acquired", bank.released)
	}
	if got := a.spawner.Live(); got != 0 {
		t.Fatalf("spawner.Live() after despawnEnemy = %d, want 0", got)
	}
}
