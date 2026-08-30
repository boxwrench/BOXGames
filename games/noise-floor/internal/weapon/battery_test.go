package weapon

import (
	"testing"

	"kaijuengine.com/matrix"
)

func TestFireLaunchesProjectileTowardTarget(t *testing.T) {
	b := NewBattery(4)
	origin := matrix.NewVec2(0, 0)
	target := matrix.NewVec2(10, 0)
	handle, ok := b.Fire(origin, target, 5, 3, 2.0)
	if !ok {
		t.Fatal("Fire returned ok=false on a fresh battery")
	}
	var got *Projectile
	b.Each(func(h int, p *Projectile) {
		if h == handle {
			got = p
		}
	})
	if got == nil {
		t.Fatal("fired projectile not found via Each")
	}
	if !got.Pos.Equals(origin) {
		t.Fatalf("Pos = %v, want origin %v", got.Pos, origin)
	}
	if got.Damage != 3 {
		t.Fatalf("Damage = %d, want 3", got.Damage)
	}
	if got.Life != 2.0 {
		t.Fatalf("Life = %v, want 2.0", got.Life)
	}
	// velocity should point from origin to target, at the given speed
	wantVel := target.Subtract(origin).Normal().Scale(5)
	if matrix.Abs(got.Vel.X()-wantVel.X()) > 0.001 || matrix.Abs(got.Vel.Y()-wantVel.Y()) > 0.001 {
		t.Fatalf("Vel = %v, want %v", got.Vel, wantVel)
	}
}

func TestProjectileMotionTravelsAtSpeed(t *testing.T) {
	b := NewBattery(4)
	handle, ok := b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(10, 0), 5, 1, 10.0)
	if !ok {
		t.Fatal("Fire failed")
	}
	b.Step(1.0) // 1 second at speed 5 -> travels 5 units along +X
	p := b.Each
	var pos matrix.Vec2
	found := false
	p(func(h int, pr *Projectile) {
		if h == handle {
			pos = pr.Pos
			found = true
		}
	})
	if !found {
		t.Fatal("projectile not found after Step")
	}
	want := matrix.NewVec2(5, 0)
	if matrix.Abs(pos.X()-want.X()) > 0.001 || matrix.Abs(pos.Y()-want.Y()) > 0.001 {
		t.Fatalf("Pos after Step(1.0) = %v, want %v", pos, want)
	}
}

func TestProjectileExpiresWhenLifeRunsOut(t *testing.T) {
	b := NewBattery(4)
	handle, ok := b.Fire(matrix.NewVec2(0, 0), matrix.NewVec2(1, 0), 1, 1, 0.5)
	if !ok {
		t.Fatal("Fire failed")
	}
	if b.Live() != 1 {
		t.Fatalf("Live() = %d, want 1", b.Live())
	}
	b.Step(0.3)
	if b.Live() != 1 {
		t.Fatal("projectile expired too early")
	}
	b.Step(0.3) // total 0.6s > 0.5s life
	if b.Live() != 0 {
		t.Fatalf("Live() after life expired = %d, want 0", b.Live())
	}
	found := false
	b.Each(func(h int, p *Projectile) {
		if h == handle {
			found = true
		}
	})
	if found {
		t.Fatal("expired projectile still visited by Each")
	}
}

func TestProjectileDoesNotHomeOnMovingTarget(t *testing.T) {
	b := NewBattery(4)
	origin := matrix.NewVec2(0, 0)
	target := matrix.NewVec2(10, 0)
	handle, ok := b.Fire(origin, target, 5, 1, 10.0)
	if !ok {
		t.Fatal("Fire failed")
	}
	// The target "moves" -- but Fire has already committed to a heading,
	// so nothing about the projectile's future path depends on it.
	b.Step(1.0)
	var pos matrix.Vec2
	b.Each(func(h int, p *Projectile) {
		if h == handle {
			pos = p.Pos
		}
	})
	// After 1s at speed 5 toward (10,0) from origin, it should be at (5,0)
	// regardless of any target movement, since it is not homing.
	want := matrix.NewVec2(5, 0)
	if matrix.Abs(pos.X()-want.X()) > 0.001 || matrix.Abs(pos.Y()-want.Y()) > 0.001 {
		t.Fatalf("Pos = %v, want %v -- projectile must fly its original heading, not curve toward a moved target", pos, want)
	}
}

func TestBatteryPoolExhaustionAndDespawn(t *testing.T) {
	const capacity = 3
	b := NewBattery(capacity)
	handles := make([]int, 0, capacity)
	for i := 0; i < capacity; i++ {
		h, ok := b.Fire(matrix.Vec2Zero(), matrix.NewVec2(1, 0), 1, 1, 10)
		if !ok {
			t.Fatalf("Fire %d failed before battery was full", i)
		}
		handles = append(handles, h)
	}
	if b.Available() != 0 {
		t.Fatalf("Available() = %d, want 0", b.Available())
	}
	_, ok := b.Fire(matrix.Vec2Zero(), matrix.NewVec2(1, 0), 1, 1, 10)
	if ok {
		t.Fatal("Fire on an exhausted battery returned ok=true, want false")
	}

	b.Despawn(handles[0])
	if b.Available() != 1 {
		t.Fatalf("Available() after Despawn = %d, want 1", b.Available())
	}
	_, ok = b.Fire(matrix.Vec2Zero(), matrix.NewVec2(1, 0), 1, 1, 10)
	if !ok {
		t.Fatal("Fire after Despawn returned ok=false, want true -- Despawn should free a slot")
	}
}
