import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackGen } from "../track/generate";
import { createRider, step } from "./rider";
import { botActions } from "./bot";
import { dropPoint, dropRider } from "./slipstream";
import { T } from "../tuning";
test("the rocket drops PJ past a designed landing, at least the requested distance ahead", () => {
  const g = new TrackGen(5);
  g.ensure(2000);
  const x = dropPoint(g.track, 300, T.rocketMeters),
    jump = g.track.jumps.find((j) => Math.abs(j.landX + T.rocketDropPast - x) < 1e-9);
  assert.ok(x >= 300 + T.rocketMeters);
  assert.ok(jump?.aim, "drops onto a designed landing");
});
test("dropping resets PJ to riding and counts the distance flown", () => {
  const g = new TrackGen(5);
  g.ensure(2000);
  const r = createRider();
  Object.assign(r, { x: 300, distance: 298, state: "air", spun: 3, flips: 1, grab: 0 });
  const x = dropPoint(g.track, r.x, T.rocketMeters);
  dropRider(r, g.track, x);
  assert.equal(r.state, "riding");
  assert.equal(r.x, x);
  assert.equal(r.y, g.track.heightAt(x));
  assert.equal(r.distance, 298 + (x - 300));
  assert.equal(r.flips, 0);
  assert.equal(r.grab, -1);
});
test("every drop is rideable: the reference rider carries on without bailing", () => {
  let fails = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const g = new TrackGen(seed),
      from = 150 + (seed % 7) * 180;
    g.ensure(from + 900);
    const r = createRider();
    r.x = from;
    dropRider(r, g.track, dropPoint(g.track, from, T.rocketMeters));
    for (let i = 0; i < 12 * T.simHz; i++)
      for (const e of step(r, botActions(r, g.track), g.track, 1 / T.simHz)) if (e.type === "bail" || e.type === "stalled") fails++;
  }
  assert.equal(fails, 0);
});
