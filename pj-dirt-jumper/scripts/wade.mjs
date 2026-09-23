// Screenshots Jeremy Wade on a big run's results screen (desktop + phone): node scripts/wade.mjs. Needs the dev server.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const root = join(homedir(), ".cache/ms-playwright"),
  dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(root, dir, "chrome-linux64/chrome"), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const problems = [];
for (const [name, viewport, mobile] of [
  ["desk", { width: 1280, height: 800 }, false],
  ["phone", { width: 390, height: 844 }, true],
]) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
  page.on("pageerror", (e) => problems.push(`${name}: ${e.message}`));
  await page.goto("http://127.0.0.1:5200/?seed=20260922");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.game;
    g.startRun();
    g.rocketAt = 1e9;
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => (window.game.score.award(250000), window.game.crash()));
  await page.waitForTimeout(4500);
  const shown = await page.evaluate(() => document.querySelector("[data-wade]").classList.contains("go"));
  if (!shown) problems.push(`${name}: Wade didn't show`);
  await page.screenshot({ path: `smoke-out/wade-${name}.png` });
  await page.close();
}
await browser.close();
console.log(problems.join("\n") || "wade OK — smoke-out/wade-*.png");
