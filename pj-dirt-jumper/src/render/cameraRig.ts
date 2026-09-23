import * as THREE from "three";
/** Side-on follow camera: looks further ahead and pulls back as speed rises. */
export class CameraRig {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private snapNext = true;
  /** Multiplies the follow distance; `?closeup` sets it small for inspecting PJ. */
  zoom = 1;
  private kick = 0;
  private shake = 0;
  constructor(private camera: THREE.PerspectiveCamera) {}
  /** FOV kick (degrees) and screen shake (metres) that decay quickly — landings, bails. */
  punch(fov: number, shake: number) {
    // Negative FOV kicks zoom in (apex slow-mo); they override a smaller kick either way.
    this.kick = Math.abs(fov) > Math.abs(this.kick) ? fov : this.kick;
    this.shake = Math.max(this.shake, shake);
  }
  snap() {
    this.snapNext = true;
  }
  update(x: number, y: number, groundY: number, speed: number, dt: number, portrait: boolean) {
    // Narrow portrait screens can't afford much look-ahead or PJ slides off the left edge.
    const air = Math.max(0, y - groundY),
      ahead = portrait ? 0.5 + speed * 0.12 : 3 + speed * 0.45,
      back = ((portrait ? 22 : 9.5) + speed * 0.25 + Math.min(10, air * 0.9)) * this.zoom,
      midY = groundY + (y - groundY) * 0.6,
      z = this.zoom,
      look = new THREE.Vector3(x + ahead * z, midY + 2.5 * z + (1 - z) * 1.3, 0),
      pos = new THREE.Vector3(x + ahead * 0.8 * z, midY + (3 + speed * 0.05) * z + (1 - z) * 1.5, back);
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
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.kick *= Math.exp(-dt * 6);
    this.shake *= Math.exp(-dt * 8);
    const fov = Math.min(74, 50 + speed * 0.5 + this.kick);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
