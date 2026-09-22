import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { BaixaDialog } from "@/components/financeiro/BaixaDialog";

const PARCELA = { id: "inst-1", installment_number: 1, due_date: "2026-09-01", status: "OPEN", original_amount: 100, paid_amount: 40, interest_amount: 20, penalty_amount: 5, discount_amount: 10 };

type Resultado = { data?: any; error?: any };
let resultados: Record<string, Resultado> = {};
function chain(tabela: string) {
  const obj: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") {
        const r = resultados[tabela] ?? { data: [], error: null };
        return (res: any, rej: any) => Promise.resolve(r).then(res as any, rej);
      }
      return () => obj;
    },
  });
  return obj;
}

beforeEach(() => {
  vi.clearAllMocks();
  resultados = {
    financial_settings: { data: { require_receipt_on_payable_payment: false }, error: null },
    payment_methods: { data: [{ id: "pm-1", name: "Pix" }], error: null },
    bank_accounts: { data: [], error: null },
  };
  fromMock.mockImplementation((t: string) => chain(t));
  rpcMock.mockResolvedValue({ data: "00000000-0000-4000-8000-000000000001", error: null });
});

describe("debug", () => {
  it("chama RPC", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <BaixaDialog open onClose={() => {}} kind="payable" installment={PARCELA} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await new Promise((r) => setTimeout(r, 300));
    console.log("RPC CALLS:", JSON.stringify(rpcMock.mock.calls));
    const alerts = screen.queryAllByRole("alert");
    console.log("ALERTS:", alerts.map((a) => a.textContent));
  });
});
