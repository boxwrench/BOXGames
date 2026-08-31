package horde

import (
	"math/rand"
	"testing"

	"boxwrench.dev/boxgames/games/noisefloor/internal/actor"
)

// --- wave progression --------------------------------------------------

// TestDirectorAdvancesThroughAllWavesToComplete drives the real eight-wave
// schedule with a caller that dutifully keeps live at 0 (everything already
// dead) and confirms the director reaches PhaseComplete having cleared every
// wave exactly once.
func TestDirectorAdvancesThroughAllWavesToComplete(t *testing.T) {
	waves := DefaultSchedule()
	d := NewDirector(waves, rand.New(rand.NewSource(123)))

	const dt = 0.05
	const maxSteps = 2_000_000
	clears := 0
	i := 0
	for ; i < maxSteps; i++ {
		if d.Phase() == PhaseComplete {
			break
		}
		d.Step(dt, 0)
		if d.Cleared() {
			clears++
		}
	}
	if d.Phase() != PhaseComplete {
		t.Fatalf("director did not reach PhaseComplete within %d steps (dt=%v)", maxSteps, dt)
	}
	if clears != len(waves) {
		t.Fatalf("saw %d clears, want %d (one per wave)", clears, len(waves))
	}
}

// --- clear detection -----------------------------------------------------

// TestDirectorClearDetectionHoldsUntilLiveZero confirms PhaseClearing holds
// while live > 0, pressure stays at PressurePeak throughout, and the clear
// (Cleared() true, pressure drops to 0, phase moves to PhaseLull) happens on
// exactly the frame live reaches 0 -- and Cleared() does not stay true
// through the lull that follows.
func TestDirectorClearDetectionHoldsUntilLiveZero(t *testing.T) {
	waves := []Wave{
		{Composition: map[actor.Archetype]int{actor.Mote: 3}, SpawnWindow: 1.0, PressurePeak: 1.5},
		{Composition: map[actor.Archetype]int{actor.Mote: 3}, SpawnWindow: 1.0, PressurePeak: 1.5},
	}
	d := NewDirector(waves, rand.New(rand.NewSource(1)))

	d.Step(1.0, 3) // exhaust the spawn window with 3 enemies still alive
	if d.Phase() != PhaseClearing {
		t.Fatalf("phase after window exhausted = %v, want PhaseClearing", d.Phase())
	}

	for i := 0; i < 5; i++ {
		_, pressure := d.Step(0.1, 3)
		if d.Phase() != PhaseClearing {
			t.Fatalf("frame %d: phase = %v, want PhaseClearing to hold while live > 0", i, d.Phase())
		}
		if d.Cleared() {
			t.Fatalf("frame %d: Cleared() = true while live > 0", i)
		}
		if pressure != waves[0].PressurePeak {
			t.Fatalf("frame %d: pressure = %v, want PressurePeak %v held through PhaseClearing", i, pressure, waves[0].PressurePeak)
		}
	}

	_, pressure := d.Step(0.1, 0)
	if !d.Cleared() {
		t.Fatal("Cleared() = false on the frame live reaches 0, want true")
	}
	if d.Phase() != PhaseLull {
		t.Fatalf("phase after clear = %v, want PhaseLull", d.Phase())
	}
	if pressure != 0 {
		t.Fatalf("pressure on the clear frame = %v, want 0", pressure)
	}

	for i := 0; i < 5; i++ {
		d.Step(0.1, 0)
		if d.Cleared() {
			t.Fatalf("frame %d of lull: Cleared() = true, want false (true only on the clearing frame itself)", i)
		}
	}
}

// --- pressure monotonicity -------------------------------------------------

