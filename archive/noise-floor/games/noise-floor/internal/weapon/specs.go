package weapon

// PrecisionEscalation is spec 3.1's slow, high-damage weapon: the
// framework's first instance. Tuning is expected after the first
// playtest.
//
// Against the existing archetype health values (Mote 1, Lancer 3, Aberrant
// 4, Overfit 5, Dendrite 12) that is a one-shot kill on Motes and Lancers,
// two on Aberrants and Overfits, four on Dendrites -- a readable spread.
// Range 9 sits just outside the arena's starting safe radius of 8.1, so the
// weapon can reach a target anywhere in the play area but not indefinitely
// into the ink.
var PrecisionEscalation = Spec{
	Name:     "Precision Escalation",
	Cooldown: 0.5,
	Damage:   3,
	Speed:    16,
	Range:    9,
}
