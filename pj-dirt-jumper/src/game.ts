import * as THREE from "three";
import { createStage, type Stage } from "./render/stage";
import { TrackView } from "./render/trackView";
import { RiderView } from "./render/riderView";
import { CameraRig } from "./render/cameraRig";
import { Backdrop } from "./render/backdrop";
import { FX } from "./render/fx";
import { Trail } from "./render/trail";
import { Input } from "./input/input";
import { Hud } from "./ui/hud";
import { TrackGen } from "./track/generate";
import { tierAt } from "./track/tiers";
import type { Track } from "./track/track";
import { createRider, step, wrapAngle, type BailReason, type Rider, type SimEvent } from "./sim/rider";
import { botActions, stuntActions } from "./sim/bot";
import { Score, flipName } from "./score/score";
import { DAD_FIRST, Lines, landKey } from "./lines";
import { Sound } from "./audio/sound";
import { storage } from "./storage";
import { Director, OMENS, type OmenKind } from "./weird/director";
import { Omens } from "./weird/omens";
import { T } from "./tuning";
const TIPS: Record<BailReason | "stalled", string> = {
  stalled: "Pump the downslopes to keep your speed.",
  cased: "Too short. Pump harder and pop the lip.",
  huck: "Overshot onto the flat. Line up with the landing.",
  sideways: "Line the bike up with the landing before you touch down.",
};
const V = new THREE.Vector3(),
  V2 = new THREE.Vector2();
