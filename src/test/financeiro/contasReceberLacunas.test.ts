import { describe, it, expect } from "vitest";
import {
  indexarComprovantesReceber,
  pagamentosVigentes,
  temComprovanteRecebimento,
} from "@/lib/financeiro/comprovantesReceber";
import {
  MSG_CANCELAMENTO_GENERICA,
  CHAVES_INVALIDACAO_RECEBER,
  mapearErroCancelamento,
} from "@/lib/financeiro/contasReceber";
import {
  calcularSaldoRecebivel,
  dataCivilValida,
  validarBaixaRecebimento,
} from "@/lib/financeiro/baixaRecebimento";

describe("comprovantes de contas a receber", () => {
  const parcelas = [
    { id: "inst-1", receivable_id: "ar-1" },
    { id: "inst-2", receivable_id: "ar-2" },
  ];

  it("documento ligado ao pagamento chega à conta correta", () => {
    const mapa = indexarComprovantesReceber(
      [{ owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-1", document_type: "RECEIPT" }],
      [{ id: "pay-1", installment_id: "inst-1", is_reversal: false, reversed_payment_id: null }],
      parcelas,
    );
    expect(temComprovanteRecebimento(mapa, "ar-1")).toBe(true);
    expect(temComprovanteRecebimento(mapa, "ar-2")).toBe(false);
  });

  it("documento direto na conta continua valendo", () => {
    const mapa = indexarComprovantesReceber(
      [{ owner_type: "RECEIVABLE", owner_id: "ar-2", document_type: "RECEIPT" }],
      [],
      parcelas,
    );
    expect(temComprovanteRecebimento(mapa, "ar-2")).toBe(true);
  });

  it("comprovante de pagamento estornado não vale como recebimento vigente", () => {
    const pagamentos = [
      { id: "pay-1", installment_id: "inst-1", is_reversal: false, reversed_payment_id: null },
      { id: "pay-2", installment_id: "inst-1", is_reversal: true, reversed_payment_id: "pay-1" },
    ];
    expect([...pagamentosVigentes(pagamentos)]).toEqual([]);
    const mapa = indexarComprovantesReceber(
      [
        { owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-1", document_type: "RECEIPT" },
        { owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-2", document_type: "RECEIPT" },
      ],
      pagamentos,
      parcelas,
    );
    expect(temComprovanteRecebimento(mapa, "ar-1")).toBe(false);
  });

  it("pagamento sem parcela conhecida não inventa vínculo", () => {
    const mapa = indexarComprovantesReceber(
      [{ owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-x", document_type: "RECEIPT" }],
      [{ id: "pay-x", installment_id: "inst-desconhecida" }],
      parcelas,
    );
    expect(Object.keys(mapa)).toHaveLength(0);
  });
});

describe("erros de cancelamento", () => {
  it("códigos conhecidos viram mensagem específica", () => {
    expect(mapearErroCancelamento({ code: "42501" })).toContain("permissão");
    expect(mapearErroCancelamento({ code: "40001" })).toContain("Recarregue");
  });

  it("erro desconhecido nunca expõe texto do servidor", () => {
    const m = mapearErroCancelamento({ message: 'ERROR: relation "x" violates constraint pk_y' });
    expect(m).toBe(MSG_CANCELAMENTO_GENERICA);
    expect(m).not.toContain("constraint");
  });

  it("chaves de invalidação cobrem os consumidores reais", () => {
    for (const k of ["fin-dashboard-summary", "fluxo-caixa", "dre", "drill-recebimentos", "fin-payments"]) {
      expect(CHAVES_INVALIDACAO_RECEBER).toContain(k as any);
    }
  });
});

describe("baixa de recebimento", () => {
  const parcela = {
    original_amount: 1000,
    received_amount: 200,
    interest_amount: 50,
    penalty_amount: 30,
    discount_amount: 10,
  };

  it("saldo inclui acumulados da parcela e ajustes da baixa", () => {
    expect(calcularSaldoRecebivel(parcela)).toBe(870);
    expect(calcularSaldoRecebivel(parcela, { interest_amount: 5, penalty_amount: 5, discount_amount: 20 })).toBe(860);
  });

  it("valida data civil real", () => {
    expect(dataCivilValida("2026-02-30")).toBe(false);
    expect(dataCivilValida("2026-02-28")).toBe(true);
    expect(dataCivilValida("22/09/2026")).toBe(false);
  });

  const base = {
    parcela,
    form: { payment_date: "2026-09-22", amount: 100, payment_method_id: "pm-1", interest_amount: 0, penalty_amount: 0, discount_amount: 0 },
    metodosAtivos: ["pm-1"],
    settingsCarregadas: true,
    exigeComprovante: false,
    temArquivo: false,
    temSessao: true,
  };

  it("aceita baixa válida, inclusive data futura", () => {
    expect(validarBaixaRecebimento(base)).toBeNull();
    expect(validarBaixaRecebimento({ ...base, form: { ...base.form, payment_date: "2030-01-10" } })).toBeNull();
  });

  it("bloqueia envio sem configurações carregadas", () => {
    expect(validarBaixaRecebimento({ ...base, settingsCarregadas: false })).toContain("configurações");
  });

  it("rejeita ajustes negativos, valores não finitos e método inativo", () => {
    expect(validarBaixaRecebimento({ ...base, form: { ...base.form, interest_amount: -1 } })).toContain("Juros");
    expect(validarBaixaRecebimento({ ...base, form: { ...base.form, amount: "abc" } })).toContain("numérico");
    expect(validarBaixaRecebimento({ ...base, metodosAtivos: [] })).toContain("indisponível");
  });

  it("valor acima do saldo com acumulados é recusado", () => {
    expect(validarBaixaRecebimento({ ...base, form: { ...base.form, amount: 871 } })).toContain("excede");
    expect(validarBaixaRecebimento({ ...base, form: { ...base.form, amount: 870 } })).toBeNull();
  });

  it("comprovante obrigatório sem arquivo é recusado", () => {
    expect(validarBaixaRecebimento({ ...base, exigeComprovante: true })).toContain("comprovante");
  });
});
