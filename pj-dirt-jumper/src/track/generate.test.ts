import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackGen } from "./generate";
test("same seed builds the same trail", () => {
  const a = new TrackGen(42),
    b = new TrackGen(42);
  a.ensure(1000);
  b.ensure(1000);
  assert.deepEqual(a.track.knots, b.track.knots);
});
test("different seeds build different trails", () => {
  const a = new TrackGen(1),
    b = new TrackGen(2);
  a.ensure(500);
  b.ensure(500);
  assert.notDeepEqual(a.track.knots.slice(0, 40), b.track.knots.slice(0, 40));
});
test("ensure extends the trail past the requested distance", () => {
  const g = new TrackGen(1);
  g.ensure(750);
  assert.ok(g.track.end >= 750);
});
test("knots move forward and stay at backyard heights", () => {
  const g = new TrackGen(9);
  g.ensure(3000);
  const k = g.track.knots;
  for (let i = 1; i < k.length; i++) assert.ok(k[i].x > k[i - 1].x);
  assert.ok(k.every((p) => p.y >= -0.5 && p.y <= 8));
});
test("every run starts on a downhill run-in", () => {
  const g = new TrackGen(7);
  assert.equal(g.track.sections[0].kind, "runin");
  assert.ok(g.track.slopeAt(6) < -0.1);
});
test("sections tile the trail with no gaps", () => {
  const g = new TrackGen(3);
  g.ensure(1200);
  const s = g.track.sections;
  assert.equal(s[0].x0, 0);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].x0, s[i - 1].x1);
  assert.equal(s.at(-1)!.x1, g.track.end);
});
test("the backyard mixes rollers and tabletops", () => {
  const g = new TrackGen(11);
  g.ensure(1000);
  const kinds = new Set(g.track.sections.map((s) => s.kind));
  assert.ok(kinds.has("rollers") && kinds.has("tabletop"));
});
