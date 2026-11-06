import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { supplierLabel, NEUTRAL_SUPPLIER } from "@/lib/comercial/supplierName";
const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
import { parsePartnerVolumes, isRpcAbsent, fetchPartnerCatalogVolumes, PARTNER_VOLUMES_CONTRACT } from "@/hooks/usePartnerCatalogVolumes";
const ABSENT = "Could not find the function public.get_partner_catalog_volumes_secure(p_partner_id) in the schema cache";
const resp = (v: unknown) => { const p = Promise.resolve(v); return Object.assign(p, { abortSignal: () => p }); };
import { minDeliveryHint } from "@/lib/b2bDeliveryDate";
import { AddToCartDialog } from "@/components/catalogo/AddToCartDialog";

const PARTNER = "7e52de9a-4bed-4d1e-8200-3255a805465c";
const PRODUCT = "bd0eca62-7fba-4e41-a88c-bb0610b6d8fd";
const VOLUME = "b86f2fe8-e6b7-43e4-8345-53bd9e2a3b03";
const ack = (over: Record<string, unknown> = {}) => ({
  contract: PARTNER_VOLUMES_CONTRACT, partner_id: PARTNER, seller: { name: "AR Bio" },
  volumes: [{ id: VOLUME, item_tipo: "produto", produto_id: PRODUCT, microrganismo_id: null, volume_ml: 1000, rotulo: "1 L", ordem: 0 }],
  ...over,
});

describe("nome do fornecedor", () => {
  it("usa o nome do vendedor e cai no rótulo neutro sem nome", () => {
    expect(supplierLabel("AR Bio")).toBe("AR Bio");
    expect(supplierLabel("  Outra Empresa  ")).toBe("Outra Empresa");
    for (const v of [null, undefined, "", "   ", 42]) expect(supplierLabel(v)).toBe(NEUTRAL_SUPPLIER);
    expect(minDeliveryHint("AR Bio")).toContain("comercial da AR Bio");
    expect(minDeliveryHint(null)).toContain("comercial da empresa fornecedora");
    expect(minDeliveryHint(null)).not.toContain("Cultivo Farm");
  });
});

describe("parser B2B_PARTNER_VOLUMES_V1", () => {
  it("indexa o volume 1 L do produto químico e o nome do vendedor, sem preço", () => {
    const r = parsePartnerVolumes(ack(), PARTNER);
    expect(r.sellerName).toBe("AR Bio");
    expect(r.porProdutoId.get(PRODUCT)?.map(v => [v.id, v.volume_ml, v.preco_brl])).toEqual([[VOLUME, 1000, 0]]);
    expect(r.source).toBe("scoped");
  });
  it("nome vazio vira null (rótulo neutro)", () => {
    expect(parsePartnerVolumes(ack({ seller: { name: " " } }), PARTNER).sellerName).toBeNull();
    expect(parsePartnerVolumes(ack({ seller: { name: null } }), PARTNER).sellerName).toBeNull();
  });
  it("falha fechado com contrato, parceiro ou linha divergente", () => {
    const bad = [ack({ contract: "OUTRO" }), ack({ partner_id: "00000000-0000-0000-0000-000000000000" }),
      ack({ seller: undefined }), ack({ seller: { name: 7 } }),
      ack({ volumes: [{ id: VOLUME, item_tipo: "produto", produto_id: PRODUCT, volume_ml: 0 }] }),
      ack({ volumes: [{ id: "x", item_tipo: "produto", produto_id: PRODUCT, volume_ml: 1000 }] }),
      ack({ volumes: [{ id: VOLUME, item_tipo: "produto", produto_id: PRODUCT, volume_ml: 1000 }, { id: VOLUME, item_tipo: "produto", produto_id: PRODUCT, volume_ml: 500 }] }),
      null, []];
    for (const raw of bad) expect(() => parsePartnerVolumes(raw, PARTNER)).toThrow("partner_volumes_contract_unavailable");
  });
  it("só ausência exata do endpoint permite a leitura anterior; 42883 nunca", () => {
    expect(isRpcAbsent({ code: "PGRST202", message: ABSENT })).toBe(true);
    for (const e of [{ code: "PGRST202" }, { code: "PGRST202", message: "absent" },
      { code: "PGRST202", message: "Could not find the function public.get_partner_catalog_secure(p_partner_id) in the schema cache" },
      { code: "PGRST202", message: "Could not find the function public.get_partner_catalog_volumes_secure(p_other) in the schema cache" },
      { code: "42883", message: ABSENT }, { code: "42883", message: "function platform_private.b2b_partner_catalog_reader(uuid) does not exist" },
      { code: "42501" }, { code: "PGRST301" }, { code: "22023" }, null, undefined])
      expect(isRpcAbsent(e as never)).toBe(false);
  });
  it("parser recusa linhas nulas/primitivas/arrays e volume não numérico antes de ler campos", () => {
    for (const row of [null, undefined, 7, "x", [], { id: VOLUME, item_tipo: "produto", produto_id: PRODUCT, volume_ml: "1000" }])
      expect(() => parsePartnerVolumes(ack({ volumes: [row] }), PARTNER)).toThrow("partner_volumes_contract_unavailable");
  });
});

