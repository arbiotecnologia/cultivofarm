/**
 * FASE 27A — Contratos de fontes canônicas do Catálogo Cultivo Farm.
 * Auditoria por leitura estática: garante que o carrinho/pedido B2B continua
 * ancorado nas RPCs seguras e que a ficha unificada permanece somente leitura.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("FASE 27A — RPCs canônicas do catálogo B2B", () => {
  it("usePartnerCatalog usa get_partner_catalog_secure", () => {
    const src = read("src/hooks/usePartnerCatalog.ts");
    expect(src).toContain("get_partner_catalog_secure");
  });

  it("usePartnerCatalogTecnico usa get_partner_catalog_tecnico_secure", () => {
    const src = read("src/hooks/usePartnerCatalogTecnico.ts");
    expect(src).toContain("get_partner_catalog_tecnico_secure");
  });

  it("useCreatePartnerOrder usa create_partner_order_secure e envia unidade_medida", () => {
    const src = read("src/hooks/useCreatePartnerOrder.ts");
    expect(src).toContain("create_partner_order_secure");
    expect(src).toContain("unidade_medida");
  });
});

describe("FASE 27A — NovoPedido preserva as fontes oficiais", () => {
  const src = read("src/pages/portal-parceiro/NovoPedido.tsx");

  it("importa os catálogos canônicos", () => {
    expect(src).toContain("usePartnerCatalog");
    expect(src).toContain("usePartnerCatalogTecnico");
  });

  it("mantém AddToCartDialog e unidade_medida no fluxo de carrinho", () => {
    expect(src).toContain("AddToCartDialog");
    expect(src).toContain("unidade_medida");
  });

  it("não consulta tabelas de catálogo diretamente para o carrinho", () => {
    expect(src).not.toContain('.from("produtos")');
    expect(src).not.toContain('.from("microrganismos")');
  });
});

describe("FASE 27A — CatalogoItemDrawer somente leitura", () => {
  const src = read("src/components/catalogo/CatalogoItemDrawer.tsx");

  it("não acessa backend nem muta estado remoto", () => {
    for (const proibido of ["supabase", ".rpc(", "useQuery", "useMutation"]) {
      expect(src).not.toContain(proibido);
    }
  });

  it("não expõe ações de publicação ou carrinho", () => {
    expect(src).not.toContain("AddToCartDialog");
    expect(src).not.toContain("Despublicar");
  });
});

describe("FASE 27A — Exposição por portal", () => {
  it("FichasTecnicas B2B filtra b2b_enabled e ficha aprovada", () => {
    const src = read("src/pages/portal-parceiro/FichasTecnicas.tsx");
    expect(src).toContain("b2b_enabled");
    expect(src).toContain("status_validacao");
    expect(src).toContain("aprovado");
  });

  it("MobileCatalogoTecnico não expõe custo interno nem auditoria", () => {
    const src = read("src/pages/app/MobileCatalogoTecnico.tsx").toLowerCase();
    expect(src).not.toContain("custo interno");
    expect(src).not.toContain("auditoria");
    expect(src).not.toContain("catalog_technical_audit_logs");
  });
});

describe("FASE 27A — useCatalogoUnificado sem SELECT * e com gate B2B", () => {
  const src = read("src/hooks/useCatalogoUnificado.ts");

  it("nunca usa select('*')", () => {
    expect(src).not.toContain('select("*")');
  });

  it("bloqueia texto técnico interno no escopo B2B", () => {
    expect(src).toContain("isB2B ? null");
  });

  it("B2B recebe apenas itens ativos e habilitados", () => {
    expect(src).toContain("r.ativo && r.b2b_enabled");
  });

  it("conteúdo de ficha no B2B depende de status aprovado", () => {
    expect(src).toContain('status === "aprovado"');
  });
});
