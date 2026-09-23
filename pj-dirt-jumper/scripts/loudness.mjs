// Measures each music style's loudness and suggests its gain trim: node --import tsx scripts/loudness.mjs.
// Needs the dev server running. Level = RMS of the music output with the sub-bass rolled off (roughly what ears and
// phone speakers hear), every style in the same key and progression, Flow pinned, first verse (--intro: the intro),
// 6 s per reading. --keys also tries other keys.
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { STYLES } from "../src/audio/music.ts";
const root = join(homedir(), ".cache/ms-playwright"),
  dir = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? join(root, dir, "chrome-linux64/chrome"),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.goto("http://127.0.0.1:5200/?seed=20260922&autopilot=bot");
await page.waitForTimeout(800);
const styles = Object.keys(STYLES),
  keys = process.argv.includes("--keys") ? [-2, 0, 5] : [0],
  section = process.argv.includes("--intro") ? "intro" : "verse",
  flows = [1, 4],
  rows = [];
for (const style of styles)
  for (const key of keys)
    for (const flow of flows) {
      const db = await page.evaluate(
        async ({ style, flow, key, section }) => {
          const s = window.game.sound;
          s.unlock();
          if (!s.meter) {
            const hp = s.ctx.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.value = 150;
            s.meter = s.ctx.createAnalyser();
            s.meter.fftSize = 2048;
            s.musicOut.connect(hp).connect(s.meter);
            // The running game sets Flow every frame; pin it for the measurement.
            let pinned = 0;
            Object.defineProperty(s, "flow", { get: () => pinned, set: () => {}, configurable: true });
            s.pinFlow = (f) => (pinned = f);
          }
          s.mood = "run";
          s.song = { style, key, progression: [0, 3, 5, 8], motif: [0, 2, 4, 1, 3, -1, 2, 4, 0, 1, 3, 2, -1, 4, 2, 0], title: "", band: "" };
          s.step = section === "intro" ? 0 : 4 * 16;
          s.pinFlow(flow);
          const buf = new Float32Array(s.meter.fftSize);
          await new Promise((r) => setTimeout(r, 800));
          let sum = 0,
            n = 0;
          const end = performance.now() + 6000;
          while (performance.now() < end) {
            s.meter.getFloatTimeDomainData(buf);
            for (const v of buf) sum += v * v;
            n += buf.length;
            await new Promise((r) => setTimeout(r, 40));
          }
          return 10 * Math.log10(sum / n + 1e-12);
        },
        { style, flow, key, section },
      );
      rows.push({ style, flow, key, db });
    }
await browser.close();
const avg = (style) => {
  const mine = rows.filter((r) => r.style === style);
  return mine.reduce((a, r) => a + r.db, 0) / mine.length;
};
// Punk is the reference: the original soundtrack's level was fine.
for (const style of styles) {
  const now = STYLES[style].gain,
    suggest = now * Math.pow(10, (avg("punk") - avg(style)) / 20);
  console.log(
    style.padEnd(11),
    `avg ${avg(style).toFixed(1)} dB `,
    rows
      .filter((r) => r.style === style)
      .map((r) => `${keys.length > 1 ? `key ${r.key} ` : ""}flow ${r.flow}: ${r.db.toFixed(1)}`)
      .join("  "),
    `  gain ${now} → ${suggest.toFixed(2)}`,
  );
}
