import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformCatalogVolumesDialog } from "@/components/plataforma/PlatformCatalogVolumesDialog";
import { createVolume, parseDecimalText, volumeError, VolumeConfirmationRequired, volumePatch, type VolumeRow } from "@/lib/catalogo/platformCatalogVolumes";

const mocks = vi.hoisted(() => ({ request: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const ITEM = "00000000-0000-4000-8000-000000000101";
const VID = "00000000-0000-4000-8000-000000000102";
const V1 = "2026-10-14T19:00:00+00:00";
const row: VolumeRow = { id: VID, item_tipo: "produto", item_id: ITEM, volume_ml: "1000", rotulo: "1 L", preco_brl: "123.45", moeda: "BRL",
  ativo: true, ordem: 0, preco_litro_brl: "123.45", valor_dose_100ml_brl: "12.35", doses_por_volume: "10", updated_at: V1 };
const page = (items: VolumeRow[] = [row]) => ({ item: { tipo: "produto", id: ITEM, nome: "Prod", codigo: "P1", ativo: true,
  pricing: { valor_litro_brl: 123.45, valor_dose_brl: 12.35, valor_ha_brl: null } }, items, has_more: false });
const receipt = (a: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ data: { id: VID, item_tipo: "produto", item_id: ITEM,
  ativo: false, updated_at: "2026-10-14T19:05:00+00:00", repriced: false, idempotency_key: a.p_idempotency_key,
  audit_id: "00000000-0000-4000-8000-000000000103", idempotent: false, ...extra }, error: null });
let handler: (n: string, a: Record<string, unknown>) => unknown;
beforeEach(() => {
  handler = (n, a) => n === "platform_read_global_item_volumes" ? { data: page(), error: null } : receipt(a);
  mocks.request.mockReset().mockImplementation((n, a) => Promise.resolve(handler(n, a)));
  mocks.rpc.mockReset().mockImplementation((n, a) => ({ abortSignal: (s: AbortSignal) => mocks.request(n, a, s) }));
});
afterEach(cleanup);
const writes = () => mocks.rpc.mock.calls.filter(([n]) => !String(n).startsWith("platform_read"));
function mount(scope = "s-a") {
  const client = new QueryClient();
  const tree = (s: string) => <QueryClientProvider client={client}>
    <PlatformCatalogVolumesDialog tipo="produto" itemId={ITEM} nome="Prod" scope={s} onClose={() => undefined} /></QueryClientProvider>;
  const v = render(tree(scope)); return { client, rerender: (s: string) => v.rerender(tree(s)) };
}

describe("decimais sem perda de precisão", () => {
  it("aceita vírgula e normaliza, rejeita zero, excesso de casas, exponencial e acima do limite", () => {
    expect(parseDecimalText("123,40", "preco")).toBe("123.4");
    expect(parseDecimalText("0", "preco")).toBeNull();
    expect(parseDecimalText("1.001", "preco")).toBeNull();
    expect(parseDecimalText("1e3", "volume")).toBeNull();
    expect(parseDecimalText("1000000", "volume")).toBe("1000000");
    expect(parseDecimalText("1000000.5", "volume")).toBeNull();
    expect(parseDecimalText("999999999.99", "preco")).toBe("999999999.99");
  });
  it("criação envia somente strings decimais e campos permitidos", async () => {
    const c = new AbortController();
    await createVolume("produto", ITEM, { volume_ml: "1000", preco_brl: "10.5", rotulo: null, ordem: 0 }, "Motivo válido aqui", "00000000-0000-4000-8000-000000000199", c.signal);
    const args = mocks.rpc.mock.calls[0][1] as { p_payload: Record<string, unknown> };
    expect(args.p_payload).toEqual({ volume_ml: "1000", preco_brl: "10.5", rotulo: null, ordem: 0 });
  });
  it("criação que voltar ativa ou reprecificada é falha", async () => {
    handler = (_n, a) => receipt(a, { repriced: true });
    await expect(createVolume("produto", ITEM, { volume_ml: "1", preco_brl: "1", rotulo: null, ordem: 0 }, "Motivo válido aqui",
      "00000000-0000-4000-8000-000000000198", new AbortController().signal)).rejects.toThrow();
  });
  it("patch só inclui campos alterados", () => {
    expect(volumePatch(row, { volume_ml: "1000", preco_brl: "130", rotulo: "1 L", ordem: 0 })).toEqual({ preco_brl: "130" });
  });
  it("erro 55000 vira confirmação com projeção antes/depois", () => {
    const e = volumeError({ code: "55000", message: "catalog_volume_confirmation_required",
      details: JSON.stringify({ repriced: true, parent_before: { valor_litro_brl: 1, valor_dose_brl: 0.1, valor_ha_brl: null },
        parent_after: { valor_litro_brl: null, valor_dose_brl: null, valor_ha_brl: null } }) });
    expect(e).toBeInstanceOf(VolumeConfirmationRequired);
    expect((e as VolumeConfirmationRequired).repriced).toBe(true);
  });
});

describe("diálogo de apresentações", () => {
  it("lista com derivados do servidor", async () => {
    mount();
    expect((await screen.findAllByText(/R\$ 123,45\/L/))[0]).toBeTruthy();
  });
  it("arquivar apresentação ativa exige confirmação antes de qualquer gravação", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Arquivar 1 L" }));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Motivo de teste válido" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar arquivamento" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByLabelText(/Confirmo o efeito comercial/));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar arquivamento" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect((writes()[0][1] as { p_confirm: boolean }).p_confirm).toBe(true);
  });
  it("valor inválido não chama o servidor", async () => {
    mount();
    await screen.findByRole("button", { name: "Arquivar 1 L" });
    fireEvent.click(screen.getByRole("button", { name: "Nova apresentação" }));
    fireEvent.change(screen.getByLabelText("Volume (mL)"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/Preço da apresentação/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it("leitura com item divergente é erro, não lista vazia", async () => {
    handler = () => ({ data: { ...page(), item: { ...page().item, id: VID } }, error: null });
    mount();
    expect(await screen.findByText("Não foi possível consultar as apresentações.")).toBeTruthy();
    expect(screen.queryByText("Nenhuma apresentação cadastrada.")).toBeNull();
  });
  it("troca de identidade descarta cache do escopo anterior", async () => {
    const { client, rerender } = mount("s-a");
    await screen.findAllByText(/R\$ 123,45\/L/);
    rerender("s-b");
    await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ["platform-catalog-volumes", "s-a"] })).toHaveLength(0));
  });
});
