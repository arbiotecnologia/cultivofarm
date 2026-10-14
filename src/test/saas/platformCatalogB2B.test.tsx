import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCatalogB2BDialog } from "@/components/plataforma/PlatformCatalogB2BDialog";
import { canRequestB2B, setB2BEnabled, type B2BState } from "@/lib/catalogo/platformCatalogB2B";
import { platformCatalogAccess, type PlatformCatalogActor } from "@/lib/catalogo/platformCatalogRead";

const mocks = vi.hoisted(() => ({ actor: {} as PlatformCatalogActor, request: vi.fn(), rpc: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.actor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const ID = "00000000-0000-4000-8000-000000000001";
const AUDIT = "00000000-0000-4000-8000-000000000002";
const KEY = "00000000-0000-4000-8000-0000000000aa";
const T0 = "2026-10-14T21:00:05.879339+00:00"; const T1 = "2026-10-14T21:10:00.000001+00:00";
function actor(id = "actor-a"): PlatformCatalogActor { return { user: { id }, session: { user: { id } },
  profile: { id: "p-" + id, user_id: id, ativo: true, senha_provisoria: false }, roles: ["superadmin"], loading: false, error: null }; }
const st = (o: Partial<B2BState> = {}): B2BState => ({ item_tipo: "produto", id: ID, nome: "Bombarbio", codigo: "FUNG-2",
  ativo: true, b2b_enabled: false, updated_at: T0, ...o });
const receipt = (a: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ data: { item_tipo: a.p_item_tipo, id: a.p_id,
  ativo: true, b2b_enabled: a.p_b2b_enabled, updated_at: T1, idempotency_key: a.p_idempotency_key, audit_id: AUDIT, idempotent: false, ...extra }, error: null });
let current: B2BState;
beforeEach(() => {
  mocks.actor = actor(); mocks.saved.mockReset(); mocks.close.mockReset(); current = st();
  mocks.request.mockReset().mockImplementation((name, a) => Promise.resolve(name === "platform_read_global_b2b_state"
    ? { data: current, error: null } : receipt(a)));
  mocks.rpc.mockReset().mockImplementation((name, a) => ({ abortSignal: (s: AbortSignal) => mocks.request(name, a, s) }));
});
afterEach(cleanup);
const signal = () => new AbortController().signal;
const writes = () => mocks.request.mock.calls.filter(([n]) => n === "platform_set_global_b2b_enabled");

describe("contrato B2B global", () => {
  it("liberar exige item ativo; retirar sempre permitido; sem mudança é negado", () => {
    expect(canRequestB2B(st({ ativo: false }), true)).toBe(false);
    expect(canRequestB2B(st({ ativo: false, b2b_enabled: true }), false)).toBe(true);
    expect(canRequestB2B(st(), true)).toBe(true);
    expect(canRequestB2B(st(), false)).toBe(false);
  });
  it("envia somente tipo/id/versão/alvo/motivo/chave — nunca ativo, preço, dose ou ficha", async () => {
    await setB2BEnabled(st(), true, "Liberação autorizada pelo responsável", KEY, signal());
    const [, args] = writes()[0];
    expect(Object.keys(args).sort()).toEqual(["p_b2b_enabled", "p_expected_updated_at", "p_id", "p_idempotency_key", "p_item_tipo", "p_reason"]);
    expect(args).toMatchObject({ p_item_tipo: "produto", p_expected_updated_at: T0, p_b2b_enabled: true });
  });
  it("liberar inativo falha antes da RPC", async () => {
    await expect(setB2BEnabled(st({ ativo: false }), true, "Liberação autorizada pelo responsável", KEY, signal())).rejects.toThrow(/Ative o item/);
    expect(writes()).toHaveLength(0);
  });
  it("motivo fora de 10..500 falha antes da RPC", async () => {
    await expect(setB2BEnabled(st(), true, "curto", KEY, signal())).rejects.toThrow();
    await expect(setB2BEnabled(st(), true, "x".repeat(501), KEY, signal())).rejects.toThrow();
    expect(writes()).toHaveLength(0);
  });
  it.each<[string, Record<string, unknown>]>([
    ["chave divergente", { idempotency_key: AUDIT }], ["id divergente", { id: AUDIT }], ["tipo divergente", { item_tipo: "microrganismo" }],
    ["alvo divergente", { b2b_enabled: false }], ["ativo divergente", { ativo: false }], ["versão inalterada", { updated_at: T0 }],
    ["campo extra", { valor_litro_brl: "180.00" }],
  ])("recibo inválido não é sucesso: %s", async (_l, extra) => {
    mocks.request.mockImplementation((_n, a) => Promise.resolve(receipt(a, extra)));
    await expect(setB2BEnabled(st(), true, "Liberação autorizada pelo responsável", KEY, signal())).rejects.toThrow();
  });
  it("recibo ausente e erros do servidor viram mensagens seguras", async () => {
    mocks.request.mockResolvedValue({ data: null, error: null });
    await expect(setB2BEnabled(st(), true, "Liberação autorizada pelo responsável", KEY, signal())).rejects.toThrow(/Não foi possível/);
    mocks.request.mockResolvedValue({ data: null, error: { code: "40001", message: "catalog_b2b_conflict" } });
    await expect(setB2BEnabled(st(), true, "Liberação autorizada pelo responsável", KEY, signal())).rejects.toThrow(/mudou/);
    mocks.request.mockResolvedValue({ data: null, error: { code: "22023", message: "catalog_b2b_requires_active" } });
    await expect(setB2BEnabled(st(), true, "Liberação autorizada pelo responsável", KEY, signal())).rejects.toThrow(/Ative o item/);
  });
  it("replay idempotente devolvido pelo servidor é aceito", async () => {
    mocks.request.mockImplementation((_n, a) => Promise.resolve(receipt(a, { idempotent: true })));
    await expect(setB2BEnabled(st(), true, "Liberação autorizada pelo responsável", KEY, signal())).resolves.toMatchObject({ idempotent: true });
  });
});

describe("diálogo B2B global", () => {
  const open = () => render(<PlatformCatalogB2BDialog tipo="produto" itemId={ID} scope={platformCatalogAccess(mocks.actor).scope}
    onClose={mocks.close} onSaved={mocks.saved} />);
  it("lê o estado no servidor, exige motivo e confirmação explícita, e salva", async () => {
    open();
    expect(await screen.findByText("Bombarbio (FUNG-2)")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Liberar para B2B" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Liberação autorizada pelo responsável" } });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(1);
  });
  it("item inativo: aviso e nenhuma gravação possível", async () => {
    current = st({ ativo: false });
    open();
    expect(await screen.findByText("Ative o item antes de liberá-lo para o B2B.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liberar para B2B" })).toBeDisabled();
    expect(writes()).toHaveLength(0);
  });
  it("erro do servidor aparece e o botão é liberado (sem 'Confirmando…' preso)", async () => {
    open();
    await screen.findByText("Bombarbio (FUNG-2)");
    mocks.request.mockImplementation((n) => Promise.resolve(n === "platform_read_global_b2b_state" ? { data: current, error: null }
      : { data: null, error: { code: "40001", message: "catalog_b2b_conflict" } }));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Liberação autorizada pelo responsável" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Liberar para B2B" }));
    expect(await screen.findByText(/mudou/)).toBeInTheDocument();
    expect(screen.queryByText("Confirmando…")).not.toBeInTheDocument();
    expect(mocks.saved).not.toHaveBeenCalled();
  });
  it("falha na leitura não oferece ação", async () => {
    mocks.request.mockResolvedValue({ data: null, error: { code: "42501" } });
    open();
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /B2B/ })).not.toBeInTheDocument();
  });
  it("sem Superadmin pronto, nada renderiza nem chama RPC", () => {
    const scope = platformCatalogAccess(mocks.actor).scope;
    mocks.actor = { ...actor(), roles: ["administrador"] };
    render(<PlatformCatalogB2BDialog tipo="produto" itemId={ID} scope={scope} onClose={mocks.close} onSaved={mocks.saved} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
