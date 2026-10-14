import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCatalogCompositionDialog } from "@/components/plataforma/PlatformCatalogCompositionDialog";
import { platformCatalogAccess, type PlatformCatalogActor } from "@/lib/catalogo/platformCatalogRead";
import { compositionSchema, normalizeComponentName, setComposition, toPayload, validateDeclarations, UNIT_BASE,
  type Composition, type DeclarationDraft } from "@/lib/catalogo/platformCatalogComposition";

const mocks = vi.hoisted(() => ({ actor: {} as PlatformCatalogActor, request: vi.fn(), rpc: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const BOMB = "1875527c-a65a-483b-a6c2-9122d5ec2a51";
const OTHER = "00000000-0000-4000-8000-000000000009";
const BIO = "00000000-0000-4000-8000-000000000010";
const M1 = "057a07f4-4af4-5426-87e0-f45bdeafb67a", M2 = "37f37e85-a964-5ab1-9b45-de47eb8ddf89", M3 = "6f5f0de2-9b6f-5104-a728-a7bf90f77163";
const AUDIT = "00000000-0000-4000-8000-000000000002", KEY = "00000000-0000-4000-8000-0000000000aa";
const F1 = "00000000-0000-4000-8000-0000000000f1", F2 = "00000000-0000-4000-8000-0000000000f2", F3 = "00000000-0000-4000-8000-0000000000f3";
const T0 = "2026-10-14T22:02:40.000001+00:00", T1 = "2026-10-14T22:10:00.000001+00:00";
const REASON = "Declaração revisada pelo responsável";
function actor(id = "actor-a"): PlatformCatalogActor { return { user: { id }, session: { user: { id } },
  profile: { id: "p-" + id, user_id: id, ativo: true, senha_provisoria: false }, roles: ["superadmin"], loading: false, error: null }; }
const recipe = (id: string, m: string, nome: string, v: number) => ({ formulacao_id: id, microrganismo_id: m, micro_nome: nome, micro_ativo: true,
  component_insumo_id: null, insumo_nome: null, volume_ml: v, proporcao: null, concentracao: null, unidade: "mL", e_volume_fixo: false });
const comp = (o: Partial<Composition> = {}): Composition => ({
  produto: { id: BOMB, nome: "Bombarbio", familia_catalogo: "biologico", updated_at: T0 }, conjunto: null,
  receita: [recipe(F1, M1, "Micro A", 334), recipe(F2, M2, "Micro B", 333), recipe(F3, M3, "Micro C", 333)],
  declaracoes: [], receita_offset: 0, receita_has_more: false, declaracoes_has_more: false, ...o });
const ing = (o: Partial<DeclarationDraft> = {}): DeclarationDraft => ({ tipo_componente: "ingrediente_ativo", microrganismo_id: null,
  componente_nome: "Azoxistrobina", quantidade: 250, unidade: "g/L", base: "por_volume_produto", natureza: "concentracao_declarada", ...o });
const micro = (o: Partial<DeclarationDraft> = {}): DeclarationDraft => ing({ tipo_componente: "microrganismo", microrganismo_id: M1, componente_nome: null,
  unidade: "UFC/mL", quantidade: 1e9, ...o });
let reads: Record<string, Composition>;
const microPage = (nome: string) => ({ items: [{ id: M2, codigo: null, nome, ativo: true }], has_more: false });
beforeEach(() => {
  mocks.actor = actor(); mocks.saved.mockReset(); mocks.close.mockReset();
  reads = { [BOMB]: comp(),
    [OTHER]: comp({ produto: { id: OTHER, nome: "Outro", familia_catalogo: "quimico", updated_at: T0 }, receita: [] }),
    [BIO]: comp({ produto: { id: BIO, nome: "Bio", familia_catalogo: "biologico", updated_at: T0 }, receita: [] }) };
  mocks.request.mockReset().mockImplementation((name, a) => Promise.resolve(
    name === "platform_read_global_product_composition" ? { data: { ...reads[a.p_produto_id], receita_offset: a.p_receita_offset }, error: null }
    : name === "platform_read_global_microorganisms" ? { data: microPage("Micro busca"), error: null }
    : { data: { produto_id: a.p_produto_id, status: a.p_status, itens: a.p_itens.length, updated_at: T1, idempotency_key: a.p_idempotency_key,
        audit_id: AUDIT, idempotent: false }, error: null }));
  mocks.rpc.mockReset().mockImplementation((name, a) => ({ abortSignal: (s: AbortSignal) => mocks.request(name, a, s) }));
});
afterEach(cleanup);
const writes = () => mocks.request.mock.calls.filter(([n]) => n === "platform_set_global_product_composition");
const signal = () => new AbortController().signal;
const scopeOf = () => platformCatalogAccess(mocks.actor).scope;
const dlg = (id = OTHER, updatedAt = T0, scope = scopeOf()) =>
  <PlatformCatalogCompositionDialog productId={id} updatedAt={updatedAt} nome="Produto" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />;
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
async function fillIngredient(name = "Azoxistrobina") {
  fireEvent.click(await screen.findByRole("button", { name: "Adicionar componente" }));
  fireEvent.change(screen.getAllByLabelText("Nome do componente").at(-1)!, { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: REASON } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("validação de declarações", () => {
  it("família NULL é somente leitura", () => {
    expect(validateDeclarations(null, "rascunho", [])).toEqual(["Classifique a família do produto antes de declarar composição."]);
  });
  it("tipo de componente segue a família", () => {
    expect(validateDeclarations("quimico", "rascunho", [ing()])).toEqual([]);
    expect(validateDeclarations("biologico", "rascunho", [ing()]).join()).toMatch(/família/);
    expect(validateDeclarations("quimico", "rascunho", [micro()]).join()).toMatch(/família/);
  });
  it("duplicidade por nome normalizado independe do tipo (ingrediente×outro, nutriente×outro)", () => {
    expect(normalizeComponentName("  Azoxistrobina ")).toBe("azoxistrobina");
    expect(validateDeclarations("quimico", "rascunho", [ing(), ing({ tipo_componente: "outro", componente_nome: " azoxistrobina " })]).join()).toMatch(/repetido/);
    const n = ing({ tipo_componente: "nutriente", componente_nome: "N total", unidade: "%m/m", base: "por_massa_produto", quantidade: 10 });
    expect(validateDeclarations("fertilizante_adubo", "rascunho", [n, { ...n, tipo_componente: "outro", componente_nome: "N TOTAL" }]).join()).toMatch(/repetido/);
  });
  it("matriz unidade/base explícita", () => {
    expect(UNIT_BASE["g/kg"]).toBe("por_massa_produto");
    expect(validateDeclarations("quimico", "rascunho", [ing({ base: "por_massa_produto" })]).join()).toMatch(/base incompatível/);
    expect(validateDeclarations("quimico", "rascunho", [ing({ base: null })]).join()).toMatch(/vão juntas/);
  });
  it("limites: positiva, finita, ≤6 casas, percentual ≤100, UFC só micro", () => {
    for (const q of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(validateDeclarations("quimico", "rascunho", [ing({ quantidade: q })]).length).toBeGreaterThan(0);
    expect(validateDeclarations("quimico", "rascunho", [ing({ quantidade: 1.1234567 })]).join()).toMatch(/6 casas/);
    expect(validateDeclarations("quimico", "rascunho", [ing({ unidade: "%m/v", quantidade: 101 })]).join()).toMatch(/limite/);
    expect(validateDeclarations("quimico", "rascunho", [ing({ unidade: "UFC/mL", quantidade: 10 })]).join()).toMatch(/UFC só/);
  });
  it("completo exige itens e medidas; rascunho aceita medida vazia", () => {
    expect(validateDeclarations("quimico", "completo", []).join()).toMatch(/ao menos um/);
    const empty = ing({ quantidade: null, unidade: null, base: null });
    expect(validateDeclarations("quimico", "rascunho", [empty])).toEqual([]);
    expect(validateDeclarations("quimico", "completo", [empty]).join()).toMatch(/exige quantidade/);
  });
  it("micro: concentração declarada OU teor garantido (escolha do usuário), mesmo validador UFC", () => {
    expect(validateDeclarations("biologico", "completo", [micro({ natureza: "concentracao_declarada" })])).toEqual([]);
    expect(validateDeclarations("biologico", "completo", [micro({ natureza: "teor_garantido", unidade: "UFC/g", base: "por_massa_produto" })])).toEqual([]);
    expect(validateDeclarations("biologico", "completo", [micro()], new Set([M1])).join()).toMatch(/não duplique/);
    expect(validateDeclarations("biologico", "rascunho", [micro({ unidade: "mL/L", quantidade: 334 })]).join()).toMatch(/volume fica na receita/);
    expect(validateDeclarations("biologico", "rascunho", [micro(), micro()]).join()).toMatch(/repetido/);
  });
  it("payload não envia micro para não-micro nem nome para micro", () => {
    expect(toPayload([ing({ microrganismo_id: M1 })])[0]).toMatchObject({ ordem: 1, microrganismo_id: null, componente_nome: "Azoxistrobina" });
  });
});

describe("contrato servidor", () => {
  it("leitor estrito rejeita campos extras", () => {
    expect(compositionSchema.safeParse(comp()).success).toBe(true);
    expect(compositionSchema.safeParse({ ...comp(), extra: 1 }).success).toBe(false);
  });
  it("recibo divergente não é sucesso", async () => {
    mocks.request.mockImplementation((_n, a) => Promise.resolve({ data: { produto_id: a.p_produto_id, status: "rascunho", itens: 1, updated_at: T0,
      idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false }, error: null }));
    await expect(setComposition(reads[OTHER], "rascunho", [ing()], REASON, KEY, signal())).rejects.toThrow();
  });
  it("conjunto parcial nunca é sobrescrito", async () => {
    await expect(setComposition({ ...reads[OTHER], declaracoes_has_more: true }, "rascunho", [ing()], REASON, KEY, signal())).rejects.toThrow(/por inteiro/);
    expect(writes()).toHaveLength(0);
  });
  it("envia somente produto/versão/status/itens/motivo/chave", async () => {
    await setComposition(reads[OTHER], "completo", [ing()], REASON, KEY, signal());
    expect(Object.keys(writes()[0][1]).sort()).toEqual(["p_expected_updated_at", "p_idempotency_key", "p_itens", "p_produto_id", "p_reason", "p_status"]);
  });
});

describe("painel de composição", () => {
  it("Bombarbio: mostra receita 334/333/333 pela origem formulação e não cria declaração", async () => {
    render(dlg(BOMB));
    expect(await screen.findByText(/Micro A — 334 mL/)).toBeTruthy();
    expect(screen.getByText(/Micro B — 333 mL/)).toBeTruthy();
    expect(screen.getByText(/Micro C — 333 mL/)).toBeTruthy();
    expect(screen.getByText("Nenhuma declaração.")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it("produto sem família: somente leitura", async () => {
    reads[OTHER] = { ...reads[OTHER], produto: { ...reads[OTHER].produto, familia_catalogo: null } };
    render(dlg());
    expect(await screen.findByText(/declarações apenas para leitura/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar componente" })).toBeNull();
  });
  it("declarações parciais bloqueiam edição", async () => {
    reads[OTHER] = { ...reads[OTHER], declaracoes_has_more: true };
    render(dlg());
    expect(await screen.findByText(/não foram carregadas por inteiro/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar componente" })).toBeNull();
  });
  it("versão lida diferente da lista bloqueia edição", async () => {
    render(dlg(OTHER, T1));
    expect(await screen.findByText(/mudou desde a lista/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar componente" })).toBeNull();
  });
  it("salva declaração química com motivo e confirmação", async () => {
    render(dlg());
    await fillIngredient();
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Unidade"), { target: { value: "g/L" } });
    fireEvent.change(screen.getByLabelText("Base"), { target: { value: "por_volume_produto" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar declarações" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(writes()[0][1].p_itens[0]).toMatchObject({ componente_nome: "Azoxistrobina", quantidade: 250, unidade: "g/L", natureza: "concentracao_declarada" });
  });
  it("UI rejeita mesmo nome em tipos diferentes", async () => {
    render(dlg());
    await fillIngredient();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar componente" }));
    fireEvent.change(screen.getAllByLabelText("Tipo").at(-1)!, { target: { value: "outro" } });
    fireEvent.change(screen.getAllByLabelText("Nome do componente").at(-1)!, { target: { value: " AZOXISTROBINA " } });
    expect(screen.getByText(/componente repetido/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar declarações" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("micro nasce como concentração declarada e permite escolher teor garantido", async () => {
    render(dlg(BIO));
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar componente" }));
    const nat = screen.getByLabelText("Natureza da informação") as HTMLSelectElement;
    expect(nat.value).toBe("concentracao_declarada");
    fireEvent.change(nat, { target: { value: "teor_garantido" } });
    expect(nat.value).toBe("teor_garantido");
  });
  it("mudar motivo limpa confirmação", async () => {
    render(dlg());
    await fillIngredient();
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Outro motivo revisado agora" } });
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
  });
  it("Adicionar limitado a 50 componentes: 49 lidas → 50 → recusa 51", async () => {
    const decl = (i: number) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ordem: i, tipo_componente: "ingrediente_ativo" as const,
      microrganismo_id: null, micro_nome: null, micro_ativo: null, componente_nome: `Ativo ${i}`, quantidade: null, unidade: null, base: null,
      natureza: "concentracao_declarada" as const });
    reads[OTHER] = { ...reads[OTHER], conjunto: { status: "rascunho", updated_at: T0 }, declaracoes: Array.from({ length: 49 }, (_, i) => decl(i + 1)) };
    render(dlg());
    expect(await screen.findByText("Componente 49")).toBeTruthy();
    expect(screen.queryByText("Componente 50")).toBeNull();
    const add = screen.getByText("Adicionar componente").closest("button") as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    expect(screen.getByText("Componente 50")).toBeTruthy();
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(screen.queryByText("Componente 51")).toBeNull();
    expect(screen.getAllByText(/^Componente \d+$/)).toHaveLength(50);
    expect(screen.getByText("Limite de 50 componentes.")).toBeTruthy();
  });
  it("durante salvamento todos os controles editáveis ficam desabilitados (inclui fieldset)", async () => {
    render(dlg(BIO));
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar componente" }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar no catálogo" }));
    fireEvent.change(await screen.findByLabelText("Escolher do catálogo (ativos)"), { target: { value: M2 } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole("checkbox"));
    mocks.request.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Salvar declarações" }));
    await screen.findByRole("button", { name: "Confirmando…" });
    // :disabled considera fieldset[disabled] ancestral, ao contrário da propriedade .disabled.
    for (const name of ["Adicionar componente", "Buscar no catálogo", "Remover componente"])
      expect(screen.getByRole("button", { name }).matches(":disabled")).toBe(true);
    for (const label of [/Motivo/, "Situação das declarações", "Buscar microrganismo", "Tipo", "Natureza da informação",
      "Quantidade", "Unidade", "Base", "Escolher do catálogo (ativos)"])
      expect(screen.getByLabelText(label).matches(":disabled")).toBe(true);
  });
  it("busca de micros: resposta antiga que chega depois da nova é descartada", async () => {
    render(dlg(BIO));
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar componente" }));
    let resolveOld: (v: unknown) => void = () => {};
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar no catálogo" }));
    mocks.request.mockImplementationOnce(() => Promise.resolve({ data: microPage("Micro nova"), error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar no catálogo" }));
    expect(await screen.findByRole("option", { name: "Micro nova" })).toBeTruthy();
    resolveOld({ data: microPage("Micro velha"), error: null });
    await tick();
    expect(screen.queryByRole("option", { name: "Micro velha" })).toBeNull();
  });
  it("receita paginada navega e informa parcialidade", async () => {
    reads[BOMB] = comp({ receita_has_more: true });
    render(dlg(BOMB));
    expect(await screen.findByText(/Receita parcial: itens 1–3/)).toBeTruthy();
    reads[BOMB] = comp({ receita: [recipe(F1, M1, "Micro página 2", 10)], receita_has_more: false });
    fireEvent.click(screen.getByRole("button", { name: "Próximos itens" }));
    expect(await screen.findByText(/Micro página 2/)).toBeTruthy();
    const call = mocks.request.mock.calls.filter(([n]) => n === "platform_read_global_product_composition").at(-1)!;
    expect(call[1].p_receita_offset).toBe(50);
  });
  it("escopo A→B com live=true: leitura tardia de A é descartada", async () => {
    let resolveA: (v: unknown) => void = () => {};
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    const view = render(dlg(BOMB));
    mocks.actor = actor("actor-b");
    reads[BOMB] = comp({ receita: [recipe(F1, M1, "Micro B-escopo", 1)] });
    view.rerender(dlg(BOMB));
    expect(await screen.findByText(/Micro B-escopo/)).toBeTruthy();
    resolveA({ data: comp(), error: null });
    await tick();
    expect(screen.queryByText(/Micro A — 334/)).toBeNull();
  });
  it("mesmo ID com nova versão: aborta leitura anterior, limpa e relê", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
    const view = render(dlg(OTHER, T0));
    reads[OTHER] = { ...reads[OTHER], produto: { ...reads[OTHER].produto, updated_at: T1 } };
    view.rerender(dlg(OTHER, T1));
    expect(await screen.findByRole("button", { name: "Adicionar componente" })).toBeTruthy();
    resolveOld({ data: { ...comp({ produto: { id: OTHER, nome: "Outro", familia_catalogo: "quimico", updated_at: T0 }, receita: [] }) }, error: null });
    await tick();
    expect(screen.queryByText(/mudou desde a lista/)).toBeNull();
    expect(mocks.request.mock.calls.filter(([n]) => n === "platform_read_global_product_composition")).toHaveLength(2);
  });
  it("live false→true relê e não reaproveita dados antigos", async () => {
    const scope = scopeOf();
    const view = render(dlg(OTHER, T0, scope));
    await screen.findByRole("button", { name: "Adicionar componente" });
    mocks.actor = { ...actor(), roles: [] };
    view.rerender(dlg(OTHER, T0, scope));
    expect(screen.queryByRole("button", { name: "Adicionar componente" })).toBeNull();
    mocks.actor = actor();
    view.rerender(dlg(OTHER, T0, scope));
    expect(await screen.findByRole("button", { name: "Adicionar componente" })).toBeTruthy();
    expect(mocks.request.mock.calls.filter(([n]) => n === "platform_read_global_product_composition")).toHaveLength(2);
  });
  it("troca de item descarta escrita tardia e não chama onSaved", async () => {
    let resolveW: (v: unknown) => void = () => {};
    const view = render(dlg());
    await fillIngredient();
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveW = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar declarações" }));
    view.rerender(dlg(BOMB));
    expect(await screen.findByText(/Micro A — 334/)).toBeTruthy();
    const a = writes()[0][1];
    resolveW({ data: { produto_id: a.p_produto_id, status: "rascunho", itens: 1, updated_at: T1, idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false }, error: null });
    await tick();
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("mudança de versão durante escrita descarta resultado tardio", async () => {
    let resolveW: (v: unknown) => void = () => {};
    const view = render(dlg());
    await fillIngredient();
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveW = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar declarações" }));
    view.rerender(dlg(OTHER, T1));
    const a = writes()[0][1];
    resolveW({ data: { produto_id: a.p_produto_id, status: "rascunho", itens: 1, updated_at: T1, idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false }, error: null });
    await tick();
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("perda de sessão não renderiza o painel", () => {
    const scope = scopeOf();
    mocks.actor = { ...actor(), roles: [] };
    const { container } = render(dlg(BOMB, T0, scope));
    expect(container.textContent).toBe("");
  });
});
