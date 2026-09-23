import { test } from "node:test";
import assert from "node:assert/strict";
import { sayable } from "./sound";
test("the voice says bass like the fish, not the guitar", () => {
  assert.equal(sayable("Behold. The bass god is pleased."), "Behold. The bas god is pleased.");
  assert.equal(sayable("BASS-ICALLY LEGENDARY!"), "bas-ICALLY LEGENDARY!");
  assert.equal(sayable("Upside-down Bass!"), "Upside-down bas!");
  assert.equal(sayable("Nice cast."), "Nice cast.");
});
