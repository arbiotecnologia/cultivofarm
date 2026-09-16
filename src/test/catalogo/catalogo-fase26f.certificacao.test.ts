/**
 * FASE 26F — Certificação da unificação visual do Catálogo Cultivo Farm.
 * Teste de contrato por leitura: garante que rotas, portais, carrinho e
 * fluxos B2B/produtor permanecem preservados após 26A–26E.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const exists = (p: string) => fs.existsSync(path.resolve(process.cwd(), p));

const app = read("src/App.tsx");
const grid = read("src/components/catalogo/CatalogoCardsGrid.tsx");
const drawer = read("src/components/catalogo/CatalogoItemDrawer.tsx");
const novoPedido = read("src/pages/portal-parceiro/NovoPedido.tsx");
const createOrder = read("src/hooks/useCreatePartnerOrder.ts");
const nav = read("src/config/navigation.ts");
const protocolos = read("src/pages/Protocolos.tsx");

describe("26F — rotas preservadas", () => {
  it("mantém /base-tecnica, redirecionamento de /protocolos e catálogo comercial", () => {
    expect(app).toContain('path="/base-tecnica"');
    expect(app).toContain('path="/protocolos"');
    expect(app).toContain('to="/base-tecnica"');
    expect(app).toContain('path="/comercial/catalogo" element={<PreservedNavigate to="/base-tecnica?tab=catalogo-tecnico" />}');
  });

  it("mantém catálogo mobile/produtor e catálogo do portal parceiro", () => {
    expect(app).toContain('path="/app/catalogo"');
    expect(app).toContain('path="catalogo"');
  });
});

describe("26F — navegação e abas do Catálogo", () => {
  it("menu exibe Catálogo", () => {
    expect(nav).toContain("Catálogo");
  });

  it("abas canônicas e aliases preservados", () => {
    for (const t of ["produtos", "microrganismos", "catalogo-tecnico", "culturas", "problemas"]) {
      expect(protocolos).toContain(t);
    }
    for (const a of ["catalogo", "fichas", "tecnico", "revisao"]) {
      expect(protocolos).toContain(a);
    }
  });
});

describe("26F — grade e fichas complementares", () => {
  it("grade mantém Ver ficha, Ficha completa e actionSlot", () => {
    expect(grid).toContain("Ver ficha");
    expect(grid).toContain("Ficha completa");
    expect(grid).toContain("actionSlot");
    expect(grid).toContain("CatalogoItemDrawer");
  });

  it("fichas legadas continuam disponíveis", () => {
    for (const comp of [
      "FichaProdutorDrawer",
      "ProductTechnicalProfileDialog",
      "MicroorganismTechnicalProfileDialog",
    ]) {
      expect(grid).toContain(comp);
    }
    expect(exists("src/components/catalogo/FichaProdutorDrawer.tsx")).toBe(true);
    expect(exists("src/components/catalogo/AddToCartDialog.tsx")).toBe(true);
  });
});

describe("26F — carrinho e pedido B2B preservados", () => {
  it("NovoPedido usa AddToCartDialog junto da grade unificada", () => {
    expect(novoPedido).toContain("AddToCartDialog");
    expect(novoPedido).toContain("CatalogoCardsGrid");
    expect(novoPedido).toContain("actionSlot");
  });

  it("unidades comerciais continuam sendo enviadas", () => {
    expect(novoPedido).toContain("unidade_medida");
    expect(novoPedido).toContain("hectare");
    expect(novoPedido).toContain("dose_100ml");
    expect(novoPedido).toContain("volume_comercial");
  });

  it("useCreatePartnerOrder mapeia dose_100ml para dose e envia unidade_medida", () => {
    expect(createOrder).toContain('case "dose_100ml": return "dose"');
    expect(createOrder).toContain("unidade_medida: mapUnidadeMedida");
    expect(createOrder).toContain("create_partner_order_secure");
    expect(createOrder).toContain("p_expected_cart_hash");
  });
});

describe("26F — ficha unificada é somente leitura", () => {
  it("sem supabase, RPC, mutation ou publicação real", () => {
    expect(drawer).not.toContain("supabase");
    expect(drawer).not.toContain(".rpc(");
    expect(drawer).not.toContain("useMutation");
    expect(drawer).not.toContain("useQuery");
    expect(drawer).not.toMatch(/Despublicar|\bPublicar\b/);
  });

  it("diagnóstico de publicação usa apenas ativo, b2b_enabled e ficha_status", () => {
    expect(drawer).toContain("catalogoFichaPublicacao");
    expect(drawer).toContain("b2b_enabled");
    expect(drawer).toContain("ficha_status");
  });

  it("não adiciona carrinho nem pedido", () => {
    expect(drawer).not.toContain("AddToCart");
    expect(drawer).not.toContain("carrinho");
  });
});
