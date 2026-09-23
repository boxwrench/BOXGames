/** Hyperspace streaks for the Pikeminnow Rocket's slipstream: stars stretch out of a vanishing point ahead of PJ. */
export class Warp {
  readonly el = document.createElement("canvas");
  private g = this.el.getContext("2d")!;
  private stars = Array.from({ length: 380 }, () => this.star(Math.random()));
  private level = 0;
  constructor() {
    this.el.className = "warp";
  }
  private star(z: number) {
    return { a: Math.random() * Math.PI * 2, z, hue: [190, 200, 280, 40][Math.floor(Math.random() * 4)] };
  }
  /** level 0…1 fades the effect in and out; draws one frame. */
  update(level: number, dt: number) {
    this.level += (level - this.level) * Math.min(1, dt * 6);
    if (this.level < 0.01) {
      if (this.el.style.opacity !== "0") this.el.style.opacity = "0";
      return;
    }
    const w = innerWidth,
      h = innerHeight,
      g = this.g;
    if (this.el.width !== w || this.el.height !== h) {
      this.el.width = w;
      this.el.height = h;
    }
    this.el.style.opacity = String(this.level);
    // The vanishing point sits ahead of PJ: the slipstream pulls to the right.
    const cx = w * (h > w ? 0.85 : 0.72),
      cy = h * 0.42,
      reach = Math.hypot(w, h),
      tint = g.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.7);
    tint.addColorStop(0, "rgba(255,255,255,0.9)");
    tint.addColorStop(0.06, "rgba(170,240,255,0.5)");
    tint.addColorStop(0.35, "rgba(80,60,200,0.25)");
    tint.addColorStop(1, "rgba(25,5,70,0.7)");
    g.clearRect(0, 0, w, h);
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i],
        z0 = s.z;
      s.z += dt * (0.5 + s.z * 2.6);
      if (s.z > 1) {
        this.stars[i] = this.star(0.02);
        continue;
      }
      const r0 = z0 * z0 * reach,
        r1 = s.z * s.z * reach + 6,
        cos = Math.cos(s.a),
        sin = Math.sin(s.a) * 0.75;
      g.strokeStyle = `hsla(${s.hue},100%,${70 + s.z * 25}%,${0.25 + s.z * 0.75})`;
      g.lineWidth = 1 + s.z * 5;
      g.beginPath();
      g.moveTo(cx + cos * r0, cy + sin * r0);
      g.lineTo(cx + cos * r1, cy + sin * r1);
      g.stroke();
    }
    g.globalCompositeOperation = "source-over";
  }
}