// TestDirectorPressureMonotonicWithinWave samples pressure across a spawn
// window (and beyond, into PhaseClearing) with live held high enough that
// the wave never clears, and asserts it never decreases and reaches
// PressurePeak.
func TestDirectorPressureMonotonicWithinWave(t *testing.T) {
	wave := Wave{Composition: map[actor.Archetype]int{actor.Mote: 10}, SpawnWindow: 5.0, PressurePeak: 2.0}
	d := NewDirector([]Wave{wave}, rand.New(rand.NewSource(1)))

	const dt = 0.1
	prev := float32(0)
	reachedPeak := false
	steps := int(wave.SpawnWindow/dt) + 5
	for i := 0; i < steps; i++ {
		_, pressure := d.Step(dt, 999) // live never reaches 0: stays in Spawning then Clearing
		if pressure < prev {
			t.Fatalf("step %d: pressure %v decreased from %v, want monotonic non-decreasing", i, pressure, prev)
		}
		prev = pressure
		if pressure == wave.PressurePeak {
			reachedPeak = true
		}
	}
	if !reachedPeak {
		t.Fatalf("pressure never reached PressurePeak %v; last = %v", wave.PressurePeak, prev)
	}
}

// --- composition release ---------------------------------------------------

// TestDirectorCompositionFullyReleased confirms the total spawned across a
// wave equals the composition's total, with the right count per archetype,
// and that nothing is released once the wave has moved past its window
// (verified by summing over the whole run, well past the window and clear).
func TestDirectorCompositionFullyReleased(t *testing.T) {
	wave := Wave{
		Composition:  map[actor.Archetype]int{actor.Mote: 4, actor.Lancer: 2, actor.Aberrant: 1},
		SpawnWindow:  2.0,
		PressurePeak: 1.5,
	}
	d := NewDirector([]Wave{wave}, rand.New(rand.NewSource(3)))

	counts := map[actor.Archetype]int{}
	total := 0
	const dt = 1.0 / 60.0
	steps := int(wave.SpawnWindow/dt) + 300 // run comfortably past window, clear and lull
	for i := 0; i < steps; i++ {
		spawn, _ := d.Step(dt, 0)
		for _, a := range spawn {
			counts[a]++
			total++
		}
	}

	wantTotal := 0
	for _, n := range wave.Composition {
		wantTotal += n
	}
	if total != wantTotal {
		t.Fatalf("total spawned = %d, want %d (composition total)", total, wantTotal)
	}
	for arch, n := range wave.Composition {
		if counts[arch] != n {
			t.Fatalf("spawned %d of %v, want %d", counts[arch], arch, n)
		}
	}
}

// --- shuffled release order -------------------------------------------------

// TestDirectorSpawnsShuffledNotGrouped confirms a wave's release order, for a
// fixed rng seed, interleaves archetypes rather than releasing one archetype
// entirely before the next.
func TestDirectorSpawnsShuffledNotGrouped(t *testing.T) {
	wave := Wave{
		Composition:  map[actor.Archetype]int{actor.Mote: 5, actor.Lancer: 5},
		SpawnWindow:  10.0,
		PressurePeak: 1.5,
	}
	d := NewDirector([]Wave{wave}, rand.New(rand.NewSource(42)))

	spawn, _ := d.Step(wave.SpawnWindow, 0) // whole window in one call: full order visible
	if len(spawn) != 10 {
		t.Fatalf("len(spawn) = %d, want 10", len(spawn))
	}

	allSame := true
	for _, a := range spawn {
		if a != spawn[0] {
			allSame = false
			break
		}
	}
	if allSame {
		t.Fatal("release order is a single archetype throughout, want a mix")
	}

	switches := 0
	for i := 1; i < len(spawn); i++ {
		if spawn[i] != spawn[i-1] {
			switches++
		}
	}
	if switches < 2 {
		t.Fatalf("release order switches archetype only %d times across 10 entries (%v), "+
			"want an interleaved (shuffled) order, not two contiguous blocks", switches, spawn)
	}
}

// --- overshoot carries across phase boundaries ------------------------------

