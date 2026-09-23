import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, tierAt } from "./tiers";
test("tiers start at the spec distances and escalate", () => {
  assert.deepEqual(TIERS.map((t) => t.from), [0, 400, 1200, 2500, 4000]);
  assert.equal(tierAt(0).name, "Backyard Pump Track");
  assert.equal(tierAt(399).name, "Backyard Pump Track");
  assert.equal(tierAt(400).name, "Local Dirt Jumps");
  assert.equal(tierAt(9999).name, "Volcano Send-Zone");
  assert.ok(!tierAt(100).kinds.some((k) => k === "double" || k === "canyon" || k === "megahip"));
  assert.ok(tierAt(4500).kinds.includes("megahip"));
});
