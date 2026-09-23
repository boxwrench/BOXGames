// Jeremy Wade drops in on the results screen of any run scoring T.wadeScore or more, with one of these quotes (supplied
// by the user, verbatim, credited to their books). He only ever says his own words: never invent lines for him.
const THINK = "How to Think Like a Fish: And Other Lessons from a Lifetime in Angling",
  MONSTERS = "River Monsters: True Stories of the Ones that Didn't Get Away";
export interface WadeQuote {
  text: string;
  book: string;
}
export const WADE_QUOTES: readonly WadeQuote[] = [
  { text: "It's necessary to experience some failure, to calibrate our appreciation of success.", book: THINK },
  { text: "Because, despite our differences, we shared one fundamental belief: that there is more to this world than what's visible on the surface.", book: MONSTERS },
  { text: "To a large extent we see what we want to see rather than what is really there.", book: MONSTERS },
  { text: "Casting a line into the water is like asking a question. Something could be right underneath you, but you can't see it—it's there but not there.", book: MONSTERS },
  { text: "…if just one crucial factor had been ignored. In this case the alternative story is summarized in just four words: No stealth no fish.", book: THINK },
  {
    text: "Once a myth becomes established, it forms part of our mental model of the world and alters our perception, the way our brains interpret the fleeting patterns our eyes pick up.",
    book: MONSTERS,
  },
];
/** The quote for the n-th Wade visit (n kept in storage): every quote once before any repeats. */
export const wadeQuote = (n: number) => {
  const i = Number.isFinite(n) ? Math.floor(n) % WADE_QUOTES.length : 0;
  return WADE_QUOTES[(i + WADE_QUOTES.length) % WADE_QUOTES.length];
};
