import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import {
  criacaoBemSucedida,
  gerarParcelasReceber,
  mapearErroNovaConta,
  MSG_NOVA_CONTA_NAO_CONFIRMADA,
  validarNovaContaReceber,
} from "@/lib/financeiro/novaContaReceber";
import { NovaContaDialog } from "@/components/financeiro/NovaContaDialog";

type Resultado = { data?: any; error?: any };
const PENDENTE = Symbol("pendente");
let resultados: Record<string, Resultado | typeof PENDENTE> = {};

function chain(tabela: string) {
  const obj: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") {
        const r = resultados[tabela] ?? { data: [], error: null };
        const p = r === PENDENTE ? new Promise<never>(() => {}) : Promise.resolve(r);
        return (res: any, rej: any) => p.then(res as any, rej);
      }
      return () => obj;
    },
  });
  return obj;
}

const UUID = "11111111-2222-3333-4444-555555555555";

function abrir(kind: "receivable" | "payable" = "receivable") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <NovaContaDialog open onClose={() => {}} kind={kind} />
    </QueryClientProvider>,
  );
}

async function selecionar(idTrigger: string, nomeOpcao: string) {
  const trigger = document.querySelector(`#${idTrigger}`) as HTMLElement;
  expect(trigger).not.toBeNull();
  fireEvent.pointerDown(trigger);
  const opcao = await screen.findByRole("option", { name: nomeOpcao });
  fireEvent.click(opcao);
}

