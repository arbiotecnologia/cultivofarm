import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import FluxoCaixa, { saldoRestante } from "@/pages/financeiro/FluxoCaixa";
import { EstornosResumoCard } from "@/components/financeiro/EstornosResumoCard";

type Resultado = { data?: any; error?: any; count?: number | null };

/** Builder encadeável que devolve sempre o mesmo resultado. */
function chain(resultado: Resultado | (() => Promise<Resultado>)) {
  const obj: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          const p = typeof resultado === "function" ? resultado() : Promise.resolve(resultado);
          return (res: any, rej: any) => p.then(res, rej);
        }
        return () => obj;
      },
    },
  );
  return obj;
}

// O detalhe é limitado ao recorte do filtro (mês atual por padrão).
const hoje = new Date();
const INICIO_MES = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
const ROTULO = "Bucket 1";

const LINHAS = [
  {
    period_label: ROTULO, period_start: INICIO_MES,
    expected_inflows: 1000, expected_outflows: 400,
    realized_inflows: 700, realized_outflows: 100,
    projected_balance: 600, realized_balance: 600,
    accumulated_projected_balance: 600, accumulated_realized_balance: 600,
  },
];

function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <FluxoCaixa />
    </QueryClientProvider>,
  );
}

function abrirEstornos(from = "2026-03-01", to = "2026-03-31") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <EstornosResumoCard from={from} to={to} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  rpcMock.mockResolvedValue({ data: LINHAS, error: null });
  fromMock.mockImplementation(() => chain({ data: [], error: null }));
});

describe("FluxoCaixa — estados e fórmulas", () => {
  it("explica projetado, realizado e acumulado na tela", async () => {
    abrir();
    expect(await screen.findByText(/saldo restante de cada parcela/i)).toBeInTheDocument();
    expect(screen.getByText(/não é o saldo das contas bancárias/i)).toBeInTheDocument();
  });

  it("falha da consulta mostra erro com retry e não exibe totais zerados", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    abrir();
    expect(await screen.findAllByText(/não foi possível carregar o fluxo de caixa/i)).not.toHaveLength(0);
    expect(screen.queryByText("R$ 0,00")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    rpcMock.mockResolvedValue({ data: LINHAS, error: null });
    fireEvent.click(screen.getAllByRole("button", { name: /tentar novamente/i })[0]);
    expect(await screen.findAllByText("R$ 1.000,00")).not.toHaveLength(0);
  });

  it("vazio real informa ausência de movimentação", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    abrir();
    expect(await screen.findAllByText(/sem movimentação no período/i)).not.toHaveLength(0);
  });

  it("período inválido bloqueia a consulta", async () => {
    abrir();
    await screen.findAllByText("R$ 1.000,00");
    const chamadas = rpcMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-05-01" } });
    expect(await screen.findByText(/fluxo de caixa não foi consultado/i)).toBeInTheDocument();
    expect(rpcMock.mock.calls.length).toBe(chamadas);
  });

  it("comparativo mostra os dois acumulados rotulados", async () => {
    abrir();
    await screen.findAllByText("R$ 1.000,00");
    const abaComparativo = screen.getByRole("tab", { name: "Comparativo" });
    fireEvent.mouseDown(abaComparativo);
    fireEvent.click(abaComparativo);
    expect(await screen.findByText("Acum. projetado")).toBeInTheDocument();
    expect(screen.getByText("Acum. realizado")).toBeInTheDocument();
  });
});

