import * as THREE from "three";
import { createStage, type Stage } from "./render/stage";
import { TrackView } from "./render/trackView";
import { RiderView } from "./render/riderView";
import { CameraRig } from "./render/cameraRig";
import { Backdrop } from "./render/backdrop";
import { Input } from "./input/input";
import { Hud, flipName } from "./ui/hud";
import { TrackGen } from "./track/generate";
import { tierAt } from "./track/tiers";
import { createRider, step, wrapAngle, type BailReason, type Rider, type SimEvent } from "./sim/rider";
import { botActions } from "./sim/bot";
import { T } from "./tuning";
interface Tumble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  t: number;
  reason: BailReason;
}
/** Fixed-step simulation (T.simHz) with interpolated rendering. */
export class Game {
  readonly stage: Stage;
  readonly hud: Hud;
  readonly input: Input;
  readonly trackView: TrackView;
  readonly riderView = new RiderView();
  readonly backdrop = new Backdrop();
  readonly cam: CameraRig;
  gen: TrackGen;
  rider: Rider;
  /** When true the reference bot rides (demo, smoke tests). */
  autopilot = new URLSearchParams(location.search).has("autopilot");
  /** Event types in order, for tests. */
  readonly log: string[] = [];
  private prev = { x: 0, y: 0, pitch: 0 };
  private acc = 0;
  private last = 0;
  private tumble?: Tumble;
  private tier = "";
  /** Smoothed trail height the backdrop sits on. */
  private backY = NaN;
  constructor(
    container: HTMLElement,
    public seed: number,
  ) {
    this.stage = createStage(container);
    this.hud = new Hud(container);
    this.input = new Input(window, this.hud.pad, this.hud.grabButtons);
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.trackView = new TrackView(this.gen.track);
    this.cam = new CameraRig(this.stage.camera);
    this.stage.scene.add(this.backdrop.root, this.trackView.root, this.riderView.root);
    this.hud.onRestart = () => this.reset();
    addEventListener("resize", () => this.stage.resize());
    addEventListener("keydown", (e) => {
      if ((e.code === "KeyR" || e.code === "Enter") && (this.rider.state === "stalled" || (this.tumble && this.tumble.t > 1.3))) this.reset();
    });
    this.stage.resize();
    this.reset(seed);
    requestAnimationFrame((t) => this.frame(t));
  }
  reset(seed = this.seed) {
    this.seed = seed;
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.rider.y = this.gen.track.heightAt(this.rider.x);
    this.prev = { x: this.rider.x, y: this.rider.y, pitch: this.rider.pitch };
    this.acc = 0;
    this.tumble = undefined;
    this.tier = "";
    this.backY = NaN;
    this.trackView.reset(this.gen.track);
    this.cam.snap();
    this.hud.hideEnd();
  }
  private handle(e: SimEvent) {
    this.log.push(e.type);
    switch (e.type) {
      case "pop":
        this.hud.callout(e.perfect ? "PERFECT POP!" : "POPPED!", "", "pop");
        break;
      case "takeoff":
        this.input.resetDrag();
        break;
      case "flip":
        this.hud.callout(flipName(e.dir, e.total) + "!");
        break;
      case "land":
        this.hud.grade(e.grade, e.tricks);
        break;
      case "bail": {
        const r = this.rider;
        this.tumble = { x: r.x, y: r.y, vx: r.vx, vy: Math.abs(r.vy) * 0.3 + 2, rot: r.pitch, spin: (Math.random() < 0.5 ? -1 : 1) * 9, t: 0, reason: e.reason };
        break;
      }
      case "stalled":
        this.hud.showEnd(this.rider, "stalled");
        break;
    }
  }
  /** A quick scripted yard sale (the full version arrives in M3). */
  private updateTumble(t: Tumble, dt: number) {
    const was = t.t;
    t.t += dt;
    t.vy -= T.gravity * dt;
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.rot += t.spin * dt;
    const ground = this.gen.track.heightAt(t.x);
    if (t.y < ground) {
      t.y = ground;
      t.vy = Math.abs(t.vy) * 0.35;
      t.vx *= 0.7;
      t.spin *= 0.7;
    }
    if (was < 1.3 && t.t >= 1.3) this.hud.showEnd(this.rider, t.reason);
  }
  /** Shows the pop ring over the next lip for the last 0.9 s of the approach. */
  private updatePopCue(r: Rider, track: TrackGen["track"]) {
    const jump = r.state === "riding" && !this.tumble ? track.nextJump(r.x) : undefined,
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
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const elapsed = Math.min(0.1, (now - (this.last || now)) / 1000),
      dt = 1 / T.simHz,
      track = this.gen.track,
      r = this.rider;
    this.last = now;
    this.acc += elapsed;
    while (this.acc >= dt) {
      this.prev = { x: r.x, y: r.y, pitch: r.pitch };
      const actions = this.autopilot ? botActions(r, track) : this.input.actions();
      for (const e of step(r, actions, track, dt)) this.handle(e);
      this.acc -= dt;
    }
    this.gen.ensure(r.x + 240);
    const tier = tierAt(r.x).name;
    if (tier !== this.tier) {
      if (this.tier) this.hud.banner(tier);
      this.tier = tier;
    }
    const k = this.acc / dt;
    let x = this.prev.x + (r.x - this.prev.x) * k,
      y = this.prev.y + (r.y - this.prev.y) * k,
      pitch = this.prev.pitch + wrapAngle(r.pitch - this.prev.pitch) * k,
      speed = r.state === "air" ? Math.hypot(r.vx, r.vy) : r.v;
    if (this.tumble) {
      this.updateTumble(this.tumble, elapsed);
      ({ x, y, rot: pitch } = this.tumble);
      speed = Math.abs(this.tumble.vx);
    }
    this.riderView.update(
      { x, y, pitch, pumping: r.pump, airborne: r.state === "air" || !!this.tumble, grab: r.grab, grabBlend: r.grabBlend, wobble: r.wobble },
      speed,
      elapsed,
    );
    this.trackView.update(x);
    this.cam.update(x, y, track.heightAt(x), speed, elapsed, innerHeight > innerWidth);
    const ground = track.heightAt(x);
    this.backY = Number.isNaN(this.backY) ? ground : this.backY + (ground - this.backY) * Math.min(1, elapsed * 1.5);
    this.backdrop.update(this.stage.camera.position.x, this.backY);
    this.stage.sun.position.set(x - 12, y + 22, 16);
    this.stage.sun.target.position.set(x, y, 0);
    this.updatePopCue(r, track);
    this.hud.update(r);
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }
}
