// Real provider/route guard/scoped consumers; RPC and Storage transport fake,
// NOT JWT/RLS/live concurrency certification. Production gate stays false.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const U = "00000000-0000-4000-8000-000000000001";
const O = "00000000-0000-4000-8000-000000000002";
const P = "00000000-0000-4000-8000-000000000003";
const state = vi.hoisted(() => ({ roles: ["parceiro_b2b"], gate: true, context: null as unknown,
  contextCalls: 0, override: undefined as undefined | (() => Promise<unknown>),
  catalog: vi.fn(), prices: vi.fn(), simulations: vi.fn(), download: vi.fn() }));
const chain = (result: unknown) => {
  const c: Record<string, unknown> = {};
  for (const name of ["select", "eq", "order", "abortSignal"]) c[name] = () => c;
  c.maybeSingle = async () => result;
  c.then = (resolve: (r: unknown) => void) => Promise.resolve(result).then(resolve);
  return c;
};
vi.mock("@/lib/authz/authzEpochGate", () => ({ get AUTHZ_CACHE_FOUNDATION_ENABLED() { return state.gate; }, AUTHZ_CACHE_ROLLOUT_SCOPE: "b2b-context", PRODUCER_CONTEXT_MONITOR_ENABLED: false, FINANCIAL_CONTEXT_MONITOR_ENABLED: false }));
vi.mock("@/lib/portalBroadcast", () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock("@/lib/accessAuditLog", () => ({ logAccessDeniedOnce: () => {}, routeGroupFromPath: () => "b2b" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: U } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: (table: string) => {
    if (table === "profiles") return chain({ data: { id: "profile", user_id: U, organization_id: O, ativo: true, senha_provisoria: false } });
    if (table === "user_roles") return chain({ data: state.roles.map(role => ({ role })) });
    if (table === "partner_product_prices") return chain(state.prices());
    return chain({ data: [] });
  },
  rpc: (name: string) => {
    const request = (async () => {
    if (name === "get_my_commercial_partner_context") {
      state.contextCalls++;
      const override = state.override; state.override = undefined;
      return { data: override ? await override() : state.context, error: null };
    }
    if (name === "get_my_commercial_partner_projection") {
      const ctx = state.context as Record<string, unknown> | null;
      return { data: ctx ? { id: ctx.partner_id, codigo: "B2B", razao_social: "Parceiro", ativo: true, papel: ctx.papel, mode: ctx.mode } : null };
    }
    if (name === "get_my_available_portal_contexts") return { data: { available_contexts: ["b2b"], has_b2b_access: true } };
    if (name === "get_partner_catalog_secure") return state.catalog();
    if (name === "b2b_read_simulations") return state.simulations();
    throw new Error(`unexpected RPC: ${name}`);
    })();
    return Object.assign(request, { abortSignal: () => request });
  },
} }));
// Test the actual Blob ownership hook, fake download transport (no buckets opened).
vi.mock("@/lib/authz/authenticatedAttachment", () => ({ ATTACHMENT_LIMITS: { files: 24, totalBytes: 60 * 1024 * 1024 }, downloadAuthenticatedAttachment: (...args: unknown[]) => state.download(...args) }));
import { AuthProvider } from "@/hooks/useAuth";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";
import { usePartnerCatalog } from "@/hooks/usePartnerCatalog";
import { usePartnerPrices } from "@/hooks/usePartnerPrices";
import { usePartnerSimulations } from "@/hooks/usePartnerSimulations";
import { useAuthenticatedBlobUrls } from "@/hooks/useAuthenticatedBlobUrls";
import { b2bContextProbe } from "@/lib/authz/b2bContextProbe";

const ctx = (partner = P) => ({ partner_id: partner, organization_id: O, commercial_owner_organization_id: O,
  role: state.roles[0], papel: state.roles[0] === "parceiro_b2b_tecnico" ? "tecnico" : "gestor", mode: "commercial_owner" });