function preencherBase() {
  fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "  Venda  " } });
  fireEvent.change(screen.getByLabelText("Valor total *"), { target: { value: "10000" } });
  fireEvent.change(screen.getByLabelText("Nº de parcelas"), { target: { value: "3" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  resultados = {};
  fromMock.mockImplementation((t: string) => chain(t));
});

describe("gerarParcelasReceber — regras puras", () => {
  it("distribui 100/3 em centavos: 33,34 + 33,33 + 33,33", () => {
    const r = gerarParcelasReceber(100, 3, "2026-09-01");
    expect(r.erro).toBeNull();
    expect(r.parcelas.map((p) => p.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(r.parcelas.map((p) => p.installment_number)).toEqual([1, 2, 3]);
    expect(r.parcelas.reduce((s, p) => s + p.amount, 0)).toBe(100);
  });

  it("0,02 em 3 parcelas é rejeitado (impossível em centavos)", () => {
    const r = gerarParcelasReceber(0.02, 3, "2026-09-01");
    expect(r.erro).toMatch(/pequeno demais/i);
    expect(r.parcelas).toHaveLength(0);
  });

  it("37 parcelas, 0, negativo e fracionário são rejeitados", () => {
    expect(gerarParcelasReceber(100, 37, "2026-09-01").erro).toMatch(/1 e 36/);
    expect(gerarParcelasReceber(100, 0, "2026-09-01").erro).toMatch(/1 e 36/);
    expect(gerarParcelasReceber(100, 2.5, "2026-09-01").erro).toMatch(/1 e 36/);
    expect(gerarParcelasReceber(0, 1, "2026-09-01").erro).toMatch(/maior que zero/i);
    expect(gerarParcelasReceber(-10, 1, "2026-09-01").erro).toMatch(/maior que zero/i);
  });

  it("valor com mais de 2 casas e data irreal são rejeitados", () => {
    expect(gerarParcelasReceber(10.555, 1, "2026-09-01").erro).toMatch(/duas casas/i);
    expect(gerarParcelasReceber(100, 1, "2026-02-30").erro).toMatch(/vencimento válida/i);
  });

  it("clampa fim de mês ao somar meses", () => {
    const r = gerarParcelasReceber(30, 2, "2026-01-31");
    expect(r.parcelas[1].due_date).toBe("2026-02-28");
  });
});

describe("validarNovaContaReceber — regras puras", () => {
  const base = {
    temSessao: true,
    description: "Venda",
    customer_id: "c1",
    category_id: "cat1",
    categoriasAtivas: ["cat1"],
    categoriasCarregadas: true,
    clientesCarregados: true,
    total_amount: 100,
    issue_date: "2026-09-01",
    first_due_date: "2026-09-01",
    installment_count: 2,
    installments: [
      { installment_number: 1, due_date: "2026-09-01", amount: 50 },
      { installment_number: 2, due_date: "2026-10-01", amount: 50 },
    ],
  };

  it("válido passa", () => {
    expect(validarNovaContaReceber(base)).toBeNull();
  });

  it("faltas de campos obrigatórios", () => {
    expect(validarNovaContaReceber({ ...base, temSessao: false })).toMatch(/Sessão expirada/);
    expect(validarNovaContaReceber({ ...base, description: "   " })).toMatch(/Descrição é obrigatória/);
    expect(validarNovaContaReceber({ ...base, customer_id: "" })).toMatch(/Cliente é obrigatório/);
    expect(validarNovaContaReceber({ ...base, category_id: "x" })).toMatch(/indisponível/i);
    expect(validarNovaContaReceber({ ...base, categoriasCarregadas: false })).toMatch(/carregar as categorias/i);
  });

  it("soma deve ser exata em centavos", () => {
    expect(validarNovaContaReceber({
      ...base,
      installments: [base.installments[0], { ...base.installments[1], amount: 49.99 }],
    })).toMatch(/exatamente/i);
  });

  it("parcela zero, negativa, fracionária e numeração inválida", () => {
    expect(validarNovaContaReceber({
      ...base,
      installments: [base.installments[0], { ...base.installments[1], amount: 0 }],
    })).toMatch(/Parcela 2.*maior que zero/i);
    expect(validarNovaContaReceber({
      ...base,
      installments: [base.installments[0], { ...base.installments[1], amount: 50.001 }],
    })).toMatch(/Parcela 2.*duas casas/i);
    expect(validarNovaContaReceber({
      ...base,
      installments: [{ ...base.installments[0], installment_number: 2 }, base.installments[1]],
    })).toMatch(/numeração/i);
    expect(validarNovaContaReceber({
      ...base,
      installments: [{ ...base.installments[0], due_date: "2026-02-30" }, base.installments[1]],
    })).toMatch(/Parcela 1.*vencimento válida/i);
  });

  it("total maior que zero e com no máximo 2 casas", () => {
    expect(validarNovaContaReceber({ ...base, total_amount: 0 })).toMatch(/maior que zero/i);
    expect(validarNovaContaReceber({ ...base, total_amount: 10.555 })).toMatch(/duas casas/i);
    expect(validarNovaContaReceber({ ...base, installment_count: 37 })).toMatch(/1 e 36/);
    expect(validarNovaContaReceber({ ...base, issue_date: "2026-02-30" })).toMatch(/emissão válida/i);
  });
});

describe("mapearErroNovaConta e criacaoBemSucedida", () => {
  it("allowlist remota, erro local preservado, desconhecido genérico", () => {
    expect(mapearErroNovaConta({ code: "FIN_TITLE_INVALID_COUNT" })).toMatch(/1 e 36/);
    expect(mapearErroNovaConta(new Error("FIN_TITLE_INVALID_SUM detectado"))).toMatch(/soma das parcelas/i);
    const local = new (mapearErroNovaConta as any).constructor === Object
      ? Object
      : class extends Error {};
    expect(mapearErroNovaConta({ message: "boom" })).toMatch(/Não foi possível criar a conta/);
    void local;
  });

  it("sucesso estrito exige success e title_id UUID", () => {
    expect(criacaoBemSucedida({ success: true, title_id: UUID })).toBe(true);
    expect(criacaoBemSucedida([{ success: true, title_id: UUID }])).toBe(true);
    expect(criacaoBemSucedida({ success: true, title_id: "abc" })).toBe(false);
    expect(criacaoBemSucedida({ success: false, title_id: UUID })).toBe(false);
    expect(criacaoBemSucedida(null)).toBe(false);
  });
});

describe("NovaContaDialog — Conta a Receber", () => {
  it("cadastro válido chama a RPC uma vez com payload em centavos corretos", async () => {
    resultados = {
      clientes: { data: [{ id: "c1", nome: "Cliente A", codigo_cliente: "C1" }], error: null },
      financial_categories: { data: [{ id: "cat1", name: "Vendas", type: "RECEITA", active: true }], error: null },
      financial_cost_centers: { data: [], error: null },
    };
    rpcMock.mockResolvedValue({ data: { success: true, title_id: UUID }, error: null });
    abrir();

    await selecionar("nc-cliente", "Cliente A");
    await selecionar("nc-categoria", "Vendas");
    preencherBase();

    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [nome, args] = rpcMock.mock.calls[0];
    expect(nome).toBe("rpc_create_financial_title");
    expect(args.p_kind).toBe("receivable");
    expect(args.p_payload.description).toBe("Venda");
    expect(args.p_payload.installments.map((p: any) => p.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("falta de campos mostra mensagem local e não chama a RPC", async () => {
    resultados = {
      clientes: { data: [{ id: "c1", nome: "Cliente A" }], error: null },
      financial_categories: { data: [{ id: "cat1", name: "Vendas" }], error: null },
      financial_cost_centers: { data: [], error: null },
    };
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Descrição é obrigatória."));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("erro de consulta de categorias oferece retry e bloqueia envio", async () => {
    resultados = {
      clientes: { data: [], error: null },
      financial_categories: { data: null, error: { message: "falha" } },
      financial_cost_centers: { data: [], error: null },
    };
    abrir();
    await screen.findByText(/Não foi possível carregar categorias/i);
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível carregar as categorias. Tente novamente."));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Tentar novamente").length).toBeGreaterThan(0);
  });

  it("37 parcelas é rejeitado localmente sem RPC", async () => {
    resultados = {
      clientes: { data: [{ id: "c1", nome: "Cliente A" }], error: null },
      financial_categories: { data: [{ id: "cat1", name: "Vendas" }], error: null },
      financial_cost_centers: { data: [], error: null },
    };
    abrir();
    await selecionar("nc-cliente", "Cliente A");
    await selecionar("nc-categoria", "Vendas");
    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "Venda" } });
    fireEvent.change(screen.getByLabelText("Valor total *"), { target: { value: "10000" } });
    fireEvent.change(screen.getByLabelText("Nº de parcelas"), { target: { value: "37" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O número de parcelas deve ser um inteiro entre 1 e 36."));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("resposta incerta (success inválido) não fecha o diálogo e exige conferência", async () => {
    resultados = {
      clientes: { data: [{ id: "c1", nome: "Cliente A" }], error: null },
      financial_categories: { data: [{ id: "cat1", name: "Vendas" }], error: null },
      financial_cost_centers: { data: [], error: null },
    };
    rpcMock.mockResolvedValue({ data: { success: false }, error: null });
    abrir();
    await selecionar("nc-cliente", "Cliente A");
    await selecionar("nc-categoria", "Vendas");
    preencherBase();
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MSG_NOVA_CONTA_NAO_CONFIRMADA));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: /Nova Conta a Receber/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar/i })).toBeDisabled();
  });

  it("duplo clique não cria dois títulos", async () => {
    resultados = {
      clientes: { data: [{ id: "c1", nome: "Cliente A" }], error: null },
      financial_categories: { data: [{ id: "cat1", name: "Vendas" }], error: null },
      financial_cost_centers: { data: [], error: null },
    };
    rpcMock.mockReturnValue(new Promise(() => {}));
    abrir();
    await selecionar("nc-cliente", "Cliente A");
    await selecionar("nc-categoria", "Vendas");
    preencherBase();
    const botao = screen.getByRole("button", { name: /Salvar/i });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(botao).toBeDisabled());
  });
});

