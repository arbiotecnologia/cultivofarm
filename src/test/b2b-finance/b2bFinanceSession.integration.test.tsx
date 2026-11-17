// AuthProvider/monitor/guarda/portal REAIS com transporte RPC falso (não é prova JWT/RLS hospedada).
// Gate do perfil forçado ON só neste teste para exercitar o monitor antes da ativação.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const U = "00000000-0000-4000-8000-000000000001", O = "00000000-0000-4000-8000-000000000002";
const PA = "20000000-0000-4000-8000-00000000000a", PB = "20000000-0000-4000-8000-00000000000b";
const s = vi.hoisted(() => ({ roles: ["parceiro_b2b_financeiro"], partner: "20000000-0000-4000-8000-00000000000a" as string | null, entitled: true, capErr: false, calls: [] as string[], oblErr: false }));
vi.mock("@/lib/comercial/b2bFinanceRole", async (orig) => ({ ...(await orig<typeof import("@/lib/comercial/b2bFinanceRole")>()), B2B_FINANCE_ROLE_INSTALLED: true }));
vi.mock("@/lib/authz/authzEpochGate", () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: "b2b-context", PRODUCER_CONTEXT_MONITOR_ENABLED: false,
  FINANCIAL_CONTEXT_MONITOR_ENABLED: false, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: false, CONSULTANT_CONTEXT_MONITOR_ENABLED: false, OPERATOR_CONTEXT_MONITOR_ENABLED: false, MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: false }));
vi.mock("@/lib/portalBroadcast", () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock("@/lib/accessAuditLog", () => ({ logAccessDeniedOnce: () => {}, routeGroupFromPath: () => "finance" }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
const csv = vi.fn();
vi.mock("@/lib/biExport", () => ({ exportToCSV: (...a: unknown[]) => csv(...a), buildExportFilename: (p: string) => p }));
function chain(result: () => unknown) { const q: Record<string, unknown> = {}; for (const n of ["select", "eq", "is", "filter", "in", "not", "neq", "order", "abortSignal", "limit"]) q[n] = () => q; q.maybeSingle = async () => result(); q.then = (f: (v: unknown) => void) => Promise.resolve(result()).then(f); return q; }
const cap = () => s.partner && s.entitled ? { contract: "B2B_FINANCE_ROLE_V1", allowed: true, partner_id: s.partner, partner_name: s.partner === PA ? "Parceiro A" : "Parceiro B", obligations_read: true, export: true, credit_read: true, writes: false }
  : { contract: "B2B_FINANCE_ROLE_V1", allowed: false, reason: s.partner ? "not_entitled" : "not_finance_actor" };
const inst = (n: number, v: number) => ({ id: `30000000-0000-4000-8000-00000000000${n}`, numero: 1, vencimento: "2026-12-10", valor: v, recebido: 0, status: "OPEN" });
const rows = (p: string) => [{ id: p === PA ? "40000000-0000-4000-8000-00000000000a" : "40000000-0000-4000-8000-00000000000b", order_id: "50000000-0000-4000-8000-000000000001", numero: p === PA ? "PED-A" : "PED-B", created_at: "2026-11-01T10:00:00+00:00", total: p === PA ? 100 : 200, status: "OPEN", installments: [inst(p === PA ? 1 : 2, p === PA ? 100 : 200)] }];
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: U } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: (t: string) => chain(() => t === "profiles" ? { data: { id: "p", user_id: U, organization_id: O, ativo: true, senha_provisoria: false, nome: "Fin" } } : t === "user_roles" ? { data: s.roles.map((role) => ({ role })) } : { data: [], error: null }),
  rpc: (name: string, args?: Record<string, unknown>) => { s.calls.push(name); const r = (async () => {
    if (name === "b2b_finance_capability_v1") return s.capErr ? { data: null, error: { message: "x" } } : { data: cap(), error: null };
    if (name === "rpc_portal_partner_financial") return s.oblErr ? { data: null, error: { message: "x" } } : { data: { contract: "C2_OWN_OBLIGATIONS_V1", partner_id: args?.p_partner_id, rows: rows(args?.p_partner_id as string), limit: 50, documents_enabled: false }, error: null };
    if (name === "b2b_finance_credit_v1") return { data: { contract: "B2B_FINANCE_CREDIT_V1", partner_id: s.partner, credit_limit: 1000, exposicao_atual: s.partner === PA ? 100 : 200, credito_disponivel: s.partner === PA ? 900 : 800, percentual_utilizado: 10, saldo_em_aberto: 0, saldo_vencido: 0, comprometido_nao_faturado: 0, comprometido_pendente: 0, tem_vencidos: false, reason_code: "OK" }, error: null };
    if (name === "h15_actor_organization") return { data: O, error: null };
    throw new Error("unexpected " + name); })(); return Object.assign(r, { abortSignal: () => r }); },
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel: () => {},
} }));
import { AuthProvider } from "@/hooks/useAuth";
import PortalFinanceiroB2B from "@/pages/portal-financeiro-b2b/PortalFinanceiroB2B";
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); for (let i = 0; i < 10; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1); }); }
function setup() { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AuthProvider><MemoryRouter initialEntries={["/portal-financeiro-b2b?tab=titulos"]}><Routes>
    <Route path="/portal-financeiro-b2b" element={<PortalFinanceiroB2B />} /><Route path="/sem-permissao" element={<p>Sem permissão</p>} /></Routes></MemoryRouter></AuthProvider></QueryClientProvider>); return qc; }
