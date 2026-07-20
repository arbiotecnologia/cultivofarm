// Single guarded registration wrapper for the app-shell service worker.
// Aligned with the Lovable PWA skill: never registers in dev/preview/iframe,
// supports ?sw=off kill-switch, unregisters stale /sw.js in refused contexts,
// and dispatches "pwa:update-available" when a new SW is waiting.

const SW_URL = "/sw.js";
const UPDATE_EVENT = "pwa:update-available";

function isRefusedHost(hostname: string): boolean {
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return true;
  if (hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com")) return true;
  if (hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com")) return true;
  if (hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev")) return true;
  return false;
}

function shouldRefuse(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  if (isRefusedHost(window.location.hostname)) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterMatching(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (r) => {
        const scriptUrl = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        if (scriptUrl.endsWith(SW_URL)) {
          try {
            await r.unregister();
          } catch {
            /* noop */
          }
        }
      })
    );
  } catch {
    /* noop */
  }
}

let reloadingOnControllerChange = false;

export function triggerSafeReload(): void {
  if (reloadingOnControllerChange) return;
  reloadingOnControllerChange = true;
  window.location.reload();
}

function promptUserToUpdate(waiting: ServiceWorker): void {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: waiting }));
}

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  // Already waiting (e.g. user reopened tab after install).
  if (registration.waiting && navigator.serviceWorker.controller) {
    promptUserToUpdate(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        promptUserToUpdate(installing);
      }
    });
  });

  // When the new SW takes control, reload exactly once.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    triggerSafeReload();
  });
}

export function registerAppServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  if (shouldRefuse()) {
    void unregisterMatching();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registration) => {
        watchForUpdates(registration);
        // Periodically poll for updates (every hour) while the tab is open.
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      })
      .catch((err) => {
        console.warn("[pwa] sw registration failed", err);
      });
  });
}
