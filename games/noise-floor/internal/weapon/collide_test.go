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
	hits := Collide(b, targets, 0.5)
	if len(hits) != 1 {
		t.Fatalf("len(hits) = %d, want 1", len(hits))
	}
	if hits[0].Target != 0 {
		t.Fatalf("hits[0].Target = %d, want 0", hits[0].Target)
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
	hits := Collide(b, targets, 0.5)
	if len(hits) != 0 {
		t.Fatalf("len(hits) = %d, want 0 (near miss just outside radius sum)", len(hits))
	}
}

func TestCollideJustOutsideRadiusSumDoesNotHit(t *testing.T) {
	b := NewBattery(4)
	b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10)
	// radius sum = 0.5 + 0.5 = 1.0; distance 1.01 is just outside.
	targets := []Target{fakeTarget{pos: matrix.NewVec2(1.01, 0), radius: 0.5}}
	hits := Collide(b, targets, 0.5)
	if len(hits) != 0 {
		t.Fatalf("len(hits) = %d, want 0 (distance 1.01 just exceeds radius sum 1.0)", len(hits))
	}
}

func TestCollideJustInsideRadiusSumHits(t *testing.T) {
	b := NewBattery(4)
	b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(0, 0), 0, 1, 10)
	// radius sum = 0.5 + 0.5 = 1.0; distance 0.99 is just inside.
	targets := []Target{fakeTarget{pos: matrix.NewVec2(0.99, 0), radius: 0.5}}
	hits := Collide(b, targets, 0.5)
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
	hits := Collide(b, targets, 0.5)
	if len(hits) != 1 {
		t.Fatalf("len(hits) = %d, want 1 -- a single projectile overlapping two targets must produce exactly one Hit", len(hits))
	}
	if hits[0].Projectile != handle {
		t.Fatalf("hits[0].Projectile = %d, want %d", hits[0].Projectile, handle)
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
	hits := Collide(b, targets, 0.5)
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
