import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { DashboardAgronomico } from "@/components/bi/DashboardAgronomico";
import { PrevisaoInteligente } from "@/components/previsao/PrevisaoInteligente";
import { MonitoramentoProblemas } from "@/components/bi/MonitoramentoProblemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock Recharts to avoid layout issues in JSDOM
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => <div>Pie</div>,
  Cell: () => <div>Cell</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div>Bar</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div>Line</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>CartesianGrid</div>,
}));

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = createQueryClient();
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

describe("Data Migration Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DashboardAgronomico should load data from registros_consultor", async () => {
    const mockRegistros = [
      {
        id: "1",
        categoria_problema: "insetos_praga",
        tipo_demanda: "praga",
        cultura_id: "c1",
        nivel_pressao: "alto",
        created_at: new Date().toISOString(),
        culturas: { nome: "Soja" }
      }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      const queryBuilder: any = {
        select: vi.fn().mockImplementation(() => queryBuilder),
        eq: vi.fn().mockImplementation(() => queryBuilder),
        gte: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        then: vi.fn().mockImplementation((onFulfilled: any) => {
          let data: any = [];
          if (table === "fazendas") data = [{ id: "f1" }];
          if (table === "talhoes") data = [{ id: "t1", area_hectares: 100, tipo_manejo_agua: "irrigado" }];
          if (table === "registros_consultor") data = mockRegistros;
          if (table === "registros_consultor_recomendacoes") data = [];
          if (table === "aplicacoes") data = [];
          
          return Promise.resolve(onFulfilled({ data, error: null }));
        }),
      };
      return queryBuilder;
    });

    render(<DashboardAgronomico />, { wrapper });

    await waitFor(() => {
      const occurrencesElement = screen.getByText(/Ocorrências Registradas/i);
      expect(occurrencesElement).toBeInTheDocument();
      
      const parent = occurrencesElement.closest('div')?.parentElement;
      expect(parent).toHaveTextContent("1");
    }, { timeout: 3000 });
  });

  it("PrevisaoInteligente should load and display Select", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      const queryBuilder: any = {
        select: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        eq: vi.fn().mockImplementation(() => queryBuilder),
        then: vi.fn().mockImplementation((onFulfilled: any) => {
          let data: any = [];
          if (table === "fazendas") data = [{ id: "f1", nome: "Fazenda Teste" }];
          return Promise.resolve(onFulfilled({ data, error: null }));
        }),
      };
      return queryBuilder;
    });

    render(<PrevisaoInteligente />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Selecione a fazenda/i)).toBeInTheDocument();
    });
  });

  it("MonitoramentoProblemas should load data from registros_consultor", async () => {
    const mockRegistros = [
      {
        id: "1",
        categoria_problema: "doencas_fungicas",
        tipo_demanda: "doenca",
        nivel_pressao: "medio",
        created_at: new Date().toISOString(),
        culturas: { nome: "Milho" },
        talhoes: { nome: "Talhão A" }
      }
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      const queryBuilder: any = {
        select: vi.fn().mockImplementation(() => queryBuilder),
        order: vi.fn().mockImplementation(() => queryBuilder),
        then: vi.fn().mockImplementation((onFulfilled: any) => {
          let data: any = [];
          if (table === "registros_consultor") data = mockRegistros;
          return Promise.resolve(onFulfilled({ data, error: null }));
        }),
      };
      return queryBuilder;
    });

    render(<MonitoramentoProblemas />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Distribuição por Severidade/i)).toBeInTheDocument();
      expect(screen.getByText(/Tendência Mensal/i)).toBeInTheDocument();
    });
  });
});
