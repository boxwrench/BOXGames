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

	// projectileTextureKey is the projectile's atlas image key in the
	// content database (see games/noise-floor/assets/sheets/shot.png),
	// following the same convention playerTextureKey does.
	projectileTextureKey = "shot.png"

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
	set, err := render.NewSpriteSet(host, projectileTextureKey, projectileSize, projectileCapacity, atlas, "idle")
	if err != nil {
		return fmt.Errorf("arena: creating sprite set for shot: %w", err)
	}
	a.projectiles = set

	// The projectile battery's pool handles are dense indices in
	// [0, projectileCapacity). Acquiring every SpriteSet slot up front, in
	// this order, gives slot i the index i (NewSpriteSet fills its free
	// list back-to-front specifically so Acquire returns index 0, 1, 2, ...
	// in call order -- see render.SpriteSet's doc comment), so a
	// projectile's sprite can be addressed directly by its battery handle
	// afterward. That sidesteps a real mismatch: Battery.Step expires
	// projectiles whose Life has run out internally and reports no handles
	// for it, so a second Acquire/Release lifecycle here could never stay
	// in lockstep with the battery's own pool. Sprites are never released
	// back to the SpriteSet; visibility is synced directly by
	// syncProjectiles every frame instead (see below).
	a.projectileSprites = make([]*render.Sprite, projectileCapacity)
	a.projectileAnimators = make([]*spritesheet.Animator, projectileCapacity)
	a.projectileLive = make([]bool, projectileCapacity)
	for i := 0; i < projectileCapacity; i++ {
		sp, an, ok := set.Acquire()
		if !ok {
			return fmt.Errorf("arena: priming projectile sprite slot %d/%d: sprite set exhausted", i, projectileCapacity)
		}
		sp.Hide() // re-shown per frame by syncProjectiles for whichever slots are live
		a.projectileSprites[i] = sp
		a.projectileAnimators[i] = an
	}

	a.targets = make([]weapon.Target, 0, spawnerCapacity)
	a.targetHandles = make([]int, 0, spawnerCapacity)
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
// damages the enemy it struck, translating hit.Target (an index into the
// frame's targets/handles slices, not itself a pool handle) back into a
// handle via handles. It returns the handles that died as a result.
//
// horde.Damage reports died at most once per enemy -- it returns false for
// an enemy already at or below zero health -- so two hits landing on the
// same enemy in one frame still report exactly one death here; this function
// adds no death path of its own, it only relays what Damage already
// guarantees.
func resolveHits(hits []weapon.Hit, handles []int, battery *weapon.Battery, spawner *horde.Spawner) []int {
	var died []int
	for _, hit := range hits {
		battery.Despawn(hit.Projectile)
		handle := handles[hit.Target]
		if spawner.Damage(handle, hit.Damage) {
			died = append(died, handle)
		}
	}
	return died
}

// updateCombat runs the fire -> move -> collide -> damage -> die loop for
// one frame. Called after updateHorde, so damage resolves after the horde's
// motion this frame: a projectile cannot pass through an enemy within a
// single frame at short range, and a hit despawns its projectile before that
// projectile is drawn (syncProjectiles runs last), so a dead shot never
// renders for one extra frame.
func (a *Arena) updateCombat(dt float64) {
	a.targets, a.targetHandles = refillTargets(a.spawner, a.targets, a.targetHandles)

	spec := a.weapon.Spec()
	if a.weapon.Tick(dt) {
		if idx, ok := weapon.NearestTarget(a.Player.Position(), a.targets, spec.Range); ok {
			life := float64(spec.Range/spec.Speed) * projectileLifeMargin
			a.battery.Fire(a.Player.Position(), a.targets[idx].Position(), spec.Speed, spec.Damage, life)
		}
	}

	a.battery.Step(dt)

	hits := weapon.Collide(a.battery, a.targets, projectileSize)
	for _, handle := range resolveHits(hits, a.targetHandles, a.battery, a.spawner) {
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
