import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCatalogCreateDialog, PlatformCatalogStatusDialog } from "@/components/plataforma/PlatformCatalogLifecycleDialogs";
import { createGlobalProduct, createPayloadSchema, hasMaxSixDecimals, setGlobalProductStatus, type CreatePayload } from "@/lib/catalogo/platformCatalogLifecycle";
import { platformCatalogAccess, type PlatformCatalogActor } from "@/lib/catalogo/platformCatalogRead";
const mocks = vi.hoisted(() => ({ actor: {} as PlatformCatalogActor, request: vi.fn(), rpc: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
const ID = "00000000-0000-4000-8000-000000000001";
const AUDIT = "00000000-0000-4000-8000-000000000002";
const MICRO = "00000000-0000-4000-8000-000000000003";
const T0 = "2026-10-14T14:00:00+00:00"; const T1 = "2026-10-14T15:00:00+00:00";
const base: CreatePayload = { nome: "Produto", tipo: "fungicida", descricao: null, modo_acao: null, funcao_completa: null,
  modo_aplicacao: null, dose_ml_ha: 100, composicao: [] };
function actor(id = "actor-a"): PlatformCatalogActor { return { user: { id }, session: { user: { id } },
  profile: { id: "p-" + id, user_id: id, ativo: true, senha_provisoria: false }, roles: ["superadmin"], loading: false, error: null }; }
const createReceipt = (a: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ data: { id: ID, codigo: "FUNG-10", updated_at: T1,
  composicao_count: (a.p_payload as CreatePayload).composicao.length, idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false, ...extra }, error: null });
const statusReceipt = (a: Record<string, unknown>) => ({ data: { id: ID, ativo: a.p_ativo, updated_at: T1,
  idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false }, error: null });
beforeEach(() => {
  mocks.actor = actor(); mocks.saved.mockReset(); mocks.close.mockReset();
  mocks.request.mockReset().mockImplementation((name, a) => Promise.resolve(name === "platform_create_global_product" ? createReceipt(a)
    : name === "platform_read_global_microorganisms" ? microPage(a) : statusReceipt(a)));
  mocks.rpc.mockReset().mockImplementation((name, a) => ({ abortSignal: (s: AbortSignal) => mocks.request(name, a, s) }));
});
afterEach(cleanup);
const MICRO2 = "00000000-0000-4000-8000-000000000004";
const microPage = (a: Record<string, unknown>) => ({ data: { items: a.p_offset === 0
  ? [{ id: MICRO, codigo: "BAC-1", nome: "Bacillus A", ativo: true }]
  : [{ id: MICRO2, codigo: "FUN-1", nome: "Fungo B", ativo: true }], has_more: a.p_offset === 0 }, error: null });
const signal = () => new AbortController().signal;

describe("contrato de criação global", () => {
  it("rejeita preço, b2b, ativo, código e tipo inexistente no payload", () => {
    for (const extra of [{ valor_dose_brl: 1 }, { b2b_enabled: true }, { ativo: true }, { codigo: "X" }])
      expect(createPayloadSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(createPayloadSchema.safeParse({ ...base, tipo: "herbicida" }).success).toBe(false);
  });
  it("dose e volumes precisam ser finitos e positivos; microrganismo não repete", () => {
    for (const d of [0, -1, Infinity, NaN, 2_000_000]) expect(createPayloadSchema.safeParse({ ...base, dose_ml_ha: d }).success).toBe(false);
    const item = { microrganismo_id: MICRO, volume_ml: 50, proporcao: null };
    expect(createPayloadSchema.safeParse({ ...base, composicao: [item] }).success).toBe(true);
    expect(createPayloadSchema.safeParse({ ...base, composicao: [item, item] }).success).toBe(false);
    expect(createPayloadSchema.safeParse({ ...base, composicao: [{ ...item, volume_ml: 0 }] }).success).toBe(false);
  });
  it("composição é enviada na mesma chamada e o recibo precisa confirmar a contagem", async () => {
    const p = { ...base, composicao: [{ microrganismo_id: MICRO, volume_ml: 50, proporcao: 10 }] };
    await expect(createGlobalProduct(p, "Cadastro revisado", "00000000-0000-4000-8000-0000000000aa", signal())).resolves.toMatchObject({ id: ID });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.request.mockImplementation((_n, a) => Promise.resolve(createReceipt(a, { composicao_count: 0 })));
    await expect(createGlobalProduct(p, "Cadastro revisado", "00000000-0000-4000-8000-0000000000ab", signal())).rejects.toThrow();
  });
  it("recibo com chave divergente ou ausente não é sucesso", async () => {
    mocks.request.mockImplementation((_n, a) => Promise.resolve(createReceipt(a, { idempotency_key: AUDIT })));
    await expect(createGlobalProduct(base, "Cadastro revisado", "00000000-0000-4000-8000-0000000000ac", signal())).rejects.toThrow();
    mocks.request.mockResolvedValue({ data: null, error: null });
    await expect(createGlobalProduct(base, "Cadastro revisado", "00000000-0000-4000-8000-0000000000ad", signal())).rejects.toThrow();
  });
  it("replay idempotente devolvido pelo servidor é aceito", async () => {
    mocks.request.mockImplementation((_n, a) => Promise.resolve(createReceipt(a, { idempotent: true })));
    await expect(createGlobalProduct(base, "Cadastro revisado", "00000000-0000-4000-8000-0000000000ae", signal())).resolves.toMatchObject({ idempotent: true });
  });
});

function renderCreate() {
  const scope = platformCatalogAccess(mocks.actor).scope;
  const tree = () => <PlatformCatalogCreateDialog scope={scope} onClose={mocks.close} onSaved={mocks.saved} />;
  const view = render(tree()); return () => view.rerender(tree());
}
function fillCreate() {
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Produto novo" } });
  fireEvent.change(screen.getByLabelText("Tipo de aplicação"), { target: { value: "inoculante" } });
  fireEvent.change(screen.getByLabelText("Motivo (10 a 500 caracteres)"), { target: { value: "Cadastro inicial revisado" } });
  fireEvent.click(screen.getByRole("button", { name: "Revisar criação" }));
}
describe("tela de criação", () => {
  it("exige confirmação explícita e só chama uma vez com clique duplo", async () => {
    renderCreate(); fillCreate();
    expect(mocks.rpc).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Confirmar criação" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["40001", "42501"])("erro %s mostra mensagem segura e não reporta sucesso", async (code) => {
    mocks.request.mockResolvedValue({ data: null, error: { code, message: "detalhe privado" } });
    renderCreate(); fillCreate(); fireEvent.click(screen.getByRole("button", { name: "Confirmar criação" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("detalhe privado");
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("troca de identidade durante a gravação esconde a tela e descarta a resposta", async () => {
    let resolve!: (v: unknown) => void;
    mocks.request.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const rerender = renderCreate(); fillCreate(); fireEvent.click(screen.getByRole("button", { name: "Confirmar criação" }));
    mocks.actor = actor("actor-b"); rerender();
    expect(screen.queryByText("Novo produto global")).toBeNull();
    resolve(createReceipt({ p_payload: base, p_idempotency_key: "x" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("Superadmin sem readiness não vê a tela", () => {
    mocks.actor = { ...actor(), profile: { id: "p", user_id: "actor-a", ativo: false, senha_provisoria: false } };
    render(<PlatformCatalogCreateDialog scope="qualquer" onClose={mocks.close} onSaved={mocks.saved} />);
    expect(screen.queryByText("Novo produto global")).toBeNull();
  });
});

describe("arquivar/reativar", () => {
  it("envia versão esperada e alvo invertido; nunca exclui", async () => {
    const scope = platformCatalogAccess(mocks.actor).scope;
    render(<PlatformCatalogStatusDialog scope={scope} product={{ id: ID, nome: "Prod", ativo: true, updated_at: T0 }} onClose={mocks.close} onSaved={mocks.saved} />);
    fireEvent.change(screen.getByLabelText("Motivo (10 a 500 caracteres)"), { target: { value: "Fora de linha comercial" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar arquivamento" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("platform_set_global_product_status", expect.objectContaining({ p_id: ID, p_expected_updated_at: T0, p_ativo: false }));
  });
  it("recibo com estado diferente ou versão inalterada falha", async () => {
    mocks.request.mockImplementation((_n, a) => Promise.resolve({ data: { ...statusReceipt(a).data, ativo: true }, error: null }));
    await expect(setGlobalProductStatus(ID, T0, false, "Fora de linha comercial", "00000000-0000-4000-8000-0000000000af", signal())).rejects.toThrow();
    mocks.request.mockImplementation((_n, a) => Promise.resolve({ data: { ...statusReceipt(a).data, updated_at: T0 }, error: null }));
    await expect(setGlobalProductStatus(ID, T0, false, "Fora de linha comercial", "00000000-0000-4000-8000-0000000000b0", signal())).rejects.toThrow();
  });
});

describe("cerca de identidade com retorno ao mesmo escopo", () => {
  it("perda transitória de readiness aborta a requisição e limpa o formulário", async () => {
    const signals: AbortSignal[] = [];
    mocks.request.mockImplementation((_n, _a, s: AbortSignal) => { signals.push(s); return new Promise(() => {}); });
    const original = mocks.actor;
    const rerender = renderCreate(); fillCreate(); fireEvent.click(screen.getByRole("button", { name: "Confirmar criação" }));
    await waitFor(() => expect(signals).toHaveLength(1));
    mocks.actor = { ...original, profile: { ...original.profile!, ativo: false } }; rerender();
    mocks.actor = original; rerender();
    expect(signals[0].aborted).toBe(true);
    expect(screen.getByLabelText("Nome")).toHaveValue("");
    expect(mocks.saved).not.toHaveBeenCalled();
  });
});

describe("composição na tela de criação", () => {
  it("só chama leitor de ativos, adiciona sem duplicar e envia composição real", async () => {
    renderCreate();
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar Bacillus A" }));
    expect(screen.getByRole("button", { name: "Bacillus A adicionado" })).toBeDisabled();
    expect(mocks.rpc).toHaveBeenCalledWith("platform_read_global_microorganisms", expect.objectContaining({ p_only_active: true, p_offset: 0 }));
    fireEvent.change(screen.getByLabelText("Volume (mL) de Bacillus A"), { target: { value: "12,5" } });
    fireEvent.change(screen.getByLabelText("Proporção (%) de Bacillus A"), { target: { value: "40" } });
    fillCreate(); fireEvent.click(screen.getByRole("button", { name: "Confirmar criação" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("platform_create_global_product", expect.objectContaining({
      p_payload: expect.objectContaining({ composicao: [{ microrganismo_id: MICRO, volume_ml: 12.5, proporcao: 40 }] }) }));
  });
  it.each(["", "0", "1.1234567", "abc"])("volume %j bloqueia a revisão", async (vol) => {
    renderCreate();
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar Bacillus A" }));
    fireEvent.change(screen.getByLabelText("Volume (mL) de Bacillus A"), { target: { value: vol } });
    fillCreate();
    expect(screen.queryByRole("button", { name: "Confirmar criação" })).toBeNull();
  });
  it("remover linha retira o item do envio", async () => {
    renderCreate();
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar Bacillus A" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover Bacillus A" }));
    expect(screen.getByRole("button", { name: "Adicionar Bacillus A" })).toBeEnabled();
  });
  it("paginação e busca são enviadas ao servidor", async () => {
    renderCreate();
    await screen.findByText("Bacillus A");
    fireEvent.click(screen.getByRole("button", { name: "Próximos microrganismos" }));
    expect(await screen.findByText("Fungo B")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar microrganismo"), { target: { value: " fungo " } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar microrganismo" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenLastCalledWith("platform_read_global_microorganisms", expect.objectContaining({ p_search: "fungo", p_offset: 0 })));
  });
  it("resposta tardia de busca anterior é descartada", async () => {
    const pending: Array<(v: unknown) => void> = [];
    mocks.request.mockImplementation((name, a) => name === "platform_read_global_microorganisms"
      ? new Promise((r) => pending.push(() => r(microPage(a)))) : Promise.resolve(createReceipt(a)));
    renderCreate();
    fireEvent.click(screen.getByRole("button", { name: "Buscar microrganismo" }));
    await waitFor(() => expect(pending.length).toBeGreaterThanOrEqual(1));
    fireEvent.change(screen.getByLabelText("Buscar microrganismo"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar microrganismo" }));
    await waitFor(() => expect(pending.length).toBeGreaterThanOrEqual(2));
    pending[0](undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("Carregando microrganismos…")).toBeInTheDocument();
  });
  it("resposta com microrganismo inativo ou campo extra falha fechada", async () => {
    mocks.request.mockImplementation((name) => Promise.resolve(name === "platform_read_global_microorganisms"
      ? { data: { items: [{ id: MICRO, codigo: null, nome: "X", ativo: false }], has_more: false }, error: null } : { data: null, error: null }));
    renderCreate();
    expect(await screen.findByText("Não foi possível consultar os microrganismos.")).toBeInTheDocument();
  });
  it("troca de identidade limpa composição escolhida", async () => {
    const original = mocks.actor;
    const rerender = renderCreate();
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar Bacillus A" }));
    mocks.actor = actor("actor-b"); rerender(); mocks.actor = original; rerender();
    expect(screen.queryByLabelText("Volume (mL) de Bacillus A")).toBeNull();
  });
  it("escala até 6 casas alinhada ao servidor", () => {
    expect(hasMaxSixDecimals(1.123456)).toBe(true);
    expect(hasMaxSixDecimals(1.1234567)).toBe(false);
    expect(hasMaxSixDecimals(1e-7)).toBe(false);
    expect(createPayloadSchema.safeParse({ ...base, dose_ml_ha: 0.1234567 }).success).toBe(false);
  });
});
