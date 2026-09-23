// Every gameplay number lives here so feel can be tuned in one place (spec §5).
export const T = {
  simHz: 120,
  gravity: 20, // m/s², arcade-heavy
  rollingResistance: 0.6, // m/s²
  drag: 0.004, // × v²
  pumpGain: 9, // m/s² at a 90° slope
  curvatureFactor: 1, // reserved: scales pump by surface curvature in later milestones
  maxSpeed: 22, // m/s before Flow bonuses
  startSpeed: 8, // m/s
  stallSpeed: 2, // m/s
  stallSeconds: 3,
  preloadSeconds: 0.35,
} as const;
