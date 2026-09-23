package actor

import "kaijuengine.com/platform/hid"

// KeyState is the slice of the keyboard this package needs. Depending on an
// interface rather than *hid.Keyboard keeps input sampling testable without a
// window.
//
// KeyHeld is the continuous "is down right now" query, which is what movement
// wants. KeyDown and KeyUp are edge-triggered and fire for a single frame.
type KeyState interface {
	KeyHeld(key hid.KeyboardKey) bool
}

// SampleMove reads movement intent. Arrow keys mirror WASD, and opposing keys
// cancel. The result is un-normalised; MoveDelta handles that.
func SampleMove(kb KeyState) MoveInput {
	var in MoveInput
	if kb.KeyHeld(hid.KeyboardKeyW) || kb.KeyHeld(hid.KeyboardKeyUp) {
		in.Y++
	}
	if kb.KeyHeld(hid.KeyboardKeyS) || kb.KeyHeld(hid.KeyboardKeyDown) {
		in.Y--
	}
	if kb.KeyHeld(hid.KeyboardKeyD) || kb.KeyHeld(hid.KeyboardKeyRight) {
		in.X++
	}
	if kb.KeyHeld(hid.KeyboardKeyA) || kb.KeyHeld(hid.KeyboardKeyLeft) {
		in.X--
	}
	return in
}

// Compile-time proof that the engine's keyboard satisfies KeyState.
var _ KeyState = (*hid.Keyboard)(nil)
