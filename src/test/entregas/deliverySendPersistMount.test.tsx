import React, { type PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const t = vi.hoisted(() => ({ auth: {} as any, confirm: {} as any, financial: false, rpc: vi.fn(), from: vi.fn(), submit: undefined as any, success: vi.fn(), error: vi.fn(), current: { os: null as any, estoque: [] as any[], entrega: null as any }, rows: [] as any[], writes: [] as any[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => t.auth }));
vi.mock("@/hooks/useCockpitQuery", () => ({ useCockpitQuery: () => ({ data: [] }) }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ config: {}, defaults: {} }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { success: t.success, error: t.error, info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: t.rpc, from: t.from, channel: () => { const c: any = { on: () => c, subscribe: () => c }; return c; }, removeChannel: vi.fn() } }));
vi.mock("@/components/entregas/RegistrarEntregaDialog", () => ({ RegistrarEntregaDialog: (p: any) => { t.submit = p.onSubmit; return null; } }));
vi.mock("@/components/entregas/ConfirmarEntregaDialog", () => ({ ConfirmarEntregaDialog: (p: any) => { t.confirm = p; return null; } }));
vi.mock("@/components/financeiro/ConfirmarEntregaFinanceiroDialog", () => ({ ConfirmarEntregaFinanceiroDialog: (p: any) => { t.financial = p.open; return null; } }));
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
const PFX = `cf:delivery-uncertain:v2:${ACTOR}:${ORG}:`;
const pendingKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string).filter(k => k.startsWith(PFX)).sort();
const pendingRaw = () => { const k = pendingKeys()[0]; return k ? localStorage.getItem(k) : null; };

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); t.writes = []; t.rows = [];
  t.auth = { user: { id: ACTOR }, profile: { user_id: ACTOR, organization_id: ORG, ativo: true }, role: "gestor", roles: ["gestor"], loading: false, authzReady: true, authzEpoch: 0 };
  t.current = { os: { id: OS, updated_at: T1, origem: "agronomica", partner_order_id: null }, estoque: [{ id: S, updated_at: T1, status: "disponivel" }], entrega: null };
  t.from.mockImplementation(chain);
  t.rpc.mockImplementation(async (fn: string) => fn === CAPABILITY_RPC ? { data: cap, error: null } : fn === GROUP_RPC ? { data: groupAck, error: null } : { data: cancelAck, error: null });
});
const heldLocks = new Set<string>();
const fakeLocks = { request: async (name: string, _o: any, cb: (l: unknown) => Promise<unknown>) => { if (heldLocks.has(name)) return cb(null); heldLocks.add(name); try { return await cb({ name }); } finally { heldLocks.delete(name); } } };
beforeEach(() => { heldLocks.clear(); Object.defineProperty(navigator, "locks", { value: fakeLocks, configurable: true }); });
afterEach(() => { cleanup(); });


const E2 = "10000000-0000-4000-8000-000000000102";
const SEND = "rpc_entrega_enviar_manual_v1", SCAP = "rpc_entrega_envio_capability_v1";
const KEY = "40000000-0000-4000-8000-000000000001";
const SPFX = `cf:delivery-send:v1:${ACTOR}:${ORG}:`;
const sendKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) as string).filter(k => k.startsWith("cf:delivery-send:")).sort();
const rec = (o: any = {}) => JSON.stringify({ v: 1, schema: "delivery_send_attempt", actor: ACTOR, org: ORG, entrega: E1, os: OS, observed: T1, key: KEY, ...o });
const row = (name: string) => { const el = screen.getByText(name).closest("tr"); if (!el) throw new Error("row"); return within(el); };
const sends = () => t.rpc.mock.calls.filter((c: any[]) => c[0] === SEND);
let writer: (args: any) => Promise<any>;
function serve() {
  t.rows = [E1, E2].map((id, i) => ({ id, status: "separado", ordem_servico_id: OS, updated_at: T1, clientes: { nome: i ? "Outro" : "Cliente A" } }));
  t.rpc.mockImplementation(async (fn: string, args: any) => {
    if (fn === SCAP) { const r = t.rows.find(x => x.id === args.p_entrega); return { data: { capability: "delivery_send_manual_v1", available: true, actor_id: ACTOR, organization_id: ORG, entrega_id: args.p_entrega, os_id: OS, status: r?.status, updated_at: r?.updated_at }, error: null }; }
    if (fn === SEND) return writer(args);
    return { data: cap, error: null };
  });
}
const commit = (id: string) => { t.rows = t.rows.map(r => r.id === id ? { ...r, status: "em_rota", updated_at: T2 } : r); };
const okAck = (id: string, replay = true) => ({ data: { success: true, action: "send", replay, actor_id: ACTOR, organization_id: ORG, entrega_id: id, os_id: OS, status: "em_rota", updated_at: T2 }, error: null });
const lost = () => ({ data: null, error: { code: "57014", message: "timeout" } });

