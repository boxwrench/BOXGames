import type { Jump, Track } from "../track/track";
import { T } from "../tuning";
export interface Actions {
  pump: boolean;
  /** −1 = backflip direction (←), +1 = frontflip (→). */
  spin: number;
  grab: [boolean, boolean, boolean];
}
export const NO_ACTIONS: Actions = { pump: false, spin: 0, grab: [false, false, false] };
export type RiderState = "riding" | "air" | "bailed" | "stalled";
export type Grade = "perfect" | "buttery" | "clean" | "sketchy";
export type BailReason = "cased" | "huck" | "sideways" | "grab";
export type Trick = { kind: "flip"; dir: "back" | "front"; n: number } | { kind: "grab"; grab: number; seconds: number };
export type SimEvent =
  | { type: "stalled" }
  | { type: "pop"; perfect: boolean }
  | { type: "takeoff"; speed: number }
  | { type: "flip"; dir: "back" | "front"; total: number }
  | { type: "land"; grade: Grade; tricks: Trick[]; airTime: number; angleError: number }
  | { type: "bail"; reason: BailReason };
export interface Rider {
  /** Position, metres. On the ground y follows the trail. */
  x: number;
  y: number;
  /** Speed along the surface while riding, m/s. */
  v: number;
  /** Velocity while airborne, m/s. */
  vx: number;
  vy: number;
  /** Bike angle, radians, counter-clockwise (nose up) positive. */
  pitch: number;
  /** Spin rate while airborne, rad/s. */
  omega: number;
  /** Rotation from spin input this air, radians (+ = backflip direction). */
  spun: number;
  /** Completed flips this air, signed like spun. */
  flips: number;
  distance: number;
  pump: boolean;
  preload: number;
  stall: number;
  /** Seconds of post-Sketchy wobble left (no pumping). */
  wobble: number;
  /** Pending pop boost for the lip at popLip (NaN when none). */
  pop: number;
  popLip: number;
  /** Lip of the current air, and whether this air has been popped (late pops allowed until latePop). */
  lipX: number;
  popped: boolean;
  /** Grab currently held (−1 none) and its pose blend 0…1. */
  grab: number;
  grabBlend: number;
  grabTime: [number, number, number];
  airTime: number;
  state: RiderState;
}
export const createRider = (): Rider => ({
  x: 2,
  y: 0,
  v: T.startSpeed,
  vx: 0,
  vy: 0,
  pitch: 0,
  omega: 0,
  spun: 0,
  flips: 0,
  distance: 0,
  pump: false,
  preload: 0,
  stall: 0,
  wobble: 0,
  pop: 0,
  popLip: NaN,
  lipX: NaN,
  popped: false,
  grab: -1,
  grabBlend: 0,
  grabTime: [0, 0, 0],
  airTime: 0,
  state: "riding",
});
const TAU = Math.PI * 2;
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Adds a rider-made speed change: gains stop at maxSpeed (never cutting speed gravity already gave), losses always apply. */
const boost = (v: number, dv: number) => (dv > 0 ? Math.max(v, Math.min(T.maxSpeed, v + dv)) : v + dv);
/** Advances the rider by dt and reports what happened (spec §5). */
export function step(r: Rider, a: Actions, track: Track, dt: number): SimEvent[] {
  if (r.state === "riding") return ride(r, a, track, dt);
  if (r.state === "air") return fly(r, a, track, dt);
  return [];
}
function ride(r: Rider, a: Actions, track: Track, dt: number): SimEvent[] {
  const events: SimEvent[] = [],
    jump = track.nextJump(r.x),
    toLip = jump ? jump.lipX - r.x : Infinity;
  // Releasing a loaded pump in the lip window pops (spec §5.3).
  const toLipTime = toLip / Math.max(r.v, 1);
  if (jump && r.pump && !a.pump && r.preload > 0 && toLipTime <= T.popWindow) {
    const perfect = toLipTime <= T.perfectPopWindow;
    r.pop = T.popBoost * r.preload + (perfect ? T.perfectPopBonus : 0);
    r.popLip = jump.lipX;
    events.push({ type: "pop", perfect });
  }
  r.preload = a.pump ? Math.min(1, r.preload + dt / T.preloadSeconds) : 0;
  r.pump = a.pump;
  r.wobble = Math.max(0, r.wobble - dt);
  const slope = track.slopeAt(r.x),
    norm = Math.sqrt(1 + slope * slope),
    sin = slope / norm,
    cos = 1 / norm;
  r.v += (-T.gravity * sin - T.rollingResistance - T.drag * r.v * r.v) * dt;
  // On a lip face, holding pump only loads the pop; while wobbling, PJ can't pump. Pumping can't push past maxSpeed,
  // but gravity can carry PJ faster (up to hardSpeed), so descents and climbs trade speed without losing it.
  if (a.pump && toLip > T.lipFace && !r.wobble) r.v = boost(r.v, T.pumpGain * -sin * T.curvatureFactor * dt);
  r.v = clamp(r.v, 0, T.hardSpeed);
  const nx = r.x + r.v * cos * dt;
  r.distance += r.v * dt;
  if (jump && nx >= jump.lipX && r.v >= T.minLaunchSpeed) {
    const angle = track.angleAt(jump.lipX - 1e-6),
      boost = r.popLip === jump.lipX ? r.pop : 0,
      y = track.heightAt(jump.lipX),
      vx = r.v * Math.cos(angle),
      vy = r.v * Math.sin(angle) + boost;
    Object.assign(r, {
      x: jump.lipX,
      y,
      vx: steer(jump, jump.lipX, y, vx, vy),
      vy,
      pitch: angle,
      omega: 0,
      spun: 0,
      flips: 0,
      grab: -1,
      grabBlend: 0,
      grabTime: [0, 0, 0],
      airTime: 0,
      pop: 0,
      popLip: NaN,
      lipX: jump.lipX,
      popped: boost > 0,
      stall: 0,
      state: "air",
    } satisfies Partial<Rider>);
    events.push({ type: "takeoff", speed: r.v });
    return events;
  }
  r.x = nx;
  r.y = track.heightAt(nx);
  r.pitch = track.angleAt(nx);
  if (r.popLip < r.x) {
    r.pop = 0;
    r.popLip = NaN;
  }
  r.stall = r.v < T.stallSpeed ? r.stall + dt : 0;
  if (r.stall >= T.stallSeconds) {
    r.state = "stalled";
    events.push({ type: "stalled" });
  }
  return events;
}
/**
 * Lip magnetism: nudges horizontal speed (never lift) by up to ±T.steer so an arc starting at (x0, y0) comes down on the
 * jump's sweet spot. Lift still decides airtime (and so tricks) and the landing angle (M2 deviation 5).
 */
