import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  MSG_JOURNAL_CORROMPIDO,
  MSG_JOURNAL_INDISPONIVEL,
  chaveTentativaPagar,
  lerJournalTentativa,
  lerTentativaIncerta,
  limparTentativaIncerta,
  persistirTentativaAntesEnvio,
  type TentativaBaixaPagar,
} from "@/lib/financeiro/contasPagar";

const PARCELA = {
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

const { rpcMock, fromMock, anexarMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  anexarMock: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/financial/anexarComprovanteBaixa", () => ({ anexarComprovanteBaixa: anexarMock }));

import { BaixaDialog } from "@/components/financeiro/BaixaDialog";

let resultados: Record<string, { data?: any; error?: any }> = {};

function chain(tabela: string) {
  const obj: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          const r = resultados[tabela] ?? { data: [], error: null };
          return (res: any, rej: any) => Promise.resolve(r).then(res as any, rej);
        }
        return () => obj;
      },
    },
  );
  return obj;
}

function abrirDialog(kind: "payable" | "receivable" = "payable") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <BaixaDialog open onClose={() => {}} kind={kind} installment={PARCELA} />
    </QueryClientProvider>,
  );
}

async function selecionarMetodo() {
  fireEvent.click(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByRole("option", { name: "Pix" }));
}

const UUID = "00000000-0000-4000-8000-000000000001";
const CHAVE = chaveTentativaPagar("u1", "inst-1");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resultados = {
    financial_settings: { data: { require_receipt_on_payable_payment: false }, error: null },
    payment_methods: { data: [{ id: "pm-1", name: "Pix" }], error: null },
    bank_accounts: { data: [], error: null },
  };
  fromMock.mockImplementation((t: string) => chain(t));
  rpcMock.mockResolvedValue({ data: UUID, error: null });
  anexarMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const TENTATIVA: TentativaBaixaPagar = {
  idempotencyKey: "idem-1",
  parcelaId: "inst-1",
  usuarioId: "u1",
  payload: { amount_paid: 10, idempotency_key: "idem-1" },
  criadoEm: "2026-09-22T12:00:00.000Z",
};

describe("helper — journal pré-envio", () => {
  it("persiste e confirma a leitura de volta do conteúdo exato", () => {
    expect(persistirTentativaAntesEnvio(TENTATIVA)).toBe(true);
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "ok", tentativa: TENTATIVA });
  });

  it("falha de escrita (quota) devolve false", () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(persistirTentativaAntesEnvio(TENTATIVA)).toBe(false);
    spy.mockRestore();
  });

  it("leitura de volta divergente devolve false", () => {
    vi.spyOn(localStorage, "getItem").mockReturnValue("{}");
    expect(persistirTentativaAntesEnvio(TENTATIVA)).toBe(false);
  });

  it("diferencia ausência legítima de falha/corrupção", () => {
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "ausente" });
    localStorage.setItem(CHAVE, "{isso não é json");
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "falha" });
    expect(lerTentativaIncerta("u1", "inst-1")).toBeNull();
    // Registro corrompido não é apagado pela leitura.
    expect(localStorage.getItem(CHAVE)).toBe("{isso não é json");
    const spy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "falha" });
    spy.mockRestore();
  });

  it("limpeza devolve sucesso/falha sem lançar", () => {
    persistirTentativaAntesEnvio(TENTATIVA);
    expect(limparTentativaIncerta("u1", "inst-1")).toBe(true);
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "ausente" });
    const spy = vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(limparTentativaIncerta("u1", "inst-1")).toBe(false);
    spy.mockRestore();
  });
});

describe("BaixaDialog payable — journal antes de qualquer RPC", () => {
  it("grava o journal ANTES da RPC e o remount com RPC pendente restaura chave e payload", async () => {
    let resolver: (v: any) => void = () => {};
    let journalNoMomentoDaRpc: string | null = null;
    rpcMock.mockImplementation(() => {
      journalNoMomentoDaRpc = localStorage.getItem(CHAVE);
      return new Promise((res) => { resolver = res; });
    });
    const primeiro = abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    // Journal já existia quando a RPC foi disparada.
    expect(journalNoMomentoDaRpc).not.toBeNull();
    const gravado = JSON.parse(journalNoMomentoDaRpc as unknown as string);
    const enviado = rpcMock.mock.calls[0][1].p_payload;
    expect(gravado.payload).toEqual(enviado);
    expect(gravado.usuarioId).toBe("u1");
    expect(gravado.parcelaId).toBe("inst-1");
    expect(JSON.stringify(gravado)).not.toMatch(/token|password|access_token|comp\.pdf/i);

    // Remount enquanto a RPC segue pendente: bloqueio restaurado com a mesma chave.
    primeiro.unmount();
    abrirDialog();
    await screen.findByRole("button", { name: /Repetir a mesma tentativa/i });
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    // Replay envia payload idêntico (mesma chave de idempotência).
    rpcMock.mockResolvedValue({ data: UUID, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Repetir a mesma tentativa/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock.mock.calls[1][1].p_payload).toEqual(enviado);
    resolver({ data: UUID, error: null });
  });

  it("falha de escrita no journal (quota) => mensagem segura e ZERO RPC", async () => {
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(MSG_JOURNAL_INDISPONIVEL).toMatch(/Nenhum pagamento foi enviado/);
    spy.mockRestore();
  });

  it("registro corrompido bloqueia envio, não é apagado e não dispara RPC", async () => {
    localStorage.setItem(CHAVE, "{corrompido");
    abrirDialog();
    await screen.findByText(MSG_JOURNAL_CORROMPIDO);
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await new Promise((r) => setTimeout(r, 10));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE)).toBe("{corrompido");
  });

  it("sem journal o formulário fica liberado após remount", async () => {
    const primeiro = abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    primeiro.unmount();
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Repetir a mesma tentativa/i })).toBeNull();
  });

  it("sucesso confirmado remove o journal; falha de limpeza não vira falha nem duplica", async () => {
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem(CHAVE)).toBeNull());

    // Nova baixa cujo journal não pode ser removido: pagamento segue confirmado,
    // nenhuma RPC extra é disparada pela falha de limpeza.
    const spy = vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const segundo = abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(MSG_JOURNAL_CORROMPIDO)).toBeNull();
    spy.mockRestore();
    segundo.unmount();
  });

  it("recusa comprovada do servidor limpa o journal", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "FIN_INVALID_AMOUNT" } });
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem(CHAVE)).toBeNull());
  });
});

describe("receivable inalterado", () => {
  it("baixa de recebimento não grava journal payable", async () => {
    abrirDialog("receivable");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls[0][0]).toBe("rpc_register_receivable_payment");
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });
});
