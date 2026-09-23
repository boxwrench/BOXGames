import type { Rider } from "../sim/rider";
const $ = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!;
const ENDINGS = ["Skunked.", "Zero bites.", "Ran outta line.", "Line went slack."];
/** DOM overlay: speed, distance, the touch pump pad, a stall warning and the end card. */
export class Hud {
  readonly el = document.createElement("div");
  readonly pad: HTMLElement;
  onRestart = () => {};
  private last = 0;
  constructor(parent: HTMLElement) {
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="stats"><div><b data-speed>0</b><span>KM/H</span></div><div><b data-dist>0</b><span>M</span></div></div>
      <div class="pad" data-pad aria-label="Hold to pump"><i><span>HOLD<br>TO PUMP</span></i></div>
      <p class="tip" data-tip>Hold <kbd>Space</kbd> or the pad on the <b>downslopes</b>. Let go on the ups.</p>
      <p class="warn" data-warn>PUMP IT, PJ!</p>
      <div class="end hidden" data-end role="dialog" aria-label="Run over"><h1 data-title></h1><p data-summary></p><button data-again>SEND IT AGAIN ↻</button></div>`;
    parent.append(this.el);
    this.pad = $(this.el, "[data-pad]");
    $(this.el, "[data-again]").onclick = () => this.onRestart();
  }
  update(r: Rider) {
    const now = performance.now();
    if (now - this.last < 80) return;
    this.last = now;
    $(this.el, "[data-speed]").textContent = String(Math.round(r.v * 3.6));
    $(this.el, "[data-dist]").textContent = String(Math.floor(r.distance));
    $(this.el, "[data-warn]").classList.toggle("show", r.state === "riding" && r.stall > 0.6);
    $(this.el, "[data-tip]").classList.toggle("hidden", r.distance > 120);
  }
  showEnd(r: Rider) {
    $(this.el, "[data-title]").textContent = ENDINGS[Math.floor(Math.random() * ENDINGS.length)];
    $(this.el, "[data-summary]").textContent = `${Math.floor(r.distance)} m of trail. Pump the backsides to keep your speed.`;
    $(this.el, "[data-end]").classList.remove("hidden");
    $(this.el, "[data-again]").focus();
  }
  hideEnd() {
    $(this.el, "[data-end]").classList.add("hidden");
  }
}
