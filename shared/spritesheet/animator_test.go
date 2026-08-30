package spritesheet

import "testing"

// testAtlas builds a small atlas with a 4-frame looping "idle" clip at 8 FPS
// (0.125s/frame) and a 2-frame non-looping "death" clip at 10 FPS (0.1s/frame).
// Frames carry distinct X offsets so FrameUVs output differs per frame and
// tests can tell which frame is current from UVs() alone.
func testAtlas() *Atlas {
	return &Atlas{
		Image: "test.png",
		W:     128,
		H:     32,
		Clips: map[string]*Clip{
			"idle": {
				FPS:  8,
				Loop: true,
				Frames: []Rect{
					{X: 0, Y: 0, W: 32, H: 32},
					{X: 32, Y: 0, W: 32, H: 32},
					{X: 64, Y: 0, W: 32, H: 32},
					{X: 96, Y: 0, W: 32, H: 32},
				},
			},
			"death": {
				FPS:  10,
				Loop: false,
				Frames: []Rect{
					{X: 0, Y: 0, W: 32, H: 32},
					{X: 32, Y: 0, W: 32, H: 32},
				},
			},
		},
	}
}

// frameIndex returns which of atlas idle-clip's frames the animator's current
// UVs correspond to, by comparing X offsets (each frame has a unique X).
func frameIndexOf(t *testing.T, a *Atlas, clip string, an *Animator) int {
	t.Helper()
	uvs := an.UVs()
	for i, r := range a.Clips[clip].Frames {
		want := a.FrameUVs(r)
		if uvs.X() == want.X() && uvs.Y() == want.Y() && uvs.Z() == want.Z() && uvs.W() == want.W() {
			return i
		}
	}
	t.Fatalf("UVs() %v did not match any frame of clip %q", uvs, clip)
	return -1
}

func TestPlayStartsAtFirstFrame(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	if err := an.Play("idle"); err != nil {
		t.Fatalf("Play: %v", err)
	}
	if got := frameIndexOf(t, a, "idle", an); got != 0 {
		t.Errorf("frame after Play = %d, want 0", got)
	}
}

func TestPlayUnknownClipErrorsAndLeavesFrameUnchanged(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	if err := an.Play("idle"); err != nil {
		t.Fatalf("Play(idle): %v", err)
	}
	an.Update(1.0 / 8.0) // advance to frame 1
	before := an.UVs()

	err := an.Play("nonexistent")
	if err == nil {
		t.Fatal("Play(nonexistent): expected error, got nil")
	}
	after := an.UVs()
	if before != after {
		t.Errorf("UVs changed after failed Play: before=%v after=%v", before, after)
	}
}

func TestFrameAdvanceAtFixedDt(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	an.Play("idle") // 8 FPS -> 1/8s per frame

	an.Update(1.0 / 8.0)
	if got := frameIndexOf(t, a, "idle", an); got != 1 {
		t.Errorf("after one frame-duration step, frame = %d, want 1", got)
	}
}

func TestLoopWrap(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	an.Play("idle") // 4 frames, 8 FPS, 0.5s total duration

	an.Update(1.0/8.0*4 + 1.0/8.0*0.5) // one full loop plus half a frame
	if got := frameIndexOf(t, a, "idle", an); got != 0 {
		t.Errorf("after wrap of 4.5 frames, frame = %d, want 0", got)
	}
}

func TestLoopWrapDtLargerThanWholeClip(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	an.Play("idle") // 0.5s total duration

	an.Update(10.0) // many multiples of clip duration
	got := frameIndexOf(t, a, "idle", an)
	if got < 0 || got > 3 {
		t.Fatalf("frame out of range: %d", got)
	}
}

func TestPlayOnceClamping(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	an.Play("death") // 2 frames, non-looping

	an.Update(1000.0) // absurdly far past the end
	got := frameIndexOf(t, a, "death", an)
	if got != 1 {
		t.Errorf("frame after huge dt on non-looping clip = %d, want 1 (final frame, clamped)", got)
	}

	// Further updates must not panic or move past the final frame.
	an.Update(1000.0)
	got = frameIndexOf(t, a, "death", an)
	if got != 1 {
		t.Errorf("frame after second huge dt = %d, want still 1", got)
	}
}

func TestOnEndFiresExactlyOnce(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	count := 0
	var lastClip string
	an.OnEnd(func(clip string) {
		count++
		lastClip = clip
	})
	an.Play("death") // 2 frames @ 10 FPS = 0.2s total

	// A single large dt that jumps past the end must still fire exactly once.
	an.Update(1000.0)
	if count != 1 {
		t.Fatalf("OnEnd fire count = %d, want 1", count)
	}
	if lastClip != "death" {
		t.Errorf("OnEnd clip = %q, want death", lastClip)
	}

	// Subsequent updates on the now-finished clip must not fire again.
	an.Update(5.0)
	an.Update(5.0)
	if count != 1 {
		t.Fatalf("OnEnd fire count after further updates = %d, want still 1", count)
	}
}

func TestOnEndFiresExactlyOnceSteppedToEnd(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	count := 0
	an.OnEnd(func(clip string) { count++ })
	an.Play("death") // 2 frames @ 10 FPS = 0.1s/frame

	an.Update(1.0 / 10.0) // lands exactly on frame 1 (final frame)
	if count != 1 {
		t.Fatalf("OnEnd fire count after reaching final frame = %d, want 1", count)
	}
	an.Update(1.0 / 10.0) // still on final frame, must not refire
	if count != 1 {
		t.Fatalf("OnEnd fire count after extra step = %d, want still 1", count)
	}
}

func TestOnEndDoesNotFireForLoopingClips(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	count := 0
	an.OnEnd(func(clip string) { count++ })
	an.Play("idle") // looping

	an.Update(1000.0) // many loops
	if count != 0 {
		t.Errorf("OnEnd fire count for looping clip = %d, want 0", count)
	}
}

func TestReplayingSameClipRestarts(t *testing.T) {
	a := testAtlas()
	an := NewAnimator(a)
	an.Play("idle")
	an.Update(1.0 / 8.0) // now on frame 1

	if err := an.Play("idle"); err != nil {
		t.Fatalf("Play: %v", err)
	}
	if got := frameIndexOf(t, a, "idle", an); got != 0 {
		t.Errorf("frame after replaying same clip = %d, want 0 (restarted)", got)
	}
}
