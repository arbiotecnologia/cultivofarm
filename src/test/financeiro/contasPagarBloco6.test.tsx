import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  MSG_CONFERENCIA_NAO_LIBERADA,
  MSG_JOURNAL_CORROMPIDO,
  chaveTentativaPagar,
  lerJournalTentativa,
  persistirTentativaAntesEnvio,
  salvarTentativaIncerta,
  tentativaBaixaPagarValida,
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

const { rpcMock, fromMock, anexarMock, toastErro } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  anexarMock: vi.fn(),
  toastErro: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { user_id: "u1", organization_id: "org-1", ativo: true }, roles: ["financeiro"], loading: false }) }));
vi.mock("@/lib/financial/anexarComprovanteBaixa", () => ({ anexarComprovanteBaixa: anexarMock }));
vi.mock("sonner", () => ({ toast: { error: toastErro, success: vi.fn() } }));

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

function abrirDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <BaixaDialog open onClose={() => {}} kind="payable" installment={PARCELA} />
    </QueryClientProvider>,
  );
}

const CHAVE = chaveTentativaPagar("u1", "inst-1");

const TENTATIVA: TentativaBaixaPagar = {
  idempotencyKey: "idem-1",
  parcelaId: "inst-1",
  usuarioId: "u1",
  payload: {
    amount_paid: 10,
    idempotency_key: "idem-1",
    payment_date: "2026-09-22",
    payment_method_id: "pm-1",
  },
  criadoEm: "2026-09-22T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resultados = {
    financial_settings: { data: { require_receipt_on_payable_payment: false }, error: null },
    payment_methods: { data: [{ id: "pm-1", name: "Pix" }], error: null },
    bank_accounts: { data: [], error: null },
  };
  fromMock.mockImplementation((t: string) => chain(t));
  rpcMock.mockResolvedValue({ data: "00000000-0000-4000-8000-000000000001", error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("regressão — validação do journal", () => {
  it("payload array é inválido e a leitura vira falha sem apagar o registro", () => {
    const invalido = { ...TENTATIVA, payload: [] as any };
    expect(tentativaBaixaPagarValida(invalido)).toBe(false);
    localStorage.setItem(CHAVE, JSON.stringify(invalido));
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "falha" });
    expect(localStorage.getItem(CHAVE)).not.toBeNull();
  });

  it("payload.idempotency_key divergente ou vazio vira falha", () => {
    const divergente = { ...TENTATIVA, payload: { ...TENTATIVA.payload, idempotency_key: "outra" } };
    localStorage.setItem(CHAVE, JSON.stringify(divergente));
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "falha" });
    expect(localStorage.getItem(CHAVE)).not.toBeNull();

    const vazia = { ...TENTATIVA, idempotencyKey: "  ", payload: { ...TENTATIVA.payload, idempotency_key: "  " } };
    localStorage.setItem(CHAVE, JSON.stringify(vazia));
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "falha" });
  });

  it("campos essenciais de replay ausentes ou inválidos viram falha", () => {
    for (const p of [
      { ...TENTATIVA.payload, payment_date: "" },
      { ...TENTATIVA.payload, payment_method_id: "" },
      { ...TENTATIVA.payload, amount_paid: 0 },
      { ...TENTATIVA.payload, amount_paid: "10" as any },
    ]) {
      localStorage.setItem(CHAVE, JSON.stringify({ ...TENTATIVA, payload: p }));
      expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "falha" });
    }
  });

  it("a persistência recusa gravar registro inconsistente e não sobrescreve o válido", () => {
    expect(persistirTentativaAntesEnvio(TENTATIVA)).toBe(true);
    const inconsistente = { ...TENTATIVA, payload: { ...TENTATIVA.payload, idempotency_key: "x" } };
    expect(persistirTentativaAntesEnvio(inconsistente)).toBe(false);
    salvarTentativaIncerta(inconsistente as TentativaBaixaPagar);
    expect(lerJournalTentativa("u1", "inst-1")).toEqual({ estado: "ok", tentativa: TENTATIVA });
  });

  it("registro inconsistente bloqueia o envio sem nenhuma RPC", async () => {
    localStorage.setItem(CHAVE, JSON.stringify({ ...TENTATIVA, payload: [] }));
    abrirDialog();
    expect(await screen.findByText(MSG_JOURNAL_CORROMPIDO)).toBeTruthy();
    const botao = screen.getByRole("button", { name: /confirmar/i }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.click(botao);
    await waitFor(() => expect(rpcMock).not.toHaveBeenCalled());
    expect(localStorage.getItem(CHAVE)).not.toBeNull();
  });
});

describe("regressão — conferência só libera com remoção comprovada", () => {
  it("falha na remoção mantém tentativa, chave e bloqueio com mensagem segura", async () => {
    localStorage.setItem(CHAVE, JSON.stringify(TENTATIVA));
    abrirDialog();
    const liberar = await screen.findByRole("button", { name: /Já conferi a conta/i });
    const spy = vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    fireEvent.click(liberar);
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith(MSG_CONFERENCIA_NAO_LIBERADA));
    spy.mockRestore();
    expect(localStorage.getItem(CHAVE)).toBe(JSON.stringify(TENTATIVA));
    expect(screen.getByRole("button", { name: /Repetir a mesma tentativa/i })).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("remoção comprovada libera o formulário", async () => {
    localStorage.setItem(CHAVE, JSON.stringify(TENTATIVA));
    abrirDialog();
    const liberar = await screen.findByRole("button", { name: /Já conferi a conta/i });
    fireEvent.click(liberar);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Repetir a mesma tentativa/i })).toBeNull(),
    );
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });
});
