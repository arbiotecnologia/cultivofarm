import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  calcularKpisReceber,
  classificarParcela,
  inicioDoMes,
  inicioDoProximoMes,
  rotuloVencimento,
  saldoParcela,
} from "@/lib/financeiro/contasReceber";
import { fetchAllRows } from "@/lib/configuracoes/fetchAllRows";

const HOJE = "2026-09-22";

describe("contas a receber — datas civis de São Paulo", () => {
  it("vencimento de hoje nunca é atraso, mesmo depois do meio-dia", () => {
    expect(classificarParcela("2026-09-22", HOJE)).toBe("vence_hoje");
    expect(rotuloVencimento("2026-09-22", HOJE)).toBe("Vence hoje");
    expect(classificarParcela("2026-09-21", HOJE)).toBe("vencida");
  });

  it("janela de 7 dias é inclusiva nas duas pontas", () => {
    expect(classificarParcela("2026-09-29", HOJE)).toBe("vence_em_7_dias");
    expect(classificarParcela("2026-09-30", HOJE)).toBe("futura");
  });

  it("timestamp tardio ainda pertence ao dia civil de São Paulo", () => {
    // 23:30Z de 21/09 é 20:30 de 21/09 em São Paulo — continua vencido.
    expect(classificarParcela("2026-09-21T23:30:00Z", HOJE)).toBe("vencida");
    // 02:00Z de 23/09 ainda é 22/09 em São Paulo.
    expect(classificarParcela("2026-09-23T02:00:00Z", HOJE)).toBe("vence_hoje");
  });

  it("limites do mês: início inclusivo, próximo mês exclusivo", () => {
    expect(inicioDoMes(HOJE)).toBe("2026-09-01");
    expect(inicioDoProximoMes(HOJE)).toBe("2026-10-01");
    expect(inicioDoProximoMes("2026-12-10")).toBe("2027-01-01");
  });
});

describe("contas a receber — KPIs", () => {
  const parcelas = [
    { original_amount: 1000, received_amount: 300, discount_amount: 0, due_date: "2026-09-22", status: "PARTIAL" },
    { original_amount: 500, received_amount: 0, discount_amount: 0, due_date: "2026-09-10", status: "OPEN" },
    { original_amount: 200, received_amount: 200, discount_amount: 0, due_date: "2026-09-05", status: "PAID" },
    { original_amount: 900, received_amount: 0, discount_amount: 0, due_date: "2026-11-01", status: "OPEN" },
    { original_amount: 400, received_amount: 0, discount_amount: 0, due_date: "2026-09-01", status: "CANCELED" },
  ];

  it("recebimento parcial no mês entra em recebido no mês", () => {
    const k = calcularKpisReceber(parcelas, [{ amount_received: 300, payment_date: "2026-09-22" }], HOJE);
    expect(k.recebidoMes).toBe(300);
  });

  it("pagamento futuro (outro mês) não entra em recebido no mês", () => {
    const k = calcularKpisReceber(parcelas, [
      { amount_received: 300, payment_date: "2026-09-30" },
      { amount_received: 1000, payment_date: "2026-10-01" },
      { amount_received: 500, payment_date: "2026-08-31" },
    ], HOJE);
    expect(k.recebidoMes).toBe(300);
  });

  it("estornos entram como valores negativos", () => {
    const k = calcularKpisReceber([], [
      { amount_received: 1000, payment_date: "2026-09-05" },
      { amount_received: -400, payment_date: "2026-09-20" },
    ], HOJE);
    expect(k.recebidoMes).toBe(600);
  });

  it("recebido no mês ignora saldo acumulado das parcelas", () => {
    const k = calcularKpisReceber(parcelas, [], HOJE);
    expect(k.recebidoMes).toBe(0);
  });

  it("aberto, vencido e vencendo em 7 dias usam saldo das parcelas abertas", () => {
    const k = calcularKpisReceber(parcelas, [], HOJE);
    expect(k.aberto).toBe(700 + 500 + 900);
    expect(k.vencido).toBe(500);
    expect(k.vence7).toBe(700);
  });

  it("saldo nunca fica negativo", () => {
    expect(saldoParcela({ original_amount: 100, received_amount: 150, discount_amount: 0 })).toBe(0);
  });
});

describe("contas a receber — leitura completa e falhas", () => {
  it("lê além de 1000 registros em páginas reais", async () => {
    const linhas = Array.from({ length: 2100 }, (_, i) => ({ id: i }));
    const todos = await fetchAllRows<{ id: number }>(async (from, to) => ({
      data: linhas.slice(from, to + 1),
      error: null,
    }));
    expect(todos).toHaveLength(2100);
  });

  it("falha em página intermediária não entrega subtotal", async () => {
    let n = 0;
    await expect(
      fetchAllRows(async (from, to) => {
        n++;
        if (n === 2) return { data: null, error: { message: "falha" } };
        return { data: Array.from({ length: 1000 }, (_, i) => ({ id: from + i })), error: null };
      }),
    ).rejects.toBeTruthy();
  });
});

describe("contas a receber — página", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/pages/financeiro/ContasReceber.tsx"), "utf8");

  it("não executa RPC mutante de vencidos ao montar", () => {
    expect(src).not.toContain("fn_mark_financial_overdue");
  });

  it("usa eventos de recebimento e não paid_at para o mês", () => {
    expect(src).toContain("receivable_payments");
    expect(src).not.toContain("paid_at");
  });

  it("mostra erro com tentar novamente em vez de lista vazia", () => {
    expect(src).toContain("lista.isError");
    expect(src).toContain("Tentar novamente");
  });

  it("carrega páginas reais e protege ações duplicadas", () => {
    expect(src).toContain("useInfiniteQuery");
    expect(src).toContain("cancel.isPending");
  });
});
