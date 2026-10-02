// Single guarded registration wrapper for the app-shell service worker.
// Normal updates are always consent-driven: detection never activates a worker
// and never reloads the page. Only applyPendingUpdate may do either.

const SW_URL = "/sw.js";
export const PWA_UPDATE_STATE_EVENT = "pwa:update-state";
export const PWA_UPDATE_AVAILABLE_EVENT = "pwa:update-available";
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;
const APPLY_TIMEOUT_MS = 15000;
const RECENT_RELOAD_KEY = "pwa:last-explicit-reload";
const DEFERRED_UPDATE_KEY = "pwa:deferred-update";
const RELOAD_LOOP_GUARD_MS = 15000;
const STALE_RUNTIME_CACHES = new Set(["html-nav", "static-assets"]);

export type PwaUpdateStatus = "hidden" | "prompt" | "deferred_badge" | "applying" | "error";

export interface PwaUpdateSnapshot {
  status: PwaUpdateStatus;
  version: string | null;
  staleBuild: boolean;
  message?: string;
}

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

let activeCleanup: (() => void) | null = null;
let pendingWorker: ServiceWorker | null = null;
let pendingRegistration: ServiceWorkerRegistration | null = null;
let explicitApplyIntent = false;
let reloadAttempted = false;
let applyTimer: number | null = null;
let snapshot: PwaUpdateSnapshot = { status: "hidden", version: null, staleBuild: false };

function emitSnapshot(next: PwaUpdateSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_STATE_EVENT, { detail: next }));
}

export function getPwaUpdateSnapshot(): PwaUpdateSnapshot {
  return snapshot;
}

function readDeferredVersion(): string | null {
  try {
    const raw = window.localStorage.getItem(DEFERRED_UPDATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function clearDeferredUpdate(): void {
  try {
    window.localStorage.removeItem(DEFERRED_UPDATE_KEY);
  } catch {
    /* storage is optional */
  }
}

function stopApplyTimer(): void {
  if (applyTimer !== null) window.clearTimeout(applyTimer);
  applyTimer = null;
}

function clearPendingUpdate(): void {
  stopApplyTimer();
  pendingWorker = null;
  pendingRegistration = null;
  explicitApplyIntent = false;
  clearDeferredUpdate();
  emitSnapshot({ status: "hidden", version: null, staleBuild: false });
}

async function resolveWorkerVersion(worker: ServiceWorker): Promise<string> {
  try {
    const response = await fetch(worker.scriptURL, { cache: "no-store" });
    const source = await response.text();
    const bytes = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return worker.scriptURL;
  }
}

async function announcePendingUpdate(
  worker: ServiceWorker,
  registration: ServiceWorkerRegistration,
): Promise<void> {
  if (worker.state === "redundant") return;
  pendingWorker = worker;
  pendingRegistration = registration;
  const version = await resolveWorkerVersion(worker);
  if (pendingWorker !== worker || worker.state === "redundant") return;
  const status: PwaUpdateStatus = readDeferredVersion() === version ? "deferred_badge" : "prompt";
  const next = { status, version, staleBuild: false } satisfies PwaUpdateSnapshot;
  emitSnapshot(next);
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT, { detail: next }));
}

export function dismissPendingUpdate(): void {
  if (!snapshot.staleBuild) {
    if (!snapshot.version || !pendingWorker) return;
    try {
      window.localStorage.setItem(DEFERRED_UPDATE_KEY, JSON.stringify({
        version: snapshot.version,
        deferredAt: new Date().toISOString(),
      }));
    } catch {
      /* the badge remains available for this session */
    }
  }
  emitSnapshot({ ...snapshot, status: "deferred_badge" });
}

export function reopenPendingUpdate(): void {
  if (!pendingWorker && !snapshot.staleBuild) return;
  emitSnapshot({ ...snapshot, status: snapshot.staleBuild ? "error" : "prompt" });
}

function triggerExplicitReload(reload: () => void): boolean {
  if (!explicitApplyIntent || reloadAttempted) return false;
  try {
    const lastReload = Number(window.sessionStorage.getItem(RECENT_RELOAD_KEY) ?? "0");
    if (Date.now() - lastReload < RELOAD_LOOP_GUARD_MS) {
      explicitApplyIntent = false;
      emitSnapshot({ ...snapshot, status: "error", message: "A atualização ficou pendente. Você pode continuar usando a aplicação." });
      return false;
    }
    window.sessionStorage.setItem(RECENT_RELOAD_KEY, String(Date.now()));
  } catch {
    // The in-memory flag still guarantees a single attempt in this page.
  }
  reloadAttempted = true;
  try {
    clearDeferredUpdate();
    reload();
    return true;
  } catch {
    explicitApplyIntent = false;
    emitSnapshot({ ...snapshot, status: "error", message: "Não foi possível concluir a atualização. Você pode continuar usando a aplicação." });
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
 * deploy. A função apenas sinaliza a necessidade; limpeza e recarga exigem
 * uma ação explícita posterior do usuário.
 */
export async function recoverFromStaleBuild(
): Promise<void> {
  emitSnapshot({
    status: "error",
    version: snapshot.version,
    staleBuild: true,
    message: "Há uma atualização necessária para continuar.",
  });
}

export function requestStaleBuildRecovery(): Promise<void> {
  return recoverFromStaleBuild();
}

async function clearSafeRuntimeCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cacheNames = await window.caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => STALE_RUNTIME_CACHES.has(cacheName))
        .map((cacheName) => window.caches.delete(cacheName)),
    );
  } catch {
    /* manual retry remains available */
  }
}

