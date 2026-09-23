import type { Actions } from "../sim/rider";
const PUMP_KEYS = ["Space", "ArrowDown", "KeyS"];
/** Keyboard and the touch pump pad, merged into one Actions snapshot per frame. */
export class Input {
  private keys = new Set<string>();
  private pointers = new Set<number>();
  constructor(win: Window, pad: HTMLElement) {
    win.addEventListener("keydown", (e) => {
      if (PUMP_KEYS.includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    win.addEventListener("keyup", (e) => this.keys.delete(e.code));
    win.addEventListener("blur", () => {
      this.keys.clear();
      this.pointers.clear();
      pad.classList.remove("down");
    });
    pad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.pointers.add(e.pointerId);
      pad.setPointerCapture(e.pointerId);
      pad.classList.add("down");
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) pad.classList.remove("down");
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) pad.addEventListener(type, up);
  }
  actions(): Actions {
    return { pump: this.pointers.size > 0 || PUMP_KEYS.some((k) => this.keys.has(k)), spin: 0, grab: [false, false, false] };
  }
}
