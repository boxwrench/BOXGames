package render

import (
	"fmt"

	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
	"kaijuengine.com/registry/shader_data_registry"
	"kaijuengine.com/rendering"
	"kaijuengine.com/rendering/textures"
)

// Marker is a flat colored quad bound to a transform it does not own. It is a
// placeholder stand-in until real sprites land in Task 6.
type Marker struct {
	shaderData *shader_data_registry.ShaderDataUnlit
}

// SetColor recolors the marker. The player uses this to stay legible as the
// page inverts from cream to ink — spec §10 risk 1 in its cheapest form.
func (m *Marker) SetColor(c matrix.Color) { m.shaderData.Color = c }

// NewMarker registers a flat colored quad drawn at t, sized size x size world
// units.
func NewMarker(host *engine.Host, t *matrix.Transform, size float32, c matrix.Color) (*Marker, error) {
	mat, err := host.MaterialCache().Material("unlit.material")
	if err != nil {
		return nil, fmt.Errorf("render: loading unlit.material: %w", err)
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
			"render: unlit resolved instance data %q, want \"unlit\"; check DrawInstanceData in the shader descriptor",
			mat.Shader.DrawInstanceDataName())
	}
	sd.Color = c
	sd.UVs = matrix.NewVec4(0, 0, 1, 1)

	t.SetScale(matrix.NewVec3(size, size, 1))

	host.Drawings.AddDrawing(rendering.Drawing{
		Material:   mat,
		Mesh:       rendering.NewMeshQuad(host.MeshCache()),
		ShaderData: sd,
		Transform:  t,
		ViewCuller: &host.Cameras.Primary,
	})
	return &Marker{shaderData: sd}, nil
}
