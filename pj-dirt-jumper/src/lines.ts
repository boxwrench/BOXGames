// PJ's commentary (spec §8 + deep-water addendum): sendy, fishy, increasingly unhinged, never sweary.
export type LineKey =
  | "pop"
  | "perfectPop"
  | "send"
  | "small"
  | "big"
  | "huge"
  | "perfect"
  | "buttery"
  | "clean"
  | "sketchy"
  | "grabLand"
  | "cased"
  | "huck"
  | "sideways"
  | "stalled"
  | "flowUp"
  | "onFire"
  | "newBest"
  | "hang"
  | "speed"
  | "streak"
  | "chatter"
  | "milestone";
export const LINES: Record<LineKey, readonly string[]> = {
  pop: ["Popped!", "Up and out!", "Boost!", "Hop!", "Liftoff!", "Boing!", "Snap!"],
  perfectPop: ["PERFECT POP!", "SNAP!", "Popped like a bobber!", "CRISP POP!", "TEXTBOOK!", "POP GOES THE PJ!", "SPRING-LOADED!"],
  send: ["SEND IT!", "FULL SEND!", "HUCK IT!", "YEET!", "SEND THE BAIT!", "GO GO GO!", "AIRMAIL!", "CLEARED FOR TAKEOFF!", "BYE BYE GRAVITY!", "LAUNCH CODES ACCEPTED!"],
  small: ["SENDY!", "STEEZY!", "NICE CAST!", "SMOOTH!", "DIALED!", "CLEAN!", "TIDY!", "SMOOTH OPERATOR!", "NIBBLE!", "SWEET!", "CRISP!", "EASY PEASY!"],
  big: [
    "FULL SENDER!",
    "THAT'S A KEEPER!",
    "HOOKED IT!",
    "CERTIFIED STEEZ!",
    "BIG AIR, BIG BAIT!",
    "NASTY!",
    "FILTHY!",
    "RIPPER!",
    "SET THE HOOK!",
    "FISH ON!",
    "REEL IT IN!",
    "ABSOLUTE UNIT!",
    "YOU LOVE TO SEE IT!",
  ],
  huge: [
    "ABSOLUTE LUNKER!",
    "TROPHY CATCH!",
    "SEND OF THE CENTURY!",
    "WALL-MOUNT WORTHY!",
    "CALL FISH & GAME!",
    "UNREAL!",
    "LEGENDARY!",
    "STATE RECORD!",
    "THEY'LL WRITE SONGS!",
    "GET THE TAXIDERMIST!",
    "HALL OF FAME!",
    "PHYSICS IS CRYING!",
    "SOMEBODY CLIP THAT!",
  ],
  perfect: ["BUTTERED!", "BUTTERY SMOOTH!", "GREASED IT!", "SILK!", "PERFECTION!", "NO NOTES!", "CHEF'S KISS!"],
  buttery: ["Buttery.", "Smooth.", "Slick.", "Nice.", "Soft landing."],
  clean: ["Clean.", "Tidy.", "Solid.", "Got it.", "Stuck it."],
  sketchy: ["Sketchy…", "Wobbly worm.", "Almost threw that one back.", "Yikes.", "Spicy landing!", "Saved it!", "Rode it out!", "Wobble wobble.", "Heart rate: yes."],
  grabLand: ["Hands full, bro.", "Forgot to let go!", "Grabbed the landing too.", "Still holding on!", "Death grip!"],
  cased: ["Cased it.", "Snagged the knuckle.", "Came up short, bro.", "Knuckle sandwich.", "Too short, too bad.", "Bottomed out!"],
  huck: ["Huck to flat, bro.", "Flat-landed. Ouch.", "Spine compression unlocked.", "Pancaked!", "Flat as a flounder!", "That'll leave a mark."],
  sideways: ["YARD SALE!", "Landed sideways.", "Line snapped!", "Wrong way up!", "EJECT!", "Upside-down bass!", "Tangled line!"],
  stalled: ["Skunked.", "Zero bites.", "Ran outta line.", "Dead in the water.", "Out of gas.", "Motor's off.", "Stuck in the weeds."],
  flowUp: ["Flow rising!", "In the zone!", "Feeling it!", "Warming up!", "Locked in!", "Groove found!"],
  onFire: ["ON FIRE!", "BIG FISH ENERGY!", "MAXIMUM SEND!", "UNSTOPPABLE!", "HOT ROD!", "SPICY MODE!", "RED HOT BAIT!"],
  newBest: ["NEW PERSONAL BEST!", "RECORD CATCH!", "NEW PB!", "BEST ONE YET!"],
  hang: ["HANG TIME!", "FREQUENT FLYER!", "DID YOU PACK A LUNCH?", "AIRLINE MILES!", "STILL UP THERE!", "SPACE PROGRAM!", "WINGS UNLOCKED!"],
  speed: ["Speed wobbles? Never heard of 'em.", "Ludicrous speed!", "Warp drive engaged!", "Brakes are for trout.", "Too fast to fish!", "Zoom zoom!", "The wind is scared of you."],
  streak: ["{n} PERFECTS IN A ROW!", "BUTTER FACTORY ×{n}!", "{n} STRAIGHT! DIALED!", "COMBO KING ×{n}!", "{n} IN A ROW! SHEESH!"],
  chatter: [
    "Gonna fish that pond later.",
    "Is that a heron?",
    "Mom said be home by dark.",
    "Pumping is basically cardio.",
    "This helmet smells like lake.",
    "Note to self: buy more worms.",
    "Dirt tastes like victory.",
    "My lure keychain is so hyped.",
    "Grandpa would be proud. Probably.",
    "I think I left the tackle box open.",
    "Wind in my face, bugs in my teeth.",
    "Rollers are just waves you can ride.",
    "Somebody please be filming this.",
    "Pump the backs, pop the lips. Easy.",
    "Tire pressure: vibes.",
  ],
  milestone: ["Deeper water!", "The lake is calling.", "Going deep!", "Further than the bait shop!", "Uncharted dirt!"],
};
/** Extra lines that join a pool once the run is deep enough: weirder the further you go. */
const DEEP: Partial<Record<LineKey, readonly (readonly string[])[]>> = {
  chatter: [
    ["The fish are watching.", "Did that cloud just wink?", "The trees are whispering about bait.", "I can hear the lake breathing."],
    ["I am one with the bass.", "My blood type is lake water.", "The bobber moon knows my name.", "Gravity is just a suggestion now."],
    ["I have seen the Bass God. It saw me back.", "Time is a flat lake.", "What if the dirt is fishing for ME?", "I haven't blinked in 3 kilometres."],
  ],
  huge: [
    ["THE LAKE APPROVES!", "THE FISH ARE CHANTING!"],
    ["ASCENDED!", "THE BLUEGILL WEEPS WITH JOY!"],
    ["YOU HAVE BECOME THE BAIT!", "REALITY SNAPPED ITS LINE!"],
  ],
  big: [["The fish are impressed.", "SCALES OF APPROVAL!"], ["BASS-ICALLY LEGENDARY!", "THE HOOK FEARS YOU!"]],
  sideways: [["The lake wanted you back."], ["Returned to the water. Spiritually."]],
  milestone: [["The fish have noticed you."], ["Past the point of no return(ing fish)."], ["Here there be lunkers."]],
};
/** How many depth milestones unlock each DEEP tier. */
const DEEP_AT = [2, 4, 6];
/** Headlines for the named combos (spec §5.4). */
export const COMBO_LINES: Record<string, readonly string[]> = {
  "Bluegill Backflip": ["PANFISH PARTY!", "SUNFISH SPIN!", "BLUEGILL BLESSED!", "FLIP-FLOP FISH!"],
  "Largemouth Tailwhip": ["BUCKETMOUTH WHIP!", "BIG MOUTH, BIG WHIP!", "LUNKER WHIP!", "WHIPPED LIKE A CAST!"],
  "The Double Hookset": ["DOUBLE HOOKSET!", "SET IT TWICE!", "HOOKED, THEN HOOKED AGAIN!", "TWO FOR ONE!"],
  "Lunker Loop": ["LUNKER LOOP!", "THREE-PEAT!", "TRIPLE THREAT!", "LOOP DE LOOP DE LOOP!"],
  "Full Tackle Box": ["FULL TACKLE BOX!", "EVERY LURE IN THE BOX!", "GRAB BAG!", "ALL THE GEAR, ALL THE IDEAS!"],
  "Catch-and-Release": ["CATCH AND RELEASE!", "LET IT GO!", "RESPECT THE FISH!", "RELEASED AT THE TOP!"],
};
export const landKey = (points: number) => (points >= 5000 ? "huge" : points >= 1500 ? "big" : "small");
export class Lines {
  private last = new Map<string, string>();
  constructor(private rand: () => number = Math.random) {}
  /** The pool for a key at a given depth (milestones reached). */
  static pool(key: LineKey, depth = 0) {
    const extra = (DEEP[key] ?? []).filter((_, tier) => depth >= DEEP_AT[tier]).flat();
    return [...LINES[key], ...extra];
  }
  /** A random line, never the same twice in a row for a key; {n} is filled from vars. */
  pick(key: LineKey, depth = 0, vars: Record<string, string | number> = {}) {
    return this.fill(this.choose(key, Lines.pool(key, depth)), vars);
  }
  /** A headline for a named combo, or undefined when the combo has none. */
  combo(name: string) {
    const list = COMBO_LINES[name];
    return list ? this.choose(`combo:${name}`, list) : undefined;
  }
  private choose(id: string, list: readonly string[]) {
    const prev = this.last.get(id);
    let line = list[Math.floor(this.rand() * list.length)];
    if (line === prev && list.length > 1) line = list[(list.indexOf(line) + 1 + Math.floor(this.rand() * (list.length - 1))) % list.length];
    this.last.set(id, line);
    return line;
  }
  private fill(line: string, vars: Record<string, string | number>) {
    return line.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  }
}
