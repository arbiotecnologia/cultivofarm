import { describe, expect, it } from "vitest";
import { buildProductionSummary, type ProductionLot, type ProductionStock } from "./productionSummary";

const lot = (id: string, name = "Fertilizante"): ProductionLot => ({
  id, codigo_lote: `FORN-${id}`, volume_produzido: null, produto_id: `prod-${id}`, microrganismo_id: null,
  produtos: { nome: name },
});

const stock = (id: string, loteId: string, status: string, reserved = false): ProductionStock => ({
  id, lote_id: loteId, quantidade: 1, volume_total: null, origem_estoque: "compra_produto_acabado_revenda",
  unidade_comercial: "unidade", conteudo_por_unidade: 500, unidade_conteudo: "g", quantidade_conteudo: 500,
  validade: "2028-12-31", reservado_para_os_id: reserved ? "os-1" : null, quantidade_reservada: reserved ? 1 : null,
  expedido_em: null, status,
});

describe("resumo do Cockpit para compra de revenda", () => {
  it("duas embalagens de 500 g entram como 1.000 g; reserva e livre ficam separados", () => {
    const result = buildProductionSummary([lot("a")], [stock("livre", "a", "disponivel"), stock("reserva", "a", "reservado", true)], "2026-11-07");
    expect(result.revenda).toHaveLength(1);
    expect(result.revenda[0]).toMatchObject({ entrada: 1000, reservado: 500, disponivel: 500, vencido: 0, unit: "g" });
    expect(result.prod).toHaveLength(0);
    expect(result.totals).toMatchObject({ produzidoL: 0, reservadoL: 0, disponivelL: 0 });
  });

  it("não soma kg e g nem mistura compra com produção biológica", () => {
    const biologicalLot = { ...lot("bio", "Biológico"), microrganismo_id: "micro", produto_id: null, volume_produzido: 2000 };
    const biologicalStock: ProductionStock = {
      id: "bio-stock", lote_id: "bio", quantidade: 2, volume_total: 2, validade: null,
      reservado_para_os_id: null, quantidade_reservada: null, expedido_em: null, status: "disponivel",
    };
    const kg = { ...stock("kg", "a", "disponivel"), unidade_conteudo: "kg", conteudo_por_unidade: 0.5, quantidade_conteudo: 0.5 };
    const result = buildProductionSummary([lot("a"), biologicalLot], [stock("g", "a", "disponivel"), kg, biologicalStock], "2026-11-07");
    expect(result.revenda.map((group) => [group.unit, group.entrada])).toEqual(expect.arrayContaining([["g", 500], ["kg", 0.5]]));
    expect(result.micro[0]).toMatchObject({ produzidoL: 2, disponivelL: 2 });
    expect(result.micro[0].lotes[0].produzidoL).toBe(2);
  });
});
