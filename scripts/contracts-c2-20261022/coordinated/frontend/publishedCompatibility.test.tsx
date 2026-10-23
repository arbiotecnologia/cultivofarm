import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import observations from "../../integral/frontend/published-singleton-observations.json";
import { useAvailableContexts } from "../../integral/frontend/published-c0441e86/useAvailableContexts";
import { useMyPartner } from "../../integral/frontend/published-c0441e86/useMyPartner";
import { b2bContextProbe } from "../../integral/frontend/published-c0441e86/b2bContextProbe";
const state = vi.hoisted(() => ({ kind: "gestor" as "gestor" | "tecnico" | "produtor" | "admin" }));
const roles = { gestor: "parceiro_b2b", tecnico: "parceiro_b2b_tecnico", produtor: "cliente_produtor", admin: "administrador" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => {
  const o = observations[state.kind]; return { user: { id: o.actor }, profile: { user_id: o.actor, organization_id: o.tenant, ativo: true, senha_provisoria: false },
    roles: [roles[state.kind]], loading: false, authzReady: true, authzEpoch: 1, checkAuthzAccess: () => true };
} }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: true, scope: state.kind, capture: () => () => true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (name: string) => {
  const o = observations[state.kind]; const data = name === "get_my_available_portal_contexts" ? o.contexts : name === "get_my_commercial_partner_context" ? o.context : o.projection;
  return Object.assign(Promise.resolve({ data, error: null }), { abortSignal: () => Promise.resolve({ data, error: null }) });
} } }));
function wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>; }
beforeEach(() => { state.kind = "gestor"; }); afterEach(cleanup);
it.each(["gestor", "tecnico"] as const)("published %s accepts actual integral SQL context/projection and old monitor", async kind => {
  state.kind = kind; const o = observations[kind]; const { result } = renderHook(() => useMyPartner(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.id).toBe(o.context?.partner_id);
  expect(b2bContextProbe(o.context, o.tenant, roles[kind]).eligible).toBe(true);
});
it.each([["gestor", "b2b"], ["tecnico", "technical"], ["admin", "admin"]] as const)("published %s keeps canonical %s context", async (kind, context) => {
  state.kind = kind; const { result } = renderHook(() => useAvailableContexts(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true)); expect(result.current.data?.available_contexts).toContain(context);
});
it("published singleton producer filters new context but preserves existing canonical home fallback", async () => {
  state.kind = "produtor"; expect(observations.produtor.contexts.available_contexts).toEqual(["producer"]);
  const { result } = renderHook(() => useAvailableContexts(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.available_contexts).toEqual([]); expect(result.current.producerHome).toBe("/app");
});