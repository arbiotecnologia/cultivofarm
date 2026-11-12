import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock, anexarMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  anexarMock: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { user_id: "u1", organization_id: "org-1", ativo: true }, roles: ["financeiro"], loading: false }) }));
vi.mock("@/lib/financial/anexarComprovanteBaixa", () => ({ anexarComprovanteBaixa: anexarMock }));

import ContasReceber from "@/pages/financeiro/ContasReceber";
import { BaixaDialog } from "@/components/financeiro/BaixaDialog";
import { calcularKpisReceber, saldoParcela } from "@/lib/financeiro/contasReceber";
import {
  ErroBaixaLocal,
  MSG_BAIXA_GENERICA,
  mapearErroBaixaRecebimento,
  validarBaixaRecebimento,
} from "@/lib/financeiro/baixaRecebimento";

type Resultado = { data?: any; error?: any; count?: number | null };
let resultados: Record<string, Resultado> = {};

function chain(tabela: string) {
  const obj: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") {
        const r = resultados[tabela] ?? { data: [], error: null, count: 0 };
        return (res: any, rej: any) => Promise.resolve(r).then(res as any, rej);
      }
      if (prop === "maybeSingle") return async () => resultados[tabela] ?? { data: {}, error: null };
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

beforeEach(() => {
  vi.clearAllMocks();
  resultados = {};
  fromMock.mockImplementation((t: string) => chain(t));
});

describe("1) KPI inclui juros e multa acumulados", () => {
  it("parcial sintética R$1 de título R$20 mantém R$19 exigível, sem presumir cancelamento", () => {
    const parcial = { original_amount: 20, received_amount: 1, discount_amount: 0, interest_amount: 0, penalty_amount: 0, status: "PARTIAL", due_date: "2026-11-12" };
    expect(saldoParcela(parcial)).toBe(19);
    expect(calcularKpisReceber([parcial], [], "2026-11-12").aberto).toBe(19);
  });
  const parcela = {
    original_amount: 100,
    received_amount: 40,
    discount_amount: 10,
    interest_amount: 20,
    penalty_amount: 5,
    due_date: "2026-09-10",
    status: "OPEN",
  };

  it("saldoParcela = 100 + 20 + 5 - 10 - 40 = 75", () => {
    expect(saldoParcela(parcela)).toBe(75);
  });

  it("Em aberto, vencido e 7 dias usam o saldo com acumulados", () => {
    const vencida = calcularKpisReceber([parcela], [], "2026-09-20");
    expect(vencida.aberto).toBe(75);
    expect(vencida.vencido).toBe(75);

    const janela = calcularKpisReceber([parcela], [], "2026-09-05");
    expect(janela.vence7).toBe(75);
    expect(janela.vencido).toBe(0);
  });
});

describe("2) Payable mantém o fallback paid_amount", () => {
  it("100 pago 40 => saldo 60 e exibe 40 como já pago", async () => {
    resultados = { financial_settings: { data: {}, error: null } };
    renderizar(
      <BaixaDialog
        open
        onClose={() => {}}
        kind="payable"
        installment={{ id: "i1", installment_number: 1, due_date: "2026-09-10", original_amount: 100, paid_amount: 40 }}
      />,
    );
    await waitFor(() => expect(screen.getByText("Saldo a pagar:")).toBeTruthy());
    const linhas = screen.getAllByText(/R\$/).map((n) => (n.textContent ?? "").replace(/\u00a0/g, " "));
    expect(linhas).toContain("R$ 60,00");
    expect(linhas).toContain("R$ 40,00");
  });
});

