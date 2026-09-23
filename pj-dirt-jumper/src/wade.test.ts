import { test } from "node:test";
import assert from "node:assert/strict";
import { WADE_QUOTES, wadeQuote } from "./wade";
test("Wade works through every quote before repeating", () => {
  const seen = new Set(Array.from({ length: WADE_QUOTES.length }, (_, i) => wadeQuote(i).text));
  assert.equal(seen.size, WADE_QUOTES.length);
  assert.equal(wadeQuote(WADE_QUOTES.length), wadeQuote(0));
  assert.equal(wadeQuote(NaN), wadeQuote(0));
});
test("every quote is credited to its book", () => {
  for (const q of WADE_QUOTES) assert.match(q.book, /^(How to Think Like a Fish|River Monsters)/);
});
