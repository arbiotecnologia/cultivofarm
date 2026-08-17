import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const GRID = "src/components/catalogo/CatalogoCardsGrid.tsx";
const DRAWER = "src/components/catalogo/CatalogoItemDrawer.tsx";
const ADD_CART = "src/components/catalogo/AddToCartDialog.tsx";
const NOVO_PEDIDO = "src/pages/portal-parceiro/NovoPedido.tsx";
const FICHAS = "src/pages/portal-parceiro/FichasTecnicas.tsx";
const MOBILE = "src/pages/app/MobileCatalogoTecnico.tsx";
const NAV = "src/config/navigation.ts";
const APP = "src/App.tsx";
const HOOK_PARTNER = "src/hooks/usePartnerCatalog.ts";
const HOOK_PARTNER_TEC = "src/hooks/usePartnerCatalogTecnico.ts";
const HOOK_ORDER = "src/hooks/useCreatePartnerOrder.ts";

describe("FASE 27E — 27D certificada (renderização incremental)", () => {
  const src = read(GRID);

  it("mantém CATALOGO_PAGE_SIZE = 60", () => {
    expect(src).toMatch(/export const CATALOGO_PAGE_SIZE = 60;/);
  });

  it("aplica o limite após a ordenação (visiveis a partir de sorted)", () => {
    expect(src).toMatch(/const visiveis = useMemo\(/);
    expect(src).toMatch(/sorted\.length > limite \? sorted\.slice\(0, limite\) : sorted/);
    expect(src).toMatch(/visiveis\.map\(/);
  });

  it("Mostrar mais apenas incrementa o limite local, sem nova query", () => {
    expect(src).toMatch(/setLimite\(\(l\) => l \+ CATALOGO_PAGE_SIZE\)/);
    expect(src).toContain("Mostrar mais");
  });

  it("reseta o limite ao mudar search, tipo, status, b2b, sort e scope", () => {
    const dep = src.match(/setLimite\(CATALOGO_PAGE_SIZE\);\s*\}, \[([^\]]+)\]/);
    expect(dep).toBeTruthy();
    for (const d of ["search", "tipo", "status", "b2b", "sort", "scope"]) {
      expect(dep![1]).toContain(d);
    }
  });

  it("preserva ações, slots e dialogs técnicos", () => {
    for (const token of [
      "Ver ficha",
      "Ficha completa",
      "actionSlot",
      "pricingSlot",
      "FichaProdutorDrawer",
      "ProductTechnicalProfileDialog",
      "MicroorganismTechnicalProfileDialog",
      "CatalogoItemDrawer",
    ]) {
      expect(src).toContain(token);
    }
  });

  it("grid e drawer permanecem puros (sem acesso a dados)", () => {
    for (const f of [GRID, DRAWER]) {
      const c = read(f);
      expect(c).not.toMatch(/\bsupabase\b/);
      expect(c).not.toMatch(/\.rpc\(/);
      expect(c).not.toMatch(/\buseQuery\b/);
      expect(c).not.toMatch(/\buseMutation\b/);
    }
  });
});

describe("FASE 27E — portal parceiro usa RPCs seguras", () => {
  it("usePartnerCatalog usa get_partner_catalog_secure", () => {
    expect(read(HOOK_PARTNER)).toContain("get_partner_catalog_secure");
  });

  it("usePartnerCatalogTecnico usa get_partner_catalog_tecnico_secure", () => {
    expect(read(HOOK_PARTNER_TEC)).toContain("get_partner_catalog_tecnico_secure");
  });

  it("NovoPedido usa os hooks seguros como fonte do carrinho", () => {
    const c = read(NOVO_PEDIDO);
    expect(c).toContain("usePartnerCatalog");
    expect(c).toContain("usePartnerCatalogTecnico");
    expect(c).toContain("AddToCartDialog");
    expect(c).not.toMatch(/useCatalogoUnificado\(/);
  });

  it("FichasTecnicas filtra b2b_enabled e ficha aprovada", () => {
    const c = read(FICHAS);
    expect(c).toContain("b2b_enabled");
    expect(c).toContain("status_validacao");
    expect(c).toContain("aprovado");
  });
});

describe("FASE 27E — carrinho e unidades comerciais", () => {
  it("useCreatePartnerOrder envia unidade_medida via create_partner_order_secure", () => {
    const c = read(HOOK_ORDER);
    expect(c).toContain("create_partner_order_secure");
    expect(c).toContain("unidade_medida");
    expect(c).toMatch(/case "hectare": return "hectare";/);
    expect(c).toMatch(/case "dose_100ml": return "dose";/);
  });

  it("NovoPedido mantém o mapeamento hectare/dose_100ml das unidades", () => {
    const c = read(NOVO_PEDIDO);
    expect(c).toContain("hectare");
    expect(c).toContain("dose_100ml");
    expect(c).toContain("unidade_medida");
  });

  it("AddToCartDialog continua existindo e é o diálogo do carrinho", () => {
    expect(existsSync(resolve(process.cwd(), ADD_CART))).toBe(true);
    expect(read(ADD_CART)).toContain("export function AddToCartDialog");
  });
});

describe("FASE 27E — mobile/produtor sem exposição interna", () => {
  it("MobileCatalogoTecnico não expõe custo interno nem auditoria", () => {
    const c = read(MOBILE);
    expect(c).not.toContain("catalog_technical_audit_logs");
    expect(c).not.toMatch(/custo_interno|custo interno/i);
    expect(c).not.toMatch(/auditoria/i);
  });

  it("CatalogoItemDrawer interno não é reutilizado em portais externos", () => {
    for (const f of [NOVO_PEDIDO, FICHAS, MOBILE]) {
      expect(read(f)).not.toContain("CatalogoItemDrawer");
    }
  });
});

describe("FASE 27E — rotas e navegação", () => {
  it("navigation mantém rótulo Catálogo AR Bio e rota /base-tecnica", () => {
    const c = read(NAV);
    expect(c).toContain("Catálogo AR Bio");
    expect(c).toContain("/base-tecnica");
    expect(c).toContain('legacyRoutes: ["/protocolos", "/comercial/catalogo"]');
  });

  it("/protocolos permanece como rota legada redirecionando para /base-tecnica", () => {
    const c = read(APP);
    expect(c).toMatch(/path="\/base-tecnica"/);
    expect(c).toMatch(/path="\/protocolos"[\s\S]{0,120}to="\/base-tecnica"/);
  });
});
