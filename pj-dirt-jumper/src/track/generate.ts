import { mulberry32 } from "../rng";
import { Track, type Jump, type JumpKind } from "./track";
import { tierAt } from "./tiers";
import { createRider, step, type Grade, type Rider } from "../sim/rider";
import { botActions } from "../sim/bot";
import { T } from "../tuning";
/** Knot relative to its section's start: [dx, y, slope]. */
type Point = [number, number, number];
type Range = readonly [number, number];
interface JumpSpec {
  /** Lip height above the trail baseline, m. */
  lip: Range;
  /** Takeoff angle, radians. */
  angle: Range;
  /** Landing deck height relative to the lip (negative = step-down, positive = step-up). */
  deck: Range;
  /** Pit bottom relative to the baseline; NaN = a table at deck height. */
  pit: number;
}
const JUMPS: Record<JumpKind, JumpSpec> = {
  tabletop: { lip: [1.2, 1.8], angle: [0.4, 0.5], deck: [-0.4, -0.3], pit: NaN },
  double: { lip: [1.2, 1.9], angle: [0.45, 0.58], deck: [-0.6, 0.4], pit: -0.6 },
  stepup: { lip: [1.0, 1.5], angle: [0.55, 0.65], deck: [0.6, 1.4], pit: -0.6 },
  stepdown: { lip: [1.2, 1.7], angle: [0.4, 0.5], deck: [-3.5, -2], pit: -1.5 },
  canyon: { lip: [1.7, 2.2], angle: [0.5, 0.6], deck: [-1.2, 0], pit: -7 },
  megahip: { lip: [1.9, 2.3], angle: [0.55, 0.65], deck: [-8, -5], pit: -10 },
};
/**
 * Builds the endless trail one seeded section at a time. A reference rider (the bot) rides each section as it is
 * built, and every jump's landing is shaped around the bot's actual takeoff (M2 deviation 3).
 */
