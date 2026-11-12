import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ actor: "A", tenant: "org-A", roles: ["administrador"], epoch: 0, fetch: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true }, roles: state.roles, role: state.roles[0], loading: false, authzReady: true, authzEpoch: state.epoch }) }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://swzpzcwiasxmjutrmvkm.supabase.co", "synthetic-key", { accessToken: async () => "synthetic-bearer", global: { fetch: (...args) => state.fetch(...args) }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) };
});
import { TenantReferenceDialog } from "@/components/protocolos/TenantReferencePanel";
import { useMicroorganismProfile, useUpsertMicroProfile } from "@/hooks/useMicroorganismProfile";
const clients: QueryClient[] = [];
const stamp = "2026-11-12T03:00:00Z";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const row = { id: "culture-A", nome: "Cultura AR Bio fictícia", descricao: "Rascunho", owner_organization_id: "org-A", updated_at: stamp };
function wrapper({ children }: { children: ReactNode }) { return <MemoryRouter><QueryClientProvider client={clients.at(-1) as QueryClient}>{children}</QueryClientProvider></MemoryRouter>; }
beforeEach(() => { Object.assign(state, { actor: "A", tenant: "org-A", roles: ["administrador"], epoch: 0 }); state.fetch.mockReset(); clients.push(new QueryClient({ defaultOptions: { queries: { retry: false } } })); });
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
it.each(["culturas", "microrganismos"] as const)("%s cria via raiz canônica, CAS e ACK sem empresa ou aprovação no payload", async root => {
  state.fetch.mockResolvedValue(json({ ok: true, id: "new-A", updated_at: stamp, replayed: false }));
  const saved = vi.fn(); render(<TenantReferenceDialog root={root} item={null} onClose={vi.fn()} onSaved={saved} />, { wrapper });
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "AR Bio fictícia" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  const [url, init] = state.fetch.mock.calls[0]; expect(String(url)).toContain("/rpc/tenant_catalog_root_save");
  const args = JSON.parse(init.body); expect(args.p_root).toBe(root); expect(args.p_id).toBeNull(); expect(args.p_expected_updated_at).toBeNull();
  expect(args.p_payload.nome).toBe("AR Bio fictícia"); expect(args.p_payload.owner_organization_id).toBeUndefined(); expect(args.p_payload.status_validacao).toBeUndefined();
});
it("edição mantém ID/CAS e conflito retém valores sem callback ou retry automático", async () => {
  state.fetch.mockResolvedValue(json({ code: "PT409", message: "catalog_cas_conflict" }, 409));
  const saved = vi.fn(); render(<TenantReferenceDialog root="culturas" item={row} onClose={vi.fn()} onSaved={saved} />, { wrapper });
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Meu rascunho" } }); fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await screen.findByRole("alert"); expect((screen.getByLabelText("Descrição") as HTMLTextAreaElement).value).toBe("Meu rascunho");
  expect(saved).not.toHaveBeenCalled(); expect(state.fetch).toHaveBeenCalledTimes(1);
  const args = JSON.parse(state.fetch.mock.calls[0][1].body); expect(args.p_id).toBe("culture-A"); expect(args.p_expected_updated_at).toBe(stamp);
});
it("papel técnico não despacha raiz", async () => {
  state.roles = ["consultor_tecnico"]; render(<TenantReferenceDialog root="culturas" item={null} onClose={vi.fn()} onSaved={vi.fn()} />, { wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" })); expect(state.fetch).not.toHaveBeenCalled();
});
it("resposta de outro escopo não fecha diálogo nem adota ACK", async () => {
  let finish: (v: Response) => void = () => {}; state.fetch.mockReturnValue(new Promise<Response>(r => { finish = r; }));
  const saved = vi.fn(); const view = render(<TenantReferenceDialog root="culturas" item={row} onClose={vi.fn()} onSaved={saved} />, { wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" })); await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
  state.tenant = "org-B"; state.epoch++; view.rerender(<TenantReferenceDialog root="culturas" item={row} onClose={vi.fn()} onSaved={saved} />);
  await act(async () => { finish(json({ ok: true, id: row.id, updated_at: stamp, replayed: false })); }); expect(saved).not.toHaveBeenCalled();
});
it("ficha micro usa versão observada, omite status e rejeita aprovação implícita", async () => {
  state.fetch.mockImplementation(async (url: string) => {
    if (url.includes("/rpc/")) return json({ ok: true, id: "profile-A", updated_at: stamp, replayed: false });
    if (url.includes("/microorganism_technical_profiles?")) return json({ ok: true, id: "profile-A", microrganismo_id: "micro-A", updated_at: stamp, status_validacao: "rascunho" });
    return json([]);
  });
  const hook = renderHook(() => ({ read: useMicroorganismProfile("micro-A"), write: useUpsertMicroProfile() }), { wrapper });
  await waitFor(() => expect(hook.result.current.read.isSuccess).toBe(true));
  await act(async () => { await hook.result.current.write.mutateAsync({ microrganismo_id: "micro-A", resumo_curto: "Manual", status_validacao: "rascunho" }); });
  const calls = state.fetch.mock.calls.filter(([url]) => String(url).includes("/rpc/")); const args = JSON.parse(calls[0][1].body);
  expect(args.p_id).toBe("profile-A"); expect(args.p_expected_updated_at).toBe(stamp); expect(args.p_payload).toEqual({ resumo_curto: "Manual" });
  await act(async () => { await expect(hook.result.current.write.mutateAsync({ microrganismo_id: "micro-A", status_validacao: "aprovado" })).rejects.toThrow("Mudança de status"); });
  expect(state.fetch.mock.calls.filter(([url]) => String(url).includes("/rpc/")).length).toBe(1);
});