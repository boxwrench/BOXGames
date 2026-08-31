package arena

import (
	"testing"

	"boxwrench.dev/boxgames/shared/spritesheet"
)

// projectileTestAtlas builds a tiny atlas with a 2-frame looping clip named
// projectileClip, distinct enough per-frame (different X offsets) that
// UVs() alone reveals which frame is current -- the same shape
// render/spriteset_test.go's testAtlas uses for the equivalent SpriteSet
// test.
func projectileTestAtlas() *spritesheet.Atlas {
	return &spritesheet.Atlas{
		Image: "shot.png",
		W:     64,
		H:     32,
		Clips: map[string]*spritesheet.Clip{
			projectileClip: {
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

// TestProjectileViewFiredResetsAnimatorToFirstFrame confirms Fired restarts
// a slot's animator on projectileClip's first frame -- without this, a slot
// recycled from an earlier, expired shot would resume mid-animation from
// wherever its previous occupant left it, since projectile sprites are
// addressed positionally (via SpriteSet.At) rather than reset by
// SpriteSet.Acquire the way enemy sprites are.
func TestProjectileViewFiredResetsAnimatorToFirstFrame(t *testing.T) {
	atlas := projectileTestAtlas()
	an := spritesheet.NewAnimator(atlas)
	if err := an.Play(projectileClip); err != nil {
		t.Fatalf("Play(%q): %v", projectileClip, err)
	}
	an.Update(1.0 / 8.0) // advance off frame 0, simulating a previous occupant mid-animation

	frame0 := atlas.FrameUVs(atlas.Clips[projectileClip].Frames[0])
	if an.UVs() == frame0 {
		t.Fatal("test setup bug: animator did not actually advance off frame 0")
	}

	v := &projectileView{animators: []*spritesheet.Animator{an}}
	v.Fired(0)

	if got := an.UVs(); got != frame0 {
		t.Errorf("after Fired, UVs = %v, want frame 0 UVs %v (a reused slot must not resume mid-animation)", got, frame0)
	}
}
