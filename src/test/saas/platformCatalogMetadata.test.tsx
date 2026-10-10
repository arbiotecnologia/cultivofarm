import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCatalogMetadataDialog } from "@/components/plataforma/PlatformCatalogMetadataDialog";
import { metadataPatchSchema, metadataRetryKey, metadataValuesSchema, updateMetadata, type MetadataDetail } from "@/lib/catalogo/platformCatalogMetadata";
import { platformCatalogAccess, type PlatformCatalogActor } from "@/lib/catalogo/platformCatalogRead";
const mocks = vi.hoisted(() => ({ actor: {} as PlatformCatalogActor, request: vi.fn(), rpc: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
const detail: MetadataDetail = { id: "00000000-0000-4000-8000-000000000001", updated_at: "2026-10-10T14:00:00+00:00",
  nome: "Produto existente", descricao: null, modo_acao: null, funcao_completa: "Função original", modo_aplicacao: null };
const nextTime = "2026-10-10T15:00:00+00:00";
const receipt = (args: Record<string, unknown>) => ({ data: { id: detail.id, updated_at: nextTime,
  idempotency_key: args.p_idempotency_key, audit_id: "00000000-0000-4000-8000-000000000002", idempotent: false }, error: null });
function actor(): PlatformCatalogActor { return { user: { id: "actor-a" }, session: { user: { id: "actor-a" } },
  profile: { id: "profile-a", user_id: "actor-a", ativo: true, senha_provisoria: false }, roles: ["superadmin"], loading: false, error: null }; }
function setup() {
  const scope = platformCatalogAccess(mocks.actor).scope;
  const tree = () => <PlatformCatalogMetadataDialog id={detail.id} scope={scope} onClose={mocks.close} onSaved={mocks.saved} />;
  const view = render(tree()); return () => view.rerender(tree());
}
async function fill() {
  await screen.findByDisplayValue(detail.nome);
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nome revisado" } });
  fireEvent.change(screen.getByLabelText("Motivo da alteração (10 a 500 caracteres)"), { target: { value: "Correção documental" } });
}
beforeEach(() => {
  mocks.actor = actor(); mocks.saved.mockReset(); mocks.close.mockReset();
  mocks.request.mockReset().mockImplementation((name, args) => Promise.resolve(name === "platform_read_global_product_metadata" ? { data: detail, error: null } : receipt(args)));
  mocks.rpc.mockReset().mockImplementation((name, args) => ({ abortSignal: (signal: AbortSignal) => mocks.request(name, args, signal) }));
});
afterEach(cleanup);
describe("edição global de metadados", () => {
  it("chave sobrevive remount mas não atravessa identidade ou conteúdo", () => {
    const key = metadataRetryKey("scope-a", "pedido-exato");
    expect(metadataRetryKey("scope-a", "pedido-exato")).toBe(key);
    expect(metadataRetryKey("scope-b", "pedido-exato")).not.toBe(key);
    expect(metadataRetryKey("scope-a", "outro-pedido")).not.toBe(key);
  });
  it.each(["descricao", "modo_acao", "funcao_completa", "modo_aplicacao"])("aceita null e limita %s a 10000 caracteres", (field) => {
    expect(metadataPatchSchema.safeParse({ [field]: null }).success).toBe(true);
    expect(metadataPatchSchema.safeParse({ [field]: "x".repeat(10000) }).success).toBe(true);
    expect(metadataPatchSchema.safeParse({ [field]: "x".repeat(10001) }).success).toBe(false);
  });
  it("nome exige 1 a 500 caracteres e patch não pode ser vazio", () => {
    expect(metadataPatchSchema.safeParse({ nome: " " }).success).toBe(false);
    expect(metadataPatchSchema.safeParse({ nome: "x".repeat(500) }).success).toBe(true);
    expect(metadataPatchSchema.safeParse({ nome: "x".repeat(501) }).success).toBe(false);
    expect(metadataPatchSchema.safeParse({}).success).toBe(false);
  });
  it("envia somente campo alterado/versão/motivo e confirma recibo antes de sucesso", async () => {
    setup(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenLastCalledWith("platform_update_global_product_metadata", {
      p_id: detail.id, p_expected_updated_at: detail.updated_at, p_patch: { nome: "Nome revisado" },
      p_reason: "Correção documental", p_idempotency_key: expect.any(String),
    });
  });
  it.each(["40001", "42501"])("erro %s não reporta sucesso nem vaza mensagem servidor", async (code) => {
    mocks.request.mockImplementation((name) => Promise.resolve(name === "platform_read_global_product_metadata" ? { data: detail, error: null } : { data: null, error: { code, message: "privado" } }));
    setup(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    await screen.findByRole("alert"); expect(mocks.saved).not.toHaveBeenCalled(); expect(screen.queryByText("privado")).toBeNull();
  });
  it("retry manual mantém chave e aceita replay confirmado", async () => {
    let calls = 0;
    mocks.request.mockImplementation((name, args) => {
      if (name === "platform_read_global_product_metadata") return Promise.resolve({ data: detail, error: null });
      calls++; return Promise.resolve(calls === 1 ? { data: null, error: {} } : { ...receipt(args), data: { ...receipt(args).data, idempotent: true } });
    });
    setup(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" })); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" })); await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    const writes = mocks.rpc.mock.calls.filter(([name]) => name === "platform_update_global_product_metadata");
    expect(writes).toHaveLength(2); expect(writes[0][1].p_idempotency_key).toBe(writes[1][1].p_idempotency_key);
  });
  it("clique duplo não envia segunda escrita", async () => {
    mocks.request.mockImplementation((name) => name === "platform_read_global_product_metadata" ? Promise.resolve({ data: detail, error: null }) : new Promise(() => {}));
    setup(); await fill(); const save = screen.getByRole("button", { name: "Salvar alteração" }); fireEvent.click(save); fireEvent.click(save);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "platform_update_global_product_metadata")).toHaveLength(1);
  });
  it("perda de identidade descarta sucesso tardio", async () => {
    let resolve: ((data: ReturnType<typeof receipt>) => void) | undefined; let args: Record<string, unknown> = {};
    mocks.request.mockImplementation((name, input) => name === "platform_read_global_product_metadata" ? Promise.resolve({ data: detail, error: null }) : new Promise((r) => { args = input; resolve = r; }));
    const rerender = setup(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    mocks.actor = { ...actor(), user: null }; rerender(); await act(async () => resolve?.(receipt(args)));
    expect(mocks.saved).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("resposta tardia de leitura não preenche formulário após troca de perfil", async () => {
    let resolve: ((data: { data: MetadataDetail; error: null }) => void) | undefined;
    mocks.request.mockImplementation(() => new Promise((r) => { resolve = r; })); const rerender = setup();
    mocks.actor = { ...actor(), roles: ["administrador"] }; rerender();
    await act(async () => resolve?.({ data: detail, error: null })); expect(screen.queryByDisplayValue(detail.nome)).toBeNull();
  });
  it.each([{}, { id: "00000000-0000-4000-8000-000000000003" }, { updated_at: detail.updated_at }, { idempotency_key: "00000000-0000-4000-8000-000000000004" }])("recibo inválido/divergente não confirma %j", async (delta) => {
    mocks.request.mockImplementation((name, args) => Promise.resolve(name === "platform_read_global_product_metadata" ? { data: detail, error: null } : { data: Object.keys(delta).length ? { ...receipt(args).data, ...delta } : {}, error: null }));
    setup(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" })); await screen.findByRole("alert"); expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("motivo ausente e texto sem alteração não escrevem", async () => {
    setup(); await screen.findByDisplayValue(detail.nome); fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["valor_litro_brl", "tipo", "codigo", "ativo", "b2b_enabled", "organization_id", "familia_catalogo", "dose_ml_ha", "composicao"])("whitelist rejeita %s", (field) => {
    expect(metadataPatchSchema.safeParse({ nome: "Alterado", [field]: "forjado" }).success).toBe(false);
  });
  it("payload completo rejeita extra antes de RPC", async () => {
    const values = { nome: "Revisado", descricao: null, modo_acao: null, funcao_completa: null, modo_aplicacao: null, ativo: true };
    expect(metadataValuesSchema.safeParse(values).success).toBe(false);
    await expect(updateMetadata(detail, values, "Correção documental", crypto.randomUUID(), new AbortController().signal)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
