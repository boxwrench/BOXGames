package spritesheet

import (
	"encoding/json"
	"fmt"

	"kaijuengine.com/matrix"
)

// Rect is a pixel rectangle on an atlas, with Y measured from the top of the
// image (standard image-coordinate convention, not GL's bottom-up V axis).
type Rect struct {
	X, Y, W, H int
}

// Clip is one named animation: a fixed-rate sequence of atlas rects.
type Clip struct {
	FPS    float64
	Loop   bool
	Frames []Rect
}

// Atlas is a decoded sheet description: the image it refers to, its pixel
// dimensions, and its clips by name.
type Atlas struct {
	Image string
	W, H  int
	Clips map[string]*Clip
}

// atlasDoc and friends mirror the on-disk JSON schema (see
// .superpowers/sdd/2026-08-29-noise-floor-phase2/task-6-brief.md). Kept
// unexported: callers use Atlas, not the wire shape.
type atlasDoc struct {
	Image string             `json:"image"`
	Atlas atlasDimsDoc       `json:"atlas"`
	Clips map[string]clipDoc `json:"clips"`
}

type atlasDimsDoc struct {
	W int `json:"w"`
	H int `json:"h"`
}

type clipDoc struct {
	FPS    float64   `json:"fps"`
	Loop   bool      `json:"loop"`
	Frames []rectDoc `json:"frames"`
}

type rectDoc struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// LoadAtlas decodes the sheet JSON schema described in the task-6 brief.
//
// Validation is deliberately strict: a missing image name, non-positive atlas
// dimensions, a clip with zero frames, a frame rect extending past the atlas
// bounds, or FPS <= 0 are all load errors naming the offending clip. A
// silently-wrong sheet is worse than a load failure.
func LoadAtlas(data []byte) (*Atlas, error) {
	var doc atlasDoc
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("spritesheet: invalid JSON: %w", err)
	}
	if doc.Image == "" {
		return nil, fmt.Errorf("spritesheet: missing \"image\"")
	}
	if doc.Atlas.W <= 0 || doc.Atlas.H <= 0 {
		return nil, fmt.Errorf("spritesheet: atlas dimensions must be positive, got %dx%d", doc.Atlas.W, doc.Atlas.H)
	}

	a := &Atlas{
		Image: doc.Image,
		W:     doc.Atlas.W,
		H:     doc.Atlas.H,
		Clips: make(map[string]*Clip, len(doc.Clips)),
	}

	for name, cd := range doc.Clips {
		if cd.FPS <= 0 {
			return nil, fmt.Errorf("spritesheet: clip %q: fps must be positive, got %v", name, cd.FPS)
		}
		if len(cd.Frames) == 0 {
			return nil, fmt.Errorf("spritesheet: clip %q: has no frames", name)
		}
		frames := make([]Rect, len(cd.Frames))
		for i, fr := range cd.Frames {
			if fr.X < 0 || fr.Y < 0 || fr.W <= 0 || fr.H <= 0 {
				return nil, fmt.Errorf("spritesheet: clip %q: frame %d has invalid rect %+v", name, i, fr)
			}
			if fr.X+fr.W > a.W || fr.Y+fr.H > a.H {
				return nil, fmt.Errorf("spritesheet: clip %q: frame %d rect %+v extends past atlas bounds %dx%d", name, i, fr, a.W, a.H)
			}
			frames[i] = Rect{X: fr.X, Y: fr.Y, W: fr.W, H: fr.H}
		}
		a.Clips[name] = &Clip{
			FPS:    cd.FPS,
			Loop:   cd.Loop,
			Frames: frames,
		}
	}

	return a, nil
}

// FrameUVs converts a pixel rect on this atlas into the engine's UVs vec4
// (x, y, w, h), ready to assign to ShaderDataUnlit.UVs.
//
// The engine's vertex shader already performs the V-flip needed to go from
// image-space (Y down) to GL's V axis (Y up) — see kaiju.glsl's
// writeTexCoords(): `uv.y += (1.0 - uvs.w) - uvs.y`. So this conversion is a
// plain normalisation with Y measured from the TOP of the image. Do NOT add a
// `1.0 -` here: that would flip a coordinate the shader already flips for us,
// double-flipping every sprite.
func (a *Atlas) FrameUVs(r Rect) matrix.Vec4 {
	return matrix.NewVec4(
		float32(r.X)/float32(a.W),
		float32(r.Y)/float32(a.H),
		float32(r.W)/float32(a.W),
		float32(r.H)/float32(a.H),
	)
}