describe("FluxoCaixa — detalhamento do bucket", () => {
  it("projetado mostra saldo restante e mantém título sem cliente", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "accounts_receivable_installments"
        ? chain({
            data: [
              {
                id: "r1", due_date: INICIO_MES, original_amount: 1000, received_amount: 300,
                discount_amount: 100, status: "PARTIAL",
                accounts_receivable: { description: "Parceiro sem cliente", clientes: null },
              },
            ],
            error: null,
          })
        : chain({ data: [], error: null }),
    );
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`ver títulos de ${ROTULO}`, "i") }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText("Parceiro sem cliente")).toBeInTheDocument();
    expect(within(dialogo).getByText("R$ 600,00")).toBeInTheDocument(); // 1000 - 300 - 100
    expect(within(dialogo).getByText("R$ 1.000,00")).toBeInTheDocument(); // original
  });

  it("realizado lista pagamentos e distingue estornos", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "receivable_payments"
        ? chain({
            data: [
              {
                id: "p1", payment_date: INICIO_MES, amount_received: 500, is_reversal: false,
                accounts_receivable_installments: { due_date: INICIO_MES, accounts_receivable: { description: "Venda", clientes: { nome: "Ana" } } },
              },
              {
                id: "p2", payment_date: INICIO_MES, amount_received: -500, is_reversal: true,
                accounts_receivable_installments: { due_date: INICIO_MES, accounts_receivable: { description: "Venda", clientes: { nome: "Ana" } } },
              },
            ],
            error: null,
          })
        : chain({ data: [], error: null }),
    );
    abrir();
    await screen.findAllByText("R$ 1.000,00");
    const abaRealizado = screen.getByRole("tab", { name: "Realizado" });
    fireEvent.mouseDown(abaRealizado);
    fireEvent.click(abaRealizado);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`ver títulos de ${ROTULO}`, "i") }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText("Recebimento")).toBeInTheDocument();
    expect(within(dialogo).getByText("Estorno")).toBeInTheDocument();
    expect(within(dialogo).getByText("-R$ 500,00")).toBeInTheDocument();
  });

  it("falha parcial do detalhe mostra erro em vez de lista vazia", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "accounts_payable_installments"
        ? chain({ data: null, error: { message: "x" } })
        : chain({ data: [], error: null }),
    );
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`ver títulos de ${ROTULO}`, "i") }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText(/não foi possível carregar os títulos/i)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/nenhum lançamento/i)).toBeNull();
  });

  it("lista truncada avisa que é parcial", async () => {
    const muitos = Array.from({ length: 101 }, (_, i) => ({
      id: `r${i}`, due_date: INICIO_MES, original_amount: 10, received_amount: 0,
      discount_amount: 0, status: "OPEN",
      accounts_receivable: { description: `T${i}`, clientes: { nome: "Ana" } },
    }));
    fromMock.mockImplementation((tabela: string) =>
      tabela === "accounts_receivable_installments" ? chain({ data: muitos, error: null }) : chain({ data: [], error: null }),
    );
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`ver títulos de ${ROTULO}`, "i") }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText(/lista parcial/i)).toBeInTheDocument();
    expect(within(dialogo).getByText("A receber (100)")).toBeInTheDocument();
  });

  it("troca de agrupamento fecha o detalhe aberto", async () => {
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`ver títulos de ${ROTULO}`, "i") }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const abaMensal = screen.getByRole("tab", { name: "Mensal", hidden: true });
    fireEvent.mouseDown(abaMensal);
    fireEvent.click(abaMensal);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("FluxoCaixa — saldo restante alinhado ao RPC", () => {
  it("título quitado com juros projeta zero (a receber 100/110 com juros 10)", () => {
    expect(saldoRestante(100, 110, 0, "PAID")).toBe(0);
  });

  it("título quitado com juros projeta zero (a pagar 100/110 com juros 10)", () => {
    expect(saldoRestante(100, 110, 0, "PAID")).toBe(0);
    expect(saldoRestante(100, 110, 0, "paid")).toBe(0);
  });

  it("parcial preserva o saldo original menos recebido e desconto", () => {
    expect(saldoRestante(100, 50, 0, "PARTIAL")).toBe(50);
    expect(saldoRestante(1000, 300, 100, "OPEN")).toBe(600);
  });

  it("estorno mantém o saldo em aberto do título não quitado", () => {
    expect(saldoRestante(100, -50, 0, "OPEN")).toBe(150);
  });
});

describe("EstornosResumoCard", () => {
  it("erro não desaparece: mostra mensagem e retry", async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "x" } }));
    abrirEstornos();
    expect(await screen.findByText(/não foi possível carregar os estornos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it("zero real é explícito", async () => {
    fromMock.mockImplementation(() => chain({ data: [], error: null, count: 0 }));
    abrirEstornos();
    expect(await screen.findByText(/nenhum estorno registrado no período/i)).toBeInTheDocument();
  });

  it("página menor por max_rows do servidor não encerra a paginação", async () => {
    let pagina = 0;
    fromMock.mockImplementation((tabela: string) => {
      if (tabela !== "receivable_payments") return chain({ data: [], error: null, count: 0 });
      return chain(async () => {
        const atual = pagina++;
        // Servidor limita cada resposta a 500 linhas, abaixo do tamanho pedido.
        const linhas = atual === 0 ? 500 : 101;
        return {
          data: Array.from({ length: linhas }, (_, i) => ({ id: `p${atual}-${i}`, amount_received: -1 })),
          error: null,
          count: 601,
        };
      });
    });
    abrirEstornos();
    expect(await screen.findByText("-R$ 601,00")).toBeInTheDocument();
    expect(screen.getByText("601")).toBeInTheDocument();
    expect(screen.queryByText(/não foi possível somar todos os estornos/i)).toBeNull();
  });

  it("sem contagem confiável não apresenta totais como definitivos", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "receivable_payments"
        ? chain({ data: [{ id: "a1", amount_received: -10 }], error: null })
        : chain({ data: [], error: null, count: 0 }),
    );
    abrirEstornos();
    expect(await screen.findByText(/não foi possível somar todos os estornos/i)).toBeInTheDocument();
    expect(screen.queryByText("-R$ 10,00")).toBeNull();
  });

  it("limite de segurança atingido não exibe soma truncada", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "receivable_payments"
        ? chain({ data: [{ id: "a1", amount_received: -1 }], error: null, count: 999999 })
        : chain({ data: [], error: null, count: 0 }),
    );
    abrirEstornos();
    expect(await screen.findByText(/não foi possível somar todos os estornos/i)).toBeInTheDocument();
    expect(screen.queryByText(/lançamento\(s\)/i)).toBeNull();
  });

  it("período inválido não consulta nada", () => {
    abrirEstornos("2026-05-01", "2026-01-01");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
