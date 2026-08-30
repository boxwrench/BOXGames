package arena

import (
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/shared/spritesheet"

	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
)

// Horde sizing.
//
// enemyCapacityPerArchetype is the number of pre-created, hidden sprites each
// archetype gets. spawnerCapacity is derived from it -- one bank per
// archetype -- rather than written as a literal, so the enemy model (7a's
// Spawner) and the sprite sets built here can never disagree about how many
// enemies can exist at once.
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

	// aberrantStandoff is the Aberrant's hold distance from its target (Task
	// 7a brief archetype table: "Standoff at 5.0"). It is not exported by
	// the actor package -- StandoffVelocity takes it as a parameter rather
	// than baking it in -- so the archetype-to-steering wiring done here is
	// the natural place to name it.
	aberrantStandoff float32 = 5.0
)

// enemyArchetypes is the closed set of horde archetypes, used both to size
// spawnerCapacity and to pick a uniformly random archetype to spawn.
var enemyArchetypes = []actor.Archetype{
	actor.Mote, actor.Dendrite, actor.Aberrant, actor.Lancer, actor.Overfit,
}

// archetypeTextureKey maps each archetype to its atlas image key in the
// content database (see games/noise-floor/assets/sheets).
var archetypeTextureKey = map[actor.Archetype]string{
	actor.Mote:     "mote.png",
	actor.Dendrite: "dendrite.png",
	actor.Aberrant: "aberrant.png",
	actor.Lancer:   "lancer.png",
	actor.Overfit:  "overfit.png",
}

// spawnerCapacity is the horde model's pool size: one bank of
// enemyCapacityPerArchetype sprites per archetype.
var spawnerCapacity = len(enemyArchetypes) * enemyCapacityPerArchetype

// enemyView is the rendering state for one live enemy, indexed by its
// horde.Spawner pool handle. It has no counterpart in 7a's model because 7a
// is pure logic with no rendering.
type enemyView struct {
	sprite   *render.Sprite
	animator *spritesheet.Animator

	// entered latches true the first time this enemy's position has been
	// inside the safe zone. See clampArmed.
	entered bool
}

// shouldSpawn decides whether the spawn timer has fired and there is still
// room in the horde. timer is seconds accumulated since the last spawn;
// interval is the spawn cadence; live/max are the current and maximum
// number of live enemies.
func shouldSpawn(timer, interval float64, live, max int) bool {
	return timer >= interval && live < max
}

// clampArmed decides whether an enemy is clamped to the safe zone this
// frame, and returns the (possibly newly) latched "has ever entered" flag to
// store for next frame.
//
// Enemies spawn outside the safe zone by design and walk inward; clamping
// them from frame one would snap every enemy straight onto the boundary the
// instant it spawns, and the spawn ring outside the safe zone would never be
// visible. So an enemy is only clamped once it has entered the safe zone at
// least once -- and once that happens, the flag latches permanently for the
// rest of that enemy's life, even if it later walks back out.
func clampArmed(everEntered bool, pos matrix.Vec2, zone actor.SafeZone) (clamp, nowEntered bool) {
	nowEntered = everEntered || zone.Contains(pos)
	return nowEntered, nowEntered
}

// enemyVelocity computes one enemy's steering velocity for this frame, using
// 7a's per-archetype steering assignment (Task 7a brief archetype table):
// Mote, Dendrite and Overfit chase; Aberrant holds standoff distance; Lancer
// runs its own cruise/telegraph/charge state machine.
func enemyVelocity(e *horde.Enemy, target matrix.Vec2, dt float64) matrix.Vec2 {
	stats := actor.StatsFor(e.Archetype)
	switch e.Archetype {
	case actor.Aberrant:
		return actor.StandoffVelocity(e.Pos, target, stats.Speed, aberrantStandoff)
	case actor.Lancer:
		return e.Lancer.Update(dt, e.Pos, target)
	default:
		return actor.ChaseVelocity(e.Pos, target, stats.Speed)
	}
}

