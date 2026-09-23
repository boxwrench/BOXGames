package horde

import "boxwrench.dev/boxgames/games/noisefloor/internal/actor"

// DefaultSchedule is the eight-wave schedule (task-8b brief), sized for one
// weapon firing every 0.5s for 3 damage against the existing archetype
// health values (Mote 1, Lancer 3, Aberrant 4, Overfit 5, Dendrite 12).
// Tuning is expected after the first playtest; this is a starting point, not
// a final balance pass.
//
// Returns a fresh slice of fresh composition maps on every call, so two
// Directors built from two calls (or a test mutating one to probe isolation)
// can never affect each other.
func DefaultSchedule() []Wave {
	return []Wave{
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 14},
			SpawnWindow:  6,
			PressurePeak: 1.2,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 16, actor.Lancer: 4},
			SpawnWindow:  8,
			PressurePeak: 1.4,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 18, actor.Lancer: 6},
			SpawnWindow:  9,
			PressurePeak: 1.6,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 16, actor.Lancer: 5, actor.Aberrant: 4},
			SpawnWindow:  10,
			PressurePeak: 1.8,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 18, actor.Lancer: 6, actor.Aberrant: 5, actor.Dendrite: 2},
			SpawnWindow:  11,
			PressurePeak: 2.0,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 22, actor.Lancer: 8, actor.Aberrant: 6, actor.Overfit: 2},
			SpawnWindow:  12,
			PressurePeak: 2.2,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 18, actor.Lancer: 8, actor.Aberrant: 8, actor.Dendrite: 4, actor.Overfit: 3},
			SpawnWindow:  13,
			PressurePeak: 2.4,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 26, actor.Lancer: 12, actor.Aberrant: 8, actor.Dendrite: 5, actor.Overfit: 4},
			SpawnWindow:  15,
			PressurePeak: 2.6,
		},
	}
}
