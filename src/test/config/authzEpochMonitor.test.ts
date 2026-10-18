import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthzEpochMonitor, type AuthzFingerprintResult } from "@/lib/authz/authzEpochMonitor";

// Foundation de cache de autorização (mesma identidade). Relógio MONOTÔNICO e
// promises controlados: cobre troca de vínculo mesmo uid/org/role, duas sessões
// sem Broadcast, expiração de lease com aba oculta, offline durante fetch,
// resposta atrasada, A→B→A, erro, volta de foco, retry e logout.

const fp = (f: string): AuthzFingerprintResult => ({ eligible: true, fingerprint: f });

function setup(overrides: Partial<Parameters<typeof createAuthzEpochMonitor>[0]> = {}) {
  const events: string[] = [];
  let visible = true;
  let online = true;
  let clock = 0; // relógio monotônico controlado
  const fetcher = vi.fn<() => Promise<AuthzFingerprintResult>>();
  const deps = {
    fetcher,
    now: () => clock,
    setTimeoutFn: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clearTimeoutFn: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    isVisible: () => visible,
    isOnline: () => online,
    onEpochChange: vi.fn(() => events.push("epoch")),
    onExpire: vi.fn((r: string) => events.push(`expire:${r}`)),
    onStateChange: vi.fn(),
    ...overrides,
  };
  const monitor = createAuthzEpochMonitor(deps);
  const advance = async (ms: number) => { clock += ms; await vi.advanceTimersByTimeAsync(ms); };
  return { monitor, deps, events, fetcher, advance, setVisible: (v: boolean) => { visible = v; }, setOnline: (v: boolean) => { online = v; } };
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
    expect(monitor.checkAccess()).toBe(true);
    expect(deps.onEpochChange).not.toHaveBeenCalled();
  });

  it("mudança de vínculo (mesmo uid/org/role) dispara epoch change no próximo poll", async () => {
    const { monitor, fetcher, deps, advance } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    fetcher.mockResolvedValueOnce(fp("B"));
    await advance(10_000);
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
    await b.advance(10_000);
    expect(b.deps.onEpochChange).toHaveBeenCalledTimes(1);
    expect(a.deps.onEpochChange).not.toHaveBeenCalled();
  });

  it("expiração temporal (vigência vira inválida) muda fingerprint e notifica", async () => {
    const { monitor, fetcher, deps, advance } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    fetcher.mockResolvedValueOnce(fp("A-expirado"));
    await advance(10_000);
    expect(deps.onEpochChange).toHaveBeenCalledTimes(1);
  });

  it("lease expira mesmo em estado valid com aba oculta (sem estender autorização)", async () => {
    const { monitor, fetcher, setVisible, advance } = setup();
    fetcher.mockResolvedValue(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    setVisible(false);
    await advance(15_001);
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
  });

  it("revalidação explícita oculta imediatamente mesmo com lease vigente", async () => {
    let resolveFetch!: (v: AuthzFingerprintResult) => void;
    const { monitor, advance } = setup({
      fetcher: vi.fn()
        .mockResolvedValueOnce(fp("A"))
        .mockImplementationOnce(() => new Promise((res) => { resolveFetch = res; })),
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.checkAccess()).toBe(true);
    monitor.revalidate();
    expect(monitor.state()).toBe("pending");
    expect(monitor.checkAccess()).toBe(false);
    // Lease vence durante o request em voo: acesso fecha mesmo sem resposta.
    await advance(15_001);
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
    resolveFetch(fp("A")); // resposta de geração antiga não reabre
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.checkAccess()).toBe(false);
  });

  it("poll em t10 NÃO estende autorização t15 para t25 antes da resposta", async () => {
    let resolveFetch: ((v: AuthzFingerprintResult) => void) | undefined;
    const { monitor, advance } = setup({
      fetcher: vi.fn().mockResolvedValueOnce(fp("A"))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; })),
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    await advance(10_000);
    expect(monitor.checkAccess()).toBe(true);
    await advance(5_000);
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
    resolveFetch?.(fp("B"));
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.currentFingerprint()).toBe("A");
    expect(monitor.checkAccess()).toBe(false);
  });

  it("resposta válida em t14 renova somente até t25 desde o início t10", async () => {
    let resolveFetch: ((v: AuthzFingerprintResult) => void) | undefined;
    const { monitor, advance, setVisible } = setup({
      fetcher: vi.fn().mockResolvedValueOnce(fp("A"))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; })),
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    await advance(10_000);
    await advance(4_000);
    resolveFetch?.(fp("A"));
    await vi.advanceTimersByTimeAsync(0);
    setVisible(false);
    await advance(10_999);
    expect(monitor.checkAccess()).toBe(true);
    await advance(1);
    expect(monitor.checkAccess()).toBe(false);
  });

  it("pending esconde render quando NÃO há lease vigente (primeira carga)", async () => {
    let resolveFetch!: (v: AuthzFingerprintResult) => void;
    const { monitor } = setup({
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolveFetch = res; }),
    });
    monitor.start();
    expect(monitor.state()).toBe("pending");
    expect(monitor.checkAccess()).toBe(false);
    resolveFetch(fp("A"));
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(monitor.checkAccess()).toBe(true);
  });

  it("offline durante fetch: resultado em voo não reabre dados", async () => {
    let resolveFetch!: (v: AuthzFingerprintResult) => void;
    const { monitor, deps, setOnline } = setup({
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolveFetch = res; }),
    });
    monitor.start();
    setOnline(false);
    monitor.expireNow("offline"); // evento offline imediato do navegador
    expect(monitor.state()).toBe("expired");
    resolveFetch(fp("A"));
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
    expect(deps.onEpochChange).not.toHaveBeenCalled();
  });

  it("erro no fetch expira a lease e oculta dados", async () => {
    const { monitor, fetcher, deps, advance } = setup();
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    fetcher.mockRejectedValueOnce(new Error("rede"));
    await advance(10_000);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("error");
  });

  it("retorno de foco após lease vencida revalida ANTES de mostrar dados", async () => {
    const { monitor, fetcher, setVisible, advance } = setup();
    fetcher.mockResolvedValue(fp("A"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    setVisible(false);
    await advance(15_001); // invisível: sem poll, lease vence
    expect(monitor.state()).toBe("expired");
    expect(fetcher).toHaveBeenCalledTimes(1);
    setVisible(true);
    monitor.revalidate(); // foco volta: pending esconde até revalidar
    expect(monitor.state()).toBe("pending");
    expect(monitor.checkAccess()).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("resposta atrasada além da lease não renova lease vencida", async () => {
    let resolveLate!: (v: AuthzFingerprintResult) => void;
    const { monitor, deps, advance } = setup({
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolveLate = res; }),
    });
    monitor.start();
    await advance(15_000); // lease vence sem resposta
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

  it("erro antigo após retry válido não expira a geração atual", async () => {
    let rejectOld: ((reason: Error) => void) | undefined;
    const fetcher = vi.fn<() => Promise<AuthzFingerprintResult>>()
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(fp("B"));
    const { monitor, deps } = setup({ fetcher });
    monitor.start(); monitor.revalidate();
    await vi.advanceTimersByTimeAsync(0);
    rejectOld?.(new Error("antigo"));
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.checkAccess()).toBe(true);
    expect(monitor.currentFingerprint()).toBe("B");
    expect(deps.onExpire).not.toHaveBeenCalled();
  });

  it("relógio passa deadline antes de timers: acesso nega e resposta tardia expira", async () => {
    let clock = 0;
    let resolveOld: ((value: AuthzFingerprintResult) => void) | undefined;
    const { monitor } = setup({ now: () => clock,
      fetcher: vi.fn().mockResolvedValueOnce(fp("A"))
        .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })),
    });
    monitor.start(); await vi.advanceTimersByTimeAsync(0);
    clock = 10_000; await vi.advanceTimersByTimeAsync(10_000);
    clock = 15_000;
    expect(monitor.checkAccess()).toBe(false);
    resolveOld?.(fp("B")); await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(monitor.currentFingerprint()).toBe("A");
  });

  it("retry após erro: revalidate com sucesso volta a mostrar dados", async () => {
    const { monitor, fetcher, advance } = setup();
    fetcher.mockRejectedValueOnce(new Error("rede"));
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    fetcher.mockResolvedValueOnce(fp("A"));
    monitor.revalidate();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(monitor.checkAccess()).toBe(true);
  });

  it("stop() (logout) encerra e ignora respostas pendentes", async () => {
    let resolvePending!: (v: AuthzFingerprintResult) => void;
    const { monitor, deps, advance } = setup({
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolvePending = res; }),
    });
    monitor.start();
    monitor.stop();
    resolvePending(fp("A"));
    await advance(20_000);
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

  it("server_remaining_ms menor que leaseMs encurta a autorização (boundary do servidor)", async () => {
    const { monitor, fetcher, advance } = setup();
    fetcher.mockResolvedValue({ eligible: true, fingerprint: "A", server_remaining_ms: 5_000 });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.checkAccess()).toBe(true);
    await advance(5_001); // boundary do servidor vence antes da lease local de 15s
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
  });

  it("server_remaining_ms consumido pelo RTT monotônico expira imediatamente", async () => {
    let clock = 0;
    let resolveFetch!: (v: AuthzFingerprintResult) => void;
    const { monitor } = setup({
      now: () => clock,
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolveFetch = res; }),
    });
    monitor.start();
    clock = 4_000; // RTT de 4s em voo
    resolveFetch({ eligible: true, fingerprint: "A", server_remaining_ms: 3_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(monitor.checkAccess()).toBe(false);
  });

  it("server_remaining_ms desconta RTT: resposta em t4 com budget 15s autoriza só até t15", async () => {
    let clock = 0;
    let resolveFetch!: (v: AuthzFingerprintResult) => void;
    const { monitor } = setup({
      now: () => clock,
      fetcher: () => new Promise<AuthzFingerprintResult>((res) => { resolveFetch = res; }),
    });
    monitor.start();
    clock = 4_000;
    resolveFetch({ eligible: true, fingerprint: "A", server_remaining_ms: 15_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.checkAccess()).toBe(true);
    // lease concedida = requestStart(0) + min(15s, 15s - 4s RTT) = 11s
    clock = 10_999;
    expect(monitor.checkAccess()).toBe(true);
    clock = 11_000;
    expect(monitor.checkAccess()).toBe(false);
  });

  it("sem server_remaining_ms mantém lease local padrão de 15s", async () => {
    const { monitor, fetcher, advance, setVisible } = setup();
    fetcher.mockResolvedValue({ eligible: true, fingerprint: "A", server_remaining_ms: null });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    setVisible(false); // sem poll em aba oculta: lease original não é renovada
    await advance(14_999);
    expect(monitor.checkAccess()).toBe(true);
    await advance(2);
    expect(monitor.checkAccess()).toBe(false);
  });

  it("revogação e restauração: ineligible fecha, fingerprint novo reabre após revalidate", async () => {
    const { monitor, fetcher, deps, advance } = setup();
    fetcher.mockResolvedValueOnce({ eligible: true, fingerprint: "A", server_remaining_ms: 15_000 });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.checkAccess()).toBe(true);
    // Revogação no servidor: próximo poll retorna ineligible.
    fetcher.mockResolvedValueOnce({ eligible: false, fingerprint: null });
    await advance(10_000);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("ineligible");
    expect(monitor.checkAccess()).toBe(false);
    // Restauração: revalidate explícito com fingerprint novo reabre.
    fetcher.mockResolvedValueOnce({ eligible: true, fingerprint: "B", server_remaining_ms: 15_000 });
    monitor.revalidate();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("valid");
    expect(monitor.currentFingerprint()).toBe("B");
    expect(monitor.checkAccess()).toBe(true);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negativo", -1],
  ])("server_remaining_ms %s (presente porém inválido) falha fechado, sem lease local", async (_label, budget) => {
    const { monitor, fetcher, deps, advance } = setup();
    fetcher.mockResolvedValue({ eligible: true, fingerprint: "A", server_remaining_ms: budget });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("error");
    expect(monitor.checkAccess()).toBe(false);
    // Não autoriza nem agenda revalidação válida silenciosa no ciclo seguinte.
    await advance(10_000);
    expect(monitor.state()).toBe("expired");
  });

  it("deadline já consumido apesar de effectiveLeaseMs>0: sem valid, sem epoch, sem poll", async () => {
    // RTT de 4s com budget 7s: effective = 3s > 0, mas deadline = t0+3s < now(t4).
    let clock = 0;
    let fetchCalls = 0;
    let resolveFetch!: (v: AuthzFingerprintResult) => void;
    const { monitor, deps } = setup({
      now: () => clock,
      fetcher: () => { fetchCalls++; return new Promise<AuthzFingerprintResult>((res) => { resolveFetch = res; }); },
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    clock = 4_000;
    resolveFetch({ eligible: true, fingerprint: "A", server_remaining_ms: 7_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.state()).toBe("expired");
    expect(deps.onExpire).toHaveBeenCalledWith("timeout");
    expect(monitor.checkAccess()).toBe(false);
    expect(monitor.currentFingerprint()).toBeNull();
    expect(deps.onEpochChange).not.toHaveBeenCalled();
    // Nenhum poll posterior reabre: fetcher não é chamado de novo.
    const callsBefore = fetchCalls;
    clock = 20_000;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchCalls).toBe(callsBefore);
    expect(monitor.state()).toBe("expired");
  });
});