// buildHorde wires up the enemy model (7a's Spawner) to rendering: one
// render.SpriteSet and spritesheet.Atlas per archetype, and a fixed
// per-handle slice of rendering state parallel to the spawner's pool.
func (a *Arena) buildHorde(host *engine.Host) error {
	a.rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	a.spawner = horde.NewSpawner(spawnerCapacity, a.rng)
	a.enemyViews = make([]enemyView, spawnerCapacity)
	a.spriteSets = make(map[actor.Archetype]*render.SpriteSet, len(enemyArchetypes))
	a.atlases = make(map[actor.Archetype]*spritesheet.Atlas, len(enemyArchetypes))

	for _, arch := range enemyArchetypes {
		key := archetypeTextureKey[arch]

		sidecar, err := host.AssetDatabase().Read(key + ".json")
		if err != nil {
			return fmt.Errorf("arena: reading sheet sidecar for %s (%s.json): %w", arch.Name(), key, err)
		}
		atlas, err := spritesheet.LoadAtlas(sidecar)
		if err != nil {
			return fmt.Errorf("arena: loading atlas for %s: %w", arch.Name(), err)
		}
		a.atlases[arch] = atlas

		set, err := render.NewSpriteSet(host, key, actor.StatsFor(arch).Size, enemyCapacityPerArchetype)
		if err != nil {
			return fmt.Errorf("arena: creating sprite set for %s: %w", arch.Name(), err)
		}
		a.spriteSets[arch] = set
	}
	return nil
}

// updateHorde advances the temporary spawn cadence, then steers, animates
// and redraws every live enemy for this frame.
func (a *Arena) updateHorde(dt float64) {
	a.spawnTimer += dt
	if shouldSpawn(a.spawnTimer, spawnInterval, a.spawner.Live(), maxLiveEnemies) {
		a.spawnTimer -= spawnInterval
		arch := enemyArchetypes[a.rng.Intn(len(enemyArchetypes))]
		a.spawnEnemy(arch)
	}

	target := a.Player.Position()
	safeRadius := a.Corruption.SafeRadius()
	a.spawner.Each(func(handle int, e *horde.Enemy) {
		view := &a.enemyViews[handle]

		vel := enemyVelocity(e, target, dt)
		e.Pos = e.Pos.Add(vel.Scale(float32(dt)))

		clamp, entered := clampArmed(view.entered, e.Pos, a.Corruption)
		view.entered = entered
		if clamp {
			e.Pos = actor.ClampToSafeZone(e.Pos, a.Corruption)
		}

		view.animator.Update(dt)
		view.sprite.SetPosition(e.Pos)
		view.sprite.SetUVs(view.animator.UVs())
		view.sprite.SetColor(actorColor(e.Pos, safeRadius))
	})
}

// spawnEnemy places one enemy of the given archetype on the spawn ring
// (7a's Spawner.Spawn) and wires it to a borrowed sprite and a fresh
// animator. It is a silent no-op if the enemy pool or that archetype's
// sprite bank is exhausted -- an expected condition, not an error -- and it
// keeps the two pools consistent by handing back whichever resource it did
// acquire before giving up.
func (a *Arena) spawnEnemy(arch actor.Archetype) {
	handle, ok := a.spawner.Spawn(arch, a.Corruption.SafeRadius())
	if !ok {
		return
	}
	sprite, ok := a.spriteSets[arch].Acquire()
	if !ok {
		a.spawner.Despawn(handle)
		return
	}
	animator := spritesheet.NewAnimator(a.atlases[arch])
	if err := animator.Play("idle"); err != nil {
		slog.Error("arena: enemy atlas has no idle clip", "archetype", arch.Name(), "error", err)
		a.spriteSets[arch].Release(sprite)
		a.spawner.Despawn(handle)
		return
	}

	enemy := a.spawner.Get(handle)
	a.enemyViews[handle] = enemyView{sprite: sprite, animator: animator, entered: false}
	sprite.SetPosition(enemy.Pos)
	sprite.SetUVs(animator.UVs())
	sprite.SetColor(actorColor(enemy.Pos, a.Corruption.SafeRadius()))
}
