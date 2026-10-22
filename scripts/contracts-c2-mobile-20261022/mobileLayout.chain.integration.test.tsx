// INACTIVE C2 candidate — cumulative EXTERNAL roles (C2 contract payload) through the full chain. Real AuthProvider/monitor + candidate MobileLayout + admin consumer.
// Only Supabase transport/session events are fake; the "producer" context is the C2
// projection contract (not installed hosted). Not JWT/RLS evidence.
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  uid: "00000000-0000-4000-8000-000000000001", org: "00000000-0000-4000-8000-000000000002",
  listener: undefined as undefined | ((e: string, x: unknown) => void), roles: ["parceiro_b2b_tecnico", "cliente_produtor"] as string[], contexts: ["technical", "producer"] as string[], error: false, pid: "00000000-0000-4000-8000-0000000000aa", links: true,
}));
function chain(t: string) {
  const q: Record<string, unknown> = {};
  for (const n of ["eq", "is", "filter", "in", "not", "neq", "order", "abortSignal", "select"]) q[n] = () => q;
  const run = () => Promise.resolve(t === "profiles"
    ? { data: { user_id: s.uid, organization_id: s.org, ativo: true, senha_provisoria: false, nome: "A" }, error: null }
    : t === "user_roles" ? { data: s.roles.map(role => ({ role })), error: null } : { data: [], error: null });
  q.maybeSingle = run; q.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => run().then(f, r);
  return q;
}
vi.mock("@/lib/authz/authzEpochGate", () => ({ AUTHZ_CACHE_FOUNDATION_ENABLED: true, AUTHZ_CACHE_ROLLOUT_SCOPE: "b2b-context", MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED: true, FINANCIAL_CONTEXT_MONITOR_ENABLED: true, COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: true, PRODUCER_CONTEXT_MONITOR_ENABLED: true, CONSULTANT_CONTEXT_MONITOR_ENABLED: true, OPERATOR_CONTEXT_MONITOR_ENABLED: true }));
vi.mock("@/lib/portalBroadcast", () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
vi.mock("@/hooks/useSystemConfig", () => ({ useSystemConfig: () => ({ defaults: { nome_empresa: "Cultivo Farm" } }) }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: ({ brandTitle }: { brandTitle: string }) => <header>{brandTitle}</header> }));
vi.mock("@/hooks/useOfflineSync", () => ({ useOfflineSync: () => ({ isOnline: true, pendingCount: 0, syncing: false, syncAll: () => {} }) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({ status: "ready", features: new Set<string>() }) }));
vi.mock("@/lib/saas/featureRouteMap", () => ({ isPathEntitled: () => true }));
vi.mock("@/components/app/OfflineIndicator", () => ({ OfflineIndicator: () => null }));
vi.mock("@/components/app/PendingMediaRecovery", () => ({ PendingMediaRecovery: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: s.uid } } }, error: null }),
    onAuthStateChange: (l: (e: string, x: unknown) => void) => { s.listener = l; return { data: { subscription: { unsubscribe() { s.listener = undefined; } } } }; }, signOut: async () => {} },
  from: (t: string) => chain(t),
  rpc: (name: string, args?: { _role: string }) => {
    const v = name === "get_my_available_portal_contexts"
      ? s.error ? { data: null, error: { code: "fetch_failed" } }
        : { data: { contract: "C2_MULTIPROFILE_V1", actor_id: s.uid, tenant_id: s.org, ready: true, partner_id: s.pid, producer_links_valid: s.links, profile_stamp: "p1", link_version: s.contexts.join("+"), available_contexts: s.contexts, has_technical_access: s.contexts.includes("technical"), is_admin: s.contexts.includes("admin"), has_b2b_access: false, must_select_context: s.contexts.length > 1 }, error: null }
      : name === "has_role" ? { data: s.roles.includes(args?._role ?? ""), error: null }
      : name === "h15_actor_organization" ? { data: s.org, error: null } : { data: null, error: null };
    const p = Promise.resolve(v); return Object.assign(p, { abortSignal: () => p });
  },
} }));
import { AuthProvider, useAuth } from "@/hooks/useAuth";
let authRef: { revalidateAuthz?: () => void } | undefined;
function AuthSpy() { authRef = useAuth() as never; return null; }
import { supabase as fake } from "@/integrations/supabase/client";
import { installInternalActorContextAdapter } from "../../src/test/config/helpers/internalActorContextAdapter";
installInternalActorContextAdapter(fake, () => s.uid, (_u, role) => s.roles.includes(role));
import MobileLayout from "@/pages/app/MobileLayout";
import { setActivePortalContext } from "@/lib/activePortalContext";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
function Url() { return <output data-testid="url">{useLocation().pathname}</output>; }
// Admin consumer below the layout: reads the same canonical projection, never roles.
function AdminConsumer() { const { data } = useAvailableContexts(); return <span data-testid="consumer">{data ? data.available_contexts.join(",") : "none"}</span>; }
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><AuthProvider><AuthSpy /><MemoryRouter initialEntries={["/app"]}><Url /><Routes>
    <Route element={<MobileLayout />}><Route path="/app" element={<AdminConsumer />} /></Route>
    <Route path="/sem-permissao" element={<span>sem permissão</span>} />
  </Routes></MemoryRouter></AuthProvider></QueryClientProvider>);
}
const tick = async (ms = 3000) => { for (let t = 0; t < ms; t += 100) await act(async () => { await vi.advanceTimersByTimeAsync(100); }); };
const focus = () => act(() => { window.dispatchEvent(new Event("focus")); });
const producerMenu = () => !!screen.queryByText("Entregas");
const technicalMenu = () => !!screen.queryByText("Atendimentos");
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); sessionStorage.clear(); s.roles = ["parceiro_b2b_tecnico", "cliente_produtor"]; s.contexts = ["technical", "producer"]; s.error = false; s.links = true; });
afterEach(() => { cleanup(); vi.useRealTimers(); sessionStorage.clear(); });
describe("C2 full chain: cumulative external technical + producer", () => {
  it("both canonical contexts: producer mode chosen shows producer menus only", async () => {
    setActivePortalContext("producer"); setup(); await tick();
    expect(producerMenu()).toBe(true); expect(technicalMenu()).toBe(false);
    expect(screen.getByTestId("consumer").textContent).toBe("technical,producer");
  });
  it("partial revocation of cliente_produtor keeps technical only", async () => {
    setActivePortalContext("producer"); setup(); await tick(); expect(producerMenu()).toBe(true);
    s.roles = ["parceiro_b2b_tecnico"]; s.contexts = ["technical"]; focus(); act(() => s.listener?.("TOKEN_REFRESHED", { user: { id: s.uid } })); await tick(3000); act(() => authRef?.revalidateAuthz?.()); await tick(8000);
    expect(producerMenu()).toBe(false); expect(technicalMenu()).toBe(true);
    expect(screen.getByTestId("consumer").textContent).toBe("technical");
  });
  it("producer link invalidated server-side (role kept) removes producer, keeps technical", async () => {
    setActivePortalContext("producer"); setup(); await tick(); expect(producerMenu()).toBe(true);
    s.links = false; s.contexts = ["technical"]; focus(); await tick(3000); act(() => authRef?.revalidateAuthz?.()); await tick(8000);
    expect(producerMenu()).toBe(false); expect(screen.getByTestId("consumer").textContent).toBe("technical");
  });
  it("malformed/foreign-actor C2 payload fails closed (no role fallback)", async () => {
    s.pid = "not-a-uuid"; setup(); await tick();
    expect(producerMenu()).toBe(false); expect(technicalMenu()).toBe(false); expect(screen.queryByTestId("consumer")).toBeNull();
    s.pid = "00000000-0000-4000-8000-0000000000aa";
  });
  it("projection outage after mount (pause) hides protected content, no stale menus", async () => {
    setActivePortalContext("producer"); setup(); await tick(); expect(producerMenu()).toBe(true);
    s.error = true; focus(); act(() => authRef?.revalidateAuthz?.()); await tick(20000);
    expect(screen.queryByTestId("consumer")).toBeNull(); expect(producerMenu()).toBe(false);
  });
  it("total revocation (no contexts) denies everything", async () => {
    setup(); await tick();
    s.roles = ["cliente_produtor"]; s.contexts = []; s.links = false; focus(); act(() => s.listener?.("TOKEN_REFRESHED", { user: { id: s.uid } })); await tick(3000); act(() => authRef?.revalidateAuthz?.()); await tick(8000);
    expect(producerMenu()).toBe(false); expect(technicalMenu()).toBe(false); expect(screen.queryByTestId("consumer")).toBeNull();
  });
});
