import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ErroAnexoPagarLocal,
  chaveTentativaPagar,
  classificarErroBaixaPagar,
  lerTentativaIncerta,
  limparTentativaIncerta,
  salvarTentativaIncerta,
} from "@/lib/financeiro/contasPagar";

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

/* --------------------------- helpers de recuperação --------------------------- */

describe("tentativa incerta de pagamento — persistência mínima", () => {
  beforeEach(() => localStorage.clear());

  const tentativa = {
    idempotencyKey: "key-1",
    parcelaId: "inst-1",
    usuarioId: "u1",
    payload: { amount_paid: 75, idempotency_key: "key-1", payment_date: "2026-09-22", payment_method_id: "pm-1" },
    criadoEm: "2026-09-22T00:00:00.000Z",
  };

  it("grava e lê a mesma chave e payload, isolados por usuário + parcela", () => {
    salvarTentativaIncerta(tentativa);
    expect(lerTentativaIncerta("u1", "inst-1")).toEqual(tentativa);
    expect(lerTentativaIncerta("u2", "inst-1")).toBeNull();
    expect(lerTentativaIncerta("u1", "inst-2")).toBeNull();
  });

  it("não guarda arquivo, token ou credencial", () => {
    salvarTentativaIncerta(tentativa);
    const bruto = localStorage.getItem(chaveTentativaPagar("u1", "inst-1")) ?? "";
    expect(bruto).not.toMatch(/token|access_token|senha|password|File|base64/i);
    expect(Object.keys(JSON.parse(bruto)).sort()).toEqual([
      "criadoEm",
      "idempotencyKey",
      "parcelaId",
      "payload",
      "usuarioId",
    ]);
  });

  it("registro corrompido ou de outro usuário é ignorado", () => {
    localStorage.setItem(chaveTentativaPagar("u1", "inst-1"), "{não json");
    expect(lerTentativaIncerta("u1", "inst-1")).toBeNull();
    salvarTentativaIncerta({ ...tentativa, usuarioId: "u1" });
    localStorage.setItem(
      chaveTentativaPagar("u1", "inst-1"),
      JSON.stringify({ ...tentativa, usuarioId: "outro" }),
    );
    expect(lerTentativaIncerta("u1", "inst-1")).toBeNull();
  });

  it("limpa após conferência explícita", () => {
    salvarTentativaIncerta(tentativa);
    limparTentativaIncerta("u1", "inst-1");
    expect(lerTentativaIncerta("u1", "inst-1")).toBeNull();
  });

  it("falha de anexo nunca torna o pagamento incerto", () => {
    const c = classificarErroBaixaPagar(new ErroAnexoPagarLocal("Selecione o comprovante para reenviar."));
    expect(c).toEqual({
      mensagem: "Selecione o comprovante para reenviar.",
      exigeConferencia: false,
    });
  });
});

/* ------------------------------ BaixaDialog payable ------------------------------ */

const { rpcMock, fromMock, anexarMock, actor, successMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  anexarMock: vi.fn(),
  successMock: vi.fn(),
  actor: { current: true, org: "org-1", uid: "u1" },
}));
vi.mock("sonner", () => ({ toast: { success: successMock, error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: actor.uid }, profile: { user_id: actor.uid, organization_id: actor.org, ativo: true }, roles: ["financeiro"], loading: false, checkAuthzAccess: () => actor.current }),
}));
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

function abrirDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <BaixaDialog open onClose={() => {}} kind="payable" installment={PARCELA_75} />
    </QueryClientProvider>,
  );
}

async function selecionarMetodo() {
  fireEvent.click(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByRole("option", { name: "Pix" }));
}

const UUID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  actor.current = true; actor.org = "org-1"; actor.uid = "u1";
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

afterEach(() => vi.restoreAllMocks());

/** Dispara um resultado incerto (resposta sem UUID) e devolve o payload enviado. */
async function provocarIncerteza() {
  rpcMock.mockResolvedValue({ data: null, error: null });
  abrirDialog();
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
  await selecionarMetodo();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
  await screen.findByRole("alert");
  return rpcMock.mock.calls[0][1].p_payload;
}

