import { describe, it, expect } from "vitest";
import { scopeCan } from "@/components/pedidos-b2b/viewerScope";

/**
 * FASE 7 — Contrato de visibilidade do Portal do Produtor.
 * Bloqueia regressões nas regras de exposição de dados sensíveis.
 */

const HIDDEN_SIM_STATUS = new Set(["rascunho", "arquivada"]);
const filterSimsProdutor = <T extends { status: string; cliente_id?: string }>(
  sims: T[],
  clienteId: string,
) =>
  sims.filter(
    (s) => !HIDDEN_SIM_STATUS.has(s.status) && s.cliente_id === clienteId,
  );

const filterPedidosProdutor = <T extends { cliente_id?: string }>(
  pedidos: T[],
  clienteId: string,
) => pedidos.filter((p) => p.cliente_id === clienteId);

describe("Portal do Produtor — pedidos e simulações", () => {
  const clienteMeu = "cli-1";
  const clienteOutro = "cli-2";

  const pedidos = [
    { id: "p1", cliente_id: clienteMeu },
    { id: "p2", cliente_id: clienteOutro },
  ];

  const sims = [
    { id: "s1", cliente_id: clienteMeu, status: "enviada_gestor" },
    { id: "s2", cliente_id: clienteMeu, status: "convertida_pedido" },
    { id: "s3", cliente_id: clienteMeu, status: "rascunho" },
    { id: "s4", cliente_id: clienteMeu, status: "arquivada" },
    { id: "s5", cliente_id: clienteOutro, status: "enviada_gestor" },
  ];

  it("produtor vê apenas pedidos do próprio cliente", () => {
    const visiveis = filterPedidosProdutor(pedidos, clienteMeu);
    expect(visiveis.map((p) => p.id)).toEqual(["p1"]);
  });

  it("produtor vê apenas simulações do próprio cliente", () => {
    const visiveis = filterSimsProdutor(sims, clienteMeu);
    expect(visiveis.every((s) => s.cliente_id === clienteMeu)).toBe(true);
  });

  it("produtor não vê simulações rascunho", () => {
    const visiveis = filterSimsProdutor(sims, clienteMeu);
    expect(visiveis.find((s) => s.status === "rascunho")).toBeUndefined();
  });

  it("produtor não vê simulações arquivadas", () => {
    const visiveis = filterSimsProdutor(sims, clienteMeu);
    expect(visiveis.find((s) => s.status === "arquivada")).toBeUndefined();
  });

  it("produtor não vê desconto/margem/notas comerciais", () => {
    expect(scopeCan.discountDetails("produtor")).toBe(false);
    expect(scopeCan.itemDiscountColumn("produtor")).toBe(false);
    expect(scopeCan.commercialNotes("produtor")).toBe(false);
    expect(scopeCan.financialStatus("produtor")).toBe(false);
    expect(scopeCan.observacoesGerais("produtor")).toBe(false);
    expect(scopeCan.responsaveisInternos("produtor")).toBe(false);
  });

  it("produtor não acessa pedido de outro cliente", () => {
    const outroPed = pedidos.find((p) => p.cliente_id === clienteOutro)!;
    const visiveis = filterPedidosProdutor(pedidos, clienteMeu);
    expect(visiveis.find((p) => p.id === outroPed.id)).toBeUndefined();
  });
});