const tick = async (ms = 0) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // React Query observer notifications are macrotasks scheduled after renders.
  for (let i = 0; i < 8; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1); });
};
function Data() {
  const catalog = usePartnerCatalog(P);
  const prices = usePartnerPrices(P);
  const simulations = usePartnerSimulations(P);
  const blobs = useAuthenticatedBlobUrls(["private/photo.jpg"]);
  return <div>portal aberto<span>{catalog.data?.map(i => i.nome).join()}</span><span>{simulations.data?.map(i => i.titulo).join()}</span><span>{prices.data?.length}</span><img alt="anexo" src={blobs.urls["private/photo.jpg"]} /></div>;
}
function Location() { return <output data-testid="url">{useLocation().pathname}</output>; }
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Location /><Routes>
    <Route path="/portal-parceiro/*" element={<B2BRouteGuard><Data /></B2BRouteGuard>} />
    <Route path="/sem-permissao" element={<div>acesso negado</div>} />
  </Routes></MemoryRouter></AuthProvider></QueryClientProvider>);
  return client;
}
function paused(client: QueryClient) {
  expect(screen.queryByText("portal aberto")).toBeNull();
  expect(screen.getByText("Sessão de acesso pausada")).toBeTruthy();
  expect(screen.getByTestId("url").textContent).toBe("/portal-parceiro/catalogo");
  expect(client.getQueryCache().getAll().some(q => q.state.data !== undefined)).toBe(false);
}
beforeEach(() => {
  vi.useFakeTimers(); state.roles = ["parceiro_b2b"]; state.gate = true; state.context = ctx(); state.contextCalls = 0; state.override = undefined;
  state.catalog.mockReset().mockResolvedValue({ data: [{ produto_nome: "catálogo atual" }] });
  state.prices.mockReset().mockReturnValue({ data: [] });
  state.simulations.mockReset().mockResolvedValue({ data: [{ titulo: "simulação atual" }] });
  state.download.mockReset().mockResolvedValue(new Blob(["private"]));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:owned") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("B2B sessão aberta — monitor existente e tela/cache reais", () => {
  it.each(["parceiro_b2b", "parceiro_b2b_tecnico"])("revoga/restaura %s sem reload e revoga Blob local", async role => {
    state.roles = [role]; state.context = ctx();
    let initialResolve: ((v: unknown) => void) | undefined;
    state.override = () => new Promise(resolve => { initialResolve = resolve; });
    const client = setup(); await tick();
    expect(state.contextCalls).toBe(1); // only monitor; real scoped readers disabled
    expect(screen.getByText("Verificando seu acesso")).toBeTruthy();
    expect(screen.queryByText("portal aberto")).toBeNull();
    expect(screen.queryByText("acesso negado")).toBeNull();
    expect(screen.getByTestId("url").textContent).toBe("/portal-parceiro/catalogo");
    expect(state.catalog).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll().some(q => q.state.data !== undefined)).toBe(false);
    initialResolve?.(ctx()); await tick();
    expect(screen.getByText("catálogo atual")).toBeTruthy();
    expect(screen.getByText("simulação atual")).toBeTruthy();
    expect(screen.getByAltText("anexo").getAttribute("src")).toBe("blob:owned");
    state.context = null; await tick(10_000); paused(client);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned");
    state.context = ctx(); state.catalog.mockResolvedValue({ data: [{ produto_nome: "catálogo novo" }] });
    let restoreResolve: ((v: unknown) => void) | undefined;
    state.override = () => new Promise(resolve => { restoreResolve = resolve; });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" })); await tick();
    expect(screen.getByText("Verificando seu acesso")).toBeTruthy();
    expect(screen.queryByText("portal aberto")).toBeNull();
    expect(screen.queryByText("acesso negado")).toBeNull();
    expect(screen.getByTestId("url").textContent).toBe("/portal-parceiro/catalogo");
    restoreResolve?.(ctx()); await tick();
    expect(screen.getByText("catálogo novo")).toBeTruthy(); expect(screen.queryByText("catálogo atual")).toBeNull();
    expect(screen.getByTestId("url").textContent).toBe("/portal-parceiro/catalogo");
  });
  it("timeout do poll respeita deadline anterior e resposta tardia não reabre", async () => {
    const client = setup(); await tick(); let resolve: ((v: unknown) => void) | undefined;
    state.override = () => new Promise(r => { resolve = r; }); await tick(10_000);
    expect(screen.getByText("portal aberto")).toBeTruthy(); await tick(5_001); paused(client);
    resolve?.(ctx()); await tick(); paused(client);
  });
  it("offline limpa cache, online revalida, respostas antigas catálogo/simulação/Blob não retornam", async () => {
    let oldCatalog: ((v: unknown) => void) | undefined; let oldSimulation: ((v: unknown) => void) | undefined; let oldBlob: ((v: Blob) => void) | undefined;
    state.catalog.mockImplementationOnce(() => new Promise(r => { oldCatalog = r; }));
    state.simulations.mockImplementationOnce(() => new Promise(r => { oldSimulation = r; }));
    state.download.mockImplementationOnce(() => new Promise(r => { oldBlob = r; }));
    const client = setup(); await tick();
    Object.defineProperty(navigator, "onLine", { value: false }); act(() => window.dispatchEvent(new Event("offline"))); await tick(); paused(client);
    Object.defineProperty(navigator, "onLine", { value: true }); act(() => window.dispatchEvent(new Event("online"))); await tick();
    oldCatalog?.({ data: [{ produto_nome: "catálogo antigo" }] }); oldSimulation?.({ data: [{ titulo: "simulação antiga" }] }); oldBlob?.(new Blob(["old"])); await tick();
    expect(screen.queryByText("catálogo antigo")).toBeNull(); expect(screen.queryByText("simulação antiga")).toBeNull();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data))).not.toContain("antig");
  });
  it("erro de rede pausa; retry mantém URL", async () => {
    const client = setup(); await tick(); state.override = async () => { throw new Error("offline transport"); };
    await tick(10_000); paused(client); fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" })); await tick();
    expect(screen.getByText("portal aberto")).toBeTruthy();
  });
  it("mesma tupla confirmada novamente retira cache e refaz leitura (não prova ABA server)", async () => {
    setup(); await tick(); state.catalog.mockResolvedValue({ data: [{ produto_nome: "catálogo novo" }] }); await tick(10_000);
    expect(screen.getByText("catálogo novo")).toBeTruthy(); expect(screen.queryByText("catálogo atual")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned");
  });
  it("A→B→A observado refaz leituras; resposta A anterior não contamina A restaurado", async () => {
    let resolve: ((v: unknown) => void) | undefined;
    state.catalog.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const client = setup(); await tick();
    state.context = ctx("00000000-0000-4000-8000-000000000004"); await tick(10_000);
    state.context = ctx(); state.catalog.mockResolvedValue({ data: [{ produto_nome: "A restaurado" }] }); await tick(10_000);
    resolve?.({ data: [{ produto_nome: "A obsoleto" }] }); await tick();
    expect(screen.getByText("A restaurado")).toBeTruthy(); expect(screen.queryByText("A obsoleto")).toBeNull();
    expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data))).not.toContain("obsoleto");
  });
  it.each(["15000", true, {}, [], { ...ctx(), papel: "tecnico" }])("resposta inválida %j pausa na integração sem fallback", async raw => {
    state.context = raw; const client = setup(); await tick(); paused(client); const calls = state.contextCalls;
    await tick(30_000); expect(state.contextCalls).toBe(calls);
  });
  it("aba oculta expira e foco só restaura após resposta", async () => {
    const client = setup(); await tick(); Object.defineProperty(document, "visibilityState", { value: "hidden" }); await tick(15_001); paused(client);
    let resolve: ((v: unknown) => void) | undefined; state.override = () => new Promise(r => { resolve = r; });
    Object.defineProperty(document, "visibilityState", { value: "visible" }); act(() => window.dispatchEvent(new Event("focus"))); await tick();
    expect(screen.queryByText("portal aberto")).toBeNull(); resolve?.(ctx()); await tick(); expect(screen.getByText("portal aberto")).toBeTruthy();
  });
  it.each([{ roles: ["cliente_produtor"] }, { roles: ["administrador"] }, { roles: ["parceiro_b2b", "administrador"] }, { roles: ["parceiro_b2b", "parceiro_b2b_tecnico"] }])("não inicia probe para roles $roles", async ({ roles }) => {
    state.roles = roles; setup(); await tick(); await tick(30_000); expect(state.contextCalls).toBe(0);
  });
  it("gate fechado não inicia monitor B2B", async () => { state.gate = false; setup(); await tick(); const calls = state.contextCalls; await tick(30_000); expect(state.contextCalls).toBe(calls); expect(screen.getByText("portal aberto")).toBeTruthy(); });
});
describe("validação da resposta, sem resolver paralelo", () => {
  it.each([undefined, true, "true", [], {}, { ...ctx(), papel: "tecnico" }, { ...ctx(), organization_id: P }, { ...ctx(), partner_id: "invalid" }, { ...ctx(), commercial_owner_organization_id: null }])("falha fechado para %j", raw => {
    expect(() => b2bContextProbe(raw, O, "parceiro_b2b")).toThrow();
  });
  it("null é inelegível", () => expect(b2bContextProbe(null, O, "parceiro_b2b").eligible).toBe(false));
  it("legacy preserva owner comercial distinto sem inventar tenant", () => {
    expect(b2bContextProbe({ ...ctx(), mode: "legacy_partner_tenant", commercial_owner_organization_id: P }, O, "parceiro_b2b").eligible).toBe(true);
  });
});