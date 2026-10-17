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
    { id: "base", name_snapshot: "Plano Base", version_number: 1, billing_cycle: "MONTHLY", status: mocks.versaoStatus, effective_from: mocks.versaoFrom, effective_to: mocks.versaoTo },
  ] }),
  useAssinaturasSaaS: () => ({ isSuccess: true, data: [
    { id: "sub1", organization_id: "org", status: mocks.status, plan_version_id: "base", trial_ends_at: mocks.trialEndsAt, cancel_at: mocks.cancelAt, price_snapshot: 499.9, currency_snapshot: mocks.moeda, billing_cycle_snapshot: mocks.ciclo, started_at: "2026-09-01", created_at: "2026-09-01" },
    ...mocks.extras,
  ], refetch: vi.fn().mockResolvedValue({}) }),
  useHistoricoAssinaturasSaaS: () => ({ isSuccess: true, data: mocks.historico, refetch: vi.fn().mockResolvedValue({}) }),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = "TRIAL"; mocks.trialEndsAt = passado;
    mocks.cancelAt = null; mocks.moeda = "BRL"; mocks.ciclo = "monthly";
    mocks.versaoStatus = "PUBLISHED"; mocks.versaoFrom = "2026-01-01"; mocks.versaoTo = null;
    mocks.historico = []; mocks.extras = [];
  });

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
    mocks.historico = [{ subscription_id: "sub1", organization_id: "org", action: "expire_trial", previous_status: "TRIAL", new_status: "EXPIRED" }];
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    const combo = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    expect([...combo.options].map((o) => o.value)).toEqual(["activate_subscription"]);
  });

  it("EXPIRED sem origem TRIAL→EXPIRED no histórico não é selecionada", () => {
    mocks.status = "EXPIRED"; // histórico vazio: origem não comprovada
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByText(/Empresa sem assinatura/)).toBeInTheDocument();
  });

  it("CANCELLED mais nova nunca é pulada para ressuscitar EXPIRED antiga", () => {
    mocks.status = "EXPIRED";
    mocks.historico = [{ subscription_id: "sub1", organization_id: "org", action: "expire_trial", previous_status: "TRIAL", new_status: "EXPIRED" }];
    mocks.extras = [{ id: "sub2", organization_id: "org", status: "CANCELLED", plan_version_id: "base", trial_ends_at: null, cancel_at: null, price_snapshot: 499.9, currency_snapshot: "BRL", billing_cycle_snapshot: "monthly", started_at: "2026-10-01", created_at: "2026-10-01" }];
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByText(/Empresa sem assinatura/)).toBeInTheDocument();
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
    expect(screen.getByText(/R\$\s*499,90/)).toBeInTheDocument();
    expect(screen.getByText(/ciclo mensal/)).toBeInTheDocument();
    expect(screen.queryByText(/ciclo MONTHLY/)).not.toBeInTheDocument();
  });

  it("ciclo anual usa 'annual' e ciclo personalizado é legível", () => {
    mocks.ciclo = "annual";
    const { unmount } = render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription");
    expect(screen.getByText(/ciclo anual/)).toBeInTheDocument();
    unmount();
    mocks.ciclo = "custom";
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription");
    expect(screen.getByText(/ciclo personalizado/)).toBeInTheDocument();
  });

  it("moeda do snapshot é formatada via Intl (USD não vira R$)", () => {
    mocks.moeda = "USD";
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription");
    expect(screen.getByText(/US\$\s*499,90/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*499,90/)).not.toBeInTheDocument();
  });

  it("cancelamento agendado bloqueia a regularização com mensagem amigável", () => {
    mocks.cancelAt = futuro;
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription"); motivo();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    expect(screen.getByRole("alert")).toHaveTextContent(/cancelamento agendado/i);
    expect(screen.getByRole("button", { name: "Regularizar assinatura" })).toBeDisabled();
  });

  it("versão atual fora de vigência bloqueia a regularização com orientação", () => {
    mocks.versaoTo = "2026-06-01"; // vigência encerrada
    render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription"); motivo();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    expect(screen.getByRole("alert")).toHaveTextContent(/não está publicada e vigente/i);
    expect(screen.getByRole("button", { name: "Regularizar assinatura" })).toBeDisabled();
  });

  it("confirmação reseta quando moeda ou cancelamento agendado mudam", () => {
    const { rerender } = render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription"); motivo();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    expect(screen.getByRole("button", { name: "Regularizar assinatura" })).toBeEnabled();
    mocks.moeda = "USD";
    rerender(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByLabelText("Confirmar regularização")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    mocks.cancelAt = futuro;
    rerender(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByLabelText("Confirmar regularização")).not.toBeChecked();
  });

  it("confirmação reseta quando o estado lido da assinatura muda", () => {
    const { rerender } = render(<AlterarAssinaturaCard organizationIdInicial="org" />);
    action("activate_subscription"); motivo();
    fireEvent.click(screen.getByLabelText("Confirmar regularização"));
    expect(screen.getByRole("button", { name: "Regularizar assinatura" })).toBeEnabled();
    mocks.status = "EXPIRED"; // estado lido mudou
    mocks.historico = [{ subscription_id: "sub1", organization_id: "org", action: "expire_trial", previous_status: "TRIAL", new_status: "EXPIRED" }];
    rerender(<AlterarAssinaturaCard organizationIdInicial="org" />);
    expect(screen.getByLabelText("Confirmar regularização")).not.toBeChecked();
  });
});
