import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { parseRevenueForecastTenant } from "@/lib/financeiro/b2bRevenueForecastTenant";

const ok = (o: Record<string, unknown> = {}) => ({
  contract: "B2B_REVENUE_FORECAST_TENANT_V1", partner_id: null, organization_id: "orgA",
  forecast_residual: { amount: 27, orders: 2, enforceable: false, due_dates_estimated: true },
  confirmed_titles: { vencido: 0, ate_30: 4.5, ate_60: 4.5, ate_90: 0, apos_90: 0, total_aberto: 9 },
  legacy_unproven_orders: 1, ...o,
});

describe("contrato do leitor de previsão por empresa", () => {
  it("aceita residual 27 e títulos 9 separados", () => {
    const r = parseRevenueForecastTenant(ok(), null);
    expect(r.forecast_residual.amount).toBe(27);
    expect(r.confirmed_titles.total_aberto).toBe(9);
    expect(r.legacy_unproven_orders).toBe(1);
  });
  it("rejeita contrato legado, previsão exigível, parceiro trocado e faixas que não fecham", () => {
    expect(() => parseRevenueForecastTenant({ confirmada_30: 10, projetada: 5 }, null)).toThrow();
    expect(() => parseRevenueForecastTenant(ok({ forecast_residual: { amount: 27, orders: 2, enforceable: true, due_dates_estimated: true } }), null)).toThrow();
    expect(() => parseRevenueForecastTenant(ok(), "partnerB")).toThrow();
    expect(() => parseRevenueForecastTenant(ok({ confirmed_titles: { vencido: 0, ate_30: 4.5, ate_60: 4.5, ate_90: 0, apos_90: 0, total_aberto: 18 } }), null)).toThrow();
    expect(() => parseRevenueForecastTenant(ok({ legacy_unproven_orders: 1.5 }), null)).toThrow();
  });
  it("o hook nunca chama a função legada sem filtro de empresa", () => {
    const src = readFileSync("src/hooks/useB2BFinanceiro.ts", "utf8");
    expect(src).not.toMatch(/rpc\(\s*["']rpc_b2b_revenue_forecast["']/);
    expect(src).toContain("REVENUE_FORECAST_TENANT_RPC");
  });
  it("a coluna Forma não lê o campo legado do cabeçalho", () => {
    expect(readFileSync("src/pages/financeiro/FinanceiroB2B.tsx", "utf8")).not.toMatch(/r\.payment_method\b/);
  });
});

let forecast: any;
vi.mock("@/hooks/useB2BFinanceiro", () => ({ useB2BRevenueForecast: () => forecast }));
let condition: any;
vi.mock("@/hooks/usePaymentTermsApproval", () => ({ usePartnerOrderPaymentCondition: () => condition }));

describe("painel Previsão Receita", () => {
  beforeEach(() => { forecast = undefined; });
  it("leitor ausente fica indisponível, sem valores", async () => {
    forecast = { data: null, isLoading: false, isError: false, ready: true };
    const { default: P } = await import("@/pages/financeiro/PrevisaoReceitaB2B");
    render(<P />);
    expect(screen.getByRole("status")).toHaveTextContent(/indisponível até a instalação/i);
    expect(screen.queryByText(/R\$/)).toBeNull();
  });
  it("mostra títulos e residual em blocos separados e legado só como contagem", async () => {
    forecast = { data: parseRevenueForecastTenant(ok(), null), isLoading: false, isError: false, ready: true };
    const { default: P } = await import("@/pages/financeiro/PrevisaoReceitaB2B");
    render(<P />);
    expect(screen.getByText(/Títulos confirmados em aberto/)).toBeInTheDocument();
    expect(screen.getByText(/aguardando NF \(não exigível\)/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("1 pedido(s) antigos sem previsão comprovada: valor indisponível.");
  });
  it("erro de sessão não exibe valores", async () => {
    forecast = { data: undefined, isLoading: false, isError: true, ready: true };
    const { default: P } = await import("@/pages/financeiro/PrevisaoReceitaB2B");
    render(<P />);
    expect(screen.getByRole("status")).toHaveTextContent("Previsão indisponível para esta sessão");
  });
});

describe("célula Forma", () => {
  it("mostra boleto do snapshot de termos (PB001039) e indisponível em erro", async () => {
    const { B2BPaymentMethodCell } = await import("@/components/financeiro/B2BPaymentMethodCell");
    condition = { data: { payment_method_name: "Boleto", installment_count: 3 }, isLoading: false, isError: false };
    const { unmount } = render(<B2BPaymentMethodCell orderId="o1" />);
    expect(screen.getByText("Boleto · 3x")).toBeInTheDocument();
    unmount();
    condition = { data: undefined, isLoading: false, isError: true };
    render(<B2BPaymentMethodCell orderId="o1" />);
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });
});
