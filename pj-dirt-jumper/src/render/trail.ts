import * as THREE from "three";
const N = 48;
/** A glowing ribbon that streams behind PJ in the air and fades out after landing. */
export class Trail {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private pts: THREE.Vector3[] = [];
  private pos = new Float32Array(N * 2 * 3);
  private col = new Float32Array(N * 2 * 3);
  private fade = 0;
  private color = new THREE.Color();
  constructor() {
    const geo = new THREE.BufferGeometry(),
      index: number[] = [];
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    for (let i = 0; i < N - 1; i++) index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.mesh.frustumCulled = false;
  }
  /** at: where the ribbon starts (PJ's hips); active: airborne; hot: ON FIRE colours. */
  update(at: THREE.Vector3, active: boolean, hot: boolean, dt: number) {
    this.fade = active ? 1 : Math.max(0, this.fade - dt * 2.5);
    if (active) {
      this.pts.unshift(at.clone());
      if (this.pts.length > N) this.pts.pop();
    } else if (!this.fade) this.pts.length = 0;
    this.color.set(hot ? "#ff7a2e" : "#c6ff3d");
    for (let i = 0; i < N; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)] ?? at,
        k = this.pts.length ? 1 - i / N : 0,
        w = 0.35 * k,
        c = k * k * this.fade * 0.9;
      this.pos.set([p.x, p.y + w, p.z, p.x, p.y - w, p.z], i * 6);
      this.col.set([this.color.r * c, this.color.g * c, this.color.b * c, this.color.r * c * 0.6, this.color.g * c * 0.6, this.color.b * c * 0.6], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = this.fade > 0;
  }
  clear() {
    this.pts.length = 0;
    this.fade = 0;
    this.mesh.visible = false;
  }
}
