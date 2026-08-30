package actor

import (
	"fmt"
	"math"

	"kaijuengine.com/matrix"
)

// Archetype identifies one of the five horde types (spec 3.2).
type Archetype int

const (
	Mote Archetype = iota
	Dendrite
	Aberrant
	Lancer
	Overfit
)

// Stats are an archetype's fixed identity. Look them up with StatsFor.
//
// Health is a starting value only — nothing in this task subtracts from it.
// Damage and death are a later task; toughness is part of an archetype's
// identity regardless of when the mechanic that spends it lands.
//
// Lancer's Speed is its cruise speed. The charge speed is a steering-only
// concept and lives in steering.go as LancerChargeSpeed, because it is not
// part of the archetype's resting identity — it only applies mid-attack.
type Stats struct {
	Size   float32
	Speed  float32
	Health int
}

// archetypeStats holds the design values from the Task 7a brief, derived
// from spec §3.2's qualitative descriptions against a 4.5 u/s, 0.6-unit
// player. Every enemy is slower than the player except a charging Lancer.
var archetypeStats = map[Archetype]Stats{
	Mote:     {Size: 0.35, Speed: 3.2, Health: 1},
	Dendrite: {Size: 1.10, Speed: 1.1, Health: 12},
	Aberrant: {Size: 0.70, Speed: 1.8, Health: 4},
	Lancer:   {Size: 0.80, Speed: 1.4, Health: 3},
	Overfit:  {Size: 0.70, Speed: 2.0, Health: 5},
}

var archetypeNames = map[Archetype]string{
	Mote:     "Mote",
	Dendrite: "Dendrite",
	Aberrant: "Aberrant",
	Lancer:   "Lancer",
	Overfit:  "Overfit",
}

// StatsFor returns the stats for an archetype. It panics on an unknown
// archetype: the set is closed and a bad value is a programming error, not a
// runtime condition.
func StatsFor(a Archetype) Stats {
	s, ok := archetypeStats[a]
	if !ok {
		panic(fmt.Sprintf("actor: unknown archetype %d", a))
	}
	return s
}

// Name returns the archetype's display name, e.g. "Mote". Used in logs, tests
// and later in the UI.
func (a Archetype) Name() string {
	n, ok := archetypeNames[a]
	if !ok {
		panic(fmt.Sprintf("actor: unknown archetype %d", a))
	}
	return n
}

// SplitCount is how many Motes an Overfit leaves behind.
const SplitCount = 3

// SplitRadius is the distance from the parent's death position at which its
// children appear.
const SplitRadius float32 = 0.5

// SplitPositions returns where an Overfit's children appear when it dies:
// SplitCount points evenly spaced on a circle of radius r around origin,
// starting at angle 0. Death itself is Task 10; this is the placement rule.
func SplitPositions(origin matrix.Vec2, r float32) []matrix.Vec2 {
	positions := make([]matrix.Vec2, SplitCount)
	step := 2 * math.Pi / float64(SplitCount)
	for i := 0; i < SplitCount; i++ {
		angle := float32(float64(i) * step)
		offset := matrix.NewVec2(r*matrix.Cos(angle), r*matrix.Sin(angle))
		positions[i] = origin.Add(offset)
	}
	return positions
}
