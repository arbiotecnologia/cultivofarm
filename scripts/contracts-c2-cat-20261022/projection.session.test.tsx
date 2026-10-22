import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ scope: "A", ready: true, organization: "A", invalid: false, cap: true, late: null as null | (() => void), defer: false, calls: [] as string[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: ["parceiro_b2b"], profile: { organization_id: state.organization, senha_provisoria: false } }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ scope: state.scope, ready: state.ready, capture: () => { const scope = state.scope; return () => state.ready && scope === state.scope; } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async function(name: string) {
  state.calls.push(name); const org = state.organization;
  if (name === "get_my_commercial_partner_context") return { data: { partner_id: "P", organization_id: org, role: "parceiro_b2b", papel: "gestor", mode: "commercial_owner" }, error: null };
  if (state.defer) await new Promise<void>(resolve => { state.late = resolve; });
  return { error: null, data: { id: state.invalid ? "OTHER" : "P", codigo: "P1", razao_social: "Partner", ativo: true, papel: "gestor", mode: "commercial_owner", capabilities: state.cap ? { contract: "C2_CAT_V1", catalog_read: true, sheets_read: false } : undefined } };
} } }));
import { useMyPartner } from "./useMyPartner";
beforeEach(() => Object.assign(state, { scope: "A", ready: true, organization: "A", invalid: false, cap: true, late: null, defer: false, calls: [] }));
function setup() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return { h: renderHook(() => useMyPartner(), { wrapper }), client };
}
it("uses the existing two calls only, without capability probe", async () => {
 const { h, client } = setup(); await waitFor(() => expect(h.result.current.data?.capabilities.catalog_read).toBe(true));
 expect(state.calls).toEqual(["get_my_commercial_partner_context", "get_my_commercial_partner_projection"]); h.unmount(); client.clear();
});
it("old backend projection never grants owner catalogue", async () => {
 state.cap = false; const { h, client } = setup(); await waitFor(() => expect(h.result.current.data?.id).toBe("P"));
 expect(h.result.current.data?.capabilities.catalog_read).toBe(false); h.unmount(); client.clear();
});
it("refetch error hides stale capabilities immediately after failure", async () => {
 const { h, client } = setup(); await waitFor(() => expect(h.result.current.data?.id).toBe("P"));
 state.invalid = true; await h.result.current.refetch(); await waitFor(() => expect(h.result.current.isError).toBe(true));
 expect(h.result.current.data).toBeUndefined(); h.unmount(); client.clear();
});
it("late projection after lease pause cannot grant cache", async () => {
 state.defer = true; const { h, client } = setup(); await waitFor(() => expect(state.late).not.toBeNull());
 state.ready = false; h.rerender(); state.late?.(); await waitFor(() => expect(h.result.current.isError).toBe(true));
 expect(h.result.current.data).toBeUndefined(); h.unmount(); client.clear();
});
it("context A response cannot grant B after tenant switch", async () => {
 state.defer = true; const { h, client } = setup(); await waitFor(() => expect(state.late).not.toBeNull());
 const releaseA = state.late; state.scope = "B"; state.organization = "B"; state.defer = false; state.cap = false; h.rerender(); releaseA?.();
 await waitFor(() => expect(h.result.current.data?.capabilities.catalog_read).toBe(false));
 h.unmount(); client.clear();
});