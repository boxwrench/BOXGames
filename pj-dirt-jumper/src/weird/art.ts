// Canvas-painted omen art. Everything is drawn in code: no image files ship with the game.
const TAU = Math.PI * 2;
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}
/** Deterministic noise so the painting looks the same every time. */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
interface FishLook {
  /** Body half-length and half-depth. */
  rx: number;
  ry: number;
  back: string;
  flank: string;
  belly: string;
  breast?: string;
  bars: boolean;
  band: boolean;
  earFlap: boolean;
  cheeks: boolean;
  /** How far back the mouth splits (0.15 = small bluegill mouth, 0.45 = bucketmouth bass). */
  mouth: number;
  eye: number;
  seed: number;
}
type P = [number, number];
/**
 * A soft fin rooted along the body edge from a to b, bulging out (away from `from`) by h, with rays from root to rim.
 */
function fin(g: CanvasRenderingContext2D, a: P, b: P, h: number, from: P, rays: number, color: string, alpha = 0.85) {
  const mx = (a[0] + b[0]) / 2,
    my = (a[1] + b[1]) / 2;
  let nx = -(b[1] - a[1]),
    ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  if ((mx + nx - from[0]) ** 2 + (my + ny - from[1]) ** 2 < (mx - from[0]) ** 2 + (my - from[1]) ** 2) {
    nx = -nx;
    ny = -ny;
  }
  const c: P = [mx + nx * 2 * h, my + ny * 2 * h],
    rim = (t: number): P => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  g.save();
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(mx, my, mx + nx * h, my + ny * h);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(60,45,20,.35)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(...a);
  g.quadraticCurveTo(...c, ...b);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(30,22,10,.4)";
  g.lineWidth = 1.2;
  for (let i = 1; i < rays; i++) {
    const t = i / rays,
      o = rim(t);
    g.beginPath();
    g.moveTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    g.lineTo(...o);
    g.stroke();
  }
  g.restore();
}
/** Forked fan tail rooted at the caudal peduncle (x, y ± half). */
function tail(g: CanvasRenderingContext2D, x: number, y: number, half: number, reach: number, span: number, color: string) {
  const t1: P = [x - reach, y - span],
    notch: P = [x - reach * 0.72, y],
    t2: P = [x - reach, y + span];
  g.save();
  const grad = g.createLinearGradient(x, y, x - reach, y);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(60,45,20,.5)");
  g.fillStyle = grad;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.moveTo(x + 2, y - half);
  g.quadraticCurveTo(x - reach * 0.5, y - span * 0.55, ...t1);
  g.quadraticCurveTo(x - reach * 0.95, y - span * 0.35, ...notch);
  g.quadraticCurveTo(x - reach * 0.95, y + span * 0.35, ...t2);
  g.quadraticCurveTo(x - reach * 0.5, y + span * 0.55, x + 2, y + half);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(30,22,10,.4)";
  g.lineWidth = 1.2;
  for (let i = 0; i <= 12; i++) {
    const k = i / 12,
      ey = y - span + 2 * span * k,
      ex = x - reach * (0.72 + 0.28 * Math.abs(2 * k - 1));
    g.beginPath();
    g.moveTo(x, y - half + 2 * half * k);
    g.lineTo(ex, ey);
    g.stroke();
  }
  g.restore();
}
/** Paints a lifelike sunfish or bass, facing right, centred on (cx, cy). */
function realFish(g: CanvasRenderingContext2D, cx: number, cy: number, f: FishLook) {
  const { rx, ry } = f,
    rand = noise(f.seed),
    body = new Path2D();
  // Blunt, rounded head for sunfish; long and wedge-headed for bass.
  body.moveTo(cx + rx, cy + ry * 0.08);
  body.bezierCurveTo(cx + rx * 1.02, cy - ry * 0.55, cx + rx * 0.55, cy - ry * 1.05, cx, cy - ry);
  body.bezierCurveTo(cx - rx * 0.55, cy - ry * 0.95, cx - rx * 0.88, cy - ry * 0.4, cx - rx * 1.0, cy - ry * 0.2);
  body.lineTo(cx - rx * 1.0, cy + ry * 0.22);
  body.bezierCurveTo(cx - rx * 0.88, cy + ry * 0.45, cx - rx * 0.5, cy + ry * 0.98, cx, cy + ry);
  body.bezierCurveTo(cx + rx * 0.55, cy + ry, cx + rx * 1.0, cy + ry * 0.6, cx + rx, cy + ry * 0.08);
  const centre: P = [cx, cy];
  tail(g, cx - rx * 0.98, cy, ry * 0.2, rx * 0.42, ry * 0.78, f.back);
  // Spiny dorsal (front), soft dorsal (rear), anal fin.
  g.save();
  g.fillStyle = "rgba(60,70,40,.6)";
  g.strokeStyle = "rgba(30,25,12,.8)";
  g.lineWidth = 1.8;
  const spines = 10;
  g.beginPath();
  const base = (i: number) => [cx + rx * 0.35 - (i / spines) * rx * 0.6, cy - ry * (0.97 - Math.abs(i / spines - 0.5) * 0.08)] as const;
  g.moveTo(...base(0));
  for (let i = 0; i <= spines; i++) {
    const [bx, by] = base(i),
      len = ry * (0.18 + Math.sin(((i + 0.5) / (spines + 1)) * Math.PI) * 0.26);
    g.lineTo(bx - 5, by - len);
    g.lineTo(...base(Math.min(spines, i + 1)));
  }
  g.lineTo(...base(spines));
  g.closePath();
  g.fill();
  for (let i = 0; i <= spines; i++) {
    const [bx, by] = base(i),
      len = ry * (0.18 + Math.sin(((i + 0.5) / (spines + 1)) * Math.PI) * 0.26);
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx - 5, by - len);
    g.stroke();
  }
  g.restore();
  fin(g, [cx - rx * 0.24, cy - ry * 0.97], [cx - rx * 0.86, cy - ry * 0.36], ry * 0.34, centre, 11, f.back);
  fin(g, [cx - rx * 0.18, cy + ry * 0.98], [cx - rx * 0.86, cy + ry * 0.38], ry * 0.3, centre, 10, f.flank);
  // Body colouring.
  g.save();
  g.clip(body);
  const tone = g.createLinearGradient(0, cy - ry, 0, cy + ry);
  tone.addColorStop(0, f.back);
  tone.addColorStop(0.45, f.flank);
  tone.addColorStop(0.85, f.belly);
  tone.addColorStop(1, f.belly);
  g.fillStyle = tone;
  g.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  if (f.breast) {
    const breast = g.createRadialGradient(cx + rx * 0.45, cy + ry * 0.7, 5, cx + rx * 0.45, cy + ry * 0.7, ry * 0.9);
    breast.addColorStop(0, f.breast);
    breast.addColorStop(1, "rgba(255,120,30,0)");
    g.fillStyle = breast;
    g.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  }
  if (f.bars)
    for (let i = 0; i < 7; i++) {
      const x = cx + rx * 0.5 - i * rx * 0.24,
        bar = g.createLinearGradient(x - 18, 0, x + 18, 0);
      bar.addColorStop(0, "rgba(30,40,20,0)");
      bar.addColorStop(0.5, "rgba(30,40,20,.3)");
      bar.addColorStop(1, "rgba(30,40,20,0)");
      g.fillStyle = bar;
      g.fillRect(x - 18, cy - ry * 1.1, 36, ry * 1.8);
    }
  if (f.band) {
    // The largemouth's ragged dark stripe from gill to tail.
    g.fillStyle = "rgba(25,35,20,.55)";
    for (let x = cx + rx * 0.45; x > cx - rx; x -= 9) {
      const y = cy - ry * 0.05 + Math.sin(x * 0.07) * ry * 0.04;
      g.beginPath();
      g.ellipse(x, y, 11, ry * (0.11 + rand() * 0.05), 0, 0, TAU);
      g.fill();
    }
  }
  const sr = Math.max(6, ry * 0.07);
  for (let row = -16; row < 16; row++)
    for (let col = -40; col < 40; col++) {
      const x = cx + col * sr * 1.5 + (row % 2) * sr * 0.75,
        y = cy + row * sr * 1.05;
      g.strokeStyle = `rgba(20,20,10,${0.14 + rand() * 0.1})`;
      g.lineWidth = 1.1;
      g.beginPath();
      g.arc(x, y, sr, -Math.PI * 0.35, Math.PI * 0.35);
      g.stroke();
      g.strokeStyle = `rgba(255,245,200,${0.04 + rand() * 0.08})`;
      g.beginPath();
      g.arc(x - 2, y, sr - 2, -Math.PI * 0.2, Math.PI * 0.2);
      g.stroke();
    }
  g.strokeStyle = "rgba(230,220,170,.25)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx + rx * 0.5, cy - ry * 0.42);
  g.quadraticCurveTo(cx - rx * 0.1, cy - ry * 0.6, cx - rx * 0.98, cy - ry * 0.05);
  g.stroke();
  if (f.cheeks) {
    g.strokeStyle = "rgba(90,150,220,.7)";
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(cx + rx * 0.93, cy + ry * (0.08 + i * 0.12));
      g.quadraticCurveTo(cx + rx * 0.72, cy + ry * (0.13 + i * 0.14), cx + rx * 0.48, cy + ry * (0.05 + i * 0.1));
      g.stroke();
    }
  }
  // Gill cover.
  g.strokeStyle = "rgba(25,20,10,.5)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx + rx * 0.75, cy + ry * 0.05, ry * 0.65, Math.PI * 0.6, Math.PI * 1.35);
  g.stroke();
  if (f.earFlap) {
    const flap = g.createRadialGradient(cx + rx * 0.4, cy - ry * 0.1, 2, cx + rx * 0.4, cy - ry * 0.1, ry * 0.2);
    flap.addColorStop(0, "#07080f");
    flap.addColorStop(0.8, "#141a2e");
    flap.addColorStop(1, "rgba(20,26,46,0)");
    g.fillStyle = flap;
    g.beginPath();
    g.ellipse(cx + rx * 0.4, cy - ry * 0.1, ry * 0.2, ry * 0.15, -0.3, 0, TAU);
    g.fill();
  }
  const sheen = g.createLinearGradient(0, cy - ry, 0, cy - ry * 0.2);
  sheen.addColorStop(0, "rgba(255,255,230,.2)");
  sheen.addColorStop(1, "rgba(255,255,230,0)");
  g.fillStyle = sheen;
  g.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  const shade = g.createLinearGradient(0, cy + ry * 0.5, 0, cy + ry);
  shade.addColorStop(0, "rgba(40,20,0,0)");
  shade.addColorStop(1, "rgba(40,20,0,.3)");
  g.fillStyle = shade;
  g.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,255,220"},${rand() * 0.06})`;
    g.fillRect(cx - rx + rand() * rx * 2, cy - ry + rand() * ry * 2, 1.5, 1.5);
  }
  g.restore();
  g.strokeStyle = "rgba(20,25,10,.55)";
  g.lineWidth = 2;
  g.stroke(body);
  // Pectoral and pelvic fins.
  // Pectoral lies back along the flank; pelvic hangs below the breast.
  fin(g, [cx + rx * 0.5, cy + ry * 0.08], [cx + rx * 0.47, cy + ry * 0.4], rx * 0.2, [cx + rx * 2, cy + ry * 0.24], 8, "rgba(240,170,80,.75)", 0.7);
  fin(g, [cx + rx * 0.46, cy + ry * 0.86], [cx + rx * 0.22, cy + ry * 0.97], ry * 0.2, centre, 6, f.breast ? "#f1c070" : "#d8d0a0");
  // Mouth: splits back toward (or past) the eye; lower jaw juts slightly.
  const mx = cx + rx * (1 - f.mouth);
  g.strokeStyle = "#1e140a";
  g.lineWidth = f.mouth > 0.3 ? 5 : 3;
  g.beginPath();
  g.moveTo(cx + rx * 1.01, cy + ry * 0.06);
  g.quadraticCurveTo(cx + rx * (1 - f.mouth * 0.5), cy + ry * 0.2, mx, cy + ry * 0.1);
  g.stroke();
  g.strokeStyle = "rgba(255,235,200,.55)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx + rx * 1.0, cy + ry * 0.12);
  g.quadraticCurveTo(cx + rx * (1 - f.mouth * 0.5), cy + ry * 0.26, mx, cy + ry * 0.16);
  g.stroke();
  // The eye. It has seen things.
  const ex = cx + rx * 0.7,
    ey = cy - ry * 0.2,
    er = ry * f.eye,
    iris = g.createRadialGradient(ex, ey, er * 0.2, ex, ey, er);
  iris.addColorStop(0, "#1a0f05");
  iris.addColorStop(0.45, "#6b4a12");
  iris.addColorStop(0.8, "#d9a538");
  iris.addColorStop(1, "#5a3a10");
  g.fillStyle = iris;
  g.beginPath();
  g.arc(ex, ey, er, 0, TAU);
  g.fill();
  g.fillStyle = "#050303";
  g.beginPath();
  g.arc(ex + er * 0.12, ey + er * 0.05, er * 0.52, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(255,255,255,.95)";
  g.beginPath();
  g.ellipse(ex - er * 0.25, ey - er * 0.35, er * 0.22, er * 0.14, -0.5, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(255,255,255,.5)";
  g.beginPath();
  g.arc(ex + er * 0.35, ey + er * 0.3, er * 0.08, 0, TAU);
  g.fill();
  g.strokeStyle = "rgba(20,15,5,.7)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(ex, ey, er, 0, TAU);
  g.stroke();
  return { ex, ey, er };
}
/** A (deliberately too) realistic male bluegill in breeding colours. It is proud of you. */
export function paintBluegill(w = 720, h = 460) {
  const [c, g] = canvas(w, h);
  realFish(g, w * 0.52, h * 0.52, {
    rx: w * 0.3,
    ry: h * 0.3,
    back: "#39462a",
    flank: "#8a8a3e",
    belly: "#f0ac48",
    breast: "rgba(255,120,30,.85)",
    bars: true,
    band: false,
    earFlap: true,
    cheeks: true,
    mouth: 0.13,
    eye: 0.17,
    seed: 7,
  });
  return c;
}
/** The Bass God: a crowned largemouth blazing like a second sun, eye burning, halo of rays. */
export function paintBassGod(size = 640) {
  const [c, g] = canvas(size, size),
    m = size / 2,
    halo = g.createRadialGradient(m, m, size * 0.1, m, m, m);
  halo.addColorStop(0, "rgba(255,240,170,1)");
  halo.addColorStop(0.45, "rgba(255,190,90,.8)");
  halo.addColorStop(1, "rgba(255,120,60,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  g.save();
  g.translate(m, m);
  for (let i = 0; i < 28; i++) {
    g.rotate(TAU / 28);
    g.fillStyle = i % 2 ? "rgba(255,245,200,.35)" : "rgba(255,200,120,.25)";
    g.beginPath();
    g.moveTo(-8, size * 0.24);
    g.lineTo(0, size * 0.5);
    g.lineTo(8, size * 0.24);
    g.fill();
  }
  g.restore();
  const eye = realFish(g, m + size * 0.04, m + size * 0.05, {
    rx: size * 0.33,
    ry: size * 0.15,
    back: "#223d22",
    flank: "#6f8f45",
    belly: "#ece7c4",
    bars: false,
    band: true,
    earFlap: false,
    cheeks: false,
    mouth: 0.42,
    eye: 0.2,
    seed: 11,
  });
  // A burning, all-seeing eye.
  const glow = g.createRadialGradient(eye.ex, eye.ey, 1, eye.ex, eye.ey, eye.er * 2.4);
  glow.addColorStop(0, "rgba(255,255,230,1)");
  glow.addColorStop(0.3, "rgba(255,190,60,.9)");
  glow.addColorStop(1, "rgba(255,90,30,0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(eye.ex, eye.ey, eye.er * 2.4, 0, TAU);
  g.fill();
  // Crown perched on the head.
  const hx = m + size * 0.2,
    top = m - size * 0.11,
    cw = size * 0.2;
  g.save();
  g.translate(hx, top);
  g.rotate(-0.15);
  g.fillStyle = "#ffd23a";
  g.strokeStyle = "#8a5a10";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-cw / 2, 0);
  for (let i = 0; i <= 4; i++) {
    const x = -cw / 2 + (i * cw) / 4;
    g.lineTo(x, -cw * (i % 2 ? 0.25 : 0.55));
    if (i < 4) g.lineTo(x + cw / 8, -cw * 0.12);
  }
  g.lineTo(cw / 2, 0);
  g.closePath();
  g.fill();
  g.stroke();
  for (const [x, col] of [
    [-0.25, "#ff4fa3"],
    [0, "#3fd3b0"],
    [0.25, "#ff4fa3"],
  ] as [number, string][]) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x * cw, -cw * 0.08, cw * 0.05, 0, TAU);
    g.fill();
  }
  g.restore();
  return c;
}
/** A small cartoon fish for rain and sky schools. */
export function paintFish(color = "#6aa7c9", size = 128) {
  const [c, g] = canvas(size, size / 2),
    w = size,
    h = size / 2;
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(w * 0.45, h / 2, w * 0.32, h * 0.34, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(w * 0.16, h / 2);
  g.lineTo(w * 0.02, h * 0.12);
  g.lineTo(w * 0.02, h * 0.88);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(255,255,255,.35)";
  g.beginPath();
  g.ellipse(w * 0.48, h * 0.38, w * 0.2, h * 0.08, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#101010";
  g.beginPath();
  g.arc(w * 0.66, h * 0.42, h * 0.07, 0, TAU);
  g.fill();
  return c;
}
/** Water sky for The Sky Is a Lake: deep teal to bright surface with caustic ripples. */
export function paintLakeSky() {
  const [c, g] = canvas(1024, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#9ff3ff");
  grad.addColorStop(0.3, "#2fb4c9");
  grad.addColorStop(1, "#0b3b5a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  const rand = noise(3);
  g.strokeStyle = "rgba(220,255,255,.18)";
  g.lineWidth = 3;
  for (let i = 0; i < 60; i++) {
    const x = rand() * 1024,
      y = rand() * 260;
    g.beginPath();
    g.ellipse(x, y, 20 + rand() * 60, 6 + rand() * 10, rand(), 0, TAU);
    g.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 115,
      ray = g.createLinearGradient(x, 0, x + 80, 512);
    ray.addColorStop(0, "rgba(255,255,255,.25)");
    ray.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 30, 0);
    g.lineTo(x + 140, 512);
    g.lineTo(x + 60, 512);
    g.fill();
  }
  return c;
}
