import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import DRE, { grupoTemAtividade, LIMITE_DETALHE_DRE } from "@/pages/financeiro/DRE";

type Resultado = { data?: any; error?: any; count?: number | null };

/** Registro das chamadas encadeadas por tabela, para verificar ordem (filtro antes do limite). */
const chamadas: { tabela: string; metodos: string[]; args: any[][] }[] = [];
let resultados: Record<string, Resultado> = {};

function chain(tabela: string) {
  const registro = { tabela, metodos: [] as string[], args: [] as any[][] };
  chamadas.push(registro);
  const obj: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          const r = resultados[tabela] ?? { data: [], error: null, count: 0 };
          const p = Promise.resolve(r);
          return (res: any, rej: any) => p.then(res, rej);
        }
        return (...args: any[]) => {
          registro.metodos.push(String(prop));
          registro.args.push(args);
          return obj;
        };
      },
    },
  );
  return obj;
}

function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <DRE />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const RESUMO = {
  receita_bruta: { total: 100, qtd: 1 },
  despesa_fixa: { total: 30, qtd: 1 },
  resultado_operacional: 70,
  margem_operacional_percentual: 70,
  unclassified_categories: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  chamadas.length = 0;
  resultados = {};
  rpcMock.mockResolvedValue({ data: RESUMO, error: null });
  fromMock.mockImplementation((tabela: string) => chain(tabela));
});

const linhaRecebimento = (over: any = {}) => ({
  id: over.id ?? "r1",
  amount_received: over.amount_received ?? 100,
  payment_date: "2026-03-10",
  is_reversal: over.is_reversal ?? false,
  accounts_receivable_installments: {
    accounts_receivable: {
      description: "Venda",
      financial_categories: { name: "Vendas", dre_group: "RECEITA_BRUTA" },
      clientes: over.clientes === null ? null : { nome: "Cliente A" },
    },
  },
});

const linhaPagamento = (over: any = {}) => ({
  id: over.id ?? "p1",
  amount_paid: over.amount_paid ?? 20,
  payment_date: "2026-03-11",
  is_reversal: over.is_reversal ?? false,
  accounts_payable_installments: {
    accounts_payable: {
      description: "Insumo",
      supplier_name: "Fornecedor X",
      financial_categories: { name: "Vendas", dre_group: "RECEITA_BRUTA" },
    },
  },
});

async function expandirReceita() {
  const botao = await screen.findByRole("button", { name: /Receita Bruta/i });
  fireEvent.click(botao);
  return botao;
}

