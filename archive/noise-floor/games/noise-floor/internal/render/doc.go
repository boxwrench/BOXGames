// Package render owns the corruption stain shader and material, sprite sheet
// binding, and draw ordering.
//
// Engine gotcha: a .shader descriptor with an empty DrawInstanceData falls back
// to the shader *name*; an unregistered name resolves to "standard", which has
// no UVs field, so UVs silently collapse to zero and the shader renders flat
// with no error. Always set DrawInstanceData explicitly.
package render
