// Package actor holds the player and enemy behaviours.
package actor

import (
	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
)

// SafeZone is the part of the corruption model movement needs. Declaring it
// here rather than importing arena avoids an import cycle: arena imports actor
// to build the Player, so actor must not import arena.
//
// *arena.Corruption satisfies this structurally; no declaration is needed there.
type SafeZone interface {
	SafeRadius() float32
	Contains(p matrix.Vec2) bool
}

// MoveInput is a sampled movement intent, each axis in -1..1. Keeping it
// separate from the keyboard lets movement be tested without a window.
type MoveInput struct {
	X, Y float32
}

// MoveDelta converts an intent into a world-space offset for this frame.
// Diagonals are normalised so they are not faster than cardinals.
func MoveDelta(in MoveInput, speed float32, dt float64) matrix.Vec2 {
	dir := matrix.NewVec2(in.X, in.Y)
	if dir.IsZero() {
		return matrix.Vec2Zero()
	}
	return dir.Normal().Scale(speed * float32(dt))
}

// ClampToSafeZone pulls a position back onto the corruption boundary,
// preserving direction. The safe zone is the play area; ink is death.
func ClampToSafeZone(pos matrix.Vec2, z SafeZone) matrix.Vec2 {
	if z.Contains(pos) {
		return pos
	}
	if pos.IsZero() {
		return pos // guard: normalising zero divides by zero
	}
	return pos.Normal().Scale(z.SafeRadius())
}

// Player is BX-77.
type Player struct {
	Entity *engine.Entity
	Speed  float32
	pos    matrix.Vec2
}

func NewPlayer(host *engine.Host, speed float32) *Player {
	return &Player{
		Entity: engine.NewEntity(host.WorkGroup()),
		Speed:  speed,
	}
}

// Update advances the player by one frame of already-sampled input.
func (p *Player) Update(in MoveInput, z SafeZone, dt float64) {
	p.pos = ClampToSafeZone(p.pos.Add(MoveDelta(in, p.Speed, dt)), z)
	// Sprites live in the XY plane; z carries draw order, never depth of field.
	p.Entity.Transform.SetPosition(matrix.NewVec3(p.pos.X(), p.pos.Y(), 0.1))
}

func (p *Player) Position() matrix.Vec2 { return p.pos }
