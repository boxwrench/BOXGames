import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackGen } from "./generate";
import { createRider, step } from "../sim/rider";
import { botActions } from "../sim/bot";
import { T } from "../tuning";
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
test("knots move forward with no cliffs and the trail descends gently", () => {
  const g = new TrackGen(9);
  g.ensure(3000);
  const k = g.track.knots;
  for (let i = 1; i < k.length; i++) {
    assert.ok(k[i].x > k[i - 1].x);
    assert.ok(Math.abs(k[i].y - k[i - 1].y) < 14, `jump in height at x=${k[i].x.toFixed(1)}`);
  }
  // Landings climb back only part of their drop (T.climbBack), so the trail descends gently, like a mountain run.
  assert.ok(k.every((p) => p.y <= 8 && p.y >= -0.1 * p.x - 25), "trail descends gently");
});
test("the first jump comes straight after the run-in", () => {
  for (const seed of [1, 2, 3]) assert.equal(new TrackGen(seed).track.sections[1].kind, "tabletop");
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
test("the reference rider clears every jump it designs, landing on the sweet spot", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g = new TrackGen(seed);
    g.ensure(3000);
    assert.equal(g.failures, 0, `seed ${seed}: reference rider failed`);
    for (const j of g.track.jumps.filter((j) => j.lipX < 2900)) {
      const land = g.landings.find((l) => l.lipX === j.lipX);
      assert.ok(land, `seed ${seed}: no landing for lip ${j.lipX.toFixed(1)}`);
      assert.ok(Math.abs(land.x - j.landX) < 0.6, `seed ${seed}: landed ${land.x.toFixed(2)} vs ${j.landX.toFixed(2)}`);
      assert.ok(land.grade === "perfect" || land.grade === "buttery", `seed ${seed}: ${land.grade}`);
    }
  }
});
test("later tiers bring bigger features", () => {
  const g = new TrackGen(5);
  g.ensure(5000);
  const kindsIn = (a: number, b: number) => new Set(g.track.sections.filter((s) => s.x0 >= a && s.x0 < b).map((s) => s.kind));
  assert.ok([...kindsIn(32, 390)].every((k) => k === "rollers" || k === "tabletop"));
  const late = kindsIn(4000, 5000);
  assert.ok(late.has("canyon") || late.has("megahip"));
});
function ride(seed: number, to: number, popAt: number) {
  const g = new TrackGen(seed),
    r = createRider();
  let jumps = 0;
  g.ensure(to + 300);
  for (let i = 0; i < 600 * T.simHz && r.x < to && (r.state === "riding" || r.state === "air"); i++)
    for (const e of step(r, botActions(r, g.track, popAt), g.track, 1 / T.simHz)) if (e.type === "takeoff") jumps++;
  return { r, jumps };
}
test("a perfect-popping rider overshoots but still lands", () => {
  let bails = 0,
    jumps = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const out = ride(seed, 2000, 0.05);
    jumps += out.jumps;
    if (out.r.state === "bailed") bails++;
  }
  assert.ok(bails / 30 <= 0.1, `${bails} of 30 perfect-pop runs bailed (${jumps} jumps)`);
});
test("a rider who never pops can still get through the backyard", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { r } = ride(seed, 390, -1);
    assert.ok(r.x >= 390 && r.state !== "bailed", `seed ${seed}: ${r.state} at ${r.x.toFixed(0)} m`);
  }
});
