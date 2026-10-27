import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: { user: { id: "U" } as { id: string } | null, profile: { user_id: "U", organization_id: "A", ativo: true, senha_provisoria: false }, roles: ["parceiro_b2b"], loading: false },
  calls: 0, foreign: false, wrongProjection: false,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (name: string) => { state.calls++; return { error: null, data: name === "get_my_commercial_partner_projection"
    ? { id: state.wrongProjection ? "22222222-2222-4222-8222-222222222222" : "11111111-1111-4111-8111-111111111111", codigo: "P1", razao_social: "Partner", ativo: true, papel: state.auth.roles[0] === "parceiro_b2b_tecnico" ? "tecnico" : "gestor", mode: "commercial_owner", contract: "C2_MULTIPROFILE_V1", actor_id: "U", tenant_id: "A", external_roles: [...state.auth.roles], desconto_padrao: 25, limite_credito: 1000 }
    : { partner_id: "11111111-1111-4111-8111-111111111111", organization_id: state.foreign ? "B" : "A", role: state.auth.roles[0], papel: state.auth.roles[0] === "parceiro_b2b_tecnico" ? "tecnico" : "gestor", mode: "commercial_owner", contract: "C2_MULTIPROFILE_V1", actor_id: "U", tenant_id: "A", commercial_owner_organization_id: state.foreign ? "B" : "A", external_roles: [...state.auth.roles], manager: state.auth.roles.includes("parceiro_b2b"), technician: state.auth.roles.includes("parceiro_b2b_tecnico") } }; },
  from: () => { const chain: Record<string, unknown> = {}; for (const m of ["select", "eq", "abortSignal"]) chain[m] = () => chain; chain.maybeSingle = async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", ativo: true }, error: null }); return chain; },
} }));
import { useMyPartner, usePartnerPapel } from "@/hooks/useMyPartner";
beforeEach(() => { state.auth.user = { id: "U" }; state.auth.roles = ["parceiro_b2b"]; state.auth.loading = false; Object.assign(state.auth.profile, { user_id: "U", organization_id: "A", ativo: true, senha_provisoria: false }); state.calls = 0; state.foreign = false; state.wrongProjection = false; });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const h = renderHook(() => ({ partner: useMyPartner(), papel: usePartnerPapel() }), { wrapper });
  return { h, client };
}
describe("own commercial partner — real QueryClient, mocked server", () => {
  it.each(["parceiro_b2b", "parceiro_b2b_tecnico"])("does not expose financial response fields for %s (not a backend denial proof)", async role => {
    state.auth.roles = [role];
    const { h, client } = setup();
    await waitFor(() => expect(h.result.current.partner.data?.id).toBe("11111111-1111-4111-8111-111111111111"));
    expect(h.result.current.partner.data).not.toHaveProperty("desconto_padrao");
    expect(h.result.current.partner.data).not.toHaveProperty("limite_credito");
    expect(h.result.current.partner.data?.papel).toBe(role === "parceiro_b2b_tecnico" ? "tecnico" : "gestor");
    h.unmount(); client.clear();
  });
  it("consumes the actor-derived own context", async () => { const { h, client } = setup(); await waitFor(() => expect(h.result.current.partner.data?.id).toBe("11111111-1111-4111-8111-111111111111")); expect(h.result.current.papel.isGestor).toBe(true); h.unmount(); client.clear(); });
  it("rejects a mismatched owner response", async () => { state.foreign = true; const { h, client } = setup(); await waitFor(() => expect(h.result.current.partner.isError).toBe(true)); expect(h.result.current.papel.isGestor).toBe(false); h.unmount(); client.clear(); });
  it("rejects a sibling-partner projection", async () => { state.wrongProjection = true; const { h, client } = setup(); await waitFor(() => expect(h.result.current.partner.isError).toBe(true)); expect(h.result.current.partner.data).toBeUndefined(); h.unmount(); client.clear(); });
  it("does not request context for cumulative internal roles", () => { state.auth.roles.push("administrador"); const { h, client } = setup(); expect(state.calls).toBe(0); expect(h.result.current.papel.papel).toBeNull(); h.unmount(); client.clear(); });
  it("hides cached partner on logout without defaulting to manager", async () => { const { h, client } = setup(); await waitFor(() => expect(h.result.current.partner.data?.id).toBe("11111111-1111-4111-8111-111111111111")); state.auth.user = null; h.rerender(); expect(h.result.current.partner.data).toBeUndefined(); expect(h.result.current.papel.isGestor).toBe(false); h.unmount(); client.clear(); });
});