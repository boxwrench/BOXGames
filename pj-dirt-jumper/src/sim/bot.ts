import { NO_ACTIONS, type Actions, type Rider } from "./rider";
import type { Track } from "../track/track";
import { T } from "../tuning";
/**
 * Reference rider for tests, track design and the autopilot: pumps the downslopes, holds pump up the lip face and
 * lets go popAt seconds before the lip (negative = never pops), and lets the landing assist line up the bike.
 */
export function botActions(r: Rider, track: Track, popAt: number = T.botPopAt): Actions {
  if (r.state !== "riding") return NO_ACTIONS;
  const jump = track.nextJump(r.x),
    toLip = jump ? jump.lipX - r.x : Infinity;
  if (toLip <= T.lipFace) return { ...NO_ACTIONS, pump: popAt < 0 || toLip / Math.max(r.v, 1) > popAt };
  return { ...NO_ACTIONS, pump: track.slopeAt(r.x) < 0 };
}
