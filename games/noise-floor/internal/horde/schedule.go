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
			Composition:  map[actor.Archetype]int{actor.Mote: 5},
			SpawnWindow:  6,
			PressurePeak: 1.2,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 6, actor.Lancer: 2},
			SpawnWindow:  8,
			PressurePeak: 1.4,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 8, actor.Lancer: 3},
			SpawnWindow:  9,
			PressurePeak: 1.6,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 6, actor.Lancer: 2, actor.Aberrant: 2},
			SpawnWindow:  10,
			PressurePeak: 1.8,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 8, actor.Lancer: 3, actor.Aberrant: 2, actor.Dendrite: 1},
			SpawnWindow:  11,
			PressurePeak: 2.0,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 10, actor.Lancer: 4, actor.Aberrant: 3, actor.Overfit: 1},
			SpawnWindow:  12,
			PressurePeak: 2.2,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 8, actor.Lancer: 4, actor.Aberrant: 4, actor.Dendrite: 2, actor.Overfit: 2},
			SpawnWindow:  13,
			PressurePeak: 2.4,
		},
		{
			Composition:  map[actor.Archetype]int{actor.Mote: 12, actor.Lancer: 6, actor.Aberrant: 4, actor.Dendrite: 3, actor.Overfit: 3},
			SpawnWindow:  15,
			PressurePeak: 2.6,
		},
	}
}
