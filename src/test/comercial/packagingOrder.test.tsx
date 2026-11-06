import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
import {
  PACKAGING_ORDER_CONTRACT, parsePackagingOffers, isPackagingReaderAbsent, orderLineFor, isWholePackagingQty,
} from "@/lib/comercial/packagingOrder";
import { fetchPartnerPackagingOffers } from "@/hooks/usePartnerPackagingOffers";
import { orderAttemptFingerprint } from "@/lib/authz/pendingOrderAttempt";
import { AddPackagingToCartDialog } from "@/components/catalogo/AddPackagingToCartDialog";

const PARTNER = "7e52de9a-4bed-4d1e-8200-3255a805465c";
const SOLID = "161758e3-0000-4000-8000-000000000001";
const PK = "366e6f04-0000-4000-8000-000000000002";
const PK2 = "366e6f04-0000-4000-8000-000000000003";
const ABSENT = "Could not find the function public.get_partner_packaging_offers_secure(p_partner_id) in the schema cache";
const resp = (v: unknown) => { const p = Promise.resolve(v); return Object.assign(p, { abortSignal: () => p }); };
const offer = (o: Record<string, unknown> = {}) => ({
  product_id: SOLID, packaging_id: PK, codigo: "SC25", descricao: "Saco 25 kg", rotulo: null,
  unidade_conteudo: "kg", peso_liquido_kg: 25, version: 1, preco_tabela_brl: 340, ...o,
});
const ack = (over: Record<string, unknown> = {}) => ({ contract: PACKAGING_ORDER_CONTRACT, partner_id: PARTNER, offers: [offer()], solid_products: [{ product_id: SOLID, unidade_conteudo: "kg" }], ...over });

describe("parser B2B_PARTNER_PACKAGING_ORDER_V1", () => {
  it("indexa a embalagem por produto", () => {
    const m = parsePackagingOffers(ack(), PARTNER);
    expect(m.get(SOLID)?.map((o) => [o.packaging_id, o.peso_liquido_kg, o.preco_tabela_brl])).toEqual([[PK, 25, 340]]);
  });
  it.each([
    ["contrato errado", ack({ contract: "X" })],
    ["outro parceiro", ack({ partner_id: "00000000-0000-4000-8000-000000000000" })],
    ["chave extra no envelope", { ...ack(), seller: {} }],
    ["linha nula", ack({ offers: [null] })],
    ["chave extra na oferta", ack({ offers: [{ ...offer(), preco_final: 1 }] })],
    ["unidade inválida", ack({ offers: [offer({ unidade_conteudo: "un" })] })],
    ["peso zero", ack({ offers: [offer({ peso_liquido_kg: 0 })] })],
    ["preço zero", ack({ offers: [offer({ preco_tabela_brl: 0 })] })],
    ["embalagem duplicada", ack({ offers: [offer(), offer()] })],
  ])("recusa %s", (_n, raw) => {
    expect(() => parsePackagingOffers(raw, PARTNER)).toThrow("packaging_contract_unavailable");
  });
});

describe("leitor de embalagens", () => {
  beforeEach(() => rpcMock.mockReset());
  it("ausência exata do endpoint => não instalado (sólidos fechados)", async () => {
    rpcMock.mockReturnValue(resp({ data: null, error: { code: "PGRST202", message: ABSENT } }));
    expect((await fetchPartnerPackagingOffers(PARTNER, new AbortController().signal)).state).toBe("not_installed");
  });
  it.each([
    [{ code: "42883", message: "function platform_private.b2b_packaging_line does not exist" }],
    [{ code: "PGRST202", message: "Could not find the function public.outra(p_partner_id) in the schema cache" }],
    [{ code: "42501", message: "forbidden_partner" }],
  ])("outros erros falham fechado: %o", async (error) => {
    rpcMock.mockReturnValue(resp({ data: null, error }));
    await expect(fetchPartnerPackagingOffers(PARTNER, new AbortController().signal)).rejects.toBeTruthy();
    expect(isPackagingReaderAbsent(error)).toBe(false);
  });
  it("sucesso exige contrato confirmado", async () => {
    rpcMock.mockReturnValue(resp({ data: ack(), error: null }));
    const r = await fetchPartnerPackagingOffers(PARTNER, new AbortController().signal);
    expect(r.state).toBe("available");
    expect(rpcMock).toHaveBeenCalledWith("get_partner_packaging_offers_secure", { p_partner_id: PARTNER });
  });
});

