import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ actor: "A", tenant: "org-A", roles: ["administrador"], epoch: 0, fetch: vi.fn(), rows: [] as any[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true }, roles: state.roles, role: state.roles[0], loading: false, authzReady: true, authzEpoch: state.epoch }) }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://swzpzcwiasxmjutrmvkm.supabase.co", "synthetic-key", {
    accessToken: async () => "synthetic-bearer", global: { fetch: (...args) => state.fetch(...args) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) };
});
import { ProdutosTab } from "@/components/protocolos/ProdutosTab";
import ProdutosEmpresa from "@/pages/configuracoes/ProdutosEmpresa";
import { useSaveTenantProduct } from "@/hooks/useTenantProducts";
import { useSaveTenantProductVolume, useTenantProductVolumes } from "@/hooks/useTenantProductVolumes";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { navigation } from "@/config/navigation";
import { getAccessLevel } from "@/lib/permissions";
import { isPathEntitled } from "@/lib/saas/featureRouteMap";

const clients: QueryClient[] = [];
const stamp = "2026-11-03T01:00:00Z";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const ack = { product_id: "p1", updated_at: stamp, replayed: false };
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={clients.at(-1) as QueryClient}>{children}</QueryClientProvider>;
}
function client() { const c = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(c); return c; }
function rpcCalls(name: string) { return state.fetch.mock.calls.filter(([url]) => String(url).endsWith(`/rpc/${name}`)).map(([, init]) => JSON.parse(init.body)); }
beforeEach(() => {
  Object.assign(state, { actor: "A", tenant: "org-A", roles: ["administrador"], epoch: 0, rows: [] }); state.fetch.mockReset();
  state.fetch.mockImplementation(async (url, init) => {
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer synthetic-bearer");
    const name = String(url).split("/rpc/")[1];
    if (name === "tenant_product_list") return json(state.rows);
    if (name === "tenant_product_save") {
      const args = JSON.parse(init.body);
      state.rows = [{ id: "p1", owner_organization_id: state.tenant, ativo: true, updated_at: stamp, ...args.p_payload }]; return json(ack);
    }
    if (name === "tenant_product_set_archived") { state.rows[0].ativo = !JSON.parse(init.body).p_archived; return json(ack); }
    if (name) throw new Error(`Unexpected RPC ${name}`);
    return json([]);
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });

it("único menu de produtos e redirect preserva query/hash com aba destino prioritária", async () => {
  expect(navigation.some(n => n.id === "produtos-empresa")).toBe(false);
  expect(navigation.flatMap(n => n.children ?? []).filter(n => n.route === "/base-tecnica?tab=produtos")).toHaveLength(1);
  function Location() { const l = useLocation(); return <output>{l.pathname}{l.search}{l.hash}</output>; }
  render(<MemoryRouter initialEntries={["/configuracoes/produtos?busca=solo&tab=outra#p1"]}><Routes><Route path="/configuracoes/produtos" element={<ProdutosEmpresa />} /><Route path="/base-tecnica" element={<Location />} /></Routes></MemoryRouter>);
  expect(await screen.findByText("/base-tecnica?busca=solo&tab=produtos#p1")).toBeTruthy();
});
it.each(["administrador", "gestor"])("%s cadastra, edita, arquiva e reativa no mesmo cadastro, SDK real", async role => {
  state.roles = [role]; client(); render(<ProdutosTab />, { wrapper });
  await screen.findByText("Nenhum produto encontrado");
  await waitFor(() => expect(state.fetch.mock.calls.filter(([u]) => String(u).includes("/formulacoes")).length).toBe(1));
  fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Solo Empresa" } });
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Descrição preservada" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await screen.findByText("Solo Empresa");
  expect(rpcCalls("tenant_product_save")[0]).toMatchObject({ p_product_id: null, p_expected_updated_at: null, p_payload: { nome: "Solo Empresa", descricao: "Descrição preservada", tipo: "solo", b2b_enabled: false } });
  expect(rpcCalls("tenant_product_save")[0].p_payload).not.toHaveProperty("owner_organization_id");
  expect(rpcCalls("tenant_catalog_formulacoes_replace")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Solo Editado" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await screen.findByText("Solo Editado");
  expect(rpcCalls("tenant_product_save")[1].p_expected_updated_at).toBe(stamp);
  fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar arquivados" }));
  fireEvent.click(await screen.findByRole("button", { name: "Arquivar" }));
  await screen.findByRole("button", { name: "Reativar" });
  fireEvent.click(screen.getByRole("button", { name: "Reativar" }));
  await screen.findByRole("button", { name: "Arquivar" });
  expect(rpcCalls("tenant_product_set_archived").map(a => a.p_archived)).toEqual([true, false]);
});
it.each(["financeiro", "consultor_tecnico", "parceiro_b2b", "parceiro_b2b_tecnico", "superadmin"])("%s não recebe CRUD próprio nem bypass global", role => {
  state.roles = [role]; client(); const { result } = renderHook(useTenantCatalogEditor, { wrapper });
  expect(result.current.canEdit).toBe(false);
  expect(rpcCalls("tenant_product_save")).toHaveLength(0);
  expect(getAccessLevel("superadmin", "/base-tecnica")).toBe("none");
  expect(getAccessLevel("financeiro", "/base-tecnica")).toBe("r");
  expect(isPathEntitled("/base-tecnica?tab=produtos", { status: "ready", features: new Set() })).toBe(false);
});
it("composição usa CAS retornado, conserva concentração/unidade e falha explícita, sem compensação", async () => {
  client();
  state.fetch.mockImplementation(async (url, init) => {
    if (String(url).endsWith("tenant_product_save")) return json(ack);
    if (String(url).endsWith("tenant_catalog_formulacoes_replace")) return json({ code: "42501", message: "tenant_catalog_ref_foreign" }, 403);
    throw new Error("Unexpected transport");
  });
  const { result } = renderHook(useSaveTenantProduct, { wrapper });
  await act(async () => {
    const output = await result.current.mutateAsync({ id: "p1", expectedUpdatedAt: stamp, draft: { nome: "Solo" }, composition: [{ microrganismo_id: "m1", volume_ml: 200, concentracao: 3, unidade: "mL" }] });
    expect(output.compositionError).toMatch(/Produto salvo; composição não confirmada/);
  });
  expect(rpcCalls("tenant_catalog_formulacoes_replace")[0]).toMatchObject({ p_produto_id: "p1", p_expected_produto_updated_at: stamp, p_items: [{ microrganismo_id: "m1", volume_ml: 200, concentracao: 3, unidade: "mL" }] });
  expect(state.fetch).toHaveBeenCalledTimes(2);
});
it("volume e preço conservados via root RPC com CAS, sem writer global", async () => {
  client(); state.fetch.mockResolvedValue(json({ ok: true, id: "v1", updated_at: stamp, replayed: false }));
  const { result } = renderHook(useSaveTenantProductVolume, { wrapper });
  await act(async () => { await result.current.mutateAsync({ id: "v1", productId: "p1", expectedUpdatedAt: stamp, payload: { volume_ml: 1000, preco_brl: 37, rotulo: "1 L", ativo: true } }); });
  expect(rpcCalls("tenant_catalog_root_save")[0]).toMatchObject({ p_root: "catalogo_volumes", p_id: "v1", p_expected_updated_at: stamp, p_payload: { volume_ml: 1000, preco_brl: 37, rotulo: "1 L", ativo: true } });
});
it("volume recusa Financeiro antes de REST", async () => {
  state.roles = ["financeiro"]; client(); const { result } = renderHook(useSaveTenantProductVolume, { wrapper });
  await act(async () => { await expect(result.current.mutateAsync({ id: null, productId: "p1", expectedUpdatedAt: null, payload: { volume_ml: 1000, preco_brl: 37 } })).rejects.toThrow("catalog_context_unavailable"); });
  expect(state.fetch).not.toHaveBeenCalled();
});