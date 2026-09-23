import type { Rider } from "../sim/rider";
import type { AirScore } from "../score/score";
import { GRAB_NAMES, flipName } from "../score/score";
import { Warp } from "./warp";
const $ = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!;
const GRAB_ICONS = ["🐟", "🎣", "🐠"];
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export interface RunSummary {
  depth: number;
  omens: number;
  title: string;
  tip: string;
  score: number;
  distance: number;
  best: number;
  newBest: boolean;
  bestTrick?: string;
  bigAir: number;
}
/** DOM overlay: stats, score, Flow meter, live trick feed, touch controls, callouts, pop cue and the results card. */
export class Hud {
  readonly el = document.createElement("div");
  readonly pad: HTMLElement;
  readonly grabButtons: HTMLElement[];
  onRestart = () => {};
  onMute = () => {};
  onStart = () => {};
  onMenu = () => {};
  private last = 0;
  private feedText = "";
  private calloutTimer = 0;
  private bannerTimer = 0;
  /** Pikeminnow Rocket hyperspace streaks. */
  readonly warp = new Warp();
  constructor(parent: HTMLElement) {
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="speedlines" data-speedlines></div>
      <div class="zoomlines" data-zoom></div>
      <div class="edge" data-edge></div>
      <div class="flash" data-flash></div>
      <div class="floaters" data-floaters></div>
      <div class="hang" data-hang></div>
      <div class="stats"><div><b data-speed>0</b><span>KM/H</span></div><div><b data-dist>0</b><span>M</span></div></div>
      <div class="topright"><div class="score"><b data-score>0</b><span>SCORE</span><small data-best></small></div><button class="mute" data-mute aria-label="Toggle sound">🔊</button></div>
      <div class="flow" data-flow aria-label="Flow"><span>FLOW</span><i></i><i></i><i></i><i></i><i></i><b>ON FIRE</b></div>
      <div class="badges"><span class="depth" data-depth></span><span class="buff" data-buff></span></div>
      <div class="omen" data-omen><b></b><span></span></div>
      <div class="ticker" data-ticker><i>💭</i><span></span></div>
      <div class="bluegill" data-bluegill><p></p></div>
      <svg class="bolt" data-bolt viewBox="0 0 100 100" preserveAspectRatio="none"><polyline /></svg>
      <div class="feed" data-feed></div>
      <div class="pad" data-pad aria-label="Hold to pump, drag to spin"><i><span>HOLD · PUMP<br>DRAG · SPIN</span></i></div>
      <div class="grabs">${GRAB_NAMES.map((n, i) => `<button data-grab aria-label="${n}"><span>${GRAB_ICONS[i]}</span><b>${n}</b><kbd>${["↑", "↓", "↑↓"][i]}</kbd></button>`).join("")}</div>
      <p class="tip" data-tip><span class="kb">Hold <kbd>Space</kbd> on downslopes · let go on the lip to <b>pop</b> · <kbd>←</kbd><kbd>→</kbd> flip · <kbd>↑</kbd> <kbd>↓</kbd> <kbd>↑↓</kbd> grab</span><span class="touch">Hold left side on downslopes · let go on the lip to <b>pop</b> · drag to flip · 🐟🎣🐠 grab</span></p>
      <p class="warn" data-warn>PUMP IT, PJ!</p>
      <div class="callout" data-callout><b></b><span></span><em></em></div>
      <div class="banner" data-banner></div>
      <div class="popcue" data-popcue><i></i><b></b></div>
      <div class="titlescreen hidden" data-title-screen role="dialog" aria-label="PJ's Dirt Jumper">
        <div class="logo"><span class="pj">PJ'S</span><b>DIRT<br>JUMPER</b><i>🎣</i></div>
        <p class="tagline">PUMP IT · POP IT · SEND IT</p>
        <button class="go" data-start>SEND IT ▶</button>
        <p class="t-best" data-t-best></p>
        <div class="t-controls">
          <span class="kb"><kbd>Space</kbd> pump · let go on the lip to pop</span><span class="kb"><kbd>←</kbd><kbd>→</kbd> flip</span><span class="kb"><kbd>↑</kbd> Superman <kbd>↓</kbd> Tailwhip <kbd>↑↓</kbd> No-Hander</span>
          <span class="touch">Hold the left side to pump · let go on lips to pop</span><span class="touch">Drag in the air to flip · fish buttons to grab</span>
        </div>
        <small>No fish were harmed. Several were proud of you.</small>
      </div>
      <div class="end hidden" data-end role="dialog" aria-label="Run over">
        <h1 data-title></h1>
        <p class="newbest hidden" data-newbest>🏆 NEW PERSONAL BEST!</p>
        <dl class="results">
          <div><dt>SCORE</dt><dd data-r-score></dd></div>
          <div><dt>DISTANCE</dt><dd data-r-dist></dd></div>
          <div><dt>BEST</dt><dd data-r-best></dd></div>
          <div><dt>BIGGEST AIR</dt><dd data-r-air></dd></div>
        </dl>
        <p class="trick" data-r-trick></p>
        <p class="deep" data-r-deep></p>
        <p class="tip2" data-r-tip></p>
        <button data-again>SEND IT AGAIN ↻</button>
        <button class="menu" data-menu>MENU</button>
      </div>`;
    this.el.prepend(this.warp.el);
    parent.append(this.el);
    this.pad = $(this.el, "[data-pad]");
    this.grabButtons = [...this.el.querySelectorAll<HTMLElement>("[data-grab]")];
    $(this.el, "[data-again]").onclick = () => this.onRestart();
    $(this.el, "[data-mute]").onclick = () => this.onMute();
    $(this.el, "[data-start]").onclick = () => this.onStart();
    $(this.el, "[data-menu]").onclick = () => this.onMenu();
  }
  update(r: Rider, score: number, flow: number, best: number) {
    const now = performance.now();
    if (now - this.last < 80) return;
    this.last = now;
    const speed = r.state === "air" ? Math.hypot(r.vx, r.vy) : r.v;
    $(this.el, "[data-speed]").textContent = String(Math.round(speed * 3.6));
    $(this.el, "[data-dist]").textContent = String(Math.floor(r.distance));
    $(this.el, "[data-score]").textContent = fmt(score);
    $(this.el, "[data-best]").textContent = best ? `BEST ${fmt(best)}` : "";
    $(this.el, "[data-warn]").classList.toggle("show", r.state === "riding" && r.stall > 0.6);
    $(this.el, "[data-tip]").classList.toggle("hidden", r.distance > 150);
    const meter = $(this.el, "[data-flow]");
    meter.dataset.level = String(flow);
    meter.querySelectorAll("i").forEach((pip, i) => pip.classList.toggle("on", i < flow));
    $(this.el, "[data-speedlines]").style.setProperty("--s", String(Math.max(0, Math.min(1, (speed - 19) / 9))));
  }
  /** Live list of what PJ is doing in this air: flips so far and the grab being held. */
  air(r: Rider) {
    const parts: string[] = [];
    if (r.state === "air") {
      if (r.flips) parts.push(flipName(r.flips > 0 ? "back" : "front", Math.abs(r.flips)).toUpperCase());
      r.grabTime.forEach((t, i) => {
        if (t > 0.1 || r.grab === i) parts.push(`${GRAB_ICONS[i]} ${GRAB_NAMES[i].toUpperCase()}`);
      });
    }
    const text = parts.length ? parts.join(" + ") + (parts.length > 1 ? `  ×${parts.length}` : "") : "";
    if (text === this.feedText) return;
    this.feedText = text;
    const feed = $(this.el, "[data-feed]");
    feed.textContent = text;
    feed.classList.toggle("show", !!text);
  }
  callout(text: string, sub = "", tone: "trick" | "grade" | "pop" | "bad" | "huge" = "trick", points = "") {
    const el = $(this.el, "[data-callout]");
    el.className = `callout show ${tone}`;
    el.querySelector("b")!.textContent = text;
    el.querySelector("span")!.textContent = sub;
    el.querySelector("em")!.textContent = points;
    void el.offsetWidth; // restart the pop-in animation
    el.classList.add("go");
    clearTimeout(this.calloutTimer);
    this.calloutTimer = window.setTimeout(() => el.classList.remove("show", "go"), tone === "huge" ? 2000 : 1400);
  }
  landing(res: AirScore, line: string) {
    const tone = res.grade === "sketchy" ? "bad" : res.points >= 5000 ? "huge" : "grade",
      points = res.points ? `+${fmt(res.points)}${res.multiplier > 1 ? `  ×${res.multiplier}` : ""}` : "";
    this.callout(line, res.name || (res.grade === "perfect" ? "BUTTERED AND BATTERED" : ""), tone, points);
  }
  banner(text: string) {
    const el = $(this.el, "[data-banner]");
    el.textContent = text.toUpperCase();
    el.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.remove("show"), 2200);
  }
  /**
   * The ring over the next lip: shrinks onto it as PJ arrives. t = seconds to the lip (null hides it).
   * It says HOLD until the pop window, then LET GO!, turning gold in the perfect window.
   */
  popCue(cue: { t: number; sx: number; sy: number; loaded: boolean; window: number; perfect: number } | null) {
    const el = $(this.el, "[data-popcue]");
    if (!cue) {
      el.classList.remove("show");
      return;
    }
    const inWindow = cue.t <= cue.window,
      perfect = cue.t <= cue.perfect;
    el.className = `popcue show${inWindow ? " go" : ""}${perfect ? " perfect" : ""}`;
    el.style.left = `${cue.sx}px`;
    el.style.top = `${cue.sy}px`;
    el.style.setProperty("--k", String(1 + Math.max(0, cue.t - cue.perfect) * 2.2));
    el.querySelector("b")!.textContent = inWindow ? "LET GO!" : cue.loaded ? "READY…" : "HOLD";
  }
  private replay(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  /** Full-screen flash (PERFECT, huge scores, crashes). */
  flash(color = "#fff6d8") {
    const el = $(this.el, "[data-flash]");
    el.style.background = color;
    this.replay(el, "go");
  }
  /** Coloured glow pulsing in from the screen edges (Flow up, ON FIRE). */
  pulse(color: string) {
    const el = $(this.el, "[data-edge]");
    el.style.setProperty("--c", color);
    this.replay(el, "go");
  }
  /** Radial zoom lines bursting from the centre (SEND IT takeoffs). */
  zoomBurst() {
    this.replay($(this.el, "[data-zoom]"), "go");
  }
  /** Points that pop out of PJ and fly up toward the score. */
  floater(text: string, sx: number, sy: number, big: boolean) {
    const el = document.createElement("div");
    el.className = `floater${big ? " big" : ""}`;
    el.textContent = text;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    $(this.el, "[data-floaters]").append(el);
    setTimeout(() => el.remove(), 1300);
  }
  /** HANG TIME counter while PJ is up there (null hides it). */
  hang(seconds: number | null) {
    const el = $(this.el, "[data-hang]");
    el.classList.toggle("show", seconds !== null);
    if (seconds !== null) el.textContent = `HANG TIME ${seconds.toFixed(1)}s`;
  }
  private tickerTimer = 0;
  /** PJ's passing thoughts: a small bubble near the bottom of the screen. */
  ticker(text: string) {
    const el = $(this.el, "[data-ticker]");
    el.querySelector("span")!.textContent = text;
    this.replay(el, "show");
    clearTimeout(this.tickerTimer);
    this.tickerTimer = window.setTimeout(() => el.classList.remove("show"), 3800);
  }
  /** Depth multiplier and any active omen buff, shown under the Flow meter. */
  badges(depthMult: number, buff: string) {
    const d = $(this.el, "[data-depth]"),
      b = $(this.el, "[data-buff]");
    d.textContent = depthMult > 1 ? `DEPTH ×${depthMult.toFixed(1)}` : "";
    b.textContent = buff;
  }
  /** Depth milestone: a banner with the distance and bonus. */
  milestone(distance: number, bonus: number, depthMult: number) {
    this.banner(`${distance.toLocaleString("en-US")} M — DEEPER WATER  +${fmt(bonus)}  ×${depthMult.toFixed(1)}`);
  }
  /** Big omen title card; the Bass God gets the holy treatment. */
  omen(title: string, line: string, holy: boolean) {
    const el = $(this.el, "[data-omen]");
    el.className = `omen${holy ? " holy" : ""}`;
    el.querySelector("b")!.textContent = title;
    el.querySelector("span")!.textContent = line;
    this.replay(el, "go");
  }
  /** The painted bluegill slides in with a speech bubble. */
  bluegill(art: HTMLImageElement | HTMLCanvasElement, line: string, seconds: number) {
    const el = $(this.el, "[data-bluegill]");
    el.querySelector("canvas,img")?.remove();
    const copy = document.createElement("canvas");
    copy.width = art.width;
    copy.height = art.height;
    copy.getContext("2d")!.drawImage(art, 0, 0);
    // The painting faces right; flip it so every bluegill looks back at PJ.
    if (art instanceof HTMLCanvasElement) copy.style.transform = "scaleX(-1)";
    el.prepend(copy);
    el.querySelector("p")!.textContent = line;
    el.style.setProperty("--dur", `${seconds}s`);
    this.replay(el, "go");
  }
  /** A jagged lightning bolt from the top of the screen down to (sx, sy). */
  lightning(sx: number, sy: number) {
    const svg = $(this.el, "[data-bolt]") as unknown as SVGSVGElement,
      w = innerWidth,
      h = innerHeight,
      pts: string[] = [];
    let x = (sx / w) * 100 + (Math.random() - 0.5) * 30;
    const tx = (sx / w) * 100,
      ty = (sy / h) * 100;
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      x = x + (tx - x) * 0.3 + (i < 10 ? (Math.random() - 0.5) * 8 : 0);
      pts.push(`${i === 10 ? tx : x},${k * ty}`);
    }
    svg.querySelector("polyline")!.setAttribute("points", pts.join(" "));
    this.replay(svg as unknown as HTMLElement, "go");
  }
  setMuted(muted: boolean) {
    $(this.el, "[data-mute]").textContent = muted ? "🔇" : "🔊";
  }
  showEnd(s: RunSummary) {
    $(this.el, "[data-title]").textContent = s.title;
    $(this.el, "[data-newbest]").classList.toggle("hidden", !s.newBest);
    $(this.el, "[data-r-score]").textContent = fmt(s.score);
    $(this.el, "[data-r-dist]").textContent = `${Math.floor(s.distance)} m`;
    $(this.el, "[data-r-best]").textContent = fmt(s.best);
    $(this.el, "[data-r-air]").textContent = `${s.bigAir.toFixed(1)} s`;
    $(this.el, "[data-r-trick]").textContent = s.bestTrick ? `Best trick: ${s.bestTrick}` : "";
    $(this.el, "[data-r-deep]").textContent = s.depth ? `Deep water: ${s.depth} milestone${s.depth > 1 ? "s" : ""} · ${s.omens} omen${s.omens === 1 ? "" : "s"} witnessed` : "";
    $(this.el, "[data-r-tip]").textContent = s.tip;
    $(this.el, "[data-end]").classList.remove("hidden");
    $(this.el, "[data-again]").focus();
  }
  /** Title screen over the attract-mode ride; the gameplay HUD hides behind it. */
  showTitle(best: number, seed: number) {
    this.el.classList.add("attract");
    $(this.el, "[data-t-best]").textContent = `${best ? `BEST ${fmt(best)} · ` : ""}DAILY LINE #${seed}`;
    $(this.el, "[data-title-screen]").classList.remove("hidden");
    $(this.el, "[data-start]").focus();
  }
  hideTitle() {
    this.el.classList.remove("attract");
    $(this.el, "[data-title-screen]").classList.add("hidden");
  }
  hideEnd() {
    $(this.el, "[data-end]").classList.add("hidden");
  }
}
