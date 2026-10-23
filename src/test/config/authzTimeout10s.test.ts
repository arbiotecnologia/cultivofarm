import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthzEpochMonitor, type AuthzFingerprintResult } from "@/lib/authz/authzEpochMonitor";

// Regressão real pós-C2 (log 18:00:55Z): rttMs ~10.009, leaseRemainingMs -9,
// requestRemainingMs 4.991 — requisição de ~10s cruzou o deadline confirmado
// anterior e expirou fail-closed. Estes testes fixam o contrato do monitor:
// 10s DENTRO do orçamento de 15s autoriza; cruzar o deadline confirmado expira;
// a recuperação com o MESMO fingerprint não é mudança de época.

const fp = (f: string): AuthzFingerprintResult => ({ eligible: true, fingerprint: f });

function setup(overrides: Partial<Parameters<typeof createAuthzEpochMonitor>[0]> = {}) {
  let clock = 0;
  const fetcher = vi.fn<() => Promise<AuthzFingerprintResult>>();
  const deps = {
    fetcher,
    now: () => clock,
    setTimeoutFn: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clearTimeoutFn: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    isVisible: () => true,
    isOnline: () => true,
    onEpochChange: vi.fn(),
    onExpire: vi.fn(),
    onStateChange: vi.fn(),
    ...overrides,
  };
  const monitor = createAuthzEpochMonitor(deps);
  const advance = async (ms: number) => { clock += ms; await vi.advanceTimersByTimeAsync(ms); };
  return { monitor, deps, fetcher, advance };
}

function deferred() {
  let resolve: (v: AuthzFingerprintResult) => void = () => undefined;
  const promise = new Promise<AuthzFingerprintResult>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("timeout 10s versus request 15s (regressão real pós-C2)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("resposta em 10s dentro do orçamento de 15s autoriza; lease conta do INÍCIO do request", async () => {
    const { monitor, fetcher, advance } = setup();
    const slow = deferred();
    fetcher.mockImplementationOnce(() => slow.promise);
    monitor.start();
    await advance(10_000); // request em voo há 10s; orçamento de 15s não esgotado
    expect(monitor.state()).toBe("pending");
    slow.resolve(fp("A"));
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(monitor.checkAccess()).toBe(true);
    // Lease de 15s desde o início do request: restam ~5s após o RTT de 10s.
    await advance(4_900);
    expect(monitor.checkAccess()).toBe(true);
    await advance(200); // cruzou o deadline: fail-closed
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
  });

  it("resposta de 10s que cruza o deadline confirmado anterior expira (log real)", async () => {
    const { monitor, deps, fetcher, advance } = setup();
    fetcher.mockResolvedValueOnce(fp("A")); // confirmação rápida em t0
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid"); // lease até t15
    const slow = deferred();
    fetcher.mockImplementationOnce(() => slow.promise);
    await advance(10_000); // poll em background em t10; RTT de 10s responderia em t20
    await advance(5_000); // t15: deadline confirmado cruzado com request em voo
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("timeout");
    slow.resolve(fp("A")); // resposta tardia NUNCA reabre
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
  });

  it("recuperação após timeout transitório com o MESMO fingerprint: valid, sem epoch change", async () => {
    const { monitor, deps, fetcher, advance } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    const slow = deferred();
    fetcher.mockImplementationOnce(() => slow.promise);
    await advance(15_100); // poll t10 sem resposta → expira em t15
    expect(monitor.state()).toBe("expired");
    slow.resolve(fp("A"));
    await vi.advanceTimersByTimeAsync(0);
    // Transporte saudável na revalidação explícita (mesmo botão Retry canônico)
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.revalidate();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(monitor.checkAccess()).toBe(true);
    expect(deps.onEpochChange).not.toHaveBeenCalled(); // mesmo fingerprint: NÃO é nova época
  });

  it("fingerprint DIFERENTE na recuperação é mudança real de época (revogação)", async () => {
    const { monitor, deps, fetcher, advance } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    const slow = deferred();
    fetcher.mockImplementationOnce(() => slow.promise);
    await advance(15_100);
    expect(monitor.state()).toBe("expired");
    slow.resolve(fp("A"));
    await vi.advanceTimersByTimeAsync(0);
    fetcher.mockResolvedValueOnce(fp("B")); // vetor de autorização mudou
    monitor.revalidate();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(deps.onEpochChange).toHaveBeenCalledTimes(1); // época muda: consumidores descartam estado
  });
});
