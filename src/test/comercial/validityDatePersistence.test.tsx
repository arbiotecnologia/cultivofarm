import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanAssignment } from "@/hooks/useCommercialConditions";
import { isValidCivilDate } from "@/lib/civil-date-input";

const saveMutate = vi.hoisted(() => vi.fn());
const createMutate = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ assignments: [] as PlanAssignment[] }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin" }, profile: { organization_id: "org" }, roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true, revalidateAuthz: vi.fn() }),
}));
vi.mock("@/hooks/useCommercialConditions", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useCommercialConditions")>()),
  usePlanAssignments: () => ({ data: state.assignments, isLoading: false, isError: false, error: null }),
  useSaveAssignment: () => ({ mutate: saveMutate, isPending: false }),
  useSubmitAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  usePublishAssignment: () => ({ mutate: vi.fn(), isPending: false, ready: true, scope: "s", capture: () => () => true }),
}));
vi.mock("@/hooks/useCommercialPaymentPlansAdmin", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useCommercialPaymentPlansAdmin")>()),
  useAllCommercialPaymentPlans: () => ({ data: [{ id: "plan-test", code: "TESTE-REJEICAO-20261111", name: "Fictício" }] }),
  useAdminCommercialPlans: () => ({ data: { rows: [], total: 0 }, isLoading: false, isError: false, error: null }),
  useCreateCommercialPlan: () => ({ mutate: createMutate, isPending: false }),
  useVersionCommercialPlan: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePlanMetadata: () => ({ mutate: vi.fn(), isPending: false }),
  useSetPlanActive: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDefaultPlan: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useCommercialPriceRules", () => ({
  usePriceRuleLookups: () => ({ data: { partners: [{ id: "partner-test", nome_fantasia: "Parceiro fictício", razao_social: "F" }] } }),
}));
vi.mock("@/components/comercial/MatrizPrecosTab", () => ({ MatrizPrecosTab: () => null }));
vi.mock("@/components/comercial/MatrizConfiguravelTab", () => ({ MatrizConfiguravelTab: () => null }));
vi.mock("@/components/comercial/MeiosPagamentoTab", () => ({ MeiosPagamentoTab: () => null }));

import { AtribuicoesPlanosTab } from "@/components/comercial/AtribuicoesPlanosTab";
import CommercialPaymentPlansPage from "@/pages/comercial/CommercialPaymentPlansPage";

const wrap = (n: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient()}><MemoryRouter>{n}</MemoryRouter></QueryClientProvider>
);
/** Simula autofill/automação: altera o DOM sem evento React e sem blur. */
function setDomOnly(el: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
}
const draft: PlanAssignment = {
  id: "assign-draft", plan_id: "plan-test", buyer_scope: "partner", partner_id: "partner-test", customer_id: null,
  status: "draft", valid_from: "2026-11-11", valid_until: null, motivo: "TESTE-REJEICAO-20261111",
  published_at: null, created_at: "2026-11-11T00:00:00Z",
};

beforeEach(() => { vi.clearAllMocks(); state.assignments = [{ ...draft }]; });

describe("Vigência final da atribuição", () => {
  it("envia 2026-11-15 digitado via onChange e salvo sem blur", () => {
    render(wrap(<AtribuicoesPlanosTab />));
    fireEvent.click(screen.getAllByRole("button", { name: /editar atribuição/i })[0]);
    const end = screen.getByLabelText("Vigência final") as HTMLInputElement;
    fireEvent.change(end, { target: { value: "2026-11-15" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));
    expect(saveMutate).toHaveBeenCalledTimes(1);
    expect(saveMutate.mock.calls[0][0]).toMatchObject({ id: "assign-draft", valid_until: "2026-11-15", valid_from: "2026-11-11" });
  });

  it("envia data preenchida só no DOM (autofill sem evento React)", () => {
    render(wrap(<AtribuicoesPlanosTab />));
    fireEvent.click(screen.getAllByRole("button", { name: /editar atribuição/i })[0]);
    setDomOnly(screen.getByLabelText("Vigência final") as HTMLInputElement, "2026-11-15");
    fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));
    expect(saveMutate.mock.calls[0][0].valid_until).toBe("2026-11-15");
  });

  it("edição só é oferecida para rascunho", () => {
    state.assignments = [{ ...draft, id: "pub", status: "published" }];
    render(wrap(<AtribuicoesPlanosTab />));
    expect(screen.queryByRole("button", { name: /editar atribuição/i })).toBeNull();
  });

  it("recusa vigência final anterior à inicial sem chamar o servidor", () => {
    render(wrap(<AtribuicoesPlanosTab />));
    fireEvent.click(screen.getAllByRole("button", { name: /editar atribuição/i })[0]);
    fireEvent.change(screen.getByLabelText("Vigência final"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));
    expect(saveMutate).not.toHaveBeenCalled();
  });
});

describe("Fim da vigência do novo plano", () => {
  // validatePlan recusa fim de vigência no passado; fixa o relógio na data da fixture (2026-11-11) para não expirar.
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T12:00:00-03:00")); });
  afterEach(() => { vi.useRealTimers(); });
  function openNew() {
    render(wrap(<CommercialPaymentPlansPage />));
    fireEvent.click(screen.getByRole("button", { name: /novo plano/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Plano fictício" } });
    fireEvent.change(within(dialog).getByLabelText("Código"), { target: { value: "TESTE-REJEICAO-20261111" } });
    return dialog;
  }
  it("payload inclui valid_until digitado", () => {
    const d = openNew();
    fireEvent.change(within(d).getByLabelText("Fim da vigência"), { target: { value: "2026-11-15" } });
    fireEvent.click(within(d).getByRole("button", { name: /^salvar$/i }));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0].valid_until).toBe("2026-11-15");
  });
  it("payload inclui valid_until preenchido só no DOM", () => {
    const d = openNew();
    setDomOnly(within(d).getByLabelText("Fim da vigência") as HTMLInputElement, "2026-11-15");
    fireEvent.click(within(d).getByRole("button", { name: /^salvar$/i }));
    expect(createMutate.mock.calls[0][0].valid_until).toBe("2026-11-15");
  });
});

describe("Data civil", () => {
  it("rejeita datas inexistentes", () => {
    expect(isValidCivilDate("2026-11-15")).toBe(true);
    expect(isValidCivilDate("2026-02-30")).toBe(false);
    expect(isValidCivilDate("15/11/2026")).toBe(false);
  });
});
