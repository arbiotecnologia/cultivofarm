// Single guarded registration wrapper for the app-shell service worker.
// Aligned with the Lovable PWA skill: never registers in dev/preview/iframe,
// supports ?sw=off kill-switch, unregisters stale /sw.js in refused contexts,
// and forces a safe, single reload when a new SW takes control.

const SW_URL = "/sw.js";
export const PWA_UPDATING_START = "pwa:updating-start";
export const PWA_UPDATING_END = "pwa:updating-end";
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const RELOAD_FALLBACK_MS = 8000;
const UPDATE_SAFETY_TIMEOUT_MS = 12000;
const ACTIVATED_GRACE_MS = 1500;
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
const updateTimers = new Set<number>();

function clearUpdateTimers(): void {
  updateTimers.forEach((timer) => window.clearTimeout(timer));
  updateTimers.clear();
}

function scheduleUpdateTimer(callback: () => void, delay: number): number {
  const timer = window.setTimeout(() => {
    updateTimers.delete(timer);
    callback();
  }, delay);
  updateTimers.add(timer);
  return timer;
}

function beginUpdate(): void {
  if (updateInProgress) return;
  updateInProgress = true;
  window.dispatchEvent(new CustomEvent(PWA_UPDATING_START));
  scheduleUpdateTimer(() => finishUpdate("safety-timeout"), UPDATE_SAFETY_TIMEOUT_MS);
}

export function finishUpdate(reason = "completed"): void {
  clearUpdateTimers();
  reloadingOnControllerChange = false;
  if (!updateInProgress) return;
  updateInProgress = false;
  window.dispatchEvent(new CustomEvent(PWA_UPDATING_END, { detail: { reason } }));
}

export function isServiceWorkerUpdateInProgress(): boolean {
  return updateInProgress;
}

export function triggerSafeReload(reload: () => void = () => window.location.reload()): boolean {
  if (reloadingOnControllerChange) {
    finishUpdate("reload-in-progress");
    return false;
  }

  try {
    const lastReload = Number(window.sessionStorage.getItem(RECENT_RELOAD_KEY) ?? "0");
    if (Date.now() - lastReload < RELOAD_LOOP_GUARD_MS) {
      finishUpdate("reload-guard");
      return false;
    }
    window.sessionStorage.setItem(RECENT_RELOAD_KEY, String(Date.now()));
  } catch {
    // The in-memory guard still prevents duplicate reloads when storage is unavailable.
  }

  reloadingOnControllerChange = true;
  try {
    reload();
    return true;
  } catch {
    finishUpdate("reload-failed");
    return false;
  }
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
export async function recoverFromStaleBuild(
  reload: () => void = () => window.location.reload(),
): Promise<void> {
  beginUpdate();

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

  triggerSafeReload(reload);
}

function activateUpdate(worker?: ServiceWorker | null): void {
  beginUpdate();
  if (worker && worker.state !== "activated") {
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      finishUpdate("activation-failed");
    }
  }
}

export function watchForUpdates(
  registration: ServiceWorkerRegistration,
  reload: () => void = () => window.location.reload(),
): () => void {
  let installingWorker: ServiceWorker | null = null;

  const scheduleFallback = () => {
    scheduleUpdateTimer(() => triggerSafeReload(reload), RELOAD_FALLBACK_MS);
  };

  if (registration.waiting && navigator.serviceWorker.controller) {
    activateUpdate(registration.waiting);
    scheduleFallback();
  }

  const onInstallingStateChange = () => {
    const state = installingWorker?.state;
    if (state === "installed" && navigator.serviceWorker.controller) {
      activateUpdate(registration.waiting ?? installingWorker);
      scheduleFallback();
      return;
    }
    if (state === "redundant") {
      finishUpdate("worker-redundant");
      return;
    }
    if (state === "activated" && updateInProgress) {
      scheduleUpdateTimer(() => finishUpdate("activated-without-controllerchange"), ACTIVATED_GRACE_MS);
    }
  };

  const onUpdateFound = () => {
    installingWorker?.removeEventListener("statechange", onInstallingStateChange);
    const installing = registration.installing;
    if (!installing) return;
    installingWorker = installing;
    installing.addEventListener("statechange", onInstallingStateChange);
  };

  const onControllerChange = () => {
    clearUpdateTimers();
    triggerSafeReload(reload);
  };

  registration.addEventListener("updatefound", onUpdateFound);
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  return () => {
    installingWorker?.removeEventListener("statechange", onInstallingStateChange);
    registration.removeEventListener("updatefound", onUpdateFound);
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    finishUpdate("watch-cleanup");
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
    finishUpdate("page-cleanup");
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  activeCleanup = cleanup;
  window.addEventListener("pagehide", cleanup, { once: true });
  return cleanup;
}
