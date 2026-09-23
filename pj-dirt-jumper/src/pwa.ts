// Installable web app: registers the offline service worker (production builds only) and offers an install button on
// the title screen where the browser supports it, or Safari's Share → Add to Home Screen hint on iPhone and iPad.
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function setUpInstall(root: HTMLElement) {
  if (import.meta.env.PROD && "serviceWorker" in navigator) addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
  const installed = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  if (installed) return;
  const button = root.querySelector<HTMLButtonElement>("[data-install]")!,
    hint = root.querySelector<HTMLElement>("[data-install-hint]")!;
  let offer: InstallPrompt | undefined;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offer = e as InstallPrompt;
    button.classList.remove("hidden");
  });
  button.onclick = async () => {
    if (!offer) return;
    await offer.prompt();
    if ((await offer.userChoice).outcome === "accepted") button.classList.add("hidden");
    offer = undefined;
  };
  addEventListener("appinstalled", () => button.classList.add("hidden"));
  // iOS Safari has no install prompt: show how to do it by hand.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) hint.classList.remove("hidden");
}
