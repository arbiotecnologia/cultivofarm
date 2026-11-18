import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const AR = "org-ar"; const FSF = "org-fsf";
const db = { rows: [] as Array<Record<string, unknown>>, calls: [] as string[], seq: 0, readDelay: null as Promise<void> | null,
  writes: [] as Array<Record<string, unknown>>, writeDelay: null as Promise<void> | null, failComposition: false, uncertain: false,
  receipts: new Map<string, unknown>(), unitCapability: "positive" as "positive" | "absent" | "denied" };
const auth = { user: { id: "u-ar" }, profile: { user_id: "u-ar", organization_id: AR, ativo: true }, loading: false, roles: ["administrador"] };
const toastFns = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastFns }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/catalogo/tenantCatalogOwnership", async (orig) => ({ ...(await orig<object>()), TENANT_OWNED_CATALOG_ENABLED: true }));

function query(table: string) {
  const data = table === "culturas" ? [{ id: "g-soja", nome: "Soja", descricao: "global", ativo: true, owner_organization_id: null }] : [];
  const b: Record<string, unknown> = { select: () => b, is: () => b, limit: () => b, not: () => b, order: () => b, eq: () => b, in: () => b, abortSignal: () => b,
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok) };
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: query, rpc: (fn: string, args: Record<string, unknown>) => {
  const run = async () => {
    db.calls.push(fn);
    // Contrato PRODUCT_UNIT_V2 explícito: capability positiva só onde o cenário declara; unidade vem do próprio produto.
    if (fn === "tenant_product_unit_capability_v1") {
      if (db.unitCapability === "absent") return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      if (db.unitCapability === "denied") return { data: null, error: { code: "42501", message: "forbidden" } };
      return { data: { contract: "PRODUCT_UNIT_V2", writer: "tenant_product_save", units: ["kg", "g", "ml", "l"] }, error: null };
    }
    if (fn === "solid_pack_offers_admin_v1") {
      const row = db.rows.find(r => r.id === args.p_product && r.owner_organization_id === auth.profile.organization_id);
      if (!row) return { data: null, error: { code: "P0002", message: "not_found" } };
      return { data: { contract: "SOLID_PACK_ADMIN_V1", product_id: row.id, config_version: 0, unidade_conteudo: row.unidade_conteudo ?? null, offers: [] }, error: null };
    }
    if (fn === "tenant_product_list") return { data: structuredClone(db.rows.filter(r => r.entity === "produto" && r.owner_organization_id === auth.profile.organization_id && (args.p_include_archived || r.ativo))), error: null };
    if (fn === "tenant_product_save") {
      db.writes.push(args);
      const row = db.rows.find(r => r.id === args.p_product_id);
      if (!row || row.owner_organization_id !== auth.profile.organization_id) return { data: null, error: { code: "P0002", message: "not_found" } };
      Object.assign(row, args.p_payload); row.updated_at = "2026-11-03T02:00:00Z";
      return { data: { product_id: row.id, updated_at: row.updated_at, replayed: false }, error: null };
    }
    if (fn === "tenant_catalog_owned_list") {
      const scopeAtRead = auth.profile.organization_id;
      if (db.readDelay) await db.readDelay;
      const archived = args.p_include_archived as boolean;
      return { data: { items: db.rows.filter((r) => r.entity === args.p_entity_type && r.owner_organization_id === scopeAtRead && (archived || !r.archived_at)), has_more: false }, error: null };
    }
    if (fn === "tenant_catalog_owned_detail") {
      const item = db.rows.find((r) => r.id === args.p_entity_id && r.owner_organization_id === auth.profile.organization_id);
      return item ? { data: { item, presentations: [], has_more: false }, error: null } : { data: null, error: { message: "catalog_owned_not_found" } };
    }
    if (fn === "tenant_catalog_owned_mutate") {
      const actorAtWrite = auth.profile.organization_id;
      db.writes.push(args);
      if (db.writeDelay) await db.writeDelay;
      const replay = db.receipts.get(String(args.p_idempotency_key));
      if (replay) return { data: replay, error: null };
      const payload = args.p_payload as Record<string, unknown>;
      if (payload.composition && db.failComposition) return { data: null, error: { message: "catalog_owned_invalid_payload" } };
      if (payload.nome === "SOJA") return { data: null, error: { message: "catalog_owned_duplicate_global_active", details: "11111111-1111-4111-8111-111111111111" } };
      let row = db.rows.find((r) => r.id === args.p_entity_id);
      if (args.p_operation === "create") { row = { id: `own-${++db.seq}`, ativo: true, archived_at: null, owner_organization_id: AR, entity: args.p_entity_type, ...payload }; db.rows.push(row); }
      if (!row || row.owner_organization_id !== actorAtWrite) return { data: null, error: { code: "42501", message: "catalog_owned_not_found" } };
      if (args.p_operation === "update") Object.assign(row, payload);
      if (payload.composition) {
        const composition = payload.composition as { status: string; itens: unknown[] };
        Object.assign(row, { composition_status: composition.status, declarations: composition.itens });
      }
      if (args.p_operation === "archive") Object.assign(row, { ativo: false, archived_at: "2026-10-15T00:00:00Z" });
      if (args.p_operation === "restore") Object.assign(row, { ativo: true, archived_at: null });
      row.updated_at = `2026-10-15T00:00:0${++db.seq}Z`;
      const receipt = { id: row.id, updated_at: row.updated_at, origin: "proprio", idempotency_key: args.p_idempotency_key, replayed: false };
      db.receipts.set(String(args.p_idempotency_key), receipt);
      if (db.uncertain) { db.uncertain = false; return { data: null, error: { message: "network_uncertain" } }; }
      return { data: receipt, error: null };
    }
    return { data: [], error: null };
  };
  const p = run(); return Object.assign(p, { abortSignal: () => p });
} } }));