export function steer(jump: Jump, x0: number, y0: number, vx: number, vy: number) {
  const aim = jump.aim;
  if (!aim) return vx;
  const disc = vy * vy + 2 * T.airGravity * (y0 - aim.landY);
  if (disc < 0) return vx;
  const t = (vy + Math.sqrt(disc)) / T.airGravity;
  return clamp((jump.landX - x0) / t, vx * (1 - T.steer), vx * (1 + T.steer));
}
function fly(r: Rider, a: Actions, track: Track, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  // Late pop: letting go just after leaving the lip still counts (arcade grace).
  if (!r.popped && r.airTime <= T.latePop && r.pump && !a.pump && r.preload > 0) {
    r.vy += T.popBoost * r.preload;
    r.popped = true;
    const jump = track.nextJump(r.lipX);
    if (jump) r.vx = steer(jump, r.x, r.y, r.vx, r.vy);
    events.push({ type: "pop", perfect: false });
  }
  r.pump = a.pump;
  r.airTime += dt;
  const held = a.grab.findIndex(Boolean);
  r.grab = held;
  r.grabBlend = clamp(r.grabBlend + (held >= 0 ? dt : -dt) / T.grabBlend, 0, 1);
  if (held >= 0 && r.grabBlend >= 1) r.grabTime[held] += dt;
  if (r.grabBlend > 0) r.omega = 0;
  else {
    r.omega += (-a.spin * T.spinRate - r.omega) * Math.min(1, dt * T.spinResponse);
    if (Math.abs(a.spin) < 0.1 && Math.abs(r.omega) < 1) {
      const toPath = wrapAngle(Math.atan2(r.vy, r.vx) - r.pitch);
      r.pitch += clamp(toPath, -T.assistRate * dt, T.assistRate * dt);
    }
  }
  r.pitch += r.omega * dt;
  r.spun += r.omega * dt;
  const done = Math.floor((Math.abs(r.spun) + T.flipTolerance) / TAU);
  if (done > Math.abs(r.flips)) {
    r.flips = Math.sign(r.spun) * done;
    events.push({ type: "flip", dir: r.spun > 0 ? "back" : "front", total: done });
  }
  // Exact for constant gravity, so the flight matches the parabola jumps are designed around.
  r.x += r.vx * dt;
  r.y += (r.vy - 0.5 * T.airGravity * dt) * dt;
  r.vy -= T.airGravity * dt;
  r.distance += Math.hypot(r.vx, r.vy) * dt;
  const ground = track.heightAt(r.x);
  if (r.y > ground) return events;
  r.y = ground;
  const angle = track.angleAt(r.x),
    err = Math.abs(wrapAngle(r.pitch - angle)),
    along = r.vx * Math.cos(angle) + r.vy * Math.sin(angle),
    impact = r.vx * Math.sin(angle) - r.vy * Math.cos(angle);
  let bail: BailReason | undefined;
  if (r.grabBlend > 0) bail = "grab";
  else if (err > T.landSketchy) bail = "sideways";
  else if (angle > T.downslope && impact > T.huckImpact) bail = angle > T.upslope ? "cased" : "huck";
  if (bail) {
    r.state = "bailed";
    events.push({ type: "bail", reason: bail });
    return events;
  }
  const grade: Grade =
    err <= T.landPerfect && angle <= T.downslope ? "perfect" : err <= T.landButtery ? "buttery" : err <= T.landClean ? "clean" : "sketchy";
  const tricks: Trick[] = [];
  if (r.flips) tricks.push({ kind: "flip", dir: r.flips > 0 ? "back" : "front", n: Math.abs(r.flips) });
  r.grabTime.forEach((seconds, grab) => {
    if (seconds >= T.grabMin) tricks.push({ kind: "grab", grab, seconds });
  });
  Object.assign(r, {
    v: clamp(boost(Math.max(0, along), T.landSpeed[grade]), 0, T.hardSpeed),
    wobble: grade === "sketchy" ? T.wobbleSeconds : 0,
    pitch: angle,
    omega: 0,
    grab: -1,
    grabBlend: 0,
    preload: 0,
    stall: 0,
    state: "riding",
  } satisfies Partial<Rider>);
  events.push({ type: "land", grade, tricks, airTime: r.airTime, angleError: err });
  return events;
}
