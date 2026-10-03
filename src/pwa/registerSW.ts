const LEGACY_SW_SUFFIX = "/sw.js";
const PUSH_SW_URL = "/push-sw.js";
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const RECENT_NAVIGATION_KEY = "pwa:last-explicit-navigation";
const DEFERRED_UPDATE_KEY = "pwa:deferred-update";
const LEGACY_MIGRATION_KEY = "pwa:legacy-app-shell-migrated";
const NAVIGATION_LOOP_GUARD_MS = 15_000;
const BUILD_ID_META_SELECTOR = 'meta[name="cultivo-build-id"]';

export const PWA_UPDATE_STATE_EVENT = "pwa:update-state";

export type PwaUpdateStatus = "hidden" | "prompt" | "applying" | "error";
export type VersionInspectionOrigin = "automatic" | "login" | "manual";

export interface PwaUpdateSnapshot {
  status: PwaUpdateStatus;
  version: string | null;
  staleBuild: boolean;
  message?: string;
}

export type PublishedVersionStatus = "update_available" | "current" | "offline" | "error";

export interface PublishedVersionInspection {
  status: PublishedVersionStatus;
  currentVersion?: string;
  publishedVersion?: string;
}

let snapshot: PwaUpdateSnapshot = { status: "hidden", version: null, staleBuild: false };
let activeCleanup: (() => void) | null = null;
let loadedBuildToken: string | null = null;
let navigationAttempted = false;

function emitSnapshot(next: PwaUpdateSnapshot): void {
  snapshot = next;
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_STATE_EVENT, { detail: next }));
}

export function getPwaUpdateSnapshot(): PwaUpdateSnapshot {
  return snapshot;
}

function isPreviewOrDevelopment(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const hostname = window.location.hostname;
  return hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev");
}

export function extractBuildToken(html: string, baseUrl = window.location.origin): string | null {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const buildId = parsed.querySelector<HTMLMetaElement>(BUILD_ID_META_SELECTOR)?.content.trim();
  if (buildId) return buildId;
  const scripts = Array.from(parsed.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  for (const script of scripts) {
    try {
      const url = new URL(script.src, baseUrl);
      if (url.origin !== new URL(baseUrl).origin) continue;
      const match = url.pathname.match(/\/assets\/([^/]+)\.js$/);
      if (match?.[1]) return match[1];
    } catch {
      // Ignore malformed or third-party script URLs.
    }
  }
  return null;
}

function getLoadedBuildToken(): string | null {
  const buildId = document.querySelector<HTMLMetaElement>(BUILD_ID_META_SELECTOR)?.content.trim();
  if (buildId) return buildId;
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  for (const script of scripts) {
    try {
      const url = new URL(script.src, window.location.origin);
      const match = url.pathname.match(/\/assets\/([^/]+)\.js$/);
      if (url.origin === window.location.origin && match?.[1]) return match[1];
    } catch {
      // Continue looking for the local entry module.
    }
  }
  return null;
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

function clearDeferredVersion(): void {
  try {
    window.localStorage.removeItem(DEFERRED_UPDATE_KEY);
  } catch {
    // Storage is optional.
  }
}

function isLegacyAppShellCache(name: string): boolean {
  return name === "html-nav" ||
    name === "static-assets" ||
    /^(?:workbox-)?precache(?:-v\d+)?-/i.test(name) ||
    /^workbox-runtime-/i.test(name);
}

async function removeCaches(includePushRelated = false): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const names = await window.caches.keys();
    await Promise.allSettled(
      names
        .filter((name) => isLegacyAppShellCache(name) || (includePushRelated && /^cultivofarm-push-/i.test(name)))
        .map((name) => window.caches.delete(name)),
    );
  } catch {
    // Cleanup is best-effort and must never block the app.
  }
}

async function unregisterWorkers(removePushWorker: boolean): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  let removedLegacy = false;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map(async (registration) => {
      const urls = [registration.active, registration.installing, registration.waiting]
        .map((worker) => worker?.scriptURL ?? "");
      const isLegacy = urls.some((url) => url.endsWith(LEGACY_SW_SUFFIX));
      const isPush = urls.some((url) => url.endsWith(PUSH_SW_URL));
      if (isLegacy) removedLegacy = true;
      if (isLegacy || (removePushWorker && isPush)) await registration.unregister();
    }));
  } catch {
    // Cleanup is best-effort and must never navigate or reload.
  }
  return removedLegacy;
}

export async function migrateLegacyAppShell(): Promise<void> {
  const removedLegacy = await unregisterWorkers(false);
  let migrated = false;
  try {
    migrated = window.localStorage.getItem(LEGACY_MIGRATION_KEY) === "1";
  } catch {
    // Without storage, safe cleanup remains idempotent.
  }
  if (removedLegacy || !migrated) await removeCaches(false);
  try {
    window.localStorage.setItem(LEGACY_MIGRATION_KEY, "1");
  } catch {
    // The marker is only an optimization.
  }
}

export async function disableServiceWorkers(): Promise<void> {
  await unregisterWorkers(true);
  await removeCaches(true);
  try {
    window.localStorage.setItem(LEGACY_MIGRATION_KEY, "1");
  } catch {
    // Storage is optional.
  }
}

