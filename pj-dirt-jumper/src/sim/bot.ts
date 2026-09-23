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
/** The bot, plus a Superman held early in any air long enough to let go of it well before touchdown. */
export function stuntActions(r: Rider, track: Track): Actions {
  if (r.state !== "air") return botActions(r, track);
  const lift = r.vy + T.airGravity * r.airTime,
    hang = (2 * lift) / T.airGravity;
  return { ...NO_ACTIONS, grab: [r.airTime > 0.1 && r.airTime < Math.min(0.1 + 0.6, hang - 0.7), false, false] };
}
