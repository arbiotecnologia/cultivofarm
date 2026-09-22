import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ErroBaixaIncerta,
  ErroBaixaPagarLocal,
  MSG_PAGAMENTO_NAO_CONFIRMADO,
  acumuladosParcelaPagar,
  calcularSaldoPagavel,
  classificarErroBaixaPagar,
  executarComDeadlineBaixaPagar,
  validarBaixaPagar,
} from "@/lib/financeiro/contasPagar";

const agendarImediato = (cb: () => void) => {
  const h = setTimeout(cb, 0);
  return h;
};

/** Cenário canônico: 100 original, pago 40, desconto 10, juros 20, multa 5 => saldo 75. */
const PARCELA_75 = {
  id: "inst-1",
  installment_number: 1,
  due_date: "2026-09-01",
  status: "OPEN",
  original_amount: 100,
  paid_amount: 40,
  interest_amount: 20,
  penalty_amount: 5,
  discount_amount: 10,
};

describe("saldo da baixa a pagar com acumulados", () => {
  it("100 pago 40, desconto 10, juros 20, multa 5 => saldo 75", () => {
    expect(calcularSaldoPagavel(PARCELA_75)).toBe(75);
    expect(saldoKpi(PARCELA_75)).toBe(75);
  });

  it("acumulados expostos para exibição discriminada", () => {
    const a = acumuladosParcelaPagar(PARCELA_75);
    expect(a).toEqual({ original: 100, pago: 40, juros: 20, multa: 5, desconto: 10 });
  });

  it("novos ajustes entram na mesma fórmula (75 + 2 juros - 1 desconto = 76)", () => {
    expect(
      calcularSaldoPagavel(PARCELA_75, { interest_amount: 2, discount_amount: 1 }),
    ).toBe(76);
  });
});

function saldoKpi(p: Parameters<typeof calcularSaldoPagavel>[0]) {
  // O KPI usa a mesma função pura (fonte única da fórmula).
  return calcularSaldoPagavel(p);
}

describe("validação da baixa a pagar", () => {
  const base = {
    parcela: PARCELA_75,
    form: {
      payment_date: "2026-09-22",
      amount: 75,
      payment_method_id: "pm-1",
      interest_amount: 0,
      penalty_amount: 0,
      discount_amount: 0,
    },
    metodosAtivos: ["pm-1"],
    settingsCarregadas: true,
    exigeComprovante: false,
    temArquivo: false,
    temSessao: true,
  };

  it("aceita valor até o saldo com acumulados", () => {
    expect(validarBaixaPagar(base)).toBeNull();
  });

  it("rejeita valor que excede o saldo com acumulados", () => {
    expect(validarBaixaPagar({ ...base, form: { ...base.form, amount: 75.01 } })).toMatch(
      /excede o saldo/i,
    );
  });

  it("rejeita ajustes negativos e mais de duas casas", () => {
    expect(
      validarBaixaPagar({ ...base, form: { ...base.form, discount_amount: -1 } }),
    ).toMatch(/Desconto/i);
    expect(
      validarBaixaPagar({ ...base, form: { ...base.form, amount: 10.123 } }),
    ).toMatch(/duas casas/i);
  });

  it("exige método ativo, settings carregadas, sessão e data real", () => {
    expect(validarBaixaPagar({ ...base, metodosAtivos: [] })).toMatch(/indisponível/i);
    expect(validarBaixaPagar({ ...base, settingsCarregadas: false })).toMatch(/configurações/i);
    expect(validarBaixaPagar({ ...base, temSessao: false })).toMatch(/Sessão/i);
    expect(
      validarBaixaPagar({ ...base, form: { ...base.form, payment_date: "2026-02-30" } }),
    ).toMatch(/data/i);
  });

  it("parcela sem saldo não permite baixa", () => {
    expect(
      validarBaixaPagar({ ...base, parcela: { ...PARCELA_75, paid_amount: 155 } }),
    ).toMatch(/não possui saldo/i);
  });
});

