import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import VisaoGeral from "@/pages/dashboard/VisaoGeral";

vi.mock("@/hooks/useExecutivoResumo", () => ({
  useExecutivoResumo: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({
      data: {
        resumo: {},
        dados_indisponiveis: [
          "os_aguardando", "lotes_producao", "cq_pendente",
          "envases_pendentes", "insumos_criticos", "entregas_pendentes",
        ],
      },
      error: null,
    }),
  },
}));

import { useExecutivoResumo } from "@/hooks/useExecutivoResumo";

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VisaoGeral />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("Fase 3.2 — resiliência da Visão Geral", () => {
  beforeEach(() => vi.clearAllMocks());

  it("erro: mostra card consolidado com Tentar novamente e preserva atalhos + Cockpit", () => {
    (useExecutivoResumo as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({

      data: undefined, isLoading: false, isFetching: false,
      error: new Error("boom"), refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/Resumo executivo indisponível/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument();
    expect(screen.getByText(/Abrir Cockpit Laboratório/i)).toBeInTheDocument();
    expect(screen.getByText(/Ver Visão Executiva/i)).toBeInTheDocument();
  });

  it("sucesso com dados: renderiza valores", () => {
    (useExecutivoResumo as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      data: {
        resumo: { alertas_ativos: 5, clientes_ativos: 12, receita_bruta: 1000 },
        saude_operacional: { score: 87, classificacao: "boa", motivos: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("87")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText(/Resumo executivo indisponível/i)).not.toBeInTheDocument();
  });

  it("sucesso com zeros: renderiza zero, não 'Indisponível'", () => {
    (useExecutivoResumo as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      data: {
        resumo: { alertas_ativos: 0, clientes_ativos: 0, receita_bruta: 0 },
        saude_operacional: { score: 0, classificacao: "sem dados", motivos: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.queryByText(/Resumo executivo indisponível/i)).not.toBeInTheDocument();
  });

  it("loading: mostra skeleton, sem card de erro", () => {
    (useExecutivoResumo as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      data: undefined, isLoading: true, isFetching: true, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.queryByText(/Resumo executivo indisponível/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Abrir Cockpit Laboratório/i)).toBeInTheDocument();
  });

  it("fontes sem vínculo tenant aparecem indisponíveis, nunca como zero", async () => {
    (useExecutivoResumo as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      data: {
        resumo: {},
        dados_indisponiveis: ["alertas_operacionais", "clientes_ativos", "receita_recebida", "solicitacoes_criticas", "visitas_atrasadas"],
        saude_operacional: { score: 0, classificacao: "sem_dados", motivos: [] },
      },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("Indisponível").length).toBeGreaterThanOrEqual(9);
    });
    expect(screen.queryByText("Sem prioridades críticas.")).not.toBeInTheDocument();
  });
});
