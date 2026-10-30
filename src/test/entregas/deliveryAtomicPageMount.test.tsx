import React, { type PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ auth: {} as any, rpc: vi.fn(), from: vi.fn(), submit: undefined as any, success: vi.fn(), error: vi.fn(), current: { os: null as any, estoque: [] as any[], entrega: null as any }, rows: [] as any[], writes: [] as any[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => t.auth }));
vi.mock("@/hooks/useCockpitQuery", () => ({ useCockpitQuery: () => ({ data: [] }) }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: {}, defaults: {} }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: t.success, error: t.error, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: t.rpc, from: t.from, channel: () => { const c: any = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn() } }));
vi.mock("@/components/entregas/RegistrarEntregaDialog", () => ({ RegistrarEntregaDialog: (p: any) => { t.submit = p.onSubmit; return null; } }));
vi.mock("@/components/entregas/ConfirmarEntregaDialog", () => ({ ConfirmarEntregaDialog: () => null }));
vi.mock("@/components/financeiro/ConfirmarEntregaFinanceiroDialog", () => ({ ConfirmarEntregaFinanceiroDialog: () => null }));
vi.mock("@/components/entregas/EntregaComprovantePanel", () => ({ EntregaComprovantePanel: () => null }));
vi.mock("@/components/entregas/TermoEntregaPanel", () => ({ TermoEntregaPanel: () => null }));
vi.mock("@/components/estoque/EmbalagensEntregaPanel", () => ({ EmbalagensEntregaPanel: () => null }));
vi.mock("@/components/entregas/PreviewDocumentoEntrega", () => ({ PreviewDocumentoEntrega: () => null }));
import Entregas from "@/pages/Entregas";
import { CANCEL_RPC, CAPABILITY_RPC, GROUP_RPC } from "@/lib/entregas/deliveryOperationsFlow";

const ORG = "10000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";
const ACTOR = "10000000-0000-4000-8000-000000000003";
const OS = "10000000-0000-4000-8000-000000000007";
const S = "10000000-0000-4000-8000-000000000013";
const E1 = "10000000-0000-4000-8000-000000000101";
const M1 = "10000000-0000-4000-8000-000000000201";
const T1 = "2026-10-30T10:00:00Z";
const T2 = "2026-10-30T11:00:00Z";
const cap = { capability: "delivery_operations_v1", group: true, cancel: true };
const groupAck = { success: true, replay: false, organization_id: ORG, os_id: OS, itens: [{ entrega_id: E1, estoque_produto_id: S, movimentacao_id: M1 }] };
const cancelAck = { success: true, replay: false, organization_id: ORG, entrega_id: E1, estoque_estornado: true, reserva_liberada: true };

function payload(over: any = {}) {
  return {
    grupoId: "30000000-0000-4000-8000-000000000999", osId: OS, osTipo: "padrao",
    itens: [{ item: { id: S, status: "disponivel", _saldo: 10 }, quantidade: 1 }],
    tipo_entrega: "motorista", motorista: "", veiculo: "", data_saida: "", endereco_origem: "cadastro",
    observed: { os: { id: OS, type: "padrao", updated_at: T1, origem: "agronomica", partner_order_id: null }, itens: { [S]: { updated_at: T1, status: "disponivel" } } },
    ...over,
  };
}
function chain(table: string) {
  let sel = ""; let single = false;
  const c: any = {
    select: (s: string) => { sel = s; return c; }, update: (v: any) => { t.writes.push([table, "update", v]); return c; }, insert: (v: any) => { t.writes.push([table, "insert", v]); return c; },
    delete: () => { t.writes.push([table, "delete"]); return c; }, eq: () => c, neq: () => c, in: () => c, order: () => c, limit: () => c, abortSignal: () => c, single: () => c,
    maybeSingle: () => { single = true; return c; },
    then: (yes: any, no: any) => {
      let data: any = [];
      if (table === "ordens_servico" && single) data = t.current.os;
      else if (table === "estoque_produto" && sel.startsWith("id, updated_at, status")) data = t.current.estoque;
      else if (table === "entregas" && single) data = t.current.entrega;
      else if (table === "entregas") data = t.rows;
      return Promise.resolve({ data, error: null }).then(yes, no);
    },
  };
  return c;
}
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
  return { ...render(<Entregas />, { wrapper }), qc };
}
const writerCalls = () => t.rpc.mock.calls.filter((c: any[]) => c[0] === GROUP_RPC || c[0] === CANCEL_RPC);
const pendingKey = `cf:delivery-uncertain:v1:${ACTOR}:${ORG}`;

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); t.writes = []; t.rows = [];
  t.auth = { user: { id: ACTOR }, profile: { user_id: ACTOR, organization_id: ORG, ativo: true }, role: "gestor", roles: ["gestor"], loading: false, authzReady: true, authzEpoch: 0 };
  t.current = { os: { id: OS, updated_at: T1, origem: "agronomica", partner_order_id: null }, estoque: [{ id: S, updated_at: T1, status: "disponivel" }], entrega: null };
  t.from.mockImplementation(chain);
  t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : fn === GROUP_RPC ? { data: groupAck, error: null } : { data: cancelAck, error: null });
});
afterEach(() => { cleanup(); });

