import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, navigateMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<any>("react-router-dom");
  return { ...real, useNavigate: () => navigateMock };
});

vi.mock("@/components/entregas/QRCodeComprovante", () => ({
  QRCodeComprovante: () => null,
  buildValidationUrl: () => "",
}));

import FormularioEntregaPrint from "@/pages/entregas/FormularioEntregaPrint";

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

const ID = "20d66f88-b3dd-4a6f-93ac-6ecf03c7468d";

function renderPrint(rota = `/entregas/${ID}/formulario`) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Routes>
          <Route path="/entregas/:id/formulario" element={<FormularioEntregaPrint />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ENTREGA_OK = {
  id: ID,
  tipo_entrega: "retirada",
  data_saida: "2026-09-12",
  motorista: "João",
  quantidade_entregue: 10,
  volume_entregue_ml: 10000,
  clientes: { nome: "Fazenda X", cpf_cnpj: "00.000.000/0001-00", endereco_municipio: "Uberaba", endereco_estado: "MG" },
  produtos: { nome: "Bio A" },
  lotes: { codigo_lote: "L-1", data_producao: "2026-01-05" },
  ordens_servico: { id: "os1", numero_os: "OS-2026-0007", fazendas: { nome: "Sede", municipio: "Uberaba", estado: "MG" } },
};

beforeEach(() => vi.clearAllMocks());

describe("FormularioEntregaPrint", () => {
  it("renderiza o documento com colunas reais do banco", async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === "entregas") return chain({ data: ENTREGA_OK });
      if (tabela === "entrega_comprovantes")
        return chain({ data: { numero_formulario: "AR-ENT-000004", gerado_em: "2026-09-13T10:00:00Z" } });
      return chain({ data: [] });
    });

    renderPrint();

    expect(await screen.findByText("AR-ENT-000004")).toBeInTheDocument();
    expect(screen.getByText("OS-2026-0007")).toBeInTheDocument();
    expect(screen.getByText("Retirada")).toBeInTheDocument();
    expect(screen.getByText("Retirado por:")).toBeInTheDocument();
    // date-only sem desvio de fuso
    expect(screen.getAllByText(/12\/09\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText("05/01/2026")).toBeInTheDocument();
    // validade sem fonte comprovada não é inventada
    expect(screen.getByText("Não informada")).toBeInTheDocument();
  });

  it("erro em qualquer consulta bloqueia a impressão e oferece nova tentativa", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "estoque_embalagens"
        ? chain({ data: null, error: { message: "column does not exist" } })
        : chain({ data: ENTREGA_OK }),
    );

    renderPrint();

    expect(await screen.findByTestId("formulario-erro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/column does not exist/)).not.toBeInTheDocument();
  });

  it("entrega inexistente e formulário não gerado são estados distintos", async () => {
    fromMock.mockImplementation((tabela: string) =>
      tabela === "estoque_embalagens" ? chain({ data: [] }) : chain({ data: null }),
    );
    renderPrint();
    expect(await screen.findByTestId("formulario-entrega-ausente")).toBeInTheDocument();

    fromMock.mockImplementation((tabela: string) => {
      if (tabela === "entregas") return chain({ data: ENTREGA_OK });
      if (tabela === "entrega_comprovantes") return chain({ data: null });
      return chain({ data: [] });
    });
    renderPrint();
    expect(await screen.findByTestId("formulario-nao-gerado")).toBeInTheDocument();
  });

  it("vias aceita somente 1 ou 2 inteiros", async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === "entregas") return chain({ data: ENTREGA_OK });
      if (tabela === "entrega_comprovantes") return chain({ data: { numero_formulario: "AR-ENT-000004", gerado_em: "2026-09-13T10:00:00Z" } });
      return chain({ data: [] });
    });

    renderPrint(`/entregas/${ID}/formulario?vias=2.9`);
    expect(await screen.findByText("1 via")).toBeInTheDocument();
    expect(screen.queryByText(/2ª Via/)).not.toBeInTheDocument();
  });

  it("Voltar leva para /entregas mesmo aberto em nova aba", async () => {
    fromMock.mockImplementation((tabela: string) => {
      if (tabela === "entregas") return chain({ data: ENTREGA_OK });
      if (tabela === "entrega_comprovantes") return chain({ data: { numero_formulario: "AR-ENT-000004", gerado_em: "2026-09-13T10:00:00Z" } });
      return chain({ data: [] });
    });

    renderPrint();
    (await screen.findByRole("button", { name: /Voltar/ })).click();
    expect(navigateMock).toHaveBeenCalledWith("/entregas");
  });
});
