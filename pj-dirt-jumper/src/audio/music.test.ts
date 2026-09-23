import { test } from "node:test";
import assert from "node:assert/strict";
import { FORM_BARS, SETLIST_STYLES, STYLES, Setlist, degreeHz, sectionAt } from "./music";
test("every style's drum patterns are one bar of sixteenths", () => {
  for (const [name, s] of Object.entries(STYLES)) for (const p of [s.kick, s.snare, s.hat]) assert.match(p, /^[xo.]{16}$/, name);
});
test("the setlist plays every style before repeating, never the same one twice running", () => {
  const list = new Setlist(7),
    songs = Array.from({ length: SETLIST_STYLES.length * 5 }, () => list.next());
  for (let i = 0; i < songs.length; i += SETLIST_STYLES.length)
    assert.equal(new Set(songs.slice(i, i + SETLIST_STYLES.length).map((s) => s.style)).size, SETLIST_STYLES.length);
  for (let i = 1; i < songs.length; i++) assert.notEqual(songs[i].style, songs[i - 1].style);
  assert.ok(!songs.some((s) => s.style === "hyperspace"), "hyperspace is only for the rocket");
});
test("songs vary: keys, progressions and melodies", () => {
  const list = new Setlist(3),
    songs = Array.from({ length: 12 }, () => list.next());
  assert.ok(new Set(songs.map((s) => s.key)).size > 1);
  assert.ok(new Set(songs.map((s) => s.motif.join())).size > 6);
  assert.equal(new Set(songs.map((s) => s.title)).size, songs.length, "no title repeats within a dozen songs");
  for (const s of songs) assert.ok(STYLES[s.style].progressions.includes(s.progression));
});
test("same seed, same setlist", () => {
  const a = new Setlist(11),
    b = new Setlist(11);
  for (let i = 0; i < 10; i++) assert.deepEqual(a.next(), b.next());
});
test("songs run intro, verses, choruses and a breakdown, with fills ending phrases", () => {
  assert.equal(FORM_BARS, 48);
  assert.equal(sectionAt(0).kind, "intro");
  assert.equal(sectionAt(4).kind, "verse");
  assert.ok(sectionAt(4).first);
  assert.equal(sectionAt(12).kind, "chorus");
  assert.equal(sectionAt(36).kind, "break");
  assert.ok(sectionAt(3).fill && sectionAt(7).fill && !sectionAt(5).fill);
});
test("scale degrees climb octaves", () => {
  assert.equal(degreeHz(100, [0, 3, 5, 7, 10], 5), 200);
  assert.ok(Math.abs(degreeHz(100, [0, 3, 5, 7, 10], 1) - 100 * Math.pow(2, 3 / 12)) < 1e-9);
});