describe("fetchPartnerCatalogVolumes — sem REST direto quando a instalação está quebrada", () => {
  beforeEach(() => { rpcMock.mockReset(); fromMock.mockReset(); });
  const signal = new AbortController().signal;
  it("42883 de função interna propaga erro e não consulta catalogo_volumes", async () => {
    rpcMock.mockReturnValue(resp({ data: null, error: { code: "42883", message: "function platform_private.b2b_partner_catalog_reader(uuid) does not exist" } }));
    await expect(fetchPartnerCatalogVolumes(PARTNER, signal)).rejects.toMatchObject({ code: "42883" });
    expect(fromMock).not.toHaveBeenCalled();
  });
  it("PGRST202 genérico também falha fechado sem REST", async () => {
    rpcMock.mockReturnValue(resp({ data: null, error: { code: "PGRST202", message: "absent" } }));
    await expect(fetchPartnerCatalogVolumes(PARTNER, signal)).rejects.toMatchObject({ code: "PGRST202" });
    expect(fromMock).not.toHaveBeenCalled();
  });
  it("ausência exata do endpoint usa a leitura anterior", async () => {
    rpcMock.mockReturnValue(resp({ data: null, error: { code: "PGRST202", message: ABSENT } }));
    const q = { select: () => q, eq: () => q, abortSignal: () => Promise.resolve({ data: [], error: null }) };
    fromMock.mockReturnValue(q);
    await expect(fetchPartnerCatalogVolumes(PARTNER, signal)).resolves.toMatchObject({ source: "legacy_direct", sellerName: null });
    expect(fromMock).toHaveBeenCalledWith("catalogo_volumes");
  });
});

describe("diálogo Adicionar ao carrinho", () => {
  const row = { id: PRODUCT, tipo: "produto", nome: "TESTE AUDITORIA QUIMICO 20261021", codigo: "Q-1" } as never;
  const base = { open: true, onOpenChange: vi.fn(), row, onConfirm: vi.fn(), valorLitroBase: 1, descontoPct: 0 };
  beforeEach(() => vi.clearAllMocks());

  it("com volume escopado não mostra o aviso de ausência", () => {
    const data = parsePartnerVolumes(ack(), PARTNER);
    render(<AddToCartDialog {...base} volumesCat={data} volumesStatus="success" supplierName="AR Bio" />);
    expect(screen.queryByText(/Nenhum volume comercial/)).toBeNull();
    expect(screen.getByRole("button", { name: "Adicionar ao carrinho" })).toBeTruthy();
  });
  it("sem volume cita o vendedor AR Bio, nunca Cultivo Farm", () => {
    const data = parsePartnerVolumes(ack({ volumes: [] }), PARTNER);
    render(<AddToCartDialog {...base} volumesCat={data} volumesStatus="success" supplierName="AR Bio" />);
    expect(screen.getByText("Nenhum volume comercial cadastrado para este item. Solicite à AR Bio.")).toBeTruthy();
    expect(screen.queryByText(/Cultivo Farm/)).toBeNull();
  });
  it("outro tenant vendedor usa o próprio nome", () => {
    render(<AddToCartDialog {...base} volumesCat={parsePartnerVolumes(ack({ volumes: [] }), PARTNER)} supplierName="Outra Vendedora" />);
    expect(screen.getByText(/Solicite à Outra Vendedora\./)).toBeTruthy();
  });
  it("nome ausente usa rótulo neutro", () => {
    render(<AddToCartDialog {...base} volumesCat={parsePartnerVolumes(ack({ volumes: [], seller: { name: null } }), PARTNER)} supplierName={null} />);
    expect(screen.getByText(/Solicite à empresa fornecedora\./)).toBeTruthy();
  });
  it("carregando não afirma ausência de volume", () => {
    render(<AddToCartDialog {...base} volumesCat={null} volumesStatus="pending" supplierName={null} />);
    expect(screen.getByRole("status").textContent).toMatch(/Carregando apresentações/);
    expect(screen.queryByText(/Nenhum volume comercial/)).toBeNull();
  });
  it("erro de leitura não afirma ausência de volume", () => {
    render(<AddToCartDialog {...base} volumesCat={null} volumesStatus="error" />);
    expect(screen.getByRole("alert").textContent).toMatch(/Não foi possível carregar/);
    expect(screen.queryByText(/Nenhum volume comercial/)).toBeNull();
  });
});

describe("fluxo B2B do comprador não nomeia Cultivo Farm como fornecedor", () => {
  it("arquivos ajustados não contêm a marca como fornecedor", () => {
    for (const f of ["components/catalogo/AddToCartDialog.tsx", "hooks/useCreatePartnerOrder.ts",
      "pages/portal-parceiro/PortalParceiroLayout.tsx", "components/portal-parceiro/TimelinePedidoDialog.tsx",
      "pages/portal-parceiro/UsuariosClientesB2B.tsx", "pages/portal-parceiro/FichasTecnicas.tsx"]) {
      expect(readFileSync(resolve(__dirname, "../../", f), "utf8")).not.toMatch(/(à|da|com a|comercial) Cultivo Farm/);
    }
  });
});
