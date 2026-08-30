package arena

import (
	"fmt"
	"math/rand"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/games/noisefloor/internal/weapon"
	"boxwrench.dev/boxgames/shared/palette"
	"boxwrench.dev/boxgames/shared/spritesheet"

	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
	"kaijuengine.com/rendering"
)

// Arena framing. The camera never scrolls, so every sprite sits at a known
// scale (design spec 1). At the gameplay plane (z=0) the camera frames ~28.7x16.2
// world units at 16:9. The stain quad sits at z=-3 where the frustum is ~34.9x19.6.
// The quad is deliberately oversized to 48x22 so it bleeds past the frustum at
// every aspect ratio out to 2.45:1, covering the screen with a single quad.
//
// safeRadiusMax is calibrated to that framing, not chosen freely: it is the
// gameplay-plane half-height, cameraZ * tan(30 deg) with a 60 deg vertical
// FOV (~8.08, rounded to 8.1). The safe circle therefore touches the top and
// bottom screen edges, and a clean page starts with only the four corners
// inked. TestSafeRadiusMaxMatchesGameplayPlaneHalfHeight enforces this pair
// stays calibrated.
const (
	cameraZ       = 14.0
	stainWidth    = 48.0
	stainHeight   = 22.0
	safeRadiusMax = 8.1
	safeRadiusMin = 1.5
	playerSpeed   = 4.5
	playerSize    = 0.6

	// playerTextureKey is the player's atlas image key in the content
	// database (see games/noise-floor/assets/sheets).
	playerTextureKey = "player.png"

	// stainFrontSoftness MUST match FRONT_SOFTNESS in
	// assets/shaders/src/boxstain.frag: the width, in stain-plane world
	// units, of the shader's corruption-front ramp. GLSL cannot be imported
	// into Go, so this is a hand-kept duplicate -- the same situation
	// shared/palette is in with its own copies of the shader's color
	// literals, which it guards with a tripwire test (palette_test.go's
	// TestShaderPaletteSync). TestActorTintBandMatchesShaderFrontSoftness
	// below does the same job for this constant: if it ever fails, update
	// whichever of this constant or FRONT_SOFTNESS has drifted from the
	// other.
	stainFrontSoftness = 0.6

	// actorTintBand is the distance beyond the safe boundary over which an
	// actor's tint crossfades from ink to paper. It is stainFrontSoftness
	// converted from stain-plane units to gameplay-plane units by the
	// inverse of stainPlaneRadius's scaling, so an actor finishes inverting
	// over exactly the on-screen distance the ground beneath it takes to
	// change. The ramp itself is one-sided to match the shader's
	// smoothstep(front, front+FRONT_SOFTNESS, r): full ink right up to the
	// boundary, crossfading to paper only in the band outward from it -- see
	// actorColor.
	actorTintBand float32 = stainFrontSoftness * cameraZ / (cameraZ - render.StainDepth)
)

// stainPlaneRadius converts a gameplay-plane radius into the radius that, drawn
// on the stain quad's plane, covers the same screen area under the perspective
// camera. The stain plane is at a different depth than the gameplay plane, so
// the same world distance appears at a different screen size depending on which
// plane it is measured on.
func stainPlaneRadius(r float32) float32 {
	return r * (cameraZ - render.StainDepth) / cameraZ
}

type Arena struct {
	host           *engine.Host
	Corruption     *Corruption
	Player         *actor.Player
	stain          *render.Stain
	playerSprite   *render.Sprite
	playerAnimator *spritesheet.Animator
	receding       bool
	updateID       engine.UpdateId

	spawner    *horde.Spawner
	rng        *rand.Rand
	spriteSets map[actor.Archetype]spriteBank
	enemyViews []enemyView
	spawnTimer float64

	weapon              *weapon.Weapon
	battery             *weapon.Battery
	projectileSprites   []*render.Sprite
	projectileAnimators []*spritesheet.Animator
	projectileLive      []bool
	targets             []weapon.Target // scratch, refilled each frame -- see refillTargets
	targetHandles       []int           // parallel to targets: targetHandles[i] is targets[i]'s pool handle
	died                []int           // scratch, refilled each frame in resolveHits
	hits                []weapon.Hit    // scratch, refilled each frame by weapon.Collide
	expiredProjectiles  []int           // scratch, refilled each frame by weapon.Battery.Step
}

// loadActorAtlas reads a sprite sheet's sidecar from the content database and
// parses it. textureKey is the atlas image name in the content database
// (e.g. "mote.png"); label identifies the caller in error text (e.g.
// "player", or an archetype's Name()). Both the player bootstrap below and
// enemies.go's buildHorde use this so their error wording cannot drift.
func loadActorAtlas(host *engine.Host, textureKey, label string) (*spritesheet.Atlas, error) {
	sidecar, err := host.AssetDatabase().Read(textureKey + ".json")
	if err != nil {
		return nil, fmt.Errorf("arena: reading sheet sidecar for %s (%s.json): %w", label, textureKey, err)
	}
	atlas, err := spritesheet.LoadAtlas(sidecar)
	if err != nil {
		return nil, fmt.Errorf("arena: loading atlas for %s: %w", label, err)
	}
	return atlas, nil
}

