package horde

import (
	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"kaijuengine.com/matrix"
)

// Position returns the enemy's current world position. This, plus Radius,
// is the part of Enemy that weapon.Target needs -- weapon does not import
// horde, so *Enemy satisfies weapon.Target structurally.
func (e *Enemy) Position() matrix.Vec2 { return e.Pos }

// Radius returns the enemy's collision radius, from its archetype's Size.
func (e *Enemy) Radius() float32 { return actor.StatsFor(e.Archetype).Size }

// Damage subtracts from an enemy's health and reports whether it died on
// this hit. It returns false for an enemy already at or below zero health,
// so a second hit landing in the same frame cannot report a second death --
// otherwise later tasks would award XP twice and play two death effects.
//
// Damage does not despawn. Despawn releases sprites and animators, which
// horde must not know about; the caller despawns after acting on died.
func (s *Spawner) Damage(handle int, amount int) (died bool) {
	e := s.pool.Get(handle)
	if e == nil {
		return false
	}
	if e.Health <= 0 {
		return false
	}
	e.Health -= amount
	return e.Health <= 0
}
