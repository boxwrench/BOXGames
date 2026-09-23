import { test } from "node:test";
import assert from "node:assert/strict";
import { createRider, step, NO_ACTIONS, type Actions, type Rider, type SimEvent } from "./rider";
import { Track } from "../track/track";
import { T } from "../tuning";
const dt = 1 / T.simHz,
  TAU = Math.PI * 2,
  deg = Math.PI / 180;
function line(slope: number) {
  const t = new Track();
  t.add({ x: -1000, y: -1000 * slope, m: slope });
  t.add({ x: 1000, y: 1000 * slope, m: slope });
  return t;
}
/** Flat run-in to a 35° lip at x = 20, then a pit. */
function kicker() {
  const t = new Track();
  t.add({ x: -100, y: 0, m: 0 });
  t.add({ x: 14, y: 0, m: 0 });
  t.add({ x: 20, y: 1.5, m: 0.7 });
  t.add({ x: 26, y: -1, m: 0 });
  t.add({ x: 400, y: -1, m: 0 });
  t.jumps.push({ kind: "double", lipX: 20, landX: 30 });
  return t;
}
function run(r: Rider, track: Track, actions: (r: Rider) => Actions, seconds: number, until?: (r: Rider) => boolean) {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * T.simHz && !until?.(r); i++) events.push(...step(r, actions(r), track, dt));
  return events;
}
const riding = (x: number, v: number) => Object.assign(createRider(), { x, v });
const flying = (over: Track, init: Partial<Rider>) => Object.assign(createRider(), { state: "air", x: 0, y: over.heightAt(0) + 0.001, ...init } as Partial<Rider>);
test("crossing a lip launches along the lip angle", () => {
  const t = kicker(),
    r = riding(15, 12),
    events = run(r, t, () => NO_ACTIONS, 2, (r) => r.state === "air");
  assert.equal(r.state, "air");
  assert.ok(events.some((e) => e.type === "takeoff"));
  assert.equal(r.x, 20);
  assert.ok(Math.abs(r.vy - r.vx * 0.7 - T.autoPop) < 0.05, `lift ${r.vy - r.vx * 0.7}`);
});
test("releasing pump in the perfect window pops hard", () => {
  const t = kicker(),
    r = riding(15, 12),
    events = run(r, t, (r) => ({ ...NO_ACTIONS, pump: 20 - r.x > 0.2 }), 2, (r) => r.state === "air");
  assert.deepEqual(events.find((e) => e.type === "pop"), { type: "pop", perfect: true });
  assert.ok(r.vy - r.vx * 0.7 > T.popBoost + T.perfectPopBonus - 0.3, `pop added ${r.vy - r.vx * 0.7}`);
});
test("releasing before the window does nothing", () => {
  const t = kicker(),
    r = riding(15, 12),
    events = run(r, t, (r) => ({ ...NO_ACTIONS, pump: 20 - r.x > 6 }), 2, (r) => r.state === "air");
  assert.ok(!events.some((e) => e.type === "pop"));
  assert.ok(Math.abs(r.vy - r.vx * 0.7 - T.autoPop) < 0.05, "only the automatic pop");
});
test("the pop window is measured in time, so it is as wide at speed", () => {
  const t = kicker(),
    r = riding(15, 12),
    // Release ~0.25 s before the lip: outside the old 1.2 m window at this speed, inside the 0.3 s one.
    events = run(r, t, (r) => ({ ...NO_ACTIONS, pump: (20 - r.x) / r.v > 0.25 }), 2, (r) => r.state === "air");
  assert.deepEqual(events.find((e) => e.type === "pop"), { type: "pop", perfect: false });
});
test("letting go just after leaving the lip still pops", () => {
  const t = kicker(),
    r = riding(15, 12);
  run(r, t, () => ({ ...NO_ACTIONS, pump: true }), 2, (r) => r.state === "air");
  const vy = r.vy,
    held = run(r, t, () => ({ ...NO_ACTIONS, pump: true }), 0.05),
    late = run(r, t, () => NO_ACTIONS, 0.02);
  assert.equal(held.length, 0);
  assert.deepEqual(late[0], { type: "pop", perfect: false });
  assert.ok(r.vy > vy - T.airGravity * 0.08 + T.popBoost - T.autoPop - 0.2, `vy ${r.vy} from ${vy}`);
});
test("the late-pop grace runs out", () => {
  const t = kicker(),
    r = riding(15, 12);
  run(r, t, () => ({ ...NO_ACTIONS, pump: true }), 2, (r) => r.state === "air");
  run(r, t, () => ({ ...NO_ACTIONS, pump: true }), T.latePop + 0.05);
  assert.ok(!run(r, t, () => NO_ACTIONS, 0.05).some((e) => e.type === "pop"));
});
test("too slow to launch rolls over the lip", () => {
  const t = kicker(),
    r = riding(19.99, 2.5);
  step(r, NO_ACTIONS, t, dt);
  assert.equal(r.state, "riding");
});
test("flight is ballistic under airGravity", () => {
  const t = line(0),
    r = flying(t, { y: 100, vx: 10, vy: 0 });
  run(r, t, () => NO_ACTIONS, 0.5);
  assert.ok(Math.abs(r.vy + T.airGravity * 0.5) < 0.1);
  assert.ok(Math.abs(r.x - 5) < 0.1);
});
test("holding back spin completes a backflip and reports it", () => {
  const t = line(0),
    r = flying(t, { y: 100, vx: 5 }),
    events = run(r, t, () => ({ ...NO_ACTIONS, spin: -1 }), 1.2);
  assert.ok(r.spun > TAU - T.flipTolerance);
  assert.deepEqual(events.find((e) => e.type === "flip"), { type: "flip", dir: "back", total: 1 });
});
test("a slightly short rotation still counts as a flip", () => {
  const t = line(0),
    r = flying(t, { y: 100, vx: 5, spun: TAU - 0.3 }),
    events = run(r, t, () => NO_ACTIONS, dt);
  assert.equal(r.flips, 1);
  assert.equal(events[0]?.type, "flip");
});
test("a held grab locks rotation and banks time once fully in", () => {
  const t = line(0),
    r = flying(t, { y: 100, vx: 5, pitch: 0.3 });
  run(r, t, () => ({ spin: -1, pump: false, grab: [true, false, false] }), 0.5);
  assert.equal(r.pitch, 0.3);
  assert.ok(Math.abs(r.grabTime[0] - (0.5 - T.grabBlend)) < 0.02);
});
test("with no input the bike eases toward its flight path", () => {
  const t = line(0),
    r = flying(t, { y: 100, vx: 10, vy: 0, pitch: 0.8 });
  run(r, t, () => NO_ACTIONS, 0.3);
  assert.ok(r.pitch < 0.8 - 0.6, `pitch ${r.pitch}`);
});
/** Drops a rider 1 mm above a straight slope, moving along it at 10 m/s, with the bike offset from the surface angle. */
function touchdown(slope: number, offset: number, init: Partial<Rider> = {}, actions: Actions = NO_ACTIONS) {
  const t = line(slope),
    a = Math.atan(slope),
    r = flying(t, { vx: 10 * Math.cos(a), vy: 10 * Math.sin(a), pitch: a + offset, ...init }),
    events = run(r, t, () => actions, 0.1, (r) => r.state !== "air");
  return { r, events, land: events.find((e) => e.type === "land"), bail: events.find((e) => e.type === "bail") };
}
test("landing grades follow the angle error, and PERFECT needs a downslope", () => {
  const perfect = touchdown(-0.5, 0);
  assert.equal(perfect.land?.type === "land" && perfect.land.grade, "perfect");
  assert.ok(Math.abs(perfect.r.v - 13) < 0.2);
  assert.equal((touchdown(0, 0).land as { grade: string } | undefined)?.grade, "buttery");
  const grade = (o: number) => (touchdown(-0.5, o * deg).land as { grade: string } | undefined)?.grade;
  assert.equal(grade(17), "buttery");
  assert.equal(grade(28), "clean");
  assert.equal(grade(45), "sketchy");
  const sketchy = touchdown(-0.5, 45 * deg);
  assert.equal(sketchy.r.wobble, T.wobbleSeconds);
  assert.ok(Math.abs(sketchy.r.v - 7) < 0.2);
  assert.equal(sketchy.r.state, "riding");
});
test("bails: sideways, huck to flat, casing an upslope", () => {
  assert.deepEqual(touchdown(-0.5, 70 * deg).bail, { type: "bail", reason: "sideways" });
  assert.deepEqual(touchdown(0, 0, { vx: 8, vy: -20 }).bail, { type: "bail", reason: "huck" });
  const up = Math.atan(0.3);
  assert.deepEqual(touchdown(0.3, 0, { vx: 8, vy: -19, pitch: up }).bail, { type: "bail", reason: "cased" });
  assert.equal(touchdown(0, 0, { vx: 8, vy: -20 }).r.state, "bailed");
});
test("forgiving: a hard-ish flat landing or one still mid-grab is only sketchy", () => {
  assert.equal(touchdown(0, 0, { vx: 8, vy: -14 }).r.state, "riding");
  const grabbing = touchdown(-0.5, 0, { grabBlend: 0.5 }, { ...NO_ACTIONS, grab: [true, false, false] });
  assert.equal(grabbing.bail, undefined);
  assert.equal((grabbing.land as { grade: string } | undefined)?.grade, "sketchy");
  assert.equal(grabbing.r.grabBlend, 0);
});
test("landing reports the air's tricks", () => {
  const { land } = touchdown(-0.5, 0, { flips: 1, spun: TAU, grabTime: [0.5, 0, 0.1] });
  assert.deepEqual(land && land.type === "land" && land.tricks, [
    { kind: "flip", dir: "back", n: 1 },
    { kind: "grab", grab: 0, seconds: 0.5, releasedAt: NaN },
  ]);
});
test("Flow raises the speed cap pumping can reach", () => {
  // Steep enough that pumping could exceed the raised cap, shallow enough that gravity alone can't.
  const down = line(-0.15),
    r = Object.assign(createRider(), { x: -900, v: 20, flow: 5 });
  run(r, down, () => ({ ...NO_ACTIONS, pump: true }), 40);
  assert.ok(Math.abs(r.v - (T.maxSpeed + 5 * T.flowSpeed)) < 0.01, `v ${r.v}`);
});
test("landing reports apex time and when each grab was let go", () => {
  const t = line(0),
    r = flying(t, { vx: 10, vy: 5 }),
    events = run(r, t, (r) => ({ ...NO_ACTIONS, grab: [false, false, r.airTime < 0.45] }), 3, (r) => r.state !== "air"),
    land = events.find((e) => e.type === "land");
  assert.ok(land && land.type === "land");
  assert.ok(Math.abs(land.apexTime - 5 / T.airGravity) < 0.02, `apex ${land.apexTime}`);
  const nh = land.tricks.find((k) => k.kind === "grab" && k.grab === 2);
  assert.ok(nh && nh.kind === "grab" && Math.abs(nh.releasedAt - 0.45) < 0.02);
});
