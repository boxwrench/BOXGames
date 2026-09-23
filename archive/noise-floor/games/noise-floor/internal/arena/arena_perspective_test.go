package arena

import (
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
)

// TestStainPlaneRadiusScalesUp verifies that a gameplay-plane radius maps to a
// strictly larger stain-plane radius, because the stain plane is further from
// the camera than the gameplay plane.
func TestStainPlaneRadiusScalesUp(t *testing.T) {
	gameplayRadius := float32(5.0)
	stainRadius := stainPlaneRadius(gameplayRadius)
	if stainRadius <= gameplayRadius {
		t.Fatalf("stainPlaneRadius(%v) = %v, want > %v: the stain plane is further "+
			"from the camera, so the same world distance must scale up", gameplayRadius, stainRadius, gameplayRadius)
	}
}

// TestStainPlaneRadiusRatio verifies the scaling ratio is exactly
// (cameraZ - render.StainDepth) / cameraZ.
func TestStainPlaneRadiusRatio(t *testing.T) {
	gameplayRadius := float32(5.0)
	stainRadius := stainPlaneRadius(gameplayRadius)

	// Compute the expected ratio from constants
	expectedRatio := (cameraZ - render.StainDepth) / cameraZ
	expectedStainRadius := gameplayRadius * float32(expectedRatio)

	const epsilon = 1e-6
	diff := stainRadius - expectedStainRadius
	if diff < -epsilon || diff > epsilon {
		t.Fatalf("stainPlaneRadius(%v) = %v, want %v (ratio = (cameraZ - render.StainDepth) / cameraZ = %v)",
			gameplayRadius, stainRadius, expectedStainRadius, expectedRatio)
	}
}

// TestStainPlaneRadiusZeroMapsToZero verifies that a zero radius maps to zero.
func TestStainPlaneRadiusZeroMapsToZero(t *testing.T) {
	result := stainPlaneRadius(0)
	if result != 0 {
		t.Fatalf("stainPlaneRadius(0) = %v, want exactly 0", result)
	}
}
