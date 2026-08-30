package arena

import (
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/shared/palette"

	"kaijuengine.com/matrix"
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

// colorEquals reports whether two colors match on every channel actorColor
// touches (R, G, B — A is always 1 and not exercised here).
func colorEquals(a, b matrix.Color) bool {
	return a.R() == b.R() && a.G() == b.G() && a.B() == b.B()
}

func TestActorColorDeepInsideZoneIsInk(t *testing.T) {
	ink := palette.Ink()
	// safeRadiusMax - actorTintBand is the inner edge of the band; well
	// short of that, e.g. distance 2, is unambiguously "deep inside".
	pos := matrix.NewVec2(2, 0)
	if got := actorColor(pos, safeRadiusMax); !colorEquals(got, ink) {
		t.Fatalf("actorColor(deep inside, safeRadius=%v) = %v, want ink %v: "+
			"an actor well inside the safe zone must be dark on cream", safeRadiusMax, got, ink)
	}
}

func TestActorColorFarOutsideZoneIsPaper(t *testing.T) {
	paper := palette.Paper()
	pos := matrix.NewVec2(100, 0)
	if got := actorColor(pos, safeRadiusMax); !colorEquals(got, paper) {
		t.Fatalf("actorColor(far outside, safeRadius=%v) = %v, want paper %v: "+
			"an actor well outside the safe zone must be light on ink", safeRadiusMax, got, paper)
	}
}

func TestActorColorOnBoundaryIsStrictlyBetween(t *testing.T) {
	ink, paper := palette.Ink(), palette.Paper()
	// Exactly on the boundary: distance == safeRadius.
	pos := matrix.NewVec2(safeRadiusMax, 0)
	got := actorColor(pos, safeRadiusMax)
	if !(got.R() > ink.R() && got.R() < paper.R()) {
		t.Fatalf("actorColor(on boundary).R = %v, want strictly between ink %v and paper %v",
			got.R(), ink.R(), paper.R())
	}
	if !(got.G() > ink.G() && got.G() < paper.G()) {
		t.Fatalf("actorColor(on boundary).G = %v, want strictly between ink %v and paper %v",
			got.G(), ink.G(), paper.G())
	}
	if !(got.B() > ink.B() && got.B() < paper.B()) {
		t.Fatalf("actorColor(on boundary).B = %v, want strictly between ink %v and paper %v",
			got.B(), ink.B(), paper.B())
	}
}

func TestActorColorMonotonicAcrossBand(t *testing.T) {
	// Sample radii spanning from below the inner edge of the band to above
	// the outer edge, and confirm the tint moves toward paper (never
	// reverses toward ink) at every step.
	radii := []float32{
		safeRadiusMax - actorTintBand - 0.1, // below the band: clamped ink
		safeRadiusMax - actorTintBand,       // inner edge
		safeRadiusMax - 0.1,
		safeRadiusMax, // boundary, midpoint of the crossfade
		safeRadiusMax + 0.1,
		safeRadiusMax + actorTintBand,       // outer edge
		safeRadiusMax + actorTintBand + 0.1, // above the band: clamped paper
	}

	prev := actorColor(matrix.NewVec2(radii[0], 0), safeRadiusMax)
	for _, r := range radii[1:] {
		got := actorColor(matrix.NewVec2(r, 0), safeRadiusMax)
		if got.R() < prev.R() || got.G() < prev.G() || got.B() < prev.B() {
			t.Fatalf("actorColor at radius %v = %v moved back toward ink from previous %v: not monotonic", r, got, prev)
		}
		prev = got
	}
}

func TestActorColorClampsAtExtremes(t *testing.T) {
	ink, paper := palette.Ink(), palette.Paper()

	// An absurdly small distance (deep inside, far past the inner edge)
	// must sit exactly at ink -- no overshoot past the endpoint.
	if got := actorColor(matrix.NewVec2(0, 0), 1e6); !colorEquals(got, ink) {
		t.Fatalf("actorColor(absurdly inside) = %v, want ink %v exactly", got, ink)
	}

	// An absurdly large distance (far past the outer edge) must sit exactly
	// at paper -- no overshoot past the endpoint.
	if got := actorColor(matrix.NewVec2(1e6, 0), 1); !colorEquals(got, paper) {
		t.Fatalf("actorColor(absurdly outside) = %v, want paper %v exactly", got, paper)
	}
}

func TestActorColorAtCentreIsHandled(t *testing.T) {
	// A zero-length position (an actor exactly at the centre) is the same
	// zero-vector hazard the codebase guards elsewhere (see
	// actor.ClampToSafeZone). actorColor only calls Length(), which is safe
	// at the origin, but the behaviour must still be pinned down: the centre
	// is always deep inside the safe zone, so it must read as ink.
	ink := palette.Ink()
	if got := actorColor(matrix.Vec2Zero(), safeRadiusMax); !colorEquals(got, ink) {
		t.Fatalf("actorColor(zero vector, safeRadius=%v) = %v, want ink %v", safeRadiusMax, got, ink)
	}
}

func TestActorColorAtSpawnDistanceIsPaper(t *testing.T) {
	// Enemies spawn at safeRadius + horde.SpawnMargin, which is beyond
	// actorTintBand (1.5 > 0.6). A freshly spawned enemy must therefore be
	// paper-coloured against the ink it spawns on -- this is precisely the
	// bug this task fixes.
	paper := palette.Paper()
	spawnDist := safeRadiusMax + horde.SpawnMargin
	pos := matrix.NewVec2(spawnDist, 0)
	if got := actorColor(pos, safeRadiusMax); !colorEquals(got, paper) {
		t.Fatalf("actorColor(spawn distance) = %v, want paper %v: "+
			"a freshly spawned enemy must be light against the ink it lands on", got, paper)
	}
}
