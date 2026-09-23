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
/** The dirt-jump bike, facing +x with the contact point at the origin. */
export class RiderView {
  readonly root = new THREE.Group();
  readonly bike = new THREE.Group();
  private wheels: THREE.Group[] = [];
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
  }
  update(x: number, y: number, angle: number, _pumping: boolean, speed: number, dt: number) {
    this.root.position.set(x, y, 0);
    this.root.rotation.z = angle;
    for (const w of this.wheels) w.rotation.z -= (speed * dt) / WHEEL_RADIUS;
  }
}
