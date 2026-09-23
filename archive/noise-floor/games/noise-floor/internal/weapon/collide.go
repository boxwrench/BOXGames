package weapon

// Hit records one projectile striking one target.
type Hit struct {
	Projectile int // battery handle

	// TargetHandle is the caller-supplied handle for the target this
	// projectile struck (handles[i] for whichever targets[i] it hit) --
	// not an index into the targets slice Collide was called with. That
	// slice is a frame-local scratch buffer rebuilt every frame (see
	// arena.refillTargets), so an index into it stops meaning anything one
	// frame later. A Hit that a caller holds onto past this frame -- for a
	// deferred effect, say -- needs a handle whose meaning survives that
	// rebuild; weapon does not need to know what the handle actually
	// identifies, only that the caller can turn it back into something
	// useful later.
	TargetHandle int

	Damage int
}

// Collide finds projectile/target overlaps: a hit when the distance
// between centres is less than the sum of radii. A projectile hits at most
// one target per call -- the first it overlaps, in targets order -- and
// each projectile appears at most once in the result, so a shot cannot
// damage two enemies at once.
//
// handles is parallel to targets: handles[i] is the caller's handle for
// targets[i], reported back as the resulting Hit's TargetHandle rather than
// the position i itself.
//
// hits is caller-supplied scratch, reused via hits[:0]+append the same way
// Arena's other per-frame scratch slices are, so a frame's worth of
// collision checks allocates nothing once warmed up.
func Collide(b *Battery, targets []Target, handles []int, projectileRadius float32, hits []Hit) []Hit {
	hits = hits[:0]
	b.Each(func(handle int, p *Projectile) {
		for ti, tgt := range targets {
			radiusSum := projectileRadius + tgt.Radius()
			if p.Pos.Distance(tgt.Position()) < radiusSum {
				hits = append(hits, Hit{
					Projectile:   handle,
					TargetHandle: handles[ti],
					Damage:       p.Damage,
				})
				break
			}
		}
	})
	return hits
}
