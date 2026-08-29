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
// scale (design spec 1). cameraZ frames roughly 26x15 world units at 16:9.
const (
	cameraZ       = 14.0
	stainWidth    = 26.0
	stainHeight   = 15.0
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
