import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alerts: vi.fn(), rpc: vi.fn(), invalidate: vi.fn(),
  success: vi.fn(), info: vi.fn(), error: vi.fn(),
}));
vi.mock("@/hooks/useCommercial", () => ({ useCommercialAlerts: mocks.alerts }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, info: mocks.info, error: mocks.error } }));
vi.mock("@/hooks/usePartnerPrices", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/usePartnerPrices")>();
  return { ...original, usePartnerPrices: () => ({ data: [], isLoading: false }), useSavePartnerPrices: () => ({ mutate: vi.fn(), isPending: false }) };
});
import AlertasComerciais from "@/pages/comercial/AlertasComerciais";
import { ParceiroPrecosTab } from "@/components/comercial/ParceiroPrecosTab";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.alerts.mockReturnValue({ data: { campanhas_vencendo: [] }, isLoading: false, isError: false });
  mocks.rpc.mockResolvedValue({ data: 0, error: null });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("alertas: indisponibilidade não é ausência de campanhas", () => {
  it("nega lista de campanhas indisponíveis mesmo com payload residual e preserva demais alertas", () => {
    mocks.alerts.mockReturnValue({ data: { campanhas_disponiveis: false, campanhas_motivo: "campaign_owner_unverified", campanhas_vencendo: [{ id: "residual", nome: "Campanha residual" }], pedidos_aguardando_aprovacao: 7 }, isLoading: false });
    render(<AlertasComerciais />);
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.queryByText("Campanha residual")).not.toBeInTheDocument();
    expect(screen.getByText("7")).toBeVisible();
  });
  it("falha de consulta não apresenta contagens zeradas ou campanhas vazias", () => {
    mocks.alerts.mockReturnValue({ data: { pedidos_aguardando_aprovacao: 7 }, isError: true, isLoading: false });
    render(<AlertasComerciais />);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });
  it("preserva campanhas disponíveis e distingue loading", () => {
    mocks.alerts.mockReturnValue({ data: { campanhas_disponiveis: true, campanhas_vencendo: [{ id: "own", nome: "Campanha própria", data_fim: "2026-10-20" }] }, isLoading: false });
    const view = render(<AlertasComerciais />);
    expect(screen.getByText("Campanha própria")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    mocks.alerts.mockReturnValue({ isLoading: true });
    view.rerender(<AlertasComerciais />);
    expect(screen.queryByText("Campanha própria")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("resultado real da geração de tabela", () => {
  it.each([0, null])("resultado %s não anuncia geração bem-sucedida", async (count) => {
    mocks.rpc.mockResolvedValue({ data: count, error: null });
    render(<ParceiroPrecosTab partnerId="own" defaultDiscount={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar tabela inicial" }));
    await waitFor(() => expect(mocks.info).toHaveBeenCalledTimes(1));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("partner_apply_default_discount", { p_partner_id: "own" });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["partner-prices", "own"] });
    expect(screen.getByRole("button", { name: "Gerar tabela inicial" })).toBeEnabled();
  });
  it("resultado positivo mantém sucesso e atualização", async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    render(<ParceiroPrecosTab partnerId="own" defaultDiscount={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar tabela inicial" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  });
  it("erro da RPC nunca gera sucesso e libera botão", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "partner_not_found" } });
    render(<ParceiroPrecosTab partnerId="own" defaultDiscount={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar tabela inicial" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Gerar tabela inicial" })).toBeEnabled();
  });
  it("cancelamento não chama RPC; normalizar continua ação distinta", async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    render(<ParceiroPrecosTab partnerId="own" defaultDiscount={10} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar tabela inicial" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Normalizar todos ao padrão" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith("partner_reset_prices_to_default", { p_partner_id: "own" });
    expect(within(screen.getByRole("button", { name: "Gerar tabela inicial" })).queryByText("Gerando...")).not.toBeInTheDocument();
  });
});