package arena

import (
	"testing"

	"kaijuengine.com/matrix"
)

func TestStartsClean(t *testing.T) {
	c := NewCorruption(10, 2)
	if got := c.SafeRadius(); got != 10 {
		t.Fatalf("SafeRadius() = %v, want 10 (a fresh page is fully clean)", got)
	}
	if got := c.Level(); got != 0 {
		t.Fatalf("Level() = %v, want 0", got)
	}
}

func TestAdvanceShrinksSafeZone(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(1.0, 1.0)
	if got := c.SafeRadius(); got >= 10 {
		t.Fatalf("SafeRadius() = %v, want < 10 after advancing", got)
	}
	if got := c.Level(); got <= 0 {
		t.Fatalf("Level() = %v, want > 0 after advancing", got)
	}
}

func TestAdvanceClampsAtMinRadius(t *testing.T) {
	c := NewCorruption(10, 2)
	for range 1000 {
		c.Advance(1.0, 1.0)
	}
	if got := c.SafeRadius(); got != 2 {
		t.Fatalf("SafeRadius() = %v, want exactly 2 (clamped at min)", got)
	}
	if got := c.Level(); got != 1 {
		t.Fatalf("Level() = %v, want exactly 1 when fully corrupted", got)
	}
}

func TestRecedeRestoresTowardClean(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(3.0, 1.0)
	shrunk := c.SafeRadius()
	c.Recede(1.0)
	if got := c.SafeRadius(); got <= shrunk {
		t.Fatalf("SafeRadius() = %v, want > %v after receding", got, shrunk)
	}
}

func TestRecedeClampsAtMaxRadius(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(1.0, 1.0)
	for range 1000 {
		c.Recede(1.0)
	}
	if got := c.SafeRadius(); got != 10 {
		t.Fatalf("SafeRadius() = %v, want exactly 10 (clamped at max)", got)
	}
}

func TestContainsUsesSafeRadius(t *testing.T) {
	c := NewCorruption(10, 2)
	if !c.Contains(matrix.NewVec2(0, 0)) {
		t.Fatal("origin must be inside a clean page")
	}
	if !c.Contains(matrix.NewVec2(9.9, 0)) {
		t.Fatal("point just inside the radius must be contained")
	}
	if c.Contains(matrix.NewVec2(10.1, 0)) {
		t.Fatal("point outside the radius must not be contained")
	}
}

func TestPressureScalesAdvanceRate(t *testing.T) {
	slow := NewCorruption(10, 2)
	fast := NewCorruption(10, 2)
	slow.Advance(1.0, 0.5)
	fast.Advance(1.0, 2.0)
	if fast.SafeRadius() >= slow.SafeRadius() {
		t.Fatalf("higher pressure must shrink faster: fast=%v slow=%v",
			fast.SafeRadius(), slow.SafeRadius())
	}
}

func TestResetRestoresCleanPage(t *testing.T) {
	c := NewCorruption(10, 2)
	c.Advance(5.0, 1.0)
	c.Reset()
	if c.SafeRadius() != 10 || c.Level() != 0 {
		t.Fatalf("Reset() left radius=%v level=%v, want 10 and 0",
			c.SafeRadius(), c.Level())
	}
}
