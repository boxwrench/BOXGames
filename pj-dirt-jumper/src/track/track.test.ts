import { test } from "node:test";
import assert from "node:assert/strict";
import { Track } from "./track";
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
function sample() {
  const t = new Track();
  t.add({ x: 0, y: 0, m: 0 });
  t.add({ x: 4, y: 2, m: 0.5 });
  t.add({ x: 10, y: -1, m: 0 });
  return t;
}
test("passes through every knot with the knot's slope", () => {
  const t = sample();
  for (const k of t.knots) close(t.heightAt(k.x), k.y);
  for (const k of t.knots.slice(0, -1)) close(t.slopeAt(k.x), k.m);
});
test("slope matches the curve's finite difference (C¹ smooth)", () => {
  const t = sample(),
    e = 1e-5;
  for (let x = 0.1; x < 9.9; x += 0.7) close(t.slopeAt(x), (t.heightAt(x + e) - t.heightAt(x - e)) / (2 * e), 1e-5);
});
test("is flat outside its range", () => {
  const t = sample();
  close(t.heightAt(-5), 0);
  close(t.heightAt(50), -1);
  close(t.slopeAt(-5), 0);
  close(t.slopeAt(50), 0);
});
test("angleAt is the arctangent of the slope", () => {
  const t = sample();
  close(t.angleAt(2.5), Math.atan(t.slopeAt(2.5)));
});
test("rejects knots that don't move forward", () => {
  const t = sample();
  assert.throws(() => t.add({ x: 10, y: 0, m: 0 }));
  assert.equal(t.end, 10);
});
test("nextJump finds the first lip at or ahead of x", () => {
  const t = sample();
  t.jumps.push({ kind: "double", lipX: 3, landX: 5 }, { kind: "tabletop", lipX: 8, landX: 9 });
  assert.equal(t.nextJump(1)?.lipX, 3);
  assert.equal(t.nextJump(3)?.lipX, 3);
  assert.equal(t.nextJump(3.01)?.lipX, 8);
  assert.equal(t.nextJump(8.5), undefined);
});
