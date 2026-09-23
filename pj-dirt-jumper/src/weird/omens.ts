import * as THREE from "three";
import type { OmenKind } from "./director";
import { LURES, paintBassGod, paintBluegill, paintFish, paintLakeSky, paintLure } from "./art";
import bluegillPhoto from "../assets/bluegill.webp";
import bassGodPhoto from "../assets/bassgod.webp";
import landTroutPhoto from "../assets/landtrout.webp";
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
  /** The user's crowned, haloed Bass God; the painted one stands in until (or if) it fails to load. */
  private god = { tex: texture(paintBassGod()) as THREE.Texture, aspect: 1 };
  private lakeTex = texture(paintLakeSky());
  private lureTex = LURES.map((k) => texture(paintLure(k)));
  /** A soft shaft of heavenly light: bright core, feathered edges, fading out at the ground. */
  private shaft = (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d")!,
      across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(0.5, "rgba(255,255,255,1)");
    across.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = across;
    g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = "destination-in";
    const down = g.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, "rgba(0,0,0,.6)");
    down.addColorStop(0.85, "rgba(0,0,0,1)");
    down.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = down;
    g.fillRect(0, 0, 64, 256);
    return texture(c);
  })();
  private soft = softTexture();
  constructor(private stage: Stage) {
    const photo = new Image();
    photo.onload = () => (this.bluegill = photo);
    photo.src = bluegillPhoto;
    new THREE.TextureLoader().load(bassGodPhoto, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      this.god = { tex: t, aspect: (t.image as HTMLImageElement).height / (t.image as HTMLImageElement).width };
    });
  }
  /** `line` is what Dad Bluegill says when the omen is his. */
  start(kind: OmenKind, dur: number, line = "I'm proud of you, son.") {
    this.running.find((r) => r.kind === kind)?.end();
    this.running = this.running.filter((r) => r.kind !== kind);
    const make: Record<OmenKind, () => Running> = {
      bobberMoon: () => this.bobberMoon(dur),
      proudBluegill: () => this.proudBluegill(dur, line),
      fishRain: () => this.fishRain(dur),
      landTrout: () => this.landTrout(dur),
      bassGod: () => this.bassGod(dur),
      lakeSky: () => this.lakeSky(dur),
      giantHook: () => this.giantHook(dur),
      tackleBox: () => this.tackleBox(dur),
      wormRapture: () => this.wormRapture(dur),
      bassSon: () => this.bassGod(dur, true),
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
    this.stage.sound.speak("The moon is a bobber now. Do not think about it.", 0.6, 0.9);
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
  private proudBluegill(dur: number, line: string) {
    this.stage.sound.play("choir");
    this.dad(line, dur);
    return this.run("proudBluegill", dur, () => 0, () => {});
  }
  /** Dad Bluegill drops in with a word of advice, in his dad voice. */
  dad(line: string, seconds = 5 + line.length / 18) {
    this.stage.hud.bluegill(this.bluegill, line, seconds);
    this.stage.sound.speak(line, 0.7, 0.85);
  }
  /** Fish fall from the sky around PJ; any PJ touches is caught. */
  private fishRain(dur: number) {
    this.stage.sound.speak("It is raining bait. Open your mouth.", 1.3, 1.1);
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
  /** The user's Land Trout — mountains and forest on its back — swims through the hills, belly hidden by the ridge. */
  private trout = (() => {
    const t = new THREE.TextureLoader().load(landTroutPhoto);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  private landTrout(dur: number) {
    this.stage.sound.speak("Land trout sighted. Stay calm.", 0.8, 0.95);
    const fish = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 81),
      new THREE.MeshBasicMaterial({ map: this.trout, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.root.add(fish);
    this.stage.sound.play("thunder");
    return this.run(
      "landTrout",
      dur,
      (_dt, pj) => {
        const r = this.running.find((x) => x.kind === "landTrout")!,
          k = r.t / dur,
          cam = this.stage.camera.position.x,
          // Swims left through the land, rising out of the hills and diving back in like a porpoising fish.
          surface = Math.min(1, r.t / 2, (dur - r.t) / 2);
        fish.position.set(cam + 110 - k * 280, pj.y - 26 + surface * 30 + Math.sin(r.t * 1.3) * 4, -125);
        fish.rotation.z = Math.cos(r.t * 1.3) * 0.08;
        // Churned-up earth where it ploughs through the hills.
        if (Math.random() < 0.6)
          this.stage.fx.dust(new THREE.Vector3(fish.position.x - 40 + Math.random() * 80, pj.y - 8, -112), 1, { size: 14, spread: 7, rise: 2, life: 2.5, color: "#b88a5a", alpha: 0.5 });
        return 0;
      },
      () => {
        this.root.remove(fish);
        fish.geometry.dispose();
        fish.material.dispose();
      },
    );
  }
  /** Lightning strikes and the sun becomes the crowned, burning Bass God. */
  private bassGod(dur: number, son = false) {
    const { tex, aspect } = this.god,
      // Untouched by fog and tone mapping so the gold stays gold; high above the ridges so no pine blocks the view.
      god = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, depthTest: false, toneMapped: false })),
      aura = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.soft, color: "#ff9f40", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, toneMapped: false }),
      );
    god.renderOrder = 5;
    god.position.y = aura.position.y = 60;
    god.scale.set(0.01, 0.01, 1);
    aura.scale.set(0.01, 0.01, 1);
    this.stage.backdrop.sunGroup.add(aura, god);
    // The second coming: a small son (also a bass), looking up at his father, bobbing with excitement.
    const kid = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, depthTest: false, toneMapped: false }));
    kid.renderOrder = 6;
    kid.visible = son;
    this.stage.backdrop.sunGroup.add(kid);
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
    if (son) {
      this.stage.sound.speak("This is my son. He is also a bass.", 0.1, 0.7);
      setTimeout(() => this.stage.sound.speak("Hi. I'm Kevin.", 2, 1.2), 3200);
    } else this.stage.sound.speak("Behold. The bass god is pleased.", 0.1, 0.7);
    return this.run(
      son ? "bassSon" : "bassGod",
      dur,
      () => {
        const r = this.running.find((x) => x.kind === (son ? "bassSon" : "bassGod"))!,
          grow = Math.min(1, r.t / 0.6) * Math.min(1, (dur - r.t) / 0.8),
          pulse = 1 + Math.sin(r.t * 5) * 0.03;
        const w = 230 * grow * pulse;
        god.scale.set(w, w * aspect, 1);
        aura.scale.set(w * 1.5, w * 1.5, 1);
        god.material.rotation = Math.sin(r.t * 0.8) * 0.05;
        const kw = -115 * Math.min(1, Math.max(0, (r.t - 1.2) / 0.5)) * Math.min(1, (dur - r.t) / 0.8);
        kid.scale.set(kw, -kw * aspect, 1);
        kid.position.set(-175, -15 + Math.abs(Math.sin(r.t * 4)) * 14, 1);
        kid.material.rotation = Math.sin(r.t * 4) * 0.12;
        return 0;
      },
      () => {
        this.stage.backdrop.sunGroup.remove(god, aura, kid);
        kid.material.dispose();
        god.material.dispose();
        aura.material.dispose();
      },
    );
  }
  /** The sky floods: a water sky, rising bubbles, giant fish drifting overhead. */
  private lakeSky(dur: number) {
    this.stage.sound.speak("The sky is a lake. Breathe normally.", 0.9, 0.85);
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
    this.stage.sound.speak("Do not take the bait.", 0.3, 0.75);
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
  /** Giant lures drift across the sky; low ones cross PJ's path and can be snagged for points. */
  private tackleBox(dur: number) {
    this.stage.sound.speak("The tackle box is open. The lures are free.", 0.8, 0.9);
    this.stage.sound.play("reel");
    const lures: { s: THREE.Sprite; v: THREE.Vector2; spin: number; low: boolean; live: boolean }[] = [];
    let clock = 0;
    return this.run(
      "tackleBox",
      dur,
      (dt, pj) => {
        const r = this.running.find((x) => x.kind === "tackleBox")!;
        clock += dt;
        while (r.t < dur - 2 && clock > 0.35) {
          clock -= 0.35;
          const low = Math.random() < 0.45,
            s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.lureTex[Math.floor(Math.random() * this.lureTex.length)], transparent: true, fog: !low }));
          if (low) {
            // Crosses PJ's line a little ahead, at grab height.
            s.scale.set(3.2, 1.6, 1);
            s.position.set(pj.x + 26 + Math.random() * 16, pj.y + 1 + Math.random() * 4, 0.5);
          } else {
            const size = 30 + Math.random() * 35;
            s.scale.set(size, size / 2, 1);
            s.position.set(this.stage.camera.position.x + 120 + Math.random() * 60, pj.y + 20 + Math.random() * 60, -140 - Math.random() * 120);
          }
          this.root.add(s);
          lures.push({ s, v: new THREE.Vector2(low ? -2 : -14 - Math.random() * 10, low ? 0 : (Math.random() - 0.5) * 3), spin: (Math.random() - 0.5) * 1.5, low, live: true });
        }
        let caught = 0;
        for (const l of lures) {
          l.s.position.x += l.v.x * dt;
          l.s.position.y += l.v.y * dt + Math.sin(r.t * 2 + l.s.position.x) * 0.02;
          l.s.material.rotation = Math.sin(r.t * l.spin * 2) * 0.35;
          if (l.low && l.live && l.s.position.distanceTo(new THREE.Vector3(pj.x, pj.y + 1, 0.5)) < 2) {
            l.live = false;
            caught++;
            this.stage.fx.sparks(l.s.position, 14, "#ffe98a", 0.6);
            this.stage.sound.play("reel");
          }
          if (!l.live || l.s.position.x < this.stage.camera.position.x - 150) {
            l.live = false;
            this.root.remove(l.s);
          }
        }
        for (let i = lures.length - 1; i >= 0; i--) if (!lures[i].live) lures.splice(i, 1);
        return caught;
      },
      () => {
        for (const l of lures) this.root.remove(l.s);
      },
    );
  }
  /** The ground wriggles: worms burst out along the trail, then float up into golden beams. */
  private wormRapture(dur: number) {
    this.stage.sound.speak("The worms are ascending. Do not follow them.", 0.5, 0.8);
    this.stage.sound.play("thunder");
    const SEG = 9,
      COUNT = 40,
      worms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: "#e0788e", roughness: 0.55 }), COUNT * SEG),
      beams: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [],
      m = new THREE.Matrix4(),
      spots: { x: number; z: number; phase: number; up: number; delay: number }[] = [];
    worms.frustumCulled = false;
    for (let i = 0; i < 3; i++) {
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 130),
        new THREE.MeshBasicMaterial({ map: this.shaft, color: "#ffe7a0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      );
      beams.push(beam);
    }
    this.root.add(worms, ...beams);
    let origin = NaN;
    return this.run(
      "wormRapture",
      dur,
      (dt, pj, groundAt) => {
        const r = this.running.find((x) => x.kind === "wormRapture")!;
        if (Number.isNaN(origin)) {
          origin = pj.x;
          for (let i = 0; i < COUNT; i++) spots.push({ x: pj.x + 8 + i * 3.2 + Math.random() * 2, z: -1.5 - Math.random() * 7, phase: Math.random() * 6, up: 0, delay: i * 0.05 });
        }
        // Keep the congregation just ahead of PJ: worms left behind re-emerge further on.
        for (const s of spots)
          if (s.x < pj.x - 12) {
            s.x += COUNT * 3.2;
            s.up = 0;
            s.delay = r.t;
          }
        const ascend = r.t > 4 ? (r.t - 4) * 1.6 : 0;
        spots.forEach((s, i) => {
          const out = Math.min(1, Math.max(0, (r.t - s.delay) * 2)),
            lift = ascend * (1 + (i % 5) * 0.2),
            base = groundAt(s.x) - 0.6 + out * 0.6 + lift;
          for (let j = 0; j < SEG; j++) {
            const k = j / (SEG - 1),
              wig = Math.sin(r.t * 8 + s.phase + j * 0.8) * 0.3 * k;
            m.makeTranslation(s.x + wig, base + j * 0.26 * out, s.z + Math.cos(r.t * 6 + j) * 0.1);
            worms.setMatrixAt(i * SEG + j, m);
          }
        });
        worms.instanceMatrix.needsUpdate = true;
        beams.forEach((b, i) => {
          b.position.set(pj.x + 12 + i * 20, pj.y + 60, -6 - i * 2);
          b.rotation.z = 0.12 + Math.sin(r.t * 0.7 + i) * 0.03;
          b.material.opacity = Math.min(0.7, Math.max(0, (r.t - 3.2) * 0.5)) * Math.min(1, (dur - r.t) / 1.5);
        });
        // The ground itself wriggles.
        if (r.t < 4) {
          this.stage.camera.position.y += Math.sin(r.t * 40) * 0.06;
          if (Math.random() < 0.3) this.stage.fx.dust(new THREE.Vector3(pj.x + 6 + Math.random() * 30, groundAt(pj.x + 20), -3), 1, { size: 1.6, spread: 2, rise: 1, life: 1, color: "#9a6a40" });
        }
        if (r.t > 4 && r.t - dt <= 4) this.stage.sound.play("choir");
        return 0;
      },
      () => {
        this.root.remove(worms, ...beams);
        worms.dispose();
      },
    );
  }
}
