// Screenshots every omen: node scripts/omens.mjs. Needs the dev server running.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const root = join(homedir(), ".cache/ms-playwright"),
  dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(root, dir, "chrome-linux64/chrome"), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const problems = [];
for (const kind of ["bobberMoon", "proudBluegill", "fishRain", "landTrout", "bassGod", "lakeSky", "giantHook"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => problems.push(`${kind}: ${e.message}`));
  await page.goto("http://127.0.0.1:5200/?seed=20260922&autopilot=tricks");
  await page.waitForTimeout(2500);
  await page.evaluate((k) => window.game.summon(k), kind);
  await page.waitForTimeout(kind === "bassGod" ? 1600 : 2600);
  await page.screenshot({ path: `smoke-out/omen-${kind}.png` });
  await page.close();
}
await browser.close();
console.log(problems.join("\n") || "omens OK — smoke-out/omen-*.png");
