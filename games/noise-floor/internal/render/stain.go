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

// Stain is the full-arena background quad running the boxstain shader.
type Stain struct {
	shaderData *shader_data_registry.ShaderDataUnlit
	entity     *engine.Entity
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
	sd.Color = matrix.NewColor(0, 0, 0, 1) // .r carries corruption level
	sd.UVs = matrix.NewVec4(0, 0, 1, 1)

	e := engine.NewEntity(host.WorkGroup())
	e.Transform.SetPosition(matrix.NewVec3(0, 0, -3)) // behind all gameplay sprites
	e.Transform.SetScale(matrix.NewVec3(width, height, 1))

	host.Drawings.AddDrawing(rendering.Drawing{
		Material:   mat,
		Mesh:       rendering.NewMeshQuad(host.MeshCache()),
		ShaderData: sd,
		Transform:  &e.Transform,
		ViewCuller: &host.Cameras.Primary,
	})
	return &Stain{shaderData: sd, entity: e}, nil
}

// SetLevel uploads the corruption level, 0 (clean) to 1 (consumed).
func (s *Stain) SetLevel(level float32) {
	s.shaderData.Color = matrix.NewColor(level, 0, 0, 1)
}
