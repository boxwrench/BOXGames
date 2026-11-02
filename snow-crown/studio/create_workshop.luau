-- Run once in Studio's Command Bar while EDITING a new Baseplate.
-- It creates empty folders only; it does not install or overwrite scripts.
local RunService = game:GetService("RunService")
assert(RunService:IsStudio() and not RunService:IsRunning(), "Stop playtesting first")

local function ensureFolder(parent: Instance, name: string): Folder
	local existing = parent:FindFirstChild(name)
	if existing then
		assert(existing:IsA("Folder"), existing:GetFullName() .. " exists but is not a Folder")
		return existing
	end
	local created = Instance.new("Folder")
	created.Name = name
	created.Parent = parent
	return created
end

local replicated = ensureFolder(game:GetService("ReplicatedStorage"), "SnowCrown")
ensureFolder(replicated, "Shared")
ensureFolder(replicated, "Remotes")
ensureFolder(game:GetService("ServerScriptService"), "SnowCrownServer")
local playerScripts = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
ensureFolder(playerScripts, "SnowCrownClient")
local assets = ensureFolder(game:GetService("ServerStorage"), "SnowCrownAssets")
for _, name in ipairs({ "Maps", "Boards", "EffectTemplates" }) do
	ensureFolder(assets, name)
end
local runtime = ensureFolder(game:GetService("Workspace"), "SnowCrownRuntime")
for _, name in ipairs({ "Arena", "SpawnPoints", "ActiveAbilities", "CosmeticAnchors" }) do
	ensureFolder(runtime, name)
end

print("[SnowCrown] empty workshop folders ready")
