package render

import (
	"fmt"

	"kaijuengine.com/engine"
)

// SpriteSet is a fixed bank of sprites sharing one atlas, all created up
// front and hidden. Enemies borrow one while alive.
//
// Everything is created in NewSpriteSet — no allocation during play, per
// spec §5.2, where the stated risk is allocation churn and GC pauses during a
// wave rather than raw sprite throughput.
type SpriteSet struct {
	sprites []*Sprite
	free    []int
	live    []bool
}

// NewSpriteSet creates capacity hidden sprites for one atlas, all textured
// from textureKey in the content database.
func NewSpriteSet(host *engine.Host, textureKey string, size float32, capacity int) (*SpriteSet, error) {
	s := &SpriteSet{
		sprites: make([]*Sprite, capacity),
		free:    make([]int, capacity),
		live:    make([]bool, capacity),
	}
	for i := 0; i < capacity; i++ {
		sp, err := NewSprite(host, textureKey, size)
		if err != nil {
			return nil, fmt.Errorf("render: creating sprite %d/%d for %q: %w", i+1, capacity, textureKey, err)
		}
		sp.index = i
		s.sprites[i] = sp
		// Fill back-to-front so the first Acquire returns index 0, matching
		// shared/pool's convention for stable, debuggable traversal order.
		s.free[i] = capacity - 1 - i
	}
	return s, nil
}

// Acquire takes a hidden sprite and shows it. ok is false when the set is
// exhausted, which is an expected condition, not an error.
func (s *SpriteSet) Acquire() (sp *Sprite, ok bool) {
	n := len(s.free)
	if n == 0 {
		return nil, false
	}
	idx := s.free[n-1]
	s.free = s.free[:n-1]
	s.live[idx] = true
	sp = s.sprites[idx]
	sp.Show()
	return sp, true
}

// Release hides a sprite and returns it to the set. Releasing a sprite this
// set did not hand out, or double-releasing one, is ignored rather than
// corrupting the free list.
func (s *SpriteSet) Release(sp *Sprite) {
	idx := sp.index
	if idx < 0 || idx >= len(s.sprites) || s.sprites[idx] != sp || !s.live[idx] {
		return
	}
	s.live[idx] = false
	sp.Hide()
	s.free = append(s.free, idx)
}
