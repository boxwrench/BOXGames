package spritesheet

import (
	"fmt"
	"math"

	"kaijuengine.com/matrix"
)

// Animator plays clips from one atlas. Create one per entity; the atlas
// (image + clip data) is shared across every animator that uses it.
type Animator struct {
	atlas    *Atlas
	clipName string
	clip     *Clip

	frameIndex int
	elapsed    float64 // seconds into the current play of the clip
	ended      bool    // true once a non-looping clip has reached its final frame

	onEnd func(clip string)
}

// NewAnimator creates an Animator over the given atlas. Call Play before
// Update or UVs will do anything useful.
func NewAnimator(a *Atlas) *Animator {
	return &Animator{atlas: a}
}

// Play starts a clip from its first frame. Playing the clip that is already
// playing restarts it from frame 0. Returns an error and leaves the current
// frame unchanged if the name is unknown.
func (an *Animator) Play(name string) error {
	clip, ok := an.atlas.Clips[name]
	if !ok {
		return fmt.Errorf("spritesheet: unknown clip %q", name)
	}
	an.clipName = name
	an.clip = clip
	an.frameIndex = 0
	an.elapsed = 0
	an.ended = false
	return nil
}

// Update advances playback by dt seconds.
//
// A looping clip wraps, including when dt exceeds the whole clip duration. A
// non-looping clip advances to its final frame and stays there — it never
// wraps and never indexes out of range, no matter how large dt is — firing
// OnEnd exactly once at the moment it reaches that final frame.
func (an *Animator) Update(dt float64) {
	if an.clip == nil || len(an.clip.Frames) == 0 || an.ended {
		return
	}
	frameDur := 1.0 / an.clip.FPS
	n := len(an.clip.Frames)
	an.elapsed += dt

	if an.clip.Loop {
		total := frameDur * float64(n)
		wrapped := math.Mod(an.elapsed, total)
		if wrapped < 0 {
			wrapped += total
		}
		an.elapsed = wrapped
		idx := int(wrapped / frameDur)
		if idx >= n {
			idx = n - 1
		}
		an.frameIndex = idx
		return
	}

	idx := int(an.elapsed / frameDur)
	if idx >= n-1 {
		an.frameIndex = n - 1
		an.ended = true
		if an.onEnd != nil {
			an.onEnd(an.clipName)
		}
		return
	}
	an.frameIndex = idx
}

// UVs is the current frame's UVs, ready to assign to ShaderDataUnlit.UVs. It
// is the zero Vec4 if no clip has been played yet.
func (an *Animator) UVs() matrix.Vec4 {
	if an.clip == nil || len(an.clip.Frames) == 0 {
		return matrix.Vec4{}
	}
	return an.atlas.FrameUVs(an.clip.Frames[an.frameIndex])
}

// OnEnd registers fn to be called once when a non-looping clip reaches its
// final frame. It is not called for looping clips. Setting it replaces any
// previously registered callback.
func (an *Animator) OnEnd(fn func(clip string)) {
	an.onEnd = fn
}