describe("classificação e mapeamento de erros da baixa a pagar", () => {
  it("guarda local preserva a edição", () => {
    const c = classificarErroBaixaPagar(new ErroBaixaPagarLocal("Valor inválido"));
    expect(c).toEqual({ mensagem: "Valor inválido", exigeConferencia: false });
  });

  it("token FIN_* tem prioridade sobre o 23514 genérico", () => {
    expect(
      classificarErroBaixaPagar({ code: "23514", message: 'check "FIN_INVALID_AMOUNT"' }).mensagem,
    ).toMatch(/Valor inválido para esta baixa/i);
  });

  it("conflito de idempotência é recusa comprovada (sem nova chave)", () => {
    const c = classificarErroBaixaPagar({ code: "23505", message: "dup" });
    expect(c.exigeConferencia).toBe(false);
    expect(c.mensagem).toMatch(/já foi registrado/i);
  });

  it("erro desconhecido nunca vaza texto cru e exige conferência", () => {
    const c = classificarErroBaixaPagar(new Error("relation boom interno xyz"));
    expect(c.exigeConferencia).toBe(true);
    expect(c.mensagem).toBe(MSG_PAGAMENTO_NAO_CONFIRMADO);
    expect(c.mensagem).not.toMatch(/boom/);
  });

  it("erro de incerteza classificado como incerto", () => {
    expect(classificarErroBaixaPagar(new ErroBaixaIncerta()).exigeConferencia).toBe(true);
  });
});

describe("prazo de 20s da baixa a pagar", () => {
  it("promise que nunca resolve rejeita como incerta e aborta o request", async () => {
    let signalRecebido: AbortSignal | undefined;
    const p = executarComDeadlineBaixaPagar(
      (signal) =>
        new Promise<never>(() => {
          signalRecebido = signal;
        }),
      { agendar: agendarImediato },
    );
    await expect(p).rejects.toBeInstanceOf(ErroBaixaIncerta);
    expect(signalRecebido?.aborted).toBe(true);
  });

  it("sucesso dentro do prazo resolve e limpa o timer", async () => {
    const cancelar = vi.fn();
    const r = await executarComDeadlineBaixaPagar(async () => ({ ok: 1 }), {
      timeoutMs: 5_000,
      cancelar,
    });
    expect(r).toEqual({ ok: 1 });
    expect(cancelar).toHaveBeenCalledTimes(1);
  });

  it("resolução tardia após o prazo não vira sucesso nem unhandled", async () => {
    let resolver: (v: unknown) => void = () => {};
    const p = executarComDeadlineBaixaPagar(
      () => new Promise((res) => { resolver = res; }),
      { agendar: agendarImediato },
    );
    await expect(p).rejects.toBeInstanceOf(ErroBaixaIncerta);
    resolver({ data: "uuid" });
    await new Promise((r) => setTimeout(r, 5));
    await expect(p).rejects.toBeInstanceOf(ErroBaixaIncerta);
  });

  it("rejeição tardia após o prazo não substitui o estado incerto", async () => {
    let rejeitar: (e: unknown) => void = () => {};
    const p = executarComDeadlineBaixaPagar(
      () => new Promise((_res, rej) => { rejeitar = rej; }),
      { agendar: agendarImediato },
    );
    await expect(p).rejects.toBeInstanceOf(ErroBaixaIncerta);
    rejeitar(new Error("tardio"));
    await new Promise((r) => setTimeout(r, 5));
    await expect(p).rejects.toBeInstanceOf(ErroBaixaIncerta);
  });
});

/* ---------------------- Componente BaixaDialog (payable) ---------------------- */

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { BaixaDialog } from "@/components/financeiro/BaixaDialog";

type Resultado = { data?: any; error?: any };
const PENDENTE = Symbol("pendente");
let resultados: Record<string, Resultado | typeof PENDENTE> = {};

