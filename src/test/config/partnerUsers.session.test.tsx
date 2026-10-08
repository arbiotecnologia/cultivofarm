import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: { user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false }, pending: false, orphan: false, failed: false, resolvers: [] as Array<(v: unknown) => void>, calls: [] as string[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
 state.calls.push(table);
 const value = () => ({ error: state.failed && table === "user_roles" ? { message: "fail" } : null, data: table === "partner_accounts" ? { commercial_owner_organization_id: state.orphan ? null : state.auth.profile.organization_id } : table === "profiles" ? [{ user_id: "U", nome: "Own", email: "local" }] : table === "partner_users" ? [] : [{ user_id: "U", role: "parceiro_b2b" }] });
 const chain: Record<string, unknown> = {};
 for (const method of ["select", "eq", "in", "order", "abortSignal", "maybeSingle"]) chain[method] = () => chain;
 chain.then = (resolve: (v: unknown) => void) => state.pending ? state.resolvers.push(resolve) : resolve(value());
 return chain;
} } }));
import { usePartnerUsers, useAvailablePartnerUsers, useLinkPartnerUser, useUpdatePartnerUserPapel, useUnlinkPartnerUser } from "@/hooks/usePartnerUsers";
beforeEach(() => { state.auth.user = { id: "A" }; Object.assign(state.auth.profile, { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }); state.auth.roles = ["administrador"]; state.auth.loading = false; state.pending = false; state.orphan = false; state.failed = false; state.resolvers = []; state.calls = []; });
function setup() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><StrictMode>{children}</StrictMode></QueryClientProvider>;
 const h = renderHook(() => ({ linked: usePartnerUsers("P"), available: useAvailablePartnerUsers("P"), link: useLinkPartnerUser("P"), update: useUpdatePartnerUserPapel("P"), unlink: useUnlinkPartnerUser("P") }), { wrapper });
 return { h, client };
}
describe("partner users real QueryClient", () => {
 it("uses commercial owner without optional client", async () => { const { h, client } = setup(); await waitFor(() => expect(h.result.current.available.data?.[0].user_id).toBe("U")); expect(state.calls).not.toContain("clientes"); h.unmount(); client.clear(); });
 for (const change of ["identity", "tenant", "logout", "inactive", "mismatch", "loading", "roles", "provisional", "noorg"] as const) {
 it(`clears both caches immediately: ${change}`, async () => {
  const { h, client } = setup(); await waitFor(() => expect(h.result.current.available.data).toHaveLength(1)); state.pending = true;
  if (change === "identity") { state.auth.user = { id: "B" }; state.auth.profile.user_id = "B"; }
  if (change === "tenant") state.auth.profile.organization_id = "OB";
  if (change === "logout") state.auth.user = null;
  if (change === "inactive") state.auth.profile.ativo = false;
  if (change === "mismatch") state.auth.profile.user_id = "B";
  if (change === "loading") state.auth.loading = true;
  if (change === "roles") state.auth.roles = ["consultor_tecnico"];
  if (change === "provisional") state.auth.profile.senha_provisoria = true;
  if (change === "noorg") state.auth.profile.organization_id = "";
  h.rerender(); expect(h.result.current.linked.data).toBeUndefined(); expect(h.result.current.available.data).toBeUndefined();
  expect(client.getQueryCache().getAll().filter(q => q.queryKey[1] !== h.result.current.available.scope)).toHaveLength(0);
  h.unmount(); client.clear();
 }); }
 it("rejects an orphan partner before user reads", async () => { state.orphan = true; const { h, client } = setup(); await waitFor(() => expect(h.result.current.available.isError).toBe(true)); expect(state.calls).not.toContain("profiles"); h.unmount(); client.clear(); });
 it("does not silently ignore role-query failures", async () => { state.failed = true; const { h, client } = setup(); await waitFor(() => expect(h.result.current.available.isError).toBe(true)); expect(h.result.current.available.data).toBeUndefined(); h.unmount(); client.clear(); });
 it("fences late responses and A-B-A", async () => {
 state.pending = true; const { h, client } = setup(); await waitFor(() => expect(state.resolvers.length).toBeGreaterThan(0)); const old = [...state.resolvers];
 state.auth.profile.organization_id = "OB"; h.rerender(); state.auth.profile.organization_id = "OA"; h.rerender();
 await act(async () => old.forEach(resolve => resolve({ data: { commercial_owner_organization_id: "OA" }, error: null })));
 expect(h.result.current.available.data).toBeUndefined(); expect(state.calls).not.toContain("profiles"); h.unmount(); client.clear();
 });
 it("closed mutations never call Supabase", async () => { const { h, client } = setup(); await waitFor(() => expect(h.result.current.available.isSuccess).toBe(true)); const before = state.calls.length;
 await expect(h.result.current.link.mutateAsync({ user_id: "U", papel: "gestor" })).rejects.toThrow("indisponíveis");
 await expect(h.result.current.update.mutateAsync({ linkId: "L", papel: "tecnico" })).rejects.toThrow("indisponíveis");
 await expect(h.result.current.unlink.mutateAsync("L")).rejects.toThrow("indisponíveis"); expect(state.calls).toHaveLength(before); h.unmount(); client.clear(); });
});
