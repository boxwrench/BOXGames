import * as THREE from "three";
import pikeminnowPhoto from "../assets/pikeminnow.webp";
import type { FX } from "../render/fx";
import { T } from "../tuning";
/** Seconds for each part of the ride: swoop in and hook PJ, the slipstream, the drop back to earth. */
const CATCH = 0.9,
  WARP = 3.2,
  DROP = 0.6,
  /** Fish length, m; PJ is about 1.8 m tall. */
  LEN = 5.5,
  /** Height above the trail while in the slipstream. */
  HOVER = 7;
export interface TowPose {
  x: number;
  y: number;
  pitch: number;
  speed: number;
  /** 0…1 strength of the hyperspace effect. */
  warp: number;
  phase: "catch" | "warp" | "drop";
}
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/**
 * The Pikeminnow Rocket (the user's art): on a big air it swoops in, PJ grabs the strap, and it tows PJ through the
 * slipstream far down the trail before letting go over a landing. The game owns the physics hand-off (sim/slipstream).
 */
export class PikeminnowRocket {
  readonly root = new THREE.Group();
  private fish: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private tether: THREE.Line;
  private t = 0;
  private running = false;
  private from = { x: 0, y: 0 };
  private pj = { x: 0, y: 0 };
  private warpEnd = { x: 0, y: 0 };
  private dropX = 0;
  private fishPos = new THREE.Vector3();
  constructor(private fx: FX) {
    const tex = new THREE.TextureLoader().load(pikeminnowPhoto, (t) => {
      const img = t.image as HTMLImageElement;
      this.fish.scale.y = img.height / img.width / 0.316;
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    // The art faces left; mirrored so the rocket flies right, down the trail.
    this.fish = new THREE.Mesh(
      new THREE.PlaneGeometry(LEN, LEN * 0.316),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.fish.rotation.y = Math.PI;
    this.tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: "#3a2412" }));
    this.root.add(this.fish, this.tether);
    this.root.visible = false;
  }
  get active() {
    return this.running;
  }
  /** Which part of the ride it's in (while active). */
  get phase(): TowPose["phase"] {
    return this.t < CATCH ? "catch" : this.t < CATCH + WARP ? "warp" : "drop";
  }
  /** Where the slipstream spits PJ out; set by start. */
  get landing() {
    return this.dropX;
  }
  start(x: number, y: number, dropX: number) {
    this.running = true;
    this.t = 0;
    this.from = { x, y };
    this.pj = { x, y };
    this.dropX = dropX;
    this.fishPos.set(x - 30, y + 9, 0.3);
    this.fish.material.opacity = 1;
    this.root.visible = true;
  }
  stop() {
    this.running = false;
    this.root.visible = false;
  }
  /** Advances the ride; returns PJ's pose, or null once PJ has touched down (the game then drops the rider). */
  update(dt: number, groundAt: (x: number) => number, angleAt: (x: number) => number): TowPose | null {
    if (!this.running) return null;
    this.t += dt;
    const t = this.t,
      prevX = this.pj.x;
    let phase: TowPose["phase"] = "catch",
      warp = 0,
      pitch = 0.08;
    const touchX = this.dropX - T.maxSpeed * DROP;
    if (t < CATCH) {
      // PJ hangs at the top of the arc while the fish swoops in from behind.
      this.pj.x = this.from.x + 3 * t;
      this.pj.y = this.from.y + 0.6 * Math.sin((t / CATCH) * Math.PI);
      const k = 1 - Math.pow(1 - t / CATCH, 3);
      this.fishPos.lerpVectors(new THREE.Vector3(this.from.x - 30, this.from.y + 9, 0.3), this.anchor(), k);
    } else if (t < CATCH + WARP) {
      phase = "warp";
      const u = (t - CATCH) / WARP,
        x0 = this.from.x + 3 * CATCH;
      warp = Math.min(1, u * 5, (1 - u) * 6);
      this.pj.x = x0 + (touchX - x0) * ease(u);
      const target = Math.max(groundAt(this.pj.x), groundAt(this.pj.x + 20)) + HOVER + Math.sin(t * 7) * 0.4;
      this.pj.y += (target - this.pj.y) * Math.min(1, dt * 4);
      pitch = 0.05 + Math.sin(t * 7) * 0.04;
      this.warpEnd = { ...this.pj };
      this.fishPos.copy(this.anchor());
    } else if (t < CATCH + WARP + DROP) {
      // Let go: the rocket peels away into the sky and PJ falls onto the landing.
      phase = "drop";
      const u = (t - CATCH - WARP) / DROP,
        groundY = groundAt(this.dropX);
      this.pj.x = touchX + (this.dropX - touchX) * u;
      this.pj.y = this.warpEnd.y + (groundY - this.warpEnd.y) * u * u;
      pitch = 0.05 + (angleAt(this.dropX) - 0.05) * u;
      this.fishPos.x += 60 * dt;
      this.fishPos.y += 40 * u * dt;
      this.fish.material.opacity = 1 - u;
    } else {
      this.stop();
      return null;
    }
    this.fish.position.copy(this.fishPos);
    this.fish.rotation.z = phase === "drop" ? 0.35 : Math.sin(t * 9) * 0.03;
    const flame = new THREE.Vector3(this.fishPos.x - LEN / 2, this.fishPos.y + 0.5, 0.35);
    if (this.fish.material.opacity > 0.3) this.fx.fire(flame, phase === "warp" ? 4 : 2);
    // PJ hangs on to the rocket's strap by a tow line from the handlebars.
    const strap = new THREE.Vector3(this.fishPos.x - 1.05, this.fishPos.y + 0.15, 0.3),
      bars = new THREE.Vector3(this.pj.x + 0.7, this.pj.y + 1.35, 0.1);
    this.tether.visible = phase !== "drop";
    this.tether.geometry.setFromPoints([strap, bars]);
    return { x: this.pj.x, y: this.pj.y, pitch, speed: Math.abs(this.pj.x - prevX) / Math.max(dt, 1e-3), warp, phase };
  }
  /** Where the fish rides relative to PJ once hooked on. */
  private anchor() {
    return new THREE.Vector3(this.pj.x + 2.9, this.pj.y + 2.3, 0.3);
  }
}
