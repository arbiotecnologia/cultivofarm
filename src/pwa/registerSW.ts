// Single guarded registration wrapper for the app-shell service worker.
// Aligned with the Lovable PWA skill: never registers in dev/preview/iframe,
// supports ?sw=off kill-switch, unregisters stale /sw.js in refused contexts,
// and forces a safe, single reload when a new SW takes control.

const SW_URL = "/sw.js";
const UPDATING_EVENT = "pwa:updating-start";
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const RELOAD_FALLBACK_MS = 8000;
const RECENT_RELOAD_KEY = "pwa:last-controller-reload";
const RELOAD_LOOP_GUARD_MS = 15000;
const STALE_RUNTIME_CACHES = new Set(["html-nav", "static-assets"]);

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
let activeCleanup: (() => void) | null = null;
let updateInProgress = false;

export function isServiceWorkerUpdateInProgress(): boolean {
  return updateInProgress;
}

export function triggerSafeReload(): void {
  if (reloadingOnControllerChange) return;

  try {
    const lastReload = Number(window.sessionStorage.getItem(RECENT_RELOAD_KEY) ?? "0");
    if (Date.now() - lastReload < RELOAD_LOOP_GUARD_MS) return;
    window.sessionStorage.setItem(RECENT_RELOAD_KEY, String(Date.now()));
  } catch {
    // The in-memory guard still prevents duplicate reloads when storage is unavailable.
  }

  reloadingOnControllerChange = true;
  window.location.reload();
}

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error ?? "");

  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [^ ]+ failed|error loading dynamically imported module/i.test(message);
}

/**
 * Remove somente caches de runtime que podem manter HTML/assets de outro
 * deploy. O precache versionado do Workbox e os dados da aplicação são
 * preservados; a trava de reload evita ciclos quando a rede está indisponível.
 */
export async function recoverFromStaleBuild(): Promise<void> {
  updateInProgress = true;
  window.dispatchEvent(new CustomEvent(UPDATING_EVENT));

  if ("caches" in window) {
    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => STALE_RUNTIME_CACHES.has(cacheName))
          .map((cacheName) => window.caches.delete(cacheName)),
      );
    } catch {
      // A recarga consistente continua mesmo se o navegador negar CacheStorage.
    }
  }

  triggerSafeReload();
}

function activateUpdate(worker?: ServiceWorker | null): void {
  updateInProgress = true;
  window.dispatchEvent(new CustomEvent(UPDATING_EVENT));
  if (worker && worker.state !== "activated") {
    worker.postMessage({ type: "SKIP_WAITING" });
  }
}

function watchForUpdates(registration: ServiceWorkerRegistration): () => void {
  let fallbackTimer: number | undefined;
  let installingWorker: ServiceWorker | null = null;

  const scheduleFallback = () => {
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    fallbackTimer = window.setTimeout(triggerSafeReload, RELOAD_FALLBACK_MS);
  };

  if (registration.waiting && navigator.serviceWorker.controller) {
    activateUpdate(registration.waiting);
    scheduleFallback();
  }

  const onInstallingStateChange = () => {
    if (installingWorker?.state === "installed" && navigator.serviceWorker.controller) {
      activateUpdate(registration.waiting ?? installingWorker);
      scheduleFallback();
    }
  };

  const onUpdateFound = () => {
    installingWorker?.removeEventListener("statechange", onInstallingStateChange);
    const installing = registration.installing;
    if (!installing) return;
    installingWorker = installing;
    if (navigator.serviceWorker.controller) {
      updateInProgress = true;
      window.dispatchEvent(new CustomEvent(UPDATING_EVENT));
    }
    installing.addEventListener("statechange", onInstallingStateChange);
  };

  const onControllerChange = () => {
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    triggerSafeReload();
  };

  registration.addEventListener("updatefound", onUpdateFound);
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  return () => {
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    installingWorker?.removeEventListener("statechange", onInstallingStateChange);
    registration.removeEventListener("updatefound", onUpdateFound);
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  };
}

export function registerAppServiceWorker(): () => void {
  activeCleanup?.();
  activeCleanup = null;

  if (!("serviceWorker" in navigator)) return () => {};

  if (shouldRefuse()) {
    void unregisterMatching();
    return () => {};
  }

  let disposed = false;
  let stopWatching = () => {};
  let intervalId: number | undefined;
  let registration: ServiceWorkerRegistration | null = null;

  const requestUpdate = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void registration?.update().catch(() => {});
    }
  };
  const onVisible = () => requestUpdate();
  const onOnline = () => requestUpdate();

  const onLoad = () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((registered) => {
        if (disposed) return;
        registration = registered;
        stopWatching = watchForUpdates(registered);
        requestUpdate();
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", onOnline);
        intervalId = window.setInterval(requestUpdate, UPDATE_INTERVAL_MS);
      })
      .catch((err) => {
        console.warn("[pwa] sw registration failed", err);
      });
  };

  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });

  const cleanup = () => {
    disposed = true;
    window.removeEventListener("load", onLoad);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pagehide", cleanup);
    if (intervalId !== undefined) window.clearInterval(intervalId);
    stopWatching();
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  activeCleanup = cleanup;
  window.addEventListener("pagehide", cleanup, { once: true });
  return cleanup;
}
