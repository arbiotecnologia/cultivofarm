import { describe, it, expect } from "vitest";
import {
  hojeSaoPaulo,
  dataCivil,
  deduplicarPlanejamentos,
  estaAtrasado,
  ehNovo,
  resumirKpis,
  formatValorOuTraco,
  formatVolumeL,
  quantidadeValida,
  filtrarPorBusca,
  ordenarFila,
  validarDatasPlanejamento,
  podeGerarOrdens,
  rotuloStatus,
  varianteStatus,
  mensagemErro,
} from "@/lib/planejamento-producao/planejamento";

describe("fuso America/Sao_Paulo", () => {
  it("usa a data civil local, não a data UTC", () => {
    // 2026-03-02T02:00Z = 01/03/2026 23:00 em São Paulo
    expect(hojeSaoPaulo(new Date("2026-03-02T02:00:00Z"))).toBe("2026-03-01");
  });

  it("mantém datas puras YYYY-MM-DD sem deslocamento", () => {
    expect(dataCivil("2026-03-01")).toBe("2026-03-01");
    expect(dataCivil("")).toBeNull();
    expect(dataCivil("texto")).toBeNull();
    expect(dataCivil(null)).toBeNull();
  });
});

describe("atraso", () => {
  const hoje = "2026-03-10";
  it("marca atraso apenas para datas anteriores a hoje", () => {
    expect(estaAtrasado({ order_requested_date: "2026-03-09", status: "planejado" }, hoje)).toBe(true);
    expect(estaAtrasado({ order_requested_date: "2026-03-10", status: "planejado" }, hoje)).toBe(false);
    expect(estaAtrasado({ order_requested_date: "2026-03-11", status: "planejado" }, hoje)).toBe(false);
  });

  it("não marca atraso em status terminais nem sem data", () => {
    expect(estaAtrasado({ order_requested_date: "2026-01-01", status: "entregue" }, hoje)).toBe(false);
    expect(estaAtrasado({ order_requested_date: "2026-01-01", status: "cancelado" }, hoje)).toBe(false);
    expect(estaAtrasado({ order_requested_date: null, status: "planejado" }, hoje)).toBe(false);
  });
});

describe("novo", () => {
  const agora = new Date("2026-03-10T12:00:00Z");
  it("sinaliza aprovação recente somente em aguardando", () => {
    expect(ehNovo({ status: "aguardando_planejamento", order_approved_at: "2026-03-10T06:00:00Z" }, agora)).toBe(true);
    expect(ehNovo({ status: "planejado", order_approved_at: "2026-03-10T06:00:00Z" }, agora)).toBe(false);
    expect(ehNovo({ status: "aguardando_planejamento", order_approved_at: "2026-03-08T06:00:00Z" }, agora)).toBe(false);
  });

  it("ignora aprovação ausente, inválida ou no futuro", () => {
    expect(ehNovo({ status: "aguardando_planejamento", order_approved_at: null }, agora)).toBe(false);
    expect(ehNovo({ status: "aguardando_planejamento", order_approved_at: "xx" }, agora)).toBe(false);
    expect(ehNovo({ status: "aguardando_planejamento", order_approved_at: "2026-03-20T00:00:00Z" }, agora)).toBe(false);
  });
});

describe("deduplicação e KPIs", () => {
  it("não conta o mesmo pedido duas vezes", () => {
    const { linhas, duplicadasIgnoradas } = deduplicarPlanejamentos([
      { partner_order_id: "a", status: "planejado" },
      { partner_order_id: "a", status: "planejado" },
      { partner_order_id: "b", status: "planejado" },
    ]);
    expect(linhas).toHaveLength(2);
    expect(duplicadasIgnoradas).toBe(1);
  });

  it("KPIs somam exatamente o total e isolam status desconhecido", () => {
    const hoje = "2026-03-10";
    const k = resumirKpis(
      [
        { status: "aguardando_planejamento" },
        { status: "planejado", order_requested_date: "2026-03-01" },
        { status: "em_producao" },
        { status: "replanejar" },
        { status: "status_inexistente" },
        { status: "entregue", order_requested_date: "2026-01-01" },
      ],
      hoje,
    );
    expect(k.total).toBe(6);
    expect(k.aguardando + k.planejado + k.em_producao + k.produzido + k.entregue + k.cancelado + k.replanejar + k.outros).toBe(6);
    expect(k.outros).toBe(1);
    expect(k.atrasados).toBe(1);
  });

  it("resumo vazio para null/undefined", () => {
    for (const v of [null, undefined, []]) {
      expect(resumirKpis(v as never).total).toBe(0);
    }
  });
});

