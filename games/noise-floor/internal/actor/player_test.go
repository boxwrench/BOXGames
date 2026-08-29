package actor

import (
	"testing"

	"kaijuengine.com/matrix"
)

// fakeZone stands in for *arena.Corruption. Depending on an interface rather
// than the concrete type is what keeps actor free of an import cycle.
type fakeZone struct{ radius float32 }

func (z fakeZone) SafeRadius() float32         { return z.radius }
func (z fakeZone) Contains(p matrix.Vec2) bool { return p.Length() <= z.radius }

func TestMoveDeltaIsZeroWithNoInput(t *testing.T) {
	got := MoveDelta(MoveInput{}, 5, 1.0)
	if !got.IsZero() {
		t.Fatalf("MoveDelta with no input = %v, want zero", got)
	}
}

func TestMoveDeltaScalesBySpeedAndTime(t *testing.T) {
	got := MoveDelta(MoveInput{X: 1}, 5, 2.0)
	if got.X() != 10 {
		t.Fatalf("MoveDelta().X() = %v, want 10 (speed 5 * dt 2)", got.X())
	}
	if got.Y() != 0 {
		t.Fatalf("MoveDelta().Y() = %v, want 0", got.Y())
	}
}

// Diagonal input must not be faster than cardinal input — the classic bug.
func TestDiagonalMovementIsNormalized(t *testing.T) {
	cardinal := MoveDelta(MoveInput{X: 1}, 5, 1.0)
	diagonal := MoveDelta(MoveInput{X: 1, Y: 1}, 5, 1.0)
	const epsilon = 0.001
	if matrix.Abs(diagonal.Length()-cardinal.Length()) > epsilon {
		t.Fatalf("diagonal length %v != cardinal length %v",
			diagonal.Length(), cardinal.Length())
	}
}

func TestClampToSafeZoneLeavesInteriorAlone(t *testing.T) {
	c := fakeZone{radius: 10}
	pos := matrix.NewVec2(3, 4) // length 5, well inside
	if got := ClampToSafeZone(pos, c); !got.Equals(pos) {
		t.Fatalf("ClampToSafeZone(%v) = %v, want unchanged", pos, got)
	}
}

func TestClampToSafeZonePullsBackToBoundary(t *testing.T) {
	c := fakeZone{radius: 10}
	pos := matrix.NewVec2(30, 40) // length 50, far outside
	got := ClampToSafeZone(pos, c)
	const epsilon = 0.001
	if matrix.Abs(got.Length()-10) > epsilon {
		t.Fatalf("clamped length = %v, want 10 (the safe radius)", got.Length())
	}
	// Direction must be preserved: (30,40) normalises to (0.6,0.8).
	if matrix.Abs(got.X()-6) > epsilon || matrix.Abs(got.Y()-8) > epsilon {
		t.Fatalf("clamped to %v, want (6,8) — direction must be preserved", got)
	}
}

func TestClampToSafeZoneHandlesOrigin(t *testing.T) {
	c := fakeZone{radius: 10}
	// Normalising a zero vector divides by zero; the origin must be safe.
	got := ClampToSafeZone(matrix.NewVec2(0, 0), c)
	if got.IsNaN() {
		t.Fatal("ClampToSafeZone at the origin produced NaN")
	}
}
