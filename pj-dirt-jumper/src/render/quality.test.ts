import { test } from "node:test";
import assert from "node:assert/strict";
import { Quality } from "./quality";
const run = (q: Quality, fps: number, seconds: number) => {
  let changes = 0;
  for (let t = 0; t < seconds; t += 1 / fps) if (q.frame(1 / fps)) changes++;
  return changes;
};
test("a smooth device keeps full resolution and shadows", () => {
  const q = new Quality(2);
  assert.equal(run(q, 60, 30), 0);
  assert.equal(q.ratio, 2);
  assert.ok(q.shadows);
});
test("a struggling device steps the resolution down, then drops shadows, then stops", () => {
  const q = new Quality(2);
  run(q, 20, 120);
  assert.equal(q.ratio, 0.75);
  assert.equal(q.shadows, false);
});
test("one step at a time, with a few seconds to settle between", () => {
  const q = new Quality(2);
  run(q, 25, 4);
  assert.equal(q.ratio, 1.75);
});
test("tab-switch hitches don't count", () => {
  const q = new Quality(2);
  for (let i = 0; i < 50; i++) q.frame(1.5);
  assert.equal(q.ratio, 2);
});
