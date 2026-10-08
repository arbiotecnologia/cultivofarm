/* global self */
// Standalone containment worker. No cache, claim, skipWaiting or session data.
// Existing installed workers are NOT automatically replaced by this file.
const PUSH_DELIVERY_AVAILABLE = false;

function safeNotificationUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const decoded = decodeURIComponent(value.split(/[?#]/)[0]);
    if (decoded.includes("\\") || decoded.split("/").includes("..") || decoded.startsWith("//")) return null;
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || !/^\/(app|notificacoes|portal|portal-parceiro)(\/|$)/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

self.addEventListener("push", () => {
  // Do not parse or display payloads, including text fallback, while contained.
  if (!PUSH_DELIVERY_AVAILABLE) return;
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  // Old notifications cannot navigate even internally while delivery is blocked.
  if (!PUSH_DELIVERY_AVAILABLE || !url) return;
  event.waitUntil(self.clients.openWindow(url));
});
