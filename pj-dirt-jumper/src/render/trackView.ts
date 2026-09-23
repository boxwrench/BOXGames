import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Track } from "../track/track";
import { mulberry32 } from "../rng";
import { softTexture } from "./fx";
const CHUNK = 40,
  STEP = 0.25,
  HALF = 1.8;
const hillMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
const dirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
const tuftMat = new THREE.MeshStandardMaterial({ color: "#9dc043", roughness: 0.9 });
const rockMat = new THREE.MeshStandardMaterial({ color: "#7a6478", roughness: 0.85, flatShading: true });
const woodMat = new THREE.MeshStandardMaterial({ color: "#8a5a36", roughness: 0.9 });
const pineMat = new THREE.MeshStandardMaterial({ color: "#244a33", roughness: 0.95, flatShading: true });
const lipWood = new THREE.MeshStandardMaterial({ color: "#d9a066", roughness: 0.7 });
const lipEdge = new THREE.MeshStandardMaterial({ color: "#fff1c9", emissive: "#ffd27a", emissiveIntensity: 0.6 });
const poleMat = new THREE.MeshStandardMaterial({ color: "#f4f0e6" });
const flagMats = [new THREE.MeshBasicMaterial({ color: "#ff4fa3", side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: "#c6ff3d", side: THREE.DoubleSide })];
const bushMat = new THREE.SpriteMaterial({ map: softTexture(), color: "#101c16", transparent: true, opacity: 0.92, depthWrite: false });
const tuftGeo = new THREE.ConeGeometry(0.1, 0.5, 4),
  rockGeo = new THREE.DodecahedronGeometry(1, 0),
  unitBox = new THREE.BoxGeometry(1, 1, 1),
  flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.7, -0.22, 0), new THREE.Vector3(0, -0.45, 0)]),
  // A layered pine: three stacked cones on a trunk, 1 m tall before scaling.
  pineGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.03, 0.05, 0.25, 5).translate(0, 0.12, 0),
    new THREE.ConeGeometry(0.34, 0.45, 7).translate(0, 0.4, 0),
    new THREE.ConeGeometry(0.26, 0.38, 7).translate(0, 0.62, 0),
    new THREE.ConeGeometry(0.17, 0.32, 7).translate(0, 0.84, 0),
  ])!;