describe("Enviar durable retention (mounted, real QueryClient)", () => {
  beforeEach(() => serve());

  it("reload after lost ACK: same key/payload, no automatic replay, exact record removed", async () => {
    writer = async (a) => { commit(a.p_entrega); return sends().length === 1 ? lost() : okAck(a.p_entrega); };
    const h = mount(); await screen.findByText("Cliente A");
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalled());
    const first = sends()[0][1]; expect(sendKeys()).toEqual([`${SPFX}${E1}`]);
    const stored = JSON.parse(localStorage.getItem(`${SPFX}${E1}`) as string);
    expect(Object.keys(stored).sort()).toEqual(["actor", "entrega", "key", "observed", "org", "os", "schema", "v"]); expect(stored.key).toBe(first.p_request_key);
    h.unmount(); h.qc.clear();
    const h2 = mount(); await screen.findByRole("button", { name: "Reconciliar envio" });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); }); expect(sends()).toHaveLength(1);
    const uuid = vi.spyOn(crypto, "randomUUID");
    fireEvent.click(screen.getByRole("button", { name: "Reconciliar envio" })); await waitFor(() => expect(t.success).toHaveBeenCalledWith("Status atualizado"));
    expect(sends()).toHaveLength(2); expect(sends()[1][1]).toEqual(first); expect(uuid).not.toHaveBeenCalled(); expect(sendKeys()).toEqual([]);
    uuid.mockRestore(); expect(t.writes).toEqual([]); h2.qc.clear();
  });

  it("preflight refusal before dispatch persists nothing and calls no writer", async () => {
    writer = async () => { throw new Error("must not dispatch"); };
    t.rpc.mockImplementation(async (fn: string) => fn === SCAP ? { data: null, error: { code: "42501", message: "denied" } } : { data: cap, error: null });
    const h = mount(); await screen.findByText("Cliente A");
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalled());
    expect(sends()).toHaveLength(0); expect(sendKeys()).toEqual([]); h.qc.clear();
  });

  it("retained attempt survives refused reconciliation preflight and role change", async () => {
    localStorage.setItem(`${SPFX}${E1}`, rec()); commit(E1);
    writer = async () => { throw new Error("must not dispatch"); };
    const h = mount(); await screen.findByRole("button", { name: "Reconciliar envio" });
    t.rpc.mockImplementation(async (fn: string) => fn === SCAP ? { data: null, error: { code: "42501", message: "denied" } } : { data: cap, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Reconciliar envio" })); await waitFor(() => expect(t.error).toHaveBeenCalled());
    expect(localStorage.getItem(`${SPFX}${E1}`)).toBe(rec());
    t.auth = { ...t.auth, role: "administrativo", roles: ["administrativo"], authzEpoch: 2 }; h.rerender(<Entregas />);
    await screen.findByRole("button", { name: "Reconciliar envio" }); expect(localStorage.getItem(`${SPFX}${E1}`)).toBe(rec()); expect(sends()).toHaveLength(0); h.qc.clear();
  });

  it("setItem failure before dispatch: no writer, no record", async () => {
    writer = async () => { throw new Error("must not dispatch"); };
    const orig = Storage.prototype.setItem;
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) { if (k.startsWith("cf:delivery-send:")) throw new Error("quota"); return orig.call(this, k, v); });
    const h = mount(); await screen.findByText("Cliente A");
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalled());
    set.mockRestore(); expect(sends()).toHaveLength(0); expect(sendKeys()).toEqual([]); h.qc.clear();
  });

  it("getItem failure fails closed on mount and on click", async () => {
    writer = async () => { throw new Error("must not dispatch"); };
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    localStorage.setItem(`${SPFX}${E1}`, rec());
    const h = mount(); await screen.findByText(/Armazenamento local indisponível/);
    fireEvent.click(row("Outro").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalled());
    get.mockRestore(); expect(sends()).toHaveLength(0); expect(localStorage.getItem(`${SPFX}${E1}`)).toBe(rec()); h.qc.clear();
  });

  it("removeItem failure after valid ACK keeps record and warns, without new key", async () => {
    writer = async (a) => { commit(a.p_entrega); return okAck(a.p_entrega, false); };
    const rm = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    const h = mount(); await screen.findByText("Cliente A");
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.success).toHaveBeenCalled());
    rm.mockRestore(); expect(sendKeys()).toEqual([`${SPFX}${E1}`]); expect(JSON.parse(localStorage.getItem(`${SPFX}${E1}`) as string).key).toBe(sends()[0][1].p_request_key);
    await screen.findByText(/registro local não pôde ser removido/); h.qc.clear();
  });

  it.each([["malformed", "{not json"], ["version", rec({ v: 2 })], ["schema", rec({ schema: "x" })], ["extra", rec({ jwt: "x" })], ["tampered-key", rec({ key: "not-a-uuid" })], ["slot-mismatch", rec({ entrega: E2 })], ["nil", rec({ os: "00000000-0000-0000-0000-000000000000" })], ["bad-ts", rec({ observed: "2026-10-30" })]])("corrupt record %s blocks sends and is never deleted", async (_n, raw) => {
    writer = async () => { throw new Error("must not dispatch"); };
    localStorage.setItem(`${SPFX}${E1}`, raw);
    const h = mount(); await screen.findByText(/Registro local de envio inválido/);
    fireEvent.click(row("Outro").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalled());
    expect(sends()).toHaveLength(0); expect(localStorage.getItem(`${SPFX}${E1}`)).toBe(raw); h.qc.clear();
  });

  it("records of another actor/tenant are ignored and preserved", async () => {
    const foreignOrg = `cf:delivery-send:v1:${ACTOR}:${ORG_B}:${E1}`, foreignActor = `cf:delivery-send:v1:${ORG_B}:${ORG}:${E1}`;
    localStorage.setItem(foreignOrg, rec({ org: ORG_B })); localStorage.setItem(foreignActor, rec({ actor: ORG_B }));
    writer = async (a) => { commit(a.p_entrega); return okAck(a.p_entrega, false); };
    const h = mount(); await screen.findByText("Cliente A");
    expect(screen.queryByRole("button", { name: "Reconciliar envio" })).toBeNull();
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.success).toHaveBeenCalled());
    expect(sends()[0][1].p_request_key).not.toBe(KEY); expect(localStorage.getItem(foreignOrg)).toBe(rec({ org: ORG_B })); expect(localStorage.getItem(foreignActor)).toBe(rec({ actor: ORG_B })); h.qc.clear();
  });

  it("two tabs interleaved: other tab's retained attempt blocks a new key and is never overwritten/removed", async () => {
    writer = async (a) => { commit(a.p_entrega); return okAck(a.p_entrega, false); };
    const h = mount(); await screen.findByText("Cliente A");
    const yRaw = rec({ entrega: E2 });
    localStorage.setItem(`${SPFX}${E2}`, yRaw); // tab Y persisted after this tab rendered (no storage event in same document)
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(t.error).toHaveBeenCalledWith("Reconcilie somente o mesmo envio pendente."));
    expect(sends()).toHaveLength(0); expect(localStorage.getItem(`${SPFX}${E2}`)).toBe(yRaw); expect(sendKeys()).toEqual([`${SPFX}${E2}`]); h.qc.clear();
  });

  it("lock held by another tab refuses before any call; missing Web Locks refuses too", async () => {
    writer = async () => { throw new Error("must not dispatch"); };
    heldLocks.add(`cf:delivery-send-lock:${ACTOR}:${ORG}`);
    const h = mount(); await screen.findByText("Cliente A");
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalledWith(expect.stringContaining("outra aba")));
    heldLocks.clear(); Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalledWith(expect.stringContaining("Bloqueio entre abas indisponível")));
    expect(t.rpc.mock.calls.filter((c: any[]) => c[0] === SCAP || c[0] === SEND)).toHaveLength(0); expect(sendKeys()).toEqual([]); h.qc.clear();
  });

  it("late ACK after reload (unmount) is not adopted; lock owned until settle; then same key reconciles", async () => {
    let release: (v: any) => void = () => {};
    writer = (a) => sends().length === 1 ? new Promise(r => { release = r; }) : Promise.resolve(okAck(a.p_entrega));
    const h = mount(); await screen.findByText("Cliente A");
    fireEvent.click(row("Cliente A").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(sends()).toHaveLength(1));
    const first = sends()[0][1]; h.unmount(); h.qc.clear(); commit(E1);
    const h2 = mount(); await screen.findByRole("button", { name: "Reconciliar envio" });
    fireEvent.click(screen.getByRole("button", { name: "Reconciliar envio" })); await waitFor(() => expect(t.error).toHaveBeenCalledWith(expect.stringContaining("outra aba")));
    expect(sends()).toHaveLength(1);
    await act(async () => { release(okAck(E1, false)); await new Promise(r => setTimeout(r, 10)); });
    expect(t.success).not.toHaveBeenCalled(); expect(JSON.parse(localStorage.getItem(`${SPFX}${E1}`) as string).key).toBe(first.p_request_key);
    fireEvent.click(screen.getByRole("button", { name: "Reconciliar envio" })); await waitFor(() => expect(t.success).toHaveBeenCalledWith("Status atualizado"));
    expect(sends()[1][1]).toEqual(first); expect(sendKeys()).toEqual([]); h2.qc.clear();
  });

  it("terminal row keeps retained record in consultation/refusal only", async () => {
    localStorage.setItem(`${SPFX}${E1}`, rec()); t.rows = t.rows.map(r => r.id === E1 ? { ...r, status: "entregue" } : r);
    writer = async () => { throw new Error("must not dispatch"); };
    const h = mount(); await screen.findByText(/entrega encerrada; reconciliação por escrita indisponível/);
    expect(screen.queryByRole("button", { name: "Reconciliar envio" })).toBeNull();
    fireEvent.click(row("Outro").getByRole("button", { name: "Enviar" })); await waitFor(() => expect(t.error).toHaveBeenCalledWith("Reconcilie somente o mesmo envio pendente."));
    expect(sends()).toHaveLength(0); expect(localStorage.getItem(`${SPFX}${E1}`)).toBe(rec()); h.qc.clear();
  });
});
