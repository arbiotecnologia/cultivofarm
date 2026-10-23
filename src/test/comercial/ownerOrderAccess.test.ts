import { describe, it, expect } from "vitest";
import { readOwnerOrderCapability, ownerOrderRoute } from "@/lib/comercial/ownerOrderAccess";
import { getPortalDisplayLabel } from "@/lib/portalDisplayLabel";

const features = new Set(["pedidos_b2b"]);

describe("C2-ORD capacidade de pedido do cliente comercial", () => {
  it("sem campo da projeção o writer fica fechado", () => {
    expect(readOwnerOrderCapability(undefined)).toBe(false);
    expect(readOwnerOrderCapability({ order_create: true })).toBe(false);
    expect(readOwnerOrderCapability({ contract: "C2_CAT_V1", order_create: true })).toBe(false);
    expect(readOwnerOrderCapability({ contract: "C2_OWNER_ORDER_V1", order_create: "true" })).toBe(false);
  });
  it("contrato exato habilita somente o catálogo com pedidos_b2b", () => {
    const cap = readOwnerOrderCapability({ contract: "C2_OWNER_ORDER_V1", order_create: true });
    expect(cap).toBe(true);
    expect(ownerOrderRoute("/portal-parceiro/catalogo", cap, features)).toBe(true);
    expect(ownerOrderRoute("/portal-parceiro/pedidos", cap, features)).toBe(false);
    expect(ownerOrderRoute("/portal-parceiro/catalogo", cap, new Set())).toBe(false);
    expect(ownerOrderRoute("/portal-parceiro/catalogo", false, features)).toBe(false);
  });
});

describe("rótulo do portal técnico B2B cumulativo", () => {
  it("contexto técnico não mostra Gestor", () => {
    const roles = ["parceiro_b2b", "parceiro_b2b_tecnico"] as any;
    const tech = getPortalDisplayLabel({ activeCtx: "technical", primaryRole: "parceiro_b2b" as any, roles });
    const b2b = getPortalDisplayLabel({ activeCtx: "b2b", primaryRole: "parceiro_b2b" as any, roles });
    expect(tech).not.toBe(b2b);
    expect(tech).not.toMatch(/gestor/i);
  });
});