describe("Entregas page with atomic adapter (mounted)", () => {
  it("dispatches exactly the observed revisions when unchanged", async () => {
    const h = mount();
    await act(async () => { await t.submit(payload()); });
    expect(writerCalls()).toHaveLength(1);
    expect(writerCalls()[0][1]).toMatchObject({ p_os_observed: T1, p_itens: [{ item_id: S, quantidade: 1, observed_updated_at: T1 }] });
    expect(t.success).toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(t.writes).toEqual([]);
    h.qc.clear();
  });
  it.each([
    ["OS revision", () => { t.current.os = { ...t.current.os, updated_at: T2 }; }],
    ["lot revision", () => { t.current.estoque = [{ id: S, updated_at: T2, status: "disponivel" }]; }],
    ["lot status", () => { t.current.estoque = [{ id: S, updated_at: T1, status: "reservado" }]; }],
    ["OS became B2B", () => { t.current.os = { ...t.current.os, partner_order_id: ORG_B }; }],
  ])("%s changed since selection: rejected for review, no rebase, no writer", async (_n, mutate) => {
    mutate();
    const h = mount();
    await act(async () => { await expect(t.submit(payload())).rejects.toThrow(/mudou desde a seleção/); });
    expect(writerCalls()).toHaveLength(0);
    h.qc.clear();
  });
  it("missing observed snapshot is refused before any call", async () => {
    const h = mount();
    await act(async () => { await expect(t.submit(payload({ observed: undefined }))).rejects.toThrow(/Revisão observada/); });
    expect(t.rpc).not.toHaveBeenCalled();
    h.qc.clear();
  });
  it.each([["onfarm", "padrao"], ["padrao", "b2b"]])("osTipo %s / origem %s is denied without writer", async (osTipo, origem) => {
    const h = mount();
    const p = payload({ osTipo });
    p.observed.os.origem = origem; t.current.os.origem = origem;
    await act(async () => { await expect(t.submit(p)).rejects.toThrow(); });
    expect(writerCalls()).toHaveLength(0);
    h.qc.clear();
  });
  it("recipient/address filled from cadastro is refused explicitly, never dropped", async () => {
    const h = mount();
    await act(async () => { await expect(t.submit(payload({ destinatario_nome: "Fazenda X", endereco_cidade: "Paracatu" }))).rejects.toThrow(/destinatario_nome, endereco_cidade/); });
    expect(writerCalls()).toHaveLength(0);
    h.qc.clear();
  });
  it("ACK of another tenant is uncertain, persisted, and blocks new submissions after remount", async () => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: { ...groupAck, organization_id: ORG_B }, error: null });
    const h = mount();
    await act(async () => { await expect(t.submit(payload())).rejects.toThrow(/pode ter sido gravada/); });
    expect(t.success).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem(pendingKey) as string);
    expect(stored).toMatchObject({ fn: GROUP_RPC, expectedOrg: ORG, args: { p_request_key: payload().grupoId, p_os_observed: T1 } });
    h.unmount(); h.qc.clear();
    // Remount (reload): new key is blocked; only the exact replay is offered.
    const next = mount();
    await screen.findByRole("button", { name: "Repetir envio pendente" });
    t.rpc.mockClear();
    await act(async () => { await expect(t.submit(payload({ grupoId: "30000000-0000-4000-8000-000000000555" }))).rejects.toThrow(/resultado incerto/); });
    expect(t.rpc).not.toHaveBeenCalled();
    // Exact replay: identical frozen args, no new CAS read.
    t.current.os = { ...t.current.os, updated_at: T2 };
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: { ...groupAck, replay: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Repetir envio pendente" }));
    await waitFor(() => expect(t.success).toHaveBeenCalledWith("Envio pendente confirmado pelo servidor."));
    expect(writerCalls()).toHaveLength(1);
    expect(writerCalls()[0][1]).toEqual(stored.args);
    expect(localStorage.getItem(pendingKey)).toBeNull();
    next.qc.clear();
  });
  it.each(["57014", "PGRST001", "504"])("ambiguous code %s keeps pending and never claims nothing was saved", async (code) => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code, message: "timeout" } });
    const h = mount();
    let msg = "";
    await act(async () => { await t.submit(payload()).catch((e: Error) => { msg = e.message; }); });
    expect(msg).toMatch(/pode ter sido gravada/);
    expect(msg).not.toMatch(/nenhuma etapa|nada foi/i);
    expect(localStorage.getItem(pendingKey)).not.toBeNull();
    h.qc.clear();
  });
  it("definitive PT409 clears the reservation", async () => {
    t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : { data: null, error: { code: "PT409", message: "DELIVERY_OBSERVED_CONFLICT" } });
    const h = mount();
    await act(async () => { await expect(t.submit(payload())).rejects.toThrow(/PT409/); });
    expect(localStorage.getItem(pendingKey)).toBeNull();
    h.qc.clear();
  });
  it("late ACK after tenant switch is not adopted (no success, pending stays for original session)", async () => {
    let release!: (v: any) => void;
    t.rpc.mockImplementation((fn: string) => fn === CAPABILITY_RPC ? Promise.resolve({ data: cap, error: null }) : new Promise(r => { release = r; }));
    const h = mount();
    let settled: Promise<unknown> = Promise.resolve();
    await act(async () => { settled = t.submit(payload()).catch((e: Error) => e); await new Promise(r => setTimeout(r, 0)); });
    await waitFor(() => expect(writerCalls()).toHaveLength(1));
    t.auth = { ...t.auth, profile: { ...t.auth.profile, organization_id: ORG_B } };
    h.rerender(<Entregas />);
    await act(async () => { release({ data: groupAck, error: null }); await settled; });
    expect(t.success).not.toHaveBeenCalled();
    expect(localStorage.getItem(pendingKey)).not.toBeNull();
    h.qc.clear();
  });
  it("double submit dispatches a single writer", async () => {
    const h = mount();
    await act(async () => { await Promise.all([t.submit(payload()).catch(() => {}), t.submit(payload()).catch(() => {})]); });
    expect(writerCalls()).toHaveLength(1);
    h.qc.clear();
  });
  it("cancel uses the revision seen when the dialog opened and refuses if it changed", async () => {
    t.rows = [{ id: E1, status: "separado", updated_at: T1, clientes: { nome: "Cliente" } }];
    t.current.entrega = { id: E1, status: "separado", updated_at: T2 };
    const h = mount();
    fireEvent.click((await screen.findAllByRole("button", { name: "Cancelar" }))[0]);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Cliente recusou" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await waitFor(() => expect(t.error).toHaveBeenCalledWith(expect.stringMatching(/mudou desde a abertura/)));
    expect(writerCalls()).toHaveLength(0);
    t.current.entrega = { id: E1, status: "separado", updated_at: T1 };
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await waitFor(() => expect(writerCalls()).toHaveLength(1));
    expect(writerCalls()[0][1]).toEqual({ p_entrega_id: E1, p_motivo: "Cliente recusou", p_observed: T1 });
    h.qc.clear();
  });
});
