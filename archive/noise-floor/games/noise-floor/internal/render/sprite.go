package render

import (
	"fmt"

	"kaijuengine.com/engine"
	"kaijuengine.com/matrix"
	"kaijuengine.com/registry/shader_data_registry"
	"kaijuengine.com/rendering"
	"kaijuengine.com/rendering/textures"
)

// SpriteDepth is the world z-coordinate at which gameplay sprites are drawn:
// the same plane the player marker already uses, in front of the stain at
// StainDepth. Sprites live in the XY plane; z carries draw order only, never
// depth of field.
const SpriteDepth = 0.1

// Sprite is one atlas-textured quad with its own entity and transform, drawn
// in the XY plane. It owns its entity so each instance (e.g. one per live
// enemy, or the single permanent player sprite) can be positioned
// independently.
type Sprite struct {
	entity     *engine.Entity
	shaderData *shader_data_registry.ShaderDataUnlit

	// index is this sprite's slot in the SpriteSet that created it, or -1 if
	// it was not created by one. Set directly by NewSpriteSet (same package)
	// so Release can find it in O(1) instead of a linear scan.
	index int
}

// NewSprite creates a hidden sprite of the given size in world units,
// textured from the named atlas image in the content database (e.g.
// "mote.png"). It starts hidden; call Show to make it visible.
//
// Atlases are 32x32-pixel placeholder art, so texture sampling uses nearest
// filtering; linear filtering would smear them.
func NewSprite(host *engine.Host, textureKey string, size float32) (*Sprite, error) {
	mat, err := host.MaterialCache().Material("unlit.material")
	if err != nil {
		return nil, fmt.Errorf("render: loading unlit.material: %w", err)
	}
	tex, err := host.TextureCache().Texture(textureKey, textures.TextureFilterNearest)
	if err != nil {
		return nil, fmt.Errorf("render: loading texture %q: %w", textureKey, err)
	}
	mat = mat.CreateInstance([]*rendering.Texture{tex})

	// The shader descriptor sets DrawInstanceData to "unlit", so this asserts
	// to ShaderDataUnlit. If this type assertion fails, that field was lost —
	// see docs/KAIJU-NOTES.md.
	sd, ok := shader_data_registry.Create(mat.Shader.DrawInstanceDataName()).(*shader_data_registry.ShaderDataUnlit)
	if !ok {
		return nil, fmt.Errorf(
			"render: unlit resolved instance data %q, want \"unlit\"; check DrawInstanceData in the shader descriptor",
			mat.Shader.DrawInstanceDataName())
	}
	sd.Color = matrix.ColorWhite()
	sd.UVs = matrix.NewVec4(0, 0, 1, 1)

	e := engine.NewEntity(host.WorkGroup())
	e.Transform.SetScale(matrix.NewVec3(size, size, 1))
	e.Transform.SetPosition(matrix.NewVec3(0, 0, SpriteDepth))

	host.Drawings.AddDrawing(rendering.Drawing{
		Material:   mat,
		Mesh:       rendering.NewMeshQuad(host.MeshCache()),
		ShaderData: sd,
		Transform:  &e.Transform,
		ViewCuller: &host.Cameras.Primary,
	})

	s := &Sprite{entity: e, shaderData: sd, index: -1}
	s.Hide()
	return s, nil
}

// SetPosition moves the sprite. Z is fixed at SpriteDepth.
func (s *Sprite) SetPosition(p matrix.Vec2) {
	s.entity.Transform.SetPosition(matrix.NewVec3(p.X(), p.Y(), SpriteDepth))
}

// SetUVs selects the current atlas frame. Feed it Animator.UVs().
func (s *Sprite) SetUVs(uv matrix.Vec4) { s.shaderData.UVs = uv }

// SetColor tints the sprite. Used for the horde value treatment.
func (s *Sprite) SetColor(c matrix.Color) { s.shaderData.Color = c }

// Show activates the drawing so the renderer draws it again.
func (s *Sprite) Show() { s.shaderData.Activate() }

// Hide deactivates the drawing so the renderer skips it entirely. A hidden,
// pooled sprite costs nothing per frame beyond the memory already allocated
// for it — this is not a fake hide (moving off-screen or scaling to zero),
// it uses the engine's own draw-instance activation.
func (s *Sprite) Hide() { s.shaderData.Deactivate() }
