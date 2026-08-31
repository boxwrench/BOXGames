package arena

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"

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
	spriteSets := make(map[actor.Archetype]spriteBank, len(enemyArchetypes))

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

		// atlas.Image, not sidecarKey, is the texture actually bound: the
		// sidecar is the single source of truth for which image its UVs
		// were authored against, so a renamed image inside the sidecar is
		// caught here instead of silently loading stale art under the old
		// name.
		set, err := render.NewSpriteSet(host, atlas.Image, actor.StatsFor(arch).Size, enemyCapacityPerArchetype, atlas, "idle")
		if err != nil {
			return fmt.Errorf("arena: creating sprite set for %s: %w", arch.Name(), err)
		}
		spriteSets[arch] = set
	}
	a.hordeView = newHordeView(spriteSets, spawnerCapacity)
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

	a.hordeView.Sync(dt, a.spawner, a.Corruption.SafeRadius())
}

// spawnEnemy places one enemy of the given archetype on the spawn ring
// (horde.Spawner.Spawn) and wires it to a borrowed sprite and animator via
// hordeView.Acquire. It is a silent no-op if the enemy pool or that
// archetype's sprite bank is exhausted -- an expected condition, not an
// error, and exactly the case Horde sizing's comment above documents -- and
// it keeps the two pools consistent by handing back whichever resource it
// did acquire before giving up, via despawnEnemy.
//
// The just-acquired sprite's position, frame and tint are left for
// updateHorde's hordeView.Sync call (later in the same Update) to set --
// Sync runs unconditionally over every live enemy, including one spawned
// this frame, so setting them here would only be overwritten before the
// frame is ever drawn.
func (a *Arena) spawnEnemy(arch actor.Archetype) {
	handle, ok := a.spawner.Spawn(arch, a.Corruption.SafeRadius())
	if !ok {
		return
	}
	if !a.hordeView.Acquire(handle, arch) {
		a.despawnEnemy(handle)
	}
}

// despawnEnemy releases everything one live enemy holds -- the pool handle,
// its SpriteSet sprite, and its animator -- in the correct order: the view
// (sprite and animator) first, via hordeView.Release, then the pool handle.
//
// It is called by resolveHits for every enemy killed in combat, and by
// spawnEnemy's failure path when sprite acquisition fails.
func (a *Arena) despawnEnemy(handle int) {
	a.hordeView.Release(handle)
	a.spawner.Despawn(handle)
}
