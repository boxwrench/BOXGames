package actor

import (
	"math"
	"testing"

	"kaijuengine.com/matrix"
)

func allArchetypes() []Archetype {
	return []Archetype{Mote, Dendrite, Aberrant, Lancer, Overfit}
}

func TestStatsForCoversAllArchetypes(t *testing.T) {
	for _, a := range allArchetypes() {
		s := StatsFor(a)
		if s.Size <= 0 {
			t.Errorf("%s: Size = %v, want positive", a.Name(), s.Size)
		}
		if s.Speed <= 0 {
			t.Errorf("%s: Speed = %v, want positive", a.Name(), s.Speed)
		}
		if s.Health <= 0 {
			t.Errorf("%s: Health = %v, want positive", a.Name(), s.Health)
		}
	}
}

func TestStatsForExactValues(t *testing.T) {
	cases := []struct {
		a      Archetype
		size   float32
		speed  float32
		health int
	}{
		{Mote, 0.35, 3.2, 1},
		{Dendrite, 1.10, 1.1, 12},
		{Aberrant, 0.70, 1.8, 4},
		{Lancer, 0.80, 1.4, 3},
		{Overfit, 0.70, 2.0, 5},
	}
	const epsilon = 0.0001
	for _, tc := range cases {
		s := StatsFor(tc.a)
		if matrix.Abs(s.Size-tc.size) > epsilon {
			t.Errorf("%s: Size = %v, want %v", tc.a.Name(), s.Size, tc.size)
		}
		if matrix.Abs(s.Speed-tc.speed) > epsilon {
			t.Errorf("%s: Speed = %v, want %v", tc.a.Name(), s.Speed, tc.speed)
		}
		if s.Health != tc.health {
			t.Errorf("%s: Health = %v, want %v", tc.a.Name(), s.Health, tc.health)
		}
	}
}

func TestStatsForUnknownArchetypePanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("StatsFor(unknown) did not panic")
		}
	}()
	StatsFor(Archetype(999))
}

func TestArchetypeNamesAreDistinctAndNonEmpty(t *testing.T) {
	seen := map[string]bool{}
	for _, a := range allArchetypes() {
		n := a.Name()
		if n == "" {
			t.Errorf("archetype %d has empty Name()", a)
		}
		if seen[n] {
			t.Errorf("Name() %q is not unique", n)
		}
		seen[n] = true
	}
}

func TestArchetypeNameUnknownPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("Name() on unknown archetype did not panic")
		}
	}()
	_ = Archetype(999).Name()
}

func TestSplitPositionsCountAndRadius(t *testing.T) {
	origin := matrix.NewVec2(10, -5)
	positions := SplitPositions(origin, SplitRadius)
	if len(positions) != SplitCount {
		t.Fatalf("len(SplitPositions()) = %d, want %d", len(positions), SplitCount)
	}
	const epsilon = 0.001
	for i, p := range positions {
		dist := p.Distance(origin)
		if matrix.Abs(dist-SplitRadius) > epsilon {
			t.Errorf("position %d distance from origin = %v, want %v", i, dist, SplitRadius)
		}
	}
}

func TestSplitPositionsAreDistinct(t *testing.T) {
	origin := matrix.Vec2Zero()
	positions := SplitPositions(origin, SplitRadius)
	for i := range positions {
		for j := range positions {
			if i == j {
				continue
			}
			if positions[i].Equals(positions[j]) {
				t.Errorf("positions[%d] and positions[%d] are equal: %v", i, j, positions[i])
			}
		}
	}
}

func TestSplitPositionsAngles(t *testing.T) {
	origin := matrix.Vec2Zero()
	r := float32(2.0)
	positions := SplitPositions(origin, r)
	const epsilon = 0.001
	for i, p := range positions {
		wantAngle := float64(i) * (2 * math.Pi / float64(SplitCount))
		want := matrix.NewVec2(r*float32(math.Cos(wantAngle)), r*float32(math.Sin(wantAngle)))
		if matrix.Abs(p.X()-want.X()) > epsilon || matrix.Abs(p.Y()-want.Y()) > epsilon {
			t.Errorf("position %d = %v, want %v (angle %v rad)", i, p, want, wantAngle)
		}
	}
	// First child sits at angle 0, i.e. origin + (r, 0).
	if matrix.Abs(positions[0].X()-r) > epsilon || matrix.Abs(positions[0].Y()) > epsilon {
		t.Errorf("positions[0] = %v, want (%v, 0)", positions[0], r)
	}
}

func TestSplitPositionsAreOffsetFromOrigin(t *testing.T) {
	origin := matrix.NewVec2(100, 200)
	positions := SplitPositions(origin, SplitRadius)
	for i, p := range positions {
		if p.Distance(origin) < 0.001 {
			t.Errorf("position %d coincides with origin: %v", i, p)
		}
	}
}
