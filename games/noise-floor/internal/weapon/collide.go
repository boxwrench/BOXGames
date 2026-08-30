package weapon

// Hit records one projectile striking one target.
type Hit struct {
	Projectile int // battery handle
	Target     int // index into the targets slice
	Damage     int
}

// Collide finds projectile/target overlaps: a hit when the distance
// between centres is less than the sum of radii. A projectile hits at most
// one target per call -- the first it overlaps, in targets order -- and
// each projectile appears at most once in the result, so a shot cannot
// damage two enemies at once.
func Collide(b *Battery, targets []Target, projectileRadius float32) []Hit {
	var hits []Hit
	b.Each(func(handle int, p *Projectile) {
		for ti, tgt := range targets {
			radiusSum := projectileRadius + tgt.Radius()
			if p.Pos.Distance(tgt.Position()) < radiusSum {
				hits = append(hits, Hit{
					Projectile: handle,
					Target:     ti,
					Damage:     p.Damage,
				})
				break
			}
		}
	})
	return hits
}