/** Fixed-step simulation (T.simHz) with interpolated rendering, effects, sound and the run's score. */
export class Game {
  readonly stage: Stage;
  readonly hud: Hud;
  readonly input: Input;
  readonly trackView: TrackView;
  readonly riderView = new RiderView();
  readonly backdrop = new Backdrop();
  readonly fx = new FX();
  readonly trail = new Trail();
  readonly sound = new Sound();
  readonly lines = new Lines();
  readonly cam: CameraRig;
  gen: TrackGen;
  rider: Rider;
  score = new Score();
  director = new Director(0);
  readonly omens: Omens;
  private omensSeen = 0;
  /** `?autopilot` lets the reference bot ride; `?autopilot=tricks` adds grabs (demo, smoke tests). */
  autopilot: false | "bot" | "tricks";
  /** Title screen (attract-mode ride behind it) or a real run. `?autopilot` skips the title (tests, demos). */
  mode: "title" | "play" = "play";
  /** Event types in order, for tests. */
  readonly log: string[] = [];
  private best = Number(storage("pj-best")) || 0;
  private prev = { x: 0, y: 0, pitch: 0 };
  private acc = 0;
  private last = 0;
  private clock = 0;
  private emitClock = 0;
  private tier = "";
  private backY = NaN;
  private hitstop = 0;
  private slowmo = 0;
  private freeze = 0;
  private apexDone = false;
  private bailClock = -1;
  private bailReason: BailReason = "sideways";
  private bailLine = "";
  private frozen = false;
  private ended = false;
  private wasGrabbing = false;
  private perfectStreak = 0;
  private chatterIn = 16;
  private speedQuipAt = -99;
  /** Dad Bluegill drops back in once PJ has met him; clock of his next visit. */
  private dadMet = false;
  private dadIn = 0;
  private dadAt = -99;
  constructor(
    container: HTMLElement,
    public seed: number,
  ) {
    const q = new URLSearchParams(location.search).get("autopilot");
    this.autopilot = q === null ? false : q === "tricks" ? "tricks" : "bot";
    this.stage = createStage(container);
    this.hud = new Hud(container);
    this.input = new Input(window, this.hud.pad, this.hud.grabButtons);
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.trackView = new TrackView(this.gen.track);
    this.cam = new CameraRig(this.stage.camera);
    if (new URLSearchParams(location.search).has("closeup")) this.cam.zoom = 0.28;
    this.omens = new Omens({
      scene: this.stage.scene,
      camera: this.stage.camera,
      hud: this.hud,
      sound: this.sound,
      fx: this.fx,
      backdrop: this.backdrop,
      screen: (x, y, z = 0) => this.screen(x, y, z),
    });
    this.stage.scene.add(this.backdrop.root, this.trackView.root, this.riderView.root, this.fx.root, this.trail.mesh, this.omens.root);
    this.hud.onRestart = () => this.reset();
    this.hud.onMute = () => {
      this.sound.toggle();
      this.hud.setMuted(this.sound.muted);
    };
    this.hud.setMuted(this.sound.muted);
    this.hud.onStart = () => this.startRun();
    this.hud.onMenu = () => this.toTitle();
    const unlock = () => this.sound.unlock();
    addEventListener("pointerdown", unlock);
    addEventListener("resize", () => this.stage.resize());
    addEventListener("keydown", (e) => {
      unlock();
      if (e.code === "KeyM") this.hud.onMute();
      if (this.mode === "title" && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        this.startRun();
      } else if ((e.code === "KeyR" || e.code === "Enter") && this.ended) this.reset();
      else if (e.code === "Escape" && this.ended) this.toTitle();
    });
    this.stage.resize();
    this.reset(seed);
    if (!this.autopilot) this.toTitle();
    requestAnimationFrame((t) => this.frame(t));
  }
  reset(seed = this.seed) {
    this.seed = seed;
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.rider.y = this.gen.track.heightAt(this.rider.x);
    this.score = new Score();
    this.director = new Director(seed);
    this.omensSeen = 0;
    this.omens.clear();
    this.prev = { x: this.rider.x, y: this.rider.y, pitch: this.rider.pitch };
    this.acc = 0;
    this.tier = "";
    this.backY = NaN;
    this.hitstop = this.slowmo = this.freeze = 0;
    this.bailClock = -1;
    this.frozen = this.ended = false;
    this.perfectStreak = 0;
    this.chatterIn = 12 + Math.random() * 8;
    this.dadMet = false;
    this.riderView.reassemble();
    this.fx.clear();
    this.trail.clear();
    this.hud.hang(null);
    this.trackView.reset(this.gen.track);
    this.cam.snap();
    this.hud.hideEnd();
  }
  private handle(e: SimEvent) {
    this.log.push(e.type);
    const r = this.rider,
      at = V.set(r.x, r.y, 0.3);
    switch (e.type) {
      case "pop":
        this.sound.play(e.perfect ? "perfectPop" : "pop");
        this.hud.callout(this.lines.pick(e.perfect ? "perfectPop" : "pop", this.depth), "", "pop");
        this.score.handle(e);
        break;
      case "takeoff": {
        this.input.resetDrag();
        this.apexDone = false;
        const landY = this.gen.track.nextJump(r.lipX)?.aim?.landY ?? r.y,
          hang = (r.vy + Math.sqrt(Math.max(0, r.vy * r.vy + 2 * T.airGravity * (r.y - landY)))) / T.airGravity;
        if (hang >= 1.3) {
          this.hud.callout(this.lines.pick("send", this.depth), "", "pop");
          this.hud.zoomBurst();
          this.sound.play("whoosh");
          this.cam.punch(5, 0.15);
        }
        this.fx.clods(at, 10, V2.set(r.vx * 0.25, 2.5), 2.5, "#b06a35");
        this.fx.dust(at, 6, { size: 1.2, spread: 1.4, rise: 1, life: 1.1 });
        break;
      }
      case "flip":
        this.hud.callout(`${flipName(e.dir, e.total).toUpperCase()}!`, "", e.total >= 2 ? "huge" : "trick");
        this.sound.play("trick", e.total);
        this.cam.punch(2 + e.total * 2, 0.08);
        this.fx.sparks(V.set(r.x, r.y + 1, 0.4), 10 * e.total, "#c6ff3d", 0.6);
        break;
      case "land": {
        const flowBefore = this.score.flow,
          res = this.score.handle(e)!,
          k = Math.min(1.5, e.airTime * 0.6);
        this.riderView.absorb(0.5 + 0.3 * k);
        this.fx.dust(at, Math.round(8 + 10 * k), { size: 1.4, spread: 2, rise: 0.8, life: 1.2 });
        this.fx.clods(at, 8, V2.set(r.v * 0.3, 2.5), 3, "#b06a35");
        if (e.grade === "perfect") {
          this.hitstop = 0.09;
          this.cam.punch(9, 0.35);
          const up = at.clone().setY(at.y + 1);
          this.fx.ring(up, 5, "#ffe7a0", 0.5);
          this.fx.ring(up, 3, "#c6ff3d", 0.35);
          this.fx.flash(up, 5, "#fff3c0");
          this.fx.sparks(up, 36);
          this.hud.flash();
          this.sound.play("perfect");
          if (res.points) this.sound.play("cheer");
        } else if (e.grade === "sketchy") {
          this.cam.punch(2, 0.35);
          this.sound.play("sketchy");
        } else {
          this.cam.punch(3, 0.12);
          this.sound.play("land", k);
        }
        const line = this.landingLine(res, e.airTime);
        this.hud.landing(res, line);
        this.perfectStreak = e.grade === "perfect" ? this.perfectStreak + 1 : 0;
        if (this.perfectStreak >= 3) this.hud.banner(this.lines.pick("streak", this.depth, { n: this.perfectStreak }));
        if (res.points >= 5000 && !(this.dadMet && Math.random() < 0.35 && this.dad("dadHype"))) this.sound.speak(line, 1.1, 1.05, 8);
        if (res.points) {
          const sp = this.screen(r.x, r.y + 1.6);
          this.hud.floater(`+${res.points.toLocaleString("en-US")}${res.multiplier > 1 ? ` ×${res.multiplier}` : ""}`, sp.x, sp.y, res.points >= 5000);
        }
        if (res.points >= 5000) {
          this.sound.play("airhorn");
          this.fx.confetti(at.clone().setY(at.y + 1), 60);
          this.hud.pulse("#ffd23a");
          this.hud.flash("#ffe9a8");
        }
        if (res.tricks.length && res.name !== res.tricks.join(" + ")) this.sound.play("reel");
        if (res.flowChange > 0) {
          if (this.score.flow === T.flowMax && flowBefore < T.flowMax) {
            const fire = this.lines.pick("onFire", this.depth);
            this.hud.banner(fire);
            this.sound.speak(fire, 1.2, 1.1, 6);
            this.hud.pulse("#ff6a2e");
            this.sound.play("onFire");
          } else {
            this.hud.pulse("#c6ff3d");
            this.sound.play("flowUp");
          }
        }
        break;
      }
      case "bail":
        this.bailReason = e.reason;
        this.bailLine = this.lines.pick(e.reason, this.depth);
        this.sound.speak(this.bailLine, 0.9, 1);
        this.perfectStreak = 0;
        this.riderView.yardSale({ vx: r.vx, vy: r.vy }, this.stage.scene, Math.sign(r.vx) || 1);
        this.fx.dust(at, 18, { size: 2, spread: 2.5, rise: 1, life: 1.6 });
        this.fx.clods(at, 24, V2.set(r.vx * 0.3, 4), 4, "#b06a35");
        this.cam.punch(12, 0.8);
        this.hud.flash("#ff4fa3");
        this.sound.play("bail");
        this.sound.play("slam");
        this.bailClock = 0;
        break;
      case "stalled":
        this.sound.play("stall");
        this.endRun("stalled", this.lines.pick("stalled", this.depth));
        break;
    }
  }
  /** Milestones reached this run: deeper runs unlock weirder lines. */
  private get depth() {
    return this.director.depth;
  }
  /** The landing headline: combo names get their own lines, long airs get hang-time lines, then by points and grade. */
  private landingLine(res: { name: string; points: number; grade: "perfect" | "buttery" | "clean" | "sketchy"; tricks: string[] }, airTime: number) {
    if (res.grade === "sketchy") return this.lines.pick(this.wasGrabbing ? "grabLand" : "sketchy", this.depth);
    const combo = this.lines.combo(res.name);
    if (combo && Math.random() < 0.65) return combo;
    if (airTime >= 2.2 && Math.random() < 0.45) return this.lines.pick("hang", this.depth);
    if (res.points) return this.lines.pick(landKey(res.points), this.depth);
    return this.lines.pick(res.grade, this.depth);
  }
  /** PJ's inner monologue while riding, and speed quips when really flying. */
  private chatter(dt: number, r: Rider) {
    if (this.mode !== "play" || (r.state !== "riding" && r.state !== "air")) return;
    const speed = r.state === "air" ? Math.hypot(r.vx, r.vy) : r.v;
    if (speed > 26 && this.clock - this.speedQuipAt > 14) {
      this.speedQuipAt = this.clock;
      this.hud.ticker(this.lines.pick("speed", this.depth));
      return;
    }
    if (this.dadMet && (this.dadIn -= dt) <= 0 && r.state === "riding" && this.dad("dad")) {
      this.score.award(T.dadPoints);
      this.hud.banner(`FATHERLY WISDOM +${T.dadPoints}`);
      return;
    }
    this.chatterIn -= dt;
    if (this.chatterIn > 0 || r.state !== "riding") return;
    this.chatterIn = 14 + Math.random() * 12;
    this.hud.ticker(this.lines.pick("chatter", this.depth));
  }
  /** Dad Bluegill pipes up (not too often); true if he did. */
  private dad(key: "dad" | "dadHype" | "dadBail") {
    if (this.clock - this.dadAt < 12) return false;
    this.dadAt = this.clock;
    this.dadIn = 35 + Math.random() * 25;
    this.omens.dad(this.lines.pick(key, this.depth));
    return true;
  }
  /** Test hook: summon an omen now (art review, smoke tests). */
  summon(kind: OmenKind) {
    const o = OMENS.find((x) => x.kind === kind)!;
    this.hud.omen(o.title, kind === "proudBluegill" ? "" : o.line, kind === "bassGod");
    this.startOmen(kind, o.duration);
  }
  /** Test hook: wipe out right now (smoke tests use it to capture the yard sale). */
  crash() {
    if (this.rider.state !== "riding" && this.rider.state !== "air") return;
    if (this.rider.state === "riding") Object.assign(this.rider, { vx: this.rider.v, vy: 3 });
    this.rider.state = "bailed";
    this.handle({ type: "bail", reason: "sideways" });
  }
  /** Title screen: the stunt bot rides the Daily Line behind the logo, forever. */
  toTitle() {
    this.mode = "title";
    this.autopilot = "tricks";
    this.reset();
    this.hud.showTitle(this.best, this.seed);
  }
  startRun() {
    this.sound.unlock();
    this.mode = "play";
    this.autopilot = false;
    this.hud.hideTitle();
    this.reset();
  }
  private endRun(reason: BailReason | "stalled", title: string) {
    // The attract ride just loops quietly.
    if (this.mode === "title") return this.reset();
    if (this.ended) return;
    this.ended = true;
    const total = this.score.total,
      newBest = total > this.best;
    if (newBest) {
      this.best = total;
      storage("pj-best", String(total));
      this.sound.play("best");
    }
    this.hud.showEnd({
      title,
      tip: TIPS[reason],
      score: total,
      distance: this.rider.distance,
      best: this.best,
      newBest,
      bestTrick: this.score.best?.name,
      bigAir: this.score.bestAirTime,
      depth: this.director.depth,
      omens: this.omensSeen,
    });
    if (this.dadMet && reason !== "stalled") {
      this.dadAt = -99;
      this.dad("dadBail");
    }
  }
  /** Rooster tail while pumping downhill, dust at speed, and a fire trail at max Flow. */
  private emit(dt: number, r: Rider, x: number, y: number, pitch: number) {
    if (dt <= 0 || this.riderView.yard) return;
    this.emitClock += dt;
    const rear = V.set(x - 0.55 * Math.cos(pitch), y - 0.55 * Math.sin(pitch) + 0.08, 0.25),
      slope = this.gen.track.slopeAt(r.x);
    while (this.emitClock > 0.03) {
      this.emitClock -= 0.03;
      if (r.state === "riding") {
        if (r.pump && slope < -0.05 && r.v > 8) {
          this.fx.clods(rear, 2, V2.set(-r.v * 0.35 - 1, 2.5 + r.v * 0.12), 1.6, "#9a5a2e");
          this.fx.dust(rear, 1, { size: 0.9, spread: 0.6, rise: 0.8, life: 0.8, push: -2 });
        } else if (r.v > 12 && Math.random() < 0.5) this.fx.dust(rear, 1, { size: 0.7, spread: 0.4, rise: 0.5, life: 0.7, alpha: 0.5, push: -1 });
      }
      if (this.score.flow >= T.flowMax) this.fx.fire(rear, 2);
    }
  }
  /** Shows the pop ring over the next lip for the last 0.9 s of the approach. */
  private updatePopCue(r: Rider, track: Track) {
    const jump = r.state === "riding" ? track.nextJump(r.x) : undefined,
      t = jump ? (jump.lipX - r.x) / Math.max(r.v, 1) : Infinity;
    if (!jump || t > 0.9) return this.hud.popCue(null);
    const p = new THREE.Vector3(jump.lipX, track.heightAt(jump.lipX) + 0.9, 0).project(this.stage.camera),
      rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.hud.popCue({
      t,
      sx: rect.left + ((p.x + 1) * rect.width) / 2,
      sy: rect.top + ((1 - p.y) * rect.height) / 2,
      loaded: r.preload > 0.6,
      window: T.popWindow,
      perfect: T.perfectPopWindow,
    });
  }
  /** World point → CSS pixels. */
  private screen(x: number, y: number, z = 0) {
    const p = new THREE.Vector3(x, y, z).project(this.stage.camera),
      rect = this.stage.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) * rect.width) / 2, y: rect.top + ((1 - p.y) * rect.height) / 2 };
  }
  /** The first time Dad appears he's simply proud; after that he has advice, and keeps dropping by. */
  private startOmen(kind: OmenKind, duration: number) {
    if (kind === "proudBluegill") {
      this.omens.start(kind, duration, this.dadMet ? this.lines.pick("dad", this.depth) : DAD_FIRST);
      this.dadMet = true;
      this.dadAt = this.clock;
      this.dadIn = 30 + Math.random() * 20;
    } else this.omens.start(kind, duration);
  }
  /** Depth milestones summon omens; their buffs and depth scale the score; fish rain pays per catch. */
  private deepWater(r: Rider, dt: number, x: number, y: number) {
    if (r.state === "riding" || r.state === "air") {
      const m = this.director.update(r.distance);
      if (m) {
        this.omensSeen++;
        this.score.award(m.bonus);
        this.hud.milestone(m.distance, m.bonus, this.director.depthMult);
        this.hud.omen(m.omen.title, m.omen.kind === "proudBluegill" ? "" : m.omen.line, m.omen.kind === "bassGod");
        this.hud.pulse("#8ff7ff");
        this.hud.ticker(this.lines.pick("milestone", this.depth));
        this.sound.play("depth");
        this.startOmen(m.omen.kind, m.omen.duration);
      }
    }
    this.director.tick(dt);
    this.score.bonus = this.director.mult;
    const buff = (["bassGod", "giantHook", "landTrout", "lakeSky"] as const).find((k) => this.director.active(k) > 0),
      spec = buff && { bassGod: "DIVINE BITE ×2", giantHook: "BAITED ×2", landTrout: "LAND TROUT ×1.5", lakeSky: "LAKE MODE ×1.5" }[buff];
    this.hud.badges(this.director.depthMult, spec ? `${spec} · ${Math.ceil(this.director.active(buff!))}s` : "");
    const caught = this.omens.update(dt, V.set(x, y, 0), (gx) => this.gen.track.heightAt(gx));
    if (caught) {
      this.score.award(caught * T.catchPoints);
      const sp = this.screen(x, y + 2);
      this.hud.floater(`CAUGHT ONE! +${caught * T.catchPoints}`, sp.x, sp.y, false);
    }
  }
  /** Big airs get a beat of slow motion at the top of the arc. */
  private checkApex(r: Rider, track: Track) {
    if (r.state !== "air" || this.apexDone || r.vy > 0) return;
    this.apexDone = true;
    const landY = track.nextJump(r.lipX)?.aim?.landY ?? track.heightAt(r.x + 5),
      fall = Math.sqrt(Math.max(0, (2 * (r.y - landY)) / T.airGravity));
    if (r.airTime + fall >= T.slowmoAir) {
      this.slowmo = 0.4;
      this.cam.punch(-6, 0);
    }
  }
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const real = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.hitstop = Math.max(0, this.hitstop - real);
    this.slowmo = Math.max(0, this.slowmo - real);
    this.freeze = Math.max(0, this.freeze - real);
    const scale = this.hitstop > 0 ? 0 : this.freeze > 0 ? 0.15 : this.slowmo > 0 ? 0.55 : 1,
      elapsed = real * scale,
      dt = 1 / T.simHz,
      track = this.gen.track,
      r = this.rider;
    this.acc += elapsed;
    this.clock += elapsed;
    while (this.acc >= dt) {
      this.prev = { x: r.x, y: r.y, pitch: r.pitch };
      r.flow = this.score.flow;
      const actions = this.autopilot === "tricks" ? stuntActions(r, track) : this.autopilot ? botActions(r, track) : this.input.actions();
      this.wasGrabbing = r.grabBlend > 0;
      for (const e of step(r, actions, track, dt)) this.handle(e);
      if (r.state === "riding" || r.state === "air") this.score.tick(dt, r.state === "riding", r.distance);
      this.acc -= dt;
    }
    this.checkApex(r, track);
    this.gen.ensure(r.x + 240);
    const tier = tierAt(r.x).name;
    if (tier !== this.tier) {
      if (this.tier) this.hud.banner(tier);
      this.tier = tier;
    }
    const k = this.acc / dt;
    let x = this.prev.x + (r.x - this.prev.x) * k,
      y = this.prev.y + (r.y - this.prev.y) * k,
      speed = r.state === "air" ? Math.hypot(r.vx, r.vy) : r.v;
    const pitch = this.prev.pitch + wrapAngle(r.pitch - this.prev.pitch) * k;
    if (this.riderView.yard) {
      this.riderView.updateYard(elapsed, (gx) => track.heightAt(gx));
      ({ x, y } = this.riderView.focus());
      speed = 0;
    } else
      this.riderView.update(
        { x, y, pitch, pumping: r.pump, airborne: r.state === "air", spinning: Math.abs(r.omega) > 1, grab: r.grab, grabBlend: r.grabBlend, wobble: r.wobble },
        speed,
        elapsed,
      );
    this.deepWater(r, elapsed, x, y);
    this.chatter(elapsed, r);
    this.emit(elapsed, r, x, y, pitch);
    this.trail.update(V.set(x - 0.2 * Math.cos(pitch), y + 0.9, -0.1), r.state === "air" && !this.riderView.yard, this.score.flow >= T.flowMax, elapsed);
    this.hud.hang(r.state === "air" && r.airTime > 0.9 ? r.airTime : null);
    this.fx.update(elapsed, (gx) => track.heightAt(gx));
    this.trackView.update(x);
    this.cam.update(x, y, track.heightAt(x), speed, real, innerHeight > innerWidth);
    const ground = track.heightAt(x);
    this.backY = Number.isNaN(this.backY) ? ground : this.backY + (ground - this.backY) * Math.min(1, real * 1.5);
    this.backdrop.update(this.stage.camera.position.x, this.backY, this.clock);
    this.stage.sun.position.set(x + 14, y + 18, 14);
    this.stage.sun.target.position.set(x, y, 0);
    this.stage.rim.position.set(x + 30, y + 12, -25);
    this.stage.rim.target.position.set(x, y + 1, 0);
    this.sound.flow = this.score.flow;
    this.sound.ride(speed, r.state === "riding", r.state === "air");
    this.hud.update(r, this.score.total, this.score.flow, this.best);
    this.hud.air(r);
    this.updatePopCue(r, track);
    if (this.bailClock >= 0) {
      this.bailClock += real;
      if (!this.frozen && this.bailClock > 0.35) {
        this.frozen = true;
        this.freeze = 0.6;
        this.hud.callout(this.bailLine, "", "bad");
      }
      if (this.bailClock > 1.9) this.endRun(this.bailReason, this.bailLine);
    }
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }
}
