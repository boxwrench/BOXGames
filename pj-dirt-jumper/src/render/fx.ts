import * as THREE from "three";
const PUFFS = 240,
  FIRES = 90,
  CLODS = 420,
  RINGS = 10;
interface Puff {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  grow: number;
  alpha: number;
}
/** Radial white-to-clear blob used by every soft sprite (dust, fire, clouds, glow, blurred foliage). */
export function softTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!,
    r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.45, "rgba(255,255,255,.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FIRE_RAMP = [new THREE.Color("#fff3b0"), new THREE.Color("#ffb13b"), new THREE.Color("#ff4f2e"), new THREE.Color("#5a1f3a")];
/** Pooled, allocation-free effects: dust and fire sprites, instanced dirt clods, shockwave rings and flashes. */
export class FX {
  readonly root = new THREE.Group();
  private puffs: Puff[] = [];
  private fires: Puff[] = [];
  private rings: { m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number; max: number; r: number }[] = [];
  private clodMesh: THREE.InstancedMesh;
  private cp = new Float32Array(CLODS * 3);
  private cv = new Float32Array(CLODS * 3);
  private cr = new Float32Array(CLODS * 2);
  private cl = new Float32Array(CLODS);
  private cs = new Float32Array(CLODS);
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  constructor() {
    const map = softTexture();
    const pool = (n: number, additive: boolean, into: Puff[]) => {
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(
          new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
        );
        s.visible = false;
        this.root.add(s);
        into.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 1, alpha: 1 });
      }
    };
    pool(PUFFS, false, this.puffs);
    pool(FIRES, true, this.fires);
    this.clodMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), CLODS);
    this.clodMesh.frustumCulled = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < CLODS; i++) {
      this.clodMesh.setMatrixAt(i, this.m);
      this.clodMesh.setColorAt(i, this.col.set("#8a5230"));
    }
    this.root.add(this.clodMesh);
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.visible = false;
      this.root.add(m);
      this.rings.push({ m, life: 0, max: 1, r: 1 });
    }
  }
  private spawn(pool: Puff[]) {
    return pool.find((p) => p.life <= 0) ?? pool.reduce((a, b) => (a.life < b.life ? a : b));
  }
  /** Soft billboard clouds (dust, smoke). */
  dust(at: THREE.Vector3, n: number, o: { size?: number; spread?: number; rise?: number; life?: number; color?: THREE.ColorRepresentation; alpha?: number; push?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.puffs),
        a = Math.random() * Math.PI * 2,
        r = Math.random() * (o.spread ?? 1);
      p.s.position.set(at.x + Math.cos(a) * r * 0.3, at.y + Math.random() * 0.2, at.z + Math.sin(a) * r * 0.5);
      p.v.set(Math.cos(a) * r * 1.5 + (o.push ?? 0), (0.4 + Math.random()) * (o.rise ?? 1), Math.sin(a) * r);
      p.max = p.life = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
      p.size = (o.size ?? 1) * (0.6 + Math.random() * 0.6);
      p.grow = 1.5 + Math.random();
      p.alpha = o.alpha ?? 0.7;
      p.s.material.color.set(o.color ?? "#e8c79a");
      p.s.material.rotation = Math.random() * 6;
      p.s.visible = true;
    }
  }
  /** Additive flame licks that rise, shrink and cool from white-yellow to smoke. */
  fire(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.spawn(this.fires);
      p.s.position.set(at.x + (Math.random() - 0.5) * 0.25, at.y + Math.random() * 0.2, at.z + (Math.random() - 0.5) * 0.3);
      p.v.set(-1.5 - Math.random() * 2, 1 + Math.random() * 1.5, 0);
      p.max = p.life = 0.35 + Math.random() * 0.25;
      p.size = 0.5 + Math.random() * 0.4;
      p.grow = -0.6;
      p.alpha = 1;
      p.s.visible = true;
    }
  }
  /** Dirt clods thrown with velocity vel (x, y) ± spread; they tumble, bounce on the trail and shrink away. */
  clods(at: THREE.Vector3, n: number, vel: THREE.Vector2, spread = 2, color: THREE.ColorRepresentation = "#8a5230") {
    this.col.set(color);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % CLODS;
      this.cp.set([at.x, at.y + 0.1, at.z + (Math.random() - 0.5) * 1.2], i * 3);
      this.cv.set([vel.x + (Math.random() - 0.5) * spread, vel.y + Math.random() * spread, (Math.random() - 0.5) * spread], i * 3);
      this.cr.set([Math.random() * 6, (Math.random() - 0.5) * 20], i * 2);
      this.cl[i] = 0.6 + Math.random() * 0.8;
      this.cs[i] = 0.05 + Math.random() * 0.1;
      this.clodMesh.setColorAt(i, this.col.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15));
    }
    this.clodMesh.instanceColor!.needsUpdate = true;
  }
  /** Expanding shockwave ring facing the camera. */
  ring(at: THREE.Vector3, radius: number, color: THREE.ColorRepresentation, life = 0.45) {
    const r = this.rings.find((x) => x.life <= 0) ?? this.rings[0];
    r.m.position.copy(at);
    r.m.material.color.set(color);
    r.max = r.life = life;
    r.r = radius;
    r.m.visible = true;
  }
  flash(at: THREE.Vector3, size: number, color: THREE.ColorRepresentation) {
    const p = this.spawn(this.fires);
    p.s.position.copy(at);
    p.v.set(0, 0, 0);
    p.max = p.life = 0.22;
    p.size = size;
    p.grow = 1.2;
    p.alpha = 1;
    p.s.material.color.set(color);
    p.s.visible = true;
  }
  update(dt: number, groundAt: (x: number) => number) {
    if (dt <= 0) return;
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const t = 1 - p.life / p.max;
      p.v.multiplyScalar(Math.exp(-dt * 2));
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.size * (1 + t * p.grow));
      p.s.material.opacity = p.alpha * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    for (const p of this.fires) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const t = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(Math.max(0.05, p.size * (1 + t * p.grow)));
      if (p.grow < 0) {
        const k = Math.min(FIRE_RAMP.length - 1.001, t * (FIRE_RAMP.length - 1)),
          i = Math.floor(k);
        p.s.material.color.copy(FIRE_RAMP[i]).lerp(FIRE_RAMP[i + 1], k - i);
      }
      p.s.material.opacity = p.alpha * (1 - t);
    }
    let dirty = false;
    for (let i = 0; i < CLODS; i++) {
      if (this.cl[i] <= 0) continue;
      dirty = true;
      this.cl[i] -= dt;
      const o = i * 3;
      if (this.cl[i] <= 0) {
        this.m.makeScale(0, 0, 0);
        this.clodMesh.setMatrixAt(i, this.m);
        continue;
      }
      this.cv[o + 1] -= 20 * dt;
      for (let k = 0; k < 3; k++) this.cp[o + k] += this.cv[o + k] * dt;
      this.cr[i * 2] += this.cr[i * 2 + 1] * dt;
      const floor = groundAt(this.cp[o]) + this.cs[i];
      if (this.cp[o + 1] < floor) {
        this.cp[o + 1] = floor;
        this.cv[o + 1] = Math.abs(this.cv[o + 1]) * 0.3;
        this.cv[o] *= 0.6;
        this.cr[i * 2 + 1] *= 0.6;
      }
      const s = this.cs[i] * Math.min(1, this.cl[i] / 0.3);
      this.q.setFromEuler(this.e.set(this.cr[i * 2], this.cr[i * 2] * 0.7, 0));
      this.m.compose(this.p.set(this.cp[o], this.cp[o + 1], this.cp[o + 2]), this.q, this.sc.set(s, s, s));
      this.clodMesh.setMatrixAt(i, this.m);
    }
    if (dirty) this.clodMesh.instanceMatrix.needsUpdate = true;
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.m.visible = false;
        continue;
      }
      const t = 1 - r.life / r.max;
      r.m.scale.setScalar(r.r * (1 - Math.pow(1 - t, 3)));
      r.m.material.opacity = 1 - t;
    }
  }
  clear() {
    for (const p of [...this.puffs, ...this.fires]) {
      p.life = 0;
      p.s.visible = false;
    }
    for (const r of this.rings) {
      r.life = 0;
      r.m.visible = false;
    }
    this.cl.fill(0);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < CLODS; i++) this.clodMesh.setMatrixAt(i, this.m);
    this.clodMesh.instanceMatrix.needsUpdate = true;
  }
}
