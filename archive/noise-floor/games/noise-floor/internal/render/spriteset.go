package render

import (
	"fmt"

	"boxwrench.dev/boxgames/shared/spritesheet"
	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
)

// SpriteSet is a fixed bank of sprites sharing one atlas, all created up
// front and hidden, each paired with its own animator playing clip. Enemies
// borrow one pair while alive.
//
// The animator shares the sprite's lifetime rather than being pooled
// separately: a caller that needs a sprite always needs an animator to drive
// it, and always releases both together, so two pools with independent
// lifetimes for the same use would just be two chances to leak one of them
// (see task-9b brief).
//
// Everything is created in NewSpriteSet — no allocation during play, per
// spec §5.2, where the stated risk is allocation churn and GC pauses during a
// wave rather than raw sprite throughput.
type SpriteSet struct {
	sprites   []*Sprite
	animators []*spritesheet.Animator
	clip      string
	free      []int
	live      []bool
}

// NewSpriteSet creates capacity hidden sprites for one atlas, each with its
// own animator playing clip. Nothing is allocated after construction.
func NewSpriteSet(host *engine.Host, textureKey string, size float32, capacity int,
	atlas *spritesheet.Atlas, clip string) (*SpriteSet, error) {
	s := &SpriteSet{
		sprites:   make([]*Sprite, capacity),
		animators: make([]*spritesheet.Animator, capacity),
		clip:      clip,
		free:      make([]int, capacity),
		live:      make([]bool, capacity),
	}
	for i := 0; i < capacity; i++ {
		sp, err := NewSprite(host, textureKey, size)
		if err != nil {
			return nil, fmt.Errorf("render: creating sprite %d/%d for %q: %w", i+1, capacity, textureKey, err)
		}
		sp.index = i
		s.sprites[i] = sp

		an := spritesheet.NewAnimator(atlas)
		if err := an.Play(clip); err != nil {
			return nil, fmt.Errorf("render: creating animator %d/%d for %q: %w", i+1, capacity, textureKey, err)
		}
		s.animators[i] = an

		// Fill back-to-front so the first Acquire returns index 0, matching
		// shared/pool's convention for stable, debuggable traversal order.
		s.free[i] = capacity - 1 - i
	}
	return s, nil
}

// Acquire takes a hidden sprite and its animator, and shows the sprite. ok is
// false when the set is exhausted, which is an expected condition, not an
// error.
//
// The animator is reset to clip's first frame before it is handed out: a
// reused slot's animator otherwise resumes wherever its previous occupant
// left it, which reads as a glitch (a freshly spawned enemy mid-animation)
// rather than a fresh start.
func (s *SpriteSet) Acquire() (sp *Sprite, an *spritesheet.Animator, ok bool) {
	n := len(s.free)
	if n == 0 {
		return nil, nil, false
	}
	idx := s.free[n-1]
	s.free = s.free[:n-1]
	s.live[idx] = true
	sp = s.sprites[idx]
	an = s.animators[idx]
	resetAnimatorForAcquire(an, s.clip)
	sp.Show()
	return sp, an, true
}

// resetAnimatorForAcquire restarts an animator on clip so Acquire always
// hands out a slot at frame 0, regardless of what its previous occupant left
// it playing. Extracted from Acquire so the reset itself is unit-testable
// without a GPU-backed engine.Host, which Sprite needs but Animator does not.
//
// The error is deliberately discarded: clip was already validated by
// NewSpriteSet's own Play call when this animator was constructed, so Play
// cannot fail here.
func resetAnimatorForAcquire(an *spritesheet.Animator, clip string) {
	_ = an.Play(clip)
}

// SyncOne pushes position, current-frame UVs and tint for one sprite/
// animator pair this set has already handed out via Acquire. It exists for a
// caller that spawns outside the normal once-per-frame sweep that visits
// every live sprite (see arena.hordeView.Sync) and needs its new sprite
// drawn correctly the very frame it is acquired, rather than for one extra
// frame at wherever its recycled slot last was.
func (s *SpriteSet) SyncOne(sp *Sprite, an *spritesheet.Animator, pos matrix.Vec2, color matrix.Color) {
	sp.SetPosition(pos)
	sp.SetUVs(an.UVs())
	sp.SetColor(color)
}

// At returns the sprite and animator at positional index i directly,
// bypassing the free list. It is for a caller that addresses a SpriteSet's
// slots by a stable identity of its own -- e.g. a battery's pool handle --
// rather than acquiring and releasing through Acquire/Release. Such a slot
// is never marked live and can never be returned by Acquire or accepted by
// Release; the caller manages its own visibility and lifetime entirely
// (see arena.buildCombat's doc comment on projectile sprites).
func (s *SpriteSet) At(i int) (*Sprite, *spritesheet.Animator) {
	return s.sprites[i], s.animators[i]
}

// Release hides a sprite and returns it, and its animator, to the set.
// Releasing a sprite this set did not hand out, or double-releasing one, is
// ignored rather than corrupting the free list.
func (s *SpriteSet) Release(sp *Sprite) {
	idx := sp.index
	if idx < 0 || idx >= len(s.sprites) || s.sprites[idx] != sp || !s.live[idx] {
		return
	}
	s.live[idx] = false
	sp.Hide()
	s.free = append(s.free, idx)
}
