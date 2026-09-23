package arena

import (
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/games/noisefloor/internal/weapon"
	"boxwrench.dev/boxgames/shared/spritesheet"
)

// projectileView owns the sprites that draw projectiles, addressed
// positionally by battery handle.
//
// A projectile battery's pool handles are dense indices in
// [0, capacity), matching a SpriteSet's own slot indices one for one, so a
// projectile's sprite can be addressed directly by its battery handle via
// SpriteSet.At rather than by acquiring and releasing through the free
// list. That sidesteps a real mismatch: weapon.Battery.Step expires
// projectiles whose Life has run out internally and reports no handles for
// it, so a second Acquire/Release lifecycle here could never stay in
// lockstep with the battery's own pool. Sprites are addressed positionally
// by battery handle for their whole lifetime; visibility is synced directly
// by Sync every frame instead, and Fired resets a slot's animator itself
// when a shot reuses it, since At bypasses Acquire's own reset.
type projectileView struct {
	sprites   []*render.Sprite
	animators []*spritesheet.Animator
	live      []bool
}

// newProjectileView creates a projectileView addressing capacity slots of
// set positionally via At, hiding every sprite up front -- re-shown per
// frame by Sync for whichever slots are live.
func newProjectileView(set *render.SpriteSet, capacity int) *projectileView {
	v := &projectileView{
		sprites:   make([]*render.Sprite, capacity),
		animators: make([]*spritesheet.Animator, capacity),
		live:      make([]bool, capacity),
	}
	for i := 0; i < capacity; i++ {
		sp, an := set.At(i)
		sp.Hide() // re-shown per frame by Sync for whichever slots are live
		v.sprites[i] = sp
		v.animators[i] = an
	}
	return v
}

// resetProjectileAnimator restarts handle's animator on projectileClip. It
// exists because projectile sprites are addressed positionally (see the
// type doc comment) rather than acquired through SpriteSet.Acquire, which is
// what normally resets a reused slot's animator to frame 0 -- without this,
// a slot recycled from an earlier, expired shot would resume mid-animation
// instead of starting fresh. Invisible today on projectileClip's 4-frame
// looping idle clip, but load-bearing the moment a shot gets its own spawn
// or impact clip.
func resetProjectileAnimator(an *spritesheet.Animator) {
	_ = an.Play(projectileClip) // projectileClip was already validated by buildCombat's own Play call, so this cannot fail
}

// Fired resets the animator for a newly fired projectile at handle.
func (v *projectileView) Fired(handle int) {
	resetProjectileAnimator(v.animators[handle])
}

// Sync shows live projectiles at their positions and hides the rest --
// including a slot that was live last frame and has since despawned (by
// collision, or by expiring inside Battery.Step, which reports no handles
// for that). Full resync every frame, rather than tracking a delta, is what
// makes that second case correct without Battery exposing which handles it
// expired.
func (v *projectileView) Sync(dt float64, b *weapon.Battery, safeRadius float32) {
	for i := range v.live {
		v.live[i] = false
	}
	b.Each(func(handle int, p *weapon.Projectile) {
		v.live[handle] = true
		an := v.animators[handle]
		sp := v.sprites[handle]
		an.Update(dt)
		sp.SetPosition(p.Pos)
		sp.SetUVs(an.UVs())
		sp.SetColor(actorColor(p.Pos, safeRadius))
		sp.Show()
	})
	for i, live := range v.live {
		if !live {
			v.sprites[i].Hide()
		}
	}
}
