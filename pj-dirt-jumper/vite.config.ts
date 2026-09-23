import { defineConfig, type Plugin } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
/** Every file under a folder, relative to it, with forward slashes. */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p).map((q) => `${f}/${q}`) : [f];
  });
/**
 * Writes sw.js for the installable web app: it precaches every built file (bundles, images, icons, manifest) and is
 * versioned by their content, so each deploy gets a fresh cache.
 */
function serviceWorker(): Plugin {
  return {
    name: "pj-service-worker",
    apply: "build",
    generateBundle(_, bundle) {
      const publicFiles = walk("public"),
        files = ["./", ...Object.keys(bundle), ...publicFiles].map((f) => (f === "./" ? f : `./${f}`)),
        hash = createHash("sha256");
      for (const [name, chunk] of Object.entries(bundle)) hash.update(name).update(chunk.type === "chunk" ? chunk.code : chunk.source);
      for (const f of publicFiles) hash.update(f).update(readFileSync(join("public", f)));
      const source = readFileSync("src/sw-template.js", "utf8")
        .replace('"__VERSION__"', JSON.stringify(hash.digest("hex").slice(0, 12)))
        .replace("ASSETS = __ASSETS__", `ASSETS = ${JSON.stringify(files.sort())}`);
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
// Relative base so the build also works from a subfolder (e.g. GitHub Pages).
export default defineConfig({ base: "./", plugins: [serviceWorker()] });
