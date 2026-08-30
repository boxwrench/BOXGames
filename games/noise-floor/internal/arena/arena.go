package arena

import (
	"fmt"
	"math/rand"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
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
	host       *engine.Host
	Corruption *Corruption
	Player     *actor.Player
	stain      *render.Stain
	marker     *render.Marker
	receding   bool
	updateID   engine.UpdateId

	spawner    *horde.Spawner
	rng        *rand.Rand
	spriteSets map[actor.Archetype]*render.SpriteSet
	atlases    map[actor.Archetype]*spritesheet.Atlas
	enemyViews []enemyView
	spawnTimer float64
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

// actorColor keeps every actor -- the player marker and every enemy sprite --
// legible as the ground inverts: ink on cream at level 0, cream on ink at
// level 1. This is spec §10 risk 1 (horde value treatment), applied
// uniformly to the player and the horde by deliberate project decision: the
// placeholder art gives player and enemies the same value range and relies
// on silhouette alone to tell them apart.
func actorColor(level float32) matrix.Color {
	if level < 0 {
		level = 0
	} else if level > 1 {
		level = 1
	}
	ink, paper := palette.Ink(), palette.Paper()
	return matrix.NewColor(
		ink.R()+(paper.R()-ink.R())*level,
		ink.G()+(paper.G()-ink.G())*level,
		ink.B()+(paper.B()-ink.B())*level,
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

	marker, err := render.NewMarker(host, &a.Player.Entity.Transform, playerSize, palette.Ink())
	if err != nil {
		return nil, fmt.Errorf("arena: creating player marker: %w", err)
	}
	a.marker = marker

	if err := a.buildHorde(host); err != nil {
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
	a.marker.SetColor(actorColor(level))
	a.Player.Update(actor.SampleMove(&a.host.Window.Keyboard), a.Corruption, dt)

	a.updateHorde(dt, level)
}
