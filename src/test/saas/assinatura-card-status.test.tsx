import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), subscriptions: vi.fn(), history: vi.fn(), toast: vi.fn(), status: "SUSPENDED", version: "base" as string | null }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast, error: vi.fn() } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: { children: ReactNode; value: string; onValueChange: (s: string) => void; disabled?: boolean }) => <select aria-label={screen.queryAllByRole("combobox").length === 0 ? "Empresa" : undefined} value={value} onChange={(e) => onValueChange(e.target.value)} disabled={disabled}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
vi.mock("@/hooks/usePlataformaSaaS", () => ({
  useOrganizacoesSaaS: () => ({ data: [{ id: "org", nome: "Empresa fictícia" }] }),
  useVersoesPlanosSaaS: () => ({ isSuccess: true, data: [
    { id: "base", name_snapshot: "Plano Base", version_number: 1, status: "PUBLISHED", effective_from: "2026-01-01" },
    { id: "other", name_snapshot: "Outra versão fictícia", version_number: 2, status: "PUBLISHED", effective_from: "2026-01-01" },
  ] }),
  useAssinaturasSaaS: () => ({ isSuccess: true, data: [{ organization_id: "org", status: mocks.status, plan_version_id: mocks.version, trial_ends_at: "2020-01-01" }], refetch: mocks.subscriptions }),
  useHistoricoAssinaturasSaaS: () => ({ isSuccess: true, data: [], refetch: mocks.history }),
  useAlterarAssinatura: () => ({ mutate: mocks.mutate, isPending: false }),
  mensagemErroAssinatura: () => "Erro seguro", useCriarExcecao: vi.fn(), useEncerrarExcecao: vi.fn(), useExcecoesSaaS: vi.fn(), useModulosFeaturesSaaS: vi.fn(),
}));
import { AlterarAssinaturaCard } from "@/pages/plataforma/PlataformaGestao";
import { acoesAssinatura } from "@/lib/saas/subscriptionTransition";
const action = (s: string) => fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: s } });
const version = (s: string) => fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: s } });
beforeEach(() => {
  vi.clearAllMocks(); mocks.status = "SUSPENDED"; mocks.version = "base";
  mocks.subscriptions.mockResolvedValue({}); mocks.history.mockResolvedValue({});
});
describe("Gestão de assinatura: plano não reativa", () => {
  it("resumo Base v1 e Suspensa; mesma versão bloqueia sem RPC", () => {
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByText("Plano Base · v1 — Suspensa")).toBeInTheDocument();
    version("base"); fireEvent.change(screen.getByLabelText("Motivo da alteração *"), { target: { value: "Motivo válido" } });
    expect(screen.getByText("Este plano já está aplicado nesta empresa.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar ação" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar ação" })); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("alterar plano suspenso orienta reativação, não encadeia RPC e aguarda duas leituras", async () => {
    let done: (() => void) | undefined;
    mocks.subscriptions.mockImplementation(() => new Promise<void>((resolve) => { done = resolve; }));
    mocks.mutate.mockImplementation((_value, options) => options.onSuccess());
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    version("other"); fireEvent.change(screen.getByLabelText("Motivo da alteração *"), { target: { value: "Motivo válido" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar ação" }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ action: "change_plan", planVersionId: "other" });
    expect(mocks.toast.mock.calls[0][0]).toContain("continua suspensa");
    expect(screen.getByText("Atualizando assinatura e histórico…")).toBeInTheDocument();
    await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(1));
    await act(async () => { mocks.version = "other"; done?.(); });
    await waitFor(() => expect(screen.getByText("Outra versão fictícia · v2 — Suspensa")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Aplicar ação" })).toBeDisabled();
  });
  it("reativar não tem versão e envia somente ação explícita com motivo", () => {
    render(<AlterarAssinaturaCard organizationIdInicial="org" />); action("reactivate_manual");
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Aplicar ação" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo da alteração *"), { target: { value: "Reativação autorizada" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar ação" }));
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ action: "reactivate_manual", planVersionId: null });
  });
  it.each([
    ["SUSPENDED", ["reactivate_manual", "cancel", "change_plan"]],
    ["ACTIVE", ["change_plan", "mark_past_due", "suspend", "cancel"]],
    ["PAST_DUE", ["change_plan", "suspend", "cancel"]],
    ["TRIAL", ["change_plan", "cancel", "expire_trial"]],
    ["CANCELLED", []], ["EXPIRED", []],
  ])("matriz UX %s", (status, expected) => expect(acoesAssinatura(status, "2020-01-01")).toEqual(expected));
  it("não permite expirar teste vigente ou sem prazo", () => {
    expect(acoesAssinatura("TRIAL", "2099-01-01")).toEqual(["change_plan", "cancel"]);
    expect(acoesAssinatura("TRIAL", null)).toEqual(["change_plan", "cancel"]);
  });
  it("legada permite apenas regularizar plano", () => {
    mocks.version = null; render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.queryByRole("option", { name: "Reativar assinatura" })).not.toBeInTheDocument();
  });
  it("duplo clique antes do React Query atualizar não duplica RPC", () => {
    render(<AlterarAssinaturaCard organizationIdInicial="org" />); action("reactivate_manual");
    fireEvent.change(screen.getByLabelText("Motivo da alteração *"), { target: { value: "Motivo válido" } });
    const button = screen.getByRole("button", { name: "Aplicar ação" });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
  it("falha na releitura libera pendência e oferece consulta sem escrita", async () => {
    mocks.subscriptions.mockRejectedValue(new Error("network"));
    mocks.mutate.mockImplementation((_value, options) => options.onSuccess());
    render(<AlterarAssinaturaCard organizationIdInicial="org" />); action("reactivate_manual");
    fireEvent.change(screen.getByLabelText("Motivo da alteração *"), { target: { value: "Motivo válido" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar ação" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar consulta" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Atualizar consulta" }));
    await waitFor(() => expect(mocks.subscriptions).toHaveBeenCalledTimes(2));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
});