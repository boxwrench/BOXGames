// PJ close-ups for art review: node scripts/closeup.mjs [name]. Needs the dev server running.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const name = process.argv[2] ?? "closeup";
const root = join(homedir(), ".cache/ms-playwright"),
  dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(root, dir, "chrome-linux64/chrome"), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto("http://127.0.0.1:5200/?seed=20260922&closeup&autopilot=tricks");
await page.waitForTimeout(1800);
await page.screenshot({ path: `smoke-out/${name}-ride.png` });
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => window.game.rider.state === "air" && window.game.rider.grabBlend > 0.9)) break;
  await page.waitForTimeout(30);
}
await page.screenshot({ path: `smoke-out/${name}-grab.png` });
await browser.close();
