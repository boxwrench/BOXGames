import { test } from "node:test";
import assert from "node:assert/strict";
import { padActions, dragSpin } from "./input";
const pad = (pressed: number[], x = 0) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })), axes: [x, 0] });
test("standard gamepad: A pumps, left stick spins, X/Y/B grab", () => {
  assert.deepEqual(padActions(pad([0], -0.8)), { pump: true, spin: -0.8, grab: [false, false, false] });
  assert.deepEqual(padActions(pad([2, 3, 1])), { pump: false, spin: 0, grab: [true, true, true] });
  assert.equal(padActions(pad([], 0.15))?.spin, 0, "dead zone");
  assert.equal(padActions(null), null);
});
test("thumb drag maps to spin, saturating at 60 px", () => {
  assert.equal(dragSpin(0), 0);
  assert.equal(dragSpin(-30), -0.5);
  assert.equal(dragSpin(200), 1);
});
