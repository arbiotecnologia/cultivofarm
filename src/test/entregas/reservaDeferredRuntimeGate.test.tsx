import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ rpc: vi.fn(), audit: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "A" } }) }));
vi.mock("@/hooks/useCockpitQuery", () => ({ useCockpitQuery: () => ({ data: [] }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: s.success, warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc, from: (table: string) => {
  if (table !== "laboratorio_esteira_eventos") throw new Error(`unexpected_table:${table}`);
  return { insert: s.audit };
} } }));
import { useEsteiraLaboratorio } from "@/hooks/useEsteiraLaboratorio";
const split = "11111111-1111-4111-8111-111111111111";
let client: QueryClient;
beforeEach(() => { vi.clearAllMocks(); s.rpc.mockResolvedValue({ data: split, error: null }); s.audit.mockResolvedValue({ error: null }); client = new QueryClient(); });
afterEach(() => { cleanup(); client.clear(); });
function mount() { return renderHook(() => useEsteiraLaboratorio(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }); }
it("deferEffects entrega o UUID dividido confirmado sem efeitos globais", async () => {
  const h = mount(); const cb = vi.fn(); const invalidation = vi.spyOn(client, "invalidateQueries"); let ok: unknown;
  await act(async () => { ok = await h.result.current.reservarEstoque({ id: "original" }, { quantidade_reservada: 2 }, "OS", "b2b", false, { deferEffects: true, current: () => true, onReserved: cb }); });
  expect(ok).toBe(true); expect(cb).toHaveBeenCalledExactlyOnceWith(split); expect(s.audit).toHaveBeenCalledTimes(1); expect(invalidation).not.toHaveBeenCalled(); expect(s.success).not.toHaveBeenCalled();
});
it.each([null, {}, "original", false])("UUID inválido %j não confirma nem audita", async data => {
  s.rpc.mockResolvedValue({ data, error: null }); const h = mount(); const cb = vi.fn(); let ok: unknown;
  await act(async () => { ok = await h.result.current.reservarEstoque({ id: "original" }, { quantidade_reservada: 2 }, "OS", "b2b", false, { deferEffects: true, onReserved: cb }); });
  expect(ok).toBe(false); expect(cb).not.toHaveBeenCalled(); expect(s.audit).not.toHaveBeenCalled();
});
it.each(["before", "rpc", "audit"])("fence %s impede adoção/filhos/efeitos adiados", async phase => {
  let current = phase !== "before";
  if (phase === "rpc") s.rpc.mockImplementation(async () => { current = false; return { data: split, error: null }; });
  if (phase === "audit") s.audit.mockImplementation(async () => { current = false; return { error: null }; });
  const h = mount(); const cb = vi.fn(); let ok: unknown;
  await act(async () => { ok = await h.result.current.reservarEstoque({ id: "original" }, { quantidade_reservada: 2 }, "OS", "b2b", false, { deferEffects: true, current: () => current, onReserved: cb }); });
  expect(ok).toBe(false); expect(cb).not.toHaveBeenCalled(); expect(s.success).not.toHaveBeenCalled();
  if (phase === "before") expect(s.rpc).not.toHaveBeenCalled();
  if (phase === "rpc") expect(s.audit).not.toHaveBeenCalled();
});