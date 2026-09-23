import * as THREE from "three";
const UP = new THREE.Vector3(0, 1, 0);
export const WHEEL_RADIUS = 0.34;
/** Soft, slightly glossy materials that catch the warm key light and cool rim light (see the art direction). */
export const mat = (color: THREE.ColorRepresentation, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, roughness });
/** Kept as a hook for outlines; the reference art is soft-shaded, so it is a no-op. */
export function ink<M extends THREE.Mesh>(mesh: M, _scale?: [number, number, number]) {
  return mesh;
}
/** Unit cylinder stretched between two points; call again to re-aim it. */
export function aim(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a),
    len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
  return mesh;
}
export function tube(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
  const m = ink(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10), material), [1.45, 1.02, 1.45]);
  m.castShadow = true;
  parent.add(m);
  return aim(m, a, b);
}
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
export interface RiderPose {
  x: number;
  y: number;
  pitch: number;
  pumping: boolean;
  airborne: boolean;
  spinning: boolean;
  grab: number;
  grabBlend: number;
  wobble: number;
}
/** Two-bone IK: returns the joint for limbs of length l1/l2 from a to b, bending toward `bend`. */
function joint(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3) {
  const d = Math.min(a.distanceTo(b), l1 + l2 - 1e-3),
    along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
    off = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
    dir = b.clone().sub(a).normalize();
  const side = bend.clone().sub(dir.clone().multiplyScalar(bend.dot(dir))).normalize();
  return a.clone().addScaledVector(dir, along).addScaledVector(side, off);
}
interface Tumbler {
  obj: THREE.Object3D;
  vel: THREE.Vector2;
  spin: number;
  radius: number;
}
/** The dirt-jump bike plus PJ, facing +x with the contact point at the origin. Toon-shaded with ink outlines. */
export class RiderView {
  readonly root = new THREE.Group();
  readonly bike = new THREE.Group();
  readonly body = new THREE.Group();
  yard = false;
  private wheels: THREE.Group[] = [];
  private limbs: THREE.Mesh[] = [];
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private pack = new THREE.Group();
  private gear: THREE.Object3D[] = [];
  private tumblers: Tumbler[] = [];
  private crouch = 0;
  private shownGrab = 0;
  private whip = 0;
  private time = 0;
  constructor() {
    this.root.add(this.bike, this.body);
    const frame = mat("#9ad33a", 0.3),
      black = mat("#1b1b1f"),
      rim = mat("#e23b2e", 0.35);
    for (const x of [-0.55, 0.55]) {
      const w = new THREE.Group();
      w.position.set(x, WHEEL_RADIUS, 0);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.06, 0.095, 12, 32), mat("#1d1a22", 0.9));
      tyre.castShadow = true;
      w.add(tyre, new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.14, 0.035, 8, 28), rim));
      for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, (WHEEL_RADIUS - 0.1) * 2, 0.02), rim);
        spoke.rotation.z = a;
        w.add(spoke);
      }
      this.bike.add(w);
      this.wheels.push(w);
    }
    tube(this.bike, v(-0.2, 0.86), v(0.42, 0.9), 0.05, frame);
    tube(this.bike, v(0.42, 0.9), v(0, 0.4), 0.055, frame);
    tube(this.bike, v(0, 0.4), v(-0.22, 0.95), 0.045, frame);
    for (const z of [-0.06, 0.06]) {
      tube(this.bike, v(0, 0.4, z), v(-0.55, WHEEL_RADIUS, z), 0.03, frame);
      tube(this.bike, v(-0.22, 0.9, z), v(-0.55, WHEEL_RADIUS, z), 0.027, frame);
      tube(this.bike, v(0.42, 0.95, z), v(0.55, WHEEL_RADIUS, z), 0.035, frame);
    }
    tube(this.bike, v(0.42, 0.9), v(0.45, 1.1), 0.04, frame);
    tube(this.bike, v(0.45, 1.1, -0.32), v(0.45, 1.1, 0.32), 0.028, black);
    const saddle = ink(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.13), black), [1.12, 1.4, 1.2]);
    saddle.position.set(-0.24, 0.98, 0);
    this.bike.add(saddle);
    // PJ: oversized orange tee, dark pants, teal helmet, pink goggles, backpack with a lure keychain.
    const tee = mat("#ff8c2a", 0.7),
      pants = mat("#23222b", 0.8),
      teal = mat("#3fd3b0", 0.3);
    // Limbs 0–3 are legs (shin, thigh ×2), 4–7 are sleeved arms (upper, forearm ×2), matching pose().
    for (let k = 0; k < 8; k++) {
      const leg = k < 4,
        r = leg ? 0.085 : 0.065,
        limb = ink(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), leg ? pants : tee), [1.3, 1.02, 1.3]);
      limb.castShadow = true;
      this.body.add(limb);
      this.limbs.push(limb);
    }
    this.torso = ink(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 6, 14), tee), [1.14, 1.02, 1.14]);
    this.torso.castShadow = true;
    // Full-face MTB helmet seen side-on (facing +x): a long rounded shell, a chin bar jutting forward, a dark goggle
    // port with a mirrored lens, a short peak and vents.
    const shellGeo = new THREE.SphereGeometry(0.23, 28, 20),
      shell = new THREE.Mesh(shellGeo, teal),
      chin = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.2, 6, 12), teal),
      port = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.32), mat("#0f0d14", 0.6)),
      lens = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.105, 0.3), new THREE.MeshStandardMaterial({ color: "#ff5a2e", roughness: 0.12, metalness: 0.5, emissive: "#b8401a", emissiveIntensity: 0.9 })),
      shine = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.022, 0.22), new THREE.MeshBasicMaterial({ color: "#fff1d6" })),
      gogFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.135, 0.34), mat("#15121c", 0.5)),
      peak = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.026, 0.3), teal),
      strap = new THREE.Mesh(new THREE.SphereGeometry(0.233, 28, 20, 0, Math.PI * 2, 1.45, 0.2), mat("#15121c", 0.5));
    shell.scale.set(1.12, 1, 0.92);
    strap.scale.set(1.12, 1, 0.92);
    chin.rotation.z = Math.PI / 2 + 0.5;
    chin.position.set(0.15, -0.155, 0);
    chin.scale.set(1, 1, 1.45);
    port.position.set(0.2, -0.015, 0);
    gogFrame.position.set(0.235, -0.005, 0);
    lens.position.set(0.262, -0.005, 0);
    shine.position.set(0.288, 0.025, 0);
    peak.position.set(0.21, 0.14, 0);
    peak.rotation.z = -0.35;
    for (const m of [shell, chin, peak, gogFrame]) m.castShadow = true;
    this.head.add(shell, strap, chin, port, gogFrame, lens, shine, peak);
    for (const z of [-0.06, 0, 0.06]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.025), mat("#15121c", 0.6));
      vent.position.set(-0.02, 0.225, z);
      vent.rotation.z = 0.1;
      this.head.add(vent);
    }
    const bag = ink(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.34), mat("#23222b", 0.8)), [1.12, 1.08, 1.08]),
      lure = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.04), mat("#ffd23a")),
      tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 6), mat("#ff3b2f"));
    lure.position.set(-0.13, -0.21, 0.12);
    tail.position.set(-0.13, -0.31, 0.12);
    tail.rotation.z = Math.PI;
    this.pack.add(bag, lure, tail);
    this.body.add(this.torso, this.head, this.pack);
    // Yard-sale gear: water bottle, lure, bobber and the bluegill PJ was saving for later.
    const bottle = ink(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), mat("#4fc3ff"))),
      bigLure = ink(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.06), mat("#ffd23a"))),
      bobber = new THREE.Group(),
      fish = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#ff3b2f")),
      bottom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat("#ffffff"));
    bobber.add(top, bottom);
    const fishBody = ink(new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), mat("#6aa7c9")), [1.1, 1.1, 1.3]),
      fishTail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 4), mat("#ff9a3c"));
    fishBody.scale.set(1.3, 0.9, 0.35);
    fishTail.rotation.z = Math.PI / 2;
    fishTail.position.x = -0.24;
    fish.add(fishBody, fishTail);
    for (const g of [bottle, bigLure, bobber, fish]) {
      g.visible = false;
      this.gear.push(g);
      this.pack.add(g);
    }
    this.pose(0, -1, 0);
  }
  /** crouch 0…1; grab 0 Superman, 1 Tailwhip, 2 No-Hander blended in by g (spec §5.4). */
  private pose(c: number, grab: number, g: number) {
    let hip = v(-0.14, 1.22 - c * 0.38),
      lean = v(0.3 + c * 0.12, 0.5 - c * 0.14);
    if (grab === 0) {
      hip = lerpV(hip, v(-0.35, 1.3), g);
      lean = lerpV(lean, v(0.55, 0.12), g);
    }
    const shoulder = hip.clone().add(lean),
      forward = v(1, 0),
      back = v(-1, -0.3);
    let i = 0;
    for (const z of [-0.12, 0.12]) {
      let foot = v(0.02, 0.42, z);
      if (grab === 0) foot = lerpV(foot, v(-1.15, 1.3, z * 1.6), g);
      if (grab === 1) foot = lerpV(foot, v(0.05, 0.75, z * 3), g);
      const hipZ = hip.clone().setZ(z * 0.8),
        knee = joint(foot, hipZ, 0.46, 0.46, grab === 0 ? v(0, -1) : forward);
      aim(this.limbs[i++], foot, knee);
      aim(this.limbs[i++], knee, hipZ);
    }
    for (const z of [-0.26, 0.26]) {
      let hand = v(0.45, 1.1, z);
      if (grab === 2) hand = lerpV(hand, v(0.1, 1.95, z * 2.4), g);
      const sh = shoulder.clone().setZ(z * 0.7),
        elbow = joint(sh, hand, 0.32, 0.32, back);
      aim(this.limbs[i++], sh, elbow);
      aim(this.limbs[i++], elbow, hand);
    }
    aim(this.torso, hip, shoulder);
    this.head.position.copy(shoulder).add(v(0.12, 0.24));
    this.pack.position.copy(hip).lerp(shoulder, 0.6).add(v(-0.22, 0));
    this.pack.rotation.z = this.torso.rotation.z;
  }
  /** Soak up a landing: a crouch spike proportional to k (0…1). */
  absorb(k: number) {
    this.crouch = Math.max(this.crouch, Math.min(1, k));
  }
  update(p: RiderPose, speed: number, dt: number) {
    this.time += dt;
    if (p.grab >= 0) this.shownGrab = p.grab;
    this.root.position.set(p.x, p.y, 0);
    this.root.rotation.z = p.pitch + (p.wobble > 0 ? Math.sin(this.time * 45) * 0.1 * (p.wobble / 0.5) : 0);
    for (const w of this.wheels) w.rotation.z -= ((p.airborne ? speed * 0.6 : speed) * dt) / WHEEL_RADIUS;
    const target = p.pumping && !p.airborne ? 1 : p.spinning ? 0.75 : p.airborne ? 0.35 : 0;
    this.crouch += (target - this.crouch) * Math.min(1, dt * 12);
    // Tailwhip: the frame whips around the head tube while the grab is held.
    this.whip = this.shownGrab === 1 && p.grabBlend > 0 ? this.whip + dt * 14 : 0;
    this.bike.rotation.y = this.whip;
    this.pose(this.crouch, p.grabBlend > 0 ? this.shownGrab : -1, p.grabBlend);
  }
  /** Bail: PJ, the bike and PJ's gear each fly off on their own arcs into the scene (spec §7 "yard sale"). */
  yardSale(from: { vx: number; vy: number }, scene: THREE.Object3D, dir: number) {
    this.yard = true;
    this.root.updateMatrixWorld(true);
    const throwIt = (obj: THREE.Object3D, vx: number, vy: number, spin: number, radius: number) => {
      obj.visible = true;
      scene.attach(obj);
      this.tumblers.push({ obj, vel: new THREE.Vector2(vx, vy), spin, radius });
    };
    const up = Math.max(2, Math.abs(from.vy) * 0.3);
    throwIt(this.body, from.vx * 0.8, up + 4, 8 * dir, 0.35);
    throwIt(this.bike, from.vx * 1.05, up + 1.5, -12 * dir, 0.35);
    this.gear.forEach((g, i) => throwIt(g, from.vx * (0.5 + Math.random() * 0.7), up + 3 + Math.random() * 5, (Math.random() - 0.5) * 30, 0.1 + i * 0.02));
  }
  updateYard(dt: number, groundAt: (x: number) => number) {
    for (const t of this.tumblers) {
      t.vel.y -= 20 * dt;
      t.obj.position.x += t.vel.x * dt;
      t.obj.position.y += t.vel.y * dt;
      t.obj.rotation.z += t.spin * dt;
      const floor = groundAt(t.obj.position.x) + t.radius;
      if (t.obj.position.y < floor) {
        t.obj.position.y = floor;
        t.vel.y = Math.abs(t.vel.y) * 0.4;
        t.vel.x *= 0.65;
        t.spin *= 0.6;
      }
    }
  }
  /** What the camera should follow: PJ, even mid yard sale. */
  focus() {
    return this.yard ? this.body.position : this.root.position;
  }
  reassemble() {
    for (const t of this.tumblers) {
      t.obj.rotation.set(0, 0, 0);
      t.obj.position.set(0, 0, 0);
    }
    this.root.add(this.bike, this.body);
    this.bike.position.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    for (const g of this.gear) {
      g.visible = false;
      this.pack.add(g);
      g.position.set(0, 0, 0);
    }
    this.tumblers = [];
    this.yard = false;
    this.crouch = 0;
  }
}