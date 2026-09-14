import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, toastMock, invokeMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  toastMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock, rpc: rpcMock, functions: { invoke: invokeMock }, storage: { from: vi.fn() } },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: toastMock,
  useToast: () => ({ toast: toastMock }),
}));

import { ConferenciaEmbalagemQR } from "@/components/estoque/ConferenciaEmbalagemQR";
import { TermoEntregaPanel } from "@/components/entregas/TermoEntregaPanel";
import {
  parseQuantidadeConferencia,
  MSG_QUANTIDADE_INVALIDA,
} from "@/lib/entregas/quantidadeConferencia";

function chain(resultado: { data?: any; error?: any }) {
  const obj: any = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: async () => resultado,
    then: (res: any, rej: any) => Promise.resolve(resultado).then(res, rej),
  };
  return obj;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConferenciaEmbalagemQR", () => {
  const digitar = (valor: string) =>
    fireEvent.change(screen.getByLabelText(/Código da embalagem/i), { target: { value: valor } });

  it("Enter com campo vazio não chama a RPC", () => {
    render(<ConferenciaEmbalagemQR entregaId="A" />, { wrapper });
    fireEvent.keyDown(screen.getByLabelText(/Código da embalagem/i), { key: "Enter" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Enter duplo durante a leitura não duplica a movimentação", async () => {
    const d = deferred<any>();
    rpcMock.mockReturnValue(d.promise);

    render(<ConferenciaEmbalagemQR entregaId="A" />, { wrapper });
    digitar("EMB-1");
    const input = screen.getByLabelText(/Código da embalagem/i);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ data: { found: false }, error: null });
    });
  });

  it("embalagem sem vínculo avisa explicitamente e não indica sucesso", async () => {
    rpcMock.mockResolvedValue({
      data: { found: true, codigo_embalagem: "EMB-1", status: "disponivel", volume: 1, unidade: "L", entrega_id: null },
      error: null,
    });

    render(<ConferenciaEmbalagemQR entregaId="A" />, { wrapper });
    digitar("EMB-1");
    fireEvent.click(screen.getByRole("button", { name: "Conferir" }));

    expect(await screen.findByTestId("qr-sem-vinculo")).toHaveTextContent(
      "Embalagem não vinculada a esta entrega",
    );
    expect(screen.queryByTestId("qr-pertence")).not.toBeInTheDocument();
  });

  it("resposta antiga (A→B→A) não sobrescreve a leitura da entrega atual", async () => {
    const antiga = deferred<any>();
    rpcMock.mockReturnValueOnce(antiga.promise);

    const { rerender } = render(<ConferenciaEmbalagemQR entregaId="A" />, { wrapper });
    digitar("EMB-ANTIGA");
    fireEvent.click(screen.getByRole("button", { name: "Conferir" }));

    rerender(<ConferenciaEmbalagemQR entregaId="B" />);
    rerender(<ConferenciaEmbalagemQR entregaId="A" />);

    await act(async () => {
      antiga.resolve({
        data: { found: true, codigo_embalagem: "EMB-ANTIGA", status: "disponivel", volume: 1, unidade: "L", entrega_id: "A" },
        error: null,
      });
    });

    expect(screen.queryByText("EMB-ANTIGA")).not.toBeInTheDocument();
    expect(screen.queryByTestId("qr-carregando")).not.toBeInTheDocument();
  });

  it("rejeição tardia da leitura antiga não trava nem exibe erro na entrega nova", async () => {
    const antiga = deferred<any>();
    rpcMock.mockReturnValueOnce(antiga.promise);

    const { rerender } = render(<ConferenciaEmbalagemQR entregaId="A" />, { wrapper });
    digitar("EMB-ANTIGA");
    fireEvent.click(screen.getByRole("button", { name: "Conferir" }));

    rerender(<ConferenciaEmbalagemQR entregaId="B" />);
    await act(async () => {
      antiga.reject(new Error("timeout interno"));
    });

    expect(screen.queryByTestId("qr-erro")).not.toBeInTheDocument();

    rpcMock.mockResolvedValueOnce({ data: { found: false }, error: null });
    fireEvent.change(screen.getByLabelText(/Código da embalagem/i), { target: { value: "EMB-B" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferir" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });
});

describe("quantidade da conferência", () => {
  it("rejeita vazio, zero, NaN e ambiguidade sem coerção para 1", () => {
    ["", "   ", "0", "abc", "-1", "1.234,56", "1,2,3", "1 000"].forEach((v) => {
      const r = parseQuantidadeConferencia(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toBe(MSG_QUANTIDADE_INVALIDA);
    });
  });

  it("aceita inteiro e vírgula decimal simples", () => {
    expect(parseQuantidadeConferencia("2")).toEqual({ ok: true, valor: 2 });
    expect(parseQuantidadeConferencia("1,5")).toEqual({ ok: true, valor: 1.5 });
    expect(parseQuantidadeConferencia("1.5")).toEqual({ ok: true, valor: 1.5 });
  });
});

describe("TermoEntregaPanel", () => {
  const etiquetas = [
    { etiqueta_id: "et1", produto_etiquetas: { id: "et1", codigo_etiqueta: "ETQ-1", status: "ativa", cq_liberado: true } },
  ];

  function mockConsultas({ falhar = false, itens = etiquetas as any[] } = {}) {
    fromMock.mockImplementation((tabela: string) => {
      if (falhar) return chain({ data: null, error: { message: "permission denied for table" } });
      if (tabela === "entrega_etiquetas") return chain({ data: itens, error: null });
      if (tabela === "entrega_conferencia_itens") return chain({ data: [], error: null });
      return chain({ data: null, error: null });
    });
  }

  it("falha de consulta mostra erro amigável, não vazio, e bloqueia ações", async () => {
    mockConsultas({ falhar: true });
    render(<TermoEntregaPanel entregaId="A" />, { wrapper });

    expect(await screen.findByTestId("termo-erro")).toBeInTheDocument();
    expect(screen.queryByTestId("termo-vazio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Salvar conferência/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/permission denied/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("vazio legítimo só aparece após sucesso", async () => {
    mockConsultas({ itens: [] });
    render(<TermoEntregaPanel entregaId="A" />, { wrapper });
    expect(await screen.findByTestId("termo-vazio")).toBeInTheDocument();
  });

  it("quantidade inválida não chama a RPC e avisa o usuário", async () => {
    mockConsultas();
    render(<TermoEntregaPanel entregaId="A" />, { wrapper });

    const campo = await screen.findByLabelText("Quantidade");
    fireEvent.change(campo, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar conferência/ }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastMock.mock.calls[0][0].description).toContain(MSG_QUANTIDADE_INVALIDA);
  });

  it("quantidade com vírgula é enviada como número decimal", async () => {
    mockConsultas();
    rpcMock.mockResolvedValue({ error: null });
    render(<TermoEntregaPanel entregaId="A" />, { wrapper });

    fireEvent.change(await screen.findByLabelText("Quantidade"), { target: { value: "1,5" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar conferência/ }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls[0][1].p_itens[0].quantidade).toBe(1.5);
  });

  it("clique duplo em salvar não duplica a chamada", async () => {
    mockConsultas();
    const d = deferred<any>();
    rpcMock.mockReturnValue(d.promise);
    render(<TermoEntregaPanel entregaId="A" />, { wrapper });

    const botao = await screen.findByRole("button", { name: /Salvar conferência/ });
    fireEvent.click(botao);
    fireEvent.click(botao);
    fireEvent.click(botao);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve({ error: null });
    });
  });

  it("A→B→A: sucesso tardio da entrega antiga não emite aviso na atual", async () => {
    mockConsultas();
    const d = deferred<any>();
    rpcMock.mockReturnValue(d.promise);
    const { rerender } = render(<TermoEntregaPanel entregaId="A" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /Salvar conferência/ }));
    rerender(<TermoEntregaPanel entregaId="B" />);
    rerender(<TermoEntregaPanel entregaId="A" />);

    await act(async () => {
      d.resolve({ error: null });
    });

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("falha tardia da entrega antiga não destrava nem avisa na entrega nova", async () => {
    mockConsultas();
    const antiga = deferred<any>();
    rpcMock.mockReturnValueOnce(antiga.promise);
    const { rerender } = render(<TermoEntregaPanel entregaId="A" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /Salvar conferência/ }));
    rerender(<TermoEntregaPanel entregaId="B" />);

    const nova = deferred<any>();
    rpcMock.mockReturnValueOnce(nova.promise);
    fireEvent.click(await screen.findByRole("button", { name: /Salvar conferência/ }));
    expect(rpcMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      antiga.reject(new Error("conexão perdida"));
    });
    expect(toastMock).not.toHaveBeenCalled();

    // B continua travada enquanto sua própria operação não termina.
    fireEvent.click(screen.getByRole("button", { name: /Salvar conferência/ }));
    expect(rpcMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      nova.resolve({ error: null });
    });
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ title: "Conferência registrada" }));
  });
});

