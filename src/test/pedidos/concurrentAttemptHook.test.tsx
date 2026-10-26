// Hook real useCreatePartnerOrder; dois envios da mesma chave em voo com desfechos fora de ordem.
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pending: [] as Array<(v: unknown) => void> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
  roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: () => new Promise(r => state.pending.push(r)),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
} }));
import { useCreatePartnerOrder } from "@/hooks/useCreatePartnerOrder";
import { clearAllOrderAttempts, markOrderAttemptSending, prepareOrderAttempt, readOrderAttempt } from "@/lib/authz/pendingOrderAttempt";

const REJECT = { data: null, error: { code: "P0001", message: "credit_limit_exceeded" } };
const LOST = { data: null, error: { code: "", message: "Failed to fetch" } };
const OK = { data: { id: "o1", numero: "PB-1", total: 1 }, error: null };
beforeEach(() => { clearAllOrderAttempts(); state.pending = []; });

it.each([
  ["rejeição 1º / sucesso 2º", [REJECT, OK], "committed"],
  ["sucesso 1º / rejeição 2º", [OK, REJECT], "committed"],
  ["rejeição 1º / perdida 2º", [REJECT, LOST], "ambiguous"],
  ["perdida 1º / rejeição 2º", [LOST, REJECT], "ambiguous"],
])("%s", async (_l, outcomes, expected) => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const h = renderHook(() => useCreatePartnerOrder(), { wrapper });
  const slot = h.result.current.slotFor("P")!;
  const input = { partner_id: "P", items: [{ item_id: "i", item_tipo: "produto", product_id: null, nome: "n", quantidade: 1, preco_unitario: 1, desconto_percentual: 0, subtotal: 1, unidade_pedido: "volume_comercial", volume_ml: 1000 }] as never,
    expected_cart_hash: "h", attempt_slot: slot };
  const sends: Promise<unknown>[] = [];
  act(() => {
    for (let i = 0; i < 2; i++) {          // mesmo tick, como dois cliques/instâncias
      const p = prepareOrderAttempt(slot, "fp", () => "key1"); if (!p.ok) throw new Error("blocked");
      markOrderAttemptSending(slot, p.key);
      sends.push(h.result.current.mutateAsync({ ...input, idempotency_key: p.key }).catch(() => null));
    }
  });
  await vi.waitFor(() => expect(state.pending).toHaveLength(2));
  await act(async () => { state.pending[0](outcomes[0]); await new Promise(r => setTimeout(r, 0)); });
  expect(readOrderAttempt(slot)).not.toBeNull();     // 2º ainda em voo: nunca apagado
  await act(async () => { state.pending[1](outcomes[1]); await Promise.all(sends); });
  const a = readOrderAttempt(slot);
  if (expected === "committed") expect(a?.order?.numero).toBe("PB-1");
  else expect(a?.ambiguous).toBe(true);
  expect(a?.inflight).toBe(false);
  // Retry com o mesmo payload reutiliza a chave; nunca gera chave órfã nova.
  const retry = prepareOrderAttempt(slot, "fp", () => "key2");
  expect(retry.ok && retry.key).toBe("key1");
  h.unmount(); qc.clear();
});
