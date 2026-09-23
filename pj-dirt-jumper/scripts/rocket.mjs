// Screenshots a Pikeminnow Rocket ride: node scripts/rocket.mjs. Needs the dev server running.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const root = join(homedir(), ".cache/ms-playwright"),
  dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(root, dir, "chrome-linux64/chrome"), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
  problems = [];
page.on("pageerror", (e) => problems.push(e.message));
await page.goto("http://127.0.0.1:5200/?seed=20260922&autopilot=tricks");
await page.waitForTimeout(3000);
const before = await page.evaluate(() => (window.game.launchRocket(), window.game.rider.distance));
let last = 0;
for (const at of [500, 1800, 3200, 4500, 6000]) {
  await page.waitForTimeout(at - last);
  last = at;
  await page.screenshot({ path: `smoke-out/rocket-${at}.png` });
}
const after = await page.evaluate(() => ({ distance: window.game.rider.distance, state: window.game.rider.state }));
if (after.distance - before < 150) problems.push(`rocket only carried PJ ${Math.round(after.distance - before)} m`);
if (after.state === "bailed") problems.push("PJ bailed after the rocket");
await browser.close();
console.log(problems.join("\n") || `rocket OK — ${Math.round(after.distance - before)} m, smoke-out/rocket-*.png`);
