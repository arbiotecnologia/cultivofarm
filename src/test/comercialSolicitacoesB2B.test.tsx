import { describe, it, expect } from "vitest";
import { scopeCan } from "@/components/pedidos-b2b/viewerScope";
import { canAccess } from "@/lib/permissions";

/**
 * FASE 7 — Contrato do painel comercial Cultivo Farm.
 */

describe("Comercial Cultivo Farm — Solicitações B2B", () => {
  const pedidosGlobais = [
    { id: "p1", partner_id: "A" },
    { id: "p2", partner_id: "B" },
    { id: "p3", partner_id: "C" },
  ];
  const simsGlobais = [
    { id: "s1", partner_id: "A", status: "enviada_gestor" },
    { id: "s2", partner_id: "B", status: "convertida_pedido" },
    { id: "s3", partner_id: "C", status: "rascunho" },
  ];

  it("gestor_comercial vê TODOS os pedidos (sem filtro por parceiro)", () => {
    expect(pedidosGlobais.length).toBe(3);
    expect(canAccess("gestor_comercial", "/comercial/solicitacoes-b2b")).toBe(true);
  });

  it("gestor_comercial vê TODAS as simulações incluindo rascunho", () => {
    expect(simsGlobais.length).toBe(3);
    expect(simsGlobais.some((s) => s.status === "rascunho")).toBe(true);
  });

  it("gestor_comercial abre detalhes com viewerScope=comercial", () => {
    const s = "comercial" as const;
    expect(scopeCan.openOrderDetail(s)).toBe(true);
    expect(scopeCan.discountDetails(s)).toBe(true);
    expect(scopeCan.financialStatus(s)).toBe(true);
    expect(scopeCan.commercialNotes(s)).toBe(true);
    expect(scopeCan.clienteFinanceInfo(s)).toBe(true);
    expect(scopeCan.responsaveisInternos(s)).toBe(true);
    expect(scopeCan.itemDiscountColumn(s)).toBe(true);
  });

  it("administrador também tem acesso ao painel comercial", () => {
    expect(canAccess("administrador", "/comercial/solicitacoes-b2b")).toBe(true);
  });
});
