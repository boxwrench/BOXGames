package arena

import (
	"fmt"

	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/games/noisefloor/internal/weapon"
	"boxwrench.dev/boxgames/shared/spritesheet"

	"kaijuengine.com/engine"
)

// Combat sizing.
//
// projectileCapacity bounds the shared projectile battery and its sprite
// bank. 64 is ample: one weapon firing every 0.5s with a 9-unit range at
// 16 units/s means a shot is in flight for well under a second, so even a
// sustained volley never approaches double digits of live projectiles at
// once.
//
// projectileSize is the projectile sprite's world-unit scale and,
// following the same convention actor.Stats.Size uses for enemies (the same
// value doubles as render.NewSprite's quad scale and weapon.Target's
// collision radius), the projectileRadius passed to weapon.Collide too.
const (
	projectileCapacity         = 64
	projectileSize     float32 = 0.25

	// projectileTextureKey is the sidecar key used to look up the
	// projectile's atlas in the content database (see
	// games/noise-floor/assets/sheets/shot.png.json), following the same
	// convention playerTextureKey does. It is not necessarily the texture
	// actually bound -- see buildCombat's comment on atlas.Image.
	projectileTextureKey = "shot.png"

	// projectileClip is the only animation clip a shot plays. Named so
	// buildCombat's NewSpriteSet call and updateCombat's per-fire reset (see
	// resetProjectileAnimator) cannot drift apart.
	projectileClip = "idle"

	// projectileLifeMargin multiplies the time a shot needs to cross the
	// weapon's full Range at its Speed, so a shot fired at maximum range
	// still has room to reach a target that has closed distance since the
	// shot committed to its heading (it does not home -- see weapon.Fire).
	// Too little margin would expire shots short of the range they were
	// aimed within; this is generous rather than tight because an
	// early-expiring shot is a visible correctness bug and a late one costs
	// nothing but a few extra Step calls on an already-tiny pool.
	projectileLifeMargin = 1.5
)

// buildCombat wires up the weapon, its projectile battery, and the
// projectile sprite bank. Called once from New, after buildHorde, so
// spawnerCapacity (used to size the target scratch slices) is already known.
func (a *Arena) buildCombat(host *engine.Host) error {
	a.weapon = weapon.New(weapon.PrecisionEscalation)
	a.battery = weapon.NewBattery(projectileCapacity)

	atlas, err := loadActorAtlas(host, projectileTextureKey, "shot")
	if err != nil {
		return err
	}
	// atlas.Image, not projectileTextureKey, is the texture actually bound:
	// the sidecar is the single source of truth for which image its UVs
	// were authored against, so a renamed image inside the sidecar is
	// caught here instead of silently loading stale art under the old name
	// -- same convention buildHorde follows for enemy atlases.
	set, err := render.NewSpriteSet(host, atlas.Image, projectileSize, projectileCapacity, atlas, projectileClip)
	if err != nil {
		return fmt.Errorf("arena: creating sprite set for shot: %w", err)
	}

	// The projectile battery's pool handles are dense indices in
	// [0, projectileCapacity), matching the SpriteSet's own slot indices one
	// for one, so a projectile's sprite can be addressed directly by its
	// battery handle via SpriteSet.At rather than by acquiring and releasing
	// through the free list. That sidesteps a real mismatch: Battery.Step
	// expires projectiles whose Life has run out internally and reports no
	// handles for it, so a second Acquire/Release lifecycle here could never
	// stay in lockstep with the battery's own pool. Sprites are addressed
	// positionally by battery handle for their whole lifetime; visibility is
	// synced directly by syncProjectiles every frame instead (see below),
	// and updateCombat resets a slot's animator itself when a shot reuses it
	// (see resetProjectileAnimator) since At bypasses Acquire's own reset.
	a.projectileSprites = make([]*render.Sprite, projectileCapacity)
	a.projectileAnimators = make([]*spritesheet.Animator, projectileCapacity)
	a.projectileLive = make([]bool, projectileCapacity)
	for i := 0; i < projectileCapacity; i++ {
		sp, an := set.At(i)
		sp.Hide() // re-shown per frame by syncProjectiles for whichever slots are live
		a.projectileSprites[i] = sp
		a.projectileAnimators[i] = an
	}

	a.targets = make([]weapon.Target, 0, spawnerCapacity)
	a.targetHandles = make([]int, 0, spawnerCapacity)
	a.died = make([]int, 0, spawnerCapacity)
	return nil
}

// refillTargets rebuilds the frame's live-target list from the spawner,
// reusing the given backing arrays via [:0]+append so this allocates nothing
// once warmed up. handles[i] is the pool handle that produced targets[i] --
// weapon.NearestTarget returns an index into targets, and handles is what
// turns that index back into the handle Damage and despawnEnemy need. This
// is a pure function over its arguments (no Arena field access) precisely so
// it can be tested without a GPU-backed engine.Host.
func refillTargets(spawner *horde.Spawner, targets []weapon.Target, handles []int) ([]weapon.Target, []int) {
	targets = targets[:0]
	handles = handles[:0]
	spawner.Each(func(handle int, e *horde.Enemy) {
		targets = append(targets, e)
		handles = append(handles, handle)
	})
	return targets, handles
}

