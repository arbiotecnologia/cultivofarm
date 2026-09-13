import { describe, it, expect } from "vitest";
import {
  resumirPlanejamento,
  formatLitros,
  formatBRLouTraco,
  formatInteiro,
  listarInconsistencias,
  mensagemErro,
  STATUS_PLANEJAMENTO,
} from "@/lib/dashboard-producao/producao";

describe("resumirPlanejamento — estados e status", () => {
  it("retorna resumo vazio para null/undefined/lista vazia", () => {
    for (const entrada of [null, undefined, []]) {
      const r = resumirPlanejamento(entrada as never);
      expect(r.total).toBe(0);
      expect(r.valorAtivos).toBeNull();
      expect(r.outros).toBe(0);
      for (const s of STATUS_PLANEJAMENTO) expect(r.porStatus[s]).toBe(0);
    }
  });

  it("conta status conhecidos de forma exclusiva", () => {
    const r = resumirPlanejamento([
      { partner_order_id: "1", status: "aguardando_planejamento", total: 10 },
      { partner_order_id: "2", status: "planejado", total: 10 },
      { partner_order_id: "3", status: "em_producao", total: 10 },
      { partner_order_id: "4", status: "produzido", total: 10 },
      { partner_order_id: "5", status: "entregue", total: 10 },
      { partner_order_id: "6", status: "replanejar", total: 10 },
    ]);
    expect(r.total).toBe(6);
    const soma = STATUS_PLANEJAMENTO.reduce((a, s) => a + r.porStatus[s], 0) + r.outros;
    expect(soma).toBe(r.total);
    expect(r.porStatus.cancelado).toBe(0);
  });

  it("isola status desconhecido em 'outros' sem inventar categoria", () => {
    const r = resumirPlanejamento([
      { partner_order_id: "1", status: "status_inexistente", total: 100 },
      { partner_order_id: "2", status: null, total: 50 },
    ]);
    expect(r.outros).toBe(2);
    expect(r.total).toBe(2);
  });
});

describe("duplicidade", () => {
  it("não conta o mesmo pedido duas vezes nem soma seu valor duas vezes", () => {
    const r = resumirPlanejamento([
      { partner_order_id: "a", status: "planejado", total: 100 },
      { partner_order_id: "a", status: "planejado", total: 100 },
      { partner_order_id: "b", status: "planejado", total: 50 },
    ]);
    expect(r.total).toBe(2);
    expect(r.duplicadasIgnoradas).toBe(1);
    expect(r.valorAtivos).toBe(150);
  });
});

describe("cancelados e valores", () => {
  it("exclui cancelados do valor e dos pedidos ativos, mas mantém na contagem total", () => {
    const r = resumirPlanejamento([
      { partner_order_id: "a", status: "planejado", total: 200 },
      { partner_order_id: "b", status: "cancelado", total: 999 },
    ]);
    expect(r.total).toBe(2);
    expect(r.totalAtivos).toBe(1);
    expect(r.porStatus.cancelado).toBe(1);
    expect(r.valorAtivos).toBe(200);
  });

  it("trata total nulo/inválido como ausente em vez de zero", () => {
    const r = resumirPlanejamento([
      { partner_order_id: "a", status: "planejado", total: null },
      { partner_order_id: "b", status: "planejado", total: "abc" },
    ]);
    expect(r.pedidosSemValor).toBe(2);
    expect(r.valorAtivos).toBeNull();
  });

  it("aceita total numérico em string", () => {
    const r = resumirPlanejamento([{ partner_order_id: "a", status: "planejado", total: "12.5" }]);
    expect(r.valorAtivos).toBe(12.5);
  });
});

describe("formatação de unidades e moeda", () => {
  it("não assume litro zero quando o dado está ausente", () => {
    expect(formatLitros(null)).toBe("—");
    expect(formatLitros(undefined)).toBe("—");
    expect(formatLitros("x")).toBe("—");
    expect(formatLitros(0)).toContain("0");
    expect(formatLitros(1500.55)).toMatch(/L$/);
  });

  it("formata moeda em pt-BR e mostra — quando não há valor", () => {
    expect(formatBRLouTraco(null)).toBe("—");
    const s = formatBRLouTraco(1234.5);
    expect(s).toContain("R$");
    expect(s).toContain("1.234,50");
  });

  it("formata inteiros e ausência", () => {
    expect(formatInteiro(null)).toBe("—");
    expect(formatInteiro(1000)).toBe("1.000");
  });
});

describe("integridade", () => {
  it("lista apenas contagens positivas, rotuladas e ordenadas", () => {
    const itens = listarInconsistencias({ os_orfa_b2b: 2, timeline_orfa: 0, links_invalidos: 5, ruido: "texto" });
    expect(itens.map((i) => i.chave)).toEqual(["links_invalidos", "os_orfa_b2b"]);
    expect(itens[0].rotulo).toBe("Vínculos de produção inválidos");
  });

  it("ignora payloads inválidos", () => {
    expect(listarInconsistencias(null)).toEqual([]);
    expect(listarInconsistencias("erro")).toEqual([]);
  });

  it("traduz erro de permissão sem vazar detalhe técnico", () => {
    expect(mensagemErro({ message: "permission_denied" }, "fallback")).toMatch(/permissão/);
    expect(mensagemErro(null, "fallback")).toBe("fallback");
  });
});
