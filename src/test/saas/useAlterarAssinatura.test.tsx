import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/saas/subscriptionTransition", async (original) => ({
  ...await original<typeof import("@/lib/saas/subscriptionTransition")>(),
  createSubscriptionTransition: () => mock.run,
}));
import { useAlterarAssinatura } from "@/hooks/usePlataformaSaaS";
const value = { organizationId: "test", action: "suspend" as const, planVersionId: null, reason: "teste" };
function setup() {
  const client = new QueryClient();
  const invalidation = vi.spyOn(client, "invalidateQueries").mockImplementation(() => new Promise(() => undefined));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useAlterarAssinatura(), { wrapper }), invalidation };
}
beforeEach(() => { mock.run.mockReset(); });
describe("useAlterarAssinatura — lifecycle limitado", () => {
  it("sucesso não espera caches pendentes e invalida apenas quatro famílias", async () => {
    mock.run.mockResolvedValue({ correlationId: "key", reconciled: false });
    const { result, invalidation } = setup();
    await act(async () => { await result.current.mutateAsync(value); });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(invalidation.mock.calls.map(([options]) => options?.queryKey)).toEqual([
      ["plataforma", "organization_subscriptions"], ["plataforma", "organization_subscription_history"],
      ["saas", "entitlements"], ["saas", "entitlement-context"],
    ]);
  });
  it("reconciliação informa verifying e finally sempre libera erro", async () => {
    let reject: ((e: Error) => void) | undefined;
    mock.run.mockImplementation((_value, verifying) => { verifying(); return new Promise((_, fail) => { reject = fail; }); });
    const { result, invalidation } = setup();
    act(() => result.current.mutate(value));
    await waitFor(() => expect(result.current.verifying).toBe(true));
    await act(async () => { reject?.(new Error("subscription_result_unknown")); });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.verifying).toBe(false);
    expect(invalidation).not.toHaveBeenCalled();
  });
  it("desmontagem preserva conclusão sem escrita adicional", async () => {
    let resolve: ((v: unknown) => void) | undefined;
    mock.run.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result, unmount, invalidation } = setup();
    act(() => result.current.mutate(value));
    await waitFor(() => expect(result.current.isPending).toBe(true));
    unmount();
    await act(async () => { resolve?.({ correlationId: "key", reconciled: true }); });
    expect(mock.run).toHaveBeenCalledTimes(1);
    expect(invalidation).toHaveBeenCalledTimes(4);
  });
});