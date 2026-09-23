/**
 * Keeps phones and tablets smooth: if frames run slower than ~40 fps for a few seconds, render at a lower pixel ratio
 * (a step at a time, never back up, so it can't flip-flop); at the floor, shadows go too.
 */
export class Quality {
  ratio: number;
  shadows = true;
  private avg = 1 / 60;
  private settle = 0;
  constructor(
    max: number,
    readonly min = 0.75,
  ) {
    this.ratio = max;
  }
  /** Feed each frame's real duration; returns true when the settings just changed. */
  frame(dt: number) {
    // Ignore hitches from tab switches and the first frames.
    if (dt <= 0 || dt > 0.2) return false;
    this.avg += (dt - this.avg) * 0.05;
    this.settle += dt;
    if (this.settle < 3 || this.avg < 1 / 40) return false;
    this.settle = 0;
    this.avg = 1 / 60;
    if (this.ratio > this.min) {
      this.ratio = Math.max(this.min, Math.round((this.ratio - 0.25) * 100) / 100);
      return true;
    }
    if (this.shadows) {
      this.shadows = false;
      return true;
    }
    return false;
  }
}
