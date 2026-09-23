import type { SectionKind } from "./track";
export interface Tier {
  from: number;
  name: string;
  /** Section mix; repeats weight the draw. */
  kinds: SectionKind[];
}
export const TIERS: Tier[] = [
  { from: 0, name: "Backyard Pump Track", kinds: ["rollers", "rollers", "tabletop"] },
  { from: 400, name: "Local Dirt Jumps", kinds: ["rollers", "tabletop", "tabletop", "double", "stepup"] },
  { from: 1200, name: "Pine Forest", kinds: ["rollers", "double", "double", "stepdown", "stepup"] },
  { from: 2500, name: "Desert Canyon", kinds: ["rollers", "double", "canyon", "stepdown"] },
  { from: 4000, name: "Volcano Send-Zone", kinds: ["rollers", "canyon", "megahip", "stepdown"] },
];
export function tierAt(x: number) {
  let tier = TIERS[0];
  for (const t of TIERS) if (x >= t.from) tier = t;
  return tier;
}
