# Snow Crown agent instructions

This project is a Roblox adaptation of SnowVR. Work inside `snow-crown/`; do
not alter other BOXGames projects. Read `README.md` and `docs/STATUS.md` first.
Consult only the needed section of `docs/DEVELOPMENT_BLUEPRINT.md`.

- The active milestone is Plateau 0: a connected workshop. Do not build arena,
  board, movement, camera, combat, rounds, currency, or later milestones until
  the recorded Studio gate passes. The user can explicitly change scope.
- Prefer small deterministic scripts and existing tools for repetitive work.
  When configured, use the local worker for bounded drafts or code changes;
  review its proposal and run relevant checks. Never silently send a local
  worker job to a hosted API as a fallback.
- Roblox Studio MCP, Script Sync, client/server boot, and subjective play feel
  require their actual environment. Never mark unrun checks as passed.
- Keep user-authored place assets and unrelated files intact; Script Sync only
  covers scripts and folders. Do not place secrets in this public repository.
- Multiplayer scoring, actions, and game state will be server validated.
  Keep the game playable and test each milestone before moving to the next.
