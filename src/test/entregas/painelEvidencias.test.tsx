import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, storageFrom, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  storageFrom: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
    rpc: vi.fn(),
    storage: { from: storageFrom },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: toastMock,
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "administrador" }),
}));

vi.mock("@/components/entregas/EntregaChecklistPanel", () => ({
  EntregaChecklistPanel: () => null,
}));
vi.mock("@/components/entregas/EntregaOcorrenciasPanel", () => ({
  EntregaOcorrenciasPanel: () => null,
}));
vi.mock("@/components/estoque/ConferenciaEmbalagemQR", () => ({
  ConferenciaEmbalagemQR: () => null,
}));

import { EntregaComprovantePanel } from "@/components/entregas/EntregaComprovantePanel";
import { EmbalagensEntregaPanel } from "@/components/estoque/EmbalagensEntregaPanel";

/** Encadeamento mínimo compatível com o cliente do banco. */
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
  storageFrom.mockReturnValue({ createSignedUrl: async () => ({ data: null, error: { message: "x" } }) });
});

describe("EntregaComprovantePanel — estado fresco do servidor", () => {
  it("usa o status atual do servidor mesmo com prop antiga (pendente)", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "entregas"
        ? chain({ data: { id: "e1", comprovante_status: "formulario_gerado", validation_token: "tok" } })
        : chain({ data: { id: "c1", numero_formulario: "AR-ENT-000004" } }),
    );

    render(<EntregaComprovantePanel entrega={{ id: "e1", comprovante_status: "pendente" }} />, { wrapper });

    expect(await screen.findByText("AR-ENT-000004")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir formulário/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar formulário/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Pendente")).not.toBeInTheDocument();
  });

  it("falha na consulta não vira status pendente nem ações de impressão", async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "erro interno" } }));

    render(<EntregaComprovantePanel entrega={{ id: "e1", comprovante_status: "pendente" }} />, { wrapper });

    expect(await screen.findByTestId("comprovante-erro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText("Pendente")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar formulário/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir formulário/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/erro interno/)).not.toBeInTheDocument();
  });

  it("ao trocar de entrega busca o estado da nova entrega", async () => {
    fromMock.mockImplementation((tabela: string, ...rest: any[]) => rest as any);
    const statusPorId: Record<string, string> = { e1: "formulario_gerado", e2: "pendente" };
    let idAtual = "e1";
    fromMock.mockImplementation((tabela: string) =>
      tabela === "entregas"
        ? chain({ data: { id: idAtual, comprovante_status: statusPorId[idAtual], validation_token: null } })
        : chain({ data: null }),
    );

    const { rerender } = render(
      <EntregaComprovantePanel entrega={{ id: "e1", comprovante_status: "pendente" }} />,
      { wrapper },
    );
    expect(await screen.findByRole("button", { name: /Imprimir formulário/ })).toBeInTheDocument();

    idAtual = "e2";
    rerender(<EntregaComprovantePanel entrega={{ id: "e2", comprovante_status: "formulario_gerado" }} />);

    expect(await screen.findByRole("button", { name: /Gerar formulário/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir formulário/ })).not.toBeInTheDocument();
  });

  it("falha do link assinado mostra aviso amigável e não abre janela", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "entregas"
        ? chain({ data: { id: "e1", comprovante_status: "anexado", validation_token: null } })
        : chain({ data: { id: "c1", numero_formulario: "AR-ENT-000004", arquivo_path: "p.pdf" } }),
    );
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: /Visualizar comprovante/ }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const arg = toastMock.mock.calls.at(-1)?.[0];
    expect(arg.title).toBe("Não foi possível abrir o comprovante");
    expect(JSON.stringify(arg)).not.toContain("x");
    expect(abrir).not.toHaveBeenCalled();
    abrir.mockRestore();
  });
});

describe("EntregaComprovantePanel — falha parcial e ausência", () => {
  it("falha só do comprovante, com entrega carregada, não mostra status nem ações", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "entregas"
        ? chain({ data: { id: "e1", comprovante_status: "formulario_gerado", validation_token: "tok" } })
        : chain({ data: null, error: { message: "falha comprovante" } }),
    );

    render(<EntregaComprovantePanel entrega={{ id: "e1" }} />, { wrapper });

    expect(await screen.findByTestId("comprovante-erro")).toBeInTheDocument();
    expect(screen.queryByText("Formulário gerado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir formulário/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar link de validação/ })).not.toBeInTheDocument();
  });

  it("entrega inexistente ou sem acesso não é tratada como pendente", async () => {
    fromMock.mockImplementation(() => chain({ data: null }));

    render(<EntregaComprovantePanel entrega={{ id: "e1", comprovante_status: "pendente" }} />, { wrapper });

    expect(await screen.findByTestId("comprovante-entrega-ausente")).toBeInTheDocument();
    expect(screen.queryByText("Pendente")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerar formulário/ })).not.toBeInTheDocument();
  });
});

describe("EmbalagensEntregaPanel", () => {
  it("erro na consulta não vira contagem zero", async () => {
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "falha" } }));

    render(<EmbalagensEntregaPanel entregaId="e1" />, { wrapper });

    expect(await screen.findByTestId("embalagens-erro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma embalagem/)).not.toBeInTheDocument();
  });

  it("vazio legítimo mostra zero e explica que a contagem é de embalagens rastreadas", async () => {
    fromMock.mockImplementation(() => chain({ data: [] }));

    render(<EmbalagensEntregaPanel entregaId="e1" compact />, { wrapper });

    expect(await screen.findByText(/Nenhuma embalagem rastreada/)).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText(/embalagens individuais rastreadas/)).toBeInTheDocument();
  });
});
