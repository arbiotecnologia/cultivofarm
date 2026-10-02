/* Legacy Cultivo Farm app-shell cleanup worker. Remove after returning clients migrate. */
function isLegacyAppShellCache(name) {
  return name === "html-nav" ||
    name === "static-assets" ||
    /^(?:workbox-)?precache(?:-v\d+)?-/i.test(name) ||
    /^workbox-runtime-/i.test(name);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.allSettled(names.filter(isLegacyAppShellCache).map((name) => caches.delete(name)));
    } finally {
      await self.registration.unregister();
    }
  })());
});