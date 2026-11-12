import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ actor: "A", tenant: "org-A", roles: ["administrador"], epoch: 0, fetch: vi.fn(), rows: [] as any[],
  unitCap: "absent" as "positive" | "absent" | "denied", unitCalls: [] as string[] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true }, roles: state.roles, role: state.roles[0], loading: false, authzReady: true, authzEpoch: state.epoch }) }));
// Contrato PRODUCT_UNIT_V2 explícito e separado do transporte de cada cenário: capability ausente por padrão
// (SQL ainda não instalado); positiva somente quando o cenário a declara. Unidade lida do próprio produto da empresa.
const unitContractFetch = vi.hoisted(() => (url: string, init?: RequestInit): Promise<Response> | null => {
  const name = url.split("/rpc/")[1];
  if (name !== "tenant_product_unit_capability_v1" && name !== "solid_pack_offers_admin_v1") return null;
  state.unitCalls.push(name);
  const res = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
  if (name === "tenant_product_unit_capability_v1") {
    if (state.unitCap === "absent") return res({ code: "PGRST202", message: "Could not find the function" }, 404);
    if (state.unitCap === "denied") return res({ code: "42501", message: "forbidden" }, 403);
    return res({ contract: "PRODUCT_UNIT_V2", writer: "tenant_product_save", units: ["kg", "g", "ml", "l"] });
  }
  const id = JSON.parse(String(init?.body ?? "{}")).p_product;
  const row = state.rows.find(r => r.id === id && r.owner_organization_id === state.tenant);
  if (!row) return res({ code: "P0002", message: "not_found" }, 404);
  return res({ contract: "SOLID_PACK_ADMIN_V1", product_id: id, config_version: 0, unidade_conteudo: row.unidade_conteudo ?? null, offers: [] });
});
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://swzpzcwiasxmjutrmvkm.supabase.co", "synthetic-key", {
    accessToken: async () => "synthetic-bearer", global: { fetch: (...args) => unitContractFetch(String(args[0]), args[1]) ?? state.fetch(...args) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) };
});
import { ProdutosTab } from "@/components/protocolos/ProdutosTab";
import ProdutosEmpresa from "@/pages/configuracoes/ProdutosEmpresa";
import Protocolos from "@/pages/Protocolos";
import { useSaveTenantProduct } from "@/hooks/useTenantProducts";
import { useSaveTenantProductVolume, useTenantProductVolumes } from "@/hooks/useTenantProductVolumes";
import { useTenantCatalogEditor } from "@/hooks/useTenantCatalogEditor";
import { useProductProfile, useUpsertProductProfile } from "@/hooks/useProductProfile";
import { useCatalogoUnificado } from "@/hooks/useCatalogoUnificado";
import { navigation } from "@/config/navigation";
import { canAccess, getAccessLevel } from "@/lib/permissions";
import { searchNavItems } from "@/lib/navigation/search";
import { isPathEntitled } from "@/lib/saas/featureRouteMap";

const clients: QueryClient[] = [];
const stamp = "2026-11-03T01:00:00Z";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const ack = { product_id: "p1", updated_at: stamp, replayed: false };
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><QueryClientProvider client={clients.at(-1) as QueryClient}>{children}</QueryClientProvider></MemoryRouter>;
}
function client() { const c = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(c); return c; }
function rpcCalls(name: string) { return state.fetch.mock.calls.filter(([url]) => String(url).endsWith(`/rpc/${name}`)).map(([, init]) => JSON.parse(init.body)); }
beforeEach(() => {
  Object.assign(state, { actor: "A", tenant: "org-A", roles: ["administrador"], epoch: 0, rows: [], unitCap: "absent", unitCalls: [] }); state.fetch.mockReset();
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
async function chooseUnit(unit: "kg" | "g" | "ml" | "l") {
  const trigger = await screen.findByLabelText("Unidade do produto *");
  await waitFor(() => expect(trigger.matches(":disabled")).toBe(false));
  const native = trigger.parentElement?.querySelector("select");
  if (!native) throw new Error("select nativo da unidade ausente");
  fireEvent.change(native, { target: { value: unit } });
  await waitFor(() => expect(trigger.textContent).toBe(unit === "ml" ? "mL" : unit === "l" ? "L" : unit));
}
async function unitLoaded(label: string) {
  await waitFor(() => expect(screen.getByLabelText("Unidade do produto *").textContent).toBe(label));
}
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });

