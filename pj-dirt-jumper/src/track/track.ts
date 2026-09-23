export interface Knot {
  x: number;
  y: number;
  /** Slope dy/dx at the knot. */
  m: number;
}
export type SectionKind = "runin" | "rollers" | "tabletop" | "double" | "stepup" | "stepdown" | "canyon" | "megahip";
export type JumpKind = Exclude<SectionKind, "runin" | "rollers">;
export interface Jump {
  kind: JumpKind;
  lipX: number;
  /** Where the reference rider lands: the sweet spot of the landing ramp. */
  landX: number;
}
export interface Section {
  kind: SectionKind;
  x0: number;
  x1: number;
}
/** The trail's height line: knots joined by cubic Hermite segments, so height and slope are continuous. */
export class Track {
  readonly knots: Knot[] = [];
  readonly sections: Section[] = [];
  readonly jumps: Jump[] = [];
  get end() {
    return this.knots.at(-1)?.x ?? 0;
  }
  add(k: Knot) {
    if (this.knots.length && k.x <= this.end) throw new Error(`Knot at x=${k.x} must come after x=${this.end}`);
    this.knots.push(k);
  }
  /** Index i with knots[i].x <= x < knots[i+1].x; callers guarantee x is inside the range. */
  private segment(x: number) {
    let lo = 0,
      hi = this.knots.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.knots[mid].x <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  private outside(x: number) {
    return this.knots.length < 2 || x < this.knots[0].x || x >= this.end;
  }
  heightAt(x: number) {
    if (this.outside(x)) return x < (this.knots[0]?.x ?? 0) ? (this.knots[0]?.y ?? 0) : (this.knots.at(-1)?.y ?? 0);
    const i = this.segment(x),
      a = this.knots[i],
      b = this.knots[i + 1],
      h = b.x - a.x,
      t = (x - a.x) / h,
      t2 = t * t,
      t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * h * a.m + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * h * b.m;
  }
  slopeAt(x: number) {
    if (this.outside(x)) return 0;
    const i = this.segment(x),
      a = this.knots[i],
      b = this.knots[i + 1],
      h = b.x - a.x,
      t = (x - a.x) / h,
      t2 = t * t;
    return ((6 * t2 - 6 * t) * a.y + (3 * t2 - 4 * t + 1) * h * a.m + (-6 * t2 + 6 * t) * b.y + (3 * t2 - 2 * t) * h * b.m) / h;
  }
  angleAt(x: number) {
    return Math.atan(this.slopeAt(x));
  }
  /** First jump whose lip is at or ahead of x. */
  nextJump(x: number): Jump | undefined {
    let lo = 0,
      hi = this.jumps.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.jumps[mid].lipX < x) lo = mid + 1;
      else hi = mid;
    }
    return this.jumps[lo];
  }
}
