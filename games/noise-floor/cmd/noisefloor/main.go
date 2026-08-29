// Command noisefloor is the NOISE FLOOR demo: BX-77 holds a Citadel deck while
// entropy eats the page out from under him.
//
// See ../../docs/specs/2026-08-29-noise-floor-design.md for the design.
package main

import (
	"log/slog"
	"os"
	"reflect"

	"boxwrench.dev/boxgames/shared/kaijuboot"
	"boxwrench.dev/boxgames/shared/palette"

	"kaijuengine.com/bootstrap"
	"kaijuengine.com/engine"
	"kaijuengine.com/engine/assets"
	_ "kaijuengine.com/engine/ui/markup/css/properties" // registers CSS property handlers
	_ "kaijuengine.com/engine_entity_data/content_id"   // registers content ids
	"kaijuengine.com/matrix"
	"kaijuengine.com/rendering"
)

// Content paths are relative to the working directory, which is the game
// directory (games/noise-floor). The Makefile and scripts/run.sh both cd there
// before launching, so `make run GAME=noise-floor` works from anywhere.
const (
	gameContentPath  = "content"
	stockContentPath = "../../third_party/stock_content"
)

// Game implements bootstrap.GameInterface.
type Game struct {
	host *engine.Host
}

// ContentDatabase layers this game's content over the engine's synced stock
// content. Keeping our own database is what allows the engine checkout to stay
// pinned and read-only.
func (Game) ContentDatabase() (assets.Database, error) {
	return kaijuboot.NewGameDatabase(gameContentPath, stockContentPath)
}

// PluginRegistry exposes types to the Lua plugin system. Unused for now.
func (Game) PluginRegistry() []reflect.Type { return []reflect.Type{} }

// Launch is the game's entry point. The engine registers no updates of its own,
// so every system must add its own update here.
func (g *Game) Launch(host *engine.Host) {
	g.host = host

	// The light key is load-bearing (design spec §2): the clean field is the
	// play area and ink is death, so the clear color is the paper token rather
	// than a neutral background.
	host.RunOnRenderThread(func(device *rendering.GPUDevice) {
		device.SetSwapChainClearColor(palette.Paper())
	})

	// Fixed single-screen arena: the camera never scrolls, so every sprite sits
	// at a known scale.
	host.Cameras.Primary.Camera.SetPositionAndLookAt(
		matrix.NewVec3(0, 0, 14),
		matrix.NewVec3(0, 0, 0),
	)

	slog.Info("NOISE FLOOR launched — scaffold only, no systems wired yet")
}

func main() {
	engine.LoadLaunchParams()
	game := &Game{}
	if err := run(game); err != nil {
		slog.Error("noisefloor: failed to launch", "error", err)
		os.Exit(1)
	}
}

func run(game bootstrap.GameInterface) error {
	// platformState is nil on Linux and Windows; only Android and macOS supply
	// one, mirroring the engine's own main.go.
	bootstrap.Main(game, nil)
	return nil
}
