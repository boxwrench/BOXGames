import { test } from "node:test";
import assert from "node:assert/strict";
import { Director, OMENS, milestone } from "./director";
import { T } from "../tuning";
test("milestones follow the schedule, then every 800 m", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(milestone), [300, 600, 1000, 1500, 2000, 2600, 3300, 4000, 4800, 5600]);
});
test("one milestone per update, with a growing bonus and depth multiplier", () => {
  const d = new Director(1);
  assert.equal(d.update(299), undefined);
  const first = d.update(5000)!;
  assert.equal(first.index, 1);
  assert.equal(first.bonus, T.milestoneBonus + first.omen.bonus);
  assert.equal(d.depthMult, 1 + T.depthMultStep);
  const second = d.update(5000)!;
  assert.equal(second.index, 2);
  assert.equal(second.bonus, 2 * T.milestoneBonus + second.omen.bonus);
});
test("the first omens escalate in order, then repeats never happen back to back", () => {
  const d = new Director(7),
    kinds: string[] = [];
  for (let i = 0; i < 40; i++) kinds.push(d.update(1e9)!.omen.kind);
  assert.deepEqual(kinds.slice(0, OMENS.length), OMENS.map((o) => o.kind));
  for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1]);
});
test("the depth multiplier caps", () => {
  const d = new Director(3);
  for (let i = 0; i < 50; i++) d.update(1e9);
  assert.equal(d.depthMult, T.depthMultMax);
});
test("omen buffs multiply in and run out", () => {
  const d = new Director(1);
  let god;
  while (!god) {
    const m = d.update(1e9)!;
    if (m.omen.kind === "bassGod") god = m.omen;
  }
  assert.ok(d.buffMult >= god.mult);
  assert.ok(d.active("bassGod") > 0);
  d.tick(god.duration + 0.1);
  assert.equal(d.active("bassGod"), 0);
  assert.equal(d.buffMult, 1);
  assert.equal(d.mult, d.depthMult);
});
test("same seed, same omens", () => {
  const a = new Director(99),
    b = new Director(99);
  for (let i = 0; i < 20; i++) assert.equal(a.update(1e9)!.omen.kind, b.update(1e9)!.omen.kind);
});
