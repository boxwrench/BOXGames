// Headless play-test: node scripts/smoke.mjs [url]. Needs the dev server running.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const url = process.argv[2] ?? "http://127.0.0.1:5200/?seed=20260922";
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = join(homedir(), ".cache/ms-playwright"),
    dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
  if (!dir) throw new Error("No cached Chromium; set CHROMIUM_PATH");
  return join(root, dir, "chrome-linux64/chrome");
}
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const problems = [];
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone-landscape", { width: 844, height: 390 }], ["phone-portrait", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, hasTouch: name !== "desktop" });
  page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: ${m.text()}`));
  await page.goto(url + (url.includes("?") ? "&" : "?") + "autopilot=1");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `smoke-out/${name}-start.png` });
  // Let the reference bot ride; grab a screenshot the first time PJ is airborne.
  let airShot = false;
  const until = Date.now() + 14000;
  while (Date.now() < until) {
    const air = await page.evaluate(() => window.game.rider.state === "air");
    if (air && !airShot) {
      await page.waitForTimeout(700); // mid-flight, so the arc and landing are in frame
      await page.screenshot({ path: `smoke-out/${name}-air.png` });
      airShot = true;
    }
    await page.waitForTimeout(40);
  }
  await page.screenshot({ path: `smoke-out/${name}-riding.png` });
  const state = await page.evaluate(() => ({ x: Math.round(window.game.rider.x), state: window.game.rider.state, log: window.game.log.filter((t) => t !== "flip").slice(-8) }));
  console.log(name, state);
  if (state.x < 30) problems.push(`${name}: rider barely moved (${state.x} m)`);
  if (state.log.includes("bail") || state.state === "bailed") problems.push(`${name}: autopilot bailed`);
  if (!airShot) problems.push(`${name}: never got air`);
  await page.close();
}
await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("smoke OK — screenshots in smoke-out/");
