import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false }));
const calls = vi.hoisted(() => ({ reads: vi.fn(), rpc: vi.fn(), remove: vi.fn(), pending: false, finish: [] as Array<(r: unknown) => void> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: calls.rpc,
  from: (table: string) => {
    calls.reads(table);
    const result = () => calls.pending ? new Promise(resolve => calls.finish.push(resolve)) : Promise.resolve({ data: table === "partner_accounts" ? [{ id: "P" }] : table === "partner_users" ? [{ id: "L", user_id: "U", partner_id: "P", papel: "gestor", created_at: "2026-10-08" }] : table === "profiles" ? [{ user_id: "U", nome: "Pessoa", email: "test@example.invalid", organization_id: "OA" }] : [{ user_id: "U", role: "parceiro_b2b" }], error: null });
    const chain = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, abortSignal: result, then: (resolve: (v: unknown) => void) => result().then(resolve), delete: calls.remove };
    return chain;
  },
} }));
import { usePartnerUsers, useLinkPartnerUser, useUpdatePartnerUserPapel, useUnlinkPartnerUser } from "@/hooks/usePartnerUsers";
beforeEach(() => { auth.user = { id: "A" }; Object.assign(auth.profile, { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }); auth.roles = ["administrador"]; auth.loading = false; calls.reads.mockClear(); calls.rpc.mockClear(); calls.remove.mockClear(); calls.pending = false; calls.finish = []; });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
for (const change of ["tenant", "logout", "inactive", "provisional", "mismatch", "roles", "loading"] as const) {
  it(`não reutiliza lista em ${change}`, async () => {
    const { client, wrapper } = setup(); const h = renderHook(() => usePartnerUsers("P"), { wrapper });
    await waitFor(() => expect(h.result.current.data?.length).toBe(1)); calls.pending = true;
    if (change === "tenant") auth.profile.organization_id = "OB";
    if (change === "logout") auth.user = null;
    if (change === "inactive") auth.profile.ativo = false;
    if (change === "provisional") auth.profile.senha_provisoria = true;
    if (change === "mismatch") auth.profile.user_id = "B";
    if (change === "roles") auth.roles = [];
    if (change === "loading") auth.loading = true;
    h.rerender(); expect(h.result.current.data).toBeUndefined(); h.unmount(); client.clear();
  });
}
it("resposta atrasada não atravessa A→B→A", async () => {
  calls.pending = true; const { client, wrapper } = setup(); const h = renderHook(() => usePartnerUsers("P"), { wrapper });
  const old = [...calls.finish]; auth.profile.organization_id = "OB"; h.rerender(); auth.profile.organization_id = "OA"; h.rerender();
  await act(async () => { old.forEach(resolve => resolve({ data: [{ id: "P" }], error: null })); });
  expect(h.result.current.data).toBeUndefined(); h.unmount(); client.clear();
});
it("não executa mutações legadas sem contrato integrado", async () => {
  const { client, wrapper } = setup(); const h = renderHook(() => ({ link: useLinkPartnerUser("P"), update: useUpdatePartnerUserPapel("P"), unlink: useUnlinkPartnerUser("P") }), { wrapper });
  await expect(h.result.current.link.mutateAsync({ user_id: "U", papel: "gestor" })).rejects.toThrow();
  await expect(h.result.current.update.mutateAsync({ linkId: "L", papel: "tecnico" })).rejects.toThrow();
  await expect(h.result.current.unlink.mutateAsync("L")).rejects.toThrow();
  expect(calls.rpc).not.toHaveBeenCalled(); expect(calls.remove).not.toHaveBeenCalled(); h.unmount(); client.clear();
});