import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PaymentSimulationSummary } from "@/components/comercial/PaymentSimulationSummary";

// Regra: antes da NF nenhum vencimento é definitivo, nem no contrato legado.
const sim = {
  quote_required: false, warnings: [],
  amounts: { table_amount: 20, discount_amount: 2, net_amount_after_discount: 18, financial_interest_amount: 0, final_amount: 18 },
  schedule: [{ installment_number: 1, due_date: "2026-12-09", amount: 18 }],
} as any;

describe("datas da simulação antes da NF", () => {
  it("legado (sem rótulo de meio) também mostra previsão e base NF", () => {
    render(<PaymentSimulationSummary simulation={sim} />);
    fireEvent.click(screen.getByText(/Parcelas estimadas \(1\)/));
    expect(screen.getByText(/previsão 09\/12\/2026/)).toBeInTheDocument();
    expect(screen.getByTestId("b2b-estimated-dates-note")).toHaveTextContent(/emissão da nota fiscal/);
  });
});
