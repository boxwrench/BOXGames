package arena

import (
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/horde"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
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

// TestActorTintBandMatchesShaderFrontSoftness pins stainFrontSoftness (and
// the actorTintBand derived from it) against FRONT_SOFTNESS in
// boxstain.frag, the same way shared/palette's TestShaderPaletteSync pins
// the palette hex tokens against the shader's PAPER/INK/BRASS/VISOR
// literals: GLSL cannot be imported into Go, so this is a manual-sync
// tripwire, not an automatic cross-file check. If this test fails, update
// whichever of stainFrontSoftness or FRONT_SOFTNESS has drifted from the
// other.
func TestActorTintBandMatchesShaderFrontSoftness(t *testing.T) {
	const expectedFrontSoftness float32 = 0.6 // FRONT_SOFTNESS in boxstain.frag
	if stainFrontSoftness != expectedFrontSoftness {
		t.Fatalf("stainFrontSoftness = %v, want %v (FRONT_SOFTNESS in boxstain.frag)",
			float32(stainFrontSoftness), expectedFrontSoftness)
	}

	// wantBand is computed here with the same runtime float32 arithmetic the
	// production constant expression uses conceptually; comparing with a
	// tight epsilon (rather than ==) absorbs the rounding-order difference
	// between that and Go's arbitrary-precision constant evaluation.
	wantBand := expectedFrontSoftness * float32(cameraZ) / float32(cameraZ-render.StainDepth)
	const epsilon = 1e-6
	diff := actorTintBand - wantBand
	if diff < -epsilon || diff > epsilon {
		t.Fatalf("actorTintBand = %v, want %v (stainFrontSoftness converted to gameplay-plane units "+
			"by the inverse of stainPlaneRadius's scaling)", actorTintBand, wantBand)
	}
}

func TestActorColorDeepInsideZoneIsInk(t *testing.T) {
	ink := palette.Ink()
	// Well short of safeRadiusMax, e.g. distance 2, is unambiguously "deep
	// inside": the ramp is one-sided now, so anything at or under
	// safeRadiusMax itself is already fully ink (see TestActorColorOnBoundaryIsInk).
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

// TestActorColorOnBoundaryIsInk asserts the actor is exactly ink right at
// the safe boundary (distance == safeRadius), not merely somewhere between
// ink and paper. This is the corrected behaviour, not an incidental one: the
// ramp now matches the shader's own one-sided
// smoothstep(front, front+FRONT_SOFTNESS, r), which reads 0 (clean paper,
// on the ground) at r == front. An actor standing exactly on that line is
// therefore still standing on pure paper and must read as pure ink to stay
// legible against it -- the old two-sided ramp got this wrong by starting
// the actor's crossfade a full band-width before the ground had changed at
// all.
func TestActorColorOnBoundaryIsInk(t *testing.T) {
	ink := palette.Ink()
	pos := matrix.NewVec2(safeRadiusMax, 0)
	if got := actorColor(pos, safeRadiusMax); !colorEquals(got, ink) {
		t.Fatalf("actorColor(on boundary) = %v, want ink %v exactly", got, ink)
	}
}

func TestActorColorMonotonicAcrossBand(t *testing.T) {
	// Sample radii spanning from inside the safe zone to above the outer
	// edge of the one-sided band, and confirm the tint moves toward paper
	// (never reverses toward ink) at every step.
	radii := []float32{
		safeRadiusMax - 0.1, // inside: clamped ink
		safeRadiusMax,       // boundary: still exactly ink (t=0)
		safeRadiusMax + 0.1,
		safeRadiusMax + actorTintBand/2,     // mid-band
		safeRadiusMax + actorTintBand,       // outer edge: exactly paper (t=1)
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
	// Enemies spawn at safeRadius + horde.SpawnMargin (1.5), which is beyond
	// actorTintBand (~0.49). A freshly spawned enemy must therefore be
	// paper-coloured against the ink it spawns on -- this is precisely the
	// bug an earlier task fixed.
	paper := palette.Paper()
	spawnDist := safeRadiusMax + horde.SpawnMargin
	pos := matrix.NewVec2(spawnDist, 0)
	if got := actorColor(pos, safeRadiusMax); !colorEquals(got, paper) {
		t.Fatalf("actorColor(spawn distance) = %v, want paper %v: "+
			"a freshly spawned enemy must be light against the ink it lands on", got, paper)
	}
}
