import { describe, expect, it } from "vitest";
import { canAccess, getHomeForRole } from "@/lib/permissions";
import { parseSellerCapability } from "@/hooks/useSellerPortfolio";
import { normalizeRoles } from "@/lib/portalContext";
import { isPathEntitled } from "@/lib/saas/featureRouteMap";

describe("perfil Vendedor", () => {
  it("é reconhecido e tem home própria", () => {
    expect(normalizeRoles(["vendedor"])).toEqual(["vendedor"]);
    expect(getHomeForRole("vendedor")).toBe("/comercial/minha-carteira");
  });
  it.each([
    "/comercial/pedidos-b2b", "/comercial/solicitacoes-b2b", "/comercial/condicoes-pagamento",
    "/comercial/simulador", "/financeiro", "/financeiro/receber", "/estoque", "/fiscal", "/configuracoes",
  ])("não acessa %s", (path) => {
    expect(canAccess("vendedor", path)).toBe(false);
  });
  it("acessa só a própria carteira; gestor comercial não herda", () => {
    expect(canAccess("vendedor", "/comercial/minha-carteira")).toBe(true);
    expect(canAccess("gestor_comercial", "/comercial/minha-carteira")).toBe(false);
    expect(canAccess("gestor_comercial", "/comercial/pedidos-b2b")).toBe(true);
  });
  it("carteira exige o plano de pedidos B2B", () => {
    expect(isPathEntitled("/comercial/minha-carteira", { status: "ready", features: new Set() } as any)).toBe(false);
  });
  it("capability fecha sem contrato, sem prontidão e sem declaração de escrita", () => {
    expect(parseSellerCapability(null).installed).toBe(false);
    const notSeller = parseSellerCapability({ contract: "seller_portfolio_capability_v1", ready: false, partners: [{ partner_id: "p", razao_social: "x" }], order_create: true });
    expect(notSeller).toMatchObject({ installed: true, ready: false, orderCreate: false, partners: [] });
    const ready = parseSellerCapability({ contract: "seller_portfolio_capability_v1", ready: true, order_create: false, quote_respond: false, partners: [{ partner_id: "p1", razao_social: "P1" }] });
    expect(ready).toMatchObject({ orderCreate: false, quoteRespond: false, partners: [{ partner_id: "p1", razao_social: "P1" }] });
  });
});
