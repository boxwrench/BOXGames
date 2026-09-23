import { mulberry32 } from "../rng";
// The soundtrack as data: a setlist of styles, each song in its own key with a verse/chorus form. Sound renders it.
export type StyleName = "punk" | "surf" | "ska" | "chip" | "dbeat" | "sludge" | "hyperspace";
export interface Style {
  bpm: number;
  /** 16-step drum patterns: x = hit, o = soft hit. */
  kick: string;
  snare: string;
  hat: string;
  /** How the guitar/keys play the chord. */
  chords: "power" | "mute" | "upstroke" | "tremolo" | "arp" | "sustain";
  bass: "eighths" | "walk" | "pedal" | "octaves";
  lead: "penta" | "surf" | "chip" | "none";
  wave: OscillatorType;
  /** Chord roots in semitones from the key, one per bar; a song picks one progression. */
  progressions: number[][];
  /** Scale for melodies, semitones. */
  scale: number[];
}
const MINOR_PENTA = [0, 3, 5, 7, 10],
  MAJOR_PENTA = [0, 2, 4, 7, 9],
  HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
export const STYLES: Record<StyleName, Style> = {
  // The original: skate punk, power chords on eighths.
  punk: {
    bpm: 160,
    kick: "x.......x.x.....",
    snare: "....x.......x...",
    hat: "x.x.x.x.x.x.x.x.",
    chords: "power",
    bass: "eighths",
    lead: "penta",
    wave: "sawtooth",
    progressions: [
      [0, 3, 5, 8],
      [0, 5, 7, 5],
      [0, 8, 3, 10],
    ],
    scale: MINOR_PENTA,
  },
  // Dick Dale on a dirt jump: tremolo picking, tom-heavy beat, harmonic minor lead.
  surf: {
    bpm: 172,
    kick: "x..x..x.x..x..x.",
    snare: "....x.......x..o",
    hat: "x.x.x.x.x.x.x.x.",
    chords: "tremolo",
    bass: "walk",
    lead: "surf",
    wave: "sawtooth",
    progressions: [
      [0, 8, 10, 7],
      [0, 0, 5, 7],
    ],
    scale: HARMONIC_MINOR,
  },
  // Offbeat upstrokes and a walking bass.
  ska: {
    bpm: 150,
    kick: "x.......x.......",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    chords: "upstroke",
    bass: "walk",
    lead: "penta",
    wave: "square",
    progressions: [
      [0, 5, 7, 5],
      [0, 9, 5, 7],
    ],
    scale: MAJOR_PENTA,
  },
  // 8-bit: square-wave arpeggios, I–V–vi–IV.
  chip: {
    bpm: 150,
    kick: "x...x...x...x...",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    chords: "arp",
    bass: "octaves",
    lead: "chip",
    wave: "square",
    progressions: [
      [0, 7, 9, 5],
      [0, 5, 9, 7],
    ],
    scale: MAJOR_PENTA,
  },
  // Fast and furious: d-beat drums, palm-muted sixteenths.
  dbeat: {
    bpm: 190,
    kick: "x..xx...x..xx...",
    snare: "..x...x...x...x.",
    hat: "x.x.x.x.x.x.x.x.",
    chords: "mute",
    bass: "eighths",
    lead: "none",
    wave: "sawtooth",
    progressions: [
      [0, 1, 3, 0],
      [0, 6, 5, 3],
    ],
    scale: MINOR_PENTA,
  },
  // Heavy half-time: long ringing chords, one snare a bar.
  sludge: {
    bpm: 140,
    kick: "x.....x.x.......",
    snare: "........x.......",
    hat: "x...x...x...x...",
    chords: "sustain",
    bass: "pedal",
    lead: "penta",
    wave: "sawtooth",
    progressions: [
      [0, 3, -2, 5],
      [0, 0, 1, -2],
    ],
    scale: MINOR_PENTA,
  },
  // Only in the slipstream: synthwave arps.
  hyperspace: {
    bpm: 128,
    kick: "x...x...x...x...",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    chords: "arp",
    bass: "octaves",
    lead: "chip",
    wave: "sawtooth",
    progressions: [[0, 8, 3, 10]],
    scale: MINOR_PENTA,
  },
};
/** The styles a setlist draws from (hyperspace is reserved for the rocket). */
export const SETLIST_STYLES: readonly StyleName[] = ["punk", "surf", "ska", "chip", "dbeat", "sludge"];
export type SectionKind = "intro" | "verse" | "chorus" | "break";
export const FORM: readonly { kind: SectionKind; bars: number }[] = [
  { kind: "intro", bars: 4 },
  { kind: "verse", bars: 8 },
  { kind: "chorus", bars: 8 },
  { kind: "verse", bars: 8 },
  { kind: "chorus", bars: 8 },
  { kind: "break", bars: 4 },
  { kind: "chorus", bars: 8 },
];
export const FORM_BARS = FORM.reduce((n, s) => n + s.bars, 0);
const BANDS = ["The Proud Bluegills", "Kevin & the Halos", "Land Trout", "Pikeminnow Rocket", "Dad's Garage Band", "The Kokanee Kids", "Delta Mud", "Striper Season", "The Worm Rapture", "Clear Lake Lunkers"];
const TITLES = ["Send It to the Delta", "Pump the Backside", "Bobber Moon", "Casing the Knuckle", "Full Tackle Box", "Huck to Flat", "Hyperspace Bait", "Sturgeon General", "Tailwhip Tuesday", "No Stealth No Fish", "Brakes Are for Trout", "Home Before the Streetlights"];
export interface Song {
  style: StyleName;
  /** Semitones from E2 for the song's key. */
  key: number;
  progression: number[];
  /** A two-bar melody as scale degrees (-1 = rest), sixteenth notes in pairs. */
  motif: number[];
  title: string;
  band: string;
}
/** Deals songs in a seeded order: every style once before any repeats, and never the same style twice running. */
export class Setlist {
  private rand: () => number;
  private deck: StyleName[] = [];
  private titles: string[] = [];
  private last?: StyleName;
  constructor(seed: number) {
    this.rand = mulberry32(seed ^ 0x5eed50);
  }
  next(): Song {
    if (!this.deck.length) {
      this.deck = this.shuffle(SETLIST_STYLES);
      if (this.deck[0] === this.last) this.deck.push(this.deck.shift()!);
    }
    const style = this.deck.shift()!,
      s = STYLES[style],
      pick = <T>(a: readonly T[]) => a[Math.floor(this.rand() * a.length)];
    this.last = style;
    return {
      style,
      key: pick([-2, 0, 2, 3, 5]),
      progression: pick(s.progressions),
      motif: Array.from({ length: 16 }, () => (this.rand() < 0.25 ? -1 : Math.floor(this.rand() * (s.scale.length + 3)))),
      title: this.title(),
      band: pick(BANDS),
    };
  }
  /** Titles come off a shuffled deck too, so none repeats until they've all been played. */
  private title() {
    if (!this.titles.length) this.titles = this.shuffle(TITLES);
    return this.titles.pop()!;
  }
  private shuffle<T>(items: readonly T[]) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
/** Where a song is at a given bar: its section, and whether this bar ends a phrase (drum fill). */
export function sectionAt(bar: number) {
  let at = bar % FORM_BARS;
  for (const s of FORM) {
    if (at < s.bars) return { kind: s.kind, fill: at % 4 === 3 || at === s.bars - 1, first: at === 0 };
    at -= s.bars;
  }
  return { kind: "verse" as SectionKind, fill: false, first: false };
}
/** Frequency of a scale degree (may run past one octave) above a root. */
export const degreeHz = (root: number, scale: readonly number[], degree: number) =>
  root * Math.pow(2, (scale[degree % scale.length] + 12 * Math.floor(degree / scale.length)) / 12);