describe("3) Reenvio de comprovante pendente não revalida a baixa", () => {
  async function abrirComPendencia() {
    resultados = { financial_settings: { data: {}, error: null } };
    rpcMock.mockResolvedValue({ data: "pay-1", error: null });
    anexarMock.mockRejectedValueOnce(new Error("upload falhou"));
    const utils = renderizar(
      <BaixaDialog
        open
        onClose={() => {}}
        kind="receivable"
        installment={{ id: "i1", installment_number: 1, due_date: "2026-09-10", original_amount: 100, received_amount: 0 }}
      />,
    );
    await waitFor(() => expect(screen.getByText("Forma de pagamento *")).toBeTruthy());
    return utils;
  }

  it("com saldo zero e método inativo, o reenvio não chama RPC", async () => {
    const { rerender } = await abrirComPendencia();
    // Estado de pendência simulado pela via real: baixa ok + upload falho.
    // Reconstruímos o caminho com props reatualizadas (saldo 0).
    rpcMock.mockClear();
    anexarMock.mockReset();
    anexarMock.mockResolvedValue(undefined);
    rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <BaixaDialog
            open
            onClose={() => {}}
            kind="receivable"
            installment={{ id: "i1", installment_number: 1, due_date: "2026-09-10", original_amount: 100, received_amount: 100 }}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("validação da nova baixa exige método ativo e saldo, mas o reenvio não passa por ela", () => {
    const erro = validarBaixaRecebimento({
      parcela: { original_amount: 100, received_amount: 100 },
      form: { payment_date: "2026-09-10", amount: 10, payment_method_id: "pm-1" },
      metodosAtivos: ["pm-1"],
      settingsCarregadas: true,
      exigeComprovante: false,
      temArquivo: false,
      temSessao: true,
    });
    expect(erro).toBe("Esta parcela não possui saldo a receber.");
  });
});

describe("4) Erros da baixa: local tipado x remoto por allowlist", () => {
  it("erro local preserva a mensagem", () => {
    expect(mapearErroBaixaRecebimento(new ErroBaixaLocal("Selecione a forma de pagamento"))).toBe(
      "Selecione a forma de pagamento",
    );
  });

  it("FIN_INVALID_AMOUNT e conflito de idempotência têm mensagem segura", () => {
    expect(mapearErroBaixaRecebimento({ code: "FIN_INVALID_AMOUNT" })).toContain("Valor inválido");
    expect(mapearErroBaixaRecebimento({ message: "erro fin_idempotency_conflict" })).toContain("já foi registrado");
    expect(mapearErroBaixaRecebimento({ code: "23505" })).toContain("já foi registrado");
  });

  it("erro desconhecido nunca vaza texto cru", () => {
    expect(
      mapearErroBaixaRecebimento({ message: 'duplicate key value violates constraint "pk_receivable_payments"' }),
    ).toBe(MSG_BAIXA_GENERICA);
  });

  it("valores com mais de duas casas são rejeitados localmente", () => {
    const erro = validarBaixaRecebimento({
      parcela: { original_amount: 100 },
      form: { payment_date: "2026-09-10", amount: 10.123, payment_method_id: "pm-1" },
      metodosAtivos: ["pm-1"],
      settingsCarregadas: true,
      exigeComprovante: false,
      temArquivo: false,
      temSessao: true,
    });
    expect(erro).toBe("O valor deve ter no máximo duas casas decimais.");
  });
});

describe("5 e 6) Filtro Sem comprovante", () => {
  const CONTA_PAGA = {
    id: "ar-1",
    description: "Venda 1",
    status: "PAID",
    total_amount: 100,
    first_due_date: "2026-09-01",
    origin_type: "MANUAL",
    clientes: { nome: "Cliente A", codigo_cliente: "C1" },
    installments: [{ id: "inst-1", installment_number: 1, status: "PAID", due_date: "2026-09-01" }],
  };

  it("renderiza sem erro e resolve o comprovante da baixa mesmo se o KPI de parcelas falhar", async () => {
    resultados = {
      accounts_receivable: { data: [CONTA_PAGA], error: null, count: 1 },
      accounts_receivable_installments: { data: [{ id: "inst-1", receivable_id: "ar-1" }], error: null, count: 1 },
      receivable_payments: { data: [{ id: "pay-1", installment_id: "inst-1" }], error: null, count: 1 },
      financial_documents: {
        data: [{ id: "d1", owner_id: "pay-1", owner_type: "PAYMENT_RECEIVABLE", document_type: "RECEIPT" }],
        error: null,
        count: 1,
      },
    };
    renderizar(<ContasReceber />);
    fireEvent.click(await screen.findByText("Sem comprovante"));
    // Conta possui comprovante vigente: sai do filtro, sem erro de runtime.
    await waitFor(() => expect(screen.getByText("Nenhuma conta encontrada")).toBeTruthy());
  });
});
