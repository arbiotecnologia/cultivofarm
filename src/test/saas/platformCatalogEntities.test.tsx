import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCatalogEntityPanel } from "@/components/plataforma/PlatformCatalogEntityPanel";
import { createEntity, entityPatch, parseUfc, isExactUfc, microValuesSchema, cultureValuesSchema, type EntityDetail } from "@/lib/catalogo/platformCatalogEntities";

const mocks = vi.hoisted(() => ({ request: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const ID = "00000000-0000-4000-8000-000000000011";
const V1 = "2026-10-14T19:00:00+00:00";
const V2 = "2026-10-14T19:05:00+00:00";
const culture: EntityDetail = { id: ID, nome: "Soja", descricao: null, ativo: true, updated_at: V1, desativada_em: null };
const receipt = (args: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ data: { id: ID, ativo: true, updated_at: V2,
  idempotency_key: args.p_idempotency_key, audit_id: "00000000-0000-4000-8000-000000000012", idempotent: false, ...extra }, error: null });

function handler(name: string, args: Record<string, unknown>) {
  if (name === "platform_read_global_cultures") return { data: { items: [{ id: ID, nome: "Soja", ativo: true }], has_more: false }, error: null };
  if (name === "platform_read_global_culture_detail") return { data: culture, error: null };
  return receipt(args);
}
beforeEach(() => {
  mocks.request.mockReset().mockImplementation((n, a) => Promise.resolve(handler(n, a)));
  mocks.rpc.mockReset().mockImplementation((name, args) => ({ abortSignal: (s: AbortSignal) => mocks.request(name, args, s) }));
});
afterEach(cleanup);
function mount(scope = "scope-a") {
  const client = new QueryClient();
  const tree = (s: string) => <QueryClientProvider client={client}><PlatformCatalogEntityPanel kind="cultura" scope={s} /></QueryClientProvider>;
  const view = render(tree(scope));
  return { rerender: (s: string) => view.rerender(tree(s)) };
}
async function openEdit() {
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Editar Soja" }));
  await screen.findByDisplayValue("Soja");
}
const writes = () => mocks.rpc.mock.calls.filter(([n]) => !String(n).startsWith("platform_read"));

describe("contratos de payload", () => {
  it("micro rejeita campos de preço, B2B, código e tenant", () => {
    const base = { nome: "M", tipo: "bacteria", nome_cientifico: null, concentracao_ufc_ml: null, concentracao_label: null, fornecedor: null,
      producao_on_farm: false, meio_cultivo: null, funcao_agronomica: null, observacoes: null, descricao: null };
    expect(microValuesSchema.safeParse(base).success).toBe(true);
    for (const extra of [{ valor_litro_brl: 1 }, { b2b_enabled: true }, { codigo: "X" }, { organization_id: ID }, { ativo: true }])
      expect(microValuesSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(microValuesSchema.safeParse({ ...base, concentracao_ufc_ml: -1 }).success).toBe(false);
  });
  it("cultura limita nome a 120 e rejeita vazio", () => {
    expect(cultureValuesSchema.safeParse({ nome: " ", descricao: null }).success).toBe(false);
    expect(cultureValuesSchema.safeParse({ nome: "x".repeat(121), descricao: null }).success).toBe(false);
  });
  it("patch de micro nunca inclui tipo", () => {
    const d = { id: ID, ativo: true, updated_at: V1, nome: "A", tipo: "bacteria" } as EntityDetail;
    expect(entityPatch("micro", d, { nome: "B", tipo: "fungo" })).toEqual({ nome: "B" });
  });
  it("criação recusa recibo que reporta item ativo ou micro sem código", async () => {
    mocks.request.mockImplementation((_n, a) => Promise.resolve(receipt(a, { ativo: true })));
    await expect(createEntity("cultura", { nome: "Milho", descricao: null }, "Motivo suficiente", ID, new AbortController().signal)).rejects.toThrow();
    mocks.request.mockImplementation((_n, a) => Promise.resolve(receipt(a, { ativo: false })));
    await expect(createEntity("micro", { nome: "M", tipo: "fungo", nome_cientifico: null, concentracao_ufc_ml: null, concentracao_label: null,
      fornecedor: null, producao_on_farm: true, meio_cultivo: null, funcao_agronomica: null, observacoes: null, descricao: null },
      "Motivo suficiente", ID, new AbortController().signal)).rejects.toThrow();
  });
});

describe("concentração sem perda de precisão", () => {
  it("aceita apenas valores exatos dentro do limite comum front/SQL", () => {
    expect(parseUfc("1000000000")).toBe(1e9);
    expect(parseUfc("12,5")).toBe(12.5);
    expect(parseUfc("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseUfc("")).toBeNull();
  });
  it.each(["9007199254740993", "1e18", "1000000000000000000", "1.234", "-5", "0", "abc"])("rejeita %s", (t) => {
    expect(Number.isNaN(parseUfc(t) as number) || parseUfc(t) === null).toBe(true);
  });
  it("schema recusa 1e18 arredondado e mais de 2 casas", () => {
    expect(isExactUfc(1e18)).toBe(false); expect(isExactUfc(1.234)).toBe(false); expect(isExactUfc(10.25)).toBe(true);
  });
});

describe("painel global de culturas", () => {
  it("criação de cultura não anuncia código gerado", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Novo cultura global" }));
    expect(await screen.findByText("A cultura nasce inativa.")).toBeInTheDocument();
    expect(screen.queryByText(/código é gerado/i)).toBeNull();
  });
  it("campos ficam desabilitados enquanto salva", async () => {
    mocks.request.mockImplementation((n, a) => n.startsWith("platform_read") ? Promise.resolve(handler(n, a)) : new Promise(() => {}));
    await openEdit();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Outro" } });
    fireEvent.change(screen.getByLabelText("Motivo da alteração (10 a 500 caracteres)"), { target: { value: "Motivo suficiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.getByLabelText("Nome")).toBeDisabled());
    expect(screen.getByLabelText("Motivo da alteração (10 a 500 caracteres)")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(writes()).toHaveLength(1);
  });
  it("edição envia só campo alterado com versão do leitor seguro e motivo", async () => {
    await openEdit();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Soja safrinha" } });
    fireEvent.change(screen.getByLabelText("Motivo da alteração (10 a 500 caracteres)"), { target: { value: "Correção de grafia" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Alteração confirmada.");
    expect(mocks.rpc).toHaveBeenCalledWith("platform_update_global_culture", { p_id: ID, p_expected_updated_at: V1,
      p_patch: { nome: "Soja safrinha" }, p_reason: "Correção de grafia", p_idempotency_key: expect.any(String) });
  });
  it("motivo curto não chama o servidor", async () => {
    await openEdit();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Outro" } });
    fireEvent.change(screen.getByLabelText("Motivo da alteração (10 a 500 caracteres)"), { target: { value: "curto" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByRole("alert"); expect(writes()).toHaveLength(0);
  });
  it.each([
    ["erro 40001", { data: null, error: { code: "40001", message: "privado" } }],
    ["recibo com versão inalterada", { data: { id: ID, ativo: true, updated_at: V1, idempotency_key: "x", audit_id: ID, idempotent: false }, error: null }],
    ["resposta vazia (zero linhas)", { data: null, error: null }],
  ])("%s não reporta sucesso nem vaza mensagem", async (_l, response) => {
    mocks.request.mockImplementation((n, a) => Promise.resolve(n.startsWith("platform_read") ? handler(n, a) : response));
    await openEdit();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Outro" } });
    fireEvent.change(screen.getByLabelText("Motivo da alteração (10 a 500 caracteres)"), { target: { value: "Motivo suficiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Alteração confirmada.")).toBeNull(); expect(screen.queryByText("privado")).toBeNull();
  });
  it("arquivar usa versão do detalhe e exige confirmação com motivo", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Arquivar Soja" }));
    await screen.findByText("Soja", { selector: "strong" });
    fireEvent.change(screen.getByLabelText("Motivo da alteração (10 a 500 caracteres)"), { target: { value: "Cultura descontinuada" } });
    mocks.request.mockImplementation((n, a) => Promise.resolve(n.startsWith("platform_read") ? handler(n, a) : receipt(a, { ativo: false })));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar arquivamento" }));
    await screen.findByText("Alteração confirmada.");
    expect(mocks.rpc).toHaveBeenCalledWith("platform_set_global_culture_status", expect.objectContaining({ p_id: ID, p_expected_updated_at: V1, p_ativo: false }));
  });
  it("leitura com contrato inválido mostra erro, não lista vazia", async () => {
    mocks.request.mockImplementation(() => Promise.resolve({ data: { items: [{ id: ID, nome: "Soja", ativo: true, preco: 1 }], has_more: false }, error: null }));
    mount(); await screen.findByRole("alert"); expect(screen.queryByText("Nenhum item encontrado.")).toBeNull();
  });
  it("troca de identidade descarta resposta antiga", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    mocks.request.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
    const view = mount("scope-a");
    view.rerender("scope-b");
    resolveOld({ data: { items: [{ id: ID, nome: "Antigo", ativo: true }], has_more: false }, error: null });
    await screen.findByRole("button", { name: "Editar Soja" });
    expect(screen.queryByText("Antigo")).toBeNull();
  });
});
