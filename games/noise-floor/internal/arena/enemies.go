package arena

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/shared/spritesheet"

	"kaijuengine.com/engine"
)

// Horde sizing.
//
// enemyCapacityPerArchetype is the number of pre-created, hidden sprites each
// archetype gets. spawnerCapacity is derived from it -- one bank per
// archetype -- rather than written as a literal, so the shared pool's total
// capacity and the sum of the per-archetype sprite banks can never disagree
// in total.
//
// That is a total, not a per-archetype guarantee. The shared pool
// (horde.Spawner) has no notion of archetype, so nothing stops it from
// holding, say, 40 live Motes at once even though the Mote SpriteSet only
// has enemyCapacityPerArchetype (32) sprites -- 32 live enemies of one
// archetype among 40 total is entirely reachable. When that happens,
// spawnEnemy's Acquire call on that archetype's bank fails and the spawn is
// silently skipped (see spawnEnemy's doc comment); that is expected, correct
// behaviour, not a case the two pools' agreement on totals rules out.
//
// spawnInterval is a TEMPORARY spawn cadence standing in for the wave
// director; Task 8 replaces it with real wave scheduling.
//
// maxLiveEnemies caps how many enemies can be alive at once. Nothing kills
// enemies yet (Task 10 owns damage and death), so without a cap the field
// saturates in well under a minute at this cadence and the demo becomes a
// solid wall of ink.
const (
	enemyCapacityPerArchetype = 32
	spawnInterval             = 0.6
	maxLiveEnemies            = 40
)

// enemyArchetypes is the closed set of horde archetypes, used both to size
// spawnerCapacity and to pick a uniformly random archetype to spawn.
var enemyArchetypes = []actor.Archetype{
	actor.Mote, actor.Dendrite, actor.Aberrant, actor.Lancer, actor.Overfit,
}

// spawnerCapacity is the horde model's pool size: one bank of
// enemyCapacityPerArchetype sprites per archetype.
var spawnerCapacity = len(enemyArchetypes) * enemyCapacityPerArchetype

// spriteBank is the subset of *render.SpriteSet that despawnEnemy and
// spawnEnemy need. Declaring it as an interface (rather than using
// *render.SpriteSet directly) lets tests substitute a fake bank in place of
// a real, host-backed SpriteSet, which the engine cannot construct without a
// live GPU device.
type spriteBank interface {
	Acquire() (*render.Sprite, *spritesheet.Animator, bool)
	Release(*render.Sprite)
}

// enemyView is the rendering state for one live enemy, indexed by its
// horde.Spawner pool handle. It has no counterpart in 7a's model because 7a
// is pure logic with no rendering.
type enemyView struct {
	sprite *render.Sprite

	// animator is borrowed from the sprite's SpriteSet slot, not owned here
	// -- it shares the sprite's lifetime (Task 9b) rather than being
	// allocated fresh per spawn, and Release (via despawnEnemy) returns both
	// together by returning just the sprite.
	animator *spritesheet.Animator

	// archetype records which SpriteSet this view's sprite was borrowed
	// from, so despawnEnemy can return it without going through
	// a.spawner.Get(handle).Archetype -- which returns nil once the handle
	// is no longer live, i.e. exactly when despawnEnemy needs it most.
	archetype actor.Archetype
}

// shouldSpawn decides whether the spawn timer has fired and there is still
// room in the horde. timer is seconds accumulated since the last spawn;
// interval is the spawn cadence; live/maxLive are the current and maximum
// number of live enemies.
func shouldSpawn(timer, interval float64, live, maxLive int) bool {
	return timer >= interval && live < maxLive
}

// clampSpawnTimer bounds how far the spawn timer can bank credit while the
// live cap is blocking spawns. Without this, spawnTimer accumulates every
// frame regardless of whether shouldSpawn's live<maxLive gate ever lets that
// credit be spent (see updateHorde: the -= spawnInterval that drains it only
// runs inside the gated branch). That is harmless today because nothing
// despawns, but once death lands, a long stretch at the cap would bank
// enough credit to fire a spawn every frame until it drains -- an instant
// burst refill instead of the intended cadence. Clamping to interval means a
// slot opening later can release at most one banked spawn.
func clampSpawnTimer(timer, interval float64, live, maxLive int) float64 {
	if live >= maxLive && timer > interval {
		return interval
	}
	return timer
}

