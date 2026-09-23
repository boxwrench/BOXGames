import { test } from "node:test";
import assert from "node:assert/strict";
import { LINES, Lines, landKey } from "./lines";
test("every line key has at least two clean lines", () => {
  for (const [key, list] of Object.entries(LINES)) {
    assert.ok(list.length >= 2, key);
    for (const line of list) assert.ok(line.trim().length > 0 && !/\b(damn|hell|crap|sh[i1]t|f[u*]ck|ass)\b/i.test(line), line);
  }
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
test("landing lines scale with points", () => {
  assert.equal(landKey(300), "small");
  assert.equal(landKey(2000), "big");
  assert.equal(landKey(9000), "huge");
});
