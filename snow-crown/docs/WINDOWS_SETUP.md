# Snow Crown: first Windows session

This is the first connection and smoke test, not a finished game. Roblox
Studio also supports macOS; adapt the shell commands for that platform.

## 1. Get the files and tools

Install [Roblox Studio](https://create.roblox.com/docs/tutorials/curriculums/studio/install-studio),
[Git](https://git-scm.com/), and a working Codex CLI on the same Windows
computer. Python 3.10+ is needed only for the local-worker helper and its
tests. In PowerShell:

```powershell
git clone https://github.com/boxwrench/BOXGames.git
cd BOXGames/snow-crown
```

If you already have the repository, pull your intended branch instead of
cloning again. Do not discard local changes.

## 2. Open the prepared workshop

The repo contains `place/SnowCrownDev.template.rbxlx`, assembled offline from
licensed Roblox test fixtures and this project's scripts. Its XML and hierarchy
passed offline checks, but **it has not yet been opened in Roblox Studio**.

1. Open Studio and sign in. Use **File → Open** to select the template.
2. Use **File → Save As** immediately to make a working copy named
   `SnowCrownDev.rbxlx` (or `.rbxl`). Keep the tracked template unchanged.
3. Name the experience `Snow Crown Dev` and configure a maximum of 8 players
   when the experience settings are available. It need not be publicly released.
4. In Explorer, confirm the Snow Crown folders and scripts are present. Do not
   run `studio/create_workshop.luau` on this template; the folders already exist.

If the generated place does not open correctly, record the exact error, then
create a new **Baseplate** instead. While not playtesting, run the contents of
`studio/create_workshop.luau` in Studio's Command Bar and confirm Output says
`[SnowCrown] empty workshop folders ready`. Continue with Script Sync below to
install the source files. This alternative is also awaiting Studio validation.

The `.rbxlx` or `.rbxl` place contains the scene and other Studio objects.
Script Sync alone is not a complete place backup. Before changing an existing
place, save a separate checkpoint; do not apply this helper to an unknown place.
To check that the tracked template still matches the local source, run
`py -3 tools/build_place.py --check place/SnowCrownDev.template.rbxlx`. To
generate a separate new template after source changes, run
`py -3 tools/build_place.py`; it refuses to overwrite an existing output.

## 3. Connect Codex to Studio

Follow [Roblox's MCP guide](https://create.roblox.com/docs/studio/mcp):

1. Open **Assistant** in Studio, then **… → Manage MCP Servers**.
2. Enable **Studio as MCP server**. In **Quick connect**, select Codex CLI.
3. Start or restart Codex CLI from this project's directory and check for the
   green connected indicator. If Codex is absent, install it and restart Studio.
4. Ask Codex: “List the connected Studio instances, identify my open place,
   inspect its tree, start and stop one playtest, and report Output. Do not
   change anything.”

This is a local connection. A hosted ChatGPT Work session does not gain access
to your Windows Studio simply because the repository is on GitHub.

## 4. Connect the script folders

See [Script Sync](https://create.roblox.com/docs/scripting/sync). In Studio's
Explorer, select each **folder**, choose **Sync to…**, and map it to the
matching directory in your clone:

| Studio folder | Local directory |
| --- | --- |
| `ReplicatedStorage/SnowCrown/Shared` | `snow-crown/src/shared` |
| `ServerScriptService/SnowCrownServer` | `snow-crown/src/server` |
| `StarterPlayer/StarterPlayerScripts/SnowCrownClient` | `snow-crown/src/client` |

The files ending `.server.luau`, `.local.luau`, and `.luau` correspond to a
server Script, LocalScript, and ModuleScript respectively. The client bootstrap
uses a LocalScript in StarterPlayerScripts to avoid executing both the starter
script and its per-player copy. The generated place already contains those
scripts. If Studio shows a conflict dialog, inspect the listed changes. For a
fresh template whose scripts match this checkout, choose a direction only after
confirming that it will preserve your intended files. If you created a blank
place instead, select the disk version only when the dialog confirms it will
add the expected scripts without removing anything you want to keep. Stop and
back up if the place or folder contains other work.

## 5. Run the workshop checks

1. Start a Studio playtest. In Output, look for exactly one each of:
   - `[SnowCrown] server bootstrap ready`
   - `[SnowCrown] client bootstrap ready`
   - `[SnowCrown] Plateau 0 server smoke test passed`
2. Check for red errors. Stop and run a second playtest; verify the same results.
3. Test Script Sync in both directions with a temporary comment in a script;
   restore it afterwards and save your place.
4. Verify the MCP can inspect the tree, make and restore a harmless edit, start
   and stop a playtest, inspect Output, and capture the viewport.
5. Check whether [Character Controller Library](https://create.roblox.com/docs/characters/character-controller-library)
   is available in Beta Features and Avatar Settings. Record its state; do not
   claim the movement milestone passes without testing movement later.
6. Record actual outcomes and Studio version in [STATUS.md](STATUS.md). Keep
   the checkpoint unpassed if any required check is unavailable or fails.

Once all checks pass, commit the place checkpoint if desired and tag the
actual verified commit `plateau-0-workshop-pass`. Then start the movement toy
described in the blueprint; do not build the complete arena yet.
