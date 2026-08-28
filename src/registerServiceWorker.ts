// Registers the offline/install service worker — production builds only.
// Letting a service worker run against the Vite dev server risks caching
// stale dev responses underneath HMR, which would be a confusing thing to
// debug for no real benefit (offline support only matters for the deployed
// app anyone actually installs).
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Best-effort: the app works the same without it, just without
      // offline support or a home-screen install prompt.
    });
  });
}