// newIdleAnimator creates an animator over atlas and starts its "idle" clip.
// label identifies the caller in error text. Used by the player bootstrap
// below, which owns one permanent sprite and animator outright -- unlike
// enemies and projectiles, which borrow theirs from a render.SpriteSet
// (Task 9b), so their per-slot animators are created once, in
// render.NewSpriteSet, not here.
func newIdleAnimator(atlas *spritesheet.Atlas, label string) (*spritesheet.Animator, error) {
	animator := spritesheet.NewAnimator(atlas)
	if err := animator.Play("idle"); err != nil {
		return nil, fmt.Errorf("arena: %s atlas has no idle clip: %w", label, err)
	}
	return animator, nil
}

// breathPhase decides whether the demo loop should be washing the page back
// this frame. Tasks 1-5 only ever advance, so the page reaches full ink in
// ~8.3s and stays there; the wave director (Task 8) is what will really drive
// this. Until then the arena breathes so there is something to watch.
func breathPhase(level float32, receding bool) bool {
	if receding {
		return level > 0
	}
	return level >= 1
}

// actorColor returns the tint that keeps an actor legible against the ground
// it is standing on: ink on clean paper inside the safe zone, paper on ink
// outside it, crossfading across the boundary. Spec 3.2 - the horde value
// treatment - and it applies to the player for the same reason.
//
// The ground under any actor is determined by that actor's own distance from
// the centre, not by the global corruption level: the corruption shader
// paints clean paper inside SafeRadius() and ink outside it, so an actor's
// own position is what decides which ground it is standing on.
//
// The ramp is one-sided, matching the shader's own
// smoothstep(front, front+FRONT_SOFTNESS, r): an actor is fully ink right up
// to and including the boundary itself (dist <= safeRadius), then crossfades
// to fully paper over actorTintBand beyond it (dist >= safeRadius+
// actorTintBand). A symmetric, two-sided ramp centred on the boundary would
// start inverting an actor before the ground under it has changed at all.
func actorColor(pos matrix.Vec2, safeRadius float32) matrix.Color {
	dist := pos.Length()

	t := (dist - safeRadius) / actorTintBand
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}

	ink, paper := palette.Ink(), palette.Paper()
	return matrix.NewColor(
		ink.R()+(paper.R()-ink.R())*t,
		ink.G()+(paper.G()-ink.G())*t,
		ink.B()+(paper.B()-ink.B())*t,
		1,
	)
}

func New(host *engine.Host) (*Arena, error) {
	host.RunOnRenderThread(func(device *rendering.GPUDevice) {
		device.SetSwapChainClearColor(palette.Paper())
	})
	host.Cameras.Primary.Camera.SetPositionAndLookAt(
		matrix.NewVec3(0, 0, cameraZ),
		matrix.NewVec3(0, 0, 0),
	)

	stain, err := render.NewStain(host, stainWidth, stainHeight)
	if err != nil {
		return nil, fmt.Errorf("arena: creating stain: %w", err)
	}

	a := &Arena{
		host:       host,
		Corruption: NewCorruption(safeRadiusMax, safeRadiusMin),
		Player:     actor.NewPlayer(host, playerSpeed),
		stain:      stain,
	}

	atlas, err := loadActorAtlas(host, playerTextureKey, "player")
	if err != nil {
		return nil, err
	}
	sprite, err := render.NewSprite(host, playerTextureKey, playerSize)
	if err != nil {
		return nil, fmt.Errorf("arena: creating player sprite: %w", err)
	}
	animator, err := newIdleAnimator(atlas, "player")
	if err != nil {
		return nil, err
	}
	sprite.Show()
	a.playerSprite = sprite
	a.playerAnimator = animator

	if err := a.buildHorde(host); err != nil {
		return nil, err
	}
	if err := a.buildCombat(host); err != nil {
		return nil, err
	}

	a.updateID = host.Updater.AddUpdate(a.Update)
	return a, nil
}

// Update advances one frame. Corruption breathes in and out on a loop until the
// wave director (Task 8) owns the pressure input for real.
func (a *Arena) Update(dt float64) {
	if a.receding {
		a.Corruption.Recede(dt)
	} else {
		a.Corruption.Advance(dt, 1.0)
	}
	level := a.Corruption.Level()
	a.receding = breathPhase(level, a.receding)

	a.stain.SetBoundary(stainPlaneRadius(a.Corruption.SafeRadius()), level)
	a.Player.Update(actor.SampleMove(&a.host.Window.Keyboard), a.Corruption, dt)

	a.playerAnimator.Update(dt)
	a.playerSprite.SetPosition(a.Player.Position())
	a.playerSprite.SetUVs(a.playerAnimator.UVs())
	a.playerSprite.SetColor(actorColor(a.Player.Position(), a.Corruption.SafeRadius()))

	a.updateHorde(dt)
	a.updateCombat(dt)
}
