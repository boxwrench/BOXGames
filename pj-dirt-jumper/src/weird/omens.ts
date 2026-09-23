import * as THREE from "three";
import type { OmenKind } from "./director";
import { paintBassGod, paintBluegill, paintFish, paintLakeSky } from "./art";
import bluegillPhoto from "../assets/bluegill.webp";
import { softTexture, type FX } from "../render/fx";
import type { Sound } from "../audio/sound";
import type { Hud } from "../ui/hud";
import type { Backdrop } from "../render/backdrop";
const texture = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hud: Hud;
  sound: Sound;
  fx: FX;
  backdrop: Backdrop;
  /** Screen position of a world point, for DOM effects. */
  screen: (x: number, y: number, z?: number) => { x: number; y: number };
}
interface Running {
  kind: OmenKind;
  t: number;
  dur: number;
  update(dt: number, pj: THREE.Vector3, groundAt: (x: number) => number): number;
  end(): void;
}
interface Faller {
  s: THREE.Sprite;
  v: THREE.Vector2;
  spin: number;
  life: number;
}
/** Stages each omen: 3D props in the world, DOM overlays, sounds. Presentation only — never touches physics. */
export class Omens {
  readonly root = new THREE.Group();
  private running: Running[] = [];
  private fishTex = ["#6aa7c9", "#e3923a", "#7fb35a", "#d8c24a"].map((c) => texture(paintFish(c)));
  /** The user's photo-real bluegill; the painted one stands in until (or if) it fails to load. */
  private bluegill: HTMLImageElement | HTMLCanvasElement = paintBluegill();
  private godTex = texture(paintBassGod());
  private lakeTex = texture(paintLakeSky());
  private soft = softTexture();
  constructor(private stage: Stage) {
    const photo = new Image();
    photo.onload = () => (this.bluegill = photo);
    photo.src = bluegillPhoto;
  }
  start(kind: OmenKind, dur: number) {
    this.running.find((r) => r.kind === kind)?.end();
    this.running = this.running.filter((r) => r.kind !== kind);
    const make: Record<OmenKind, () => Running> = {
      bobberMoon: () => this.bobberMoon(dur),
      proudBluegill: () => this.proudBluegill(dur),
      fishRain: () => this.fishRain(dur),
      landBass: () => this.landBass(dur),
      bassGod: () => this.bassGod(dur),
      lakeSky: () => this.lakeSky(dur),
      giantHook: () => this.giantHook(dur),
    };
    this.running.push(make[kind]());
  }
  /** Advances every running omen; returns how many fish PJ caught this frame. */
  update(dt: number, pj: THREE.Vector3, groundAt: (x: number) => number) {
    let caught = 0;
    for (const r of this.running) {
      r.t += dt;
      caught += r.update(dt, pj, groundAt);
      if (r.t >= r.dur) r.end();
    }
    this.running = this.running.filter((r) => r.t < r.dur);
    return caught;
  }
  clear() {
    for (const r of this.running) r.end();
    this.running = [];
  }
  private run(kind: OmenKind, dur: number, update: Running["update"], end: () => void): Running {
    return { kind, t: 0, dur, update, end };
  }
  /** A giant red-and-white bobber rises as the moon, its line running up out of the sky. */
  private bobberMoon(dur: number) {
    const g = new THREE.Group(),
      top = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ff3b2f", fog: false })),
      bottom = new THREE.Mesh(new THREE.SphereGeometry(14, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#fff4e8", fog: false })),
      stem = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 6, 10), new THREE.MeshBasicMaterial({ color: "#ff3b2f", fog: false })),
      line = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 400, 4), new THREE.MeshBasicMaterial({ color: "#1b1233", fog: false })),
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: "#ffd0c0", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    stem.position.y = 16;
    line.position.y = 219;
    glow.scale.set(80, 80, 1);
    g.add(glow, top, bottom, stem, line);
    this.root.add(g);
    this.stage.sound.play("bubbles");
    return this.run(
      "bobberMoon",
      dur,
      (_dt, pj) => {
        const r = this.running.find((x) => x.kind === "bobberMoon")!,
          rise = Math.min(1, r.t / 4) * (r.t > dur - 3 ? Math.max(0, (dur - r.t) / 3) : 1);
        g.position.set(this.stage.camera.position.x + 95, pj.y + 30 + rise * 75 + Math.sin(r.t * 1.6) * 2.5, -420);
        g.rotation.z = Math.sin(r.t * 1.1) * 0.06;
        return 0;
      },
      () => this.root.remove(g),
    );
  }
  /** The lifelike bluegill slides in to tell PJ it's proud of them. */
  private proudBluegill(dur: number) {
    this.stage.hud.bluegill(this.bluegill, "I'm proud of you, son.", dur);
    this.stage.sound.play("choir");
    this.stage.sound.speak("I'm proud of you, son.", 0.7, 0.85);
    return this.run("proudBluegill", dur, () => 0, () => {});
  }
  /** Fish fall from the sky around PJ; any PJ touches is caught. */
  private fishRain(dur: number) {
    const fish: Faller[] = [];
    let clock = 0;
    this.stage.sound.play("bubbles");
    return this.run(
      "fishRain",
      dur,
      (dt, pj, groundAt) => {
        const r = this.running.find((x) => x.kind === "fishRain")!;
        clock += dt;
        while (r.t < dur - 1.5 && clock > 0.07) {
          clock -= 0.07;
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fishTex[Math.floor(Math.random() * 4)], transparent: true }));
          s.scale.set(1.6, 0.8, 1);
          s.position.set(pj.x - 4 + Math.random() * 34, pj.y + 14 + Math.random() * 8, (Math.random() - 0.5) * 2.5);
          this.root.add(s);
          fish.push({ s, v: new THREE.Vector2((Math.random() - 0.5) * 2, -3 - Math.random() * 3), spin: (Math.random() - 0.5) * 8, life: 6 });
        }
        let caught = 0;
        for (const f of fish) {
          f.life -= dt;
          f.v.y -= 9 * dt;
          f.s.position.x += f.v.x * dt;
          f.s.position.y += f.v.y * dt;
          f.s.material.rotation += f.spin * dt;
          const floor = groundAt(f.s.position.x) + 0.35;
          if (f.s.position.y < floor) {
            f.s.position.y = floor;
            f.v.y = Math.abs(f.v.y) * 0.5 + 2; // flop
            f.spin *= -1.3;
          }
          if (f.life > 0 && f.s.position.distanceTo(new THREE.Vector3(pj.x, pj.y + 1, 0)) < 1.6) {
            f.life = 0;
            caught++;
            this.stage.fx.sparks(f.s.position, 10, "#8ff7ff", 0.5);
            this.stage.sound.play("splash");
          }
          if (f.life <= 0) this.root.remove(f.s);
        }
        for (let i = fish.length - 1; i >= 0; i--) if (fish[i].life <= 0) fish.splice(i, 1);
        return caught;
      },
      () => {
        for (const f of fish) this.root.remove(f.s);
      },
    );
  }
  /** A colossal bass dorsal fin carves through the far hills. */
  private landBass(dur: number) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    const spines = 11;
    for (let i = 0; i <= spines; i++) {
      const x = i * 6,
        h = 16 + Math.sin((i / spines) * Math.PI) * 26;
      shape.lineTo(x + 1, h);
      shape.lineTo(x + 5, h * 0.72);
    }
    shape.lineTo(spines * 6 + 20, 22);
    shape.quadraticCurveTo(spines * 6 + 30, 8, spines * 6 + 26, 0);
    shape.lineTo(0, 0);
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: "#6f8f45", side: THREE.DoubleSide, transparent: true, opacity: 0.92 })),
      edge = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: "#1f2f18", side: THREE.DoubleSide }));
    edge.scale.set(1.03, 1.04, 1);
    edge.position.z = -0.5;
    // Spines: dark rods from the back to each fin tip.
    const spineMat = new THREE.MeshBasicMaterial({ color: "#1f2f18" }),
      g = new THREE.Group();
    for (let i = 0; i <= spines; i++) {
      const h = 16 + Math.sin((i / spines) * Math.PI) * 26,
        rod = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.2), spineMat);
      rod.position.set(i * 6 + 1, h / 2, 0.3);
      g.add(rod);
    }
    // The broad green back the fin rides on, with the bass's dark stripe.
    const back = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: "#3d5a2c" })),
      stripe = new THREE.Mesh(new THREE.PlaneGeometry(120, 3), new THREE.MeshBasicMaterial({ color: "#1f2f18" }));
    back.scale.set(95, 16, 1);
    back.position.set(40, -4, 0.5);
    stripe.position.set(40, -8, 0.6);
    g.add(edge, fin, back, stripe);
    g.scale.set(-1.1, 1.1, 1); // swims leftward, spines trailing
    this.root.add(g);
    this.stage.sound.play("thunder");
    return this.run(
      "landBass",
      dur,
      (_dt, pj) => {
        const r = this.running.find((x) => x.kind === "landBass")!,
          k = r.t / dur,
          cam = this.stage.camera.position.x;
        g.position.set(cam + 170 - k * 360, pj.y - 16 + Math.sin(r.t * 1.4) * 2.5 + Math.min(1, r.t, dur - r.t) * 8, -120);
        g.rotation.z = Math.sin(r.t * 0.9) * 0.05;
        // Churned-up earth where it ploughs through the hills.
        if (Math.random() < 0.5) this.stage.fx.dust(new THREE.Vector3(g.position.x - 20 + Math.random() * 60, g.position.y - 4, -110), 1, { size: 12, spread: 6, rise: 2, life: 2.5, color: "#b88a5a", alpha: 0.5 });
        return 0;
      },
      () => this.root.remove(g),
    );
  }
  /** Lightning strikes and the sun becomes the crowned, burning Bass God. */
  private bassGod(dur: number) {
    const god = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.godTex, transparent: true, fog: false, depthWrite: false }));
    god.scale.set(0.01, 0.01, 1);
    this.stage.backdrop.sunGroup.add(god);
    const strike = () => {
      const sun = this.stage.backdrop.sunGroup.getWorldPosition(new THREE.Vector3()),
        p = this.stage.screen(sun.x, sun.y, sun.z);
      this.stage.hud.lightning(p.x, p.y);
      this.stage.hud.flash("#f4f0ff");
      this.stage.sound.play("thunder");
    };
    strike();
    setTimeout(strike, 180);
    this.stage.sound.play("choir");
    this.stage.sound.speak("Behold. The bass god is pleased.", 0.1, 0.7);
    return this.run(
      "bassGod",
      dur,
      () => {
        const r = this.running.find((x) => x.kind === "bassGod")!,
          grow = Math.min(1, r.t / 0.6) * Math.min(1, (dur - r.t) / 0.8),
          pulse = 1 + Math.sin(r.t * 5) * 0.03;
        god.scale.setScalar(200 * grow * pulse);
        god.material.rotation = Math.sin(r.t * 0.8) * 0.08;
        return 0;
      },
      () => {
        this.stage.backdrop.sunGroup.remove(god);
        god.material.dispose();
      },
    );
  }
  /** The sky floods: a water sky, rising bubbles, giant fish drifting overhead. */
  private lakeSky(dur: number) {
    const scene = this.stage.scene,
      oldBg = scene.background,
      fog = scene.fog as THREE.Fog,
      oldFog = fog.color.clone(),
      school: THREE.Sprite[] = [],
      bubbles: THREE.Sprite[] = [];
    scene.background = this.lakeTex;
    fog.color.set("#2a8fa6");
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fishTex[i % 4], transparent: true, opacity: 0.85, fog: false }));
      s.scale.set(26 + i * 6, 13 + i * 3, 1);
      s.userData = { y: 30 + i * 11, speed: 5 + i * 1.5, off: i * 70 };
      this.root.add(s);
      school.push(s);
    }
    for (let i = 0; i < 40; i++) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: "#dffcff", transparent: true, opacity: 0.55, depthWrite: false }));
      b.scale.setScalar(0.2 + Math.random() * 0.5);
      b.userData = { x: Math.random() * 60 - 20, y: Math.random() * 20, z: -2 - Math.random() * 12, v: 1 + Math.random() * 2 };
      this.root.add(b);
      bubbles.push(b);
    }
    this.stage.sound.play("bubbles");
    return this.run(
      "lakeSky",
      dur,
      (dt, pj) => {
        const r = this.running.find((x) => x.kind === "lakeSky")!,
          cam = this.stage.camera.position.x;
        for (const s of school) {
          const d = s.userData as { y: number; speed: number; off: number };
          s.position.set(cam + 160 - ((r.t * d.speed + d.off) % 320), pj.y + d.y + Math.sin(r.t + d.off) * 2, -220);
        }
        for (const b of bubbles) {
          const d = b.userData as { x: number; y: number; z: number; v: number };
          d.y += d.v * dt;
          if (d.y > 22) d.y = 0;
          b.position.set(pj.x + d.x + Math.sin(r.t * 2 + d.z) * 0.4, pj.y + d.y, d.z);
        }
        if (Math.random() < dt * 0.6) this.stage.sound.play("bubbles");
        return 0;
      },
      () => {
        scene.background = oldBg;
        fog.color.copy(oldFog);
        for (const s of [...school, ...bubbles]) this.root.remove(s);
      },
    );
  }
  /** A giant hook and wriggling worm lower from the heavens ahead of PJ, then yank away. */
  private giantHook(dur: number) {
    const steel = new THREE.MeshStandardMaterial({ color: "#c9d2dc", metalness: 0.85, roughness: 0.25 }),
      curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 6, 0),
        new THREE.Vector3(0, 1.5, 0),
        new THREE.Vector3(-0.3, -0.5, 0),
        new THREE.Vector3(-1.4, -1.3, 0),
        new THREE.Vector3(-2.6, -0.6, 0),
        new THREE.Vector3(-2.8, 0.8, 0),
      ]),
      hook = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.22, 10), steel),
      barb = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), steel),
      eye = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.15, 8, 16), steel),
      line = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 120, 4), new THREE.MeshBasicMaterial({ color: "#e8f4ff" })),
      wormCurve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(-1.4 + Math.sin(i) * 0.35, -1.2 - i * 0.28, Math.cos(i) * 0.3))),
      worm = new THREE.Mesh(new THREE.TubeGeometry(wormCurve, 30, 0.2, 8), new THREE.MeshStandardMaterial({ color: "#ff7fa5", roughness: 0.6 })),
      g = new THREE.Group();
    barb.position.set(-2.75, 1.2, 0);
    barb.rotation.z = 0.2;
    eye.position.y = 6.4;
    line.position.y = 66.4;
    g.add(hook, barb, eye, line, worm);
    g.scale.setScalar(1.3);
    this.root.add(g);
    this.stage.sound.play("reel");
    return this.run(
      "giantHook",
      dur,
      (_dt, pj) => {
        const r = this.running.find((x) => x.kind === "giantHook")!,
          down = Math.min(1, r.t / 2.2),
          yank = r.t > dur - 0.9 ? (r.t - (dur - 0.9)) / 0.9 : 0;
        g.position.set(pj.x + 11 - down * 3, pj.y + 30 - down * 25 + yank * yank * 70, -1.5);
        g.rotation.z = Math.sin(r.t * 1.7) * 0.12;
        worm.rotation.y = Math.sin(r.t * 9) * 0.5;
        if (yank > 0 && yank < 0.05) this.stage.sound.play("reel");
        return 0;
      },
      () => this.root.remove(g),
    );
  }
}
