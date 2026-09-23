// Renders the omen paintings to PNGs for review: node scripts/art.mjs. Needs the dev server running.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const root = join(homedir(), ".cache/ms-playwright"),
  dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
mkdirSync("smoke-out", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? join(root, dir, "chrome-linux64/chrome") });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto("http://127.0.0.1:5200/?seed=1");
const shots = await page.evaluate(async () => {
  const art = await import("/src/weird/art.ts");
  return { bluegill: art.paintBluegill().toDataURL(), bassgod: art.paintBassGod().toDataURL(), fish: art.paintFish().toDataURL(), lake: art.paintLakeSky().toDataURL() };
});
for (const [name, url] of Object.entries(shots)) writeFileSync(`smoke-out/art-${name}.png`, Buffer.from(url.split(",")[1], "base64"));
await browser.close();
console.log("art in smoke-out/art-*.png");
