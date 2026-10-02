import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPendingUpdate,
  dismissPendingUpdate,
  getPwaUpdateSnapshot,
  PWA_UPDATE_AVAILABLE_EVENT,
  recoverFromStaleBuild,
  reopenPendingUpdate,
  retryCurrentBuild,
  watchForUpdates,
} from "./registerSW";

class WorkerMock extends EventTarget {
  state: ServiceWorkerState = "installing";
  scriptURL = "https://app.cultivofarm.com.br/sw.js";
  postMessage = vi.fn();
}

class RegistrationMock extends EventTarget {
  installing: WorkerMock | null = null;
  waiting: WorkerMock | null = null;
}

const serviceWorkerEvents = new EventTarget();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("atualização PWA manual", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ text: () => Promise.resolve("worker-v1") }));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: {},
        addEventListener: serviceWorkerEvents.addEventListener.bind(serviceWorkerEvents),
        removeEventListener: serviceWorkerEvents.removeEventListener.bind(serviceWorkerEvents),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("updatefound/installing não ativa worker nem recarrega", () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    registration.installing = worker;
    const reload = vi.fn();
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, reload);

    registration.dispatchEvent(new Event("updatefound"));

    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(getPwaUpdateSnapshot().status).toBe("hidden");
    cleanup();
  });

  it("worker waiting mostra prompt sem SKIP_WAITING", async () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    worker.state = "installed";
    registration.waiting = worker;
    const available = vi.fn();
    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, available);

    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, vi.fn());
    await waitFor(() => expect(getPwaUpdateSnapshot().status).toBe("prompt"));
    expect(available).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).not.toHaveBeenCalled();
    cleanup();
    window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, available);
  });

  it("Adiar persiste apenas versão e timestamp e reabrir restaura opções", async () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    worker.state = "installed";
    registration.waiting = worker;
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, vi.fn());
    await waitFor(() => expect(getPwaUpdateSnapshot().status).toBe("prompt"));

    dismissPendingUpdate();
    expect(getPwaUpdateSnapshot().status).toBe("deferred_badge");
    expect(window.localStorage.getItem("pwa:deferred-update")).toMatch(/version.*deferredAt/);
    reopenPendingUpdate();
    expect(getPwaUpdateSnapshot().status).toBe("prompt");
    dismissPendingUpdate();
    cleanup();
  });

  it("a mesma versão adiada reabre como badge, sem spam do prompt", async () => {
    const firstRegistration = new RegistrationMock();
    const worker = new WorkerMock();
    worker.state = "installed";
    firstRegistration.waiting = worker;
    const firstCleanup = watchForUpdates(firstRegistration as unknown as ServiceWorkerRegistration, vi.fn());
    await waitFor(() => expect(getPwaUpdateSnapshot().status).toBe("prompt"));
    dismissPendingUpdate();
    firstCleanup();

    const secondRegistration = new RegistrationMock();
    secondRegistration.waiting = worker;
    const secondCleanup = watchForUpdates(secondRegistration as unknown as ServiceWorkerRegistration, vi.fn());
    await waitFor(() => expect(getPwaUpdateSnapshot().status).toBe("deferred_badge"));
    expect(getPwaUpdateSnapshot().status).toBe("deferred_badge");
    secondCleanup();
  });

  it("nova versão diferente volta a mostrar prompt", async () => {
    const registration = new RegistrationMock();
    const first = new WorkerMock();
    first.state = "installed";
    registration.waiting = first;
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, vi.fn());
    await waitFor(() => expect(getPwaUpdateSnapshot().status).toBe("prompt"));
    dismissPendingUpdate();

    vi.mocked(fetch).mockResolvedValueOnce({ text: () => Promise.resolve("worker-v2") } as Response);
    const second = new WorkerMock();
    registration.installing = second;
    registration.waiting = second;
    registration.dispatchEvent(new Event("updatefound"));
    second.state = "installed";
    second.dispatchEvent(new Event("statechange"));
    await waitFor(() => expect(getPwaUpdateSnapshot().status).toBe("prompt"));
    expect(getPwaUpdateSnapshot().status).toBe("prompt");
    cleanup();
  });

  it("Atualizar agora envia SKIP_WAITING e controllerchange recarrega uma vez", async () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    worker.state = "installed";
    registration.waiting = worker;
    const reload = vi.fn();
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, reload);
    await flush();

    await applyPendingUpdate(reload);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).not.toHaveBeenCalled();
    serviceWorkerEvents.dispatchEvent(new Event("controllerchange"));
    serviceWorkerEvents.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("controllerchange sem intenção explícita não recarrega", () => {
    const registration = new RegistrationMock();
    const reload = vi.fn();
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, reload);
    serviceWorkerEvents.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();
    cleanup();
  });

  it("worker redundant remove o badge e o estado persistido", async () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    registration.installing = worker;
    registration.waiting = worker;
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, vi.fn());
    registration.dispatchEvent(new Event("updatefound"));
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    await flush();
    dismissPendingUpdate();
    worker.state = "redundant";
    worker.dispatchEvent(new Event("statechange"));
    expect(getPwaUpdateSnapshot().status).toBe("hidden");
    expect(window.localStorage.getItem("pwa:deferred-update")).toBeNull();
    cleanup();
  });

  it("stale chunk exige ação e respeita a trava anti-loop", async () => {
    const reload = vi.fn();
    await recoverFromStaleBuild();
    expect(getPwaUpdateSnapshot()).toMatchObject({ status: "error", staleBuild: true });
    expect(reload).not.toHaveBeenCalled();
    expect(retryCurrentBuild(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(retryCurrentBuild(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});