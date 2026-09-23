import * as THREE from "three";
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  resize(): void;
}
/** Painted golden-hour sky: violet zenith, coral band, gold horizon, a glow where the sun sits and lit cloud streaks. */
function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!,
    grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#2a1f55");
  grad.addColorStop(0.32, "#5e3a8a");
  grad.addColorStop(0.58, "#c9607a");
  grad.addColorStop(0.78, "#ff8f4d");
  grad.addColorStop(1, "#ffc66a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  const glow = g.createRadialGradient(650, 380, 10, 650, 380, 330);
  glow.addColorStop(0, "rgba(255,236,170,.9)");
  glow.addColorStop(0.25, "rgba(255,190,110,.45)");
  glow.addColorStop(1, "rgba(255,150,90,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 1024, 512);
  // Long cloud streaks: dark violet bodies with glowing orange undersides.
  g.filter = "blur(7px)";
  const streak = (x: number, y: number, w: number, h: number, body: string, lit: string) => {
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = lit;
    g.beginPath();
    g.ellipse(x + w * 0.1, y + h * 0.45, w * 0.85, h * 0.45, 0, 0, Math.PI * 2);
    g.fill();
  };
  for (const [x, y, w, h] of [
    [230, 120, 150, 16],
    [310, 150, 110, 10],
    [800, 90, 170, 14],
    [900, 125, 120, 9],
    [560, 210, 90, 7],
    [120, 250, 100, 8],
    [980, 260, 90, 8],
  ])
    streak(x, y, w, h, "rgba(120,60,120,.35)", "rgba(255,150,90,.45)");
  g.filter = "none";
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Golden-hour scene: warm key light, pink rim light from the sun behind the ridges, violet haze. */
export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog("#c98590", 70, 560);
  scene.add(new THREE.HemisphereLight("#c7a6e6", "#4a5a2a", 1.15));
  const sun = new THREE.DirectionalLight("#ffc68a", 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  const rim = new THREE.DirectionalLight("#ff8f7a", 1.6);
  scene.add(sun, sun.target, rim, rim.target);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  const resize = () => {
    const w = container.clientWidth || innerWidth,
      h = container.clientHeight || innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  return { renderer, scene, camera, sun, rim, resize };
}
