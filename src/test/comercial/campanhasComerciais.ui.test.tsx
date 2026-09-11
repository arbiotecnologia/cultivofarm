import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/renderWithProviders";

const saveMutateAsync = vi.fn();
const delMutate = vi.fn();
const setPartnersMutateAsync = vi.fn().mockResolvedValue(null);
const setClientesMutateAsync = vi.fn().mockResolvedValue(null);

const campanhas = [
  {
    id: "c1",
    nome: "Campanha Safra",
    tipo_publico: "b2b",
    data_inicio: "2026-01-01",
    data_fim: "2026-02-01",
    ativa: true,
    descricao: "",
  },
];

const EMPTY: string[] = [];

vi.mock("@/hooks/useCommercial", () => ({
  useCommercialCampaigns: () => ({ data: campanhas, isLoading: false }),
  useSaveCampaign: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  useDeleteCampaign: () => ({ mutate: delMutate, isPending: false }),
  useCampaignPartners: () => ({ data: EMPTY }),
  useCampaignClientes: () => ({ data: EMPTY }),
  useSetCampaignPartners: () => ({ mutateAsync: setPartnersMutateAsync, isPending: false }),
  useSetCampaignClientes: () => ({ mutateAsync: setClientesMutateAsync, isPending: false }),
}));

const PARCEIROS = { items: [] as any[] };

vi.mock("@/hooks/useParceirosB2B", () => ({
  useParceirosB2B: () => ({ data: PARCEIROS }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
  },
}));

import CampanhasComerciais from "@/pages/comercial/CampanhasComerciais";

function abrirNovaCampanha() {
  fireEvent.click(screen.getByRole("button", { name: /nova campanha/i }));
}

function preencher({ nome, inicio, fim }: { nome?: string; inicio?: string; fim?: string }) {
  if (nome !== undefined) fireEvent.change(screen.getByLabelText("Nome"), { target: { value: nome } });
  if (inicio !== undefined) fireEvent.change(screen.getByLabelText("Início"), { target: { value: inicio } });
  if (fim !== undefined) fireEvent.change(screen.getByLabelText("Fim"), { target: { value: fim } });
}

describe("CampanhasComerciais — camada de interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMutateAsync.mockResolvedValue({ id: "c1" });
  });

  it("mantém Salvar desabilitado com campos obrigatórios vazios", () => {
    renderWithProviders(<CampanhasComerciais />);
    abrirNovaCampanha();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(saveMutateAsync).not.toHaveBeenCalled();
  });

  it("trata nome só com espaços como inválido", () => {
    renderWithProviders(<CampanhasComerciais />);
    abrirNovaCampanha();
    preencher({ nome: "   ", inicio: "2026-01-01", fim: "2026-02-01" });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("bloqueia período invertido", () => {
    renderWithProviders(<CampanhasComerciais />);
    abrirNovaCampanha();
    preencher({ nome: "Campanha X", inicio: "2026-03-10", fim: "2026-03-01" });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("salva com período válido e nome normalizado", async () => {
    renderWithProviders(<CampanhasComerciais />);
    abrirNovaCampanha();
    preencher({ nome: "  Campanha X  ", inicio: "2026-03-01", fim: "2026-03-10" });
    const salvar = screen.getByRole("button", { name: "Salvar" });
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar);
    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));
    expect(saveMutateAsync.mock.calls[0][0]).toMatchObject({
      nome: "Campanha X",
      data_inicio: "2026-03-01",
      data_fim: "2026-03-10",
    });
  });

  it("expõe DialogDescription e labels associados", () => {
    renderWithProviders(<CampanhasComerciais />);
    abrirNovaCampanha();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(screen.getByText(/data de fim deve ser igual ou posterior/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByLabelText("Descrição")).toBeInTheDocument();
    expect(screen.getByLabelText("Início")).toBeInTheDocument();
    expect(screen.getByLabelText("Fim")).toBeInTheDocument();
  });

  it("não fecha o diálogo quando a mutation falha", async () => {
    saveMutateAsync.mockRejectedValueOnce(new Error("período inválido"));
    renderWithProviders(<CampanhasComerciais />);
    abrirNovaCampanha();
    preencher({ nome: "Campanha X", inicio: "2026-03-01", fim: "2026-03-10" });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/período inválido/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dá nome acessível ao botão de exclusão e pede confirmação", async () => {
    renderWithProviders(<CampanhasComerciais />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir campanha Campanha Safra" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Campanha Safra")).toBeInTheDocument();
    expect(delMutate).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(delMutate).toHaveBeenCalledWith("c1"));
  });

  it("cancela a exclusão sem chamar a mutation", async () => {
    renderWithProviders(<CampanhasComerciais />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir campanha Campanha Safra" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(delMutate).not.toHaveBeenCalled();
  });
});
