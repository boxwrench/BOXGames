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

// Ready reports whether the weapon would fire on its next Tick.
func (w *Weapon) Ready() bool {
	return w.timer >= w.spec.Cooldown
}

// Tick advances the cooldown and reports whether the weapon fires this
// frame. It fires at most once per Tick regardless of how large dt is: a
// long frame must not discharge a burst.
//
// The remainder past Cooldown is carried forward rather than dropped, so a
// frame that overshoots does not lose the excess and the effective fire
// rate does not drift with frame time. This mirrors the fix already made to
// the Lancer's phase timer (actor.LancerBrain.Update).
func (w *Weapon) Tick(dt float64) bool {
	w.timer += dt
	if w.timer < w.spec.Cooldown {
		return false
	}
	w.timer -= w.spec.Cooldown
	return true
}
