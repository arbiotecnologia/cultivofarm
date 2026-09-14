import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, toastMock, navigateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  navigateMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<any>("react-router-dom");
  return { ...real, useNavigate: () => navigateMock };
});

import FinanceiroDashboard from "@/pages/financeiro/FinanceiroDashboard";
import { validarPeriodo } from "@/components/financeiro/bi/PeriodoFilter";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SUMMARY_OK = {
  total_receivable_expected: 1500,
  total_receivable_received: 500,
  total_payable_expected: 300,
  total_payable_paid: 100,
  projected_balance: 1200,
  realized_balance: 400,
  collection_rate: 0.33,
  payment_rate: 0.33,
  average_days_overdue: 2,
  total_receivable_overdue: 200,
  total_payable_overdue: 0,
  pending_billing_deliveries_count: 0,
  pending_billing_deliveries_amount: 0,
  pending_fiscal_invoice_count: 0,
  pending_fiscal_invoice_amount: 0,
  recurring_net_balance: 50,
};

const RANKINGS_VAZIO = {
  top_customers_revenue: [],
  top_revenue_categories: [],
  top_expense_categories: [],
  top_overdue_customers: [],
};

function respostaPorFuncao(mapa: Record<string, any>) {
  rpcMock.mockImplementation((fn: string) => {
    const r = mapa[fn];
    if (r === undefined) return Promise.resolve({ data: null, error: null });
    if (typeof r === "function") return r();
    return Promise.resolve(r);
  });
}

function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FinanceiroDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("validarPeriodo", () => {
  it("bloqueia datas ausentes, inválidas e invertidas", () => {
    expect(validarPeriodo({ from: "", to: "2026-01-10" })).toMatch(/informe as datas/i);
    expect(validarPeriodo({ from: "2026-02-31", to: "2026-03-01" })).toMatch(/data inválida/i);
    expect(validarPeriodo({ from: "2026-03-10", to: "2026-03-01" })).toMatch(/posterior/i);
    expect(validarPeriodo({ from: "2026-03-01", to: "2026-03-10" })).toBeNull();
  });
});

describe("FinanceiroDashboard — erros não viram zero", () => {
  it("falha do resumo mostra erro e não exibe R$ 0,00 nos KPIs", async () => {
    respostaPorFuncao({
      get_financial_dashboard_summary: { data: null, error: { message: "falha interna" } },
      get_top_financial_rankings: { data: RANKINGS_VAZIO, error: null },
      get_financial_alerts: { data: [], error: null },
    });
    abrir();
    expect(await screen.findByText(/não foi possível carregar os indicadores/i)).toBeInTheDocument();
    expect(screen.queryByText("R$ 0,00")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/falha interna/i)).toBeNull();
  });

  it("falha parcial: rankings falham e o resumo continua visível", async () => {
    respostaPorFuncao({
      get_financial_dashboard_summary: { data: SUMMARY_OK, error: null },
      get_top_financial_rankings: { data: null, error: { message: "erro rankings" } },
      get_financial_alerts: { data: [], error: null },
    });
    abrir();
    expect(await screen.findAllByText(/não foi possível carregar os rankings/i)).not.toHaveLength(0);
    expect(screen.queryByText(/nenhum cliente inadimplente/i)).toBeNull();
    expect(screen.getByText("Receitas previstas")).toBeInTheDocument();
  });

  it("falha dos alertas não mostra 'Tudo em dia'", async () => {
    respostaPorFuncao({
      get_financial_dashboard_summary: { data: SUMMARY_OK, error: null },
      get_top_financial_rankings: { data: RANKINGS_VAZIO, error: null },
      get_financial_alerts: { data: null, error: { message: "erro alertas" } },
    });
    abrir();
    expect(await screen.findByText(/não foi possível carregar os alertas/i)).toBeInTheDocument();
    expect(screen.queryByText(/tudo em dia/i)).toBeNull();
  });

  it("vazio real continua mostrando as mensagens de ausência", async () => {
    respostaPorFuncao({
      get_financial_dashboard_summary: { data: SUMMARY_OK, error: null },
      get_top_financial_rankings: { data: RANKINGS_VAZIO, error: null },
      get_financial_alerts: { data: [], error: null },
    });
    abrir();
    expect(await screen.findByText(/nenhum cliente inadimplente/i)).toBeInTheDocument();
    expect(screen.getByText(/tudo em dia/i)).toBeInTheDocument();
  });
});

describe("FinanceiroDashboard — atualizar vencidos", () => {
  it("duplo clique dispara a rotina uma única vez", async () => {
    const d = deferred<any>();
    respostaPorFuncao({
      get_financial_dashboard_summary: { data: SUMMARY_OK, error: null },
      get_top_financial_rankings: { data: RANKINGS_VAZIO, error: null },
      get_financial_alerts: { data: [], error: null },
      fn_mark_financial_overdue: () => d.promise,
    });
    abrir();
    const botao = await screen.findByRole("button", { name: /atualizar vencidos/i });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() =>
      expect(rpcMock.mock.calls.filter((c) => c[0] === "fn_mark_financial_overdue")).toHaveLength(1),
    );
    d.resolve({ data: null, error: null });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
  });

  it("rejeição vira mensagem amigável sem detalhe técnico", async () => {
    respostaPorFuncao({
      get_financial_dashboard_summary: { data: SUMMARY_OK, error: null },
      get_top_financial_rankings: { data: RANKINGS_VAZIO, error: null },
      get_financial_alerts: { data: [], error: null },
      fn_mark_financial_overdue: () => Promise.reject(new Error("connection reset")),
    });
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: /atualizar vencidos/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(String(toastMock.error.mock.calls[0][0])).not.toMatch(/connection reset/i);
  });
});

describe("FinanceiroDashboard — período inválido", () => {
  it("período personalizado invertido bloqueia as consultas", async () => {
    respostaPorFuncao({
      get_financial_dashboard_summary: { data: SUMMARY_OK, error: null },
      get_top_financial_rankings: { data: RANKINGS_VAZIO, error: null },
      get_financial_alerts: { data: [], error: null },
    });
    abrir();
    await screen.findByText("Receitas previstas");
    const chamadasAntes = rpcMock.mock.calls.filter((c) => c[0] === "get_financial_dashboard_summary").length;

    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    const de = screen.getByLabelText("De") as HTMLInputElement;
    const ate = screen.getByLabelText("Até") as HTMLInputElement;
    fireEvent.change(ate, { target: { value: "2026-01-01" } });
    fireEvent.change(de, { target: { value: "2026-05-01" } });

    expect(await screen.findAllByText(/não pode ser posterior/i)).not.toHaveLength(0);
    expect(screen.getByText(/indicadores não foram consultados/i)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      rpcMock.mock.calls.filter((c) => c[0] === "get_financial_dashboard_summary").length,
    ).toBe(chamadasAntes + 1); // apenas a consulta do período válido anterior
  });
});
