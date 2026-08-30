package weapon

import (
	"boxwrench.dev/boxgames/shared/pool"
	"kaijuengine.com/matrix"
)

// Projectile is one shot in flight.
type Projectile struct {
	Pos    matrix.Vec2
	Vel    matrix.Vec2
	Damage int
	Life   float64 // seconds remaining
}

// Battery owns the projectile pool.
type Battery struct {
	pool *pool.Pool[Projectile]
}

// NewBattery builds a battery over a pool of the given capacity.
func NewBattery(capacity int) *Battery {
	return &Battery{pool: pool.New[Projectile](capacity, nil)}
}

// Fire launches a projectile from origin toward target at speed. ok is
// false when the pool is exhausted -- an expected condition, not an error.
//
// The heading is computed once, here, and never revisited: a projectile
// fired at a target that has since moved continues on its original
// heading. This weapon is not homing.
func (b *Battery) Fire(origin, target matrix.Vec2, speed float32, damage int, life float64) (handle int, ok bool) {
	item, h, ok := b.pool.Take()
	if !ok {
		return -1, false
	}
	dir := target.Subtract(origin)
	var vel matrix.Vec2
	if dir.IsZero() {
		vel = matrix.Vec2Zero() // guard: normalising zero divides by zero
	} else {
		vel = dir.Normal().Scale(speed)
	}
	item.Pos = origin
	item.Vel = vel
	item.Damage = damage
	item.Life = life
	return h, true
}

// Step advances every live projectile and expires those whose life runs
// out. expired is caller-supplied scratch, reused via expired[:0]+append the
// same way Arena's other per-frame scratch slices are, so this allocates
// nothing once warmed up. The returned slice holds the handles expired this
// call (thread it back in on the next call).
func (b *Battery) Step(dt float64, expired []int) []int {
	expired = expired[:0]
	b.pool.Each(func(h int, p *Projectile) {
		p.Pos = p.Pos.Add(p.Vel.Scale(float32(dt)))
		p.Life -= dt
		if p.Life <= 0 {
			expired = append(expired, h)
		}
	})
	for _, h := range expired {
		b.pool.Put(h)
	}
	return expired
}

// Each iterates live projectiles.
func (b *Battery) Each(fn func(handle int, p *Projectile)) {
	b.pool.Each(fn)
}

// Despawn returns a projectile to the pool.
func (b *Battery) Despawn(handle int) {
	b.pool.Put(handle)
}

// Live is the number of live projectiles.
func (b *Battery) Live() int { return b.pool.Live() }

// Available is the remaining capacity.
func (b *Battery) Available() int { return b.pool.Available() }
