import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { supplierLabel, NEUTRAL_SUPPLIER } from "@/lib/comercial/supplierName";
import { parsePartnerVolumes, isRpcAbsent, PARTNER_VOLUMES_CONTRACT } from "@/hooks/usePartnerCatalogVolumes";
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
  it("só ausência exata do RPC permite a leitura anterior", () => {
    expect(isRpcAbsent({ code: "PGRST202" })).toBe(true);
    expect(isRpcAbsent({ code: "42883" })).toBe(true);
    for (const code of ["42501", "PGRST301", "22023", undefined]) expect(isRpcAbsent({ code })).toBe(false);
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
