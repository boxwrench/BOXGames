import { mulberry32 } from "../rng";
import { T } from "../tuning";
export type OmenKind = "bobberMoon" | "proudBluegill" | "fishRain" | "landTrout" | "bassGod" | "lakeSky" | "giantHook" | "tackleBox" | "wormRapture" | "bassSon";
export interface OmenSpec {
  kind: OmenKind;
  /** Seconds the omen (and its buff) lasts. */
  duration: number;
  /** Score multiplier while active (1 = none). */
  mult: number;
  /** One-off points on arrival. */
  bonus: number;
  title: string;
  line: string;
}
/** In escalation order: the first run through a deep line meets them one by one. */
export const OMENS: readonly OmenSpec[] = [
  { kind: "bobberMoon", duration: 40, mult: 1, bonus: 0, title: "BOBBER MOON", line: "The moon is a bobber now. Don't think about it." },
  { kind: "proudBluegill", duration: 6, mult: 1, bonus: 2000, title: "FATHERLY APPROVAL", line: "I'm proud of you, son." },
  { kind: "fishRain", duration: 12, mult: 1, bonus: 0, title: "IT'S RAINING BAIT", line: "Catch 'em with your face!" },
  { kind: "landTrout", duration: 14, mult: 1.5, bonus: 0, title: "LAND TROUT SIGHTED", line: "Something huge is swimming through the hills. ×1.5" },
  { kind: "bassGod", duration: 20, mult: 2, bonus: 5000, title: "THE BASS GOD IS PLEASED", line: "DIVINE BITE — ×2 SCORE" },
  { kind: "lakeSky", duration: 16, mult: 1.5, bonus: 0, title: "THE SKY IS A LAKE", line: "Breathe normally. Probably. ×1.5" },
  { kind: "giantHook", duration: 10, mult: 2, bonus: 3000, title: "DON'T TAKE THE BAIT", line: "Something up there is fishing for YOU. ×2" },
  { kind: "tackleBox", duration: 14, mult: 1.5, bonus: 0, title: "THE TACKLE BOX OPENS", line: "The lures are migrating. Snag one! ×1.5" },
  { kind: "wormRapture", duration: 14, mult: 1.5, bonus: 2500, title: "WORM RAPTURE", line: "The ground is wriggling. The worms are ascending. ×1.5" },
  { kind: "bassSon", duration: 20, mult: 2.5, bonus: 6000, title: "THE BASS GOD HAS A SON", line: "HOLY FAMILY — ×2.5 SCORE" },
];
const SCHEDULE = [300, 600, 1000, 1500, 2000, 2600, 3300, 4000];
/** Distance of milestone i (0-based): the schedule, then every 800 m. */
export const milestone = (i: number) => (i < SCHEDULE.length ? SCHEDULE[i] : SCHEDULE.at(-1)! + 800 * (i - SCHEDULE.length + 1));
export interface Milestone {
  /** 1-based milestone number. */
  index: number;
  distance: number;
  bonus: number;
  omen: OmenSpec;
}
/** Decides when the run gets weirder: depth milestones, the omen each one summons, and the score buffs they grant. */
export class Director {
  depth = 0;
  private rand: () => number;
  private last?: OmenKind;
  private buffs: { kind: OmenKind; left: number; mult: number }[] = [];
  constructor(seed: number) {
    this.rand = mulberry32(seed ^ 0x0b1e9111);
  }
  get depthMult() {
    return Math.min(T.depthMultMax, 1 + T.depthMultStep * this.depth);
  }
  get buffMult() {
    return this.buffs.reduce((m, b) => m * b.mult, 1);
  }
  /** Everything multiplying air points right now. */
  get mult() {
    return this.depthMult * this.buffMult;
  }
  get nextAt() {
    return milestone(this.depth);
  }
  /** Seconds left on an omen's buff (0 when not active). */
  active(kind: OmenKind) {
    return this.buffs.find((b) => b.kind === kind)?.left ?? 0;
  }
  /** Call with the run's distance; returns at most one milestone per call. */
  update(distance: number): Milestone | undefined {
    const at = milestone(this.depth);
    if (distance < at) return undefined;
    const omen = this.depth < OMENS.length ? OMENS[this.depth] : this.pick();
    this.depth++;
    this.last = omen.kind;
    if (omen.mult !== 1) this.buffs.push({ kind: omen.kind, left: omen.duration, mult: omen.mult });
    return { index: this.depth, distance: at, bonus: T.milestoneBonus * this.depth + omen.bonus, omen };
  }
  tick(dt: number) {
    for (const b of this.buffs) b.left -= dt;
    this.buffs = this.buffs.filter((b) => b.left > 0);
  }
  private pick() {
    const pool = OMENS.filter((o) => o.kind !== this.last);
    return pool[Math.floor(this.rand() * pool.length)];
  }
}
