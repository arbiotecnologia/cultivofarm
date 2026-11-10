import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const t = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), os: [] as any[], stock: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: t.rpc, from: t.from } }));
import { RevendaB2BPilotoPanel } from "@/components/entregas/RevendaB2BPilotoPanel";
import { RESALE_CAP_RPC, RESERVE_RPC } from "@/lib/entregas/b2bResaleDeliveryFlow";
import { CAPABILITY_RPC, GROUP_RPC } from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "11111111-1111-4111-8111-111111111111", ORG_B = "99999999-9999-4999-8999-999999999999";
const ACTOR = "22222222-2222-4222-8222-222222222222", OS = "33333333-3333-4333-8333-333333333333";
const ST = "44444444-4444-4444-8444-444444444444", SPLIT = "55555555-5555-4555-8555-555555555555";
const PA = "66666666-6666-4666-8666-666666666666", PO = "77777777-7777-4777-8777-777777777777";
const allowed = (op: string, ids: string[]) => ({ capability: "b2b_resale_delivery_v2", organization_id: ORG, os_id: OS, operation: op, allowed: true, stock_ids: ids });
const closedEnv = (op: string) => ({ capability: "b2b_resale_delivery_v2", organization_id: null, os_id: null, operation: op, allowed: false, stock_ids: [] });
function chain(table: string) {
  const c: any = { select: () => c, eq: () => c, not: () => c, in: () => c, order: () => c, limit: () => c,
    insert: () => { throw new Error("direct write"); }, update: () => { throw new Error("direct write"); },
    then: (y: any, n: any) => Promise.resolve({ data: table === "ordens_servico" ? t.os : t.stock, error: null }).then(y, n) };
  return c;
}
const writes = () => t.rpc.mock.calls.filter((c: any[]) => c[0] === RESERVE_RPC || c[0] === GROUP_RPC);
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  t.os = [{ id: OS, numero_os: "OS-RV-1", status: "pronto_entrega", updated_at: "2026-11-10T10:00:00Z", origem: "b2b", partner_order_id: PO, produto_id: "88888888-8888-4888-8888-888888888888", partner_orders: { partner_id: PA } }];
  t.stock = [{ id: ST, quantidade: 3, status: "disponivel", updated_at: "2026-11-10T10:00:00Z", reservado_para_os_id: null, quantidade_reservada: 0 }];
  t.from.mockImplementation(chain);
});
afterEach(() => cleanup());

describe("painel montado de revenda B2B (piloto)", () => {
  it("lista OS B2B; piloto ausente deixa botões desabilitados e nunca chama writer", async () => {
    t.rpc.mockImplementation(async (fn: string, a: any) => fn === RESALE_CAP_RPC ? { data: closedEnv(a.p_operation), error: null } : { data: null, error: { code: "X" } });
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    await screen.findByText("Operação de revenda indisponível para esta sessão.");
    expect(screen.getByRole("button", { name: "Reservar (piloto)" })).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });
  it("timeout da reserva: retém, bloqueia nova reserva, consulta exata confirma sem segunda chave", async () => {
    let n = 0;
    t.rpc.mockImplementation(async (fn: string, a: any) => {
      if (fn === RESALE_CAP_RPC) return { data: allowed(a.p_operation, a.p_stock_ids), error: null };
      if (fn === RESERVE_RPC) { n++; if (n === 1) return { data: null, error: { code: "57014", message: "timeout" } }; return { data: { ok: true, replay: true, itens: [SPLIT] }, error: null }; }
      return { data: null, error: { code: "X" } };
    });
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    const btn = await screen.findByRole("button", { name: "Reservar (piloto)" });
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Quantidade de embalagens"), { target: { value: "2" } });
    fireEvent.click(btn);
    await screen.findByText(/Resultado incerto/);
    expect(screen.getByRole("button", { name: "Reservar (piloto)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar mesma reserva" }));
    await screen.findByText("Reserva confirmada pelo recibo da mesma chave.");
    const w = writes(); expect(w).toHaveLength(2); expect(w[0][1]).toEqual(w[1][1]);
    expect(w[0][1]).toMatchObject({ p_origem: "b2b", p_itens: [{ item_id: ST, quantidade: 2 }], p_dados: { partner_id: PA, partner_order_id: PO } });
  });
  it("estoque reservado parcial para a OS cria entrega só com capability exata e mantém tentativa incerta", async () => {
    t.stock = [{ id: SPLIT, quantidade: 2, status: "reservado", updated_at: "2026-11-10T10:05:00Z", reservado_para_os_id: OS, quantidade_reservada: 2 }];
    t.rpc.mockImplementation(async (fn: string, a: any) => {
      if (fn === RESALE_CAP_RPC) return { data: allowed(a.p_operation, a.p_stock_ids), error: null };
      if (fn === CAPABILITY_RPC) return { data: { capability: "delivery_operations_v1", group: true, cancel: false }, error: null };
      if (fn === GROUP_RPC) return { data: null, error: { code: "57014" } };
      return { data: null, error: { code: "X" } };
    });
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    const row = within(await screen.findByLabelText(`Estoque ${SPLIT}`));
    await waitFor(() => expect(row.getByRole("button", { name: "Criar entrega (piloto)" })).not.toBeDisabled());
    fireEvent.click(row.getByRole("button", { name: "Criar entrega (piloto)" }));
    await screen.findByRole("button", { name: "Repetir mesmo envio" });
    const g = writes().filter(c => c[0] === GROUP_RPC); expect(g).toHaveLength(1);
    expect(g[0][1]).toMatchObject({ p_origem: "b2b", p_itens: [{ item_id: SPLIT, quantidade: 2 }] });
  });
  it("troca de empresa limpa lista e não reaproveita estado", async () => {
    t.rpc.mockImplementation(async (fn: string, a: any) => ({ data: closedEnv(a?.p_operation ?? "reserve"), error: null }));
    const h = render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    t.os = [];
    h.rerender(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG_B} />);
    await screen.findByText("Nenhuma OS de revenda pronta para entrega.");
    expect(screen.queryByRole("button", { name: "Reservar (piloto)" })).toBeNull();
  });
});
