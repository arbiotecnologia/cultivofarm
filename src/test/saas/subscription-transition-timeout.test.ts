import { afterEach, describe, expect, it, vi } from "vitest";
import { createSubscriptionTransition, SubscriptionResultUnknown, type SubscriptionAction } from "@/lib/saas/subscriptionTransition";

const input: SubscriptionAction = { organizationId: "org", action: "change_plan", planVersionId: "version", reason: "teste focal" };
const id = "00000000-0000-4000-8000-000000000001";
const stuck = () => new Promise<never>(() => undefined);
afterEach(() => vi.useRealTimers());

describe("Assinatura: prazo finito e correlação idempotente", () => {
  it("sucesso aceita UUID e não consulta nem repete", async () => {
    const write = vi.fn().mockResolvedValue({ data: id, error: null });
    const committed = vi.fn();
    expect(await createSubscriptionTransition({ write, committed })(input, vi.fn())).toMatchObject({ reconciled: false });
    expect(write).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
  });
  it("erro RPC explícito libera e não repete", async () => {
    const write = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "platform_forbidden" } });
    const committed = vi.fn();
    await expect(createSubscriptionTransition({ write, committed })(input, vi.fn())).rejects.toThrow("platform_forbidden");
    expect(write).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
  });
  it("timeout sem commit encerra após leituras limitadas e preserva chave no retry manual", async () => {
    vi.useFakeTimers();
    const write = vi.fn(stuck);
    const committed = vi.fn().mockResolvedValue(false);
    const execute = createSubscriptionTransition({ write, committed }, 100, 50);
    const verify = vi.fn();
    const first = execute(input, verify).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(101);
    const error = await first;
    expect(error).toBeInstanceOf(SubscriptionResultUnknown);
    expect(verify).toHaveBeenCalled();
    expect(committed).toHaveBeenCalledTimes(3);
    const second = execute({ ...input, reason: " teste focal " }, verify).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(101);
    await second;
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0]?.[1]).toBe(write.mock.calls[1]?.[1]);
  });
  it("timeout com commit é sucesso reconciliado sem nova mutação", async () => {
    vi.useFakeTimers();
    const write = vi.fn(stuck);
    const committed = vi.fn().mockResolvedValue(true);
    const promise = createSubscriptionTransition({ write, committed }, 100, 50)(input, vi.fn());
    await vi.advanceTimersByTimeAsync(101);
    expect(await promise).toMatchObject({ reconciled: true });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("duplo clique compartilha a mesma promise e faz só uma RPC", async () => {
    const write = vi.fn().mockResolvedValue({ data: id, error: null });
    const execute = createSubscriptionTransition({ write, committed: vi.fn() });
    const first = execute(input, vi.fn());
    expect(execute(input, vi.fn())).toBe(first);
    await first;
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("rede, resposta malformada e sessão expirada reconciliam sem revelar detalhes", async () => {
    for (const response of [{ data: {}, error: null }, { data: null, error: { code: "PGRST301", message: "sensitive" } }]) {
      const write = vi.fn().mockResolvedValue(response);
      await expect(createSubscriptionTransition({ write, committed: vi.fn().mockResolvedValue(false) })(input, vi.fn())).rejects.toThrow("subscription_result_unknown");
    }
    await expect(createSubscriptionTransition({ write: vi.fn().mockRejectedValue(new Error("network")), committed: vi.fn().mockResolvedValue(false) })(input, vi.fn())).rejects.toBeInstanceOf(SubscriptionResultUnknown);
  });
  it("libera mesmo quando todas as leituras ficam pendentes", async () => {
    vi.useFakeTimers();
    const write = vi.fn(stuck);
    const execute = createSubscriptionTransition({ write, committed: vi.fn(stuck) }, 100, 50);
    const promise = execute(input, vi.fn()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(251);
    expect(await promise).toBeInstanceOf(SubscriptionResultUnknown);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("retry manual reconcilia commit tardio antes de qualquer mutação", async () => {
    vi.useFakeTimers();
    const write = vi.fn(stuck);
    const committed = vi.fn().mockResolvedValue(false);
    const execute = createSubscriptionTransition({ write, committed }, 100, 50);
    const first = execute(input, vi.fn()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(101);
    await first;
    committed.mockResolvedValue(true);
    expect(await execute(input, vi.fn())).toMatchObject({ reconciled: true });
    expect(write).toHaveBeenCalledTimes(1);
  });
});