const hasData = (qc: QueryClient, k: string) => qc.getQueryCache().getAll().some((q) => JSON.stringify(q.queryKey).includes(k) && q.state.data !== undefined);
beforeEach(() => { vi.useFakeTimers(); s.roles = ["parceiro_b2b_financeiro"]; s.partner = PA; s.entitled = true; s.capErr = false; s.oblErr = false; s.calls = []; csv.mockReset(); localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("Financeiro B2B — sessão real do AuthProvider", () => {
  it("login/home sem ciclo de loading; monitor usa a capacidade canônica", async () => {
    setup(); await tick(); await tick(100);
    expect(screen.getByText("Financeiro do parceiro")).toBeTruthy();
    expect(screen.getByText("PED-A", { exact: false })).toBeTruthy();
    const n = s.calls.filter((c) => c === "b2b_finance_capability_v1").length; expect(n).toBeGreaterThanOrEqual(2);
    await tick(10_000); expect(screen.getByText("Financeiro do parceiro")).toBeTruthy();
  });
  it("troca de parceiro A→B no servidor: tela de A some e nada de A é reutilizado", async () => {
    setup(); await tick(); await tick(100); expect(screen.getByText(/PED-A/)).toBeTruthy();
    s.partner = PB; await tick(31_000); await tick(100);
    expect(screen.queryByText(/PED-A/)).toBeNull();
    const retry = screen.queryByRole("button", { name: "Tentar novamente" }); if (retry) fireEvent.click(retry);
    await tick(100); await tick(100);
    expect(screen.queryByText(/PED-A/)).toBeNull();
    expect(screen.getByText(/PED-B/)).toBeTruthy();
  });
  it.each([["papel removido", () => { s.partner = null; }], ["perda de entitlement", () => { s.entitled = false; }], ["erro de sonda", () => { s.capErr = true; }]])("%s retira tela, dados e exportação", async (_n, mutate) => {
    const qc = setup(); await tick(); await tick(100); expect(screen.getByText(/PED-A/)).toBeTruthy();
    mutate(); await tick(31_000); await tick(100);
    expect(screen.queryByText(/PED-A/)).toBeNull(); expect(screen.queryByRole("button", { name: /Exportar CSV/ })).toBeNull();
    expect(screen.queryByLabelText("Crédito do parceiro")).toBeNull();
    expect(hasData(qc, "b2b-finance-obligations") && screen.queryByText(/PED-A/) !== null).toBe(false);
  });
  it("erro de leitura de obrigações não mostra zeros e permite nova tentativa", async () => {
    s.oblErr = true; setup(); await tick(); await tick(100);
    expect(screen.getByText("Não foi possível carregar as informações financeiras.")).toBeTruthy(); expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();
  });
});
