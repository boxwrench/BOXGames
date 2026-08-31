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
	"kaijuengine.com/matrix"
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
// has enemyCapacityPerArchetype (48) sprites -- 32 live enemies of one
// archetype among 40 total is entirely reachable. When that happens,
// spawnEnemy's Acquire call on that archetype's bank fails and the spawn is
// silently skipped (see spawnEnemy's doc comment); that is expected, correct
// behaviour, not a case the two pools' agreement on totals rules out.
//
// The wave director (horde.Director, task-8b brief) replaces the old fixed
// spawn cadence and live cap: the schedule's composition bounds how many
// enemies are ever asked for. The largest wave (schedule wave 8: 26 Mote, 12
// Lancer, 8 Aberrant, 5 Dendrite, 4 Overfit = 55 total) plus its worst-case
// Overfit split children (up to SplitCount Motes per Overfit, so up to 12 more
// if all 4 die at once while their siblings are still alive) would mean 38
// concurrent Motes peak -- thus enemyCapacityPerArchetype (48) accommodates
// Motes, and all other archetypes stay well under their limits.
const enemyCapacityPerArchetype = 48

// enemyArchetypes is the closed set of horde archetypes, used to size
// spawnerCapacity and to build one sprite bank per archetype in buildHorde.
// What to actually spawn, and when, is the wave director's job now
// (horde.Director) -- this list no longer doubles as a pick-one-at-random
// set the way it did under the old fixed-cadence stand-in.
var enemyArchetypes = []actor.Archetype{
	actor.Mote, actor.Dendrite, actor.Aberrant, actor.Lancer, actor.Overfit,
}

// spawnerCapacity is the horde model's pool size: one bank of
// enemyCapacityPerArchetype sprites per archetype.
var spawnerCapacity = len(enemyArchetypes) * enemyCapacityPerArchetype

// buildHorde wires up the enemy model (7a's Spawner) to rendering: one
// render.SpriteSet and spritesheet.Atlas per archetype, and a fixed
// per-handle slice of rendering state parallel to the spawner's pool.
func (a *Arena) buildHorde(host *engine.Host) error {
	a.rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	a.spawner = horde.NewSpawner(spawnerCapacity, a.rng)
	a.director = horde.NewDirector(horde.DefaultSchedule(), a.rng)
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

// updateHorde steps the enemy simulation (horde.Spawner.Step owns steering,
// integration and safe-zone clamping), then syncs every live enemy's sprite
// to its new state. It does not spawn -- Update calls the wave director and
// spawns its release list before updateHorde runs, so a newly spawned
// enemy's sprite still gets its first Sync the same frame it appears.
func (a *Arena) updateHorde(dt float64) {
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

// spawnOverfitSplits spawns actor.SplitCount Motes at actor.SplitPositions
// around deathPos, the position an Overfit died at. These are extra spawns
// outside the wave director's release list -- the director never sees them
// -- but they land in the same shared horde.Spawner pool as every other
// enemy, so they count toward horde.Spawner.Live() just the same: a wave the
// director thinks it is clearing is not actually clear until they are dead
// too.
//
// Each child follows spawnEnemy's acquire-or-unwind pattern independently: a
// full pool or an exhausted Mote sprite bank silently skips that one child
// (the same expected-not-error condition spawnEnemy documents) without
// aborting the rest.
//
// Unlike spawnEnemy, a successful Acquire here is followed by an immediate
// hordeView.SyncOne rather than being left for updateHorde's Sync call to
// reach "later in the same Update": this runs from updateCombat, which is
// called from Arena.Update *after* updateHorde already ran for this frame,
// so there is no later Sync sweep still to come this Update -- without the
// immediate push, a split child would draw for one whole frame at its
// recycled slot's stale position (the previous occupant's death spot, or
// world origin for a never-used slot), at the most dramatic moment in the
// game. safeRadius is passed in rather than read from a.Corruption directly
// so this stays testable without one (see combat_test.go).
func (a *Arena) spawnOverfitSplits(deathPos matrix.Vec2, safeRadius float32) {
	for _, pos := range actor.SplitPositions(deathPos, actor.SplitRadius) {
		handle, ok := a.spawner.SpawnAt(actor.Mote, pos)
		if !ok {
			continue
		}
		if !a.hordeView.Acquire(handle, actor.Mote) {
			a.despawnEnemy(handle)
			continue
		}
		a.hordeView.SyncOne(handle, pos, safeRadius)
	}
}
