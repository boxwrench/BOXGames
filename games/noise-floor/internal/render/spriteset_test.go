package render

import (
	"testing"

	"boxwrench.dev/boxgames/shared/spritesheet"
)

// testAtlas builds a tiny atlas with a 2-frame looping "idle" clip, distinct
// enough per-frame (different X offsets) that UVs() alone reveals which
// frame is current.
func testAtlas() *spritesheet.Atlas {
	return &spritesheet.Atlas{
		Image: "test.png",
		W:     64,
		H:     32,
		Clips: map[string]*spritesheet.Clip{
			"idle": {
				FPS:  8,
				Loop: true,
				Frames: []spritesheet.Rect{
					{X: 0, Y: 0, W: 32, H: 32},
					{X: 32, Y: 0, W: 32, H: 32},
				},
			},
		},
	}
}

// TestResetAnimatorForAcquireRestartsFromFirstFrame is the extracted-decision
// test the task-9b brief asks for: Acquire must reset a reused slot's
// animator to the clip's first frame, or a slot handed to a freshly spawned
// enemy would resume mid-animation from whatever its previous occupant left
// it playing -- a glitch, not a fresh start.
//
// SpriteSet itself cannot be constructed in this test (NewSpriteSet needs a
// live, GPU-backed engine.Host, which nothing in this package's tests has --
// see enemies_test.go's fakeSpriteBank for the same constraint one layer up),
// so this exercises the reset decision Acquire delegates to directly.
func TestResetAnimatorForAcquireRestartsFromFirstFrame(t *testing.T) {
	atlas := testAtlas()
	an := spritesheet.NewAnimator(atlas)
	if err := an.Play("idle"); err != nil {
		t.Fatalf("Play(idle): %v", err)
	}
	an.Update(1.0 / 8.0) // advance off frame 0, simulating a previous occupant mid-animation

	frame0 := atlas.FrameUVs(atlas.Clips["idle"].Frames[0])
	if an.UVs() == frame0 {
		t.Fatal("test setup bug: animator did not actually advance off frame 0")
	}

	resetAnimatorForAcquire(an, "idle")

	if got := an.UVs(); got != frame0 {
		t.Errorf("after resetAnimatorForAcquire, UVs = %v, want frame 0 UVs %v (a reused slot must not resume mid-animation)", got, frame0)
	}
}
