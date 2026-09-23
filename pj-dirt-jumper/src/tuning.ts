// Every gameplay number lives here so feel can be tuned in one place (spec §5).
const deg = Math.PI / 180;
export const T = {
  simHz: 120,
  gravity: 20, // m/s² on the ground, arcade-heavy
  airGravity: 13, // lighter in the air for hang time (M2 deviation 2)
  rollingResistance: 0.6,
  drag: 0.004,
  pumpGain: 9,
  curvatureFactor: 1,
  maxSpeed: 22,
  startSpeed: 8,
  stallSpeed: 2,
  stallSeconds: 3,
  preloadSeconds: 0.35,
  // Pop and takeoff (spec §5.3)
  lipFace: 5, // m before a lip where holding pump only loads the pop
  popWindow: 1.2,
  perfectPopWindow: 0.3,
  popBoost: 4.5,
  perfectPopBonus: 1.5,
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
  botPopAt: 1, // the reference bot releases this far before the lip (a good, not perfect, pop)
  rampShort: 0.3, // landing ramp starts this fraction of the jump length before the sweet spot
  rampOver: 0.6, // and runs this fraction past it
} as const;
