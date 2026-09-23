// Package arena owns the fixed single-screen play space: camera framing,
// bounds, and the corruption model that doubles as the arena boundary.
//
// The corruption boundary is CPU-authoritative and is a plain radius. The
// fragment shader in internal/render decorates that boundary with noise but
// does not define it — see design spec §5.1 for why bit-identical noise in both
// Go and GLSL was rejected.
package arena
