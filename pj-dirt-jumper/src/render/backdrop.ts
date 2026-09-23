import * as THREE from "three";
import { mulberry32 } from "../rng";
interface LayerSpec {
  z: number;
  width: number;
  height: number;
  bumps: number;
  color: string;
}
/** Near forest ridge, mid purple hills, far mountains. Real 3D depth gives the parallax. */
const LAYERS: LayerSpec[] = [
  { z: -35, width: 90, height: 6, bumps: 18, color: "#2f6b45" },
  { z: -90, width: 220, height: 20, bumps: 14, color: "#5a4f8f" },
  { z: -200, width: 480, height: 55, bumps: 10, color: "#8b6fa8" },
];
function ridge(spec: LayerSpec, rand: () => number) {
  const s = new THREE.Shape();
  s.moveTo(0, -80);
  for (let i = 0; i <= spec.bumps; i++) {
    const edge = i === 0 || i === spec.bumps,
      y = edge ? spec.height * 0.5 : spec.height * (0.3 + rand() * 0.7);
    s.lineTo((i / spec.bumps) * spec.width, y);
  }
  s.lineTo(spec.width, -80);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}
export class Backdrop {
  readonly root = new THREE.Group();
  private layers: { spec: LayerSpec; tiles: THREE.Mesh[] }[] = [];
  private ground: THREE.Mesh;
  private sun: THREE.Mesh;
  constructor() {
    const rand = mulberry32(99);
    for (const spec of LAYERS) {
      const geo = ridge(spec, rand),
        material = new THREE.MeshBasicMaterial({ color: spec.color }),
        tiles = [0, 1, 2].map(() => {
          const m = new THREE.Mesh(geo, material);
          m.position.set(0, -3, spec.z);
          this.root.add(m);
          return m;
        });
      this.layers.push({ spec, tiles });
    }
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 320), new THREE.MeshStandardMaterial({ color: "#4f8a4a", roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -1.2, -160);
    this.ground.receiveShadow = true;
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(20, 48), new THREE.MeshBasicMaterial({ color: "#fff0b0", fog: false }));
    this.sun.position.set(0, 45, -320);
    this.root.add(this.ground, this.sun);
  }
  /** camX: camera x; baseY: a smoothed trail height near the camera, so hills and fields follow the descent. */
  update(camX: number, baseY: number) {
    this.root.position.y = baseY;
    for (const { spec, tiles } of this.layers) {
      const base = Math.floor(camX / spec.width) * spec.width;
      tiles.forEach((t, i) => (t.position.x = base + (i - 1) * spec.width));
    }
    this.ground.position.x = camX;
    this.sun.position.x = camX + 60;
  }
}
