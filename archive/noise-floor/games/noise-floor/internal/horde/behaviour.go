package horde

import (
	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"kaijuengine.com/matrix"
)

// aberrantStandoff is the Aberrant's hold distance from its target (Task
// 7a brief archetype table: "Standoff at 5.0"). It is not exported by
// the actor package -- StandoffVelocity takes it as a parameter rather
// than baking it in -- so the archetype-to-steering wiring done here is
// the natural place to name it.
const aberrantStandoff float32 = 5.0

// enemyVelocity computes one enemy's steering velocity for this frame, using
// 7a's per-archetype steering assignment (Task 7a brief archetype table):
// Mote, Dendrite and Overfit chase; Aberrant holds standoff distance; Lancer
// runs its own cruise/telegraph/charge state machine.
func enemyVelocity(e *Enemy, target matrix.Vec2, dt float64) matrix.Vec2 {
	stats := actor.StatsFor(e.Archetype)
	switch e.Archetype {
	case actor.Aberrant:
		return actor.StandoffVelocity(e.Pos, target, stats.Speed, aberrantStandoff)
	case actor.Lancer:
		return e.Lancer.Update(dt, e.Pos, target)
	default:
		return actor.ChaseVelocity(e.Pos, target, stats.Speed)
	}
}

// clampArmed decides whether an enemy is clamped to the safe zone this
// frame, and returns the (possibly newly) latched "has ever entered" flag to
// store for next frame.
//
// Enemies spawn outside the safe zone by design and walk inward; clamping
// them from frame one would snap every enemy straight onto the boundary the
// instant it spawns, and the spawn ring outside the safe zone would never be
// visible. So an enemy is only clamped once it has entered the safe zone at
// least once -- and once that happens, the flag latches permanently for the
// rest of that enemy's life, even if it later walks back out.
func clampArmed(everEntered bool, pos matrix.Vec2, zone actor.SafeZone) (clamp, nowEntered bool) {
	nowEntered = everEntered || zone.Contains(pos)
	return nowEntered, nowEntered
}

// Step advances every live enemy by one frame: steering, integration, and
// safe-zone clamping. It does not spawn, despawn, or render.
//
// zone is the current safe area. Enemies spawn outside it and walk in, so an
// enemy is only clamped once it has been inside at least once; that latch is
// per-enemy and permanent.
//
// Ordering within the frame is deliberate and must not change: velocity is
// computed from the position as of the start of the frame, then the
// position is integrated, then the (now-updated) position is checked against
// the zone for clamping.
func (s *Spawner) Step(dt float64, target matrix.Vec2, zone actor.SafeZone) {
	s.Each(func(handle int, e *Enemy) {
		vel := enemyVelocity(e, target, dt)
		e.Pos = e.Pos.Add(vel.Scale(float32(dt)))

		clamp, entered := clampArmed(e.entered, e.Pos, zone)
		e.entered = entered
		if clamp {
			e.Pos = actor.ClampToSafeZone(e.Pos, zone)
		}
	})
}
