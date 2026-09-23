/** Who is talking. Each speaker gets their own voice where the device has several, plus a pitch and pace. */
export type Speaker = "hype" | "omen" | "god" | "kid" | "dad" | "wade";
export interface VoiceLike {
  name: string;
  lang: string;
}
/** Which of the device's voices plays whom: the narrator, Dad Bluegill (a different voice), and Jeremy Wade (British). */
export interface Cast<V> {
  narrator?: V;
  dad?: V;
  wade?: V;
}
export const DELIVERY: Record<Speaker, { voice: keyof Cast<unknown>; pitch: number; rate: number }> = {
  hype: { voice: "narrator", pitch: 1.15, rate: 1.1 },
  omen: { voice: "narrator", pitch: 0.75, rate: 0.88 },
  god: { voice: "narrator", pitch: 0.1, rate: 0.7 },
  kid: { voice: "narrator", pitch: 2, rate: 1.2 },
  dad: { voice: "dad", pitch: 0.7, rate: 0.85 },
  wade: { voice: "wade", pitch: 0.95, rate: 0.9 },
};
/** macOS joke voices and the like: never cast them. */
const NOVELTY = /bells|bad news|good news|bubbles|cellos|zarvox|trinoids|albert|organ|boing|hysterical|jester|superstar|wobble|whisper|deranged|bahh|pipe|junior|princess|grandma|grandpa/i;
const score = (v: VoiceLike, lang: RegExp, names: RegExp) => (NOVELTY.test(v.name) ? -100 : 0) + (lang.test(v.lang) ? 5 : 0) + (names.test(v.name) ? 3 : 0);
function best<V extends VoiceLike>(pool: V[], lang: RegExp, names: RegExp, avoid: (V | undefined)[]) {
  const fresh = pool.filter((v) => !avoid.includes(v)),
    from = fresh.length ? fresh : pool;
  return from.reduce<V | undefined>((top, v) => (!top || score(v, lang, names) > score(top, lang, names) ? v : top), undefined);
}
/** Picks a distinct voice for each role from whatever the device offers (English first). */
export function castVoices<V extends VoiceLike>(voices: V[]): Cast<V> {
  const english = voices.filter((v) => /^en\b|^en[-_]/i.test(v.lang)),
    pool = english.length ? english : voices;
  // Wade is cast before Dad: he needs a British voice, Dad just needs to sound different from the narrator.
  const narrator = best(pool, /en[-_]US/i, /Samantha|Aria|Jenny|Google US English|Zira|Ava|Allison|America/i, []),
    wade = best(pool, /en[-_]GB/i, /Daniel|Arthur|George|Ryan|Oliver|UK English Male|Male|Great Britain/i, [narrator]),
    dad = best(pool, /en[-_]US/i, /David|Mark|Fred|Ralph|Tom|Guy|Aaron|Bruce|Male|Christopher|Eric|Alex/i, [narrator, wade]);
  return { narrator, dad, wade };
}
