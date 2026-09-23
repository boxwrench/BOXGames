import { mulberry32 } from "../rng";
import { Track, type SectionKind } from "./track";
/** Knot relative to its section's start: [dx, y, slope]. */
type Point = [number, number, number];
/** Builds the endless trail one seeded section at a time. M1 is the Backyard tier only. */
export class TrackGen {
  readonly track = new Track();
  private readonly rand: () => number;
  constructor(seed: number) {
    this.rand = mulberry32(seed);
    this.track.add({ x: 0, y: 6, m: 0 });
    this.section("runin", [
      [12, 3, -0.45],
      [24, 0, 0],
      [32, 0, 0],
    ]);
  }
  ensure(x: number) {
    while (this.track.end < x) this.next();
  }
  private next() {
    if (this.rand() < 0.62) this.rollers();
    else this.tabletop();
  }
  private section(kind: SectionKind, points: Point[]) {
    const x0 = this.track.end;
    for (const [dx, y, m] of points) this.track.add({ x: x0 + dx, y, m });
    this.track.sections.push({ kind, x0, x1: this.track.end });
  }
  /** 2–6 rollers: crest and trough knots with zero slope give a smooth wave. */
  private rollers() {
    const n = 2 + Math.floor(this.rand() * 5),
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
  /** Ramp up, flat table, ramp down to a short flat. */
  private tabletop() {
    const height = 1.6 + this.rand() * 0.8,
      top = 4 + this.rand() * 3;
    this.section("tabletop", [
      [1.5, 0.2, 0.3],
      [4.5, height, 0],
      [4.5 + top, height, 0],
      [9 + top, 0, 0],
      [12 + top, 0, 0],
    ]);
  }
}
