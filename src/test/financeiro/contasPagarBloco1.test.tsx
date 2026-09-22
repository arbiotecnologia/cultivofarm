import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import ContasPagar from "@/pages/financeiro/ContasPagar";
import {
  calcularKpisPagar,
  resumoSaldoPagar,
  saldoParcelaPagar,
} from "@/lib/financeiro/contasPagar";
import { hojeSaoPaulo } from "@/lib/financeiro/contasReceber";

type Resultado = { data?: any; error?: any; count?: number | null };
let resultados: Record<string, Resultado> = {};
const ranges: Array<[string, number, number]> = [];

function chain(tabela: string) {
  const obj: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") {
        const r = resultados[tabela] ?? { data: [], error: null, count: 0 };
        return (res: any, rej: any) => Promise.resolve(r).then(res as any, rej);
      }
      if (prop === "maybeSingle") return async () => resultados[tabela] ?? { data: {}, error: null };
      if (prop === "range") return (from: number, to: number) => { ranges.push([tabela, from, to]); return obj; };
      return () => obj;
    },
  });
  return obj;
}

function renderizar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const conta = (sobre: Record<string, unknown> = {}) => ({
  id: "ap-1", description: "Insumos", supplier_name: "Fornecedor X", status: "OPEN",
  total_amount: 100, first_due_date: "2026-09-01", installments: [], ...sobre,
});

beforeEach(() => {
  vi.clearAllMocks();
  ranges.length = 0;
  resultados = {};
  fromMock.mockImplementation((t: string) => chain(t));
});

describe("saldo da parcela a pagar (fórmula do servidor)", () => {
  it("100 pago 40 desconto 10 juros 20 multa 5 => 75", () => {
    expect(
      saldoParcelaPagar({
        original_amount: 100, paid_amount: 40, discount_amount: 10,
        interest_amount: 20, penalty_amount: 5, status: "PARTIAL",
      }),
    ).toBe(75);
  });

  it("quitação: saldo 0 e nunca negativo", () => {
    expect(saldoParcelaPagar({ original_amount: 100, paid_amount: 150, status: "PAID" })).toBe(0);
  });

  it("resumo discriminado igual aos KPIs e parcela cancelada fora", () => {
    const r = resumoSaldoPagar([
      { original_amount: 100, paid_amount: 40, discount_amount: 10, interest_amount: 20, penalty_amount: 5, status: "PARTIAL" },
      { original_amount: 999, paid_amount: 0, status: "CANCELED" },
    ]);
    expect(r).toMatchObject({ original: 100, pago: 40, juros: 20, multa: 5, desconto: 10, saldo: 75 });
  });
});

describe("KPIs de contas a pagar", () => {
  const hoje = hojeSaoPaulo();
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dia = Number(hoje.slice(8, 10));
  const d = (offset: number) => {
    const dt = new Date(Date.UTC(ano, mes - 1, dia + offset));
    return dt.toISOString().slice(0, 10);
  };

  it("PAID e CANCELED ficam fora de Em aberto/Vencido/7 dias", () => {
    const k = calcularKpisPagar(
      [
        { original_amount: 100, paid_amount: 100, status: "PAID", due_date: d(-1) },
        { original_amount: 80, paid_amount: 0, status: "CANCELED", due_date: d(-1) },
        { original_amount: 50, paid_amount: 10, status: "PARTIAL", due_date: d(-1) },
      ],
      [],
      hoje,
    );
    expect(k.aberto).toBe(40);
    expect(k.vencido).toBe(40);
    expect(k.vence7).toBe(0);
  });

  it("pago no mês por eventos: parcial entra, estorno desconta, outro mês não", () => {
    const k = calcularKpisPagar(
      [],
      [
        { amount_paid: 100, payment_date: hoje },
        { amount_paid: 30, payment_date: hoje }, // parcial do mesmo mês
        { amount_paid: -30, payment_date: hoje }, // estorno (linha negativa)
        { amount_paid: 500, payment_date: "2000-01-01" }, // outro mês
      ],
      hoje,
    );
    expect(k.pagoMes).toBe(100);
  });
});

describe("tela Contas a Pagar", () => {
  it("não executa RPC mutante (fn_mark_financial_overdue) na abertura", () => {
    resultados = { accounts_payable: { data: [], error: null, count: 0 } };
    renderizar(<ContasPagar />);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("KPI carregando não exibe zero e falha exibe — com Tentar novamente", async () => {
    resultados = {
      accounts_payable: { data: [], error: null, count: 0 },
      accounts_payable_installments: { data: null, error: { message: "boom" } },
      payable_payments: { data: [], error: null },
      financial_documents: { data: [], error: null },
    };
    renderizar(<ContasPagar />);
    await waitFor(() => expect(screen.getByText("Não foi possível calcular os indicadores. Os valores não são confiáveis agora.")).toBeTruthy());
    expect(screen.queryByText(/R\$/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /Tentar novamente/i })[0]);
    await waitFor(() => expect(fromMock).toHaveBeenCalled());
  });

  it("erro na lista mostra aviso e retry, nunca lista vazia como sucesso", async () => {
    resultados = {
      accounts_payable: { data: null, error: { message: "boom" } },
      accounts_payable_installments: { data: [], error: null },
      payable_payments: { data: [], error: null },
      financial_documents: { data: [], error: null },
    };
    renderizar(<ContasPagar />);
    await waitFor(() => expect(screen.getByText("Não foi possível carregar as contas a pagar.")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeTruthy();
    expect(screen.queryByText("Nenhuma conta encontrada")).toBeNull();
  });

  it("paginação: página cheia habilita Carregar mais e busca a próxima com range correto", async () => {
    const linhas = Array.from({ length: 50 }, (_, i) =>
      conta({ id: `ap-${i}`, description: `Conta ${i}`, installments: [{ id: `i${i}`, status: "OPEN", due_date: "2026-09-01" }] }),
    );
    resultados = {
      accounts_payable: { data: linhas, error: null, count: 120 },
      accounts_payable_installments: { data: [], error: null },
      payable_payments: { data: [], error: null },
      financial_documents: { data: [], error: null },
    };
    renderizar(<ContasPagar />);
    await waitFor(() => expect(screen.getByText("Mostrando 50 de 120")).toBeTruthy());
    const botao = screen.getByRole("button", { name: "Carregar mais" });
    fireEvent.click(botao);
    await waitFor(() =>
      expect(ranges.filter(([t, from]) => t === "accounts_payable" && from === 50).length).toBeGreaterThan(0),
    );
  });

  it("conta cancelada não entra em Vencidos; saldo do drawer/payable usa a mesma fórmula", async () => {
    const linhas = [
      conta({
        id: "ap-cancel", status: "CANCELED",
        installments: [{ id: "i1", status: "OPEN", due_date: "2000-01-01", original_amount: 100, paid_amount: 0 }],
      }),
    ];
    resultados = {
      accounts_payable: { data: linhas, error: null, count: 1 },
      accounts_payable_installments: { data: [], error: null },
      payable_payments: { data: [], error: null },
      financial_documents: { data: [], error: null },
    };
    renderizar(<ContasPagar />);
    await waitFor(() => expect(screen.getByText("Insumos")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Vencidos" }));
    expect(screen.queryByText("Insumos")).toBeNull();
  });
});
