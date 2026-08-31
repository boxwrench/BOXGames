package horde

import (
	"math/rand"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
)

// Wave is one wave's fixed identity: what to spawn, how fast to release it,
// and how hard corruption presses while it runs.
type Wave struct {
	Composition  map[actor.Archetype]int // how many of each archetype to spawn
	SpawnWindow  float64                 // seconds over which the composition is released
	PressurePeak float32                 // corruption pressure at the end of the window
}

// Phase is what the director is doing right now.
type Phase int

const (
	PhaseSpawning Phase = iota // releasing this wave's composition
	PhaseClearing              // everything released, waiting for the field to empty
	PhaseLull                  // wave cleared, page washing back before the next
	PhaseComplete              // all waves cleared
)

// LullSeconds is how long the director holds PhaseLull -- pressure 0, page
// receding -- between a wave clearing and the next wave's composition
// starting to release.
//
// Deliberately short relative to how far the page can recede: arena's
// recedeRate (world units/sec the page washes back at) against the arena's
// safe-radius span (safeRadiusMax - safeRadiusMin, ~6.6 units) means the full
// span recedes in ~2.2s. horde does not import arena (see the package
// layering rule), so that relationship can't be enforced by a shared
// constant -- it is only documented here. The intent is that a lull restores
// roughly half the span, not all of it, so a wave that pushed deep leaves the
// page visibly darker at the start of the next wave than a wave that barely
// pushed at all -- corruption carries between waves instead of resetting to
// a clean page every single lull, which would flatten the schedule's rising
// difficulty ramp.
const LullSeconds = 1.2

// archetypeReleaseOrder fixes the order a wave's Composition is walked when
// building its release list, so the pre-shuffle order (and therefore the
// shuffled result, for a given rng seed) is reproducible. Go randomizes map
// iteration order per process, so ranging directly over Composition would
// make even a seeded rng produce a different release order on every run.
var archetypeReleaseOrder = []actor.Archetype{
	actor.Mote, actor.Dendrite, actor.Aberrant, actor.Lancer, actor.Overfit,
}

// Director owns the wave schedule: composition, timing, clear detection, and
// the corruption pressure that rises through a wave and drops to 0 on clear.
type Director struct {
	waves []Wave
	rng   *rand.Rand

	waveIndex int
	phase     Phase

	windowElapsed float64 // seconds elapsed in the current wave's PhaseSpawning
	lullElapsed   float64 // seconds elapsed in the current PhaseLull

	release  []actor.Archetype // current wave's full composition, shuffled
	released int               // how many of release have been returned so far

	cleared bool // true only for the Step call the current wave clears on

	// spawnOut is the buffer Step returns. It is reused every call -- see
	// Step's doc comment -- so a caller must not retain the returned slice
	// past the call that produced it.
	spawnOut []actor.Archetype
}

// NewDirector builds a director over waves, starting at wave 0. rng is
// injected so the shuffled release order is deterministic under test.
func NewDirector(waves []Wave, rng *rand.Rand) *Director {
	d := &Director{waves: waves, rng: rng}
	d.Reset()
	return d
}

// Reset restarts the schedule at wave 0 with a freshly built (and freshly
// shuffled) release list, and clears the Cleared() latch.
//
// This resets the schedule only. It does not touch anything already
// spawned: live enemies (horde.Spawner) and their sprites (the arena's
// hordeView) are both entirely outside the Director's knowledge, so calling
// Reset alone leaves the field exactly as populated as it was the moment
// before -- a caller that wants a clean "restart run" is responsible for
// despawning every live enemy and releasing its sprite itself, separately.
// There is no Arena-level reset yet.
func (d *Director) Reset() {
	d.waveIndex = 0
	d.windowElapsed = 0
	d.lullElapsed = 0
	d.released = 0
	d.cleared = false
	d.spawnOut = d.spawnOut[:0]
	if len(d.waves) == 0 {
		d.phase = PhaseComplete
		d.release = nil
		return
	}
	d.phase = PhaseSpawning
	d.release = buildReleaseList(d.waves[0], d.rng)
}

// Phase reports what the director is doing right now.
func (d *Director) Phase() Phase { return d.phase }

// WaveIndex is the 0-based index of the current wave. Once PhaseComplete, it
// stays at the last wave rather than incrementing past the end of the
// schedule.
func (d *Director) WaveIndex() int { return d.waveIndex }

// Cleared reports whether the current wave was cleared on this call to Step.
// True for exactly the one Step call the clear happens on -- not for any of
// the PhaseLull frames that follow it.
func (d *Director) Cleared() bool { return d.cleared }