describe("BaixaDialog payable — resultado incerto sobrevive a fechar/reabrir", () => {
  it("reabrir após incerteza mantém o bloqueio, a mesma chave e o mesmo payload", async () => {
    const original = await provocarIncerteza();
    const { unmount } = abrirDialog();
    unmount();

    // Remontagem (fechar/reabrir a janela): estado incerto restaurado do armazenamento.
    abrirDialog();
    await waitFor(() =>
      expect(screen.getAllByText(/não foi possível confirmar/i).length).toBeGreaterThan(0),
    );
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    // Repetição explícita: mesma chave e payload idênticos, nenhuma baixa nova.
    rpcMock.mockResolvedValue({ data: UUID, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Repetir a mesma tentativa/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    const repetido = rpcMock.mock.calls[1][1].p_payload;
    expect(repetido.idempotency_key).toBe(original.idempotency_key);
    expect(repetido).toEqual(original);
  });

  it("nenhum envio automático nem chave nova ao reabrir", async () => {
    const original = await provocarIncerteza();
    abrirDialog();
    await waitFor(() =>
      expect(screen.getAllByText(/não foi possível confirmar/i).length).toBeGreaterThan(0),
    );
    // Reabrir não dispara RPC.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const guardado = lerTentativaIncerta("u1", "inst-1");
    expect(guardado?.idempotencyKey).toBe(original.idempotency_key);
  });

  it("após conferência explícita libera novo pagamento com chave nova", async () => {
    const original = await provocarIncerteza();
    abrirDialog();
    await waitFor(() =>
      expect(screen.getAllByText(/Já conferi a conta/i).length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Já conferi a conta/i })[0]);
    await waitFor(() => expect(lerTentativaIncerta("u1", "inst-1")).toBeNull());

    rpcMock.mockResolvedValue({ data: UUID, error: null });
    const confirmar = screen.getAllByRole("button", { name: "Confirmar" })[0];
    await waitFor(() => expect(confirmar).toBeEnabled());
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Pix" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Confirmar" })[0]);
    await waitFor(() => expect(rpcMock.mock.calls.length).toBeGreaterThan(1));
    const novo = rpcMock.mock.calls[rpcMock.mock.calls.length - 1][1].p_payload;
    expect(novo.idempotency_key).not.toBe(original.idempotency_key);
  }, 20_000);

  it("resolução tardia após a incerteza não registra sucesso nem nova RPC", async () => {
    let resolver: (v: any) => void = () => {};
    rpcMock.mockImplementation(() => new Promise((res) => { resolver = res; }));
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    // Resposta chega depois: mesmo assim nenhuma segunda chamada é feita.
    resolver({ data: UUID, error: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("duplo clique envia uma única RPC", async () => {
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    const btn = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("BaixaDialog payable — reenvio de comprovante pendente", () => {
  /** Registra o pagamento com sucesso e falha só no anexo. */
  async function chegarEmPendente() {
    resultados.financial_settings = {
      data: { require_receipt_on_payable_payment: false },
      error: null,
    };
    anexarMock.mockRejectedValueOnce(new Error("upload falhou"));
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(["x"], "comp.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [arquivo] } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByRole("button", { name: /Reenviar comprovante/i });
  }

  it("falha do anexo não torna o pagamento incerto e não gera nova RPC", async () => {
    await chegarEmPendente();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/comprovante pendente/i);
    expect(screen.queryByText(/não foi possível confirmar/i)).toBeNull();
    // Reenvio: zero RPC de pagamento.
    anexarMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: /Reenviar comprovante/i }));
    await waitFor(() => expect(anexarMock).toHaveBeenCalledTimes(2));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("reenvio mantém a mesma chave de idempotência do anexo", async () => {
    await chegarEmPendente();
    anexarMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: /Reenviar comprovante/i }));
    await waitFor(() => expect(anexarMock).toHaveBeenCalledTimes(2));
    expect(anexarMock.mock.calls[1][1].idempotencyKey).toBe(
      anexarMock.mock.calls[0][1].idempotencyKey,
    );
    expect(anexarMock.mock.calls[1][1].paymentId).toBe(UUID);
  });

  it.each(["revoke", "tenant", "uid", "unmount"])("reenvio tardio %s não publica sucesso/callback nem nova baixa", async mode => {
    await chegarEmPendente();
    let resolve: (() => void) | undefined;
    anexarMock.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
    fireEvent.click(screen.getByRole("button", { name: /Reenviar comprovante/i }));
    await waitFor(() => expect(anexarMock).toHaveBeenCalledTimes(2));
    const scope = anexarMock.mock.calls[1][1].isCurrent;
    if (mode === "revoke") actor.current = false;
    else if (mode === "tenant" || mode === "uid") {
      if (mode === "tenant") actor.org = "org-2"; else actor.uid = "u2";
      // A separate render updates the same hook instance through props.
      fireEvent.change(screen.getByLabelText(/Observações/i), { target: { value: "fence" } });
    } else {
      // RTL cleanup unmounts the actual hook instance.
      const { cleanup } = await import("@testing-library/react"); cleanup();
    }
    expect(scope()).toBe(false);
    await act(async () => { resolve?.(); });
    expect(successMock).not.toHaveBeenCalled(); expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("baixa confirmada limpa journal apesar de expirar durante anexo, sem sucesso tardio", async () => {
    let resolve: (() => void) | undefined;
    anexarMock.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
    abrirDialog(); await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error("file input missing");
    fireEvent.change(input, { target: { files: [new File(["x"], "comp.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(anexarMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(chaveTentativaPagar("u1", "inst-1"))).not.toBeNull();
    actor.current = false;
    await act(async () => { resolve?.(); });
    expect(localStorage.getItem(chaveTentativaPagar("u1", "inst-1"))).toBeNull();
    expect(successMock).not.toHaveBeenCalled(); expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
