--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local root = ReplicatedStorage:WaitForChild("SnowCrown", 10)
assert(root and root:IsA("Folder"), "SnowCrown shared root is missing")

local shared = root:WaitForChild("Shared", 10)
assert(shared and shared:IsA("Folder"), "SnowCrown Shared folder is missing")

local configScript = shared:WaitForChild("Config", 10)
assert(configScript and configScript:IsA("ModuleScript"), "SnowCrown Config is missing")
local config = require(configScript)
assert(config.SCHEMA_VERSION == 1, "Unexpected SnowCrown Config schema")

print("[SnowCrown] server bootstrap ready")
