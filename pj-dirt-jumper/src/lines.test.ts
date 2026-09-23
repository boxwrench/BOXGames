import { test } from "node:test";
import assert from "node:assert/strict";
import { COMBO_LINES, LINES, Lines, landKey, type LineKey } from "./lines";
import { comboName } from "./score/score";
const CLEAN = (line: string) => !/\b(damn|hell|crap|sh[i1]t|f[u*]ck|ass|bitch)\b/i.test(line);
test("every line key has plenty of clean lines", () => {
  for (const [key, list] of Object.entries(LINES)) {
    assert.ok(list.length >= 4, `${key} has only ${list.length}`);
    for (const line of list) assert.ok(line.trim().length > 0 && CLEAN(line), line);
  }
  for (const key of Object.keys(LINES) as LineKey[]) for (const line of Lines.pool(key, 99)) assert.ok(CLEAN(line), line);
});
test("pick never repeats the same line twice in a row", () => {
  const l = new Lines();
  let prev = "";
  for (let i = 0; i < 200; i++) {
    const s = l.pick("huge");
    assert.notEqual(s, prev);
    prev = s;
  }
});
test("deeper runs unlock weirder lines, and only then", () => {
  const shallow = new Set(Lines.pool("chatter", 0)),
    deep = Lines.pool("chatter", 6);
  assert.ok(deep.length > shallow.size);
  assert.ok(deep.includes("The fish are watching."));
  assert.ok(!shallow.has("The fish are watching."));
  assert.ok(!Lines.pool("chatter", 3).includes("Time is a flat lake."));
});
test("templates fill in", () => {
  const l = new Lines(() => 0);
  assert.equal(l.pick("streak", 0, { n: 4 }), "4 PERFECTS IN A ROW!");
});
test("every named combo has its own headlines", () => {
  const flip = (n: number, dir: "back" | "front" = "back") => ({ kind: "flip" as const, dir, n }),
    grab = (g: number, releasedAt = NaN) => ({ kind: "grab" as const, grab: g, seconds: 0.5, releasedAt });
  const names = [
    comboName([grab(0), grab(1), grab(2)], 1),
    comboName([flip(3)], 1),
    comboName([flip(2)], 1),
    comboName([flip(1), grab(1)], 1),
    comboName([flip(1), grab(0)], 1),
    comboName([grab(2, 1)], 1),
  ];
  for (const name of names) {
    assert.ok(name && COMBO_LINES[name]?.length >= 3, `${name} needs headlines`);
    assert.ok(new Lines().combo(name!));
  }
});
test("landing lines scale with points", () => {
  assert.equal(landKey(300), "small");
  assert.equal(landKey(2000), "big");
  assert.equal(landKey(9000), "huge");
});
