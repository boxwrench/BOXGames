package horde

import (
	"math"
	"math/rand"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/shared/pool"
	"kaijuengine.com/matrix"
)

// SpawnMargin is how far outside the safe radius enemies appear. Spawning in
// the corrupted region is deliberate: the noise comes out of the ink.
const SpawnMargin float32 = 1.5

// Enemy is one live horde member.
type Enemy struct {
	Archetype actor.Archetype
	Pos       matrix.Vec2
	Health    int
	Lancer    actor.LancerBrain // zero value is fine for non-Lancers

	// entered latches true the first time this enemy's position has been
	// inside the safe zone. See clampArmed in behaviour.go. This is
	// simulation state, not view state -- it decides Step's own clamping,
	// so it lives on the model rather than on any rendering side.
	entered bool
}

// Spawner owns the enemy pool and places new enemies on a ring outside the
// safe zone. It does not decide what or when to spawn — that is the wave
// director's job (Task 8).
type Spawner struct {
	pool *pool.Pool[Enemy]
	rng  *rand.Rand
}

// NewSpawner builds a spawner over a pool of the given capacity. rng is
// injected so spawn placement is deterministic under test.
func NewSpawner(capacity int, rng *rand.Rand) *Spawner {
	return &Spawner{
		pool: pool.New[Enemy](capacity, nil),
		rng:  rng,
	}
}

// Spawn places one enemy of the given archetype on the spawn ring for the
// current safe radius. Returns the pool handle. ok is false when the pool is
// exhausted — a full pool is an expected condition during a heavy wave, not
// an error, and the caller simply gets no enemy.
//
// The pool is taken before the ring angle is drawn from rng, not after: a
// failed Spawn must not consume rng state, or a spawner's positions would
// diverge from an identically-seeded one that never happened to attempt a
// spawn against a full pool.
func (s *Spawner) Spawn(a actor.Archetype, safeRadius float32) (handle int, ok bool) {
	item, h, ok := s.pool.Take()
	if !ok {
		return -1, false
	}
	angle := s.rng.Float64() * 2 * math.Pi
	radius := float64(safeRadius + SpawnMargin)
	pos := matrix.NewVec2(radius*math.Cos(angle), radius*math.Sin(angle))
	initEnemy(item, a, pos)
	return h, true
}

// SpawnAt places one enemy of the given archetype at an explicit position,
// bypassing the spawn ring entirely. It exists for enemies that appear as a
// result of gameplay rather than the wave director's composition -- an
// Overfit's split children, placed at actor.SplitPositions around its death
// position -- so it shares Spawn's pool-take and field-init logic without
// Spawn's ring placement (and without ever touching rng). ok is false when
// the pool is exhausted, the same expected, not-an-error condition as Spawn.
func (s *Spawner) SpawnAt(a actor.Archetype, pos matrix.Vec2) (handle int, ok bool) {
	item, h, ok := s.pool.Take()
	if !ok {
		return -1, false
	}
	initEnemy(item, a, pos)
	return h, true
}

// initEnemy is Spawn and SpawnAt's shared field-init step, run only after a
// successful pool.Take(); only the position comes from the caller.
func initEnemy(item *Enemy, a actor.Archetype, pos matrix.Vec2) {
	item.Archetype = a
	item.Pos = pos
	item.Health = actor.StatsFor(a).Health
	item.Lancer = actor.LancerBrain{}
	item.entered = false // a respawned slot must not inherit a stale latch
}

// Each iterates live enemies.
func (s *Spawner) Each(fn func(handle int, e *Enemy)) {
	s.pool.Each(fn)
}

// Get returns a live enemy by handle, or nil if the handle is not live.
func (s *Spawner) Get(handle int) *Enemy {
	return s.pool.Get(handle)
}

// Despawn returns an enemy to the pool.
func (s *Spawner) Despawn(handle int) {
	s.pool.Put(handle)
}

// Live is the number of live enemies.
func (s *Spawner) Live() int { return s.pool.Live() }

// Available is the remaining capacity.
func (s *Spawner) Available() int { return s.pool.Available() }
