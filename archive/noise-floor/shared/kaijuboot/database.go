/*
Package kaijuboot provides the shared bootstrap layer every BOXGames demo sits
on: a layered content database and a base game type that implements the parts
of bootstrap.GameInterface that never vary between demos.
*/
package kaijuboot

import (
	"fmt"
	"os"
	"path/filepath"

	"kaijuengine.com/engine/assets"
)

// LayeredDatabase resolves an asset key against several databases in order,
// returning the first hit.
//
// Games need both their own content and the engine's stock content (base
// materials, shaders, fonts, primitive textures), but assets.Database is a
// single-root interface. The engine's own sample game solves this by copying
// stock content into the game's content folder on first run, which leaves an
// unmanaged copy on disk that silently goes stale when the engine pin moves.
//
// Layering instead keeps game content authoritative and stock content
// read-only and regenerable: scripts/sync-stock-content.sh can delete and
// recreate the stock layer at any time without touching a game.
type LayeredDatabase struct {
	layers []assets.Database
}

// NewLayeredDatabase returns a database that searches layers in the order
// given. Earlier layers win, so pass game content before stock content.
func NewLayeredDatabase(layers ...assets.Database) (*LayeredDatabase, error) {
	if len(layers) == 0 {
		return nil, fmt.Errorf("kaijuboot: a layered database needs at least one layer")
	}
	return &LayeredDatabase{layers: layers}, nil
}

// NewGameDatabase is the standard content setup for a demo: the game's own
// content directory layered over the synced engine stock content.
//
// Both paths are resolved relative to the working directory. A missing stock
// layer is a setup error rather than a silent fallback, because the failure it
// produces otherwise ("you've probably got the wrong asset database path")
// appears much later and reads as a code bug.
func NewGameDatabase(gameContentPath, stockContentPath string) (*LayeredDatabase, error) {
	for _, p := range []string{gameContentPath, stockContentPath} {
		if _, err := os.Stat(p); err != nil {
			abs, _ := filepath.Abs(p)
			return nil, fmt.Errorf(
				"kaijuboot: content path %q not found (%w); run scripts/bootstrap.sh", abs, err)
		}
	}
	game, err := assets.NewFileDatabase(gameContentPath)
	if err != nil {
		return nil, fmt.Errorf("kaijuboot: opening game content: %w", err)
	}
	stock, err := assets.NewFileDatabase(stockContentPath)
	if err != nil {
		return nil, fmt.Errorf("kaijuboot: opening stock content: %w", err)
	}
	return NewLayeredDatabase(game, stock)
}

func (d *LayeredDatabase) Read(key string) ([]byte, error) {
	var firstErr error
	for _, layer := range d.layers {
		if layer.Exists(key) {
			b, err := layer.Read(key)
			if err == nil {
				return b, nil
			}
			if firstErr == nil {
				firstErr = err
			}
		}
	}
	if firstErr != nil {
		return nil, firstErr
	}
	return nil, fmt.Errorf("kaijuboot: asset %q not found in any content layer", key)
}

func (d *LayeredDatabase) ReadText(key string) (string, error) {
	b, err := d.Read(key)
	return string(b), err
}

func (d *LayeredDatabase) Exists(key string) bool {
	for _, layer := range d.layers {
		if layer.Exists(key) {
			return true
		}
	}
	return false
}

// Cache writes through to the first layer only. Caching into every layer would
// let a game-content read populate the stock cache and vice versa.
func (d *LayeredDatabase) Cache(key string, data []byte) { d.layers[0].Cache(key, data) }

func (d *LayeredDatabase) CacheRemove(key string) {
	for _, layer := range d.layers {
		layer.CacheRemove(key)
	}
}

func (d *LayeredDatabase) CacheClear() {
	for _, layer := range d.layers {
		layer.CacheClear()
	}
}

func (d *LayeredDatabase) Close() {
	for _, layer := range d.layers {
		layer.Close()
	}
}

func (d *LayeredDatabase) PostWindowCreate(handle assets.PostWindowCreateHandle) error {
	for _, layer := range d.layers {
		if err := layer.PostWindowCreate(handle); err != nil {
			return err
		}
	}
	return nil
}
