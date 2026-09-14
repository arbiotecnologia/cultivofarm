import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock, rpc: rpcMock, storage: { from: vi.fn() } },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: toastMock,
  useToast: () => ({ toast: toastMock }),
}));

import { EntregaChecklistPanel } from "@/components/entregas/EntregaChecklistPanel";
import { EntregaOcorrenciasPanel } from "@/components/entregas/EntregaOcorrenciasPanel";

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

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EntregaChecklistPanel", () => {
  it("erro de consulta não vira lista vazia e oferece nova tentativa", async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "permission denied" } }));

    render(<EntregaChecklistPanel entregaId="e1" />, { wrapper });

    expect(await screen.findByTestId("checklist-erro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByTestId("checklist-vazio")).not.toBeInTheDocument();
    expect(screen.queryByText(/permission denied/)).not.toBeInTheDocument();
  });

  it("vazio legítimo só aparece após sucesso", async () => {
    fromMock.mockImplementation(() => chain({ data: [] }));
    render(<EntregaChecklistPanel entregaId="e1" />, { wrapper });
    expect(await screen.findByTestId("checklist-vazio")).toBeInTheDocument();
  });

  it("não marca item automaticamente e envia o valor booleano explícito", async () => {
    fromMock.mockImplementation(() =>
      chain({ data: [{ id: "i1", item: "Conferir volume", concluido: false, obrigatorio: true }] }),
    );
    rpcMock.mockResolvedValue({ error: null });

    render(<EntregaChecklistPanel entregaId="e1" />, { wrapper });

    const caixa = await screen.findByRole("checkbox");
    expect(caixa).not.toBeChecked();
    expect(rpcMock).not.toHaveBeenCalled();

    fireEvent.click(caixa);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_checklist_id: "i1", p_concluido: true });
  });

  it("clique duplo não dispara duas mutações", async () => {
    fromMock.mockImplementation(() =>
      chain({ data: [{ id: "i1", item: "Conferir volume", concluido: false, obrigatorio: false }] }),
    );
    rpcMock.mockImplementation(() => new Promise((r) => setTimeout(() => r({ error: null }), 30)));

    render(<EntregaChecklistPanel entregaId="e1" />, { wrapper });
    const caixa = await screen.findByRole("checkbox");
    fireEvent.click(caixa);
    fireEvent.click(caixa);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
  });

  it("canEdit=false desabilita e bloqueia o handler", async () => {
    fromMock.mockImplementation(() =>
      chain({ data: [{ id: "i1", item: "Conferir volume", concluido: false, obrigatorio: false }] }),
    );
    render(<EntregaChecklistPanel entregaId="e1" canEdit={false} />, { wrapper });
    const caixa = await screen.findByRole("checkbox");
    expect(caixa).toBeDisabled();
    fireEvent.click(caixa);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("EntregaOcorrenciasPanel", () => {
  it("erro de consulta não vira 'nenhuma ocorrência'", async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "erro interno" } }));
    render(<EntregaOcorrenciasPanel entregaId="e1" />, { wrapper });

    expect(await screen.findByTestId("ocorrencias-erro")).toBeInTheDocument();
    expect(screen.queryByTestId("ocorrencias-vazio")).not.toBeInTheDocument();
    expect(screen.queryByText(/erro interno/)).not.toBeInTheDocument();
  });

  it("mostra rótulos em português e o aviso do limite de 20", async () => {
    const lista = Array.from({ length: 20 }, (_, i) => ({
      id: `o${i}`,
      tipo: "volume_divergente",
      gravidade: "critica",
      descricao: `Ocorrência ${i}`,
      registrado_em: "2026-09-01T10:00:00Z",
    }));
    fromMock.mockImplementation(() => chain({ data: lista }));

    render(<EntregaOcorrenciasPanel entregaId="e1" />, { wrapper });

    expect((await screen.findAllByText("Volume divergente")).length).toBe(20);
    expect(screen.getAllByText("Crítica").length).toBe(20);
    expect(screen.getByTestId("ocorrencias-limite")).toHaveTextContent("20 ocorrências mais recentes");
  });

  it("não salva descrição em branco", async () => {
    fromMock.mockImplementation(() => chain({ data: [] }));
    render(<EntregaOcorrenciasPanel entregaId="e1" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /Nova/ }));
    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Descreva a ocorrência");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("clique duplo em Registrar envia uma única vez e envia a descrição sem espaços", async () => {
    fromMock.mockImplementation(() => chain({ data: [] }));
    rpcMock.mockImplementation(() => new Promise((r) => setTimeout(() => r({ error: null }), 30)));

    render(<EntregaOcorrenciasPanel entregaId="e1" />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /Nova/ }));
    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "  produto molhado  " } });
    const botao = screen.getByRole("button", { name: "Registrar" });
    fireEvent.click(botao);
    fireEvent.click(botao);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock.mock.calls[0][1].p_payload.descricao).toBe("produto molhado");
  });

  it("falha mantém o formulário aberto com os dados preenchidos", async () => {
    fromMock.mockImplementation(() => chain({ data: [] }));
    rpcMock.mockResolvedValue({ error: { message: "detalhe interno" } });

    render(<EntregaOcorrenciasPanel entregaId="e1" />, { wrapper });
    fireEvent.click(await screen.findByRole("button", { name: /Nova/ }));
    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "caixa amassada" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(screen.getByLabelText("Descrição *")).toHaveValue("caixa amassada");
    const descricaoToast = toastMock.mock.calls.map((c) => c[0]?.description).join(" ");
    expect(descricaoToast).not.toContain("detalhe interno");
  });

  it("trocar de entrega fecha o formulário e limpa a descrição", async () => {
    fromMock.mockImplementation(() => chain({ data: [] }));
    const { rerender } = render(<EntregaOcorrenciasPanel entregaId="e1" />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /Nova/ }));
    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "texto antigo" } });

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EntregaOcorrenciasPanel entregaId="e2" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByLabelText("Descrição *")).not.toBeInTheDocument());
  });

  it("canAdd=false não mostra o botão Nova", async () => {
    fromMock.mockImplementation(() => chain({ data: [] }));
    render(<EntregaOcorrenciasPanel entregaId="e1" canAdd={false} />, { wrapper });
    await screen.findByTestId("ocorrencias-vazio");
    expect(screen.queryByRole("button", { name: /Nova/ })).not.toBeInTheDocument();
  });
});
