import { NO_ACTIONS, type Actions } from "../sim/rider";
const PUMP_KEYS = ["Space", "ArrowDown", "KeyS"],
  BACK_KEYS = ["ArrowLeft", "KeyA"],
  FRONT_KEYS = ["ArrowRight", "KeyD"],
  GRAB_KEYS = ["KeyJ", "KeyK", "KeyL"];
interface PadLike {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}
/** Standard-layout gamepad: A pumps, left stick spins, X/Y/B are the three grabs. */
export function padActions(gp: PadLike | null): Actions | null {
  if (!gp) return null;
  const x = gp.axes[0] ?? 0;
  return {
    pump: !!gp.buttons[0]?.pressed,
    spin: Math.abs(x) < 0.2 ? 0 : x,
    grab: [!!gp.buttons[2]?.pressed, !!gp.buttons[3]?.pressed, !!gp.buttons[1]?.pressed],
  };
}
/** Horizontal thumb drag on the pump pad → spin; left is backflip. */
export const dragSpin = (dx: number) => Math.max(-1, Math.min(1, dx / 60));
/** Keyboard, touch (pump pad with drag-to-spin, grab buttons) and gamepad merged into one Actions per frame. */
export class Input {
  private keys = new Set<string>();
  private pads = new Map<number, { x0: number; x: number }>();
  private grabs: Set<number>[] = [new Set(), new Set(), new Set()];
  constructor(win: Window, pad: HTMLElement, grabButtons: HTMLElement[]) {
    win.addEventListener("keydown", (e) => {
      if ([...PUMP_KEYS, ...BACK_KEYS, ...FRONT_KEYS].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    win.addEventListener("keyup", (e) => this.keys.delete(e.code));
    win.addEventListener("blur", () => {
      this.keys.clear();
      this.pads.clear();
      this.grabs.forEach((g) => g.clear());
      pad.classList.remove("down");
      grabButtons.forEach((b) => b.classList.remove("down"));
    });
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.pads.set(e.pointerId, { x0: e.clientX, x: e.clientX });
      pad.setPointerCapture(e.pointerId);
      pad.classList.add("down");
    });
    pad.addEventListener("pointermove", (e) => {
      const p = this.pads.get(e.pointerId);
      if (p) p.x = e.clientX;
    });
    const padUp = (e: PointerEvent) => {
      this.pads.delete(e.pointerId);
      if (!this.pads.size) pad.classList.remove("down");
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) pad.addEventListener(type, padUp);
    grabButtons.forEach((button, i) => {
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.grabs[i].add(e.pointerId);
        button.setPointerCapture(e.pointerId);
        button.classList.add("down");
      });
      const up = (e: PointerEvent) => {
        this.grabs[i].delete(e.pointerId);
        if (!this.grabs[i].size) button.classList.remove("down");
      };
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) button.addEventListener(type, up);
    });
  }
  /** Call on takeoff so a thumb that drifted while pumping doesn't start a spin. */
  resetDrag() {
    for (const p of this.pads.values()) p.x0 = p.x;
  }
  actions(): Actions {
    const any = (codes: string[]) => codes.some((c) => this.keys.has(c)),
      touch = [...this.pads.values()].at(-1),
      gp = padActions(navigator.getGamepads?.().find((g) => g) ?? null) ?? NO_ACTIONS;
    const key = Number(any(FRONT_KEYS)) - Number(any(BACK_KEYS)),
      spin = key || (touch ? dragSpin(touch.x - touch.x0) : 0) || gp.spin;
    return {
      pump: this.pads.size > 0 || any(PUMP_KEYS) || gp.pump,
      spin,
      grab: [0, 1, 2].map((i) => this.keys.has(GRAB_KEYS[i]) || this.grabs[i].size > 0 || gp.grab[i]) as Actions["grab"],
    };
  }
}