describe("linha enviada ao servidor", () => {
  it("embalagem: só 4 chaves, sem preço/volume/unidade", () => {
    expect(orderLineFor({ item_id: SOLID, item_tipo: "produto", quantidade: 2, unidade_pedido: "embalagem", packaging_id: PK }))
      .toEqual({ item_id: SOLID, item_tipo: "produto", packaging_id: PK, quantidade: 2 });
  });
  it("líquido mantém o formato atual", () => {
    expect(orderLineFor({ item_id: SOLID, item_tipo: "produto", quantidade: 3, unidade_pedido: "volume_comercial", volume_ml: 1000 }))
      .toEqual({ item_id: SOLID, item_tipo: "produto", quantidade: 3, unidade_medida: "unidade", volume_ml: 1000 });
  });
  it.each([
    ["fracionada", { quantidade: 1.5, packaging_id: PK }],
    ["zero", { quantidade: 0, packaging_id: PK }],
    ["sem embalagem", { quantidade: 1, packaging_id: null }],
  ])("recusa embalagem %s", (_n, o) => {
    expect(() => orderLineFor({ item_id: SOLID, item_tipo: "produto", unidade_pedido: "embalagem", ...o } as never)).toThrow("packaging_line_invalid");
  });
  it("recusa linha que mistura volume e embalagem", () => {
    expect(() => orderLineFor({ item_id: SOLID, item_tipo: "produto", quantidade: 1, unidade_pedido: "volume_comercial", volume_ml: 1000, packaging_id: PK }))
      .toThrow("packaging_line_invalid");
  });
  it("recusa microrganismo por embalagem", () => {
    expect(() => orderLineFor({ item_id: SOLID, item_tipo: "microrganismo", quantidade: 1, unidade_pedido: "embalagem", packaging_id: PK })).toThrow();
  });
  it("quantidade inteira", () => {
    expect([1, 7].every(isWholePackagingQty)).toBe(true);
    expect([0, -1, 1.2, NaN, Infinity, "2"].some(isWholePackagingQty)).toBe(false);
  });
});

describe("impressão da tentativa (idempotência local)", () => {
  const base = { partner_id: PARTNER, items: [{ item_id: SOLID, item_tipo: "produto", quantidade: 1, unidade_pedido: "volume_comercial", volume_ml: 1000 }] };
  it("líquido sem embalagem mantém a impressão já gravada", () => {
    const withNull = { ...base, items: [{ ...base.items[0], packaging_id: null }] };
    expect(orderAttemptFingerprint(withNull)).toBe(orderAttemptFingerprint(base));
  });
  it("embalagens diferentes geram tentativas diferentes", () => {
    const mk = (pk: string) => ({ partner_id: PARTNER, items: [{ item_id: SOLID, item_tipo: "produto", quantidade: 1, unidade_pedido: "embalagem", packaging_id: pk }] });
    expect(orderAttemptFingerprint(mk(PK))).not.toBe(orderAttemptFingerprint(mk(PK2)));
  });
});

describe("diálogo de embalagem", () => {
  it("só adiciona inteiros > 0 e mostra peso para frete", () => {
    const onConfirm = vi.fn();
    const offers = parsePackagingOffers(ack(), PARTNER).get(SOLID)!;
    render(<AddPackagingToCartDialog open onOpenChange={() => {}} nome="Fertilizante" offers={offers} onConfirm={onConfirm} />);
    const input = screen.getByLabelText("Quantidade de embalagens");
    fireEvent.change(input, { target: { value: "1.5" } });
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "2" } });
    expect(screen.getByText(/Peso total para frete: 50 kg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onConfirm).toHaveBeenCalledWith({ offer: offers[0], quantidade: 2 });
  });
});
