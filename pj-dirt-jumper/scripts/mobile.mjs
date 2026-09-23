// Emulated-phone checks with real touch events: node scripts/mobile.mjs. Needs the dev server running.
// For each device: title fits and taps start; the pump pad, drag-to-flip and grab buttons respond to touch; HUD
// controls stay on screen without overlapping; the results screen's buttons work; no page errors.
import { chromium, devices } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const root = join(homedir(), ".cache/ms-playwright"),
  dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(root, dir, "chrome-linux64/chrome"), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const DEVICES = ["iPhone SE", "iPhone 14", "iPhone 14 landscape", "Pixel 7", "Pixel 7 landscape", "Galaxy S9+ landscape", "iPad (gen 7)"],
  problems = [],
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const name of DEVICES) {
  const { defaultBrowserType: _, ...device } = devices[name],
    context = await browser.newContext(device),
    page = await context.newPage(),
    cdp = await context.newCDPSession(page),
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    fail = (msg) => problems.push(`${name}: ${msg}`);
  page.on("pageerror", (e) => fail(`page error ${e.message}`));
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const center = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    return b && { ...b, x: b.x + b.width / 2, y: b.y + b.height / 2, top: b.y };
  };
  // A finger tap (touch start + end) at an element's centre; the pulsing buttons never count as "stable" for page.tap.
  const tapOn = async (sel) => {
    const c = await center(sel);
    if (!c) return fail(`${sel} not visible to tap`);
    await touch("touchStart", c.x, c.y);
    await sleep(60);
    await touch("touchEnd");
  };
  await page.goto("http://127.0.0.1:5200/?seed=20260922");
  await sleep(1500);
  // Layout: no sideways scroll, and the start button is on screen and thumb-sized.
  const vp = page.viewportSize();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) fail("page scrolls sideways");
  if (!(await page.evaluate(() => matchMedia("(pointer:coarse)").matches))) fail("not treated as a touch screen");
  const start = await center("[data-start]");
  if (!start || start.top + start.height > vp.height || start.height < 44) fail(`start button off screen or too small ${JSON.stringify(start)}`);
  await page.screenshot({ path: `smoke-out/mobile-${slug}-title.png` });
  await tapOn("[data-start]");
  await sleep(600);
  if ((await page.evaluate(() => window.game.mode)) !== "play") fail("tapping SEND IT didn't start a run");
  // Keep the controls test deterministic: no surprise Pikeminnow Rocket rides (they take over PJ).
  await page.evaluate(() => (window.game.rocketAt = 1e9));
  // Any leftover hyperspace (e.g. a rocket from the title's demo ride) must be gone once the run starts.
  if (await page.evaluate(() => getComputedStyle(document.querySelector(".warp")).opacity !== "0" || document.querySelector("canvas").style.filter !== "")) fail("hyperspace effect still on after starting a run");
  // HUD: every control on screen, pad circle and grab buttons don't overlap each other or the stats.
  const rects = await page.evaluate(() =>
    Object.fromEntries(
      [
        ["stats", ".stats"],
        ["score", ".topright"],
        ["flow", ".flow"],
        ["pad", ".pad i"],
        ["grabs", ".grabs"],
        ["tip", ".tip"],
      ].map(([k, sel]) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return [k, { x: r.x, y: r.y, w: r.width, h: r.height }];
      }),
    ),
  );
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [k, r] of Object.entries(rects)) if (r.w && (r.x < -1 || r.y < -1 || r.x + r.w > vp.width + 1 || r.y + r.h > vp.height + 1)) fail(`${k} off screen ${JSON.stringify(r)}`);
  for (const [a, b] of [
    ["pad", "grabs"],
    ["stats", "score"],
    ["tip", "score"],
    ["flow", "grabs"],
    ["tip", "stats"],
  ])
    if (rects[a].w && rects[b].w && overlap(rects[a], rects[b])) fail(`${a} overlaps ${b}`);
  // Touch: hold the pad to pump (preload charges), let go; drag while airborne to spin; hold a grab button.
  const padAt = { x: vp.width * 0.25, y: vp.height * 0.6 };
  await touch("touchStart", padAt.x, padAt.y);
  await sleep(500);
  const held = await page.evaluate(() => ({ pump: window.game.rider.pump, preload: window.game.rider.preload, state: window.game.rider.state }));
  await touch("touchEnd");
  if (held.state === "riding" && !(held.pump || held.preload > 0)) fail(`holding the pad didn't pump ${JSON.stringify(held)}`);
  // Air controls, tested from a fresh launch each time so the (slow, software-rendered) emulator's timing can't miss them.
  const launch = () => page.evaluate(() => {
    const r = window.game.rider;
    Object.assign(r, { state: "air", y: r.y + 3, vx: 10, vy: 9, airTime: 0, omega: 0, spun: 0, flips: 0, grab: -1, grabBlend: 0, popped: true });
  });
  await launch();
  await touch("touchStart", padAt.x, padAt.y);
  await touch("touchMove", padAt.x - 90, padAt.y);
  await sleep(250);
  const spun = await page.evaluate(() => Math.abs(window.game.rider.omega) > 1 || Math.abs(window.game.rider.spun) > 0.2);
  await touch("touchEnd");
  await launch();
  const g = await center("[data-grab]");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.x, y: g.y, id: 2 }] });
  await sleep(250);
  const grabbed = await page.evaluate(() => window.game.rider.grab === 0);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const fps = await page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        const t0 = performance.now(),
          tick = () => (++n < 30 ? requestAnimationFrame(tick) : done(Math.round((30 * 1000) / (performance.now() - t0))));
        requestAnimationFrame(tick);
      }),
  );
  console.log(`${name}: ${fps} fps in the software-rendered emulator`);
  if (!spun) fail("dragging on the pad never spun PJ in the air");
  if (!grabbed) fail("the Superman grab button never grabbed in the air");
  await page.screenshot({ path: `smoke-out/mobile-${slug}-play.png` });
  // Results: crash, then the buttons must be on screen and SEND IT AGAIN must restart.
  const before = await page.evaluate(() => ({ state: window.game.rider.state, ended: window.game.ended }));
  await page.evaluate(() => window.game.crash());
  await page.waitForSelector("[data-end]:not(.hidden)", { timeout: 30000 }).catch(() => {});
  await sleep(400);
  const again = await center("[data-again]"),
    menu = await center("[data-menu]");
  if (!again) fail(`no results screen (before crash: ${JSON.stringify(before)})`);
  else if (again.top + again.height > vp.height || again.height < 44) fail(`SEND IT AGAIN off screen or small ${JSON.stringify(again)}`);
  if (!menu || menu.top + menu.height > vp.height) fail(`MENU off screen ${JSON.stringify(menu)}`);
  await page.screenshot({ path: `smoke-out/mobile-${slug}-end.png` });
  await tapOn("[data-again]");
  await sleep(500);
  if (await page.evaluate(() => window.game.rider.state === "bailed")) fail("SEND IT AGAIN didn't restart");
  await context.close();
  console.log(`${name}: done`);
}
await browser.close();
console.log(problems.length ? `\nPROBLEMS:\n${problems.join("\n")}` : "\nmobile OK — smoke-out/mobile-*.png");