export async function applyPendingUpdate(
  reload: () => void = () => window.location.reload(),
): Promise<boolean> {
  if (snapshot.status === "applying") return false;
  explicitApplyIntent = true;
  reloadAttempted = false;
  emitSnapshot({ ...snapshot, status: "applying", message: undefined });

  if (snapshot.staleBuild && !pendingWorker) {
    await clearSafeRuntimeCaches();
    return triggerExplicitReload(reload);
  }

  const worker = pendingRegistration?.waiting ?? pendingWorker;
  if (!worker || worker.state === "redundant") {
    explicitApplyIntent = false;
    clearPendingUpdate();
    return false;
  }

  applyTimer = window.setTimeout(() => {
    applyTimer = null;
    explicitApplyIntent = false;
    emitSnapshot({ ...snapshot, status: "error", message: "A atualização ficou pendente. Você pode continuar usando a aplicação." });
  }, APPLY_TIMEOUT_MS);

  try {
    worker.postMessage({ type: "SKIP_WAITING" });
    return true;
  } catch {
    stopApplyTimer();
    explicitApplyIntent = false;
    emitSnapshot({ ...snapshot, status: "error", message: "Não foi possível iniciar a atualização. Você pode continuar usando a aplicação." });
    return false;
  }
}

export function retryCurrentBuild(reload: () => void = () => window.location.reload()): boolean {
  explicitApplyIntent = true;
  reloadAttempted = false;
  return triggerExplicitReload(reload);
}

export function watchForUpdates(
  registration: ServiceWorkerRegistration,
  reload: () => void = () => window.location.reload(),
): () => void {
  let installingWorker: ServiceWorker | null = null;

  if (registration.waiting && navigator.serviceWorker.controller) {
    void announcePendingUpdate(registration.waiting, registration);
  }

  const onInstallingStateChange = () => {
    const state = installingWorker?.state;
    if (state === "installed" && navigator.serviceWorker.controller) {
      const worker = registration.waiting ?? installingWorker;
      if (worker) void announcePendingUpdate(worker, registration);
      return;
    }
    if (state === "redundant") {
      if (pendingWorker === installingWorker) clearPendingUpdate();
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
    stopApplyTimer();
    if (explicitApplyIntent) triggerExplicitReload(reload);
    else clearPendingUpdate();
  };

  registration.addEventListener("updatefound", onUpdateFound);
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  return () => {
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
      void registration?.update().then(() => {
        if (registration?.waiting && navigator.serviceWorker.controller) {
          void announcePendingUpdate(registration.waiting, registration);
        } else if (pendingWorker && pendingWorker.state === "redundant") {
          clearPendingUpdate();
        }
      }).catch(() => {});
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
    stopApplyTimer();
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  activeCleanup = cleanup;
  window.addEventListener("pagehide", cleanup, { once: true });
  return cleanup;
}
