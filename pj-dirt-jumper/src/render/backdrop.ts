import * as THREE from "three";
import { mulberry32 } from "../rng";
import { softTexture } from "./fx";
const TAU = Math.PI * 2;
/** Smooth hill profile that repeats every `width` metres, so tiles join seamlessly. */
function periodicHill(width: number, amp: number, rand: () => number) {
  const waves = [1, 2, 3, 5].map((k) => ({ k, a: amp / k, p: rand() * TAU }));
  return (x: number) => waves.reduce((y, w) => y + w.a * Math.sin((TAU * w.k * x) / width + w.p), 0);
}
/** A far mountain range: peaks split into a sunlit face and a shadowed face, each with a snow cap (vertex colours). */
function peaks(width: number, rand: () => number) {
  const pos: number[] = [],
    col: number[] = [],
    c = new THREE.Color(),
    tri = (pts: number[][], color: string) => {
      c.set(color);
      for (const p of pts) {
        pos.push(p[0], p[1], 0);
        col.push(c.r, c.g, c.b);
      }
    };
  const n = 7;
  for (let i = 0; i < n; i++) {
    const xa = ((i + 0.2 + rand() * 0.6) / n) * width,
      h = 38 + rand() * 50,
      half = 45 + rand() * 45,
      x0 = xa - half,
      x1 = xa + half * (0.8 + rand() * 0.4),
      xm = xa + (rand() - 0.3) * 12,
      base = -40,
      snowH = h * (0.22 + rand() * 0.1);
    // Sun sits right of centre: right-facing slopes glow, left-facing ones sit in violet shadow.
    tri([[x0, base], [xm, base], [xa, h]], "#6c4f86");
    tri([[xm, base], [x1, base], [xa, h]], "#e59585");
    const sl = [xa - (xa - x0) * (snowH / (h - base)), h - snowH],
      sr = [xa + (x1 - xa) * (snowH / (h - base)), h - snowH],
      sm = [xa + (xm - xa) * (snowH / (h - base)), h - snowH * 1.25];
    tri([sl, sm, [xa, h]], "#b9a6da");
    tri([sm, sr, [xa, h]], "#ffe0cf");
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
/** A forested ridge silhouette: a periodic hill topped with a serrated line of pine tips. */
function forestRidge(width: number, base: number, amp: number, tree: number, rand: () => number) {
  const hill = periodicHill(width, amp, rand),
    s = new THREE.Shape();
  s.moveTo(0, -80);
  s.lineTo(0, base + hill(0));
  for (let x = 0; x < width; ) {
    const w = tree * (0.35 + rand() * 0.35),
      h = base + hill(x);
    s.lineTo(x + w / 2, h + tree * (0.8 + rand() * 0.9));
    x += w;
    s.lineTo(Math.min(x, width), base + hill(Math.min(x, width)));
  }
  s.lineTo(width, -80);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}
interface Layer {
  width: number;
  tiles: THREE.Mesh[];
}
/**
 * The golden-hour panorama from the art direction: snow-capped peaks, two forested ridges, a lake with the sun's
 * reflection and pine islands, a near tree line, drifting clouds and birds. Real 3D depth gives the parallax.
 */
export class Backdrop {
  readonly root = new THREE.Group();
  private layers: Layer[] = [];
  /** The sun (the Bass God takes its place during that omen). */
  readonly sunGroup = new THREE.Group();
  private reflection: THREE.Mesh;
  private clouds: THREE.Group[] = [];
  private birds: THREE.Line[] = [];
  private boats: THREE.Group[] = [];
  constructor() {
    const rand = mulberry32(99),
      map = softTexture();
    const layer = (geo: THREE.BufferGeometry, material: THREE.Material, width: number, z: number, y = 0) => {
      const tiles = [0, 1, 2].map(() => {
        const m = new THREE.Mesh(geo, material);
        m.position.set(0, y, z);
        this.root.add(m);
        return m;
      });
      this.layers.push({ width, tiles });
    };
    layer(peaks(760, rand), new THREE.MeshBasicMaterial({ vertexColors: true }), 760, -420, -6);
    layer(forestRidge(520, 10, 7, 5, rand), new THREE.MeshBasicMaterial({ color: "#6b4a82" }), 520, -250, -6);
    layer(forestRidge(360, 3, 4, 5, rand), new THREE.MeshBasicMaterial({ color: "#4a3a68" }), 360, -150, -6);
    // Lake: a violet mirror with the sun's golden streak, dotted with pine islands.
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(2400, 70), new THREE.MeshBasicMaterial({ color: "#7d5f9a" }));
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(0, -5.5, -105);
    this.root.add(lake);
    const glint = document.createElement("canvas");
    glint.width = 64;
    glint.height = 256;
    const gc = glint.getContext("2d")!;
    for (let i = 0; i < 90; i++) {
      gc.fillStyle = `rgba(255,${200 + Math.floor(rand() * 55)},120,${0.3 + rand() * 0.7})`;
      const w = 10 + rand() * 50 * (1 - i / 120);
      gc.fillRect(32 - w / 2, i * 2.8, w, 1.5);
    }
    const glintTex = new THREE.CanvasTexture(glint);
    this.reflection = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 66),
      new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.reflection.rotation.x = -Math.PI / 2;
    this.reflection.position.set(0, -5.4, -105);
    this.root.add(this.reflection);
    const islands = forestRidge(40, -1, 0.5, 3, rand);
    layer(islands, new THREE.MeshBasicMaterial({ color: "#3b2f55" }), 170, -122, -6);
    layer(forestRidge(240, -3, 2.5, 7, rand), new THREE.MeshBasicMaterial({ color: "#26394a" }), 240, -70, -2);
    // Bass boats on the lake, one every 300 m, with a tiny angler.
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group(),
        hull = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 1.4), new THREE.MeshBasicMaterial({ color: "#efe3d0" })),
        stripe = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.15, 1.45), new THREE.MeshBasicMaterial({ color: "#ff4fa3" })),
        motor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), new THREE.MeshBasicMaterial({ color: "#2b2233" })),
        angler = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: "#2b2233" })),
        rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 4), new THREE.MeshBasicMaterial({ color: "#2b2233" }));
      stripe.position.y = 0.1;
      motor.position.set(-2.1, 0.2, 0);
      angler.position.set(0.6, 0.7, 0);
      rod.position.set(1.8, 1.6, 0);
      rod.rotation.z = -0.8;
      b.add(hull, stripe, motor, angler, rod);
      this.root.add(b);
      this.boats.push(b);
    }
    // Sun: a hot disc wrapped in an additive glow.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(24, 48), new THREE.MeshBasicMaterial({ color: "#fff0bd", fog: false })),
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: "#ffc070", transparent: true, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    glow.scale.set(170, 170, 1);
    this.sunGroup.add(glow, disc);
    this.sunGroup.position.set(0, 30, -500);
    this.root.add(this.sunGroup);
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 7; j++) {
        const under = j >= 4,
          puff = new THREE.Sprite(
            new THREE.SpriteMaterial({ map, color: under ? "#ff9a5c" : "#b8739e", transparent: true, opacity: under ? 0.75 : 0.55, fog: false, depthWrite: false }),
          ),
          w = 18 + rand() * 22;
        puff.scale.set(w, w * (under ? 0.35 : 0.55), 1);
        puff.position.set((rand() - 0.5) * 50, under ? -3 - rand() * 2 : rand() * 5, under ? 1 : 0);
        cloud.add(puff);
      }
      cloud.position.set(0, 55 + rand() * 55, -460);
      cloud.userData.x0 = rand() * 900;
      this.root.add(cloud);
      this.clouds.push(cloud);
    }
    const birdGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0.4, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.4, 0)]);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Line(birdGeo, new THREE.LineBasicMaterial({ color: "#2a1f3a", fog: false }));
      b.position.set(20 + i * 6, 40 + i * 2, -300);
      this.root.add(b);
      this.birds.push(b);
    }
  }
  /** camX: camera x; baseY: smoothed trail height near the camera; time: seconds, for drift and flapping. */
  update(camX: number, baseY: number, time: number) {
    this.root.position.y = baseY;
    for (const { width, tiles } of this.layers) {
      const base = Math.floor(camX / width) * width;
      tiles.forEach((t, i) => (t.position.x = base + (i - 1) * width));
    }
    this.sunGroup.position.x = camX + 70;
    this.reflection.position.x = camX + 34;
    this.boats.forEach((b, i) => {
      b.position.set(Math.floor(camX / 300) * 300 + (i - 1) * 300 + 120, -5.2 + Math.sin(time * 1.3 + i) * 0.15, -95);
      b.rotation.z = Math.sin(time * 1.1 + i) * 0.03;
    });
    const wrap = (v: number, n: number) => ((v % n) + n) % n;
    for (const c of this.clouds) c.position.x = camX - 450 + wrap(c.userData.x0 - time * 0.8 - camX, 900);
    this.birds.forEach((b, i) => {
      b.position.x = camX + 60 - ((time * 3 + i * 5) % 160) + 40;
      b.scale.set(1.4, 1 + Math.sin(time * 9 + i * 2) * 0.8, 1);
    });
  }
}
