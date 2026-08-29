package arena

import (
	"fmt"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/shared/palette"

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

type Arena struct {
	host       *engine.Host
	Corruption *Corruption
	Player     *actor.Player
	stain      *render.Stain
	marker     *render.Marker
	receding   bool
	updateID   engine.UpdateId
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

// markerColor keeps the player legible as the ground inverts: ink on cream at
// level 0, cream on ink at level 1. This is spec §10 risk 1 (horde value
// treatment) in its cheapest possible form, for the player only.
func markerColor(level float32) matrix.Color {
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

	a.stain.SetBoundary(a.Corruption.SafeRadius(), level)
	a.marker.SetColor(markerColor(level))
	a.Player.Update(actor.SampleMove(&a.host.Window.Keyboard), a.Corruption, dt)
}
