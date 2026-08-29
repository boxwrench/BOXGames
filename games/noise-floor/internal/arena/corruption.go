// Package arena owns the fixed single-screen play space: camera framing,
// bounds, and the corruption model that doubles as the arena boundary.
package arena

import "kaijuengine.com/matrix"

// Tuning constants. advanceRate is world units per second at pressure 1.0.
const (
	advanceRate = 0.6
	recedeRate  = 3.0
)

// Corruption is the shrinking safe zone that is simultaneously the difficulty
// curve and the art direction (design spec §1.1).
//
// The boundary is a plain radius owned here on the CPU. The fragment shader
// decorates it with noise but never defines it — see spec §5.1 for why
// bit-identical noise in Go and GLSL was rejected.
type Corruption struct {
	maxRadius float32
	minRadius float32
	radius    float32
}

func NewCorruption(maxRadius, minRadius float32) *Corruption {
	return &Corruption{
		maxRadius: maxRadius,
		minRadius: minRadius,
		radius:    maxRadius,
	}
}

// Advance eats the page inward. pressure scales the rate, letting the wave
// director push harder as a wave runs on.
func (c *Corruption) Advance(dt float64, pressure float32) {
	c.radius -= advanceRate * pressure * float32(dt)
	if c.radius < c.minRadius {
		c.radius = c.minRadius
	}
}

// Recede washes the page back toward cream, used on wave clear.
func (c *Corruption) Recede(dt float64) {
	c.radius += recedeRate * float32(dt)
	if c.radius > c.maxRadius {
		c.radius = c.maxRadius
	}
}

// SafeRadius is the CPU-authoritative boundary. Gameplay hit-tests this.
func (c *Corruption) SafeRadius() float32 { return c.radius }

// Level is 0 for a clean page and 1 for one fully consumed. This is the value
// handed to the stain shader.
func (c *Corruption) Level() float32 {
	span := c.maxRadius - c.minRadius
	if span <= 0 {
		return 0
	}
	return (c.maxRadius - c.radius) / span
}

// Contains reports whether a world point is still on clean paper.
func (c *Corruption) Contains(p matrix.Vec2) bool {
	return p.Length() <= c.radius
}

// Reset restores a clean page.
func (c *Corruption) Reset() { c.radius = c.maxRadius }
