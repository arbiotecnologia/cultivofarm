import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthzEpochMonitor, type AuthzFingerprintResult } from "@/lib/authz/authzEpochMonitor";

// Foundation de cache de autorização (mesma identidade). Relógio e promises
// controlados: cobre troca de vínculo mesmo uid/org/role, duas sessões sem
// Broadcast, expiração temporal, erro/offline, retorno de foco, resposta
// atrasada/ABA e logout.

const fp = (f: string): AuthzFingerprintResult => ({ eligible: true, fingerprint: f });

function setup(overrides: Partial<Parameters<typeof createAuthzEpochMonitor>[0]> = {}) {
  const events: string[] = [];
  let visible = true;
  let online = true;
  const fetcher = vi.fn<() => Promise<AuthzFingerprintResult>>();
  const deps = {
    fetcher,
    now: () => Date.now(),
    setTimeoutFn: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clearTimeoutFn: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    isVisible: () => visible,
    isOnline: () => online,
    onEpochChange: vi.fn(() => events.push("epoch")),
    onExpire: vi.fn((r: string) => events.push(`expire:${r}`)),
    ...overrides,
  };
  const monitor = createAuthzEpochMonitor(deps);
  return { monitor, deps, events, fetcher, setVisible: (v: boolean) => { visible = v; }, setOnline: (v: boolean) => { online = v; } };
}

describe("authzEpochMonitor", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("primeira leitura estabelece fingerprint sem epoch change", async () => {
    const { monitor, fetcher, deps } = setup();
    fetcher.mockResolvedValue(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(monitor.currentFingerprint()).toBe("A");
    expect(deps.onEpochChange).not.toHaveBeenCalled();
  });

  it("mudança de vínculo (mesmo uid/org/role) dispara epoch change no próximo poll", async () => {
    const { monitor, fetcher, deps } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    fetcher.mockResolvedValueOnce(fp("B"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.onEpochChange).toHaveBeenCalledTimes(1);
    expect(monitor.currentFingerprint()).toBe("B");
  });

  it("duas sessões independentes (sem Broadcast) mantêm épocas próprias", async () => {
    const a = setup(); const b = setup();
    a.fetcher.mockResolvedValue(fp("A"));
    b.fetcher.mockResolvedValue(fp("A"));
    a.monitor.start(); b.monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    b.fetcher.mockResolvedValue(fp("B"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(b.deps.onEpochChange).toHaveBeenCalledTimes(1);
    expect(a.deps.onEpochChange).not.toHaveBeenCalled();
  });

  it("expiração temporal (vigência vira inválida) muda fingerprint e notifica", async () => {
    const { monitor, fetcher, deps } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    // servidor computa 'v' com now(): valid_until expirado muda o hash
    fetcher.mockResolvedValueOnce(fp("A-expirado"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.onEpochChange).toHaveBeenCalledTimes(1);
  });

  it("erro no fetch expira a lease e oculta dados", async () => {
    const { monitor, fetcher, deps } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    fetcher.mockRejectedValueOnce(new Error("rede"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("error");
  });

  it("offline expira imediatamente no ciclo seguinte", async () => {
    const { monitor, fetcher, deps, setOnline } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    setOnline(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("offline");
  });

  it("retorno de foco revalida antes de mostrar dados", async () => {
    const { monitor, fetcher, setVisible } = setup();
    fetcher.mockResolvedValue(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    setVisible(false);
    await vi.advanceTimersByTimeAsync(30_000); // invisível: sem poll
    expect(fetcher).toHaveBeenCalledTimes(1);
    setVisible(true);
    monitor.revalidate();
    expect(monitor.state()).toBe("pending");
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("resposta atrasada além da lease não renova lease vencida", async () => {
    let resolveLate!: (v: AuthzFingerprintResult) => void;
    const { monitor, deps } = setup({
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolveLate = res; }),
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(15_000); // lease vence sem resposta
    expect(monitor.state()).toBe("expired");
    resolveLate(fp("A"));
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("timeout");
  });

  it("ABA: resposta de geração antiga não reabre dados após revalidate", async () => {
    let resolveOld!: (v: AuthzFingerprintResult) => void;
    const fetcher = vi.fn<() => Promise<AuthzFingerprintResult>>()
      .mockImplementationOnce(() => new Promise((res) => { resolveOld = res; }))
      .mockResolvedValueOnce(fp("B"));
    const { monitor } = setup({ fetcher });
    monitor.start();
    monitor.revalidate(); // geração nova antes da antiga resolver
    await vi.advanceTimersByTimeAsync(0);
    resolveOld(fp("A")); // resposta antiga chega depois
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.currentFingerprint()).toBe("B");
  });

  it("stop() (logout) encerra e ignora respostas pendentes", async () => {
    let resolvePending!: (v: AuthzFingerprintResult) => void;
    const { monitor, deps } = setup({
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolvePending = res; }),
    });
    monitor.start();
    monitor.stop();
    resolvePending(fp("A"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(monitor.state()).toBe("stopped");
    expect(deps.onEpochChange).not.toHaveBeenCalled();
    expect(deps.onExpire).not.toHaveBeenCalled();
  });

  it("ineligible (perfil inativo) expira com motivo próprio", async () => {
    const { monitor, fetcher, deps } = setup();
    fetcher.mockResolvedValue({ eligible: false, fingerprint: null });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("ineligible");
  });
});
