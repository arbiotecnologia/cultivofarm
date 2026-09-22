import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { lerTentativaIncerta } from "@/lib/financeiro/contasPagar";

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

function abrirDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <BaixaDialog open onClose={() => {}} kind="payable" installment={PARCELA} />
    </QueryClientProvider>,
  );
}

async function selecionarMetodo() {
  fireEvent.click(screen.getAllByRole("combobox")[0]);
  fireEvent.click(await screen.findByRole("option", { name: "Pix" }));
}

function inputArquivo() {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function anexarArquivo() {
  fireEvent.change(inputArquivo(), {
    target: { files: [new File(["x"], "comp.pdf", { type: "application/pdf" })] },
  });
}

const UUID = "00000000-0000-4000-8000-000000000001";

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

afterEach(() => vi.restoreAllMocks());

/** Pagamento registrado com sucesso e anexo falho: estado de comprovante pendente. */
async function chegarEmPendente() {
  anexarMock.mockRejectedValueOnce(new Error("upload falhou"));
  abrirDialog();
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
  await selecionarMetodo();
  anexarArquivo();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await screen.findByRole("button", { name: /Reenviar comprovante/i });
}

describe("(1) arquivo travado durante gravação, livre só em pendência ociosa", () => {
  it("pendência ociosa permite trocar o arquivo; durante o reenvio o campo trava", async () => {
    await chegarEmPendente();
    // Ocioso: troca liberada.
    expect(inputArquivo()).not.toBeDisabled();

    let resolver: () => void = () => {};
    anexarMock.mockImplementationOnce(() => new Promise<void>((res) => { resolver = () => res(); }));
    fireEvent.click(screen.getByRole("button", { name: /Reenviar comprovante/i }));
    // Durante a gravação do reenvio o campo NÃO pode ser trocado.
    await waitFor(() => expect(inputArquivo()).toBeDisabled());
    resolver();
  });
});

describe("(2) falha remota no reenvio é sempre falha de anexo", () => {
  it("erro remoto cru no reenvio não vira incerto, não persiste tentativa e não chama RPC", async () => {
    await chegarEmPendente();
    const rpcAntes = rpcMock.mock.calls.length;
    anexarMock.mockRejectedValueOnce({ message: "TypeError: Failed to fetch" });
    fireEvent.click(screen.getByRole("button", { name: /Reenviar comprovante/i }));
    await waitFor(() => expect(anexarMock).toHaveBeenCalledTimes(2));

    // Continua em reenvio de comprovante pendente, sem bloqueio de conferência.
    await screen.findByRole("button", { name: /Reenviar comprovante/i });
    expect(screen.queryByText(/não foi possível confirmar/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Repetir a mesma tentativa/i })).toBeNull();
    expect(lerTentativaIncerta("u1", "inst-1")).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(rpcAntes);
  });
});

describe("(3) repetição recuperada sem arquivo não declara sucesso completo", () => {
  it("payload original com comprovante + sem arquivo => pagamento confirmado e comprovante pendente", async () => {
    // Tentativa incerta com comprovante selecionado.
    rpcMock.mockResolvedValue({ data: null, error: null });
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    anexarArquivo();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const original = rpcMock.mock.calls[0][1].p_payload;
    expect(original.has_receipt).toBe(true);

    // Remonta (arquivo se perde) e repete a MESMA tentativa.
    const { unmount } = abrirDialog();
    unmount();
    abrirDialog();
    await screen.findByRole("button", { name: /Repetir a mesma tentativa/i });
    rpcMock.mockResolvedValue({ data: UUID, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Repetir a mesma tentativa/i }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));

    // Payload idêntico no replay.
    expect(rpcMock.mock.calls[1][1].p_payload).toEqual(original);
    // Sem arquivo: nenhum anexo e estado de comprovante pendente com o pagamento.
    expect(anexarMock).not.toHaveBeenCalled();
    await screen.findByRole("button", { name: /Reenviar comprovante/i });

    // Selecionar o arquivo e reenviar: zero RPC adicional.
    anexarArquivo();
    anexarMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: /Reenviar comprovante/i }));
    await waitFor(() => expect(anexarMock).toHaveBeenCalledTimes(1));
    expect(anexarMock.mock.calls[0][1].paymentId).toBe(UUID);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});

describe("(4) guarda síncrona adquirida antes da mutação", () => {
  it("três cliques intercalados antes da RPC resolver geram uma única chamada", async () => {
    let resolver: (v: any) => void = () => {};
    rpcMock.mockImplementation(() => new Promise((res) => { resolver = res; }));
    abrirDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await selecionarMetodo();
    const btn = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(rpcMock).toHaveBeenCalledTimes(1);
    resolver({ data: UUID, error: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
