import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { parseRevenueForecastTenant } from "@/lib/financeiro/b2bRevenueForecastTenant";

const ORG = "orgARBio";
const ok = (o: Record<string, unknown> = {}) => ({
  contract: "B2B_REVENUE_FORECAST_TENANT_V2", partner_id: null, organization_id: ORG,
  forecast_residual: { amount: 9, orders: 1, enforceable: false, due_dates_estimated: true, inconsistent: 0 },
  confirmed_titles: { proof: "b2b_document_allocation_v1", installments: 1, vencido: 0, ate_30: 9, ate_60: 0, ate_90: 0, apos_90: 0, total_aberto: 9 },
  titles_unavailable: { unproven: 5, legacy: 0, inconsistent: 0 },
  legacy_unproven_orders: 1, ...o,
});

describe("contrato V2 do leitor de previsão por empresa", () => {
  it("parcial: título com NF 9 e residual 9 ficam separados", () => {
    const r = parseRevenueForecastTenant(ok(), null, ORG);
    expect(r.confirmed_titles.total_aberto).toBe(9);
    expect(r.forecast_residual.amount).toBe(9);
    expect(r.titles_unavailable.unproven).toBe(5);
  });
  it("rejeita resposta de outra empresa (sessão trocada) e sessão sem empresa", () => {
    expect(() => parseRevenueForecastTenant(ok(), null, "orgFSF")).toThrow();
    expect(() => parseRevenueForecastTenant(ok(), null, null)).toThrow();
  });
  it("rejeita contrato V1/legado, prova de título diferente de NF autorizada e previsão exigível", () => {
    expect(() => parseRevenueForecastTenant(ok({ contract: "B2B_REVENUE_FORECAST_TENANT_V1" }), null, ORG)).toThrow();
    expect(() => parseRevenueForecastTenant({ confirmada_30: 10, projetada: 5 }, null, ORG)).toThrow();
    expect(() => parseRevenueForecastTenant(ok({ confirmed_titles: { ...ok().confirmed_titles, proof: "origin_type" } }), null, ORG)).toThrow();
    expect(() => parseRevenueForecastTenant(ok({ forecast_residual: { ...ok().forecast_residual, enforceable: true } }), null, ORG)).toThrow();
  });
  it("rejeita parceiro trocado, faixas que não fecham e contagens inválidas", () => {
    expect(() => parseRevenueForecastTenant(ok(), "partnerB", ORG)).toThrow();
    expect(() => parseRevenueForecastTenant(ok({ confirmed_titles: { ...ok().confirmed_titles, total_aberto: 18 } }), null, ORG)).toThrow();
    expect(() => parseRevenueForecastTenant(ok({ titles_unavailable: { unproven: -1, legacy: 0, inconsistent: 0 } }), null, ORG)).toThrow();
  });
  it("o hook usa só o leitor V2, com chave limpa em troca de sessão", () => {
    const src = readFileSync("src/hooks/useB2BFinanceiro.ts", "utf8");
    expect(src).not.toMatch(/rpc\(\s*["']rpc_b2b_revenue_forecast["']/);
    expect(src).toContain('queryKey: ["b2b-forecast", "tenant-v2", sessionOrg, partner]');
    expect(readFileSync("src/hooks/useB2BFinancialScope.ts", "utf8")).toContain('"b2b-forecast"');
  });
  it("a coluna Forma não lê o campo legado do cabeçalho", () => {
    expect(readFileSync("src/pages/financeiro/FinanceiroB2B.tsx", "utf8")).not.toMatch(/r\.payment_method\b/);
  });
});

let forecast: any;
vi.mock("@/hooks/useB2BFinanceiro", () => ({ useB2BRevenueForecast: () => forecast }));
let condition: any;
vi.mock("@/hooks/usePaymentTermsApproval", () => ({ usePartnerOrderPaymentConditionRead: () => condition }));

describe("painel Previsão Receita", () => {
  beforeEach(() => { forecast = undefined; });
  it("leitor ausente: mensagem de produto, sem valores nem instrução técnica", async () => {
    forecast = { data: null, isLoading: false, isError: false, ready: true };
    const { default: P } = await import("@/pages/financeiro/PrevisaoReceitaB2B");
    render(<P />);
    const s = screen.getByRole("status");
    expect(s).toHaveTextContent("A previsão de receita ainda não está disponível para a sua empresa.");
    expect(s.textContent).not.toMatch(/instala|leitor|RPC/i);
    expect(screen.queryByText(/R\$/)).toBeNull();
  });
  it("títulos sem NF comprovada ficam fora do total, só como contagem", async () => {
    forecast = { data: parseRevenueForecastTenant(ok(), null, ORG), isLoading: false, isError: false, ready: true };
    const { default: P } = await import("@/pages/financeiro/PrevisaoReceitaB2B");
    render(<P />);
    expect(screen.getByText(/Títulos com NF autorizada em aberto/)).toBeInTheDocument();
    expect(screen.getByLabelText("Títulos fora do total")).toHaveTextContent("5 parcela(s) sem NF autorizada comprovada");
  });
  it("erro de sessão não exibe valores", async () => {
    forecast = { data: undefined, isLoading: false, isError: true, ready: true };
    const { default: P } = await import("@/pages/financeiro/PrevisaoReceitaB2B");
    render(<P />);
    expect(screen.getByRole("status")).toHaveTextContent("Previsão indisponível para esta sessão");
  });
});

describe("célula Forma", () => {
  const cell = async (c: any) => {
    condition = c; const { B2BPaymentMethodCell } = await import("@/components/financeiro/B2BPaymentMethodCell");
    return render(<B2BPaymentMethodCell orderId="o1" />);
  };
  it("mostra boleto do snapshot de termos (PB001039)", async () => {
    await cell({ ready: true, isLoading: false, isError: false, data: { state: "present", condition: { payment_method_name: "Boleto", installment_count: 3 } } });
    expect(screen.getByText("Boleto · 3x")).toBeInTheDocument();
  });
  it("leitor ausente (PGRST202) é Indisponível, nunca 'Sem condição'", async () => {
    await cell({ ready: true, isLoading: false, isError: false, data: { state: "reader_unavailable" } });
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
    expect(screen.queryByText(/Sem condição/)).toBeNull();
  });
  it("ausência confirmada pelo servidor mostra 'Sem condição registrada'", async () => {
    await cell({ ready: true, isLoading: false, isError: false, data: { state: "absent" } });
    expect(screen.getByText("Sem condição registrada")).toBeInTheDocument();
  });
  it("sessão em troca (fence não pronto) não mostra dado anterior", async () => {
    await cell({ ready: false, isLoading: false, isError: false, data: { state: "present", condition: { payment_method_name: "Boleto", installment_count: 3 } } });
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });
});
