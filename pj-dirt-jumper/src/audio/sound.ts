import { storage } from "../storage";
export type Cue = "pop" | "perfectPop" | "land" | "perfect" | "sketchy" | "trick" | "reel" | "bail" | "flowUp" | "onFire" | "stall" | "best" | "airhorn" | "cheer" | "whoosh" | "slam";
interface Voice {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol: number;
  at?: number;
  attack?: number;
  filter?: { type: BiquadFilterType; f0: number; f1?: number; q?: number };
}
const PENTA = [0, 3, 5, 7, 10];
const ROOTS = [82.41, 98, 110, 65.41]; // E2 G2 A2 C2 — a punk I–III–IV–VI loop
/** Everything synthesized (spec §9): tyre crunch, freewheel buzz, cues, and a 160 BPM punk loop that layers up with Flow. */
export class Sound {
  muted = storage("pj-muted") === "1";
  flow = 0;
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private noise?: AudioBuffer;
  private dist?: WaveShaperNode;
  private tyre?: { gain: GainNode; filter: BiquadFilterNode };
  private buzz?: { osc: OscillatorNode; gain: GainNode };
  private playing = false;
  private step = 0;
  private next = 0;
  private timer = 0;
  unlock() {
    if (!this.ctx) {
      const c = (this.ctx = new AudioContext()),
        comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp).connect(c.destination);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = 0.32;
      this.musicBus.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.dist = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * 4);
      }
      this.dist.curve = curve;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      this.dist.connect(lp).connect(this.musicBus);
      // Continuous tyre crunch: looping noise through a band-pass whose level and pitch follow speed.
      const src = c.createBufferSource(),
        filter = c.createBiquadFilter(),
        gain = c.createGain();
      src.buffer = this.noise;
      src.loop = true;
      filter.type = "bandpass";
      filter.Q.value = 0.9;
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      this.tyre = { gain, filter };
      // Freewheel buzz in the air: a quiet square wave whose pitch follows wheel speed.
      const osc = c.createOscillator(),
        bg = c.createGain(),
        hp = c.createBiquadFilter();
      osc.type = "square";
      hp.type = "highpass";
      hp.frequency.value = 900;
      bg.gain.value = 0;
      osc.connect(hp).connect(bg).connect(this.master);
      osc.start();
      this.buzz = { osc, gain: bg };
    }
    void this.ctx.resume();
    this.startMusic();
  }
  toggle() {
    this.muted = !this.muted;
    storage("pj-muted", this.muted ? "1" : "0");
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }
  /** Called every frame with the rider's speed and whether the wheels are on the dirt. */
  ride(speed: number, grounded: boolean, airborne: boolean) {
    if (!this.ctx || !this.tyre || !this.buzz) return;
    const t = this.ctx.currentTime;
    this.tyre.gain.gain.setTargetAtTime(grounded ? Math.min(0.22, speed * 0.012) : 0, t, 0.05);
    this.tyre.filter.frequency.setTargetAtTime(300 + speed * 45, t, 0.05);
    this.buzz.gain.gain.setTargetAtTime(airborne ? 0.018 : 0, t, 0.08);
    this.buzz.osc.frequency.setTargetAtTime(40 + speed * 9, t, 0.1);
  }
  private voice(v: Voice, dest?: AudioNode, noise = false) {
    const c = this.ctx!,
      t = v.at ?? c.currentTime,
      g = c.createGain();
    let src: AudioScheduledSourceNode;
    if (noise) {
      const n = c.createBufferSource();
      n.buffer = this.noise!;
      n.loop = true;
      n.playbackRate.value = v.f0;
      src = n;
    } else {
      const o = c.createOscillator();
      o.type = v.type ?? "sine";
      o.frequency.setValueAtTime(v.f0, t);
      if (v.f1) o.frequency.exponentialRampToValueAtTime(v.f1, t + v.dur);
      src = o;
    }
    let out: AudioNode = src;
    if (v.filter) {
      const f = c.createBiquadFilter();
      f.type = v.filter.type;
      f.Q.value = v.filter.q ?? 0.8;
      f.frequency.setValueAtTime(v.filter.f0, t);
      if (v.filter.f1) f.frequency.exponentialRampToValueAtTime(v.filter.f1, t + v.dur);
      out.connect(f);
      out = f;
    }
    const a = v.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + v.dur);
    out.connect(g).connect(dest ?? this.master!);
    src.start(t);
    src.stop(t + a + v.dur + 0.05);
  }
  private hiss(v: Omit<Voice, "f0"> & { rate?: number }, dest?: AudioNode) {
    this.voice({ ...v, f0: v.rate ?? 1 }, dest, true);
  }
  play(cue: Cue, amount = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (cue) {
      case "pop":
        this.hiss({ dur: 0.25, vol: 0.35, filter: { type: "bandpass", f0: 400, f1: 3000, q: 1.5 } });
        this.voice({ f0: 180, f1: 420, dur: 0.15, vol: 0.2 });
        break;
      case "perfectPop":
        this.hiss({ dur: 0.3, vol: 0.4, filter: { type: "bandpass", f0: 500, f1: 5000, q: 1.5 } });
        [660, 990].forEach((f, i) => this.voice({ type: "triangle", f0: f, dur: 0.18, vol: 0.18, at: t + i * 0.05 }));
        break;
      case "land":
        this.voice({ f0: 110, f1: 40, dur: 0.18 + amount * 0.1, vol: Math.min(0.9, 0.35 + amount * 0.25) });
        this.hiss({ dur: 0.2, vol: 0.3, filter: { type: "lowpass", f0: 1600, f1: 300 } });
        break;
      case "perfect":
        this.voice({ f0: 120, f1: 38, dur: 0.35, vol: 0.9 });
        this.hiss({ dur: 0.3, vol: 0.35, filter: { type: "lowpass", f0: 2400, f1: 300 } });
        [523, 659, 784, 1046].forEach((f, i) => this.voice({ type: "triangle", f0: f, dur: 0.25, vol: 0.14, at: t + 0.04 + i * 0.05 }));
        break;
      case "sketchy":
        this.voice({ type: "sawtooth", f0: 220, f1: 140, dur: 0.3, vol: 0.12, filter: { type: "lowpass", f0: 900 } });
        break;
      case "trick":
        this.voice({ type: "square", f0: 440 * Math.pow(2, PENTA[Math.min(4, amount)] / 12), dur: 0.1, vol: 0.08 });
        break;
      case "reel":
        // Fishing-reel zzzing: rapid clicks sliding up.
        for (let i = 0; i < 14; i++) this.voice({ type: "square", f0: 1800 + i * 90, dur: 0.02, vol: 0.05, at: t + i * 0.022 });
        break;
      case "bail":
        this.hiss({ dur: 0.9, vol: 0.6, filter: { type: "lowpass", f0: 2800, f1: 200 } });
        this.voice({ f0: 90, f1: 30, dur: 0.5, vol: 0.8 });
        for (let i = 0; i < 6; i++)
          this.hiss({ at: t + 0.1 + i * 0.09 + Math.random() * 0.05, dur: 0.06, vol: 0.25, rate: 0.7, filter: { type: "bandpass", f0: 1200 + Math.random() * 2400, q: 4 } });
        break;
      case "flowUp":
        [392, 494, 587].forEach((f, i) => this.voice({ type: "triangle", f0: f, dur: 0.14, vol: 0.12, at: t + i * 0.06 }));
        break;
      case "onFire":
        for (const [i, f] of [164.8, 207.7, 246.9, 329.6].entries())
          this.voice({ type: "sawtooth", f0: f, f1: f * 2, dur: 0.8, vol: 0.1, at: t + i * 0.03, filter: { type: "lowpass", f0: 500, f1: 5000 } });
        break;
      case "stall":
        this.voice({ type: "triangle", f0: 392, f1: 196, dur: 0.9, vol: 0.2 });
        break;
      case "airhorn":
        // Three stadium-horn blasts: detuned saw chord, the last one held.
        for (const [at, len] of [
          [0, 0.13],
          [0.18, 0.13],
          [0.36, 0.55],
        ])
          for (const f of [415, 419, 523, 527])
            this.voice({ type: "sawtooth", f0: f, f1: f * 0.97, dur: len, vol: 0.07, at: t + at, attack: 0.01, filter: { type: "lowpass", f0: 3200 } });
        break;
      case "cheer":
        // Crowd roar: band-passed noise swells, with a few whistles on top.
        this.hiss({ dur: 1.4, vol: 0.28, attack: 0.25, filter: { type: "bandpass", f0: 900, f1: 1600, q: 0.6 } });
        this.hiss({ dur: 1.2, vol: 0.18, attack: 0.2, rate: 1.4, filter: { type: "bandpass", f0: 2400, q: 1 } });
        for (let i = 0; i < 2; i++) this.voice({ f0: 1900 + i * 300, f1: 2600 + i * 200, dur: 0.25, vol: 0.05, at: t + 0.2 + i * 0.35 });
        break;
      case "whoosh":
        this.hiss({ dur: 0.45, vol: 0.4, attack: 0.08, filter: { type: "bandpass", f0: 3500, f1: 400, q: 1.2 } });
        break;
      case "slam":
        this.voice({ f0: 70, f1: 30, dur: 0.4, vol: 0.9 });
        this.hiss({ dur: 0.12, vol: 0.4, filter: { type: "highpass", f0: 1500 } });
        break;
      case "best":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.voice({ type: "square", f0: f, dur: 0.16, vol: 0.08, at: t + i * 0.08 }));
        break;
    }
  }
  private startMusic() {
    if (this.playing || !this.ctx) return;
    this.playing = true;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  private schedule() {
    const c = this.ctx!,
      sixteenth = 60 / 160 / 4;
    while (this.next < c.currentTime + 0.12) {
      if (!this.muted) this.beat(this.step, this.next);
      this.next += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }
  private beat(s: number, at: number) {
    const f = this.flow,
      b = s % 16,
      bus = this.musicBus!,
      root = ROOTS[Math.floor(s / 16) % 4];
    if (b === 0 || b === 8 || (f >= 3 && b === 10)) this.voice({ f0: 150, f1: 40, dur: 0.16, vol: 0.9, at }, bus);
    if (f >= 1 && (b === 4 || b === 12)) {
      this.hiss({ at, dur: 0.12, vol: 0.45, filter: { type: "bandpass", f0: 1800, q: 0.8 } }, bus);
      this.voice({ type: "triangle", f0: 210, f1: 160, dur: 0.08, vol: 0.2, at }, bus);
    }
    if (f >= 1 && (f >= 3 || b % 2 === 0)) this.hiss({ at, dur: 0.025, vol: b % 4 === 2 ? 0.16 : 0.08, filter: { type: "highpass", f0: 7000 } }, bus);
    if (f >= 5 && b === 0 && s % 32 === 0) this.hiss({ at, dur: 0.8, vol: 0.2, filter: { type: "highpass", f0: 5000 } }, bus);
    if (b % 2 === 0) {
      const chord = f >= 2 ? [1, 1.5, 2] : [1];
      for (const k of chord) this.voice({ type: "sawtooth", f0: root * k, dur: 0.12, vol: 0.16, at }, this.dist);
    }
    if (f >= 4 && b % 2 === 1 && (s * 7) % 5 < 3) {
      const note = root * 4 * Math.pow(2, PENTA[(s * 3) % 5] / 12);
      this.voice({ type: "square", f0: note, dur: 0.09, vol: 0.05, at, filter: { type: "lowpass", f0: 3000 } }, bus);
    }
  }
}
