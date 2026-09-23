import { test } from "node:test";
import assert from "node:assert/strict";
import { Score, comboName, flipPoints, flipName, trickNames } from "./score";
import type { SimEvent, Trick } from "../sim/rider";
import { T } from "../tuning";
const flip = (n: number, dir: "back" | "front" = "back"): Trick => ({ kind: "flip", dir, n });
const grab = (g: number, seconds = 0.5, releasedAt = NaN): Trick => ({ kind: "grab", grab: g, seconds, releasedAt });
const land = (tricks: Trick[], grade: "perfect" | "buttery" | "clean" | "sketchy" = "perfect", apexTime = 0.8): SimEvent => ({ type: "land", grade, tricks, airTime: 1.6, angleError: 0, apexTime });
test("flip points follow the spec table", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(flipPoints), [0, 500, 1200, 2000, 3000]);
  assert.equal(flipName("front", 2), "Double Frontflip");
});
test("air points: base x distinct tricks x Flow x landing", () => {
  const s = new Score(),
    res = s.handle(land([flip(1), grab(0, 0.5)]))!;
  assert.equal(res.base, 500 + 5 * T.grabPointsPerTenth);
  assert.equal(res.multiplier, 2);
  assert.equal(res.points, 800 * 2 * 1 * 1.5);
  assert.equal(res.name, "Bluegill Backflip");
  assert.equal(s.airPoints, 2400);
});
test("a perfect pop adds its bonus to the next landing only", () => {
  const s = new Score();
  s.handle({ type: "pop", perfect: true });
  assert.equal(s.handle(land([flip(1)], "clean"))!.base, 500 + T.perfectPopPoints);
  assert.equal(s.handle(land([flip(1)], "clean"))!.base, 500);
});
test("sketchy landings bank half; Flow scales later scores", () => {
  const s = new Score();
  assert.equal(s.handle(land([flip(1)], "sketchy"))!.points, 250);
  s.flow = 4;
  assert.equal(s.handle(land([flip(1)], "clean"))!.points, 500 * (1 + 4 * T.flowScore));
});
test("Flow: +2 perfect, +1 buttery, -1 sketchy, capped 0..5", () => {
  const s = new Score();
  s.handle(land([], "perfect"));
  assert.equal(s.flow, 2);
  s.handle(land([], "buttery"));
  s.handle(land([], "perfect"));
  s.handle(land([], "perfect"));
  assert.equal(s.flow, 5);
  s.handle(land([], "sketchy"));
  assert.equal(s.flow, 4);
});
test("Flow decays a level for every flowDecay seconds grounded without a trick", () => {
  const s = new Score();
  s.flow = 3;
  let drops = 0;
  for (let i = 0; i < T.flowDecay * 120 * 2 + 4; i++) if (s.tick(1 / 120, true, 0)) drops++;
  assert.equal(drops, 2);
  assert.equal(s.flow, 1);
  assert.equal(s.tick(1, false, 0), false, "airtime never decays Flow");
});
test("landing a trick resets the Flow decay clock", () => {
  const s = new Score();
  s.flow = 3;
  for (let i = 0; i < 3 * 120; i++) s.tick(1 / 120, true, 0);
  s.handle(land([flip(1)], "clean"));
  for (let i = 0; i < 3 * 120; i++) s.tick(1 / 120, true, 0);
  assert.equal(s.flow, 3);
});
test("fishing combo names", () => {
  assert.equal(comboName([grab(0), grab(1), grab(2)], 1), "Full Tackle Box");
  assert.equal(comboName([flip(3)], 1), "Lunker Loop");
  assert.equal(comboName([flip(2)], 1), "The Double Hookset");
  assert.equal(comboName([flip(1, "front"), grab(1)], 1), "Largemouth Tailwhip");
  assert.equal(comboName([flip(1), grab(0)], 1), "Bluegill Backflip");
  assert.equal(comboName([grab(2, 0.4, 0.9)], 1), "Catch-and-Release");
  assert.equal(comboName([grab(2, 0.4, 0.5)], 1), undefined);
  assert.equal(comboName([flip(1)], 1), undefined);
  assert.deepEqual(trickNames([flip(1), grab(2)]), ["Backflip", "No-Hander"]);
});
test("score total is distance plus banked air, and the best air is kept", () => {
  const s = new Score();
  s.handle(land([flip(1)]));
  s.handle(land([flip(2)]));
  s.tick(0.01, true, 123.7);
  assert.equal(s.total, 123 + s.airPoints);
  assert.equal(s.best?.name, "The Double Hookset");
});
