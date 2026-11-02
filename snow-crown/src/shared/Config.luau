--!strict
-- Plateau 0: configuration only. Gameplay stays disabled until its gate.

local features = table.freeze({
	MovementPrototype = false,
	Combat = false,
	CrownRound = false,
	Abilities = false,
})

return table.freeze({
	SCHEMA_VERSION = 1,
	FEATURES = features,
})
