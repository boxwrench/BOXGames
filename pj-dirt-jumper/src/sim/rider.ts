import type { Track } from "../track/track";
import { T } from "../tuning";
export interface Actions {
  pump: boolean;
  /** −1 back … +1 forward; used from M2. */
  spin: number;
  grab: [boolean, boolean, boolean];
}
export const NO_ACTIONS: Actions = { pump: false, spin: 0, grab: [false, false, false] };
export interface Rider {
  /** Horizontal position along the trail, metres. */
  x: number;
  /** Speed along the surface, m/s. */
  v: number;
  /** Distance travelled along the surface, metres. */
  distance: number;
  pump: boolean;
  /** 0…1, how compressed PJ is for a pop. */
  preload: number;
  /** Seconds spent under stallSpeed. */
  stall: number;
  state: "riding" | "stalled";
}
export type SimEvent = { type: "stalled" };
export const createRider = (): Rider => ({ x: 2, v: T.startSpeed, distance: 0, pump: false, preload: 0, stall: 0, state: "riding" });
/** Advances a grounded rider by dt. Pumping adds speed on downslopes and costs it on upslopes (spec §5.2). */
export function step(r: Rider, a: Actions, track: Track, dt: number): SimEvent[] {
  if (r.state !== "riding") return [];
  const slope = track.slopeAt(r.x),
    norm = Math.sqrt(1 + slope * slope),
    sin = slope / norm,
    cos = 1 / norm;
  let accel = -T.gravity * sin - T.rollingResistance - T.drag * r.v * r.v;
  if (a.pump) accel += T.pumpGain * -sin * T.curvatureFactor;
  r.v = Math.min(T.maxSpeed, Math.max(0, r.v + accel * dt));
  r.x += r.v * cos * dt;
  r.distance += r.v * dt;
  r.pump = a.pump;
  r.preload = a.pump ? Math.min(1, r.preload + dt / T.preloadSeconds) : 0;
  r.stall = r.v < T.stallSpeed ? r.stall + dt : 0;
  if (r.stall >= T.stallSeconds) {
    r.state = "stalled";
    return [{ type: "stalled" }];
  }
  return [];
}
