import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "./rng";
test("same seed gives the same sequence; values stay in [0, 1)", () => {
  const a = mulberry32(20260922),
    b = mulberry32(20260922),
    seq = Array.from({ length: 200 }, () => a());
  assert.deepEqual(seq, Array.from({ length: 200 }, () => b()));
  assert.ok(seq.every((n) => n >= 0 && n < 1));
});
test("different seeds diverge", () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});
