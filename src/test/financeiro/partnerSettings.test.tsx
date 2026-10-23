import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activePaymentMethodValid, canConfigurePartnerSettings, emptyPartnerSettings, samePartnerSettings } from "@/lib/financeiro/partnerSettings";

const state = vi.hoisted(() => ({
  roles: ["administrador"], settings: null as any, fetching: false, error: false,
  save: vi.fn(),
  methods: [{ id: "3b73824e-f205-47b9-a499-06f02091b247", name: "AUDIT-AR-20260922 - Sem transferencia", active: true }],
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ roles: state.roles, role: state.roles[0] }) }));
vi.mock("@/hooks/useStorageAccessScope", () => ({ useStorageAccessScope: () => ({ ready: true, scope: "A", capture: () => () => true }) }));
vi.mock("@/hooks/useB2BFinanceiro", () => ({
  usePartnerFinancialSettings: () => ({ data: state.error ? undefined : state.settings, isSuccess: !state.error, isError: state.error, isFetching: state.fetching }),
  useFinancialSettingsMethods: () => ({ data: state.methods, isSuccess: true, isFetching: false, isError: false }),
  useUpdatePartnerFinancialSettings: () => ({ isPending: false, mutateAsync: state.save }),
  useFinancialSettingsPartners: () => ({ data: [{ id: "P", razao_social: "Parceiro sem pedidos", nome_fantasia: null }], isFetching: false }),
  useB2BReceivables: () => ({ data: [], isLoading: false }),
  useGenerateB2BReceivable: () => ({}), useCancelB2BReceivable: () => ({}),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => <select value={value} onChange={e => onValueChange(e.target.value)} disabled={disabled}><option value="" />{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value, disabled }: any) => <option value={value} disabled={disabled}>{children}</option>,
}));
vi.mock("react-router-dom", () => ({ Link: ({ children }: any) => <a>{children}</a> }));
import FinanceiroB2B, { PartnerFinancialSettingsDialog } from "@/pages/financeiro/FinanceiroB2B";
const partner = { partner_id: "P", partner_name: "Teste" };
const method = "AUDIT-AR-20260922 - Sem transferencia";
const row = () => ({ ...emptyPartnerSettings("P"), id: "S", updated_at: "2026-10-23T20:00:00Z", default_payment_method: method });
beforeEach(() => { state.roles = ["administrador"]; state.settings = row(); state.fetching = false; state.error = false; state.save.mockReset().mockResolvedValue({}); });
describe("configuração financeira canônica — UI sintética, sem escrita hosted", () => {
  it("permite abrir o mesmo diálogo antes do primeiro pedido", async () => {
    render(<FinanceiroB2B />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "P" } });
    fireEvent.click(screen.getByRole("button", { name: "Configurar parceiro" }));
    expect(await screen.findByRole("button", { name: "Salvar" })).toBeEnabled();
  });
  it("nega configurações ao técnico singleton e ao parceiro cumulativo", () => {
    state.roles = ["parceiro_b2b", "parceiro_b2b_tecnico"];
    render(<FinanceiroB2B />);
    expect(screen.queryByRole("button", { name: "Configurar parceiro" })).toBeNull();
  });
  it("preserva método legado inválido sem default silencioso", async () => {
    state.settings = { ...row(), default_payment_method: "pix" };
    render(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled());
    expect(screen.getAllByRole("combobox")[1]).toHaveValue("pix");
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: method } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][0].draft.default_payment_method).toBe(method);
    expect(state.save.mock.calls[0][0].draft.billing_trigger).toBe("na_entrega");
    expect(state.save.mock.calls[0][0].baseline.default_payment_method).toBe("pix");
  });
  it("não reseta edição por refetch igual e salva com baseline original", async () => {
    const view = render(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Prazo (dias)"), { target: { value: "12" } });
    state.settings = { ...row() }; view.rerender(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Prazo (dias)")).toHaveValue(12);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][0].baseline.payment_terms_days).toBe(7);
  });
  it("bloqueia CAS alterado e preserva rascunho", async () => {
    const view = render(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Prazo (dias)"), { target: { value: "12" } });
    state.settings = { ...row(), payment_terms_days: 9 }; view.rerender(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Prazo (dias)")).toHaveValue(12);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("deduplica cliques pendentes e bloqueia reenvio incerto", async () => {
    let reject: (e: Error) => void = () => {};
    state.save.mockImplementation(() => new Promise((_resolve, r) => { reject = r; }));
    render(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    const save = await screen.findByRole("button", { name: "Salvar" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save); fireEvent.click(save);
    expect(state.save).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("network_uncertain")));
    expect(save).toBeDisabled();
  });
  it("bloqueia salvamento durante refetch ou negação", async () => {
    const view = render(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled());
    state.fetching = true; view.rerender(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    state.fetching = false; state.error = true; view.rerender(<PartnerFinancialSettingsDialog open partner={partner} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});
describe("regras de configuração", () => {
  it("não inventa pix para configuração ausente", () => expect(emptyPartnerSettings("P").default_payment_method).toBeNull());
  it("exige método ativo único sem fallback arbitrário", () => {
    expect(activePaymentMethodValid(method, state.methods)).toBe(true);
    expect(activePaymentMethodValid("pix", state.methods)).toBe(false);
    expect(activePaymentMethodValid(method, [...state.methods, ...state.methods])).toBe(false);
    expect(activePaymentMethodValid(method, [{ name: method, active: false }])).toBe(false);
  });
  it("detecta mudança mesmo sem updated_at avançado", () => expect(samePartnerSettings(row(), { ...row(), billing_trigger: "manual" })).toBe(false));
  it("não concede capacidades internas por acumular papel externo", () => {
    expect(canConfigurePartnerSettings(["administrador"])).toBe(true);
    expect(canConfigurePartnerSettings(["financeiro", "parceiro_b2b_tecnico"])).toBe(false);
  });
});