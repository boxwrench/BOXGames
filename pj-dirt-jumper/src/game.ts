import { createStage, type Stage } from "./render/stage";
import { TrackView } from "./render/trackView";
import { RiderView } from "./render/riderView";
import { CameraRig } from "./render/cameraRig";
import { Input } from "./input/input";
import { Hud } from "./ui/hud";
import { TrackGen } from "./track/generate";
import { createRider, step, type Rider } from "./sim/rider";
import { T } from "./tuning";
/** Fixed-step simulation (T.simHz) with interpolated rendering. */
export class Game {
  readonly stage: Stage;
  readonly hud: Hud;
  readonly input: Input;
  readonly trackView: TrackView;
  readonly riderView = new RiderView();
  readonly cam: CameraRig;
  gen: TrackGen;
  rider: Rider;
  private prevX = 0;
  private acc = 0;
  private last = 0;
  constructor(
    container: HTMLElement,
    public seed: number,
  ) {
    this.stage = createStage(container);
    this.hud = new Hud(container);
    this.input = new Input(window, this.hud.pad);
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.prevX = this.rider.x;
    this.trackView = new TrackView(this.gen.track);
    this.cam = new CameraRig(this.stage.camera);
    this.stage.scene.add(this.trackView.root, this.riderView.root);
    this.hud.onRestart = () => this.reset();
    addEventListener("resize", () => this.stage.resize());
    addEventListener("keydown", (e) => {
      if ((e.code === "KeyR" || e.code === "Enter") && this.rider.state !== "riding") this.reset();
    });
    this.stage.resize();
    requestAnimationFrame((t) => this.frame(t));
  }
  reset(seed = this.seed) {
    this.seed = seed;
    this.gen = new TrackGen(seed);
    this.rider = createRider();
    this.prevX = this.rider.x;
    this.acc = 0;
    this.trackView.reset(this.gen.track);
    this.cam.snap();
    this.hud.hideEnd();
  }
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const elapsed = Math.min(0.1, (now - (this.last || now)) / 1000),
      dt = 1 / T.simHz,
      actions = this.input.actions();
    this.last = now;
    this.acc += elapsed;
    while (this.acc >= dt) {
      this.prevX = this.rider.x;
      for (const e of step(this.rider, actions, this.gen.track, dt)) if (e.type === "stalled") this.hud.showEnd(this.rider);
      this.acc -= dt;
    }
    this.gen.ensure(this.rider.x + 240);
    const track = this.gen.track,
      x = this.prevX + (this.rider.x - this.prevX) * (this.acc / dt),
      y = track.heightAt(x);
    this.riderView.update(x, y, track.angleAt(x), this.rider.pump, this.rider.v, elapsed);
    this.trackView.update(x);
    this.cam.update(x, y, this.rider.v, elapsed, innerHeight > innerWidth);
    this.stage.sun.position.set(x - 12, y + 22, 16);
    this.stage.sun.target.position.set(x, y, 0);
    this.hud.update(this.rider);
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }
}
