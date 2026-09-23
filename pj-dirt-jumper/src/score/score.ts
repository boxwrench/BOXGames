import type { Grade, SimEvent, Trick } from "../sim/rider";
import { T } from "../tuning";
export const GRAB_NAMES = ["Superman", "Tailwhip", "No-Hander"] as const;
const FLIP_WORDS = ["", "", "Double ", "Triple ", "Quad "];
export const flipName = (dir: "back" | "front", n: number) => `${FLIP_WORDS[Math.min(n, 4)]}${dir === "back" ? "Backflip" : "Frontflip"}`;
/** Spec §5.7: single 500, double 1,200, triple 2,000, then +1,000 per extra rotation. */
export const flipPoints = (n: number) => (n <= 0 ? 0 : n === 1 ? 500 : n === 2 ? 1200 : 2000 + (n - 3) * 1000);
const LAND_BONUS: Record<Grade, number> = { perfect: 1.5, buttery: 1.2, clean: 1, sketchy: 1 };
const FLOW_CHANGE: Record<Grade, number> = { perfect: 2, buttery: 1, clean: 0, sketchy: -1 };
type Grab = Extract<Trick, { kind: "grab" }>;
/** Fishing names for the combos in spec §5.4, most impressive first; undefined = list the tricks. */
export function comboName(tricks: Trick[], apexTime: number): string | undefined {
  const flip = tricks.find((t) => t.kind === "flip"),
    grabs = tricks.filter((t): t is Grab => t.kind === "grab"),
    has = (g: number) => grabs.some((t) => t.grab === g),
    noHander = grabs.find((t) => t.grab === 2);
  if (has(0) && has(1) && has(2)) return "Full Tackle Box";
  if (flip && flip.n >= 3) return "Lunker Loop";
  if (flip && flip.dir === "back" && flip.n === 2) return "The Double Hookset";
  if (flip && has(1)) return "Largemouth Tailwhip";
  if (flip && flip.dir === "back" && has(0)) return "Bluegill Backflip";
  if (noHander && Math.abs(noHander.releasedAt - apexTime) <= T.catchWindow) return "Catch-and-Release";
  return undefined;
}
export const trickNames = (tricks: Trick[]) => tricks.map((t) => (t.kind === "flip" ? flipName(t.dir, t.n) : GRAB_NAMES[t.grab]));
export interface AirScore {
  name: string;
  tricks: string[];
  base: number;
  multiplier: number;
  points: number;
  grade: Grade;
  flow: number;
  flowChange: number;
  airTime: number;
  perfectPop: boolean;
}
/** Run score (spec §5.6–5.7): distance plus banked air points, and the Flow meter. */
export class Score {
  distance = 0;
  airPoints = 0;
  flow = 0;
  /** Depth × omen multiplier applied to air points (set by the game from the director). */
  bonus = 1;
  best?: AirScore;
  bestAirTime = 0;
  private grounded = 0;
  private perfectPop = false;
  get total() {
    return Math.floor(this.distance) + this.airPoints;
  }
  handle(e: SimEvent): AirScore | undefined {
    if (e.type === "pop") this.perfectPop = e.perfect;
    if (e.type !== "land") return undefined;
    const base =
        e.tricks.reduce((sum, t) => sum + (t.kind === "flip" ? flipPoints(t.n) : Math.round(t.seconds * 10) * T.grabPointsPerTenth), 0) +
        (this.perfectPop ? T.perfectPopPoints : 0),
      multiplier = Math.max(1, e.tricks.length),
      points = Math.round(base * multiplier * (1 + T.flowScore * this.flow) * this.bonus * LAND_BONUS[e.grade] * (e.grade === "sketchy" ? 0.5 : 1)),
      before = this.flow;
    this.flow = Math.min(T.flowMax, Math.max(0, this.flow + FLOW_CHANGE[e.grade]));
    if (e.tricks.length) this.grounded = 0;
    this.airPoints += points;
    this.bestAirTime = Math.max(this.bestAirTime, e.airTime);
    const names = trickNames(e.tricks),
      result: AirScore = {
        name: comboName(e.tricks, e.apexTime) ?? names.join(" + "),
        tricks: names,
        base,
        multiplier,
        points,
        grade: e.grade,
        flow: this.flow,
        flowChange: this.flow - before,
        airTime: e.airTime,
        perfectPop: this.perfectPop,
      };
    this.perfectPop = false;
    if (points && (!this.best || points > this.best.points)) this.best = result;
    return result;
  }
  /** Points from outside the trick system: depth milestones, omen bonuses, fish caught. */
  award(points: number) {
    this.airPoints += Math.round(points);
  }
  /** Tracks distance and Flow decay; returns true when Flow just dropped a level. */
  tick(dt: number, grounded: boolean, distance: number) {
    this.distance = distance;
    if (!grounded) return false;
    this.grounded += dt;
    if (this.grounded < T.flowDecay) return false;
    this.grounded = 0;
    if (!this.flow) return false;
    this.flow--;
    return true;
  }
}
