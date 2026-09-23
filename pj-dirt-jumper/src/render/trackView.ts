import * as THREE from "three";
import type { Track } from "../track/track";
import { mulberry32 } from "../rng";
const CHUNK = 40,
  STEP = 0.25,
  HALF = 1.8,
  FLOOR = -12;
const dirt = new THREE.MeshStandardMaterial({ color: "#c9824a", roughness: 0.95, side: THREE.DoubleSide });
const soil = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
const grass = new THREE.MeshStandardMaterial({ color: "#6cc04a", roughness: 0.9, side: THREE.DoubleSide });
const tuftGeo = new THREE.ConeGeometry(0.14, 0.45, 5);
/** Triangle strip over pairs of vertices: [a0, b0, a1, b1, …]. */
function strip(positions: number[], material: THREE.Material, colors?: number[]) {
  const geo = new THREE.BufferGeometry(),
    index: number[] = [];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  for (let k = 0; k < positions.length / 6 - 1; k++) {
    const a = 2 * k;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
/** Builds the trail in 40 m chunks just ahead of the camera and frees them just behind it. */
export class TrackView {
  readonly root = new THREE.Group();
  private chunks = new Map<number, THREE.Group>();
  constructor(private track: Track) {}
  reset(track: Track) {
    for (const i of [...this.chunks.keys()]) this.drop(i);
    this.track = track;
  }
  update(camX: number) {
    const first = Math.floor((camX - 60) / CHUNK),
      last = Math.floor((camX + 120) / CHUNK);
    for (const i of [...this.chunks.keys()]) if (i < first || i > last) this.drop(i);
    for (let i = Math.max(0, first); i <= last; i++)
      if (!this.chunks.has(i) && (i + 1) * CHUNK <= this.track.end) {
        const g = this.build(i);
        this.chunks.set(i, g);
        this.root.add(g);
      }
  }
  private drop(i: number) {
    const g = this.chunks.get(i)!;
    this.root.remove(g);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) if (o.geometry !== tuftGeo) o.geometry.dispose();
    });
    this.chunks.delete(i);
  }
  private build(i: number) {
    const g = new THREE.Group(),
      x0 = i * CHUNK,
      n = CHUNK / STEP + 1,
      top: number[] = [],
      face: number[] = [],
      faceColors: number[] = [],
      bank: number[] = [],
      upper = new THREE.Color("#b0673a"),
      lower = new THREE.Color("#3a2418");
    for (let k = 0; k < n; k++) {
      const x = x0 + k * STEP,
        y = this.track.heightAt(x);
      top.push(x, y, HALF, x, y, -HALF);
      face.push(x, y, HALF, x, FLOOR, HALF);
      faceColors.push(upper.r, upper.g, upper.b, lower.r, lower.g, lower.b);
      bank.push(x, y, -HALF, x, y + 0.35, -HALF - 0.6);
    }
    const surface = strip(top, dirt);
    surface.receiveShadow = true;
    g.add(surface, strip(face, soil, faceColors), strip(bank, grass));
    const rand = mulberry32(i * 7919 + 1),
      tufts = new THREE.InstancedMesh(tuftGeo, grass, 18),
      m = new THREE.Matrix4();
    for (let k = 0; k < 18; k++) {
      const x = x0 + rand() * CHUNK;
      m.makeTranslation(x, this.track.heightAt(x) + 0.35, -HALF - 0.2 - rand() * 0.5);
      tufts.setMatrixAt(k, m);
    }
    g.add(tufts);
    return g;
  }
}