// TestDirectorOvershootFromSpawningCarriesThroughClearAndLull drives a single
// Step call with a dt that finishes wave 1's window, clears it (live is
// passed as 0), runs the whole lull, and lands partway into wave 2's window
// -- all in one call. The leftover time must not be dropped at any boundary.
func TestDirectorOvershootFromSpawningCarriesThroughClearAndLull(t *testing.T) {
	waves := []Wave{
		{Composition: map[actor.Archetype]int{actor.Mote: 2}, SpawnWindow: 1.0, PressurePeak: 1.5},
		{Composition: map[actor.Archetype]int{actor.Mote: 2}, SpawnWindow: 1.0, PressurePeak: 1.5},
	}
	d := NewDirector(waves, rand.New(rand.NewSource(1)))

	spawn, pressure := d.Step(1.0+LullSeconds+0.4, 0)

	if d.Phase() != PhaseSpawning || d.WaveIndex() != 1 {
		t.Fatalf("phase=%v waveIndex=%d, want PhaseSpawning wave 1: overshoot must carry across the "+
			"wave-1 clear, the whole lull, and into wave 2's window in a single call", d.Phase(), d.WaveIndex())
	}
	if !d.Cleared() {
		t.Fatal("Cleared() = false, want true: wave 1 cleared during this call")
	}
	if pressure <= 1.0 {
		t.Fatalf("pressure = %v after overshoot 0.4s into wave 2's window, want > 1.0: "+
			"the leftover time after the lull must not be dropped", pressure)
	}
	if len(spawn) == 0 {
		t.Fatal("spawn is empty, want wave 2's first release(s) already due 0.4s into its window")
	}
}

// TestDirectorOvershootDtLargerThanWholeLullCarriesIntoNextWave isolates the
// "a single dt larger than a whole phase" case named in the brief: starting
// already inside PhaseLull, a dt bigger than LullSeconds alone must finish
// the lull and start releasing the next wave's composition in the same call,
// not merely clamp lullElapsed at LullSeconds and wait for a future call.
func TestDirectorOvershootDtLargerThanWholeLullCarriesIntoNextWave(t *testing.T) {
	waves := []Wave{
		{Composition: map[actor.Archetype]int{actor.Mote: 1}, SpawnWindow: 0.5, PressurePeak: 1.5},
		{Composition: map[actor.Archetype]int{actor.Mote: 10}, SpawnWindow: 1.0, PressurePeak: 1.5},
	}
	d := NewDirector(waves, rand.New(rand.NewSource(1)))

	d.Step(0.5, 0) // exhaust window, clear immediately (live=0), enter PhaseLull
	if d.Phase() != PhaseLull {
		t.Fatalf("phase after wave 0 clear = %v, want PhaseLull", d.Phase())
	}

	spawn, pressure := d.Step(LullSeconds+0.3, 999) // dt alone bigger than the whole lull phase
	if d.Phase() != PhaseSpawning || d.WaveIndex() != 1 {
		t.Fatalf("phase=%v waveIndex=%d, want PhaseSpawning wave 1: a dt larger than the whole lull "+
			"must carry its remainder into the next wave's window", d.Phase(), d.WaveIndex())
	}
	if len(spawn) == 0 {
		t.Fatal("spawn is empty, want wave 1's first release(s) already due 0.3s into its window")
	}
	if pressure <= 1.0 {
		t.Fatalf("pressure = %v, want > 1.0 (0.3s into wave 1's window, not sitting at the window's start)", pressure)
	}
}

// --- lull -------------------------------------------------------------------

// TestDirectorLullLastsExactDurationWithZeroPressure confirms PhaseLull holds
// for LullSeconds, with pressure 0 and no spawns throughout, then moves on.
func TestDirectorLullLastsExactDurationWithZeroPressure(t *testing.T) {
	waves := []Wave{
		{Composition: map[actor.Archetype]int{actor.Mote: 1}, SpawnWindow: 0.5, PressurePeak: 1.5},
		{Composition: map[actor.Archetype]int{actor.Mote: 1}, SpawnWindow: 0.5, PressurePeak: 1.5},
	}
	d := NewDirector(waves, rand.New(rand.NewSource(5)))
	d.Step(0.5, 0)
	if d.Phase() != PhaseLull {
		t.Fatalf("phase = %v, want PhaseLull", d.Phase())
	}

	const dt = 0.1
	elapsed := 0.0
	for elapsed+dt < LullSeconds {
		spawn, pressure := d.Step(dt, 0)
		elapsed += dt
		if d.Phase() != PhaseLull {
			t.Fatalf("phase left PhaseLull early at elapsed=%v, want to hold for %v", elapsed, LullSeconds)
		}
		if pressure != 0 {
			t.Fatalf("pressure during lull at elapsed=%v = %v, want 0", elapsed, pressure)
		}
		if len(spawn) != 0 {
			t.Fatalf("spawn during lull at elapsed=%v = %v, want none", elapsed, spawn)
		}
	}

	d.Step(LullSeconds-elapsed+0.01, 0)
	if d.Phase() != PhaseSpawning || d.WaveIndex() != 1 {
		t.Fatalf("phase=%v waveIndex=%d after lull elapses, want PhaseSpawning wave 1", d.Phase(), d.WaveIndex())
	}
}

