package weapon

import (
	"testing"

	"kaijuengine.com/matrix"
)

// fakeTarget is a minimal Target for tests -- weapon must not depend on
// horde.Enemy to test targeting, which is the whole point of the
// structural interface.
type fakeTarget struct {
	pos    matrix.Vec2
	radius float32
}

func (f fakeTarget) Position() matrix.Vec2 { return f.pos }
func (f fakeTarget) Radius() float32       { return f.radius }

func TestNearestTargetPicksClosest(t *testing.T) {
	targets := []Target{
		fakeTarget{pos: matrix.NewVec2(5, 0)},
		fakeTarget{pos: matrix.NewVec2(1, 0)},
		fakeTarget{pos: matrix.NewVec2(3, 0)},
	}
	idx, ok := NearestTarget(matrix.Vec2Zero(), targets, 100)
	if !ok {
		t.Fatal("NearestTarget returned ok=false, want true")
	}
	if idx != 1 {
		t.Fatalf("NearestTarget idx = %d, want 1 (the closest target)", idx)
	}
}

func TestNearestTargetOutOfRange(t *testing.T) {
	targets := []Target{
		fakeTarget{pos: matrix.NewVec2(50, 0)},
		fakeTarget{pos: matrix.NewVec2(20, 0)},
	}
	_, ok := NearestTarget(matrix.Vec2Zero(), targets, 9)
	if ok {
		t.Fatal("NearestTarget returned ok=true, want false: all targets are out of range")
	}
}

func TestNearestTargetTieBreaksTowardLowerIndex(t *testing.T) {
	targets := []Target{
		fakeTarget{pos: matrix.NewVec2(4, 0)},
		fakeTarget{pos: matrix.NewVec2(0, 4)}, // exactly equidistant
		fakeTarget{pos: matrix.NewVec2(4, 0)}, // exact duplicate distance too
	}
	idx, ok := NearestTarget(matrix.Vec2Zero(), targets, 100)
	if !ok {
		t.Fatal("NearestTarget returned ok=false, want true")
	}
	if idx != 0 {
		t.Fatalf("NearestTarget idx = %d, want 0 (ties break toward the lower index)", idx)
	}
}

func TestNearestTargetEmptySliceDoesNotPanic(t *testing.T) {
	_, ok := NearestTarget(matrix.Vec2Zero(), nil, 100)
	if ok {
		t.Fatal("NearestTarget on an empty slice returned ok=true, want false")
	}
}

func TestNearestTargetRespectsRangeBoundary(t *testing.T) {
	// A target exactly at maxRange distance should count as in range; one
	// just beyond it should not.
	inRange := []Target{fakeTarget{pos: matrix.NewVec2(9, 0)}}
	idx, ok := NearestTarget(matrix.Vec2Zero(), inRange, 9)
	if !ok || idx != 0 {
		t.Fatalf("target exactly at maxRange should be in range: idx=%d ok=%v", idx, ok)
	}

	outOfRange := []Target{fakeTarget{pos: matrix.NewVec2(9.01, 0)}}
	_, ok = NearestTarget(matrix.Vec2Zero(), outOfRange, 9)
	if ok {
		t.Fatal("target just beyond maxRange should be out of range")
	}
}

func TestNearestTargetReturnsNegativeOneOnFailure(t *testing.T) {
	// When no target is in range, NearestTarget must return -1, not 0, to force
	// the caller to check ok before using the index. This prevents the silent
	// bug where a forgotten ok check silently targets index 0.
	targets := []Target{
		fakeTarget{pos: matrix.NewVec2(50, 0)},
		fakeTarget{pos: matrix.NewVec2(20, 0)},
	}
	idx, ok := NearestTarget(matrix.Vec2Zero(), targets, 9)
	if ok {
		t.Fatal("NearestTarget returned ok=true for out-of-range targets, want false")
	}
	if idx != -1 {
		t.Fatalf("NearestTarget returned idx=%d on failure, want -1", idx)
	}
}
