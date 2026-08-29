package spritesheet

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestLoadAtlasParsesGeneratedPlaceholder proves the placeholder atlas
// generator (tools/spritegen/placeholder.py) and this package's LoadAtlas
// agree on the schema. A generator and loader that disagree about the schema
// is the most likely failure mode for this package, so this test reads
// whatever the generator actually wrote, if anything, rather than a fixture
// we wrote ourselves.
//
// It skips cleanly when no generated sheet exists yet (e.g. before the
// generator has been run, or in an environment without Pillow), rather than
// failing the whole package.
func TestLoadAtlasParsesGeneratedPlaceholder(t *testing.T) {
	sheetsDir := filepath.Join("..", "..", "games", "noise-floor", "assets", "sheets")
	entries, err := os.ReadDir(sheetsDir)
	if err != nil {
		t.Skipf("no sheets dir at %s yet (%v) -- run tools/spritegen/placeholder.py first", sheetsDir, err)
	}

	var jsonFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".png.json") {
			jsonFiles = append(jsonFiles, e.Name())
		}
	}
	if len(jsonFiles) == 0 {
		t.Skipf("no *.png.json sheets in %s yet -- run tools/spritegen/placeholder.py first", sheetsDir)
	}

	for _, name := range jsonFiles {
		name := name
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(sheetsDir, name))
			if err != nil {
				t.Fatalf("reading %s: %v", name, err)
			}
			a, err := LoadAtlas(data)
			if err != nil {
				t.Fatalf("LoadAtlas(%s): %v -- generator and loader disagree about the schema", name, err)
			}
			if a.W <= 0 || a.H <= 0 {
				t.Errorf("%s: atlas dims = %dx%d, want positive", name, a.W, a.H)
			}
			wantImage := strings.TrimSuffix(name, ".json")
			if a.Image != wantImage {
				t.Errorf("%s: Image = %q, want %q", name, a.Image, wantImage)
			}
			idle, ok := a.Clips["idle"]
			if !ok {
				t.Fatalf("%s: no \"idle\" clip, got %v", name, a.Clips)
			}
			if idle.FPS <= 0 {
				t.Errorf("%s: idle.FPS = %v, want positive", name, idle.FPS)
			}
			if len(idle.Frames) == 0 {
				t.Errorf("%s: idle has no frames", name)
			}

			// Exercise the whole animator path too, since this is the point
			// of the package: play the clip and pull UVs for a couple of
			// frames without panicking or erroring.
			an := NewAnimator(a)
			if err := an.Play("idle"); err != nil {
				t.Fatalf("%s: Play(idle): %v", name, err)
			}
			_ = an.UVs()
			an.Update(1.0 / idle.FPS)
			_ = an.UVs()
		})
	}
}
