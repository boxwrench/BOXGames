// Package palette holds the boxwrench design-system colors as engine colors.
//
// These eight tokens are sampled from BX-77's armor and are the same values the
// boxwrench.dev design system uses (src/ds/tokens/colors.css). Demos must take
// their colors from here rather than writing literals, so the site and the games
// stay in step when a token changes.
//
// Note the deliberate absence of a dark theme: the design system has none, and
// NOISE FLOOR treats the light field as load-bearing (see its design spec, §2).
package palette

import "kaijuengine.com/matrix"

// Hex values, kept alongside the constructors so they can be cross-checked
// against the CSS tokens by eye.
const (
	HexPaper       = 0xF4EFE4
	HexPaperRaised = 0xEAE2D2
	HexInk         = 0x17161B
	HexInkMuted    = 0x5E594F
	HexRule        = 0xCDC3AF
	HexChrome      = 0x878D94
	HexBrass       = 0xA57C33
	HexVisor       = 0xC33A2B

	// Text-safe accent variants. These are the only accents permitted to
	// carry words; the raw brass and visor tones fail contrast on paper.
	HexBrassText = 0x7A5A22
	HexVisorText = 0xA32B1D
)

func rgb(hex int) matrix.Color {
	return matrix.NewColor(
		float32((hex>>16)&0xFF)/255.0,
		float32((hex>>8)&0xFF)/255.0,
		float32(hex&0xFF)/255.0,
		1.0,
	)
}

// Core tokens.
func Paper() matrix.Color       { return rgb(HexPaper) }
func PaperRaised() matrix.Color { return rgb(HexPaperRaised) }
func Ink() matrix.Color         { return rgb(HexInk) }
func InkMuted() matrix.Color    { return rgb(HexInkMuted) }
func Rule() matrix.Color        { return rgb(HexRule) }
func Chrome() matrix.Color      { return rgb(HexChrome) }
func Brass() matrix.Color       { return rgb(HexBrass) }
func Visor() matrix.Color       { return rgb(HexVisor) }

// Text-safe accents.
func BrassText() matrix.Color { return rgb(HexBrassText) }
func VisorText() matrix.Color { return rgb(HexVisorText) }

// Semantic aliases, mirroring the design system's own aliases.
func SurfacePage() matrix.Color   { return Paper() }
func SurfaceRaised() matrix.Color { return PaperRaised() }
func TextBody() matrix.Color      { return Ink() }
func TextMuted() matrix.Color     { return InkMuted() }
func TextAccent() matrix.Color    { return BrassText() }
func TextAlarm() matrix.Color     { return VisorText() }
func Divider() matrix.Color       { return Rule() }
func FocusRing() matrix.Color     { return Visor() }
