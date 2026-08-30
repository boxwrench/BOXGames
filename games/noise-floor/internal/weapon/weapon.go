package weapon

// Spec is a weapon's fixed identity.
type Spec struct {
	Name     string
	Cooldown float64 // seconds between shots
	Damage   int
	Speed    float32 // projectile world units per second
	Range    float32 // max target distance; beyond this it does not fire
}

// Weapon is one live weapon with its own independent timer.
//
// Spec 3.1 puts six weapon slots on screen at once, each firing on its own
// schedule -- so each Weapon owns its own timer and they never share state.
// A slow weapon must not skip a beat because a fast one fired.
type Weapon struct {
	spec  Spec
	timer float64 // seconds accumulated since the last shot
}

// New builds a weapon from a spec, ready to start accumulating time toward
// its first shot.
func New(s Spec) *Weapon {
	return &Weapon{spec: s}
}

// Spec returns the weapon's fixed identity.
func (w *Weapon) Spec() Spec { return w.spec }

// Ready reports whether a shot is available.
func (w *Weapon) Ready() bool {
	return w.timer >= w.spec.Cooldown
}

// Advance accumulates elapsed time toward the next shot. It never consumes
// it and never decides whether to fire -- call it every frame regardless of
// whether a shot is actually taken this frame.
//
// This matters when no target is in range: the caller checks Ready(), finds
// nothing to fire at, and simply does not call Consume. Because Advance by
// itself never spends anything, that unconsumed readiness is not lost -- the
// weapon is still ready the instant a target appears, rather than only after
// another full Cooldown. (A single combined Tick(dt) that both accumulated
// and consumed on every call could not make this distinction: it fired,
// and therefore consumed, whether or not the caller actually took the
// shot.)
func (w *Weapon) Advance(dt float64) {
	w.timer += dt
}

// Consume spends one shot's worth of cooldown. Call it only when a shot is
// actually fired.
//
// The remainder past Cooldown is carried forward rather than dropped, so a
// frame that overshoots does not lose the excess and the effective fire
// rate does not drift with frame time. This mirrors the fix already made to
// the Lancer's phase timer (actor.LancerBrain.Update).
//
// The carried remainder is then clamped to at most one Cooldown. This
// caps not just a single catastrophic-dt frame but also a long stretch
// with no target in range: Advance may have banked far more than one
// Cooldown's worth of credit by the time Consume finally runs, and without
// this clamp that credit would survive the subtraction and let the weapon
// fire again immediately, and again, for many frames -- a burst. Clamping
// means at most one immediate make-up shot before the weapon resumes its
// normal schedule.
func (w *Weapon) Consume() {
	w.timer -= w.spec.Cooldown
	if w.timer > w.spec.Cooldown {
		w.timer = w.spec.Cooldown
	}
}
