# Snow Crown

A Roblox snowboarding game adapted from [SnowVR](https://github.com/boxwrench/SnowVR):
carve around a floating snow island, hold the crown, and send opponents into
the clouds. This is a new Luau/Roblox implementation, not a Three.js port.

## Current state

**Plateau 0 is prepared, not yet verified in Roblox Studio.** This folder
contains the workshop bootstrap scripts, the original design blueprint, a
portable local-model worker, and a Windows handoff. An offline-generated
`place/SnowCrownDev.template.rbxlx` is available, but has not been opened in
Studio. There is no playable Snow Crown game yet.

1. Read [the Windows setup](docs/WINDOWS_SETUP.md) to connect Studio and Codex.
2. Follow [the checkpoint log](docs/STATUS.md) and pass the Studio tests.
3. If you have a local model server, set up [the local worker](docs/LOCAL_WORKER.md).
4. After Plateau 0 passes, use the blueprint to create the movement toy.

The worker guide includes a bounded proposal bridge for a llama.cpp-compatible
server and an optional full local Codex agent workflow. Neither requires the
cloud supervisor to generate every routine change.

[The original blueprint](docs/DEVELOPMENT_BLUEPRINT.md) has the design, stages,
testing criteria, and source links. It originally suggested a separate GitHub
repository; this `BOXGames/snow-crown/` folder is the current project home.

## Portable layout

| Path | Purpose |
| --- | --- |
| `src/shared/` | Shared configuration, synced to Studio |
| `src/server/` | Server bootstrap and Studio-only smoke test |
| `src/client/` | Client bootstrap |
| `studio/` | Command-bar helper to create empty workshop folders |
| `place/` | Generated workshop place template; Studio validation pending |
| `third_party/roblox-test-files/` | MIT-licensed reference fixtures used to build the place |
| `docs/` | Blueprint, Windows setup, local-worker guide, status |
| `tools/`, `jobs/`, `tests/` | Local worker and its offline checks |

The repository is public. Local endpoint settings, access tokens, output, and
model paths stay on the machine. The local worker does not fall back to a
cloud model. Model-generated changes are proposals until explicitly applied.
