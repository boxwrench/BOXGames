package palette

import "testing"

// TestShaderPaletteSync ensures the palette's color tokens have not drifted
// from the values the boxstain shader was written against. The shader duplicates
// these values as GLSL literals (see games/noise-floor/assets/shaders/src/boxstain.frag).
// This test acts as a tripwire: if a color constant changes, this test will fail
// and remind the reader to update the shader as well.
//
// When this test fails, update the corresponding vec3 literals in boxstain.frag:
//   - PAPER corresponds to HexPaper
//   - INK corresponds to HexInk
//   - BRASS corresponds to HexBrass
//   - VISOR corresponds to HexVisor
func TestShaderPaletteSync(t *testing.T) {
	const (
		// Expected values from boxstain.frag (hex form, where the shader uses vec3 form)
		expectedPaper = 0xF4EFE4
		expectedInk   = 0x17161B
		expectedBrass = 0xA57C33
		expectedVisor = 0xC33A2B
	)

	cases := []struct {
		name      string
		got       int
		want      int
		token     string // the palette constant name
		shaderLoc string // where it appears in the shader
	}{
		{"Paper", HexPaper, expectedPaper, "HexPaper", "PAPER vec3"},
		{"Ink", HexInk, expectedInk, "HexInk", "INK vec3"},
		{"Brass", HexBrass, expectedBrass, "HexBrass", "BRASS vec3"},
		{"Visor", HexVisor, expectedVisor, "HexVisor", "VISOR vec3"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.got != tc.want {
				t.Errorf("%s = 0x%06X, want 0x%06X\nPalette %s has drifted from boxstain.frag %s. Update the shader to match.",
					tc.token, tc.got, tc.want, tc.token, tc.shaderLoc)
			}
		})
	}
}