import { ProdutosTab } from "@/components/protocolos/ProdutosTab";
import { MicrorganismosTab } from "@/components/protocolos/MicrorganismosTab";
// A aba Culturas passou a montar TenantReferencePanel (61ed3992f, coberto em catalogReferences.realClient.test.tsx);
// estes cenários seguem exercitando o fluxo próprio legado e seus fences de escrita, sem alterar asserções.
import { LegacyCulturasTab as CulturasTab } from "@/pages/Protocolos";

function requireRow(node: HTMLElement) { const row = node.closest("tr"); if (!row) throw new Error("Linha não encontrada"); return row; }
function app(Component = CulturasTab) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendered = render(<MemoryRouter><QueryClientProvider client={client}><Component /></QueryClientProvider></MemoryRouter>);
  return { ...rendered, client, redraw: () => rendered.rerender(<MemoryRouter><QueryClientProvider client={client}><Component /></QueryClientProvider></MemoryRouter>) };
}
async function submitDialog(name: string, reason = "motivo suficiente") {
  fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}
async function confirm(reason = "motivo suficiente") {
  fireEvent.change(await screen.findByLabelText("Motivo"), { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
}

describe("culturas próprias na aba existente", () => {
  beforeEach(() => {
    Object.assign(db, { rows: [], calls: [], seq: 0, readDelay: null, writes: [], writeDelay: null, failComposition: false, uncertain: false, receipts: new Map(), unitCapability: "positive" });
    Object.assign(auth, { user: { id: "u-ar" }, profile: { user_id: "u-ar", organization_id: AR, ativo: true }, roles: ["administrador"] });
    Object.values(toastFns).forEach((fn) => fn.mockReset());
  });

  it("criar, ver, reabrir/editar, arquivar, ver arquivado e restaurar sem recarregar", async () => {
    app();
    expect(await screen.findByText("Soja")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Cultura própria/ }));
    await submitDialog("Milho Próprio");
    expect(await screen.findByText("Milho Próprio")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Editar item próprio"));
    await waitFor(() => expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Milho Próprio"));
    await submitDialog("Milho Editado");
    expect(await screen.findByText("Milho Editado")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Arquivar item próprio")); await confirm();
    await waitFor(() => expect(screen.queryByText("Milho Editado")).toBeNull());
    fireEvent.click(screen.getByLabelText("Mostrar arquivados"));
    const archived = await screen.findByText("Milho Editado");
    expect(within(requireRow(archived)).getByText("Inativa")).toBeTruthy();
    fireEvent.click(screen.getByTitle("Restaurar item próprio")); await confirm();
    await waitFor(() => expect(within(requireRow(screen.getByText("Milho Editado"))).getByText("Ativa")).toBeTruthy());
    expect(db.calls.filter((c) => c === "tenant_catalog_owned_detail")).toHaveLength(3);
  });

  it("global só oferece ocultar/exibir; não abre edição nem arquivo", async () => {
    app();
    const row = requireRow(await screen.findByText("Soja"));
    expect(within(row).getByRole("button", { name: /Ocultar/ })).toBeTruthy();
    expect(within(row).queryByTitle("Editar item próprio")).toBeNull();
    expect(within(row).queryByTitle("Arquivar item próprio")).toBeNull();
  });

  it("duplicata global localiza o item global e não cria registro", async () => {
    app();
    await screen.findByText("Soja");
    fireEvent.click(screen.getByRole("button", { name: /Cultura própria/ }));
    await submitDialog("SOJA");
    await waitFor(() => expect(toastFns.error).toHaveBeenCalled());
    const [, options] = toastFns.error.mock.calls[0];
    act(() => options.action.onClick());
    expect(db.rows).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Criar cultura própria")).toBeNull());
  });

  it("empresa AR não recebe cultura própria da FSF", async () => {
    db.rows.push({ id: "own-fsf", entity: "cultura", nome: "FSF privada", ativo: true, archived_at: null, owner_organization_id: FSF, updated_at: "2026-10-15T00:00:00Z" });
    app();
    await screen.findByText("Soja");
    await waitFor(() => expect(db.calls).toContain("tenant_catalog_owned_list"));
    expect(screen.queryByText("FSF privada")).toBeNull();
  });

  it("leitura antiga não reaparece após troca de empresa e caches não se misturam", async () => {
    db.rows.push({ id: "ar-only", entity: "cultura", nome: "AR secreta", ativo: true, archived_at: null, owner_organization_id: AR, updated_at: "2026-10-15T00:00:00Z" });
    let release: () => void = () => {};
    db.readDelay = new Promise<void>((resolve) => { release = resolve; });
    const view = app();
    await waitFor(() => expect(db.calls).toContain("tenant_catalog_owned_list"));
    auth.profile = { user_id: "u-fsf", organization_id: FSF, ativo: true }; auth.user = { id: "u-fsf" };
    db.readDelay = null; view.redraw();
    await act(async () => release());
    await screen.findByText("Soja");
    expect(screen.queryByText("AR secreta")).toBeNull();
    await waitFor(() => expect(view.client.getQueryState(["tenant-catalog", FSF, "u-fsf", "owned", "cultura", "list", "", 0, 50, false])?.status).toBe("success"));
    expect(view.client.getQueryData(["tenant-catalog", FSF, "u-fsf", "owned", "cultura", "list", "", 0, 50, false])).toMatchObject({ items: [] });
  });

  it("perfil sem gestão vê próprio sem controles de mutação", async () => {
    db.rows.push({ id: "own-1", entity: "cultura", nome: "Cana Própria", ativo: true, archived_at: null, owner_organization_id: AR, updated_at: "2026-10-15T00:00:00Z" });
    auth.roles = ["financeiro"];
    app();
    expect(await screen.findByText("Cana Própria")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cultura própria/ })).toBeNull();
    expect(screen.queryByTitle("Editar item próprio")).toBeNull();
  });
});


describe("reabrir próprios nas abas Produtos e Microrganismos", () => {
  beforeEach(() => {
    Object.assign(db, { rows: [], calls: [], seq: 0, readDelay: null, writes: [], writeDelay: null, failComposition: false, uncertain: false, receipts: new Map(), unitCapability: "positive" });
    Object.assign(auth, { user: { id: "u-ar" }, profile: { user_id: "u-ar", organization_id: AR, ativo: true }, roles: ["administrador"] });
  });
  it.each([
    ["produto", ProdutosTab, "Produto Local", { tipo: "solo", familia_catalogo: "biologico", classe_catalogo: "biofungicida" }],
    ["microrganismo", MicrorganismosTab, "Micro Local", { tipo: "bacteria", nome_cientifico: "Bacillus declarado" }],
  ] as const)("%s próprio aparece, reabre com detalhe e persiste edição", async (entity, Component, nome, extra) => {
    db.rows.push({ id: "owned-local", entity, nome, descricao: "Descrição fornecida", ativo: true, archived_at: null,
      owner_organization_id: AR, updated_at: "2026-10-15T00:00:00Z", b2b_enabled: false, e_insumo: false, unidade_conteudo: "kg", ...extra });
    app(Component);
    expect(await screen.findByText(nome)).toBeTruthy();
    if (entity === "produto") {
      fireEvent.click(screen.getByRole("button", { name: "Editar" }));
      await waitFor(() => expect((screen.getByLabelText("Nome Comercial *") as HTMLInputElement).value).toBe(nome));
      await waitFor(() => expect(screen.getByLabelText("Unidade do produto *").textContent).toBe("kg"));
      fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: nome + " editado" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
    } else {
      fireEvent.click(screen.getByTitle("Editar item próprio"));
      await waitFor(() => expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe(nome));
      await submitDialog(nome + " editado");
    }
    expect(await screen.findByText(nome + " editado")).toBeTruthy();
    expect(db.rows[0].descricao).toBe("Descrição fornecida");
  });
});

describe("salvamento único de identificação/composição", () => {
  beforeEach(() => {
    Object.assign(db, { rows: [], calls: [], seq: 0, readDelay: null, writes: [], writeDelay: null, failComposition: false, uncertain: false, receipts: new Map(), unitCapability: "positive" });
    Object.assign(auth, { user: { id: "u-ar" }, profile: { user_id: "u-ar", organization_id: AR, ativo: true }, roles: ["administrador"] });
    Object.values(toastFns).forEach((fn) => fn.mockReset());
  });
  async function openDeclared() {
    db.rows.push({ id: "declared", entity: "produto", nome: "Produto declarado", tipo: "solo", familia_catalogo: "quimico", classe_catalogo: "fungicida",
      ativo: true, owner_organization_id: AR, archived_at: null, updated_at: "2026-10-15T00:00:00Z", b2b_enabled: false, e_insumo: false, composition_status: "rascunho", unidade_conteudo: "l",
      declarations: [{ ordem: 1, tipo_componente: "ingrediente_ativo", microrganismo_id: null, componente_nome: "Fornecido", quantidade: 50,
        unidade: "g/L", base: "por_volume_produto", natureza: "concentracao_declarada" }] });
    const view = app(ProdutosTab);
    await screen.findByText("Produto declarado"); fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await waitFor(() => expect((screen.getByLabelText("Nome Comercial *") as HTMLInputElement).value).toBe("Produto declarado"));
    if (db.unitCapability === "positive") await waitFor(() => expect(screen.getByLabelText("Unidade do produto *").textContent).toBe("L"));
    else await waitFor(() => expect(db.calls).toContain("tenant_product_unit_capability_v1"));
    return view;
  }
  it("declaração existente permanece intacta quando só identificação muda", async () => {
    await openDeclared();
    const declarations = JSON.stringify(db.rows[0].declarations);
    fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Identificação alterada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
    await screen.findByText("Identificação alterada");
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].p_payload).not.toHaveProperty("composition");
    expect(JSON.stringify(db.rows[0].declarations)).toBe(declarations);
    expect(db.calls).not.toContain("tenant_catalog_formulacoes_replace");
    expect(db.writes[0].p_expected_updated_at).toBe("2026-10-15T00:00:00Z");
    expect(db.writes[0].p_payload).toMatchObject({ unidade_conteudo: "l" });
  });
  it.each(["absent", "denied"] as const)("capability de unidade %s mantém edição fechada com zero dispatch", async mode => {
    db.unitCapability = mode;
    await openDeclared();
    fireEvent.change(screen.getByLabelText("Nome Comercial *"), { target: { value: "Não deve sair" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith(expect.stringMatching(/Unidade do produto não confirmada/)));
    expect(db.writes).toHaveLength(0);
    expect(db.calls).not.toContain("tenant_product_save");
    expect(db.calls).not.toContain("solid_pack_offers_admin_v1");
    expect(db.rows[0].nome).toBe("Produto declarado");
  });
  it("mudança de composição declarativa incompatível recusa tudo antes do produto, sem salvar parcialmente", async () => {
    await openDeclared();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Composição" }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole("button", { name: /Microrganismo/ })).toBeNull();
    // A química fica consultiva. Mesmo mudar a família não pode contornar
    // a guarda canônica das declarações já existentes.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Identificação" }), { button: 0, ctrlKey: false });
    const family=screen.getByRole("combobox",{name:"Família"}).parentElement?.querySelector("select");
    if(!family)throw new Error("Família sem seletor");
    fireEvent.change(family,{target:{value:"biologico"}});
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Composição" }), { button: 0, ctrlKey: false });
    await screen.findByText(/Composição declarativa preservada;/);
    fireEvent.click(screen.getByRole("button", { name: /Microrganismo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar Produto" }));
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith(expect.stringMatching(/nenhum dado foi salvo/)));
    expect(db.writes).toHaveLength(0);
    expect(db.rows[0].nome).toBe("Produto declarado");
    expect(db.rows[0].declarations).toHaveLength(1);
  });
  it("resposta incerta após commit reutiliza recibo sem criar outra raiz", async () => {
    app(); await screen.findByText("Soja"); fireEvent.click(screen.getByRole("button", { name: /Cultura própria/ }));
    db.uncertain = true; await submitDialog("Retry seguro"); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(toastFns.success).toHaveBeenCalledTimes(1));
    expect(db.rows).toHaveLength(1); expect(db.writes).toHaveLength(2);
    expect(db.writes[0].p_idempotency_key).toBe(db.writes[1].p_idempotency_key);
  });
  it("duplo clique não duplica e resposta antiga não aplica callbacks após AR→FSF→AR", async () => {
    const view = app(); await screen.findByText("Soja"); fireEvent.click(screen.getByRole("button", { name: /Cultura própria/ }));
    let release: () => void = () => {};
    db.writeDelay = new Promise<void>((resolve) => { release = resolve; });
    await submitDialog("Resposta antiga"); fireEvent.click(screen.getByRole("button", { name: "Salvando..." }));
    await waitFor(() => expect(db.writes).toHaveLength(1));
    auth.profile = { user_id: "u-fsf", organization_id: FSF, ativo: true }; auth.user = { id: "u-fsf" }; view.redraw();
    await waitFor(() => expect(screen.queryByText("Criar cultura própria")).toBeNull());
    auth.profile = { user_id: "u-ar", organization_id: AR, ativo: true }; auth.user = { id: "u-ar" }; view.redraw();
    await act(async () => release());
    expect(toastFns.success).not.toHaveBeenCalled(); expect(toastFns.error).not.toHaveBeenCalled();
  });
  it("recibo antigo de AR resolvido após rerender FSF não chama onApplied nem invalida FSF", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useOwnedCatalogMutation } = await import("@/hooks/useOwnedCatalogMutations");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onApplied = vi.fn();
    let release: () => void = () => {};
    db.writeDelay = new Promise<void>((resolve) => { release = resolve; });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useOwnedCatalogMutation("cultura", onApplied), { wrapper });
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = hook.result.current.mutateAsync({ scopeKey: `${AR}|u-ar`, entity: "cultura", operation: "create", entityId: null, expectedUpdatedAt: null, payload: { nome: "AR pendente" },
        reason: "motivo suficiente", idempotencyKey: "k-ar-pendente" }).catch(() => undefined);
    });
    await waitFor(() => expect(db.writes).toHaveLength(1));
    auth.profile = { user_id: "u-fsf", organization_id: FSF, ativo: true }; auth.user = { id: "u-fsf" };
    hook.rerender();
    await act(async () => { release(); await pending; });
    expect(onApplied).toHaveBeenCalledTimes(0);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