// buildHorde wires up the enemy model (7a's Spawner) to rendering: one
// render.SpriteSet and spritesheet.Atlas per archetype, and a fixed
// per-handle slice of rendering state parallel to the spawner's pool.
func (a *Arena) buildHorde(host *engine.Host) error {
	a.rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	a.spawner = horde.NewSpawner(spawnerCapacity, a.rng)
	a.enemyViews = make([]enemyView, spawnerCapacity)
	a.spriteSets = make(map[actor.Archetype]spriteBank, len(enemyArchetypes))
	a.atlases = make(map[actor.Archetype]*spritesheet.Atlas, len(enemyArchetypes))

	for _, arch := range enemyArchetypes {
		// The sidecar filename follows a fixed lowercase(Name())+".png"
		// convention (see games/noise-floor/assets/sheets), not a
		// hand-maintained per-archetype table -- a single naming rule can't
		// drift the way a parallel map of strings can.
		sidecarKey := strings.ToLower(arch.Name()) + ".png"

		atlas, err := loadActorAtlas(host, sidecarKey, arch.Name())
		if err != nil {
			return err
		}
		a.atlases[arch] = atlas

		// atlas.Image, not sidecarKey, is the texture actually bound: the
		// sidecar is the single source of truth for which image its UVs
		// were authored against, so a renamed image inside the sidecar is
		// caught here instead of silently loading stale art under the old
		// name.
		set, err := render.NewSpriteSet(host, atlas.Image, actor.StatsFor(arch).Size, enemyCapacityPerArchetype, atlas, "idle")
		if err != nil {
			return fmt.Errorf("arena: creating sprite set for %s: %w", arch.Name(), err)
		}
		a.spriteSets[arch] = set
	}
	return nil
}

// updateHorde advances the temporary spawn cadence, steps the enemy
// simulation (horde.Spawner.Step owns steering, integration and safe-zone
// clamping), then syncs every live enemy's sprite to its new state.
func (a *Arena) updateHorde(dt float64) {
	a.spawnTimer += dt
	a.spawnTimer = clampSpawnTimer(a.spawnTimer, spawnInterval, a.spawner.Live(), maxLiveEnemies)
	if shouldSpawn(a.spawnTimer, spawnInterval, a.spawner.Live(), maxLiveEnemies) {
		a.spawnTimer -= spawnInterval
		arch := enemyArchetypes[a.rng.Intn(len(enemyArchetypes))]
		a.spawnEnemy(arch)
	}

	target := a.Player.Position()
	a.spawner.Step(dt, target, a.Corruption)

	safeRadius := a.Corruption.SafeRadius()
	a.spawner.Each(func(handle int, e *horde.Enemy) {
		view := &a.enemyViews[handle]
		view.animator.Update(dt)
		view.sprite.SetPosition(e.Pos)
		view.sprite.SetUVs(view.animator.UVs())
		view.sprite.SetColor(actorColor(e.Pos, safeRadius))
	})
}

// spawnEnemy places one enemy of the given archetype on the spawn ring
// (7a's Spawner.Spawn) and wires it to a borrowed sprite and animator. It is
// a silent no-op if the enemy pool or that archetype's sprite bank is
// exhausted -- an expected condition, not an error, and exactly the case
// Horde sizing's comment above documents -- and it keeps the two pools
// consistent by handing back whichever resource it did acquire before
// giving up, via despawnEnemy.
//
// The animator comes back already reset to the idle clip's first frame --
// SpriteSet.Acquire owns that reset (Task 9b) -- so a slot recycled from a
// despawned enemy never resumes mid-animation from its previous occupant.
func (a *Arena) spawnEnemy(arch actor.Archetype) {
	handle, ok := a.spawner.Spawn(arch, a.Corruption.SafeRadius())
	if !ok {
		return
	}
	sprite, animator, ok := a.spriteSets[arch].Acquire()
	if !ok {
		a.despawnEnemy(handle)
		return
	}
	a.enemyViews[handle] = enemyView{sprite: sprite, animator: animator, archetype: arch}

	enemy := a.spawner.Get(handle)
	sprite.SetPosition(enemy.Pos)
	sprite.SetUVs(animator.UVs())
	sprite.SetColor(actorColor(enemy.Pos, a.Corruption.SafeRadius()))
}

// despawnEnemy releases everything one live enemy holds -- the pool handle,
// its SpriteSet sprite, and its animator -- in the correct order. The sprite
// is returned via the archetype recorded in enemyViews, not via
// a.spawner.Get(handle).Archetype, which returns nil once the handle is no
// longer live -- i.e. exactly when this unwind needs it. The animator has no
// pool of its own; zeroing the view is enough to drop it.
//
// It is called by resolveHits for every enemy killed in combat, and by
// spawnEnemy's failure path when sprite acquisition fails.
func (a *Arena) despawnEnemy(handle int) {
	view := a.enemyViews[handle]
	if view.sprite != nil {
		a.spriteSets[view.archetype].Release(view.sprite)
	}
	a.enemyViews[handle] = enemyView{}
	a.spawner.Despawn(handle)
}
