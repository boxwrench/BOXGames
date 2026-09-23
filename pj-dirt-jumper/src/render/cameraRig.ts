import * as THREE from "three";
/** Side-on follow camera: looks further ahead and pulls back as speed rises. */
export class CameraRig {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private snapNext = true;
  constructor(private camera: THREE.PerspectiveCamera) {}
  snap() {
    this.snapNext = true;
  }
  update(x: number, y: number, groundY: number, speed: number, dt: number, portrait: boolean) {
    // Narrow portrait screens can't afford much look-ahead or PJ slides off the left edge.
    const air = Math.max(0, y - groundY),
      ahead = portrait ? 0.5 + speed * 0.12 : 3 + speed * 0.45,
      back = (portrait ? 24 : 11) + speed * 0.3 + Math.min(10, air * 0.9),
      midY = groundY + (y - groundY) * 0.6,
      look = new THREE.Vector3(x + ahead, midY + 2, 0),
      pos = new THREE.Vector3(x + ahead * 0.8, midY + 3.2 + speed * 0.06, back);
    if (this.snapNext) {
      this.pos.copy(pos);
      this.look.copy(look);
      this.snapNext = false;
    } else {
      this.pos.lerp(pos, 1 - Math.exp(-dt * 5));
      this.look.lerp(look, 1 - Math.exp(-dt * 6));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    const fov = Math.min(70, 50 + speed * 0.5);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
