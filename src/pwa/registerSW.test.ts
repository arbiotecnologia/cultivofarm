import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPendingUpdate,
  checkForPublishedVersion,
  disableServiceWorkers,
  dismissPendingUpdate,
  extractBuildToken,
  getPwaUpdateSnapshot,
  inspectPublishedVersion,
  migrateLegacyAppShell,
  recoverFromStaleBuild,
  reopenPendingUpdate,
  resetVersionManagementForTests,
  retryCurrentBuild,
  startVersionManagement,
} from "./registerSW";

const legacyLoadedHtml = '<script type="module" src="/assets/index-loaded123.js"></script>';
const legacyNewHtml = '<script type="module" src="/assets/index-new456.js"></script>';
const currentHtml = '<meta name="cultivo-build-id" content="build-current"><script type="module" src="/assets/index-shared.js"></script>';
const newHtml = '<meta name="cultivo-build-id" content="build-new"><script type="module" src="/assets/index-shared.js"></script>';

function installLoadedDocument(buildId?: string): void {
  if (buildId) {
    const meta = document.createElement("meta");
    meta.name = "cultivo-build-id";
    meta.content = buildId;
    document.head.appendChild(meta);
  }
  const script = document.createElement("script");
  script.type = "module";
  script.src = buildId ? "/assets/index-shared.js" : "/assets/index-loaded123.js";
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
    document.head.querySelectorAll('meta[name="cultivo-build-id"]').forEach((node) => node.remove());
    document.head.querySelectorAll('script[type="module"]').forEach((node) => node.remove());
    installLoadedDocument("build-current");
    window.localStorage.clear();
    window.sessionStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prioriza o build ID explícito e mantém fallback para HTML antigo", () => {
    expect(extractBuildToken(currentHtml)).toBe("build-current");
    expect(extractBuildToken(legacyLoadedHtml)).toBe("index-loaded123");
    expect(extractBuildToken('<script type="module" src="https://example.com/assets/bad.js"></script>')).toBeNull();
  });

  it("build ID atual igual ao publicado não mostra prompt", async () => {
    const fetchHtml = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(currentHtml) });
    expect(await checkForPublishedVersion(fetchHtml)).toBe(false);
    expect(getPwaUpdateSnapshot().status).toBe("hidden");
  });

  it("retorna resultado detalhado atual sem remover atualização já pendente", async () => {
    await inspectPublishedVersion(vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) }));
    const result = await inspectPublishedVersion(vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(currentHtml) }));
    expect(result).toEqual({ status: "current", currentVersion: "build-current", publishedVersion: "build-current" });
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "prompt", version: "build-new" });
  });

  it("distingue offline e erro sem navegar", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await inspectPublishedVersion()).toMatchObject({ status: "offline", currentVersion: "build-current" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    expect(await inspectPublishedVersion(vi.fn().mockRejectedValue(new Error("falha")))).toMatchObject({ status: "error" });
  });

  it("build ID diferente mostra prompt sem navegar", async () => {
    const navigate = vi.fn();
    const fetchHtml = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) });
    expect(await checkForPublishedVersion(fetchHtml)).toBe(true);
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "prompt", version: "build-new" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("detecta publicação que mantém o entry e altera somente chunk interno", async () => {
    expect(currentHtml).toContain('/assets/index-shared.js');
    expect(newHtml).toContain('/assets/index-shared.js');
    expect(await checkForPublishedVersion(vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) }))).toBe(true);
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "prompt", version: "build-new" });
  });

  it("sessão antiga por hash detecta HTML novo com build ID", async () => {
    resetVersionManagementForTests();
    document.head.querySelectorAll('meta[name="cultivo-build-id"]').forEach((node) => node.remove());
    document.head.querySelectorAll('script[type="module"]').forEach((node) => node.remove());
    installLoadedDocument();
    expect(await checkForPublishedVersion(vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(newHtml) }))).toBe(true);
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "prompt", version: "build-new" });
  });

  it("HTML antigo sem meta continua comparando hashes do entry", async () => {
    resetVersionManagementForTests();
    document.head.querySelectorAll('meta[name="cultivo-build-id"]').forEach((node) => node.remove());
    document.head.querySelectorAll('script[type="module"]').forEach((node) => node.remove());
    installLoadedDocument();
    expect(await checkForPublishedVersion(vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(legacyNewHtml) }))).toBe(true);
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "prompt", version: "index-new456" });
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
    expect(navigate.mock.calls[0][0]).toContain("app_version=build-new");
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

  it("usa um único agendamento global de dez minutos sem navegar", async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(currentHtml) }));
    mockWorkerEnvironment();
    const cleanup = startVersionManagement();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10 * 60 * 1000);
    cleanup();
    vi.useRealTimers();
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