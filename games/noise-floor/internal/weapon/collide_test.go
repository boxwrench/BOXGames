package weapon

import (
	"testing"

	"kaijuengine.com/matrix"
)

func TestCollideDetectsOverlap(t *testing.T) {
	b := NewBattery(4)
	// projectile at (0,0), target at (1,0); projectileRadius 0.5 + target
	// radius 0.6 = 1.1 sum, distance 1.0 < 1.1 -> overlap.
	_, ok := b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10) // stationary shot, target at origin already
	if !ok {
		t.Fatal("Fire failed")
	}
	targets := []Target{fakeTarget{pos: matrix.NewVec2(1, 0), radius: 0.6}}
	// Handle 42 is deliberately not the target's slice index (0), to prove
	// TargetHandle reports the caller's handle, not the position in targets.
	handles := []int{42}
	hits := Collide(b, targets, handles, 0.5, nil)
	if len(hits) != 1 {
		t.Fatalf("len(hits) = %d, want 1", len(hits))
	}
	if hits[0].TargetHandle != 42 {
		t.Fatalf("hits[0].TargetHandle = %d, want 42", hits[0].TargetHandle)
	}
	if hits[0].Damage != 1 {
		t.Fatalf("hits[0].Damage = %d, want 1", hits[0].Damage)
	}
}

func TestCollideIgnoresNearMiss(t *testing.T) {
	b := NewBattery(4)
	b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10)
	// distance 2.0, radius sum 0.5+0.5=1.0 -- well clear.
	targets := []Target{fakeTarget{pos: matrix.NewVec2(2, 0), radius: 0.5}}
	hits := Collide(b, targets, []int{0}, 0.5, nil)
	if len(hits) != 0 {
		t.Fatalf("len(hits) = %d, want 0 (near miss just outside radius sum)", len(hits))
	}
}

func TestCollideJustOutsideRadiusSumDoesNotHit(t *testing.T) {
	b := NewBattery(4)
	b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10)
	// radius sum = 0.5 + 0.5 = 1.0; distance 1.01 is just outside.
	targets := []Target{fakeTarget{pos: matrix.NewVec2(1.01, 0), radius: 0.5}}
	hits := Collide(b, targets, []int{0}, 0.5, nil)
	if len(hits) != 0 {
		t.Fatalf("len(hits) = %d, want 0 (distance 1.01 just exceeds radius sum 1.0)", len(hits))
	}
}

func TestCollideJustInsideRadiusSumHits(t *testing.T) {
	b := NewBattery(4)
	b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10)
	// radius sum = 0.5 + 0.5 = 1.0; distance 0.99 is just inside.
	targets := []Target{fakeTarget{pos: matrix.NewVec2(0.99, 0), radius: 0.5}}
	hits := Collide(b, targets, []int{0}, 0.5, nil)
	if len(hits) != 1 {
		t.Fatalf("len(hits) = %d, want 1 (distance 0.99 is just inside radius sum 1.0)", len(hits))
	}
}

func TestCollideOneProjectileHitsAtMostOneTarget(t *testing.T) {
	b := NewBattery(4)
	// a single stationary projectile at origin overlapping two targets
	handle, ok := b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 5, 10)
	if !ok {
		t.Fatal("Fire failed")
	}
	targets := []Target{
		fakeTarget{pos: matrix.NewVec2(0.2, 0), radius: 1.0},
		fakeTarget{pos: matrix.NewVec2(-0.2, 0), radius: 1.0},
	}
	hits := Collide(b, targets, []int{10, 20}, 0.5, nil)
	if len(hits) != 1 {
		t.Fatalf("len(hits) = %d, want 1 -- a single projectile overlapping two targets must produce exactly one Hit", len(hits))
	}
	if hits[0].Projectile != handle {
		t.Fatalf("hits[0].Projectile = %d, want %d", hits[0].Projectile, handle)
	}
	if hits[0].TargetHandle != 10 {
		t.Fatalf("hits[0].TargetHandle = %d, want 10 (the first, closer-in-order target's handle)", hits[0].TargetHandle)
	}
}

func TestCollideEachProjectileAtMostOnceInResult(t *testing.T) {
	b := NewBattery(4)
	h1, _ := b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10)
	h2, _ := b.Fire(matrix.NewVec2(5, 0), matrix.NewVec2(5, 0), 0, 1, 10)
	targets := []Target{
		fakeTarget{pos: matrix.NewVec2(0, 0), radius: 1.0},
		fakeTarget{pos: matrix.NewVec2(5, 0), radius: 1.0},
	}
	hits := Collide(b, targets, []int{100, 200}, 0.5, nil)
	if len(hits) != 2 {
		t.Fatalf("len(hits) = %d, want 2 (two separate projectiles, two separate targets)", len(hits))
	}
	seen := map[int]bool{}
	for _, h := range hits {
		if seen[h.Projectile] {
			t.Fatalf("projectile %d appears more than once in Collide's result", h.Projectile)
		}
		seen[h.Projectile] = true
	}
	if !seen[h1] || !seen[h2] {
		t.Fatalf("expected both projectiles %d and %d to register a hit, got %v", h1, h2, hits)
	}
}

// TestCollideReusesScratchSlice confirms hits is reused via [:0]+append
// rather than reallocated: a caller thread the returned slice back in on the
// next call and it must not retain stale entries past the new length.
func TestCollideReusesScratchSlice(t *testing.T) {
	b := NewBattery(4)
	b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10)
	targets := []Target{fakeTarget{pos: matrix.NewVec2(0, 0), radius: 1.0}}

	scratch := make([]Hit, 0, 4)
	hits := Collide(b, targets, []int{7}, 0.5, scratch)
	if len(hits) != 1 {
		t.Fatalf("len(hits) = %d, want 1", len(hits))
	}

	// No live projectiles this time -- the previous hit must not linger.
	empty := NewBattery(4)
	hits = Collide(empty, targets, []int{7}, 0.5, hits)
	if len(hits) != 0 {
		t.Fatalf("len(hits) = %d after a call with no projectiles, want 0 (stale entry from previous call leaked through)", len(hits))
	}
}