// Step advances the schedule by dt seconds against live, the number of
// enemies currently alive. It returns what to spawn this frame (empty when
// nothing is due this call) and the corruption pressure to apply this frame.
//
// spawn is a slice owned by the Director and reused on every call -- the
// caller must not retain it past this call; copy it first if it needs to
// survive longer.
//
// A dt that crosses one or more phase boundaries carries its remainder
// forward rather than losing it: a single long frame can finish a wave's
// spawn window, clear it (if live is already 0), run out the whole lull, and
// start releasing the next wave's composition, all in one Step call.
func (d *Director) Step(dt float64, live int) (spawn []actor.Archetype, pressure float32) {
	d.cleared = false
	d.spawnOut = d.spawnOut[:0]

stepLoop:
	for {
		switch d.phase {
		case PhaseComplete:
			break stepLoop

		case PhaseSpawning:
			wave := d.waves[d.waveIndex]
			remaining := wave.SpawnWindow - d.windowElapsed
			if dt < remaining {
				d.windowElapsed += dt
				d.releaseDue(wave)
				break stepLoop
			}
			dt -= remaining
			d.windowElapsed = wave.SpawnWindow
			d.releaseRest()
			d.phase = PhaseClearing

		case PhaseClearing:
			// live is the caller's PRE-frame count -- it does not include
			// what this very call is about to hand back in d.spawnOut.
			// releaseRest (in the PhaseSpawning case just above) always
			// flushes a wave's last release-list entries in the same call
			// that closes the spawn window -- releaseDue's rounding can
			// never reach the full count while windowElapsed < SpawnWindow
			// -- so the call that first reaches PhaseClearing is routinely
			// also the call handing the caller its final spawns. A wave
			// cannot be clear while it is still being handed enemies to
			// spawn this frame, so gate on both: live plus whatever this
			// call is about to release.
			if live+len(d.spawnOut) != 0 {
				break stepLoop
			}
			d.cleared = true
			d.phase = PhaseLull
			d.lullElapsed = 0

		case PhaseLull:
			remaining := LullSeconds - d.lullElapsed
			if dt < remaining {
				d.lullElapsed += dt
				break stepLoop
			}
			dt -= remaining
			d.advanceWave()
		}
	}

	return d.spawnOut, d.currentPressure()
}

// advanceWave moves to the next wave's PhaseSpawning with a fresh release
// list, or to PhaseComplete if the schedule is exhausted. waveIndex is left
// at the last wave once complete, rather than incremented past the end.
func (d *Director) advanceWave() {
	next := d.waveIndex + 1
	if next >= len(d.waves) {
		d.phase = PhaseComplete
		return
	}
	d.waveIndex = next
	d.phase = PhaseSpawning
	d.windowElapsed = 0
	d.released = 0
	d.release = buildReleaseList(d.waves[d.waveIndex], d.rng)
}

// releaseDue appends every release-list entry due by the current
// windowElapsed that has not already been returned by an earlier call.
func (d *Director) releaseDue(wave Wave) {
	n := len(d.release)
	if n == 0 || wave.SpawnWindow <= 0 {
		return
	}
	due := int(d.windowElapsed / wave.SpawnWindow * float64(n))
	if due > n {
		due = n
	}
	for d.released < due {
		d.spawnOut = append(d.spawnOut, d.release[d.released])
		d.released++
	}
}

// releaseRest releases everything left in the current release list. Called
// when the spawn window closes, so the composition is guaranteed fully
// released by the end of the window regardless of any rounding in
// releaseDue's division.
func (d *Director) releaseRest() {
	for d.released < len(d.release) {
		d.spawnOut = append(d.spawnOut, d.release[d.released])
		d.released++
	}
}

// currentPressure derives this Step call's corruption pressure from the
// phase it ends in: rising linearly from 1.0 to the wave's PressurePeak
// across PhaseSpawning, held at PressurePeak through PhaseClearing, and 0
// through PhaseLull and PhaseComplete.
func (d *Director) currentPressure() float32 {
	switch d.phase {
	case PhaseSpawning:
		wave := d.waves[d.waveIndex]
		if wave.SpawnWindow <= 0 {
			return wave.PressurePeak
		}
		t := float32(d.windowElapsed / wave.SpawnWindow)
		if t > 1 {
			t = 1
		}
		return 1 + (wave.PressurePeak-1)*t
	case PhaseClearing:
		return d.waves[d.waveIndex].PressurePeak
	default: // PhaseLull, PhaseComplete
		return 0
	}
}

// buildReleaseList expands a wave's composition into a flat, shuffled
// release order: archetypes are walked in archetypeReleaseOrder (fixed, not
// map iteration order) so the pre-shuffle order -- and therefore the
// shuffled result, for a given rng seed -- is reproducible.
func buildReleaseList(w Wave, rng *rand.Rand) []actor.Archetype {
	total := 0
	for _, n := range w.Composition {
		total += n
	}
	list := make([]actor.Archetype, 0, total)
	for _, arch := range archetypeReleaseOrder {
		for i := 0; i < w.Composition[arch]; i++ {
			list = append(list, arch)
		}
	}
	rng.Shuffle(len(list), func(i, j int) { list[i], list[j] = list[j], list[i] })
	return list
}
