--!strict
local RunService = game:GetService("RunService")
if not RunService:IsStudio() then
	return
end

local function folder(parent: Instance, name: string): Instance
	local child = parent:WaitForChild(name, 10)
	assert(child and child:IsA("Folder"), parent:GetFullName() .. "/" .. name .. " must be a Folder")
	return child
end

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")
local StarterPlayer = game:GetService("StarterPlayer")
local Workspace = game:GetService("Workspace")

local sharedRoot = folder(ReplicatedStorage, "SnowCrown")
local shared = folder(sharedRoot, "Shared")
folder(sharedRoot, "Remotes")
local configScript = shared:WaitForChild("Config", 10)
assert(configScript and configScript:IsA("ModuleScript"), "Shared/Config must be a ModuleScript")
local config = require(configScript)
assert(config.SCHEMA_VERSION == 1, "Unexpected configuration schema")
assert(config.FEATURES.MovementPrototype == false, "Movement must be disabled at Plateau 0")
assert(config.FEATURES.Combat == false, "Combat must be disabled at Plateau 0")
assert(config.FEATURES.CrownRound == false, "Round must be disabled at Plateau 0")
assert(config.FEATURES.Abilities == false, "Abilities must be disabled at Plateau 0")

folder(ServerScriptService, "SnowCrownServer")
local playerScripts = StarterPlayer:WaitForChild("StarterPlayerScripts", 10)
assert(playerScripts, "StarterPlayerScripts is missing")
folder(playerScripts, "SnowCrownClient")
local assets = folder(ServerStorage, "SnowCrownAssets")
for _, name in ipairs({ "Maps", "Boards", "EffectTemplates" }) do
	folder(assets, name)
end
local runtime = folder(Workspace, "SnowCrownRuntime")
for _, name in ipairs({ "Arena", "SpawnPoints", "ActiveAbilities", "CosmeticAnchors" }) do
	folder(runtime, name)
end

print("[SnowCrown] Plateau 0 server smoke test passed")