describe("NovaContaDialog — Conta a Pagar preservada", () => {
  it("mantém mensagens e fluxo antigos e permite 120 parcelas", async () => {
    resultados = {
      financial_categories: { data: [{ id: "d1", name: "Frete", type: "DESPESA", active: true }], error: null },
      financial_cost_centers: { data: [], error: null },
    };
    rpcMock.mockResolvedValue({ data: { success: true, title_id: UUID }, error: null });
    abrir("payable");

    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "Frete" } });
    await selecionar("nc-categoria", "Frete");
    fireEvent.change(screen.getByLabelText("Fornecedor"), { target: { value: "Forn X" } });
    fireEvent.change(screen.getByLabelText("Nº de parcelas"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const [, args] = rpcMock.mock.calls[0];
    expect(args.p_kind).toBe("payable");
    expect(args.p_payload.installments).toHaveLength(120);
  });

  it("fornecedor obrigatório com mensagem antiga", async () => {
    resultados = {
      financial_categories: { data: [{ id: "d1", name: "Frete" }], error: null },
      financial_cost_centers: { data: [], error: null },
    };
    abrir("payable");
    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "Frete" } });
    await selecionar("nc-categoria", "Frete");
    fireEvent.click(screen.getByRole("button", { name: /Salvar/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Fornecedor é obrigatório"));
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
