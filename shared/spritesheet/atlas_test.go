package spritesheet

import (
	"strings"
	"testing"
)

const validSheetJSON = `{
  "image": "bx77.png",
  "atlas": { "w": 128, "h": 64 },
  "clips": {
    "idle": {
      "fps": 8,
      "loop": true,
      "frames": [
        { "x": 0,  "y": 0, "w": 32, "h": 32 },
        { "x": 32, "y": 0, "w": 32, "h": 32 },
        { "x": 64, "y": 0, "w": 32, "h": 32 },
        { "x": 96, "y": 0, "w": 32, "h": 32 }
      ]
    },
    "death": {
      "fps": 12,
      "loop": false,
      "frames": [
        { "x": 0, "y": 32, "w": 32, "h": 32 }
      ]
    }
  }
}`

func TestLoadAtlasValid(t *testing.T) {
	a, err := LoadAtlas([]byte(validSheetJSON))
	if err != nil {
		t.Fatalf("LoadAtlas: unexpected error: %v", err)
	}
	if a.Image != "bx77.png" {
		t.Errorf("Image = %q, want bx77.png", a.Image)
	}
	if a.W != 128 || a.H != 64 {
		t.Errorf("dims = %dx%d, want 128x64", a.W, a.H)
	}
	idle, ok := a.Clips["idle"]
	if !ok {
		t.Fatalf("clip idle missing, got %v", a.Clips)
	}
	if idle.FPS != 8 || !idle.Loop || len(idle.Frames) != 4 {
		t.Errorf("idle = %+v, unexpected", idle)
	}
	death, ok := a.Clips["death"]
	if !ok {
		t.Fatalf("clip death missing")
	}
	if death.Loop {
		t.Errorf("death.Loop = true, want false")
	}
	if len(death.Frames) != 1 || death.Frames[0] != (Rect{X: 0, Y: 32, W: 32, H: 32}) {
		t.Errorf("death.Frames = %+v, unexpected", death.Frames)
	}
}

func TestLoadAtlasValidationErrors(t *testing.T) {
	cases := []struct {
		name    string
		json    string
		wantErr string // substring expected in the error, naming the offender
	}{
		{
			name:    "missing image",
			json:    `{"atlas":{"w":32,"h":32},"clips":{"idle":{"fps":8,"loop":true,"frames":[{"x":0,"y":0,"w":32,"h":32}]}}}`,
			wantErr: "image",
		},
		{
			name:    "non-positive atlas width",
			json:    `{"image":"a.png","atlas":{"w":0,"h":32},"clips":{"idle":{"fps":8,"loop":true,"frames":[{"x":0,"y":0,"w":32,"h":32}]}}}`,
			wantErr: "dimensions",
		},
		{
			name:    "non-positive atlas height",
			json:    `{"image":"a.png","atlas":{"w":32,"h":-1},"clips":{"idle":{"fps":8,"loop":true,"frames":[{"x":0,"y":0,"w":32,"h":32}]}}}`,
			wantErr: "dimensions",
		},
		{
			name:    "clip with zero frames",
			json:    `{"image":"a.png","atlas":{"w":32,"h":32},"clips":{"idle":{"fps":8,"loop":true,"frames":[]}}}`,
			wantErr: "idle",
		},
		{
			name:    "frame rect extends past atlas bounds (x)",
			json:    `{"image":"a.png","atlas":{"w":32,"h":32},"clips":{"idle":{"fps":8,"loop":true,"frames":[{"x":16,"y":0,"w":32,"h":32}]}}}`,
			wantErr: "idle",
		},
		{
			name:    "frame rect extends past atlas bounds (y)",
			json:    `{"image":"a.png","atlas":{"w":32,"h":32},"clips":{"idle":{"fps":8,"loop":true,"frames":[{"x":0,"y":16,"w":32,"h":32}]}}}`,
			wantErr: "idle",
		},
		{
			name:    "fps zero",
			json:    `{"image":"a.png","atlas":{"w":32,"h":32},"clips":{"idle":{"fps":0,"loop":true,"frames":[{"x":0,"y":0,"w":32,"h":32}]}}}`,
			wantErr: "idle",
		},
		{
			name:    "fps negative",
			json:    `{"image":"a.png","atlas":{"w":32,"h":32},"clips":{"idle":{"fps":-2,"loop":true,"frames":[{"x":0,"y":0,"w":32,"h":32}]}}}`,
			wantErr: "idle",
		},
		{
			name:    "invalid JSON",
			json:    `{not json`,
			wantErr: "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := LoadAtlas([]byte(tc.json))
			if err == nil {
				t.Fatalf("LoadAtlas(%s): expected error, got nil", tc.name)
			}
			if tc.wantErr != "" && !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("LoadAtlas(%s): error %q does not mention %q", tc.name, err.Error(), tc.wantErr)
			}
		})
	}
}

// TestFrameUVs checks UV conversion against hand-computed values, including
// the top-row sanity case from the task brief, a bottom-row rect, and a
// non-square atlas so a transposed W/H would be caught.
func TestFrameUVs(t *testing.T) {
	cases := []struct {
		name   string
		atlasW int
		atlasH int
		rect   Rect
		wantX  float32
		wantY  float32
		wantZ  float32
		wantW  float32
	}{
		{
			// Sanity check from the brief: a rect at the very top (Y=0) of
			// height h gives uvs.y = 0, so the shader's flip offset becomes
			// (1 - h) - 0 = 1 - h, mapping the quad's V range [0,h] onto
			// [1-h, 1] -- the top of the texture, where GL's V is 1.
			name:   "top row, square atlas",
			atlasW: 64, atlasH: 64,
			rect:  Rect{X: 0, Y: 0, W: 32, H: 32},
			wantX: 0, wantY: 0, wantZ: 0.5, wantW: 0.5,
		},
		{
			name:   "bottom row, square atlas",
			atlasW: 64, atlasH: 64,
			rect:  Rect{X: 0, Y: 32, W: 32, H: 32},
			wantX: 0, wantY: 0.5, wantZ: 0.5, wantW: 0.5,
		},
		{
			// Non-square atlas: catches a transposed W/H in the conversion.
			name:   "non-square atlas",
			atlasW: 128, atlasH: 32,
			rect:  Rect{X: 96, Y: 16, W: 32, H: 16},
			wantX: 0.75, wantY: 0.5, wantZ: 0.25, wantW: 0.5,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := &Atlas{W: tc.atlasW, H: tc.atlasH}
			got := a.FrameUVs(tc.rect)
			if got.X() != tc.wantX || got.Y() != tc.wantY || got.Z() != tc.wantZ || got.W() != tc.wantW {
				t.Errorf("FrameUVs(%+v) on %dx%d = %v, want (%v %v %v %v)",
					tc.rect, tc.atlasW, tc.atlasH, got, tc.wantX, tc.wantY, tc.wantZ, tc.wantW)
			}
		})
	}
}
