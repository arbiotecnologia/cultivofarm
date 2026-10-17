import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const passado = "2020-01-01";
const futuro = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(), toast: vi.fn(),
  status: "TRIAL" as string, trialEndsAt: "2020-01-01" as string | null,
  cancelAt: null as string | null, moeda: "BRL" as string, ciclo: "monthly" as string,
  versaoStatus: "PUBLISHED" as string, versaoFrom: "2026-01-01" as string | null, versaoTo: null as string | null,
  historico: [] as Array<Record<string, unknown>>,
  extras: [] as Array<Record<string, unknown>>,
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toast, error: vi.fn() } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: { children: ReactNode; value: string; onValueChange: (s: string) => void; disabled?: boolean }) => <select value={value} onChange={(e) => onValueChange(e.target.value)} disabled={disabled}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
vi.mock("@/hooks/usePlataformaSaaS", () => ({
  useOrganizacoesSaaS: () => ({ data: [{ id: "org", nome: "AR Bio fictícia" }] }),
  useVersoesPlanosSaaS: () => ({ isSuccess: true, data: [
    { id: "base", name_snapshot: "Plano Base", version_number: 1, billing_cycle: "MONTHLY", status: "PUBLISHED", effective_from: "2026-01-01" },
  ] }),
  useAssinaturasSaaS: () => ({ isSuccess: true, data: [{ id: "sub1", organization_id: "org", status: mocks.status, plan_version_id: "base", trial_ends_at: mocks.trialEndsAt, price_snapshot: 499.9, currency_snapshot: "BRL", billing_cycle_snapshot: "monthly" }], refetch: vi.fn().mockResolvedValue({}) }),
  useHistoricoAssinaturasSaaS: () => ({ isSuccess: true, data: [], refetch: vi.fn().mockResolvedValue({}) }),
  useAlterarAssinatura: () => ({ mutate: mocks.mutate, isPending: false }),
  mensagemErroAssinatura: () => "Erro seguro", useCriarExcecao: vi.fn(), useEncerrarExcecao: vi.fn(), useExcecoesSaaS: vi.fn(), useModulosFeaturesSaaS: vi.fn(),
}));

import { AlterarAssinaturaCard } from "@/pages/plataforma/PlataformaGestao";
import { acoesAssinatura } from "@/lib/saas/subscriptionTransition";

const action = (s: string) => fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: s } });
const motivo = () => fireEvent.change(screen.getByLabelText("Motivo da alteração *"), { target: { value: "Regularização autorizada" } });

describe("acoesAssinatura — regularização", () => {
  it("TRIAL vigente e vencido incluem activate_subscription", () => {
    expect(acoesAssinatura("TRIAL", futuro)).toContain("activate_subscription");
    expect(acoesAssinatura("TRIAL", passado)).toContain("activate_subscription");
    expect(acoesAssinatura("TRIAL", passado)).toContain("expire_trial");
  });
  it("EXPIRED só permite activate_subscription", () => {
    expect(acoesAssinatura("EXPIRED", null)).toEqual(["activate_subscription"]);
  });
  it("demais situações não incluem regularização", () => {
    for (const st of ["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const) {
      expect(acoesAssinatura(st, null)).not.toContain("activate_subscription");
    }
  });
});

describe("AlterarAssinaturaCard — regularização", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.status = "TRIAL"; mocks.trialEndsAt = passado; });

  it("mostra 'Teste vencido' (não 'Em teste') e exige confirmação explícita antes de habilitar", () => {
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByText(/Teste vencido/)).toBeInTheDocument();
    action("activate_subscription");
    expect(screen.getByText(/não registra pagamento nem quita cobrança/i)).toBeInTheDocument();
    expect(screen.getByText(/não implanta cobrança ou expiração automática/i)).toBeInTheDocument();
    motivo();
    expect(screen.getByRole("button", { name: "Regularizar assinatura" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    expect(screen.getByRole("button", { name: "Regularizar assinatura" })).toBeEnabled();
  });

  it("envia ação activate_subscription com motivo e sem versão", () => {
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription"); motivo();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    fireEvent.click(screen.getByRole("button", { name: "Regularizar assinatura" }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ action: "activate_subscription", reason: "Regularização autorizada", planVersionId: null });
  });

  it("EXPIRED decorrente de trial aparece na busca e só oferece regularização", () => {
    mocks.status = "EXPIRED";
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    const combo = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    expect([...combo.options].map((o) => o.value)).toEqual(["activate_subscription"]);
  });

  it("TRIAL vigente mostra 'Em teste' e não 'Teste vencido'", () => {
    mocks.trialEndsAt = futuro;
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByText(/Em teste/)).toBeInTheDocument();
    expect(screen.queryByText(/Teste vencido/)).not.toBeInTheDocument();
  });

  it("resumo exibe snapshots preservados da assinatura (preço/moeda/ciclo legível), não o ciclo da versão", () => {
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription");
    // assinatura mockada: price 499.9 BRL, ciclo snapshot 'monthly'; versão tem billing_cycle 'MONTHLY'
    expect(screen.getByText(/R\$ 499,90 BRL/)).toBeInTheDocument();
    expect(screen.getByText(/ciclo mensal/)).toBeInTheDocument();
    expect(screen.queryByText(/ciclo MONTHLY/)).not.toBeInTheDocument();
  });

  it("confirmação reseta quando o estado lido da assinatura muda", () => {
    const { rerender } = render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription"); motivo();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    expect(screen.getByRole("button", { name: "Regularizar assinatura" })).toBeEnabled();
    mocks.status = "EXPIRED"; // estado lido mudou
    rerender(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByLabelText("Confirmar regularização")).not.toBeChecked();
  });
});
