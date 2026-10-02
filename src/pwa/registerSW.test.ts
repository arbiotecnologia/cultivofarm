import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishUpdate,
  isServiceWorkerUpdateInProgress,
  PWA_UPDATING_END,
  PWA_UPDATING_START,
  recoverFromStaleBuild,
  triggerSafeReload,
  watchForUpdates,
} from "./registerSW";

class WorkerMock extends EventTarget {
  state: ServiceWorkerState = "installing";
  postMessage = vi.fn();
}

class RegistrationMock extends EventTarget {
  installing: WorkerMock | null = null;
  waiting: WorkerMock | null = null;
}

const serviceWorkerEvents = new EventTarget();

describe("ciclo fail-safe de atualização PWA", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    finishUpdate("test-reset");
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
    finishUpdate("test-cleanup");
    vi.useRealTimers();
  });

  it("não inicia overlay no mero updatefound e inicia quando instalado", () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    registration.installing = worker;
    const starts = vi.fn();
    window.addEventListener(PWA_UPDATING_START, starts);
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, vi.fn());

    registration.dispatchEvent(new Event("updatefound"));
    expect(starts).not.toHaveBeenCalled();
    expect(isServiceWorkerUpdateInProgress()).toBe(false);

    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    expect(starts).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    cleanup();
    window.removeEventListener(PWA_UPDATING_START, starts);
  });

  it("recarrega no controllerchange e encerra quando a trava de loop bloqueia", () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    registration.installing = worker;
    const reload = vi.fn();
    const ends = vi.fn();
    window.addEventListener(PWA_UPDATING_END, ends);
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, reload);
    registration.dispatchEvent(new Event("updatefound"));
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));

    serviceWorkerEvents.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);

    finishUpdate("between-attempts");
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    serviceWorkerEvents.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(isServiceWorkerUpdateInProgress()).toBe(false);
    expect(ends).toHaveBeenCalled();
    cleanup();
    window.removeEventListener(PWA_UPDATING_END, ends);
  });

  it("encerra para worker redundant e por timeout absoluto", () => {
    const registration = new RegistrationMock();
    const worker = new WorkerMock();
    registration.installing = worker;
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, vi.fn());
    registration.dispatchEvent(new Event("updatefound"));
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    worker.state = "redundant";
    worker.dispatchEvent(new Event("statechange"));
    expect(isServiceWorkerUpdateInProgress()).toBe(false);

    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    vi.advanceTimersByTime(12000);
    expect(isServiceWorkerUpdateInProgress()).toBe(false);
    cleanup();
  });

  it("mantém eventos múltiplos idempotentes", () => {
    const registration = new RegistrationMock();
    const first = new WorkerMock();
    const second = new WorkerMock();
    const starts = vi.fn();
    window.addEventListener(PWA_UPDATING_START, starts);
    const cleanup = watchForUpdates(registration as unknown as ServiceWorkerRegistration, vi.fn());
    registration.installing = first;
    registration.dispatchEvent(new Event("updatefound"));
    registration.installing = second;
    registration.dispatchEvent(new Event("updatefound"));
    second.state = "installed";
    second.dispatchEvent(new Event("statechange"));
    second.dispatchEvent(new Event("statechange"));
    expect(starts).toHaveBeenCalledTimes(1);
    cleanup();
    window.removeEventListener(PWA_UPDATING_START, starts);
  });

  it("recupera chunk obsoleto e respeita a trava de recarga", async () => {
    const reload = vi.fn();
    await recoverFromStaleBuild(reload);
    expect(reload).toHaveBeenCalledTimes(1);
    finishUpdate("simulate-returned-page");
    await recoverFromStaleBuild(reload);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(isServiceWorkerUpdateInProgress()).toBe(false);
  });

  it("triggerSafeReload encerra quando a trava recente impede recarga", () => {
    window.sessionStorage.setItem("pwa:last-controller-reload", String(Date.now()));
    const reload = vi.fn();
    expect(triggerSafeReload(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(isServiceWorkerUpdateInProgress()).toBe(false);
  });
});