export class TrackGen {
  readonly track = new Track();
  readonly ref: Rider = createRider();
  /** Reference-rider bails or stalls; always 0 for a fair trail. */
  failures = 0;
  readonly landings: { lipX: number; x: number; grade: Grade }[] = [];
  private readonly rand: () => number;
  private refLip = NaN;
  constructor(seed: number) {
    this.rand = mulberry32(seed);
    this.track.add({ x: 0, y: 6, m: 0 });
    this.section("runin", [
      [12, -3, -0.45],
      [24, -6, 0],
      [32, -6, 0],
    ]);
    this.advance(this.track.end);
    // Straight into a tabletop, so every run gets air right away.
    this.jump("tabletop");
    this.advance(this.track.end);
  }
  ensure(x: number) {
    while (this.track.end < x) this.next();
  }
  private next() {
    const kinds = tierAt(this.track.end).kinds,
      kind = kinds[Math.floor(this.rand() * kinds.length)];
    if (kind === "rollers") this.rollers();
    else if (kind !== "runin") this.jump(kind);
    this.advance(this.track.end);
  }
  /** Adds knots given relative to the section start and the current baseline. */
  private section(kind: "runin" | "rollers", points: Point[]) {
    const x0 = this.track.end,
      base = this.base;
    for (const [dx, y, m] of points) this.track.add({ x: x0 + dx, y: base + y, m });
    this.track.sections.push({ kind, x0, x1: this.track.end });
  }
  /** Height of the trail's flat baseline (sections end where they started). */
  private get base() {
    return this.track.knots.at(-1)!.y;
  }
  /** Rides the reference bot up to x. A failure is counted and the bot revived so generation can go on. */
  private advance(x: number) {
    const r = this.ref,
      dt = 1 / T.simHz;
    for (let i = 0; i < 120 * T.simHz && r.x < x; i++)
      for (const e of step(r, botActions(r, this.track), this.track, dt)) {
        if (e.type === "takeoff") this.refLip = r.x;
        if (e.type === "land") this.landings.push({ lipX: this.refLip, x: r.x, grade: e.grade });
        if (e.type === "bail" || e.type === "stalled") {
          this.failures++;
          Object.assign(r, { state: "riding", v: 10, y: this.track.heightAt(r.x), pitch: this.track.angleAt(r.x), stall: 0, wobble: 0 });
        }
      }
  }
  /** 2–4 rollers: crest and trough knots with zero slope give a smooth wave. */
  private rollers() {
    const n = 2 + Math.floor(this.rand() * 3),
      points: Point[] = [];
    let dx = 0;
    for (let i = 0; i < n; i++) {
      const length = 5 + this.rand() * 2,
        height = 0.8 + this.rand() * 0.7;
      points.push([dx + length / 2, height, 0], [dx + length, 0, 0]);
      dx += length;
    }
    points.push([dx + 3, 0, 0]);
    this.section("rollers", points);
  }
  /**
   * Kicker → bot takeoff → pit or table → deck → landing ramp that follows the bot's flight path just underneath it,
   * reaching it at the sweet spot → short overshoot ramp → run-out that climbs back part of the drop.
   */
  private jump(kind: JumpKind) {
    const spec = JUMPS[kind],
      pick = ([lo, hi]: Range) => lo + (hi - lo) * this.rand(),
      base = this.base,
      h = base + pick(spec.lip),
      angle = pick(spec.angle),
      deck = pick(spec.deck),
      m = Math.tan(angle),
      x0 = this.track.end,
      lipX = x0 + 3 + Math.max(3, (2.2 * (h - base)) / m);
    this.track.add({ x: x0 + 3, y: base, m: 0 });
    this.track.add({ x: lipX, y: h, m });
    const jump: Jump = { kind, lipX, landX: lipX };
    this.track.jumps.push(jump);
    this.advance(lipX);
    const ref = this.ref,
      vx = ref.state === "air" ? ref.vx : 0,
      vy = ref.state === "air" ? ref.vy : 0,
      g = T.airGravity,
      apex = h + (vy * vy) / (2 * g),
      traj = (x: number) => {
        const t = (x - lipX) / vx;
        return h + vy * t - 0.5 * g * t * t;
      },
      slope = (x: number) => (vy - g * ((x - lipX) / vx)) / vx,
      /** Where the flight path comes back down through height y (descending branch). */
      xAt = (y: number) => lipX + (vx * (vy + Math.sqrt(Math.max(0, vy * vy - 2 * g * (y - h))))) / g,
      yDeck = Math.min(h + deck, apex - 0.6),
      xRS = vx > 0 ? xAt(yDeck + T.rampClear) : lipX,
      points: [number, number, number][] = [];
    if (vx < 3 || xRS - lipX < 3) {
      // The reference rider barely got off the lip: a forgiving table and roll-down.
      points.push([lipX + 2, h - 0.2, 0], [lipX + 10, base, 0]);
    } else {
      // The ramp is the flight path lowered by rampClear·u² + rampCross·u, u = (xL − x)/L: still a quadratic (which
      // cubic Hermite knots reproduce exactly), deep enough under the arc for slower riders to clear the deck, and
      // crossing the arc at a sliver of an angle at xL so the touchdown can't slip between simulation steps.
      // Riders with more lift (perfect pops) are steered onto the same sweet spot and arrive a few degrees steeper.
      const L = Math.max(T.rampMin, T.rampShare * (xRS - lipX)),
        xL = xRS + L,
        yL = traj(xL),
        mL = slope(xL) + T.rampCross / L,
        xDeck = xRS - 1.5,
        xE = xL + Math.min(T.rampOverMax, T.rampOver * (xL - lipX)),
        yE = yL + 1.02 * mL * (xE - xL),
        yEnd = yE + 1.05 * mL * 1.5,
        pitY = Number.isNaN(spec.pit) ? yDeck : Math.min(base + spec.pit, yDeck - 0.5);
      jump.aim = { landY: yL, vyRef: vy, vyPop: vy + T.perfectPopBonus };
      if (xDeck - lipX > 2) points.push([lipX + 0.5 * (xDeck - lipX), pitY, 0]);
      points.push(
        [xDeck, yDeck, 0],
        [xRS, yDeck, slope(xRS) + (2 * T.rampClear + T.rampCross) / L],
        [xL, yL, mL],
        [xE, yE, 1.05 * mL],
        [xE + 3, yEnd, 0],
        // Climb back part of the way: the landing's speed pays for the climb, and the trail descends gently overall.
        [xE + 3 + Math.max(8, 3.5 * T.climbBack * (base - yEnd)), yEnd + T.climbBack * (base - yEnd), 0],
      );
      jump.landX = xL;
    }
    for (const [x, y, mm] of points) this.track.add({ x, y, m: mm });
    this.track.sections.push({ kind, x0, x1: this.track.end });
  }
}
