package actor

import (
	"testing"

	"kaijuengine.com/platform/hid"
)

// fakeKeys implements KeyState for tests, with no window required.
type fakeKeys map[hid.KeyboardKey]bool

func (f fakeKeys) KeyHeld(key hid.KeyboardKey) bool { return f[key] }

func TestSampleMoveNoKeys(t *testing.T) {
	got := SampleMove(fakeKeys{})
	if got.X != 0 || got.Y != 0 {
		t.Fatalf("SampleMove with no keys = %+v, want zero", got)
	}
}

func TestSampleMoveWASD(t *testing.T) {
	cases := []struct {
		name  string
		key   hid.KeyboardKey
		wantX float32
		wantY float32
	}{
		{"W is up", hid.KeyboardKeyW, 0, 1},
		{"S is down", hid.KeyboardKeyS, 0, -1},
		{"A is left", hid.KeyboardKeyA, -1, 0},
		{"D is right", hid.KeyboardKeyD, 1, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := SampleMove(fakeKeys{tc.key: true})
			if got.X != tc.wantX || got.Y != tc.wantY {
				t.Fatalf("SampleMove = %+v, want {X:%v Y:%v}", got, tc.wantX, tc.wantY)
			}
		})
	}
}

func TestSampleMoveArrowKeysMatchWASD(t *testing.T) {
	wasd := SampleMove(fakeKeys{hid.KeyboardKeyW: true})
	arrow := SampleMove(fakeKeys{hid.KeyboardKeyUp: true})
	if wasd != arrow {
		t.Fatalf("arrow %+v != wasd %+v", arrow, wasd)
	}
}

func TestSampleMoveOpposingKeysCancel(t *testing.T) {
	got := SampleMove(fakeKeys{hid.KeyboardKeyA: true, hid.KeyboardKeyD: true})
	if got.X != 0 {
		t.Fatalf("A+D held gave X=%v, want 0", got.X)
	}
}

func TestSampleMoveDiagonal(t *testing.T) {
	got := SampleMove(fakeKeys{hid.KeyboardKeyW: true, hid.KeyboardKeyD: true})
	if got.X != 1 || got.Y != 1 {
		t.Fatalf("W+D gave %+v, want {X:1 Y:1}", got)
	}
}
