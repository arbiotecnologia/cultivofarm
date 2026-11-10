import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const t = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), os: [] as any[], stock: [] as any[], filters: [] as any[], gate: {} as Record<string, Promise<void>> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: t.rpc, from: t.from } }));
import { RevendaB2BPilotoPanel } from "@/components/entregas/RevendaB2BPilotoPanel";
import { RESALE_CAP_RPC, RESERVE_RPC } from "@/lib/entregas/b2bResaleDeliveryFlow";
import { CAPABILITY_RPC, GROUP_RPC } from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "11111111-1111-4111-8111-111111111111", ORG_B = "99999999-9999-4999-8999-999999999999";
const ACTOR = "22222222-2222-4222-8222-222222222222", OS = "33333333-3333-4333-8333-333333333333";
const ST = "44444444-4444-4444-8444-444444444444", SPLIT = "55555555-5555-4555-8555-555555555555";
const PA = "66666666-6666-4666-8666-666666666666", PO = "77777777-7777-4777-8777-777777777777";
const PROD = "88888888-8888-4888-8888-888888888888", PROD_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OS_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const lot = (code: string, prod = PROD, org = ORG) => ({ lote_id: `lot-${code}`, lotes: { codigo_lote: code, organization_id: org, produto_id: prod } });
const allowed = (op: string, ids: string[], os = OS) => ({ capability: "b2b_resale_delivery_v2", organization_id: ORG, os_id: os, operation: op, allowed: true, stock_ids: ids });
const closedEnv = (op: string) => ({ capability: "b2b_resale_delivery_v2", organization_id: null, os_id: null, operation: op, allowed: false, stock_ids: [] });
function chain(table: string) {
  const f: Record<string, unknown> = {}; t.filters.push({ table, f });
  const c: any = { select: () => c, eq: (k: string, v: unknown) => { f[k] = v; return c; }, not: () => c, in: () => c, order: () => c, limit: () => c,
    insert: () => { throw new Error("direct write"); }, update: () => { throw new Error("direct write"); },
    then: (y: any, n: any) => (t.gate[String(f.produto_id)] ?? Promise.resolve()).then(() => ({ data: table === "ordens_servico" ? t.os : t.stock.filter((r: any) => !r.produto || r.produto === f.produto_id), error: null })).then(y, n) };
  return c;
}
const writes = () => t.rpc.mock.calls.filter((c: any[]) => c[0] === RESERVE_RPC || c[0] === GROUP_RPC);
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  t.os = [{ id: OS, numero_os: "OS-RV-1", status: "pronto_entrega", updated_at: "2026-11-10T10:00:00Z", origem: "b2b", partner_order_id: PO, produto_id: PROD, partner_orders: { partner_id: PA } }];
  t.filters = []; t.gate = {};
  t.stock = [{ id: ST, ...lot("L-A1"), quantidade: 3, status: "disponivel", updated_at: "2026-11-10T10:00:00Z", reservado_para_os_id: null, quantidade_reservada: 0 }];
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
    fireEvent.change(screen.getByLabelText("Quantidade de embalagens do lote L-A1"), { target: { value: "2" } });
    fireEvent.click(btn);
    await screen.findByText(/Resultado incerto/);
    expect(screen.getByRole("button", { name: "Reservar (piloto)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Consultar mesma reserva" }));
    await screen.findByText("Reserva confirmada pelo recibo da mesma chave.");
    const w = writes(); expect(w).toHaveLength(2); expect(w[0][1]).toEqual(w[1][1]);
    expect(w[0][1]).toMatchObject({ p_origem: "b2b", p_itens: [{ item_id: ST, quantidade: 2 }], p_dados: { partner_id: PA, partner_order_id: PO } });
  });
  it("estoque reservado parcial para a OS cria entrega só com capability exata e mantém tentativa incerta", async () => {
    t.stock = [{ id: SPLIT, ...lot("L-A1"), quantidade: 2, status: "reservado", updated_at: "2026-11-10T10:05:00Z", reservado_para_os_id: OS, quantidade_reservada: 2 }];
    t.rpc.mockImplementation(async (fn: string, a: any) => {
      if (fn === RESALE_CAP_RPC) return { data: allowed(a.p_operation, a.p_stock_ids), error: null };
      if (fn === CAPABILITY_RPC) return { data: { capability: "delivery_operations_v1", group: true, cancel: false }, error: null };
      if (fn === GROUP_RPC) return { data: null, error: { code: "57014" } };
      return { data: null, error: { code: "X" } };
    });
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    const row = within(await screen.findByLabelText("Lote L-A1"));
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

  it("lista de OS e estoque usam filtro explícito de empresa e vínculo lote→produto", async () => {
    t.rpc.mockImplementation(async (fn: string, a: any) => ({ data: closedEnv(a?.p_operation ?? "reserve"), error: null }));
    t.stock.push({ id: "foreign", ...lot("L-X", PROD, ORG_B), quantidade: 3, status: "disponivel", updated_at: "x", reservado_para_os_id: null, quantidade_reservada: 0 });
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    await screen.findByLabelText("Lote L-A1");
    expect(screen.queryByLabelText("Lote L-X")).toBeNull();
    expect(t.filters.find(x => x.table === "ordens_servico").f.organization_id).toBe(ORG);
    expect(t.filters.find(x => x.table === "estoque_produto").f).toMatchObject({ "lotes.organization_id": ORG, "lotes.produto_id": PROD });
  });
  it("dois lotes com mesma quantidade são distinguíveis e reservam o lote escolhido", async () => {
    t.stock = [{ id: ST, ...lot("L-A1"), quantidade: 3, status: "disponivel", updated_at: "u", reservado_para_os_id: null, quantidade_reservada: 0 },
      { id: SPLIT, ...lot("L-A2"), quantidade: 3, status: "disponivel", updated_at: "u", reservado_para_os_id: null, quantidade_reservada: 0 }];
    t.rpc.mockImplementation(async (fn: string, a: any) => fn === RESALE_CAP_RPC ? { data: allowed(a.p_operation, a.p_stock_ids), error: null } : fn === RESERVE_RPC ? { data: { ok: true, itens: [a.p_itens[0].item_id] }, error: null } : { data: null, error: { code: "X" } });
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    const row = within(await screen.findByLabelText("Lote L-A2"));
    await waitFor(() => expect(row.getByRole("button", { name: "Reservar (piloto)" })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Quantidade de embalagens do lote L-A2"), { target: { value: "1" } });
    fireEvent.click(row.getByRole("button", { name: "Reservar (piloto)" }));
    await screen.findByText("Reserva registrada.");
    expect(writes()[0][1].p_itens).toEqual([{ item_id: SPLIT, quantidade: 1 }]);
  });
  it("resposta tardia da OS A não substitui linhas/capabilities da OS B", async () => {
    t.os.push({ ...t.os[0], id: OS_B, numero_os: "OS-RV-2", produto_id: PROD_B });
    t.stock = [{ id: ST, produto: PROD, ...lot("L-A1"), quantidade: 3, status: "disponivel", updated_at: "u", reservado_para_os_id: null, quantidade_reservada: 0 },
      { id: SPLIT, produto: PROD_B, ...lot("L-B1", PROD_B), quantidade: 4, status: "disponivel", updated_at: "u", reservado_para_os_id: null, quantidade_reservada: 0 }];
    let release!: () => void; t.gate[PROD] = new Promise<void>(r => { release = r; });
    t.rpc.mockImplementation(async (fn: string, a: any) => ({ data: fn === RESALE_CAP_RPC ? allowed(a.p_operation, a.p_stock_ids, a.p_os_id) : null, error: null }));
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    fireEvent.click(screen.getByRole("button", { name: "OS OS-RV-2" }));
    await screen.findByLabelText("Lote L-B1");
    release(); await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByLabelText("Lote L-A1")).toBeNull();
    expect(screen.getByLabelText("Lote L-B1")).toBeTruthy();
    expect(t.rpc.mock.calls.filter(c => c[0] === RESALE_CAP_RPC && c[1].p_os_id === OS)).toHaveLength(0);
  });
  it("entrega incerta da OS A permanece retida ao selecionar OS B e bloqueia nova entrega", async () => {
    t.os.push({ ...t.os[0], id: OS_B, numero_os: "OS-RV-2", produto_id: PROD_B });
    t.stock = [{ id: SPLIT, produto: PROD, ...lot("L-A1"), quantidade: 2, status: "reservado", updated_at: "u", reservado_para_os_id: OS, quantidade_reservada: 2 },
      { id: ST, produto: PROD_B, ...lot("L-B1", PROD_B), quantidade: 2, status: "reservado", updated_at: "u", reservado_para_os_id: OS_B, quantidade_reservada: 2 }];
    t.rpc.mockImplementation(async (fn: string, a: any) => {
      if (fn === RESALE_CAP_RPC) return { data: allowed(a.p_operation, a.p_stock_ids, a.p_os_id), error: null };
      if (fn === CAPABILITY_RPC) return { data: { capability: "delivery_operations_v1", group: true, cancel: false }, error: null };
      if (fn === GROUP_RPC) return { data: null, error: { code: "57014" } };
      return { data: null, error: { code: "X" } };
    });
    render(<RevendaB2BPilotoPanel actorId={ACTOR} orgId={ORG} />);
    fireEvent.click(await screen.findByRole("button", { name: "OS OS-RV-1" }));
    const rowA = within(await screen.findByLabelText("Lote L-A1"));
    await waitFor(() => expect(rowA.getByRole("button", { name: "Criar entrega (piloto)" })).not.toBeDisabled());
    fireEvent.click(rowA.getByRole("button", { name: "Criar entrega (piloto)" }));
    await screen.findByRole("button", { name: "Repetir mesmo envio" });
    fireEvent.click(screen.getByRole("button", { name: "OS OS-RV-2" }));
    const rowB = within(await screen.findByLabelText("Lote L-B1"));
    await screen.findByText(/resultado incerto da OS OS-RV-1/);
    expect(screen.getByRole("button", { name: "Repetir mesmo envio" })).toBeTruthy();
    await new Promise(r => setTimeout(r, 20));
    expect(rowB.getByRole("button", { name: "Criar entrega (piloto)" })).toBeDisabled();
    expect(writes().filter(c => c[0] === GROUP_RPC)).toHaveLength(1);
  });
});
