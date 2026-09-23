import "./styles.css";
import { Game } from "./game";
import { setUpInstall } from "./pwa";
const app = document.getElementById("app")!,
  q = new URLSearchParams(location.search).get("seed"),
  seed = q && /^\d+$/.test(q) ? Number(q) >>> 0 : Number(new Date().toISOString().slice(0, 10).replaceAll("-", ""));
try {
  const game = new Game(app, seed);
  if (import.meta.env.DEV) Object.assign(window, { game });
  setUpInstall(app);
} catch (error) {
  console.error(error);
  app.innerHTML =
    '<div class="fallback"><h1>PJ can’t find the trail</h1><p>This browser couldn’t start 3D graphics (WebGL). Try another browser, or turn on hardware acceleration.</p></div>';
}
