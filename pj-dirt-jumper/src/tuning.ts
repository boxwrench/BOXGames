// Every gameplay number lives here so feel can be tuned in one place (spec §5).
const deg = Math.PI / 180;
export const T = {
  simHz: 120,
  gravity: 20, // m/s² on the ground, arcade-heavy
  airGravity: 9, // lighter in the air: long hang time without moon-high apexes (M2 deviation 2)
  rollingResistance: 0.6,
  drag: 0.004,
  pumpGain: 9,
  curvatureFactor: 1,
  maxSpeed: 22, // m/s that pumping and landing bonuses can reach (before Flow bonuses)
  hardSpeed: 32, // m/s gravity can carry PJ to on descents
  startSpeed: 8,
  stallSpeed: 2,
  stallSeconds: 3,
  preloadSeconds: 0.35,
  // Pop and takeoff (spec §5.3)
  lipFace: 8, // m before a lip where holding pump only loads the pop (long enough to fully load at max speed)
  popWindow: 0.3, // s before the lip in which letting go pops
  perfectPopWindow: 0.1, // s before the lip for a perfect pop
  latePop: 0.12, // s after leaving the lip in which letting go still pops (normal strength)
  popBoost: 3,
  perfectPopBonus: 1.2,
  minLaunchSpeed: 3,
  // Air (spec §5.4)
  spinRate: 420 * deg,
  spinResponse: 8,
  assistRate: 2.2, // rad/s the bike eases toward its flight path with no spin input
  flipTolerance: 20 * deg,
  grabBlend: 0.15,
  grabMin: 0.25,
  // Landing (spec §5.5)
  landPerfect: 8 * deg,
  landButtery: 15 * deg,
  landClean: 25 * deg,
  landSketchy: 40 * deg,
  downslope: -3 * deg,
  upslope: 3 * deg,
  huckImpact: 12,
  landSpeed: { perfect: 3, buttery: 1.5, clean: 0, sketchy: -3 },
  wobbleSeconds: 0.5,
  // Track design
  botPopAt: 0.2, // s before the lip the reference bot lets go (a good, not perfect, pop)
  rampClear: 0.9, // m the landing ramp starts under the flight path, closing to 0 at the sweet spot
  rampCross: 0.08, // m of that closing done linearly, so the arc crosses the ramp rather than grazing it
  rampMin: 4, // m of landing ramp from the deck edge to the sweet spot…
  rampShare: 0.15, // …or this share of the lip-to-deck distance, whichever is longer
  rampOver: 0.45, // the landing ramp runs this fraction of the jump length past the sweet spot
  steer: 0.3, // lip magnetism: takeoff speed may be nudged by up to this fraction
  rampOverMax: 3,
  climbBack: 0.6, // share of a landing's drop the run-out climbs back (1 = level trail, 0 = pure descent) // …but no more than this many metres, so landings don't turn into long speed-giving descents
} as const;
