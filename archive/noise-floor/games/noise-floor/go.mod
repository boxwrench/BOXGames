module boxwrench.dev/boxgames/games/noisefloor

go 1.26.0

require (
	boxwrench.dev/boxgames/shared v0.0.0
	kaijuengine.com v0.0.0
)

// Monorepo-local modules. These replaces mirror go.work so each game also
// builds standalone, outside the workspace.
replace (
	boxwrench.dev/boxgames/shared => ../../shared
	kaijuengine.com => ../../third_party/kaiju/src
)
