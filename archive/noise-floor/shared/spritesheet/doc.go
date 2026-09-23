// Package spritesheet loads packed sprite sheets and their clip metadata,
// produced offline by tools/spritegen (or, until that lands, by the
// placeholder generator at tools/spritegen/placeholder.py), and plays them
// back frame by frame.
//
// Sheets are committed assets: a PNG atlas plus a JSON sidecar describing its
// pixel dimensions and named clips (see LoadAtlas for the schema). No model
// inference happens at runtime and the games build with no ComfyUI or
// diffusion models present.
//
// This package exists because the engine's own world-sprite animation path
// (sprite.Sprite.InitSheet) is broken at the pinned commit, and its one
// working alternative (InitFlipBook) creates GPU resources per frame. See
// engine_limits_test.go for the specifics. Instead, this package decodes
// clip metadata and computes UV rects; callers write those UVs into their own
// ShaderDataUnlit each frame, one drawing per entity with the atlas texture
// shared across all of them.
package spritesheet
