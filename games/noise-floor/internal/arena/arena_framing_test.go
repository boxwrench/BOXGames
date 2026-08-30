package arena

import (
	"math"
	"testing"
)

// TestSafeRadiusMaxMatchesGameplayPlaneHalfHeight guards the framing invariant
// this task exists to establish: the CPU-authoritative safe radius must equal
// the half-height of the gameplay plane the camera actually frames, so the
// visual corruption front (which now reads SafeRadius() in world units) lands
// on the true screen edges instead of drifting free of them. An uncalibrated
// pair — safeRadiusMax changed without cameraZ, or vice versa — is exactly
// the class of bug this task fixes, so this test fails loudly if the two
// constants are ever edited independently.
func TestSafeRadiusMaxMatchesGameplayPlaneHalfHeight(t *testing.T) {
	const verticalFOVDegrees = 60.0
	halfFOV := (verticalFOVDegrees / 2.0) * math.Pi / 180.0
	wantHalfHeight := float32(cameraZ * math.Tan(halfFOV))

	// safeRadiusMax (8.1) is a human-chosen round number, not the raw
	// trig result (~8.0829), so the epsilon must comfortably cover that
	// intentional rounding while staying far below the ~1.6 world-unit gap
	// the original defect (safeRadiusMax = 6.5) produced.
	const epsilon = 0.03
	diff := safeRadiusMax - wantHalfHeight
	if diff < -epsilon || diff > epsilon {
		t.Fatalf("safeRadiusMax = %v, want %v (cameraZ * tan(30 deg), the gameplay "+
			"plane half-height): the safe circle must touch the top and bottom "+
			"screen edges or the visual corruption front and the gameplay "+
			"boundary disagree", safeRadiusMax, wantHalfHeight)
	}
}