describe("formatação e quantidades", () => {
  it("não inventa R$ 0,00 nem litro zero quando falta o dado", () => {
    expect(formatValorOuTraco(null)).toBe("—");
    expect(formatValorOuTraco("abc")).toBe("—");
    expect(formatValorOuTraco(1234.5)).toContain("1.234,50");
    expect(formatVolumeL(null)).toBe("—");
    expect(formatVolumeL(-5)).toBe("—");
    expect(formatVolumeL(0)).toContain("0");
  });

  it("rejeita quantidade zero, negativa ou não numérica", () => {
    expect(quantidadeValida(0)).toBeNull();
    expect(quantidadeValida(-2)).toBeNull();
    expect(quantidadeValida("x")).toBeNull();
    expect(quantidadeValida("3")).toBe(3);
  });
});

describe("busca e ordenação", () => {
  const linhas = [
    { partner_order_id: "1", order_numero: "PB-100", partner_nome: "Agro São João", status: "planejado", created_at: "2026-03-01" },
    { partner_order_id: "2", order_numero: "PB-200", partner_nome: "Fazenda Bela", status: "planejado", order_requested_date: "2026-03-01", created_at: "2026-03-02" },
    { partner_order_id: "3", order_numero: "PB-300", partner_nome: "Cerrado Ltda", status: "planejado", order_requested_date: "2026-03-20", created_at: "2026-03-03" },
  ];

  it("busca ignora acentos e caixa e termo vazio não filtra", () => {
    expect(filtrarPorBusca(linhas, "sao joao").map((l) => l.order_numero)).toEqual(["PB-100"]);
    expect(filtrarPorBusca(linhas, "pb-3").map((l) => l.order_numero)).toEqual(["PB-300"]);
    expect(filtrarPorBusca(linhas, "  ")).toHaveLength(3);
  });

  it("coloca atrasados primeiro e não muta a lista original", () => {
    const ordenada = ordenarFila(linhas, "2026-03-10");
    expect(ordenada[0].order_numero).toBe("PB-200");
    expect(linhas[0].order_numero).toBe("PB-100");
  });
});

describe("datas previstas", () => {
  it("bloqueia término anterior ao início e término sem início", () => {
    expect(validarDatasPlanejamento("2026-03-10", "2026-03-09").ok).toBe(false);
    expect(validarDatasPlanejamento(null, "2026-03-09").ok).toBe(false);
    expect(validarDatasPlanejamento("2026-03-10", "2026-03-10").ok).toBe(true);
    expect(validarDatasPlanejamento(null, null).ok).toBe(true);
    expect(validarDatasPlanejamento("10/03/2026", null).ok).toBe(false);
  });
});

describe("geração de ordens", () => {
  const itens = [{ quantidade: 2 }];
  it("impede estados impossíveis", () => {
    expect(podeGerarOrdens({ status: "planejado", hasOrders: true, readyForProduction: true, itens }).ok).toBe(false);
    expect(podeGerarOrdens({ status: "cancelado", hasOrders: false, readyForProduction: true, itens }).ok).toBe(false);
    expect(podeGerarOrdens({ status: "entregue", hasOrders: false, readyForProduction: true, itens }).ok).toBe(false);
    expect(podeGerarOrdens({ status: "planejado", hasOrders: false, readyForProduction: false, itens }).ok).toBe(false);
    expect(podeGerarOrdens({ status: "planejado", hasOrders: false, readyForProduction: true, itens: [] }).ok).toBe(false);
    expect(podeGerarOrdens({ status: "planejado", hasOrders: false, readyForProduction: true, itens: [{ quantidade: 0 }] }).ok).toBe(false);
  });

  it("permite quando tudo está consistente", () => {
    expect(podeGerarOrdens({ status: "planejado", hasOrders: false, readyForProduction: true, itens }).ok).toBe(true);
  });
});

describe("status e erros", () => {
  it("rotula status conhecidos e não quebra em desconhecidos", () => {
    expect(rotuloStatus("replanejar")).toBe("Replanejar");
    expect(rotuloStatus("zzz")).toBe("zzz");
    expect(rotuloStatus(null)).toBe("—");
    expect(varianteStatus("cancelado")).toBe("destructive");
    expect(varianteStatus("zzz")).toBe("secondary");
  });

  it("traduz erro de permissão sem vazar detalhe técnico", () => {
    expect(mensagemErro({ message: "permission denied for table" }, "fallback")).toMatch(/permissão/);
    expect(mensagemErro(null, "fallback")).toBe("fallback");
  });
});
