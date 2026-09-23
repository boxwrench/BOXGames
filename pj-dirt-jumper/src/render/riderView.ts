import * as THREE from "three";
const UP = new THREE.Vector3(0, 1, 0);
export const WHEEL_RADIUS = 0.34;
export const mat = (color: THREE.ColorRepresentation, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, roughness });
/** Unit cylinder stretched between two points; call again to re-aim it. */
export function aim(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a),
    len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
  return mesh;
}
export function tube(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10), material);
  m.castShadow = true;
  parent.add(m);
  return aim(m, a, b);
}
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
export interface RiderPose {
  x: number;
  y: number;
  pitch: number;
  pumping: boolean;
  airborne: boolean;
  /** Grab being held (−1 none) and its blend 0…1. */
  grab: number;
  grabBlend: number;
  wobble: number;
}
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
/** Two-bone IK: returns the joint for limbs of length l1/l2 from a to b, bending toward `bend`. */
function joint(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3) {
  const d = Math.min(a.distanceTo(b), l1 + l2 - 1e-3),
    along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
    off = Math.sqrt(Math.max(0, l1 * l1 - along * along)),
    dir = b.clone().sub(a).normalize();
  const side = bend.clone().sub(dir.clone().multiplyScalar(bend.dot(dir))).normalize();
  return a.clone().addScaledVector(dir, along).addScaledVector(side, off);
}
/** The dirt-jump bike plus PJ, facing +x with the contact point at the origin. */
export class RiderView {
  readonly root = new THREE.Group();
  readonly bike = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private limbs: THREE.Mesh[] = [];
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private pack: THREE.Group;
  private crouch = 0;
  private shownGrab = 0;
  private whip = 0;
  private time = 0;
  constructor() {
    this.root.add(this.bike);
    const frame = mat("#c6ff3d", 0.35),
      black = mat("#1b1b1f", 0.8),
      rim = mat("#ff4fa3", 0.4);
    for (const x of [-0.55, 0.55]) {
      const w = new THREE.Group();
      w.position.set(x, WHEEL_RADIUS, 0);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.04, 0.065, 10, 28), black);
      tyre.castShadow = true;
      w.add(tyre, new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.1, 0.025, 6, 24), rim));
      for (const a of [0, Math.PI / 2]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, (WHEEL_RADIUS - 0.1) * 2, 0.02), rim);
        spoke.rotation.z = a;
        w.add(spoke);
      }
      this.bike.add(w);
      this.wheels.push(w);
    }
    tube(this.bike, v(-0.2, 0.86), v(0.42, 0.9), 0.045, frame);
    tube(this.bike, v(0.42, 0.9), v(0, 0.4), 0.05, frame);
    tube(this.bike, v(0, 0.4), v(-0.22, 0.95), 0.04, frame);
    for (const z of [-0.06, 0.06]) {
      tube(this.bike, v(0, 0.4, z), v(-0.55, WHEEL_RADIUS, z), 0.028, frame);
      tube(this.bike, v(-0.22, 0.9, z), v(-0.55, WHEEL_RADIUS, z), 0.025, frame);
      tube(this.bike, v(0.42, 0.95, z), v(0.55, WHEEL_RADIUS, z), 0.032, frame);
    }
    tube(this.bike, v(0.42, 0.9), v(0.45, 1.1), 0.035, frame);
    tube(this.bike, v(0.45, 1.1, -0.3), v(0.45, 1.1, 0.3), 0.025, black);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.12), black);
    saddle.position.set(-0.24, 0.98, 0);
    this.bike.add(saddle);
    // PJ: oversized orange tee, dark pants, teal helmet, goggles, backpack with a lure keychain.
    const tee = mat("#ff8a3d", 0.8),
      pants = mat("#2c2f4a", 0.9),
      skin = mat("#f1c29a", 0.7);
    // Limbs 0–3 are legs (shin, thigh ×2), 4–7 are sleeved arms (upper, forearm ×2), matching pose().
    for (let k = 0; k < 8; k++) {
      const leg = k < 4,
        r = leg ? 0.075 : 0.055,
        limb = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), leg ? pants : tee);
      limb.castShadow = true;
      this.root.add(limb);
      this.limbs.push(limb);
    }
    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 1, 10), tee);
    this.torso.castShadow = true;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin),
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat("#18b5a4", 0.3)),
      visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.26), mat("#18b5a4", 0.3)),
      goggles = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), mat("#ff4fa3", 0.2));
    helmet.position.y = 0.02;
    visor.position.set(0.14, 0.08, 0);
    goggles.position.set(0.14, 0.02, 0);
    this.head.add(face, helmet, visor, goggles);
    this.pack = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.3), mat("#3553a8", 0.8)),
      lure = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.03), mat("#ffd23a", 0.3)),
      tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 6), mat("#ff3b2f", 0.3));
    lure.position.set(-0.12, -0.2, 0.1);
    tail.position.set(-0.12, -0.29, 0.1);
    tail.rotation.z = Math.PI;
    this.pack.add(bag, lure, tail);
    this.root.add(this.torso, this.head, this.pack);
    this.pose(0, -1, 0);
  }
  /** crouch 0…1; grab 0 Superman, 1 Tailwhip, 2 No-Hander blended in by g (spec §5.4). */
  private pose(c: number, grab: number, g: number) {
    let hip = v(-0.14, 1.22 - c * 0.38),
      lean = v(0.3 + c * 0.1, 0.5 - c * 0.12);
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
    this.head.position.copy(shoulder).add(v(0.1, 0.24));
    this.pack.position.copy(hip).lerp(shoulder, 0.6).add(v(-0.2, 0));
    this.pack.rotation.z = this.torso.rotation.z;
  }
  update(p: RiderPose, speed: number, dt: number) {
    this.time += dt;
    if (p.grab >= 0) this.shownGrab = p.grab;
    this.root.position.set(p.x, p.y, 0);
    this.root.rotation.z = p.pitch + (p.wobble > 0 ? Math.sin(this.time * 45) * 0.1 * (p.wobble / 0.5) : 0);
    for (const w of this.wheels) w.rotation.z -= ((p.airborne ? speed * 0.6 : speed) * dt) / WHEEL_RADIUS;
    const target = p.pumping && !p.airborne ? 1 : p.airborne ? 0.35 : 0;
    this.crouch += (target - this.crouch) * Math.min(1, dt * 14);
    // Tailwhip: the frame whips around the head tube while the grab is held.
    this.whip = this.shownGrab === 1 && p.grabBlend > 0 ? this.whip + dt * 14 : 0;
    this.bike.rotation.y = this.whip;
    this.pose(this.crouch, p.grabBlend > 0 ? this.shownGrab : -1, p.grabBlend);
  }
}