export function resetVersionManagementForTests(): void {
  activeCleanup?.();
  activeCleanup = null;
  loadedBuildToken = null;
  navigationAttempted = false;
  snapshot = { status: "hidden", version: null, staleBuild: false };
}

async function registerStablePushWorker(): Promise<void> {
  if (!("serviceWorker" in navigator) || isPreviewOrDevelopment()) return;
  try {
    await navigator.serviceWorker.register(PUSH_SW_URL, { scope: "/" });
  } catch {
    // Push remains unavailable without affecting the application.
  }
}

export async function inspectPublishedVersion(
  fetchHtml: typeof fetch = fetch,
  origin: VersionInspectionOrigin = "automatic",
): Promise<PublishedVersionInspection> {
  if (!loadedBuildToken) loadedBuildToken = getLoadedBuildToken();
  const currentVersion = loadedBuildToken ?? undefined;
  if (!navigator.onLine) return { status: "offline", currentVersion };
  if (!loadedBuildToken) return { status: "error" };

  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    const response = await fetchHtml(url.toString(), {
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return { status: "error", currentVersion };
    const publishedToken = extractBuildToken(await response.text(), url.origin);
    if (!publishedToken) return { status: "error", currentVersion };
    if (publishedToken === loadedBuildToken) {
      clearDeferredVersion();
      if (snapshot.status !== "hidden") {
        emitSnapshot({ status: "hidden", version: null, staleBuild: false });
      }
      return { status: "current", currentVersion, publishedVersion: publishedToken };
    }

    const deferredInThisBrowser = readDeferredVersion() === publishedToken;
    const status: PwaUpdateStatus = deferredInThisBrowser && origin === "automatic" ? "hidden" : "prompt";
    emitSnapshot({ status, version: publishedToken, staleBuild: false });
    return { status: "update_available", currentVersion, publishedVersion: publishedToken };
  } catch {
    return { status: navigator.onLine ? "error" : "offline", currentVersion };
  }
}

export async function checkForPublishedVersion(
  fetchHtml: typeof fetch = fetch,
): Promise<boolean> {
  return (await inspectPublishedVersion(fetchHtml)).status === "update_available";
}

export function dismissPendingUpdate(): void {
  if (snapshot.version) {
    try {
      window.localStorage.setItem(DEFERRED_UPDATE_KEY, JSON.stringify({ version: snapshot.version }));
    } catch {
      // Storage is optional; the current document still hides the prompt.
    }
  }
  emitSnapshot({ ...snapshot, status: "hidden" });
}

function explicitNavigation(navigate: (url: string) => void): boolean {
  if (navigationAttempted) return false;
  try {
    const last = Number(window.sessionStorage.getItem(RECENT_NAVIGATION_KEY) ?? "0");
    if (Date.now() - last < NAVIGATION_LOOP_GUARD_MS) {
      emitSnapshot({ ...snapshot, status: "error", message: "A atualização ficou pendente. Você pode continuar usando a aplicação." });
      return false;
    }
    window.sessionStorage.setItem(RECENT_NAVIGATION_KEY, String(Date.now()));
  } catch {
    // The in-memory guard still limits this document to one navigation.
  }
  navigationAttempted = true;
  clearDeferredVersion();
  const url = new URL(window.location.href);
  url.searchParams.set("app_version", snapshot.version ?? String(Date.now()));
  navigate(url.toString());
  return true;
}

export async function applyPendingUpdate(
  navigate: (url: string) => void = (url) => window.location.replace(url),
): Promise<boolean> {
  if (snapshot.status === "applying") return false;
  emitSnapshot({ ...snapshot, status: "applying", message: undefined });
  await removeCaches(false);
  return explicitNavigation(navigate);
}

export function retryCurrentBuild(
  navigate: (url: string) => void = (url) => window.location.replace(url),
): boolean {
  return explicitNavigation(navigate);
}

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [^ ]+ failed|error loading dynamically imported module/i.test(message);
}

export async function recoverFromStaleBuild(): Promise<void> {
  emitSnapshot({
    status: "error",
    version: snapshot.version,
    staleBuild: true,
    message: "A versão carregada não está mais disponível. Escolha quando deseja atualizar ou tentar novamente.",
  });
}

export function requestStaleBuildRecovery(): Promise<void> {
  return recoverFromStaleBuild();
}

export function startVersionManagement(): () => void {
  activeCleanup?.();
  activeCleanup = null;
  if (typeof window === "undefined") return () => {};

  let disposed = false;
  let intervalId: number | undefined;
  const swOff = new URLSearchParams(window.location.search).get("sw") === "off";

  const detect = () => {
    if (!disposed && document.visibilityState === "visible" && navigator.onLine) {
      void checkForPublishedVersion();
    }
  };
  const onVisibilityChange = () => detect();
  const onOnline = () => detect();

  void (async () => {
    if (swOff) await disableServiceWorkers();
    else {
      await migrateLegacyAppShell();
      await registerStablePushWorker();
    }
    if (!disposed) detect();
  })();

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", onOnline);
  intervalId = window.setInterval(detect, UPDATE_INTERVAL_MS);

  const cleanup = () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("online", onOnline);
    if (intervalId !== undefined) window.clearInterval(intervalId);
    if (activeCleanup === cleanup) activeCleanup = null;
  };
  activeCleanup = cleanup;
  return cleanup;
}