const shared = new Set<THREE.BufferGeometry>([tuftGeo, rockGeo, unitBox, flagGeo, pineGeo]);
const C = (hex: string) => new THREE.Color(hex);
/** Dirt surface across the trail (z) with lighter edges and two darker wheel ruts. */
const TOP: [number, THREE.Color][] = [
  [HALF, C("#d9a36a")],
  [1.3, C("#c98d55")],
  [0.72, C("#b97c47")],
  [0.52, C("#9a633b")],
  [0.32, C("#c2844c")],
  [-0.32, C("#c2844c")],
  [-0.52, C("#9a633b")],
  [-0.72, C("#b97c47")],
  [-1.3, C("#c98d55")],
  [-HALF, C("#d9a36a")],
];
/** Hillside falling toward the camera: [drop, distance out from the trail edge, colour]. */
const FRONT: [number, number, THREE.Color][] = [
  [0, 0, C("#b98150")],
  [0.2, 0.35, C("#8d8a3c")],
  [0.5, 0.9, C("#7aa03a")],
  [1.6, 2.6, C("#557f31")],
  [3.6, 5, C("#35602c")],
  [8, 10, C("#223f28")],
];
/** Hillside rising behind the trail: [rise, distance back, colour]. */
const BACK: [number, number, THREE.Color][] = [
  [0, 0, C("#c99058")],
  [0.15, 0.5, C("#8fb03e")],
  [0.6, 2, C("#6f9a39")],
  [1.5, 5, C("#557f35")],
  [2.6, 10, C("#4a7439")],
  [3.4, 18, C("#34563a")],
];
/** Grid of samples × rows; pos(k, j) → vertex, colour(k, j) → colour. */
function sheet(n: number, rows: number, pos: (k: number, j: number) => [number, number, number], colour: (k: number, j: number) => THREE.Color, material: THREE.Material) {
  const positions: number[] = [],
    colours: number[] = [],
    index: number[] = [];
  for (let k = 0; k < n; k++)
    for (let j = 0; j < rows; j++) {
      positions.push(...pos(k, j));
      const c = colour(k, j);
      colours.push(c.r, c.g, c.b);
    }
  for (let k = 0; k < n - 1; k++)
    for (let j = 0; j < rows - 1; j++) {
      const a = k * rows + j,
        b = a + rows;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
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
      if (o instanceof THREE.Mesh && !shared.has(o.geometry)) o.geometry.dispose();
    });
    this.chunks.delete(i);
  }
  private build(i: number) {
    const g = new THREE.Group(),
      x0 = i * CHUNK,
      n = CHUNK / STEP + 1,
      xs = Array.from({ length: n }, (_, k) => x0 + k * STEP),
      ys = xs.map((x) => this.track.heightAt(x)),
      rand = mulberry32(i * 7919 + 1),
      // Per-sample streaks so the dirt reads as packed, raked earth.
      streak = xs.map(() => 0.9 + rand() * 0.2),
      tint = (c: THREE.Color, k: number) => c.clone().multiplyScalar(streak[k]);
    g.add(
      sheet(n, TOP.length, (k, j) => [xs[k], ys[k], TOP[j][0]], (k, j) => tint(TOP[j][1], k), dirtMat),
      sheet(n, FRONT.length, (k, j) => [xs[k], ys[k] - FRONT[j][0], HALF + FRONT[j][1]], (_k, j) => FRONT[j][2], hillMat),
      sheet(n, BACK.length, (k, j) => [xs[k], ys[k] + BACK[j][0], -HALF - BACK[j][1]], (_k, j) => BACK[j][2], hillMat),
    );
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      p = new THREE.Vector3(),
      e = new THREE.Euler();
    // Grass tufts along both trail edges.
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 70);
    for (let k = 0; k < 70; k++) {
      const x = x0 + rand() * CHUNK,
        back = k % 3 !== 0,
        z = back ? -HALF - 0.1 - rand() * 0.9 : HALF + 0.15 + rand() * 0.5,
        h = 0.6 + rand() * 0.9;
      m.compose(p.set(x, this.track.heightAt(x) + (back ? 0.12 : -0.05) + 0.2 * h, z), q.setFromEuler(e.set(0, 0, (rand() - 0.5) * 0.6)), s.set(1, h, 1));
      tufts.setMatrixAt(k, m);
    }
    g.add(tufts);
    // Rocks on the hillsides.
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 4);
    for (let k = 0; k < 4; k++) {
      const x = x0 + rand() * CHUNK,
        back = k < 3,
        size = 0.35 + rand() * 0.8;
      m.compose(
        p.set(x, this.track.heightAt(x) + (back ? 0.4 + size * 0.3 : -0.9), back ? -3 - rand() * 4 : HALF + 2.5),
        q.setFromEuler(e.set(rand(), rand() * 3, rand())),
        s.set(size * 1.3, size * 0.7, size),
      );
      rocks.setMatrixAt(k, m);
    }
    rocks.castShadow = true;
    g.add(rocks);
    // Big pines on the hill behind the trail.
    const count = 6,
      pines = new THREE.InstancedMesh(pineGeo, pineMat, count);
    for (let k = 0; k < count; k++) {
      const x = x0 + rand() * CHUNK,
        back = 5 + rand() * 12,
        h = 4 + rand() * 6;
      m.compose(p.set(x, this.track.heightAt(x) + 0.3 + back * 0.18, -HALF - back), q.identity(), s.set(h * 0.9, h, h * 0.9));
      pines.setMatrixAt(k, m);
    }
    pines.castShadow = true;
    g.add(pines);
    // A split-rail fence along some stretches.
    if (rand() < 0.4) {
      const start = x0 + rand() * (CHUNK - 14);
      for (let x = start; x <= start + 12; x += 3) {
        const post = new THREE.Mesh(unitBox, woodMat);
        post.scale.set(0.14, 1.1, 0.14);
        post.position.set(x, this.track.heightAt(x) + 0.55 + 0.16, -HALF - 1.2);
        post.castShadow = true;
        g.add(post);
        if (x + 3 <= start + 12)
          for (const h of [0.55, 0.9]) {
            const a = new THREE.Vector3(x, this.track.heightAt(x) + h + 0.16, -HALF - 1.15),
              b = new THREE.Vector3(x + 3, this.track.heightAt(x + 3) + h + 0.16, -HALF - 1.15),
              rail = new THREE.Mesh(unitBox, woodMat);
            rail.position.copy(a).lerp(b, 0.5);
            rail.scale.set(a.distanceTo(b), 0.09, 0.07);
            rail.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
            g.add(rail);
          }
      }
    }
    // Soft dark foliage right in front of the camera: reads as out-of-focus foreground.
    for (let k = 0; k < 3; k++) {
      const x = x0 + rand() * CHUNK,
        bush = new THREE.Sprite(bushMat),
        size = 3 + rand() * 4;
      bush.scale.set(size * 1.4, size, 1);
      bush.position.set(x, this.track.heightAt(x) - 2.4 - rand(), 5 + rand() * 2);
      g.add(bush);
    }
    for (const jump of this.track.jumps) if (jump.lipX >= x0 && jump.lipX < x0 + CHUNK) g.add(this.lip(jump.lipX));
    return g;
  }
  /** A wooden lip plank with a glowing edge and two flags, so riders can see exactly where to pop. */
  private lip(lipX: number) {
    const g = new THREE.Group(),
      angle = this.track.angleAt(lipX - 0.01),
      y = this.track.heightAt(lipX),
      plank = new THREE.Mesh(unitBox, lipWood),
      edge = new THREE.Mesh(unitBox, lipEdge);
    g.position.set(lipX, y, 0);
    plank.scale.set(1.8, 0.1, HALF * 2 - 0.2);
    plank.position.set(-0.9 * Math.cos(angle), -0.9 * Math.sin(angle) + 0.04, 0);
    plank.rotation.z = angle;
    edge.scale.set(0.12, 0.14, HALF * 2 - 0.1);
    edge.position.y = 0.06;
    plank.castShadow = edge.castShadow = true;
    g.add(plank, edge);
    [-1, 1].forEach((side, i) => {
      const pole = new THREE.Mesh(unitBox, poleMat),
        flag = new THREE.Mesh(flagGeo, flagMats[i]);
      pole.scale.set(0.06, 2.2, 0.06);
      pole.position.set(0, 1.1, side * (HALF + 0.35));
      flag.position.set(0.03, 2.2, side * (HALF + 0.35));
      g.add(pole, flag);
    });
    return g;
  }
}
