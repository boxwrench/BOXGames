# Snow Crown: current checkpoint

Last updated: 2026-11-03.

## Plateau 0 — connected workshop: NOT YET VERIFIED

The original design is in [DEVELOPMENT_BLUEPRINT.md](DEVELOPMENT_BLUEPRINT.md).
This project lives in `BOXGames/snow-crown/`, not the separate repository named
in the historical document. Start with [WINDOWS_SETUP.md](WINDOWS_SETUP.md).

| Check | Status | Evidence needed |
| --- | --- | --- |
| Workshop folders and script files prepared | Prepared | Source files and Studio command-bar helper in this folder |
| Local-worker bridge | Prepared | Nine Python checks passed against a mock server; a real model is not yet connected |
| Generated place template | PREPARED, NOT RUN | Five offline checks passed for XML, hierarchy, references, sources, and overwrite protection; Studio must open and test it |
| Studio place and MCP connection | NOT RUN | Connected Studio instance; inspect its tree and Output |
| Script Sync, all three roots | NOT RUN | Local edit appears in Studio and Studio edit appears locally; restore test change |
| Client and server bootstrap | NOT RUN | One ready line from each per playtest, no red errors |
| Studio smoke test | NOT RUN | Expected passed line in two separate playtests |
| CCL available/enabled | NOT RUN | Record the Studio version and actual toggle state |
| Place checkpoint | NOT RUN | Save the place and identify its location and Git/cloud version |

Do not tag `plateau-0-workshop-pass` or advance to Plateau 1 until the actual
Studio checks pass. Human evaluation is required for movement feel later.

## Later stages

1. Movement toy: tune carving and coast on one simple surface.
2. Knockback duel, then a complete crown match.
3. Introduce Raise, Flow, and Pull individually; playtest at each stage.

## Session log

- 2026-11-03: Added a Roblox-specific shortlist from the Waterscape visual
  resource catalog and a bounded text-only local-worker planning job. No assets
  were imported or tools installed; visual and Studio validation remain pending.
- 2026-11-02: Prepared the workshop and portable worker outside Studio. Nine
  local-worker checks passed against a mock server. Roblox execution, real-model
  connectivity, CCL, and human playtests are pending.
- 2026-11-02: Prepared an offline-generated place from licensed Roblox test
  fixtures and changed the client bootstrap to a `LocalScript` to avoid duplicate
  execution. Five place-generation checks and nine local-worker checks passed.
  Studio validation and the two-playtest gate remain open.
