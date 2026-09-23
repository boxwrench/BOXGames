export type LineKey = "pop" | "perfectPop" | "small" | "big" | "huge" | "sketchy" | "cased" | "huck" | "sideways" | "grab" | "stalled" | "flowUp" | "onFire" | "newBest";
/** PJ's commentary (spec §8): sendy, fishy, no swearing. */
export const LINES: Record<LineKey, readonly string[]> = {
  pop: ["Popped!", "Up and out!", "Boost!"],
  perfectPop: ["PERFECT POP!", "SNAP!", "Popped like a bobber!"],
  small: ["Sendy!", "Steezy.", "Clean.", "Nice cast.", "Smooth.", "Tidy."],
  big: ["FULL SENDER!", "That's a keeper!", "Hooked it!", "Certified steez!", "Big air, big bait!"],
  huge: ["ABSOLUTE LUNKER!", "TROPHY CATCH!", "SEND OF THE CENTURY!", "WALL-MOUNT WORTHY!", "Call Fish & Game!"],
  sketchy: ["Sketchy…", "Wobbly worm.", "Almost threw that one back."],
  cased: ["Cased it.", "Snagged the knuckle.", "Came up short, bro."],
  huck: ["Huck to flat, bro.", "Flat-landed. Ouch.", "Spine compression unlocked."],
  sideways: ["YARD SALE!", "Landed sideways.", "Line snapped!"],
  grab: ["Forgot to let go.", "Still holding the grab!", "Hands full, bro."],
  stalled: ["Skunked.", "Zero bites.", "Ran outta line.", "Dead in the water."],
  flowUp: ["Flow rising!", "In the zone!", "Feeling it!"],
  onFire: ["ON FIRE!", "BIG FISH ENERGY!", "MAXIMUM SEND!"],
  newBest: ["NEW PERSONAL BEST!", "RECORD CATCH!"],
};
export const landKey = (points: number) => (points >= 5000 ? "huge" : points >= 1500 ? "big" : "small");
export class Lines {
  private last = new Map<LineKey, number>();
  constructor(private rand: () => number = Math.random) {}
  pick(key: LineKey) {
    const list = LINES[key],
      prev = this.last.get(key);
    let i = Math.floor(this.rand() * list.length);
    if (i === prev) i = (i + 1 + Math.floor(this.rand() * (list.length - 1))) % list.length;
    this.last.set(key, i);
    return list[i];
  }
}
