package actor

import "kaijuengine.com/matrix"

// ChaseVelocity steers straight at the target at the given speed. Returns a
// zero vector when already at the target, so nothing divides by zero.
func ChaseVelocity(pos, target matrix.Vec2, speed float32) matrix.Vec2 {
	toTarget := target.Subtract(pos)
	if toTarget.IsZero() {
		return matrix.Vec2Zero()
	}
	return toTarget.Normal().Scale(speed)
}

// StandoffDeadband is how close to the standoff distance is "close enough":
// without it an enemy sitting exactly on the boundary would flicker between
// approaching and retreating every frame as floating point noise nudges it
// back and forth across the line.
const StandoffDeadband float32 = 0.3

// StandoffVelocity closes to standoff distance and holds there: it approaches
// when further than standoff, retreats when closer, and is still inside a
// small deadband so it does not jitter on the boundary.
func StandoffVelocity(pos, target matrix.Vec2, speed, standoff float32) matrix.Vec2 {
	toTarget := target.Subtract(pos)
	if toTarget.IsZero() {
		return matrix.Vec2Zero()
	}
	dist := toTarget.Length()
	diff := dist - standoff
	if matrix.Abs(diff) <= StandoffDeadband {
		return matrix.Vec2Zero()
	}
	dir := toTarget.Normal()
	if diff > 0 {
		// Further than standoff: close the gap.
		return dir.Scale(speed)
	}
	// Closer than standoff: back off.
	return dir.Scale(-speed)
}

// LancerState is a Lancer's charge cycle.
type LancerState int

const (
	LancerCruise    LancerState = iota // drifting toward the player
	LancerTelegraph                    // stopped, winding up, direction locked
	LancerCharge                       // committed, straight line, cannot steer
)

// Lancer timing and speed constants (spec 3.2, Task 7a brief). Cruise is
// slower than the player; Charge is the only thing on the field faster than
// the player, which is what makes it read as dangerous — and it is
// telegraphed, which is what makes it fair.
const (
	LancerCruiseSpeed      float32 = 1.4
	LancerChargeSpeed      float32 = 7.0
	LancerTriggerRange     float32 = 6.0
	LancerTelegraphSeconds float32 = 0.45
	LancerChargeSeconds    float32 = 0.55
)

// LancerBrain is a Lancer's charge state machine. The zero value starts in
// LancerCruise, which is a valid initial state.
type LancerBrain struct {
	state     LancerState
	timer     float32
	direction matrix.Vec2 // locked when Telegraph begins; unused otherwise
}

// State reports the current phase.
func (l *LancerBrain) State() LancerState { return l.state }

// Update advances the brain by one frame and returns the frame's velocity.
//
// The charge direction is locked the instant Telegraph begins and is never
// recomputed from target during Telegraph or Charge — that lock is what
// makes the attack dodgeable, and re-aiming mid-charge would defeat the
// entire design of the enemy.
func (l *LancerBrain) Update(dt float64, pos, target matrix.Vec2) matrix.Vec2 {
	fdt := float32(dt)
	switch l.state {
	case LancerCruise:
		if pos.Distance(target) <= LancerTriggerRange {
			l.enterTelegraph(pos, target)
		}
	case LancerTelegraph:
		l.timer += fdt
		if l.timer >= LancerTelegraphSeconds {
			l.state = LancerCharge
			l.timer -= LancerTelegraphSeconds
		}
	case LancerCharge:
		l.timer += fdt
		if l.timer >= LancerChargeSeconds {
			l.state = LancerCruise
			l.timer -= LancerChargeSeconds
		}
	}

	switch l.state {
	case LancerTelegraph:
		return matrix.Vec2Zero()
	case LancerCharge:
		return l.direction.Scale(LancerChargeSpeed)
	default: // LancerCruise
		return ChaseVelocity(pos, target, LancerCruiseSpeed)
	}
}

// enterTelegraph locks the charge direction at the moment Telegraph begins.
func (l *LancerBrain) enterTelegraph(pos, target matrix.Vec2) {
	l.state = LancerTelegraph
	l.timer = 0
	toTarget := target.Subtract(pos)
	if toTarget.IsZero() {
		l.direction = matrix.Vec2Zero() // guard: normalising zero divides by zero
	} else {
		l.direction = toTarget.Normal()
	}
}