describe("lacunas da revisão independente", () => {
  it("QR: editar o código limpa o resultado anterior", async () => {
    rpcMock.mockResolvedValue({
      data: { found: true, codigo_embalagem: "EMB-1", status: "disponivel", volume: 1, unidade: "L", entrega_id: "A" },
      error: null,
    });
    render(<ConferenciaEmbalagemQR entregaId="A" />, { wrapper });
    const input = screen.getByLabelText(/Código da embalagem/i);
    fireEvent.change(input, { target: { value: "EMB-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferir" }));
    expect(await screen.findByTestId("qr-pertence")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "EMB-2" } });
    expect(screen.queryByTestId("qr-pertence")).not.toBeInTheDocument();
    expect(screen.queryByText("EMB-1")).not.toBeInTheDocument();
  });

  it("QR: campo fica travado enquanto a leitura está pendente", async () => {
    const d = deferred<any>();
    rpcMock.mockReturnValue(d.promise);
    render(<ConferenciaEmbalagemQR entregaId="A" />, { wrapper });
    const input = screen.getByLabelText(/Código da embalagem/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "EMB-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferir" }));

    fireEvent.change(input, { target: { value: "EMB-9" } });
    expect(input.value).toBe("EMB-1");

    await act(async () => {
      d.resolve({ data: { found: false }, error: null });
    });
    fireEvent.change(input, { target: { value: "EMB-9" } });
    expect((screen.getByLabelText(/Código da embalagem/i) as HTMLInputElement).value).toBe("EMB-9");
  });

  it("Termo: trocar de entrega durante o cálculo do hash não envia a assinatura", async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === "entrega_termos")
        return chain({
          data: { id: "t1", versao: 1, status: "rascunho", snapshot_hash: "h", numero_termo: "T-1" },
          error: null,
        });
      if (tabela === "entrega_etiquetas") return chain({ data: [], error: null });
      return chain({ data: [], error: null });
    });

    const digests: Array<{ resolve: (v: any) => void }> = [];
    const original = globalThis.crypto.subtle.digest;
    const espiao = vi.fn(() => {
      const d = deferred<ArrayBuffer>();
      digests.push(d as any);
      return d.promise;
    });
    // @ts-expect-error substituição controlada no teste
    globalThis.crypto.subtle.digest = espiao;

    try {
      const { rerender } = render(<TermoEntregaPanel entregaId="A" />, { wrapper });
      const botao = await screen.findByRole("button", { name: /Assinar/i });
      fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Maria" } });
      fireEvent.click(botao);
      await waitFor(() => expect(digests.length).toBe(1));

      rerender(<TermoEntregaPanel entregaId="B" />);
      await act(async () => {
        digests[0].resolve(new ArrayBuffer(32));
      });

      expect(digests.length).toBe(1); // segundo hash nem é iniciado
      expect(rpcMock).not.toHaveBeenCalled();
    } finally {
      // @ts-expect-error restauração
      globalThis.crypto.subtle.digest = original;
    }
  });

  it("Termo: troca durante o segundo hash também impede a chamada com efeito", async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === "entrega_termos")
        return chain({
          data: { id: "t1", versao: 1, status: "rascunho", snapshot_hash: "h", numero_termo: "T-1" },
          error: null,
        });
      return chain({ data: [], error: null });
    });

    const digests: Array<{ resolve: (v: any) => void }> = [];
    const original = globalThis.crypto.subtle.digest;
    // @ts-expect-error substituição controlada no teste
    globalThis.crypto.subtle.digest = vi.fn(() => {
      const d = deferred<ArrayBuffer>();
      digests.push(d as any);
      return d.promise;
    });

    try {
      const { rerender } = render(<TermoEntregaPanel entregaId="A" />, { wrapper });
      fireEvent.change(await screen.findByLabelText("Nome *"), { target: { value: "Maria" } });
      fireEvent.click(screen.getByRole("button", { name: /Assinar/i }));
      await waitFor(() => expect(digests.length).toBe(1));

      await act(async () => {
        digests[0].resolve(new ArrayBuffer(32));
      });
      await waitFor(() => expect(digests.length).toBe(2));

      rerender(<TermoEntregaPanel entregaId="B" />);
      await act(async () => {
        digests[1].resolve(new ArrayBuffer(32));
      });

      expect(rpcMock).not.toHaveBeenCalled();
    } finally {
      // @ts-expect-error restauração
      globalThis.crypto.subtle.digest = original;
    }
  });
});
