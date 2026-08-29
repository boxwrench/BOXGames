module boxwrench.dev/boxgames/shared

go 1.26.0

require kaijuengine.com v0.0.0

// The engine is a pinned local checkout fetched by scripts/bootstrap.sh, never
// a published module. See third_party/ENGINE_PIN.
replace kaijuengine.com => ../third_party/kaiju/src
