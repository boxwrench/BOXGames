import type { BailReason, Grade, Rider, Trick } from "../sim/rider";
const $ = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!;
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
export const GRAB_NAMES = ["Superman", "Tailwhip", "No-Hander"] as const;
const GRAB_ICONS = ["🐟", "🎣", "🐠"];
const GRADES: Record<Grade, [string, string]> = {
  perfect: ["PERFECT!", "BUTTERED AND BATTERED"],
  buttery: ["Buttery.", ""],
  clean: ["Clean.", ""],
  sketchy: ["Sketchy…", "wobbly landing"],
};
const ENDINGS: Record<BailReason | "stalled", string[]> = {
  stalled: ["Skunked.", "Zero bites.", "Ran outta line."],
  cased: ["Cased it.", "Snagged the knuckle."],
  huck: ["Huck to flat, bro.", "Flat-landed. Ouch."],
  sideways: ["Yard sale!", "Landed sideways."],
  grab: ["Forgot to let go.", "Still holding the grab!"],
};
const TIPS: Record<BailReason | "stalled", string> = {
  stalled: "Pump the backsides to keep your speed.",
  cased: "Too short. Pump harder and pop the lip.",
  huck: "Overshot the landing. Save the pop for bigger gaps.",
  sideways: "Line the bike up with the landing before you touch down.",
  grab: "Let go of the grab before you land.",
};
const FLIP_WORDS = ["", "", "DOUBLE ", "TRIPLE ", "QUAD "];
export const flipName = (dir: "back" | "front", n: number) => `${FLIP_WORDS[Math.min(n, 4)]}${dir.toUpperCase()}FLIP`;
export const trickLine = (tricks: Trick[]) =>
  tricks.map((t) => (t.kind === "flip" ? flipName(t.dir, t.n) : GRAB_NAMES[t.grab].toUpperCase())).join(" + ");
/** DOM overlay: stats, touch controls, callouts, tier banner and the end card. */
export class Hud {
  readonly el = document.createElement("div");
  readonly pad: HTMLElement;
  readonly grabButtons: HTMLElement[];
  onRestart = () => {};
  private last = 0;
  private calloutTimer = 0;
  private bannerTimer = 0;
  constructor(parent: HTMLElement) {
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="stats"><div><b data-speed>0</b><span>KM/H</span></div><div><b data-dist>0</b><span>M</span></div></div>
      <div class="pad" data-pad aria-label="Hold to pump, drag to spin"><i><span>HOLD · PUMP<br>DRAG · SPIN</span></i></div>
      <div class="grabs">${GRAB_NAMES.map((n, i) => `<button data-grab aria-label="${n}"><span>${GRAB_ICONS[i]}</span><b>${n}</b><kbd>${"JKL"[i]}</kbd></button>`).join("")}</div>
      <p class="tip" data-tip><span class="kb">Hold <kbd>Space</kbd> on downslopes · release on the lip to <b>pop</b> · <kbd>←</kbd><kbd>→</kbd> flip · <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> grab</span><span class="touch">Hold left side on downslopes · let go on the lip to <b>pop</b> · drag to flip · 🐟🎣🐠 grab</span></p>
      <p class="warn" data-warn>PUMP IT, PJ!</p>
      <div class="callout" data-callout><b></b><span></span></div>
      <div class="banner" data-banner></div>
      <div class="end hidden" data-end role="dialog" aria-label="Run over"><h1 data-title></h1><p data-summary></p><button data-again>SEND IT AGAIN ↻</button></div>`;
    parent.append(this.el);
    this.pad = $(this.el, "[data-pad]");
    this.grabButtons = [...this.el.querySelectorAll<HTMLElement>("[data-grab]")];
    $(this.el, "[data-again]").onclick = () => this.onRestart();
  }
  update(r: Rider) {
    const now = performance.now();
    if (now - this.last < 80) return;
    this.last = now;
    $(this.el, "[data-speed]").textContent = String(Math.round((r.state === "air" ? Math.hypot(r.vx, r.vy) : r.v) * 3.6));
    $(this.el, "[data-dist]").textContent = String(Math.floor(r.distance));
    $(this.el, "[data-warn]").classList.toggle("show", r.state === "riding" && r.stall > 0.6);
    $(this.el, "[data-tip]").classList.toggle("hidden", r.distance > 150);
  }
  callout(text: string, sub = "", tone: "trick" | "grade" | "pop" | "bad" = "trick") {
    const el = $(this.el, "[data-callout]");
    el.className = `callout show ${tone}`;
    el.querySelector("b")!.textContent = text;
    el.querySelector("span")!.textContent = sub;
    void el.offsetWidth; // restart the pop-in animation
    el.classList.add("go");
    clearTimeout(this.calloutTimer);
    this.calloutTimer = window.setTimeout(() => el.classList.remove("show", "go"), 1300);
  }
  grade(grade: Grade, tricks: Trick[]) {
    const [title, sub] = GRADES[grade];
    this.callout(title, tricks.length ? trickLine(tricks) : sub, grade === "sketchy" ? "bad" : "grade");
  }
  banner(text: string) {
    const el = $(this.el, "[data-banner]");
    el.textContent = text.toUpperCase();
    el.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.remove("show"), 2200);
  }
  showEnd(r: Rider, reason: BailReason | "stalled") {
    $(this.el, "[data-title]").textContent = pick(ENDINGS[reason]);
    $(this.el, "[data-summary]").textContent = `${Math.floor(r.distance)} m of trail. ${TIPS[reason]}`;
    $(this.el, "[data-end]").classList.remove("hidden");
    $(this.el, "[data-again]").focus();
  }
  hideEnd() {
    $(this.el, "[data-end]").classList.add("hidden");
  }
}
