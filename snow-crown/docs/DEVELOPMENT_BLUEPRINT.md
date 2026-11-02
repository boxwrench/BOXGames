> **Repository note (November 2026):** This July research blueprint is retained
> as a design reference, with its repository location updated to match the
> user's decision to keep the project in `BOXGames/snow-crown/`.
> Follow [STATUS.md](STATUS.md) and [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for the
> current checkpoint and setup. The Studio connection and gameplay gates are
> not passed merely because the files are present.

# Snow Crown
## Research-backed Roblox development blueprint

**Document status:** Development baseline  
**Prepared:** July 29, 2026  
**Target:** A polished, round-based Roblox experience for 4–8 players  
**Core fantasy:** Snowboard around a floating snow island, seize the center crown, and knock rivals into the clouds with momentum and snow magic.

---

## 1. Executive decision

Snow Crown should be a **gameplay adaptation of [SnowVR](https://github.com/boxwrench/SnowVR)**, not a code port.

Carry forward:

- Controller-first movement.
- Snowboard carving and momentum.
- Snow trails, wind, haptics, and strong outdoor scale cues.
- A small set of spells that physically affect movement.
- The playful idea that the terrain is part of the combat.

Do not carry forward:

- Three.js, React, WebXR, GLSL, FBOs, or GPU particle code.
- Persistent deformation of the whole snow surface.
- Five overlapping elemental spells.
- A VR-first requirement.
- A course, slalom gates, or race structure for the first Roblox release.

The first Roblox experience is a compact competitive toy:

> Four to eight players continuously carve around a floating snow island. A single player can hold the center crown and earn points, but scoring pauses when an opponent contests the hill. Players use speed, a short-range Bash, and three snow spells to knock rivals off the island. Fallen players return quickly. The first player to the score target, or the leader when time expires, wins.

The most important development rule is:

> **Do not add the next layer until the current build is already enjoyable and has passed its written evaluation gate.**

Every development plateau in this plan produces a playable experience, not merely a partially completed system.

---

## 2. Current Roblox findings that shape the plan

### 2.1 Language and AI workflow

Roblox gameplay is written in **Luau**, a Lua-derived language with gradual typing. Its small syntax and type inference make it well suited to AI-assisted iteration. [Luau](https://luau.org/)

Roblox Studio now includes:

- An AI Assistant that can modify scripts and the place data model, insert assets, and generate materials, meshes, and procedural models. [Assistant for Studio](https://create.roblox.com/docs/assistant/guide)
- A built-in MCP server that can connect to Codex CLI, inspect the data model, edit scripts, execute Luau, start playtests, read console output, capture the viewport, simulate input, and launch specialized playtest behavior. [Roblox Studio MCP server](https://create.roblox.com/docs/studio/mcp)
- Script Sync for synchronizing Luau scripts to local files and Git. Script Sync only synchronizes scripts and folders, not the complete 3D place. [Script Sync](https://create.roblox.com/docs/scripting/sync)

This means AI can perform most of the implementation and objective testing. It cannot honestly decide whether carving feels satisfying or whether a knock-off feels fair. Those remain human evaluation gates.

### 2.2 Movement

The first controller should use Roblox’s opt-in **Character Controller Library**, or CCL. CCL exposes movement speed, turning, acceleration, deceleration, ground friction, air control, and momentum behavior without requiring a completely custom character implementation. [Character Controller Library](https://create.roblox.com/docs/characters/character-controller-library/controllers)

If CCL cannot achieve a satisfactory snowboard feel after the limited tuning cycle defined in Plateau 1, replace it with a custom mover using modern constraints such as `LinearVelocity` and `AlignOrientation`. Do not keep tuning CCL indefinitely and do not add combat to movement that has failed its gate. Roblox recommends modern mover constraints for force- and torque-driven assemblies. [Mover constraints](https://create.roblox.com/docs/physics/mover-constraints)

### 2.3 Knockback and fairness

Player characters should not rely on uncontrolled physical body collisions for combat. Character-to-character collision should be disabled through collision groups. Roblox supports collision filtering specifically for this purpose. [Collision filtering](https://create.roblox.com/docs/workspace/collisions)

Instead:

- The client requests Bash or a spell.
- The server validates the action, cooldown, direction, state, range, and targets.
- The server computes knockback.
- The target’s root assembly receives `ApplyImpulse()`.
- Impulse is multiplied by assembly mass so different avatars receive a similar change in velocity.

Roblox provides `ApplyImpulse()` for instantaneous changes in motion. [BasePart impulses](https://create.roblox.com/docs/reference/engine/classes/BasePart#ApplyImpulse)

Combat must not depend on client-reported hits or `Touched` events. Roblox documents that clients with network ownership can manipulate their assemblies, movement, collision, velocity, and even whether touch events fire. [Network ownership and movement security](https://create.roblox.com/docs/scripting/security/network-ownership)

### 2.4 Server authority

Roblox’s current security guidance is direct: every client value must be validated by the server, and client-triggered behavior must be rate limited on the server. [Securing the client-server boundary](https://create.roblox.com/docs/scripting/security/client-server-boundary)

For Snow Crown:

- The client owns immediate input presentation and local VFX.
- The server owns the round state, scoring, cooldown truth, valid targets, hit results, impulses, fall detection, respawns, and winner.
- A client never supplies another player as the authoritative target.
- A client never supplies knockback magnitude.
- A client never grants itself points or declares a knockout.

Roblox’s full server-authoritative physics system is not a dependency for this plan. Current Roblox documentation still describes server authority as beta/emerging functionality. The initial game therefore uses normal responsive client character ownership plus conservative server validation.

### 2.5 Testing

Roblox Studio can simulate a server and as many as eight clients, exactly matching Snow Crown’s intended server size. It also supports controller, device, and network condition emulation. [Studio testing modes](https://create.roblox.com/docs/studio/testing-modes)

`StudioTestService` can run scripted multiplayer scenarios, add players, pass scenario arguments, and return a success or failure result. [StudioTestService](https://create.roblox.com/docs/reference/engine/classes/StudioTestService)

Performance should be measured as frame time, not only average FPS. Roblox’s MicroProfiler identifies rendering, physics, scripting, and memory-related spikes and can now be analyzed through Assistant or Studio MCP. [MicroProfiler](https://create.roblox.com/docs/performance-optimization/microprofiler)

---

## 3. Final MVP experience specification

### 3.1 Working title

**Snow Crown**

The title is descriptive, easy to remember, and matches the visible center objective. It can be changed later without changing the architecture.

### 3.2 Match structure

| Setting | Initial value |
|---|---:|
| Intended players | 4–8 |
| Minimum players in public build | 2 |
| Intermission | 12 seconds |
| Countdown | 3 seconds |
| Round duration | 150 seconds |
| Score target | 45 Crown Points |
| Respawn delay after falling | 2.5 seconds |
| Spawn protection | 2 seconds or until the player attacks |
| Hill radius | 18 studs |
| Knockout credit window | 6 seconds after the last valid hit |
| Hill scoring | 1 point per second |
| Knock-off bonus | 3 points |
| Results screen | 8 seconds |

### 3.3 Crown rules

1. The hill begins unowned.
2. A player alone inside the hill for one continuous second becomes the Crown holder.
3. The Crown holder earns one point per second while remaining inside the hill.
4. If another active player enters the hill, scoring pauses and the hill is **contested**.
5. The current holder keeps the Crown visually while contested but earns no points.
6. The Crown becomes unowned if the holder leaves the hill, falls, resets, or disconnects.
7. The first player to 45 points wins immediately.
8. If time expires, the player with the highest score wins.
9. A tie enters 30-second sudden death. The next uncontested hill point or credited knock-off wins.

This creates a clear social story: one visible ruler, several attackers, and constant reasons to shove people out of the center.

### 3.4 Arena baseline

| Element | Initial specification |
|---|---|
| Island center | `(0, 100, 0)` |
| Playable island diameter | 140 studs |
| Center hill diameter | 36 studs |
| Center hill height | 6 studs above the outer arena |
| Spawn ring radius | 52 studs |
| Number of spawn positions | 8 |
| Fall threshold | 40 studs below the arena surface |
| Initial geometry | Anchored primitive graybox generated by code |
| Final geometry | Low-poly floating rock/ice island with a smooth snow top |

The center should be readable from every spawn. The edge should be dangerous without hiding where safety ends. There should be no railings.

### 3.5 Movement target

The board is initially a cosmetic object attached to the character while CCL controls the root assembly.

Target behavior:

- Left stick or WASD selects the desired travel heading.
- The rider accelerates rather than instantly reaching full speed.
- Releasing input creates a short coast, not an immediate stop.
- Turning becomes slightly wider at high speed.
- Air control is weaker than ground control.
- There is no ordinary jump in MVP.
- A short Dash/Bash creates the high-momentum collision fantasy.

| Movement characteristic | Target |
|---|---:|
| Normal top speed | 28 studs/second |
| Time to 90% top speed | 0.6–0.8 seconds |
| Coast to near stop | 0.8–1.2 seconds |
| 180-degree turn at medium speed | 1.0–1.4 seconds |
| Air control | About 30% of ground authority |
| Dash peak speed | About 42 studs/second |
| Dash duration | 0.30–0.40 seconds |
| Dash cooldown | 1.25 seconds |

These are experience targets, not sacred implementation constants. The plateau tests determine whether they remain.

### 3.6 Combat actions

#### Basic Bash

- Available to every player.
- Short cone in front of the rider.
- Server chooses valid targets from authoritative positions.
- Stronger when the attacker is moving quickly, within a capped range.
- A small upward component makes successful hits readable.

Initial tuning:

| Setting | Value |
|---|---:|
| Range | 8 studs |
| Half-angle | 35 degrees |
| Cooldown | 1.25 seconds |
| Horizontal velocity change | 22–30 studs/second |
| Vertical velocity change | 5 studs/second |
| Maximum targets | 2 |

The implementation should compute:

```text
impulse = desired velocity change × target assembly mass
```

The client never specifies the impulse.

#### Raise

**Role:** Vertical disruption and temporary terrain.

- Cast on valid snow within 28 studs.
- Telegraph for 0.25 seconds.
- A rounded snow ridge rises.
- Riders over the ridge receive an upward and outward impulse.
- The ridge becomes a short-lived ramp after erupting.
- Maximum one active Raise per player.

Initial values:

| Setting | Value |
|---|---:|
| Cooldown | 6 seconds |
| Active ridge lifetime | 4 seconds |
| Footprint | About 12 × 6 studs |
| Maximum cast distance | 28 studs |
| Eruption velocity change | 12 horizontal, 13 vertical |

#### Flow

**Role:** Mobility, approach angle, and dangerous ramming lanes.

- Creates a directional snow current on the surface.
- Any rider may use it, including opponents.
- Adds velocity toward the strip’s direction with a hard cap.
- Does not directly deal knockback.
- Maximum one active Flow per player.

Initial values:

| Setting | Value |
|---|---:|
| Cooldown | 6 seconds |
| Lifetime | 4 seconds |
| Zone size | About 28 × 8 studs |
| Added velocity | Up to 16 studs/second |
| Maximum resulting speed | 44 studs/second |

#### Pull

**Role:** Positioning, contest breaking, and setting up Bash or Raise.

- Telegraphs a circular vortex.
- Pulls active riders toward its center over 1.2 seconds.
- Adds a small tangential component for readable swirling.
- Does not produce a large final explosion in MVP.
- Maximum one active Pull per player.

Initial values:

| Setting | Value |
|---|---:|
| Cooldown | 8 seconds |
| Telegraph | 0.35 seconds |
| Pull duration | 1.2 seconds |
| Radius | 18 studs |
| Total inward velocity change | About 15 studs/second |

### 3.7 Controls

Use a single action abstraction so gameplay code does not care which device generated the input.

For the first beta, implement that abstraction with `ContextActionService` behind `InputController`. It is sufficient for four actions, supports keyboard/gamepad bindings, and can create touch buttons. Do not make the baseline depend on the beta Input Action Manager. [ContextActionService](https://create.roblox.com/docs/reference/engine/classes/ContextActionService)

| Action | Keyboard/mouse | Gamepad | Touch |
|---|---|---|---|
| Move | WASD | Left stick | Left virtual stick |
| Aim | Mouse or travel heading | Right stick or travel heading | Drag aim area or travel heading |
| Bash/Dash | Space | Right trigger | Bash button |
| Raise | 1 | X | Raise button |
| Flow | 2 | Y | Flow button |
| Pull | 3 | B | Pull button |

Desktop and gamepad are required for the first internal alpha. Touch becomes required before the public beta. VR remains a later enhancement.

---

## 4. Technical architecture

### 4.1 Data model

```text
ReplicatedStorage
└── SnowCrown
    ├── Shared
    │   ├── Config
    │   ├── Types
    │   ├── StateMachine
    │   ├── SpatialMath
    │   ├── AbilityDefinitions
    │   └── NetSchema
    └── Remotes
        ├── RequestAction
        ├── RoundSnapshot
        ├── CombatEvent
        └── AbilityEvent

ServerScriptService
└── SnowCrownServer
    ├── Bootstrap.server
    ├── ArenaService
    ├── CharacterService
    ├── CombatService
    ├── AbilityService
    ├── RoundService
    ├── ValidationService
    ├── AnalyticsService
    └── CleanupService

StarterPlayer
└── StarterPlayerScripts
    └── SnowCrownClient
        ├── Bootstrap.client
        ├── InputController
        ├── MovementController
        ├── CameraController
        ├── HUDController
        ├── CombatVFXController
        └── AudioController

ServerStorage
└── SnowCrownAssets
    ├── Maps
    ├── Boards
    └── EffectTemplates

Workspace
└── SnowCrownRuntime
    ├── Arena
    ├── SpawnPoints
    ├── ActiveAbilities
    └── CosmeticAnchors
```

### 4.2 Local repository

```text
snow-crown/
├── README.md
├── .gitignore
├── docs/
│   ├── DEVELOPMENT_BLUEPRINT.md
│   ├── PLATEAU_LOG.md
│   └── PLAYTEST_FORM.md
├── src/
│   ├── shared/
│   ├── server/
│   └── client/
└── tests/
    ├── unit/
    └── scenarios/
```

Use Script Sync on the three script roots:

- `ReplicatedStorage/SnowCrown/Shared` ↔ `src/shared`
- `ServerScriptService/SnowCrownServer` ↔ `src/server`
- `StarterPlayerScripts/SnowCrownClient` ↔ `src/client`

Script Sync does not preserve general place objects, and it ignores script attributes and tags. Do not store important configuration as attributes on synced scripts. Keep important values in typed configuration modules.

### 4.3 Remote request shape

Use one narrow action request:

```lua
type ActionRequest = {
    action: "Bash" | "Raise" | "Flow" | "Pull",
    aimDirection: Vector3,
    aimPosition: Vector3?,
    sequence: number,
}
```

Server checks:

1. Payload is a table with exactly expected fields.
2. Action is one of the allowed identifiers.
3. Vectors contain finite numbers.
4. Aim direction is near unit length and is normalized again by the server.
5. Player is active, spawned, and not protected.
6. Round is active.
7. Action cooldown has elapsed.
8. Per-player request rate has not been exceeded.
9. Requested aim location is within allowed range.
10. A server raycast finds valid arena snow when the action requires ground.
11. Server chooses affected players and computes all impulses.

Do not allow:

- A client-supplied target player.
- A client-supplied damage, force, cooldown, score, or radius.
- Arbitrary instance paths.
- Arbitrary assets.
- Arbitrary server-side object creation.

### 4.4 Network ownership policy

- Keep normal client ownership of the player character for responsive movement.
- Keep the arena anchored and server-owned.
- Keep temporary collidable Raise ridges anchored and server-owned.
- Keep most VFX client-only.
- Make the server authoritative over scoring and valid combat outcomes.
- Validate sustained impossible movement with tolerant, reversible heuristics rather than instant permanent punishment.
- Never use a single-frame speed spike as proof of cheating because legitimate knockback and network correction can create spikes.

---

## 5. The plateau method

### 5.1 Plateau map

The estimates below are iteration counts, not calendar promises. A tuning pass means implementation, automated evaluation, human play, written result, and one-variable revision.

| Plateau | Playable experience | Intended test group | Expected passes |
|---|---|---:|---:|
| 0 | Connected empty workshop | Developer + AI | 1–2 |
| 1 | Solo movement toy | 1–3 humans | 3–6 |
| 2 | Knockback duel | 2 humans | 3–5 |
| 3 | Complete Crown match | 2–4 humans | 2–4 |
| 4A | Raise-only combat | 2–4 humans | 2–3 |
| 4B | Raise + Flow | 2–4 humans | 2–3 |
| 4C | Complete three-spell combat | 3–4 humans | 2–4 |
| 5 | Four-player private alpha | 4 humans per session | At least 3 sessions |
| 6 | Eight-player resilience build | 8 simulated, then 8 humans | 2–4 |
| 7 | Finished floating-island atmosphere | 4–8 humans | 3–6 |
| 8 | Published closed alpha | 12+ unique testers | At least 3 sessions |

### 5.2 Rules

Each plateau has five required artifacts:

1. A playable build.
2. Automated checks.
3. A human play card.
4. A written result in `docs/PLATEAU_LOG.md`.
5. A tagged Git commit if the plateau passes.

Status:

- **GREEN:** All required gates pass. Tag the commit and begin the next plateau.
- **YELLOW:** The build functions but one or more required gates fail. Make the smallest focused tuning change and repeat.
- **RED:** The architecture or experience assumption failed. Revert to the previous green tag and take the documented fallback branch.

AI may report objective results. AI must not award GREEN to subjective feel tests.

### 5.3 Change discipline

- Change one tuning family per experiment.
- Do not change speed, turning, knockback, camera, and arena size simultaneously.
- Record before/after values.
- Keep all tuning constants centralized.
- Run the same evaluation after every change.
- Require two consecutive automated passes before advancing.
- Never “temporarily” add later features to make a weak plateau seem fun.

### 5.4 Universal AI implementation prompt

Use this prefix for every implementation request:

```text
You are working in the active Roblox Studio place for Snow Crown through the
Studio MCP server. First inspect the current DataModel, all SnowCrown scripts,
the current plateau log, Studio state, and Output. Work only on the named
plateau. Do not implement features assigned to a later plateau.

Use strict typed Luau where practical. Keep tuning values in Shared/Config.
Do not add external dependencies. Preserve manually authored objects and
unrelated changes. Do not trust client-reported targets, impulses, cooldowns,
scores, or round state. The server must validate every gameplay-changing
request and apply server-side rate limits.

Before editing, summarize the current relevant architecture and the smallest
change set. Then implement it, run the available automated tests, start a
playtest, inspect console output, and report:
1. scripts and objects changed;
2. automated tests and exact results;
3. console errors or warnings;
4. criteria that still require a human feel test;
5. blockers that prevent this plateau from passing.

Do not declare subjective movement, fairness, clarity, or fun to have passed.
Do not begin the next plateau.
```

### 5.5 Universal AI evaluation prompt

```text
Evaluate the named Snow Crown plateau without adding later features.
Inspect the current scripts, DataModel, tuning configuration, Output, and
available scenario tests. Run the plateau's automated checks at least twice.
Use Studio play mode or StudioTestService where appropriate. Capture any
relevant viewport state and console errors.

Return a table with every written exit criterion marked PASS, FAIL, BLOCKED,
or HUMAN TEST REQUIRED. Include measured values and evidence. Do not infer a
subjective pass from code inspection. If anything required fails, identify the
smallest likely cause and recommend one focused next experiment. Do not edit
until I approve the experiment.
```

---

## 6. Plateau 0: Connected workshop

### Experience at this plateau

A blank but correctly structured Roblox place that can be inspected, edited, run, and tested by AI without losing source history.

### Build

1. Create a new Baseplate experience named `Snow Crown Dev`.
2. Set maximum players to 8.
3. Use the existing `BOXGames/snow-crown/` folder as the project home; do not put the Roblox rewrite inside the SnowVR repository.
4. Enable CCL through **Avatar → Avatar Settings → Movement → Abilities → Character Controller Library**.
5. Open Assistant and select **… → Manage MCP Servers → Enable Studio as MCP server**, then quick-connect Codex CLI.
6. Create the DataModel folders from Section 4.
7. Create local `src/shared`, `src/server`, and `src/client` directories.
8. In Explorer, right-click each script root, select **Sync to…**, and map it to the corresponding local source directory.
9. Initialize Git with `main`.
10. Add server and client bootstrap scripts that log one concise startup message each.
11. Add a shared `Config` module with `SCHEMA_VERSION` and feature flags.
12. Add a Studio-only smoke test that verifies required folders and modules exist.
13. Create `PLATEAU_LOG.md`.

### Non-goals

- No island.
- No board.
- No custom camera.
- No round.
- No combat.
- No DataStore.
- No monetization.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 0 only: create the Snow Crown project skeleton described in
DEVELOPMENT_BLUEPRINT.md. Create the required DataModel folders, bootstrap
scripts, strict shared Config module, feature flags, and a Studio-only smoke
test. Do not create gameplay, arena art, movement, UI, or combat. Verify client
and server bootstrap separately and confirm Script Sync target folders contain
only supported script/folder instances.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 0. Confirm that the MCP connection can inspect the tree, read
and edit one harmless test value, execute Luau, start and stop a playtest, read
Output, and capture the viewport. Confirm both bootstraps load exactly once,
all expected folders and modules exist, there are no infinite yields, and
there are no red Output errors. Confirm local Script Sync files update from a
harmless Studio edit and Studio updates from a harmless local file edit.
Restore the test value before reporting.
```

### Exit gate

- MCP inspection, edit, execution, playtest, Output, and screenshot operations work.
- Script Sync succeeds in both directions.
- Client and server boot without errors.
- The smoke test passes twice.
- Git has a clean commit.

**Tag:** `plateau-0-workshop-pass`

---

## 7. Plateau 1: The movement toy

### Experience at this plateau

One player glides around a flat circular snow platform. There is nothing to do except move, turn, coast, and approach the edge. It should already be pleasant enough to play for five minutes.

### Build

1. Generate a 140-stud graybox snow disc at `(0, 100, 0)`.
2. Add eight visible spawn markers but use only one.
3. Add a fall plane and immediate local reset for testing.
4. Add a simple cosmetic snowboard.
5. Configure CCL for acceleration, deceleration, turning, friction, and reduced air control.
6. Implement keyboard and gamepad movement through a device-independent action layer.
7. Disable standard jumping.
8. Use the default Roblox camera initially with constrained zoom.
9. Add a small development HUD showing speed, grounded state, and current tuning profile.
10. Add an automated movement telemetry recorder.

### Tuning sequence

Do not tune everything together.

1. **Acceleration:** Reach 90% speed in 0.6–0.8 seconds.
2. **Coast:** Stop in 0.8–1.2 seconds after releasing input.
3. **Turning:** Complete a medium-speed 180-degree turn in 1.0–1.4 seconds.
4. **Edge control:** A deliberate last-second turn should save the rider, but careless high-speed travel should still fall.
5. **Air control:** Reduce to approximately 30% of grounded control.
6. **Camera:** Change only after movement targets pass.

Maximum of three full CCL tuning cycles. A full cycle means the objective telemetry and human test were both repeated.

### CCL fallback decision

If, after three documented cycles:

- Average movement feel is below 3.5/5, or
- The controller cannot produce both predictable turning and satisfying coast, or
- External forces cannot coexist with movement without snapping or cancellation,

then mark Plateau 1 RED and prototype a custom board root using `LinearVelocity`, `AlignOrientation`, downward raycasts, and explicit air/ground modes. Do not continue to combat until the replacement passes the same gate.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 1 only: implement the single-player Movement Toy using the Character
Controller Library. Generate one 140-stud circular graybox snow platform at
Y=100, add a cosmetic board, disable jump, and implement camera-relative
keyboard/gamepad travel with acceleration, coast, high-speed turning limits,
and reduced air authority. Add a developer HUD for speed and grounded state.
Expose all tuning in Config. Add telemetry for time-to-speed, stopping time,
turn time, unexpected falls, and maximum velocity. Do not add Bash, spells,
round state, scores, opponents, or polished art.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 1. Run repeatable scripted input to measure acceleration to
90% top speed, coast-to-stop time, a medium-speed 180-degree turn, maximum
speed, and five minutes of movement stability. Confirm jump is disabled,
velocity remains finite, respawn works, and no constraint or controller errors
appear. Produce a manual five-minute feel test for keyboard and gamepad. Do not
mark movement feel as passed without my ratings.
```

### Automated exit criteria

- Top speed remains within 10% of target.
- Acceleration, coast, and turn times fall inside their target bands.
- No NaN, infinite, or extreme velocities.
- No spontaneous fall or controller failure during a five-minute center-area stability run.
- Ten consecutive edge approaches respawn correctly after actual falls.
- Keyboard and gamepad actions produce equivalent normalized inputs.
- No red Output errors in two consecutive runs.

### Human test card

Play for five minutes without combat.

Rate 1–5:

1. I understood how to move within 10 seconds.
2. The board felt like it had momentum.
3. Turning was predictable.
4. I could intentionally skim the edge.
5. Simply moving was enjoyable.

Required:

- Average at least 4.0 for predictability.
- Average at least 3.5 for snowboard/momentum feel.
- No tester calls the movement “slippery in a random way.”

**Tag:** `plateau-1-movement-pass`

---

## 8. Plateau 2: The knockback duel

### Experience at this plateau

Two players can glide, Bash, knock one another off, receive clear credit, and return quickly. There is no hill scoring yet. The duel itself must be understandable and repeatable.

### Build

1. Disable character-to-character collision.
2. Add server-authoritative Bash.
3. Add a visible short telegraph and impact snow burst.
4. Add mass-scaled impulse.
5. Add a six-second last-attacker record.
6. Detect falling by root position rather than `Touched`.
7. Award test-only knockout counters.
8. Respawn at the opposite side of the island after 2.5 seconds.
9. Add two-second spawn protection, canceled by attacking.
10. Add remote validation and rate limiting from the beginning.

### Hit model

The client sends:

- `action = "Bash"`
- normalized aim direction
- increasing sequence number

The server:

1. Checks player and round/test state.
2. Checks cooldown and request rate.
3. Uses the server-observed attacker root as origin.
4. Queries nearby active characters.
5. Filters by range and cone angle.
6. Optionally checks an unobstructed ray.
7. Computes momentum contribution and caps it.
8. Applies impulse to valid target roots.
9. records attacker, time, and action for knockout attribution.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 2 only: add a two-player Knockback Duel to the passing movement build.
Disable physical character-character collision. Implement Bash as a
server-validated cone action with cooldown and per-player rate limiting.
Clients may send only action, aim direction, and sequence. The server must
select targets and compute a mass-scaled ApplyImpulse with capped movement
contribution. Add impact VFX, spawn protection, Y-position fall detection,
six-second attacker attribution, test-only knockout counters, and rapid
respawn. Do not add the hill, scores, round state, or spells.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 2 in a two-client Studio test. Verify valid front-cone Bash
hits at close range, rejection behind the attacker, rejection beyond range,
cooldown enforcement, request rate limiting, spawn protection, self-fall
handling, six-second knockout attribution, and no attribution after expiry.
Test stationary and high-speed attackers. Repeat under 100 ms and 200 ms
simulated latency with jitter. Confirm the client cannot choose the target or
impulse. Produce a human fairness test and do not infer fairness from code.
```

### Automated exit criteria

- 20/20 valid close front-cone hits register under normal local conditions.
- 0/20 targets behind the attacker are hit.
- 0/20 targets beyond the configured range are hit.
- Server cooldown rejects premature requests.
- Rate limiting rejects remote spam without affecting other players.
- Knockback velocity remains inside its configured cap.
- Knockout credit works inside six seconds and expires afterward.
- Self-falls do not award another player.
- Spawn-protected players cannot be hit and cannot score a hit.
- No lingering attacker record remains after respawn.
- Under 200 ms simulated latency, hits may feel delayed but do not duplicate.

### Human duel test

Play ten knock-off exchanges with another person.

Required:

- At least 8/10 successful hits look connected to the apparent Bash.
- At least 8/10 knockbacks feel directionally understandable.
- Neither player reports frequent unexplained launches.
- Both players can intentionally knock the other off after learning the controls.
- Average fairness rating is at least 3.5/5.

**Tag:** `plateau-2-duel-pass`

---

## 9. Plateau 3: The complete king-of-the-hill loop

### Experience at this plateau

Two to four players can join a complete match: intermission, countdown, Crown capture, contested scoring, knock-off bonuses, winner, results, reset, and another match.

### Build

1. Implement the server state machine:
   - `Waiting`
   - `Intermission`
   - `Countdown`
   - `Active`
   - `SuddenDeath`
   - `Results`
   - `Reset`
2. Create the raised center hill and visible capture boundary.
3. Add Crown owner, contested state, score, timer, and winner HUD.
4. Add round-safe player join, leave, death, and respawn handling.
5. Add 45-point win target and 150-second timeout.
6. Add sudden death for ties.
7. Reset all transient state and runtime objects between rounds.
8. Add a Studio scenario test that cycles rounds automatically.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 3 only: build the full server-authoritative Snow Crown round loop on
top of the passing duel. Add Waiting, Intermission, Countdown, Active,
SuddenDeath, Results, and Reset states. Add the 18-stud center hill, one-second
uncontested capture, paused scoring while contested, Crown loss on exit/fall/
disconnect, one point per second, three points per credited knock-off, first to
45, 150-second timeout, tie sudden death, rapid respawn, and an 8-second
results phase. Create a minimal readable HUD. Add join/leave/reset scenario
tests. Do not add spells or polished art.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 3 with scripted two- and four-client scenarios. Cycle at
least 20 shortened test rounds through every state. Verify uncontested capture,
contested pause, owner exit, owner fall, owner disconnect, score target win,
timeout win, tie sudden death, credited knock-off points, self-fall behavior,
mid-round join, mid-round leave, respawn, and complete cleanup. Compare the
round snapshot seen by all clients. Report any state disagreement or runtime
object growth.
```

### Automated exit criteria

- Twenty shortened rounds complete without a stuck state.
- All clients agree on round state, timer within one second, Crown owner, scores, and winner.
- Contested scoring pauses within one server tick.
- Owner loss works on exit, fall, reset, and disconnect.
- Tie correctly enters sudden death.
- Joining with more than 30 seconds remaining enters after spawn protection.
- Joining with 30 seconds or less remaining waits for the next round.
- Runtime object count returns to baseline after every reset.
- No score carries into the next round.
- No red Output errors in two consecutive four-client runs.

### Human loop test

Run three complete matches with at least three people.

Required:

- Every tester understands the objective within 30 seconds without verbal explanation.
- No player waits more than five seconds after falling.
- At least one tester changes behavior because the hill is contested.
- Match length feels neither trivial nor exhausting.
- At least 75% of testers request or accept an immediate rematch.

**Tag:** `plateau-3-core-loop-pass`

---

## 10. Plateau 4A: Raise

### Experience at this plateau

The first spell creates a readable temporary snow ridge that can launch, block, save, or betray a player. The game remains fun if Raise is the only spell.

### Build

1. Add server-validated ground targeting.
2. Use a raycast to confirm arena snow and range.
3. Telegraph the footprint.
4. Apply eruption impulses.
5. Create one anchored collidable ridge per caster.
6. Make collision activate only after eruption begins.
7. Remove collision before fade-out.
8. Guarantee cleanup on recast, fall, disconnect, round end, and reset.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 4A only: implement Raise as the sole spell. Validate a ground aim point
within 28 studs using server raycasting against the arena. Telegraph for 0.25
seconds, erupt with server-computed upward/outward impulse, and leave one
temporary anchored snow ridge that functions as a short ramp. Maximum one
active ridge per player. Add six-second cooldown, cleanup for every lifecycle
path, simple VFX, HUD cooldown feedback, and ability-specific telemetry. Do not
add Flow or Pull.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 4A. Test valid arena casts, off-island casts, casts beyond
range, malformed vectors, cooldown spam, recast cleanup, disconnect cleanup,
round reset cleanup, players standing inside the eruption, riders crossing the
finished ridge, and simultaneous casts from eight players. Verify no player
becomes trapped inside a newly collidable ridge. Produce a human clarity and
usefulness test.
```

### Exit criteria

- Invalid ground casts create no server object.
- Maximum one ridge exists per player.
- Eight simultaneous ridges remain bounded and clean up.
- No ridge survives round reset.
- No player remains trapped or permanently launched.
- Testers identify Raise as “launch/ramp/vertical disruption.”
- Testers successfully use it at least once for mobility and once against another player.
- Raise does not account for more than 60% of knock-offs in a three-match sample.

**Tag:** `plateau-4a-raise-pass`

---

## 11. Plateau 4B: Flow

### Experience at this plateau

Flow creates obvious high-speed routes. Players can use it to attack, escape, recover, or accidentally help an opponent.

### Build

1. Add directional ground strip targeting.
2. Add capped server-side velocity influence.
3. Make the zone affect all active riders.
4. Distinguish friendly and enemy use only in telemetry, not mechanics.
5. Add a low-cost client visual ribbon and surface streaks.
6. Cap at one Flow zone per player.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 4B only: add Flow to the passing Raise build. Flow creates one
directional 28-by-8-stud surface zone per caster for four seconds. It affects
all active riders, adds capped forward velocity rather than teleporting or
setting arbitrary velocity, and can be used by opponents. Use server-validated
placement, a six-second cooldown, deterministic zone state, lightweight client
VFX, complete cleanup, and telemetry for casts, entries, speed gained, Bash
combos, and knock-offs following Flow. Do not add Pull.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 4B. Verify valid and invalid placement, direction validation,
cooldown and rate limiting, maximum speed cap, repeated entry, overlapping
Flow zones, opponent use, interaction with Bash, fall attribution, round reset,
disconnect cleanup, and eight simultaneous zones. Confirm the zone never
creates NaN or runaway velocity. Produce a blind human differentiation test
between Raise and Flow.
```

### Exit criteria

- Speed never exceeds the configured hard cap.
- Overlapping zones do not multiply without limit.
- Opponents can visibly and mechanically use the zone.
- All zones clean up on every lifecycle path.
- Testers identify Flow as “speed/route/ramming.”
- Testers discover at least two uses without being explicitly told.
- Both Raise and Flow are used in every match of a three-match test.

**Tag:** `plateau-4b-flow-pass`

---

## 12. Plateau 4C: Pull

### Experience at this plateau

Pull groups or repositions riders without replacing Bash, Raise, or Flow. It creates setups, contests, rescues, and chaotic center-hill moments.

### Build

1. Add a clear circular telegraph.
2. Add a 1.2-second server-controlled inward influence.
3. Add a small capped tangential component.
4. Respect spawn protection.
5. Cap at one Pull zone per player.
6. Prevent stacked Pulls from generating unbounded velocity.
7. Add VFX and audio distinct from Raise and Flow.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 4C only: add Pull as the third and final spell. Create a
server-validated 18-stud-radius vortex with a 0.35-second telegraph and
1.2-second pull. Apply bounded inward and small tangential velocity influence
to active unprotected riders. Maximum one active Pull per player. Define safe
stacking behavior, full lifecycle cleanup, eight-player object caps, distinct
VFX/audio, HUD cooldown feedback, and telemetry for casts, affected players,
combos, and outcomes. Do not add another spell.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 4C. Verify telegraph timing, radius, cooldown, spawn
protection, malformed request rejection, stacked Pulls, edge placement,
simultaneous eight-player casting, Raise and Flow interaction, round reset,
disconnect cleanup, and bounded velocity. Run a blind three-spell human test.
Report whether testers can identify each spell's job and whether any spell
appears dominant, redundant, or ignored.
```

### Exit criteria

- Pull never affects protected, inactive, or out-of-range players.
- Stacked Pulls remain inside the global velocity cap.
- Eight simultaneous Pulls do not leave runtime objects or errors.
- At least 75% of testers describe:
  - Raise as vertical disruption/ramp.
  - Flow as speed/route control.
  - Pull as grouping/repositioning.
- In a five-match sample, every spell receives meaningful use.
- No spell produces more than 60% of credited spell-assisted knock-offs.
- No tester describes two spells as “basically the same.”

**Tag:** `plateau-4c-three-spells-pass`

---

## 13. Plateau 5: Four-player private alpha

### Experience at this plateau

The minimum intended social game works with real people. This plateau is about fun, legibility, pacing, and fairness rather than adding content.

### Build

Only add what is necessary to test:

- A compact lobby or safe waiting platform.
- A concise control card.
- Player-colored Crown and combat feedback.
- A post-match scoreboard.
- A development metrics panel or exportable summary.

Do not add cosmetics, shops, currencies, quests, progression, or multiple maps.

### Playtest protocol

Run at least three sessions with four players. Each session contains at least five matches.

Test cohorts:

1. People who were told the rules.
2. People shown only the control card.
3. At least one person unfamiliar with SnowVR or the development plan.

Record:

- Time to first movement.
- Time to first Bash.
- Time to first spell.
- Time to first Crown capture.
- Falls per player per match.
- Credited knock-offs.
- Self-falls.
- Crown possession time.
- Ability uses.
- Rematch acceptance.
- Subjective ratings.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 5 only: prepare the passing core game for a four-player private alpha.
Add only the minimal safe lobby, concise control card, readable player-colored
Crown/combat feedback, post-match scoreboard, and local development metrics
needed for playtesting. Add a test summary that reports movement, Bash, spell,
fall, knockout, Crown, match-duration, and rematch metrics. Do not rebalance
unless a written Plateau 5 test reveals a problem. Do not add progression,
currency, shops, cosmetics, quests, or a second map.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 5 using four clients and the four-player test matrix. Run
join/leave, simultaneous hill entry, simultaneous Bash, all-spell overlap,
respawn, timeout, sudden death, and five consecutive matches. Inspect server
and all client Output. Produce a human playtest form and a session summary
template. Do not claim fun, clarity, fairness, or rematch intent without real
tester responses.
```

### Human exit criteria

- At least 80% understand the objective within 30 seconds.
- At least 80% use Bash and one spell without verbal coaching.
- Average movement rating is at least 4.0/5.
- Average knockback fairness is at least 3.5/5.
- Average spell differentiation is at least 4.0/5.
- At least 70% accept an immediate rematch.
- No player spends more than 15 consecutive seconds disengaged while active.
- Self-falls are no more than half of total falls after each tester’s first two matches.
- No single player wins more than 70% of matches unless the group clearly identifies skill as the reason.
- No required mechanic generates repeated “I do not know what happened” feedback.

### Balance response order

When a test fails, adjust in this order:

1. Telegraph and feedback.
2. Cooldown.
3. Range or radius.
4. Impulse/velocity.
5. Arena geometry.
6. Scoring rules.

Do not change all six at once.

**Tag:** `plateau-5-four-player-alpha-pass`

---

## 14. Plateau 6: Eight-player network and resilience gate

### Experience at this plateau

The game remains coherent with eight simultaneous players, poor network conditions, repeated rounds, and aggressive input.

### Test matrix

| Scenario | Clients | Network |
|---|---:|---|
| Baseline | 8 | Local/default |
| Typical delay | 8 | 100 ms delay, moderate jitter |
| Poor delay | 8 | 200 ms delay, moderate jitter |
| Loss test | 8 | 2% packet loss |
| Join/leave churn | 8 | Players added/removed during all states |
| Action spam | 8 | Invalid and premature action requests |
| Long run | 8 | 30 shortened rounds |

### Build

1. Add scripted multiplayer scenarios through `StudioTestService`.
2. Add server counters for accepted and rejected action requests.
3. Add cleanup and runtime object-count assertions.
4. Add movement sanity monitoring with tolerant accumulators.
5. Add client snapshot sequence/version checks.
6. Add MicroProfiler labels around combat query, ability update, and round update.
7. Add a reproducible eight-client stress mode.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 6 only: harden the passing four-player game for eight players. Add
scripted StudioTestService scenarios for eight-client baseline, latency,
jitter, packet loss, join/leave churn, action spam, all-spell overlap, and a
30-round shortened endurance run. Add bounded server diagnostics, runtime
object assertions, snapshot sequencing, tolerant movement sanity monitoring,
and MicroProfiler labels around the critical server systems. Do not add new
gameplay or visual content.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 6 across the entire written eight-player matrix. Compare
round state, scores, Crown owner, cooldown outcomes, knock-off credit, and
ability cleanup across all clients. Record accepted/rejected remote counts,
duplicate outcomes, runtime object counts, client/server errors, and
MicroProfiler frame-time spikes. Confirm malformed or spammed requests cannot
create state, force, score, or VFX broadcasts. Produce exact PASS/FAIL evidence
for every scenario.
```

### Exit criteria

- Thirty shortened eight-client rounds finish without stuck state.
- No client permanently disagrees about winner, score, or Crown holder.
- No action produces duplicate server outcomes.
- Runtime object count returns to baseline after every round.
- Remote spam affects only the offending player’s rejected-request count.
- Malformed vectors and extreme values are rejected.
- No unbounded velocity, force, or part creation.
- No repeatable server frame spike over 33 ms from a Snow Crown script during ordinary eight-player play.
- Normal desktop client frame time targets 16.67 ms; the 95th percentile should remain below 25 ms during the stress scene.
- A real midrange mobile device sustains at least 30 FPS before public beta. Device emulation alone does not satisfy this requirement.

**Tag:** `plateau-6-eight-player-pass`

---

## 15. Plateau 7: Floating snow island and outdoor feeling

### Experience at this plateau

The graybox becomes the intended fantasy: a small, readable snow arena suspended above clouds, with enough depth, scale, motion, and sound to feel outdoors without expensive simulation.

### Art direction

Keep the top gameplay surface clean and bright. Put most detail:

- Under the island.
- Beyond the arena.
- In the sky.
- In short-lived local effects.

### Cheap high-value effects

1. **Cloud layer below the island**  
   A few large translucent cloud cards or low-cost particle volumes create immediate altitude.

2. **Distant floating silhouettes**  
   Two or three simplified islands at different scales provide parallax and world size.

3. **Underside depth**  
   Rock, ice shards, and hanging snow establish the island as a physical mass.

4. **Wind audio layers**  
   Base wind, higher edge wind, and brief speed hiss communicate exposure and motion.

5. **Board wake**  
   Trails plus small local ParticleEmitters provide the carving fantasy without deforming terrain.

6. **Edge snow loss**  
   Sparse flakes and clumps drifting over the edge show wind direction and height.

7. **Long shadows and low sun**  
   Lighting provides shape at minimal geometry cost.

8. **Atmospheric depth**  
   Atmosphere and color grading separate foreground, clouds, and distant islands.

9. **Crown beacon**  
   A vertical light/snow column keeps the objective readable from any spawn.

10. **Scale anchors**  
    Tiny distant birds, a suspended gondola, flags, or one faraway airship make the island’s size legible.

### Effects budget rules

- Board wake is local to each client.
- Cosmetic snow spray never drives gameplay.
- Persistent emitters have low rates; impacts use short `Emit()` bursts.
- Each spell has one primary shape and one primary sound.
- Do not use dynamic shadows on every particle or VFX part.
- Keep the active gameplay surface collision simple.
- Do not introduce EditableMesh deformation for the MVP.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 7 only: replace the passing graybox with a low-poly floating snow
island while preserving all gameplay dimensions, spawn positions, hill radius,
fall threshold, and simple collision. Add a cloud layer below, two or three
distant floating silhouettes, an ice/rock underside, directional wind cues,
low-cost board wakes, sparse edge snow, atmospheric depth, long readable
lighting, and a visible Crown beacon. Use client-local cosmetic effects and
bounded particle rates. Do not change movement, combat, spell, scoring, or
round tuning unless a regression test proves the art pass broke it.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 7 for gameplay regression, readability, and performance.
Repeat the movement, duel, hill, three-spell, and eight-client smoke tests.
Capture each spawn, the center, the edge, and a fall view. Verify the hill,
players, spell telegraphs, and island boundary remain readable against the art.
Use MicroProfiler to compare the passing Plateau 6 build with the art build and
identify rendering, physics, particle, or lighting regressions. Produce a human
outdoor scale and clarity test.
```

### Exit criteria

- All prior automated smoke tests still pass.
- The center objective is visible from all eight spawns.
- The playable edge is readable without an opaque wall or railing.
- Players remain readable against snow and sky.
- Testers rate sense of height/scale at least 4.0/5.
- Testers rate outdoor atmosphere at least 4.0/5.
- Testers can distinguish all three spell telegraphs during eight-player play.
- Performance remains inside Plateau 6 budgets on desktop and real mobile hardware.

**Tag:** `plateau-7-art-pass`

---

## 16. Plateau 8: Closed alpha and public beta gate

### Experience at this plateau

New players can enter, understand, play, finish, and choose to play again without the developer explaining the game.

### Closed-alpha cohort

Minimum:

- 12 unique testers.
- At least three sessions.
- At least four first-time players in one session.
- Keyboard, gamepad, and touch represented.
- At least one real eight-player match.

### Published analytics

Roblox custom analytics events can track ability use and core-loop outcomes, but they only send from the server in a published experience, not Studio. [Custom events](https://create.roblox.com/docs/production/analytics/custom-events)

Log a small stable vocabulary:

| Event | Purpose |
|---|---|
| `RoundJoined` | Player entered an active or upcoming match |
| `FirstMove` | First meaningful movement |
| `FirstBash` | First Bash |
| `FirstSpell` | First spell, with ability custom field |
| `FirstCrown` | First Crown capture |
| `Fall` | Self-fall or credited knock-off |
| `AbilityCast` | Ability usage with custom field |
| `RoundCompleted` | Completed match |
| `RematchStayed` | Stayed through next countdown |

Do not log high-cardinality data or personal text.

### Implementation prompt

```text
[Paste the Universal AI implementation prompt first.]

Plateau 8 only: prepare Snow Crown for a controlled published closed alpha.
Add a concise first-time control presentation, safe production logging, and
server-only AnalyticsService events for the written onboarding and core-loop
milestones. Use stable event names and ability custom fields. Add no economy,
shop, paid item, progression grind, or new gameplay. Add a production
configuration that disables development HUDs and verbose logs while preserving
error diagnostics. Verify Studio gracefully skips published-only analytics.
```

### Evaluation prompt

```text
[Paste the Universal AI evaluation prompt first.]

Evaluate Plateau 8 as a release candidate. Run the complete regression suite,
eight-client matrix, device checks, production configuration, analytics
failure handling, and clean-server join flow. Confirm a new player can reach
movement, Bash, a spell, the Crown, round completion, results, and the next
countdown. Produce the exact closed-alpha observer sheet and aggregate the real
tester results after they are supplied. Do not mark onboarding or retention
criteria as passed without published-session evidence.
```

### Public beta exit criteria

- At least 80% of new testers move within 10 seconds.
- At least 75% Bash within 45 seconds.
- At least 70% cast a spell within 60 seconds.
- At least 70% enter or contest the Crown during their first match.
- At least 80% complete their first match.
- At least 60% remain for another match.
- Average “I understood why I fell” rating is at least 3.5/5.
- Average overall fun rating is at least 4.0/5.
- No unresolved critical error, exploit, stuck state, or data-loss issue.
- No gameplay purchase is required.

**Tag:** `plateau-8-public-beta-ready`

---

## 17. Evaluation instruments

### 17.1 Plateau log template

```markdown
## Plateau test

- Plateau:
- Date:
- Git commit:
- Roblox place version:
- Tester count:
- Devices:
- Network profile:
- Tuning profile:

### Objective results

| Criterion | Result | Evidence |
|---|---|---|
| | PASS/FAIL | |

### Human ratings

| Question | Average | Notes |
|---|---:|---|
| | | |

### Problems observed

1.

### One-variable next experiment

- Hypothesis:
- Value before:
- Value after:
- Expected result:

### Decision

- GREEN / YELLOW / RED
- Reason:
- Next action:
```

### 17.2 First-time player questions

Rate 1–5:

1. I understood where I was supposed to go.
2. Moving felt responsive and predictable.
3. I understood when my Bash connected.
4. I understood why I was knocked off.
5. The three spells felt different.
6. I could tell who controlled the Crown.
7. Falling and returning did not interrupt the fun for too long.
8. The island felt high, open, and outdoors.
9. I would play another round.

Open questions:

- What confused you first?
- What was your most satisfying moment?
- Which ability felt strongest?
- Which ability did you forget to use?
- Did anything feel unfair?
- What would you remove?

### 17.3 Balance telemetry

Track per match:

- Casts per ability per player.
- Successful affected targets per cast.
- Knock-offs directly or recently assisted by each ability.
- Crown captures and possession duration.
- Bash attempts and successful hits.
- Self-falls versus credited knock-offs.
- Average life duration.
- Time spent outside meaningful interaction.
- Score spread between first and last.
- Winner repeat rate across the group.

Signals:

| Observation | Likely issue |
|---|---|
| Many casts, few affected targets | Telegraph/aim/range problem |
| Few casts, high success | Input discoverability or excessive cooldown |
| One spell dominates knock-offs | Strength, radius, or cooldown imbalance |
| Most falls are self-falls | Movement or edge readability problem |
| Crown rarely changes owner | Hill geometry or defender advantage |
| Crown changes every second | Capture rule or knockback too volatile |
| Leader snowballs permanently | Scoring or spawn return path problem |
| Players avoid center | Objective reward too weak or center too dangerous |
| Matches always time out | Score target too high or scoring pauses too often |
| Matches end under one minute | Score target too low or knock-off bonus too high |

---

## 18. Debugging decision tree

### Movement feels bad

1. Do objective speed/coast/turn measurements pass?
2. If no, change only the failed movement family.
3. If yes, inspect camera and animation.
4. If CCL fails after three complete tuning cycles, take the custom-controller branch.

### Hits feel unfair

1. Check telegraph and impact position.
2. Compare server range/cone with what the attacker saw.
3. Test latency.
4. Widen forgiveness slightly before increasing force.
5. Never solve hit registration by accepting a client-selected target.

### Knockback is inconsistent

1. Confirm mass-scaled impulse.
2. Confirm target protection/state.
3. Confirm no movement controller immediately overwrites external velocity.
4. Check network owner behavior.
5. Inspect global speed cap after impulses.

### Spells feel similar

Do not recolor them and call them different.

- Raise must primarily alter vertical position and create a ramp.
- Flow must primarily alter travel speed and route.
- Pull must primarily alter relative positioning.

If a spell cannot own its verb, remove or redesign it.

### Eight-player play becomes unreadable

Reduce in this order:

1. Secondary particles.
2. Effect duration.
3. Visual opacity.
4. Simultaneous cosmetic layers.
5. Effect radius only if gameplay remains too crowded.

Do not remove the primary telegraph before decorative effects.

---

## 19. Explicitly deferred work

Do not schedule these before Plateau 8:

- Water world.
- Multiple snow islands/maps.
- Persistent player progression.
- Currency or shops.
- Paid advantages.
- Ranked matchmaking.
- Global leaderboards.
- Clans or parties.
- Full VR controls.
- Terrain-wide deformation.
- EditableMesh snow simulation.
- User-generated maps.
- More spells.
- Elaborate lobby.
- Narrative or quest system.

After Snow Crown passes public beta, the water world can reuse:

- Round state.
- Networking.
- Combat validation.
- Crown objective.
- Input.
- UI.
- Ability framework.
- Analytics.

It should replace only:

- Movement adapter.
- Arena surface.
- Spell presentation.
- Environmental art and audio.

---

## 20. Recommended first action

Do not begin by building the finished island.

Begin with Plateau 0, then ask the connected AI to create Plateau 1’s circular movement toy. The first meaningful decision is whether CCL can deliver the desired carving and momentum while accepting external impulses. Once that is green, Snow Crown becomes a controlled sequence of small, testable systems rather than an uncertain “make a multiplayer snow game” project.
