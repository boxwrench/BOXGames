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
const (
	cameraZ       = 14.0
	stainWidth    = 48.0
	stainHeight   = 22.0
	safeRadiusMax = 6.5
	safeRadiusMin = 1.5
	playerSpeed   = 4.5
)

type Arena struct {
	host       *engine.Host
	Corruption *Corruption
	Player     *actor.Player
	stain      *render.Stain
	updateID   engine.UpdateId
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
	a.updateID = host.Updater.AddUpdate(a.Update)
	return a, nil
}

// Update advances one frame. Corruption advances continuously for now; the wave
// director takes over the pressure input in Task 7.
func (a *Arena) Update(dt float64) {
	a.Corruption.Advance(dt, 1.0)
	a.stain.SetLevel(a.Corruption.Level())
	a.Player.Update(actor.SampleMove(&a.host.Window.Keyboard), a.Corruption, dt)
}
