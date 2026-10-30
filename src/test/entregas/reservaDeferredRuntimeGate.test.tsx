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
it.each([true,false])('deferEffects=%s não abre reserva individual nem auditoria',async deferEffects=>{
 const h=mount();const cb=vi.fn();const invalidation=vi.spyOn(client,'invalidateQueries');let ok:unknown;
 await act(async()=>{ok=await h.result.current.reservarEstoque({id:'original'},{quantidade_reservada:2},'OS','b2b',true,{deferEffects,current:()=>true,onReserved:cb});});
 expect(ok).toBe(false);expect(s.rpc).not.toHaveBeenCalled();expect(s.audit).not.toHaveBeenCalled();expect(cb).not.toHaveBeenCalled();expect(s.success).not.toHaveBeenCalled();expect(invalidation).not.toHaveBeenCalled();
});
it('criação direta pelo hook não envia RPC',async()=>{const h=mount();await expect(h.result.current.criarEntrega({estoque_produto_id:split},'OS','manual')).rejects.toThrow();expect(s.rpc).not.toHaveBeenCalled();expect(s.audit).not.toHaveBeenCalled();});
it('confirmação direta pelo hook não envia RPC',async()=>{const h=mount();expect(await h.result.current.confirmarEntrega(split,'OS','manual',{nome:'Recebedor'})).toBe(false);expect(s.rpc).not.toHaveBeenCalled();expect(s.audit).not.toHaveBeenCalled();expect(s.success).not.toHaveBeenCalled();});
it('cancelamento de reserva direto pelo hook não envia RPC',async()=>{const h=mount();expect(await h.result.current.cancelarReservaEstoque({id:split},'OS','manual','motivo')).toBe(false);expect(s.rpc).not.toHaveBeenCalled();expect(s.audit).not.toHaveBeenCalled();expect(s.success).not.toHaveBeenCalled();});
it('reserva em lote independente permanece no RPC canônico',async()=>{s.rpc.mockResolvedValue({data:{ok:true,replay:false},error:null});const h=mount();expect(await h.result.current.reservarEstoqueLote({osId:'OS',origem:'manual',itens:[{item_id:split,quantidade:2}],idempotencyKey:'canonical'})).toEqual({ok:true,replay:false});expect(s.rpc).toHaveBeenCalledExactlyOnceWith('rpc_estoque_reservar_v1',expect.objectContaining({p_idempotency_key:'canonical'}));});
