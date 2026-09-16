/* global self, clients */
// Push handler imported by the Workbox-generated app SW (workbox.importScripts).
// Lives alongside /sw.js in the same registration/scope.

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const { title, body, icon, badge, url } = data;
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || "/pwa-icon-192.png",
        badge: badge || "/favicon.png",
        data: { url },
      })
    );
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification("Cultivo Farm", { body: event.data.text() })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
