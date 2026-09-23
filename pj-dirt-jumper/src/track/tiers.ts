import type { SectionKind } from "./track";
export interface Tier {
  from: number;
  name: string;
  /** Section mix; repeats weight the draw. */
  kinds: SectionKind[];
}
export const TIERS: Tier[] = [
  { from: 0, name: "Backyard Pump Track", kinds: ["tabletop", "tabletop", "rollers"] },
  { from: 400, name: "Local Dirt Jumps", kinds: ["rollers", "tabletop", "double", "double", "stepup", "tabletop"] },
  { from: 1200, name: "Pine Forest", kinds: ["rollers", "double", "double", "stepdown", "stepup", "tabletop"] },
  { from: 2500, name: "Desert Canyon", kinds: ["rollers", "double", "canyon", "stepdown", "canyon"] },
  { from: 4000, name: "Volcano Send-Zone", kinds: ["rollers", "canyon", "megahip", "stepdown", "megahip"] },
];
export function tierAt(x: number) {
  let tier = TIERS[0];
  for (const t of TIERS) if (x >= t.from) tier = t;
  return tier;
}
