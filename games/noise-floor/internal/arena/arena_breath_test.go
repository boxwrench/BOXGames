package arena

import (
	"testing"

	"boxwrench.dev/boxgames/shared/palette"
)

func TestBreathPhaseTurnsAroundAtFullInk(t *testing.T) {
	if breathPhase(0.99, false) {
		t.Fatalf("breathPhase(0.99, advancing) = true, want false: should keep advancing below full ink")
	}
	if !breathPhase(1.0, false) {
		t.Fatalf("breathPhase(1.0, advancing) = false, want true: should start receding at full ink")
	}
}

func TestBreathPhaseTurnsAroundAtCleanPage(t *testing.T) {
	if !breathPhase(0.01, true) {
		t.Fatalf("breathPhase(0.01, receding) = false, want true: should keep receding above clean")
	}
	if breathPhase(0, true) {
		t.Fatalf("breathPhase(0, receding) = true, want false: should resume advancing at a clean page")
	}
}

func TestBreathCycleCompletesBothDirections(t *testing.T) {
	c := NewCorruption(safeRadiusMax, safeRadiusMin)
	receding := false
	sawFullInk, sawCleanAgain := false, false

	// 40s at 60fps is comfortably more than one full cycle (~8.3s in, ~1.7s out).
	for i := 0; i < 40*60; i++ {
		if receding {
			c.Recede(1.0 / 60.0)
		} else {
			c.Advance(1.0/60.0, 1.0)
		}
		level := c.Level()
		receding = breathPhase(level, receding)
		if level >= 1 {
			sawFullInk = true
		}
		if sawFullInk && level <= 0 {
			sawCleanAgain = true
		}
	}
	if !sawFullInk {
		t.Fatalf("corruption never reached full ink")
	}
	if !sawCleanAgain {
		t.Fatalf("corruption reached full ink but never washed back to a clean page")
	}
}

func TestActorColorInvertsWithCorruption(t *testing.T) {
	ink, paper := palette.Ink(), palette.Paper()

	if got := actorColor(0); got.R() != ink.R() || got.G() != ink.G() || got.B() != ink.B() {
		t.Fatalf("actorColor(0) = %v, want ink %v: actors must be dark on a cream page", got, ink)
	}
	if got := actorColor(1); got.R() != paper.R() || got.G() != paper.G() || got.B() != paper.B() {
		t.Fatalf("actorColor(1) = %v, want paper %v: actors must be light on an ink page", got, paper)
	}

	// Midway must sit strictly between the two, or an actor passes through a
	// value that matches the ground and vanishes.
	mid := actorColor(0.5)
	if !(mid.R() > ink.R() && mid.R() < paper.R()) {
		t.Fatalf("actorColor(0.5).R = %v, want strictly between %v and %v", mid.R(), ink.R(), paper.R())
	}
}

func TestActorColorClampsOutOfRange(t *testing.T) {
	ink, paper := palette.Ink(), palette.Paper()
	if got := actorColor(-5); got.R() != ink.R() {
		t.Fatalf("actorColor(-5).R = %v, want ink %v", got.R(), ink.R())
	}
	if got := actorColor(5); got.R() != paper.R() {
		t.Fatalf("actorColor(5).R = %v, want paper %v", got.R(), paper.R())
	}
}
