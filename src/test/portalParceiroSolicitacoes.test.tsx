import { describe, it, expect } from "vitest";
import { scopeCan } from "@/components/pedidos-b2b/viewerScope";
import { canAccess, getAccessLevel } from "@/lib/permissions";

/**
 * FASE 7 — Contrato do Portal Parceiro (gestor e técnico).
 */

const filterPedidosParceiro = <T extends { partner_id: string }>(
  pedidos: T[],
  partnerId: string,
) => pedidos.filter((p) => p.partner_id === partnerId);

const filterSimsTecnico = <
  T extends { partner_id: string; created_by: string | null },
>(
  sims: T[],
  partnerId: string,
  userId: string,
) => sims.filter((s) => s.partner_id === partnerId && s.created_by === userId);

describe("Portal Parceiro — Gestor B2B", () => {
  const partnerA = "partner-A";
  const partnerB = "partner-B";
  const pedidos = [
    { id: "p1", partner_id: partnerA, origin_simulation_id: "s10" },
    { id: "p2", partner_id: partnerA, origin_simulation_id: null },
    { id: "p3", partner_id: partnerB, origin_simulation_id: null },
  ];

  it("gestor vê pedidos apenas do seu parceiro", () => {
    const visiveis = filterPedidosParceiro(pedidos, partnerA);
    expect(visiveis.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("gestor vê pedidos convertidos de simulação (com origem)", () => {
    const visiveis = filterPedidosParceiro(pedidos, partnerA);
    expect(visiveis.some((p) => p.origin_simulation_id)).toBe(true);
  });

  it("gestor abre detalhes de pedido (viewerScope parceiro_gestor)", () => {
    expect(scopeCan.openOrderDetail("parceiro_gestor")).toBe(true);
  });

  it("gestor vê desconto aplicado mas NÃO status financeiro interno", () => {
    expect(scopeCan.discountDetails("parceiro_gestor")).toBe(true);
    expect(scopeCan.itemDiscountColumn("parceiro_gestor")).toBe(true);
    expect(scopeCan.financialStatus("parceiro_gestor")).toBe(false);
    expect(scopeCan.commercialNotes("parceiro_gestor")).toBe(false);
  });

  it("gestor tem acesso rw a /portal-parceiro/solicitacoes", () => {
    expect(canAccess("parceiro_b2b", "/portal-parceiro/solicitacoes")).toBe(true);
    expect(getAccessLevel("parceiro_b2b", "/portal-parceiro/solicitacoes")).toBe(
      "rw",
    );
  });
});

describe("Portal Parceiro — Técnico B2B", () => {
  const partnerA = "partner-A";
  const tecnicoUser = "user-tec-1";
  const sims = [
    { id: "s1", partner_id: partnerA, created_by: tecnicoUser },
    { id: "s2", partner_id: partnerA, created_by: "outro-user" },
  ];

  it("técnico NÃO acessa /portal-parceiro/solicitacoes", () => {
    expect(canAccess("parceiro_b2b_tecnico", "/portal-parceiro/solicitacoes")).toBe(
      false,
    );
    expect(
      getAccessLevel("parceiro_b2b_tecnico", "/portal-parceiro/solicitacoes"),
    ).toBe("none");
  });

  it("técnico vê apenas as próprias simulações", () => {
    const visiveis = filterSimsTecnico(sims, partnerA, tecnicoUser);
    expect(visiveis.map((s) => s.id)).toEqual(["s1"]);
  });

  it("técnico NÃO abre detalhe de pedido oficial", () => {
    expect(scopeCan.openOrderDetail("parceiro_tecnico")).toBe(false);
  });

  it("técnico NÃO vê desconto", () => {
    expect(scopeCan.discountDetails("parceiro_tecnico")).toBe(false);
    expect(scopeCan.itemDiscountColumn("parceiro_tecnico")).toBe(false);
  });
});
