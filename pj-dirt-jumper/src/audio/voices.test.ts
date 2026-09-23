import { test } from "node:test";
import assert from "node:assert/strict";
import { castVoices } from "./voices";
const v = (name: string, lang: string) => ({ name, lang });
test("narrator, Dad and Wade get different voices, Wade a British one", () => {
  const voices = [v("Samantha", "en-US"), v("Fred", "en-US"), v("Daniel", "en-GB"), v("Thomas", "fr-FR"), v("Bubbles", "en-US")];
  const cast = castVoices(voices);
  assert.equal(cast.narrator?.name, "Samantha");
  assert.equal(cast.dad?.name, "Fred");
  assert.equal(cast.wade?.name, "Daniel");
});
test("works with Linux speech-dispatcher style names", () => {
  const cast = castVoices([v("English (America)", "en-US"), v("English (Great Britain)", "en-GB"), v("English (Scotland)", "en-GB-scotland")]);
  assert.equal(cast.wade?.name, "English (Great Britain)");
  assert.notEqual(cast.dad, cast.narrator);
});
test("never casts novelty voices, and copes with a single voice", () => {
  assert.notEqual(castVoices([v("Bubbles", "en-US"), v("Karen", "en-AU")]).narrator?.name, "Bubbles");
  const one = castVoices([v("Only", "en-US")]);
  assert.equal(one.narrator?.name, "Only");
  assert.equal(one.dad?.name, "Only");
  assert.deepEqual(castVoices([]), { narrator: undefined, dad: undefined, wade: undefined });
});
