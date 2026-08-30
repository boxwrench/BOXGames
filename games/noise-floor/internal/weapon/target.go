package weapon

import "kaijuengine.com/matrix"

// Target is the part of an enemy that weapons need. *horde.Enemy satisfies
// this structurally; weapon does not import horde -- the collision code
// must not depend on how the horde is stored.
type Target interface {
	Position() matrix.Vec2
	Radius() float32
}

// NearestTarget returns the index of the closest target within maxRange,
// and ok=false when none is in range or targets is empty. Ties break
// toward the lower index so selection is deterministic under test.
func NearestTarget(from matrix.Vec2, targets []Target, maxRange float32) (idx int, ok bool) {
	bestIdx := -1
	var bestDist float32
	for i, tgt := range targets {
		dist := from.Distance(tgt.Position())
		if dist > maxRange {
			continue
		}
		if bestIdx == -1 || dist < bestDist {
			bestIdx = i
			bestDist = dist
		}
	}
	if bestIdx == -1 {
		return 0, false
	}
	return bestIdx, true
}