describe("DRE Gerencial — estados", () => {
  it("erro do resumo mostra mensagem, retry e não exibe zeros", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    abrir();
    expect(await screen.findByText(/não foi possível carregar o dre/i)).toBeInTheDocument();
    expect(screen.queryByText(/= Resultado Operacional/)).toBeNull();

    rpcMock.mockResolvedValue({ data: RESUMO, error: null });
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(await screen.findByText("= Resultado Operacional")).toBeInTheDocument();
  });

  it("período inválido bloqueia a consulta do DRE", async () => {
    abrir();
    await screen.findByText("= Resultado Operacional");
    const antes = rpcMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-05-01" } });
    expect(await screen.findByText(/o dre não foi consultado/i)).toBeInTheDocument();
    await waitFor(() => expect(rpcMock.mock.calls.length).toBe(antes));
  });

  it("explica competência por vencimento e estornos fora da quantidade", async () => {
    abrir();
    expect(await screen.findByText(/valor original na data de vencimento/i)).toBeInTheDocument();
    expect(screen.getByText(/estornos não são contados/i)).toBeInTheDocument();
  });

  it("trocar o regime fecha os detalhes abertos", async () => {
    resultados = { receivable_payments: { data: [linhaRecebimento()], error: null, count: 1 } };
    abrir();
    const botao = await expandirReceita();
    expect(await screen.findByText(/Cliente A/)).toBeInTheDocument();
    expect(botao).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Competência" }));
    expect(await screen.findByText(/Regime de Competência/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Cliente A/)).toBeNull());
    expect(screen.getByRole("button", { name: /Receita Bruta/i })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("DRE Gerencial — grupos e não classificado", () => {
  it("grupo negativo com quantidade zero continua expansível", async () => {
    rpcMock.mockResolvedValue({
      data: { ...RESUMO, receita_bruta: { total: -40, qtd: 0 } },
      error: null,
    });
    abrir();
    const botao = await screen.findByRole("button", { name: /Receita Bruta/i });
    expect(botao).toBeInTheDocument();
    expect(grupoTemAtividade({ total: -40, qtd: 0 })).toBe(true);
    expect(grupoTemAtividade({ total: 0, qtd: 0 })).toBe(false);
    expect(grupoTemAtividade(undefined)).toBe(false);
  });

  it("mostra Não classificado negativo e avisa que não compõe o resultado", async () => {
    rpcMock.mockResolvedValue({
      data: { ...RESUMO, sem_classificacao: { total: -15, qtd: 0 } },
      error: null,
    });
    abrir();
    expect(await screen.findByText(/⚠ Não classificado/)).toBeInTheDocument();
    expect(screen.getByText(/não compõem o resultado operacional/i)).toBeInTheDocument();
  });

  it("mostra Não classificado zerado quando o grupo veio do servidor", async () => {
    rpcMock.mockResolvedValue({
      data: { ...RESUMO, sem_classificacao: { total: 0, qtd: 0 } },
      error: null,
    });
    abrir();
    expect(await screen.findByText(/⚠ Não classificado/)).toBeInTheDocument();
  });

  it("inventário de categorias não classificadas é apresentado como global", async () => {
    rpcMock.mockResolvedValue({
      data: { ...RESUMO, unclassified_categories: [{ id: "1", name: "Diversos" }] },
      error: null,
    });
    abrir();
    expect(await screen.findByText(/inventário é global/i)).toBeInTheDocument();
  });
});

describe("DRE Gerencial — detalhamento", () => {
  it("filtra o grupo no servidor antes de limitar e lê as duas origens", async () => {
    resultados = {
      receivable_payments: { data: [linhaRecebimento()], error: null, count: 1 },
      payable_payments: { data: [linhaPagamento()], error: null, count: 1 },
    };
    abrir();
    await expandirReceita();

    expect(await screen.findByText(/Cliente A/)).toBeInTheDocument();
    expect(screen.getByText(/Fornecedor X/)).toBeInTheDocument();

    const usadas = chamadas.filter((c) => c.tabela === "receivable_payments" && c.metodos.includes("limit"));
    expect(usadas.length).toBeGreaterThan(0);
    for (const c of usadas) {
      const iEq = c.metodos.indexOf("eq");
      const iLimit = c.metodos.indexOf("limit");
      expect(iEq).toBeGreaterThanOrEqual(0);
      expect(iEq).toBeLessThan(iLimit);
      expect(c.args[iEq][0]).toContain("dre_group");
      expect(c.args[iEq][1]).toBe("RECEITA_BRUTA");
      expect(c.args[iLimit][0]).toBe(LIMITE_DETALHE_DRE + 1);
    }
  });

  it("cliente ausente não quebra a linha", async () => {
    resultados = {
      receivable_payments: { data: [linhaRecebimento({ clientes: null })], error: null, count: 1 },
    };
    abrir();
    await expandirReceita();
    expect(await screen.findByText(/Vendas • — — Venda/)).toBeInTheDocument();
  });

  it("identifica estorno e sua data", async () => {
    resultados = {
      receivable_payments: {
        data: [linhaRecebimento({ id: "e1", amount_received: -40, is_reversal: true })],
        error: null,
        count: 1,
      },
    };
    abrir();
    await expandirReceita();
    expect(await screen.findByText("Estorno")).toBeInTheDocument();
    expect(screen.getByText("2026-03-10")).toBeInTheDocument();
  });

  it("truncamento avisa lista parcial sem prometer total", async () => {
    const muitos = Array.from({ length: LIMITE_DETALHE_DRE + 1 }, (_, i) =>
      linhaRecebimento({ id: `r${i}` }),
    );
    resultados = { receivable_payments: { data: muitos, error: null, count: 900 } };
    abrir();
    await expandirReceita();
    expect(await screen.findByText(/lista parcial/i)).toBeInTheDocument();
    expect(screen.getByText(/não é o total do grupo/i)).toBeInTheDocument();
  });

  it("erro no detalhe fica visível com retry", async () => {
    resultados = { receivable_payments: { data: null, error: { message: "falhou" }, count: null } };
    abrir();
    await expandirReceita();
    expect(await screen.findByText(/não foi possível carregar os lançamentos/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /tentar novamente/i }).length).toBeGreaterThan(0);
  });
});