it("único menu de produtos e redirect preserva query/hash com aba destino prioritária", async () => {
  expect(navigation.some(n => n.id === "produtos-empresa")).toBe(false);
  expect(navigation.flatMap(n => n.children ?? []).filter(n => n.route === "/base-tecnica?tab=produtos")).toHaveLength(1);
  function Location() { const l = useLocation(); return <output>{l.pathname}{l.search}{l.hash}</output>; }
  render(<MemoryRouter initialEntries={["/configuracoes/produtos?busca=solo&tab=outra#p1"]}><Routes><Route path="/configuracoes/produtos" element={<ProdutosEmpresa />} /><Route path="/base-tecnica" element={<Location />} /></Routes></MemoryRouter>);
  expect(await screen.findByText("/base-tecnica?busca=solo&tab=produtos#p1")).toBeTruthy();
});
it.each(["administrador", "gestor"])("%s cadastra, edita, arquiva e reativa no mesmo cadastro, SDK real", async role => {
  state.roles = [role]; state.unitCap = "positive"; client(); render(<ProdutosTab />, { wrapper });
  if (role === "gestor") {
    expect(getAccessLevel(role, "/configuracoes/produtos")).toBe("r");
    expect(getAccessLevel(role, "/base-tecnica?tab=produtos")).toBe("rw");
  }
  await screen.findByText("Nenhum produto encontrado");
  await waitFor(() => expect(state.fetch.mock.calls.filter(([u]) => String(u).includes("/formulacoes")).length).toBe(1));
  fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Solo Empresa" } });
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Descrição preservada" } });
  await chooseUnit("g");
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await screen.findByText("Solo Empresa");
  expect(rpcCalls("tenant_product_save")[0]).toMatchObject({ p_product_id: null, p_expected_updated_at: null, p_payload: { nome: "Solo Empresa", descricao: "Descrição preservada", tipo: "solo", unidade_conteudo: "g", b2b_enabled: false } });
  expect(rpcCalls("tenant_product_save")[0].p_payload).not.toHaveProperty("owner_organization_id");
  expect(rpcCalls("tenant_catalog_formulacoes_replace")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  await unitLoaded("g");
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Solo Editado" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await screen.findByText("Solo Editado");
  expect(rpcCalls("tenant_product_save")[1].p_expected_updated_at).toBe(stamp);
  expect(rpcCalls("tenant_product_save")[1].p_payload.unidade_conteudo).toBe("g");
  fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar arquivados" }));
  fireEvent.click(await screen.findByRole("button", { name: "Arquivar" }));
  await screen.findByRole("button", { name: "Reativar" });
  fireEvent.click(screen.getByRole("button", { name: "Reativar" }));
  await screen.findByRole("button", { name: "Arquivar" });
  expect(rpcCalls("tenant_product_set_archived").map(a => a.p_archived)).toEqual([true, false]);
}, 20_000); // fluxo montado completo (criar/editar/arquivar/reativar): o padrão de 5 s estourava sob carga da suíte inteira
it.each(["financeiro", "consultor_tecnico", "parceiro_b2b", "parceiro_b2b_tecnico", "superadmin"])("%s não recebe CRUD próprio nem bypass global", role => {
  state.roles = [role]; client(); const { result } = renderHook(useTenantCatalogEditor, { wrapper });
  expect(result.current.canEdit).toBe(false);
  expect(rpcCalls("tenant_product_save")).toHaveLength(0);
  expect(getAccessLevel("superadmin", "/base-tecnica")).toBe("none");
  expect(getAccessLevel("financeiro", "/base-tecnica")).toBe("r");
  expect(isPathEntitled("/base-tecnica?tab=produtos", { status: "ready", features: new Set() })).toBe(false);
});
it("Financeiro conserva consulta via redirect e link fiscal, sem CRUD ou abas irmãs", async () => {
  state.roles = ["financeiro"]; const qc = client();
  state.rows = [{ id: "p1", nome: "Produto financeiro", tipo: "solo", ativo: true, updated_at: stamp, owner_organization_id: "org-A" }];
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/configuracoes/produtos?busca=solo&tab=culturas#p1"]}><Routes>
    <Route path="/configuracoes/produtos" element={<ProdutosEmpresa />} />
    <Route path="/base-tecnica" element={<Protocolos />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByText("Produto financeiro");
  // A única aba principal continua Produtos; subabas são apenas filtros da mesma consulta autorizada.
  expect(screen.getAllByRole("tab").filter(tab => ["Produtos", "Microrganismos", "Catálogo Técnico", "Culturas", "Problemas"].includes(tab.textContent ?? ""))).toHaveLength(1);
  expect(screen.getByRole("tab", { name: "Produtos" }).getAttribute("aria-selected")).toBe("true");
  for (const name of ["Novo produto", "Editar", "Arquivar", "Reativar"]) expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.getByRole("link", { name: "Perfis fiscais" }).getAttribute("href")).toBe("/configuracoes/fiscal/produtos");
  expect(rpcCalls("tenant_product_list")).toHaveLength(1);
  for (const name of ["tenant_product_save", "tenant_product_set_archived", "tenant_catalog_root_save", "rpc_associate_microorganism_fiscal_product"]) expect(rpcCalls(name)).toHaveLength(0);
  const catalogue = navigation.find(item => item.id === "protocolos");
  expect(searchNavItems(catalogue ? [catalogue] : [], "", "financeiro").map(item => item.id)).toEqual(["protocolos", "protocolos-produtos"]);
  expect(getAccessLevel("financeiro", "/configuracoes/fiscal/produtos")).toBe("rw"); // Existing fiscal route only, not product CRUD.
});
it.each(["microrganismos", "catalogo-tecnico", "culturas", "problemas", "fichas", "desconhecida", "produtos&tab=culturas"])("Financeiro não monta aba %s por URL direta", async tab => {
  state.roles = ["financeiro"]; const qc = client();
  expect(canAccess("financeiro", `/base-tecnica?tab=${tab}`)).toBe(false);
  expect(getAccessLevel("gestor", "/base-tecnica?tab=produtos")).toBe("rw");
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[`/base-tecnica?tab=${tab}`]}><Routes>
    <Route path="/base-tecnica" element={<Protocolos />} />
    <Route path="/sem-permissao" element={<output>Acesso bloqueado</output>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByText("Acesso bloqueado");
  expect(state.fetch).not.toHaveBeenCalled();
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
    // Expectativa revisada 03/11: recusa explícita do servidor passa a ser classificada como definitiva (não incerta).
    expect(output.compositionError).toMatch(/Produto salvo; o servidor recusou a composição/);
    expect(output.compositionFailure).toBe("definitive");
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

it("ficha técnica lê versão real, salva conteúdo por CAS e nunca promove status", async () => {
  client(); const profile = { id: "f1", produto_id: "p1", updated_at: stamp, status_validacao: "rascunho", resumo_curto: "Antes" };
  state.fetch.mockImplementation(async url => {
    if (String(url).endsWith("/rpc/tenant_catalog_root_save")) return json({ ok: true, id: "f1", updated_at: stamp, replayed: false });
    if (String(url).includes("/product_technical_profiles?")) return json(profile);
    return json([]);
  });
  const { result } = renderHook(() => ({ read: useProductProfile("p1"), save: useUpsertProductProfile() }), { wrapper });
  await waitFor(() => expect(result.current.read.isSuccess).toBe(true));
  await act(async () => { await result.current.save.mutateAsync({ produto_id: "p1", resumo_curto: "Depois", status_validacao: "rascunho" }); });
  expect(rpcCalls("tenant_catalog_root_save")[0]).toMatchObject({ p_root: "product_technical_profiles", p_id: "f1", p_expected_updated_at: stamp, p_payload: { resumo_curto: "Depois" } });
  expect(rpcCalls("tenant_catalog_root_save")[0].p_payload).not.toHaveProperty("status_validacao");
  await act(async () => { await expect(result.current.save.mutateAsync({ produto_id: "p1", status_validacao: "aprovado" })).rejects.toThrow(/Mudança de status/); });
  expect(rpcCalls("tenant_catalog_root_save")).toHaveLength(1);
});
it("composição incerta conserva ambas as chaves e CAS para reconciliação explícita", async () => {
  client(); let failures = 1;
  state.fetch.mockImplementation(async url => {
    if (String(url).endsWith("tenant_product_save")) return json(ack);
    if (failures-- > 0) throw new Error("Resposta perdida");
    return json({ ok: true, produto_id: "p1", updated_at: stamp, items: 1 });
  });
  const { result } = renderHook(useSaveTenantProduct, { wrapper });
  const input = { id: "p1", expectedUpdatedAt: stamp, draft: { nome: "Solo" }, composition: [{ microrganismo_id: "m1", volume_ml: 200 }] };
  await act(async () => { expect((await result.current.mutateAsync(input)).compositionError).toBeTruthy(); });
  expect(state.fetch).toHaveBeenCalledTimes(2);
  await act(async () => { expect((await result.current.mutateAsync(input)).compositionError).toBeUndefined(); });
  const saves = rpcCalls("tenant_product_save"), compositions = rpcCalls("tenant_catalog_formulacoes_replace");
  expect(saves[0].p_idempotency_key).toBe(saves[1].p_idempotency_key);
  expect(compositions[0]).toEqual(compositions[1]);
});
it("parcial montado mantém diálogo e input congelados; retry exato não cria outra raiz", async () => {
  client(); let attempts = 0; state.unitCap = "positive";
  state.rows = [{ id: "p1", nome: "Produto existente", tipo: "solo", unidade_conteudo: "kg", ativo: true, b2b_enabled: false, e_insumo: false, updated_at: stamp, owner_organization_id: "org-A" }];
  state.fetch.mockImplementation(async (url, init) => {
    const name = String(url).split("/rpc/")[1];
    if (name === "tenant_product_list") return json(state.rows);
    if (name === "tenant_product_save") return json(ack);
    if (name === "tenant_catalog_formulacoes_replace") {
      if (++attempts === 1) throw new Error("ACK perdido");
      return json({ ok: true, produto_id: "p1", updated_at: stamp, items: 0 });
    }
    if (name) throw new Error(`RPC antigo inesperado: ${name}`);
    if (String(url).includes("/formulacoes?")) return json([{ id: "f1", produto_id: "p1", microrganismo_id: "m1", component_insumo_id: null, volume_ml: 100, e_volume_fixo: false }]);
    return json([]);
  });
  render(<ProdutosTab />, { wrapper });
  await screen.findByText("Produto existente");
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  await unitLoaded("kg");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Composição" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("button", { name: "Remover componente" }));
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await screen.findByRole("button", { name: "Reconciliar composição" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Identificação" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("composição não confirmada");
  expect(rpcCalls("tenant_product_save")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reconciliar composição" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(rpcCalls("tenant_product_save")[0]).toEqual(rpcCalls("tenant_product_save")[1]);
  expect(rpcCalls("tenant_product_save")[1].p_product_id).toBe("p1");
  expect(rpcCalls("tenant_catalog_formulacoes_replace")[0]).toEqual(rpcCalls("tenant_catalog_formulacoes_replace")[1]);
  expect(state.rows).toHaveLength(1);
});
// "recusa definitiva" foi movida para o teste dedicado de saída segura (não oferece mais replay idêntico).
it.each(["resposta perdida"])("novo produto com %s da composição mantém ACK/componentes e replay único", async failure => {
  client(); state.unitCap = "positive"; let attempts = 0; let compositionCommits = 0; const compositionReceipts = new Set<string>(); const receipts = new Map<string, typeof ack>();
  state.fetch.mockImplementation(async (url, init) => {
    const name = String(url).split("/rpc/")[1];
    if (name === "tenant_product_list") return json(state.rows);
    if (name === "tenant_product_save") {
      const args = JSON.parse(init.body);
      if (!receipts.has(args.p_idempotency_key)) {
        receipts.set(args.p_idempotency_key, ack);
        state.rows.push({ id: "p1", owner_organization_id: "org-A", ativo: true, updated_at: stamp, ...args.p_payload });
      }
      return json(receipts.get(args.p_idempotency_key));
    }
    if (name === "tenant_catalog_formulacoes_replace") {
      const args = JSON.parse(init.body);
      if (++attempts === 1) {
        if (failure === "recusa definitiva") return json({ code: "42501", message: "tenant_catalog_ref_foreign" }, 403);
        compositionReceipts.add(args.p_idempotency_key); compositionCommits++;
        throw new Error("ACK perdido após composição");
      }
      if (!compositionReceipts.has(args.p_idempotency_key)) { compositionReceipts.add(args.p_idempotency_key); compositionCommits++; }
      return json({ ok: true, produto_id: "p1", updated_at: stamp, items: 1 });
    }
    if (name) throw new Error(`RPC inesperada ${name}`);
    if (String(url).includes("/microrganismos?")) return json([{ id: "m1", nome: "Bacillus preservado", codigo: "BIO-1", dose_ml_ha: 200 }]);
    return json([]);
  });
  render(<ProdutosTab />, { wrapper });
  await screen.findByText("Nenhum produto encontrado");
  fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Novo parcial" } });
  await chooseUnit("ml");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Composição" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("button", { name: "+ Microrganismo" }));
  fireEvent.click(screen.getByRole("combobox", { name: "" }));
  fireEvent.click(await screen.findByRole("option", { name: /Bacillus preservado/ }));
  fireEvent.keyDown(screen.getByRole("option", { name: /Bacillus preservado/ }), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await screen.findByRole("button", { name: "Reconciliar composição" });
  expect(screen.getByRole("alert").textContent).toContain("p1");
  expect(screen.getByRole("alert").textContent).toContain(stamp);
  expect(screen.getByRole("alert").textContent).toContain("Bacillus preservado · 200 mL");
  expect(screen.getByRole("button", { name: "Remover componente" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("tab", { name: "Identificação" }).matches(":disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Remover componente" }));
  expect(screen.getByRole("alert").textContent).toContain("Bacillus preservado · 200 mL");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(rpcCalls("tenant_product_save")).toHaveLength(1);
  expect(state.rows).toHaveLength(1);
  expect(compositionCommits).toBe(failure === "resposta perdida" ? 1 : 0);
  fireEvent.click(screen.getByRole("button", { name: "Reconciliar composição" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(rpcCalls("tenant_product_save")[0]).toEqual(rpcCalls("tenant_product_save")[1]);
  expect(rpcCalls("tenant_catalog_formulacoes_replace")[0]).toEqual(rpcCalls("tenant_catalog_formulacoes_replace")[1]);
  expect(state.rows).toHaveLength(1);
  expect(compositionCommits).toBe(1);
});
it("composição pendente bloqueia alteração de rascunho/novo INSERT antes de REST, mas permite replay exato", async () => {
  client(); let attempts = 0;
  state.fetch.mockImplementation(async url => {
    if (String(url).endsWith("tenant_product_save")) return json(ack);
    if (++attempts === 1) throw new Error("ACK perdido");
    return json({ ok: true, produto_id: "p1", updated_at: stamp, items: 1 });
  });
  const { result } = renderHook(useSaveTenantProduct, { wrapper });
  const input = { id: null, expectedUpdatedAt: null, draft: { nome: "Novo parcial", tipo: "solo", unidade_conteudo: "ml" } as never, composition: [{ microrganismo_id: "m1", volume_ml: 200, concentracao: 3, unidade: "mL" }] };
  await act(async () => { expect((await result.current.mutateAsync(input)).compositionError).toBeTruthy(); });
  const calls = state.fetch.mock.calls.length;
  await act(async () => {
    await expect(result.current.mutateAsync({ ...input, draft: { nome: "Outra intenção", tipo: "solo", unidade_conteudo: "ml" } as never })).rejects.toThrow(/Reconcilie/);
    await expect(result.current.mutateAsync({ ...input, composition: [{ microrganismo_id: "m2", volume_ml: 300 }] })).rejects.toThrow(/Reconcilie/);
  });
  expect(state.fetch).toHaveBeenCalledTimes(calls);
  await act(async () => { expect((await result.current.mutateAsync(input)).compositionError).toBeUndefined(); });
  expect(rpcCalls("tenant_product_save")[0]).toEqual(rpcCalls("tenant_product_save")[1]);
  expect(rpcCalls("tenant_catalog_formulacoes_replace")[0]).toEqual(rpcCalls("tenant_catalog_formulacoes_replace")[1]);
});
it("CAS recusado não chama composição, não repete e não invalida", async () => {
  const qc = client(); state.fetch.mockResolvedValue(json({ code: "PT409", message: "version_conflict" }, 409));
  const invalidate = vi.spyOn(qc, "invalidateQueries"); const { result } = renderHook(useSaveTenantProduct, { wrapper });
  await act(async () => { await expect(result.current.mutateAsync({ id: "p1", expectedUpdatedAt: stamp, draft: { nome: "Solo" }, composition: [] })).rejects.toThrow(/alterado por outra pessoa/); });
  expect(state.fetch).toHaveBeenCalledTimes(1); expect(invalidate).not.toHaveBeenCalled();
});
it("ACK produto atrasado após ABA não despacha composição nem invalida outra conta", async () => {
  const qc = client(); let release: (response: Response) => void = () => {};
  state.fetch.mockImplementation(() => new Promise<Response>(r => { release = r; }));
  const invalidate = vi.spyOn(qc, "invalidateQueries"); const { result, rerender } = renderHook(useSaveTenantProduct, { wrapper });
  let pending: Promise<unknown> = Promise.resolve();
  act(() => { pending = result.current.mutateAsync({ id: "p1", expectedUpdatedAt: stamp, draft: { nome: "Solo" }, composition: [] }).catch(e => e); });
  await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
  state.actor = "B"; state.tenant = "org-B"; state.epoch++; rerender();
  state.actor = "A"; state.tenant = "org-A"; state.epoch++; rerender();
  await act(async () => { release(json(ack)); expect((await pending as Error).message).toBe("catalog_context_changed"); });
  expect(rpcCalls("tenant_catalog_formulacoes_replace")).toHaveLength(0); expect(invalidate).not.toHaveBeenCalled();
});
it("invalidação atinge só leitores do ator atual, nunca financeiro ou outra empresa", async () => {
  const qc = client(); state.fetch.mockResolvedValue(json(ack));
  const { result } = renderHook(() => ({ actor: useTenantCatalogEditor(), save: useSaveTenantProduct() }), { wrapper });
  const actorScope = result.current.actor.scope.replace("tenant-catalog-editor", "portal-query-actor");
  const prefixes = ["tenant-products", "tenant-product-details", "catalogo-unificado", "catalogo-volumes", "catalogo-tecnico", "partner-catalog-secure", "partner-catalog-tecnico", "estoque_produto"];
  prefixes.forEach(p => { qc.setQueryData([p, actorScope, "request-A"], []); qc.setQueryData([p, "foreign", "request-B"], []); });
  qc.setQueryData(["receivables", actorScope, "request-A"], []);
  const deliveryScope = actorScope.replace("portal-query-actor", "entregas-operations");
  ["entregas", "estoque-prontos-entrega", "todas-os-disponiveis"].forEach(p => { qc.setQueryData([p, deliveryScope, deliveryScope], []); qc.setQueryData([p, "foreign", "foreign"], []); });
  await act(async () => { await result.current.save.mutateAsync({ id: "p1", expectedUpdatedAt: stamp, draft: { nome: "Solo" } }); });
  prefixes.forEach(p => { expect(qc.getQueryState([p, actorScope, "request-A"])?.isInvalidated).toBe(true); expect(qc.getQueryState([p, "foreign", "request-B"])?.isInvalidated).toBe(false); });
  expect(qc.getQueryState(["receivables", actorScope, "request-A"])?.isInvalidated).toBe(false);
  ["entregas", "estoque-prontos-entrega", "todas-os-disponiveis"].forEach(p => { expect(qc.getQueryState([p, deliveryScope, deliveryScope])?.isInvalidated).toBe(true); expect(qc.getQueryState([p, "foreign", "foreign"])?.isInvalidated).toBe(false); });
});
function mountNewProductFlow(opts: { composition: () => Response | Promise<Response>; failListAfterPartial?: number }) {
  state.unitCap = "positive";
  const receipts = new Map<string, typeof ack>(); const ctl = { failList: 0, partial: false, inserts: 0 };
  state.fetch.mockImplementation(async (url, init) => {
    const name = String(url).split("/rpc/")[1];
    if (name === "tenant_product_list") {
      if (ctl.partial && ctl.failList > 0) { ctl.failList--; return json({ code: "XX000", message: "read_failed" }, 500); }
      return json(state.rows);
    }
    if (name === "tenant_product_save") {
      const args = JSON.parse(init.body);
      if (!receipts.has(args.p_idempotency_key)) {
        if (args.p_product_id === null) {
          ctl.inserts++; state.rows.push({ id: "p1", owner_organization_id: state.tenant, ativo: true, tipo: "solo", updated_at: stamp, ...args.p_payload });
          receipts.set(args.p_idempotency_key, ack);
        } else {
          expect(args.p_expected_updated_at).toBe(state.rows[0].updated_at);
          Object.assign(state.rows[0], args.p_payload, { updated_at: "2026-11-03T02:00:00Z" });
          receipts.set(args.p_idempotency_key, { product_id: "p1", updated_at: "2026-11-03T02:00:00Z", replayed: false });
        }
      }
      return json(receipts.get(args.p_idempotency_key));
    }
    if (name === "tenant_catalog_formulacoes_replace") { ctl.partial = true; ctl.failList = opts.failListAfterPartial ?? 0; return opts.composition(); }
    if (name) throw new Error(`RPC inesperada ${name}`);
    if (String(url).includes("/microrganismos?")) return json([{ id: "m1", nome: "Bacillus preservado", codigo: "BIO-1", dose_ml_ha: 200 }]);
    return json([]);
  });
  return ctl;
}
async function submitNewWithComponent() {
  const view = render(<ProdutosTab />, { wrapper });
  await screen.findByText("Nenhum produto encontrado");
  fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Novo parcial" } });
  await chooseUnit("ml");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Composição" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("button", { name: "+ Microrganismo" }));
  fireEvent.click(screen.getByRole("combobox", { name: "" }));
  fireEvent.click(await screen.findByRole("option", { name: /Bacillus preservado/ }));
  fireEvent.keyDown(screen.getByRole("option", { name: /Bacillus preservado/ }), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  return view;
}

it("recusa definitiva persistente: sem replay inútil, rascunho exportável e volta ao MESMO produto após leitura fresca", async () => {
  client();
  const ctl = mountNewProductFlow({ composition: () => json({ code: "42501", message: "tenant_catalog_ref_foreign" }, 403) });
  await submitNewWithComponent();
  const back = await screen.findByRole("button", { name: "Reconhecer e voltar à edição" });
  expect(screen.queryByRole("button", { name: "Reconciliar composição" })).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("recusou esta composição de forma definitiva");
  expect(screen.getByRole("alert").textContent).toContain("p1");
  const exported = JSON.parse((screen.getByLabelText("Rascunho exportável") as HTMLTextAreaElement).value);
  expect(exported).toMatchObject({ produto_id: "p1", versao_confirmada_produto: stamp, resultado_composicao: "recusada_pelo_servidor",
    composicao_rascunho: [{ microrganismo_id: "m1", volume_ml: 200, nome: "Bacillus preservado" }] });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  // 1ª leitura fresca falha: nada é reconhecido, estado parcial e ID preservados.
  await waitFor(() => expect(state.fetch.mock.calls.filter(([u]) => String(u).endsWith("tenant_product_list")).length).toBeGreaterThan(1));
  const listsBefore = state.fetch.mock.calls.filter(([u]) => String(u).endsWith("tenant_product_list")).length;
  ctl.failList = 1;
  fireEvent.click(back);
  await waitFor(() => expect(state.fetch.mock.calls.filter(([u]) => String(u).endsWith("tenant_product_list")).length).toBe(listsBefore + 1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Reconhecer e voltar à edição" }).matches(":disabled")).toBe(false));
  expect(screen.getByRole("alert").textContent).toContain("p1");
  expect(screen.getByLabelText("Rascunho exportável")).toBeTruthy();
  // 2ª leitura confirma o produto: edição do MESMO produto com versão fresca.
  fireEvent.click(screen.getByRole("button", { name: "Reconhecer e voltar à edição" }));
  await screen.findByRole("heading", { name: "Editar produto" });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Identificação" }), { button: 0, ctrlKey: false });
  expect(((await screen.findByLabelText("Nome Comercial *")) as HTMLInputElement).value).toBe("Novo parcial");
  expect(screen.getByLabelText("Rascunho exportável")).toBeTruthy();
  // Regressão: a unidade canônica de p1 (já em cache desde o ACK parcial) é reidratada sem nova escolha manual.
  await unitLoaded("mL");
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Novo parcial revisado" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const saves = rpcCalls("tenant_product_save");
  expect(saves).toHaveLength(2);
  expect(saves[1]).toMatchObject({ p_product_id: "p1", p_expected_updated_at: stamp });
  expect(saves[1].p_idempotency_key).not.toBe(saves[0].p_idempotency_key);
  expect(rpcCalls("tenant_catalog_formulacoes_replace")).toHaveLength(1);
  expect(ctl.inserts).toBe(1); expect(state.rows).toHaveLength(1);
  expect(state.rows[0].nome).toBe("Novo parcial revisado");
  expect(saves[1].p_payload.unidade_conteudo).toBe("ml");
});

it("resposta perdida: saída explícita mantém pendência/chaves, bloqueia novas intenções e retomada faz replay único", async () => {
  client(); let attempts = 0; let commits = 0; const keys = new Set<string>();
  const ctl = mountNewProductFlow({ composition: async () => {
    const args = rpcCalls("tenant_catalog_formulacoes_replace").at(-1);
    if (!keys.has(args.p_idempotency_key)) { keys.add(args.p_idempotency_key); commits++; }
    if (++attempts === 1) throw new Error("ACK perdido");
    return json({ ok: true, produto_id: "p1", updated_at: stamp, items: 1 });
  } });
  await submitNewWithComponent();
  await screen.findByRole("button", { name: "Reconciliar composição" });
  expect(screen.queryByRole("button", { name: "Reconhecer e voltar à edição" })).toBeNull();
  expect(JSON.parse((screen.getByLabelText("Rascunho exportável") as HTMLTextAreaElement).value).resultado_composicao).toBe("nao_confirmada");
  fireEvent.click(screen.getByRole("button", { name: "Sair mantendo pendência" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("status").textContent).toContain("p1");
  expect(screen.getByRole("button", { name: "Novo produto" }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Editar" }).matches(":disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retomar reconciliação" }));
  await screen.findByRole("button", { name: "Reconciliar composição" });
  expect(screen.getByRole("alert").textContent).toContain("Bacillus preservado · 200 mL");
  fireEvent.click(screen.getByRole("button", { name: "Reconciliar composição" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(rpcCalls("tenant_product_save")[0]).toEqual(rpcCalls("tenant_product_save")[1]);
  expect(rpcCalls("tenant_catalog_formulacoes_replace")[0]).toEqual(rpcCalls("tenant_catalog_formulacoes_replace")[1]);
  expect(ctl.inserts).toBe(1); expect(commits).toBe(1); expect(state.rows).toHaveLength(1);
  expect(screen.queryByRole("status")).toBeNull();
});

it("troca de escopo descarta rascunho/exportação pendentes sem reutilizar em outro tenant", async () => {
  client();
  mountNewProductFlow({ composition: async () => { throw new Error("ACK perdido"); } });
  const view = await submitNewWithComponent();
  await screen.findByRole("button", { name: "Reconciliar composição" });
  fireEvent.click(screen.getByRole("button", { name: "Sair mantendo pendência" }));
  await screen.findByRole("button", { name: "Retomar reconciliação" });
  const savesBefore = rpcCalls("tenant_product_save").length;
  state.tenant = "org-B"; state.epoch = 1; state.rows = [];
  view.rerender(<ProdutosTab />); // mesma montagem: o efeito de escopo deve limpar o estado retido
  await waitFor(() => expect(screen.queryByRole("button", { name: "Retomar reconciliação" })).toBeNull());
  expect(screen.queryByRole("button", { name: "Retomar reconciliação" })).toBeNull();
  expect(screen.queryByLabelText("Rascunho exportável")).toBeNull();
  expect(screen.getByRole("button", { name: "Novo produto" }).matches(":disabled")).toBe(false);
  expect(rpcCalls("tenant_product_save")).toHaveLength(savesBefore);
});

it.each(["absent", "denied"] as const)("capability de unidade %s mantém cadastro fechado com zero dispatch", async mode => {
  state.unitCap = mode; client(); render(<ProdutosTab />, { wrapper });
  await screen.findByText("Nenhum produto encontrado");
  fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Sem capability" } });
  await screen.findByText("Não foi possível confirmar a unidade do produto.");
  expect(screen.getByLabelText("Unidade do produto *").matches(":disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await new Promise(r => setTimeout(r, 50));
  expect(state.unitCalls).toEqual(["tenant_product_unit_capability_v1"]);
  for (const name of ["tenant_product_save", "tenant_catalog_formulacoes_replace", "tenant_catalog_root_save"]) expect(rpcCalls(name)).toHaveLength(0);
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("capability positiva sem unidade escolhida não despacha cadastro", async () => {
  state.unitCap = "positive"; client(); render(<ProdutosTab />, { wrapper });
  await screen.findByText("Nenhum produto encontrado");
  fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Sem unidade" } });
  await waitFor(() => expect(screen.getByLabelText("Unidade do produto *").matches(":disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await new Promise(r => setTimeout(r, 50));
  expect(rpcCalls("tenant_product_save")).toHaveLength(0);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect((screen.getByLabelText("Nome Comercial *") as HTMLInputElement).value).toBe("Sem unidade");
});
it("Financeiro em consulta não consulta capability de unidade nem apresentações", async () => {
  state.roles = ["financeiro"]; state.unitCap = "positive"; client();
  state.rows = [{ id: "p1", nome: "Produto consulta", tipo: "solo", unidade_conteudo: "kg", ativo: true, updated_at: stamp, owner_organization_id: "org-A" }];
  render(<ProdutosTab />, { wrapper });
  await screen.findByText("Produto consulta");
  expect(screen.queryByRole("button", { name: "Novo produto" })).toBeNull();
  expect(state.unitCalls).toHaveLength(0);
});

it("unidade canônica: A→B, fechar/reabrir com cache, escolha do usuário sobrevive a refetch e novo produto vazio", async () => {
  state.unitCap = "positive"; const qc = client();
  state.rows = [
    { id: "pa", nome: "Produto A", tipo: "solo", unidade_conteudo: "kg", ativo: true, b2b_enabled: false, e_insumo: false, updated_at: stamp, owner_organization_id: "org-A" },
    { id: "pb", nome: "Produto B", tipo: "solo", unidade_conteudo: "g", ativo: true, b2b_enabled: false, e_insumo: false, updated_at: stamp, owner_organization_id: "org-A" },
    { id: "px", nome: "Produto outra empresa", tipo: "solo", unidade_conteudo: "l", ativo: true, updated_at: stamp, owner_organization_id: "org-B" },
  ];
  state.fetch.mockImplementation(async (url, init) => {
    const name = String(url).split("/rpc/")[1];
    if (name === "tenant_product_list") return json(state.rows.filter(r => r.owner_organization_id === state.tenant));
    if (name === "tenant_product_save") { const a = JSON.parse(init.body); return json({ product_id: a.p_product_id, updated_at: stamp, replayed: false }); }
    if (name) throw new Error(`RPC inesperada ${name}`);
    return json([]);
  });
  render(<ProdutosTab />, { wrapper });
  const edit = async (nome: string) => {
    const row = (await screen.findByText(nome)).closest("tr") as HTMLElement;
    fireEvent.click(row.querySelector('button[aria-label="Editar"], button[title="Editar"]') ?? screen.getAllByRole("button", { name: "Editar" })[nome === "Produto A" ? 0 : 1]);
    await waitFor(() => expect((screen.getByLabelText("Nome Comercial *") as HTMLInputElement).value).toBe(nome));
  };
  const close = async () => { fireEvent.click(screen.getByRole("button", { name: "Close" })); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); };
  await edit("Produto A"); await unitLoaded("kg"); await close();
  await edit("Produto A"); await unitLoaded("kg"); await close(); // mesmo produto, mesma chave em cache
  await edit("Produto B"); await unitLoaded("g"); await close();
  const readsBefore = state.unitCalls.filter(n => n === "solid_pack_offers_admin_v1").length;
  await edit("Produto A"); await unitLoaded("kg"); // cache estável: hidrata sem depender de nova leitura
  expect(screen.queryByText("Produto outra empresa")).toBeNull();
  // escolha do usuário (rascunho sujo) não é sobrescrita por refetch com valor diferente
  await chooseUnit("l");
  state.rows[0].unidade_conteudo = "g";
  await act(async () => { await qc.invalidateQueries({ predicate: q => q.queryKey[0] === "product-packaging-admin" }); });
  await waitFor(() => expect(state.unitCalls.filter(n => n === "solid_pack_offers_admin_v1").length).toBeGreaterThan(readsBefore));
  expect(screen.getByLabelText("Unidade do produto *").textContent).toBe("L");
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await waitFor(() => expect(rpcCalls("tenant_product_save")).toHaveLength(1));
  expect(rpcCalls("tenant_product_save")[0]).toMatchObject({ p_product_id: "pa", p_expected_updated_at: stamp, p_payload: { unidade_conteudo: "l" } });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // reabrir A sem escolha manual hidrata a unidade canônica atual e salva o MESMO produto/CAS
  await edit("Produto A"); await unitLoaded("g");
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await waitFor(() => expect(rpcCalls("tenant_product_save")).toHaveLength(2));
  expect(rpcCalls("tenant_product_save")[1]).toMatchObject({ p_product_id: "pa", p_expected_updated_at: stamp, p_payload: { unidade_conteudo: "g" } });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // novo produto continua vazio/obrigatório
  fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
  await waitFor(() => expect(screen.getByLabelText("Unidade do produto *").matches(":disabled")).toBe(false));
  expect(screen.getByLabelText("Unidade do produto *").textContent).toBe("kg, g, mL ou L");
  fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Novo sem unidade" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
  await new Promise(r => setTimeout(r, 50));
  expect(rpcCalls("tenant_product_save")).toHaveLength(2);
}, 20_000);
