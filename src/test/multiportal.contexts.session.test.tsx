import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, type ReactNode } from "react";
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["gestor", "consultor_tecnico"], loading: false }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
const response = { data: { available_contexts: ["admin", "technical"], has_technical_access: true, is_admin: true }, error: null };
beforeEach(() => {
  auth.user = { id: "A" }; Object.assign(auth.profile, { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false });
  auth.roles = ["gestor", "consultor_tecnico"]; auth.loading = false; rpc.mockReset();
  rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve(response) }));
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><StrictMode>{children}</StrictMode></QueryClientProvider>;
  const h = renderHook(() => useAvailableContexts(), { wrapper });
  return { h, client };
}
describe("contextos com QueryClient real", () => {
  for (const change of ["identity", "tenant", "roles", "logout", "inactive", "mismatch", "loading", "provisional"] as const) {
    it(`oculta dados imediatamente em ${change}`, async () => {
      const { h, client } = setup();
      await waitFor(() => expect(h.result.current.data?.available_contexts).toEqual(["admin", "technical"]));
      rpc.mockImplementation(() => ({ abortSignal: () => new Promise(() => {}) }));
      if (change === "identity") { auth.user = { id: "B" }; auth.profile.user_id = "B"; }
      if (change === "tenant") auth.profile.organization_id = "OB";
      if (change === "roles") auth.roles = ["consultor_tecnico"];
      if (change === "logout") auth.user = null;
      if (change === "inactive") auth.profile.ativo = false;
      if (change === "mismatch") auth.profile.user_id = "B";
      if (change === "loading") auth.loading = true;
      if (change === "provisional") auth.profile.senha_provisoria = true;
      h.rerender();
      expect(h.result.current.data).toBeUndefined();
      expect(client.getQueryCache().getAll().filter(q => q.queryKey[1] !== h.result.current.scope)).toHaveLength(0);
      h.unmount(); client.clear();
    });
  }
  it("ignora promessa antiga e retorno A→B→A sob StrictMode", async () => {
    const pending: Array<(r: typeof response) => void> = [];
    rpc.mockImplementation(() => ({ abortSignal: () => new Promise(resolve => pending.push(resolve)) }));
    const { h, client } = setup();
    const old = [...pending];
    auth.profile.organization_id = "OB"; h.rerender();
    auth.profile.organization_id = "OA"; h.rerender();
    await act(async () => { old.forEach(resolve => resolve(response)); });
    expect(h.result.current.data).toBeUndefined();
    h.unmount(); client.clear();
  });
  it("não consulta com perfil inválido", () => {
    auth.profile.ativo = false;
    const { h, client } = setup();
    expect(rpc).not.toHaveBeenCalled(); expect(h.result.current.ready).toBe(false);
    h.unmount(); client.clear();
  });
});