function chain(tabela: string) {
  const obj: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          const r = resultados[tabela] ?? { data: [], error: null };
          const p = r === PENDENTE ? new Promise<never>(() => {}) : Promise.resolve(r);
          return (res: any, rej: any) => p.then(res as any, rej);
        }
        return () => obj;
      },
    },
  );
  return obj;
}

function abrirDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <BaixaDialog open onClose={() => {}} kind="payable" installment={PARCELA_75} />
    </QueryClientProvider>,
  );
}

const PARCELA_75_DB = { ...PARCELA_75, id: "inst-1", installment_number: 1, due_date: "2026-09-01", status: "OPEN" };

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

describe("BaixaDialog payable — exibição e travas", () => {
  it("mostra acumulados e saldo 75 no resumo da baixa", async () => {
    abrirDialog();
    await waitFor(() => expect(screen.getAllByText(/R\$ 75,00/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Juros acumulados/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Multa acumulada/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Desconto acumulado/i).length).toBeGreaterThan(0);
  });

  async function selecionarMetodo() {
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Pix" }));
  }

  it("chama a RPC de pagamento com amount_paid e idempotency_key", async () => {
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_payload.amount_paid).toBe(75);
    expect(args.p_payload.idempotency_key).toBeTruthy();
  });

  it("resposta sem UUID válido trava novo envio até conferência e não fecha", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível confirmar/i);
  });

  it("erro de rede desconhecido trava novo envio sem vazar texto cru", async () => {
    rpcMock.mockRejectedValue(new TypeError("Failed to fetch"));
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível confirmar/i);
  });

  it("erro conhecido do servidor preserva a edição (sem trava)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    // Recusa comprovada: sem alerta de incerteza e formulário liberado.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });
});

/* ------------------------------ ContaDrawer payable ------------------------------ */

vi.mock("@/components/financeiro/DocumentosReceberTab", () => ({
  DocumentosReceberTab: () => null,
}));
import { ContaDrawer } from "@/components/financeiro/ContaDrawer";

function abrirDrawer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <ContaDrawer open onClose={() => {}} kind="payable" contaId="ap-1" />
    </QueryClientProvider>,
  );
}

const CONTA_PAGAR = {
  id: "ap-1",
  description: "Fornecedor X",
  status: "OPEN",
  total_amount: 100,
  first_due_date: "2026-09-01",
  installment_count: 1,
  category: { name: "Insumos" },
};

describe("ContaDrawer payable — três pontas", () => {
  async function abrirAbaParcelas(res: Record<string, any>) {
    resultados = res;
    abrirDrawer();
    const aba = await screen.findByRole("tab", { name: "Parcelas" });
    fireEvent.click(aba);
  }

  it("Resumo mostra Carregando… (não zeros) enquanto as parcelas carregam", async () => {
    await abrirAbaParcelas({
      accounts_payable: { data: CONTA_PAGAR, error: null },
      accounts_payable_installments: PENDENTE as any,
    });
    await waitFor(() => expect(screen.getAllByText(/Carregando…/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/R\$ 0,00/).length).toBe(0);
  });

  it("estado de parcelas na aba usa colSpan 10 no ramo payable", async () => {
    await abrirAbaParcelas({
      accounts_payable: { data: CONTA_PAGAR, error: null },
      accounts_payable_installments: { data: [], error: null },
    });
    await waitFor(() =>
      expect(document.querySelector('td[colspan="10"]')).not.toBeNull(),
    );
  });

  it("parcela CANCELED exibe saldo não cobrável (—) e fica fora do resumo", async () => {
    await abrirAbaParcelas({
      accounts_payable: { data: CONTA_PAGAR, error: null },
      accounts_payable_installments: {
        data: [
          {
            ...PARCELA_75_DB,
            status: "CANCELED",
            paid_amount: 0,
          },
        ],
        error: null,
      },
    });
    await waitFor(() => expect(screen.getAllByText("—").length).toBeGreaterThan(0));
    // Resumo ignora canceladas: saldo consolidado é 0.
    await waitFor(() => expect(screen.getAllByText(/R\$ 0,00/).length).toBeGreaterThan(0));
  });
});
