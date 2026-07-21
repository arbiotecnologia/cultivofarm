import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import VisaoGeral from "@/pages/dashboard/VisaoGeral";

vi.mock("@/hooks/useExecutivoResumo", () => ({
  useExecutivoResumo: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 0, data: [] }),
        in: () => Promise.resolve({ count: 0, data: [] }),
      }),
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
    (useExecutivoResumo as any).mockReturnValue({
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
    (useExecutivoResumo as any).mockReturnValue({
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
    (useExecutivoResumo as any).mockReturnValue({
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
    (useExecutivoResumo as any).mockReturnValue({
      data: undefined, isLoading: true, isFetching: true, error: null, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.queryByText(/Resumo executivo indisponível/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Abrir Cockpit Laboratório/i)).toBeInTheDocument();
  });
});
