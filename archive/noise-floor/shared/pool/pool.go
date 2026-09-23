// Package pool provides a fixed-capacity object pool for gameplay entities.
//
// Survivors-likes churn thousands of short-lived objects per wave: projectiles,
// particles, damage numbers, XP gems. Raw sprite throughput is not the concern
// (the Kaiju spike measured ~20,000 sprites inside a 60fps budget); allocation
// churn and the GC pauses it causes mid-wave are.
//
// The pool never grows. Exhaustion returns ok=false so callers make an explicit
// decision — usually recycling the oldest live object for cosmetic things, or
// skipping the spawn for gameplay ones. Silent growth would trade a visible
// cap for an invisible stutter.
package pool

// Pool hands out reusable objects from a fixed backing array.
//
// It is not safe for concurrent use; gameplay systems run on the update thread.
type Pool[T any] struct {
	items []T
	free  []int
	live  []bool
}

// New builds a pool of the given capacity, calling reset on each item as it is
// constructed so every object starts in a known state.
func New[T any](capacity int, reset func(*T)) *Pool[T] {
	p := &Pool[T]{
		items: make([]T, capacity),
		free:  make([]int, capacity),
		live:  make([]bool, capacity),
	}
	for i := range p.items {
		if reset != nil {
			reset(&p.items[i])
		}
		// Fill the free list back-to-front so the first Take returns index 0,
		// which keeps traversal order stable and debugging predictable.
		p.free[i] = capacity - 1 - i
	}
	return p
}

// Take checks out an object, returning its handle. ok is false when the pool is
// exhausted; the caller decides what that means.
func (p *Pool[T]) Take() (item *T, handle int, ok bool) {
	n := len(p.free)
	if n == 0 {
		return nil, -1, false
	}
	idx := p.free[n-1]
	p.free = p.free[:n-1]
	p.live[idx] = true
	return &p.items[idx], idx, true
}

// Put returns an object to the pool. Returning an object twice is ignored
// rather than corrupting the free list, because double-free in gameplay code
// is usually a lifetime bug that should not also become a memory bug.
func (p *Pool[T]) Put(handle int) {
	if handle < 0 || handle >= len(p.items) || !p.live[handle] {
		return
	}
	p.live[handle] = false
	p.free = append(p.free, handle)
}

// Get returns the object for a handle, or nil if the handle is not live.
func (p *Pool[T]) Get(handle int) *T {
	if handle < 0 || handle >= len(p.items) || !p.live[handle] {
		return nil
	}
	return &p.items[handle]
}

// Each visits every live object.
func (p *Pool[T]) Each(fn func(handle int, item *T)) {
	for i := range p.items {
		if p.live[i] {
			fn(i, &p.items[i])
		}
	}
}

// Reset returns every object to the pool without reallocating. Used between
// waves and on restart.
func (p *Pool[T]) Reset() {
	p.free = p.free[:0]
	for i := range p.items {
		p.live[i] = false
		p.free = append(p.free, len(p.items)-1-i)
	}
}

// Capacity is the fixed size of the pool.
func (p *Pool[T]) Capacity() int { return len(p.items) }

// Live is the number of checked-out objects.
func (p *Pool[T]) Live() int { return len(p.items) - len(p.free) }

// Available is the number of objects left before exhaustion.
func (p *Pool[T]) Available() int { return len(p.free) }
