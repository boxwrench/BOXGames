package arena

import (
	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/shared/spritesheet"
)

// spriteBank is the subset of *render.SpriteSet that hordeView needs.
// Declaring it as an interface (rather than using *render.SpriteSet
// directly) lets tests substitute a fake bank in place of a real,
// host-backed SpriteSet, which the engine cannot construct without a live
// GPU device.
type spriteBank interface {
	Acquire() (*render.Sprite, *spritesheet.Animator, bool)
	Release(*render.Sprite)
}

// enemyView is the rendering state for one live enemy, indexed by its
// horde.Spawner pool handle. It has no counterpart in the pure horde model
// because that model is pure logic with no rendering.
type enemyView struct {
	sprite *render.Sprite

	// animator is borrowed from the sprite's SpriteSet slot, not owned here
	// -- it shares the sprite's lifetime rather than being allocated fresh
	// per spawn, and Release returns both together by returning just the
	// sprite.
	animator *spritesheet.Animator

	// archetype records which SpriteSet this view's sprite was borrowed
	// from, so Release can return it without going through
	// horde.Spawner.Get(handle).Archetype -- which returns nil once the
	// handle is no longer live, i.e. exactly when Release needs it most.
	archetype actor.Archetype
}

// hordeView owns the sprites and animators that draw the horde. It borrows
// from a SpriteSet per archetype and returns them when an enemy dies.
type hordeView struct {
	spriteSets map[actor.Archetype]spriteBank
	enemyViews []enemyView
}

// newHordeView creates a hordeView over spriteSets (one bank per archetype)
// with a fixed per-handle slice of rendering state parallel to a
// horde.Spawner pool of the given capacity.
func newHordeView(spriteSets map[actor.Archetype]spriteBank, capacity int) *hordeView {
	return &hordeView{
		spriteSets: spriteSets,
		enemyViews: make([]enemyView, capacity),
	}
}

// Acquire borrows a sprite and animator for a newly spawned enemy at handle.
// ok is false when that archetype's bank is exhausted, which is expected --
// the caller is responsible for unwinding whatever else it holds for handle
// in that case (see Arena.spawnEnemy).
//
// The animator comes back already reset to the idle clip's first frame --
// SpriteSet.Acquire owns that reset -- so a slot recycled from a despawned
// enemy never resumes mid-animation from its previous occupant.
func (v *hordeView) Acquire(handle int, arch actor.Archetype) (ok bool) {
	sprite, animator, ok := v.spriteSets[arch].Acquire()
	if !ok {
		return false
	}
	v.enemyViews[handle] = enemyView{sprite: sprite, animator: animator, archetype: arch}
	return true
}

// Release returns an enemy's sprite and animator to its archetype's bank.
// Releasing a handle that was never acquired -- e.g. spawnEnemy's failure
// path, where the pool handle was taken but Acquire never succeeded -- is a
// safe no-op: enemyViews[handle] is still zero-valued, so there is no
// sprite to return.
func (v *hordeView) Release(handle int) {
	view := v.enemyViews[handle]
	if view.sprite != nil {
		v.spriteSets[view.archetype].Release(view.sprite)
	}
	v.enemyViews[handle] = enemyView{}
}

// Sync pushes position, frame and tint for every live enemy.
func (v *hordeView) Sync(dt float64, s *horde.Spawner, safeRadius float32) {
	s.Each(func(handle int, e *horde.Enemy) {
		view := &v.enemyViews[handle]
		view.animator.Update(dt)
		view.sprite.SetPosition(e.Pos)
		view.sprite.SetUVs(view.animator.UVs())
		view.sprite.SetColor(actorColor(e.Pos, safeRadius))
	})
}
