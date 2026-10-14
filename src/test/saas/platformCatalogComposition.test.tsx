import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCatalogCompositionDialog } from "@/components/plataforma/PlatformCatalogCompositionDialog";
import { platformCatalogAccess, type PlatformCatalogActor } from "@/lib/catalogo/platformCatalogRead";
import { compositionSchema, setComposition, toPayload, validateDeclarations, UNIT_BASE,
  type Composition, type DeclarationDraft } from "@/lib/catalogo/platformCatalogComposition";

const mocks = vi.hoisted(() => ({ actor: {} as PlatformCatalogActor, request: vi.fn(), rpc: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const BOMB = "1875527c-a65a-483b-a6c2-9122d5ec2a51";
const OTHER = "00000000-0000-4000-8000-000000000009";
const M1 = "057a07f4-4af4-5426-87e0-f45bdeafb67a", M2 = "37f37e85-a964-5ab1-9b45-de47eb8ddf89", M3 = "6f5f0de2-9b6f-5104-a728-a7bf90f77163";
const AUDIT = "00000000-0000-4000-8000-000000000002", KEY = "00000000-0000-4000-8000-0000000000aa";
const F1 = "00000000-0000-4000-8000-0000000000f1", F2 = "00000000-0000-4000-8000-0000000000f2", F3 = "00000000-0000-4000-8000-0000000000f3";
const T0 = "2026-10-14T22:02:40.000001+00:00", T1 = "2026-10-14T22:10:00.000001+00:00";
function actor(id = "actor-a"): PlatformCatalogActor { return { user: { id }, session: { user: { id } },
  profile: { id: "p-" + id, user_id: id, ativo: true, senha_provisoria: false }, roles: ["superadmin"], loading: false, error: null }; }
const recipe = (id: string, m: string, nome: string, v: number) => ({ formulacao_id: id, microrganismo_id: m, micro_nome: nome, micro_ativo: true,
  component_insumo_id: null, insumo_nome: null, volume_ml: v, proporcao: null, concentracao: null, unidade: "mL", e_volume_fixo: false });
const bombarbio = (o: Partial<Composition> = {}): Composition => ({
  produto: { id: BOMB, nome: "Bombarbio", familia_catalogo: "biologico", updated_at: T0 }, conjunto: null,
  receita: [recipe(F1, M1, "Micro A", 334), recipe(F2, M2, "Micro B", 333), recipe(F3, M3, "Micro C", 333)],
  declaracoes: [], receita_has_more: false, declaracoes_has_more: false, ...o });
const ing = (o: Partial<DeclarationDraft> = {}): DeclarationDraft => ({ tipo_componente: "ingrediente_ativo", microrganismo_id: null,
  componente_nome: "Azoxistrobina", quantidade: 250, unidade: "g/L", base: "por_volume_produto", natureza: "concentracao_declarada", ...o });
let reads: Record<string, Composition>;
beforeEach(() => {
  mocks.actor = actor(); mocks.saved.mockReset(); mocks.close.mockReset();
  reads = { [BOMB]: bombarbio(), [OTHER]: bombarbio({ produto: { id: OTHER, nome: "Outro", familia_catalogo: "quimico", updated_at: T0 }, receita: [] }) };
  mocks.request.mockReset().mockImplementation((name, a) => Promise.resolve(name === "platform_read_global_product_composition"
    ? { data: reads[a.p_produto_id], error: null }
    : { data: { produto_id: a.p_produto_id, status: a.p_status, itens: a.p_itens.length, updated_at: T1, idempotency_key: a.p_idempotency_key,
        audit_id: AUDIT, idempotent: false }, error: null }));
  mocks.rpc.mockReset().mockImplementation((name, a) => ({ abortSignal: (s: AbortSignal) => mocks.request(name, a, s) }));
});
afterEach(cleanup);
const writes = () => mocks.request.mock.calls.filter(([n]) => n === "platform_set_global_product_composition");
const signal = () => new AbortController().signal;

describe("validação de declarações", () => {
  it("família NULL é somente leitura", () => {
    expect(validateDeclarations(null, "rascunho", [])).toEqual(["Classifique a família do produto antes de declarar composição."]);
  });
  it("tipo de componente segue a família (sem micro em químico, sem ingrediente em biológico)", () => {
    expect(validateDeclarations("quimico", "rascunho", [ing()])).toEqual([]);
    expect(validateDeclarations("biologico", "rascunho", [ing()]).join()).toMatch(/família/);
    expect(validateDeclarations("quimico", "rascunho", [ing({ tipo_componente: "microrganismo", microrganismo_id: M1, componente_nome: null,
      unidade: "UFC/mL", natureza: "teor_garantido", quantidade: 1e9 })]).join()).toMatch(/família/);
    expect(validateDeclarations("fertilizante_adubo", "rascunho", [ing({ tipo_componente: "nutriente", componente_nome: "N", unidade: "%m/m", base: "por_massa_produto", quantidade: 10 })]).join()).toMatch(/2 a 160/);
  });
  it("matriz unidade/base explícita, sem padrão implícito", () => {
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
  it("micro: só teor UFC, sem duplicar medida da receita nem repetir", () => {
    const micro = ing({ tipo_componente: "microrganismo", microrganismo_id: M1, componente_nome: null, unidade: "UFC/mL", quantidade: 1e9, natureza: "teor_garantido" });
    expect(validateDeclarations("biologico", "completo", [micro])).toEqual([]);
    expect(validateDeclarations("biologico", "completo", [micro], new Set([M1])).join()).toMatch(/não duplique/);
    expect(validateDeclarations("biologico", "rascunho", [{ ...micro, unidade: "mL/L", quantidade: 334 }]).join()).toMatch(/volume fica na receita/);
    expect(validateDeclarations("biologico", "rascunho", [micro, micro]).join()).toMatch(/repetido/);
  });
  it("payload não envia micro para não-micro nem nome para micro", () => {
    expect(toPayload([ing({ microrganismo_id: M1 })])[0]).toMatchObject({ ordem: 1, microrganismo_id: null, componente_nome: "Azoxistrobina" });
  });
});

describe("contrato servidor", () => {
  it("leitor estrito rejeita campos extras", () => {
    expect(compositionSchema.safeParse(bombarbio()).success).toBe(true);
    expect(compositionSchema.safeParse({ ...bombarbio(), extra: 1 }).success).toBe(false);
  });
  it("recibo divergente não é sucesso", async () => {
    const target = reads[OTHER];
    mocks.request.mockImplementation((_n, a) => Promise.resolve({ data: { produto_id: a.p_produto_id, status: "rascunho", itens: 1, updated_at: T0,
      idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false }, error: null }));
    await expect(setComposition(target, "rascunho", [ing()], "Declaração revisada pelo responsável", KEY, signal())).rejects.toThrow();
  });
  it("envia somente produto/versão/status/itens/motivo/chave", async () => {
    await setComposition(reads[OTHER], "completo", [ing()], "Declaração revisada pelo responsável", KEY, signal());
    expect(Object.keys(writes()[0][1]).sort()).toEqual(["p_expected_updated_at", "p_idempotency_key", "p_itens", "p_produto_id", "p_reason", "p_status"]);
  });
});

describe("painel de composição", () => {
  it("Bombarbio: mostra receita 334/333/333 pela origem formulação e não cria declaração", async () => {
    const scope = platformCatalogAccess(mocks.actor).scope;
    render(<PlatformCatalogCompositionDialog productId={BOMB} nome="Bombarbio" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    expect(await screen.findByText(/Micro A — 334 mL/)).toBeTruthy();
    expect(screen.getByText(/Micro B — 333 mL/)).toBeTruthy();
    expect(screen.getByText(/Micro C — 333 mL/)).toBeTruthy();
    expect(screen.getByText("Nenhuma declaração.")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it("produto sem família: somente leitura", async () => {
    reads[OTHER] = { ...reads[OTHER], produto: { ...reads[OTHER].produto, familia_catalogo: null } };
    const scope = platformCatalogAccess(mocks.actor).scope;
    render(<PlatformCatalogCompositionDialog productId={OTHER} nome="Outro" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    expect(await screen.findByText(/declarações apenas para leitura/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Adicionar componente" })).toBeNull();
  });
  it("salva declaração química com motivo e confirmação", async () => {
    const scope = platformCatalogAccess(mocks.actor).scope;
    render(<PlatformCatalogCompositionDialog productId={OTHER} nome="Outro" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar componente" }));
    fireEvent.change(screen.getByLabelText("Nome do componente"), { target: { value: "Azoxistrobina" } });
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Unidade"), { target: { value: "g/L" } });
    fireEvent.change(screen.getByLabelText("Base"), { target: { value: "por_volume_produto" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Declaração revisada pelo responsável" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar declarações" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(writes()[0][1].p_itens[0]).toMatchObject({ componente_nome: "Azoxistrobina", quantidade: 250, unidade: "g/L" });
  });
  it("mudar motivo limpa confirmação", async () => {
    const scope = platformCatalogAccess(mocks.actor).scope;
    render(<PlatformCatalogCompositionDialog productId={OTHER} nome="Outro" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar componente" }));
    fireEvent.change(screen.getByLabelText("Nome do componente"), { target: { value: "Azoxistrobina" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Declaração revisada pelo responsável" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Outro motivo revisado agora" } });
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
  });
  it("escopo A→B com live=true: leitura tardia de A é descartada", async () => {
    let resolveA: (v: unknown) => void = () => {};
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    const scopeA = platformCatalogAccess(mocks.actor).scope;
    const view = render(<PlatformCatalogCompositionDialog productId={BOMB} nome="Bombarbio" scope={scopeA} onClose={mocks.close} onSaved={mocks.saved} />);
    mocks.actor = actor("actor-b");
    const scopeB = platformCatalogAccess(mocks.actor).scope;
    reads[BOMB] = bombarbio({ receita: [recipe(F1, M1, "Micro B-escopo", 1)] });
    view.rerender(<PlatformCatalogCompositionDialog productId={BOMB} nome="Bombarbio" scope={scopeB} onClose={mocks.close} onSaved={mocks.saved} />);
    expect(await screen.findByText(/Micro B-escopo/)).toBeTruthy();
    resolveA({ data: bombarbio(), error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Micro A — 334/)).toBeNull();
  });
  it("troca de item descarta escrita tardia e não chama onSaved", async () => {
    let resolveW: (v: unknown) => void = () => {};
    const scope = platformCatalogAccess(mocks.actor).scope;
    const view = render(<PlatformCatalogCompositionDialog productId={OTHER} nome="Outro" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar componente" }));
    fireEvent.change(screen.getByLabelText("Nome do componente"), { target: { value: "Azoxistrobina" } });
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Declaração revisada pelo responsável" } });
    fireEvent.click(screen.getByRole("checkbox"));
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveW = r; }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar declarações" }));
    view.rerender(<PlatformCatalogCompositionDialog productId={BOMB} nome="Bombarbio" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    expect(await screen.findByText(/Micro A — 334/)).toBeTruthy();
    const a = writes()[0][1];
    resolveW({ data: { produto_id: a.p_produto_id, status: "rascunho", itens: 1, updated_at: T1, idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false }, error: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("perda de sessão não renderiza o painel", () => {
    const scope = platformCatalogAccess(mocks.actor).scope;
    mocks.actor = { ...actor(), roles: [] };
    const { container } = render(<PlatformCatalogCompositionDialog productId={BOMB} nome="Bombarbio" scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    expect(container.textContent).toBe("");
  });
});
