// Package render owns the corruption stain shader and material, sprite sheet
// binding, and draw ordering.
package render

import (
	"fmt"

	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
	"kaijuengine.com/registry/shader_data_registry"
	"kaijuengine.com/rendering"
	"kaijuengine.com/rendering/textures"
)

// StainDepth is the world z-coordinate at which the stain quad is drawn, behind
// all gameplay sprites. Callers that need to convert gameplay-plane distances to
// stain-plane distances (e.g., to correct for perspective depth) need this
// constant to compute the scaling factor.
const StainDepth = -3.0

// Stain is the full-arena background quad running the boxstain shader.
type Stain struct {
	shaderData *shader_data_registry.ShaderDataUnlit
	entity     *engine.Entity
	width      float32
	height     float32
}

// NewStain creates the background quad. width and height are in world units and
// should over-cover the visible arena so the stain reaches the screen edges.
func NewStain(host *engine.Host, width, height float32) (*Stain, error) {
	mat, err := host.MaterialCache().Material("boxstain.material")
	if err != nil {
		return nil, fmt.Errorf("render: loading boxstain.material: %w", err)
	}
	tex, err := host.TextureCache().Texture("square.png", textures.TextureFilterLinear)
	if err != nil {
		return nil, fmt.Errorf("render: loading fallback texture: %w", err)
	}
	mat = mat.CreateInstance([]*rendering.Texture{tex})

	// The shader descriptor sets DrawInstanceData to "unlit", so this asserts
	// to ShaderDataUnlit. If this type assertion fails, that field was lost — see
	// docs/KAIJU-NOTES.md.
	sd, ok := shader_data_registry.Create(mat.Shader.DrawInstanceDataName()).(*shader_data_registry.ShaderDataUnlit)
	if !ok {
		return nil, fmt.Errorf(
			"render: boxstain resolved instance data %q, want \"unlit\"; check DrawInstanceData in the shader descriptor",
			mat.Shader.DrawInstanceDataName())
	}
	// .r safe radius, .g/.b stain quad width/height (all world units), .a level.
	sd.Color = matrix.NewColor(0, width, height, 0)
	sd.UVs = matrix.NewVec4(0, 0, 1, 1)

	e := engine.NewEntity(host.WorkGroup())
	e.Transform.SetPosition(matrix.NewVec3(0, 0, StainDepth)) // behind all gameplay sprites
	e.Transform.SetScale(matrix.NewVec3(width, height, 1))

	host.Drawings.AddDrawing(rendering.Drawing{
		Material:   mat,
		Mesh:       rendering.NewMeshQuad(host.MeshCache()),
		ShaderData: sd,
		Transform:  &e.Transform,
		ViewCuller: &host.Cameras.Primary,
	})
	return &Stain{shaderData: sd, entity: e, width: width, height: height}, nil
}

// SetBoundary uploads the CPU-authoritative boundary. safeRadius is in world
// units; level is 0 (clean) to 1 (consumed) and drives decoration only.
//
// level travels in the shader data's alpha channel (see the .a packing note
// on sd.Color in NewStain) -- it carries corruption data, not blend opacity.
// shader_data_registry.Create resolves both "unlit" and "unlit_transparent"
// to the same *ShaderDataUnlit type (shader_data_basic_unlit.go), so the type
// assertion in NewStain cannot detect a pipeline swap. boxstain.material
// MUST stay on an opaque pipeline: on a transparent one, .a is silently
// reinterpreted as blend alpha and the stain fades as corruption rises
// instead of decorating it.
func (s *Stain) SetBoundary(safeRadius, level float32) {
	s.shaderData.Color = matrix.NewColor(safeRadius, s.width, s.height, level)
}