// --- terminal state ----------------------------------------------------------

// TestDirectorPhaseCompleteIsTerminal confirms that once every wave has
// cleared, further Step calls -- even with an absurdly large dt -- spawn
// nothing, keep pressure at 0, and never wrap WaveIndex back to a nonexistent
// next wave.
func TestDirectorPhaseCompleteIsTerminal(t *testing.T) {
	wave := Wave{Composition: map[actor.Archetype]int{actor.Mote: 1}, SpawnWindow: 0.5, PressurePeak: 1.5}
	d := NewDirector([]Wave{wave}, rand.New(rand.NewSource(9)))

	d.Step(0.5, 0)
	d.Step(LullSeconds+1, 0)
	if d.Phase() != PhaseComplete {
		t.Fatalf("phase = %v, want PhaseComplete", d.Phase())
	}

	for i := 0; i < 5; i++ {
		spawn, pressure := d.Step(100, 0)
		if d.Phase() != PhaseComplete {
			t.Fatalf("step %d: phase = %v, want PhaseComplete to stay terminal", i, d.Phase())
		}
		if len(spawn) != 0 {
			t.Fatalf("step %d: spawn = %v, want none once complete", i, spawn)
		}
		if pressure != 0 {
			t.Fatalf("step %d: pressure = %v, want 0 once complete", i, pressure)
		}
		if d.WaveIndex() != 0 {
			t.Fatalf("step %d: WaveIndex() = %d, want 0 (must not wrap to a nonexistent next wave)", i, d.WaveIndex())
		}
	}
}

// --- reset --------------------------------------------------------------

// TestDirectorResetReturnsToWaveZeroWithFreshReleaseList confirms Reset
// restarts at wave 0, clears the Cleared() latch, and rebuilds the release
// list fresh -- not a partially drained leftover from wherever the schedule
// had progressed to.
func TestDirectorResetReturnsToWaveZeroWithFreshReleaseList(t *testing.T) {
	waves := []Wave{
		{Composition: map[actor.Archetype]int{actor.Mote: 2}, SpawnWindow: 1.0, PressurePeak: 1.5},
		{Composition: map[actor.Archetype]int{actor.Mote: 2}, SpawnWindow: 1.0, PressurePeak: 1.5},
	}
	d := NewDirector(waves, rand.New(rand.NewSource(11)))
	d.Step(1.0, 0)             // clear wave 0
	d.Step(LullSeconds+0.5, 0) // partway into wave 1

	d.Reset()
	if d.Phase() != PhaseSpawning || d.WaveIndex() != 0 {
		t.Fatalf("after Reset: phase=%v waveIndex=%d, want PhaseSpawning wave 0", d.Phase(), d.WaveIndex())
	}
	if d.Cleared() {
		t.Fatal("Cleared() = true right after Reset, want false")
	}

	spawn, _ := d.Step(waves[0].SpawnWindow, 999)
	total := 0
	for _, n := range waves[0].Composition {
		total += n
	}
	if len(spawn) != total {
		t.Fatalf("len(spawn) after Reset + full window = %d, want %d (wave 0's full composition, fresh)", len(spawn), total)
	}
}

// --- schedule sanity ------------------------------------------------------

// TestDefaultScheduleReturnsFreshMapsEachCall confirms DefaultSchedule does
// not hand back shared, mutable composition maps -- two Directors built from
// two calls must not be able to affect each other by mutating a returned
// map.
func TestDefaultScheduleReturnsFreshMapsEachCall(t *testing.T) {
	a := DefaultSchedule()
	b := DefaultSchedule()
	a[0].Composition[actor.Mote] = 999
	if b[0].Composition[actor.Mote] == 999 {
		t.Fatal("DefaultSchedule() calls share a composition map: mutating one affected the other")
	}
}
