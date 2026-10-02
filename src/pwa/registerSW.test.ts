import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPendingUpdate,
  checkForPublishedVersion,
  disableServiceWorkers,
  dismissPendingUpdate,
  extractBuildToken,
  getPwaUpdateSnapshot,
  migrateLegacyAppShell,
  recoverFromStaleBuild,
  reopenPendingUpdate,
  resetVersionManagementForTests,
  retryCurrentBuild,
  startVersionManagement,
} from "./registerSW";

const loadedHtml = '<script type="module" src="/assets/index-loaded123.js"></script>';
const newHtml = '<script type="module" src="/assets/index-new456.js"></script>';

function installLoadedScript(): void {
  const script = document.createElement("script");
  script.type = "module";
  script.src = "/assets/index-loaded123.js";
  document.head.appendChild(script);
}

function mockWorkerEnvironment() {
  const legacy = { active: { scriptURL: "https://app.cultivofarm.com.br/sw.js" }, unregister: vi.fn().mockResolvedValue(true) };
  const push = { active: { scriptURL: "https://app.cultivofarm.com.br/push-sw.js" }, unregister: vi.fn().mockResolvedValue(true) };
  const register = vi.fn().mockResolvedValue(push);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistrations: vi.fn().mockResolvedValue([legacy, push]), register },
  });
  const cacheDelete = vi.fn().mockResolvedValue(true);
  Object.defineProperty(window, "caches", {
    configurable: true,
    value: { keys: vi.fn().mockResolvedValue(["html-nav", "static-assets", "workbox-precache-v2-https://app.cultivofarm.com.br/", "unrelated"]), delete: cacheDelete },
  });
  return { legacy, push, register, cacheDelete };
}

describe("gerenciamento manual de versão sem app-shell service worker", () => {
  beforeEach(() => {
    resetVersionManagementForTests();
    document.head.querySelectorAll('script[type="module"]').forEach((node) => node.remove());
    installLoadedScript();
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("extrai somente o token do módulo local", () => {
    expect(extractBuildToken(loadedHtml)).toBe("index-loaded123");
    expect(extractBuildToken('<script type="module" src="https://example.com/assets/bad.js"></script>')).toBeNull();
  });

  it("nova versão mostra prompt sem navegar", async () => {
    const navigate = vi.fn();
    const fetchHtml = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) });
    expect(await checkForPublishedVersion(fetchHtml)).toBe(true);
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "prompt", version: "index-new456" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Adiar mantém badge e a mesma versão não volta a abrir prompt", async () => {
    const fetchHtml = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) });
    await checkForPublishedVersion(fetchHtml);
    dismissPendingUpdate();
    expect(getPwaUpdateSnapshot().status).toBe("deferred_badge");
    expect(window.localStorage.getItem("pwa:deferred-update")).toMatch(/version.*deferredAt/);
    await checkForPublishedVersion(fetchHtml);
    expect(getPwaUpdateSnapshot().status).toBe("deferred_badge");
    reopenPendingUpdate();
    expect(getPwaUpdateSnapshot().status).toBe("prompt");
  });

  it("Atualizar agora navega exatamente uma vez após clique explícito", async () => {
    const navigate = vi.fn();
    await checkForPublishedVersion(vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) }));
    expect(await applyPendingUpdate(navigate)).toBe(true);
    expect(await applyPendingUpdate(navigate)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toContain("app_version=index-new456");
  });

  it("visibilitychange e online somente detectam", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) }));
    const workers = mockWorkerEnvironment();
    const cleanup = startVersionManagement();
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(workers.register).not.toHaveBeenCalledWith("/sw.js", expect.anything());
    cleanup();
  });

  it("worker legado e caches do app-shell são removidos sem navegação", async () => {
    const workers = mockWorkerEnvironment();
    await migrateLegacyAppShell();
    expect(workers.legacy.unregister).toHaveBeenCalledTimes(1);
    expect(workers.push.unregister).not.toHaveBeenCalled();
    expect(workers.cacheDelete).toHaveBeenCalledTimes(3);
  });

  it("?sw=off remove workers pertinentes e caches sem loop", async () => {
    const workers = mockWorkerEnvironment();
    await disableServiceWorkers();
    expect(workers.legacy.unregister).toHaveBeenCalledTimes(1);
    expect(workers.push.unregister).toHaveBeenCalledTimes(1);
    expect(workers.cacheDelete).toHaveBeenCalledTimes(3);
  });

  it("stale chunk apenas avisa; ações explícitas navegam uma vez", async () => {
    const navigate = vi.fn();
    await recoverFromStaleBuild();
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "error", staleBuild: true });
    expect(navigate).not.toHaveBeenCalled();
    expect(retryCurrentBuild(navigate)).toBe(true);
    expect(retryCurrentBuild(navigate)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});