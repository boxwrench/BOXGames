import { test } from "node:test";
import assert from "node:assert/strict";
import { padActions, dragSpin, keyActions } from "./input";
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
const keys = (...codes: string[]) => keyActions(new Set(codes));
test("keyboard: Space pumps, arrows flip, up/down grab, both = No-Hander", () => {
  assert.deepEqual(keys("Space"), { pump: true, spin: 0, grab: [false, false, false] });
  assert.equal(keys("ArrowLeft").spin, -1);
  assert.equal(keys("ArrowRight").spin, 1);
  assert.deepEqual(keys("ArrowUp").grab, [true, false, false]);
  assert.deepEqual(keys("ArrowDown").grab, [false, true, false]);
  assert.deepEqual(keys("ArrowUp", "ArrowDown").grab, [false, false, true]);
  assert.equal(keys("ArrowDown").pump, false, "down arrow no longer pumps");
});
test("keyboard: letter keys still work as alternates", () => {
  assert.equal(keys("KeyS").pump, true);
  assert.equal(keys("KeyA").spin, -1);
  assert.deepEqual(keys("KeyJ").grab, [true, false, false]);
  assert.deepEqual(keys("KeyK").grab, [false, true, false]);
  assert.deepEqual(keys("KeyL").grab, [false, false, true]);
});
