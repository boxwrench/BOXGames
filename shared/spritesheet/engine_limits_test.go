package spritesheet

import (
	"testing"

	"kaijuengine.com/engine/systems/visual2d/sprite"
	"kaijuengine.com/matrix"
)

// These tests pin down engine limitations that forced this package to exist.
// They assert the CURRENT BROKEN BEHAVIOUR on purpose.
//
// If one of them starts failing, that is good news: the engine has been fixed
// at the pinned commit and we may be able to delete code here and use the
// engine's own sprite-sheet path instead. Do not "fix" these tests by relaxing
// them — investigate the engine first.
//
// See docs/KAIJU-NOTES.md.

// TestEngineBinarySheetReadIsBroken documents why we do not use
// sprite.Sprite.InitSheet, which is the engine's only atlas-animation entry
// point for world sprites.
//
// sprite_sheet.go NewSheetFromBin passes frame fields to streaming.StreamRead
// BY VALUE rather than by pointer, and binary.Read rejects a non-pointer int32.
// Separately, the decoded frame is never stored into clip.Frames[j], so even a
// successful read would produce all-zero frames.
//
// Net effect: any clip with at least one frame fails to load.
func TestEngineBinarySheetReadIsBroken(t *testing.T) {
	sheet := sprite.SpriteSheet{Clips: map[string]sprite.SpriteSheetClip{}}
	sheet.AddClip(sprite.SpriteSheetClip{
		Name: "idle",
		Frames: []sprite.SpriteSheetFrame{
			{Hold: 6, Rectangle: matrix.NewVec4(0, 0, 32, 32)},
		},
	})

	bin, err := sheet.ToBin()
	if err != nil {
		t.Fatalf("ToBin failed: %v — the writer was previously working", err)
	}

	_, err = sprite.NewSheetFromBin(bin)
	if err == nil {
		t.Fatal("NewSheetFromBin now succeeds — the engine bug appears fixed. " +
			"Re-evaluate whether this package's own animator is still needed, " +
			"and update docs/KAIJU-NOTES.md.")
	}
	t.Logf("confirmed still broken: %v", err)
}

// TestEngineJSONSheetParsesClipRects documents the one sheet format the engine
// does read correctly. Our offline packer emits exactly this schema:
//
//	[{"Name": "...", "Frames": [{"Hold": n, "Rectangle": [x, y, w, h]}]}]
//
// Rectangle is in ATLAS PIXELS with a TOP-LEFT origin. Do not pre-normalise and
// do not pre-flip V — consumers convert to GPU UVs themselves.
func TestEngineJSONSheetParsesClipRects(t *testing.T) {
	const doc = `[
	  {"Name":"idle","Frames":[
	    {"Hold":6,"Rectangle":[0,0,32,48]},
	    {"Hold":6,"Rectangle":[32,0,32,48]}
	  ]}
	]`

	sheet, err := sprite.NewSheetFromJson(doc)
	if err != nil {
		t.Fatalf("NewSheetFromJson failed: %v", err)
	}
	clip, ok := sheet.Clips["idle"]
	if !ok {
		t.Fatalf("clip \"idle\" missing, got %v", sheet.Clips)
	}
	if len(clip.Frames) != 2 {
		t.Fatalf("got %d frames, want 2", len(clip.Frames))
	}
	r := clip.Frames[1].Rectangle
	if r.X() != 32 || r.Y() != 0 || r.Z() != 32 || r.W() != 48 {
		t.Fatalf("frame 1 rect = %v, want [32 0 32 48]", r)
	}
}
