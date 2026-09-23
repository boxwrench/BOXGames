// Package juice provides the game-feel layer shared by BOXGames demos: hit
// flash, knockback, damage numbers, screen shake, hit-stop, and death bursts.
//
// This is deliberately shared rather than per-demo. It carries most of the
// perceived quality of an action game for almost no art cost, and it is the
// same code every time — only the tuning constants differ.
//
// Not yet implemented; see games/noise-floor/docs/specs for the requirements
// this package must satisfy.
package juice