// resolveHits applies each collision hit: despawns its projectile and
// damages the enemy it struck. hit.TargetHandle is already the horde pool
// handle -- weapon.Collide was given targetHandles alongside targets and
// reports it back directly, so there is no frame-local index left to
// translate here (contrast the old Hit.Target, an index into targets/
// handles that only meant anything for the frame that built them). It
// returns the handles that died as a result, reusing the passed-in died
// slice via [:0]+append to avoid allocation.
//
// horde.Damage reports died at most once per enemy -- it returns false for
// an enemy already at or below zero health -- so two hits landing on the
// same enemy in one frame still report exactly one death here; this function
// adds no death path of its own, it only relays what Damage already
// guarantees.
func resolveHits(hits []weapon.Hit, died []int, battery *weapon.Battery, spawner *horde.Spawner) []int {
	died = died[:0]
	for _, hit := range hits {
		battery.Despawn(hit.Projectile)
		if spawner.Damage(hit.TargetHandle, hit.Damage) {
			died = append(died, hit.TargetHandle)
		}
	}
	return died
}

// resetProjectileAnimator restarts handle's animator on projectileClip. It
// exists because projectile sprites are addressed positionally (see
// buildCombat) rather than acquired through SpriteSet.Acquire, which is what
// normally resets a reused slot's animator to frame 0 -- without this, a
// slot recycled from an earlier, expired shot would resume mid-animation
// instead of starting fresh. Invisible today on projectileClip's 4-frame
// looping idle clip, but load-bearing the moment a shot gets its own
// spawn or impact clip.
func resetProjectileAnimator(an *spritesheet.Animator) {
	_ = an.Play(projectileClip) // projectileClip was already validated by buildCombat's own Play call, so this cannot fail
}

// updateCombat runs the fire -> move -> collide -> damage -> die loop for
// one frame. Called after updateHorde, so damage resolves after the horde's
// motion this frame: at 60fps a shot (speed 16) covers 0.27 world units per
// frame, comfortably under the tightest radius sum in play (Mote 0.35 +
// projectile 0.25 = 0.6), so it does not tunnel through an enemy within a
// single frame -- but that is a framerate-dependent assumption, not a
// guarantee: the margin is gone by ~24fps (0.67 units/frame), and there is
// no swept collision check backing it up. A hit despawns its projectile
// before that projectile is drawn (syncProjectiles runs last), so a dead
// shot never renders for one extra frame.
func (a *Arena) updateCombat(dt float64) {
	a.targets, a.targetHandles = refillTargets(a.spawner, a.targets, a.targetHandles)

	spec := a.weapon.Spec()
	a.weapon.Advance(dt)
	if a.weapon.Ready() {
		if idx, ok := weapon.NearestTarget(a.Player.Position(), a.targets, spec.Range); ok {
			life := float64(spec.Range/spec.Speed) * projectileLifeMargin
			// Fire can report ok=false if the battery pool is exhausted.
			// At projectileCapacity (64) against the sustained-volley
			// ceiling documented above (Combat sizing), that is not
			// reachable in practice, but it is still handled rather than
			// assumed away: on failure, nothing was actually fired, so the
			// weapon must not consume its cooldown for a shot that never
			// left the barrel -- it simply tries again next frame.
			if handle, ok := a.battery.Fire(a.Player.Position(), a.targets[idx].Position(), spec.Speed, spec.Damage, life); ok {
				resetProjectileAnimator(a.projectileAnimators[handle])
				a.weapon.Consume()
			}
		}
	}

	a.expiredProjectiles = a.battery.Step(dt, a.expiredProjectiles)

	a.hits = weapon.Collide(a.battery, a.targets, a.targetHandles, projectileSize, a.hits)
	a.died = resolveHits(a.hits, a.died, a.battery, a.spawner)
	for _, handle := range a.died {
		a.despawnEnemy(handle)
	}

	a.syncProjectiles(dt)
}

// syncProjectiles positions and shows every live projectile's sprite, and
// hides every slot with no live projectile this frame -- including one that
// was live last frame and has since despawned (by collision, above, or by
// expiring inside Battery.Step, which reports no handles for that). Full
// resync every frame, rather than tracking a delta, is what makes that
// second case correct without Battery exposing which handles it expired.
func (a *Arena) syncProjectiles(dt float64) {
	for i := range a.projectileLive {
		a.projectileLive[i] = false
	}
	safeRadius := a.Corruption.SafeRadius()
	a.battery.Each(func(handle int, p *weapon.Projectile) {
		a.projectileLive[handle] = true
		an := a.projectileAnimators[handle]
		sp := a.projectileSprites[handle]
		an.Update(dt)
		sp.SetPosition(p.Pos)
		sp.SetUVs(an.UVs())
		sp.SetColor(actorColor(p.Pos, safeRadius))
		sp.Show()
	})
	for i, live := range a.projectileLive {
		if !live {
			a.projectileSprites[i].Hide()
		}
	}
}
