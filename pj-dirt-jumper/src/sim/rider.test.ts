import { test } from "node:test";
import assert from "node:assert/strict";
import { createRider, step, NO_ACTIONS, type Actions, type SimEvent } from "./rider";
import { Track } from "../track/track";
import { TrackGen } from "../track/generate";
import { T } from "../tuning";
import { botActions } from "./bot";
const PUMP: Actions = { ...NO_ACTIONS, pump: true };
const dt = 1 / T.simHz;
/** A straight line with the given slope, long enough for any test. */
function line(slope: number) {
  const t = new Track();
  t.add({ x: -1000, y: -1000 * slope, m: slope });
  t.add({ x: 1000, y: 1000 * slope, m: slope });
  return t;
}
function ride(track: Track, a: Actions, seconds: number, v = 8) {
  const r = createRider(),
    events: SimEvent[] = [];
  r.x = 0;
  r.v = v;
  for (let i = 0; i < Math.round(seconds * T.simHz); i++) events.push(...step(r, a, track, dt));
  return { r, events };
}
test("pumping a downslope gains speed", () => {
  const down = line(-0.4);
  assert.ok(ride(down, PUMP, 1).r.v > ride(down, NO_ACTIONS, 1).r.v + 1);
});
test("pumping an upslope bleeds speed", () => {
  const up = line(0.4);
  assert.ok(ride(up, PUMP, 1, 12).r.v < ride(up, NO_ACTIONS, 1, 12).r.v - 1);
});
test("on the flat, pumping helps a little but never keeps PJ going", () => {
  const flat = line(0);
  assert.ok(ride(flat, PUMP, 2).r.v > ride(flat, NO_ACTIONS, 2).r.v + 0.5);
  assert.ok(ride(flat, NO_ACTIONS, 2).r.v < 7);
  for (const v of [2, 8, 20]) assert.ok(ride(flat, PUMP, 1, v).r.v < v, `still slows from ${v} m/s`);
});
test("pumping can't push past maxSpeed", () => {
  assert.ok(ride(line(-0.1), NO_ACTIONS, 30).r.v < T.maxSpeed - 2);
  assert.equal(ride(line(-0.1), PUMP, 30).r.v, T.maxSpeed);
});
test("gravity can carry PJ past maxSpeed, up to hardSpeed", () => {
  const fast = ride(line(-0.6), PUMP, 10).r.v;
  assert.ok(fast > T.maxSpeed + 3 && fast <= T.hardSpeed, `v ${fast}`);
});
test("crawling under stallSpeed for stallSeconds ends the run once", () => {
  const { r, events } = ride(line(0), NO_ACTIONS, T.stallSeconds + 0.1, 1);
  assert.equal(r.state, "stalled");
  assert.deepEqual(events, [{ type: "stalled" }]);
  const x = r.x;
  assert.deepEqual(step(r, PUMP, line(0), dt), []);
  assert.equal(r.x, x);
});
test("preload charges while pumping and resets on release", () => {
  const flat = line(0),
    r = createRider();
  for (let i = 0; i < 0.2 * T.simHz; i++) step(r, PUMP, flat, dt);
  assert.ok(Math.abs(r.preload - 0.2 / T.preloadSeconds) < 0.02);
  for (let i = 0; i < 0.3 * T.simHz; i++) step(r, PUMP, flat, dt);
  assert.equal(r.preload, 1);
  step(r, NO_ACTIONS, flat, dt);
  assert.equal(r.preload, 0);
});
test("distance follows the slope while x advances horizontally", () => {
  const { r } = ride(line(-1), NO_ACTIONS, 1, 10);
  assert.ok(r.distance > r.x + 1);
});
test("a rider who pumps and pops keeps rolling; a coaster soon stalls or bails", () => {
  const g = new TrackGen(20260922);
  g.ensure(1500);
  const run = (pumper: boolean) => {
    const r = createRider();
    for (let i = 0; i < 180 * T.simHz && (r.state === "riding" || r.state === "air") && r.x < 1200; i++)
      step(r, pumper ? botActions(r, g.track) : NO_ACTIONS, g.track, dt);
    return r;
  };
  const pumper = run(true),
    coaster = run(false);
  assert.ok(pumper.state === "riding" || pumper.state === "air", pumper.state);
  assert.ok(pumper.x >= 1200, `pumper only reached ${pumper.x.toFixed(0)} m`);
  // Lips launch since M2, so a rider who never pumps or pops either stalls or bails.
  assert.ok(coaster.state === "stalled" || coaster.state === "bailed", coaster.state);
  assert.ok(coaster.x < 1200, `coaster rolled ${coaster.x.toFixed(0)} m`);
});
