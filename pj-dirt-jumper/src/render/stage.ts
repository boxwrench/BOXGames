import * as THREE from "three";
export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  resize(): void;
}
function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 512;
  const g = c.getContext("2d")!,
    grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#241a4f");
  grad.addColorStop(0.45, "#8a4f9e");
  grad.addColorStop(0.75, "#ff8a5c");
  grad.addColorStop(1, "#ffd59a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Golden-hour scene: gradient sky, warm key light that follows the rider, fog that melts into the horizon. */
export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog("#ffb489", 60, 260);
  scene.add(new THREE.HemisphereLight("#ffe2c4", "#5a4a7a", 1.4));
  const sun = new THREE.DirectionalLight("#ffc27a", 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  const resize = () => {
    const w = container.clientWidth || innerWidth,
      h = container.clientHeight || innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  return { renderer, scene, camera, sun, resize };
}
