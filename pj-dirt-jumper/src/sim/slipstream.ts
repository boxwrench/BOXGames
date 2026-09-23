import type { Track } from "../track/track";
import { T } from "../tuning";
import type { Rider } from "./rider";
/**
 * The Pikeminnow Rocket's drop zone: just past the sweet spot of the first designed landing at least `meters` ahead,
 * so PJ comes back to earth on a downslope with speed, the way a real landing would.
 */
export function dropPoint(track: Track, from: number, meters: number) {
  let jump = track.nextJump(from + meters);
  while (jump && !jump.aim) jump = track.nextJump(jump.lipX + 0.01);
  return jump ? jump.landX + T.rocketDropPast : from + meters;
}
/** Puts PJ back on the trail at x, riding flat out: the rocket wipes any half-done trick. */
export function dropRider(r: Rider, track: Track, x: number) {
  r.distance += x - r.x;
  Object.assign(r, {
    x,
    y: track.heightAt(x),
    v: T.maxSpeed,
    vx: 0,
    vy: 0,
    pitch: track.angleAt(x),
    omega: 0,
    spun: 0,
    flips: 0,
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
    grabRelease: [NaN, NaN, NaN],
    apexTime: NaN,
    airTime: 0,
    state: "riding",
  } satisfies Partial<Rider>);
}
