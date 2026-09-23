package arena

import (
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
	"boxwrench.dev/boxgames/games/noisefloor/internal/render"
	"boxwrench.dev/boxgames/shared/spritesheet"

	"kaijuengine.com/matrix"
)

// fakeSpriteBank is a minimal spriteBank double. render.SpriteSet cannot be
// constructed in a unit test -- it needs a live, GPU-backed engine.Host,
// which nothing in this package's tests has -- so hordeView's Acquire/
// Release logic (and, through it, Arena.despawnEnemy's unwind -- see
// enemies_test.go) is exercised against this fake instead. It tracks
// acquired/released *render.Sprite identities using zero-value Sprite
// pointers (new(render.Sprite)), which is safe here because the fake never
// calls any Sprite method -- it only compares pointer identity, the same
// way the real SpriteSet's free list only ever compares sp.index and sp
// pointer identity.
type fakeSpriteBank struct {
	capacity int
	live     map[*render.Sprite]bool
	released []*render.Sprite
}

func newFakeSpriteBank(capacity int) *fakeSpriteBank {
	return &fakeSpriteBank{capacity: capacity, live: make(map[*render.Sprite]bool)}
}

func (b *fakeSpriteBank) Acquire() (*render.Sprite, *spritesheet.Animator, bool) {
	if len(b.live) >= b.capacity {
		return nil, nil, false
	}
	sp := new(render.Sprite)
	b.live[sp] = true
	// The fake never calls any Animator method either, for the same reason
	// it never calls Sprite methods (see the type doc comment) -- nil is a
	// safe stand-in.
	return sp, nil, true
}

func (b *fakeSpriteBank) Release(sp *render.Sprite) {
	// A nil sprite panics here, mirroring what the real render.SpriteSet.
	// Release does when it dereferences sp.index on a nil sprite. Without
	// this, the fake's map-lookup no-op (b.live[nil] is simply false) would
	// make TestHordeViewReleaseNeverAcquiredIsNoop pass even if
	// hordeView.Release's `if view.sprite != nil` guard were deleted --
	// which would panic for real against the production SpriteSet. See
	// task-8b brief's carryover note: the director is the first code that
	// releases handles around wave boundaries, so this matters here.
	if sp == nil {
		panic("fakeSpriteBank.Release: nil sprite")
	}
	if !b.live[sp] {
		return
	}
	delete(b.live, sp)
	b.released = append(b.released, sp)
}

// SyncOne is a no-op: the fake never calls any Sprite or Animator method
// (see the type doc comment) -- a real push would panic against the
// zero-value Sprite and nil Animator this fake hands out, so the whole point
// of routing hordeView.SyncOne through the spriteBank interface is that a
// test double can decline to do it.
func (b *fakeSpriteBank) SyncOne(sp *render.Sprite, an *spritesheet.Animator, pos matrix.Vec2, color matrix.Color) {
}

func (b *fakeSpriteBank) available() int { return b.capacity - len(b.live) }

// TestHordeViewAcquireReleaseRoundTrip confirms the seam the wave director
// depends on: acquiring for a handle and releasing it returns the bank to
// full availability, and a released slot can be acquired again -- the same
// handle or a different one.
func TestHordeViewAcquireReleaseRoundTrip(t *testing.T) {
	const arch = actor.Mote
	const capacity = 4
	bank := newFakeSpriteBank(2)
	v := newHordeView(map[actor.Archetype]spriteBank{arch: bank}, capacity)

	if ok := v.Acquire(0, arch); !ok {
		t.Fatal("Acquire(0) failed unexpectedly")
	}
	if got := bank.available(); got != 1 {
		t.Fatalf("bank.available() after Acquire = %d, want 1", got)
	}

	v.Release(0)
	if got := bank.available(); got != 2 {
		t.Fatalf("bank.available() after Release = %d, want 2 (full capacity restored)", got)
	}

	// The released slot -- and the bank generally -- must be usable again,
	// including by a different handle, exactly as the wave director resetting
	// between waves will do.
	if ok := v.Acquire(1, arch); !ok {
		t.Fatal("Acquire(1) after Release failed unexpectedly, want the bank to accept a fresh acquire")
	}
	if got := bank.available(); got != 1 {
		t.Fatalf("bank.available() after re-Acquire = %d, want 1", got)
	}
}

// TestHordeViewAcquireOnExhaustedBankFails confirms Acquire reports ok ==
// false when the archetype's bank has nothing left, and leaves the view
// unchanged -- no half-acquired slot recorded for handle.
func TestHordeViewAcquireOnExhaustedBankFails(t *testing.T) {
	const arch = actor.Mote
	const capacity = 4
	bank := newFakeSpriteBank(1)
	v := newHordeView(map[actor.Archetype]spriteBank{arch: bank}, capacity)

	if ok := v.Acquire(0, arch); !ok {
		t.Fatal("Acquire(0) failed unexpectedly (bank has capacity 1)")
	}
	if ok := v.Acquire(1, arch); ok {
		t.Fatal("Acquire(1) on an exhausted bank = true, want false")
	}

	if got := v.enemyViews[1]; got != (enemyView{}) {
		t.Fatalf("enemyViews[1] after a failed Acquire = %+v, want zero value: no half-acquired slot", got)
	}
	if got := bank.available(); got != 0 {
		t.Fatalf("bank.available() after the failed Acquire = %d, want 0 (unchanged)", got)
	}
}

// TestHordeViewReleaseNeverAcquiredIsNoop confirms Release on a handle that
// was never acquired -- e.g. one that never had a slot in this view, or one
// the wave director resets between waves without ever having spawned
// anything into it -- is a safe no-op, not a panic or a double-release.
func TestHordeViewReleaseNeverAcquiredIsNoop(t *testing.T) {
	const arch = actor.Mote
	const capacity = 4
	bank := newFakeSpriteBank(2)
	v := newHordeView(map[actor.Archetype]spriteBank{arch: bank}, capacity)

	v.Release(2) // must not panic

	if got := len(bank.released); got != 0 {
		t.Fatalf("bank.released after releasing a never-acquired handle = %d entries, want 0", got)
	}
	if got := bank.available(); got != 2 {
		t.Fatalf("bank.available() after releasing a never-acquired handle = %d, want 2 (unchanged)", got)
	}

	// Releasing the same never-acquired handle again must also be a no-op.
	v.Release(2)
	if got := len(bank.released); got != 0 {
		t.Fatalf("bank.released after a second release of a never-acquired handle = %d entries, want 0", got)
	}
}
